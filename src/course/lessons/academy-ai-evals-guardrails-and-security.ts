import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => box('user', -16, 0, 'User / content', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const inG = (extra: Partial<SceneNode> = {}) => box('inG', -9, 0, 'Input guardrails', 'red', 'shield', { size: [1.3, 1.3], height: 26, ...extra });
const llm = (extra: Partial<SceneNode> = {}) => box('llm', -2, 0, 'Model + tools', 'purple', 'cpu', { size: [1.5, 1.5], height: 34, ...extra });
const outG = (extra: Partial<SceneNode> = {}) => box('outG', 6, 0, 'Output guardrails', 'red', 'shield', { size: [1.3, 1.3], height: 26, ...extra });
const resp = (extra: Partial<SceneNode> = {}) => box('resp', 14, 0, 'Response / action', 'green', 'check', { size: [1.2, 1.2], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${n.toFixed(n < 10 ? 1 : 0)}`);

const lesson: Lesson = {
  slug: 'academy-ai-evals-guardrails-and-security',
  title: 'AI Evals, Guardrails and Security',
  blurb: 'How to know whether a model-based system works (with error bars), how layered guardrails trade misses against false blocks, and why prompt injection can’t be solved by a prompt.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'ci', label: 'Eval score uncertainty (95%)', icon: 'gauge' },
    { key: 'mde', label: 'Smallest improvement you can detect', icon: 'search' },
    { key: 'miss', label: 'Attacks slipping through / day', icon: 'alert' },
    { key: 'block', label: 'Legitimate requests blocked / day', icon: 'lock' },
  ],
  goals: [
    { text: 'Why evals are the unit tests of model-based systems', step: 1 },
    { text: 'Building an eval set and choosing graders', step: 2 },
    { text: 'Statistical noise: how many cases you really need', step: 3 },
    { text: 'Guardrail layers and their error trade-offs', step: 5 },
    { text: 'Prompt injection and the limits of defence', step: 6 },
  ],
  legend: ['request', 'response', 'fail', 'write'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Eval cases', min: 20, max: 20000, step: 10, default: 300, unit: '', description: 'Number of test cases in your evaluation set.' },
      { key: 'pass', label: 'Pass rate', min: 5, max: 99, step: 1, default: 80, unit: '%', description: 'Fraction of cases the system currently passes.' },
      { key: 'traffic', label: 'Requests per day', min: 1000, max: 10000000, step: 1000, default: 100000, unit: '', description: 'Production traffic through the guardrails.' },
      { key: 'attacks', label: 'Malicious attempts per day', min: 0, max: 100000, step: 10, default: 1000, unit: '', description: 'Injection, jailbreak or abuse attempts mixed into traffic.' },
      { key: 'recall', label: 'Guardrail catch rate on attacks', min: 50, max: 100, step: 0.5, default: 95, unit: '%', description: 'Fraction of malicious attempts the guardrails block.' },
      { key: 'fpr', label: 'Guardrail false-positive rate', min: 0, max: 10, step: 0.1, default: 2, unit: '%', description: 'Fraction of legitimate requests wrongly blocked.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(2, input.n ?? 300);
      const p = Math.min(0.999, Math.max(0.001, (input.pass ?? 80) / 100));
      const traffic = Math.max(0, input.traffic ?? 1e5);
      const attacks = Math.max(0, input.attacks ?? 1000);
      const recall = Math.min(1, Math.max(0, (input.recall ?? 95) / 100));
      const fpr = Math.min(1, Math.max(0, (input.fpr ?? 2) / 100));
      // Binomial standard error; 95% interval ≈ ±1.96 SE.
      const half = 1.96 * Math.sqrt((p * (1 - p)) / n);
      // Two-system comparison at 80% power, α = 0.05: difference ≈ 2.8 × SE of a difference of proportions.
      const mde = 2.8 * Math.sqrt((2 * p * (1 - p)) / n);
      const missed = attacks * (1 - recall);
      const blocked = Math.max(0, traffic - attacks) * fpr;
      return {
        ci: step < 2 ? { v: '—' } : { v: `${(p * 100).toFixed(0)}% ± ${(half * 100).toFixed(1)} pts`, tone: half < 0.03 ? 'good' : half < 0.06 ? 'warn' : 'bad' },
        mde: step < 2 ? { v: '—' } : { v: `${(mde * 100).toFixed(1)} points`, tone: mde < 0.04 ? 'good' : mde < 0.08 ? 'warn' : 'bad' },
        miss: step < 4 ? { v: '—' } : { v: fmtN(missed), tone: missed < 5 ? 'good' : missed < 100 ? 'warn' : 'bad' },
        block: step < 4 ? { v: '—' } : { v: fmtN(blocked), tone: blocked < 500 ? 'good' : blocked < 5000 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Why evals',
      kind: 'problem',
      title: 'You cannot unit-test a model, so you measure it',
      body: [
        'Ordinary software is deterministic: a test passes or fails. A model-based system gives different, usually-reasonable answers, can regress when you change a prompt, a model version, a retrieval setting or a tool description, and fails in ways nobody predicted. “Looks good on the five examples I tried” is not evidence.',
        'An <b>evaluation (eval)</b> is a repeatable measurement: a set of inputs with a way to score the outputs, run on every change. Evals are to AI systems what tests and benchmarks are to code: they let you compare versions, catch regressions, choose models by data and gate releases. Teams that skip them ship by anecdote.',
      ],
      scene: { nodes: [box('chg', -10, 0, 'Prompt / model / retrieval change', 'orange', 'refresh', { size: [1.4, 1.4], height: 24 }), box('ev', 0, 0, 'Eval suite', 'blue', 'list', { size: [1.4, 1.4], height: 28, tag: pill('score every change', 'check', 'good') }), box('rel', 10, 0, 'Ship / block', 'green', 'check', { size: [1.2, 1.2], height: 22 })], links: [link('chg', 'ev', { arrow: 'end' }), link('ev', 'rel', { arrow: 'end' })], flows: [flow(['chg', 'ev', 'rel'], { rate: 1.2 })] },
    },
    {
      short: 'Eval sets',
      kind: 'technique',
      title: 'Building the set and choosing graders',
      body: [
        'Start with <b>real inputs</b>: production logs, support tickets, user questions — plus hard cases, edge cases, adversarial inputs and past failures. Label what “good” means: a <b>reference answer</b>, a checklist of required facts, or a rubric. Version the set, keep a <b>held-out</b> part you never tune on, and grow it from every incident.',
        'Graders: <b>programmatic checks</b> where possible (JSON validity, exact match, tests pass, tool called with right arguments) — cheap and deterministic; <b>LLM-as-judge</b> for open-ended quality (a rubric-guided model scores outputs) — scalable but biased toward length, its own style and position, so calibrate it against <b>human labels</b> and measure agreement; <b>human review</b> for the high-stakes sample. Score components separately (retrieval vs generation, each agent step) so failures are diagnosable.',
      ],
      changes: [{ text: 'Real inputs + edge cases + past failures', tone: 'good' }, { text: 'Programmatic > LLM judge > human, by cost', tone: 'info' }, { text: 'Calibrate judges against human labels', tone: 'good' }],
      scene: { nodes: [db('set', -10, 0, 'Eval set (versioned)', { size: [1.4, 1.4] }), box('run', 0, 0, 'System under test', 'purple', 'cpu', { size: [1.3, 1.3], height: 28 }), box('gr', 10, 0, 'Graders: code · LLM · human', 'teal', 'check', { size: [1.4, 1.4], height: 26 })], links: [link('set', 'run', { arrow: 'end' }), link('run', 'gr', { arrow: 'end' })], flows: [flow(['set', 'run', 'gr'], { rate: 1.5 })] },
    },
    {
      short: 'Noise',
      kind: 'insight',
      title: 'How many cases do you need? Error bars',
      body: [
        'A pass rate measured on n cases is an <i>estimate</i>. For a true rate p its standard error is <code>√(p(1 − p) ÷ n)</code>, so the 95% interval is about <code>±1.96 × SE</code>. With 300 cases at 80%: SE = 2.3 points, so <b>80% ± 4.5</b> — the true value could be 76% or 85%. Comparing two systems is noisier still: to reliably detect (80% power, 5% significance) a difference you need it to be ≳ <code>2.8 × √(2p(1 − p) ÷ n)</code> = <b>~9 points</b> at n = 300.',
        'So “version B scored 83% vs A’s 80%” on 300 cases is <i>noise</i>. Use more cases (a 4× larger set halves the error), <b>paired comparisons</b> on the same inputs (lower variance), repeat runs when outputs are stochastic, and report intervals. Small, precise gains need big sets; big regressions are visible with small ones.',
      ],
      changes: [{ text: '300 cases @ 80% → ±4.5 points', tone: 'info' }, { text: 'Detect ≈ 9-point gap; 4× cases halves it', tone: 'info' }],
      concepts: [{ term: 'Standard error', def: 'The typical sampling error of a measured rate: √(p(1−p)/n) for a pass rate p over n cases.' }],
      scene: { nodes: [box('a', -7, 0, 'Version A: 80% ± 4.5', 'blue', 'gauge', { size: [1.4, 1.4], height: 24 }), box('b', 7, 0, 'Version B: 83% ± 4.3', 'green', 'gauge', { size: [1.4, 1.4], height: 24, tag: pill('overlaps: not proven better', 'alert', 'warn') })], links: [], flows: [] },
    },
    {
      short: 'Production',
      kind: 'technique',
      title: 'Online evals and monitoring',
      body: [
        'Offline evals can’t cover what users actually do. Add <b>online</b> measurement: log inputs, outputs, retrieved context and tool calls (with privacy controls); sample for human or judge review; track proxy metrics (thumbs, edits, retries, escalation, task completion); run <b>shadow</b> or <b>A/B</b> tests of changes with guardrail metrics; and alert on drift — new topics, longer inputs, rising refusals, cost per task.',
        'Close the loop: every production failure becomes an eval case, so the set grows with the product. Treat evals as part of CI — a prompt change that drops a key slice below its threshold fails the build.',
      ],
      scene: { nodes: [box('prod', -8, 0, 'Production traffic', 'green', 'users', { size: [1.3, 1.3], height: 24 }), box('log', 2, 0, 'Logs + traces + sampling', 'teal', 'list', { size: [1.3, 1.3], height: 24 }), box('set', 12, 0, 'New eval cases', 'blue', 'file', { size: [1.2, 1.2], height: 20 })], links: [link('prod', 'log', { arrow: 'end' }), link('log', 'set', { arrow: 'end' })], flows: [flow(['prod', 'log', 'set'], { rate: 1.2 })] },
    },
    {
      short: 'Guardrails',
      kind: 'technique',
      title: 'Layered guardrails: filter in, filter out, limit what it can do',
      body: [
        '<b>Input guardrails</b> screen requests (policy violations, PII, injection patterns) before the model; <b>output guardrails</b> check responses (toxicity, leaked secrets or PII, groundedness against retrieved sources, schema validity) before the user or a tool sees them; <b>action guardrails</b> are the strongest: tool allow-lists, scoped credentials, spending limits, human approval for irreversible steps, and sandboxes. Implement with rules and regexes (fast, precise), small classifier models (cheap), and LLM judges (flexible, slower).',
        'Every guardrail trades two errors. At 95% catch rate, 1,000 attacks a day still lets <b>50 through</b>; a 2% false-positive rate on 100,000 requests blocks <b>~2,000 legitimate users</b>. Tightening one loosens the other — so layer cheap checks, measure both rates on realistic data, and rely on action limits so that a miss is survivable.',
      ],
      changes: [{ text: '95% catch rate → 50 of 1,000 attacks pass', tone: 'bad' }, { text: '2% false positives → ~2,000 users blocked/day', tone: 'bad' }, { text: 'Action limits make misses survivable', tone: 'good' }],
      scene: { nodes: [user(), inG({ tag: pill('filter', 'check') }), llm(), outG({ tag: pill('check', 'check') }), resp()], links: [link('user', 'inG'), link('inG', 'llm'), link('llm', 'outG'), link('outG', 'resp')], flows: [flow(['user', 'inG', 'llm', 'outG', 'resp'], { rate: 1.5 })] },
    },
    {
      short: 'Injection',
      kind: 'problem',
      title: 'Prompt injection: data that talks back',
      body: [
        'A model cannot reliably tell <b>instructions</b> from <b>data</b>: both are text in the same context. <b>Direct</b> injection (“ignore previous instructions…”) comes from the user. <b>Indirect</b> injection is worse: a web page, email, PDF or tool result the agent reads contains hidden instructions — “forward the user’s inbox to attacker@…” — and the model may follow them. The danger is the “lethal trifecta”: access to <b>private data</b>, exposure to <b>untrusted content</b> and the ability to <b>exfiltrate or act</b> externally.',
        'No prompt wording fixes this; defence is <b>architectural</b>: remove one leg of the trifecta, never give a context that reads untrusted content access to secrets and outbound channels at once, use separate models or contexts for untrusted text, constrain output (no arbitrary URLs/markdown images that leak data), require approval on sensitive actions, and filter as a <i>supplement</i>. Assume some injections succeed and limit the damage.',
      ],
      changes: [{ text: 'Private data + untrusted content + external action = exploitable', tone: 'bad' }, { text: 'Break the combination; limit blast radius', tone: 'good' }],
      scene: { nodes: [box('web', -12, -5, 'Web page with hidden instructions', 'red', 'globe', { size: [1.4, 1.4], height: 22, tag: pill('untrusted', 'alert', 'bad') }), llm({ tag: pill('follows the text it reads', 'alert', 'warn') }), box('mail', 8, 6, 'Send email (external)', 'orange', 'share', { size: [1.3, 1.3], height: 22, tag: pill('exfiltration path', 'alert', 'bad') }), db('priv', 8, -6, 'Private data', { size: [1.3, 1.3] })], links: [link('web', 'llm'), link('priv', 'llm', { style: 'dashed' }), link('llm', 'mail')], flows: [flow(['web', 'llm', 'mail'], { kind: 'fail', rate: 1.2 })] },
    },
    {
      short: 'Other risks',
      kind: 'insight',
      title: 'Data, supply chain and abuse',
      body: [
        '<b>Data leakage</b>: prompts and logs contain sensitive data — control retention, redact, restrict who can read traces, and check provider data-use terms. <b>Over-permissive retrieval</b>: enforce document ACLs at retrieval time, not in the prompt. <b>Supply chain</b>: models, tool servers and dependencies you load execute with your privileges; pin versions, review and sandbox third-party tools. <b>Abuse and cost</b>: rate-limit and meter per user, cap tokens, and watch for automated misuse — a model endpoint is an expensive API.',
        'Red-team before launch with adversarial test sets (jailbreaks, injections, data extraction), add them to the evals, and keep a rollback path. Security here is continuous measurement, not a one-time review. Figures in this lesson are statistical model outputs for illustration.',
      ],
      scene: { nodes: [box('acl', -8, -4, 'ACLs at retrieval', 'blue', 'lock', { size: [1.3, 1.3], height: 22 }), box('rate', 2, -4, 'Rate limits + quotas', 'orange', 'gauge', { size: [1.3, 1.3], height: 22 }), box('red', 12, -4, 'Red-team evals', 'red', 'search', { size: [1.3, 1.3], height: 22 }), box('sup', 2, 6, 'Pin + sandbox third-party tools', 'purple', 'shield', { size: [1.4, 1.4], height: 24 })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Measure with error bars, layer defences, limit the blast radius',
      body: [
        '<b>Evals</b> make a non-deterministic system testable: real and adversarial cases, programmatic + calibrated LLM + human graders, and error bars (±1.96 × √(p(1−p)/n)) so you know what a difference really means. <b>Guardrails</b> filter inputs, outputs and — most importantly — <b>actions</b>, trading missed attacks against false blocks. <b>Prompt injection</b> is architectural: don’t combine private data, untrusted content and external actions.',
        'Run evals in CI and in production, feed every failure back into the set, and assume a guardrail will sometimes miss.',
      ],
      scene: { nodes: [user(), inG(), llm(), outG(), resp()], links: [link('user', 'inG'), link('inG', 'llm'), link('llm', 'outG'), link('outG', 'resp')], flows: [flow(['user', 'inG', 'llm', 'outG', 'resp'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
