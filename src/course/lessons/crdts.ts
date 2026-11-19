import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const rep = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`r${i}`, -9 + i * (18 / Math.max(1, n - 1)), 0, name, ['blue', 'orange', 'green', 'purple'][i % 4] as 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });
const merge = (extra: Partial<SceneNode> = {}) => box('merge', 0, -8, 'merge(a, b)', 'teal', 'refresh', { size: [1.3, 1.3], height: 22, ...extra });

const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} KB` : `${Math.round(b)} B`);

const lesson: Lesson = {
  slug: 'crdts',
  title: 'CRDTs: Convergence Without Coordination',
  blurb: 'Data types whose merge is commutative, associative and idempotent — so replicas can accept writes independently and still converge. Counters, sets, registers, and the metadata they cost.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'gc', label: 'G-Counter state (per counter)', icon: 'disk' },
    { key: 'pn', label: 'PN-Counter state (per counter)', icon: 'disk' },
    { key: 'set', label: 'OR-Set size with tags and tombstones', icon: 'layers' },
    { key: 'rounds', label: 'Gossip rounds to converge', icon: 'refresh' },
  ],
  goals: [
    { text: 'Why concurrent updates need a merge that is always safe', step: 1 },
    { text: 'The three merge laws and the semilattice idea', step: 2 },
    { text: 'Counters: G-Counter and PN-Counter', step: 3 },
    { text: 'Sets: add-wins OR-Set and why plain sets fail', step: 4 },
    { text: 'What CRDTs cannot do, and metadata growth', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Replicas', min: 3, max: 10000, step: 1, default: 100, unit: '', description: 'Nodes that can each accept writes.' },
      { key: 'fan', label: 'Gossip fan-out', min: 1, max: 10, step: 1, default: 3, unit: '', description: 'Peers each replica exchanges state with per round.' },
      { key: 'els', label: 'Elements in the set', min: 100, max: 100000000, step: 100, default: 100000, unit: '', description: 'Live elements in an OR-Set.' },
      { key: 'tags', label: 'Tags per live element', min: 1, max: 10, step: 0.1, default: 1.5, unit: '', description: 'Add-tags retained per element (re-adds on different replicas create more).' },
      { key: 'dead', label: 'Removed-but-retained elements', min: 0, max: 90, step: 1, default: 30, unit: '%', description: 'Tombstones as a share of live elements until garbage-collected.' },
      { key: 'tag', label: 'Bytes per tag / tombstone', min: 8, max: 64, step: 1, default: 24, unit: ' B', description: 'Unique id (replica + counter) per add.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(2, Math.round(input.n ?? 100));
      const fan = Math.max(1, input.fan ?? 3);
      const els = Math.max(1, input.els ?? 1e5);
      const tags = Math.max(1, input.tags ?? 1.5);
      const dead = Math.max(0, (input.dead ?? 30) / 100);
      const tag = Math.max(1, input.tag ?? 24);
      const rounds = Math.ceil(Math.log(n) / Math.log(1 + fan)) + 2;
      const setBytes = els * (1 + dead) * tags * tag;
      return {
        gc: step < 2 ? { v: '—' } : { v: `${fmtB(n * 8)} (one 8-byte slot per replica)`, tone: n * 8 > 8000 ? 'warn' : 'good' },
        pn: step < 2 ? { v: '—' } : { v: fmtB(n * 16), tone: n * 16 > 16000 ? 'warn' : 'good' },
        set: step < 3 ? { v: '—' } : { v: `${fmtB(setBytes)} (${(setBytes / (els * 8)).toFixed(0)}× the raw 8-byte elements)`, tone: setBytes / (els * 8) > 8 ? 'warn' : 'good' },
        rounds: step < 4 ? { v: '—' } : { v: `~${rounds}`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Problem',
      kind: 'problem',
      title: 'Writes on both sides of a partition',
      body: [
        'Replicas that accept writes independently — across regions, on phones offline, in a collaborative app — will <b>diverge</b>. Two replicas each increment a counter from 10: both store 11, but the right answer is 12. Two users add different items to a shared list: someone’s item must not vanish. Strong consistency would avoid it by coordinating every write, at the cost of latency and availability (see the CAP and consistency lessons).',
        'The alternative is to <b>allow divergence but guarantee a safe merge</b>: when replicas exchange state, they always arrive at the same result regardless of order or repetition. Designing data types so that is true by construction is what <b>conflict-free replicated data types (CRDTs)</b> do — the idea behind Dynamo-style stores, Riak, Redis Enterprise’s active–active, and collaborative editors.',
      ],
      scene: { nodes: [rep(0, 2, 'Replica A: 11'), rep(1, 2, 'Replica B: 11', { tag: pill('both incremented', 'alert', 'warn') })], links: [link('r0', 'r1', { style: 'dashed', arrow: 'both' })], flows: [] },
    },
    {
      short: 'Laws',
      kind: 'insight',
      title: 'The merge laws: commutative, associative, idempotent',
      body: [
        'A CRDT defines a <b>merge</b> function with three properties. <b>Commutative</b>: merge(a, b) = merge(b, a) — arrival order between two replicas doesn’t matter. <b>Associative</b>: merge(merge(a, b), c) = merge(a, merge(b, c)) — grouping doesn’t matter. <b>Idempotent</b>: merge(a, a) = a — receiving the same state twice, or the network duplicating a message, changes nothing.',
        'Together these mean the states form a <b>join-semilattice</b> and merge computes the <i>least upper bound</i>: states only move “up”, and any replicas that have seen the same updates have the same state, however the messages were delayed, reordered or repeated. That is <b>strong eventual consistency</b> with no coordination and no conflict resolution at read time.',
      ],
      changes: [{ text: 'merge(a,b) = merge(b,a)', tone: 'info' }, { text: 'merge(merge(a,b),c) = merge(a,merge(b,c))', tone: 'info' }, { text: 'merge(a,a) = a', tone: 'info' }],
      concepts: [{ term: 'Join-semilattice', def: 'A set with a merge (join) operation that is commutative, associative and idempotent, so any collection of states has a unique least upper bound.' }],
      scene: { nodes: [rep(0, 3, 'A'), rep(1, 3, 'B'), rep(2, 3, 'C'), merge({ tag: pill('order, grouping, repeats: irrelevant', 'check', 'good') })], links: [link('r0', 'merge'), link('r1', 'merge'), link('r2', 'merge')], flows: [flow(['r0', 'merge'], { rate: 1 }), flow(['r1', 'merge'], { rate: 1 })] },
    },
    {
      short: 'Counters',
      kind: 'technique',
      title: 'G-Counter and PN-Counter',
      body: [
        'A <b>grow-only counter</b> keeps a vector with one slot per replica; a replica increments only <i>its own</i> slot. The value is the <b>sum</b> of slots; merge takes the <b>element-wise maximum</b>. Max is commutative, associative and idempotent, and because each slot has a single writer, no increment is ever lost or double-counted. A <b>PN-Counter</b> uses two G-Counters, P for increments and N for decrements; value = P − N.',
        'State grows with the number of replicas: 100 replicas = 800 bytes per counter, 1,600 for a PN-counter — fine for a handful of counters, heavy for billions; systems limit it with replica groups or compaction. The counter can go negative, since no one coordinates a floor (see the limits step).',
      ],
      changes: [{ text: 'Own slot per replica; value = sum; merge = element-wise max', tone: 'good' }, { text: 'State ∝ number of replicas', tone: 'info' }],
      concepts: [{ term: 'G-Counter', def: 'A counter CRDT with one monotonic slot per replica; merge takes the maximum of each slot.' }],
      scene: { nodes: [rep(0, 2, 'A: [4, 2, 1]', { tag: pill('sum 7', 'gauge') }), rep(1, 2, 'B: [3, 5, 1]', { tag: pill('sum 9', 'gauge') }), merge({ tag: pill('max → [4, 5, 1] = 10', 'check', 'good') })], links: [link('r0', 'merge'), link('r1', 'merge')], flows: [flow(['r0', 'merge'], { rate: 1 }), flow(['r1', 'merge'], { rate: 1 })] },
    },
    {
      short: 'Sets',
      kind: 'technique',
      title: 'Sets: why “add wins” needs unique tags',
      body: [
        'A <b>G-Set</b> only grows (merge = union) — safe but can’t remove. Naive removal fails: A removes <code>x</code> while B concurrently re-adds <code>x</code>; if “remove” just deletes, union brings it back or not depending on order. The <b>2P-Set</b> (add set + remove set) can never re-add a removed element.',
        'The <b>OR-Set</b> (observed-remove set) tags every <b>add</b> with a unique id (replica + counter). A remove deletes <i>only the tags it has observed</i>. If another replica concurrently adds <code>x</code> with a fresh tag, that tag survives the merge: <b>add wins</b> over a concurrent remove, which matches user intent (a re-added item shouldn’t vanish). The cost is metadata: 100,000 elements × 1.5 tags × 24 B plus tombstones ≈ <b>4.7 MB</b> instead of 0.8 MB — roughly 6× — until tombstones are garbage-collected.',
      ],
      changes: [{ text: 'Add creates a unique tag; remove deletes observed tags', tone: 'good' }, { text: 'Concurrent add survives: add wins', tone: 'info' }, { text: 'Tags + tombstones ≈ 6× the raw elements', tone: 'bad' }],
      scene: { nodes: [rep(0, 2, 'A: remove x (saw tag #a1)', { tag: pill('removes a1', 'lock') }), rep(1, 2, 'B: add x (new tag #b7)', { tag: pill('adds b7', 'check') }), merge({ tag: pill('x present via b7', 'check', 'good') })], links: [link('r0', 'merge'), link('r1', 'merge')], flows: [flow(['r0', 'merge'], { rate: 1 }), flow(['r1', 'merge'], { rate: 1 })] },
    },
    {
      short: 'Registers',
      kind: 'technique',
      title: 'Registers, maps and sequences',
      body: [
        'A <b>register</b> holds one value. <b>LWW-Register</b>: each write carries a timestamp and the highest wins — simple, always converges, but silently discards a concurrent write and depends on clocks (see the Clocks lesson). <b>MV-Register</b> keeps <i>all</i> concurrent values (siblings), as Dynamo and Riak do, and lets the application merge. <b>Maps</b> compose CRDTs: a map of keys to counters, sets or registers merges key by key.',
        '<b>Sequences</b> (text, ordered lists) give each element a unique, orderable identity so inserts commute — the basis of collaborative editors (see the Real-Time Collaborative Editing lesson). Gossip needs only <code>⌈log(n) ÷ log(1 + fan-out)⌉</code> rounds plus a couple more to spread an update: ~6 rounds for 100 replicas at fan-out 3.',
      ],
      changes: [{ text: 'LWW: simple, may drop a concurrent write', tone: 'bad' }, { text: 'MV-Register: keep siblings, app merges', tone: 'info' }, { text: 'Convergence in ~log n gossip rounds', tone: 'good' }],
      scene: { nodes: [rep(0, 3, 'LWW: newest timestamp wins'), rep(1, 3, 'MV: keep both values'), rep(2, 3, 'Map of CRDTs')], links: [], flows: [] },
    },
    {
      short: 'Delivery',
      kind: 'technique',
      title: 'State-based, operation-based and delta CRDTs',
      body: [
        '<b>State-based (CvRDT)</b>: replicas ship their <i>whole state</i> and merge — tolerant of loss, duplication and reordering (idempotent merge) but bandwidth-heavy. <b>Operation-based (CmRDT)</b>: replicas ship small <i>operations</i> (“increment”, “add x with tag t”) — compact, but the network must deliver each exactly once and in causal order. <b>Delta-state</b> CRDTs ship only the <i>recent change</i> as a small state fragment that can be merged like any state: the best of both, used by modern libraries.',
        'Anti-entropy (see the Dynamo lesson: Merkle trees and gossip) repairs anything missed. Causal metadata — version vectors or dotted version vectors — records what each replica has seen, which is how OR-Sets and MV-Registers know what a remove or write actually observed.',
      ],
      changes: [{ text: 'State: robust, heavy · Ops: light, needs causal delivery · Delta: both', tone: 'info' }],
      scene: { nodes: [rep(0, 3, 'State-based', { tag: pill('ship all state', 'disk') }), rep(1, 3, 'Operation-based', { tag: pill('ship ops (causal)', 'list') }), rep(2, 3, 'Delta-state', { tag: pill('ship the change', 'check', 'good') })], links: [], flows: [] },
    },
    {
      short: 'Limits',
      kind: 'problem',
      title: 'What CRDTs cannot do',
      body: [
        'CRDTs guarantee <b>convergence</b>, not <b>invariants</b>. A PN-Counter can go negative: two replicas each sell the last item and both succeed. “Username must be unique”, “balance ≥ 0”, “at most one winner”, “exactly 100 seats” are <b>global constraints</b> that cannot be checked without coordination. Where they matter, use <b>coordination for that part</b>: reserve capacity in advance and let each replica spend only its allowance (<b>escrow / bounded counters</b>), route the contended operation through a single owner or consensus group, or resolve conflicts after the fact (compensating actions, the Saga lesson).',
        'Other costs: <b>metadata growth</b> (tombstones, per-replica vectors, tags) needs garbage collection that itself requires knowing every replica has seen a change; <b>semantics</b> can surprise users (add-wins, interleaved text inserts); and merging many offline-diverged copies can produce results that are consistent but unintended. Use CRDTs where concurrent edits genuinely commute in meaning — presence, likes, collaborative docs, shopping carts, offline-first sync — and coordinate where money or uniqueness is on the line. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Convergence ≠ invariants (balance ≥ 0, uniqueness)', tone: 'bad' }, { text: 'Escrow / single owner / consensus for constraints', tone: 'good' }, { text: 'Garbage-collect tombstones and vectors', tone: 'info' }],
      scene: { nodes: [rep(0, 2, 'A: sells last item', { tag: pill('stock = 0 → −1 after merge', 'alert', 'bad') }), rep(1, 2, 'B: sells last item', { tag: pill('both succeeded', 'alert', 'bad') }), db('own', 0, -8, 'Escrow / owner', { size: [1.2, 1.2], tag: pill('guards the constraint', 'check', 'good') })], links: [link('r0', 'own', { style: 'dashed' }), link('r1', 'own', { style: 'dashed' })], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Merge is a join: order, grouping and repeats don’t matter',
      body: [
        'A CRDT is a data type whose <b>merge is commutative, associative and idempotent</b>, so replicas accept writes independently and converge once they have seen the same updates. <b>G/PN-Counters</b> keep one slot per replica; <b>OR-Sets</b> tag adds so concurrent adds survive removes; <b>registers</b> choose LWW or keep siblings; <b>sequences</b> power collaborative text; <b>delta-state</b> shipping keeps bandwidth modest.',
        'They buy availability and offline operation at the price of metadata, subtle semantics and no global invariants — pair them with reservations or consensus where constraints matter.',
      ],
      scene: { nodes: [rep(0, 3, 'A'), rep(1, 3, 'B'), rep(2, 3, 'C'), merge()], links: [link('r0', 'merge'), link('r1', 'merge'), link('r2', 'merge')], flows: [flow(['r0', 'merge'], { rate: 1 }), flow(['r1', 'merge'], { rate: 1 }), flow(['r2', 'merge'], { rate: 1 })] },
    },
  ],
};

export default lesson;
