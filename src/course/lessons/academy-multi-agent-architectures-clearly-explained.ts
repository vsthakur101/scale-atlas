import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => box('user', -16, 0, 'Task', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const orch = (extra: Partial<SceneNode> = {}) => box('orch', -8, 0, 'Orchestrator', 'purple', 'cpu', { size: [1.5, 1.5], height: 34, ...extra });
const worker = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`w${i}`, 2, (i - (n - 1) / 2) * 4.6, name, 'blue', 'cpu', { size: [1.2, 1.2], height: 26, ...extra });
const board = (extra: Partial<SceneNode> = {}) => db('board', 11, 0, 'Shared state / results', { size: [1.3, 1.3], ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'academy-multi-agent-architectures-clearly-explained',
  title: 'Multi-Agent Architectures',
  blurb: 'Orchestrator–workers, pipelines, debate and handoffs: what splitting an agent into several buys (parallelism, focus) and costs (tokens, coordination, new failure modes).',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'tok', label: 'Total tokens (vs one agent)', icon: 'file' },
    { key: 'speed', label: 'Wall-clock speed-up', icon: 'activity' },
    { key: 'chan', label: 'Communication channels', icon: 'share' },
    { key: 'ok', label: 'Chance every worker succeeds', icon: 'check' },
  ],
  goals: [
    { text: 'Why split one agent into several', step: 1 },
    { text: 'The main topologies: orchestrator, pipeline, group', step: 2 },
    { text: 'Context isolation and parallelism', step: 3 },
    { text: 'Token cost and coordination overhead', step: 4 },
    { text: 'Failure modes and when not to use multiple agents', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Worker agents', min: 1, max: 30, step: 1, default: 5, unit: '', description: 'Agents working on sub-tasks.' },
      { key: 'tok', label: 'Tokens per worker task', min: 2000, max: 500000, step: 1000, default: 40000, unit: '', description: 'Input + output tokens one worker consumes.' },
      { key: 'solo', label: 'Tokens if one agent did it all', min: 5000, max: 2000000, step: 5000, default: 120000, unit: '', description: 'Single-agent token use for the same job.' },
      { key: 'coord', label: 'Orchestration overhead', min: 0, max: 100, step: 5, default: 20, unit: '%', description: 'Extra tokens for planning, briefing workers and merging results.' },
      { key: 'par', label: 'Work that can run in parallel', min: 0, max: 100, step: 5, default: 80, unit: '%', description: 'Share of the job that splits cleanly into independent sub-tasks.' },
      { key: 'p', label: 'Chance a worker gets its task right', min: 50, max: 100, step: 1, default: 90, unit: '%', description: 'Per-worker success probability.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, Math.round(input.n ?? 5));
      const tok = Math.max(1, input.tok ?? 40000);
      const solo = Math.max(1, input.solo ?? 120000);
      const coord = Math.max(0, (input.coord ?? 20) / 100);
      const par = Math.min(0.99, Math.max(0, (input.par ?? 80) / 100));
      const p = Math.min(1, Math.max(0, (input.p ?? 90) / 100));
      const total = n * tok * (1 + coord);
      // Amdahl: the serial share (planning, merging, dependent steps) limits the speed-up.
      const speed = 1 / (1 - par + par / n);
      const mesh = (n * (n + 1)) / 2; // full mesh among n workers + orchestrator
      return {
        tok: step < 3 ? { v: '—' } : { v: `${fmtN(total)} (${(total / solo).toFixed(1)}× a single agent)`, tone: total / solo > 3 ? 'bad' : total / solo > 1.5 ? 'warn' : 'good' },
        speed: step < 2 ? { v: '—' } : { v: `${speed.toFixed(1)}× (ceiling ${(1 / (1 - par)).toFixed(0)}×)`, tone: speed > 3 ? 'good' : speed > 1.5 ? 'warn' : 'bad' },
        chan: step < 1 ? { v: '—' } : { v: `${n} via orchestrator vs ${mesh} full mesh` },
        ok: step < 4 ? { v: '—' } : { v: `${(Math.pow(p, n) * 100).toFixed(0)}% (${(Math.pow(1 - Math.pow(1 - p, 2), n) * 100).toFixed(0)}% with one retry)`, tone: Math.pow(p, n) > 0.8 ? 'good' : Math.pow(p, n) > 0.5 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'One agent hits limits: context, focus and time',
      body: [
        'A single agent accumulates everything in <b>one context</b>: instructions for every task, every tool result, every dead end. As it grows, quality drops, cost rises (see the Agents lesson) and a long task runs strictly one step at a time. Giving one agent a hundred tools makes tool selection worse.',
        '<b>Multi-agent</b> systems divide the work: separate agents, each with its own <b>instructions, tools and fresh context</b>, coordinate toward a goal. The benefits are <b>parallelism</b>, <b>specialisation</b> (a focused prompt and small toolset per role) and <b>context isolation</b> (a worker reads 50 pages and returns a paragraph). The costs are real, and many tasks are better served by one agent.',
      ],
      scene: { nodes: [user(), orch(), worker(0, 3, 'Researcher'), worker(1, 3, 'Coder'), worker(2, 3, 'Reviewer'), board()], links: [link('user', 'orch'), link('orch', 'w0'), link('orch', 'w1'), link('orch', 'w2'), link('w0', 'board'), link('w1', 'board'), link('w2', 'board')], flows: [flow(['user', 'orch', 'w1', 'board'], { rate: 1.5 })] },
    },
    {
      short: 'Topologies',
      kind: 'technique',
      title: 'Common architectures',
      body: [
        '<b>Orchestrator–workers</b>: a lead agent plans, delegates sub-tasks to workers (often in parallel), collects results and synthesises — the most common and easiest to reason about. <b>Pipeline / chain</b>: fixed stages (draft → critique → revise) where each agent’s output feeds the next. <b>Handoff / routing</b>: a triage agent passes the conversation to the specialist who owns it. <b>Group / debate</b>: several agents propose and critique, converging by voting or a judge; useful for hard reasoning, expensive.',
        'Communication is either <b>direct messages</b> or a <b>shared state</b> (blackboard, files, a task list) that agents read and write. Hub-and-spoke keeps channels to <code>n</code>; a free mesh grows as <code>n(n+1)/2</code> — 15 channels for 5 workers plus an orchestrator — and becomes hard to debug.',
      ],
      changes: [{ text: 'Orchestrator–workers · pipeline · handoff · debate', tone: 'info' }, { text: 'Hub: n channels · mesh: n(n+1)/2', tone: 'info' }],
      scene: { nodes: [box('o', -8, -5, 'Orchestrator–workers', 'purple', 'route', { size: [1.3, 1.3], height: 24 }), box('p', 4, -5, 'Pipeline', 'blue', 'list', { size: [1.3, 1.3], height: 22 }), box('h', -8, 6, 'Handoff to specialist', 'orange', 'share', { size: [1.3, 1.3], height: 22 }), box('d', 4, 6, 'Debate / vote', 'green', 'users', { size: [1.3, 1.3], height: 22 })], links: [], flows: [] },
    },
    {
      short: 'Parallel',
      kind: 'technique',
      title: 'Parallelism and context isolation',
      body: [
        'Independent sub-tasks (research five competitors, scan ten repositories, review fifteen files) run <b>simultaneously</b>, each in a clean context. Wall-clock time follows Amdahl’s law: if 80% of the job parallelises over 5 workers the speed-up is <code>1 ÷ (0.2 + 0.8 ÷ 5)</code> = <b>2.8×</b>, and can never exceed <code>1 ÷ 0.2 = 5×</code> — the serial planning, dependent steps and final synthesis set the limit.',
        '<b>Context isolation</b> is often the bigger win: a worker explores widely, reads long documents, hits dead ends — and returns a compact summary. The lead’s context stays small and focused. Design the hand-back carefully: a vague brief produces off-target work and a bloated summary produces the context problem you were avoiding.',
      ],
      changes: [{ text: 'Speed-up = 1 ÷ ((1 − p) + p ÷ n)', tone: 'info' }, { text: 'Workers return summaries, not transcripts', tone: 'good' }],
      scene: { nodes: [orch({ tag: pill('plan + delegate', 'list') }), worker(0, 3, 'Worker 1', { load: 80 }), worker(1, 3, 'Worker 2', { load: 80 }), worker(2, 3, 'Worker 3', { load: 80 }), board({ tag: pill('compact summaries', 'check', 'good') })], links: [link('orch', 'w0'), link('orch', 'w1'), link('orch', 'w2'), link('w0', 'board'), link('w1', 'board'), link('w2', 'board')], flows: [flow(['orch', 'w0', 'board'], { rate: 1.5 }), flow(['orch', 'w1', 'board'], { rate: 1.5 }), flow(['orch', 'w2', 'board'], { rate: 1.5 })] },
    },
    {
      short: 'Cost',
      kind: 'problem',
      title: 'The token bill multiplies',
      body: [
        'Every agent has its own context, instructions and tool definitions, and every hand-off re-states the problem. Five workers at 40,000 tokens each plus 20% orchestration overhead is <b>240,000 tokens</b> against a single agent’s 120,000 for the same job — <b>2×</b> — and debate-style systems often cost many times more. Parallelism buys time, not tokens.',
        'It pays off when the task is <b>wide</b> (many independent pieces), the value justifies the spend, and a single agent’s context would overflow. It does <i>not</i> pay off for tightly-coupled work (each step depends on the last), small tasks, or tasks where agents would need to constantly share detail — there the coordination cost exceeds the gain.',
      ],
      changes: [{ text: '5 × 40k × 1.2 = 240k tokens vs 120k single-agent', tone: 'bad' }, { text: 'Use for wide, parallelisable, high-value tasks', tone: 'good' }],
      scene: { nodes: [orch(), worker(0, 3, '40k tokens'), worker(1, 3, '40k tokens'), worker(2, 3, '40k tokens'), board({ tag: pill('+20% coordination', 'alert', 'warn') })], links: [link('orch', 'w0'), link('orch', 'w1'), link('orch', 'w2')], flows: [flow(['orch', 'w0'], { kind: 'heavy', rate: 2 }), flow(['orch', 'w1'], { kind: 'heavy', rate: 2 }), flow(['orch', 'w2'], { kind: 'heavy', rate: 2 })] },
    },
    {
      short: 'Failure',
      kind: 'problem',
      title: 'New failure modes',
      body: [
        '<b>Error compounding</b>: if each worker is right 90% of the time, all five are right <code>0.9⁵</code> = <b>59%</b> of the time; ten workers, 35%. A wrong worker result silently poisons the synthesis. <b>Miscommunication</b>: underspecified briefs, duplicated work, two agents making conflicting edits to the same file. <b>Runaway loops</b>: agents delegating to each other without termination, or a debate that never converges. <b>Opaque debugging</b>: a failure is distributed across several transcripts.',
        'Countermeasures: precise task briefs with explicit output formats and boundaries; <b>verification</b> steps (a separate checker, tests, citations to sources); retries — one retry per worker lifts a 90% worker to 99%, and five workers to 95% overall; hard budgets on steps, tokens, depth of delegation and time; <b>shared state with ownership</b> (one agent writes each artefact); and full tracing of every message with ids so you can replay a run.',
      ],
      changes: [{ text: '0.9⁵ = 59% all-correct; with one retry each, 95%', tone: 'bad' }, { text: 'Briefs, verification, retries, budgets, ownership, tracing', tone: 'good' }],
      scene: { nodes: [orch({ tag: pill('merges a wrong result', 'alert', 'warn') }), worker(0, 2, 'Worker (wrong)', { state: 'hot', tag: pill('plausible but incorrect', 'alert', 'bad') }), worker(1, 2, 'Worker (ok)'), board()], links: [link('orch', 'w0'), link('orch', 'w1'), link('w0', 'board'), link('w1', 'board')], flows: [flow(['orch', 'w0', 'board'], { kind: 'fail', rate: 1.2 })] },
    },
    {
      short: 'Choosing',
      kind: 'tradeoff',
      title: 'When to use one agent, a workflow, or several agents',
      body: [
        'Use a <b>single call</b> where possible, a <b>fixed workflow</b> where the steps are known, a <b>single agent</b> for open-ended tasks that fit in one context, and <b>multiple agents</b> when the task is wide, parallelisable, exceeds one context or needs genuinely different tools and permissions (a read-only researcher and a write-capable executor, for safety). Start simple and split only when measurement shows a limit.',
        'Standards are emerging for the plumbing — MCP connects agents to tools; agent-to-agent protocols describe how agents discover and message each other — but the design questions stay the same: clear roles, narrow interfaces, bounded cost and verifiable results. Figures here are model arithmetic for illustration.',
      ],
      scene: { nodes: [box('w', -10, 0, 'Workflow', 'blue', 'route', { size: [1.2, 1.2], height: 20, tag: pill('known steps', 'check') }), box('a', 0, 0, 'Single agent', 'orange', 'cpu', { size: [1.2, 1.2], height: 24, tag: pill('fits one context', 'check') }), box('m', 10, 0, 'Multi-agent', 'purple', 'layers', { size: [1.2, 1.2], height: 28, tag: pill('wide, parallel, isolated', 'check') })], links: [link('w', 'a', { arrow: 'end' }), link('a', 'm', { arrow: 'end' })], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Parallelism and isolation, at a price',
      body: [
        'Multi-agent systems split work across agents with separate contexts and tools: <b>orchestrator–workers</b>, pipelines, handoffs, debate. Speed-up follows Amdahl (<code>1 ÷ ((1 − p) + p/n)</code>), tokens multiply (workers × tokens × (1 + overhead)), channels grow as n² in a mesh, and correctness compounds as <code>pⁿ</code>.',
        'Use them for wide, parallelisable, high-value work; brief precisely, verify, retry, cap budgets, own artefacts and trace everything.',
      ],
      scene: { nodes: [user(), orch(), worker(0, 3, 'Worker'), worker(1, 3, 'Worker'), worker(2, 3, 'Worker'), board()], links: [link('user', 'orch'), link('orch', 'w0'), link('orch', 'w1'), link('orch', 'w2'), link('w0', 'board'), link('w1', 'board'), link('w2', 'board')], flows: [flow(['user', 'orch', 'w1', 'board'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
