import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const reqs = (extra: Partial<SceneNode> = {}) => crowd('reqs', -18, 0, 12, 'incoming requests', extra);
const runq = (extra: Partial<SceneNode> = {}) => box('runq', -9, 0, 'Run queue (waiting for a core)', 'purple', 'queue', { size: [1.6, 1.4], height: 20, ...extra });
const cpu = (extra: Partial<SceneNode> = {}) => box('cpu', 1, 0, 'CPU cores', 'orange', 'cpu', { size: [2, 2], height: 32, ...extra });
const prof = (extra: Partial<SceneNode> = {}) => box('prof', 12, -7, 'Profiler / flame graph', 'green', 'search', { size: [1.4, 1.4], height: 22, ...extra });
const cause = (id: string, y: number, name: string, extra: Partial<SceneNode> = {}) => box(id, 12, y, name, 'red', 'alert', { size: [1.3, 1.2], height: 18, ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${n.toFixed(0)}`);
const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : ms >= 100 ? `${Math.round(ms)} ms` : `${ms.toFixed(1)} ms`);

// Mean waiting time in an M/M/c queue (Sakasegawa approximation).
const wait = (rho: number, c: number, s: number): number => (rho >= 1 ? Infinity : (s * Math.pow(rho, Math.sqrt(2 * (c + 1)) - 1)) / (c * (1 - rho)));

const lesson: Lesson = {
  slug: 'source-top-9-causes-of-100-cpu-usage',
  title: 'CPU Saturation: Utilisation, Queues and Why 90% Is a Cliff',
  blurb: 'Why latency explodes long before CPU reaches 100%, how to read user/system/iowait/steal and the run queue, a catalogue of the usual culprits (spins, regex backtracking, GC, hot locks, interrupts), and how to size so you never live on the cliff.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'rho', label: 'CPU utilisation', icon: 'gauge' },
    { key: 'resp', label: 'Mean response time (service time + queueing)', icon: 'clock' },
    { key: 'mult', label: 'Response vs an idle machine', icon: 'activity' },
    { key: 'q', label: 'Requests waiting in the run queue', icon: 'queue' },
    { key: 'safe', label: 'Request rate that keeps utilisation at the target', icon: 'shield' },
  ],
  goals: [
    { text: 'Utilisation versus saturation', step: 1 },
    { text: 'The queueing curve: latency vs utilisation', step: 2 },
    { text: 'Reading the symptoms: user, system, iowait, steal', step: 3 },
    { text: 'Nine usual causes of a pegged CPU', step: 4 },
    { text: 'Diagnose, mitigate and size for headroom', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'cores', label: 'CPU cores', min: 1, max: 128, step: 1, default: 8, unit: '', description: 'Parallel execution units.' },
      { key: 'svc', label: 'CPU time per request', min: 0.1, max: 500, step: 0.1, default: 20, unit: ' ms', description: 'Service time when the request has a core.' },
      { key: 'lam', label: 'Request rate', min: 1, max: 20000, step: 1, default: 280, unit: '/s', description: 'Arrivals per second.' },
      { key: 'tgt', label: 'Target utilisation for sizing', min: 20, max: 95, step: 5, default: 70, unit: '%', description: 'Utilisation you are willing to run at.' },
    ],
    calculate: (input, step) => {
      const c = Math.max(1, Math.round(input.cores ?? 8));
      const s = Math.max(0.01, input.svc ?? 20);
      const lam = Math.max(0, input.lam ?? 280);
      const tgt = Math.min(0.99, Math.max(0.1, (input.tgt ?? 70) / 100));
      const rho = (lam * s) / 1000 / c;
      const w = wait(Math.min(rho, 0.9999), c, s);
      const resp = rho >= 1 ? Infinity : s + w;
      const q = rho >= 1 ? Infinity : (lam * w) / 1000;
      const safe = (tgt * c * 1000) / s;
      return {
        rho: step < 1 ? { v: '—' } : { v: `${(rho * 100).toFixed(0)}%${rho >= 1 ? ' — saturated: demand exceeds capacity' : ''}`, tone: rho < 0.7 ? 'good' : rho < 0.85 ? 'warn' : 'bad' },
        resp: step < 2 ? { v: '—' } : { v: rho >= 1 ? 'grows without bound' : `${fmtMs(resp)} (${fmtMs(s)} service + ${fmtMs(w)} queueing)`, tone: rho < 0.7 ? 'good' : rho < 0.85 ? 'warn' : 'bad' },
        mult: step < 2 ? { v: '—' } : { v: rho >= 1 ? '∞' : `${(resp / s).toFixed(2)}×`, tone: resp / s < 1.3 ? 'good' : resp / s < 2 ? 'warn' : 'bad' },
        q: step < 2 ? { v: '—' } : { v: rho >= 1 ? 'unbounded' : `${(q).toFixed(2)} on average`, tone: q < c ? 'good' : 'warn' },
        safe: step < 5 ? { v: '—' } : { v: `${fmtN(safe)}/s at ${(tgt * 100).toFixed(0)}% (${fmtN(lam)}/s offered)`, tone: lam <= safe ? 'good' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Utilisation',
      kind: 'insight',
      title: 'Busy is not the same as saturated',
      body: [
        '<b>Utilisation</b> is the fraction of time a CPU is executing something; <b>saturation</b> is work that has to <i>wait</i> because every core is busy (the <b>run queue</b>; Linux <b>load average</b> counts runnable plus uninterruptible tasks). A core at 100% for a batch job that is the only thing wanted is fine — that is efficient. A request-serving system at 100% is a symptom of trouble, because it means requests are queueing, and queueing delay is added to every user’s latency (this is the USE method: for each resource, check Utilisation, Saturation, Errors).',
        'The relationship is steeply non-linear. Take 8 cores and 20 ms of CPU per request: capacity is 8 ÷ 0.02 = <b>400 requests/s</b>. At 280/s the CPU is <b>70% busy</b>; at 360/s it is 90%; at 400/s it is 100% and any further demand piles up without limit. The next steps show how the queueing delay behaves between those points — and why operators treat 70–80% as “full”.',
      ],
      scene: { nodes: [reqs({ tag: pill('280/s offered', 'activity') }), runq(), cpu({ tag: pill('8 cores · 20 ms each → 400/s max', 'gauge') })], links: [link('reqs', 'runq'), link('runq', 'cpu')], flows: [flow(['reqs', 'runq', 'cpu'], { rate: 2 })] },
    },
    {
      short: 'Queueing',
      kind: 'problem',
      title: 'Latency is flat, then it isn’t',
      body: [
        'A multi-core server is an <b>M/M/c queue</b>: mean wait is approximately <code>W<sub>q</sub> ≈ S · ρ^(√(2(c+1)) − 1) ÷ (c(1 − ρ))</code> (Sakasegawa), where S is service time, c the cores and ρ the utilisation. With S = 20 ms and c = 8: at <b>ρ = 70%</b> the average wait is ~2.6 ms, so a request takes <b>22.6 ms</b> (1.13×). At <b>90%</b> the wait is ~17.8 ms: <b>37.8 ms</b> (1.9×). At <b>95%</b> it is ~42 ms: <b>62 ms</b> (3.1×). At 99% it is hundreds of milliseconds, and above 100% it grows forever.',
        'Averages understate the pain: <b>tail latency</b> (p99) rises faster than the mean, and real traffic is burstier than the Poisson model assumes, so the cliff arrives earlier. Fewer cores make it worse (one core at 90% averages 10× the service time; eight cores at 90% about 1.9×), which is why pooling capacity helps. Hence the practice: autoscale on <b>utilisation around 60–70%</b> (or on queue depth/latency), keep N+1 headroom, and treat sustained 85%+ as an incident <i>before</i> it reaches 100%.',
      ],
      changes: [{ text: '8 cores, 20 ms: ρ 70% → 22.6 ms · 90% → 37.8 ms · 95% → 62 ms', tone: 'bad' }, { text: 'Tail latency rises faster than the mean; fewer cores is worse', tone: 'bad' }, { text: 'Scale at 60–70%, not at 100%', tone: 'good' }],
      concepts: [{ term: 'Saturation', def: 'Work waiting because a resource is fully busy; it shows up as queueing delay, not as utilisation.' }],
      scene: { nodes: [reqs({ tag: pill('360/s → ρ = 90%', 'alert', 'warn') }), runq({ state: 'hot', tag: pill('queue building', 'queue', 'warn') }), cpu({ state: 'hot', load: 90, tag: pill('37.8 ms per request', 'clock', 'warn') })], links: [link('reqs', 'runq'), link('runq', 'cpu')], flows: [flow(['reqs', 'runq', 'cpu'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Symptoms',
      kind: 'technique',
      title: 'Where is the time going? user, system, iowait, steal',
      body: [
        'Start with the split in <code>top</code>/<code>vmstat</code>/<code>mpstat</code>: <b>%user</b> (your code — profile it), <b>%system</b> (kernel work on your behalf: syscalls, networking, page faults, context switches, locking), <b>%iowait</b> (cores idle <i>waiting for I/O</i>; not a CPU problem, and high iowait with low user means a disk/network bottleneck), <b>%irq/%softirq</b> (interrupt handling, often network packets on one core), and <b>%steal</b> (the hypervisor gave your vCPU time to another VM — a noisy neighbour, or a throttled burstable instance). Then per-process (<code>pidstat</code>, <code>top -H</code> for threads) and per-core: <b>one core at 100% while others idle</b> means a single-threaded bottleneck or poor interrupt/thread distribution.',
        'Also check <b>context switches</b> (<code>cs</code> in vmstat — thousands per core per second is a smell), the <b>run-queue length</b> versus core count (<code>r</code> column; persistently above cores = saturation), and <b>cgroup throttling</b> in containers (<code>nr_throttled</code> in <code>cpu.stat</code> — a pod hitting its CPU limit looks idle on the host but is stalled in 100 ms quota periods). Each pattern points to a different cause class below.',
      ],
      changes: [{ text: 'high user → your code · high system → kernel/syscalls · iowait → I/O', tone: 'info' }, { text: 'steal → noisy neighbour; throttling → container CPU limit', tone: 'info' }, { text: 'One hot core → single-thread bottleneck or IRQ pinning', tone: 'info' }],
      scene: { nodes: [cpu({ tag: pill('user 70 · sys 20 · iowait 2 · steal 8', 'list') }), prof({ tag: pill('top -H · pidstat · perf', 'search', 'good') }), runq({ tag: pill('r > cores = saturated', 'queue', 'warn') })], links: [link('runq', 'cpu'), link('cpu', 'prof')], flows: [flow(['cpu', 'prof'], { rate: 1.4 })] },
    },
    {
      short: 'Causes',
      kind: 'insight',
      title: 'Nine usual causes of a pegged CPU',
      body: [
        '<b>1. Genuine load</b> (a traffic spike, a marketing event, a batch overlapping peak) — fix by scaling or shedding. <b>2. Infinite or runaway loops</b> (a bug, retry without backoff, a busy-wait spinning on a flag). <b>3. Regex catastrophic backtracking</b> (nested quantifiers on adversarial input: one request pins a core for seconds — ReDoS). <b>4. Garbage-collection thrash</b> (heap too small, allocation storms: the collector runs nearly continuously — see the GC lesson). <b>5. Lock contention and spinning</b> (spinlocks, hot mutexes, thundering herds — cores busy but doing no useful work). <b>6. Expensive per-request work</b> (JSON parsing of huge bodies, serialisation, compression/crypto at high levels, N+1 queries’ result mapping, unindexed in-memory scans). <b>7. Excessive logging, metrics or tracing</b> (formatting and shipping at every call site).',
        '<b>8. Interrupt and kernel load</b> (a packet flood or DDoS handled in softirq on one core, too many small syscalls, context switches from huge thread pools — see the Concurrency lessons). <b>9. Environmental causes</b> (steal from a noisy neighbour, CPU throttling by container limits, thermal throttling, a misconfigured autoscaler or a sidecar/agent eating cores, cryptominer malware after a compromise). Note the symmetry: most are <i>bugs or contention</i> rather than real demand — which is why profiling beats adding machines as a first reaction.',
      ],
      changes: [{ text: 'Load · runaway loop · regex backtracking · GC thrash · lock spin · heavy work · logging · interrupts · environment', tone: 'info' }, { text: 'Most are bugs or contention: profile before scaling', tone: 'good' }],
      scene: { nodes: [cpu({ state: 'hot', load: 100, tag: pill('100%', 'alert', 'bad') }), cause('c1', -8, 'regex backtracking'), cause('c2', 0, 'GC thrash'), cause('c3', 8, 'lock spin / loops')], links: [link('cpu', 'c1'), link('cpu', 'c2'), link('cpu', 'c3')], flows: [flow(['cpu', 'c2'], { kind: 'fail', rate: 1.4 })] },
    },
    {
      short: 'Fix',
      kind: 'tradeoff',
      title: 'Diagnose, mitigate, then size for headroom',
      body: [
        '<b>Diagnose</b>: sample with a profiler — <code>perf top</code>/<code>perf record</code> and <b>flame graphs</b>, async-profiler or JFR for the JVM, py-spy for Python, pprof for Go — to see which functions burn the cycles; check thread dumps for spinning or blocked threads; compare to a deploy or traffic change in the time series; look at GC logs. <b>Mitigate under fire</b>: shed load (rate limit, drop low-priority traffic, serve cached/degraded responses), roll back the last deploy, restart the runaway process, raise limits temporarily, or scale out — and add timeouts and circuit breakers so a slow dependency can’t turn into a CPU-burning retry storm (see the Resiliency and Backpressure lessons).',
        '<b>Prevent</b>: capacity-plan at a <b>target utilisation</b> — with 8 cores and 20 ms requests, 70% means <b>280 requests/s</b> per node, and you add machines as demand approaches it (see the Back-of-the-Envelope lesson); load-test to find the knee of the latency curve rather than the 100% point; set alerts on run-queue depth, p99 latency and throttling, not just CPU%; protect against pathological inputs (regex timeouts/linear-time engines, request size limits); and keep profiling in production (continuous profilers). All numbers here come from a queueing approximation, not a measurement of any system.',
      ],
      changes: [{ text: 'Flame graphs, thread dumps, GC logs; correlate with deploys', tone: 'good' }, { text: 'Shed load, roll back, scale; timeouts + breakers', tone: 'good' }, { text: 'Size at ~70% target: 280 req/s per 8-core node here', tone: 'info' }],
      scene: { nodes: [reqs(), runq({ tag: pill('admission control / shed', 'filter', 'good') }), cpu({ tag: pill('70% target', 'gauge', 'good') }), prof({ tag: pill('continuous profiling', 'search', 'good') })], links: [link('reqs', 'runq'), link('runq', 'cpu'), link('cpu', 'prof')], flows: [flow(['reqs', 'runq', 'cpu'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Latency bends upward long before 100%',
      body: [
        'Utilisation is busy time; <b>saturation</b> is queueing, and queueing delay explodes non-linearly: 8 cores, 20 ms — <b>22.6 ms at 70%, 37.8 ms at 90%, 62 ms at 95%</b>. Read user/system/iowait/steal and the run queue to localise the cause; most pegged CPUs are loops, backtracking, GC, contention or environment rather than real load.',
        'Profile first, shed load to stabilise, and size to a target utilisation (~70%) with headroom.',
      ],
      scene: { nodes: [reqs(), runq(), cpu(), prof()], links: [link('reqs', 'runq'), link('runq', 'cpu'), link('cpu', 'prof')], flows: [flow(['reqs', 'runq', 'cpu'], { rate: 2 })] },
    },
  ],
};

export default lesson;
