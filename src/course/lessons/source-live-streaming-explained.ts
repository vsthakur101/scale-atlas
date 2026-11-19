import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const cam = (extra: Partial<SceneNode> = {}) => box('cam', -15, 0, 'Camera + encoder', 'green', 'user', { size: [1.3, 1.3], height: 26, ...extra });
const ingest = (extra: Partial<SceneNode> = {}) => box('ingest', -8, 0, 'Ingest', 'blue', 'server', { size: [1.2, 1.2], height: 26, ...extra });
const trans = (extra: Partial<SceneNode> = {}) => box('trans', -1, 0, 'Transcode + package', 'orange', 'cpu', { size: [1.3, 1.3], height: 28, ...extra });
const cdn = (extra: Partial<SceneNode> = {}) => box('cdn', 6, 0, 'CDN', 'purple', 'globe', { size: [1.4, 1.4], height: 30, ...extra });
const viewers = (extra: Partial<SceneNode> = {}) => crowd('viewers', 14, 0, 12, 'viewers', extra);

const fmtS = (s: number): string => (s >= 10 ? `${s.toFixed(0)} s` : `${s.toFixed(1)} s`);
const fmtR = (r: number): string => (r >= 1e6 ? `${(r / 1e6).toFixed(1)}M/s` : r >= 1e3 ? `${(r / 1e3).toFixed(0)}k/s` : `${Math.round(r)}/s`);
const fmtG = (gbps: number): string => (gbps >= 1000 ? `${(gbps / 1000).toFixed(1)} Tbps` : `${gbps.toFixed(0)} Gbps`);

const lesson: Lesson = {
  slug: 'source-live-streaming-explained',
  title: 'Live Streaming: From Camera to Viewer',
  blurb: 'Ingest, transcode, package into short segments, and deliver over a CDN — and why segment length and player buffering decide whether live means 25 seconds or 3.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'lat', label: 'Glass-to-glass latency', icon: 'clock' },
    { key: 'req', label: 'Segment requests at the edge', icon: 'activity' },
    { key: 'egress', label: 'Delivery bandwidth', icon: 'share' },
    { key: 'orig', label: 'Origin load (after caching)', icon: 'server' },
  ],
  goals: [
    { text: 'The pipeline from contribution to playback', step: 1 },
    { text: 'Why HLS/DASH segments add latency', step: 3 },
    { text: 'Low-latency HLS/DASH and WebRTC', step: 4 },
    { text: 'How a CDN absorbs a million simultaneous viewers', step: 5 },
    { text: 'Failure handling and scale events', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'seg', label: 'Segment duration', min: 1, max: 10, step: 1, default: 6, unit: ' s', description: 'Length of each media segment (standard HLS/DASH).' },
      { key: 'buf', label: 'Segments the player buffers before start', min: 1, max: 6, step: 1, default: 3, unit: '', description: 'Standard players start after buffering about three segments.' },
      { key: 'll', label: 'Low-latency mode (0 off, 1 on)', min: 0, max: 1, step: 1, default: 0, unit: '', description: 'Chunked-transfer parts instead of whole segments.' },
      { key: 'part', label: 'Part duration (low-latency)', min: 0.2, max: 2, step: 0.1, default: 0.5, unit: ' s', description: 'Length of each partial segment published early.' },
      { key: 'viewers', label: 'Concurrent viewers', min: 1000, max: 20000000, step: 1000, default: 1000000, unit: '', description: 'People watching the same stream.' },
      { key: 'mbps', label: 'Average delivered bitrate', min: 0.5, max: 15, step: 0.1, default: 3, unit: ' Mbps', description: 'Average across the bitrate ladder viewers pick.' },
      { key: 'hit', label: 'CDN cache hit ratio', min: 80, max: 99.99, step: 0.01, default: 99.5, unit: '%', description: 'Share of segment requests served from edge caches.' },
    ],
    calculate: (input, step) => {
      const seg = Math.max(1, input.seg ?? 6);
      const buf = Math.max(1, Math.round(input.buf ?? 3));
      const ll = (input.ll ?? 0) >= 0.5;
      const part = Math.max(0.1, input.part ?? 0.5);
      const viewers = Math.max(1, input.viewers ?? 1e6);
      const mbps = Math.max(0.1, input.mbps ?? 3);
      const hit = Math.min(0.9999, Math.max(0, (input.hit ?? 99.5) / 100));
      // Capture + encode + package, plus first/last-mile delivery.
      const pipeline = 2.0 + 1.0;
      const lat = ll ? pipeline + 3 * part : pipeline + buf * seg;
      const req = viewers / (ll ? part : seg);
      const egress = (viewers * mbps) / 1000;
      const orig = req * (1 - hit);
      return {
        lat: step < 2 ? { v: '—' } : { v: fmtS(lat), tone: lat < 5 ? 'good' : lat < 15 ? 'warn' : 'bad' },
        req: step < 4 ? { v: '—' } : { v: fmtR(req) },
        egress: step < 4 ? { v: '—' } : { v: fmtG(egress), tone: egress > 5000 ? 'warn' : 'good' },
        orig: step < 4 ? { v: '—' } : { v: fmtR(orig), tone: orig < 5000 ? 'good' : orig < 50000 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Pipeline',
      kind: 'insight',
      title: 'Camera to screen in five stages',
      body: [
        '<b>Contribution</b>: an encoder compresses the camera feed and pushes it to the platform — RTMP is the long-standing protocol; SRT and WebRTC are newer, more loss-tolerant options. <b>Ingest</b> accepts and authenticates the stream. <b>Transcode</b> produces a ladder of resolutions and bitrates. <b>Package</b> cuts it into short segments and writes manifests. <b>Delivery</b> distributes segments through a <b>CDN</b> to players that pick a rendition adaptively.',
        'Unlike video-on-demand, nothing is precomputed: every stage runs in real time on a stream that never ends, and every stage adds delay. “Live” is therefore a <b>latency budget</b> you spend across the pipeline.',
      ],
      scene: { nodes: [cam(), ingest(), trans(), cdn(), viewers()], links: [link('cam', 'ingest'), link('ingest', 'trans'), link('trans', 'cdn'), link('cdn', 'viewers')], flows: [flow(['cam', 'ingest', 'trans', 'cdn', 'viewers'], { rate: 2 })] },
    },
    {
      short: 'Ingest',
      kind: 'technique',
      title: 'Ingest and transcode in real time',
      body: [
        'The ingest tier terminates thousands of long-lived connections from encoders, spreads them across servers, and hands the stream to <b>transcoders</b> that must keep up with real time: encode at ≥ 1× speed or fall behind forever. Streams are therefore pinned to a worker with headroom, and redundant ingest paths (primary and backup encoders to separate endpoints) protect against single failures.',
        'Encoders pick <b>keyframe intervals</b> aligned to segment boundaries (every 2 s, say) so segments can start playback independently. GPU/ASIC encoders cut cost; per-stream priority decides whether a small channel gets all renditions or just a few.',
      ],
      changes: [{ text: 'Transcoder must run ≥ 1× real time', tone: 'info' }, { text: 'Keyframes aligned to segment boundaries', tone: 'info' }],
      scene: { nodes: [cam({ tag: pill('RTMP / SRT / WebRTC', 'bolt') }), ingest({ tag: pill('auth + route', 'shield') }), trans({ tag: pill('240p–1080p ladder', 'layers') })], links: [link('cam', 'ingest'), link('ingest', 'trans')], flows: [flow(['cam', 'ingest', 'trans'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Segments',
      kind: 'technique',
      title: 'HLS and DASH: live as a series of files',
      body: [
        'Standard <b>HLS/DASH</b> publish live as a rolling playlist of short <b>files</b> (segments) fetched over plain HTTP — which is exactly why it scales on CDNs. The cost is latency: a segment can only be published once it is <i>complete</i> (6 s), and players start only after buffering about <b>three</b> segments for stability. Latency ≈ pipeline + buffered segments × duration = 3 + 3 × 6 = <b>~21 s</b>.',
        'Shorter segments cut latency but raise request rate (one request per viewer per segment: 1,000,000 viewers ÷ 6 s = 167k/s), shrink compression efficiency (more keyframes) and make buffering more fragile. Typical tuning ranges from 2 to 6 seconds — good for sports and TV, too slow for auctions, betting or conversation.',
      ],
      changes: [{ text: 'Latency ≈ pipeline + buffer × segment ≈ 21 s', tone: 'bad' }, { text: '1M viewers ÷ 6 s = ~167k segment requests/s', tone: 'info' }],
      scene: { nodes: [trans({ tag: pill('publishes after 6 s', 'clock') }), cdn({ tag: pill('rolling playlist', 'list') }), viewers({ tag: pill('buffers 3 segments', 'pause', 'warn') })], links: [link('trans', 'cdn'), link('cdn', 'viewers')], flows: [flow(['trans', 'cdn', 'viewers'], { rate: 1 })] },
    },
    {
      short: 'Low latency',
      kind: 'technique',
      title: 'Getting under ten seconds — and under one',
      body: [
        '<b>Low-latency HLS and DASH (CMAF chunked transfer)</b> publish each segment in small <b>parts</b> (0.2–1 s) <i>while it is still being encoded</i>; players request parts via blocking playlist reload or chunked transfer and hold only ~3 parts. Latency becomes ≈ pipeline + 3 × part = 3 + 1.5 = <b>~4.5 s</b> (toggle low-latency in the sliders), at the cost of many more requests (1M ÷ 0.5 s = 2M/s) and tighter timing.',
        'For sub-second interaction use <b>WebRTC</b>: UDP-based, peer-to-peer-style media with congestion control and no segments — ~0.3–1 s glass-to-glass — but it needs stateful media servers (SFUs) and doesn’t get HTTP CDN caching, so large audiences are costly. Real products pick per use case: LL-HLS for big broadcasts, WebRTC for conferencing and auctions.',
      ],
      changes: [{ text: 'LL-HLS: ~3–5 s via parts', tone: 'good' }, { text: 'WebRTC: <1 s, stateful and expensive at scale', tone: 'info' }],
      scene: { nodes: [trans({ tag: pill('0.5 s parts, published early', 'bolt', 'good') }), cdn(), viewers({ tag: pill('~4.5 s behind live', 'clock', 'good') })], links: [link('trans', 'cdn'), link('cdn', 'viewers')], flows: [flow(['trans', 'cdn', 'viewers'], { rate: 3 })] },
    },
    {
      short: 'CDN',
      kind: 'technique',
      title: 'A million viewers, a few thousand origin requests',
      body: [
        'Every viewer fetches the <i>same</i> newest segment within seconds of each other — the ideal case for a CDN. The first request at an edge misses and goes to a mid-tier cache or origin; the rest wait for that same in-flight fetch (<b>request collapsing / origin shield</b>) and are served from memory. With a 99.5% hit ratio, 167k requests/s at the edge become <b>~830/s at origin</b>.',
        'Egress is the cost: 1M viewers × 3 Mbps = <b>3 Tbps</b>, spread across many edges and often multiple CDNs with real-time steering. Manifests are tiny but fetched constantly and have short TTLs (a second or two) — the hottest objects in the system. Pre-warm capacity before a scheduled event; the audience arrives in the same minute.',
      ],
      changes: [{ text: '167k/s at the edge → ~830/s at origin', tone: 'good' }, { text: '1M × 3 Mbps = 3 Tbps egress', tone: 'info' }],
      scene: { nodes: [box('orig', -8, 0, 'Origin', 'blue', 'server', { size: [1.2, 1.2], height: 24 }), box('shield', 0, 0, 'Origin shield', 'teal', 'layers', { size: [1.2, 1.2], height: 24, tag: pill('collapses requests', 'check', 'good') }), cdn({ name: 'Edge caches' }), viewers()], links: [link('orig', 'shield'), link('shield', 'cdn'), link('cdn', 'viewers')], flows: [flow(['orig', 'shield', 'cdn', 'viewers'], { rate: 1.5 })] },
    },
    {
      short: 'Failures',
      kind: 'problem',
      title: 'What breaks live',
      body: [
        'An encoder drops (viewers see a frozen frame): run a <b>backup encoder and ingest path</b> and switch seamlessly at a keyframe. A transcoder falls behind: shed the highest rendition rather than stall. <b>Clock drift</b> between ingest and packager desynchronises segment numbers: use a shared timeline. A <b>CDN edge region</b> fails: players retry another CDN or origin via manifest-level failover.',
        'Players are the last line: on a late segment they <b>downshift</b> bitrate; on repeated failures they <b>fall back</b> to another CDN. Chat, reactions and other real-time overlays ride a separate low-latency channel (WebSockets), so their lag relative to video becomes a product issue — spoilers arrive before the video. Figures in this lesson are illustrative model outputs.',
      ],
      scene: { nodes: [cam({ name: 'Primary encoder', state: 'down', tone: 'red', tag: pill('dropped', 'alert', 'bad') }), box('bk', -15, 7, 'Backup encoder', 'green', 'user', { size: [1.3, 1.3], height: 24, tag: pill('takes over at keyframe', 'check', 'good') }), ingest()], links: [link('cam', 'ingest', { style: 'broken' }), link('bk', 'ingest')], flows: [flow(['bk', 'ingest'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Latency is the sum of every stage',
      body: [
        'Live streaming = <b>ingest → real-time transcode → package → CDN → adaptive player</b>. Standard HLS/DASH latency is roughly <code>pipeline + buffered segments × duration</code> (~21 s); <b>LL-HLS</b> publishes parts to reach ~3–5 s; <b>WebRTC</b> reaches under a second at the price of stateful servers.',
        'The CDN turns a million simultaneous viewers into a few hundred origin requests through caching and request collapsing; egress bandwidth is the main cost. Provide redundant ingest, shed renditions under load, and design for the minute everyone arrives.',
      ],
      scene: { nodes: [cam(), ingest(), trans(), cdn(), viewers()], links: [link('cam', 'ingest'), link('ingest', 'trans'), link('trans', 'cdn'), link('cdn', 'viewers')], flows: [flow(['cam', 'ingest', 'trans', 'cdn', 'viewers'], { rate: 2 })] },
    },
  ],
};

export default lesson;
