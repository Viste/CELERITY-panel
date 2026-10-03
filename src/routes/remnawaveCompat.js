/**
 * Remnawave legacy subscription-URL compatibility layer.
 *
 * Remnawave hands out links of the form
 *
 *     https://host/<short_uuid>[/<client>]
 *
 * where <short_uuid> is 16 URL-safe characters. After the import those tokens
 * live in HyUser.legacyTokens, so the same URL keeps working once the host
 * points at Celerity. This middleware:
 *
 *   1. Matches the URL shape (and, when configured, the hostname).
 *   2. Looks the user up by legacyTokens / subscriptionToken.
 *   3. Hands control to the regular subscription pipeline.
 *
 * Inert while settings.migration.remnawave.enabled is false. Mounted last in
 * index.js, so a real route always wins over the compat regex.
 */

const HyUser = require('../models/hyUserModel');
const Settings = require('../models/settingsModel');
const logger = require('../utils/logger');
const { subscriptionLimiter } = require('../utils/rateLimiters');
const subscriptionModule = require('./subscription');

const { matchPath: matchLegacyPath, CLIENT_TO_FORMAT } = require('../utils/remnawaveToken');

const POPULATE_NODES = 'active name type status onlineUsers maxOnlineUsers rankingCoefficient domain sni ip port portRange hopInterval portConfigs obfs flag xray cascadeRole groups virtual cdn';
const POPULATE_GROUPS = '_id name subscriptionTitle maxDevices';

let _loaded = false;
let _enabled = false;
let _hosts = new Set();
let _loadingPromise = null;

async function _load() {
    _loaded = true;
    _enabled = false;
    _hosts = new Set();
    let settings;
    try {
        settings = await Settings.get();
    } catch (err) {
        logger.error(`[RemnawaveCompat] Failed to load settings: ${err.message}`);
        return;
    }
    const cfg = settings?.migration?.remnawave;
    if (!cfg || !cfg.enabled) return;
    _hosts = new Set((cfg.hosts || []).map(h => String(h || '').trim().toLowerCase()).filter(Boolean));
    _enabled = true;
    logger.info(`[RemnawaveCompat] Armed (hosts=${_hosts.size ? [..._hosts].join(',') : 'any'})`);
}

function invalidate() {
    _loaded = false;
    _loadingPromise = null;
}

function matchPath(path, hostname, hosts = _hosts) {
    return matchLegacyPath(path, hostname, hosts);
}

async function _handle(req, res, next) {
    if (!_loaded) {
        if (!_loadingPromise) _loadingPromise = _load().finally(() => { _loadingPromise = null; });
        await _loadingPromise;
    }
    if (!_enabled) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const matched = matchPath(req.path, req.hostname);
    if (!matched) return next();
    const { token, client } = matched;

    let user;
    try {
        user = await HyUser
            .findOne({ $or: [{ legacyTokens: token }, { subscriptionToken: token }] })
            .populate('nodes', POPULATE_NODES)
            .populate('groups', POPULATE_GROUPS);
    } catch (err) {
        logger.error(`[RemnawaveCompat] Lookup failed: ${err.message}`);
        return res.status(500).type('text/plain').send('# Error');
    }
    if (!user) return next();

    if (client && CLIENT_TO_FORMAT[client]) {
        req.query = { ...req.query, format: CLIENT_TO_FORMAT[client] };
    }

    // Cache under the native token so legacy and native URLs share one entry
    // and every existing invalidation path keeps working.
    const cacheToken = user.subscriptionToken || token;
    const baseUrl = `${req.protocol}://${req.get('host')}/${token}`;

    const validation = subscriptionModule.validateUser(user);
    if (!validation.valid) {
        return subscriptionModule.rejectOrSoftBlock(req, res, user, validation, { cacheToken, baseUrl });
    }
    if (client === 'info') {
        return subscriptionModule.serveInfo(req, res, user);
    }

    return subscriptionLimiter(req, res, (err) => {
        if (err) return next(err);
        return subscriptionModule
            .serveSubscription(req, res, { user, cacheToken, baseUrl })
            .catch(innerErr => {
                logger.error(`[RemnawaveCompat] serveSubscription failed: ${innerErr.message}`);
                if (!res.headersSent) res.status(500).type('text/plain').send('# Error');
            });
    });
}

module.exports = _handle;
module.exports.invalidate = invalidate;
module.exports.matchPath = matchPath;
module.exports.CLIENT_TO_FORMAT = CLIENT_TO_FORMAT;
