import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const task = (extra: Partial<SceneNode> = {}) => box('task', -16, 0, 'Task + input', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const prompt = (extra: Partial<SceneNode> = {}) => box('prompt', -8, 0, 'Prompt', 'orange', 'file', { size: [1.5, 1.5], height: 28, ...extra });
const model = (extra: Partial<SceneNode> = {}) => box('model', 1, 0, 'Model', 'purple', 'cpu', { size: [1.5, 1.5], height: 34, ...extra });
const check = (extra: Partial<SceneNode> = {}) => box('check', 10, 0, 'Validate / vote', 'teal', 'check', { size: [1.3, 1.3], height: 24, ...extra });
const out = (extra: Partial<SceneNode> = {}) => box('out', 17, 0, 'Result', 'green', 'check', { size: [1.2, 1.2], height: 22, ...extra });
const evalset = (extra: Partial<SceneNode> = {}) => db('evals', 1, 9, 'Eval set', { size: [1.2, 1.2], ...extra });

const fmtUSD = (n: number): string => (n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(0)}`);
const fmtN = (n: number): string => (n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);

/** P(more than half of k independent samples are correct), each correct with probability p. */
function majority(k: number, p: number): number {
  let total = 0;
  let c = 1;
  for (let i = 0; i <= k; i++) {
    if (i > 0) c = (c * (k - i + 1)) / i;
    if (i > k / 2) total += c * Math.pow(p, i) * Math.pow(1 - p, k - i);
  }
  return total;
}

const lesson: Lesson = {
  slug: 'academy-prompt-engineering-a-deep-dive',
  title: 'Prompt Engineering: Techniques and Their Cost',
  blurb: 'Clear instructions, examples, reasoning, structured output and sampling several answers — what each buys in accuracy and what each costs in tokens, latency and money, measured with an eval set.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'single', label: 'Single-answer accuracy', icon: 'gauge' },
    { key: 'vote', label: 'Majority-vote accuracy (independent samples)', icon: 'check' },
    { key: 'tok', label: 'Input tokens per call (prompt + examples)', icon: 'file' },
    { key: 'cost', label: 'Daily cost: single → voting', icon: 'activity' },
  ],
  goals: [
    { text: 'Prompts as specifications: instructions, context, format', step: 1 },
    { text: 'Few-shot examples and their token cost', step: 2 },
    { text: 'Reasoning prompts: chain of thought and its trade-offs', step: 3 },
    { text: 'Structured output and validation', step: 4 },
    { text: 'Self-consistency: sample several, take the majority', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'p', label: 'Chance one sampled answer is correct', min: 30, max: 99, step: 1, default: 70, unit: '%', description: 'Per-sample accuracy on your task, measured on an eval set.' },
      { key: 'k', label: 'Samples per question (self-consistency)', min: 1, max: 21, step: 2, default: 5, unit: '', description: 'Independent answers generated; the most common one is taken.' },
      { key: 'ex', label: 'Few-shot examples in the prompt', min: 0, max: 20, step: 1, default: 3, unit: '', description: 'Worked examples included for every call.' },
      { key: 'extok', label: 'Tokens per example', min: 50, max: 2000, step: 10, default: 300, unit: '', description: 'Input + output of one example.' },
      { key: 'base', label: 'Instructions + context', min: 100, max: 20000, step: 100, default: 500, unit: ' tokens', description: 'Everything else in the prompt.' },
      { key: 'outtok', label: 'Output tokens per answer', min: 20, max: 5000, step: 20, default: 400, unit: '', description: 'Includes any reasoning text.' },
      { key: 'req', label: 'Questions per day', min: 1000, max: 10000000, step: 1000, default: 100000, unit: '', description: 'Daily volume.' },
      { key: 'pin', label: 'Input price', min: 0.1, max: 20, step: 0.1, default: 3, unit: ' $/M tok', description: 'Illustrative price per million input tokens.' },
      { key: 'pout', label: 'Output price', min: 0.5, max: 100, step: 0.5, default: 15, unit: ' $/M tok', description: 'Illustrative price per million output tokens.' },
    ],
    calculate: (input, step) => {
      const p = Math.min(0.999, Math.max(0.01, (input.p ?? 70) / 100));
      const k = Math.max(1, Math.round(input.k ?? 5));
      const ex = Math.max(0, Math.round(input.ex ?? 3));
      const extok = Math.max(0, input.extok ?? 300);
      const base = Math.max(0, input.base ?? 500);
      const outtok = Math.max(0, input.outtok ?? 400);
      const req = Math.max(0, input.req ?? 1e5);
      const pin = Math.max(0, input.pin ?? 3);
      const pout = Math.max(0, input.pout ?? 15);
      const inTok = base + ex * extok;
      const one = req * ((inTok * pin) / 1e6 + (outtok * pout) / 1e6);
      const vote = k * one;
      const acc = majority(k % 2 === 0 ? k + 1 : k, p);
      return {
        single: step < 1 ? { v: '—' } : { v: `${(p * 100).toFixed(0)}%` },
        vote: step < 5 ? { v: '—' } : { v: `${(acc * 100).toFixed(1)}% with ${k} samples`, tone: acc > p + 0.1 ? 'good' : 'warn' },
        tok: step < 2 ? { v: '—' } : { v: `${fmtN(inTok)} (${ex} examples × ${extok})`, tone: inTok > 5000 ? 'warn' : 'good' },
        cost: step < 5 ? { v: '—' } : { v: `${fmtUSD(one)} → ${fmtUSD(vote)} (${k}×)`, tone: k > 5 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Spec',
      kind: 'insight',
      title: 'A prompt is a specification',
      body: [
        'A model does what the text in its context makes most likely, so a good prompt reads like a <b>precise brief to a capable colleague who has no other context</b>: the <b>task</b> and its purpose, the <b>audience and constraints</b>, the <b>inputs</b> clearly delimited from the instructions (XML-style tags or fences), what a <b>good answer looks like</b> (format, length, tone), and what to do when information is missing (“say you don’t know”).',
        'Most improvements come from this basic hygiene, not tricks: say what you want rather than what you don’t, give the <i>reason</i> behind a rule, put long documents before the question, and separate instructions from data so injected text in the data isn’t read as a command. Treat the prompt as code: version it, review it and test it.',
      ],
      changes: [{ text: 'Task · context · constraints · format · fallback', tone: 'good' }, { text: 'Delimit data from instructions', tone: 'good' }],
      scene: { nodes: [task(), prompt({ tag: pill('role · task · rules · format', 'list') }), model(), out()], links: [link('task', 'prompt'), link('prompt', 'model'), link('model', 'out')], flows: [flow(['task', 'prompt', 'model', 'out'], { rate: 1.5 })] },
    },
    {
      short: 'Examples',
      kind: 'technique',
      title: 'Few-shot examples: show, don’t only tell',
      body: [
        'A few worked <b>input → output examples</b> pin down format, tone and edge-case handling more reliably than prose — the model infers the pattern. Choose examples that are <b>diverse</b> (cover the variety of real inputs), <b>representative</b> of hard cases, consistently formatted and <i>correct</i> (errors are copied); include a refusal or “unknown” example if that behaviour matters. Dynamic selection retrieves the most similar examples per input.',
        'They aren’t free: examples are input tokens on <b>every</b> call. Three examples at 300 tokens each add 900 tokens, taking the prompt from 500 to 1,400 — 2.8× the input cost and extra latency. Prompt caching (see the Context Engineering lesson) makes a stable example block cheap, and fine-tuning can fold many examples into the weights when volume justifies it.',
      ],
      changes: [{ text: 'Diverse, correct, consistently formatted examples', tone: 'good' }, { text: '3 × 300 tokens → input 500 → 1,400 per call', tone: 'info' }],
      scene: { nodes: [prompt({ tag: pill('+ 3 examples (900 tokens)', 'layers') }), model(), out({ tag: pill('matches the format', 'check', 'good') })], links: [link('prompt', 'model'), link('model', 'out')], flows: [flow(['prompt', 'model', 'out'], { rate: 1.5 })] },
    },
    {
      short: 'Reasoning',
      kind: 'technique',
      title: 'Reasoning prompts: let it think first',
      body: [
        'Asking for <b>step-by-step reasoning</b> before the answer (<b>chain of thought</b>) improves accuracy on arithmetic, logic, multi-step and planning problems: the intermediate text is computation the model can’t do in a single forward pass. Put the reasoning <i>before</i> the final answer, and ask for the answer in a clearly marked field so it can be parsed.',
        'The cost is output tokens and latency — reasoning can multiply output length several-fold, and output tokens are priced higher and generated sequentially (see the LLM Inference lesson). Dedicated <b>reasoning models</b> do this internally, so explicit “think step by step” prompting matters less for them and can even hurt. Use reasoning where the task needs it, not as a default for extraction or classification.',
      ],
      changes: [{ text: 'Reasoning before the answer, answer in a marked field', tone: 'good' }, { text: 'Costs output tokens and latency', tone: 'bad' }],
      scene: { nodes: [prompt({ tag: pill('think, then answer: …', 'list') }), model({ tag: pill('reasoning tokens', 'refresh') }), out({ tag: pill('final: 42', 'check', 'good') })], links: [link('prompt', 'model'), link('model', 'out')], flows: [flow(['prompt', 'model', 'out'], { rate: 1.2 })] },
    },
    {
      short: 'Structure',
      kind: 'technique',
      title: 'Structured output and validation',
      body: [
        'Programs need machine-readable results. Specify a <b>schema</b> (JSON fields, types, enums) and give an example; where available use the provider’s <b>structured-output / constrained decoding</b> feature, which guarantees syntactically valid output by restricting the tokens the model may produce. Prefilling the start of the response (<code>{</code>) and stop sequences also help.',
        '<b>Validate and repair</b>: parse, check against the schema and business rules, and on failure retry with the error message (“field <i>date</i> must be ISO-8601”) — usually one retry fixes it. Syntax being valid does <i>not</i> make the content correct, so validate meaning too (does the cited quote exist in the source? does the total match the line items?).',
      ],
      changes: [{ text: 'Schema + constrained decoding → valid syntax', tone: 'good' }, { text: 'Validate content, retry with the error', tone: 'good' }],
      scene: { nodes: [prompt({ tag: pill('JSON schema', 'hash') }), model({ tag: pill('constrained decoding', 'lock') }), check({ tag: pill('parse · validate · retry', 'check', 'good') }), out()], links: [link('prompt', 'model'), link('model', 'check'), link('check', 'out')], flows: [flow(['prompt', 'model', 'check', 'out'], { rate: 1.5 })] },
    },
    {
      short: 'Voting',
      kind: 'technique',
      title: 'Self-consistency: sample several, take the majority',
      body: [
        'A single sampled answer may be wrong by chance. Sample <b>k independent answers</b> at a temperature above zero and take the <b>most common final answer</b>. If each sample is right with probability p and errors were independent, the chance the majority is right is a binomial tail: <b>70% per sample becomes ~84% with 5 samples</b> and ~92% with 11 — a large gain for tasks with a checkable, single answer (math, classification, extraction).',
        'Two honest caveats. <b>Cost scales linearly</b>: 5 samples cost 5× — at 100,000 questions a day, about $1,000 → $5,100. And errors are <b>correlated</b> (the same misunderstanding repeats), so real gains are smaller than the independent-sample figure; they vanish if the model is systematically wrong. Use voting for high-value decisions, a cheap verifier (a rule, a test, a second model) where possible, and measure the actual gain on your eval set.',
      ],
      changes: [{ text: '70% → ~84% with 5 samples if independent', tone: 'good' }, { text: 'Cost × k; errors are correlated so gains are lower', tone: 'bad' }],
      concepts: [{ term: 'Self-consistency', def: 'Sampling multiple reasoning paths and selecting the answer that appears most often, improving accuracy at k times the cost.' }],
      scene: { nodes: [prompt(), model({ tag: pill('5 samples', 'layers') }), check({ tag: pill('majority → answer', 'check', 'good') }), out()], links: [link('prompt', 'model'), link('model', 'check'), link('check', 'out')], flows: [flow(['prompt', 'model', 'check', 'out'], { rate: 2 })] },
    },
    {
      short: 'Evals',
      kind: 'technique',
      title: 'Iterate against an eval set, not by intuition',
      body: [
        'Prompt changes that “feel better” often regress other cases. Build an <b>eval set</b> of real inputs with expected outputs or a rubric (see the Evals lesson), measure every change, and watch the <b>error bars</b> — on 300 cases a 3-point difference is noise. Change one thing at a time; keep a prompt changelog; read failure cases rather than only scores — they tell you whether the problem is missing information, ambiguity, the format, or the model’s limit.',
        'Know the ceiling of the technique: prompting shapes how a model uses what it already knows. For missing knowledge use retrieval; for consistent style at scale consider fine-tuning; for actions use tools. Re-test prompts when the model version changes — behaviour shifts. Figures here are model arithmetic (independent-sample voting, illustrative prices).',
      ],
      changes: [{ text: 'Measure with error bars; one change at a time', tone: 'good' }, { text: 'Re-run evals on every model upgrade', tone: 'good' }],
      scene: { nodes: [prompt({ tag: pill('v14', 'hash') }), model(), evalset({ tag: pill('score every change', 'gauge') })], links: [link('prompt', 'model'), link('model', 'evals', { style: 'dashed' })], flows: [flow(['prompt', 'model', 'evals'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Clear specs first; pay for each technique knowingly',
      body: [
        'Start with a <b>clear specification</b>; add <b>examples</b> for format and edge cases (tokens on every call), <b>reasoning</b> for multi-step tasks (output tokens and latency), <b>structured output with validation</b> for programs, and <b>self-consistency</b> where a wrong answer is costly (k× cost, correlated errors).',
        'Decide each addition with an eval set and error bars, and revisit when models change.',
      ],
      scene: { nodes: [task(), prompt(), model(), check(), out()], links: [link('task', 'prompt'), link('prompt', 'model'), link('model', 'check'), link('check', 'out')], flows: [flow(['task', 'prompt', 'model', 'check', 'out'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
