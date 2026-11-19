import type { Lesson, SceneNode } from '../../types';
import { at, box, flow, link, onRing, pill, ring } from '../kit';

const C0 = at(0, 0);
const N = 6;
const ringNodes = (down = -1, extra: Record<number, Partial<SceneNode>> = {}): SceneNode[] => [
  ring('ring', 0, 0, 4.4, undefined, { tone: 'sand' }),
  ...Array.from({ length: N }, (_, i): SceneNode => ({
    id: `n${i}`,
    kind: 'block',
    at: onRing(C0, 4.4, (i * 360) / N + 30),
    tone: i === down ? 'red' : 'blue',
    name: 'ABCDEF'[i],
    size: [1.15, 1.15],
    height: 30,
    state: i === down ? 'down' : 'ok',
    ...extra[i],
  })),
];
const mesh = (): ReturnType<typeof link>[] => {
  const out: ReturnType<typeof link>[] = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) out.push(link(`n${i}`, `n${j}`, { arrow: 'none', style: 'dashed' }));
  return out;
};

const fmtT = (ms: number): string => (ms >= 60000 ? `${(ms / 60000).toFixed(1)} min` : ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`);
const fmtR = (r: number): string => (r >= 1e6 ? `${(r / 1e6).toFixed(1)}M/s` : r >= 1e3 ? `${(r / 1e3).toFixed(1)}k/s` : `${r.toFixed(r < 10 ? 1 : 0)}/s`);
const fmtRate = (x: number): string => (x >= 10 ? x.toFixed(0) : x >= 0.1 ? x.toFixed(2) : x >= 0.001 ? x.toFixed(4) : x.toExponential(1));

const lesson: Lesson = {
  slug: 'source-how-to-detect-node-failures-in-distributed-systems',
  title: 'Detecting Node Failures',
  blurb: 'Heartbeats, timeouts, indirect probes and adaptive detectors: why a dead node cannot be told apart from a slow one, and what each design trades.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'detect', label: 'Time to suspect a dead node', icon: 'clock' },
    { key: 'false', label: 'False alarms / hour (cluster)', icon: 'alert' },
    { key: 'msgs', label: 'Heartbeat traffic: all-to-all', icon: 'share' },
    { key: 'swim', label: 'Heartbeat traffic: SWIM-style', icon: 'activity' },
  ],
  goals: [
    { text: 'Why “dead” and “slow” look identical from outside', step: 1 },
    { text: 'The detection-speed versus false-alarm trade-off', step: 3 },
    { text: 'Why all-to-all heartbeats don’t scale', step: 4 },
    { text: 'Indirect probes and gossip (SWIM)', step: 5 },
    { text: 'Adaptive detectors (phi accrual)', step: 6 },
  ],
  legend: ['request', 'response', 'fail', 'write'],
  dynamic: {
    parameters: [
      { key: 'interval', label: 'Heartbeat interval', min: 100, max: 5000, step: 100, default: 1000, unit: ' ms', description: 'Time between heartbeats from each monitored node.' },
      { key: 'k', label: 'Missed beats before suspecting', min: 1, max: 10, step: 1, default: 3, unit: '', description: 'Consecutive missed heartbeats that trigger suspicion.' },
      { key: 'loss', label: 'Heartbeat loss or lateness', min: 0, max: 30, step: 0.5, default: 1, unit: '%', description: 'Chance a single heartbeat is lost or arrives too late to count.' },
      { key: 'nodes', label: 'Cluster size', min: 3, max: 2000, step: 1, default: 100, unit: '', description: 'Nodes that need to know about each other’s health.' },
    ],
    calculate: (input, step) => {
      const interval = Math.max(10, input.interval ?? 1000);
      const k = Math.max(1, Math.round(input.k ?? 3));
      const loss = Math.min(1, Math.max(0, (input.loss ?? 1) / 100));
      const n = Math.max(3, Math.round(input.nodes ?? 100));
      const detect = k * interval;
      // One monitor wrongly suspects a live node when k consecutive heartbeats are all lost.
      const falsePerHourPerPair = (3600000 / interval) * Math.pow(loss, k);
      const falsePerHour = falsePerHourPerPair * n; // each node monitored by one detector at a time (ring), not n−1
      const allToAll = (n * (n - 1)) / (interval / 1000);
      // SWIM: each node probes one random peer per period, plus up to 3 indirect probes when needed.
      const swim = (n * 2) / (interval / 1000);
      return {
        detect: step < 2 ? { v: '—' } : { v: fmtT(detect), tone: detect > 10000 ? 'warn' : 'good' },
        false: step < 2 ? { v: '—' } : { v: fmtRate(falsePerHour), tone: falsePerHour < 0.1 ? 'good' : falsePerHour < 5 ? 'warn' : 'bad' },
        msgs: step < 3 ? { v: '—' } : { v: fmtR(allToAll), tone: allToAll > 50000 ? 'bad' : allToAll > 5000 ? 'warn' : 'good' },
        swim: step < 4 ? { v: '—' } : { v: fmtR(swim), tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Dead or slow',
      kind: 'problem',
      title: 'Silence has more than one explanation',
      body: [
        'Node A hasn’t heard from B. B may have <b>crashed</b>; or be in a long GC pause; or the <b>network</b> between them dropped packets; or B is perfectly healthy and <i>A</i> is the one with trouble. From A’s side all of these are the same observation: no reply.',
        'This is a fundamental result: in an asynchronous network, a <b>perfect</b> failure detector is impossible. What you can build is a <b>suspicion</b> mechanism — decide to treat a node as failed after some evidence — and pick where to sit between “slow to notice real failures” and “often wrong about healthy nodes”.',
      ],
      scene: { nodes: ringNodes(1, { 0: { tag: pill('no reply from B…', 'clock', 'warn') } }), links: [link('n0', 'n1', { style: 'dashed', arrow: 'both' })], flows: [flow(['n0', 'n1'], { rate: 0.8 }), flow(['n1', 'n0'], { kind: 'fail', rate: 0.5, speed: 0.4 })] },
    },
    {
      short: 'Heartbeats',
      kind: 'technique',
      title: 'Heartbeats and timeouts',
      body: [
        'The basic mechanism: every node sends a small “I’m alive” message every <code>T</code> ms (or is polled by a monitor). If nothing is seen for a <b>timeout</b>, the monitor marks the node suspect. Detection time ≈ <code>timeout</code> — with the usual choice of “<code>k</code> missed beats”, <code>k × T</code>.',
        'It’s cheap, simple and universal: load balancers health-check backends this way, Kubernetes liveness probes, ZooKeeper sessions, Raft leader heartbeats that trigger elections. The one parameter that matters is the timeout.',
      ],
      concepts: [{ term: 'Heartbeat', def: 'A periodic liveness message; absence for longer than a timeout makes the sender suspect.' }],
      scene: { nodes: ringNodes(-1, { 0: { tag: pill('monitor', 'search') } }), links: [link('n1', 'n0', { arrow: 'end' }), link('n2', 'n0', { arrow: 'end' })], flows: [flow(['n1', 'n0'], { rate: 1.5 }), flow(['n2', 'n0'], { rate: 1.5 })] },
    },
    {
      short: 'Trade-off',
      kind: 'tradeoff',
      title: 'Fast detection versus false alarms',
      body: [
        'A short timeout notices real failures quickly but mistakes a loaded or briefly unreachable node for a dead one — triggering failovers, re-replication and leader elections that are <b>themselves expensive</b> and can make the overload worse (a “detection storm”). A long timeout is calm and slow: users wait while a dead node is still being routed to.',
        'The model: if each heartbeat is lost or late with probability <code>p</code>, a healthy node is falsely suspected when <code>k</code> in a row go missing: <code>p^k</code> per window. At p = 1%, k = 3 and 1 s heartbeats that is one wrong suspicion per million windows — across 100 nodes, roughly <b>0.36 false alarms an hour</b>. Drop k to 1 and the same cluster raises about one false alarm every second; raise p on a flaky network and it gets worse.',
      ],
      changes: [{ text: 'Detection time ≈ k × interval', tone: 'info' }, { text: 'False suspicion ≈ pᵏ per window', tone: 'info' }, { text: 'k = 1 at 1% loss → ~3,600 false alarms an hour (100 nodes)', tone: 'bad' }],
      scene: { nodes: ringNodes(-1, { 3: { tone: 'orange', tag: pill('slow, not dead', 'clock', 'warn') }, 0: { tag: pill('wrongly suspects D', 'alert', 'bad') } }), links: [link('n0', 'n3', { style: 'dashed', arrow: 'both' })], flows: [flow(['n0', 'n3'], { rate: 0.8 })] },
    },
    {
      short: 'All-to-all',
      kind: 'problem',
      title: 'Everyone monitoring everyone does not scale',
      body: [
        'If every node heartbeats every other, traffic is <code>n × (n − 1) ÷ T</code> messages a second: 100 nodes at 1 s intervals is <b>9,900/s</b>; 1,000 nodes is ~1 million/s, and each node processes 1,000 heartbeats a second just to know who’s alive. Quadratic growth turns the detector into the load.',
        'The first cut is structure: monitor only a few neighbours (a ring, or a small random set), or let a central coordinator (a ZooKeeper-style service) hold membership. The ring is cheap but one monitor’s opinion is one point of view — and a single lossy link makes it cry wolf.',
      ],
      changes: [{ text: 'n(n−1)/T grows quadratically', tone: 'bad' }, { text: 'Monitor a few peers or use a coordinator', tone: 'good' }],
      scene: { nodes: ringNodes(), links: mesh(), flows: [flow(['n0', 'n3'], { rate: 1 }), flow(['n1', 'n4'], { rate: 1 }), flow(['n2', 'n5'], { rate: 1 })] },
    },
    {
      short: 'SWIM',
      kind: 'technique',
      title: 'Indirect probes and gossip (SWIM)',
      body: [
        '<b>SWIM</b> keeps per-node cost constant. Each period a node pings <i>one</i> random peer. No reply? Don’t accuse yet — ask <b>k other nodes to ping it for you</b> (indirect probe). If anyone reaches it, it’s alive and the problem was the single link. If nobody does, mark it <b>suspect</b>, give it a grace period to refute, and only then declare it dead.',
        'Membership changes spread by piggybacking on the same ping messages — <b>gossip</b> — so everyone converges in O(log n) periods with no extra traffic. Message load is ~2 per node per period regardless of cluster size (the SWIM metric above), and independent witnesses slash false positives from a single bad link. Consul and Cassandra’s gossip use this family of ideas.',
      ],
      changes: [{ text: 'Ping 1 random peer; if silent, ask others to probe', tone: 'good' }, { text: 'Suspect → grace period → dead', tone: 'good' }],
      concepts: [{ term: 'Indirect probe', def: 'Asking other nodes to contact a silent node on your behalf, to tell a failed node from a failed link.' }],
      scene: { nodes: ringNodes(2, { 0: { tag: pill('ping C: silent', 'search', 'warn') }, 4: { tag: pill('probe C for A', 'route') }, 5: { tag: pill('probe C for A', 'route') } }), links: [link('n0', 'n2', { style: 'dashed' }), link('n0', 'n4'), link('n0', 'n5'), link('n4', 'n2', { style: 'dashed' }), link('n5', 'n2', { style: 'dashed' })], flows: [flow(['n0', 'n4', 'n2'], { rate: 1 }), flow(['n0', 'n5', 'n2'], { rate: 1 })] },
    },
    {
      short: 'Phi accrual',
      kind: 'technique',
      title: 'Adaptive thresholds: phi accrual',
      body: [
        'A fixed timeout is wrong on every network that isn’t constant. The <b>φ accrual detector</b> (used in Cassandra and Akka) learns the distribution of heartbeat inter-arrival times and outputs a continuous <b>suspicion level</b> φ — roughly, how surprising the current silence is (φ = 1 means ~10% chance it’s still alive; φ = 8, about one in 10⁸). The application picks a threshold.',
        'On a jittery link the detector widens by itself; on a rock-steady one it tightens. Different consumers can use different thresholds: a load balancer might react at φ = 3, while a database waits for φ = 8 before re-replicating terabytes. It replaces “alive/dead” with <i>how confident are we?</i>.',
      ],
      changes: [{ text: 'Learns inter-arrival times; outputs φ', tone: 'good' }, { text: 'Each consumer chooses its own threshold', tone: 'good' }],
      concepts: [{ term: 'φ accrual detector', def: 'A failure detector that outputs a suspicion score from the probability of the observed silence under the learned heartbeat distribution.' }],
      scene: { nodes: [box('hist', -8, 0, 'Heartbeat history', 'teal', 'list', { size: [1.4, 1.4], height: 26, tag: pill('mean, jitter', 'activity') }), box('phi', 4, 0, 'φ score', 'purple', 'gauge', { size: [1.4, 1.4], height: 30, tag: pill('φ = 8.2', 'gauge', 'warn') }), box('act', 15, 0, 'Failover at φ > 8', 'red', 'alert', { size: [1.3, 1.3], height: 26 })], links: [link('hist', 'phi', { arrow: 'end' }), link('phi', 'act', { arrow: 'end' })], flows: [flow(['hist', 'phi', 'act'], { rate: 1 })] },
    },
    {
      short: 'Acting',
      kind: 'insight',
      title: 'What to do once you suspect',
      body: [
        'Detection is only half the system: <b>acting</b> on a false positive must be safe. Don’t promote a new leader while the old one may still be writing — use <b>leases and fencing tokens</b> (see the Distributed Locks lesson) so a wrongly-deposed node can’t do damage. Delay expensive reactions such as re-replicating data: a node that reboots in two minutes shouldn’t trigger a terabyte copy.',
        'Practical settings: heartbeats a few times faster than the failure you must catch; k of 3–5; indirect probes in larger clusters; a longer, rate-limited path for destructive actions than for routing around the node. Figures here are model outputs for sizing, not benchmarks.',
      ],
      scene: { nodes: ringNodes(2, { 0: { tag: pill('route around C now', 'route', 'good') }, 3: { tag: pill('re-replicate only after 10 min', 'clock', 'accent') } }), links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Suspicion, not certainty',
      body: [
        'Failures can’t be detected perfectly, only <b>suspected</b>. Heartbeats with k missed beats set detection time (k × T) against false-alarm rate (≈ pᵏ). All-to-all monitoring is quadratic; <b>SWIM</b> uses a random ping, indirect probes and gossip to stay constant per node; <b>φ accrual</b> adapts thresholds to the network.',
        'Make every reaction to a suspicion safe if it turns out to be wrong — fencing, lease-based leadership, delayed and rate-limited recovery — and you can afford to detect quickly.',
      ],
      scene: { nodes: ringNodes(), links: [link('n0', 'n1', { arrow: 'both' }), link('n2', 'n3', { arrow: 'both' }), link('n4', 'n5', { arrow: 'both' })], flows: [flow(['n0', 'n1'], { rate: 1 }), flow(['n2', 'n3'], { rate: 1 }), flow(['n4', 'n5'], { rate: 1 })] },
    },
  ],
};

export default lesson;
