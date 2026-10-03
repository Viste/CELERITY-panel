const assert = require('assert');
process.env.PANEL_DOMAIN = 'panel.test'; process.env.ACME_EMAIL = 't@t'; process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef'; process.env.SESSION_SECRET = 'x';
const nodeSetup = require('../src/services/nodeSetup');
const b = nodeSetup.buildFreebsdAgentDownloadScript;
assert.ok(b('https://panel.test/agents/cc-agent-freebsd-amd64').includes("URL='https://panel.test/agents/cc-agent-freebsd-amd64'"));
assert.strictEqual(b(''), '');
assert.strictEqual(b('ftp://x/y'), '');
console.log('freebsd agent url tests passed');
