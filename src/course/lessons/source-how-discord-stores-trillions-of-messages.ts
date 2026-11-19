import type { Lesson, SceneNode } from '../../types';
import { box, disk, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => box('client', -15, 0, 'Chat client', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', -7, 0, 'Message service', 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });
const part = (i: number, name: string, extra: Partial<SceneNode> = {}) =>
  disk(`p${i}`, 6, -6 + i * 4.2, name, { size: [3, 1.1], height: 16, tone: 'yellow', icon: 'list', ...extra });

const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(b >= 1e7 ? 0 : 1)} MB` : `${Math.round(b / 1e3)} KB`);

const lesson: Lesson = {
  slug: 'source-how-discord-stores-trillions-of-messages',
  title: 'Storing Chat History at Scale',
  blurb: 'Partition keys, time buckets and time-ordered ids: how a chat app keeps “latest 50 messages” fast and partitions bounded across billions of channels of wildly different activity.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'busy', label: 'Busy channel: partition size', icon: 'disk' },
    { key: 'quiet', label: 'Quiet channel: partition size', icon: 'disk' },
    { key: 'scan', label: 'Buckets read to fill a page (quiet channel)', icon: 'search' },
    { key: 'parts', label: 'Partitions per year (busy channel)', icon: 'layers' },
  ],
  goals: [
    { text: 'The access pattern: append-mostly, read the latest, range back', step: 1 },
    { text: 'Choosing a partition key and why (channel) alone breaks', step: 2 },
    { text: 'Time-ordered ids and clustering order', step: 3 },
    { text: 'Time buckets: bounding partitions, and the empty-bucket cost', step: 4 },
    { text: 'Hot partitions and how to defend against them', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'busyday', label: 'Messages/day in a busy channel', min: 100, max: 2000000, step: 100, default: 50000, unit: '', description: 'Large public community channel.' },
      { key: 'quietday', label: 'Messages/day in a quiet channel', min: 0.1, max: 1000, step: 0.1, default: 1, unit: '', description: 'A small private channel that is mostly silent.' },
      { key: 'bucket', label: 'Bucket window', min: 1, max: 90, step: 1, default: 10, unit: ' days', description: 'Time span each partition covers.' },
      { key: 'bytes', label: 'Bytes per stored message', min: 50, max: 4000, step: 50, default: 300, unit: ' B', description: 'Message body, ids and metadata.' },
      { key: 'page', label: 'Messages per page fetched', min: 10, max: 200, step: 10, default: 50, unit: '', description: 'Messages loaded when a user opens or scrolls.' },
    ],
    calculate: (input, step) => {
      const busy = Math.max(1, input.busyday ?? 5e4);
      const quiet = Math.max(0.01, input.quietday ?? 1);
      const bucket = Math.max(1, input.bucket ?? 10);
      const bytes = Math.max(1, input.bytes ?? 300);
      const page = Math.max(1, input.page ?? 50);
      const busySize = busy * bucket * bytes;
      const quietSize = quiet * bucket * bytes;
      // A quiet channel yields (quiet × bucket) messages per bucket, so filling a page may span several buckets.
      const perBucketQuiet = quiet * bucket;
      const scan = Math.max(1, Math.ceil(page / perBucketQuiet));
      return {
        busy: step < 3 ? { v: '—' } : { v: fmtB(busySize), tone: busySize > 1e9 ? 'bad' : busySize > 1e8 ? 'warn' : 'good' },
        quiet: step < 3 ? { v: '—' } : { v: fmtB(quietSize), tone: 'good' },
        scan: step < 3 ? { v: '—' } : { v: `${scan}${scan > 4 ? ' (many empty reads)' : ''}`, tone: scan <= 2 ? 'good' : scan <= 5 ? 'warn' : 'bad' },
        parts: step < 3 ? { v: '—' } : { v: `${Math.ceil(365 / bucket)}` },
      };
    },
  },
  steps: [
    {
      short: 'Pattern',
      kind: 'problem',
      title: 'What chat storage must be good at',
      body: [
        'Messages are written once, almost never edited, and read in one dominant pattern: <b>“the newest N messages of this channel”</b> when you open it, then older pages as you scroll, plus a jump to a specific message (a link or a search hit). Writes arrive at wildly different rates: a huge community channel gets thousands per minute while a private chat gets a handful a month.',
        'Billions of channels, trillions of rows, low-latency reads on the latest page and predictable behaviour at both extremes. That favours a <b>wide-column / LSM-based store</b> (Cassandra-family) where data is placed by a <b>partition key</b> and kept <b>sorted</b> within the partition — the data model matters more than the engine.',
      ],
      scene: { nodes: [client({ tag: pill('open channel → last 50', 'list') }), api(), part(0, 'partition: channel 7'), part(1, 'partition: channel 8'), part(2, 'partition: channel 9')], links: [link('client', 'api', { arrow: 'both' }), link('api', 'p0'), link('api', 'p1', { style: 'dashed' }), link('api', 'p2', { style: 'dashed' })], flows: [flow(['client', 'api', 'p0'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Partition key',
      kind: 'problem',
      title: 'Partition by channel alone, and the big ones break',
      body: [
        'The natural key is <code>channel_id</code>: all of a channel’s messages in one partition, so reading its latest page is a single-partition read. It works for most channels — and fails for the extremes. A channel posting 50,000 messages a day reaches <b>millions of rows and gigabytes</b> in one partition within months: compaction and repair take long, reads and memory spike, and the node holding it becomes a hot spot.',
        'Rule of thumb: keep partitions bounded (tens to a few hundred MB). A partition key that grows without limit is a time bomb — the data model must cap partition size, regardless of how popular a channel gets.',
      ],
      changes: [{ text: 'PRIMARY KEY (channel_id, message_id) → unbounded partitions', tone: 'bad' }],
      scene: { nodes: [api(), part(0, 'channel 1 · 20 GB', { state: 'hot', tag: pill('too big', 'alert', 'bad') }), part(1, 'channel 2 · 40 KB')], links: [link('api', 'p0'), link('api', 'p1')], flows: [flow(['api', 'p0'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Ids',
      kind: 'technique',
      title: 'Time-ordered ids as the sort key',
      body: [
        'Within a partition, rows are stored sorted by the <b>clustering key</b>. If the message id is a <b>Snowflake</b>-style id — a 64-bit number whose high bits are a timestamp, then worker and sequence bits — then sorting by id <i>is</i> sorting by time, and “newest 50” is a reverse range read of the first 50 rows with no extra index.',
        'It also makes “jump to message M” a seek, and lets any service derive a message’s creation time from its id. Ids are generated by the application (no central sequence), unique across workers and roughly ordered — see the Generating IDs lesson for the construction.',
      ],
      changes: [{ text: 'id = timestamp | worker | sequence', tone: 'info' }, { text: 'Latest 50 = reverse range scan from the end', tone: 'good' }],
      scene: { nodes: [client(), api({ tag: pill('id = ts·worker·seq', 'hash') }), part(0, 'sorted by id (time)', { tag: pill('newest at the end', 'clock') })], links: [link('client', 'api'), link('api', 'p0')], flows: [flow(['client', 'api', 'p0'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Buckets',
      kind: 'technique',
      title: 'Add a time bucket to the partition key',
      body: [
        'Make the key <code>(channel_id, bucket)</code> where <code>bucket</code> is a fixed time window derived from the message id (e.g. 10 days). A channel’s history is now <b>many bounded partitions</b>. The busy channel’s partition holds 50,000 × 10 × 300 B = <b>150 MB</b>; the quiet one, 3 KB. Latest page = the current bucket; scrolling back moves to the previous bucket.',
        'The price is the <b>empty-bucket problem</b>: a channel with 1 message a day has just 10 messages per 10-day bucket, so filling a 50-message page needs <b>5 buckets — 5 partition reads</b>, some empty for dormant channels. Wider buckets help quiet channels but bloat busy ones: one global window can’t suit both. Sliders show the trade-off for both extremes.',
      ],
      changes: [{ text: 'PRIMARY KEY ((channel_id, bucket), message_id)', tone: 'good' }, { text: 'Busy: 150 MB per bucket · quiet: 3 KB, 5 reads per page', tone: 'info' }],
      concepts: [{ term: 'Time bucket', def: 'A fixed time window included in the partition key to cap how large any one partition can grow.' }],
      scene: { nodes: [api(), part(0, '(ch 7, bucket 41)', { tag: pill('older', 'clock') }), part(1, '(ch 7, bucket 42)', { tag: pill('older', 'clock') }), part(2, '(ch 7, bucket 43) ← latest', { tag: pill('read first', 'check', 'good') })], links: [link('api', 'p0', { style: 'dashed' }), link('api', 'p1', { style: 'dashed' }), link('api', 'p2')], flows: [flow(['api', 'p2'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Hot partitions',
      kind: 'problem',
      title: 'Hot partitions and read amplification',
      body: [
        'Even with buckets, a <b>viral channel</b> concentrates writes and reads on one partition and its three replicas — and everyone reading the latest page hits the same rows. Defences: a <b>read-through cache</b> of recent messages in front (they’re immutable-ish and hot), <b>request coalescing</b> so a thousand identical page requests become one query, and <b>rate-limiting writes</b> per channel.',
        'Reads of old history are the opposite problem: cold data, many SSTables to check, tombstones from deletes. Deletes in an LSM store write <b>tombstones</b> that linger until compaction — a purge of a huge channel can slow reads for weeks. Keep deletion patterns in mind: expire by whole bucket where possible instead of row by row.',
      ],
      changes: [{ text: 'Cache + coalesce hot latest pages', tone: 'good' }, { text: 'Tombstones slow reads until compaction', tone: 'bad' }],
      scene: { nodes: [client({ name: 'Millions reading' }), box('cache', -7, 0, 'Recent-message cache', 'teal', 'layers', { size: [1.3, 1.3], height: 26, tag: pill('coalesces identical reads', 'check', 'good') }), part(2, 'hot partition', { state: 'hot' })], links: [link('client', 'cache'), link('cache', 'p2', { style: 'dashed' })], flows: [flow(['client', 'cache'], { kind: 'heavy', rate: 4 }), flow(['cache', 'p2'], { rate: 0.6 })] },
    },
    {
      short: 'Operations',
      kind: 'tradeoff',
      title: 'Running it: compaction, repair and the JVM',
      body: [
        'Wide-column stores trade easy writes for background work. <b>Compaction</b> merges immutable SSTables and competes with foreground traffic; <b>repair</b> reconciles replicas; <b>garbage collection</b> pauses in a managed-runtime engine can stall a node and show up as latency spikes at the tail. Large, uneven partitions amplify all three, and one slow node makes quorum reads and writes slow for everything it replicas.',
        'Teams mitigate with bounded partitions (above), generous headroom, careful compaction strategy per table (time-window compaction suits time-bucketed data), and sometimes moving to engines designed around these costs. The lesson is the model: pick a partition key that bounds size and matches the read pattern, and the engine choice becomes an optimisation instead of a rescue.',
      ],
      scene: { nodes: [box('c', -6, 0, 'Compaction + repair', 'orange', 'refresh', { size: [1.3, 1.3], height: 24, tag: pill('compete with reads', 'alert', 'warn') }), box('g', 6, 0, 'GC pauses', 'red', 'pause', { size: [1.3, 1.3], height: 22, tag: pill('tail latency', 'clock', 'warn') })], links: [], flows: [] },
    },
    {
      short: 'Search',
      kind: 'insight',
      title: 'What the store does not do',
      body: [
        'A partition-sorted store answers <i>by channel and time</i>. It cannot answer “every message from user U” or “messages containing this word” without scanning — so <b>search and secondary access</b> go to dedicated indexes (an inverted-index search service fed from the message stream) and lookups by user or mention use separate tables denormalised for that query.',
        'Model each query with its own table or index rather than forcing one schema to serve all, and keep them consistent by publishing every write to a durable stream that feeds the extra views. Figures here are illustrative model outputs, not any company’s numbers.',
      ],
      scene: { nodes: [api(), box('stream', -1, -6, 'Message stream', 'yellow', 'queue', { size: [1.6, 1], height: 14 }), box('search', 8, -6, 'Search index', 'purple', 'search', { size: [1.2, 1.2], height: 22 }), part(0, 'messages by channel')], links: [link('api', 'stream'), link('stream', 'search'), link('api', 'p0')], flows: [flow(['api', 'stream', 'search'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Bound the partition, sort by time, cache the hot page',
      body: [
        'Partition by <code>(channel, time bucket)</code> so no partition grows unbounded; sort by a <b>time-ordered id</b> so the latest page is a short reverse range scan; accept that quiet channels cost a few extra bucket reads; cache and coalesce the hot latest page; keep deletes and compaction in mind; build search elsewhere.',
        'Design the key from the access pattern and the worst-case growth, not the average. Sizes are modelled: busy bucket = messages/day × days × bytes; quiet scan = page ÷ messages per bucket.',
      ],
      scene: { nodes: [client(), api(), part(0, '(ch, bucket n−1)'), part(1, '(ch, bucket n)')], links: [link('client', 'api', { arrow: 'both' }), link('api', 'p0', { style: 'dashed' }), link('api', 'p1')], flows: [flow(['client', 'api', 'p1'], { rate: 1.5, back: true })] },
    },
  ],
};

export default lesson;
