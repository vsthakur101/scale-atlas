import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const host = (extra: Partial<SceneNode> = {}) => box('host', 0, 0, 'Host kernel', 'blue', 'server', { size: [2.6, 1.6], height: 20, ...extra });
const ctr = (i: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`c${i}`, -6 + i * 6, -7, name, 'teal', 'box', { size: [1.3, 1.3], height: 26, ...extra });
const registry = (extra: Partial<SceneNode> = {}) => db('reg', -14, 4, 'Registry', { size: [1.3, 1.3], ...extra });
const nodeBox = (extra: Partial<SceneNode> = {}) => box('node', 6, 4, 'Node', 'blue', 'server', { size: [1.4, 1.4], height: 28, ...extra });

const fmtMB = (mb: number): string => (mb >= 1e6 ? `${(mb / 1e6).toFixed(1)} TB` : mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`);
const fmtS = (s: number): string => (s >= 120 ? `${(s / 60).toFixed(1)} min` : s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`);

const lesson: Lesson = {
  slug: 'source-how-does-docker-work',
  title: 'How Containers and Docker Work',
  blurb: 'Not a lightweight VM: processes isolated with namespaces, limited with cgroups, and built from shareable image layers.',
  minutes: 13,
  level: 'Beginner',
  metrics: [
    { key: 'first', label: 'First pull time (cold node)', icon: 'clock' },
    { key: 'update', label: 'Update pull (cached layers)', icon: 'refresh' },
    { key: 'fleet', label: 'Rollout traffic (all nodes)', icon: 'activity' },
    { key: 'dedupe', label: 'Registry storage per version', icon: 'disk' },
  ],
  goals: [
    { text: 'What a container actually is (and isn’t)', step: 1 },
    { text: 'Namespaces: what a process can see', step: 2 },
    { text: 'cgroups: what a process can use', step: 3 },
    { text: 'Image layers, the Dockerfile and caching', step: 4 },
    { text: 'Running at scale and the security limits', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'size', label: 'Image size', min: 20, max: 3000, step: 10, default: 400, unit: ' MB', description: 'Total compressed size of all layers.' },
      { key: 'changed', label: 'Layers that change per release', min: 1, max: 100, step: 1, default: 8, unit: '%', description: 'Share of the image that is new in each release (your code layer, not the base).' },
      { key: 'bw', label: 'Pull bandwidth per node', min: 10, max: 1000, step: 10, default: 100, unit: ' MB/s', description: 'Registry-to-node transfer speed.' },
      { key: 'nodes', label: 'Nodes pulling', min: 1, max: 2000, step: 1, default: 50, unit: '', description: 'Hosts that must fetch the new version.' },
    ],
    calculate: (input, step) => {
      const size = Math.max(1, input.size ?? 400);
      const frac = Math.min(1, Math.max(0.01, (input.changed ?? 8) / 100));
      const bw = Math.max(1, input.bw ?? 100);
      const nodes = Math.max(1, Math.round(input.nodes ?? 50));
      const update = size * frac;
      return {
        first: step < 3 ? { v: '—' } : { v: fmtS(size / bw), tone: size / bw > 30 ? 'warn' : 'good' },
        update: step < 3 ? { v: '—' } : { v: `${fmtS(update / bw)} (${fmtMB(update)})`, tone: 'good' },
        fleet: step < 3 ? { v: '—' } : { v: fmtMB(update * nodes), tone: update * nodes > 50000 ? 'warn' : 'good' },
        dedupe: step < 3 ? { v: '—' } : { v: `${fmtMB(update)} new (vs ${fmtMB(size)} as full copy)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Not a VM',
      kind: 'insight',
      title: 'A container is an isolated process',
      body: [
        'A virtual machine runs its own kernel on emulated hardware. A <b>container</b> is just a normal Linux <b>process (or group of processes) on the host’s kernel</b>, given a restricted view of the system and a resource budget. No second kernel, no boot: starting one takes milliseconds to a second, and overhead is close to a plain process.',
        'The kernel provides two features that do the work: <b>namespaces</b> (limit what the process can <i>see</i>) and <b>cgroups</b> (limit what it can <i>use</i>). Docker adds packaging (images), a build tool, a runtime and a developer experience on top; container runtimes like containerd and runc do the low-level work.',
      ],
      changes: [{ text: 'Shared host kernel; no guest OS', tone: 'info' }, { text: 'Start in ~100 ms–1 s; near-native speed', tone: 'good' }],
      scene: { nodes: [ctr(0, 'Container A'), ctr(1, 'Container B'), ctr(2, 'Container C'), host({ tag: pill('one shared kernel', 'cpu') })], links: [link('c0', 'host'), link('c1', 'host'), link('c2', 'host')], flows: [] },
    },
    {
      short: 'Namespaces',
      kind: 'technique',
      title: 'Namespaces: a private view of the system',
      body: [
        'A namespace gives a process its own copy of a global resource. <b>PID</b>: it sees itself as process 1 and can’t see the host’s other processes. <b>NET</b>: its own network interfaces, IP, routing table and ports (so two containers can both listen on :80). <b>MNT</b>: its own filesystem root (the image). <b>UTS</b>: its own hostname. <b>IPC</b>, <b>USER</b> (map root inside to an unprivileged user outside) and <b>CGROUP</b> complete the set.',
        'Together they create the illusion of a separate machine. It’s only an illusion — it is the same kernel, so a kernel vulnerability is a possible escape, which shapes the security story at the end.',
      ],
      concepts: [{ term: 'Namespace', def: 'A Linux kernel feature giving a process an isolated view of a system resource such as processes, network, mounts or hostnames.' }],
      scene: { nodes: [ctr(0, 'Container', { tag: pill('PID 1 · own net · own fs', 'shield') }), host({ tag: pill('sees everything', 'search') })], links: [link('c0', 'host')], flows: [] },
    },
    {
      short: 'cgroups',
      kind: 'technique',
      title: 'cgroups: a resource budget',
      body: [
        '<b>Control groups</b> limit and account for CPU, memory, I/O and process count per group. Set a memory limit of 512 MB and the kernel OOM-kills the container when it exceeds it, rather than letting it starve the host. A CPU limit throttles it (a quota of CPU time per scheduling period) — which can cause <b>latency spikes</b> even when the host is idle, a common surprise.',
        'These are the “requests and limits” Kubernetes manages: requests influence scheduling and CPU weight, limits become cgroup settings. Without cgroup limits, one runaway container can take down every neighbour on the node.',
      ],
      changes: [{ text: 'Memory limit exceeded → OOM kill', tone: 'bad' }, { text: 'CPU limit → throttling, not killing', tone: 'info' }],
      scene: { nodes: [ctr(0, 'Container', { load: 80, tag: pill('mem ≤ 512 MB · cpu ≤ 1', 'gauge') }), host({ tag: pill('cgroup enforces', 'shield') })], links: [link('c0', 'host')], flows: [] },
    },
    {
      short: 'Layers',
      kind: 'technique',
      title: 'Images are stacks of read-only layers',
      body: [
        'An image is an ordered list of <b>layers</b>, each the filesystem diff made by one Dockerfile instruction (<code>FROM</code>, <code>RUN</code>, <code>COPY</code>…), identified by a content hash. A union filesystem (overlayfs) stacks them read-only and adds a thin <b>writable layer</b> on top per container; changes you make in a running container vanish when it’s removed.',
        'Layers are <b>shared and cached</b>: ten services built on the same base image store that base once; a rebuild reuses every layer up to the first changed instruction. Put slow-changing things (OS packages, dependencies) first and your app code last, and a release moves only your 8% — 32 MB of a 400 MB image — to each node instead of all of it. Cache is invalidated from the changed layer onward, so instruction order matters.',
      ],
      changes: [{ text: 'Content-addressed layers, shared across images', tone: 'good' }, { text: 'Order: dependencies first, app code last', tone: 'good' }, { text: '400 MB image, 8% changed → 32 MB per node', tone: 'good' }],
      concepts: [{ term: 'Layer', def: 'A read-only filesystem diff produced by one build step, addressed by hash and shared between images.' }],
      scene: { nodes: [box('l1', 0, 4, 'Base OS layer', 'grey', 'layers', { size: [3, 1.2], height: 14 }), box('l2', 0, 0, 'Dependencies layer', 'yellow', 'layers', { size: [3, 1.2], height: 14 }), box('l3', 0, -4, 'App code layer (changes)', 'orange', 'layers', { size: [3, 1.2], height: 14, tag: pill('only this is re-pulled', 'check', 'good') }), box('rw', 0, -8, 'Writable layer', 'green', 'file', { size: [3, 1.2], height: 10, tag: pill('per container', 'file') })], links: [], flows: [] },
    },
    {
      short: 'Registry',
      kind: 'technique',
      title: 'Build, ship, run',
      body: [
        '<code>docker build</code> produces layers from the Dockerfile; <code>docker push</code> uploads only layers the registry doesn’t have; a node <code>pull</code>s only layers it doesn’t have, verifying hashes. Tags (<code>app:1.4.2</code>) are movable labels — pin <b>digests</b> (<code>app@sha256:…</code>) for reproducibility. <code>docker run</code> creates namespaces and cgroups, mounts the layers plus a writable layer and starts the process.',
        'For a cold node a 400 MB image at 100 MB/s takes 4 s; a release with 8% change takes about 0.3 s. Across 50 nodes the rollout moves 1.6 GB instead of 20 GB. Practices that pay off: small base images (distroless, alpine), multi-stage builds that leave compilers behind, a pull-through cache or registry mirror near the cluster, and pre-pulling images on new nodes.',
      ],
      changes: [{ text: 'Push and pull transfer only missing layers', tone: 'good' }, { text: 'Pin digests, not tags', tone: 'info' }],
      scene: { nodes: [registry({ tag: pill('layers by hash', 'hash') }), nodeBox({ tag: pill('pulls missing layers', 'refresh') })], links: [link('reg', 'node', { arrow: 'end' })], flows: [flow(['reg', 'node'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Security',
      kind: 'tradeoff',
      title: 'Isolation is weaker than a VM',
      body: [
        'Because containers share the host kernel, a kernel bug or a misconfiguration (privileged mode, mounted Docker socket, host namespaces, root inside the container) can be a path to the host. Hardening: run as a <b>non-root user</b>, drop Linux <b>capabilities</b>, use a read-only root filesystem, apply <b>seccomp</b> and AppArmor/SELinux profiles, scan images for vulnerabilities, and keep base images patched.',
        'For hostile multi-tenant workloads add a stronger boundary: <b>gVisor</b> (a user-space kernel) or <b>Kata/Firecracker</b> micro-VMs that give each container its own kernel. Containers trade isolation strength for density and speed; pick the boundary to match the trust level. Figures here are model outputs for sizing.',
      ],
      scene: { nodes: [ctr(0, 'Container', { tag: pill('non-root · seccomp · no caps', 'shield', 'good') }), host({ tag: pill('shared kernel = shared risk', 'alert', 'warn') }), box('vm', 12, -7, 'Micro-VM / gVisor', 'purple', 'shield', { size: [1.3, 1.3], height: 24, tag: pill('stronger boundary', 'lock') })], links: [link('c0', 'host')], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Isolated processes from shared layers',
      body: [
        'A container is a process with <b>namespaces</b> (what it sees), <b>cgroups</b> (what it uses) and a root filesystem built from <b>shared, cached, read-only layers</b> plus a writable top. That is why containers start fast, pack densely and distribute efficiently — and why their isolation is weaker than a VM’s.',
        'Order Dockerfiles for cache hits, keep images small, pin digests, set limits, run as non-root, and add micro-VM isolation for untrusted code.',
      ],
      scene: { nodes: [ctr(0, 'A'), ctr(1, 'B'), host(), disk('img', 14, 4, 'Shared layers', { size: [2.6, 1.1], height: 16, tone: 'yellow' })], links: [link('c0', 'host'), link('c1', 'host')], flows: [] },
    },
  ],
};

export default lesson;
