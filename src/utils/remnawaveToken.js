/**
 * Remnawave legacy subscription URL shape: /<short_uuid>[/<client>]
 * short_uuid = 16 URL-safe characters. Kept dependency-free for tests.
 */
const TOKEN_RE = '[A-Za-z0-9_-]{16}';
const LEGACY_CLIENT_RE = 'info|json|v2ray-json|xray-json|singbox|sing-box|mihomo|clash|stash';
const URL_RE = new RegExp(`^\\/(?<token>${TOKEN_RE})(?:\\/(?<client>${LEGACY_CLIENT_RE}))?\\/?$`);

const CLIENT_TO_FORMAT = {
    'json':       'v2ray-json',
    'v2ray-json': 'v2ray-json',
    'xray-json':  'xray-json',
    'singbox':    'singbox',
    'sing-box':   'singbox',
    'mihomo':     'clash',
    'clash':      'clash',
    'stash':      'clash',
};

/** Returns {token, client} or null. `hosts` (Set, lowercase) restricts hostnames when non-empty. */
function matchPath(path, hostname, hosts) {
    const m = URL_RE.exec(path || '');
    if (!m) return null;
    if (hosts && hosts.size > 0 && !hosts.has(String(hostname || '').toLowerCase())) return null;
    return { token: m.groups.token, client: m.groups.client || '' };
}

module.exports = { matchPath, CLIENT_TO_FORMAT, URL_RE };
