'use strict';

const assert = require('assert');

process.env.PANEL_DOMAIN = process.env.PANEL_DOMAIN || 'panel.example.com';
process.env.ACME_EMAIL = process.env.ACME_EMAIL || 'admin@example.com';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-32-characters-long';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-32-characters-long';

const { detectClient, detectClientKey, isOwnApp, CLIENT_NAMES } = require('../src/utils/subClient');

// --- client detection -------------------------------------------------------
assert.strictEqual(detectClient('Potato/1.0 Happ'), 'potato');
assert.strictEqual(detectClient('Potato/1.0 clash-verge'), 'potato');
assert.strictEqual(detectClient('Happ/3.2.1'), 'happ');
assert.strictEqual(detectClient('clash-verge/v2.4.2'), 'clash');
assert.strictEqual(detectClient('HiddifyNext/2.0 ClashMeta'), 'hiddify');
assert.strictEqual(detectClient('Shadowrocket/2070 CFNetwork'), 'shadowrocket');
assert.strictEqual(detectClient(''), 'other');
assert.strictEqual(detectClient(undefined), 'other');
assert.ok(CLIENT_NAMES.includes('potato') && CLIENT_NAMES.includes('other'));
assert.strictEqual(CLIENT_NAMES.indexOf('potato'), 0, 'potato must be matched before happ and clash');

assert.strictEqual(detectClientKey('Potato/1.0 Happ'), 'potato-ios');
assert.strictEqual(detectClientKey('Potato/1.0.2 clash-verge'), 'potato-android');
assert.strictEqual(detectClientKey('Potato/2.0'), 'potato');
assert.strictEqual(detectClientKey('Happ/3.2.1'), 'happ');

// Orbita, the desktop app, asks for the Clash format too and must not be counted as Clash
assert.strictEqual(detectClient('Orbita/0.2.0 clash-verge'), 'orbita');
assert.strictEqual(detectClient('Orbita/0.2.1 (windows) clash-verge'), 'orbita');
assert.ok(CLIENT_NAMES.indexOf('orbita') < CLIENT_NAMES.indexOf('clash'), 'orbita must be matched before clash');
assert.strictEqual(detectClientKey('Orbita/0.2.1 (macos) clash-verge'), 'orbita-mac');
assert.strictEqual(detectClientKey('Orbita/0.2.1 (windows) clash-verge'), 'orbita-windows');
assert.strictEqual(detectClientKey('Orbita/0.2.0 clash-verge'), 'orbita', 'builds before 0.2.1 do not name the system');
for (const key of ['potato', 'potato-ios', 'potato-android', 'orbita', 'orbita-mac', 'orbita-windows']) {
    assert.ok(isOwnApp(key), key);
}
for (const key of ['clash', 'happ', 'other', 'potatoes', '', undefined]) {
    assert.ok(!isOwnApp(key), String(key));
}
assert.strictEqual(detectClientKey('Mozilla/5.0'), 'other');
// a key is used as a mongo field name: no dots or dollars
for (const ua of ['Potato/1.0 Happ', 'clash.meta', '$weird', '']) assert.ok(/^[a-z-]+$/.test(detectClientKey(ua)));

// --- overview composition ------------------------------------------------------
const { buildOverview, userClients } = require('../src/services/userStatsService');
const now = new Date('2026-10-04T12:30:00Z');
const minutesAgo = m => new Date(now.getTime() - m * 60000);
const nodes = [
    { _id: 'n1', name: 'LV-Nanna', type: 'xray', flag: 'LV' },
    { _id: 'n2', name: 'LV-Loki', type: 'xray', flag: 'LT' },
];
const users = [
    { userId: 'viste', username: 'viste', enabled: true, traffic: { tx: 10, rx: 20 }, subClients: { 'potato-ios': minutesAgo(30), clash: minutesAgo(60 * 24 * 40) }, appPasswordSetAt: minutesAgo(600), appLastLoginAt: minutesAgo(500) },
    { userId: 'Uncle', username: '@uncle', enabled: true, lastSubFetchAt: minutesAgo(90), lastSubUserAgent: 'Potato/1.0 clash-verge' },
    { userId: 'idle', username: 'idle', enabled: false },
];
const overview = buildOverview({
    users,
    nodes,
    hourly: [
        { userId: 'viste', node: 'n1', tx: 100, rx: 900, lastSeen: minutesAgo(3), lastDelta: 5 * 1024 * 1024 },
        { userId: 'Uncle', node: 'n1', tx: 5, rx: 50, lastSeen: minutesAgo(40) },
        { userId: 'viste', node: 'gone', tx: 1, rx: 1, lastSeen: minutesAgo(1) },
        { userId: 'viste', node: 'n2', tx: 7, rx: 70, lastSeen: minutesAgo(200) },
        { userId: 'Uncle', node: 'n2', tx: 1, rx: 2, lastSeen: minutesAgo(2) },
    ],
    period: '24h',
    now,
});
assert.strictEqual(overview.period, '24h');
assert.deepStrictEqual(overview.nodes.map(n => n.id), ['n1', 'n2']);
assert.deepStrictEqual(overview.users.map(u => u.userId), ['viste', 'Uncle', 'idle'], 'online first, then by traffic');
const [viste, uncle, idle] = overview.users;
assert.deepStrictEqual(viste.online, [{ node: 'n1', delta: 5 * 1024 * 1024, background: false }]);
assert.deepStrictEqual(viste.traffic, { tx: 107, rx: 970 });
assert.deepStrictEqual(viste.byNode.n2, { tx: 7, rx: 70, lastSeen: minutesAgo(200) });
assert.strictEqual(viste.byNode.gone, undefined, 'inactive nodes are left out');
assert.deepStrictEqual(viste.clients.map(c => c.key), ['potato-ios', 'clash']);
assert.strictEqual(viste.hasAppPassword, true);
assert.strictEqual(viste.appAt.getTime(), minutesAgo(30).getTime(), 'the later of login and own-app fetch');
assert.strictEqual(viste.appKey, 'potato-ios');
assert.strictEqual(uncle.appAt.getTime(), minutesAgo(90).getTime(), 'an own-app fetch counts without a recorded login');
assert.strictEqual(uncle.appKey, 'potato-android');
assert.strictEqual(idle.appAt, null);
assert.strictEqual(idle.appKey, null);
assert.deepStrictEqual(uncle.online, [{ node: 'n2', delta: null, background: false }], 'older buckets can have no lastDelta');
assert.deepStrictEqual(uncle.clients.map(c => c.key), ['potato-android'], 'falls back to the last user agent');
assert.strictEqual(idle.enabled, false);
assert.deepStrictEqual(idle.clients, []);
assert.deepStrictEqual(overview.summary.clients, { 'potato-ios': 1, 'potato-android': 1 }, 'a client older than 30 days is not counted');
assert.deepStrictEqual(overview.summary.onlineByNode, { n1: ['viste'], n2: ['Uncle'] });
assert.strictEqual(overview.summary.online, 2);
assert.strictEqual(overview.summary.connections, 2);
assert.strictEqual(overview.summary.activeConnections, 2);

// probes: a user with real traffic on one server and keep-alive checks on two more
// Orbita counts as an own app, and a login that is later than the last fetch names its app
const desktop = buildOverview({
    users: [
        { userId: 'mac', enabled: true, subClients: { 'orbita-mac': minutesAgo(10), 'potato-ios': minutesAgo(300) } },
        { userId: 'win', enabled: true, subClients: { 'potato-android': minutesAgo(50) }, appLastLoginAt: minutesAgo(5), appLastLoginClient: 'orbita-windows' },
        { userId: 'old', enabled: true, subClients: { 'potato-android': minutesAgo(50) }, appLastLoginAt: minutesAgo(5) },
    ],
    nodes,
    hourly: [],
    period: '24h',
    now,
});
const desktopUsers = Object.fromEntries(desktop.users.map(u => [u.userId, u]));
assert.strictEqual(desktopUsers.mac.appKey, 'orbita-mac');
assert.strictEqual(desktopUsers.mac.appAt.getTime(), minutesAgo(10).getTime());
assert.strictEqual(desktopUsers.win.appKey, 'orbita-windows');
assert.strictEqual(desktopUsers.win.appAt.getTime(), minutesAgo(5).getTime());
assert.strictEqual(desktopUsers.old.appKey, 'potato-android', 'a login recorded without its app keeps the app of the last fetch');
assert.deepStrictEqual(desktop.summary.clients, { 'orbita-mac': 1, 'potato-ios': 1, 'potato-android': 2 });

const probing = buildOverview({
    users: [{ userId: 'multi', username: 'multi', enabled: true }],
    nodes: [...nodes, { _id: 'n3', name: 'NL-Mimir', type: 'xray' }],
    hourly: [
        { userId: 'multi', node: 'n3', tx: 10, rx: 10, lastSeen: minutesAgo(2), lastDelta: 30 * 1024 },
        { userId: 'multi', node: 'n1', tx: 10, rx: 10, lastSeen: minutesAgo(2), lastDelta: 40 * 1024 * 1024 },
        { userId: 'multi', node: 'n2', tx: 10, rx: 10, lastSeen: minutesAgo(2) },
    ],
    period: '1h', now,
});
assert.deepStrictEqual(probing.users[0].online.map(o => [o.node, o.background]), [['n2', false], ['n1', false], ['n3', true]], 'real use first, background last');
assert.strictEqual(probing.summary.online, 1);
assert.strictEqual(probing.summary.connections, 3);
assert.strictEqual(probing.summary.activeConnections, 2);
assert.strictEqual(overview.summary.withClient, 2);
assert.strictEqual(overview.summary.users, 3);

assert.strictEqual(buildOverview({ users: [], nodes: [], hourly: [], period: 'bogus', now }).period, '24h');
assert.deepStrictEqual(userClients({}), []);

console.log('user stats tests passed');
process.exit(0);
