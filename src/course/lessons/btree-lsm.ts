import type { Lesson, SceneNode } from '../../types';
import { box, disk, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -11, 0, 'Writer', 'blue', 'server', { size: [1.4, 1.4], height: 40, ...extra });
const wal = (extra: Partial<SceneNode> = {}) => disk('wal', -3, 7, 'write-ahead log', { size: [3.2, 1.2], height: 16, tone: 'yellow', icon: 'list', ...extra });
const mem = (extra: Partial<SceneNode> = {}) => box('mem', -3, -4, 'Memory', 'green', 'cpu', { size: [1.6, 1.6], height: 36, ...extra });
const pages = (extra: Partial<SceneNode> = {}) => disk('pages', 7, 0, 'B-tree pages', { size: [3, 3], height: 26, tone: 'purple', icon: 'layers', ...extra });
const sst = (id: string, r: number, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  disk(id, r, d, name, { size: [1.5, 1.1], height: 16, tone: 'orange', icon: 'file', ...extra });
const l0 = [sst('s1', 5, -6, 'L0 · 64 MB'), sst('s2', 8, -4, 'L0 · 64 MB'), sst('s3', 11, -2, 'L0 · 64 MB')];
const l1 = (extra: Partial<SceneNode> = {}) => disk('l1', 9, 5, 'L1 · 640 MB', { size: [3.2, 1.6], height: 22, tone: 'orange', icon: 'layers', ...extra });

const lesson: Lesson = {
  slug: 'btree-lsm',
  title: 'B-Trees & LSM Trees',
  blurb: 'Inside the storage engine: why one design updates pages in place and the other never overwrites anything.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'writes', label: 'Writes / s', icon: 'activity' },
    { key: 'reads', label: 'Reads / lookup', icon: 'search' },
    { key: 'wamp', label: 'Write amp', icon: 'layers' },
    { key: 'durable', label: 'Durable', icon: 'shield' },
  ],
  goals: [
    { text: 'Why every engine starts with a write-ahead log', step: 2 },
    { text: 'How B-trees update pages in place', step: 4 },
    { text: 'How LSM trees turn writes into sequential appends', step: 5 },
    { text: 'Read paths, Bloom filters and compaction', step: 7 },
    { text: 'Read, write and space amplification trade-offs', step: 8 },
  ],
  legend: ['write', 'request', 'response', 'fail'],
  steps: [
    {
      short: 'The problem',
      kind: 'problem',
      title: 'Durable, fast, and searchable — pick how',
      body: [
        'A storage engine has to make each acknowledged write survive a power cut, keep data findable by key, and do both quickly. The tension: disks (even SSDs) are far happier with large <b>sequential</b> writes than with small random ones, but keeping data sorted for lookups naturally means writing all over the place.',
        'The two dominant designs resolve this tension in opposite ways.',
      ],
      scene: {
        nodes: [app({ tag: pill('PUT user:81', 'key') }), mem(), pages({ tag: pill('random I/O?', 'disk', 'warn') })],
        links: [link('app', 'mem'), link('mem', 'pages')],
        flows: [flow(['app', 'mem', 'pages'], { kind: 'write', rate: 2 })],
        metrics: { writes: '—', reads: '—', wamp: '—', durable: '?' },
      },
    },
    {
      short: 'WAL',
      kind: 'technique',
      title: 'Write-ahead log: append first, organise later',
      body: [
        'Both designs begin the same way. Before changing any data structure, the engine <b>appends</b> a record of the change to a log file and <code>fsync</code>s it. Appending is sequential and fast; once the record is on disk the write can be acknowledged.',
        'If the machine crashes, recovery replays the log to rebuild whatever hadn’t yet reached its final place. Grouping many transactions into one fsync — <b>group commit</b> — makes this cheap under load.',
      ],
      changes: [{ text: 'Every write: append + fsync', tone: 'good' }, { text: 'Crash → replay log', tone: 'good' }],
      concepts: [
        { term: 'Write-ahead log (WAL)', def: 'An append-only record of changes written durably before the data files are modified, used for crash recovery.' },
        { term: 'fsync', def: 'A system call that forces buffered file data to stable storage before returning.' },
      ],
      scene: {
        nodes: [app(), mem({ tag: pill('apply in RAM', 'cpu') }), wal({ tag: pill('append + fsync', 'shield', 'good') }), pages()],
        links: [link('app', 'wal'), link('app', 'mem'), link('mem', 'pages', { style: 'dashed', label: pill('later') })],
        flows: [flow(['app', 'wal'], { kind: 'write', rate: 3 }), flow(['app', 'mem'], { kind: 'write', rate: 3 })],
        metrics: { writes: '40k/s', reads: '—', wamp: '1×', durable: { v: 'yes', tone: 'good' } },
      },
    },
    {
      short: 'Buffer pool',
      kind: 'technique',
      title: 'B-tree engines: pages cached in memory',
      body: [
        'A B-tree engine (InnoDB, Postgres) stores the table and its indexes as fixed-size pages, typically 8–16 KB. Hot pages live in a memory <b>buffer pool</b>; a write modifies the page there and marks it dirty.',
        'Dirty pages are flushed back to their spot on disk later, in the background. A periodic <b>checkpoint</b> records how far the log has been applied to disk, so older log segments can be recycled.',
      ],
      concepts: [
        { term: 'Buffer pool', def: 'The engine’s in-memory cache of data and index pages.' },
        { term: 'Checkpoint', def: 'A point at which all changes up to a log position are known to be on disk, bounding recovery time.' },
      ],
      scene: {
        nodes: [app(), mem({ name: 'Buffer pool', tag: pill('dirty: 2,140 pages', 'layers') }), wal(), pages()],
        links: [link('app', 'wal'), link('app', 'mem'), link('mem', 'pages', { label: pill('flush dirty pages') })],
        flows: [flow(['app', 'wal'], { kind: 'write', rate: 3 }), flow(['app', 'mem'], { kind: 'write', rate: 3 }), flow(['mem', 'pages'], { kind: 'write', rate: 0.8 })],
        metrics: { writes: '40k/s', reads: '≈ 1–4 pages', wamp: '~3–10×', durable: 'yes' },
      },
    },
    {
      short: 'In place',
      kind: 'insight',
      title: 'Update in place, and split when full',
      body: [
        'Each key has exactly one home page. Updating it rewrites that page where it sits. When an insert lands on a full page, the page <b>splits</b> into two and the parent gains a pointer — sometimes cascading upward.',
        'Reads are excellent: one path from root to leaf, a single copy of each key. Writes are random — a 100-byte change can rewrite a whole 16 KB page — and some engines write pages twice to guard against torn writes.',
      ],
      note: { kind: 'key', text: 'B-trees are read-optimised: predictable lookups and range scans, at the cost of random writes and page-sized write amplification.' },
      changes: [{ text: '100 B change → 16 KB page write', tone: 'bad' }, { text: 'Lookup: one root-to-leaf path', tone: 'good' }],
      concepts: [{ term: 'Page split', def: 'Dividing a full B-tree page into two and updating the parent, to make room for an insert.' }],
      scene: {
        nodes: [app(), mem({ name: 'Buffer pool' }), wal(), pages({ tag: pill('page 8812 split', 'layers', 'warn') })],
        links: [link('app', 'wal'), link('app', 'mem'), link('mem', 'pages')],
        flows: [flow(['app', 'mem'], { kind: 'write', rate: 3 }), flow(['mem', 'pages'], { kind: 'write', rate: 2 }), flow(['app', 'mem', 'pages'], { back: true, rate: 1 })],
        metrics: { writes: '40k/s', reads: { v: '1 path', tone: 'good' }, wamp: { v: '~10×', tone: 'warn' }, durable: 'yes' },
      },
    },
    {
      short: 'LSM',
      kind: 'technique',
      title: 'LSM trees: never overwrite, only append',
      body: [
        'A <b>log-structured merge tree</b> (RocksDB, Cassandra, ScyllaDB) buffers writes in a sorted in-memory table, the <b>memtable</b>, backed by the WAL. When it reaches a size like 64 MB it’s written out in one sequential pass as an immutable, sorted file: an <b>SSTable</b>.',
        'Nothing on disk is ever modified. Updates and deletes are just newer entries (deletes are “tombstones”). Writes become large sequential streams, which is why LSM engines sustain far higher write rates on the same hardware.',
      ],
      changes: [{ text: 'Memtable → flush → SSTable', tone: 'good' }, { text: 'Writes 40k → 180k/s', tone: 'good' }],
      concepts: [
        { term: 'LSM tree', def: 'A storage design that buffers writes in memory and flushes them as immutable sorted files merged in the background.' },
        { term: 'SSTable', def: 'Sorted String Table: an immutable file of key-value pairs sorted by key.' },
        { term: 'Tombstone', def: 'A marker recording that a key was deleted, removed later during compaction.' },
      ],
      scene: {
        nodes: [app(), mem({ name: 'Memtable', tag: pill('sorted, 64 MB', 'list') }), wal(), ...l0],
        links: [link('app', 'wal'), link('app', 'mem'), link('mem', 's1', { label: pill('flush') }), link('mem', 's2', { style: 'dashed' })],
        flows: [flow(['app', 'wal'], { kind: 'write', rate: 5 }), flow(['app', 'mem'], { kind: 'write', rate: 5 }), flow(['mem', 's1'], { kind: 'heavy', rate: 0.5 })],
        metrics: { writes: { v: '180k/s', tone: 'good' }, reads: '—', wamp: '~1× (so far)', durable: 'yes' },
      },
    },
    {
      short: 'Reads',
      kind: 'tradeoff',
      title: 'Reading means checking many places',
      body: [
        'A key could be in the memtable or in <i>any</i> SSTable, and the newest version wins. A naive lookup checks the memtable, then every file from newest to oldest — many disk reads for one key.',
        'Each SSTable therefore carries a <b>Bloom filter</b> (“definitely not here” in a few bits per key) and a sparse index. Most files are ruled out without touching disk. Range scans still have to merge from several files at once.',
      ],
      changes: [{ text: 'Lookup checks memtable + N files', tone: 'bad' }, { text: 'Bloom filters skip ~99% of misses', tone: 'good' }],
      scene: {
        nodes: [app({ tag: pill('GET user:81', 'search') }), mem({ name: 'Memtable' }), wal({ state: 'dim' }), sst('s1', 5, -6, 'L0', { tag: pill('bloom: no', 'filter') }), sst('s2', 8, -4, 'L0', { tag: pill('bloom: no', 'filter') }), sst('s3', 11, -2, 'L0', { tag: pill('found', 'check', 'good') }), l1({ state: 'dim' })],
        links: [link('app', 'mem'), link('mem', 's1', { style: 'dashed' }), link('mem', 's2', { style: 'dashed' }), link('mem', 's3')],
        flows: [flow(['app', 'mem', 's3'], { back: true, rate: 1.2 })],
        metrics: { writes: '180k/s', reads: { v: '1–3 files', tone: 'warn' }, wamp: '~1×', durable: 'yes' },
      },
    },
    {
      short: 'Compaction',
      kind: 'technique',
      title: 'Compaction: merging in the background',
      body: [
        'Background <b>compaction</b> merges SSTables into larger, non-overlapping ones on the next level, dropping overwritten values and expired tombstones. Fewer files means faster reads and reclaimed disk.',
        'But each byte may be rewritten as it moves down every level — write amplification of 10–30× is normal. If writes outpace compaction, files pile up, reads slow, and the engine eventually <b>stalls writes</b> to catch up.',
      ],
      note: { kind: 'warn', text: 'Compaction debt is the classic LSM incident: fine for hours, then latency spikes and write stalls. Monitor pending compaction bytes and L0 file count.' },
      changes: [{ text: '3 × L0 → merged into L1', tone: 'good' }, { text: 'Write amp ~10–30×', tone: 'bad' }],
      concepts: [{ term: 'Compaction', def: 'Merging LSM files to remove obsolete entries and keep the number of files per lookup low.' }],
      scene: {
        nodes: [app(), mem({ name: 'Memtable' }), wal({ state: 'dim' }), ...l0.map((n) => ({ ...n, state: 'ghost' as const })), l1({ tag: pill('compacting', 'refresh', 'warn') })],
        links: [link('app', 'mem'), link('s1', 'l1'), link('s2', 'l1'), link('s3', 'l1')],
        flows: [flow(['s1', 'l1'], { kind: 'write', rate: 1.2 }), flow(['s2', 'l1'], { kind: 'write', rate: 1.2 }), flow(['s3', 'l1'], { kind: 'write', rate: 1.2 }), flow(['app', 'mem'], { kind: 'write', rate: 3 })],
        metrics: { writes: '180k/s', reads: { v: '1–2 files', tone: 'good' }, wamp: { v: '~20×', tone: 'warn' }, durable: 'yes' },
      },
    },
    {
      short: 'Trade-off',
      kind: 'tradeoff',
      title: 'Read, write and space amplification',
      body: [
        'Every engine picks a point among three costs. <b>Read amplification</b>: disk reads per lookup. <b>Write amplification</b>: bytes written per byte stored. <b>Space amplification</b>: disk used per byte of live data.',
        'B-trees favour reads and predictable latency — the default for OLTP databases. LSM trees favour write throughput and compression — the default for write-heavy, time-series and large key-value workloads. Tuning (compaction style, page size, fill factor) slides each one along the curve.',
      ],
      concepts: [{ term: 'RUM conjecture', def: 'A storage structure can optimise for at most two of read, update (write) and memory/space overheads.' }],
      scene: {
        nodes: [
          box('bt', -5, 0, 'B-tree', 'purple', 'layers', { tag: pill('reads ✓ · writes ✗', 'search') , label: pill('Postgres, InnoDB') }),
          box('lsm', 5, 0, 'LSM', 'orange', 'file', { tag: pill('writes ✓ · reads ~', 'activity'), label: pill('RocksDB, Cassandra') }),
        ],
        links: [link('bt', 'lsm', { arrow: 'both', style: 'dashed', label: pill('pick your amplification', 'scale') })],
        metrics: { writes: 'LSM ↑', reads: 'B-tree ↓', wamp: 'both pay', durable: 'both' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Two answers to the same question',
      body: [
        'Both engines make writes durable with a <b>WAL</b>. <b>B-trees</b> then update fixed pages in place: fast, predictable reads, random writes. <b>LSM trees</b> buffer in a memtable and flush immutable SSTables: fast sequential writes, reads helped by Bloom filters, and compaction to pay back the debt.',
        'Choose by workload, and watch the engine-specific failure mode: page-level contention and bloat for B-trees, compaction debt for LSMs.',
      ],
      scene: {
        nodes: [app(), mem({ name: 'Memtable' }), wal({ tag: pill('always first', 'shield', 'good') }), sst('s1', 5, -6, 'L0'), sst('s2', 8, -4, 'L0'), l1()],
        links: [link('app', 'wal'), link('app', 'mem'), link('mem', 's1'), link('s1', 'l1'), link('s2', 'l1')],
        flows: [flow(['app', 'wal'], { kind: 'write', rate: 3 }), flow(['app', 'mem'], { kind: 'write', rate: 3 }), flow(['s2', 'l1'], { kind: 'write', rate: 0.6 })],
        metrics: { writes: '180k/s', reads: '1–2 files', wamp: '~20×', durable: 'yes' },
      },
    },
  ],
};

export default lesson;
