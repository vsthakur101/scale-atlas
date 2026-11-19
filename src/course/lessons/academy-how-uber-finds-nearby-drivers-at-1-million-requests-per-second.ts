import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const drivers = (extra: Partial<SceneNode> = {}) => crowd('drivers', -14, -5, 12, 'drivers', extra);
const rider = (extra: Partial<SceneNode> = {}) => box('rider', -14, 6, 'Rider', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const index = (extra: Partial<SceneNode> = {}) => box('index', 2, 0, 'Geo index', 'blue', 'layers', { size: [1.5, 1.5], height: 34, ...extra });
const shardNode = (i: number, n: number, extra: Partial<SceneNode> = {}) => box(`sh${i}`, 12, (i - (n - 1) / 2) * 5.5, `Shard ${i + 1}`, 'blue', 'server', { size: [1.2, 1.2], height: 26, ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'academy-how-uber-finds-nearby-drivers-at-1-million-requests-per-second',
  title: 'Finding Nearby Drivers: Geospatial Indexes',
  blurb: 'From a full scan to grids, geohashes and quadtrees: how location search stays fast when every driver moves every few seconds.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'cand', label: 'Drivers truly within radius', icon: 'users' },
    { key: 'scan', label: 'Drivers examined (grid)', icon: 'search' },
    { key: 'waste', label: 'Wasted work', icon: 'gauge' },
    { key: 'writes', label: 'Location updates', icon: 'activity' },
  ],
  goals: [
    { text: 'Why a distance query can’t use an ordinary index', step: 1 },
    { text: 'Grid cells and how to choose a cell size', step: 3 },
    { text: 'Geohash, quadtree and hexagon indexes compared', step: 4 },
    { text: 'The edge cases: borders, density and sparse areas', step: 5 },
    { text: 'Why updates, not queries, dominate the design', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'drivers', label: 'Active drivers in the city', min: 1000, max: 1000000, step: 1000, default: 100000, unit: '', description: 'Drivers currently online.' },
      { key: 'area', label: 'City area', min: 10, max: 5000, step: 10, default: 500, unit: ' km²', description: 'Area drivers are spread over (uniform density assumed).' },
      { key: 'radius', label: 'Search radius', min: 0.5, max: 10, step: 0.5, default: 2, unit: ' km', description: 'How far from the rider to look.' },
      { key: 'cell', label: 'Grid cell side', min: 0.25, max: 5, step: 0.25, default: 1, unit: ' km', description: 'Side length of each square index cell.' },
      { key: 'interval', label: 'Location update interval', min: 1, max: 30, step: 1, default: 4, unit: ' s', description: 'Seconds between a driver’s position reports.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, input.drivers ?? 1e5);
      const area = Math.max(1, input.area ?? 500);
      const r = Math.max(0.1, input.radius ?? 2);
      const s = Math.max(0.05, input.cell ?? 1);
      const interval = Math.max(1, input.interval ?? 4);
      const density = n / area;
      const inRadius = density * Math.PI * r * r;
      // Cells needed to cover the 2r × 2r bounding box (one extra for misalignment), each s × s km.
      const side = Math.ceil((2 * r) / s) + 1;
      const cells = side * side;
      const scanned = Math.min(n, cells * s * s * density);
      const waste = inRadius > 0 ? scanned / inRadius : 0;
      return {
        cand: step < 0 ? { v: '—' } : { v: fmtN(inRadius) },
        scan: step < 2 ? { v: '—' } : { v: `${fmtN(scanned)} in ${cells} cells`, tone: scanned > 20000 ? 'warn' : 'good' },
        waste: step < 2 ? { v: '—' } : { v: `${waste.toFixed(1)}× the needed set`, tone: waste < 2.5 ? 'good' : waste < 5 ? 'warn' : 'bad' },
        writes: step < 5 ? { v: '—' } : { v: `${fmtN(n / interval)}/s`, tone: n / interval > 50000 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'The query',
      kind: 'problem',
      title: '“Who is near me?” is not a normal lookup',
      body: [
        'A rider opens the app; the system must find drivers within a couple of kilometres, <b>now</b>, among 100,000 moving ones. The obvious query — scan all drivers, compute distance to each, keep the near ones — is O(N) per request; at a few thousand requests a second that is hundreds of millions of distance calculations every second.',
        'A normal B-tree index sorts by one dimension. Latitude and longitude are two: an index on latitude alone returns a whole horizontal strip of the planet, and combining two independent indexes still scans huge ranges. You need an index that maps <b>nearby points to nearby keys</b>.',
      ],
      scene: { nodes: [drivers({ tag: pill('100,000 moving', 'users') }), rider({ tag: pill('who is within 2 km?', 'search') }), box('scan', 4, 0, 'Scan all drivers', 'red', 'list', { size: [1.5, 1.5], height: 28, tag: pill('O(N) per request', 'alert', 'bad') })], links: [link('rider', 'scan'), link('drivers', 'scan', { style: 'dashed' })], flows: [flow(['rider', 'scan'], { kind: 'heavy', rate: 2 })] },
    },
    {
      short: 'Bucket',
      kind: 'insight',
      title: 'Bucket the world, search only nearby buckets',
      body: [
        'The core idea behind every geospatial index: divide space into <b>cells</b>, store each driver under the id of the cell containing them, and answer a query by looking at the rider’s cell and its neighbours instead of everyone. The expensive geometry — real distance — runs only on those few candidates.',
        'Everything else — grid, geohash, quadtree, S2, H3 — is a different way of choosing the cells and naming them. What matters is how well they balance the number of cells you open against the number of irrelevant drivers inside them.',
      ],
      note: { kind: 'key', text: 'Spatial indexing = turn “near” into “same or adjacent bucket”, then filter exactly.' },
      scene: { nodes: [drivers(), rider(), index({ tag: pill('cell id → drivers', 'hash') })], links: [link('drivers', 'index'), link('rider', 'index', { arrow: 'both' })], flows: [flow(['drivers', 'index'], { kind: 'write', rate: 2 }), flow(['rider', 'index'], { rate: 1.2 })] },
    },
    {
      short: 'Grid',
      kind: 'technique',
      title: 'A fixed grid and the cell-size trade-off',
      body: [
        'Square cells of side <code>s</code>. To find drivers within radius <code>r</code>, open every cell that overlaps the 2r × 2r box around the rider: about <code>(⌈2r ÷ s⌉ + 1)²</code> cells. Then discard anyone beyond r exactly.',
        'Cell size is the dial. With density 200 drivers/km² and r = 2 km, there are ~2,500 drivers truly in range. At <b>s = 1 km</b> you open 25 cells and examine ~5,000 drivers (2× waste). At <b>s = 0.25 km</b> you open 289 cells but examine ~3,400 — less waste, more lookups. At <b>s = 5 km</b> you open 4 cells but examine 20,000. The sliders show the same trade; the sweet spot is a cell a fraction of the search radius.',
      ],
      changes: [{ text: 's = 1 km: 25 cells, ~5k drivers examined', tone: 'info' }, { text: 's = 5 km: 4 cells, ~20k examined', tone: 'bad' }, { text: 's = 0.25 km: 289 cells, ~3.6k examined', tone: 'info' }],
      scene: { nodes: [rider({ name: 'Rider', tag: pill('open 5 × 5 cells', 'search') }), index({ tag: pill('cell = 1 km', 'layers') }), box('cand', 12, 0, 'Candidates', 'green', 'list', { size: [1.3, 1.3], height: 26, tag: pill('exact distance filter', 'check', 'good') })], links: [link('rider', 'index'), link('index', 'cand')], flows: [flow(['rider', 'index', 'cand'], { rate: 1.5 })] },
    },
    {
      short: 'Index kinds',
      kind: 'technique',
      title: 'Geohash, quadtree and hexagons',
      body: [
        '<b>Geohash</b> interleaves the bits of latitude and longitude into one string; points sharing a long prefix are close, so a plain sorted index or key–value store can serve range queries on prefixes. Weakness: cells at a boundary can be adjacent in space but share no prefix, so you must also query the neighbouring cells.',
        '<b>Quadtree</b> recursively splits a square into four until each leaf holds at most a set number of points — it adapts to density (small cells downtown, large cells in the desert) but lives in memory and needs rebalancing as drivers move. <b>Hexagonal grids</b> (e.g. H3) give every cell six equidistant neighbours, which makes radius rings and smooth movement cleaner than squares. Production systems pick one and wrap it in a ring-expanding search.',
      ],
      concepts: [{ term: 'Geohash', def: 'A string encoding of a location in which a shared prefix means nearby, produced by interleaving latitude and longitude bits.' }, { term: 'Quadtree', def: 'A tree that splits a region into four quadrants recursively, adapting cell size to point density.' }],
      scene: { nodes: [box('gh', -8, -6, 'Geohash', 'blue', 'hash', { size: [1.3, 1.3], height: 26, tag: pill('prefix = nearby', 'hash') }), box('qt', 8, -6, 'Quadtree', 'orange', 'layers', { size: [1.3, 1.3], height: 26, tag: pill('adapts to density', 'layers') }), box('hx', 0, 6, 'Hex grid', 'purple', 'globe', { size: [1.3, 1.3], height: 26, tag: pill('6 equal neighbours', 'globe') })], links: [], flows: [] },
    },
    {
      short: 'Edge cases',
      kind: 'problem',
      title: 'Borders, density and empty areas',
      body: [
        '<b>Borders</b>: a rider at a cell’s edge has closer drivers in the neighbouring cell — always query the neighbours, never just the home cell. <b>Density</b>: a fixed 1 km cell holds 5 drivers in a suburb and 500 in a stadium district; use adaptive cells (quadtree) or smaller fixed cells in hot regions.',
        '<b>Sparse areas</b>: in a quiet region the first ring may be empty. Search in expanding rings — own cell, then the ring around it, then the next — stopping once enough candidates are found, rather than guessing one radius. And apply <b>business filters</b> (available, right vehicle type, heading the right way) after the spatial filter, since distance alone isn’t arrival time.',
      ],
      changes: [{ text: 'Always include neighbour cells', tone: 'good' }, { text: 'Expand rings until enough candidates', tone: 'good' }, { text: 'Distance ≠ ETA: filter and rank afterwards', tone: 'info' }],
      scene: { nodes: [rider({ tag: pill('at a cell edge', 'alert', 'warn') }), index({ tag: pill('ring 0 → 1 → 2', 'refresh') }), box('cand', 12, 0, 'Enough candidates?', 'green', 'check', { size: [1.3, 1.3], height: 26 })], links: [link('rider', 'index'), link('index', 'cand')], flows: [flow(['rider', 'index', 'cand'], { rate: 1.2 })] },
    },
    {
      short: 'Updates',
      kind: 'insight',
      title: 'The load is the moving drivers, not the riders',
      body: [
        'Every driver reports a position every few seconds. 100,000 drivers at 4 s intervals is <b>25,000 location updates per second</b> — and each can move a driver between cells, meaning a delete from one cell and an insert into another. Rider queries are comparable in number but touch only a few cells; the write path is the hard part.',
        'So the index lives <b>in memory</b>, is <b>sharded by region or cell range</b>, and updates are batched or throttled (only publish when the driver has moved enough). Durability isn’t needed: positions are re-sent within seconds, so a lost shard rebuilds itself from the next round of updates. The sliders show how update interval scales the write rate directly.',
      ],
      changes: [{ text: '100k drivers ÷ 4 s = 25k writes/s', tone: 'info' }, { text: 'In memory, sharded, ephemeral: self-heals from fresh updates', tone: 'good' }],
      scene: { nodes: [drivers({ tag: pill('position every 4 s', 'refresh') }), box('gw', -4, -5, 'Location gateway', 'teal', 'route', { size: [1.2, 1.2], height: 24 }), shardNode(0, 3), shardNode(1, 3), shardNode(2, 3)], links: [link('drivers', 'gw'), link('gw', 'sh0'), link('gw', 'sh1'), link('gw', 'sh2')], flows: [flow(['drivers', 'gw', 'sh0'], { kind: 'write', rate: 2 }), flow(['drivers', 'gw', 'sh1'], { kind: 'write', rate: 2 }), flow(['drivers', 'gw', 'sh2'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Sharding',
      kind: 'technique',
      title: 'Sharding by place, with care at the seams',
      body: [
        'Shard by geography: each shard owns a set of cells (a city, or a range of geohash prefixes). A query goes to the shard that owns the rider’s cell, plus the neighbouring shard when the search ring crosses a shard boundary. Sharding by <i>driver id</i> would force every query to hit every shard.',
        'Cities are uneven, so give busy regions more shards and rebalance by splitting a hot shard’s cell range. Keep a second copy or a fast rebuild path for failures, and put the same index behind both the rider-facing search and internal needs such as surge pricing, which counts drivers and requests per cell.',
      ],
      scene: { nodes: [rider(), box('router', -4, 0, 'Router (cell → shard)', 'orange', 'route', { size: [1.3, 1.3], height: 26 }), shardNode(0, 3), shardNode(1, 3, { tag: pill('owns the rider’s cell', 'check', 'good') }), shardNode(2, 3)], links: [link('rider', 'router'), link('router', 'sh0', { style: 'dashed' }), link('router', 'sh1'), link('router', 'sh2', { style: 'dashed' })], flows: [flow(['rider', 'router', 'sh1'], { rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Bucket, filter exactly, and keep the index in memory',
      body: [
        'Distance queries need an index that turns “near” into “same or adjacent cell”: grids, geohash, quadtrees, hexagons. Choose a cell a fraction of the search radius, always read neighbours, expand rings in sparse areas, then filter by true distance and business rules.',
        'The write path dominates: tens of thousands of position updates a second, so hold the index in memory, shard by region, and treat it as rebuildable rather than durable. Figures here are uniform-density illustrations, not measurements of any real service.',
      ],
      scene: { nodes: [drivers(), rider(), index(), db('store', 12, 0, 'In-memory shards', { size: [1.3, 1.3] })], links: [link('drivers', 'index'), link('rider', 'index', { arrow: 'both' }), link('index', 'store', { arrow: 'both' })], flows: [flow(['drivers', 'index'], { kind: 'write', rate: 2 }), flow(['rider', 'index'], { rate: 1.2 })] },
    },
  ],
};

export default lesson;
