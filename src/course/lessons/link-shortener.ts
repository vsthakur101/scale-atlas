import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill, you } from '../kit';

const creator = (extra: Partial<SceneNode> = {}) => you('creator', -13, -6, { label: pill('marketer', 'user'), ...extra });
const clickers = (extra: Partial<SceneNode> = {}) => crowd('clicks', -13, 6, 18, 'clickers', extra);
const api = (extra: Partial<SceneNode> = {}) => box('api', -4, -6, 'Create API', 'blue', 'server', { size: [1.3, 1.3], height: 36, ...extra });
const redirect = (extra: Partial<SceneNode> = {}) => box('redir', -4, 5, 'Redirector', 'orange', 'route', { size: [1.4, 1.4], height: 38, ...extra });
const keys = (extra: Partial<SceneNode> = {}) => box('keys', 2, -12, 'Key service', 'yellow', 'hash', { size: [1.2, 1.2], height: 30, ...extra });
const cache = (extra: Partial<SceneNode> = {}) => box('cache', 3, 3, 'Cache', 'green', 'bolt', { size: [1.3, 1.3], height: 32, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('db', 9, -2, 'Links KV', { tone: 'purple', ...extra });
const queue = (extra: Partial<SceneNode> = {}) => box('q', 3, 11, 'Click log', 'yellow', 'list', { size: [1.8, 1], height: 22, ...extra });
const stats = (extra: Partial<SceneNode> = {}) => box('stats', 11, 9, 'Analytics', 'teal', 'activity', { size: [1.3, 1.3], height: 32, ...extra });
const edge = (extra: Partial<SceneNode> = {}) => box('edge', -9, 11, 'CDN edge', 'teal', 'globe', { size: [1.2, 1.2], height: 30, ...extra });

const writePath = [link('creator', 'api'), link('api', 'keys', { arrow: 'both' }), link('api', 'db')];
const readPath = [link('clicks', 'redir', { arrow: 'both' }), link('redir', 'cache', { arrow: 'both' }), link('cache', 'db', { arrow: 'both', style: 'dashed' })];

const lesson: Lesson = {
  slug: 'link-shortener',
  title: 'A Link Shortener',
  blurb: 'Turn long URLs into short ones and redirect billions of clicks a month — fast, reliably, and with analytics that never slow a redirect.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'p99', label: 'Redirect p99', icon: 'timer' },
    { key: 'reads', label: 'Redirects / s', icon: 'activity' },
    { key: 'hit', label: 'Cache hit', icon: 'bolt' },
    { key: 'storage', label: 'Storage / yr', icon: 'disk' },
  ],
  goals: [
    { text: 'Requirements and read/write estimates', step: 2 },
    { text: 'Generating short, unique keys', step: 3 },
    { text: 'The read path and 301 vs 302', step: 5 },
    { text: 'Analytics off the hot path', step: 7 },
    { text: 'Partitioning and abuse controls', step: 9 },
  ],
  legend: ['request', 'response', 'write', 'hit', 'fail'],
  steps: [
    {
      short: 'Scope',
      kind: 'problem',
      title: 'Requirements for a link shortener',
      body: [
        'Functional: create a short link for a long URL (optionally a custom alias and an expiry); visiting the short link redirects to the long URL; owners see click counts by day, country and referrer.',
        'Non-functional: redirects must be <b>fast</b> (p99 < 50 ms) and <b>highly available</b> — a broken short link in a printed ad can’t be fixed. Links must never collide or change destination. Analytics may lag by minutes.',
      ],
      scene: {
        nodes: [creator({ tag: pill('long URL → sho.rt/x7Kp2a', 'link') }), clickers({ tag: pill('sho.rt/x7Kp2a → 302', 'route') })],
        metrics: { p99: '< 50 ms', reads: '?', hit: '—', storage: '?' },
      },
    },
    {
      short: 'Estimate',
      kind: 'technique',
      title: 'Read-heavy by a hundred to one',
      body: [
        'Assume 100M new links a month and 10B redirects a month: about <b>40 creates/s</b> and <b>4,000 redirects/s</b> on average, perhaps 20,000/s at peak when a link goes viral.',
        'Each record — key, URL (~200 B average), owner, timestamps — is ~500 bytes: <code>100M × 500 B ≈ 50 GB</code> a month, ~600 GB a year. Small data, enormous read traffic: the design is all about the <b>read path</b>.',
      ],
      changes: [{ text: '40 writes/s · 4k–20k reads/s' }, { text: '~600 GB/yr', tone: 'good' }],
      scene: {
        nodes: [creator(), clickers({ count: 24 }), api({ tag: pill('40/s', 'activity') }), redirect({ tag: pill('4k–20k/s', 'activity', 'warn') }), store()],
        links: [link('creator', 'api'), link('api', 'db'), link('clicks', 'redir', { arrow: 'both' }), link('redir', 'db', { arrow: 'both' })],
        flows: [flow(['creator', 'api', 'db'], { kind: 'write', rate: 0.4 }), flow(['clicks', 'redir', 'db'], { back: true, rate: 5 })],
        metrics: { p99: '?', reads: { v: '4k avg · 20k peak', tone: 'warn' }, hit: '—', storage: '600 GB' },
      },
    },
    {
      short: 'Keys',
      kind: 'tradeoff',
      title: 'How to make the short key',
      body: [
        '<b>Hash the URL</b> (and truncate): the same URL always gets the same key, but truncation causes collisions you must detect and resolve, and two users shortening one URL share a link and its stats. <b>Counter + base62</b>: unique by construction and compact, but sequential keys are guessable and the counter needs coordination.',
        'A good middle path: a <b>key service</b> hands out blocks of pre-generated random keys. Seven base62 characters give 62⁷ ≈ 3.5 trillion keys — centuries of headroom — unguessable and collision-free because each key is issued once.',
      ],
      changes: [{ text: '7 chars base62 = 3.5T keys', tone: 'good' }],
      concepts: [{ term: 'Base62', def: 'Encoding numbers with 0–9, a–z, A–Z: compact, URL-safe identifiers.' }],
      scene: {
        nodes: [creator(), api(), keys({ tag: pill('block of 10k unused keys', 'layers', 'good') }), store()],
        links: writePath,
        flows: [flow(['api', 'keys'], { kind: 'handshake', back: true, rate: 0.3 }), flow(['creator', 'api', 'db'], { kind: 'write', rate: 0.8 })],
        metrics: { p99: '?', reads: '4k avg', hit: '—', storage: '600 GB' },
      },
    },
    {
      short: 'Write path',
      kind: 'technique',
      title: 'Creating a link',
      body: [
        'The create API validates the URL, takes the next key from its locally cached block, and writes <code>key → {url, owner, expires}</code> with a <b>conditional insert</b> (fail if the key exists — essential for custom aliases). Then it returns the short URL.',
        'The links table is a perfect fit for a key-value store: lookups are always by key, records are small and never joined.',
      ],
      changes: [{ text: 'INSERT IF NOT EXISTS', tone: 'good' }],
      scene: {
        nodes: [creator({ tag: pill('alias: spring-sale', 'link') }), api({ tag: pill('validate · reserve key', 'check') }), keys(), store({ tag: pill('x7Kp2a → https://…', 'key') })],
        links: writePath,
        flows: [flow(['creator', 'api', 'db'], { kind: 'write', back: true, rate: 0.8 })],
        metrics: { p99: '?', reads: '4k avg', hit: '—', storage: '600 GB' },
      },
    },
    {
      short: 'Redirect',
      kind: 'technique',
      title: 'The redirect path, and 301 vs 302',
      body: [
        'A click hits the redirector, which looks up the key and answers with a redirect status and a <code>Location</code> header. That lookup is the entire hot path, so it must be a single key read.',
        '<b>301 Moved Permanently</b> lets browsers cache the redirect forever: less load, but later clicks never reach you (no analytics, and you can’t change or disable the link). <b>302 Found</b> sends every click through you. Most shorteners choose 302 — or 301 with a short <code>Cache-Control</code>.',
      ],
      concepts: [{ term: 'HTTP 301 vs 302', def: '301 is a permanent, cacheable redirect; 302 is temporary, so clients come back each time.' }],
      scene: {
        nodes: [clickers(), redirect({ tag: pill('302 Location: https://…', 'route', 'good') }), store()],
        links: [link('clicks', 'redir', { arrow: 'both' }), link('redir', 'db', { arrow: 'both' })],
        flows: [flow(['clicks', 'redir', 'db'], { back: true, rate: 4 })],
        metrics: { p99: '35 ms', reads: '4k avg', hit: '—', storage: '600 GB' },
      },
    },
    {
      short: 'Cache',
      kind: 'technique',
      title: 'Cache the hot links',
      body: [
        'Click traffic is extremely skewed: a few links from a big campaign get most clicks. An in-memory cache in front of the store, sized for the hot set, serves 95%+ of redirects in a millisecond. Links are immutable (or rarely edited), so invalidation is trivial: delete the key on edit or disable.',
        'For global audiences, cache the redirect at <b>CDN edges</b> for a few seconds too — a viral link is then answered near the user without reaching your servers at all.',
      ],
      changes: [{ text: 'Hit rate 96%', tone: 'good' }, { text: 'p99 35 → 8 ms', tone: 'good' }],
      scene: {
        nodes: [clickers(), edge({ tag: pill('cached 10 s', 'globe') }), redirect(), cache({ tag: pill('96% hits', 'bolt', 'good') }), store()],
        links: [link('clicks', 'edge', { arrow: 'both' }), link('edge', 'redir', { style: 'dashed' }), ...readPath.slice(1)],
        flows: [flow(['clicks', 'edge'], { kind: 'hit', back: true, rate: 2 }), flow(['clicks', 'edge', 'redir', 'cache'], { kind: 'hit', back: true, rate: 2 }), flow(['cache', 'db'], { back: true, rate: 0.2 })],
        metrics: { p99: { v: '8 ms', tone: 'good' }, reads: '20k peak', hit: { v: '96%', tone: 'good' }, storage: '600 GB' },
      },
    },
    {
      short: 'Analytics',
      kind: 'technique',
      title: 'Count clicks without slowing them',
      body: [
        'Writing a row per click to the database inside the redirect would add latency and couple redirects to analytics availability. Instead the redirector emits a click event (key, time, country, referrer) to a <b>log</b> asynchronously — fire and forget from a local buffer — and responds immediately.',
        'A stream job aggregates counts per link per minute into an analytics store. If analytics is down, redirects carry on and events wait in the log.',
      ],
      changes: [{ text: 'Click events → log (async)', tone: 'good' }],
      scene: {
        nodes: [clickers(), redirect(), cache(), store(), queue({ tag: pill('20k events/s', 'list') }), stats({ tag: pill('per link per minute', 'activity') })],
        links: [...readPath, link('redir', 'q', { style: 'dashed' }), link('q', 'stats')],
        flows: [flow(['clicks', 'redir', 'cache'], { kind: 'hit', back: true, rate: 3 }), flow(['redir', 'q', 'stats'], { kind: 'write', rate: 2 })],
        metrics: { p99: '8 ms', reads: '20k peak', hit: '96%', storage: '600 GB + events' },
      },
    },
    {
      short: 'Scale data',
      kind: 'technique',
      title: 'Partition by key',
      body: [
        'A few terabytes over several years fits a single node, but for availability and throughput the store is replicated across zones and <b>partitioned by hash of the key</b> — every lookup goes to exactly one partition, and random keys spread evenly with no hot ranges.',
        'Expired links are deleted lazily (checked on read) and by a background sweep.',
      ],
      scene: {
        nodes: [clickers(), redirect(), cache(), db('db', 9, -6, 'Partition A', { tone: 'purple' }), db('db2', 11, 0, 'Partition B', { tone: 'purple' }), db('db3', 9, 6, 'Partition C', { tone: 'purple' })],
        links: [link('clicks', 'redir', { arrow: 'both' }), link('redir', 'cache', { arrow: 'both' }), link('cache', 'db', { style: 'dashed' }), link('cache', 'db2', { style: 'dashed' }), link('cache', 'db3', { style: 'dashed' })],
        flows: [flow(['clicks', 'redir', 'cache'], { kind: 'hit', back: true, rate: 3 }), flow(['cache', 'db2'], { back: true, rate: 0.3 })],
        metrics: { p99: '8 ms', reads: '20k peak', hit: '96%', storage: '600 GB / yr' },
      },
    },
    {
      short: 'Abuse',
      kind: 'case',
      title: 'Case: your domain on a blocklist',
      body: [
        'Spammers mass-create links to phishing pages. Mail providers start blocking every <code>sho.rt</code> link — including your legitimate customers’.',
        'Rate-limit link creation per account and IP, require sign-up for bulk creation, check destinations against threat-intelligence lists at creation <i>and</i> periodically afterwards, and give the redirector a fast way to disable a key (cache invalidation included) or show an interstitial warning.',
      ],
      changes: [{ text: 'Create: rate-limited + scanned', tone: 'good' }, { text: 'Disable link in < 1 min', tone: 'good' }],
      scene: {
        nodes: [creator({ label: pill('spam bot', 'alert'), tag: pill('5,000 links/min', 'alert', 'bad') }), api({ tag: pill('rate limit · URL scan', 'shield', 'good') }), keys(), store(), clickers(), redirect({ tag: pill('disabled → warning page', 'alert', 'warn') }), cache()],
        links: [...writePath, ...readPath],
        flows: [flow(['creator', 'api'], { kind: 'fail', rate: 3 }), flow(['clicks', 'redir', 'cache'], { kind: 'hit', back: true, rate: 2 })],
        metrics: { p99: '8 ms', reads: '20k peak', hit: '96%', storage: '600 GB / yr' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Optimise the one hot path',
      body: [
        'A tiny dataset with a huge, skewed, latency-sensitive read path. Issue <b>random base62 keys</b> from a key service, store <b>key → URL</b> in a partitioned key-value store, and serve redirects from <b>cache and edge</b> with a single lookup.',
        'Use <b>302</b> to keep control and analytics, push click events <b>asynchronously</b> into a stream pipeline, and treat abuse prevention as a core feature.',
      ],
      scene: {
        nodes: [creator(), clickers(), api(), redirect(), keys(), cache(), store(), queue(), stats()],
        links: [...writePath, ...readPath, link('redir', 'q', { style: 'dashed' }), link('q', 'stats')],
        flows: [flow(['creator', 'api', 'db'], { kind: 'write', rate: 0.4 }), flow(['clicks', 'redir', 'cache'], { kind: 'hit', back: true, rate: 3 }), flow(['redir', 'q', 'stats'], { kind: 'write', rate: 1.5 })],
        metrics: { p99: '8 ms', reads: '20k peak', hit: '96%', storage: '600 GB / yr' },
      },
    },
  ],
};

export default lesson;
