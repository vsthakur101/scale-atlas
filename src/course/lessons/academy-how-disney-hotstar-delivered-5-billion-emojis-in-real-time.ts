import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const viewers = (extra: Partial<SceneNode> = {}) => crowd('viewers', -16, 0, 14, 'viewers sending reactions', extra);
const edge = (extra: Partial<SceneNode> = {}) => box('edge', -8, 0, 'Edge / API tier', 'orange', 'globe', { size: [1.4, 1.4], height: 28, ...extra });
const queue = (extra: Partial<SceneNode> = {}) => box('queue', -1, 0, 'Stream (partitioned)', 'yellow', 'queue', { size: [1.8, 1], height: 14, ...extra });
const agg = (extra: Partial<SceneNode> = {}) => box('agg', 6, 0, 'Aggregators (count per window)', 'purple', 'layers', { size: [1.5, 1.5], height: 30, ...extra });
const pub = (extra: Partial<SceneNode> = {}) => box('pub', 13, 0, 'Pub/sub fan-out', 'blue', 'share', { size: [1.4, 1.4], height: 26, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', 6, 8, 'Counts store', { size: [1.2, 1.2], ...extra });

const fmtN = (n: number): string => (n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB/s` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB/s` : `${Math.round(b / 1e3)} KB/s`);

const lesson: Lesson = {
  slug: 'academy-how-disney-hotstar-delivered-5-billion-emojis-in-real-time',
  title: 'Real-Time Reactions at Scale: Aggregate, Don’t Broadcast',
  blurb: 'Millions of viewers tapping reaction buttons during a live event: why forwarding every tap to every viewer is impossible, and how aggregating into windows turns an N × N problem into an N + N one.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'in', label: 'Reactions arriving per second', icon: 'activity' },
    { key: 'naive', label: 'Naive broadcast: deliveries per second', icon: 'alert' },
    { key: 'agg', label: 'Aggregated: deliveries per second', icon: 'check' },
    { key: 'bw', label: 'Aggregated downstream bandwidth', icon: 'share' },
    { key: 'part', label: 'Stream partitions needed', icon: 'layers' },
  ],
  goals: [
    { text: 'Why every-tap-to-everyone is quadratic', step: 1 },
    { text: 'Aggregating reactions into time windows', step: 2 },
    { text: 'Partitioned counting and the shuffle-free design', step: 3 },
    { text: 'Fan-out of one small aggregate per window', step: 4 },
    { text: 'Back-pressure, sampling and graceful degradation', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'viewers', label: 'Concurrent viewers', min: 1000, max: 100000000, step: 1000, default: 10000000, unit: '', description: 'People watching the live event.' },
      { key: 'active', label: 'Viewers reacting in a given second', min: 0.1, max: 30, step: 0.1, default: 3, unit: '%', description: 'Share who tap a reaction each second at a peak moment.' },
      { key: 'window', label: 'Aggregation window', min: 0.1, max: 10, step: 0.1, default: 2, unit: ' s', description: 'Reactions are counted and published once per window.' },
      { key: 'kinds', label: 'Reaction types', min: 1, max: 20, step: 1, default: 6, unit: '', description: 'Distinct emojis counted separately.' },
      { key: 'bytes', label: 'Bytes per aggregate update', min: 20, max: 500, step: 10, default: 60, unit: ' B', description: 'Counts for all types plus framing.' },
      { key: 'rate', label: 'Events one partition can ingest', min: 5000, max: 500000, step: 5000, default: 50000, unit: '/s', description: 'Per-partition throughput of the stream and its consumer.' },
    ],
    calculate: (input, step) => {
      const v = Math.max(1, input.viewers ?? 1e7);
      const act = Math.max(0, (input.active ?? 3) / 100);
      const win = Math.max(0.05, input.window ?? 2);
      const kinds = Math.max(1, input.kinds ?? 6);
      const bytes = Math.max(1, input.bytes ?? 60);
      const rate = Math.max(1, input.rate ?? 5e4);
      const inbound = v * act;
      // If every reaction were forwarded to every viewer, deliveries = reactions × viewers.
      const naive = inbound * v;
      // Aggregated: one update per window to every viewer.
      const aggDel = v / win;
      return {
        in: step < 0 ? { v: '—' } : { v: `${fmtN(inbound)}/s`, tone: inbound > 200000 ? 'warn' : 'good' },
        naive: step < 1 ? { v: '—' } : { v: `${fmtN(naive)}/s`, tone: 'bad' },
        agg: step < 2 ? { v: '—' } : { v: `${fmtN(aggDel)}/s (${fmtN(naive / aggDel)}× fewer)`, tone: 'good' },
        bw: step < 3 ? { v: '—' } : { v: fmtB(aggDel * Math.max(bytes, kinds * 8 + 12)), tone: aggDel * bytes > 1e9 ? 'warn' : 'good' },
        part: step < 2 ? { v: '—' } : { v: `${Math.max(1, Math.ceil(inbound / rate))}` },
      };
    },
  },
  steps: [
    {
      short: 'Problem',
      kind: 'problem',
      title: 'Every tap to every screen is quadratic',
      body: [
        'A cricket match peaks: ten million people are watching and 3% of them tap a reaction in the same second — <b>300,000 reactions per second</b> coming in. If the product shows reactions in real time by sending each tap to every viewer, the delivery rate is reactions × viewers: 300,000 × 10,000,000 = <b>3 × 10¹² messages per second</b>. No system on Earth does that, and no screen could render it.',
        'The key insight is that the viewer doesn’t need each individual tap — they need a <b>feeling of crowd energy</b>: “lots of fire emojis right now”. That is an <i>aggregate</i>, and aggregates are tiny and cheap to broadcast. The design changes the problem from <b>N inputs × N outputs</b> to <b>N inputs + N outputs</b>.',
      ],
      changes: [{ text: '300k reactions/s × 10M viewers = 3×10¹² deliveries/s', tone: 'bad' }],
      scene: { nodes: [viewers({ tag: pill('300,000 taps/s', 'bolt') }), edge(), box('all', 7, 0, 'Send each tap to everyone?', 'red', 'alert', { size: [1.5, 1.5], height: 26, tag: pill('3×10¹² /s', 'alert', 'bad') })], links: [link('viewers', 'edge'), link('edge', 'all')], flows: [flow(['viewers', 'edge', 'all'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Aggregate',
      kind: 'technique',
      title: 'Count in windows, publish the totals',
      body: [
        'Instead of forwarding events, <b>count them</b>. Every <b>window</b> (say 2 seconds) the system tallies how many of each reaction type arrived and publishes <i>one small message</i> — “🔥 41,200 · 👏 28,900 · 😮 9,400 …” (~60 bytes). Every viewer receives <b>one update per window</b>: 10 million ÷ 2 s = <b>5 million deliveries per second</b> instead of 3×10¹² — a <b>600,000-fold reduction</b>. The client animates the totals into a plausible stream of floating emojis locally.',
        'The window is a latency–load knob: a shorter window feels more live but multiplies fan-out proportionally (0.5 s = 20 million deliveries/s); a longer one is cheaper and smoother. Inbound load stays proportional to real taps, but it is only <b>one-way ingestion</b>, which is far easier than all-to-all delivery.',
      ],
      changes: [{ text: 'Delivery = viewers ÷ window = 5M/s, independent of tap rate', tone: 'good' }, { text: 'Window trades freshness for fan-out', tone: 'info' }],
      concepts: [{ term: 'Windowed aggregation', def: 'Counting events over fixed time windows and publishing the totals instead of individual events.' }],
      scene: { nodes: [viewers(), edge(), agg({ tag: pill('count per 2 s window', 'check', 'good') }), pub({ tag: pill('one tiny update each', 'share') })], links: [link('viewers', 'edge'), link('edge', 'agg'), link('agg', 'pub')], flows: [flow(['viewers', 'edge', 'agg'], { rate: 3 }), flow(['agg', 'pub'], { rate: 1.2 })] },
    },
    {
      short: 'Ingest',
      kind: 'technique',
      title: 'Partitioned ingestion and counting',
      body: [
        'Inbound taps (300,000/s) go through the edge tier into a <b>partitioned stream</b> — Kafka-style (see the Kafka lessons). Each partition handles ~50,000 events/s, so <b>6 partitions</b> carry the peak (provision several times that). Events can be spread <b>randomly</b>: because counting is commutative and associative, any partition can count any tap — there is no per-user routing or shuffle needed. Each aggregator consumes a partition, keeps an in-memory <b>counter per reaction type</b>, and at each window boundary emits its partial counts.',
        'A second stage <b>merges the partial counts</b> from all aggregators into one total per window (adding vectors of six numbers — trivial). This is the classic <b>map-reduce / combiner</b> shape: aggregate locally, then combine. Tapping can also be pre-aggregated on the <b>client or edge</b> (batch taps for 500 ms before sending), cutting inbound volume by an order of magnitude.',
      ],
      changes: [{ text: 'Counting commutes: random partitioning, no shuffle', tone: 'good' }, { text: 'Local partial counts → merged totals', tone: 'good' }, { text: 'Batch taps at the edge to cut inbound volume', tone: 'good' }],
      scene: { nodes: [edge(), queue({ tag: pill('6+ partitions', 'layers') }), agg({ tag: pill('partial counts', 'list') }), store({ tag: pill('merged totals', 'check') })], links: [link('edge', 'queue'), link('queue', 'agg'), link('agg', 'store', { style: 'dashed' })], flows: [flow(['edge', 'queue', 'agg'], { rate: 2.5 })] },
    },
    {
      short: 'Fan-out',
      kind: 'technique',
      title: 'Delivering one small aggregate to millions',
      body: [
        'Each window’s merged total is <b>identical for every viewer</b>, so delivery is a broadcast of one payload: publish it to a <b>pub/sub fan-out tree</b> (regional brokers, WebSocket/SSE gateways, CDN-based push or long-lived HTTP polling of a cached object) where each tier forwards to its children (see the WebSockets lesson). At 5 million deliveries/s × 60 bytes = <b>300 MB/s</b> across the fleet — large but spread over thousands of gateway nodes.',
        'Because the payload is the same for everyone, it can even be served as a <b>cacheable object</b> (<code>/reactions/latest</code>) refreshed every window and polled by clients through a CDN — the origin serves one request per window per edge, not 10 million. Pick push for low latency and pull-through-CDN for maximum scale and simplicity.',
      ],
      changes: [{ text: '5M deliveries/s × 60 B = 300 MB/s fleet-wide', tone: 'info' }, { text: 'Same payload for all → CDN-cacheable', tone: 'good' }],
      scene: { nodes: [agg(), pub({ tag: pill('regional fan-out tree', 'share', 'good') }), viewers({ name: '10M viewers', tag: pill('one update / 2 s', 'check', 'good') })], links: [link('agg', 'pub'), link('pub', 'viewers')], flows: [flow(['agg', 'pub', 'viewers'], { rate: 2 })] },
    },
    {
      short: 'Degrade',
      kind: 'tradeoff',
      title: 'Back-pressure, sampling and graceful degradation',
      body: [
        'This workload is <b>naturally lossy</b>: nobody notices if 5% of taps are dropped or the totals are approximate, so overload handling can be crude and cheap. <b>Sample</b> at the edge (count 1 in k taps and scale up) when inbound exceeds capacity; <b>drop</b> reactions when a queue is full instead of building a backlog (stale reactions are worthless — keep the stream fresh, not complete); <b>widen the window</b> under load to cut fan-out; and put <b>rate limits per connection</b> so a bot tapping 1,000 times a second can’t dominate.',
        'Protect the main product: the video stream and playback must never depend on the reaction pipeline, so isolate it (separate infrastructure, circuit breakers, a kill switch that hides the reactions UI). Approximate counts can use sketches (a Count-Min sketch or sharded counters) when types are many. Figures here are model outputs for sizing, not any service’s numbers.',
      ],
      changes: [{ text: 'Sample, drop and widen the window instead of queueing', tone: 'good' }, { text: 'Isolate from playback; kill switch', tone: 'good' }],
      scene: { nodes: [edge({ tag: pill('sample 1 in k · rate limit', 'gauge') }), queue({ tag: pill('full → drop, stay fresh', 'alert', 'warn') }), box('video', 8, -7, 'Video playback (isolated)', 'green', 'check', { size: [1.4, 1.4], height: 24, tag: pill('never depends on reactions', 'shield', 'good') })], links: [link('edge', 'queue')], flows: [flow(['edge', 'queue'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Aggregate to cut N × N to N + N',
      body: [
        'Forwarding every reaction to every viewer is <code>reactions × viewers</code> deliveries; <b>windowed aggregation</b> makes delivery <code>viewers ÷ window</code> and ingestion proportional to taps. Count on randomly-partitioned streams (commutative), merge partial counts, broadcast one small payload per window through a fan-out tree or CDN.',
        'Treat the feature as lossy and isolated: sample, drop, widen the window — and never let it endanger playback.',
      ],
      scene: { nodes: [viewers(), edge(), queue(), agg(), pub()], links: [link('viewers', 'edge'), link('edge', 'queue'), link('queue', 'agg'), link('agg', 'pub')], flows: [flow(['viewers', 'edge', 'queue', 'agg', 'pub'], { rate: 2 })] },
    },
  ],
};

export default lesson;
