import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill, you } from '../kit';

const author = (extra: Partial<SceneNode> = {}) => you('author', -13, -6, { label: pill('Lina posts', 'user'), ...extra });
const readers = (extra: Partial<SceneNode> = {}) => crowd('readers', -13, 6, 18, 'followers open app', extra);
const postSvc = (extra: Partial<SceneNode> = {}) => box('post', -5, -6, 'Post service', 'blue', 'server', { size: [1.3, 1.3], height: 36, ...extra });
const feedSvc = (extra: Partial<SceneNode> = {}) => box('feed', -5, 5, 'Feed service', 'orange', 'list', { size: [1.4, 1.4], height: 38, ...extra });
const posts = (extra: Partial<SceneNode> = {}) => db('posts', 4, -8, 'Posts', extra);
const graph = (extra: Partial<SceneNode> = {}) => db('graph', 4, 0, 'Follow graph', { tone: 'green', icon: 'users', ...extra });
const timelines = (extra: Partial<SceneNode> = {}) => box('tl', 4, 8, 'Timelines', 'red', 'layers', { size: [1.5, 1.5], height: 38, sub: 'per-user lists', ...extra });
const fanout = (extra: Partial<SceneNode> = {}) => box('fan', 11, -3, 'Fan-out workers', 'purple', 'share', { size: [1.3, 1.3], height: 34, ...extra });
const media = (extra: Partial<SceneNode> = {}) => disk('media', 11, 7, 'media + CDN', { tone: 'orange', icon: 'image', size: [1.8, 1.4], height: 20, ...extra });
const ranker = (extra: Partial<SceneNode> = {}) => box('rank', -9, 12, 'Ranker', 'teal', 'sparkle', { size: [1.2, 1.2], height: 30, ...extra });

const pushLinks = [link('author', 'post'), link('post', 'posts'), link('post', 'fan', { style: 'dashed', label: pill('PostCreated') }), link('fan', 'graph', { arrow: 'both' }), link('fan', 'tl'), link('readers', 'feed', { arrow: 'both' }), link('feed', 'tl', { arrow: 'both' }), link('feed', 'posts', { style: 'dashed' })];

const lesson: Lesson = {
  slug: 'social-feed',
  title: 'A Social Feed',
  blurb: 'Build a home timeline for hundreds of millions of people — and decide when to do the work: when someone posts, or when someone reads.',
  minutes: 15,
  level: 'Advanced',
  metrics: [
    { key: 'p99', label: 'Feed load p99', icon: 'timer' },
    { key: 'writes', label: 'Writes per post', icon: 'share' },
    { key: 'fresh', label: 'Post → feed', icon: 'clock' },
    { key: 'storage', label: 'Timeline RAM', icon: 'cpu' },
  ],
  goals: [
    { text: 'Fan-out on read and why it’s slow', step: 2 },
    { text: 'Fan-out on write and precomputed timelines', step: 3 },
    { text: 'The celebrity problem and the hybrid model', step: 5 },
    { text: 'Storing and hydrating timelines', step: 6 },
    { text: 'Ranking and skipping inactive users', step: 9 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  steps: [
    {
      short: 'Scope',
      kind: 'problem',
      title: 'A home feed for 200M daily users',
      body: [
        'Users post text and photos and follow others. Opening the app shows a <b>home timeline</b>: recent posts from everyone you follow, newest (or most relevant) first. 200M daily users, each opening the feed ~10 times a day: ~25,000 feed loads/s on average, far more at peaks. ~500 posts/s are written.',
        'Requirements: feed loads under 200 ms; a new post should appear in followers’ feeds within seconds; posts are never lost.',
      ],
      changes: [{ text: '25k feed reads/s vs 500 posts/s' }],
      scene: {
        nodes: [author(), readers({ count: 24 }), postSvc(), feedSvc(), posts(), graph()],
        links: [link('author', 'post'), link('post', 'posts'), link('readers', 'feed', { arrow: 'both' }), link('feed', 'graph', { style: 'dashed' }), link('feed', 'posts', { style: 'dashed' })],
        flows: [flow(['author', 'post', 'posts'], { kind: 'write', rate: 0.5 }), flow(['readers', 'feed'], { back: true, rate: 3 })],
        metrics: { p99: '?', writes: '?', fresh: '?', storage: '?' },
      },
    },
    {
      short: 'Pull',
      kind: 'problem',
      title: 'Fan-out on read: assemble the feed on demand',
      body: [
        'The obvious design: when you open the feed, fetch your 400 followees from the graph, query each one’s recent posts, merge and sort, return the top 50. Posting is trivially cheap.',
        'Reading is not: 400 lookups per feed load × 25,000 loads/s is 10 million queries a second, and the merge waits for the slowest. Feeds take seconds. Reads vastly outnumber writes, so this puts the work in the worst possible place.',
      ],
      changes: [{ text: '400 queries per feed load', tone: 'bad' }, { text: 'p99 2.4 s', tone: 'bad' }],
      concepts: [{ term: 'Fan-out on read', def: 'Building a feed at request time by querying every followed account’s recent content (pull model).' }],
      scene: {
        nodes: [author(), readers(), postSvc(), feedSvc({ load: 98, state: 'hot', tag: pill('merge 400 sources', 'alert', 'bad') }), posts({ load: 95, state: 'hot' }), graph()],
        links: [link('author', 'post'), link('post', 'posts'), link('readers', 'feed', { arrow: 'both' }), link('feed', 'graph', { arrow: 'both' }), link('feed', 'posts', { arrow: 'both' })],
        flows: [flow(['readers', 'feed'], { back: true, rate: 2, speed: 0.4 }), flow(['feed', 'posts'], { kind: 'heavy', back: true, rate: 6, speed: 0.6 })],
        metrics: { p99: { v: '2.4 s', tone: 'bad' }, writes: '1', fresh: 'instant', storage: '—' },
      },
    },
    {
      short: 'Push',
      kind: 'technique',
      title: 'Fan-out on write: precompute every timeline',
      body: [
        'Flip it. When Lina posts, a fan-out worker looks up her followers and <b>prepends the post ID</b> to each follower’s timeline — a per-user list in a fast in-memory store. Opening the feed becomes one read of your own list.',
        'Feed loads drop to tens of milliseconds. The work moved to write time, where there’s 50× less traffic — and it happens asynchronously, so posting still returns instantly.',
      ],
      changes: [{ text: 'Feed load = 1 list read', tone: 'good' }, { text: 'p99 2.4 s → 60 ms', tone: 'good' }],
      concepts: [{ term: 'Fan-out on write', def: 'Pushing each new post into the precomputed timelines of all followers when it is created (push model).' }],
      scene: {
        nodes: [author(), readers(), postSvc(), feedSvc({ load: 30 }), posts(), graph(), timelines({ tag: pill('feed:u42 → [p9, p8, …]', 'list', 'good') }), fanout({ tag: pill('Lina → 300 followers', 'share') })],
        links: pushLinks,
        flows: [flow(['author', 'post', 'fan'], { kind: 'write', rate: 0.6 }), flow(['fan', 'tl'], { kind: 'write', rate: 3 }), flow(['readers', 'feed', 'tl'], { kind: 'hit', back: true, rate: 2.5 })],
        metrics: { p99: { v: '60 ms', tone: 'good' }, writes: '≈ followers', fresh: '~2 s', storage: 'large' },
      },
    },
    {
      short: 'Celebrity',
      kind: 'problem',
      title: 'A celebrity posts',
      body: [
        'A pop star with 80 million followers posts. Fan-out on write means 80 million timeline inserts for one post — minutes of work for the fan-out fleet, delaying everyone else’s posts queued behind it. Do it a few times an hour and the system never catches up.',
        'The follower distribution is extremely skewed: most accounts have hundreds of followers; a few thousand have millions.',
      ],
      changes: [{ text: '1 post → 80M writes', tone: 'bad' }, { text: 'Fan-out backlog: 9 min', tone: 'bad' }],
      scene: {
        nodes: [author({ label: pill('celebrity · 80M followers', 'sparkle'), tag: pill('new post', 'bolt') }), readers(), postSvc(), feedSvc(), posts(), graph(), timelines({ load: 99, state: 'hot' }), fanout({ load: 100, state: 'hot', tag: pill('80M inserts', 'alert', 'bad') })],
        links: pushLinks,
        flows: [flow(['author', 'post', 'fan'], { kind: 'write', rate: 0.6 }), flow(['fan', 'tl'], { kind: 'heavy', rate: 8, speed: 0.5 })],
        metrics: { p99: '60 ms', writes: { v: '80,000,000', tone: 'bad' }, fresh: { v: '9 min', tone: 'bad' }, storage: 'large' },
      },
    },
    {
      short: 'Hybrid',
      kind: 'technique',
      title: 'Hybrid: push for most, pull for the famous',
      body: [
        'Fan out on write for ordinary accounts. For accounts above a threshold (say 1M followers), <b>don’t</b> fan out; instead, at read time, fetch recent posts from the handful of celebrities you follow and merge them into your precomputed timeline.',
        'Each feed load does one list read plus a few cached celebrity lookups — cheap, because celebrity posts are the hottest items in the post cache anyway.',
      ],
      changes: [{ text: 'Celebrity posts merged at read', tone: 'good' }, { text: 'Fan-out backlog → 0', tone: 'good' }],
      concepts: [{ term: 'Hybrid fan-out', def: 'Pushing posts from ordinary accounts and pulling posts from very high-follower accounts at read time.' }],
      scene: {
        nodes: [author({ label: pill('celebrity', 'sparkle'), tag: pill('no fan-out', 'x', 'good') }), readers(), postSvc(), feedSvc({ tag: pill('timeline ∪ 6 celebrities', 'list', 'good') }), posts({ tag: pill('celebrity posts: cached', 'bolt') }), graph(), timelines(), fanout({ load: 30 })],
        links: pushLinks,
        flows: [flow(['author', 'post', 'posts'], { kind: 'write', rate: 0.5 }), flow(['readers', 'feed', 'tl'], { kind: 'hit', back: true, rate: 2 }), flow(['feed', 'posts'], { kind: 'hit', back: true, rate: 1.5 })],
        metrics: { p99: { v: '75 ms', tone: 'good' }, writes: { v: '≤ 1M', tone: 'good' }, fresh: '~2 s', storage: 'large' },
      },
    },
    {
      short: 'Timelines',
      kind: 'technique',
      title: 'Store IDs, hydrate on read',
      body: [
        'Timelines hold only <b>post IDs</b> (8 bytes), capped at the latest ~800 — nobody scrolls further, and older entries can be rebuilt from the graph. 200M active users × 800 × 8 B ≈ <b>1.3 TB</b> of RAM across a sharded, replicated in-memory cluster.',
        'On read, the feed service takes the top 50 IDs and <b>hydrates</b> them from a post cache (text, author, counts) in one batched multi-get. Edits and deletions then show up everywhere instantly, since the timeline never copied the content.',
      ],
      changes: [{ text: '800 IDs per user ≈ 1.3 TB RAM', tone: 'good' }],
      concepts: [{ term: 'Hydration', def: 'Turning a list of IDs into full objects by batch-fetching them from a cache or store.' }],
      scene: {
        nodes: [author(), readers(), postSvc(), feedSvc({ tag: pill('top 50 IDs → multi-get', 'layers') }), posts({ tag: pill('post cache', 'bolt') }), graph(), timelines({ tag: pill('cap 800 IDs', 'list') }), fanout()],
        links: pushLinks,
        flows: [flow(['readers', 'feed', 'tl'], { kind: 'hit', back: true, rate: 2 }), flow(['feed', 'posts'], { kind: 'hit', back: true, rate: 2 })],
        metrics: { p99: '75 ms', writes: '≤ 1M', fresh: '~2 s', storage: { v: '1.3 TB', tone: 'good' } },
      },
    },
    {
      short: 'Media',
      kind: 'technique',
      title: 'Photos never touch the feed path',
      body: [
        'Images and videos are uploaded directly to object storage, processed into sizes asynchronously, and served from a CDN. Posts store only media keys; the feed response contains CDN URLs.',
        'The feed service moves kilobytes of JSON per load; the gigabits of media flow from edges near users.',
      ],
      scene: {
        nodes: [author({ tag: pill('upload → object store', 'image') }), readers(), postSvc(), feedSvc(), posts(), graph(), timelines(), fanout(), media({ tag: pill('served from edges', 'globe', 'good') })],
        links: [...pushLinks, link('author', 'media', { style: 'dashed' }), link('readers', 'media', { style: 'dashed' })],
        flows: [flow(['author', 'media'], { kind: 'write', rate: 0.6 }), flow(['media', 'readers'], { kind: 'hit', rate: 3 }), flow(['readers', 'feed', 'tl'], { kind: 'hit', back: true, rate: 1.5 })],
        metrics: { p99: '75 ms', writes: '≤ 1M', fresh: '~2 s', storage: '1.3 TB' },
      },
    },
    {
      short: 'Ranking',
      kind: 'tradeoff',
      title: 'Most relevant instead of most recent',
      body: [
        'A ranked feed scores candidates (from the precomputed timeline plus pulled sources) using features such as author affinity, engagement and freshness, often with a learned model. Scoring 800 candidates on every load is expensive and adds latency.',
        'Common answer: rank in two stages — a cheap filter to ~200 candidates, then a heavier model — and precompute or cache ranked pages for users likely to open the app soon. Ranking trades simplicity and predictability for engagement.',
      ],
      scene: {
        nodes: [author(), readers(), postSvc(), feedSvc({ tag: pill('800 → 200 → 50', 'filter') }), posts(), graph(), timelines(), fanout(), ranker({ tag: pill('model score', 'sparkle') })],
        links: [...pushLinks, link('feed', 'rank', { arrow: 'both' })],
        flows: [flow(['readers', 'feed', 'tl'], { kind: 'hit', back: true, rate: 1.5 }), flow(['feed', 'rank'], { back: true, rate: 1.5 })],
        metrics: { p99: { v: '140 ms', tone: 'warn' }, writes: '≤ 1M', fresh: '~2 s', storage: '1.3 TB' },
      },
    },
    {
      short: 'Inactive',
      kind: 'case',
      title: 'Case: half the timelines are never read',
      body: [
        'Analysis shows 45% of fan-out writes go to accounts that haven’t opened the app in a month. That’s a lot of RAM and write throughput spent on timelines nobody reads.',
        'Skip fan-out to users inactive for 30+ days and evict their timelines. When they return, rebuild their timeline on demand with a one-off fan-out-on-read — a slower first load for a rare event, in exchange for nearly halving the steady-state cost.',
      ],
      changes: [{ text: 'Fan-out writes −45%', tone: 'good' }, { text: 'Timeline RAM 1.3 → 0.8 TB', tone: 'good' }],
      scene: {
        nodes: [author(), readers({ tag: pill('returning user: rebuild once', 'refresh') }), postSvc(), feedSvc(), posts(), graph({ tag: pill('skip inactive > 30 d', 'filter', 'good') }), timelines({ load: 45 }), fanout({ load: 40 })],
        links: pushLinks,
        flows: [flow(['author', 'post', 'fan'], { kind: 'write', rate: 0.6 }), flow(['fan', 'tl'], { kind: 'write', rate: 1.6 }), flow(['readers', 'feed', 'tl'], { kind: 'hit', back: true, rate: 2 })],
        metrics: { p99: '75 ms', writes: { v: 'active only', tone: 'good' }, fresh: '~2 s', storage: { v: '0.8 TB', tone: 'good' } },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Do the work where it’s cheapest',
      body: [
        'Reads dwarf writes, so <b>precompute timelines on write</b> — except for accounts with huge followings, whose posts are <b>pulled and merged at read</b>. Store <b>IDs</b> in capped in-memory lists and <b>hydrate</b> from a post cache; keep media on CDNs.',
        'Layer ranking carefully, skip work for inactive users, and keep everything asynchronous after the post is durably saved.',
      ],
      scene: {
        nodes: [author(), readers(), postSvc(), feedSvc({ tag: pill('push + pull hybrid', 'share', 'good') }), posts(), graph(), timelines(), fanout(), media()],
        links: pushLinks,
        flows: [flow(['author', 'post', 'fan'], { kind: 'write', rate: 0.6 }), flow(['fan', 'tl'], { kind: 'write', rate: 1.5 }), flow(['readers', 'feed', 'tl'], { kind: 'hit', back: true, rate: 2 })],
        metrics: { p99: '75 ms', writes: '≤ 1M, active only', fresh: '~2 s', storage: '0.8 TB' },
      },
    },
  ],
};

export default lesson;
