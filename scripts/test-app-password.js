const assert = require('assert');
const { generatePassword, hashPassword, verifyPassword } = require('../src/utils/appPassword');
const pw = generatePassword();
assert.strictEqual(pw.length, 12);
assert.ok(/^[A-Za-z0-9]+$/.test(pw));
const h = hashPassword(pw);
assert.ok(h.startsWith('scrypt$16384$'));
assert.strictEqual(h.split('$').length, 4);
assert.ok(verifyPassword(pw, h));
assert.ok(!verifyPassword(pw + 'x', h));
assert.ok(!verifyPassword('', h));
assert.ok(!verifyPassword(pw, ''));
assert.ok(!verifyPassword(pw, 'plaintext'));
assert.ok(!verifyPassword(pw, 'scrypt$512$AAAA$BBBB'));
assert.notStrictEqual(hashPassword(pw), h, 'salted');
assert.throws(() => hashPassword('short'));
assert.throws(() => hashPassword('x'.repeat(129)));
// client route: module loads and exposes a router with /login
process.env.PANEL_DOMAIN = process.env.PANEL_DOMAIN || 'test.local'; process.env.ACME_EMAIL = process.env.ACME_EMAIL || 't@t'; process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef'; process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'x';
const router = require('../src/routes/client');
assert.ok(router.stack.some(l => l.route && l.route.path === '/login' && l.route.methods.post));
// admin routes: the panel pages address a user by userId, API clients by document id
(async () => {
    const totpServicePath = require.resolve('../src/services/totpService');
    require.cache[totpServicePath] = require.cache[totpServicePath] || { exports: {} };
    const HyUser = require('../src/models/hyUserModel');
    const usersRouter = require('../src/routes/users');
    const handlerOf = method => {
        const layer = usersRouter.stack.find(l => l.route && l.route.path === '/:id/app-password' && l.route.methods[method]);
        assert.ok(layer, `${method} /:id/app-password is registered`);
        return layer.route.stack[layer.route.stack.length - 1].handle;
    };
    const updates = [];
    const lookups = [];
    HyUser.findOne = q => ({ select: async () => { lookups.push(['findOne', q.userId]); return q.userId === 'Uncle' ? { _id: 'oid-uncle', userId: 'Uncle' } : null; } });
    HyUser.findById = id => ({ select: async () => { lookups.push(['findById', id]); return id === 'a'.repeat(24) ? { _id: id, userId: 'by-id' } : null; } });
    HyUser.updateOne = async (filter, update) => { updates.push([filter, update]); return { matchedCount: 1 }; };
    const call = async (method, id, body) => {
        const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
        await handlerOf(method)({ params: { id }, body }, res);
        return res;
    };

    let res = await call('post', 'Uncle', {});
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.userId, 'Uncle');
    assert.strictEqual(res.body.password.length, 12);
    assert.deepStrictEqual(updates[0][0], { _id: 'oid-uncle' });
    assert.ok(verifyPassword(res.body.password, updates[0][1].$set.appPasswordHash), 'the stored hash matches the returned password');
    assert.ok(updates[0][1].$set.appPasswordSetAt instanceof Date);

    res = await call('post', 'a'.repeat(24), { password: 'chosen-password' });
    assert.strictEqual(res.body.userId, 'by-id');
    assert.strictEqual(res.body.password, 'chosen-password');

    lookups.length = 0;
    res = await call('post', 'nobody', {});
    assert.strictEqual(res.code, 404);
    assert.deepStrictEqual(lookups, [['findOne', 'nobody']], 'a non-ObjectId key is never passed to findById');

    res = await call('post', 'Uncle', { password: 'short' });
    assert.strictEqual(res.code, 400);

    updates.length = 0;
    res = await call('delete', 'Uncle');
    assert.deepStrictEqual(res.body, { success: true });
    assert.deepStrictEqual(updates[0], [{ _id: 'oid-uncle' }, { $set: { appPasswordHash: '', appPasswordSetAt: null } }]);
    res = await call('delete', 'nobody');
    assert.strictEqual(res.code, 404);

    console.log('app password tests passed');
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

