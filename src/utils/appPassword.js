/**
 * App (mobile client) passwords: scrypt hashes, constant-time verify.
 * Format: scrypt$<N>$<salt b64url>$<hash b64url>
 */
const crypto = require('crypto');

const SCRYPT_N = 16384;
const KEYLEN = 32;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(length = 12) {
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
}

function hashPassword(password) {
    const pw = String(password || '');
    if (pw.length < 6 || pw.length > 128) throw new Error('password must be 6..128 characters');
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(pw, salt, KEYLEN, { N: SCRYPT_N, r: 8, p: 1 });
    return `scrypt$${SCRYPT_N}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

function verifyPassword(password, stored) {
    if (!stored || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
    const n = parseInt(parts[1], 10);
    if (!Number.isFinite(n) || n < 1024) return false;
    let salt, expected;
    try { salt = Buffer.from(parts[2], 'base64url'); expected = Buffer.from(parts[3], 'base64url'); } catch (_) { return false; }
    if (!salt.length || !expected.length) return false;
    const pw = String(password || '');
    if (!pw) return false;
    const actual = crypto.scryptSync(pw, salt, expected.length, { N: n, r: 8, p: 1 });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { generatePassword, hashPassword, verifyPassword };
