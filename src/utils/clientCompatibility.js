'use strict';

// Service update policy, not a guarantee of the bundled core, fingerprint or
// end-to-end interoperability. User-Agent is a client declaration, not identity.
const MINIMUMS = Object.freeze({
    potato: '1.0.4', orbita: '0.3.1', mihomo: '1.19.32', happ: '4.5.2',
    v2rayn: '7.25.1', v2rayng: '2.3.8', shadowrocket: '2.2.84',
});
// These releases ship Xray 26.9.9+; Android uses the following stable fix release.
// https://github.com/Happ-proxy/happ-desktop/releases/tag/4.5.2
// https://github.com/Happ-proxy/happ-android/releases/tag/4.7.0
// https://github.com/Happ-proxy/happ-android/releases/tag/4.7.1
// https://apps.apple.com/us/app/happ-proxy-utility/id6504287215 (6.1.0)
const HAPP_MINIMUMS = Object.freeze({ desktop: MINIMUMS.happ, android: '4.7.1', ios: '6.1.0' });
// https://github.com/2dust/v2rayN/releases/tag/7.25.1
// https://github.com/2dust/v2rayNG/releases/tag/2.3.8
// Shadowrocket 2.2.84 fixes XHTTP stream-one session ID, path and padding:
// https://apps.apple.com/us/app/shadowrocket/id932747118
const CLIENT_NAMES = Object.freeze({
    potato: 'Potato', orbita: 'Orbita', mihomo: 'Mihomo core', happ: 'Happ',
    v2rayn: 'v2rayN', v2rayng: 'v2rayNG', shadowrocket: 'Shadowrocket',
});

function declaredPlatform(value) {
    const text = String(value || '');
    const android = /\bandroid\b/i.test(text);
    const ios = /\b(?:iphone|ipad|ipados|ios)\b/i.test(text);
    // Android UAs also say Linux, and iOS UAs may say Mac OS X.
    if (android && ios) return 'ambiguous';
    if (android) return 'android';
    if (ios) return 'ios';
    if (/\b(?:windows|linux|macos|mac os x)\b/i.test(text)) return 'desktop';
    return null;
}

function happPlatform(userAgent, platformHint) {
    const declarations = [declaredPlatform(userAgent), declaredPlatform(platformHint)].filter(Boolean);
    if (declarations.includes('ambiguous') || new Set(declarations).size > 1) return 'unknown';
    return declarations[0] || 'unknown';
}

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

function clientCompatibility(userAgent, platformHint) {
    const ua = String(userAgent || '');
    const candidates = [];
    const own = /^(potato|orbita)\/([^\s;()/]+)/i.exec(ua);
    if (own) candidates.push({ client: own[1].toLowerCase(), rawVersion: own[2] });

    // Our apps deliberately carry third-party format markers. Their own prefix
    // takes precedence; an explicit core declaration below is still checked.
    if (!own) {
        // Happ also sends Happ/version/platform/device-id. Read only the third
        // segment as platform evidence; opaque device IDs can contain OS words.
        // Only the version token belongs in the policy decision and warning log.
        for (const match of ua.matchAll(/(?:^|[\s;(])(happ|v2rayng|v2rayn|shadowrocket)\/([^\s;()/]+)(?:\/([^\s;()/]*))?/gi)) {
            const client = match[1].toLowerCase();
            // Happ/1.0 is also used as a generic format marker, not an app version.
            if (client === 'happ' && match[2] === '1.0') continue;
            const platformEvidence = match[3] === undefined ? ua : match[3];
            const platform = client === 'happ' ? happPlatform(platformEvidence, platformHint) : undefined;
            candidates.push({
                client, rawVersion: match[2], platform,
                minimumVersion: HAPP_MINIMUMS[platform] || MINIMUMS[client],
            });
        }
    }

    // Match explicit CORE labels only. Clash Verge/CMFA application versions
    // say nothing about the bundled core and must not be compared to this floor.
    // Official Mihomo default: https://github.com/MetaCubeX/mihomo/blob/v1.19.32/config/config.go
    // (GlobalUA = "clash.meta/" + core version).
    for (const match of ua.matchAll(/(?:^|[\s;(])(?:mihomo|clash\.meta)\/([^\s;()/]+)/gi)) {
        candidates.push({ client: 'mihomo', rawVersion: match[1] });
    }
    for (const candidate of candidates) {
        const version = parseVersion(candidate.rawVersion);
        const minimumVersion = candidate.minimumVersion || MINIMUMS[candidate.client];
        if (version && olderThan(version, minimumVersion)) {
            return {
                allowed: false,
                client: candidate.client,
                clientName: CLIENT_NAMES[candidate.client],
                ...(candidate.platform ? { platform: candidate.platform } : {}),
                version: version.join('.'),
                minimumVersion,
            };
        }
    }
    // Unrecognized clients, missing versions and development build identifiers
    // remain allowed. Bare v2ray, sing-box and its forks have no generic floor.
    return { allowed: true };
}

function sendClientUpgradeRequired(res, decision, logger) {
    const platformName = { android: 'Android', ios: 'iOS', desktop: 'desktop' }[decision.platform];
    const name = CLIENT_NAMES[decision.client] + (platformName ? ` (${platformName})` : '');
    logger?.warn(`[ClientCompatibility] Rejected ${decision.client} ${decision.version}; minimum ${decision.minimumVersion}`);
    return res.status(403).set({ 'Cache-Control': 'no-store', Vary: 'User-Agent, X-Device-OS' }).json({
        success: false,
        code: 'client_upgrade_required',
        error: `Please update ${name} to ${decision.minimumVersion} or newer to use this subscription.`,
        client: decision.client,
        minimumVersion: decision.minimumVersion,
    });
}

module.exports = { MINIMUMS, clientCompatibility, sendClientUpgradeRequired };
