import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const req = (extra: Partial<SceneNode> = {}) => box('req', -16, 0, 'ETA requests', 'green', 'user', { size: [1.3, 1.3], height: 26, ...extra });
const cache = (extra: Partial<SceneNode> = {}) => box('cache', -8, 0, 'Result cache', 'teal', 'layers', { size: [1.3, 1.3], height: 24, ...extra });
const router = (extra: Partial<SceneNode> = {}) => box('router', 1, 0, 'Routing engine', 'purple', 'route', { size: [1.5, 1.5], height: 32, ...extra });
const graph = (extra: Partial<SceneNode> = {}) => db('graph', 10, -6, 'Road graph + hierarchy', { size: [1.4, 1.4], ...extra });
const traffic = (extra: Partial<SceneNode> = {}) => box('traffic', 10, 6, 'Live traffic weights', 'orange', 'activity', { size: [1.3, 1.3], height: 24, ...extra });
const ml = (extra: Partial<SceneNode> = {}) => box('ml', 18, 0, 'ML correction', 'blue', 'cpu', { size: [1.3, 1.3], height: 26, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'academy-how-uber-computes-eta-at-half-a-million-requests-per-second',
  title: 'Computing ETAs at Scale: Routing Graphs and Hierarchies',
  blurb: 'Shortest paths on a road network with live traffic: why plain Dijkstra explores hundreds of thousands of nodes, how contraction hierarchies cut that to thousands, and what caching and ML add on top.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'naive', label: 'Dijkstra: nodes settled per query', icon: 'search' },
    { key: 'bidir', label: 'Bidirectional: nodes settled', icon: 'search' },
    { key: 'cores', label: 'Cores needed: Dijkstra → hierarchy', icon: 'cpu' },
    { key: 'cache', label: 'Queries reaching the engine', icon: 'activity' },
  ],
  goals: [
    { text: 'Modelling roads as a weighted graph', step: 1 },
    { text: 'Why Dijkstra’s search space explodes with distance', step: 2 },
    { text: 'Contraction hierarchies: preprocess once, query in microseconds', step: 3 },
    { text: 'Live traffic: dynamic weights and the cost of re-preprocessing', step: 4 },
    { text: 'Caching and ML on top of the route time', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'write'],
  dynamic: {
    parameters: [
      { key: 'density', label: 'Road-graph nodes per km²', min: 50, max: 10000, step: 50, default: 1500, unit: '', description: 'Intersections and shape points in an urban area.' },
      { key: 'dist', label: 'Typical trip distance', min: 1, max: 100, step: 1, default: 10, unit: ' km', description: 'Straight-line distance between origin and destination.' },
      { key: 'rps', label: 'ETA requests per second', min: 1000, max: 5000000, step: 1000, default: 500000, unit: '/s', description: 'Peak demand: dispatch, pricing, ETAs shown to riders.' },
      { key: 'hit', label: 'Served from cache', min: 0, max: 95, step: 1, default: 40, unit: '%', description: 'Requests answered by a cached result for a nearby origin/destination cell and time bucket.' },
      { key: 'ch', label: 'Nodes settled with a contraction hierarchy', min: 100, max: 20000, step: 100, default: 2000, unit: '', description: 'Order of magnitude of the search space after preprocessing.' },
      { key: 'rate', label: 'Node expansions per core per second', min: 500000, max: 20000000, step: 500000, default: 5000000, unit: '', description: 'Throughput of one core running a graph search.' },
    ],
    calculate: (input, step) => {
      const density = Math.max(1, input.density ?? 1500);
      const dist = Math.max(0.1, input.dist ?? 10);
      const rps = Math.max(1, input.rps ?? 5e5);
      const hit = Math.min(0.99, Math.max(0, (input.hit ?? 40) / 100));
      const ch = Math.max(1, input.ch ?? 2000);
      const rate = Math.max(1, input.rate ?? 5e6);
      // Dijkstra settles every node closer to the origin than the target: a disc of radius ≈ distance.
      const naive = density * Math.PI * dist * dist;
      // Bidirectional search grows two discs of half the radius.
      const bidir = 2 * density * Math.PI * (dist / 2) * (dist / 2);
      const engineRps = rps * (1 - hit);
      const coresNaive = (engineRps * naive) / rate;
      const coresCh = (engineRps * ch) / rate;
      return {
        naive: step < 2 ? { v: '—' } : { v: fmtN(naive), tone: naive > 100000 ? 'bad' : 'warn' },
        bidir: step < 2 ? { v: '—' } : { v: `${fmtN(bidir)} (half)`, tone: bidir > 100000 ? 'bad' : 'warn' },
        cores: step < 3 ? { v: '—' } : { v: `${fmtN(coresNaive)} → ${fmtN(Math.max(1, coresCh))}`, tone: coresCh < 500 ? 'good' : 'warn' },
        cache: step < 5 ? { v: '—' } : { v: `${fmtN(engineRps)}/s of ${fmtN(rps)}/s`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'The graph',
      kind: 'insight',
      title: 'A city as a weighted directed graph',
      body: [
        'An ETA is a <b>shortest-path</b> problem. The road network becomes a graph: <b>nodes</b> are intersections (and shape points), <b>edges</b> are road segments, each directed and carrying a <b>weight</b> — the predicted travel time — plus attributes: turn restrictions, one-ways, speed limits, tolls, road class. A metropolitan area has millions of edges; a continent hundreds of millions.',
        'Route cost on a graph this size is the whole story: ride-hailing needs an ETA for <b>every nearby driver</b> for every request (to choose whom to dispatch and what to quote), and again as drivers move. That is hundreds of thousands of path queries a second, each of which must finish in milliseconds.',
      ],
      scene: { nodes: [req(), router({ tag: pill('shortest path A → B', 'route') }), graph({ tag: pill('millions of edges', 'layers') })], links: [link('req', 'router'), link('router', 'graph', { arrow: 'both' })], flows: [flow(['req', 'router', 'graph'], { rate: 2, back: true })] },
    },
    {
      short: 'Dijkstra',
      kind: 'problem',
      title: 'Plain Dijkstra explores a disc',
      body: [
        '<b>Dijkstra’s algorithm</b> expands nodes in order of increasing cost from the origin until it reaches the target. Without extra structure it settles <i>every</i> node nearer than the destination — a disc of radius ≈ trip distance — in all directions, including ones that lead nowhere. At 1,500 nodes/km² and a 10 km trip that is π × 10² × 1,500 ≈ <b>470,000 nodes</b>; the work grows with the <i>square</i> of distance (a 40 km trip: 7.5 million).',
        '<b>Bidirectional</b> search runs two discs of half the radius from both ends: about half the nodes (235,000). <b>A*</b> with a geographic heuristic helps further. But at 500,000 requests/s with 40% served from cache, plain Dijkstra at 5 million expansions per core per second needs about <b>28,000 cores</b> — far too many. The graph must be preprocessed.',
      ],
      changes: [{ text: 'Nodes settled ≈ density × π × distance²', tone: 'bad' }, { text: 'Bidirectional: half; still ~28k cores at peak', tone: 'bad' }],
      scene: { nodes: [req({ name: 'A → B' }), router({ state: 'hot', load: 100, tag: pill('explores a disc: 470k nodes', 'alert', 'bad') })], links: [link('req', 'router')], flows: [flow(['req', 'router'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Hierarchy',
      kind: 'technique',
      title: 'Contraction hierarchies: preprocess once, query fast',
      body: [
        'Real road networks have <b>hierarchy</b>: long trips use local streets, then arterials, then highways, then back. <b>Contraction hierarchies</b> exploit it offline: order nodes by “importance”, then <b>contract</b> them one by one — remove a node and add <i>shortcut edges</i> between its neighbours wherever the removed node lay on a shortest path. The result is the original graph plus shortcuts, in which every shortest path goes <b>up</b> the hierarchy and then <b>down</b>.',
        'A query runs a bidirectional search that only follows edges to <b>more important</b> nodes from each end, meeting in the middle. It settles on the order of <b>hundreds to a few thousand nodes</b> — 2,000 here — instead of hundreds of thousands: ~200× less work, so 500k requests/s needs <b>~120 cores</b> instead of 28,000. The price is preprocessing time and memory for the shortcuts, paid once per graph version.',
      ],
      changes: [{ text: 'Contract nodes; add shortcut edges', tone: 'info' }, { text: 'Query = search upward from both ends: ~2,000 nodes', tone: 'good' }, { text: '28,000 cores → ~120 cores at peak', tone: 'good' }],
      concepts: [{ term: 'Contraction hierarchy', def: 'A preprocessed road graph with shortcut edges and a node importance order, letting shortest-path queries search only “upward” and settle very few nodes.' }],
      scene: { nodes: [req(), router({ tag: pill('search up from A and B', 'check', 'good') }), graph({ tag: pill('shortcuts + node order', 'layers', 'good') })], links: [link('req', 'router'), link('router', 'graph', { arrow: 'both' })], flows: [flow(['req', 'router', 'graph'], { rate: 2.5, back: true })] },
    },
    {
      short: 'Traffic',
      kind: 'problem',
      title: 'Live traffic changes the weights',
      body: [
        'Preprocessing assumes fixed edge weights, but travel times change by the minute: congestion, incidents, weather, time of day. Rebuilding a whole hierarchy for every update is too slow. Practical approaches: <b>customisable route planning</b>/<b>customisable contraction hierarchies</b> split preprocessing into a slow <i>structure</i> phase (topology, done once) and a fast <i>weight</i> phase (re-customise in seconds as traffic changes); <b>time-dependent weights</b> (typical speed profiles per edge per time of day) with live corrections blended on; or hierarchies per time bucket.',
        'Updates stream in from many sources — probe data from vehicles (anonymised speeds), incidents, historical profiles — are aggregated per edge, smoothed to avoid noise, and published as a new weight snapshot that engines swap in atomically. Staleness is bounded by the pipeline’s cycle time.',
      ],
      changes: [{ text: 'Split: static structure + fast weight update', tone: 'good' }, { text: 'Atomic swap of weight snapshots', tone: 'good' }],
      scene: { nodes: [traffic({ tag: pill('probe speeds, incidents', 'bolt') }), graph({ tag: pill('re-customise weights', 'refresh') }), router({ tag: pill('swap snapshot', 'check') })], links: [link('traffic', 'graph'), link('graph', 'router')], flows: [flow(['traffic', 'graph', 'router'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Cache + ML',
      kind: 'technique',
      title: 'Caching and learned corrections',
      body: [
        'Many requests are nearly identical — pickups in the same block heading to the same area within a minute — so snap origin and destination to <b>cells</b> (a geospatial index, see that lesson) and time to a <b>bucket</b> and cache the result. A 40% hit rate removes 200,000 of the 500,000 requests/s before they reach a routing engine; the trade-off is a small accuracy loss from snapping.',
        'The graph route time is a <b>physics-style baseline</b>; real ETAs also depend on pickup friction, driver behaviour, signals, parking and the road type. A <b>machine-learned model</b> takes the routed time plus context (time, weather, location, historical error) and predicts a <b>correction</b>, trained on the difference between predicted and actual trip times. Structurally: route first (cheap, interpretable), learn the residual (accurate). Figures here are model outputs for sizing, not any company’s numbers.',
      ],
      changes: [{ text: 'Snap to cell + time bucket → cache', tone: 'good' }, { text: 'ML predicts the residual on top of the route', tone: 'info' }],
      scene: { nodes: [req(), cache({ tag: pill('40% served here', 'check', 'good') }), router(), ml({ tag: pill('corrects the route time', 'check') })], links: [link('req', 'cache'), link('cache', 'router'), link('router', 'ml')], flows: [flow(['req', 'cache', 'router', 'ml'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Preprocess the graph, cache the questions, learn the residual',
      body: [
        'Roads are a <b>weighted graph</b>; Dijkstra settles ≈ <code>density × π × distance²</code> nodes (470k for 10 km); <b>contraction hierarchies</b> add shortcuts offline so queries settle thousands; <b>customisable weights</b> absorb live traffic; <b>caching</b> removes repeated queries; <b>ML</b> corrects what the graph cannot model.',
        'Capacity is requests × nodes settled ÷ per-core rate; the preprocessing is what turns tens of thousands of cores into a hundred.',
      ],
      scene: { nodes: [req(), cache(), router(), graph(), ml()], links: [link('req', 'cache'), link('cache', 'router'), link('router', 'graph', { arrow: 'both' }), link('router', 'ml')], flows: [flow(['req', 'cache', 'router', 'ml'], { rate: 2 })] },
    },
  ],
};

export default lesson;
