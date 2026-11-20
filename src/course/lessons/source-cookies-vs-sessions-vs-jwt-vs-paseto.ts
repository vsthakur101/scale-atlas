import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const browser = (extra: Partial<SceneNode> = {}) => box('browser', -16, 0, 'Browser', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', -6, 0, 'API servers', 'blue', 'server', { size: [1.4, 1.4], height: 30, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', 6, -6, 'Session store (Redis)', { size: [1.3, 1.3], ...extra });
const idp = (extra: Partial<SceneNode> = {}) => box('idp', 6, 6, 'Auth service (signs tokens)', 'purple', 'shield', { size: [1.3, 1.3], height: 26, ...extra });

const fmtB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.round(b / 1e3)} KB`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);
const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-cookies-vs-sessions-vs-jwt-vs-paseto',
  title: 'Sessions, Cookies and Tokens: Stateful vs Stateless Authentication',
  blurb: 'Where the proof of login lives: a server-side session looked up by an opaque id, or a signed token carried by the client — and what each costs in memory, bandwidth, CPU and revocation delay.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'mem', label: 'Session store memory', icon: 'disk' },
    { key: 'lookups', label: 'Session-store lookups per second', icon: 'activity' },
    { key: 'bw', label: 'Token bandwidth overhead', icon: 'share' },
    { key: 'cpu', label: 'Cores spent verifying tokens', icon: 'cpu' },
    { key: 'revoke', label: 'JWT revocation delay', icon: 'alert' },
  ],
  goals: [
    { text: 'What a cookie is and what attributes protect it', step: 1 },
    { text: 'Server-side sessions: opaque id, state on the server', step: 2 },
    { text: 'Signed tokens (JWT, PASETO): state in the client', step: 3 },
    { text: 'The cost comparison and the revocation problem', step: 4 },
    { text: 'Choosing, and the common mistakes', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'users', label: 'Concurrent signed-in users', min: 1000, max: 100000000, step: 1000, default: 2000000, unit: '', description: 'Users with a live session.' },
      { key: 'rps', label: 'Authenticated requests per second', min: 100, max: 5000000, step: 100, default: 100000, unit: '/s', description: 'API calls carrying the credential.' },
      { key: 'sbytes', label: 'Session record size', min: 50, max: 10000, step: 50, default: 500, unit: ' B', description: 'User id, roles, metadata kept in the store.' },
      { key: 'jbytes', label: 'Signed token size', min: 100, max: 4000, step: 50, default: 900, unit: ' B', description: 'Header + claims + signature, base64-encoded.' },
      { key: 'vus', label: 'Token verification time', min: 2, max: 500, step: 1, default: 60, unit: ' µs', description: 'Signature check (HMAC ≈ few µs; RSA/ECDSA verify tens to hundreds).' },
      { key: 'ttl', label: 'Access-token lifetime', min: 1, max: 1440, step: 1, default: 15, unit: ' min', description: 'How long a signed token stays valid.' },
    ],
    calculate: (input, step) => {
      const users = Math.max(1, input.users ?? 2e6);
      const rps = Math.max(1, input.rps ?? 1e5);
      const sb = Math.max(1, input.sbytes ?? 500);
      const jb = Math.max(1, input.jbytes ?? 900);
      const vus = Math.max(0.1, input.vus ?? 60) / 1e6;
      const ttl = Math.max(1, input.ttl ?? 15) * 60;
      return {
        mem: step < 1 ? { v: '—' } : { v: `${fmtB(users * sb * 1.5)} (sessions, with overhead)`, tone: users * sb > 5e9 ? 'warn' : 'good' },
        lookups: step < 1 ? { v: '—' } : { v: `${fmtN(rps)}/s (one store read per request)`, tone: rps > 200000 ? 'warn' : 'good' },
        bw: step < 2 ? { v: '—' } : { v: `${fmtB(rps * jb)}/s (vs ${fmtB(rps * 32)}/s for a 32-byte session id)`, tone: jb > 2000 ? 'warn' : 'good' },
        cpu: step < 2 ? { v: '—' } : { v: `${(rps * vus).toFixed(1)} cores`, tone: rps * vus < 8 ? 'good' : 'warn' },
        revoke: step < 3 ? { v: '—' } : { v: `up to ${fmtT(ttl)} (sessions: instant)`, tone: ttl <= 900 ? 'good' : ttl <= 3600 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Cookies',
      kind: 'technique',
      title: 'HTTP is stateless; cookies carry the identity',
      body: [
        'After login the server must recognise the same user on later requests, but HTTP carries no memory. The server responds with <code>Set-Cookie</code>; the browser stores the value and automatically sends it back in a <code>Cookie</code> header on every matching request. Whatever the cookie holds — a session id, a token — is therefore the <b>credential</b>: anyone who has it <i>is</i> the user.',
        'Protect it with attributes: <code>HttpOnly</code> (JavaScript can’t read it, limiting XSS theft), <code>Secure</code> (HTTPS only), <code>SameSite=Lax|Strict</code> (not sent on cross-site requests, the main defence against CSRF), a narrow <code>Domain</code>/<code>Path</code>, and an <code>Expires</code>/<code>Max-Age</code>. Cookies are limited to ~4 KB and sent on <i>every</i> request to the site, including images — a reason to keep them small.',
      ],
      changes: [{ text: 'HttpOnly + Secure + SameSite; small, scoped, expiring', tone: 'good' }, { text: 'The cookie value is the credential', tone: 'info' }],
      scene: { nodes: [browser({ tag: pill('Cookie: sid=…', 'hash') }), api({ tag: pill('Set-Cookie: HttpOnly; Secure; SameSite', 'lock', 'good') })], links: [link('browser', 'api', { arrow: 'both' })], flows: [flow(['browser', 'api'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Sessions',
      kind: 'technique',
      title: 'Server-side sessions: an opaque id and state on the server',
      body: [
        'On login the server creates a <b>session record</b> (user id, roles, created, last seen) and stores it in memory, a database or — usually — a shared store such as Redis, keyed by a long <b>random id</b> (128+ bits, unguessable). The cookie carries only that id. Each request: read the cookie, <b>look up the session</b>, and proceed. Logout or a security event simply <b>deletes the record</b>: revocation is <b>instant</b>, and the server can change a user’s permissions or force-logout everyone at will.',
        'Costs: the store is a <b>dependency on every request</b> (one lookup each — 100,000 req/s means 100,000 reads/s, ~0.5 ms of latency, and an outage logs everyone out unless replicated), and it holds state: 2 million sessions × 500 B ≈ <b>1.5 GB</b> with overhead — modest, but it must be shared by all servers or you need sticky routing (see the Stateless Servers lesson). Sliding expiry means writes too. Rotate the id on login to prevent <b>session fixation</b>.',
      ],
      changes: [{ text: 'Random id → record in a shared store', tone: 'good' }, { text: 'Instant revocation; one lookup per request', tone: 'info' }],
      scene: { nodes: [browser({ tag: pill('sid=9f3a…', 'hash') }), api({ tag: pill('look up the session', 'search') }), store({ tag: pill('{user, roles, expiry}', 'file', 'good') })], links: [link('browser', 'api'), link('api', 'store', { arrow: 'both' })], flows: [flow(['browser', 'api', 'store'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Tokens',
      kind: 'technique',
      title: 'Signed tokens: the state travels with the client',
      body: [
        'A <b>JWT</b> (JSON Web Token) is three base64url parts — header, <b>claims</b> (<code>sub</code>, <code>exp</code>, roles, <code>iss</code>, <code>aud</code>) and a <b>signature</b> over them. The server issues it at login; on each request any server with the <b>verification key</b> checks the signature and expiry and trusts the claims — <b>no store lookup</b>, which suits microservices and APIs (each service verifies locally; see the OAuth lesson). <b>PASETO</b> is a stricter alternative with fixed, safe algorithm choices and encryption options, avoiding JWT’s many footguns.',
        'Costs move to the <b>wire and the CPU</b>: a 900-byte token on 100,000 requests/s is <b>90 MB/s</b> of extra headers (vs 3 MB/s for a 32-byte session id), and each request pays a signature check — at 60 µs that is 6 cores of verification (an HMAC is far cheaper than RSA/ECDSA verification). Tokens are <i>readable</i> (signed, not encrypted — don’t put secrets in claims) and must stay under the 4 KB cookie limit.',
      ],
      changes: [{ text: 'header.claims.signature; verified locally', tone: 'good' }, { text: '900 B × 100k/s = 90 MB/s; ~6 cores to verify', tone: 'info' }],
      concepts: [{ term: 'JWT', def: 'A signed JSON claims token that servers can verify without a lookup, trading revocability and size for statelessness.' }],
      scene: { nodes: [browser({ tag: pill('Authorization: Bearer eyJ…', 'hash') }), api({ tag: pill('verify signature + exp', 'check', 'good') }), idp({ tag: pill('issued at login', 'lock') })], links: [link('browser', 'api'), link('idp', 'api', { style: 'dashed', arrow: 'end' })], flows: [flow(['browser', 'api'], { rate: 1.5 })] },
    },
    {
      short: 'Revocation',
      kind: 'problem',
      title: 'The price of statelessness: you can’t take a token back',
      body: [
        'A signed token is valid until it expires, wherever it is. If it is stolen, the user is fired, or their role changes, <b>nothing the server does invalidates it</b> before <code>exp</code> — with a 15-minute lifetime the exposure is up to 15 minutes; with a 24-hour “remember me” token, a day. This is the central trade-off against sessions’ instant revocation.',
        'Mitigations: <b>short-lived access tokens</b> (5–15 min) plus a <b>refresh token</b> held server-side and rotated on use (revocable, stored in a database); a <b>denylist</b> of revoked token ids (a small shared set checked on each request — which reintroduces a lookup, but only a tiny set); a per-user <b>token version</b> bumped on password change; and <b>key rotation</b> as the nuclear option. Notice that every fix re-adds a little state: statelessness is a spectrum.',
      ],
      changes: [{ text: '15-min token: up to 15 min of exposure', tone: 'bad' }, { text: 'Short TTL + rotating refresh token + small denylist', tone: 'good' }],
      scene: { nodes: [browser({ tag: pill('stolen token still valid', 'alert', 'bad') }), api({ tag: pill('signature OK, exp not reached', 'check', 'warn') }), store({ name: 'Denylist / refresh tokens', tag: pill('small, checked or rotated', 'shield', 'good') })], links: [link('browser', 'api'), link('api', 'store', { style: 'dashed' })], flows: [flow(['browser', 'api'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Choosing',
      kind: 'tradeoff',
      title: 'Choosing, and the common mistakes',
      body: [
        '<b>Sessions</b> fit browser apps on one domain: instant logout and permission changes, tiny cookies, simple security story. <b>Tokens</b> fit APIs, mobile apps, microservices and cross-domain or third-party access, where a central store lookup is awkward. A common hybrid: a <b>session cookie for the first-party web app</b> and <b>short-lived tokens</b> for service-to-service calls — or a gateway that exchanges the cookie for an internal token.',
        'Mistakes to avoid: storing tokens in <code>localStorage</code> (readable by any injected script — prefer HttpOnly cookies, or a backend-for-frontend); accepting <code>alg: none</code> or letting the token choose its own algorithm; not checking <code>aud</code>/<code>iss</code>/<code>exp</code>; secrets or personal data in claims; huge claim sets; long-lived tokens with no revocation path; and weak signing keys. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Sessions for first-party web; tokens for APIs and services', tone: 'info' }, { text: 'Avoid localStorage tokens, alg: none, missing aud/iss/exp checks', tone: 'bad' }],
      scene: { nodes: [box('sess', -8, 0, 'Server session', 'blue', 'db', { size: [1.3, 1.3], height: 22, tag: pill('web app · instant revoke', 'check') }), box('tok', 8, 0, 'Signed token', 'orange', 'lock', { size: [1.3, 1.3], height: 22, tag: pill('API · stateless', 'check') })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'State on the server or state in the token',
      body: [
        '<b>Sessions</b> keep state server-side behind an unguessable cookie id: instant revocation, a lookup per request, memory ≈ users × record size. <b>Signed tokens</b> carry state in the client: no lookup, larger requests and verification CPU, and revocation only by expiry or added state.',
        'Use HttpOnly/Secure/SameSite cookies, short-lived tokens with rotating refresh tokens, verify every claim, and pick the model from who your clients are.',
      ],
      scene: { nodes: [browser(), api(), store(), idp()], links: [link('browser', 'api'), link('api', 'store', { style: 'dashed' }), link('idp', 'api', { style: 'dashed' })], flows: [flow(['browser', 'api'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
