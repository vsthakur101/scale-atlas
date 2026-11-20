import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const vm = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`vm${i}`, -9 + i * (18 / Math.max(1, n - 1)), -7, name, 'teal', 'box', { size: [1.3, 1.3], height: 26, ...extra });
const hyp = (extra: Partial<SceneNode> = {}) => box('hyp', 0, 0, 'Hypervisor', 'purple', 'shield', { size: [3.4, 1.5], height: 18, ...extra });
const hw = (extra: Partial<SceneNode> = {}) => box('hw', 0, 7, 'Physical hardware', 'grey', 'cpu', { size: [3.4, 1.5], height: 12, ...extra });

const binomTail = (n: number, p: number, kMin: number): number => {
  // P(X ≥ kMin) for X ~ Binomial(n, p), computed in log space.
  if (kMin <= 0) return 1;
  if (kMin > n) return 0;
  let total = 0;
  let logC = 0; // log C(n, 0)
  for (let k = 0; k <= n; k++) {
    if (k > 0) logC += Math.log((n - k + 1) / k);
    if (k >= kMin) total += Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }
  return Math.min(1, total);
};
const fmtP = (p: number): string => (p >= 0.1 ? `${(p * 100).toFixed(0)}%` : p >= 0.001 ? `${(p * 100).toFixed(1)}%` : p > 0 ? `${(p * 100).toExponential(1)}%` : '0%');
const fmtS = (s: number): string => (s >= 120 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(s < 10 ? 1 : 0)} s`);

const lesson: Lesson = {
  slug: 'academy-how-virtual-machines-work',
  title: 'Virtual Machines: Hypervisors, Hardware Virtualisation and Overhead',
  blurb: 'Hypervisors, hardware-assisted CPU and memory virtualization, virtio and passthrough I/O — plus the statistics of overcommit and the arithmetic of live migration.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'ratio', label: 'vCPU : physical core ratio', icon: 'layers' },
    { key: 'demand', label: 'Average busy cores', icon: 'cpu' },
    { key: 'cont', label: 'Chance demand exceeds capacity', icon: 'alert' },
    { key: 'mig', label: 'Live-migration time', icon: 'refresh' },
  ],
  goals: [
    { text: 'What a hypervisor does and the two types', step: 2 },
    { text: 'How CPU virtualization works with hardware support', step: 3 },
    { text: 'Memory: nested page tables and ballooning', step: 4 },
    { text: 'I/O: emulation, virtio and passthrough', step: 5 },
    { text: 'Overcommit and live migration', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'vms', label: 'VMs on the host', min: 2, max: 200, step: 1, default: 40, unit: '', description: 'Virtual machines scheduled on one physical server.' },
      { key: 'vcpu', label: 'vCPUs per VM', min: 1, max: 32, step: 1, default: 4, unit: '', description: 'Virtual CPUs each VM is configured with.' },
      { key: 'cores', label: 'Physical cores', min: 4, max: 256, step: 1, default: 32, unit: '', description: 'Cores available on the host.' },
      { key: 'busy', label: 'Chance a VM is busy at a moment', min: 1, max: 100, step: 1, default: 15, unit: '%', description: 'Probability a VM uses all its vCPUs at a given instant (independent).' },
      { key: 'mem', label: 'VM memory (for migration)', min: 1, max: 512, step: 1, default: 32, unit: ' GB', description: 'RAM to copy when live-migrating a VM.' },
      { key: 'gbps', label: 'Migration network', min: 1, max: 100, step: 1, default: 10, unit: ' Gbps', description: 'Link used for the copy.' },
      { key: 'dirty', label: 'Memory dirtied by the guest', min: 0, max: 5000, step: 50, default: 200, unit: ' MB/s', description: 'How fast the running guest changes pages during migration.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, Math.round(input.vms ?? 40));
      const v = Math.max(1, Math.round(input.vcpu ?? 4));
      const cores = Math.max(1, Math.round(input.cores ?? 32));
      const u = Math.min(0.999, Math.max(0.001, (input.busy ?? 15) / 100));
      const mem = Math.max(0.1, input.mem ?? 32);
      const bw = Math.max(0.1, (input.gbps ?? 10) / 8); // GB/s
      const dirty = Math.max(0, (input.dirty ?? 200) / 1000); // GB/s
      const ratio = (n * v) / cores;
      // VMs busy simultaneously ~ Binomial(n, u); contention when busy VMs × vCPUs exceed physical cores.
      const maxBusy = Math.floor(cores / v);
      const pCont = binomTail(n, u, maxBusy + 1);
      // Pre-copy: each round re-sends pages dirtied during the previous one; converges only if bandwidth > dirty rate.
      const migrate = bw > dirty ? mem / (bw - dirty) : Infinity;
      return {
        ratio: step < 1 ? { v: '—' } : { v: `${ratio.toFixed(1)} : 1`, tone: ratio <= 2 ? 'good' : ratio <= 5 ? 'warn' : 'bad' },
        demand: step < 5 ? { v: '—' } : { v: `${(n * u * v).toFixed(1)} of ${cores}`, tone: n * u * v < cores * 0.6 ? 'good' : n * u * v < cores ? 'warn' : 'bad' },
        cont: step < 5 ? { v: '—' } : { v: fmtP(pCont), tone: pCont < 0.01 ? 'good' : pCont < 0.1 ? 'warn' : 'bad' },
        mig: step < 5 ? { v: '—' } : Number.isFinite(migrate) ? { v: fmtS(migrate), tone: migrate < 60 ? 'good' : 'warn' } : { v: 'never converges (dirty ≥ bandwidth)', tone: 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'One machine, many isolated computers',
      body: [
        'A server that runs one application sits mostly idle, but putting many applications on one OS means they share a kernel, libraries and failures. A <b>virtual machine</b> gives each workload its own complete operating system on <i>virtual</i> hardware, so different tenants, OS versions and security domains can share a physical server safely.',
        'This is the foundation of public cloud: instances are VMs, packed densely, started on demand and moved between hosts. The hard part is making virtual hardware both <b>isolated</b> and <b>fast</b>.',
      ],
      scene: { nodes: [vm(0, 3, 'VM A · Linux'), vm(1, 3, 'VM B · Windows'), vm(2, 3, 'VM C · Linux'), hyp(), hw()], links: [link('vm0', 'hyp'), link('vm1', 'hyp'), link('vm2', 'hyp'), link('hyp', 'hw')], flows: [] },
    },
    {
      short: 'Hypervisor',
      kind: 'technique',
      title: 'The hypervisor: referee between guests and hardware',
      body: [
        'A <b>hypervisor</b> (virtual machine monitor) creates VMs, schedules their virtual CPUs on real cores, divides memory and mediates devices. <b>Type 1</b> hypervisors run directly on hardware (Xen, VMware ESXi, Hyper-V, KVM in the Linux kernel); <b>type 2</b> run as an application on a host OS (VirtualBox, VMware Workstation) and suit desktops.',
        'Each guest believes it owns the machine. The hypervisor must trap and handle anything that would let a guest touch what it shouldn’t — privileged instructions, page-table changes, device access — while letting the ordinary instructions that make up nearly all execution run at full speed.',
      ],
      concepts: [{ term: 'Hypervisor', def: 'Software that creates and runs virtual machines by multiplexing physical CPU, memory and devices among guests.' }],
      scene: { nodes: [vm(0, 2, 'Guest OS'), vm(1, 2, 'Guest OS'), hyp({ tag: pill('schedules vCPUs · maps memory · mediates I/O', 'route') }), hw()], links: [link('vm0', 'hyp'), link('vm1', 'hyp'), link('hyp', 'hw')], flows: [] },
    },
    {
      short: 'CPU',
      kind: 'technique',
      title: 'CPU virtualization: from trapping to hardware support',
      body: [
        'Classic <b>trap-and-emulate</b>: run the guest kernel deprivileged; when it executes a privileged instruction the CPU traps to the hypervisor, which emulates the effect. Early x86 couldn’t do this cleanly (some sensitive instructions didn’t trap), so VMware used binary translation and Xen used paravirtualization (modified guests).',
        'Modern CPUs add <b>VT-x / AMD-V</b>: a new mode where the guest kernel runs at full privilege <i>inside</i> a virtual context, and only specific events cause a <b>VM exit</b> back to the hypervisor. Ordinary computation runs at native speed; the cost lives in exits (microseconds each), so performance work is largely about reducing them.',
      ],
      changes: [{ text: 'Guest instructions run natively', tone: 'good' }, { text: 'Sensitive events → VM exit (costly)', tone: 'info' }],
      scene: { nodes: [vm(0, 1, 'Guest kernel', { tag: pill('runs at native speed', 'bolt', 'good') }), hyp({ tag: pill('VM exit on sensitive events', 'alert', 'warn') }), hw()], links: [link('vm0', 'hyp', { arrow: 'both' }), link('hyp', 'hw')], flows: [flow(['vm0', 'hyp'], { rate: 0.6, back: true })] },
    },
    {
      short: 'Memory',
      kind: 'technique',
      title: 'Memory: two levels of address translation',
      body: [
        'The guest maps its <i>virtual</i> addresses to <i>guest-physical</i> ones; the hypervisor maps guest-physical to <i>host-physical</i>. Hardware <b>nested paging</b> (Intel EPT, AMD NPT) walks both tables in the MMU, cached in the TLB — fast on a hit, but a miss can cost many memory accesses, which is why huge pages matter for VM performance.',
        'Because memory is just host RAM under a map, the hypervisor can play tricks: <b>ballooning</b> (a guest driver claims pages to give back to the host), <b>page sharing</b> (identical pages stored once — mostly disabled now for security), and <b>swapping</b> guest memory (slow, last resort). Overcommitting memory risks the host swapping and everything crawling.',
      ],
      changes: [{ text: 'Guest virtual → guest physical → host physical', tone: 'info' }, { text: 'TLB misses are costlier; use huge pages', tone: 'info' }],
      scene: { nodes: [box('gv', -10, 0, 'Guest virtual', 'teal', 'list', { size: [1.2, 1.2], height: 18 }), box('gp', 0, 0, 'Guest physical', 'purple', 'list', { size: [1.2, 1.2], height: 18 }), box('hp', 10, 0, 'Host physical', 'grey', 'list', { size: [1.2, 1.2], height: 18 })], links: [link('gv', 'gp', { arrow: 'end', label: pill('guest page table', 'layers') }), link('gp', 'hp', { arrow: 'end', label: pill('EPT / NPT', 'layers') })], flows: [flow(['gv', 'gp', 'hp'], { rate: 1 })] },
    },
    {
      short: 'I/O',
      kind: 'technique',
      title: 'Devices: emulate, paravirtualize or pass through',
      body: [
        '<b>Emulation</b>: the hypervisor pretends to be a real NIC or disk; the guest uses its ordinary driver, and every register access exits — compatible and slow. <b>Paravirtual (virtio)</b>: the guest knows it is virtual and uses shared-memory ring buffers with the host, batching I/O to avoid exits — the standard for cloud disks and networking. <b>Passthrough / SR-IOV</b>: give the VM a hardware slice of a real device directly (IOMMU-protected) for near-native speed, at the cost of flexibility and live-migration difficulty.',
        'Cloud providers push I/O into dedicated <b>offload cards</b> so the host CPUs and hypervisor stay thin and tenants get consistent performance.',
      ],
      scene: { nodes: [vm(0, 3, 'Emulated NIC', { tag: pill('slow, compatible', 'clock', 'warn') }), vm(1, 3, 'virtio', { tag: pill('shared rings, fast', 'check', 'good') }), vm(2, 3, 'SR-IOV', { tag: pill('near native', 'bolt', 'good') }), hyp(), hw()], links: [link('vm0', 'hyp'), link('vm1', 'hyp'), link('vm2', 'hw', { style: 'dashed' })], flows: [flow(['vm1', 'hyp'], { rate: 2 })] },
    },
    {
      short: 'Overcommit',
      kind: 'tradeoff',
      title: 'Overcommit and the statistics of contention',
      body: [
        'Most VMs are idle most of the time, so providers sell more vCPUs than physical cores. 40 VMs × 4 vCPUs on 32 cores is <b>5 : 1</b> overcommit. If each VM is busy independently 15% of the time, the busy count is Binomial(40, 0.15): about 6 busy VMs = 24 cores on average — but the chance that <b>more than 8 are busy at once</b> (needing &gt; 32 cores) is roughly <b>14%</b>. In those moments VMs wait for CPU: <b>steal time</b>.',
        'Overcommit raises revenue and utilisation and risks noisy-neighbour latency; dedicated or “burstable” tiers expose the trade. Use the sliders: lowering the busy probability or ratio collapses contention quickly. Memory is rarely overcommitted as aggressively because reclaiming it is far more painful than waiting for a core.',
      ],
      changes: [{ text: '5:1 ratio, 15% busy → ~14% chance of contention', tone: 'bad' }, { text: 'Steal time = vCPU ready but no core free', tone: 'info' }],
      concepts: [{ term: 'Steal time', def: 'The share of time a virtual CPU was ready to run but the hypervisor had no physical core to give it.' }],
      scene: { nodes: [vm(0, 4, 'VM busy', { load: 100 }), vm(1, 4, 'VM busy', { load: 100 }), vm(2, 4, 'VM idle', { load: 5 }), vm(3, 4, 'VM busy', { load: 100 }), hyp({ tag: pill('160 vCPUs on 32 cores', 'gauge', 'warn') }), hw()], links: [link('vm0', 'hyp'), link('vm1', 'hyp'), link('vm3', 'hyp'), link('hyp', 'hw')], flows: [] },
    },
    {
      short: 'Migration',
      kind: 'technique',
      title: 'Live migration: moving a running VM',
      body: [
        '<b>Pre-copy</b> migration copies all of the VM’s memory to the target while it keeps running, then repeatedly re-sends the pages dirtied in the meantime, until the remaining set is small enough to pause the VM for a few milliseconds, send the last pages and CPU state, and resume it on the target. Network identity moves with it, so connections survive.',
        'It converges only if the link is faster than the guest dirties memory: total time ≈ <code>memory ÷ (bandwidth − dirty rate)</code>. 32 GB over 10 Gbps (1.25 GB/s) with 200 MB/s dirtied is <b>~30 s</b>; at 1.2 GB/s dirtied it never converges, so hypervisors throttle the guest, compress pages or fall back to <b>post-copy</b> (move first, fetch pages on demand). Migration lets providers patch hosts and rebalance load without downtime.',
      ],
      changes: [{ text: 'time ≈ memory ÷ (bandwidth − dirty rate)', tone: 'info' }, { text: 'Dirty ≥ bandwidth → throttle, compress or post-copy', tone: 'bad' }],
      scene: { nodes: [box('a', -9, 0, 'Source host', 'blue', 'server', { size: [1.6, 1.6], height: 28 }), box('b', 9, 0, 'Target host', 'blue', 'server', { size: [1.6, 1.6], height: 28, tag: pill('resumes in ms', 'check', 'good') })], links: [link('a', 'b', { arrow: 'end' })], flows: [flow(['a', 'b'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Native speed by default, exits where isolation demands',
      body: [
        'A hypervisor multiplexes CPU, memory and devices among guests. Hardware virtualization runs guest code natively and traps only sensitive events; nested paging handles memory; virtio and SR-IOV make I/O fast; overcommit exploits idleness at the price of contention (Binomial tail); live migration copies memory iteratively, converging only if bandwidth beats the dirty rate.',
        'Compared with containers, VMs offer stronger isolation and their own kernels at higher overhead and slower start — which is why micro-VMs (Firecracker) aim to combine both. Figures here are model outputs for illustration.',
      ],
      scene: { nodes: [vm(0, 3, 'VM'), vm(1, 3, 'VM'), vm(2, 3, 'VM'), hyp(), hw()], links: [link('vm0', 'hyp'), link('vm1', 'hyp'), link('vm2', 'hyp'), link('hyp', 'hw')], flows: [] },
    },
  ],
};

export default lesson;
