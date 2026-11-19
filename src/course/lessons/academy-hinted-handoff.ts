import type { Lesson, SceneNode, Tone } from '../../types';
import { at, box, flow, link, onRing, pill, ring } from '../kit';

/**
 * Six-node ring. Key "cart:81" has preference list A, B, C (N = 3); D and E are the
 * next nodes clockwise and act as stand-ins when a replica is down.
 */
type Role = 'replica' | 'standin' | 'idle' | 'down';
const C0 = at(0, 0);
const NAMES = 'ABCDEF';
const tone = (r: Role): Tone => (r === 'replica' ? 'blue' : r === 'standin' ? 'teal' : r === 'down' ? 'red' : 'grey');
const ringNodes = (roles: Role[], extra: Record<number, Partial<SceneNode>> = {}): SceneNode[] => [
  ring('ring', 0, 0, 4.4, undefined, { tone: 'sand' }),
  ...roles.map(
    (r, i): SceneNode => ({
      id: `n${i}`,
      kind: 'block',
      at: onRing(C0, 4.4, (i * 360) / roles.length + 30),
      tone: tone(r),
      name: NAMES[i],
      size: [1.15, 1.15],
      height: 30,
      state: r === 'down' ? 'down' : 'ok',
      ...extra[i],
    }),
  ),
];
const coord = (extra: Partial<SceneNode> = {}): SceneNode => box('coord', 0, 0, 'Coordinator', 'orange', 'route', { size: [1.3, 1.3], height: 34, ...extra });
const put = (to: number[], style: 'solid' | 'dashed' = 'solid') => to.map((i) => link('coord', `n${i}`, { arrow: 'end', style }));
const putFlow = (to: number[]) => to.map((i) => flow(['coord', `n${i}`], { kind: 'write', rate: 0.9 }));

const fmtBytes = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} KB`);
const fmtDur = (s: number): string => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${(s / 60).toFixed(s < 600 ? 1 : 0)} min` : `${(s / 3600).toFixed(1)} h`);

/** P(at least w of m independent nodes are up), each up with probability a. */
function atLeast(m: number, w: number, a: number): number {
  let total = 0;
  let choose = 1;
  for (let i = 0; i <= m; i++) {
    if (i > 0) choose = (choose * (m - i + 1)) / i;
    if (i >= w) total += choose * Math.pow(a, i) * Math.pow(1 - a, m - i);
  }
  return total;
}
const nines = (p: number): string => (p > 0.999999 ? '> 99.9999%' : `${(p * 100).toFixed(p > 0.99999 ? 4 : p > 0.9999 ? 3 : 2)}%`);

const N = 3;
const EXTRA = 2;
const HINT_WINDOW_MIN = 180;

const lesson: Lesson = {
  slug: 'academy-hinted-handoff',
  title: 'Hinted Handoff',
  blurb: 'When a replica is down, write to a stand-in with a note saying whom the data belongs to — and hand it over when the node returns.',
  minutes: 12,
  level: 'Advanced',
  metrics: [
    { key: 'strict', label: 'Strict-quorum writes', icon: 'lock' },
    { key: 'sloppy', label: 'Sloppy-quorum writes', icon: 'shield' },
    { key: 'hints', label: 'Hint backlog', icon: 'disk' },
    { key: 'drain', label: 'Replay time', icon: 'timer' },
  ],
  goals: [
    { text: 'Why a strict quorum rejects writes when replicas are down', step: 1 },
    { text: 'How hints and stand-in nodes keep writes available', step: 3 },
    { text: 'Calculating availability, hint volume and replay time', step: 5 },
    { text: 'What sloppy quorums break: read-after-write', step: 7 },
    { text: 'Hint windows, read repair and anti-entropy', step: 8 },
  ],
  legend: ['write', 'request', 'fail', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'avail', label: 'Node availability', min: 90, max: 99.9, step: 0.1, default: 99, unit: '%', description: 'Chance a given node is up when a write arrives (independent failures).' },
      { key: 'w', label: 'Write quorum W (of 3)', min: 1, max: 3, step: 1, default: 2, unit: '', description: 'Replicas that must acknowledge a write.' },
      { key: 'rate', label: 'Cluster writes', min: 500, max: 100_000, step: 500, default: 5_000, unit: '/s', description: 'Writes per second across the cluster (1 KB each).' },
      { key: 'nodes', label: 'Cluster size', min: 6, max: 200, step: 2, default: 30, unit: ' nodes', description: 'Each node is a replica for 3 ÷ size of all writes.' },
      { key: 'outage', label: 'Node outage', min: 1, max: 600, step: 1, default: 30, unit: ' min', description: 'How long one node stays down.' },
      { key: 'throttle', label: 'Replay throttle', min: 1, max: 100, step: 1, default: 10, unit: ' MB/s', description: 'Hint delivery rate to the recovering node.' },
    ],
    calculate: (input, step) => {
      const a = (input.avail ?? 99) / 100;
      const w = Math.round(input.w ?? 2);
      const rate = input.rate ?? 5_000;
      const nodes = input.nodes ?? 30;
      const outage = input.outage ?? 30;
      const throttle = input.throttle ?? 10;
      const strict = atLeast(N, w, a);
      const sloppy = atLeast(N + EXTRA, w, a);
      // writes for which the down node is a replica, 1 KB each
      const hintBytes = ((rate * N) / nodes) * outage * 60 * 1000;
      const drain = hintBytes / (throttle * 1e6);
      const dropped = outage > HINT_WINDOW_MIN;
      return {
        strict: { v: nines(strict), tone: strict > 0.9995 ? 'good' : strict > 0.995 ? 'warn' : 'bad' },
        sloppy: step === 0 ? { v: 'not used' } : { v: nines(sloppy), tone: sloppy > 0.9999 ? 'good' : 'warn' },
        hints: step === 0 ? { v: '0 (writes fail)', tone: 'bad' } : { v: dropped ? `${fmtBytes(((rate * N) / nodes) * HINT_WINDOW_MIN * 60 * 1000)} (capped)` : fmtBytes(hintBytes), tone: hintBytes > 5e9 ? 'bad' : hintBytes > 1e9 ? 'warn' : 'good' },
        drain: step === 0 ? { v: '—' } : { v: dropped ? 'needs repair' : fmtDur(drain), tone: dropped ? 'bad' : drain > 600 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Strict',
      kind: 'problem',
      title: 'A write needs W of its three replicas',
      body: [
        'In a Dynamo-style store each key lives on N = 3 nodes — here A, B and C for the key <code>cart:81</code>. A write is acknowledged once W = 2 of them confirm. If one is down the write still succeeds; if <b>two</b> of those three are down, it fails, even though the rest of the cluster is healthy.',
        'The replicas that must acknowledge are fixed by the key. Nodes D, E and F are up and idle, but the strict quorum won’t let them help.',
      ],
      changes: [{ text: 'B and C down → only 1 of 3 replicas reachable', tone: 'bad' }, { text: 'Write rejected, 3 healthy nodes unused', tone: 'bad' }],
      concepts: [{ term: 'Strict quorum', def: 'Reads and writes must reach W or R of the specific N replicas that own the key.' }],
      scene: {
        nodes: [coord({ tag: pill('write cart:81 needs 2 of A,B,C', 'lock') }), ...ringNodes(['replica', 'down', 'down', 'idle', 'idle', 'idle'], { 1: { tag: pill('down', 'alert', 'bad') }, 2: { tag: pill('down', 'alert', 'bad') } })],
        links: [...put([0]), link('coord', 'n1', { arrow: 'end', style: 'broken' }), link('coord', 'n2', { arrow: 'end', style: 'broken' })],
        flows: [...putFlow([0]), flow(['coord', 'n1'], { kind: 'fail', rate: 0.8 }), flow(['coord', 'n2'], { kind: 'fail', rate: 0.8 })],
      },
    },
    {
      short: 'Availability',
      kind: 'insight',
      title: 'How often that actually bites',
      body: [
        'If each node is up with probability a, a strict quorum works when at least W of the N replicas are up: <code>P = Σ C(N,i) · aⁱ · (1 − a)^(N−i)</code> for i = W…N. At a = 99%, N = 3, W = 2 that is 99.97% — about 2.6 hours of rejected writes a year per key range.',
        'It gets worse fast as nodes get less reliable: at a = 95% it is 99.3%, over 60 hours a year. During rolling restarts, deploys and noisy networks, node availability is exactly what dips.',
      ],
      note: { kind: 'tip', text: 'Drop the availability slider to 95% and watch the strict-quorum number fall while the sloppy one (next steps) barely moves.' },
      changes: [{ text: 'a = 99%: 99.97% writes succeed' }, { text: 'a = 95%: 99.3% — 60 h/yr of failures', tone: 'bad' }],
      scene: {
        nodes: [coord(), ...ringNodes(['replica', 'replica', 'down', 'idle', 'idle', 'idle'], { 2: { tag: pill('down', 'alert', 'bad') } })],
        links: put([0, 1]),
        flows: putFlow([0, 1]),
      },
    },
    {
      short: 'Hint',
      kind: 'technique',
      title: 'Write to a stand-in, with a note',
      body: [
        'With <b>hinted handoff</b>, when replica C is unreachable the coordinator sends C’s copy to the next healthy node clockwise on the ring — D. The message carries a <b>hint</b>: “this belongs to C; deliver it when C is back.” D stores it in a separate local table, not in its normal data.',
        'In the Dynamo design this stand-in counts toward W, a <b>sloppy quorum</b>: A and B plus D’s hinted copy mean the write succeeds with three copies, one of them parked.',
      ],
      changes: [{ text: 'C down → copy goes to D, hint: “for C”', tone: 'good' }, { text: 'Write succeeds with 3 copies', tone: 'good' }],
      concepts: [
        { term: 'Hinted handoff', def: 'Storing a write temporarily on another node, tagged with the intended replica, and delivering it when that replica recovers.' },
        { term: 'Sloppy quorum', def: 'Counting the first N healthy nodes on the ring — not necessarily the key’s own replicas — toward W and R.' },
      ],
      scene: {
        nodes: [coord({ tag: pill('write cart:81', 'bolt') }), ...ringNodes(['replica', 'replica', 'down', 'standin', 'idle', 'idle'], { 2: { tag: pill('down', 'alert', 'bad') }, 3: { tag: pill('hint: for C', 'file', 'good') } })],
        links: [...put([0, 1, 3]), link('coord', 'n2', { arrow: 'end', style: 'broken' })],
        flows: [...putFlow([0, 1, 3]), flow(['coord', 'n2'], { kind: 'fail', rate: 0.6 })],
      },
    },
    {
      short: 'Hand back',
      kind: 'technique',
      title: 'When C returns, D hands the data back',
      body: [
        'D periodically checks whether C is reachable (gossip tells it). When C comes back, D streams the hinted writes to it, in order, and deletes each hint once C acknowledges. C is made whole without any operator action.',
        'Hinted data is normally kept out of D’s own keyspace, so D never serves it to readers on its own behalf — it is a courier, not a replica.',
      ],
      changes: [{ text: 'C recovers → D replays hints → hints deleted', tone: 'good' }],
      scene: {
        nodes: ringNodes(['replica', 'replica', 'replica', 'standin', 'idle', 'idle'], { 2: { tag: pill('back up', 'check', 'good') }, 3: { tag: pill('replaying hints', 'refresh', 'accent') } }),
        links: [link('n3', 'n2', { arrow: 'end', label: pill('hinted writes') })],
        flows: [flow(['n3', 'n2'], { kind: 'write', rate: 2 })],
      },
    },
    {
      short: 'Numbers',
      kind: 'technique',
      title: 'What it buys, and what it costs',
      body: [
        'With a stand-in available, a write only needs W healthy nodes among the first N + extra on the ring — here 3 + 2. At a = 95%, <code>P(≥2 of 5 up)</code> is 99.997%, against 99.3% for the strict quorum: roughly 240× fewer rejected writes.',
        'The cost is stored hints: <code>writes/s × (N ÷ cluster size) × outage × size</code>. At 5,000 writes a second over 30 nodes, a node that is down for 30 minutes leaves about 900 MB of hints for its neighbours, drained at your replay throttle (90 seconds at 10 MB/s). Model it with the sliders.',
      ],
      changes: [{ text: 'a = 95%: strict 99.3% → sloppy 99.997%', tone: 'good' }, { text: '30 min outage → ~900 MB of hints' }],
      concepts: [{ term: 'Hint backlog', def: 'Writes parked on stand-in nodes for a down replica; grows with write rate and outage length.' }],
      scene: {
        nodes: [coord(), ...ringNodes(['replica', 'replica', 'down', 'standin', 'standin', 'idle'], { 2: { tag: pill('down 30 min', 'clock', 'bad') }, 3: { tag: pill('≈ 900 MB hints', 'disk', 'warn') } })],
        links: put([0, 1, 3]),
        flows: putFlow([0, 1, 3]),
      },
    },
    {
      short: 'Replay storm',
      kind: 'case',
      title: 'Case: the recovering node is flattened',
      body: [
        'A node returns after a long maintenance window. Every neighbour starts replaying hints at once, at full speed, on top of live traffic. The node, cold caches and all, is overloaded and goes unresponsive; the neighbours mark it down again and the cycle repeats.',
        'Hint delivery must be <b>throttled</b> (per target and across the cluster) and spread out, so a returning node regains health before it receives everything it missed. Cassandra exposes a hint-delivery throttle for exactly this reason.',
      ],
      changes: [{ text: 'Replay at full speed → node falls over again', tone: 'bad' }, { text: 'Throttle replay; spread across neighbours', tone: 'good' }],
      scene: {
        nodes: ringNodes(['replica', 'replica', 'down', 'standin', 'standin', 'standin'], { 2: { state: 'hot', tag: pill('overloaded by replay', 'alert', 'bad') }, 3: { tag: pill('hints', 'disk') }, 4: { tag: pill('hints', 'disk') }, 5: { tag: pill('hints', 'disk') } }),
        links: [link('n3', 'n2', { arrow: 'end' }), link('n4', 'n2', { arrow: 'end' }), link('n5', 'n2', { arrow: 'end' })],
        flows: [flow(['n3', 'n2'], { kind: 'heavy', rate: 2 }), flow(['n4', 'n2'], { kind: 'heavy', rate: 2 }), flow(['n5', 'n2'], { kind: 'heavy', rate: 2 })],
      },
    },
    {
      short: 'Sloppy',
      kind: 'tradeoff',
      title: 'Sloppy quorums can read stale data',
      body: [
        'The classic guarantee <code>R + W &gt; N</code> means every read overlaps every write — but only for a <b>strict</b> quorum. Suppose a write was acknowledged by A and by D (holding B’s hint). B and C then come back before the hint is delivered. A read of B and C finds no new value: both are stale, although R + W &gt; N holds.',
        'Sloppy quorums therefore trade consistency for write availability. Systems add <b>read repair</b> (fix stale replicas noticed during reads) and <b>anti-entropy</b> using Merkle trees (compare replica digests in the background and sync only differences) to converge, and clients must tolerate temporarily stale or conflicting versions.',
      ],
      changes: [{ text: 'R + W > N no longer guarantees overlap', tone: 'bad' }, { text: 'Read repair + Merkle-tree anti-entropy converge it', tone: 'good' }],
      concepts: [
        { term: 'Read repair', def: 'When a read finds replicas disagreeing, write the newest version back to the stale ones.' },
        { term: 'Anti-entropy (Merkle trees)', def: 'Background comparison of hash trees of each replica’s data to find and sync differing ranges.' },
      ],
      scene: {
        nodes: [coord({ tag: pill('read R = 2: B, C', 'search') }), ...ringNodes(['replica', 'replica', 'replica', 'standin', 'idle', 'idle'], { 0: { tag: pill('new value', 'check', 'good') }, 1: { tag: pill('stale', 'clock', 'bad') }, 2: { tag: pill('stale', 'clock', 'bad') }, 3: { tag: pill('holds hint, not yet sent', 'file', 'warn') } })],
        links: put([1, 2]),
        flows: putFlow([1, 2]).map((f) => ({ ...f, kind: 'request' as const, back: true })),
      },
    },
    {
      short: 'Windows',
      kind: 'case',
      title: 'Hints don’t last forever',
      body: [
        'If a node is down for hours, hints would grow without bound. Cassandra stops storing hints for a node after a <b>maximum hint window</b> (3 hours by default) and eventually expires them. A node that was down longer than the window comes back missing data that no hint will deliver.',
        'That is what <b>repair</b> is for: run an anti-entropy repair after any outage longer than the window. Also note that in Cassandra the hint is stored on the <i>coordinator</i> and, unlike the Dynamo paper’s design, does not count toward the consistency level (except at level ANY) — a difference worth knowing when comparing systems.',
      ],
      note: { kind: 'warn', text: 'Hinted handoff improves availability and speeds recovery, but it is a best-effort optimisation. It is never a substitute for repair.' },
      changes: [{ text: 'Outage > 3 h → hints dropped → run repair', tone: 'bad' }],
      scene: {
        nodes: ringNodes(['replica', 'replica', 'down', 'standin', 'idle', 'idle'], { 2: { tag: pill('down 5 h', 'clock', 'bad') }, 3: { tag: pill('hints expired after 3 h', 'x', 'warn') } }),
        links: [link('n0', 'n2', { arrow: 'both', label: pill('Merkle repair', 'refresh', 'accent') })],
        flows: [flow(['n0', 'n2'], { kind: 'handshake', back: true, rate: 0.6 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Availability now, consistency later',
      body: [
        'Hinted handoff keeps writes flowing when replicas are down by storing the data on a stand-in with a note about its owner and replaying it on recovery. It cuts rejected writes dramatically — 99.3% to 99.997% in the example — for the price of stored hints you must size and throttle.',
        'Sloppy quorums weaken read-after-write guarantees, hints expire, and background repair is still required. Choose it where write availability matters more than immediate consistency: carts, sessions, counters, activity feeds.',
      ],
      scene: {
        nodes: [coord(), ...ringNodes(['replica', 'replica', 'replica', 'standin', 'idle', 'idle'])],
        links: put([0, 1, 2]),
        flows: putFlow([0, 1, 2]),
      },
    },
  ],
};

export default lesson;
