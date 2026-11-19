import type { Lesson, SceneNode } from '../../types';
import { box, crowd, disk, flow, link, pill, zone } from '../kit';

const syd = (extra: Partial<SceneNode> = {}) => crowd('syd', -11, 6, 8, 'Sydney', { tone: 'teal', ...extra });
const sao = (extra: Partial<SceneNode> = {}) => crowd('sao', -11, -5, 8, 'São Paulo', { tone: 'yellow', ...extra });
const origin = (extra: Partial<SceneNode> = {}) => box('origin', 9, 0, 'Origin', 'blue', 'server', { sub: 'Frankfurt', load: 40, ...extra });
const edgeSyd = (extra: Partial<SceneNode> = {}) => box('esyd', -4, 6, 'Edge', 'teal', 'globe', { size: [1.3, 1.3], height: 34, sub: 'SYD', ...extra });
const edgeSao = (extra: Partial<SceneNode> = {}) => box('esao', -4, -5, 'Edge', 'teal', 'globe', { size: [1.3, 1.3], height: 34, sub: 'GRU', ...extra });
const shield = (extra: Partial<SceneNode> = {}) => box('shield', 3, 0, 'Shield', 'green', 'shield', { size: [1.4, 1.4], height: 38, sub: 'regional tier', ...extra });
const files = disk('files', 12, 6, 'assets', { tone: 'orange', icon: 'file' });

const lesson: Lesson = {
  slug: 'cdn',
  title: 'Edge Caching & CDNs',
  blurb: 'Copy the bytes everyone downloads to servers near everyone, and stop paying for the speed of light on every request.',
  minutes: 10,
  level: 'Intermediate',
  metrics: [
    { key: 'rtt', label: 'RTT', icon: 'clock' },
    { key: 'load', label: 'Page load', icon: 'timer' },
    { key: 'edgehit', label: 'Edge hits', icon: 'globe' },
    { key: 'originrps', label: 'Origin req/s', icon: 'server' },
  ],
  goals: [
    { text: 'Why distance, not bandwidth, slows distant users', step: 1 },
    { text: 'How edges serve cached copies close to users', step: 3 },
    { text: 'Cold misses and origin shielding', step: 5 },
    { text: 'Cache busting with fingerprinted file names', step: 6 },
    { text: 'What a CDN can and can’t do for dynamic pages', step: 8 },
  ],
  legend: ['request', 'response', 'hit'],
  steps: [
    {
      short: 'Far away',
      kind: 'problem',
      title: 'Fast in Frankfurt, slow everywhere else',
      body: [
        'A design-tools startup serves everything from Frankfurt. Locally, the editor loads in 0.9 s. In Sydney it takes 6 s; in São Paulo, 4.5 s. Their bandwidth is fine — the problem is <b>round trips</b>: ~300 ms each from Sydney, multiplied across handshakes and ~60 asset requests.',
      ],
      note: { kind: 'key', text: 'You can buy more bandwidth. You can’t buy a faster speed of light. Fewer, shorter round trips are the only cure.' },
      changes: [{ text: 'Sydney RTT ≈ 300 ms', tone: 'bad' }],
      scene: {
        nodes: [syd(), sao(), origin(), files],
        links: [link('syd', 'origin', { label: pill('300 ms', 'clock', 'bad') }), link('sao', 'origin', { label: pill('210 ms', 'clock', 'warn') }), link('origin', 'files')],
        flows: [flow(['syd', 'origin'], { back: true, rate: 1.4, speed: 0.4 }), flow(['sao', 'origin'], { back: true, rate: 1.4, speed: 0.5 })],
        metrics: { rtt: { v: '300 ms', tone: 'bad' }, load: { v: '6.0 s', tone: 'bad' }, edgehit: '—', originrps: '12k/s' },
      },
    },
    {
      short: 'Same bytes',
      kind: 'insight',
      title: 'Most of those bytes are identical for everyone',
      body: [
        'Of the 60 requests, 56 are static: JavaScript bundles, CSS, fonts, icons, sample images. Every user in the world downloads exactly the same bytes for the same version.',
        'Anything identical across users and stable over time can be copied anywhere — and served by whoever is closest.',
      ],
      changes: [{ text: '56 of 60 requests are static', tone: 'good' }],
      scene: {
        nodes: [syd(), sao(), origin({ tag: pill('same 4 MB for all', 'file') }), files],
        links: [link('syd', 'origin'), link('sao', 'origin'), link('origin', 'files')],
        flows: [flow(['files', 'origin', 'syd'], { kind: 'response', rate: 2, speed: 0.5 }), flow(['files', 'origin', 'sao'], { kind: 'response', rate: 2, speed: 0.5 })],
        metrics: { rtt: '300 ms', load: '6.0 s', edgehit: '—', originrps: '12k/s' },
      },
    },
    {
      short: 'Edges',
      kind: 'technique',
      title: 'Put copies at the edge',
      body: [
        'A <b>CDN</b> runs caching servers in hundreds of locations (points of presence). DNS or anycast routing sends each user to a nearby one. The edge keeps copies of static files, so a Sydney user fetches <code>editor.js</code> from Sydney: 12 ms away instead of 300.',
        'Edges also terminate TLS close to the user, so even the handshake round trips become short — and they keep warm, long-lived connections back to the origin.',
      ],
      changes: [{ text: 'Sydney RTT 300 → 12 ms', tone: 'good' }, { text: 'Load 6.0 → 1.4 s', tone: 'good' }],
      concepts: [
        { term: 'CDN', def: 'Content Delivery Network: geographically distributed caches that serve content from close to users.' },
        { term: 'Point of presence (PoP)', def: 'A CDN location with edge servers, typically near major internet exchanges.' },
        { term: 'Anycast', def: 'Advertising the same IP from many locations so the network routes each user to the nearest one.' },
      ],
      scene: {
        nodes: [syd(), sao(), edgeSyd({ tag: pill('12 ms', 'clock', 'good') }), edgeSao({ tag: pill('9 ms', 'clock', 'good') }), origin({ load: 10 }), files],
        links: [link('syd', 'esyd', { arrow: 'both' }), link('sao', 'esao', { arrow: 'both' }), link('esyd', 'origin', { style: 'dashed' }), link('esao', 'origin', { style: 'dashed' }), link('origin', 'files')],
        flows: [flow(['syd', 'esyd'], { kind: 'hit', back: true, rate: 3 }), flow(['sao', 'esao'], { kind: 'hit', back: true, rate: 3 })],
        metrics: { rtt: { v: '12 ms', tone: 'good' }, load: { v: '1.4 s', tone: 'good' }, edgehit: '94%', originrps: '700/s' },
      },
    },
    {
      short: 'Cold edge',
      kind: 'problem',
      title: 'The first user at each edge pays',
      body: [
        'An edge only has what someone nearby already requested. The first request for a new file at the Sydney edge is a <b>miss</b>: the edge fetches it from Frankfurt (300 ms) before answering. Popular files are warm everywhere within seconds.',
        'Long-tail content — old templates, rarely used fonts — may be cold at most of hundreds of edges, so each edge independently goes back to the origin for it.',
      ],
      changes: [{ text: 'Miss → full trip to origin', tone: 'bad' }, { text: 'Origin sees N edges × misses', tone: 'bad' }],
      scene: {
        nodes: [syd(), sao(), edgeSyd({ tag: pill('miss: font-v2.woff', 'x', 'warn') }), edgeSao({ tag: pill('miss', 'x', 'warn') }), origin({ load: 35 }), files],
        links: [link('syd', 'esyd', { arrow: 'both' }), link('sao', 'esao', { arrow: 'both' }), link('esyd', 'origin'), link('esao', 'origin'), link('origin', 'files')],
        flows: [flow(['syd', 'esyd', 'origin'], { back: true, rate: 1, speed: 0.5 }), flow(['sao', 'esao', 'origin'], { back: true, rate: 1, speed: 0.5 })],
        metrics: { rtt: '12 ms', load: { v: '2.3 s (cold)', tone: 'warn' }, edgehit: { v: '81%', tone: 'warn' }, originrps: { v: '2.3k/s', tone: 'warn' } },
      },
    },
    {
      short: 'Shield',
      kind: 'technique',
      title: 'Origin shield: a cache for the caches',
      body: [
        'Route all edge misses through one designated <b>shield</b> location near the origin. When fifty edges miss on the same file, the shield fetches it from the origin once and serves the rest from its own cache.',
        'The origin now sees roughly one request per file per TTL, not one per edge — which is often the difference between a modest origin and a large one.',
      ],
      changes: [{ text: 'Edges → shield → origin', tone: 'good' }, { text: 'Origin req/s 2.3k → 90', tone: 'good' }],
      concepts: [{ term: 'Origin shield', def: 'An intermediate cache tier that collapses misses from many edges into one request to the origin.' }],
      scene: {
        nodes: [syd(), sao(), edgeSyd(), edgeSao(), shield({ tag: pill('collapses misses', 'layers', 'good') }), origin({ load: 6 }), files],
        links: [link('syd', 'esyd', { arrow: 'both' }), link('sao', 'esao', { arrow: 'both' }), link('esyd', 'shield'), link('esao', 'shield'), link('shield', 'origin'), link('origin', 'files')],
        flows: [flow(['syd', 'esyd'], { kind: 'hit', back: true, rate: 2.5 }), flow(['sao', 'esao'], { kind: 'hit', back: true, rate: 2.5 }), flow(['esyd', 'shield'], { kind: 'hit', back: true, rate: 0.6 }), flow(['shield', 'origin'], { back: true, rate: 0.2 })],
        metrics: { rtt: '12 ms', load: '1.4 s', edgehit: '94%', originrps: { v: '90/s', tone: 'good' } },
      },
    },
    {
      short: 'Old files',
      kind: 'technique',
      title: 'Ship a fix, keep serving the bug',
      body: [
        'The team ships a fix to <code>editor.js</code> — but edges cached it for a day, so users keep getting the broken version. Purging every edge works, but it’s slow and easy to forget.',
        'The standard answer is <b>fingerprinted file names</b>: the build names the file after a hash of its contents, <code>editor.7c1e9a.js</code>. A new version is a new URL, so it can be cached <i>forever</i> (<code>Cache-Control: immutable</code>). Only the small HTML that references it gets a short TTL.',
      ],
      note: { kind: 'tip', text: 'Long TTL for content-addressed assets, short TTL (or revalidation) for the HTML entry point. That one rule gives near-100% hit rates and instant deploys.' },
      changes: [{ text: 'editor.js → editor.7c1e9a.js', tone: 'good' }, { text: 'Assets cached 1 year', tone: 'good' }],
      concepts: [{ term: 'Cache busting', def: 'Changing a resource’s URL (e.g. via a content hash) so caches fetch the new version immediately.' }],
      scene: {
        nodes: [syd(), sao(), edgeSyd({ tag: pill('editor.7c1e9a.js', 'file', 'good') }), edgeSao({ tag: pill('editor.7c1e9a.js', 'file', 'good') }), shield(), origin({ load: 6, tag: pill('index.html: 60 s', 'clock') }), files],
        links: [link('syd', 'esyd', { arrow: 'both' }), link('sao', 'esao', { arrow: 'both' }), link('esyd', 'shield'), link('esao', 'shield'), link('shield', 'origin'), link('origin', 'files')],
        flows: [flow(['syd', 'esyd'], { kind: 'hit', back: true, rate: 2.5 }), flow(['sao', 'esao'], { kind: 'hit', back: true, rate: 2.5 })],
        metrics: { rtt: '12 ms', load: '1.4 s', edgehit: { v: '98%', tone: 'good' }, originrps: '40/s' },
      },
    },
    {
      short: 'Purge',
      kind: 'case',
      title: 'Case: something must disappear now',
      body: [
        'A customer’s private image was accidentally published at a public URL. Deleting it from storage isn’t enough — copies sit in edge caches worldwide until their TTL ends.',
        'CDNs expose a <b>purge</b> API (by URL, prefix or tag) that propagates in seconds to minutes. Tagging responses by owner or content type lets you purge precisely without flushing everything.',
      ],
      note: { kind: 'warn', text: 'Never rely on purge for routine deploys — use fingerprinting. Keep it for emergencies, and make sure private content is never cacheable in the first place (Cache-Control: private).' },
      scene: {
        nodes: [syd(), sao(), edgeSyd({ tag: pill('purged', 'x', 'good') }), edgeSao({ tag: pill('purged', 'x', 'good') }), shield({ tag: pill('purged', 'x', 'good') }), origin({ tag: pill('PURGE tag:user-881', 'bolt', 'warn') }), files],
        links: [link('origin', 'shield', { style: 'dashed' }), link('shield', 'esyd', { style: 'dashed' }), link('shield', 'esao', { style: 'dashed' }), link('origin', 'files')],
        flows: [flow(['origin', 'shield', 'esyd'], { kind: 'write', rate: 1 }), flow(['origin', 'shield', 'esao'], { kind: 'write', rate: 1 })],
        metrics: { rtt: '12 ms', load: '1.4 s', edgehit: '98%', originrps: '40/s' },
      },
    },
    {
      short: 'Dynamic',
      kind: 'tradeoff',
      title: 'Personal pages don’t cache by URL',
      body: [
        'The dashboard at <code>/home</code> differs for every signed-in user, so the edge can’t serve one cached copy to everyone. Caching it naively is worse than slow — it can show one user another’s data.',
        'The edge still helps: TLS ends nearby and requests ride warm connections to the origin. Beyond that, split pages into a cacheable shell plus a small personalised API call, or run code at the edge (edge functions) for logic that only needs data available there.',
      ],
      scene: {
        nodes: [
          zone('au', -8, 6, 7, 4.6, 'APAC', 'teal'),
          syd(),
          edgeSyd({ tag: pill('shell: cached', 'file', 'good') }),
          shield(),
          origin({ load: 30, tag: pill('/api/me: per user', 'user', 'warn') }),
          files,
        ],
        links: [link('syd', 'esyd', { arrow: 'both' }), link('esyd', 'shield', { label: pill('warm conn', 'link') }), link('shield', 'origin')],
        flows: [flow(['syd', 'esyd'], { kind: 'hit', back: true, rate: 2 }), flow(['syd', 'esyd', 'shield', 'origin'], { back: true, rate: 0.8, speed: 0.7 })],
        metrics: { rtt: '12 ms', load: '1.6 s', edgehit: '90%', originrps: '600/s' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Move bytes closer',
      body: [
        'A CDN puts copies of shared, stable content near users, cutting round-trip time from hundreds of milliseconds to tens. <b>Shields</b> collapse misses so the origin stays small; <b>fingerprinted URLs</b> make long TTLs and instant deploys compatible.',
        'Use <b>purge</b> for emergencies, mark private content uncacheable, and split dynamic pages so that most bytes can still come from the edge.',
      ],
      scene: {
        nodes: [syd(), sao(), edgeSyd({ tag: pill('near users', 'globe', 'good') }), edgeSao(), shield(), origin({ load: 6, tag: pill('small & calm', 'server', 'good') }), files],
        links: [link('syd', 'esyd', { arrow: 'both' }), link('sao', 'esao', { arrow: 'both' }), link('esyd', 'shield'), link('esao', 'shield'), link('shield', 'origin'), link('origin', 'files')],
        flows: [flow(['syd', 'esyd'], { kind: 'hit', back: true, rate: 2.5 }), flow(['sao', 'esao'], { kind: 'hit', back: true, rate: 2.5 }), flow(['shield', 'origin'], { back: true, rate: 0.2 })],
        metrics: { rtt: '12 ms', load: '1.4 s', edgehit: '98%', originrps: '40/s' },
      },
    },
  ],
};

export default lesson;
