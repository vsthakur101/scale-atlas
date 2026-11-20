import type { Lesson, SceneNode, Tone } from '../../types';
import { at, box, flow, link, onRing, pill, ring } from '../kit';

/**
 * Six-node ring. Key "cart:81" has preference list A, B, C. The coordinator is
 * one of the replicas (A) in the paper; here a separate node keeps the picture readable.
 */
type Role = 'replica' | 'idle' | 'down' | 'conflict';
const C0 = at(0, 0);
const NAMES = 'ABCDEF';
const tone = (r: Role): Tone => (r === 'replica' ? 'blue' : r === 'down' ? 'red' : r === 'conflict' ? 'orange' : 'grey');
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
const coord = (extra: Partial<SceneNode> = {}): SceneNode => box('coord', 0, 0, 'Coordinator', 'green', 'route', { size: [1.3, 1.3], height: 34, ...extra });
const to = (ids: number[], kind: 'write' | 'req' = 'write', rate = 0.9) => ids.map((i) => flow(['coord', `n${i}`], { kind: kind === 'write' ? 'write' : undefined, rate }));
const links = (ids: number[], style: 'solid' | 'dashed' = 'solid') => ids.map((i) => link('coord', `n${i}`, { arrow: 'end', style }));

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`);

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
const pct = (p: number): string => (p > 0.999999 ? '> 99.9999%' : `${(p * 100).toFixed(p > 0.99999 ? 4 : p > 0.9999 ? 3 : 2)}%`);

const lesson: Lesson = {
  slug: 'academy-amazon-dynamo',
  title: 'The Dynamo Design: Highly Available Key–Value Storage',
  blurb: 'The 2007 design that chose availability over consistency on purpose — consistent hashing, tunable quorums, vector clocks, Merkle-tree repair — and what each choice costs.',
  minutes: 16,
  level: 'Advanced',
  metrics: [
    { key: 'guarantee', label: 'Read sees last write?', icon: 'shield' },
    { key: 'wavail', label: 'Write availability', icon: 'activity' },
    { key: 'ravail', label: 'Read availability', icon: 'activity' },
    { key: 'sync', label: 'Repair: hashes compared', icon: 'refresh' },
  ],
  goals: [
    { text: 'Why a shopping cart must always accept writes', step: 1 },
    { text: 'How N, R and W trade consistency, latency and availability', step: 3 },
    { text: 'Vector clocks: telling “newer” from “concurrent”', step: 5 },
    { text: 'Why the application, not the database, merges conflicts', step: 6 },
    { text: 'Merkle trees: repair without scanning everything', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Replicas (N)', min: 1, max: 7, step: 1, default: 3, unit: '', description: 'How many nodes store each key.' },
      { key: 'r', label: 'Read quorum (R)', min: 1, max: 7, step: 1, default: 2, unit: '', description: 'Replicas that must answer a read.' },
      { key: 'w', label: 'Write quorum (W)', min: 1, max: 7, step: 1, default: 2, unit: '', description: 'Replicas that must acknowledge a write.' },
      { key: 'up', label: 'Node availability', min: 90, max: 99.99, step: 0.01, default: 99, unit: '%', description: 'Probability a given node is reachable at a given moment.' },
      { key: 'keys', label: 'Keys per range', min: 1000, max: 10000000, step: 1000, default: 1000000, unit: '', description: 'Keys covered by one Merkle-tree comparison between two replicas.' },
      { key: 'diff', label: 'Divergent keys', min: 1, max: 5000, step: 1, default: 50, unit: '', description: 'Keys whose replicas currently disagree.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, Math.round(input.n ?? 3));
      const r = Math.min(n, Math.max(1, Math.round(input.r ?? 2)));
      const w = Math.min(n, Math.max(1, Math.round(input.w ?? 2)));
      const a = (input.up ?? 99) / 100;
      const keys = Math.max(1, input.keys ?? 1e6);
      const diff = Math.min(keys, Math.max(1, input.diff ?? 50));
      const overlap = r + w > n;
      const wAv = atLeast(n, w, a);
      const rAv = atLeast(n, r, a);
      // Merkle: walk one root-to-leaf path per divergent key, comparing two children per level.
      const depth = Math.max(1, Math.ceil(Math.log2(keys)));
      const merkle = Math.min(2 * keys, 2 * diff * depth);
      return {
        guarantee: overlap
          ? { v: `Yes if no failures (R+W=${r + w} > N=${n})`, tone: 'good' }
          : { v: `Not guaranteed (R+W=${r + w} ≤ N=${n})`, tone: 'warn' },
        wavail: step < 2 ? { v: '—' } : { v: pct(wAv), tone: wAv > 0.9995 ? 'good' : wAv > 0.99 ? 'warn' : 'bad' },
        ravail: step < 2 ? { v: '—' } : { v: pct(rAv), tone: rAv > 0.9995 ? 'good' : rAv > 0.99 ? 'warn' : 'bad' },
        sync: step < 6 ? { v: '—' } : { v: `≤ ${fmtN(merkle)} vs ${fmtN(keys)} scan`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Always on',
      kind: 'problem',
      title: 'A shopping cart that refuses to save is lost revenue',
      body: [
        'Amazon’s 2007 Dynamo paper starts from a business requirement, not a database theory one: “add to cart” must essentially <b>always succeed</b>, even during disk failures, network partitions and whole-datacentre outages. Rejecting a write loses the customer; a slightly stale or briefly duplicated cart item is cheap to fix.',
        'That choice — keep accepting writes and reconcile later — is what the CAP discussion calls choosing <b>availability</b> over strong consistency. Everything in Dynamo follows from it: no master, any replica can take a write, and conflicts are expected rather than prevented.',
      ],
      note: { kind: 'key', text: 'Dynamo is a key–value store that gives up “one true latest value” to keep accepting reads and writes through failures.' },
      changes: [{ text: 'Priority: writes never refused', tone: 'good' }, { text: 'Price: replicas can disagree', tone: 'bad' }],
      scene: {
        nodes: [box('cart', -12, 0, 'Add to cart', 'green', 'users', { size: [1.4, 1.4], height: 30 }), box('svc', 0, 0, 'Cart service', 'blue', 'cpu', { size: [1.3, 1.3], height: 32 }), box('store', 12, 0, 'Dynamo', 'orange', 'db', { size: [1.4, 1.4], height: 32, tag: pill('never says no', 'shield', 'good') })],
        links: [link('cart', 'svc'), link('svc', 'store', { arrow: 'both' })],
        flows: [flow(['cart', 'svc', 'store'], { kind: 'write', rate: 1.2 })],
      },
    },
    {
      short: 'Partition',
      kind: 'technique',
      title: 'Place keys with consistent hashing',
      body: [
        'Keys and nodes are hashed onto the same ring. A key belongs to the first node clockwise from its position, and its <b>preference list</b> is that node plus the next N−1 distinct nodes — here A, B, C for the key <code>cart:81</code>. Adding or removing a node only moves the keys next to it.',
        'Each physical machine owns many small ring positions (<b>virtual nodes</b>), so load spreads evenly and a failed machine’s ranges scatter across many peers rather than dumping onto one neighbour. Any node can compute a key’s preference list locally, so there is no central directory to fail.',
      ],
      concepts: [
        { term: 'Preference list', def: 'The N nodes responsible for a key: the first owner clockwise on the ring plus the next N−1 distinct nodes.' },
        { term: 'Virtual node', def: 'One of many ring positions assigned to a physical machine, evening out load and making rebalancing granular.' },
      ],
      scene: {
        nodes: [...ringNodes(['replica', 'replica', 'replica', 'idle', 'idle', 'idle']), coord({ tag: pill('hash(cart:81) → A, B, C', 'hash') })],
        links: links([0, 1, 2]),
        flows: [],
      },
    },
    {
      short: 'N · R · W',
      kind: 'technique',
      title: 'Quorums with three dials',
      body: [
        'Each key is stored on <b>N</b> replicas. A write is acknowledged once <b>W</b> of them confirm; a read waits for <b>R</b> replies. When <code>R + W &gt; N</code> every read set overlaps every write set in at least one node, so a read normally includes the latest acknowledged write — provided failures and sloppy quorums don’t intervene.',
        'This is overlap arithmetic, not a consensus protocol: no leader orders writes and nothing stops two writes being accepted by disjoint sets during a partition. The sliders show the read/write availability that results when each node is up with the chosen probability.',
      ],
      changes: [{ text: 'N=3, R=2, W=2 is the common default', tone: 'good' }, { text: 'R + W > N → read and write sets overlap', tone: 'info' }],
      concepts: [{ term: 'Quorum', def: 'The number of replica responses (R for reads, W for writes) required before an operation is considered done.' }],
      scene: {
        nodes: [...ringNodes(['replica', 'replica', 'replica', 'idle', 'idle', 'idle']), coord({ tag: pill('wait for W = 2 acks', 'check', 'good') })],
        links: links([0, 1, 2]),
        flows: to([0, 1, 2]),
      },
    },
    {
      short: 'Tuning',
      kind: 'technique',
      title: 'Choose where to be fast and where to be safe',
      body: [
        '<b>R=1, W=N</b>: reads are fast and see everything, but one down replica blocks every write. <b>R=N, W=1</b>: writes are fast and available, reads are slow and fail if any replica is down — the cart’s “always writable” profile with careful reads. <b>R=1, W=1</b>: fastest and most available, with no overlap guarantee at all.',
        'Latency follows the slowest of the replicas you wait for, so a larger quorum means worse tail latency, not just lower availability. Try (N, R, W) = (3, 2, 2) versus (3, 3, 1) versus (5, 3, 3) and watch both availability numbers and the overlap line.',
      ],
      changes: [{ text: 'Higher W: durable but less write-available', tone: 'bad' }, { text: 'Lower R: faster reads, weaker guarantee', tone: 'bad' }],
      scene: {
        nodes: [...ringNodes(['replica', 'replica', 'replica', 'idle', 'idle', 'idle'], { 2: { tag: pill('slow replica', 'clock', 'warn') } }), coord({ tag: pill('latency = slowest awaited', 'clock') })],
        links: links([0, 1, 2]),
        flows: [...to([0, 1], 'req', 1), ...to([2], 'req', 0.3)],
      },
    },
    {
      short: 'Conflicts',
      kind: 'problem',
      title: 'Concurrent writes create siblings',
      body: [
        'During a partition two clients update the same cart through different replicas. There is no leader to order them and wall clocks can’t be trusted, so Dynamo attaches a <b>vector clock</b> — a list of (node, counter) pairs — to every version. Comparing two clocks says whether one version <i>descends</i> from the other (keep the newer) or they are <b>concurrent</b> (keep both).',
        'In the paper’s example: node X writes D1 [(X,1)], then D2 [(X,2)]. Y updates D2 to D3 [(X,2),(Y,1)] while Z updates D2 to D4 [(X,2),(Z,1)]. Neither clock dominates, so a later read returns <i>both</i> D3 and D4 and the application must merge them.',
      ],
      changes: [{ text: '[(X,2),(Y,1)] vs [(X,2),(Z,1)] → concurrent, keep both', tone: 'bad' }, { text: '[(X,1)] vs [(X,2)] → second is newer, drop first', tone: 'good' }],
      concepts: [{ term: 'Vector clock', def: 'A per-version map of node → counter; version A supersedes B only if every counter in A is ≥ the one in B. Otherwise they are concurrent.' }],
      scene: {
        nodes: [...ringNodes(['conflict', 'conflict', 'replica', 'idle', 'idle', 'idle'], { 0: { tag: pill('D3 [(X,2),(Y,1)]', 'file', 'warn') }, 1: { tag: pill('D4 [(X,2),(Z,1)]', 'file', 'warn') } }), coord({ name: 'Read', tag: pill('returns D3 and D4', 'alert', 'bad') })],
        links: links([0, 1], 'solid'),
        flows: [flow(['n0', 'coord'], { kind: 'fail', rate: 0.8 }), flow(['n1', 'coord'], { kind: 'fail', rate: 0.8 })],
      },
    },
    {
      short: 'Reconcile',
      kind: 'technique',
      title: 'The application decides what “merge” means',
      body: [
        'The database can detect that versions conflict but not what they <i>mean</i>. <b>Syntactic</b> reconciliation (clock dominance) handles the easy cases. For the rest Dynamo hands every sibling to the caller. For a cart the right merge is a <b>union</b>: two carts become one with all items — and, as the paper admits, a removed item may occasionally reappear.',
        'The alternative, <b>last-write-wins</b> by timestamp, is simpler and never returns siblings but silently discards one concurrent update and depends on synchronised clocks. Choose per data type: union for sets, counters merged by CRDTs, LWW only when losing a concurrent write is acceptable.',
      ],
      changes: [{ text: 'Cart merge = union, delete may resurface', tone: 'info' }, { text: 'LWW = simple, but drops a concurrent update', tone: 'bad' }],
      scene: {
        nodes: [box('d3', -8, -5, 'Cart D3', 'orange', 'list', { size: [1.2, 1.2], height: 24, tag: pill('book, mug', 'file') }), box('d4', -8, 5, 'Cart D4', 'purple', 'list', { size: [1.2, 1.2], height: 24, tag: pill('book, lamp', 'file') }), box('m', 2, 0, 'App merge', 'green', 'refresh', { size: [1.3, 1.3], height: 30 }), box('d5', 12, 0, 'Cart D5', 'blue', 'list', { size: [1.3, 1.3], height: 28, tag: pill('book, mug, lamp', 'check', 'good') })],
        links: [link('d3', 'm'), link('d4', 'm'), link('m', 'd5')],
        flows: [flow(['d3', 'm', 'd5'], { kind: 'write', rate: 0.9 }), flow(['d4', 'm', 'd5'], { kind: 'write', rate: 0.9 })],
      },
    },
    {
      short: 'Merkle',
      kind: 'technique',
      title: 'Anti-entropy: find differences without a full scan',
      body: [
        'Replicas still drift: a node missed writes while down, a hint was lost. Comparing every key between two replicas would move millions of hashes. Instead each node keeps a <b>Merkle tree</b> per key range — leaves hash keys, parents hash their children, the root summarises everything. If two roots match the replicas agree; if not, descend only into subtrees whose hashes differ.',
        'Cost is roughly <code>divergent keys × tree depth × 2</code> hash comparisons instead of one per key: with a million keys and 50 divergent ones that is about 2,000 versus 1,000,000. The trade-off is maintaining the tree as data changes and rebuilding it when ranges move.',
      ],
      concepts: [{ term: 'Merkle tree', def: 'A tree of hashes where each parent hashes its children, so equal roots imply equal contents and differences can be located by descent.' }],
      scene: {
        nodes: [box('root', 2, 0, 'Root hash', 'green', 'hash', { size: [1.3, 1.3], height: 30, tag: pill('roots differ', 'alert', 'warn') }), box('l', -6, -6, 'left subtree', 'grey', 'hash', { size: [1.2, 1.2], height: 24, tag: pill('same · skip', 'check', 'good') }), box('r', -6, 6, 'right subtree', 'orange', 'hash', { size: [1.2, 1.2], height: 24, tag: pill('differs · descend', 'search', 'warn') }), box('leaf', 12, 6, 'divergent keys', 'red', 'file', { size: [1.2, 1.2], height: 24, tag: pill('sync only these', 'refresh', 'good') })],
        links: [link('root', 'l'), link('root', 'r'), link('r', 'leaf')],
        flows: [flow(['root', 'r', 'leaf'], { rate: 1 })],
      },
    },
    {
      short: 'Failures',
      kind: 'technique',
      title: 'Membership, sloppy quorums and repair',
      body: [
        'There is no coordinator for membership either: nodes <b>gossip</b> their view of the ring, so changes spread in roughly log N rounds. When a replica is unreachable, <b>sloppy quorum</b> sends the write to the next healthy node on the ring with a <b>hint</b> naming the real owner, and <b>hinted handoff</b> delivers it on recovery — the writes keep succeeding at the cost of weaker overlap. (Both mechanisms have their own lessons in this course.)',
        'Hints cover short outages; <b>Merkle anti-entropy</b> covers what hints miss — permanent loss, a node down longer than the hint window, bit rot. Three layers, three time scales: quorums for the request, hints for minutes, Merkle sync for the long tail.',
      ],
      scene: {
        nodes: [...ringNodes(['replica', 'down', 'replica', 'idle', 'idle', 'idle'], { 3: { tone: 'teal', tag: pill('holds hint for B', 'clock') } }), coord({ tag: pill('W met via stand-in', 'check', 'good') })],
        links: [...links([0, 2]), link('coord', 'n3', { arrow: 'end', style: 'dashed' })],
        flows: [...to([0, 2]), flow(['coord', 'n3'], { kind: 'write', rate: 0.9 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Availability bought with reconciliation work',
      body: [
        'Dynamo = <b>consistent hashing</b> (placement) + <b>N/R/W quorums</b> (tunable overlap) + <b>vector clocks</b> (detect concurrency) + <b>application-level merge</b> + <b>gossip, sloppy quorum, hinted handoff and Merkle trees</b> (failure handling at three time scales). Every piece exists so a write can always land somewhere.',
        'Use this family when data is naturally mergeable, availability beats precision and you can live with client-side conflict handling. Avoid it for balances, inventory or uniqueness constraints that need a single linearisable order. Note that Amazon’s DynamoDB service is a different system with a different design; Cassandra and Riak are the better-known descendants of the paper.',
      ],
      scene: {
        nodes: [...ringNodes(['replica', 'replica', 'replica', 'idle', 'idle', 'idle']), coord()],
        links: links([0, 1, 2]),
        flows: to([0, 1, 2]),
      },
    },
  ],
};

export default lesson;
