import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const shoppers = (n = 14, text = 'checkouts') => crowd('users', -12, 1, n, text);
const shop = (extra: Partial<SceneNode> = {}) => box('shop', -4, 0, 'Checkout', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const q = (extra: Partial<SceneNode> = {}) => box('q', 3, 0, 'Queue', 'yellow', 'queue', { size: [2.2, 1.2], height: 30, ...extra });
const worker = (i: number, extra: Partial<SceneNode> = {}) =>
  box(`w${i}`, 10, -6 + (i - 1) * 6, `Worker ${i}`, 'purple', 'cpu', { size: [1.3, 1.3], height: 34, ...extra });
const smtp = (extra: Partial<SceneNode> = {}) => box('smtp', 15, 0, 'Email API', 'teal', 'cloud', { size: [1.4, 1.4], height: 36, ...extra });
const dlq = (extra: Partial<SceneNode> = {}) => box('dlq', 4, 8, 'Dead letters', 'red', 'alert', { size: [1.6, 1.1], height: 26, ...extra });

const pipeline = (n = 2) => {
  const ws = Array.from({ length: n }, (_, i) => `w${i + 1}`);
  return {
    links: [link('users', 'shop'), link('shop', 'q'), ...ws.map((w) => link('q', w)), ...ws.map((w) => link(w, 'smtp'))],
    flows: [flow(['users', 'shop'], { back: true, rate: 2 }), flow(['shop', 'q'], { kind: 'write', rate: 2 }), ...ws.map((w) => flow(['q', w, 'smtp'], { rate: 2 / n }))],
  };
};

const lesson: Lesson = {
  slug: 'queues',
  title: 'Queues',
  blurb: 'Hand slow work to a queue so users don’t wait on it — then deal with duplicates, poison messages and backlogs.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'p95', label: 'Checkout p95', icon: 'timer' },
    { key: 'depth', label: 'Queue depth', icon: 'queue' },
    { key: 'age', label: 'Oldest msg', icon: 'clock' },
    { key: 'failed', label: 'Lost / dup', icon: 'alert' },
  ],
  goals: [
    { text: 'Decoupling slow work with a queue', step: 2 },
    { text: 'Absorbing bursts and draining backlogs', step: 3 },
    { text: 'Acks, visibility timeouts and at-least-once delivery', step: 5 },
    { text: 'Dead-letter queues for poison messages', step: 6 },
    { text: 'Scaling on queue age and keeping order by key', step: 8 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  steps: [
    {
      short: 'Inline',
      kind: 'problem',
      title: 'Checkout waits for the receipt email',
      body: [
        'After payment, checkout renders a PDF receipt and sends it through an email provider before responding. On a good day that adds 1.5 s; when the provider is slow, checkout takes 6 s — and when it’s down, checkouts <b>fail</b>, even though the payment went through.',
        'The customer doesn’t need the email to have been sent before they see “order confirmed”. The work just needs to happen <i>soon</i>, reliably.',
      ],
      changes: [{ text: 'Checkout p95: 6.1 s', tone: 'bad' }, { text: 'Email outage = checkout outage', tone: 'bad' }],
      scene: {
        nodes: [shoppers(), shop({ load: 80, tag: pill('render PDF + send', 'file', 'warn') }), smtp({ at: [3, 3] as [number, number], state: 'hot', tag: pill('slow: 4 s', 'clock', 'bad') })],
        links: [link('users', 'shop'), link('shop', 'smtp', { arrow: 'both' })],
        flows: [flow(['users', 'shop', 'smtp'], { back: true, rate: 1.4, speed: 0.4 }), flow(['shop', 'smtp'], { kind: 'fail', rate: 0.4 })],
        metrics: { p95: { v: '6.1 s', tone: 'bad' }, depth: '—', age: '—', failed: { v: '2% checkouts', tone: 'bad' } },
      },
    },
    {
      short: 'Enqueue',
      kind: 'technique',
      title: 'Put a queue in between',
      body: [
        'Checkout now writes a small message — <code>{ "type": "send_receipt", "order": 81733 }</code> — to a <b>queue</b> and responds immediately. Separate <b>worker</b> processes pull messages, render the PDF and call the email API at their own pace.',
        'The producer and consumer no longer need to be up, fast, or scaled at the same moment. An email outage now delays receipts instead of breaking checkout.',
      ],
      changes: [{ text: 'Checkout p95 6.1 s → 180 ms', tone: 'good' }, { text: 'Email outage → receipts delayed', tone: 'good' }],
      concepts: [
        { term: 'Message queue', def: 'A durable buffer where producers put messages and consumers take them, decoupling the two in time.' },
        { term: 'Asynchronous processing', def: 'Doing work after responding to the user, typically via a queue and background workers.' },
      ],
      scene: {
        nodes: [shoppers(), shop({ load: 30 }), q({ tag: pill('3 waiting', 'queue') }), worker(1), worker(2), smtp()],
        ...pipeline(2),
        metrics: { p95: { v: '180 ms', tone: 'good' }, depth: '3', age: '0.4 s', failed: '0' },
      },
    },
    {
      short: 'Burst',
      kind: 'insight',
      title: 'The queue absorbs the spike',
      body: [
        'A flash sale produces 2,000 checkouts a second for five minutes. Workers can send 300 receipts a second. Without a queue, something would have to fall over; with one, the backlog simply <b>grows</b> — to about 500,000 messages — while checkout stays fast.',
        'When the sale ends, workers drain the backlog over the next half hour. The queue turned a peak the email side couldn’t handle into a delay it can.',
      ],
      note: { kind: 'key', text: 'A queue lets each side be sized for the average rate instead of the peak — as long as the backlog eventually drains.' },
      changes: [{ text: 'In 2,000/s, out 300/s', tone: 'bad' }, { text: 'Backlog 500k, draining', tone: 'good' }],
      concepts: [{ term: 'Load levelling', def: 'Using a buffer so a consumer processes a bursty input at a steady rate.' }],
      scene: {
        nodes: [shoppers(24, 'flash sale'), shop({ load: 55 }), q({ size: [3.4, 1.4], tag: pill('500k waiting', 'queue', 'warn') }), worker(1, { load: 95 }), worker(2, { load: 95 }), smtp()],
        links: pipeline(2).links,
        flows: [flow(['users', 'shop'], { back: true, rate: 6 }), flow(['shop', 'q'], { kind: 'write', rate: 6 }), flow(['q', 'w1', 'smtp'], { rate: 1 }), flow(['q', 'w2', 'smtp'], { rate: 1 })],
        metrics: { p95: '210 ms', depth: { v: '500k', tone: 'warn' }, age: { v: '4 min', tone: 'warn' }, failed: '0' },
      },
    },
    {
      short: 'Crash',
      kind: 'problem',
      title: 'A worker dies mid-job',
      body: [
        'Worker 2 takes a message, renders the PDF, and is killed by a deploy before calling the email API. If the queue deleted messages the moment they were handed out, that receipt is gone forever.',
        'So queues don’t delete on delivery. A delivered message becomes <b>invisible</b> for a timeout (say 60 s). The worker must <b>acknowledge</b> it when done; if no ack arrives in time, the message reappears for another worker.',
      ],
      changes: [{ text: 'Worker killed before ack', tone: 'bad' }, { text: 'Message reappears after 60 s', tone: 'good' }],
      concepts: [
        { term: 'Acknowledgement', def: 'A consumer’s signal that a message is fully processed and may be deleted.' },
        { term: 'Visibility timeout', def: 'How long a delivered, unacknowledged message stays hidden before being redelivered.' },
      ],
      scene: {
        nodes: [shoppers(), shop({ load: 30 }), q({ tag: pill('msg 81733 invisible 60 s', 'clock') }), worker(1), worker(2, { state: 'down', tag: pill('killed', 'alert', 'bad') }), smtp()],
        links: [link('users', 'shop'), link('shop', 'q'), link('q', 'w1'), link('q', 'w2', { style: 'broken' }), link('w1', 'smtp')],
        flows: [flow(['shop', 'q'], { kind: 'write', rate: 1.5 }), flow(['q', 'w1', 'smtp'], { rate: 1.5 })],
        metrics: { p95: '180 ms', depth: '40', age: '61 s', failed: '0 lost' },
      },
    },
    {
      short: 'Duplicates',
      kind: 'technique',
      title: 'At-least-once means sometimes twice',
      body: [
        'Redelivery has a flip side. Worker 1 sends the email, then stalls in a GC pause past the visibility timeout before acking. The message reappears, worker 2 processes it — and the customer gets two receipts.',
        'Almost every practical queue is <b>at-least-once</b>. Make consumers <b>idempotent</b>: record processed message IDs (or a natural key like <code>receipt:81733</code>) in the same store as the side effect, and skip ones already done.',
      ],
      note: { kind: 'warn', text: '“Exactly-once delivery” across a network isn’t achievable in general. What systems really offer is at-least-once delivery plus idempotent processing — effectively-once.' },
      changes: [{ text: 'Duplicate delivery', tone: 'bad' }, { text: 'Dedupe on receipt:81733', tone: 'good' }],
      concepts: [
        { term: 'At-least-once delivery', def: 'Every message is delivered one or more times; duplicates are possible, losses are not.' },
        { term: 'Idempotent consumer', def: 'A consumer that produces the same outcome when processing a message more than once.' },
      ],
      scene: {
        nodes: [shoppers(), shop({ load: 30 }), q(), worker(1, { tag: pill('sent, ack late', 'clock', 'warn') }), worker(2, { tag: pill('already sent → skip', 'check', 'good') }), smtp()],
        ...pipeline(2),
        metrics: { p95: '180 ms', depth: '12', age: '1 s', failed: { v: '0 dup sent', tone: 'good' } },
      },
    },
    {
      short: 'Poison',
      kind: 'case',
      title: 'Case: the message that always fails',
      body: [
        'One order has a malformed address that crashes the PDF renderer. The worker dies, the message reappears, the next worker dies… Forever. Worse, it keeps workers busy and can block messages behind it.',
        'Cap attempts: after, say, 5 failed deliveries, move the message to a <b>dead-letter queue</b>. Alert on DLQ depth, inspect and fix, then replay. Add exponential backoff between retries so a temporarily failing dependency isn’t hammered.',
      ],
      changes: [{ text: '5 attempts → dead-letter queue', tone: 'good' }],
      concepts: [{ term: 'Dead-letter queue', def: 'A side queue holding messages that repeatedly failed processing, for inspection and replay.' }],
      scene: {
        nodes: [shoppers(), shop({ load: 30 }), q(), worker(1), worker(2), smtp(), dlq({ tag: pill('order 81902 · 5 attempts', 'alert', 'bad') })],
        links: [...pipeline(2).links, link('q', 'dlq', { label: pill('after 5 tries') })],
        flows: [...pipeline(2).flows, flow(['q', 'dlq'], { kind: 'fail', rate: 0.3 })],
        metrics: { p95: '180 ms', depth: '9', age: '1 s', failed: { v: '1 in DLQ', tone: 'warn' } },
      },
    },
    {
      short: 'Backlog',
      kind: 'problem',
      title: 'When the backlog never drains',
      body: [
        'A queue hides overload — it doesn’t remove it. After a marketing push, input averages 400 receipts a second for days while workers do 300. The backlog grows by 360,000 an hour; receipts arrive a day late and the broker’s disk fills.',
        'Watch <b>oldest message age</b>, not just depth: it’s the latency your users actually feel. Autoscale workers on it, and decide in advance what to shed or degrade when you can’t catch up.',
      ],
      note: { kind: 'tip', text: 'Queue depth means little without throughput: 100k messages is 10 seconds of work for one system and three days for another. Age is comparable everywhere.' },
      changes: [{ text: 'In 400/s > out 300/s', tone: 'bad' }, { text: 'Oldest message: 19 h', tone: 'bad' }],
      concepts: [{ term: 'Backpressure', def: 'Signalling upstream to slow down (or shedding work) when downstream can’t keep up.' }],
      scene: {
        nodes: [shoppers(18), shop({ load: 40 }), q({ size: [3.8, 1.5], state: 'hot', tag: pill('oldest: 19 h', 'clock', 'bad') }), worker(1, { load: 99 }), worker(2, { load: 99 }), worker(3, { state: 'ghost', tag: pill('scaling on age', 'activity', 'warn') }), smtp()],
        links: [...pipeline(2).links, link('q', 'w3', { style: 'dashed' })],
        flows: [flow(['shop', 'q'], { kind: 'write', rate: 4 }), flow(['q', 'w1', 'smtp'], { rate: 1.4 }), flow(['q', 'w2', 'smtp'], { rate: 1.4 })],
        metrics: { p95: '180 ms', depth: { v: '6.8M', tone: 'bad' }, age: { v: '19 h', tone: 'bad' }, failed: '0' },
      },
    },
    {
      short: 'Ordering',
      kind: 'tradeoff',
      title: 'Parallel consumers scramble order',
      body: [
        'Order status updates — “paid”, “shipped”, “delivered” — go through the same queue. With three workers in parallel, “delivered” can be processed before “shipped”, and the customer’s timeline goes backwards.',
        'Ordering and parallelism pull against each other. Usually you only need order <b>per key</b>: route messages by order ID into ordered groups (FIFO message groups, or partitions keyed by ID) so one order’s updates are handled in sequence while different orders still run in parallel.',
      ],
      concepts: [{ term: 'Per-key ordering', def: 'Guaranteeing order only among messages that share a key, allowing parallelism across keys.' }],
      scene: {
        nodes: [shoppers(), shop({ load: 30 }), q({ tag: pill('group by order_id', 'key', 'good') }), worker(1, { tag: pill('orders …1, …4', 'list') }), worker(2, { tag: pill('orders …2, …5', 'list') }), worker(3, { tag: pill('orders …3, …6', 'list') }), smtp()],
        ...pipeline(3),
        metrics: { p95: '180 ms', depth: '20', age: '0.5 s', failed: '0' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Respond now, work soon, never lose it',
      body: [
        'A <b>queue</b> decouples users from slow or flaky work and levels bursts. Reliability comes from <b>acks</b> and <b>visibility timeouts</b>, which make delivery at-least-once — so consumers must be <b>idempotent</b>. <b>Dead-letter queues</b> catch poison messages.',
        'Monitor oldest-message age, autoscale consumers on it, and get ordering per key rather than globally.',
      ],
      scene: {
        nodes: [shoppers(), shop({ load: 30 }), q({ tag: pill('ack · retry · DLQ', 'shield', 'good') }), worker(1), worker(2), smtp(), dlq()],
        links: [...pipeline(2).links, link('q', 'dlq', { style: 'dashed' })],
        flows: pipeline(2).flows,
        metrics: { p95: '180 ms', depth: '5', age: '0.4 s', failed: '0' },
      },
    },
  ],
};

export default lesson;
