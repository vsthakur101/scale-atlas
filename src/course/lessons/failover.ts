import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill, zone } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -13, 1, 16, '2M users', extra);
const lb = (extra: Partial<SceneNode> = {}) => box('lb', -6, 0, 'Load', 'orange', 'route', { size: [1.4, 1.4], height: 38, sub: 'balancer', ...extra });
const app = (id: string, r: number, d: number, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, 'App', 'blue', 'server', { size: [1.3, 1.3], height: 34, ...extra });
const dbn = (id: string, r: number, d: number, name: string, extra: Partial<SceneNode> = {}) => db(id, r, d, name, extra);

// two availability zones
const zA = zone('za', 3, -5, 7, 5.5, 'zone a', 'blue');
const zB = zone('zb', 5, 5, 7, 5.5, 'zone b', 'green');
const twoZones = (o: { a?: Partial<SceneNode>; b?: Partial<SceneNode>; pdb?: Partial<SceneNode>; sdb?: Partial<SceneNode> } = {}) => [
  zA,
  zB,
  // a zone-wide tag is shown once per zone, on its first server
  app('a1', 1, -6, o.a),
  app('a2', 4, -3.5, { ...o.a, tag: undefined }),
  app('b1', 3, 4, o.b),
  app('b2', 6, 6.5, { ...o.b, tag: undefined }),
  dbn('pdb', 9, -5, 'Primary', { tone: 'orange', ...o.pdb }),
  dbn('sdb', 11, 4, 'Standby', o.sdb),
];
const zoneLinks = [link('users', 'lb'), link('lb', 'a1'), link('lb', 'a2'), link('lb', 'b1'), link('lb', 'b2'), link('a2', 'pdb', { arrow: 'both' }), link('b2', 'pdb', { arrow: 'both' }), link('pdb', 'sdb', { label: pill('replication') })];
const zoneFlows = [flow(['users', 'lb', 'a1'], { back: true, rate: 1 }), flow(['users', 'lb', 'a2'], { back: true, rate: 1 }), flow(['users', 'lb', 'b1'], { back: true, rate: 1 }), flow(['users', 'lb', 'b2'], { back: true, rate: 1 }), flow(['pdb', 'sdb'], { kind: 'write', rate: 1 })];

const lesson: Lesson = {
  slug: 'failover',
  title: 'Redundancy & Failover',
  blurb: 'Availability is arithmetic: how serial parts multiply risk, how spares cancel it, and how to switch over without making things worse.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'avail', label: 'Availability', icon: 'heart' },
    { key: 'down', label: 'Downtime / yr', icon: 'clock' },
    { key: 'rto', label: 'RTO', icon: 'timer' },
    { key: 'rpo', label: 'RPO', icon: 'db' },
  ],
  goals: [
    { text: 'How availability multiplies along a request path', step: 1 },
    { text: 'How redundancy adds nines', step: 2 },
    { text: 'Failure domains and zones', step: 3 },
    { text: 'Headroom for losing a whole zone', step: 5 },
    { text: 'RTO, RPO and hidden single points of failure', step: 9 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  steps: [
    {
      short: 'In series',
      kind: 'insight',
      title: 'Every hop in the chain multiplies risk',
      body: [
        'A request passes a load balancer, an app server and a database — each available 99.9% of the time. All three must work, so overall availability is the <b>product</b>: <code>0.999³ ≈ 99.7%</code>. That’s about 26 hours of downtime a year instead of 9.',
        'Every component you add in series makes the whole less available than its weakest part.',
      ],
      note: { kind: 'key', text: '99.9% ≈ 8.8 h/yr down. 99.99% ≈ 53 min/yr. 99.999% ≈ 5 min/yr. Each extra nine is roughly 10× harder.' },
      concepts: [{ term: 'Availability', def: 'The fraction of time a system is able to serve requests, often written in “nines”.' }],
      scene: {
        nodes: [users(), lb({ tag: pill('99.9%') }), app('a1', 1, 0, { tag: pill('99.9%') }), dbn('pdb', 8, 0, 'Database', { tag: pill('99.9%') })],
        links: [link('users', 'lb'), link('lb', 'a1'), link('a1', 'pdb', { arrow: 'both' })],
        flows: [flow(['users', 'lb', 'a1', 'pdb'], { back: true, rate: 1.4 })],
        metrics: { avail: { v: '99.7%', tone: 'warn' }, down: { v: '26 h', tone: 'bad' }, rto: '—', rpo: '—' },
      },
    },
    {
      short: 'In parallel',
      kind: 'technique',
      title: 'Spares in parallel add nines',
      body: [
        'Run two of each and the system works if <i>either</i> copy works: unavailability multiplies instead. Two independent 99.9% app servers give <code>1 − 0.001² = 99.9999%</code> for that tier.',
        'The key word is <b>independent</b>. Redundancy only helps against failures that don’t hit both copies at once — and the real world is full of shared causes.',
      ],
      changes: [{ text: '×2 at every tier', tone: 'good' }, { text: 'Availability → ~99.99%', tone: 'good' }],
      concepts: [{ term: 'Redundancy', def: 'Extra components that can take over when one fails, so a single failure doesn’t cause an outage.' }],
      scene: {
        nodes: [users(), lb(), app('a1', 1, -4), app('a2', 2, 4), dbn('pdb', 8, -3, 'Primary', { tone: 'orange' }), dbn('sdb', 9, 5, 'Standby')],
        links: [link('users', 'lb'), link('lb', 'a1'), link('lb', 'a2'), link('a1', 'pdb', { arrow: 'both' }), link('a2', 'pdb', { arrow: 'both' }), link('pdb', 'sdb')],
        flows: [flow(['users', 'lb', 'a1'], { back: true, rate: 1.2 }), flow(['users', 'lb', 'a2'], { back: true, rate: 1.2 }), flow(['pdb', 'sdb'], { kind: 'write', rate: 1 })],
        metrics: { avail: { v: '99.99%', tone: 'good' }, down: '53 min', rto: '—', rpo: '—' },
      },
    },
    {
      short: 'Domains',
      kind: 'problem',
      title: 'Two copies, one power supply',
      body: [
        'All the “redundant” servers turn out to live in one data-centre zone. A cooling failure takes the zone offline and every copy dies together. On paper: 99.99%. In practice: a four-hour outage.',
        'Spread copies across <b>failure domains</b> — separate racks, power, network and, in the cloud, separate <b>availability zones</b> a few kilometres apart with independent facilities.',
      ],
      changes: [{ text: 'Zone failure took every copy', tone: 'bad' }],
      concepts: [
        { term: 'Failure domain', def: 'A set of components that can fail together from one cause (rack, power, zone, region).' },
        { term: 'Availability zone', def: 'An isolated data-centre location within a cloud region, with independent power, cooling and networking.' },
      ],
      scene: {
        nodes: [users(), lb(), zone('za', 4, 0, 9, 9, 'zone a — cooling failure', 'red'), app('a1', 1, -4, { state: 'down' }), app('a2', 2, 4, { state: 'down' }), dbn('pdb', 7, -3, 'Primary', { state: 'down' }), dbn('sdb', 8, 4, 'Standby', { state: 'down' })],
        links: [link('users', 'lb'), link('lb', 'a1', { style: 'broken' }), link('lb', 'a2', { style: 'broken' })],
        flows: [flow(['users', 'lb'], { kind: 'fail', rate: 3 })],
        metrics: { avail: { v: '0% (4 h)', tone: 'bad' }, down: { v: '4 h', tone: 'bad' }, rto: '—', rpo: '—' },
      },
    },
    {
      short: 'Zones',
      kind: 'technique',
      title: 'Spread across zones',
      body: [
        'Now the app servers are split across zone A and zone B, the database primary in A replicates to a standby in B, and the load balancer itself is a multi-zone service.',
        'Zones are close enough (a millisecond or two) for synchronous replication and transparent load balancing, and far enough apart that one building’s problems don’t reach the other.',
      ],
      changes: [{ text: 'Apps 2 + 2 across zones', tone: 'good' }, { text: 'DB standby in zone B', tone: 'good' }],
      scene: {
        nodes: [users(), lb({ tag: pill('multi-zone', 'shield', 'good') }), ...twoZones({ a: { load: 45 }, b: { load: 45 } })],
        links: zoneLinks,
        flows: zoneFlows,
        metrics: { avail: { v: '99.99%', tone: 'good' }, down: '53 min', rto: '—', rpo: '—' },
      },
    },
    {
      short: 'Headroom',
      kind: 'case',
      title: 'Case: the surviving zone falls over too',
      body: [
        'To save money, each zone runs hot at 75% CPU. Zone A fails; its traffic shifts to zone B, which now needs 150% of its capacity. Zone B saturates, health checks time out, and the balancer pulls its servers too. A one-zone failure became a full outage.',
        'Redundancy needs <b>headroom</b>: with two zones, each must be able to carry everything, so neither should run above ~50%. With three zones, each must absorb half of another’s load — about 66%. Autoscaling helps only if it reacts faster than the cascade.',
      ],
      note: { kind: 'warn', text: 'Spare capacity is the price of redundancy. A “redundant” system running every copy at 80% has no redundancy at all.' },
      changes: [{ text: 'Zone A lost', tone: 'bad' }, { text: 'Zone B → 150% → collapses', tone: 'bad' }],
      concepts: [{ term: 'Cascading failure', def: 'A failure that overloads the remaining components, causing them to fail in turn.' }],
      scene: {
        nodes: [users(), lb(), ...twoZones({ a: { state: 'down' }, b: { load: 100, state: 'hot', tag: pill('150% demand', 'alert', 'bad') }, pdb: { state: 'down' } })],
        links: [link('users', 'lb'), link('lb', 'a1', { style: 'broken' }), link('lb', 'a2', { style: 'broken' }), link('lb', 'b1'), link('lb', 'b2')],
        flows: [flow(['users', 'lb', 'b1'], { back: true, rate: 3, speed: 0.5 }), flow(['users', 'lb', 'b2'], { back: true, rate: 3, speed: 0.5 }), flow(['users', 'lb'], { kind: 'fail', rate: 2 })],
        metrics: { avail: { v: 'collapsing', tone: 'bad' }, down: '—', rto: '—', rpo: '—' },
      },
    },
    {
      short: 'Active-active',
      kind: 'tradeoff',
      title: 'Active-passive or active-active',
      body: [
        '<b>Active-passive</b>: the standby sits idle, receiving replicated data, and takes over on failure. Simple and clean for databases — but the standby is untested until the day you need it, and promotion takes time.',
        '<b>Active-active</b>: every copy serves traffic all the time, so failover is just “send traffic elsewhere”, and you know every copy works because it’s in use. Natural for stateless tiers; hard for writable data, where it means multi-leader conflicts.',
      ],
      concepts: [
        { term: 'Active-passive', def: 'One copy serves while another waits on standby to take over.' },
        { term: 'Active-active', def: 'All copies serve traffic simultaneously; losing one shifts load to the rest.' },
      ],
      scene: {
        nodes: [users(), lb(), ...twoZones({ a: { load: 48, tag: pill('active') }, b: { load: 48, tag: pill('active') }, pdb: { tag: pill('active', 'pin') }, sdb: { tag: pill('passive', 'clock') } })],
        links: zoneLinks,
        flows: zoneFlows,
        metrics: { avail: '99.99%', down: '53 min', rto: 'app: s · DB: ~30 s', rpo: '—' },
      },
    },
    {
      short: 'RTO / RPO',
      kind: 'technique',
      title: 'Two numbers for every failover plan',
      body: [
        '<b>RTO</b> (recovery time objective): how long until service is back. Detecting failure takes timeouts and several failed health checks; promoting a database and repointing clients takes more. Here: about 40 seconds.',
        '<b>RPO</b> (recovery point objective): how much recent data you can afford to lose. Asynchronous replication can lose the last second or so of writes; synchronous replication to the other zone makes it zero at a latency cost.',
      ],
      changes: [{ text: 'Primary lost → standby promoted', tone: 'good' }, { text: 'RTO 40 s · RPO 0 (sync)', tone: 'good' }],
      concepts: [
        { term: 'RTO', def: 'Recovery Time Objective: the maximum acceptable time to restore service after a failure.' },
        { term: 'RPO', def: 'Recovery Point Objective: the maximum acceptable amount of data loss, measured in time.' },
      ],
      scene: {
        nodes: [users(), lb(), ...twoZones({ a: { load: 48 }, b: { load: 48 }, pdb: { state: 'down', tag: pill('lost', 'alert', 'bad') }, sdb: { tone: 'orange', name: 'Primary', tag: pill('promoted in 40 s', 'check', 'good') } })],
        links: [link('users', 'lb'), link('lb', 'a1'), link('lb', 'a2'), link('lb', 'b1'), link('lb', 'b2'), link('a2', 'sdb', { arrow: 'both' }), link('b2', 'sdb', { arrow: 'both' })],
        flows: [flow(['users', 'lb', 'b2', 'sdb'], { back: true, rate: 1 }), flow(['users', 'lb', 'a2', 'sdb'], { back: true, rate: 1 })],
        metrics: { avail: '99.99%', down: '53 min', rto: { v: '40 s', tone: 'good' }, rpo: { v: '0 (sync)', tone: 'good' } },
      },
    },
    {
      short: 'Regions',
      kind: 'tradeoff',
      title: 'When a whole region goes',
      body: [
        'Zones share a region’s control plane, network backbone and, sometimes, its bad day. Surviving a regional outage means a second region hundreds of kilometres away — too far for synchronous replication, so writes replicate asynchronously and RPO is seconds.',
        'Failover usually happens at DNS or a global load balancer, and it’s a business decision as much as a technical one: cost doubles, data may be lost, and the plan only works if you <b>rehearse it</b> regularly.',
      ],
      note: { kind: 'tip', text: 'Untested failover is a hope, not a plan. Schedule game days that actually fail over production — first a zone, later a region.' },
      scene: {
        nodes: [
          users(),
          box('dns', -6, 0, 'Global DNS', 'yellow', 'globe', { size: [1.4, 1.4], height: 36, tag: pill('health-checked', 'heart') }),
          zone('r1', 2, -5, 6, 5, 'eu-west', 'blue'),
          zone('r2', 4, 6, 6, 5, 'eu-central (standby)', 'green'),
          app('a1', 2, -5, { load: 50 }),
          app('b1', 4, 6, { state: 'ghost' }),
          dbn('pdb', 9, -4, 'Primary', { tone: 'orange' }),
          dbn('sdb', 11, 6, 'Replica'),
        ],
        links: [link('users', 'dns'), link('dns', 'a1'), link('dns', 'b1', { style: 'dashed' }), link('a1', 'pdb', { arrow: 'both' }), link('pdb', 'sdb', { label: pill('async · ~1 s lag', 'clock', 'warn') })],
        flows: [flow(['users', 'dns', 'a1', 'pdb'], { back: true, rate: 1.4 }), flow(['pdb', 'sdb'], { kind: 'write', rate: 1, speed: 0.5 })],
        metrics: { avail: '99.995%', down: '26 min', rto: '~15 min', rpo: { v: '~1 s', tone: 'warn' } },
      },
    },
    {
      short: 'Hidden SPOF',
      kind: 'case',
      title: 'Case: the single point nobody drew',
      body: [
        'Everything is redundant across zones — yet the site goes down at midnight. The TLS certificate expired. Another time: every service reads config from one small key-value cluster in one zone. Another: deploys all go to every zone at once, so a bad release breaks them all together.',
        'Single points of failure hide in shared dependencies: DNS, certificates, config, identity providers, CI pipelines, and the deploy process itself. Roll out zone by zone, automate renewals, and ask of every dependency “what if this is gone?”.',
      ],
      changes: [{ text: 'Cert expired → all zones down', tone: 'bad' }],
      scene: {
        nodes: [users(), lb({ state: 'hot', tag: pill('cert expired 00:00', 'lock', 'bad') }), ...twoZones({ a: { load: 5 }, b: { load: 5 } })],
        links: [link('users', 'lb', { style: 'broken' }), ...zoneLinks.slice(1)],
        flows: [flow(['users', 'lb'], { kind: 'fail', rate: 3 })],
        metrics: { avail: { v: '0%', tone: 'bad' }, down: '—', rto: 'manual', rpo: '0' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Independent spares, real headroom, rehearsed switches',
      body: [
        'Components in series multiply availability down; independent copies in parallel multiply unavailability down. Put copies in separate <b>failure domains</b>, keep enough <b>headroom</b> to lose one, and know your <b>RTO</b> and <b>RPO</b>.',
        'Prefer active-active where you can, rehearse failover where you can’t, and hunt the shared dependencies that make “redundant” systems fail all at once.',
      ],
      scene: {
        nodes: [users(), lb({ tag: pill('multi-zone', 'shield', 'good') }), ...twoZones({ a: { load: 45 }, b: { load: 45 } })],
        links: zoneLinks,
        flows: zoneFlows,
        metrics: { avail: '99.99%', down: '53 min', rto: '40 s', rpo: '0' },
      },
    },
  ],
};

export default lesson;
