import type { Lesson, SceneNode, Tone } from '../../types';
import { box, crowd, db, flow, link, pill, you } from '../kit';

const dev = (extra: Partial<SceneNode> = {}) => you('dev', -12, 1, { label: pill('developer', 'user'), ...extra });
const ci = (extra: Partial<SceneNode> = {}) => box('ci', -4, 0, 'CI', 'orange', 'refresh', { size: [1.5, 1.5], height: 40, ...extra });
const prod = (extra: Partial<SceneNode> = {}) => box('prod', 6, 0, 'Production', 'blue', 'server', { size: [1.6, 1.6], height: 44, ...extra });
const users = (extra: Partial<SceneNode> = {}) => crowd('users', 14, 1, 14, 'customers', extra);

// the test pyramid as three stacked slabs
const tier = (id: string, d: number, w: number, name: string, tone: Tone, extra: Partial<SceneNode> = {}) =>
  box(id, -4, d, name, tone, 'check', { size: [w, 1.2], height: 18, ...extra });
const pyramid = (o: Partial<Record<'unit' | 'integ' | 'e2e', Partial<SceneNode>>> = {}) => [
  tier('e2e', -14, 1.4, 'end-to-end', 'purple', o.e2e),
  tier('integ', -8.5, 2.6, 'integration', 'blue', o.integ),
  tier('unit', -3, 3.8, 'unit', 'green', o.unit),
];

const lesson: Lesson = {
  slug: 'testing',
  title: 'Testing at Scale',
  blurb: 'A test strategy that keeps a large system shippable every day: fast feedback, honest integration, and practice at failing.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'escaped', label: 'Bugs escaped / mo', icon: 'alert' },
    { key: 'ci', label: 'CI time', icon: 'timer' },
    { key: 'flaky', label: 'Flaky rate', icon: 'refresh' },
    { key: 'freq', label: 'Releases', icon: 'activity' },
  ],
  goals: [
    { text: 'The test pyramid and why its shape matters', step: 2 },
    { text: 'Contract tests between services', step: 3 },
    { text: 'Taming flaky tests', step: 4 },
    { text: 'Load testing to find the knee', step: 5 },
    { text: 'Testing in production and chaos experiments', step: 7 },
  ],
  legend: ['request', 'response', 'fail', 'heavy'],
  steps: [
    {
      short: 'Manual QA',
      kind: 'problem',
      title: 'A week of manual testing before every release',
      body: [
        'A team ships every two weeks after a QA team clicks through a 400-item checklist. Each release carries hundreds of changes, so when something breaks nobody knows which change did it — and bugs in paths the checklist doesn’t cover reach customers anyway.',
        'The slower and larger the release, the riskier it gets. Fast, automated feedback is what lets you ship small changes often.',
      ],
      changes: [{ text: 'Release every 2 weeks', tone: 'bad' }, { text: '9 escaped bugs / month', tone: 'bad' }],
      scene: {
        nodes: [dev(), box('qa', -4, 0, 'Manual QA', 'grey', 'list', { size: [1.5, 1.5], height: 40, tag: pill('400-step checklist · 5 days', 'clock', 'bad') }), prod(), users()],
        links: [link('dev', 'qa'), link('qa', 'prod'), link('prod', 'users', { arrow: 'both' })],
        flows: [flow(['dev', 'qa'], { rate: 0.4, speed: 0.3 }), flow(['qa', 'prod'], { kind: 'heavy', rate: 0.2, speed: 0.3 }), flow(['users', 'prod'], { kind: 'fail', rate: 0.6 })],
        metrics: { escaped: { v: '9', tone: 'bad' }, ci: '5 days', flaky: '—', freq: { v: 'biweekly', tone: 'bad' } },
      },
    },
    {
      short: 'Pyramid',
      kind: 'technique',
      title: 'The test pyramid',
      body: [
        'Write <b>many unit tests</b> — milliseconds each, exact about failures — for logic. <b>Fewer integration tests</b> that exercise real boundaries: the actual database in a container, real serialization, real queries. And a <b>handful of end-to-end tests</b> for the critical user journeys: sign up, search, check out.',
        'The shape is about cost: higher tests are slower, flakier and vaguer about what broke. Push each check as low as it can go while still catching the bug.',
      ],
      changes: [{ text: '4,000 unit · 300 integration · 25 e2e', tone: 'good' }, { text: 'CI: 11 min', tone: 'good' }],
      concepts: [{ term: 'Test pyramid', def: 'A guideline to have many fast unit tests, fewer integration tests and very few end-to-end tests.' }],
      scene: {
        nodes: [dev(), ...pyramid({ unit: { tag: undefined, label: pill('4,000 · ms each', 'bolt') }, integ: { label: pill('300 · real DB', 'db') }, e2e: { label: pill('25 journeys', 'users') } }), ci({ at: [1, 6] as [number, number], tag: pill('11 min', 'timer', 'good') }), prod(), users()],
        links: [link('dev', 'ci'), link('ci', 'prod'), link('prod', 'users', { arrow: 'both' })],
        flows: [flow(['dev', 'ci', 'prod'], { rate: 1 }), flow(['users', 'prod'], { back: true, rate: 1.5 })],
        metrics: { escaped: '4', ci: { v: '11 min', tone: 'good' }, flaky: '1%', freq: 'daily' },
      },
    },
    {
      short: 'Contracts',
      kind: 'technique',
      title: 'Contract tests between services',
      body: [
        'Orders’ tests mock Payments. The mock says <code>amount</code> is in euros; Payments switched to cents last month. Every test passes; production charges customers 100×. Mocks drift from reality silently.',
        'With <b>consumer-driven contract tests</b>, Orders publishes the requests it makes and the responses it relies on. Payments’ CI verifies every consumer’s contract before it can deploy, so a breaking change fails <i>Payments’</i> build, not production.',
      ],
      changes: [{ text: 'Payments CI checks consumers’ contracts', tone: 'good' }],
      concepts: [{ term: 'Contract testing', def: 'Verifying that a provider service still satisfies the interactions its consumers depend on, without full end-to-end tests.' }],
      scene: {
        nodes: [
          box('orders', -8, -3, 'Orders', 'purple', 'server', { size: [1.3, 1.3], height: 34, tag: pill('expects amount_cents', 'file') }),
          box('broker', 0, -3, 'Contracts', 'yellow', 'sheet', { size: [1.3, 1.3], height: 30 }),
          box('pay', 8, -3, 'Payments', 'teal', 'dollar', { size: [1.3, 1.3], height: 34, tag: pill('CI: verify consumers ✓', 'check', 'good') }),
        ],
        links: [link('orders', 'broker', { label: pill('publish') }), link('broker', 'pay', { label: pill('verify') })],
        flows: [flow(['orders', 'broker', 'pay'], { kind: 'handshake', rate: 0.8 })],
        metrics: { escaped: '2', ci: '13 min', flaky: '1%', freq: 'daily' },
      },
    },
    {
      short: 'Flaky',
      kind: 'problem',
      title: 'The tests that cry wolf',
      body: [
        'Some end-to-end tests fail one run in twenty for no reason anyone can find. People hit “re-run” until green, and soon they re-run real failures too. A suite that can’t be trusted stops protecting anything.',
        'Track flakiness per test, <b>quarantine</b> flaky tests out of the blocking path (with an owner and a deadline), and fix the usual causes: real clocks and sleeps, shared state between tests, ordering assumptions, and unbounded waits on async work.',
      ],
      changes: [{ text: '7% of runs fail spuriously', tone: 'bad' }, { text: 'Quarantine + fix → 0.3%', tone: 'good' }],
      concepts: [{ term: 'Flaky test', def: 'A test that passes and fails intermittently without code changes, eroding trust in the suite.' }],
      scene: {
        nodes: [dev({ tag: pill('re-run… re-run…', 'refresh', 'warn') }), ...pyramid({ e2e: { state: 'hot', tag: pill('5% random failures', 'alert', 'bad') } }), ci({ at: [1, 6] as [number, number] }), prod(), users()],
        links: [link('dev', 'ci'), link('ci', 'prod')],
        flows: [flow(['dev', 'ci'], { rate: 1.5 }), flow(['ci', 'dev'], { kind: 'fail', rate: 0.8 })],
        metrics: { escaped: '2', ci: '13 min ×3', flaky: { v: '7%', tone: 'bad' }, freq: 'daily' },
      },
    },
    {
      short: 'Load test',
      kind: 'technique',
      title: 'Find the knee before your customers do',
      body: [
        'Functional tests say whether it works; <b>load tests</b> say how much it can take. Replay a realistic traffic mix — not one endpoint in a loop — against a production-like environment, ramp it up, and watch p99 latency and errors.',
        'The goal is to find the knee in the latency curve and the first resource to saturate (often a connection pool or a single hot database row) — then decide whether the headroom is enough for the next peak.',
      ],
      changes: [{ text: 'Knee at 4,200 req/s', tone: 'good' }, { text: 'Bottleneck: DB pool (50)', tone: 'bad' }],
      concepts: [{ term: 'Load testing', def: 'Applying realistic, increasing traffic to measure capacity, latency and the first bottleneck.' }],
      scene: {
        nodes: [box('gen', -10, 0, 'Load generator', 'red', 'bolt', { size: [1.4, 1.4], height: 36, tag: pill('ramp 1k → 6k req/s', 'activity') }), box('stage', 0, 0, 'Staging', 'blue', 'server', { size: [1.6, 1.6], height: 44, load: 88 }), db('sdb', 8, 0, 'Staging DB', { load: 95, state: 'hot', tag: pill('pool: 50/50', 'alert', 'warn') })],
        links: [link('gen', 'stage'), link('stage', 'sdb', { arrow: 'both' })],
        flows: [flow(['gen', 'stage', 'sdb'], { back: true, rate: 6, speed: 0.7 })],
        metrics: { escaped: '2', ci: '13 min', flaky: '0.3%', freq: 'daily' },
      },
    },
    {
      short: 'In production',
      kind: 'insight',
      title: 'Production is the only real environment',
      body: [
        'Staging never quite matches production: different data volume, traffic shape, configuration and neighbours. So the last line of testing happens in production, carefully: <b>canary releases</b> and <b>feature flags</b> (next lesson) expose changes to a small slice first, and <b>synthetic monitors</b> run critical journeys every minute from outside.',
        'Pre-production tests reduce risk; production verification catches what they miss — quickly, and to as few users as possible.',
      ],
      concepts: [{ term: 'Synthetic monitoring', def: 'Automated scripts that continuously exercise key user journeys against production to detect breakage.' }],
      scene: {
        nodes: [dev(), ci(), prod({ tag: pill('canary 1%', 'activity', 'warn') }), users(), box('synth', 6, -9, 'Synthetic checks', 'teal', 'heart', { size: [1.2, 1.2], height: 30, tag: pill('checkout every 60 s', 'timer') })],
        links: [link('dev', 'ci'), link('ci', 'prod'), link('prod', 'users', { arrow: 'both' }), link('synth', 'prod', { arrow: 'both', style: 'dashed' })],
        flows: [flow(['dev', 'ci', 'prod'], { rate: 1 }), flow(['users', 'prod'], { back: true, rate: 1.5 }), flow(['synth', 'prod'], { kind: 'handshake', back: true, rate: 0.5 })],
        metrics: { escaped: '1', ci: '13 min', flaky: '0.3%', freq: '10 / day' },
      },
    },
    {
      short: 'Chaos',
      kind: 'technique',
      title: 'Chaos engineering: break it on purpose',
      body: [
        'Timeouts, retries, failover and fallbacks are only real if they’ve been exercised. <b>Chaos experiments</b> inject failures deliberately — kill an instance, add 500 ms of latency to a dependency, drop a zone — with a hypothesis (“checkout stays under 1 s”) and a small, controlled blast radius.',
        'Start in staging, then in production during working hours with an abort button. Each experiment either builds confidence or finds a weakness before a real outage does.',
      ],
      note: { kind: 'tip', text: 'Run game days: scheduled exercises where the team practices a realistic failure end to end — detection, runbooks, communication — not just the technical recovery.' },
      changes: [{ text: 'Killed 1 of 6 instances: SLO held', tone: 'good' }, { text: '+500 ms on Recs: fallback works', tone: 'good' }],
      concepts: [{ term: 'Chaos engineering', def: 'Running controlled experiments that inject failures into a system to verify its resilience.' }],
      scene: {
        nodes: [box('chaos', -6, -6, 'Chaos tool', 'red', 'alert', { size: [1.3, 1.3], height: 32, tag: pill('hypothesis: p99 < 1 s', 'activity') }), ...[0, 1, 2].map((i) => box(`i${i}`, 2 + i * 1.5, -6 + i * 5, `App ${i + 1}`, 'blue', 'server', { size: [1.2, 1.2], height: 30, state: i === 1 ? 'down' : 'ok', load: i === 1 ? undefined : 62 })), users({ tag: pill('p99 640 ms ✓', 'check', 'good') })],
        links: [link('chaos', 'i1', { style: 'dashed', label: pill('terminate') }), link('users', 'i0', { arrow: 'both' }), link('users', 'i2', { arrow: 'both' })],
        flows: [flow(['chaos', 'i1'], { kind: 'fail', rate: 0.6 }), flow(['users', 'i0'], { back: true, rate: 1.4 }), flow(['users', 'i2'], { back: true, rate: 1.4 })],
        metrics: { escaped: '1', ci: '13 min', flaky: '0.3%', freq: '10 / day' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Confidence to ship small and often',
      body: [
        'Shape tests as a <b>pyramid</b>: many fast unit tests, honest integration tests against real dependencies, few end-to-end journeys. Use <b>contract tests</b> instead of trusting mocks across services, and treat <b>flaky tests</b> as bugs.',
        '<b>Load test</b> to know your limits, verify in production with canaries and synthetic checks, and run <b>chaos experiments</b> so resilience features are proven rather than assumed.',
      ],
      scene: {
        nodes: [dev(), ...pyramid(), ci({ at: [1, 6] as [number, number], tag: pill('12 min, trusted', 'check', 'good') }), prod(), users()],
        links: [link('dev', 'ci'), link('ci', 'prod'), link('prod', 'users', { arrow: 'both' })],
        flows: [flow(['dev', 'ci', 'prod'], { rate: 1.5 }), flow(['users', 'prod'], { back: true, rate: 1.5 })],
        metrics: { escaped: { v: '1', tone: 'good' }, ci: { v: '12 min', tone: 'good' }, flaky: { v: '0.3%', tone: 'good' }, freq: { v: '10 / day', tone: 'good' } },
      },
    },
  ],
};

export default lesson;
