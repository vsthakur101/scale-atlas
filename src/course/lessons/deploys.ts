import type { Lesson, SceneNode, Tone } from '../../types';
import { box, crowd, db, disk, flow, link, pill, zone } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -13, 1, 18, '1M users', extra);
const lb = (extra: Partial<SceneNode> = {}) => box('lb', -6, 0, 'Router', 'orange', 'route', { size: [1.4, 1.4], height: 38, ...extra });
const node = (i: number, tone: Tone, sub: string, extra: Partial<SceneNode> = {}) =>
  box(`s${i}`, 2 + (i - 2) * 1.6, (i - 2) * 4.2, `Server ${i + 1}`, tone, 'server', { size: [1.15, 1.15], height: 30, sub, ...extra });
const fleet = (versions: ('v1' | 'v2')[], extra: (i: number) => Partial<SceneNode> = () => ({})) =>
  versions.map((v, i) => node(i, v === 'v1' ? 'blue' : 'green', v, extra(i)));
const store = (extra: Partial<SceneNode> = {}) => db('db', 11, 0, 'Database', extra);
const fan = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
const wires = (n: number) => [link('users', 'lb'), ...fan(n).map((s) => link('lb', s)), ...fan(n).map((s) => link(s, 'db', { style: 'dashed', arrow: 'none' }))];
const traffic = (ids: string[], rate = 1) => ids.map((s) => flow(['users', 'lb', s], { back: true, rate }));

const lesson: Lesson = {
  slug: 'deploys',
  title: 'Deploy Strategies',
  blurb: 'Ship changes to a live system many times a day while limiting how many users any bad change can reach.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'blast', label: 'Blast radius', icon: 'alert' },
    { key: 'rollback', label: 'Rollback time', icon: 'timer' },
    { key: 'freq', label: 'Deploys / day', icon: 'refresh' },
    { key: 'cfr', label: 'Change fail rate', icon: 'activity' },
  ],
  goals: [
    { text: 'Rolling deploys and mixed versions', step: 2 },
    { text: 'Blue-green switches and instant rollback', step: 3 },
    { text: 'Canary releases with automated analysis', step: 4 },
    { text: 'Separating deploy from release with feature flags', step: 5 },
    { text: 'Expand/contract schema changes and pipelines', step: 9 },
  ],
  legend: ['request', 'response', 'fail', 'write'],
  steps: [
    {
      short: 'Big bang',
      kind: 'problem',
      title: 'Friday night, everything at once',
      body: [
        'Releases go out monthly, late on Friday, to every server at the same moment. This one has a bug in the checkout serializer: 100% of checkouts fail. Rolling back means rebuilding the previous version and redeploying — 40 minutes of total outage.',
        'Big, infrequent, all-at-once releases maximise both the chance of a problem and the damage it does.',
      ],
      changes: [{ text: 'All servers → v2 at once', tone: 'bad' }, { text: 'Checkout down 40 min', tone: 'bad' }],
      scene: {
        nodes: [users(), lb(), ...fleet(['v2', 'v2', 'v2', 'v2'], () => ({ state: 'hot' })), store()],
        links: wires(4),
        flows: [flow(['users', 'lb'], { kind: 'fail', rate: 4 })],
        metrics: { blast: { v: '100%', tone: 'bad' }, rollback: { v: '40 min', tone: 'bad' }, freq: { v: '1 / month', tone: 'bad' }, cfr: { v: '30%', tone: 'bad' } },
      },
    },
    {
      short: 'Rolling',
      kind: 'technique',
      title: 'Rolling: one server at a time',
      body: [
        'Replace instances gradually: drain one, upgrade it, let it pass health checks, move to the next. Capacity dips by only one server and a crashing build stops the rollout at the first instance.',
        'For a while, <b>v1 and v2 serve traffic side by side</b>. Every change must work in that mixed state: APIs, message formats and database schemas need to be compatible with the version before and after.',
      ],
      changes: [{ text: '2 of 4 on v2', tone: 'good' }, { text: 'Mixed versions in flight', tone: 'bad' }],
      concepts: [{ term: 'Rolling deployment', def: 'Updating instances in batches while the rest keep serving, so the service stays up throughout.' }],
      scene: {
        nodes: [users(), lb(), ...fleet(['v2', 'v2', 'v1', 'v1'], (i) => (i === 1 ? { state: 'ghost', tag: pill('upgrading', 'refresh', 'warn') } : {})), store()],
        links: wires(4),
        flows: traffic(['s0', 's2', 's3'], 1.2),
        metrics: { blast: '25% per batch', rollback: '~10 min', freq: '1 / day', cfr: '15%' },
      },
    },
    {
      short: 'Blue-green',
      kind: 'technique',
      title: 'Blue-green: flip a switch, flip it back',
      body: [
        'Run two complete environments. <b>Blue</b> serves users on v1; <b>green</b> gets v2 and is tested with real infrastructure but no customers. Then the router switches all traffic to green in one step.',
        'If anything looks wrong, switch back — rollback in seconds, because blue is still running. The costs: double capacity during the release, and a shared database that both versions must understand.',
      ],
      changes: [{ text: 'Traffic → green', tone: 'good' }, { text: 'Rollback: seconds', tone: 'good' }],
      concepts: [{ term: 'Blue-green deployment', def: 'Keeping two identical environments and switching traffic between them to release or roll back instantly.' }],
      scene: {
        nodes: [
          users(),
          lb({ tag: pill('→ green', 'route', 'good') }),
          zone('blue', 1, -5, 6, 4.4, 'blue · v1 (idle)', 'blue'),
          zone('green', 3, 5, 6, 4.4, 'green · v2 (live)', 'green'),
          box('s0', 0, -6, 'Blue 1', 'blue', 'server', { size: [1.1, 1.1], height: 28, state: 'dim' }),
          box('s1', 3, -4, 'Blue 2', 'blue', 'server', { size: [1.1, 1.1], height: 28, state: 'dim' }),
          box('s2', 2, 4, 'Green 1', 'green', 'server', { size: [1.1, 1.1], height: 28, load: 50 }),
          box('s3', 5, 6, 'Green 2', 'green', 'server', { size: [1.1, 1.1], height: 28, load: 50 }),
          store(),
        ],
        links: [link('users', 'lb'), link('lb', 's0', { style: 'dashed' }), link('lb', 's1', { style: 'dashed' }), link('lb', 's2'), link('lb', 's3'), link('s2', 'db', { style: 'dashed', arrow: 'none' }), link('s0', 'db', { style: 'dashed', arrow: 'none' })],
        flows: traffic(['s2', 's3'], 2),
        metrics: { blast: '100% (briefly)', rollback: { v: '5 s', tone: 'good' }, freq: '2 / day', cfr: '12%' },
      },
    },
    {
      short: 'Canary',
      kind: 'technique',
      title: 'Canary: a little traffic first',
      body: [
        'Send <b>1%</b> of traffic to v2 while 99% stays on v1, and compare the two side by side: error rate, latency, business metrics like checkout conversion. If v2 is no worse, step up to 10%, 50%, 100%, with a bake time at each step.',
        'Automate the comparison and the rollback. Most bad releases are now seen by 1% of users for a few minutes instead of everyone for an hour.',
      ],
      note: { kind: 'tip', text: 'Compare the canary against a baseline of the old version receiving the same share of traffic, not against the whole fleet — otherwise noise and time-of-day effects hide real regressions.' },
      changes: [{ text: 'v2 at 1%: errors +0.4% → auto-rollback', tone: 'good' }],
      concepts: [{ term: 'Canary release', def: 'Rolling a change out to a small fraction of traffic first and expanding only if its metrics stay healthy.' }],
      scene: {
        nodes: [users(), lb({ tag: pill('v2: 1% → 10% → 50% → 100%', 'activity') }), ...fleet(['v2', 'v1', 'v1', 'v1'], (i) => (i === 0 ? { tag: pill('canary: errors 0.5% vs 0.1%', 'alert', 'warn') } : { load: 50 })), store()],
        links: wires(4),
        flows: [...traffic(['s1', 's2', 's3'], 1.4), flow(['users', 'lb', 's0'], { back: true, rate: 0.3 })],
        metrics: { blast: { v: '1%', tone: 'good' }, rollback: { v: '30 s (auto)', tone: 'good' }, freq: '8 / day', cfr: '8%' },
      },
    },
    {
      short: 'Flags',
      kind: 'technique',
      title: 'Feature flags: deploy ≠ release',
      body: [
        'Ship the new checkout code to every server, <b>switched off</b>. A feature flag decides at runtime who sees it: employees first, then 5% of users, then a country, then everyone. Turning it off is a config change, not a deploy.',
        'Deploying becomes routine and low-risk; releasing becomes a business decision with its own controls. Flags are also kill switches for expensive features during incidents. Remove them once fully launched — old flags are a maze of untested code paths.',
      ],
      changes: [{ text: 'new_checkout: staff → 5% → 100%', tone: 'good' }],
      concepts: [{ term: 'Feature flag', def: 'A runtime switch controlling whether, and for whom, a code path is enabled.' }],
      scene: {
        nodes: [users({ tag: pill('5% see new checkout', 'users') }), lb(), ...fleet(['v2', 'v2', 'v2', 'v2'], () => ({ load: 50 })), store(), box('flags', -6, -8, 'Flags', 'yellow', 'filter', { size: [1.2, 1.2], height: 30, tag: pill('new_checkout: 5%', 'filter', 'good') })],
        links: [...wires(4), ...fan(4).map((s) => link('flags', s, { style: 'dashed', arrow: 'none' }))],
        flows: [...traffic(fan(4), 1), ...fan(4).map((s) => flow(['flags', s], { kind: 'handshake', rate: 0.2 }))],
        metrics: { blast: { v: '5% (by flag)', tone: 'good' }, rollback: { v: '1 s (flag off)', tone: 'good' }, freq: '20 / day', cfr: '5%' },
      },
    },
    {
      short: 'Schema',
      kind: 'technique',
      title: 'Expand, migrate, contract',
      body: [
        'Renaming <code>address</code> to <code>shipping_address</code> in one deploy breaks whichever version isn’t expecting it — and with rolling or canary deploys, both versions run at once. Do it in compatible steps:',
        '<b>Expand</b>: add the new column. Deploy code that writes both. <b>Migrate</b>: backfill old rows in batches. Deploy code that reads the new column. <b>Contract</b>: once nothing reads the old column, drop it — in a later release. Every step is safe to roll back.',
      ],
      concepts: [{ term: 'Expand/contract migration', def: 'Changing a schema in backward-compatible stages: add new structure, migrate, switch readers, then remove the old.' }],
      changes: [{ text: '4 releases, each reversible', tone: 'good' }],
      scene: {
        nodes: [users(), lb(), ...fleet(['v1', 'v2', 'v2', 'v1'], (i) => ({ tag: pill(i % 3 === 0 ? 'writes old' : 'writes both', 'file') })), store({ tag: pill('address + shipping_address', 'sheet', 'good') })],
        links: [...wires(4).slice(0, 5), ...fan(4).map((s) => link(s, 'db', { arrow: 'both' }))],
        flows: [...traffic(fan(4), 0.8), ...fan(4).map((s) => flow([s, 'db'], { kind: 'write', rate: 0.5 }))],
        metrics: { blast: '1%', rollback: '30 s', freq: '20 / day', cfr: '5%' },
      },
    },
    {
      short: 'No way back',
      kind: 'case',
      title: 'Case: the rollback that couldn’t',
      body: [
        'A release included a migration that dropped the old <code>address</code> column in the same deploy as the code change. Twenty minutes later a bug appears and the team rolls back the code — but v1 reads <code>address</code>, which no longer exists. Rollback fails; the only path is a rushed fix forward under pressure.',
        'Rule: a deploy must leave the system in a state where the previous version still works. Destructive schema changes ship separately, after the code that stopped needing them has been stable for a while.',
      ],
      changes: [{ text: 'Column dropped with code change', tone: 'bad' }, { text: 'Rollback impossible', tone: 'bad' }],
      scene: {
        nodes: [users(), lb(), ...fleet(['v1', 'v1', 'v1', 'v1'], () => ({ state: 'hot', tag: undefined })), store({ state: 'hot', tag: pill('column “address” missing', 'alert', 'bad') })],
        links: [...wires(4).slice(0, 5), ...fan(4).map((s) => link(s, 'db', { style: 'broken' }))],
        flows: [flow(['users', 'lb'], { kind: 'fail', rate: 3 })],
        metrics: { blast: { v: '100%', tone: 'bad' }, rollback: { v: 'impossible', tone: 'bad' }, freq: '—', cfr: '—' },
      },
    },
    {
      short: 'Pipeline',
      kind: 'technique',
      title: 'Build once, promote the same artifact',
      body: [
        'A <b>CI/CD pipeline</b> builds one immutable artifact (a container image tagged with the commit), runs the tests against it, and promotes that exact artifact through environments: staging, canary, then zone by zone in production with bake time between.',
        'Never rebuild per environment — you’d be shipping something you didn’t test. Configuration comes from the environment; the artifact doesn’t change. Rollback means redeploying a previous artifact that’s already built.',
      ],
      concepts: [{ term: 'Immutable artifact', def: 'A build output (e.g. an image digest) that is never modified, deployed identically to every environment.' }],
      scene: {
        nodes: [
          box('build', -12, 0, 'Build', 'grey', 'box', { size: [1.2, 1.2], height: 30, tag: pill('image @sha256:9f2…', 'hash') }),
          disk('reg', -7, 0, 'registry', { tone: 'grey', icon: 'layers', size: [1.4, 1.2], height: 18 }),
          box('stg', -2, -5, 'Staging', 'yellow', 'server', { size: [1.2, 1.2], height: 30, tag: pill('tests ✓', 'check', 'good') }),
          box('can', 3, -1, 'Canary', 'teal', 'activity', { size: [1.2, 1.2], height: 30, tag: pill('1% · 30 min', 'timer') }),
          box('za', 8, 3, 'Zone A', 'green', 'server', { size: [1.2, 1.2], height: 30 }),
          box('zb', 13, 7, 'Zone B', 'green', 'server', { size: [1.2, 1.2], height: 30, state: 'ghost', tag: pill('after 1 h bake', 'clock') }),
        ],
        links: [link('build', 'reg'), link('reg', 'stg'), link('stg', 'can'), link('can', 'za'), link('za', 'zb', { style: 'dashed' })],
        flows: [flow(['build', 'reg', 'stg', 'can', 'za'], { kind: 'write', rate: 0.6 })],
        metrics: { blast: '1% → zone → all', rollback: '30 s', freq: '20 / day', cfr: '5%' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Small changes, small blast radius, fast undo',
      body: [
        '<b>Rolling</b> deploys keep the service up but mix versions; <b>blue-green</b> gives instant rollback at double capacity; <b>canaries</b> expose changes to a sliver of traffic with automated judgement; <b>feature flags</b> separate deploying code from releasing features.',
        'Keep every deploy backward-compatible, change schemas by <b>expand and contract</b>, promote one immutable artifact through a staged pipeline — and measure deploy frequency, change failure rate and time to restore.',
      ],
      scene: {
        nodes: [users(), lb({ tag: pill('canary + flags', 'activity', 'good') }), ...fleet(['v2', 'v2', 'v2', 'v1'], () => ({ load: 48 })), store({ tag: pill('expand/contract', 'sheet') })],
        links: wires(4),
        flows: traffic(fan(4), 1),
        metrics: { blast: '≤ 1%', rollback: '≤ 30 s', freq: '20 / day', cfr: { v: '5%', tone: 'good' } },
      },
    },
  ],
};

export default lesson;
