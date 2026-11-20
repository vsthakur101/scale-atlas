import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const reqs = (extra: Partial<SceneNode> = {}) => crowd('reqs', -18, 0, 10, 'incoming tasks', extra);
const queue = (extra: Partial<SceneNode> = {}) => db('queue', -9, 0, 'Bounded task queue', { size: [1.6, 1.6], ...extra });
const w = (i: number, extra: Partial<SceneNode> = {}) => box(`w${i}`, 1, -9 + i * 6, `Worker thread ${i + 1}`, 'orange', 'cpu', { size: [1.2, 1.2], height: 20, ...extra });
const io = (extra: Partial<SceneNode> = {}) => box('io', 13, 0, 'Database / downstream I/O', 'blue', 'db', { size: [1.5, 1.5], height: 24, ...extra });
const loop = (extra: Partial<SceneNode> = {}) => box('loop', 1, 9, 'Event loop (1 thread, non-blocking)', 'purple', 'refresh', { size: [1.6, 1.4], height: 24, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-top-6-multithreading-design-patterns-you-must-know',
  title: 'Multithreading Patterns: Thread Pools, Bounded Queues, Futures and Event Loops',
  blurb: 'Size a thread pool from cores and the wait-to-compute ratio, apply backpressure with a bounded queue, compose async work with futures and fork–join, and know when an event loop replaces threads — with the throughput and memory arithmetic.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'opt', label: 'Pool size that keeps all cores busy', icon: 'layers' },
    { key: 'thr', label: 'Throughput at that size', icon: 'gauge' },
    { key: 'need', label: 'Threads needed for the target rate (Little’s law)', icon: 'users' },
    { key: 'mem', label: 'Stack memory for the pool', icon: 'disk' },
    { key: 'cpuonly', label: 'Throughput if sized for CPU-only work (cores + 1)', icon: 'alert' },
  ],
  goals: [
    { text: 'Why threads, and what each one costs', step: 1 },
    { text: 'The thread pool and how to size it', step: 2 },
    { text: 'Producer–consumer with a bounded queue', step: 3 },
    { text: 'Futures, promises and fork–join', step: 4 },
    { text: 'Event loops, immutability and avoiding locks', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'cores', label: 'CPU cores', min: 1, max: 128, step: 1, default: 16, unit: '', description: 'Available hardware threads.' },
      { key: 'c', label: 'CPU time per task (compute)', min: 0.1, max: 500, step: 0.1, default: 20, unit: ' ms', description: 'Time a task spends running on a core.' },
      { key: 'wt', label: 'Wait time per task (I/O, locks)', min: 0, max: 2000, step: 0.5, default: 80, unit: ' ms', description: 'Time blocked on a database call or downstream service.' },
      { key: 'target', label: 'Target throughput', min: 1, max: 100000, step: 1, default: 600, unit: '/s', description: 'Tasks per second to sustain.' },
      { key: 'stack', label: 'Stack memory per thread', min: 0.1, max: 16, step: 0.1, default: 1, unit: ' MB', description: 'Reserved stack per OS thread.' },
    ],
    calculate: (input, step) => {
      const cores = Math.max(1, Math.round(input.cores ?? 16));
      const c = Math.max(0.01, input.c ?? 20) / 1000;
      const wt = Math.max(0, input.wt ?? 80) / 1000;
      const target = Math.max(0, input.target ?? 600);
      const stack = Math.max(0.01, input.stack ?? 1);
      // Goetz: threads = cores × (1 + W/C) to keep every core busy.
      const opt = Math.ceil(cores * (1 + wt / c));
      const thrMax = cores / c;
      const thr = Math.min(thrMax, opt / (c + wt));
      const need = Math.ceil(target * (c + wt));
      const cpuOnlyThreads = cores + 1;
      const cpuOnlyThr = Math.min(thrMax, cpuOnlyThreads / (c + wt));
      return {
        opt: step < 2 ? { v: '—' } : { v: `${fmtN(opt)} threads (${cores} × (1 + ${(wt / c).toFixed(1)}))` },
        thr: step < 2 ? { v: '—' } : { v: `${fmtN(thr)} tasks/s (CPU ceiling ${fmtN(thrMax)}/s)`, tone: 'good' },
        need: step < 2 ? { v: '—' } : { v: `${fmtN(need)} threads for ${fmtN(target)}/s (${fmtN(target)} × ${((c + wt) * 1000).toFixed(0)} ms)`, tone: need <= opt ? 'good' : 'bad' },
        mem: step < 2 ? { v: '—' } : { v: `${fmtN(opt * stack)} MB for ${fmtN(opt)} threads (vs ${fmtN(10000 * stack / 1000)} GB for 10,000)` },
        cpuonly: step < 2 ? { v: '—' } : { v: `${fmtN(cpuOnlyThr)}/s with ${cpuOnlyThreads} threads — cores mostly idle`, tone: cpuOnlyThr < target ? 'bad' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'Threads overlap waiting — and cost memory and switches',
      body: [
        'A thread is an independent flow of execution with its own stack, sharing the process’s memory. Threads let a program use <b>multiple cores</b> (parallelism) and, more commonly in servers, <b>overlap waiting</b>: while one task blocks on a database call, another computes. A task that computes 20 ms and waits 80 ms on I/O keeps a core busy only 20% of the time; a single thread per core would leave 80% of the CPU idle.',
        'Threads are not free. Each OS thread reserves <b>stack memory</b> (~1 MB virtual by default), the kernel schedules it and pays <b>context-switch costs</b> (microseconds, plus cache and TLB disruption), and shared state needs <b>synchronisation</b> — the source of races and deadlocks (see the Processes and Threads and Database Locks lessons). The patterns below are ways to get the concurrency you need while bounding those costs.',
      ],
      scene: { nodes: [reqs(), queue(), w(0), w(1), io()], links: [link('reqs', 'queue'), link('queue', 'w0'), link('queue', 'w1'), link('w0', 'io'), link('w1', 'io')], flows: [flow(['reqs', 'queue', 'w0', 'io'], { rate: 1.8 })] },
    },
    {
      short: 'Pool',
      kind: 'technique',
      title: 'The thread pool, and how big it should be',
      body: [
        'Creating a thread per task is slow and unbounded: 10,000 simultaneous requests would mean 10,000 threads (10 GB of stack at 1 MB) and thrashing. A <b>thread pool</b> keeps a fixed set of long-lived <b>worker threads</b> that pull tasks from a queue — thread creation is amortised, and the pool size caps concurrency. Java’s <code>ExecutorService</code>, .NET’s <code>ThreadPool</code>, Python’s <code>ThreadPoolExecutor</code> and Go’s scheduler (goroutines multiplexed onto OS threads) are all this idea.',
        'Sizing follows from how much of each task is <b>computing</b> vs <b>waiting</b>: <code>threads = cores × (1 + W ÷ C)</code>, where W is wait time and C compute time (Goetz). With 16 cores, C = 20 ms, W = 80 ms (ratio 4): <b>16 × 5 = 80 threads</b> keep every core busy, delivering 80 ÷ 0.1 s = <b>800 tasks/s</b> (the CPU ceiling is 16 ÷ 0.02 = 800/s). For <b>CPU-bound</b> work (W ≈ 0) the answer is cores or cores + 1 — more only adds switching. Sizing a pool “for CPU” (17 threads) when tasks mostly wait yields 17 ÷ 0.1 = <b>170/s</b> with 80% of the cores idle; sizing for 10,000 threads wastes memory. Separate pools for different kinds of work (blocking I/O vs compute) so one can’t starve the other.',
      ],
      changes: [{ text: 'threads = cores × (1 + W/C): 16 × (1 + 4) = 80', tone: 'good' }, { text: '80 threads ÷ 0.1 s = 800/s = the CPU ceiling', tone: 'info' }, { text: 'CPU-sized pool for I/O-heavy tasks: 170/s, cores mostly idle', tone: 'bad' }],
      concepts: [{ term: 'Little’s law (concurrency)', def: 'Tasks in flight = arrival rate × time each spends in the system; it gives the number of threads needed to sustain a target throughput.' }],
      scene: { nodes: [queue({ tag: pill('tasks wait here', 'queue') }), w(0, { tag: pill('compute 20 ms', 'cpu') }), w(1, { tag: pill('waiting 80 ms', 'clock') }), w(2, { tag: pill('waiting 80 ms', 'clock') }), io()], links: [link('queue', 'w0'), link('queue', 'w1'), link('queue', 'w2'), link('w0', 'io'), link('w1', 'io'), link('w2', 'io')], flows: [flow(['queue', 'w0', 'io'], { rate: 1.6 }), flow(['queue', 'w1', 'io'], { rate: 1.6 })] },
    },
    {
      short: 'Queue',
      kind: 'technique',
      title: 'Producer–consumer with a bounded queue',
      body: [
        'Producers add tasks to a queue and consumers (the pool’s workers) take them — decoupling their speeds and smoothing bursts. The crucial detail is the <b>bound</b>. An <b>unbounded</b> queue never pushes back: if arrivals exceed capacity, it grows until memory is exhausted and, long before that, every task waits behind a huge backlog — latency goes to infinity while throughput stays flat (see the Backpressure lesson). A <b>bounded</b> queue forces a policy when full: <b>block</b> the producer (natural backpressure — slows the source), <b>reject</b> with an error (shed load; the caller can retry elsewhere), <b>drop oldest/newest</b>, or <b>run on the caller’s thread</b> (Java’s <code>CallerRunsPolicy</code>).',
        'Choose the bound from the latency you can tolerate: with 800 tasks/s capacity, a queue of 800 means up to <b>1 s of queueing</b>; a queue of 80 means 100 ms. Prefer short queues plus explicit rejection to long queues and timeouts. Implementation hazards: blocking queues use locks and condition variables (contention at high rates), lock-free queues (CAS-based, LMAX Disruptor ring buffer) lower overhead but are harder to get right, and priority or fairness requirements usually mean separate queues.',
      ],
      changes: [{ text: 'Bounded queue: block, reject, drop or caller-runs when full', tone: 'good' }, { text: 'Unbounded queue: hides overload as latency, then OOM', tone: 'bad' }, { text: 'Queue length ÷ throughput = worst-case queueing delay', tone: 'info' }],
      scene: { nodes: [reqs({ tag: pill('burst', 'activity', 'warn') }), queue({ tag: pill('capacity 80 · full → reject', 'alert', 'warn') }), w(0), w(1)], links: [link('reqs', 'queue'), link('queue', 'w0'), link('queue', 'w1')], flows: [flow(['reqs', 'queue', 'w0'], { kind: 'heavy', rate: 3 }), flow(['reqs', 'queue'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Futures',
      kind: 'technique',
      title: 'Futures, promises and fork–join',
      body: [
        'Blocking a thread to wait for a result wastes it. A <b>future</b> (promise, <code>CompletableFuture</code>, <code>Task</code>, <code>async</code>/<code>await</code>) represents a result that isn’t ready yet: you submit work, get a handle immediately, and <b>compose</b> continuations — <code>thenCombine</code>, <code>allOf</code>, <code>await Promise.all</code> — so independent calls run in parallel and the code reads sequentially. Fetching a user profile, orders and recommendations concurrently turns <code>20 + 30 + 40 = 90 ms</code> of serial latency into <b>40 ms</b> (the slowest). Always set <b>timeouts</b> on futures and handle exceptions on the chain — an unobserved failure is silent.',
        '<b>Fork–join</b> is the pattern for <b>CPU-bound divide-and-conquer</b>: split a big task into subtasks (<i>fork</i>), run them in parallel, combine results (<i>join</i>) — parallel streams, parallel sorts, map-reduce on one machine. Java’s <code>ForkJoinPool</code> uses <b>work stealing</b>: each worker has its own deque of tasks, and an idle worker steals from the <i>tail</i> of another’s, giving good load balance with little contention. Don’t block inside fork–join tasks, and stop splitting below a threshold (tiny tasks cost more to schedule than to run).',
      ],
      changes: [{ text: 'Futures compose: parallel calls, sequential-looking code; 90 ms → 40 ms', tone: 'good' }, { text: 'Fork–join + work stealing for CPU-bound splits', tone: 'good' }, { text: 'Always timeout and handle errors on the chain', tone: 'info' }],
      scene: { nodes: [reqs({ tag: pill('1 request', 'user') }), w(0, { tag: pill('profile 20 ms', 'cpu') }), w(1, { tag: pill('orders 30 ms', 'cpu') }), w(2, { tag: pill('recs 40 ms', 'cpu') }), io({ tag: pill('allOf → 40 ms', 'check', 'good') })], links: [link('reqs', 'w0'), link('reqs', 'w1'), link('reqs', 'w2'), link('w0', 'io'), link('w1', 'io'), link('w2', 'io')], flows: [flow(['reqs', 'w0', 'io'], { rate: 1.6 }), flow(['reqs', 'w1', 'io'], { rate: 1.6 }), flow(['reqs', 'w2', 'io'], { rate: 1.6 })] },
    },
    {
      short: 'No locks',
      kind: 'tradeoff',
      title: 'Event loops, immutability and thread confinement',
      body: [
        'The best synchronisation is none. <b>Event loop / reactor</b>: one thread multiplexes thousands of connections using non-blocking I/O (<code>epoll</code>, <code>kqueue</code>) and callbacks or <code>async/await</code> — no per-connection stack, no locks on the loop’s own state (Node.js, Nginx, Netty, Redis — see the C10K and Redis lessons). It excels when work is I/O-bound and short; a CPU-heavy callback blocks <i>every</i> connection, so push compute to a worker pool. <b>Thread confinement</b> (each piece of data owned by exactly one thread — per-core sharding, actors, goroutines passing messages over channels) and <b>immutability</b> (share only values that never change, so no locking is needed) remove whole classes of races.',
        'When sharing is unavoidable, prefer <b>higher-level primitives</b> (concurrent maps, atomics, read–write locks for read-mostly data, copy-on-write snapshots) to hand-rolled locking, keep critical sections tiny, take locks in a fixed order, and avoid calling unknown code (callbacks, I/O) while holding one. Memory: 80 threads × 1 MB is <b>80 MB</b>; 10,000 threads is 10 GB — which is why connection-per-thread designs give way to event loops, virtual threads (Java 21) and goroutines at high connection counts. All figures here are model outputs from the stated times and core count.',
      ],
      changes: [{ text: 'Event loop: many connections, one thread, no locks — never block it', tone: 'good' }, { text: 'Confinement and immutability avoid synchronisation', tone: 'good' }, { text: '80 threads = 80 MB; 10,000 threads = 10 GB', tone: 'info' }],
      scene: { nodes: [reqs({ tag: pill('10,000 connections', 'users') }), loop({ tag: pill('epoll → callbacks', 'refresh', 'good') }), w(0, { tag: pill('CPU work offloaded', 'cpu') }), io()], links: [link('reqs', 'loop'), link('loop', 'w0'), link('loop', 'io')], flows: [flow(['reqs', 'loop', 'io'], { rate: 2.4, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Bound concurrency, size by wait-to-compute, avoid sharing',
      body: [
        'Use a <b>thread pool</b> sized <code>cores × (1 + W/C)</code> (80 threads here → 800/s), fed by a <b>bounded queue</b> that pushes back; compose async work with <b>futures</b> and CPU-bound splits with <b>fork–join</b>; reach for an <b>event loop</b>, immutability or confinement to avoid locks.',
        'Check Little’s law for needed concurrency, keep stacks and queues bounded, and put timeouts on everything.',
      ],
      scene: { nodes: [reqs(), queue(), w(0), w(1), io()], links: [link('reqs', 'queue'), link('queue', 'w0'), link('queue', 'w1'), link('w0', 'io'), link('w1', 'io')], flows: [flow(['reqs', 'queue', 'w0', 'io'], { rate: 1.8 })] },
    },
  ],
};

export default lesson;
