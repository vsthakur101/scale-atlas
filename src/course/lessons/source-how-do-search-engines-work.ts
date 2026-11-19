import type { Lesson, SceneNode } from '../../types';
import { box, crowd, disk, flow, link, pill } from '../kit';

const web = (extra: Partial<SceneNode> = {}) => crowd('web', -15, 0, 10, 'the web', extra);
const crawler = (extra: Partial<SceneNode> = {}) => box('crawler', -8, 0, 'Crawler', 'green', 'search', { size: [1.3, 1.3], height: 28, ...extra });
const indexer = (extra: Partial<SceneNode> = {}) => box('indexer', 0, 0, 'Indexer', 'orange', 'layers', { size: [1.3, 1.3], height: 28, ...extra });
const idx = (extra: Partial<SceneNode> = {}) => disk('idx', 8, 0, 'Inverted index', { size: [3, 1.2], height: 20, tone: 'yellow', icon: 'list', ...extra });
const ranker = (extra: Partial<SceneNode> = {}) => box('ranker', 16, 0, 'Query + ranking', 'blue', 'gauge', { size: [1.3, 1.3], height: 28, ...extra });

const fmtB = (b: number): string => (b >= 1e15 ? `${(b / 1e15).toFixed(1)} PB` : b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const fmtT = (s: number): string => (s >= 86400 * 2 ? `${(s / 86400).toFixed(1)} days` : s >= 7200 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);
const fmtR = (r: number): string => (r >= 1e6 ? `${(r / 1e6).toFixed(1)}M/s` : r >= 1e3 ? `${(r / 1e3).toFixed(0)}k/s` : `${Math.round(r)}/s`);

const lesson: Lesson = {
  slug: 'source-how-do-search-engines-work',
  title: 'How Search Engines Work: Crawl, Index, Rank',
  blurb: 'A politeness-limited crawler, an inverted index, ranking signals including PageRank, and a scatter-gather serving tier that must answer in milliseconds.',
  minutes: 15,
  level: 'Advanced',
  metrics: [
    { key: 'rate', label: 'Crawl throughput', icon: 'activity' },
    { key: 'bw', label: 'Download bandwidth', icon: 'share' },
    { key: 'time', label: 'Time for the largest host', icon: 'clock' },
    { key: 'index', label: 'Inverted index size', icon: 'disk' },
    { key: 'tail', label: 'Chance a query hits a slow shard', icon: 'alert' },
  ],
  goals: [
    { text: 'The three stages: crawl, index, serve', step: 1 },
    { text: 'Crawler politeness, the frontier and deduplication', step: 2 },
    { text: 'How an inverted index is built and compressed', step: 4 },
    { text: 'Ranking: text relevance and PageRank', step: 5 },
    { text: 'Scatter-gather serving and tail latency', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'pages', label: 'Pages to maintain', min: 1000000, max: 100000000000, step: 1000000, default: 1000000000, unit: '', description: 'Documents in the corpus.' },
      { key: 'hosts', label: 'Concurrent hosts being fetched', min: 1000, max: 10000000, step: 1000, default: 100000, unit: '', description: 'Different sites the crawler talks to at the same time.' },
      { key: 'delay', label: 'Politeness delay per host', min: 0.1, max: 30, step: 0.1, default: 1, unit: ' s', description: 'Minimum time between two requests to the same host.' },
      { key: 'kb', label: 'Average page size', min: 10, max: 2000, step: 10, default: 100, unit: ' KB', description: 'Downloaded size per page.' },
      { key: 'big', label: 'Pages on the largest host', min: 1000, max: 100000000, step: 1000, default: 10000000, unit: '', description: 'A very big site (marketplace, encyclopedia, forum).' },
      { key: 'terms', label: 'Distinct terms per page', min: 50, max: 2000, step: 10, default: 300, unit: '', description: 'Unique indexed terms per document.' },
      { key: 'shards', label: 'Index shards queried per search', min: 1, max: 5000, step: 1, default: 1000, unit: '', description: 'Shards that must all answer before results are returned.' },
      { key: 'slow', label: 'Chance a shard is slow on a query', min: 0.01, max: 5, step: 0.01, default: 0.1, unit: '%', description: 'Probability a single shard exceeds the latency target on one query.' },
    ],
    calculate: (input, step) => {
      const pages = Math.max(1, input.pages ?? 1e9);
      const hosts = Math.max(1, input.hosts ?? 1e5);
      const delay = Math.max(0.01, input.delay ?? 1);
      const kb = Math.max(1, input.kb ?? 100);
      const big = Math.max(1, input.big ?? 1e7);
      const terms = Math.max(1, input.terms ?? 300);
      const shards = Math.max(1, Math.round(input.shards ?? 1000));
      const slow = Math.min(1, Math.max(0, (input.slow ?? 0.1) / 100));
      // Each host accepts one request per politeness delay, so parallel hosts set throughput.
      const rate = hosts / delay;
      const bw = rate * kb * 1000;
      const time = Math.max(pages / rate, big * delay);
      // ~4 bytes per posting after delta + variable-byte compression (illustrative).
      const index = pages * terms * 4;
      const tail = 1 - Math.pow(1 - slow, shards);
      return {
        rate: step < 1 ? { v: '—' } : { v: fmtR(rate), tone: 'good' },
        bw: step < 1 ? { v: '—' } : { v: `${fmtB(bw)}/s`, tone: bw > 2e10 ? 'warn' : 'good' },
        time: step < 1 ? { v: '—' } : { v: fmtT(time), tone: time < 86400 ? 'good' : time < 86400 * 14 ? 'warn' : 'bad' },
        index: step < 3 ? { v: '—' } : { v: fmtB(index), tone: 'good' },
        tail: step < 5 ? { v: '—' } : { v: `${(tail * 100).toFixed(tail < 0.1 ? 1 : 0)}%`, tone: tail < 0.05 ? 'good' : tail < 0.3 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Pipeline',
      kind: 'insight',
      title: 'Three stages, three different problems',
      body: [
        'A search engine answers a query in milliseconds over billions of documents it does not own. That is made possible by moving nearly all the work offline: <b>crawl</b> (discover and download pages), <b>index</b> (turn documents into a structure that makes lookup fast), and <b>serve</b> (take a query, find candidates, rank them, return the top ten).',
        'Each stage has its own bottleneck: crawling is limited by <i>politeness and the web’s structure</i>, indexing by <i>sheer data volume</i> and batch processing, serving by <i>latency</i>. The sliders cover all three.',
      ],
      scene: { nodes: [web(), crawler(), indexer(), idx(), ranker()], links: [link('web', 'crawler', { arrow: 'both' }), link('crawler', 'indexer'), link('indexer', 'idx'), link('idx', 'ranker', { arrow: 'both' })], flows: [flow(['web', 'crawler', 'indexer', 'idx'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Crawling',
      kind: 'technique',
      title: 'The crawler: a frontier with manners',
      body: [
        'The crawler keeps a <b>URL frontier</b> — a prioritised queue of what to fetch next — seeded with known pages. It fetches a page, extracts links, normalises the URLs and adds new ones. The essential constraint is <b>politeness</b>: never hammer one site. It honours <code>robots.txt</code> and limits itself to one request per host every second or so, so the frontier is organised as <b>per-host queues</b> with a scheduler that rotates among hosts.',
        'Throughput = concurrent hosts ÷ delay: 100,000 hosts at 1 s each is <b>100,000 pages/s</b> (~10 GB/s at 100 KB). The whole of a billion-page web would take hours — but <b>one very large host</b> with 10 million pages takes <code>10,000,000 × 1 s</code> = <b>116 days</b> at that politeness. Big sites are slow no matter how big the crawler, so crawlers prioritise by importance and change rate, and sites offer feeds and sitemaps.',
      ],
      changes: [{ text: 'Throughput = hosts ÷ delay', tone: 'info' }, { text: 'Largest host: pages × delay (116 days for 10M pages)', tone: 'bad' }],
      concepts: [{ term: 'Politeness', def: 'A crawler’s self-imposed limit on request rate per host, so it does not overload or get blocked by the sites it fetches.' }],
      scene: { nodes: [web(), box('front', -8, -6, 'URL frontier (per-host queues)', 'purple', 'queue', { size: [1.3, 1.3], height: 22 }), crawler({ tag: pill('1 request / host / s', 'clock') })], links: [link('front', 'crawler'), link('crawler', 'web', { arrow: 'both' })], flows: [flow(['front', 'crawler', 'web'], { rate: 2, back: true })] },
    },
    {
      short: 'Dedup',
      kind: 'technique',
      title: 'Avoiding duplicates and traps',
      body: [
        'The same page appears under many URLs (tracking parameters, <code>www</code> or not, session ids). <b>URL normalisation</b> removes the cheap cases; <b>content fingerprints</b> catch the rest — exact duplicates by hash, <i>near</i>-duplicates by <b>SimHash</b> or MinHash, which give similar documents similar fingerprints. Seen-URL sets use <b>Bloom filters</b> to remember billions of URLs in a few GB.',
        'Crawl <b>traps</b> — infinite calendars, session-ID links, auto-generated pages — are limited with depth and per-site budgets and anomaly detection. Freshness matters too: re-crawl frequency adapts to how often a page changes and how important it is, using HTTP conditional requests (<code>If-Modified-Since</code>) to save bandwidth.',
      ],
      scene: { nodes: [crawler({ tag: pill('fingerprint each page', 'hash') }), box('bf', 4, -5, 'Seen-URL Bloom filter', 'teal', 'hash', { size: [1.2, 1.2], height: 22 }), box('sim', 4, 5, 'SimHash near-duplicates', 'orange', 'search', { size: [1.2, 1.2], height: 22 })], links: [link('crawler', 'bf'), link('crawler', 'sim')], flows: [flow(['crawler', 'bf'], { rate: 1.2 })] },
    },
    {
      short: 'Indexing',
      kind: 'technique',
      title: 'The inverted index',
      body: [
        'Searching by scanning documents for words is hopeless at this size. The <b>inverted index</b> flips the relation: for each term, a <b>posting list</b> of the documents containing it (with frequencies and positions): <code>"kubernetes" → [d14, d307, d1021, …]</code>. A multi-word query is an <b>intersection</b> of sorted lists — fast and mergeable.',
        'Building it is a huge batch job (MapReduce-style): tokenise, normalise (case, stemming), emit (term, doc) pairs, sort and merge. Lists are stored as <b>delta-encoded doc ids with variable-byte or SIMD-friendly compression</b> — roughly 4 bytes per posting here. For 1 billion pages with 300 distinct terms each that is <b>~1.2 TB</b>, small enough to keep in memory across a fleet. New content goes to a small real-time index merged into the main one.',
      ],
      changes: [{ text: 'term → sorted posting list of document ids', tone: 'info' }, { text: '1B pages × 300 terms × ~4 B ≈ 1.2 TB', tone: 'info' }],
      concepts: [{ term: 'Inverted index', def: 'A map from each term to the list of documents that contain it, enabling fast keyword lookup by intersecting lists.' }],
      scene: { nodes: [indexer({ tag: pill('tokenise · stem · sort · merge', 'refresh') }), idx({ tag: pill('kubernetes → d14, d307, d1021…', 'list') })], links: [link('indexer', 'idx')], flows: [flow(['indexer', 'idx'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Ranking',
      kind: 'technique',
      title: 'Ranking: relevance and authority',
      body: [
        'Matching documents may number in millions; order is the product. <b>Text relevance</b> scores each document: term frequency weighed against how rare the term is (<b>TF-IDF</b>, refined as <b>BM25</b>), plus where the words appear (title, headings, anchor text from other pages), phrases and proximity. <b>PageRank</b> adds <i>authority</i> from the link graph: a page is important if important pages link to it. Computed iteratively — <code>PR(p) = (1−d)/N + d · Σ PR(q)/outdegree(q)</code> over pages q linking to p, damping d ≈ 0.85 — until it converges.',
        'Modern ranking blends hundreds of signals (freshness, language, location, page speed, click behaviour, learned relevance models) and uses machine-learned ranking over a cheap first-stage retrieval: cheap scoring picks ~1,000 candidates, a heavier model re-ranks them. Quality and <b>spam</b> defences (link farms, keyword stuffing) are an ongoing adversarial effort.',
      ],
      changes: [{ text: 'BM25 for text · PageRank for authority', tone: 'info' }, { text: 'Cheap retrieval → heavy re-ranking of ~1,000', tone: 'info' }],
      scene: { nodes: [idx(), box('bm', 8, -5, 'BM25 text score', 'blue', 'gauge', { size: [1.2, 1.2], height: 22 }), box('pr', 8, 5, 'PageRank (link graph)', 'purple', 'share', { size: [1.2, 1.2], height: 22 }), ranker({ tag: pill('blend signals → top 10', 'check') })], links: [link('idx', 'bm'), link('idx', 'pr'), link('bm', 'ranker'), link('pr', 'ranker')], flows: [flow(['idx', 'bm', 'ranker'], { rate: 1.2 }), flow(['idx', 'pr', 'ranker'], { rate: 1.2 })] },
    },
    {
      short: 'Serving',
      kind: 'problem',
      title: 'Scatter-gather and the tail',
      body: [
        'The index is far larger than one machine, so it is <b>sharded by document</b> and replicated. A query goes to a root server, which <b>scatters</b> it to every shard; each returns its local top results; the root <b>gathers</b> and merges them. The user waits for the <i>slowest</i> shard.',
        'That makes <b>tail latency</b> the central problem: if each shard is slow on 0.1% of queries, a query touching 1,000 shards hits at least one slow shard <code>1 − 0.999¹⁰⁰⁰</code> = <b>63%</b> of the time. Remedies: replicas and <b>hedged requests</b> (ask a second replica after a short delay), tight per-shard deadlines returning partial results, caching popular queries and tiering (a small high-quality index first, the long tail only if needed).',
      ],
      changes: [{ text: '1,000 shards × 0.1% slow → 63% of queries hit one', tone: 'bad' }, { text: 'Hedged requests, deadlines, caching, tiers', tone: 'good' }],
      scene: { nodes: [ranker({ name: 'Root', tag: pill('waits for slowest', 'clock', 'warn') }), ...[0, 1, 2].map((i) => box(`sh${i}`, -6, -6 + i * 6, `Shard ${i + 1}`, 'blue', 'db', { size: [1.2, 1.2], height: 22, state: i === 1 ? 'hot' : 'ok', tag: i === 1 ? pill('slow', 'alert', 'bad') : undefined }))], links: [0, 1, 2].map((i) => link('ranker', `sh${i}`, { arrow: 'both' })), flows: [0, 1, 2].map((i) => flow(['ranker', `sh${i}`], { rate: 1.5, back: true })) },
    },
    {
      short: 'Freshness',
      kind: 'tradeoff',
      title: 'Freshness, scale and cost',
      body: [
        'News must appear in minutes; an old reference page can wait weeks. Engines run <b>tiers</b> — a small, constantly rebuilt real-time index for fresh content, a large periodically rebuilt main index, and an archive — and merge them at query time. Re-crawl budget is allocated by estimated change rate and importance.',
        'Costs are dominated by index memory, replication and the re-ranking models. Operators trade <b>index size</b> (cover more of the web) against <b>latency and cost</b> (more shards touched). Figures here are model outputs to show how the stages scale, not any real engine’s numbers.',
      ],
      scene: { nodes: [box('rt', -8, -5, 'Real-time index', 'orange', 'bolt', { size: [1.3, 1.3], height: 22, tag: pill('minutes old', 'clock', 'good') }), box('main', 0, 5, 'Main index', 'blue', 'layers', { size: [1.3, 1.3], height: 28, tag: pill('rebuilt daily', 'refresh') }), box('arc', 8, -5, 'Archive tier', 'grey', 'disk', { size: [1.3, 1.3], height: 18, tag: pill('long tail', 'disk') })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Do the work offline, merge at query time',
      body: [
        '<b>Crawl</b> politely (throughput = hosts ÷ delay; big hosts are slow), <b>dedupe</b> with fingerprints and Bloom filters, <b>index</b> into compressed inverted lists, <b>rank</b> with text relevance plus link authority and learned models, and <b>serve</b> by scatter-gather over replicated shards while fighting tail latency.',
        'Each stage’s limit is different — politeness, data volume, the slowest shard — so scale each independently and keep the hot path in memory.',
      ],
      scene: { nodes: [web(), crawler(), indexer(), idx(), ranker()], links: [link('web', 'crawler', { arrow: 'both' }), link('crawler', 'indexer'), link('indexer', 'idx'), link('idx', 'ranker', { arrow: 'both' })], flows: [flow(['web', 'crawler', 'indexer', 'idx', 'ranker'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
