import type { Lesson, SceneNode } from '../../types';
import { box, crowd, flow, link, pill } from '../kit';

const p = (id: string, d: number, name: string, extra: Partial<SceneNode> = {}) => box(id, -14, d, name, ['green', 'orange', 'purple', 'teal'][Math.abs(Math.round(d)) % 4] as 'green', 'user', { size: [1.1, 1.1], height: 22, ...extra });
const sfu = (extra: Partial<SceneNode> = {}) => box('sfu', 0, 0, 'SFU (selective forwarding)', 'blue', 'route', { size: [1.6, 1.6], height: 34, ...extra });
const mcu = (extra: Partial<SceneNode> = {}) => box('mcu', 0, 0, 'MCU (decode + mix)', 'red', 'cpu', { size: [1.6, 1.6], height: 34, ...extra });
const others = (extra: Partial<SceneNode> = {}) => crowd('others', 14, 0, 10, 'other participants', extra);

const fmtM = (mbps: number): string => (mbps >= 1000 ? `${(mbps / 1000).toFixed(1)} Gbps` : mbps >= 10 ? `${mbps.toFixed(0)} Mbps` : `${mbps.toFixed(1)} Mbps`);

const lesson: Lesson = {
  slug: 'academy-5-reasons-why-zoom-was-able-to-support-300-million-video-calls-a-day',
  title: 'Video Conferencing: Mesh, MCU and SFU',
  blurb: 'Why peer-to-peer collapses beyond a few people, how a selective forwarding unit and simulcast keep bandwidth flat, and the per-client and per-server arithmetic.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'mesh', label: 'Mesh: each client’s upload', icon: 'share' },
    { key: 'sfu', label: 'SFU: each client’s upload (simulcast)', icon: 'check' },
    { key: 'down', label: 'Each client’s download', icon: 'activity' },
    { key: 'egress', label: 'SFU server egress for the meeting', icon: 'server' },
  ],
  goals: [
    { text: 'Why a full mesh stops working above a few participants', step: 1 },
    { text: 'MCU: decode and mix on the server — and its cost', step: 2 },
    { text: 'SFU: forward without decoding', step: 3 },
    { text: 'Simulcast and adaptive layer selection', step: 4 },
    { text: 'Scaling out, cascading and resilience', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Participants', min: 2, max: 1000, step: 1, default: 12, unit: '', description: 'People in the meeting, all with camera on.' },
      { key: 'mbps', label: 'Video bitrate (high layer)', min: 0.2, max: 6, step: 0.1, default: 1.5, unit: ' Mbps', description: 'Main video stream per participant.' },
      { key: 'layers', label: 'Simulcast uplink multiple', min: 1, max: 3, step: 0.1, default: 1.7, unit: '×', description: 'Total uplink including low and medium layers (e.g. 1 + 0.5 + 0.2).' },
      { key: 'tiles', label: 'Tiles shown at once', min: 1, max: 49, step: 1, default: 9, unit: '', description: 'Video tiles a client displays (gallery size).' },
      { key: 'thumb', label: 'Thumbnail layer bitrate', min: 0.05, max: 1, step: 0.05, default: 0.3, unit: ' Mbps', description: 'Bitrate of a small tile.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(2, Math.round(input.n ?? 12));
      const b = Math.max(0.1, input.mbps ?? 1.5);
      const layers = Math.max(1, input.layers ?? 1.7);
      const tiles = Math.max(1, Math.round(input.tiles ?? 9));
      const thumb = Math.max(0.01, input.thumb ?? 0.3);
      const mesh = (n - 1) * b;
      const sfuUp = b * layers;
      // The active speaker comes at full quality; other visible tiles at the thumbnail layer.
      const shown = Math.min(n - 1, tiles);
      const down = b + Math.max(0, shown - 1) * thumb;
      const egress = n * down;
      return {
        mesh: step < 1 ? { v: '—' } : { v: fmtM(mesh), tone: mesh < 5 ? 'good' : mesh < 15 ? 'warn' : 'bad' },
        sfu: step < 3 ? { v: '—' } : { v: fmtM(sfuUp), tone: 'good' },
        down: step < 3 ? { v: '—' } : { v: fmtM(down), tone: down < 5 ? 'good' : 'warn' },
        egress: step < 3 ? { v: '—' } : { v: fmtM(egress) },
      };
    },
  },
  steps: [
    {
      short: 'Mesh',
      kind: 'problem',
      title: 'Peer-to-peer doesn’t scale',
      body: [
        'The simplest topology is a <b>full mesh</b>: every participant sends their video directly to every other (WebRTC peer connections). It has no servers to pay for and the lowest latency — and the uplink each client needs is <code>(n − 1) × bitrate</code>. With 12 people at 1.5 Mbps that is <b>16.5 Mbps up</b> from every laptop; with 25 people, 36 Mbps. Home uplinks and phones give out first, and every client also encodes the video <i>n − 1</i> times.',
        'Meshes work for two to four people. Beyond that, the server must help. The two classic architectures are the <b>MCU</b> and the <b>SFU</b>.',
      ],
      changes: [{ text: 'Uplink = (n − 1) × bitrate; 12 people → 16.5 Mbps', tone: 'bad' }],
      scene: { nodes: [p('a', -8, 'A'), p('b', -4, 'B'), p('c', 0, 'C'), p('d', 4, 'D')], links: [link('a', 'b'), link('a', 'c'), link('a', 'd'), link('b', 'c'), link('b', 'd'), link('c', 'd')], flows: [flow(['a', 'c'], { kind: 'heavy', rate: 1.5 }), flow(['b', 'd'], { kind: 'heavy', rate: 1.5 })] },
    },
    {
      short: 'MCU',
      kind: 'technique',
      title: 'MCU: the server mixes everyone into one stream',
      body: [
        'A <b>multipoint control unit</b> receives every participant’s stream, <b>decodes</b> them, composes a single mosaic (or active-speaker) video, <b>re-encodes</b> it and sends each participant one stream. Clients are trivially cheap — one upload, one download — which suits legacy room systems, dial-in phones and weak devices.',
        'The cost is on the server: decoding n streams and encoding the mix (often per distinct layout) is <b>very CPU-intensive</b> — it limits meeting density per machine, adds latency from the decode/encode pass, locks everyone into the server’s layout and prevents end-to-end encryption (the server must see pixels). It is the expensive, inflexible option.',
      ],
      changes: [{ text: 'Clients: 1 up, 1 down — simple', tone: 'good' }, { text: 'Server: decode n + re-encode; high CPU, latency, no E2E', tone: 'bad' }],
      scene: { nodes: [p('a', -6, 'A'), p('b', 0, 'B'), p('c', 6, 'C'), mcu({ tag: pill('decode · mix · encode', 'alert', 'warn') }), others({ name: 'one mixed stream each' })], links: [link('a', 'mcu'), link('b', 'mcu'), link('c', 'mcu'), link('mcu', 'others')], flows: [flow(['a', 'mcu', 'others'], { kind: 'heavy', rate: 2 })] },
    },
    {
      short: 'SFU',
      kind: 'technique',
      title: 'SFU: forward without decoding',
      body: [
        'A <b>selective forwarding unit</b> receives each participant’s encoded stream and <b>forwards</b> it, <i>unchanged</i>, only to the participants who need it. It reads packet headers (not pixels), so it needs little CPU — one machine forwards many meetings — adds ~1 ms of latency, supports <b>end-to-end encryption</b> of the media (insertable streams) and lets every client choose its own layout.',
        'Each client uploads <b>one</b> stream set (≈ 1.5 × 1.7 = <b>~2.5 Mbps</b> with simulcast, independent of n) and downloads what it displays. The server pays in <b>egress</b>: 12 participants each receiving one full-quality speaker plus 8 thumbnails = 3.9 Mbps down → <b>~47 Mbps</b> out of the SFU for this meeting. That bandwidth is the real cost of video conferencing, which is why large providers run many regional data centres.',
      ],
      changes: [{ text: 'Uplink independent of n (one stream set)', tone: 'good' }, { text: 'Server cost = forwarded egress, not CPU', tone: 'info' }],
      scene: { nodes: [p('a', -6, 'A'), p('b', 0, 'B'), p('c', 6, 'C'), sfu({ tag: pill('forward packets, don’t decode', 'check', 'good') }), others()], links: [link('a', 'sfu'), link('b', 'sfu'), link('c', 'sfu'), link('sfu', 'others')], flows: [flow(['a', 'sfu', 'others'], { rate: 2 }), flow(['b', 'sfu', 'others'], { rate: 2 })] },
    },
    {
      short: 'Simulcast',
      kind: 'technique',
      title: 'Simulcast: three qualities, chosen per receiver',
      body: [
        'Receivers differ — a phone on cellular, a desktop on fibre, a tile that’s tiny or the active speaker. With <b>simulcast</b> each sender encodes the video at several resolutions/bitrates (say 1.5 Mbps, 0.5 and 0.2) and uploads all; the SFU picks, <b>per receiver and per tile</b>, which layer to forward: the active speaker at high quality, the rest as thumbnails. A receiver on a bad network is stepped <b>down</b> without affecting anyone else.',
        '<b>Scalable video coding</b> (SVC) does something similar within one stream, letting the SFU drop enhancement layers cheaply. Bandwidth estimation (transport-wide congestion control, REMB) tells the SFU how much each receiver’s path can carry; <b>forward error correction</b>, retransmission requests and a jitter buffer hide packet loss. Audio is sent separately and prioritised: people tolerate frozen video far better than choppy audio.',
      ],
      changes: [{ text: 'Sender uploads layers; SFU picks one per receiver and tile', tone: 'good' }, { text: 'Audio prioritised over video', tone: 'good' }],
      scene: { nodes: [p('a', 0, 'Sender'), sfu({ tag: pill('choose layer per receiver', 'gauge') }), box('r1', 12, -6, 'Fast receiver: high', 'green', 'user', { size: [1.1, 1.1], height: 22 }), box('r2', 12, 6, 'Weak network: low', 'orange', 'user', { size: [1.1, 1.1], height: 22 })], links: [link('a', 'sfu'), link('sfu', 'r1'), link('sfu', 'r2')], flows: [flow(['a', 'sfu', 'r1'], { rate: 2 }), flow(['sfu', 'r2'], { rate: 0.8 })] },
    },
    {
      short: 'Scale-out',
      kind: 'technique',
      title: 'Large meetings, regions and cascading',
      body: [
        'A single SFU’s network card caps participants (egress ≈ n × download). Providers <b>cascade</b> SFUs: participants connect to the nearest data centre, and the SFUs forward one copy of each stream between them over the backbone — inter-server traffic grows with <i>servers</i>, not participants. Meetings with thousands of viewers use a <b>webinar/broadcast</b> mode: a few presenters over WebRTC, viewers receive HLS or low-latency segments from a CDN (see the Live Streaming lesson).',
        'Meeting placement is a scheduling problem: put the meeting where most participants are, start on a nearby server and migrate, keep spare capacity per region, and steer clients with DNS/anycast. Clients use ICE/STUN/TURN to connect through NATs (see the NAT lesson) and fall back to TCP/TLS on port 443 when UDP is blocked.',
      ],
      changes: [{ text: 'Cascade SFUs across regions; one copy per stream per link', tone: 'good' }, { text: 'Webinars: presenters on WebRTC, audience on CDN', tone: 'info' }],
      scene: { nodes: [p('a', -6, 'US users'), p('b', 6, 'EU users'), sfu({ name: 'SFU US', tag: pill('cascade', 'share') }), box('sfu2', 10, 0, 'SFU EU', 'blue', 'route', { size: [1.5, 1.5], height: 30 })], links: [link('a', 'sfu'), link('sfu', 'sfu2', { arrow: 'both' }), link('sfu2', 'b')], flows: [flow(['a', 'sfu', 'sfu2', 'b'], { rate: 2 })] },
    },
    {
      short: 'Failure',
      kind: 'problem',
      title: 'What breaks mid-call',
      body: [
        '<b>SFU failure</b>: clients detect media timeouts and <b>reconnect to another SFU</b> with the same meeting state held in a coordination service, resuming within a few seconds. <b>Network change</b> (Wi-Fi to cellular): ICE restart without leaving the meeting. <b>Overload</b>: shed to lower layers first, then disable video for the weakest, keep audio. <b>Packet loss</b>: FEC and NACK, reduce bitrate, switch layer. <b>Large-room storms</b>: everyone joining at the same minute — pre-provision, queue joins and use admission control.',
        'The principle across all of it is <b>graceful degradation</b> in a fixed order — resolution, then frame rate, then video, never audio — plus fast reconnect and state outside any one media server. Figures here are model outputs for sizing, not any provider’s internals.',
      ],
      changes: [{ text: 'Degrade in order: resolution → fps → video → (never) audio', tone: 'good' }, { text: 'Meeting state outside the media server', tone: 'good' }],
      scene: { nodes: [p('a', 0, 'Client'), sfu({ state: 'down', tone: 'red', tag: pill('failed', 'alert', 'bad') }), box('sfu2', 10, 0, 'Backup SFU', 'blue', 'route', { size: [1.5, 1.5], height: 30, tag: pill('client reconnects here', 'check', 'good') })], links: [link('a', 'sfu', { style: 'broken' }), link('a', 'sfu2', { style: 'dashed' })], flows: [flow(['a', 'sfu2'], { rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Forward, don’t mix; send layers, not everything',
      body: [
        'Mesh uplink is <code>(n − 1) × bitrate</code>; an <b>MCU</b> mixes on the server (simple clients, expensive CPU, no E2E); an <b>SFU</b> forwards encoded packets (flat uplink, server cost = egress); <b>simulcast/SVC</b> lets each receiver get the right quality; <b>cascading</b> spreads load across regions; <b>graceful degradation</b> and fast reconnect keep calls alive.',
        'Plan capacity in bandwidth — participants × download — not CPU.',
      ],
      scene: { nodes: [p('a', -6, 'A'), p('b', 0, 'B'), p('c', 6, 'C'), sfu(), others()], links: [link('a', 'sfu'), link('b', 'sfu'), link('c', 'sfu'), link('sfu', 'others')], flows: [flow(['a', 'sfu', 'others'], { rate: 2 })] },
    },
  ],
};

export default lesson;
