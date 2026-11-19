import type { Lesson } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const users = (n: number, text: string) => crowd('users', -8, 1, n, text);
const api = (load: number, extra = {}) => box('api', 0, 0, 'Search API', 'blue', 'server', { load, ...extra });
const api2 = (load: number) => box('api2', 1, 5, 'Search API', 'blue', 'server', { load, sub: 'replica 2' });
const store = db('db', 8, -1, 'Index');

const lesson: Lesson = {
  slug: 'latency-throughput',
  title: 'Latency & Throughput',
  blurb: 'How fast one request is versus how many you can serve — and why pushing one quietly wrecks the other.',
  minutes: 10,
  level: 'Beginner',
  metrics: [
    { key: 'rps', label: 'Throughput', icon: 'activity' },
    { key: 'p50', label: 'p50', icon: 'timer' },
    { key: 'p99', label: 'p99', icon: 'timer' },
    { key: 'util', label: 'Utilisation', icon: 'cpu' },
    { key: 'inflight', label: 'In flight', icon: 'layers' },
  ],
  goals: [
    { text: 'The difference between latency and throughput', step: 1 },
    { text: 'Why latency explodes as utilisation nears 100%', step: 3 },
    { text: 'Why percentiles beat averages', step: 4 },
    { text: 'Little’s Law for sizing concurrency', step: 6 },
    { text: 'Fan-out tail amplification and batching trade-offs', step: 8 },
  ],
  legend: ['request', 'response', 'heavy'],
  steps: [
    {
      short: 'Two numbers',
      kind: 'insight',
      title: 'Two numbers that are easy to confuse',
      body: [
        '<b>Latency</b> is how long one request takes, start to finish. <b>Throughput</b> is how many requests the system completes per second. A motorway’s speed limit is its latency; its number of lanes sets its throughput.',
        'Our ticket-search API is quiet: 200 requests per second, each answered in about 20 ms. Both numbers look great — for now.',
      ],
      note: { kind: 'key', text: 'Improving one doesn’t automatically improve the other. Adding lanes doesn’t make any single car faster; raising the speed limit doesn’t add lanes.' },
      concepts: [
        { term: 'Latency', def: 'Time for a single operation to complete, usually measured at the client.' },
        { term: 'Throughput', def: 'Completed operations per unit of time, e.g. requests per second.' },
      ],
      scene: {
        nodes: [users(6, '200 req/s'), api(20), store],
        links: [link('users', 'api'), link('api', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'api'], { back: true, rate: 1.4 }), flow(['api', 'db'], { back: true, rate: 1.4 })],
        metrics: { rps: '200/s', p50: '20 ms', p99: '35 ms', util: '20%', inflight: '4' },
      },
    },
    {
      short: 'Busier',
      kind: 'problem',
      title: 'A concert goes on sale',
      body: [
        'Traffic triples to 600 requests per second. The server is now busy 60% of the time. Median latency barely moves — 24 ms — but the slowest requests start to stretch to 60 ms.',
        'Why would any request get slower when the work per request is identical? Because requests now sometimes <b>arrive while the server is busy</b>, and wait in a queue.',
      ],
      changes: [{ text: 'Throughput 200 → 600/s' }, { text: 'p99 35 → 60 ms', tone: 'bad' }],
      concepts: [{ term: 'Queueing delay', def: 'Time a request spends waiting for a busy resource before work on it starts.' }],
      scene: {
        nodes: [users(14, '600 req/s'), api(60, { tag: pill('queue: 3', 'queue') }), store],
        links: [link('users', 'api'), link('api', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'api'], { back: true, rate: 3.5 }), flow(['api', 'db'], { back: true, rate: 3.5 })],
        metrics: { rps: '600/s', p50: '24 ms', p99: { v: '60 ms', tone: 'warn' }, util: '60%', inflight: '14' },
      },
    },
    {
      short: 'The knee',
      kind: 'insight',
      title: 'The hockey stick',
      body: [
        'At 900 requests per second the server is 90% busy and latency doesn’t rise gently — it <b>bends upward</b>. Median 80 ms, p99 almost a second. Throughput has nearly stopped growing.',
        'Queueing theory explains the curve: for a simple queue, waiting time scales with <code>ρ / (1 − ρ)</code>, where ρ is utilisation. At 50% that factor is 1; at 90% it is 9; at 99% it is 99. The last few percent of capacity are paid for in latency.',
      ],
      note: { kind: 'warn', text: 'This is why healthy services are deliberately run at 50–70% utilisation. “Only 80% busy” can already mean users are queueing.' },
      changes: [{ text: 'Utilisation 90%', tone: 'bad' }, { text: 'p99 ≈ 900 ms', tone: 'bad' }],
      concepts: [{ term: 'Utilisation', def: 'Fraction of time a resource is busy; latency grows non-linearly as it approaches 100%.' }],
      scene: {
        nodes: [users(22, '900 req/s'), api(90, { state: 'hot', tag: pill('queue: 70', 'queue', 'bad') }), store],
        links: [link('users', 'api'), link('api', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'api'], { back: true, rate: 5.5, speed: 0.7 }), flow(['api', 'db'], { back: true, rate: 4 })],
        metrics: { rps: '900/s', p50: { v: '80 ms', tone: 'warn' }, p99: { v: '900 ms', tone: 'bad' }, util: { v: '90%', tone: 'bad' }, inflight: '72' },
      },
    },
    {
      short: 'Percentiles',
      kind: 'insight',
      title: 'Averages hide the people who suffer',
      body: [
        'The dashboard’s <i>average</i> latency reads 95 ms — sounds fine. But averages blend thousands of fast requests with a few terrible ones. <b>Percentiles</b> answer the real question: p50 is what a typical request sees, p99 is what the unluckiest 1% see.',
        'And it compounds: a page that makes 30 backend calls hits at least one p99 response <code>1 − 0.99³⁰ ≈ 26%</code> of the time. The tail is not rare for users; it is a quarter of page loads.',
      ],
      note: { kind: 'tip', text: 'Store latency as histograms, not averages, so you can compute any percentile later. Never average percentiles across servers — merge the histograms instead.' },
      concepts: [
        { term: 'p99', def: 'The 99th percentile: 99% of requests were at least this fast.' },
        { term: 'Tail latency', def: 'The slow end of the latency distribution (p99, p99.9) that a small but real share of users experience.' },
      ],
      scene: {
        nodes: [users(22, '900 req/s'), api(90, { state: 'hot', tag: pill('avg 95 ms · p99 900 ms', 'activity', 'warn') }), store],
        links: [link('users', 'api'), link('api', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'api'], { back: true, rate: 4.5 }), flow(['users', 'api'], { kind: 'heavy', back: true, rate: 0.4, speed: 0.5 })],
        metrics: { rps: '900/s', p50: { v: '80 ms', tone: 'warn' }, p99: { v: '900 ms', tone: 'bad' }, util: { v: '90%', tone: 'bad' }, inflight: '72' },
      },
    },
    {
      short: 'Capacity',
      kind: 'technique',
      title: 'Add capacity, not speed',
      body: [
        'A second replica splits the traffic. Each server now runs at 45% — back on the flat part of the curve — and both p50 and p99 drop to near their quiet-day values.',
        'Notice what changed: the work per request is the same, so the best-case latency is the same. We raised the <b>throughput ceiling</b>, and that removed the queueing that was inflating latency.',
      ],
      changes: [{ text: '+1 replica', tone: 'good' }, { text: 'Utilisation 90% → 45%', tone: 'good' }, { text: 'p99 900 → 48 ms', tone: 'good' }],
      scene: {
        nodes: [users(22, '900 req/s'), api(45), api2(45), store],
        links: [link('users', 'api'), link('users', 'api2'), link('api', 'db', { arrow: 'both' }), link('api2', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'api'], { back: true, rate: 2.6 }), flow(['users', 'api2'], { back: true, rate: 2.6 })],
        metrics: { rps: '900/s', p50: '22 ms', p99: { v: '48 ms', tone: 'good' }, util: { v: '45%', tone: 'good' }, inflight: '20' },
      },
    },
    {
      short: 'Little’s Law',
      kind: 'technique',
      title: 'Little’s Law: how much is in flight',
      body: [
        'A remarkably general rule ties the three numbers together: <b>L = λ × W</b>. Items in the system equal arrival rate times time spent inside. At 900 req/s and 22 ms each, about <code>900 × 0.022 ≈ 20</code> requests are in progress at any instant.',
        'That tells you how big connection pools, thread pools and worker counts must be. Too few and requests queue for a slot; too many and they all contend for the same CPU or database.',
      ],
      note: { kind: 'warn', text: 'Little’s Law runs backwards in an incident: if a dependency slows from 20 ms to 2 s, in-flight requests jump 100× at the same traffic — and exhaust every pool along the way.' },
      concepts: [{ term: 'Little’s Law', def: 'L = λW: average items in a system equals arrival rate × average time in the system.' }],
      scene: {
        nodes: [users(22, 'λ = 900 req/s'), api(45, { tag: pill('L ≈ 10 in flight', 'layers') }), api2(45), { ...store, tag: pill('W = 22 ms', 'timer') }],
        links: [link('users', 'api'), link('users', 'api2'), link('api', 'db', { arrow: 'both' }), link('api2', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'api', 'db'], { back: true, rate: 2.6 }), flow(['users', 'api2', 'db'], { back: true, rate: 2.6 })],
        metrics: { rps: '900/s', p50: '22 ms', p99: '48 ms', util: '45%', inflight: { v: '20', tone: 'good' } },
      },
    },
    {
      short: 'Fan-out',
      kind: 'problem',
      title: 'Fan-out: waiting for the slowest',
      body: [
        'Search results are assembled from five shards queried in parallel. Parallel sounds fast — but the request finishes only when the <b>slowest</b> shard answers.',
        'If each shard is slow 1% of the time, a 5-way fan-out is slow about 5% of the time; a 100-way fan-out is slow 63% of the time. Big fan-outs turn rare tail latency into the common case.',
      ],
      note: { kind: 'tip', text: 'Defences: hedged requests (send a duplicate to another replica after the p95 time), tighter per-shard timeouts with partial results, and reducing fan-out width.' },
      concepts: [{ term: 'Hedged request', def: 'Sending a backup copy of a slow request to another replica and using whichever answers first.' }],
      scene: {
        nodes: [
          crowd('users', -9, 1, 10, '900 req/s'),
          box('api', -2, 0, 'Search API', 'blue', 'server', { load: 40 }),
          box('s1', 6, -7, 'Shard 1', 'purple', 'db', { size: [1.3, 1.3], height: 36 }),
          box('s2', 8, -3, 'Shard 2', 'purple', 'db', { size: [1.3, 1.3], height: 36 }),
          box('s3', 8, 1, 'Shard 3', 'purple', 'db', { size: [1.3, 1.3], height: 36, state: 'hot', tag: pill('slow: 400 ms', 'clock', 'bad') }),
          box('s4', 7, 5, 'Shard 4', 'purple', 'db', { size: [1.3, 1.3], height: 36 }),
          box('s5', 4, 8, 'Shard 5', 'purple', 'db', { size: [1.3, 1.3], height: 36 }),
        ],
        links: ['s1', 's2', 's3', 's4', 's5'].map((s) => link('api', s, { arrow: 'both' })).concat([link('users', 'api')]),
        flows: [
          flow(['users', 'api'], { back: true, rate: 1.2 }),
          ...['s1', 's2', 's4', 's5'].map((s) => flow(['api', s], { back: true, rate: 1.2 })),
          flow(['api', 's3'], { kind: 'heavy', back: true, rate: 0.6, speed: 0.4 }),
        ],
        metrics: { rps: '900/s', p50: '30 ms', p99: { v: '410 ms', tone: 'bad' }, util: '40%', inflight: '27' },
      },
    },
    {
      short: 'Batching',
      kind: 'tradeoff',
      title: 'Batching: buy throughput with latency',
      body: [
        'Analytics events don’t need to be written one by one. Collecting them for up to 50 ms and writing 500 at a time cuts per-write overhead — network round trips, fsyncs, index updates — by two orders of magnitude.',
        'The price is that each event waits up to 50 ms before it is stored. Batching deliberately <b>adds latency to gain throughput</b>; it is the right call when nobody is waiting on the individual item.',
      ],
      note: { kind: 'key', text: 'The same trade appears everywhere: TCP’s Nagle algorithm, group commit in databases, Kafka producer linger, GPU inference batching.' },
      concepts: [{ term: 'Batching', def: 'Grouping many small operations into one larger one to amortise fixed per-operation costs.' }],
      scene: {
        nodes: [
          users(22, '20k events/s'),
          box('api', 0, 0, 'Collector', 'teal', 'queue', { load: 30, tag: pill('linger 50 ms', 'timer') }),
          { ...store, name: 'Events', tag: pill('40 writes/s', 'db', 'good') },
        ],
        links: [link('users', 'api'), link('api', 'db', { label: pill('× 500 per batch', 'layers') })],
        flows: [flow(['users', 'api'], { rate: 7 }), flow(['api', 'db'], { kind: 'heavy', rate: 0.8 })],
        metrics: { rps: { v: '20k/s', tone: 'good' }, p50: '+25 ms', p99: '+50 ms', util: '30%', inflight: '—' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Latency and throughput, together',
      body: [
        'Latency is per request; throughput is per second. They are linked through <b>queueing</b>: as utilisation approaches 100%, waiting time grows without bound, so a saturated system has both poor throughput growth and terrible latency.',
        'Measure with percentiles, keep headroom, size concurrency with <b>Little’s Law</b>, watch fan-out amplify the tail, and batch only where nobody is waiting on the single item.',
      ],
      scene: {
        nodes: [users(14, 'traffic'), api(55, { tag: pill('keep 30–50% headroom', 'gauge', 'good') }), api2(55), { ...store, tag: pill('p99, not average', 'activity') }],
        links: [link('users', 'api'), link('users', 'api2'), link('api', 'db', { arrow: 'both' }), link('api2', 'db', { arrow: 'both' })],
        flows: [flow(['users', 'api', 'db'], { back: true, rate: 2 }), flow(['users', 'api2', 'db'], { back: true, rate: 2 })],
        metrics: { rps: '900/s', p50: '22 ms', p99: '48 ms', util: '55%', inflight: '20' },
      },
    },
  ],
};

export default lesson;
