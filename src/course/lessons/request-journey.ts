import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, patch, pill, you, zone } from '../kit';

const URL = 'tix.example/checkout';

const client = you('you', -8, 1, { tag: pill(URL, 'globe') });
const resolver = box('dns', -1, -5, 'Resolver', 'yellow', 'globe', { sub: 'DNS' });
const web = box('web', 1, 2, 'Web app', 'blue', 'server');
const store = db('db', 8, -1, 'Orders DB');
const assets = disk('static', 7, 6, 'static files');

const base: SceneNode[] = [client, resolver, web, store];

const lesson: Lesson = {
  slug: 'request-journey',
  title: 'Anatomy of a Page Load',
  blurb: 'Trace one checkout page from the Enter key to the last pixel, and learn to see where the milliseconds hide.',
  minutes: 9,
  level: 'Beginner',
  metrics: [
    { key: 'dns', label: 'DNS', icon: 'globe' },
    { key: 'connect', label: 'Connect', icon: 'link' },
    { key: 'server', label: 'Server', icon: 'server' },
    { key: 'transfer', label: 'Transfer', icon: 'activity' },
    { key: 'total', label: 'Total', icon: 'timer' },
  ],
  goals: [
    { text: 'What a DNS lookup costs, and why answers are cached', step: 2 },
    { text: 'Why a new connection spends round trips before any data', step: 3 },
    { text: 'The path browser → app → database → back', step: 6 },
    { text: 'Why one page is really dozens of requests', step: 7 },
    { text: 'Telling a slow hop apart from a long distance', step: 9 },
  ],
  legend: ['request', 'response', 'handshake'],
  steps: [
    {
      short: 'Enter',
      kind: 'problem',
      title: 'Customers say checkout drags',
      body: [
        'Support tickets keep mentioning the same thing: the checkout page on <code>tix.example</code> feels sluggish. Nobody can say <i>which part</i> is slow — and guessing is how teams end up optimising the wrong thing.',
        'So before touching any code, we follow a single page load from the moment someone presses Enter, and put a number on every hop.',
      ],
      note: { kind: 'key', text: 'You cannot speed up what you have not measured. A page load is a chain of waits, and the total is only as good as its worst link.' },
      scene: {
        nodes: [client],
        metrics: { dns: '—', connect: '—', server: '—', transfer: '—', total: '0 ms' },
      },
    },
    {
      short: 'DNS',
      kind: 'technique',
      title: 'Turn a name into an address',
      body: [
        'Networks route packets to numeric IP addresses, not names. The browser first asks a <b>DNS resolver</b> — usually run by the ISP or a public provider — what address <code>tix.example</code> lives at.',
        'If the resolver has no fresh answer, it walks the hierarchy on your behalf: a root server points at the <code>.example</code> servers, which point at the domain’s own authoritative servers. Here it comes back in 24 ms with <code>198.51.100.24</code>.',
      ],
      note: { kind: 'tip', text: 'Every answer carries a TTL (time-to-live). Browser, OS and resolver all cache it until the TTL expires, so a repeat visit usually skips this step entirely. Short TTLs make failover faster but cost more lookups.' },
      changes: [{ text: 'Resolver joins the picture' }, { text: 'Lookup: 24 ms' }],
      concepts: [
        { term: 'DNS', def: 'The internet’s phone book: maps names like tix.example to IP addresses.' },
        { term: 'TTL', def: 'How long a cached answer may be reused before it must be fetched again.' },
        { term: 'Recursive resolver', def: 'The DNS server that walks root → TLD → authoritative servers for you and caches the result.' },
      ],
      scene: {
        nodes: [client, { ...resolver, tag: pill('→ 198.51.100.24', 'pin', 'accent') }],
        links: [link('you', 'dns', { arrow: 'both', label: pill('where is tix.example?') })],
        flows: [flow(['you', 'dns'], { kind: 'handshake', back: true, rate: 0.9 })],
        metrics: { dns: '24 ms', connect: '—', server: '—', transfer: '—', total: '24 ms' },
      },
    },
    {
      short: 'Connect',
      kind: 'technique',
      title: 'Open a connection: two round trips of nothing',
      body: [
        'With an address in hand, the browser opens a <b>TCP</b> connection: SYN, SYN-ACK, ACK. That costs one full round trip before a single byte of the page can move.',
        'Because this is HTTPS, a <b>TLS</b> handshake follows to agree on keys and verify the certificate — one more round trip with TLS 1.3, two with older versions. At a 30 ms round-trip time, that is 60 ms spent purely on setup.',
      ],
      note: { kind: 'tip', text: 'Browsers keep connections alive and HTTP/2 multiplexes many requests over one, so this cost is paid once per origin, not once per file. HTTP/3 (QUIC) folds transport and crypto setup into a single round trip.' },
      changes: [{ text: 'TCP handshake: 1 RTT' }, { text: 'TLS 1.3 handshake: 1 RTT' }, { text: 'Connect: 60 ms', tone: 'bad' }],
      concepts: [
        { term: 'RTT', def: 'Round-trip time: how long a packet takes to reach the other side and for the reply to come back.' },
        { term: 'TLS handshake', def: 'The exchange that sets up encryption keys and checks the server’s certificate before HTTPS data flows.' },
      ],
      scene: {
        nodes: [client, { ...resolver, state: 'dim' }, web],
        links: [link('you', 'web', { arrow: 'both', label: pill('SYN · SYN-ACK · TLS', 'lock') })],
        flows: [flow(['you', 'web'], { kind: 'handshake', back: true, rate: 1.1 })],
        metrics: { dns: '24 ms', connect: '60 ms', server: '—', transfer: '—', total: '84 ms' },
      },
    },
    {
      short: 'Request',
      kind: 'technique',
      title: 'Send the request',
      body: [
        'Now the browser sends <code>GET /checkout</code>: a request line, headers (cookies, accepted encodings, language), and no body. On the wire it is a few hundred bytes — tiny.',
        'The web app parses it, checks the session cookie, and routes it to the checkout handler. So far the server has spent under 2 ms. The interesting part is what that handler needs next.',
      ],
      changes: [{ text: 'Request reaches the app' }, { text: 'Routing + auth: ~2 ms' }],
      concepts: [{ term: 'HTTP request', def: 'A method (GET, POST…), a path, headers and an optional body sent from client to server.' }],
      scene: {
        nodes: [client, web],
        links: [link('you', 'web', { label: pill('GET /checkout') })],
        flows: [flow(['you', 'web'], { kind: 'request', rate: 1.4 })],
        metrics: { dns: '24 ms', connect: '60 ms', server: '2 ms', transfer: '—', total: '86 ms' },
      },
    },
    {
      short: 'Database',
      kind: 'technique',
      title: 'The app asks the database',
      body: [
        'To render checkout, the handler needs the cart, the held seats and their prices. None of that lives in the web process — it is in the <b>orders database</b>, one network hop away inside the data centre.',
        'Three queries go out, each a sub-millisecond network trip plus however long the database takes to find the rows. Today that adds up to about 38 ms of server time.',
      ],
      note: { kind: 'warn', text: 'Queries issued one after another add their latencies. Three 12 ms queries in sequence cost 36 ms; the same three in parallel cost about 12 ms — if they don’t depend on each other.' },
      changes: [{ text: 'Database joins the picture' }, { text: 'Server time: 40 ms' }],
      scene: {
        nodes: [client, web, store],
        links: [link('you', 'web'), link('web', 'db', { arrow: 'both', label: pill('3 queries') })],
        flows: [flow(['web', 'db'], { kind: 'request', back: true, rate: 2.2 })],
        metrics: { dns: '24 ms', connect: '60 ms', server: '40 ms', transfer: '—', total: '124 ms' },
      },
    },
    {
      short: 'Response',
      kind: 'technique',
      title: 'The response travels home',
      body: [
        'The handler renders 48 KB of HTML, compresses it to about 11 KB, and streams it back. The first byte arrives one half-round-trip after the server starts sending — that moment is the <b>time to first byte</b> (TTFB).',
        'A fresh TCP connection doesn’t start at full speed: <b>slow start</b> sends a small window first and grows it as acknowledgements return. Small pages fit in the first window; big ones pay extra round trips.',
      ],
      changes: [{ text: 'HTML arrives: 11 KB compressed' }, { text: 'Transfer: 18 ms' }, { text: 'TTFB ≈ 139 ms', tone: 'good' }],
      concepts: [
        { term: 'TTFB', def: 'Time to first byte: from sending the request to receiving the first byte of the response.' },
        { term: 'Slow start', def: 'TCP behaviour where a new connection begins with a small send window and grows it each round trip.' },
      ],
      scene: {
        nodes: [client, web, store],
        links: [link('web', 'you', { label: pill('200 OK · 11 KB', 'file', 'good') }), link('web', 'db', { arrow: 'both' })],
        flows: [flow(['db', 'web', 'you'], { kind: 'response', rate: 1.4 })],
        metrics: { dns: '24 ms', connect: '60 ms', server: '40 ms', transfer: '18 ms', total: '142 ms' },
      },
    },
    {
      short: 'Assets',
      kind: 'insight',
      title: 'One page, thirty-odd more requests',
      body: [
        'The HTML is only a table of contents. As the browser parses it, it discovers stylesheets, scripts, fonts and images — 34 more requests for this page, most to a static file store.',
        'Over HTTP/2 they share the open connection and run in parallel, but some block rendering: CSS and synchronous scripts in the <code>&lt;head&gt;</code> must arrive before anything is painted. The total climbs to around 430 ms.',
      ],
      note: { kind: 'key', text: 'Page speed is usually decided by the critical path — the chain of files that must arrive before first paint — not by the size of the HTML.' },
      changes: [{ text: '+34 requests for CSS, JS, fonts, images' }, { text: 'Total: 430 ms', tone: 'bad' }],
      concepts: [{ term: 'Critical rendering path', def: 'The resources a browser must fetch and process before it can paint the first pixels.' }],
      scene: {
        nodes: [client, web, store, assets],
        links: [link('web', 'you'), link('web', 'db', { arrow: 'both' }), link('you', 'static', { arrow: 'both', label: pill('34 files', 'image') })],
        flows: [
          flow(['you', 'static'], { kind: 'request', back: true, rate: 3.2 }),
          flow(['you', 'web'], { kind: 'request', back: true, rate: 0.5 }),
        ],
        metrics: { dns: '24 ms', connect: '60 ms', server: '40 ms', transfer: '306 ms', total: '430 ms' },
      },
    },
    {
      short: 'Slow query',
      kind: 'case',
      title: 'Case: one query eats the budget',
      body: [
        'For customers with long order histories, checkout takes over a second. The trace shows DNS, connect and transfer unchanged — but server time jumps to 910 ms.',
        'One query filters orders by customer and status with no index to help, so the database reads <b>every row</b> in a 40-million-row table. Network tuning would not save a single millisecond here.',
      ],
      note: { kind: 'tip', text: 'Fix the dominant hop first. An index on (customer_id, status) turns this scan into a few page reads — covered in the Indexes lesson.' },
      changes: [{ text: 'Server: 40 ms → 910 ms', tone: 'bad' }, { text: 'Full table scan on orders', tone: 'bad' }],
      concepts: [{ term: 'Full table scan', def: 'A query that reads every row because no index narrows the search.' }],
      scene: {
        nodes: patch(base, { dns: { state: 'dim' }, db: { state: 'hot', tag: pill('scanning 40M rows', 'alert', 'bad') } }),
        links: [link('you', 'web'), link('web', 'db', { arrow: 'both', label: pill('870 ms', 'clock', 'bad') })],
        flows: [flow(['web', 'db'], { kind: 'heavy', back: true, rate: 0.5, speed: 0.4 })],
        metrics: { dns: '24 ms', connect: '60 ms', server: { v: '910 ms', tone: 'bad' }, transfer: '18 ms', total: { v: '1.01 s', tone: 'bad' } },
      },
    },
    {
      short: 'Far away',
      kind: 'case',
      title: 'Case: a customer in Singapore',
      body: [
        'A customer in Singapore reports the same slowness — yet the server is healthy. The servers live in Virginia, about 15,000 km away. Light in fibre covers roughly 200 km per millisecond, so one round trip costs about <b>230 ms</b> before any processing.',
        'DNS, TCP, TLS and the request itself each need at least one round trip: almost a second of pure distance. No amount of server optimisation helps; the fix is to <b>move bytes closer</b> — CDNs, edge termination of TLS, or a second region.',
      ],
      note: { kind: 'key', text: 'Latency has a floor set by physics. Once the slow parts are fixed, the only lever left is shortening the distance or the number of round trips.' },
      changes: [{ text: 'RTT: 30 ms → 230 ms', tone: 'bad' }, { text: 'Every handshake pays it', tone: 'bad' }],
      concepts: [{ term: 'Propagation delay', def: 'Time for a signal to physically travel the distance; ~5 µs per km in fibre.' }],
      scene: {
        nodes: [
          zone('sg', -8, 1, 4.2, 4.2, 'Singapore', 'teal'),
          zone('va', 4, 0, 8, 7, 'Virginia', 'blue'),
          client,
          web,
          store,
        ],
        links: [link('you', 'web', { arrow: 'both', label: pill('RTT 230 ms', 'clock', 'bad') }), link('web', 'db', { arrow: 'both' })],
        flows: [flow(['you', 'web'], { kind: 'request', back: true, rate: 0.8, speed: 0.45 })],
        metrics: { dns: { v: '230 ms', tone: 'warn' }, connect: { v: '460 ms', tone: 'bad' }, server: '40 ms', transfer: { v: '250 ms', tone: 'warn' }, total: { v: '980 ms', tone: 'bad' } },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Where the time went',
      body: [
        'A page load is a pipeline: <b>resolve</b> the name, <b>connect</b> (TCP + TLS), <b>request</b>, let the server do its <b>work</b> (often waiting on a database), <b>transfer</b> the response, then repeat for every sub-resource.',
        'Two very different problems look identical to the user: a <b>slow hop</b> (fix the work — indexes, caching, parallel queries) and a <b>long distance</b> (fix the geography — edges, regions, fewer round trips). Measure first; the trace tells you which one you have.',
      ],
      note: { kind: 'key', text: 'Browser dev tools’ Network → Timing panel shows exactly these phases for every request. Server-side, distributed tracing does the same across services.' },
      scene: {
        nodes: [
          { ...client, tag: undefined },
          { ...resolver, tag: pill('cached by TTL', 'clock') },
          { ...web, tag: pill('do less, in parallel', 'cpu') },
          { ...store, tag: pill('index hot queries', 'db') },
          { ...assets, label: pill('few, small, cacheable', 'image') },
        ],
        links: [link('you', 'dns', { arrow: 'both' }), link('you', 'web', { arrow: 'both' }), link('web', 'db', { arrow: 'both' }), link('you', 'static', { arrow: 'both' })],
        flows: [flow(['you', 'web', 'db'], { kind: 'request', back: true, rate: 0.9 })],
        metrics: { dns: '24 ms', connect: '60 ms', server: '40 ms', transfer: '306 ms', total: '430 ms' },
      },
    },
  ],
};

export default lesson;
