import type { Lesson, SceneNode } from '../../types';
import { box, crowd, disk, flow, link, pill } from '../kit';

const prod = (extra: Partial<SceneNode> = {}) => crowd('prod', -16, 0, 10, 'producers', extra);
const broker = (extra: Partial<SceneNode> = {}) => box('broker', -6, 0, 'Broker', 'blue', 'server', { size: [1.5, 1.5], height: 30, ...extra });
const cache = (extra: Partial<SceneNode> = {}) => box('cache', 3, -6, 'OS page cache (RAM)', 'orange', 'layers', { size: [1.4, 1.4], height: 24, ...extra });
const log = (extra: Partial<SceneNode> = {}) => disk('log', 3, 6, 'Append-only log segment', { size: [3, 1.2], height: 18, tone: 'yellow', icon: 'list', ...extra });
const cons = (extra: Partial<SceneNode> = {}) => box('cons', 14, 0, 'Consumers', 'purple', 'cpu', { size: [1.4, 1.4], height: 28, ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`);
const fmtMB = (b: number): string => (b >= 1000 ? `${(b / 1000).toFixed(2)} GB/s` : b >= 10 ? `${Math.round(b)} MB/s` : `${b.toFixed(1)} MB/s`);

const lesson: Lesson = {
  slug: 'source-why-is-kafka-fast',
  title: 'Why Kafka Is Fast: Sequential I/O, Page Cache, Zero-Copy and Batching',
  blurb: 'A disk-based log that outruns many in-memory systems — by never seeking, letting the OS cache do the work, skipping copies, and amortising every per-request cost across batches.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'ratio', label: 'Sequential vs random write bandwidth', icon: 'gauge' },
    { key: 'one', label: 'One message per request', icon: 'activity' },
    { key: 'batched', label: 'With batching + compression', icon: 'bolt' },
    { key: 'speed', label: 'Batching speed-up', icon: 'check' },
  ],
  goals: [
    { text: 'Why sequential disk access is orders of magnitude faster than random', step: 1 },
    { text: 'How the append-only log turns every write into a sequential one', step: 2 },
    { text: 'Reading from the OS page cache instead of managing a cache', step: 3 },
    { text: 'Zero-copy sends with sendfile', step: 4 },
    { text: 'Batching and compression: amortising per-request costs', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'seq', label: 'Disk sequential bandwidth', min: 50, max: 7000, step: 50, default: 150, unit: ' MB/s', description: '~150 for a spinning disk, 500–3,000+ for SSD/NVMe.' },
      { key: 'iops', label: 'Disk random 4 KB IOPS', min: 50, max: 1000000, step: 50, default: 150, unit: '', description: '~150 for a spinning disk, 50k–1M for SSD/NVMe.' },
      { key: 'size', label: 'Message size', min: 50, max: 10000, step: 50, default: 1000, unit: ' B', description: 'Uncompressed payload size.' },
      { key: 'batch', label: 'Messages per batch', min: 1, max: 10000, step: 1, default: 100, unit: '', description: 'Messages the producer groups into one request.' },
      { key: 'ovh', label: 'Fixed cost per request', min: 20, max: 2000, step: 10, default: 300, unit: ' µs', description: 'Network round trip, syscall, protocol and acknowledgement overhead per request.' },
      { key: 'comp', label: 'Compression ratio', min: 1, max: 8, step: 0.5, default: 3, unit: '×', description: 'How much smaller batched, compressed data is on the wire and on disk.' },
    ],
    calculate: (input, step) => {
      const seq = Math.max(1, input.seq ?? 150);
      const iops = Math.max(1, input.iops ?? 150);
      const size = Math.max(1, input.size ?? 1000);
      const batch = Math.max(1, Math.round(input.batch ?? 100));
      const ovh = Math.max(1, input.ovh ?? 300) / 1e6;
      const comp = Math.max(1, input.comp ?? 3);
      const randMB = (iops * 4096) / 1e6;
      const perBatch = (b: number, c: number) => ovh + (b * size) / c / (seq * 1e6);
      const one = 1 / perBatch(1, 1);
      const batched = batch / perBatch(batch, comp);
      return {
        ratio: step < 1 ? { v: '—' } : { v: `${(seq / randMB).toFixed(0)}× (${seq} vs ${randMB.toFixed(randMB < 10 ? 1 : 0)} MB/s)`, tone: seq / randMB > 20 ? 'good' : 'warn' },
        one: step < 4 ? { v: '—' } : { v: `${fmtN(one)} msgs/s (${fmtMB((one * size) / 1e6)})`, tone: 'warn' },
        batched: step < 4 ? { v: '—' } : { v: `${fmtN(batched)} msgs/s (${fmtMB((batched * size) / 1e6)})`, tone: 'good' },
        speed: step < 4 ? { v: '—' } : { v: `${(batched / one).toFixed(0)}×`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Sequential',
      kind: 'insight',
      title: 'Disks are slow at random access, fast at sequential',
      body: [
        'A spinning disk must <b>physically move a head</b> to each new location: ~150 random 4 KB operations a second is only <b>0.6 MB/s</b>. Reading or writing consecutive blocks needs no seeking: ~150 MB/s — <b>250× more</b>. SSDs narrow the gap (no moving parts) but sequential access still wins, because of larger internal transfers, less write amplification and better prefetching.',
        'So disk-based systems fast enough to rival memory ones are designed so that <i>every access is sequential</i>. The cost model flips from “disks are slow” to “random access is slow; streaming is nearly as fast as RAM bandwidth you actually need”. Kafka is built on that single observation.',
      ],
      changes: [{ text: 'HDD: 150 random IOPS × 4 KB = 0.6 MB/s vs 150 MB/s sequential', tone: 'info' }],
      scene: { nodes: [box('rand', -8, 0, 'Random: seek, seek, seek', 'red', 'clock', { size: [1.4, 1.4], height: 22, tag: pill('0.6 MB/s', 'alert', 'warn') }), box('seq', 8, 0, 'Sequential: stream', 'green', 'bolt', { size: [1.4, 1.4], height: 26, tag: pill('150 MB/s', 'check', 'good') })], links: [], flows: [] },
    },
    {
      short: 'Log',
      kind: 'technique',
      title: 'An append-only log makes every write sequential',
      body: [
        'A Kafka partition is a <b>log</b>: messages are only ever <b>appended to the end</b> of a segment file and read by offset. There is no in-place update, no index maintenance on write, no B-tree page splits — a produce is “write these bytes at the end”, which the disk does as one sequential stream. Old data is removed by <b>deleting whole segment files</b> (retention), not row by row.',
        'Offsets are a position in the file, so a read at offset N is a sparse index lookup plus a sequential scan. Replication is the same: followers fetch the log sequentially. The data structure was chosen so that the access pattern matches what storage does best.',
      ],
      changes: [{ text: 'Append at the tail · read by offset · delete whole segments', tone: 'good' }],
      scene: { nodes: [prod(), broker(), log({ tag: pill('append at the end', 'check', 'good') })], links: [link('prod', 'broker'), link('broker', 'log')], flows: [flow(['prod', 'broker', 'log'], { kind: 'write', rate: 2.5 })] },
    },
    {
      short: 'Page cache',
      kind: 'technique',
      title: 'Let the operating system cache the log',
      body: [
        'Kafka doesn’t keep its own cache in the JVM heap. It writes through to the file system and relies on the OS <b>page cache</b>: recently written data sits in free RAM, and consumers reading near the head of the log — the common case — are served <b>from memory without touching the disk</b>. Writes are acknowledged once in the page cache and flushed to disk asynchronously (durability comes from replication across brokers, not per-write <code>fsync</code>).',
        'Benefits: no double-buffering, no garbage-collection cost for cached data (see the GC lesson), and the cache survives a Kafka restart. The sizing rule: leave lots of RAM <b>outside</b> the heap for the page cache, so “hot” data (the last few minutes of each partition) fits. A consumer that lags far behind forces disk reads — still sequential, still fast, but it evicts hot pages for others.',
      ],
      changes: [{ text: 'Tail reads served from RAM; no heap cache', tone: 'good' }, { text: 'Durability from replication, not fsync per write', tone: 'info' }],
      scene: { nodes: [broker(), cache({ tag: pill('recent data in RAM', 'check', 'good') }), log({ tag: pill('flushed lazily', 'clock') }), cons({ tag: pill('tail reads from cache', 'bolt') })], links: [link('broker', 'cache'), link('cache', 'log', { style: 'dashed' }), link('cache', 'cons')], flows: [flow(['broker', 'cache', 'cons'], { rate: 2.5 })] },
    },
    {
      short: 'Zero-copy',
      kind: 'technique',
      title: 'Zero-copy: skip the trips through user space',
      body: [
        'Sending log data to a consumer the naive way copies it four times and switches into the kernel twice: disk → <b>page cache</b> → <b>application buffer</b> → <b>socket buffer</b> → <b>NIC</b>. The broker never needs to inspect most of those bytes — they’re an opaque batch that was written and will be read unchanged. Kafka uses the <b>sendfile</b> system call: the kernel moves data from the page cache straight to the network card (DMA), <b>two copies and no user-space round trip</b>.',
        'That removes CPU work, memory-bandwidth pressure and cache pollution per byte served — so one broker can saturate a 10 Gbps NIC while using little CPU. It works because the on-disk and on-the-wire formats are the <b>same</b> (a batch of messages), so nothing has to be re-encoded. (With TLS the kernel must encrypt in user space or via kTLS, which loses part of this benefit.)',
      ],
      changes: [{ text: 'Naive: 4 copies, 2 context switches · sendfile: 2 DMA copies', tone: 'good' }, { text: 'Same format on disk and on the wire', tone: 'info' }],
      concepts: [{ term: 'Zero-copy (sendfile)', def: 'Transferring file data to a socket inside the kernel, without copying it into user-space buffers.' }],
      scene: { nodes: [box('pc', -8, 0, 'Page cache', 'orange', 'layers', { size: [1.3, 1.3], height: 22 }), box('nic', 6, 0, 'NIC', 'blue', 'globe', { size: [1.3, 1.3], height: 24, tag: pill('DMA straight from the cache', 'bolt', 'good') }), box('app', -1, -7, 'Broker process', 'grey', 'cpu', { size: [1.2, 1.2], height: 18, tag: pill('not in the data path', 'pause') })], links: [link('pc', 'nic', { arrow: 'end' }), link('app', 'pc', { style: 'dashed' })], flows: [flow(['pc', 'nic'], { rate: 3 })] },
    },
    {
      short: 'Batching',
      kind: 'technique',
      title: 'Batching amortises every fixed cost',
      body: [
        'Each request carries fixed costs — a network round trip, a syscall, protocol framing, an acknowledgement — independent of its size. Sending messages one at a time pays that for <i>every</i> message: at 300 µs of overhead and 1 KB messages, one-per-request tops out near <b>3,300 messages/s</b> (3 MB/s), far below the disk. <b>Batching</b> groups many messages per request: 100 per batch pays the overhead once, and with 3× compression on a 150 MB/s disk reaches ~<b>190,000 messages/s</b> (~190 MB/s) — about a <b>59× speed-up</b>.',
        'Producers batch by size and a small time limit (<code>batch.size</code>, <code>linger.ms</code>); compression (snappy, lz4, zstd) is applied <i>per batch</i>, so it works better the bigger the batch, cuts network and disk bytes, and the broker stores the compressed batch as-is. The trade-off is a few milliseconds of added latency for throughput; consumers also fetch in batches. The sliders show how overhead, batch size and compression combine.',
      ],
      changes: [{ text: 'throughput = batch ÷ (overhead + batch × size ÷ compression ÷ bandwidth)', tone: 'info' }, { text: '1 per request: ~3k/s · batch 100 + compression: ~190k/s', tone: 'good' }],
      scene: { nodes: [prod({ tag: pill('batch + compress', 'layers') }), broker({ tag: pill('one request, 100 messages', 'check', 'good') }), log()], links: [link('prod', 'broker'), link('broker', 'log')], flows: [flow(['prod', 'broker', 'log'], { kind: 'write', rate: 3 })] },
    },
    {
      short: 'Partitions',
      kind: 'technique',
      title: 'Partitions spread the log across disks, brokers and consumers',
      body: [
        'A single sequential log is bounded by one disk and one thread. A topic is split into <b>partitions</b>, each its own log on some broker; producers choose a partition by key or round-robin, and each partition’s writes stay sequential. Throughput scales with partitions × brokers; consumers in a group split partitions for parallel reading (see the Kafka lesson for sizing).',
        'Ordering is guaranteed only <i>within</i> a partition — the price of the parallelism — and adding partitions later changes key-to-partition mapping. Design keys so related events share a partition. Remember what <i>isn’t</i> the reason for speed: no magic, just matching the workload to hardware strengths. Figures here are model outputs for illustration, not benchmarks.',
      ],
      scene: { nodes: [prod(), broker({ name: 'Broker 1' }), box('b2', -6, 7, 'Broker 2', 'blue', 'server', { size: [1.5, 1.5], height: 30 }), cons()], links: [link('prod', 'broker'), link('prod', 'b2'), link('broker', 'cons'), link('b2', 'cons')], flows: [flow(['prod', 'broker', 'cons'], { rate: 2 }), flow(['prod', 'b2', 'cons'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Match the workload to what hardware does best',
      body: [
        'Kafka is fast because it <b>appends sequentially</b> (hundreds of times faster than random), <b>leans on the OS page cache</b>, uses <b>zero-copy</b> sends, and <b>batches and compresses</b> to amortise fixed per-request costs — then scales out with partitions.',
        'Each idea is portable: prefer sequential I/O, batch small operations, avoid unnecessary copies, and let the OS cache what it is best at.',
      ],
      scene: { nodes: [prod(), broker(), cache(), log(), cons()], links: [link('prod', 'broker'), link('broker', 'cache'), link('cache', 'log', { style: 'dashed' }), link('cache', 'cons')], flows: [flow(['prod', 'broker', 'cache', 'cons'], { rate: 2 })] },
    },
  ],
};

export default lesson;
