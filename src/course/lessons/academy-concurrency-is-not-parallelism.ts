import type { Lesson, SceneNode, Tone } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const reqs = (extra: Partial<SceneNode> = {}) => box('reqs', -12, 0, 'Requests', 'green', 'users', { size: [1.4, 1.4], height: 30, ...extra });
const core = (i: number, n: number, extra: Partial<SceneNode> = {}): SceneNode =>
  box(`core${i}`, 2, (i - (n - 1) / 2) * 5, `core ${i + 1}`, 'blue', 'cpu', { size: [1.3, 1.3], height: 32, ...extra });
const cores = (n: number, extra: (i: number) => Partial<SceneNode> = () => ({})) => Array.from({ length: n }, (_, i) => core(i, n, extra(i)));
const store = (extra: Partial<SceneNode> = {}) => db('db', 12, 0, 'Database', { size: [1.3, 1.3], ...extra });
const task = (id: string, r: number, d: number, name: string, tone: Tone, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, tone, 'list', { size: [1, 1], height: 22, ...extra });

const fmtX = (x: number): string => `${x.toFixed(x < 10 ? 2 : 1)}×`;

const lesson: Lesson = {
  slug: 'academy-concurrency-is-not-parallelism',
  title: 'Concurrency Is Not Parallelism',
  blurb: 'Structuring a program as many things in progress is not the same as running many things at the same instant — and each solves a different problem with a different limit.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'cpu', label: 'CPU busy', icon: 'cpu' },
    { key: 'threads', label: 'Threads to fill CPU', icon: 'layers' },
    { key: 'speed', label: 'Speed-up', icon: 'activity' },
    { key: 'ceiling', label: 'Amdahl ceiling', icon: 'gauge' },
  ],
  goals: [
    { text: 'The definition: structure versus simultaneous execution', step: 2 },
    { text: 'Why concurrency fixes waiting and how many threads that takes', step: 3 },
    { text: 'Why parallel speed-up stops at 1 ÷ serial fraction', step: 4 },
    { text: 'Races exist without parallelism', step: 5 },
    { text: 'Concurrency models and their costs', step: 6 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'cores', label: 'CPU cores', min: 1, max: 64, step: 1, default: 8, unit: '', description: 'Cores available to the program.' },
      { key: 'parallel', label: 'Parallelisable work', min: 50, max: 99.9, step: 0.5, default: 90, unit: '%', description: 'Share of the work that can run on separate cores. The rest is serial: locks, setup, merging.' },
      { key: 'wc', label: 'Wait ÷ compute', min: 0, max: 100, step: 1, default: 9, unit: '×', description: 'Time a request spends waiting on I/O for each unit of CPU time. 9 means 90 ms waiting per 10 ms computing.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, Math.round(input.cores ?? 8));
      const p = Math.min(0.9999, (input.parallel ?? 90) / 100);
      const wc = input.wc ?? 9;
      // Amdahl: S = 1 / ((1 − p) + p / N)
      const speed = 1 / (1 - p + p / n);
      const ceiling = 1 / (1 - p);
      // Goetz: threads needed to keep every core busy = cores × (1 + W/C)
      const threads = n * (1 + wc);
      const singleThreadCpu = 1 / (1 + wc);
      return {
        cpu: { v: step < 2 ? `${Math.round(singleThreadCpu * 100)}% (1 thread)` : step < 4 ? '~100% (pool sized)' : `${Math.round((speed / n) * 100)}% (parallel eff.)`, tone: step < 2 ? (singleThreadCpu < 0.3 ? 'bad' : 'warn') : 'good' },
        threads: { v: `${Math.round(threads)}`, tone: threads > 500 ? 'warn' : undefined },
        speed: step < 3 ? { v: '—' } : { v: fmtX(speed), tone: speed / n > 0.7 ? 'good' : speed / n > 0.4 ? 'warn' : 'bad' },
        ceiling: step < 3 ? { v: '—' } : { v: fmtX(ceiling), tone: ceiling >= n ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Idle CPU',
      kind: 'problem',
      title: 'A fast CPU, mostly doing nothing',
      body: [
        'A service handles one request at a time. Each request spends 10 ms computing and then <b>90 ms waiting</b> for the database. The CPU is busy 10% of the time; the other 90% it sits idle while the next request queues behind the one that is waiting.',
        'Buying a faster CPU would not help — the time goes to waiting, not to computing. The fix isn’t more speed; it’s using the waiting time.',
      ],
      changes: [{ text: 'CPU 10% busy, 90% idle', tone: 'bad' }, { text: '10 requests/s per core, whatever the CPU speed', tone: 'bad' }],
      scene: {
        nodes: [reqs({ tag: pill('queue builds up', 'queue', 'warn') }), core(0, 1, { load: 10, tag: pill('10 ms compute', 'cpu') }), store({ tag: pill('90 ms wait', 'clock', 'bad') })],
        links: [link('reqs', 'core0'), link('core0', 'db', { arrow: 'both' })],
        flows: [flow(['reqs', 'core0'], { rate: 1.4 }), flow(['core0', 'db'], { back: true, rate: 0.7, speed: 0.35 })],
      },
    },
    {
      short: 'Two ideas',
      kind: 'insight',
      title: 'Concurrency is structure; parallelism is simultaneity',
      body: [
        '<b>Concurrency</b> is about <i>dealing with</i> many things at once: structuring a program as independent tasks that can each make progress, in overlapping time. <b>Parallelism</b> is about <i>doing</i> many things at once: tasks literally executing at the same instant on different cores.',
        'They are independent. One core can run a thousand concurrent tasks by interleaving them — concurrent, not parallel. A GPU multiplying a matrix on thousands of lanes is parallel, with very little concurrency structure in the program. Most real systems want both, for different reasons.',
      ],
      note: { kind: 'key', text: 'Concurrency is a property of how the program is organised. Parallelism is a property of how it is executed.' },
      concepts: [
        { term: 'Concurrency', def: 'Structuring work as independent tasks whose lifetimes overlap, possibly interleaved on one core.' },
        { term: 'Parallelism', def: 'Executing multiple computations at the same instant on multiple processing units.' },
      ],
      scene: {
        nodes: [task('t1', -8, -6, 'task A', 'orange'), task('t2', -8, 0, 'task B', 'green'), task('t3', -8, 6, 'task C', 'purple'), core(0, 1, { name: '1 core', tag: pill('A, B, C interleaved: concurrent', 'refresh', 'accent') })],
        links: [link('t1', 'core0'), link('t2', 'core0'), link('t3', 'core0')],
        flows: [flow(['t1', 'core0'], { rate: 1 }), flow(['t2', 'core0'], { rate: 1 }), flow(['t3', 'core0'], { rate: 1 })],
      },
    },
    {
      short: 'I/O bound',
      kind: 'technique',
      title: 'Concurrency fills the waiting time',
      body: [
        'Run many requests concurrently on the <i>same</i> core. While request 1 waits for the database, the core computes request 2, then 3. No second core required: the idle 90% becomes useful work.',
        'How many? To keep every core busy you need about <code>threads = cores × (1 + wait ÷ compute)</code>. With 90 ms waiting per 10 ms computing (ratio 9) one core needs 10 in-flight requests and eight cores need 80 — a program built from threads, async tasks or goroutines. The sliders show how the number grows with the wait ratio.',
      ],
      changes: [{ text: '1 core, 10 concurrent requests → ~100% busy', tone: 'good' }, { text: '8 cores need ~80 in flight', tone: 'good' }],
      concepts: [{ term: 'I/O-bound work', def: 'Work whose time is dominated by waiting on disks, networks or other services rather than computing.' }],
      scene: {
        nodes: [reqs(), core(0, 1, { load: 98, tag: pill('10 requests interleaved', 'layers', 'good') }), store({ tag: pill('10 in-flight queries', 'activity') })],
        links: [link('reqs', 'core0'), link('core0', 'db', { arrow: 'both' })],
        flows: [flow(['reqs', 'core0'], { rate: 3 }), flow(['core0', 'db'], { back: true, rate: 3, speed: 0.9 })],
      },
    },
    {
      short: 'CPU bound',
      kind: 'technique',
      title: 'Parallelism speeds up computing — up to a wall',
      body: [
        'When the work is computing — encoding video, training, searching a large index — more concurrency won’t help; you need more cores working at the same time. <b>Amdahl’s law</b> bounds the gain: if a fraction p of the work parallelises and the rest is serial, N cores give <code>speed-up = 1 ÷ ((1 − p) + p ÷ N)</code>.',
        'With p = 90% and 8 cores that is 4.7×, not 8×; with infinitely many cores it can never pass <code>1 ÷ (1 − p) = 10×</code>. The serial 10% — setup, locks, merging results — becomes the whole story. Slide the parallel fraction to 99% and the ceiling jumps to 100×.',
      ],
      changes: [{ text: 'p = 90%, 8 cores → 4.7× (59% efficient)', tone: 'info' }, { text: 'Ceiling 10× however many cores', tone: 'bad' }],
      concepts: [{ term: 'Amdahl’s law', def: 'Speed-up from N processors is 1 ÷ ((1 − p) + p/N), where p is the parallelisable fraction; the serial part limits the maximum.' }],
      scene: {
        nodes: [reqs({ name: 'Big job' }), ...cores(4, () => ({ load: 80 })), box('merge', 12, 0, 'Serial merge', 'red', 'refresh', { size: [1.3, 1.3], height: 30, tag: pill('10% serial', 'lock', 'warn') })],
        links: [...[0, 1, 2, 3].map((i) => link('reqs', `core${i}`)), ...[0, 1, 2, 3].map((i) => link(`core${i}`, 'merge'))],
        flows: [...[0, 1, 2, 3].map((i) => flow(['reqs', `core${i}`], { kind: 'heavy', rate: 1 })), ...[0, 1, 2, 3].map((i) => flow([`core${i}`, 'merge'], { rate: 0.8 }))],
      },
    },
    {
      short: 'Races',
      kind: 'problem',
      title: 'Races need concurrency, not parallelism',
      body: [
        'Two tasks each do <code>balance = balance + 10</code>. That is three steps: read, add, write. If task A reads 100, then task B reads 100, then both write 110, one deposit is lost. This can happen on a <b>single core</b>: the scheduler just switches between tasks at the wrong moment.',
        'So it is concurrency — overlapping lifetimes sharing state — that creates the hazard, not the number of cores. Fixes remove the sharing or order the access: <b>locks</b>, <b>atomic</b> operations, <b>immutable</b> data, or <b>message passing</b> where one owner mutates the state.',
      ],
      changes: [{ text: 'Both read 100 → both write 110 → one deposit lost', tone: 'bad' }, { text: 'Fix: lock, atomic add, or single owner', tone: 'good' }],
      concepts: [{ term: 'Race condition', def: 'A bug where the result depends on the unpredictable interleaving of concurrent operations on shared state.' }],
      scene: {
        nodes: [task('a', -8, -4, 'task A', 'orange', { tag: pill('read 100 → write 110', 'file') }), task('b', -8, 4, 'task B', 'green', { tag: pill('read 100 → write 110', 'file') }), core(0, 1, { name: '1 core' }), db('bal', 12, 0, 'balance', { size: [1.3, 1.3], state: 'hot', tag: pill('110, should be 120', 'alert', 'bad') })],
        links: [link('a', 'core0'), link('b', 'core0'), link('core0', 'bal', { arrow: 'both' })],
        flows: [flow(['a', 'core0', 'bal'], { kind: 'write', rate: 0.8 }), flow(['b', 'core0', 'bal'], { kind: 'write', rate: 0.8 })],
      },
    },
    {
      short: 'Models',
      kind: 'technique',
      title: 'Four ways to organise concurrent code',
      body: [
        '<b>Threads and locks</b>: the OS schedules threads, you protect shared state with locks — flexible, easy to get subtly wrong. <b>Event loop</b> (Node, async/await): one thread runs short callbacks and never blocks, so there are no data races on its own state, but a long computation stalls everything.',
        '<b>CSP / goroutines</b>: lightweight tasks communicate over channels — “share memory by communicating”. <b>Actors</b> (Erlang, Akka): each actor owns its state and processes one message at a time from a mailbox. Each model trades convenience, safety and raw parallel speed differently; all let one program overlap waiting with work.',
      ],
      changes: [{ text: 'Threads + locks · event loop · CSP · actors' }],
      concepts: [
        { term: 'Event loop', def: 'A single thread that runs ready callbacks and waits on I/O without blocking, giving concurrency without parallelism.' },
        { term: 'CSP', def: 'Communicating Sequential Processes: independent tasks that coordinate by sending messages over channels.' },
      ],
      scene: {
        nodes: [box('thr', -6, -7, 'Threads + locks', 'blue', 'layers', { size: [1.4, 1.4], height: 30 }), box('ev', 6, -7, 'Event loop', 'teal', 'refresh', { size: [1.4, 1.4], height: 30 }), box('csp', -6, 6, 'Channels (CSP)', 'purple', 'route', { size: [1.4, 1.4], height: 30 }), box('act', 6, 6, 'Actors', 'orange', 'queue', { size: [1.4, 1.4], height: 30 })],
        links: [],
        flows: [],
      },
    },
    {
      short: 'Overhead',
      kind: 'case',
      title: 'Case: more threads made it slower',
      body: [
        'A team fixes a slow service by raising the thread pool from 80 to 4,000. Throughput <b>drops</b>. The work is mostly compute, not waiting, so extra threads add nothing; but each thread costs a megabyte of stack, scheduler time and a <b>context switch</b> (microseconds each, plus the CPU cache it evicts), and they all fight over the same lock.',
        'Rules of thumb: size pools from the formula (cores × (1 + wait ÷ compute)), not by hope; keep critical sections tiny, because a lock turns parallel code serial and moves p down in Amdahl’s law; and prefer lightweight tasks (goroutines, async) when thousands of mostly-waiting tasks are needed.',
      ],
      changes: [{ text: '80 → 4,000 threads: more switching, same CPU', tone: 'bad' }, { text: 'Pool = cores × (1 + W/C); short critical sections', tone: 'good' }],
      scene: {
        nodes: [reqs(), ...cores(2, () => ({ load: 100, state: 'hot', tag: pill('context-switch storm', 'alert', 'bad') })), box('lock', 12, 0, 'One hot lock', 'red', 'lock', { size: [1.3, 1.3], height: 30, tag: pill('all threads queue here', 'clock', 'warn') })],
        links: [link('reqs', 'core0'), link('reqs', 'core1'), link('core0', 'lock'), link('core1', 'lock')],
        flows: [flow(['reqs', 'core0'], { kind: 'heavy', rate: 3 }), flow(['reqs', 'core1'], { kind: 'heavy', rate: 3 }), flow(['core0', 'lock'], { kind: 'fail', rate: 1 })],
      },
    },
    {
      short: 'Deadlock',
      kind: 'problem',
      title: 'Deadlock: each waits for the other',
      body: [
        'Task A locks the orders table and then wants the inventory table; task B locked inventory first and now wants orders. Each holds what the other needs and neither can proceed — a <b>deadlock</b>. It needs only concurrency and shared resources, not parallelism.',
        'Prevent it by acquiring locks in a fixed global order, holding as few locks as possible, using timeouts and retry, or avoiding locks through message passing. Databases detect cycles and abort one transaction; application-level locks usually don’t.',
      ],
      changes: [{ text: 'A holds orders, wants inventory; B holds inventory, wants orders', tone: 'bad' }, { text: 'Fix: lock ordering, timeouts', tone: 'good' }],
      scene: {
        nodes: [task('a', -6, -6, 'task A', 'orange', { tag: pill('holds orders', 'lock') }), task('b', -6, 6, 'task B', 'green', { tag: pill('holds inventory', 'lock') }), box('o', 8, -6, 'orders lock', 'blue', 'lock', { size: [1.2, 1.2], height: 24 }), box('i', 8, 6, 'inventory lock', 'purple', 'lock', { size: [1.2, 1.2], height: 24 })],
        links: [link('a', 'o'), link('b', 'i'), link('a', 'i', { style: 'broken' }), link('b', 'o', { style: 'broken' })],
        flows: [flow(['a', 'i'], { kind: 'fail', rate: 0.6 }), flow(['b', 'o'], { kind: 'fail', rate: 0.6 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Use concurrency for waiting, parallelism for computing',
      body: [
        '<b>Concurrency</b> structures a program into overlapping tasks; it fixes <i>waiting</i>, needs about <code>cores × (1 + wait ÷ compute)</code> tasks to fill the CPU, and introduces races and deadlocks. <b>Parallelism</b> runs work on several cores at once; it speeds up <i>computing</i>, bounded by <code>1 ÷ ((1 − p) + p/N)</code>.',
        'Identify whether a bottleneck is waiting or computing, size pools from the formulas, keep shared state and critical sections small, and pick a concurrency model whose failure modes your team can reason about.',
      ],
      scene: {
        nodes: [reqs(), ...cores(3, () => ({ load: 85 })), store()],
        links: [...[0, 1, 2].map((i) => link('reqs', `core${i}`)), ...[0, 1, 2].map((i) => link(`core${i}`, 'db', { arrow: 'both' }))],
        flows: [...[0, 1, 2].map((i) => flow(['reqs', `core${i}`], { rate: 1.5 })), ...[0, 1, 2].map((i) => flow([`core${i}`, 'db'], { back: true, rate: 1.2 }))],
      },
    },
  ],
};

export default lesson;
