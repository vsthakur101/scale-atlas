import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const svc = (id: string, r: number, d: number, name: string, tone: SceneNode['tone'] = 'blue', extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, tone, 'server', { size: [1.2, 1.2], height: 26, ...extra });
const orch = (extra: Partial<SceneNode> = {}) => box('orch', -2, 0, 'Orchestrator (workflow engine)', 'purple', 'route', { size: [1.6, 1.6], height: 34, ...extra });
const bus = (extra: Partial<SceneNode> = {}) => box('bus', -2, 0, 'Event bus', 'yellow', 'queue', { size: [2.4, 1], height: 14, ...extra });

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

const lesson: Lesson = {
  slug: 'source-orchestration-vs-choreography-in-microservices',
  title: 'Orchestration vs Choreography',
  blurb: 'A central conductor issuing commands, or services reacting to each other’s events: how the two styles differ in coupling, visibility, failure handling and cost.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'links', label: 'Communication links: orchestrated vs event-driven', icon: 'share' },
    { key: 'lat', label: 'End-to-end latency (happy path)', icon: 'clock' },
    { key: 'ok', label: 'Chance the whole workflow succeeds first time', icon: 'check' },
    { key: 'comp', label: 'Compensation steps needed on average', icon: 'refresh' },
  ],
  goals: [
    { text: 'The two coordination styles', step: 1 },
    { text: 'What orchestration gives and costs', step: 2 },
    { text: 'What choreography gives and costs', step: 3 },
    { text: 'Failures and compensation in each', step: 4 },
    { text: 'Choosing and combining them', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Steps (services) in the workflow', min: 2, max: 20, step: 1, default: 6, unit: '', description: 'Services that take part in one business process.' },
      { key: 'proc', label: 'Processing time per step', min: 1, max: 500, step: 1, default: 40, unit: ' ms', description: 'Work each service does.' },
      { key: 'hop', label: 'Messaging hop latency', min: 1, max: 200, step: 1, default: 15, unit: ' ms', description: 'Network + broker time per message.' },
      { key: 'subs', label: 'Event subscribers per event (choreography)', min: 1, max: 6, step: 1, default: 2, unit: '', description: 'Average number of services reacting to each event.' },
      { key: 'p', label: 'Chance a step succeeds', min: 90, max: 100, step: 0.1, default: 99, unit: '%', description: 'Per-step success probability.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(2, Math.round(input.n ?? 6));
      const proc = Math.max(1, input.proc ?? 40);
      const hop = Math.max(1, input.hop ?? 15);
      const subs = Math.max(1, input.subs ?? 2);
      const p = Math.min(1, Math.max(0.5, (input.p ?? 99) / 100));
      // Orchestrator: a command and a reply per step (2 hops); choreography: one event hop per step.
      const latOrch = n * (proc + 2 * hop);
      const latChor = n * (proc + hop);
      const ok = Math.pow(p, n);
      // Expected number of completed steps that must be undone when a later step fails (saga compensation).
      let comp = 0;
      for (let k = 1; k <= n; k++) comp += (Math.pow(p, k - 1) * (1 - p)) * (k - 1);
      return {
        links: step < 1 ? { v: '—' } : { v: `${n} commands vs ~${Math.round(n * subs)} subscriptions` },
        lat: step < 2 ? { v: '—' } : { v: `${fmtMs(latOrch)} orchestrated · ${fmtMs(latChor)} choreographed`, tone: 'good' },
        ok: step < 3 ? { v: '—' } : { v: `${(ok * 100).toFixed(1)}%`, tone: ok > 0.95 ? 'good' : ok > 0.85 ? 'warn' : 'bad' },
        comp: step < 3 ? { v: '—' } : { v: `${comp.toFixed(3)} per run`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Two styles',
      kind: 'insight',
      title: 'Who decides what happens next?',
      body: [
        'A business process — place order, charge payment, reserve stock, ship — crosses several services, and something must coordinate it. <b>Orchestration</b>: a central component (the <i>orchestrator</i>, a workflow engine) knows the whole process and tells each service what to do, in order, waiting for replies. <b>Choreography</b>: no conductor — each service does its job and publishes an <b>event</b>; others subscribe and react, so the process emerges from the chain of reactions.',
        'It is the old “conductor vs dancers” question. Neither is better in general; they trade <b>visibility and control</b> against <b>coupling and autonomy</b>, and the right choice depends on the process.',
      ],
      scene: { nodes: [svc('a', -10, -6, 'Order'), svc('b', -10, 6, 'Payment', 'orange'), orch({ tag: pill('commands to each step', 'route') }), svc('c', 8, -6, 'Stock', 'green'), svc('d', 8, 6, 'Shipping', 'teal')], links: [link('orch', 'a'), link('orch', 'b'), link('orch', 'c'), link('orch', 'd')], flows: [flow(['orch', 'a'], { rate: 1.2 }), flow(['orch', 'b'], { rate: 1.2 })] },
    },
    {
      short: 'Orchestration',
      kind: 'technique',
      title: 'Orchestration: a conductor with the whole score',
      body: [
        'The orchestrator holds the <b>workflow definition and its state</b>: call Payment, then Stock, then Shipping; branch on results; retry with backoff; wait for a human approval; set timeouts; run compensations on failure. Services stay simple — they just expose operations and know nothing of the process. Engines like Temporal, Step Functions, Camunda and Airflow persist the state so a crash resumes mid-flow.',
        'Strengths: the process is <b>visible in one place</b> (easy to read, audit, change and monitor — “which step is order 8841 on?”), error handling is centralised, and each service is loosely coupled to the others. Costs: an extra hop per step (command + reply: 6 × (40 + 30) = <b>420 ms</b> vs 330 ms here), the orchestrator becomes critical infrastructure (a single point of failure unless highly available) and a risk of piling too much business logic into it.',
      ],
      changes: [{ text: 'Workflow state and logic in one place', tone: 'good' }, { text: 'Extra hop per step; orchestrator must be highly available', tone: 'info' }],
      scene: { nodes: [orch({ tag: pill('step 3 of 6 · retry · timeout', 'list') }), svc('a', -10, -6, 'Payment'), svc('b', -10, 6, 'Stock', 'orange'), svc('c', 8, 0, 'Shipping', 'green')], links: [link('orch', 'a', { arrow: 'both' }), link('orch', 'b', { arrow: 'both' }), link('orch', 'c', { arrow: 'both' })], flows: [flow(['orch', 'a'], { rate: 1.2, back: true }), flow(['orch', 'b'], { rate: 1.2, back: true })] },
    },
    {
      short: 'Choreography',
      kind: 'technique',
      title: 'Choreography: services react to events',
      body: [
        'Order publishes <code>OrderPlaced</code>; Payment hears it, charges, publishes <code>PaymentCaptured</code>; Stock hears <i>that</i>, reserves, publishes <code>StockReserved</code>; Shipping reacts. No component knows the whole flow; adding a new reaction (send a confirmation email) means <b>subscribing</b>, with no change to existing services. It is highly decoupled, scales well and has no central bottleneck — latency is one hop per step.',
        'The cost is <b>emergent behaviour</b>: the process exists only in the combined subscriptions of many services, so it is hard to see, change safely, or answer “where is order 8841?”. Event chains can form <b>cycles</b> or hidden dependencies (a service silently depending on another’s event shape), and you need distributed tracing and correlation ids to follow a run. Beyond a handful of steps, complexity grows with the number of subscriptions.',
      ],
      changes: [{ text: 'Add behaviour by subscribing; no central point', tone: 'good' }, { text: 'Process is implicit; hard to trace and change', tone: 'bad' }],
      scene: { nodes: [svc('a', -10, -6, 'Order'), svc('b', -10, 6, 'Payment', 'orange'), bus({ tag: pill('OrderPlaced → PaymentCaptured → …', 'share') }), svc('c', 8, -6, 'Stock', 'green'), svc('d', 8, 6, 'Shipping', 'teal')], links: [link('a', 'bus'), link('bus', 'b'), link('bus', 'c'), link('bus', 'd')], flows: [flow(['a', 'bus', 'b'], { kind: 'write', rate: 1.5 }), flow(['b', 'bus', 'c'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Failure',
      kind: 'problem',
      title: 'Failures and compensation',
      body: [
        'Distributed processes can’t roll back with one transaction, so a failure at step k must <b>undo the k−1 completed steps</b> with compensating actions (refund, release stock, cancel shipment) — the Saga pattern (see that lesson). With 6 steps at 99% each, the whole process succeeds first time <b>94.1%</b> of the time; on failure an average of ~0.14 earlier steps per run need compensating.',
        'Orchestration makes compensation <b>explicit and ordered</b>: the orchestrator knows what has completed and runs the undo path. In choreography each service must react to <i>failure events</i> (<code>PaymentFailed</code> → release stock) — the compensation logic is scattered, easy to miss, and tricky when events arrive out of order or duplicate (handlers must be idempotent). Both need timeouts so a lost event doesn’t leave a process hanging forever.',
      ],
      changes: [{ text: '0.99⁶ = 94.1% succeed first time', tone: 'info' }, { text: 'Orchestrator: ordered undo · Choreography: scattered failure events', tone: 'info' }],
      scene: { nodes: [svc('a', -10, -6, 'Payment ✓', 'green'), svc('b', -10, 6, 'Stock ✓', 'green'), svc('c', 8, 0, 'Shipping ✗', 'red', { state: 'down', tag: pill('failed', 'alert', 'bad') }), orch({ tag: pill('compensate: release stock, refund', 'refresh', 'warn') })], links: [link('orch', 'a', { arrow: 'both' }), link('orch', 'b', { arrow: 'both' }), link('orch', 'c', { style: 'broken' })], flows: [flow(['orch', 'b'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Choosing',
      kind: 'tradeoff',
      title: 'Choosing — and combining',
      body: [
        '<b>Prefer orchestration</b> for long-running, multi-step business processes with branching, human steps, timeouts and clear ownership: order fulfilment, onboarding, payment flows — where visibility and reliable compensation matter. <b>Prefer choreography</b> for simple, short reactions and for integrating many independent consumers of a fact: “order placed” fans out to analytics, email and search with no coordination needed.',
        'Most real systems <b>mix them</b>: an orchestrated core process that publishes domain events, which other bounded contexts consume in a choreographed way. Guidelines: keep orchestrators thin (coordinate, don’t compute business rules), keep events about <i>facts</i> not commands, use correlation ids end to end, and monitor workflow instances. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Orchestrate the core process; choreograph the fan-out', tone: 'good' }, { text: 'Thin orchestrators; events are facts', tone: 'good' }],
      scene: { nodes: [orch({ name: 'Order workflow', tag: pill('orchestrated core', 'check') }), bus({ name: 'Domain events', tag: pill('choreographed consumers', 'share') }), svc('a', 8, -6, 'Email', 'green'), svc('b', 8, 6, 'Analytics', 'teal')], links: [link('orch', 'bus'), link('bus', 'a'), link('bus', 'b')], flows: [flow(['orch', 'bus', 'a'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Conductor for visibility, dancers for autonomy',
      body: [
        '<b>Orchestration</b>: central workflow, explicit compensation, easy to see — at the cost of an extra hop and a critical component. <b>Choreography</b>: event reactions, minimal coupling, easy extension — at the cost of an implicit process and scattered failure handling.',
        'Use orchestration for core business processes, choreography for fan-out, and always add tracing, idempotency and timeouts.',
      ],
      scene: { nodes: [orch(), svc('a', 8, -6, 'Service A'), svc('b', 8, 6, 'Service B', 'orange')], links: [link('orch', 'a'), link('orch', 'b')], flows: [flow(['orch', 'a'], { rate: 1.2 })] },
    },
  ],
};

export default lesson;
