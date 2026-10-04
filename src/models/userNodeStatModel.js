const mongoose = require('mongoose');

/**
 * Per-user activity on a node: who was on which server and how much they moved there.
 *
 * xray nodes: one document per (user, node, hour) with the traffic deltas of each agent poll.
 * mieru nodes: one rolling document per (user, node) with hour = null, holding mita's own
 * 1/7/30-day windows (mita reports no deltas).
 */
const windowSchema = { tx: { type: Number, default: 0 }, rx: { type: Number, default: 0 } };

const userNodeStatSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    node: { type: mongoose.Schema.Types.ObjectId, ref: 'HyNode', required: true },
    hour: { type: Date, default: null },
    tx: { type: Number, default: 0 },
    rx: { type: Number, default: 0 },
    windows: { d1: windowSchema, d7: windowSchema, d30: windowSchema },
    lastSeen: { type: Date, default: null },
    // xray: bytes moved in the most recent poll, to tell real use from keep-alive probes
    lastDelta: { type: Number, default: null },
}, { timestamps: false, versionKey: false });

userNodeStatSchema.index({ userId: 1, node: 1, hour: 1 }, { unique: true });
userNodeStatSchema.index({ hour: 1 });
userNodeStatSchema.index({ lastSeen: -1 });

const HOUR_MS = 3600 * 1000;
const RETENTION_DAYS = 35;

function hourOf(date) {
    return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

/** entries: [[userId, { tx, rx }]] — the non-zero deltas of one agent poll. */
userNodeStatSchema.statics.recordXray = async function (nodeId, entries, now = new Date()) {
    const hour = hourOf(now);
    const ops = [];
    for (const [userId, traffic] of entries) {
        const tx = Number(traffic?.tx) || 0;
        const rx = Number(traffic?.rx) || 0;
        if (!userId || (tx === 0 && rx === 0)) continue;
        ops.push({
            updateOne: {
                filter: { userId, node: nodeId, hour },
                update: { $inc: { tx, rx }, $set: { lastSeen: now, lastDelta: tx + rx } },
                upsert: true,
            },
        });
    }
    if (ops.length > 0) await this.bulkWrite(ops, { ordered: false });
    return ops.length;
};

/** rows: [{ userId, lastActive, windows }] — one `mita get users` reading, names already mapped. */
userNodeStatSchema.statics.recordMieru = async function (nodeId, rows) {
    const ops = [];
    for (const row of rows) {
        if (!row.userId || !row.lastActive) continue;
        ops.push({
            updateOne: {
                filter: { userId: row.userId, node: nodeId, hour: null },
                update: { $set: { windows: row.windows, lastSeen: row.lastActive } },
                upsert: true,
            },
        });
    }
    if (ops.length > 0) await this.bulkWrite(ops, { ordered: false });
    return ops.length;
};

userNodeStatSchema.statics.cleanup = async function (now = new Date()) {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * HOUR_MS);
    const hourly = await this.deleteMany({ hour: { $ne: null, $lt: cutoff } });
    const rolling = await this.deleteMany({ hour: null, lastSeen: { $lt: cutoff } });
    return (hourly.deletedCount || 0) + (rolling.deletedCount || 0);
};

module.exports = mongoose.model('UserNodeStat', userNodeStatSchema);
module.exports.hourOf = hourOf;
