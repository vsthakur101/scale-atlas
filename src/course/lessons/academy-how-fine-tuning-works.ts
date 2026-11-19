import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const data = (extra: Partial<SceneNode> = {}) => db('data', -15, 0, 'Training examples', { size: [1.3, 1.3], ...extra });
const base = (extra: Partial<SceneNode> = {}) => box('base', -6, 0, 'Pretrained model', 'purple', 'layers', { size: [1.6, 1.6], height: 34, ...extra });
const trainer = (extra: Partial<SceneNode> = {}) => box('trainer', 3, 0, 'Training loop', 'orange', 'refresh', { size: [1.4, 1.4], height: 28, ...extra });
const out = (extra: Partial<SceneNode> = {}) => box('out', 12, 0, 'Tuned model / adapter', 'green', 'check', { size: [1.4, 1.4], height: 28, ...extra });
const adapter = (extra: Partial<SceneNode> = {}) => disk('adapter', 12, 7, 'LoRA adapter', { size: [2.2, 1], height: 10, tone: 'yellow', ...extra });

const fmtGB = (gb: number): string => (gb >= 1000 ? `${(gb / 1000).toFixed(2)} TB` : gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`);
const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : `${Math.round(n / 1e3)}k`);

const lesson: Lesson = {
  slug: 'academy-how-fine-tuning-works',
  title: 'How Fine-Tuning Works: Full, LoRA and QLoRA',
  blurb: 'Continuing training on your own examples — what it changes, why full fine-tuning needs ~16 bytes per parameter, and how low-rank adapters shrink the trainable part to a fraction of a percent.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'train', label: 'LoRA trainable parameters', icon: 'layers' },
    { key: 'full', label: 'Memory: full fine-tune', icon: 'disk' },
    { key: 'lora', label: 'Memory: LoRA (16-bit base)', icon: 'disk' },
    { key: 'qlora', label: 'Memory: QLoRA (4-bit base)', icon: 'disk' },
  ],
  goals: [
    { text: 'What fine-tuning changes versus prompting and RAG', step: 1 },
    { text: 'Supervised fine-tuning data and the training loop', step: 2 },
    { text: 'Why full fine-tuning needs so much memory', step: 3 },
    { text: 'LoRA: low-rank adapters', step: 4 },
    { text: 'QLoRA, evaluation and forgetting', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'params', label: 'Model size', min: 1, max: 405, step: 1, default: 70, unit: ' B params', description: 'Base model parameters in billions.' },
      { key: 'd', label: 'Hidden dimension', min: 1024, max: 16384, step: 256, default: 8192, unit: '', description: 'Width of the transformer’s projection matrices.' },
      { key: 'layers', label: 'Layers', min: 12, max: 128, step: 1, default: 80, unit: '', description: 'Transformer layers.' },
      { key: 'rank', label: 'LoRA rank r', min: 1, max: 256, step: 1, default: 16, unit: '', description: 'Rank of the low-rank update matrices.' },
      { key: 'mats', label: 'Adapted matrices per layer', min: 1, max: 7, step: 1, default: 4, unit: '', description: 'e.g. query, key, value, output projections.' },
    ],
    calculate: (input, step) => {
      const p = Math.max(0.1, input.params ?? 70) * 1e9;
      const d = Math.max(1, input.d ?? 8192);
      const L = Math.max(1, input.layers ?? 80);
      const r = Math.max(1, input.rank ?? 16);
      const m = Math.max(1, input.mats ?? 4);
      // Each adapted d×d matrix gets two low-rank factors A (d×r) and B (r×d).
      const trainable = L * m * 2 * d * r;
      // Mixed-precision Adam: fp16 weights (2) + fp16 grads (2) + fp32 master weights (4) + two fp32 moments (8) = 16 B/param.
      const full = (p * 16) / 1e9;
      const lora = (p * 2) / 1e9 + (trainable * 16) / 1e9;
      const qlora = (p * 0.5) / 1e9 + (trainable * 16) / 1e9;
      return {
        train: step < 3 ? { v: '—' } : { v: `${fmtN(trainable)} (${((trainable / p) * 100).toFixed(2)}% of the model)`, tone: 'good' },
        full: step < 2 ? { v: '—' } : { v: fmtGB(full), tone: 'bad' },
        lora: step < 3 ? { v: '—' } : { v: fmtGB(lora), tone: lora > 160 ? 'warn' : 'good' },
        qlora: step < 4 ? { v: '—' } : { v: fmtGB(qlora), tone: qlora > 80 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'Changing the weights, not just the prompt',
      body: [
        'A pretrained model has general ability. You can steer it by <b>prompting</b> (instructions and examples in context), give it facts with <b>retrieval</b> (RAG), or change the model itself by <b>fine-tuning</b> — continuing training on your own examples so the behaviour is built into the weights. Prompts and retrieval are cheap and instant but spend context on every call; fine-tuning costs training but makes the behaviour cheaper and more consistent at inference.',
        'Fine-tuning is best at <b>behaviour and format</b>: a consistent tone, a strict output structure, domain vocabulary, a narrow task done well by a small model. It is poor at <b>adding changing facts</b> (use retrieval: weights go stale, can’t cite sources, and hallucinate details). Start with prompting and RAG, evaluate, and fine-tune only for a measured gap.',
      ],
      changes: [{ text: 'Prompt → RAG → fine-tune, in order of effort', tone: 'info' }, { text: 'Fine-tune for behaviour; retrieve for facts', tone: 'good' }],
      scene: { nodes: [data(), base(), trainer(), out()], links: [link('data', 'trainer'), link('base', 'trainer'), link('trainer', 'out')], flows: [flow(['data', 'trainer', 'out'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'SFT',
      kind: 'technique',
      title: 'Supervised fine-tuning: data and the loop',
      body: [
        '<b>Supervised fine-tuning (SFT)</b> trains on (input, ideal output) pairs — instruction/response examples, conversations, structured extractions. The model predicts each next token of the ideal answer and the loss (cross-entropy) is computed on the answer tokens; gradients update the weights via an optimiser (Adam) over a few epochs at a small learning rate.',
        '<b>Data quality dominates</b>: hundreds to a few thousand excellent, diverse, consistently formatted examples often beat tens of thousands of noisy ones. Hold out a validation set, watch for overfitting (validation loss rising), deduplicate, and include the hard cases you care about. <b>Preference tuning</b> (DPO, RLHF) goes further: train on pairs of preferred vs rejected answers to shape judgement and style.',
      ],
      changes: [{ text: 'Loss on the ideal answer tokens', tone: 'info' }, { text: 'Hundreds of great examples > thousands of noisy ones', tone: 'good' }],
      scene: { nodes: [data({ tag: pill('prompt → ideal answer', 'file') }), trainer({ tag: pill('predict next token, update weights', 'refresh') }), out({ tag: pill('validate on held-out set', 'check') })], links: [link('data', 'trainer'), link('trainer', 'out')], flows: [flow(['data', 'trainer', 'out'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Memory',
      kind: 'problem',
      title: 'Full fine-tuning: ~16 bytes per parameter',
      body: [
        'Updating every weight needs far more than the weights. With mixed-precision training and Adam: <b>fp16 weights</b> (2 B) + <b>fp16 gradients</b> (2 B) + <b>fp32 master copy</b> (4 B) + <b>two fp32 optimiser moments</b> (8 B) = <b>16 bytes per parameter</b>, before activations. A 70B model needs <b>~1.1 TB</b> — a cluster of 16+ accelerators with sharded optimiser state — compared with 140 GB just to serve it.',
        'Each task also produces a complete, separate copy of the model (140 GB) to store and serve, and the model can <b>forget</b> general abilities (catastrophic forgetting). That cost is why most teams reach for parameter-efficient methods.',
      ],
      changes: [{ text: '70B × 16 B = 1.1 TB of training state', tone: 'bad' }, { text: 'One full model copy per task', tone: 'bad' }],
      scene: { nodes: [base({ tag: pill('all weights trainable', 'alert', 'warn') }), trainer({ state: 'hot', load: 100, tag: pill('weights + grads + Adam states', 'disk', 'bad') }), out({ tag: pill('140 GB per task', 'disk', 'warn') })], links: [link('base', 'trainer'), link('trainer', 'out')], flows: [flow(['base', 'trainer'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'LoRA',
      kind: 'technique',
      title: 'LoRA: learn a small low-rank update',
      body: [
        'The insight: the <i>change</i> a task needs is low-rank. Freeze the original weight matrix <code>W</code> (d×d) and learn a correction <code>ΔW = B·A</code> where <code>A</code> is r×d and <code>B</code> is d×r with a small <b>rank r</b> (16). The layer computes <code>Wx + BAx</code>. Only A and B are trained: <code>2 × d × r</code> parameters per adapted matrix instead of d².',
        'With d = 8,192, r = 16, four matrices (q,k,v,o) in each of 80 layers: 80 × 4 × 2 × 8,192 × 16 ≈ <b>84 million trainable parameters — 0.12% of 70B</b>. Optimiser state exists only for those: training memory falls from ~1.1 TB to ~140 GB (frozen fp16 weights) + ~1.3 GB (adapter state). The result is a <b>tiny adapter file</b> (~170 MB) that can be loaded, swapped or merged into the base weights — one base model serving many fine-tunes.',
      ],
      changes: [{ text: 'ΔW = B·A, rank r ≪ d', tone: 'info' }, { text: '84M trainable parameters (0.12%) at r = 16', tone: 'good' }, { text: 'Adapter ≈ 170 MB; swap per task', tone: 'good' }],
      concepts: [{ term: 'LoRA', def: 'Low-Rank Adaptation: freezing pretrained weights and training small low-rank matrices whose product is added to selected layers.' }],
      scene: { nodes: [base({ tag: pill('frozen W', 'lock') }), box('ab', -1, 7, 'A (r×d) · B (d×r)', 'green', 'layers', { size: [1.3, 1.3], height: 20, tag: pill('trainable', 'bolt', 'good') }), trainer(), adapter({ tag: pill('~170 MB', 'check', 'good') })], links: [link('base', 'trainer'), link('ab', 'trainer'), link('trainer', 'adapter')], flows: [flow(['ab', 'trainer', 'adapter'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'QLoRA',
      kind: 'technique',
      title: 'QLoRA: quantize the frozen base',
      body: [
        '<b>QLoRA</b> goes further: store the frozen base weights in <b>4-bit</b> (NF4 quantization, dequantized on the fly per layer) and train LoRA adapters in 16-bit on top. The 70B base shrinks from 140 GB to <b>35 GB</b>, so fine-tuning fits on a single 48–80 GB GPU (plus adapter state and activations), at some speed cost and a small quality gap versus 16-bit LoRA.',
        'Useful knobs: <b>rank r</b> (higher = more capacity and memory), <b>which matrices</b> to adapt (all linear layers often helps), learning rate, <b>gradient checkpointing</b> (trade compute for activation memory) and sequence length. Merge the adapter into the base for serving, or serve many adapters on one base with batching across them.',
      ],
      changes: [{ text: '4-bit base: 70B → 35 GB', tone: 'good' }, { text: 'Fits on a single large GPU for training', tone: 'good' }],
      scene: { nodes: [base({ tag: pill('4-bit frozen base', 'layers') }), trainer({ tag: pill('16-bit adapters', 'bolt') }), adapter()], links: [link('base', 'trainer'), link('trainer', 'adapter')], flows: [flow(['base', 'trainer', 'adapter'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Evaluate',
      kind: 'problem',
      title: 'Did it help? Evaluation, forgetting and overfitting',
      body: [
        'Measure before and after with an <b>eval set</b> built from real tasks (see the Evals lesson) — including <b>regression</b> checks on general abilities the tuning shouldn’t hurt. Too many epochs on a small dataset <b>overfits</b>: the model memorises examples and loses generality. Too aggressive a learning rate or too high a rank can cause forgetting. Compare against a strong prompt-and-RAG baseline: if it matches, you didn’t need to fine-tune.',
        'Also plan the lifecycle: data collection and cleaning, versioned datasets, reproducible training runs, safety evaluation (fine-tuning can erode a model’s safety behaviour), and re-tuning when the base model is upgraded — your adapter doesn’t transfer to a new base. Figures here are model arithmetic for memory sizing.',
      ],
      changes: [{ text: 'Eval + regression suite; compare to a prompt/RAG baseline', tone: 'good' }, { text: 'Adapters don’t carry over to a new base model', tone: 'info' }],
      scene: { nodes: [out({ tag: pill('vs baseline', 'gauge') }), box('ev', 3, 7, 'Eval + regression + safety', 'teal', 'list', { size: [1.3, 1.3], height: 22 })], links: [link('out', 'ev', { style: 'dashed' })], flows: [flow(['out', 'ev'], { rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Freeze the giant, train a small correction',
      body: [
        'Fine-tuning shapes <b>behaviour</b>; retrieval supplies <b>facts</b>. Full fine-tuning needs ~16 bytes per parameter (≈1.1 TB for 70B). <b>LoRA</b> trains rank-r adapters — <code>2 × d × r</code> parameters per adapted matrix, 0.12% of the model at r = 16 — and <b>QLoRA</b> adds a 4-bit frozen base (35 GB for 70B).',
        'Invest in a small, excellent dataset, evaluate against a prompt/RAG baseline and for regressions, and expect to repeat when the base model changes.',
      ],
      scene: { nodes: [data(), base(), trainer(), adapter()], links: [link('data', 'trainer'), link('base', 'trainer'), link('trainer', 'adapter')], flows: [flow(['data', 'trainer', 'adapter'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
