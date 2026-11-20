import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -18, 0, 12, 'API clients (many versions in the wild)', extra);
const gw = (extra: Partial<SceneNode> = {}) => box('gw', -8, 0, 'Gateway: resolve requested version', 'purple', 'route', { size: [1.5, 1.5], height: 26, ...extra });
const v1 = (extra: Partial<SceneNode> = {}) => box('v1', 3, -8, 'Adapter v1 (frozen)', 'red', 'doc', { size: [1.3, 1.3], height: 20, ...extra });
const v2 = (extra: Partial<SceneNode> = {}) => box('v2', 3, 0, 'Adapter v2', 'orange', 'doc', { size: [1.3, 1.3], height: 20, ...extra });
const v3 = (extra: Partial<SceneNode> = {}) => box('v3', 3, 8, 'Adapter v3 (current)', 'green', 'doc', { size: [1.3, 1.3], height: 20, ...extra });
const core = (extra: Partial<SceneNode> = {}) => db('core', 14, 0, 'One core domain model + logic', { size: [1.8, 1.8], ...extra });
const metrics = (extra: Partial<SceneNode> = {}) => box('metrics', -8, 9, 'Usage by client + version', 'blue', 'activity', { size: [1.4, 1.4], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'academy-api-versioning',
  title: 'API Versioning and Deprecation: Compatibility, Adoption Curves and the Long Tail',
  blurb: 'Which changes break clients, how to expose versions (URL, header, date), how to keep one core model behind per-version adapters — and why migration follows a decay curve whose long tail decides your sunset policy and support cost.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'tail', label: 'Months until the old version falls below the threshold', icon: 'timer' },
    { key: 'broken', label: 'Clients still on the old version at sunset', icon: 'alert' },
    { key: 'vers', label: 'Versions you must run at once', icon: 'layers' },
    { key: 'fte', label: 'Maintenance effort for them', icon: 'users' },
  ],
  goals: [
    { text: 'What breaks clients, and what doesn’t', step: 1 },
    { text: 'Where the version lives: URL, header, date', step: 2 },
    { text: 'One core, many adapters', step: 3 },
    { text: 'Migration is a decay curve with a long tail', step: 4 },
    { text: 'Deprecation process and policy', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'half', label: 'Migration half-life', min: 1, max: 36, step: 0.5, default: 6, unit: ' months', description: 'Time for half the remaining clients on a version to move to the next.' },
      { key: 'sun', label: 'Sunset window after a new version ships', min: 3, max: 72, step: 1, default: 24, unit: ' months', description: 'Support period before the old version is removed.' },
      { key: 'rel', label: 'New major version every', min: 3, max: 60, step: 1, default: 12, unit: ' months', description: 'Release cadence of breaking versions.' },
      { key: 'cli', label: 'Active clients (integrations)', min: 10, max: 1000000, step: 10, default: 10000, unit: '', description: 'Distinct apps or partners calling the API.' },
      { key: 'thr', label: '“Safe to remove” threshold', min: 0.1, max: 25, step: 0.1, default: 5, unit: '% of traffic', description: 'Share of clients still on the version at which removal is tolerable.' },
      { key: 'fte', label: 'Effort to keep one version alive', min: 0.05, max: 2, step: 0.05, default: 0.3, unit: ' FTE', description: 'Engineers’ time for tests, fixes, docs, on-call.' },
    ],
    calculate: (input, step) => {
      const h = Math.max(0.1, input.half ?? 6);
      const sun = Math.max(1, input.sun ?? 24);
      const rel = Math.max(1, input.rel ?? 12);
      const cli = Math.max(1, input.cli ?? 1e4);
      const thr = Math.min(1, Math.max(0.001, (input.thr ?? 5) / 100));
      const fte = Math.max(0, input.fte ?? 0.3);
      // Clients remaining on a version t months after the next ships: 2^(−t/h).
      const tail = h * Math.log2(1 / thr);
      const left = Math.pow(2, -sun / h);
      const versions = Math.ceil(sun / rel) + 1;
      return {
        tail: step < 4 ? { v: '—' } : { v: `${tail.toFixed(1)} months (${h} × log₂(1 ÷ ${(thr * 100).toFixed(1)}%))`, tone: tail <= sun ? 'good' : 'warn' },
        broken: step < 4 ? { v: '—' } : { v: `${fmtN(cli * left)} (${(left * 100).toFixed(1)}% of ${fmtN(cli)}) at ${sun} months`, tone: left <= thr ? 'good' : left <= 0.1 ? 'warn' : 'bad' },
        vers: step < 5 ? { v: '—' } : { v: `${versions} (current + ${versions - 1} in the sunset window)`, tone: versions <= 3 ? 'good' : 'warn' },
        fte: step < 5 ? { v: '—' } : { v: `${(versions * fte).toFixed(1)} FTE (${versions} × ${fte})`, tone: versions * fte < 1 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Breaking',
      kind: 'insight',
      title: 'An API is a contract with clients you can’t update',
      body: [
        'Once other people’s code calls your API, you can’t change it freely: their release cycles are not yours (mobile apps linger for years on old versions; partners’ integrations may never be touched again). Evolution must therefore separate <b>compatible</b> from <b>breaking</b> changes. <b>Compatible</b>: adding a new endpoint, a new <i>optional</i> request field, a new response field (if clients ignore unknown fields — the <b>tolerant reader</b> rule), a new enum value only where clients treat unknown values safely. <b>Breaking</b>: removing or renaming a field, changing a type or format (<code>id</code> int → string, dates to a new format), changing semantics (a field that meant gross now means net), making an optional parameter required, tightening validation, changing error shapes or status codes, changing pagination or default sort order, and altering authentication.',
        'The first strategy is therefore not versioning but <b>discipline</b>: evolve additively and keep the version number for the cases where you truly cannot. Document the compatibility policy (what counts as breaking) in the contract, test with <b>contract tests</b> and schema diffing in CI (OpenAPI/protobuf breaking-change detectors such as <code>buf breaking</code>), and treat “just a small tweak” as breaking if any client could depend on it (Hyrum’s law: with enough users, every observable behaviour will be depended upon).',
      ],
      scene: { nodes: [clients({ tag: pill('some never update', 'clock', 'warn') }), gw(), core({ tag: pill('field renamed: breaks', 'alert', 'bad') })], links: [link('clients', 'gw'), link('gw', 'core')], flows: [flow(['clients', 'gw', 'core'], { kind: 'fail', rate: 1.6 })] },
    },
    {
      short: 'Where',
      kind: 'technique',
      title: 'Where the version lives: URL, header or date',
      body: [
        '<b>URL path</b> (<code>/v2/orders</code>): explicit, visible in logs and docs, trivially routable and cacheable — the most common choice; downside: a version is baked into every link and breaks the idea of a resource having one URL. <b>Header / media type</b> (<code>Accept: application/vnd.acme.v2+json</code> or <code>Api-Version: 2</code>): URLs stay stable and content negotiation is “pure”, but it’s less discoverable, harder to test in a browser, and caches must <code>Vary</code> on it. <b>Query parameter</b> (<code>?version=2</code>): easy, but easily forgotten and pollutes cache keys.',
        '<b>Date-based / pinned versions</b> (Stripe, GitHub): each account is <b>pinned to the API version in effect when it first called</b> (e.g. <code>2024-06-20</code>), and may override per request with a header; upgrades are deliberate, and each date lists small, specific changes — fine-grained and low-friction, at the cost of the provider maintaining many dates through <b>per-change compatibility transforms</b>. <b>GraphQL</b> avoids versions by evolving the schema additively and marking fields <code>@deprecated</code> with usage tracking per field; <b>gRPC/protobuf</b> relies on field-number compatibility and package versions for breaking changes (see the Serialization lesson). Pick one convention, apply it uniformly, and make the version <b>visible in telemetry</b>.',
      ],
      changes: [{ text: 'URL /v2: explicit and routable · header: stable URLs, harder to see', tone: 'info' }, { text: 'Date-pinned versions: per-account stability, small incremental changes', tone: 'good' }, { text: 'GraphQL: additive evolution + @deprecated with per-field usage', tone: 'info' }],
      scene: { nodes: [clients({ tag: pill('GET /v2/orders', 'link') }), gw({ tag: pill('path · header · account pin', 'route') }), v1({ tag: pill('2022-03-01', 'doc') }), v2({ tag: pill('2024-06-20', 'doc') }), v3({ tag: pill('2025-10-01', 'doc') })], links: [link('clients', 'gw'), link('gw', 'v1'), link('gw', 'v2'), link('gw', 'v3')], flows: [flow(['clients', 'gw', 'v2'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Adapters',
      kind: 'technique',
      title: 'One core model, thin per-version adapters',
      body: [
        'The costly mistake is to <b>fork the whole service per version</b>: v1, v2 and v3 each with their own logic, bugs and security patches. Instead, keep <b>one canonical domain model and business logic</b> and implement each version as a <b>translation layer</b> at the edge: a request adapter maps the version’s wire format into the core model; a response adapter maps core results back. Breaking changes live in the adapter, not in the core. Stripe-style systems chain small <b>version-change transforms</b> (“in 2023-10-16 field <code>x</code> was renamed to <code>y</code>”) so a response is built in the current form and then transformed <i>back</i> step by step to the requested version.',
        'Benefits: a security fix or a new capability lands once; old versions keep working as long as their adapter does; deleting a version means deleting an adapter and its tests. Limits: some changes aren’t mappable (a new required input that old clients can’t supply — supply a default or reject), semantic changes can’t always be faked, and every adapter multiplies test combinations — run the <b>same contract test suite</b> against each version, generate adapters and docs from per-version schemas, and write the <b>changelog in machine-readable form</b> so SDKs and docs update with it.',
      ],
      changes: [{ text: 'One core; per-version request/response adapters', tone: 'good' }, { text: 'Chain small transforms back from the current model to the requested version', tone: 'info' }, { text: 'Same contract tests on every version; machine-readable changelog', tone: 'good' }],
      scene: { nodes: [gw(), v1({ tag: pill('maps old → core', 'refresh') }), v2(), v3(), core({ tag: pill('single source of logic', 'check', 'good') })], links: [link('gw', 'v1'), link('gw', 'v2'), link('gw', 'v3'), link('v1', 'core'), link('v2', 'core'), link('v3', 'core')], flows: [flow(['gw', 'v2', 'core'], { rate: 1.6 })] },
    },
    {
      short: 'Tail',
      kind: 'insight',
      title: 'Migration is a decay curve with a long tail',
      body: [
        'Clients don’t move on your schedule. A reasonable model is <b>exponential decay</b>: after a new version ships, the share still on the old one halves every <i>h</i> months — fast among active teams, slow among neglected integrations. With a 6-month half-life, 50% remain after 6 months, 25% after 12, 6.25% after 24. Reaching a <b>5% “safe to remove” threshold</b> takes 6 × log₂(20) = <b>25.9 months</b>. If you sunset at 24 months, <b>6.25% of 10,000 clients — 625 integrations — break</b>, each a support ticket, a churn risk or a partner escalation.',
        'The tail is dominated by <b>abandoned and slow-moving clients</b> (shipped mobile apps, partner plug-ins, scripts nobody owns), so waiting longer yields diminishing returns: halving the remainder costs another half-life each time. That’s the real design choice: you cannot reach zero by waiting, so the sunset date is a decision about <b>who you will deliberately break</b> and how much effort you spend finding and helping them before then. Use per-client usage metrics (API key → version → request counts) to see the actual curve, not the model.',
      ],
      changes: [{ text: 'Half-life 6 months: 25.9 months to reach 5%', tone: 'info' }, { text: 'Sunset at 24 months: 625 of 10,000 clients (6.25%) break', tone: 'bad' }, { text: 'Each extra half-life only halves the remainder; measure per client', tone: 'info' }],
      scene: { nodes: [clients({ tag: pill('6.25% still on v1 at month 24', 'alert', 'warn') }), metrics({ tag: pill('key → version → volume', 'activity') }), v1({ tag: pill('625 clients', 'users', 'warn') }), v3({ tag: pill('current', 'check', 'good') })], links: [link('clients', 'metrics'), link('clients', 'v1'), link('clients', 'v3')], flows: [flow(['clients', 'v3'], { rate: 2 }), flow(['clients', 'v1'], { kind: 'fail', rate: 0.6 })] },
    },
    {
      short: 'Policy',
      kind: 'tradeoff',
      title: 'Deprecation process, and what it costs to keep versions',
      body: [
        'A humane lifecycle: <b>announce</b> with a date well in advance (changelog, email to the owner of each API key still on the version, in-app banners); signal in-band with <code>Deprecation</code> and <code>Sunset</code> HTTP headers (RFC 8594) and a <code>Link</code> to the migration guide; provide <b>migration tooling</b> (SDK releases, codemods, a diff-checker, a test sandbox); run <b>brownouts</b> (planned short outages of the old version, e.g. 1 hour a week, growing) so owners notice before the final cut; then <b>sunset</b>, returning <code>410 Gone</code> with a pointer rather than a mystery error. Offer <b>paid or negotiated extensions</b> for large partners if needed, and contact the largest remaining callers personally.',
        'Cost: with a new major version every 12 months and a 24-month sunset window you must run <b>3 versions at once</b> (current plus two older ones); at 0.3 FTE each for tests, fixes, docs and on-call, that is <b>0.9 FTE</b> of standing maintenance — a number to weigh against the damage of a shorter window. Ways to lower it: <b>release fewer breaking versions</b> (batch breaking changes; prefer additive evolution), <b>automate</b> adapters and docs, and use <b>feature flags / capability negotiation</b> instead of versions for optional behaviour. A published, stable <b>deprecation policy</b> (“minimum 18 months’ notice, brownouts, 410 after sunset”) lets clients plan, and is itself a product feature. Figures here are model outputs for the stated half-life, cadence and effort.',
      ],
      changes: [{ text: 'Announce, Deprecation/Sunset headers, migration tools, brownouts, then 410 Gone', tone: 'good' }, { text: '12-month cadence + 24-month sunset = 3 live versions ≈ 0.9 FTE', tone: 'info' }, { text: 'Fewer breaking releases; automate adapters; publish the policy', tone: 'good' }],
      scene: { nodes: [gw({ tag: pill('Sunset: 2026-12-01', 'timer') }), v1({ tag: pill('brownout 1 h / week', 'alert', 'warn') }), v2(), v3(), metrics({ tag: pill('who is left?', 'search') })], links: [link('gw', 'v1'), link('gw', 'v2'), link('gw', 'v3'), link('gw', 'metrics', { style: 'dashed' })], flows: [flow(['gw', 'v3'], { rate: 1.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Evolve additively; version only for true breaks; plan the tail',
      body: [
        'Prefer <b>additive, tolerant-reader</b> evolution; when a change must break, expose a <b>version</b> (URL, header or date-pinned) implemented as thin <b>adapters over one core</b>. Migration decays exponentially — 6-month half-life: 25.9 months to reach 5% — so a 24-month sunset still breaks ~6% (625 of 10,000).',
        'Announce, measure per-client usage, brown out, then sunset with 410, and budget for the versions you keep (0.9 FTE for three).',
      ],
      scene: { nodes: [clients(), gw(), v1(), v2(), v3(), core()], links: [link('clients', 'gw'), link('gw', 'v1'), link('gw', 'v2'), link('gw', 'v3'), link('v1', 'core'), link('v2', 'core'), link('v3', 'core')], flows: [flow(['clients', 'gw', 'v3', 'core'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
