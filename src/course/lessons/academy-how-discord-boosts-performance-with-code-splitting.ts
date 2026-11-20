import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const browser = (extra: Partial<SceneNode> = {}) => box('browser', -18, 0, 'Browser (mid-range phone CPU)', 'teal', 'globe', { size: [1.5, 1.5], height: 26, ...extra });
const cdn = (extra: Partial<SceneNode> = {}) => box('cdn', -8, 0, 'CDN (content-hashed files)', 'purple', 'cloud', { size: [1.5, 1.5], height: 24, ...extra });
const main = (extra: Partial<SceneNode> = {}) => disk('main', 3, -8, 'Entry chunk (critical route)', { size: [2.6, 1], height: 12, tone: 'yellow', ...extra });
const vendor = (extra: Partial<SceneNode> = {}) => disk('vendor', 3, 0, 'Vendor chunk (framework, rarely changes)', { size: [2.6, 1], height: 12, tone: 'yellow', ...extra });
const lazy = (extra: Partial<SceneNode> = {}) => disk('lazy', 3, 8, 'Route / feature chunks (loaded on demand)', { size: [2.6, 1], height: 12, tone: 'yellow', ...extra });
const thread = (extra: Partial<SceneNode> = {}) => db('thread', 14, 0, 'Main thread: parse → compile → execute', { size: [1.5, 1.5], ...extra });

const fmtS = (s: number): string => (s >= 1 ? `${s.toFixed(2)} s` : `${Math.round(s * 1000)} ms`);
const fmtK = (kb: number): string => (kb >= 1000 ? `${(kb / 1000).toFixed(1)} MB` : `${Math.round(kb)} KB`);

const lesson: Lesson = {
  slug: 'academy-how-discord-boosts-performance-with-code-splitting',
  title: 'Code Splitting: Ship Only the JavaScript the First Screen Needs',
  blurb: 'JavaScript costs download time and main-thread time. Split one large bundle into an entry chunk plus on-demand chunks, then measure the startup saving, the cache benefit of content-hashed chunks, and the traps of over-splitting.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'single', label: 'Single bundle: time until interactive', icon: 'timer' },
    { key: 'split', label: 'Split: time until the first screen is interactive', icon: 'bolt' },
    { key: 'lazy', label: 'Opening a lazy route (no prefetch)', icon: 'clock' },
    { key: 'rel', label: 'Re-download after a release: single vs split', icon: 'refresh' },
  ],
  goals: [
    { text: 'The cost of a byte of JavaScript', step: 1 },
    { text: 'Splitting by route and component with dynamic import', step: 2 },
    { text: 'Critical path, preload and prefetch', step: 3 },
    { text: 'Chunk strategy for caching across releases', step: 4 },
    { text: 'Pitfalls and how to keep it from regressing', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'kb', label: 'Total JavaScript (compressed)', min: 50, max: 10000, step: 10, default: 900, unit: ' KB', description: 'Gzip/brotli size of all app code and dependencies.' },
      { key: 'crit', label: 'Share needed for the first screen', min: 5, max: 100, step: 1, default: 25, unit: '%', description: 'Code actually used by the landing route.' },
      { key: 'mbps', label: 'Network bandwidth', min: 0.5, max: 200, step: 0.5, default: 10, unit: ' Mbps', description: 'Effective throughput.' },
      { key: 'rtt', label: 'Round-trip time', min: 5, max: 600, step: 5, default: 100, unit: ' ms', description: 'Latency per request.' },
      { key: 'exec', label: 'Parse + compile + run cost', min: 0.1, max: 5, step: 0.1, default: 1, unit: ' ms/KB', description: 'Main-thread time per compressed KB (mid-range mobile CPU).' },
      { key: 'chunks', label: 'Chunks in the split build', min: 2, max: 200, step: 1, default: 20, unit: '', description: 'Number of separately cached files.' },
      { key: 'touch', label: 'Chunks changed by a typical release', min: 1, max: 50, step: 1, default: 1, unit: '', description: 'Files whose content hash changes.' },
      { key: 'route', label: 'Size of a lazy route chunk', min: 5, max: 1000, step: 5, default: 100, unit: ' KB', description: 'Fetched when the user navigates.' },
    ],
    calculate: (input, step) => {
      const kb = Math.max(1, input.kb ?? 900);
      const crit = Math.min(1, Math.max(0.01, (input.crit ?? 25) / 100));
      const mbps = Math.max(0.1, input.mbps ?? 10);
      const rtt = Math.max(0, (input.rtt ?? 100) / 1000);
      const exec = Math.max(0, (input.exec ?? 1) / 1000);
      const chunks = Math.max(2, Math.round(input.chunks ?? 20));
      const touch = Math.min(chunks, Math.max(1, Math.round(input.touch ?? 1)));
      const route = Math.max(1, input.route ?? 100);
      const dl = (k: number) => (k * 8) / (mbps * 1000);
      const single = rtt + dl(kb) + kb * exec;
      const critKb = kb * crit;
      const split = rtt + dl(critKb) + critKb * exec;
      const lazyT = rtt + dl(route) + route * exec;
      const relSplit = (kb / chunks) * touch;
      return {
        single: step < 1 ? { v: '—' } : { v: `${fmtS(single)} (${fmtS(dl(kb))} download + ${fmtS(kb * exec)} execute)`, tone: single < 2 ? 'good' : 'bad' },
        split: step < 2 ? { v: '—' } : { v: `${fmtS(split)} for ${fmtK(critKb)} (${(((single - split) / single) * 100).toFixed(0)}% faster)`, tone: split < 1 ? 'good' : 'warn' },
        lazy: step < 3 ? { v: '—' } : { v: `${fmtS(lazyT)} for ${fmtK(route)} — hide it with prefetch`, tone: lazyT < 0.5 ? 'good' : 'warn' },
        rel: step < 4 ? { v: '—' } : { v: `${fmtK(kb)} → ${fmtK(relSplit)} (${touch} of ${chunks} chunks changed)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Cost',
      kind: 'problem',
      title: 'JavaScript is the most expensive byte on the page',
      body: [
        'A byte of JavaScript costs more than a byte of image. An image needs download and a cheap decode that happens off the main thread; a script must be downloaded, then <b>parsed, compiled and executed on the main thread</b> — the same thread that handles taps and paints the screen — and execution often triggers more network calls and rendering. On a mid-range phone, the compile-and-run cost is on the order of <b>1 ms per compressed KB</b> (a rough figure that varies widely with device and code).',
        'Consider a single-page app that ships one bundle: 900 KB compressed. Over a 10 Mbps link with a 100 ms round trip, download is 0.1 + 0.72 = 0.82 s, and executing it adds another 0.9 s — <b>about 1.7 s before the app is interactive</b>, even though the landing screen only uses a small fraction of the code (a login form, a feed). The rest — settings, admin tools, editors, rarely visited routes — was downloaded and run for nothing. That waste is what <b>code splitting</b> removes.',
      ],
      scene: { nodes: [browser({ tag: pill('waiting on 900 KB', 'clock', 'warn') }), cdn(), main({ name: 'One 900 KB bundle', tag: pill('everything, up front', 'alert', 'warn') }), thread({ tag: pill('0.9 s of main-thread work', 'cpu', 'warn') })], links: [link('browser', 'cdn'), link('cdn', 'main'), link('main', 'thread')], flows: [flow(['browser', 'cdn', 'main', 'thread'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Split',
      kind: 'technique',
      title: 'Split by route and component; load on demand',
      body: [
        'Bundlers (webpack, Rollup, Vite/esbuild, Parcel) split code at <b>dynamic <code>import()</code> boundaries</b>: <code>const Settings = lazy(() =&gt; import("./Settings"))</code> becomes a separate file fetched only when needed. Choose boundaries along <b>user journeys</b>: one chunk per <b>route</b> (the biggest win — most users visit a few of dozens of pages), <b>heavy components</b> shown conditionally (rich-text editor, charting library, PDF viewer, map, emoji picker, video player), and <b>rarely used features</b> behind a click. Frameworks provide this: React <code>lazy</code> + <code>Suspense</code>, Next.js per-page splitting, Vue/Angular lazy routes.',
        'With 25% of the code needed for the first screen, the entry chunk is 225 KB: download 0.1 + 0.18 s, execute 0.225 s = <b>≈ 0.5 s</b> to interactive — <b>70% faster</b> than the monolith. Also split <b>by condition</b> (polyfills only for browsers that need them, locale data per language, desktop vs mobile UI) and move third-party scripts (analytics, chat widgets) out of the critical path with <code>async</code>/<code>defer</code> or load-on-idle. The measure is bytes <i>executed</i> before first interaction, not total size.',
      ],
      changes: [{ text: 'dynamic import() boundaries per route and heavy component', tone: 'good' }, { text: '225 KB entry: ≈ 0.5 s to interactive vs ≈ 1.7 s', tone: 'good' }, { text: 'Conditional splits: polyfills, locales, device UIs, third parties', tone: 'info' }],
      concepts: [{ term: 'Code splitting', def: 'Breaking a build into several files so the browser downloads and runs only the code a given screen needs, loading the rest on demand.' }],
      scene: { nodes: [browser({ tag: pill('interactive at ~0.5 s', 'bolt', 'good') }), cdn(), main({ tag: pill('225 KB', 'check', 'good') }), lazy({ tag: pill('675 KB: on demand', 'clock') }), thread()], links: [link('browser', 'cdn'), link('cdn', 'main'), link('cdn', 'lazy', { style: 'dashed' }), link('main', 'thread')], flows: [flow(['browser', 'cdn', 'main', 'thread'], { rate: 2.4 })] },
    },
    {
      short: 'Preload',
      kind: 'technique',
      title: 'Critical path, preload and prefetch',
      body: [
        'Splitting moves cost from startup to <b>navigation</b>: opening a lazy route fetches its chunk — a 100 KB chunk takes 0.1 + 0.08 + 0.1 = <b>≈ 0.28 s</b> of waiting on a first visit. Hide it with resource hints: <code>&lt;link rel="preload"&gt;</code> for chunks the first screen <i>will</i> need (so the browser fetches them in parallel with the entry file, not after it executes and discovers them), <code>&lt;link rel="prefetch"&gt;</code> or <code>import()</code> in an idle callback for likely next routes (fetched at low priority when the network is idle), and <b>hover/viewport prefetch</b> on links (start loading when the pointer approaches or the link scrolls into view). Frameworks automate this for links.',
        'Also shorten the <b>critical request chain</b>: HTML → entry script → <i>then</i> discovers chunk A → <i>then</i> chunk B is a serial waterfall of round trips (each 100 ms here); emit <b>modulepreload</b> for the known dependency graph, serve over HTTP/2 or 3 so many small files multiplex, and combine with server streaming (see the HTTP Streaming lesson) so asset downloads overlap server work. Keep above-the-fold CSS inline or preloaded; code-splitting JavaScript does not help if render-blocking CSS or fonts dominate.',
      ],
      changes: [{ text: 'First visit to a lazy route: ≈ 0.28 s — hide with prefetch', tone: 'info' }, { text: 'preload known chunks; prefetch likely next routes; hover prefetch', tone: 'good' }, { text: 'Avoid serial discovery waterfalls: modulepreload the graph', tone: 'good' }],
      scene: { nodes: [browser({ tag: pill('idle → prefetch /settings', 'search') }), cdn({ tag: pill('HTTP/2: parallel', 'globe') }), main(), lazy({ tag: pill('already cached when clicked', 'check', 'good') })], links: [link('browser', 'cdn'), link('cdn', 'main'), link('cdn', 'lazy', { style: 'dashed' })], flows: [flow(['browser', 'cdn', 'lazy'], { rate: 1.2 })] },
    },
    {
      short: 'Caching',
      kind: 'technique',
      title: 'Chunk strategy: make releases cheap to re-download',
      body: [
        'Name files by <b>content hash</b> (<code>app.3fa91c.js</code>) and serve them with <code>Cache-Control: max-age=31536000, immutable</code>: a file is cached forever, and a change produces a new URL, so there is never a stale-cache or invalidation problem. The granularity of chunks then decides how much of the cache survives a deploy. A <b>single bundle</b> changes entirely on every release: every returning user re-downloads <b>all 900 KB</b>. With <b>20 chunks</b> and a release touching one feature, returning users re-download <b>45 KB</b> (1/20th); the vendor chunk (React, the router, utility libraries) stays cached across many releases.',
        'Practical split: a <b>vendor/framework chunk</b> (changes only on dependency upgrades), a <b>shared/common chunk</b> for code used by several routes (so it isn’t duplicated into each), <b>per-route chunks</b>, and a tiny <b>runtime/manifest</b> chunk that maps names to hashes (kept small and uncached or short-cached so new releases are discovered). Pitfall: if the shared chunk is too eager it grows into a second monolith; if the vendor chunk bundles <i>all</i> dependencies, any upgrade invalidates it — consider splitting heavy independent libraries (charts, editors) into their own chunks.',
      ],
      changes: [{ text: 'Content-hashed, immutable files: no stale caches', tone: 'good' }, { text: 'Release touching 1 of 20 chunks: 45 KB vs 900 KB re-download', tone: 'good' }, { text: 'vendor + shared + route chunks + a tiny manifest', tone: 'info' }],
      scene: { nodes: [browser({ tag: pill('cached: 19 of 20 chunks', 'check', 'good') }), cdn({ tag: pill('immutable, 1 year', 'timer') }), vendor({ tag: pill('unchanged', 'check') }), main({ tag: pill('app.3fa91c.js (new)', 'refresh') })], links: [link('browser', 'cdn'), link('cdn', 'vendor'), link('cdn', 'main')], flows: [flow(['browser', 'cdn', 'main'], { rate: 1.4 })] },
    },
    {
      short: 'Pitfalls',
      kind: 'tradeoff',
      title: 'Pitfalls, and keeping the gain',
      body: [
        '<b>Over-splitting</b>: hundreds of tiny chunks add request overhead and lose compression (gzip works better on larger files), and each lazy boundary is a potential waterfall; aim for chunks of tens of KB and not one per component. <b>Duplicated dependencies</b>: two chunks that both import a large library may each include a copy unless the bundler extracts a shared chunk — check the bundle analyser. <b>Loading states</b>: a lazy component needs a skeleton/fallback and an error boundary for failed chunk loads (stale tabs after a deploy request old hashes that may be gone — retry, then reload the page). <b>SSR and hydration</b>: split code must match server-rendered markup; loading a hydration-critical chunk late delays interactivity.',
        'Keep the gain: set a <b>performance budget</b> in CI (entry JS ≤ 200 KB compressed; fail the build when exceeded), track <b>bundle size per route</b> on each PR, run <b>webpack-bundle-analyzer</b>/<code>source-map-explorer</code> periodically, and measure real users (<b>Interaction to Next Paint</b>, Largest Contentful Paint, Total Blocking Time) rather than lab numbers alone. Remove weight at the source too: <b>tree-shake</b> unused exports, replace heavy dependencies (a 70 KB date library for one function), drop polyfills for modern browsers, and use <b>server components</b>/islands so some UI ships no JavaScript at all. The timings here are model outputs from assumed bandwidth, latency and per-KB execution cost.',
      ],
      changes: [{ text: 'Avoid tiny chunks and duplicated dependencies; add fallbacks and error handling', tone: 'bad' }, { text: 'CI budgets, bundle analysis and real-user metrics keep it from regressing', tone: 'good' }, { text: 'Tree-shake, trim dependencies, ship less JS by design', tone: 'good' }],
      scene: { nodes: [browser(), cdn(), main({ tag: pill('budget ≤ 200 KB in CI', 'shield', 'good') }), lazy({ tag: pill('fallback + retry on failure', 'refresh') })], links: [link('browser', 'cdn'), link('cdn', 'main'), link('cdn', 'lazy', { style: 'dashed' })], flows: [flow(['browser', 'cdn', 'main'], { rate: 1.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Run less JavaScript before the first interaction',
      body: [
        'JavaScript costs download <i>and</i> main-thread time (~1 ms per compressed KB here). <b>Split</b> at routes and heavy components with dynamic imports (900 KB at ≈ 1.7 s → a 225 KB entry at ≈ 0.5 s), <b>preload/prefetch</b> what is coming, and use <b>content-hashed chunks</b> so a release re-downloads 45 KB, not 900.',
        'Avoid over-splitting and duplicates, handle load failures, and enforce a size budget with real-user monitoring.',
      ],
      scene: { nodes: [browser(), cdn(), main(), vendor(), lazy()], links: [link('browser', 'cdn'), link('cdn', 'main'), link('cdn', 'vendor'), link('cdn', 'lazy', { style: 'dashed' })], flows: [flow(['browser', 'cdn', 'main'], { rate: 1.8 })] },
    },
  ],
};

export default lesson;
