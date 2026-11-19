import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill, you } from '../kit';

const ana = (extra: Partial<SceneNode> = {}) => you('ana', -12, -4, { label: pill('Ana · Acme', 'user'), ...extra });
const raj = (extra: Partial<SceneNode> = {}) => you('raj', -12, 6, { label: pill('Raj · Globex', 'user'), ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', -3, 1, 'Invoices API', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('db', 6, 1, 'Invoices DB', extra);
const policy = (extra: Partial<SceneNode> = {}) => box('pdp', -3, -9, 'Policy engine', 'yellow', 'shield', { size: [1.4, 1.4], height: 36, ...extra });
const audit = (extra: Partial<SceneNode> = {}) => disk('audit', 6, 9, 'audit log', extra);

const wires = [link('ana', 'api'), link('raj', 'api'), link('api', 'db', { arrow: 'both' })];

const lesson: Lesson = {
  slug: 'authz',
  title: 'Authorization',
  blurb: 'Knowing who someone is doesn’t tell you what they may do. Models and mechanisms for checking access on every request.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'leaks', label: 'Cross-tenant reads', icon: 'alert' },
    { key: 'model', label: 'Model', icon: 'shield' },
    { key: 'checks', label: 'Checks / request', icon: 'check' },
    { key: 'audit', label: 'Audited', icon: 'list' },
  ],
  goals: [
    { text: 'Authentication vs authorization, and IDOR', step: 1 },
    { text: 'Deny-by-default object-level checks', step: 2 },
    { text: 'Roles, attributes and relationships', step: 5 },
    { text: 'Central policy engines and OAuth scopes', step: 7 },
    { text: 'Tenant isolation and audit logs', step: 9 },
  ],
  legend: ['request', 'response', 'fail', 'write'],
  steps: [
    {
      short: 'IDOR',
      kind: 'problem',
      title: 'Logged in is not the same as allowed',
      body: [
        'Raj from Globex opens <code>/invoices/4471</code>. Out of curiosity he changes it to <code>/invoices/4470</code> — and sees an invoice belonging to Acme. The API checked that Raj was <b>authenticated</b> but never asked whether <i>this</i> user may see <i>this</i> invoice.',
        'This is an <b>insecure direct object reference</b>, and it’s consistently one of the most common serious flaws in web APIs.',
      ],
      changes: [{ text: 'Any logged-in user reads any invoice', tone: 'bad' }],
      concepts: [
        { term: 'Authorization', def: 'Deciding whether an authenticated principal may perform an action on a resource.' },
        { term: 'IDOR', def: 'Insecure Direct Object Reference: accessing objects by changing identifiers because ownership isn’t checked.' },
      ],
      scene: {
        nodes: [ana(), raj({ tag: pill('GET /invoices/4470', 'search', 'bad') }), api({ tag: pill('logged in? ✓ that’s all', 'alert', 'bad') }), store({ tag: pill('4470 → Acme', 'file') })],
        links: wires,
        flows: [flow(['raj', 'api', 'db'], { back: true, rate: 1 }), flow(['ana', 'api', 'db'], { back: true, rate: 0.6 })],
        metrics: { leaks: { v: 'unbounded', tone: 'bad' }, model: 'none', checks: '0', audit: 'no' },
      },
    },
    {
      short: 'Check objects',
      kind: 'technique',
      title: 'Check every object, deny by default',
      body: [
        'Every handler that touches an object must check that the caller may access <i>that object</i> — on the server, every time, not just by hiding buttons in the UI. Load the invoice, compare its <code>tenant_id</code> with the caller’s, and return <code>404</code> (not 403, to avoid confirming it exists) if they differ.',
        'Make denial the default: a new endpoint with no explicit policy should refuse, so forgetting a check fails safe.',
      ],
      changes: [{ text: 'Ownership checked per object', tone: 'good' }, { text: 'Raj → 404', tone: 'good' }],
      concepts: [{ term: 'Deny by default', def: 'Refusing access unless a rule explicitly allows it.' }],
      scene: {
        nodes: [ana(), raj({ tag: pill('404 Not Found', 'x', 'good') }), api({ tag: pill('invoice.tenant == caller.tenant?', 'shield', 'good') }), store()],
        links: wires,
        flows: [flow(['raj', 'api'], { kind: 'fail', rate: 1 }), flow(['ana', 'api', 'db'], { back: true, rate: 0.8 })],
        metrics: { leaks: { v: '0', tone: 'good' }, model: 'ownership', checks: '1', audit: 'no' },
      },
    },
    {
      short: 'RBAC',
      kind: 'technique',
      title: 'Roles: bundles of permissions',
      body: [
        'Within Acme, not everyone should do everything: viewers read invoices, accountants also edit them, admins also manage users and billing. <b>Role-based access control</b> maps users to roles and roles to permissions such as <code>invoice:read</code>, <code>invoice:edit</code>, <code>member:invite</code>.',
        'Code checks permissions, not role names — <code>can(user, "invoice:edit")</code> — so roles can be reshaped without touching every handler.',
      ],
      concepts: [{ term: 'RBAC', def: 'Role-based access control: permissions are granted to roles, and users are assigned roles.' }],
      scene: {
        nodes: [ana({ tag: pill('role: accountant', 'users') }), raj({ label: pill('Lee · Acme', 'user'), tag: pill('role: viewer', 'users') }), api({ tag: pill('can(user, invoice:edit)', 'shield') }), store()],
        links: wires,
        flows: [flow(['ana', 'api', 'db'], { kind: 'write', back: true, rate: 0.8 }), flow(['raj', 'api'], { kind: 'fail', rate: 0.6 }), flow(['raj', 'api', 'db'], { back: true, rate: 0.6 })],
        metrics: { leaks: '0', model: 'RBAC', checks: '2', audit: 'no' },
      },
    },
    {
      short: 'Explosion',
      kind: 'problem',
      title: 'When roles multiply',
      body: [
        'Requirements grow: accountants may edit only invoices of their own region; contractors only until their contract ends; approvals over €10,000 need a finance lead. Expressed as roles, that’s “EU accountant”, “US accountant (temp)”, “EU accountant (≤ €10k)”… — hundreds of roles nobody can audit.',
        'Roles describe <i>who you are</i>. These rules depend on <i>attributes</i> of the user, the resource and the situation.',
      ],
      changes: [{ text: '312 roles, many unused', tone: 'bad' }],
      scene: {
        nodes: [ana({ tag: pill('role: eu-accountant-le10k-temp', 'users', 'warn') }), raj(), api({ state: 'hot', tag: pill('312 roles', 'alert', 'bad') }), store()],
        links: wires,
        flows: [flow(['ana', 'api', 'db'], { back: true, rate: 0.8 })],
        metrics: { leaks: '0', model: { v: 'RBAC (312 roles)', tone: 'warn' }, checks: '2', audit: 'no' },
      },
    },
    {
      short: 'Attributes',
      kind: 'technique',
      title: 'Attributes and relationships',
      body: [
        '<b>Attribute-based</b> rules combine properties: <i>allow edit if user.department = finance AND invoice.region = user.region AND invoice.amount ≤ user.limit</i>. A few readable rules replace hundreds of roles.',
        'For sharing — “Ana shared this folder with the audit team, and the invoice is in that folder” — <b>relationship-based</b> access models permissions as a graph of users, groups and objects, answered by walking edges (the approach behind Google’s Zanzibar and its open-source descendants).',
      ],
      concepts: [
        { term: 'ABAC', def: 'Attribute-based access control: decisions computed from attributes of the subject, resource, action and context.' },
        { term: 'ReBAC', def: 'Relationship-based access control: permissions derived from a graph of relationships between users, groups and objects.' },
      ],
      scene: {
        nodes: [ana({ tag: pill('dept: finance · region: EU', 'user') }), raj({ label: pill('Auditor · group', 'users'), tag: pill('via folder share', 'link', 'good') }), api({ tag: pill('region match ∧ amount ≤ limit', 'shield', 'good') }), store({ tag: pill('region: EU · €8,200', 'file') })],
        links: wires,
        flows: [flow(['ana', 'api', 'db'], { kind: 'write', back: true, rate: 0.8 }), flow(['raj', 'api', 'db'], { back: true, rate: 0.6 })],
        metrics: { leaks: '0', model: { v: 'ABAC + ReBAC', tone: 'good' }, checks: '1 policy', audit: 'no' },
      },
    },
    {
      short: 'Policy engine',
      kind: 'technique',
      title: 'Decide in one place, enforce everywhere',
      body: [
        'With twelve services each re-implementing these rules, they drift. Separate the <b>decision</b> from the <b>enforcement</b>: services ask a policy engine (Open Policy Agent, Cedar, a Zanzibar-style service) “may Ana edit invoice 4470?” and enforce the yes/no.',
        'Policies become versioned, testable code reviewed by security. Keep decisions fast — local sidecars or cached data — because they sit on every request path.',
      ],
      concepts: [{ term: 'Policy decision point', def: 'The component that evaluates access policies; enforcement points in services ask it and apply the answer.' }],
      scene: {
        nodes: [ana(), raj(), api({ tag: pill('enforce', 'shield') }), store(), policy({ tag: pill('policy v42 · tested', 'check', 'good') })],
        links: [...wires, link('api', 'pdp', { arrow: 'both', label: pill('allow?') })],
        flows: [flow(['api', 'pdp'], { kind: 'handshake', back: true, rate: 1.4 }), flow(['ana', 'api', 'db'], { back: true, rate: 0.8 })],
        metrics: { leaks: '0', model: 'ABAC + ReBAC', checks: '1 call (≈1 ms)', audit: 'no' },
      },
    },
    {
      short: 'Scopes',
      kind: 'technique',
      title: 'Third-party apps: delegated, scoped access',
      body: [
        'An accounting integration wants to read Acme’s invoices. Never ask for Ana’s password. With <b>OAuth 2.0</b>, Ana approves a consent screen and the integration receives an access token limited to <code>invoices:read</code> for Acme — no write access, no other tenants, revocable at any time.',
        'Request the narrowest scopes needed; your API must check the token’s scopes <i>and</i> the user’s own permissions — a token can never grant more than the user has.',
      ],
      concepts: [{ term: 'OAuth scope', def: 'A named permission limiting what an access token issued to a client application may do.' }],
      scene: {
        nodes: [ana({ tag: pill('approved: invoices:read', 'check') }), box('integ', -12, 6, 'Integration', 'purple', 'link', { size: [1.3, 1.3], height: 32, tag: pill('token: invoices:read', 'key', 'good') }), api(), store(), policy()],
        links: [link('ana', 'api', { style: 'dashed' }), link('integ', 'api', { arrow: 'both' }), link('api', 'db', { arrow: 'both' }), link('api', 'pdp', { arrow: 'both' })],
        flows: [flow(['integ', 'api', 'db'], { back: true, rate: 1 }), flow(['integ', 'api'], { kind: 'fail', rate: 0.3 })],
        metrics: { leaks: '0', model: 'ABAC + scopes', checks: 'scope ∧ user', audit: 'no' },
      },
    },
    {
      short: 'Tenant leak',
      kind: 'case',
      title: 'Case: one missing WHERE clause',
      body: [
        'A new “search invoices” endpoint builds its SQL dynamically and forgets <code>AND tenant_id = ?</code>. Search results now include other companies’ invoices. Every other endpoint was fine; one was enough.',
        'Make tenant isolation hard to forget: database <b>row-level security</b> policies that filter by the session’s tenant automatically, a data-access layer that always injects the tenant, and tests that try cross-tenant access on every endpoint.',
      ],
      changes: [{ text: 'Search leaked across tenants', tone: 'bad' }, { text: 'Row-level security enforced in DB', tone: 'good' }],
      concepts: [{ term: 'Row-level security', def: 'Database policies that restrict which rows a session can see or modify, e.g. by tenant.' }],
      scene: {
        nodes: [ana(), raj({ tag: pill('search “consulting”', 'search') }), api({ tag: pill('missing tenant filter', 'alert', 'bad') }), store({ tag: pill('RLS: tenant = current_tenant', 'lock', 'good') }), policy()],
        links: wires,
        flows: [flow(['raj', 'api', 'db'], { back: true, rate: 1 })],
        metrics: { leaks: { v: '0 (RLS caught it)', tone: 'good' }, model: 'ABAC + RLS', checks: 'app + DB', audit: 'no' },
      },
    },
    {
      short: 'Audit',
      kind: 'technique',
      title: 'Record who did what',
      body: [
        'For security investigations and compliance you need to answer “who viewed or changed this invoice, when, from where, and was it allowed?”. Write an <b>audit log</b> entry for sensitive reads, every write, every permission change and every denial.',
        'Make it append-only and stored separately from the data it describes, so an attacker — or an admin — can’t quietly edit the trail.',
      ],
      concepts: [{ term: 'Audit log', def: 'An append-only record of security-relevant actions: who did what to which resource, when, and the decision made.' }],
      scene: {
        nodes: [ana(), raj(), api(), store(), policy(), audit({ tone: 'grey', icon: 'list', size: [2.2, 1.4], height: 20, tag: pill('append-only', 'lock', 'good') })],
        links: [...wires, link('api', 'pdp', { arrow: 'both' }), link('api', 'audit')],
        flows: [flow(['ana', 'api', 'db'], { kind: 'write', back: true, rate: 0.8 }), flow(['api', 'audit'], { kind: 'write', rate: 1.2 })],
        metrics: { leaks: '0', model: 'ABAC + RLS', checks: 'app + DB', audit: { v: 'every decision', tone: 'good' } },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Check every action on every object',
      body: [
        'Authentication says who; <b>authorization</b> decides what. Check access server-side on every object, <b>deny by default</b>, and enforce tenant boundaries in more than one layer.',
        'Start with <b>roles</b>; add <b>attributes</b> and <b>relationships</b> when roles explode; centralise decisions in a tested <b>policy engine</b>; scope delegated access with <b>OAuth</b>; and keep an <b>audit log</b>.',
      ],
      scene: {
        nodes: [ana(), raj(), api({ tag: pill('deny by default', 'shield', 'good') }), store({ tag: pill('RLS', 'lock') }), policy(), audit({ tone: 'grey', icon: 'list', size: [2.2, 1.4], height: 20 })],
        links: [...wires, link('api', 'pdp', { arrow: 'both' }), link('api', 'audit')],
        flows: [flow(['ana', 'api', 'db'], { back: true, rate: 0.8 }), flow(['raj', 'api', 'db'], { back: true, rate: 0.8 }), flow(['api', 'pdp'], { kind: 'handshake', back: true, rate: 1 })],
        metrics: { leaks: '0', model: 'RBAC → ABAC/ReBAC', checks: 'app + DB', audit: 'every decision' },
      },
    },
  ],
};

export default lesson;
