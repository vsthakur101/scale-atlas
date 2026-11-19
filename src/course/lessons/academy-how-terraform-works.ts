import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const code = (extra: Partial<SceneNode> = {}) => box('code', -16, 0, 'Config (.tf in Git)', 'green', 'file', { size: [1.3, 1.3], height: 24, ...extra });
const tf = (extra: Partial<SceneNode> = {}) => box('tf', -8, 0, 'Terraform engine', 'purple', 'refresh', { size: [1.5, 1.5], height: 32, ...extra });
const state = (extra: Partial<SceneNode> = {}) => db('state', -8, 8, 'State file', { size: [1.3, 1.3], ...extra });
const prov = (extra: Partial<SceneNode> = {}) => box('prov', 1, 0, 'Provider plugin', 'orange', 'route', { size: [1.3, 1.3], height: 26, ...extra });
const cloud = (extra: Partial<SceneNode> = {}) => box('cloud', 10, 0, 'Cloud API', 'blue', 'globe', { size: [1.4, 1.4], height: 30, ...extra });

const fmtS = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 120 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);

const lesson: Lesson = {
  slug: 'academy-how-terraform-works',
  title: 'How Terraform Works',
  blurb: 'Declare infrastructure, diff it against recorded state and reality, execute the dependency graph in parallel — and why one big state file is a blast radius.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'apply', label: 'Apply time', icon: 'clock' },
    { key: 'bound', label: 'Limited by', icon: 'gauge' },
    { key: 'refresh', label: 'Plan: refresh time', icon: 'refresh' },
    { key: 'blast', label: 'Resources at risk per bad apply', icon: 'alert' },
  ],
  goals: [
    { text: 'Declarative configuration versus scripts', step: 1 },
    { text: 'The plan: desired vs state vs reality', step: 2 },
    { text: 'The dependency graph and parallel apply', step: 3 },
    { text: 'State: what it is, where it lives, locking', step: 4 },
    { text: 'Splitting state to limit the blast radius', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Resources in the configuration', min: 5, max: 5000, step: 5, default: 200, unit: '', description: 'Resources managed together.' },
      { key: 'par', label: 'Parallelism', min: 1, max: 100, step: 1, default: 10, unit: '', description: 'Operations Terraform runs at once (default 10).' },
      { key: 'sec', label: 'Average time per resource', min: 1, max: 300, step: 1, default: 20, unit: ' s', description: 'Create/update time per resource (databases and clusters take minutes).' },
      { key: 'depth', label: 'Longest dependency chain', min: 1, max: 100, step: 1, default: 12, unit: '', description: 'Resources that must be created strictly one after another.' },
      { key: 'states', label: 'Separate state files', min: 1, max: 50, step: 1, default: 1, unit: '', description: 'How many independent configurations the resources are split into.' },
      { key: 'read', label: 'Time to refresh one resource', min: 0.1, max: 5, step: 0.1, default: 0.5, unit: ' s', description: 'API read per resource during plan.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, input.n ?? 200);
      const par = Math.max(1, Math.round(input.par ?? 10));
      const sec = Math.max(0.1, input.sec ?? 20);
      const depth = Math.min(n, Math.max(1, Math.round(input.depth ?? 12)));
      const states = Math.max(1, Math.round(input.states ?? 1));
      const read = Math.max(0.01, input.read ?? 0.5);
      // Parallel apply is bounded by the critical path and by total work ÷ parallelism.
      const crit = depth * sec;
      const work = (n * sec) / par;
      const apply = Math.max(crit, work);
      const refresh = (n * read) / par;
      return {
        apply: step < 2 ? { v: '—' } : { v: fmtS(apply), tone: apply < 300 ? 'good' : apply < 1800 ? 'warn' : 'bad' },
        bound: step < 2 ? { v: '—' } : { v: crit >= work ? 'dependency chain (more parallelism won’t help)' : 'parallelism (raise it or split the work)', tone: crit >= work ? 'warn' : undefined },
        refresh: step < 1 ? { v: '—' } : { v: fmtS(refresh), tone: refresh < 60 ? 'good' : refresh < 300 ? 'warn' : 'bad' },
        blast: step < 4 ? { v: '—' } : { v: `${Math.ceil(n / states)} of ${n}`, tone: n / states > 300 ? 'bad' : n / states > 100 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Declarative',
      kind: 'insight',
      title: 'Describe the end state, not the steps',
      body: [
        'A script says <i>how</i>: “create a network, then a subnet, then a server” — and breaks when run twice or when something already exists. Terraform configuration says <i>what</i>: “there is a network, a subnet in it, and two servers in the subnet”. The engine works out which resources to create, change or destroy to make reality match, and in what order.',
        'The configuration lives in Git, is reviewed like code, and is the single description of the environment. Provider plugins translate resources into API calls for AWS, GCP, Azure, Kubernetes, GitHub, DNS and hundreds of other services. (OpenTofu and Pulumi follow the same model with different front ends.)',
      ],
      scene: { nodes: [code({ tag: pill('what I want', 'file') }), tf(), prov(), cloud()], links: [link('code', 'tf'), link('tf', 'prov'), link('prov', 'cloud')], flows: [flow(['code', 'tf', 'prov', 'cloud'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Plan',
      kind: 'technique',
      title: 'Plan: three-way comparison',
      body: [
        '<code>terraform plan</code> compares three things: the <b>desired</b> configuration, the <b>state</b> (what Terraform last recorded it created) and <b>reality</b> (it <i>refreshes</i> by reading every managed resource from the provider API). The difference is a plan of <b>+ create, ~ update in place, −/+ replace, − destroy</b>, shown for review before anything changes.',
        'Refresh costs an API read per resource: 200 resources at 0.5 s each with parallelism 10 is ~10 s; 5,000 resources takes several minutes — a reason big configurations plan slowly. A plan that shows a surprising destroy or replacement is the safety net: <b>read it</b>, and apply the saved plan file so exactly what you reviewed is what runs.',
      ],
      changes: [{ text: 'Desired vs state vs reality → + ~ −/+ −', tone: 'info' }, { text: 'Apply the reviewed, saved plan', tone: 'good' }],
      scene: { nodes: [code(), state({ tag: pill('last known', 'file') }), tf({ tag: pill('refresh + diff', 'search') }), cloud({ tag: pill('reality', 'globe') })], links: [link('code', 'tf'), link('state', 'tf', { arrow: 'both' }), link('tf', 'cloud', { arrow: 'both' })], flows: [flow(['tf', 'cloud'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Graph',
      kind: 'technique',
      title: 'A dependency graph, executed in parallel',
      body: [
        'References between resources (a subnet uses <code>aws_vpc.main.id</code>) form a <b>directed acyclic graph</b>. Terraform walks it, running independent resources concurrently (10 at a time by default) and waiting on dependencies. Destruction runs the graph in reverse.',
        'Total time is bounded two ways: the <b>critical path</b> — the longest chain that must run sequentially (12 deep × 20 s = 240 s) — and <b>total work ÷ parallelism</b> (200 × 20 s ÷ 10 = 400 s). The larger wins: 400 s here, so more parallelism would help; if the chain were 30 deep, the 600 s critical path would dominate and no parallelism setting could speed it up. Slow resources (databases, clusters, certificates) dominate both.',
      ],
      changes: [{ text: 'Time ≥ max(critical path, work ÷ parallelism)', tone: 'info' }, { text: '200 resources, depth 12, parallelism 10 → ~400 s', tone: 'info' }],
      scene: { nodes: [box('vpc', -10, 0, 'VPC', 'blue', 'globe', { size: [1.1, 1.1], height: 20 }), box('s1', -2, -5, 'Subnet A', 'teal', 'route', { size: [1.1, 1.1], height: 18 }), box('s2', -2, 5, 'Subnet B', 'teal', 'route', { size: [1.1, 1.1], height: 18 }), box('v1', 7, -5, 'Server 1', 'orange', 'server', { size: [1.1, 1.1], height: 22 }), box('v2', 7, 5, 'Server 2', 'orange', 'server', { size: [1.1, 1.1], height: 22 })], links: [link('vpc', 's1', { arrow: 'end' }), link('vpc', 's2', { arrow: 'end' }), link('s1', 'v1', { arrow: 'end' }), link('s2', 'v2', { arrow: 'end' })], flows: [flow(['vpc', 's1', 'v1'], { rate: 1 }), flow(['vpc', 's2', 'v2'], { rate: 1 })] },
    },
    {
      short: 'State',
      kind: 'technique',
      title: 'State: the memory that makes it work',
      body: [
        'State maps each resource in your configuration to the real object’s id and attributes, so Terraform knows that <code>aws_instance.web</code> <i>is</i> instance <code>i-0abc…</code> and can detect renames, drift and deletions. Lose the state and Terraform thinks nothing exists and tries to create everything again (or you must <code>import</code> it all).',
        'So state lives in a <b>remote backend</b> (object storage with versioning, or Terraform Cloud) with <b>locking</b> so two applies can’t run concurrently and corrupt it. It <b>contains secrets</b> (passwords, keys appear in plain text), so encrypt it and restrict access. <b>Drift</b> — someone changing a resource in the console — is detected at the next plan and either reverted or adopted into code.',
      ],
      changes: [{ text: 'Remote backend + locking + encryption', tone: 'good' }, { text: 'State holds secrets in plain text', tone: 'bad' }, { text: 'Drift shows up in the next plan', tone: 'info' }],
      scene: { nodes: [tf({ tag: pill('acquires lock', 'lock') }), db('remote', 4, 0, 'Remote state (versioned)', { size: [1.4, 1.4], tag: pill('encrypted', 'shield') }), box('eng2', -8, 8, 'Second engineer', 'green', 'user', { size: [1.1, 1.1], height: 22, tag: pill('blocked until unlocked', 'clock', 'warn') })], links: [link('tf', 'remote', { arrow: 'both' }), link('eng2', 'remote', { style: 'dashed' })], flows: [flow(['tf', 'remote'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Blast radius',
      kind: 'tradeoff',
      title: 'One state is one blast radius',
      body: [
        'Everything in one configuration shares one state, one lock and one plan: planning 5,000 resources is slow, any engineer applying blocks the rest, and a mistake — a bad variable, a misplaced <code>destroy</code> — can affect <b>all</b> of them. Split by <b>lifecycle and ownership</b>: network and identity (rarely changes), data stores (careful), applications (frequent), per environment and per team.',
        'With 200 resources in one state a bad apply puts 200 at risk; split into 8 states, 25. Connect them with data sources or remote-state outputs (not copy-pasted ids), and add guard rails: <code>prevent_destroy</code> on databases, policy-as-code checks in CI, plan review for any destroy, and least-privilege credentials per state. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: '1 state: 200 at risk · 8 states: 25 at risk', tone: 'good' }, { text: 'prevent_destroy, policy checks, scoped credentials', tone: 'good' }],
      scene: { nodes: [box('net', -9, -5, 'network state', 'blue', 'globe', { size: [1.2, 1.2], height: 20 }), box('data', 0, -5, 'data state', 'red', 'db', { size: [1.2, 1.2], height: 24, tag: pill('prevent_destroy', 'lock', 'good') }), box('app', 9, -5, 'app state', 'green', 'server', { size: [1.2, 1.2], height: 22 }), box('envs', 0, 6, 'per environment', 'purple', 'layers', { size: [1.2, 1.2], height: 20 })], links: [link('net', 'data', { style: 'dashed', arrow: 'end' }), link('data', 'app', { style: 'dashed', arrow: 'end' })], flows: [] },
    },
    {
      short: 'Pipeline',
      kind: 'technique',
      title: 'Terraform in a pipeline',
      body: [
        'Run Terraform from CI, not laptops: <b>plan on every pull request</b> and post the diff for review; <b>apply on merge</b> with credentials the pipeline holds; keep versions pinned (<code>required_version</code>, provider lock file) so plans are reproducible; scan plans for policy violations (open security groups, unencrypted storage) and cost. This is the GitOps loop for infrastructure.',
        'Treat modules as versioned libraries, not copy-paste; test with <code>validate</code>, linting, and ephemeral environments for risky changes. Prefer small, frequent applies over rare large ones — big diffs are where surprises hide.',
      ],
      scene: { nodes: [code({ name: 'Pull request' }), box('ci', -8, 0, 'CI: plan + policy', 'orange', 'check', { size: [1.3, 1.3], height: 26 }), tf({ name: 'Apply on merge' }), cloud()], links: [link('code', 'ci'), link('ci', 'tf'), link('tf', 'cloud')], flows: [flow(['code', 'ci', 'tf', 'cloud'], { rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Desired state, diffed, executed as a graph',
      body: [
        'Terraform reads declarative configuration, refreshes real resources, diffs against state to produce a <b>plan</b>, and executes a <b>dependency graph</b> in parallel — apply time ≈ <code>max(critical path, work ÷ parallelism)</code>. <b>State</b> links config to real ids and must be remote, locked, encrypted and backed up.',
        'Split state by lifecycle to bound blast radius, read every plan, run it from CI and pin versions.',
      ],
      scene: { nodes: [code(), tf(), state(), prov(), cloud()], links: [link('code', 'tf'), link('state', 'tf', { arrow: 'both' }), link('tf', 'prov'), link('prov', 'cloud')], flows: [flow(['code', 'tf', 'prov', 'cloud'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
