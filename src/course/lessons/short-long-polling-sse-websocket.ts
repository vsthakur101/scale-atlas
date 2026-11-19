import type { Lesson } from '../../types';
import { box, crowd, flow, link, pill, you } from '../kit';

const lesson: Lesson = {
  slug: 'source-short-long-polling-sse-websocket',
  title: 'Polling, SSE & WebSockets',
  blurb: 'Choose a push strategy by balancing freshness, connection cost, and communication direction.',
  minutes: 9,
  level: 'Beginner',
  metrics: [
    { key: 'fresh', label: 'Freshness', icon: 'timer' },
    { key: 'req', label: 'Requests/min', icon: 'refresh' },
    { key: 'conn', label: 'Connections', icon: 'layers' },
    { key: 'dir', label: 'Direction', icon: 'route' },
  ],
  goals: [
    { text: 'Why short polling wastes work when nothing changes', step: 2 },
    { text: 'How long polling reduces empty responses', step: 3 },
    { text: 'When SSE or WebSockets fit', step: 5 },
  ],
  legend: ['request', 'response', 'hit', 'heavy'],
  steps: [
    {
      short: 'Stale screen',
      kind: 'problem',
      title: 'The screen is only as fresh as its next request',
      body: [
        'A delivery tracker shows the courier’s position. The browser does not receive updates by itself, so it asks the server every 30 seconds.',
        'That creates a choice: ask often and spend requests, or ask rarely and show stale information. Most polls find nothing new.',
      ],
      changes: [{ text: 'Freshness: up to 30 s old', tone: 'bad' }],
      concepts: [{ term: 'Polling', def: 'A client repeatedly asks a server whether new data is available.' }],
      scene: {
        nodes: [you('phone', -10, 1, { label: pill('tracking page', 'wifi') }), box('api', 0, 0, 'Tracking API', 'blue', 'server'), box('store', 9, 0, 'Location store', 'purple', 'db')],
        links: [link('phone', 'api', { arrow: 'both' }), link('api', 'store', { arrow: 'both' })],
        flows: [flow(['phone', 'api'], { back: true, rate: 0.4 }), flow(['api', 'store'], { back: true, rate: 0.4 })],
        metrics: { fresh: '0–30 s', req: '2/min', conn: '0', dir: 'client → server' },
      },
    },
    {
      short: 'Short poll',
      kind: 'technique',
      title: 'Short polling asks on a fixed clock',
      body: [
        'With a 5-second interval, the page feels responsive, but every browser sends twelve requests per minute even when the courier has not moved.',
        'At 100,000 viewers that is 20,000 requests per second before a single location update is delivered. The server spends capacity answering “nothing changed.”',
      ],
      changes: [{ text: '20k empty req/s', tone: 'bad' }],
      scene: {
        nodes: [crowd('users', -10, 1, 16, '100k viewers'), box('api', 0, 0, 'Tracking API', 'blue', 'server', { load: 75, tag: pill('20k req/s', 'alert', 'bad') }), box('store', 9, 0, 'Location store', 'purple', 'db')],
        links: [link('users', 'api', { arrow: 'end' }), link('api', 'store', { arrow: 'both' })],
        flows: [flow(['users', 'api'], { rate: 5 }), flow(['api', 'store'], { rate: 5 })],
        metrics: { fresh: '0–5 s', req: '12/min', conn: '0', dir: 'client → server' },
      },
    },
    {
      short: 'Long poll',
      kind: 'technique',
      title: 'Long polling waits for useful work',
      body: [
        'The client opens a request and the server holds it for up to 25 seconds. If a location event arrives, the server responds immediately; otherwise it returns an empty response at the timeout.',
        'The browser reconnects after every response. This removes most empty round trips, but every waiting request occupies a connection and a little memory somewhere in the stack.',
      ],
      note: { kind: 'tip', text: 'Long polling is a compatibility bridge, not a promise of zero reconnects. Timeouts and proxies still end the request.' },
      concepts: [{ term: 'Long polling', def: 'A request held open until data is available or a server timeout expires.' }],
      scene: {
        nodes: [you('phone', -10, 1, { label: pill('request held', 'clock') }), box('api', 0, 0, 'Tracking API', 'blue', 'server', { tag: pill('wait ≤ 25 s', 'timer') }), box('events', 9, 0, 'Event stream', 'orange', 'bolt')],
        links: [link('phone', 'api', { arrow: 'both' }), link('events', 'api', { arrow: 'end', style: 'dashed' })],
        flows: [flow(['phone', 'api'], { back: true, rate: 0.5 }), flow(['events', 'api', 'phone'], { kind: 'hit', rate: 0.6 })],
        metrics: { fresh: 'near-live', req: '≈0.2/min', conn: '1 waiting', dir: 'client → server' },
      },
    },
    {
      short: 'SSE',
      kind: 'technique',
      title: 'Server-Sent Events make one-way push simple',
      body: [
        '<b>SSE</b> keeps one HTTP response open and sends text events as they happen. Browsers automatically reconnect, and the stream works naturally with proxies and ordinary HTTP observability.',
        'It is a strong fit for dashboards, notifications, and progress updates where the browser sends commands separately and only the server needs a continuous channel.',
      ],
      concepts: [{ term: 'Server-Sent Events', def: 'A browser-friendly HTTP stream for server-to-client events with automatic reconnect.' }],
      scene: {
        nodes: [you('phone', -10, 1, { label: pill('EventSource', 'wifi') }), box('api', 0, 0, 'SSE endpoint', 'teal', 'server', { tag: pill('text/event-stream', 'globe') }), box('events', 9, 0, 'Event bus', 'orange', 'bolt')],
        links: [link('phone', 'api', { arrow: 'end' }), link('events', 'api', { arrow: 'end' })],
        flows: [flow(['events', 'api', 'phone'], { kind: 'hit', rate: 1.5, speed: 0.7 })],
        metrics: { fresh: '<1 s', req: '1 connect', conn: '1 stream', dir: 'server → client' },
      },
    },
    {
      short: 'WebSocket',
      kind: 'technique',
      title: 'WebSockets open a two-way conversation',
      body: [
        'A WebSocket starts as HTTP, then upgrades into a long-lived, bidirectional connection. Both sides can send small messages whenever they need to.',
        'That makes it useful for chat, multiplayer games, and collaborative editing. It also makes connection counts, heartbeats, reconnects, and load-balancer routing part of the design.',
      ],
      concepts: [{ term: 'WebSocket', def: 'A persistent, bidirectional connection that lets client and server send messages independently.' }],
      scene: {
        nodes: [you('phone', -10, 1, { label: pill('WebSocket', 'wifi') }), box('gateway', 0, 0, 'Connection gateway', 'orange', 'route', { tag: pill('sticky route', 'link') }), box('chat', 9, 0, 'Chat service', 'blue', 'server')],
        links: [link('phone', 'gateway', { arrow: 'both' }), link('gateway', 'chat', { arrow: 'both' })],
        flows: [flow(['phone', 'gateway', 'chat'], { back: true, rate: 1.5 }), flow(['chat', 'gateway', 'phone'], { kind: 'hit', rate: 1.5 })],
        metrics: { fresh: '<100 ms', req: 'event-driven', conn: '1 socket', dir: 'both ways' },
      },
    },
    {
      short: 'Choose',
      kind: 'tradeoff',
      title: 'Choose the smallest channel that fits',
      body: [
        'Use short polling when simplicity matters and a few seconds of staleness is acceptable. Use long polling when you need broad HTTP compatibility but want fewer empty responses.',
        'Use SSE for server-to-browser streams. Use WebSockets when both sides need low-latency messages. At scale, plan connection ownership, heartbeats, reconnect storms, and how events reach the right gateway.',
      ],
      note: { kind: 'key', text: 'The transport is only half the design. Delivery semantics, reconnect behavior, and fan-out determine whether users actually see every update.' },
      scene: {
        nodes: [you('client', -11, 1, { label: pill('client', 'wifi') }), box('choice', 0, 0, 'Push gateway', 'green', 'route', { tag: pill('SSE or WebSocket', 'check', 'good') }), box('events', 9, 0, 'Event bus', 'orange', 'bolt')],
        links: [link('client', 'choice', { arrow: 'both' }), link('events', 'choice', { arrow: 'end' })],
        flows: [flow(['events', 'choice', 'client'], { kind: 'hit', rate: 1.2 })],
        metrics: { fresh: '<1 s', req: 'event-driven', conn: '1', dir: 'fit to need' },
      },
    },
  ],
};

export default lesson;
