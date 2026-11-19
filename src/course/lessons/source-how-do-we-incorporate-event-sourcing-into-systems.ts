import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const cmd = (extra: Partial<SceneNode> = {}) => box('cmd', -16, 0, 'Command', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const agg = (extra: Partial<SceneNode> = {}) => box('agg', -8, 0, 'Aggregate (business rules)', 'blue', 'cpu', { size: [1.5, 1.5], height: 30, ...extra });
const log = (extra: Partial<SceneNode> = {}) => disk('log', 1, 0, 'Event store (append-only)', { size: [3, 1.2], height: 20, tone: 'yellow', icon: 'list', ...extra });
const proj = (extra: Partial<SceneNode> = {}) => box('proj', 10, -4, 'Projection / read model', 'orange', 'refresh', { size: [1.4, 1.4], height: 26, ...extra });
const read = (extra: Partial<SceneNode> = {}) => db('read', 17, -4, 'Query database', { size: [1.3, 1.3], ...extra });
const snap = (extra: Partial<SceneNode> = {}) => db('snap', 1, 8, 'Snapshots', { size: [1.2, 1.2], ...extra });

const fmtT = (s: number): string => (s >= 7200 ? `${(s / 3600).toFixed(1)} h` : s >= 120 ? `${(s / 60).toFixed(1)} min` : s >= 1 ? `${s.toFixed(1)} s` : s >= 0.001 ? `${(s * 1000).toFixed(1)} ms` : `${Math.round(s * 1e6)} µs`);
const fmtB = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

const lesson: Lesson = {
  slug: 'source-how-do-we-incorporate-event-sourcing-into-systems',
  title: 'Event Sourcing and CQRS',
  blurb: 'Store what happened, not what is: an append-only event log as the source of truth, state rebuilt by replay, read models built by projections — and what replay, snapshots and rebuilds cost.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'replay', label: 'Load one aggregate: replay from the start', icon: 'clock' },
    { key: 'snap', label: 'Load one aggregate: with snapshots', icon: 'check' },
    { key: 'store', label: 'Event store size', icon: 'disk' },
    { key: 'rebuild', label: 'Rebuild a read model from scratch', icon: 'refresh' },
  ],
  goals: [
    { text: 'State as a fold over immutable events', step: 1 },
    { text: 'Commands, aggregates and optimistic concurrency', step: 2 },
    { text: 'Replay cost and snapshots', step: 3 },
    { text: 'Projections and CQRS read models', step: 4 },
    { text: 'Schema evolution, deletion and when not to use it', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'per', label: 'Events per aggregate over its life', min: 1, max: 1000000, step: 1, default: 20000, unit: '', description: 'Average length of one entity’s history (an account, an order, a document).' },
      { key: 'us', label: 'Time to apply one event', min: 1, max: 1000, step: 1, default: 20, unit: ' µs', description: 'Cost of folding one event into state, including deserialisation.' },
      { key: 'k', label: 'Snapshot every', min: 10, max: 100000, step: 10, default: 500, unit: ' events', description: 'Events between snapshots; loading replays at most this many.' },
      { key: 'total', label: 'Total events stored', min: 1000000, max: 100000000000, step: 1000000, default: 1000000000, unit: '', description: 'All events across all aggregates.' },
      { key: 'bytes', label: 'Bytes per event', min: 50, max: 5000, step: 50, default: 400, unit: ' B', description: 'Serialized event with metadata.' },
      { key: 'rate', label: 'Projection throughput', min: 1000, max: 1000000, step: 1000, default: 50000, unit: ' events/s', description: 'How fast a projector can process events when rebuilding a view.' },
    ],
    calculate: (input, step) => {
      const per = Math.max(1, input.per ?? 20000);
      const us = Math.max(0.1, input.us ?? 20) / 1e6;
      const k = Math.max(1, input.k ?? 500);
      const total = Math.max(1, input.total ?? 1e9);
      const bytes = Math.max(1, input.bytes ?? 400);
      const rate = Math.max(1, input.rate ?? 5e4);
      return {
        replay: step < 2 ? { v: '—' } : { v: fmtT(per * us), tone: per * us < 0.05 ? 'good' : per * us < 0.5 ? 'warn' : 'bad' },
        snap: step < 2 ? { v: '—' } : { v: `${fmtT(Math.min(per, k) * us)} (≤ ${Math.min(per, k).toLocaleString('en-US')} events)`, tone: 'good' },
        store: step < 1 ? { v: '—' } : { v: fmtB(total * bytes), tone: total * bytes > 1e12 ? 'warn' : 'good' },
        rebuild: step < 3 ? { v: '—' } : { v: fmtT(total / rate), tone: total / rate < 3600 ? 'good' : total / rate < 86400 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'The idea',
      kind: 'insight',
      title: 'Store the changes, derive the state',
      body: [
        'A normal database stores the <i>current state</i>: the account balance is 640. Update it and the old value is gone. <b>Event sourcing</b> stores the <b>sequence of facts that happened</b> — <code>AccountOpened</code>, <code>Deposited(500)</code>, <code>Withdrew(60)</code>, <code>Deposited(200)</code> — in an append-only log, and <b>derives</b> the current state by replaying them: state = fold(events). Events are immutable, named in the past tense and carry business meaning, not just changed columns.',
        'The log is the <b>source of truth</b>. You get a complete audit trail for free, can answer “what was the state last Tuesday?” by replaying to that point, can fix a bug by correcting the code and replaying, and can build new views of the same history later. Banking ledgers and version control work this way.',
      ],
      changes: [{ text: 'state = fold(apply, events)', tone: 'info' }, { text: 'Audit, time travel and rebuildable views for free', tone: 'good' }],
      scene: { nodes: [log({ tag: pill('Opened · +500 · −60 · +200', 'list') }), box('state', 11, 0, 'Balance = 640', 'green', 'gauge', { size: [1.3, 1.3], height: 24, tag: pill('derived by replay', 'refresh') })], links: [link('log', 'state', { arrow: 'end' })], flows: [flow(['log', 'state'], { rate: 1.5 })] },
    },
    {
      short: 'Commands',
      kind: 'technique',
      title: 'Commands decide, events record',
      body: [
        'A <b>command</b> is a request (“withdraw 60”). The <b>aggregate</b> — the consistency boundary (one account, one order) — loads its state by replaying its events, <b>validates the command against the business rules</b> (sufficient funds?) and, if it passes, emits one or more <b>events</b> that are appended to the log. Events are facts: they are never rejected or changed after the fact; a mistake is fixed by appending a compensating event (<code>WithdrawalReversed</code>).',
        'Concurrent commands on the same aggregate are handled by <b>optimistic concurrency</b>: each append states the version it expected (“append at position 7”); if someone else appended first the write fails and the command is retried against the new state. This gives per-aggregate serialisation without locks, and the stream version doubles as an idempotency guard.',
      ],
      changes: [{ text: 'Validate against current state, then append events', tone: 'good' }, { text: 'Append expects version N → conflict → retry', tone: 'good' }],
      scene: { nodes: [cmd({ tag: pill('withdraw 60', 'file') }), agg({ tag: pill('rules: balance ≥ 60?', 'shield') }), log({ tag: pill('append @ version 7', 'check', 'good') })], links: [link('cmd', 'agg'), link('agg', 'log')], flows: [flow(['cmd', 'agg', 'log'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Replay',
      kind: 'problem',
      title: 'Replay cost grows with history — snapshots cap it',
      body: [
        'Loading an aggregate replays all its events. At 20 µs per event, 20,000 events take <b>0.4 s</b> — too slow on every command. A <b>snapshot</b> stores the folded state at version N; loading becomes “read the latest snapshot, replay the events after it”, bounded by the snapshot interval: every 500 events means at most <b>10 ms</b>.',
        'Snapshots are an <i>optimisation, not truth</i>: they can be rebuilt from the log and discarded freely, and written asynchronously. Most aggregates are short-lived (an order has 10 events), so snapshot only the long ones; keep aggregates small by design (one account, not “all accounts”) and archive finished streams.',
      ],
      changes: [{ text: '20,000 × 20 µs = 0.4 s per load', tone: 'bad' }, { text: 'Snapshot every 500 → ≤ 10 ms', tone: 'good' }],
      scene: { nodes: [agg({ tag: pill('load = snapshot + recent events', 'check', 'good') }), snap({ tag: pill('state @ v19,500', 'file') }), log({ tag: pill('events 19,501 → 20,000', 'list') })], links: [link('agg', 'snap'), link('agg', 'log')], flows: [flow(['agg', 'snap'], { rate: 1, back: true }), flow(['agg', 'log'], { rate: 1.2, back: true })] },
    },
    {
      short: 'CQRS',
      kind: 'technique',
      title: 'Projections and read models (CQRS)',
      body: [
        'Replaying a stream answers “what is this account’s state?” but not “which customers have a balance over 10,000?”. <b>Projections</b> subscribe to the event stream and maintain <b>read models</b> shaped for queries — a relational table, a search index, a cache, an analytics store. This is <b>CQRS</b> (command–query responsibility segregation): the write side enforces rules over events; the read side is denormalised and can scale independently, with as many specialised views as you need.',
        'Read models are <b>eventually consistent</b>: after a command succeeds there is a lag (milliseconds to seconds) before the view reflects it, so UIs need patterns — return the new state from the command, optimistic updates, or read-your-writes tokens (see the Consistency Patterns lesson). Projectors must be <b>idempotent</b> and track their position in the stream.',
      ],
      changes: [{ text: 'Write side: events · read side: purpose-built views', tone: 'good' }, { text: 'Views lag the log; projectors are idempotent', tone: 'info' }],
      scene: { nodes: [log(), proj({ tag: pill('idempotent, tracks position', 'check') }), read({ tag: pill('eventually consistent', 'clock', 'warn') })], links: [link('log', 'proj'), link('proj', 'read')], flows: [flow(['log', 'proj', 'read'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Rebuild',
      kind: 'technique',
      title: 'The superpower and the bill: rebuilding views',
      body: [
        'Because the log is the truth, a read model can be <b>thrown away and rebuilt</b> — to fix a projection bug, add a new view, or migrate to a new database — by replaying from the beginning. At 1 billion events and 50,000 events/s a full rebuild takes <b>5.6 hours</b>; you must run it alongside live traffic, then catch up and switch over (blue/green views), and plan the capacity.',
        'The event store itself grows forever: 1 billion events × 400 B = <b>400 GB</b>; ten billion is 4 TB. That is cheap storage, but tiering, <b>archiving</b> old streams and periodically compacting derived data matter. Partition the store by aggregate id so appends scale horizontally, and ensure ordering only <i>within</i> a stream — global ordering is expensive and rarely needed.',
      ],
      changes: [{ text: '1B events ÷ 50k/s = 5.6 h rebuild', tone: 'info' }, { text: '1B × 400 B = 400 GB, growing forever', tone: 'info' }],
      scene: { nodes: [log({ tag: pill('replay from event 1', 'refresh') }), proj({ tag: pill('new projection version', 'bolt') }), read({ name: 'New view', tag: pill('swap when caught up', 'check', 'good') })], links: [link('log', 'proj'), link('proj', 'read')], flows: [flow(['log', 'proj', 'read'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Hard parts',
      kind: 'problem',
      title: 'Schema evolution, deletion and over-use',
      body: [
        '<b>Schema evolution</b>: events live forever, so old shapes must stay readable. Use <b>versioned events</b> and <b>upcasters</b> (translate old versions to the current when reading), prefer additive changes, and never reuse event names for new meanings. <b>Privacy and deletion</b>: “right to be forgotten” collides with immutability — solve with <b>crypto-shredding</b> (encrypt personal data with a per-person key and delete the key) or by keeping personal data out of events (store references).',
        '<b>Complexity</b>: eventual consistency, projections, replay, versioning and tooling are real costs. Use event sourcing where history and audit are intrinsic (ledgers, bookings, workflows, collaborative state) and where you benefit from multiple views; avoid it for simple CRUD, and don’t confuse it with <i>using events for integration</i> — you can publish events without sourcing state from them. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Versioned events + upcasters; additive changes', tone: 'good' }, { text: 'Crypto-shredding for erasure', tone: 'good' }, { text: 'Use where history is intrinsic; avoid for plain CRUD', tone: 'info' }],
      scene: { nodes: [log({ tag: pill('v1 · v2 · v3 events', 'layers') }), box('up', 10, -4, 'Upcaster', 'teal', 'refresh', { size: [1.2, 1.2], height: 22, tag: pill('old → current', 'check') }), box('key', 10, 6, 'Per-person key', 'red', 'lock', { size: [1.2, 1.2], height: 22, tag: pill('delete key = forget', 'shield') })], links: [link('log', 'up'), link('log', 'key', { style: 'dashed' })], flows: [flow(['log', 'up'], { rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'The log is the truth; everything else is a view',
      body: [
        'Event sourcing stores immutable events and derives state by replay; aggregates validate commands and append under optimistic concurrency; <b>snapshots</b> bound load time (≈ interval × cost per event); <b>CQRS projections</b> build query-shaped, eventually consistent read models that can be rebuilt (≈ events ÷ projection rate).',
        'Plan for schema evolution, erasure, growth and operational complexity — and choose it only where history is a first-class requirement.',
      ],
      scene: { nodes: [cmd(), agg(), log(), proj(), read()], links: [link('cmd', 'agg'), link('agg', 'log'), link('log', 'proj'), link('proj', 'read')], flows: [flow(['cmd', 'agg', 'log', 'proj', 'read'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
