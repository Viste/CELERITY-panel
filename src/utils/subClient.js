/**
 * Which app fetched a subscription, from its User-Agent. Dependency-free so routes, services
 * and tests can share it.
 */

const CLIENT_PATTERNS = [
    // The Potato apps send "Potato/<ver> Happ" (iOS) and "Potato/<ver> clash-verge" (Android) to
    // get the subscription format they need, so they must be matched before happ and clash.
    { name: 'potato',       re: /^potato\//i },
    // The Orbita desktop app sends "Orbita/<ver> (macos|windows) clash-verge": before clash too.
    { name: 'orbita',       re: /^orbita\//i },
    { name: 'happ',         re: /happ/i },
    { name: 'incy',         re: /incy/i },
    { name: 'hiddify',      re: /hiddify/i },
    { name: 'nekobox',      re: /nekobox|nekoray/i },
    { name: 'singbox',      re: /sing-?box|sfa|sfi|sfm|sft|karing/i },
    { name: 'v2rayng',      re: /v2rayng|v2rayn/i },
    { name: 'shadowrocket', re: /shadowrocket/i },
    { name: 'streisand',    re: /streisand/i },
    { name: 'clash',        re: /clash|stash|surge|loon/i },
    { name: 'quantumult',   re: /quantumult/i },
];

const CLIENT_NAMES = CLIENT_PATTERNS.map(p => p.name).concat('other');

/** One of CLIENT_NAMES. */
function detectClient(ua) {
    const str = ua || '';
    for (const { name, re } of CLIENT_PATTERNS) {
        if (re.test(str)) return name;
    }
    return 'other';
}

/**
 * Per-user key: like detectClient, but our own apps are split by platform:
 * potato-android / potato-ios, orbita-mac / orbita-windows.
 */
function detectClientKey(ua) {
    const str = String(ua || '');
    if (/^potato\//i.test(str)) {
        if (/clash/i.test(str)) return 'potato-android';
        if (/happ/i.test(str)) return 'potato-ios';
        return 'potato';
    }
    if (/^orbita\//i.test(str)) {
        if (/windows/i.test(str)) return 'orbita-windows';
        if (/mac|darwin/i.test(str)) return 'orbita-mac';
        return 'orbita';
    }
    return detectClient(str);
}

/** Our own apps (Potato, Orbita), which log in with the app password. */
function isOwnApp(key) {
    return /^(potato|orbita)(-|$)/.test(String(key || ''));
}

module.exports = { CLIENT_PATTERNS, CLIENT_NAMES, detectClient, detectClientKey, isOwnApp };
