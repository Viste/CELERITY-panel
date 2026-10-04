'use strict';

const assert = require('assert');

process.env.PANEL_DOMAIN = process.env.PANEL_DOMAIN || 'panel.example.com';
process.env.ACME_EMAIL = process.env.ACME_EMAIL || 'admin@example.com';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-32-characters-long';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-32-characters-long';

const { detectClient, detectClientKey, CLIENT_NAMES } = require('../src/utils/subClient');
const { parseSize, parseMitaUsers } = require('../src/utils/mitaUsers');

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
assert.strictEqual(detectClientKey('Mozilla/5.0'), 'other');
// a key is used as a mongo field name: no dots or dollars
for (const ua of ['Potato/1.0 Happ', 'clash.meta', '$weird', '']) assert.ok(/^[a-z-]+$/.test(detectClientKey(ua)));

// --- mita get users ----------------------------------------------------------
assert.strictEqual(parseSize('0B'), 0);
assert.strictEqual(parseSize('12B'), 12);
assert.strictEqual(parseSize('1.5KiB'), 1536);
assert.strictEqual(parseSize('23.4MiB'), Math.round(23.4 * 1024 * 1024));
assert.strictEqual(parseSize('2.0GiB'), 2 * 1024 ** 3);
assert.strictEqual(parseSize('-'), 0);
assert.strictEqual(parseSize('garbage'), 0);

const table = [
    'User          LastActive                 1DayDown  1DayUp    7DaysDown  7DaysUp   30DaysDown  30DaysUp',
    '@uncle        -                          -         -         -          -         -           -       ',
    'viste         2026-10-04T12:20:11+03:00  1.5GiB    20.0MiB   3.0GiB     64.0MiB   9.5GiB      1.0GiB  ',
    'Inhumane      2026-06-13T15:39:28+03:00  0B        0B        0B         0B        0B          0B      ',
    'broken row',
].join('\n');
const rows = parseMitaUsers(table);
assert.strictEqual(rows.length, 3);
assert.deepStrictEqual(rows[0], { name: '@uncle', lastActive: null, windows: { d1: { tx: 0, rx: 0 }, d7: { tx: 0, rx: 0 }, d30: { tx: 0, rx: 0 } } });
assert.strictEqual(rows[1].name, 'viste');
assert.strictEqual(rows[1].lastActive.toISOString(), '2026-10-04T09:20:11.000Z');
assert.deepStrictEqual(rows[1].windows.d1, { tx: 20 * 1024 ** 2, rx: Math.round(1.5 * 1024 ** 3) });
assert.deepStrictEqual(rows[1].windows.d30, { tx: 1024 ** 3, rx: Math.round(9.5 * 1024 ** 3) });
assert.deepStrictEqual(parseMitaUsers(''), []);
assert.deepStrictEqual(parseMitaUsers('mita is not running'), []);

// --- overview composition ------------------------------------------------------
const { buildOverview, userClients } = require('../src/services/userStatsService');
const now = new Date('2026-10-04T12:30:00Z');
const minutesAgo = m => new Date(now.getTime() - m * 60000);
const nodes = [
    { _id: 'n1', name: 'LV-Nanna', type: 'xray', flag: 'LV' },
    { _id: 'n2', name: 'Loki-mieru', type: 'mieru', flag: 'LT' },
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
        { userId: 'viste', node: 'n1', tx: 100, rx: 900, lastSeen: minutesAgo(3) },
        { userId: 'Uncle', node: 'n1', tx: 5, rx: 50, lastSeen: minutesAgo(40) },
        { userId: 'viste', node: 'gone', tx: 1, rx: 1, lastSeen: minutesAgo(1) },
    ],
    rolling: [
        { userId: 'viste', node: 'n2', lastSeen: minutesAgo(200), windows: { d1: { tx: 7, rx: 70 }, d7: { tx: 8, rx: 80 }, d30: { tx: 9, rx: 90 } } },
        { userId: 'Uncle', node: 'n2', lastSeen: minutesAgo(2), windows: { d1: { tx: 1, rx: 2 }, d7: { tx: 3, rx: 4 }, d30: { tx: 5, rx: 6 } } },
    ],
    period: '24h',
    now,
});
assert.strictEqual(overview.period, '24h');
assert.deepStrictEqual(overview.nodes.map(n => n.id), ['n1', 'n2']);
assert.deepStrictEqual(overview.users.map(u => u.userId), ['viste', 'Uncle', 'idle'], 'online first, then by traffic');
const [viste, uncle, idle] = overview.users;
assert.deepStrictEqual(viste.online, ['n1']);
assert.deepStrictEqual(viste.traffic, { tx: 107, rx: 970 });
assert.deepStrictEqual(viste.byNode.n2, { tx: 7, rx: 70, lastSeen: minutesAgo(200) });
assert.strictEqual(viste.byNode.gone, undefined, 'inactive nodes are left out');
assert.deepStrictEqual(viste.clients.map(c => c.key), ['potato-ios', 'clash']);
assert.strictEqual(viste.hasAppPassword, true);
assert.strictEqual(viste.potatoAt.getTime(), minutesAgo(30).getTime(), 'the later of login and potato fetch');
assert.strictEqual(uncle.potatoAt.getTime(), minutesAgo(90).getTime(), 'a potato fetch counts without a recorded login');
assert.strictEqual(idle.potatoAt, null);
assert.deepStrictEqual(uncle.online, ['n2']);
assert.deepStrictEqual(uncle.clients.map(c => c.key), ['potato-android'], 'falls back to the last user agent');
assert.strictEqual(idle.enabled, false);
assert.deepStrictEqual(idle.clients, []);
assert.deepStrictEqual(overview.summary.clients, { 'potato-ios': 1, 'potato-android': 1 }, 'a client older than 30 days is not counted');
assert.deepStrictEqual(overview.summary.onlineByNode, { n1: ['viste'], n2: ['Uncle'] });
assert.strictEqual(overview.summary.online, 2);
assert.strictEqual(overview.summary.withClient, 2);
assert.strictEqual(overview.summary.users, 3);

const week = buildOverview({ users, nodes, hourly: [], rolling: [{ userId: 'viste', node: 'n2', lastSeen: minutesAgo(200), windows: { d1: { tx: 7, rx: 70 }, d7: { tx: 8, rx: 80 }, d30: { tx: 9, rx: 90 } } }], period: '7d', now });
assert.deepStrictEqual(week.users.find(u => u.userId === 'viste').traffic, { tx: 8, rx: 80 });
assert.strictEqual(buildOverview({ users: [], nodes: [], hourly: [], rolling: [], period: 'bogus', now }).period, '24h');
assert.deepStrictEqual(userClients({}), []);

console.log('user stats tests passed');
process.exit(0);
