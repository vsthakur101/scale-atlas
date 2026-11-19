import type { Lesson, SceneNode, Tone } from '../../types';
import { at, box, db, flow, link, onRing, pill, ring } from '../kit';

const C0 = at(0, 0);
const R = 5;
const hashRing = (extra: Partial<SceneNode> = {}) => ring('ring', 0, 0, R, '0 … 2³²', extra);

const server = (id: string, deg: number, tone: Tone, extra: Partial<SceneNode> = {}): SceneNode => ({
  ...box(id, 0, 0, '', tone, 'server', { size: [1.15, 1.15], height: 30, label: pill(`Server ${id.toUpperCase()}`) }),
  at: onRing(C0, R, deg),
  ...extra,
});
const key = (id: string, deg: number, tone: Tone, extra: Partial<SceneNode> = {}): SceneNode => ({
  id,
  kind: 'disk',
  at: onRing(C0, R, deg),
  size: [0.5, 0.5],
  height: 10,
  tone,
  label: pill(id, 'key'),
  ...extra,
});

const A = (x: Partial<SceneNode> = {}) => server('a', 20, 'blue', x);
const B = (x: Partial<SceneNode> = {}) => server('b', 110, 'orange', x);
const Cn = (x: Partial<SceneNode> = {}) => server('c', 200, 'green', x);
const D = (x: Partial<SceneNode> = {}) => server('d', 290, 'purple', x);

const keys = (owner: Record<string, Tone>) =>
  (
    [
      ['k1', 50],
      ['k2', 95],
      ['k3', 150],
      ['k4', 185],
      ['k5', 240],
      ['k6', 275],
      ['k7', 330],
      ['k8', 5],
    ] as const
  ).map(([id, deg]) => key(id, deg, owner[id] ?? 'grey'));

const base: Record<string, Tone> = { k1: 'orange', k2: 'orange', k3: 'green', k4: 'green', k5: 'purple', k6: 'purple', k7: 'blue', k8: 'blue' };
const owns = (m: Record<string, string>) => Object.entries(m).map(([k, s]) => flow([k, s], { kind: 'request', rate: 0.6 }));

const lesson: Lesson = {
  slug: 'consistent-hashing',
  title: 'Consistent Hashing',
  blurb: 'Place servers and keys on a ring so that adding or losing a server moves only a small slice of the data.',
  minutes: 11,
  level: 'Intermediate',
  metrics: [
    { key: 'servers', label: 'Servers', icon: 'server' },
    { key: 'moved', label: 'Keys moved', icon: 'refresh' },
    { key: 'max', label: 'Largest share', icon: 'scale' },
  ],
  goals: [
    { text: 'Why mod-N hashing breaks when N changes', step: 1 },
    { text: 'Placing keys and servers on a hash ring', step: 3 },
    { text: 'Why only ~1/N of keys move on membership change', step: 5 },
    { text: 'Virtual nodes for even load and weighting', step: 7 },
    { text: 'Ring-based replication and alternatives', step: 9 },
  ],
  legend: ['request', 'fail'],
  steps: [
    {
      short: 'mod N',
      kind: 'problem',
      title: 'Add one cache server, lose most of the cache',
      body: [
        'A cache cluster of four nodes picks a node with <code>hash(key) mod 4</code>. Traffic grows and a fifth node is added. Now <code>mod 5</code> sends about <b>80% of keys</b> to a different node than before — and those nodes don’t have them.',
        'The hit rate collapses from 95% to under 20% in a second, and the database behind the cache takes the full read load. Adding capacity caused an outage.',
      ],
      changes: [{ text: 'mod 4 → mod 5', tone: 'bad' }, { text: '~80% of keys remapped', tone: 'bad' }],
      scene: {
        nodes: [
          box('router', -8, 0, 'Client', 'blue', 'hash', { size: [1.3, 1.3], height: 34, tag: pill('hash(k) mod 5', 'hash', 'warn') }),
          ...['a', 'b', 'c', 'd', 'e'].map((id, i) =>
            box(id, 0 + i * 1.6, -8 + i * 4, `Cache ${id.toUpperCase()}`, 'green', 'bolt', { size: [1.2, 1.2], height: 30, state: id === 'e' ? 'ghost' : 'ok', tag: id === 'e' ? pill('new', 'sparkle') : pill('hit 18%', 'bolt', 'bad') }),
          ),
          db('db', 13, 0, 'Database', { load: 99, state: 'hot' }),
        ],
        links: [...['a', 'b', 'c', 'd', 'e'].map((id) => link('router', id)), ...['a', 'b', 'c', 'd'].map((id) => link(id, 'db', { style: 'dashed' }))],
        flows: [...['a', 'b', 'c', 'd'].map((id) => flow(['router', id, 'db'], { kind: 'heavy', rate: 1, speed: 0.6 }))],
        metrics: { servers: '4 → 5', moved: { v: '80%', tone: 'bad' }, max: '20%' },
      },
    },
    {
      short: 'The ring',
      kind: 'technique',
      title: 'Bend the hash space into a ring',
      body: [
        'Imagine every possible hash value, 0 to 2³², laid around a circle so the largest value wraps back to 0. Hash each <b>server’s name</b> and place it on the ring at that point.',
        'Server positions depend only on their own names — not on how many servers there are. That independence is the whole trick.',
      ],
      concepts: [{ term: 'Hash ring', def: 'The hash output range arranged as a circle, on which both servers and keys are placed.' }],
      scene: {
        nodes: [hashRing(), A(), B(), Cn(), D()],
        metrics: { servers: '4', moved: '—', max: '—' },
      },
    },
    {
      short: 'Clockwise',
      kind: 'technique',
      title: 'A key belongs to the next server clockwise',
      body: [
        'Hash each <b>key</b> onto the same ring and walk clockwise until you hit a server: that server owns the key. Each server is responsible for the arc between its predecessor and itself.',
        'Lookups are a binary search over the sorted server positions — microseconds, done entirely in the client or proxy.',
      ],
      changes: [{ text: 'k3, k4 → C · k5, k6 → D …' }],
      scene: {
        nodes: [hashRing(), A(), B(), Cn(), D(), ...keys(base)],
        flows: owns({ k1: 'b', k2: 'b', k3: 'c', k4: 'c', k5: 'd', k6: 'd', k7: 'a', k8: 'a' }),
        metrics: { servers: '4', moved: '—', max: '25%' },
      },
    },
    {
      short: 'Add E',
      kind: 'insight',
      title: 'Add a server: only its arc moves',
      body: [
        'Server E hashes to a point between B and C. It takes over just the keys on the arc from B to E — here only <b>k3</b>, which used to belong to C. Every other key stays exactly where it was.',
        'On average adding the N-th server moves about <b>1/N</b> of keys, and they all come from one neighbour. A cache cluster keeps ~80% of its hits instead of losing 80%.',
      ],
      changes: [{ text: 'k3: C → E', tone: 'good' }, { text: 'All other keys unchanged', tone: 'good' }],
      scene: {
        nodes: [hashRing(), A(), B(), Cn(), D(), server('e', 160, 'yellow', { tag: pill('new', 'sparkle', 'good') }), ...keys({ ...base, k3: 'yellow' })],
        flows: owns({ k3: 'e' }),
        metrics: { servers: '5', moved: { v: '1 of 8', tone: 'good' }, max: '25%' },
      },
    },
    {
      short: 'Lose D',
      kind: 'insight',
      title: 'Lose a server: its keys go to the next one',
      body: [
        'Server D fails. Its keys — k5 and k6 — now walk further clockwise and land on A. Nothing else moves.',
        'But notice A: it just absorbed D’s entire share on top of its own. With only one point per server, a failure dumps all of a node’s load onto a single neighbour.',
      ],
      changes: [{ text: 'k5, k6: D → A', tone: 'good' }, { text: 'A now owns 50%', tone: 'bad' }],
      scene: {
        nodes: [hashRing(), A({ tag: pill('2× load', 'alert', 'warn') }), B(), Cn(), D({ state: 'down' }), ...keys({ ...base, k5: 'blue', k6: 'blue' })],
        flows: owns({ k5: 'a', k6: 'a' }),
        metrics: { servers: '3', moved: { v: '2 of 8', tone: 'good' }, max: { v: '50%', tone: 'bad' } },
      },
    },
    {
      short: 'Uneven',
      kind: 'problem',
      title: 'Random points make uneven arcs',
      body: [
        'Server positions are effectively random, so arcs come in random sizes. Here four servers own 8%, 10%, 32% and <b>50%</b> of the ring. With a handful of servers this imbalance is the norm, not bad luck.',
      ],
      changes: [{ text: 'Shares: 8% / 10% / 32% / 50%', tone: 'bad' }],
      scene: {
        nodes: [hashRing(), server('a', 10, 'blue', { tag: pill('32%') }), server('b', 40, 'orange', { tag: pill('8%') }), server('c', 76, 'green', { tag: pill('10%') }), server('d', 256, 'purple', { tag: pill('50%', 'alert', 'bad') })],
        metrics: { servers: '4', moved: '—', max: { v: '50%', tone: 'bad' } },
      },
    },
    {
      short: 'Virtual',
      kind: 'technique',
      title: 'Virtual nodes: many small arcs each',
      body: [
        'Give every physical server many positions on the ring — <b>virtual nodes</b>, typically 100–256 — by hashing <code>A#1, A#2, …</code>. Each server now owns many small arcs scattered around the ring, and the law of large numbers evens out its total share.',
        'Two bonuses: when a server fails, its arcs spill onto <i>many</i> different neighbours instead of one, and a server twice as large can simply take twice as many virtual nodes.',
      ],
      changes: [{ text: '4 points per server (100+ in practice)', tone: 'good' }, { text: 'Largest share 50% → 27%', tone: 'good' }],
      concepts: [{ term: 'Virtual node', def: 'One of many ring positions owned by a physical server, used to balance load and spread failover.' }],
      scene: {
        nodes: [
          hashRing(),
          ...(['blue', 'orange', 'green'] as const).flatMap((tone, s) =>
            [0, 1, 2, 3].map((v) => ({
              ...box(`${'abc'[s]}${v}`, 0, 0, `${'ABC'[s]}${v + 1}`, tone, 'server', { size: [0.8, 0.8], height: 20 }),
              at: onRing(C0, R, s * 30 + v * 90 + 8),
            })),
          ),
        ],
        metrics: { servers: '3 × 4 vnodes', moved: '—', max: { v: '27%', tone: 'good' } },
      },
    },
    {
      short: 'Replicas',
      kind: 'technique',
      title: 'Replicate to the next servers clockwise',
      body: [
        'For durability, store each key on the first <b>three distinct</b> physical servers clockwise from it (skipping extra virtual nodes of a server already chosen). This “preference list” is how Dynamo-style stores — Cassandra, Riak, DynamoDB’s ancestors — place replicas.',
        'When a server dies, each key still has two live copies, and the next server along is already the natural place to rebuild the third.',
      ],
      scene: {
        nodes: [hashRing(), A({ tag: pill('replica 2', 'layers') }), B({ tag: pill('replica 3', 'layers') }), Cn(), D({ tag: pill('replica 1', 'layers', 'good') }), key('k6', 275, 'purple', { tag: pill('k6', 'key') })],
        links: [link('k6', 'd'), link('k6', 'a', { style: 'dashed' }), link('k6', 'b', { style: 'dashed' })],
        flows: [flow(['k6', 'd'], { kind: 'write', rate: 0.8 }), flow(['k6', 'a'], { kind: 'write', rate: 0.8 }), flow(['k6', 'b'], { kind: 'write', rate: 0.8 })],
        metrics: { servers: '4', moved: '—', max: '25%' },
      },
    },
    {
      short: 'Alternatives',
      kind: 'insight',
      title: 'Other ways to hash consistently',
      body: [
        '<b>Rendezvous hashing</b> (highest random weight): for each key, score every server with <code>hash(key, server)</code> and pick the highest. No ring, perfectly even, minimal movement — but O(N) per lookup, fine for tens of servers.',
        '<b>Jump consistent hash</b> maps a key to one of N numbered buckets with no memory at all, but only supports adding or removing the last bucket. Load balancers use variants like Maglev hashing for connection affinity.',
      ],
      concepts: [{ term: 'Rendezvous hashing', def: 'Assign each key to the server with the highest hash(key, server) score; minimal disruption without a ring.' }],
      scene: {
        nodes: [
          key('k9', 0, 'sand', { at: at(-7, 0), size: [1, 1], height: 16, tag: pill('key k9', 'key') }),
          ...(['a', 'b', 'c', 'd'] as const).map((id, i) =>
            box(id, 4 + i, -7 + i * 4.6, id.toUpperCase(), (['blue', 'orange', 'green', 'purple'] as const)[i]!, 'server', { size: [1.2, 1.2], height: 30, tag: pill(['0.31', '0.87 ✓', '0.12', '0.55'][i]!, 'hash', i === 1 ? 'good' : 'default') }),
          ),
        ],
        links: ['a', 'b', 'c', 'd'].map((id) => link('k9', id, { style: id === 'b' ? 'solid' : 'dashed' })),
        flows: [flow(['k9', 'b'], { rate: 1 })],
        metrics: { servers: '4', moved: '—', max: '25%' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Membership changes, minimal movement',
      body: [
        '<code>mod N</code> reshuffles nearly every key when N changes. A <b>hash ring</b> places servers and keys in the same space; a key belongs to the next server clockwise, so adding or removing a server moves only ~<b>1/N</b> of keys.',
        '<b>Virtual nodes</b> even out shares and spread failover; replicas go to the next distinct servers. Rendezvous and jump hashing are simpler alternatives when their constraints fit.',
      ],
      scene: {
        nodes: [hashRing({ tag: pill('~1/N moves', 'refresh', 'good') }), A(), B(), Cn(), D(), ...keys(base)],
        flows: owns({ k2: 'b', k4: 'c', k6: 'd', k8: 'a' }),
        metrics: { servers: '4', moved: '1/N', max: '≈ 1/N' },
      },
    },
  ],
};

export default lesson;
