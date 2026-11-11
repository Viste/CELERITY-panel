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
    ['Happ/4.5.1', 'happ', '4.5.2', 'unknown'],
    ['Happ/2.6.0 (unknown-platform)', 'happ', '4.5.2', 'unknown'],
    ['Happ/4.5.1 (Windows NT 10.0)', 'happ', '4.5.2', 'desktop'],
    ['Happ/4.5.1 (Linux x86_64)', 'happ', '4.5.2', 'desktop'],
    ['Happ/4.5.1 (macOS)', 'happ', '4.5.2', 'desktop'],
    ['Happ/4.7.0 (Linux; Android 15)', 'happ', '4.7.1', 'android'],
    ['Happ/6.0.9 (iPhone; CPU iPhone OS like Mac OS X)', 'happ', '6.1.0', 'ios'],
    ['Happ/6.0.9 (iPad)', 'happ', '6.1.0', 'ios'],
    ['Happ/v6.0.9 (iOS)', 'happ', '6.1.0', 'ios'],
    ['Happ/4.5.1 (Android; iOS)', 'happ', '4.5.2', 'unknown'],
    ['Happ/4.12.0/ios/private-device-marker', 'happ', '6.1.0', 'ios'],
    ['Happ/4.11.0/ios/private-device-marker', 'happ', '6.1.0', 'ios'],
    ['Happ/2.6.0/windows/private-device-marker', 'happ', '4.5.2', 'desktop'],
    ['Happ/2.6.0/linux/private-device-marker', 'happ', '4.5.2', 'desktop'],
    ['Happ/4.4.1/android/private-device-marker', 'happ', '4.7.1', 'android'],
    ['Happ/4.7.0/android/ios-device', 'happ', '4.7.1', 'android'],
    ['Happ/6.0.0/ios/android-device', 'happ', '6.1.0', 'ios'],
    ['Happ/6.0.0/ipados/windows-device', 'happ', '6.1.0', 'ios'],
    ['Potato/1.0.3/ios/private-device-marker Happ/1.0', 'potato', '1.0.4'],
    ['Orbita/0.3.0/windows/private-device-marker', 'orbita', '0.3.1'],
    ['v2rayN/7.25.0/windows/private-device-marker', 'v2rayn', '7.25.1'],
    ['v2rayNG/2.3.7/android/private-device-marker', 'v2rayng', '2.3.8'],
    ['Shadowrocket/2.2.83/ios/private-device-marker', 'shadowrocket', '2.2.84'],
    ['mihomo/1.19.31/macos/private-device-marker', 'mihomo', '1.19.32'],
    ['v2rayN/7.25.0', 'v2rayn', '7.25.1'],
    ['v2rayNG/2.3.7', 'v2rayng', '2.3.8'],
    ['Shadowrocket/2.2.83 (iPhone)', 'shadowrocket', '2.2.84'],
    ['Shadowrocket/1.0', 'shadowrocket', '2.2.84'],
    ['Potato/1.0.4 Happ/4.0.0 (mihomo/v1.19.31)', 'mihomo', '1.19.32'],
    ['Happ/1.0 (clash.meta/1.19.31)', 'mihomo', '1.19.32'],
];
for (const [ua, client, minimumVersion, platform] of rejected) {
    const decision = clientCompatibility(ua);
    assert.strictEqual(decision.allowed, false, ua);
    assert.strictEqual(decision.client, client);
    assert.strictEqual(decision.minimumVersion, minimumVersion);
    assert.strictEqual(decision.platform, platform);
    assert.ok(decision.clientName, 'provide a human-readable family name');
    assert.ok(!JSON.stringify(decision).includes('private-device-marker'), 'device ID stays out of the decision');
}
const allowed = [
    'Potato/1.0.4 (Android) clash-verge', 'Potato/1.0.4 (iOS) Happ',
    'Orbita/0.3.1 (macos) clash-verge', 'Orbita/0.4.0 (windows) clash-verge',
    'clash.meta/1.19.32', 'mihomo/v1.19.33', 'mihomo/1.20.0',
    'ClashVergeRev/2.4.6', 'ClashMetaForAndroid/2.11.7.Meta',
    'Clash/1.0', 'Happ/1.0', 'Happ/1.0 (Android)', 'Happ/1.0 (iPhone)', 'sing-box/1.12.0',
    'Happ/4.5.2', 'Happ/4.8.0', 'Happ/4.5.2 (Windows)', 'Happ/4.5.2 (Linux)',
    'Happ/4.5.2 (Mac OS X)', 'Happ/4.7.1 (Linux; Android)', 'HAPP/4.7.1 (ANDROID)',
    'Happ/6.1.0 (iOS)', 'Happ/6.1.0 (iPhone)', 'Happ/6.1.0 (iPad; Mac OS X)',
    'Happ/4.5.2 (Android; iOS)', 'Happ/6.2.0',
    'Happ/4.8.0/android/private-device-marker', 'Happ/6.2.0/ios/private-device-marker',
    'Happ/4.5.2/windows/iphone-device', 'Happ/4.5.2/linux/android-device',
    'Happ/4.5.2/macos/ipados-device', 'Happ/4.5.2/unknown/ios-device',
    'Happ/4.5.2//ios-device',
    'Happ/1.0/ios/private-device-marker', 'Happ/dev/ios/private-device-marker',
    'Happ//ios/private-device-marker', 'Happ/4.7.0-?/android/private-device-marker',
    'Potato/1.0.4/ios/private-device-marker Happ/4.0.0',
    'clash.meta/1.19.32/macos/private-device-marker',
    'v2rayN/7.25.1', 'v2rayN/v7.25.1', 'v2rayNG/2.3.8', 'V2RAYNG/2.3.8',
    'Shadowrocket/2.2.84 (iPhone)', 'Shadowrocket/2.2.93',
    'Potato/1.0.4 (iOS) Happ/4.0.0', 'Potato/unknown Happ/4.0.0',
    'Orbita/0.3.1 (macos) Happ/1.0.1',
    'Happ', 'Happ/', 'Happ/dev', 'Happ/4.7.0-?', 'Happ/9999999999999999999999.0.0',
    'v2rayN', 'v2rayNG', 'v2ray', 'v2ray/1.0', 'v2rayN/dev', 'v2rayNG/not-a-version',
    'notHapp/1.0.1', 'notv2rayN/1.0', 'v2rayNG-Pro/1.0', 'unknown/1.0',
    'Shadowrocket', 'Shadowrocket/dev', 'singbox/1.0', 'sing-box-lx/1.0',
    'Potato/unknown Happ', 'Orbita/dev clash-verge', 'clash.meta/alpha-88dcbf7',
    'Potato', 'mihomo', 'mihomo/garbage', 'Potato/9999999999999999999999.0.0', '', undefined,
];
for (const ua of allowed) assert.strictEqual(clientCompatibility(ua).allowed, true, String(ua));

// x-device-os supplies platform evidence when the UA has none. Conflicting
// declarations use the common floor, never a guess from the version number.
for (const [ua, hint, allowed, minimum, platform] of [
    ['Happ/6.0.0', 'ios', false, '6.1.0', 'ios'],
    ['Happ/6.0.0', 'iPadOS', false, '6.1.0', 'ios'],
    ['Happ/6.1.0', 'iOS', true],
    ['Happ/4.7.0', 'android', false, '4.7.1', 'android'],
    ['Happ/4.7.1', 'Android', true],
    ['Happ/4.8.0', 'Android', true],
    ['Happ/4.5.1', 'Windows', false, '4.5.2', 'desktop'],
    ['Happ/4.5.1', 'Linux', false, '4.5.2', 'desktop'],
    ['Happ/4.5.1', 'macOS', false, '4.5.2', 'desktop'],
    ['Happ/4.5.2', 'Windows', true],
    ['Happ/4.5.2', 'Linux', true],
    ['Happ/4.5.2', 'macOS', true],
    ['Happ/4.5.1', 'unknown', false, '4.5.2', 'unknown'],
    ['Happ/4.5.2', 'unknown', true],
    ['Happ/4.5.2', undefined, true],
    ['Happ/4.5.2', '', true],
    ['Happ/6.0.0 (iPhone)', 'unknown', false, '6.1.0', 'ios'],
    ['Happ/4.7.0 (Android)', 'iOS', true],
    ['Happ/4.5.2 (Windows)', 'Android', true],
    ['Happ/4.5.2', 'Android iOS', true],
    ['Happ/4.7.0/android/ios-device', 'Android', false, '4.7.1', 'android'],
    ['Happ/4.7.0/android/ios-device', 'iOS', true],
    ['Happ/4.5.2/windows/iphone-device', 'Windows', true],
    ['Happ/4.5.2/unknown/ios-device', 'iOS', false, '6.1.0', 'ios'],
    ['Happ/4.5.2//ios-device', 'Android', false, '4.7.1', 'android'],
    ['Happ/1.0', 'iOS', true],
    ['Happ/unknown', 'iOS', true],
    ['Potato/1.0.4 Happ/4.0.0', 'iOS', true],
    ['Orbita/0.3.1 Happ/4.0.0', 'Android', true],
    ['Potato/1.0.4 Happ (mihomo/1.19.31)', 'iOS', false, '1.19.32', undefined],
]) {
    const decision = clientCompatibility(ua, hint);
    assert.strictEqual(decision.allowed, allowed, `${ua}; platform hint ${hint}`);
    if (!allowed) {
        assert.strictEqual(decision.minimumVersion, minimum);
        assert.strictEqual(decision.platform, platform);
    }
}

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
const req = (ua, format, platformHint) => ({
    headers: { 'user-agent': ua, 'x-device-os': platformHint }, query: format ? { format } : {},
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
            for (const [ua, minimum, name, platformHint] of [
                ['Potato/1.0.3 clash-verge private-marker', '1.0.4', 'Potato'],
                ['Happ/4.7.0 (Android) private-marker', '4.7.1', 'Happ (Android)'],
                ['Happ/6.0.0 (iPhone) private-marker', '6.1.0', 'Happ (iOS)'],
                ['Happ/4.5.1 (Windows) private-marker', '4.5.2', 'Happ (desktop)'],
                ['Happ/6.0.0 private-marker', '6.1.0', 'Happ (iOS)', 'iOS private-platform-marker'],
                ['Happ/4.12.0/ios/private-device-marker', '6.1.0', 'Happ (iOS)'],
                ['Happ/4.11.0/ios/private-device-marker', '6.1.0', 'Happ (iOS)'],
                ['Happ/2.6.0/windows/private-device-marker', '4.5.2', 'Happ (desktop)'],
                ['Happ/2.6.0/linux/private-device-marker', '4.5.2', 'Happ (desktop)'],
                ['Happ/4.4.1/android/private-device-marker', '4.7.1', 'Happ (Android)'],
                ['Happ/4.7.0/android/ios-device', '4.7.1', 'Happ (Android)'],
                ['v2rayN/7.25.0 private-marker', '7.25.1', 'v2rayN'],
                ['v2rayNG/2.3.7 private-marker', '2.3.8', 'v2rayNG'],
                ['Shadowrocket/2.2.83 private-marker', '2.2.84', 'Shadowrocket'],
            ]) {
                const res = response();
                await subscription.serveSubscription(req(ua, format, platformHint), res, ctx);
                assert.strictEqual(res.statusCode, 403, ua);
                assert.strictEqual(res.body.code, 'client_upgrade_required');
                assert.ok(res.body.error.includes(minimum));
                assert.ok(res.body.error.includes(name));
                assert.strictEqual(res.headers['Cache-Control'], 'no-store');
                assert.strictEqual(res.headers.Vary, 'User-Agent, X-Device-OS');
                assert.strictEqual(cacheReads, 0);
            }
        }
        const browser = req('Potato/1.0.3 Mozilla/5.0');
        browser.headers.accept = 'text/html';
        const browserRes = response();
        await subscription.serveSubscription(browser, browserRes, ctx);
        assert.strictEqual(browserRes.statusCode, 403);
        assert.strictEqual(settingsReads, 0, 'reject before HTML rendering, settings and cache');
        assert.strictEqual(loginUpdates, 0, 'reject before subscription-fetch telemetry writes');
        assert.ok(warnings.some(value => value === '[ClientCompatibility] Rejected potato 1.0.3; minimum 1.0.4'));
        assert.ok(warnings.every(value => !value.includes('private-marker') && !value.includes('private-platform-marker') && !value.includes('private-device-marker') && !value.includes('ios-device') && !value.includes('fixture-token')),
            'upgrade logs contain only the parsed family/version/floor');

        for (const ua of ['Potato/1.0.4 (Android) clash-verge', 'ClashVergeRev/2.4.6', 'clash.meta/1.19.32', 'Happ/99.0', 'Happ/4.7.1 (Android)', 'Happ/6.1.0 (iOS)', 'Happ/1.0', 'v2rayN/7.25.1', 'v2rayNG/2.3.8', 'Shadowrocket/2.2.84', 'unknown', undefined]) {
            const res = response();
            await subscription.serveSubscription(req(ua, 'clash'), res, ctx);
            assert.strictEqual(res.statusCode, 200, String(ua));
            assert.strictEqual(res.body, 'cached-profile');
        }
        let res = response();
        await subscription.serveSubscription(req('Potato/1.0.4 (Android) clash-verge'), res, ctx);
        assert.strictEqual(cacheFormat, 'clash', 'keep the existing format detector');
        res = response();
        await subscription.serveSubscription(req('Happ/4.8.0', 'clash', 'Android'), res, ctx);
        assert.strictEqual(res.statusCode, 200, 'current Android Happ can read its cached profile');
        assert.strictEqual(res.body, 'cached-profile');
        for (const ua of ['Happ/4.8.0/android/private-device-marker', 'Happ/6.2.0/ios/private-device-marker', 'Happ/1.0/ios/private-device-marker', 'Happ/4.5.2/windows/iphone-device']) {
            res = response();
            await subscription.serveSubscription(req(ua, 'clash'), res, ctx);
            assert.strictEqual(res.statusCode, 200, ua);
            assert.strictEqual(res.body, 'cached-profile');
        }

        // The native files route still validates the account before the gate.
        const filesHandler = subscription.stack.find(x => x.route?.path === '/files/:token').route.stack.at(-1).handle;
        user = null;
        res = response();
        await filesHandler(req('Potato/1.0.3 clash-verge', 'clash'), res);
        assert.strictEqual(res.statusCode, 404);
        user = validUser;

        // Login refuses an old authenticated app without returning its token;
        // bad credentials must keep the normal authentication response.
        for (const [ua, password, expected, platformHint] of [
            ['Potato/1.0.3', 'correct', 403], ['Potato/1.0.3', 'wrong', 401],
            ['Orbita/0.3.0', 'correct', 403], ['Orbita/0.3.1 (macos)', 'correct', 200],
            ['Potato/1.0.4 (Android) clash-verge', 'correct', 200], [undefined, 'correct', 200],
            ['Happ/6.0.0', 'correct', 403, 'iOS'], ['Happ/6.0.0', 'wrong', 401, 'iOS'],
            ['Happ/4.8.0', 'correct', 200, 'Android'],
            ['Potato/1.0.4 Happ/4.0.0', 'correct', 200, 'iOS'],
        ]) {
            res = response();
            await login({ headers: { 'user-agent': ua, 'x-device-os': platformHint }, body: { username: 'fixture', password } }, res);
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
