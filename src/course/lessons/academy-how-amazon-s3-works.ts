import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -17, 0, 10, 'clients (PUT / GET / LIST)', extra);
const front = (extra: Partial<SceneNode> = {}) => box('front', -9, 0, 'Front-end fleet (auth, routing)', 'orange', 'route', { size: [1.4, 1.4], height: 28, ...extra });
const index = (extra: Partial<SceneNode> = {}) => db('index', 0, -6, 'Metadata index (key → location)', { size: [1.4, 1.4], ...extra });
const store = (extra: Partial<SceneNode> = {}) => disk('store', 3, 6, 'Storage nodes (data shards)', { size: [3, 1.2], height: 16, tone: 'yellow', icon: 'list', ...extra });
const part = (i: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`p${i}`, 9, -9 + i * 4.2, name, 'blue', 'layers', { size: [1.2, 1.1], height: 18, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(1)} s`);

const lesson: Lesson = {
  slug: 'academy-how-amazon-s3-works',
  title: 'How an Object Store Works: Keys, Metadata and Partitions',
  blurb: 'A flat namespace of immutable objects behind an HTTP API: separate metadata and data paths, key-range partitioning that scales by splitting hot ranges — and what that means for key design and request rates.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'cap', label: 'Request ceiling across the key space', icon: 'gauge' },
    { key: 'need', label: 'Partitions the workload needs', icon: 'layers' },
    { key: 'hot', label: 'Load on the hottest key range', icon: 'alert' },
    { key: 'list', label: 'Time to LIST a big prefix', icon: 'clock' },
    { key: 'mpu', label: 'Parts in a multipart upload', icon: 'file' },
  ],
  goals: [
    { text: 'Buckets, keys and immutable objects: the data model', step: 1 },
    { text: 'Separating the metadata index from the data path', step: 2 },
    { text: 'Key-range partitioning and automatic splitting', step: 3 },
    { text: 'Why key naming and request spread matter', step: 4 },
    { text: 'Multipart uploads, consistency and lifecycle', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'rps', label: 'Read requests per second needed', min: 100, max: 5000000, step: 100, default: 200000, unit: '/s', description: 'GET/HEAD rate for the whole workload.' },
      { key: 'per', label: 'Reads one key range can serve', min: 1000, max: 50000, step: 500, default: 5500, unit: '/s', description: 'Illustrative per-partition read ceiling (published guidance is of this order).' },
      { key: 'prefixes', label: 'Distinct key ranges your keys spread over', min: 1, max: 100000, step: 1, default: 20, unit: '', description: 'How many ranges your key naming creates load across.' },
      { key: 'skew', label: 'Share of traffic on the hottest range', min: 1, max: 100, step: 1, default: 40, unit: '%', description: 'Concentration, e.g. a date-prefixed key where “today” gets most writes.' },
      { key: 'objs', label: 'Objects under a prefix to LIST', min: 1000, max: 10000000000, step: 1000, default: 100000000, unit: '', description: 'Objects a single LIST traversal would enumerate.' },
      { key: 'page', label: 'Objects per LIST page', min: 100, max: 10000, step: 100, default: 1000, unit: '', description: 'Page size of one LIST response.' },
      { key: 'size', label: 'Large object size', min: 1, max: 5000, step: 1, default: 100, unit: ' GB', description: 'Object to upload with multipart.' },
      { key: 'part', label: 'Part size', min: 5, max: 5000, step: 5, default: 100, unit: ' MB', description: 'Size of each upload part.' },
    ],
    calculate: (input, step) => {
      const rps = Math.max(1, input.rps ?? 2e5);
      const per = Math.max(1, input.per ?? 5500);
      const prefixes = Math.max(1, Math.round(input.prefixes ?? 20));
      const skew = Math.min(1, Math.max(1 / prefixes, (input.skew ?? 40) / 100));
      const objs = Math.max(1, input.objs ?? 1e8);
      const page = Math.max(1, input.page ?? 1000);
      const size = Math.max(0.001, input.size ?? 100) * 1000;
      const part = Math.max(1, input.part ?? 100);
      const ceiling = prefixes * per;
      const need = Math.ceil(rps / per);
      const hot = (rps * skew) / per;
      // LIST is sequential: one page after another (about 20 ms each).
      const listT = (objs / page) * 0.02;
      const parts = Math.ceil(size / part);
      return {
        cap: step < 3 ? { v: '—' } : { v: `${fmtN(ceiling)}/s (${prefixes} ranges × ${fmtN(per)})`, tone: ceiling >= rps ? 'good' : 'bad' },
        need: step < 3 ? { v: '—' } : { v: `${fmtN(need)} (you spread over ${prefixes})`, tone: prefixes >= need ? 'good' : 'bad' },
        hot: step < 3 ? { v: '—' } : { v: `${hot.toFixed(1)}× one range’s capacity`, tone: hot <= 1 ? 'good' : hot <= 3 ? 'warn' : 'bad' },
        list: step < 4 ? { v: '—' } : { v: `${fmtT(listT)} (${fmtN(objs / page)} sequential pages)`, tone: listT < 60 ? 'good' : 'warn' },
        mpu: step < 4 ? { v: '—' } : { v: `${fmtN(parts)} parts of ${part} MB${parts > 10000 ? ' (exceeds the 10,000-part limit)' : ''}`, tone: parts > 10000 ? 'bad' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Model',
      kind: 'insight',
      title: 'A flat namespace of immutable objects',
      body: [
        'An object store (Amazon S3, Google Cloud Storage, Azure Blob, MinIO) offers a deliberately small model: <b>buckets</b> containing <b>objects</b> addressed by a <b>key</b> — a string such as <code>logs/2025/11/19/app-17.gz</code>. There are no real directories (the slashes are just characters; “folders” are a console convention over <b>prefixes</b>), no in-place updates, no file locking. You <code>PUT</code> a whole object, <code>GET</code> it (optionally a byte range), <code>DELETE</code> it, and <code>LIST</code> keys by prefix.',
        'Objects are <b>immutable</b> — overwriting creates a new version of the key — and carry user metadata, a content type and an ETag. That simplicity is what lets the system scale to trillions of objects and exabytes with very high durability (see the Eleven Nines lesson): the API is cheap to distribute, cache and replicate.',
      ],
      scene: { nodes: [clients(), front({ tag: pill('HTTP: PUT · GET · LIST · DELETE', 'globe') }), index(), store()], links: [link('clients', 'front'), link('front', 'index'), link('front', 'store')], flows: [flow(['clients', 'front', 'store'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Two paths',
      kind: 'technique',
      title: 'Metadata and data take different paths',
      body: [
        'A request passes through a <b>front-end fleet</b> (TLS, authentication, authorisation against bucket policy, request routing, throttling) and then splits. The <b>metadata path</b> consults an <b>index</b> — a huge, sharded, strongly-consistent key–value store mapping <code>(bucket, key, version) → object metadata and the location of its data</code>. The <b>data path</b> reads or writes the object’s bytes, which are stored redundantly (replicated or erasure-coded) across many <b>storage nodes</b> in several availability zones.',
        'A PUT writes the data durably first, then commits the <b>metadata entry</b> that makes the object visible; a GET looks up the location and streams bytes from a storage node (large objects are read in parallel byte ranges). Separating the two lets each scale independently — the index is optimised for small, hot, strongly consistent records; storage nodes for cheap capacity and throughput — and lets durability be handled by the data layer alone. Modern object stores give <b>strong read-after-write consistency</b> for objects and listings.',
      ],
      changes: [{ text: 'Index: key → location (small, hot, consistent)', tone: 'info' }, { text: 'Storage nodes: bytes, replicated or erasure-coded', tone: 'info' }, { text: 'PUT: data durable first, then metadata commit', tone: 'good' }],
      scene: { nodes: [front(), index({ tag: pill('key → shards on nodes A, B, C', 'hash') }), store({ tag: pill('data, across zones', 'disk') }), clients()], links: [link('clients', 'front'), link('front', 'index', { arrow: 'both' }), link('front', 'store', { arrow: 'both' })], flows: [flow(['clients', 'front', 'index'], { rate: 1.2, back: true }), flow(['front', 'store'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Partitions',
      kind: 'technique',
      title: 'Key-range partitions that split as they heat up',
      body: [
        'The index is <b>range-partitioned by key</b> (see the Partitioning lesson): contiguous ranges of the sorted key space (<code>a…f</code>, <code>f…m</code>, …) each live on a partition served by dedicated machines. Range partitioning keeps <b>LIST by prefix</b> efficient (a prefix is a contiguous range) but means that a request’s cost lands on the partition owning its key.',
        'The system watches load and <b>automatically splits a hot range</b> into two partitions on different machines, and merges cold ones, so capacity follows demand without operator action. A partition can serve on the order of thousands of requests per second (the illustrative 5,500 reads/s here); the total ceiling is <code>partitions × per-partition rate</code>. Splitting takes minutes — so a sudden spike on a brand-new range can briefly see <b>throttling (HTTP 503 Slow Down)</b> until the split completes.',
      ],
      changes: [{ text: 'Sorted key ranges → partitions; hot ranges split automatically', tone: 'good' }, { text: 'Spikes may see 503 Slow Down until a split finishes', tone: 'bad' }],
      scene: { nodes: [front(), part(0, 'a…f'), part(1, 'f…m', { state: 'hot', tag: pill('hot → split', 'alert', 'warn') }), part(2, 'm…s'), part(3, 's…z')], links: [link('front', 'p0'), link('front', 'p1'), link('front', 'p2'), link('front', 'p3')], flows: [flow(['front', 'p1'], { kind: 'heavy', rate: 3 }), flow(['front', 'p0'], { rate: 0.6 })] },
    },
    {
      short: 'Key design',
      kind: 'problem',
      title: 'Key naming decides how evenly load spreads',
      body: [
        'Because ranges map to partitions, keys that <b>sort together land together</b>. A date-prefixed key (<code>2025-11-19/…</code>) sends all of today’s writes to one range — the hottest one is a <b>sequential-key hot spot</b>. If 40% of 200,000 reads/s hit one range of 5,500/s, that range is asked for <b>14.5×</b> its capacity and throttles, while other ranges idle: total demand 200,000/s needs ≥ 37 ranges, but only 20 exist and skew wastes them.',
        'Fixes: put a <b>high-cardinality, evenly distributed element early in the key</b> — a short hash of the id (<code>a3/…</code>) or a reversed id — so traffic spreads across many ranges; keep related objects findable with a secondary index (a database or manifest) instead of relying on prefixes; spread reads with <b>CloudFront/CDN caching</b> and ranged GETs in parallel; and retry throttled requests with exponential backoff and jitter. Ramp load gradually to let partitions split. (Hash prefixes trade away cheap prefix listing.)',
      ],
      changes: [{ text: 'Sequential or date-first keys → hot range → 503s', tone: 'bad' }, { text: 'Hash prefix spreads load; index for discovery', tone: 'good' }],
      scene: { nodes: [clients({ tag: pill('keys: 2025-11-19/…', 'alert', 'warn') }), front(), part(0, '2025-11-18', { load: 5 }), part(1, '2025-11-19', { state: 'hot', load: 100 }), part(2, '2025-11-20', { load: 5 })], links: [link('clients', 'front'), link('front', 'p0'), link('front', 'p1'), link('front', 'p2')], flows: [flow(['front', 'p1'], { kind: 'heavy', rate: 4 }), flow(['front', 'p0'], { rate: 0.4 })] },
    },
    {
      short: 'LIST & multipart',
      kind: 'technique',
      title: 'LIST, multipart upload and lifecycle',
      body: [
        '<b>LIST</b> returns keys in sorted order, one page at a time (up to 1,000), with a continuation token — inherently sequential per prefix, so enumerating 100 million objects is 100,000 pages ≈ <b>33 minutes</b> at 20 ms each. For large buckets use an <b>inventory report</b> (a daily file of all keys) rather than LIST, or parallelise across prefixes. <b>Multipart upload</b> splits a large object into <b>parts</b> uploaded in parallel and retried independently, then assembled by a final commit: 100 GB in 100 MB parts is 1,000 parts (the limit is 10,000, so part size must be at least object size ÷ 10,000), and an abandoned upload should be cleaned up by a lifecycle rule.',
        '<b>Lifecycle rules</b> move objects between storage classes (frequent → infrequent → archive) and expire them by age or prefix; <b>versioning</b> keeps old versions (and makes delete a marker); <b>replication</b> copies objects across regions. Because objects are immutable and metadata is separate, features like these are policy over the index, not changes to the data. Figures here are model outputs with illustrative per-partition limits; check your provider’s current guidance.',
      ],
      changes: [{ text: 'LIST is sequential: 100M objects ≈ 33 min — use inventory', tone: 'bad' }, { text: 'Multipart: parallel parts, retry each; ≤ 10,000 parts', tone: 'good' }],
      scene: { nodes: [clients({ tag: pill('100 GB: 1,000 × 100 MB parts', 'layers') }), front({ tag: pill('assemble on complete', 'check') }), store()], links: [link('clients', 'front'), link('front', 'store')], flows: [flow(['clients', 'front', 'store'], { kind: 'write', rate: 3 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Immutable objects, a range-partitioned index, spread your keys',
      body: [
        'An object store is a <b>flat namespace of immutable objects</b>: a front end, a <b>sharded, consistent metadata index</b> (key → location) and <b>redundant storage nodes</b>. The index is <b>range-partitioned</b> and splits hot ranges automatically; total throughput is partitions × per-partition rate.',
        'Spread keys across ranges (hash early in the key), avoid sequential hot spots, back off on 503s, use inventory instead of big LISTs, and multipart for large uploads.',
      ],
      scene: { nodes: [clients(), front(), index(), store()], links: [link('clients', 'front'), link('front', 'index', { arrow: 'both' }), link('front', 'store', { arrow: 'both' })], flows: [flow(['clients', 'front', 'index'], { rate: 1.5, back: true })] },
    },
  ],
};

export default lesson;
