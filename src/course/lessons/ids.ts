import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const svc = (i: number, extra: Partial<SceneNode> = {}) =>
  box(`w${i}`, -8 + i * 1.5, -7 + i * 5, `Worker ${i}`, 'blue', 'server', { size: [1.3, 1.3], height: 36, ...extra });
const workers = (extra: (i: number) => Partial<SceneNode> = () => ({})) => [1, 2, 3].map((i) => svc(i, extra(i)));
const shardA = (extra: Partial<SceneNode> = {}) => db('sa', 7, -5, 'Shard A', extra);
const shardB = (extra: Partial<SceneNode> = {}) => db('sb', 9, 4, 'Shard B', extra);

const lesson: Lesson = {
  slug: 'ids',
  title: 'Generating IDs',
  blurb: 'Unique, compact, roughly time-ordered identifiers — produced by many machines at once without asking each other.',
  minutes: 10,
  level: 'Intermediate',
  metrics: [
    { key: 'rate', label: 'IDs / s', icon: 'activity' },
    { key: 'coord', label: 'Coordination', icon: 'link' },
    { key: 'sortable', label: 'Time-sortable', icon: 'clock' },
    { key: 'size', label: 'Size', icon: 'hash' },
  ],
  goals: [
    { text: 'Why auto-increment breaks after sharding', step: 1 },
    { text: 'Central allocators and block leasing', step: 2 },
    { text: 'Random UUIDs and their index cost', step: 3 },
    { text: 'Snowflake-style time-ordered IDs', step: 5 },
    { text: 'Clock skew and public ID exposure', step: 8 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  steps: [
    {
      short: 'Collision',
      kind: 'problem',
      title: 'Two shards, two order #1001s',
      body: [
        'Orders used the database’s auto-increment column. After sharding, each shard runs its own counter — and both happily issue order <b>#1001</b>. Joins, URLs and support tickets referencing “order 1001” are now ambiguous.',
        'We need IDs that are unique across every machine, ideally without a network call per ID.',
      ],
      changes: [{ text: 'Duplicate IDs across shards', tone: 'bad' }],
      scene: {
        nodes: [...workers(), shardA({ tag: pill('next id: 1001', 'hash', 'bad') }), shardB({ tag: pill('next id: 1001', 'hash', 'bad') })],
        links: [link('w1', 'sa'), link('w2', 'sb'), link('w3', 'sa')],
        flows: [flow(['w1', 'sa'], { kind: 'write', rate: 1 }), flow(['w2', 'sb'], { kind: 'write', rate: 1 })],
        metrics: { rate: '8k/s', coord: 'per shard', sortable: 'yes', size: { v: 'duplicates', tone: 'bad' } },
      },
    },
    {
      short: 'Allocator',
      kind: 'technique',
      title: 'A central allocator, used sparingly',
      body: [
        'Run one service (or one database sequence) that hands out IDs. Calling it per ID adds a network hop to every insert and makes it a single point of failure.',
        'Instead, lease <b>blocks</b>: a worker asks for 1,000 IDs at once, gets <code>48,001–49,000</code>, and allocates locally until it runs out. One call per thousand IDs; if the allocator is briefly down, workers keep going on what they hold. IDs are no longer perfectly ordered across workers, and a crash wastes the rest of a block — both usually fine.',
      ],
      concepts: [{ term: 'Hi/lo allocation', def: 'Leasing ranges of IDs from a central counter and allocating within the range locally.' }],
      changes: [{ text: '1 allocator call per 1,000 IDs', tone: 'good' }],
      scene: {
        nodes: [box('alloc', 0, 0, 'Allocator', 'yellow', 'hash', { size: [1.4, 1.4], height: 38, tag: pill('next block: 49,001', 'layers') }), ...workers((i) => ({ tag: pill(`block ${47 + i},001…`, 'list') })), shardA(), shardB()],
        links: [link('w1', 'alloc', { arrow: 'both', style: 'dashed' }), link('w2', 'alloc', { arrow: 'both', style: 'dashed' }), link('w3', 'alloc', { arrow: 'both', style: 'dashed' }), link('w1', 'sa'), link('w2', 'sb'), link('w3', 'sa')],
        flows: [flow(['w2', 'alloc'], { kind: 'request', back: true, rate: 0.3 }), flow(['w1', 'sa'], { kind: 'write', rate: 1.5 }), flow(['w2', 'sb'], { kind: 'write', rate: 1.5 }), flow(['w3', 'sa'], { kind: 'write', rate: 1.5 })],
        metrics: { rate: '8k/s', coord: { v: 'per 1,000', tone: 'good' }, sortable: 'roughly', size: '64-bit' },
      },
    },
    {
      short: 'UUIDv4',
      kind: 'tradeoff',
      title: 'Random UUIDs: no coordination at all',
      body: [
        'A version-4 UUID is 122 random bits. Any machine generates one locally, and the chance of a collision is negligible for any realistic volume. No allocator, no network, no state.',
        'Costs: 16 bytes (36 as text) in every row and every index entry, no ordering by time, and — the big one — <b>random inserts</b> into B-tree indexes. Each new ID lands on a random leaf page, so the whole index must stay in memory or every insert becomes a disk read.',
      ],
      changes: [{ text: 'Zero coordination', tone: 'good' }, { text: 'Random index inserts', tone: 'bad' }],
      concepts: [{ term: 'UUID', def: 'A 128-bit identifier; version 4 is random, versions 6/7 embed a timestamp.' }],
      scene: {
        nodes: [...workers((i) => ({ tag: pill(['3f2a…', 'c81e…', '07b4…'][i - 1]!, 'hash') })), shardA({ tag: pill('index pages: random', 'alert', 'warn') }), shardB()],
        links: [link('w1', 'sa'), link('w2', 'sb'), link('w3', 'sa')],
        flows: [flow(['w1', 'sa'], { kind: 'write', rate: 1.5 }), flow(['w2', 'sb'], { kind: 'write', rate: 1.5 }), flow(['w3', 'sa'], { kind: 'write', rate: 1.5 })],
        metrics: { rate: '∞ local', coord: { v: 'none', tone: 'good' }, sortable: { v: 'no', tone: 'bad' }, size: '128-bit' },
      },
    },
    {
      short: 'Wishlist',
      kind: 'insight',
      title: 'What we actually want',
      body: [
        'Ideal IDs are <b>unique</b> without coordination, <b>roughly ordered by time</b> (so new rows append to the right edge of indexes and “newest first” is a cheap sort), and <b>compact</b> — 64 bits fits a native integer column.',
        'The trick is to build the ID from parts each machine can know on its own: the time, its own identity, and a local counter.',
      ],
      scene: {
        nodes: [box('id', 0, 0, 'ID', 'green', 'hash', { size: [2.2, 1.2], height: 30, tag: pill('time | machine | counter', 'hash', 'accent') })],
        metrics: { rate: '?', coord: 'none', sortable: 'yes', size: '64-bit' },
      },
    },
    {
      short: 'Snowflake',
      kind: 'technique',
      title: 'Time + machine + sequence in 64 bits',
      body: [
        'A Snowflake-style ID packs <b>41 bits</b> of milliseconds since a custom epoch (~69 years), <b>10 bits</b> of machine ID (1,024 generators), and a <b>12-bit</b> per-millisecond sequence (4,096 IDs per ms per machine).',
        'Each worker generates IDs entirely locally. IDs sort by creation time across the fleet (to within clock accuracy), fit a <code>BIGINT</code>, and insert at the end of B-tree indexes.',
      ],
      note: { kind: 'tip', text: 'If a worker exhausts its 4,096 sequence numbers within one millisecond, it simply waits for the next millisecond.' },
      changes: [{ text: '4M IDs/s per worker, no network', tone: 'good' }],
      concepts: [{ term: 'Snowflake ID', def: 'A 64-bit ID composed of a timestamp, a machine identifier and a per-ms sequence number.' }],
      scene: {
        nodes: [
          box('ts', -6, 0, '41b time', 'yellow', 'clock', { size: [2.6, 1.2], height: 26 }),
          box('mid', 0, 0, '10b machine', 'blue', 'server', { size: [1.4, 1.2], height: 26 }),
          box('seq', 4.5, 0, '12b seq', 'green', 'hash', { size: [1.4, 1.2], height: 26, tag: pill('0 … 4095 per ms') }),
          ...workers().map((n, i) => ({ ...n, at: [n.at[0] + 4, n.at[1] + 8] as [number, number], tag: pill(`machine ${i + 3}`, 'server') })),
        ],
        links: [link('ts', 'mid', { arrow: 'none' }), link('mid', 'seq', { arrow: 'none' })],
        metrics: { rate: { v: '4M/s/worker', tone: 'good' }, coord: { v: 'none', tone: 'good' }, sortable: { v: 'yes', tone: 'good' }, size: { v: '64-bit', tone: 'good' } },
      },
    },
    {
      short: 'Machine IDs',
      kind: 'technique',
      title: 'Who decides each machine’s number?',
      body: [
        'The scheme is only unique if no two live workers share a machine ID. Static config works for a fixed fleet; autoscaled containers need to <b>lease</b> an ID from a coordination service (etcd, ZooKeeper, a DB row with a TTL) at startup and renew it.',
        'If a worker can’t renew its lease, it must stop issuing IDs before the lease expires and another worker could claim the same number.',
      ],
      scene: {
        nodes: [box('coord', 0, -2, 'etcd', 'yellow', 'key', { size: [1.4, 1.4], height: 36, tag: pill('lease ids 0…1023', 'key') }), ...workers((i) => ({ tag: pill(`id ${i + 2} · TTL 30 s`, 'timer') }))],
        links: [link('w1', 'coord', { arrow: 'both', style: 'dashed' }), link('w2', 'coord', { arrow: 'both', style: 'dashed' }), link('w3', 'coord', { arrow: 'both', style: 'dashed' })],
        flows: [flow(['w1', 'coord'], { kind: 'handshake', back: true, rate: 0.4 }), flow(['w3', 'coord'], { kind: 'handshake', back: true, rate: 0.4 })],
        metrics: { rate: '4M/s/worker', coord: 'at startup', sortable: 'yes', size: '64-bit' },
      },
    },
    {
      short: 'Clock skew',
      kind: 'case',
      title: 'Case: the clock jumps backwards',
      body: [
        'NTP corrects a drifting clock on worker 2 by stepping it back 40 ms. For the next 40 ms its timestamps repeat ones it already used — with the same machine ID and a reset sequence, it can issue <b>duplicates</b>.',
        'Generators must remember the last timestamp they used and refuse (or wait) if the clock goes backwards. Configure NTP to slew rather than step, and alert on large corrections.',
      ],
      changes: [{ text: 'Clock −40 ms', tone: 'bad' }, { text: 'Guard: wait until time > last', tone: 'good' }],
      scene: {
        nodes: workers((i) => (i === 2 ? { state: 'hot', tag: pill('clock −40 ms: waiting', 'clock', 'warn') } : { tag: pill('ok', 'check', 'good') })),
        links: [],
        metrics: { rate: '4M/s/worker', coord: 'none', sortable: 'yes', size: '64-bit' },
      },
    },
    {
      short: 'Exposure',
      kind: 'tradeoff',
      title: 'IDs leak more than you think',
      body: [
        'Sequential IDs in URLs reveal volume (a competitor places two orders a day apart and subtracts) and invite enumeration (<code>/invoice/1002</code>, <code>/1003</code> …). Time-based IDs reveal when something was created.',
        'Keep compact internal IDs for joins and indexes, and expose a separate opaque public ID — random, or the internal one encrypted — in URLs and APIs. And never rely on an ID being unguessable as access control.',
      ],
      scene: {
        nodes: [box('web', 0, 0, 'Public URL', 'teal', 'link', { size: [1.6, 1.6], height: 36, tag: pill('/o/q7Xk2mP9', 'link', 'good') }), db('db', 8, 0, 'Orders', { tag: pill('id 7163514902', 'hash') })],
        links: [link('web', 'db', { label: pill('lookup by public_id') })],
        flows: [flow(['web', 'db'], { back: true, rate: 1 })],
        metrics: { rate: '—', coord: '—', sortable: 'internal only', size: '+ public id' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Unique without asking anyone',
      body: [
        'Auto-increment stops being unique once data is sharded. <b>Block leasing</b> keeps a central counter cheap; <b>random UUIDs</b> need no coordination but hurt index locality; <b>Snowflake-style</b> IDs (and UUIDv7 or ULID, their 128-bit cousins) give local generation, compactness and time ordering.',
        'Guard against clock steps, lease machine IDs safely, and keep internal IDs out of public URLs.',
      ],
      scene: {
        nodes: [...workers((i) => ({ tag: pill(`machine ${i + 2}`, 'server') })), shardA({ tag: pill('appends at the end', 'layers', 'good') }), shardB()],
        links: [link('w1', 'sa'), link('w2', 'sb'), link('w3', 'sa')],
        flows: [flow(['w1', 'sa'], { kind: 'write', rate: 1.5 }), flow(['w2', 'sb'], { kind: 'write', rate: 1.5 }), flow(['w3', 'sa'], { kind: 'write', rate: 1.5 })],
        metrics: { rate: '4M/s/worker', coord: 'none', sortable: 'yes', size: '64-bit' },
      },
    },
  ],
};

export default lesson;
