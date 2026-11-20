import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const readers = (extra: Partial<SceneNode> = {}) => crowd('readers', -18, 0, 12, 'readers (cache-aside)', extra);
const cache = (extra: Partial<SceneNode> = {}) => db('cache', -6, -7, 'Cache tier', { size: [1.7, 1.7], ...extra });
const dbs = (extra: Partial<SceneNode> = {}) => db('dbs', -6, 8, 'Database (source of truth)', { size: [1.8, 1.8], ...extra });
const inval = (extra: Partial<SceneNode> = {}) => box('inval', 6, 0, 'Invalidation stream (from DB log)', 'purple', 'queue', { size: [1.5, 1.5], height: 24, ...extra });
const writer = (extra: Partial<SceneNode> = {}) => box('writer', 6, 9, 'Writer (updates a row)', 'orange', 'bolt', { size: [1.3, 1.3], height: 22, ...extra });
const mon = (extra: Partial<SceneNode> = {}) => box('mon', 15, -6, 'Consistency checker (re-reads, compares)', 'green', 'search', { size: [1.5, 1.5], height: 24, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);
const nines = (stale: number): string => (stale <= 0 ? '∞ nines' : `${Math.max(0, -Math.log10(stale)).toFixed(1)} nines (${((1 - stale) * 100).toFixed(Math.min(10, Math.max(2, Math.round(-Math.log10(stale)) + 1)))}%)`);

const lesson: Lesson = {
  slug: 'academy-how-meta-achieves-99-99999999-cache-consistency',
  title: 'Cache Consistency: Invalidation Races, Versioned Fills and Measuring Staleness',
  blurb: 'Why a cache in front of a database goes stale even when every invalidation is delivered, the race that causes it, the arithmetic of stale entries versus TTL, and the three layers — versioned fills, reliable invalidation, and an independent consistency checker — that move you from six nines toward ten.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'races', label: 'Stale entries created per day by fill/invalidate races', icon: 'alert' },
    { key: 'stand', label: 'Stale entries standing at any moment (TTL only)', icon: 'layers' },
    { key: 'n0', label: 'Consistency with TTL as the only repair', icon: 'gauge' },
    { key: 'n1', label: 'With a checker repairing within the detection delay', icon: 'search' },
    { key: 'n2', label: 'With versioned fills plus the checker', icon: 'shield' },
  ],
  goals: [
    { text: 'Cache-aside and why invalidation is the hard part', step: 1 },
    { text: 'The race: a stale fill after an invalidation', step: 2 },
    { text: 'Fix the race: versions, leases and tombstones', step: 3 },
    { text: 'Lost invalidations and the TTL backstop', step: 4 },
    { text: 'Measuring consistency in nines and repairing', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'fills', label: 'Cache fills per second (misses)', min: 100, max: 5000000, step: 100, default: 50000, unit: '/s', description: 'Reads that miss and populate the cache.' },
      { key: 'w', label: 'Writes per key per second (cached keys)', min: 0.000001, max: 1, step: 0.000001, default: 0.001, unit: '/s', description: 'Update rate of a typical cached key.' },
      { key: 'win', label: 'Fill window (read DB → set cache)', min: 0.1, max: 500, step: 0.1, default: 5, unit: ' ms', description: 'Time between reading the database and setting the cache entry.' },
      { key: 'ttl', label: 'TTL', min: 1, max: 86400, step: 1, default: 3600, unit: ' s', description: 'How long a stale entry survives if nothing repairs it.' },
      { key: 'keys', label: 'Cached keys', min: 1000000, max: 100000000000, step: 1000000, default: 1000000000, unit: '', description: 'Entries held in the cache tier.' },
      { key: 'inv', label: 'Invalidations per second', min: 100, max: 5000000, step: 100, default: 200000, unit: '/s', description: 'Invalidation events published.' },
      { key: 'loss', label: 'Chance an invalidation is lost or applied wrongly', min: 1e-12, max: 1e-3, step: 1e-12, default: 1e-7, unit: '', description: 'Dropped message, failed delete, mis-ordering.' },
      { key: 'det', label: 'Checker detection and repair delay', min: 1, max: 3600, step: 1, default: 10, unit: ' s', description: 'Time for the checker to find and fix a stale entry.' },
    ],
    calculate: (input, step) => {
      const fills = Math.max(1, input.fills ?? 5e4);
      const w = Math.max(0, input.w ?? 0.001);
      const win = Math.max(0, (input.win ?? 5) / 1000);
      const ttl = Math.max(1, input.ttl ?? 3600);
      const keys = Math.max(1, input.keys ?? 1e9);
      const inv = Math.max(0, input.inv ?? 2e5);
      const loss = Math.min(1, Math.max(0, input.loss ?? 1e-7));
      const det = Math.max(1, input.det ?? 10);
      // A stale fill happens when a write+invalidate lands inside the read→set window (Poisson arrivals).
      const pRace = 1 - Math.exp(-w * win);
      const racePerSec = fills * pRace;
      const lostPerSec = inv * loss;
      const standRace = racePerSec * ttl;
      const standLost = lostPerSec * ttl;
      const s0 = (standRace + standLost) / keys;
      const s1 = ((racePerSec + lostPerSec) * det) / keys;
      const s2 = (lostPerSec * det) / keys;
      return {
        races: step < 2 ? { v: '—' } : { v: `${fmtN(racePerSec * 86400)}/day (race chance ${(pRace * 100).toExponential(1)}% per fill)`, tone: racePerSec * 86400 < 100 ? 'good' : 'warn' },
        stand: step < 4 ? { v: '—' } : { v: `${fmtN(standRace + standLost)} (${fmtN(standRace)} races + ${fmtN(standLost)} lost invalidations)` },
        n0: step < 4 ? { v: '—' } : { v: nines(s0), tone: s0 < 1e-8 ? 'good' : s0 < 1e-6 ? 'warn' : 'bad' },
        n1: step < 5 ? { v: '—' } : { v: nines(s1), tone: s1 < 1e-8 ? 'good' : 'warn' },
        n2: step < 5 ? { v: '—' } : { v: nines(s2), tone: s2 < 1e-9 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Aside',
      kind: 'insight',
      title: 'A cache is a second copy, and copies disagree',
      body: [
        'In the cache-aside pattern (see the Caching lessons) a reader checks the cache; on a miss it reads the database and <b>fills</b> the cache. A writer updates the database and then <b>invalidates</b> (deletes) the cache entry so the next read refetches. This hides database load but creates a second copy of every hot row — and <b>keeping two copies consistent without a distributed transaction</b> is the hard part. Phil Karlton’s joke, “two hard things: cache invalidation and naming things”, is about exactly this.',
        'The question isn’t whether the cache is <i>ever</i> stale — at scale, it will be — but <b>how often, for how long, and whether you can measure it</b>. A system serving billions of reads a second can’t tolerate a stale entry that lives for a TTL of an hour: users see old data after they changed it, and derived systems amplify the error. The model here tracks stale entries and expresses consistency in “nines”: the fraction of cached entries that match the database.',
      ],
      scene: { nodes: [readers(), cache({ tag: pill('1B cached keys', 'db') }), dbs(), writer()], links: [link('readers', 'cache'), link('cache', 'dbs', { style: 'dashed' }), link('writer', 'dbs')], flows: [flow(['readers', 'cache'], { rate: 2, back: true }), flow(['writer', 'dbs'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Race',
      kind: 'problem',
      title: 'The race that survives perfect invalidation',
      body: [
        'Even if every invalidation is delivered instantly, there is a timing hole: (1) reader R misses, <b>reads the database</b> (value v1); (2) writer W updates the row to v2 and <b>invalidates the cache</b> (nothing to delete yet); (3) R, slow by a few milliseconds, <b>sets the cache to v1</b>. The cache now holds an <b>old value that no later invalidation will remove</b>, until its TTL expires or the next write.',
        'It is rare per fill but fills are many. If a cached key is written once every 1,000 s (w = 0.001/s) and the read→set window is 5 ms, the chance a write lands in the window is 1 − e^(−w·window) ≈ <b>5×10⁻⁶</b>. At 50,000 fills/s that is 0.25 stale entries created per second — <b>21,600 a day</b>. Slow fills (cross-region reads, GC pauses, retried requests) lengthen the window; hot keys with frequent writes raise w; both multiply the rate. Stale entries then sit around for the full TTL: 0.25/s × 3,600 s = <b>900 stale entries standing</b> at any time from races alone.',
      ],
      changes: [{ text: 'read DB (v1) → write v2 + invalidate → set cache (v1): stale', tone: 'bad' }, { text: '5 ms window × 0.001 writes/s × 50,000 fills/s = 21,600 stale/day', tone: 'bad' }],
      concepts: [{ term: 'Fill/invalidate race', def: 'A cache fill carrying an old value lands after the invalidation of a newer write, leaving stale data that nothing will invalidate.' }],
      scene: { nodes: [readers({ tag: pill('1 read DB → v1 (slow)', 'clock') }), cache({ state: 'hot', tag: pill('3 set v1 after invalidate', 'alert', 'bad') }), dbs({ tag: pill('v2 committed', 'check') }), writer({ tag: pill('2 write v2 + invalidate', 'bolt') })], links: [link('readers', 'dbs'), link('readers', 'cache'), link('writer', 'dbs'), link('writer', 'cache', { style: 'dashed' })], flows: [flow(['readers', 'dbs'], { rate: 1.2, back: true }), flow(['readers', 'cache'], { kind: 'fail', rate: 1.2 })] },
    },
    {
      short: 'Versions',
      kind: 'technique',
      title: 'Fix the race: versioned fills, leases and tombstones',
      body: [
        '<b>Versioned fills</b>: every row carries a monotonically increasing <b>version</b> (a commit timestamp, LSN, or per-row counter). The cache stores <code>(value, version)</code> and a fill is a <b>compare-and-set</b>: “set only if my version is newer than what’s there”. When the writer’s invalidation arrives first, it leaves a <b>tombstone with the new version</b> (rather than deleting), so the late fill of v1 is rejected because 1 &lt; 2. No stale value can overwrite a newer one, whatever the timing.',
        'Alternatives: <b>leases</b> (the cache hands the missing reader a token; an invalidation voids outstanding tokens, so a late fill with a voided token is refused — also prevents thundering herds), <b>delayed/double delete</b> (invalidate again after the typical fill window — cheap but probabilistic), and <b>write-through with ordering</b> where one component serialises writes to DB and cache. Versioned fills make race-induced staleness effectively zero, leaving only <b>lost invalidations</b> as a source of stale entries.',
      ],
      changes: [{ text: 'Cache stores (value, version); fill = compare-and-set if newer', tone: 'good' }, { text: 'Invalidation leaves a versioned tombstone', tone: 'good' }, { text: 'Race staleness → ~0; lost invalidations remain', tone: 'info' }],
      scene: { nodes: [readers({ tag: pill('fill v1 → rejected (1 < 2)', 'x', 'good') }), cache({ tag: pill('tombstone v2', 'lock', 'good') }), dbs(), writer({ tag: pill('invalidate with v2', 'bolt') })], links: [link('readers', 'cache'), link('writer', 'dbs'), link('writer', 'cache')], flows: [flow(['writer', 'cache'], { kind: 'write', rate: 1.4 }), flow(['readers', 'cache'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Lost',
      kind: 'technique',
      title: 'Lost invalidations, and TTL as the last resort',
      body: [
        'Invalidations travel a pipeline: the database commit log → a tailer → a message bus → cache servers. At 200,000 invalidations/s, even a 10⁻⁷ chance that one is dropped (a restart, an overflow, a mis-ordered or failed delete, a node that was down) produces <b>0.02 lost invalidations a second</b>. Each leaves a stale entry. With a 1-hour TTL those accumulate to <b>72 standing</b> on top of the 900 from races: <b>972 stale of 1 billion = 9.7×10⁻⁷</b>, i.e. <b>6.0 nines</b> (99.99990%).',
        'Defences: build invalidation on the <b>database’s durable log</b> (not best-effort messages from the app), consume it <b>at-least-once and idempotently</b> with replay from a checkpoint so a downed consumer catches up (see the Change Data Capture lesson), apply invalidations <b>in version order</b> per key, and let TTL act as a <b>backstop</b>, not the mechanism. A shorter TTL bounds staleness but raises database load: TTL trades consistency against hit ratio, which is why you don’t want to depend on it.',
      ],
      changes: [{ text: '200,000/s × 10⁻⁷ = 0.02 lost/s → 72 standing at TTL 1 h', tone: 'bad' }, { text: 'TTL only: 972 stale / 1B keys = 6.0 nines', tone: 'info' }, { text: 'Durable-log invalidation, replay, in-order apply; TTL as backstop', tone: 'good' }],
      scene: { nodes: [dbs({ tag: pill('commit log', 'list') }), inval({ state: 'hot', tag: pill('1 in 10⁷ dropped', 'alert', 'warn') }), cache({ tag: pill('stale until TTL', 'clock', 'warn') })], links: [link('dbs', 'inval'), link('inval', 'cache')], flows: [flow(['dbs', 'inval', 'cache'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Measure',
      kind: 'insight',
      title: 'Measure consistency in nines — and repair',
      body: [
        'You can’t improve what you don’t measure, and “we think invalidations are reliable” is not evidence. A <b>consistency checker</b> runs independently of the invalidation path: for each cache write or database change it schedules a <b>re-check after a short delay</b> — read the cache and the database (or follow the change log) and <b>compare versions</b>; a mismatch that persists beyond expected propagation delay is a stale entry, which the checker both <b>counts</b> (the consistency metric, reported in nines) and <b>repairs</b> (invalidates it). It also exposes which bug class produced it (a missed deletion, mis-ordering, a particular tier), turning staleness into debuggable incidents.',
        'The effect on the model: with the checker repairing within 10 s instead of waiting for the 1-hour TTL, standing stale = (0.25 + 0.02) × 10 s = <b>2.7</b>, so staleness falls to 2.7×10⁻⁹ — <b>8.6 nines</b>. Add <b>versioned fills</b> (races gone), leaving only lost invalidations: 0.02 × 10 = <b>0.2</b> standing, 2×10⁻¹⁰ — <b>9.7 nines</b>. Each layer attacks a different term, and the checker is what proves the claim. Figures are model outputs from the stated rates; real systems differ in rates and in how consistency is defined (per read, per key, per time).',
      ],
      changes: [{ text: 'Checker re-reads after a delay, compares versions, counts and repairs', tone: 'good' }, { text: 'Repair in 10 s: 8.6 nines · plus versioned fills: 9.7 nines', tone: 'good' }, { text: 'Report staleness as a metric with an SLO', tone: 'good' }],
      scene: { nodes: [cache({ tag: pill('v2 expected', 'check') }), dbs({ tag: pill('v2 truth', 'check') }), mon({ tag: pill('mismatch → count + invalidate', 'search', 'good') }), inval()], links: [link('mon', 'cache'), link('mon', 'dbs'), link('dbs', 'inval'), link('inval', 'cache')], flows: [flow(['mon', 'cache'], { rate: 1.4, back: true }), flow(['mon', 'dbs'], { rate: 1.4, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Prevent the race, deliver reliably, prove it with a checker',
      body: [
        'A cache goes stale through <b>fill/invalidate races</b> (21,600 a day in this model) and <b>lost invalidations</b>, each lasting a TTL: <b>6.0 nines</b> if TTL is the only repair. <b>Versioned compare-and-set fills</b> remove races; <b>durable, in-order, replayable invalidation</b> shrinks losses; an independent <b>consistency checker</b> bounds staleness duration and measures it: ~9.7 nines.',
        'Treat TTL as a backstop, and consistency as a measured SLO.',
      ],
      scene: { nodes: [readers(), cache(), dbs(), inval(), mon()], links: [link('readers', 'cache'), link('dbs', 'inval'), link('inval', 'cache'), link('mon', 'cache'), link('mon', 'dbs')], flows: [flow(['dbs', 'inval', 'cache'], { kind: 'write', rate: 1.6 })] },
    },
  ],
};

export default lesson;
