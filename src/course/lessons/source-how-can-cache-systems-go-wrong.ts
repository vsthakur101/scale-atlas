import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -14, 0, 'Requests', 'green', 'users', { size: [1.3, 1.3], height: 24, ...extra });
const cache = (extra: Partial<SceneNode> = {}) => box('cache', -3, 0, 'Cache', 'orange', 'layers', { size: [1.5, 1.5], height: 28, ...extra });
const origin = (extra: Partial<SceneNode> = {}) => db('origin', 9, 0, 'Database', { size: [1.4, 1.4], ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(0)} min` : `${Math.round(s)} s`);

const lesson: Lesson = {
  slug: 'source-how-can-cache-systems-go-wrong',
  title: 'When Caches Go Wrong: Stampede, Penetration and Avalanche',
  blurb: 'The caching failure modes that take databases down — hot-key stampedes, queries for keys that don’t exist, synchronized expiry — with the arithmetic and the fixes for each.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'stamp', label: 'Stampede: concurrent recomputes of one hot key', icon: 'alert' },
    { key: 'single', label: 'With single-flight / lock', icon: 'lock' },
    { key: 'aval', label: 'Avalanche: peak misses/s, same TTL', icon: 'activity' },
    { key: 'jit', label: 'With TTL jitter', icon: 'shield' },
    { key: 'pen', label: 'Penetration: DB queries for missing keys', icon: 'search' },
  ],
  goals: [
    { text: 'Cache stampede on a hot key and single-flight', step: 2 },
    { text: 'Cache avalanche from synchronized expiry and TTL jitter', step: 3 },
    { text: 'Cache penetration: negative caching and Bloom filters', step: 4 },
    { text: 'Hot keys and big keys', step: 5 },
    { text: 'Stale data and invalidation races', step: 6 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'hot', label: 'Requests/s for one hot key', min: 10, max: 200000, step: 10, default: 5000, unit: '/s', description: 'Read rate of a very popular key.' },
      { key: 'recompute', label: 'Time to recompute the value', min: 5, max: 5000, step: 5, default: 200, unit: ' ms', description: 'How long the database query / computation takes on a miss.' },
      { key: 'keys', label: 'Keys cached with the same TTL', min: 100, max: 10000000, step: 100, default: 1000000, unit: '', description: 'Keys loaded together with an identical expiry.' },
      { key: 'ttl', label: 'TTL', min: 10, max: 86400, step: 10, default: 3600, unit: ' s', description: 'Time before the keys expire.' },
      { key: 'jitter', label: 'TTL jitter (± spread)', min: 0, max: 50, step: 1, default: 10, unit: '%', description: 'Random spread added so keys expire at different times.' },
      { key: 'bad', label: 'Requests for non-existent keys', min: 0, max: 100000, step: 100, default: 2000, unit: '/s', description: 'Lookups for ids that are not in the database (bots, typos, attacks).' },
    ],
    calculate: (input, step) => {
      const hot = Math.max(1, input.hot ?? 5000);
      const rc = Math.max(1, input.recompute ?? 200) / 1000;
      const keys = Math.max(1, input.keys ?? 1e6);
      const ttl = Math.max(1, input.ttl ?? 3600);
      const jitter = Math.min(0.9, Math.max(0, (input.jitter ?? 10) / 100));
      const bad = Math.max(0, input.bad ?? 2000);
      // While one recompute runs, every request for the key misses: arrival rate × recompute time.
      const stampede = hot * rc;
      // Keys loaded together all expire in the same instant; each miss then waits for the database.
      const avalPeak = keys / rc;
      const jitterWindow = Math.max(rc, ttl * jitter * 2);
      const avalJit = keys / jitterWindow;
      return {
        stamp: step < 1 ? { v: '—' } : { v: `${fmtN(stampede)} identical queries`, tone: stampede > 100 ? 'bad' : stampede > 10 ? 'warn' : 'good' },
        single: step < 1 ? { v: '—' } : { v: '1 query (others wait or get stale)', tone: 'good' },
        aval: step < 2 ? { v: '—' } : { v: `${fmtN(avalPeak)}/s`, tone: avalPeak > 20000 ? 'bad' : 'warn' },
        jit: step < 2 ? { v: '—' } : { v: `${fmtN(avalJit)}/s (spread over ${fmtT(jitterWindow)})`, tone: avalJit < 5000 ? 'good' : avalJit < 20000 ? 'warn' : 'bad' },
        pen: step < 3 ? { v: '—' } : { v: `${fmtN(bad)}/s hit the database every time`, tone: bad > 1000 ? 'bad' : bad > 100 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'The risk',
      kind: 'problem',
      title: 'A cache hides load — until it can’t',
      body: [
        'A cache lets a database sized for 5,000 queries a second serve 100,000 requests a second. That is a <b>dependency</b>: the database is now provisioned <i>assuming</i> the cache works, so any event that makes many requests miss at once sends orders of magnitude more load to a database that cannot take it — and a database that falls over makes <i>every</i> miss slower, which lengthens recomputes, which creates more concurrent misses.',
        'Three failure modes cover most incidents: <b>stampede</b> (many requests recompute the same expired hot key), <b>avalanche</b> (many keys expire together or the cache itself restarts empty) and <b>penetration</b> (requests for keys that never exist, so they always miss).',
      ],
      scene: { nodes: [app({ tag: pill('100,000 req/s', 'users') }), cache({ state: 'down', tone: 'red', tag: pill('misses at once', 'alert', 'bad') }), origin({ state: 'hot', load: 100, tag: pill('sized for 5,000/s', 'alert', 'bad') })], links: [link('app', 'cache'), link('cache', 'origin')], flows: [flow(['app', 'cache', 'origin'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Stampede',
      kind: 'problem',
      title: 'Stampede (thundering herd) on a hot key',
      body: [
        'A hot key expires. Until someone refills it, <i>every</i> request for it misses and each recomputes the value independently. The number of identical queries is <code>request rate × recompute time</code>: 5,000 req/s × 0.2 s = <b>1,000 simultaneous queries</b> for the same row — which slows the database, lengthening recompute time and making it worse.',
        'Fixes: <b>single-flight / request coalescing</b> — the first requester computes while the others wait on the same in-flight result (in-process and, for fleets, a distributed lock or lease on the key) so exactly <b>1</b> query runs; <b>serve stale while revalidating</b> (a soft TTL: after it, return the old value and refresh in the background); <b>probabilistic early refresh</b> (recompute slightly before expiry with a probability that rises as expiry nears); and <b>refresh-ahead</b> jobs for known-hot keys.',
      ],
      changes: [{ text: '5,000/s × 0.2 s = 1,000 identical queries', tone: 'bad' }, { text: 'Single-flight · stale-while-revalidate · early refresh', tone: 'good' }],
      scene: { nodes: [app({ tag: pill('hot key just expired', 'clock', 'warn') }), cache({ tag: pill('1,000 miss together', 'alert', 'bad') }), origin({ state: 'hot', tag: pill('1,000 identical queries', 'alert', 'bad') })], links: [link('app', 'cache'), link('cache', 'origin')], flows: [flow(['app', 'cache', 'origin'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Avalanche',
      kind: 'problem',
      title: 'Avalanche: everything expires at once',
      body: [
        'Load a million keys at startup with a one-hour TTL and they all expire in the same second an hour later: a million misses arrive almost together — <b>~5,000,000/s</b> of attempted database load at a 200 ms recompute. The same happens when the <b>cache cluster restarts or fails</b> and every key is cold at once.',
        'Defences: <b>TTL jitter</b> — add a random spread (±10% of 3,600 s = a 12-minute window) so expiry is smeared: the same million keys now miss at ~1,400/s, within reach of the database. <b>Warm the cache</b> before taking traffic, <b>rate-limit and shed</b> in front of the database, replicate the cache (a failover node keeps the data), use different TTLs per key class, and keep a circuit breaker so a degraded database sheds requests rather than collapsing.',
      ],
      changes: [{ text: '1M keys, same TTL → ~5M misses/s at the expiry instant', tone: 'bad' }, { text: '±10% jitter → ~1,400/s over 12 minutes', tone: 'good' }, { text: 'Warm caches, replicate, shed load', tone: 'good' }],
      scene: { nodes: [app(), cache({ tag: pill('1M keys expire together', 'clock', 'bad') }), origin({ state: 'hot', tag: pill('burst of misses', 'alert', 'bad') })], links: [link('app', 'cache'), link('cache', 'origin')], flows: [flow(['app', 'cache', 'origin'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Penetration',
      kind: 'problem',
      title: 'Penetration: asking for what doesn’t exist',
      body: [
        'A request for <code>user:9999999999</code> finds nothing in the cache <i>and</i> nothing in the database, so nothing is cached and the next request does it all again. Bots enumerating ids, typos, deleted items and deliberate attacks send these at 2,000/s — <b>every one reaches the database</b>, and an attacker can choose the rate.',
        'Fixes: <b>negative caching</b> — cache “not found” with a short TTL (30–60 s); a <b>Bloom filter</b> of valid keys in front (a “definitely not present” answer skips the database entirely, see the Bloom Filter lesson); <b>input validation</b> (reject ids that can’t exist — wrong format, out of range); and <b>rate limiting</b> per client. Be careful that negative entries are invalidated when the key is later created.',
      ],
      changes: [{ text: 'Missing key: miss + empty DB result, never cached', tone: 'bad' }, { text: 'Negative cache · Bloom filter · validation · rate limits', tone: 'good' }],
      scene: { nodes: [app({ tag: pill('ids that don’t exist', 'alert', 'warn') }), box('bf', -8, 7, 'Bloom filter', 'teal', 'hash', { size: [1.2, 1.2], height: 20, tag: pill('definitely not present', 'check', 'good') }), cache(), origin({ tag: pill('empty result, every time', 'alert') })], links: [link('app', 'bf'), link('app', 'cache'), link('cache', 'origin')], flows: [flow(['app', 'cache', 'origin'], { kind: 'fail', rate: 2.5 })] },
    },
    {
      short: 'Hot & big',
      kind: 'problem',
      title: 'Hot keys and big keys',
      body: [
        'A <b>hot key</b> — one celebrity profile, one viral post — concentrates traffic on a single cache node (hash-partitioned caches send each key to one shard), saturating its CPU or network while others idle. Fixes: replicate hot keys across several shards with a random suffix (<code>key#0…key#7</code>), add a small <b>local (in-process) cache</b> in front with a short TTL, and detect hot keys from access sampling.',
        'A <b>big key</b> (a multi-megabyte list or a huge hash) makes each read slow, blocks a single-threaded cache for the duration (see the Redis lesson) and saturates the network when fetched often. Split large values into chunks or fields, store references instead of blobs, set size limits and delete large keys in the background.',
      ],
      changes: [{ text: 'Replicate hot keys; local cache in front', tone: 'good' }, { text: 'Split or reference big values', tone: 'good' }],
      scene: { nodes: [app(), box('s1', -3, -6, 'Shard 1', 'blue', 'server', { size: [1.2, 1.2], height: 24 }), box('s2', -3, 0, 'Shard 2: hot key', 'red', 'server', { size: [1.2, 1.2], height: 24, state: 'hot', load: 100 }), box('s3', -3, 6, 'Shard 3', 'blue', 'server', { size: [1.2, 1.2], height: 24 })], links: [link('app', 's1'), link('app', 's2'), link('app', 's3')], flows: [flow(['app', 's2'], { kind: 'heavy', rate: 4 }), flow(['app', 's1'], { rate: 0.5 }), flow(['app', 's3'], { rate: 0.5 })] },
    },
    {
      short: 'Staleness',
      kind: 'problem',
      title: 'Stale data and invalidation races',
      body: [
        'Classic race: thread A reads the old value from the database, thread B updates the database and deletes the cache key, then A writes its <b>old value into the cache</b> — and the stale value now lives until the TTL. Safer patterns: <b>delete after the write</b> (cache-aside), delayed double-delete, versioned values/compare-and-set on write-through, or driving invalidation from the database’s change stream (CDC).',
        'Whatever you pick, set a <b>TTL as a safety net</b> so inconsistency is bounded, and decide per data type how stale is acceptable. With multi-layer caches (browser, CDN, application, database) invalidation must reach every layer — or use short TTLs and versioned URLs instead. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Old value written after the invalidation → stale until TTL', tone: 'bad' }, { text: 'TTL safety net + CDC-driven or versioned invalidation', tone: 'good' }],
      scene: { nodes: [box('a', -10, -6, 'Reader A: has old value', 'blue', 'user', { size: [1.2, 1.2], height: 22 }), box('b', -10, 6, 'Writer B: update + delete key', 'orange', 'user', { size: [1.2, 1.2], height: 22 }), cache({ tag: pill('stale value re-inserted', 'alert', 'bad') }), origin()], links: [link('a', 'cache'), link('b', 'origin'), link('b', 'cache', { style: 'dashed' })], flows: [flow(['a', 'cache'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Plan for the miss',
      body: [
        '<b>Stampede</b> = rate × recompute time → single-flight, stale-while-revalidate, early refresh. <b>Avalanche</b> = keys ÷ expiry window → TTL jitter, warming, replication. <b>Penetration</b> = non-existent keys → negative caching, Bloom filters, validation. Also hot/big keys and invalidation races.',
        'Provision the database for the worst miss storm you intend to survive, shed load, and treat the cache as an optimisation that can vanish.',
      ],
      scene: { nodes: [app(), cache(), origin()], links: [link('app', 'cache'), link('cache', 'origin', { style: 'dashed' })], flows: [flow(['app', 'cache'], { rate: 2.5 }), flow(['cache', 'origin'], { rate: 0.5 })] },
    },
  ],
};

export default lesson;
