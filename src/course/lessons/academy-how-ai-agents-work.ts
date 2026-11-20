import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const goal = (extra: Partial<SceneNode> = {}) => box('goal', -15, 0, 'Goal', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const llm = (extra: Partial<SceneNode> = {}) => box('llm', -6, 0, 'LLM (reason + decide)', 'purple', 'cpu', { size: [1.5, 1.5], height: 34, ...extra });
const tools = (extra: Partial<SceneNode> = {}) => box('tools', 5, -6, 'Tools / APIs', 'orange', 'bolt', { size: [1.4, 1.4], height: 28, ...extra });
const mem = (extra: Partial<SceneNode> = {}) => db('mem', 5, 6, 'Memory / context', { size: [1.4, 1.4], ...extra });
const out = (extra: Partial<SceneNode> = {}) => box('out', 15, 0, 'Result', 'green', 'check', { size: [1.2, 1.2], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 120 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);

const lesson: Lesson = {
  slug: 'academy-how-ai-agents-work',
  title: 'AI Agents: The Plan–Act–Observe Loop',
  blurb: 'A model in a loop with tools: plan, act, observe, repeat — and the arithmetic of why agents cost more per step as they go, fail more with every step, and need guardrails.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'tokens', label: 'Input tokens processed', icon: 'file' },
    { key: 'billed', label: 'Billed-equivalent with prompt caching', icon: 'gauge' },
    { key: 'time', label: 'Wall-clock time', icon: 'clock' },
    { key: 'ok', label: 'Chance every step succeeds', icon: 'check' },
  ],
  goals: [
    { text: 'The agent loop: reason, call a tool, observe, repeat', step: 1 },
    { text: 'Tools, structured output and the action space', step: 2 },
    { text: 'Context as memory: why cost grows with each step', step: 3 },
    { text: 'Compounding errors and how to contain them', step: 4 },
    { text: 'Control: budgets, approvals, sandboxes and evals', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'steps', label: 'Steps in the task', min: 1, max: 100, step: 1, default: 12, unit: '', description: 'Model calls the agent makes before it finishes.' },
      { key: 'base', label: 'Starting prompt', min: 200, max: 30000, step: 100, default: 2000, unit: ' tokens', description: 'System prompt, tool definitions and the task.' },
      { key: 'add', label: 'Tokens added per step', min: 50, max: 10000, step: 50, default: 800, unit: ' tokens', description: 'The model’s output plus the tool result appended to context.' },
      { key: 'disc', label: 'Cached-input discount', min: 0, max: 95, step: 5, default: 90, unit: '%', description: 'Saving on re-read input that matches a cached prefix.' },
      { key: 'llm', label: 'Model time per step', min: 0.5, max: 30, step: 0.5, default: 4, unit: ' s', description: 'Latency of one model call, including output.' },
      { key: 'tool', label: 'Tool time per step', min: 0, max: 30, step: 0.5, default: 1, unit: ' s', description: 'Time for the tool call to return.' },
      { key: 'p', label: 'Chance a step is right', min: 80, max: 100, step: 0.5, default: 97, unit: '%', description: 'Probability each decision and tool call is correct.' },
    ],
    calculate: (input, step) => {
      const S = Math.max(1, Math.round(input.steps ?? 12));
      const base = Math.max(1, input.base ?? 2000);
      const add = Math.max(0, input.add ?? 800);
      const disc = Math.min(0.99, Math.max(0, (input.disc ?? 90) / 100));
      const llm = Math.max(0, input.llm ?? 4);
      const tool = Math.max(0, input.tool ?? 1);
      const p = Math.min(1, Math.max(0, (input.p ?? 97) / 100));
      // Step i re-reads base + (i−1)·add tokens: the whole history so far.
      const total = S * base + (add * S * (S - 1)) / 2;
      // With prefix caching only new tokens are full price; the re-read prefix is discounted.
      let billed = base;
      for (let i = 2; i <= S; i++) billed += add + (base + (i - 2) * add) * (1 - disc);
      return {
        tokens: step < 2 ? { v: '—' } : { v: fmtN(total), tone: total > 1e6 ? 'bad' : total > 2e5 ? 'warn' : 'good' },
        billed: step < 2 ? { v: '—' } : { v: `${fmtN(billed)} (${(total / billed).toFixed(1)}× cheaper)`, tone: 'good' },
        time: step < 2 ? { v: '—' } : { v: fmtT(S * (llm + tool)), tone: S * (llm + tool) > 300 ? 'warn' : 'good' },
        ok: step < 3 ? { v: '—' } : { v: `${(Math.pow(p, S) * 100).toFixed(0)}%`, tone: Math.pow(p, S) > 0.9 ? 'good' : Math.pow(p, S) > 0.6 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'The loop',
      kind: 'insight',
      title: 'An agent is a loop around a model',
      body: [
        'A plain model call takes text in and returns text. An <b>agent</b> wraps it in a <b>loop</b>: given a goal, the model decides what to do next — often “call this tool with these arguments” — the system executes it, the <b>result is appended to the context</b>, and the model decides again, until it declares it is done or a limit stops it. The model supplies judgement; ordinary code supplies the loop, the tools and the safety rails.',
        'That makes agents powerful for open-ended tasks (research, coding, support triage) and expensive and unreliable relative to fixed workflows. Everything that follows — cost, latency, errors, control — comes from this loop shape.',
      ],
      scene: { nodes: [goal(), llm(), tools(), mem(), out()], links: [link('goal', 'llm'), link('llm', 'tools', { arrow: 'both' }), link('tools', 'mem', { arrow: 'end' }), link('mem', 'llm', { arrow: 'end', style: 'dashed' }), link('llm', 'out')], flows: [flow(['llm', 'tools', 'mem', 'llm'], { rate: 1.5 }), flow(['llm', 'out'], { rate: 0.6 })] },
    },
    {
      short: 'Tools',
      kind: 'technique',
      title: 'Tools: how a model acts on the world',
      body: [
        'The model never executes anything. It emits a <b>structured call</b> — a function name and JSON arguments — chosen from tool definitions in its prompt (search, read file, run query, send message, run code). Your code validates the arguments, runs the tool and returns the output as text. A tool’s name, description and parameter schema <b>are its interface</b>: clear descriptions and tight schemas matter more than cleverness.',
        'The <b>action space</b> is the set of tools — each one adds capability and risk. Keep it small and well-scoped, return errors the model can act on, cap output size, and give <i>read-only</i> versions of tools wherever possible. Protocols like MCP standardise how tools are described and discovered so one tool server works with many agents.',
      ],
      changes: [{ text: 'Tool call = name + JSON arguments, validated by code', tone: 'good' }, { text: 'Small, well-described, scoped action space', tone: 'good' }],
      scene: { nodes: [llm({ tag: pill('{"tool":"search","q":"…"}', 'file') }), tools({ tag: pill('validate → execute', 'check', 'good') }), mem({ tag: pill('result appended', 'list') })], links: [link('llm', 'tools'), link('tools', 'mem')], flows: [flow(['llm', 'tools', 'mem'], { rate: 1.5 })] },
    },
    {
      short: 'Context',
      kind: 'problem',
      title: 'Context is the memory — and the bill',
      body: [
        'The model is stateless: each step it must be sent the <b>entire history</b> — instructions, every earlier thought, every tool result. So step <code>i</code> processes <code>base + (i − 1) × added</code> tokens and the total over S steps is <code>S × base + added × S(S − 1) ÷ 2</code> — <b>quadratic in steps</b>. 12 steps with a 2,000-token start and 800 tokens added each is <b>76,800 input tokens</b>, versus 9,600 if each step only paid for its new content.',
        '<b>Prompt caching</b> bills the unchanged prefix at a steep discount (90% here): the same run costs the equivalent of ~17,400 full-price tokens, 4.4× cheaper. It only works if the prefix is <i>stable</i> — don’t reorder or edit earlier context. Long histories also hurt quality and latency, so agents <b>compact</b> (summarise old steps), offload big results to files or a store the model can query, and keep tool outputs short.',
      ],
      changes: [{ text: 'Total input ≈ S × base + added × S(S−1)/2', tone: 'info' }, { text: '12 steps → 76,800 tokens; cached bill ≈ 17,400', tone: 'info' }],
      note: { kind: 'tip', text: 'Put stable content (instructions, tool definitions) first and append only — that is what makes caching work.' },
      scene: { nodes: [llm({ tag: pill('re-reads the full history every step', 'refresh', 'warn') }), mem({ tag: pill('grows each step', 'disk') })], links: [link('mem', 'llm', { arrow: 'end' })], flows: [flow(['mem', 'llm'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Reliability',
      kind: 'problem',
      title: 'Errors compound across steps',
      body: [
        'If each step is right with probability 97%, a 12-step run succeeds only <code>0.97¹²</code> = <b>69%</b> of the time; 50 steps at 97% is 22%. Mistakes also <i>propagate</i>: a wrong early result poisons later reasoning, and models can confidently continue down a bad path or loop on the same failing call.',
        'Mitigations act on every factor: <b>fewer steps</b> (better tools that do more per call, fixed workflows for the predictable parts), <b>higher per-step accuracy</b> (clear tools, examples, a stronger model for hard decisions), <b>verification</b> after steps (run tests, check results against the source), <b>retry limits and loop detection</b>, and <b>checkpoints</b> so a failure resumes instead of restarts.',
      ],
      changes: [{ text: 'P(success) = pˢ: 0.97¹² = 69%', tone: 'bad' }, { text: 'Fewer steps, better tools, verify, checkpoint', tone: 'good' }],
      scene: { nodes: [llm({ tag: pill('step 4: wrong assumption', 'alert', 'warn') }), tools({ tag: pill('plausible but wrong result', 'alert', 'bad') }), out({ tag: pill('bad answer', 'alert', 'bad') })], links: [link('llm', 'tools'), link('tools', 'out')], flows: [flow(['llm', 'tools', 'out'], { kind: 'fail', rate: 1.2 })] },
    },
    {
      short: 'Patterns',
      kind: 'technique',
      title: 'Patterns: workflows, planning, sub-agents',
      body: [
        '<b>Workflow first</b>: chain fixed steps (retrieve → draft → critique → format) where the path is known — cheaper and more reliable than a free-roaming agent. <b>ReAct</b>-style loops interleave reasoning and action; <b>plan-then-execute</b> has the model write a plan up front, which is easier to review and resume; <b>reflection</b> adds a critique pass. <b>Sub-agents</b> run in their own fresh context for a narrow task and return a short summary — isolating context growth and enabling parallelism.',
        'Use the simplest pattern that works: a single model call with good context beats an agent for most tasks, a workflow beats an agent when steps are predictable, and an agent earns its cost when the path genuinely depends on what it finds.',
      ],
      changes: [{ text: 'Prefer workflows; agents for open-ended paths', tone: 'info' }, { text: 'Sub-agents isolate context and parallelise', tone: 'good' }],
      scene: { nodes: [box('wf', -8, -5, 'Workflow', 'blue', 'route', { size: [1.3, 1.3], height: 22, tag: pill('fixed path', 'check') }), box('pl', 2, -5, 'Plan → execute', 'orange', 'list', { size: [1.3, 1.3], height: 22 }), box('sa', 12, -5, 'Sub-agents', 'purple', 'layers', { size: [1.3, 1.3], height: 24, tag: pill('own context', 'check') }), box('re', 2, 6, 'Reflection / critique', 'green', 'refresh', { size: [1.3, 1.3], height: 22 })], links: [], flows: [] },
    },
    {
      short: 'Control',
      kind: 'technique',
      title: 'Keeping an agent safe and bounded',
      body: [
        '<b>Budgets</b>: hard limits on steps, tokens, wall-clock time and spend per task; stop and report rather than run on. <b>Least privilege</b>: scope credentials to the task; run code and commands in a <b>sandbox</b> without network or secrets; separate read and write tools. <b>Human approval</b> for irreversible actions (payments, deletes, external messages). <b>Prompt injection</b>: any text a tool returns — web pages, emails, documents — may contain instructions; treat it as data, never authority, and restrict what the agent can do after reading untrusted content.',
        '<b>Observability</b>: log every step, tool call, token count and cost with a trace id; replay failures. <b>Evaluate</b> on a suite of realistic tasks with scored outcomes before changing prompts or models — agents regress silently. Figures here are model outputs for sizing, not product benchmarks.',
      ],
      changes: [{ text: 'Step/token/time/spend budgets', tone: 'good' }, { text: 'Sandbox, least privilege, approvals', tone: 'good' }, { text: 'Tool output is untrusted input', tone: 'bad' }],
      scene: { nodes: [llm(), box('guard', 0, 6, 'Guardrails: budget · sandbox · approval', 'red', 'shield', { size: [1.4, 1.4], height: 26 }), tools({ tag: pill('allow-listed tools only', 'lock', 'good') })], links: [link('llm', 'guard'), link('guard', 'tools')], flows: [flow(['llm', 'guard', 'tools'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A loop with a bill, an error rate and a blast radius',
      body: [
        'An agent is <b>a model in a loop with tools and a growing context</b>. Cost grows quadratically with steps unless prefixes are cached (total ≈ <code>S × base + added × S(S−1)/2</code>); reliability decays as <code>pˢ</code>; latency is <code>steps × (model + tool time)</code>.',
        'Prefer workflows and few steps, give the model small, well-described tools, compact context, verify results, bound everything with budgets and sandboxes, treat tool output as untrusted, and evaluate on real tasks.',
      ],
      scene: { nodes: [goal(), llm(), tools(), mem(), out()], links: [link('goal', 'llm'), link('llm', 'tools', { arrow: 'both' }), link('tools', 'mem', { arrow: 'end' }), link('mem', 'llm', { arrow: 'end', style: 'dashed' }), link('llm', 'out')], flows: [flow(['llm', 'tools', 'mem', 'llm'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
