import type { Lesson } from '../../types';
import { box, crowd, db, disk, flow, link, pill, you } from '../kit';

const lesson: Lesson = {
  slug: 'source-how-to-transform-a-system-to-be-cloud-native',
  title: 'How to Transform a System to be Cloud Native',
  blurb: 'Move from fragile host-specific operations to small, replaceable services with declarative infrastructure and resilient delivery.',
  minutes: 12,
  level: 'Advanced',
  metrics: [
    { key: 'deploy', label: 'Deploy time', icon: 'timer' },
    { key: 'zones', label: 'Zones', icon: 'globe' },
    { key: 'state', label: 'Local state', icon: 'disk' },
    { key: 'recover', label: 'Recovery', icon: 'refresh' },
  ],
  goals: [
    { text: 'Separate infrastructure goals from container or Kubernetes adoption', step: 2 },
    { text: 'Externalise configuration and state before splitting services', step: 3 },
    { text: 'Make every instance disposable and observable', step: 5 },
    { text: 'Roll out incrementally and preserve a rollback path', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'fail', 'handshake'],
  steps: [
    {
      short: 'The problem',
      kind: 'problem',
      title: 'The system is coupled to where it happens to run',
      body: [
        'A monolithic application starts on one machine, writes files beside the process, reads machine-specific configuration, and needs its host to stay healthy. The application is technically online, but it cannot move without manual work.',
        'Cloud native is not a <i>word for containers</i>. It is an operating model: workloads are replaceable, infrastructure is declared, state has an owned service boundary, and failure is continuously rehearsed.',
      ],
      note: { kind: 'key', text: 'Start with the property you want—fast recovery, independent deployment, elastic capacity—then choose the smallest mechanism that provides it.' },
      concepts: [
        { term: 'Cloud native', def: 'An operating model built around resilient, observable, automatically managed, and usually containerised workloads.' },
        { term: 'Immutable infrastructure', def: 'Infrastructure replaced as a new version rather than repaired and changed in place.' },
      ],
      scene: {
        nodes: [you('client', -10, 1), box('host', 0, 0, 'Specific host', 'orange', 'server', { tag: pill('manual repair', 'alert', 'bad') }), disk('files', 9, 0, 'Local files')],
        links: [link('client', 'host', { arrow: 'both' }), link('host', 'files', { arrow: 'both' })],
        flows: [flow(['client', 'host', 'files'], { back: true, rate: 1 })],
        metrics: { deploy: '—', zones: '1', state: 'on host', recover: 'manual' },
      },
    },
    {
      short: 'Strangler',
      kind: 'technique',
      title: 'Transform behind a stable edge',
      body: [
        'Put a routing layer in front of the existing system and move one user-visible capability at a time. The new route can run beside the old route, while the rest of traffic continues unchanged.',
        'This <b>strangler pattern</b> avoids a risky rewrite. A migration is complete when the old implementation is no longer on the critical path, not when every source file has moved.',
      ],
      concepts: [
        { term: 'Strangler pattern', def: 'Incrementally replacing a legacy system by routing selected capabilities to a new implementation.' },
        { term: 'Canary', def: 'Routing a small portion of traffic to a new implementation before increasing its share.' },
      ],
      scene: {
        nodes: [crowd('users', -10, 1, 10, 'traffic'), box('edge', 0, 0, 'Routing edge', 'orange', 'route'), box('old', 8, -5, 'Legacy path', 'grey', 'server'), box('new', 8, 5, 'Cloud-native path', 'green', 'server')],
        links: [link('users', 'edge', { arrow: 'end' }), link('edge', 'old', { arrow: 'end' }), link('edge', 'new', { arrow: 'end', label: pill('5%') })],
        flows: [flow(['users', 'edge', 'old'], { back: true, rate: 2 }), flow(['users', 'edge', 'new'], { back: true, rate: 0.3 })],
        metrics: { deploy: '1 capability', zones: '1', state: 'split', recover: 'route back' },
      },
    },
    {
      short: 'Externalise',
      kind: 'technique',
      title: 'Move configuration and durable state out',
      body: [
        'Inject configuration through environment variables or a secret/config service. Do not bake environment names into the image or require a login to a host at startup.',
        'A container is not durable storage. Put databases, object stores, queues, and logs behind managed or explicitly replicated services; keep only ephemeral scratch files inside the workload.',
      ],
      note: { kind: 'tip', text: 'Secrets should be encrypted, scoped, rotated, and delivered without being committed to an image or repository.' },
      concepts: [
        { term: 'Twelve-factor app', def: 'A set of operational principles including declarative configuration, stateless processes, and backing-service portability.' },
        { term: 'Ephemeral disk', def: 'Local storage that may disappear whenever an instance is replaced or rescheduled.' },
      ],
      scene: {
        nodes: [box('app', -2, 0, 'Application', 'blue', 'server'), box('config', -9, 5, 'Config', 'yellow', 'lock'), box('db', 8, -5, 'Managed database', 'purple', 'db'), box('blob', 8, 5, 'Object storage', 'teal', 'disk')],
        links: [link('config', 'app', { arrow: 'end' }), link('app', 'db', { arrow: 'both' }), link('app', 'blob', { arrow: 'both' })],
        flows: [flow(['config', 'app'], { kind: 'handshake', rate: 0.5 }), flow(['app', 'db'], { back: true, rate: 1.2, kind: 'write' }), flow(['app', 'blob'], { back: true, rate: 0.8 })],
        metrics: { deploy: 'image + config', zones: '2', state: 'external', recover: 'replace app' },
      },
    },
    {
      short: 'Stateless',
      kind: 'insight',
      title: 'Make each instance interchangeable',
      body: [
        'Instances should be able to start in any healthy zone, receive traffic, and disappear without keeping a user’s session in memory. Store sessions, locks, uploads, and work acknowledgements in shared or purpose-built services.',
        'This does not mean every operation is stateless. It means the process instance owns no unique state that is required for correct service during or after rescheduling.',
      ],
      changes: [{ text: 'No host affinity', tone: 'good' }, { text: 'Shared state out-of-process', tone: 'good' }],
      concepts: [
        { term: 'Stateless service', def: 'A service whose individual instances do not retain data required by later requests.' },
        { term: 'Horizontal scaling', def: 'Adding identical instances to increase capacity or fault tolerance.' },
      ],
      scene: {
        nodes: [crowd('users', -10, 1, 12, 'requests'), box('lb', 0, 0, 'Load balancer', 'orange', 'route'), box('a', 8, -5, 'Instance A', 'blue', 'server'), box('b', 8, 5, 'Instance B', 'blue', 'server'), db('store', 15, 0, 'Shared state')],
        links: [link('users', 'lb', { arrow: 'end' }), link('lb', 'a', { arrow: 'end' }), link('lb', 'b', { arrow: 'end' }), link('a', 'store', { arrow: 'both' }), link('b', 'store', { arrow: 'both' })],
        flows: [flow(['users', 'lb', 'a'], { back: true, rate: 1.5 }), flow(['users', 'lb', 'b'], { back: true, rate: 1.5 })],
        metrics: { deploy: 'replace one', zones: '2', state: 'shared', recover: 'automatic' },
      },
    },
    {
      short: 'Observe',
      kind: 'technique',
      title: 'Every replacement needs liveness and readiness',
      body: [
        'Liveness answers whether to restart a process. Readiness answers whether to send traffic. An instance can be alive while blocked on configuration or a dependency and should not receive work.',
        'Emit structured logs, distributed traces, and service-level metrics. One container log stream is not enough once requests cross load balancers, queues, databases, and several replicas.',
      ],
      note: { kind: 'warn', text: 'A health check that always returns success hides outages. One that checks every dependency synchronously can remove every replica together.' },
      concepts: [
        { term: 'Readiness', def: 'The signal that an instance is prepared to accept production traffic.' },
        { term: 'SLO', def: 'A target for a measurable service outcome, such as availability or latency.' },
      ],
      scene: {
        nodes: [box('control', -9, 0, 'Controller', 'orange', 'route', { tag: pill('probe', 'search') }), box('app', 0, 0, 'Instance', 'blue', 'server', { load: 55, tag: pill('ready', 'check', 'good') }), box('trace', 9, 0, 'Metrics & traces', 'purple', 'search')],
        links: [link('control', 'app', { arrow: 'both', label: pill('/live · /ready') }), link('app', 'trace', { arrow: 'end' })],
        flows: [flow(['control', 'app'], { kind: 'handshake', rate: 0.8 }), flow(['app', 'trace'], { kind: 'response', rate: 1.2 })],
        metrics: { deploy: 'probe-based', zones: '2', state: 'shared', recover: 'restart / reschedule' },
      },
    },
    {
      short: 'Resilience',
      kind: 'case',
      title: 'A zone disappears',
      body: [
        'Assume traffic is equally distributed across two zones, then make one unavailable. Instances in the healthy zone absorb the request load, shared state remains reachable, and a new instance is scheduled in a third zone or remaining domain.',
        'The test passes only if latency stays within the SLO and no work is duplicated. Replication, queues, timeouts, and retry limits must be tested together rather than as isolated infrastructure features.',
      ],
      changes: [{ text: 'Zone A lost', tone: 'bad' }, { text: 'Zone B absorbs traffic', tone: 'good' }, { text: 'Data remains durable', tone: 'good' }],
      concepts: [
        { term: 'Failure domain', def: 'A set of components likely to fail together, such as a rack or availability zone.' },
        { term: 'Idempotency', def: 'A repeated operation produces the same logical result rather than an additional side effect.' },
      ],
      scene: {
        nodes: [crowd('users', -11, 1, 14, 'traffic'), box('z1', 0, -6, 'Zone A', 'red', 'server', { state: 'down' }), box('z2', 0, 6, 'Zone B', 'green', 'server', { load: 80 }), db('db', 9, 0, 'Replicated state')],
        links: [link('users', 'z1', { arrow: 'end', style: 'broken' }), link('users', 'z2', { arrow: 'both' }), link('z2', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'z2', 'db'], { back: true, rate: 2.5 }), flow(['users', 'z1'], { kind: 'fail', rate: 0.4 })],
        metrics: { deploy: 'unaffected', zones: '1 of 2', state: 'replicated', recover: 'reschedule' },
      },
    },
    {
      short: 'Roll out',
      kind: 'tradeoff',
      title: 'Release gradually, with a reversible artifact',
      body: [
        'Promote an immutable build artifact through environments. Use canaries or rolling deployments, compare latency and errors against the existing version, then expand or roll back.',
        'Blue/green is simple to switch but consumes duplicate capacity. Rolling reduces capacity but requires backward-compatible database and configuration changes. Canary gives the most evidence but needs strong routing and observability.',
      ],
      note: { kind: 'tip', text: 'Database migrations must be forward-compatible with both the old and new application; never make rollback depend on reversing a destructive migration.' },
      concepts: [
        { term: 'Immutable artifact', def: 'A built package whose contents cannot change as it moves through environments.' },
        { term: 'Rollback', def: 'Moving traffic and configuration back to a known-good release after a failed change.' },
      ],
      scene: {
        nodes: [box('ci', -9, 0, 'Build once', 'yellow', 'box'), box('edge', 0, 0, 'Traffic split', 'orange', 'route'), box('old', 8, -5, 'Current', 'grey', 'server'), box('new', 8, 5, 'Canary', 'green', 'server', { tag: pill('5%', 'gauge') })],
        links: [link('ci', 'edge', { arrow: 'end' }), link('edge', 'old', { arrow: 'end' }), link('edge', 'new', { arrow: 'end' })],
        flows: [flow(['edge', 'old'], { back: true, rate: 2 }), flow(['edge', 'new'], { back: true, rate: 0.3 })],
        metrics: { deploy: '5% → 100%', zones: '2+', state: 'compatible', recover: 'route back' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Adopt cloud native capabilities in the right order',
      body: [
        'First make the current system observable and repeatably deployable. Then externalise configuration and durable state, remove host affinity, automate replacement, split only proven capabilities, and add orchestration after the operating model is clear.',
        'A successful transformation is not measured by Kubernetes adoption. It is measured by faster reversible changes, bounded failure, lower manual repair, and service-level objectives that remain true across failures.',
      ],
      scene: {
        nodes: [box('edge', -9, 0, 'Measured delivery', 'green', 'check'), box('app', 0, 0, 'Replaceable app', 'blue', 'server'), box('state', 9, -5, 'Owned state', 'purple', 'db'), box('ops', 9, 5, 'Automated operations', 'orange', 'route')],
        links: [link('edge', 'app', { arrow: 'end' }), link('app', 'state', { arrow: 'both' }), link('ops', 'app', { arrow: 'both' })],
        flows: [flow(['edge', 'app', 'state'], { back: true, rate: 1.5 }), flow(['ops', 'app'], { kind: 'handshake', back: true, rate: 0.8 })],
        metrics: { deploy: 'repeatable', zones: 'multiple', state: 'owned', recover: 'automated' },
      },
    },
  ],
};

export default lesson;
