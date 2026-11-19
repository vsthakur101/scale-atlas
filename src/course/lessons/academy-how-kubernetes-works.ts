import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => box('user', -15, -7, 'kubectl / CI', 'green', 'user', { size: [1.1, 1.1], height: 22, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', -6, -7, 'API server', 'purple', 'server', { size: [1.4, 1.4], height: 32, ...extra });
const etcd = (extra: Partial<SceneNode> = {}) => db('etcd', 3, -10, 'etcd', { size: [1.2, 1.2], ...extra });
const ctrl = (extra: Partial<SceneNode> = {}) => box('ctrl', 3, -4, 'Controllers', 'teal', 'refresh', { size: [1.2, 1.2], height: 24, ...extra });
const sched = (extra: Partial<SceneNode> = {}) => box('sched', 12, -7, 'Scheduler', 'orange', 'gauge', { size: [1.2, 1.2], height: 24, ...extra });
const node = (i: number, name: string, extra: Partial<SceneNode> = {}) => box(`n${i}`, -8 + i * 8, 6, name, 'blue', 'server', { size: [1.5, 1.5], height: 30, ...extra });

const lesson: Lesson = {
  slug: 'academy-how-kubernetes-works',
  title: 'How Kubernetes Works',
  blurb: 'A cluster that continuously reconciles what you declared with what is running: API server, etcd, controllers, scheduler and kubelet — plus the arithmetic of packing and autoscaling.',
  minutes: 15,
  level: 'Intermediate',
  metrics: [
    { key: 'fit', label: 'Pods that fit on one node', icon: 'layers' },
    { key: 'nodes', label: 'Nodes needed', icon: 'server' },
    { key: 'resv', label: 'CPU reserved vs capacity', icon: 'gauge' },
    { key: 'hpa', label: 'Autoscaler wants replicas', icon: 'activity' },
  ],
  goals: [
    { text: 'Declarative desired state and the reconciliation loop', step: 2 },
    { text: 'What each control-plane component does', step: 3 },
    { text: 'How the scheduler packs pods using requests', step: 4 },
    { text: 'Services, rollouts and self-healing', step: 5 },
    { text: 'Autoscaling: HPA, VPA and cluster autoscaler', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'pods', label: 'Pods to run', min: 10, max: 10000, step: 10, default: 300, unit: '', description: 'Total replicas across the workload.' },
      { key: 'req', label: 'CPU request per pod', min: 50, max: 4000, step: 50, default: 500, unit: ' mCPU', description: 'What each pod asks the scheduler to reserve (1000 mCPU = 1 core).' },
      { key: 'cores', label: 'Cores per node', min: 2, max: 96, step: 2, default: 16, unit: '', description: 'CPU of each worker node.' },
      { key: 'sys', label: 'Reserved for system/kubelet', min: 0, max: 40, step: 1, default: 10, unit: '%', description: 'Share of a node not available to pods.' },
      { key: 'cur', label: 'Current replicas (autoscaler)', min: 1, max: 500, step: 1, default: 10, unit: '', description: 'Replicas running now.' },
      { key: 'util', label: 'Current CPU utilisation', min: 5, max: 300, step: 5, default: 90, unit: '%', description: 'Average CPU use as a percentage of requests.' },
      { key: 'target', label: 'Target utilisation', min: 20, max: 95, step: 5, default: 60, unit: '%', description: 'What the HorizontalPodAutoscaler tries to maintain.' },
    ],
    calculate: (input, step) => {
      const pods = Math.max(1, Math.round(input.pods ?? 300));
      const req = Math.max(1, input.req ?? 500);
      const cores = Math.max(1, input.cores ?? 16);
      const sys = Math.min(0.9, Math.max(0, (input.sys ?? 10) / 100));
      const cur = Math.max(1, Math.round(input.cur ?? 10));
      const util = Math.max(1, input.util ?? 90);
      const target = Math.max(1, input.target ?? 60);
      const alloc = cores * 1000 * (1 - sys);
      const fit = Math.max(1, Math.min(110, Math.floor(alloc / req)));
      const nodes = Math.ceil(pods / fit);
      const resv = (pods * req) / (nodes * cores * 1000);
      // HPA: desired = ceil(current × currentMetric ÷ target)
      const desired = Math.ceil((cur * util) / target);
      return {
        fit: step < 3 ? { v: '—' } : { v: `${fit}${fit === 110 ? ' (capped at 110)' : ''}` },
        nodes: step < 3 ? { v: '—' } : { v: `${nodes}`, tone: nodes > 200 ? 'warn' : 'good' },
        resv: step < 3 ? { v: '—' } : { v: `${(resv * 100).toFixed(0)}% of node CPU`, tone: resv > 0.8 ? 'good' : resv > 0.6 ? 'warn' : 'bad' },
        hpa: step < 5 ? { v: '—' } : { v: `${desired} (now ${cur})`, tone: desired > cur ? 'warn' : desired < cur ? 'good' : undefined },
      };
    },
  },
  steps: [
    {
      short: 'Problem',
      kind: 'problem',
      title: 'Running containers across many machines',
      body: [
        'One container on one host is easy. Hundreds of them across dozens of machines raises questions nobody wants to answer by hand: <b>where</b> does each run, what happens when a machine dies, how do others <b>find</b> it, how do you roll out a new version without downtime, how do you scale up at peak?',
        '<b>Kubernetes</b> is an orchestrator that answers all of them with one idea: you tell it the <b>desired state</b> (“run 3 copies of this image, exposed on port 80”) and it works continuously to make reality match.',
      ],
      scene: { nodes: [node(0, 'Node 1'), node(1, 'Node 2'), node(2, 'Node 3', { state: 'down', tone: 'red', tag: pill('died', 'alert', 'bad') })], links: [], flows: [] },
    },
    {
      short: 'Desired state',
      kind: 'technique',
      title: 'Declare it; controllers make it so',
      body: [
        'You submit objects — a <b>Deployment</b> asking for 3 replicas — to the API. Each object has a <code>spec</code> (what you want) and a <code>status</code> (what is). A <b>controller</b> runs an endless <b>reconciliation loop</b>: observe actual state, compare with desired, act to close the gap. Three replicas wanted, two running → create one. A node dies → the pods on it vanish → the loop notices and creates replacements elsewhere.',
        'This level-triggered design is why Kubernetes is resilient: it doesn’t remember “do X once”, it keeps asking “is the world as declared?”. A missed event, a restarted controller or a half-finished action is fixed on the next pass. Everything — Deployments, Services, Jobs, your own custom resources — works this way.',
      ],
      changes: [{ text: 'spec = desired · status = observed', tone: 'info' }, { text: 'Controller loop: observe → compare → act', tone: 'good' }],
      concepts: [{ term: 'Reconciliation loop', def: 'A controller repeatedly compares desired and actual state and takes actions to make them match.' }],
      scene: { nodes: [user({ tag: pill('replicas: 3', 'file') }), api(), ctrl({ tag: pill('have 2, want 3 → create 1', 'refresh') }), etcd()], links: [link('user', 'api'), link('api', 'etcd'), link('ctrl', 'api', { arrow: 'both' })], flows: [flow(['user', 'api', 'etcd'], { kind: 'write', rate: 1 }), flow(['ctrl', 'api'], { rate: 1, back: true })] },
    },
    {
      short: 'Control plane',
      kind: 'technique',
      title: 'API server, etcd, scheduler, controllers, kubelet',
      body: [
        'The <b>API server</b> is the only front door: authenticates, validates and stores objects, and serves watches. <b>etcd</b> is the consistent (Raft-based) key–value store holding all cluster state — the one thing you must back up. The <b>scheduler</b> watches for pods with no node and assigns them one. <b>Controller manager</b> runs the standard controllers (ReplicaSet, Node, Job…).',
        'On every worker, the <b>kubelet</b> watches for pods assigned to its node, tells the container runtime (containerd) to run them, runs health probes and reports status; <b>kube-proxy</b> (or an eBPF dataplane) programs the network rules for Services. All components talk <i>through</i> the API server — none talks directly to another, which keeps the system loosely coupled and observable.',
      ],
      scene: { nodes: [user(), api(), etcd(), sched(), ctrl(), node(0, 'Node · kubelet'), node(1, 'Node · kubelet')], links: [link('user', 'api'), link('api', 'etcd'), link('sched', 'api', { arrow: 'both' }), link('ctrl', 'api', { arrow: 'both' }), link('n0', 'api', { style: 'dashed', arrow: 'both' }), link('n1', 'api', { style: 'dashed', arrow: 'both' })], flows: [flow(['user', 'api', 'etcd'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Scheduling',
      kind: 'technique',
      title: 'The scheduler packs pods by their requests',
      body: [
        'Each pod declares <b>requests</b> (CPU and memory it needs reserved) and optional <b>limits</b> (a ceiling; CPU is throttled, memory over the limit is OOM-killed). The scheduler <b>filters</b> out nodes that can’t fit the pod (insufficient allocatable resources, taints, affinity rules, volume zone) then <b>scores</b> the rest (spread, balance, locality) and binds the pod to the winner.',
        'It schedules by <i>requests</i>, not actual use. A 16-core node with 10% reserved for the system has 14.4 cores allocatable: it fits <b>28 pods of 500 mCPU</b> (cap: 110 pods per node by default). 300 such pods need <b>11 nodes</b>, reserving ~85% of CPU. Over-stating requests wastes money; under-stating causes noisy neighbours and evictions. Right-sizing requests is the central cost lever.',
      ],
      changes: [{ text: 'Filter → score → bind', tone: 'info' }, { text: '14.4 cores ÷ 0.5 = 28 pods/node → 300 pods = 11 nodes', tone: 'info' }],
      concepts: [{ term: 'Request vs limit', def: 'A request is what the scheduler reserves for a pod; a limit is the maximum it may use before throttling or being killed.' }],
      scene: { nodes: [sched({ tag: pill('fits? score? bind', 'check') }), node(0, 'Node · 28 pods', { load: 85 }), node(1, 'Node · 28 pods', { load: 85 }), box('pod', -15, 6, 'Pending pod', 'yellow', 'box', { size: [1, 1], height: 16 })], links: [link('pod', 'sched', { style: 'dashed' }), link('sched', 'n0'), link('sched', 'n1')], flows: [flow(['pod', 'sched', 'n1'], { rate: 1.2 })] },
    },
    {
      short: 'Services',
      kind: 'technique',
      title: 'Stable names for moving pods, and zero-downtime rollouts',
      body: [
        'Pods come and go with new IPs, so a <b>Service</b> gives a set of pods (selected by labels) one stable virtual IP and DNS name and load-balances across the <i>ready</i> ones; <b>readiness probes</b> decide which pods receive traffic and <b>liveness probes</b> restart hung containers. <b>Ingress</b> / Gateway routes external HTTP traffic to Services.',
        'A <b>Deployment</b> rolls out a new version by creating pods of the new ReplicaSet and removing old ones gradually, governed by <code>maxSurge</code> and <code>maxUnavailable</code> and gated by readiness — a bad version stalls the rollout instead of taking everything down, and <code>rollout undo</code> reverts it. That is self-healing and safe change in one mechanism.',
      ],
      changes: [{ text: 'Service = stable IP + DNS over ready pods', tone: 'good' }, { text: 'Rolling update gated by readiness', tone: 'good' }],
      scene: { nodes: [box('svc', -6, 0, 'Service (stable IP)', 'orange', 'route', { size: [1.3, 1.3], height: 26 }), box('p1', 6, -6, 'Pod v1', 'blue', 'box', { size: [1.1, 1.1], height: 22, tag: pill('draining', 'pause') }), box('p2', 6, 0, 'Pod v2', 'green', 'box', { size: [1.1, 1.1], height: 22, tag: pill('ready', 'check', 'good') }), box('p3', 6, 6, 'Pod v2', 'green', 'box', { size: [1.1, 1.1], height: 22, tag: pill('starting', 'clock', 'warn') })], links: [link('svc', 'p1', { style: 'dashed' }), link('svc', 'p2'), link('svc', 'p3', { style: 'dashed' })], flows: [flow(['svc', 'p2'], { rate: 2 })] },
    },
    {
      short: 'Autoscaling',
      kind: 'technique',
      title: 'Scale pods, then scale nodes',
      body: [
        'The <b>Horizontal Pod Autoscaler</b> computes <code>desired = ⌈current × currentMetric ÷ target⌉</code>: 10 replicas at 90% CPU with a 60% target → <b>15</b>. It evaluates periodically (~15 s) with stabilisation windows to avoid flapping. The <b>Vertical Pod Autoscaler</b> adjusts requests; <b>KEDA</b>-style scalers react to queue depth or custom metrics (including scale to zero).',
        'More pods need room: the <b>Cluster Autoscaler</b> (or Karpenter) adds nodes when pods stay <i>pending</i> for lack of capacity and removes under-used ones. Mind the lag: HPA reacts in tens of seconds, new nodes take minutes — keep headroom or over-provision placeholders for spiky load. Autoscaling works on <i>requests</i>, so wrong requests mean wrong scaling.',
      ],
      changes: [{ text: 'HPA: ⌈10 × 90 ÷ 60⌉ = 15 replicas', tone: 'info' }, { text: 'Pending pods → cluster autoscaler adds nodes (minutes)', tone: 'info' }],
      scene: { nodes: [box('hpa', -8, 0, 'HPA', 'teal', 'gauge', { size: [1.3, 1.3], height: 26, tag: pill('10 → 15 replicas', 'activity') }), box('dep', 4, 0, 'Deployment', 'blue', 'layers', { size: [1.3, 1.3], height: 26 }), box('ca', 15, 0, 'Cluster autoscaler', 'purple', 'server', { size: [1.3, 1.3], height: 26, tag: pill('+1 node', 'bolt') })], links: [link('hpa', 'dep', { arrow: 'end' }), link('dep', 'ca', { style: 'dashed', arrow: 'end' })], flows: [flow(['hpa', 'dep'], { rate: 1.2 }), flow(['dep', 'ca'], { rate: 0.6 })] },
    },
    {
      short: 'Failure',
      kind: 'insight',
      title: 'What happens when things break',
      body: [
        '<b>Container crashes</b>: kubelet restarts it with backoff (CrashLoopBackOff). <b>Node dies</b>: the node controller marks it NotReady after a grace period (~40 s by default), evicts its pods after a timeout (~5 min unless configured), and the ReplicaSet creates replacements elsewhere — so tune probes and tolerations for faster failover. <b>Control plane down</b>: running pods keep running; you just can’t change anything until it returns.',
        '<b>etcd</b> loss is the catastrophic case — keep it on fast disks, multi-node, and backed up. Use PodDisruptionBudgets for voluntary evictions (drains), topology spread to survive a zone, and resource requests everywhere so an overloaded node evicts the right pods first.',
      ],
      changes: [{ text: 'Node failure: ~40 s to NotReady, minutes to reschedule', tone: 'info' }, { text: 'Control plane down: workloads keep running', tone: 'good' }],
      scene: { nodes: [node(0, 'Node 1'), node(1, 'Node 2', { state: 'down', tone: 'red', tag: pill('NotReady', 'alert', 'bad') }), node(2, 'Node 3', { tag: pill('replacement pods', 'check', 'good') })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Declare, observe, reconcile',
      body: [
        'Kubernetes stores desired state in <b>etcd</b> via the <b>API server</b>; <b>controllers</b> reconcile reality to it, the <b>scheduler</b> packs pods onto nodes by <i>requests</i>, <b>kubelets</b> run them, <b>Services</b> give stable access, and autoscalers add pods (<code>⌈current × metric ÷ target⌉</code>) and nodes.',
        'Cost and reliability both hinge on honest requests, readiness probes, rollout settings and failure-domain spread. Figures here are model outputs for sizing, not benchmarks.',
      ],
      scene: { nodes: [api(), etcd(), ctrl(), sched(), node(0, 'Node'), node(1, 'Node')], links: [link('api', 'etcd'), link('ctrl', 'api', { arrow: 'both' }), link('sched', 'api', { arrow: 'both' }), link('n0', 'api', { style: 'dashed' }), link('n1', 'api', { style: 'dashed' })], flows: [flow(['ctrl', 'api'], { rate: 1, back: true })] },
    },
  ],
};

export default lesson;
