import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const browser = (extra: Partial<SceneNode> = {}) => box('browser', -17, 0, 'Browser', 'teal', 'globe', { size: [1.4, 1.4], height: 26, ...extra });
const edge = (extra: Partial<SceneNode> = {}) => box('edge', -8, 0, 'Edge / CDN (static assets)', 'purple', 'cloud', { size: [1.4, 1.4], height: 22, ...extra });
const server = (extra: Partial<SceneNode> = {}) => box('server', 2, 0, 'App server (renders HTML)', 'orange', 'server', { size: [1.7, 1.7], height: 30, ...extra });
const data1 = (extra: Partial<SceneNode> = {}) => db('data1', 12, -6, 'Fast data source (listing)', { size: [1.3, 1.3], ...extra });
const data2 = (extra: Partial<SceneNode> = {}) => db('data2', 12, 6, 'Slow data source (recommendations)', { size: [1.3, 1.3], ...extra });

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

const lesson: Lesson = {
  slug: 'academy-this-is-how-airbnb-adopted-http-streaming-to-save-84-million-usd-in-costs',
  title: 'HTTP Streaming for Faster Pages: Flush the Shell Early',
  blurb: 'A page that waits for its slowest data before sending a single byte wastes the browser’s time. Chunked streaming sends the document head and shell immediately, lets assets download while the server finishes — with the timeline arithmetic and the pitfalls (status codes, buffering, errors).',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'ttfb', label: 'Time to first byte: buffered → streamed', icon: 'timer' },
    { key: 'assets', label: 'Scripts and styles ready: buffered → streamed', icon: 'file' },
    { key: 'tti', label: 'Page interactive: buffered → streamed', icon: 'bolt' },
    { key: 'gain', label: 'Improvement and what bounds it', icon: 'gauge' },
  ],
  goals: [
    { text: 'The buffered render: a waterfall of waiting', step: 1 },
    { text: 'Chunked transfer: flush the head immediately', step: 2 },
    { text: 'Streaming the body as data arrives', step: 3 },
    { text: 'The timeline arithmetic', step: 4 },
    { text: 'Pitfalls: status codes, buffering, errors, caching', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rtt', label: 'Round-trip time to the server', min: 5, max: 500, step: 5, default: 80, unit: ' ms', description: 'Network latency on a warm connection.' },
      { key: 'fetch', label: 'Slowest data fetch on the server', min: 0, max: 3000, step: 10, default: 400, unit: ' ms', description: 'Time until all data needed to render is available.' },
      { key: 'render', label: 'Server render time', min: 0, max: 1000, step: 10, default: 100, unit: ' ms', description: 'Producing the full HTML after the data arrives.' },
      { key: 'flush', label: 'Time to produce the shell (head)', min: 1, max: 300, step: 1, default: 20, unit: ' ms', description: 'Minimum to flush the document head and shell.' },
      { key: 'dl', label: 'Download time for scripts and styles', min: 0, max: 3000, step: 10, default: 300, unit: ' ms', description: 'Transfer time of critical assets after discovery.' },
      { key: 'hyd', label: 'Parse and hydrate', min: 0, max: 2000, step: 10, default: 200, unit: ' ms', description: 'Run the JavaScript and attach it to the page.' },
    ],
    calculate: (input, step) => {
      const rtt = Math.max(0, input.rtt ?? 80);
      const fetch = Math.max(0, input.fetch ?? 400);
      const render = Math.max(0, input.render ?? 100);
      const flush = Math.max(0, input.flush ?? 20);
      const dl = Math.max(0, input.dl ?? 300);
      const hyd = Math.max(0, input.hyd ?? 200);
      const server = fetch + render;
      // Buffered: nothing is sent until the whole document is ready.
      const ttfbB = rtt + server;
      const assetsB = ttfbB + rtt + dl;
      const ttiB = Math.max(assetsB, ttfbB) + hyd;
      // Streamed: the head goes out early, so asset downloads overlap the server's remaining work.
      const ttfbS = rtt + flush;
      const assetsS = ttfbS + rtt + dl;
      const bodyS = rtt + server;
      const ttiS = Math.max(assetsS, bodyS) + hyd;
      const bound = assetsS > bodyS ? 'asset download' : 'server data';
      return {
        ttfb: step < 2 ? { v: '—' } : { v: `${fmtMs(ttfbB)} → ${fmtMs(ttfbS)}`, tone: ttfbS < ttfbB ? 'good' : 'warn' },
        assets: step < 3 ? { v: '—' } : { v: `${fmtMs(assetsB)} → ${fmtMs(assetsS)}`, tone: assetsS < assetsB ? 'good' : 'warn' },
        tti: step < 4 ? { v: '—' } : { v: `${fmtMs(ttiB)} → ${fmtMs(ttiS)}`, tone: ttiS < ttiB ? 'good' : 'warn' },
        gain: step < 4 ? { v: '—' } : { v: `${(((ttiB - ttiS) / Math.max(1, ttiB)) * 100).toFixed(0)}% faster; now bound by ${bound}`, tone: ttiS < ttiB ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Buffered',
      kind: 'problem',
      title: 'The buffered render: nothing is sent until everything is ready',
      body: [
        'In the classic server-rendered model the server handles a request in one go: fetch all the data (listing, pricing, recommendations — in parallel, so the <b>slowest</b> one sets the time), render the full HTML, and only then write the response. The browser, meanwhile, has <b>nothing to do</b>: it can’t see the stylesheet and script URLs because they are in the document it hasn’t received. With an 80 ms round trip, 400 ms of data fetching and 100 ms of rendering, the first byte arrives at <b>580 ms</b>.',
        'Then the waterfall starts: parse the HTML, discover assets, request them (another round trip plus 300 ms of transfer — to <b>960 ms</b>), run the JavaScript and hydrate (200 ms) — <b>1,160 ms</b> before the page is interactive. The server’s idle-looking wait and the browser’s idle wait are the <b>same wasted time</b>, serialised when it could be overlapped.',
      ],
      scene: { nodes: [browser({ tag: pill('waiting… nothing to parse', 'clock', 'warn') }), server({ tag: pill('fetch 400 ms + render 100 ms', 'timer') }), data1(), data2({ state: 'hot', tag: pill('slowest: 400 ms', 'alert', 'warn') })], links: [link('browser', 'server'), link('server', 'data1'), link('server', 'data2')], flows: [flow(['browser', 'server', 'data2'], { kind: 'heavy', rate: 2, back: true })] },
    },
    {
      short: 'Chunks',
      kind: 'technique',
      title: 'Chunked transfer: send the head right away',
      body: [
        'HTTP lets a server send a response <b>without knowing its length</b>: HTTP/1.1 <b>chunked transfer encoding</b> (<code>Transfer-Encoding: chunked</code>), and in HTTP/2 and HTTP/3 simply a series of DATA frames before the stream ends. The server writes the first chunk as soon as it has it and <b>flushes</b> — the browser starts parsing the partial document immediately (HTML parsers are incremental by design).',
        'So the server sends the <b>document head and an app shell</b> after ~20 ms: <code>&lt;head&gt;</code> with charset, title, <b>preload hints</b> and the <code>&lt;link rel="stylesheet"&gt;</code> and <code>&lt;script&gt;</code> tags for critical assets, and the page chrome (header, skeleton). First byte now arrives at 80 + 20 = <b>100 ms</b> instead of 580 ms, and the browser discovers and starts fetching CSS and JS <b>while the server is still waiting on data</b>. Even sooner: HTTP <b>103 Early Hints</b> can send the preload list before the response begins.',
      ],
      changes: [{ text: 'Chunked / streamed response: flush head + shell first', tone: 'good' }, { text: 'TTFB 580 ms → 100 ms', tone: 'good' }, { text: 'Assets download in parallel with server data fetching', tone: 'good' }],
      concepts: [{ term: 'Chunked transfer', def: 'Sending a response in pieces of unknown total length so the receiver can start processing before the sender has finished producing it.' }],
      scene: { nodes: [browser({ tag: pill('parses head, fetches CSS/JS', 'search', 'good') }), edge({ tag: pill('assets from CDN', 'cloud') }), server({ tag: pill('flush head at 20 ms', 'bolt', 'good') }), data2({ tag: pill('still fetching…', 'clock') })], links: [link('browser', 'server'), link('browser', 'edge'), link('server', 'data2')], flows: [flow(['server', 'browser'], { rate: 2 }), flow(['browser', 'edge'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Body',
      kind: 'technique',
      title: 'Stream the body as each piece of data arrives',
      body: [
        'The rest of the page follows in chunks as the data behind each part resolves. With React 18 and similar frameworks this is <b>streaming server rendering with Suspense</b>: the server renders the shell with <i>placeholders</i> for slow sections, flushes it, and later sends each section’s HTML plus a tiny inline script that swaps it into place; the client <b>hydrates progressively</b> (selective hydration), so a part that has arrived becomes interactive without waiting for the rest.',
        'You choose the granularity: critical, fast content (title, price, photos) in the first flush; slow content (recommendations, reviews, personalised modules) behind boundaries that stream in later, or moved to client-side fetches. Result: perceived performance follows the <b>fastest useful content</b>, not the slowest dependency — and the server holds each request only as long as it takes to produce it, rather than idling in front of a response it can’t start. Related ideas: edge-side includes, island architectures, and out-of-order streaming.',
      ],
      changes: [{ text: 'Suspense boundaries: shell first, slow parts stream in later', tone: 'good' }, { text: 'Selective hydration: arrived sections become interactive early', tone: 'good' }],
      scene: { nodes: [browser({ tag: pill('shell + photos now; reviews later', 'check', 'good') }), server({ tag: pill('chunk 1: shell · chunk 2: listing · chunk 3: reviews', 'list') }), data1({ tag: pill('ready: stream', 'check') }), data2({ tag: pill('ready later: stream', 'clock') })], links: [link('browser', 'server'), link('server', 'data1'), link('server', 'data2')], flows: [flow(['server', 'browser'], { rate: 2.4 }), flow(['data1', 'server'], { rate: 1.6 })] },
    },
    {
      short: 'Timeline',
      kind: 'insight',
      title: 'The timeline arithmetic',
      body: [
        'Streamed: first byte at 80 + 20 = <b>100 ms</b>. The browser requests assets at once and has them at 100 + 80 + 300 = <b>480 ms</b> — before the server has even finished (the full document completes at 80 + 400 + 100 = 580 ms). Hydration begins when both the code <i>and</i> the markup are there: max(480, 580) + 200 = <b>780 ms interactive</b>, versus 1,160 ms buffered: <b>33% faster</b>, bound now by the <b>server’s data time</b>.',
        'This tells you what to optimise next. If assets are slower than data (say 700 ms of download), the streamed page is bound by asset download: shrink and split bundles, preload, use a CDN with HTTP/2 or 3. If data is the long pole, the lever is the data layer — cache, parallelise, push slow modules behind a boundary. The streaming trick <b>overlaps</b> work but cannot remove it: the gain is at most the overlappable portion (here the 300 ms asset transfer plus a round trip), and it matters most when server time is large relative to everything else.',
      ],
      changes: [{ text: 'Interactive 1,160 → 780 ms (−33%)', tone: 'good' }, { text: 'Streamed page is bound by max(assets, server data)', tone: 'info' }],
      scene: { nodes: [browser({ tag: pill('interactive at 780 ms', 'bolt', 'good') }), server({ tag: pill('done at 580 ms', 'check') }), edge({ tag: pill('assets by 480 ms', 'file') })], links: [link('browser', 'server'), link('browser', 'edge')], flows: [flow(['server', 'browser'], { rate: 2 }), flow(['edge', 'browser'], { rate: 1.8 })] },
    },
    {
      short: 'Pitfalls',
      kind: 'tradeoff',
      title: 'Pitfalls: status codes, buffering, errors and caching',
      body: [
        '<b>Status and headers are committed with the first flush</b>: once you’ve sent <code>200</code> you can’t change it to <code>404</code> or <code>500</code> or add a redirect. So resolve what decides the status (does this listing exist? is the user authenticated?) <i>before</i> flushing, stream only content after that, and handle later errors in-band (an error placeholder, a client retry). <b>Intermediaries can buffer</b> — proxies, gzip and some CDNs hold the response until a size threshold or the end (configure flush on chunks, <code>X-Accel-Buffering: no</code>, and test through the real path), which silently removes the benefit.',
        'Also: <b>caching</b> a streamed, personalised page needs care (cache the static shell at the edge and stream the dynamic parts, or cache by fragments); <b>compression</b> needs per-chunk flushing; <b>SEO and crawlers</b> need the primary content in the initial HTML (stream it early, don’t hide it behind client-only fetches); <b>memory and connection use</b> on the server rises slightly with longer-open responses and back-pressure from slow clients must be handled. Measure with real-user monitoring — TTFB, First Contentful Paint, Largest Contentful Paint and Interaction to Next Paint — not just lab runs; the gain depends on your server time and network. All figures here are model outputs.',
      ],
      changes: [{ text: 'Decide status/redirects before the first flush', tone: 'bad' }, { text: 'Verify proxies, compression and CDNs don’t buffer', tone: 'bad' }, { text: 'Cache the shell; stream dynamic parts; measure with RUM', tone: 'good' }],
      scene: { nodes: [browser(), edge({ tag: pill('must not buffer', 'alert', 'warn') }), server({ tag: pill('200 already sent — can’t become 500', 'x', 'warn') })], links: [link('browser', 'edge'), link('edge', 'server')], flows: [flow(['server', 'edge', 'browser'], { rate: 1.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Overlap the server’s wait with the browser’s work',
      body: [
        'Buffered rendering serialises server time and browser time. <b>Streaming</b> flushes the head and shell first (TTFB 580 → 100 ms), lets assets download while data loads, and streams slower sections later — interactivity 1,160 → 780 ms in this model, bound by max(asset download, server data).',
        'Commit the status before flushing, make sure nothing buffers the stream, and measure real users.',
      ],
      scene: { nodes: [browser(), edge(), server(), data1(), data2()], links: [link('browser', 'edge'), link('browser', 'server'), link('server', 'data1'), link('server', 'data2')], flows: [flow(['server', 'browser'], { rate: 2 })] },
    },
  ],
};

export default lesson;
