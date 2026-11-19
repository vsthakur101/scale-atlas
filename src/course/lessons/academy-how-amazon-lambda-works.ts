import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const events = (extra: Partial<SceneNode> = {}) => crowd('ev', -15, 0, 8, 'events', extra);
const front = (extra: Partial<SceneNode> = {}) => box('front', -7, 0, 'Invoke front end', 'orange', 'route', { size: [1.3, 1.3], height: 28, ...extra });
const place = (extra: Partial<SceneNode> = {}) => box('place', 0, -6, 'Placement service', 'purple', 'gauge', { size: [1.2, 1.2], height: 24, ...extra });
const env = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`e${i}`, 8, (i - (n - 1) / 2) * 4.2, name, 'blue', 'box', { size: [1.2, 1.2], height: 24, ...extra });

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const fmtUSD = (n: number): string => (n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(0)}`);

const lesson: Lesson = {
  slug: 'academy-how-amazon-lambda-works',
  title: 'How Function-as-a-Service (Lambda) Works',
  blurb: 'Execution environments, cold starts, concurrency as rate × duration, micro-VM isolation — and the cost model that decides when serverless pays off.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'conc', label: 'Concurrent executions: average → burst peak', icon: 'layers' },
    { key: 'cold', label: 'Cold starts in a burst', icon: 'alert' },
    { key: 'slow', label: 'Slowest request in a burst', icon: 'clock' },
    { key: 'fn', label: 'Function cost / month', icon: 'gauge' },
    { key: 'vm', label: 'Always-on VM fleet cost / month', icon: 'server' },
  ],
  goals: [
    { text: 'What happens between an event and your handler', step: 2 },
    { text: 'The execution-environment lifecycle: init, invoke, freeze', step: 3 },
    { text: 'Concurrency = rate × duration, and how scaling works', step: 4 },
    { text: 'Cold starts and how to reduce them', step: 5 },
    { text: 'Cost model and when VMs win', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rate', label: 'Average invocations per second', min: 1, max: 5000, step: 1, default: 50, unit: '/s', description: 'Mean request rate.' },
      { key: 'dur', label: 'Duration per invocation', min: 5, max: 10000, step: 5, default: 200, unit: ' ms', description: 'How long the handler runs (billed).' },
      { key: 'mem', label: 'Memory configured', min: 128, max: 10240, step: 128, default: 512, unit: ' MB', description: 'Memory setting (CPU scales with it).' },
      { key: 'burst', label: 'Burst multiple', min: 1, max: 50, step: 1, default: 10, unit: '×', description: 'Peak rate as a multiple of the average.' },
      { key: 'init', label: 'Cold-start time', min: 50, max: 5000, step: 50, default: 400, unit: ' ms', description: 'Time to create and initialise a new execution environment.' },
      { key: 'pervm', label: 'Concurrent requests one VM handles', min: 5, max: 500, step: 5, default: 40, unit: '', description: 'Capacity of one comparable always-on instance.' },
      { key: 'vmusd', label: 'VM price', min: 0.01, max: 3, step: 0.01, default: 0.17, unit: ' $/h', description: 'Hourly price of one instance (illustrative).' },
    ],
    calculate: (input, step) => {
      const rate = Math.max(0.1, input.rate ?? 50);
      const dur = Math.max(1, input.dur ?? 200) / 1000;
      const mem = Math.max(128, input.mem ?? 512) / 1024;
      const burst = Math.max(1, input.burst ?? 10);
      const init = Math.max(1, input.init ?? 400);
      const perVM = Math.max(1, input.pervm ?? 40);
      const vmUsd = Math.max(0, input.vmusd ?? 0.17);
      // Little's law: concurrent executions = arrival rate × time in system.
      const avgConc = rate * dur;
      const peakConc = rate * burst * dur;
      const extra = Math.max(0, Math.ceil(peakConc) - Math.ceil(avgConc));
      // Illustrative list prices: $0.0000166667 per GB-second and $0.20 per million requests.
      const secs = 2592000;
      const fnCost = rate * secs * (dur * mem * 0.0000166667 + 0.0000002);
      // An always-on fleet must be sized for the peak, with ~60% target utilisation.
      const vms = Math.max(2, Math.ceil(peakConc / (perVM * 0.6)));
      const vmCost = vms * vmUsd * 730;
      return {
        conc: step < 3 ? { v: '—' } : { v: `${avgConc.toFixed(avgConc < 10 ? 1 : 0)} → ${peakConc.toFixed(peakConc < 10 ? 1 : 0)}` },
        cold: step < 3 ? { v: '—' } : { v: `${extra} new environments`, tone: extra > 100 ? 'warn' : 'good' },
        slow: step < 4 ? { v: '—' } : { v: fmtMs(init + dur * 1000), tone: init > 1000 ? 'bad' : init > 300 ? 'warn' : 'good' },
        fn: step < 6 ? { v: '—' } : { v: fmtUSD(fnCost), tone: fnCost < vmCost ? 'good' : 'warn' },
        vm: step < 6 ? { v: '—' } : { v: `${fmtUSD(vmCost)} (${vms} instances)`, tone: vmCost < fnCost ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Idea',
      kind: 'insight',
      title: 'Give the platform a function, not a server',
      body: [
        'In a <b>function-as-a-service</b> model you upload a handler and say what triggers it — an HTTP request, a queue message, a file upload, a schedule. The provider runs it on demand, scales the number of running copies with load, and bills per request and per millisecond of execution. When nothing happens you pay nothing and nothing runs.',
        'You trade control (no long-lived processes, no local state, strict limits) for the removal of capacity planning, patching and idle cost. Under the hood it is a large fleet management problem: start code fast, isolate tenants strongly, and keep machines busy.',
      ],
      scene: { nodes: [events({ tag: pill('requests, messages, files', 'bolt') }), front(), box('fn', 8, 0, 'Your function', 'blue', 'box', { size: [1.4, 1.4], height: 28, tag: pill('runs only when needed', 'bolt', 'good') })], links: [link('ev', 'front'), link('front', 'fn')], flows: [flow(['ev', 'front', 'fn'], { rate: 1.5 })] },
    },
    {
      short: 'Invocation',
      kind: 'technique',
      title: 'From event to handler',
      body: [
        'A request reaches the <b>invoke front end</b>, which authenticates it and asks a <b>placement/worker-manager</b> service for a place to run: <i>is there an idle, already-initialised environment for this function?</i> If yes, the request is routed to it (a <b>warm start</b>, typically single-digit milliseconds of overhead). If not, the system must create one (a <b>cold start</b>).',
        'On a host, a <b>sandbox</b> (a micro-VM) holds the runtime and your code; a small agent inside delivers the event to your handler and returns the result. Synchronous calls return the response to the caller; asynchronous invocations are queued and retried on failure — so handlers must be <b>idempotent</b>.',
      ],
      changes: [{ text: 'Warm: reuse an idle environment', tone: 'good' }, { text: 'Cold: create a new one first', tone: 'bad' }, { text: 'Async events retried → idempotent handlers', tone: 'info' }],
      scene: { nodes: [events(), front(), place({ tag: pill('idle environment?', 'search') }), env(0, 2, 'Warm environment', { tag: pill('reuse', 'check', 'good') }), env(1, 2, 'New environment', { tone: 'orange', tag: pill('cold start', 'clock', 'warn') })], links: [link('ev', 'front'), link('front', 'place'), link('place', 'e0'), link('place', 'e1', { style: 'dashed' })], flows: [flow(['ev', 'front', 'place', 'e0'], { rate: 1.5 })] },
    },
    {
      short: 'Lifecycle',
      kind: 'technique',
      title: 'Init, invoke, freeze, reclaim',
      body: [
        'A new <b>execution environment</b> goes through <b>init</b>: download your code or container image, start the language runtime, run your top-level initialisation (import libraries, open clients). Then it <b>invokes</b> the handler. After the response the environment is <b>frozen</b> — kept idle for minutes in case another request arrives — and eventually reclaimed.',
        'Practical consequences: do expensive setup <i>outside</i> the handler so warm invocations reuse it; anything in memory or <code>/tmp</code> may survive between invocations but <b>never rely on it</b>; one environment handles <b>one request at a time</b>; background work after you return may be frozen mid-way.',
      ],
      changes: [{ text: 'Init once per environment, handler per request', tone: 'good' }, { text: 'One request at a time per environment', tone: 'info' }],
      scene: { nodes: [box('i', -8, 0, 'Init (download · runtime · setup)', 'orange', 'refresh', { size: [1.4, 1.4], height: 24 }), box('inv', 2, 0, 'Invoke handler', 'blue', 'bolt', { size: [1.3, 1.3], height: 28 }), box('fr', 12, 0, 'Frozen (idle, kept warm)', 'grey', 'pause', { size: [1.3, 1.3], height: 22 })], links: [link('i', 'inv', { arrow: 'end' }), link('inv', 'fr', { arrow: 'end' }), link('fr', 'inv', { style: 'dashed', arrow: 'end' })], flows: [flow(['i', 'inv', 'fr'], { rate: 1 })] },
    },
    {
      short: 'Concurrency',
      kind: 'technique',
      title: 'Concurrency = rate × duration',
      body: [
        'By <b>Little’s law</b>, the number of simultaneous executions equals the arrival rate times the duration: 50 requests/s × 0.2 s = <b>10 concurrent</b>. Because each environment serves one request at a time, 10 environments are busy. Burst 10× to 500/s and you need <b>100</b> — 90 new environments that must be created now, each a cold start.',
        'Platforms scale by adding environments quickly, but with limits: an account-wide concurrency limit, and a <b>burst/scaling rate</b> (a number of new environments per minute). Exceed them and requests are throttled. Shorter duration means fewer environments for the same rate — optimising a handler from 200 ms to 100 ms halves the concurrency and the cost.',
      ],
      changes: [{ text: '50/s × 0.2 s = 10 concurrent', tone: 'info' }, { text: '10× burst → 90 new environments at once', tone: 'bad' }],
      concepts: [{ term: 'Little’s law', def: 'Average concurrency equals arrival rate multiplied by average time in the system.' }],
      scene: { nodes: [events({ tag: pill('burst: 50 → 500 /s', 'bolt', 'warn') }), front(), ...[0, 1, 2, 3].map((i) => env(i, 4, i < 1 ? 'Warm' : 'New', { tone: i < 1 ? 'blue' : 'orange', tag: i < 1 ? undefined : pill('cold', 'clock', 'warn') }))], links: [link('ev', 'front'), ...[0, 1, 2, 3].map((i) => link('front', `e${i}`))], flows: [flow(['ev', 'front', 'e0'], { rate: 1.5 }), flow(['ev', 'front', 'e1'], { rate: 1.5 }), flow(['ev', 'front', 'e2'], { rate: 1.5 }), flow(['ev', 'front', 'e3'], { rate: 1.5 })] },
    },
    {
      short: 'Cold starts',
      kind: 'problem',
      title: 'Cold starts: where the extra latency comes from',
      body: [
        'A cold start adds download + runtime boot + your init: roughly 100–400 ms for a small interpreted function, more for heavyweight runtimes, big packages or code that opens many connections at init, and VPC attachment historically added more. At the defaults the slowest request in a burst takes <b>0.6 s</b> (400 ms init + 200 ms work) instead of 200 ms.',
        'Reduce them: <b>smaller packages</b> and fewer imports, <b>lighter runtimes</b>, lazy initialisation, <b>snapshotting</b> an initialised runtime (SnapStart-style), <b>provisioned concurrency</b> that keeps N environments initialised (you pay for them, but latency is flat), or periodic warming. Cold starts hit p99, not the average — measure percentiles, and ask whether your latency target even cares.',
      ],
      changes: [{ text: 'Init 400 ms + work 200 ms = 0.6 s for the first requests', tone: 'bad' }, { text: 'Smaller code · snapshots · provisioned concurrency', tone: 'good' }],
      scene: { nodes: [events(), front(), env(0, 2, 'New environment', { state: 'hot', tone: 'orange', tag: pill('init 400 ms…', 'clock', 'warn') }), env(1, 2, 'Provisioned', { tag: pill('already warm', 'check', 'good') })], links: [link('ev', 'front'), link('front', 'e0'), link('front', 'e1')], flows: [flow(['ev', 'front', 'e0'], { kind: 'heavy', rate: 1 }), flow(['ev', 'front', 'e1'], { rate: 1.5 })] },
    },
    {
      short: 'Isolation',
      kind: 'insight',
      title: 'Strong isolation, fast: micro-VMs',
      body: [
        'Thousands of customers’ functions share the same physical hosts, so isolation must be much stronger than a container’s. AWS Lambda runs each environment in a <b>Firecracker micro-VM</b>: a minimal KVM-based virtual machine with a tiny device model that boots in ~125 ms and uses a few MB of overhead — VM-grade isolation with near-container density.',
        'Hosts pack many micro-VMs, keeping the fleet busy by sending work to machines with free capacity and reusing idle environments aggressively. The multi-tenant design is why functions have constraints: no inbound connections, limited local disk, time limits, and no persistent processes.',
      ],
      scene: { nodes: [box('host', 0, 0, 'Physical host', 'grey', 'server', { size: [3, 1.6], height: 14 }), ...[0, 1, 2].map((i) => box(`m${i}`, -6 + i * 6, -7, `micro-VM ${i + 1}`, 'teal', 'shield', { size: [1.2, 1.2], height: 22, tag: i === 1 ? pill('own kernel', 'lock') : undefined }))], links: [0, 1, 2].map((i) => link(`m${i}`, 'host')), flows: [] },
    },
    {
      short: 'Cost',
      kind: 'tradeoff',
      title: 'Pay per use versus pay for capacity',
      body: [
        'Billing is per request (illustratively ~$0.20 per million) plus <b>GB-seconds</b> (~$0.0000167 each): memory × duration. At 50 requests/s with 200 ms and 512 MB that is about <b>$242 a month</b>. An always-on fleet must be sized for the <i>peak</i> — 100 concurrent at a 10× burst on instances handling 40 each at 60% utilisation is 5 instances ≈ <b>$620/month</b> — even though average load needs two. Spiky or low-volume workloads favour functions; steady high utilisation favours instances.',
        'Break-even: a sustained rate where functions’ per-ms pricing exceeds the cost of kept-busy VMs — often tens of millions of invocations a month at moderate durations. Also count what functions remove: no patching, no autoscaling tuning, no idle capacity. Prices here are illustrative; check current list prices.',
      ],
      changes: [{ text: 'Function: ~$242/mo · fleet for the peak: ~$620/mo (defaults)', tone: 'info' }, { text: 'Steady, high utilisation → instances win', tone: 'info' }],
      scene: { nodes: [box('f', -6, 0, 'Pay per ms', 'blue', 'gauge', { size: [1.4, 1.4], height: 24, tag: pill('great when spiky', 'check', 'good') }), box('v', 8, 0, 'Pay for capacity', 'orange', 'server', { size: [1.4, 1.4], height: 28, tag: pill('great when steady', 'check') })], links: [], flows: [] },
    },
    {
      short: 'Limits',
      kind: 'problem',
      title: 'The constraints that shape designs',
      body: [
        '<b>Time limit</b> (15 minutes), <b>payload</b> and <b>memory</b> caps, no inbound connections. <b>Statelessness</b>: keep state in a database, cache or object store. <b>Downstream connections</b>: 1,000 concurrent executions can open 1,000 database connections and exhaust it — use a connection proxy, reuse clients across warm invocations, or limit function concurrency.',
        'And <b>fan-out cost</b>: a function calling functions pays twice for the wait; prefer queues and step orchestration over synchronous chains. Retries, dead-letter queues, partial-batch failure handling and observability need deliberate design. Figures here are model outputs; the cost numbers use illustrative prices.',
      ],
      scene: { nodes: [box('fns', -8, 0, '1,000 concurrent functions', 'blue', 'box', { size: [1.5, 1.5], height: 28 }), box('proxy', 2, 0, 'Connection proxy', 'teal', 'shield', { size: [1.2, 1.2], height: 22, tag: pill('pools connections', 'check', 'good') }), db('db', 12, 0, 'Database', { size: [1.3, 1.3], tag: pill('max 200 connections', 'alert', 'warn') })], links: [link('fns', 'proxy'), link('proxy', 'db')], flows: [flow(['fns', 'proxy', 'db'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Elastic, isolated, and priced by use',
      body: [
        'A function runs in an <b>execution environment</b> (a micro-VM) that is created cold, reused warm and frozen between calls. Concurrency is <code>rate × duration</code> and scales by adding environments; cold starts add latency to the first requests of a burst; cost is per request and GB-second, so spiky workloads gain and steady ones may not.',
        'Do setup outside the handler, keep it stateless and idempotent, size memory to duration, guard downstream connections, and compare cost against a right-sized fleet at your real utilisation.',
      ],
      scene: { nodes: [events(), front(), env(0, 3, 'Env'), env(1, 3, 'Env'), env(2, 3, 'Env')], links: [link('ev', 'front'), link('front', 'e0'), link('front', 'e1'), link('front', 'e2')], flows: [flow(['ev', 'front', 'e1'], { rate: 2 })] },
    },
  ],
};

export default lesson;
