import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => crowd('user', -19, 0, 8, 'feed requests', extra);
const src = (id: string, y: number, name: string, extra: Partial<SceneNode> = {}) => box(id, -10, y, name, 'orange', 'search', { size: [1.2, 1.2], height: 18, ...extra });
const feats = (extra: Partial<SceneNode> = {}) => db('feats', -1, 0, 'Feature store (user, author, item features)', { size: [1.6, 1.6], ...extra });
const light = (extra: Partial<SceneNode> = {}) => box('light', 7, -6, 'Light ranker (cheap, CPU)', 'purple', 'filter', { size: [1.4, 1.4], height: 22, ...extra });
const heavy = (extra: Partial<SceneNode> = {}) => box('heavy', 7, 6, 'Heavy ranker (neural net, accelerator)', 'red', 'sparkle', { size: [1.7, 1.7], height: 30, ...extra });
const post = (extra: Partial<SceneNode> = {}) => box('post', 16, 0, 'Filters, diversity, mixing, ads', 'green', 'list', { size: [1.5, 1.5], height: 24, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtMs = (ms: number): string => `${ms >= 100 ? Math.round(ms) : ms.toFixed(1)} ms`;

const lesson: Lesson = {
  slug: 'source-how-does-twitter-recommend-for-you-timeline-in-1-5-seconds',
  title: 'Recommendation Pipelines: Candidates, Ranking Funnels and Latency Budgets',
  blurb: 'A feed picks a few dozen items from billions in about a second by narrowing in stages — cheap retrieval, a light ranker, an expensive neural ranker on the survivors — and the compute and latency arithmetic explains why that funnel shape is forced.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'path', label: 'Critical-path latency vs the budget', icon: 'clock' },
    { key: 'heavy', label: 'Heavy-ranker compute per request', icon: 'cpu' },
    { key: 'fleet', label: 'Heavy-ranker accelerator slots needed', icon: 'layers' },
    { key: 'nofunnel', label: 'Slots if you skip the light stage (heavy on every candidate)', icon: 'alert' },
  ],
  goals: [
    { text: 'The funnel: billions → hundreds → dozens', step: 1 },
    { text: 'Candidate generation from several sources', step: 2 },
    { text: 'Feature hydration and the light ranker', step: 3 },
    { text: 'The heavy ranker and post-ranking', step: 4 },
    { text: 'The latency and compute budget', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'rps', label: 'Feed requests per second at peak', min: 100, max: 1000000, step: 100, default: 70000, unit: '/s', description: 'Ranking requests.' },
      { key: 'cand', label: 'Candidates from retrieval', min: 100, max: 20000, step: 100, default: 1500, unit: '', description: 'Items returned by all candidate sources.' },
      { key: 'keep', label: 'Candidates the light ranker passes on', min: 10, max: 5000, step: 10, default: 300, unit: '', description: 'Input size of the heavy ranker.' },
      { key: 'lc', label: 'Light ranker cost per item', min: 0.5, max: 100, step: 0.5, default: 5, unit: ' µs', description: 'CPU time to score one candidate.' },
      { key: 'hc', label: 'Heavy ranker cost per item', min: 10, max: 5000, step: 10, default: 200, unit: ' µs', description: 'Accelerator time to score one candidate.' },
      { key: 'ret', label: 'Retrieval latency (slowest source)', min: 10, max: 600, step: 5, default: 120, unit: ' ms', description: 'Sources run in parallel; slowest sets the time.' },
      { key: 'ft', label: 'Feature hydration latency', min: 5, max: 400, step: 5, default: 60, unit: ' ms', description: 'Batch fetch of features for the candidates.' },
      { key: 'pt', label: 'Post-ranking + assembly latency', min: 1, max: 200, step: 1, default: 20, unit: ' ms', description: 'Filters, mixing, rendering the response.' },
      { key: 'bud', label: 'Server-side latency budget', min: 100, max: 3000, step: 50, default: 500, unit: ' ms', description: 'Allowed for the ranking service.' },
      { key: 'util', label: 'Target utilisation', min: 20, max: 95, step: 5, default: 60, unit: '%', description: 'Headroom for spikes.' },
    ],
    calculate: (input, step) => {
      const rps = Math.max(1, input.rps ?? 7e4);
      const cand = Math.max(1, input.cand ?? 1500);
      const keep = Math.min(cand, Math.max(1, input.keep ?? 300));
      const lc = Math.max(0.01, input.lc ?? 5) / 1000;
      const hc = Math.max(0.01, input.hc ?? 200) / 1000;
      const ret = Math.max(0, input.ret ?? 120);
      const ft = Math.max(0, input.ft ?? 60);
      const pt = Math.max(0, input.pt ?? 20);
      const bud = Math.max(1, input.bud ?? 500);
      const util = Math.min(0.99, Math.max(0.1, (input.util ?? 60) / 100));
      const lightMs = cand * lc;
      const heavyMs = keep * hc;
      const path = ret + ft + lightMs + heavyMs + pt;
      const fleet = Math.ceil((rps * (heavyMs / 1000)) / util);
      const noFunnelMs = cand * hc;
      const noFunnelFleet = Math.ceil((rps * (noFunnelMs / 1000)) / util);
      return {
        path: step < 5 ? { v: '—' } : { v: `${fmtMs(path)} of ${fmtMs(bud)} (${fmtMs(ret)} + ${fmtMs(ft)} + ${fmtMs(lightMs)} + ${fmtMs(heavyMs)} + ${fmtMs(pt)})`, tone: path <= bud * 0.7 ? 'good' : path <= bud ? 'warn' : 'bad' },
        heavy: step < 4 ? { v: '—' } : { v: `${fmtMs(heavyMs)} (${keep} items × ${(hc * 1000).toFixed(0)} µs)` },
        fleet: step < 4 ? { v: '—' } : { v: `${fmtN(fleet)} slots (${fmtN(rps)}/s × ${fmtMs(heavyMs)} ÷ ${(util * 100).toFixed(0)}%)`, tone: 'good' },
        nofunnel: step < 5 ? { v: '—' } : { v: `${fmtN(noFunnelFleet)} slots · ${fmtMs(noFunnelMs)} per request (${(noFunnelFleet / Math.max(1, fleet)).toFixed(1)}×)`, tone: noFunnelMs > bud ? 'bad' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Funnel',
      kind: 'insight',
      title: 'Narrow billions to dozens in stages of rising cost per item',
      body: [
        'A “For You” feed must choose ~50 items per request from a pool of hundreds of millions of recent posts, personalised to one person, in about a second — and do it for tens of thousands of requests per second. The best model is a large neural network that predicts, for this user and item, the probabilities of reply, like, dwell, report and so on. It can’t possibly be run on billions of items: even at 200 µs per item, scoring a billion would take 200,000 seconds.',
        'So every large recommender is a <b>funnel</b>: each stage looks at fewer items with a more expensive model. <b>Candidate generation</b> (retrieval) picks ~1,500 plausible items using cheap, high-recall methods; a <b>light ranker</b> cuts them to ~300; the <b>heavy ranker</b> scores those with the full model; <b>post-ranking</b> applies rules and picks the final dozens. Cost per request is Σ (items at stage × cost per item), and the funnel’s job is to keep that sum affordable without discarding the items the heavy model would have loved. This describes the general industry architecture, with illustrative numbers.',
      ],
      scene: { nodes: [user({ tag: pill('open the feed', 'user') }), src('s1', -8, 'Sources'), heavy({ tag: pill('300 items', 'sparkle') }), post({ tag: pill('50 shown', 'check') })], links: [link('user', 's1'), link('s1', 'heavy'), link('heavy', 'post')], flows: [flow(['user', 's1', 'heavy', 'post'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Retrieval',
      kind: 'technique',
      title: 'Candidate generation: several cheap sources in parallel',
      body: [
        'No single method finds everything good, so retrieval runs <b>multiple sources in parallel</b> and unions their output. <b>In-network</b>: recent posts from accounts the user follows (a precomputed per-user timeline cache, filled by fan-out on write — see the Social Feed lesson). <b>Out-of-network via graph</b>: posts engaged with by people the user’s friends follow or interact with (graph traversal/ co-engagement). <b>Embedding retrieval</b>: the user and each post are mapped to vectors by a model; <b>approximate nearest-neighbour search</b> (HNSW/IVF — see the Vector Search lesson) returns posts whose vectors are close to the user’s interest vector. Plus <b>trending/topical</b> pools and <b>exploration</b> buckets for new content.',
        'The sources’ latencies don’t add: they run concurrently, so the slowest (say <b>120 ms</b>) sets the stage time, and a per-source timeout with graceful degradation (drop a slow source rather than wait) protects tail latency. Retrieval is judged on <b>recall</b> — does the candidate set contain what the heavy model would have ranked highest? — because anything not retrieved can never be shown. Each source is typically 100–500 items, deduplicated into ~1,500.',
      ],
      changes: [{ text: 'In-network timelines + graph-based + embedding ANN + trending, in parallel', tone: 'good' }, { text: 'Stage latency = the slowest source (120 ms), with timeouts', tone: 'info' }, { text: 'Judged on recall: unretrieved items can’t be ranked', tone: 'info' }],
      scene: { nodes: [user(), src('s1', -9, 'Follow graph', { tag: pill('in-network', 'users') }), src('s2', 0, 'Embedding ANN', { tag: pill('out-of-network', 'search') }), src('s3', 9, 'Trending / topical', { tag: pill('pool', 'activity') }), feats({ tag: pill('≈ 1,500 candidates', 'list') })], links: [link('user', 's1'), link('user', 's2'), link('user', 's3'), link('s1', 'feats'), link('s2', 'feats'), link('s3', 'feats')], flows: [flow(['user', 's1', 'feats'], { rate: 1.4 }), flow(['user', 's2', 'feats'], { rate: 1.4 }), flow(['user', 's3', 'feats'], { rate: 1.4 })] },
    },
    {
      short: 'Light',
      kind: 'technique',
      title: 'Feature hydration and the light ranker',
      body: [
        'Ranking needs <b>features</b>: about the user (history, language, recent engagements), the author (follower count, quality score), the item (age, media type, early engagement) and the pair (has the user engaged with this author before?). They live in a <b>feature store</b> — a low-latency key–value layer, often with an in-process cache for hot authors — fetched in <b>one batched call</b> for all candidates (60 ms here), because 1,500 individual lookups would be fatal. Feature freshness (an engagement from 30 seconds ago) matters for trending content, which is why real-time features are streamed in alongside batch-computed ones.',
        'The <b>light ranker</b> is a small model (gradient-boosted trees, a linear/logistic model, a tiny neural net) that scores every candidate in about <b>5 µs</b>, on CPU: 1,500 × 5 µs = <b>7.5 ms</b>. Its job is cheap triage — keep the top ~300 — and it is trained to approximate the heavy ranker’s ordering, since a good light stage means the expensive one rarely wastes work on hopeless items. Recall of the light stage (how much of the heavy model’s top-50 survives) is the key quality metric of the funnel.',
      ],
      changes: [{ text: 'Batched feature fetch: user, author, item and pair features', tone: 'info' }, { text: 'Light ranker: 1,500 × 5 µs = 7.5 ms on CPU → keep 300', tone: 'good' }, { text: 'Measure how much of the heavy top-50 the light stage keeps', tone: 'good' }],
      scene: { nodes: [feats({ tag: pill('batched fetch: 60 ms', 'timer') }), light({ tag: pill('1,500 → 300 in 7.5 ms', 'filter', 'good') }), heavy()], links: [link('feats', 'light'), link('light', 'heavy')], flows: [flow(['feats', 'light', 'heavy'], { rate: 1.6 })] },
    },
    {
      short: 'Heavy',
      kind: 'technique',
      title: 'The heavy ranker and post-ranking',
      body: [
        'The <b>heavy ranker</b> is a large multi-task neural network (embedding tables for IDs, cross-feature layers, towers for each engagement type) run on <b>accelerators</b> with batched inference. It predicts a vector of engagement probabilities per candidate and combines them with weights into a single score — <i>that</i> weighting is where product values enter (a reply counts more than a like; a report subtracts heavily). At 200 µs per item, 300 items cost <b>60 ms per request</b> — 70,000 requests/s × 0.06 s ÷ 60% utilisation ≈ <b>7,000 accelerator slots</b> for this stage alone.',
        '<b>Post-ranking</b> then applies what a model shouldn’t decide: hard <b>filters</b> (blocked/muted authors, already seen, policy and safety), <b>diversity</b> (no five posts from one author in a row), <b>mixing</b> (inject ads, suggested follows, conversation threads at set positions), freshness and exploration quotas, and per-surface business rules. Keep these rules <b>transparent and testable</b> — they are where unwanted behaviours (feedback loops, amplification) are corrected, and they run on the final dozens, so they’re cheap.',
      ],
      changes: [{ text: '300 × 200 µs = 60 ms/request → ~7,000 accelerator slots at 70k/s', tone: 'info' }, { text: 'Score = weighted sum of predicted engagement probabilities', tone: 'info' }, { text: 'Filters, diversity and mixing applied after the model', tone: 'good' }],
      scene: { nodes: [light(), heavy({ tag: pill('predict like, reply, dwell, report', 'sparkle', 'good') }), post({ tag: pill('filter · diversify · mix ads', 'list') })], links: [link('light', 'heavy'), link('heavy', 'post')], flows: [flow(['light', 'heavy', 'post'], { rate: 1.8 })] },
    },
    {
      short: 'Budget',
      kind: 'insight',
      title: 'The latency and compute budget',
      body: [
        'Stages run in sequence on the critical path: retrieval 120 ms (parallel sources) → features 60 ms → light ranker 7.5 ms → heavy ranker 60 ms → post-ranking 20 ms = <b>267.5 ms</b> against a 500 ms server budget (the remainder of a ~1.5 s page-load budget goes to network, rendering and other services). Headroom is spent on tail latency (p99 can be 2–3× the median), on retries and on bursts.',
        'Why the funnel shape is forced: running the heavy ranker on <b>all 1,500 candidates</b> would cost 1,500 × 0.2 ms = <b>300 ms</b> per request — taking the critical path to 500 ms, no margin — and <b>35,000 accelerator slots</b>, 5× the fleet. Moving the cut earlier (the light ranker passes 100, not 300) saves 40 ms and 2,300 slots but risks dropping items the heavy model would have chosen. Tuning the funnel is a three-way trade between <b>recall, latency and cost</b>; systems also cache (per-user candidates for a few seconds), distil big models into smaller ones, quantise, batch requests, and run heavy rankers closer to features. Figures here are model outputs with assumed costs; real systems differ widely.',
      ],
      changes: [{ text: '120 + 60 + 7.5 + 60 + 20 = 267.5 ms of a 500 ms budget', tone: 'info' }, { text: 'Heavy on all 1,500: 300 ms and 35,000 slots (5×)', tone: 'bad' }, { text: 'Tune the cut-offs: recall vs latency vs cost; cache, distil, quantise', tone: 'good' }],
      scene: { nodes: [user({ tag: pill('268 ms server-side', 'clock', 'good') }), light({ tag: pill('7.5 ms', 'timer') }), heavy({ tag: pill('60 ms · 7,000 slots', 'gauge') }), post()], links: [link('user', 'light'), link('light', 'heavy'), link('heavy', 'post')], flows: [flow(['user', 'light', 'heavy', 'post'], { rate: 1.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Spend the expensive model only where it matters',
      body: [
        'A recommender is a <b>funnel</b>: parallel candidate sources (~1,500), a cheap light ranker (→ 300), a heavy neural ranker, then rules and mixing. Latency adds along the critical path (≈ 268 ms here); compute is items × cost per item per stage — the heavy stage alone needs ~7,000 accelerator slots, and skipping the light stage would need 5× more.',
        'Evaluate funnel recall, tune cut-offs for latency and cost, and keep post-ranking rules transparent.',
      ],
      scene: { nodes: [user(), src('s1', -8, 'Sources'), feats(), light(), heavy(), post()], links: [link('user', 's1'), link('s1', 'feats'), link('feats', 'light'), link('light', 'heavy'), link('heavy', 'post')], flows: [flow(['user', 's1', 'feats', 'light', 'heavy', 'post'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
