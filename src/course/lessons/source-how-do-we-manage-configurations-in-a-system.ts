import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const dev = (extra: Partial<SceneNode> = {}) => box('dev', -18, 0, 'Change author (flag / config / deploy)', 'teal', 'user', { size: [1.4, 1.4], height: 24, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', -9, 0, 'Config / flag store (versioned, audited)', { size: [1.6, 1.6], ...extra });
const sdk = (extra: Partial<SceneNode> = {}) => box('sdk', 0, 0, 'Client SDK: cached rules, local evaluation', 'purple', 'cpu', { size: [1.6, 1.6], height: 26, ...extra });
const canary = (extra: Partial<SceneNode> = {}) => crowd('canary', 10, -7, 4, 'canary cohort (1%)', extra);
const rest = (extra: Partial<SceneNode> = {}) => crowd('rest', 10, 7, 12, 'everyone else (99%)', extra);
const guard = (extra: Partial<SceneNode> = {}) => box('guard', 18, 0, 'Metrics guard: compare error rate, auto-rollback', 'green', 'shield', { size: [1.6, 1.6], height: 28, ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${s < 10 ? s.toFixed(1) : Math.round(s)} s`);

/** Standard normal quantile (Abramowitz & Stegun 26.2.23). */
const qnorm = (p: number): number => {
  const pp = Math.min(1 - 1e-12, Math.max(1e-12, p));
  const q = pp < 0.5 ? pp : 1 - pp;
  const t = Math.sqrt(-2 * Math.log(q));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return pp < 0.5 ? -z : z;
};

const lesson: Lesson = {
  slug: 'source-how-do-we-manage-configurations-in-a-system',
  title: 'Feature Flags and Canary Releases: Statistics, Blast Radius and Config Safety',
  blurb: 'Decouple deploying code from releasing behaviour with versioned config and flags, then limit damage with a canary cohort — and compute how much traffic and time you need to detect a regression, and how much harm a 1% canary saves.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'n', label: 'Canary requests needed to detect the regression', icon: 'calc' },
    { key: 'time', label: 'Time to detect at canary traffic', icon: 'timer' },
    { key: 'harm', label: 'Extra failures before mitigation: 1% canary vs 100% rollout', icon: 'alert' },
    { key: 'roll', label: 'Staged rollout: stages and minimum time', icon: 'steps' },
  ],
  goals: [
    { text: 'Config and flags: change behaviour without a deploy', step: 1 },
    { text: 'Flag types, targeting and safe evaluation', step: 2 },
    { text: 'Canary: send a little traffic first', step: 3 },
    { text: 'Detecting a regression: the sample-size maths', step: 4 },
    { text: 'Operating it: automation, config as code, cleanup', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'p1', label: 'Baseline error rate', min: 0.01, max: 20, step: 0.01, default: 0.5, unit: '%', description: 'Errors with the old behaviour.' },
      { key: 'p2', label: 'Error rate with the faulty change', min: 0.02, max: 40, step: 0.01, default: 1, unit: '%', description: 'Errors with the new behaviour.' },
      { key: 'rps', label: 'Total traffic', min: 10, max: 1000000, step: 10, default: 20000, unit: '/s', description: 'Requests per second across the service.' },
      { key: 'share', label: 'Canary share of traffic', min: 0.01, max: 50, step: 0.01, default: 1, unit: '%', description: 'Traffic exposed to the change first.' },
      { key: 'conf', label: 'Confidence', min: 90, max: 99.99, step: 0.01, default: 99, unit: '%', description: 'Two-sided confidence in the test.' },
      { key: 'pow', label: 'Power', min: 50, max: 99.9, step: 0.1, default: 90, unit: '%', description: 'Chance of catching the regression if it is real.' },
      { key: 'resp', label: 'Detection-to-mitigation delay', min: 1, max: 1800, step: 1, default: 120, unit: ' s', description: 'Alert, decision and rollback time after the evidence exists.' },
      { key: 'bake', label: 'Bake time per rollout stage', min: 1, max: 120, step: 1, default: 10, unit: ' min', description: 'Wait before widening exposure.' },
    ],
    calculate: (input, step) => {
      const p1 = Math.min(0.99, Math.max(0.0001, (input.p1 ?? 0.5) / 100));
      const p2 = Math.min(0.99, Math.max(0.0001, (input.p2 ?? 1) / 100));
      const rps = Math.max(1, input.rps ?? 2e4);
      const share = Math.min(1, Math.max(0.0001, (input.share ?? 1) / 100));
      const conf = Math.min(0.9999, Math.max(0.5, (input.conf ?? 99) / 100));
      const pow = Math.min(0.999, Math.max(0.5, (input.pow ?? 90) / 100));
      const resp = Math.max(0, input.resp ?? 120);
      const bake = Math.max(0, input.bake ?? 10);
      const zA = qnorm(1 - (1 - conf) / 2);
      const zB = qnorm(pow);
      const delta = Math.abs(p2 - p1);
      const n = delta < 1e-9 ? Infinity : Math.ceil(((zA + zB) * (zA + zB) * (p1 * (1 - p1) + p2 * (1 - p2))) / (delta * delta));
      const cRps = rps * share;
      const tDetect = n / cRps;
      const extra = Math.max(0, p2 - p1);
      const harmCanary = cRps * (tDetect + resp) * extra;
      const harmFull = rps * (n / rps + resp) * extra;
      const stages = [share, Math.min(1, share * 5), Math.min(1, share * 25), 1].filter((x, i, a) => i === 0 || x > (a[i - 1] ?? 0));
      return {
        n: step < 4 ? { v: '—' } : { v: Number.isFinite(n) ? `${fmtN(n)} per arm (z = ${zA.toFixed(2)} + ${zB.toFixed(2)}; ${(p1 * 100).toFixed(2)}% → ${(p2 * 100).toFixed(2)}%)` : 'no difference to detect' },
        time: step < 4 ? { v: '—' } : { v: Number.isFinite(n) ? `${fmtT(tDetect)} at ${fmtN(cRps)} req/s` : '—', tone: tDetect < 300 ? 'good' : tDetect < 1800 ? 'warn' : 'bad' },
        harm: step < 3 ? { v: '—' } : { v: Number.isFinite(n) ? `${fmtN(harmCanary)} vs ${fmtN(harmFull)} extra failures (${(harmFull / Math.max(1, harmCanary)).toFixed(0)}× fewer)` : '—', tone: 'good' },
        roll: step < 5 ? { v: '—' } : { v: `${stages.length} stages (${stages.map((s) => `${(s * 100).toFixed(s < 0.1 ? 2 : 0)}%`).join(' → ')}) · ≥ ${fmtT(stages.length * bake * 60)} of bake`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'Separate deploying code from releasing behaviour',
      body: [
        'A deploy puts new code on servers; a <b>release</b> exposes new behaviour to users. Tying them together makes every deployment a gamble and every rollback a redeploy. <b>Configuration</b> (timeouts, limits, endpoints, thresholds) and <b>feature flags</b> (<code>if flags.new_checkout(user) { … }</code>) split the two: code ships dark, then behaviour is switched on gradually, for chosen users, and off again in seconds <i>without</i> a build. That enables <b>trunk-based development</b> (unfinished work merged behind a flag), progressive rollout, A/B experiments, kill switches for risky dependencies, and per-tenant customisation.',
        'The price is a new class of risk: config is <b>code that bypasses your pipeline</b>. A bad flag value takes production down just as fast as a bad deploy — many large outages trace to a configuration change pushed everywhere at once. So config needs the same discipline as code: <b>versioning, review, staged rollout, validation and instant rollback</b>. The rest of the lesson is about doing that — and about quantifying how small a first exposure can be and still catch a problem.',
      ],
      scene: { nodes: [dev({ tag: pill('flip new_checkout: 1%', 'bolt') }), store({ tag: pill('versioned · reviewed · audited', 'list', 'good') }), sdk()], links: [link('dev', 'store'), link('store', 'sdk')], flows: [flow(['dev', 'store', 'sdk'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Flags',
      kind: 'technique',
      title: 'Flag types, targeting and safe evaluation',
      body: [
        'Distinguish flags by lifetime and purpose. <b>Release flags</b> hide incomplete or risky work and should live days to weeks. <b>Ops / kill-switch flags</b> disable a costly or flaky feature under load (long-lived, deliberately). <b>Experiment flags</b> assign users to variants and record exposure for analysis. <b>Permission/entitlement flags</b> gate plan features (really product config, not temporary). Mixing them is how flag debt starts. <b>Targeting</b> evaluates rules against context (user id, tenant, region, app version, percentage): <b>percentage rollouts hash a stable key</b> — <code>hash(flag_key + user_id) mod 100 &lt; 5</code> — so a user stays in or out consistently across requests and increasing the percentage only <i>adds</i> users.',
        'Evaluate flags <b>locally in an SDK</b> from a cached ruleset streamed or polled from the flag service: no network call per check (an extra 20 ms on every request would dwarf the benefit), the service being down must not take the app down (<b>fail to a safe default</b>, defined in code), and rules update within seconds. Keep evaluation <b>deterministic and side-effect free</b>, log which variant each request saw (so errors can be attributed — <code>flag=new_checkout:on</code> in trace attributes), and treat flag payloads as untrusted input (validate type and range; a typo’d value shouldn’t crash the app).',
      ],
      changes: [{ text: 'Release · kill-switch · experiment · entitlement: different lifetimes', tone: 'info' }, { text: 'Stable hash for percentage rollouts: widening only adds users', tone: 'good' }, { text: 'Local evaluation, safe defaults, variant logged per request', tone: 'good' }],
      scene: { nodes: [store(), sdk({ tag: pill('hash(flag+user) mod 100 < 5', 'hash', 'good') }), canary({ tag: pill('on', 'check', 'good') }), rest({ tag: pill('off', 'x') })], links: [link('store', 'sdk'), link('sdk', 'canary'), link('sdk', 'rest')], flows: [flow(['store', 'sdk', 'canary'], { rate: 1.6 })] },
    },
    {
      short: 'Canary',
      kind: 'technique',
      title: 'Canary: expose a small cohort first and compare',
      body: [
        'A <b>canary release</b> sends a small slice of traffic (or users) to the new behaviour while the rest stays on the old, then <b>compares them</b> on the metrics that matter: error rate, latency percentiles, saturation, business signals (checkout conversion, crash rate). It works with a flag (cohort by hash), with a new version of the service behind weighted routing in the load balancer or service mesh (see those lessons), or a canary region/cell (see the Cell-Based Architecture lesson). The <b>control</b> is the old behaviour running <i>at the same time</i> — compare against it, not against yesterday’s graph, which differs for unrelated reasons (time of day, traffic mix).',
        'The point is <b>bounding the blast radius</b>. If the change doubles the error rate (0.5% → 1.0%) and mitigation takes two minutes, exposing 1% of 20,000 req/s costs about <b>164 extra failures</b>; exposing 100% costs <b>12,044</b> — <b>73× more</b> for the same bug. Pick canary cohorts that are <b>representative</b> (not just employees or one region), large enough to be <b>statistically useful</b> (next step), and sized so a failure is tolerable. Stage: 1% → 5% → 25% → 100%, each with a bake period to catch slow-building problems (memory leaks, cache effects, nightly jobs).',
      ],
      changes: [{ text: 'Canary vs control at the same time, on the same metrics', tone: 'good' }, { text: '1% canary: ~164 extra failures vs 12,044 at 100% (73×)', tone: 'good' }, { text: 'Representative cohort; staged 1 → 5 → 25 → 100% with bake time', tone: 'good' }],
      concepts: [{ term: 'Blast radius', def: 'The share of users or traffic affected if a change is faulty; canarying and cells keep it small.' }],
      scene: { nodes: [sdk({ tag: pill('1% new behaviour', 'bolt') }), canary({ tag: pill('new: error 1.0%', 'alert', 'warn') }), rest({ tag: pill('old: error 0.5%', 'check') }), guard({ tag: pill('compare cohorts', 'search') })], links: [link('sdk', 'canary'), link('sdk', 'rest'), link('canary', 'guard'), link('rest', 'guard')], flows: [flow(['sdk', 'canary', 'guard'], { rate: 1.2 }), flow(['sdk', 'rest', 'guard'], { rate: 2 })] },
    },
    {
      short: 'Statistics',
      kind: 'insight',
      title: 'How much canary traffic do you need to be sure?',
      body: [
        'A canary with 12 requests and 1 error proves nothing. To distinguish an error rate p₂ from a baseline p₁ you need a minimum sample per arm: <code>n = (z<sub>α/2</sub> + z<sub>β</sub>)² · [p₁(1 − p₁) + p₂(1 − p₂)] ÷ (p₂ − p₁)²</code>. For 0.5% → 1.0% at 99% confidence and 90% power: (2.576 + 1.282)² × (0.004975 + 0.0099) ÷ 0.005² ≈ <b>8,850 requests</b>. At the 1% canary’s 200 req/s that is <b>44 seconds</b> of traffic; for a subtler 0.5% → 0.6% regression it is ~160,000 requests, <b>13 minutes</b>. Small effects, rare events and low traffic all lengthen detection quadratically — which is why services with little traffic need <i>larger</i> canary shares, longer bakes, or synthetic load.',
        'Practical rules: use <b>sequential</b> or Bayesian tests (peek continuously without inflating false alarms), compare <b>rates</b> not counts, watch <b>multiple metrics</b> with a correction for multiple comparisons (or you’ll roll back on noise), guard against <b>novelty and warm-up effects</b> (cold caches in the new cohort look like latency regressions), and define <b>automatic rollback thresholds</b> in advance. Bake time covers what statistics can’t: problems that appear only with time, scale or specific data.',
      ],
      changes: [{ text: '0.5% → 1.0% at 99%/90%: ~8,850 requests per arm = 44 s at 200 req/s', tone: 'info' }, { text: 'Smaller effects need quadratically more traffic', tone: 'bad' }, { text: 'Sequential tests, multiple-metric correction, pre-set rollback thresholds', tone: 'good' }],
      scene: { nodes: [canary({ tag: pill('8,850 requests', 'list') }), rest(), guard({ tag: pill('z-test: p-value < 0.01 → roll back', 'alert', 'bad') })], links: [link('canary', 'guard'), link('rest', 'guard')], flows: [flow(['canary', 'guard'], { kind: 'fail', rate: 1.6 })] },
    },
    {
      short: 'Operate',
      kind: 'tradeoff',
      title: 'Automation, config as code and cleanup',
      body: [
        '<b>Automate the guard</b>: a progressive-delivery controller (Argo Rollouts, Flagger, Spinnaker/Kayenta, a flag platform’s guarded rollouts) advances stages when canary metrics pass and <b>rolls back automatically</b> when they fail — removing human reaction time from the harm calculation. A 4-stage plan with a 10-minute bake each takes at least <b>40 minutes</b>; reserve fast paths for emergencies, with extra review. Treat <b>config as code</b>: stored in version control or a versioned store, validated against a <b>schema</b> in CI (types, ranges, required keys), reviewed, applied through the same staged pipeline, with <b>diff and audit trail</b> (who changed what, when, from where) and the ability to <b>roll back to the last known good</b> version instantly. Push config <b>gradually</b> across regions and cells, never everywhere at once.',
        'Hygiene: give every flag an <b>owner, purpose and expiry</b>; delete release flags once fully rolled out (stale flags are untested code paths and a combinatorial explosion — 20 flags is a million configurations); keep a <b>kill switch for every risky dependency</b> and test it regularly; make sure the system behaves when the flag service is unreachable; separate <b>secrets</b> from config (see the Secrets lesson); and never let a flag value silently change security behaviour without review. Figures here are model outputs from the stated rates, traffic and delays.',
      ],
      changes: [{ text: 'Auto-advance and auto-rollback on guard metrics', tone: 'good' }, { text: 'Config as code: schema-validated, reviewed, staged, audited, instantly revertible', tone: 'good' }, { text: 'Flag owners and expiry; delete rolled-out flags; test kill switches', tone: 'good' }],
      scene: { nodes: [dev(), store({ tag: pill('schema-validated, last-known-good', 'check', 'good') }), guard({ tag: pill('auto-rollback', 'refresh', 'good') }), canary(), rest()], links: [link('dev', 'store'), link('store', 'canary'), link('store', 'rest'), link('canary', 'guard')], flows: [flow(['dev', 'store', 'canary', 'guard'], { rate: 1.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Small first exposure, statistics, fast rollback',
      body: [
        'Flags and config separate <b>deploy from release</b>; evaluate them locally with safe defaults. A <b>canary</b> limits blast radius (164 vs 12,044 extra failures here) and the sample-size formula says how long to watch: ~8,850 requests (44 s at 200 req/s) for a doubling of errors, far more for subtle regressions.',
        'Automate guard metrics and rollback, treat config as code, and retire flags.',
      ],
      scene: { nodes: [dev(), store(), sdk(), canary(), rest(), guard()], links: [link('dev', 'store'), link('store', 'sdk'), link('sdk', 'canary'), link('sdk', 'rest'), link('canary', 'guard')], flows: [flow(['dev', 'store', 'sdk', 'canary'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
