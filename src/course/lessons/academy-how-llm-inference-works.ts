import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -15, 0, 10, 'requests', extra);
const sched = (extra: Partial<SceneNode> = {}) => box('sched', -8, 0, 'Batch scheduler', 'orange', 'route', { size: [1.3, 1.3], height: 26, ...extra });
const gpu = (extra: Partial<SceneNode> = {}) => box('gpu', 0, 0, 'GPUs', 'purple', 'cpu', { size: [2, 1.6], height: 34, ...extra });
const weights = (extra: Partial<SceneNode> = {}) => box('w', 9, -6, 'Weights', 'blue', 'layers', { size: [1.4, 1.4], height: 26, ...extra });
const kv = (extra: Partial<SceneNode> = {}) => db('kv', 9, 6, 'KV cache', { size: [1.4, 1.4], ...extra });

const fmtGB = (gb: number): string => (gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB` : gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`);
const fmtS = (s: number): string => (s >= 1 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`);

const KV_MB_PER_TOKEN_70B = 0.32; // 80 layers × 8 KV heads × 128 dim × 2 (K and V) × 2 bytes (fp16)

const lesson: Lesson = {
  slug: 'academy-how-llm-inference-works',
  title: 'LLM Inference: Prefill, Decode and the KV Cache',
  blurb: 'Prefill is compute-bound, decode is memory-bandwidth-bound, and the KV cache is the memory bill that long context and big batches keep running up.',
  minutes: 15,
  level: 'Advanced',
  metrics: [
    { key: 'weights', label: 'Model weights in memory', icon: 'layers' },
    { key: 'kvseq', label: 'KV cache per sequence', icon: 'disk' },
    { key: 'mem', label: 'GPU memory used', icon: 'gauge' },
    { key: 'ttft', label: 'Time to first token (prefill)', icon: 'clock' },
    { key: 'tps', label: 'Decode speed per user', icon: 'activity' },
    { key: 'agg', label: 'Aggregate tokens / second', icon: 'bolt' },
  ],
  goals: [
    { text: 'Two phases: prefill and decode, and why they differ', step: 1 },
    { text: 'Why decoding is limited by memory bandwidth', step: 3 },
    { text: 'The KV cache and what long context costs', step: 4 },
    { text: 'How batching raises throughput and where it stops', step: 5 },
    { text: 'Quantization, speculative decoding and paged attention', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'params', label: 'Model size', min: 1, max: 405, step: 1, default: 70, unit: ' B params', description: 'Parameters, in billions. KV size below assumes a 70B-class architecture scaled by size (approximate).' },
      { key: 'bits', label: 'Bits per weight', min: 4, max: 16, step: 4, default: 16, unit: ' bits', description: '16 = fp16/bf16, 8 = int8, 4 = int4 quantization.' },
      { key: 'gpus', label: 'GPUs (tensor-parallel)', min: 1, max: 16, step: 1, default: 2, unit: '', description: 'Accelerators sharing the model.' },
      { key: 'mem', label: 'Memory per GPU', min: 16, max: 192, step: 8, default: 80, unit: ' GB', description: 'High-bandwidth memory per accelerator.' },
      { key: 'bw', label: 'Memory bandwidth per GPU', min: 0.5, max: 8, step: 0.1, default: 3, unit: ' TB/s', description: 'Peak HBM bandwidth per accelerator (use ~70–80% in practice).' },
      { key: 'tf', label: 'Effective compute per GPU', min: 50, max: 2000, step: 10, default: 400, unit: ' TFLOP/s', description: 'Sustained matrix-multiply throughput after utilisation losses.' },
      { key: 'ctx', label: 'Prompt + generated length', min: 128, max: 131072, step: 128, default: 4096, unit: ' tokens', description: 'Tokens held in each sequence’s KV cache.' },
      { key: 'batch', label: 'Concurrent sequences (batch)', min: 1, max: 256, step: 1, default: 8, unit: '', description: 'Requests decoded together.' },
    ],
    calculate: (input, step) => {
      const p = Math.max(0.1, input.params ?? 70);
      const bits = Math.max(2, input.bits ?? 16);
      const gpus = Math.max(1, Math.round(input.gpus ?? 2));
      const mem = Math.max(1, input.mem ?? 80);
      const bw = Math.max(0.1, input.bw ?? 3) * 1000 * 0.75; // GB/s, ~75% achievable
      const tf = Math.max(1, input.tf ?? 400);
      const ctx = Math.max(1, input.ctx ?? 4096);
      const b = Math.max(1, Math.round(input.batch ?? 8));
      const wGB = (p * bits) / 8;
      const kvSeqGB = (KV_MB_PER_TOKEN_70B * (p / 70) * ctx) / 1000;
      const used = wGB + kvSeqGB * b;
      const cap = gpus * mem;
      // Prefill: ≈ 2 FLOPs per parameter per token.
      const ttft = (2 * p * 1e9 * ctx) / (gpus * tf * 1e12);
      // Each decode step streams the weights once plus every sequence’s KV cache.
      const stepS = (wGB + kvSeqGB * b) / (gpus * bw);
      const fits = used <= cap;
      return {
        weights: step < 2 ? { v: '—' } : { v: fmtGB(wGB), tone: wGB > cap ? 'bad' : 'good' },
        kvseq: step < 3 ? { v: '—' } : { v: fmtGB(kvSeqGB) },
        mem: step < 3 ? { v: '—' } : { v: `${fmtGB(used)} of ${fmtGB(cap)}${fits ? '' : ' — does not fit'}`, tone: !fits ? 'bad' : used / cap > 0.9 ? 'warn' : 'good' },
        ttft: step < 1 ? { v: '—' } : { v: fmtS(ttft), tone: ttft < 1 ? 'good' : ttft < 5 ? 'warn' : 'bad' },
        tps: step < 2 ? { v: '—' } : fits ? { v: `${(1 / stepS).toFixed(1)} tok/s`, tone: 1 / stepS > 30 ? 'good' : 1 / stepS > 10 ? 'warn' : 'bad' } : { v: '—', tone: 'bad' },
        agg: step < 4 ? { v: '—' } : fits ? { v: `${Math.round(b / stepS).toLocaleString('en-US')} tok/s`, tone: 'good' } : { v: '—', tone: 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Two phases',
      kind: 'insight',
      title: 'Prefill, then decode',
      body: [
        'A language model generates text one token at a time, each conditioned on everything before it. Serving a request has <b>two phases</b>. <b>Prefill</b> processes the entire prompt in one parallel pass, producing the first output token and the attention state for the prompt. <b>Decode</b> then generates the rest <i>sequentially</i>: each new token needs a full pass through the model, because it depends on the previous one.',
        'The phases stress different resources: prefill is <b>compute-bound</b> (lots of matrix multiplication on many tokens at once), decode is <b>memory-bandwidth-bound</b> (little arithmetic per byte read). Almost every inference optimisation targets one of them, and the sliders above show the numbers for each.',
      ],
      scene: { nodes: [users({ tag: pill('prompt: 4,096 tokens', 'file') }), gpu({ tag: pill('prefill → decode, token by token', 'refresh') })], links: [link('users', 'gpu')], flows: [flow(['users', 'gpu'], { kind: 'heavy', rate: 2 })] },
    },
    {
      short: 'Prefill',
      kind: 'technique',
      title: 'Prefill: compute-bound, sets time-to-first-token',
      body: [
        'A transformer needs roughly <b>2 FLOPs per parameter per token</b>. A 70B model processing a 4,096-token prompt does about 2 × 70×10⁹ × 4,096 ≈ 5.7×10¹⁴ FLOPs. On 2 GPUs sustaining 400 TFLOP/s each that is <b>~0.7 s</b> — the <b>time to first token</b> a user feels. All prompt tokens are processed in parallel, so the matrix units stay busy.',
        'Longer prompts scale prefill linearly (and attention’s cost quadratically at extremes). Splitting prefill into chunks and running it alongside ongoing decodes avoids a large prompt stalling everyone else’s generation, and <b>prefix caching</b> reuses the KV state of a shared system prompt so it is computed once.',
      ],
      changes: [{ text: 'FLOPs ≈ 2 × params × prompt tokens', tone: 'info' }, { text: '70B, 4k tokens, 2 GPUs ≈ 0.7 s', tone: 'info' }],
      scene: { nodes: [users(), gpu({ load: 95, tag: pill('compute-bound', 'cpu', 'warn') })], links: [link('users', 'gpu')], flows: [flow(['users', 'gpu'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Decode',
      kind: 'problem',
      title: 'Decode: every token streams the whole model',
      body: [
        'To produce one token the GPU must read <b>every weight</b> from memory, do a tiny amount of arithmetic with it, and write one small result. A 70B model in fp16 is <b>140 GB</b>; reading it once per token at an aggregate 2 × 3 TB/s × 75% = 4.5 TB/s takes ~31 ms. Hence a ceiling around <b>30 tokens per second for one user</b>, regardless of how much compute the GPUs have — the arithmetic units are mostly idle, waiting for memory.',
        'Rule: <code>tokens/s ≈ memory bandwidth ÷ bytes read per token</code>. That is why smaller models are faster, why <b>quantization</b> (4-bit weights = a quarter of the bytes) speeds decoding almost proportionally, and why faster memory (HBM generations) matters more than raw TFLOPs for generation.',
      ],
      changes: [{ text: 'tokens/s ≈ bandwidth ÷ model bytes', tone: 'info' }, { text: '140 GB ÷ 4.5 TB/s ≈ 31 ms per token', tone: 'info' }],
      scene: { nodes: [gpu({ load: 20, tag: pill('mostly waiting for memory', 'clock', 'warn') }), weights({ tag: pill('read fully every token', 'refresh') })], links: [link('w', 'gpu', { arrow: 'end' })], flows: [flow(['w', 'gpu'], { kind: 'heavy', rate: 3, speed: 1.2 })] },
    },
    {
      short: 'KV cache',
      kind: 'technique',
      title: 'The KV cache: remembering without recomputing',
      body: [
        'Attention at each new token needs the <b>keys and values</b> of all previous tokens. Recomputing them every step would be quadratic work; instead the model <b>caches</b> them. Per token that is <code>2 × layers × KV heads × head dim × bytes</code> — for a 70B-class model with grouped-query attention about <b>0.32 MB per token</b>. A 4,096-token sequence therefore holds <b>1.3 GB</b>; 128k tokens, over 40 GB — for <i>one</i> request.',
        'The cache grows with every generated token, is read in full each step (adding to the bandwidth bill), and must fit alongside the weights. It is the reason long contexts are expensive and why GPU memory, not compute, usually limits how many users you serve. Techniques: <b>grouped/multi-query attention</b> (fewer KV heads), <b>KV quantization</b>, <b>sliding windows</b>, and <b>paged attention</b> to avoid fragmentation.',
      ],
      changes: [{ text: '~0.32 MB per token (70B-class)', tone: 'info' }, { text: '4k context ≈ 1.3 GB · 128k ≈ 42 GB per sequence', tone: 'bad' }],
      concepts: [{ term: 'KV cache', def: 'Stored attention keys and values for all previous tokens, reused each decode step instead of recomputed.' }],
      scene: { nodes: [gpu(), weights(), kv({ tag: pill('grows per token, per user', 'disk', 'warn') })], links: [link('w', 'gpu', { arrow: 'end' }), link('kv', 'gpu', { arrow: 'end' })], flows: [flow(['w', 'gpu'], { rate: 2 }), flow(['kv', 'gpu'], { rate: 1.5 })] },
    },
    {
      short: 'Batching',
      kind: 'technique',
      title: 'Batching: share one read of the weights',
      body: [
        'If the weights are read once per step anyway, decode <b>several sequences in the same step</b>: the weight read is amortised across the batch, while each sequence adds only its own KV read. Throughput scales almost linearly with batch size until KV reads and memory capacity dominate: at the defaults a step reads 140 GB of weights + 8 × 1.3 GB of KV ≈ 150 GB ≈ 33 ms: <b>8 users each get ~30 tok/s and the server produces ~240 tok/s</b> — 7.5× the throughput for ~6% more latency than a single user.',
        '<b>Continuous (in-flight) batching</b> adds and removes sequences at every step instead of waiting for a whole batch to finish, keeping the GPU full when requests have different lengths. The limit is memory: weights + batch × KV must fit — raise the batch or context until “GPU memory used” turns red.',
      ],
      changes: [{ text: 'Weights read once, shared by the batch', tone: 'good' }, { text: 'Batch 8: ~30 tok/s each, ~240 tok/s total', tone: 'good' }, { text: 'Capped by KV memory', tone: 'info' }],
      concepts: [{ term: 'Continuous batching', def: 'Scheduling at token granularity so finished sequences leave and new ones join the running batch without waiting.' }],
      scene: { nodes: [users({ tag: pill('8 sequences together', 'layers') }), sched({ tag: pill('adds/removes per step', 'refresh') }), gpu({ load: 70 })], links: [link('users', 'sched'), link('sched', 'gpu')], flows: [flow(['users', 'sched', 'gpu'], { rate: 3 })] },
    },
    {
      short: 'Faster',
      kind: 'technique',
      title: 'Doing more with the same hardware',
      body: [
        '<b>Quantization</b> to int8/int4 cuts weight bytes (and often KV bytes), directly speeding decode and freeing memory for larger batches, at a small accuracy cost. <b>Speculative decoding</b>: a small <i>draft</i> model proposes several tokens, and the big model <b>verifies them all in one pass</b> — if most are accepted you get multiple tokens per weight read. <b>Paged attention</b> stores KV in fixed blocks like virtual memory, eliminating fragmentation and enabling sharing across requests.',
        '<b>Prefix caching</b> reuses KV for shared prompts; <b>tensor/pipeline parallelism</b> splits the model across GPUs (adding bandwidth, plus communication cost); <b>FlashAttention</b>-style kernels cut memory traffic in attention. Together these are why the same model can differ 5–10× in cost per token between naive and tuned serving.',
      ],
      changes: [{ text: '4-bit weights ≈ 4× less to read per token', tone: 'good' }, { text: 'Speculative decoding: several tokens per big-model pass', tone: 'good' }],
      scene: { nodes: [box('q', -8, -5, 'Quantization', 'blue', 'layers', { size: [1.3, 1.3], height: 22, tag: pill('fewer bytes', 'check') }), box('sp', 2, -5, 'Speculative decoding', 'orange', 'bolt', { size: [1.3, 1.3], height: 24, tag: pill('draft + verify', 'check') }), box('pg', 12, -5, 'Paged KV cache', 'purple', 'disk', { size: [1.3, 1.3], height: 22 }), box('pc', -3, 6, 'Prefix caching', 'green', 'hash', { size: [1.3, 1.3], height: 22 }), box('tp', 7, 6, 'Tensor parallel', 'teal', 'share', { size: [1.3, 1.3], height: 22 })], links: [], flows: [] },
    },
    {
      short: 'Trade-offs',
      kind: 'tradeoff',
      title: 'Latency, throughput and cost pull apart',
      body: [
        'A bigger batch lowers <b>cost per token</b> (the weights are shared) but raises each user’s inter-token latency and the memory needed. Long contexts cut how many users fit. Reasoning models that emit thousands of “thinking” tokens multiply decode work per answer. Serving teams therefore define <b>SLOs</b> (time to first token, tokens per second per user) and tune batch size, quantization and parallelism to meet them at the lowest cost.',
        'Separating <b>prefill and decode onto different machines</b> (disaggregated serving) lets each be sized for its own bottleneck; routing by prompt length and caching prefixes at the load balancer further smooth things. Figures here are first-order models (bandwidth ÷ bytes, 2 FLOPs/param) — real systems differ by overheads and kernels, so always benchmark.',
      ],
      scene: { nodes: [box('pf', -7, 0, 'Prefill pool (compute)', 'orange', 'cpu', { size: [1.5, 1.5], height: 28 }), box('dc', 8, 0, 'Decode pool (bandwidth + memory)', 'purple', 'disk', { size: [1.5, 1.5], height: 28 })], links: [link('pf', 'dc', { arrow: 'end', label: pill('KV transfer', 'share') })], flows: [flow(['pf', 'dc'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Compute for the prompt, bandwidth for the answer, memory for everyone',
      body: [
        '<b>Prefill</b> (≈ 2 FLOPs × params × prompt tokens) is compute-bound and sets time-to-first-token. <b>Decode</b> is bandwidth-bound: <code>tokens/s ≈ bandwidth ÷ (weights + KV bytes)</code>. The <b>KV cache</b> (~0.32 MB/token for a 70B-class model) grows with context and batch and is the usual capacity limit. <b>Continuous batching</b> multiplies throughput; quantization, speculative decoding, paged attention and prefix caching stretch the hardware.',
        'Size a deployment by working out weights + batch × KV against GPU memory, then divide bandwidth by bytes per step for speed.',
      ],
      scene: { nodes: [users(), sched(), gpu(), weights(), kv()], links: [link('users', 'sched'), link('sched', 'gpu'), link('w', 'gpu', { arrow: 'end' }), link('kv', 'gpu', { arrow: 'end' })], flows: [flow(['users', 'sched', 'gpu'], { rate: 2 })] },
    },
  ],
};

export default lesson;
