import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const load = (extra: Partial<SceneNode> = {}) => box('load', -15, 0, 'Workload', 'green', 'users', { size: [1.3, 1.3], height: 24, ...extra });
const fleet = (extra: Partial<SceneNode> = {}) => box('fleet', -6, 0, 'Instances', 'blue', 'server', { size: [1.5, 1.5], height: 32, ...extra });
const bill = (extra: Partial<SceneNode> = {}) => box('bill', 4, 0, 'Monthly bill', 'orange', 'gauge', { size: [1.4, 1.4], height: 28, ...extra });
const storage = (extra: Partial<SceneNode> = {}) => db('storage', 13, 0, 'Storage + egress', { size: [1.3, 1.3], ...extra });

const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

const lesson: Lesson = {
  slug: 'source-cloud-cost-reduction-techniques',
  title: 'Cloud Cost: On-Demand, Committed and Spot — and Where Waste Hides',
  blurb: 'Pricing models are a break-even calculation on utilisation. How reserved commitments, savings plans and spot instances compare, plus right-sizing, scheduling and the costs people forget.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'od', label: 'On-demand (pay for hours used)', icon: 'clock' },
    { key: 'res', label: 'Committed (pay 24×7 at a discount)', icon: 'lock' },
    { key: 'spot', label: 'Spot for interruptible work', icon: 'bolt' },
    { key: 'be', label: 'Break-even utilisation for committing', icon: 'gauge' },
    { key: 'best', label: 'Cheapest steady option', icon: 'check' },
  ],
  goals: [
    { text: 'Where cloud money actually goes', step: 1 },
    { text: 'On-demand vs committed: the break-even utilisation', step: 2 },
    { text: 'Spot capacity and the interruption tax', step: 3 },
    { text: 'Right-sizing, scheduling and autoscaling', step: 4 },
    { text: 'Hidden costs: data transfer, idle resources, storage tiers', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'price', label: 'On-demand price per instance', min: 0.01, max: 10, step: 0.01, default: 0.2, unit: ' $/h', description: 'Hourly on-demand rate.' },
      { key: 'n', label: 'Instances', min: 1, max: 5000, step: 1, default: 100, unit: '', description: 'Fleet size needed.' },
      { key: 'util', label: 'Share of the month the instances are needed', min: 5, max: 100, step: 1, default: 70, unit: '%', description: 'Hours actually used ÷ hours in the month (730).' },
      { key: 'disc', label: 'Commitment discount', min: 10, max: 75, step: 1, default: 40, unit: '%', description: 'Saving of a 1–3 year reserved instance or savings plan versus on-demand.' },
      { key: 'sdisc', label: 'Spot discount', min: 30, max: 90, step: 1, default: 70, unit: '%', description: 'Saving of spot/preemptible capacity versus on-demand.' },
      { key: 'rework', label: 'Extra work from spot interruptions', min: 0, max: 60, step: 1, default: 10, unit: '%', description: 'Additional compute needed to redo interrupted work.' },
    ],
    calculate: (input, step) => {
      const price = Math.max(0.001, input.price ?? 0.2);
      const n = Math.max(1, input.n ?? 100);
      const util = Math.min(1, Math.max(0.01, (input.util ?? 70) / 100));
      const disc = Math.min(0.9, Math.max(0, (input.disc ?? 40) / 100));
      const sdisc = Math.min(0.95, Math.max(0, (input.sdisc ?? 70) / 100));
      const rework = Math.max(0, (input.rework ?? 10) / 100);
      const hrs = 730;
      // On-demand: pay only for the hours used. Committed: pay for every hour at the discounted rate. Spot: discounted, but more hours to redo interrupted work.
      const od = price * n * hrs * util;
      const res = price * (1 - disc) * n * hrs;
      const spot = price * (1 - sdisc) * n * hrs * util * (1 + rework);
      // Commitment beats on-demand once utilisation exceeds (1 − discount).
      const be = (1 - disc) * 100;
      const best = res < od ? 'Committed' : 'On-demand';
      return {
        od: step < 2 ? { v: '—' } : { v: `${usd(od)}/mo`, tone: od <= res ? 'good' : 'warn' },
        res: step < 2 ? { v: '—' } : { v: `${usd(res)}/mo`, tone: res < od ? 'good' : 'warn' },
        spot: step < 3 ? { v: '—' } : { v: `${usd(spot)}/mo (${Math.round((1 - spot / od) * 100)}% below on-demand)`, tone: 'good' },
        be: step < 2 ? { v: '—' } : { v: `${be.toFixed(0)}% (you are at ${(util * 100).toFixed(0)}%)`, tone: util * 100 > be ? 'good' : 'warn' },
        best: step < 2 ? { v: '—' } : { v: `${best} (saves ${usd(Math.abs(od - res))}/mo vs the other)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Where it goes',
      kind: 'insight',
      title: 'Cloud bills are mostly a few things, mostly avoidable',
      body: [
        'A typical bill is dominated by <b>compute</b> (instances, containers, serverless), then <b>storage</b>, <b>data transfer</b> and <b>managed services</b>. Surveys of real accounts repeatedly find 25–35% waste: idle or oversized instances, forgotten resources, unattached disks, over-provisioned databases, always-on development environments, and traffic crossing zones and regions unnecessarily.',
        'Cost work has three layers, in order of effort: <b>stop paying for what you don’t use</b> (delete, schedule, right-size), <b>pay less for what you use</b> (commitments, spot, cheaper tiers and architectures), and <b>use less</b> (efficient code, caching, compression, fewer round trips). The cloud makes cost a continuous engineering concern — often called FinOps — because every deploy changes the bill.',
      ],
      scene: { nodes: [load(), fleet({ tag: pill('compute ≈ half the bill', 'cpu') }), bill(), storage({ tag: pill('storage + transfer', 'disk') })], links: [link('load', 'fleet'), link('fleet', 'bill'), link('bill', 'storage', { style: 'dashed' })], flows: [flow(['load', 'fleet', 'bill'], { rate: 1.5 })] },
    },
    {
      short: 'Commit',
      kind: 'technique',
      title: 'On-demand vs committed: a break-even utilisation',
      body: [
        '<b>On-demand</b> instances cost the full rate for exactly the hours you run them: flexible, no commitment. <b>Reserved instances and savings plans</b> trade a 1–3 year commitment for a discount (here 40%) — but you pay for <b>every hour of the term whether you use it or not</b>. So a commitment is only a win if you use the capacity enough: it beats on-demand when utilisation exceeds <code>1 − discount</code> = <b>60%</b>.',
        'At the defaults (100 instances, $0.20/h, used 70% of the month) on-demand costs <b>$10,220</b> a month and a commitment <b>$8,760</b> — 14% cheaper. At 50% utilisation the commitment is a loss. So commit to the <b>baseline you always run</b> (the floor of your load) and leave the variable part on-demand or spot; right-size <i>before</i> committing so you don’t lock in waste. Savings plans (a $/h spend commitment) are more flexible across instance types than reserved instances.',
      ],
      changes: [{ text: 'Commitment wins when utilisation > 1 − discount', tone: 'info' }, { text: '70% used: $10,220 on-demand vs $8,760 committed', tone: 'good' }, { text: 'Commit to the baseline, not the peak', tone: 'good' }],
      scene: { nodes: [fleet({ tag: pill('baseline: committed', 'lock', 'good') }), box('burst', 4, 7, 'Variable load', 'orange', 'bolt', { size: [1.3, 1.3], height: 22, tag: pill('on-demand / spot', 'clock') }), bill()], links: [link('fleet', 'bill'), link('burst', 'bill', { style: 'dashed' })], flows: [flow(['fleet', 'bill'], { rate: 1.5 })] },
    },
    {
      short: 'Spot',
      kind: 'technique',
      title: 'Spot capacity: 60–90% cheaper, but it can be taken back',
      body: [
        'Spot (preemptible) instances use the provider’s spare capacity at a deep discount — here 70% — in exchange for the right to <b>reclaim it with short notice</b> (typically 30 seconds to 2 minutes). Suitable work is <b>interruptible and restartable</b>: batch processing, CI runners, rendering, ML training with checkpoints, stateless web tiers behind a load balancer, big-data workers, dev/test.',
        'The <b>interruption tax</b>: if 10% of the work must be redone, the effective cost is 0.3 × 1.1 = 33% of on-demand — still about <b>67% cheaper</b> than on-demand for the same work (shown in the metrics). Make it robust: diversify across instance types and zones (capacity pools are independent), checkpoint progress, handle the termination notice, and keep a small on-demand base so a spot shortage doesn’t take you down. Never put a singleton stateful service on spot.',
      ],
      changes: [{ text: '0.30 × (1 + 10% rework) = 33% of on-demand', tone: 'good' }, { text: 'Diversify pools · checkpoint · handle the notice', tone: 'good' }],
      scene: { nodes: [fleet({ name: 'Spot workers', tag: pill('reclaimed with ~2 min notice', 'alert', 'warn') }), box('q', -6, 7, 'Work queue + checkpoints', 'yellow', 'queue', { size: [1.6, 1], height: 14, tag: pill('re-run interrupted work', 'refresh', 'good') }), bill()], links: [link('fleet', 'bill'), link('q', 'fleet', { arrow: 'both' })], flows: [flow(['q', 'fleet', 'bill'], { rate: 1.5 })] },
    },
    {
      short: 'Right-size',
      kind: 'technique',
      title: 'Right-size, schedule and autoscale',
      body: [
        '<b>Right-size</b>: measure real CPU and memory over weeks; an instance averaging 8% CPU can usually drop two sizes (halving cost per step) or move to a cheaper family (ARM/Graviton-style processors often give ~20% better price-performance). <b>Schedule</b>: shut down dev, test and analytics environments outside working hours — 12 hours a day on weekdays is <b>~64% less</b> than 24×7. <b>Autoscale</b> (see the Kubernetes lesson) so capacity follows load instead of being sized for the peak all month.',
        'Do these <i>before</i> committing. Also reduce the work itself: caching (a 90% hit ratio shrinks the database fleet tenfold, see the Cache lessons), efficient serialisation and compression, batching, and better algorithms — the cheapest instance is the one you don’t need. Set budgets and anomaly alerts, tag everything by team and service, and review the bill weekly so owners see their own spend.',
      ],
      changes: [{ text: 'Right-size → schedule → autoscale → then commit', tone: 'good' }, { text: 'Tag everything; budgets and anomaly alerts', tone: 'good' }],
      scene: { nodes: [fleet({ tag: pill('8% CPU → drop two sizes', 'gauge', 'warn') }), box('sched', 4, -6, 'Off-hours shutdown', 'teal', 'clock', { size: [1.2, 1.2], height: 20, tag: pill('−64% for dev/test', 'check', 'good') }), bill()], links: [link('fleet', 'bill'), link('sched', 'fleet', { style: 'dashed' })], flows: [flow(['fleet', 'bill'], { rate: 1.2 })] },
    },
    {
      short: 'Hidden',
      kind: 'problem',
      title: 'The costs people forget',
      body: [
        '<b>Data transfer</b>: ingress is free but <b>egress to the internet</b> is charged per GB, <b>cross-zone</b> and <b>cross-region</b> traffic costs too, and NAT gateways bill per GB processed — a chatty service spread across zones or pulling large objects through a NAT can cost more than its compute. Keep chatty components in the same zone, use VPC endpoints and a CDN, and compress.',
        '<b>Storage</b>: lifecycle policies to move cold objects to cheaper tiers, delete old snapshots and versions, and watch unattached volumes. <b>Idle managed services</b>: load balancers, databases and clusters billing 24×7 with no traffic. <b>Logs and metrics</b> at high cardinality can rival compute (see the Time-Series lesson). And <b>engineers’ time</b>: a 5% saving that takes a month isn’t always worth it — prioritise by dollars and effort. Figures here are model outputs with illustrative prices; check current rates.',
      ],
      changes: [{ text: 'Egress, cross-zone, NAT: per-GB charges add up', tone: 'bad' }, { text: 'Lifecycle policies, delete idle resources, watch log volume', tone: 'good' }],
      scene: { nodes: [box('zA', -8, 0, 'Zone A', 'blue', 'server', { size: [1.3, 1.3], height: 24 }), box('zB', 6, 0, 'Zone B', 'blue', 'server', { size: [1.3, 1.3], height: 24 }), bill({ tag: pill('every GB across zones costs', 'alert', 'warn') })], links: [link('zA', 'zB', { arrow: 'both', label: pill('cross-zone $/GB', 'alert') })], flows: [flow(['zA', 'zB'], { kind: 'heavy', rate: 2, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Utilisation decides the pricing model',
      body: [
        '<b>Commit</b> only to the baseline you always use (worth it above <code>1 − discount</code> utilisation); run <b>interruptible</b> work on spot (effective cost ≈ <code>(1 − discount) × (1 + rework)</code>); <b>right-size, schedule and autoscale</b> first; and hunt the hidden line items — data transfer, idle managed services, logs and storage tiers.',
        'Treat cost as a metric with owners, budgets and alerts, and optimise by dollars saved per hour of effort.',
      ],
      scene: { nodes: [load(), fleet(), bill(), storage()], links: [link('load', 'fleet'), link('fleet', 'bill'), link('bill', 'storage', { style: 'dashed' })], flows: [flow(['load', 'fleet', 'bill'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
