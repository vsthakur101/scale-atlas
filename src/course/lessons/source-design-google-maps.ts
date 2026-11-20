import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -18, 0, 12, 'map viewers (pan, zoom)', extra);
const cdn = (extra: Partial<SceneNode> = {}) => box('cdn', -9, 0, 'CDN (immutable tile URLs)', 'purple', 'cloud', { size: [1.6, 1.6], height: 26, ...extra });
const tiler = (extra: Partial<SceneNode> = {}) => box('tiler', 0, -7, 'Tile service (render or fetch)', 'orange', 'layers', { size: [1.6, 1.6], height: 28, ...extra });
const store = (extra: Partial<SceneNode> = {}) => disk('store', 9, -7, 'Pre-rendered tile store (z/x/y)', { size: [3, 1.2], height: 14, tone: 'yellow', ...extra });
const geo = (extra: Partial<SceneNode> = {}) => db('geo', 9, 3, 'Map data (roads, buildings, POIs)', { size: [1.6, 1.6], ...extra });
const route = (extra: Partial<SceneNode> = {}) => box('route', 0, 8, 'Routing + search (separate services)', 'green', 'route', { size: [1.6, 1.6], height: 26, ...extra });

const fmtN = (n: number): string => (n >= 1e15 ? `${(n / 1e15).toFixed(1)}Q` : n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);
const fmtB = (b: number): string => (b >= 1e15 ? `${(b / 1e15).toFixed(2)} PB` : b >= 1e12 ? `${(b / 1e12).toFixed(0)} TB` : `${(b / 1e9).toFixed(0)} GB`);

const lesson: Lesson = {
  slug: 'source-design-google-maps',
  title: 'Map Tiles: The Zoom Pyramid, Raster vs Vector, and Serving at Scale',
  blurb: 'A web map is a pyramid of 256-pixel tiles addressed by zoom, x and y. Count how fast tiles multiply with zoom, why you can’t pre-render the planet at street level, how vector tiles change the economics, and how a CDN absorbs the traffic.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'top', label: 'Tiles at the deepest zoom level', icon: 'layers' },
    { key: 'total', label: 'Tiles in the whole pyramid', icon: 'calc' },
    { key: 'sto', label: 'Raster storage: whole pyramid · land only', icon: 'disk' },
    { key: 'view', label: 'Tiles to fill one viewport', icon: 'globe' },
    { key: 'origin', label: 'Tile requests reaching the origin', icon: 'server' },
  ],
  goals: [
    { text: 'Projection and the z/x/y tile pyramid', step: 1 },
    { text: 'How tile counts explode with zoom', step: 2 },
    { text: 'Raster vs vector tiles', step: 3 },
    { text: 'Generation: pre-render, on demand, and caching', step: 4 },
    { text: 'CDN, versioning — and what is not tiles', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'zmax', label: 'Deepest zoom level', min: 1, max: 22, step: 1, default: 18, unit: '', description: 'Zoom 0 is the whole world in one tile.' },
      { key: 'kb', label: 'Average raster tile size', min: 1, max: 200, step: 1, default: 20, unit: ' KB', description: 'PNG/JPEG/WebP bytes per 256×256 tile.' },
      { key: 'land', label: 'Share of tiles with content (land, not open ocean)', min: 5, max: 100, step: 1, default: 30, unit: '%', description: 'Tiles that need rendering.' },
      { key: 'w', label: 'Viewport width', min: 256, max: 4096, step: 16, default: 1280, unit: ' px', description: 'Map area on screen.' },
      { key: 'h', label: 'Viewport height', min: 256, max: 3000, step: 16, default: 800, unit: ' px', description: 'Map area on screen.' },
      { key: 'viewers', label: 'Concurrent map viewers', min: 1000, max: 100000000, step: 1000, default: 1000000, unit: '', description: 'Users actively panning or zooming.' },
      { key: 'tps', label: 'Tiles requested per viewer per second', min: 0.1, max: 30, step: 0.1, default: 3, unit: '/s', description: 'Average over pans and zoom changes.' },
      { key: 'hit', label: 'CDN hit ratio', min: 50, max: 99.99, step: 0.01, default: 97, unit: '%', description: 'Tile requests served from the edge.' },
    ],
    calculate: (input, step) => {
      const z = Math.max(0, Math.min(24, Math.round(input.zmax ?? 18)));
      const kb = Math.max(0.1, input.kb ?? 20);
      const land = Math.min(1, Math.max(0.01, (input.land ?? 30) / 100));
      const w = Math.max(1, input.w ?? 1280);
      const h = Math.max(1, input.h ?? 800);
      const viewers = Math.max(1, input.viewers ?? 1e6);
      const tps = Math.max(0, input.tps ?? 3);
      const hit = Math.min(0.99999, Math.max(0, (input.hit ?? 97) / 100));
      const top = Math.pow(4, z);
      const total = (Math.pow(4, z + 1) - 1) / 3;
      const bytes = total * kb * 1000;
      // A viewport of w×h pixels overlaps ⌈w/256⌉+1 columns and ⌈h/256⌉+1 rows in the worst alignment.
      const view = (Math.ceil(w / 256) + 1) * (Math.ceil(h / 256) + 1);
      const origin = viewers * tps * (1 - hit);
      return {
        top: step < 2 ? { v: '—' } : { v: `${fmtN(top)} (4^${z}; ${fmtN(Math.pow(2, z))} × ${fmtN(Math.pow(2, z))} grid)` },
        total: step < 2 ? { v: '—' } : { v: `${fmtN(total)} tiles over zoom 0–${z}` },
        sto: step < 2 ? { v: '—' } : { v: `${fmtB(bytes)} · ${fmtB(bytes * land)} at ${(land * 100).toFixed(0)}% content`, tone: bytes * land < 1e15 ? 'warn' : 'bad' },
        view: step < 2 ? { v: '—' } : { v: `${view} tiles (${Math.ceil(w / 256) + 1} × ${Math.ceil(h / 256) + 1} incl. edges)` },
        origin: step < 5 ? { v: '—' } : { v: `${fmtN(origin)}/s of ${fmtN(viewers * tps)}/s (${((1 - hit) * 100).toFixed(1)}% miss)`, tone: origin < 2e5 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Pyramid',
      kind: 'insight',
      title: 'A map is a pyramid of square tiles',
      body: [
        'A map can’t be sent as one image — the planet at street detail is far too large — so web maps cut the world into <b>256 × 256-pixel tiles</b> and send only those in view. The globe is first flattened with the <b>Web Mercator</b> projection (EPSG:3857: conformal, so shapes and angles are preserved locally and the world is a square, at the price of exaggerated area near the poles and a latitude cut-off near ±85°). That square is recursively divided: <b>zoom 0</b> is one tile covering everything; each zoom level splits every tile into <b>four</b> children, so zoom <i>z</i> has 2ᶻ × 2ᶻ tiles.',
        'A tile is addressed by <code>/z/x/y</code> — zoom, column, row — so the URL for any tile is computed from a latitude/longitude and zoom with simple arithmetic, tiles are independent <b>cacheable static files</b>, and the client just requests the handful it needs and stitches them. A <b>quadkey</b> (interleaving the bits of x and y into a base-4 string) turns the same address into a one-dimensional key that preserves locality, which is how tiles are stored in key–value or range-sharded stores. (This is the quadtree of the Geospatial lessons, applied to rendering.)',
      ],
      scene: { nodes: [users({ tag: pill('/18/142283/94536.png', 'link') }), cdn(), tiler(), store()], links: [link('users', 'cdn'), link('cdn', 'tiler'), link('tiler', 'store')], flows: [flow(['users', 'cdn', 'tiler', 'store'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Counts',
      kind: 'problem',
      title: '4^z: why street level can’t be pre-rendered everywhere',
      body: [
        'Tile counts grow by <b>×4 per zoom level</b>: zoom 10 has 1 million tiles, zoom 14 has 268 million, zoom 18 has <b>68.7 billion</b>. The whole pyramid to zoom 18 is (4¹⁹ − 1) ÷ 3 ≈ <b>91.6 billion tiles</b>; at 20 KB each that is <b>1.8 petabytes</b> as raster images — and zoom 19–22 (building-level detail) multiply it by 4 each. Most of that is empty or uninteresting: ~70% of the world is ocean or wilderness, and an ocean tile at zoom 18 is a flat blue square. Even restricting to the 30% with content is ~550 TB, rendered with a cartographic style that changes whenever designers retouch it — each style change means re-rendering everything.',
        'One screen needs very few: a 1280 × 800 viewport overlaps ⌈1280 ÷ 256⌉ + 1 = 6 columns and ⌈800 ÷ 256⌉ + 1 = 5 rows = <b>30 tiles</b> (including the edges), plus a ring of prefetched neighbours. Demand is also heavily skewed: cities at low-to-mid zoom are requested constantly, while a random rural z18 tile may be requested once a year. So the design question is <b>which tiles to store</b>, <b>which to render on demand</b>, and <b>how to avoid rendering the same tile twice</b>.',
      ],
      changes: [{ text: 'Tiles per zoom ×4: z10 1M · z14 268M · z18 68.7B', tone: 'info' }, { text: 'Pyramid to z18 ≈ 91.6B tiles ≈ 1.8 PB raster; land-only ≈ 550 TB', tone: 'bad' }, { text: 'A viewport needs ~30 tiles; demand is very skewed', tone: 'good' }],
      concepts: [{ term: 'Tile pyramid', def: 'The set of tiles at every zoom level, where each tile at zoom z is replaced by four at zoom z+1, so counts grow as 4ᶻ.' }],
      scene: { nodes: [users({ tag: pill('30 tiles per screen', 'globe') }), cdn(), store({ tag: pill('91.6B tiles · 1.8 PB', 'disk', 'warn') }), geo()], links: [link('users', 'cdn'), link('cdn', 'store'), link('store', 'geo', { style: 'dashed' })], flows: [flow(['users', 'cdn', 'store'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Vector',
      kind: 'technique',
      title: 'Raster tiles vs vector tiles',
      body: [
        '<b>Raster tiles</b> are finished images: the server renders the map style to pixels, the client displays them. Simple clients, identical look everywhere, but every <b>style change re-renders the world</b>, labels are baked in (can’t rotate with the map or avoid overlapping a route), high-DPI screens need 4× the pixels (512 px “@2x” tiles), and zooming between levels shows blurry scaling until the next tile arrives. <b>Vector tiles</b> (Mapbox Vector Tile / protobuf, ~10–40 KB) carry the <b>geometry and attributes</b> — road lines with class and name, building polygons with height, water, place labels — quantised to a 4096-unit grid and clipped to the tile; the <b>client renders them with GPU shaders using a style</b> (JSON). One data tile supports many styles (light, dark, satellite overlay, routes highlighted), arbitrary rotation and tilt, smooth continuous zoom (the client interpolates between levels, and even “overzooms” a tile beyond its max), 3D buildings and crisp text at any DPI.',
        'The economics change: the server work is <b>cutting and simplifying geometry</b> (generalise detail per zoom — fewer roads at low zoom, drop tiny features; <b>Douglas–Peucker</b>-style simplification), not painting pixels, and a style change is a client download of a few KB, not a re-render of the planet. Trade-offs: client CPU/GPU load, a heavier client library, and <b>data size</b> can be larger than a simple raster for dense city tiles. Imagery (satellite, aerial) stays raster, often JPEG/WebP and generated per zoom from source imagery mosaics. Most modern maps are vector for the base map plus raster layers for imagery.',
      ],
      changes: [{ text: 'Raster: finished pixels; style change = re-render everything', tone: 'bad' }, { text: 'Vector: geometry + attributes; client styles, rotates, tilts, smooth zoom', tone: 'good' }, { text: 'Simplify geometry per zoom; imagery stays raster', tone: 'info' }],
      scene: { nodes: [users({ tag: pill('GPU renders with a style', 'cpu', 'good') }), cdn(), tiler({ tag: pill('slice + simplify + clip → .mvt', 'layers', 'good') }), geo({ tag: pill('roads · buildings · POIs', 'db') })], links: [link('users', 'cdn'), link('cdn', 'tiler'), link('tiler', 'geo')], flows: [flow(['users', 'cdn', 'tiler', 'geo'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Generate',
      kind: 'technique',
      title: 'Pre-render the popular, generate the rest on demand',
      body: [
        'A practical hybrid: <b>pre-generate low zoom levels</b> (0–12: a few tens of millions of tiles, requested constantly) in batch from the map database on each data release; for <b>high zooms</b> generate tiles <b>on first request</b> and cache the result — in the tile store and at the CDN — so only tiles that someone looks at ever exist, and popular areas (city centres) warm up first. <b>Empty-tile elision</b> (ocean tiles share one stored blob or are synthesised on the fly) and a <b>“metatile”</b> approach (render an 8 × 8 block at once so labels and strokes near tile edges are consistent, then slice into tiles) cut work and seams. Prefetch the ring of neighbours and the next zoom level the user is likely to enter.',
        'Data freshness complicates caching: roads open, shops move, traffic changes. Separate <b>slow-changing base data</b> (rebuilt in periodic releases, tiles versioned by data release) from <b>fast-changing layers</b> (live traffic, transit, incidents — separate overlay tiles with short TTLs or separate real-time vector layers, see the ETA lesson). Generation pipelines ingest sources (OpenStreetMap-like extracts, government data, imagery, probe data from devices), conflate and validate them, then build tiles with tools like tippecanoe, Planetiler or custom renderers — massively parallel batch jobs measured in hours for the planet at moderate zoom.',
      ],
      changes: [{ text: 'Pre-render z0–12; render z13+ on first request and cache', tone: 'good' }, { text: 'Elide empty tiles; metatiles for seamless labels; prefetch neighbours', tone: 'good' }, { text: 'Base data in versioned releases; fast layers as short-TTL overlays', tone: 'info' }],
      scene: { nodes: [tiler({ tag: pill('miss → render + store', 'refresh') }), store({ tag: pill('z0–12 pre-built', 'disk', 'good') }), geo({ tag: pill('release 2026-11', 'list') }), cdn({ tag: pill('cache for a year', 'timer') })], links: [link('cdn', 'tiler'), link('tiler', 'store'), link('tiler', 'geo')], flows: [flow(['cdn', 'tiler', 'geo'], { rate: 1.6 }), flow(['tiler', 'store'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Serve',
      kind: 'tradeoff',
      title: 'CDN, versioning — and what isn’t tiles',
      body: [
        'Tiles are the ideal CDN workload: <b>immutable, small, keyed by a URL</b> that includes the data version (<code>/v2026-11/18/142283/94536.pbf</code>), so they cache for a year with no invalidation — a new release is a new URL prefix. With 1 million concurrent viewers each requesting 3 tiles/s there are <b>3 million tile requests per second</b>; at a <b>97% hit ratio</b> only <b>90,000/s</b> reach the origin (and tile servers also sit behind a shield cache so a popular miss is rendered once, not once per edge). Hit ratio is the lever: at 90% the origin sees 300,000/s. Compress vector tiles (gzip/brotli), use HTTP/2 or 3 so dozens of small requests multiplex, and cap zoom-in prefetching so panning isn’t wasteful.',
        'The tile system is only <b>one service</b> among several. <b>Geocoding and search</b> (text → coordinates and places: inverted indexes plus spatial filters, see the Search lessons), <b>routing</b> (shortest path with contraction hierarchies or similar over the road graph — see the ETA lesson), <b>traffic</b> (probe-data aggregation), <b>places/POI data</b> (businesses, reviews, hours) and <b>street imagery</b> are separate backends with their own data and scale, and the client composes them. Offline maps are downloadable tile bundles for a region. Figures in this lesson are model outputs from the stated zoom, tile sizes, hit ratio and traffic.',
      ],
      changes: [{ text: 'Versioned immutable URLs: cache a year, no invalidation', tone: 'good' }, { text: '3M tiles/s × 3% miss = 90,000/s to the origin (97% hit)', tone: 'info' }, { text: 'Search, routing, traffic, POIs are separate services', tone: 'info' }],
      scene: { nodes: [users({ tag: pill('3M tiles/s', 'activity') }), cdn({ tag: pill('97% hit', 'check', 'good') }), tiler({ tag: pill('90k/s origin', 'gauge') }), route({ tag: pill('search · routing · traffic', 'route') })], links: [link('users', 'cdn'), link('cdn', 'tiler'), link('users', 'route', { style: 'dashed' })], flows: [flow(['users', 'cdn', 'tiler'], { rate: 2 }), flow(['users', 'route'], { rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: '4^z tiles, cached forever by version',
      body: [
        'A map is a <b>zoom pyramid</b> of 256-px tiles at <code>/z/x/y</code>; counts grow ×4 per level (68.7B at z18; 91.6B total ≈ 1.8 PB raster), so pre-render only low zooms and <b>generate high zooms on demand</b>. <b>Vector tiles</b> move styling to the client and make style changes cheap.',
        'Serve through a CDN with versioned immutable URLs (97% hit → 90,000/s to the origin here); search, routing and traffic are separate systems.',
      ],
      scene: { nodes: [users(), cdn(), tiler(), store(), geo()], links: [link('users', 'cdn'), link('cdn', 'tiler'), link('tiler', 'store'), link('tiler', 'geo')], flows: [flow(['users', 'cdn', 'tiler', 'store'], { rate: 1.6, back: true })] },
    },
  ],
};

export default lesson;
