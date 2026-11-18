const assert = require('assert');
process.env.PANEL_DOMAIN = process.env.PANEL_DOMAIN || 'test.local'; process.env.ACME_EMAIL = process.env.ACME_EMAIL || 't@t'; process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef'; process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'x';
const sub = require('../src/routes/subscription');
const user = { userId: 'alice', username: '', password: 'pw123456', xrayUuid: '11111111-2222-3333-4444-555555555555' };
const nodes = [
    { type: 'mieru', name: 'retired', ip: '192.0.2.1', port: 443 },
    { type: 'xray', name: 'LV-Nanna', flag: '🇱🇻', ip: '185.237.219.54', domain: 'nanna.dev-vlab.ru', port: 443, active: true, status: 'online',
      xray: { transport: 'xhttp', security: 'reality', fingerprint: 'firefox', xhttpPath: '/p', xhttpMode: 'stream-one', realitySni: ['www.example.org'], realityPublicKey: 'k', realityShortIds: ['', 'ab'], extraInbounds: [] } },
];
const out = sub._generatePotatoJSON(user, nodes, null);
assert.strictEqual(out.version, 1);
assert.ok(Array.isArray(out.xray) && Array.isArray(out.mieru));
assert.deepStrictEqual(out.mieru, [], 'older clients expect an empty array');
assert.strictEqual(out.xray.length, 1, 'one xray profile');
assert.ok(JSON.stringify(out.xray[0]).includes('nanna.dev-vlab.ru'));
assert.ok(!JSON.stringify(out.xray).includes('retired'));
console.log('potato format tests passed');
setTimeout(() => process.exit(0), 50);
