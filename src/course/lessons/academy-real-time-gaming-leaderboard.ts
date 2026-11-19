import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const players = (extra: Partial<SceneNode> = {}) => crowd('players', -13, 1, 18, 'players', extra);
const game = (extra: Partial<SceneNode> = {}) => box('game', -5, 0, 'Game service', 'blue', 'server', { size: [1.5, 1.5], height: 40, ...extra });
const sql = (extra: Partial<SceneNode> = {}) => db('sql', 6, 0, 'scores table', { size: [1.5, 1.5], ...extra });
const zset = (extra: Partial<SceneNode> = {}) => box('zset', 6, 0, 'Sorted set', 'red', 'list', { size: [1.6, 1.6], height: 40, sub: 'Redis', ...extra });
const shard = (i: number, n: number, extra: Partial<SceneNode> = {}): SceneNode =>
  box(`s${i}`, 6, (i - (n - 1) / 2) * 6, `shard ${i + 1}`, 'red', 'list', { size: [1.3, 1.3], height: 34, ...extra });
const shards = (n: number, extra: (i: number) => Partial<SceneNode> = () => ({})) => Array.from({ length: n }, (_, i) => shard(i, n, extra(i)));
const events = (extra: Partial<SceneNode> = {}) => db('events', 14, 8, 'score events', { tone: 'grey', icon: 'list', size: [1.3, 1.3], ...extra });

const OPS_CAP = 100_000; // simple commands per second per single-threaded node (illustrative)
const fmtGB = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB` : `${Math.round(b / 1e6)} MB`);

const lesson: Lesson = {
  slug: 'academy-real-time-gaming-leaderboard',
  title: 'Real-Time Gaming Leaderboard',
  blurb: 'Rank hundreds of millions of players, update scores instantly, and answer “where am I?” in milliseconds — and see why sharding a leaderboard is trickier than sharding a table.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'mem', label: 'Memory', icon: 'cpu' },
    { key: 'shards', label: 'Shards', icon: 'layers' },
    { key: 'load', label: 'Load per shard', icon: 'gauge' },
    { key: 'fanout', label: 'Calls per rank', icon: 'share' },
  ],
  goals: [
    { text: 'Why SQL ranking doesn’t scale', step: 1 },
    { text: 'How a sorted set gives O(log N) rank and range', step: 2 },
    { text: 'Top-N, my-rank and around-me queries; breaking ties', step: 3 },
    { text: 'Sharding: top-K merge and the rank fan-out problem', step: 5 },
    { text: 'Time windows and rebuilding from events', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'players', label: 'Ranked players', min: 1, max: 500, step: 1, default: 300, unit: ' M', description: 'Players on the global board, in millions.' },
      { key: 'bytes', label: 'Bytes per entry', min: 50, max: 300, step: 10, default: 100, unit: ' B', description: 'Memory per member in a Redis sorted set (skip list node + hash entry + member string). Order of magnitude only.' },
      { key: 'shardMem', label: 'Memory per shard', min: 4, max: 64, step: 2, default: 16, unit: ' GB', description: 'Usable memory per node.' },
      { key: 'updates', label: 'Score updates', min: 1_000, max: 200_000, step: 1_000, default: 20_000, unit: '/s', description: 'Score changes per second.' },
      { key: 'ranks', label: 'Rank lookups', min: 1_000, max: 200_000, step: 1_000, default: 30_000, unit: '/s', description: '“What is my rank?” requests per second.' },
    ],
    calculate: (input, step) => {
      const n = (input.players ?? 300) * 1e6;
      const bytes = input.bytes ?? 100;
      const shardMem = (input.shardMem ?? 16) * 1e9;
      const updates = input.updates ?? 20_000;
      const ranks = input.ranks ?? 30_000;
      const mem = n * bytes;
      const s = step < 4 ? 1 : Math.max(1, Math.ceil(mem / shardMem));
      // player-sharded: updates split S ways, but an exact global rank asks every shard
      const perShard = updates / s + ranks;
      const load = perShard / OPS_CAP;
      return {
        mem: { v: fmtGB(mem), tone: mem > shardMem ? 'warn' : 'good' },
        shards: { v: step < 4 ? '1 (does it fit?)' : String(s), tone: step < 4 && mem > shardMem ? 'bad' : undefined },
        load: { v: `${Math.round(load * 100)}%`, tone: load > 1 ? 'bad' : load > 0.7 ? 'warn' : 'good' },
        fanout: { v: s > 1 && step >= 4 ? `${s} (one per shard)` : '1', tone: s > 4 ? 'warn' : undefined },
      };
    },
  },
  steps: [
    {
      short: 'SQL',
      kind: 'problem',
      title: 'Ranking with a SQL query',
      body: [
        'A mobile game keeps <code>scores(player_id, score)</code> in a relational table. “Top 100” is <code>ORDER BY score DESC LIMIT 100</code>; “my rank” is <code>SELECT COUNT(*) FROM scores WHERE score &gt; :mine</code>.',
        'With 300 million players the count has to walk a large part of a score index for every request, and every score update rewrites an index entry. Thousands of players asking “where am I?” turn it into the busiest query in the system, with latency in seconds.',
      ],
      changes: [{ text: 'COUNT(*) over 300M rows per rank lookup', tone: 'bad' }],
      scene: {
        nodes: [players(), game({ load: 35 }), sql({ load: 98, state: 'hot', tag: pill('rank = scan count', 'alert', 'bad') })],
        links: [link('players', 'game'), link('game', 'sql', { arrow: 'both' })],
        flows: [flow(['players', 'game'], { rate: 4 }), flow(['game', 'sql'], { kind: 'heavy', back: true, rate: 3, speed: 0.4 })],
      },
    },
    {
      short: 'Sorted set',
      kind: 'technique',
      title: 'A data structure built for ranking',
      body: [
        'A Redis <b>sorted set</b> stores members ordered by score using a <b>skip list</b> (layers of linked lists that let a search skip ahead) plus a hash table for direct member lookup. Insert, update and rank queries are all <b>O(log N)</b>: roughly 29 steps for 500 million members, microseconds in memory.',
        'The commands match the problem exactly: <code>ZINCRBY</code> / <code>ZADD</code> change a score, <code>ZREVRANK</code> returns a member’s position, <code>ZREVRANGE 0 99</code> returns the top 100 in O(log N + 100).',
      ],
      changes: [{ text: 'ZADD · ZREVRANK: O(log N)', tone: 'good' }, { text: 'Top 100: O(log N + 100)', tone: 'good' }],
      concepts: [
        { term: 'Sorted set', def: 'A collection of unique members each with a score, kept ordered by score; supports rank and range queries.' },
        { term: 'Skip list', def: 'A layered linked list giving O(log N) search, insert and delete without rebalancing.' },
      ],
      scene: {
        nodes: [players(), game({ load: 30 }), zset({ load: 40, tag: pill('skip list + hash', 'layers', 'good') })],
        links: [link('players', 'game'), link('game', 'zset', { arrow: 'both' })],
        flows: [flow(['players', 'game'], { rate: 4 }), flow(['game', 'zset'], { back: true, rate: 3 })],
      },
    },
    {
      short: 'Queries',
      kind: 'technique',
      title: 'Top-N, my rank, and the players around me',
      body: [
        '<b>Top 100</b>: one range call. <b>My rank</b>: one rank call. <b>Around me</b>: get my rank r, then fetch ranks r−5 … r+5 — two O(log N) calls that give the neighbourhood players actually care about.',
        '<b>Ties</b> need a rule. Sorted-set ties fall back to lexicographic order, which is arbitrary for players. Encode “earlier wins” by packing the timestamp into the score, e.g. <code>score + (1 − t ÷ 10¹³)</code>, and keep the result under 2⁵³ so the double stays exact.',
      ],
      changes: [{ text: 'Around me = rank + range' }, { text: 'Tie-break by pack(score, time)' }],
      concepts: [{ term: 'Composite score', def: 'Packing a primary score and a tie-breaker into one sortable number.' }],
      scene: {
        nodes: [players(), game(), zset({ tag: pill('rank 8,214,901 → ±5 neighbours', 'search', 'accent') })],
        links: [link('players', 'game'), link('game', 'zset', { arrow: 'both' })],
        flows: [flow(['game', 'zset'], { back: true, rate: 3 })],
      },
    },
    {
      short: 'Numbers',
      kind: 'technique',
      title: 'Does it fit, and can it keep up?',
      body: [
        'Memory is <code>players × bytes per entry</code>: 300 million at ~100 bytes is about <b>30 GB</b>. That is more than one 16 GB node, so a single sorted set no longer fits. Throughput matters too: a single-threaded node handles on the order of 100,000 simple commands a second, and updates plus rank lookups both draw from it.',
        'Use the sliders: shrink the player count and it fits on one node; raise rank lookups and the load climbs even on a single shard. These two budgets — memory and operations per second — decide how many shards you need.',
      ],
      changes: [{ text: '300M × 100 B ≈ 30 GB > 16 GB per node', tone: 'bad' }],
      scene: {
        nodes: [players(), game(), zset({ load: 100, state: 'hot', tag: pill('30 GB > 16 GB node', 'alert', 'bad') })],
        links: [link('players', 'game'), link('game', 'zset', { arrow: 'both' })],
        flows: [flow(['players', 'game'], { rate: 4 }), flow(['game', 'zset'], { kind: 'heavy', back: true, rate: 3, speed: 0.5 })],
      },
    },
    {
      short: 'Sharding',
      kind: 'insight',
      title: 'Shard by player — and every rank query fans out',
      body: [
        'Split players across S sorted sets by hash of player ID. Updates go to one shard, so write load divides by S. <b>Top 100</b> merges cleanly: ask each shard for its top 100 and merge S × 100 candidates.',
        'But an exact <b>global rank</b> needs the number of players with a higher score <i>in every shard</i>: S counting calls, summed. Each shard therefore still handles <b>every</b> rank query — per-shard load is <code>updates ÷ S + rank lookups</code>, and the rank part never shrinks. Adding shards fixes memory and writes, not read-heavy rank traffic.',
      ],
      note: { kind: 'key', text: 'Sharding by player scales writes and memory. It does not scale “what’s my exact global rank?” — that needs a different read path.' },
      changes: [{ text: 'Writes ÷ S', tone: 'good' }, { text: 'Exact rank = S calls on every query', tone: 'bad' }],
      scene: {
        nodes: [players(), game({ tag: pill('rank = Σ ZCOUNT over shards', 'calc', 'warn') }), ...shards(3, () => ({ load: 55 }))],
        links: [link('players', 'game'), ...[0, 1, 2].map((i) => link('game', `s${i}`, { arrow: 'both' }))],
        flows: [flow(['players', 'game'], { rate: 3 }), ...[0, 1, 2].map((i) => flow(['game', `s${i}`], { back: true, rate: 1.5 }))],
      },
    },
    {
      short: 'Cheaper rank',
      kind: 'technique',
      title: 'Make the common reads cheap',
      body: [
        'Most players are not near the top, and most don’t need a precise rank like “8,214,901”. Cache the <b>top 100</b> for a second — one computation serves thousands of viewers. For everyone else show a <b>percentile</b> (“top 3%”) computed from a score histogram maintained per bucket, which is O(buckets) instead of O(shards × log N).',
        'Reserve exact rank for the few cases that need it — the player’s own view near their position, or end-of-season payouts — and compute those on demand or in a batch.',
      ],
      changes: [{ text: 'Top 100 cached 1 s', tone: 'good' }, { text: 'Percentile from a histogram, exact only when needed', tone: 'good' }],
      scene: {
        nodes: [players(), game(), box('cache', 0, 9, 'Top-100 cache', 'green', 'bolt', { size: [1.3, 1.3], height: 30, tag: pill('TTL 1 s', 'timer') }), box('hist', 12, 9, 'Score histogram', 'yellow', 'signal', { size: [1.3, 1.3], height: 30, tag: pill('“top 3%”', 'gauge') }), ...shards(3, () => ({ load: 35 }))],
        links: [link('players', 'game'), link('game', 'cache', { arrow: 'both' }), link('game', 'hist', { arrow: 'both' }), ...[0, 1, 2].map((i) => link('cache', `s${i}`, { style: 'dashed' }))],
        flows: [flow(['players', 'game'], { rate: 3 }), flow(['game', 'cache'], { kind: 'hit', back: true, rate: 3 }), flow(['game', 'hist'], { back: true, rate: 2 })],
      },
    },
    {
      short: 'Windows',
      kind: 'technique',
      title: 'Daily, weekly and seasonal boards',
      body: [
        'Games run time-boxed boards. Use one sorted set per period — <code>lb:2026-11-19</code>, <code>lb:2026-W47</code> — written on every score change, each with a TTL so expired boards clean themselves up. Writing to the daily and weekly keys together makes every read O(log N).',
        'A <code>ZUNIONSTORE</code> of seven dailies is O(N) work and blocks the node while it runs, so use it for offline jobs and finals, not for every request. Keep the board small by only inserting players who actually played that period.',
      ],
      changes: [{ text: 'One key per period + TTL', tone: 'good' }, { text: 'Write daily and weekly together' }],
      scene: {
        nodes: [players(), game(), zset({ name: 'daily', tag: pill('lb:2026-11-19 · TTL 2 d', 'timer') }), box('weekly', 6, 7, 'weekly', 'red', 'list', { size: [1.3, 1.3], height: 30, tag: pill('lb:2026-W47', 'clock') })],
        links: [link('players', 'game'), link('game', 'zset'), link('game', 'weekly')],
        flows: [flow(['players', 'game'], { rate: 3 }), flow(['game', 'zset'], { kind: 'write', rate: 2 }), flow(['game', 'weekly'], { kind: 'write', rate: 2 })],
      },
    },
    {
      short: 'Failure',
      kind: 'case',
      title: 'Case: the leaderboard node dies',
      body: [
        'The board lives in memory. A replica takes over, but replication is asynchronous, so the last second or two of score changes can be missing. And if the whole board is lost, you must rebuild it.',
        'Treat the sorted set as a <b>derived view</b>: the source of truth is a durable log of score events (or the scores table). Failover to the replica for speed, then reconcile any gap from the log; for a full rebuild, replay the log into a fresh node. Loading 300 million entries at ~1 million inserts a second takes about five minutes — plan for it, and serve a cached top 100 meanwhile.',
      ],
      changes: [{ text: 'Failover to replica; reconcile from events', tone: 'good' }, { text: 'Full rebuild ≈ 5 min at 1M inserts/s' }],
      concepts: [{ term: 'Derived data', def: 'A view computed from a source of truth (here score events) that can be rebuilt if lost.' }],
      scene: {
        nodes: [players(), game(), ...shards(2, (i) => (i === 0 ? { state: 'down', tag: pill('node lost', 'alert', 'bad') } : { tag: pill('replica promoted', 'check', 'good') })), events({ tag: pill('durable, replayable', 'shield', 'good') })],
        links: [link('players', 'game'), link('game', 's0', { arrow: 'both', style: 'broken' }), link('game', 's1', { arrow: 'both' }), link('events', 's0', { style: 'dashed', label: pill('rebuild', 'refresh') })],
        flows: [flow(['players', 'game'], { rate: 3 }), flow(['game', 's1'], { back: true, rate: 2 }), flow(['events', 's0'], { kind: 'write', rate: 1.5 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Sorted sets, sharded with care',
      body: [
        'Ranking is an ordered-set problem: a <b>sorted set</b> gives O(log N) updates, ranks and ranges; ties need a composite score. Budget <b>memory</b> (players × bytes per entry) and <b>ops/s</b> to decide the shard count.',
        'Shard by player for writes and memory, merge top-K across shards, and avoid per-query exact global ranks — cache the top, show percentiles. Keep one sorted set per time window, and keep score events durable so the board can be rebuilt.',
      ],
      scene: {
        nodes: [players(), game(), ...shards(3, () => ({ load: 45 })), events()],
        links: [link('players', 'game'), ...[0, 1, 2].map((i) => link('game', `s${i}`, { arrow: 'both' })), link('game', 'events', { style: 'dashed' })],
        flows: [flow(['players', 'game'], { rate: 3 }), ...[0, 1, 2].map((i) => flow(['game', `s${i}`], { back: true, rate: 1.2 })), flow(['game', 'events'], { kind: 'write', rate: 1.2 })],
      },
    },
  ],
};

export default lesson;
