import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('cl', -13, 0, 10, 'clients', extra);
const redis = (extra: Partial<SceneNode> = {}) => box('redis', 3, 0, 'Redis', 'red', 'bolt', { size: [1.5, 1.5], height: 38, ...extra });

const fmtOps = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M/s` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k/s` : `${Math.round(n)}/s`);

const lesson: Lesson = {
  slug: 'source-why-is-redis-so-fast',
  title: 'Why Redis Is So Fast',
  blurb: 'Memory, purpose-built data structures and one thread that never waits — and why the network, not Redis, is usually the bottleneck.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'client', label: 'Per connection', icon: 'activity' },
    { key: 'total', label: 'Server throughput', icon: 'gauge' },
    { key: 'util', label: 'Command thread busy', icon: 'cpu' },
    { key: 'stall', label: 'Requests stalled by one slow command', icon: 'clock' },
  ],
  goals: [
    { text: 'Why memory plus simple structures gives microsecond commands', step: 2 },
    { text: 'Why one command thread needs no locks', step: 3 },
    { text: 'How round-trip time, not CPU, limits a client — and what pipelining fixes', step: 4 },
    { text: 'What RDB and AOF cost and what each can lose', step: 5 },
    { text: 'The one-slow-command problem and how to scale past one core', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'rtt', label: 'Network round trip', min: 50, max: 2000, step: 50, default: 500, unit: ' µs', description: 'Time for a request and its reply to cross the network, excluding Redis work.' },
      { key: 'batch', label: 'Pipeline depth', min: 1, max: 1000, step: 1, default: 1, unit: '', description: 'Commands sent back-to-back before waiting for replies.' },
      { key: 'svc', label: 'Time per command', min: 1, max: 50, step: 1, default: 2, unit: ' µs', description: 'Server-side time to execute one simple command.' },
      { key: 'clients', label: 'Connections', min: 1, max: 2000, step: 1, default: 50, unit: '', description: 'Client connections sending as fast as they can.' },
      { key: 'slow', label: 'One slow command', min: 0, max: 200, step: 1, default: 10, unit: ' ms', description: 'Duration of a single O(N) command such as KEYS or deleting a huge key.' },
    ],
    calculate: (input, step) => {
      const rtt = Math.max(1, input.rtt ?? 500);
      const batch = Math.max(1, Math.round(input.batch ?? 1));
      const svc = Math.max(0.1, input.svc ?? 2);
      const conns = Math.max(1, Math.round(input.clients ?? 50));
      const slow = Math.max(0, input.slow ?? 10);
      // One connection: send `batch` commands, wait one RTT plus their execution time.
      const perConn = (batch / (rtt + batch * svc)) * 1e6;
      const ceiling = 1e6 / svc;
      const total = Math.min(conns * perConn, ceiling);
      const util = total / ceiling;
      const stalled = total * (slow / 1000);
      return {
        client: step < 3 ? { v: '—' } : { v: fmtOps(perConn), tone: batch === 1 && rtt > svc * 20 ? 'warn' : 'good' },
        total: step < 3 ? { v: '—' } : { v: fmtOps(total), tone: util > 0.9 ? 'warn' : 'good' },
        util: step < 3 ? { v: '—' } : { v: `${(util * 100).toFixed(0)}%`, tone: util > 0.9 ? 'bad' : util > 0.6 ? 'warn' : 'good' },
        stall: step < 5 ? { v: '—' } : { v: slow === 0 ? 'none' : `${Math.round(stalled).toLocaleString('en-US')} requests wait`, tone: slow === 0 ? 'good' : stalled > 500 ? 'bad' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'The claim',
      kind: 'problem',
      title: 'Hundreds of thousands of operations a second on one core',
      body: [
        'A single Redis instance routinely serves <b>100,000+ commands a second</b> and answers each in well under a millisecond, mostly on a single command-executing thread. That sounds backwards: databases add threads to go fast.',
        'The speed comes from three decisions that reinforce each other — keep the working set in <b>memory</b>, use <b>data structures</b> chosen for each command’s cost, and run commands on <b>one thread</b> so nothing waits for a lock. The catch is that you then run into other limits, which this lesson ends on.',
      ],
      scene: { nodes: [clients(), redis({ load: 45, tag: pill('sub-millisecond replies', 'bolt', 'good') })], links: [link('cl', 'redis', { arrow: 'both' })], flows: [flow(['cl', 'redis'], { rate: 3 }), flow(['redis', 'cl'], { kind: 'response', rate: 3 })] },
    },
    {
      short: 'Memory',
      kind: 'technique',
      title: 'Memory first, structures chosen for the job',
      body: [
        'Typical orders of magnitude: reading from <b>RAM takes ~100 ns</b>, a random read from an <b>SSD ~100 µs</b> (1,000× slower), a spinning disk <b>~10 ms</b> (100,000×). A store whose primary copy is in RAM spends its time computing, not waiting.',
        'And it doesn’t use a general-purpose index. A key lookup is a <b>hash table</b> (average O(1)); a sorted set is a <b>skip list plus hash table</b> so <code>ZADD</code> is O(log N) and rank queries are cheap; lists, small sets and hashes use compact encodings that fit CPU caches. Every command is defined by the structure it runs on, so its cost is predictable.',
      ],
      changes: [{ text: 'RAM ~100 ns vs SSD ~100 µs vs HDD ~10 ms', tone: 'info' }, { text: 'GET: O(1) · ZADD: O(log N) · LRANGE: O(N) on the slice', tone: 'info' }],
      note: { kind: 'tip', text: 'Check the documented complexity of a command before using it in production — “simple” commands over big values are where surprises hide.' },
      scene: {
        nodes: [redis({ tag: pill('hash table · skip list · lists', 'hash') }), box('ram', 14, -5, 'RAM ~100 ns', 'green', 'bolt', { size: [1.2, 1.2], height: 24 }), disk('ssd', 14, 5, 'SSD ~100 µs', { size: [2.6, 1.1], height: 18, tone: 'grey' })],
        links: [link('redis', 'ram', { arrow: 'both' }), link('redis', 'ssd', { style: 'dashed' })],
        flows: [flow(['redis', 'ram'], { rate: 3, speed: 1.4 })],
      },
    },
    {
      short: 'One thread',
      kind: 'technique',
      title: 'An event loop that never blocks',
      body: [
        'Redis uses an <b>event loop</b> over non-blocking sockets (epoll/kqueue). It asks the OS “which of my thousands of connections have data?”, reads each request, executes the command <i>to completion</i>, writes the reply, and moves on. One thread serves thousands of clients, and a command never waits on I/O or on another command.',
        'Because only one thread touches the data, there are <b>no locks, no context switches, no cache-line fights</b> — and every command is atomic for free, which is what makes <code>INCR</code> or a Lua script safe. Since Redis 6 extra threads can handle socket reading and writing, but command execution is still a single thread. The sliders show the resulting ceiling: <code>1 ÷ time-per-command</code>.',
      ],
      changes: [{ text: 'Atomic commands without locks', tone: 'good' }, { text: 'Ceiling = 1 ÷ (µs per command)', tone: 'info' }],
      concepts: [{ term: 'Event loop', def: 'A single thread that multiplexes many non-blocking connections, running each ready request to completion before taking the next.' }],
      scene: {
        nodes: [clients(), box('loop', 3, 0, 'Event loop', 'red', 'refresh', { size: [1.5, 1.5], height: 38, load: 70, tag: pill('one command at a time', 'cpu') })],
        links: [link('cl', 'loop', { arrow: 'both' })],
        flows: [flow(['cl', 'loop'], { rate: 4 }), flow(['loop', 'cl'], { kind: 'response', rate: 4 })],
      },
    },
    {
      short: 'Network',
      kind: 'insight',
      title: 'The network usually costs more than Redis does',
      body: [
        'A command takes ~2 µs inside Redis but a round trip inside a datacentre is ~500 µs. A client that waits for each reply before sending the next gets only <code>1 ÷ (RTT + service) ≈ 2,000 commands/s</code> per connection — Redis is 99% idle waiting for the network. Fifty such connections reach ~100k/s while Redis’s own thread is at ~20%.',
        '<b>Pipelining</b> sends N commands before reading replies, so one round trip is shared: <code>N ÷ (RTT + N × service)</code>. Try pipeline depth 50: one connection jumps to about 83,000/s (50 ÷ (500 + 50×2) µs), roughly 40× more, and depth 200 reaches ~220,000/s — bounded by the 500,000/s ceiling. Fewer, fatter round trips is the cheapest Redis optimisation there is.',
      ],
      changes: [{ text: 'Depth 1: ~2k/s per connection', tone: 'bad' }, { text: 'Depth 50: ~83k/s per connection', tone: 'good' }],
      concepts: [{ term: 'Pipelining', def: 'Sending several commands without waiting for each reply, amortising one network round trip over the whole batch.' }],
      scene: {
        nodes: [clients({ tag: pill('500 µs round trip', 'clock', 'warn') }), redis({ load: 20, tag: pill('mostly idle', 'pause') })],
        links: [link('cl', 'redis', { arrow: 'both' })],
        flows: [flow(['cl', 'redis'], { rate: 0.8, speed: 0.4 }), flow(['redis', 'cl'], { kind: 'response', rate: 0.8, speed: 0.4 })],
      },
    },
    {
      short: 'Durability',
      kind: 'tradeoff',
      title: 'Persisting memory without stalling it',
      body: [
        '<b>RDB snapshots</b> fork the process; the child writes the whole dataset to disk while the parent keeps serving, using the OS’s copy-on-write for pages that change. Compact and fast to restore, but you lose everything since the last snapshot. <b>AOF</b> appends every write command to a log; <code>fsync everysec</code> bounds loss to about a second, <code>always</code> to nothing but at a heavy latency cost, <code>no</code> leaves it to the OS.',
        'Both have a price: <code>fork</code> on a very large heap can pause the server briefly and, with write-heavy traffic, copy-on-write can nearly double memory. Many deployments run AOF everysec plus periodic RDB and accept up to ~1 s of loss. If you cannot lose a write, Redis is a cache in front of a durable store, not the store.',
      ],
      changes: [{ text: 'RDB: compact, loses since last snapshot', tone: 'bad' }, { text: 'AOF everysec: ~1 s loss window', tone: 'info' }, { text: 'AOF always: no loss, slower writes', tone: 'info' }],
      scene: {
        nodes: [redis({ tag: pill('serves while child writes', 'refresh') }), disk('rdb', 14, -5, 'RDB snapshot', { size: [2.6, 1.1], height: 18 }), disk('aof', 14, 5, 'AOF log', { size: [2.6, 1.1], height: 18, tone: 'yellow' })],
        links: [link('redis', 'rdb', { style: 'dashed' }), link('redis', 'aof')],
        flows: [flow(['redis', 'aof'], { kind: 'write', rate: 2 })],
      },
    },
    {
      short: 'Limits',
      kind: 'problem',
      title: 'One slow command stops everyone',
      body: [
        'The single thread is also the weakness. <code>KEYS *</code>, deleting a million-element key, or a large <code>SORT</code> runs to completion before anything else — every other client’s request waits. At 100,000 requests a second a 10 ms command strands <b>about 1,000 requests</b> behind it, and their latency jumps from microseconds to ten milliseconds.',
        'Habits that prevent it: <code>SCAN</code> instead of <code>KEYS</code>, <code>UNLINK</code> (background free) instead of <code>DEL</code> on large keys, cap collection sizes, and watch the slow log. The same logic explains big keys and hot keys: both concentrate work on one thread.',
      ],
      changes: [{ text: '10 ms command @ 100k req/s → ~1,000 requests delayed', tone: 'bad' }, { text: 'SCAN, UNLINK, size caps, slow log', tone: 'good' }],
      scene: {
        nodes: [clients(), redis({ state: 'hot', load: 100, tag: pill('running KEYS * … 10 ms', 'alert', 'bad') })],
        links: [link('cl', 'redis', { arrow: 'both' })],
        flows: [flow(['cl', 'redis'], { kind: 'fail', rate: 3 })],
      },
    },
    {
      short: 'Scale out',
      kind: 'technique',
      title: 'More cores means more instances',
      body: [
        'One thread caps one instance, so Redis scales <i>out</i>. <b>Replicas</b> copy a primary asynchronously and serve reads (possibly stale; a failover can lose the last few writes). <b>Redis Cluster</b> splits the keyspace into <b>16,384 hash slots</b> spread over primaries; a client hashes the key, finds the owning node and is redirected if the slot moved.',
        'Multi-key operations only work within one slot (use hash tags like <code>{user:42}</code> to co-locate), so you design key names with sharding in mind. Combine with the habits from the last step and Redis delivers its numbers in production, not just in benchmarks.',
      ],
      scene: {
        nodes: [clients(), box('s1', 4, -6, 'Primary · slots 0–5460', 'red', 'bolt', { size: [1.3, 1.3], height: 30 }), box('s2', 4, 0, 'Primary · slots 5461–10922', 'red', 'bolt', { size: [1.3, 1.3], height: 30 }), box('s3', 4, 6, 'Primary · slots 10923–16383', 'red', 'bolt', { size: [1.3, 1.3], height: 30 })],
        links: [link('cl', 's1'), link('cl', 's2'), link('cl', 's3')],
        flows: [flow(['cl', 's1'], { rate: 2 }), flow(['cl', 's2'], { rate: 2 }), flow(['cl', 's3'], { rate: 2 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Fast because it stays out of its own way',
      body: [
        '<b>Memory</b> removes disk waits; <b>purpose-built structures</b> make each command’s cost known; a <b>single command thread</b> removes locks and gives atomicity; <b>pipelining</b> hides the network. Ceiling per instance ≈ <code>1 ÷ time-per-command</code>.',
        'Watch for the failure modes the speed hides: slow O(N) commands and big keys, fork and copy-on-write during persistence, and asynchronous replication losing the last writes. Scale with replicas and cluster slots, and treat Redis as a cache unless you have chosen AOF-always and accepted its cost.',
      ],
      scene: { nodes: [clients(), redis({ load: 55 }), db('store', 15, 0, 'Source of truth', { size: [1.3, 1.3] })], links: [link('cl', 'redis', { arrow: 'both' }), link('redis', 'store', { style: 'dashed', arrow: 'both' })], flows: [flow(['cl', 'redis'], { rate: 3 })] },
    },
  ],
};

export default lesson;
