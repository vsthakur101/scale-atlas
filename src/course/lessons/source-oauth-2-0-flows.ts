import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => box('user', -15, -5, 'User', 'green', 'user', { size: [1.1, 1.1], height: 22, ...extra });
const app = (extra: Partial<SceneNode> = {}) => box('app', -6, 5, 'Client app', 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });
const authz = (extra: Partial<SceneNode> = {}) => box('authz', 4, -5, 'Authorization server', 'purple', 'shield', { size: [1.4, 1.4], height: 30, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', 14, 5, 'Resource server (API)', 'orange', 'db', { size: [1.3, 1.3], height: 28, ...extra });

const fmtR = (r: number): string => (r >= 1e6 ? `${(r / 1e6).toFixed(1)}M/s` : r >= 1e3 ? `${(r / 1e3).toFixed(1)}k/s` : `${r.toFixed(r < 10 ? 1 : 0)}/s`);

const lesson: Lesson = {
  slug: 'source-oauth-2-0-flows',
  title: 'OAuth 2.0 Flows',
  blurb: 'Delegated access without sharing passwords: the authorization-code flow with PKCE, client credentials, device code — and what token lifetime does to load and risk.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'refresh', label: 'Token refreshes at the auth server', icon: 'refresh' },
    { key: 'introspect', label: 'Introspection calls (opaque, no cache)', icon: 'activity' },
    { key: 'cached', label: 'Introspection with a short cache', icon: 'layers' },
    { key: 'leak', label: 'Window a stolen access token works', icon: 'alert' },
  ],
  goals: [
    { text: 'The four roles and why passwords are not shared', step: 1 },
    { text: 'The authorization-code flow step by step', step: 2 },
    { text: 'PKCE and why public clients need it', step: 3 },
    { text: 'Other flows: client credentials and device code', step: 5 },
    { text: 'Token lifetime, refresh and revocation trade-offs', step: 6 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'users', label: 'Active signed-in users', min: 1000, max: 10000000, step: 1000, default: 100000, unit: '', description: 'Users with a live session whose client holds an access token.' },
      { key: 'ttl', label: 'Access-token lifetime', min: 1, max: 1440, step: 1, default: 15, unit: ' min', description: 'How long an access token stays valid.' },
      { key: 'rps', label: 'API requests per second', min: 100, max: 500000, step: 100, default: 50000, unit: '/s', description: 'Calls carrying a bearer token.' },
      { key: 'cache', label: 'Introspection cache time', min: 1, max: 300, step: 1, default: 30, unit: ' s', description: 'How long the API caches an introspection result per token.' },
    ],
    calculate: (input, step) => {
      const users = Math.max(1, input.users ?? 1e5);
      const ttl = Math.max(1, input.ttl ?? 15) * 60;
      const rps = Math.max(1, input.rps ?? 5e4);
      const cache = Math.max(1, input.cache ?? 30);
      const refresh = users / ttl;
      // With a cache each distinct token is checked at most once per cache period.
      const cached = Math.min(rps, users / cache);
      return {
        refresh: step < 5 ? { v: '—' } : { v: fmtR(refresh), tone: refresh < 2000 ? 'good' : refresh < 20000 ? 'warn' : 'bad' },
        introspect: step < 5 ? { v: '—' } : { v: fmtR(rps), tone: rps > 20000 ? 'bad' : 'warn' },
        cached: step < 5 ? { v: '—' } : { v: fmtR(cached), tone: cached < 5000 ? 'good' : cached < 20000 ? 'warn' : 'bad' },
        leak: step < 5 ? { v: '—' } : { v: ttl >= 3600 ? `${(ttl / 3600).toFixed(1)} h` : `${Math.round(ttl / 60)} min`, tone: ttl <= 900 ? 'good' : ttl <= 3600 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'problem',
      title: 'Letting an app act for you without giving it your password',
      body: [
        'A photo-printing site wants to read your photos from a cloud storage service. The old way: give it your storage password. Now it has <b>everything</b>, forever, can’t be limited or revoked without changing your password, and can’t be told apart from you.',
        '<b>OAuth 2.0</b> is a framework for <b>delegated authorization</b>. Four roles: the <b>resource owner</b> (you), the <b>client</b> (the printing app), the <b>authorization server</b> (issues tokens after you consent) and the <b>resource server</b> (the storage API). The client receives a narrowly <b>scoped</b>, <b>expiring</b> access token instead of a password. (OAuth is about authorization; “sign in with …” adds OpenID Connect on top for identity.)',
      ],
      scene: { nodes: [user(), app(), authz(), api()], links: [link('user', 'authz'), link('app', 'authz'), link('app', 'api')], flows: [flow(['app', 'api'], { rate: 1 })] },
    },
    {
      short: 'Auth code',
      kind: 'technique',
      title: 'The authorization-code flow',
      body: [
        '1. The client redirects the user’s browser to the authorization server with its <code>client_id</code>, requested <code>scope</code>, a <code>redirect_uri</code> and a random <code>state</code>. 2. The user <b>authenticates there</b> (the client never sees the password) and approves the scopes. 3. The server redirects back to the client with a short-lived <b>authorization code</b> and the same <code>state</code> (checked against CSRF).',
        '4. The client’s <i>back end</i> POSTs the code (plus its secret or PKCE verifier) to the <b>token endpoint</b> and receives an <b>access token</b> and usually a <b>refresh token</b>. 5. It calls the API with <code>Authorization: Bearer …</code>. The code travels through the browser; the tokens don’t — the sensitive exchange happens server to server.',
      ],
      changes: [{ text: 'Browser carries only a one-time code', tone: 'good' }, { text: 'Tokens exchanged back-channel', tone: 'good' }, { text: 'state parameter prevents CSRF', tone: 'info' }],
      scene: { nodes: [user({ tag: pill('logs in & consents', 'check') }), app({ tag: pill('exchanges code', 'refresh') }), authz({ tag: pill('issues code, then tokens', 'hash') }), api({ tag: pill('Bearer token', 'lock') })], links: [link('user', 'authz'), link('authz', 'app', { arrow: 'end', style: 'dashed' }), link('app', 'authz', { arrow: 'both' }), link('app', 'api')], flows: [flow(['user', 'authz'], { kind: 'handshake', rate: 0.8 }), flow(['app', 'authz'], { kind: 'handshake', rate: 0.8, back: true }), flow(['app', 'api'], { rate: 1.2 })] },
    },
    {
      short: 'PKCE',
      kind: 'technique',
      title: 'PKCE: protecting public clients',
      body: [
        'A mobile app or single-page app can’t keep a <b>client secret</b> — anyone can unpack it. If an attacker intercepts the authorization code (a malicious app registered for the same custom URL scheme, a leaked redirect), they could redeem it. <b>PKCE</b> (“pixie”, RFC 7636) closes this: the client generates a random <code>code_verifier</code>, sends only its hash (<code>code_challenge</code>) in step 1, and proves possession of the original in the token request.',
        'A stolen code is now useless without the verifier, which never left the client. Current guidance (OAuth 2.1 direction) is: <b>use authorization code + PKCE for every client</b>, public or confidential; the older <b>implicit flow</b> (tokens in the URL fragment) and <b>password grant</b> are deprecated.',
      ],
      changes: [{ text: 'challenge = hash(verifier) sent first', tone: 'info' }, { text: 'Redeeming the code needs the verifier', tone: 'good' }, { text: 'Implicit and password flows: avoid', tone: 'bad' }],
      concepts: [{ term: 'PKCE', def: 'Proof Key for Code Exchange: binds an authorization code to the client that requested it using a one-time secret and its hash.' }],
      scene: { nodes: [app({ tag: pill('keeps code_verifier', 'lock') }), authz({ tag: pill('stores code_challenge', 'hash') }), box('evil', 4, 8, 'Attacker with stolen code', 'red', 'alert', { size: [1.2, 1.2], height: 22, tag: pill('no verifier → rejected', 'shield', 'good') })], links: [link('app', 'authz', { arrow: 'both' }), link('evil', 'authz', { style: 'broken' })], flows: [flow(['app', 'authz'], { kind: 'handshake', rate: 1, back: true }), flow(['evil', 'authz'], { kind: 'fail', rate: 0.7 })] },
    },
    {
      short: 'Scopes',
      kind: 'insight',
      title: 'Scopes, audiences and what a token means',
      body: [
        '<b>Scopes</b> limit what the token may do (<code>photos.read</code>, not <code>photos.delete</code>), shown to the user at consent. The <b>audience</b> says which API it is for, so one service can’t replay a token against another. Access tokens are either <b>opaque</b> (random strings the API checks by asking the auth server — <i>introspection</i>) or <b>self-contained JWTs</b> verified locally from the issuer’s public key.',
        'Treat the token as a <b>bearer</b> credential: whoever holds it can use it, so keep it out of URLs and logs, send it only over TLS, and make it short-lived. Sender-constrained variants (mTLS-bound, DPoP) tie a token to a key so theft isn’t enough.',
      ],
      concepts: [{ term: 'Bearer token', def: 'A credential that grants access to whoever presents it, with no proof of identity beyond possession.' }],
      scene: { nodes: [app({ tag: pill('scope: photos.read', 'list') }), api({ tag: pill('checks scope + audience', 'check', 'good') })], links: [link('app', 'api')], flows: [flow(['app', 'api'], { rate: 1.5 })] },
    },
    {
      short: 'Other flows',
      kind: 'technique',
      title: 'Client credentials and device code',
      body: [
        '<b>Client credentials</b>: no user at all — a back-end service authenticates with its own id and secret (or a signed assertion/mTLS) and gets a token for itself. The workhorse of service-to-service calls and batch jobs. <b>Device authorization</b>: for a TV or CLI with no browser — the device shows a short code and URL; the user approves on their phone while the device polls the token endpoint.',
        '<b>Refresh tokens</b> let a client get new access tokens without the user returning. They are long-lived and powerful, so store them securely and use <b>rotation</b> (each use issues a new one and invalidates the old; reuse of an old one signals theft and revokes the family).',
      ],
      changes: [{ text: 'Client credentials: machine to machine', tone: 'info' }, { text: 'Device code: input-limited devices', tone: 'info' }, { text: 'Refresh-token rotation detects theft', tone: 'good' }],
      scene: { nodes: [box('svc', -10, -4, 'Backend service', 'blue', 'server', { size: [1.3, 1.3], height: 26, tag: pill('client credentials', 'lock') }), box('tv', -10, 6, 'Smart TV', 'green', 'globe', { size: [1.3, 1.3], height: 24, tag: pill('shows code ABCD-1234', 'hash') }), authz(), api()], links: [link('svc', 'authz'), link('tv', 'authz', { style: 'dashed' }), link('authz', 'api', { style: 'dashed' })], flows: [flow(['svc', 'authz'], { kind: 'handshake', rate: 1, back: true }), flow(['tv', 'authz'], { rate: 0.8 })] },
    },
    {
      short: 'Lifetime',
      kind: 'tradeoff',
      title: 'Token lifetime: load against exposure',
      body: [
        'Short access-token lifetimes limit damage from theft — a stolen 15-minute token works for 15 minutes — but every client must <b>refresh</b>: 100,000 active users refreshing every 15 minutes puts ~111 requests/s on the authorization server; at 1 minute it is ~1,667/s. Long lifetimes cut that load and widen the theft window and the delay before a revoked user actually loses access.',
        'Validation has the same shape: <b>opaque tokens</b> checked by introspection give instant revocation but add a call per API request (50,000/s here; ~3,300/s with a 30 s cache) and a dependency on the auth server; <b>JWTs</b> verify locally with no call but can’t be revoked before they expire — keep them short and add a denylist for emergencies.',
      ],
      changes: [{ text: '15-min token, 100k users → ~111 refreshes/s', tone: 'info' }, { text: 'Opaque: instant revoke, one call per request', tone: 'info' }, { text: 'JWT: no call, revocation delay = lifetime', tone: 'info' }],
      scene: { nodes: [app({ tag: pill('refresh every TTL', 'refresh') }), authz({ tag: pill('load = users ÷ TTL', 'gauge') }), api({ tag: pill('introspect or verify JWT', 'search') })], links: [link('app', 'authz', { arrow: 'both' }), link('api', 'authz', { style: 'dashed', arrow: 'both' })], flows: [flow(['app', 'authz'], { rate: 1, back: true }), flow(['api', 'authz'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Pitfalls',
      kind: 'problem',
      title: 'How OAuth deployments go wrong',
      body: [
        '<b>Open or loosely matched redirect URIs</b> let an attacker receive codes — require exact-match registered URIs. <b>Missing <code>state</code></b> enables login CSRF. <b>Tokens in browser storage or URLs</b> leak via XSS, history and referrers; prefer a back end for frontend (BFF) holding tokens in <code>HttpOnly</code> cookies. <b>Over-broad scopes</b> and tokens without an audience turn any leak into total access.',
        'Also: treat the token endpoint as a high-value target with rate limits and secrets in a vault, log token <i>issuance</i> (not values), and do not confuse OAuth with authentication — an access token says what you may do, not who you are; use OpenID Connect ID tokens for identity.',
      ],
      scene: { nodes: [authz({ tag: pill('exact-match redirect URIs only', 'check', 'good') }), box('bad', -8, 5, 'Wildcard redirect', 'red', 'alert', { size: [1.2, 1.2], height: 22, tag: pill('codes leak', 'alert', 'bad') })], links: [link('bad', 'authz', { style: 'broken' })], flows: [flow(['bad', 'authz'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Codes in the browser, tokens on the back channel',
      body: [
        'Use <b>authorization code + PKCE</b> for any user-facing client, <b>client credentials</b> for services, <b>device code</b> for input-limited devices; avoid implicit and password grants. Tokens carry scopes and audiences; refresh tokens rotate.',
        'Pick lifetimes from the load–exposure trade (refreshes = users ÷ TTL; leak window = TTL) and between introspection and JWT validation; guard redirect URIs and storage. Figures here are model outputs for sizing.',
      ],
      scene: { nodes: [user(), app(), authz(), api()], links: [link('user', 'authz'), link('app', 'authz', { arrow: 'both' }), link('app', 'api')], flows: [flow(['app', 'api'], { rate: 1.2 })] },
    },
  ],
};

export default lesson;
