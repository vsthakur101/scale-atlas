import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const agents = (extra: Partial<SceneNode> = {}) => crowd('agents', -14, 0, 12, 'metric sources', extra);
const head = (extra: Partial<SceneNode> = {}) => box('head', -3, 0, 'In-memory head', 'orange', 'bolt', { size: [1.5, 1.5], height: 34, ...extra });
const wal = (extra: Partial<SceneNode> = {}) => disk('wal', -3, 8, 'WAL', { size: [2.6, 1.1], height: 16, tone: 'grey', ...extra });
const blocks = (extra: Partial<SceneNode> = {}) => disk('blocks', 9, 0, 'Immutable blocks', { size: [3, 1.2], height: 22, tone: 'yellow', icon: 'list', ...extra });

const fmtB = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB` : `${Math.round(b / 1e6)} MB`);
const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-time-series-db-tsdb-in-20-lines',
  title: 'Time-Series Databases',
  blurb: 'Why append-only metric data wants its own storage engine: series and labels, head block and WAL, delta-of-delta compression, cardinality and downsampling.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'rate', label: 'Ingest rate', icon: 'activity' },
    { key: 'day', label: 'Stored per day (compressed)', icon: 'disk' },
    { key: 'ratio', label: 'Compression vs 16 B/point', icon: 'gauge' },
    { key: 'ret', label: 'Total over retention', icon: 'layers' },
    { key: 'mem', label: 'Memory for active series', icon: 'cpu' },
  ],
  goals: [
    { text: 'What makes time-series workloads different', step: 1 },
    { text: 'Series, labels and the write path (head + WAL + blocks)', step: 3 },
    { text: 'Delta-of-delta and XOR compression', step: 4 },
    { text: 'Why cardinality, not data volume, kills a TSDB', step: 6 },
    { text: 'Retention and downsampling', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'series', label: 'Active series', min: 1000, max: 50000000, step: 1000, default: 1000000, unit: '', description: 'Distinct metric + label combinations being written.' },
      { key: 'interval', label: 'Sample interval', min: 1, max: 300, step: 1, default: 10, unit: ' s', description: 'Seconds between samples of each series.' },
      { key: 'regular', label: 'Timestamps exactly on schedule', min: 50, max: 100, step: 1, default: 96, unit: '%', description: 'Share of samples whose timestamp delta equals the previous delta (compresses to ~1 bit).' },
      { key: 'same', label: 'Values unchanged from last sample', min: 0, max: 95, step: 1, default: 50, unit: '%', description: 'Share of samples with an identical value (compresses to ~1 bit).' },
      { key: 'days', label: 'Retention', min: 1, max: 365, step: 1, default: 15, unit: ' days', description: 'How long raw samples are kept.' },
      { key: 'kb', label: 'Memory per active series', min: 1, max: 10, step: 0.5, default: 3, unit: ' KB', description: 'Head-block memory for index entry, labels and the open chunk.' },
    ],
    calculate: (input, step) => {
      const series = Math.max(1, input.series ?? 1e6);
      const interval = Math.max(1, input.interval ?? 10);
      const reg = Math.min(1, Math.max(0, (input.regular ?? 96) / 100));
      const same = Math.min(1, Math.max(0, (input.same ?? 50) / 100));
      const days = Math.max(1, input.days ?? 15);
      const kb = Math.max(0.1, input.kb ?? 3);
      const rate = series / interval;
      // Illustrative bit costs: regular timestamp ≈ 1 bit else ≈ 20; repeated value ≈ 1 bit else ≈ 30 (XOR-encoded float).
      const bits = reg * 1 + (1 - reg) * 20 + same * 1 + (1 - same) * 30;
      const bytes = bits / 8;
      const perDay = rate * 86400 * bytes;
      return {
        rate: step < 1 ? { v: '—' } : { v: `${fmtN(rate)} samples/s` },
        day: step < 3 ? { v: '—' } : { v: fmtB(perDay), tone: perDay > 1e11 ? 'warn' : 'good' },
        ratio: step < 3 ? { v: '—' } : { v: `${(16 / bytes).toFixed(1)}× (${bytes.toFixed(2)} B/point)`, tone: 16 / bytes > 6 ? 'good' : 'warn' },
        ret: step < 6 ? { v: '—' } : { v: fmtB(perDay * days), tone: perDay * days > 1e12 ? 'warn' : 'good' },
        mem: step < 5 ? { v: '—' } : { v: fmtB(series * kb * 1024), tone: series * kb * 1024 > 3e10 ? 'bad' : series * kb * 1024 > 8e9 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Workload',
      kind: 'problem',
      title: 'Metrics are a very particular workload',
      body: [
        'Monitoring data — CPU, request counts, temperatures, prices — arrives as an endless stream of <b>(timestamp, value)</b> pairs. Writes are <b>append-only</b> and almost always for “now”; once written, a sample is practically never updated. Reads ask for ranges (“last 6 hours”), usually aggregated (rate, p99, average), and recent data matters far more than old.',
        'A general-purpose database can store this, but pays for features it never uses (row updates, transactions, random-access indexes) and handles the sheer volume poorly: a million series sampled every 10 seconds is <b>100,000 inserts a second</b>, forever. A time-series database (TSDB) is built around exactly these properties.',
      ],
      changes: [{ text: 'Append-only, recent, never updated', tone: 'info' }, { text: 'Queries: time range + aggregation', tone: 'info' }],
      scene: { nodes: [agents({ tag: pill('1 sample / 10 s each', 'clock') }), box('tsdb', 4, 0, 'TSDB', 'blue', 'db', { size: [1.6, 1.6], height: 34, tag: pill('100k writes/s', 'bolt') })], links: [link('agents', 'tsdb')], flows: [flow(['agents', 'tsdb'], { kind: 'write', rate: 3 })] },
    },
    {
      short: 'Data model',
      kind: 'technique',
      title: 'A series is a name plus labels',
      body: [
        'A <b>series</b> is identified by a metric name and a set of <b>labels</b> (tags): <code>http_requests{service="cart", region="eu", status="500"}</code>. Each distinct combination is its own series, with its own sequence of (timestamp, value) samples. Labels are what make queries expressive — “sum by region of the 500s” — and what make the series count multiply.',
        'The storage engine keeps two structures: the <b>samples</b>, grouped per series and compressed in chunks; and an <b>inverted index</b> from each label value to the list of series that carry it. A query first intersects label postings to find series ids, then reads only those series’ chunks for the requested time range.',
      ],
      concepts: [{ term: 'Series', def: 'The sequence of samples for one unique metric name plus label set.' }],
      scene: { nodes: [box('idx', -6, -5, 'Label index', 'purple', 'search', { size: [1.3, 1.3], height: 26, tag: pill('region=eu → series 4, 9, 17', 'hash') }), box('ser', 6, -5, 'Series chunks', 'blue', 'list', { size: [1.3, 1.3], height: 26, tag: pill('(t, v) × n', 'file') }), box('q', 0, 6, 'Query', 'green', 'user', { size: [1.2, 1.2], height: 24 })], links: [link('q', 'idx'), link('idx', 'ser')], flows: [flow(['q', 'idx', 'ser'], { rate: 1 })] },
    },
    {
      short: 'Write path',
      kind: 'technique',
      title: 'Head block, WAL, immutable blocks',
      body: [
        'Incoming samples are appended to an <b>in-memory head</b> (fast, recent data, queryable immediately) and to a <b>write-ahead log</b> on disk so a crash can replay them. Every couple of hours the head is cut into an <b>immutable block</b> on disk, with its own index and compressed chunks, and the WAL segment is dropped.',
        'It’s an LSM-tree idea specialised for time: blocks never change, so they can be compressed hard, cached, shipped to object storage, merged (compacted) into larger ones and deleted whole when they age out of retention. Out-of-order samples are the awkward case — most engines accept only a small window of lateness.',
      ],
      changes: [{ text: 'Samples → head (memory) + WAL (durable)', tone: 'good' }, { text: 'Head → immutable block every ~2 h', tone: 'good' }],
      scene: { nodes: [agents(), head({ tag: pill('recent, in memory', 'bolt') }), wal({ tag: pill('replay on crash', 'refresh') }), blocks({ tag: pill('compressed, immutable', 'layers') })], links: [link('agents', 'head'), link('head', 'wal', { style: 'dashed' }), link('head', 'blocks')], flows: [flow(['agents', 'head'], { kind: 'write', rate: 3 }), flow(['head', 'wal'], { kind: 'write', rate: 2 }), flow(['head', 'blocks'], { rate: 0.5 })] },
    },
    {
      short: 'Compression',
      kind: 'technique',
      title: 'Delta-of-delta and XOR: from 16 bytes to ~2',
      body: [
        'A raw sample is 16 bytes (8 timestamp + 8 float). Two tricks, from Facebook’s Gorilla paper, shrink it dramatically. <b>Timestamps:</b> store the difference between consecutive timestamps, then the difference of <i>those</i> — for a steady 10 s scrape the delta-of-delta is 0 and costs <b>1 bit</b>. <b>Values:</b> XOR each float with the previous; identical values give all-zero (1 bit), and slowly changing values leave only a short run of meaningful bits.',
        'With 96% on-schedule timestamps and half the values unchanged the model gives about <b>17 bits ≈ 2.2 bytes per sample — a 7× saving</b>; spiky data with irregular timing compresses far worse. At 100,000 samples a second that’s ~19 GB a day instead of ~138 GB. Compression ratio is a property of the <i>data</i>, so measure it on yours.',
      ],
      changes: [{ text: 'Steady timestamps → 1 bit each', tone: 'good' }, { text: 'Repeated value → 1 bit; changing value → ~30 bits', tone: 'info' }, { text: '≈ 7× smaller at the defaults', tone: 'good' }],
      concepts: [{ term: 'Delta-of-delta', def: 'Encoding each timestamp as the change in the previous gap; regular intervals give zeros that compress to a single bit.' }],
      scene: { nodes: [box('raw', -8, 0, 'Raw: 16 B / sample', 'red', 'file', { size: [1.4, 1.4], height: 28 }), box('enc', 4, 0, 'Encoder', 'teal', 'layers', { size: [1.3, 1.3], height: 28, tag: pill('Δ of Δ · XOR', 'hash') }), box('out', 15, 0, '~2 B / sample', 'green', 'check', { size: [1.2, 1.2], height: 20 })], links: [link('raw', 'enc', { arrow: 'end' }), link('enc', 'out', { arrow: 'end' })], flows: [flow(['raw', 'enc', 'out'], { rate: 1.2 })] },
    },
    {
      short: 'Queries',
      kind: 'technique',
      title: 'Reading: prune by time, aggregate on the way',
      body: [
        'A query like “p99 latency by service, last 6 hours, 1-minute steps” first selects <b>only blocks overlapping the time range</b> (their min/max times make this trivial), then series via the label index, then decompresses just those chunks and aggregates. Dashboards repeat the same queries every few seconds, so the head block and recent blocks stay hot in memory.',
        'Memory is dominated by the <b>active series</b>, not the samples: each series needs an index entry, its labels and an open chunk — a few KB. A million series at 3 KB is about <b>3 GB</b> of head; 50 million is 150 GB and no longer fits one machine. That leads to the hardest problem in the next step.',
      ],
      changes: [{ text: 'Time range → block pruning; labels → series ids', tone: 'good' }, { text: 'Head memory ≈ series × a few KB', tone: 'info' }],
      scene: { nodes: [box('q', -10, 0, 'Dashboard query', 'green', 'user', { size: [1.3, 1.3], height: 24 }), box('prune', 0, 0, 'Prune blocks by time', 'purple', 'search', { size: [1.3, 1.3], height: 26 }), blocks({ tag: pill('only 2 of 40 blocks read', 'check', 'good') })], links: [link('q', 'prune'), link('prune', 'blocks')], flows: [flow(['q', 'prune', 'blocks'], { rate: 1.2 })] },
    },
    {
      short: 'Cardinality',
      kind: 'problem',
      title: 'Cardinality: the number of series is the real cost',
      body: [
        'Series count is the <b>product</b> of each label’s distinct values: 50 services × 4 regions × 5 status codes × 200 endpoints = 200,000 series from one metric. Add a label with unbounded values — <code>user_id</code>, <code>request_id</code>, a full URL — and every new value creates a new series that may be written once and never again, but still occupies index and head memory.',
        'This <b>cardinality explosion</b> is the most common way a TSDB falls over: memory balloons, ingestion stalls, queries slow because label postings list millions of series. Defences: never use unbounded values as labels, set per-metric series limits, drop or aggregate offending labels at ingest, and monitor series churn. Per-user detail belongs in logs or traces, not metric labels.',
      ],
      changes: [{ text: '50 × 4 × 5 × 200 = 200,000 series', tone: 'info' }, { text: 'user_id as a label → millions of series', tone: 'bad' }],
      scene: { nodes: [agents({ tag: pill('label: user_id', 'alert', 'bad') }), head({ state: 'hot', load: 95, tag: pill('series count exploding', 'alert', 'bad') })], links: [link('agents', 'head')], flows: [flow(['agents', 'head'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Retention',
      kind: 'tradeoff',
      title: 'Retention and downsampling',
      body: [
        'Raw samples at 10 s resolution are precious for debugging yesterday and nearly useless for comparing last quarter. Keep raw data for days or weeks, then <b>downsample</b>: roll samples into 5-minute or 1-hour aggregates (min, max, sum, count — enough to recompute averages, rates and rough percentiles), kept for months or years at 1/30th to 1/360th the size.',
        'Retention is enforced cheaply because blocks are immutable: whole blocks older than the limit are simply deleted, no row-by-row cleanup. Long-term stores (Thanos, Cortex/Mimir, VictoriaMetrics, InfluxDB’s tiers) move old blocks to object storage and serve queries across tiers. Choose tiers from the questions you ask: alerting needs raw and recent; capacity planning needs coarse and long.',
      ],
      changes: [{ text: 'Raw 15 days → ~280 GB at the defaults', tone: 'info' }, { text: '5-min rollups ≈ 1/30 of raw size', tone: 'good' }],
      scene: { nodes: [box('raw', -8, 0, 'Raw · 15 days', 'blue', 'layers', { size: [1.4, 1.4], height: 28 }), box('r5', 2, 0, '5-min rollups · 1 year', 'orange', 'layers', { size: [1.4, 1.4], height: 22 }), box('r1', 12, 0, '1-h rollups · 5 years', 'green', 'layers', { size: [1.4, 1.4], height: 16 })], links: [link('raw', 'r5', { arrow: 'end' }), link('r5', 'r1', { arrow: 'end' })], flows: [flow(['raw', 'r5'], { rate: 0.8 }), flow(['r5', 'r1'], { rate: 0.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Specialise for append-only, compress hard, watch cardinality',
      body: [
        'A TSDB stores <b>series</b> (name + labels) as compressed append-only chunks, with a <b>head block + WAL</b> for fresh data, <b>immutable time-sliced blocks</b> for history, an inverted <b>label index</b> for lookup, and <b>downsampling + whole-block deletion</b> for retention. Delta-of-delta and XOR compression give roughly an order of magnitude on regular data.',
        'Capacity is governed by ingest rate, compression ratio and — above all — <b>active series count</b>. Design labels to be bounded, set limits, and tier retention by the questions you ask. Figures here are modelled for sizing; measure compression and memory on your own data.',
      ],
      scene: { nodes: [agents(), head(), wal(), blocks(), db('long', 22, 0, 'Object storage', { size: [1.3, 1.3] })], links: [link('agents', 'head'), link('head', 'wal', { style: 'dashed' }), link('head', 'blocks'), link('blocks', 'long', { style: 'dashed' })], flows: [flow(['agents', 'head'], { kind: 'write', rate: 3 }), flow(['head', 'blocks'], { rate: 0.5 })] },
    },
  ],
};

export default lesson;
