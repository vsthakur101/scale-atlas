import type { Lesson, SceneNode, Tone } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -13, 1, 14, 'shoppers', extra);
const mono = (extra: Partial<SceneNode> = {}) =>
  box('mono', -3, 0, 'Monolith', 'blue', 'box', { size: [2.6, 2.6], height: 64, sub: 'catalog · cart · search · orders', ...extra });
const shared = (extra: Partial<SceneNode> = {}) => db('db', 6, 0, 'Shared DB', { size: [1.8, 1.8], ...extra });

const SVC: [string, string, Tone, number, number][] = [
  ['catalog', 'Catalog', 'green', 2, -8],
  ['search', 'Search', 'teal', 5, -3],
  ['cart', 'Cart', 'yellow', 5, 3],
  ['orders', 'Orders', 'purple', 2, 8],
];
const svc = (id: string, extra: Partial<SceneNode> = {}) => {
  const [, name, tone, r, d] = SVC.find(([k]) => k === id)!;
  return box(id, r, d, name, tone, 'server', { size: [1.3, 1.3], height: 34, ...extra });
};
const own = (id: string) => {
  const [, name, , r, d] = SVC.find(([k]) => k === id)!;
  return db(`${id}-db`, r + 6, d, `${name} DB`, { size: [1.1, 1.1], height: 34 });
};
const gateway = (extra: Partial<SceneNode> = {}) => box('gw', -5, 0, 'Gateway', 'orange', 'route', { size: [1.4, 1.4], height: 38, ...extra });
const ids = SVC.map(([k]) => k);

const lesson: Lesson = {
  slug: 'services',
  title: 'Monolith to Services',
  blurb: 'When one codebase starts slowing a growing organisation down — and what splitting it into services actually costs.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'deploys', label: 'Deploys / day', icon: 'refresh' },
    { key: 'lead', label: 'Lead time', icon: 'timer' },
    { key: 'blast', label: 'Blast radius', icon: 'alert' },
    { key: 'hops', label: 'Network hops', icon: 'share' },
  ],
  goals: [
    { text: 'Why a monolith is usually the right start', step: 1 },
    { text: 'Modular boundaries before network boundaries', step: 3 },
    { text: 'Extracting a service that owns its data', step: 5 },
    { text: 'What the network adds, and the distributed monolith', step: 7 },
    { text: 'Strangler migration and team ownership', step: 9 },
  ],
  legend: ['request', 'response', 'write', 'fail', 'heavy'],
  steps: [
    {
      short: 'Monolith',
      kind: 'insight',
      title: 'One app, one deploy — and that’s fine',
      body: [
        'A marketplace is a single application: catalog, search, cart and orders in one codebase, one process, one database. A function call is nanoseconds, a refactor across modules is one pull request, and a transaction can span everything.',
        'With a dozen engineers this is the fastest way to build. Most successful products started here, and many large ones still run a monolith at their core.',
      ],
      note: { kind: 'key', text: 'Microservices solve organisational scaling problems. If you don’t have those problems yet, you’re only buying their costs.' },
      scene: {
        nodes: [users(), mono({ load: 40 }), shared()],
        links: [link('users', 'mono'), link('mono', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'mono', 'db'], { back: true, rate: 2 })],
        metrics: { deploys: '6', lead: '1 day', blast: 'everything', hops: '1' },
      },
    },
    {
      short: 'Growing pains',
      kind: 'problem',
      title: 'Eighty engineers, one deploy queue',
      body: [
        'Three years later 80 engineers work in that codebase. Every release bundles everyone’s changes, so one failing test or risky migration holds everyone up; deploys drop to twice a week. A memory leak in search crashes checkout. Search needs 10× the CPU of anything else, but the only way to scale it is to scale the whole app.',
        'The friction isn’t the code — it’s that many teams share one unit of deployment, scaling and failure.',
      ],
      changes: [{ text: 'Deploys 6/day → 2/week', tone: 'bad' }, { text: 'Search leak crashes checkout', tone: 'bad' }],
      scene: {
        nodes: [users(), mono({ load: 92, state: 'hot', tag: pill('release train: 41 changes', 'alert', 'bad') }), shared({ load: 75 })],
        links: [link('users', 'mono'), link('mono', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'mono', 'db'], { back: true, rate: 3, speed: 0.7 }), flow(['users', 'mono'], { kind: 'fail', rate: 0.6 })],
        metrics: { deploys: { v: '0.3', tone: 'bad' }, lead: { v: '9 days', tone: 'bad' }, blast: { v: 'everything', tone: 'bad' }, hops: '1' },
      },
    },
    {
      short: 'Modular',
      kind: 'technique',
      title: 'First, draw the lines inside',
      body: [
        'Before touching the network, make the monolith <b>modular</b>: each area gets an explicit public interface, its own tables, and build-time rules that forbid reaching into another module’s internals.',
        'This is cheap, reversible, and reveals where the real boundaries are. Many teams stop here — a well-structured modular monolith, possibly with independent deploy pipelines per module, solves most of the coordination pain.',
      ],
      changes: [{ text: 'Module boundaries enforced in CI', tone: 'good' }],
      concepts: [{ term: 'Modular monolith', def: 'A single deployable with strictly enforced internal module boundaries and interfaces.' }],
      scene: {
        nodes: [users(), mono({ load: 60, tag: pill('4 modules, enforced APIs', 'layers', 'good') }), shared({ tag: pill('tables owned per module', 'sheet') })],
        links: [link('users', 'mono'), link('mono', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'mono', 'db'], { back: true, rate: 2.5 })],
        metrics: { deploys: '1', lead: '4 days', blast: 'everything', hops: '1' },
      },
    },
    {
      short: 'Extract',
      kind: 'technique',
      title: 'Extract the piece that needs independence',
      body: [
        'Search has the clearest case: different scaling (CPU-heavy), different release pace, a separate team, and a natural boundary (it reads catalog data and answers queries). It becomes its own service with its own deploy pipeline.',
        'Pick extractions by pressure, not by diagram: a component that needs to scale, deploy or fail independently. Search can now crash or roll back without touching checkout.',
      ],
      changes: [{ text: 'Search → own service', tone: 'good' }, { text: 'Search leak can’t crash checkout', tone: 'good' }],
      concepts: [{ term: 'Bounded context', def: 'A part of the domain with its own model and language, a natural candidate for a service boundary.' }],
      scene: {
        nodes: [users(), mono({ sub: 'catalog · cart · orders', load: 50 }), shared(), svc('search', { at: [2, -5] as [number, number], load: 70, tag: pill('deploys 12×/day', 'refresh', 'good') })],
        links: [link('users', 'mono'), link('mono', 'db', { arrow: 'both' }), link('mono', 'search', { arrow: 'both' }), link('search', 'db', { style: 'dashed', label: pill('still reads shared DB', 'alert', 'warn') })],
        flows: [flow(['users', 'mono', 'db'], { back: true, rate: 2 }), flow(['mono', 'search'], { back: true, rate: 1.5 })],
        metrics: { deploys: '12', lead: '1 day', blast: 'search only', hops: '2' },
      },
    },
    {
      short: 'Own data',
      kind: 'technique',
      title: 'Each service owns its data',
      body: [
        'Search still queries the shared database directly — so a column rename in catalog breaks search in production. Shared tables are a hidden, untyped API that nobody versioned.',
        'Give each service its own datastore that only it touches. Others get data through its API or by consuming its events (Search builds its index from <code>ProductChanged</code> events). Cross-service joins and transactions are gone; that’s the price of independence.',
      ],
      changes: [{ text: 'Database per service', tone: 'good' }, { text: 'No more cross-service joins', tone: 'bad' }],
      concepts: [{ term: 'Database per service', def: 'Each service exclusively owns its data store; other services access that data only via its interfaces.' }],
      scene: {
        nodes: [users(), gateway(), ...ids.map((i) => svc(i)), ...ids.map(own)],
        links: [link('users', 'gw'), ...ids.map((i) => link('gw', i)), ...ids.map((i) => link(i, `${i}-db`, { arrow: 'both' })), link('catalog', 'search', { style: 'dashed', label: pill('ProductChanged', 'bolt') })],
        flows: [flow(['users', 'gw'], { back: true, rate: 2 }), ...ids.map((i) => flow(['gw', i, `${i}-db`], { back: true, rate: 0.8 })), flow(['catalog', 'search'], { kind: 'write', rate: 0.6 })],
        metrics: { deploys: '30', lead: '4 h', blast: 'one service', hops: '2–3' },
      },
    },
    {
      short: 'The network',
      kind: 'tradeoff',
      title: 'Every arrow is now a network call',
      body: [
        'A function call that never failed is now a request that can be slow, time out, or half-succeed. You need timeouts, retries, idempotency, tracing, versioned APIs, service discovery, and on-call for each service — everything from the Reliability module, multiplied by the number of services.',
        'Latency adds up too: a page that made 30 in-process calls now pays 30 network hops unless you redesign for fewer, coarser calls.',
      ],
      note: { kind: 'warn', text: 'The first service you extract is the most expensive: it forces you to build deployment, observability and discovery infrastructure that the monolith never needed.' },
      scene: {
        nodes: [users(), gateway(), ...ids.map((i) => svc(i, i === 'cart' ? { tag: pill('timeout · retry · trace', 'shield') } : {})), ...ids.map(own)],
        links: [link('users', 'gw'), ...ids.map((i) => link('gw', i)), ...ids.map((i) => link(i, `${i}-db`, { arrow: 'both' })), link('cart', 'catalog', { arrow: 'both' }), link('orders', 'cart', { arrow: 'both' })],
        flows: [flow(['users', 'gw', 'orders', 'cart', 'catalog'], { back: true, rate: 1.2 }), flow(['orders', 'cart'], { kind: 'fail', rate: 0.3 })],
        metrics: { deploys: '30', lead: '4 h', blast: 'one service', hops: { v: '5', tone: 'warn' } },
      },
    },
    {
      short: 'Distributed monolith',
      kind: 'case',
      title: 'Case: all the costs, none of the benefits',
      body: [
        'Another team split their monolith into 25 services — by technical layer instead of by domain. Every feature touches six of them, so they must release together. A page load is a synchronous chain eight services deep; if any one is down, everything is.',
        'This is a <b>distributed monolith</b>: the coupling of a monolith with the failure modes of a distributed system. Signs: lock-step deploys, shared libraries that force upgrades, chatty synchronous chains.',
      ],
      concepts: [{ term: 'Distributed monolith', def: 'Services that are deployed separately but are so coupled they must change, deploy and fail together.' }],
      scene: {
        nodes: [users(), gateway(), ...ids.map((i) => svc(i, { state: i === 'cart' ? 'down' : 'hot' })), ...ids.map(own)],
        links: [link('users', 'gw'), link('gw', 'catalog'), link('catalog', 'search', { arrow: 'both' }), link('search', 'cart', { arrow: 'both', style: 'broken' }), link('cart', 'orders', { arrow: 'both' })],
        flows: [flow(['users', 'gw', 'catalog', 'search'], { back: true, rate: 1, speed: 0.6 }), flow(['search', 'cart'], { kind: 'fail', rate: 1 })],
        metrics: { deploys: { v: 'together', tone: 'bad' }, lead: { v: '2 weeks', tone: 'bad' }, blast: { v: 'everything', tone: 'bad' }, hops: { v: '8', tone: 'bad' } },
      },
    },
    {
      short: 'Strangler',
      kind: 'technique',
      title: 'Migrate gradually: the strangler fig',
      body: [
        'Don’t rewrite. Put a routing proxy in front of the monolith, then move one capability at a time: build the new service, send <code>/search/*</code> to it (first a percentage, then all), and delete the old code. Repeat.',
        'The monolith shrinks while the product keeps shipping. At any point you can stop — many teams end with a smaller monolith plus a few services where independence really pays.',
      ],
      changes: [{ text: '/search → new service (100%)', tone: 'good' }, { text: '/cart → 10% canary', tone: 'good' }],
      concepts: [{ term: 'Strangler fig pattern', def: 'Incrementally replacing parts of a legacy system by routing functionality to new components until the old one can be retired.' }],
      scene: {
        nodes: [users(), gateway({ tag: pill('/search → new · /cart 10%', 'route') }), mono({ at: [1.5, 4.5] as [number, number], size: [2, 2], height: 50, sub: 'shrinking', load: 40 }), svc('search'), svc('cart', { tag: pill('canary 10%', 'activity', 'warn') }), shared({ at: [7, 3] as [number, number] })],
        links: [link('users', 'gw'), link('gw', 'mono'), link('gw', 'search'), link('gw', 'cart', { style: 'dashed' }), link('mono', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'gw', 'mono'], { back: true, rate: 1.5 }), flow(['users', 'gw', 'search'], { back: true, rate: 1.2 }), flow(['users', 'gw', 'cart'], { back: true, rate: 0.3 })],
        metrics: { deploys: '14', lead: '1 day', blast: 'shrinking', hops: '2' },
      },
    },
    {
      short: 'Teams',
      kind: 'insight',
      title: 'Services mirror teams',
      body: [
        '<b>Conway’s law</b>: systems end up shaped like the communication structure of the organisation that builds them. Services work best when each is owned end-to-end by one team that can change, deploy and operate it without asking others.',
        'So design the team boundaries and the service boundaries together. A service owned by three teams — or a team that owns twelve services — is a warning sign either way.',
      ],
      concepts: [{ term: 'Conway’s law', def: 'Organisations design systems that mirror their own communication structures.' }],
      scene: {
        nodes: [users(), gateway(), ...ids.map((i, k) => svc(i, { tag: pill(['team Shelf', 'team Find', 'team Basket', 'team Pay'][k]!, 'users') })), ...ids.map(own)],
        links: [link('users', 'gw'), ...ids.map((i) => link('gw', i)), ...ids.map((i) => link(i, `${i}-db`, { arrow: 'both' }))],
        flows: [flow(['users', 'gw'], { back: true, rate: 2 }), ...ids.map((i) => flow(['gw', i], { back: true, rate: 0.8 }))],
        metrics: { deploys: '30', lead: '4 h', blast: 'one service', hops: '2–3' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Split for independence, not for fashion',
      body: [
        'Start with a monolith; make it <b>modular</b> as it grows. Extract a <b>service</b> when a part genuinely needs to deploy, scale or fail independently — and give it <b>its own data</b>.',
        'Pay for the network deliberately (timeouts, tracing, coarse APIs, async events), avoid the <b>distributed monolith</b>, migrate with the <b>strangler fig</b>, and align services with the teams that own them.',
      ],
      scene: {
        nodes: [users(), gateway(), ...ids.map((i) => svc(i)), ...ids.map(own)],
        links: [link('users', 'gw'), ...ids.map((i) => link('gw', i)), ...ids.map((i) => link(i, `${i}-db`, { arrow: 'both' })), link('catalog', 'search', { style: 'dashed' })],
        flows: [flow(['users', 'gw'], { back: true, rate: 2 }), ...ids.map((i) => flow(['gw', i, `${i}-db`], { back: true, rate: 0.8 }))],
        metrics: { deploys: '30', lead: '4 h', blast: 'one service', hops: '2–3' },
      },
    },
  ],
};

export default lesson;
