import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const proc = (id: string, d: number, name: string, tone: SceneNode['tone'] = 'blue', extra: Partial<SceneNode> = {}) =>
  box(id, -8, d, name, tone, 'server', { size: [2.4, 1.6], height: 20, ...extra });
const thr = (id: string, r: number, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, 'teal', 'cpu', { size: [1, 1], height: 22, ...extra });
const mem = (extra: Partial<SceneNode> = {}) => db('mem', 8, 0, 'Shared heap / data', { size: [1.4, 1.4], ...extra });
const lockA = (extra: Partial<SceneNode> = {}) => box('la', -2, -5, 'Lock A', 'red', 'lock', { size: [1.1, 1.1], height: 18, ...extra });
const lockB = (extra: Partial<SceneNode> = {}) => box('lb', -2, 5, 'Lock B', 'red', 'lock', { size: [1.1, 1.1], height: 18, ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const fmtT = (s: number): string => (s >= 1 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`);

const lesson: Lesson = {
  slug: 'source-process-vs-thread-key-differences',
  title: 'Processes, Threads and Deadlocks',
  blurb: 'Isolation versus sharing: what a process owns and a thread shares, what a context switch costs, why creation cost and memory matter at scale, and the four conditions that make threads deadlock.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'perCore', label: 'Runnable threads per core', icon: 'layers' },
    { key: 'sw', label: 'Context switches per core per second', icon: 'refresh' },
    { key: 'ovh', label: 'CPU lost to switching', icon: 'gauge' },
    { key: 'mem', label: 'Memory for all thread stacks', icon: 'disk' },
    { key: 'spawn', label: 'Time to create 10,000: processes vs threads', icon: 'clock' },
  ],
  goals: [
    { text: 'What a process owns versus what threads share', step: 1 },
    { text: 'Context switches: direct and indirect cost', step: 2 },
    { text: 'Creation cost and memory at scale', step: 3 },
    { text: 'Races and synchronisation, briefly', step: 4 },
    { text: 'Deadlock: the four conditions and how to break them', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 't', label: 'Threads', min: 1, max: 20000, step: 1, default: 400, unit: '', description: 'Threads alive in the system.' },
      { key: 'c', label: 'CPU cores', min: 1, max: 128, step: 1, default: 8, unit: '', description: 'Cores available.' },
      { key: 'slice', label: 'Scheduler time slice', min: 1, max: 100, step: 1, default: 4, unit: ' ms', description: 'How long a runnable thread runs before preemption when cores are contended.' },
      { key: 'blocks', label: 'Blocking calls per thread per second', min: 0, max: 5000, step: 10, default: 100, unit: '', description: 'I/O waits, lock waits and yields that cause a switch.' },
      { key: 'cost', label: 'Cost of one switch (direct + cache refill)', min: 1, max: 200, step: 1, default: 25, unit: ' µs', description: 'Saving/restoring state plus lost cache and TLB warmth.' },
      { key: 'stack', label: 'Memory per thread', min: 16, max: 8192, step: 16, default: 512, unit: ' KB', description: 'Stack plus kernel structures.' },
    ],
    calculate: (input, step) => {
      const t = Math.max(1, Math.round(input.t ?? 400));
      const c = Math.max(1, Math.round(input.c ?? 8));
      const slice = Math.max(0.1, input.slice ?? 4);
      const blocks = Math.max(0, input.blocks ?? 100);
      const cost = Math.max(0.1, input.cost ?? 25) / 1e6;
      const stack = Math.max(1, input.stack ?? 512) * 1024;
      const perCore = t / c;
      // Switches come from preemption (when threads outnumber cores) and from voluntary blocking.
      const preempt = perCore > 1 ? 1000 / slice : 0;
      const voluntary = perCore * blocks;
      const sw = Math.max(preempt, voluntary);
      const ovh = Math.min(1, sw * cost);
      // Typical creation costs: fork + exec ≈ 1 ms, thread ≈ 30 µs (order of magnitude).
      const spawnProc = 10000 * 0.001;
      const spawnThr = 10000 * 0.00003;
      return {
        perCore: step < 2 ? { v: '—' } : { v: perCore.toFixed(perCore < 10 ? 1 : 0), tone: perCore <= 2 ? 'good' : perCore <= 50 ? 'warn' : 'bad' },
        sw: step < 2 ? { v: '—' } : { v: fmtN(sw) },
        ovh: step < 2 ? { v: '—' } : { v: `${(ovh * 100).toFixed(1)}%`, tone: ovh < 0.03 ? 'good' : ovh < 0.15 ? 'warn' : 'bad' },
        mem: step < 3 ? { v: '—' } : { v: fmtB(t * stack), tone: t * stack > 8e9 ? 'warn' : 'good' },
        spawn: step < 3 ? { v: '—' } : { v: `${fmtT(spawnProc)} vs ${fmtT(spawnThr)}` },
      };
    },
  },
  steps: [
    {
      short: 'Own vs share',
      kind: 'insight',
      title: 'A process owns an address space; threads share one',
      body: [
        'A <b>process</b> is a running program with its own <b>virtual address space</b> (see the Virtual Memory lesson), open file descriptors, credentials and at least one thread. Processes are <b>isolated</b> by the OS: one cannot read or corrupt another’s memory, and a crash usually kills only that process. Communication needs explicit <b>IPC</b>: pipes, sockets, shared-memory regions, message queues.',
        'A <b>thread</b> is a unit of execution <i>inside</i> a process. Threads of one process <b>share</b> its heap, globals, code and file descriptors but each has its own <b>stack</b>, registers and program counter. Sharing makes communication trivial (just read memory) and cheap — and makes <b>bugs shared too</b>: a race in one thread corrupts data for all, and a crash can take the whole process down.',
      ],
      changes: [{ text: 'Process: isolated address space · Thread: shared heap, private stack', tone: 'info' }],
      scene: { nodes: [proc('p1', -5, 'Process A'), thr('t1', -9, -5, 'T1'), thr('t2', -7, -5, 'T2'), thr('t3', -5, -5, 'T3'), proc('p2', 5, 'Process B', 'orange'), mem({ tag: pill('threads of A share this', 'share') })], links: [link('t1', 'mem'), link('t2', 'mem'), link('t3', 'mem')], flows: [flow(['t1', 'mem'], { rate: 1.2 })] },
    },
    {
      short: 'Switching',
      kind: 'technique',
      title: 'What a context switch costs',
      body: [
        'When the scheduler moves a core from one thread to another it saves the registers and stack pointer, loads the next thread’s, and for a different <i>process</i> also <b>switches the address space</b> (page tables, with TLB flushes or tagging). The <b>direct</b> cost is a few microseconds; the <b>indirect</b> cost is larger — the new thread finds the CPU caches and TLB full of someone else’s data and runs slowly until they refill. Together about 25 µs here (more across processes than threads).',
        'Switches have two causes: <b>preemption</b> when runnable threads outnumber cores (each gets a slice, e.g. 4 ms → 250 switches a second per core) and <b>voluntary</b> switches when a thread blocks on I/O or a lock. 400 threads on 8 cores = 50 runnable per core; each doing 100 blocking calls a second → 5,000 switches per core per second × 25 µs = <b>12.5% of the CPU spent switching</b>. This is why thread-per-connection stops scaling and event loops exist (see the C10K lesson).',
      ],
      changes: [{ text: 'Direct cost µs; indirect cost (cold caches) is larger', tone: 'info' }, { text: '50 threads/core × 100 blocks/s × 25 µs ≈ 12.5%', tone: 'bad' }],
      scene: { nodes: [box('cpu', -8, 0, 'One core', 'purple', 'cpu', { size: [1.4, 1.4], height: 26, tag: pill('T1 → T2 → T3 …', 'refresh') }), thr('t1', 2, -5, 'T1'), thr('t2', 2, 0, 'T2'), thr('t3', 2, 5, 'T3')], links: [link('cpu', 't1', { style: 'dashed' }), link('cpu', 't2'), link('cpu', 't3', { style: 'dashed' })], flows: [flow(['cpu', 't2'], { rate: 2 })] },
    },
    {
      short: 'Cost at scale',
      kind: 'tradeoff',
      title: 'Creation cost and memory',
      body: [
        'Creating a <b>process</b> (<code>fork</code>, or <code>exec</code> of a new program) copies or maps address-space structures — roughly a millisecond; creating a <b>thread</b> allocates a stack and a kernel record — tens of microseconds. Creating 10,000 of each: about <b>10 s</b> versus <b>0.3 s</b>. Memory differs too: 400 threads × 512 KB = 200 MB of stacks, but 400 processes also duplicate page tables, runtime state and (until copy-on-write diverges) data.',
        'Hence pools: pre-create workers and reuse them. The trade-off in server design: <b>multi-process</b> (Nginx workers, PostgreSQL backends, Chrome tabs) buys <b>isolation and crash containment</b> at higher memory and IPC cost; <b>multi-threaded</b> (JVM servers) shares memory and caches cheaply but needs careful synchronisation; <b>event-driven</b> single threads (Node, Redis) avoid both at the cost of blocking risk. Languages add lighter units — goroutines, virtual threads, async tasks — multiplexed onto few OS threads.',
      ],
      changes: [{ text: 'Process ~1 ms · thread ~30 µs to create (orders of magnitude)', tone: 'info' }, { text: 'Pools; lighter user-space threads', tone: 'good' }],
      scene: { nodes: [box('mp', -8, -5, 'Multi-process', 'blue', 'server', { size: [1.4, 1.4], height: 24, tag: pill('isolation, more memory', 'shield') }), box('mt', 0, 5, 'Multi-threaded', 'orange', 'cpu', { size: [1.4, 1.4], height: 24, tag: pill('shared memory, races', 'alert', 'warn') }), box('ev', 8, -5, 'Event loop / green threads', 'green', 'refresh', { size: [1.4, 1.4], height: 24, tag: pill('few OS threads', 'check', 'good') })], links: [], flows: [] },
    },
    {
      short: 'Races',
      kind: 'problem',
      title: 'Shared memory needs synchronisation',
      body: [
        'Because threads share memory, two of them updating <code>counter++</code> (read, add, write) can interleave and lose an update — a <b>data race</b>. Protect shared state with <b>mutexes</b> (one thread at a time in a critical section), <b>atomic operations</b> (hardware compare-and-swap, see the Concurrency lesson), <b>read–write locks</b>, <b>condition variables</b> and message passing between threads (queues). Keep critical sections short: a lock turns parallel code serial (Amdahl’s law).',
        'Races hide: they may appear once a month under load. Prefer <b>immutability</b>, <b>thread confinement</b> (each piece of data owned by one thread), and well-tested concurrent structures; use race detectors (ThreadSanitizer, Go’s <code>-race</code>) in tests. But locks themselves create the next problem.',
      ],
      scene: { nodes: [thr('t1', -9, -3, 'T1: read 5 → write 6'), thr('t2', -9, 3, 'T2: read 5 → write 6'), mem({ state: 'hot', tag: pill('counter = 6, should be 7', 'alert', 'bad') })], links: [link('t1', 'mem'), link('t2', 'mem')], flows: [flow(['t1', 'mem'], { kind: 'write', rate: 1 }), flow(['t2', 'mem'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Deadlock',
      kind: 'problem',
      title: 'Deadlock: four conditions, four ways out',
      body: [
        'Thread 1 holds lock A and waits for B; thread 2 holds B and waits for A. Neither can proceed — a <b>deadlock</b>. It needs all four <b>Coffman conditions</b>: <b>mutual exclusion</b> (the resource can’t be shared), <b>hold and wait</b> (holding one while requesting another), <b>no preemption</b> (can’t take a lock away), and <b>circular wait</b> (a cycle of waiting). Remove any one and deadlock is impossible.',
        'Practical cures: <b>lock ordering</b> — always acquire locks in one global order (breaks circular wait; the single most effective rule); <b>acquire all at once</b> or <code>tryLock</code> with timeout and back off (breaks hold-and-wait); <b>fewer locks</b> and smaller critical sections; <b>lock-free</b> or message-passing designs; and detection with recovery (databases find cycles in a wait-for graph and abort a victim; see the Locking lesson). Related hazards: <b>livelock</b> (threads keep reacting to each other without progress) and <b>starvation</b> (a thread never gets the lock). Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Mutual exclusion · hold and wait · no preemption · circular wait', tone: 'info' }, { text: 'Global lock ordering breaks the cycle', tone: 'good' }],
      concepts: [{ term: 'Deadlock', def: 'A state in which a set of threads each wait for a resource held by another in the set, so none can proceed.' }],
      scene: { nodes: [thr('t1', -9, -5, 'T1: holds A, wants B', { tag: pill('waiting', 'clock', 'warn') }), thr('t2', -9, 5, 'T2: holds B, wants A', { tag: pill('waiting', 'clock', 'warn') }), lockA({ tag: pill('held by T1', 'lock') }), lockB({ tag: pill('held by T2', 'lock') })], links: [link('t1', 'la'), link('t2', 'lb'), link('t1', 'lb', { style: 'broken' }), link('t2', 'la', { style: 'broken' })], flows: [flow(['t1', 'lb'], { kind: 'fail', rate: 0.8 }), flow(['t2', 'la'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Isolation costs memory; sharing costs correctness',
      body: [
        'Processes isolate; threads share. Context switches cost tens of microseconds, so switching overhead ≈ <code>switches/s × cost</code> — thousands of threads doing I/O waste a large share of CPU. Create workers once, pool them, and use event loops or lightweight threads when concurrency is high.',
        'Protect shared data, keep critical sections short, and prevent deadlock with a global lock order, timeouts and fewer locks.',
      ],
      scene: { nodes: [proc('p1', -5, 'Process'), thr('t1', -9, -5, 'T'), thr('t2', -7, -5, 'T'), mem()], links: [link('t1', 'mem'), link('t2', 'mem')], flows: [flow(['t1', 'mem'], { rate: 1.2 })] },
    },
  ],
};

export default lesson;
