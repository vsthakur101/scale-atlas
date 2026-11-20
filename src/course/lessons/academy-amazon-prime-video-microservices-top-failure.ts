import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const src = (extra: Partial<SceneNode> = {}) => crowd('src', -18, 0, 10, 'video streams (1 s segments)', extra);
const orch = (extra: Partial<SceneNode> = {}) => box('orch', -9, 0, 'Workflow orchestrator (billed per transition)', 'purple', 'steps', { size: [1.6, 1.6], height: 28, ...extra });
const fn = (i: number, name: string, extra: Partial<SceneNode> = {}) => box(`f${i}`, 2, -9 + i * 4.5, name, 'orange', 'bolt', { size: [1.1, 1.1], height: 18, ...extra });
const obj = (extra: Partial<SceneNode> = {}) => disk('obj', 12, 0, 'Object store (intermediate frames)', { size: [3, 1.2], height: 14, tone: 'yellow', ...extra });
const mono = (extra: Partial<SceneNode> = {}) => box('mono', 2, 0, 'One process: stages are function calls', 'green', 'cpu', { size: [2, 2], height: 34, ...extra });
const mem = (extra: Partial<SceneNode> = {}) => db('mem', 12, 0, 'In-memory buffers', { size: [1.4, 1.4], ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);
const fmtD = (n: number): string => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString('en-US')}`);

const lesson: Lesson = {
  slug: 'academy-amazon-prime-video-microservices-top-failure',
  title: 'Orchestration Overhead: When Serverless Workflows Cost More Than the Work',
  blurb: 'Per-event billing for workflow transitions and object-store hand-offs can dwarf the compute they coordinate. Model the cost of a many-stage pipeline built from functions versus the same stages as calls inside one process — and when each wins.',
  minutes: 12,
  level: 'Advanced',
  metrics: [
    { key: 'orch', label: 'Orchestration (state-transition) cost per day', icon: 'dollar' },
    { key: 'dist', label: 'Total distributed pipeline cost per day', icon: 'cloud' },
    { key: 'mono', label: 'Same work in-process per day', icon: 'cpu' },
    { key: 'ratio', label: 'Distributed ÷ in-process', icon: 'scale' },
    { key: 'lat', label: 'Added latency from transitions (per segment)', icon: 'clock' },
  ],
  goals: [
    { text: 'A pipeline of many small stages', step: 1 },
    { text: 'Where the money goes: per-transition and per-request prices', step: 2 },
    { text: 'The hidden data movement between stages', step: 3 },
    { text: 'The in-process alternative and what it gives up', step: 4 },
    { text: 'A decision rule: work per event vs overhead per event', step: 5 },
  ],
  legend: ['request', 'write', 'response', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'streams', label: 'Concurrent streams (segments per second)', min: 10, max: 200000, step: 10, default: 10000, unit: '', description: 'One 1-second segment per stream per second.' },
      { key: 'stages', label: 'Pipeline stages per segment', min: 1, max: 30, step: 1, default: 5, unit: '', description: 'Separate functions per segment.' },
      { key: 'tps', label: 'Orchestrator transitions per stage', min: 1, max: 6, step: 1, default: 2, unit: '', description: 'State transitions (enter + exit) per task.' },
      { key: 'ptr', label: 'Price per million transitions', min: 0.1, max: 100, step: 0.1, default: 25, unit: ' $', description: 'Illustrative standard-workflow price.' },
      { key: 'ms', label: 'Compute per stage', min: 1, max: 2000, step: 1, default: 200, unit: ' ms', description: 'CPU time of one stage on one segment.' },
      { key: 'gbs', label: 'Function price per GB-second', min: 0.000005, max: 0.0001, step: 0.000001, default: 0.0000166667, unit: ' $', description: 'Illustrative function compute price (1 GB memory).' },
      { key: 'inv', label: 'Function price per million invocations', min: 0.05, max: 2, step: 0.05, default: 0.2, unit: ' $', description: 'Per-request charge.' },
      { key: 'put', label: 'Object PUT price per million', min: 0.5, max: 10, step: 0.5, default: 5, unit: ' $', description: 'Intermediate write per stage.' },
      { key: 'get', label: 'Object GET price per million', min: 0.05, max: 2, step: 0.05, default: 0.4, unit: ' $', description: 'Intermediate read per stage.' },
      { key: 'core', label: 'Cost of one core-hour (in-process)', min: 0.005, max: 0.2, step: 0.005, default: 0.04, unit: ' $', description: 'Provisioned instance core price.' },
      { key: 'tl', label: 'Latency per workflow transition', min: 1, max: 100, step: 1, default: 30, unit: ' ms', description: 'Scheduling and state persistence delay.' },
    ],
    calculate: (input, step) => {
      const segs = Math.max(1, input.streams ?? 1e4);
      const stages = Math.max(1, Math.round(input.stages ?? 5));
      const tps = Math.max(1, Math.round(input.tps ?? 2));
      const ptr = Math.max(0, (input.ptr ?? 25) / 1e6);
      const ms = Math.max(0.1, (input.ms ?? 200) / 1000);
      const gbs = Math.max(0, input.gbs ?? 0.0000166667);
      const inv = Math.max(0, (input.inv ?? 0.2) / 1e6);
      const put = Math.max(0, (input.put ?? 5) / 1e6);
      const get = Math.max(0, (input.get ?? 0.4) / 1e6);
      const core = Math.max(0.0001, input.core ?? 0.04);
      const tl = Math.max(0, input.tl ?? 30);
      const day = 86400;
      const tasks = segs * stages;
      const orchD = tasks * tps * ptr * day;
      const fnD = (tasks * ms * 1 * gbs + tasks * inv) * day;
      const objD = tasks * (put + get) * day;
      const dist = orchD + fnD + objD;
      const monoD = ((segs * stages * ms) / 1) * core * 24;
      return {
        orch: step < 2 ? { v: '—' } : { v: `${fmtD(orchD)} (${((orchD / dist) * 100).toFixed(0)}% of the bill)`, tone: orchD / dist > 0.5 ? 'bad' : 'warn' },
        dist: step < 3 ? { v: '—' } : { v: `${fmtD(dist)} (orchestration ${fmtD(orchD)} + functions ${fmtD(fnD)} + object I/O ${fmtD(objD)})` },
        mono: step < 4 ? { v: '—' } : { v: `${fmtD(monoD)} (${fmtN(segs * stages * ms)} cores)`, tone: 'good' },
        ratio: step < 4 ? { v: '—' } : { v: `${(dist / monoD).toFixed(1)}×`, tone: dist / monoD > 3 ? 'bad' : 'good' },
        lat: step < 2 ? { v: '—' } : { v: `${Math.round(stages * tps * tl)} ms (${stages * tps} transitions × ${Math.round(tl)} ms) vs ~0`, tone: stages * tps * tl < 100 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Pipeline',
      kind: 'problem',
      title: 'A real-time pipeline built from many small functions',
      body: [
        'Consider a media-analysis pipeline: every second of every live stream is cut into a <b>segment</b>, passed through five stages (download, decode, detect defects, aggregate, publish a result), and discarded. Serverless building blocks make it fast to assemble: each stage is a <b>function</b>, a <b>workflow orchestrator</b> sequences them and handles retries, and stages hand frames to each other through an <b>object store</b>. Each piece is individually cheap, elastic and operationally light — and the design scales to many streams with no servers to manage.',
        'The trap is that the pieces are billed <b>per event</b>, and this pipeline is nothing but events: with 10,000 concurrent streams there are <b>10,000 segments a second</b>, 50,000 stage executions a second, 100,000 workflow transitions a second. Whether that is cheap or ruinous depends on one ratio: <b>how much useful work each event does versus the fixed charge it incurs</b>. Prices here are illustrative; the shape of the calculation is the lesson.',
      ],
      scene: { nodes: [src({ tag: pill('10,000 segments/s', 'activity') }), orch({ tag: pill('100,000 transitions/s', 'steps', 'warn') }), fn(0, 'decode'), fn(1, 'detect'), fn(2, 'aggregate'), obj()], links: [link('src', 'orch'), link('orch', 'f0'), link('orch', 'f1'), link('orch', 'f2'), link('f0', 'obj'), link('f1', 'obj'), link('f2', 'obj')], flows: [flow(['src', 'orch', 'f0', 'obj'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Prices',
      kind: 'technique',
      title: 'Where the money goes: per-transition charges',
      body: [
        'Orchestrators in “standard” mode charge per <b>state transition</b>; at an illustrative $25 per million, 5 stages × 2 transitions × 10,000 segments/s = 100,000 transitions/s = <b>$2.50 per second = $216,000 a day</b>. The functions themselves — 50,000 invocations/s of 200 ms at 1 GB — cost $0.17 per second in compute ($14,400/day) plus $864/day for the per-request fee. Orchestration is <b>15× the compute it coordinates</b>.',
        'The same overhead shows up as <b>latency</b>: each transition adds scheduling and state-persistence time (30 ms here), so 10 transitions add <b>300 ms</b> to every segment before any work is counted — fine for a nightly batch, painful for “real-time”. Check the pricing model before designing around it: workflow engines differ (standard vs express, per-transition vs per-duration), and a high-rate, short-task, fan-out-heavy workload is exactly the case where per-transition billing is the wrong fit.',
      ],
      changes: [{ text: '100,000 transitions/s × $25/M = $216,000/day', tone: 'bad' }, { text: 'Function compute only $14,400/day: coordination costs 15× the work', tone: 'bad' }, { text: '10 transitions × 30 ms = 300 ms of overhead per segment', tone: 'bad' }],
      scene: { nodes: [src(), orch({ state: 'hot', tag: pill('$2.50 / second', 'dollar', 'bad') }), fn(0, 'decode', { tag: pill('$0.17/s total compute', 'cpu', 'good') }), fn(1, 'detect'), fn(2, 'aggregate')], links: [link('src', 'orch'), link('orch', 'f0'), link('orch', 'f1'), link('orch', 'f2')], flows: [flow(['src', 'orch', 'f1'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Data',
      kind: 'problem',
      title: 'Hidden data movement between stages',
      body: [
        'Functions are stateless and short-lived, and orchestrators cap payload size, so stages exchange data through <b>durable storage</b>: stage 1 writes its output to the object store, stage 2 reads it, writes its own, and so on. Each hand-off is a PUT and a GET, billed per request, plus the <b>time</b> (tens of milliseconds each) and the <b>bandwidth</b> of moving uncompressed frames between services. Here: 50,000 PUTs/s × $5 per million = $0.25/s ($21,600/day) and GETs add $1,728/day.',
        'Add them up: <b>$254,592/day</b> for the distributed version — orchestration 85%, functions 6%, object I/O 9%. A pipeline that does 10,000 core-seconds of CPU per second is paying mostly for <b>glue</b>. Related effects: cold starts and concurrency limits at the account level (a burst of functions can throttle), retries that re-bill whole stages, and observability costs scaling with every function’s logs. None of this is a flaw in the services; it’s the price of fine granularity at high event rates.',
      ],
      changes: [{ text: 'PUT + GET per stage: $23,328/day of object I/O', tone: 'bad' }, { text: 'Total $254,592/day; glue is ~90% of it', tone: 'bad' }],
      scene: { nodes: [fn(0, 'stage 1', { tag: pill('PUT output', 'file') }), fn(1, 'stage 2', { tag: pill('GET input, PUT output', 'file') }), fn(2, 'stage 3'), obj({ tag: pill('100,000 requests/s', 'activity', 'warn') })], links: [link('f0', 'obj'), link('f1', 'obj'), link('f2', 'obj')], flows: [flow(['f0', 'obj', 'f1'], { kind: 'write', rate: 2 }), flow(['f1', 'obj', 'f2'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'In-process',
      kind: 'technique',
      title: 'The alternative: stages as function calls in one process',
      body: [
        'If the stages always run together on the same segment, you don’t need a network between them. Put all five in <b>one service</b>: a worker pulls a segment, runs the stages as <b>in-process function calls</b> passing frames in <b>memory</b>, and emits the result. The workflow “orchestration” is a call stack; retries are a loop; scaling is adding instances (autoscaled on queue depth or CPU). The compute is identical — 10,000 segments/s × 5 stages × 0.2 s = <b>10,000 cores</b> busy — at $0.04 per core-hour that is <b>$9,600/day</b>, <b>26.5× cheaper</b> than the distributed version, and it removes the 300 ms of transition latency.',
        'What you give up: <b>independent scaling per stage</b> (the slowest stage’s CPU shape sets the instance shape), <b>fault isolation</b> (a crashing detector takes the whole worker; mitigate with process isolation or supervised subprocesses), <b>language and release independence</b> (one deployable, one release train — see the Modular Monolith lesson), and a <b>capacity plan</b> instead of pay-per-use elasticity (idle cores cost money; scale-to-zero is gone). For work that is steady and high-volume, those costs are usually far below the saved glue; for spiky, low-volume or highly heterogeneous work they may not be.',
      ],
      changes: [{ text: 'Same 10,000 cores of work: $9,600/day vs $254,592', tone: 'good' }, { text: 'Frames stay in memory; no per-event charges, no 300 ms', tone: 'good' }, { text: 'Lose per-stage scaling, isolation and scale-to-zero', tone: 'bad' }],
      scene: { nodes: [src({ tag: pill('10,000 segments/s', 'activity') }), mono({ tag: pill('decode → detect → aggregate (calls)', 'layers', 'good') }), mem({ tag: pill('frames in RAM', 'check', 'good') })], links: [link('src', 'mono'), link('mono', 'mem')], flows: [flow(['src', 'mono', 'mem'], { rate: 2.4 })] },
    },
    {
      short: 'Decide',
      kind: 'tradeoff',
      title: 'A decision rule: work per event vs overhead per event',
      body: [
        'Compare <b>cost of useful work per event</b> with <b>fixed overhead per event</b> (transitions + requests + hand-offs). Serverless orchestration is excellent when events are <b>rare, long-running or bursty</b> — a nightly ETL, human-approval workflows, an order saga lasting hours, a webhook fan-out a few thousand times a day: the overhead is cents against minutes of work, scale-to-zero saves money and the durable state machine is the product. It is poor when events are <b>frequent, tiny and uniform</b> — per-frame, per-message, per-row pipelines at thousands a second — where overhead dominates; there, batch events (process 1,000 items per task), use the engine’s per-duration/express modes, or move the hot path into a long-running service and keep the orchestrator for the control plane.',
        'Process: model the bill from the pricing page at expected <i>and</i> 10× volume before building; measure transition counts in a prototype; watch cost per unit of business output (per stream-hour, per order) as a first-class metric; and revisit architecture when growth changes the ratio — “microservices vs monolith” and “serverless vs servers” are not identities but cost curves that cross at some event rate. Figures here use illustrative prices and 1 GB, 200 ms stages.',
      ],
      changes: [{ text: 'Rare, long, bursty events → orchestrate; frequent, tiny, uniform → keep in-process or batch', tone: 'good' }, { text: 'Model the bill at 1× and 10× before building', tone: 'good' }],
      scene: { nodes: [orch({ tag: pill('control plane: sagas, approvals', 'steps', 'good') }), mono({ tag: pill('hot path in-process', 'cpu', 'good') }), src()], links: [link('src', 'mono'), link('orch', 'mono', { style: 'dashed' })], flows: [flow(['src', 'mono'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Per-event prices turn glue into the largest line item',
      body: [
        'Orchestrators and object stores bill <b>per transition and per request</b>. At 10,000 segments/s through five stages, orchestration cost 15× the compute and the whole pipeline ran <b>26.5× the cost of the same stages as in-process calls</b>, plus 300 ms of transition latency.',
        'Use workflow orchestration for rare, long, bursty work and the control plane; keep high-rate, small-task hot paths in-process or batched — and model the bill before you build.',
      ],
      scene: { nodes: [src(), orch(), fn(0, 'stage'), obj(), mono()], links: [link('src', 'orch'), link('orch', 'f0'), link('f0', 'obj'), link('src', 'mono', { style: 'dashed' })], flows: [flow(['src', 'orch', 'f0', 'obj'], { rate: 2 })] },
    },
  ],
};

export default lesson;
