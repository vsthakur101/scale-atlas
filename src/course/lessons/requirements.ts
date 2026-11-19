import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const patients = (extra: Partial<SceneNode> = {}) => crowd('users', -13, 1, 16, 'patients', extra);
const lb = (extra: Partial<SceneNode> = {}) => box('lb', -7, 0, 'LB', 'orange', 'route', { size: [1.2, 1.2], height: 32, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', -1, 0, 'Booking API', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('db', 7, 0, 'Bookings DB', extra);
const replica = (extra: Partial<SceneNode> = {}) => db('rep', 7, 8, 'Read replica', { tone: 'grey', ...extra });
const cache = (extra: Partial<SceneNode> = {}) => box('cache', 2, -8, 'Slot cache', 'green', 'bolt', { size: [1.2, 1.2], height: 30, ...extra });
const queue = (extra: Partial<SceneNode> = {}) => box('q', 12, -6, 'Queue', 'yellow', 'queue', { size: [1.6, 1], height: 24, ...extra });
const notify = (extra: Partial<SceneNode> = {}) => box('notif', 16, 0, 'Reminders', 'teal', 'clock', { size: [1.2, 1.2], height: 30, ...extra });
const doc = (id: string, r: number, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, 'sand', 'doc', { size: [1.5, 1.1], height: 14, ...extra });

const hld = (over: Partial<Record<'api' | 'db' | 'cache' | 'rep' | 'q', Partial<SceneNode>>> = {}) => [
  patients(),
  lb(),
  api(over.api),
  store(over.db),
  replica(over.rep),
  cache(over.cache),
  queue(over.q),
  notify(),
];
const hldLinks = [
  link('users', 'lb'),
  link('lb', 'api'),
  link('api', 'db', { arrow: 'both', label: pill('writes') }),
  link('api', 'rep', { arrow: 'both', label: pill('search') }),
  link('api', 'cache', { arrow: 'both' }),
  link('db', 'q', { style: 'dashed' }),
  link('q', 'notif'),
];

const lesson: Lesson = {
  slug: 'requirements',
  title: 'From Requirements to Design',
  blurb: 'A repeatable way to design a system from a blank page: clarify, estimate, sketch, then dig into the parts that can break.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'rps', label: 'Peak req/s', icon: 'activity' },
    { key: 'storage', label: 'Storage / yr', icon: 'disk' },
    { key: 'p95', label: 'Search p95', icon: 'timer' },
    { key: 'double', label: 'Double bookings', icon: 'alert' },
  ],
  goals: [
    { text: 'Separating functional from non-functional requirements', step: 2 },
    { text: 'Estimating load before drawing boxes', step: 3 },
    { text: 'Sketching APIs and a data model', step: 5 },
    { text: 'A high-level design that serves the requirements', step: 6 },
    { text: 'Deep dives on correctness and hot spots', step: 8 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  steps: [
    {
      short: 'What',
      kind: 'problem',
      title: '“Design an appointment booking system”',
      body: [
        'A brief this vague hides a dozen different systems. Before any boxes, pin down <b>what it must do</b>: patients search open slots by clinic, specialty and date; book and cancel; clinics publish schedules; patients get reminders the day before.',
        'Equally important is what’s <b>out of scope</b> for now — payments, video consultations, insurance checks. Writing those down prevents designing for features nobody asked for.',
      ],
      note: { kind: 'key', text: 'Design follows requirements. Most weak designs answer a question nobody asked because the real one was never clarified.' },
      concepts: [{ term: 'Functional requirements', def: 'What the system must do: the features and behaviours users rely on.' }],
      scene: {
        nodes: [patients(), doc('fr', -3, -3, 'search · book · cancel', { tag: pill('in scope', 'check', 'good') }), doc('oos', -3, 5, 'payments · video', { state: 'dim', tag: pill('out of scope', 'x') })],
        links: [link('users', 'fr', { style: 'dashed' })],
        metrics: { rps: '?', storage: '?', p95: '?', double: '?' },
      },
    },
    {
      short: 'How well',
      kind: 'technique',
      title: 'Non-functional requirements set the shape',
      body: [
        'Then ask <b>how well</b>: 8,000 clinics, 20 million patients, about 2 million bookings a day. Search should feel instant (p95 under 300 ms). Booking must be <b>strictly correct</b>: one slot, one patient, ever. Availability target 99.95%. Reminders can be minutes late; search results can be seconds stale.',
        'These qualities, not the features, decide the architecture — and they differ per operation. Search wants speed and tolerates staleness; booking wants correctness and tolerates a little latency.',
      ],
      changes: [{ text: 'Booking: strongly consistent', tone: 'good' }, { text: 'Search: fast, may be stale', tone: 'good' }],
      concepts: [{ term: 'Non-functional requirements', def: 'Qualities a system must have — scale, latency, availability, consistency, security, cost.' }],
      scene: {
        nodes: [patients(), doc('nfr1', -3, -4, 'search p95 < 300 ms', { tag: pill('speed', 'bolt') }), doc('nfr2', 2, 1, 'no double booking', { tag: pill('correctness', 'lock', 'good') }), doc('nfr3', -3, 6, '99.95% available', { tag: pill('uptime', 'heart') })],
        metrics: { rps: '?', storage: '?', p95: '< 300 ms', double: { v: 'must be 0', tone: 'good' } },
      },
    },
    {
      short: 'Estimate',
      kind: 'technique',
      title: 'Put numbers on it',
      body: [
        '2M bookings a day is ~25 writes/s on average. Patients search about 20 times per booking: 40M searches a day, ~500/s. Clinics release next week’s slots at 09:00 Monday and demand spikes 20×: plan for <b>10,000 searches/s</b> and <b>500 bookings/s</b> at peak.',
        'Storage: 2M bookings × ~1 KB × 365 ≈ <b>730 GB/year</b> plus slot data — comfortably one relational database with replicas. No need for exotic storage; good to know before choosing it.',
      ],
      changes: [{ text: 'Peak: 10k search/s, 500 book/s' }, { text: '~0.7 TB/yr: one DB is fine', tone: 'good' }],
      scene: {
        nodes: [patients({ tag: pill('9:00 Monday ×20', 'bolt', 'warn') }), doc('calc', -2, 0, '2M/day ÷ 10⁵ s × 20', { tag: pill('napkin', 'calc', 'accent') })],
        links: [link('users', 'calc', { style: 'dashed' })],
        flows: [flow(['users', 'calc'], { rate: 4 })],
        metrics: { rps: { v: '10.5k', tone: 'warn' }, storage: '0.7 TB', p95: '< 300 ms', double: 'must be 0' },
      },
    },
    {
      short: 'API',
      kind: 'technique',
      title: 'Sketch the API',
      body: [
        'A few endpoints cover the core: <code>GET /slots?clinic=&specialty=&date=</code> (search), <code>POST /bookings {slot_id}</code> with an idempotency key (book), <code>DELETE /bookings/{id}</code> (cancel), <code>PUT /clinics/{id}/schedule</code> (publish).',
        'Writing them down exposes questions early: how is search paginated (cursor), what does a failed booking return (409 Conflict), who may cancel (the patient or the clinic).',
      ],
      scene: {
        nodes: [patients(), lb(), api({ tag: pill('GET /slots · POST /bookings', 'link') })],
        links: [link('users', 'lb'), link('lb', 'api')],
        flows: [flow(['users', 'lb', 'api'], { back: true, rate: 2 })],
        metrics: { rps: '10.5k', storage: '0.7 TB', p95: '< 300 ms', double: 'must be 0' },
      },
    },
    {
      short: 'Data model',
      kind: 'technique',
      title: 'Model the data around the invariant',
      body: [
        'Tables: <code>clinics</code>, <code>practitioners</code>, <code>slots(id, practitioner_id, starts_at, status)</code>, <code>bookings(id, slot_id, patient_id, created_at)</code>. The critical rule — one booking per slot — becomes a <b>unique constraint</b> on <code>bookings.slot_id</code> (for active bookings).',
        'Let the database enforce the invariant: no amount of application-level checking is as reliable under concurrency.',
      ],
      concepts: [{ term: 'Invariant', def: 'A condition that must always hold — here, at most one active booking per slot.' }],
      scene: {
        nodes: [patients(), lb(), api(), store({ tag: pill('UNIQUE (slot_id) WHERE active', 'lock', 'good') })],
        links: [link('users', 'lb'), link('lb', 'api'), link('api', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'lb', 'api', 'db'], { back: true, rate: 1.5 })],
        metrics: { rps: '10.5k', storage: '0.7 TB', p95: '< 300 ms', double: { v: 'DB-enforced', tone: 'good' } },
      },
    },
    {
      short: 'High level',
      kind: 'technique',
      title: 'The high-level design',
      body: [
        'Stateless API servers behind a load balancer. Bookings go to the <b>primary</b> database, where the constraint lives. Searches — 20× more frequent and allowed to be slightly stale — go to <b>read replicas</b> and a short-TTL <b>slot cache</b>. Each new booking emits an event onto a <b>queue</b>; a reminder worker schedules notifications.',
        'Every box traces back to a requirement: replicas and cache for search latency, the primary for correctness, the queue because reminders can lag.',
      ],
      changes: [{ text: 'Reads → cache + replicas', tone: 'good' }, { text: 'Writes → primary', tone: 'good' }],
      concepts: [{ term: 'High-level design', def: 'The major components, their responsibilities and the main data flows, before internal details.' }],
      scene: {
        nodes: hld(),
        links: hldLinks,
        flows: [flow(['users', 'lb', 'api', 'cache'], { kind: 'hit', back: true, rate: 2 }), flow(['api', 'rep'], { back: true, rate: 1 }), flow(['api', 'db'], { kind: 'write', rate: 0.6 }), flow(['db', 'q', 'notif'], { rate: 0.5 })],
        metrics: { rps: '10.5k', storage: '0.7 TB', p95: { v: '90 ms', tone: 'good' }, double: 'DB-enforced' },
      },
    },
    {
      short: 'Race',
      kind: 'case',
      title: 'Deep dive: two patients, one slot',
      body: [
        'At 09:00:00 two patients click the same 10:30 slot. Both saw it as free (the search data is seconds stale — by design). Both <code>POST /bookings</code>. The first insert succeeds; the second violates the unique constraint and gets <code>409 Conflict</code> with “this slot was just taken — here are the nearest alternatives”.',
        'Stale reads are fine because the <b>write</b> path re-checks against the source of truth. Idempotency keys make retries of the winning request safe.',
      ],
      changes: [{ text: '2 attempts → 1 booking, 1 × 409', tone: 'good' }],
      scene: {
        nodes: hld({ db: { tag: pill('unique violation → 409', 'lock', 'good') } }),
        links: hldLinks,
        flows: [flow(['users', 'lb', 'api', 'db'], { kind: 'write', back: true, rate: 0.8 }), flow(['api', 'db'], { kind: 'fail', rate: 0.6 })],
        metrics: { rps: '10.5k', storage: '0.7 TB', p95: '90 ms', double: { v: '0', tone: 'good' } },
      },
    },
    {
      short: 'Hot spot',
      kind: 'case',
      title: 'Deep dive: the 9:00 rush on one clinic',
      body: [
        'A popular paediatric clinic releases slots at 09:00 and 30,000 parents hit refresh. All searches target the same rows; all bookings contend on a few hundred slots. The cache absorbs searches (one key, refreshed every couple of seconds with coalescing), but booking still hammers one hot spot.',
        'Options: a virtual <b>waiting room</b> that admits users at a controlled rate, per-user <b>rate limits</b>, and <b>holding</b> a slot for 5 minutes during checkout (a short-lived reservation row) so users don’t fight at the final click.',
      ],
      changes: [{ text: 'Waiting room: admit 500/s', tone: 'good' }, { text: '5-min slot holds', tone: 'good' }],
      scene: {
        nodes: [patients({ count: 24, tag: pill('30k parents at 09:00', 'bolt', 'warn') }), lb({ tag: pill('waiting room', 'queue') }), api({ load: 70 }), store({ load: 65, tag: pill('holds expire 5 min', 'timer') }), replica(), cache({ tag: pill('clinic:81 — coalesced', 'bolt', 'good') }), queue(), notify()],
        links: hldLinks,
        flows: [flow(['users', 'lb'], { rate: 6 }), flow(['lb', 'api', 'cache'], { kind: 'hit', back: true, rate: 2.5 }), flow(['api', 'db'], { kind: 'write', rate: 1.2 })],
        metrics: { rps: { v: '10.5k (shaped)', tone: 'good' }, storage: '0.7 TB', p95: '140 ms', double: '0' },
      },
    },
    {
      short: 'Trade-offs',
      kind: 'tradeoff',
      title: 'Name the trade-offs and the next bottleneck',
      body: [
        'State what you chose and what it costs: search can show a slot that was taken seconds ago (accepted; booking re-checks); a single primary limits write scale (fine at 500/s, with headroom to shard by region later); reminders may be a few minutes late (accepted).',
        'Then the failure story: primary failover to a synchronous standby, replicas behind the cache, the queue buffering if the notification provider is down.',
      ],
      note: { kind: 'tip', text: 'A design is complete when you can say how it fails, what you’d monitor, and what you’d change at 10× the load — not when every box is drawn.' },
      scene: {
        nodes: hld({ db: { tag: pill('sync standby for failover', 'shield') }, rep: { tag: pill('seconds stale: OK', 'clock') }, q: { tag: pill('buffers provider outages', 'queue') } }),
        links: hldLinks,
        flows: [flow(['users', 'lb', 'api', 'cache'], { kind: 'hit', back: true, rate: 2 }), flow(['api', 'db'], { kind: 'write', rate: 0.6 }), flow(['db', 'q', 'notif'], { rate: 0.5 })],
        metrics: { rps: '10.5k', storage: '0.7 TB', p95: '90 ms', double: '0' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A method, not a diagram',
      body: [
        '<b>Clarify</b> functional scope and what’s out. Pin down <b>non-functional</b> needs per operation. <b>Estimate</b> load and storage. Sketch the <b>API</b> and <b>data model</b>, putting invariants where they can be enforced. Draw the <b>high-level design</b> so every component maps to a requirement.',
        'Then <b>deep-dive</b> into correctness under concurrency and hot spots, and close with trade-offs, failure modes and the next bottleneck. The next three lessons apply this method end to end.',
      ],
      scene: {
        nodes: hld({ api: { tag: pill('every box ← a requirement', 'check', 'good') } }),
        links: hldLinks,
        flows: [flow(['users', 'lb', 'api', 'cache'], { kind: 'hit', back: true, rate: 2 }), flow(['api', 'db'], { kind: 'write', rate: 0.6 }), flow(['db', 'q', 'notif'], { rate: 0.5 })],
        metrics: { rps: '10.5k', storage: '0.7 TB', p95: '90 ms', double: '0' },
      },
    },
  ],
};

export default lesson;
