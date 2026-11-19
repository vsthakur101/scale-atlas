import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const src = (id: string, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(id, -13, d, name, 'teal', 'file', { size: [1.2, 1.2], height: 20, ...extra });
const assembler = (extra: Partial<SceneNode> = {}) => box('asm', -2, 0, 'Context assembler', 'orange', 'layers', { size: [1.5, 1.5], height: 32, ...extra });
const model = (extra: Partial<SceneNode> = {}) => box('model', 8, 0, 'Model', 'purple', 'cpu', { size: [1.5, 1.5], height: 34, ...extra });
const out = (extra: Partial<SceneNode> = {}) => box('out', 16, 0, 'Response / action', 'green', 'check', { size: [1.2, 1.2], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'academy-what-is-context-engineering',
  title: 'Context Engineering',
  blurb: 'The model sees only what is in its window. Deciding what goes there — instructions, retrieved facts, memory, tool results, history — and what gets cut, is the real design work of an AI system.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'fixed', label: 'Fixed context (instructions + tools)', icon: 'lock' },
    { key: 'turn', label: 'Context added per turn', icon: 'file' },
    { key: 'full', label: 'Turns until the window is full', icon: 'clock' },
    { key: 'comp', label: 'Turns with compaction', icon: 'refresh' },
    { key: 'cost', label: 'Input tokens over 20 turns (no cache → cached)', icon: 'gauge' },
  ],
  goals: [
    { text: 'Context engineering versus prompt engineering', step: 1 },
    { text: 'The components that compete for the window', step: 2 },
    { text: 'Selection: retrieve just-in-time, not everything', step: 3 },
    { text: 'Compaction, memory and sub-agents for long tasks', step: 4 },
    { text: 'Ordering, caching and the failure modes of long context', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'ctx', label: 'Context window', min: 8000, max: 2000000, step: 8000, default: 200000, unit: ' tokens', description: 'Maximum tokens the model accepts.' },
      { key: 'sys', label: 'System prompt', min: 0, max: 20000, step: 100, default: 2000, unit: ' tokens', description: 'Instructions, persona, rules.' },
      { key: 'tools', label: 'Tool definitions', min: 0, max: 50000, step: 500, default: 8000, unit: ' tokens', description: 'Schemas for every available tool.' },
      { key: 'ret', label: 'Retrieved context per turn', min: 0, max: 30000, step: 500, default: 4000, unit: ' tokens', description: 'Documents or memories added each turn.' },
      { key: 'msg', label: 'User + assistant text per turn', min: 100, max: 10000, step: 100, default: 1200, unit: ' tokens', description: 'Conversation added each turn.' },
      { key: 'tool', label: 'Tool results per turn', min: 0, max: 30000, step: 500, default: 3000, unit: ' tokens', description: 'Outputs returned by tools each turn.' },
      { key: 'keep', label: 'Share kept after compaction', min: 5, max: 80, step: 5, default: 20, unit: '%', description: 'Fraction of the history that survives summarisation.' },
    ],
    calculate: (input, step) => {
      const ctx = Math.max(1000, input.ctx ?? 2e5);
      const sys = Math.max(0, input.sys ?? 2000);
      const tools = Math.max(0, input.tools ?? 8000);
      const ret = Math.max(0, input.ret ?? 4000);
      const msg = Math.max(0, input.msg ?? 1200);
      const tool = Math.max(0, input.tool ?? 3000);
      const keep = Math.min(0.95, Math.max(0.02, (input.keep ?? 20) / 100));
      const fixed = sys + tools;
      const perTurn = ret + msg + tool;
      const room = Math.max(0, ctx - fixed);
      const full = perTurn > 0 ? room / perTurn : Infinity;
      // Compaction at 80% full keeps `keep` of the history; each cycle frees (1 − keep) × 0.8 × room.
      const freed = 0.8 * room * (1 - keep);
      const comp = perTurn > 0 && freed > 0 ? full + freed / perTurn : full;
      // Without caching every turn re-reads the whole accumulated context; with caching only the new tokens are full price (90% discount on the prefix).
      let total = 0;
      let cached = 0;
      for (let i = 1; i <= 20; i++) {
        const size = fixed + i * perTurn;
        total += size;
        cached += perTurn + (size - perTurn) * 0.1;
      }
      return {
        fixed: step < 1 ? { v: '—' } : { v: `${fmtN(fixed)} (${((fixed / ctx) * 100).toFixed(1)}% of the window)`, tone: fixed / ctx > 0.2 ? 'bad' : fixed / ctx > 0.08 ? 'warn' : 'good' },
        turn: step < 1 ? { v: '—' } : { v: fmtN(perTurn) },
        full: step < 1 ? { v: '—' } : Number.isFinite(full) ? { v: `${full.toFixed(1)}`, tone: full > 30 ? 'good' : full > 10 ? 'warn' : 'bad' } : { v: 'never' },
        comp: step < 1 ? { v: '—' } : Number.isFinite(comp) ? { v: `${comp.toFixed(1)} per cycle`, tone: 'good' } : { v: 'never' },
        cost: step < 3 ? { v: '—' } : { v: `${fmtN(total)} → ${fmtN(cached)} (${(total / cached).toFixed(1)}× cheaper)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Beyond prompts',
      kind: 'insight',
      title: 'The model only knows what is in the window',
      body: [
        '<b>Prompt engineering</b> is wording a request well. <b>Context engineering</b> is the broader discipline of deciding <i>everything</i> that enters the model’s context window for each call — instructions, examples, retrieved documents, memory, the results of previous tool calls, conversation history — and keeping the right things in and the wrong things out as a task unfolds.',
        'It matters because the context is the model’s <i>entire</i> working memory: it cannot use a fact that isn’t there, and noise that is there degrades its reasoning. As systems move from single prompts to <b>agents running for many steps</b> (see that lesson), the quality of the context assembled at each step often matters more than the wording of any single instruction.',
      ],
      scene: { nodes: [src('a', -7, 'Instructions'), src('b', -3.5, 'Retrieved docs'), src('c', 0, 'Memory'), src('d', 3.5, 'Tool results'), src('e', 7, 'History'), assembler({ tag: pill('what goes in the window?', 'search') }), model(), out()], links: [link('a', 'asm'), link('b', 'asm'), link('c', 'asm'), link('d', 'asm'), link('e', 'asm'), link('asm', 'model'), link('model', 'out')], flows: [flow(['b', 'asm', 'model', 'out'], { rate: 1.5 })] },
    },
    {
      short: 'Components',
      kind: 'technique',
      title: 'What competes for the window',
      body: [
        'A typical agent turn carries: a <b>system prompt</b> (role, rules, style: 2,000 tokens), <b>tool definitions</b> (8,000 — see the MCP lesson), <b>retrieved context</b> (documents, 4,000), <b>conversation</b> (1,200) and <b>tool results</b> (3,000). The fixed part (10,000) is 5% of a 200,000-token window; the per-turn growth is <b>8,200 tokens</b>, so the window fills in about 23 turns — sooner if tool outputs are large.',
        'Each category has a different lifetime. Instructions and tools are <b>stable</b> and cacheable. Retrieved context is <b>transient</b> — useful for one step, then dead weight. Conversation and tool results <b>accumulate</b>. Context engineering assigns each category a budget and a retention policy instead of letting everything pile up.',
      ],
      changes: [{ text: 'Fixed 10k + 8.2k per turn → full in ~23 turns', tone: 'info' }, { text: 'Stable · transient · accumulating', tone: 'info' }],
      scene: { nodes: [src('a', -7, 'System + tools: stable', { tone: 'blue' }), src('b', -2, 'Retrieved: transient', { tone: 'orange' }), src('c', 3, 'Chat + results: accumulating', { tone: 'red' }), assembler(), model()], links: [link('a', 'asm'), link('b', 'asm'), link('c', 'asm'), link('asm', 'model')], flows: [flow(['c', 'asm', 'model'], { rate: 2 })] },
    },
    {
      short: 'Select',
      kind: 'technique',
      title: 'Select: retrieve just in time',
      body: [
        'Don’t preload everything “in case”. <b>Just-in-time retrieval</b> keeps lightweight references (file paths, URLs, ids, short summaries) in context and lets the model — or the harness — <b>fetch the detail when needed</b>, through search, grep, a query tool or a document read. The model explores progressively: a directory listing tells it what exists, file names hint at relevance, then it opens only what matters.',
        'Pre-retrieval has its place for predictable, high-value context (the user’s profile, the relevant policy), but wide dumps dilute attention and cost every turn. Prefer <b>rank, filter and trim</b>: top-k after reranking (see the RAG lesson), deduplicate near-identical chunks, limit tool output size and truncate with a pointer to the rest (“showing 20 of 4,300 rows — refine the query”).',
      ],
      changes: [{ text: 'Keep references; fetch details on demand', tone: 'good' }, { text: 'Cap and truncate tool output with a pointer', tone: 'good' }],
      scene: { nodes: [model({ tag: pill('asks for the file it needs', 'search') }), box('tools', 8, -7, 'Search · grep · read', 'orange', 'search', { size: [1.3, 1.3], height: 24 }), db('store', 16, -7, 'Corpus / repo', { size: [1.3, 1.3] })], links: [link('model', 'tools', { arrow: 'both' }), link('tools', 'store', { arrow: 'both' })], flows: [flow(['model', 'tools', 'store'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Long tasks',
      kind: 'technique',
      title: 'Long-horizon tasks: compaction, notes and sub-agents',
      body: [
        'When a task outgrows the window you have three tools. <b>Compaction</b>: near the limit, summarise the history — decisions made, open problems, key facts — and restart with the summary plus recent turns. Keeping 20% of the history frees 80% of 80% of the room: at the defaults, compaction buys about <b>15 more turns</b> per cycle. The art is what the summary preserves: architectural decisions and unresolved bugs yes; redundant tool output no.',
        '<b>Structured notes / external memory</b>: the model writes durable facts (a to-do list, findings, a plan file) outside the window and re-reads them, so progress survives resets. <b>Sub-agents</b> take a sub-task in a clean context and return a short result (see the Multi-Agent lesson). Combined with <b>prompt caching</b> — only new tokens at full price — the 20-turn cost falls from ~1.9M to ~0.34M input tokens at the defaults.',
      ],
      changes: [{ text: 'Compact: summarise decisions + open issues', tone: 'good' }, { text: 'Notes file and sub-agents carry state across resets', tone: 'good' }, { text: 'Caching: ~5.7× cheaper over 20 turns', tone: 'good' }],
      concepts: [{ term: 'Compaction', def: 'Replacing an old, long conversation with a distilled summary so work can continue within the context window.' }],
      scene: { nodes: [assembler({ tag: pill('summarise at 80% full', 'refresh') }), box('notes', 8, -7, 'Notes / memory file', 'yellow', 'file', { size: [1.3, 1.3], height: 18 }), box('sub', 8, 7, 'Sub-agent (clean context)', 'blue', 'cpu', { size: [1.3, 1.3], height: 24 })], links: [link('asm', 'notes', { arrow: 'both' }), link('asm', 'sub', { arrow: 'both' })], flows: [flow(['asm', 'notes'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Order',
      kind: 'tradeoff',
      title: 'Order, caching and what long context gets wrong',
      body: [
        '<b>Order for caching</b>: put stable content first (system prompt, tool definitions, reference docs), then slowly-changing, then the volatile tail — and <b>append, don’t edit</b> earlier text, because any change invalidates the cached prefix after it. <b>Order for attention</b>: models weigh the beginning and end of a long context more reliably than the middle; put key instructions and the question where they’ll be seen, and repeat critical constraints near the end.',
        'Long contexts fail in recognisable ways: <b>context poisoning</b> (a wrong early result keeps being referenced), <b>distraction</b> (too much history pulls attention from the task), <b>confusion</b> (too many similar tools or irrelevant documents), and <b>clash</b> (contradictory instructions). Mitigate by pruning stale results, scoping tools to the task, resolving conflicts in the prompt, and measuring task success — not just window usage. Figures here are token arithmetic for illustration.',
      ],
      changes: [{ text: 'Stable first, volatile last; append-only', tone: 'good' }, { text: 'Poisoning · distraction · confusion · clash', tone: 'bad' }],
      scene: { nodes: [box('stable', -10, 0, 'Stable prefix (cached)', 'blue', 'lock', { size: [1.3, 1.3], height: 24, tag: pill('90% cheaper', 'check', 'good') }), box('slow', 0, 0, 'Slowly changing', 'orange', 'layers', { size: [1.3, 1.3], height: 22 }), box('vol', 10, 0, 'Volatile tail', 'red', 'refresh', { size: [1.3, 1.3], height: 20, tag: pill('full price', 'alert', 'warn') })], links: [link('stable', 'slow', { arrow: 'end' }), link('slow', 'vol', { arrow: 'end' })], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Treat the window as a budget',
      body: [
        'Context engineering decides what enters the window at each step: a <b>stable cacheable prefix</b>, <b>just-in-time retrieval</b>, <b>trimmed tool output</b>, and for long tasks <b>compaction, notes and sub-agents</b>. Turns until full ≈ <code>(window − fixed) ÷ per-turn growth</code>; caching makes re-reading history ~10× cheaper.',
        'Order for caching and attention, prune what has gone stale, and evaluate on task success.',
      ],
      scene: { nodes: [src('a', -5, 'Instructions + tools'), src('b', 0, 'Retrieved + memory'), src('c', 5, 'History + results'), assembler(), model()], links: [link('a', 'asm'), link('b', 'asm'), link('c', 'asm'), link('asm', 'model')], flows: [flow(['b', 'asm', 'model'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
