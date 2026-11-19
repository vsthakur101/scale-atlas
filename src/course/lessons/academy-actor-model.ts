import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const actor = (id: string, r: number, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, 'purple', 'cpu', { size: [1.2, 1.2], height: 28, ...extra });
const mailbox = (id: string, r: number, d: number, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, 'mailbox', 'yellow', 'queue', { size: [1.6, 0.9], height: 12, ...extra });

const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} KB`);
const fmtQ = (q: number): string => (q >= 1000 ? `${Math.round(q).toLocaleString('en-US')} messages` : q >= 10 ? `${q.toFixed(0)} messages` : `${q.toFixed(2)} messages`);

const lesson: Lesson = {
  slug: 'academy-actor-model',
  title: 'The Actor Model',
  blurb: 'Isolated state, mailboxes, one message at a time and supervision trees: concurrency without locks, and the new problems that come with it.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'hot', label: 'Hottest actor busy', icon: 'cpu' },
    { key: 'mbox', label: 'Its mailbox (average backlog)', icon: 'queue' },
    { key: 'fleet', label: 'Fleet CPU use', icon: 'gauge' },
    { key: 'mem', label: 'Memory for all actors', icon: 'disk' },
  ],
  goals: [
    { text: 'What an actor is: private state, a mailbox, a behaviour', step: 2 },
    { text: 'Why one message at a time removes locks', step: 3 },
    { text: 'Hot actors and unbounded mailboxes', step: 5 },
    { text: 'Supervision: let it crash', step: 6 },
    { text: 'When actors are the wrong tool', step: 8 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'hotrate', label: 'Messages/s to the hottest actor', min: 10, max: 10000, step: 10, default: 5000, unit: '/s', description: 'Arrival rate at the single busiest actor.' },
      { key: 'svc', label: 'Time to process a message', min: 10, max: 5000, step: 10, default: 100, unit: ' µs', description: 'Handler execution time per message.' },
      { key: 'actors', label: 'Actors in the system', min: 1000, max: 10000000, step: 1000, default: 100000, unit: '', description: 'Live actors, e.g. one per user, device or order.' },
      { key: 'avg', label: 'Average messages/s per actor', min: 0.01, max: 100, step: 0.01, default: 1, unit: '/s', description: 'Mean arrival rate across all actors.' },
      { key: 'cores', label: 'CPU cores', min: 1, max: 128, step: 1, default: 16, unit: '', description: 'Cores running the actor scheduler.' },
      { key: 'bytes', label: 'Memory per actor', min: 300, max: 5000, step: 100, default: 1000, unit: ' B', description: 'State plus mailbox and runtime overhead; a few hundred bytes to a few KB depending on runtime.' },
    ],
    calculate: (input, step) => {
      const hot = Math.max(1, input.hotrate ?? 5000);
      const svc = Math.max(1, input.svc ?? 100) / 1e6;
      const actors = Math.max(1, input.actors ?? 1e5);
      const avg = Math.max(0, input.avg ?? 1);
      const cores = Math.max(1, Math.round(input.cores ?? 16));
      const bytes = Math.max(1, input.bytes ?? 1000);
      const rho = hot * svc;
      // M/M/1 mean number waiting: ρ² ÷ (1 − ρ); an actor is a single server.
      const backlog = rho >= 1 ? Infinity : (rho * rho) / (1 - rho);
      const fleet = (actors * avg * svc) / cores;
      return {
        hot: step < 4 ? { v: '—' } : { v: `${(Math.min(rho, 9.99) * 100).toFixed(0)}%`, tone: rho < 0.6 ? 'good' : rho < 0.9 ? 'warn' : 'bad' },
        mbox: step < 4 ? { v: '—' } : Number.isFinite(backlog) ? { v: fmtQ(backlog), tone: backlog < 2 ? 'good' : backlog < 20 ? 'warn' : 'bad' } : { v: 'grows without bound', tone: 'bad' },
        fleet: step < 3 ? { v: '—' } : { v: `${(fleet * 100).toFixed(0)}%`, tone: fleet < 0.7 ? 'good' : fleet < 1 ? 'warn' : 'bad' },
        mem: step < 1 ? { v: '—' } : { v: fmtB(actors * bytes) },
      };
    },
  },
  steps: [
    {
      short: 'Shared state',
      kind: 'problem',
      title: 'Locks are the hard part of threads',
      body: [
        'The usual way to share work between threads is shared memory protected by locks. It works until it doesn’t: forgotten locks give races, inconsistent lock order gives deadlocks, coarse locks serialise everything, and none of it extends cleanly to more than one machine. Bugs appear only under load and are hard to reproduce.',
        'The <b>actor model</b> (Hewitt, 1973; popularised by Erlang and later Akka, Orleans, Pony) takes the opposite approach: <i>nothing is shared</i>. State lives inside an actor that nobody else can touch, and all interaction is by <b>sending messages</b>.',
      ],
      scene: { nodes: [box('t1', -8, -5, 'Thread 1', 'blue', 'cpu', { size: [1.2, 1.2], height: 26 }), box('t2', -8, 5, 'Thread 2', 'orange', 'cpu', { size: [1.2, 1.2], height: 26 }), box('mem', 8, 0, 'Shared memory + locks', 'red', 'lock', { size: [1.6, 1.6], height: 28, state: 'hot', tag: pill('races · deadlocks', 'alert', 'bad') })], links: [link('t1', 'mem'), link('t2', 'mem')], flows: [flow(['t1', 'mem'], { kind: 'write', rate: 1 }), flow(['t2', 'mem'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'An actor',
      kind: 'technique',
      title: 'State, a mailbox and a behaviour',
      body: [
        'An actor has three parts: <b>private state</b>, a <b>mailbox</b> (a queue of incoming messages) and a <b>behaviour</b> (what to do with each message). In response to a message it can do exactly three things: update its own state, <b>send messages</b> to other actors it knows, and <b>create new actors</b>.',
        'Actors are cheap — an Erlang process or an Akka actor is hundreds of bytes to a couple of kilobytes, not an OS thread — so you create <b>one per entity</b>: a user session, a device, a chat room, an order. A million actors at 1 KB each is about 1 GB, as the memory metric shows.',
      ],
      concepts: [{ term: 'Actor', def: 'A unit of computation with private state and a mailbox that processes messages one at a time and communicates only by sending messages.' }],
      scene: { nodes: [mailbox('mb', -8, 0), actor('a', 2, 0, 'Actor', { tag: pill('private state', 'lock') }), actor('b', 14, -4, 'Other actor'), actor('c', 14, 5, 'New actor', { tag: pill('created by A', 'bolt', 'good') })], links: [link('mb', 'a', { arrow: 'end' }), link('a', 'b', { arrow: 'end' }), link('a', 'c', { style: 'dashed', arrow: 'end' })], flows: [flow(['mb', 'a'], { rate: 1.5 }), flow(['a', 'b'], { rate: 1 })] },
    },
    {
      short: 'One at a time',
      kind: 'insight',
      title: 'Sequential inside, concurrent outside',
      body: [
        'Each actor handles <b>one message at a time</b>, to completion. Inside an actor the code is plain sequential programming — no locks, no races on its state, because no one else can reach it. Concurrency comes from having <i>many</i> actors processing their mailboxes at once, scheduled across cores by the runtime.',
        'Capacity is then simple arithmetic: <code>fleet CPU = actors × messages/s × time per message ÷ cores</code>. With 100,000 actors at 1 message/s, 100 µs a message and 16 cores that’s about 63%. Messages between actors are asynchronous: a sender doesn’t wait, so waiting on I/O in one actor doesn’t block another.',
      ],
      changes: [{ text: 'Single-threaded within an actor → no locks', tone: 'good' }, { text: 'Many actors in parallel → uses all cores', tone: 'good' }],
      scene: { nodes: [...[0, 1, 2].map((i) => actor(`a${i}`, 4, -6 + i * 6, `Actor ${i + 1}`, { load: 50 + i * 15 })), box('sched', -10, 0, 'Scheduler', 'teal', 'layers', { size: [1.3, 1.3], height: 26, tag: pill('N actors → M cores', 'cpu') })], links: [0, 1, 2].map((i) => link('sched', `a${i}`)), flows: [0, 1, 2].map((i) => flow(['sched', `a${i}`], { rate: 1.2 })) },
    },
    {
      short: 'Addresses',
      kind: 'technique',
      title: 'Location transparency',
      body: [
        'You send to an actor’s <b>address</b>, not a memory location. The runtime delivers the message whether the target is in the same process, another core, or another machine — so the same program scales from a laptop to a cluster, and failures between nodes are modelled as lost messages.',
        'Frameworks add routing: <b>virtual actors</b> (Orleans) activate one actor per id on demand and move it between nodes; <b>sharding</b> (Akka Cluster, Erlang libraries) places actors by key. Delivery is typically <i>at-most-once</i> and ordered per sender–receiver pair — anything stronger is built on top with acknowledgements and idempotent handlers.',
      ],
      changes: [{ text: 'Same code local or remote', tone: 'good' }, { text: 'At-most-once, ordered per sender → receiver', tone: 'info' }],
      scene: { nodes: [actor('a', -10, 0, 'Actor A'), box('rt', -1, 0, 'Runtime / network', 'teal', 'route', { size: [1.3, 1.3], height: 24, tag: pill('same node or remote', 'globe') }), actor('b', 12, -4, 'Actor B (node 1)'), actor('c', 12, 5, 'Actor C (node 2)')], links: [link('a', 'rt'), link('rt', 'b'), link('rt', 'c', { style: 'dashed' })], flows: [flow(['a', 'rt', 'b'], { rate: 1.2 }), flow(['a', 'rt', 'c'], { rate: 0.8 })] },
    },
    {
      short: 'Hot actor',
      kind: 'problem',
      title: 'One actor is one lane',
      body: [
        'The flip side of one-message-at-a-time: a single actor is a <b>single server with a queue</b>. If everything is routed to one actor — a global counter, a popular chat room, a “manager” — its throughput caps at <code>1 ÷ time per message</code> (10,000/s at 100 µs), and as utilisation approaches 100% the <b>mailbox backlog explodes</b>: <code>ρ² ÷ (1 − ρ)</code> messages waiting on average — 0.5 at 50% busy, 8 at 90%, 48 at 98%.',
        'Mailboxes are usually <b>unbounded</b>, so the failure isn’t an error — it’s memory growth and rising latency until the process dies. Mitigate with backpressure (bounded mailboxes, request/ask with timeouts), sharding the hot entity across several actors, batching, and monitoring mailbox length as a first-class metric.',
      ],
      changes: [{ text: 'ρ = rate × service time', tone: 'info' }, { text: '90% busy → ~8 waiting; 98% → ~48', tone: 'bad' }],
      scene: { nodes: [box('srcs', -12, 0, 'Many senders', 'green', 'users', { size: [1.4, 1.4], height: 24 }), mailbox('mb', -2, 0, { tag: pill('backlog growing', 'alert', 'bad') }), actor('hot', 8, 0, 'Hot actor', { state: 'hot', load: 100 })], links: [link('srcs', 'mb'), link('mb', 'hot')], flows: [flow(['srcs', 'mb'], { kind: 'heavy', rate: 4 }), flow(['mb', 'hot'], { rate: 1.2 })] },
    },
    {
      short: 'Supervision',
      kind: 'technique',
      title: 'Let it crash: supervision trees',
      body: [
        'Erlang’s philosophy: don’t write defensive code for every error — let the actor <b>crash</b> and have a <b>supervisor</b> restart it into a known-good state. Actors form a <b>tree</b>: each supervisor watches its children and applies a policy — restart just the failed one, restart all siblings, or escalate to <i>its</i> supervisor.',
        'Failure becomes a structured, local, recoverable event instead of a corrupted shared heap. Pair with restart limits and exponential backoff to avoid <b>restart storms</b>, and keep important state outside the crashing actor (a database, a snapshot, event-sourced journal) so a restart can recover it.',
      ],
      changes: [{ text: 'Child crashes → supervisor restarts it', tone: 'good' }, { text: 'Restart limits + backoff avoid storms', tone: 'info' }],
      concepts: [{ term: 'Supervision tree', def: 'A hierarchy in which parent actors monitor children and decide whether to restart, stop or escalate on failure.' }],
      scene: { nodes: [actor('sup', 0, -7, 'Supervisor', { tone: 'teal' }), actor('w1', -8, 4, 'Worker 1'), actor('w2', 0, 4, 'Worker 2', { state: 'down', tone: 'red', tag: pill('crashed', 'alert', 'bad') }), actor('w3', 8, 4, 'Worker 3')], links: [link('sup', 'w1'), link('sup', 'w2'), link('sup', 'w3')], flows: [flow(['sup', 'w2'], { kind: 'write', rate: 0.8 })] },
    },
    {
      short: 'Request/reply',
      kind: 'tradeoff',
      title: 'What gets harder',
      body: [
        '<b>Request–response</b> is no longer a function call: you send a message and handle the reply later, with a timeout, as another message. <b>Multi-actor transactions</b> (move money between two accounts) have no built-in atomicity — you need a saga, two-phase coordination or a single actor owning both. <b>Debugging</b> a flow spread over mailboxes needs distributed tracing, and <b>ordering</b> is only guaranteed per sender–receiver pair.',
        'These are the same problems as in any distributed system — the model just doesn’t hide them. In return you get isolation, explicit failure handling and a natural mapping to distributed deployment.',
      ],
      changes: [{ text: 'Async replies, timeouts, no cross-actor atomicity', tone: 'bad' }, { text: 'Isolation + explicit failure + distribution', tone: 'good' }],
      scene: { nodes: [actor('a', -8, 0, 'Account A', { tag: pill('debit', 'file') }), actor('b', 8, 0, 'Account B', { tag: pill('credit?', 'alert', 'warn') })], links: [link('a', 'b', { arrow: 'end', style: 'dashed' })], flows: [flow(['a', 'b'], { kind: 'write', rate: 0.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Isolate state, communicate by message, supervise failure',
      body: [
        'Actors keep state private, process one message at a time and talk only by asynchronous messages, so concurrency needs no locks and distribution is natural. Size them like queues: <b>ρ = rate × service time</b> per actor, fleet CPU = <b>actors × rate × time ÷ cores</b>, mailbox backlog <b>ρ² ÷ (1 − ρ)</b>.',
        'Use them for many independent entities (sessions, devices, game rooms, workflows) and fault-tolerant services; avoid them for CPU-bound parallel number crunching, single global hot spots and anything that needs cross-entity transactions. Figures here are queueing-model outputs for sizing.',
      ],
      scene: { nodes: [actor('sup', 0, -7, 'Supervisor', { tone: 'teal' }), ...[0, 1, 2].map((i) => actor(`w${i}`, -8 + i * 8, 4, `Actor ${i + 1}`)), mailbox('mb', -14, 4)], links: [link('sup', 'w0'), link('sup', 'w1'), link('sup', 'w2'), link('mb', 'w0', { arrow: 'end' })], flows: [flow(['mb', 'w0'], { rate: 1.2 })] },
    },
  ],
};

export default lesson;
