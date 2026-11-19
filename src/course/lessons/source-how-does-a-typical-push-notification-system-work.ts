import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const events = (extra: Partial<SceneNode> = {}) => box('events', -16, 0, 'Events / campaigns', 'green', 'bolt', { size: [1.3, 1.3], height: 26, ...extra });
const notif = (extra: Partial<SceneNode> = {}) => box('notif', -9, 0, 'Notification service', 'blue', 'server', { size: [1.4, 1.4], height: 30, ...extra });
const queue = (extra: Partial<SceneNode> = {}) => box('queue', -2, 0, 'Send queue', 'yellow', 'queue', { size: [1.6, 1], height: 14, ...extra });
const workers = (extra: Partial<SceneNode> = {}) => box('workers', 5, 0, 'Sender workers', 'orange', 'cpu', { size: [1.3, 1.3], height: 28, ...extra });
const gw = (extra: Partial<SceneNode> = {}) => box('gw', 12, 0, 'APNs / FCM', 'purple', 'globe', { size: [1.4, 1.4], height: 30, ...extra });
const devices = (extra: Partial<SceneNode> = {}) => crowd('devices', 19, 0, 10, 'devices', extra);

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`);
const fmtT = (s: number): string => (s >= 7200 ? `${(s / 3600).toFixed(1)} h` : s >= 120 ? `${(s / 60).toFixed(1)} min` : s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`);

const lesson: Lesson = {
  slug: 'source-how-does-a-typical-push-notification-system-work',
  title: 'Push Notification Systems',
  blurb: 'Device tokens, platform gateways, fan-out queues, preferences and deduplication: how one event becomes millions of delivered notifications, and what bounds the time it takes.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'time', label: 'Time to send to everyone', icon: 'clock' },
    { key: 'rate', label: 'Aggregate send rate', icon: 'activity' },
    { key: 'stale', label: 'Sends to dead tokens (wasted)', icon: 'alert' },
    { key: 'dups', label: 'Duplicate sends (at-least-once)', icon: 'layers' },
  ],
  goals: [
    { text: 'What happens between an event and a buzzing phone', step: 1 },
    { text: 'Device tokens and the platform gateways (APNs/FCM)', step: 2 },
    { text: 'Fan-out through queues and why send rate bounds delivery time', step: 3 },
    { text: 'Preferences, deduplication, rate limiting and quiet hours', step: 4 },
    { text: 'Retries, invalid tokens and feedback', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rcpt', label: 'Recipients of one campaign', min: 1000, max: 200000000, step: 1000, default: 10000000, unit: '', description: 'Devices that should receive the message.' },
      { key: 'workers', label: 'Sender workers', min: 1, max: 5000, step: 1, default: 200, unit: '', description: 'Parallel processes calling the gateways.' },
      { key: 'per', label: 'Sends per worker per second', min: 100, max: 20000, step: 100, default: 2000, unit: '/s', description: 'Throughput of one worker over persistent HTTP/2 connections.' },
      { key: 'stale', label: 'Registered tokens that are dead', min: 0, max: 40, step: 1, default: 5, unit: '%', description: 'Share of stored tokens whose app was uninstalled or token rotated.' },
      { key: 'fail', label: 'Sends needing a retry', min: 0, max: 10, step: 0.1, default: 1, unit: '%', description: 'Share of sends that time out or fail transiently and are retried.' },
    ],
    calculate: (input, step) => {
      const rcpt = Math.max(1, input.rcpt ?? 1e7);
      const w = Math.max(1, Math.round(input.workers ?? 200));
      const per = Math.max(1, input.per ?? 2000);
      const stale = Math.min(1, Math.max(0, (input.stale ?? 5) / 100));
      const fail = Math.min(1, Math.max(0, (input.fail ?? 1) / 100));
      const rate = w * per;
      const time = rcpt / rate;
      // A retry after an ambiguous failure can deliver twice if the first attempt had succeeded (assume half did).
      const dups = rcpt * fail * 0.5;
      return {
        time: step < 2 ? { v: '—' } : { v: fmtT(time), tone: time < 60 ? 'good' : time < 600 ? 'warn' : 'bad' },
        rate: step < 2 ? { v: '—' } : { v: `${fmtN(rate)}/s` },
        stale: step < 4 ? { v: '—' } : { v: `${fmtN(rcpt * stale)} of ${fmtN(rcpt)}`, tone: stale < 0.03 ? 'good' : stale < 0.1 ? 'warn' : 'bad' },
        dups: step < 4 ? { v: '—' } : { v: `~${fmtN(dups)} unless de-duplicated`, tone: dups < 1000 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Pipeline',
      kind: 'insight',
      title: 'From event to a buzzing phone',
      body: [
        'Something happens — a message arrives, a delivery moves, a marketing campaign fires — and an <b>event</b> reaches the notification service. It decides <i>who</i> should be told, <i>whether they want to be</i>, <i>what</i> to say, and hands each notification to the platform: <b>APNs</b> for Apple devices, <b>FCM</b> for Android and web. The platform, not you, holds the persistent connection to the phone and wakes the app or shows the alert.',
        'That last point drives the design: you cannot push directly to a phone. You push to Apple or Google, who deliver on a channel the OS keeps open at almost no battery cost. Everything before the gateway is your problem — mostly volume, correctness and not annoying people.',
      ],
      scene: { nodes: [events(), notif(), queue(), workers(), gw(), devices()], links: [link('events', 'notif'), link('notif', 'queue'), link('queue', 'workers'), link('workers', 'gw'), link('gw', 'devices')], flows: [flow(['events', 'notif', 'queue', 'workers', 'gw', 'devices'], { rate: 2 })] },
    },
    {
      short: 'Tokens',
      kind: 'technique',
      title: 'Device tokens and the gateways',
      body: [
        'When the app starts it asks the OS for a <b>device token</b> (an opaque id from APNs or FCM for this app on this device) and registers it with your backend, keyed by user and device. A user has several; tokens <b>change</b> (reinstall, restore, OS decision) and must be refreshed on every launch.',
        'To notify, you send the gateway a request with the token and payload (small — ~4 KB) over a persistent <b>HTTP/2</b> connection with authentication. The gateway queues it, delivers when the device is reachable and, for undeliverable ones, may <b>coalesce or drop</b> by TTL and collapse key. Delivery is <b>best-effort</b>: there is no guarantee of delivery or order, so never carry critical data only in a push.',
      ],
      changes: [{ text: 'Token = app + device + gateway identity', tone: 'info' }, { text: 'Best-effort: TTL, collapse keys, no ordering guarantee', tone: 'info' }],
      concepts: [{ term: 'Device token', def: 'An opaque identifier issued by APNs or FCM that addresses one app installation on one device.' }],
      scene: { nodes: [box('app', -10, 0, 'App on phone', 'green', 'user', { size: [1.2, 1.2], height: 24, tag: pill('registers token', 'hash') }), notif({ name: 'Token registry' }), db('tok', 2, 7, 'user → tokens', { size: [1.3, 1.3] }), gw()], links: [link('app', 'notif'), link('notif', 'tok'), link('notif', 'gw')], flows: [flow(['app', 'notif', 'tok'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Fan-out',
      kind: 'technique',
      title: 'Fan-out: one campaign becomes ten million sends',
      body: [
        'A campaign to 10 million users is expanded into per-recipient send tasks, written to a <b>durable queue</b> (partitioned by user or token) and consumed by a pool of <b>sender workers</b>. Workers hold long-lived connections to the gateways and send in parallel; autoscaling follows queue depth. The queue gives <b>backpressure</b>, retries and a place to throttle.',
        'Delivery time is arithmetic: <code>recipients ÷ (workers × sends/s per worker)</code> = 10,000,000 ÷ (200 × 2,000) = <b>25 s</b> to hand everything to the gateways (400,000 sends/s). Halve the workers and it doubles. Mind <b>gateway limits</b> and your own downstream (personalisation lookups, the database): the slowest stage sets the time, and a thundering herd of “app opened” traffic follows seconds after the push lands.',
      ],
      changes: [{ text: '10M ÷ (200 × 2,000/s) = 25 s', tone: 'info' }, { text: 'Queue gives backpressure, retries, throttling', tone: 'good' }],
      scene: { nodes: [notif({ tag: pill('expand 10M recipients', 'layers') }), queue({ tag: pill('partitioned by user', 'hash') }), workers({ tag: pill('200 × 2,000/s', 'gauge') }), gw()], links: [link('notif', 'queue'), link('queue', 'workers'), link('workers', 'gw')], flows: [flow(['notif', 'queue', 'workers', 'gw'], { kind: 'write', rate: 3 })] },
    },
    {
      short: 'Policy',
      kind: 'technique',
      title: 'Preferences, dedupe, limits and quiet hours',
      body: [
        'Before a send is queued, <b>policy</b> runs: does this user allow this category (a preference store checked per recipient)? Are they in <b>quiet hours</b> in their own time zone? Have they already received this event, or too many today — a <b>per-user rate limit</b> and <b>de-duplication key</b> (event id + user) stop floods? Should several events be <b>collapsed</b> into one (“5 new messages”)?',
        'Template and localise at send time; attach deep-link data; choose <b>priority</b> (a delivery arrival is high priority, a promo is not). Respect unsubscribes instantly and legally. A notification system’s quality is mostly this layer: the cheapest notification is the one you decide <i>not</i> to send.',
      ],
      changes: [{ text: 'Preferences · quiet hours · rate limits', tone: 'good' }, { text: 'Dedupe key = event + user', tone: 'good' }, { text: 'Collapse bursts into one', tone: 'good' }],
      scene: { nodes: [notif({ tag: pill('allowed? quiet hours? duplicate?', 'shield') }), box('pref', -9, 7, 'Preferences', 'teal', 'list', { size: [1.2, 1.2], height: 20 }), box('rl', -2, 7, 'Rate limit / dedupe', 'red', 'lock', { size: [1.2, 1.2], height: 20 }), queue()], links: [link('notif', 'pref', { arrow: 'both' }), link('notif', 'rl', { arrow: 'both' }), link('notif', 'queue')], flows: [flow(['notif', 'queue'], { rate: 1.5 })] },
    },
    {
      short: 'Failures',
      kind: 'problem',
      title: 'Retries, dead tokens and duplicates',
      body: [
        '<b>Transient failures</b> (timeouts, gateway 5xx) are retried with exponential backoff and jitter; a retry after an ambiguous failure can <b>duplicate</b> a notification — about 50,000 per 10 million at a 1% retry rate — so de-duplicate by notification id (or use the gateway’s collapse key). <b>Permanent failures</b> are more interesting: the gateway answers “unregistered / invalid token” for uninstalled apps, and you must <b>delete those tokens</b> immediately.',
        'Otherwise, with 5% stale tokens you waste 500,000 sends per campaign, hammer the gateway with invalid requests and risk throttling. Track delivery and open rates per campaign as feedback; use silent pushes and app-open refreshes to keep tokens current. Figures here are model outputs for sizing, not any platform’s limits.',
      ],
      changes: [{ text: 'Retry with backoff + jitter; dedupe by notification id', tone: 'good' }, { text: 'Invalid token response → delete the token now', tone: 'good' }],
      scene: { nodes: [workers(), gw({ tag: pill('Unregistered', 'alert', 'warn') }), db('tok', 5, 7, 'Token registry', { size: [1.3, 1.3], tag: pill('prune dead tokens', 'check', 'good') })], links: [link('workers', 'gw', { arrow: 'both' }), link('workers', 'tok', { style: 'dashed' })], flows: [flow(['workers', 'gw'], { rate: 1.5, back: true }), flow(['gw', 'workers', 'tok'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Realtime',
      kind: 'tradeoff',
      title: 'Push versus in-app real-time',
      body: [
        'When the app is open, an in-app channel (WebSocket or SSE) delivers instantly with no gateway involved; push exists for when it is not. Systems typically do both: <b>deliver in-app if the user is online, fall back to push after a short delay</b> if the message is unread — avoiding a push for something already seen on another device.',
        'Remember the limits: push payloads are small, delivery is best-effort and can be delayed for hours by Doze or low-power modes, and users turn notifications off when they’re noisy. Treat push as a <i>nudge to open the app</i> and store the real data on the server.',
      ],
      scene: { nodes: [notif(), box('ws', 5, -5, 'WebSocket (app open)', 'green', 'bolt', { size: [1.3, 1.3], height: 24, tag: pill('instant', 'check', 'good') }), gw({ tag: pill('app closed → push', 'globe') })], links: [link('notif', 'ws'), link('notif', 'gw', { style: 'dashed' })], flows: [flow(['notif', 'ws'], { rate: 2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Decide whom to tell, then fan out through a queue',
      body: [
        'An event is filtered by <b>preferences, dedupe and rate limits</b>, expanded into per-device tasks on a <b>durable queue</b>, sent by a worker pool over persistent connections to <b>APNs/FCM</b>, which deliver best-effort. Time to send ≈ <code>recipients ÷ (workers × sends/s)</code>.',
        'Prune dead tokens on feedback, retry with backoff and de-duplicate, deliver in-app when online, and treat push as a nudge — never the only copy of important data.',
      ],
      scene: { nodes: [events(), notif(), queue(), workers(), gw(), devices()], links: [link('events', 'notif'), link('notif', 'queue'), link('queue', 'workers'), link('workers', 'gw'), link('gw', 'devices')], flows: [flow(['events', 'notif', 'queue', 'workers', 'gw', 'devices'], { rate: 2 })] },
    },
  ],
};

export default lesson;
