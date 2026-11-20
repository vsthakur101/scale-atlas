import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const agent = (extra: Partial<SceneNode> = {}) => box('agent', -17, 0, 'Agent loop (plan → act → observe)', 'purple', 'sparkle', { size: [1.7, 1.7], height: 30, ...extra });
const tools = (extra: Partial<SceneNode> = {}) => box('tools', -6, -8, 'Tools / APIs (flaky, rate-limited)', 'orange', 'bolt', { size: [1.5, 1.5], height: 24, ...extra });
const llm = (extra: Partial<SceneNode> = {}) => box('llm', -6, 8, 'Model calls (timeouts, bad output)', 'blue', 'cpu', { size: [1.5, 1.5], height: 24, ...extra });
const journal = (extra: Partial<SceneNode> = {}) => disk('journal', 6, 0, 'Durable journal: completed steps + results', { size: [3.2, 1.3], height: 14, tone: 'yellow', icon: 'list', ...extra });
const resume = (extra: Partial<SceneNode> = {}) => box('resume', 16, -5, 'Restart: replay journal, skip done steps', 'green', 'refresh', { size: [1.6, 1.6], height: 26, ...extra });
const state = (extra: Partial<SceneNode> = {}) => db('state', 16, 7, 'Workflow state (plan, memory, budget)', { size: [1.4, 1.4], ...extra });

const fmtN = (n: number): string => (n >= 1e12 ? `${n.toExponential(1)}` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtD = (n: number): string => (n >= 1e9 ? `$${n.toExponential(1)}` : n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(2)}`);
const fmtT = (s: number): string => (s >= 86400 ? `${(s / 86400).toFixed(1)} days` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);

const lesson: Lesson = {
  slug: 'academy-how-to-build-ai-agents-that-don-t-start-over-when-they-fail',
  title: 'Durable Agents: Checkpoints, Replay and the Arithmetic of Restarting',
  blurb: 'Long agent runs chain dozens of fallible steps. Restarting from scratch on any failure wastes exponentially more work as runs get longer; journaling each completed step makes the cost linear. The maths, and the engineering — idempotent tools, error classes, human pauses.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'ok', label: 'Chance a run finishes with no failure at all', icon: 'check' },
    { key: 'restart', label: 'Expected step executions: restart from scratch', icon: 'refresh' },
    { key: 'chk', label: 'Expected step executions: resume from checkpoints', icon: 'list' },
    { key: 'waste', label: 'Extra cost and time from restarting', icon: 'dollar' },
  ],
  goals: [
    { text: 'Why long agent runs fail midway', step: 1 },
    { text: 'The arithmetic: (1/s)ⁿ blow-up vs n/s', step: 2 },
    { text: 'Durable execution: a journal and deterministic replay', step: 3 },
    { text: 'Idempotent tools and the right retry policy', step: 4 },
    { text: 'Long waits, budgets and observability', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Steps in the run', min: 1, max: 200, step: 1, default: 30, unit: '', description: 'Sequential model calls and tool calls.' },
      { key: 'p', label: 'Failure chance per step', min: 0.1, max: 30, step: 0.1, default: 2, unit: '%', description: 'Timeouts, rate limits, malformed output, tool errors.' },
      { key: 'c', label: 'Cost per step', min: 0.001, max: 5, step: 0.001, default: 0.05, unit: ' $', description: 'Model tokens and tool fees.' },
      { key: 's', label: 'Time per step', min: 1, max: 600, step: 1, default: 20, unit: ' s', description: 'Wall-clock for one step.' },
      { key: 'ov', label: 'Checkpoint overhead per step', min: 0, max: 5, step: 0.1, default: 0.2, unit: '%', description: 'Extra cost/time to journal each result.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, Math.round(input.n ?? 30));
      const p = Math.min(0.5, Math.max(0.0005, (input.p ?? 2) / 100));
      const c = Math.max(0, input.c ?? 0.05);
      const s = Math.max(0.1, input.s ?? 20);
      const ov = Math.max(0, (input.ov ?? 0.2) / 100);
      const ok = 1 - p;
      const survive = Math.pow(ok, n);
      // Restart from scratch on any failure: expected steps = (1/p)((1/s)^n − 1).
      const restart = (Math.pow(1 / ok, n) - 1) / p;
      // Resume from the last completed step: each step is retried until it succeeds.
      const chk = n / ok;
      const costR = restart * c;
      const costC = chk * c * (1 + ov);
      const timeR = restart * s;
      const timeC = chk * s * (1 + ov);
      return {
        ok: step < 2 ? { v: '—' } : { v: `${(survive * 100).toFixed(1)}% ((1 − ${(p * 100).toFixed(1)}%)^${n})`, tone: survive > 0.9 ? 'good' : survive > 0.5 ? 'warn' : 'bad' },
        restart: step < 2 ? { v: '—' } : { v: `${fmtN(restart)} steps (${(restart / n).toFixed(1)}× the work)`, tone: restart / n < 1.5 ? 'good' : restart / n < 5 ? 'warn' : 'bad' },
        chk: step < 3 ? { v: '—' } : { v: `${fmtN(chk)} steps (${(chk / n).toFixed(2)}× the work)`, tone: 'good' },
        waste: step < 3 ? { v: '—' } : { v: `${fmtD(costR)} / ${fmtT(timeR)} vs ${fmtD(costC)} / ${fmtT(timeC)}`, tone: costR > costC * 1.5 ? 'bad' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Fails',
      kind: 'problem',
      title: 'Long agent runs are long chains of fallible steps',
      body: [
        'An autonomous agent researching a topic, migrating a codebase or processing a batch of documents makes dozens to hundreds of sequential calls: model inference, web fetches, API calls, file operations (see the Agents lessons). Each can fail for ordinary reasons: provider <b>rate limits</b> and 5xx errors, <b>timeouts</b>, truncated or <b>malformed model output</b> (invalid JSON, a tool call with bad arguments), a tool returning an unexpected shape, a context window overflow, a container evicted mid-run, a deploy restarting the worker. Even if each step fails only 2% of the time, long runs hit one.',
        'The naive design keeps the agent’s state in the worker’s memory, so any failure means the run <b>starts over</b> — repeating work that was already done, re-paying the tokens, repeating side effects (emails already sent, tickets already filed) and losing intermediate findings. The longer the task, the worse it gets, and the failure is <b>exponential</b> in run length — quantified next.',
      ],
      scene: { nodes: [agent({ tag: pill('step 17 of 30 …', 'activity') }), tools({ tag: pill('429 rate limit', 'alert', 'warn') }), llm({ tag: pill('invalid JSON', 'alert', 'warn') })], links: [link('agent', 'tools'), link('agent', 'llm')], flows: [flow(['agent', 'tools'], { kind: 'fail', rate: 1.2 }), flow(['agent', 'llm'], { rate: 1.2, back: true })] },
    },
    {
      short: 'Maths',
      kind: 'insight',
      title: 'Restarting costs (1/s)ⁿ; resuming costs n/s',
      body: [
        'Let each step succeed with probability <i>s</i> = 98% (fail 2%) and a run have <i>n</i> = 30 steps. The chance of a <b>clean run</b> is <i>sⁿ</i> = 0.98³⁰ = <b>54.5%</b> — nearly half of all runs hit at least one failure. If a failure means <b>restart from step 1</b>, the expected number of step executions to complete is <code>(1/p)·((1/s)ⁿ − 1)</code> = 50 × (1.833 − 1) = <b>41.7 steps</b>: 1.39× the necessary 30. If a failure only means <b>retry that step</b> (resume from the last checkpoint), each step takes on average 1/s attempts: <code>n/s</code> = <b>30.6 steps</b>, 1.02×.',
        'The gap grows <i>exponentially</i> with length and failure rate. For n = 50 and p = 5%: clean-run chance 7.7%, restart-from-scratch costs <code>(1/0.05)(13.0 − 1)</code> = <b>240 steps</b>, while checkpointing costs 52.6 — <b>4.6× more</b> (a $12 run becomes $55 and a 17-minute run takes 80 minutes). At n = 100, p = 5%, restarting needs ~3,400 steps vs 105. Per-step failure rates you can tolerate in a short demo are fatal in production-length tasks — which is why reliability, not capability, often limits agent deployments. (Retries add to the 1/s attempts: with exponential backoff the added time is small, and a step that keeps failing needs an escalation path, below.)',
      ],
      changes: [{ text: 'n = 30, 2%/step: 54.5% clean; restart 41.7 steps vs resume 30.6', tone: 'info' }, { text: 'n = 50, 5%/step: restart 240 steps vs 52.6 (4.6×)', tone: 'bad' }, { text: 'The restart penalty is exponential in run length', tone: 'bad' }],
      concepts: [{ term: 'Checkpoint / resume', def: 'Persisting each completed step’s result so that after a failure the run continues from the last success instead of repeating earlier work.' }],
      scene: { nodes: [agent({ tag: pill('fail at step 28 → restart', 'alert', 'bad') }), llm({ tag: pill('41.7 steps expected', 'timer', 'warn') }), journal({ tag: pill('resume: 30.6 steps', 'check', 'good') })], links: [link('agent', 'llm'), link('agent', 'journal', { style: 'dashed' })], flows: [flow(['agent', 'llm'], { kind: 'heavy', rate: 2.4 })] },
    },
    {
      short: 'Journal',
      kind: 'technique',
      title: 'Durable execution: journal every step, replay on restart',
      body: [
        'The standard pattern is <b>durable execution</b> (Temporal, AWS Step Functions, Azure Durable Functions, Inngest, Restate, DBOS; or hand-rolled on a database). The orchestrating code runs normally, but every <b>side-effecting step</b> — a model call, a tool call — is executed through the runtime, which <b>appends its result to a durable journal</b> (event history) <i>before</i> the code proceeds. If the process dies, a new worker <b>replays</b> the function from the top: for each step already in the journal the runtime returns the <b>recorded result instead of executing again</b>, and real execution resumes at the first step with no entry. Workflow code must be <b>deterministic</b> (no raw clock, random or network calls outside steps) so replay reaches the same decisions.',
        'For agents the journal carries the whole <b>reasoning trace</b>: the plan, each model response and tool result, accumulated memory, and spent budget. A simpler version suits many apps: a <b>state machine in a database row</b> — <code>{ step: 17, plan, results, tokens_used }</code> — updated transactionally after each step, with a worker that loads the row, executes the next step and writes back. Either way, checkpointing costs a small write per step (0.2% overhead here) for <b>linear</b> instead of exponential recovery cost, plus bonuses: any worker can resume the run, you can <b>inspect</b> where it is, replay a failed run with a fixed prompt, and branch from a checkpoint to debug.',
      ],
      changes: [{ text: 'Journal each step’s result before moving on; replay skips completed steps', tone: 'good' }, { text: 'Workflow code deterministic; side effects only inside steps', tone: 'info' }, { text: 'Or a state row updated transactionally per step', tone: 'good' }],
      scene: { nodes: [agent({ tag: pill('replay from top', 'refresh') }), journal({ tag: pill('steps 1–16: recorded', 'check', 'good') }), resume({ tag: pill('16 skipped · 17 runs live', 'bolt', 'good') }), tools()], links: [link('agent', 'journal'), link('journal', 'resume'), link('resume', 'tools')], flows: [flow(['agent', 'journal', 'resume', 'tools'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Idempotent',
      kind: 'technique',
      title: 'Idempotent tools and the right retry policy',
      body: [
        'Checkpointing has a gap: a worker can crash <b>after a tool succeeded but before its result was journaled</b>, so the replay re-runs that step — a second email, a duplicate charge, a second pull request. The standard answer is <b>idempotency</b> (see that lesson): give every tool call a stable <b>idempotency key</b> derived from the run id and step number, pass it to APIs that support it, and make your own tools “check, then act” (create-or-get, upsert, conditional writes). Where the downstream can’t dedupe, record <b>intent</b> in the journal before acting and reconcile on restart. Classify tools by side-effect risk: reads are safe to retry; writes need keys; irreversible actions (sending money, deleting data) need <b>human approval</b> and exactly-once discipline.',
        '<b>Not every failure is the same</b>: <i>transient</i> (timeout, 429, 503) → retry with exponential backoff and jitter, honouring <code>Retry-After</code>; <i>model output errors</i> (invalid JSON, schema violation) → retry with the validation error appended to the prompt, a bounded number of times, possibly escalating to a stronger model; <i>permanent</i> (401, 404, policy refusal) → don’t retry: fail the step, let the agent re-plan, or park the run for a human. Put <b>attempt caps and a global budget</b> (steps, tokens, dollars, wall-clock) on every run so a loop can’t burn money, and use circuit breakers on failing dependencies (see the Resiliency lesson).',
      ],
      changes: [{ text: 'Stable idempotency key per run+step; check-then-act tools', tone: 'good' }, { text: 'Transient → backoff · output error → retry with feedback · permanent → re-plan/escalate', tone: 'good' }, { text: 'Irreversible actions need approval; every run has a budget', tone: 'info' }],
      scene: { nodes: [agent(), tools({ tag: pill('key: run42-step17', 'key', 'good') }), llm({ tag: pill('retry with validation error', 'refresh') }), journal()], links: [link('agent', 'tools'), link('agent', 'llm'), link('tools', 'journal'), link('llm', 'journal')], flows: [flow(['agent', 'tools', 'journal'], { kind: 'write', rate: 1.4 }), flow(['agent', 'llm', 'journal'], { rate: 1.2 })] },
    },
    {
      short: 'Long waits',
      kind: 'tradeoff',
      title: 'Long waits, budgets and observability',
      body: [
        'A durable run can <b>sleep</b> for hours or days without holding a process: waiting for a <b>human approval</b>, a webhook, a scheduled time or a long job. The runtime persists the state, frees the worker and wakes the run on the event — which is what makes human-in-the-loop agents practical (the agent proposes, a person approves in Slack, the run resumes with the answer). Keep the <b>context</b> in the journal compact: store the full trace for audit but feed the model a <b>summary or selected memory</b> so resumed runs don’t overflow the context window (see the Context Engineering lesson), and version prompts and tools so a resumed old run behaves consistently or is migrated explicitly.',
        '<b>Observe it like a distributed system</b>: trace every step (latency, tokens, retries, error class), alert on <b>stuck runs</b> (no progress for N minutes), <b>retry storms</b> and budget exhaustion, and report <b>completion rate</b> and <b>cost per completed task</b> as product metrics — they expose reliability problems that capability benchmarks hide. Design for <b>partial results</b> (return what was found with a clear “incomplete” marker) and for cancellation. Costs of durability: extra storage and latency per step, constraints on determinism, and a runtime to operate. For 2-step chatbot turns, don’t bother; for 30-step tasks, the arithmetic above says you can’t afford not to. All figures are model outputs for the stated failure rates and step costs.',
      ],
      changes: [{ text: 'Sleep durably for approvals, webhooks and timers', tone: 'good' }, { text: 'Compact context from the journal; version prompts and tools', tone: 'info' }, { text: 'Track completion rate, cost per completed task, stuck runs, retry storms', tone: 'good' }],
      scene: { nodes: [agent({ tag: pill('waiting for approval (2 days)', 'clock') }), journal(), state({ tag: pill('plan · memory · budget', 'list') }), resume({ tag: pill('webhook → resume', 'bolt', 'good') })], links: [link('agent', 'journal'), link('journal', 'state'), link('journal', 'resume')], flows: [flow(['agent', 'journal', 'state'], { kind: 'write', rate: 1.2 }), flow(['journal', 'resume'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Persist progress; retry steps, not runs',
      body: [
        'With per-step failure <i>p</i> and <i>n</i> steps, a clean run succeeds with (1 − p)ⁿ; <b>restart-from-scratch</b> costs ~(1/p)((1/s)ⁿ − 1) steps (41.7 for 30 steps at 2%, 240 for 50 at 5%) while <b>resume-from-checkpoint</b> costs n/s (30.6 and 52.6).',
        'Journal every step, replay deterministically, make tools idempotent, classify errors, cap budgets, and watch completion rate and cost per completed task.',
      ],
      scene: { nodes: [agent(), tools(), llm(), journal(), resume()], links: [link('agent', 'tools'), link('agent', 'llm'), link('agent', 'journal'), link('journal', 'resume')], flows: [flow(['agent', 'journal', 'resume'], { kind: 'write', rate: 1.6 })] },
    },
  ],
};

export default lesson;
