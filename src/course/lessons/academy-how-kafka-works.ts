import type { Lesson, SceneNode } from '../../types';
import { box, crowd, disk, flow, link, pill } from '../kit';

const prod = (extra: Partial<SceneNode> = {}) => crowd('prod', -13, 0, 14, 'producers', extra);
const part = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}): SceneNode =>
  disk(`p${i}`, 2, (i - (n - 1) / 2) * 5.5, name, { size: [3, 1.2], height: 20, tone: 'yellow', icon: 'list', ...extra });
const parts = (n: number, extra: (i: number) => Partial<SceneNode> = () => ({})) => Array.from({ length: n }, (_, i) => part(i, n, `partition ${i}`, extra(i)));
const cons = (i: number, n: number, name = `consumer ${i + 1}`, extra: Partial<SceneNode> = {}): SceneNode =>
  box(`c${i}`, 13, (i - (n - 1) / 2) * 5.5, name, 'purple', 'cpu', { size: [1.2, 1.2], height: 30, ...extra });
const consumers = (n: number, extra: (i: number) => Partial<SceneNode> = () => ({})) => Array.from({ length: n }, (_, i) => cons(i, n, undefined, extra(i)));
const feed = (n: number) => Array.from({ length: n }, (_, i) => link('prod', `p${i}`, { arrow: 'end' }));
const pull = (n: number) => Array.from({ length: n }, (_, i) => link(`p${i}`, `c${i}`, { arrow: 'end' }));
const writes = (n: number, rate = 1) => Array.from({ length: n }, (_, i) => flow(['prod', `p${i}`], { kind: 'write', rate }));
const reads = (n: number, rate = 1) => Array.from({ length: n }, (_, i) => flow([`p${i}`, `c${i}`], { rate }));

const fmtTB = (tb: number): string => (tb >= 1000 ? `${(tb / 1000).toFixed(1)} PB` : tb >= 10 ? `${Math.round(tb)} TB` : `${tb.toFixed(1)} TB`);

const lesson: Lesson = {
  slug: 'academy-how-kafka-works',
  title: 'Kafka Internals: Logs, Partitions and Consumer Groups',
  blurb: 'A distributed, replicated, append-only log: partitions for parallelism, consumer groups for scale-out reading, and replication settings that decide what “committed” means.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'part', label: 'Per partition', icon: 'activity' },
    { key: 'lag', label: 'Consumer lag', icon: 'clock' },
    { key: 'repl', label: 'Replication traffic', icon: 'share' },
    { key: 'disk', label: 'Disk for retention', icon: 'disk' },
  ],
  goals: [
    { text: 'Why a log, not a queue, decouples producers and consumers', step: 2 },
    { text: 'How keys, partitions and offsets give per-key order', step: 3 },
    { text: 'Consumer groups and the partition-count ceiling', step: 4 },
    { text: 'Sizing throughput, lag and storage', step: 5 },
    { text: 'ISR, acks and what “durable” costs', step: 7 },
  ],
  legend: ['write', 'request', 'response', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rate', label: 'Produce rate', min: 10, max: 2_000, step: 10, default: 200, unit: ' MB/s', description: 'Total bytes written to the topic per second.' },
      { key: 'partitions', label: 'Partitions', min: 1, max: 200, step: 1, default: 24, unit: '', description: 'Independent logs the topic is split into.' },
      { key: 'consumers', label: 'Consumers in group', min: 1, max: 200, step: 1, default: 12, unit: '', description: 'Instances reading as one consumer group.' },
      { key: 'perConsumer', label: 'Per-consumer speed', min: 5, max: 100, step: 5, default: 25, unit: ' MB/s', description: 'How fast one consumer can process.' },
      { key: 'rf', label: 'Replication factor', min: 1, max: 5, step: 1, default: 3, unit: '', description: 'Copies of every partition (leader + followers).' },
      { key: 'days', label: 'Retention', min: 1, max: 30, step: 1, default: 7, unit: ' days', description: 'How long data is kept for replay.' },
    ],
    calculate: (input, step) => {
      const rate = input.rate ?? 200;
      const p = Math.max(1, Math.round(input.partitions ?? 24));
      const c = Math.max(1, Math.round(input.consumers ?? 12));
      const per = input.perConsumer ?? 25;
      const rf = Math.max(1, Math.round(input.rf ?? 3));
      const days = input.days ?? 7;
      // a partition is read by at most one consumer in a group
      const active = Math.min(c, p);
      const capacity = active * per;
      const lag = Math.max(0, rate - capacity);
      const perPart = rate / p;
      const diskTB = (rate * 86_400 * days * rf) / 1e6;
      return {
        part: { v: `${perPart.toFixed(perPart < 10 ? 1 : 0)} MB/s`, tone: perPart > 20 ? 'bad' : perPart > 10 ? 'warn' : 'good' },
        lag: step < 3 ? { v: '—' } : lag > 0 ? { v: `+${Math.round(lag)} MB/s`, tone: 'bad' } : { v: 'keeping up', tone: 'good' },
        repl: { v: `${Math.round(rate * (rf - 1))} MB/s`, tone: rf === 1 ? 'bad' : undefined },
        disk: { v: fmtTB(diskTB), tone: diskTB > 500 ? 'warn' : undefined },
      };
    },
  },
  steps: [
    {
      short: 'Spaghetti',
      kind: 'problem',
      title: 'Services calling services directly',
      body: [
        'An order platform has services that each need to hear about order events: billing, search, analytics, fraud. Wiring each producer to each consumer point-to-point creates a web of integrations. A slow consumer slows the producer; a consumer that’s down loses events; adding a new consumer means changing the producer.',
        'And nothing can be replayed: a new analytics job that wants last week’s orders has nowhere to get them.',
      ],
      changes: [{ text: 'N producers × M consumers integrations', tone: 'bad' }, { text: 'No replay, tight coupling', tone: 'bad' }],
      scene: {
        nodes: [prod(), box('a', 6, -7, 'Billing', 'blue', 'dollar', { size: [1.2, 1.2], height: 28 }), box('b', 8, 0, 'Search', 'teal', 'search', { size: [1.2, 1.2], height: 28 }), box('c', 6, 7, 'Fraud', 'red', 'shield', { size: [1.2, 1.2], height: 28 })],
        links: [link('prod', 'a'), link('prod', 'b'), link('prod', 'c')],
        flows: [flow(['prod', 'a'], { rate: 2 }), flow(['prod', 'b'], { kind: 'fail', rate: 1.5 }), flow(['prod', 'c'], { rate: 2 })],
      },
    },
    {
      short: 'The log',
      kind: 'technique',
      title: 'Write events to a log; readers keep their own place',
      body: [
        'Kafka’s core idea is the <b>log</b>: an append-only sequence of records, each with a sequential <b>offset</b>. Producers append to the end; they never wait for anyone to read. Each consumer reads from any offset and remembers its own position, so many consumers read the same data independently, and a new one can start from the beginning.',
        'Records stay for a retention period (or size) regardless of whether they were read. Appends are sequential disk writes, reads are sequential too and served from the OS page cache — which, with batching, compression and zero-copy transfer from file to socket, is why one broker handles hundreds of MB per second on ordinary disks.',
      ],
      note: { kind: 'key', text: 'A queue deletes a message when someone takes it. A log keeps it — consumers just move a pointer.' },
      changes: [{ text: 'Producers and consumers decoupled in time', tone: 'good' }, { text: 'New consumers can replay from offset 0', tone: 'good' }],
      concepts: [
        { term: 'Log', def: 'An append-only, ordered sequence of records identified by increasing offsets.' },
        { term: 'Offset', def: 'A record’s position in a partition; a consumer’s offset is how far it has read.' },
      ],
      scene: {
        nodes: [prod(), ...parts(1, () => ({ tag: pill('offset 0 … 1,284,901 →', 'list', 'accent') })), box('c0', 13, 0, 'any consumer', 'purple', 'cpu', { size: [1.2, 1.2], height: 30, tag: pill('my offset: 1,284,600', 'pin') })],
        links: [link('prod', 'p0', { arrow: 'end' }), link('p0', 'c0', { arrow: 'end', label: pill('pull') })],
        flows: [flow(['prod', 'p0'], { kind: 'write', rate: 2 }), flow(['p0', 'c0'], { rate: 1.5 })],
      },
    },
    {
      short: 'Partitions',
      kind: 'technique',
      title: 'Partitions: parallelism, and order per key',
      body: [
        'One log on one broker would cap throughput. A topic is split into <b>partitions</b>, each its own log that can live on a different broker. The producer picks the partition: <code>hash(key) mod P</code>, so all records with the same key (say, one order ID) land in the same partition.',
        'Order is guaranteed <b>within a partition</b>, not across the topic. That’s usually what you want: all events for order 81733 stay in sequence while different orders flow in parallel.',
      ],
      changes: [{ text: 'key → partition: same key, same order', tone: 'good' }, { text: 'No global order across partitions' }],
      concepts: [{ term: 'Partition', def: 'One independent log of a topic; the unit of parallelism, ordering and replication.' }],
      scene: {
        nodes: [prod({ tag: pill('key = order_id', 'key', 'accent') }), ...parts(3, (i) => ({ tag: pill(['orders 17, 52…', 'orders 4, 81…', 'orders 9, 33…'][i]!, 'hash') }))],
        links: feed(3),
        flows: writes(3, 1.2),
      },
    },
    {
      short: 'Groups',
      kind: 'technique',
      title: 'Consumer groups share the work',
      body: [
        'Consumers join a <b>consumer group</b>. Kafka assigns each partition to <b>exactly one</b> consumer in the group, so the group reads the topic in parallel without two members processing the same record. Different groups each get a full copy — billing and analytics read independently.',
        'This sets a hard ceiling: a group can use at most <b>P</b> consumers. With 3 partitions, a fourth consumer sits idle. If a consumer fails, its partitions are reassigned — a <b>rebalance</b> — and the new owner resumes from the last committed offset.',
      ],
      changes: [{ text: '3 partitions → at most 3 active consumers' }, { text: 'Extra consumers idle until partitions grow' }],
      concepts: [
        { term: 'Consumer group', def: 'Consumers sharing a subscription; each partition is read by one member at a time.' },
        { term: 'Rebalance', def: 'Reassigning partitions among group members when one joins, leaves or fails.' },
      ],
      scene: {
        nodes: [prod(), ...parts(3), ...consumers(3), box('idle', 13, 11, 'consumer 4', 'grey', 'cpu', { size: [1.2, 1.2], height: 20, state: 'ghost', tag: pill('idle: no partition', 'clock', 'warn') })],
        links: [...feed(3), ...pull(3)],
        flows: [...writes(3), ...reads(3)],
      },
    },
    {
      short: 'Sizing',
      kind: 'technique',
      title: 'How many partitions, consumers and disks?',
      body: [
        'Three budgets. <b>Throughput per partition</b> (rate ÷ P) should stay in the low tens of MB/s. <b>Consumers</b> must satisfy <code>min(consumers, P) × per-consumer speed ≥ produce rate</code>, or lag grows without bound — and adding consumers beyond P does nothing. <b>Storage</b> is <code>rate × retention × replication factor</code>.',
        'Defaults: 200 MB/s over 24 partitions is 8.3 MB/s each; 12 consumers at 25 MB/s keep up (300 ≥ 200); replication moves 400 MB/s between brokers; seven days at replication factor 3 is about 360 TB. Drag consumers above the partition count and nothing improves.',
      ],
      note: { kind: 'tip', text: 'Choose a partition count with headroom: you can add partitions later, but doing so changes hash(key) mod P and breaks per-key ordering for existing keys.' },
      changes: [{ text: '200 MB/s ÷ 24 = 8.3 MB/s per partition' }, { text: '7 d × 3 copies ≈ 360 TB' }],
      scene: {
        nodes: [prod({ tag: pill('200 MB/s', 'activity') }), ...parts(4, () => ({ tag: pill('8 MB/s') })), ...consumers(4)],
        links: [...feed(4), ...pull(4)],
        flows: [...writes(4, 1.4), ...reads(4, 1.4)],
      },
    },
    {
      short: 'Replication',
      kind: 'technique',
      title: 'Leaders, followers and the in-sync set',
      body: [
        'Each partition has one <b>leader</b> that serves reads and writes and <b>followers</b> that copy its log. The followers that are fully caught up form the <b>in-sync replica set (ISR)</b>. If the leader dies, a controller promotes a follower from the ISR — so no acknowledged record is lost.',
        'A record is <b>committed</b> once all in-sync replicas have it; consumers only see committed records. Newer Kafka versions run the controller quorum themselves (KRaft) instead of relying on ZooKeeper.',
      ],
      changes: [{ text: 'RF = 3: one leader, two followers in ISR', tone: 'good' }],
      concepts: [
        { term: 'In-sync replicas (ISR)', def: 'Followers that are caught up with the leader within a configured lag; only these may become leader.' },
        { term: 'Committed record', def: 'A record replicated to every in-sync replica and therefore safe to expose to consumers.' },
      ],
      scene: {
        nodes: [prod(), box('lead', 2, -5, 'Leader', 'orange', 'server', { size: [1.3, 1.3], height: 34, tag: pill('partition 0', 'pin') }), box('f1', 2, 1, 'Follower', 'blue', 'server', { size: [1.3, 1.3], height: 30, tag: pill('in sync', 'check', 'good') }), box('f2', 2, 7, 'Follower', 'blue', 'server', { size: [1.3, 1.3], height: 30, tag: pill('in sync', 'check', 'good') })],
        links: [link('prod', 'lead', { arrow: 'end' }), link('lead', 'f1', { arrow: 'end' }), link('lead', 'f2', { arrow: 'end' })],
        flows: [flow(['prod', 'lead'], { kind: 'write', rate: 1.5 }), flow(['lead', 'f1'], { kind: 'write', rate: 1.5 }), flow(['lead', 'f2'], { kind: 'write', rate: 1.5 })],
      },
    },
    {
      short: 'Acks',
      kind: 'tradeoff',
      title: 'What does “acknowledged” promise?',
      body: [
        'The producer’s <code>acks</code> setting picks the guarantee. <b>0</b>: don’t wait — fastest, records can vanish. <b>1</b>: wait for the leader only — a leader crash right after can lose the record. <b>all</b>: wait for every in-sync replica.',
        'Combine <code>acks=all</code> with <code>min.insync.replicas=2</code> on a replication factor of 3: writes succeed while one broker is down and are refused (rather than silently under-replicated) if two are. You pay a replication round trip in latency — and, if the ISR shrinks below the minimum, availability. Allowing an out-of-sync replica to become leader (“unclean election”) restores availability at the price of losing committed data.',
      ],
      changes: [{ text: 'acks=all + min ISR 2 + RF 3: survives 1 broker loss', tone: 'good' }, { text: 'Unclean leader election: available, but may lose data', tone: 'bad' }],
      concepts: [{ term: 'acks', def: 'The producer setting for how many replicas must confirm a write before it is acknowledged (0, 1 or all).' }],
      scene: {
        nodes: [prod(), box('lead', 2, -5, 'Leader', 'orange', 'server', { size: [1.3, 1.3], height: 34 }), box('f1', 2, 1, 'Follower', 'blue', 'server', { size: [1.3, 1.3], height: 30, tag: pill('acked', 'check', 'good') }), box('f2', 2, 7, 'Follower', 'red', 'server', { size: [1.3, 1.3], height: 30, state: 'down', tag: pill('down: out of ISR', 'alert', 'bad') })],
        links: [link('prod', 'lead', { arrow: 'end' }), link('lead', 'f1', { arrow: 'end' }), link('lead', 'f2', { arrow: 'end', style: 'broken' })],
        flows: [flow(['prod', 'lead'], { kind: 'write', back: true, rate: 1.2 }), flow(['lead', 'f1'], { kind: 'write', rate: 1.2 })],
      },
    },
    {
      short: 'Semantics',
      kind: 'case',
      title: 'Delivery semantics and the duplicate after a rebalance',
      body: [
        'By default a consumer processes a record and then commits its offset: <b>at-least-once</b>. If it crashes between processing and committing — or a rebalance moves its partition mid-batch — the next owner reprocesses from the last committed offset, producing a <b>duplicate</b>. Producers can duplicate too, when a retry follows a lost acknowledgement.',
        'An <b>idempotent producer</b> attaches sequence numbers so the broker drops retried duplicates; <b>transactions</b> let a read-process-write pipeline commit its output and its consumed offsets atomically (exactly-once <i>within Kafka</i>). For side effects outside Kafka — an email, a payment — make the consumer idempotent with a dedupe key.',
      ],
      changes: [{ text: 'Crash before commit → record processed twice', tone: 'bad' }, { text: 'Idempotent producer + transactions, or idempotent consumer', tone: 'good' }],
      concepts: [{ term: 'Exactly-once (Kafka)', def: 'Idempotent producers plus transactions make consume-transform-produce within Kafka atomic; effects outside Kafka still need idempotence.' }],
      scene: {
        nodes: [prod(), ...parts(2), box('c0', 13, -2.75, 'consumer 1', 'red', 'cpu', { size: [1.2, 1.2], height: 30, state: 'down', tag: pill('crashed before commit', 'alert', 'bad') }), box('c1', 13, 2.75, 'consumer 2', 'purple', 'cpu', { size: [1.2, 1.2], height: 30, tag: pill('re-reads from last commit', 'refresh', 'warn') })],
        links: [...feed(2), link('p0', 'c0', { arrow: 'end', style: 'broken' }), link('p0', 'c1', { arrow: 'end' }), link('p1', 'c1', { arrow: 'end' })],
        flows: [...writes(2), flow(['p0', 'c1'], { rate: 1.2 }), flow(['p1', 'c1'], { rate: 1.2 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A replicated log you can read many times',
      body: [
        'Kafka stores events in <b>partitioned, replicated, append-only logs</b>. Keys give per-key order, partitions give parallelism, consumer groups divide the work (never more consumers than partitions), and retention makes replay possible.',
        'Durability is a dial: replication factor, ISR and <code>acks</code> decide what an acknowledgement means. Default delivery is at-least-once — design consumers to be idempotent, and size partitions, consumers and disks from rate, per-consumer speed and retention.',
      ],
      scene: {
        nodes: [prod(), ...parts(3), ...consumers(3)],
        links: [...feed(3), ...pull(3)],
        flows: [...writes(3), ...reads(3)],
      },
    },
  ],
};

export default lesson;
