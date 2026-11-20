import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const svcs = (extra: Partial<SceneNode> = {}) => crowd('svcs', -18, 0, 12, 'services (instrumented)', extra);
const agent = (extra: Partial<SceneNode> = {}) => box('agent', -9, 0, 'Agent / collector (batch, sample, enrich)', 'purple', 'filter', { size: [1.6, 1.6], height: 28, ...extra });
const logs = (extra: Partial<SceneNode> = {}) => disk('logs', 3, -8, 'Log store (search index)', { size: [3, 1.2], height: 14, tone: 'yellow', icon: 'list', ...extra });
const tsdb = (extra: Partial<SceneNode> = {}) => db('tsdb', 3, 0, 'Metrics TSDB', { size: [1.5, 1.5], ...extra });
const traces = (extra: Partial<SceneNode> = {}) => disk('traces', 3, 8, 'Trace store', { size: [3, 1.2], height: 14, tone: 'yellow', ...extra });
const ui = (extra: Partial<SceneNode> = {}) => box('ui', 14, 0, 'Dashboards · alerts · on-call', 'green', 'activity', { size: [1.5, 1.5], height: 26, ...extra });

const fmtN = (n: number): string => (n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);
const fmtB = (b: number): string => (b >= 1e15 ? `${(b / 1e15).toFixed(1)} PB` : b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(0)} GB` : `${(b / 1e6).toFixed(0)} MB`);

const lesson: Lesson = {
  slug: 'source-logging-tracing-and-metrics',
  title: 'Logs, Metrics and Traces: Volume, Cardinality and Sampling',
  blurb: 'Three signals answer three different questions. The arithmetic that decides what you can afford: log bytes per day, time-series cardinality explosions, and why head sampling misses the rare failure you most want to see.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'logs', label: 'Log volume per day (retained)', icon: 'disk' },
    { key: 'series', label: 'Active metric time series', icon: 'activity' },
    { key: 'mem', label: 'TSDB memory for those series', icon: 'cpu' },
    { key: 'trace', label: 'Trace storage per day at the sample rate', icon: 'route' },
    { key: 'catch', label: 'Chance to keep ≥ 1 trace of a rare error', icon: 'search' },
  ],
  goals: [
    { text: 'Three signals, three questions', step: 1 },
    { text: 'Logs: structure, volume and cost', step: 2 },
    { text: 'Metrics: aggregation, percentiles, cardinality', step: 3 },
    { text: 'Traces: context propagation and sampling', step: 4 },
    { text: 'Correlating signals; push vs pull; alerting', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'rps', label: 'Requests per second', min: 100, max: 1000000, step: 100, default: 10000, unit: '/s', description: 'Entry-point traffic.' },
      { key: 'lines', label: 'Log lines per request (all services)', min: 1, max: 100, step: 1, default: 8, unit: '', description: 'Lines emitted while serving one request.' },
      { key: 'lb', label: 'Bytes per log line', min: 50, max: 2000, step: 10, default: 300, unit: ' B', description: 'Structured JSON line.' },
      { key: 'ret', label: 'Log retention', min: 1, max: 365, step: 1, default: 14, unit: ' days', description: 'How long logs are kept searchable.' },
      { key: 'svc', label: 'Services', min: 1, max: 2000, step: 1, default: 200, unit: '', description: 'Label values for service.' },
      { key: 'ep', label: 'Endpoints per service', min: 1, max: 500, step: 1, default: 30, unit: '', description: 'Route label values.' },
      { key: 'st', label: 'Status classes', min: 1, max: 50, step: 1, default: 8, unit: '', description: 'Distinct status label values.' },
      { key: 'me', label: 'HTTP methods', min: 1, max: 10, step: 1, default: 4, unit: '', description: 'Method label values.' },
      { key: 'extra', label: 'Extra high-cardinality label (e.g. user id)', min: 1, max: 10000000, step: 1, default: 1, unit: '', description: '1 = none; 1,000,000 = a per-user label.' },
      { key: 'sb', label: 'Memory per active series', min: 500, max: 10000, step: 100, default: 3000, unit: ' B', description: 'TSDB head memory per series.' },
      { key: 'spans', label: 'Spans per request', min: 1, max: 200, step: 1, default: 25, unit: '', description: 'Calls and operations traced.' },
      { key: 'spb', label: 'Bytes per span', min: 100, max: 5000, step: 50, default: 500, unit: ' B', description: 'Stored span size.' },
      { key: 'samp', label: 'Head-sampling rate', min: 0.01, max: 100, step: 0.01, default: 1, unit: '%', description: 'Share of traces kept, decided at the start.' },
      { key: 'errs', label: 'Occurrences of a rare error per day', min: 1, max: 100000, step: 1, default: 50, unit: '', description: 'Requests that hit the bug.' },
    ],
    calculate: (input, step) => {
      const rps = Math.max(1, input.rps ?? 1e4);
      const lines = Math.max(0, input.lines ?? 8);
      const lb = Math.max(1, input.lb ?? 300);
      const ret = Math.max(1, input.ret ?? 14);
      const series = Math.max(1, Math.round(input.svc ?? 200)) * Math.max(1, Math.round(input.ep ?? 30)) * Math.max(1, Math.round(input.st ?? 8)) * Math.max(1, Math.round(input.me ?? 4)) * Math.max(1, Math.round(input.extra ?? 1));
      const sb = Math.max(1, input.sb ?? 3000);
      const spans = Math.max(1, input.spans ?? 25);
      const spb = Math.max(1, input.spb ?? 500);
      const samp = Math.min(1, Math.max(0.0001, (input.samp ?? 1) / 100));
      const errs = Math.max(1, Math.round(input.errs ?? 50));
      const logDay = rps * 86400 * lines * lb;
      const traceDay = rps * spans * samp * spb * 86400;
      const catchP = 1 - Math.pow(1 - samp, errs);
      return {
        logs: step < 2 ? { v: '—' } : { v: `${fmtB(logDay)}/day → ${fmtB(logDay * ret)} for ${ret} days`, tone: logDay * ret < 1e14 ? 'good' : 'warn' },
        series: step < 3 ? { v: '—' } : { v: fmtN(series), tone: series < 1e6 ? 'good' : series < 1e8 ? 'warn' : 'bad' },
        mem: step < 3 ? { v: '—' } : { v: fmtB(series * sb), tone: series * sb < 3e10 ? 'good' : series * sb < 1e12 ? 'warn' : 'bad' },
        trace: step < 4 ? { v: '—' } : { v: `${fmtB(traceDay)}/day (${fmtN(rps * spans * samp)} spans/s kept)`, tone: traceDay < 5e11 ? 'good' : 'warn' },
        catch: step < 4 ? { v: '—' } : { v: `${(catchP * 100).toFixed(1)}% with head sampling · 100% with keep-all-errors`, tone: catchP > 0.95 ? 'good' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Signals',
      kind: 'insight',
      title: 'Three signals answer three different questions',
      body: [
        '<b>Metrics</b> are numbers aggregated over time — request rate, error ratio, p99 latency, queue depth. They are cheap, constant-size and ideal for <b>“is something wrong, and how much?”</b> — dashboards and alerts. <b>Logs</b> are timestamped records of discrete events — rich context, expensive, ideal for <b>“what exactly happened in this case?”</b>. <b>Traces</b> follow one request across services as a tree of timed <b>spans</b> — ideal for <b>“where did the time go, and which dependency failed?”</b> in a distributed system.',
        'Together they form <b>observability</b>: the ability to ask new questions of a running system without shipping new code (see the Observability lesson). The engineering problem is not collecting them but <b>affording</b> them: each signal has a different cost driver — logs scale with <i>events</i>, metrics with <i>distinct label combinations</i>, traces with <i>requests × spans × sample rate</i>. The numbers below use 10,000 requests/s across 200 services.',
      ],
      scene: { nodes: [svcs(), agent(), logs({ tag: pill('what happened?', 'list') }), tsdb({ tag: pill('is it wrong? how much?', 'activity') }), traces({ tag: pill('where did time go?', 'route') })], links: [link('svcs', 'agent'), link('agent', 'logs'), link('agent', 'tsdb'), link('agent', 'traces')], flows: [flow(['svcs', 'agent', 'tsdb'], { rate: 2 })] },
    },
    {
      short: 'Logs',
      kind: 'technique',
      title: 'Logs: structure them, then budget the bytes',
      body: [
        'Write <b>structured logs</b> (JSON or logfmt with fixed field names — <code>level</code>, <code>ts</code>, <code>service</code>, <code>trace_id</code>, <code>user_id</code>, <code>route</code>, <code>latency_ms</code>) instead of free text, so they can be filtered and aggregated without regex parsing. Use levels with discipline (ERROR must be actionable; DEBUG off in production or sampled), log at boundaries, include identifiers rather than payloads, and <b>never log secrets or personal data</b> (redact at the logger).',
        'The cost driver is volume: 10,000 req/s × 86,400 s × 8 lines × 300 B = <b>2.07 TB per day</b>, <b>29 TB</b> for 14 days of retention — and full-text indexing (Elasticsearch-style) multiplies storage by the index overhead. Controls: <b>sample</b> high-volume success lines (keep every error), <b>drop</b> noisy health-check logs at the agent, <b>tier</b> storage (hot searchable for days, cold object storage for months, via columnar formats), and set per-service budgets. A single verbose line in a hot path (10 extra lines) multiplies the bill; make log cost visible to the team that writes it.',
      ],
      changes: [{ text: '10k req/s × 8 lines × 300 B = 2.07 TB/day; 29 TB at 14 days', tone: 'info' }, { text: 'Structured fields, redact secrets, sample success, keep errors', tone: 'good' }, { text: 'Hot/cold tiers; per-service budgets', tone: 'good' }],
      scene: { nodes: [svcs({ tag: pill('JSON lines + trace_id', 'list') }), agent({ tag: pill('drop · sample · redact', 'filter', 'good') }), logs({ tag: pill('2.1 TB/day', 'disk', 'warn') })], links: [link('svcs', 'agent'), link('agent', 'logs')], flows: [flow(['svcs', 'agent', 'logs'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Metrics',
      kind: 'problem',
      title: 'Metrics: aggregate cheaply — and beware cardinality',
      body: [
        'A metric (<code>http_requests_total</code>, <code>request_duration_seconds</code>) plus a set of <b>labels</b> defines a <b>time series</b>, and the database stores one series for <i>every distinct label combination</i>. Series count is a <b>product</b>: 200 services × 30 endpoints × 8 statuses × 4 methods = <b>192,000 series</b> — about 576 MB of TSDB memory at 3 KB each, comfortable. Add one label with a million values (<code>user_id</code>, <code>request_id</code>, a raw URL with ids) and it becomes <b>192 billion</b> series: ~576 TB of memory, an instant outage of the metrics system. Labels must be <b>bounded and low-cardinality</b>; put high-cardinality detail in logs and traces.',
        'Pick metric types deliberately: <b>counters</b> (rates via <code>rate()</code>), <b>gauges</b> (queue depth), and <b>histograms</b> (bucketed latency, from which p50/p95/p99 are estimated and — unlike averages or pre-computed percentiles — can be <b>aggregated across instances</b>). Organise around <b>RED</b> (rate, errors, duration) for services and <b>USE</b> (utilisation, saturation, errors) for resources, and the four golden signals. <b>Pull</b> (Prometheus scrapes endpoints, discovering targets) makes target health obvious and avoids overload; <b>push</b> (agents or short-lived jobs send to a gateway/collector) suits batch jobs and firewalled networks.',
      ],
      changes: [{ text: '200 × 30 × 8 × 4 = 192,000 series ≈ 576 MB', tone: 'info' }, { text: '+ a 1M-value label = 192 billion series: outage', tone: 'bad' }, { text: 'Histograms aggregate; bounded labels only', tone: 'good' }],
      concepts: [{ term: 'Cardinality', def: 'The number of distinct label-value combinations of a metric; each combination is a separate stored time series.' }],
      scene: { nodes: [svcs({ tag: pill('labels: service, route, status', 'list') }), agent(), tsdb({ state: 'hot', tag: pill('192k series — fine', 'check', 'good') }), ui()], links: [link('svcs', 'agent'), link('agent', 'tsdb'), link('tsdb', 'ui')], flows: [flow(['svcs', 'agent', 'tsdb', 'ui'], { rate: 2 })] },
    },
    {
      short: 'Traces',
      kind: 'technique',
      title: 'Traces: propagate context, then sample wisely',
      body: [
        'Each request gets a <b>trace id</b> at the edge, passed to every downstream call in headers (W3C <code>traceparent</code>); each service records <b>spans</b> (operation, start, duration, attributes, parent id) and exports them via a collector (OpenTelemetry is the common standard). Stitched by trace id they show the call tree and the critical path — a slow database query, a retry storm, a serial chain that could be parallel.',
        'Volume is requests × spans × sample rate: 10,000 req/s × 25 spans = 250,000 spans/s; <b>keeping all of them</b> at 500 B is 10.8 TB/day, so most systems sample. <b>Head sampling</b> decides at the start (e.g. 1%): cheap and simple, but blind — a rare error occurring 50 times a day is captured at least once with probability <code>1 − 0.99⁵⁰</code> = only <b>39.5%</b>. <b>Tail sampling</b> buffers each trace and decides at the end: keep <b>every error, every slow trace</b> and a small random sample of the rest — costing collector memory and a routing layer so all spans of a trace reach the same collector, but catching what matters. At 1% head sampling, 2,500 spans/s ≈ <b>108 GB/day</b>.',
      ],
      changes: [{ text: 'Propagate traceparent; spans stitched by trace id', tone: 'info' }, { text: '1% head sampling: rare error seen only 39.5% of the time', tone: 'bad' }, { text: 'Tail sampling: keep all errors and slow traces', tone: 'good' }],
      scene: { nodes: [svcs({ tag: pill('trace_id in every call', 'link') }), agent({ tag: pill('tail sampler: keep errors + slow', 'filter', 'good') }), traces({ tag: pill('108 GB/day @1%', 'disk') })], links: [link('svcs', 'agent'), link('agent', 'traces')], flows: [flow(['svcs', 'agent', 'traces'], { rate: 2 })] },
    },
    {
      short: 'Correlate',
      kind: 'technique',
      title: 'Connect the signals, alert on symptoms',
      body: [
        'The signals are most useful <b>linked</b>: put the <code>trace_id</code> in every log line so a trace jumps to its logs; attach <b>exemplars</b> (a trace id sampled onto a histogram bucket) so a latency spike on a dashboard leads to a concrete slow trace; use common resource attributes (service, version, region, pod) across all three. A typical investigation: an alert fires on a metric (error ratio), you drill into the failing route’s traces to find the slow dependency, then read that service’s logs for the cause.',
        'Alert on <b>symptoms users feel</b> (SLO burn rate: error budget consumption over multiple windows — see the SLO lesson), not every cause (CPU at 80%); route by ownership, include a runbook link, and keep alerts few and actionable. Operate the pipeline itself: agents/collectors must <b>batch, buffer and back-pressure</b> so observability load can’t take down the services (and drop rather than block), be monitored (dropped spans, scrape failures, lag), and be budgeted per team. Figures in this lesson are model outputs for the given inputs.',
      ],
      changes: [{ text: 'trace_id in logs; exemplars link metrics → traces', tone: 'good' }, { text: 'Alert on SLO burn, not on every resource blip', tone: 'good' }],
      scene: { nodes: [svcs(), agent(), logs(), tsdb(), traces(), ui({ tag: pill('alert → trace → log', 'link', 'good') })], links: [link('svcs', 'agent'), link('agent', 'logs'), link('agent', 'tsdb'), link('agent', 'traces'), link('tsdb', 'ui'), link('traces', 'ui'), link('logs', 'ui')], flows: [flow(['tsdb', 'ui'], { rate: 1.4 }), flow(['traces', 'ui'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Know each signal’s cost driver',
      body: [
        '<b>Metrics</b> say that something is wrong (cost = label cardinality), <b>traces</b> say where (cost = requests × spans × sample rate; tail-sample to keep errors), <b>logs</b> say exactly what (cost = events × bytes × retention).',
        'Keep labels bounded, sample and tier deliberately, link signals by trace id, and alert on symptoms.',
      ],
      scene: { nodes: [svcs(), agent(), logs(), tsdb(), traces(), ui()], links: [link('svcs', 'agent'), link('agent', 'logs'), link('agent', 'tsdb'), link('agent', 'traces'), link('tsdb', 'ui')], flows: [flow(['svcs', 'agent', 'tsdb', 'ui'], { rate: 2 })] },
    },
  ],
};

export default lesson;
