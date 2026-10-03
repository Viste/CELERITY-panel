#!/usr/bin/env node
/**
 * Import Remnawave users into Celerity by MERGING on exact username == userId.
 *
 *   node scripts/import-remnawave.js export.json [--apply] [--batch <id>] [--group <name>]
 *
 * Dry-run by default: prints what would change and exits. With --apply:
 *   existing user : $set xrayUuid = vless_uuid, $addToSet legacyTokens: short_uuid,
 *                   $set legacy.*, lastSubFetchAt/lastSubUserAgent (newer only).
 *                   subscriptionToken / password / traffic / groups / enabled /
 *                   expireAt are NOT touched.
 *   new user      : created with subscriptionToken = short_uuid, xrayUuid =
 *                   vless_uuid, enabled = ACTIVE && not expired, group = --group
 *                   (default ZagiChak), password from cryptoService.
 *
 * export.json = array of rows from the Remnawave `users ⋈ user_traffic` query
 * (username, short_uuid, vless_uuid, status, expire_at (UTC ISO), telegram_id,
 * email, description, id, online_at, last_srr{at,ua}).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const apply = args.includes('--apply');
const argVal = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const batch = argVal('--batch', `rw-${new Date().toISOString().slice(0, 10)}`);
const groupName = argVal('--group', 'ZagiChak');

if (!file) { console.error('usage: import-remnawave.js export.json [--apply] [--batch id] [--group name]'); process.exit(2); }

const TOKEN_RE = /^[A-Za-z0-9_-]{16}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toDate(v) { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
function maxDate(...ds) { const xs = ds.filter(Boolean); return xs.length ? new Date(Math.max(...xs.map(d => d.getTime()))) : null; }

async function main() {
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(rows)) throw new Error('export.json must be an array');
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI not set');
    await mongoose.connect(uri);
    const HyUser = require('../src/models/hyUserModel');
    const ServerGroup = require('../src/models/serverGroupModel');
    const Settings = require('../src/models/settingsModel');
    const cryptoService = require('../src/services/cryptoService');

    const group = await ServerGroup.findOne({ name: groupName }).lean();
    if (!group) throw new Error(`group "${groupName}" not found`);

    const existingAll = await HyUser.find({}).select('userId subscriptionToken legacyTokens xrayUuid enabled groups expireAt').lean();
    const byUserId = new Map(existingAll.map(u => [u.userId, u]));
    const tokenOwner = new Map();
    for (const u of existingAll) {
        if (u.subscriptionToken) tokenOwner.set(u.subscriptionToken, u.userId);
        for (const t of (u.legacyTokens || [])) tokenOwner.set(t, u.userId);
    }

    const ops = [];
    const report = [];
    const stats = { merged: 0, created: 0, skipped: 0, errors: 0 };
    const now = new Date();

    for (const r of rows) {
        const username = String(r.username || '').trim();
        const token = String(r.short_uuid || '').trim();
        const vless = String(r.vless_uuid || '').trim().toLowerCase();
        const line = { username, token, action: '', note: '' };
        report.push(line);
        if (!username || !TOKEN_RE.test(token) || !UUID_RE.test(vless)) {
            line.action = 'ERROR'; line.note = 'bad username/short_uuid/vless_uuid'; stats.errors++; continue;
        }
        const owner = tokenOwner.get(token);
        if (owner && owner !== username) {
            line.action = 'ERROR'; line.note = `short_uuid already belongs to ${owner}`; stats.errors++; continue;
        }
        const legacy = {
            remnawaveId: String(r.id ?? ''),
            telegramId: r.telegram_id == null ? '' : String(r.telegram_id),
            email: r.email || '',
            description: r.description || '',
            importedAt: now,
            importBatch: batch,
        };
        const lastFetch = maxDate(toDate(r.online_at), toDate(r.last_srr && r.last_srr.at));
        const lastUa = (r.last_srr && r.last_srr.ua) ? String(r.last_srr.ua).slice(0, 200) : '';
        const expireAt = toDate(r.expire_at);
        const existing = byUserId.get(username);

        if (existing) {
            const set = { xrayUuid: vless, 'legacy.remnawaveId': legacy.remnawaveId, 'legacy.telegramId': legacy.telegramId,
                'legacy.email': legacy.email, 'legacy.description': legacy.description,
                'legacy.importedAt': legacy.importedAt, 'legacy.importBatch': legacy.importBatch, 'legacy.createdByImport': false };
            if (lastFetch) { set.lastSubFetchAt = lastFetch; if (lastUa) set.lastSubUserAgent = lastUa; }
            const notes = [];
            if (existing.xrayUuid && existing.xrayUuid.toLowerCase() !== vless) notes.push(`xrayUuid ${existing.xrayUuid.slice(0, 8)}… → ${vless.slice(0, 8)}…`);
            if ((existing.legacyTokens || []).includes(token)) notes.push('token already present');
            if (!existing.enabled) notes.push('celerity user DISABLED (kept)');
            const gids = (existing.groups || []).map(String);
            if (!gids.includes(String(group._id))) notes.push(`not in ${groupName} (kept: ${gids.length} groups)`);
            if (expireAt && existing.expireAt && Math.abs(expireAt - new Date(existing.expireAt)) > 86400000) notes.push(`expireAt differs rw=${expireAt.toISOString().slice(0, 10)} cl=${new Date(existing.expireAt).toISOString().slice(0, 10)} (kept)`);
            line.action = 'MERGE'; line.note = notes.join('; ');
            // lastSubFetchAt only moves forward
            const update = { $set: set, $addToSet: { legacyTokens: token } };
            ops.push({ updateOne: { filter: { _id: existing._id }, update } });
            stats.merged++;
        } else {
            const enabled = String(r.status || '').toUpperCase() === 'ACTIVE' && (!expireAt || expireAt > now);
            const doc = {
                userId: username, username, password: cryptoService.generatePassword(username),
                subscriptionToken: token, legacyTokens: [token], xrayUuid: vless,
                enabled, groups: [group._id], expireAt, trafficLimit: 0,
                traffic: { tx: 0, rx: 0, lastUpdate: toDate(r.online_at) },
                legacy: { ...legacy, createdByImport: true },
                lastSubFetchAt: lastFetch, lastSubUserAgent: lastUa,
            };
            line.action = 'CREATE'; line.note = `enabled=${enabled} expire=${expireAt ? expireAt.toISOString().slice(0, 10) : '-'} group=${groupName}`;
            ops.push({ insertOne: { document: doc } });
            stats.created++;
        }
    }

    const w = Math.max(...report.map(l => l.username.length), 8);
    for (const l of report) console.log(`${l.action.padEnd(6)} ${l.username.padEnd(w)} ${l.token}  ${l.note}`);
    console.log(`\n${apply ? 'APPLY' : 'DRY-RUN'} batch=${batch}: merge=${stats.merged} create=${stats.created} errors=${stats.errors} (celerity users before: ${existingAll.length})`);

    if (!apply) { await mongoose.disconnect(); return; }
    if (stats.errors > 0) { console.error('refusing to apply with errors'); await mongoose.disconnect(); process.exit(1); }

    const res = await HyUser.bulkWrite(ops, { ordered: false });
    console.log(`bulkWrite: matched=${res.matchedCount} modified=${res.modifiedCount} inserted=${res.insertedCount}`);
    const withLegacy = await HyUser.countDocuments({ 'legacy.importBatch': batch });
    console.log(`users with legacy.importBatch=${batch}: ${withLegacy}; total users: ${await HyUser.countDocuments({})}`);
    await Settings.findByIdAndUpdate('settings', { $set: { 'migration.remnawave.stats': stats } }, { upsert: true });
    try {
        const { invalidateNodesCache } = require('../src/utils/helpers');
        await invalidateNodesCache();
        console.log('subscription caches invalidated');
    } catch (e) { console.log(`cache invalidation skipped: ${e.message}`); }
    await mongoose.disconnect();
}

main().catch(err => { console.error(`import failed: ${err.message}`); process.exit(1); });
