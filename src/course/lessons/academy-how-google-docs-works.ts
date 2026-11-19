import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const ua = (extra: Partial<SceneNode> = {}) => box('ua', -14, -6, 'Alice', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const ub = (extra: Partial<SceneNode> = {}) => box('ub', -14, 6, 'Bob', 'orange', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const srv = (extra: Partial<SceneNode> = {}) => box('srv', -1, 0, 'Collaboration server', 'blue', 'server', { size: [1.5, 1.5], height: 32, ...extra });
const doc = (extra: Partial<SceneNode> = {}) => db('doc', 12, 0, 'Document + op log', { size: [1.4, 1.4], ...extra });

const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

const lesson: Lesson = {
  slug: 'academy-how-google-docs-works',
  title: 'Real-Time Collaborative Editing: OT and CRDTs',
  blurb: 'Why simultaneous edits conflict, how operational transformation reconciles them through a server, how CRDTs do it without one — and what each costs in memory and complexity.',
  minutes: 15,
  level: 'Advanced',
  metrics: [
    { key: 'ops', label: 'Edit operations per second (server)', icon: 'activity' },
    { key: 'conc', label: 'Concurrent ops each edit meets', icon: 'refresh' },
    { key: 'crdt', label: 'CRDT document size in memory', icon: 'disk' },
    { key: 'plain', label: 'Overhead vs plain text', icon: 'gauge' },
  ],
  goals: [
    { text: 'Why concurrent edits can’t simply be applied in arrival order', step: 1 },
    { text: 'Operational transformation with a central server', step: 3 },
    { text: 'CRDTs: unique character ids and tombstones', step: 4 },
    { text: 'Comparing OT and CRDT trade-offs', step: 5 },
    { text: 'Presence, cursors, offline and persistence', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'users', label: 'Active editors', min: 2, max: 200, step: 1, default: 10, unit: '', description: 'People typing in the same document.' },
      { key: 'rate', label: 'Operations per editor per second', min: 0.1, max: 10, step: 0.1, default: 2, unit: '/s', description: 'Typing and deleting bursts, batched per operation.' },
      { key: 'rtt', label: 'Round trip to the server', min: 10, max: 1000, step: 10, default: 100, unit: ' ms', description: 'Latency between an editor and the server.' },
      { key: 'chars', label: 'Document length', min: 1000, max: 5000000, step: 1000, default: 100000, unit: ' chars', description: 'Visible characters in the document.' },
      { key: 'meta', label: 'CRDT metadata per character', min: 4, max: 80, step: 2, default: 20, unit: ' B', description: 'Id, origin links and flags stored per character (optimised implementations compress runs).' },
      { key: 'del', label: 'Deleted share (tombstones)', min: 0, max: 90, step: 1, default: 30, unit: '%', description: 'Share of all characters ever inserted that have since been deleted but are still stored.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(2, Math.round(input.users ?? 10));
      const r = Math.max(0.01, input.rate ?? 2);
      const rtt = Math.max(1, input.rtt ?? 100) / 1000;
      const chars = Math.max(1, input.chars ?? 1e5);
      const meta = Math.max(1, input.meta ?? 20);
      const del = Math.min(0.95, Math.max(0, (input.del ?? 30) / 100));
      // Each operation is concurrent with those other editors made within one round trip.
      const conc = (n - 1) * r * rtt;
      const total = chars / (1 - del);
      const bytes = total * (meta + 1);
      return {
        ops: step < 2 ? { v: '—' } : { v: `${(n * r).toFixed(0)}/s` },
        conc: step < 2 ? { v: '—' } : { v: conc.toFixed(2), tone: conc < 2 ? 'good' : conc < 10 ? 'warn' : 'bad' },
        crdt: step < 3 ? { v: '—' } : { v: fmtB(bytes), tone: bytes < 2e7 ? 'good' : bytes < 2e8 ? 'warn' : 'bad' },
        plain: step < 3 ? { v: '—' } : { v: `${(bytes / chars).toFixed(0)}× the visible text`, tone: bytes / chars < 20 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Conflict',
      kind: 'problem',
      title: 'Two people edit the same sentence',
      body: [
        'The document reads <code>ABC</code>. Alice inserts <code>X</code> at position 1 (→ <code>AXBC</code>). At the same moment Bob deletes the character at position 2 (<code>C</code>). Each applies their own edit instantly, then receives the other’s <i>unchanged</i>. Alice applies “delete position 2” to <code>AXBC</code> and removes <b>B</b>; Bob applies “insert X at 1” to <code>AB</code> and gets <code>AXB</code>. They now see <b>different documents</b>.',
        'Positions are relative to a particular version, so an operation made against one version means something different against another. Local edits must feel instant (no waiting for the network), which means edits are <i>concurrent</i> by construction — and the system must make every replica converge to the same, sensible result.',
      ],
      changes: [{ text: 'Alice: AXBC → deletes B · Bob: AXB — diverged', tone: 'bad' }],
      scene: { nodes: [ua({ tag: pill('insert X @1', 'file') }), ub({ tag: pill('delete @2', 'file') }), srv({ state: 'hot', tag: pill('replicas diverge', 'alert', 'bad') })], links: [link('ua', 'srv', { arrow: 'both' }), link('ub', 'srv', { arrow: 'both' })], flows: [flow(['ua', 'srv'], { kind: 'write', rate: 1 }), flow(['ub', 'srv'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Options',
      kind: 'insight',
      title: 'Three ways to avoid divergence',
      body: [
        '<b>Locking</b> (only one editor per paragraph): simple, but it blocks people and defeats real-time collaboration. <b>Last-write-wins on the whole document</b>: someone’s work vanishes. The useful approaches keep <i>every</i> edit and reconcile intent: <b>operational transformation (OT)</b> rewrites operations to account for what happened concurrently; <b>conflict-free replicated data types (CRDTs)</b> give each piece of content an identity so operations commute and need no rewriting.',
        'Both guarantee <b>convergence</b> (everyone ends identical) and aim to preserve <b>intention</b> (Alice’s X ends up where she meant it). Google Docs uses OT with a central server; many newer editors (Yjs, Automerge, Figma’s multiplayer variants) use CRDT-like designs.',
      ],
      concepts: [{ term: 'Convergence', def: 'Every replica that has seen the same set of operations ends in the same state, regardless of arrival order.' }],
      scene: { nodes: [box('lock', -8, -5, 'Locks', 'red', 'lock', { size: [1.3, 1.3], height: 22, tag: pill('blocks people', 'alert', 'warn') }), box('ot', 0, 5, 'OT', 'blue', 'refresh', { size: [1.3, 1.3], height: 26, tag: pill('transform operations', 'check') }), box('crdt', 8, -5, 'CRDT', 'green', 'hash', { size: [1.3, 1.3], height: 26, tag: pill('operations commute', 'check') })], links: [], flows: [] },
    },
    {
      short: 'OT',
      kind: 'technique',
      title: 'Operational transformation through a server',
      body: [
        'The server keeps a single <b>ordered history</b> of operations. Each client sends its op tagged with the server revision it was based on. If other ops were accepted since, the server <b>transforms</b> the incoming op against each of them: Bob’s <code>delete @2</code>, arriving after Alice’s <code>insert X @1</code>, becomes <code>delete @3</code> — position shifted by the insert. It applies the result, appends it to history and broadcasts it; each client also transforms incoming ops against its own not-yet-acknowledged edits.',
        'One authority orders everything, so a client only ever has <b>one op in flight</b> and the combinatorial explosion of peer-to-peer OT is avoided. Cost: <b>each op is transformed against every op concurrent with it</b> — about <code>(n − 1) × rate × RTT</code> = 9 × 2 × 0.1 = <b>1.8</b> at the defaults. Higher latency or more editors raise it linearly, and the transform functions for rich text (formatting, lists, tables) are notoriously intricate.',
      ],
      changes: [{ text: 'insert X @1 then delete @2 → delete @3', tone: 'good' }, { text: 'Cost ∝ concurrent ops per edit', tone: 'info' }],
      concepts: [{ term: 'Operational transformation', def: 'Adjusting an operation against concurrent ones so it applies correctly to a changed document state.' }],
      scene: { nodes: [ua({ tag: pill('rev 7: insert X @1', 'file') }), ub({ tag: pill('rev 7: delete @2', 'file') }), srv({ tag: pill('transform: delete @3', 'refresh', 'good') }), doc({ tag: pill('ordered history', 'list') })], links: [link('ua', 'srv'), link('ub', 'srv'), link('srv', 'doc')], flows: [flow(['ua', 'srv', 'doc'], { kind: 'write', rate: 1 }), flow(['ub', 'srv', 'doc'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'CRDT',
      kind: 'technique',
      title: 'CRDTs: give every character an identity',
      body: [
        'Instead of positions, a sequence CRDT gives each inserted character a <b>globally unique id</b> (client id + counter) and remembers what it was inserted <i>after</i>. “Insert X after B” and “delete C” refer to ids, which don’t change when other edits happen — so operations <b>commute</b>: apply them in any order, get the same result. Concurrent inserts at the same spot are ordered deterministically by id (RGA, YATA, Logoot/LSEQ variants).',
        'Deletion can’t simply remove the character — a concurrent insert might reference it — so it is marked as a <b>tombstone</b>, kept until it’s known to be safe to drop. The price is metadata: ~20 bytes per character for 100,000 visible characters with 30% tombstones is <b>~3 MB</b> (~30× the plain text). Production libraries compress runs of consecutive ids to shrink this a lot.',
      ],
      changes: [{ text: 'Ids instead of positions → order-independent', tone: 'good' }, { text: 'Tombstones and ids cost memory', tone: 'bad' }],
      concepts: [{ term: 'CRDT', def: 'A conflict-free replicated data type: replicas can be updated independently and merged deterministically without coordination.' }],
      scene: { nodes: [box('a', -10, 0, 'A·1', 'blue', 'file', { size: [1, 1], height: 16 }), box('x', -4, 0, 'X·alice1', 'green', 'file', { size: [1, 1], height: 16, tag: pill('after A·1', 'hash') }), box('b', 2, 0, 'B·2', 'blue', 'file', { size: [1, 1], height: 16 }), box('c', 8, 0, 'C·3', 'red', 'file', { size: [1, 1], height: 16, state: 'ghost', tag: pill('tombstone', 'alert', 'warn') })], links: [link('a', 'x', { arrow: 'end' }), link('x', 'b', { arrow: 'end' }), link('b', 'c', { arrow: 'end' })], flows: [] },
    },
    {
      short: 'Trade-offs',
      kind: 'tradeoff',
      title: 'OT versus CRDT',
      body: [
        '<b>OT</b>: compact documents, mature for rich text, but needs a <b>central server</b> to order ops and notoriously hard-to-prove transform functions; offline editing and peer-to-peer are awkward. <b>CRDT</b>: no ordering authority — works offline, peer-to-peer, across regions and with eventually-synced servers; merging long offline sessions is natural. Costs: metadata and tombstone memory, history growth, and more subtle rich-text semantics (formatting spans, moves).',
        'In practice many systems use a <b>server anyway</b> (for auth, persistence, permissions, presence) and choose CRDTs for simpler convergence reasoning, or OT where the server is already central and documents must be tiny. “You don’t need CRDTs” is true if you can accept a central sequencer and short offline periods; “CRDTs are the future” is true if offline-first or multi-region writes matter.',
      ],
      changes: [{ text: 'OT: small docs, central server, hard transforms', tone: 'info' }, { text: 'CRDT: offline/peer-to-peer, larger metadata', tone: 'info' }],
      scene: { nodes: [box('ot', -7, 0, 'OT', 'blue', 'refresh', { size: [1.4, 1.4], height: 24, tag: pill('server orders ops', 'server') }), box('crdt', 7, 0, 'CRDT', 'green', 'hash', { size: [1.4, 1.4], height: 28, tag: pill('merge anywhere', 'share') })], links: [], flows: [] },
    },
    {
      short: 'Around it',
      kind: 'technique',
      title: 'Presence, offline, history and storage',
      body: [
        '<b>Presence and cursors</b> are ephemeral state: broadcast over the same WebSocket but never persisted, throttled to a few updates a second, and attached to ids (or transformed positions) so a cursor follows its character as text shifts. <b>Offline</b>: queue local ops, replay on reconnect (transformed by the server, or merged as a CRDT). <b>History</b>: the op log is the version history — snapshot periodically so loading a document replays hundreds of ops, not millions.',
        '<b>Scale</b>: one document is served by one collaboration process (shard by document id) so ordering needs no distributed coordination; thousands of editors in a document require batching and broadcasting through fan-out tiers. Permissions, comments and suggestions are separate layers anchored to the same ids. Figures in this lesson are model outputs for sizing.',
      ],
      scene: { nodes: [ua(), ub(), srv({ tag: pill('shard by document id', 'hash') }), doc({ tag: pill('snapshot + op log', 'disk') })], links: [link('ua', 'srv', { arrow: 'both' }), link('ub', 'srv', { arrow: 'both' }), link('srv', 'doc')], flows: [flow(['ua', 'srv'], { rate: 1.5 }), flow(['srv', 'ub'], { rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Same edits, same result — everywhere',
      body: [
        'Local edits must be instant, so they are concurrent; the system must <b>converge</b> and preserve <b>intent</b>. <b>OT</b> transforms operations through a central sequencer (cost ≈ <code>(n − 1) × rate × RTT</code> per edit); <b>CRDTs</b> assign unique ids so operations commute, paying in metadata and tombstones.',
        'Choose by whether you need a central authority anyway, how long offline periods last and how large documents get. Shard by document, snapshot the log, and keep presence ephemeral.',
      ],
      scene: { nodes: [ua(), ub(), srv(), doc()], links: [link('ua', 'srv', { arrow: 'both' }), link('ub', 'srv', { arrow: 'both' }), link('srv', 'doc')], flows: [flow(['ua', 'srv', 'ub'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
