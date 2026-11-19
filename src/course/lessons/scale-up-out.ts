import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const users = (n: number, text: string) => crowd('users', -9, 1, n, text);
const one = (extra: Partial<SceneNode> = {}): SceneNode =>
  box('s1', 0, 0, 'Server', 'blue', 'server', { sub: '4 vCPU', ...extra });
const store = db('db', 8, -1, 'Database');
const fleet = (loads: number[], extra: Partial<SceneNode> = {}): SceneNode[] =>
  loads.map((l, i) => box(`s${i + 1}`, (i - (loads.length - 1) / 2) * 3, (i - (loads.length - 1) / 2) * 3.6, `Server ${String.fromCharCode(65 + i)}`, 'blue', 'server', { size: [1.4, 1.4], height: 42, load: l, ...extra }));

const lesson: Lesson = {
  slug: 'scale-up-out',
  title: 'Scaling Up vs Out',
  blurb: 'Bigger machine or more machines? Follow one app from a single box to an elastic fleet, and see what each step really buys.',
  minutes: 10,
  level: 'Beginner',
  metrics: [
    { key: 'users', label: 'Users', icon: 'users' },
    { key: 'rps', label: 'Req / s', icon: 'activity' },
    { key: 'cpu', label: 'CPU', icon: 'cpu' },
    { key: 'cost', label: 'Cost / mo', icon: 'dollar' },
    { key: 'healthy', label: 'Healthy', icon: 'heart' },
  ],
  goals: [
    { text: 'What vertical scaling buys and where it stops', step: 4 },
    { text: 'Why a single server is a single point of failure', step: 5 },
    { text: 'How horizontal scaling adds capacity and redundancy', step: 6 },
    { text: 'Autoscaling, and why it lags sudden spikes', step: 9 },
  ],
  legend: ['request', 'response', 'fail'],
  steps: [
    {
      short: 'One box',
      kind: 'insight',
      title: 'Everything on one server',
      body: [
        'A recipe-sharing app launches on a single 4-vCPU virtual machine. Web app and database talk to each other over a local socket. Deploys are one command, debugging is one log file, and the bill is tiny.',
        'For a few thousand users this is <b>the right design</b>. Simplicity is a feature until the numbers say otherwise.',
      ],
      scene: {
        nodes: [users(5, '2k users'), one({ load: 15 }), store],
        links: [link('users', 's1'), link('s1', 'db', { arrow: 'both' })],
        flows: [flow(['users', 's1'], { back: true, rate: 1 })],
        metrics: { users: '2k', rps: '20/s', cpu: '15%', cost: '$40', healthy: '1 / 1' },
      },
    },
    {
      short: 'Spike',
      kind: 'problem',
      title: 'Featured in a newsletter',
      body: [
        'A popular cooking newsletter links the app. Within an hour 50,000 people arrive. CPU pins at 98%, requests queue, and many time out before they’re served.',
        'The code didn’t get worse — there is simply more work than one machine can do per second.',
      ],
      changes: [{ text: 'Users 2k → 50k', tone: 'bad' }, { text: 'CPU 98%, timeouts', tone: 'bad' }],
      scene: {
        nodes: [users(20, '50k users'), one({ load: 98, state: 'hot', tag: pill('timeouts', 'alert', 'bad') }), store],
        links: [link('users', 's1'), link('s1', 'db', { arrow: 'both' })],
        flows: [flow(['users', 's1'], { back: true, rate: 4, speed: 0.6 }), flow(['users', 's1'], { kind: 'fail', rate: 1.5 })],
        metrics: { users: '50k', rps: '500/s', cpu: { v: '98%', tone: 'bad' }, cost: '$40', healthy: '1 / 1' },
      },
    },
    {
      short: 'Scale up',
      kind: 'technique',
      title: 'Scale up: buy a bigger box',
      body: [
        '<b>Vertical scaling</b>: resize to a 32-vCPU machine with 8× the memory. No code changes, no new failure modes, no distributed anything. CPU drops to 25% and the timeouts vanish.',
        'It is usually the cheapest first move in engineering time — and modern hardware goes surprisingly far. Many successful products run their primary database on one very large machine.',
      ],
      changes: [{ text: '4 → 32 vCPU', tone: 'good' }, { text: 'CPU 98% → 25%', tone: 'good' }, { text: 'Cost $40 → $560', tone: 'bad' }],
      concepts: [{ term: 'Vertical scaling', def: 'Adding CPU, memory or disk to a single machine to increase its capacity.' }],
      scene: {
        nodes: [users(20, '50k users'), one({ load: 25, size: [2.3, 2.3], height: 70, sub: '32 vCPU' }), store],
        links: [link('users', 's1'), link('s1', 'db', { arrow: 'both' })],
        flows: [flow(['users', 's1'], { back: true, rate: 4 })],
        metrics: { users: '50k', rps: '500/s', cpu: { v: '25%', tone: 'good' }, cost: '$560', healthy: '1 / 1' },
      },
    },
    {
      short: 'Ceiling',
      kind: 'tradeoff',
      title: 'The ceiling, and the price curve',
      body: [
        'Growth continues. The next resize is to the largest instance the cloud offers — and after that there is nothing bigger to buy. Price also climbs <b>faster than capacity</b> near the top: the biggest machines cost a premium per core.',
        'Each resize also means a restart. With one server, that is a scheduled outage every time you grow.',
      ],
      changes: [{ text: 'Largest instance: 192 vCPU', tone: 'bad' }, { text: 'Cost $9,800/mo', tone: 'bad' }],
      scene: {
        nodes: [users(24, '400k users'), one({ load: 82, size: [2.8, 2.8], height: 92, sub: '192 vCPU · max', tag: pill('no bigger size', 'alert', 'warn') }), store],
        links: [link('users', 's1'), link('s1', 'db', { arrow: 'both' })],
        flows: [flow(['users', 's1'], { back: true, rate: 6 })],
        metrics: { users: '400k', rps: '4k/s', cpu: { v: '82%', tone: 'warn' }, cost: { v: '$9.8k', tone: 'bad' }, healthy: '1 / 1' },
      },
    },
    {
      short: 'One failure',
      kind: 'problem',
      title: 'One machine, one point of failure',
      body: [
        'At 2 a.m. the host under the VM has a hardware fault. The one server disappears — and with it, the entire product. Every user gets an error until a replacement boots and warms up.',
        'However large, a single server is a <b>single point of failure</b>: its availability caps yours. Kernel patches, disk failures and bad deploys all take everything down.',
      ],
      changes: [{ text: 'Host failure', tone: 'bad' }, { text: 'Availability: 0%', tone: 'bad' }],
      concepts: [{ term: 'Single point of failure', def: 'A component whose failure alone stops the whole system.' }],
      scene: {
        nodes: [users(24, '400k users'), one({ size: [2.8, 2.8], height: 92, sub: '192 vCPU', state: 'down', tag: pill('host failure', 'alert', 'bad') }), store],
        links: [link('users', 's1', { style: 'broken' }), link('s1', 'db', { style: 'dashed' })],
        flows: [flow(['users', 's1'], { kind: 'fail', rate: 4 })],
        metrics: { users: '400k', rps: { v: '0/s', tone: 'bad' }, cpu: '—', cost: '$9.8k', healthy: { v: '0 / 1', tone: 'bad' } },
      },
    },
    {
      short: 'Scale out',
      kind: 'technique',
      title: 'Scale out: many ordinary machines',
      body: [
        '<b>Horizontal scaling</b>: run the app on several identical, modest servers and spread requests across them. Capacity grows by adding machines; there is no hardware ceiling, and commodity sizes are cheaper per core.',
        'Just as important, losing one server now costs a third of capacity instead of all of it. The prerequisite: any server must be able to handle any request — which forces the database onto its own machine and state out of the app servers.',
      ],
      note: { kind: 'warn', text: 'Something must decide which server gets each request. That job — the load balancer — is the next lesson.' },
      changes: [{ text: '3 × 16 vCPU servers', tone: 'good' }, { text: 'Cost $9.8k → $2.4k', tone: 'good' }, { text: 'Survives one failure', tone: 'good' }],
      concepts: [{ term: 'Horizontal scaling', def: 'Adding more machines and distributing work across them.' }],
      scene: {
        nodes: [users(24, '400k users'), ...fleet([55, 52, 57]), store],
        links: [link('users', 's1'), link('users', 's2'), link('users', 's3'), link('s1', 'db'), link('s2', 'db'), link('s3', 'db')],
        flows: [flow(['users', 's1'], { back: true, rate: 2 }), flow(['users', 's2'], { back: true, rate: 2 }), flow(['users', 's3'], { back: true, rate: 2 })],
        metrics: { users: '400k', rps: '4k/s', cpu: '55%', cost: { v: '$2.4k', tone: 'good' }, healthy: { v: '3 / 3', tone: 'good' } },
      },
    },
    {
      short: 'Night time',
      kind: 'problem',
      title: 'Paying for idle machines at night',
      body: [
        'Traffic follows the sun: at 4 a.m. it is a tenth of the evening peak. The fleet, sized for 9 p.m., sits at 6% CPU for hours.',
        'Static capacity forces a choice: size for the peak and waste money most of the day, or size for the average and fall over every evening.',
      ],
      changes: [{ text: 'Night CPU: 6%', tone: 'bad' }, { text: 'Paying for peak 24/7', tone: 'bad' }],
      scene: {
        nodes: [users(3, '4 a.m.'), ...fleet([6, 5, 7]), store],
        links: [link('users', 's1'), link('users', 's2'), link('users', 's3'), link('s1', 'db'), link('s2', 'db'), link('s3', 'db')],
        flows: [flow(['users', 's2'], { back: true, rate: 0.6 })],
        metrics: { users: '40k', rps: '400/s', cpu: { v: '6%', tone: 'warn' }, cost: '$2.4k', healthy: '3 / 3' },
      },
    },
    {
      short: 'Autoscale',
      kind: 'technique',
      title: 'Let the fleet breathe',
      body: [
        'An <b>autoscaling group</b> watches a metric — say, average CPU — and adds or removes servers to hold it near a target like 55%. At night the fleet shrinks to the minimum of two; in the evening it grows to five.',
        'Because servers are identical and disposable, the group just launches more from the same image. Cost now tracks traffic instead of the worst hour of the week.',
      ],
      note: { kind: 'tip', text: 'Keep a floor of at least two instances in different zones, so a single failure never takes you to zero. Use a cooldown so the group doesn’t flap up and down.' },
      changes: [{ text: 'Target CPU 55%', tone: 'good' }, { text: '2–5 servers on demand', tone: 'good' }, { text: 'Cost −40%', tone: 'good' }],
      concepts: [{ term: 'Autoscaling', def: 'Automatically adjusting instance count to keep a metric (CPU, queue depth, latency) near a target.' }],
      scene: {
        nodes: [users(20, '9 p.m.'), ...fleet([54, 56, 53, 55, 57]), store],
        links: ['s1', 's2', 's3', 's4', 's5'].flatMap((s) => [link('users', s), link(s, 'db')]),
        flows: ['s1', 's2', 's3', 's4', 's5'].map((s) => flow(['users', s], { back: true, rate: 1.3 })),
        metrics: { users: '400k', rps: '4k/s', cpu: { v: '55%', tone: 'good' }, cost: { v: '$1.5k', tone: 'good' }, healthy: '5 / 5' },
      },
    },
    {
      short: 'Flash sale',
      kind: 'case',
      title: 'Case: autoscaling is too slow for a cliff',
      body: [
        'A flash sale starts at noon sharp; traffic goes from 1× to 8× in thirty seconds. Autoscaling notices after its metric window, then new servers need about three minutes to boot and warm caches. Those minutes are an outage.',
        'Autoscaling follows <b>gradual</b> curves well and <b>step changes</b> badly. For known events, scale ahead of time; for unknown ones, keep headroom and be able to shed or queue load gracefully.',
      ],
      changes: [{ text: 'Traffic ×8 in 30 s', tone: 'bad' }, { text: 'New servers booting (3 min)', tone: 'bad' }],
      scene: {
        nodes: [users(24, 'noon sale'), ...fleet([99, 98, 0, 0]).map((n, i) => (i >= 2 ? { ...n, state: 'ghost' as const, load: undefined, tag: pill('booting…', 'timer', 'warn') } : { ...n, state: 'hot' as const })), store],
        links: [link('users', 's1'), link('users', 's2'), link('users', 's3', { style: 'dashed' }), link('users', 's4', { style: 'dashed' }), link('s1', 'db'), link('s2', 'db')],
        flows: [flow(['users', 's1'], { back: true, rate: 3, speed: 0.6 }), flow(['users', 's2'], { back: true, rate: 3, speed: 0.6 }), flow(['users', 's1'], { kind: 'fail', rate: 1.5 }), flow(['users', 's2'], { kind: 'fail', rate: 1.5 })],
        metrics: { users: '1.2M', rps: '9k/s', cpu: { v: '99%', tone: 'bad' }, cost: '$1.5k', healthy: { v: '2 / 4', tone: 'warn' } },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Up first, then out',
      body: [
        '<b>Scale up</b> while it’s cheap and simple — it buys time with zero architectural change. Its limits are a hard ceiling, a steep price curve, restarts, and a single point of failure.',
        '<b>Scale out</b> with identical, stateless servers for unbounded capacity and redundancy. Add <b>autoscaling</b> to match cost to the daily curve, and pre-scale for cliffs it can’t react to.',
      ],
      scene: {
        nodes: [users(16, 'traffic'), ...fleet([50, 52, 48], { tag: undefined }), { ...store, tag: pill('next bottleneck?', 'db', 'warn') }],
        links: [link('users', 's1'), link('users', 's2'), link('users', 's3'), link('s1', 'db'), link('s2', 'db'), link('s3', 'db')],
        flows: [flow(['users', 's1'], { back: true, rate: 1.5 }), flow(['users', 's2'], { back: true, rate: 1.5 }), flow(['users', 's3'], { back: true, rate: 1.5 })],
        metrics: { users: '400k', rps: '4k/s', cpu: '50%', cost: '$1.5k', healthy: '3 / 3' },
      },
    },
  ],
};

export default lesson;
