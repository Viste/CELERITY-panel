'use strict';

const assert = require('assert');
const Module = require('module');
const { clientCompatibility } = require('../src/utils/clientCompatibility');

const rejected = [
    ['Potato/1.0 clash-verge', 'potato', '1.0.4'],
    ['Potato/1.0.3 Happ', 'potato', '1.0.4'],
    ['Orbita/0.3.0 (windows) clash-verge', 'orbita', '0.3.1'],
    ['clash.meta/v1.19.31', 'mihomo', '1.19.32'],
    ['ClashVergeRev/2.4.6 (mihomo/v1.19.31)', 'mihomo', '1.19.32'],
];
for (const [ua, client, minimumVersion] of rejected) {
    const decision = clientCompatibility(ua);
    assert.strictEqual(decision.allowed, false, ua);
    assert.strictEqual(decision.client, client);
    assert.strictEqual(decision.minimumVersion, minimumVersion);
}
const allowed = [
    'Potato/1.0.4 (Android) clash-verge', 'Potato/1.0.4 (iOS) Happ',
    'Orbita/0.3.1 (macos) clash-verge', 'Orbita/0.4.0 (windows) clash-verge',
    'clash.meta/1.19.32', 'mihomo/v1.19.33', 'mihomo/1.20.0',
    'ClashVergeRev/2.4.6', 'ClashMetaForAndroid/2.11.7.Meta',
    'Clash/1.0', 'Happ/1.0', 'Shadowrocket/1.0', 'sing-box/1.12.0',
    'Potato/unknown Happ', 'Orbita/dev clash-verge', 'clash.meta/alpha-88dcbf7',
    'Potato', 'mihomo', 'mihomo/garbage', 'Potato/9999999999999999999999.0.0', '', undefined,
];
for (const ua of allowed) assert.strictEqual(clientCompatibility(ua).allowed, true, String(ua));

const validUser = {
    _id: 'fixture-user', userId: 'fixture', username: 'fixture', enabled: true,
    subscriptionToken: 'fixture-token', appPasswordHash: 'fixture-hash',
    trafficLimit: 0, traffic: { tx: 0, rx: 0 }, groups: [], nodes: [], maxDevices: 0,
};
let user = validUser;
let cacheReads = 0;
let settingsReads = 0;
let loginUpdates = 0;
let cacheFormat;
const warnings = [];
const query = () => ({
    populate() { return this; }, select() { return this; },
    lean: async () => user,
    then: (resolve, reject) => Promise.resolve(user).then(resolve, reject),
});
const cached = {
    content: 'cached-profile', username: 'fixture', profileTitle: 'fixture',
    traffic: { tx: 0, rx: 0 }, trafficLimit: 0, expireAt: null,
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    const file = String(parent?.filename || '').replace(/\\/g, '/');
    if (/\/src\/routes\/(subscription|client)\.js$/.test(file)) {
        if (request === 'qrcode') return {};
        if (request === '../../config') return { BASE_URL: 'https://panel.example.com' };
        if (request === '../models/hyUserModel') return {
            findOne: query,
            updateOne: () => { loginUpdates++; return Promise.resolve({}); },
        };
        if (request === '../models/hyNodeModel') return {};
        if (request === '../utils/logger') return { debug() {}, info() {}, warn(value) { warnings.push(value); }, error() {} };
        if (request === '../utils/appPassword') return { verifyPassword: password => password === 'correct' };
        if (request === '../services/cryptoService') return {};
        if (request === '../utils/helpers') return {
            getSettings: async () => { settingsReads++; return { subscription: {} }; },
            getNodesByGroups: () => [], parseDurationSeconds: () => 0, normalizeHopInterval: x => x,
        };
        if (request === '../services/cacheService') return {
            getSubscription: async (_token, format) => { cacheReads++; cacheFormat = format; return cached; },
        };
        if (request === '../middleware/i18n') return { getDateLocale: () => 'en-US', normalizeLanguage: x => x || 'en' };
        if (request === '../services/uaStatsService') return { track() {} };
        if (request === '../utils/hwidHeaders') return { extractHwidHeaders: () => null };
        if (request === '../services/hwidDeviceService') return { resolveMode: () => 'off', effectiveDeviceLimit: () => 0 };
        if (request === '../services/webhookService') return { EVENTS: {}, emit() {} };
    }
    return originalLoad.call(this, request, parent, isMain);
};

function response() {
    return {
        statusCode: 200, headers: {}, locals: { lang: 'en' },
        status(value) { this.statusCode = value; return this; },
        set(value) { Object.assign(this.headers, value); return this; },
        type(value) { this.headers['content-type'] = value; return this; },
        json(value) { this.body = value; return this; },
        send(value) { this.body = value; return this; },
    };
}
const req = (ua, format) => ({
    headers: { 'user-agent': ua }, query: format ? { format } : {},
    protocol: 'https', get: () => 'panel.example.com', path: '/api/files/fixture-token',
    params: { token: 'fixture-token' },
});

(async () => {
    try {
        const subscription = require('../src/routes/subscription');
        const login = require('../src/routes/client').stack.find(x => x.route?.path === '/login')
            .route.stack.at(-1).handle;
        const ctx = { user: validUser, cacheToken: 'fixture-token', baseUrl: 'https://panel.example.com/api/files/fixture-token' };

        // A valid cached profile must never leak through to an old client,
        // including explicit formats and the early browser HTML branch.
        for (const format of [undefined, 'clash', 'potato', 'singbox', 'xray-json', 'uri']) {
            const res = response();
            await subscription.serveSubscription(req('Potato/1.0.3 clash-verge private-marker', format), res, ctx);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.code, 'client_upgrade_required');
            assert.ok(res.body.error.includes('1.0.4'));
            assert.strictEqual(res.headers['Cache-Control'], 'no-store');
            assert.strictEqual(cacheReads, 0);
        }
        const browser = req('Potato/1.0.3 Mozilla/5.0');
        browser.headers.accept = 'text/html';
        const browserRes = response();
        await subscription.serveSubscription(browser, browserRes, ctx);
        assert.strictEqual(browserRes.statusCode, 403);
        assert.strictEqual(settingsReads, 0, 'reject before HTML rendering, settings and cache');
        assert.strictEqual(loginUpdates, 0, 'reject before subscription-fetch telemetry writes');
        assert.ok(warnings.some(value => value === '[ClientCompatibility] Rejected potato 1.0.3; minimum 1.0.4'));
        assert.ok(warnings.every(value => !value.includes('private-marker') && !value.includes('fixture-token')),
            'upgrade logs contain only the parsed family/version/floor');

        for (const ua of ['Potato/1.0.4 (Android) clash-verge', 'ClashVergeRev/2.4.6', 'clash.meta/1.19.32', 'Happ/99.0', 'Shadowrocket/2.2.0', 'unknown', undefined]) {
            const res = response();
            await subscription.serveSubscription(req(ua, 'clash'), res, ctx);
            assert.strictEqual(res.statusCode, 200, String(ua));
            assert.strictEqual(res.body, 'cached-profile');
        }
        let res = response();
        await subscription.serveSubscription(req('Potato/1.0.4 (Android) clash-verge'), res, ctx);
        assert.strictEqual(cacheFormat, 'clash', 'keep the existing format detector');

        // The native files route still validates the account before the gate.
        const filesHandler = subscription.stack.find(x => x.route?.path === '/files/:token').route.stack.at(-1).handle;
        user = null;
        res = response();
        await filesHandler(req('Potato/1.0.3 clash-verge', 'clash'), res);
        assert.strictEqual(res.statusCode, 404);
        user = validUser;

        // Login refuses an old authenticated app without returning its token;
        // bad credentials must keep the normal authentication response.
        for (const [ua, password, expected] of [
            ['Potato/1.0.3', 'correct', 403], ['Potato/1.0.3', 'wrong', 401],
            ['Orbita/0.3.0', 'correct', 403], ['Orbita/0.3.1 (macos)', 'correct', 200],
            ['Potato/1.0.4 (Android) clash-verge', 'correct', 200], [undefined, 'correct', 200],
        ]) {
            res = response();
            await login({ headers: { 'user-agent': ua }, body: { username: 'fixture', password } }, res);
            assert.strictEqual(res.statusCode, expected, String(ua));
            if (expected === 403) {
                assert.strictEqual(res.body.code, 'client_upgrade_required');
                assert.strictEqual(res.body.subscription, undefined);
            }
            if (expected === 200) assert.strictEqual(res.body.subscription.token, 'fixture-token');
        }
        console.log('client compatibility tests passed');
    } finally {
        Module._load = originalLoad;
        delete require.cache[require.resolve('../src/routes/subscription')];
        delete require.cache[require.resolve('../src/routes/client')];
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
