import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -18, 0, 12, 'users (feed, upload, view)', extra);
const edge = (extra: Partial<SceneNode> = {}) => box('edge', -10, 0, 'CDN + load balancers', 'teal', 'globe', { size: [1.4, 1.4], height: 24, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', -2, 0, 'Stateless app servers', 'orange', 'server', { size: [1.6, 1.6], height: 30, ...extra });
const cache = (extra: Partial<SceneNode> = {}) => db('cache', 7, -8, 'Cache tier (memcached-style)', { size: [1.4, 1.4], ...extra });
const shard = (extra: Partial<SceneNode> = {}) => db('shard', 7, 0, 'Sharded relational DB', { size: [1.5, 1.5], ...extra });
const blob = (extra: Partial<SceneNode> = {}) => disk('blob', 7, 8, 'Media object store', { size: [3, 1.2], height: 14, tone: 'yellow', ...extra });
const queue = (extra: Partial<SceneNode> = {}) => box('queue', 15, 0, 'Async workers (resize, fan-out)', 'purple', 'queue', { size: [1.3, 1.3], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);
const fmtTB = (tb: number): string => (tb >= 1000 ? `${(tb / 1000).toFixed(1)} PB` : `${Math.round(tb)} TB`);

const lesson: Lesson = {
  slug: 'academy-how-instagram-scaled-to-2-5-billion-users',
  title: 'Scaling a Photo-Sharing Service: Stateless Tiers, Sharded SQL and Cached Feeds',
  blurb: 'The general recipe for a read-heavy media product: keep servers stateless, shard the relational store by key with generated IDs, cache the hot reads, put bytes in an object store behind a CDN, and do slow work asynchronously — with the capacity arithmetic.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'store', label: 'New media storage per day', icon: 'disk' },
    { key: 'up', label: 'Peak uploads per second', icon: 'activity' },
    { key: 'look', label: 'Object lookups per second (feed reads)', icon: 'gauge' },
    { key: 'db', label: 'Reads reaching the database / shards needed', icon: 'db' },
  ],
  goals: [
    { text: 'Read-heavy workload and stateless servers', step: 1 },
    { text: 'Bytes in an object store behind a CDN', step: 2 },
    { text: 'Sharded relational data with generated IDs', step: 3 },
    { text: 'Caching and feed construction', step: 4 },
    { text: 'Async work, failure domains and growth', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'dau', label: 'Daily active users', min: 1000000, max: 3000000000, step: 1000000, default: 500000000, unit: '', description: 'Users opening the app each day.' },
      { key: 'opens', label: 'Feed opens per user per day', min: 1, max: 30, step: 1, default: 6, unit: '', description: 'Sessions per active user.' },
      { key: 'items', label: 'Items fetched per feed open', min: 5, max: 100, step: 1, default: 20, unit: '', description: 'Posts hydrated per open (metadata lookups).' },
      { key: 'peak', label: 'Peak-to-average ratio', min: 1, max: 5, step: 0.1, default: 2, unit: '×', description: 'Traffic at peak vs daily average.' },
      { key: 'uploads', label: 'Photos and videos uploaded per day', min: 100000, max: 1000000000, step: 100000, default: 100000000, unit: '', description: 'New media items.' },
      { key: 'mb', label: 'Original size per item', min: 0.1, max: 50, step: 0.1, default: 2, unit: ' MB', description: 'Average uploaded file size.' },
      { key: 'renditions', label: 'Stored size multiple (resized renditions)', min: 1, max: 6, step: 0.1, default: 3, unit: '×', description: 'Thumbnails and transcodes multiply storage.' },
      { key: 'hit', label: 'Cache hit ratio', min: 50, max: 99.9, step: 0.1, default: 98, unit: '%', description: 'Share of metadata lookups served from cache.' },
      { key: 'shardqps', label: 'Reads one DB shard can serve', min: 500, max: 50000, step: 500, default: 5000, unit: '/s', description: 'Sustainable read rate per shard.' },
    ],
    calculate: (input, step) => {
      const dau = Math.max(1, input.dau ?? 5e8);
      const opens = Math.max(0, input.opens ?? 6);
      const items = Math.max(1, input.items ?? 20);
      const peak = Math.max(1, input.peak ?? 2);
      const uploads = Math.max(0, input.uploads ?? 1e8);
      const mb = Math.max(0.01, input.mb ?? 2);
      const rend = Math.max(1, input.renditions ?? 3);
      const hit = Math.min(0.9999, Math.max(0, (input.hit ?? 98) / 100));
      const shardqps = Math.max(1, input.shardqps ?? 5000);
      const storeTB = (uploads * mb * rend) / 1e6;
      const upPeak = (uploads / 86400) * peak;
      const feedPeak = ((dau * opens) / 86400) * peak;
      const lookups = feedPeak * items;
      const dbReads = lookups * (1 - hit);
      const shards = Math.ceil(dbReads / (shardqps * 0.6));
      return {
        store: step < 2 ? { v: '—' } : { v: `${fmtTB(storeTB)} / day (${fmtTB(storeTB * 365)} / year)` },
        up: step < 2 ? { v: '—' } : { v: `${fmtN(upPeak)}/s` },
        look: step < 4 ? { v: '—' } : { v: `${fmtN(lookups)}/s (${fmtN(feedPeak)} feed opens/s × ${items})` },
        db: step < 4 ? { v: '—' } : { v: `${fmtN(dbReads)}/s → ${fmtN(shards)} shards at 60% load`, tone: shards < 50 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Shape',
      kind: 'insight',
      title: 'A read-heavy product with a few huge objects',
      body: [
        'A photo/video sharing service has an extreme read-to-write ratio: a post is written once and viewed, liked and commented on many times, and the bulk of bytes are media. That shape dictates the architecture: <b>stateless application servers</b> behind load balancers (any server can serve any request, so you add boxes to add capacity and lose them without losing sessions), separate paths for <b>media bytes</b> and <b>structured data</b>, aggressive <b>caching</b>, and <b>asynchronous</b> processing for anything slow.',
        'Scale arithmetic comes first. Take illustrative figures: 500 million daily users opening the feed 6 times: 3 billion opens a day = 34,700/s average, <b>69,400/s at a 2× peak</b>; each open hydrates 20 items, so ~<b>1.4 million object lookups per second</b> at peak. Uploads are three orders of magnitude fewer — 100 million a day is ~1,160/s average, 2,300/s at peak — but each is megabytes, so the system is bandwidth- and storage-heavy on the write side and lookup-heavy on the read side. Every later decision answers one of these two numbers.',
      ],
      scene: { nodes: [users({ tag: pill('3B feed opens/day', 'activity') }), edge(), api({ tag: pill('stateless · scale out', 'layers', 'good') }), shard(), blob()], links: [link('users', 'edge'), link('edge', 'api'), link('api', 'shard'), link('api', 'blob')], flows: [flow(['users', 'edge', 'api', 'shard'], { rate: 2 })] },
    },
    {
      short: 'Media',
      kind: 'technique',
      title: 'Bytes go to an object store; the CDN serves them',
      body: [
        'Photos and videos don’t belong in a database. On upload the app server (or the client directly, via a pre-signed URL) writes the original to an <b>object store</b> (see the Object Store lesson), and asynchronous workers produce <b>renditions</b> — several image sizes, and for video multiple bitrates and codecs. Each stored item is the original plus renditions: 100 million uploads × 2 MB × 3 = <b>600 TB of new storage a day</b> (~219 PB a year), which is why storage tiering, deduplication and compression are line items on the budget, and old or cold media moves to cheaper classes.',
        'Reads go through a <b>CDN</b> keyed by an immutable URL (content-hashed, so it caches forever and invalidation is never needed — changing a photo means a new URL). With a high edge hit ratio only a small fraction of requests reach the origin store. Serve images in the best format and size for the device (responsive renditions, WebP/AVIF) — bytes shipped, not server CPU, is often the largest cost.',
      ],
      changes: [{ text: 'Original + renditions in an object store: ~600 TB/day here', tone: 'info' }, { text: 'Immutable URLs → CDN caches forever', tone: 'good' }, { text: 'Tier cold media to cheaper storage classes', tone: 'good' }],
      scene: { nodes: [users(), edge({ tag: pill('CDN: immutable image URLs', 'globe', 'good') }), api(), blob({ tag: pill('original + 3 renditions', 'disk') }), queue({ tag: pill('resize / transcode', 'cpu') })], links: [link('users', 'edge'), link('edge', 'blob'), link('api', 'blob'), link('api', 'queue'), link('queue', 'blob')], flows: [flow(['users', 'edge', 'blob'], { rate: 1.6, back: true }), flow(['api', 'queue', 'blob'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Shards',
      kind: 'technique',
      title: 'Shard the relational data and generate IDs yourself',
      body: [
        'Structured data — users, posts, follows, likes, comments — fits a relational or key-value store with transactions, and outgrows one machine. The standard answer is <b>horizontal sharding</b> by a key (user id or post id) with many <b>logical shards</b> mapped onto fewer physical servers: start with, say, 4,096 logical shards on 64 machines, so growth means <b>moving logical shards</b> to new machines rather than re-hashing every row (see the Partitioning and Consistent Hashing lessons). Each shard has replicas for read scaling and failover.',
        'Auto-increment ids don’t work across shards, so ids are <b>generated by the application</b> as a sortable composite — timestamp bits + shard id bits + a per-shard sequence — so an id encodes <i>which shard owns it</i> (routing needs no lookup) and sorts by time (see the Unique IDs lesson). Trade-offs: queries must be <b>shard-aware</b> — a lookup by user id is single-shard, but “all posts with tag X” or global counts need a secondary index or a separate system; cross-shard transactions are avoided by choosing the shard key so that the data touched together lives together.',
      ],
      changes: [{ text: 'Many logical shards on fewer machines: rebalance by moving shards', tone: 'good' }, { text: 'Composite IDs: time + shard + sequence', tone: 'good' }, { text: 'Cross-shard queries need secondary indexes', tone: 'bad' }],
      concepts: [{ term: 'Logical shard', def: 'A fixed bucket of the key space; many logical shards are mapped onto physical servers so capacity can grow by moving buckets.' }],
      scene: { nodes: [api({ tag: pill('shard = id bits', 'hash') }), shard({ name: 'Shard 0…1023', tag: pill('users, posts', 'db') }), box('s2', 7, 8, 'Shard 1024…2047', 'blue', 'db', { size: [1.4, 1.4], height: 22 }), box('s3', 7, -8, 'Shard 2048…4095', 'blue', 'db', { size: [1.4, 1.4], height: 22 })], links: [link('api', 'shard'), link('api', 's2'), link('api', 's3')], flows: [flow(['api', 'shard'], { rate: 1.4 }), flow(['api', 's3'], { rate: 0.8 })] },
    },
    {
      short: 'Cache',
      kind: 'technique',
      title: 'Cache the hot metadata and build feeds ahead of time',
      body: [
        'At 1.4 million lookups per second, even a good database would melt, so a <b>cache tier</b> (memcached or Redis-style) sits in front, keyed by object id and holding post, user and counter data. At a 98% hit ratio the database sees <b>28,000 reads/s</b> — about 10 shards at 60% of 5,000/s each (the hit ratio is the lever: at 90% it would be 140,000/s and 47 shards). Protect the cache from stampedes with request coalescing and TTL jitter, and use <b>negative caching</b> and cache warming after failover (see the Cache Failure Modes lesson).',
        'The <b>feed</b> is built by either <b>fan-out on write</b> (when someone posts, push the id into each follower’s precomputed feed list — fast reads, expensive for accounts with millions of followers) or <b>fan-out on read</b> (gather recent posts from followees at request time), usually a hybrid: precompute for ordinary accounts, merge in celebrity posts at read time (see the Social Feed lesson). Ranking is applied on a candidate set from these lists; counters (likes, views) are often approximate and updated asynchronously.',
      ],
      changes: [{ text: '98% hit → 28k DB reads/s vs 1.4M lookups/s', tone: 'good' }, { text: 'Hybrid feed fan-out: write for most, read for celebrities', tone: 'good' }],
      scene: { nodes: [api({ tag: pill('1.4M lookups/s', 'activity') }), cache({ tag: pill('98% hit', 'check', 'good') }), shard({ tag: pill('28k reads/s', 'db') })], links: [link('api', 'cache'), link('api', 'shard'), link('cache', 'shard', { style: 'dashed' })], flows: [flow(['api', 'cache'], { kind: 'heavy', rate: 3, back: true }), flow(['api', 'shard'], { rate: 0.5, back: true })] },
    },
    {
      short: 'Async',
      kind: 'tradeoff',
      title: 'Asynchronous work, failure domains and growth',
      body: [
        'Anything the user doesn’t wait for goes through a <b>queue</b> to workers: resizing and transcoding, feed fan-out, notifications, search indexing, ML moderation and recommendation features, counters rollups. The upload request returns once the original is durable and a job is enqueued; derived data catches up in seconds (see the Message Queues lesson). Queue depth and consumer lag become the key health metrics, with <b>idempotent</b> jobs so retries are safe.',
        'For reliability, split into <b>failure domains</b>: multiple regions each able to serve reads, replicas across zones, per-shard failover, and graceful degradation (serve cached feeds, hide like counts, delay uploads) rather than failing whole. Growth stages mirror this lesson: one database → read replicas and cache → vertical split by table → horizontal sharding → multi-region. The lesson’s figures are illustrative first-order arithmetic, not any company’s data; what transfers is the method — compute the two or three dominant rates first and let them choose the architecture.',
      ],
      changes: [{ text: 'Queue slow work; idempotent jobs; watch consumer lag', tone: 'good' }, { text: 'Degrade gracefully per failure domain', tone: 'good' }],
      scene: { nodes: [api(), queue({ tag: pill('fan-out · resize · notify', 'queue') }), blob(), cache(), shard()], links: [link('api', 'queue'), link('queue', 'blob'), link('queue', 'cache'), link('queue', 'shard')], flows: [flow(['api', 'queue', 'blob'], { kind: 'write', rate: 1.4 }), flow(['queue', 'cache'], { rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Compute the dominant rates, then pick the pattern',
      body: [
        'Keep servers <b>stateless</b>; send <b>bytes to an object store behind a CDN</b>; <b>shard</b> relational data by key with generated ids and many logical shards; <b>cache</b> hot reads (the hit ratio sets the shard count); build <b>feeds</b> by hybrid fan-out; do slow work <b>asynchronously</b>.',
        'The same method — estimate peak rates, find the bottleneck, add the cheapest layer that removes it — scales the design from thousands to billions of users.',
      ],
      scene: { nodes: [users(), edge(), api(), cache(), shard(), blob(), queue()], links: [link('users', 'edge'), link('edge', 'api'), link('api', 'cache'), link('api', 'shard'), link('api', 'blob'), link('api', 'queue')], flows: [flow(['users', 'edge', 'api', 'cache'], { rate: 2, back: true })] },
    },
  ],
};

export default lesson;
