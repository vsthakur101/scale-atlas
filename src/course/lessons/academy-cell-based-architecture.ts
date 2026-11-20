import type { Lesson, SceneNode, Tone } from '../../types';
import { box, crowd, db, flow, link, pill, zone } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -14, 0, 20, 'customers', extra);
const router = (extra: Partial<SceneNode> = {}) => box('router', -7, 0, 'Cell router', 'orange', 'route', { size: [1.4, 1.4], height: 36, ...extra });

type CellState = 'ok' | 'down' | 'canary';
const cell = (i: number, n: number, state: CellState = 'ok', extra: Partial<SceneNode> = {}): SceneNode[] => {
  const d = (i - (n - 1) / 2) * 5.2;
  const tone: Tone = state === 'down' ? 'red' : state === 'canary' ? 'yellow' : 'blue';
  return [
    zone(`z${i}`, 6, d, 9, 4.4, `cell ${i + 1}`, tone),
    box(`a${i}`, 3.6, d, 'App', tone, 'server', { size: [1.1, 1.1], height: 28, state: state === 'down' ? 'down' : 'ok', ...extra }),
    db(`d${i}`, 8.6, d, 'DB', { size: [1.1, 1.1], height: 30, state: state === 'down' ? 'down' : 'ok' }),
  ];
};
const cells = (n: number, over: Record<number, CellState> = {}, tags: Record<number, Partial<SceneNode>> = {}) =>
  Array.from({ length: n }, (_, i) => cell(i, n, over[i] ?? 'ok', tags[i])).flat();
const toCells = (n: number) => Array.from({ length: n }, (_, i) => link('router', `a${i}`, { arrow: 'end' }));
const inside = (n: number) => Array.from({ length: n }, (_, i) => link(`a${i}`, `d${i}`, { arrow: 'both' }));
const trafficTo = (ids: number[], rate = 1.2) => ids.map((i) => flow(['router', `a${i}`, `d${i}`], { back: true, rate }));

const pctFmt = (x: number): string => `${x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2)}%`;
const availFmt = (minutes: number): string => `${(100 * (1 - minutes / 525_600)).toFixed(3)}%`;

const lesson: Lesson = {
  slug: 'academy-cell-based-architecture',
  title: 'Cell Architecture: Isolating Blast Radius with Independent Cells',
  blurb: 'Run many small, independent copies of your whole stack and give each customer exactly one — so any failure, bad deploy or noisy neighbour hurts only a slice of users.',
  minutes: 12,
  level: 'Advanced',
  metrics: [
    { key: 'cells', label: 'Cells', icon: 'layers' },
    { key: 'blast', label: 'Blast radius', icon: 'alert' },
    { key: 'avail', label: 'Customer availability', icon: 'heart' },
    { key: 'cost', label: 'Extra cost', icon: 'dollar' },
  ],
  goals: [
    { text: 'Why a shared stack fails for everyone at once', step: 1 },
    { text: 'What a cell is, and how customers map to one', step: 2 },
    { text: 'Calculating blast radius and availability', step: 3 },
    { text: 'Deploying one cell at a time', step: 5 },
    { text: 'The cost of small cells, and shuffle sharding', step: 6 },
  ],
  legend: ['request', 'response', 'fail', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'users', label: 'Customers', min: 1, max: 500, step: 1, default: 50, unit: ' M', description: 'Total customers, in millions.' },
      { key: 'cap', label: 'Cell capacity', min: 100, max: 20_000, step: 100, default: 2_000, unit: 'k users', description: 'Customers per cell — the size you load-test to.' },
      { key: 'incidents', label: 'Incidents per year', min: 1, max: 30, step: 1, default: 6, unit: '', description: 'Outages from deploys, bugs, dependencies.' },
      { key: 'minutes', label: 'Incident length', min: 5, max: 240, step: 5, default: 45, unit: ' min', description: 'Average minutes to detect and recover.' },
      { key: 'scoped', label: 'Contained by a cell', min: 0, max: 100, step: 5, default: 80, unit: '%', description: 'Share of incidents confined to one cell (the rest hit shared dependencies).' },
      { key: 'fixed', label: 'Fixed cost per cell', min: 0, max: 20, step: 1, default: 3, unit: ' units', description: 'Always-on overhead per cell, in units where 100k customers cost 1 unit of variable capacity.' },
    ],
    calculate: (input, step) => {
      const users = (input.users ?? 50) * 1e6;
      const cap = (input.cap ?? 2_000) * 1e3;
      const incidents = input.incidents ?? 6;
      const minutes = input.minutes ?? 45;
      const scoped = (input.scoped ?? 80) / 100;
      const fixed = input.fixed ?? 3;
      const cellsN = step < 2 ? 1 : Math.max(1, Math.ceil(users / cap));
      const downMinutes = incidents * minutes;
      // a contained incident affects 1/C of customers; the rest affect everyone
      const share = cellsN === 1 ? 1 : scoped / cellsN + (1 - scoped);
      const effective = downMinutes * share;
      const overhead = ((cellsN === 1 ? 1 : cellsN) * fixed) / (users / 1e5);
      return {
        cells: { v: cellsN === 1 ? '1 (shared)' : String(cellsN) },
        blast: { v: pctFmt(100 / cellsN), tone: cellsN === 1 ? 'bad' : 100 / cellsN <= 5 ? 'good' : 'warn' },
        avail: { v: availFmt(effective), tone: effective < 100 ? 'good' : effective < 200 ? 'warn' : 'bad' },
        cost: { v: step < 2 ? '0%' : `+${pctFmt(overhead * 100)}`, tone: overhead > 0.5 ? 'bad' : overhead > 0.2 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Shared',
      kind: 'problem',
      title: 'One shared stack, one shared fate',
      body: [
        'A SaaS product serves every customer from one big pool of servers and one database cluster. That’s efficient — and it means every failure is global. A bad deploy, a poison request that crashes workers, a runaway customer, a failed database failover: any of them takes <b>100%</b> of customers down together.',
        'The usual reliability tools (redundancy, autoscaling) protect against hardware failures, but they don’t stop a defect from being everywhere at once.',
      ],
      changes: [{ text: 'Blast radius of any incident: 100%', tone: 'bad' }],
      scene: {
        nodes: [users(), box('big', 0, 0, 'Shared stack', 'blue', 'server', { size: [2.4, 2.4], height: 54, load: 70, state: 'hot', tag: pill('bad deploy → everyone down', 'alert', 'bad') }), db('bigdb', 8, 0, 'Database', { size: [1.5, 1.5] })],
        links: [link('users', 'big'), link('big', 'bigdb', { arrow: 'both' })],
        flows: [flow(['users', 'big'], { kind: 'fail', rate: 3 })],
      },
    },
    {
      short: 'The cell',
      kind: 'technique',
      title: 'Many small, complete copies of the stack',
      body: [
        'A <b>cell</b> is a full, self-contained instance of the service — its own app servers, queues, caches and database — sized to a fixed capacity. You run many identical cells, and each customer is <b>assigned to exactly one</b>.',
        'Cells share nothing on the request path: no common database, no cross-cell calls. A thin <b>router</b> in front sends each request to the customer’s cell. To grow, you add cells; you don’t make them bigger.',
      ],
      changes: [{ text: '4 identical cells, customers partitioned across them' }],
      concepts: [
        { term: 'Cell', def: 'A complete, isolated copy of a service stack that serves a fixed subset of customers.' },
        { term: 'Cell router', def: 'A thin layer that maps each customer to their cell and forwards requests.' },
      ],
      scene: {
        nodes: [users(), router({ tag: pill('customer → cell', 'route') }), ...cells(4)],
        links: [link('users', 'router'), ...toCells(4), ...inside(4)],
        flows: [flow(['users', 'router'], { rate: 3 }), ...trafficTo([0, 1, 2, 3])],
      },
    },
    {
      short: 'Blast radius',
      kind: 'insight',
      title: 'A failure now costs 1 ÷ C of your customers',
      body: [
        'If one cell fails — bad config, a poison request, a database problem — only the customers in it are affected: <code>blast radius = 1 ÷ C</code>. With 25 cells that is 4%; the other 96% never notice.',
        'Average availability improves accordingly. The slider model: 6 incidents a year of 45 minutes is 270 minutes down for a shared stack (99.95%). If 80% of incidents are contained to a cell, the average customer sees <code>270 × (0.8 ÷ 25 + 0.2) ≈ 63</code> minutes — about 99.99%. The 20% that hit shared dependencies now dominate, which tells you where to work next.',
      ],
      note: { kind: 'key', text: 'Cells don’t prevent failures. They bound how many customers each failure can reach.' },
      changes: [{ text: '25 cells → 4% blast radius', tone: 'good' }, { text: '270 → ~63 min/year per customer', tone: 'good' }],
      concepts: [{ term: 'Blast radius', def: 'The fraction of users or traffic affected by a single failure.' }],
      scene: {
        nodes: [users(), router(), ...cells(4, { 2: 'down' }, { 2: { tag: pill('failed — 25% of users in this sketch', 'alert', 'bad') } })],
        links: [link('users', 'router'), ...toCells(4), ...inside(4)],
        flows: [flow(['users', 'router'], { rate: 3 }), ...trafficTo([0, 1, 3]), flow(['router', 'a2'], { kind: 'fail', rate: 1 })],
      },
    },
    {
      short: 'The router',
      kind: 'technique',
      title: 'The router must be the simplest, most reliable part',
      body: [
        'Every request passes the router, so it must fail less often than anything behind it. Keep it tiny and stateless: it looks up <code>customer → cell</code> (a small mapping table cached at the edge, or a hash with an override table) and forwards. No business logic, no per-request database call.',
        'Separate <b>control plane</b> from <b>data plane</b>: the mapping is edited slowly by a control service, while the data path keeps running on its cached copy if the control plane is down. Moving a customer between cells is a deliberate, tested migration — not something that happens during a request.',
      ],
      changes: [{ text: 'Routing: cached mapping table, no logic', tone: 'good' }, { text: 'Control plane down → data plane keeps routing', tone: 'good' }],
      scene: {
        nodes: [users(), router({ tag: pill('cust 8812 → cell 3', 'key', 'good') }), box('ctl', -7, -8, 'Control plane', 'yellow', 'list', { size: [1.3, 1.3], height: 30, tag: pill('edits mapping', 'refresh') }), ...cells(3)],
        links: [link('users', 'router'), link('ctl', 'router', { style: 'dashed', label: pill('push mapping') }), ...toCells(3), ...inside(3)],
        flows: [flow(['users', 'router'], { rate: 3 }), ...trafficTo([0, 1, 2]), flow(['ctl', 'router'], { kind: 'handshake', rate: 0.3 })],
      },
    },
    {
      short: 'Deploys',
      kind: 'technique',
      title: 'Roll out one cell at a time',
      body: [
        'Cells turn every deployment into a staged rollout for free. Ship to a <b>canary cell</b> first — ideally one of low-risk or internal customers — watch error rates and latency, then proceed cell by cell, pausing at the first sign of trouble.',
        'A defect that would once have taken everything down now reaches 1 ÷ C of customers before you stop it, and the other cells still run the previous version. Configuration changes, schema migrations and dependency upgrades get the same treatment.',
      ],
      changes: [{ text: 'v2 on cell 1 only', tone: 'good' }, { text: 'Halt on first alarm → 4% exposed, not 100%', tone: 'good' }],
      scene: {
        nodes: [users(), router(), ...cells(4, { 0: 'canary' }, { 0: { tag: pill('v2 · canary', 'activity', 'warn') }, 1: { tag: pill('v1') }, 2: { tag: pill('v1') }, 3: { tag: pill('v1') } })],
        links: [link('users', 'router'), ...toCells(4), ...inside(4)],
        flows: [flow(['users', 'router'], { rate: 3 }), ...trafficTo([0, 1, 2, 3])],
      },
    },
    {
      short: 'Sizing',
      kind: 'tradeoff',
      title: 'Small cells contain more — and cost more',
      body: [
        'Cell size is the key dial. <b>Smaller cells</b> shrink the blast radius and are cheap to load-test at their maximum, but each carries fixed overhead (minimum instances, monitoring, a database that can’t shrink below a floor). <b>Larger cells</b> are cheaper per customer but approach the shared-stack problem again.',
        'Try the sliders: 50 million customers at 2 million per cell is 25 cells, a 4% blast radius, and about 15% extra cost at 3 fixed units per cell. At 100,000 per cell it is 500 cells and a 0.2% blast radius — but several times the cost. Pick the size where the marginal blast-radius gain stops being worth the overhead.',
      ],
      changes: [{ text: '2M/cell → 25 cells, +15% cost', tone: 'good' }, { text: '100k/cell → 500 cells, cost explodes', tone: 'bad' }],
      scene: {
        nodes: [users(), router({ tag: pill('size cells to a load-tested cap', 'gauge') }), ...cells(4, {}, { 0: { load: 70 }, 1: { load: 68 }, 2: { load: 72 }, 3: { load: 66 } })],
        links: [link('users', 'router'), ...toCells(4), ...inside(4)],
        flows: [flow(['users', 'router'], { rate: 3 }), ...trafficTo([0, 1, 2, 3], 0.9)],
      },
    },
    {
      short: 'Shuffle shards',
      kind: 'insight',
      title: 'Shuffle sharding: smaller than a cell',
      body: [
        'A cell is a fixed group of customers. <b>Shuffle sharding</b> gives each customer a small random <i>subset</i> of workers instead. With 100 workers and 5 per customer there are <code>C(100,5) = 75,287,520</code> distinct subsets; a customer that sends a poison request knocks out only its own 5 workers, and the chance another customer shares <i>all</i> of them is about 1 in 75 million.',
        'It composes with cells: cells bound large-scale failures, shuffle sharding bounds the damage from any single noisy or malicious customer inside a cell. AWS describes this technique in Route 53, among other services.',
      ],
      concepts: [{ term: 'Shuffle sharding', def: 'Assigning each customer a random small subset of workers so two customers rarely share the same set.' }],
      scene: {
        nodes: [
          users(),
          router({ tag: pill('C(100, 5) = 75M subsets', 'hash') }),
          ...[0, 1, 2, 3, 4, 5].map((i) => box(`w${i}`, 6, (i - 2.5) * 3.4, `worker ${i + 1}`, i === 1 || i === 4 ? 'red' : 'blue', 'server', { size: [1, 1], height: 24, state: i === 1 || i === 4 ? 'down' : 'ok' })),
        ],
        links: [link('users', 'router'), ...[0, 2, 3, 5].map((i) => link('router', `w${i}`, { arrow: 'end' }))],
        flows: [flow(['users', 'router'], { rate: 3 }), ...[0, 2, 3, 5].map((i) => flow(['router', `w${i}`], { back: true, rate: 1 }))],
      },
    },
    {
      short: 'Limits',
      kind: 'case',
      title: 'What cells make harder',
      body: [
        '<b>Cross-customer features</b> — global search, admin consoles, analytics, “show me all customers” — can’t read one cell, so they need a separate aggregation path (events streamed from every cell into a data platform). <b>Hot customers</b> bigger than a cell need special handling. <b>Migration</b>: moving a customer between cells, or splitting a cell, requires careful data movement.',
        'Also: cells must stay independent. A “harmless” shortcut — one cell calling another, or all cells sharing a cache or queue — recreates the shared fate you were removing. Treat the shared pieces that remain (the router, identity, billing) as the new critical path and give them the most scrutiny.',
      ],
      changes: [{ text: 'Cross-cell queries need an aggregation path', tone: 'bad' }, { text: 'No cell-to-cell calls on the request path', tone: 'good' }],
      scene: {
        nodes: [users(), router(), ...cells(3), box('agg', 14, 12, 'Analytics', 'teal', 'activity', { size: [1.3, 1.3], height: 30, tag: pill('events from every cell', 'bolt') })],
        links: [link('users', 'router'), ...toCells(3), ...inside(3), ...[0, 1, 2].map((i) => link(`d${i}`, 'agg', { style: 'dashed' }))],
        flows: [flow(['users', 'router'], { rate: 3 }), ...trafficTo([0, 1, 2]), ...[0, 1, 2].map((i) => flow([`d${i}`, 'agg'], { kind: 'write', rate: 0.5 }))],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Bound the damage',
      body: [
        'A <b>cell-based architecture</b> runs many identical, isolated stacks and gives each customer one. Blast radius becomes <code>1 ÷ C</code>; deployments roll out cell by cell; a thin, stateless <b>router</b> is the only shared request-path component and must be the most reliable thing you run.',
        'Size cells to a load-tested cap, weigh smaller blast radius against fixed overhead, add <b>shuffle sharding</b> inside cells for noisy neighbours, and plan for cross-cell queries and customer migration up front.',
      ],
      scene: {
        nodes: [users(), router(), ...cells(4)],
        links: [link('users', 'router'), ...toCells(4), ...inside(4)],
        flows: [flow(['users', 'router'], { rate: 3 }), ...trafficTo([0, 1, 2, 3])],
      },
    },
  ],
};

export default lesson;
