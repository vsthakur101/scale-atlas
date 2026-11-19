import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const q = (extra: Partial<SceneNode> = {}) => box('q', -15, 0, 'Query vector', 'green', 'search', { size: [1.2, 1.2], height: 24, ...extra });
const router = (extra: Partial<SceneNode> = {}) => box('router', -7, 0, 'Router / coarse index', 'orange', 'route', { size: [1.3, 1.3], height: 28, ...extra });
const shard = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`s${i}`, 3, (i - (n - 1) / 2) * 4.5, name, 'blue', 'db', { size: [1.2, 1.2], height: 24, ...extra });
const merge = (extra: Partial<SceneNode> = {}) => box('merge', 12, 0, 'Merge top-k', 'purple', 'layers', { size: [1.3, 1.3], height: 26, ...extra });

const fmtB = (b: number): string => (b >= 1e15 ? `${(b / 1e15).toFixed(1)} PB` : b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB` : `${Math.round(b / 1e6)} MB`);
const fmtN = (n: number): string => (n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'academy-how-vector-database-search-billions-of-vectors-in-milliseconds',
  title: 'Vector Search at Scale: IVF, PQ and HNSW',
  blurb: 'Approximate nearest-neighbour search: why exact search is too slow, how clustering and graph indexes prune it, how product quantization shrinks memory 50×, and the recall trade-off.',
  minutes: 15,
  level: 'Advanced',
  metrics: [
    { key: 'raw', label: 'Raw float32 index', icon: 'disk' },
    { key: 'pq', label: 'With product quantization', icon: 'layers' },
    { key: 'scan', label: 'Vectors scanned per query (IVF)', icon: 'search' },
    { key: 'speed', label: 'Work saved vs exact scan', icon: 'gauge' },
    { key: 'nodes', label: 'Memory nodes for the compressed index', icon: 'server' },
  ],
  goals: [
    { text: 'Why exact nearest-neighbour search doesn’t scale', step: 1 },
    { text: 'IVF: cluster first, search only a few clusters', step: 3 },
    { text: 'Product quantization: compress vectors to bytes', step: 4 },
    { text: 'HNSW: navigating a layered graph', step: 5 },
    { text: 'Recall vs latency, filtering and updates', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Vectors', min: 1000000, max: 100000000000, step: 1000000, default: 1000000000, unit: '', description: 'Embeddings in the index.' },
      { key: 'd', label: 'Dimensions', min: 64, max: 4096, step: 64, default: 768, unit: '', description: 'Length of each vector.' },
      { key: 'm', label: 'PQ bytes per vector', min: 8, max: 256, step: 8, default: 64, unit: ' B', description: 'Size of each compressed code (m sub-vectors × 8 bits).' },
      { key: 'nlist', label: 'IVF clusters', min: 256, max: 1048576, step: 256, default: 65536, unit: '', description: 'Number of coarse clusters.' },
      { key: 'nprobe', label: 'Clusters searched per query', min: 1, max: 1024, step: 1, default: 32, unit: '', description: 'How many nearest clusters to scan.' },
      { key: 'ram', label: 'RAM per node', min: 64, max: 2048, step: 64, default: 512, unit: ' GB', description: 'Memory available for the index per machine.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, input.n ?? 1e9);
      const d = Math.max(1, input.d ?? 768);
      const m = Math.max(1, input.m ?? 64);
      const nlist = Math.max(1, input.nlist ?? 65536);
      const nprobe = Math.min(nlist, Math.max(1, input.nprobe ?? 32));
      const ram = Math.max(1, input.ram ?? 512) * 1e9;
      const raw = n * d * 4;
      const pq = n * m;
      const scanned = n * (nprobe / nlist);
      // Exact search: ~d multiply-adds per vector. IVF: compare to nlist centroids, then ~m table lookups per scanned vector.
      const exactOps = n * d;
      const ivfOps = nlist * d + scanned * m;
      const nodes = Math.max(1, Math.ceil(pq / (ram * 0.7)));
      return {
        raw: step < 1 ? { v: '—' } : { v: fmtB(raw), tone: raw > 1e12 ? 'bad' : 'warn' },
        pq: step < 3 ? { v: '—' } : { v: `${fmtB(pq)} (${(raw / pq).toFixed(0)}× smaller)`, tone: 'good' },
        scan: step < 2 ? { v: '—' } : { v: `${fmtN(scanned)} (${((nprobe / nlist) * 100).toFixed(3)}% of index)`, tone: 'good' },
        speed: step < 2 ? { v: '—' } : { v: `${fmtN(exactOps / ivfOps)}× fewer operations`, tone: 'good' },
        nodes: step < 3 ? { v: '—' } : { v: `${nodes} × ${Math.round(ram / 1e9)} GB`, tone: nodes <= 4 ? 'good' : nodes <= 20 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Exact cost',
      kind: 'problem',
      title: 'Nearest neighbours by brute force',
      body: [
        'Embedding models turn text, images and audio into vectors; “find similar items” becomes “find the vectors nearest to this one” (cosine, dot product or Euclidean distance). The exact method compares the query with every stored vector: <code>N × d</code> multiply-adds. For a billion 768-dimensional vectors that is <b>7.7×10¹¹ operations and 3 TB of memory traffic per query</b> — seconds, and impossible at hundreds of queries a second.',
        'High dimensions also defeat the classic spatial trees (k-d trees, R-trees): beyond ~20 dimensions they degrade to scanning. The practical answer is <b>approximate nearest-neighbour (ANN)</b> search: accept that you may miss a true neighbour occasionally (measured as <b>recall@k</b>) in exchange for orders of magnitude less work.',
      ],
      changes: [{ text: '1B × 768 dims = 7.7×10¹¹ ops per query', tone: 'bad' }, { text: '1B × 768 × 4 B = 3.07 TB raw', tone: 'bad' }],
      scene: { nodes: [q(), box('all', 2, 0, 'Compare with every vector', 'red', 'list', { size: [1.6, 1.6], height: 30, state: 'hot', tag: pill('O(N × d)', 'alert', 'bad') })], links: [link('q', 'all')], flows: [flow(['q', 'all'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Metrics',
      kind: 'insight',
      title: 'Similarity measures and normalisation',
      body: [
        '<b>Cosine similarity</b> compares direction (the angle), ignoring length — the default for text embeddings. <b>Dot product</b> also rewards magnitude. <b>Euclidean (L2)</b> measures straight-line distance. If vectors are <b>L2-normalised</b> to length 1, all three give the same ranking, so most systems normalise once at write time and use fast inner products.',
        'Use the metric your embedding model was trained with. Distances in high dimensions concentrate (everything is “about equally far”), so rankings depend on small differences — one reason recall must be measured rather than assumed, and why quantization error matters.',
      ],
      scene: { nodes: [box('cos', -8, 0, 'Cosine', 'blue', 'gauge', { size: [1.2, 1.2], height: 22, tag: pill('angle', 'gauge') }), box('dot', 0, 0, 'Dot product', 'orange', 'gauge', { size: [1.2, 1.2], height: 22, tag: pill('angle + length', 'gauge') }), box('l2', 8, 0, 'Euclidean', 'green', 'gauge', { size: [1.2, 1.2], height: 22, tag: pill('distance', 'gauge') })], links: [], flows: [] },
    },
    {
      short: 'IVF',
      kind: 'technique',
      title: 'IVF: cluster first, search a few clusters',
      body: [
        'An <b>inverted file (IVF)</b> index runs k-means to partition the space into <code>nlist</code> clusters (65,536 here), each with a centroid, and stores every vector in its nearest cluster’s list. At query time compare the query with the <b>centroids</b> only, pick the <code>nprobe</code> nearest (32), and scan <i>just those lists</i>.',
        'That examines <code>N × nprobe ÷ nlist</code> = 1B × 32 ÷ 65,536 ≈ <b>488,000 vectors — 0.049% of the index</b>, thousands of times less work than exact search. The knob is <b>nprobe</b>: more clusters scanned means higher recall and more latency. The weakness: a true neighbour that sits just across a cluster boundary is missed unless you probe more.',
      ],
      changes: [{ text: 'Scan N × nprobe ÷ nlist vectors', tone: 'info' }, { text: 'Higher nprobe → higher recall, more latency', tone: 'info' }],
      concepts: [{ term: 'IVF', def: 'Inverted file index: vectors grouped into clusters, searched by probing only the clusters nearest the query.' }],
      scene: { nodes: [q(), router({ tag: pill('pick 32 of 65,536 centroids', 'search') }), box('lists', 3, 0, 'Scan 32 inverted lists', 'blue', 'list', { size: [1.5, 1.5], height: 28, tag: pill('≈ 488k vectors', 'gauge', 'good') })], links: [link('q', 'router'), link('router', 'lists')], flows: [flow(['q', 'router', 'lists'], { rate: 2 })] },
    },
    {
      short: 'PQ',
      kind: 'technique',
      title: 'Product quantization: 3 TB becomes 64 GB',
      body: [
        'Memory is the real limit: 3 TB of raw vectors needs a fleet of machines. <b>Product quantization (PQ)</b> splits each vector into <code>m</code> sub-vectors (64) and, for each sub-space, learns a <b>codebook</b> of 256 representative centroids. A vector becomes <code>m</code> one-byte codes — <b>64 bytes instead of 3,072</b>, a <b>48× reduction</b> (1B vectors → 64 GB, which fits on one or two machines).',
        'Distances are computed with <b>lookup tables</b>: precompute the distance from the query’s sub-vectors to every code once, then each stored vector’s distance is just <code>m</code> table lookups and additions — fast and cache-friendly. The cost is <i>approximation error</i>; systems fetch the top few hundred by PQ distance and <b>rerank with the original vectors</b> from disk to recover accuracy.',
      ],
      changes: [{ text: '768 floats (3,072 B) → 64 one-byte codes', tone: 'good' }, { text: 'Distance = m table lookups', tone: 'good' }, { text: 'Rerank top candidates with full vectors', tone: 'info' }],
      concepts: [{ term: 'Product quantization', def: 'Compressing a vector by splitting it into parts and replacing each part with the id of the nearest entry in a learned codebook.' }],
      scene: { nodes: [box('raw', -9, 0, '3,072 B vector', 'red', 'file', { size: [1.4, 1.4], height: 28 }), box('cb', 0, 0, '64 codebooks × 256', 'teal', 'layers', { size: [1.3, 1.3], height: 26 }), box('code', 10, 0, '64 B code', 'green', 'check', { size: [1.1, 1.1], height: 14, tag: pill('48× smaller', 'check', 'good') })], links: [link('raw', 'cb', { arrow: 'end' }), link('cb', 'code', { arrow: 'end' })], flows: [flow(['raw', 'cb', 'code'], { rate: 1.2 })] },
    },
    {
      short: 'HNSW',
      kind: 'technique',
      title: 'HNSW: navigate a small-world graph',
      body: [
        '<b>HNSW</b> (hierarchical navigable small world) links each vector to a handful of near neighbours in a <b>graph</b>, in several layers: the top layer is sparse with long links, the bottom contains every vector. Search enters at the top, <b>greedily walks</b> to the neighbour closest to the query, drops a layer, and repeats, ending with a best-first search of width <code>efSearch</code> on the bottom layer. Hops grow roughly logarithmically with N.',
        'HNSW gives excellent recall and latency (often under a millisecond for millions of vectors) but keeps <b>full vectors plus links in RAM</b> — each node stores M×2 neighbour ids on top of 3 KB of floats — and building and updating the graph is slower. IVF-PQ wins on memory at billions; HNSW wins on speed and recall when it fits; disk-based graphs (DiskANN) and hybrids bridge the gap.',
      ],
      changes: [{ text: 'Layered graph: coarse long links → fine local links', tone: 'info' }, { text: 'Fast, high recall, RAM-hungry', tone: 'info' }],
      scene: { nodes: [box('l2', -6, -6, 'Layer 2: few nodes', 'purple', 'share', { size: [1.2, 1.2], height: 18 }), box('l1', 0, 0, 'Layer 1', 'blue', 'share', { size: [1.2, 1.2], height: 22 }), box('l0', 6, 6, 'Layer 0: every vector', 'green', 'share', { size: [1.2, 1.2], height: 26 })], links: [link('l2', 'l1', { arrow: 'end' }), link('l1', 'l0', { arrow: 'end' })], flows: [flow(['l2', 'l1', 'l0'], { rate: 1.2 })] },
    },
    {
      short: 'Trade-offs',
      kind: 'tradeoff',
      title: 'Recall, latency, memory — pick two',
      body: [
        'Every ANN index exposes knobs (<code>nprobe</code>, <code>efSearch</code>, PQ size) that move along a <b>recall–latency</b> curve; measure it on your own data and queries and choose the point your application tolerates (RAG often needs 90–95% recall@k plus a reranker; deduplication needs more). <b>Filters</b> are the hard case: “nearest vectors where tenant = X and date &gt; Y” can leave a graph or cluster search with too few matches — solutions are pre-filtering with fallback to brute force on small sets, partitioning by tenant, or filter-aware traversals.',
        '<b>Updates</b>: indexes are built in immutable <b>segments</b>; new vectors go to a small searchable buffer and are merged into larger segments in the background; deletes are marked and applied at compaction. Replicas add throughput and availability; shards (by hash or by cluster) add capacity, with queries scattered and top-k merged. Figures here are model operation counts, not benchmarks.',
      ],
      changes: [{ text: 'Tune nprobe / efSearch on real queries', tone: 'good' }, { text: 'Filtered search needs a plan', tone: 'bad' }, { text: 'Immutable segments + background merge', tone: 'info' }],
      scene: { nodes: [q(), router({ name: 'Router (scatter)' }), ...[0, 1, 2].map((i) => shard(i, 3, `Shard ${i + 1}`)), merge()], links: [link('q', 'router'), ...[0, 1, 2].map((i) => link('router', `s${i}`)), ...[0, 1, 2].map((i) => link(`s${i}`, 'merge'))], flows: [...[0, 1, 2].map((i) => flow(['q', 'router', `s${i}`, 'merge'], { rate: 1.2 }))] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Prune the search, compress the vectors, rerank the survivors',
      body: [
        'Exact search is <code>N × d</code> per query. <b>IVF</b> scans <code>N × nprobe ÷ nlist</code> vectors; <b>PQ</b> compresses each vector to <code>m</code> bytes (48× at the defaults) and speeds scoring with lookup tables; <b>HNSW</b> trades RAM for fast graph navigation. Production stacks combine them (IVF-PQ plus reranking), shard for capacity and merge segments for updates.',
        'Always measure recall@k and latency on your data, and treat filters and updates as first-class design questions.',
      ],
      scene: { nodes: [q(), router(), shard(0, 2, 'Compressed shard'), shard(1, 2, 'Compressed shard'), merge({ tag: pill('rerank with full vectors', 'check') })], links: [link('q', 'router'), link('router', 's0'), link('router', 's1'), link('s0', 'merge'), link('s1', 'merge')], flows: [flow(['q', 'router', 's0', 'merge'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
