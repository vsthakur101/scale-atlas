import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const cand = (extra: Partial<SceneNode> = {}) => box('cand', -18, 0, 'Candidate outputs (model A vs B)', 'teal', 'file', { size: [1.6, 1.4], height: 18, ...extra });
const prompt = (extra: Partial<SceneNode> = {}) => box('prompt', -8, -8, 'Judge prompt: rubric + criteria', 'orange', 'doc', { size: [1.4, 1.4], height: 20, ...extra });
const judge = (extra: Partial<SceneNode> = {}) => box('judge', -6, 0, 'Judge model (LLM)', 'purple', 'sparkle', { size: [1.8, 1.8], height: 32, ...extra });
const verdict = (extra: Partial<SceneNode> = {}) => box('verdict', 6, 0, 'Verdicts: win / lose / tie', 'blue', 'check', { size: [1.5, 1.4], height: 22, ...extra });
const humans = (extra: Partial<SceneNode> = {}) => db('humans', 6, 8, 'Human-labelled calibration set', { size: [1.4, 1.4], ...extra });
const stats = (extra: Partial<SceneNode> = {}) => box('stats', 15, 0, 'Statistics: win rate, CI, power', 'green', 'activity', { size: [1.5, 1.5], height: 26, ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);

/** Standard normal quantile (Abramowitz & Stegun 26.2.23). */
const qnorm = (p: number): number => {
  const pp = Math.min(1 - 1e-12, Math.max(1e-12, p));
  const q = pp < 0.5 ? pp : 1 - pp;
  const t = Math.sqrt(-2 * Math.log(q));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return pp < 0.5 ? -z : z;
};

const lesson: Lesson = {
  slug: 'academy-llm-as-a-judge',
  title: 'LLM-as-a-Judge: Reliability, Bias and How Many Comparisons You Need',
  blurb: 'Using a model to grade model outputs scales evaluation — but a noisy judge shrinks the difference you can see. Model attenuation from judge accuracy, the sample sizes for confidence intervals and power, the cost, and the biases to control.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'obs', label: 'Win rate you will observe (vs the true one)', icon: 'gauge' },
    { key: 'atten', label: 'Share of the true advantage that survives judge noise', icon: 'filter' },
    { key: 'nci', label: 'Comparisons for a confidence interval of ± margin', icon: 'calc' },
    { key: 'npow', label: 'Comparisons to detect a difference from 50%', icon: 'search' },
    { key: 'cost', label: 'Judge cost of that detection run', icon: 'dollar' },
  ],
  goals: [
    { text: 'Why use a model as a grader', step: 1 },
    { text: 'Judging setups: pairwise, rubric score, reference-based', step: 2 },
    { text: 'Known biases and mitigations', step: 3 },
    { text: 'Measuring and correcting for judge noise', step: 4 },
    { text: 'Sample size, power and cost', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'p', label: 'True win rate of model A over B', min: 50, max: 95, step: 1, default: 60, unit: '%', description: 'Fraction of comparisons a perfect judge (or panel of experts) would give to A.' },
      { key: 'acc', label: 'Judge agreement with a perfect grader', min: 50, max: 100, step: 1, default: 85, unit: '%', description: 'How often the judge picks the same winner.' },
      { key: 'conf', label: 'Confidence level', min: 80, max: 99.9, step: 0.1, default: 95, unit: '%', description: 'Two-sided confidence for the interval and the test.' },
      { key: 'pow', label: 'Statistical power', min: 50, max: 99, step: 1, default: 80, unit: '%', description: 'Chance of detecting the difference when it exists.' },
      { key: 'm', label: 'Interval half-width wanted', min: 0.5, max: 10, step: 0.5, default: 3, unit: ' pts', description: 'Precision of the measured win rate.' },
      { key: 'tok', label: 'Tokens per judge call', min: 200, max: 20000, step: 100, default: 1500, unit: '', description: 'Prompt (rubric + two answers) plus output.' },
      { key: 'price', label: 'Price per million tokens', min: 0.05, max: 50, step: 0.05, default: 3, unit: ' $', description: 'Blended input/output price (illustrative).' },
      { key: 'calls', label: 'Judge calls per comparison', min: 1, max: 6, step: 1, default: 2, unit: '', description: '2 = judge both answer orders to cancel position bias.' },
    ],
    calculate: (input, step) => {
      const p = Math.min(0.99, Math.max(0.5, (input.p ?? 60) / 100));
      const a = Math.min(1, Math.max(0.5, (input.acc ?? 85) / 100));
      const conf = Math.min(0.9999, Math.max(0.5, (input.conf ?? 95) / 100));
      const pow = Math.min(0.999, Math.max(0.5, (input.pow ?? 80) / 100));
      const m = Math.max(0.001, (input.m ?? 3) / 100);
      const tok = Math.max(1, input.tok ?? 1500);
      const price = Math.max(0, input.price ?? 3);
      const calls = Math.max(1, Math.round(input.calls ?? 2));
      // A noisy judge flips the verdict with probability (1 − a): observed = p·a + (1 − p)(1 − a).
      const obs = p * a + (1 - p) * (1 - a);
      const zA = qnorm(1 - (1 - conf) / 2);
      const zB = qnorm(pow);
      const v = obs * (1 - obs);
      const nCI = Math.ceil((zA * zA * v) / (m * m));
      const gap = obs - 0.5;
      const nPow = gap > 1e-9 ? Math.ceil(Math.pow((zA * 0.5 + zB * Math.sqrt(v)) / gap, 2)) : Infinity;
      const cost = Number.isFinite(nPow) ? (nPow * calls * tok * price) / 1e6 : Infinity;
      return {
        obs: step < 4 ? { v: '—' } : { v: `${(obs * 100).toFixed(1)}% observed vs ${(p * 100).toFixed(0)}% true`, tone: Math.abs(obs - p) < 0.02 ? 'good' : 'warn' },
        atten: step < 4 ? { v: '—' } : { v: p > 0.5 ? `${(((obs - 0.5) / (p - 0.5)) * 100).toFixed(0)}% (= 2 × accuracy − 1)` : 'n/a', tone: a > 0.9 ? 'good' : 'warn' },
        nci: step < 5 ? { v: '—' } : { v: `${fmtN(nCI)} (z = ${zA.toFixed(2)}, ± ${(m * 100).toFixed(1)} pts)`, tone: nCI < 2000 ? 'good' : 'warn' },
        npow: step < 5 ? { v: '—' } : { v: Number.isFinite(nPow) ? `${fmtN(nPow)} (z_α = ${zA.toFixed(2)}, z_β = ${zB.toFixed(2)})` : 'unreachable: no observable gap', tone: Number.isFinite(nPow) && nPow < 2000 ? 'good' : 'bad' },
        cost: step < 5 ? { v: '—' } : { v: Number.isFinite(cost) ? `$${cost < 10 ? cost.toFixed(2) : Math.round(cost).toLocaleString('en-US')} (${fmtN(nPow)} × ${calls} calls × ${fmtN(tok)} tokens)` : '—', tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'Evaluation is the bottleneck; a model can grade at scale',
      body: [
        'Open-ended outputs — summaries, answers, code explanations, chat replies — have no single correct string, so exact-match metrics fail and BLEU/ROUGE correlate weakly with quality. <b>Human evaluation</b> is the gold standard but slow, expensive and inconsistent; you can afford hundreds of labels, not millions, and not on every prompt change. <b>LLM-as-a-judge</b> uses a strong model, given a rubric, to grade outputs: cheap enough to run on every commit, fast enough for tight iteration, and surprisingly well correlated with human preference when set up carefully.',
        'The catch is that the judge is itself a <b>noisy, biased measuring instrument</b>. Treating its verdicts as ground truth gives confident wrong answers; treating them as a calibrated, <i>measured</i> signal — with known agreement with humans, controlled biases and proper statistics — makes them genuinely useful for regression tests, A/B comparisons and ranking (see the Evals and Guardrails lesson for the broader harness).',
      ],
      scene: { nodes: [cand(), judge({ tag: pill('reads rubric + two answers', 'sparkle') }), verdict(), humans({ tag: pill('hundreds of expert labels', 'db') })], links: [link('cand', 'judge'), link('judge', 'verdict'), link('humans', 'judge', { style: 'dashed' })], flows: [flow(['cand', 'judge', 'verdict'], { rate: 1.6 })] },
    },
    {
      short: 'Setups',
      kind: 'technique',
      title: 'Judging setups: pairwise, rubric score, reference-based',
      body: [
        '<b>Pairwise comparison</b>: show the judge two answers to the same prompt and ask which is better (or tie). Humans and models are both more consistent at <i>relative</i> than absolute judgements, and it feeds directly into win rates and Elo-style rankings (LMSYS Chatbot Arena style). <b>Pointwise / rubric scoring</b>: rate one answer 1–5 on named criteria (accuracy, completeness, tone, safety) with explicit descriptions of each level — good for monitoring a single system over time, but scores drift and compress toward the middle unless anchored with examples. <b>Reference-based</b>: compare against a gold answer or retrieved facts (“does the answer contradict this document?”) — the most reliable for factual tasks and RAG faithfulness checks.',
        'Prompt craft matters: state the criteria and what to ignore (length, style), require a <b>short reasoning before the verdict</b> (chain-of-thought judging usually improves agreement), use a constrained output format (JSON with fields, or a single token) so parsing is robust, set temperature low, and keep one judge prompt per criterion rather than one mega-rubric. Version the judge prompt and model like code — a changed judge changes every historical number.',
      ],
      changes: [{ text: 'Pairwise → win rates; rubric → monitoring; reference-based → factuality', tone: 'info' }, { text: 'Reason first, then a constrained verdict; low temperature', tone: 'good' }, { text: 'Version the judge prompt and model', tone: 'good' }],
      scene: { nodes: [cand({ tag: pill('A vs B', 'copy') }), prompt({ tag: pill('criteria, ignore length', 'list') }), judge(), verdict({ tag: pill('{"winner":"A"}', 'check') })], links: [link('cand', 'judge'), link('prompt', 'judge'), link('judge', 'verdict')], flows: [flow(['cand', 'judge', 'verdict'], { rate: 1.6 })] },
    },
    {
      short: 'Biases',
      kind: 'problem',
      title: 'Known biases — and what to do about them',
      body: [
        '<b>Position bias</b>: the judge favours the answer shown first (or second) regardless of quality — fix by <b>judging both orders</b> and counting a win only when the verdict is consistent (or averaging), at the price of 2× calls. <b>Verbosity bias</b>: longer, more elaborate answers win — control by instructing the judge to ignore length, normalising length, or adding a length-controlled comparison. <b>Self-preference</b>: models rate their own family’s style higher — use a judge from a different family, or a panel of several judges and take the majority. <b>Style and format bias</b> (markdown, confident tone, lists) and <b>sycophancy</b> to claims in the prompt.',
        'Also: <b>limited ability to verify</b> (a weaker or equal judge can’t reliably spot subtle factual or reasoning errors — give it references, tool access or test results; for code, run the tests), <b>leakage</b> (judge sees training data of the candidate), <b>score compression</b> and <b>prompt sensitivity</b> (small wording changes move results — hence versioning and re-calibration). Mitigation pattern: randomise order, mask which model produced which answer, use rubrics with anchors, ensemble judges, and — critically — <b>measure the residual error against humans</b> rather than assuming the fixes worked.',
      ],
      changes: [{ text: 'Position: judge both orders · Verbosity: ignore length · Self-preference: different judge family', tone: 'good' }, { text: 'A judge that can’t verify facts will accept fluent errors', tone: 'bad' }, { text: 'Measure residual bias against human labels', tone: 'good' }],
      scene: { nodes: [cand({ tag: pill('long answer wins?', 'alert', 'warn') }), judge({ tag: pill('prefers position 1', 'alert', 'warn') }), verdict({ tag: pill('swap order, count consistent wins', 'refresh', 'good') })], links: [link('cand', 'judge'), link('judge', 'verdict')], flows: [flow(['cand', 'judge', 'verdict'], { rate: 1.6 }), flow(['verdict', 'judge'], { kind: 'handshake', rate: 0.8 })] },
    },
    {
      short: 'Noise',
      kind: 'insight',
      title: 'A noisy judge hides — and shrinks — real differences',
      body: [
        'Calibrate the judge on a <b>human-labelled set</b> (a few hundred items, ideally double-labelled by experts) and report <b>agreement</b> (accuracy against the human majority), <b>Cohen’s κ</b> (agreement beyond chance — 0.6–0.8 is “substantial”) and inter-human agreement as the ceiling (if humans only agree 80% of the time, no judge can exceed that). Slice by category: judges are often reliable on easy distinctions and near-random on close calls, exactly where you need them.',
        'The key effect: if the judge agrees with a perfect grader with probability <i>a</i> = 85%, the observed win rate is <code>a·p + (1 − a)(1 − p)</code>. A model that truly wins <b>60%</b> of comparisons shows <b>57%</b> — only <b>70%</b> of the real advantage (2a − 1) survives. Noise biases results <b>toward 50%</b>, so improvements look smaller than they are and are harder to detect. You can undo the bias if you know the accuracy: <code>p = (p_obs + a − 1) ÷ (2a − 1)</code> = (0.57 + 0.85 − 1) ÷ 0.7 = <b>0.60</b> — but the correction widens the confidence interval by 1/(2a − 1), which is why improving the judge is worth more than correcting for it.',
      ],
      changes: [{ text: 'Judge accuracy 85%: true 60% shows as 57% (70% of the advantage)', tone: 'bad' }, { text: 'Correct with p = (p_obs + a − 1) ÷ (2a − 1), at the price of wider intervals', tone: 'info' }, { text: 'Report agreement, κ and per-category accuracy vs humans', tone: 'good' }],
      concepts: [{ term: 'Attenuation', def: 'Measurement noise pulls an observed effect toward “no difference”: a judge that sometimes errs makes real improvements look smaller.' }],
      scene: { nodes: [humans({ tag: pill('κ = 0.7 · accuracy 85%', 'check') }), judge(), verdict({ tag: pill('observed 57% (true 60%)', 'gauge', 'warn') }), stats({ tag: pill('correct for a = 0.85', 'calc') })], links: [link('humans', 'judge', { style: 'dashed' }), link('judge', 'verdict'), link('verdict', 'stats')], flows: [flow(['judge', 'verdict', 'stats'], { rate: 1.6 })] },
    },
    {
      short: 'Sample',
      kind: 'tradeoff',
      title: 'Sample size, power and cost',
      body: [
        'Model each comparison as a coin flip with win probability <i>p</i>. To estimate it to ± <i>m</i> at confidence <i>z</i>: <code>n = z² · p(1 − p) ÷ m²</code> — at p = 0.57, ±3 points and 95% (z = 1.96) that is <b>1,047 comparisons</b>. To <i>detect</i> that the model beats 50% with power 80% (z<sub>β</sub> = 0.84): <code>n = (z·0.5 + z<sub>β</sub>·√(p(1 − p)))² ÷ (p − 0.5)²</code> = <b>399</b>. Smaller gaps need quadratically more: a 52% observed win rate needs about 6,000. Use <b>paired</b> comparisons on the same prompts (lower variance), stratify by category, and bootstrap intervals; compare to a <b>minimum effect that matters</b> instead of chasing significance.',
        'Cost is rarely the constraint: 399 comparisons × 2 calls (both orders) × 1,500 tokens at $3 per million tokens = about <b>$3.60</b> — versus a day of human annotation. The real constraints are <b>judge validity</b> (is it measuring what users care about?), <b>prompt coverage</b> (does the test set resemble production?), and <b>over-fitting to the judge</b> (optimising a model against one judge raises its score without raising quality — hold out a separate judge and periodic human audits). Use judges for fast regression gates and ranking, humans for launch decisions and for auditing the judge. All figures are model outputs for the stated accuracy, confidence and price.',
      ],
      changes: [{ text: 'n = z²p(1−p)/m²: 1,047 for ±3 pts; detection at 80% power: 399', tone: 'info' }, { text: '399 × 2 calls × 1,500 tokens ≈ $3.60', tone: 'good' }, { text: 'Guard against judge over-fitting: held-out judge and human audits', tone: 'bad' }],
      scene: { nodes: [cand({ tag: pill('399 prompts × both orders', 'list') }), judge({ tag: pill('$3.60 per run', 'dollar', 'good') }), stats({ tag: pill('win rate ± 3 pts, p < 0.05', 'check', 'good') }), humans({ tag: pill('periodic audit', 'search') })], links: [link('cand', 'judge'), link('judge', 'stats'), link('humans', 'stats', { style: 'dashed' })], flows: [flow(['cand', 'judge', 'stats'], { rate: 1.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A calibrated, bias-controlled, statistically sized judge',
      body: [
        '<b>LLM judges</b> scale evaluation but are noisy and biased: judge both orders, ignore length, use a different model family, give references. An 85%-accurate judge shows a true 60% win rate as <b>57%</b> (70% of the advantage); correct with the accuracy and size the sample — <b>~400</b> comparisons to detect, ~1,050 for ±3 points — at a few dollars.',
        'Calibrate against humans, version the judge, and audit to avoid over-fitting to it.',
      ],
      scene: { nodes: [cand(), judge(), verdict(), humans(), stats()], links: [link('cand', 'judge'), link('judge', 'verdict'), link('humans', 'judge', { style: 'dashed' }), link('verdict', 'stats')], flows: [flow(['cand', 'judge', 'verdict', 'stats'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
