import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const users = (n = 20, text = '8k req/s') => crowd('users', -10, 1, n, text);
const app = (extra: Partial<SceneNode> = {}) => box('app', -2, 0, 'App', 'blue', 'server', { load: 40, ...extra });
const cache = (extra: Partial<SceneNode> = {}) => box('cache', 5, -6, 'Cache', 'green', 'bolt', { size: [1.5, 1.5], height: 40, sub: 'in-memory', ...extra });
const store = (load: number, extra: Partial<SceneNode> = {}) => db('db', 7, 3, 'Products DB', { load, ...extra });

const wired = [link('users', 'app'), link('app', 'cache', { arrow: 'both' }), link('app', 'db', { arrow: 'both' })];

const lesson: Lesson = {
  slug: 'caching',
  title: 'Caching',
  blurb: 'Keep hot answers in memory so the database stops answering the same question ten thousand times a second.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'hit', label: 'Hit rate', icon: 'bolt' },
    { key: 'dbload', label: 'DB load', icon: 'db' },
    { key: 'p95', label: 'p95', icon: 'timer' },
    { key: 'fresh', label: 'Freshness', icon: 'clock' },
  ],
  goals: [
    { text: 'Cache-aside reads and why hit rate is everything', step: 4 },
    { text: 'Staleness, TTLs and invalidation on write', step: 6 },
    { text: 'Eviction policies when memory runs out', step: 7 },
    { text: 'Stampedes and request coalescing', step: 9 },
    { text: 'Negative caching and Bloom filters', step: 10 },
  ],
  legend: ['request', 'response', 'hit', 'write'],
  steps: [
    {
      short: 'DB melts',
      kind: 'problem',
      title: 'The database is answering the same question',
      body: [
        'A furniture store’s product pages each run a handful of queries: product, price, stock, reviews summary. At 8,000 page views per second the database sits at 94% CPU and p95 latency is 380 ms.',
        'Looking at query logs reveals the shape: <b>90% of reads are for the same ~2,000 products</b> — the ones on the homepage and in ads.',
      ],
      changes: [{ text: 'DB CPU 94%', tone: 'bad' }, { text: 'Hot set: 2k of 400k products' }],
      scene: {
        nodes: [users(), app(), store(94, { state: 'hot' })],
        links: [link('users', 'app'), link('app', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'app', 'db'], { back: true, rate: 5, speed: 0.6 })],
        metrics: { hit: '—', dbload: { v: '94%', tone: 'bad' }, p95: { v: '380 ms', tone: 'bad' }, fresh: 'live' },
      },
    },
    {
      short: 'Add cache',
      kind: 'technique',
      title: 'Cache-aside: look before you query',
      body: [
        'Add an in-memory cache (Redis, Memcached). On each read, the app checks the cache first. On a <b>miss</b> it queries the database, then stores the result in the cache with a TTL. On a <b>hit</b> it skips the database entirely.',
        'This pattern — the application manages the cache around the database — is called <b>cache-aside</b> or lazy loading. Only data that’s actually requested gets cached.',
      ],
      concepts: [
        { term: 'Cache-aside', def: 'The app reads from the cache, falls back to the database on a miss, and populates the cache with the result.' },
        { term: 'Cache hit', def: 'A request served from the cache without touching the backing store.' },
      ],
      changes: [{ text: 'Cache in front of reads', tone: 'good' }],
      scene: {
        nodes: [users(), app(), cache({ tag: pill('get product:812', 'bolt') }), store(60)],
        links: wired,
        flows: [flow(['users', 'app', 'cache'], { kind: 'hit', back: true, rate: 3 }), flow(['app', 'db'], { back: true, rate: 1.2 })],
        metrics: { hit: '60%', dbload: '60%', p95: '120 ms', fresh: 'TTL 5 min' },
      },
    },
    {
      short: 'Hit rate',
      kind: 'insight',
      title: 'Hit rate is the whole game',
      body: [
        'Once warm, 96% of reads hit. Database load falls by ~25× and the CPU drops to 9%. A cache hit costs ~1 ms; a miss costs the cache check <i>plus</i> the query, ~16 ms.',
        'Average latency is <code>h × 1 + (1 − h) × 16</code>: at 96% that is 1.6 ms. Going from 90% to 99% hit rate cuts database traffic by another 10× — the last few points matter most.',
      ],
      note: { kind: 'key', text: 'Every miss still pays full price. Watch hit rate, and also miss rate in absolute terms: 4% of 8,000/s is still 320 database queries a second.' },
      changes: [{ text: 'Hit rate 96%', tone: 'good' }, { text: 'DB load 94% → 9%', tone: 'good' }],
      concepts: [{ term: 'Hit rate', def: 'Fraction of reads served by the cache; database load scales with (1 − hit rate).' }],
      scene: {
        nodes: [users(), app(), cache({ tag: pill('96% hits', 'bolt', 'good') }), store(9)],
        links: wired,
        flows: [flow(['users', 'app', 'cache'], { kind: 'hit', back: true, rate: 5 }), flow(['app', 'db'], { back: true, rate: 0.25 })],
        metrics: { hit: { v: '96%', tone: 'good' }, dbload: { v: '9%', tone: 'good' }, p95: { v: '6 ms', tone: 'good' }, fresh: 'TTL 5 min' },
      },
    },
    {
      short: 'Stale',
      kind: 'problem',
      title: 'The price changed; the page didn’t',
      body: [
        'A merchandiser drops a sofa’s price from €900 to €750. The database updates instantly, but the cached copy keeps saying €900 for up to five minutes — the TTL. Customers see one price on the page and another at checkout.',
        'A cache is a <b>copy</b>, and copies drift. The TTL is the maximum drift you’ve agreed to tolerate, whether you meant to or not.',
      ],
      changes: [{ text: 'DB: €750', tone: 'good' }, { text: 'Cache: €900 (stale)', tone: 'bad' }],
      concepts: [{ term: 'Stale read', def: 'Returning cached data that no longer matches the source of truth.' }],
      scene: {
        nodes: [users(), app(), cache({ tag: pill('sofa: €900', 'clock', 'bad') }), store(10, { tag: pill('sofa: €750', 'db', 'good') })],
        links: wired,
        flows: [flow(['users', 'app', 'cache'], { kind: 'hit', back: true, rate: 4 })],
        metrics: { hit: '96%', dbload: '10%', p95: '6 ms', fresh: { v: '≤ 5 min stale', tone: 'bad' } },
      },
    },
    {
      short: 'Invalidate',
      kind: 'technique',
      title: 'Invalidate on write',
      body: [
        'When the price is written, the code that updates the database also <b>deletes</b> the cache key. The next read misses, loads €750, and repopulates. The TTL stays as a safety net for any invalidation that gets lost.',
        'Delete rather than overwrite: if two writers race, “set” can leave the older value in cache, while “delete” just forces a fresh read.',
      ],
      note: { kind: 'warn', text: 'Even delete-on-write has a gap: a reader that loaded the old row just before the write can put it back just after. Short TTLs, versioned keys, or change-data-capture driven invalidation narrow that window.' },
      changes: [{ text: 'UPDATE → DEL product:812', tone: 'good' }],
      concepts: [
        { term: 'Cache invalidation', def: 'Removing or updating cached entries when the underlying data changes.' },
        { term: 'Write-through', def: 'Writing to the cache and the database together so the cache is always current for written keys.' },
      ],
      scene: {
        nodes: [users(), app({ tag: pill('UPDATE + DEL', 'refresh') }), cache({ tag: pill('sofa: evicted', 'x', 'warn') }), store(12, { tag: pill('sofa: €750', 'db', 'good') })],
        links: wired,
        flows: [flow(['app', 'db'], { kind: 'write', rate: 0.6 }), flow(['app', 'cache'], { kind: 'write', rate: 0.6 }), flow(['users', 'app', 'cache'], { kind: 'hit', back: true, rate: 3 })],
        metrics: { hit: '96%', dbload: '12%', p95: '6 ms', fresh: { v: 'seconds', tone: 'good' } },
      },
    },
    {
      short: 'Eviction',
      kind: 'technique',
      title: 'Memory is full — what goes?',
      body: [
        'The cache has 8 GB; the catalogue doesn’t fit. When memory runs out, an <b>eviction policy</b> picks victims. <b>LRU</b> drops the least recently used key; <b>LFU</b> drops the least frequently used; TTL-based expiry removes keys whose time is up.',
        'LRU suits most web traffic. LFU holds up better when a one-off scan (say, a nightly export) would otherwise flush the genuinely popular keys out of an LRU cache.',
      ],
      concepts: [
        { term: 'LRU', def: 'Least Recently Used eviction: discard the entry that hasn’t been accessed for the longest time.' },
        { term: 'LFU', def: 'Least Frequently Used eviction: discard the entry with the fewest accesses.' },
      ],
      scene: {
        nodes: [users(), app(), cache({ load: 99, tag: pill('LRU: evict oldest', 'layers', 'warn') }), store(11)],
        links: wired,
        flows: [flow(['users', 'app', 'cache'], { kind: 'hit', back: true, rate: 4 }), flow(['app', 'db'], { back: true, rate: 0.4 })],
        metrics: { hit: '95%', dbload: '11%', p95: '6 ms', fresh: 'seconds' },
      },
    },
    {
      short: 'Stampede',
      kind: 'problem',
      title: 'The homepage key expires',
      body: [
        'The “today’s deals” key is read 3,000 times a second. When its TTL expires, every request in the next ~40 ms misses at once — and all of them query the database for the same expensive result.',
        'This <b>cache stampede</b> (or thundering herd) spikes the database to 100% for a key that one query could have refilled.',
      ],
      changes: [{ text: '3,000 simultaneous misses', tone: 'bad' }, { text: 'DB spikes to 100%', tone: 'bad' }],
      concepts: [{ term: 'Cache stampede', def: 'Many concurrent misses for the same key overwhelming the backing store when it expires.' }],
      scene: {
        nodes: [users(24, 'homepage traffic'), app({ load: 70 }), cache({ tag: pill('deals: expired', 'clock', 'bad') }), store(100, { state: 'hot', tag: pill('×3,000 same query', 'alert', 'bad') })],
        links: wired,
        flows: [flow(['users', 'app', 'db'], { kind: 'heavy', back: true, rate: 6, speed: 0.6 })],
        metrics: { hit: { v: '0% (deals)', tone: 'bad' }, dbload: { v: '100%', tone: 'bad' }, p95: { v: '2.1 s', tone: 'bad' }, fresh: 'seconds' },
      },
    },
    {
      short: 'One fetch',
      kind: 'technique',
      title: 'Let one request refill it',
      body: [
        '<b>Request coalescing</b> (single-flight): the first miss takes a short lock on the key and queries the database; everyone else waits briefly for its result instead of querying too.',
        'Two complementary tricks: <b>stale-while-revalidate</b> keeps serving the old value while one background refresh runs, and <b>TTL jitter</b> spreads expiries out so thousands of keys don’t expire in the same second.',
      ],
      changes: [{ text: '3,000 misses → 1 query', tone: 'good' }, { text: 'Serve stale during refresh', tone: 'good' }],
      concepts: [
        { term: 'Request coalescing', def: 'Collapsing concurrent requests for the same missing key into a single backend fetch.' },
        { term: 'Stale-while-revalidate', def: 'Serving a slightly expired value while a refresh happens in the background.' },
      ],
      scene: {
        nodes: [users(24, 'homepage traffic'), app({ load: 45, tag: pill('lock: deals', 'lock') }), cache({ tag: pill('serving stale', 'clock', 'warn') }), store(14, { tag: pill('1 query', 'db', 'good') })],
        links: wired,
        flows: [flow(['users', 'app', 'cache'], { kind: 'hit', back: true, rate: 5 }), flow(['app', 'db'], { back: true, rate: 0.3 })],
        metrics: { hit: '96%', dbload: { v: '14%', tone: 'good' }, p95: '7 ms', fresh: 'seconds' },
      },
    },
    {
      short: 'Missing keys',
      kind: 'case',
      title: 'Case: requests for things that don’t exist',
      body: [
        'A scraper requests random product IDs: <code>/product/98765432</code>. None exist, so nothing is ever cached — every request misses and hits the database. Load creeps back up despite a 96% “hit rate” on real products.',
        'Fixes: cache the <b>absence</b> too (a short-TTL “not found” entry), and put a <b>Bloom filter</b> of valid IDs in front. A Bloom filter can say “definitely not present” using a few bits per item, so impossible IDs never reach the database.',
      ],
      note: { kind: 'tip', text: 'Bloom filters have false positives (“maybe present”) but never false negatives — exactly the right error for a guard in front of a database.' },
      concepts: [
        { term: 'Negative caching', def: 'Caching the fact that a key does not exist, to avoid repeated lookups for it.' },
        { term: 'Bloom filter', def: 'A compact probabilistic set that answers “definitely not” or “maybe” membership questions.' },
      ],
      scene: {
        nodes: [crowd('users', -10, 1, 8, 'scraper', { tone: 'red' }), app({ tag: pill('bloom: not present', 'filter', 'good') }), cache({ tag: pill('404 cached 60 s', 'x') }), store(10)],
        links: wired,
        flows: [flow(['users', 'app'], { kind: 'fail', rate: 3 })],
        metrics: { hit: '96%', dbload: { v: '10%', tone: 'good' }, p95: '6 ms', fresh: 'seconds' },
      },
    },
    {
      short: 'Layers',
      kind: 'insight',
      title: 'Caches all the way down',
      body: [
        'Real systems stack caches: the <b>browser</b> (HTTP cache headers), a <b>CDN</b> near the user, an in-process cache inside each app server (fastest, but per-instance and hardest to invalidate), a <b>shared cache</b> cluster, and the database’s own buffer pool.',
        'Each layer absorbs traffic the next never sees. Each one is also another place for stale data to hide — so give every layer an owner, a TTL, and an invalidation story.',
      ],
      scene: {
        nodes: [
          crowd('users', -12, 1, 12, 'browser cache'),
          box('cdn', -6, -4, 'CDN', 'teal', 'globe', { size: [1.4, 1.4], height: 36 }),
          app({ tag: pill('local LRU', 'cpu') }),
          cache(),
          store(8, { tag: pill('buffer pool', 'layers') }),
        ],
        links: [link('users', 'cdn'), link('cdn', 'app'), link('app', 'cache', { arrow: 'both' }), link('app', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'cdn'], { kind: 'hit', back: true, rate: 3 }), flow(['users', 'cdn', 'app', 'cache'], { kind: 'hit', back: true, rate: 1 }), flow(['app', 'db'], { back: true, rate: 0.2 })],
        metrics: { hit: '99%', dbload: '8%', p95: '4 ms', fresh: 'per layer' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Fast, cheap, and slightly wrong',
      body: [
        'Caches trade freshness for speed. <b>Cache-aside</b> keeps hot reads in memory; <b>hit rate</b> decides how much load disappears; <b>TTLs and invalidation</b> bound staleness; <b>eviction</b> handles limited memory.',
        'Plan for the failure modes before they happen: <b>stampedes</b> (coalesce, serve stale, jitter), <b>penetration</b> (negative caching, Bloom filters), and layers that each need an owner.',
      ],
      scene: {
        nodes: [users(), app({ tag: pill('cache-aside', 'bolt') }), cache({ tag: pill('TTL + invalidate', 'clock', 'good') }), store(9)],
        links: wired,
        flows: [flow(['users', 'app', 'cache'], { kind: 'hit', back: true, rate: 4 }), flow(['app', 'db'], { back: true, rate: 0.3 })],
        metrics: { hit: { v: '96%', tone: 'good' }, dbload: { v: '9%', tone: 'good' }, p95: { v: '6 ms', tone: 'good' }, fresh: 'seconds' },
      },
    },
  ],
};

export default lesson;
