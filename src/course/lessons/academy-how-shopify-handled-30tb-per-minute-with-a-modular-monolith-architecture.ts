import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -18, 0, 12, 'shoppers + merchants', extra);
const router = (extra: Partial<SceneNode> = {}) => box('router', -9, 0, 'Edge router (tenant → pod)', 'purple', 'route', { size: [1.5, 1.5], height: 26, ...extra });
const pod = (i: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`pod${i}`, 2, -9 + i * 9, name, 'orange', 'server', { size: [1.8, 1.8], height: 30, ...extra });
const podDb = (i: number, extra: Partial<SceneNode> = {}) => db(`pdb${i}`, 12, -9 + i * 9, `Pod ${i + 1} database`, { size: [1.3, 1.3], ...extra });
const mod = (id: string, r: number, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, 'blue', 'box', { size: [1.1, 1.1], height: 16, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'academy-how-shopify-handled-30tb-per-minute-with-a-modular-monolith-architecture',
  title: 'The Modular Monolith: One Codebase, Strong Boundaries, Tenant Pods',
  blurb: 'Why a single deployable with enforced internal modules can beat a mesh of microservices on latency, availability and cost, and how tenant-sharded “pods” contain blast radius — with the arithmetic that makes the trade-off concrete.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'pods', label: 'Pods needed for the tenant base', icon: 'layers' },
    { key: 'blast', label: 'Share of tenants affected by one pod failure', icon: 'alert' },
    { key: 'avail', label: 'Availability of a request needing N services', icon: 'shield' },
    { key: 'lat', label: 'Network latency added by service hops', icon: 'clock' },
    { key: 'deploy', label: 'Teams’ deploys per day (coordination)', icon: 'refresh' },
  ],
  goals: [
    { text: 'Monolith, microservices and what is in between', step: 1 },
    { text: 'Module boundaries enforced inside one codebase', step: 2 },
    { text: 'The hidden costs of the network hop', step: 3 },
    { text: 'Tenant pods: sharding the whole stack', step: 4 },
    { text: 'When to split and when not to', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'tenants', label: 'Tenants (merchants)', min: 1000, max: 50000000, step: 1000, default: 2000000, unit: '', description: 'Independent customers served.' },
      { key: 'perpod', label: 'Tenants per pod', min: 100, max: 500000, step: 100, default: 50000, unit: '', description: 'Capacity of one isolated pod.' },
      { key: 'hops', label: 'Services a request needs (microservices)', min: 1, max: 40, step: 1, default: 12, unit: '', description: 'Serial calls on the critical path.' },
      { key: 'svc', label: 'Availability of each service', min: 99, max: 99.999, step: 0.001, default: 99.95, unit: '%', description: 'Per-service uptime.' },
      { key: 'hop', label: 'Latency per network hop', min: 0.1, max: 20, step: 0.1, default: 2, unit: ' ms', description: 'Serialisation, network and queueing for one call.' },
      { key: 'teams', label: 'Teams contributing', min: 1, max: 300, step: 1, default: 60, unit: '', description: 'Independent teams.' },
      { key: 'dpt', label: 'Deploys per team per day', min: 0.1, max: 20, step: 0.1, default: 2, unit: '', description: 'Release cadence per team.' },
    ],
    calculate: (input, step) => {
      const tenants = Math.max(1, input.tenants ?? 2e6);
      const perpod = Math.max(1, input.perpod ?? 5e4);
      const hops = Math.max(1, Math.round(input.hops ?? 12));
      const svc = Math.min(1, Math.max(0, (input.svc ?? 99.95) / 100));
      const hop = Math.max(0, input.hop ?? 2);
      const teams = Math.max(1, input.teams ?? 60);
      const dpt = Math.max(0, input.dpt ?? 2);
      const pods = Math.ceil(tenants / perpod);
      const chain = Math.pow(svc, hops);
      return {
        pods: step < 4 ? { v: '—' } : { v: `${fmtN(pods)} pods (${fmtN(perpod)} tenants each)` },
        blast: step < 4 ? { v: '—' } : { v: `${((1 / pods) * 100).toFixed(2)}% of tenants`, tone: pods >= 20 ? 'good' : 'warn' },
        avail: step < 3 ? { v: '—' } : { v: `${(chain * 100).toFixed(2)}% (${(svc * 100).toFixed(3)}%^${hops}) vs ${(svc * 100).toFixed(3)}% in-process`, tone: chain > 0.999 ? 'good' : 'warn' },
        lat: step < 3 ? { v: '—' } : { v: `${(hop * hops).toFixed(0)} ms for ${hops} hops vs ~0 for in-process calls`, tone: hop * hops < 20 ? 'good' : 'warn' },
        deploy: step < 2 ? { v: '—' } : { v: `${fmtN(teams * dpt)} deploys/day (${teams} teams × ${dpt})` },
      };
    },
  },
  steps: [
    {
      short: 'Spectrum',
      kind: 'insight',
      title: 'It isn’t monolith vs microservices; it’s where the boundaries are',
      body: [
        'A <b>monolith</b> is one deployable: one codebase, one build, one process, usually one database. Its reputation problem is the <i>big ball of mud</i> — everything calls everything, a change anywhere risks anything, builds slow down and teams block each other. <b>Microservices</b> answer by splitting into independently deployable services with their own data, at the price of a distributed system: network calls, partial failure, eventual consistency, versioned APIs, and a large operational surface (see the Microservices lessons).',
        'The <b>modular monolith</b> takes the useful part of each: <b>strict module boundaries inside one deployable</b>. Modules (orders, payments, inventory, themes…) expose explicit public interfaces; their internals and tables are private; dependencies form a <b>directed acyclic graph</b> that tools enforce. Calls between modules are function calls — nanoseconds, no serialisation, no partial failure, with transactions across modules possible — yet ownership and design discipline are as clear as with services.',
      ],
      scene: { nodes: [users(), router(), pod(0, 'One deployable', { tag: pill('modules + public APIs', 'layers', 'good') }), podDb(0)], links: [link('users', 'router'), link('router', 'pod0'), link('pod0', 'pdb0')], flows: [flow(['users', 'router', 'pod0', 'pdb0'], { rate: 2 })] },
    },
    {
      short: 'Modules',
      kind: 'technique',
      title: 'Boundaries enforced by tools, not goodwill',
      body: [
        'Boundaries decay without enforcement. Practical mechanisms: a <b>declared ownership map</b> (each directory or namespace belongs to a team and a module); <b>public vs private interfaces</b> per module (only a small API surface is importable — language visibility, “package-private” conventions, or a boundary linter that fails CI on a forbidden import); a <b>dependency graph check</b> that rejects cycles and layering violations; per-module <b>table ownership</b> (only the owning module reads or writes its tables — others go through its API); and <b>contract tests</b> on the public interfaces.',
        'Result: teams change internals freely, and cross-team changes are visible as API changes. Deploys are still all-or-nothing, so the <b>pipeline</b> carries the weight: fast incremental builds and tests (affected modules only), feature flags and progressive rollout, automatic rollback, and a merge queue. With 60 teams × 2 deploys each, one trunk sees <b>120 deploys/day</b> — workable only with a strong, fast release machine; the monolith’s coordination cost shifts into CI, not into meetings.',
      ],
      changes: [{ text: 'Ownership map, import rules, table ownership, DAG check in CI', tone: 'good' }, { text: '60 teams × 2 deploys = 120 trunk deploys/day: invest in CI + flags', tone: 'info' }],
      scene: { nodes: [pod(0, 'Deployable', { tag: pill('boundary linter in CI', 'shield', 'good') }), mod('m1', -4, -10, 'Checkout'), mod('m2', 2, -10, 'Orders'), mod('m3', 8, -10, 'Inventory'), mod('m4', 2, 10, 'Payments')], links: [link('m1', 'm2'), link('m2', 'm3'), link('m2', 'm4'), link('pod0', 'm2', { style: 'dashed' })], flows: [flow(['m1', 'm2', 'm4'], { rate: 1.4 })] },
    },
    {
      short: 'Hops',
      kind: 'problem',
      title: 'What a network hop really costs',
      body: [
        'Splitting a call path across services converts function calls into <b>RPCs</b>, and costs compound. <b>Latency</b>: each hop adds serialisation, network, queueing and load-balancer time — 2 ms × 12 hops = <b>24 ms</b> added to every request’s critical path even in the good case, and the <b>tail</b> (p99 of a chain) is dominated by the slowest of many calls. <b>Availability</b>: serial dependencies multiply — twelve services at 99.95% give <code>0.9995¹²</code> = <b>99.40%</b> for requests that need all of them: 52 hours of unavailability a year against 4.4 hours for one process.',
        'Plus <b>consistency</b> (no cross-service transaction — sagas and compensation instead), <b>debugging</b> (a request becomes a distributed trace), <b>duplicate infrastructure</b> (each service needs its own pipeline, dashboards, on-call, capacity and data store), and <b>versioning</b> (every API change must be backward-compatible across independent deploys). Mitigations exist (timeouts, breakers, bulkheads — see the Resiliency lesson — plus caching and async patterns) but they are costs you are choosing to carry. Microservices buy <b>independent scaling and deployment</b>; make sure you need those.',
      ],
      changes: [{ text: '12 hops × 2 ms = 24 ms on the critical path', tone: 'bad' }, { text: '99.95%^12 = 99.40% ≈ 52 h/year down', tone: 'bad' }, { text: 'Sagas, tracing, duplicated platform work', tone: 'bad' }],
      scene: { nodes: [router({ name: 'Gateway' }), mod('a', -4, -6, 'Svc A', { tone: 'orange' } as Partial<SceneNode>), mod('b', 2, -6, 'Svc B'), mod('c', 8, -6, 'Svc C'), mod('d', 14, -6, 'Svc D', { state: 'hot', tag: pill('slow → tail latency', 'alert', 'warn') })], links: [link('router', 'a'), link('a', 'b'), link('b', 'c'), link('c', 'd')], flows: [flow(['router', 'a', 'b', 'c', 'd'], { rate: 1.6 })] },
    },
    {
      short: 'Pods',
      kind: 'technique',
      title: 'Pods: shard the entire stack by tenant',
      body: [
        'A single deployable doesn’t have to be a single <b>instance</b> or a single database. In a multi-tenant business, tenants are independent: one merchant’s orders never join another’s. So <b>shard everything by tenant</b> — a <b>pod</b> is a full copy of the stack (app servers, database, cache, job workers) serving a slice of tenants, with an <b>edge router</b> that maps tenant → pod. 2 million tenants at 50,000 per pod = <b>40 pods</b>.',
        'This bounds <b>blast radius</b>: a bad deploy to one pod, a database failure or a runaway tenant affects <b>1/40 = 2.5%</b> of tenants, not everyone. It scales by adding pods (capacity is linear and unshared), allows <b>canary pods</b> (roll a release to one pod first), and <b>tenant moves</b> rebalance hotspots (a mega-tenant gets its own pod). Costs: the routing map is a critical dependency, cross-tenant features (global analytics, admin tools) need separate pipelines, and database schema migrations must run per pod. The same idea appears as <b>cell-based architecture</b> (see that lesson).',
      ],
      changes: [{ text: 'Pod = whole stack for a slice of tenants; router maps tenant → pod', tone: 'good' }, { text: '40 pods → one failure touches 2.5% of tenants', tone: 'good' }, { text: 'Canary by pod; move hot tenants', tone: 'good' }],
      scene: { nodes: [users(), router({ tag: pill('tenant → pod map', 'hash') }), pod(0, 'Pod 1', { tag: pill('50k tenants', 'users') }), pod(1, 'Pod 2', { state: 'hot', tag: pill('bad deploy: isolated', 'alert', 'warn') }), podDb(0), podDb(1)], links: [link('users', 'router'), link('router', 'pod0'), link('router', 'pod1'), link('pod0', 'pdb0'), link('pod1', 'pdb1')], flows: [flow(['users', 'router', 'pod0', 'pdb0'], { rate: 2 }), flow(['router', 'pod1'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Split?',
      kind: 'tradeoff',
      title: 'When to extract a service, and when not to',
      body: [
        'Extract a module into its own service only for a <b>specific, measured reason</b>: it needs a <b>different scaling profile</b> (CPU-heavy image processing, a bursty search tier), a <b>different runtime or language</b>, a <b>different availability or compliance boundary</b> (payment card data in a smaller audited footprint — see the Card Payments lesson), or its team is so large and independent that coordination on trunk costs more than an API contract. Then you pay the network, consistency and operations costs knowingly — and for that module only.',
        'Heuristics: start modular and extract later (a clean module boundary is the prerequisite for a clean service boundary, so the modular monolith is also the lowest-risk path to services); don’t split along technical layers; keep <b>data ownership</b> with the module; and re-merge services that always change together. Organisational fit matters (Conway’s Law): module boundaries should mirror team boundaries. Figures here are first-order model outputs with illustrative availability and latency; the principle is that every boundary you turn into a network call must earn its keep.',
      ],
      changes: [{ text: 'Extract for scaling, runtime, compliance or team-independence reasons', tone: 'good' }, { text: 'Clean module boundary first; service later', tone: 'good' }],
      scene: { nodes: [pod(0, 'Core deployable', { tag: pill('modules', 'layers') }), box('ext', 12, -6, 'Extracted: image processing', 'green', 'cpu', { size: [1.4, 1.4], height: 24, tag: pill('different scaling profile', 'gauge') }), box('ext2', 12, 6, 'Extracted: card vault', 'red', 'lock', { size: [1.4, 1.4], height: 24, tag: pill('compliance boundary', 'shield') })], links: [link('pod0', 'ext'), link('pod0', 'ext2')], flows: [flow(['pod0', 'ext'], { rate: 1.2 }), flow(['pod0', 'ext2'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Boundaries are the architecture; deployment shape is a choice',
      body: [
        'A <b>modular monolith</b> enforces module boundaries, data ownership and an acyclic dependency graph inside one deployable, avoiding the latency, availability and consistency costs of network hops (12 hops: +24 ms and 99.40% availability). <b>Tenant pods</b> shard the whole stack to limit blast radius and scale linearly.',
        'Extract services only for measured reasons — and only along boundaries you have already made clean.',
      ],
      scene: { nodes: [users(), router(), pod(0, 'Pod 1'), pod(1, 'Pod 2'), podDb(0), podDb(1)], links: [link('users', 'router'), link('router', 'pod0'), link('router', 'pod1'), link('pod0', 'pdb0'), link('pod1', 'pdb1')], flows: [flow(['users', 'router', 'pod0', 'pdb0'], { rate: 2 })] },
    },
  ],
};

export default lesson;
