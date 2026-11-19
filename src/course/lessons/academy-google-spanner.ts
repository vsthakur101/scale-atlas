import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill, you, zone } from '../kit';

const client = (id: string, name: string, r: number, d: number, extra: Partial<SceneNode> = {}) => you(id, r, d, { label: pill(name, 'user'), ...extra });
const replica = (id: string, name: string, r: number, d: number, extra: Partial<SceneNode> = {}) =>
  db(id, r, d, name, { size: [1.3, 1.3], height: 36, ...extra });
const tt = (extra: Partial<SceneNode> = {}) => box('tt', 0, -10, 'TrueTime', 'yellow', 'clock', { size: [1.4, 1.4], height: 34, sub: 'GPS + atomic clocks', ...extra });
const group = (extra: Partial<Record<'a' | 'b' | 'c', Partial<SceneNode>>> = {}): SceneNode[] => [
  zone('zone', 6, 0, 8, 17, 'Paxos group (one split)', 'blue'),
  replica('a', 'zone A', 6, -6, { tone: 'orange', tag: pill('leader', 'pin'), ...extra.a }),
  replica('b', 'zone B', 6, 0, extra.b),
  replica('c', 'zone C', 6, 6, extra.c),
];
const paxos = [link('a', 'b', { arrow: 'both' }), link('a', 'c', { arrow: 'both' })];
const paxosFlow = [flow(['a', 'b'], { kind: 'write', back: true, rate: 1 }), flow(['a', 'c'], { kind: 'write', back: true, rate: 1 })];

const lesson: Lesson = {
  slug: 'academy-google-spanner',
  title: 'Google Spanner',
  blurb: 'A globally distributed SQL database that gives every transaction one true order — by making the uncertainty of clocks explicit, and waiting it out.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'wait', label: 'Commit wait', icon: 'timer' },
    { key: 'write', label: 'Write latency', icon: 'activity' },
    { key: 'multi', label: 'Multi-split write', icon: 'share' },
    { key: 'ceiling', label: 'Hot-row ceiling', icon: 'lock' },
  ],
  goals: [
    { text: 'What external consistency promises and why it is hard', step: 1 },
    { text: 'How Paxos groups replicate each split', step: 2 },
    { text: 'Why timestamps from ordinary clocks break ordering', step: 3 },
    { text: 'TrueTime intervals and commit wait', step: 5 },
    { text: 'What commit wait costs: latency and hot-row throughput', step: 6 },
  ],
  legend: ['write', 'request', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'eps', label: 'Clock uncertainty ε', min: 1, max: 50, step: 1, default: 4, unit: ' ms', description: 'Half-width of the TrueTime interval. The paper reports a few milliseconds on average.' },
      { key: 'rtt', label: 'Quorum round trip', min: 1, max: 150, step: 1, default: 8, unit: ' ms', description: 'Time for a Paxos majority to acknowledge: ~1–10 ms across zones in a region, ~100 ms across continents.' },
      { key: 'multi', label: 'Cross-split writes', min: 0, max: 100, step: 5, default: 30, unit: '%', description: 'Share of transactions that touch more than one Paxos group and need two-phase commit.' },
    ],
    calculate: (input, step) => {
      const eps = input.eps ?? 4;
      const rtt = input.rtt ?? 8;
      const multi = (input.multi ?? 30) / 100;
      const wait = 2 * eps;
      const apply = 2;
      const single = rtt + wait + apply;
      const cross = single + rtt; // extra replicated round for the 2PC prepare record
      const mean = single * (1 - multi) + cross * multi;
      const ceiling = 1000 / single;
      return {
        wait: step < 4 ? { v: '—' } : { v: `${wait} ms`, tone: wait <= 10 ? 'good' : wait <= 30 ? 'warn' : 'bad' },
        write: { v: step < 4 ? `${Math.round(rtt + apply)} ms` : `${Math.round(mean)} ms avg`, tone: mean < 40 ? 'good' : mean < 120 ? 'warn' : 'bad' },
        multi: step < 5 ? { v: '—' } : { v: `${Math.round(cross)} ms`, tone: cross < 60 ? 'good' : cross < 150 ? 'warn' : 'bad' },
        ceiling: step < 5 ? { v: '—' } : { v: `${Math.round(ceiling)}/s per row`, tone: ceiling > 40 ? 'good' : ceiling > 12 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'The ask',
      kind: 'problem',
      title: 'One database, every region, one true order',
      body: [
        'A payments platform wants a single logical database spanning continents: relational schema, SQL, transactions — and no “what region did you read from?” caveats. The strongest ordering requirement is <b>external consistency</b>: if transaction T1 commits before T2 starts, in real time, then every observer sees T1 before T2.',
        'Eventually consistent stores can’t promise it; a single-leader database can, but only in one place. The hard part is agreeing on “before” across machines that don’t share a clock.',
      ],
      changes: [{ text: 'T1 commits in Tokyo, then T2 starts in Paris → T2 must see T1', tone: 'good' }],
      concepts: [{ term: 'External consistency', def: 'Transactions appear to execute in an order consistent with real-time commit order; also called strict serializability.' }],
      scene: {
        nodes: [client('tokyo', 'Tokyo: T1 commits', -11, -5, { tag: pill('1. transfer €10', 'check', 'good') }), client('paris', 'Paris: T2 starts later', -11, 6, { tag: pill('2. read balance → must see T1', 'search', 'accent') }), box('db', 5, 0, 'Global database', 'purple', 'db', { size: [1.6, 1.6], height: 44 })],
        links: [link('tokyo', 'db', { arrow: 'both' }), link('paris', 'db', { arrow: 'both' })],
        flows: [flow(['tokyo', 'db'], { kind: 'write', back: true, rate: 0.8 }), flow(['paris', 'db'], { back: true, rate: 0.8 })],
      },
    },
    {
      short: 'Paxos groups',
      kind: 'technique',
      title: 'Splits, each replicated by Paxos',
      body: [
        'Spanner partitions tables into <b>splits</b> (key ranges). Each split is replicated across zones by a <b>Paxos group</b>: a leader orders writes and a write commits once a majority (2 of 3 here) has it. If the leader dies, the group elects another once the old leader’s lease expires (about 10 seconds in the Spanner paper).',
        'Replicas in different zones, even regions, mean a zone or datacentre can fail without losing a committed write — at the price of a quorum round trip on every write, the floor on write latency.',
      ],
      changes: [{ text: 'Write commits at 2 of 3 replicas' }],
      concepts: [{ term: 'Paxos group', def: 'A set of replicas that agree on an ordered log of writes using the Paxos consensus protocol; commits need a majority.' }],
      scene: {
        nodes: [client('app', 'client', -10, 0), ...group()],
        links: [link('app', 'a', { arrow: 'end' }), ...paxos],
        flows: [flow(['app', 'a'], { kind: 'write', rate: 1 }), ...paxosFlow],
      },
    },
    {
      short: 'Bad clocks',
      kind: 'problem',
      title: 'Why plain timestamps break “before”',
      body: [
        'To order transactions, give each commit a timestamp. But each machine’s clock is slightly off — a few milliseconds is normal even with NTP. Say Tokyo’s clock runs 7 ms ahead of Paris’s. T1 commits in Tokyo and is stamped 12:00:00.012; a moment later, T2 starts in Paris, and Paris stamps it 12:00:00.008.',
        'T2 started <i>after</i> T1 finished, yet its timestamp is <i>smaller</i>. A snapshot read at ….010 would see neither, or see T2 without T1. The order the database records disagrees with real time.',
      ],
      changes: [{ text: 'T1 ts 12:00:00.012 (Tokyo, +7 ms)', tone: 'bad' }, { text: 'T2 ts 12:00:00.008 (Paris) — earlier!', tone: 'bad' }],
      scene: {
        nodes: [client('tokyo', 'Tokyo clock +7 ms', -11, -5, { tag: pill('T1 stamped .012', 'clock', 'bad') }), client('paris', 'Paris clock', -11, 6, { tag: pill('T2 stamped .008', 'clock', 'bad') }), box('db', 5, 0, 'Database', 'purple', 'db', { size: [1.6, 1.6], height: 44, state: 'hot', tag: pill('order ≠ real time', 'alert', 'bad') })],
        links: [link('tokyo', 'db', { arrow: 'end' }), link('paris', 'db', { arrow: 'end' })],
        flows: [flow(['tokyo', 'db'], { kind: 'write', rate: 0.8 }), flow(['paris', 'db'], { kind: 'write', rate: 0.8 })],
      },
    },
    {
      short: 'TrueTime',
      kind: 'technique',
      title: 'TrueTime: time as an interval',
      body: [
        'Instead of pretending to know the exact time, Spanner’s <b>TrueTime</b> API returns an interval: <code>TT.now() = [earliest, latest]</code>, guaranteed to contain the true time. The width is 2ε, where ε is the clock uncertainty.',
        'It keeps ε small with hardware: GPS receivers and atomic clocks in every datacentre act as time masters, and servers poll several of them and account for their own drift between polls. The paper reports ε of a few milliseconds on average — tiny, but never zero.',
      ],
      changes: [{ text: 'now = [12:00:00.004, 12:00:00.012]  (ε = 4 ms)' }],
      concepts: [{ term: 'TrueTime', def: 'An API returning a bounded interval [earliest, latest] guaranteed to contain the current absolute time.' }],
      scene: {
        nodes: [tt({ tag: pill('ε ≈ 4 ms', 'gauge', 'good') }), box('gps', -8, -10, 'GPS', 'teal', 'wifi', { size: [1.1, 1.1], height: 26 }), box('atom', 8, -10, 'Atomic clock', 'green', 'timer', { size: [1.1, 1.1], height: 26 }), ...group()],
        links: [link('gps', 'tt', { arrow: 'end' }), link('atom', 'tt', { arrow: 'end' }), link('tt', 'a', { arrow: 'end', style: 'dashed', label: pill('[earliest, latest]') })],
        flows: [flow(['gps', 'tt'], { kind: 'handshake', rate: 0.5 }), flow(['atom', 'tt'], { kind: 'handshake', rate: 0.5 }), flow(['tt', 'a'], { kind: 'handshake', rate: 0.6 })],
      },
    },
    {
      short: 'Commit wait',
      kind: 'insight',
      title: 'Pick a timestamp, then wait until it is surely past',
      body: [
        'When a transaction is ready to commit, the leader picks a commit timestamp <code>s ≥ TT.now().latest</code> — a time that’s definitely not in the past. It then <b>waits</b> until <code>TT.after(s)</code> is true, meaning <code>s</code> is certainly behind the true time on every machine, before making the commit visible and acknowledging it.',
        'This is <b>commit wait</b>, about 2ε. The payoff is the guarantee: any transaction that starts after this one is acknowledged will get a timestamp from a TrueTime interval whose <i>latest</i> is after <i>s</i>. So real-time order implies timestamp order — external consistency, achieved with no cross-region clock synchronisation messages.',
      ],
      note: { kind: 'key', text: 'Spanner turns clock uncertainty into latency: the less certain the clocks, the longer every write waits.' },
      changes: [{ text: 's = latest; wait ≈ 2ε = 8 ms', tone: 'good' }, { text: 'Real-time order ⇒ timestamp order', tone: 'good' }],
      concepts: [{ term: 'Commit wait', def: 'Delaying a commit’s visibility until its timestamp is guaranteed to be in the past everywhere, ensuring timestamp order matches real-time order.' }],
      scene: {
        nodes: [client('app', 'client', -10, 0), ...group({ a: { tag: pill('s = 12:00:00.012 · waiting 8 ms', 'timer', 'accent') } }), tt({ tag: pill('now.latest = .012', 'clock') })],
        links: [link('app', 'a', { arrow: 'end' }), ...paxos, link('tt', 'a', { arrow: 'end', style: 'dashed' })],
        flows: [flow(['app', 'a'], { kind: 'write', rate: 1 }), ...paxosFlow],
      },
    },
    {
      short: 'The cost',
      kind: 'tradeoff',
      title: 'What strong consistency costs',
      body: [
        'A write’s latency is a quorum round trip plus commit wait: with ε = 4 ms and an 8 ms quorum that is about 18 ms. A transaction touching <b>several splits</b> runs two-phase commit across their Paxos groups — one extra replicated round, here ~26 ms.',
        'Locks are held through commit wait, so a single row can be updated at most about <code>1000 ÷ latency</code> times a second — ~55/s here. Hot counters need the sharding tricks from the counter lesson. Try the sliders: stretch the quorum to 100 ms for cross-continent replicas, or let ε grow, and watch every number climb.',
      ],
      changes: [{ text: '18 ms single-split · 26 ms cross-split', tone: 'good' }, { text: '~55 updates/s per row', tone: 'bad' }],
      scene: {
        nodes: [client('app', 'client', -10, 0), ...group({ a: { tag: pill('lock held through commit wait', 'lock', 'warn') } })],
        links: [link('app', 'a', { arrow: 'end' }), ...paxos],
        flows: [flow(['app', 'a'], { kind: 'write', rate: 0.8 }), ...paxosFlow],
      },
    },
    {
      short: 'Reads',
      kind: 'technique',
      title: 'Reads that don’t wait',
      body: [
        'Timestamps also make reads cheap. A <b>read-only transaction</b> picks a timestamp and reads a consistent snapshot as of that moment from any replica that is caught up to it — no locks, no commit wait, never blocking writers.',
        'If an application can tolerate slightly old data, a <b>stale read</b> (say, “as of 10 seconds ago”) is served by the nearest replica with no coordination at all. Most traffic in a read-heavy system uses these paths; only read-write transactions pay for commit wait.',
      ],
      changes: [{ text: 'Snapshot reads: lock-free, any caught-up replica', tone: 'good' }, { text: 'Stale reads: nearest replica, no coordination', tone: 'good' }],
      concepts: [{ term: 'Snapshot read', def: 'A read at a chosen timestamp returning the database as it was at that instant.' }],
      scene: {
        nodes: [client('near', 'client (Paris)', -10, 4, { tag: pill('read as of 10 s ago', 'search') }), ...group({ c: { tag: pill('nearest replica serves it', 'check', 'good') } })],
        links: [link('near', 'c', { arrow: 'both' })],
        flows: [flow(['near', 'c'], { back: true, rate: 1.5 })],
      },
    },
    {
      short: 'Uncertainty',
      kind: 'case',
      title: 'Case: the time masters fail',
      body: [
        'TrueTime stays accurate only while the GPS and atomic time masters are reachable. If servers lose contact with them, their local clocks drift and ε <b>grows</b> — from 4 ms toward 100 ms or more. Spanner stays correct but every write’s commit wait grows with it: 2ε becomes 200 ms, and a hot row’s ceiling drops from tens of updates per second to a handful.',
        'The design chooses to slow down rather than to ever give a wrong order. Set ε to 100 in the slider to see it. It’s also why alternatives without special hardware, such as hybrid logical clocks, give up the real-time guarantee and offer a weaker one.',
      ],
      changes: [{ text: 'Time master lost → ε 4 → 100 ms', tone: 'bad' }, { text: 'Correctness kept; write latency pays', tone: 'good' }],
      scene: {
        nodes: [tt({ state: 'down', tag: pill('time masters unreachable', 'alert', 'bad') }), client('app', 'client', -10, 0), ...group({ a: { tag: pill('commit wait ≈ 200 ms', 'timer', 'bad') } })],
        links: [link('app', 'a', { arrow: 'end' }), link('tt', 'a', { arrow: 'end', style: 'broken' }), ...paxos],
        flows: [flow(['app', 'a'], { kind: 'write', rate: 0.5, speed: 0.5 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Wait out the uncertainty',
      body: [
        'Spanner replicates each split with <b>Paxos</b> and orders transactions with <b>TrueTime</b>: a clock API that admits its error as an interval. Choosing commit timestamps at the top of that interval and <b>waiting ≈ 2ε</b> before acknowledging makes timestamp order match real-time order — <b>external consistency</b> across the planet.',
        'The bill: write latency of a quorum round trip plus 2ε, lower throughput on any single hot row, and extra rounds for cross-split transactions. Reads are cheap via lock-free snapshots and stale reads — which is why the model suits read-heavy, correctness-critical systems.',
      ],
      scene: {
        nodes: [client('app', 'client', -10, 0), ...group(), tt({ tag: pill('ε ≈ 4 ms', 'gauge', 'good') })],
        links: [link('app', 'a', { arrow: 'end' }), ...paxos, link('tt', 'a', { arrow: 'end', style: 'dashed' })],
        flows: [flow(['app', 'a'], { kind: 'write', rate: 1 }), ...paxosFlow],
      },
    },
  ],
};

export default lesson;
