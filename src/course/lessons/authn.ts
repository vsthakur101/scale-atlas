import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill, you } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => you('you', -12, 1, { label: pill('Mei', 'user'), ...extra });
const attacker = (extra: Partial<SceneNode> = {}) => crowd('bad', -12, 9, 6, 'botnet', { tone: 'red', ...extra });
const app = (extra: Partial<SceneNode> = {}) => box('app', -3, 0, 'Web app', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const users = (extra: Partial<SceneNode> = {}) => db('udb', 6, -2, 'Users DB', extra);
const sess = (extra: Partial<SceneNode> = {}) => box('sess', 6, 6, 'Sessions', 'red', 'key', { size: [1.3, 1.3], height: 32, ...extra });
const idp = (extra: Partial<SceneNode> = {}) => box('idp', -3, -9, 'Identity provider', 'yellow', 'shield', { size: [1.5, 1.5], height: 40, ...extra });

const lesson: Lesson = {
  slug: 'authn',
  title: 'Authentication',
  blurb: 'Proving who someone is — storing passwords safely, resisting stolen credentials, and keeping sessions from being hijacked.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'exposure', label: 'If DB leaks', icon: 'alert' },
    { key: 'takeover', label: 'Takeovers / wk', icon: 'user' },
    { key: 'phish', label: 'Phishing-proof', icon: 'shield' },
    { key: 'revoke', label: 'Revoke time', icon: 'timer' },
  ],
  goals: [
    { text: 'Storing passwords with slow, salted hashes', step: 1 },
    { text: 'Credential stuffing and its defences', step: 2 },
    { text: 'MFA and phishing-resistant passkeys', step: 3 },
    { text: 'Safe session cookies vs tokens in JavaScript', step: 5 },
    { text: 'SSO with OIDC, service identity and revocation', step: 8 },
  ],
  legend: ['request', 'response', 'fail', 'heavy'],
  steps: [
    {
      short: 'Hashing',
      kind: 'technique',
      title: 'Never store the password — store a slow hash',
      body: [
        'Assume the users table will leak one day. If it holds passwords, every account — and every other site where people reused them — falls at once. Store a <b>hash</b> instead and compare hashes at login.',
        'Not a fast hash like SHA-256: attackers can try billions per second on GPUs. Use a deliberately slow, memory-hard <b>password hash</b> — Argon2id, scrypt or bcrypt — with a unique random <b>salt</b> per user, so identical passwords hash differently and precomputed tables are useless.',
      ],
      note: { kind: 'warn', text: 'Tune the cost so one hash takes ~50–250 ms on your servers. Login gets a little slower; guessing gets millions of times slower.' },
      changes: [{ text: 'password → argon2id(salt, pw)', tone: 'good' }],
      concepts: [
        { term: 'Password hashing', def: 'Storing a slow, salted, one-way transform of a password (Argon2, scrypt, bcrypt) instead of the password itself.' },
        { term: 'Salt', def: 'A unique random value mixed into each password hash so equal passwords produce different hashes.' },
      ],
      scene: {
        nodes: [user(), app({ tag: pill('argon2id: 120 ms', 'timer') }), users({ tag: pill('$argon2id$…', 'lock', 'good') })],
        links: [link('you', 'app', { label: pill('POST /login', 'lock') }), link('app', 'udb', { arrow: 'both' })],
        flows: [flow(['you', 'app', 'udb'], { back: true, rate: 1 })],
        metrics: { exposure: { v: 'hashes only', tone: 'good' }, takeover: '—', phish: 'no', revoke: '—' },
      },
    },
    {
      short: 'Stuffing',
      kind: 'problem',
      title: 'Credential stuffing',
      body: [
        'Another site was breached, and its email/password pairs are for sale. A botnet tries all 30 million of them against your login, slowly, from 100,000 residential IPs. People reuse passwords, so about 0.5% work — 150,000 account takeovers. Your hashing was perfect; it didn’t matter.',
        'Defences stack: rate limits per account and per IP range, bot detection, checking new passwords against breach corpuses, alerting users on new-device logins — and, above all, a second factor.',
      ],
      changes: [{ text: '30M login attempts', tone: 'bad' }, { text: '~0.5% succeed', tone: 'bad' }],
      concepts: [{ term: 'Credential stuffing', def: 'Automated login attempts using username/password pairs leaked from other services.' }],
      scene: {
        nodes: [user(), attacker({ tag: pill('30M leaked pairs', 'alert', 'bad') }), app({ load: 80, state: 'hot' }), users()],
        links: [link('you', 'app'), link('bad', 'app'), link('app', 'udb', { arrow: 'both' })],
        flows: [flow(['bad', 'app'], { kind: 'heavy', back: true, rate: 5 }), flow(['you', 'app'], { back: true, rate: 0.6 })],
        metrics: { exposure: 'hashes only', takeover: { v: '1,200', tone: 'bad' }, phish: 'no', revoke: '—' },
      },
    },
    {
      short: 'MFA',
      kind: 'technique',
      title: 'A second factor — ideally a passkey',
      body: [
        '<b>Multi-factor authentication</b> requires something beyond the password. One-time codes from an authenticator app (TOTP) stop credential stuffing cold, but a convincing phishing page can still relay a code in real time. SMS codes are weaker still (SIM swaps).',
        '<b>Passkeys</b> (WebAuthn) use a key pair held by the device: the server stores only the public key, and the browser signs a challenge only for the genuine domain. Nothing reusable to steal, nothing a phishing site can relay.',
      ],
      changes: [{ text: 'Takeovers 1,200 → 4 / week', tone: 'good' }],
      concepts: [
        { term: 'MFA', def: 'Multi-factor authentication: requiring two or more independent proofs of identity.' },
        { term: 'Passkey (WebAuthn)', def: 'A device-held key pair used to sign login challenges bound to the site’s origin; resistant to phishing.' },
      ],
      scene: {
        nodes: [user({ tag: pill('passkey: signed challenge', 'key', 'good') }), attacker({ tag: pill('password alone: useless', 'x') }), app({ load: 45 }), users({ tag: pill('public keys', 'key') })],
        links: [link('you', 'app', { arrow: 'both' }), link('bad', 'app'), link('app', 'udb', { arrow: 'both' })],
        flows: [flow(['you', 'app'], { back: true, rate: 0.8 }), flow(['bad', 'app'], { kind: 'fail', rate: 3 })],
        metrics: { exposure: 'hashes + public keys', takeover: { v: '4', tone: 'good' }, phish: { v: 'yes (passkeys)', tone: 'good' }, revoke: '—' },
      },
    },
    {
      short: 'Sessions',
      kind: 'technique',
      title: 'After login: a session',
      body: [
        'Re-checking the password on every request is out of the question, so login issues a <b>session</b>: a long random ID stored server-side (or a short-lived signed token) and sent back as a cookie.',
        'Cookie flags do real security work: <code>HttpOnly</code> (JavaScript can’t read it), <code>Secure</code> (HTTPS only), <code>SameSite=Lax</code> (not sent on most cross-site requests, blocking classic CSRF). Rotate the session ID at login to prevent fixation.',
      ],
      concepts: [
        { term: 'Session cookie', def: 'A cookie carrying an opaque identifier that maps to server-side session state.' },
        { term: 'CSRF', def: 'Cross-site request forgery: a malicious site making a victim’s browser send authenticated requests to another site.' },
      ],
      scene: {
        nodes: [user({ tag: pill('Set-Cookie: sid; HttpOnly; Secure; SameSite', 'lock', 'good') }), app(), users(), sess({ tag: pill('sid → Mei, exp 12 h', 'key') })],
        links: [link('you', 'app', { arrow: 'both' }), link('app', 'udb', { arrow: 'both' }), link('app', 'sess', { arrow: 'both' })],
        flows: [flow(['you', 'app', 'sess'], { back: true, rate: 1.2 })],
        metrics: { exposure: 'hashes + public keys', takeover: '4', phish: 'yes', revoke: { v: 'instant (delete sid)', tone: 'good' } },
      },
    },
    {
      short: 'XSS',
      kind: 'case',
      title: 'Case: a token in localStorage',
      body: [
        'The new single-page app stores a long-lived access token in <code>localStorage</code> for convenience. A third-party analytics script is compromised and injects code that reads it and sends it to an attacker — who now has the account until the token expires in 30 days.',
        'Any script on the page can read <code>localStorage</code>. Keep credentials in <code>HttpOnly</code> cookies (or a backend-for-frontend that holds tokens server-side), keep tokens short-lived, and limit third-party scripts with a Content Security Policy.',
      ],
      changes: [{ text: 'Script reads token → exfiltrated', tone: 'bad' }, { text: 'Move to HttpOnly cookie + CSP', tone: 'good' }],
      concepts: [{ term: 'XSS', def: 'Cross-site scripting: attacker-controlled script running in a site’s pages, able to act as the user.' }],
      scene: {
        nodes: [user({ tag: pill('localStorage.token', 'key', 'bad') }), box('evil', -12, -9, 'Compromised script', 'red', 'alert', { size: [1.2, 1.2], height: 28 }), app(), users(), sess()],
        links: [link('you', 'app', { arrow: 'both' }), link('evil', 'you', { style: 'dashed' }), link('app', 'sess', { arrow: 'both' })],
        flows: [flow(['you', 'evil'], { kind: 'fail', rate: 1 }), flow(['you', 'app'], { back: true, rate: 0.8 })],
        metrics: { exposure: 'hashes + public keys', takeover: { v: '+1 (stolen token)', tone: 'bad' }, phish: 'yes', revoke: { v: '30 days', tone: 'bad' } },
      },
    },
    {
      short: 'SSO',
      kind: 'technique',
      title: 'Single sign-on with OpenID Connect',
      body: [
        'Business customers want employees to log in with their company accounts. With <b>OpenID Connect</b>, the app redirects to the customer’s identity provider; the user authenticates there (with whatever MFA the company enforces); the IdP redirects back with a one-time code; the app’s backend exchanges it for a signed <b>ID token</b> describing the user.',
        'Use the authorization-code flow with <b>PKCE</b>, verify the token’s signature, issuer, audience and expiry — and when an employee leaves, disabling them at the IdP cuts off every app at once.',
      ],
      concepts: [
        { term: 'OpenID Connect', def: 'An identity layer on OAuth 2.0 that lets apps verify a user via a trusted identity provider and receive an ID token.' },
        { term: 'PKCE', def: 'Proof Key for Code Exchange: binds an OAuth authorization code to the client that requested it, preventing interception.' },
      ],
      scene: {
        nodes: [user(), app({ tag: pill('verify sig · iss · aud · exp', 'shield', 'good') }), users(), sess(), idp({ tag: pill('company MFA', 'lock') })],
        links: [link('you', 'idp', { arrow: 'both', label: pill('1. login') }), link('you', 'app', { label: pill('2. code') }), link('app', 'idp', { arrow: 'both', label: pill('3. exchange') }), link('app', 'sess')],
        flows: [flow(['you', 'idp'], { back: true, rate: 0.6 }), flow(['you', 'app', 'idp'], { back: true, rate: 0.6 })],
        metrics: { exposure: 'no passwords (SSO)', takeover: '4', phish: 'per IdP', revoke: { v: 'IdP disable', tone: 'good' } },
      },
    },
    {
      short: 'Services',
      kind: 'technique',
      title: 'Services need identities too',
      body: [
        'Behind the app, services call each other with a shared static API key that’s been copied into a dozen configs for years. Anyone with any of those configs can impersonate any service.',
        'Give each <b>workload</b> its own identity issued by the platform — short-lived certificates for <b>mutual TLS</b>, or signed workload tokens — rotated automatically. Each call then proves which service is calling, and access can be decided per caller.',
      ],
      concepts: [{ term: 'Mutual TLS (mTLS)', def: 'TLS where both client and server present certificates, authenticating each side.' }],
      scene: {
        nodes: [app({ tag: pill('cert: spiffe://web', 'key', 'good') }), users(), box('billing', 6, 6, 'Billing', 'teal', 'dollar', { size: [1.3, 1.3], height: 32, tag: pill('cert: spiffe://billing', 'key', 'good') }), user({ state: 'dim' })],
        links: [link('app', 'billing', { arrow: 'both', label: pill('mTLS', 'lock') }), link('app', 'udb', { arrow: 'both', label: pill('mTLS', 'lock') })],
        flows: [flow(['app', 'billing'], { back: true, rate: 1 }), flow(['app', 'udb'], { back: true, rate: 1 })],
        metrics: { exposure: 'no shared keys', takeover: '4', phish: 'yes', revoke: 'cert expiry (h)' },
      },
    },
    {
      short: 'Log out all',
      kind: 'case',
      title: 'Case: “sign me out everywhere”',
      body: [
        'Mei’s laptop is stolen. She resets her password and expects every session — laptop, phone, tablet — to end immediately. With server-side sessions that’s a delete. With self-contained tokens, they stay valid until they expire.',
        'Keep access tokens short (5–15 minutes) so refresh is the control point, revoke refresh tokens on password change, and keep a per-user “sessions valid after” timestamp that every refresh checks.',
      ],
      changes: [{ text: 'Password reset → all sessions revoked', tone: 'good' }],
      scene: {
        nodes: [user({ tag: pill('reset password', 'refresh') }), app(), users(), sess({ tag: pill('Mei: 3 sessions → 0', 'x', 'good') }), you('stolen', -12, 9, { label: pill('stolen laptop', 'alert'), state: 'dim' })],
        links: [link('you', 'app'), link('app', 'sess'), link('stolen', 'app', { style: 'broken' })],
        flows: [flow(['app', 'sess'], { kind: 'write', rate: 0.8 }), flow(['stolen', 'app'], { kind: 'fail', rate: 1 })],
        metrics: { exposure: 'hashes + public keys', takeover: '0', phish: 'yes', revoke: { v: 'seconds', tone: 'good' } },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Prove it once, protect it after',
      body: [
        'Store passwords as <b>slow salted hashes</b>; assume credentials leak elsewhere and defend with rate limits and <b>MFA</b>, preferably <b>passkeys</b>. Carry sessions in <b>HttpOnly, Secure, SameSite</b> cookies, not in JavaScript-readable storage.',
        'Use <b>OIDC</b> for single sign-on, give services their own short-lived identities, and make sure you can revoke everything quickly when a device or person is compromised.',
      ],
      scene: {
        nodes: [user({ tag: pill('passkey', 'key', 'good') }), app(), users({ tag: pill('argon2id', 'lock') }), sess({ tag: pill('HttpOnly · short-lived', 'shield', 'good') }), idp()],
        links: [link('you', 'app', { arrow: 'both' }), link('app', 'udb', { arrow: 'both' }), link('app', 'sess', { arrow: 'both' }), link('you', 'idp', { style: 'dashed' })],
        flows: [flow(['you', 'app', 'sess'], { back: true, rate: 1 })],
        metrics: { exposure: 'hashes + public keys', takeover: '~0', phish: 'yes', revoke: 'seconds' },
      },
    },
  ],
};

export default lesson;
