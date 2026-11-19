import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill, you } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -13, -2, 14, 'customers', extra);
const gw = (extra: Partial<SceneNode> = {}) => box('gw', -6, -3, 'Gateway', 'orange', 'route', { size: [1.3, 1.3], height: 34, ...extra });
const checkout = (extra: Partial<SceneNode> = {}) => box('co', 0, -4, 'Checkout', 'blue', 'server', { size: [1.3, 1.3], height: 34, ...extra });
const pay = (extra: Partial<SceneNode> = {}) => box('pay', 6, -8, 'Payments', 'teal', 'dollar', { size: [1.2, 1.2], height: 32, ...extra });
const inv = (extra: Partial<SceneNode> = {}) => box('inv', 7, -1, 'Inventory', 'green', 'box', { size: [1.2, 1.2], height: 32, ...extra });
const invDb = (extra: Partial<SceneNode> = {}) => db('idb', 13, -3, 'Stock DB', extra);
const tele = (extra: Partial<SceneNode> = {}) =>
  box('tele', 1, 8, 'Telemetry', 'purple', 'activity', { size: [1.6, 1.6], height: 36, sub: 'metrics · logs · traces', ...extra });
const oncall = (extra: Partial<SceneNode> = {}) => you('oncall', -9, 9, { label: pill('on-call', 'user'), ...extra });

const svc = ['gw', 'co', 'pay', 'inv'];
const path = [link('users', 'gw'), link('gw', 'co'), link('co', 'pay', { arrow: 'both' }), link('co', 'inv', { arrow: 'both' }), link('inv', 'idb', { arrow: 'both' })];
const traffic = [flow(['users', 'gw', 'co'], { back: true, rate: 1.6 }), flow(['co', 'pay'], { back: true, rate: 1.2 }), flow(['co', 'inv', 'idb'], { back: true, rate: 1.2 })];
const emit = (rate = 0.6) => svc.map((s) => flow([s, 'tele'], { kind: 'write' as const, rate }));
const emitLinks = svc.map((s) => link(s, 'tele', { style: 'dashed', arrow: 'end' as const }));

const lesson: Lesson = {
  slug: 'observability',
  title: 'Observability',
  blurb: 'Metrics, logs and traces — and the SLOs that tell you which ones to look at — so “it’s slow” becomes a cause in minutes.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'detect', label: 'Time to detect', icon: 'bolt' },
    { key: 'resolve', label: 'Time to resolve', icon: 'timer' },
    { key: 'noise', label: 'Pages / week', icon: 'alert' },
    { key: 'budget', label: 'Error budget', icon: 'gauge' },
  ],
  goals: [
    { text: 'RED metrics and histograms', step: 2 },
    { text: 'Cardinality and what it costs', step: 3 },
    { text: 'Structured logs and distributed traces', step: 5 },
    { text: 'SLIs, SLOs and error budgets', step: 7 },
    { text: 'Alerting on symptoms with burn rates', step: 8 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  steps: [
    {
      short: 'Blind',
      kind: 'problem',
      title: '“Checkout is slow” — but where?',
      body: [
        'Customers complain that checkout sometimes takes 8 seconds. The dashboards show CPU and memory per host, all green. There are four services involved and each team says theirs is fine.',
        'Host metrics tell you whether machines are busy. They don’t tell you whether <b>users</b> are having a bad time, or which hop is responsible.',
      ],
      changes: [{ text: 'Detected by customers', tone: 'bad' }],
      scene: {
        nodes: [users({ tag: pill('“8 s checkouts!”', 'alert', 'bad') }), gw({ tag: pill('CPU 30%', 'cpu') }), checkout({ tag: pill('CPU 35%', 'cpu') }), pay({ tag: pill('CPU 20%', 'cpu') }), inv({ tag: pill('CPU 40%', 'cpu') }), invDb(), oncall({ tag: pill('??', 'search', 'warn') })],
        links: path,
        flows: [...traffic.slice(0, 2), flow(['co', 'inv', 'idb'], { kind: 'heavy', back: true, rate: 0.6, speed: 0.3 })],
        metrics: { detect: { v: '3 h (tickets)', tone: 'bad' }, resolve: { v: '—', tone: 'bad' }, noise: '—', budget: '—' },
      },
    },
    {
      short: 'Metrics',
      kind: 'technique',
      title: 'Metrics: rate, errors, duration',
      body: [
        'Every service emits the same three request metrics — <b>RED</b>: <b>R</b>ate (requests/s), <b>E</b>rrors (failed/s), <b>D</b>uration (as a <b>histogram</b>, so you can read any percentile). For resources like pools and disks, use <b>USE</b>: utilisation, saturation, errors.',
        'Metrics are cheap numbers aggregated over time: ideal for dashboards and alerts. The checkout p99 chart instantly shows the problem began at 14:05 and affects about 2% of requests.',
      ],
      changes: [{ text: 'RED per service', tone: 'good' }, { text: 'p99 jumped at 14:05', tone: 'good' }],
      concepts: [
        { term: 'RED method', def: 'Monitor every service’s request Rate, Errors and Duration.' },
        { term: 'Histogram metric', def: 'Counts of observations in latency buckets, allowing percentiles to be computed and aggregated.' },
      ],
      scene: {
        nodes: [users(), gw({ tag: pill('p99 9 ms', 'timer') }), checkout({ tag: pill('p99 7.9 s', 'timer', 'bad') }), pay({ tag: pill('p99 220 ms', 'timer') }), inv({ tag: pill('p99 7.6 s', 'timer', 'bad') }), invDb(), tele(), oncall()],
        links: [...path, ...emitLinks],
        flows: [...traffic, ...emit()],
        metrics: { detect: '—', resolve: '—', noise: '—', budget: '—' },
      },
    },
    {
      short: 'Cardinality',
      kind: 'case',
      title: 'Case: one label that bankrupts the metrics bill',
      body: [
        'To debug, someone adds <code>customer_id</code> as a label on the latency histogram. Each unique combination of labels is a separate time series: 2 million customers × 12 buckets × 40 endpoints is close to a <b>billion</b> series. The metrics backend runs out of memory and dashboards go blank mid-incident.',
        'Keep metric labels to bounded sets — endpoint, status class, region. Per-user and per-request detail belongs in logs and traces, which are built for high cardinality.',
      ],
      note: { kind: 'warn', text: 'Before adding a label, multiply out the number of distinct values. If the answer has more than a few thousand, it isn’t a metric label.' },
      changes: [{ text: '+customer_id label → ~1B series', tone: 'bad' }],
      concepts: [{ term: 'Cardinality', def: 'The number of distinct time series a metric produces, i.e. the product of its labels’ distinct values.' }],
      scene: {
        nodes: [users(), gw(), checkout({ tag: pill('label: customer_id', 'hash', 'bad') }), pay(), inv(), invDb(), tele({ state: 'hot', load: 100, tag: pill('OOM: 1B series', 'alert', 'bad') }), oncall()],
        links: [...path, ...emitLinks],
        flows: [...traffic, ...emit(2)],
        metrics: { detect: '—', resolve: '—', noise: '—', budget: '—' },
      },
    },
    {
      short: 'Logs',
      kind: 'technique',
      title: 'Structured logs with a request ID',
      body: [
        'Logs record individual events. Write them as <b>structured</b> JSON — <code>{"level":"warn","msg":"stock lock wait","request_id":"7f3a…","sku":"L-204","wait_ms":7320}</code> — so they can be filtered and aggregated instead of grepped.',
        'The gateway assigns every request an ID and every service logs it. Search for one slow request’s ID and see its whole story across services. Logs are rich but costly at volume: sample noisy debug logs, keep warnings and errors.',
      ],
      changes: [{ text: 'JSON logs + request_id', tone: 'good' }],
      concepts: [{ term: 'Structured logging', def: 'Emitting logs as key-value records (e.g. JSON) rather than free text, so they can be queried.' }],
      scene: {
        nodes: [users(), gw({ tag: pill('request_id: 7f3a', 'hash', 'accent') }), checkout(), pay(), inv({ tag: pill('“stock lock wait 7,320 ms”', 'file', 'warn') }), invDb(), tele(), oncall()],
        links: [...path, ...emitLinks],
        flows: [...traffic, ...emit()],
        metrics: { detect: '—', resolve: '—', noise: '—', budget: '—' },
      },
    },
    {
      short: 'Traces',
      kind: 'technique',
      title: 'Traces: the request’s whole journey',
      body: [
        'A <b>distributed trace</b> follows one request across services. The gateway starts a trace ID; each service records <b>spans</b> — start time, duration, attributes — and passes the context on in headers (the W3C <code>traceparent</code> standard). The result is a waterfall.',
        'The slow checkout trace shows Payments at 180 ms and Inventory at 7.4 s — of which 7.3 s is a single <code>SELECT … FOR UPDATE</code> waiting on a row lock. Cause found.',
      ],
      changes: [{ text: 'Waterfall: Inventory lock wait 7.3 s', tone: 'good' }],
      concepts: [
        { term: 'Distributed tracing', def: 'Recording timed spans for each step of a request across services, linked by a shared trace ID.' },
        { term: 'Span', def: 'One timed operation within a trace, with a parent, attributes and duration.' },
      ],
      scene: {
        nodes: [users(), gw({ tag: pill('span 7.9 s', 'activity') }), checkout({ tag: pill('span 7.8 s', 'activity') }), pay({ tag: pill('span 180 ms', 'activity', 'good') }), inv({ tag: pill('span 7.4 s', 'activity', 'bad') }), invDb({ tag: pill('lock wait 7.3 s', 'lock', 'bad') }), tele(), oncall({ tag: pill('found it', 'check', 'good') })],
        links: [...path, ...emitLinks],
        flows: [...traffic.slice(0, 2), flow(['co', 'inv', 'idb'], { kind: 'heavy', back: true, rate: 0.6, speed: 0.3 }), ...emit()],
        metrics: { detect: '—', resolve: { v: '25 min', tone: 'good' }, noise: '—', budget: '—' },
      },
    },
    {
      short: 'Sampling',
      kind: 'tradeoff',
      title: 'You can’t keep every trace',
      body: [
        'At 20,000 requests a second, storing every span is expensive. <b>Head sampling</b> decides at the start (keep 1%) — cheap, but the one slow request you need is probably dropped. <b>Tail sampling</b> buffers whole traces briefly and decides at the end: keep all errors, all slow ones, and a small random share of the rest.',
        'Tail sampling costs a collector tier with memory, but it keeps exactly the traces you will actually look at.',
      ],
      concepts: [
        { term: 'Head-based sampling', def: 'Deciding whether to record a trace when it starts, before knowing how it turns out.' },
        { term: 'Tail-based sampling', def: 'Deciding after a trace completes, so errors and slow requests can always be kept.' },
      ],
      scene: {
        nodes: [users(), gw(), checkout(), pay(), inv(), invDb(), tele({ name: 'Collector', tag: pill('keep: errors, > 1 s, 1% rest', 'filter', 'good') }), oncall()],
        links: [...path, ...emitLinks],
        flows: [...traffic, ...emit(1.5)],
        metrics: { detect: '—', resolve: '25 min', noise: '—', budget: '—' },
      },
    },
    {
      short: 'SLOs',
      kind: 'technique',
      title: 'Define “good” with SLOs',
      body: [
        'Choose a <b>service level indicator</b> that reflects user happiness — “checkouts that succeed in under 2 s” divided by all checkouts — and a <b>service level objective</b> for it: 99.5% over 28 days.',
        'The remaining 0.5% is the <b>error budget</b>: about 3.4 hours’ worth of bad checkouts a month. While budget remains, ship features; when it’s burning fast, slow down and fix reliability. It turns an argument into a number.',
      ],
      changes: [{ text: 'SLO: 99.5% < 2 s, 28 days', tone: 'good' }, { text: 'Budget left: 61%', tone: 'good' }],
      concepts: [
        { term: 'SLI', def: 'Service Level Indicator: a measured ratio of good events to total events.' },
        { term: 'SLO', def: 'Service Level Objective: a target for an SLI over a time window.' },
        { term: 'Error budget', def: 'The amount of unreliability an SLO allows (1 − target), spent by incidents and risky changes.' },
      ],
      scene: {
        nodes: [users({ tag: pill('good = OK and < 2 s', 'check') }), gw(), checkout({ tag: pill('SLO 99.5%', 'gauge', 'good') }), pay(), inv(), invDb(), tele(), oncall()],
        links: [...path, ...emitLinks],
        flows: [...traffic, ...emit()],
        metrics: { detect: '—', resolve: '—', noise: '—', budget: { v: '61% left', tone: 'good' } },
      },
    },
    {
      short: 'Alerting',
      kind: 'technique',
      title: 'Page on symptoms, by burn rate',
      body: [
        'The old alerts fired on CPU > 80% — 40 pages a week, almost none mattering, and silence during the real incident. Replace them with alerts on the SLO: page when the error budget is burning fast enough to run out soon (say, 14× normal over an hour), open a ticket for slow burns.',
        'Symptoms users feel get a human out of bed; causes like CPU and queue depth go on dashboards for diagnosis.',
      ],
      note: { kind: 'key', text: 'Every page should be urgent, actionable and user-affecting. If on-call routinely ignores an alert, delete it.' },
      changes: [{ text: 'Pages 40/week → 2/week', tone: 'good' }, { text: 'Detect: 3 h → 4 min', tone: 'good' }],
      concepts: [{ term: 'Burn rate', def: 'How fast the error budget is being consumed relative to the rate that would exactly exhaust it by the end of the window.' }],
      scene: {
        nodes: [users(), gw(), checkout({ state: 'hot' }), pay(), inv({ state: 'hot' }), invDb(), tele({ tag: pill('burn rate 14× → page', 'bolt', 'warn') }), oncall({ tag: pill('paged in 4 min', 'bolt', 'good') })],
        links: [...path, ...emitLinks, link('tele', 'oncall', { label: pill('page') })],
        flows: [...traffic, ...emit(), flow(['tele', 'oncall'], { kind: 'heavy', rate: 0.5 })],
        metrics: { detect: { v: '4 min', tone: 'good' }, resolve: '—', noise: { v: '2', tone: 'good' }, budget: { v: '55% left', tone: 'warn' } },
      },
    },
    {
      short: 'Incident',
      kind: 'case',
      title: 'Case: from page to cause in 18 minutes',
      body: [
        '14:06 burn-rate page. 14:08 RED dashboard: checkout p99 up, errors flat, only checkout and inventory affected. 14:11 exemplar trace from the p99 bucket shows inventory lock waits. 14:15 logs filtered by that trace ID show every slow request touches SKU L-204 — a flash-sale item whose stock row every checkout locks.',
        '14:24 mitigation: reserve stock with an atomic decrement instead of a long-held row lock. Metrics told you <i>that</i>, traces told you <i>where</i>, logs told you <i>why</i>.',
      ],
      changes: [{ text: 'Root cause: hot row lock on L-204', tone: 'good' }, { text: 'Resolved in 18 min', tone: 'good' }],
      scene: {
        nodes: [users(), gw(), checkout(), pay(), inv({ tag: pill('atomic decrement ✓', 'check', 'good') }), invDb({ tag: pill('L-204 no longer locked', 'lock', 'good') }), tele(), oncall({ tag: pill('resolved', 'check', 'good') })],
        links: [...path, ...emitLinks],
        flows: [...traffic, ...emit()],
        metrics: { detect: '4 min', resolve: { v: '18 min', tone: 'good' }, noise: '2', budget: '54% left' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Know when users hurt, and why',
      body: [
        '<b>Metrics</b> (RED/USE, histograms, bounded labels) show trends and fire alerts. <b>Logs</b> (structured, with request IDs) explain individual events. <b>Traces</b> (spans, propagated context, tail sampling) show where time goes across services.',
        'Tie it together with <b>SLOs and error budgets</b>, and page on fast <b>burn rates</b> — symptoms users feel — rather than on every busy CPU.',
      ],
      scene: {
        nodes: [users(), gw(), checkout(), pay(), inv(), invDb(), tele({ tag: pill('metrics → traces → logs', 'activity', 'good') }), oncall()],
        links: [...path, ...emitLinks],
        flows: [...traffic, ...emit()],
        metrics: { detect: '4 min', resolve: '18 min', noise: '2', budget: '54% left' },
      },
    },
  ],
};

export default lesson;
