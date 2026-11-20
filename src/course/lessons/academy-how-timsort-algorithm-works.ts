import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const input = (extra: Partial<SceneNode> = {}) => box('input', -17, 0, 'Input array', 'teal', 'list', { size: [1.6, 1.2], height: 14, ...extra });
const runs = (extra: Partial<SceneNode> = {}) => box('runs', -7, 0, 'Detect / build runs', 'orange', 'steps', { size: [1.5, 1.5], height: 26, ...extra });
const stack = (extra: Partial<SceneNode> = {}) => db('stack', 3, -7, 'Run stack (invariants)', { size: [1.4, 1.4], ...extra });
const merge = (extra: Partial<SceneNode> = {}) => box('merge', 3, 6, 'Merge two runs (copy the smaller)', 'purple', 'layers', { size: [1.6, 1.6], height: 28, ...extra });
const out = (extra: Partial<SceneNode> = {}) => box('out', 14, 0, 'Sorted, stable', 'green', 'check', { size: [1.6, 1.2], height: 14, ...extra });
const tmp = (extra: Partial<SceneNode> = {}) => db('tmp', 13, 8, 'Temp buffer (≤ n/2)', { size: [1.2, 1.2], ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);

/** CPython's choice of minimum run length: take the top 6 bits of n, add 1 if any lower bit is set. */
const minRun = (n: number): number => {
  let r = 0;
  let m = Math.floor(n);
  while (m >= 64) {
    r |= m & 1;
    m = Math.floor(m / 2);
  }
  return m + r;
};

const lesson: Lesson = {
  slug: 'academy-how-timsort-algorithm-works',
  title: 'Timsort: Exploiting Existing Order with Runs, Merges and Galloping',
  blurb: 'The hybrid stable sort behind Python, Java object sorts and JavaScript engines: find natural runs, extend short ones with binary insertion sort, merge them under stack invariants — and why sorted or nearly sorted data costs about n comparisons instead of n log n.',
  minutes: 12,
  level: 'Advanced',
  metrics: [
    { key: 'minrun', label: 'Minimum run length chosen for this n', icon: 'calc' },
    { key: 'runs', label: 'Runs to merge', icon: 'layers' },
    { key: 'cmp', label: 'Comparisons (Timsort estimate)', icon: 'activity' },
    { key: 'base', label: 'Comparisons for a plain merge sort (n log₂ n)', icon: 'scale' },
    { key: 'mem', label: 'Worst-case temporary memory', icon: 'disk' },
  ],
  goals: [
    { text: 'The observation: real data is partly sorted', step: 1 },
    { text: 'Runs and minrun with binary insertion sort', step: 2 },
    { text: 'The run stack and merge invariants', step: 3 },
    { text: 'Merging, galloping and temporary memory', step: 4 },
    { text: 'Cost, stability and where it is used', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Elements to sort', min: 100, max: 1000000000, step: 100, default: 1000000, unit: '', description: 'Array length.' },
      { key: 'run', label: 'Typical length of an existing sorted run', min: 1, max: 1000000000, step: 1, default: 1000, unit: '', description: '2 ≈ random data; n = already sorted.' },
      { key: 'bytes', label: 'Bytes per element reference', min: 4, max: 64, step: 4, default: 8, unit: ' B', description: 'Pointer size for the temp-buffer estimate.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(2, Math.round(input.n ?? 1e6));
      const run = Math.min(n, Math.max(1, input.run ?? 1000));
      const bytes = Math.max(1, input.bytes ?? 8);
      const mr = minRun(n);
      // Natural runs shorter than minrun are extended to minrun with binary insertion sort.
      const eff = Math.max(run, mr);
      const r = Math.max(1, Math.ceil(n / eff));
      const runCost = run >= mr ? n : n * Math.log2(Math.max(2, mr));
      const mergeCost = r > 1 ? n * Math.log2(r) : 0;
      const cmp = runCost + mergeCost;
      const base = n * Math.log2(n);
      return {
        minrun: step < 2 ? { v: '—' } : { v: `${mr} (n = ${n.toLocaleString('en-US')})` },
        runs: step < 2 ? { v: '—' } : { v: `${fmtN(r)} (natural run ${fmtN(run)}, effective ${fmtN(eff)})` },
        cmp: step < 3 ? { v: '—' } : { v: fmtN(cmp), tone: cmp < base * 0.6 ? 'good' : 'warn' },
        base: step < 3 ? { v: '—' } : { v: `${fmtN(base)} → Timsort uses ${((cmp / base) * 100).toFixed(0)}%` },
        mem: step < 4 ? { v: '—' } : { v: `${fmtN(((n / 2) * bytes) / 1e3)} KB (n/2 refs)` },
      };
    },
  },
  steps: [
    {
      short: 'Idea',
      kind: 'insight',
      title: 'Real-world data is rarely random',
      body: [
        'Textbook sorting analysis assumes the worst case: a comparison sort needs Ω(n log n) comparisons on <i>random</i> input. But the arrays programs actually sort are often <b>partly ordered</b> — a log file that is mostly in timestamp order with a few late arrivals, a list with a new batch appended to an already sorted one, data sorted by one key and now re-sorted by another (a stable sort preserves the earlier order within ties), or exactly reversed. An algorithm that notices existing order should do far less work on them.',
        '<b>Timsort</b>, designed by Tim Peters for CPython in 2002 (now also the object sort in Java’s <code>Arrays.sort</code>/<code>Collections.sort</code>, Android, V8’s <code>Array.prototype.sort</code>, Swift and Rust’s stable sort in a variant), is exactly this: an <b>adaptive, stable merge sort</b> that finds the <b>runs</b> already in the data, extends short ones, and merges them smartly. It is O(n log n) in the worst case and <b>O(n)</b> for already sorted or reverse-sorted input.',
      ],
      scene: { nodes: [input({ tag: pill('mostly ordered', 'list') }), runs({ tag: pill('find the order that exists', 'search') }), out()], links: [link('input', 'runs'), link('runs', 'out', { style: 'dashed' })], flows: [flow(['input', 'runs', 'out'], { rate: 1.6 })] },
    },
    {
      short: 'Runs',
      kind: 'technique',
      title: 'Natural runs and minrun',
      body: [
        'Timsort scans left to right, finding the longest <b>run</b> from the current position — a maximal ascending (non-decreasing) or <b>strictly descending</b> sequence; a descending run is reversed in place (strictness keeps the sort stable). Finding a run costs only <b>n − 1 comparisons across the whole array</b> if it is one big run. But on random data natural runs average about 2 elements, and merging thousands of tiny runs is inefficient, so Timsort fixes a <b>minimum run length (minrun)</b>.',
        'If a natural run is shorter than minrun, it is <b>extended to minrun by binary insertion sort</b> (insert each next element into the sorted prefix using binary search for the position: O(log k) comparisons each, and cheap element moves for small k because it is cache-friendly). minrun is chosen in <b>32–64</b> so that n ÷ minrun is a power of two or just under it, which makes the later merges balanced: for n = 1,000,000 it is <b>62</b> (the top six bits of n, rounded up if any lower bit is set). With 1,000-element natural runs (≥ minrun) nothing needs extending: <b>1,000 runs</b>, found in about n comparisons.',
      ],
      changes: [{ text: 'Run = ascending, or strictly descending (then reversed)', tone: 'info' }, { text: 'Short runs extended to minrun (32–64) with binary insertion sort', tone: 'info' }, { text: 'n = 1,000,000 → minrun 62', tone: 'info' }],
      concepts: [{ term: 'Natural run', def: 'A maximal already-ordered stretch of the input; Timsort uses these as the starting pieces for merging.' }],
      scene: { nodes: [input({ tag: pill('1 4 7 9 | 3 5 8 | 2 6', 'list') }), runs({ tag: pill('run 1 · run 2 · run 3', 'steps', 'good') }), stack()], links: [link('input', 'runs'), link('runs', 'stack')], flows: [flow(['input', 'runs', 'stack'], { rate: 1.6 })] },
    },
    {
      short: 'Stack',
      kind: 'technique',
      title: 'The run stack and its invariants',
      body: [
        'Each new run is pushed on a <b>stack of pending runs</b>. Merging every pair eagerly would be wasteful (merging a huge run with a tiny one repeatedly), and waiting until the end would make the stack unbounded. So after each push Timsort enforces <b>invariants</b> on the top runs (lengths A, B, C from the top): <code>C &gt; B + A</code> and <code>B &gt; A</code>; if either fails it merges the offending adjacent runs. Only <b>adjacent</b> runs are merged (to keep stability) and the invariants make run lengths grow at least like <b>Fibonacci numbers</b>, so the stack stays O(log n) deep and the merge tree is nearly balanced.',
        'At the end, remaining runs are merged right to left. The cost is bounded by n × log₂(number of runs): with 1,000 runs, about 10 passes over the data, so the total is roughly <b>1,000,000 (finding runs) + 1,000,000 × 9.97 ≈ 11.0 million comparisons</b>, against a plain merge sort’s n log₂ n ≈ 19.9 million — about <b>55%</b>. (Implementation note: the original invariants were subtly insufficient — a 2015 formal-verification effort found an array-overflow case in Java’s version for adversarially built inputs, leading to corrected invariants and a larger stack bound.)',
      ],
      changes: [{ text: 'Invariants C > B + A, B > A keep merges balanced', tone: 'good' }, { text: 'Cost ≈ n + n·log₂(runs): 11.0M vs 19.9M for n = 1M, 1,000 runs', tone: 'good' }],
      scene: { nodes: [runs(), stack({ tag: pill('run lengths ≈ Fibonacci', 'list', 'good') }), merge({ tag: pill('merge when C ≤ B + A', 'layers') })], links: [link('runs', 'stack'), link('stack', 'merge')], flows: [flow(['runs', 'stack', 'merge'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Merge',
      kind: 'technique',
      title: 'Merging with galloping and a small temp buffer',
      body: [
        'To merge two adjacent runs A and B, Timsort first uses <b>binary search</b> to skip the prefix of A already ≤ B’s first element and the suffix of B already ≥ A’s last — often this leaves almost nothing to merge. It then <b>copies only the smaller run</b> into a temp buffer (at most n/2 elements, 4 MB of 8-byte references for 1M elements) and merges back into the array — left-to-right if A is the smaller, right-to-left if B is — so extra memory is at most half the array, not a full copy.',
        'The inner loop is a normal two-pointer merge, but when one run “wins” <b>7 times in a row</b> (<code>MIN_GALLOP</code>) it switches to <b>galloping mode</b>: <b>exponential search</b> (probe 1, 2, 4, 8… elements ahead) then binary search to find how far the winning run extends, and copy that whole block at once. For data where runs interleave in big blocks this turns a linear merge into O(log) comparisons per block; if galloping stops paying off, the threshold adapts and it falls back to element-at-a-time merging, so random data loses little. Comparisons dominate for expensive keys (strings, objects with callbacks), which is exactly where Timsort’s comparison-minimising approach wins.',
      ],
      changes: [{ text: 'Binary-search the overlap first; copy only the smaller run (≤ n/2)', tone: 'good' }, { text: '7 consecutive wins → gallop: exponential + binary search', tone: 'good' }, { text: 'Adaptive: falls back if galloping doesn’t pay', tone: 'info' }],
      scene: { nodes: [merge({ tag: pill('gallop after 7 wins', 'bolt', 'good') }), tmp({ tag: pill('copy of smaller run', 'disk') }), out({ tag: pill('stable result', 'check', 'good') })], links: [link('merge', 'tmp'), link('merge', 'out')], flows: [flow(['merge', 'out'], { kind: 'write', rate: 2 }), flow(['merge', 'tmp'], { rate: 1 })] },
    },
    {
      short: 'Cost',
      kind: 'tradeoff',
      title: 'Cost, stability and where Timsort is — and isn’t — used',
      body: [
        '<b>Complexity</b>: best case O(n) (one run), worst/average O(n log n), memory O(n) worst case (up to n/2 temp). <b>Stable</b>: equal elements keep their original relative order, which is why Python’s sort is safe for multi-key sorting by sorting on the secondary key first, then the primary. Examples (n = 1M): already sorted → about <b>1.0 M</b> comparisons (20× fewer than n log n); one sorted run of 500,000 plus 500,000 random elements → roughly 11–14 M; fully random → ~19.9 M, so no meaningful penalty for adapting. Try the sliders: the number of runs sets the cost, via n log₂(runs).',
        'Usage: Python (<code>list.sort</code>, <code>sorted</code>), Java (<code>Arrays.sort(Object[])</code>, <code>List.sort</code>), JavaScript V8/Node, Android, Swift, and similar stable sorts in Rust (<code>slice::sort</code>, a driftsort/Timsort-descended design). <b>Not used</b> for primitives in Java (dual-pivot quicksort: in-place, no stability needed) or where <b>unstable in-place</b> sorts like introsort (C++ <code>std::sort</code>) or pdqsort are preferred for speed and memory, or where keys are integers and <b>radix/counting sorts</b> beat comparison sorts. Rule: when comparisons are expensive, data is partly ordered, or stability matters — Timsort; when sorting plain numbers in memory-tight loops — a quicksort variant. Figures are model estimates, not measurements.',
      ],
      changes: [{ text: 'Sorted: ~n comparisons (20× fewer for n = 1M); random: ~n log₂ n', tone: 'good' }, { text: 'Stable: sort by secondary key then primary', tone: 'good' }, { text: 'Quicksort/radix for primitives; Timsort for objects and expensive comparisons', tone: 'info' }],
      scene: { nodes: [input({ tag: pill('already sorted: n comparisons', 'check', 'good') }), runs(), out()], links: [link('input', 'runs'), link('runs', 'out')], flows: [flow(['input', 'runs', 'out'], { rate: 2.4 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Find the order that is already there',
      body: [
        '<b>Timsort</b> detects natural runs (reversing descending ones), extends short runs to a minrun of 32–64 with binary insertion sort, pushes them on a stack kept balanced by <b>Fibonacci-like invariants</b>, and merges adjacent runs with <b>galloping</b> and a ≤ n/2 temp buffer.',
        'Cost ≈ n + n·log₂(runs): linear on sorted input, n log n on random, always stable — which is why it is the default stable sort in Python, Java objects and JavaScript.',
      ],
      scene: { nodes: [input(), runs(), stack(), merge(), out()], links: [link('input', 'runs'), link('runs', 'stack'), link('stack', 'merge'), link('merge', 'out')], flows: [flow(['input', 'runs', 'stack', 'merge', 'out'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
