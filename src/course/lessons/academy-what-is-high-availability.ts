import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => box('users', -15, 0, 'Users', 'green', 'users', { size: [1.3, 1.3], height: 24, ...extra });
const lb = (extra: Partial<SceneNode> = {}) => box('lb', -8, 0, 'Load balancer', 'orange', 'route', { size: [1.2, 1.2], height: 26, ...extra });
const app = (i: number, n: number, extra: Partial<SceneNode> = {}) => box(`app${i}`, 0, (i - (n - 1) / 2) * 5, `App ${i + 1}`, 'blue', 'server', { size: [1.2, 1.2], height: 28, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('db', 10, 0, 'Database', { size: [1.4, 1.4], ...extra });

const fmtDown = (frac: number): string => {
  const min = frac * 525960; // minutes per year
  if (min < 1) return `${(min * 60).toFixed(0)} seconds / year`;
  if (min < 120) return `${min.toFixed(min < 10 ? 1 : 0)} minutes / year`;
  if (min < 60 * 48) return `${(min / 60).toFixed(1)} hours / year`;
  return `${(min / 1440).toFixed(1)} days / year`;
};
const fmtA = (a: number): string => `${(a * 100).toFixed(a > 0.9999 ? 4 : a > 0.999 ? 3 : 2)}%`;
const nines = (a: number): string => (a >= 1 ? '∞ nines' : `${Math.max(0, -Math.log10(1 - a)).toFixed(1)} nines`);

const lesson: Lesson = {
  slug: 'academy-what-is-high-availability',
  title: 'High Availability: The Arithmetic of Nines',
  blurb: 'Availability as a number you can calculate: how redundancy multiplies it, how serial dependencies and shared fate cap it, and where the extra nines run out.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'tier', label: 'Redundant tier (parallel)', icon: 'layers' },
    { key: 'chain', label: 'Whole request path', icon: 'gauge' },
    { key: 'down', label: 'Expected downtime', icon: 'clock' },
    { key: 'nines', label: 'Nines', icon: 'shield' },
  ],
  goals: [
    { text: 'What “nines” mean in minutes of downtime', step: 1 },
    { text: 'How redundant replicas multiply availability', step: 2 },
    { text: 'Why serial dependencies pull it back down', step: 3 },
    { text: 'Shared fate: where independence breaks', step: 4 },
    { text: 'The cost of the next nine', step: 7 },
  ],
  legend: ['request', 'response', 'fail', 'write'],
  dynamic: {
    parameters: [
      { key: 'a', label: 'Single-node availability', min: 90, max: 99.99, step: 0.01, default: 99.5, unit: '%', description: 'Fraction of time one instance is serving correctly.' },
      { key: 'n', label: 'Replicas in the tier', min: 1, max: 6, step: 1, default: 2, unit: '', description: 'Independent instances behind the load balancer; any one can serve.' },
      { key: 'k', label: 'Serial dependencies on the path', min: 0, max: 12, step: 1, default: 4, unit: '', description: 'Other components every request needs (DNS, LB, database, auth, payment API…).' },
      { key: 'd', label: 'Availability of each dependency', min: 99, max: 99.999, step: 0.001, default: 99.9, unit: '%', description: 'Availability of each serial dependency.' },
      { key: 'cc', label: 'Common-cause outage time', min: 0, max: 1, step: 0.001, default: 0.02, unit: '%', description: 'Fraction of time something outside redundancy takes everything down (bad deploy, shared region, expired certificate).' },
    ],
    calculate: (input, step) => {
      const a = Math.min(0.99999, Math.max(0.5, (input.a ?? 99.5) / 100));
      const n = Math.max(1, Math.round(input.n ?? 2));
      const k = Math.max(0, Math.round(input.k ?? 4));
      const d = Math.min(0.999999, Math.max(0.9, (input.d ?? 99.9) / 100));
      const cc = Math.min(1, Math.max(0, (input.cc ?? 0.02) / 100));
      // Parallel: the tier is down only if every replica is down at once.
      const tier = 1 - Math.pow(1 - a, n);
      // Series: every dependency must be up.
      const chain = tier * Math.pow(d, k);
      const total = chain * (1 - cc);
      return {
        tier: step < 1 ? { v: '—' } : { v: fmtA(tier), tone: tier > 0.9999 ? 'good' : tier > 0.999 ? 'warn' : 'bad' },
        chain: step < 2 ? { v: '—' } : { v: fmtA(chain), tone: chain > 0.9995 ? 'good' : chain > 0.995 ? 'warn' : 'bad' },
        down: step < 2 ? { v: '—' } : { v: fmtDown(1 - (step < 3 ? chain : total)), tone: (step < 3 ? chain : total) > 0.9995 ? 'good' : (step < 3 ? chain : total) > 0.995 ? 'warn' : 'bad' },
        nines: step < 2 ? { v: '—' } : { v: nines(step < 3 ? chain : total) },
      };
    },
  },
  steps: [
    {
      short: 'Nines',
      kind: 'insight',
      title: 'Availability is a fraction of time',
      body: [
        '<b>Availability</b> = time the service works ÷ total time. “Two nines” (99%) allows 3.65 days of downtime a year; <b>three nines</b> (99.9%) 8.8 hours; <b>four nines</b> 52.6 minutes; <b>five nines</b> 5.3 minutes; six nines about 32 seconds. Each extra nine cuts allowed downtime tenfold — and costs far more than the last one.',
        'To design for a target, compute rather than hope. Availability of a system follows from its components’ availabilities and how they are connected: in <b>parallel</b> (redundant, any one suffices) or in <b>series</b> (all required). The sliders implement exactly that.',
      ],
      scene: { nodes: [users(), box('svc', 2, 0, 'Your service', 'blue', 'server', { size: [1.5, 1.5], height: 32, tag: pill('99.9% = 8.8 h / year', 'clock') })], links: [link('users', 'svc', { arrow: 'both' })], flows: [flow(['users', 'svc'], { rate: 1.5 })] },
    },
    {
      short: 'Parallel',
      kind: 'technique',
      title: 'Redundancy multiplies availability',
      body: [
        'If any one of <code>n</code> independent replicas can serve a request, the tier is down only when <b>all</b> are down at once: <code>A = 1 − (1 − a)ⁿ</code>. One node at 99.5% has 43.8 hours of downtime a year; two give <code>1 − 0.005² = 99.9975%</code> (13 minutes); three give 99.99999% (about 4 seconds). Each replica multiplies the unavailability by another (1 − a).',
        'This requires <b>failover to actually work</b>: a load balancer that notices a dead replica quickly (see failure-detection lessons), enough spare capacity to absorb the survivors’ load (N+1 means each must handle ¹⁄ₙ₋₁ more), and state that can be reached from any replica.',
      ],
      changes: [{ text: '1 node @ 99.5% → 43.8 h/yr', tone: 'bad' }, { text: '2 nodes → 99.9975% (13 min/yr)', tone: 'good' }],
      scene: { nodes: [users(), lb(), app(0, 2), app(1, 2), store()], links: [link('users', 'lb'), link('lb', 'app0'), link('lb', 'app1'), link('app0', 'db'), link('app1', 'db')], flows: [flow(['users', 'lb', 'app0', 'db'], { rate: 1.5 }), flow(['users', 'lb', 'app1', 'db'], { rate: 1.5 })] },
    },
    {
      short: 'Series',
      kind: 'problem',
      title: 'Every serial dependency multiplies in a loss',
      body: [
        'A request that needs DNS <i>and</i> the load balancer <i>and</i> auth <i>and</i> the database <i>and</i> a payment API is up only when <b>all</b> are: <code>A = a₁ × a₂ × … × aₖ</code>. Four dependencies at 99.9% give 0.999⁴ = 99.6% — 35 hours a year — <b>worse than any of them alone</b>, no matter how redundant your app tier is.',
        'This is why the most available designs minimise the <b>critical path</b>: cache so reads survive a dependency outage, make non-essential calls optional (degrade gracefully when recommendations are down), decouple with queues so downstream failure doesn’t fail the request, and count every hard dependency honestly.',
      ],
      changes: [{ text: '0.999 × 0.999 × 0.999 × 0.999 = 99.6%', tone: 'bad' }, { text: 'Cut the critical path; degrade gracefully', tone: 'good' }],
      scene: { nodes: [users(), box('d1', -6, 0, 'DNS', 'teal', 'globe', { size: [1, 1], height: 18 }), box('d2', -1, 0, 'Auth', 'purple', 'lock', { size: [1, 1], height: 18 }), box('d3', 4, 0, 'App', 'blue', 'server', { size: [1, 1], height: 22 }), box('d4', 9, 0, 'DB', 'orange', 'db', { size: [1, 1], height: 18 }), box('d5', 14, 0, 'Payments', 'red', 'globe', { size: [1, 1], height: 18 })], links: [link('users', 'd1'), link('d1', 'd2'), link('d2', 'd3'), link('d3', 'd4'), link('d4', 'd5')], flows: [flow(['users', 'd1', 'd2', 'd3', 'd4', 'd5'], { rate: 1.5 })] },
    },
    {
      short: 'Shared fate',
      kind: 'problem',
      title: 'Independence is the assumption that breaks',
      body: [
        'The parallel formula assumes replicas fail <b>independently</b>. In reality they share things: the same bug in the same release, the same configuration push, the same availability zone, power, network or cloud region, the same expiring certificate, the same human mistake. One such event takes down every replica together, and no n helps.',
        'Model it as a floor: a <b>common-cause outage</b> of just 0.02% (about 1.75 hours a year) multiplies on top. Real incident histories are dominated by exactly these events — bad deploys and config changes — not by hardware failures. Defences: <b>diversity</b> (zones, regions, versions, even vendors), <b>staged rollouts</b>, bulkheads and cells (see the Cell-Based Architecture lesson) that limit blast radius.',
      ],
      changes: [{ text: '0.02% common-cause ≈ 1.75 h/yr that no replica count fixes', tone: 'bad' }, { text: 'Spread across zones; roll out in stages', tone: 'good' }],
      scene: { nodes: [users(), lb(), app(0, 2, { state: 'down', tone: 'red', tag: pill('same bad release', 'alert', 'bad') }), app(1, 2, { state: 'down', tone: 'red', tag: pill('same bad release', 'alert', 'bad') }), store()], links: [link('users', 'lb'), link('lb', 'app0', { style: 'broken' }), link('lb', 'app1', { style: 'broken' })], flows: [flow(['users', 'lb'], { kind: 'fail', rate: 1.2 })] },
    },
    {
      short: 'Failover',
      kind: 'technique',
      title: 'Failing over costs time, and time is availability',
      body: [
        'Active–active replicas share load and a failure just removes one. <b>Active–passive</b> keeps a standby that must be promoted: detection (seconds), promotion, DNS or IP movement, cache warming — a failover taking 60 s is a minute of downtime every time it happens; ten events a year is ten minutes. Faster detection, pre-warmed standbys and idempotent clients retrying shrink it.',
        'State is the hard part: a stateless tier fails over instantly; a database promoted from an asynchronous replica may lose the last writes (an <b>RPO</b> problem) and needs fencing to prevent two primaries. Include failover time and frequency when you compute downtime budgets.',
      ],
      scene: { nodes: [box('p', -4, -4, 'Primary', 'red', 'db', { size: [1.3, 1.3], height: 24, state: 'down', tag: pill('failed', 'alert', 'bad') }), box('s', -4, 5, 'Standby', 'blue', 'db', { size: [1.3, 1.3], height: 24, tag: pill('promoted in ~60 s', 'clock', 'warn') }), users()], links: [link('users', 's')], flows: [flow(['users', 's'], { rate: 1.2 })] },
    },
    {
      short: 'Maintenance',
      kind: 'insight',
      title: 'Planned downtime counts too',
      body: [
        'Deploys, schema migrations and patching are <b>planned</b> unavailability — and if your SLA says “99.9%” it usually includes them. Rolling and blue/green deploys, backward-compatible migrations (expand → migrate → contract), connection draining and feature flags turn maintenance into a non-event.',
        'Also decide what <i>counts</i> as up: errors, timeouts above a latency threshold, a degraded mode, one region failing? Define availability by <b>successful requests ÷ total requests</b> from the user’s viewpoint, with an explicit SLO and an error budget that governs how fast you may change things.',
      ],
      changes: [{ text: 'SLO as successful requests ÷ total', tone: 'info' }, { text: 'Zero-downtime deploys and migrations', tone: 'good' }],
      scene: { nodes: [users(), lb({ tag: pill('drains old, shifts to new', 'refresh') }), app(0, 2, { tag: pill('v1 draining', 'pause') }), app(1, 2, { tag: pill('v2 live', 'check', 'good') })], links: [link('users', 'lb'), link('lb', 'app0', { style: 'dashed' }), link('lb', 'app1')], flows: [flow(['users', 'lb', 'app1'], { rate: 2 })] },
    },
    {
      short: 'Cost',
      kind: 'tradeoff',
      title: 'Each nine costs more than the last',
      body: [
        'Going from 99% to 99.9% typically means redundancy and automated failover. 99.9% to 99.99% means multiple zones, tested failover, careful deploys and on-call. 99.99% to 99.999% means multiple regions, no single shared dependency, and an organisation that practises failure — roughly an order of magnitude more cost and complexity per nine, with falling returns as outside factors (your users’ networks, DNS, the cloud provider) dominate.',
        'Choose the target from the <b>cost of downtime</b>: if an hour costs $10,000 then four nines (52 minutes a year) costs about $8,700 a year in downtime versus about $88,000 at three nines (8.8 hours) — an $80,000 yearly saving to compare against what the extra nine costs to build and run. Figures here are model outputs; real availability comes from measuring.',
      ],
      scene: { nodes: [box('n3', -10, 0, '99.9%', 'orange', 'gauge', { size: [1.2, 1.2], height: 18, tag: pill('redundancy + failover', 'layers') }), box('n4', 0, 0, '99.99%', 'blue', 'gauge', { size: [1.2, 1.2], height: 26, tag: pill('multi-zone, practised', 'layers') }), box('n5', 10, 0, '99.999%', 'green', 'gauge', { size: [1.2, 1.2], height: 34, tag: pill('multi-region, no shared fate', 'globe') })], links: [link('n3', 'n4', { arrow: 'end' }), link('n4', 'n5', { arrow: 'end' })], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Parallel adds nines, series and shared fate take them away',
      body: [
        'Redundancy gives <code>1 − (1 − a)ⁿ</code>; every hard dependency multiplies in <code>a</code>; common-cause failures set a floor no replica count lifts; failover time and planned maintenance count as downtime. Compute the path, then attack the weakest term.',
        'Minimise the critical path, diversify failure domains, roll out in stages, measure availability from the user’s view and buy each extra nine only when the avoided downtime justifies it.',
      ],
      scene: { nodes: [users(), lb(), app(0, 2), app(1, 2), store()], links: [link('users', 'lb'), link('lb', 'app0'), link('lb', 'app1'), link('app0', 'db'), link('app1', 'db')], flows: [flow(['users', 'lb', 'app0', 'db'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
