import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const wa = (extra: Partial<SceneNode> = {}) => box('a', -13, -6, 'Worker A', 'blue', 'server', { size: [1.2, 1.2], height: 28, ...extra });
const wb = (extra: Partial<SceneNode> = {}) => box('b', -13, 6, 'Worker B', 'orange', 'server', { size: [1.2, 1.2], height: 28, ...extra });
const lock = (extra: Partial<SceneNode> = {}) => box('lock', -1, 0, 'Lock service', 'purple', 'lock', { size: [1.4, 1.4], height: 32, ...extra });
const res = (extra: Partial<SceneNode> = {}) => db('res', 12, 0, 'Shared resource', { size: [1.4, 1.4], ...extra });

const fmtD = (n: number): string => (n >= 100 ? `${Math.round(n)}` : n >= 1 ? n.toFixed(1) : n >= 0.01 ? n.toFixed(2) : n.toExponential(1));

const lesson: Lesson = {
  slug: 'source-why-use-a-distributed-lock',
  title: 'Distributed Locks and Fencing Tokens',
  blurb: 'Why a lock across machines needs a lease, why a lease is not enough, and how a monotonically increasing fencing token makes the resource itself the final judge.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'overlap', label: 'Unsafe overlaps / day (lease only)', icon: 'alert' },
    { key: 'fenced', label: 'Corrupting writes (with fencing)', icon: 'shield' },
    { key: 'tput', label: 'Max operations / s per lock', icon: 'gauge' },
  ],
  goals: [
    { text: 'When you need mutual exclusion across machines', step: 1 },
    { text: 'Why locks need a lease (TTL) and what it costs', step: 3 },
    { text: 'How a paused holder breaks mutual exclusion', step: 4 },
    { text: 'Fencing tokens as the real safety mechanism', step: 5 },
    { text: 'Choosing a lock service and the alternatives to locking', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'ttl', label: 'Lease duration (TTL)', min: 1, max: 60, step: 1, default: 10, unit: ' s', description: 'How long the lock service honours the lock without renewal.' },
      { key: 'work', label: 'Time in critical section', min: 10, max: 5000, step: 10, default: 200, unit: ' ms', description: 'How long the holder works while holding the lock.' },
      { key: 'stalls', label: 'Process stalls per hour', min: 0, max: 60, step: 1, default: 2, unit: '', description: 'GC pauses, VM freezes, swapping or network partitions that freeze a worker.' },
      { key: 'stall', label: 'Mean stall length', min: 0.1, max: 20, step: 0.1, default: 3, unit: ' s', description: 'Average duration of such a stall (exponentially distributed).' },
      { key: 'ops', label: 'Lock acquisitions per day', min: 1000, max: 10000000, step: 1000, default: 100000, unit: '', description: 'How often the lock is taken.' },
      { key: 'rtt', label: 'Lock service round trip', min: 1, max: 50, step: 1, default: 2, unit: ' ms', description: 'Time for one acquire or release call.' },
    ],
    calculate: (input, step) => {
      const ttl = Math.max(1, input.ttl ?? 10);
      const work = Math.max(0.01, (input.work ?? 200) / 1000);
      const stalls = Math.max(0, input.stalls ?? 2);
      const stall = Math.max(0.1, input.stall ?? 3);
      const ops = Math.max(1, input.ops ?? 1e5);
      const rtt = Math.max(0.1, input.rtt ?? 2) / 1000;
      // A stall begins inside the critical section with probability λ·work, and outlasts the lease with probability e^(−ttl/mean).
      const perOp = (stalls / 3600) * work * Math.exp(-ttl / stall);
      const perDay = perOp * ops;
      const tput = 1 / (work + 2 * rtt);
      return {
        overlap: step < 3 ? { v: '—' } : { v: fmtD(perDay), tone: perDay < 0.01 ? 'good' : perDay < 1 ? 'warn' : 'bad' },
        fenced: step < 4 ? { v: '—' } : { v: '0 (stale writes rejected)', tone: 'good' },
        tput: step < 2 ? { v: '—' } : { v: `${tput.toFixed(tput < 10 ? 1 : 0)}/s`, tone: tput < 5 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'Two workers, one thing that must not be done twice',
      body: [
        'Several workers run the same cron job; two replicas of a service race to refresh the same cache; two requests try to allocate the last seat. Inside one process a mutex solves this. Across machines there is <b>no shared memory</b> — only messages that can be delayed, lost or reordered.',
        'A <b>distributed lock</b> gives mutual exclusion through a shared service: whoever holds the lock may proceed, everyone else waits or backs off. It sounds simple, and it is — until you ask what happens when the holder <i>crashes</i> or <i>freezes</i> while holding it.',
      ],
      scene: { nodes: [wa({ tag: pill('both want to run', 'bolt') }), wb(), res({ tag: pill('must be exclusive', 'lock', 'warn') })], links: [link('a', 'res'), link('b', 'res')], flows: [flow(['a', 'res'], { kind: 'write', rate: 1 }), flow(['b', 'res'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Basic lock',
      kind: 'technique',
      title: 'Acquire, work, release — through a service',
      body: [
        'Workers ask a lock service — Redis, ZooKeeper, etcd, or a database row — for a named lock. The service grants it to one caller atomically (Redis <code>SET key value NX</code>; a unique-key insert; a compare-and-set). The holder does its work and then releases. Everyone else gets a refusal and retries or skips.',
        'Each acquire and release is a network round trip, so the lock caps throughput at about <code>1 ÷ (work + 2 × RTT)</code> operations a second <i>per lock name</i> — 200 ms of work allows ~5/s. Holding a lock longer than necessary, or taking one global lock for everything, makes it the system’s bottleneck.',
      ],
      changes: [{ text: 'One holder at a time per lock name', tone: 'good' }, { text: 'Throughput ≤ 1 ÷ (work + 2 RTT)', tone: 'info' }],
      scene: { nodes: [wa({ tag: pill('holds lock', 'lock', 'good') }), wb({ tag: pill('refused, retries', 'refresh') }), lock(), res()], links: [link('a', 'lock', { arrow: 'both' }), link('b', 'lock', { arrow: 'both', style: 'dashed' }), link('a', 'res')], flows: [flow(['a', 'lock'], { rate: 1 }), flow(['a', 'res'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Lease',
      kind: 'technique',
      title: 'A lock without an expiry is a deadlock waiting to happen',
      body: [
        'If the holder crashes without releasing, nobody can ever proceed. So locks are granted as <b>leases</b>: valid for a TTL (say 10 s), after which the service considers them free. A live holder extends the lease by renewing it; a dead one simply stops, and the lock frees itself.',
        'The TTL is a dial with a cost on each side. Too short and a slow-but-healthy holder loses the lock mid-work; too long and a crashed holder blocks everyone for the full TTL. Choose it from the worst plausible critical-section time, plus a safety factor, plus renewal at a fraction (usually a third) of the TTL.',
      ],
      changes: [{ text: 'TTL too short → healthy holder loses lock', tone: 'bad' }, { text: 'TTL too long → crash blocks others for the TTL', tone: 'bad' }],
      concepts: [{ term: 'Lease', def: 'A lock or grant that is valid for a limited time and must be renewed, so a failed holder cannot block others forever.' }],
      scene: { nodes: [wa({ tag: pill('renews at TTL/3', 'refresh') }), lock({ tag: pill('lease: 10 s', 'clock') }), res()], links: [link('a', 'lock', { arrow: 'both' }), link('a', 'res')], flows: [flow(['a', 'lock'], { rate: 0.6 }), flow(['a', 'res'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Pause',
      kind: 'problem',
      title: 'The frozen holder who thinks it still has the lock',
      body: [
        'Worker A acquires the lock, then suffers a 15-second stop-the-world GC pause (or a VM migration, or a network partition). The lease expires; worker B acquires the lock and starts writing. A wakes up, still <i>believes</i> it holds the lock — its check passed before the pause — and writes too. <b>Two writers, no exclusion, corrupted data.</b>',
        'No timeout tuning fully removes this, because the holder cannot know about its own pause. The model above gives the odds: a stall must start inside the critical section <i>and</i> outlast the lease. With 2 stalls an hour averaging 3 s, a 10 s TTL and 200 ms of work, each acquisition has ~4×10⁻⁶ chance — about <b>0.4 events a day</b> at 100,000 acquisitions. Rare, but not never, and it happens exactly when the system is under stress.',
      ],
      changes: [{ text: 'Pause > TTL → B enters while A still believes it holds the lock', tone: 'bad' }, { text: 'No timer on the holder can prevent it', tone: 'bad' }],
      scene: { nodes: [wa({ tag: pill('paused 15 s…', 'pause', 'bad'), state: 'hot' }), wb({ tag: pill('got the lock, writing', 'lock', 'good') }), lock({ tag: pill('lease expired', 'clock', 'warn') }), res({ state: 'hot', tag: pill('two writers', 'alert', 'bad') })], links: [link('a', 'res', { style: 'dashed' }), link('b', 'lock', { arrow: 'both' }), link('b', 'res')], flows: [flow(['b', 'res'], { kind: 'write', rate: 1.2 }), flow(['a', 'res'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Fencing',
      kind: 'technique',
      title: 'Fencing tokens: let the resource decide',
      body: [
        'Make the lock service hand out a <b>monotonically increasing number</b> with every grant — 33 to A, then 34 to B. Every write to the shared resource carries the token, and the resource <b>rejects any token lower than the highest it has seen</b>. When the stale A finally writes with 33, the resource has already accepted 34 and refuses it.',
        'The safety no longer depends on the holder’s clock or on timing assumptions; it depends on the one place that can enforce order — the resource. It requires the resource (database, storage service) to check tokens, which is easy with a conditional write (<code>UPDATE … WHERE version &lt; token</code>) and impossible if the resource is an external system you don’t control. Then the lock is only an <i>efficiency</i> optimisation, not a correctness guarantee.',
      ],
      changes: [{ text: 'A: token 33 · B: token 34 → resource rejects 33', tone: 'good' }, { text: 'Correctness enforced by the resource', tone: 'good' }],
      note: { kind: 'key', text: 'A lock with a lease gives efficiency. A lock with fencing gives correctness.' },
      concepts: [{ term: 'Fencing token', def: 'A number that increases with each lock grant; the protected resource refuses writes carrying an older number than one it has already seen.' }],
      scene: { nodes: [wa({ tag: pill('token 33', 'hash', 'warn') }), wb({ tag: pill('token 34', 'hash', 'good') }), lock({ tag: pill('issues 33, 34, 35…', 'hash') }), res({ tag: pill('rejects < 34', 'shield', 'good') })], links: [link('a', 'res', { style: 'broken' }), link('b', 'res'), link('lock', 'a', { arrow: 'end', style: 'dashed' }), link('lock', 'b', { arrow: 'end' })], flows: [flow(['b', 'res'], { kind: 'write', rate: 1.2 }), flow(['a', 'res'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Services',
      kind: 'tradeoff',
      title: 'Where the lock lives',
      body: [
        '<b>Single Redis</b> (<code>SET NX PX</code>): fast and simple, but if the node fails over asynchronously, a replica without the lock can be promoted and a second client gets it. <b>Redlock</b> (majority of several independent Redis nodes) improves on that, though its safety still rests on bounded clock drift and pauses — a known point of dispute — and it provides no fencing token.',
        '<b>ZooKeeper / etcd / Consul</b> grant locks through a <b>consensus</b> protocol and give you what you need: ephemeral nodes or leases tied to sessions, plus a monotonic revision (ZooKeeper’s <code>zxid</code>, etcd’s revision) usable as the fencing token. Slower and more operationally heavy — the price of correctness. A database row with <code>SELECT … FOR UPDATE</code> or an advisory lock is often enough when you already have the database.',
      ],
      changes: [{ text: 'Redis: fast, weaker guarantees, no token', tone: 'bad' }, { text: 'ZooKeeper/etcd: consensus, tokens available', tone: 'good' }],
      scene: { nodes: [box('rd', -8, -6, 'Redis', 'red', 'bolt', { size: [1.3, 1.3], height: 26, tag: pill('fast · timing-dependent', 'bolt', 'warn') }), box('zk', 8, -6, 'ZooKeeper / etcd', 'purple', 'shield', { size: [1.3, 1.3], height: 28, tag: pill('consensus + revision', 'check', 'good') }), box('dbl', 0, 6, 'Database lock', 'blue', 'lock', { size: [1.3, 1.3], height: 26, tag: pill('if you have the DB', 'db') })], links: [], flows: [] },
    },
    {
      short: 'Alternatives',
      kind: 'insight',
      title: 'Often the best lock is no lock',
      body: [
        'Before reaching for a distributed lock, ask whether the <i>operation</i> can be made safe by itself: <b>idempotent</b> writes (the same job run twice has the same effect), <b>compare-and-set</b> on a version column, a <b>unique constraint</b> (“at most one booking per seat”), or a <b>single-owner</b> design where a partition key always routes to the same worker.',
        'Use a lock for what really needs mutual exclusion — leader election for a singleton job, serialising access to a non-idempotent external system — keep the critical section tiny, add fencing when you can, and treat a lock without it as “efficient, not correct”. Figures here are illustrative model outputs.',
      ],
      changes: [{ text: 'Idempotency · CAS · unique constraints · single owner', tone: 'good' }],
      scene: { nodes: [box('i', -8, -6, 'Idempotent ops', 'green', 'check', { size: [1.3, 1.3], height: 24 }), box('c', 8, -6, 'Compare-and-set', 'blue', 'refresh', { size: [1.3, 1.3], height: 24 }), box('u', -8, 6, 'Unique constraint', 'orange', 'lock', { size: [1.3, 1.3], height: 24 }), box('o', 8, 6, 'Single owner / partition', 'purple', 'route', { size: [1.3, 1.3], height: 24 })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Leases give liveness; fencing gives safety',
      body: [
        'A distributed lock grants one holder at a time through a shared service. A <b>lease</b> keeps it live when holders crash, but pauses and partitions mean a holder can act after its lease has expired. <b>Fencing tokens</b>, checked by the resource, are what make the exclusion actually safe.',
        'Pick the service by guarantee (consensus store for correctness, Redis for efficiency), keep critical sections short, choose TTL from worst-case work, and prefer designs that need no lock at all.',
      ],
      scene: { nodes: [wa(), wb(), lock(), res({ tag: pill('checks token', 'shield', 'good') })], links: [link('a', 'lock', { arrow: 'both' }), link('b', 'lock', { arrow: 'both', style: 'dashed' }), link('a', 'res')], flows: [flow(['a', 'res'], { kind: 'write', rate: 1.2 })] },
    },
  ],
};

export default lesson;
