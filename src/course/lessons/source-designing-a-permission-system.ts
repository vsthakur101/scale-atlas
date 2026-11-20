import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -18, 0, 10, 'requests: “can U do A on R?”', extra);
const pep = (extra: Partial<SceneNode> = {}) => box('pep', -9, 0, 'Policy enforcement point (your service)', 'orange', 'shield', { size: [1.6, 1.6], height: 28, ...extra });
const pdp = (extra: Partial<SceneNode> = {}) => box('pdp', 2, 0, 'Policy decision point (authz service)', 'purple', 'layers', { size: [1.7, 1.7], height: 30, ...extra });
const tuples = (extra: Partial<SceneNode> = {}) => db('tuples', 13, -6, 'Relationship tuples / roles / attributes', { size: [1.6, 1.6], ...extra });
const cache = (extra: Partial<SceneNode> = {}) => db('cache', 13, 7, 'Decision cache', { size: [1.3, 1.3], ...extra });
const audit = (extra: Partial<SceneNode> = {}) => box('audit', 2, 9, 'Audit log', 'green', 'list', { size: [1.2, 1.2], height: 18, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-designing-a-permission-system',
  title: 'Authorization Models: ACLs, RBAC, ABAC and Relationship-Based Access',
  blurb: 'Authentication says who you are; authorization says what you may do. Compare lists, roles, attribute policies and relationship graphs (Zanzibar-style) — role explosion, nested-group check cost, caching, and consistency — with the arithmetic that decides which fits.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'roles', label: 'RBAC roles needed to encode the combinations', icon: 'users' },
    { key: 'edges', label: 'ReBAC worst-case edges per permission check', icon: 'share' },
    { key: 'lat', label: 'Uncached check latency: parallel vs sequential traversal', icon: 'clock' },
    { key: 'store', label: 'Permission-store lookups per second after caching', icon: 'gauge' },
  ],
  goals: [
    { text: 'AuthN vs AuthZ; enforcement and decision points', step: 1 },
    { text: 'ACLs and RBAC: lists and roles', step: 2 },
    { text: 'ABAC and policy-as-code', step: 3 },
    { text: 'ReBAC: relationship tuples and nested groups', step: 4 },
    { text: 'Operating it: latency, caching, consistency, audit', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'depts', label: 'Departments', min: 1, max: 200, step: 1, default: 20, unit: '', description: 'Attribute dimension 1.' },
      { key: 'regions', label: 'Regions', min: 1, max: 100, step: 1, default: 10, unit: '', description: 'Attribute dimension 2.' },
      { key: 'levels', label: 'Seniority levels', min: 1, max: 20, step: 1, default: 4, unit: '', description: 'Attribute dimension 3.' },
      { key: 'depth', label: 'Group nesting depth', min: 1, max: 12, step: 1, default: 4, unit: '', description: 'Levels of groups within groups.' },
      { key: 'branch', label: 'Groups per level (branching)', min: 1, max: 12, step: 1, default: 3, unit: '', description: 'Parent groups per group on average.' },
      { key: 'look', label: 'Store lookup time', min: 0.05, max: 10, step: 0.05, default: 0.2, unit: ' ms', description: 'One tuple/edge read.' },
      { key: 'rps', label: 'Application requests per second', min: 10, max: 1000000, step: 10, default: 5000, unit: '/s', description: 'Requests needing authorization.' },
      { key: 'cpr', label: 'Permission checks per request', min: 1, max: 200, step: 1, default: 3, unit: '', description: 'e.g. page + 2 resources; list filtering multiplies this.' },
      { key: 'hit', label: 'Decision cache hit ratio', min: 0, max: 99.9, step: 0.1, default: 90, unit: '%', description: 'Checks answered from cache.' },
    ],
    calculate: (input, step) => {
      const d = Math.max(1, Math.round(input.depts ?? 20));
      const r = Math.max(1, Math.round(input.regions ?? 10));
      const l = Math.max(1, Math.round(input.levels ?? 4));
      const D = Math.max(1, Math.round(input.depth ?? 4));
      const B = Math.max(1, Math.round(input.branch ?? 3));
      const look = Math.max(0.01, input.look ?? 0.2);
      const rps = Math.max(1, input.rps ?? 5000);
      const cpr = Math.max(1, input.cpr ?? 3);
      const hit = Math.min(0.9999, Math.max(0, (input.hit ?? 90) / 100));
      // Worst case: direct edge plus every ancestor edge level by level: 1 + B + B² + … + B^D.
      let edges = 1;
      for (let i = 1; i <= D; i++) edges += Math.pow(B, i);
      const par = (1 + D) * look;
      const seq = edges * look;
      const lookups = rps * cpr * (1 - hit) * edges;
      return {
        roles: step < 2 ? { v: '—' } : { v: `${(d * r * l).toLocaleString('en-US')} roles (${d} × ${r} × ${l}) vs 3 attributes in ABAC`, tone: d * r * l > 200 ? 'bad' : 'good' },
        edges: step < 4 ? { v: '—' } : { v: `${edges.toLocaleString('en-US')} (1 + ${B} + … + ${B}^${D})`, tone: edges < 50 ? 'good' : 'warn' },
        lat: step < 4 ? { v: '—' } : { v: `${par.toFixed(1)} ms parallel by level vs ${seq.toFixed(1)} ms sequential`, tone: par < 5 ? 'good' : 'warn' },
        store: step < 5 ? { v: '—' } : { v: `${fmtN(lookups)}/s (${fmtN(rps * cpr)} checks/s × ${((1 - hit) * 100).toFixed(0)}% miss × ${edges} edges)`, tone: lookups < 1e6 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'AuthZ',
      kind: 'insight',
      title: 'Authentication proves who; authorization decides what',
      body: [
        '<b>Authentication</b> establishes identity (a password, passkey or SSO assertion — see those lessons). <b>Authorization</b> answers a separate question on every request: <i>may this subject perform this action on this resource?</i> Getting it wrong is the top web-application risk (OWASP: broken access control, IDOR): the usual failure is a missing check, not a broken cipher. A good design makes the check <b>hard to forget</b>: a central policy, a consistent enforcement point in every service, and deny by default.',
        'A common architecture separates the <b>policy enforcement point (PEP)</b> — code in your service that intercepts the operation — from the <b>policy decision point (PDP)</b> — the engine that evaluates the policy against data (roles, attributes, relationships) and returns allow/deny. This keeps business code free of access logic, lets policy change without redeploying services, and gives one place to <b>audit</b>. The models below differ in what the PDP’s data and rules look like.',
      ],
      scene: { nodes: [users(), pep({ tag: pill('intercept, ask, enforce', 'shield') }), pdp({ tag: pill('allow / deny + reason', 'check') }), tuples(), audit()], links: [link('users', 'pep'), link('pep', 'pdp'), link('pdp', 'tuples'), link('pdp', 'audit')], flows: [flow(['users', 'pep', 'pdp', 'tuples'], { kind: 'handshake', rate: 1.6, back: true })] },
    },
    {
      short: 'RBAC',
      kind: 'technique',
      title: 'ACLs and RBAC: lists and roles',
      body: [
        'An <b>access-control list (ACL)</b> attaches to each resource a list of who may do what (Unix file permissions, S3 ACLs, Google Drive shares). Direct and simple, and the natural fit for per-object sharing — but it doesn’t scale as policy: auditing “what can Alice access?” means scanning every object, and changing a policy means editing millions of lists. <b>Role-based access control (RBAC)</b> adds indirection: permissions are granted to <b>roles</b> (editor, billing-admin), users are assigned roles, and the check is “does any of the user’s roles grant this?”. It maps to organisational jobs, is easy to explain and audit, and is built into most platforms (Kubernetes, cloud IAM).',
        'RBAC’s weakness is <b>role explosion</b>. The moment access depends on more than job title — which department, which region, which seniority — you need a role per combination: 20 departments × 10 regions × 4 levels = <b>800 roles</b>, each to be created, named, reviewed and assigned correctly. Role sprawl makes access reviews meaningless and leads to over-broad “catch-all” roles. It also can’t express <b>per-resource relationships</b> (“the owner of <i>this</i> document”) or <b>context</b> (“only during business hours from a managed device”) without ever more roles.',
      ],
      changes: [{ text: 'ACL: per-object lists — flexible, hard to audit at scale', tone: 'info' }, { text: 'RBAC: users → roles → permissions — simple and auditable', tone: 'good' }, { text: '20 × 10 × 4 attribute combinations = 800 roles', tone: 'bad' }],
      scene: { nodes: [users({ tag: pill('Alice: Finance-EMEA-Senior', 'user') }), pep(), pdp({ tag: pill('role → permissions', 'list') }), tuples({ tag: pill('800 roles', 'alert', 'warn') })], links: [link('users', 'pep'), link('pep', 'pdp'), link('pdp', 'tuples')], flows: [flow(['users', 'pep', 'pdp', 'tuples'], { rate: 1.6, back: true })] },
    },
    {
      short: 'ABAC',
      kind: 'technique',
      title: 'ABAC and policy-as-code: rules over attributes',
      body: [
        '<b>Attribute-based access control</b> evaluates a <b>policy</b> over attributes of the subject (department, region, clearance), the resource (classification, owner, tenant), the action and the environment (time, IP, device posture): <code>allow if user.department == resource.department and user.region == resource.region and user.level &gt;= resource.sensitivity</code>. Three attributes replace the 800 roles with <b>a handful of policies</b>, new departments need no new policy, and context is first-class. Policy languages and engines: <b>OPA/Rego</b>, <b>AWS Cedar</b>, XACML, Casbin — policies live in version control, are reviewed and unit-tested like code, and can be <b>analysed</b> (Cedar proves properties such as “no policy permits public access to PII”).',
        'Costs: policies are code and can be wrong in subtle ways (explicit <code>deny</code> overrides, ordering, missing attributes); <b>attributes must be available and trustworthy</b> at decision time (fetching them from several systems adds latency and failure modes); and “who can access X?” — the <i>reverse query</i> — is hard to answer, since you must evaluate the policy over all users. Many systems combine them: RBAC for coarse job-based grants, ABAC conditions for context and tenancy.',
      ],
      changes: [{ text: 'Policy over subject/resource/action/environment attributes', tone: 'good' }, { text: '3 attributes + ~12 policies instead of 800 roles', tone: 'good' }, { text: 'Needs fresh attributes at decision time; reverse queries are hard', tone: 'bad' }],
      concepts: [{ term: 'Policy-as-code', def: 'Authorization rules written in a policy language, stored in version control, reviewed, tested and evaluated by a policy engine rather than scattered through application code.' }],
      scene: { nodes: [users(), pep(), pdp({ tag: pill('OPA / Cedar: evaluate rules', 'layers', 'good') }), tuples({ tag: pill('attributes: dept, region, level', 'list') })], links: [link('users', 'pep'), link('pep', 'pdp'), link('pdp', 'tuples')], flows: [flow(['users', 'pep', 'pdp', 'tuples'], { rate: 1.6, back: true })] },
    },
    {
      short: 'ReBAC',
      kind: 'technique',
      title: 'ReBAC: access follows relationships in a graph',
      body: [
        '<b>Relationship-based access control</b> stores facts as <b>tuples</b> — <code>doc:readme#owner@user:alice</code>, <code>folder:eng#viewer@group:eng#member</code>, <code>doc:readme#parent@folder:eng</code> — and a <b>schema</b> says how permissions derive from relations: “a document’s <i>viewer</i> includes its owner, anyone who is a viewer of its parent folder, and any member of a group listed as viewer.” A check <code>Check(user:bob, viewer, doc:readme)</code> is answered by <b>walking the graph</b> from the document up through parents and groups to see if Bob is reachable. This is the model of Google Drive sharing and of <b>Zanzibar</b>, Google’s global authorisation system, with open implementations such as SpiceDB, OpenFGA and Ory Keto.',
        'It fits collaborative and hierarchical products naturally (folders inside folders, nested teams, shared-with-link), supports the <b>reverse queries</b> “what can Alice see?” (<code>LookupResources</code>) and “who can see this?” (<code>Expand</code>), and avoids role explosion. Cost: the traversal. With groups nested 4 deep and 3 parent groups per group, a negative check may visit up to <b>1 + 3 + 9 + 27 + 81 = 121 edges</b>. At 0.2 ms per read, doing it <b>sequentially</b> takes 24 ms; walking <b>level by level in parallel</b> takes 5 × 0.2 = <b>1.0 ms</b>. Real engines add per-level caching, indexes (reverse edges, “leopard”-style set indexes that precompute nested group membership) and depth limits.',
      ],
      changes: [{ text: 'Tuples + schema; Check = reachability in a graph', tone: 'info' }, { text: 'Depth 4, branching 3: up to 121 edges; 24 ms sequential vs 1 ms parallel', tone: 'info' }, { text: 'Supports reverse queries (Expand, LookupResources)', tone: 'good' }],
      scene: { nodes: [users({ tag: pill('Check(bob, viewer, doc:readme)', 'search') }), pdp({ tag: pill('walk: doc → folder → group → bob', 'share') }), tuples({ tag: pill('121 edges worst case', 'list') }), cache({ tag: pill('cache subtrees', 'db') })], links: [link('users', 'pdp'), link('pdp', 'tuples'), link('pdp', 'cache')], flows: [flow(['users', 'pdp', 'tuples'], { rate: 1.6, back: true })] },
    },
    {
      short: 'Operate',
      kind: 'tradeoff',
      title: 'Latency, caching, consistency and audit',
      body: [
        'Authorization sits on <b>every request’s critical path</b>, often several times (a page of 100 documents needs 100 checks — use <b>batch checks</b> or filter in the database with the policy compiled into the query). At 5,000 requests/s × 3 checks = 15,000 checks/s; with a 90% decision-cache hit ratio, 1,500 reach the store, each walking up to 121 edges: <b>181,500 lookups/s</b> — a real load to size, which is why engines cache intermediate results, co-locate data, and bound traversal depth. Decide <b>fail-closed</b> (deny if the PDP is down — safe, an outage) or fail-open for low-risk paths, and keep the PDP highly available (local sidecar with a replicated data set is common).',
        '<b>Consistency</b> is subtle: you remove Bob’s access, then immediately add a sensitive file to the folder — a stale cached or replica-lagged read could still let Bob in (Zanzibar’s <b>“new enemy problem”</b>; it uses snapshot tokens — “zookies” — so a check is evaluated at least as fresh as the change). Cached allows need short TTLs or event-driven invalidation for revocations; deny cache entries are safer to keep. Finally <b>audit and explain</b>: log every decision with the matched policy or path, support “why was this allowed?”, run periodic access reviews, test policies with example matrices, and apply least privilege plus time-bound grants. Model figures here are first-order and depend on the assumed traversal, lookup time and hit ratio.',
      ],
      changes: [{ text: '15,000 checks/s × 10% miss × 121 edges = 181,500 lookups/s', tone: 'info' }, { text: 'Revocation + fresh resource = “new enemy”: use snapshot tokens or short TTLs', tone: 'bad' }, { text: 'Fail closed; batch checks; log why each decision was made', tone: 'good' }],
      scene: { nodes: [pep({ tag: pill('batch: 100 docs in 1 call', 'check', 'good') }), pdp({ tag: pill('fail closed', 'shield') }), cache({ tag: pill('90% hits; short TTL on allows', 'clock') }), tuples(), audit({ tag: pill('decision + reason', 'list') })], links: [link('pep', 'pdp'), link('pdp', 'cache'), link('pdp', 'tuples'), link('pdp', 'audit')], flows: [flow(['pep', 'pdp', 'cache'], { rate: 1.8, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Pick the model whose data matches your access rules',
      body: [
        '<b>ACLs</b> for per-object sharing, <b>RBAC</b> for job-shaped grants (watch for 800-role explosions), <b>ABAC</b> for rule-based and contextual access, <b>ReBAC</b> for hierarchies and sharing graphs (121-edge worst-case checks, parallel traversal and caching). Enforce centrally, deny by default, log every decision.',
        'Mind latency (181,500 lookups/s here), cache and revocation consistency, and the reverse query “who can access this?”.',
      ],
      scene: { nodes: [users(), pep(), pdp(), tuples(), audit()], links: [link('users', 'pep'), link('pep', 'pdp'), link('pdp', 'tuples'), link('pdp', 'audit')], flows: [flow(['users', 'pep', 'pdp', 'tuples'], { kind: 'handshake', rate: 1.6, back: true })] },
    },
  ],
};

export default lesson;
