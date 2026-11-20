import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -18, 0, 12, 'many app instances', extra);
const pool = (extra: Partial<SceneNode> = {}) => box('pool', -8, 0, 'Connection pooler (PgBouncer-style)', 'purple', 'filter', { size: [1.6, 1.6], height: 30, ...extra });
const primary = (extra: Partial<SceneNode> = {}) => db('primary', 4, -4, 'Postgres primary', { size: [1.8, 1.8], ...extra });
const replica = (extra: Partial<SceneNode> = {}) => db('replica', 4, 8, 'Read replicas', { size: [1.4, 1.4], ...extra });
const ha = (extra: Partial<SceneNode> = {}) => box('ha', 14, -4, 'Failover manager', 'green', 'shield', { size: [1.3, 1.3], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtG = (gb: number): string => (gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB` : gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`);

const lesson: Lesson = {
  slug: 'academy-how-cloudflare-was-able-to-support-55-million-requests-per-second-with-only-15-postgres-clusters',
  title: 'PostgreSQL at High Request Rates: Connection Pooling, Replicas and Failover',
  blurb: 'Why a process-per-connection database collapses under thousands of clients, how transaction-mode pooling multiplexes them onto a few hundred backends (Little’s law), and how replicas and automated failover carry the rest.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'clients', label: 'Client connections opened', icon: 'users' },
    { key: 'mem', label: 'Backend memory without a pooler', icon: 'disk' },
    { key: 'active', label: 'Server connections actually busy', icon: 'activity' },
    { key: 'ratio', label: 'Pooler multiplexing ratio', icon: 'filter' },
    { key: 'tps', label: 'Queries per second per cluster', icon: 'gauge' },
  ],
  goals: [
    { text: 'Process-per-connection: what a connection costs', step: 1 },
    { text: 'Why throughput collapses beyond ~cores × few connections', step: 2 },
    { text: 'Transaction pooling and Little’s law', step: 3 },
    { text: 'What pooling breaks (session state)', step: 4 },
    { text: 'Read replicas, failover and operating many clusters', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'inst', label: 'Application instances', min: 10, max: 20000, step: 10, default: 2000, unit: '', description: 'Pods or processes that talk to the database.' },
      { key: 'per', label: 'Connections per instance', min: 1, max: 100, step: 1, default: 20, unit: '', description: 'Pool size inside each instance.' },
      { key: 'mb', label: 'Memory per backend', min: 2, max: 60, step: 1, default: 12, unit: ' MB', description: 'RSS of one Postgres backend, before large work_mem use.' },
      { key: 'qps', label: 'Queries per second to this cluster', min: 100, max: 2000000, step: 100, default: 50000, unit: '/s', description: 'Offered load.' },
      { key: 'ms', label: 'Average transaction duration', min: 0.2, max: 200, step: 0.2, default: 4, unit: ' ms', description: 'Time a connection is busy per transaction.' },
      { key: 'cores', label: 'Database CPU cores', min: 4, max: 192, step: 4, default: 64, unit: '', description: 'Cores on the primary.' },
      { key: 'mult', label: 'Server connections per core (sweet spot)', min: 1, max: 8, step: 0.5, default: 4, unit: '×', description: 'Active backends per core before throughput falls.' },
    ],
    calculate: (input, step) => {
      const inst = Math.max(1, input.inst ?? 2000);
      const per = Math.max(1, input.per ?? 20);
      const mb = Math.max(0.1, input.mb ?? 12);
      const qps = Math.max(1, input.qps ?? 50000);
      const ms = Math.max(0.0001, (input.ms ?? 4) / 1000);
      const cores = Math.max(1, input.cores ?? 64);
      const mult = Math.max(0.5, input.mult ?? 4);
      const clients = inst * per;
      const mem = (clients * mb) / 1000;
      // Little's law: connections busy = arrival rate × service time.
      const active = qps * ms;
      const target = cores * mult;
      const serverConns = Math.ceil(Math.max(active * 1.5, 1));
      const ratio = clients / serverConns;
      return {
        clients: step < 1 ? { v: '—' } : { v: fmtN(clients) },
        mem: step < 1 ? { v: '—' } : { v: `${fmtG(mem)} (${clients > target ? 'collapses past ~' + fmtN(target) : 'within limits'})`, tone: clients <= target ? 'good' : 'bad' },
        active: step < 3 ? { v: '—' } : { v: `${fmtN(active)} busy (${fmtN(qps)}/s × ${(ms * 1000).toFixed(1)} ms) → pool of ${fmtN(serverConns)}`, tone: serverConns <= target ? 'good' : 'bad' },
        ratio: step < 3 ? { v: '—' } : { v: `${ratio.toFixed(0)} clients per server connection`, tone: ratio > 1 ? 'good' : 'warn' },
        tps: step < 4 ? { v: '—' } : { v: `${fmtN(qps)}/s offered · ${fmtN(Math.floor(target / ms / 1000) * 1000)}/s ceiling (${fmtN(target)} busy × 1/${(ms * 1000).toFixed(1)} ms)`, tone: qps < (target / ms) * 0.7 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Cost',
      kind: 'problem',
      title: 'In PostgreSQL every connection is an OS process',
      body: [
        'PostgreSQL forks a <b>dedicated backend process per client connection</b> (MySQL uses a thread; the effect is similar). Each backend holds its own memory (a few MB for catalog caches and buffers, plus <code>work_mem</code> per sort or hash when running a query), a slot in the shared-memory <b>proc array</b> that every transaction snapshot must scan, and a set of file descriptors. That was fine when a database served a dozen app servers.',
        'Modern deployments multiply connections: 2,000 application instances (pods, lambdas, workers) × 20 pooled connections each = <b>40,000 client connections</b>. At ~12 MB each that’s <b>480 GB of RAM just for idle backends</b> — before any query — and connection storms (a deploy restarting every pod) arrive as a thundering herd of forks and authentication handshakes.',
      ],
      changes: [{ text: '2,000 instances × 20 = 40,000 connections', tone: 'bad' }, { text: '40,000 × 12 MB ≈ 480 GB of backend memory', tone: 'bad' }],
      scene: { nodes: [clients({ tag: pill('40,000 connections', 'users', 'warn') }), primary({ state: 'hot', load: 100, tag: pill('40,000 backend processes', 'alert', 'bad') })], links: [link('clients', 'primary')], flows: [flow(['clients', 'primary'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Collapse',
      kind: 'insight',
      title: 'More connections do not mean more throughput',
      body: [
        'A database can only do useful work on as many queries as it has <b>cores and I/O parallelism</b>. Past a modest multiple of the core count, extra active backends add <b>context switching, lock and latch contention, and cache thrash</b> — throughput <i>falls</i> while latency climbs. A common rule of thumb is a few connections per core: with 64 cores and a 4× multiple, about <b>256 active connections</b> is the sweet spot.',
        'So the question isn’t “how many clients may connect” but “how many queries should be running at once”. Excess work should <b>queue outside the database</b> (cheap, in a pooler, where waiting costs nothing) rather than inside it (where each waiter is a process that contends for CPU and locks). That is the entire case for a connection pooler: put admission control in front of the database.',
      ],
      changes: [{ text: 'Optimal active backends ≈ cores × 2–4', tone: 'info' }, { text: 'Beyond it, throughput drops and latency rises', tone: 'bad' }, { text: 'Queue outside the DB, not inside', tone: 'good' }],
      scene: { nodes: [clients(), pool({ tag: pill('queue here, cheaply', 'queue', 'good') }), primary({ tag: pill('≈256 active', 'gauge', 'good') })], links: [link('clients', 'pool'), link('pool', 'primary')], flows: [flow(['clients', 'pool'], { kind: 'heavy', rate: 3 }), flow(['pool', 'primary'], { rate: 1.4 })] },
    },
    {
      short: 'Pooling',
      kind: 'technique',
      title: 'Transaction pooling: multiplex thousands onto hundreds',
      body: [
        'A pooler such as <b>PgBouncer</b> (or Pgpool, Odyssey, RDS Proxy) terminates client connections cheaply (event-driven, no process per client) and keeps a <b>small pool of real server connections</b>. In <b>transaction mode</b> a server connection is assigned to a client only <i>for the duration of one transaction</i> and returned to the pool at COMMIT — so a connection that is idle between a client’s transactions serves somebody else.',
        'Size by <b>Little’s law</b>: busy connections = arrival rate × transaction time = 50,000 queries/s × 4 ms = <b>200</b> concurrently busy. With 1.5× headroom the pool is <b>300 server connections</b> serving 40,000 clients — a <b>133:1</b> multiplexing ratio — and memory falls from 480 GB to ~3.6 GB. If a transaction takes 40 ms instead, busy connections rise to 2,000, past the 256-connection sweet spot: that is overload, and the pooler’s queue (with a timeout and a limit) is where it shows up, rather than in a database collapse.',
      ],
      changes: [{ text: 'Busy connections = qps × transaction time: 50k × 4 ms = 200', tone: 'info' }, { text: '300-connection pool serves 40,000 clients (133:1)', tone: 'good' }, { text: 'Overload queues in the pooler, with limits and timeouts', tone: 'good' }],
      concepts: [{ term: 'Transaction pooling', def: 'A pooling mode where a server connection is borrowed only for one transaction and then returned, maximising multiplexing.' }],
      scene: { nodes: [clients({ tag: pill('40,000 clients', 'users') }), pool({ tag: pill('300 server conns', 'filter', 'good') }), primary({ tag: pill('≈200 busy', 'check', 'good') })], links: [link('clients', 'pool'), link('pool', 'primary')], flows: [flow(['clients', 'pool', 'primary'], { rate: 2.5, back: true })] },
    },
    {
      short: 'Caveats',
      kind: 'tradeoff',
      title: 'What transaction pooling takes away',
      body: [
        'Because the server connection changes between transactions, anything stored on the <b>session</b> is unsafe: <code>SET</code> variables, session-level <b>advisory locks</b>, <code>LISTEN/NOTIFY</code>, temporary tables, and traditionally <b>server-side prepared statements</b> (newer poolers track and re-prepare them). Applications must use <code>SET LOCAL</code> (scoped to the transaction), transaction-level advisory locks and protocol-level features the pooler supports — and long-lived “idle in transaction” sessions defeat the multiplexing by holding a connection.',
        'Other choices: <b>session pooling</b> (a server connection for a client’s whole session — little multiplexing, full compatibility), <b>statement pooling</b> (no multi-statement transactions), and app-side pools (still needed for connection reuse, but sized small). Also set <b>timeouts</b> everywhere: <code>statement_timeout</code>, <code>idle_in_transaction_session_timeout</code>, and the pooler’s query-wait timeout, so one stuck client cannot pin the pool. Pooler placement — a sidecar per app instance, a shared tier in front of each cluster, or both — is a trade between extra hops and blast radius.',
      ],
      changes: [{ text: 'No session state: use SET LOCAL and xact-level locks', tone: 'bad' }, { text: 'Timeouts on statements, idle-in-transaction and queue wait', tone: 'good' }],
      scene: { nodes: [clients(), pool({ tag: pill('transaction mode', 'filter') }), primary()], links: [link('clients', 'pool'), link('pool', 'primary')], flows: [flow(['clients', 'pool'], { rate: 1.4 }), flow(['pool', 'primary'], { kind: 'fail', rate: 0.5 })] },
    },
    {
      short: 'Scale-out',
      kind: 'technique',
      title: 'Replicas, failover and running many clusters',
      body: [
        'Beyond connection management, a cluster scales by <b>routing reads to replicas</b> (the pooler or client sends read-only transactions there, tolerating replication lag — see the Consistency Patterns lesson) and by <b>sizing per-cluster capacity</b>: with a 256-connection sweet spot and 4 ms transactions, the ceiling is 256 ÷ 0.004 = <b>64,000 queries/s</b> on the primary, so 50,000/s offered (78%) leaves little headroom — add replicas for reads, shed to a cache, or split the workload across clusters.',
        'High availability comes from a <b>failover manager</b> (Patroni with etcd/Consul, cloud-managed failover) that detects a dead primary, promotes the most caught-up replica, and repoints the pooler — typically in 10–30 seconds, during which the pooler holds or errors writes. Operating a fleet is easier when clusters are <b>uniform and automated</b>: identical configuration, automated provisioning and upgrades, per-cluster dashboards for connections, replication lag and pool wait time. Whether a company runs 15 big clusters or 1,500 small ones is a blast-radius versus operations decision; the model figures here are illustrative.',
      ],
      changes: [{ text: 'Ceiling ≈ busy-connection target ÷ transaction time', tone: 'info' }, { text: 'Reads to replicas; automated failover via a manager', tone: 'good' }],
      scene: { nodes: [clients(), pool({ tag: pill('writes → primary · reads → replicas', 'route') }), primary(), replica({ tag: pill('lag: ms', 'clock') }), ha({ tag: pill('promote on failure', 'refresh') })], links: [link('clients', 'pool'), link('pool', 'primary'), link('pool', 'replica'), link('primary', 'replica', { style: 'dashed' }), link('ha', 'primary')], flows: [flow(['clients', 'pool', 'primary'], { kind: 'write', rate: 1.4 }), flow(['pool', 'replica'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Queue outside the database; keep active backends near the core count',
      body: [
        'A process-per-connection database collapses long before the client count it is offered. A <b>transaction-mode pooler</b> turns tens of thousands of clients into a few hundred busy server connections (Little’s law: qps × transaction time), moving queueing out of the database.',
        'Give up session state, set timeouts, send reads to replicas, and automate failover.',
      ],
      scene: { nodes: [clients(), pool(), primary(), replica()], links: [link('clients', 'pool'), link('pool', 'primary'), link('pool', 'replica')], flows: [flow(['clients', 'pool', 'primary'], { rate: 2 })] },
    },
  ],
};

export default lesson;
