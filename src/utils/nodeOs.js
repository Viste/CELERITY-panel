/**
 * OS-family helpers for remote nodes (linux = systemd, freebsd = rc.d).
 * Kept dependency-free so services can use them without pulling in nodeSetup.
 */

function normalizeOsFamily(unameOutput) {
    return /^freebsd$/i.test(String(unameOutput || '').trim()) ? 'freebsd' : 'linux';
}

function nodeOsFamily(node) {
    return node?.osFamily === 'freebsd' ? 'freebsd' : 'linux';
}

// rc.d script names use underscores (cc_agent) and their rc.conf knob is <name>_enable.
function buildServiceCommand(osFamily, verb, service) {
    if (osFamily === 'freebsd') {
        if (verb === 'enable') return `sysrc ${service}_enable=YES`;
        if (verb === 'disable') return `sysrc ${service}_enable=NO`;
        if (verb === 'is-active') return `service ${service} status >/dev/null 2>&1 && echo active || echo inactive`;
        if (verb === 'status') return `service ${service} status`;
        // rc.d services started via daemon(8) inherit our stdio: without the
        // redirects an SSH exec never sees EOF and hangs until the service dies.
        return `service ${service} ${verb} </dev/null >/dev/null 2>&1`;
    }
    return `systemctl ${verb} ${service}`;
}

module.exports = { normalizeOsFamily, nodeOsFamily, buildServiceCommand };
