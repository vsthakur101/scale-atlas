import type { Lesson, Pill, SceneNode } from '../../types';
import { box, flow, link, pill, you } from '../kit';

const traveller = (extra: Partial<SceneNode> = {}) => you('you', -12, 1, { label: pill('traveller', 'user'), ...extra });
const trip = (extra: Partial<SceneNode> = {}) => box('trip', -4, 0, 'Trip', 'blue', 'route', { size: [1.5, 1.5], height: 42, sub: 'booking', ...extra });
const flight = (extra: Partial<SceneNode> = {}) => box('flight', 5, -7, 'Flights', 'teal', 'globe', { size: [1.3, 1.3], height: 34, ...extra });
const hotel = (extra: Partial<SceneNode> = {}) => box('hotel', 7, 0, 'Hotels', 'purple', 'box', { size: [1.3, 1.3], height: 34, ...extra });
const car = (extra: Partial<SceneNode> = {}) => box('car', 5, 7, 'Cars', 'yellow', 'pin', { size: [1.3, 1.3], height: 34, ...extra });
const bus = (extra: Partial<SceneNode> = {}) => box('bus', 12, 0, 'Events', 'yellow', 'bolt', { size: [1.3, 1.3], height: 32, ...extra });
const steps3 = ['flight', 'hotel', 'car'];
const tag = (t: string, ico: Pill['icon'], tone?: Pill['tone']) => ({ tag: pill(t, ico, tone) });

const lesson: Lesson = {
  slug: 'sagas',
  title: 'Sagas',
  blurb: 'Business transactions that span several services can’t use one database transaction. Sagas make them come out right anyway.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'state', label: 'Trip state', icon: 'list' },
    { key: 'charged', label: 'Customer charged', icon: 'dollar' },
    { key: 'held', label: 'Locks held', icon: 'lock' },
    { key: 'consistent', label: 'Consistent', icon: 'check' },
  ],
  goals: [
    { text: 'Why cross-service work can’t share a transaction', step: 1 },
    { text: 'Two-phase commit and why it’s rarely used', step: 2 },
    { text: 'Sagas: local steps with compensations', step: 4 },
    { text: 'Orchestration vs choreography', step: 6 },
    { text: 'Isolation gaps and compensations that fail', step: 8 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  steps: [
    {
      short: 'Half a trip',
      kind: 'problem',
      title: 'A flight, but no hotel',
      body: [
        'Booking a trip means reserving a flight, a hotel and a car — three services, each with its own database. The flight books, the hotel books, then the car service reports no availability.',
        'The customer is now paying for a flight and a hotel for a trip they can’t take. There’s no <code>ROLLBACK</code> that spans three independent databases.',
      ],
      changes: [{ text: 'Flight ✓ · Hotel ✓ · Car ✗', tone: 'bad' }],
      scene: {
        nodes: [traveller(), trip(), flight(tag('booked', 'check', 'good')), hotel(tag('booked', 'check', 'good')), car({ state: 'hot', ...tag('sold out', 'x', 'bad') })],
        links: [link('you', 'trip'), ...steps3.map((s) => link('trip', s, { arrow: 'both' }))],
        flows: [flow(['trip', 'flight'], { kind: 'write', back: true, rate: 0.8 }), flow(['trip', 'hotel'], { kind: 'write', back: true, rate: 0.8 }), flow(['trip', 'car'], { kind: 'fail', rate: 0.8 })],
        metrics: { state: { v: 'half-booked', tone: 'bad' }, charged: { v: '€1,240', tone: 'bad' }, held: '—', consistent: { v: 'no', tone: 'bad' } },
      },
    },
    {
      short: '2PC',
      kind: 'tradeoff',
      title: 'Two-phase commit: atomic, but blocking',
      body: [
        '<b>Two-phase commit</b> makes it atomic: a coordinator asks each participant to <b>prepare</b> (do the work, lock the rows, promise it can commit). If all say yes, it tells them to <b>commit</b>; otherwise, to abort.',
        'Between the phases every participant holds its locks. If the coordinator crashes there, participants can’t safely decide alone — they block, holding seats and rooms hostage. It also needs every system (including third-party APIs) to support the protocol. Across independent services it’s rarely an option.',
      ],
      concepts: [{ term: 'Two-phase commit (2PC)', def: 'A protocol where a coordinator first asks all participants to prepare, then tells them all to commit or abort.' }],
      scene: {
        nodes: [traveller(), trip({ name: 'Coordinator', ...tag('crashed after prepare', 'alert', 'bad'), state: 'hot' }), flight(tag('prepared · locked', 'lock', 'warn')), hotel(tag('prepared · locked', 'lock', 'warn')), car(tag('prepared · locked', 'lock', 'warn'))],
        links: [link('you', 'trip'), ...steps3.map((s) => link('trip', s, { arrow: 'both', style: 'dashed' }))],
        flows: steps3.map((s) => flow(['trip', s], { kind: 'handshake', back: true, rate: 0.6 })),
        metrics: { state: 'in doubt', charged: '—', held: { v: '3 · indefinitely', tone: 'bad' }, consistent: 'blocked' },
      },
    },
    {
      short: 'Saga',
      kind: 'technique',
      title: 'A saga: steps that can be undone',
      body: [
        'A <b>saga</b> splits the business transaction into a sequence of <b>local</b> transactions — book flight, book hotel, book car — each committed independently in its own service. For every step there’s a <b>compensating action</b> that semantically undoes it: cancel the flight, cancel the hotel.',
        'No locks span services and nothing blocks. The trade: the whole is only eventually consistent, and “undo” means a new action, not erasing history.',
      ],
      changes: [{ text: 'Each step + its compensation', tone: 'good' }],
      concepts: [
        { term: 'Saga', def: 'A sequence of local transactions where each has a compensating action to undo it if a later step fails.' },
        { term: 'Compensating transaction', def: 'An action that semantically reverses a previously committed step, e.g. a refund or cancellation.' },
      ],
      scene: {
        nodes: [traveller(), trip(tag('1 → 2 → 3', 'list')), flight(tag('book / cancel', 'refresh')), hotel(tag('book / cancel', 'refresh')), car(tag('rent / release', 'refresh'))],
        links: [link('you', 'trip'), ...steps3.map((s) => link('trip', s, { arrow: 'both' }))],
        flows: steps3.map((s) => flow(['trip', s], { kind: 'write', back: true, rate: 0.7 })),
        metrics: { state: 'booking', charged: '—', held: { v: 'none across services', tone: 'good' }, consistent: 'eventually' },
      },
    },
    {
      short: 'Compensate',
      kind: 'technique',
      title: 'Car fails: undo in reverse',
      body: [
        'The car step fails. The saga runs compensations for completed steps in reverse order: cancel the hotel, then cancel the flight, then refund the payment hold. The trip ends in a clean “failed” state and the customer is told why.',
        'For a few seconds the flight and hotel really were booked — other customers could have seen those seats as taken. That’s the visible cost of not holding locks.',
      ],
      changes: [{ text: 'Car ✗ → cancel hotel → cancel flight', tone: 'good' }, { text: 'Charge refunded', tone: 'good' }],
      scene: {
        nodes: [traveller(tag('“No cars — trip not booked”', 'alert', 'warn')), trip(tag('compensating', 'refresh', 'warn')), flight(tag('cancelled', 'x')), hotel(tag('cancelled', 'x')), car(tag('sold out', 'x', 'bad'))],
        links: [link('you', 'trip'), ...steps3.map((s) => link('trip', s, { arrow: 'both' }))],
        flows: [flow(['trip', 'car'], { kind: 'fail', rate: 0.5 }), flow(['trip', 'hotel'], { kind: 'write', rate: 0.6 }), flow(['trip', 'flight'], { kind: 'write', rate: 0.6 })],
        metrics: { state: 'failed (clean)', charged: { v: '€0', tone: 'good' }, held: 'none', consistent: { v: 'yes', tone: 'good' } },
      },
    },
    {
      short: 'Orchestrate',
      kind: 'technique',
      title: 'Orchestration: one place drives the steps',
      body: [
        'In an <b>orchestrated</b> saga, a coordinator (the Trip service, or a workflow engine such as Temporal or a cloud step-function service) holds the saga’s state machine: what’s done, what’s next, what to compensate. It calls each service and persists progress after every step, so it can resume after a crash.',
        'The flow is explicit and easy to follow, monitor and change. The orchestrator must be durable, and it’s a natural place for logic to pile up — keep domain rules inside the services.',
      ],
      concepts: [{ term: 'Orchestration', def: 'A central coordinator directs each participant and tracks the overall workflow state.' }],
      scene: {
        nodes: [traveller(), trip({ name: 'Orchestrator', ...tag('state: HOTEL_BOOKED (persisted)', 'list', 'good') }), flight(tag('done', 'check', 'good')), hotel(tag('done', 'check', 'good')), car(tag('next', 'arrowRight'))],
        links: [link('you', 'trip'), ...steps3.map((s) => link('trip', s, { arrow: 'both' }))],
        flows: [flow(['trip', 'car'], { kind: 'write', back: true, rate: 0.9 })],
        metrics: { state: 'step 3 of 3', charged: 'held', held: 'none', consistent: 'eventually' },
      },
    },
    {
      short: 'Choreograph',
      kind: 'tradeoff',
      title: 'Choreography: services react to events',
      body: [
        'In a <b>choreographed</b> saga there’s no conductor. Trip emits <code>TripRequested</code>; Flights books and emits <code>FlightBooked</code>; Hotels reacts to that and emits <code>HotelBooked</code>; on <code>CarUnavailable</code>, each service listens and compensates its own step.',
        'Fully decoupled and no central dependency — but the overall flow exists only implicitly across several codebases. Fine for two or three steps; past that, it becomes hard to answer “what state is trip 4417 in?”.',
      ],
      concepts: [{ term: 'Choreography', def: 'Participants coordinate by reacting to each other’s events, with no central controller.' }],
      scene: {
        nodes: [traveller(), trip(tag('emit TripRequested', 'bolt')), flight(), hotel(), car(), bus({ tag: pill('FlightBooked → HotelBooked → …', 'bolt') })],
        links: [link('you', 'trip'), link('trip', 'bus'), ...steps3.map((s) => link(s, 'bus', { arrow: 'both', style: 'dashed' }))],
        flows: [flow(['trip', 'bus'], { kind: 'write', rate: 0.6 }), ...steps3.map((s) => flow(['bus', s], { kind: 'write', back: true, rate: 0.6 }))],
        metrics: { state: 'implicit', charged: 'held', held: 'none', consistent: 'eventually' },
      },
    },
    {
      short: 'Isolation',
      kind: 'problem',
      title: 'Others can see the half-finished trip',
      body: [
        'Sagas have no isolation: each step commits for real. While the saga is midway, the last hotel room is booked — another customer is turned away — and two minutes later it’s released by a compensation.',
        'Mitigate with <b>semantic locks</b>: mark records <code>PENDING</code> and treat them specially (e.g. “held, may free up”); order steps so the most likely to fail goes first; and make the step that can’t be undone — charging the card — the last one, the <b>pivot</b>.',
      ],
      concepts: [{ term: 'Semantic lock', def: 'An application-level marker (like a PENDING status) indicating a record is part of an unfinished saga.' }],
      scene: {
        nodes: [traveller(), you('other', -12, 9, { label: pill('another customer', 'user'), tag: pill('“no rooms”', 'x', 'warn') }), trip(), flight(tag('PENDING', 'clock', 'warn')), hotel(tag('last room: PENDING', 'clock', 'warn')), car()],
        links: [link('you', 'trip'), link('other', 'hotel', { style: 'dashed' }), ...steps3.map((s) => link('trip', s, { arrow: 'both' }))],
        flows: [flow(['other', 'hotel'], { kind: 'fail', rate: 0.5 }), flow(['trip', 'car'], { kind: 'write', back: true, rate: 0.6 })],
        metrics: { state: 'in progress', charged: 'not yet (pivot last)', held: 'semantic', consistent: { v: 'visibly partial', tone: 'warn' } },
      },
    },
    {
      short: 'Can’t undo',
      kind: 'case',
      title: 'Case: the cancellation itself fails',
      body: [
        'The hotel’s cancellation API is down when the saga tries to compensate. You can’t just give up — the customer would be charged for a room. Compensations must be <b>retried until they succeed</b>, so they must be <b>idempotent</b>, and the saga’s state must survive restarts.',
        'Some actions can’t be truly undone: an email already sent, a non-refundable fare. Compensate with a counter-action (a correction email, a credit voucher), and route sagas that stay stuck past a deadline to a human.',
      ],
      changes: [{ text: 'Cancel hotel: retry ×6 over 40 min', tone: 'good' }, { text: 'Stuck > 1 h → support queue', tone: 'good' }],
      scene: {
        nodes: [traveller(), trip(tag('retrying compensation', 'refresh', 'warn')), flight(tag('cancelled', 'check', 'good')), hotel({ state: 'hot', ...tag('cancel API 503', 'alert', 'bad') }), car(tag('n/a', 'x')), box('ops', -4, 9, 'Support', 'red', 'user', { size: [1.2, 1.2], height: 30, tag: pill('escalate after 1 h', 'clock') })],
        links: [link('you', 'trip'), ...steps3.map((s) => link('trip', s, { arrow: 'both' })), link('trip', 'ops', { style: 'dashed' })],
        flows: [flow(['trip', 'hotel'], { kind: 'fail', rate: 0.6 })],
        metrics: { state: 'compensating', charged: { v: 'pending refund', tone: 'warn' }, held: 'none', consistent: { v: 'not yet', tone: 'warn' } },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Consistency through compensation',
      body: [
        'Services can’t share a database transaction, and <b>two-phase commit</b> blocks on failure. A <b>saga</b> runs local transactions in sequence and, on failure, runs <b>compensating actions</b> in reverse.',
        'Choose <b>orchestration</b> for explicit, observable workflows and <b>choreography</b> for short, loosely coupled ones. Design for the isolation gap (pending states, pivot last) and for compensations that must be retried, idempotent and, occasionally, handed to a human.',
      ],
      scene: {
        nodes: [traveller(tag('trip booked', 'check', 'good')), trip({ name: 'Orchestrator', ...tag('durable state machine', 'list', 'good') }), flight(tag('booked', 'check', 'good')), hotel(tag('booked', 'check', 'good')), car(tag('booked', 'check', 'good'))],
        links: [link('you', 'trip'), ...steps3.map((s) => link('trip', s, { arrow: 'both' }))],
        flows: steps3.map((s) => flow(['trip', s], { kind: 'write', back: true, rate: 0.6 })),
        metrics: { state: 'complete', charged: '€1,410', held: 'none', consistent: { v: 'yes', tone: 'good' } },
      },
    },
  ],
};

export default lesson;
