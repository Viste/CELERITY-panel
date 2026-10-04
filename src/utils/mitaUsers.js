/**
 * Parser for the table printed by `mita get users`:
 *   User  LastActive  1DayDown  1DayUp  7DaysDown  7DaysUp  30DaysDown  30DaysUp
 * Sizes are IEC with one decimal and no space ("12B", "1.5KiB", "23.4MiB"); a user that never
 * connected has "-" in every column.
 */

const UNIT = { B: 1, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4, PIB: 1024 ** 5 };

function parseSize(text) {
    const m = /^([0-9]+(?:\.[0-9]+)?)([KMGTP]iB|B)$/i.exec(String(text || '').trim());
    if (!m) return 0;
    return Math.round(parseFloat(m[1]) * (UNIT[m[2].toUpperCase()] || 1));
}

/**
 * @returns {Array<{name: string, lastActive: Date|null, windows: {d1, d7, d30}}>} one entry per
 * user; tx is what the user uploaded, rx what they downloaded, like the panel's user traffic.
 */
function parseMitaUsers(output) {
    const lines = String(output || '').split('\n').map(l => l.trim()).filter(Boolean);
    const headerAt = lines.findIndex(l => /^User\s+LastActive\s/.test(l));
    if (headerAt === -1) return [];
    const rows = [];
    for (const line of lines.slice(headerAt + 1)) {
        const cols = line.split(/\s+/);
        if (cols.length < 8) continue;
        const [name, lastActive, d1Down, d1Up, d7Down, d7Up, d30Down, d30Up] = cols;
        const at = lastActive === '-' ? null : new Date(lastActive);
        rows.push({
            name,
            lastActive: at && !Number.isNaN(at.getTime()) ? at : null,
            windows: {
                d1: { tx: parseSize(d1Up), rx: parseSize(d1Down) },
                d7: { tx: parseSize(d7Up), rx: parseSize(d7Down) },
                d30: { tx: parseSize(d30Up), rx: parseSize(d30Down) },
            },
        });
    }
    return rows;
}

module.exports = { parseSize, parseMitaUsers };
