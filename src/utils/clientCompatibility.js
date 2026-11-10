'use strict';

// Fleet compatibility floors verified against Xray 26.11.9. This is a
// subscription/login gate, not proof of the requesting binary's identity.
const MINIMUMS = Object.freeze({ potato: '1.0.4', orbita: '0.3.1', mihomo: '1.19.32' });

function parseVersion(value) {
    const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:[-+][0-9a-z.-]+)?$/i.exec(String(value || ''));
    if (!match) return null;
    const parts = [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
    return parts.every(Number.isSafeInteger) ? parts : null;
}

function olderThan(version, minimum) {
    const target = parseVersion(minimum);
    for (let i = 0; i < 3; i++) {
        if (version[i] !== target[i]) return version[i] < target[i];
    }
    return false;
}

function clientCompatibility(userAgent) {
    const ua = String(userAgent || '');
    const candidates = [];
    const own = /^(potato|orbita)\/([^\s;()]+)/i.exec(ua);
    if (own) candidates.push({ client: own[1].toLowerCase(), rawVersion: own[2] });

    // Match explicit CORE labels only. Clash Verge/CMFA application versions
    // say nothing about the bundled core and must not be compared to this floor.
    // Official Mihomo default: https://github.com/MetaCubeX/mihomo/blob/v1.19.32/config/config.go
    // (GlobalUA = "clash.meta/" + core version). 1.19.32 and 1.19.33 passed
    // stock-client XHTTP+REALITY HTTPS E2E against this fleet's 26.11.9 server.
    for (const match of ua.matchAll(/(?:^|[\s;(])(?:mihomo|clash\.meta)\/([^\s;()]+)/gi)) {
        candidates.push({ client: 'mihomo', rawVersion: match[1] });
    }
    for (const candidate of candidates) {
        const version = parseVersion(candidate.rawVersion);
        if (version && olderThan(version, MINIMUMS[candidate.client])) {
            return {
                allowed: false,
                client: candidate.client,
                version: version.join('.'),
                minimumVersion: MINIMUMS[candidate.client],
            };
        }
    }
    // Unrecognized clients, missing versions and development build identifiers
    // remain allowed. No unverified Happ/Shadowrocket/front-end version floors.
    return { allowed: true };
}

function sendClientUpgradeRequired(res, decision, logger) {
    const name = { potato: 'Potato', orbita: 'Orbita', mihomo: 'Mihomo core' }[decision.client];
    logger?.warn(`[ClientCompatibility] Rejected ${decision.client} ${decision.version}; minimum ${decision.minimumVersion}`);
    return res.status(403).set({ 'Cache-Control': 'no-store', Vary: 'User-Agent' }).json({
        success: false,
        code: 'client_upgrade_required',
        error: `Please update ${name} to ${decision.minimumVersion} or newer to use this subscription.`,
        client: decision.client,
        minimumVersion: decision.minimumVersion,
    });
}

module.exports = { MINIMUMS, clientCompatibility, sendClientUpgradeRequired };
