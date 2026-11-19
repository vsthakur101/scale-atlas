import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill, you } from '../kit';

const me = (extra: Partial<SceneNode> = {}) => you('you', -10, 1, { label: pill('Priya', 'user'), ...extra });
const lb = box('lb', -3, 0, 'Load', 'orange', 'route', { sub: 'balancer' });
const a = (extra: Partial<SceneNode> = {}) => box('a', 4, -4, 'Server A', 'blue', 'server', { size: [1.5, 1.5], height: 44, ...extra });
const b = (extra: Partial<SceneNode> = {}) => box('b', 5, 3, 'Server B', 'blue', 'server', { size: [1.5, 1.5], height: 44, ...extra });
const redis = (extra: Partial<SceneNode> = {}) => box('sess', 12, -1, 'Sessions', 'red', 'key', { size: [1.4, 1.4], height: 38, sub: 'in-memory store', ...extra });
const objects = (extra: Partial<SceneNode> = {}) => disk('obj', 12, 6, 'object store', { size: [1.8, 1.8], height: 30, tone: 'orange', icon: 'image', ...extra });
const users = db('db', 13, -7, 'Users DB');

const lesson: Lesson = {
  slug: 'stateless',
  title: 'Stateless Servers',
  blurb: 'Why servers that remember nothing between requests are the ones you can add, remove and replace at will.',
  minutes: 10,
  level: 'Beginner',
  metrics: [
    { key: 'login', label: 'Session', icon: 'key' },
    { key: 'healthy', label: 'Healthy', icon: 'heart' },
    { key: 'balance', label: 'Balance', icon: 'scale' },
    { key: 'lookup', label: 'Auth cost', icon: 'timer' },
  ],
  goals: [
    { text: 'What “state” on a server is and why it breaks scaling', step: 2 },
    { text: 'Sticky sessions and their failure modes', step: 4 },
    { text: 'Externalising sessions to a shared store', step: 6 },
    { text: 'Signed tokens and their revocation trade-off', step: 7 },
    { text: 'Keeping files off local disks', step: 9 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  steps: [
    {
      short: 'Logged in',
      kind: 'insight',
      title: 'A login that lives in one server’s memory',
      body: [
        'Priya signs in. Server A checks her password against the users database, creates a session object, and stores it in a hash map <b>in its own memory</b>, keyed by a random ID it sends back as a cookie.',
        'On her next click, A looks up that cookie, finds the session, and knows who she is. Simple and fast — with exactly one server.',
      ],
      concepts: [{ term: 'Session', def: 'Server-side data (user id, roles, cart) associated with a client via an identifier, usually a cookie.' }],
      scene: {
        nodes: [me(), lb, a({ tag: pill('session in RAM', 'key') }), b(), users],
        links: [link('you', 'lb'), link('lb', 'a'), link('lb', 'b', { style: 'dashed' }), link('a', 'db', { arrow: 'both' })],
        flows: [flow(['you', 'lb', 'a'], { back: true, rate: 1.2 }), flow(['a', 'db'], { back: true, rate: 0.5 })],
        metrics: { login: { v: 'on A', tone: 'good' }, healthy: '2 / 2', balance: 'even', lookup: '0.01 ms' },
      },
    },
    {
      short: 'Logged out',
      kind: 'problem',
      title: 'Next click: “please sign in”',
      body: [
        'The balancer sends Priya’s next request to Server B — it had fewer connections. B has never heard of her session ID, so it treats her as anonymous and redirects to the login page.',
        'From her point of view the site randomly forgets her. The cause: the server holds <b>state</b> that the next request needs, so requests are no longer interchangeable between servers.',
      ],
      note: { kind: 'key', text: 'A server is stateless when any instance can serve any request because everything the request needs comes with it or lives in a shared store.' },
      changes: [{ text: 'Request lands on B', tone: 'bad' }, { text: 'Session not found → logged out', tone: 'bad' }],
      concepts: [{ term: 'Stateless service', def: 'A service whose instances keep no per-client data between requests, so any instance can handle any request.' }],
      scene: {
        nodes: [me({ tag: pill('signed out?!', 'alert', 'bad') }), lb, a({ tag: pill('session in RAM', 'key') }), b({ tag: pill('who are you?', 'user', 'bad') }), users],
        links: [link('you', 'lb'), link('lb', 'a', { style: 'dashed' }), link('lb', 'b')],
        flows: [flow(['you', 'lb', 'b'], { back: true, rate: 1.2 })],
        metrics: { login: { v: 'lost', tone: 'bad' }, healthy: '2 / 2', balance: 'even', lookup: '0.01 ms' },
      },
    },
    {
      short: 'Sticky',
      kind: 'technique',
      title: 'Sticky sessions: always the same server',
      body: [
        'Quick fix: tell the balancer to pin each user to one server — <b>session affinity</b> — usually by setting its own cookie naming the chosen backend, or by hashing the client IP.',
        'Priya now always reaches A, and her session is always there. No code changes required.',
      ],
      concepts: [{ term: 'Sticky sessions', def: 'Load-balancer affinity that keeps routing a given client to the same backend.' }],
      changes: [{ text: 'LB cookie pins Priya → A', tone: 'good' }],
      scene: {
        nodes: [me(), { ...lb, tag: pill('affinity: A', 'pin') }, a({ tag: pill('session in RAM', 'key') }), b(), users],
        links: [link('you', 'lb'), link('lb', 'a', { label: pill('always A') }), link('lb', 'b', { style: 'dashed' })],
        flows: [flow(['you', 'lb', 'a'], { back: true, rate: 1.2 })],
        metrics: { login: { v: 'on A', tone: 'good' }, healthy: '2 / 2', balance: 'pinned', lookup: '0.01 ms' },
      },
    },
    {
      short: 'A dies',
      kind: 'problem',
      title: 'Sticky until the server isn’t there',
      body: [
        'Server A is replaced during a routine deploy. Every session in its memory vanishes, and every user pinned to it is signed out at once — shopping carts included.',
        'Stickiness has quieter costs too: load can’t rebalance (a few heavy users stuck to one server stay there), and autoscaling can’t move existing users onto new servers.',
      ],
      changes: [{ text: 'A replaced → all its sessions lost', tone: 'bad' }, { text: 'Uneven load can’t be fixed', tone: 'bad' }],
      scene: {
        nodes: [me({ tag: pill('cart gone', 'alert', 'bad') }), { ...lb, tag: pill('affinity: A', 'pin') }, a({ state: 'down', tag: pill('redeployed', 'refresh', 'bad') }), b({ load: 70 }), users],
        links: [link('you', 'lb'), link('lb', 'a', { style: 'broken' }), link('lb', 'b')],
        flows: [flow(['you', 'lb', 'a'], { kind: 'fail', rate: 1.2 })],
        metrics: { login: { v: 'lost', tone: 'bad' }, healthy: { v: '1 / 2', tone: 'warn' }, balance: { v: 'skewed', tone: 'warn' }, lookup: '—' },
      },
    },
    {
      short: 'Shared store',
      kind: 'technique',
      title: 'Move sessions out of the servers',
      body: [
        'Store sessions in a fast shared store — an in-memory key-value database such as Redis — instead of process memory. The cookie still carries only the session ID; any server looks it up there.',
        'App servers become <b>stateless</b>: they compute, but remember nothing. The balancer is free to use any policy again.',
      ],
      note: { kind: 'warn', text: 'The session store is now on every request’s path. Replicate it, set sensible TTLs, and keep session objects small — a 200 KB session read on each request adds up fast.' },
      changes: [{ text: 'Sessions → shared store', tone: 'good' }, { text: '+0.5 ms per request', tone: 'bad' }],
      concepts: [{ term: 'Externalised state', def: 'Keeping per-user state in a shared store so application instances stay interchangeable.' }],
      scene: {
        nodes: [me(), lb, a({ load: 45 }), b({ load: 45 }), redis({ tag: pill('sess:9f2c → Priya', 'key', 'good') }), users],
        links: [link('you', 'lb'), link('lb', 'a'), link('lb', 'b'), link('a', 'sess', { arrow: 'both' }), link('b', 'sess', { arrow: 'both' })],
        flows: [flow(['you', 'lb', 'a', 'sess'], { back: true, rate: 0.7 }), flow(['you', 'lb', 'b', 'sess'], { back: true, rate: 0.7 })],
        metrics: { login: { v: 'shared', tone: 'good' }, healthy: '2 / 2', balance: { v: 'even', tone: 'good' }, lookup: '0.5 ms' },
      },
    },
    {
      short: 'Lose one',
      kind: 'case',
      title: 'Kill a server, nobody notices',
      body: [
        'Now replace Server A mid-afternoon. The balancer stops routing to it; Priya’s next request lands on B, which fetches her session from the store and carries on.',
        'Servers have become <b>cattle, not pets</b>: interchangeable, disposable, and safe to autoscale, redeploy or lose.',
      ],
      changes: [{ text: 'A removed', tone: 'bad' }, { text: 'Priya still signed in', tone: 'good' }],
      scene: {
        nodes: [me(), lb, a({ state: 'down' }), b({ load: 80 }), redis(), users],
        links: [link('you', 'lb'), link('lb', 'a', { style: 'dashed' }), link('lb', 'b'), link('b', 'sess', { arrow: 'both' })],
        flows: [flow(['you', 'lb', 'b', 'sess'], { back: true, rate: 1.2 })],
        metrics: { login: { v: 'kept', tone: 'good' }, healthy: { v: '1 / 2', tone: 'warn' }, balance: 'even', lookup: '0.5 ms' },
      },
    },
    {
      short: 'Tokens',
      kind: 'tradeoff',
      title: 'Or carry the state with the request',
      body: [
        'Alternatively, put the identity <b>in the token itself</b>: user ID, roles and expiry, signed with a server-side key (a JWT is one format). Any server verifies the signature with no lookup at all.',
        'The catch is revocation: a signed token stays valid until it expires, even if the user logs out or is banned. Common answer: short-lived access tokens (minutes) plus a refresh token that <i>is</i> checked against a store.',
      ],
      note: { kind: 'warn', text: 'Signed is not encrypted. Anyone holding the token can read its claims — never put secrets in it.' },
      changes: [{ text: 'No per-request lookup', tone: 'good' }, { text: 'Revocation is harder', tone: 'bad' }],
      concepts: [
        { term: 'JWT', def: 'JSON Web Token: a signed (optionally encrypted) set of claims a server can verify without a database lookup.' },
        { term: 'Refresh token', def: 'A longer-lived credential, checked against a store, used to obtain new short-lived access tokens.' },
      ],
      scene: {
        nodes: [me({ tag: pill('token: {uid, exp, sig}', 'key', 'accent') }), lb, a({ load: 40, tag: pill('verify sig ✓', 'shield', 'good') }), b({ load: 40, tag: pill('verify sig ✓', 'shield', 'good') }), redis({ state: 'dim', sub: 'refresh only' }), users],
        links: [link('you', 'lb'), link('lb', 'a'), link('lb', 'b')],
        flows: [flow(['you', 'lb', 'a'], { back: true, rate: 1 }), flow(['you', 'lb', 'b'], { back: true, rate: 1 })],
        metrics: { login: { v: 'in token', tone: 'good' }, healthy: '2 / 2', balance: 'even', lookup: { v: '0.05 ms', tone: 'good' } },
      },
    },
    {
      short: 'Uploads',
      kind: 'problem',
      title: 'Sessions fixed — then avatars break',
      body: [
        'Priya uploads a profile photo. Server A writes it to <code>/var/uploads</code> on its local disk and saves the path. When B renders her profile, the file isn’t on B’s disk: broken image.',
        'Local files are state too. So are in-process caches that must stay consistent, scheduled jobs that should run once, and WebSocket connections pinned to a host.',
      ],
      changes: [{ text: 'File on A’s disk only', tone: 'bad' }, { text: 'B returns 404', tone: 'bad' }],
      scene: {
        nodes: [me(), lb, a({ tag: pill('/var/uploads/p.jpg', 'image') }), b({ tag: pill('404 not found', 'alert', 'bad') }), redis(), users],
        links: [link('you', 'lb'), link('lb', 'a'), link('lb', 'b')],
        flows: [flow(['you', 'lb', 'a'], { kind: 'write', rate: 0.6 }), flow(['you', 'lb', 'b'], { kind: 'fail', rate: 0.8 })],
        metrics: { login: 'in token', healthy: '2 / 2', balance: 'even', lookup: '0.05 ms' },
      },
    },
    {
      short: 'Object store',
      kind: 'technique',
      title: 'Files go to an object store',
      body: [
        'Store uploads in an <b>object store</b> (S3-style): durable, replicated, and reachable by every server. Better still, have the server hand the client a short-lived <b>pre-signed URL</b> so the browser uploads directly, keeping large bodies off the app servers entirely.',
        'The app servers now hold nothing that would be missed if they vanished — the definition of stateless.',
      ],
      changes: [{ text: 'Uploads → object store', tone: 'good' }, { text: 'Direct upload via pre-signed URL', tone: 'good' }],
      concepts: [{ term: 'Pre-signed URL', def: 'A time-limited URL granting permission to upload or download one object without further credentials.' }],
      scene: {
        nodes: [me(), lb, a({ load: 35 }), b({ load: 35 }), redis(), users, objects({ tag: pill('avatars/p.jpg', 'image', 'good') })],
        links: [link('you', 'lb'), link('lb', 'a'), link('lb', 'b'), link('you', 'obj', { style: 'dashed', label: pill('pre-signed PUT', 'link') }), link('b', 'obj', { arrow: 'both' })],
        flows: [flow(['you', 'obj'], { kind: 'write', rate: 0.6 }), flow(['you', 'lb', 'b'], { back: true, rate: 1 })],
        metrics: { login: 'in token', healthy: '2 / 2', balance: 'even', lookup: '0.05 ms' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Push state to the edges',
      body: [
        'Anything a later request needs — sessions, files, caches that must agree — cannot live inside one app server if servers are to be interchangeable. <b>Sticky sessions</b> hide the problem until a server goes away.',
        'Keep app servers <b>stateless</b>: sessions in a shared store or signed tokens, files in an object store, data in databases. Then scaling, deploying and surviving failures all become routine.',
      ],
      scene: {
        nodes: [me(), lb, a({ load: 45, tag: pill('stateless', 'box', 'good') }), b({ load: 45, tag: pill('stateless', 'box', 'good') }), redis(), users, objects()],
        links: [link('you', 'lb'), link('lb', 'a'), link('lb', 'b'), link('a', 'sess', { arrow: 'both' }), link('b', 'obj', { arrow: 'both' }), link('a', 'db', { arrow: 'both' })],
        flows: [flow(['you', 'lb', 'a'], { back: true, rate: 1 }), flow(['you', 'lb', 'b'], { back: true, rate: 1 })],
        metrics: { login: { v: 'shared', tone: 'good' }, healthy: '2 / 2', balance: 'even', lookup: '0.5 ms' },
      },
    },
  ],
};

export default lesson;
