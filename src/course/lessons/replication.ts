import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill, zone } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -10, 0, 'App', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const leader = (extra: Partial<SceneNode> = {}) => db('leader', -1, 0, 'Leader', { tone: 'orange', sub: 'writes', ...extra });
const f1 = (extra: Partial<SceneNode> = {}) => db('f1', 7, -6, 'Follower 1', { sub: 'reads', ...extra });
const f2 = (extra: Partial<SceneNode> = {}) => db('f2', 8, 5, 'Follower 2', { sub: 'reads', ...extra });
const stream = [link('leader', 'f1', { label: pill('WAL stream') }), link('leader', 'f2')];
const repl = [flow(['leader', 'f1'], { kind: 'write', rate: 1.5 }), flow(['leader', 'f2'], { kind: 'write', rate: 1.5 })];

const lesson: Lesson = {
  slug: 'replication',
  title: 'Replication',
  blurb: 'Keep copies of the database on several machines — for read capacity and survival — and meet the lag that comes with them.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'reads', label: 'Read capacity', icon: 'search' },
    { key: 'wlat', label: 'Write latency', icon: 'timer' },
    { key: 'lag', label: 'Lag', icon: 'clock' },
    { key: 'risk', label: 'Data at risk', icon: 'alert' },
  ],
  goals: [
    { text: 'Leader-follower replication and read scaling', step: 2 },
    { text: 'Replication lag and read-your-writes', step: 4 },
    { text: 'Synchronous vs asynchronous trade-offs', step: 5 },
    { text: 'Failover, lost writes and split brain', step: 7 },
    { text: 'Multi-leader and quorum-based alternatives', step: 8 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  steps: [
    {
      short: 'One copy',
      kind: 'problem',
      title: 'One database: a ceiling and a cliff',
      body: [
        'A recipe site’s database handles all reads and writes. Reads outnumber writes 50 to 1 and the box is at 85% CPU. Worse, it’s the only copy of the data living on a running machine — when it fails, the site is down until it’s restored from last night’s backup.',
      ],
      changes: [{ text: '85% CPU, mostly reads', tone: 'bad' }, { text: 'One live copy', tone: 'bad' }],
      scene: {
        nodes: [app(), leader({ name: 'Database', sub: 'reads + writes', load: 85, state: 'hot' })],
        links: [link('app', 'leader', { arrow: 'both' })],
        flows: [flow(['app', 'leader'], { back: true, rate: 5, speed: 0.7 }), flow(['app', 'leader'], { kind: 'write', rate: 0.3 })],
        metrics: { reads: { v: '1×', tone: 'warn' }, wlat: '4 ms', lag: '—', risk: { v: 'since backup', tone: 'bad' } },
      },
    },
    {
      short: 'Followers',
      kind: 'technique',
      title: 'Leader-follower: one writer, many readers',
      body: [
        'Designate one node the <b>leader</b>. All writes go to it. It streams its change log (often the WAL itself) to <b>followers</b>, which apply the same changes in the same order and end up with identical copies.',
        'Reads can now go to any follower, so read capacity scales with the number of replicas — and a full, live copy of the data exists on three machines.',
      ],
      changes: [{ text: '+2 followers', tone: 'good' }, { text: 'Read capacity ×3', tone: 'good' }],
      concepts: [
        { term: 'Leader-follower replication', def: 'A single leader accepts writes and ships its change log to followers that serve reads (also called primary-replica).' },
        { term: 'Read replica', def: 'A follower copy used to serve read queries and offload the leader.' },
      ],
      scene: {
        nodes: [app(), leader({ load: 30 }), f1({ load: 35 }), f2({ load: 35 })],
        links: [link('app', 'leader', { label: pill('writes') }), link('app', 'f1', { style: 'dashed' }), link('app', 'f2', { style: 'dashed' }), ...stream],
        flows: [flow(['app', 'leader'], { kind: 'write', rate: 0.6 }), flow(['app', 'f1'], { back: true, rate: 2.2 }), flow(['app', 'f2'], { back: true, rate: 2.2 }), ...repl],
        metrics: { reads: { v: '3×', tone: 'good' }, wlat: '4 ms', lag: '≈ 50 ms', risk: 'lag window' },
      },
    },
    {
      short: 'Lag',
      kind: 'problem',
      title: '“I saved my recipe and it’s gone”',
      body: [
        'Replication here is <b>asynchronous</b>: the leader confirms a write before followers have it. Usually they catch up in tens of milliseconds — but during a bulk import, lag reaches 8 seconds.',
        'A user saves a recipe (leader), the page reloads and reads from a follower that hasn’t seen it yet. To them, the save failed. Nothing is lost; the follower is just behind.',
      ],
      changes: [{ text: 'Lag 50 ms → 8 s', tone: 'bad' }, { text: 'Stale read after write', tone: 'bad' }],
      concepts: [{ term: 'Replication lag', def: 'Delay between a write on the leader and its application on a follower.' }],
      scene: {
        nodes: [app({ tag: pill('where’s my recipe?', 'alert', 'bad') }), leader({ tag: pill('recipe #77 ✓', 'check', 'good') }), f1({ tag: pill('8 s behind', 'clock', 'bad') }), f2({ tag: pill('6 s behind', 'clock', 'warn') })],
        links: [link('app', 'leader'), link('app', 'f1', { arrow: 'both' }), ...stream],
        flows: [flow(['app', 'leader'], { kind: 'write', rate: 0.5 }), flow(['app', 'f1'], { back: true, rate: 1.2 }), flow(['leader', 'f1'], { kind: 'write', rate: 4, speed: 0.4 }), flow(['leader', 'f2'], { kind: 'write', rate: 4, speed: 0.4 })],
        metrics: { reads: '3×', wlat: '4 ms', lag: { v: '8 s', tone: 'bad' }, risk: 'lag window' },
      },
    },
    {
      short: 'Read own',
      kind: 'technique',
      title: 'Read-your-writes',
      body: [
        'Guarantee that a user always sees <b>their own</b> writes. Simple version: after a user writes, route their reads to the leader for a short window. Precise version: remember the log position (LSN) of their last write and only read from a follower that has applied at least that far.',
        'Other users may still see the recipe a few seconds late — usually fine. The author never will.',
      ],
      note: { kind: 'tip', text: 'Related session guarantee: monotonic reads. Pin a user to one follower so they never see data go “backwards” by hitting a more-lagged replica on the next request.' },
      changes: [{ text: 'Author reads → leader for 10 s', tone: 'good' }],
      concepts: [{ term: 'Read-your-writes', def: 'A consistency guarantee that a client always observes the effects of its own earlier writes.' }],
      scene: {
        nodes: [app({ tag: pill('wrote at LSN 9031', 'pin') }), leader({ tag: pill('recipe #77 ✓', 'check', 'good') }), f1({ tag: pill('at LSN 8870', 'clock', 'warn') }), f2()],
        links: [link('app', 'leader', { arrow: 'both', label: pill('author reads') }), link('app', 'f2', { style: 'dashed' }), ...stream],
        flows: [flow(['app', 'leader'], { back: true, rate: 1 }), flow(['app', 'f2'], { back: true, rate: 2 }), ...repl],
        metrics: { reads: '3×', wlat: '4 ms', lag: { v: '8 s', tone: 'warn' }, risk: 'lag window' },
      },
    },
    {
      short: 'Sync?',
      kind: 'tradeoff',
      title: 'Synchronous, asynchronous, or both',
      body: [
        '<b>Synchronous</b>: the leader waits for a follower to confirm before acknowledging a write. No acknowledged write can be lost if the leader dies — but every write pays a network round trip, and a slow follower stalls everyone.',
        '<b>Asynchronous</b>: fast and resilient to slow followers, but recent writes can vanish on failover. A common middle ground is <b>semi-synchronous</b>: one follower synchronous, the rest asynchronous.',
      ],
      changes: [{ text: 'F1 synchronous', tone: 'good' }, { text: 'Write latency 4 → 6 ms', tone: 'bad' }],
      concepts: [{ term: 'Semi-synchronous replication', def: 'Waiting for at least one follower to confirm each write, while others replicate asynchronously.' }],
      scene: {
        nodes: [app(), leader({ tag: pill('wait for F1 ack', 'timer') }), f1({ tag: pill('sync', 'shield', 'good') }), f2({ tag: pill('async', 'clock') })],
        links: [link('app', 'leader'), link('leader', 'f1', { arrow: 'both', label: pill('ack') }), link('leader', 'f2')],
        flows: [flow(['app', 'leader', 'f1'], { kind: 'write', back: true, rate: 1 }), flow(['leader', 'f2'], { kind: 'write', rate: 1.2 })],
        metrics: { reads: '3×', wlat: { v: '6 ms', tone: 'warn' }, lag: 'F1: 0', risk: { v: 'none (F1)', tone: 'good' } },
      },
    },
    {
      short: 'Failover',
      kind: 'technique',
      title: 'The leader dies: promote a follower',
      body: [
        'The leader’s disk fails. A failover process — automated or a human with a runbook — notices, picks the most up-to-date follower (F1, which was synchronous), promotes it, and repoints the app and the remaining follower at it.',
        'With fully asynchronous replication, whatever the old leader acknowledged but hadn’t shipped is <b>lost</b>. Detection is hard too: too sensitive and a GC pause triggers needless failovers; too relaxed and the outage drags on.',
      ],
      changes: [{ text: 'Leader down', tone: 'bad' }, { text: 'F1 promoted in ~20 s', tone: 'good' }],
      concepts: [{ term: 'Failover', def: 'Switching the leader role to a healthy replica after the current leader fails.' }],
      scene: {
        nodes: [app(), leader({ state: 'down', tag: pill('disk failure', 'alert', 'bad') }), f1({ name: 'New leader', tone: 'orange', sub: 'writes', tag: pill('promoted', 'check', 'good') }), f2()],
        links: [link('app', 'leader', { style: 'broken' }), link('app', 'f1', { arrow: 'both' }), link('f1', 'f2', { label: pill('WAL stream') })],
        flows: [flow(['app', 'f1'], { kind: 'write', rate: 0.6 }), flow(['app', 'f1'], { back: true, rate: 1.5 }), flow(['f1', 'f2'], { kind: 'write', rate: 1.5 })],
        metrics: { reads: '2×', wlat: '4 ms', lag: '50 ms', risk: { v: '0 (was sync)', tone: 'good' } },
      },
    },
    {
      short: 'Split brain',
      kind: 'problem',
      title: 'Split brain: two leaders at once',
      body: [
        'The old leader wasn’t dead — it was cut off by a network partition. When the network heals it still believes it’s the leader, and some app servers with stale config keep writing to it. Two nodes now accept conflicting writes to the same rows.',
        'Prevent it with <b>fencing</b>: each leadership term gets a number, storage rejects writes carrying an older term, and the deposed node is forcibly isolated. Reliable leader election needs a <b>majority</b> agreement — the consensus lesson covers how.',
      ],
      note: { kind: 'warn', text: 'Split brain corrupts data silently. Any failover system that can’t prove the old leader has stopped is a time bomb.' },
      changes: [{ text: 'Two leaders accept writes', tone: 'bad' }, { text: 'Fix: fencing tokens + majority', tone: 'good' }],
      concepts: [
        { term: 'Split brain', def: 'Two nodes simultaneously believing they are the leader and accepting writes.' },
        { term: 'Fencing token', def: 'A monotonically increasing number attached to a leader’s requests so that stale leaders’ writes can be rejected.' },
      ],
      scene: {
        nodes: [app(), leader({ tag: pill('term 7: I’m leader', 'alert', 'bad') }), f1({ name: 'Leader', tone: 'orange', tag: pill('term 8: I’m leader', 'alert', 'warn') }), f2()],
        links: [link('app', 'leader', { style: 'dashed' }), link('app', 'f1'), link('leader', 'f1', { style: 'broken' })],
        flows: [flow(['app', 'leader'], { kind: 'write', rate: 1 }), flow(['app', 'f1'], { kind: 'write', rate: 1 })],
        metrics: { reads: '—', wlat: '4 ms', lag: '—', risk: { v: 'conflicts', tone: 'bad' } },
      },
    },
    {
      short: 'Multi-leader',
      kind: 'insight',
      title: 'More than one writer, on purpose',
      body: [
        '<b>Multi-leader</b>: a leader per region accepts local writes and replicates to the others. Writes are fast everywhere, but two regions can edit the same row concurrently, so conflicts must be resolved — last-write-wins (which silently drops data) or merge logic.',
        '<b>Leaderless</b> (Dynamo-style): clients write to N replicas and succeed after W acknowledge; reads ask R replicas. If <code>W + R > N</code>, every read overlaps at least one up-to-date copy.',
      ],
      concepts: [
        { term: 'Multi-leader replication', def: 'Several nodes accept writes and replicate to each other; requires conflict resolution.' },
        { term: 'Quorum', def: 'With N replicas, writing to W and reading from R where W + R > N guarantees overlapping replicas.' },
      ],
      scene: {
        nodes: [
          zone('eu', -6, 0, 6, 6, 'EU', 'blue'),
          zone('us', 6, 0, 6, 6, 'US', 'teal'),
          db('leu', -6, 0, 'Leader EU', { tone: 'orange' }),
          db('lus', 6, 0, 'Leader US', { tone: 'orange' }),
        ],
        links: [link('leu', 'lus', { arrow: 'both', label: pill('async, conflicts possible', 'refresh', 'warn') })],
        flows: [flow(['leu', 'lus'], { kind: 'write', rate: 1 }), flow(['lus', 'leu'], { kind: 'write', rate: 1 })],
        metrics: { reads: 'per region', wlat: { v: 'local', tone: 'good' }, lag: '~100 ms', risk: { v: 'conflicts', tone: 'warn' } },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Copies buy capacity and survival — and lag',
      body: [
        '<b>Leader-follower</b> replication scales reads and keeps live copies. Asynchronous replication introduces <b>lag</b>: protect users with read-your-writes and monotonic reads. <b>Synchronous</b> (or semi-sync) followers make failover lossless at a latency cost.',
        'Failover is where things go wrong: detect carefully, promote the most up-to-date replica, and <b>fence</b> the old leader. Multi-leader and quorum systems trade conflict handling for write availability.',
      ],
      scene: {
        nodes: [app(), leader({ tag: pill('fenced by term', 'shield', 'good') }), f1({ tag: pill('sync', 'shield') }), f2({ tag: pill('async', 'clock') })],
        links: [link('app', 'leader'), link('app', 'f1', { style: 'dashed' }), link('app', 'f2', { style: 'dashed' }), ...stream],
        flows: [flow(['app', 'leader'], { kind: 'write', rate: 0.6 }), flow(['app', 'f2'], { back: true, rate: 2 }), ...repl],
        metrics: { reads: '3×', wlat: '6 ms', lag: '50 ms', risk: 'none (sync)' },
      },
    },
  ],
};

export default lesson;
