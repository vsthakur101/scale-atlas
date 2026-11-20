import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => box('user', -17, 0, 'User + browser', 'teal', 'user', { size: [1.3, 1.3], height: 24, ...extra });
const app = (extra: Partial<SceneNode> = {}) => box('app', -4, -7, 'Application (service provider)', 'orange', 'server', { size: [1.5, 1.5], height: 28, ...extra });
const app2 = (extra: Partial<SceneNode> = {}) => box('app2', -4, 7, 'Second application', 'orange', 'server', { size: [1.3, 1.3], height: 24, ...extra });
const idp = (extra: Partial<SceneNode> = {}) => box('idp', 10, 0, 'Identity provider (IdP)', 'purple', 'shield', { size: [1.7, 1.7], height: 32, ...extra });
const dir = (extra: Partial<SceneNode> = {}) => db('dir', 18, 0, 'Directory (users, groups)', { size: [1.3, 1.3], ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n * 10) / 10}`);

const lesson: Lesson = {
  slug: 'source-what-is-sso-single-sign-on',
  title: 'Single Sign-On: SAML, OIDC and the Identity Provider',
  blurb: 'One login, many applications: the redirect dance between app, browser and identity provider, signed assertions and ID tokens, session lifetimes — and the availability, peak-load and revocation consequences of centralising authentication.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'prompts', label: 'Credential prompts per day (before → after)', icon: 'lock' },
    { key: 'peak', label: 'IdP login redirects/s at morning peak', icon: 'activity' },
    { key: 'avail', label: 'Effective availability (IdP × app)', icon: 'shield' },
    { key: 'down', label: 'Expected downtime per year', icon: 'clock' },
    { key: 'revoke', label: 'Worst-case access after removal', icon: 'alert' },
  ],
  goals: [
    { text: 'The problem: many passwords, many user stores', step: 1 },
    { text: 'The redirect flow: app → IdP → app', step: 2 },
    { text: 'SAML assertions and OIDC ID tokens', step: 3 },
    { text: 'Sessions at two layers; logout and revocation', step: 4 },
    { text: 'Centralisation: availability, load and provisioning', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'emp', label: 'Employees', min: 100, max: 1000000, step: 100, default: 20000, unit: '', description: 'Users who sign in daily.' },
      { key: 'apps', label: 'Applications each user opens per day', min: 1, max: 60, step: 1, default: 12, unit: '', description: 'Distinct apps requiring sign-in.' },
      { key: 'burst', label: 'Share of logins in the 15-minute morning peak', min: 5, max: 95, step: 1, default: 40, unit: '%', description: 'Concentration at start of day.' },
      { key: 'avIdp', label: 'IdP availability', min: 95, max: 99.999, step: 0.001, default: 99.95, unit: '%', description: 'Fraction of time the IdP can issue assertions.' },
      { key: 'avApp', label: 'Application availability', min: 95, max: 99.999, step: 0.001, default: 99.9, unit: '%', description: 'Fraction of time the app itself is up.' },
      { key: 'ttl', label: 'Application session lifetime', min: 0.25, max: 72, step: 0.25, default: 8, unit: ' h', description: 'How long an app trusts its own session cookie after login.' },
    ],
    calculate: (input, step) => {
      const emp = Math.max(1, input.emp ?? 2e4);
      const apps = Math.max(1, input.apps ?? 12);
      const burst = Math.min(1, Math.max(0.01, (input.burst ?? 40) / 100));
      const avIdp = Math.min(1, Math.max(0, (input.avIdp ?? 99.95) / 100));
      const avApp = Math.min(1, Math.max(0, (input.avApp ?? 99.9) / 100));
      const ttl = Math.max(0.01, input.ttl ?? 8);
      const before = emp * apps;
      const after = emp; // one real credential + MFA prompt at the IdP per day
      const peak = (emp * apps * burst) / 900;
      const eff = avIdp * avApp;
      const down = (1 - eff) * 8760;
      return {
        prompts: step < 1 ? { v: '—' } : { v: `${fmtN(before)} → ${fmtN(after)}`, tone: 'good' },
        peak: step < 2 ? { v: '—' } : { v: `${fmtN(peak)}/s (${fmtN(emp * apps * burst)} redirects in 15 min)`, tone: peak < 500 ? 'good' : 'warn' },
        avail: step < 4 ? { v: '—' } : { v: `${(eff * 100).toFixed(3)}% (${(avIdp * 100).toFixed(3)}% × ${(avApp * 100).toFixed(3)}%)`, tone: eff > 0.999 ? 'good' : 'warn' },
        down: step < 4 ? { v: '—' } : { v: `${down.toFixed(1)} h / year` , tone: down < 9 ? 'good' : 'warn' },
        revoke: step < 3 ? { v: '—' } : { v: `${ttl} h (the app session lifetime)`, tone: ttl <= 1 ? 'good' : ttl <= 8 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Problem',
      kind: 'problem',
      title: 'Every application with its own login',
      body: [
        'Without SSO each application keeps its <b>own user store and passwords</b>. Users reuse and forget passwords (reset tickets, weak reuse), IT must create and remove accounts in dozens of places (leavers retain access somewhere), and each app builds and secures its own authentication, MFA and audit logging. With 20,000 employees opening 12 applications a day, that’s <b>240,000 credential prompts a day</b>.',
        '<b>Single sign-on</b> centralises authentication in one <b>identity provider (IdP)</b> — Okta, Entra ID (Azure AD), Google Workspace, Keycloak, Ping — and lets applications (<b>service providers</b> or <b>relying parties</b>) trust its assertions. The user proves identity once, with strong factors, to one place; apps never see the password. That converts 240,000 prompts a day into 20,000 (one per user), concentrates MFA, conditional access and logging in one system — and concentrates risk there too.',
      ],
      scene: { nodes: [user({ tag: pill('12 passwords today', 'alert', 'warn') }), app({ tag: pill('own user store', 'db') }), app2({ tag: pill('own user store', 'db') })], links: [link('user', 'app'), link('user', 'app2')], flows: [flow(['user', 'app'], { rate: 1.2 }), flow(['user', 'app2'], { rate: 1.2 })] },
    },
    {
      short: 'Flow',
      kind: 'technique',
      title: 'The redirect flow: app → IdP → app',
      body: [
        'The browser is the courier between two parties that never talk directly. (1) The user opens the app; it has no session, so it <b>redirects the browser to the IdP</b> with an authentication request (SAML <code>AuthnRequest</code> or an OIDC authorisation request with <code>client_id</code>, <code>redirect_uri</code>, <code>state</code>, <code>nonce</code>). (2) The IdP checks <i>its own</i> session cookie: if the user already signed in this morning there is <b>no prompt</b>; otherwise it authenticates them (password + MFA, passkey — see that lesson). (3) The IdP redirects back to the app with a <b>signed assertion</b> (SAML POST) or an <b>authorisation code</b> (OIDC) the app exchanges for tokens. (4) The app verifies the signature, creates its <b>own session</b>, and the user is in.',
        'The second application repeats steps 1–4, but at step 2 the IdP session cookie is present, so it completes with <b>zero user interaction</b> — that is the “single” in single sign-on. Each app login still costs a redirect round trip through the IdP: 20,000 users × 12 apps × 40% in a 15-minute morning peak = 96,000 redirects / 900 s ≈ <b>107 requests/s</b> — modest, but concentrated and critical (see availability below).',
      ],
      changes: [{ text: 'App redirects to IdP; IdP redirects back with a signed result', tone: 'info' }, { text: 'Existing IdP session → no prompt for later apps', tone: 'good' }, { text: 'Morning peak: ~107 redirects/s here', tone: 'info' }],
      scene: { nodes: [user(), app({ tag: pill('1 no session → redirect', 'share') }), idp({ tag: pill('2 authenticate (or cookie)', 'shield') }), app2()], links: [link('user', 'app'), link('user', 'idp'), link('user', 'app2')], flows: [flow(['user', 'app'], { rate: 1.2 }), flow(['user', 'idp'], { kind: 'handshake', rate: 1.2, back: true }), flow(['user', 'app2'], { rate: 1 })] },
    },
    {
      short: 'Assertions',
      kind: 'technique',
      title: 'SAML assertions and OIDC ID tokens',
      body: [
        '<b>SAML 2.0</b> (XML, the enterprise workhorse) delivers a signed <b>assertion</b>: <i>who</i> the subject is, attributes (email, groups), the <b>audience</b> it is for, and validity bounds (<code>NotBefore</code>, <code>NotOnOrAfter</code>, usually a few minutes — which makes <b>clock skew</b> a real failure mode). <b>OpenID Connect</b> (OIDC, JSON on top of OAuth 2.0 — see that lesson) delivers an <b>ID token</b>, a signed JWT carrying <code>sub</code>, <code>aud</code>, <code>iss</code>, <code>exp</code> and <code>nonce</code>, plus an access token for APIs. The relying party fetches the IdP’s <b>public keys</b> (metadata or JWKS) and verifies the signature.',
        'Verification is strict or SSO becomes a hole: check the signature <i>and</i> that the <b>audience matches this app</b>, issuer is expected, validity window holds, <code>nonce</code>/<code>InResponseTo</code> matches (replay), and the redirect URI is an exact registered match. XML signature handling is a historic bug farm (signature wrapping) — use maintained libraries. The assertion tells the app who the user is; <b>authorisation</b> (roles) comes from group claims or is looked up locally. OIDC is the simpler choice for new apps and mobile; SAML remains where vendors require it.',
      ],
      changes: [{ text: 'Verify signature, audience, issuer, expiry, nonce, redirect URI', tone: 'good' }, { text: 'Short validity + clock skew = common failure', tone: 'bad' }],
      scene: { nodes: [idp({ tag: pill('signs: sub, aud, exp, groups', 'lock') }), user({ tag: pill('carries it', 'share') }), app({ tag: pill('verify with IdP public key', 'check', 'good') })], links: [link('idp', 'user'), link('user', 'app')], flows: [flow(['idp', 'user', 'app'], { kind: 'handshake', rate: 1.4 })] },
    },
    {
      short: 'Sessions',
      kind: 'problem',
      title: 'Two session layers, logout and revocation',
      body: [
        'After login there are <b>two independent sessions</b>: the IdP’s (one cookie at the IdP’s domain, lasting hours to days) and each application’s (a cookie the app issues after verifying the assertion, lasting its own TTL — 8 hours here). The app does <b>not</b> re-ask the IdP on each request, so when you disable an account at the IdP the user stays in each app until that app’s session expires: <b>worst-case access after removal = the app session TTL</b>, 8 hours with these settings.',
        'Shorten the TTL (more redirects, less exposure), use refresh tokens that the IdP can refuse, or push revocation: <b>SAML Single Logout</b> and OIDC <b>back-channel logout</b> (the IdP notifies apps to kill their session — unreliable if an app is down or doesn’t implement it), and <b>SCIM</b> provisioning to deactivate accounts in each app immediately. For sensitive apps use short sessions, step-up MFA and continuous access evaluation. “Logged out of the IdP” and “logged out of every app” are different statements — design and test for both.',
      ],
      changes: [{ text: 'IdP session and app session are separate', tone: 'info' }, { text: 'Removed user keeps access up to app session TTL (8 h)', tone: 'bad' }, { text: 'Back-channel logout, SCIM, short TTLs for sensitive apps', tone: 'good' }],
      scene: { nodes: [user(), idp({ tag: pill('account disabled', 'x', 'bad') }), app({ tag: pill('session cookie valid 8 h', 'clock', 'warn') }), app2({ tag: pill('session cookie valid 8 h', 'clock', 'warn') })], links: [link('user', 'app'), link('user', 'app2'), link('idp', 'app', { style: 'dashed' })], flows: [flow(['user', 'app'], { rate: 1.2 })] },
    },
    {
      short: 'Central',
      kind: 'tradeoff',
      title: 'The price of centralising: availability, load and provisioning',
      body: [
        'The IdP is on the critical path of <b>every new login</b>, so its availability multiplies with the app’s: 99.95% × 99.9% = <b>99.85% effective — 13.1 hours a year</b> in which some logins can fail, against 8.8 hours for the app alone. Existing app sessions keep working during an IdP outage (another reason for longer app TTLs), but anyone starting the day or an expired session is locked out. Mitigate with a highly available, multi-region IdP, a break-glass local admin path for critical systems, caching of keys/metadata, and monitoring of login success rate and latency as an SLO.',
        'It is also the <b>highest-value attack target</b>: protect it with phishing-resistant MFA, admin separation, tight conditional access and audit alerts; a compromise of the IdP is a compromise of everything federated through it. Round out SSO with <b>provisioning</b> (SCIM or just-in-time creation on first login) so joiners, movers and leavers are automated, and with <b>role mapping</b> from directory groups. Figures here are model outputs with assumed availability and usage.',
      ],
      changes: [{ text: '99.95% × 99.9% = 99.85% → ~13 h/year of possible login failures', tone: 'bad' }, { text: 'HA IdP, break-glass path, phishing-resistant MFA', tone: 'good' }, { text: 'SCIM / JIT provisioning for joiners and leavers', tone: 'good' }],
      scene: { nodes: [user(), idp({ state: 'hot', tag: pill('on every new login', 'alert', 'warn') }), dir({ tag: pill('groups → roles', 'list') }), app(), app2()], links: [link('user', 'idp'), link('idp', 'dir'), link('user', 'app'), link('user', 'app2')], flows: [flow(['user', 'idp', 'dir'], { kind: 'handshake', rate: 1.4 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Authenticate once, assert everywhere — and plan for the single point',
      body: [
        'SSO redirects the browser between an app and an <b>identity provider</b>, which returns a signed SAML assertion or OIDC ID token that the app verifies and turns into its own session. One IdP session covers many apps; MFA and policy live in one place.',
        'Remember the costs: two session layers (revocation delay = app TTL), a shared availability dependency, and a high-value target — and verify tokens strictly.',
      ],
      scene: { nodes: [user(), idp(), dir(), app(), app2()], links: [link('user', 'idp'), link('idp', 'dir'), link('user', 'app'), link('user', 'app2')], flows: [flow(['user', 'idp', 'dir'], { kind: 'handshake', rate: 1.4 })] },
    },
  ],
};

export default lesson;
