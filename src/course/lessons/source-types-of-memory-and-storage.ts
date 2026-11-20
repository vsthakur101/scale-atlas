import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const cpu = (extra: Partial<SceneNode> = {}) => box('cpu', -18, 0, 'CPU core + registers', 'orange', 'cpu', { size: [1.5, 1.5], height: 28, ...extra });
const l1 = (extra: Partial<SceneNode> = {}) => db('l1', -10, -6, 'L1 cache (32–64 KB)', { size: [1.2, 1.2], ...extra });
const l2 = (extra: Partial<SceneNode> = {}) => db('l2', -3, -3, 'L2 cache (0.25–2 MB)', { size: [1.3, 1.3], ...extra });
const l3 = (extra: Partial<SceneNode> = {}) => db('l3', 4, 0, 'L3 cache (shared, tens of MB)', { size: [1.5, 1.5], ...extra });
const dram = (extra: Partial<SceneNode> = {}) => box('dram', 11, 3, 'DRAM (GBs)', 'blue', 'layers', { size: [1.6, 1.6], height: 20, ...extra });
const ssd = (extra: Partial<SceneNode> = {}) => disk('ssd', 17, 6, 'NVMe SSD (TBs)', { size: [2.2, 1], height: 10, tone: 'yellow', ...extra });
const hdd = (extra: Partial<SceneNode> = {}) => disk('hdd', 17, -4, 'Hard disk / network storage (10s of TB+)', { size: [2.6, 1], height: 12, tone: 'yellow', ...extra });

const fmtD = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : s >= 1 ? `${s.toFixed(1)} s` : `${(s * 1000).toFixed(0)} ms`);

const lesson: Lesson = {
  slug: 'source-types-of-memory-and-storage',
  title: 'The Memory Hierarchy: Latency, Capacity, Cost and Average Access Time',
  blurb: 'Registers, three cache levels, DRAM, flash and disk trade speed against size and price; locality makes the trade work. Compute average memory access time, see why pointer-chasing is 100× slower than a scan, and what a terabyte costs in each tier.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'amat', label: 'Average memory access time (AMAT)', icon: 'timer' },
    { key: 'worse', label: 'AMAT if the L1 miss rate doubles', icon: 'alert' },
    { key: 'chase', label: 'Pointer-chasing vs sequential scan of the same data', icon: 'activity' },
    { key: 'cost', label: 'Cost to hold the dataset in DRAM · SSD · disk', icon: 'dollar' },
  ],
  goals: [
    { text: 'Why a hierarchy: fast, big and cheap can’t coexist', step: 1 },
    { text: 'The levels and their orders of magnitude', step: 2 },
    { text: 'How caches work: lines, hits and misses', step: 3 },
    { text: 'AMAT: the formula and its sensitivity', step: 4 },
    { text: 'Writing code that cooperates with the hierarchy', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'write'],
  dynamic: {
    parameters: [
      { key: 'l1t', label: 'L1 hit time', min: 0.3, max: 5, step: 0.1, default: 1, unit: ' ns', description: 'About 4 cycles.' },
      { key: 'l1m', label: 'L1 miss rate', min: 0.1, max: 50, step: 0.1, default: 5, unit: '%', description: 'Accesses not found in L1.' },
      { key: 'l2t', label: 'L2 hit time', min: 1, max: 20, step: 0.5, default: 4, unit: ' ns', description: 'About 12–14 cycles.' },
      { key: 'l2m', label: 'L2 local miss rate', min: 1, max: 80, step: 1, default: 30, unit: '%', description: 'Of accesses reaching L2, share missing.' },
      { key: 'l3t', label: 'L3 hit time', min: 5, max: 60, step: 1, default: 15, unit: ' ns', description: 'Shared last-level cache.' },
      { key: 'l3m', label: 'L3 local miss rate', min: 1, max: 80, step: 1, default: 20, unit: '%', description: 'Of accesses reaching L3, share missing.' },
      { key: 'dr', label: 'DRAM access time', min: 40, max: 300, step: 5, default: 80, unit: ' ns', description: 'Main-memory latency including controller.' },
      { key: 'elems', label: 'Elements in a data structure', min: 1000, max: 10000000000, step: 1000, default: 100000000, unit: '', description: 'Nodes or array entries.' },
      { key: 'bw', label: 'Sequential memory bandwidth', min: 1, max: 100, step: 1, default: 10, unit: ' GB/s', description: 'Streaming throughput of one core.' },
      { key: 'tb', label: 'Dataset to hold', min: 0.01, max: 1000, step: 0.01, default: 10, unit: ' TB', description: 'Data that must be stored.' },
    ],
    calculate: (input, step) => {
      const l1t = Math.max(0.01, input.l1t ?? 1);
      const l1m = Math.min(1, Math.max(0, (input.l1m ?? 5) / 100));
      const l2t = Math.max(0.01, input.l2t ?? 4);
      const l2m = Math.min(1, Math.max(0, (input.l2m ?? 30) / 100));
      const l3t = Math.max(0.01, input.l3t ?? 15);
      const l3m = Math.min(1, Math.max(0, (input.l3m ?? 20) / 100));
      const dr = Math.max(1, input.dr ?? 80);
      const elems = Math.max(1, input.elems ?? 1e8);
      const bw = Math.max(0.1, input.bw ?? 10) * 1e9;
      const tb = Math.max(0.001, input.tb ?? 10);
      const amat = (m1: number) => l1t + m1 * (l2t + l2m * (l3t + l3m * dr));
      const a = amat(l1m);
      const a2 = amat(Math.min(1, l1m * 2));
      const chase = (elems * dr) / 1e9;
      const scan = (elems * 8) / bw;
      const gb = tb * 1000;
      return {
        amat: step < 4 ? { v: '—' } : { v: `${a.toFixed(2)} ns (= ${l1t} + ${(l1m * 100).toFixed(0)}% × (${l2t} + ${(l2m * 100).toFixed(0)}% × (${l3t} + ${(l3m * 100).toFixed(0)}% × ${dr})))`, tone: a < 3 ? 'good' : 'warn' },
        worse: step < 4 ? { v: '—' } : { v: `${a2.toFixed(2)} ns (${(a2 / a).toFixed(1)}× slower)`, tone: a2 / a > 1.3 ? 'bad' : 'warn' },
        chase: step < 5 ? { v: '—' } : { v: `${fmtT(chase)} vs ${fmtT(scan)} (${(chase / scan).toFixed(0)}×)`, tone: chase / scan > 20 ? 'bad' : 'warn' },
        cost: step < 2 ? { v: '—' } : { v: `${fmtD(gb * 3)} · ${fmtD(gb * 0.08)} · ${fmtD(gb * 0.015)} (at $3 · $0.08 · $0.015 per GB)` },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'You can’t have it fast, big and cheap',
      body: [
        'Physics and economics force a trade: the closer and smaller a memory is to the processor, the faster it can be — but it needs more area and power per bit, so it costs more and holds less. SRAM (cache) is fast but takes six transistors per bit; DRAM uses one transistor and a capacitor per bit (denser, cheaper, slower, needs refreshing); flash stores charge in floating-gate cells (cheaper, persistent, much slower); magnetic disks store bits on spinning platters (cheapest per GB, mechanically slow). Latency spans <b>seven orders of magnitude</b>, from a fraction of a nanosecond to milliseconds.',
        'Computers resolve the trade with a <b>hierarchy</b> that exploits <b>locality of reference</b>: <i>temporal</i> (data used recently is likely used again soon) and <i>spatial</i> (data near recently used data is likely used next — the next array element, the next instruction). Keep the working set in the small fast levels, and the system behaves as if all of memory were fast. How well that works is measurable, as the average-access-time formula below shows.',
      ],
      scene: { nodes: [cpu(), l1(), l2(), l3(), dram(), ssd(), hdd()], links: [link('cpu', 'l1'), link('l1', 'l2'), link('l2', 'l3'), link('l3', 'dram'), link('dram', 'ssd'), link('dram', 'hdd')], flows: [flow(['cpu', 'l1', 'l2', 'l3', 'dram'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Levels',
      kind: 'technique',
      title: 'The levels, and orders of magnitude to remember',
      body: [
        '<b>Registers</b> (~0.3 ns, a few hundred bytes) · <b>L1 cache</b> (~1 ns, 32–64 KB per core, split instruction/data) · <b>L2</b> (~4 ns, 0.25–2 MB per core) · <b>L3</b> (~15 ns, shared, 8–100+ MB) · <b>DRAM</b> (~80–100 ns, GBs–TBs, ~$3 per GB) · <b>NVMe SSD</b> (~20–100 µs random read, GBs/s sequential, ~$0.08 per GB) · <b>SATA SSD</b> (~100 µs) · <b>hard disk</b> (~5–10 ms seek, 100–250 MB/s, ~$0.015 per GB) · <b>network storage / object store</b> (~1 ms in-region to 100 ms+ across regions). Each step is roughly 5–100× slower and 10–100× larger than the one before — and 10–50× cheaper per byte.',
        'Holding a <b>10 TB dataset</b> costs about <b>$30,000 in DRAM</b>, <b>$800 on NVMe</b> and <b>$150 on disk</b> — a 200× spread that explains tiered architectures: hot data in memory (caches, in-memory databases — see the Redis and Caching lessons), warm on SSD (OLTP databases, LSM trees — see the B-tree vs LSM lesson), cold on disk or object storage (archives, backups, columnar data lakes). Also <b>non-volatile vs volatile</b>: everything above flash vanishes at power-off, which is why the write-ahead log exists (see the ACID lesson). Treat the numbers as orders of magnitude that move slowly: capacity and bandwidth keep improving, latency barely does.',
      ],
      changes: [{ text: 'L1 ~1 ns · L2 ~4 · L3 ~15 · DRAM ~80 ns · NVMe ~100 µs · HDD ~8 ms', tone: 'info' }, { text: '10 TB: $30,000 DRAM · $800 NVMe · $150 disk', tone: 'info' }, { text: 'Tier by temperature: hot RAM, warm SSD, cold disk/object store', tone: 'good' }],
      scene: { nodes: [l1({ tag: pill('~1 ns', 'timer', 'good') }), l3({ tag: pill('~15 ns', 'timer') }), dram({ tag: pill('~80 ns · $3/GB', 'timer') }), ssd({ tag: pill('~100 µs · $0.08/GB', 'timer', 'warn') }), hdd({ tag: pill('~8 ms · $0.015/GB', 'timer', 'bad') })], links: [link('l1', 'l3'), link('l3', 'dram'), link('dram', 'ssd'), link('dram', 'hdd')], flows: [flow(['l1', 'l3', 'dram', 'ssd'], { rate: 1.6 })] },
    },
    {
      short: 'Caches',
      kind: 'technique',
      title: 'How caches work: lines, sets and misses',
      body: [
        'Caches move data in <b>cache lines</b> — 64 bytes. Touching one byte fetches its whole line, so reading the next seven 8-byte array elements is nearly free (spatial locality). A cache is organised in <b>sets</b> with N <b>ways</b> (e.g. 8-way set-associative): an address maps to one set and may sit in any of its ways, with an LRU-like replacement choosing what to evict. A <b>hit</b> returns in the level’s hit time; a <b>miss</b> goes down a level, fills the line (evicting another), and the access time accumulates.',
        'Misses come in three kinds: <b>compulsory</b> (first touch), <b>capacity</b> (the working set exceeds the cache) and <b>conflict</b> (too many addresses map to one set — a stride of 4 KB across a 32 KB 8-way cache can thrash a few sets while others sit empty). Hardware <b>prefetchers</b> detect sequential and strided patterns and fetch ahead, hiding DRAM latency for streaming loops but not for pointer chasing. Multi-core adds <b>coherence</b>: cores’ L1/L2 copies of a line are kept consistent (MESI), so two cores writing different variables on the same line fight over it (<b>false sharing</b>) and a contended lock bounces between caches. Virtual-to-physical translation caches (the <b>TLB</b>, see the Virtual Memory lesson) are another level of the same idea.',
      ],
      changes: [{ text: '64-byte lines; set-associative with LRU-like replacement', tone: 'info' }, { text: 'Misses: compulsory, capacity, conflict', tone: 'info' }, { text: 'Prefetchers help streams, not pointer chasing; false sharing costs coherence traffic', tone: 'bad' }],
      concepts: [{ term: 'Cache line', def: 'The 64-byte unit in which memory is moved into the cache; accessing any byte brings in its whole line.' }],
      scene: { nodes: [cpu({ tag: pill('load addr 0x1040', 'search') }), l1({ tag: pill('line 0x1040–0x107F', 'check') }), l2(), l3()], links: [link('cpu', 'l1'), link('l1', 'l2'), link('l2', 'l3')], flows: [flow(['cpu', 'l1'], { rate: 2, back: true }), flow(['l1', 'l2', 'l3'], { rate: 1, back: true })] },
    },
    {
      short: 'AMAT',
      kind: 'insight',
      title: 'Average memory access time',
      body: [
        '<b>AMAT = L1 hit time + L1 miss rate × (L2 hit time + L2 miss rate × (L3 hit time + L3 miss rate × DRAM time))</b>. With L1 1 ns / 5% misses, L2 4 ns / 30% of those miss, L3 15 ns / 20% of those miss, DRAM 80 ns: the inner term is 15 + 0.2 × 80 = 31 ns; then 4 + 0.3 × 31 = 13.3 ns; then <b>1 + 0.05 × 13.3 = 1.67 ns</b>. Even though DRAM is 80× slower than L1, the average access is only 1.7× the L1 time because 95% of accesses never leave it.',
        'The formula’s lesson is its <b>sensitivity</b>: double the L1 miss rate to 10% and AMAT rises to <b>2.33 ns (+40%)</b> — a program that merely has a slightly worse access pattern runs ~40% slower with no change in instruction count. Real programs’ miss rates swing from under 1% (tight loops over small arrays) to 30%+ (random access to a working set far larger than the cache), so the same algorithm can differ 10–50× in speed purely through memory behaviour. This is why “O(n)” isn’t the whole story: the constant factor is the cache.',
      ],
      changes: [{ text: 'AMAT = 1 + 5% × (4 + 30% × (15 + 20% × 80)) = 1.67 ns', tone: 'info' }, { text: 'L1 miss rate 5% → 10%: AMAT 2.33 ns (+40%)', tone: 'bad' }],
      scene: { nodes: [cpu({ tag: pill('AMAT 1.67 ns', 'timer', 'good') }), l1({ tag: pill('95% hit', 'check', 'good') }), l2({ tag: pill('70% of misses', 'check') }), l3({ tag: pill('80% of the rest', 'check') }), dram({ tag: pill('80 ns', 'timer', 'warn') })], links: [link('cpu', 'l1'), link('l1', 'l2'), link('l2', 'l3'), link('l3', 'dram')], flows: [flow(['cpu', 'l1', 'l2', 'l3', 'dram'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Layout',
      kind: 'tradeoff',
      title: 'Writing code that cooperates with the hierarchy',
      body: [
        '<b>Sequential beats random.</b> Summing 100 million 8-byte values in a contiguous array streams 800 MB at ~10 GB/s: <b>0.08 s</b>. Walking a linked list of 100 million nodes scattered across the heap makes each load <i>depend on the previous one</i>, so the prefetcher can’t help and every node costs a DRAM-latency miss: 10⁸ × 80 ns = <b>8 seconds — 100× slower</b> for the same logical work. Rules: prefer <b>arrays/vectors over linked structures</b> (Java <code>ArrayList</code> over <code>LinkedList</code>, B-trees and open-addressing hash tables over pointer-heavy trees and chained buckets); <b>iterate in memory order</b> (row-major loops over row-major matrices; tile/block large matrices to fit cache); pack hot fields together and <b>split hot from cold</b> (struct-of-arrays so a loop touching one field doesn’t drag the others through the cache).',
        'Also: keep working sets within cache sizes where possible (batch and block algorithms), avoid <b>false sharing</b> by padding per-thread counters to separate cache lines, use smaller types and compression to fit more per line, <b>prefetch explicitly</b> for known access patterns, and let data size choose structure (a 1,000-element sorted array with binary search often beats a tree). At system scale the same logic repeats: sequential I/O beats random (disk, SSD, network), batching amortises latency, and caching is the universal fix. Measure with <code>perf stat</code> (cache-misses, LLC-load-misses) rather than guessing. All figures here are model outputs with typical latencies.',
      ],
      changes: [{ text: '100M elements: array scan 0.08 s vs pointer chase 8 s (100×)', tone: 'bad' }, { text: 'Arrays over linked lists; iterate in memory order; struct-of-arrays', tone: 'good' }, { text: 'Pad against false sharing; measure cache misses with perf', tone: 'good' }],
      scene: { nodes: [cpu({ tag: pill('array scan: prefetched', 'check', 'good') }), dram({ tag: pill('linked list: 80 ns per node', 'alert', 'bad') }), l1(), l3()], links: [link('cpu', 'l1'), link('l1', 'l3'), link('l3', 'dram')], flows: [flow(['cpu', 'l1'], { rate: 2.4, back: true }), flow(['l3', 'dram'], { kind: 'heavy', rate: 3, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Locality turns a hierarchy into one fast memory',
      body: [
        'A <b>hierarchy</b> of SRAM caches, DRAM, flash and disk spans ~10⁷ in latency and ~200× in cost per GB; <b>locality</b> keeps most accesses at the top. <b>AMAT</b> (here 1.67 ns) is sensitive to the L1 miss rate (+40% when it doubles), and access <b>pattern</b> dominates: a scan runs 100× faster than pointer chasing.',
        'Choose arrays, iterate in memory order, tier data by temperature, and measure misses.',
      ],
      scene: { nodes: [cpu(), l1(), l2(), l3(), dram(), ssd(), hdd()], links: [link('cpu', 'l1'), link('l1', 'l2'), link('l2', 'l3'), link('l3', 'dram'), link('dram', 'ssd'), link('dram', 'hdd')], flows: [flow(['cpu', 'l1', 'l2', 'l3', 'dram'], { rate: 1.6, back: true })] },
    },
  ],
};

export default lesson;
