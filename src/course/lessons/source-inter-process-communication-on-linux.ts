import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const pa = (extra: Partial<SceneNode> = {}) => box('pa', -17, 0, 'Process A (own address space)', 'teal', 'cpu', { size: [1.5, 1.5], height: 28, ...extra });
const pb = (extra: Partial<SceneNode> = {}) => box('pb', 13, 0, 'Process B (own address space)', 'green', 'cpu', { size: [1.5, 1.5], height: 28, ...extra });
const kbuf = (extra: Partial<SceneNode> = {}) => db('kbuf', -2, -7, 'Kernel buffer (pipe / socket)', { size: [1.6, 1.6], ...extra });
const shm = (extra: Partial<SceneNode> = {}) => disk('shm', -2, 7, 'Shared memory pages (mapped in both)', { size: [3, 1.2], height: 12, tone: 'yellow', ...extra });
const sig = (extra: Partial<SceneNode> = {}) => box('sig', -2, 0, 'Signal / futex wake', 'purple', 'bolt', { size: [1.2, 1.2], height: 18, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);
const fmtU = (us: number): string => (us < 1 ? `${(us * 1000).toFixed(0)} ns` : `${us.toFixed(1)} µs`);
const fmtBw = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB/s` : `${Math.round(b / 1e6)} MB/s`);

const lesson: Lesson = {
  slug: 'source-inter-process-communication-on-linux',
  title: 'Inter-Process Communication on Linux: Pipes, Sockets, Queues, Signals and Shared Memory',
  blurb: 'Processes can’t read each other’s memory, so the kernel offers channels — each with a different copy count, syscall cost and wake-up path. A per-message cost model shows why shared memory wins for big, hot data and a pipe is plenty for the rest.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'pipe', label: 'Pipe: latency per message', icon: 'timer' },
    { key: 'unix', label: 'Unix domain socket: latency per message', icon: 'timer' },
    { key: 'tcp', label: 'TCP over loopback: latency per message', icon: 'timer' },
    { key: 'shm', label: 'Shared memory: spin-wait vs futex wake', icon: 'bolt' },
    { key: 'bw', label: 'Memory bandwidth burned copying (pipe vs shared)', icon: 'gauge' },
  ],
  goals: [
    { text: 'Why IPC exists: isolated address spaces', step: 1 },
    { text: 'Pipes and FIFOs: byte streams through the kernel', step: 2 },
    { text: 'Sockets and message queues', step: 3 },
    { text: 'Shared memory and synchronisation', step: 4 },
    { text: 'Signals, security and choosing', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'size', label: 'Message size', min: 16, max: 16000000, step: 16, default: 4096, unit: ' B', description: 'Bytes per message.' },
      { key: 'rate', label: 'Messages per second', min: 1, max: 5000000, step: 1, default: 100000, unit: '/s', description: 'Sustained message rate.' },
      { key: 'sys', label: 'System call cost', min: 0.1, max: 5, step: 0.1, default: 1, unit: ' µs', description: 'One read or write syscall (with mitigations).' },
      { key: 'wake', label: 'Blocked-reader wake-up + context switch', min: 0.5, max: 20, step: 0.5, default: 3, unit: ' µs', description: 'Scheduler cost to run the receiver.' },
      { key: 'mem', label: 'Memory copy speed', min: 1, max: 50, step: 1, default: 10, unit: ' GB/s', description: 'Single-thread memcpy throughput.' },
      { key: 'usock', label: 'Unix socket extra overhead', min: 0, max: 5, step: 0.1, default: 1, unit: ' µs', description: 'Socket layer cost over a pipe.' },
      { key: 'tcp', label: 'TCP stack extra overhead (loopback)', min: 0, max: 30, step: 0.5, default: 8, unit: ' µs', description: 'Protocol processing, checksums, ACK handling.' },
      { key: 'spin', label: 'Shared-memory cache-line hand-off', min: 0.05, max: 2, step: 0.05, default: 0.15, unit: ' µs', description: 'Cross-core cache coherence cost when the reader spins.' },
    ],
    calculate: (input, step) => {
      const size = Math.max(1, input.size ?? 4096);
      const rate = Math.max(1, input.rate ?? 1e5);
      const sys = Math.max(0, input.sys ?? 1);
      const wake = Math.max(0, input.wake ?? 3);
      const mem = Math.max(0.1, input.mem ?? 10) * 1e9;
      const usock = Math.max(0, input.usock ?? 1);
      const tcp = Math.max(0, input.tcp ?? 8);
      const spin = Math.max(0, input.spin ?? 0.15);
      const copy = (size / mem) * 1e6; // µs per copy
      // write() copies user → kernel, read() copies kernel → user, plus two syscalls and a wake-up.
      const pipe = 2 * sys + 2 * copy + wake;
      const unix = pipe + usock;
      const tcpL = pipe + tcp;
      const shmSpin = spin;
      const shmFutex = 2 * sys + wake;
      const bwPipe = 2 * size * rate;
      return {
        pipe: step < 2 ? { v: '—' } : { v: `${fmtU(pipe)} (2 syscalls + 2 copies of ${fmtN(size)} B + wake-up)`, tone: pipe < 10 ? 'good' : 'warn' },
        unix: step < 3 ? { v: '—' } : { v: fmtU(unix) },
        tcp: step < 3 ? { v: '—' } : { v: fmtU(tcpL), tone: tcpL > 2 * pipe ? 'warn' : 'good' },
        shm: step < 4 ? { v: '—' } : { v: `${fmtU(shmSpin)} spinning · ${fmtU(shmFutex)} with a futex wake`, tone: 'good' },
        bw: step < 4 ? { v: '—' } : { v: `${fmtBw(bwPipe)} copied vs 0 (data produced in place)`, tone: bwPipe < 2e9 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'Isolation is the point, so communication goes through the kernel',
      body: [
        'Each Linux process has its own <b>virtual address space</b>: a pointer in process A means nothing in process B, and the MMU enforces it. That isolation is what makes processes safe, but it means any cooperation — a web server talking to a worker, a shell pipeline, a database and its clients — needs a channel. <b>Inter-process communication (IPC)</b> mechanisms either <b>copy bytes through the kernel</b> (pipes, sockets, message queues) or <b>map the same physical memory into both processes</b> (shared memory) and add a way to signal.',
        'The mechanisms differ along four axes: <b>copies</b> (each one costs memory bandwidth, proportional to size), <b>system calls</b> (a user–kernel transition costs roughly a microsecond with modern mitigations), <b>wake-ups</b> (a sleeping receiver must be scheduled — a context switch of several µs), and <b>semantics</b> (byte stream or messages, one-to-one or many, same machine or network, who may connect). A simple cost model uses 4 KB messages at 100,000/s.',
      ],
      scene: { nodes: [pa({ tag: pill('0x7f… means nothing in B', 'lock') }), kbuf(), pb()], links: [link('pa', 'kbuf'), link('kbuf', 'pb')], flows: [flow(['pa', 'kbuf', 'pb'], { rate: 1.6 })] },
    },
    {
      short: 'Pipes',
      kind: 'technique',
      title: 'Pipes and FIFOs: a byte stream through a kernel buffer',
      body: [
        'A <b>pipe</b> (<code>pipe(2)</code>, or <code>|</code> in the shell) is a unidirectional byte stream backed by a <b>kernel ring buffer</b> (64 KB by default, adjustable with <code>F_SETPIPE_SZ</code>). The writer’s <code>write()</code> <b>copies</b> bytes from user memory into the buffer; the reader’s <code>read()</code> <b>copies</b> them out. A full pipe blocks the writer (built-in backpressure), an empty one blocks the reader, and writes of up to <code>PIPE_BUF</code> (4096 bytes) are <b>atomic</b> — they won’t interleave with other writers. A <b>FIFO</b> (named pipe, <code>mkfifo</code>) gives the pipe a path so unrelated processes can open it.',
        'Cost per 4 KB message: two syscalls (2 µs), two copies (2 × 0.41 µs at 10 GB/s), and a wake-up of the blocked reader (3 µs) = about <b>5.8 µs</b> — fine for a shell pipeline or a few hundred thousand messages a second. Pipes carry bytes, not messages: the receiver must frame them (length prefixes, delimiters). Related zero-copy tricks — <code>splice(2)</code>, <code>vmsplice</code>, <code>sendfile</code> — move pages between file descriptors without copying through user space.',
      ],
      changes: [{ text: 'Kernel ring buffer (64 KB); full blocks writer, empty blocks reader', tone: 'info' }, { text: 'Two copies + two syscalls + a wake-up ≈ 5.8 µs per 4 KB message', tone: 'info' }, { text: 'Byte stream: you must frame messages', tone: 'bad' }],
      scene: { nodes: [pa({ tag: pill('write(fd, buf, 4096)', 'file') }), kbuf({ tag: pill('64 KB ring buffer', 'db') }), pb({ tag: pill('read(fd, buf, 4096)', 'file') })], links: [link('pa', 'kbuf'), link('kbuf', 'pb')], flows: [flow(['pa', 'kbuf', 'pb'], { kind: 'write', rate: 1.8 })] },
    },
    {
      short: 'Sockets',
      kind: 'technique',
      title: 'Sockets and message queues',
      body: [
        '<b>Unix domain sockets</b> (<code>AF_UNIX</code>) use the socket API on the local machine: bidirectional, stream (<code>SOCK_STREAM</code>) or datagram (<code>SOCK_DGRAM</code>/<code>SEQPACKET</code> with message boundaries), addressed by a filesystem path (so ordinary <b>file permissions</b> control who may connect) or an abstract name. They can <b>pass file descriptors</b> between processes (<code>SCM_RIGHTS</code>) and <b>verify the peer’s credentials</b> (<code>SO_PEERCRED</code>: pid, uid, gid) — which is why Docker, systemd, X11, PostgreSQL and many daemons use them. About a microsecond more than a pipe: <b>≈ 6.8 µs</b>.',
        '<b>TCP over loopback</b> is the same API as the network, so code can move between a local and remote peer unchanged — at the price of the whole protocol stack even locally: ≈ <b>13.8 µs</b> per message here, 2.4× a pipe. <b>POSIX message queues</b> (<code>mq_*</code>) and System V queues deliver <b>discrete, prioritised messages</b> with kernel-enforced limits, but have limited sizes and fewer tools than sockets, so they’re less common today. <code>D-Bus</code>, gRPC and most RPC frameworks build their local transport on Unix sockets.',
      ],
      changes: [{ text: 'Unix sockets: path permissions, SCM_RIGHTS fd passing, SO_PEERCRED', tone: 'good' }, { text: 'Loopback TCP: portable but ~2.4× the per-message cost', tone: 'info' }, { text: 'Message queues: discrete prioritised messages, limited use today', tone: 'info' }],
      scene: { nodes: [pa({ tag: pill('/run/app.sock', 'link') }), kbuf({ tag: pill('socket buffers', 'db') }), pb({ tag: pill('SO_PEERCRED: uid 1001', 'check', 'good') })], links: [link('pa', 'kbuf'), link('kbuf', 'pb')], flows: [flow(['pa', 'kbuf', 'pb'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Shared mem',
      kind: 'technique',
      title: 'Shared memory: no copies, but you synchronise',
      body: [
        '<b>Shared memory</b> (<code>shm_open</code> + <code>mmap</code>, POSIX; <code>memfd_create</code>; <code>MAP_SHARED</code> on a file) maps the <b>same physical pages</b> into two address spaces. Once mapped, the kernel is out of the data path: the producer writes directly into the shared region and the consumer reads it — <b>zero copies</b>, no syscalls per message. For large data (frames, ML tensors, database buffer pools, ring buffers in high-frequency trading) this is the only fast option: at 1 MB per message a pipe spends ~210 µs copying; shared memory spends none.',
        'The catch is that <b>you</b> must coordinate: readers need to know when data is ready and writers when it’s consumed. Options: a lock-free <b>ring buffer</b> with atomic head/tail indices and correct memory ordering (acquire/release), <b>process-shared mutexes and semaphores</b> in the region, or a <b>futex</b> for sleeping. A reader <b>spinning</b> on the index sees a new message after a cache-line transfer (~0.15 µs) but burns a core; one that <b>sleeps on a futex</b> pays the syscall and wake-up (~5 µs) — about the cost of a pipe for small messages. Hazards: no isolation (a buggy writer corrupts the reader’s view — validate everything), stale pointers (don’t store raw pointers in shared memory; use offsets), crash recovery of half-updated state, and the lifetime of the segment.',
      ],
      changes: [{ text: 'mmap the same pages: no copies, no per-message syscalls', tone: 'good' }, { text: 'Spin: ~0.15 µs but burns a core; futex: ~5 µs', tone: 'info' }, { text: 'You own synchronisation, validation and crash recovery', tone: 'bad' }],
      concepts: [{ term: 'Futex', def: 'A Linux “fast userspace mutex”: waiting and waking happen in the kernel only when there is contention, so uncontended synchronisation costs no syscall.' }],
      scene: { nodes: [pa({ tag: pill('write in place', 'bolt', 'good') }), shm({ tag: pill('ring buffer: head · tail', 'list', 'good') }), sig({ tag: pill('futex wake (optional)', 'bolt') }), pb({ tag: pill('read in place', 'bolt', 'good') })], links: [link('pa', 'shm'), link('shm', 'pb'), link('pa', 'sig', { style: 'dashed' }), link('sig', 'pb', { style: 'dashed' })], flows: [flow(['pa', 'shm', 'pb'], { rate: 2.4 })] },
    },
    {
      short: 'Choose',
      kind: 'tradeoff',
      title: 'Signals, security and choosing',
      body: [
        '<b>Signals</b> (<code>SIGTERM</code>, <code>SIGUSR1</code>, <code>SIGCHLD</code>) are asynchronous notifications with no payload beyond the number (real-time signals carry a small value): good for “reload your config” or “shut down”, bad for data — handlers run at arbitrary points and may only call async-signal-safe functions. <b>Other tools</b>: <code>eventfd</code> and <code>signalfd</code> integrate wake-ups into <code>epoll</code> loops; <code>inotify</code> reports filesystem changes; files with locks (<code>flock</code>, <code>fcntl</code>) coordinate batch jobs; <code>io_uring</code> batches syscalls to cut their cost. Cross-machine communication belongs to sockets, RPC or message brokers.',
        'A decision rule: <b>small, infrequent messages, simplicity</b> → pipe or Unix socket (also gives you access control and fd passing); <b>you might later split across hosts</b> → sockets / gRPC; <b>large or very hot data</b> → shared memory plus a light notification channel; <b>just “something happened”</b> → signal or eventfd. Security always: set file permissions and umasks on socket paths and shm names, check peer credentials, validate sizes and offsets from a peer, and run in namespaces/containers where possible (each container has its own IPC namespace). Figures here are a first-order per-message cost model with assumed syscall, copy and wake-up costs.',
      ],
      changes: [{ text: 'Signals: notification only; eventfd/signalfd for epoll loops', tone: 'info' }, { text: 'Small → pipe/Unix socket; hot or large → shared memory + notify', tone: 'good' }, { text: 'Always permission, authenticate and validate peer input', tone: 'good' }],
      scene: { nodes: [pa(), sig({ tag: pill('SIGHUP: reload', 'bolt') }), kbuf({ tag: pill('Unix socket', 'link') }), shm(), pb()], links: [link('pa', 'sig'), link('pa', 'kbuf'), link('pa', 'shm'), link('sig', 'pb', { style: 'dashed' }), link('kbuf', 'pb'), link('shm', 'pb')], flows: [flow(['pa', 'kbuf', 'pb'], { rate: 1.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Copies, syscalls and wake-ups decide the price',
      body: [
        '<b>Pipes</b> ≈ 5.8 µs and <b>Unix sockets</b> ≈ 6.8 µs per 4 KB message (two copies, two syscalls, a wake-up); <b>TCP loopback</b> ≈ 13.8 µs; <b>shared memory</b> ≈ 0.15 µs spinning or ≈ 5 µs with a futex, and no copying — but you own synchronisation and safety.',
        'Pick the simplest channel that meets the rate and size, and escalate to shared memory only for large or hot data.',
      ],
      scene: { nodes: [pa(), kbuf(), shm(), pb()], links: [link('pa', 'kbuf'), link('kbuf', 'pb'), link('pa', 'shm'), link('shm', 'pb')], flows: [flow(['pa', 'kbuf', 'pb'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
