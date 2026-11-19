import type { Lesson } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const lesson: Lesson = {
  slug: 'source-load-balancer-realistic-use-cases',
  title: 'Load Balancers in the Real World',
  blurb: 'A load balancer is more than round-robin: it absorbs failure, chooses a route, and protects the service behind it.',
  minutes: 10,
  level: 'Intermediate',
  metrics: [
    { key: 'rps', label: 'Traffic', icon: 'activity' },
    { key: 'healthy', label: 'Healthy', icon: 'check' },
    { key: 'p99', label: 'p99', icon: 'timer' },
    { key: 'zone', label: 'Zones', icon: 'globe' },
  ],
  goals: [
    { text: 'Why health checks must test usefulness, not just process liveness', step: 2 },
    { text: 'How balancing policies respond to uneven work', step: 3 },
    { text: 'Why multi-zone routing and draining matter during change', step: 5 },
  ],
  legend: ['request', 'response', 'fail', 'handshake'],
  steps: [
    {
      short: 'One target',
      kind: 'problem',
      title: 'A single address hides a fleet',
      body: [
        'Clients should not know which app instance handles a request. They call one stable address; the load balancer chooses a healthy target and forwards the request.',
        'That indirection lets operators add capacity, remove a sick instance, and move traffic without changing every client.',
      ],
      concepts: [{ term: 'Load balancer', def: 'A traffic-distribution layer that selects a backend for each connection or request.' }],
      scene: {
        nodes: [crowd('users', -10, 1, 12, 'clients'), box('lb', 0, 0, 'Load balancer', 'orange', 'route'), box('app1', 8, -5, 'App A', 'blue', 'server'), box('app2', 8, 5, 'App B', 'blue', 'server')],
        links: [link('users', 'lb', { arrow: 'end' }), link('lb', 'app1', { arrow: 'end' }), link('lb', 'app2', { arrow: 'end' })],
        flows: [flow(['users', 'lb', 'app1'], { back: true, rate: 2 }), flow(['users', 'lb', 'app2'], { back: true, rate: 2 })],
        metrics: { rps: '4k/s', healthy: '2 / 2', p99: '42 ms', zone: '1' },
      },
    },
    {
      short: 'Health',
      kind: 'technique',
      title: 'A process can be alive and still be useless',
      body: [
        'A TCP port check only proves that something accepted a connection. A useful health check also verifies the dependency path the target needs: configuration loaded, database reachable, and the instance ready to serve.',
        'Checks must be cheap and conservative. If every check fans out into a database query, the health system becomes its own outage amplifier.',
      ],
      note: { kind: 'warn', text: 'Separate readiness from liveness: restart a wedged process with liveness, but remove a warming instance from traffic with readiness.' },
      concepts: [{ term: 'Readiness check', def: 'A signal that an instance is prepared to receive production traffic right now.' }],
      scene: {
        nodes: [box('lb', 0, 0, 'Load balancer', 'orange', 'route', { tag: pill('probe /ready', 'check') }), box('app', 8, 0, 'App server', 'blue', 'server', { tag: pill('DB unavailable', 'alert', 'bad'), state: 'down' }), db('db', 15, 0, 'Primary DB')],
        links: [link('lb', 'app', { arrow: 'end' }), link('app', 'db', { arrow: 'both' })],
        flows: [flow(['lb', 'app'], { kind: 'handshake', rate: 0.3 }), flow(['app', 'db'], { kind: 'fail', rate: 0.3 })],
        metrics: { rps: '4k/s', healthy: '1 / 2', p99: '48 ms', zone: '1' },
      },
    },
    {
      short: 'Policies',
      kind: 'technique',
      title: 'The best target depends on the work',
      body: [
        'Round-robin is fair when requests cost about the same. Least-connections helps when some requests stay open. Weighted routing lets a larger instance or a canary receive more traffic.',
        'For long-lived sessions, a hash of a stable key can keep a client near the same target. Treat stickiness as a constraint: it improves locality but can create hot spots and makes failover less flexible.',
      ],
      concepts: [{ term: 'Least-connections', def: 'A routing policy that prefers the target with the fewest active connections.' }],
      scene: {
        nodes: [crowd('users', -10, 1, 12, 'mixed requests'), box('lb', 0, 0, 'Router', 'orange', 'route', { tag: pill('least connections', 'scale') }), box('fast', 8, -5, 'Large app', 'blue', 'server', { tag: pill('weight 2×') }), box('small', 8, 5, 'Small app', 'blue', 'server', { tag: pill('weight 1×') })],
        links: [link('users', 'lb', { arrow: 'end' }), link('lb', 'fast', { arrow: 'end' }), link('lb', 'small', { arrow: 'end' })],
        flows: [flow(['users', 'lb', 'fast'], { back: true, rate: 2 }), flow(['users', 'lb', 'small'], { back: true, rate: 1 })],
        metrics: { rps: '4k/s', healthy: '2 / 2', p99: '38 ms', zone: '1' },
      },
    },
    {
      short: 'Drain',
      kind: 'technique',
      title: 'Stop new work before stopping an instance',
      body: [
        'During a deploy, the balancer marks an instance draining. New requests go elsewhere, while existing keep-alive connections and long requests finish within a deadline.',
        'Without draining, a rolling deploy cuts uploads, streaming responses, or checkout requests halfway through. With an unbounded drain, one bad request can delay the whole rollout forever.',
      ],
      note: { kind: 'tip', text: 'Set a maximum drain time, then make the application handle termination with a graceful shutdown path.' },
      scene: {
        nodes: [box('lb', 0, 0, 'Load balancer', 'orange', 'route', { tag: pill('draining App A', 'clock', 'warn') }), box('old', 8, -5, 'App A', 'blue', 'server', { state: 'dim', tag: pill('finish 3 requests') }), box('new', 8, 5, 'App B', 'green', 'server', { tag: pill('new traffic', 'check', 'good') })],
        links: [link('lb', 'old', { arrow: 'end', style: 'dashed' }), link('lb', 'new', { arrow: 'end' })],
        flows: [flow(['lb', 'old'], { back: true, rate: 0.4 }), flow(['lb', 'new'], { back: true, rate: 2 })],
        metrics: { rps: '4k/s', healthy: '1 + draining', p99: '44 ms', zone: '1' },
      },
    },
    {
      short: 'Zones',
      kind: 'case',
      title: 'Spread failure, not just requests',
      body: [
        'If every backend sits in one availability zone, a zone outage defeats a perfectly configured balancer. Put targets in multiple zones and keep enough spare capacity to carry traffic after one zone disappears.',
        'Cross-zone traffic can cost money and add latency, so route locally when healthy and fail over deliberately rather than pretending all targets are identical.',
      ],
      scene: {
        nodes: [crowd('users', -11, 1, 12, 'global users'), box('edge', -2, 0, 'Global entry', 'teal', 'globe'), box('lb-a', 7, -6, 'Zone A LB', 'orange', 'route'), box('lb-b', 7, 6, 'Zone B LB', 'orange', 'route'), box('apps', 14, 0, 'Fleet', 'blue', 'server', { tag: pill('headroom after one zone', 'check', 'good') })],
        links: [link('users', 'edge', { arrow: 'end' }), link('edge', 'lb-a', { arrow: 'end' }), link('edge', 'lb-b', { arrow: 'end' }), link('lb-a', 'apps', { arrow: 'end' }), link('lb-b', 'apps', { arrow: 'end' })],
        flows: [flow(['users', 'edge', 'lb-a', 'apps'], { back: true, rate: 1.5 }), flow(['users', 'edge', 'lb-b', 'apps'], { back: true, rate: 1.5 })],
        metrics: { rps: '4k/s', healthy: '2 zones', p99: '55 ms', zone: '2' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Routing is a reliability feature',
      body: [
        'A useful balancer combines selection, health, draining, and failure-domain awareness. Start with simple routing, then add a policy only when request cost, connection lifetime, or rollout safety demands it.',
        'Keep the balancer stateless where possible, make checks cheap, and preserve enough capacity to lose the failure domain you claim to tolerate.',
      ],
      scene: {
        nodes: [crowd('users', -10, 1, 12, 'clients'), box('lb', 0, 0, 'Traffic router', 'green', 'route', { tag: pill('healthy + draining + multi-zone', 'check', 'good') }), box('fleet', 9, 0, 'App fleet', 'blue', 'server')],
        links: [link('users', 'lb', { arrow: 'end' }), link('lb', 'fleet', { arrow: 'end' })],
        flows: [flow(['users', 'lb', 'fleet'], { back: true, rate: 2.5 })],
        metrics: { rps: '4k/s', healthy: 'ready targets', p99: '44 ms', zone: '2+' },
      },
    },
  ],
};

export default lesson;
