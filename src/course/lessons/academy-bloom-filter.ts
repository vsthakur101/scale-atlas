import type { Lesson, SceneNode } from '../../types';
import { at, box, db, flow, link, pill } from '../kit';

/**
 * Bloom filter. Worked example: m = 10 bits, k = 3 hashes.
 *   alice → bits 1, 5, 8      bob → bits 3, 5, 9
 *   carol → 2, 5, 7  (bit 2 is 0 → definitely absent)
 *   mallory → 1, 3, 8 (all set by other keys → false positive)
 */

const M = 10;
const cell = (i: number, on: boolean, hot = false): SceneNode => ({
  id: `b${i}`,
  kind: 'block',
  at: at(-9 + i * 2, 6),
  tone: hot ? 'orange' : on ? 'green' : 'grey',
  name: on ? '1' : '0',
  size: [0.9, 0.9],
  height: on ? 26 : 8,
  label: { text: String(i) },
});
const bits = (on: number[], hot: number[] = []): SceneNode[] => Array.from({ length: M }, (_, i) => cell(i, on.includes(i), hot.includes(i)));
const key = (id: string, name: string, r: number, extra: Partial<SceneNode> = {}): SceneNode =>
  box(id, r, -5, name, 'blue', 'file', { size: [1.3, 1.3], height: 22, ...extra });
const wire = (from: string, to: number[], style: 'solid' | 'dashed' = 'solid') => to.map((b) => link(from, `b${b}`, { arrow: 'end', style }));

const lookups = box('app', -9, -2, 'Lookups', 'blue', 'search', { size: [1.5, 1.5], height: 36 });
const store = (load: number, extra: Partial<SceneNode> = {}) => db('store', 9, -2, 'Key store', { load, ...extra });
const filterBox = (extra: Partial<SceneNode> = {}) => box('bloom', 0, -2, 'Bloom filter', 'green', 'filter', { size: [1.5, 1.5], height: 36, ...extra });

const fmtBytes = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} KB`);
const fmtRate = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k/s` : `${Math.round(n)}/s`);

const lesson: Lesson = {
  slug: 'academy-bloom-filter',
  title: 'Bloom Filters: Probabilistic Set Membership',
  blurb: 'Answer “is this key in the set?” in a few bits per key — with no false negatives and a false-positive rate you can calculate and tune.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'fpr', label: 'False positives', icon: 'alert' },
    { key: 'mem', label: 'Filter memory', icon: 'cpu' },
    { key: 'reads', label: 'Storage reads', icon: 'disk' },
    { key: 'saved', label: 'Reads avoided', icon: 'bolt' },
  ],
  goals: [
    { text: 'Why “definitely not” is cheaper than “look it up”', step: 1 },
    { text: 'How insert and query set and read k bits', step: 3 },
    { text: 'Why false positives happen but false negatives can’t', step: 5 },
    { text: 'Sizing: bits per key and the optimal hash count', step: 7 },
    { text: 'Saturation and the lack of delete', step: 9 },
  ],
  legend: ['request', 'response', 'heavy', 'hit'],
  dynamic: {
    parameters: [
      { key: 'keys', label: 'Keys the filter is built for', min: 1, max: 2000, step: 1, default: 100, unit: ' M', description: 'Design size n, in millions of keys.' },
      { key: 'bits', label: 'Bits per key (m ÷ n)', min: 4, max: 24, step: 0.5, default: 10, unit: ' bits', description: 'Memory budget per key. ~9.6 bits gives about 1% false positives at the best k.' },
      { key: 'hashes', label: 'Hash functions k', min: 1, max: 16, step: 1, default: 7, unit: '', description: 'Bits set and checked per key. Best value ≈ 0.69 × bits per key.' },
      { key: 'fill', label: 'Keys inserted ÷ design size', min: 40, max: 300, step: 10, default: 100, unit: '%', description: 'Above 100% the filter is over-full.' },
      { key: 'miss', label: 'Lookups for absent keys', min: 0, max: 99, step: 1, default: 90, unit: '%', description: 'Share of lookups whose key is not in the store.' },
      { key: 'lookups', label: 'Lookups', min: 1_000, max: 500_000, step: 1_000, default: 100_000, unit: '/s', description: 'Existence checks per second.' },
    ],
    calculate: (input, step) => {
      const n = (input.keys ?? 100) * 1e6;
      const bitsPerKey = input.bits ?? 10;
      const k = input.hashes ?? 7;
      const fill = (input.fill ?? 100) / 100;
      const miss = (input.miss ?? 90) / 100;
      const rate = input.lookups ?? 100_000;
      // p = (1 − e^(−k·n_inserted/m))^k, with m = n_design × bits/key
      const p = Math.pow(1 - Math.exp((-k * fill) / bitsPerKey), k);
      const mem = (n * bitsPerKey) / 8;
      const noFilter = rate;
      const withFilter = rate * (1 - miss) + rate * miss * p;
      const reads = step === 0 ? noFilter : withFilter;
      const saved = 1 - reads / noFilter;
      return {
        fpr: step === 0 ? { v: '—' } : { v: `${(p * 100).toFixed(p < 0.001 ? 3 : 2)}%`, tone: p < 0.015 ? 'good' : p < 0.06 ? 'warn' : 'bad' },
        mem: step === 0 ? { v: '0' } : { v: fmtBytes(mem) },
        reads: { v: fmtRate(reads), tone: step === 0 ? 'bad' : reads < noFilter * 0.3 ? 'good' : 'warn' },
        saved: { v: step === 0 ? '0%' : `${Math.round(saved * 100)}%`, tone: step === 0 ? undefined : saved > 0.7 ? 'good' : saved > 0.4 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Misses',
      kind: 'problem',
      title: 'Most lookups are for things that aren’t there',
      body: [
        '“Is this username taken?” “Have I crawled this URL?” “Does any file on disk hold this key?” Each asks whether a key is in a huge set — and in the scenario here, 9 in 10 answers are <b>no</b>.',
        'But a “no” still costs a storage read, because the only way to prove a key is absent is to look where it would be. At 100,000 lookups a second, 90,000 of those reads find nothing.',
      ],
      changes: [{ text: '90% of reads return “not found”', tone: 'bad' }],
      concepts: [{ term: 'Membership query', def: 'A question of the form “is x in the set S?” — answered yes or no.' }],
      scene: {
        nodes: [lookups, store(95, { state: 'hot', tag: pill('every lookup reads disk', 'alert', 'bad') })],
        links: [link('app', 'store', { arrow: 'both' })],
        flows: [flow(['app', 'store'], { kind: 'heavy', back: true, rate: 4, speed: 0.6 })],
      },
    },
    {
      short: 'Insert',
      kind: 'technique',
      title: 'A bit array and k hash functions',
      body: [
        'A Bloom filter is an array of <b>m</b> bits, all starting at 0, plus <b>k</b> independent hash functions. To insert a key, hash it k times, take each result modulo m, and set those k bits to 1.',
        'Here m = 10 and k = 3. Inserting <code>alice</code> hashes to bits 1, 5 and 8 and sets them. The key itself is never stored — only the bits it touched.',
      ],
      changes: [{ text: 'insert(alice) → bits 1, 5, 8 set' }],
      concepts: [
        { term: 'Bloom filter', def: 'A bit array plus k hash functions that answers “possibly in the set” or “definitely not”, using a few bits per element.' },
        { term: 'Hash function', def: 'A function mapping a key to a number; a good one spreads keys uniformly over the bit positions.' },
      ],
      scene: {
        nodes: [key('alice', 'alice', 0, { tag: pill('→ bits 1 · 5 · 8', 'hash', 'accent') }), ...bits([1, 5, 8])],
        links: wire('alice', [1, 5, 8]),
        flows: [flow(['alice', 'b1'], { kind: 'write', rate: 0.8 }), flow(['alice', 'b5'], { kind: 'write', rate: 0.8 }), flow(['alice', 'b8'], { kind: 'write', rate: 0.8 })],
      },
    },
    {
      short: 'Overlap',
      kind: 'technique',
      title: 'Keys share bits — that’s the point',
      body: [
        'Insert <code>bob</code>: his hashes are 3, 5 and 9. Bit 5 is already 1 from alice, so it simply stays 1. Two keys sharing a bit costs nothing extra — and is exactly why the structure is so compact.',
        'Setting a bit is one-way: nothing ever turns a 1 back into a 0. Memory is fixed at m bits regardless of key length, and the filter can be built in a single pass.',
      ],
      changes: [{ text: 'insert(bob) → bits 3, 5, 9 (5 already set)' }, { text: 'Set bits: 1, 3, 5, 8, 9' }],
      scene: {
        nodes: [key('alice', 'alice', -6), key('bob', 'bob', 6, { tag: pill('→ bits 3 · 5 · 9', 'hash', 'accent') }), ...bits([1, 3, 5, 8, 9], [5])],
        links: [...wire('alice', [1, 5, 8], 'dashed'), ...wire('bob', [3, 5, 9])],
        flows: [flow(['bob', 'b3'], { kind: 'write', rate: 0.8 }), flow(['bob', 'b9'], { kind: 'write', rate: 0.8 })],
      },
    },
    {
      short: 'Definitely not',
      kind: 'technique',
      title: 'One zero bit proves a key is absent',
      body: [
        'To query <code>carol</code>, hash her the same way: bits 2, 5 and 7. Bit 5 is set, but bit 2 is 0. If carol had been inserted, her insert would have set bit 2 — so she wasn’t. <b>One 0 is proof.</b>',
        'That’s the cheap, certain answer: “definitely not in the set” after reading just k bits from memory. No disk touched.',
      ],
      changes: [{ text: 'query(carol) → bit 2 = 0 → absent', tone: 'good' }],
      scene: {
        nodes: [key('carol', 'carol', 0, { tone: 'orange', tag: pill('→ bits 2 · 5 · 7', 'search', 'accent') }), ...bits([1, 3, 5, 8, 9], [2])],
        links: wire('carol', [2, 5, 7]),
        flows: [flow(['carol', 'b2'], { kind: 'fail', rate: 0.8 })],
      },
    },
    {
      short: 'False positive',
      kind: 'insight',
      title: 'All ones means “probably” — never “certainly”',
      body: [
        'Now query <code>mallory</code>, who was never inserted. Her hashes land on bits 1, 3 and 8 — each set by someone else. Every bit is 1, so the filter says “possibly present”. That’s a <b>false positive</b>, and the cost is one wasted storage read to find out.',
        'The reverse can’t happen. Every bit a key sets stays set, so an inserted key always finds all its bits at 1: there are <b>no false negatives</b>. A “no” is always right; a “yes” is right with a probability you can compute.',
      ],
      note: { kind: 'key', text: 'A Bloom filter trades certainty in one direction for compactness. It only ever errs by saying “maybe” when the truth is “no”.' },
      changes: [{ text: 'query(mallory) → 1, 3, 8 all set → “maybe”', tone: 'bad' }],
      concepts: [{ term: 'False positive', def: 'The filter reports “possibly present” for a key that was never inserted, because other keys set all its bits.' }],
      scene: {
        nodes: [key('mallory', 'mallory', 0, { tone: 'red', tag: pill('→ bits 1 · 3 · 8', 'search', 'bad') }), ...bits([1, 3, 5, 8, 9], [1, 3, 8])],
        links: wire('mallory', [1, 3, 8]),
        flows: [flow(['mallory', 'b1'], { kind: 'heavy', rate: 0.8 }), flow(['mallory', 'b3'], { kind: 'heavy', rate: 0.8 }), flow(['mallory', 'b8'], { kind: 'heavy', rate: 0.8 })],
      },
    },
    {
      short: 'The maths',
      kind: 'technique',
      title: 'How often it’s wrong, and what it costs',
      body: [
        'After n keys, a given bit is still 0 with probability <code>(1 − 1/m)^(kn) ≈ e^(−kn/m)</code>. A query returns a false positive only if all k of its bits are 1, so <code>p ≈ (1 − e^(−kn/m))^k</code>.',
        'Choose the false-positive rate you can live with and memory follows: <code>m/n ≈ 1.44 · log₂(1/p)</code> bits per key. About <b>9.6 bits for 1%</b>, 14.4 for 0.1%, 19.2 for 0.01%. A billion keys at 1% is roughly 1.2 GB — independent of how long the keys are.',
      ],
      note: { kind: 'tip', text: 'Try the sliders: at 10 bits per key and 7 hashes, a 100-million-key filter is ~125 MB and avoids about 89% of disk reads.' },
      changes: [{ text: '100M keys · 10 bits/key → 125 MB', tone: 'good' }, { text: 'p ≈ 0.8% at k = 7', tone: 'good' }],
      concepts: [{ term: 'Bits per key', def: 'm ÷ n. The memory budget that, together with k, fixes the false-positive rate.' }],
      scene: {
        nodes: [lookups, filterBox({ tag: pill('p ≈ (1 − e^(−kn/m))^k', 'calc', 'accent') }), store(30)],
        links: [link('app', 'bloom'), link('bloom', 'store', { style: 'dashed', label: pill('only “maybe” goes on') })],
        flows: [flow(['app', 'bloom'], { kind: 'hit', back: true, rate: 3 }), flow(['bloom', 'store'], { back: true, rate: 0.5 })],
      },
    },
    {
      short: 'Choosing k',
      kind: 'tradeoff',
      title: 'Too few hashes collide; too many fill the array',
      body: [
        'More hash functions make each query stricter — more bits must match — but each insert also sets more bits, filling the array faster. The sweet spot for a given bits-per-key is <code>k = (m/n) · ln 2 ≈ 0.69 · bits per key</code>.',
        'At 10 bits per key the best k is 7; at that optimum exactly half the bits are set and <code>p = 2^(−k)</code>. Use the k slider to see the curve: k = 1 is poor, k = 7 is the minimum, k = 16 is worse again — and costs more hashing per lookup.',
      ],
      changes: [{ text: 'Optimal k ≈ 0.69 × bits per key' }, { text: 'Half the bits set at the optimum' }],
      concepts: [{ term: 'Optimal k', def: 'k = (m/n)·ln 2 minimises the false-positive rate for a fixed m and n.' }],
      scene: {
        nodes: [lookups, filterBox({ tag: pill('k = 7 hashes · 50% bits set', 'hash') }), store(30)],
        links: [link('app', 'bloom'), link('bloom', 'store', { style: 'dashed' })],
        flows: [flow(['app', 'bloom'], { kind: 'hit', back: true, rate: 3 }), flow(['bloom', 'store'], { back: true, rate: 0.5 })],
      },
    },
    {
      short: 'In use',
      kind: 'case',
      title: 'Where it earns its keep',
      body: [
        '<b>LSM-tree databases</b> (the storage engines from the B-tree and LSM lesson) keep a filter per SSTable, so a lookup skips every file that can’t hold the key. <b>Cache penetration</b>: a filter of all valid IDs in front of the cache and database turns floods of lookups for nonexistent keys into memory reads. <b>CDNs</b> can cache an object only on its second request, using a filter to spot “one-hit wonders”.',
        'In each case a rare false positive just means one extra, harmless lookup, while the common case — a certain “no” — avoids the expensive read entirely.',
      ],
      changes: [{ text: 'Absent keys stop at the filter', tone: 'good' }, { text: 'Present keys still read storage' }],
      scene: {
        nodes: [lookups, filterBox({ tag: pill('90% answered here', 'bolt', 'good') }), store(12, { tag: pill('10% + false positives', 'db') })],
        links: [link('app', 'bloom', { arrow: 'both' }), link('bloom', 'store', { arrow: 'both' })],
        flows: [flow(['app', 'bloom'], { kind: 'hit', back: true, rate: 4 }), flow(['bloom', 'store'], { back: true, rate: 0.7 })],
      },
    },
    {
      short: 'Limits',
      kind: 'problem',
      title: 'Saturation, and no way to delete',
      body: [
        'A filter is sized for an expected n. Insert twice that many keys and bits fill up: with 10 bits per key and k = 7, 100% of the design size gives p ≈ 0.8%, but <b>200% gives about 14%</b>. Slide “Keys inserted ÷ design size” to watch it climb. Unbounded sets need a plan — a rebuild, or a chain of filters that each fill up and are replaced.',
        'And you can’t delete: clearing a key’s bits would erase bits other keys depend on, creating false negatives. <b>Counting Bloom filters</b> use small counters instead of bits (about 4× the memory); <b>cuckoo and quotient filters</b> store short fingerprints and support deletion. Otherwise, rebuild — for LSM SSTables that happens naturally on compaction.',
      ],
      changes: [{ text: '2× over-full → p ≈ 14%', tone: 'bad' }, { text: 'Deletes need counting / cuckoo / quotient filters' }],
      concepts: [
        { term: 'Saturation', def: 'When more keys are inserted than the filter was sized for, most bits become 1 and false positives climb quickly.' },
        { term: 'Counting Bloom filter', def: 'A variant using small counters per position so keys can be removed, at several times the memory.' },
      ],
      scene: {
        nodes: [lookups, filterBox({ state: 'hot', tag: pill('over-full: most bits are 1', 'alert', 'bad') }), store(70, { state: 'hot' })],
        links: [link('app', 'bloom'), link('bloom', 'store', { label: pill('too many “maybes”') })],
        flows: [flow(['app', 'bloom'], { back: true, rate: 3 }), flow(['bloom', 'store'], { kind: 'heavy', back: true, rate: 2, speed: 0.6 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A compact “definitely not”',
      body: [
        'A Bloom filter spends <b>about 10 bits per key</b> to answer membership queries with <b>no false negatives</b> and a false-positive rate of <code>(1 − e^(−kn/m))^k</code>. Pick k ≈ 0.69 × bits per key; budget ~9.6 bits for 1%, 14.4 for 0.1%.',
        'Use it as a guard in front of something expensive — disk, a remote cache, a database — where most queries are misses. Size it for the real n, watch for saturation, and remember it can’t delete.',
      ],
      scene: {
        nodes: [lookups, filterBox({ tag: pill('~10 bits/key', 'cpu', 'good') }), store(12)],
        links: [link('app', 'bloom', { arrow: 'both' }), link('bloom', 'store', { arrow: 'both' })],
        flows: [flow(['app', 'bloom'], { kind: 'hit', back: true, rate: 4 }), flow(['bloom', 'store'], { back: true, rate: 0.6 })],
      },
    },
  ],
};

export default lesson;
