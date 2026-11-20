import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => box('users', -17, 0, 'Users', 'green', 'users', { size: [1.3, 1.3], height: 24, ...extra });
const assign = (extra: Partial<SceneNode> = {}) => box('assign', -9, 0, 'Assignment service', 'purple', 'hash', { size: [1.4, 1.4], height: 28, ...extra });
const app = (extra: Partial<SceneNode> = {}) => box('app', -1, 0, 'Product (variant A / B)', 'blue', 'server', { size: [1.5, 1.5], height: 30, ...extra });
const events = (extra: Partial<SceneNode> = {}) => box('events', 7, 0, 'Event pipeline', 'orange', 'queue', { size: [1.8, 1], height: 14, ...extra });
const stats = (extra: Partial<SceneNode> = {}) => box('stats', 14, 0, 'Statistics engine', 'teal', 'gauge', { size: [1.4, 1.4], height: 26, ...extra });
const config = (extra: Partial<SceneNode> = {}) => db('cfg', -9, 8, 'Experiment config', { size: [1.2, 1.2], ...extra });

/** Upper-tail standard-normal quantile (Abramowitz & Stegun 26.2.23), for 0 < p < 0.5. */
function zUpper(p: number): number {
  const t = Math.sqrt(-2 * Math.log(Math.min(0.4999, Math.max(1e-9, p))));
  return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
}

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtD = (d: number): string => (d >= 60 ? `${(d / 7).toFixed(1)} weeks` : d >= 1 ? `${d.toFixed(1)} days` : `${Math.round(d * 24)} h`);

const lesson: Lesson = {
  slug: 'source-experiment-platform-architecture',
  title: 'A/B Testing Platforms: Assignment, Metrics and Sample Size',
  blurb: 'Deterministic bucketing, exposure logging, a metrics pipeline, and the statistics that decide how many users and how many days an experiment needs before its answer means anything.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'n', label: 'Users needed per arm', icon: 'users' },
    { key: 'days', label: 'Experiment duration', icon: 'clock' },
    { key: 'nm', label: 'Per arm with multiple-metric correction', icon: 'layers' },
    { key: 'mde', label: 'Smallest lift detectable in 1 week', icon: 'gauge' },
  ],
  goals: [
    { text: 'Why randomised experiments are the only reliable causal test', step: 1 },
    { text: 'Deterministic assignment and exposure logging', step: 2 },
    { text: 'Metrics pipeline and sample-ratio checks', step: 3 },
    { text: 'The sample-size formula and what drives it', step: 4 },
    { text: 'Peeking, multiple metrics and other ways to fool yourself', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'base', label: 'Baseline conversion rate', min: 0.1, max: 60, step: 0.1, default: 5, unit: '%', description: 'Current rate of the metric you want to move.' },
      { key: 'lift', label: 'Relative lift to detect', min: 0.5, max: 50, step: 0.5, default: 5, unit: '%', description: 'Smallest relative change worth detecting (5% of a 5% rate = +0.25 points).' },
      { key: 'alpha', label: 'Significance level (two-sided)', min: 1, max: 20, step: 1, default: 5, unit: '%', description: 'Accepted false-positive rate.' },
      { key: 'power', label: 'Statistical power', min: 50, max: 99, step: 1, default: 80, unit: '%', description: 'Chance of detecting the lift if it is real.' },
      { key: 'traffic', label: 'Eligible users per day', min: 100, max: 100000000, step: 100, default: 100000, unit: '', description: 'Unique users entering the experiment daily.' },
      { key: 'alloc', label: 'Share of traffic allocated', min: 1, max: 100, step: 1, default: 100, unit: '%', description: 'Fraction of eligible users enrolled (split evenly between arms).' },
      { key: 'metrics', label: 'Metrics tested for significance', min: 1, max: 50, step: 1, default: 1, unit: '', description: 'Metrics checked; correction divides the significance level.' },
      { key: 'vr', label: 'Variance reduction (e.g. CUPED)', min: 0, max: 80, step: 1, default: 0, unit: '%', description: 'Share of metric variance removed using pre-experiment data.' },
    ],
    calculate: (input, step) => {
      const p = Math.min(0.99, Math.max(0.0005, (input.base ?? 5) / 100));
      const lift = Math.max(0.0005, (input.lift ?? 5) / 100);
      const alpha = Math.min(0.5, Math.max(0.001, (input.alpha ?? 5) / 100));
      const power = Math.min(0.999, Math.max(0.5, (input.power ?? 80) / 100));
      const traffic = Math.max(1, input.traffic ?? 1e5);
      const alloc = Math.min(1, Math.max(0.01, (input.alloc ?? 100) / 100));
      const m = Math.max(1, Math.round(input.metrics ?? 1));
      const vr = Math.min(0.95, Math.max(0, (input.vr ?? 0) / 100));
      const za = zUpper(alpha / 2);
      const zb = zUpper(1 - power);
      const delta = p * lift;
      const n = (2 * Math.pow(za + zb, 2) * p * (1 - p) * (1 - vr)) / (delta * delta);
      const zam = zUpper(alpha / (2 * m));
      const nm = (2 * Math.pow(zam + zb, 2) * p * (1 - p) * (1 - vr)) / (delta * delta);
      const days = (2 * n) / (traffic * alloc);
      // Detectable relative lift in 7 days: invert n for the sample that accumulates in a week.
      const nWeek = (traffic * alloc * 7) / 2;
      const deltaWeek = Math.sqrt((2 * Math.pow(za + zb, 2) * p * (1 - p) * (1 - vr)) / nWeek);
      return {
        n: step < 3 ? { v: '—' } : { v: fmtN(n), tone: n > 1e6 ? 'warn' : 'good' },
        days: step < 3 ? { v: '—' } : { v: `${fmtD(days)}${days < 7 ? ' (run at least a full week)' : ''}`, tone: days < 14 ? 'good' : days < 42 ? 'warn' : 'bad' },
        nm: step < 4 ? { v: '—' } : { v: `${fmtN(nm)} (${m} metrics: α ÷ ${m})`, tone: m === 1 ? 'good' : 'warn' },
        mde: step < 3 ? { v: '—' } : { v: `${((deltaWeek / p) * 100).toFixed(1)}% relative`, tone: deltaWeek / p < lift ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'Only randomisation separates cause from coincidence',
      body: [
        'You ship a new checkout and conversion rises 4% the next week. Was it the checkout — or a sale, a holiday, a seasonal trend, a different mix of visitors? Comparing “before” and “after” confounds the change with everything else that changed. The reliable answer is a <b>controlled experiment</b>: randomly split users into <b>control</b> (current experience) and <b>treatment</b> (new), run them <i>at the same time</i>, and compare. Randomisation balances everything else — known and unknown — across the groups, so a difference is attributable to the change.',
        'An experimentation platform makes this routine and safe: it assigns users, serves variants, records exposures, computes metrics and statistics, and guards against the many ways to fool yourself. Its parts are the next steps; its hardest part is the statistics.',
      ],
      scene: { nodes: [users({ tag: pill('randomly split', 'hash') }), box('a', 0, -5, 'Control: current', 'blue', 'server', { size: [1.3, 1.3], height: 24 }), box('b', 0, 5, 'Treatment: new', 'orange', 'server', { size: [1.3, 1.3], height: 26 }), stats({ tag: pill('compare, same time', 'gauge') })], links: [link('users', 'a'), link('users', 'b'), link('a', 'stats'), link('b', 'stats')], flows: [flow(['users', 'a', 'stats'], { rate: 1.5 }), flow(['users', 'b', 'stats'], { rate: 1.5 })] },
    },
    {
      short: 'Assignment',
      kind: 'technique',
      title: 'Deterministic assignment and exposure logging',
      body: [
        'Assignment must be <b>sticky</b> (a user sees the same variant every time), <b>consistent across devices and services</b>, and cheap. The standard method is <b>hashing</b>: <code>bucket = hash(experiment_id + user_id) mod 10,000</code>; buckets 0–4,999 are control, 5,000–9,999 treatment. No lookup table, no state, identical results in every service, and including the <b>experiment id in the hash</b> keeps different experiments independent (a user in treatment of one isn’t systematically in treatment of another). Ramps (1% → 10% → 50%) just widen the bucket range.',
        'Log an <b>exposure event</b> at the moment the variant actually affects the user — not merely at assignment — so analysis includes only people who saw the difference (otherwise the effect is diluted). Experiment config (variants, allocation, targeting rules, start/stop, kill switch) lives in a service that clients and servers fetch and cache, with <b>mutual-exclusion layers</b> for experiments that would interact.',
      ],
      changes: [{ text: 'bucket = hash(experiment + user) mod N', tone: 'good' }, { text: 'Log exposure at the moment of impact', tone: 'good' }],
      scene: { nodes: [users(), assign({ tag: pill('hash(exp + user) → bucket', 'hash') }), config({ tag: pill('variants · ramp · kill switch', 'list') }), app({ tag: pill('serves the variant', 'check') })], links: [link('users', 'assign'), link('cfg', 'assign'), link('assign', 'app')], flows: [flow(['users', 'assign', 'app'], { rate: 1.5 })] },
    },
    {
      short: 'Metrics',
      kind: 'technique',
      title: 'The metrics pipeline and sample-ratio checks',
      body: [
        'Events (exposures, clicks, purchases, latency) flow through a durable pipeline into a warehouse. The statistics engine joins <b>exposure</b> to <b>outcomes per user</b>, aggregates per variant, and computes the effect, its confidence interval and p-value — for a <b>primary metric</b> (decided in advance), <b>guardrail metrics</b> (latency, errors, revenue, unsubscribe rate — things that must not regress) and secondary diagnostics. Metric definitions are shared and versioned so every team computes “conversion” identically.',
        'First check data quality with a <b>sample ratio mismatch (SRM)</b> test: if you assigned 50/50 and observe 50.6/49.4 across a million users, a chi-squared test says that is wildly unlikely by chance — something is broken (bots, a crash in one variant, a logging bug, redirects). An SRM invalidates the experiment however good the result looks.',
      ],
      changes: [{ text: 'Primary + guardrail + diagnostic metrics', tone: 'good' }, { text: 'SRM check before reading any result', tone: 'good' }],
      scene: { nodes: [app(), events({ tag: pill('exposure + outcome events', 'list') }), stats({ tag: pill('effect · CI · SRM check', 'check', 'good') })], links: [link('app', 'events'), link('events', 'stats')], flows: [flow(['app', 'events', 'stats'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Sample size',
      kind: 'technique',
      title: 'How many users? The sample-size formula',
      body: [
        'For a conversion rate p and the smallest absolute change δ you care about, each arm needs about <code>n = 2 (z<sub>α/2</sub> + z<sub>β</sub>)² · p(1 − p) ÷ δ²</code> users, where z<sub>α/2</sub> = 1.96 (5% significance) and z<sub>β</sub> = 0.84 (80% power). For a 5% baseline and a 5% relative lift (δ = 0.25 points): 2 × 7.85 × 0.0475 ÷ 0.0025² ≈ <b>119,000 per arm</b> — at 100,000 eligible users a day that is ~2.4 days (but always run whole weeks to cover weekly cycles).',
        'The dependence is sharp: n scales with <b>1 ÷ δ²</b> — detecting a lift <i>half</i> as large needs <b>4× the users</b>; a lower baseline rate needs more; higher power or stricter α needs more. <b>Variance reduction</b> (CUPED: adjust by each user’s pre-experiment behaviour) can cut required n by 30–50%. Small sites simply can’t detect small effects — better to test bold changes than to run underpowered tests that “find nothing”.',
      ],
      changes: [{ text: 'n = 2(zα/2 + zβ)² p(1−p) ÷ δ² per arm', tone: 'info' }, { text: '5% rate, 5% lift → ~119k per arm; half the lift → 4×', tone: 'info' }],
      concepts: [{ term: 'Statistical power', def: 'The probability that a test detects an effect of a given size when it truly exists.' }],
      scene: { nodes: [stats({ tag: pill('n ∝ 1 / δ²', 'gauge') }), box('s', -8, 0, 'Baseline 5% · lift 5% · power 80%', 'blue', 'list', { size: [1.4, 1.4], height: 22 }), box('r', 8, 0, '≈ 119,000 per arm', 'green', 'users', { size: [1.3, 1.3], height: 22 })], links: [link('s', 'stats', { arrow: 'end' }), link('stats', 'r', { arrow: 'end' })], flows: [flow(['s', 'stats', 'r'], { rate: 1.5 })] },
    },
    {
      short: 'Pitfalls',
      kind: 'problem',
      title: 'Peeking, many metrics and other ways to fool yourself',
      body: [
        '<b>Peeking</b>: checking the p-value daily and stopping when it dips below 0.05 inflates false positives dramatically — with ~10 looks the real false-positive rate is nearer 20% than 5%. Fix with a <b>pre-registered duration</b>, or use <b>sequential testing</b> / always-valid p-values designed for continuous monitoring. <b>Multiple comparisons</b>: test 20 metrics at 5% and one will be “significant” by chance; correct (Bonferroni divides α by the number of metrics — 10 metrics raises the sample need by about 50%) or designate one primary metric in advance.',
        'Also: <b>novelty and primacy effects</b> (users click new things at first — run long enough for behaviour to settle), <b>interference</b> between users (social features, marketplaces — randomise by cluster or market), <b>Simpson’s paradox</b> in segment slicing, <b>heavy-tailed revenue</b> (use robust or log metrics, cap outliers), and <b>winner’s curse</b> (the measured lift of a winner overstates the true effect — re-verify with a holdout). Figures here are model outputs for sizing.',
      ],
      changes: [{ text: '10 peeks at α = 5% → ~20% real false-positive rate', tone: 'bad' }, { text: 'Pre-register, one primary metric or correct for many', tone: 'good' }, { text: 'Run whole weeks; check SRM; use guardrails', tone: 'good' }],
      scene: { nodes: [stats({ tag: pill('p = 0.04 on day 3… stop?', 'alert', 'warn') }), box('ok', 8, 0, 'Pre-registered end date', 'green', 'check', { size: [1.3, 1.3], height: 22, tag: pill('trust the result', 'check', 'good') })], links: [link('stats', 'ok', { style: 'dashed' })], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Randomise, measure, and size the test before you start',
      body: [
        'A platform provides <b>hash-based sticky assignment</b>, <b>exposure logging</b>, a <b>shared metrics pipeline</b> with guardrails and SRM checks, and a statistics engine. The required sample is <code>2(z<sub>α/2</sub> + z<sub>β</sub>)² p(1 − p) ÷ δ²</code> per arm — it explodes as the effect shrinks.',
        'Decide the metric and duration in advance, run whole weeks, correct for multiple metrics, avoid peeking, and verify winners.',
      ],
      scene: { nodes: [users(), assign(), app(), events(), stats()], links: [link('users', 'assign'), link('assign', 'app'), link('app', 'events'), link('events', 'stats')], flows: [flow(['users', 'assign', 'app', 'events', 'stats'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
