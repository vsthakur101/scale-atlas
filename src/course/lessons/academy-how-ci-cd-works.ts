import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const dev = (extra: Partial<SceneNode> = {}) => box('dev', -16, 0, 'Developer', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const repo = (extra: Partial<SceneNode> = {}) => db('repo', -9, 0, 'Git repository', { size: [1.3, 1.3], ...extra });
const ci = (extra: Partial<SceneNode> = {}) => box('ci', -2, 0, 'CI pipeline', 'orange', 'refresh', { size: [1.4, 1.4], height: 30, ...extra });
const art = (extra: Partial<SceneNode> = {}) => db('art', 5, -5, 'Artifact registry', { size: [1.2, 1.2], ...extra });
const stage = (extra: Partial<SceneNode> = {}) => box('stage', 11, 0, 'Staging', 'blue', 'server', { size: [1.3, 1.3], height: 26, ...extra });
const prod = (extra: Partial<SceneNode> = {}) => box('prod', 18, 0, 'Production', 'purple', 'globe', { size: [1.3, 1.3], height: 28, ...extra });

const fmtMin = (m: number): string => (m >= 60 ? `${(m / 60).toFixed(1)} h` : m >= 1 ? `${m.toFixed(m < 10 ? 1 : 0)} min` : `${Math.round(m * 60)} s`);

const lesson: Lesson = {
  slug: 'academy-how-ci-cd-works',
  title: 'How CI/CD Works',
  blurb: 'Build, test, package, deploy on every change — and the queueing and flakiness arithmetic that decides whether the pipeline helps or becomes the bottleneck.',
  minutes: 12,
  level: 'Beginner',
  metrics: [
    { key: 'flake', label: 'Chance a run fails spuriously', icon: 'alert' },
    { key: 'util', label: 'Runner utilisation', icon: 'cpu' },
    { key: 'wait', label: 'Average wait for a runner', icon: 'clock' },
    { key: 'waste', label: 'CI time wasted on flaky reruns / day', icon: 'refresh' },
  ],
  goals: [
    { text: 'Continuous integration vs delivery vs deployment', step: 1 },
    { text: 'Pipeline stages and what each protects', step: 2 },
    { text: 'Artifacts: build once, promote everywhere', step: 3 },
    { text: 'Pipeline speed, queueing and runner capacity', step: 4 },
    { text: 'Flaky tests: the hidden tax', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'runs', label: 'Pipeline runs per working day', min: 10, max: 5000, step: 10, default: 200, unit: '', description: 'Commits and pull-request pushes triggering a run.' },
      { key: 'dur', label: 'Run duration', min: 1, max: 90, step: 1, default: 15, unit: ' min', description: 'Time one run occupies a runner.' },
      { key: 'runners', label: 'Parallel runners', min: 1, max: 200, step: 1, default: 10, unit: '', description: 'Runs that can execute at the same time.' },
      { key: 'tests', label: 'Tests per run', min: 10, max: 50000, step: 10, default: 2000, unit: '', description: 'Independent tests whose failure fails the run.' },
      { key: 'flake', label: 'Flake rate per test', min: 0, max: 1, step: 0.001, default: 0.01, unit: '%', description: 'Chance a single healthy test fails spuriously.' },
    ],
    calculate: (input, step) => {
      const runs = Math.max(1, input.runs ?? 200);
      const dur = Math.max(0.1, input.dur ?? 15);
      const c = Math.max(1, Math.round(input.runners ?? 10));
      const tests = Math.max(1, input.tests ?? 2000);
      const f = Math.min(1, Math.max(0, (input.flake ?? 0.01) / 100));
      // Runs arrive over a ~10-hour working day.
      const rho = (runs * dur) / (c * 600);
      const spurious = 1 - Math.pow(1 - f, tests);
      // Sakasegawa approximation of the mean wait in an M/M/c queue.
      const wait = rho >= 1 ? Infinity : (Math.pow(rho, Math.sqrt(2 * (c + 1)) - 1) / (c * (1 - rho))) * dur;
      const waste = runs * spurious * dur;
      return {
        flake: step < 4 ? { v: '—' } : { v: `${(spurious * 100).toFixed(spurious < 0.1 ? 1 : 0)}%`, tone: spurious < 0.05 ? 'good' : spurious < 0.2 ? 'warn' : 'bad' },
        util: step < 3 ? { v: '—' } : { v: `${Math.min(rho * 100, 999).toFixed(0)}%`, tone: rho < 0.6 ? 'good' : rho < 0.85 ? 'warn' : 'bad' },
        wait: step < 3 ? { v: '—' } : Number.isFinite(wait) ? { v: fmtMin(wait), tone: wait < dur * 0.2 ? 'good' : wait < dur ? 'warn' : 'bad' } : { v: 'queue grows all day', tone: 'bad' },
        waste: step < 4 ? { v: '—' } : { v: fmtMin(waste), tone: waste < 60 ? 'good' : waste < 300 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Idea',
      kind: 'insight',
      title: 'Integrate often, release safely',
      body: [
        '<b>Continuous integration (CI)</b>: every change is merged into a shared branch frequently and automatically built and tested, so integration problems show up in minutes rather than at the end of a release. <b>Continuous delivery</b>: every passing change produces a release-ready artifact that <i>could</i> be deployed with one click. <b>Continuous deployment</b>: it <i>is</i> deployed automatically if it passes.',
        'The goal is small, frequent, low-risk changes: a bad change is found within minutes of being made, the diff to inspect is small, and rollback is routine. The pipeline is the machine that makes that safe.',
      ],
      scene: { nodes: [dev({ tag: pill('git push', 'bolt') }), repo(), ci({ tag: pill('build · test · package', 'check') }), stage(), prod()], links: [link('dev', 'repo'), link('repo', 'ci'), link('ci', 'stage'), link('stage', 'prod')], flows: [flow(['dev', 'repo', 'ci', 'stage', 'prod'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Stages',
      kind: 'technique',
      title: 'Stages ordered by cost and confidence',
      body: [
        'A typical pipeline runs cheap, fast checks first so most failures stop early: <b>lint and static analysis</b> (seconds), <b>unit tests</b> (minutes), <b>build and package</b>, <b>integration tests</b> against real dependencies, <b>security scans</b> (dependencies, secrets, container images), then deploy to <b>staging</b> for end-to-end and smoke tests, and finally <b>production</b> — often a gradual rollout with automatic rollback.',
        'Each stage answers a different question at a different price. Fail fast, parallelise independent jobs, cache dependencies and build layers, and run the slowest, broadest tests later (or on a schedule) rather than blocking every commit.',
      ],
      changes: [{ text: 'Cheap and fast first; slow and broad later', tone: 'good' }, { text: 'Parallel jobs, caches, early exit', tone: 'good' }],
      scene: { nodes: [box('a', -12, 0, 'Lint', 'green', 'check', { size: [1, 1], height: 14 }), box('b', -6, 0, 'Unit tests', 'green', 'check', { size: [1, 1], height: 18 }), box('c', 0, 0, 'Build', 'blue', 'layers', { size: [1, 1], height: 22 }), box('d', 6, 0, 'Integration', 'orange', 'refresh', { size: [1, 1], height: 26 }), box('e', 12, 0, 'Deploy', 'purple', 'globe', { size: [1, 1], height: 30 })], links: [link('a', 'b', { arrow: 'end' }), link('b', 'c', { arrow: 'end' }), link('c', 'd', { arrow: 'end' }), link('d', 'e', { arrow: 'end' })], flows: [flow(['a', 'b', 'c', 'd', 'e'], { rate: 1.5 })] },
    },
    {
      short: 'Artifacts',
      kind: 'technique',
      title: 'Build once, promote the same artifact',
      body: [
        'The pipeline produces an immutable <b>artifact</b> — a container image or package, tagged by commit hash and stored in a registry — and <b>the same bits</b> move through staging to production. Rebuilding per environment means production runs something no one tested. Environment differences belong in <b>configuration</b> injected at deploy time (and secrets from a vault), not in the build.',
        'Runners are the machines that execute jobs: shared pools or per-job ephemeral containers/VMs for isolation and clean state. Their capacity matters: the runner pool is a queue, as the next step shows.',
      ],
      changes: [{ text: 'Immutable artifact, tagged by commit', tone: 'good' }, { text: 'Config and secrets injected per environment', tone: 'good' }],
      scene: { nodes: [ci({ tag: pill('build once', 'layers') }), art({ tag: pill('app:9f3c2a1', 'hash') }), stage({ tag: pill('deploy same image', 'check') }), prod({ tag: pill('promote same image', 'check', 'good') })], links: [link('ci', 'art'), link('art', 'stage'), link('stage', 'prod')], flows: [flow(['ci', 'art', 'stage', 'prod'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Capacity',
      kind: 'tradeoff',
      title: 'Runners are a queue: utilisation sets the wait',
      body: [
        'Runs arrive through the working day; each occupies a runner for its duration. Utilisation is <code>ρ = runs × duration ÷ (runners × working minutes)</code>: 200 runs × 15 min ÷ (10 × 600) = <b>50%</b>. Waiting grows non-linearly as ρ → 1 — at 50% the average wait is a small fraction of a run; at 90% it is several run-lengths, and past 100% the queue never drains. Developers context-switch while waiting, so slow feedback costs far more than the minutes it shows.',
        'Levers: more runners or autoscaling ephemeral ones, faster runs (cache, parallelise, run only affected tests), cancelling superseded runs on the same branch, and merge queues to batch checks. Keep average utilisation near 60% or below; peaks (the hour after lunch, release week) are what hurt.',
      ],
      changes: [{ text: 'ρ = runs × duration ÷ (runners × 600 min)', tone: 'info' }, { text: 'Wait explodes as ρ → 1', tone: 'bad' }],
      scene: { nodes: [dev({ name: 'Pushes', tag: pill('200 / day', 'bolt') }), box('q', -6, 0, 'Run queue', 'yellow', 'queue', { size: [1.6, 1], height: 14, tag: pill('wait grows with ρ', 'clock', 'warn') }), ci({ name: '10 runners', load: 50 })], links: [link('dev', 'q'), link('q', 'ci')], flows: [flow(['dev', 'q', 'ci'], { rate: 2 })] },
    },
    {
      short: 'Flaky',
      kind: 'problem',
      title: 'Flaky tests: the failures that mean nothing',
      body: [
        'A flaky test fails sometimes without a code change (timing, shared state, network, ordering). Failures multiply: if each healthy test flakes with probability f, a run of n tests fails spuriously with <code>1 − (1 − f)ⁿ</code>. At f = 0.01% and 2,000 tests that is <b>18%</b> — nearly one run in five fails for no reason, wasting <b>~9 runner-hours a day</b> at 200 runs of 15 minutes, plus the trust: people start rerunning blindly and real failures get dismissed.',
        'Fix the cause, not the symptom: quarantine known-flaky tests (tracked, not ignored), isolate state, avoid sleeps, use deterministic clocks and containers, and monitor flake rate per test. Automatic retries hide the problem and mask real intermittent bugs — use them sparingly and report them.',
      ],
      changes: [{ text: '2,000 tests × 0.01% flake → 18% spurious failures', tone: 'bad' }, { text: 'Quarantine, isolate, track flake rate per test', tone: 'good' }],
      scene: { nodes: [ci({ state: 'hot', tag: pill('failed… passes on rerun', 'alert', 'warn') }), dev({ tag: pill('reruns blindly', 'refresh', 'warn') })], links: [link('ci', 'dev', { style: 'dashed' })], flows: [flow(['ci', 'dev'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Delivery',
      kind: 'technique',
      title: 'From green build to safe release',
      body: [
        'Deployment itself should be boring: <b>progressive delivery</b> — canary 1% → 10% → 100% with automatic rollback on error-rate or latency regressions (see the Deploy Strategies lesson); <b>feature flags</b> to decouple deploy from release; <b>database migrations</b> written backward-compatibly (expand → migrate → contract); and <b>GitOps</b> where the desired state lives in Git and an agent reconciles clusters to it.',
        'Measure the pipeline with the <b>four DORA metrics</b>: deployment frequency, lead time for changes, change failure rate and time to restore. They reveal whether CI/CD is actually making delivery faster and safer. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Canary + auto-rollback · flags · expand/contract migrations', tone: 'good' }, { text: 'DORA: frequency, lead time, failure rate, restore time', tone: 'info' }],
      scene: { nodes: [art(), stage({ tag: pill('smoke tests', 'check') }), prod({ tag: pill('canary 5% → 100%', 'gauge', 'good') })], links: [link('art', 'stage'), link('stage', 'prod')], flows: [flow(['art', 'stage', 'prod'], { rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Fast, trustworthy feedback is the product',
      body: [
        'CI/CD turns every commit into a build, a test run and a deployable artifact. Order stages by cost, build once and promote, keep runner utilisation below ~60%, treat flaky tests as defects (<code>1 − (1 − f)ⁿ</code> compounds) and deploy progressively.',
        'The pipeline’s value is feedback speed and trust: measure it, and invest where waits and spurious failures are costing the most.',
      ],
      scene: { nodes: [dev(), repo(), ci(), art(), stage(), prod()], links: [link('dev', 'repo'), link('repo', 'ci'), link('ci', 'art'), link('art', 'stage'), link('stage', 'prod')], flows: [flow(['dev', 'repo', 'ci', 'art', 'stage', 'prod'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
