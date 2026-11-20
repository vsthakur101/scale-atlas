import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const code = (extra: Partial<SceneNode> = {}) => box('code', -16, 0, 'One codebase', 'green', 'file', { size: [1.3, 1.3], height: 24, ...extra });
const build = (extra: Partial<SceneNode> = {}) => box('build', -9, 0, 'Build → release', 'orange', 'layers', { size: [1.3, 1.3], height: 26, ...extra });
const inst = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`i${i}`, 0, (i - (n - 1) / 2) * 5, name, 'blue', 'server', { size: [1.2, 1.2], height: 26, ...extra });
const backing = (extra: Partial<SceneNode> = {}) => db('backing', 10, 0, 'Backing services (DB, queue, cache)', { size: [1.4, 1.4], ...extra });
const cfg = (extra: Partial<SceneNode> = {}) => box('cfg', -9, 8, 'Config from the environment', 'teal', 'list', { size: [1.3, 1.2], height: 18, ...extra });

const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 120 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);
const fmtN = (n: number): string => (n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-the-12-factor-app',
  title: 'The Twelve-Factor App: Building for the Cloud',
  blurb: 'Stateless processes, config in the environment, disposable instances and logs as streams: the twelve habits that make an app deployable, scalable and replaceable — with the deploy-time and failure arithmetic they make possible.',
  minutes: 12,
  level: 'Beginner',
  metrics: [
    { key: 'deploy', label: 'Rolling deploy time', icon: 'clock' },
    { key: 'scale', label: 'Time to add capacity after an alert', icon: 'activity' },
    { key: 'head', label: 'Headroom needed to ride out the scale-up', icon: 'gauge' },
    { key: 'lost', label: 'In-flight requests lost per batch without graceful shutdown', icon: 'alert' },
  ],
  goals: [
    { text: 'Codebase, dependencies and config', step: 1 },
    { text: 'Backing services, build/release/run and stateless processes', step: 2 },
    { text: 'Concurrency and disposability', step: 3 },
    { text: 'Dev/prod parity, logs and admin processes', step: 4 },
    { text: 'What the factors enable: deploy and scale arithmetic', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Instances', min: 2, max: 1000, step: 1, default: 50, unit: '', description: 'Running copies of the app.' },
      { key: 'batch', label: 'Rolling batch size', min: 1, max: 100, step: 1, default: 20, unit: '%', description: 'Share of instances replaced at a time.' },
      { key: 'start', label: 'Start-up time', min: 1, max: 600, step: 1, default: 20, unit: ' s', description: 'Time from launch until an instance is ready for traffic.' },
      { key: 'drain', label: 'Graceful shutdown time', min: 0, max: 300, step: 1, default: 30, unit: ' s', description: 'Time to stop accepting work and finish in-flight requests.' },
      { key: 'detect', label: 'Alert / autoscaler reaction time', min: 5, max: 600, step: 5, default: 60, unit: ' s', description: 'Time for the system to notice it needs more capacity.' },
      { key: 'growth', label: 'Load growth in a spike', min: 1, max: 200, step: 1, default: 30, unit: ' %/min', description: 'How fast demand rises relative to current load.' },
      { key: 'rps', label: 'Requests/s per instance', min: 1, max: 5000, step: 1, default: 200, unit: '', description: 'Traffic each instance serves.' },
      { key: 'lat', label: 'Average request duration', min: 10, max: 10000, step: 10, default: 300, unit: ' ms', description: 'How long a request is in flight.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(2, Math.round(input.n ?? 50));
      const batch = Math.min(1, Math.max(0.01, (input.batch ?? 20) / 100));
      const start = Math.max(1, input.start ?? 20);
      const drain = Math.max(0, input.drain ?? 30);
      const detect = Math.max(1, input.detect ?? 60);
      const growth = Math.max(0, (input.growth ?? 30) / 100);
      const rps = Math.max(1, input.rps ?? 200);
      const lat = Math.max(1, input.lat ?? 300) / 1000;
      const perBatch = Math.max(1, Math.round(n * batch));
      const batches = Math.ceil(n / perBatch);
      const deploy = batches * (start + drain);
      const react = detect + start;
      // Demand keeps growing by `growth` per minute while new instances are being added.
      const head = growth * (react / 60);
      // Killing instances mid-request drops what each had in flight: rps × latency (Little's law).
      const lost = perBatch * rps * lat;
      return {
        deploy: step < 2 ? { v: '—' } : { v: `${fmtT(deploy)} (${batches} batches of ${perBatch})`, tone: deploy < 300 ? 'good' : deploy < 1800 ? 'warn' : 'bad' },
        scale: step < 2 ? { v: '—' } : { v: fmtT(react), tone: react < 90 ? 'good' : react < 300 ? 'warn' : 'bad' },
        head: step < 2 ? { v: '—' } : { v: `${(head * 100).toFixed(0)}% spare capacity`, tone: head < 0.3 ? 'good' : head < 0.7 ? 'warn' : 'bad' },
        lost: step < 2 ? { v: '—' } : { v: `${fmtN(lost)} requests (dropped if killed abruptly)`, tone: drain > 0 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'A methodology for apps that live in the cloud',
      body: [
        'The <b>Twelve-Factor App</b> (Heroku engineers, 2011) distils how to build software-as-a-service so it is <b>portable</b> across environments, <b>deployable</b> continuously, and <b>scalable</b> without redesign. It is not a framework — it is a set of habits that turn an application into a <i>disposable, replaceable unit</i> that a platform (containers, Kubernetes, a PaaS) can start, stop, move and multiply at will.',
        'The factors cluster around one idea: <b>separate what changes from what doesn’t, and keep state out of the process</b>. When any instance can be killed and replaced in seconds without losing anything, deploys, scaling and failure recovery all become routine.',
      ],
      scene: { nodes: [code(), build(), inst(0, 3, 'Instance'), inst(1, 3, 'Instance'), inst(2, 3, 'Instance'), backing()], links: [link('code', 'build'), link('build', 'i0'), link('build', 'i1'), link('build', 'i2'), link('i0', 'backing'), link('i1', 'backing'), link('i2', 'backing')], flows: [flow(['code', 'build', 'i1', 'backing'], { rate: 1.5 })] },
    },
    {
      short: 'Code & config',
      kind: 'technique',
      title: 'Codebase, dependencies, config',
      body: [
        '<b>I. Codebase</b>: one repository per app, tracked in version control, many <i>deploys</i> (dev, staging, production) of the same code. <b>II. Dependencies</b>: declare them explicitly in a manifest (a lockfile) and isolate them — never rely on a system-wide package that “happens to be installed”. <b>III. Config</b>: everything that varies between deploys — database URLs, credentials, feature flags — lives in <b>environment variables</b>, never in the code. A test: could you open-source the repository today without leaking a secret?',
        'This separates the <b>build</b> (identical everywhere) from the <b>configuration</b> (environment-specific), so the same artifact promotes from staging to production (see the CI/CD lesson). Group config by deploy, not into named “environments” hard-coded in the app, so you can add a deploy without changing code.',
      ],
      changes: [{ text: 'One codebase, many deploys', tone: 'good' }, { text: 'Locked dependencies; config in the environment', tone: 'good' }],
      scene: { nodes: [code({ tag: pill('no secrets in the repo', 'shield', 'good') }), cfg({ tag: pill('DATABASE_URL · API_KEY', 'lock') }), build()], links: [link('code', 'build'), link('cfg', 'build', { style: 'dashed' })], flows: [flow(['code', 'build'], { rate: 1.5 })] },
    },
    {
      short: 'Stateless',
      kind: 'technique',
      title: 'Backing services, build–release–run, stateless processes',
      body: [
        '<b>IV. Backing services</b>: databases, queues, caches and email are <b>attached resources</b> reached through URLs in config — swapping a local database for a managed one is a config change. <b>V. Build, release, run</b>: three strictly separate stages — build (code → artifact), release (artifact + config, immutable and versioned, so rollback is “run release N−1”), run (start processes). <b>VI. Processes</b>: the app runs as <b>stateless, share-nothing processes</b>; anything that must persist (sessions, uploads, job state) goes to a backing service — never to local memory or disk that the next request might not see.',
        'Statelessness is what lets a load balancer send any request to any instance and lets you kill one at any moment (see the Stateless Servers lesson). “Sticky sessions” and local file storage are the classic violations.',
      ],
      changes: [{ text: 'Backing services are swappable via config', tone: 'good' }, { text: 'Immutable releases; rollback = previous release', tone: 'good' }, { text: 'State lives in backing services, not in processes', tone: 'good' }],
      scene: { nodes: [build({ tag: pill('release = build + config', 'hash') }), inst(0, 2, 'Stateless process'), inst(1, 2, 'Stateless process'), backing({ tag: pill('sessions, files, jobs', 'check', 'good') })], links: [link('build', 'i0'), link('build', 'i1'), link('i0', 'backing'), link('i1', 'backing')], flows: [flow(['build', 'i0', 'backing'], { rate: 1.5 })] },
    },
    {
      short: 'Disposable',
      kind: 'technique',
      title: 'Port binding, concurrency and disposability',
      body: [
        '<b>VII. Port binding</b>: the app is self-contained and exports HTTP by binding a port — no external app server to inject it into. <b>VIII. Concurrency</b>: scale <b>out</b> by running more processes (of different types: web, worker, scheduler), not up by making one process bigger. <b>IX. Disposability</b>: processes <b>start fast</b> and <b>shut down gracefully</b> — on SIGTERM stop accepting new work, finish in-flight requests, release resources, exit — and are robust against sudden death (jobs return to the queue, work is idempotent; see the Delivery Semantics lesson).',
        'These pay off in the numbers: a 20 s start-up plus 30 s drain means a rolling deploy of 50 instances in batches of 10 takes <b>5 batches × 50 s = ~4 minutes</b>; killing a batch abruptly instead of draining would drop <b>~600 in-flight requests</b> (10 instances × 200 req/s × 0.3 s). Fast start also bounds how quickly you can scale: alert reaction 60 s + 20 s start = <b>80 s</b> before new capacity serves — during which a 30%/min spike grows load by ~40%, so you need that much headroom.',
      ],
      changes: [{ text: 'Rolling deploy = batches × (start + drain) ≈ 4 min', tone: 'info' }, { text: 'Abrupt kill drops in-flight requests; drain them', tone: 'bad' }, { text: 'Start-up time sets how fast you can scale out', tone: 'info' }],
      scene: { nodes: [inst(0, 3, 'Draining', { tag: pill('SIGTERM: finish in-flight', 'pause') }), inst(1, 3, 'Ready', { tag: pill('serving', 'check', 'good') }), inst(2, 3, 'Starting', { tag: pill('20 s to ready', 'clock', 'warn') }), build()], links: [link('build', 'i2')], flows: [flow(['build', 'i2'], { rate: 1 })] },
    },
    {
      short: 'Parity & logs',
      kind: 'technique',
      title: 'Parity, logs and admin processes',
      body: [
        '<b>X. Dev/prod parity</b>: keep development, staging and production as similar as possible — the same backing services (run real Postgres locally in a container, not SQLite), small time gaps (deploy within hours, not weeks), and the same people deploying what they wrote. <b>XI. Logs</b>: treat them as an <b>event stream</b> — the app writes unbuffered to <code>stdout</code>; the platform captures, routes and stores them (see the Observability lesson); the app never manages log files. <b>XII. Admin processes</b>: one-off tasks (migrations, console, data fixes) run as <b>one-off processes in the same environment</b> and with the same code and config as the app, not by hand on a special server.',
        'Modern extensions add what the original predates: <b>health probes</b>, <b>metrics and tracing</b>, API-first design, security (secrets managers instead of plain env vars), and explicit <b>graceful degradation</b>. The factors are a baseline, not a ceiling.',
      ],
      changes: [{ text: 'Same services in dev and prod; short deploy gaps', tone: 'good' }, { text: 'Logs to stdout as a stream; one-off tasks in the same environment', tone: 'good' }],
      scene: { nodes: [inst(0, 1, 'App process', { tag: pill('writes to stdout', 'list') }), box('plat', 10, 0, 'Platform: collect · route · store logs', 'purple', 'search', { size: [1.4, 1.4], height: 24 })], links: [link('i0', 'plat')], flows: [flow(['i0', 'plat'], { rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Make every instance replaceable',
      body: [
        'One codebase, locked dependencies, config in the environment, backing services as attachments, immutable releases, stateless share-nothing processes, scale out by process count, fast start and graceful stop, parity between environments, logs as streams, admin tasks as one-offs.',
        'The payoff is arithmetic: rolling deploy ≈ batches × (start + drain), scale-out latency ≈ reaction + start-up, and zero lost requests when processes drain. Figures here are model outputs for sizing.',
      ],
      scene: { nodes: [code(), build(), inst(0, 2, 'Instance'), inst(1, 2, 'Instance'), backing()], links: [link('code', 'build'), link('build', 'i0'), link('build', 'i1'), link('i0', 'backing'), link('i1', 'backing')], flows: [flow(['code', 'build', 'i0', 'backing'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
