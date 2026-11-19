import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -14, 0, 12, 'clients', extra);
const lb = (extra: Partial<SceneNode> = {}) => box('lb', -6, 0, 'Load balancer', 'orange', 'route', { size: [1.3, 1.3], height: 30, ...extra });
const srv = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}): SceneNode =>
  box(`s${i}`, 6, (i - (n - 1) / 2) * 5, name, 'blue', 'server', { size: [1.2, 1.2], height: 26, ...extra });
const servers = (loads: number[], extra: (i: number) => Partial<SceneNode> = () => ({})) =>
  loads.map((l, i) => srv(i, loads.length, `Server ${i + 1}`, { load: l, ...extra(i) }));
const fan = (n: number) => Array.from({ length: n }, (_, i) => link('lb', `s${i}`, { arrow: 'end' }));

const lesson: Lesson = {
  slug: 'academy-how-load-balancing-algorithms-work',
  title: 'Load-Balancing Algorithms',
  blurb: 'Round robin, random, least connections, power of two choices and hashing — what each balances well, what state it needs, and how badly the busiest server is overloaded.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'rr', label: 'Round robin: busiest vs average', icon: 'layers' },
    { key: 'rand', label: 'Random: busiest vs average', icon: 'alert' },
    { key: 'p2c', label: 'Power of two choices: busiest vs average', icon: 'shield' },
    { key: 'lc', label: 'Least connections (needs global state)', icon: 'gauge' },
  ],
  goals: [
    { text: 'Round robin and weighted round robin', step: 2 },
    { text: 'Why random choice leaves some servers hot', step: 3 },
    { text: 'Least connections and its cost', step: 4 },
    { text: 'The power of two random choices', step: 5 },
    { text: 'Hashing for stickiness and cache locality', step: 6 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Servers', min: 2, max: 1000, step: 1, default: 100, unit: '', description: 'Backend servers behind the balancer.' },
      { key: 'mu', label: 'Average load per server', min: 10, max: 5000, step: 10, default: 100, unit: '', description: 'Average concurrent requests per server.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(2, Math.round(input.n ?? 100));
      const mu = Math.max(1, input.mu ?? 100);
      // Balls-into-bins approximations, accurate when the average load is well above ln n.
      const randExcess = Math.sqrt(2 * mu * Math.log(n));
      // Two choices: the maximum exceeds the mean by about log2(ln n) + a constant.
      const p2cExcess = Math.log2(Math.max(2, Math.log(n))) + 1;
      const pct = (x: number) => `+${((x / mu) * 100).toFixed(x / mu < 0.1 ? 1 : 0)}%`;
      return {
        rr: step < 1 ? { v: '—' } : { v: `+${(100 / mu).toFixed(1)}% (±1 request, if requests are equal)`, tone: 'good' },
        rand: step < 2 ? { v: '—' } : { v: `${pct(randExcess)} (~${Math.round(mu + randExcess)} vs ${Math.round(mu)})`, tone: randExcess / mu < 0.1 ? 'good' : randExcess / mu < 0.3 ? 'warn' : 'bad' },
        p2c: step < 4 ? { v: '—' } : { v: `${pct(p2cExcess)} (~${Math.round(mu + p2cExcess)} vs ${Math.round(mu)})`, tone: p2cExcess / mu < 0.05 ? 'good' : 'warn' },
        lc: step < 3 ? { v: '—' } : { v: `${pct(1)} (best, but all connection counts must be known)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'The job',
      kind: 'problem',
      title: 'Spread work so no server is the bottleneck',
      body: [
        'A load balancer picks a backend for each request or connection. The goal isn’t perfect evenness for its own sake — it is that <b>the busiest server stays below capacity</b>, because that server sets your latency and your failure threshold. The average can look fine while one server drowns.',
        'Algorithms differ in what they know: nothing (round robin, random), a little (sampling), or everything (global counts) — and in what they ignore: unequal servers, unequal requests, slow nodes. This lesson measures how far the busiest server exceeds the average for each.',
      ],
      scene: { nodes: [clients(), lb(), ...servers([55, 95, 60, 70]), ], links: [link('clients', 'lb'), ...fan(4)], flows: [flow(['clients', 'lb', 's1'], { kind: 'heavy', rate: 2 }), flow(['clients', 'lb', 's0'], { rate: 1 })] },
    },
    {
      short: 'Round robin',
      kind: 'technique',
      title: 'Round robin and weighted round robin',
      body: [
        'Send request 1 to server 1, 2 to server 2, … then wrap around. No state beyond a counter, perfectly even <i>counts</i> — the busiest server holds at most one request above average. <b>Weighted round robin</b> gives bigger servers proportionally more turns (a 16-core node takes 2× an 8-core one), and smooth variants interleave turns instead of sending bursts.',
        'Its blind spot: it balances <b>requests</b>, not <b>work</b>. If one request is a 5 ms read and the next a 2-second report, a server that happens to draw several heavy ones is overloaded while the counts look identical. It also ignores a node that has slowed down.',
      ],
      changes: [{ text: 'Even request counts, minimal state', tone: 'good' }, { text: 'Blind to request cost and server slowness', tone: 'bad' }],
      scene: { nodes: [clients(), lb({ tag: pill('1 → 2 → 3 → 1 …', 'refresh') }), ...servers([60, 60, 60])], links: [link('clients', 'lb'), ...fan(3)], flows: [0, 1, 2].map((i) => flow(['clients', 'lb', `s${i}`], { rate: 1.2 })) },
    },
    {
      short: 'Random',
      kind: 'problem',
      title: 'Random choice: simple, and lumpier than it looks',
      body: [
        'Pick a server uniformly at random — stateless and trivially distributed across many load balancers. The average is even, but chance alone creates imbalance: it is the “balls into bins” problem. With <code>n</code> servers and average load <code>μ</code> the busiest holds about <code>μ + √(2 μ ln n)</code>.',
        'For 100 servers at an average of 100 requests, ln 100 = 4.6 and √(2 × 100 × 4.6) ≈ 30: the busiest server carries <b>~130, 30% above average</b>. You must provision every server for that peak — wasting a quarter of your fleet. The imbalance grows (slowly) with n and shrinks, relatively, as the average load rises.',
      ],
      changes: [{ text: 'Max load ≈ μ + √(2 μ ln n)', tone: 'info' }, { text: '100 servers × 100 requests → busiest ~130', tone: 'bad' }],
      scene: { nodes: [clients(), lb({ tag: pill('uniform random', 'hash') }), ...servers([40, 95, 55, 80]), ], links: [link('clients', 'lb'), ...fan(4)], flows: [flow(['clients', 'lb', 's1'], { kind: 'heavy', rate: 2.5 }), flow(['clients', 'lb', 's0'], { rate: 0.7 }), flow(['clients', 'lb', 's2'], { rate: 1 }), flow(['clients', 'lb', 's3'], { rate: 1.6 })] },
    },
    {
      short: 'Least conn.',
      kind: 'technique',
      title: 'Least connections: use what each server is doing now',
      body: [
        'Send each request to the server with the <b>fewest active connections</b> (or lowest weighted load, or lowest response time). It adapts to uneven requests and slow servers automatically — a server stuck on slow requests accumulates connections and stops getting new ones. The busiest server ends up ~1 request above average.',
        'The cost is <b>state</b>: the balancer must know every server’s current count. With one balancer that’s easy; with a fleet of balancers each sees only its own traffic, and with delayed or stale counts they all pile on the same “emptiest” server at once — the <b>herd effect</b>. Newly added servers (zero connections) are flooded unless you ramp them in gradually (slow start).',
      ],
      changes: [{ text: 'Adapts to slow servers and heavy requests', tone: 'good' }, { text: 'Needs shared or fresh state; herd on stale data', tone: 'bad' }],
      scene: { nodes: [clients(), lb({ tag: pill('picks fewest active', 'gauge') }), ...servers([62, 58, 60, 61])], links: [link('clients', 'lb'), ...fan(4)], flows: [0, 1, 2, 3].map((i) => flow(['clients', 'lb', `s${i}`], { rate: 1 })) },
    },
    {
      short: 'Two choices',
      kind: 'insight',
      title: 'The power of two random choices',
      body: [
        'Pick <b>two</b> servers at random, then send the request to the <b>less loaded</b> of the two. It needs only two load readings per request, no global view, works across many independent balancers — and the improvement is dramatic: the busiest server’s excess over the average falls from <code>√(2 μ ln n)</code> to about <code>log₂ ln n</code>, exponentially smaller.',
        'For 100 servers at an average of 100: random gives ~130, two choices gives about <b>~103</b> (+3%) — nearly as good as global least-connections at a fraction of the coordination. A third choice helps little more. This is the default idea in many modern balancers (Envoy’s “least request” samples two random hosts; Nginx has a <code>random two</code> mode).',
      ],
      changes: [{ text: 'Max excess ≈ log₂ ln n instead of √(2 μ ln n)', tone: 'good' }, { text: '100 × 100: ~130 → ~103', tone: 'good' }],
      concepts: [{ term: 'Power of two choices', def: 'Sampling two random candidates and taking the better one, which exponentially improves load balance over a single random pick.' }],
      scene: { nodes: [clients(), lb({ tag: pill('sample 2, take the lighter', 'check', 'good') }), ...servers([62, 66, 60, 64], (i) => (i === 1 || i === 2 ? { tone: 'orange' } : {}))], links: [link('clients', 'lb'), ...fan(4), link('lb', 's1', { style: 'dashed' }), link('lb', 's2', { style: 'dashed' })], flows: [flow(['clients', 'lb', 's2'], { rate: 2 })] },
    },
    {
      short: 'Hashing',
      kind: 'technique',
      title: 'Hashing: same key, same server',
      body: [
        'Sometimes you <i>want</i> affinity: session state in memory, a per-user cache, a CDN edge that should hold each object once. <b>Hash a key</b> (client IP, session id, URL) and send it to <code>hash % n</code> — deterministic, stateless, perfectly cache-friendly. The problem: change n and nearly every key maps elsewhere, emptying every cache at once.',
        '<b>Consistent hashing</b> (see that lesson) moves only ~1/n of keys when a server joins or leaves; <b>bounded-load</b> variants cap how far above average any server may go, spilling excess to the next node, so a hot key doesn’t overload one machine. Use hashing when locality is worth more than perfect balance.',
      ],
      changes: [{ text: 'hash(key) % n: remaps ~all keys when n changes', tone: 'bad' }, { text: 'Consistent / bounded-load hashing: ~1/n move', tone: 'good' }],
      scene: { nodes: [clients(), lb({ tag: pill('hash(session)', 'hash') }), ...servers([70, 50, 80], () => ({}))], links: [link('clients', 'lb'), ...fan(3)], flows: [flow(['clients', 'lb', 's2'], { rate: 2 }), flow(['clients', 'lb', 's1'], { rate: 1 })] },
    },
    {
      short: 'Health',
      kind: 'technique',
      title: 'Algorithms need health and warm-up',
      body: [
        'Whatever the algorithm, the balancer must stop sending to dead servers: <b>active health checks</b> (probe an endpoint) and <b>passive</b> ones (eject after N errors), with limits so a dependency outage doesn’t eject the whole pool. <b>Slow start</b> ramps a new or recovered server up gradually so a cold JVM or empty cache isn’t crushed. <b>Connection draining</b> finishes in-flight requests before removing a node.',
        'Also weight for <i>capacity</i> (mixed instance sizes) and consider <b>locality</b> (prefer same-zone backends, spill over when unhealthy). The best algorithm is the simplest one whose busiest-server overload you can afford. Figures here are balls-into-bins approximations, accurate when average load is much larger than ln n.',
      ],
      scene: { nodes: [clients(), lb({ tag: pill('health + slow start', 'shield') }), ...servers([60, 60, 0, 25], (i) => (i === 2 ? { state: 'down', tone: 'red', tag: pill('ejected', 'alert', 'bad') } : i === 3 ? { tag: pill('warming up', 'refresh') } : {}))], links: [link('clients', 'lb'), link('lb', 's0'), link('lb', 's1'), link('lb', 's2', { style: 'broken' }), link('lb', 's3', { style: 'dashed' })], flows: [flow(['clients', 'lb', 's0'], { rate: 1.2 }), flow(['clients', 'lb', 's1'], { rate: 1.2 }), flow(['clients', 'lb', 's3'], { rate: 0.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Match the algorithm to what you can know',
      body: [
        '<b>Round robin</b>: even counts, no state, blind to cost. <b>Random</b>: stateless but the busiest server is <code>μ + √(2μ ln n)</code> — ~30% over at 100 × 100. <b>Least connections</b>: best balance, needs fresh global state. <b>Two choices</b>: near-least-connections balance (~+3%) with two samples. <b>Hashing</b>: affinity and cache locality, balance as a secondary goal.',
        'Pair any of them with health checks, slow start, draining and capacity weights. Provision for the busiest server, not the average.',
      ],
      scene: { nodes: [clients(), lb(), ...servers([60, 62, 61])], links: [link('clients', 'lb'), ...fan(3)], flows: [0, 1, 2].map((i) => flow(['clients', 'lb', `s${i}`], { rate: 1.2 })) },
    },
  ],
};

export default lesson;
