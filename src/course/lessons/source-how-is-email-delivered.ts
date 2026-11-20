import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const sender = (extra: Partial<SceneNode> = {}) => box('sender', -17, 0, 'Sender (mail client)', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const msa = (extra: Partial<SceneNode> = {}) => box('msa', -10, 0, 'Sender’s mail server (MTA)', 'blue', 'server', { size: [1.3, 1.3], height: 28, ...extra });
const dns = (extra: Partial<SceneNode> = {}) => box('dns', -1, -7, 'DNS: MX · SPF · DKIM · DMARC', 'teal', 'globe', { size: [1.4, 1.4], height: 24, ...extra });
const mx = (extra: Partial<SceneNode> = {}) => box('mx', -1, 0, 'Recipient’s mail server (MX)', 'orange', 'server', { size: [1.4, 1.4], height: 30, ...extra });
const box_ = (extra: Partial<SceneNode> = {}) => db('mbox', 8, 0, 'Mailbox store', { size: [1.3, 1.3], ...extra });
const rcv = (extra: Partial<SceneNode> = {}) => box('rcv', 15, 0, 'Recipient (IMAP / webmail)', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const q = (extra: Partial<SceneNode> = {}) => box('q', -10, 8, 'Retry queue', 'yellow', 'queue', { size: [1.6, 1], height: 14, ...extra });

const fmtT = (min: number): string => (min >= 2880 ? `${(min / 1440).toFixed(1)} days` : min >= 120 ? `${(min / 60).toFixed(1)} h` : `${Math.round(min)} min`);
const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-how-is-email-delivered',
  title: 'How Email Is Delivered: SMTP, MX Records and Trust',
  blurb: 'Store-and-forward SMTP, DNS MX lookup, retry queues with backoff — and the SPF, DKIM and DMARC records that decide whether a message is believed.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'tries', label: 'Delivery attempts before bouncing', icon: 'refresh' },
    { key: 'bounce', label: 'Time until a bounce is sent', icon: 'clock' },
    { key: 'queue', label: 'Messages waiting in the retry queue', icon: 'layers' },
    { key: 'rate', label: 'Messages per second to deliver', icon: 'activity' },
  ],
  goals: [
    { text: 'The path: client → MTA → DNS MX → recipient MTA → mailbox', step: 1 },
    { text: 'The SMTP conversation and store-and-forward', step: 2 },
    { text: 'Temporary failures, retry queues and backoff', step: 3 },
    { text: 'SPF, DKIM and DMARC: proving who sent it', step: 4 },
    { text: 'Reputation, spam filtering and bounces', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'vol', label: 'Messages sent per day', min: 1000, max: 1000000000, step: 1000, default: 5000000, unit: '', description: 'Outbound volume of the sending system.' },
      { key: 'soft', label: 'Deferred on first try (4xx)', min: 0, max: 30, step: 0.1, default: 4, unit: '%', description: 'Share of messages whose first delivery attempt gets a temporary failure (greylisting, busy server, rate limit).' },
      { key: 'first', label: 'First retry after', min: 1, max: 120, step: 1, default: 15, unit: ' min', description: 'Delay before the second attempt.' },
      { key: 'factor', label: 'Backoff multiplier', min: 1, max: 4, step: 0.1, default: 2, unit: '×', description: 'Each retry waits this much longer than the previous one.' },
      { key: 'give', label: 'Give up after', min: 1, max: 10, step: 1, default: 5, unit: ' days', description: 'Total time a message may stay queued.' },
    ],
    calculate: (input, step) => {
      const vol = Math.max(1, input.vol ?? 5e6);
      const soft = Math.max(0, (input.soft ?? 4) / 100);
      const first = Math.max(1, input.first ?? 15);
      const f = Math.max(1, input.factor ?? 2);
      const giveMin = Math.max(1, input.give ?? 5) * 1440;
      // Retry k happens first × f^(k−1) minutes after the previous attempt; count attempts that fit in the window.
      let t = 0;
      let tries = 1;
      let delay = first;
      while (t + delay <= giveMin && tries < 200) {
        t += delay;
        tries++;
        delay *= f;
        if (f === 1 && tries > 199) break;
      }
      // Messages that are still queued at any time ≈ deferred rate × average time a deferred message waits (about half the first interval for most).
      const avgWait = Math.min(giveMin, first * 2);
      const queued = ((vol * soft) / 86400) * avgWait * 60;
      return {
        tries: step < 2 ? { v: '—' } : { v: `${tries} (1 initial + ${tries - 1} retries)` },
        bounce: step < 2 ? { v: '—' } : { v: fmtT(giveMin), tone: giveMin >= 2880 ? 'good' : 'warn' },
        queue: step < 2 ? { v: '—' } : { v: `~${fmtN(queued)}`, tone: queued < 100000 ? 'good' : 'warn' },
        rate: step < 0 ? { v: '—' } : { v: `${fmtN(vol / 86400)}/s (average)` },
      };
    },
  },
  steps: [
    {
      short: 'Path',
      kind: 'insight',
      title: 'Email is relayed between servers, not sent directly',
      body: [
        'You write a message in a <b>mail client</b> (a <i>mail user agent</i>), which submits it to your provider’s <b>mail transfer agent</b> (MTA) over SMTP, authenticated. That server looks at the recipient’s domain, asks <b>DNS</b> for its <b>MX records</b> (the hosts that accept mail for it, with priorities), connects to one over SMTP (port 25), and hands the message over. The recipient’s server accepts it, runs checks, and stores it in the <b>mailbox</b>, from which the recipient reads it via IMAP or webmail.',
        'It is a <b>store-and-forward</b> system designed in the 1980s for unreliable networks: each hop takes responsibility for the message and keeps trying until it is delivered or definitively fails — there is no end-to-end confirmation of reading, and any server on the path could be a relay. That design explains both its resilience and its susceptibility to forgery.',
      ],
      scene: { nodes: [sender(), msa(), dns({ tag: pill('MX for example.com?', 'search') }), mx(), box_(), rcv()], links: [link('sender', 'msa'), link('msa', 'dns', { style: 'dashed' }), link('msa', 'mx'), link('mx', 'mbox'), link('mbox', 'rcv')], flows: [flow(['sender', 'msa', 'mx', 'mbox', 'rcv'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'SMTP',
      kind: 'technique',
      title: 'The SMTP conversation',
      body: [
        'SMTP is a plain-text dialogue over TCP: <code>EHLO</code> (introduce yourself), optional <code>STARTTLS</code> (upgrade to TLS — opportunistic, so not guaranteed), <code>MAIL FROM:&lt;bounce@sender.com&gt;</code> (the <b>envelope</b> sender, where bounces go), <code>RCPT TO:&lt;you@example.com&gt;</code> (the recipient; the server can reject unknown users now), <code>DATA</code> (the message with its <b>headers</b>, including the visible <code>From:</code>), then <code>QUIT</code>. Replies are numeric: <b>2xx</b> success, <b>4xx</b> temporary failure (try later), <b>5xx</b> permanent failure (bounce).',
        'Note the two senders: the envelope <code>MAIL FROM</code> and the header <code>From:</code> can differ, and nothing in base SMTP checks either — which is why anyone could once send “from” anyone. The authentication layers below were added to patch that.',
      ],
      changes: [{ text: '2xx accepted · 4xx try later · 5xx rejected', tone: 'info' }, { text: 'Envelope sender ≠ visible From header', tone: 'info' }],
      scene: { nodes: [msa({ tag: pill('EHLO · MAIL FROM · RCPT TO · DATA', 'list') }), mx({ tag: pill('250 OK / 451 try later / 550 no such user', 'check') })], links: [link('msa', 'mx', { arrow: 'both' })], flows: [flow(['msa', 'mx'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Retries',
      kind: 'technique',
      title: 'Temporary failures: queue, back off, retry',
      body: [
        'A <b>4xx</b> reply — a server busy, a mailbox full, <b>greylisting</b> (deliberately deferring unknown senders once), a rate limit, an unreachable host — is not a failure: the sending MTA <b>keeps the message in its queue</b> and retries with <b>exponential backoff</b> (here 15 min, 30 min, 1 h, 2 h … doubling) until it succeeds or a limit (commonly 4–5 days) passes, then generates a <b>bounce</b> (a delivery status notification) to the envelope sender.',
        'With these settings a message gets about <b>9 attempts</b> over 5 days. The queue holds every deferred message: 5 million a day with 4% deferred is ~8,300 deferrals an hour — on the order of <b>a few thousand messages waiting</b> at any moment, growing sharply if a big recipient (say a major provider) is down or throttling you. Spread retries with jitter, honour per-domain rate limits, and size the queue and disks for the worst outage you’d tolerate.',
      ],
      changes: [{ text: 'Backoff: 15 m, 30 m, 1 h, 2 h … until the give-up time', tone: 'info' }, { text: 'Permanent (5xx) or expired → bounce to the sender', tone: 'info' }],
      scene: { nodes: [msa({ tag: pill('451 try later', 'clock', 'warn') }), q({ tag: pill('retry at 15 m, 30 m, 1 h…', 'refresh') }), mx()], links: [link('msa', 'mx', { style: 'dashed' }), link('msa', 'q', { arrow: 'both' })], flows: [flow(['msa', 'q'], { rate: 1 }), flow(['q', 'msa'], { rate: 0.6, speed: 0.4 })] },
    },
    {
      short: 'SPF DKIM DMARC',
      kind: 'technique',
      title: 'Proving who sent it: SPF, DKIM, DMARC',
      body: [
        '<b>SPF</b>: the domain publishes in DNS the IP addresses allowed to send for it; the receiver checks the connecting IP against the <i>envelope</i> domain’s SPF record (limited to 10 DNS lookups — a common misconfiguration). <b>DKIM</b>: the sending server <b>signs</b> selected headers and the body with a private key; the public key is in DNS (<code>selector._domainkey.example.com</code>); the receiver verifies the signature, proving the message wasn’t altered and came from a server holding the key (see the Digital Signatures lesson).',
        '<b>DMARC</b> ties them to the visible <code>From:</code> domain: it requires that SPF or DKIM <b>passes and aligns</b> with that domain, and publishes a policy (<code>none</code> / <code>quarantine</code> / <code>reject</code>) for failures plus an address for aggregate reports. Together they make it hard to spoof a domain that enforces <code>reject</code>. Mailing lists and forwarding break SPF and sometimes DKIM, which is what ARC and careful alignment address.',
      ],
      changes: [{ text: 'SPF: which IPs may send · DKIM: signed message · DMARC: policy + alignment', tone: 'info' }, { text: 'Roll out DMARC: none → quarantine → reject', tone: 'good' }],
      scene: { nodes: [msa({ tag: pill('signs with DKIM key', 'lock') }), dns({ tag: pill('SPF · DKIM key · DMARC policy', 'hash') }), mx({ tag: pill('check SPF, verify DKIM, apply DMARC', 'shield', 'good') })], links: [link('msa', 'mx'), link('mx', 'dns', { style: 'dashed', arrow: 'both' })], flows: [flow(['msa', 'mx'], { rate: 1.5 })] },
    },
    {
      short: 'Reputation',
      kind: 'technique',
      title: 'Reputation, spam filtering and bounces',
      body: [
        'Passing authentication gets a message <i>identified</i>, not <i>trusted</i>. Receivers score each sending <b>IP and domain reputation</b> from history: complaint rates, spam-trap hits, bounce rates to invalid addresses, sudden volume spikes, content signals and engagement. New senders <b>warm up</b> gradually; a spike to a million messages from a cold IP looks like spam. Keep complaint rates tiny (well under 0.1%) and honour one-click unsubscribe headers.',
        'Handle <b>bounces</b> properly: remove addresses that hard-bounce (5xx “no such user”) immediately — mailing dead addresses wrecks reputation — treat repeated soft bounces as dead, and process feedback-loop complaints. Separate transactional (password resets) from bulk marketing mail onto different IPs/subdomains so a marketing slip doesn’t block critical mail. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Warm up IPs; keep complaints and bounces low', tone: 'good' }, { text: 'Remove hard-bounced addresses immediately', tone: 'good' }],
      scene: { nodes: [msa({ tag: pill('IP + domain reputation', 'gauge') }), mx({ tag: pill('inbox · spam · reject', 'search') }), rcv({ tag: pill('engagement feeds back', 'activity') })], links: [link('msa', 'mx'), link('mx', 'rcv', { style: 'dashed' })], flows: [flow(['msa', 'mx', 'rcv'], { rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Store-and-forward, retried, and increasingly authenticated',
      body: [
        'Email is <b>SMTP relayed via DNS MX lookups</b>; 4xx replies queue and retry with exponential backoff until a give-up window, then bounce; <b>SPF, DKIM and DMARC</b> authenticate the sender’s domain, and <b>reputation</b> decides inbox vs spam.',
        'Size retry queues for the worst outage, authenticate everything, warm up and clean lists, and separate transactional from bulk mail.',
      ],
      scene: { nodes: [sender(), msa(), mx(), box_(), rcv()], links: [link('sender', 'msa'), link('msa', 'mx'), link('mx', 'mbox'), link('mbox', 'rcv')], flows: [flow(['sender', 'msa', 'mx', 'mbox', 'rcv'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
