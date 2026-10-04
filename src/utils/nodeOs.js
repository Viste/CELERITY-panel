/**
 * OS-family helpers for remote nodes (linux = systemd, freebsd = rc.d).
 * Kept dependency-free so services can use them without pulling in nodeSetup.
 */

function normalizeOsFamily(unameOutput) {
    return /^freebsd$/i.test(String(unameOutput || '').trim()) ? 'freebsd' : 'linux';
}

function nodeOsFamily(node) {
    return node?.osFamily === 'freebsd' ? 'freebsd' : 'linux';
}

// rc.d script names use underscores (cc_agent) and their rc.conf knob is <name>_enable.
function buildServiceCommand(osFamily, verb, service) {
    if (osFamily === 'freebsd') {
        if (verb === 'enable') return `sysrc ${service}_enable=YES`;
        if (verb === 'disable') return `sysrc ${service}_enable=NO`;
        if (verb === 'is-active') return `service ${service} status >/dev/null 2>&1 && echo active || echo inactive`;
        if (verb === 'status') return `service ${service} status`;
        // rc.d services started via daemon(8) inherit our stdio: without the
        // redirects an SSH exec never sees EOF and hangs until the service dies.
        return `service ${service} ${verb} </dev/null >/dev/null 2>&1`;
    }
    return `systemctl ${verb} ${service}`;
}

// Host metrics scripts. The FreeBSD variants print the same line shapes as
// the Linux tools so one parser serves both (cpu line: idle at index 3).
function buildSystemStatsScript(osFamily) {
    if (osFamily === 'freebsd') {
        return `
echo "===CPUSAMPLE==="
sysctl -n kern.cp_time | awk '{print "cpu", $1, $2, $3, $5, 0, $4}'
echo "===LOADAVG==="
sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1, $2, $3}'
echo "===CORES==="
sysctl -n hw.ncpu
echo "===MEM==="
PS=$(sysctl -n hw.pagesize); T=$(sysctl -n hw.physmem)
F=$(( ( $(sysctl -n vm.stats.vm.v_free_count) + $(sysctl -n vm.stats.vm.v_inactive_count) ) * PS ))
echo "Mem: $T $(( T - F )) $F"
echo "===DISK==="
df -k / | tail -1 | awk '{printf "%s %d %d %d %s %s\\n", $1, $2*1024, $3*1024, $4*1024, $5, $6}'
echo "===UPTIME==="
echo $(( $(date +%s) - $(sysctl -n kern.boottime | awk -F'[ =,]+' '{print $3}') ))
`;
    }
    return `
echo "===CPUSAMPLE==="
head -1 /proc/stat
echo "===LOADAVG==="
cat /proc/loadavg
echo "===CORES==="
nproc
echo "===MEM==="
free -b | grep -E "^Mem:"
echo "===DISK==="
df -B1 / | tail -1
echo "===UPTIME==="
cat /proc/uptime | cut -d' ' -f1
`;
}
function buildNetStatsCommand(osFamily) {
    if (osFamily === 'freebsd') {
        return `IF=$(route -n get default | awk '/interface:/{print $2}'); netstat -ibn -I "$IF" | awk -v i="$IF" '/<Link/ {printf "%s: %d 0 0 0 0 0 0 0 %d\\n", i, $8, $11}'`;
    }
    return `cat /proc/net/dev | grep -E '(eth|ens|enp|eno)' | head -1`;
}

// journald on linux; on freebsd rc.d services run under daemon(8) -S -T <service>, so their
// output lands in syslog under that tag.
function buildServiceLogsCommand(osFamily, service, lines) {
    const n = Number(lines) || 50;
    if (osFamily === 'freebsd') {
        // "host mita[1234]: ..." — the pid brackets are matched with dots to keep the pattern plain.
        return `grep -E ' ${service}(.[0-9]+.)?: ' /var/log/messages 2>/dev/null | tail -n ${n}; exit 0`;
    }
    return `journalctl -u ${service} -n ${n} --no-pager 2>/dev/null || true`;
}

// Prints the listening socket line for the port, or nothing.
function buildListenCheckCommand(osFamily, protocol, port) {
    const proto = String(protocol || '').toLowerCase() === 'udp' ? 'udp' : 'tcp';
    const p = Number(port) || 0;
    if (osFamily === 'freebsd') {
        return `sockstat -46l -P ${proto} -p ${p} 2>/dev/null | awk 'NR > 1' | head -1`;
    }
    return `ss ${proto === 'udp' ? '-uln' : '-tln'}p 2>/dev/null | grep -E ":${p}\\b" | head -1 || true`;
}

module.exports = {
    normalizeOsFamily, nodeOsFamily, buildServiceCommand, buildSystemStatsScript, buildNetStatsCommand,
    buildServiceLogsCommand, buildListenCheckCommand,
};
