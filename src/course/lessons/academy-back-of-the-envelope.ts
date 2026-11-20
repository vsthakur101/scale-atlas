import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -18, 0, 12, 'daily active users', extra);
const lb = (extra: Partial<SceneNode> = {}) => box('lb', -9, 0, 'Load balancer', 'purple', 'route', { size: [1.4, 1.4], height: 24, ...extra });
const app = (extra: Partial<SceneNode> = {}) => box('app', 0, 0, 'App servers', 'orange', 'server', { size: [1.7, 1.7], height: 30, ...extra });
const store = (extra: Partial<SceneNode> = {}) => disk('store', 10, -6, 'Storage (replicated)', { size: [3, 1.2], height: 14, tone: 'yellow', ...extra });
const cache = (extra: Partial<SceneNode> = {}) => db('cache', 10, 6, 'Cache / hot data', { size: [1.3, 1.3], ...extra });

const fmtN = (n: number): string => (n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtB = (b: number): string => (b >= 1e15 ? `${(b / 1e15).toFixed(2)} PB` : b >= 1e12 ? `${(b / 1e12).toFixed(0)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(0)} GB` : `${(b / 1e6).toFixed(0)} MB`);

const lesson: Lesson = {
  slug: 'academy-back-of-the-envelope',
  title: 'Back-of-the-Envelope Estimation: Traffic, Storage, Bandwidth and Servers',
  blurb: 'The five-minute arithmetic that decides an architecture: turn daily users into queries per second, bytes per day, peak bandwidth and server counts — with the rounding tricks, latency numbers and availability tables that make it fast.',
  minutes: 12,
  level: 'Beginner',
  metrics: [
    { key: 'qps', label: 'Average → peak requests per second', icon: 'activity' },
    { key: 'wr', label: 'Peak reads vs writes per second', icon: 'gauge' },
    { key: 'sto', label: 'Storage: per year → retained', icon: 'disk' },
    { key: 'bw', label: 'Peak egress bandwidth', icon: 'wifi' },
    { key: 'srv', label: 'App servers needed at target load', icon: 'server' },
  ],
  goals: [
    { text: 'The method and the rounding tricks', step: 1 },
    { text: 'Traffic: users → requests per second', step: 2 },
    { text: 'Storage and replication', step: 3 },
    { text: 'Bandwidth and server counts', step: 4 },
    { text: 'Latency numbers, availability and sanity checks', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'dau', label: 'Daily active users', min: 1000, max: 2000000000, step: 1000, default: 100000000, unit: '', description: 'Users who use the product in a day.' },
      { key: 'rpu', label: 'Requests per user per day', min: 1, max: 1000, step: 1, default: 20, unit: '', description: 'API calls each active user makes.' },
      { key: 'peak', label: 'Peak-to-average ratio', min: 1, max: 10, step: 0.1, default: 3, unit: '×', description: 'Busy hour vs the daily average.' },
      { key: 'wshare', label: 'Share of requests that write', min: 0, max: 100, step: 1, default: 10, unit: '%', description: 'Writes as a share of all requests.' },
      { key: 'wsize', label: 'Stored size per write', min: 10, max: 10000000, step: 10, default: 1000, unit: ' B', description: 'Bytes persisted for each write.' },
      { key: 'repl', label: 'Replication factor', min: 1, max: 6, step: 1, default: 3, unit: '×', description: 'Copies kept of each byte.' },
      { key: 'years', label: 'Retention', min: 0.1, max: 20, step: 0.1, default: 5, unit: ' years', description: 'How long data is kept.' },
      { key: 'rsize', label: 'Response size per read', min: 100, max: 10000000, step: 100, default: 10000, unit: ' B', description: 'Bytes returned for each read.' },
      { key: 'per', label: 'Requests one server handles', min: 100, max: 50000, step: 100, default: 2000, unit: '/s', description: 'Sustainable QPS of one app server.' },
      { key: 'tgt', label: 'Target utilisation', min: 20, max: 90, step: 5, default: 60, unit: '%', description: 'Headroom so peak doesn’t saturate servers.' },
    ],
    calculate: (input, step) => {
      const dau = Math.max(1, input.dau ?? 1e8);
      const rpu = Math.max(0, input.rpu ?? 20);
      const peak = Math.max(1, input.peak ?? 3);
      const wshare = Math.min(1, Math.max(0, (input.wshare ?? 10) / 100));
      const wsize = Math.max(1, input.wsize ?? 1000);
      const repl = Math.max(1, input.repl ?? 3);
      const years = Math.max(0.01, input.years ?? 5);
      const rsize = Math.max(1, input.rsize ?? 10000);
      const per = Math.max(1, input.per ?? 2000);
      const tgt = Math.min(0.95, Math.max(0.1, (input.tgt ?? 60) / 100));
      const perDay = dau * rpu;
      const avg = perDay / 86400;
      const pk = avg * peak;
      const writesDay = perDay * wshare;
      const bytesDay = writesDay * wsize * repl;
      const bytesYear = bytesDay * 365;
      const readPk = pk * (1 - wshare);
      const writePk = pk * wshare;
      const bwBytes = readPk * rsize;
      const servers = Math.ceil(pk / (per * tgt));
      return {
        qps: step < 2 ? { v: '—' } : { v: `${fmtN(avg)} → ${fmtN(pk)} /s (${fmtN(perDay)} requests/day)` },
        wr: step < 2 ? { v: '—' } : { v: `${fmtN(readPk)} reads · ${fmtN(writePk)} writes` },
        sto: step < 3 ? { v: '—' } : { v: `${fmtB(bytesYear)} → ${fmtB(bytesYear * years)} (${fmtB(bytesDay)}/day with ×${repl})`, tone: bytesYear * years < 1e15 ? 'good' : 'warn' },
        bw: step < 4 ? { v: '—' } : { v: `${(bwBytes / 1e6).toFixed(0)} MB/s ≈ ${((bwBytes * 8) / 1e9).toFixed(1)} Gbps`, tone: (bwBytes * 8) / 1e9 < 20 ? 'good' : 'warn' },
        srv: step < 4 ? { v: '—' } : { v: `${fmtN(servers)} (${fmtN(pk)}/s ÷ ${fmtN(per * tgt)}/s each)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Method',
      kind: 'insight',
      title: 'Estimate to choose between designs, not to be right',
      body: [
        'A back-of-the-envelope estimate turns a vague product (“100 million users”) into the numbers that drive design: <b>requests per second</b>, <b>bytes stored</b>, <b>bandwidth</b> and <b>machines</b>. Its job is to decide <i>which kind of architecture</i> is needed — one database or sharded, cache or no cache, a CDN or not — so being within a factor of 2–3 is enough; being off by 100× is what to avoid. The method is always: <b>state assumptions explicitly</b>, compute in clean orders of magnitude, note the dominant term, and sanity-check against something familiar.',
        'Rounding tricks make it fast: a day is 86,400 s ≈ <b>10⁵ s</b> (so <i>X per day ÷ 10⁵ ≈ X per second</i>); 2¹⁰ ≈ 10³ so KB, MB, GB, TB, PB each step by ×1,000; a million requests a day is ~12 per second; a year is ~3×10⁷ s ≈ π×10⁷; 1 MB/s sustained for a day is 86 GB. Write units on every number. Below: 100 million daily users, each making 20 requests a day.',
      ],
      scene: { nodes: [users({ tag: pill('100M DAU × 20 req/day', 'users') }), lb(), app(), store(), cache()], links: [link('users', 'lb'), link('lb', 'app'), link('app', 'store'), link('app', 'cache')], flows: [flow(['users', 'lb', 'app', 'store'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Traffic',
      kind: 'technique',
      title: 'Traffic: from daily users to requests per second',
      body: [
        '<b>Requests/day</b> = DAU × requests per user = 100M × 20 = <b>2 billion/day</b>. Divide by 86,400 s: <b>≈ 23,000 per second on average</b> (using 10⁵: 20,000 — close enough). Traffic is never flat: peak hours run <b>2–5×</b> the average (a 3× multiplier here), so provision for <b>≈ 69,000/s at peak</b>; viral or event-driven products spike 10× or more and need separate burst planning (see the Virtual Waiting Room lesson).',
        'Split reads from writes — they scale differently (reads cache, writes serialise). At a 10% write share: <b>62,500 reads/s and 6,900 writes/s at peak</b>. A typical single relational primary handles a few thousand writes per second (see the Staged PostgreSQL and Hot Account lessons), so 6,900 writes/s already says “partition or use a log-structured / distributed store”, while 62,500 reads/s says “cache and replicas”. The estimate has made two architecture decisions in one line of arithmetic.',
      ],
      changes: [{ text: '100M × 20 = 2B requests/day ≈ 23k/s average', tone: 'info' }, { text: 'Peak ≈ 3× → 69k/s: 62.5k reads, 6.9k writes', tone: 'info' }, { text: 'Writes > a few thousand/s → partition; reads → cache', tone: 'good' }],
      scene: { nodes: [users(), lb({ tag: pill('69k/s at peak', 'activity') }), app({ tag: pill('62.5k reads · 6.9k writes', 'gauge') })], links: [link('users', 'lb'), link('lb', 'app')], flows: [flow(['users', 'lb', 'app'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Storage',
      kind: 'technique',
      title: 'Storage: bytes per write × writes × copies × time',
      body: [
        'Only <b>writes</b> create stored data. Writes/day = 2B × 10% = <b>200 million</b>; at ~1 KB each that is <b>200 GB/day</b> raw. Multiply by the <b>replication factor</b> (3 copies for durability and availability — see the Replication lesson): <b>600 GB/day</b>, <b>219 TB per year</b>, and with 5-year retention about <b>1.1 PB</b>. Add overhead you’ll certainly have: indexes (often 30–100% of table size), metadata, and 30–50% free-space headroom — so plan for ~2× the arithmetic.',
        'The totals select the storage class: terabytes fit a few sharded database nodes; petabytes mean object storage, tiering and erasure coding (see the Eleven Nines lesson) so replication factor drops from 3× to ~1.4×. Large media changes the dominant term entirely: if one write in a hundred attaches a 2 MB photo, the photos outweigh the 1 KB records ~20:1, and capacity planning should start from them. Always ask “what is the biggest object type, and how often?”.',
      ],
      changes: [{ text: '200M writes/day × 1 KB × 3 = 600 GB/day; 219 TB/year; ~1.1 PB at 5 years', tone: 'info' }, { text: 'Plan ~2× for indexes, metadata and headroom', tone: 'info' }, { text: 'Find the dominant object type (media usually wins)', tone: 'good' }],
      scene: { nodes: [app({ tag: pill('200M writes/day', 'disk') }), store({ tag: pill('600 GB/day · 1.1 PB / 5 yr', 'disk') }), cache()], links: [link('app', 'store'), link('app', 'cache')], flows: [flow(['app', 'store'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Servers',
      kind: 'technique',
      title: 'Bandwidth and server counts',
      body: [
        '<b>Bandwidth</b> = requests per second × bytes per response. Peak reads of 62,500/s × 10 KB = <b>625 MB/s ≈ 5 Gbps</b> of egress — more than a single 1 Gbps NIC, so this needs several load-balanced hosts or a CDN absorbing most of it (see the CDN lesson); remember bits vs bytes (×8) and that cloud providers bill egress by the GB. Inbound (writes: 6,900/s × 1 KB ≈ 7 MB/s) is far smaller here, but for upload-heavy products it dominates.',
        '<b>Servers</b> = peak QPS ÷ (per-server capacity × target utilisation). If one server sustains 2,000 requests/s and you run at 60% to leave headroom for failures and spikes, each handles 1,200: 69,444 ÷ 1,200 ≈ <b>58 servers</b>, plus N+1 or N+2 for failures and rolling deploys, and capacity across at least two or three availability zones so losing one zone doesn’t overload the rest. Per-server capacity is the soft number — measure it with a load test (see the CPU Saturation lesson for why 90% utilisation is a cliff).',
      ],
      changes: [{ text: '62.5k reads/s × 10 KB = 625 MB/s ≈ 5 Gbps', tone: 'info' }, { text: '69,444 ÷ (2,000 × 60%) ≈ 58 servers, plus failure headroom', tone: 'info' }],
      scene: { nodes: [lb({ tag: pill('≈ 5 Gbps out', 'wifi') }), app({ tag: pill('≈ 58 servers at 60%', 'server') }), cache({ tag: pill('absorb hot reads', 'check', 'good') })], links: [link('lb', 'app'), link('app', 'cache')], flows: [flow(['lb', 'app', 'cache'], { rate: 2, back: true })] },
    },
    {
      short: 'Numbers',
      kind: 'tradeoff',
      title: 'Latency numbers, availability and sanity checks',
      body: [
        'Memorise orders of magnitude: <b>L1 cache ~1 ns</b>, main memory ~100 ns, <b>SSD random read ~100 µs</b> (NVMe 20–100 µs), reading 1 MB sequentially from memory ~50 µs, from SSD ~0.5–1 ms, <b>datacentre round trip ~0.5 ms</b>, <b>disk seek ~5–10 ms</b>, cross-continent round trip ~150 ms. They tell you what is cheap (memory, local network) and what is not (disk seeks, cross-region calls) — a request chain making 40 sequential datacentre calls spends 20 ms just in the network. <b>Availability</b>: 99.9% is 8.8 h/year of downtime, 99.99% is 53 min, 99.999% is 5.3 min — and serial dependencies multiply (two 99.9% services in a row give 99.8%).',
        'Sanity checks: compare against known systems (a few thousand writes/s fits one database; a million needs a distributed log); check that totals are consistent (QPS × bytes = bandwidth); redo the dominant term with a different route (users × minutes × bytes); and state the range, not a point: “40–80 servers”. Common mistakes: forgetting peak, forgetting replication and indexes, mixing bits and bytes, using average instead of p99 latency, and estimating with false precision. Every figure here is a model output from the stated assumptions.',
      ],
      changes: [{ text: 'Memory ~100 ns · SSD ~100 µs · DC round trip ~0.5 ms · cross-continent ~150 ms', tone: 'info' }, { text: '99.9% = 8.8 h/yr · 99.99% = 53 min · 99.999% = 5.3 min', tone: 'info' }, { text: 'Cross-check; state ranges; mind peak, replication and bits vs bytes', tone: 'good' }],
      scene: { nodes: [users(), app({ tag: pill('sanity: reads/s, GB/day, Gbps', 'check') }), store(), cache()], links: [link('users', 'app'), link('app', 'store'), link('app', 'cache')], flows: [flow(['users', 'app', 'cache'], { rate: 1.8, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Users → QPS → bytes → machines, in orders of magnitude',
      body: [
        '<b>Traffic</b>: DAU × requests ÷ 10⁵ s, times a peak factor. <b>Storage</b>: writes × size × replication × retention (plus overhead). <b>Bandwidth</b>: QPS × response size. <b>Servers</b>: peak ÷ (capacity × utilisation), plus failure headroom.',
        'Use the result to choose architecture, cross-check it, and state ranges instead of false precision.',
      ],
      scene: { nodes: [users(), lb(), app(), store(), cache()], links: [link('users', 'lb'), link('lb', 'app'), link('app', 'store'), link('app', 'cache')], flows: [flow(['users', 'lb', 'app', 'store'], { rate: 1.6, back: true })] },
    },
  ],
};

export default lesson;
