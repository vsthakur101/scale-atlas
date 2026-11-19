import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const pod = (id: string, r: number, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, 'blue', 'server', { size: [1.3, 1.3], height: 30, ...extra });
const proxy = (id: string, r: number, d: number, name = 'Sidecar proxy', extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, 'teal', 'shield', { size: [1, 1], height: 22, ...extra });
const ctl = (extra: Partial<SceneNode> = {}) => box('ctl', 0, -11, 'Control plane', 'purple', 'route', { size: [1.5, 1.5], height: 30, ...extra });

const fmtB = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

const lesson: Lesson = {
  slug: 'academy-how-sidecar-pattern-works',
  title: 'The Sidecar Pattern and Service Mesh',
  blurb: 'A proxy next to every service instance takes over mTLS, retries, routing and telemetry — what it buys, and the CPU, memory and latency it charges.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'lat', label: 'Added latency per request', icon: 'clock' },
    { key: 'cpu', label: 'Sidecar CPU (fleet)', icon: 'cpu' },
    { key: 'mem', label: 'Sidecar memory (fleet)', icon: 'disk' },
  ],
  goals: [
    { text: 'The cross-cutting problem a sidecar solves', step: 1 },
    { text: 'Data plane versus control plane', step: 3 },
    { text: 'What the mesh gives you for free', step: 4 },
    { text: 'The latency, CPU and memory bill', step: 5 },
    { text: 'When a library, ambient mesh or no mesh is better', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'pods', label: 'Service instances (pods)', min: 10, max: 5000, step: 10, default: 500, unit: '', description: 'Pods with a sidecar attached.' },
      { key: 'rps', label: 'Requests per second per pod', min: 1, max: 2000, step: 1, default: 200, unit: '/s', description: 'Traffic through each sidecar (in and out).' },
      { key: 'depth', label: 'Services called per user request', min: 1, max: 12, step: 1, default: 4, unit: '', description: 'Hops in the call chain behind one request.' },
      { key: 'hop', label: 'Latency per proxy traversal', min: 0.1, max: 5, step: 0.1, default: 1, unit: ' ms', description: 'Time added each time a request passes through a sidecar.' },
      { key: 'cpu', label: 'CPU per 1,000 req/s', min: 50, max: 1000, step: 50, default: 500, unit: ' mCPU', description: 'Proxy CPU cost, in thousandths of a core.' },
      { key: 'mem', label: 'Memory per sidecar', min: 20, max: 300, step: 10, default: 50, unit: ' MB', description: 'Resident memory of one proxy (grows with config size).' },
    ],
    calculate: (input, step) => {
      const pods = Math.max(1, input.pods ?? 500);
      const rps = Math.max(0, input.rps ?? 200);
      const depth = Math.max(1, Math.round(input.depth ?? 4));
      const hop = Math.max(0, input.hop ?? 1);
      const cpu = Math.max(0, input.cpu ?? 500);
      const mem = Math.max(1, input.mem ?? 50);
      // Each service-to-service call crosses the caller's sidecar (outbound) and the callee's (inbound).
      const lat = depth * 2 * hop;
      const cores = (pods * (rps / 1000) * cpu) / 1000;
      return {
        lat: step < 4 ? { v: '—' } : { v: `+${lat.toFixed(lat < 10 ? 1 : 0)} ms over ${depth} hops`, tone: lat < 5 ? 'good' : lat < 15 ? 'warn' : 'bad' },
        cpu: step < 4 ? { v: '—' } : { v: `${cores.toFixed(cores < 10 ? 1 : 0)} cores`, tone: cores < 20 ? 'good' : cores < 100 ? 'warn' : 'bad' },
        mem: step < 4 ? { v: '—' } : { v: fmtB(pods * mem * 1e6), tone: pods * mem * 1e6 < 2e10 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Same code',
      kind: 'problem',
      title: 'Every service re-implements the same plumbing',
      body: [
        'Calling another service safely needs a lot besides the call: TLS and identity, timeouts, retries with backoff, circuit breaking, load balancing, metrics and traces. If each team writes this into their service, it’s inconsistent, in several languages, and every fix has to be rolled out to every codebase.',
        'These are <b>cross-cutting concerns</b> — needed everywhere, unrelated to business logic. The question is where they should live.',
      ],
      scene: { nodes: [pod('a', -8, -5, 'Service A (Go)', { tag: pill('own retry logic', 'refresh', 'warn') }), pod('b', -8, 5, 'Service B (Java)', { tag: pill('different retry logic', 'refresh', 'warn') }), pod('c', 8, 0, 'Service C (Python)', { tag: pill('yet another', 'alert', 'bad') })], links: [link('a', 'c'), link('b', 'c')], flows: [flow(['a', 'c'], { rate: 1 }), flow(['b', 'c'], { rate: 1 })] },
    },
    {
      short: 'Sidecar',
      kind: 'technique',
      title: 'A helper process beside every instance',
      body: [
        'The <b>sidecar pattern</b> deploys a second container in the same pod (same network namespace, localhost) as the application. The app talks plainly to <code>localhost</code>; the sidecar — a proxy like Envoy — handles everything on the wire: encrypt, authenticate, retry, route, measure. The application doesn’t know it exists, and runs the same in any language.',
        'Traffic is redirected through the proxy transparently (iptables or eBPF rules). Upgrade the proxy and every service gets the new behaviour on its next restart, with no application change. Beyond meshes, sidecars also carry log shippers, secret fetchers and config reloaders.',
      ],
      concepts: [{ term: 'Sidecar', def: 'A helper container deployed alongside the main application container, sharing its lifecycle and network, that provides infrastructure features.' }],
      scene: { nodes: [pod('a', -9, 0, 'App A', { tag: pill('plain localhost call', 'bolt') }), proxy('pa', -3, 0, 'Sidecar'), proxy('pb', 6, 0, 'Sidecar'), pod('b', 12, 0, 'App B')], links: [link('a', 'pa'), link('pa', 'pb', { label: pill('mTLS', 'lock') }), link('pb', 'b')], flows: [flow(['a', 'pa', 'pb', 'b'], { rate: 1.5 })] },
    },
    {
      short: 'Planes',
      kind: 'technique',
      title: 'Data plane and control plane',
      body: [
        'The sidecars together are the <b>data plane</b>: they carry every request. A separate <b>control plane</b> (Istio’s istiod, Linkerd’s control components) holds the desired policy — routes, retry budgets, which service may call which, certificates — and pushes it to every proxy over an API (Envoy’s xDS). Proxies keep forwarding with their last config if the control plane goes down.',
        'This split is what makes a mesh manageable: you change a rule once, centrally, and the whole fleet follows within seconds. It also means the control plane must scale with the number of proxies and the size of the configuration each one receives.',
      ],
      changes: [{ text: 'Data plane: proxies carry traffic', tone: 'info' }, { text: 'Control plane: pushes config + certificates', tone: 'info' }],
      scene: { nodes: [ctl(), proxy('p1', -8, 4), proxy('p2', 0, 4), proxy('p3', 8, 4)], links: [link('ctl', 'p1', { style: 'dashed', arrow: 'end' }), link('ctl', 'p2', { style: 'dashed', arrow: 'end' }), link('ctl', 'p3', { style: 'dashed', arrow: 'end' })], flows: [flow(['ctl', 'p1'], { kind: 'write', rate: 0.8 }), flow(['ctl', 'p2'], { kind: 'write', rate: 0.8 }), flow(['ctl', 'p3'], { kind: 'write', rate: 0.8 })] },
    },
    {
      short: 'What you get',
      kind: 'insight',
      title: 'Security, resilience and visibility without code changes',
      body: [
        '<b>mTLS everywhere</b>: the mesh issues each workload a short-lived certificate tied to its identity and encrypts and authenticates every call, enabling “service A may call B” policy instead of IP allowlists. <b>Traffic control</b>: timeouts, retries with budgets, circuit breaking, canary splits (5% to the new version), fault injection. <b>Observability</b>: uniform request metrics, access logs and trace spans for every hop.',
        'Uniformity is the real benefit: the same behaviour across all languages, configured declaratively, with consistent telemetry — which is hard to achieve any other way across a polyglot fleet.',
      ],
      changes: [{ text: 'mTLS + identity-based policy', tone: 'good' }, { text: 'Retries, timeouts, breakers, canaries', tone: 'good' }, { text: 'Uniform metrics and traces', tone: 'good' }],
      scene: { nodes: [pod('a', -9, 0, 'App A'), proxy('pa', -3, 0, 'Sidecar', { tag: pill('mTLS · retries · metrics', 'shield', 'good') }), proxy('pb', 6, 0), pod('b', 12, 0, 'App B v2', { tag: pill('5% canary', 'refresh') })], links: [link('a', 'pa'), link('pa', 'pb'), link('pb', 'b')], flows: [flow(['a', 'pa', 'pb', 'b'], { rate: 1.5 })] },
    },
    {
      short: 'The bill',
      kind: 'tradeoff',
      title: 'Latency, CPU and memory — multiplied by the fleet',
      body: [
        'Every call between services crosses <b>two proxies</b> (the caller’s outbound, the callee’s inbound), each adding processing time — about a millisecond in this model, usually well under that for light configs and more with heavy policy. A request that fans through 4 services pays 4 × 2 × 1 = <b>~8 ms</b> extra. Each sidecar also costs memory (50 MB here) and CPU in proportion to traffic.',
        'Across 500 pods at 200 req/s and 500 mCPU per 1,000 req/s that is <b>~50 cores and 25 GB</b> of overhead — real money, and often a bigger line item than the control plane. Tail latency matters too: an extra hop adds to every percentile. Sliders let you see which of depth, per-hop cost or fleet size dominates for your system.',
      ],
      changes: [{ text: '4 hops × 2 proxies × 1 ms ≈ +8 ms', tone: 'bad' }, { text: '500 pods: ~50 cores, ~25 GB', tone: 'bad' }],
      scene: { nodes: [pod('a', -9, 0, 'App A'), proxy('pa', -3, 0, 'Sidecar', { load: 40, tag: pill('+1 ms', 'clock', 'warn') }), proxy('pb', 6, 0, 'Sidecar', { load: 40, tag: pill('+1 ms', 'clock', 'warn') }), pod('b', 12, 0, 'App B')], links: [link('a', 'pa'), link('pa', 'pb'), link('pb', 'b')], flows: [flow(['a', 'pa', 'pb', 'b'], { rate: 1.5 })] },
    },
    {
      short: 'Failure modes',
      kind: 'problem',
      title: 'New ways to fail',
      body: [
        '<b>Start-up order</b>: the app starts before its sidecar is ready and its first calls fail (or the sidecar exits first and in-flight shutdown calls fail). <b>Misconfiguration blast radius</b>: a bad route pushed by the control plane breaks every service at once. <b>Retry amplification</b>: mesh retries plus application retries multiply load on a struggling service — keep retry budgets and set them in one layer, not two.',
        'And <b>debugging gets indirect</b>: is the failure in the app, in its sidecar, in the callee’s sidecar, or the policy between them? Good meshes expose proxy metrics and config dumps for exactly this; roll config out gradually and validate before pushing.',
      ],
      changes: [{ text: 'Retries in app and mesh multiply', tone: 'bad' }, { text: 'Roll out mesh config gradually', tone: 'good' }],
      scene: { nodes: [ctl({ tag: pill('bad route pushed', 'alert', 'bad') }), proxy('p1', -8, 4, undefined, { state: 'hot' }), proxy('p2', 0, 4, undefined, { state: 'hot' }), proxy('p3', 8, 4, undefined, { state: 'hot' })], links: [link('ctl', 'p1', { style: 'dashed' }), link('ctl', 'p2', { style: 'dashed' }), link('ctl', 'p3', { style: 'dashed' })], flows: [flow(['ctl', 'p1'], { kind: 'fail', rate: 0.8 }), flow(['ctl', 'p2'], { kind: 'fail', rate: 0.8 }), flow(['ctl', 'p3'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Alternatives',
      kind: 'tradeoff',
      title: 'Library, ambient mesh, or no mesh',
      body: [
        '<b>Client library</b> (gRPC interceptors, Finagle, Resilience4j): no extra hop or process, lowest latency — but one implementation per language and upgrades need redeploys. <b>Ambient / node-level mesh</b> (Istio ambient, Cilium with eBPF): move L4 encryption and identity into a per-node agent and add per-namespace L7 proxies only where needed, cutting per-pod overhead at the cost of a shared component.',
        'A mesh pays off with many services, several languages, and a need for uniform mTLS and policy. For a handful of services in one language, a library plus a good load balancer is simpler and cheaper. Decide on the bill above against the consistency you need. Figures here are model outputs, not product benchmarks.',
      ],
      scene: { nodes: [box('lib', -8, -5, 'Client library', 'blue', 'layers', { size: [1.3, 1.3], height: 24, tag: pill('no extra hop', 'bolt', 'good') }), box('side', 8, -5, 'Sidecar mesh', 'teal', 'shield', { size: [1.3, 1.3], height: 26, tag: pill('uniform, costly', 'gauge', 'warn') }), box('amb', 0, 6, 'Ambient / per-node', 'purple', 'server', { size: [1.3, 1.3], height: 26, tag: pill('less per-pod cost', 'check') })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Move plumbing out of the app — and pay for it',
      body: [
        'A <b>sidecar</b> runs beside each service instance and handles mTLS, retries, routing and telemetry; a <b>control plane</b> configures all of them centrally. You gain uniform security, resilience and visibility across languages without code changes.',
        'You pay <b>two proxy traversals per call</b>, CPU and memory in every pod, and new failure modes (start-up order, config blast radius, retry stacking). Choose a mesh when the fleet is large and polyglot; otherwise a library or a lighter ambient design may be a better fit.',
      ],
      scene: { nodes: [ctl(), pod('a', -8, 4, 'App'), proxy('p1', -3, 4), proxy('p2', 5, 4), pod('b', 10, 4, 'App'), db('tel', 0, 11, 'Telemetry', { size: [1.2, 1.2] })], links: [link('ctl', 'p1', { style: 'dashed' }), link('ctl', 'p2', { style: 'dashed' }), link('a', 'p1'), link('p1', 'p2'), link('p2', 'b')], flows: [flow(['a', 'p1', 'p2', 'b'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
