import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const cpu = (extra: Partial<SceneNode> = {}) => box('cpu', -16, 0, 'CPU: virtual address', 'green', 'cpu', { size: [1.3, 1.3], height: 28, ...extra });
const tlb = (extra: Partial<SceneNode> = {}) => box('tlb', -8, -5, 'TLB (cache of translations)', 'teal', 'layers', { size: [1.3, 1.3], height: 22, ...extra });
const pt = (extra: Partial<SceneNode> = {}) => box('pt', -2, 5, 'Page tables (in memory)', 'orange', 'list', { size: [1.3, 1.3], height: 22, ...extra });
const ram = (extra: Partial<SceneNode> = {}) => db('ram', 8, 0, 'Physical memory', { size: [1.5, 1.5], ...extra });
const swap = (extra: Partial<SceneNode> = {}) => disk('swap', 16, 6, 'Disk / swap', { size: [2.6, 1.1], height: 14, tone: 'grey', ...extra });

const fmtNs = (ns: number): string => (ns >= 1000 ? `${(ns / 1000).toFixed(1)} µs` : `${ns.toFixed(ns < 10 ? 2 : 1)} ns`);

const lesson: Lesson = {
  slug: 'source-paging-vs-segmentation',
  title: 'Virtual Memory: Paging, Segmentation and the TLB',
  blurb: 'How the OS gives each process a private address space, why paging beat segmentation, and the effective-access-time arithmetic of TLB misses, page-table walks and page faults.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'eat', label: 'Effective memory access time', icon: 'clock' },
    { key: 'slow', label: 'Slowdown vs raw memory', icon: 'gauge' },
    { key: 'walk', label: 'Memory reads on a TLB miss', icon: 'search' },
    { key: 'fault', label: 'Page-fault share of the average', icon: 'alert' },
  ],
  goals: [
    { text: 'What virtual memory provides: isolation and abstraction', step: 1 },
    { text: 'Segmentation and why it fragments', step: 2 },
    { text: 'Paging: fixed-size pages and the page table', step: 3 },
    { text: 'The TLB and multi-level page tables', step: 4 },
    { text: 'Page faults, demand paging and thrashing', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'hit', label: 'TLB hit rate', min: 80, max: 99.99, step: 0.01, default: 99, unit: '%', description: 'Share of translations found in the TLB.' },
      { key: 'levels', label: 'Page-table levels', min: 1, max: 5, step: 1, default: 4, unit: '', description: 'Levels walked on a miss (x86-64 uses 4 or 5).' },
      { key: 'mem', label: 'Memory access time', min: 20, max: 300, step: 5, default: 100, unit: ' ns', description: 'DRAM latency for one access.' },
      { key: 'tlb', label: 'TLB lookup time', min: 0.2, max: 5, step: 0.1, default: 1, unit: ' ns', description: 'Time to probe the TLB.' },
      { key: 'fault', label: 'Page faults per million accesses', min: 0, max: 10000, step: 1, default: 1, unit: '', description: 'Accesses that find the page not in RAM.' },
      { key: 'svc', label: 'Page-fault service time', min: 1, max: 20000, step: 1, default: 100, unit: ' µs', description: 'Time to bring a page in (SSD ≈ 100 µs, spinning disk ≈ 5–10 ms).' },
    ],
    calculate: (input, step) => {
      const h = Math.min(0.9999, Math.max(0.5, (input.hit ?? 99) / 100));
      const L = Math.max(1, Math.round(input.levels ?? 4));
      const m = Math.max(1, input.mem ?? 100);
      const t = Math.max(0.01, input.tlb ?? 1);
      const f = Math.max(0, (input.fault ?? 1) / 1e6);
      const svc = Math.max(0.1, input.svc ?? 100) * 1000; // ns
      // Hit: TLB + one memory access. Miss: TLB + walk (L reads) + the data access.
      const base = h * (t + m) + (1 - h) * (t + (L + 1) * m);
      const faultCost = f * svc;
      const eat = base + faultCost;
      return {
        eat: step < 3 ? { v: '—' } : { v: fmtNs(eat), tone: eat < m * 1.15 ? 'good' : eat < m * 2 ? 'warn' : 'bad' },
        slow: step < 3 ? { v: '—' } : { v: `${(eat / m).toFixed(2)}×`, tone: eat / m < 1.15 ? 'good' : eat / m < 2 ? 'warn' : 'bad' },
        walk: step < 3 ? { v: '—' } : { v: `${L} table reads + 1 data read` },
        fault: step < 4 ? { v: '—' } : { v: `${((faultCost / eat) * 100).toFixed(1)}% (${fmtNs(faultCost)} per access)`, tone: faultCost / eat < 0.05 ? 'good' : faultCost / eat < 0.3 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'Every process gets its own address space',
      body: [
        'Programs use <b>virtual addresses</b>; the hardware and OS translate them to <b>physical</b> addresses. That gives each process the illusion of a large, private, contiguous memory: <b>isolation</b> (one process can’t read or corrupt another’s memory), <b>simplicity</b> (every program can assume the same layout), and <b>flexibility</b> (memory can be larger than RAM, shared between processes, mapped to files, or moved without the program noticing).',
        'The translation must happen on <i>every</i> memory access, so it must be both flexible and nearly free. How it is organised — segments or pages — determines fragmentation, protection granularity and speed.',
      ],
      scene: { nodes: [cpu({ tag: pill('0x7fff1234', 'hash') }), box('mmu', -6, 0, 'MMU', 'purple', 'route', { size: [1.3, 1.3], height: 26, tag: pill('virtual → physical', 'refresh') }), ram({ tag: pill('0x0042a234', 'hash') })], links: [link('cpu', 'mmu'), link('mmu', 'ram')], flows: [flow(['cpu', 'mmu', 'ram'], { rate: 2 })] },
    },
    {
      short: 'Segments',
      kind: 'technique',
      title: 'Segmentation: variable-size regions',
      body: [
        'Segmentation divides the address space into <b>logical segments</b> — code, data, heap, stack — each with a <b>base</b> and a <b>limit</b>. An address is (segment, offset); the hardware checks <code>offset &lt; limit</code> and adds the base. It matches how programmers think, makes protection per segment natural (code read-only, stack no-execute) and sharing easy.',
        'The flaw: segments are <b>variable-sized</b> and must be <i>contiguous</i> in physical memory, so allocation causes <b>external fragmentation</b> — plenty of free memory in total but no single hole big enough — and growing a segment may require moving it. Compaction is costly. Pure segmentation has largely disappeared from modern 64-bit systems (x86-64 keeps segment registers mainly for thread-local storage).',
      ],
      changes: [{ text: '(segment, offset) → base + offset, checked against limit', tone: 'info' }, { text: 'Variable sizes → external fragmentation', tone: 'bad' }],
      scene: { nodes: [box('code', -6, -5, 'Code segment', 'blue', 'file', { size: [2, 1.2], height: 14 }), box('heap', -6, 0, 'Heap segment', 'orange', 'file', { size: [3, 1.2], height: 14 }), box('stack', -6, 5, 'Stack segment', 'purple', 'file', { size: [1.6, 1.2], height: 14 }), ram({ tag: pill('holes between segments', 'alert', 'warn') })], links: [link('code', 'ram'), link('heap', 'ram'), link('stack', 'ram')], flows: [] },
    },
    {
      short: 'Paging',
      kind: 'technique',
      title: 'Paging: fixed-size pages and frames',
      body: [
        'Paging cuts both address spaces into <b>fixed-size blocks</b> — <b>pages</b> (virtual, typically 4 KB) and <b>frames</b> (physical, same size). A virtual address splits into a <b>page number</b> and an <b>offset</b>; a <b>page table</b> maps each page number to a frame (plus permission bits: present, writable, user, no-execute, dirty, accessed). Any page can go in any frame, so <b>there is no external fragmentation</b>, and the OS can place, share, swap and protect memory in page-sized units.',
        'The costs: <b>internal fragmentation</b> (the last page of an allocation is partly wasted — on average half a page) and the <b>page table’s size</b>. A flat table for a 48-bit address space with 4 KB pages would need 2³⁶ entries × 8 B = <b>512 GB per process</b> — impossible, hence multi-level tables.',
      ],
      changes: [{ text: 'Virtual = page number + offset; table maps page → frame', tone: 'info' }, { text: 'No external fragmentation; some internal waste', tone: 'good' }, { text: 'Flat table would be 512 GB per process', tone: 'bad' }],
      concepts: [{ term: 'Page table', def: 'A per-process structure mapping virtual page numbers to physical frames, with permission and status bits.' }],
      scene: { nodes: [cpu({ tag: pill('page 7 · offset 0x34', 'hash') }), pt({ tag: pill('7 → frame 123', 'check') }), ram({ tag: pill('frame 123 + 0x34', 'hash') })], links: [link('cpu', 'pt'), link('pt', 'ram')], flows: [flow(['cpu', 'pt', 'ram'], { rate: 2 })] },
    },
    {
      short: 'TLB',
      kind: 'technique',
      title: 'Multi-level tables and the TLB',
      body: [
        'Real page tables are <b>trees</b> (x86-64: four or five levels of 512-entry tables): only the parts of the address space actually in use have tables allocated, so sparse address spaces are cheap. The price is a <b>page walk</b>: translating one address needs <b>L memory reads</b> (one per level) before the data access itself — 5 memory accesses instead of 1.',
        'That would be a 5× slowdown, so the CPU caches recent translations in the <b>TLB</b> (translation lookaside buffer). On a hit the translation costs ~1 ns. With a 99% hit rate, memory taking 100 ns and a 4-level walk: effective access time <code>= 0.99 × (1 + 100) + 0.01 × (1 + 5 × 100)</code> ≈ <b>105 ns</b> — only 5% over raw memory. At 95% hits it is ~121 ns; at 80%, ~181 ns. <b>Huge pages</b> (2 MB or 1 GB) make each TLB entry cover far more memory, which is why databases and VMs use them.',
      ],
      changes: [{ text: 'EAT = h × (t + m) + (1 − h) × (t + (L + 1) × m)', tone: 'info' }, { text: '99% hits → ~105 ns · 95% → ~121 ns · 80% → ~181 ns', tone: 'info' }],
      concepts: [{ term: 'TLB', def: 'A small hardware cache of recent virtual-to-physical translations that avoids walking the page tables on most accesses.' }],
      scene: { nodes: [cpu(), tlb({ tag: pill('hit: ~1 ns', 'check', 'good') }), pt({ tag: pill('miss: walk 4 levels', 'clock', 'warn') }), ram()], links: [link('cpu', 'tlb'), link('tlb', 'pt', { style: 'dashed' }), link('tlb', 'ram'), link('pt', 'ram')], flows: [flow(['cpu', 'tlb', 'ram'], { rate: 2.5 }), flow(['tlb', 'pt', 'ram'], { rate: 0.5 })] },
    },
    {
      short: 'Faults',
      kind: 'technique',
      title: 'Demand paging and page faults',
      body: [
        'Pages needn’t all be in RAM. The page table’s <b>present</b> bit says whether a page has a frame; touching a non-present page raises a <b>page fault</b> and the OS handles it: find the data (read from the file or swap, or allocate a zero page), pick a frame (evicting another page if memory is full — LRU-style replacement, see the cache eviction lesson), update the table and restart the instruction. This <b>demand paging</b> lets processes start instantly and use more virtual memory than there is RAM; <b>copy-on-write</b> shares pages after <code>fork</code> until one side writes.',
        'A fault is enormously more expensive than an access: SSD ≈ 100 µs = 1,000× a memory access; a spinning disk, 100,000×. So even a tiny fault rate matters: one fault per million accesses at 100 µs adds <b>0.1 ns</b> (negligible), but 100 per million adds <b>10 ns</b> and 10,000 per million (1%) adds <b>1 µs</b> — a ~10× slowdown.',
      ],
      changes: [{ text: 'Fault service ≈ 100 µs (SSD) vs 100 ns RAM', tone: 'bad' }, { text: 'Copy-on-write shares pages until written', tone: 'good' }],
      scene: { nodes: [cpu({ tag: pill('page not present → fault', 'alert', 'warn') }), pt(), ram(), swap({ tag: pill('read the page in', 'clock', 'warn') })], links: [link('cpu', 'pt'), link('pt', 'ram'), link('ram', 'swap', { style: 'dashed' })], flows: [flow(['cpu', 'pt'], { kind: 'fail', rate: 1 }), flow(['swap', 'ram'], { kind: 'write', rate: 0.8 })] },
    },
    {
      short: 'Thrashing',
      kind: 'problem',
      title: 'Thrashing: when the working set doesn’t fit',
      body: [
        'Each program has a <b>working set</b> — the pages it touches in a given time window. If the sum of working sets exceeds RAM, every page brought in evicts one that is needed soon: the fault rate shoots up, the CPU waits on disk, and throughput collapses — <b>thrashing</b>. Set the fault rate slider to a few thousand per million and watch the effective access time explode.',
        'Defences: <b>admit fewer processes</b> or limit memory per cgroup, add RAM, shrink working sets (data structures with locality, avoiding scattered access), <b>pin critical pages</b>, tune swappiness, and prefer failing fast (OOM-kill) to endless swapping on servers. In containers, memory limits translate to OOM kills rather than swap, so size heaps and caches inside the limit.',
      ],
      changes: [{ text: 'Working sets > RAM → fault storm', tone: 'bad' }, { text: 'Limit memory, shrink working sets, fail fast', tone: 'good' }],
      scene: { nodes: [cpu({ state: 'hot', load: 20, tag: pill('mostly waiting on disk', 'clock', 'warn') }), ram({ state: 'hot', tag: pill('constant eviction', 'alert', 'bad') }), swap({ state: 'hot', tag: pill('saturated', 'alert', 'bad') })], links: [link('ram', 'swap', { arrow: 'both' })], flows: [flow(['ram', 'swap'], { kind: 'heavy', rate: 4, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Translate every access; make the common case a TLB hit',
      body: [
        '<b>Segmentation</b> (variable segments) fragments externally; <b>paging</b> (fixed pages and frames) removes that, with multi-level page tables for sparse spaces and a <b>TLB</b> making translation nearly free. Effective access time ≈ <code>h(t + m) + (1 − h)(t + (L + 1)m) + faults × service</code>.',
        'Keep TLB hit rates high (locality, huge pages), keep working sets inside RAM, and treat faults as the expensive events they are. Figures here are model outputs with illustrative latencies.',
      ],
      scene: { nodes: [cpu(), tlb(), pt(), ram(), swap()], links: [link('cpu', 'tlb'), link('tlb', 'ram'), link('tlb', 'pt', { style: 'dashed' }), link('ram', 'swap', { style: 'dashed' })], flows: [flow(['cpu', 'tlb', 'ram'], { rate: 2.5 })] },
    },
  ],
};

export default lesson;
