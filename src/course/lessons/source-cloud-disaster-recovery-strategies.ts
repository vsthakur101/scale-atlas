import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const prod = (extra: Partial<SceneNode> = {}) => box('prod', -10, -5, 'Primary region', 'blue', 'server', { size: [1.5, 1.5], height: 32, ...extra });
const prodDb = (extra: Partial<SceneNode> = {}) => db('pdb', -10, 6, 'Primary data', { size: [1.3, 1.3], ...extra });
const dr = (extra: Partial<SceneNode> = {}) => box('dr', 8, -5, 'DR region', 'orange', 'server', { size: [1.5, 1.5], height: 32, ...extra });
const drData = (extra: Partial<SceneNode> = {}) => disk('ddb', 8, 6, 'DR copy', { size: [2.6, 1.1], height: 18, tone: 'yellow', ...extra });

const STRATS = ['Backup & restore', 'Pilot light', 'Warm standby', 'Active–active'] as const;
const COST = [1.1, 1.25, 1.6, 2.0];
const SWITCH_MIN = [0, 20, 5, 0]; // time to scale/switch compute once data is available (minutes)
const fmtT = (min: number): string => (min >= 2880 ? `${(min / 1440).toFixed(1)} days` : min >= 120 ? `${(min / 60).toFixed(1)} h` : min >= 1 ? `${Math.round(min)} min` : `${Math.round(min * 60)} s`);
const fmtUSD = (n: number): string => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`);

const lesson: Lesson = {
  slug: 'source-cloud-disaster-recovery-strategies',
  title: 'Disaster Recovery: RTO, RPO and the Four Strategies',
  blurb: 'Two numbers define a recovery plan — how much time and how much data you can lose — and four patterns trade cost for each.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'strategy', label: 'Strategy', icon: 'layers' },
    { key: 'rto', label: 'Recovery time (RTO)', icon: 'clock' },
    { key: 'rpo', label: 'Data loss window (RPO)', icon: 'alert' },
    { key: 'cost', label: 'Infrastructure cost', icon: 'gauge' },
    { key: 'loss', label: 'Cost of one disaster', icon: 'activity' },
  ],
  goals: [
    { text: 'What RTO and RPO mean and who sets them', step: 1 },
    { text: 'Backup and restore: cheap, slow', step: 2 },
    { text: 'Pilot light and warm standby: the middle', step: 3 },
    { text: 'Active–active: nearly no loss, highest cost', step: 5 },
    { text: 'Testing, failback and the human side', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'strat', label: 'Strategy (1–4)', min: 1, max: 4, step: 1, default: 3, unit: '', description: '1 backup & restore · 2 pilot light · 3 warm standby · 4 active–active.' },
      { key: 'tb', label: 'Data to restore', min: 0.1, max: 200, step: 0.1, default: 10, unit: ' TB', description: 'Dataset size the recovery depends on.' },
      { key: 'gbs', label: 'Restore throughput', min: 0.05, max: 10, step: 0.05, default: 1, unit: ' GB/s', description: 'How fast data can be copied back from backups.' },
      { key: 'bk', label: 'Backup / snapshot interval', min: 0.25, max: 48, step: 0.25, default: 6, unit: ' h', description: 'How often backups are taken (strategy 1) or snapshots shipped.' },
      { key: 'lag', label: 'Replication lag', min: 0, max: 600, step: 1, default: 5, unit: ' s', description: 'Typical asynchronous replication lag (strategies 2–4).' },
      { key: 'hour', label: 'Cost of an hour of downtime', min: 1000, max: 2000000, step: 1000, default: 100000, unit: ' $', description: 'Revenue and penalties lost per hour of outage.' },
      { key: 'base', label: 'Monthly infrastructure bill', min: 1000, max: 1000000, step: 1000, default: 50000, unit: ' $', description: 'What the primary environment costs per month.' },
    ],
    calculate: (input, step) => {
      const s = Math.min(4, Math.max(1, Math.round(input.strat ?? 3)));
      const tb = Math.max(0.01, input.tb ?? 10);
      const gbs = Math.max(0.001, input.gbs ?? 1);
      const bk = Math.max(0.01, input.bk ?? 6);
      const lag = Math.max(0, input.lag ?? 5);
      const hour = Math.max(0, input.hour ?? 1e5);
      const base = Math.max(0, input.base ?? 5e4);
      const restoreMin = (tb * 1000) / gbs / 60;
      // Backup & restore: rebuild compute and copy data back. Others: data already there, only compute to scale up or switch.
      const rtoMin = s === 1 ? restoreMin + 30 : (SWITCH_MIN[s - 1] ?? 0) + 5;
      const rpoMin = s === 1 ? bk * 60 : lag / 60;
      const rtoFinal = s === 4 ? 1 : rtoMin;
      const mult = COST[s - 1] ?? 1;
      const loss = (rtoFinal / 60) * hour;
      return {
        strategy: step < 1 ? { v: '—' } : { v: STRATS[s - 1] ?? '' },
        rto: step < 1 ? { v: '—' } : { v: fmtT(rtoFinal), tone: rtoFinal < 15 ? 'good' : rtoFinal < 240 ? 'warn' : 'bad' },
        rpo: step < 1 ? { v: '—' } : { v: rpoMin < 1 ? fmtT(rpoMin) : `up to ${fmtT(rpoMin)}`, tone: rpoMin < 1 ? 'good' : rpoMin < 30 ? 'warn' : 'bad' },
        cost: step < 2 ? { v: '—' } : { v: `${mult.toFixed(2)}× (${fmtUSD(base * mult * 12)}/yr)`, tone: mult < 1.4 ? 'good' : mult < 1.8 ? 'warn' : 'bad' },
        loss: step < 2 ? { v: '—' } : { v: fmtUSD(loss), tone: loss < 50000 ? 'good' : loss < 500000 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'RTO / RPO',
      kind: 'insight',
      title: 'Two numbers define the plan',
      body: [
        'A disaster — a region outage, ransomware, a destroyed data centre, a catastrophic bad migration — takes out your primary environment. <b>RTO</b> (recovery time objective) is how long you can be down; <b>RPO</b> (recovery point objective) is how much recent data you can afford to lose, measured as time (“the last 5 minutes of writes”).',
        'They are <b>business decisions</b>, not technical ones, set by what an hour of downtime and a lost transaction cost. Tight RTO and RPO require more infrastructure, kept ready and in sync; relaxed ones allow cheap, slow recovery. Everything below is a point on that cost curve.',
      ],
      concepts: [{ term: 'RTO', def: 'Recovery Time Objective: the maximum acceptable time from disaster to service restored.' }, { term: 'RPO', def: 'Recovery Point Objective: the maximum acceptable amount of data loss, expressed as time before the disaster.' }],
      scene: { nodes: [prod({ state: 'down', tone: 'red', tag: pill('disaster', 'alert', 'bad') }), prodDb({ state: 'down' }), dr({ tag: pill('RTO: how long down?', 'clock') })], links: [link('prod', 'dr', { style: 'dashed' })], flows: [] },
    },
    {
      short: 'Backup',
      kind: 'technique',
      title: 'Backup and restore: cheapest, slowest',
      body: [
        'Take periodic backups or snapshots and copy them to another region. After a disaster, <b>rebuild</b> the infrastructure (from infrastructure-as-code) and <b>restore the data</b>. Almost no standing cost — storage only — but recovery time is dominated by copying data: 10 TB at 1 GB/s is <b>2.8 hours</b> before the app even starts, and a 6-hour backup interval means up to <b>6 hours of data lost</b>.',
        'Good fit for non-critical systems and as the <i>last line of defence</i> for every system: backups are also what saves you from ransomware and human error that replication would faithfully copy. Keep them immutable and offline from the primary’s credentials.',
      ],
      changes: [{ text: 'RTO ≈ rebuild + data ÷ throughput', tone: 'info' }, { text: 'RPO up to the backup interval', tone: 'bad' }, { text: 'Backups also defend against corruption and ransomware', tone: 'good' }],
      scene: { nodes: [prod(), prodDb({ tag: pill('snapshot every 6 h', 'refresh') }), drData({ tag: pill('cold copy', 'disk') }), dr({ tone: 'grey', state: 'ghost', tag: pill('nothing running', 'pause') })], links: [link('pdb', 'ddb', { style: 'dashed' })], flows: [flow(['pdb', 'ddb'], { kind: 'write', rate: 0.6, speed: 0.5 })] },
    },
    {
      short: 'Pilot / warm',
      kind: 'technique',
      title: 'Pilot light and warm standby',
      body: [
        '<b>Pilot light</b>: the data layer is <i>continuously replicated</i> to the DR region and kept running, but application servers are off or minimal; on disaster you start and scale them. RPO shrinks to replication lag (seconds); RTO is the time to launch compute — tens of minutes. <b>Warm standby</b>: a <i>scaled-down but running</i> copy of the full stack serves no traffic (or a little); on disaster you scale up and switch DNS — RTO a few minutes.',
        'Cost climbs with how much you keep running: roughly 1.25× and 1.6× the primary bill in this model. The extra money buys back hours. Replication is asynchronous, so RPO equals lag — and corruption replicates too, so keep backups as well.',
      ],
      changes: [{ text: 'Pilot light: data live, compute off → RTO ~20–30 min', tone: 'info' }, { text: 'Warm standby: scaled-down stack running → RTO ~5–10 min', tone: 'info' }],
      scene: { nodes: [prod(), prodDb(), dr({ tag: pill('minimal / scaled down', 'cpu') }), drData({ tag: pill('live replica, lag ~5 s', 'refresh', 'good') })], links: [link('pdb', 'ddb'), link('prod', 'dr', { style: 'dashed' })], flows: [flow(['pdb', 'ddb'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Failover',
      kind: 'technique',
      title: 'The failover sequence',
      body: [
        'Decide (a human or an automated health signal declares disaster — avoid flapping), <b>fence</b> the old primary so it can’t come back and accept writes, <b>promote</b> the replica database (accepting RPO data loss), <b>scale and start</b> compute, verify, then <b>switch traffic</b> by DNS, anycast or a global load balancer. Every step needs a runbook and ideally automation; each manual step is minutes.',
        'Dependencies decide the real RTO: secrets, certificates, container images, third-party allowlists, DNS TTLs (see the DNS lesson), message queues and caches that start cold. A plan that ignores them looks fast on paper and slow in the incident.',
      ],
      scene: { nodes: [prod({ state: 'down', tone: 'red' }), box('dec', -2, 0, 'Declare + fence', 'red', 'shield', { size: [1.2, 1.2], height: 22 }), drData({ tag: pill('promote replica', 'check') }), dr({ tag: pill('scale up, switch DNS', 'route') })], links: [link('dec', 'ddb'), link('ddb', 'dr')], flows: [flow(['dec', 'ddb', 'dr'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Active–active',
      kind: 'tradeoff',
      title: 'Active–active: both regions serve traffic',
      body: [
        'Run the full stack in two or more regions, each serving users, with data replicated between them. A regional failure simply removes a region from the load balancer: <b>RTO of seconds to a minute</b>, RPO near zero. It also improves latency by serving users nearby.',
        'The price is ~2× infrastructure <i>and</i> hard distributed-data problems: multi-region writes need conflict resolution or a single write region (then it isn’t really active–active for writes), consistency becomes a design choice, and every deploy must work across regions. Reserve it for systems where minutes of downtime cost more than that complexity.',
      ],
      changes: [{ text: 'RTO seconds, RPO ~0', tone: 'good' }, { text: '~2× cost + multi-region data conflicts', tone: 'bad' }],
      scene: { nodes: [prod({ name: 'Region A', tag: pill('serving', 'check', 'good') }), dr({ name: 'Region B', tag: pill('serving', 'check', 'good') }), prodDb({ name: 'Data A' }), drData({ name: 'Data B' })], links: [link('pdb', 'ddb', { arrow: 'both' }), link('prod', 'dr', { style: 'dashed', arrow: 'both' })], flows: [flow(['pdb', 'ddb'], { kind: 'write', rate: 1.5 }), flow(['ddb', 'pdb'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Practice',
      kind: 'problem',
      title: 'An untested plan is a hope',
      body: [
        'Most failed recoveries fail for boring reasons: backups that don’t restore, runbooks that reference deleted systems, expired credentials, a DR region without capacity quota, DNS TTLs longer than the RTO. Run <b>game days</b>: restore from backup into a clean environment on a schedule, fail over a real service, and time every step against the RTO.',
        'Plan <b>failback</b> too — returning to the primary is another risky data sync. Keep the plan, contacts and credentials <i>outside</i> the environment that may be down. And cover the disasters replication can’t: corruption and malicious deletion need point-in-time restore and immutable backups. Figures here are illustrative model outputs for comparing strategies.',
      ],
      changes: [{ text: 'Restore tests, failover drills, timed against RTO', tone: 'good' }, { text: 'Immutable backups for corruption and ransomware', tone: 'good' }],
      scene: { nodes: [box('gd', -6, 0, 'Game day', 'teal', 'refresh', { size: [1.3, 1.3], height: 24, tag: pill('measured RTO / RPO', 'clock') }), box('run', 6, 0, 'Runbook + automation', 'purple', 'list', { size: [1.3, 1.3], height: 24 })], links: [link('gd', 'run', { arrow: 'both' })], flows: [flow(['gd', 'run'], { rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Buy the RTO and RPO the business needs',
      body: [
        '<b>Backup &amp; restore</b> (hours–days RTO, hours RPO, ~1.1× cost) → <b>pilot light</b> (tens of minutes, seconds, ~1.25×) → <b>warm standby</b> (minutes, seconds, ~1.6×) → <b>active–active</b> (seconds, ~0, ~2×+ and data-conflict complexity). Pick by comparing yearly cost against RTO × cost of an hour of downtime.',
        'Keep immutable backups regardless, automate and rehearse failover, mind dependencies and DNS TTLs, and plan failback. Cost multipliers and times are illustrative.',
      ],
      scene: { nodes: [prod(), dr(), prodDb(), drData()], links: [link('pdb', 'ddb'), link('prod', 'dr', { style: 'dashed' })], flows: [flow(['pdb', 'ddb'], { kind: 'write', rate: 1.2 })] },
    },
  ],
};

export default lesson;
