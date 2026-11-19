import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const dev = (extra: Partial<SceneNode> = {}) => box('dev', -16, 0, 'Engineer', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const git = (extra: Partial<SceneNode> = {}) => db('git', -8, 0, 'Git: desired state', { size: [1.4, 1.4], ...extra });
const agent = (extra: Partial<SceneNode> = {}) => box('agent', 1, 0, 'GitOps agent', 'purple', 'refresh', { size: [1.5, 1.5], height: 32, ...extra });
const cluster = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`k${i}`, 11, (i - (n - 1) / 2) * 5, name, 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });

const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 120 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);
const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'academy-how-gitops-works',
  title: 'How GitOps Works',
  blurb: 'Git as the single source of truth and an in-cluster agent that continuously reconciles reality to it: drift healing, rollbacks as reverts, and what the polling interval costs and buys.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'drift', label: 'Average time a manual change survives', icon: 'clock' },
    { key: 'rollback', label: 'Time from revert to rolled back', icon: 'refresh' },
    { key: 'gitreq', label: 'Git fetches per second (all clusters)', icon: 'activity' },
    { key: 'loops', label: 'Reconcile loops per hour', icon: 'layers' },
    { key: 'blast', label: 'Clusters hit by a bad commit', icon: 'alert' },
  ],
  goals: [
    { text: 'The four GitOps principles', step: 1 },
    { text: 'Pull-based reconciliation versus pipeline push', step: 2 },
    { text: 'Drift detection and self-healing', step: 3 },
    { text: 'Rollback as a Git revert, and promotion between environments', step: 4 },
    { text: 'Scale: polling, webhooks and progressive rollout', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'clusters', label: 'Clusters', min: 1, max: 1000, step: 1, default: 20, unit: '', description: 'Clusters each running an agent.' },
      { key: 'apps', label: 'Applications per cluster', min: 1, max: 500, step: 1, default: 50, unit: '', description: 'Managed resources groups per cluster.' },
      { key: 'poll', label: 'Poll / reconcile interval', min: 10, max: 900, step: 10, default: 180, unit: ' s', description: 'How often the agent checks Git and compares with the cluster.' },
      { key: 'apply', label: 'Time to apply a change', min: 5, max: 300, step: 5, default: 30, unit: ' s', description: 'Rollout time once the agent starts syncing.' },
      { key: 'waves', label: 'Rollout waves (progressive)', min: 1, max: 20, step: 1, default: 1, unit: '', description: 'Number of groups of clusters a change reaches in sequence; 1 = all at once.' },
    ],
    calculate: (input, step) => {
      const k = Math.max(1, Math.round(input.clusters ?? 20));
      const apps = Math.max(1, Math.round(input.apps ?? 50));
      const poll = Math.max(1, input.poll ?? 180);
      const apply = Math.max(1, input.apply ?? 30);
      const waves = Math.min(k, Math.max(1, Math.round(input.waves ?? 1)));
      return {
        drift: step < 2 ? { v: '—' } : { v: fmtT(poll / 2), tone: poll / 2 < 120 ? 'good' : 'warn' },
        rollback: step < 3 ? { v: '—' } : { v: `${fmtT(poll + apply)} (worst case)`, tone: poll + apply < 300 ? 'good' : 'warn' },
        gitreq: step < 4 ? { v: '—' } : { v: fmtN(k / poll), tone: k / poll > 5 ? 'warn' : 'good' },
        loops: step < 4 ? { v: '—' } : { v: fmtN((k * apps * 3600) / poll) },
        blast: step < 4 ? { v: '—' } : { v: `${Math.ceil(k / waves)} of ${k}`, tone: k / waves > 0.5 * k ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Principles',
      kind: 'insight',
      title: 'Git is the truth; the cluster follows it',
      body: [
        'GitOps applies the habits of software delivery to operations. Four principles: the system is described <b>declaratively</b> (Kubernetes manifests, Helm charts, Kustomize); the desired state is <b>versioned and immutable</b> in Git; approved changes are <b>pulled automatically</b> by software agents; and agents <b>continuously reconcile</b> — observing reality and correcting any difference.',
        'Every change to production is a commit and usually a pull request: reviewed, attributed, tested by CI, reversible. “What is running?” is answered by reading Git, and “who changed it and why?” by <code>git log</code>. Nobody needs direct cluster credentials to deploy.',
      ],
      scene: { nodes: [dev({ tag: pill('pull request', 'file') }), git({ tag: pill('manifests, reviewed', 'check') }), agent({ tag: pill('reconciles', 'refresh') }), cluster(0, 1, 'Cluster')], links: [link('dev', 'git'), link('git', 'agent'), link('agent', 'k0')], flows: [flow(['dev', 'git', 'agent', 'k0'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Pull vs push',
      kind: 'technique',
      title: 'An agent inside the cluster pulls',
      body: [
        'Classic CI/CD <b>pushes</b>: the pipeline holds cluster credentials and runs <code>kubectl apply</code>. GitOps <b>pulls</b>: an agent <i>inside</i> the cluster (Argo CD, Flux) watches a Git repository and applies what it finds. Credentials never leave the cluster, the cluster needs no inbound access, and the deploy keeps working when the CI system is down.',
        'CI still exists — it builds, tests and publishes the image — but its last step is to <b>commit</b> the new image tag to the config repo (or let an image-update automation do it). Separating the <b>app repository</b> (code) from the <b>config repository</b> (desired state) keeps deploys auditable and lets operations change config without a code release.',
      ],
      changes: [{ text: 'Credentials stay inside the cluster', tone: 'good' }, { text: 'CI builds; Git commit triggers the deploy', tone: 'info' }],
      scene: { nodes: [box('ci', -16, 0, 'CI: build + test', 'orange', 'check', { size: [1.3, 1.3], height: 26 }), git({ tag: pill('image: app:9f3c', 'hash') }), agent({ tag: pill('pulls, applies', 'refresh', 'good') }), cluster(0, 1, 'Cluster')], links: [link('ci', 'git'), link('git', 'agent'), link('agent', 'k0')], flows: [flow(['ci', 'git'], { kind: 'write', rate: 1 }), flow(['agent', 'git'], { rate: 1, back: true }), flow(['agent', 'k0'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Drift',
      kind: 'technique',
      title: 'Drift detection and self-healing',
      body: [
        '<b>Drift</b> is any difference between Git and the cluster: someone ran <code>kubectl edit</code> at 3 a.m., a controller changed a field, a resource was deleted. The agent compares desired and live state every interval and reports <b>OutOfSync</b>; with <b>auto-sync and self-heal</b> it reverts the change. At a 3-minute interval a manual edit survives on average <b>90 seconds</b> (half the interval) and at most 3 minutes.',
        'That makes ad-hoc changes self-defeating — the right workflow is a commit — and gives you a continuous audit: a dashboard of every difference. Exclude fields legitimately owned by other controllers (replica counts managed by an autoscaler) so the agent doesn’t fight them, and use <b>manual sync</b> with alerts for sensitive environments.',
      ],
      changes: [{ text: 'Average drift lifetime = interval ÷ 2', tone: 'info' }, { text: 'Ignore fields owned by other controllers', tone: 'good' }],
      scene: { nodes: [git(), agent({ tag: pill('OutOfSync → revert', 'alert', 'warn') }), cluster(0, 1, 'Cluster', { tag: pill('kubectl edit at 03:00', 'alert', 'warn') })], links: [link('git', 'agent'), link('agent', 'k0', { arrow: 'both' })], flows: [flow(['agent', 'k0'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'Rollback',
      kind: 'technique',
      title: 'Rollback is a revert; promotion is a merge',
      body: [
        'To roll back, <code>git revert</code> the bad commit: the agent sees the new head and restores the previous state, with the same review trail as any change. Worst-case time is one interval plus the apply time — 180 s + 30 s = <b>3.5 minutes</b> here. Trigger the sync immediately (a webhook or <code>argocd app sync</code>) when speed matters.',
        'Promotion between environments is also a Git operation: a directory or branch per environment (<code>dev</code> → <code>staging</code> → <code>prod</code>) and automated or reviewed pull requests that copy the proven image tag forward. Pin versions; <b>never</b> use mutable tags like <code>latest</code> or the repo’s desired state no longer determines what runs. Keep <b>secrets</b> out of plain Git: use sealed secrets, SOPS-encrypted files or an external secrets operator.',
      ],
      changes: [{ text: 'Revert commit → agent restores the old state', tone: 'good' }, { text: 'Promote by PR between env directories', tone: 'good' }, { text: 'No secrets in plain text; no mutable tags', tone: 'bad' }],
      scene: { nodes: [dev({ tag: pill('git revert', 'refresh') }), git({ tag: pill('v41 (bad) → revert', 'alert') }), agent(), cluster(0, 1, 'Cluster', { tag: pill('back to v40', 'check', 'good') })], links: [link('dev', 'git'), link('git', 'agent'), link('agent', 'k0')], flows: [flow(['dev', 'git', 'agent', 'k0'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Scale',
      kind: 'technique',
      title: 'Many clusters: polling cost and progressive rollout',
      body: [
        'Each agent polls Git: 20 clusters at 180 s is ~0.11 fetches/s — trivial — but 1,000 clusters is ~5.6/s plus 50,000 application reconcile loops running at once, so large fleets use <b>webhooks</b> to trigger syncs, repo caching (a repo-server layer), sharded controllers, and jittered intervals to avoid thundering herds. Reconcile loops per hour = clusters × apps × 3,600 ÷ interval (20 × 50 × 20 = 20,000).',
        'Blast radius is the bigger concern: a bad commit synced by every cluster at once breaks them all within minutes. Use <b>progressive delivery</b> — ApplicationSets or Flux Kustomizations that roll the change through <b>waves</b> (canary cluster → one region → everything) with health gates and automatic halt — so a bad change reaches 1 of 20 clusters, not all of them. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Webhooks, repo caching, sharded controllers at scale', tone: 'good' }, { text: 'Waves limit the blast radius of a bad commit', tone: 'good' }],
      scene: { nodes: [git(), agent({ name: 'Agents', tag: pill('jittered polling / webhooks', 'clock') }), cluster(0, 3, 'Canary cluster', { tag: pill('wave 1', 'check', 'good') }), cluster(1, 3, 'Region A', { tag: pill('wave 2', 'clock') }), cluster(2, 3, 'Region B', { tag: pill('wave 3', 'clock') })], links: [link('git', 'agent'), link('agent', 'k0'), link('agent', 'k1', { style: 'dashed' }), link('agent', 'k2', { style: 'dashed' })], flows: [flow(['agent', 'k0'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Declare, commit, reconcile',
      body: [
        'GitOps = <b>declarative config in Git</b> + <b>pull-based agents</b> that continuously reconcile clusters to it. Drift is detected and healed (average lifetime ≈ interval ÷ 2), rollback is a revert (≈ interval + apply time), and every change is reviewed and audited.',
        'Scale with webhooks and sharding, protect production with progressive waves and health gates, keep secrets encrypted, and pin immutable versions.',
      ],
      scene: { nodes: [dev(), git(), agent(), cluster(0, 2, 'Cluster A'), cluster(1, 2, 'Cluster B')], links: [link('dev', 'git'), link('git', 'agent'), link('agent', 'k0'), link('agent', 'k1')], flows: [flow(['dev', 'git', 'agent', 'k0'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
