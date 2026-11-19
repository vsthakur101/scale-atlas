import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, patch, pill } from '../kit';

const people = crowd('users', -9, 1, 20, '20M daily users');
const app = box('app', -1, 0, 'App tier', 'blue', 'server', { sub: '? servers' });
const meta = db('meta', 6, -5, 'Metadata');
const blobs = disk('blobs', 7, 4, 'photo store', { size: [2, 2], height: 30, tone: 'orange', icon: 'image' });
const cdn = box('cdn', -3, 7, 'CDN', 'teal', 'globe', { size: [1.5, 1.5], height: 40 });

const all: SceneNode[] = [people, app, meta, blobs];
const wires = [link('users', 'app'), link('app', 'meta', { arrow: 'both' }), link('app', 'blobs', { arrow: 'both' })];

const lesson: Lesson = {
  slug: 'estimation',
  title: 'Back-of-the-Envelope Math',
  blurb: 'Size a photo-sharing service in five minutes with round numbers — and know whether you need 3 machines or 300.',
  minutes: 11,
  level: 'Beginner',
  metrics: [
    { key: 'rps', label: 'Avg req/s', icon: 'activity' },
    { key: 'peak', label: 'Peak', icon: 'bolt' },
    { key: 'servers', label: 'Servers', icon: 'server' },
    { key: 'storage', label: 'Storage/yr', icon: 'disk' },
    { key: 'bw', label: 'Egress', icon: 'wifi' },
  ],
  goals: [
    { text: 'Converting daily volumes into requests per second', step: 2 },
    { text: 'Planning for peaks, not averages', step: 3 },
    { text: 'Estimating server count, storage and bandwidth', step: 6 },
    { text: 'Sizing a cache from the hot set', step: 7 },
    { text: 'Latency numbers every engineer should carry', step: 8 },
  ],
  legend: ['request', 'response', 'write'],
  steps: [
    {
      short: 'The question',
      kind: 'problem',
      title: 'Three machines or three hundred?',
      body: [
        'You are designing <b>Snapshelf</b>, a photo-sharing app expected to reach 20 million daily active users. Before choosing databases or drawing boxes, you need the <b>shape</b> of the load: how many requests, how much data, how many bytes leaving the building.',
        'You don’t need precision. You need to be within a factor of ten, quickly, so design decisions rest on numbers instead of vibes.',
      ],
      note: { kind: 'key', text: 'Round aggressively. 86,400 seconds in a day becomes 10⁵. 2.6 becomes 3. The goal is the order of magnitude, and showing your assumptions so others can challenge them.' },
      scene: { nodes: [people, { ...app, sub: '? servers', tag: pill('how big?', 'calc', 'accent') }], links: [link('users', 'app')], flows: [flow(['users', 'app'], { rate: 1.5 })], metrics: {} },
    },
    {
      short: 'Req / s',
      kind: 'technique',
      title: 'From per-day to per-second',
      body: [
        'Assume each user opens the feed and views about 10 photos a day: <code>20M × 10 = 200M</code> reads a day. Divide by 10⁵ seconds: about <b>2,000 reads per second</b>.',
        'Writes: if 1 in 10 users uploads one photo a day, that is 2M uploads a day, or about <b>20 per second</b>. The system is read-heavy by 100 to 1 — a fact that will shape almost every later choice.',
      ],
      changes: [{ text: 'Reads ≈ 2,000/s' }, { text: 'Writes ≈ 20/s' }, { text: 'Read:write ≈ 100:1', tone: 'good' }],
      concepts: [{ term: 'Read/write ratio', def: 'How many reads happen per write; read-heavy systems benefit most from caching and replicas.' }],
      scene: {
        nodes: [people, { ...app, tag: pill('200M reads / 10⁵ s', 'calc', 'accent') }],
        links: [link('users', 'app', { label: pill('2k reads · 20 writes /s') })],
        flows: [flow(['users', 'app'], { back: true, rate: 3 }), flow(['users', 'app'], { kind: 'write', rate: 0.3 })],
        metrics: { rps: '2,000/s' },
      },
    },
    {
      short: 'Peak',
      kind: 'technique',
      title: 'Design for the evening, not the day',
      body: [
        'Traffic is not flat. Most people browse in the evening, so the busiest hour typically runs <b>2–3× the daily average</b>. A viral moment or a holiday can push 5–10×.',
        'Plan for about <b>6,000 reads per second</b> at peak and have a story — autoscaling, shedding, degraded modes — for the spike beyond it.',
      ],
      note: { kind: 'warn', text: 'Systems sized for the average fall over every evening. The 24-hour mean is the least useful number on the dashboard.' },
      changes: [{ text: 'Peak factor ×3' }, { text: 'Design target: 6k req/s', tone: 'bad' }],
      scene: {
        nodes: [{ ...people, count: 24, label: pill('evening peak', 'users') }, { ...app, state: 'hot', tag: pill('×3 at 9 pm', 'bolt', 'warn') }],
        links: [link('users', 'app')],
        flows: [flow(['users', 'app'], { back: true, rate: 7 })],
        metrics: { rps: '2,000/s', peak: { v: '6,000/s', tone: 'warn' } },
      },
    },
    {
      short: 'Servers',
      kind: 'technique',
      title: 'How many servers?',
      body: [
        'Benchmark one app server on a realistic request: say it sustains <b>1,000 req/s</b> before latency degrades. 6,000 ÷ 1,000 = 6 servers flat out.',
        'You never run flat out, so target ~60% utilisation (6 ÷ 0.6 = 10), then add <b>N+2</b> so a failure during a deploy is survivable: <b>12 servers</b>. That’s a rack, not a data centre.',
      ],
      note: { kind: 'tip', text: 'The per-server number must come from a load test of your real code path. A guess here is off by 10× more often than any other input.' },
      changes: [{ text: '6 at 100% → 10 at 60% → 12 with N+2', tone: 'good' }],
      concepts: [{ term: 'N+2', def: 'Provisioning enough to lose two instances (one failing, one being deployed) without overload.' }],
      scene: {
        nodes: [people, { ...app, sub: '12 × 1k req/s', load: 50, tag: pill('6k ÷ 1k ÷ 0.6 + 2', 'calc', 'accent') }],
        links: [link('users', 'app')],
        flows: [flow(['users', 'app'], { back: true, rate: 4 })],
        metrics: { rps: '2,000/s', peak: '6,000/s', servers: { v: '12', tone: 'good' } },
      },
    },
    {
      short: 'Storage',
      kind: 'technique',
      title: 'Storage: photos dwarf everything',
      body: [
        '2M uploads a day at about 2 MB each is <b>4 TB per day</b>, or roughly <b>1.5 PB per year</b>. Store a few resized variants and keep redundant copies, and you are planning for several petabytes.',
        'The metadata — owner, caption, timestamps, about 1 KB per photo — is only 2 GB a day. Two kinds of data, three orders of magnitude apart: they belong in <b>different stores</b>.',
      ],
      changes: [{ text: 'Photos: ~1.5 PB/yr raw', tone: 'bad' }, { text: 'Metadata: ~0.7 TB/yr', tone: 'good' }],
      concepts: [{ term: 'Object storage', def: 'A store for large immutable blobs (S3-style), cheap per byte and replicated for durability.' }],
      scene: {
        nodes: patch(all, {
          blobs: { tag: pill('4 TB / day', 'image', 'warn'), label: pill('object store', 'disk') },
          meta: { tag: pill('2 GB / day', 'db', 'good') },
        }),
        links: wires,
        flows: [flow(['users', 'app', 'blobs'], { kind: 'write', rate: 1 }), flow(['app', 'meta'], { kind: 'write', rate: 1 })],
        metrics: { rps: '2,000/s', peak: '6,000/s', servers: '12', storage: { v: '1.5 PB', tone: 'warn' } },
      },
    },
    {
      short: 'Bandwidth',
      kind: 'technique',
      title: 'Bandwidth: the bill nobody estimated',
      body: [
        'Feeds serve compressed versions of about 200 KB. At 2,000 reads/s that is <code>2,000 × 200 KB = 400 MB/s</code> — roughly <b>3.2 Gbps</b> on average and ~10 Gbps at peak, flowing out to users all day.',
        'At this scale, serving images from your own servers is expensive and far from users. This number is what justifies a <b>CDN</b> in the design, before anyone argues for one on taste.',
      ],
      changes: [{ text: 'Egress ≈ 3 Gbps avg, 10 Gbps peak', tone: 'bad' }, { text: 'CDN in front of images', tone: 'good' }],
      scene: {
        nodes: [...all, cdn],
        links: [...wires, link('blobs', 'cdn'), link('cdn', 'users', { label: pill('10 Gbps peak', 'wifi', 'warn') })],
        flows: [flow(['blobs', 'cdn', 'users'], { kind: 'response', rate: 4 }), flow(['users', 'app'], { rate: 1.5 })],
        metrics: { rps: '2,000/s', peak: '6,000/s', servers: '12', storage: '1.5 PB', bw: { v: '3.2 Gbps', tone: 'warn' } },
      },
    },
    {
      short: 'Cache',
      kind: 'technique',
      title: 'Size the cache from the hot set',
      body: [
        'Popularity is skewed: a small share of photos gets most of the views. If 20% of a day’s items serve 80% of reads, you only need to cache that <b>hot set</b>.',
        'Metadata for 200M daily reads touches maybe 20M distinct photos; 20% of that is 4M entries × 1 KB = <b>4 GB</b>. That fits in the memory of a single cache node — with a replica for safety.',
      ],
      note: { kind: 'tip', text: 'Cache size comes from the working set, not the total data. Petabytes stored can still mean gigabytes hot.' },
      concepts: [{ term: 'Working set', def: 'The subset of data actively accessed in a time window; what a cache must hold to be effective.' }],
      scene: {
        nodes: [...patch(all, {}), box('cache', 1, -7, 'Cache', 'green', 'bolt', { size: [1.4, 1.4], height: 38, tag: pill('4 GB hot set', 'bolt', 'good') })],
        links: [...wires, link('app', 'cache', { arrow: 'both' })],
        flows: [flow(['users', 'app', 'cache'], { kind: 'hit', back: true, rate: 3 }), flow(['app', 'meta'], { back: true, rate: 0.6 })],
        metrics: { rps: '2,000/s', peak: '6,000/s', servers: '12', storage: '1.5 PB', bw: '3.2 Gbps' },
      },
    },
    {
      short: 'Latencies',
      kind: 'insight',
      title: 'Numbers to keep in your head',
      body: [
        'Rough costs, in orders of magnitude: reading main memory ~<b>100 ns</b>; an SSD random read ~<b>100 µs</b>; a round trip inside a data centre ~<b>0.5 ms</b>; a spinning-disk seek ~<b>10 ms</b>; a round trip across a continent ~<b>50–150 ms</b>.',
        'Each step is roughly 100–1000× the previous. That ladder explains why caches live in memory, why chatty services hurt, and why cross-region calls must be rare.',
      ],
      note: { kind: 'key', text: 'Memory is a thousand times faster than SSD, which is a thousand times faster than an ocean. Most performance work is moving data one rung up this ladder.' },
      scene: {
        nodes: [
          box('mem', -8, -2, 'RAM', 'green', 'cpu', { size: [1.3, 1.3], height: 34, label: pill('100 ns', 'timer', 'good') }),
          box('ssd', -3, 1, 'SSD', 'blue', 'disk', { size: [1.3, 1.3], height: 34, label: pill('100 µs', 'timer') }),
          box('dc', 2, 4, 'Same DC', 'yellow', 'server', { size: [1.3, 1.3], height: 34, label: pill('0.5 ms', 'timer') }),
          box('hdd', 7, 1, 'HDD seek', 'orange', 'disk', { size: [1.3, 1.3], height: 34, label: pill('10 ms', 'timer', 'warn') }),
          box('wan', 11, -3, 'Ocean', 'red', 'globe', { size: [1.3, 1.3], height: 34, label: pill('150 ms', 'timer', 'bad') }),
        ],
        links: [link('mem', 'ssd', { style: 'dashed' }), link('ssd', 'dc', { style: 'dashed' }), link('dc', 'hdd', { style: 'dashed' }), link('hdd', 'wan', { style: 'dashed' })],
        metrics: { rps: '2,000/s', peak: '6,000/s', servers: '12', storage: '1.5 PB', bw: '3.2 Gbps' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Snapshelf on one napkin',
      body: [
        '20M DAU → <b>2k reads/s</b>, <b>20 writes/s</b>, <b>6k/s peak</b> → about <b>12 app servers</b>. Photos: <b>~1.5 PB/yr</b> in an object store; metadata: under a terabyte in a database. Egress: <b>~3 Gbps</b>, so images go through a CDN. Hot metadata: <b>~4 GB</b>, so one cache cluster.',
        'Every number is rough, and that’s fine: each one already ruled out a class of designs and justified a component. State assumptions, round hard, and redo the maths when reality disagrees.',
      ],
      scene: {
        nodes: [
          ...patch(all, { app: { sub: '12 servers', load: 55 }, blobs: { tag: pill('1.5 PB/yr', 'image') }, meta: { tag: pill('< 1 TB/yr', 'db') } }),
          { ...cdn, tag: pill('3 Gbps', 'wifi') },
          box('cache', 1, -7, 'Cache', 'green', 'bolt', { size: [1.4, 1.4], height: 38, tag: pill('4 GB', 'bolt') }),
        ],
        links: [...wires, link('blobs', 'cdn'), link('cdn', 'users'), link('app', 'cache', { arrow: 'both' })],
        flows: [flow(['users', 'app', 'cache'], { kind: 'hit', back: true, rate: 2 }), flow(['blobs', 'cdn', 'users'], { kind: 'response', rate: 2.5 })],
        metrics: { rps: '2,000/s', peak: '6,000/s', servers: '12', storage: '1.5 PB', bw: '3.2 Gbps' },
      },
    },
  ],
};

export default lesson;
