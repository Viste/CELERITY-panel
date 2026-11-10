'use strict';

// REALITY >= 26.9.8 rejects classical-only ClientHellos. Older mihomo cores
// strip the hybrid key share unless the subscription explicitly enables it.
// Keep older servers' selected fingerprint and ordinary TLS profiles intact.
function realityClientPolicy(node, inbound) {
    const fingerprint = inbound.fingerprint || 'chrome';
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(node.xrayVersion || ''));
    const modern = match && (Number(match[1]) > 26
        || (Number(match[1]) === 26 && (Number(match[2]) > 9
            || (Number(match[2]) === 9 && Number(match[3]) >= 8))));
    if ((inbound.security || 'reality') !== 'reality' || !modern) {
        return { fingerprint, supportX25519MLKEM768: false };
    }
    // Generic chrome remains understood by old clients. Updated applications
    // resolve it to Chrome 155; old mihomo resolves it to its hybrid Chrome 133.
    return { fingerprint: 'chrome', supportX25519MLKEM768: true };
}

module.exports = { realityClientPolicy };
