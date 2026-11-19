import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -14, 0, 'Requests', 'green', 'users', { size: [1.3, 1.3], height: 24, ...extra });
const cache = (extra: Partial<SceneNode> = {}) => box('cache', -3, 0, 'Cache (fixed size)', 'orange', 'layers', { size: [1.6, 1.6], height: 30, ...extra });
const origin = (extra: Partial<SceneNode> = {}) => db('origin', 9, 0, 'Database / origin', { size: [1.4, 1.4], ...extra });
const slot = (i: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`k${i}`, -9 + i * 4.2, 7, name, 'blue', 'file', { size: [1, 1], height: 14, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);

/** Generalised harmonic number H(n, s) = Σ_{k=1..n} k^−s, with an integral tail for large n. */
function harmonic(n: number, s: number): number {
  const exact = Math.min(n, 1000);
  let sum = 0;
  for (let k = 1; k <= exact; k++) sum += Math.pow(k, -s);
  if (n > exact) {
    if (Math.abs(s - 1) < 1e-9) sum += Math.log(n / exact);
    else sum += (Math.pow(n, 1 - s) - Math.pow(exact, 1 - s)) / (1 - s);
  }
  return sum;
}
/** Hit ratio of a static cache holding the C most popular of N items under Zipf(s) popularity. */
const hitRatio = (c: number, n: number, s: number): number => Math.min(1, harmonic(Math.min(c, n), s) / harmonic(n, s));
/** Smallest cache (number of items) reaching the target hit ratio, by bisection. */
function sizeFor(target: number, n: number, s: number): number {
  let lo = 1;
  let hi = n;
  for (let i = 0; i < 50; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (hitRatio(mid, n, s) >= target) hi = mid;
    else lo = mid + 1;
  }
  return hi;
}

const lesson: Lesson = {
  slug: 'source-cache-eviction-policies',
  title: 'Cache Eviction: LRU, LFU and What Skew Does',
  blurb: 'A cache is smaller than the data, so something must go. How popularity skew decides your hit ratio, how LRU, LFU, FIFO and adaptive policies differ — and how much cache a 90% hit rate actually needs.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'hit', label: 'Hit ratio (best static cache)', icon: 'gauge' },
    { key: 'miss', label: 'Requests reaching the database', icon: 'activity' },
    { key: 'p90', label: 'Cache needed for 90% hits', icon: 'disk' },
    { key: 'p99', label: 'Cache needed for 99% hits', icon: 'disk' },
  ],
  goals: [
    { text: 'Why popularity skew, not cache size alone, decides the hit ratio', step: 2 },
    { text: 'How LRU works and where it fails', step: 3 },
    { text: 'LFU, FIFO, random and the adaptive policies', step: 4 },
    { text: 'Sizing a cache from a target hit ratio', step: 5 },
    { text: 'TTL, size-aware eviction and scan resistance', step: 6 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Distinct items', min: 10000, max: 1000000000, step: 10000, default: 10000000, unit: '', description: 'Keys that could be requested.' },
      { key: 'c', label: 'Items the cache can hold', min: 100, max: 100000000, step: 100, default: 100000, unit: '', description: 'Cache capacity in items.' },
      { key: 's', label: 'Popularity skew (Zipf exponent)', min: 0.5, max: 1.6, step: 0.05, default: 1, unit: '', description: 'About 0.6 is mildly skewed; 1.0 is typical web/content traffic; above 1.2 is heavily concentrated.' },
      { key: 'rps', label: 'Requests per second', min: 100, max: 10000000, step: 100, default: 100000, unit: '/s', description: 'Total read rate.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(10, input.n ?? 1e7);
      const c = Math.min(n, Math.max(1, input.c ?? 1e5));
      const s = Math.max(0.1, input.s ?? 1);
      const rps = Math.max(1, input.rps ?? 1e5);
      const h = hitRatio(c, n, s);
      return {
        hit: step < 1 ? { v: '—' } : { v: `${(h * 100).toFixed(1)}%`, tone: h > 0.9 ? 'good' : h > 0.7 ? 'warn' : 'bad' },
        miss: step < 1 ? { v: '—' } : { v: `${fmtN(rps * (1 - h))}/s of ${fmtN(rps)}/s`, tone: rps * (1 - h) > 20000 ? 'warn' : 'good' },
        p90: step < 4 ? { v: '—' } : { v: `${fmtN(sizeFor(0.9, n, s))} items (${((sizeFor(0.9, n, s) / n) * 100).toFixed(2)}% of keys)` },
        p99: step < 4 ? { v: '—' } : { v: `${fmtN(sizeFor(0.99, n, s))} items (${((sizeFor(0.99, n, s) / n) * 100).toFixed(1)}% of keys)` },
      };
    },
  },
  steps: [
    {
      short: 'Why evict',
      kind: 'problem',
      title: 'The cache is smaller than the data',
      body: [
        'A cache holds a copy of <i>some</i> of the data in fast memory. Because it is far smaller than the full dataset (10 million items vs room for 100,000), every new insertion on a miss must <b>push something out</b>. The <b>eviction policy</b> decides what — and a good policy keeps the items that will be asked for again soon.',
        'The measure is the <b>hit ratio</b>: the share of requests served from the cache. Every miss costs a trip to the database (milliseconds, and load you must provision for), so even a few points of hit ratio change database cost materially: at 100,000 requests/s, going from 90% to 95% hits halves the load reaching the database from 10,000 to 5,000/s.',
      ],
      scene: { nodes: [app(), cache({ tag: pill('full → must evict', 'alert', 'warn') }), origin({ tag: pill('each miss costs', 'clock') })], links: [link('app', 'cache'), link('cache', 'origin', { style: 'dashed' })], flows: [flow(['app', 'cache'], { rate: 2.5 }), flow(['cache', 'origin'], { rate: 0.6 })] },
    },
    {
      short: 'Skew',
      kind: 'insight',
      title: 'Popularity is skewed — that is why caches work at all',
      body: [
        'Real access patterns are <b>heavily skewed</b>: a few items are requested constantly, a long tail rarely. A Zipf distribution models it: the k-th most popular item gets a share proportional to <code>1 ÷ k^s</code>. With <b>s = 1</b> over 10 million items, the top 100,000 (1% of the keys) receive about <b>72% of all requests</b> (<code>ln 100,000 ÷ ln 10,000,000</code> ≈ 0.71); the top 1% is “free” hit ratio.',
        'The exponent matters more than the cache size: at s = 0.6 the same 1% cache gets only ~16% hits, at s = 1.3 about 98%. So measure your skew (log the key frequency distribution) before sizing. The “best static cache” in the metrics is the ideal — hold the C most popular items permanently — which real policies approximate.',
      ],
      changes: [{ text: 's = 1: top 1% of keys ≈ 72% of requests', tone: 'info' }, { text: 'Hit ratio is driven by skew, not just size', tone: 'info' }],
      concepts: [{ term: 'Zipf distribution', def: 'A popularity law in which the item at rank k is requested in proportion to 1/k^s, giving a few hot items and a very long tail.' }],
      scene: { nodes: [app(), cache({ tag: pill('hot 1% of keys', 'bolt', 'good') }), origin({ tag: pill('the long tail', 'list') })], links: [link('app', 'cache'), link('cache', 'origin', { style: 'dashed' })], flows: [flow(['app', 'cache'], { rate: 3 }), flow(['cache', 'origin'], { rate: 0.8 })] },
    },
    {
      short: 'LRU',
      kind: 'technique',
      title: 'LRU: evict the least recently used',
      body: [
        'LRU assumes <b>recency predicts reuse</b>: when full, drop the item untouched for the longest time. Implemented with a <b>hash map plus a doubly linked list</b> — a hit moves the entry to the front (O(1)), an eviction removes from the back (O(1)). It adapts to shifting popularity automatically and is the default in most caches (and CPU page replacement variants).',
        'Weaknesses: a <b>scan</b> — one pass over many items each used once (a report, a crawler, a backup) — flushes the whole cache with junk; and it keeps a rarely-used item that happened to be touched recently while dropping a hot one that was briefly quiet. Strict LRU also needs a lock or global list update on every <i>hit</i>, so production systems use approximations (<b>CLOCK</b>, sampled LRU as in Redis’s <code>allkeys-lru</code>) that avoid contention.',
      ],
      changes: [{ text: 'Hash map + linked list: O(1) hit and evict', tone: 'good' }, { text: 'A one-off scan pollutes the cache', tone: 'bad' }],
      scene: { nodes: [slot(0, 'most recent', { tone: 'green' }), slot(1, 'k2'), slot(2, 'k3'), slot(3, 'k4'), slot(4, 'least recent', { tone: 'red', tag: pill('evict next', 'alert', 'warn') }), cache()], links: [link('k0', 'cache', { style: 'dashed' })], flows: [] },
    },
    {
      short: 'LFU & more',
      kind: 'technique',
      title: 'LFU, FIFO, random and adaptive policies',
      body: [
        '<b>LFU</b> evicts the least <i>frequently</i> used — great when popularity is stable (it converges to the ideal static cache), poor when it shifts: yesterday’s hot items keep high counts and are hard to evict. Real versions age counts (decay) or use compact sketches (<b>TinyLFU</b> with a Count-Min sketch) as an <i>admission</i> filter: a new item only enters if it looks more popular than the one it would displace. <b>FIFO</b> drops the oldest insertion — trivial and fair but ignores usage. <b>Random</b> is surprisingly competitive and needs no bookkeeping.',
        '<b>Adaptive</b> policies balance recency and frequency automatically: <b>ARC</b> and <b>2Q</b> keep separate lists for “seen once” and “seen again” and tune their sizes to the workload, which also makes them <b>scan-resistant</b>; <b>W-TinyLFU</b> (Caffeine) is a modern default that combines a small LRU window with a TinyLFU-filtered main region and often beats LRU by several points of hit ratio.',
      ],
      changes: [{ text: 'LFU: stable popularity · LRU: shifting popularity', tone: 'info' }, { text: 'ARC / 2Q / W-TinyLFU: adaptive and scan-resistant', tone: 'good' }],
      scene: { nodes: [box('lru', -9, -5, 'LRU: recency', 'blue', 'clock', { size: [1.3, 1.3], height: 22 }), box('lfu', 0, -5, 'LFU: frequency', 'orange', 'gauge', { size: [1.3, 1.3], height: 22 }), box('fifo', 9, -5, 'FIFO / random', 'grey', 'list', { size: [1.3, 1.3], height: 18 }), box('arc', 0, 6, 'ARC · 2Q · W-TinyLFU', 'green', 'shield', { size: [1.5, 1.5], height: 26, tag: pill('adaptive + scan-resistant', 'check', 'good') })], links: [], flows: [] },
    },
    {
      short: 'Sizing',
      kind: 'technique',
      title: 'How much cache do you need?',
      body: [
        'Invert the hit-ratio curve: with s = 1 over 10 million keys, a <b>90%</b> hit ratio needs ~<b>1.9 million items (19% of keys)</b> while <b>99%</b> needs ~<b>8.5 million (85%)</b>. Returns diminish sharply: the last 9 points of hit ratio cost 4.5× as much cache as the first 90. Raise the skew to 1.3 and 90% needs only ~1,000 items (0.01% of the keys). Use the sliders to see how strongly the answer depends on s.',
        'So size to the <b>knee</b>, not to a dream number: pick the hit ratio where the database cost saved per extra gigabyte of cache falls below the cost of the gigabyte. Also remember <b>value size</b> — items differ by orders of magnitude, and capacity in bytes, not item count, is what you pay for (see size-aware eviction below).',
      ],
      changes: [{ text: 's = 1, 10M keys: 90% hits needs ~1.9M items; 99% needs ~8.5M', tone: 'info' }, { text: 'Size to the knee of the curve', tone: 'good' }],
      scene: { nodes: [cache({ tag: pill('size = f(target hit, skew)', 'gauge') }), origin({ tag: pill('load = rps × (1 − hit)', 'activity') })], links: [link('cache', 'origin', { style: 'dashed' })], flows: [flow(['cache', 'origin'], { rate: 1 })] },
    },
    {
      short: 'Beyond',
      kind: 'tradeoff',
      title: 'TTL, size-aware eviction and consistency',
      body: [
        'Eviction handles <i>capacity</i>; <b>TTL</b> handles <i>staleness</i> — an item may be evicted early by the policy or expire by time, whichever comes first. Add <b>jitter</b> to TTLs so keys loaded together don’t expire together (see the cache failure modes lesson). <b>Size-aware</b> policies (GDSF and similar) weigh recency/frequency against object size and miss cost: caching a 5 KB hot object is worth more than a 5 MB lukewarm one, and an expensive-to-recompute result deserves more protection than a cheap one.',
        'Practical checklist: choose a policy that resists scans or put scans behind a separate path; set a memory limit and the eviction mode explicitly (Redis defaults to <i>noeviction</i> — writes fail when full); watch <b>evictions per second</b> and hit ratio per key class; and remember that a cold cache after restart has a hit ratio of zero — warm it before sending traffic. Figures here are idealised model outputs.',
      ],
      changes: [{ text: 'TTL = staleness · eviction = capacity', tone: 'info' }, { text: 'Size- and cost-aware eviction for mixed objects', tone: 'good' }],
      scene: { nodes: [cache({ tag: pill('TTL + policy + memory limit', 'shield') }), box('mon', 8, 0, 'Monitor: hit ratio · evictions/s', 'teal', 'gauge', { size: [1.4, 1.4], height: 22 })], links: [link('cache', 'mon', { style: 'dashed' })], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Skew decides, policy tunes',
      body: [
        'The hit ratio under skewed popularity is the share of requests going to the cached top items — <code>H(C, s) ÷ H(N, s)</code> for an ideal cache. <b>LRU</b> adapts to change, <b>LFU</b> to stable popularity, <b>adaptive/TinyLFU</b> policies get both and resist scans. Diminishing returns mean sizing for 99% costs several times more than for 90%.',
        'Measure skew, size to the knee, add TTL jitter, watch evictions, and warm caches after restarts.',
      ],
      scene: { nodes: [app(), cache(), origin()], links: [link('app', 'cache'), link('cache', 'origin', { style: 'dashed' })], flows: [flow(['app', 'cache'], { rate: 2.5 }), flow(['cache', 'origin'], { rate: 0.5 })] },
    },
  ],
};

export default lesson;
