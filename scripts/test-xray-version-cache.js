'use strict';

const assert = require('assert');

process.env.PANEL_DOMAIN = process.env.PANEL_DOMAIN || 'panel.example.com';
process.env.ACME_EMAIL = process.env.ACME_EMAIL || 'admin@example.com';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-32-characters-long';

const service = require('../src/services/syncService');
const HyNode = require('../src/models/hyNodeModel');
const cache = require('../src/services/cacheService');
const webhook = require('../src/services/webhookService');
const { realityClientPolicy } = require('../src/utils/realityClientPolicy');

const scenarios = [
    { name: 'online upgrade', oldVersion: '26.3.27', newVersion: '26.11.9', invalidate: true },
    { name: 'online downgrade', oldVersion: '26.11.9', newVersion: '26.3.27', invalidate: true },
    { name: 'unchanged version', oldVersion: '26.11.9', newVersion: '26.11.9', invalidate: false },
    { name: 'unknown remains unknown', oldVersion: undefined, newVersion: undefined, invalidate: false },
    { name: 'version discovered', oldVersion: '', newVersion: '26.11.9', invalidate: true },
    { name: 'version cleared', oldVersion: '26.11.9', newVersion: undefined, invalidate: true },
    { name: 'node recovered', status: 'offline', oldVersion: '26.11.9', newVersion: '26.11.9', invalidate: true },
    { name: 'node recovered and upgraded', status: 'offline', oldVersion: '26.3.27', newVersion: '26.11.9', invalidate: true },
];

async function exercise(method, scenario) {
    const original = {
        request: service._agentRequest,
        findOneAndUpdate: HyNode.findOneAndUpdate,
        invalidateNodes: cache.invalidateNodes,
        invalidateSubscriptions: cache.invalidateAllSubscriptions,
        invalidateDashboard: cache.invalidateDashboardCounts,
        emit: webhook.emit,
    };
    const initial = {
        _id: '507f1f77bcf86cd799439011', name: 'test-node', type: 'xray',
        status: scenario.status || 'online', xrayVersion: scenario.oldVersion,
        onlineUsers: 17, healthFailures: 0, xray: { agentToken: 'test-only-token' },
    };
    let stored = structuredClone(initial);
    let cachedNodes = [structuredClone(initial)];
    let cachedSubscription = realityClientPolicy(initial, { security: 'reality', fingerprint: 'firefox' });
    const callbacks = [];
    const events = [];
    let writes = 0;
    const assertUpdatedMetadata = () => {
        assert.strictEqual(writes, 1, 'invalidate only after the metadata write');
        assert.strictEqual(stored.xrayVersion, scenario.newVersion || '');
        assert.strictEqual(stored.status, 'online');
    };

    try {
        service._agentRequest = async (node, verb, path) => {
            assert.strictEqual(node._id, initial._id);
            assert.strictEqual(verb, 'GET');
            assert.strictEqual(path, '/info');
            return { data: { xray_version: scenario.newVersion, agent_version: 'test' } };
        };
        HyNode.findOneAndUpdate = async (filter, update) => {
            assert.deepStrictEqual(filter, { _id: initial._id });
            assert.ok(update.$set);
            assert.ok(!Object.hasOwn(update.$set, 'onlineUsers'), 'health must not overwrite traffic-derived users');
            const previous = structuredClone(stored);
            Object.assign(stored, update.$set);
            writes++;
            return previous;
        };
        // Run the real invalidateNodesCache helper through its cache callbacks.
        cache.invalidateNodes = async () => {
            assertUpdatedMetadata();
            callbacks.push('nodes');
            cachedNodes = null;
        };
        cache.invalidateAllSubscriptions = async () => {
            assertUpdatedMetadata();
            callbacks.push('subscriptions');
            cachedSubscription = null;
        };
        cache.invalidateDashboardCounts = async () => {
            assertUpdatedMetadata();
            callbacks.push('dashboard');
        };
        webhook.emit = (event, payload) => events.push({ event, payload });

        const result = await service[method](initial);
        if (method === 'checkXrayAgentHealth') assert.strictEqual(result.online, true);
        else assert.strictEqual(result, 0);
        assertUpdatedMetadata();
        assert.strictEqual(stored.onlineUsers, 17);
        assert.deepStrictEqual(callbacks.sort(), scenario.invalidate ? ['dashboard', 'nodes', 'subscriptions'] : []);
        assert.strictEqual(cachedNodes === null, scenario.invalidate);
        assert.strictEqual(cachedSubscription === null, scenario.invalidate);
        if (scenario.invalidate) {
            // The next cache fill must derive its client policy from the updated
            // metadata rather than keep an old fingerprint for the subscription TTL.
            cachedSubscription = realityClientPolicy(stored, { security: 'reality', fingerprint: 'firefox' });
            assert.strictEqual(cachedSubscription.fingerprint, scenario.newVersion === '26.11.9' ? 'chrome' : 'firefox');
        }
        const recovered = method === 'getXrayOnlineUsers' && initial.status !== 'online';
        assert.strictEqual(events.length, recovered ? 1 : 0, 'a version change is not a node-online event');
        if (recovered) assert.strictEqual(events[0].event, webhook.EVENTS.NODE_ONLINE);
    } finally {
        service._agentRequest = original.request;
        HyNode.findOneAndUpdate = original.findOneAndUpdate;
        cache.invalidateNodes = original.invalidateNodes;
        cache.invalidateAllSubscriptions = original.invalidateSubscriptions;
        cache.invalidateDashboardCounts = original.invalidateDashboard;
        webhook.emit = original.emit;
    }
}

(async () => {
    for (const method of ['checkXrayAgentHealth', 'getXrayOnlineUsers']) {
        for (const scenario of scenarios) await exercise(method, scenario);
    }
    console.log('Xray version cache tests passed (16 metadata transitions)');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => {
    // Importing syncService creates the SSH pool's idle-cleanup timer; this
    // standalone regression test never opens a connection.
    require('../src/services/sshPoolService').closeAll();
});
