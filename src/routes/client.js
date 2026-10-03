/**
 * Mobile client API (no admin auth): username + app password → subscription.
 * Mounted under /api/client behind authLimiter.
 */
const express = require('express');
const router = express.Router();
const HyUser = require('../models/hyUserModel');
const config = require('../../config');
const logger = require('../utils/logger');
const { verifyPassword } = require('../utils/appPassword');

const USER_RE = /^[A-Za-z0-9._@-]{1,64}$/;

router.post('/login', express.json({ limit: '4kb' }), async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!USER_RE.test(username) || !password || password.length > 128) {
        return res.status(400).json({ success: false, error: 'invalid credentials' });
    }
    try {
        const user = await HyUser.findOne({ userId: username })
            .select('+appPasswordHash userId username enabled expireAt trafficLimit traffic subscriptionToken')
            .lean();
        const ok = !!(user && user.appPasswordHash && verifyPassword(password, user.appPasswordHash));
        if (!ok) {
            logger.warn(`[Client] Login failed for "${username}" from ${req.ip}`);
            return res.status(401).json({ success: false, error: 'invalid credentials' });
        }
        if (!user.enabled) {
            return res.status(403).json({ success: false, error: 'account disabled' });
        }
        if (user.expireAt && new Date(user.expireAt) < new Date()) {
            return res.status(403).json({ success: false, error: 'subscription expired' });
        }
        const base = String(config.BASE_URL || '').replace(/\/+$/, '');
        logger.info(`[Client] Login ok for ${user.userId} from ${req.ip}`);
        return res.json({
            success: true,
            subscription: { token: user.subscriptionToken, url: `${base}/api/files/${user.subscriptionToken}` },
            user: {
                userId: user.userId,
                username: user.username || user.userId,
                expireAt: user.expireAt,
                trafficLimit: user.trafficLimit || 0,
                traffic: { tx: user.traffic?.tx || 0, rx: user.traffic?.rx || 0 },
            },
        });
    } catch (err) {
        logger.error(`[Client] Login error: ${err.message}`);
        return res.status(500).json({ success: false, error: 'server error' });
    }
});

module.exports = router;
