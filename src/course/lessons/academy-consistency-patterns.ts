import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => box('user', -14, 0, 'User', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const primary = (extra: Partial<SceneNode> = {}) => db('primary', 4, -6, 'Primary', { size: [1.4, 1.4], tone: 'blue', ...extra });
const rep = (i: number, extra: Partial<SceneNode> = {}) => db(`r${i}`, 4, 0 + (i - 1) * 6, `Replica ${i}`, { size: [1.3, 1.3], tone: 'grey', ...extra });

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

const lesson: Lesson = {
  slug: 'academy-consistency-patterns',
  title: 'Consistency Patterns',
  blurb: 'From “eventual” to “strong”, and the practical middle: read-your-writes, monotonic reads and causal order — what each prevents and how it is implemented.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'stale', label: 'Chance a read is stale', icon: 'alert' },
    { key: 'window', label: 'Time until 99% fresh', icon: 'clock' },
    { key: 'primary', label: 'Reads sent to the primary (RYW)', icon: 'gauge' },
  ],
  goals: [
    { text: 'The spectrum from eventual to strong consistency', step: 1 },
    { text: 'Where stale reads come from and how likely they are', step: 2 },
    { text: 'Read-your-writes and how to implement it', step: 4 },
    { text: 'Monotonic reads and causal order', step: 6 },
    { text: 'How replicas converge: read repair and anti-entropy', step: 7 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'lag', label: 'Mean replication lag', min: 5, max: 5000, step: 5, default: 200, unit: ' ms', description: 'Average time for a write to reach a follower (modelled as exponentially distributed).' },
      { key: 'delay', label: 'Read this long after the write', min: 0, max: 5000, step: 5, default: 50, unit: ' ms', description: 'Time between the user’s write and their next read.' },
      { key: 'n', label: 'Replicas (primary + followers)', min: 2, max: 9, step: 1, default: 3, unit: '', description: 'Nodes a read may be routed to at random.' },
      { key: 'soon', label: 'Reads soon after own write', min: 0, max: 100, step: 1, default: 10, unit: '%', description: 'Share of reads that follow the same user’s write closely enough to need fresh data.' },
    ],
    calculate: (input, step) => {
      const lag = Math.max(1, input.lag ?? 200);
      const delay = Math.max(0, input.delay ?? 50);
      const n = Math.max(2, Math.round(input.n ?? 3));
      const soon = Math.min(1, Math.max(0, (input.soon ?? 10) / 100));
      // A read lands on a follower with probability (n−1)/n; that follower still lags with probability e^(−delay/lag).
      const stale = ((n - 1) / n) * Math.exp(-delay / lag);
      const window99 = lag * Math.log(100);
      // Read-your-writes: reads soon after a write go to the primary; others spread evenly.
      const primaryShare = soon + (1 - soon) / n;
      return {
        stale: step < 1 ? { v: '—' } : { v: `${(stale * 100).toFixed(stale < 0.1 ? 1 : 0)}%`, tone: stale < 0.01 ? 'good' : stale < 0.2 ? 'warn' : 'bad' },
        window: step < 1 ? { v: '—' } : { v: fmtMs(window99), tone: window99 < 500 ? 'good' : window99 < 2000 ? 'warn' : 'bad' },
        primary: step < 3 ? { v: '—' } : { v: `${(primaryShare * 100).toFixed(0)}% (vs ${(100 / n).toFixed(0)}% even)`, tone: primaryShare > 0.6 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Spectrum',
      kind: 'insight',
      title: 'Consistency is a menu, not a switch',
      body: [
        '<b>Strong</b> consistency: after a write completes, every read anywhere sees it. <b>Eventual</b> consistency: if writes stop, all replicas converge — eventually, with no promise about when or what you see in between. Most systems sit in between, offering <b>specific guarantees</b> that rule out the most confusing behaviour without paying for full strong consistency.',
        'Stronger guarantees cost latency (waiting for more replicas or the leader) and availability (refusing when replicas are unreachable). This lesson covers the useful middle: the anomalies users actually notice and the patterns that prevent each. The earlier Consistency Models lesson gives the formal ladder; this one is the practical toolkit.',
      ],
      scene: { nodes: [box('weak', -10, 0, 'Eventual', 'orange', 'clock', { size: [1.3, 1.3], height: 24 }), box('mid', 0, 0, 'Session guarantees', 'teal', 'shield', { size: [1.3, 1.3], height: 28 }), box('strong', 10, 0, 'Strong', 'blue', 'lock', { size: [1.3, 1.3], height: 32 })], links: [link('weak', 'mid', { arrow: 'end' }), link('mid', 'strong', { arrow: 'end' })], flows: [] },
    },
    {
      short: 'Lag',
      kind: 'problem',
      title: 'Where stale reads come from',
      body: [
        'With a primary and asynchronous followers, a write is acknowledged once the primary has it; followers apply it later. A read routed to a follower in that gap returns the <b>old value</b>. If lag is exponentially distributed with mean L, a follower is still behind <code>d</code> ms after the write with probability <code>e^(−d/L)</code>.',
        'With a 200 ms mean lag, three nodes and a read 50 ms after the write: a read hits a follower two times in three, and that follower is behind 78% of the time → about <b>52% stale</b>. Waiting <code>L × ln 100 ≈ 0.9 s</code> makes it 99% fresh. Averages hide tails: during a burst or a network blip lag can reach seconds.',
      ],
      changes: [{ text: 'P(stale) = (n−1)/n × e^(−delay/lag)', tone: 'info' }, { text: '200 ms lag, 50 ms delay, 3 nodes → ~52%', tone: 'bad' }],
      scene: { nodes: [user({ tag: pill('write, then read', 'refresh') }), primary({ tag: pill('has the write', 'check', 'good') }), rep(1, { tag: pill('still behind', 'clock', 'warn') }), rep(2, { tag: pill('still behind', 'clock', 'warn') })], links: [link('user', 'primary'), link('primary', 'r1', { style: 'dashed' }), link('primary', 'r2', { style: 'dashed' }), link('user', 'r1', { arrow: 'both' })], flows: [flow(['user', 'primary'], { kind: 'write', rate: 1 }), flow(['primary', 'r1'], { kind: 'write', rate: 0.5, speed: 0.4 }), flow(['r1', 'user'], { kind: 'fail', rate: 0.7 })] },
    },
    {
      short: 'Own writes',
      kind: 'problem',
      title: 'The user’s own update disappears',
      body: [
        'The most visible anomaly: a user posts a comment, the page reloads from a lagging replica, and the comment is <b>not there</b>. They post it again — now it exists twice — or assume the site is broken. Other users seeing the comment late is fine; the author not seeing it is not.',
        'The guarantee that fixes this is <b>read-your-writes</b> (read-after-write): a user always sees the effects of their own earlier writes. It does not promise anything about <i>other</i> people’s writes — which is why it is so cheap compared with strong consistency.',
      ],
      scene: { nodes: [user({ tag: pill('posted comment → gone', 'alert', 'bad') }), primary(), rep(1, { tag: pill('no comment yet', 'file', 'warn') })], links: [link('user', 'primary'), link('primary', 'r1', { style: 'dashed' }), link('r1', 'user')], flows: [flow(['user', 'primary'], { kind: 'write', rate: 1 }), flow(['r1', 'user'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'RYW',
      kind: 'technique',
      title: 'Implementing read-your-writes',
      body: [
        '<b>Route recent writers to the primary.</b> For a short window after a user writes (a few multiples of replication lag), serve that user’s reads from the primary or from a replica known to be caught up. Cheap and simple; costs primary load — the metric above shows the share rising from an even 33% to ~40% when 10% of reads follow a write.',
        '<b>Version tokens.</b> The write returns a log position (LSN, version, or timestamp). The client sends it back with reads; a replica serves the read only once it has applied that position, or the request waits or falls back to the primary. Exact, no guessing about lag — but requires clients or sessions to carry the token, and care across devices (a phone and a laptop don’t share one).',
      ],
      changes: [{ text: 'Window after write → primary (or caught-up replica)', tone: 'good' }, { text: 'Version token: replica must reach it, else wait or redirect', tone: 'good' }],
      scene: { nodes: [user({ tag: pill('token = LSN 4182', 'hash') }), primary({ tag: pill('serves recent writers', 'shield') }), rep(1, { tag: pill('at LSN 4175 → not yet', 'clock') })], links: [link('user', 'primary', { arrow: 'both' }), link('user', 'r1', { style: 'dashed' })], flows: [flow(['user', 'primary'], { rate: 1.4 }), flow(['primary', 'user'], { kind: 'response', rate: 1.2 })] },
    },
    {
      short: 'Time travel',
      kind: 'problem',
      title: 'Monotonic reads: not going backwards',
      body: [
        'A user refreshes twice. The first read hits an up-to-date replica and shows 5 comments; the second hits a lagging one and shows 3. Time seems to run backwards. Each read was individually “eventually consistent”, but the sequence is disorienting.',
        '<b>Monotonic reads</b> guarantee that once you have seen a version, you never see an older one. The common implementation is <b>stickiness</b>: always send the same user (or session) to the same replica — hash the user id. The cost: if that replica fails, the user moves to another and may briefly see older data.',
      ],
      changes: [{ text: 'Read 1: 5 comments · Read 2: 3 comments', tone: 'bad' }, { text: 'Same user → same replica', tone: 'good' }],
      scene: { nodes: [user({ tag: pill('refresh: 5 → 3', 'refresh', 'warn') }), rep(1, { tag: pill('current', 'check', 'good') }), rep(2, { tag: pill('behind', 'clock', 'warn') })], links: [link('user', 'r1'), link('user', 'r2')], flows: [flow(['user', 'r1'], { rate: 0.8 }), flow(['user', 'r2'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Causality',
      kind: 'problem',
      title: 'Causal order: answers before questions',
      body: [
        'Two writes land on different partitions: Alice asks “what’s the capital of France?”, Bob replies “Paris”. A reader whose view of the reply partition is ahead of the question partition sees the answer <b>without the question</b>. Each partition is consistent on its own; the cross-partition order is wrong.',
        '<b>Consistent-prefix</b> or <b>causal consistency</b> guarantees that if event A could have influenced B, everyone sees A before B. Implementations track dependencies (version vectors, “this reply depends on that post”) or route related writes to the same partition so their order is a single log. It is the strongest guarantee achievable without giving up availability under partitions.',
      ],
      changes: [{ text: 'Reply visible before the question', tone: 'bad' }, { text: 'Track dependencies or co-locate related writes', tone: 'good' }],
      scene: { nodes: [box('q', -2, -6, 'Question (partition 1)', 'blue', 'file', { size: [1.3, 1.3], height: 22, tag: pill('delayed', 'clock', 'warn') }), box('a', -2, 6, 'Answer (partition 2)', 'orange', 'file', { size: [1.3, 1.3], height: 22, tag: pill('arrived first', 'check') }), box('reader', 12, 0, 'Reader', 'green', 'user', { size: [1.2, 1.2], height: 24, tag: pill('sees answer only', 'alert', 'bad') })], links: [link('q', 'reader', { style: 'dashed' }), link('a', 'reader')], flows: [flow(['a', 'reader'], { rate: 1.2 })] },
    },
    {
      short: 'Converging',
      kind: 'technique',
      title: 'How replicas eventually agree',
      body: [
        '<b>Read repair</b>: a read contacts several replicas, notices one is stale, and writes the newest value back to it. <b>Anti-entropy</b>: a background process compares replicas (Merkle trees make this cheap) and syncs differences. <b>Hinted handoff</b>: writes for a down node are held and replayed. All three push replicas toward the same state; none promise <i>when</i>.',
        'When two replicas accepted conflicting writes, convergence needs a merge rule: <b>last-write-wins</b> by timestamp (simple, silently drops one write, vulnerable to clock skew), <b>version vectors</b> with application merge, or <b>CRDTs</b> whose merge is defined to be order-independent (counters, sets). Pick per data type — the merge rule is a business decision as much as a technical one.',
      ],
      changes: [{ text: 'Read repair · anti-entropy · hinted handoff', tone: 'info' }, { text: 'Merge: LWW · version vectors · CRDTs', tone: 'info' }],
      scene: { nodes: [rep(1, { tag: pill('v2', 'check') }), rep(2, { tag: pill('v1 → repaired', 'refresh') }), box('repair', 12, 0, 'Read repair', 'teal', 'refresh', { size: [1.2, 1.2], height: 24 })], links: [link('r1', 'repair'), link('repair', 'r2')], flows: [flow(['r1', 'repair', 'r2'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Buy only the guarantee you need',
      body: [
        'Between eventual and strong lie cheap, targeted guarantees: <b>read-your-writes</b> (route to primary / version token), <b>monotonic reads</b> (sticky replicas), <b>consistent prefix / causal</b> (co-locate or track dependencies). Convergence machinery — read repair, anti-entropy, merge rules — keeps replicas from drifting forever.',
        'Decide per feature: a profile edit needs read-your-writes, a feed can be eventual, a balance transfer needs strong. Measure replication lag percentiles, not just the mean; the stale-read chance follows the tail. Model figures here are illustrative.',
      ],
      scene: { nodes: [user(), primary(), rep(1), rep(2)], links: [link('user', 'primary'), link('primary', 'r1', { style: 'dashed' }), link('primary', 'r2', { style: 'dashed' })], flows: [flow(['user', 'primary'], { kind: 'write', rate: 1 })] },
    },
  ],
};

export default lesson;
