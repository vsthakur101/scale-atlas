import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const caller = (extra: Partial<SceneNode> = {}) => box('orders', -10, 0, 'Orders', 'purple', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const inst = (i: number, extra: Partial<SceneNode> = {}) =>
  box(`p${i}`, 6 + (i - 2) * 1.2, (i - 2) * 6, `Payments ${i}`, 'teal', 'dollar', { size: [1.2, 1.2], height: 32, ...extra });
const fleet = (f: (i: number) => Partial<SceneNode> = () => ({})) => [1, 2, 3].map((i) => inst(i, f(i)));
const registry = (extra: Partial<SceneNode> = {}) =>
  box('reg', -2, -8, 'Registry', 'yellow', 'list', { size: [1.4, 1.4], height: 36, sub: 'payments → [ … ]', ...extra });
const dns = (extra: Partial<SceneNode> = {}) => box('dns', -2, -8, 'DNS', 'yellow', 'globe', { size: [1.4, 1.4], height: 36, ...extra });
const vip = (extra: Partial<SceneNode> = {}) => box('vip', -2, 0, 'Service VIP', 'orange', 'route', { size: [1.4, 1.4], height: 36, ...extra });
const ps = ['p1', 'p2', 'p3'];

const lesson: Lesson = {
  slug: 'discovery',
  title: 'Service Discovery',
  blurb: 'Instances come and go every few minutes. How does one service find a healthy copy of another — right now?',
  minutes: 11,
  level: 'Intermediate',
  metrics: [
    { key: 'errors', label: 'Call errors', icon: 'alert' },
    { key: 'stale', label: 'Stale for', icon: 'clock' },
    { key: 'hops', label: 'Extra hops', icon: 'share' },
    { key: 'healthy', label: 'Healthy', icon: 'heart' },
  ],
  goals: [
    { text: 'Why static addresses break in elastic fleets', step: 1 },
    { text: 'DNS and its caching limits', step: 2 },
    { text: 'Registries with heartbeats and TTLs', step: 3 },
    { text: 'Client-side vs server-side discovery', step: 5 },
    { text: 'Service meshes and surviving registry outages', step: 8 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  steps: [
    {
      short: 'Hardcoded',
      kind: 'problem',
      title: 'An IP address in a config file',
      body: [
        'Orders calls Payments at <code>10.0.3.17:8443</code>, copied into its config. Then Payments autoscales, gets redeployed, and its instances move. The address in the config now points at nothing — or at some other service — and payments fail until someone edits and redeploys Orders.',
        'In an elastic fleet, instances are cattle with new addresses every deploy. Callers need to ask “where is Payments right now?”.',
      ],
      changes: [{ text: '10.0.3.17 is gone', tone: 'bad' }],
      scene: {
        nodes: [caller({ tag: pill('payments = 10.0.3.17', 'file', 'bad') }), ...fleet((i) => (i === 1 ? { state: 'ghost', tag: pill('10.0.3.17 (terminated)', 'x', 'bad') } : { tag: pill(`10.0.${i + 5}.${40 + i}`, 'pin') }))],
        links: [link('orders', 'p1', { style: 'broken' })],
        flows: [flow(['orders', 'p1'], { kind: 'fail', rate: 2 })],
        metrics: { errors: { v: '100%', tone: 'bad' }, stale: { v: 'until redeploy', tone: 'bad' }, hops: '0', healthy: '2 / 3' },
      },
    },
    {
      short: 'DNS',
      kind: 'technique',
      title: 'DNS: a name instead of an address',
      body: [
        'Give Payments a name — <code>payments.internal</code> — and have DNS return the current instance IPs. Every language and tool already speaks DNS, so it’s the lowest-friction start.',
        'But DNS was built for things that rarely move. Answers are cached by resolvers, operating systems and language runtimes (some forever), so changes propagate slowly; DNS carries no health information; and clients often pin to the first IP they got.',
      ],
      changes: [{ text: 'Name → IPs', tone: 'good' }, { text: 'Caching delays updates', tone: 'bad' }],
      scene: {
        nodes: [caller({ tag: pill('cached answer: 30 s+', 'clock', 'warn') }), dns({ tag: pill('A payments.internal', 'globe') }), ...fleet()],
        links: [link('orders', 'dns', { arrow: 'both', style: 'dashed' }), ...ps.map((p) => link('orders', p))],
        flows: [flow(['orders', 'dns'], { kind: 'handshake', back: true, rate: 0.3 }), ...ps.map((p) => flow(['orders', p], { back: true, rate: 1 }))],
        metrics: { errors: '2%', stale: { v: '30 s – ∞', tone: 'warn' }, hops: '0', healthy: '3 / 3' },
      },
    },
    {
      short: 'Registry',
      kind: 'technique',
      title: 'A registry that instances keep updated',
      body: [
        'Each Payments instance <b>registers</b> itself on startup — name, address, port, version — in a service registry (Consul, etcd, Eureka, or the Kubernetes API). It then sends <b>heartbeats</b>; if they stop, its entry expires after a TTL.',
        'Callers query the registry, or better, <b>watch</b> it, and get pushed changes within a second or two. The registry is the source of truth for “what’s running, where, and is it alive”.',
      ],
      changes: [{ text: 'Register + heartbeat (TTL 10 s)', tone: 'good' }, { text: 'Watchers updated in ~1 s', tone: 'good' }],
      concepts: [{ term: 'Service registry', def: 'A database of live service instances and their addresses, kept current by registration and health checks.' }],
      scene: {
        nodes: [caller(), registry({ tag: pill('3 healthy instances', 'check', 'good') }), ...fleet(() => ({ tag: pill('♥ heartbeat', 'heart') }))],
        links: [link('orders', 'reg', { arrow: 'both', style: 'dashed', label: pill('watch') }), ...ps.map((p) => link(p, 'reg', { style: 'dashed' })), ...ps.map((p) => link('orders', p))],
        flows: [...ps.map((p) => flow([p, 'reg'], { kind: 'handshake', rate: 0.5 })), ...ps.map((p) => flow(['orders', p], { back: true, rate: 1 }))],
        metrics: { errors: '0.1%', stale: { v: '~1 s', tone: 'good' }, hops: '0', healthy: '3 / 3' },
      },
    },
    {
      short: 'Client-side',
      kind: 'technique',
      title: 'Client-side discovery',
      body: [
        'With <b>client-side</b> discovery, Orders keeps the instance list in memory and picks one itself (round robin, least requests, or zone-aware). No extra hop, and smart balancing based on what the client sees.',
        'The cost: every language needs a capable discovery client library, kept up to date across every service — the logic is scattered.',
      ],
      concepts: [{ term: 'Client-side discovery', def: 'The caller looks up instances from a registry and load-balances across them itself.' }],
      scene: {
        nodes: [caller({ tag: pill('picks: least requests', 'gauge', 'good') }), registry(), ...fleet()],
        links: [link('orders', 'reg', { style: 'dashed' }), ...ps.map((p) => link('orders', p))],
        flows: ps.map((p) => flow(['orders', p], { back: true, rate: 1.2 })),
        metrics: { errors: '0.1%', stale: '~1 s', hops: { v: '0', tone: 'good' }, healthy: '3 / 3' },
      },
    },
    {
      short: 'Server-side',
      kind: 'technique',
      title: 'Server-side discovery',
      body: [
        'With <b>server-side</b> discovery, Orders calls one stable address — a load balancer or a virtual IP — and the platform routes to a healthy instance. Kubernetes Services work this way: a stable virtual IP and DNS name in front of whichever pods are ready.',
        'Clients stay simple and language-agnostic. You pay an extra hop (or in-kernel routing) and less control over balancing from the caller’s side.',
      ],
      concepts: [{ term: 'Server-side discovery', def: 'The caller sends to a fixed endpoint (load balancer or virtual IP) that routes to a live instance.' }],
      scene: {
        nodes: [caller({ tag: pill('payments:8443', 'link') }), vip({ tag: pill('ready pods only', 'heart', 'good') }), ...fleet()],
        links: [link('orders', 'vip'), ...ps.map((p) => link('vip', p))],
        flows: ps.map((p) => flow(['orders', 'vip', p], { back: true, rate: 1 })),
        metrics: { errors: '0.1%', stale: '~1 s', hops: '1', healthy: '3 / 3' },
      },
    },
    {
      short: 'Shutdown',
      kind: 'case',
      title: 'Case: errors on every deploy',
      body: [
        'Each Payments deploy causes a burst of failed calls. The old instance receives SIGTERM and exits immediately — but callers’ cached lists still contain it for a few seconds, and in-flight requests are cut off.',
        'Shut down in order: <b>deregister</b> (or fail readiness) first, wait for the change to propagate and in-flight requests to finish, <i>then</i> exit. On startup, register only once the instance is actually ready to serve.',
      ],
      changes: [{ text: 'Deregister → drain 10 s → exit', tone: 'good' }, { text: 'Deploy errors → 0', tone: 'good' }],
      concepts: [{ term: 'Readiness probe', def: 'A check that decides whether an instance should receive traffic, distinct from whether it is alive.' }],
      scene: {
        nodes: [caller(), registry({ tag: pill('p2 removed', 'x', 'good') }), ...fleet((i) => (i === 2 ? { state: 'ghost', tag: pill('draining…', 'clock', 'warn') } : {}))],
        links: [link('orders', 'reg', { style: 'dashed' }), link('orders', 'p1'), link('orders', 'p2', { style: 'dashed' }), link('orders', 'p3')],
        flows: [flow(['orders', 'p1'], { back: true, rate: 1.4 }), flow(['orders', 'p3'], { back: true, rate: 1.4 })],
        metrics: { errors: { v: '0%', tone: 'good' }, stale: '~1 s', hops: '0', healthy: '2 / 3' },
      },
    },
    {
      short: 'Mesh',
      kind: 'technique',
      title: 'Service mesh: discovery in a sidecar',
      body: [
        'A <b>service mesh</b> puts a small proxy (often Envoy) next to every instance. Services talk to their local proxy; the proxies handle discovery, load balancing, retries, timeouts, circuit breaking and mutual TLS, configured centrally by a control plane.',
        'Every language gets the same behaviour without libraries. The price: an extra proxy hop per call, more moving parts, and a control plane that must itself be highly available.',
      ],
      concepts: [
        { term: 'Service mesh', def: 'An infrastructure layer of sidecar proxies that handles service-to-service networking concerns.' },
        { term: 'Sidecar', def: 'A helper process deployed alongside each service instance, sharing its network.' },
      ],
      scene: {
        nodes: [
          caller(),
          box('side', -6, 3, 'proxy', 'grey', 'route', { size: [0.9, 0.9], height: 22 }),
          box('cp', -2, -8, 'Control plane', 'yellow', 'layers', { size: [1.4, 1.4], height: 36, tag: pill('routes · mTLS · retries', 'shield') }),
          ...fleet(() => ({ tag: pill('+ proxy', 'route') })),
        ],
        links: [link('orders', 'side'), link('cp', 'side', { style: 'dashed' }), ...ps.map((p) => link('side', p, { label: p === 'p2' ? pill('mTLS', 'lock') : undefined }))],
        flows: [...ps.map((p) => flow(['orders', 'side', p], { back: true, rate: 1 })), flow(['cp', 'side'], { kind: 'handshake', rate: 0.3 })],
        metrics: { errors: '0.05%', stale: '~1 s', hops: '+2 local', healthy: '3 / 3' },
      },
    },
    {
      short: 'Registry down',
      kind: 'tradeoff',
      title: 'When the registry itself is down',
      body: [
        'The registry cluster loses quorum for ten minutes. If callers looked up instances on every request, all inter-service traffic would stop — a tiny coordination system taking down everything.',
        'Design discovery to <b>fail static</b>: clients and proxies keep using the last known instance list (with their own health checking) while the registry is unavailable. Things can’t change for a while; they keep working.',
      ],
      note: { kind: 'key', text: 'The control plane can be down; the data plane must keep serving. Separate the two, and make the data plane survive on cached state.' },
      changes: [{ text: 'Registry down 10 min', tone: 'bad' }, { text: 'Calls continue on cached list', tone: 'good' }],
      scene: {
        nodes: [caller({ tag: pill('using last known list', 'clock', 'good') }), registry({ state: 'down', tag: pill('no quorum', 'alert', 'bad') }), ...fleet()],
        links: [link('orders', 'reg', { style: 'broken' }), ...ps.map((p) => link('orders', p))],
        flows: ps.map((p) => flow(['orders', p], { back: true, rate: 1.2 })),
        metrics: { errors: { v: '0.1%', tone: 'good' }, stale: { v: 'frozen', tone: 'warn' }, hops: '0', healthy: '3 / 3' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Names, not addresses',
      body: [
        'Elastic fleets need callers to resolve a service <b>name</b> to live instances. <b>DNS</b> is universal but slow to change; a <b>registry</b> with heartbeats and watches is fast and health-aware. Balance on the <b>client</b> for control or on the <b>server side</b> for simplicity — or let a <b>mesh</b> do it in sidecars.',
        'Register only when ready, deregister before shutdown, and make the data plane fail static when the registry is down.',
      ],
      scene: {
        nodes: [caller(), registry({ tag: pill('watched, cached', 'check', 'good') }), ...fleet()],
        links: [link('orders', 'reg', { style: 'dashed' }), ...ps.map((p) => link(p, 'reg', { style: 'dashed' })), ...ps.map((p) => link('orders', p))],
        flows: [...ps.map((p) => flow(['orders', p], { back: true, rate: 1 })), ...ps.map((p) => flow([p, 'reg'], { kind: 'handshake', rate: 0.3 }))],
        metrics: { errors: '0.1%', stale: '~1 s', hops: '0', healthy: '3 / 3' },
      },
    },
  ],
};

export default lesson;
