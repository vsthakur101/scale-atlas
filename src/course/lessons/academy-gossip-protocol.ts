import type { Lesson, SceneNode, Tone } from '../../types';
import { at, flow, link, onRing, pill, ring } from '../kit';

const N = 10;
const C0 = at(0, 0);
const LETTERS = 'ABCDEFGHIJ';
const node = (i: number, state: 'new' | 'told' | 'quiet' | 'dead', extra: Partial<SceneNode> = {}): SceneNode => {
  const tone: Tone = state === 'new' ? 'orange' : state === 'told' ? 'yellow' : state === 'dead' ? 'red' : 'grey';
  return {
    id: `n${i}`,
    kind: 'block',
    at: onRing(C0, 4.6, (i * 360) / N),
    tone,
    name: LETTERS[i],
    size: [1.0, 1.0],
    height: state === 'quiet' ? 14 : 26,
    state: state === 'dead' ? 'down' : 'ok',
    ...extra,
  };
};
/** informed = the set that has the update; fresh = told this round */
const cluster = (informed: number[], fresh: number[] = [], dead: number[] = []): SceneNode[] => [
  ring('ring', 0, 0, 4.6, undefined, { tone: 'sand' }),
  ...Array.from({ length: N }, (_, i) => node(i, dead.includes(i) ? 'dead' : fresh.includes(i) ? 'new' : informed.includes(i) ? 'told' : 'quiet')),
];
const tell = (pairs: [number, number][]) => pairs.map(([a, b]) => link(`n${a}`, `n${b}`, { arrow: 'end' }));
const send = (pairs: [number, number][]) => pairs.map(([a, b]) => flow([`n${a}`, `n${b}`], { kind: 'write', rate: 0.9 }));

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`);

/** Expected rounds for push gossip to reach 99.9% of N nodes. */
function roundsToConverge(n: number, fanout: number): { rounds: number; curve: number[]; messages: number } {
  let informed = 1;
  let rounds = 0;
  let messages = 0;
  const curve = [1];
  while (informed < 0.999 * n && rounds < 400) {
    // each informed node sends `fanout` pushes to uniformly random peers
    const sent = informed * fanout;
    const miss = Math.pow(1 - 1 / Math.max(1, n - 1), sent);
    informed = Math.min(n, informed + (n - informed) * (1 - miss));
    messages += sent;
    rounds++;
    curve.push(informed);
  }
  return { rounds, curve, messages };
}

const lesson: Lesson = {
  slug: 'academy-gossip-protocol',
  title: 'Gossip Protocols: Epidemic Spread of State',
  blurb: 'Spread information through a cluster the way rumours spread: every node tells a few random peers each second — and everyone knows within a handful of rounds.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'rounds', label: 'Rounds to 99.9%', icon: 'refresh' },
    { key: 'time', label: 'Time to converge', icon: 'timer' },
    { key: 'node', label: 'Load per node', icon: 'cpu' },
    { key: 'cluster', label: 'Cluster messages', icon: 'activity' },
  ],
  goals: [
    { text: 'Why all-to-all heartbeats stop scaling', step: 1 },
    { text: 'How a rumour spreads exponentially, then saturates', step: 3 },
    { text: 'Why convergence takes ≈ log N rounds', step: 4 },
    { text: 'Push, pull and push-pull', step: 6 },
    { text: 'Failure detection and what gossip can’t promise', step: 7 },
  ],
  legend: ['write', 'request', 'fail'],
  dynamic: {
    parameters: [
      { key: 'nodes', label: 'Cluster size N', min: 10, max: 10_000, step: 10, default: 1_000, unit: ' nodes', description: 'Nodes taking part in gossip.' },
      { key: 'fanout', label: 'Fan-out f', min: 1, max: 8, step: 1, default: 3, unit: ' peers', description: 'Random peers each node contacts per round.' },
      { key: 'interval', label: 'Gossip interval', min: 100, max: 2_000, step: 100, default: 1_000, unit: ' ms', description: 'Time between rounds. Cassandra gossips every second.' },
      { key: 'loss', label: 'Message loss', min: 0, max: 60, step: 5, default: 5, unit: '%', description: 'Share of gossip messages that never arrive.' },
    ],
    calculate: (input, step) => {
      const n = input.nodes ?? 1_000;
      const f = input.fanout ?? 3;
      const interval = input.interval ?? 1_000;
      const loss = (input.loss ?? 5) / 100;
      const perSecond = 1000 / interval;
      const allToAll = n * (n - 1) * perSecond;
      const gossip = n * f * perSecond;
      if (step === 0) {
        return {
          rounds: { v: '1 (all at once)' },
          time: { v: `${interval} ms` },
          node: { v: `${fmtN((n - 1) * perSecond)}/s`, tone: n > 500 ? 'bad' : 'warn' },
          cluster: { v: `${fmtN(allToAll)}/s`, tone: allToAll > 500_000 ? 'bad' : 'warn' },
        };
      }
      const effective = f * (1 - loss);
      const { rounds } = roundsToConverge(n, effective);
      const seconds = (rounds * interval) / 1000;
      return {
        rounds: { v: `${rounds}`, tone: rounds <= 12 ? 'good' : rounds <= 25 ? 'warn' : 'bad' },
        time: { v: seconds >= 10 ? `${Math.round(seconds)} s` : `${seconds.toFixed(1)} s`, tone: seconds <= 10 ? 'good' : seconds <= 30 ? 'warn' : 'bad' },
        node: { v: `${f * perSecond < 10 ? (f * perSecond).toFixed(1) : Math.round(f * perSecond)}/s`, tone: 'good' },
        cluster: { v: `${fmtN(gossip)}/s`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'All-to-all',
      kind: 'problem',
      title: 'Everyone telling everyone doesn’t scale',
      body: [
        'A database cluster must know which nodes are alive, which own which data, and when that changes. The obvious design — every node pings every other node each second — sends <code>N × (N − 1)</code> messages per interval.',
        'At 1,000 nodes that is about a million messages a second just to say “I’m here”, and each node handles 999 of them. Add nodes and the traffic grows with the <b>square</b>. A central registry avoids that cost but becomes a single point of failure.',
      ],
      changes: [{ text: '1,000 nodes → ~1M heartbeats/s', tone: 'bad' }],
      concepts: [{ term: 'All-to-all heartbeating', def: 'Every node periodically contacts every other node: N(N−1) messages per round.' }],
      scene: {
        nodes: cluster([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
        links: [...tell([[0, 3], [0, 5], [0, 7], [2, 6], [2, 8], [4, 9], [1, 6], [3, 8]]).map((l) => ({ ...l, arrow: 'both' as const }))],
        flows: send([[0, 5], [2, 8], [4, 9], [1, 6], [3, 8], [7, 0]]),
      },
    },
    {
      short: 'The idea',
      kind: 'technique',
      title: 'Each round, tell a few random peers',
      body: [
        'In a <b>gossip protocol</b> every node wakes up once per interval, picks a few random peers (the <b>fan-out</b>, often 1–3), and exchanges what it knows. Nobody talks to everyone, and nobody is in charge.',
        'Node A learns something — say, that a new node joined. In round 1 it tells two random peers (B and G). Both now know. A started with the news; now three nodes do.',
      ],
      changes: [{ text: 'Round 1: A tells B and G → 3 nodes know' }],
      concepts: [
        { term: 'Gossip (epidemic) protocol', def: 'Nodes periodically exchange state with randomly chosen peers, so information spreads like an epidemic.' },
        { term: 'Fan-out', def: 'How many peers a node contacts per gossip round.' },
      ],
      scene: {
        nodes: cluster([0, 1, 6], [1, 6]),
        links: tell([[0, 1], [0, 6]]),
        flows: send([[0, 1], [0, 6]]),
      },
    },
    {
      short: 'Exponential',
      kind: 'insight',
      title: 'The news roughly doubles every round — then saturates',
      body: [
        'In round 2 the three informed nodes each pick two peers: up to six new nodes. Early on, almost every message reaches someone who hadn’t heard, so the informed set grows <b>exponentially</b>.',
        'Later it slows: with most nodes informed, random picks increasingly land on nodes that already know. The curve is an S-shape (logistic). The first 90% takes few rounds; the last stragglers take a few more.',
      ],
      changes: [{ text: 'Round 2: 3 → 9 nodes' }, { text: 'Last 10% takes the longest' }],
      scene: {
        nodes: cluster([0, 1, 6, 2, 3, 5, 7, 8], [2, 3, 5, 7, 8]),
        links: tell([[0, 2], [1, 3], [1, 5], [6, 7], [6, 8]]),
        flows: send([[0, 2], [1, 3], [1, 5], [6, 7], [6, 8]]),
      },
    },
    {
      short: 'Rounds',
      kind: 'technique',
      title: 'Convergence takes about log N rounds',
      body: [
        'If every node contacts f random peers per round, the expected number of informed nodes after each round follows directly: <code>informed += (N − informed) × (1 − (1 − 1/(N−1))^(f · informed))</code>. For fan-out 1 the classic result is <code>log₂N + ln N + O(1)</code> rounds.',
        'The key property: rounds grow with the <b>logarithm</b> of the cluster size. Ten times more nodes costs only a couple of extra rounds (about two at fan-out 3). Use the sliders: 1,000 nodes, fan-out 3, 1-second rounds converges in about 8 seconds; 10,000 nodes adds roughly two more rounds.',
      ],
      note: { kind: 'tip', text: 'Convergence time is rounds × interval. Halving the interval halves the time but doubles every node’s traffic.' },
      changes: [{ text: 'N = 1,000, f = 3 → ~8 rounds' }, { text: 'N × 10 → only a few more rounds' }],
      concepts: [{ term: 'Convergence time', def: 'Rounds until (nearly) every node has the update; grows as O(log N) for gossip.' }],
      scene: {
        nodes: cluster([0, 1, 2, 3, 4, 5, 6, 7, 8]),
        links: tell([[8, 9], [3, 9], [5, 9]]).map((l) => ({ ...l, style: 'dashed' as const })),
        flows: send([[8, 9], [3, 9]]),
      },
    },
    {
      short: 'Cost',
      kind: 'technique',
      title: 'Cost per node stays constant as the cluster grows',
      body: [
        'Each node sends <b>f</b> messages per interval no matter how large the cluster is. At f = 3 and one-second rounds that is three small messages a second — whether N is 100 or 10,000. Total cluster traffic is <code>N × f</code> per round, linear in N, instead of N².',
        'At N = 1,000 that’s about 3,000 messages a second against roughly a million for all-to-all, a 330× saving, and the gap widens with every node you add. Messages are small and carry a digest of state, not the whole state.',
      ],
      changes: [{ text: 'Per-node load: f msgs/round, independent of N', tone: 'good' }, { text: '3k/s vs 1M/s at N = 1,000', tone: 'good' }],
      scene: {
        nodes: cluster([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
        links: tell([[0, 4], [0, 7], [0, 2], [5, 1], [5, 9], [5, 3]]),
        flows: send([[0, 4], [0, 7], [5, 1], [5, 9]]),
      },
    },
    {
      short: 'Push / pull',
      kind: 'tradeoff',
      title: 'Push, pull, or both',
      body: [
        '<b>Push</b>: informed nodes send the update to others — efficient early, when few know, but wasteful at the end when most targets already have it. <b>Pull</b>: nodes ask a peer “anything new?” — poor early, but in the tail every uninformed node’s random pull is likely to hit an informed one.',
        '<b>Push-pull</b> exchanges state in both directions each round and gets the best of both: fast start and a fast tail. Most real systems (Cassandra, Consul’s Serf) use push-pull digests and then transfer only the differences.',
      ],
      changes: [{ text: 'Push-pull: fast start and fast tail' }],
      concepts: [
        { term: 'Push gossip', def: 'The node holding news sends it to random peers.' },
        { term: 'Pull gossip', def: 'A node asks random peers for anything it is missing.' },
      ],
      scene: {
        nodes: cluster([0, 1, 2, 3, 4, 5, 6, 7], [8]),
        links: [link('n8', 'n2', { arrow: 'end', label: pill('pull: “news?”') }), link('n2', 'n8', { arrow: 'end', style: 'dashed' })],
        flows: [flow(['n8', 'n2'], { kind: 'request', back: true, rate: 0.9 })],
      },
    },
    {
      short: 'Failures',
      kind: 'technique',
      title: 'Detecting a dead node without a coordinator',
      body: [
        'Each node keeps a heartbeat counter that it increments and gossips. If node C’s counter stops increasing in everyone’s view, it’s suspected. Cassandra’s <b>phi-accrual detector</b> turns the gap into a suspicion level that adapts to normal jitter instead of using a fixed timeout.',
        'SWIM-style protocols (used by Serf and Consul) add <b>indirect probes</b>: before declaring a silent node dead, ask a few other nodes to ping it, which filters out one broken network path. A suspicion state with a short grace period reduces false alarms.',
      ],
      changes: [{ text: 'C’s heartbeat stalls → suspected → confirmed' }],
      concepts: [
        { term: 'Phi-accrual failure detector', def: 'Outputs a continuous suspicion level based on how late a heartbeat is compared with its usual arrival pattern.' },
        { term: 'SWIM', def: 'Scalable weakly-consistent infection-style membership: gossip with indirect probes and a suspicion phase.' },
      ],
      scene: {
        nodes: cluster([0, 1, 3, 4, 5, 6, 7, 8, 9], [], [2]),
        links: [link('n1', 'n2', { arrow: 'end', style: 'broken' }), link('n4', 'n1', { arrow: 'end', label: pill('“is C alive?”') })],
        flows: [flow(['n1', 'n2'], { kind: 'fail', rate: 0.8 }), flow(['n4', 'n1'], { kind: 'request', back: true, rate: 0.6 })],
      },
    },
    {
      short: 'Limits',
      kind: 'case',
      title: 'What gossip does not give you',
      body: [
        'Gossip is <b>eventually consistent</b>: for a few seconds different nodes disagree about membership or state, and there is no global order of events. Use it for metadata that tolerates that — membership, health, schema versions, cluster topology — not for decisions that need agreement, which need consensus (Raft, Paxos).',
        'Loss and partitions slow it down but rarely break it: at 40% message loss the effective fan-out drops to 60% of f, adding a few rounds (try the loss slider). When a partition heals, the two sides’ states merge on the next rounds. Seed nodes help new members find their first peers.',
      ],
      changes: [{ text: 'Eventually consistent, not ordered', tone: 'bad' }, { text: 'Heals itself after loss or partition', tone: 'good' }],
      scene: {
        nodes: cluster([0, 1, 2, 3, 4], [], [9]),
        links: [link('n4', 'n5', { arrow: 'end', style: 'broken' }), link('n3', 'n6', { arrow: 'end', style: 'broken' })],
        flows: [flow(['n4', 'n5'], { kind: 'fail', rate: 0.6 }), flow(['n3', 'n6'], { kind: 'fail', rate: 0.6 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Cheap, robust, probabilistic spreading',
      body: [
        'Gossip replaces N² chatter with <b>f random contacts per node per round</b>: constant load per node, linear total traffic, and convergence in about <b>log N</b> rounds — tolerant of lost messages and failed nodes, with no coordinator.',
        'It buys scalability and resilience at the price of strict consistency. Use it for membership, failure detection and slowly-changing metadata, and pair it with a consensus system when you need a single agreed answer.',
      ],
      scene: {
        nodes: cluster([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
        links: tell([[0, 4], [3, 8], [6, 1]]),
        flows: send([[0, 4], [3, 8], [6, 1]]),
      },
    },
  ],
};

export default lesson;
