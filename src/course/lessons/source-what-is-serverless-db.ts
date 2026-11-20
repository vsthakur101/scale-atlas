import type { Lesson, SceneNode } from '../../types';
import { box, crowd, disk, flow, link, pill } from '../kit';

const apps = (extra: Partial<SceneNode> = {}) => crowd('apps', -18, 0, 10, 'applications (bursty)', extra);
const proxy = (extra: Partial<SceneNode> = {}) => box('proxy', -9, 0, 'Connection proxy / data API', 'purple', 'route', { size: [1.5, 1.5], height: 26, ...extra });
const compute = (extra: Partial<SceneNode> = {}) => box('compute', 1, -6, 'Elastic compute (query engine + cache)', 'orange', 'cpu', { size: [1.8, 1.8], height: 30, ...extra });
const scaler = (extra: Partial<SceneNode> = {}) => box('scaler', 1, 8, 'Autoscaler (watches load)', 'green', 'gauge', { size: [1.3, 1.3], height: 22, ...extra });
const storage = (extra: Partial<SceneNode> = {}) => disk('storage', 14, -3, 'Shared log + page storage (replicated across zones)', { size: [3.4, 1.4], height: 16, tone: 'yellow', ...extra });
const idle = (extra: Partial<SceneNode> = {}) => box('idle', 14, 8, 'Paused: compute = 0', 'blue', 'moon', { size: [1.3, 1.3], height: 18, ...extra });

const fmtD = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

const lesson: Lesson = {
  slug: 'source-what-is-serverless-db',
  title: 'Serverless Databases: Separating Compute from Storage',
  blurb: 'Pay for the capacity you use by splitting a database into elastic compute and a shared, durable storage layer — what that buys, what the break-even against a provisioned instance looks like, and the cold-start, connection and latency costs.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'sls', label: 'Serverless compute cost per month', icon: 'cloud' },
    { key: 'prov', label: 'Provisioned instance cost per month (sized for peak)', icon: 'server' },
    { key: 'even', label: 'Break-even average utilisation of the peak', icon: 'scale' },
    { key: 'cold', label: 'User-visible delay per day from resumes', icon: 'timer' },
  ],
  goals: [
    { text: 'The problem: capacity planned for the peak', step: 1 },
    { text: 'Architecture: compute and storage as separate layers', step: 2 },
    { text: 'Autoscaling and scale-to-zero', step: 3 },
    { text: 'The cost model and its break-even', step: 4 },
    { text: 'Trade-offs: cold starts, connections, storage latency', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'peak', label: 'Peak capacity needed', min: 1, max: 512, step: 1, default: 32, unit: ' ACU', description: 'Capacity units (1 ACU ≈ 2 GB RAM + matching CPU) at the busiest moment.' },
      { key: 'avg', label: 'Average capacity actually used', min: 0.5, max: 512, step: 0.5, default: 6, unit: ' ACU', description: 'Time-averaged usage across the month.' },
      { key: 'ps', label: 'Serverless price per ACU-hour', min: 0.02, max: 0.5, step: 0.01, default: 0.12, unit: ' $', description: 'Illustrative on-demand rate for metered capacity.' },
      { key: 'pp', label: 'Provisioned price per ACU-hour', min: 0.01, max: 0.4, step: 0.01, default: 0.06, unit: ' $', description: 'Illustrative rate for an always-on instance (cheaper per unit).' },
      { key: 'head', label: 'Provisioned headroom over peak', min: 1, max: 2.5, step: 0.05, default: 1.3, unit: '×', description: 'Spare capacity you must keep for spikes and failover.' },
      { key: 'resumes', label: 'Resumes from paused per day', min: 0, max: 200, step: 1, default: 6, unit: '', description: 'Times the database scales from zero to active.' },
      { key: 'rs', label: 'Resume time', min: 0.5, max: 60, step: 0.5, default: 10, unit: ' s', description: 'Seconds until the first query can run.' },
    ],
    calculate: (input, step) => {
      const peak = Math.max(0.5, input.peak ?? 32);
      const avg = Math.max(0.1, input.avg ?? 6);
      const ps = Math.max(0.001, input.ps ?? 0.12);
      const pp = Math.max(0.001, input.pp ?? 0.06);
      const head = Math.max(1, input.head ?? 1.3);
      const resumes = Math.max(0, input.resumes ?? 6);
      const rs = Math.max(0, input.rs ?? 10);
      const hours = 730;
      const sls = avg * ps * hours;
      const prov = peak * head * pp * hours;
      const evenAvg = (peak * head * pp) / ps;
      const evenShare = evenAvg / peak;
      return {
        sls: step < 4 ? { v: '—' } : { v: `${fmtD(sls)} (${avg} ACU avg × $${ps.toFixed(2)} × ${hours} h)`, tone: sls < prov ? 'good' : 'warn' },
        prov: step < 4 ? { v: '—' } : { v: `${fmtD(prov)} (${(peak * head).toFixed(1)} ACU × $${pp.toFixed(2)} × ${hours} h)` },
        even: step < 4 ? { v: '—' } : { v: `${(evenShare * 100).toFixed(0)}% of peak (${evenAvg.toFixed(1)} ACU) — serverless wins below this`, tone: avg / peak < evenShare ? 'good' : 'warn' },
        cold: step < 5 ? { v: '—' } : { v: `${(resumes * rs).toFixed(0)} s/day (${resumes} × ${rs} s)`, tone: resumes * rs < 120 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Problem',
      kind: 'problem',
      title: 'Provisioned databases are sized for the worst minute',
      body: [
        'A conventional database instance is a fixed machine: you choose CPU and memory, pay by the hour whether it is busy or idle, and resize with downtime or a failover. Real workloads are spiky — a dev database used 4 hours a day, a SaaS tenant that peaks at 9 am, a campaign that is 50× quiet most of the year — so you must provision for the <b>peak plus headroom</b> and accept that the average utilisation is low. A database that needs 32 units at peak but averages 6 sits at <b>~19% busy</b> while you pay for 100% of 41.6 units.',
        'Capacity planning is also a <b>people</b> cost: choosing instance sizes, watching storage, resizing before the traffic arrives. A <b>serverless database</b> promises to make capacity an elastic, metered quantity: pay for what you use, scale automatically with load, and in the extreme scale to zero when idle. That is feasible only because of an architectural change, not a billing change.',
      ],
      scene: { nodes: [apps({ tag: pill('peak 32 ACU · avg 6', 'activity') }), compute({ tag: pill('one big always-on node', 'cpu', 'warn') }), storage({ tag: pill('local disks', 'disk') })], links: [link('apps', 'compute'), link('compute', 'storage')], flows: [flow(['apps', 'compute', 'storage'], { rate: 1.6 })] },
    },
    {
      short: 'Split',
      kind: 'technique',
      title: 'Compute and storage become separate layers',
      body: [
        'In a traditional database the engine owns its disks: the node is both the CPU that runs queries and the only holder of the data, so resizing means moving data. Serverless designs (Aurora Serverless, Neon, PlanetScale, Cosmos DB, Spanner, DynamoDB on-demand — different details, same idea) <b>separate compute from storage</b>. The storage layer is a <b>distributed, replicated service</b> — typically a log-structured store that accepts the engine’s <b>write-ahead log</b> records, keeps copies in several availability zones, and reconstructs <b>pages on demand</b> (“the log is the database” — see the ACID and Erasure Coding lessons). Durability lives there, not on the compute node.',
        'The compute node becomes nearly <b>stateless</b>: a query engine plus a <b>cache</b> (buffer pool) that can be thrown away and rebuilt by fetching pages from storage. Consequences: compute can be <b>added, resized or replaced in seconds</b> without copying data; many compute nodes (a writer and read replicas) can <b>share one storage volume</b>, so replicas appear without re-copying terabytes and failover doesn’t wait for data; storage grows automatically and is billed by the GB. A <b>proxy</b> in front terminates client connections so the compute behind it can change.',
      ],
      changes: [{ text: 'Storage service holds the log and pages, replicated across zones', tone: 'good' }, { text: 'Compute is a disposable cache + query engine', tone: 'good' }, { text: 'Replicas share storage: new read capacity in seconds', tone: 'good' }],
      concepts: [{ term: 'Compute–storage separation', def: 'Running the query engine and the durable data store as independently scaled services, so compute can resize or restart without moving data.' }],
      scene: { nodes: [apps(), proxy({ tag: pill('stable endpoint', 'route') }), compute({ tag: pill('stateless engine + page cache', 'cpu', 'good') }), storage({ tag: pill('log → pages, 6 copies / 3 zones', 'disk', 'good') })], links: [link('apps', 'proxy'), link('proxy', 'compute'), link('compute', 'storage')], flows: [flow(['apps', 'proxy', 'compute', 'storage'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Scaling',
      kind: 'technique',
      title: 'Autoscaling up, down — and to zero',
      body: [
        'An <b>autoscaler</b> watches utilisation (CPU, memory pressure, connections, queue depth) and adjusts compute in <b>capacity units</b>, e.g. from 0.5 to 128 ACU in half-unit steps. Scaling up can often be done <b>in place</b> — raising the memory and CPU allotment of the running engine without dropping connections — in seconds; scaling down is slower and conservative (it waits to avoid flapping, and shrinking the buffer pool drops warm cache). Reads can scale <b>out</b> by adding replica compute nodes on the shared storage.',
        '<b>Scale to zero</b>: after an idle period (say 5–30 minutes with no connections) the compute is <b>paused</b>; only storage is billed. The next request must <b>resume</b> it: allocate compute, start the engine, attach storage — 5–15 seconds is typical, longer with big caches to warm. Great for dev/test, preview environments, per-tenant databases and rarely used internal tools; unsuitable as-is for latency-sensitive production paths unless you set a <b>minimum capacity</b> (never pause, floor at e.g. 2 ACU) — you then pay a small base fee for readiness.',
      ],
      changes: [{ text: 'Capacity in small units; scale up in place in seconds', tone: 'good' }, { text: 'Scale down is slower and conservative; cache goes cold', tone: 'info' }, { text: 'Pause when idle: only storage billed; resume takes 5–15 s', tone: 'info' }],
      scene: { nodes: [apps(), proxy(), compute({ tag: pill('8 ACU → 24 ACU', 'gauge', 'good') }), scaler({ tag: pill('load ↑ → add units', 'activity') }), idle({ tag: pill('idle 15 min → pause', 'moon') })], links: [link('apps', 'proxy'), link('proxy', 'compute'), link('scaler', 'compute'), link('compute', 'idle', { style: 'dashed' })], flows: [flow(['apps', 'proxy', 'compute'], { rate: 1.6 })] },
    },
    {
      short: 'Cost',
      kind: 'insight',
      title: 'The cost model and the break-even',
      body: [
        'Per capacity unit, metered serverless compute costs <b>more</b> than an always-on instance (you pay for elasticity). With illustrative prices — $0.12 per ACU-hour serverless vs $0.06 provisioned — a database averaging 6 ACU costs 6 × $0.12 × 730 h = <b>$526 a month</b> on serverless, while a provisioned instance sized for the 32-ACU peak plus 30% headroom (41.6 ACU) costs 41.6 × $0.06 × 730 = <b>$1,822</b>. The serverless bill is 3.5× lower because it follows the average.',
        'The <b>break-even</b> is where the two bills match: average usage ÷ peak = (provisioned price × headroom) ÷ serverless price = 0.06 × 1.3 ÷ 0.12 = <b>65%</b>. A workload using less than 65% of its peak on average is cheaper on serverless; a steady, high-utilisation one (e.g. a 24/7 database at 80% of peak) is cheaper provisioned — and cheaper still with reserved capacity. Also compare the <b>non-compute</b> lines (storage per GB, I/O requests, backups, data transfer) and the saved operations effort; prices differ widely between providers, so plug in real numbers. The pattern <i>idle-heavy + spiky</i> wins, <i>flat + busy</i> loses.',
      ],
      changes: [{ text: '6 ACU avg × $0.12 = $526/mo vs 41.6 ACU × $0.06 = $1,822/mo', tone: 'good' }, { text: 'Break-even at 65% average utilisation of peak', tone: 'info' }, { text: 'Steady, busy workloads: provisioned or reserved is cheaper', tone: 'info' }],
      scene: { nodes: [apps({ tag: pill('avg 19% of peak', 'gauge') }), compute({ tag: pill('serverless: pay for 6 ACU', 'cloud', 'good') }), box('prov', 1, 8, 'Provisioned: pay for 41.6 ACU', 'red', 'server', { size: [1.5, 1.5], height: 26, tag: pill('3.5× more', 'dollar', 'warn') })], links: [link('apps', 'compute'), link('apps', 'prov', { style: 'dashed' })], flows: [flow(['apps', 'compute'], { rate: 1.6 })] },
    },
    {
      short: 'Tradeoffs',
      kind: 'tradeoff',
      title: 'Cold starts, connections and storage latency',
      body: [
        '<b>Cold start</b>: six resumes a day of 10 s each is <b>a minute of delayed first queries daily</b> — fine for internal tools, unacceptable for a customer-facing login. Mitigate with minimum capacity, keep-warm pings (which defeat the point), or <b>retry-aware clients</b> with timeouts longer than the resume time. <b>Connections</b>: serverless compute scales by creating and destroying engines, so applications (especially serverless functions that open a connection per invocation) can exhaust limits — use the vendor’s <b>proxy/pooler or HTTP data API</b> (see the Connection Pooling lesson), keep transactions short, and design for connections to be dropped on scale events.',
        '<b>Storage latency</b>: a cache miss now fetches a page <b>over the network</b> from the storage service (~0.5–2 ms) instead of a local NVMe (~0.1 ms), so cold caches after a resume or scale-down are slower and large working sets that don’t fit the cache see higher p99; writes also wait for a quorum of storage nodes. Other limits: maximum capacity ceilings, less control over engine settings and extensions, vendor lock-in (proprietary storage protocols), unpredictable bills if a runaway query autoscales to the maximum — set <b>maximum capacity and budget alerts</b>. Choose serverless for variable, idle-heavy, multi-tenant or experimental workloads; choose provisioned (or reserved) for steady, latency-critical, high-utilisation databases. Figures here are model outputs with illustrative prices.',
      ],
      changes: [{ text: '6 resumes × 10 s = 60 s of delayed first queries per day', tone: 'bad' }, { text: 'Use the proxy or data API; expect dropped connections on scale events', tone: 'info' }, { text: 'Remote page reads (~1 ms) vs local NVMe (~0.1 ms); cap max capacity and set budget alerts', tone: 'bad' }],
      scene: { nodes: [apps({ tag: pill('first query after idle', 'clock', 'warn') }), proxy({ tag: pill('holds the connection', 'route', 'good') }), idle({ tag: pill('resume: 10 s', 'timer', 'warn') }), storage({ tag: pill('page fetch ~1 ms', 'disk') })], links: [link('apps', 'proxy'), link('proxy', 'idle'), link('idle', 'storage')], flows: [flow(['apps', 'proxy', 'idle'], { rate: 1, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Elastic compute works because the data no longer lives on it',
      body: [
        'A <b>serverless database</b> separates a stateless, resizable compute tier from a shared, replicated storage tier, so capacity can follow load and pause at zero. It wins on <b>spiky, idle-heavy</b> workloads (average below ~65% of peak at these prices) and loses on steady, busy ones.',
        'Plan for cold starts, connection handling through a proxy, remote-storage latency and runaway-scaling guardrails.',
      ],
      scene: { nodes: [apps(), proxy(), compute(), storage(), scaler()], links: [link('apps', 'proxy'), link('proxy', 'compute'), link('compute', 'storage'), link('scaler', 'compute')], flows: [flow(['apps', 'proxy', 'compute', 'storage'], { kind: 'write', rate: 1.6 })] },
    },
  ],
};

export default lesson;
