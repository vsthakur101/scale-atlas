import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => box('users', -15, 0, 'Users', 'green', 'users', { size: [1.3, 1.3], height: 24, ...extra });
const lb = (extra: Partial<SceneNode> = {}) => box('lb', -8, 0, 'Load balancer', 'orange', 'route', { size: [1.3, 1.3], height: 26, ...extra });
const zone = (i: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`z${i}`, 1, -6 + i * 6, name, 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });
const chaos = (extra: Partial<SceneNode> = {}) => box('chaos', 11, 0, 'Chaos experiment', 'red', 'bolt', { size: [1.4, 1.4], height: 28, ...extra });

const lesson: Lesson = {
  slug: 'academy-how-netflix-uses-chaos-engineering-to-create-resilience-systems',
  title: 'Chaos Engineering: Proving Resilience by Breaking Things',
  blurb: 'Hypothesis, steady state, controlled failure injection and blast-radius limits — plus the capacity arithmetic that decides whether losing instances or a zone is survivable.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'after', label: 'Utilisation after the instance kills', icon: 'gauge' },
    { key: 'retry', label: 'With retry amplification', icon: 'refresh' },
    { key: 'zone', label: 'Utilisation if one zone is lost', icon: 'globe' },
    { key: 'safe', label: 'Highest safe normal utilisation (zone loss)', icon: 'shield' },
  ],
  goals: [
    { text: 'The scientific loop: steady state, hypothesis, experiment', step: 2 },
    { text: 'What to inject: instances, latency, dependencies, regions', step: 3 },
    { text: 'Capacity arithmetic: N+1, zones and headroom', step: 4 },
    { text: 'Retry amplification and metastable failures', step: 5 },
    { text: 'Blast radius, abort conditions and game days', step: 6 },
  ],
  legend: ['request', 'response', 'fail', 'write'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Instances in the service', min: 3, max: 300, step: 1, default: 30, unit: '', description: 'Total instances spread evenly over zones.' },
      { key: 'util', label: 'Normal utilisation', min: 10, max: 95, step: 1, default: 55, unit: '%', description: 'Average load as a share of capacity.' },
      { key: 'kill', label: 'Instances terminated', min: 1, max: 100, step: 1, default: 3, unit: '', description: 'Instances the experiment kills at once.' },
      { key: 'zones', label: 'Availability zones', min: 2, max: 6, step: 1, default: 3, unit: '', description: 'Failure domains the instances are spread over.' },
      { key: 'err', label: 'Clients’ error rate during the failure', min: 0, max: 50, step: 1, default: 10, unit: '%', description: 'Share of requests failing while capacity recovers.' },
      { key: 'retries', label: 'Retries per failed request', min: 0, max: 5, step: 1, default: 2, unit: '', description: 'How many times clients retry a failure.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(2, Math.round(input.n ?? 30));
      const u = Math.min(0.99, Math.max(0.05, (input.util ?? 55) / 100));
      const k = Math.min(n - 1, Math.max(1, Math.round(input.kill ?? 3)));
      const z = Math.max(2, Math.round(input.zones ?? 3));
      const err = Math.min(1, Math.max(0, (input.err ?? 10) / 100));
      const retries = Math.max(0, input.retries ?? 2);
      const after = (u * n) / (n - k);
      // Retried failures add load: offered load grows by err × retries.
      const retry = after * (1 + err * retries);
      const zoneUtil = (u * z) / (z - 1);
      const safe = ((z - 1) / z) * 100;
      return {
        after: step < 3 ? { v: '—' } : { v: `${(after * 100).toFixed(0)}%`, tone: after < 0.7 ? 'good' : after < 0.9 ? 'warn' : 'bad' },
        retry: step < 4 ? { v: '—' } : { v: `${(retry * 100).toFixed(0)}%`, tone: retry < 0.85 ? 'good' : retry < 1 ? 'warn' : 'bad' },
        zone: step < 3 ? { v: '—' } : { v: `${(zoneUtil * 100).toFixed(0)}%`, tone: zoneUtil < 0.8 ? 'good' : zoneUtil < 1 ? 'warn' : 'bad' },
        safe: step < 3 ? { v: '—' } : { v: `${safe.toFixed(0)}% (keep well below)`, tone: u * 100 <= safe * 0.8 ? 'good' : u * 100 <= safe ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'Failure is normal; untested recovery is a hope',
      body: [
        'In a large distributed system something is always failing — an instance, a disk, a dependency, a network path. Resilience features (retries, timeouts, fallbacks, failover, circuit breakers) exist to cope, but each is code and configuration that <b>only runs when things go wrong</b>, so it is rarely exercised and often broken: a fallback that errors, a timeout longer than the caller’s, a failover that needs a human.',
        '<b>Chaos engineering</b> tests resilience <i>in the real system</i> by deliberately injecting failure under controlled conditions, so weaknesses are found on your schedule instead of at 3 a.m. during an outage. It is not random destruction; it is experimentation with a hypothesis and a safety net.',
      ],
      scene: { nodes: [users(), lb(), zone(0, 'Zone A'), zone(1, 'Zone B'), zone(2, 'Zone C'), chaos({ tag: pill('inject failure', 'alert', 'warn') })], links: [link('users', 'lb'), link('lb', 'z0'), link('lb', 'z1'), link('lb', 'z2'), link('chaos', 'z1', { style: 'dashed' })], flows: [flow(['users', 'lb', 'z0'], { rate: 1.5 }), flow(['chaos', 'z1'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Loop',
      kind: 'technique',
      title: 'Steady state, hypothesis, experiment, learn',
      body: [
        '1. Define <b>steady state</b> by a business-level metric — stream starts per second, orders per minute, p99 latency — not CPU. 2. State a <b>hypothesis</b>: “if we terminate 10% of instances, steady state holds.” 3. <b>Inject</b> the failure in production (or a faithful staging) with a small, measured scope. 4. <b>Compare</b> against a control group. 5. If steady state breaks, <b>abort</b>, fix the weakness, and re-run; if it holds, widen the scope next time.',
        'The discipline is the point: a clear hypothesis, a bounded blast radius, an abort button and a record of what was learned. Experiments are automated and repeated so regressions are caught as the system changes.',
      ],
      changes: [{ text: 'Steady state = a business metric', tone: 'good' }, { text: 'Hypothesis → small blast radius → compare to control → abort or widen', tone: 'info' }],
      scene: { nodes: [box('ss', -10, 0, 'Steady-state metric', 'green', 'gauge', { size: [1.3, 1.3], height: 24 }), box('hy', 0, 0, 'Hypothesis + experiment', 'orange', 'bolt', { size: [1.4, 1.4], height: 26 }), box('ob', 10, 0, 'Observe vs control', 'blue', 'search', { size: [1.3, 1.3], height: 24 })], links: [link('ss', 'hy', { arrow: 'end' }), link('hy', 'ob', { arrow: 'end' })], flows: [flow(['ss', 'hy', 'ob'], { rate: 1.2 })] },
    },
    {
      short: 'Faults',
      kind: 'technique',
      title: 'What to inject',
      body: [
        '<b>Instance termination</b> (the original “Chaos Monkey”): kill random instances to prove the service survives losing them. <b>Latency and error injection</b> on dependencies: slow responses are harder on systems than dead ones, because they tie up threads and trigger retry storms. <b>Dependency failure</b>: cut a downstream service and check the fallback. <b>Resource exhaustion</b> (CPU, memory, disk, connections), <b>clock skew</b>, <b>packet loss</b>, <b>expired certificates</b>, and whole <b>availability zone</b> or <b>region evacuation</b> drills.',
        'Start where the likely failures are, with the smallest meaningful fault, and move to correlated and larger ones: Chaos Kong-style region failovers prove that the entire traffic-shifting machinery works end to end, which no unit test can.',
      ],
      changes: [{ text: 'Terminate · slow · error · exhaust · skew · evacuate a zone/region', tone: 'info' }, { text: 'Latency is usually worse than outright failure', tone: 'bad' }],
      scene: { nodes: [chaos({ name: 'Fault injector' }), box('a', -4, -6, 'Kill instances', 'red', 'alert', { size: [1.2, 1.2], height: 18 }), box('b', 4, -6, 'Add latency', 'orange', 'clock', { size: [1.2, 1.2], height: 18 }), box('c', -4, 6, 'Cut a dependency', 'purple', 'lock', { size: [1.2, 1.2], height: 18 }), box('d', 4, 6, 'Evacuate a zone', 'blue', 'globe', { size: [1.2, 1.2], height: 18 })], links: [link('chaos', 'a', { style: 'dashed' }), link('chaos', 'b', { style: 'dashed' }), link('chaos', 'c', { style: 'dashed' }), link('chaos', 'd', { style: 'dashed' })], flows: [] },
    },
    {
      short: 'Capacity',
      kind: 'insight',
      title: 'The arithmetic: can the survivors carry the load?',
      body: [
        'When instances disappear the same load lands on fewer machines: utilisation becomes <code>u × n ÷ (n − k)</code>. Thirty instances at 55%, three killed: 55 × 30 ÷ 27 = <b>61%</b> — comfortable. Lose a whole zone of three: <code>u × z ÷ (z − 1)</code> = 55 × 3 ÷ 2 = <b>~83%</b> — survivable but tight, and above ~90% latency climbs steeply (queueing, see the Rate Limiting and Concurrency lessons).',
        'The design rule: size so that after the <b>largest failure you intend to survive</b> the rest runs at ≤ ~70–80%. For zone loss across z zones the normal ceiling is <code>(z − 1) ÷ z</code> × target — 67% × 0.8 ≈ 53% for three zones. That is why “N+1” is a minimum, and why autoscaling that reacts in minutes can’t be the only defence: the spike arrives instantly.',
      ],
      changes: [{ text: '30 inst @ 55%, kill 3 → 61%', tone: 'info' }, { text: 'Lose 1 of 3 zones → 83%', tone: 'info' }, { text: 'Zone-loss ceiling = (z−1)/z × target', tone: 'info' }],
      scene: { nodes: [users(), lb(), zone(0, 'Zone A', { load: 83 }), zone(1, 'Zone B', { load: 83 }), zone(2, 'Zone C', { state: 'down', tone: 'red', tag: pill('lost', 'alert', 'bad') })], links: [link('users', 'lb'), link('lb', 'z0'), link('lb', 'z1'), link('lb', 'z2', { style: 'broken' })], flows: [flow(['users', 'lb', 'z0'], { rate: 2 }), flow(['users', 'lb', 'z1'], { rate: 2 })] },
    },
    {
      short: 'Retries',
      kind: 'problem',
      title: 'Retry amplification and metastable failures',
      body: [
        'Capacity loss causes errors; clients retry; retries add load exactly when capacity is short. If 10% of requests fail and each is retried twice, offered load rises by <code>1 + 0.10 × 2</code> = 20%: the 61% post-kill utilisation becomes <b>73%</b>; at 85% it tips over 100%. Once saturated, <i>more</i> requests fail, <i>more</i> retries arrive, and the system can stay overloaded even after the original fault is gone — a <b>metastable failure</b>.',
        'Chaos experiments with latency and partial failure are the way to find these loops. Mitigations: <b>retry budgets</b> (at most ~10% extra load), exponential backoff with jitter, <b>circuit breakers</b>, load shedding and <b>adaptive concurrency limits</b> so a server rejects early rather than queues, and timeouts that shrink down the call chain (see the Timeouts, Retries & Breakers lesson).',
      ],
      changes: [{ text: 'Offered load × (1 + error rate × retries)', tone: 'bad' }, { text: 'Retry budget · jitter · breakers · shedding', tone: 'good' }],
      scene: { nodes: [users({ tag: pill('retry, retry', 'refresh', 'warn') }), lb(), zone(0, 'Survivors', { state: 'hot', load: 100, tag: pill('overload + retries', 'alert', 'bad') })], links: [link('users', 'lb'), link('lb', 'z0')], flows: [flow(['users', 'lb', 'z0'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Safety',
      kind: 'technique',
      title: 'Blast radius, abort conditions and game days',
      body: [
        'Run experiments with guardrails: a small <b>blast radius</b> (a fraction of traffic, one cell or cohort), automatic <b>abort conditions</b> tied to the steady-state metric, business-hours timing with engineers watching, notification to affected teams, and a <b>kill switch</b>. Prefer experiments that fail <i>safe</i> (kill instances behind a load balancer) before ones that can lose data.',
        'Scale up deliberately: staging first, then a canary slice in production, then larger faults. Hold <b>game days</b> — scheduled exercises where a team walks through a scenario with the runbooks and dashboards — to test people and process as well as software. Figures here are model arithmetic for illustration.',
      ],
      changes: [{ text: 'Small scope · auto-abort · kill switch · business hours', tone: 'good' }, { text: 'Game days test runbooks and people', tone: 'good' }],
      scene: { nodes: [chaos({ tag: pill('1% of traffic', 'gauge', 'good') }), box('abort', -8, 0, 'Abort if steady state drops', 'red', 'shield', { size: [1.3, 1.3], height: 24 }), zone(0, 'Cell 1')], links: [link('chaos', 'z0', { style: 'dashed' }), link('abort', 'z0')], flows: [flow(['chaos', 'z0'], { kind: 'fail', rate: 0.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Test recovery before you need it',
      body: [
        'Chaos engineering = <b>steady state → hypothesis → bounded fault → compare → learn</b>. Survivability is arithmetic: utilisation after losing k of n is <code>u·n ÷ (n − k)</code>, after losing a zone <code>u·z ÷ (z − 1)</code>; retries multiply offered load and can make overload self-sustaining.',
        'Size for the failure you intend to survive, budget retries, shed load, and rehearse with limited blast radius, abort conditions and game days.',
      ],
      scene: { nodes: [users(), lb(), zone(0, 'Zone A'), zone(1, 'Zone B'), zone(2, 'Zone C'), chaos()], links: [link('users', 'lb'), link('lb', 'z0'), link('lb', 'z1'), link('lb', 'z2'), link('chaos', 'z1', { style: 'dashed' })], flows: [flow(['users', 'lb', 'z0'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
