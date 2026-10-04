/**
 * Per-user statistics for the panel: who is on which server, how much they moved there, and
 * which apps fetch their subscription. Reads UserNodeStat (filled by the stats poll) and the
 * tracking fields on HyUser.
 */
const HyUser = require('../models/hyUserModel');
const HyNode = require('../models/hyNodeModel');
const UserNodeStat = require('../models/userNodeStatModel');
const { detectClientKey } = require('../utils/subClient');

const HOUR_MS = 3600 * 1000;
const PERIOD_HOURS = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 };
// mita only reports rolling 1/7/30-day windows, so shorter periods fall back to one day.
const PERIOD_WINDOW = { '1h': 'd1', '6h': 'd1', '24h': 'd1', '7d': 'd7', '30d': 'd30' };
// The poll runs every 5 minutes: "online" means traffic in one of the last two polls.
const ONLINE_WINDOW_MS = 11 * 60 * 1000;
// Clients probe every server of the subscription in the background. Less than this in the last
// poll is shown as background, not as the server the user is really on.
const BACKGROUND_BYTES = 100 * 1024;
// A client counts for the summary if it fetched the subscription within this many days.
const CLIENT_ACTIVE_DAYS = 30;

function normalizePeriod(period) {
    return Object.prototype.hasOwnProperty.call(PERIOD_HOURS, period) ? period : '24h';
}

function toTime(value) {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
}

/** [{ key, at }] newest first; falls back to the single last User-Agent kept before subClients. */
function userClients(user) {
    const out = [];
    const map = user.subClients && typeof user.subClients === 'object' ? user.subClients : {};
    for (const [key, at] of Object.entries(map)) {
        const t = toTime(at);
        if (t) out.push({ key, at: new Date(t) });
    }
    if (out.length === 0 && user.lastSubFetchAt) {
        out.push({ key: detectClientKey(user.lastSubUserAgent), at: new Date(user.lastSubFetchAt) });
    }
    return out.sort((a, b) => b.at - a.at);
}

/**
 * Pure composition, kept separate from the queries for tests.
 * @param hourly  [{ userId, node, tx, rx, lastSeen }] — xray buckets already summed over the period
 * @param rolling [{ userId, node, windows, lastSeen }] — mieru rolling documents
 */
function buildOverview({ users, nodes, hourly, rolling, period, now = new Date() }) {
    const p = normalizePeriod(period);
    const windowKey = PERIOD_WINDOW[p];
    const nowMs = now.getTime();
    const knownNodes = new Set(nodes.map(n => String(n._id)));

    const perUser = new Map();
    const cell = (userId, nodeId) => {
        if (!perUser.has(userId)) perUser.set(userId, new Map());
        const byNode = perUser.get(userId);
        if (!byNode.has(nodeId)) byNode.set(nodeId, { tx: 0, rx: 0, lastSeen: null, lastDelta: null });
        return byNode.get(nodeId);
    };
    for (const row of hourly) {
        const nodeId = String(row.node);
        if (!knownNodes.has(nodeId)) continue;
        const c = cell(row.userId, nodeId);
        c.tx += row.tx || 0;
        c.rx += row.rx || 0;
        if (toTime(row.lastSeen) > toTime(c.lastSeen)) {
            c.lastSeen = row.lastSeen;
            c.lastDelta = row.lastDelta ?? null;
        }
    }
    for (const row of rolling) {
        const nodeId = String(row.node);
        if (!knownNodes.has(nodeId)) continue;
        const w = row.windows?.[windowKey] || {};
        const c = cell(row.userId, nodeId);
        c.tx += w.tx || 0;
        c.rx += w.rx || 0;
        if (toTime(row.lastSeen) > toTime(c.lastSeen)) c.lastSeen = row.lastSeen;
    }

    const clientTotals = {};
    const onlineByNode = {};
    const clientCutoff = nowMs - CLIENT_ACTIVE_DAYS * 24 * HOUR_MS;
    let onlineUsers = 0;
    let withClient = 0;
    let connections = 0;
    let activeConnections = 0;
    // mita reports no per-poll amount (lastDelta is null there): such a connection counts as active.
    const isBackground = c => c.lastDelta != null && c.lastDelta < BACKGROUND_BYTES;

    const outUsers = users.map(user => {
        const byNodeMap = perUser.get(user.userId) || new Map();
        const byNode = {};
        const online = [];
        let tx = 0;
        let rx = 0;
        for (const [nodeId, c] of byNodeMap) {
            byNode[nodeId] = { tx: c.tx, rx: c.rx, lastSeen: c.lastSeen };
            tx += c.tx;
            rx += c.rx;
            if (toTime(c.lastSeen) >= nowMs - ONLINE_WINDOW_MS) {
                const background = isBackground(c);
                online.push({ node: nodeId, delta: c.lastDelta, background });
                (onlineByNode[nodeId] = onlineByNode[nodeId] || []).push(user.userId);
                connections++;
                if (!background) activeConnections++;
            }
        }
        // real use first, then by the amount of the last poll
        online.sort((a, b) => (a.background - b.background) || ((b.delta ?? Infinity) - (a.delta ?? Infinity)));
        if (online.length > 0) onlineUsers++;

        const clients = userClients(user);
        const recent = clients.filter(c => c.at.getTime() >= clientCutoff);
        for (const c of recent) clientTotals[c.key] = (clientTotals[c.key] || 0) + 1;
        if (recent.length > 0) withClient++;

        // The app logs in once and then only refreshes the subscription, so either counts.
        const potatoTimes = clients.filter(c => c.key.startsWith('potato')).map(c => c.at.getTime());
        if (user.appLastLoginAt) potatoTimes.push(toTime(user.appLastLoginAt));
        const potatoAt = potatoTimes.length ? new Date(Math.max(...potatoTimes)) : null;

        return {
            userId: user.userId,
            username: user.username || '',
            enabled: user.enabled !== false,
            online,
            clients,
            lastFetchAt: user.lastSubFetchAt || null,
            hasAppPassword: !!user.appPasswordSetAt,
            appLoginAt: user.appLastLoginAt || null,
            potatoAt,
            traffic: { tx, rx },
            totalTraffic: { tx: user.traffic?.tx || 0, rx: user.traffic?.rx || 0 },
            byNode,
        };
    });

    outUsers.sort((a, b) =>
        (b.online.length > 0) - (a.online.length > 0)
        || (b.traffic.tx + b.traffic.rx) - (a.traffic.tx + a.traffic.rx)
        || a.userId.localeCompare(b.userId));

    return {
        period: p,
        generatedAt: now,
        nodes: nodes.map(n => ({ id: String(n._id), name: n.name, type: n.type, flag: n.flag || '' })),
        users: outUsers,
        summary: {
            users: users.length,
            online: onlineUsers,
            connections,
            activeConnections,
            withClient,
            clients: clientTotals,
            onlineByNode,
        },
    };
}

class UserStatsService {
    async getOverview(period = '24h', now = new Date()) {
        const p = normalizePeriod(period);
        const since = new Date(UserNodeStat.hourOf(now).getTime() - (PERIOD_HOURS[p] - 1) * HOUR_MS);
        const [users, nodes, hourly, rolling] = await Promise.all([
            HyUser.find({})
                .select('userId username enabled traffic lastSubFetchAt lastSubUserAgent subClients appPasswordSetAt appLastLoginAt')
                .lean(),
            HyNode.find({ active: true, type: { $in: ['xray', 'mieru', 'hysteria'] } })
                .select('name type flag rankingCoefficient')
                .sort({ rankingCoefficient: 1, name: 1 })
                .lean(),
            UserNodeStat.aggregate([
                { $match: { hour: { $gte: since } } },
                { $sort: { lastSeen: 1 } },
                { $group: { _id: { userId: '$userId', node: '$node' }, tx: { $sum: '$tx' }, rx: { $sum: '$rx' }, lastSeen: { $max: '$lastSeen' }, lastDelta: { $last: '$lastDelta' } } },
            ]),
            UserNodeStat.find({ hour: null }).select('userId node windows lastSeen').lean(),
        ]);
        return buildOverview({
            users,
            nodes,
            hourly: hourly.map(r => ({ userId: r._id.userId, node: r._id.node, tx: r.tx, rx: r.rx, lastSeen: r.lastSeen, lastDelta: r.lastDelta })),
            rolling,
            period: p,
            now,
        });
    }

    /** rows from parseMitaUsers; mita knows users by the panel's username. */
    async recordMieruUsers(node, rows) {
        const active = rows.filter(r => r.lastActive);
        if (active.length === 0) return 0;
        const names = active.map(r => r.name);
        const users = await HyUser.find({ $or: [{ username: { $in: names } }, { userId: { $in: names } }] })
            .select('userId username').lean();
        const idByName = new Map();
        for (const u of users) {
            idByName.set(u.userId, u.userId);
            if (u.username) idByName.set(u.username, u.userId);
        }
        const mapped = active
            .map(r => ({ userId: idByName.get(r.name), lastActive: r.lastActive, windows: r.windows }))
            .filter(r => r.userId);
        return UserNodeStat.recordMieru(node._id, mapped);
    }
}

module.exports = new UserStatsService();
module.exports.buildOverview = buildOverview;
module.exports.userClients = userClients;
module.exports.ONLINE_WINDOW_MS = ONLINE_WINDOW_MS;
module.exports.BACKGROUND_BYTES = BACKGROUND_BYTES;
