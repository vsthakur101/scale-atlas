import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const net = (extra: Partial<SceneNode> = {}) => box('net', -16, 0, 'Network', 'blue', 'globe', { size: [1.3, 1.3], height: 24, ...extra });
const html = (extra: Partial<SceneNode> = {}) => box('html', -9, -5, 'HTML → DOM', 'orange', 'file', { size: [1.3, 1.3], height: 24, ...extra });
const css = (extra: Partial<SceneNode> = {}) => box('css', -9, 5, 'CSS → CSSOM', 'purple', 'file', { size: [1.3, 1.3], height: 22, ...extra });
const tree = (extra: Partial<SceneNode> = {}) => box('tree', -1, 0, 'Render tree', 'green', 'layers', { size: [1.4, 1.4], height: 26, ...extra });
const layout = (extra: Partial<SceneNode> = {}) => box('layout', 6, 0, 'Layout', 'teal', 'gauge', { size: [1.2, 1.2], height: 22, ...extra });
const paint = (extra: Partial<SceneNode> = {}) => box('paint', 12, 0, 'Paint + composite', 'red', 'bolt', { size: [1.3, 1.3], height: 26, ...extra });
const js = (extra: Partial<SceneNode> = {}) => db('js', -1, -8, 'JavaScript', { size: [1.2, 1.2], ...extra });

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

const lesson: Lesson = {
  slug: 'source-how-browsers-render-web-pages',
  title: 'How Browsers Render a Page: The Critical Rendering Path',
  blurb: 'HTML to DOM, CSS to CSSOM, the render tree, layout, paint — and which resources block the first pixel, with the round-trip arithmetic of what optimisation buys.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'fcp', label: 'First paint (as built)', icon: 'clock' },
    { key: 'opt', label: 'First paint (critical CSS inlined, JS deferred)', icon: 'check' },
    { key: 'rt', label: 'Round trips before first paint', icon: 'refresh' },
    { key: 'kb', label: 'Bytes needed before first paint', icon: 'file' },
  ],
  goals: [
    { text: 'The pipeline from bytes to pixels', step: 1 },
    { text: 'Why CSS blocks rendering', step: 3 },
    { text: 'Why synchronous JavaScript blocks parsing', step: 4 },
    { text: 'Layout, paint, compositing and what triggers them', step: 5 },
    { text: 'Optimisations: critical CSS, defer, preload', step: 6 },
  ],
  legend: ['request', 'response', 'heavy', 'write'],
  dynamic: {
    parameters: [
      { key: 'rtt', label: 'Round-trip time', min: 10, max: 500, step: 10, default: 80, unit: ' ms', description: 'Latency to the server.' },
      { key: 'bw', label: 'Bandwidth', min: 1, max: 500, step: 1, default: 20, unit: ' Mbps', description: 'Download speed.' },
      { key: 'html', label: 'HTML size', min: 5, max: 500, step: 5, default: 50, unit: ' KB', description: 'Compressed HTML document.' },
      { key: 'css', label: 'Render-blocking CSS', min: 0, max: 1000, step: 10, default: 120, unit: ' KB', description: 'Stylesheets in <head>.' },
      { key: 'js', label: 'Synchronous scripts in <head>', min: 0, max: 2000, step: 10, default: 300, unit: ' KB', description: 'Total size of blocking scripts.' },
      { key: 'cpu', label: 'Parse + layout + paint work', min: 20, max: 1500, step: 10, default: 150, unit: ' ms', description: 'Main-thread time on the device (slower phones: higher).' },
      { key: 'crit', label: 'Critical CSS to inline', min: 2, max: 60, step: 1, default: 14, unit: ' KB', description: 'Above-the-fold styles inlined in the HTML.' },
    ],
    calculate: (input, step) => {
      const rtt = Math.max(1, input.rtt ?? 80);
      const kbPerMs = Math.max(0.01, ((input.bw ?? 20) * 1000) / 8 / 1000); // Mbps → KB per ms
      const html = Math.max(1, input.html ?? 50);
      const css = Math.max(0, input.css ?? 120);
      const js = Math.max(0, input.js ?? 300);
      const cpu = Math.max(0, input.cpu ?? 150);
      const crit = Math.max(0, input.crit ?? 14);
      // Connection: TCP + TLS 1.3 = 2 round trips; HTML request = 1 round trip.
      const setup = 2 * rtt;
      const htmlT = rtt + html / kbPerMs;
      // The preload scanner finds CSS and scripts early; they download in parallel, so the slower one gates rendering.
      const cssT = css > 0 ? rtt + css / kbPerMs : 0;
      const jsT = js > 0 ? rtt + js / kbPerMs : 0;
      const fcp = setup + htmlT + Math.max(cssT, jsT) + cpu;
      // Optimised: critical CSS inlined (HTML grows), the rest loaded async, scripts deferred.
      const optT = rtt + (html + crit) / kbPerMs;
      const opt = setup + optT + cpu * 0.85;
      const rts = 3 + (css > 0 || js > 0 ? 1 : 0);
      return {
        fcp: step < 1 ? { v: '—' } : { v: fmtMs(fcp), tone: fcp < 1000 ? 'good' : fcp < 2500 ? 'warn' : 'bad' },
        opt: step < 5 ? { v: '—' } : { v: `${fmtMs(opt)} (${Math.round((1 - opt / fcp) * 100)}% faster)`, tone: 'good' },
        rt: step < 2 ? { v: '—' } : { v: `${rts} (setup 2 · HTML 1${rts > 3 ? ' · CSS/JS 1' : ''})` },
        kb: step < 2 ? { v: '—' } : { v: `${html + css + js} KB (${html} HTML + ${css} CSS + ${js} JS)`, tone: html + css + js > 600 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Pipeline',
      kind: 'insight',
      title: 'From bytes to pixels',
      body: [
        'The browser turns a response into pixels through the <b>critical rendering path</b>: parse the HTML into the <b>DOM</b>; parse CSS into the <b>CSSOM</b>; combine them into a <b>render tree</b> of visible elements with computed styles; run <b>layout</b> (positions and sizes); <b>paint</b> (draw layers into pixels); and <b>composite</b> layers on the GPU. JavaScript can intervene at almost every stage by changing the DOM or styles.',
        'The first pixels appear only after enough of this has happened — which depends on which resources <b>block</b> it. “First paint” time is therefore the sum of network round trips and bytes on the blocking path, plus main-thread work. Optimising a page means shortening that path, not shrinking everything equally.',
      ],
      scene: { nodes: [net(), html(), css(), tree(), layout(), paint()], links: [link('net', 'html'), link('net', 'css'), link('html', 'tree'), link('css', 'tree'), link('tree', 'layout', { arrow: 'end' }), link('layout', 'paint', { arrow: 'end' })], flows: [flow(['net', 'html', 'tree', 'layout', 'paint'], { rate: 1.5 })] },
    },
    {
      short: 'Parsing',
      kind: 'technique',
      title: 'Incremental HTML parsing and the preload scanner',
      body: [
        'The parser builds the DOM <b>incrementally</b> as bytes arrive, so the head and early body are processed while the rest of the page is still downloading — one reason to send HTML early (and flush the head). A secondary <b>preload scanner</b> races ahead over the raw markup to find stylesheets, scripts and images and start those requests immediately, in parallel, even while the main parser is blocked.',
        'Cost accounting for the defaults: TCP + TLS 1.3 setup is <b>2 round trips</b>, the HTML request <b>1 more</b>, then CSS and JS discovered by the scanner download in parallel — <b>one more round trip</b> plus transfer time. That’s 4 round trips (320 ms at 80 ms) before CPU work even starts.',
      ],
      changes: [{ text: 'Incremental DOM construction', tone: 'good' }, { text: 'Preload scanner fetches CSS/JS in parallel', tone: 'good' }],
      scene: { nodes: [net({ tag: pill('2 RTT setup + 1 RTT HTML', 'clock') }), html({ tag: pill('streams in, parsed as it arrives', 'refresh') }), box('scan', -9, 0, 'Preload scanner', 'teal', 'search', { size: [1.2, 1.2], height: 20, tag: pill('starts CSS/JS/images', 'bolt') })], links: [link('net', 'html'), link('html', 'scan', { style: 'dashed' })], flows: [flow(['net', 'html'], { rate: 1.5 })] },
    },
    {
      short: 'CSS',
      kind: 'problem',
      title: 'CSS blocks rendering',
      body: [
        'The browser won’t paint until it has the CSSOM for the stylesheets it has seen, because painting with <i>partial</i> styles would flash unstyled content and then jump. So every <code>&lt;link rel="stylesheet"&gt;</code> in the head is <b>render-blocking</b>: first paint waits for it to download and parse. 120 KB of CSS at 20 Mbps is 48 ms of transfer — plus a full round trip (80 ms) before it even starts.',
        'It also <b>blocks scripts</b> that follow it: JavaScript may query styles, so the browser delays running a script until pending CSS is loaded. Keep render-blocking CSS small (only what the first screen needs), compress it, serve it from the same connection, and load non-critical CSS (print styles, below-the-fold components) with <code>media</code> queries or asynchronously.',
      ],
      changes: [{ text: 'No paint until the CSSOM is ready', tone: 'bad' }, { text: 'CSS also delays following scripts', tone: 'info' }],
      scene: { nodes: [net(), css({ state: 'hot', tag: pill('render-blocking', 'alert', 'warn') }), tree({ tag: pill('waits for CSSOM', 'clock', 'warn') })], links: [link('net', 'css'), link('css', 'tree')], flows: [flow(['net', 'css', 'tree'], { kind: 'heavy', rate: 2 })] },
    },
    {
      short: 'JavaScript',
      kind: 'problem',
      title: 'Synchronous JavaScript blocks the parser',
      body: [
        'A plain <code>&lt;script src&gt;</code> is <b>parser-blocking</b>: the HTML parser must stop, wait for the script to download, <i>and</i> for any pending CSS, run it (it might call <code>document.write</code> or read the DOM) and only then continue. 300 KB of head scripts delays everything after them — and the DOM below them doesn’t exist until they finish.',
        'Fixes: <code>defer</code> (download in parallel, run in order after parsing — the right default for app code), <code>async</code> (run as soon as downloaded — for independent scripts such as analytics), <code>type="module"</code> (deferred by default), placing scripts at the end of the body, and <b>shipping less JavaScript</b>: bundle splitting, tree shaking, lazy-loading routes. Execution cost is per device: parse and run time on a mid-range phone can be 3–5× a laptop’s.',
      ],
      changes: [{ text: 'Sync script: pause parsing, fetch, run, resume', tone: 'bad' }, { text: 'defer / async / module; ship less', tone: 'good' }],
      scene: { nodes: [html({ tag: pill('parser stopped', 'pause', 'warn') }), js({ tag: pill('download + run', 'clock') }), tree()], links: [link('html', 'js', { arrow: 'both' }), link('html', 'tree')], flows: [flow(['html', 'js'], { kind: 'heavy', rate: 2, back: true })] },
    },
    {
      short: 'Layout & paint',
      kind: 'technique',
      title: 'Layout, paint and compositing',
      body: [
        '<b>Layout</b> (reflow) computes every box’s size and position from the render tree — expensive, and a change to one element’s geometry (width, content, font) can ripple to its parents and siblings. <b>Paint</b> records draw operations per layer; <b>composite</b> assembles layers on the GPU. Properties that only change at the compositor — <code>transform</code> and <code>opacity</code> — animate smoothly without layout or paint; changing <code>top/left/width</code> triggers all three.',
        'Avoid <b>layout thrashing</b>: reading a geometry property (<code>offsetHeight</code>) right after writing styles forces a synchronous layout; batch reads then writes. Reserve space for images and ads (width/height or <code>aspect-ratio</code>) to avoid <b>layout shifts</b> (CLS), and keep the main thread free so input handling stays responsive (INP). Long tasks over 50 ms are the enemy.',
      ],
      changes: [{ text: 'transform/opacity: compositor only', tone: 'good' }, { text: 'Read-after-write of geometry forces layout', tone: 'bad' }, { text: 'Reserve space → no layout shift', tone: 'good' }],
      scene: { nodes: [tree(), layout({ tag: pill('geometry', 'gauge') }), paint({ tag: pill('transform: GPU only', 'check', 'good') })], links: [link('tree', 'layout', { arrow: 'end' }), link('layout', 'paint', { arrow: 'end' })], flows: [flow(['tree', 'layout', 'paint'], { rate: 1.5 })] },
    },
    {
      short: 'Optimise',
      kind: 'technique',
      title: 'Shortening the critical path',
      body: [
        '<b>Inline the critical CSS</b> (14 KB for the first screen) in the HTML and load the rest asynchronously: the CSS round trip disappears from the path. <b>Defer scripts</b> so they stop gating the parser. <b>Preload</b> key resources (<code>rel="preload"</code>: fonts, hero image, the main script) and <b>preconnect</b> to third-party origins to start their handshakes early. Use a CDN, HTTP/2 or 3, compression (Brotli) and caching so repeat visits skip most of the path (see the HTTP lesson).',
        'At the defaults the page paints at ~610 ms; with inlined critical CSS and deferred scripts it paints at ~390 ms — about <b>36% faster</b>, and the gain grows on slower networks and CPUs. Verify with real measurements (Core Web Vitals: <b>LCP</b>, <b>CLS</b>, <b>INP</b>) in the field, not just lab tests. Figures here are model outputs.',
      ],
      changes: [{ text: 'Inline critical CSS · defer JS · preload · preconnect', tone: 'good' }, { text: '~610 ms → ~390 ms at the defaults', tone: 'good' }],
      scene: { nodes: [net(), html({ name: 'HTML + critical CSS', tag: pill('no CSS round trip', 'check', 'good') }), paint({ tag: pill('first paint sooner', 'bolt', 'good') })], links: [link('net', 'html'), link('html', 'paint', { arrow: 'end' })], flows: [flow(['net', 'html', 'paint'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'First paint = round trips on the blocking path + CPU',
      body: [
        'HTML → DOM, CSS → CSSOM, render tree, layout, paint, composite. <b>CSS blocks painting</b>; <b>synchronous JS blocks parsing</b>; the preload scanner parallelises discovery. First paint ≈ setup + HTML + the slower of CSS and JS + main-thread work.',
        'Inline critical CSS, defer scripts, preload what matters, keep layout cheap and measure real-user vitals.',
      ],
      scene: { nodes: [net(), html(), css(), tree(), layout(), paint()], links: [link('net', 'html'), link('net', 'css'), link('html', 'tree'), link('css', 'tree'), link('tree', 'layout', { arrow: 'end' }), link('layout', 'paint', { arrow: 'end' })], flows: [flow(['net', 'html', 'tree', 'layout', 'paint'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
