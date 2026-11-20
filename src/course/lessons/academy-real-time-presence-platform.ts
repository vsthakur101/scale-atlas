import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const clients = (extra: Partial<SceneNode> = {}) => crowd('clients', -18, 0, 12, 'online clients (heartbeat)', extra);
const edge = (extra: Partial<SceneNode> = {}) => box('edge', -9, 0, 'Connection gateways', 'teal', 'wifi', { size: [1.5, 1.5], height: 26, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', 1, -7, 'Presence store (key + TTL)', { size: [1.6, 1.6], ...extra });
const bus = (extra: Partial<SceneNode> = {}) => box('bus', 1, 7, 'Pub/sub: presence changes', 'purple', 'queue', { size: [1.5, 1.5], height: 24, ...extra });
const watchers = (extra: Partial<SceneNode> = {}) => crowd('watchers', 13, 0, 8, 'friends viewing the list', extra);
const deb = (extra: Partial<SceneNode> = {}) => box('deb', 7, 0, 'Debounce + batch', 'orange', 'filter', { size: [1.3, 1.3], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'academy-real-time-presence-platform',
  title: 'Presence Systems: Heartbeats, TTLs and the Fan-Out Problem',
  blurb: 'Showing who is online is a soft-state problem: heartbeats renew a key with a TTL, absence means offline — and the expensive part is telling everyone who cares. Quantify heartbeats, naive fan-out, and the three levers that cut it by ~50×.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'hb', label: 'Heartbeat writes per second', icon: 'activity' },
    { key: 'naive', label: 'Naive fan-out: pushes per second', icon: 'users' },
    { key: 'sub', label: 'Only to friends watching now', icon: 'filter' },
    { key: 'deb', label: 'After debouncing flaps', icon: 'timer' },
    { key: 'det', label: 'Worst-case time to notice a crash', icon: 'clock' },
  ],
  goals: [
    { text: 'Presence is soft state, not a database field', step: 1 },
    { text: 'Heartbeats, TTLs and offline detection', step: 2 },
    { text: 'The fan-out explosion', step: 3 },
    { text: 'Subscriptions, debounce and batching', step: 4 },
    { text: 'Accuracy vs cost, and failure modes', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'users', label: 'Online users', min: 10000, max: 1000000000, step: 10000, default: 20000000, unit: '', description: 'Clients connected at a moment.' },
      { key: 'hb', label: 'Heartbeat interval', min: 1, max: 300, step: 1, default: 30, unit: ' s', description: 'How often a client renews its presence.' },
      { key: 'mult', label: 'Timeout = heartbeats missed', min: 1.5, max: 10, step: 0.5, default: 3, unit: '×', description: 'Missed intervals before declaring offline.' },
      { key: 'chg', label: 'Status changes per user per hour', min: 0.1, max: 60, step: 0.1, default: 4, unit: '', description: 'Online/away/offline transitions, including reconnects.' },
      { key: 'fr', label: 'Contacts who could see each user', min: 1, max: 5000, step: 1, default: 200, unit: '', description: 'Friends or teammates with the user in their list.' },
      { key: 'watch', label: 'Share of contacts actively viewing the list', min: 0.1, max: 100, step: 0.1, default: 5, unit: '%', description: 'Contacts with the app open and the presence UI visible.' },
      { key: 'flap', label: 'Changes removed by debouncing', min: 0, max: 95, step: 1, default: 60, unit: '%', description: 'Short flaps (reconnects, brief offline) suppressed by a settle window.' },
    ],
    calculate: (input, step) => {
      const users = Math.max(1, input.users ?? 2e7);
      const hb = Math.max(1, input.hb ?? 30);
      const mult = Math.max(1, input.mult ?? 3);
      const chg = Math.max(0, input.chg ?? 4);
      const fr = Math.max(0, input.fr ?? 200);
      const watch = Math.min(1, Math.max(0, (input.watch ?? 5) / 100));
      const flap = Math.min(0.99, Math.max(0, (input.flap ?? 60) / 100));
      const changes = (users * chg) / 3600;
      const naive = changes * fr;
      const sub = naive * watch;
      const deb = sub * (1 - flap);
      return {
        hb: step < 2 ? { v: '—' } : { v: `${fmtN(users / hb)}/s (${fmtN(users)} ÷ ${hb} s)`, tone: users / hb < 1e6 ? 'good' : 'warn' },
        naive: step < 3 ? { v: '—' } : { v: `${fmtN(naive)}/s (${fmtN(changes)} changes/s × ${fr})`, tone: naive < 1e6 ? 'good' : 'bad' },
        sub: step < 4 ? { v: '—' } : { v: `${fmtN(sub)}/s (${(watch * 100).toFixed(0)}% watching)`, tone: sub < 1e6 ? 'good' : 'warn' },
        deb: step < 4 ? { v: '—' } : { v: `${fmtN(deb)}/s (${(naive / Math.max(1, deb)).toFixed(0)}× less than naive)`, tone: 'good' },
        det: step < 2 ? { v: '—' } : { v: `${(hb * mult).toFixed(0)} s (${mult}× ${hb} s heartbeats)`, tone: hb * mult <= 120 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Soft state',
      kind: 'insight',
      title: 'Presence is soft state: true only while it is renewed',
      body: [
        'The green dot next to a friend’s name looks like a boolean column, but a database row <code>online = true</code> is the wrong model: a client that crashes, loses signal or has its battery die <b>can’t write “offline”</b>, so the row would stay true forever. Presence is <b>soft state</b>: a claim that expires unless renewed. The client says “I’m here” periodically (a <b>heartbeat</b>); if the renewals stop, the server concludes the client is gone.',
        'Two separate problems follow. <b>Detection</b>: know who is online, cheaply and promptly — heartbeats against a TTL store. <b>Distribution</b>: tell the right people when it changes — a fan-out problem that dwarfs the detection cost. A messenger with 20 million concurrent users illustrates the numbers below (assumed: 200 contacts per user, 4 status changes per user per hour).',
      ],
      scene: { nodes: [clients(), edge(), store({ tag: pill('key expires unless renewed', 'timer') })], links: [link('clients', 'edge'), link('edge', 'store')], flows: [flow(['clients', 'edge', 'store'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Heartbeat',
      kind: 'technique',
      title: 'Heartbeats, TTLs and offline detection',
      body: [
        'Each client sends a heartbeat every <b>T seconds</b> over its existing connection (or the connection itself proves liveness — see the Push Notifications lesson on keepalives). The gateway renews a key in a fast in-memory store: <code>SET presence:{user} {device, status, gateway} EX 90</code> (Redis-style TTL). <b>Offline is the key expiring</b> — no write needed — and an explicit <b>clean disconnect</b> deletes the key immediately for fast, accurate offline on normal logout. Multiple devices per user need per-device keys and an aggregate: online if <i>any</i> device is.',
        'Costs: 20 million users ÷ 30 s = <b>666,667 heartbeat writes/s</b> — modest sharded across a cache cluster, and cheaper if the gateway renews in batches or only refreshes the store at a lower rate than the client heartbeat (the gateway knows the socket is open). The <b>timeout</b> trades accuracy against false offline: 3 missed heartbeats (90 s) tolerates packet loss and brief signal drops, but a crashed client shows online for up to <b>90 s</b>; 1.5× is quicker but flaps on poor networks. Detecting server-side with TCP close or gateway-failure events gives immediate offline when it’s known.',
      ],
      changes: [{ text: 'Heartbeat renews a TTL key; expiry = offline', tone: 'good' }, { text: '20M ÷ 30 s = 667k writes/s', tone: 'info' }, { text: 'Timeout 3 × 30 s: crash shows online up to 90 s', tone: 'info' }],
      concepts: [{ term: 'Soft state', def: 'Information that is valid only while periodically refreshed, and disappears on its own if the refreshes stop.' }],
      scene: { nodes: [clients({ tag: pill('ping every 30 s', 'timer') }), edge(), store({ tag: pill('TTL 90 s', 'clock') })], links: [link('clients', 'edge'), link('edge', 'store')], flows: [flow(['clients', 'edge', 'store'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Fan-out',
      kind: 'problem',
      title: 'The fan-out explosion',
      body: [
        'Everyone interested should see changes quickly. Naively, <b>every status change is pushed to every contact</b>. With 20 million online users each changing status 4 times an hour (going idle, switching device, a mobile reconnect) that is <b>22,222 changes/s</b>, and each goes to 200 contacts: <b>4.4 million pushes/s</b> — an order of magnitude more traffic than the heartbeats that caused it, and most of it wasted: nearly all contacts aren’t looking at the list, many are themselves offline, and half the changes are meaningless flaps.',
        'It gets worse with <b>celebrity-style accounts</b> (a user with 100,000 contacts changes status and triggers 100,000 pushes — see the Social Feed lesson for the same skew), <b>group presence</b> (a 10,000-member channel’s “who’s online” list), and <b>reconnect storms</b> (a regional outage flips millions of users offline then online again, each transition fanned out). The design question is therefore not “how to store presence” but “how to avoid sending what nobody will use”.',
      ],
      changes: [{ text: '22,222 changes/s × 200 contacts = 4.4M pushes/s', tone: 'bad' }, { text: 'Most go to contacts not looking, or are flaps', tone: 'bad' }],
      scene: { nodes: [store(), bus({ state: 'hot', tag: pill('4.4M pushes/s', 'alert', 'bad') }), watchers({ tag: pill('most not watching', 'users') })], links: [link('store', 'bus'), link('bus', 'watchers')], flows: [flow(['store', 'bus', 'watchers'], { kind: 'heavy', rate: 4 })] },
    },
    {
      short: 'Levers',
      kind: 'technique',
      title: 'Subscribe, debounce and batch',
      body: [
        '<b>1. Subscribe, don’t broadcast.</b> Only send a change to clients that are <i>currently viewing</i> that user’s presence: when a client opens a contact list or chat it <b>subscribes</b> to those users’ channels (a pub/sub topic per user, or a per-gateway interest set), and unsubscribes when it closes. If 5% of contacts are watching: 4.4M → <b>222,000/s</b>, a 20× cut. Newly opened views fetch current state with a bulk read (“who among these 50 is online?” — one batched lookup against the store) instead of waiting for pushes.',
        '<b>2. Debounce flaps.</b> Hold a transition for a short <b>settle window</b> (say 5–10 s) before publishing: an offline-then-online reconnect inside the window publishes nothing, away→active twice publishes once. Suppressing 60% of changes: 222,000 → <b>89,000/s</b>. <b>3. Batch and coalesce.</b> Gateways merge updates for the same recipient into one frame every 0.5–1 s, send the <i>latest</i> state per user rather than every intermediate one, and cap list updates for huge groups (approximate “234 online” counts, or sampling). Together the levers take 4.4M pushes/s to <b>~89,000/s — 50× less</b> — and the delivery work becomes proportional to what people actually look at.',
      ],
      changes: [{ text: 'Subscribe to visible contacts: ×5% → 222k/s', tone: 'good' }, { text: 'Debounce 60% of flaps → 89k/s (50× below naive)', tone: 'good' }, { text: 'Batch/coalesce; bulk-read on view open; approximate counts for big groups', tone: 'good' }],
      scene: { nodes: [store({ tag: pill('change events', 'list') }), deb({ tag: pill('settle 10 s: drop flaps', 'filter', 'good') }), bus({ tag: pill('only subscribed topics', 'queue', 'good') }), watchers({ tag: pill('viewing the list', 'users', 'good') })], links: [link('store', 'deb'), link('deb', 'bus'), link('bus', 'watchers')], flows: [flow(['store', 'deb', 'bus', 'watchers'], { rate: 1.6 })] },
    },
    {
      short: 'Tradeoffs',
      kind: 'tradeoff',
      title: 'Accuracy vs cost, and failure modes',
      body: [
        'Presence is <b>eventually consistent by design</b>: a lag of a few seconds is acceptable and the cheapest levers (longer debounce, coarser heartbeats, batching) buy cost at the price of freshness. Decide <b>per use case</b>: a messenger’s dot can be 30 s stale; a customer-support routing system that assigns chats to “available” agents needs tighter detection and an authoritative check at assignment time; a multiplayer game lobby may need sub-second. Offer <b>coarse states</b> (online / away / offline, “last seen recently” rather than exact timestamps) — fewer transitions to publish and a privacy gain; let users <b>hide presence</b> (invisible mode must suppress publication, not just display).',
        'Failure modes: <b>gateway crash</b> — thousands of users’ keys remain until TTL unless the registry maps users → gateway and expires a dead gateway’s users at once; <b>store failover</b> that loses keys (everyone appears offline until heartbeats re-establish presence — pace the repopulation to avoid a storm); <b>clock skew</b> in TTL logic (use the store’s own expiry); <b>thundering herd</b> on region recovery (jittered reconnect backoff — see the Push Notifications lesson); and <b>hot users/channels</b> (cap fan-out, sample). Monitor heartbeat rate, publish rate per subscriber, TTL-expiry rate and detection latency. Model figures use assumed rates and watch-shares.',
      ],
      changes: [{ text: 'Choose freshness per use case; coarse states; honour invisible mode', tone: 'info' }, { text: 'Gateway or store failure: expire by gateway, pace repopulation', tone: 'bad' }],
      scene: { nodes: [clients(), edge({ state: 'hot', tag: pill('gateway crash: keys linger to TTL', 'alert', 'warn') }), store({ tag: pill('user → gateway map', 'db', 'good') }), bus()], links: [link('clients', 'edge'), link('edge', 'store'), link('store', 'bus')], flows: [flow(['clients', 'edge', 'store'], { rate: 1.4 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Renew to stay online; send only what someone is watching',
      body: [
        'Presence is <b>soft state</b>: heartbeats renew a TTL key and expiry means offline (667k writes/s for 20M users at 30 s; crash noticed in up to 90 s). The real cost is <b>fan-out</b> — 4.4M pushes/s naive — cut ~50× by <b>subscribing to visible contacts</b>, <b>debouncing flaps</b> and <b>batching</b>.',
        'Pick freshness per use case and plan for gateway and store failures.',
      ],
      scene: { nodes: [clients(), edge(), store(), deb(), bus(), watchers()], links: [link('clients', 'edge'), link('edge', 'store'), link('store', 'deb'), link('deb', 'bus'), link('bus', 'watchers')], flows: [flow(['clients', 'edge', 'store', 'deb'], { kind: 'write', rate: 1.6 })] },
    },
  ],
};

export default lesson;
