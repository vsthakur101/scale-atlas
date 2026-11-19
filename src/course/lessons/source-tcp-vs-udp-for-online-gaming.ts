import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const player = (extra: Partial<SceneNode> = {}) => box('player', -13, 0, 'Player', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const game = (extra: Partial<SceneNode> = {}) => box('game', 11, 0, 'Game server', 'blue', 'server', { size: [1.3, 1.3], height: 30, ...extra });

const lesson: Lesson = {
  slug: 'source-tcp-vs-udp-for-online-gaming',
  title: 'TCP vs UDP: Why Games Use UDP',
  blurb: 'Reliable ordered delivery has a price — waiting. When data goes stale in milliseconds, a lost packet is better ignored than recovered.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'stalls', label: 'TCP stalls per minute', icon: 'alert' },
    { key: 'stall', label: 'Typical stall length', icon: 'clock' },
    { key: 'udp', label: 'UDP: age of a missing update', icon: 'refresh' },
    { key: 'bw', label: 'UDP with 1-packet redundancy', icon: 'gauge' },
  ],
  goals: [
    { text: 'What TCP guarantees and the cost of it', step: 1 },
    { text: 'Head-of-line blocking when a packet is lost', step: 2 },
    { text: 'What UDP leaves to you', step: 3 },
    { text: 'Designing around loss: snapshots, redundancy, reliability on top', step: 5 },
    { text: 'When TCP is still the right choice', step: 7 },
  ],
  legend: ['request', 'response', 'fail', 'write'],
  dynamic: {
    parameters: [
      { key: 'tick', label: 'Updates per second', min: 5, max: 240, step: 5, default: 60, unit: ' Hz', description: 'How often each side sends a state update.' },
      { key: 'loss', label: 'Packet loss', min: 0, max: 15, step: 0.1, default: 1, unit: '%', description: 'Share of packets lost on the path.' },
      { key: 'rtt', label: 'Round-trip time', min: 5, max: 400, step: 5, default: 60, unit: ' ms', description: 'Network latency between player and server.' },
      { key: 'size', label: 'Update size', min: 20, max: 1200, step: 10, default: 120, unit: ' B', description: 'Payload per update.' },
    ],
    calculate: (input, step) => {
      const tick = Math.max(1, input.tick ?? 60);
      const loss = Math.min(1, Math.max(0, (input.loss ?? 1) / 100));
      const rtt = Math.max(1, input.rtt ?? 60);
      const size = Math.max(1, input.size ?? 120);
      // Each lost packet stalls TCP delivery until retransmitted: about 1.5 RTT with fast retransmit (≥ RTO when tail is lost).
      const stalls = tick * 60 * loss;
      const stallMs = 1.5 * rtt;
      const age = 1000 / tick;
      const bw = size * tick * 2;
      return {
        stalls: step < 1 ? { v: '—' } : { v: stalls.toFixed(stalls < 10 ? 1 : 0), tone: stalls < 10 ? 'good' : stalls < 100 ? 'warn' : 'bad' },
        stall: step < 1 ? { v: '—' } : { v: `~${Math.round(stallMs)} ms (frozen)`, tone: stallMs < 60 ? 'good' : stallMs < 150 ? 'warn' : 'bad' },
        udp: step < 2 ? { v: '—' } : { v: `${age.toFixed(age < 10 ? 1 : 0)} ms (next update replaces it)`, tone: 'good' },
        bw: step < 4 ? { v: '—' } : { v: `${(bw / 1000).toFixed(1)} KB/s per direction (2× each update)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'TCP',
      kind: 'technique',
      title: 'TCP: a reliable, ordered byte stream',
      body: [
        'TCP hides the network’s unreliability: it numbers bytes, acknowledges them, <b>retransmits lost packets</b>, reorders arrivals and gives the application a clean ordered stream, plus congestion control that backs off when the network is crowded. For web pages, files and database connections that is exactly what you want.',
        'Its promise has a price: <b>nothing is delivered out of order</b>. Bytes that arrive early wait in a buffer until every earlier byte has arrived.',
      ],
      changes: [{ text: 'Reliable · ordered · congestion-controlled', tone: 'good' }, { text: 'Never delivers later data before earlier data', tone: 'info' }],
      scene: { nodes: [player({ tag: pill('position update #1…#4', 'list') }), game({ tag: pill('in-order stream', 'queue') })], links: [link('player', 'game', { arrow: 'both' })], flows: [flow(['player', 'game'], { kind: 'write', rate: 2 })] },
    },
    {
      short: 'Stalls',
      kind: 'problem',
      title: 'A lost packet freezes everything behind it',
      body: [
        'A game sends 60 state updates a second. Update #17 is lost. #18, #19 and #20 arrive — but TCP won’t hand them to the game until #17 is retransmitted. The sender must notice (three duplicate ACKs, or a timeout) and resend, costing about <b>1.5 round trips</b>: ~90 ms at 60 ms RTT, longer if the tail is lost and the retransmission timer must fire.',
        'During that time the game has no new data — it is <b>frozen on stale state</b> — and then receives four updates at once, of which the first three are already out of date. At 60 Hz and 1% loss that happens <b>36 times a minute</b>. Worse, TCP’s congestion control interprets loss as congestion and slows the whole connection.',
      ],
      changes: [{ text: '60 Hz × 1% loss = 36 stalls/min', tone: 'bad' }, { text: 'Each stall ≈ 1.5 RTT of frozen state', tone: 'bad' }],
      concepts: [{ term: 'Head-of-line blocking', def: 'Later data being held back because an earlier piece is missing, due to in-order delivery.' }],
      scene: { nodes: [player(), game({ state: 'hot', tag: pill('#18–#20 waiting for #17', 'clock', 'warn') })], links: [link('player', 'game')], flows: [flow(['player', 'game'], { kind: 'fail', rate: 1.2 })] },
    },
    {
      short: 'UDP',
      kind: 'technique',
      title: 'UDP: datagrams, no promises',
      body: [
        '<b>UDP</b> sends independent packets with no connection, no retransmission, no ordering and no congestion control. A lost update is simply gone; a late one arrives out of order. That sounds worse — and for a stream of <i>state snapshots</i> it is better: when #17 is lost, #18 already carries a newer position that makes #17 irrelevant. The player sees the most recent state within <b>one tick</b> (16.7 ms at 60 Hz) instead of waiting 90 ms.',
        'The deal: UDP gives you speed and control, and <b>you</b> decide what to do about loss, order and rate. Every game protocol is a small protocol of its own on top of UDP.',
      ],
      changes: [{ text: 'Lost snapshot → next one replaces it', tone: 'good' }, { text: 'You own ordering, reliability and rate control', tone: 'info' }],
      scene: { nodes: [player({ tag: pill('#17 lost, ignored', 'check', 'good') }), game({ tag: pill('uses #18 immediately', 'bolt', 'good') })], links: [link('player', 'game')], flows: [flow(['player', 'game'], { kind: 'write', rate: 2.5 })] },
    },
    {
      short: 'Not everything',
      kind: 'insight',
      title: 'Not all game data is equal',
      body: [
        'Fast-changing state — positions, aim, animations — is <b>latest-wins</b>: lost packets don’t need recovery. But a <i>“player used the health pack”</i> event, a chat message or a purchase must arrive exactly once. Real protocols split the traffic: <b>unreliable</b> channel for state, <b>reliable</b> channel for events, sometimes <b>reliable-ordered</b> within a stream.',
        'Games implement this over UDP with sequence numbers and acknowledgements per channel — or use a library that does (ENet, Steam sockets) or QUIC, which provides independent reliable streams plus unreliable datagrams.',
      ],
      scene: { nodes: [box('state', -8, -4, 'State (position)', 'blue', 'bolt', { size: [1.3, 1.3], height: 24, tag: pill('unreliable · latest wins', 'bolt', 'good') }), box('event', -8, 5, 'Events (pickup, chat)', 'orange', 'check', { size: [1.3, 1.3], height: 24, tag: pill('reliable · acked', 'check') }), game()], links: [link('state', 'game'), link('event', 'game')], flows: [flow(['state', 'game'], { rate: 2.5 }), flow(['event', 'game'], { kind: 'write', rate: 0.6 })] },
    },
    {
      short: 'Redundancy',
      kind: 'technique',
      title: 'Tolerating loss without retransmission',
      body: [
        '<b>Redundancy</b>: include the previous update(s) in each packet — one packet carrying updates N and N−1 survives a single loss at the cost of double bandwidth (here ~14 KB/s per direction at 120 B × 60 Hz × 2). <b>Delta compression</b> against the last <i>acknowledged</i> snapshot keeps packets small. <b>Interpolation</b> renders slightly in the past so a missing update is filled by smoothing between known points; <b>client-side prediction</b> hides latency by simulating your own inputs immediately and reconciling when the authoritative state arrives.',
        'These move the cost from waiting to a little bandwidth and engineering — the right trade when milliseconds matter more than bytes. Don’t forget <b>rate control</b>: with no congestion control, a UDP sender can flood a link, so cap your own send rate.',
      ],
      changes: [{ text: 'Send N and N−1: survives one loss', tone: 'good' }, { text: 'Interpolation + prediction hide gaps', tone: 'good' }, { text: 'You must limit your own send rate', tone: 'info' }],
      scene: { nodes: [player({ tag: pill('packet = #18 + #17', 'layers', 'good') }), game({ tag: pill('gets #17 from the next packet', 'check', 'good') })], links: [link('player', 'game')], flows: [flow(['player', 'game'], { kind: 'write', rate: 2.5 })] },
    },
    {
      short: 'Firewalls',
      kind: 'tradeoff',
      title: 'The costs of leaving TCP',
      body: [
        '<b>NAT and firewalls</b>: UDP has no connection to track, so peer-to-peer needs hole punching and relay servers (STUN/TURN); some corporate networks block UDP outright, so games keep a TCP fallback. <b>Security</b>: nothing is encrypted or authenticated for free — use DTLS or QUIC, and guard against <b>amplification and spoofed-source floods</b> by validating clients before sending large responses.',
        '<b>Fairness</b>: unthrottled UDP can crowd out TCP flows on the same link — keep rates modest and adaptive. These are real costs, which is why you only leave TCP when latency demands it.',
      ],
      scene: { nodes: [player(), box('nat', 0, 0, 'NAT / firewall', 'orange', 'shield', { size: [1.3, 1.3], height: 26, tag: pill('UDP blocked? → TCP fallback', 'alert', 'warn') }), game()], links: [link('player', 'nat'), link('nat', 'game')], flows: [flow(['player', 'nat', 'game'], { rate: 1.5 })] },
    },
    {
      short: 'Choosing',
      kind: 'insight',
      title: 'How to choose',
      body: [
        '<b>TCP</b> when you need every byte, in order, and can afford to wait: web, APIs, files, databases, login, purchases, chat history. <b>UDP</b> (or QUIC) when data is perishable and latency dominates: real-time games, voice and video calls, live telemetry, DNS queries, time sync.',
        'Rule of thumb: if recovering a lost message would deliver something already obsolete, don’t pay for reliability. If losing it is a bug, do. Many systems use both: TCP for the lobby, login and economy, UDP for the match. Figures in this lesson are illustrative model outputs.',
      ],
      scene: { nodes: [box('tcp', -8, 0, 'TCP', 'blue', 'check', { size: [1.3, 1.3], height: 26, tag: pill('every byte, in order', 'check') }), box('udp', 8, 0, 'UDP / QUIC', 'orange', 'bolt', { size: [1.3, 1.3], height: 26, tag: pill('perishable, low latency', 'bolt') })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Don’t recover what has already expired',
      body: [
        'TCP guarantees reliable, ordered delivery by stalling later data behind a lost packet — about 1.5 RTT each time. UDP leaves loss to the application, which for state updates means “ignore it, the next one is newer”, and builds just enough reliability on top for the events that matter.',
        'Use redundancy, interpolation and prediction to mask loss, limit your send rate, keep a TCP fallback, and secure the channel. Choose by the <i>shelf life</i> of the data.',
      ],
      scene: { nodes: [player(), game()], links: [link('player', 'game', { arrow: 'both' })], flows: [flow(['player', 'game'], { kind: 'write', rate: 2.5 })] },
    },
  ],
};

export default lesson;
