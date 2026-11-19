import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const docs = (extra: Partial<SceneNode> = {}) => box('docs', -16, -6, 'Documents', 'green', 'file', { size: [1.3, 1.3], height: 24, ...extra });
const chunker = (extra: Partial<SceneNode> = {}) => box('chunk', -8, -6, 'Chunk + embed', 'orange', 'layers', { size: [1.3, 1.3], height: 26, ...extra });
const vdb = (extra: Partial<SceneNode> = {}) => db('vdb', 0, -6, 'Vector index', { size: [1.4, 1.4], ...extra });
const user = (extra: Partial<SceneNode> = {}) => box('user', -16, 6, 'Question', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const retr = (extra: Partial<SceneNode> = {}) => box('retr', -6, 6, 'Retrieve + rerank', 'blue', 'search', { size: [1.3, 1.3], height: 28, ...extra });
const llm = (extra: Partial<SceneNode> = {}) => box('llm', 4, 6, 'LLM', 'purple', 'cpu', { size: [1.5, 1.5], height: 34, ...extra });
const ans = (extra: Partial<SceneNode> = {}) => box('ans', 13, 6, 'Grounded answer', 'green', 'check', { size: [1.3, 1.3], height: 24, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`);
const fmtB = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

const lesson: Lesson = {
  slug: 'academy-how-rag-works',
  title: 'How Retrieval-Augmented Generation Works',
  blurb: 'Chunk, embed, index, retrieve, rerank, then ground the model’s answer in what was found — and the arithmetic of index size, context budget and where quality really comes from.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'chunks', label: 'Chunks in the index', icon: 'layers' },
    { key: 'index', label: 'Vector index size', icon: 'disk' },
    { key: 'ctx', label: 'Retrieved context per question', icon: 'file' },
    { key: 'cost', label: 'Prompt tokens per 1,000 questions', icon: 'gauge' },
  ],
  goals: [
    { text: 'Why retrieval: the knowledge and freshness problem', step: 1 },
    { text: 'Chunking and embedding the corpus', step: 2 },
    { text: 'Retrieval, hybrid search and reranking', step: 3 },
    { text: 'Prompt assembly and the context budget', step: 4 },
    { text: 'Failure modes and how to evaluate', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'docs', label: 'Documents', min: 100, max: 100000000, step: 100, default: 100000, unit: '', description: 'Source documents to index.' },
      { key: 'tok', label: 'Tokens per document', min: 100, max: 50000, step: 100, default: 3000, unit: '', description: 'Average length.' },
      { key: 'chunk', label: 'Chunk size', min: 100, max: 2000, step: 50, default: 500, unit: ' tokens', description: 'Tokens per chunk.' },
      { key: 'overlap', label: 'Chunk overlap', min: 0, max: 50, step: 1, default: 10, unit: '%', description: 'Overlap between adjacent chunks to avoid cutting ideas in half.' },
      { key: 'dim', label: 'Embedding dimensions', min: 128, max: 4096, step: 128, default: 1024, unit: '', description: 'Length of each embedding vector (float32 = 4 bytes each).' },
      { key: 'k', label: 'Chunks passed to the model', min: 1, max: 50, step: 1, default: 6, unit: '', description: 'Top-k chunks after reranking.' },
      { key: 'sys', label: 'Instructions + question tokens', min: 100, max: 5000, step: 100, default: 600, unit: '', description: 'Fixed prompt overhead per question.' },
    ],
    calculate: (input, step) => {
      const docs = Math.max(1, input.docs ?? 1e5);
      const tok = Math.max(1, input.tok ?? 3000);
      const chunk = Math.max(50, input.chunk ?? 500);
      const ov = Math.min(0.9, Math.max(0, (input.overlap ?? 10) / 100));
      const dim = Math.max(1, input.dim ?? 1024);
      const k = Math.max(1, Math.round(input.k ?? 6));
      const sys = Math.max(0, input.sys ?? 600);
      // Each chunk advances by chunk × (1 − overlap) tokens.
      const chunks = Math.ceil(docs * (tok / (chunk * (1 - ov))));
      const index = chunks * dim * 4;
      const ctx = k * chunk;
      return {
        chunks: step < 1 ? { v: '—' } : { v: fmtN(chunks) },
        index: step < 1 ? { v: '—' } : { v: fmtB(index), tone: index > 5e10 ? 'warn' : 'good' },
        ctx: step < 3 ? { v: '—' } : { v: `${ctx.toLocaleString('en-US')} tokens`, tone: ctx > 20000 ? 'warn' : 'good' },
        cost: step < 3 ? { v: '—' } : { v: `${fmtN((ctx + sys) * 1000)} tokens`, tone: ctx + sys > 8000 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'Models don’t know your data — and forget the world after training',
      body: [
        'A language model only knows what was in its training data: not your company wiki, yesterday’s tickets, or a document uploaded a minute ago. Asking it anyway invites confident <b>hallucination</b>. Fine-tuning bakes knowledge into weights slowly and expensively, can’t cite sources, and goes stale.',
        '<b>Retrieval-augmented generation</b> keeps knowledge <i>outside</i> the model. At question time it <b>retrieves</b> the most relevant passages from a searchable store and puts them in the prompt, instructing the model to answer from them. Knowledge is updated by changing the index; answers can cite their sources; access control applies at retrieval.',
      ],
      scene: { nodes: [docs(), chunker(), vdb(), user(), retr(), llm(), ans()], links: [link('docs', 'chunk'), link('chunk', 'vdb'), link('user', 'retr'), link('vdb', 'retr', { style: 'dashed', arrow: 'both' }), link('retr', 'llm'), link('llm', 'ans')], flows: [flow(['user', 'retr', 'llm', 'ans'], { rate: 1.5 })] },
    },
    {
      short: 'Indexing',
      kind: 'technique',
      title: 'Chunk, embed, store',
      body: [
        'Documents are parsed (PDFs, HTML, tables) and split into <b>chunks</b> — retrievable units. Too small and a chunk lacks context; too large and relevance blurs and you waste prompt space. Typical: 200–800 tokens with ~10% overlap, split on headings and paragraphs rather than blindly, with <b>metadata</b> (source, section, date, access group) attached.',
        'An <b>embedding model</b> turns each chunk into a vector (here 1,024 floats) such that similar meaning ⇒ nearby vectors. At 100,000 documents × 3,000 tokens ÷ (500 × 0.9) ≈ <b>667,000 chunks</b> × 1,024 × 4 bytes ≈ <b>2.7 GB</b> of vectors — small, but 100 million documents would be 2.7 TB, which is where compression and sharding (see the vector search lesson) come in.',
      ],
      changes: [{ text: 'chunks ≈ docs × tokens ÷ (chunk × (1 − overlap))', tone: 'info' }, { text: 'Index bytes ≈ chunks × dimensions × 4', tone: 'info' }],
      concepts: [{ term: 'Embedding', def: 'A vector representation of text in which semantically similar passages lie close together.' }],
      scene: { nodes: [docs({ tag: pill('parse · split', 'file') }), chunker({ tag: pill('500-token chunks + metadata', 'layers') }), vdb({ tag: pill('vector + text + metadata', 'hash') })], links: [link('docs', 'chunk'), link('chunk', 'vdb')], flows: [flow(['docs', 'chunk', 'vdb'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Retrieval',
      kind: 'technique',
      title: 'Find candidates, then rerank',
      body: [
        'The question is embedded with the <i>same</i> model and the index returns the nearest chunks by <b>vector similarity</b> (approximate nearest-neighbour search). Pure semantic search misses exact terms — product codes, names, error strings — so production systems use <b>hybrid retrieval</b>: combine vector scores with keyword search (BM25) and merge the rankings (e.g. reciprocal rank fusion). Metadata filters enforce permissions and scope.',
        'First-stage retrieval is fast but coarse, so fetch ~50 candidates and <b>rerank</b> them with a cross-encoder that reads question and passage together — slower, much more accurate — keeping the top <code>k</code> (6). Reranking is usually the highest-value upgrade to a naive RAG pipeline.',
      ],
      changes: [{ text: 'Vector + keyword (hybrid), merged by rank', tone: 'good' }, { text: 'Retrieve ~50, rerank, keep top 6', tone: 'good' }],
      scene: { nodes: [user({ tag: pill('embed the question', 'hash') }), vdb({ tag: pill('top 50 by similarity + BM25', 'search') }), retr({ tag: pill('cross-encoder rerank → 6', 'check', 'good') })], links: [link('user', 'vdb'), link('vdb', 'retr')], flows: [flow(['user', 'vdb', 'retr'], { rate: 1.5 })] },
    },
    {
      short: 'Prompt',
      kind: 'technique',
      title: 'Assemble the prompt within a budget',
      body: [
        'The prompt contains instructions (“answer only from the context; say you don’t know otherwise; cite sources”), the retrieved chunks with their source ids, and the question. The model’s context window is a <b>budget</b>: 6 chunks × 500 tokens = 3,000 tokens plus ~600 of instructions and question = 3,600 tokens a question — <b>3.6 million prompt tokens per 1,000 questions</b>, which drives latency (prefill) and cost.',
        'More chunks is not always better: irrelevant context <i>dilutes</i> attention and models can miss information buried in the middle of a long prompt. Order by relevance, deduplicate near-identical chunks, trim, and consider compressing or summarising. Ask for <b>citations</b> (chunk ids) and verify they exist in the retrieved set.',
      ],
      changes: [{ text: '6 × 500 + 600 = 3,600 prompt tokens per question', tone: 'info' }, { text: 'More context ≠ better answers', tone: 'bad' }],
      scene: { nodes: [retr(), llm({ tag: pill('context = 6 chunks + instructions', 'file') }), ans({ tag: pill('cites chunk ids', 'check', 'good') })], links: [link('retr', 'llm'), link('llm', 'ans')], flows: [flow(['retr', 'llm', 'ans'], { rate: 1.5 })] },
    },
    {
      short: 'Beyond basic',
      kind: 'technique',
      title: 'Better retrieval strategies',
      body: [
        '<b>Query rewriting</b>: turn a conversational follow-up (“what about for contractors?”) into a standalone query, or expand it into several. <b>Parent-document / small-to-big</b>: retrieve small chunks for precision, then return their surrounding section for context. <b>Contextual chunks</b>: prepend a short document summary to each chunk so “it” and “the policy” are resolvable. <b>Structured sources</b>: route numeric questions to SQL or an API instead of the vector index.',
        '<b>Agentic RAG</b> lets the model decide to search again, with a refined query, when results look insufficient — better recall for multi-hop questions at the price of latency and cost. <b>Knowledge graphs</b> help when answers depend on relations between entities across documents.',
      ],
      scene: { nodes: [box('qr', -9, -5, 'Query rewriting', 'blue', 'refresh', { size: [1.3, 1.3], height: 22 }), box('p2', 0, 6, 'Small-to-big', 'orange', 'layers', { size: [1.3, 1.3], height: 22 }), box('sql', 9, -5, 'SQL / API for numbers', 'green', 'db', { size: [1.3, 1.3], height: 22 })], links: [], flows: [] },
    },
    {
      short: 'Failure',
      kind: 'problem',
      title: 'Where RAG goes wrong — and how to measure it',
      body: [
        'Failures separate into <b>retrieval</b> (the right passage wasn’t found: poor chunking, vocabulary mismatch, missing documents, permissions filtering it out) and <b>generation</b> (the passage was there but the model ignored it, over-generalised or invented). Check each stage separately: <b>recall@k</b> (does the top-k contain a passage that answers it?) on a labelled question set, then <b>faithfulness</b> (is every claim supported by the context?) and <b>answer relevance</b>.',
        'Build the evaluation set from real questions early; log queries, retrieved ids and answers; add feedback signals. Guard against <b>prompt injection</b> in retrieved text (documents can contain instructions) and enforce access control at retrieval, not in the prompt. Figures here are model outputs for sizing, not accuracy claims.',
      ],
      changes: [{ text: 'Measure recall@k and faithfulness separately', tone: 'good' }, { text: 'Retrieved text is untrusted input', tone: 'bad' }],
      scene: { nodes: [retr({ tag: pill('recall@k?', 'search', 'warn') }), llm({ tag: pill('faithful to context?', 'alert', 'warn') }), box('eval', 13, 6, 'Eval set + logs', 'teal', 'list', { size: [1.2, 1.2], height: 22 })], links: [link('retr', 'llm'), link('llm', 'eval', { style: 'dashed' })], flows: [flow(['retr', 'llm'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Search first, then generate from what was found',
      body: [
        'RAG = <b>chunk and embed</b> the corpus into a vector index, <b>retrieve</b> candidates (hybrid) and <b>rerank</b>, <b>assemble</b> a grounded prompt within a token budget, and <b>generate</b> with citations. Index size ≈ chunks × dimensions × 4 bytes; prompt cost ≈ k × chunk size + overhead per question.',
        'Quality is mostly retrieval quality: chunking, hybrid search, reranking and evaluation matter more than the choice of model. Keep permissions at retrieval and treat documents as untrusted.',
      ],
      scene: { nodes: [docs(), chunker(), vdb(), user(), retr(), llm(), ans()], links: [link('docs', 'chunk'), link('chunk', 'vdb'), link('user', 'retr'), link('vdb', 'retr', { style: 'dashed', arrow: 'both' }), link('retr', 'llm'), link('llm', 'ans')], flows: [flow(['user', 'retr', 'llm', 'ans'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
