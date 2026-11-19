import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const roots = (extra: Partial<SceneNode> = {}) => box('roots', -15, 0, 'Roots (stacks, globals)', 'green', 'user', { size: [1.2, 1.2], height: 22, ...extra });
const obj = (id: string, r: number, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, 'blue', 'box', { size: [1, 1], height: 16, ...extra });
const young = (extra: Partial<SceneNode> = {}) => box('young', -4, 7, 'Young generation', 'orange', 'layers', { size: [3, 1.4], height: 14, ...extra });
const old = (extra: Partial<SceneNode> = {}) => box('old', 8, 7, 'Old generation', 'purple', 'layers', { size: [3, 1.4], height: 24, ...extra });

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : ms >= 10 ? `${Math.round(ms)} ms` : `${ms.toFixed(1)} ms`);
const fmtS = (s: number): string => (s >= 120 ? `${(s / 60).toFixed(1)} min` : s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`);

const lesson: Lesson = {
  slug: 'source-how-does-garbage-collection-work',
  title: 'How Garbage Collection Works',
  blurb: 'Reachability, mark-and-sweep, copying and generational collectors — and the arithmetic of pause time, collection frequency and the throughput you give up.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'freq', label: 'Young collection every', icon: 'refresh' },
    { key: 'pause', label: 'Young pause (copying live objects)', icon: 'clock' },
    { key: 'full', label: 'Full-heap mark pause (stop-the-world)', icon: 'alert' },
    { key: 'ovh', label: 'Time lost to young GC pauses', icon: 'gauge' },
  ],
  goals: [
    { text: 'What “garbage” means: unreachable from the roots', step: 1 },
    { text: 'Mark-and-sweep and its costs', step: 2 },
    { text: 'Copying collection and why it’s fast for short-lived data', step: 3 },
    { text: 'The generational hypothesis and young/old collection', step: 4 },
    { text: 'Concurrent collectors and trading pause for throughput', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'alloc', label: 'Allocation rate', min: 10, max: 10000, step: 10, default: 500, unit: ' MB/s', description: 'Memory the application allocates per second.' },
      { key: 'young', label: 'Young generation size', min: 64, max: 32768, step: 64, default: 1024, unit: ' MB', description: 'Space for newly allocated objects before a minor collection.' },
      { key: 'surv', label: 'Objects surviving a young collection', min: 0.1, max: 50, step: 0.1, default: 3, unit: '%', description: 'Share of the young generation still live when collected.' },
      { key: 'copy', label: 'Copy / mark speed', min: 200, max: 5000, step: 100, default: 1000, unit: ' MB/s', description: 'How fast the collector processes live data per thread group.' },
      { key: 'heap', label: 'Live data in the old generation', min: 100, max: 500000, step: 100, default: 8000, unit: ' MB', description: 'Long-lived data a full collection must mark.' },
    ],
    calculate: (input, step) => {
      const alloc = Math.max(1, input.alloc ?? 500);
      const young = Math.max(1, input.young ?? 1024);
      const surv = Math.min(1, Math.max(0.0005, (input.surv ?? 3) / 100));
      const copy = Math.max(1, input.copy ?? 1000);
      const heap = Math.max(1, input.heap ?? 8000);
      // The young generation fills at the allocation rate; each collection copies only what is still live.
      const every = young / alloc;
      const pause = ((young * surv) / copy) * 1000;
      const full = (heap / copy) * 1000;
      const overhead = pause / 1000 / every;
      return {
        freq: step < 3 ? { v: '—' } : { v: fmtS(every), tone: every < 0.5 ? 'warn' : 'good' },
        pause: step < 3 ? { v: '—' } : { v: fmtMs(pause), tone: pause < 20 ? 'good' : pause < 100 ? 'warn' : 'bad' },
        full: step < 1 ? { v: '—' } : { v: fmtMs(full), tone: full < 200 ? 'good' : full < 2000 ? 'warn' : 'bad' },
        ovh: step < 3 ? { v: '—' } : { v: `${(overhead * 100).toFixed(1)}% of wall time`, tone: overhead < 0.02 ? 'good' : overhead < 0.1 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Reachable',
      kind: 'insight',
      title: 'Garbage is whatever the program can no longer reach',
      body: [
        'Manual memory management (<code>malloc</code>/<code>free</code>) is a source of leaks, use-after-free and double-free bugs. A <b>garbage collector</b> reclaims memory automatically by tracing <b>reachability</b>: starting from the <b>roots</b> — thread stacks, registers, static variables — follow every reference; any object <i>not</i> reached cannot be used again, so it is garbage. (Reference counting, used by CPython and Swift, instead frees an object when its count hits zero, but needs separate cycle detection.)',
        'The collector’s design is a trade among three costs: <b>pause time</b> (how long the application stops), <b>throughput</b> (CPU spent collecting) and <b>footprint</b> (extra memory). Every collector below picks a different point on that triangle.',
      ],
      scene: { nodes: [roots(), obj('a', -7, -5, 'A'), obj('b', -1, -5, 'B'), obj('c', 5, -5, 'C'), obj('d', 11, -5, 'D', { state: 'ghost', tone: 'red', tag: pill('unreachable → garbage', 'alert', 'warn') })], links: [link('roots', 'a', { arrow: 'end' }), link('a', 'b', { arrow: 'end' }), link('b', 'c', { arrow: 'end' })], flows: [flow(['roots', 'a', 'b', 'c'], { rate: 1.2 })] },
    },
    {
      short: 'Mark-sweep',
      kind: 'technique',
      title: 'Mark-and-sweep',
      body: [
        '<b>Mark</b>: traverse the object graph from the roots, setting a mark bit on every reachable object. <b>Sweep</b>: scan the whole heap and reclaim everything unmarked, building free lists. Simple, handles cycles, and objects never move (so pointers stay valid) — but the work is proportional to the <b>live heap</b> (marking) plus the <b>whole heap</b> (sweeping), and the heap becomes <b>fragmented</b>, which can make allocation of large objects fail even with free space overall.',
        'Naively it is <b>stop-the-world</b>: the application halts for the whole collection. Marking 8 GB of live data at 1 GB/s is <b>8 seconds</b> — an outage for an interactive service. A variant, <b>mark-sweep-compact</b>, also slides survivors together to remove fragmentation, at extra cost.',
      ],
      changes: [{ text: 'Cost ∝ live heap (mark) + heap size (sweep)', tone: 'bad' }, { text: '8 GB live ÷ 1 GB/s = 8 s stop-the-world', tone: 'bad' }, { text: 'Fragmentation → compaction', tone: 'info' }],
      scene: { nodes: [roots(), obj('a', -7, -5, 'A', { tone: 'green', tag: pill('marked', 'check') }), obj('b', -1, -5, 'B', { tone: 'green' }), obj('c', 5, -5, 'C', { state: 'ghost', tone: 'red', tag: pill('swept', 'alert') })], links: [link('roots', 'a', { arrow: 'end' }), link('a', 'b', { arrow: 'end' })], flows: [flow(['roots', 'a', 'b'], { rate: 1.2 })] },
    },
    {
      short: 'Copying',
      kind: 'technique',
      title: 'Copying collection: touch only the live objects',
      body: [
        'A <b>copying collector</b> splits memory into two spaces. Allocation is a <b>pointer bump</b> in the active space (nearly free). When full, trace from the roots and <b>copy each live object</b> into the empty space, leaving the old space entirely free — dead objects are never touched. The new space is automatically <b>compacted</b> and allocation stays a pointer bump.',
        'Cost is proportional to the <i>live</i> data, not the garbage: if only 3% of a 1 GB space survives, copying 30 MB at 1 GB/s takes <b>30 ms</b>. That makes it ideal for regions where most objects die quickly — and wasteful for regions that are mostly live (copying 8 GB of long-lived data every cycle, and needing twice the memory).',
      ],
      changes: [{ text: 'Allocation = pointer bump', tone: 'good' }, { text: 'Cost ∝ live data only; needs a spare space', tone: 'info' }],
      scene: { nodes: [box('from', -6, 0, 'From-space (3% live)', 'orange', 'layers', { size: [3, 1.4], height: 16 }), box('to', 8, 0, 'To-space (compact)', 'green', 'layers', { size: [3, 1.4], height: 8, tag: pill('copy survivors', 'check', 'good') })], links: [link('from', 'to', { arrow: 'end' })], flows: [flow(['from', 'to'], { rate: 1.2 })] },
    },
    {
      short: 'Generations',
      kind: 'technique',
      title: 'Generational collection: most objects die young',
      body: [
        'The <b>weak generational hypothesis</b>: most objects die soon after allocation (request-scoped data, temporary strings, iterators), and those that survive tend to live a long time. So split the heap: a <b>young generation</b> (collected often by copying — cheap because almost everything is dead) and an <b>old generation</b> (collected rarely by mark-sweep-compact). Objects surviving several young collections are <b>promoted</b>.',
        'The numbers: at 500 MB/s allocation and a 1 GB young generation, a minor collection runs <b>every 2 s</b> and copies only the ~3% survivors: ~30 ms, about <b>1.5% of wall time</b>. A <b>card table / write barrier</b> records old→young pointers so a minor collection needn’t scan the whole old generation. The risks: if survivors are many (a cache or batch job), young pauses grow; promoting short-lived data fills the old generation prematurely, triggering expensive full collections.',
      ],
      changes: [{ text: '1 GB young @ 500 MB/s → minor GC every 2 s', tone: 'info' }, { text: '3% survivors → ~30 ms pause, ~1.5% of time', tone: 'good' }, { text: 'Premature promotion → full GCs', tone: 'bad' }],
      concepts: [{ term: 'Generational hypothesis', def: 'The observation that most objects die young, so collecting a small young region frequently is cheaper than collecting everything.' }],
      scene: { nodes: [young({ tag: pill('collected every ~2 s', 'refresh', 'good') }), old({ tag: pill('collected rarely', 'clock') }), roots()], links: [link('roots', 'young'), link('young', 'old', { arrow: 'end', label: pill('promote survivors', 'share') })], flows: [flow(['young', 'old'], { rate: 0.8 })] },
    },
    {
      short: 'Concurrent',
      kind: 'tradeoff',
      title: 'Concurrent and low-pause collectors',
      body: [
        'Stop-the-world pauses of seconds are unacceptable for latency-sensitive services, so modern collectors do most work <b>while the application runs</b>. <b>Concurrent marking</b> traces the graph in background threads, using a <b>write barrier</b> to catch references the application changes mid-trace (tri-colour invariant, snapshot-at-the-beginning). <b>Incremental / region-based</b> collectors (G1) split the heap into regions and collect the most garbage-rich ones first within a pause budget. <b>Concurrent compacting</b> collectors (ZGC, Shenandoah, Go’s collector, C4) even move objects concurrently using <b>load barriers</b>, keeping pauses to milliseconds regardless of heap size.',
        'The price is <b>throughput and memory</b>: barriers slow the application, concurrent GC threads compete for CPU and you need headroom so the collector keeps up with allocation — if it can’t, the system falls back to a stop-the-world “allocation stall” or full GC. Tune by choosing a collector for your goal (batch throughput vs tail latency), right-sizing the heap with headroom and reducing allocation rate, which is the cheapest lever.',
      ],
      changes: [{ text: 'Concurrent mark + barriers → short pauses', tone: 'good' }, { text: 'Costs: throughput, CPU, memory headroom', tone: 'bad' }, { text: 'Lowest-cost fix: allocate less', tone: 'good' }],
      scene: { nodes: [box('app', -6, 0, 'Application threads', 'green', 'cpu', { size: [1.4, 1.4], height: 26, tag: pill('keep running', 'check') }), box('gc', 8, 0, 'GC threads (concurrent)', 'purple', 'refresh', { size: [1.4, 1.4], height: 26, tag: pill('mark + relocate', 'refresh') })], links: [link('app', 'gc', { arrow: 'both', label: pill('barriers', 'shield') })], flows: [flow(['app', 'gc'], { rate: 1.2, back: true })] },
    },
    {
      short: 'Tuning',
      kind: 'technique',
      title: 'Reading and tuning GC behaviour',
      body: [
        'Start from the logs and metrics: <b>pause durations</b> (p99, max), <b>collection frequency</b>, <b>heap occupancy after GC</b> (the live-set size — a rising floor means a leak), allocation rate, promotion rate. Typical fixes: <b>reduce allocation</b> (reuse buffers, avoid boxing, pool large objects, stream rather than materialise); <b>size the young generation</b> so most request-scoped garbage dies there (a larger young gen collects less often, but each pause scales with survivors, not size); <b>cap object lifetimes</b> in caches; and watch for <b>humongous/large objects</b> that bypass the young generation.',
        'Leaks in managed languages are <i>reachable but unused</i> objects (a growing map, listeners never removed, static caches) — the collector can’t help; heap dumps and allocation profiles find them. Increase the heap only to add headroom, not to postpone an unbounded leak. Figures here are first-order model outputs; always measure on your workload.',
      ],
      changes: [{ text: 'Watch live-set after GC: rising floor = leak', tone: 'info' }, { text: 'Reduce allocation rate first', tone: 'good' }],
      scene: { nodes: [box('mon', -6, 0, 'GC logs + metrics', 'teal', 'gauge', { size: [1.4, 1.4], height: 24, tag: pill('pauses · frequency · live set', 'search') }), box('fix', 8, 0, 'Fix: allocate less, size gens', 'green', 'check', { size: [1.4, 1.4], height: 24 })], links: [link('mon', 'fix', { arrow: 'end' })], flows: [flow(['mon', 'fix'], { rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Pause, throughput, footprint — choose two',
      body: [
        'Garbage = unreachable from the roots. <b>Mark-sweep</b> costs live + heap and fragments; <b>copying</b> costs only live data and compacts; <b>generational</b> collectors exploit short lifetimes (minor GC every <code>young ÷ allocation rate</code>, pause ≈ survivors ÷ copy speed); <b>concurrent</b> collectors trade throughput and headroom for millisecond pauses.',
        'Lower the allocation rate, watch the live set, pick a collector for your latency target and size the heap with headroom.',
      ],
      scene: { nodes: [roots(), young(), old()], links: [link('roots', 'young'), link('young', 'old', { arrow: 'end' })], flows: [flow(['young', 'old'], { rate: 1 })] },
    },
  ],
};

export default lesson;
