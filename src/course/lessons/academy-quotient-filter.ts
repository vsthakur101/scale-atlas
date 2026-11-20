import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const slot = (i: number, name: string, extra: Partial<SceneNode> = {}): SceneNode =>
  box(`s${i}`, -11 + i * 3.2, 4, name, 'blue', 'list', { size: [1.15, 1.15], height: 16, ...extra });
const table = (labels: string[], extra: (i: number) => Partial<SceneNode> = () => ({})) => labels.map((l, i) => slot(i, l, extra(i)));
const item = (extra: Partial<SceneNode> = {}) => box('item', -12, -6, 'key', 'green', 'file', { size: [1.2, 1.2], height: 22, ...extra });
const hash = (extra: Partial<SceneNode> = {}) => box('hash', -2, -6, 'Hash → fingerprint', 'orange', 'hash', { size: [1.3, 1.3], height: 26, ...extra });

const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
const fmtP = (p: number): string => (p >= 0.1 ? `${(p * 100).toFixed(1)}%` : p >= 0.001 ? `${(p * 100).toFixed(2)}%` : `${(p * 100).toFixed(4)}%`);

const lesson: Lesson = {
  slug: 'academy-quotient-filter',
  title: 'Quotient Filters: Compact, Mergeable Approximate Sets',
  blurb: 'A Bloom-filter alternative that stores small fingerprints in a compact table — so it can delete, merge and resize, and stays cache-friendly.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'fpr', label: 'False-positive rate', icon: 'alert' },
    { key: 'bits', label: 'Bits per element', icon: 'gauge' },
    { key: 'bloom', label: 'Bloom filter, same accuracy', icon: 'layers' },
    { key: 'mem', label: 'Memory for the set', icon: 'disk' },
  ],
  goals: [
    { text: 'What a Bloom filter cannot do', step: 1 },
    { text: 'Quotient and remainder: one fingerprint, two jobs', step: 2 },
    { text: 'Runs, clusters and the three metadata bits', step: 4 },
    { text: 'Deleting, resizing and merging', step: 6 },
    { text: 'The accuracy and space formula, and the competition', step: 7 },
  ],
  legend: ['request', 'response', 'write'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Elements stored', min: 100000, max: 1000000000, step: 100000, default: 10000000, unit: '', description: 'Keys inserted into the filter.' },
      { key: 'r', label: 'Remainder bits (r)', min: 3, max: 20, step: 1, default: 8, unit: '', description: 'Bits of each fingerprint stored in the slot; the rest select the slot.' },
      { key: 'load', label: 'Load factor', min: 40, max: 95, step: 1, default: 75, unit: '%', description: 'Fraction of slots occupied; higher saves space but lengthens runs.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, input.n ?? 1e7);
      const r = Math.max(1, Math.round(input.r ?? 8));
      const a = Math.min(0.99, Math.max(0.1, (input.load ?? 75) / 100));
      // Two distinct keys collide when quotient and remainder both match: FPR ≈ 1 − e^(−α / 2^r) ≈ α · 2^−r.
      const fpr = 1 - Math.exp(-a / Math.pow(2, r));
      // Each slot stores r remainder bits plus 3 metadata bits; slots = n ÷ α.
      const bits = (r + 3) / a;
      const bloom = 1.44 * Math.log2(1 / fpr);
      return {
        fpr: step < 5 ? { v: '—' } : { v: fmtP(fpr), tone: fpr < 0.005 ? 'good' : fpr < 0.03 ? 'warn' : 'bad' },
        bits: step < 5 ? { v: '—' } : { v: `${bits.toFixed(1)} bits`, tone: 'good' },
        bloom: step < 5 ? { v: '—' } : { v: `${bloom.toFixed(1)} bits (${bits > bloom ? `QF +${(((bits - bloom) / bloom) * 100).toFixed(0)}%` : 'QF smaller'})`, tone: bits > bloom * 1.4 ? 'warn' : 'good' },
        mem: step < 5 ? { v: '—' } : { v: fmtB((n * bits) / 8) },
      };
    },
  },
  steps: [
    {
      short: 'Limits',
      kind: 'problem',
      title: 'What a Bloom filter can’t do',
      body: [
        'A Bloom filter answers “definitely not present / possibly present” in about 10 bits per key, and is excellent at it. But it has structural limits: you <b>cannot delete</b> a key (clearing its bits could erase others); you <b>cannot resize</b> it without re-inserting every key from the source; each lookup touches <b>k random places</b> in memory, so a large filter costs k cache misses; and you can’t enumerate or merge two filters of different size.',
        'A <b>quotient filter</b> (Bender et al., 2011) keeps the same “possibly present” semantics and false-positive guarantees but stores <i>fingerprints</i> in a table, so it can delete, merge and resize, and reads one small region of memory per lookup. It is the basis of several modern filters, including counting variants.',
      ],
      scene: { nodes: [box('bf', -6, 0, 'Bloom filter', 'orange', 'hash', { size: [1.4, 1.4], height: 24, tag: pill('no delete · no resize · k cache misses', 'alert', 'warn') }), box('qf', 8, 0, 'Quotient filter', 'green', 'layers', { size: [1.4, 1.4], height: 28, tag: pill('delete · merge · resize', 'check', 'good') })], links: [link('bf', 'qf', { arrow: 'end' })], flows: [flow(['bf', 'qf'], { rate: 0.8 })] },
    },
    {
      short: 'Fingerprint',
      kind: 'technique',
      title: 'Hash once, split into quotient and remainder',
      body: [
        'Hash the key to a <b>p-bit fingerprint</b> and split it: the high bits are the <b>quotient q</b>, the low <b>r</b> bits the <b>remainder</b>. The quotient says <i>which slot</i> in a table of 2^q slots the fingerprint belongs to; only the remainder is <i>stored</i> there. The slot position itself carries the other q bits for free — that’s where the space saving comes from.',
        'Lookup recomputes the fingerprint and checks whether that remainder is present at that slot’s home. A false positive happens when a <b>different</b> key has the same quotient and the same remainder — i.e. the same full fingerprint — which is why accuracy depends on r.',
      ],
      concepts: [{ term: 'Quotient / remainder', def: 'The two halves of a fingerprint: the quotient selects the table slot, the remainder is stored in it.' }],
      scene: { nodes: [item(), hash({ tag: pill('quotient | remainder', 'hash') }), ...table(['0', '1', '2 ← q', '3', '4', '5', '6', '7'], (i) => (i === 2 ? { tone: 'orange', tag: pill('store remainder here', 'check', 'good') } : {}))], links: [link('item', 'hash'), link('hash', 's2')], flows: [flow(['item', 'hash', 's2'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Collisions',
      kind: 'problem',
      title: 'Two keys, same quotient',
      body: [
        'Many fingerprints will share a quotient, but a slot holds only one remainder. The fix: remainders with the same quotient are stored in a <b>run</b> — kept <b>sorted</b>, in consecutive slots starting at (or shifted to the right of) their home slot. A run can push into neighbouring slots, displacing other runs; a stretch of contiguous occupied slots is a <b>cluster</b>.',
        'Because runs are sorted, a lookup scans a run and can stop early. Because each remainder keeps its relative order, you can always work out which quotient it belongs to — as long as you have a little extra bookkeeping.',
      ],
      changes: [{ text: 'Same quotient → sorted run of remainders', tone: 'info' }, { text: 'Runs shift right → clusters', tone: 'info' }],
      scene: { nodes: [...table(['—', 'a', 'b ·run·', 'c', '—', 'd', '—', '—'], (i) => (i >= 1 && i <= 3 ? { tone: 'orange' } : i === 5 ? { tone: 'purple' } : { tone: 'grey' }))], links: [], flows: [] },
    },
    {
      short: 'Metadata',
      kind: 'technique',
      title: 'Three bits per slot reconstruct everything',
      body: [
        'Each slot carries <b>3 metadata bits</b> beside its r-bit remainder. <code>is_occupied</code>: some fingerprint has <i>this slot’s</i> quotient (it marks the quotient, not the stored value). <code>is_continuation</code>: this slot holds the second or later remainder of a run. <code>is_shifted</code>: the remainder here is not in its home slot.',
        'From those bits a lookup finds the start of the cluster, counts runs forward to the right run for the quotient, then scans it. Insert places the remainder in sorted order inside the run, shifting later entries right by one. Everything is a short scan of consecutive slots — one or two cache lines — which is why the quotient filter has far better memory locality than Bloom’s k random probes.',
      ],
      changes: [{ text: 'is_occupied · is_continuation · is_shifted', tone: 'info' }, { text: 'Lookups scan contiguous slots (cache-friendly)', tone: 'good' }],
      scene: { nodes: [...table(['occ', 'cont', 'shift', 'rem', 'r', 'r', 'r', 'r'], (i) => (i < 3 ? { tone: 'purple' } : {})), box('meta', 0, -6, '3 bits + r-bit remainder per slot', 'teal', 'layers', { size: [1.4, 1.4], height: 24 })], links: [], flows: [] },
    },
    {
      short: 'Accuracy',
      kind: 'insight',
      title: 'False positives and space',
      body: [
        'Two different keys are confused only if they share quotient <i>and</i> remainder. At load factor α the false-positive rate is about <code>1 − e^(−α ÷ 2^r) ≈ α × 2^(−r)</code>: with r = 8 and α = 75% that’s about <b>0.29%</b>, and each extra remainder bit halves it. Slots hold r + 3 bits and are only α full, so space is <code>(r + 3) ÷ α</code> bits per element — 14.7 bits at the defaults.',
        'Compare a Bloom filter with the same 0.29% error: about <code>1.44 × log₂(1 ÷ ε)</code> = <b>12.1 bits</b>. The quotient filter is roughly 20% larger at this accuracy — the price of its extra abilities. Higher load factors save space but lengthen runs and slow operations sharply above ~90%.',
      ],
      changes: [{ text: 'FPR ≈ α × 2^−r', tone: 'info' }, { text: 'Space = (r + 3) ÷ α bits/element', tone: 'info' }, { text: 'Bloom at equal FPR: ~12 bits; QF ~15', tone: 'info' }],
      scene: { nodes: [box('r8', -8, 0, 'r = 8', 'blue', 'gauge', { size: [1.3, 1.3], height: 24, tag: pill('FPR ≈ 0.29%', 'gauge') }), box('r9', 4, 0, 'r = 9', 'green', 'gauge', { size: [1.3, 1.3], height: 24, tag: pill('FPR ≈ 0.15%', 'gauge', 'good') }), box('sp', 15, 0, '+1 bit/element', 'orange', 'disk', { size: [1.2, 1.2], height: 18 })], links: [link('r8', 'r9', { arrow: 'end' })], flows: [flow(['r8', 'r9'], { rate: 0.8 })] },
    },
    {
      short: 'Delete & merge',
      kind: 'technique',
      title: 'What the table layout gives you',
      body: [
        '<b>Delete</b>: find the remainder in its run, remove it, shift the following entries left and fix the metadata — safe, because each fingerprint occupies exactly one slot. (Deleting a key you never inserted can remove a colliding key’s fingerprint, so only delete what you know is present.) <b>Resize</b>: double the table by turning one remainder bit into a quotient bit — no need for the original keys, since the fingerprint is stored. <b>Merge</b>: because each table’s fingerprints are sorted, two filters merge in one linear pass.',
        'That last property is why quotient-style filters suit LSM-trees and streaming systems: build a small filter per SSTable or per time window, merge as tables compact, and never go back to the source data. Counting quotient filters add a counter to also report multiplicities.',
      ],
      changes: [{ text: 'Delete: remove + shift', tone: 'good' }, { text: 'Resize: move a bit from remainder to quotient', tone: 'good' }, { text: 'Merge: linear pass over sorted fingerprints', tone: 'good' }],
      scene: { nodes: [box('f1', -8, -4, 'Filter 1', 'blue', 'layers', { size: [1.3, 1.3], height: 22 }), box('f2', -8, 5, 'Filter 2', 'orange', 'layers', { size: [1.3, 1.3], height: 22 }), box('m', 4, 0, 'Merge pass', 'teal', 'refresh', { size: [1.2, 1.2], height: 24 }), box('f3', 14, 0, 'Merged filter', 'green', 'layers', { size: [1.5, 1.5], height: 28, tag: pill('no source keys needed', 'check', 'good') })], links: [link('f1', 'm'), link('f2', 'm'), link('m', 'f3')], flows: [flow(['f1', 'm', 'f3'], { rate: 1 }), flow(['f2', 'm', 'f3'], { rate: 1 })] },
    },
    {
      short: 'Compared',
      kind: 'tradeoff',
      title: 'Bloom, cuckoo and quotient filters',
      body: [
        '<b>Bloom</b>: smallest for pure insert-and-query (about 1.44 bits per key per halving of error), simplest, but no delete and k random memory touches. <b>Cuckoo filter</b>: stores fingerprints in buckets with two candidate locations; supports delete and is often smaller than Bloom below ~3% error, but inserts can fail or relocate chains near full load and it can’t merge easily.',
        '<b>Quotient filter</b>: supports delete, merge and resize with good locality, at a bit more space; slows as load climbs and needs care with its shifting logic. Pick Bloom for static or append-only sets, cuckoo for dynamic sets with deletions, quotient when you need merging, resizing or on-disk locality. Figures here are model outputs.',
      ],
      scene: { nodes: [box('b', -9, 0, 'Bloom', 'orange', 'hash', { size: [1.3, 1.3], height: 22, tag: pill('smallest, simple', 'check') }), box('c', 1, 0, 'Cuckoo', 'purple', 'refresh', { size: [1.3, 1.3], height: 24, tag: pill('delete, tight', 'check') }), box('q', 11, 0, 'Quotient', 'green', 'layers', { size: [1.3, 1.3], height: 26, tag: pill('merge · resize · locality', 'check', 'good') })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Store fingerprints compactly, in order',
      body: [
        'A <b>quotient filter</b> hashes each key to a fingerprint, uses the quotient as a slot index and stores only the remainder, keeping colliding remainders in sorted runs tracked by <b>three metadata bits</b>. False-positive rate ≈ <code>α × 2^−r</code>; space ≈ <code>(r + 3) ÷ α</code> bits per element.',
        'It gives up a little space versus Bloom for deletion, merging, resizing and sequential memory access. Use it where filters must be merged or resized (LSM trees, streaming windows) or must live on disk or in cache-sensitive code.',
      ],
      scene: { nodes: [item(), hash(), ...table(['·', 'r', 'r', 'r', '·', 'r', '·', '·'], (i) => ([1, 2, 3, 5].includes(i) ? { tone: 'orange' } : { tone: 'grey' }))], links: [link('item', 'hash'), link('hash', 's2')], flows: [flow(['item', 'hash', 's2'], { kind: 'write', rate: 1 })] },
    },
  ],
};

export default lesson;
