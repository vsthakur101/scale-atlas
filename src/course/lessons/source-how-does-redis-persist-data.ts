import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -18, 0, 10, 'clients', extra);
const main = (extra: Partial<SceneNode> = {}) => db('main', -8, 0, 'Redis main process (dataset in RAM)', { size: [1.8, 1.8], ...extra });
const child = (extra: Partial<SceneNode> = {}) => box('child', 2, -8, 'Forked child (copy-on-write view)', 'purple', 'copy', { size: [1.4, 1.4], height: 24, ...extra });
const rdb = (extra: Partial<SceneNode> = {}) => disk('rdb', 12, -8, 'dump.rdb (point-in-time snapshot)', { size: [3, 1.2], height: 12, tone: 'yellow', ...extra });
const aof = (extra: Partial<SceneNode> = {}) => disk('aof', 12, 8, 'appendonly.aof (command log)', { size: [3, 1.2], height: 14, tone: 'yellow', icon: 'list', ...extra });
const rec = (extra: Partial<SceneNode> = {}) => box('rec', 2, 8, 'Restart: load RDB / replay AOF', 'green', 'refresh', { size: [1.4, 1.4], height: 24, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`);
const fmtG = (mb: number): string => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`);

const lesson: Lesson = {
  slug: 'source-how-does-redis-persist-data',
  title: 'Redis Persistence: RDB Snapshots, the AOF and Copy-on-Write',
  blurb: 'How an in-memory store survives restarts: fork-based snapshots and what copy-on-write costs, the append-only file and fsync policies, rewrites, and how much data you can lose and how long recovery takes.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'fork', label: 'Latency pause while forking a snapshot', icon: 'pause' },
    { key: 'cow', label: 'Extra memory from copy-on-write during the snapshot', icon: 'disk' },
    { key: 'lossR', label: 'Writes lost on crash: snapshots only', icon: 'alert' },
    { key: 'lossA', label: 'Writes lost on crash: AOF everysec', icon: 'shield' },
    { key: 'rec', label: 'Recovery time: RDB load vs AOF replay', icon: 'timer' },
  ],
  goals: [
    { text: 'Why a RAM store needs persistence', step: 1 },
    { text: 'RDB: fork a child and write a snapshot', step: 2 },
    { text: 'Copy-on-write and the fork pause', step: 3 },
    { text: 'AOF: log every write; fsync policies and rewrites', step: 4 },
    { text: 'Combining them, and what to expect on restart', step: 5 },
  ],
  legend: ['request', 'write', 'response', 'fail'],
  dynamic: {
    parameters: [
      { key: 'gb', label: 'Dataset size', min: 1, max: 512, step: 1, default: 32, unit: ' GB', description: 'Memory used by the dataset.' },
      { key: 'forkms', label: 'Fork cost per GB (page-table copy)', min: 1, max: 60, step: 1, default: 12, unit: ' ms/GB', description: 'Fork pause per GB of resident memory; higher on virtualised hosts.' },
      { key: 'wps', label: 'Write commands per second', min: 100, max: 500000, step: 100, default: 20000, unit: '/s', description: 'Write rate; each assumed to touch a random 4 KB page.' },
      { key: 'disk', label: 'Snapshot write speed', min: 50, max: 3000, step: 10, default: 500, unit: ' MB/s', description: 'Sequential write throughput for the dump.' },
      { key: 'snap', label: 'Snapshot interval', min: 30, max: 7200, step: 30, default: 300, unit: ' s', description: 'Time between snapshots.' },
      { key: 'load', label: 'RDB load speed', min: 50, max: 2000, step: 10, default: 300, unit: ' MB/s', description: 'How fast a snapshot is read back into memory.' },
      { key: 'replay', label: 'AOF replay speed', min: 10, max: 1000, step: 10, default: 80, unit: ' MB/s', description: 'Command replay is slower than a binary load.' },
      { key: 'rewrite', label: 'Time since last AOF rewrite', min: 60, max: 86400, step: 60, default: 3600, unit: ' s', description: 'Tail of the log accumulated since the last compaction.' },
      { key: 'bpc', label: 'Average bytes per logged command', min: 20, max: 2000, step: 10, default: 100, unit: ' B', description: 'RESP-encoded size of a write command.' },
    ],
    calculate: (input, step) => {
      const gb = Math.max(0.1, input.gb ?? 32);
      const forkms = Math.max(0, input.forkms ?? 12);
      const wps = Math.max(0, input.wps ?? 20000);
      const disk = Math.max(1, input.disk ?? 500);
      const snap = Math.max(1, input.snap ?? 300);
      const load = Math.max(1, input.load ?? 300);
      const replay = Math.max(1, input.replay ?? 80);
      const rewrite = Math.max(0, input.rewrite ?? 3600);
      const bpc = Math.max(1, input.bpc ?? 100);
      const dataMb = gb * 1000;
      const dur = dataMb / disk;
      // Each write dirties (at most) one 4 KB page; the child's view pins the old copy of each.
      const cowMb = Math.min(dataMb, (wps * dur * 4096) / 1e6);
      const aofMb = dataMb + (wps * bpc * rewrite) / 1e6;
      return {
        fork: step < 2 ? { v: '—' } : { v: `${Math.round(gb * forkms)} ms (stalls all commands)`, tone: gb * forkms < 100 ? 'good' : gb * forkms < 500 ? 'warn' : 'bad' },
        cow: step < 2 ? { v: '—' } : { v: `${fmtG(cowMb)} (${((cowMb / dataMb) * 100).toFixed(0)}% of data; snapshot takes ${fmtT(dur)})`, tone: cowMb / dataMb < 0.2 ? 'good' : cowMb / dataMb < 0.5 ? 'warn' : 'bad' },
        lossR: step < 3 ? { v: '—' } : { v: `up to ${fmtN(wps * snap)} writes (${fmtT(snap)} of traffic)`, tone: 'warn' },
        lossA: step < 4 ? { v: '—' } : { v: `≈ ${fmtN(wps)} writes (about 1 s)`, tone: 'good' },
        rec: step < 4 ? { v: '—' } : { v: `${fmtT(dataMb / load)} (RDB) vs ${fmtT(aofMb / replay)} (AOF, ${fmtG(aofMb)})` },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'RAM is fast and volatile',
      body: [
        'Redis serves from memory, which is erased by a restart, crash or power loss. If it is only a cache, losing it means a cold start; if it holds <b>sessions, queues, counters or leaderboards</b> you care about, you need durability — and durability means disk, which is orders of magnitude slower than RAM. Redis offers two persistence mechanisms with different trade-offs between <b>performance</b>, <b>data-loss window</b> and <b>recovery time</b>: <b>RDB</b> point-in-time snapshots and the <b>AOF</b> (append-only file) command log, which can be combined.',
        'Neither makes Redis a replacement for a transactional database by itself — there is no multi-key rollback and no external WAL guarantee unless you accept fsync-per-write — but with the right configuration (plus replication, see the Consistency and High Availability lessons) it is dependable for many stateful uses. The sections below quantify each choice for a 32 GB dataset taking 20,000 writes per second.',
      ],
      scene: { nodes: [clients(), main({ tag: pill('32 GB dataset in RAM', 'db') }), rdb(), aof()], links: [link('clients', 'main'), link('main', 'rdb', { style: 'dashed' }), link('main', 'aof', { style: 'dashed' })], flows: [flow(['clients', 'main'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'RDB',
      kind: 'technique',
      title: 'RDB: fork a child, let it write the snapshot',
      body: [
        'On a schedule (<code>save 300 100</code>: every 300 s if ≥ 100 keys changed) or on <code>BGSAVE</code>, Redis calls <b><code>fork()</code></b>. The child process gets a <b>frozen, consistent view</b> of the dataset at that instant — the OS shares the parent’s memory pages <b>copy-on-write</b> — and serialises it to a compact binary <code>dump.rdb</code> (written to a temp file, then atomically renamed). The parent keeps serving clients. Snapshots are compact, ideal for backups and fast restarts, and the child does the disk I/O so the main thread never blocks on it.',
        'The weakness is the <b>loss window</b>: anything written since the last completed snapshot is gone after a crash — with a 300 s interval and 20,000 writes/s, up to <b>6 million writes</b>. Shortening the interval raises the cost of every snapshot (below), so RDB alone suits caches and data that can be rebuilt, not data you can’t afford to lose.',
      ],
      changes: [{ text: 'fork() gives the child a consistent view; parent keeps serving', tone: 'good' }, { text: 'Compact binary file, atomic rename', tone: 'good' }, { text: 'Crash loses everything since the last snapshot', tone: 'bad' }],
      scene: { nodes: [main(), child({ tag: pill('sees frozen state', 'copy') }), rdb({ tag: pill('write + rename', 'disk') })], links: [link('main', 'child'), link('child', 'rdb')], flows: [flow(['child', 'rdb'], { kind: 'write', rate: 1.4 })] },
    },
    {
      short: 'COW',
      kind: 'insight',
      title: 'Copy-on-write: the hidden memory and latency cost',
      body: [
        '<code>fork()</code> copies the parent’s <b>page table</b>, not the data — but that copy takes time proportional to resident memory: roughly 10–20 ms per GB on bare metal, more on some hypervisors. With 32 GB, that is a <b>384 ms pause during which Redis serves nothing</b> — a latency spike visible as <code>latest_fork_usec</code> in <code>INFO</code>. Big instances and slow-fork hosts make this the dominant operational pain; keep instances to a few tens of GB (shard further) and measure fork time on your platform.',
        'After the fork, parent and child share pages until the parent <b>writes</b>; each first write to a shared page makes the kernel copy that 4 KB page (a page fault, adding write latency). The snapshot takes 32,000 MB ÷ 500 MB/s = 64 s, during which 20,000 writes/s each dirtying a random page copy up to 1.28 million pages ≈ <b>5.2 GB (16% extra memory)</b>. A write-heavy workload can nearly <b>double RSS</b> during a snapshot — if the machine lacks headroom it swaps or the OOM-killer fires. Provision for it, set <code>vm.overcommit_memory=1</code>, and disable transparent huge pages (a dirtied 2 MB page copies 2 MB per write).',
      ],
      changes: [{ text: '32 GB × 12 ms/GB = ~384 ms fork stall', tone: 'bad' }, { text: '20,000 writes/s × 64 s ≈ 5.2 GB of copied pages', tone: 'bad' }, { text: 'Headroom, overcommit=1, THP off', tone: 'good' }],
      concepts: [{ term: 'Copy-on-write', def: 'Parent and child share memory pages until one writes; the kernel then copies just that page, so a snapshot costs memory proportional to what changes during it.' }],
      scene: { nodes: [main({ state: 'hot', tag: pill('fork pause 384 ms', 'pause', 'warn') }), child({ tag: pill('+5.2 GB page copies', 'disk', 'warn') }), rdb()], links: [link('main', 'child'), link('child', 'rdb')], flows: [flow(['main', 'child'], { kind: 'heavy', rate: 2 }), flow(['child', 'rdb'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'AOF',
      kind: 'technique',
      title: 'The AOF: append every write, choose how often to fsync',
      body: [
        'With <code>appendonly yes</code> Redis appends each write command to the <b>AOF</b> in the RESP protocol format, so recovery replays the log. The key knob is <code>appendfsync</code>: <b><code>always</code></b> fsyncs after every command (strongest — and throughput falls to roughly <code>1 / fsync latency</code>, with group-commit-style batching across clients, see the ACID lesson), <b><code>everysec</code></b> (default) fsyncs once a second in a background thread — at most about <b>1 second of writes lost</b>, ≈ 20,000 here — and <code>no</code> leaves flushing to the OS (up to ~30 s).',
        'The log grows without bound (every <code>INCR</code> is a line), so Redis periodically <b>rewrites</b> it: a child forks (with the same fork and COW costs) and writes the <i>minimal</i> command set that reproduces the current dataset, while the parent buffers new writes into a temporary log that is then merged; Redis 7 uses a <b>multi-part AOF</b> (base + incremental files + manifest). At 20,000 commands/s × 100 B = 2 MB/s, an hour of tail is ~7.2 GB on top of a ~32 GB base. <b>Replay is slower than an RDB load</b> since it executes commands: about 490 s here versus 107 s for the snapshot.',
      ],
      changes: [{ text: 'everysec: lose ≈ 1 s (20,000 writes); always: fsync-limited throughput', tone: 'info' }, { text: 'Background rewrite compacts the log (another fork)', tone: 'info' }, { text: 'Replay ≈ 490 s vs RDB load ≈ 107 s', tone: 'bad' }],
      scene: { nodes: [clients(), main(), aof({ tag: pill('fsync everysec', 'clock') }), rec({ tag: pill('replay commands', 'refresh') })], links: [link('clients', 'main'), link('main', 'aof'), link('aof', 'rec', { style: 'dashed' })], flows: [flow(['clients', 'main', 'aof'], { kind: 'write', rate: 1.8 })] },
    },
    {
      short: 'Together',
      kind: 'tradeoff',
      title: 'Choosing a combination, and what restart looks like',
      body: [
        'Common settings: <b>cache only</b> — no persistence, accept a cold start; <b>durable-ish store</b> — AOF <code>everysec</code> plus periodic RDB (backups, off-box copy, fast cloning of replicas), with Redis 4+ <b>RDB preamble in the AOF</b> (<code>aof-use-rdb-preamble yes</code>) making rewrites a binary snapshot followed by a short command tail, so replay is nearly as fast as an RDB load; <b>maximum safety</b> — <code>always</code> and a replica set, paying in throughput. On restart Redis loads the AOF if enabled (it is more complete), else the RDB.',
        'Persistence is not high availability: a dead node is unavailable until restarted, so pair it with <b>replicas and automatic failover</b> (Sentinel or Cluster) — noting that asynchronous replication can also lose recent writes on failover (<code>WAIT</code> blocks until N replicas acknowledge). Operational checklist: monitor <code>rdb_last_bgsave_status</code>, <code>aof_last_write_status</code>, fork time, <code>mem_fragmentation_ratio</code> and disk space (a full disk stops writes if configured to); <b>test restores</b> regularly; run replicas with persistence so the primary doesn’t pay snapshot costs. Figures here are first-order model outputs.',
      ],
      changes: [{ text: 'AOF everysec + RDB preamble = bounded loss, fast replay', tone: 'good' }, { text: 'Persistence ≠ HA: add replicas + failover; test restores', tone: 'info' }],
      scene: { nodes: [main(), rdb({ tag: pill('backups, replicas', 'disk') }), aof({ tag: pill('RDB preamble + tail', 'list') }), rec({ tag: pill('load, then replay tail', 'refresh', 'good') })], links: [link('main', 'rdb', { style: 'dashed' }), link('main', 'aof'), link('aof', 'rec')], flows: [flow(['main', 'aof'], { kind: 'write', rate: 1.4 }), flow(['aof', 'rec'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Snapshots are compact and cheap to run; the log is precise',
      body: [
        '<b>RDB</b>: fork a child for a consistent snapshot — compact and fast to load, but loses everything since the last one, and the fork stalls Redis and copy-on-write consumes extra memory. <b>AOF</b>: log every write with an fsync policy — about 1 s loss at <code>everysec</code> — rewritten in the background, slower to replay.',
        'Combine them with an RDB-preamble AOF, provision memory headroom for COW, keep instances modest in size, and add replicas for availability.',
      ],
      scene: { nodes: [clients(), main(), child(), rdb(), aof()], links: [link('clients', 'main'), link('main', 'child'), link('child', 'rdb'), link('main', 'aof')], flows: [flow(['clients', 'main', 'aof'], { kind: 'write', rate: 1.6 })] },
    },
  ],
};

export default lesson;
