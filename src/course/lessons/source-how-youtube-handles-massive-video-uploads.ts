import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const creator = (extra: Partial<SceneNode> = {}) => box('creator', -15, 0, 'Creator', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const ingest = (extra: Partial<SceneNode> = {}) => box('ingest', -8, 0, 'Upload service', 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });
const raw = (extra: Partial<SceneNode> = {}) => disk('raw', -8, 8, 'Raw object store', { size: [2.6, 1.1], height: 16, tone: 'grey', ...extra });
const split = (extra: Partial<SceneNode> = {}) => box('split', -1, 0, 'Split into segments', 'teal', 'layers', { size: [1.3, 1.3], height: 26, ...extra });
const worker = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`w${i}`, 6, (i - (n - 1) / 2) * 4.2, name, 'orange', 'cpu', { size: [1.2, 1.2], height: 24, ...extra });
const cdn = (extra: Partial<SceneNode> = {}) => box('cdn', 15, 0, 'CDN', 'purple', 'globe', { size: [1.3, 1.3], height: 28, ...extra });

const fmtB = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const fmtT = (s: number): string => (s >= 7200 ? `${(s / 3600).toFixed(1)} h` : s >= 120 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(s < 10 ? 1 : 0)} s`);

const lesson: Lesson = {
  slug: 'source-how-youtube-handles-massive-video-uploads',
  title: 'Video Upload and Transcoding Pipelines',
  blurb: 'Resumable chunked uploads, splitting video into segments, transcoding a bitrate ladder in parallel, and publishing to a CDN — with the arithmetic of time and storage.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'up', label: 'Upload time', icon: 'clock' },
    { key: 'tasks', label: 'Parallel transcode tasks', icon: 'layers' },
    { key: 'wall', label: 'Transcode wall-clock time', icon: 'cpu' },
    { key: 'store', label: 'Stored per video (all renditions)', icon: 'disk' },
  ],
  goals: [
    { text: 'Resumable, chunked uploads over unreliable networks', step: 2 },
    { text: 'Why transcoding is split into segment-level tasks', step: 3 },
    { text: 'The bitrate ladder and adaptive streaming', step: 4 },
    { text: 'Pipeline orchestration, retries and priorities', step: 5 },
    { text: 'The storage and delivery bill', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'len', label: 'Video length', min: 1, max: 600, step: 1, default: 60, unit: ' min', description: 'Duration of the uploaded video.' },
      { key: 'src', label: 'Source bitrate', min: 2, max: 200, step: 1, default: 20, unit: ' Mbps', description: 'Bitrate of the original file.' },
      { key: 'up', label: 'Creator upload speed', min: 1, max: 1000, step: 1, default: 40, unit: ' Mbps', description: 'The creator’s uplink.' },
      { key: 'seg', label: 'Segment length', min: 2, max: 60, step: 1, default: 10, unit: ' s', description: 'How long each independently encoded piece is.' },
      { key: 'rungs', label: 'Renditions (bitrate ladder)', min: 1, max: 12, step: 1, default: 6, unit: '', description: 'Resolution/bitrate variants produced.' },
      { key: 'ladder', label: 'Sum of ladder bitrates', min: 1, max: 100, step: 1, default: 14, unit: ' Mbps', description: 'Total bitrate across all renditions combined.' },
      { key: 'workers', label: 'Transcode workers', min: 1, max: 5000, step: 1, default: 500, unit: '', description: 'Parallel encoder processes available.' },
      { key: 'speed', label: 'Encode speed per worker', min: 0.2, max: 10, step: 0.1, default: 2, unit: '× real time', description: 'How much video one worker encodes per second of work (average across renditions).' },
    ],
    calculate: (input, step) => {
      const len = Math.max(1, input.len ?? 60) * 60;
      const src = Math.max(0.1, input.src ?? 20);
      const upMbps = Math.max(0.1, input.up ?? 40);
      const seg = Math.max(1, input.seg ?? 10);
      const rungs = Math.max(1, Math.round(input.rungs ?? 6));
      const ladder = Math.max(0.1, input.ladder ?? 14);
      const workers = Math.max(1, Math.round(input.workers ?? 500));
      const speed = Math.max(0.05, input.speed ?? 2);
      const srcBytes = (len * src * 1e6) / 8;
      const upload = (srcBytes * 8) / (upMbps * 1e6);
      const segments = Math.ceil(len / seg);
      const tasks = segments * rungs;
      // Each task encodes `seg` seconds of video at `speed`× real time; tasks run in waves across the worker pool.
      const wall = Math.ceil(tasks / workers) * (seg / speed);
      const stored = (len * ladder * 1e6) / 8;
      return {
        up: step < 1 ? { v: '—' } : { v: `${fmtT(upload)} (${fmtB(srcBytes)})`, tone: upload > 3600 ? 'warn' : 'good' },
        tasks: step < 2 ? { v: '—' } : { v: `${tasks.toLocaleString('en-US')} (${segments} × ${rungs})` },
        wall: step < 2 ? { v: '—' } : { v: fmtT(wall), tone: wall < 120 ? 'good' : wall < 900 ? 'warn' : 'bad' },
        store: step < 3 ? { v: '—' } : { v: `${fmtB(stored)} + ${fmtB(srcBytes)} original`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'The task',
      kind: 'problem',
      title: 'Turn one huge file into something every device can play',
      body: [
        'A creator uploads a one-hour 20 Mbps camera file — <b>9 GB</b> — from a home connection. The platform must accept it reliably, then produce versions for phones on weak networks, laptops and 4K TVs, in several codecs, quickly enough that “processing…” is a minute or two rather than an hour, and store and deliver them cheaply to millions.',
        'The pipeline has four stages: <b>upload</b> (reliably, resumably), <b>process</b> (split, validate, transcode in parallel), <b>store</b> (renditions plus metadata) and <b>publish</b> (CDN, search, notifications). Each has a different bottleneck.',
      ],
      scene: { nodes: [creator({ tag: pill('9 GB file', 'file') }), ingest(), box('pipe', 4, 0, 'Process: split · encode', 'orange', 'cpu', { size: [1.4, 1.4], height: 28 }), cdn()], links: [link('creator', 'ingest'), link('ingest', 'pipe'), link('pipe', 'cdn')], flows: [flow(['creator', 'ingest', 'pipe', 'cdn'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Upload',
      kind: 'technique',
      title: 'Chunked, resumable uploads',
      body: [
        'A single 9 GB POST would restart from zero on any hiccup. The client splits the file into <b>chunks</b> (say 8 MB), uploads each with its offset and a checksum, and the server records which are received. After a drop the client asks “what do you have?” and <b>resumes</b> from the first missing chunk. Chunks can upload in parallel, are verified individually and are written straight to an <b>object store</b>, not through application servers’ disks.',
        'Upload time is often the longest part: 9 GB at 40 Mbps is <b>30 minutes</b>, bounded by the creator’s uplink — the platform can only avoid making it worse. Use <b>presigned URLs</b> so bytes go directly to storage near the user, and start processing as the stream arrives where possible.',
      ],
      changes: [{ text: 'Chunks + offsets + checksums → resume', tone: 'good' }, { text: 'Direct-to-storage via presigned URLs', tone: 'good' }],
      scene: { nodes: [creator({ tag: pill('chunk 412/1,120', 'list') }), ingest({ tag: pill('has chunks 1–411', 'check') }), raw({ tag: pill('assembles on completion', 'disk') })], links: [link('creator', 'ingest', { arrow: 'both' }), link('ingest', 'raw')], flows: [flow(['creator', 'ingest', 'raw'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Segments',
      kind: 'technique',
      title: 'Split, then encode the pieces in parallel',
      body: [
        'Encoding one hour at 2× real time on one worker would take 30 minutes <i>per rendition</i>. Instead the video is cut at <b>keyframe boundaries into short segments</b> (10 s), and each segment × rendition is an independent <b>task</b>. A one-hour video with 6 renditions is 360 × 6 = <b>2,160 tasks</b>; with 500 workers that’s 5 waves of 5 s each — about <b>25 s</b> wall-clock instead of hours.',
        'This is a map-reduce shape: split → parallel encode → <b>stitch/package</b> into streaming manifests. Shorter segments parallelise better but add overhead and slightly hurt compression efficiency at boundaries; longer ones are the reverse. The pool can burst on spot/preemptible machines since a lost task is simply re-run.',
      ],
      changes: [{ text: '360 segments × 6 renditions = 2,160 tasks', tone: 'info' }, { text: '500 workers → ~25 s wall-clock', tone: 'good' }],
      scene: { nodes: [raw({ name: 'Original' }), split({ tag: pill('cut at keyframes', 'layers') }), ...[0, 1, 2].map((i) => worker(i, 3, `Encoder ${i + 1}`, { load: 85 })), box('pack', 15, 0, 'Package manifests', 'green', 'list', { size: [1.2, 1.2], height: 22 })], links: [link('raw', 'split'), ...[0, 1, 2].map((i) => link('split', `w${i}`)), ...[0, 1, 2].map((i) => link(`w${i}`, 'pack'))], flows: [...[0, 1, 2].map((i) => flow(['split', `w${i}`, 'pack'], { kind: 'heavy', rate: 1.2 }))] },
    },
    {
      short: 'Ladder',
      kind: 'technique',
      title: 'A bitrate ladder for adaptive streaming',
      body: [
        'Each segment is encoded at several <b>renditions</b> — e.g. 240p at 0.4 Mbps up to 1080p at 5 Mbps and 4K at 8+ Mbps. The player downloads a <b>manifest</b> (HLS <code>.m3u8</code> / DASH <code>.mpd</code>) listing segments per rendition and, every few seconds, <b>chooses the rendition</b> its measured throughput and buffer can sustain, switching at segment boundaries so playback adapts to the network without stalling.',
        'Because segments align across renditions, switching is seamless. The ladder is a cost lever: per-title or per-scene encoding tunes bitrates to the content (a static lecture needs far less than a football match), and codecs like AV1 save bandwidth for popular videos at much higher encode cost. Rarely-watched videos usually get only a basic ladder; popular ones are re-encoded later.',
      ],
      changes: [{ text: 'Manifest lists segments per rendition', tone: 'info' }, { text: 'Player switches rendition per segment', tone: 'good' }, { text: 'Tune the ladder by content and popularity', tone: 'good' }],
      concepts: [{ term: 'Adaptive bitrate (ABR)', def: 'Streaming where the client picks among pre-encoded renditions segment by segment based on its bandwidth and buffer.' }],
      scene: { nodes: [box('r1', -8, -6, '240p · 0.4 Mbps', 'green', 'layers', { size: [1.2, 1.2], height: 12 }), box('r2', -8, 0, '720p · 2.5 Mbps', 'blue', 'layers', { size: [1.2, 1.2], height: 18 }), box('r3', -8, 6, '1080p · 5 Mbps', 'orange', 'layers', { size: [1.2, 1.2], height: 24 }), box('player', 8, 0, 'Player', 'purple', 'user', { size: [1.3, 1.3], height: 26, tag: pill('picks per segment', 'gauge') })], links: [link('r1', 'player', { style: 'dashed' }), link('r2', 'player'), link('r3', 'player', { style: 'dashed' })], flows: [flow(['r2', 'player'], { rate: 1.5 })] },
    },
    {
      short: 'Orchestration',
      kind: 'technique',
      title: 'Orchestrating a DAG of tasks',
      body: [
        'Processing is a <b>directed acyclic graph</b>: validate → extract audio/video → thumbnails → encode segments → package → run policy checks (copyright match, safety classifiers) → publish. A workflow engine tracks state per video, <b>retries failed tasks</b> with backoff (tasks are idempotent and keyed by segment + rendition), and resumes after a crash — state lives in a database, not in workers.',
        'Not all videos are equal: a short from a verified channel in a live-event moment gets priority; a 10-hour backlog upload waits. Use <b>priority queues</b>, quotas per uploader and early publication — make the lowest rendition available in seconds so the video “works”, and fill in higher ones as they finish.',
      ],
      changes: [{ text: 'Idempotent tasks + persisted workflow state', tone: 'good' }, { text: 'Publish a low rendition first, fill in the rest', tone: 'good' }],
      scene: { nodes: [box('d1', -10, 0, 'Validate', 'blue', 'check', { size: [1.1, 1.1], height: 20 }), box('d2', -4, 0, 'Encode', 'orange', 'cpu', { size: [1.1, 1.1], height: 22 }), box('d3', 2, 0, 'Checks', 'red', 'shield', { size: [1.1, 1.1], height: 20 }), box('d4', 8, 0, 'Publish', 'green', 'globe', { size: [1.1, 1.1], height: 20 }), db('state', -2, 7, 'Workflow state', { size: [1.2, 1.2] })], links: [link('d1', 'd2'), link('d2', 'd3'), link('d3', 'd4'), link('d2', 'state', { style: 'dashed' })], flows: [flow(['d1', 'd2', 'd3', 'd4'], { rate: 1.5 })] },
    },
    {
      short: 'Storage',
      kind: 'tradeoff',
      title: 'Storage and delivery dominate the bill',
      body: [
        'Renditions multiply storage: a sum-of-ladder of 14 Mbps for an hour is <b>6.3 GB</b> on top of keeping the 9 GB original (kept so the library can be re-encoded for new codecs). Multiply by hundreds of hours of video uploaded <i>every minute</i> and storage is measured in exabytes — hence tiering (hot SSD/standard for popular, cold for the long tail), deleting unwatched high renditions and re-encoding on demand.',
        'But <b>delivery</b> is bigger: every view streams gigabytes through a <b>CDN</b>. Popular segments are cached at the edge; the long tail is fetched from origin, so layout (origin shield, regional caches) and codec choice (AV1 for hits) drive cost. Upload is a one-time cost per video; views recur forever. Figures here are model outputs for sizing, not any platform’s numbers.',
      ],
      changes: [{ text: '1 h, 14 Mbps ladder ≈ 6.3 GB + 9 GB original', tone: 'info' }, { text: 'Cache popular segments at the edge; tier the tail', tone: 'good' }],
      scene: { nodes: [disk('hot', -8, -4, 'Popular: hot storage', { size: [2.6, 1.1], height: 18, tone: 'yellow' }), disk('cold', -8, 5, 'Long tail: cold tier', { size: [2.6, 1.1], height: 14, tone: 'grey' }), cdn({ tag: pill('serves popular segments', 'check', 'good') })], links: [link('hot', 'cdn'), link('cold', 'cdn', { style: 'dashed' })], flows: [flow(['hot', 'cdn'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Upload reliably, encode in parallel, deliver from the edge',
      body: [
        '<b>Chunked resumable uploads</b> go straight to object storage; the video is <b>split at keyframes</b>, each segment × rendition encoded as an idempotent task across a worker pool (wall-clock ≈ <code>⌈tasks ÷ workers⌉ × segment ÷ speed</code>); a <b>workflow DAG</b> retries, checks and packages; <b>adaptive bitrate</b> manifests let players switch per segment.',
        'Upload time is bounded by the creator’s link, transcode time by parallelism, and cost by storage and CDN delivery. Publish a low rendition early and tier storage by popularity.',
      ],
      scene: { nodes: [creator(), ingest(), split(), worker(0, 2, 'Encoders'), cdn()], links: [link('creator', 'ingest'), link('ingest', 'split'), link('split', 'w0'), link('w0', 'cdn')], flows: [flow(['creator', 'ingest', 'split', 'w0', 'cdn'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
