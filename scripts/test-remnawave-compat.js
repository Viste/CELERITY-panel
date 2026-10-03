/**
 * Remnawave compat route: URL matcher and client→format mapping.
 */
const assert = require('assert');
const { matchPath, CLIENT_TO_FORMAT } = require('../src/utils/remnawaveToken');

const any = new Set();
// 16 URL-safe chars, with and without a client suffix
assert.deepStrictEqual(matchPath('/ooXaN4Yt2jAv8brG', 'sub.example.com', any), { token: 'ooXaN4Yt2jAv8brG', client: '' });
assert.deepStrictEqual(matchPath('/ooXaN4Yt2jAv8brG/', 'sub.example.com', any), { token: 'ooXaN4Yt2jAv8brG', client: '' });
assert.deepStrictEqual(matchPath('/a-b_c-d_e-f_g-h_/json', 'x', any), { token: 'a-b_c-d_e-f_g-h_', client: 'json' });
assert.deepStrictEqual(matchPath('/ooXaN4Yt2jAv8brG/mihomo', 'x', any), { token: 'ooXaN4Yt2jAv8brG', client: 'mihomo' });
assert.deepStrictEqual(matchPath('/ooXaN4Yt2jAv8brG/info', 'x', any), { token: 'ooXaN4Yt2jAv8brG', client: 'info' });
// wrong length / charset / unknown client / nested path
assert.strictEqual(matchPath('/ooXaN4Yt2jAv8br', 'x', any), null);
assert.strictEqual(matchPath('/ooXaN4Yt2jAv8brGX', 'x', any), null);
assert.strictEqual(matchPath('/ooXaN4Yt2jAv8b.G', 'x', any), null);
assert.strictEqual(matchPath('/ooXaN4Yt2jAv8brG/outline', 'x', any), null);
assert.strictEqual(matchPath('/api/ooXaN4Yt2jAv8brG', 'x', any), null);
assert.strictEqual(matchPath('/panel/0123456789abcdef', 'x', any), null);
// real first-class routes are shorter/longer than 16 chars; sanity:
for (const p of ['/api', '/panel', '/health', '/favicon.ico']) assert.strictEqual(matchPath(p, 'x', any), null);
// host guard
const hosts = new Set(['sub.example.com']);
assert.ok(matchPath('/ooXaN4Yt2jAv8brG', 'sub.example.com', hosts));
assert.ok(matchPath('/ooXaN4Yt2jAv8brG', 'SUB.example.com', hosts));
assert.strictEqual(matchPath('/ooXaN4Yt2jAv8brG', 'other.example.com', hosts), null);
// format mapping
assert.strictEqual(CLIENT_TO_FORMAT.mihomo, 'clash');
assert.strictEqual(CLIENT_TO_FORMAT.json, 'v2ray-json');
assert.strictEqual(CLIENT_TO_FORMAT['sing-box'], 'singbox');
console.log('test-remnawave-compat: OK');
