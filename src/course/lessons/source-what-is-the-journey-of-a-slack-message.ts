import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const sender = (extra: Partial<SceneNode> = {}) => box('sender', -17, 0, 'Sender', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const gw = (extra: Partial<SceneNode> = {}) => box('gw', -10, 0, 'WebSocket gateway', 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });
const api = (extra: Partial<SceneNode> = {}) => box('api', -3, 0, 'Message service', 'purple', 'cpu', { size: [1.4, 1.4], height: 30, ...extra });
const dbN = (extra: Partial<SceneNode> = {}) => db('db', -3, 8, 'Sharded message store', { size: [1.4, 1.4], ...extra });
const chan = (extra: Partial<SceneNode> = {}) => box('chan', 5, 0, 'Channel server', 'orange', 'share', { size: [1.4, 1.4], height: 28, ...extra });
const jobs = (extra: Partial<SceneNode> = {}) => box('jobs', 5, -8, 'Job queue', 'yellow', 'queue', { size: [1.6, 1], height: 14, ...extra });
const members = (extra: Partial<SceneNode> = {}) => crowd('members', 14, 0, 12, 'online members', extra);

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-what-is-the-journey-of-a-slack-message',
  title: 'The Journey of a Chat Message',
  blurb: 'From keypress to every member’s screen: gateway, durable write, channel fan-out, asynchronous side effects — and why a huge channel makes delivery, typing and read-state the expensive parts.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'deliv', label: 'Deliveries per second (one channel)', icon: 'share' },
    { key: 'typing', label: 'Typing-indicator events/s (unthrottled → throttled)', icon: 'activity' },
    { key: 'reads', label: 'Read-state writes per second', icon: 'disk' },
    { key: 'lat', label: 'Send-to-screen latency', icon: 'clock' },
  ],
  goals: [
    { text: 'The synchronous path: gateway to durable write', step: 2 },
    { text: 'Fan-out through channel servers to online members', step: 3 },
    { text: 'Asynchronous side effects: search, notifications, unfurls', step: 4 },
    { text: 'Why big channels amplify typing and read state', step: 5 },
    { text: 'Reconnect, missed messages and ordering', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'members', label: 'Members in the channel', min: 10, max: 1000000, step: 10, default: 20000, unit: '', description: 'Total members of the busy channel.' },
      { key: 'online', label: 'Online and connected', min: 1, max: 100, step: 1, default: 40, unit: '%', description: 'Share of members with a live connection.' },
      { key: 'mpm', label: 'Messages per minute', min: 1, max: 1000, step: 1, default: 30, unit: '', description: 'Posts in the channel.' },
      { key: 'typing', label: 'People typing at once', min: 0, max: 500, step: 1, default: 20, unit: '', description: 'Concurrent typers generating indicator events (~1 per second each).' },
      { key: 'hop', label: 'Latency per hop', min: 1, max: 100, step: 1, default: 12, unit: ' ms', description: 'Network + processing per internal hop.' },
      { key: 'watch', label: 'Members with the channel open', min: 0, max: 100, step: 1, default: 10, unit: '%', description: 'Of online members, those viewing it and marking messages read.' },
    ],
    calculate: (input, step) => {
      const m = Math.max(1, input.members ?? 20000);
      const online = Math.min(1, Math.max(0.001, (input.online ?? 40) / 100));
      const mps = Math.max(0, (input.mpm ?? 30) / 60);
      const typers = Math.max(0, input.typing ?? 20);
      const hop = Math.max(1, input.hop ?? 12);
      const watch = Math.min(1, Math.max(0, (input.watch ?? 10) / 100));
      const onl = m * online;
      const deliv = mps * onl;
      // Naive: every typing event goes to every online member (typers × 1/s × online). Throttling and viewer-only delivery cut this sharply.
      const typingRaw = typers * onl;
      const viewers = onl * watch;
      const typingThrottled = typers * viewers * 0.2;
      const reads = mps * viewers;
      // Client → gateway → message service → durable write → channel server → gateway → client.
      const lat = 6 * hop + 15;
      return {
        deliv: step < 2 ? { v: '—' } : { v: `${fmtN(deliv)}/s`, tone: deliv > 50000 ? 'warn' : 'good' },
        typing: step < 4 ? { v: '—' } : { v: `${fmtN(typingRaw)} → ${fmtN(typingThrottled)}/s`, tone: typingRaw > 100000 ? 'bad' : 'warn' },
        reads: step < 4 ? { v: '—' } : { v: `${fmtN(reads)}/s`, tone: reads > 10000 ? 'warn' : 'good' },
        lat: step < 1 ? { v: '—' } : { v: `${Math.round(lat)} ms`, tone: lat < 200 ? 'good' : lat < 500 ? 'warn' : 'bad' },
      };
    },
  },
  steps: [
    {
      short: 'Overview',
      kind: 'insight',
      title: 'A message is a durable write plus a lot of fan-out',
      body: [
        'Pressing Enter looks like one action; it is three. First a <b>durable write</b> — the message must survive any failure after the sender sees it posted. Second a <b>real-time fan-out</b> to every member currently connected, ideally within a couple of hundred milliseconds. Third <b>asynchronous side effects</b> — search indexing, push and email notifications, link previews, integrations, analytics — that must never slow the first two.',
        'Treat these as separate pipelines with different guarantees: the write is synchronous and consistent, the fan-out is best-effort and fast, the side effects are queued and retried. Most chat-system design is deciding what belongs in which.',
      ],
      scene: { nodes: [sender(), gw(), api(), dbN(), chan(), members(), jobs()], links: [link('sender', 'gw'), link('gw', 'api'), link('api', 'db'), link('api', 'chan'), link('chan', 'members'), link('api', 'jobs', { style: 'dashed' })], flows: [flow(['sender', 'gw', 'api', 'chan', 'members'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Write',
      kind: 'technique',
      title: 'The synchronous path: authenticate, assign, persist',
      body: [
        'The client sends the message over its WebSocket; the <b>gateway</b> (which terminates thousands of long-lived connections) authenticates it and forwards to a <b>message service</b>. That service checks permission to post in the channel, assigns a <b>timestamp/ID</b> that orders messages within the channel (a per-channel monotonic id, e.g. a server timestamp with sequence), writes to a <b>sharded database</b> — typically sharded by workspace or channel so one team’s volume is contained — and only then acknowledges to the sender.',
        'The sender’s client shows the message optimistically (grey) and confirms when the ack arrives; a client-generated <b>idempotency id</b> makes retries safe. Six hops of ~12 ms plus ~15 ms of work gives <b>~87 ms</b> send-to-screen here — the latency budget is spent on network hops, so fewer internal calls on the hot path is the main lever.',
      ],
      changes: [{ text: 'Ack only after the durable write', tone: 'good' }, { text: 'Optimistic UI + client idempotency id', tone: 'good' }, { text: '6 hops × 12 ms + 15 ms ≈ 87 ms', tone: 'info' }],
      scene: { nodes: [sender({ tag: pill('optimistic render', 'bolt') }), gw({ tag: pill('auth', 'lock') }), api({ tag: pill('assign id · check perms', 'check') }), dbN({ tag: pill('shard by channel / workspace', 'hash') })], links: [link('sender', 'gw', { arrow: 'both' }), link('gw', 'api', { arrow: 'both' }), link('api', 'db')], flows: [flow(['sender', 'gw', 'api', 'db'], { kind: 'write', rate: 1.5, back: true })] },
    },
    {
      short: 'Fan-out',
      kind: 'technique',
      title: 'Real-time delivery through channel servers',
      body: [
        'Each channel is owned by one <b>channel server</b> (chosen by consistent hashing on the channel id, see that lesson) that knows which gateways hold connections for the channel’s online members. After the durable write, the message service hands the message to the channel server, which sends it to those gateways; each gateway writes it to its local sockets. Because one process owns each channel, ordering is trivial and fan-out is a loop over a subscriber list.',
        'The amount of work is <code>messages/s × online members</code>: a 20,000-member channel, 40% online, 30 messages a minute = 0.5 × 8,000 = <b>4,000 deliveries/s</b> for that one channel. The write path doesn’t grow with channel size; delivery does — which is why very large channels get special handling (batching, shedding to non-viewers, longer delivery SLOs).',
      ],
      changes: [{ text: 'One owner per channel → ordered, simple', tone: 'good' }, { text: 'Deliveries = msgs/s × online members = 4,000/s', tone: 'info' }],
      scene: { nodes: [api(), chan({ tag: pill('owns the channel', 'hash') }), gw({ name: 'Gateways' }), members()], links: [link('api', 'chan'), link('chan', 'gw'), link('gw', 'members')], flows: [flow(['api', 'chan', 'gw', 'members'], { kind: 'write', rate: 2.5 })] },
    },
    {
      short: 'Async',
      kind: 'technique',
      title: 'Side effects are queued, never inline',
      body: [
        'After the write commits, an event goes to a <b>durable job queue</b> consumed by independent workers: update the <b>search index</b>, compute <b>mention and notification</b> targets (push, email, badge counts, respecting preferences and do-not-disturb), fetch <b>link previews</b>, call <b>integrations and bots</b> (outgoing webhooks, see that lesson), and feed analytics and compliance exports. Each is retried with backoff and is idempotent.',
        'Keeping them off the hot path means a slow search cluster or a flaky webhook endpoint can lag without delaying anyone’s chat. The trade-off is <b>eventual consistency</b>: a message appears instantly but may take seconds to be searchable, and a notification can arrive after the user has already read it on another device — clients and servers reconcile read state to suppress stale pushes.',
      ],
      changes: [{ text: 'Search, notifications, previews, bots via a job queue', tone: 'good' }, { text: 'Eventually consistent side effects', tone: 'info' }],
      scene: { nodes: [api({ tag: pill('enqueue event', 'list') }), jobs(), box('w1', -3, -8, 'Search indexer', 'teal', 'search', { size: [1.1, 1.1], height: 20 }), box('w2', 11, -8, 'Notification sender', 'teal', 'bolt', { size: [1.1, 1.1], height: 20 }), box('w3', 5, -14, 'Link unfurler / bots', 'teal', 'globe', { size: [1.1, 1.1], height: 20 })], links: [link('api', 'jobs', { style: 'dashed' }), link('jobs', 'w1'), link('jobs', 'w2'), link('jobs', 'w3')], flows: [flow(['api', 'jobs', 'w2'], { rate: 1.2 })] },
    },
    {
      short: 'Big channels',
      kind: 'problem',
      title: 'Typing indicators and read state multiply with channel size',
      body: [
        'The message itself is one event; the <i>incidental</i> events scale with the audience. <b>Typing indicators</b>: 20 people typing, each emitting an event a second, broadcast to every online member = 20 × 8,000 = <b>160,000 events/s</b> — 40× the actual messages. <b>Read state</b>: each member viewing the channel marks messages read; with 800 viewers and 0.5 messages/s that is 400 writes/s of per-user cursors — small each, constant in total.',
        'Mitigations: <b>deliver typing only to members who have the channel open</b>, throttle and coalesce (“several people are typing”), cap indicators in big channels, batch read-cursor updates and store them as <b>last-read position</b> (one value per user per channel, not one per message), and treat badge counts as derived, cached values. The 160,000/s falls to ~3,000/s with these.',
      ],
      changes: [{ text: '20 typers × 8,000 online = 160,000 events/s', tone: 'bad' }, { text: 'Viewers only + throttling → ~3,000/s', tone: 'good' }, { text: 'Read state = one last-read cursor per user per channel', tone: 'good' }],
      scene: { nodes: [chan({ state: 'hot', tag: pill('typing events × members', 'alert', 'warn') }), members({ tag: pill('most are not even looking', 'pause') }), db('cur', 5, 8, 'Last-read cursors', { size: [1.3, 1.3], tag: pill('batched', 'check', 'good') })], links: [link('chan', 'members'), link('chan', 'cur', { style: 'dashed' })], flows: [flow(['chan', 'members'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Reconnect',
      kind: 'technique',
      title: 'Reconnect, gaps and ordering',
      body: [
        'Connections drop all the time (sleep, network change). The client keeps the <b>last message id</b> it saw per channel; on reconnect it asks “everything since X” and the server returns the gap from the database, then resumes live delivery — so a missed fan-out is repaired by a read, never lost. Open-time loads fetch recent history by id range (cursor pagination, see that lesson), not by page number.',
        'Per-channel ordering is defined by the ids assigned at write; clients sort by id and de-duplicate, so an out-of-order or repeated delivery is harmless. Thundering herds after a gateway restart use jittered reconnects (see the WebSockets lesson). Figures here are model outputs for sizing, not any company’s internals.',
      ],
      changes: [{ text: 'Resume with “since last id” → server returns the gap', tone: 'good' }, { text: 'Sort by id; de-duplicate', tone: 'good' }],
      scene: { nodes: [sender({ name: 'Reconnecting client', tag: pill('since id 8841', 'refresh') }), gw(), api(), dbN({ tag: pill('returns the gap', 'check', 'good') })], links: [link('sender', 'gw'), link('gw', 'api'), link('api', 'db')], flows: [flow(['sender', 'gw', 'api', 'db'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Write durably, deliver fast, defer the rest',
      body: [
        'A message is a <b>durable, ordered write</b> (sharded by channel/workspace), a <b>fan-out</b> through the channel’s owning server to online members (cost = msgs/s × online members), and <b>queued side effects</b>. Incidental events — typing, read state — scale with audience and must be throttled and delivered only to viewers.',
        'Repair missed delivery with “since last id” reads, order by per-channel ids, and keep the hot path short: every hop costs ~10 ms.',
      ],
      scene: { nodes: [sender(), gw(), api(), dbN(), chan(), members()], links: [link('sender', 'gw'), link('gw', 'api'), link('api', 'db'), link('api', 'chan'), link('chan', 'members')], flows: [flow(['sender', 'gw', 'api', 'chan', 'members'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
