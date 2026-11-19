import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -14, 0, 14, 'clients', extra);
const proc = (extra: Partial<SceneNode> = {}) => box('proc', 2, 0, 'Server', 'blue', 'server', { size: [1.5, 1.5], height: 34, ...extra });

const fmtB = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB` : `${Math.round(b / 1e6)} MB`);

const lesson: Lesson = {
  slug: 'academy-how-nginx-was-able-to-support-1-million-concurrent-connections-on-a-single-server',
  title: 'The C10K Problem and Event-Driven Servers',
  blurb: 'Why a thread per connection stops scaling long before a million, how epoll-style event loops fix it, and the operating-system limits you meet next.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'thr', label: 'Memory: thread per connection', icon: 'disk' },
    { key: 'evt', label: 'Memory: event loop', icon: 'disk' },
    { key: 'cpu', label: 'CPU for the request rate', icon: 'cpu' },
    { key: 'ports', label: 'Upstream IPs needed (port limit)', icon: 'globe' },
  ],
  goals: [
    { text: 'What it costs to dedicate a thread to each connection', step: 2 },
    { text: 'How the event loop serves many sockets with a few threads', step: 3 },
    { text: 'Nginx’s master/worker architecture', step: 4 },
    { text: 'The kernel limits beyond memory: file descriptors and ports', step: 5 },
    { text: 'Where the event model does not help', step: 7 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'conns', label: 'Concurrent connections', min: 1000, max: 5000000, step: 1000, default: 1000000, unit: '', description: 'Open client connections, mostly idle (long polling, websockets, keep-alive).' },
      { key: 'tkb', label: 'Memory per thread', min: 64, max: 8192, step: 64, default: 512, unit: ' KB', description: 'Stack plus kernel structures per thread (virtual stacks default to 8 MB; resident use is lower).' },
      { key: 'ekb', label: 'Memory per idle connection (event loop)', min: 1, max: 64, step: 1, default: 4, unit: ' KB', description: 'Socket buffers and connection state in an event-driven server.' },
      { key: 'rps', label: 'Requests per second', min: 1000, max: 2000000, step: 1000, default: 100000, unit: '/s', description: 'Actual request rate across all connections.' },
      { key: 'us', label: 'CPU per request', min: 5, max: 500, step: 5, default: 50, unit: ' µs', description: 'CPU time to parse, route and respond to one request.' },
      { key: 'cores', label: 'Worker processes (cores)', min: 1, max: 64, step: 1, default: 8, unit: '', description: 'One event-loop worker per core.' },
    ],
    calculate: (input, step) => {
      const conns = Math.max(1, input.conns ?? 1e6);
      const tb = Math.max(1, input.tkb ?? 512) * 1024;
      const eb = Math.max(1, input.ekb ?? 4) * 1024;
      const rps = Math.max(0, input.rps ?? 1e5);
      const us = Math.max(1, input.us ?? 50);
      const cores = Math.max(1, Math.round(input.cores ?? 8));
      const cpuFrac = (rps * us) / 1e6 / cores;
      // Proxying: each upstream (IP, port) can hold ~60k client-side ports for one source address.
      const ips = Math.ceil(conns / 60000);
      return {
        thr: step < 1 ? { v: '—' } : { v: fmtB(conns * tb), tone: conns * tb > 6.4e10 ? 'bad' : 'warn' },
        evt: step < 2 ? { v: '—' } : { v: fmtB(conns * eb), tone: conns * eb > 3.2e10 ? 'warn' : 'good' },
        cpu: step < 3 ? { v: '—' } : { v: `${(cpuFrac * 100).toFixed(0)}% of ${cores} cores`, tone: cpuFrac < 0.6 ? 'good' : cpuFrac < 0.9 ? 'warn' : 'bad' },
        ports: step < 4 ? { v: '—' } : { v: `${ips} (≈60k connections each)`, tone: ips <= 4 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'C10K',
      kind: 'problem',
      title: 'Ten thousand connections was once the wall',
      body: [
        'In 1999 Dan Kegel posed the <b>C10K problem</b>: how can one server handle ten thousand simultaneous connections? Web servers of the time dedicated a process or thread to each connection, and most connections were <b>idle</b> — a browser holding a keep-alive socket, a client waiting on a long poll — doing nothing but costing resources.',
        'Today the question is a million, and the answer hasn’t changed in kind: stop spending a thread per connection and spend resources only on connections that have something to do. That is what Nginx, Node.js, Netty, HAProxy and others do.',
      ],
      scene: { nodes: [clients({ tag: pill('1,000,000 mostly idle', 'users') }), proc({ tag: pill('?', 'alert') })], links: [link('clients', 'proc')], flows: [flow(['clients', 'proc'], { rate: 2 })] },
    },
    {
      short: 'Threads',
      kind: 'problem',
      title: 'The cost of one thread per connection',
      body: [
        'Each thread needs a <b>stack</b> and kernel bookkeeping — hundreds of KB resident even if idle (default 8 MB of address space). At 512 KB, a million connections is <b>~520 GB</b> of memory for threads that are asleep. Even at 10,000 connections the scheduler juggles thousands of runnable threads: every <b>context switch</b> costs microseconds plus the cache and TLB state it destroys.',
        'And most of the memory buys nothing: an idle connection needs a few kilobytes of state, not a whole call stack. Thread-per-connection is simple to write — plain blocking code — but its cost scales with <i>connections</i>, not with <i>work</i>.',
      ],
      changes: [{ text: '1M × 512 KB ≈ 520 GB', tone: 'bad' }, { text: 'Context switches and cache loss grow with thread count', tone: 'bad' }],
      scene: { nodes: [clients(), proc({ state: 'hot', load: 95, tag: pill('1M threads · ~520 GB', 'alert', 'bad') })], links: [link('clients', 'proc')], flows: [flow(['clients', 'proc'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Event loop',
      kind: 'technique',
      title: 'One thread, thousands of sockets: epoll',
      body: [
        'An <b>event-driven</b> server keeps all connections as non-blocking sockets and asks the kernel — via <b>epoll</b> (Linux), <b>kqueue</b> (BSD/macOS) or IOCP (Windows) — “which sockets are ready?”. The kernel returns just the ready ones, in time proportional to activity, not to the total number of connections (the old <code>select</code>/<code>poll</code> scanned every socket each time, O(n)).',
        'The worker loops: take ready events, read, run a small state machine, write, repeat — never blocking. An idle connection costs only its socket buffers and state, <b>~4 KB</b> here: a million is ~4 GB, a 100× saving over threads. The programming model changes — callbacks or state machines instead of straight-line blocking code — which is the price.',
      ],
      changes: [{ text: 'epoll cost ∝ ready events, not total sockets', tone: 'good' }, { text: '1M × 4 KB ≈ 4 GB', tone: 'good' }],
      concepts: [{ term: 'epoll', def: 'A Linux interface that reports which of many registered sockets are ready for I/O, in O(ready) time rather than O(total).' }],
      scene: { nodes: [clients(), box('loop', 2, 0, 'Event loop', 'blue', 'refresh', { size: [1.5, 1.5], height: 34, load: 45, tag: pill('epoll_wait → ready sockets', 'search', 'good') })], links: [link('clients', 'loop')], flows: [flow(['clients', 'loop'], { rate: 2.5 })] },
    },
    {
      short: 'Nginx',
      kind: 'technique',
      title: 'Master and workers',
      body: [
        'Nginx runs one <b>master</b> process (reads config, binds ports, manages workers, reloads without dropping connections) and <b>one worker per CPU core</b>, each an independent event loop accepting connections and handling them to completion. Workers share no state, so there are no locks between them; the kernel spreads accepts (<code>SO_REUSEPORT</code> gives each worker its own accept queue).',
        'CPU scales with <i>work</i>: 100,000 requests/s at 50 µs each is 5 core-seconds per second — about 63% of 8 cores — regardless of whether there are 10,000 or a million open connections. Memory scales with connections, at kilobytes each. Operations that would block (disk reads of large files, slow DNS) are offloaded to thread pools so a worker’s loop never stalls.',
      ],
      changes: [{ text: 'One worker per core, shared-nothing', tone: 'good' }, { text: 'CPU follows request rate, memory follows connections', tone: 'info' }],
      scene: { nodes: [clients(), box('m', 2, -7, 'Master', 'purple', 'cpu', { size: [1.2, 1.2], height: 22 }), ...[0, 1, 2].map((i) => box(`w${i}`, 10, -4 + i * 4.5, `Worker ${i + 1}`, 'blue', 'refresh', { size: [1.2, 1.2], height: 26, load: 55 }))], links: [link('m', 'w0', { style: 'dashed' }), link('m', 'w1', { style: 'dashed' }), link('m', 'w2', { style: 'dashed' }), link('clients', 'w0'), link('clients', 'w1'), link('clients', 'w2')], flows: [flow(['clients', 'w0'], { rate: 1.5 }), flow(['clients', 'w1'], { rate: 1.5 }), flow(['clients', 'w2'], { rate: 1.5 })] },
    },
    {
      short: 'Kernel limits',
      kind: 'problem',
      title: 'After memory: descriptors, ports and buffers',
      body: [
        'Every connection is a <b>file descriptor</b>: raise <code>ulimit -n</code> and <code>fs.file-max</code> past a million. Each socket also has kernel buffers — tune <code>tcp_rmem/wmem</code> down for mostly idle connections, or they dominate memory — and conntrack or NAT tables can overflow.',
        'As a <b>proxy</b> you also open connections to upstreams, and a (source IP, source port, dest IP, dest port) tuple must be unique: one source IP has ~60,000 usable ephemeral ports per destination <code>IP:port</code>. A million upstream connections to one backend address needs <b>at least 17 source IPs</b> (or more backend addresses/ports, or connection reuse — keep-alive pools and HTTP/2 to upstreams multiplex many requests on few connections).',
      ],
      changes: [{ text: 'fd limit ≥ connections', tone: 'info' }, { text: '~60k ports per (src IP → dst IP:port)', tone: 'bad' }, { text: 'Reuse upstream connections', tone: 'good' }],
      scene: { nodes: [proc({ tag: pill('ulimit -n 1,048,576', 'list') }), box('up', 14, 0, 'Upstream :8080', 'orange', 'server', { size: [1.3, 1.3], height: 28, tag: pill('~60k ports per source IP', 'alert', 'warn') })], links: [link('proc', 'up')], flows: [flow(['proc', 'up'], { rate: 2 })] },
    },
    {
      short: 'Throughput',
      kind: 'technique',
      title: 'Cheap per-request work',
      body: [
        'Once connections are cheap, throughput is about per-request cost: <b>zero-copy</b> file serving (<code>sendfile</code> moves data from page cache to socket without passing through user space), <b>buffered, batched I/O</b>, parsing HTTP without allocation, keeping hot config in memory, TLS session resumption and hardware crypto. TLS usually dominates CPU: see the handshake lesson.',
        'Measure with realistic mixes — benchmarks with idle connections and tiny responses flatter every server. The claim “one million connections” is about <i>memory and kernel limits</i>; requests per second is a separate number set by CPU, bandwidth and what your handlers do.',
      ],
      scene: { nodes: [box('disk', -8, 0, 'Page cache', 'yellow', 'disk', { size: [1.3, 1.3], height: 18 }), box('sf', 2, 0, 'sendfile()', 'teal', 'bolt', { size: [1.3, 1.3], height: 24, tag: pill('no user-space copy', 'check', 'good') }), box('nic', 12, 0, 'Socket / NIC', 'blue', 'globe', { size: [1.3, 1.3], height: 24 })], links: [link('disk', 'sf', { arrow: 'end' }), link('sf', 'nic', { arrow: 'end' })], flows: [flow(['disk', 'sf', 'nic'], { rate: 2 })] },
    },
    {
      short: 'Limits',
      kind: 'tradeoff',
      title: 'Where the event model hurts',
      body: [
        '<b>One blocking call stalls a whole worker</b>: a CPU-heavy handler, a synchronous disk or DNS call, or a long regex freezes every connection on that loop — the same single-thread hazard as Redis. Offload to thread pools or other processes, and keep handlers short. <b>CPU-bound work</b> gains nothing from the event model; use threads or processes per core.',
        '<b>Debugging</b> inverted control flow is harder than blocking code, and the language runtime matters: async/await, coroutines and goroutines give an event-driven runtime with a straight-line look. Modern runtimes (Go, Java virtual threads, Erlang) let you write “thread per connection” code that is cheap — the principle is the same: park idle connections cheaply, spend threads on work. Figures here are illustrative sizing.',
      ],
      scene: { nodes: [clients(), box('loop', 2, 0, 'Event loop', 'blue', 'refresh', { size: [1.5, 1.5], height: 34, state: 'hot', tag: pill('one blocking call → all stall', 'alert', 'bad') })], links: [link('clients', 'loop')], flows: [flow(['clients', 'loop'], { kind: 'fail', rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Pay for work, not for waiting',
      body: [
        'Thread-per-connection costs memory and scheduling proportional to <i>connections</i>; an <b>epoll-driven event loop per core</b> costs ~kilobytes per idle connection and CPU proportional to <i>requests</i>. A million connections fit in a few GB; the next limits are file descriptors, kernel buffers and ephemeral ports.',
        'Keep handlers non-blocking, offload heavy work, reuse upstream connections, tune the kernel, and measure with realistic traffic.',
      ],
      scene: { nodes: [clients(), box('loop', 2, 0, 'Event loop × cores', 'blue', 'refresh', { size: [1.5, 1.5], height: 34, load: 60 })], links: [link('clients', 'loop')], flows: [flow(['clients', 'loop'], { rate: 2.5 })] },
    },
  ],
};

export default lesson;
