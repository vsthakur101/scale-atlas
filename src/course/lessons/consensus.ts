import type { Lesson, Pill, SceneNode, Tone } from '../../types';
import { at, box, flow, link, onRing, pill, ring } from '../kit';

const C0 = at(2, 0);
const node = (i: number, tone: Tone = 'blue', extra: Partial<SceneNode> = {}): SceneNode => ({
  ...box(`n${i}`, 0, 0, `N${i}`, tone, 'server', { size: [1.25, 1.25], height: 34 }),
  at: onRing(C0, 4, (i - 1) * 72),
  ...extra,
});
const cluster = (opts: Record<number, Partial<SceneNode> & { tone?: Tone }> = {}) =>
  [1, 2, 3, 4, 5].map((i) => node(i, opts[i]?.tone ?? 'blue', opts[i] ?? {}));
const halo = (tag?: Pill) => ring('ring', 2, 0, 4, undefined, { tag });
const client = (extra: Partial<SceneNode> = {}) => box('client', -11, 0, 'Client', 'sand', 'user', { size: [1.3, 1.3], height: 32, ...extra });
const others = (from: number, ids = [1, 2, 3, 4, 5]) => ids.filter((i) => i !== from).map((i) => `n${i}`);

const lesson: Lesson = {
  slug: 'consensus',
  title: 'Leader Election & Consensus',
  blurb: 'How a handful of machines agree on one leader and one history — even while some of them crash or get cut off.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'term', label: 'Term', icon: 'hash' },
    { key: 'leader', label: 'Leader', icon: 'pin' },
    { key: 'commit', label: 'Committed', icon: 'check' },
    { key: 'quorum', label: 'Quorum', icon: 'users' },
  ],
  goals: [
    { text: 'Why heartbeats alone produce two leaders', step: 2 },
    { text: 'Majorities and why they must overlap', step: 3 },
    { text: 'Raft elections with terms and votes', step: 4 },
    { text: 'Replicating and committing a log', step: 5 },
    { text: 'Leases, fencing and when to use etcd/ZooKeeper', step: 8 },
  ],
  legend: ['handshake', 'write', 'request', 'fail'],
  steps: [
    {
      short: 'Who leads?',
      kind: 'problem',
      title: 'Five schedulers, one job runs once',
      body: [
        'Five scheduler nodes run for redundancy, but each nightly billing job must run <b>exactly once</b>. Exactly one node should be the leader that assigns jobs — and if it dies, another must take over without ever having two leaders at once.',
        'Agreeing on a single value among unreliable machines over an unreliable network is the <b>consensus</b> problem.',
      ],
      concepts: [{ term: 'Consensus', def: 'Getting a group of nodes to agree on a value (or sequence of values) despite failures.' }],
      scene: {
        nodes: [halo(pill('who leads?', 'pin', 'accent')), ...cluster()],
        metrics: { term: '—', leader: 'none', commit: '—', quorum: '3 of 5' },
      },
    },
    {
      short: 'Naive',
      kind: 'problem',
      title: '“Lowest ID that’s alive” — until the network splits',
      body: [
        'Naive rule: every node heartbeats the others; the lowest-numbered node it can hear from is leader. Then a switch fails and splits the cluster into {N1, N2} and {N3, N4, N5}. Each side can’t hear the other, so N1 leads one side and N3 leads the other.',
        'Two leaders schedule billing twice. From inside a partition, “the leader is dead” and “I can’t reach the leader” look identical.',
      ],
      changes: [{ text: 'Partition → two leaders', tone: 'bad' }],
      scene: {
        nodes: [halo(), ...cluster({ 1: { tone: 'orange', tag: pill('leader!', 'pin', 'warn') }, 3: { tone: 'orange', tag: pill('leader!', 'pin', 'warn') } })],
        links: [link('n1', 'n2', { arrow: 'both' }), link('n3', 'n4', { arrow: 'both' }), link('n4', 'n5', { arrow: 'both' }), link('n2', 'n3', { style: 'broken' }), link('n5', 'n1', { style: 'broken' })],
        flows: [flow(['n1', 'n2'], { kind: 'handshake', back: true, rate: 0.8 }), flow(['n3', 'n4'], { kind: 'handshake', back: true, rate: 0.8 })],
        metrics: { term: '—', leader: { v: 'N1 and N3', tone: 'bad' }, commit: '—', quorum: 'none' },
      },
    },
    {
      short: 'Majority',
      kind: 'technique',
      title: 'Require a majority',
      body: [
        'Rule: a node becomes leader only with votes from a <b>majority</b> — 3 of 5. Any two majorities of the same group must share at least one node, and each node votes once per election. So two leaders can never be elected in the same round.',
        'In the partition, {N3, N4, N5} can elect a leader; {N1, N2} cannot and stays leaderless. The minority loses availability — the CAP trade, made explicit.',
      ],
      note: { kind: 'tip', text: 'A cluster of 2f+1 nodes tolerates f failures: 3 nodes survive 1, 5 survive 2. Adding a fourth node adds cost without adding tolerance.' },
      changes: [{ text: 'Only the side with 3 nodes elects', tone: 'good' }],
      concepts: [{ term: 'Quorum (majority)', def: 'More than half of the nodes; any two quorums overlap, which prevents conflicting decisions.' }],
      scene: {
        nodes: [halo(), ...cluster({ 1: { state: 'dim', tag: pill('no quorum', 'x') }, 2: { state: 'dim' }, 3: { tone: 'orange', tag: pill('leader (3 votes)', 'pin', 'good') } })],
        links: [link('n1', 'n2', { arrow: 'both', style: 'dashed' }), link('n3', 'n4', { arrow: 'both' }), link('n3', 'n5', { arrow: 'both' }), link('n2', 'n3', { style: 'broken' }), link('n5', 'n1', { style: 'broken' })],
        flows: [flow(['n4', 'n3'], { kind: 'handshake', rate: 0.8 }), flow(['n5', 'n3'], { kind: 'handshake', rate: 0.8 })],
        metrics: { term: '—', leader: { v: 'N3 only', tone: 'good' }, commit: '—', quorum: { v: '3 of 5', tone: 'good' } },
      },
    },
    {
      short: 'Election',
      kind: 'technique',
      title: 'A Raft election, step by step',
      body: [
        'In <b>Raft</b>, followers expect regular heartbeats from the leader. If one waits past a <b>randomised</b> timeout (say 150–300 ms) it becomes a candidate, increments the <b>term</b> number, votes for itself and sends <code>RequestVote</code> to everyone.',
        'Nodes grant one vote per term, only to candidates whose log is at least as up to date as their own. With a majority the candidate becomes leader for that term; the random timeouts make simultaneous candidacies rare.',
      ],
      changes: [{ text: 'N4 times out first → term 8', tone: 'good' }, { text: 'Votes from N2, N3, N5', tone: 'good' }],
      concepts: [
        { term: 'Raft', def: 'A consensus algorithm built around a strong leader, terms, randomised election timeouts and a replicated log.' },
        { term: 'Term', def: 'A monotonically increasing election epoch; each term has at most one leader.' },
      ],
      scene: {
        nodes: [halo(), ...cluster({ 4: { tone: 'yellow', tag: pill('candidate · term 8', 'hash', 'accent') }, 1: { state: 'down' } })],
        links: others(4, [2, 3, 5]).map((n) => link('n4', n, { arrow: 'both' })),
        flows: [...others(4, [2, 3, 5]).map((n) => flow(['n4', n], { kind: 'handshake', back: true, rate: 0.8 }))],
        metrics: { term: '8', leader: 'electing…', commit: '41', quorum: '3 of 5' },
      },
    },
    {
      short: 'Log',
      kind: 'technique',
      title: 'Replicate a log, commit on majority',
      body: [
        'Consensus isn’t only about the leader — it’s about agreeing on a <b>sequence</b> of commands. A client sends <code>assign billing → worker 7</code>; the leader appends it to its log and sends <code>AppendEntries</code> to followers.',
        'Once a majority has stored the entry, it’s <b>committed</b>: the leader applies it and replies to the client, and followers apply it as they learn the commit index. Every node applies the same commands in the same order — a replicated state machine.',
      ],
      changes: [{ text: 'Entry 42 on 3 of 5 → committed', tone: 'good' }],
      concepts: [{ term: 'Replicated state machine', def: 'Nodes that apply the same deterministic commands in the same order end up in the same state.' }],
      scene: {
        nodes: [client({ tag: pill('assign billing', 'list') }), halo(), ...cluster({ 4: { tone: 'orange', tag: pill('leader · term 8', 'pin', 'good') }, 3: { tag: pill('42 ✓') }, 5: { tag: pill('42 ✓') }, 2: { tag: pill('41', 'clock') }, 1: { state: 'down' } })],
        links: [link('client', 'n4', { arrow: 'both' }), ...others(4, [2, 3, 5]).map((n) => link('n4', n))],
        flows: [flow(['client', 'n4'], { kind: 'request', back: true, rate: 0.6 }), ...others(4, [2, 3, 5]).map((n) => flow(['n4', n], { kind: 'write', back: true, rate: 0.9 }))],
        metrics: { term: '8', leader: 'N4', commit: { v: '42', tone: 'good' }, quorum: '3 of 5' },
      },
    },
    {
      short: 'Crash',
      kind: 'case',
      title: 'The leader crashes mid-stream',
      body: [
        'N4 dies. Followers time out and N3 wins term 9. Did committed entry 42 survive? Yes: it was on a majority, and a candidate only wins votes if its log is at least as up to date as each voter’s — so any new leader must already hold every committed entry.',
        'Entries the old leader appended but never got onto a majority may be overwritten. That’s safe, because no client was ever told they succeeded.',
      ],
      note: { kind: 'key', text: 'Committed means “on a majority”, and every future leader comes from a majority — the two overlaps are what make Raft safe.' },
      changes: [{ text: 'N4 down', tone: 'bad' }, { text: 'N3 leader, term 9, entry 42 intact', tone: 'good' }],
      scene: {
        nodes: [client(), halo(), ...cluster({ 4: { state: 'down' }, 3: { tone: 'orange', tag: pill('leader · term 9', 'pin', 'good') }, 1: { state: 'down' } })],
        links: [link('client', 'n3', { arrow: 'both' }), link('n3', 'n2'), link('n3', 'n5')],
        flows: [flow(['n3', 'n2'], { kind: 'write', back: true, rate: 0.9 }), flow(['n3', 'n5'], { kind: 'write', back: true, rate: 0.9 }), flow(['client', 'n3'], { back: true, rate: 0.5 })],
        metrics: { term: '9', leader: 'N3', commit: '42', quorum: { v: '3 of 5 alive', tone: 'warn' } },
      },
    },
    {
      short: 'Stale leader',
      kind: 'problem',
      title: 'An old leader that doesn’t know it’s old',
      body: [
        'Suppose N3 is partitioned into a minority. It still believes it leads term 9 and keeps accepting client requests — but it can’t commit anything without a majority, so those clients hang. Meanwhile the majority elects N5 in term 10.',
        'Raft is safe here, but side effects outside the log aren’t: if N3 had “the billing lock” and calls the payment API directly, it might still do so. That’s why external resources need <b>fencing tokens</b> — the term number — and must reject requests from older terms.',
      ],
      changes: [{ text: 'N3 isolated, can’t commit', tone: 'bad' }, { text: 'N5 leads term 10', tone: 'good' }],
      concepts: [{ term: 'Leader lease', def: 'A time-bounded promise of leadership; the leader stops acting before its lease could have expired elsewhere.' }],
      scene: {
        nodes: [client({ tag: pill('waiting…', 'clock', 'warn') }), halo(), ...cluster({ 3: { tone: 'orange', state: 'dim', tag: pill('term 9 (stale)', 'alert', 'warn') }, 5: { tone: 'orange', tag: pill('leader · term 10', 'pin', 'good') } })],
        links: [link('client', 'n3'), link('n3', 'n2', { style: 'broken' }), link('n3', 'n4', { style: 'broken' }), link('n5', 'n1'), link('n5', 'n2'), link('n5', 'n4')],
        flows: [flow(['n3', 'n4'], { kind: 'fail', rate: 0.6 }), flow(['n5', 'n1'], { kind: 'write', back: true, rate: 0.8 }), flow(['n5', 'n4'], { kind: 'write', back: true, rate: 0.8 })],
        metrics: { term: '10', leader: 'N5', commit: '44', quorum: '3 of 5' },
      },
    },
    {
      short: 'Use, not build',
      kind: 'insight',
      title: 'Use a consensus service — don’t write one',
      body: [
        'Correct consensus is notoriously subtle. Production systems lean on proven implementations: <b>etcd</b> (Raft), <b>ZooKeeper</b> (ZAB), <b>Consul</b>, or the consensus built into databases like CockroachDB and Spanner. Your scheduler takes a lease or an ephemeral lock in etcd instead.',
        'Keep these clusters small (3 or 5 nodes) and their data small — they’re for coordination: leader election, locks, configuration, membership. Every write costs a majority round trip.',
      ],
      scene: {
        nodes: [
          box('etcd', -1, 0, 'etcd', 'yellow', 'key', { size: [1.5, 1.5], height: 40, sub: '3 nodes, Raft', tag: pill('/leader/billing = s2 (lease 10 s)', 'key', 'good') }),
          box('s1', 8, -7, 'Scheduler 1', 'blue', 'server', { size: [1.2, 1.2], height: 30, tag: pill('standby') }),
          box('s2', 9, 0, 'Scheduler 2', 'orange', 'server', { size: [1.2, 1.2], height: 30, tag: pill('leader', 'pin', 'good') }),
          box('s3', 8, 7, 'Scheduler 3', 'blue', 'server', { size: [1.2, 1.2], height: 30, tag: pill('standby') }),
        ],
        links: [link('s1', 'etcd', { style: 'dashed', label: pill('watch') }), link('s2', 'etcd', { arrow: 'both', label: pill('renew lease') }), link('s3', 'etcd', { style: 'dashed' })],
        flows: [flow(['s2', 'etcd'], { kind: 'handshake', back: true, rate: 0.7 })],
        metrics: { term: '—', leader: 'Scheduler 2', commit: '—', quorum: '2 of 3' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Agreement by overlapping majorities',
      body: [
        'Heartbeats alone can’t tell a dead leader from an unreachable one, so naive election creates two leaders. Consensus algorithms like <b>Raft</b> use <b>terms</b>, <b>majority votes</b> and a <b>replicated log</b> committed on a majority — overlapping quorums guarantee one leader per term and no lost committed entries.',
        'Minorities stop making progress, stale leaders must be <b>fenced</b>, and in practice you rent consensus from etcd or ZooKeeper rather than build it.',
      ],
      scene: {
        nodes: [halo(pill('majority = 3', 'users', 'good')), ...cluster({ 5: { tone: 'orange', tag: pill('leader · term 10', 'pin', 'good') } })],
        links: others(5).map((n) => link('n5', n)),
        flows: others(5).map((n) => flow(['n5', n], { kind: 'write', back: true, rate: 0.7 })),
        metrics: { term: '10', leader: 'N5', commit: '44', quorum: '3 of 5' },
      },
    },
  ],
};

export default lesson;
