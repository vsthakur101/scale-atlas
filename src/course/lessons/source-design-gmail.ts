import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const senders = (extra: Partial<SceneNode> = {}) => crowd('senders', -19, 0, 12, 'sending servers (SMTP)', extra);
const mx = (extra: Partial<SceneNode> = {}) => box('mx', -10, 0, 'Inbound SMTP gateways (MX)', 'orange', 'server', { size: [1.6, 1.6], height: 28, ...extra });
const spam = (extra: Partial<SceneNode> = {}) => box('spam', -1, -7, 'Abuse pipeline: auth, reputation, content', 'red', 'shield', { size: [1.6, 1.6], height: 26, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', 8, 0, 'Mailbox store (per-user, sharded)', { size: [1.7, 1.7], ...extra });
const blobs = (extra: Partial<SceneNode> = {}) => disk('blobs', 8, 8, 'Message + attachment blobs (deduplicated)', { size: [3.2, 1.3], height: 14, tone: 'yellow', ...extra });
const idx = (extra: Partial<SceneNode> = {}) => db('idx', 16, -6, 'Per-user search index', { size: [1.4, 1.4], ...extra });
const clients = (extra: Partial<SceneNode> = {}) => box('clients', 16, 6, 'Web / mobile clients (sync by history id)', 'teal', 'user', { size: [1.5, 1.5], height: 24, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);
const fmtMB = (mb: number): string => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`);
const pct = (p: number): string => (p >= 0.99995 ? '99.995%+' : `${(p * 100).toFixed(p > 0.99 ? 3 : 1)}%`);

const lesson: Lesson = {
  slug: 'source-design-gmail',
  title: 'Designing a Webmail System: Mailbox Storage, Search and Spam Filtering',
  blurb: 'Inbound mail at 100 million users: SMTP front doors, a layered abuse filter, per-user sharded mailboxes with labels and threads, deduplicated blobs, per-user search — and the base-rate arithmetic that makes a 99.5% spam filter still lose good mail.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'rate', label: 'Inbound messages per second', icon: 'activity' },
    { key: 'inbox', label: 'Spam reaching an inbox per user per day', icon: 'alert' },
    { key: 'lost', label: 'Good mail filed as spam per user per year', icon: 'shield' },
    { key: 'prec', label: 'Chance a message flagged as spam really is', icon: 'check' },
    { key: 'sto', label: 'Stored mail per user per year (raw, one copy)', icon: 'disk' },
  ],
  goals: [
    { text: 'The path of a message: SMTP in, mailbox out', step: 1 },
    { text: 'Abuse filtering in layers', step: 2 },
    { text: 'The base-rate arithmetic of spam filters', step: 3 },
    { text: 'Mailbox storage: labels, threads, dedup, sharding', step: 4 },
    { text: 'Search, sync and scale', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'users', label: 'Users', min: 1000, max: 2000000000, step: 1000, default: 100000000, unit: '', description: 'Mailboxes.' },
      { key: 'mails', label: 'Messages addressed to each user per day', min: 1, max: 1000, step: 1, default: 100, unit: '', description: 'Inbound, including spam.' },
      { key: 'spam', label: 'Share of inbound mail that is spam', min: 1, max: 99.9, step: 0.1, default: 90, unit: '%', description: 'Base rate of spam.' },
      { key: 'det', label: 'Spam detection rate', min: 50, max: 99.999, step: 0.001, default: 99.5, unit: '%', description: 'Spam correctly caught.' },
      { key: 'fpr', label: 'Good mail wrongly flagged', min: 0.0001, max: 5, step: 0.0001, default: 0.1, unit: '%', description: 'False-positive rate on legitimate mail.' },
      { key: 'kb', label: 'Average message size', min: 1, max: 5000, step: 1, default: 75, unit: ' KB', description: 'Including attachments.' },
    ],
    calculate: (input, step) => {
      const users = Math.max(1, input.users ?? 1e8);
      const mails = Math.max(0, input.mails ?? 100);
      const s = Math.min(0.999, Math.max(0.01, (input.spam ?? 90) / 100));
      const d = Math.min(1, Math.max(0.5, (input.det ?? 99.5) / 100));
      const f = Math.min(1, Math.max(0.000001, (input.fpr ?? 0.1) / 100));
      const kb = Math.max(1, input.kb ?? 75);
      const rate = (users * mails) / 86400;
      const spamDay = mails * s;
      const hamDay = mails * (1 - s);
      const inbox = spamDay * (1 - d);
      const lostYear = hamDay * f * 365;
      // Bayes: P(spam | flagged) = P(flag | spam) P(spam) / P(flag).
      const prec = (s * d) / (s * d + (1 - s) * f);
      const stoMB = ((hamDay * (1 - f) + inbox) * 365 * kb) / 1000;
      return {
        rate: step < 1 ? { v: '—' } : { v: `${fmtN(rate)}/s (${fmtN(users)} × ${mails} ÷ 86,400)` },
        inbox: step < 3 ? { v: '—' } : { v: `${inbox.toFixed(2)} (${fmtN(spamDay)} spam/day × ${((1 - d) * 100).toFixed(1)}% missed)`, tone: inbox < 1 ? 'good' : 'warn' },
        lost: step < 3 ? { v: '—' } : { v: `${lostYear.toFixed(1)} messages (${fmtN(hamDay)} good/day × ${(f * 100).toFixed(2)}% × 365) — ${fmtN(lostYear * users)} across all users`, tone: lostYear < 2 ? 'good' : 'warn' },
        prec: step < 3 ? { v: '—' } : { v: `${pct(prec)} (Bayes: ${(s * 100).toFixed(0)}% base rate × ${(d * 100).toFixed(1)}% detection vs ${(f * 100).toFixed(2)}% FPR)`, tone: 'good' },
        sto: step < 4 ? { v: '—' } : { v: `${fmtMB(stoMB)} of good mail (${fmtN(hamDay)}/day × ${kb} KB), before replication` },
      };
    },
  },
  steps: [
    {
      short: 'Path',
      kind: 'technique',
      title: 'The path of a message: SMTP in, mailbox out',
      body: [
        'A sender’s mail server looks up the recipient domain’s <b>MX records</b> (see the DNS and Email Delivery lessons) and opens an SMTP connection to one of the provider’s <b>inbound gateways</b>. During the SMTP conversation (<code>EHLO</code>, <code>MAIL FROM</code>, <code>RCPT TO</code>, <code>DATA</code>) the gateway can already decide a lot: reject unknown recipients, check the connecting IP’s reputation, validate <b>SPF/DKIM/DMARC</b> authentication of the claimed domain, and apply rate limits — rejecting at SMTP time is cheapest because nothing has been stored. Accepted messages go through content analysis, then are <b>delivered to the recipient’s mailbox</b> and indexed; the user’s clients then fetch them over IMAP, a proprietary web API or a push channel (see the Push Notifications lesson).',
        'The scale is set by inbound volume — <b>100 million users × 100 messages a day ÷ 86,400 ≈ 115,700 messages per second</b> on average, of which the great majority is unwanted — so the architecture is a pipeline of cheap filters first, expensive ones later, and storage last. The design must also never <b>lose accepted mail</b>: once the gateway answers “250 OK” it has taken responsibility, so messages are durably written (replicated) before acknowledgement, with queueing and retry for temporary failures on the outbound side.',
      ],
      scene: { nodes: [senders({ tag: pill('115,700 msgs/s', 'activity') }), mx({ tag: pill('RCPT check · rate limit · SPF', 'filter') }), spam(), store()], links: [link('senders', 'mx'), link('mx', 'spam'), link('spam', 'store')], flows: [flow(['senders', 'mx', 'spam', 'store'], { kind: 'write', rate: 1.8 })] },
    },
    {
      short: 'Filter',
      kind: 'technique',
      title: 'Abuse filtering in layers, cheapest first',
      body: [
        'Run layers in increasing cost so most junk dies early. <b>Connection-level</b>: IP/ASN reputation, DNSBL lists, greylisting, rate limits per sender and per recipient, bad-HELO checks. <b>Authentication</b>: SPF (is this IP allowed to send for the domain?), DKIM (valid signature over headers and body), DMARC (the domain’s policy when they fail) — a message that fails with a <code>p=reject</code> policy is dropped. <b>Reputation of the sending domain and links</b> (URL blocklists, newly registered domains, attachment hashes against malware feeds). <b>Content classifiers</b>: Bayesian word statistics, then machine-learned models over text, headers, structure, images (OCR) and sender behaviour, including <b>user feedback signals</b> (“report spam”, “not spam” and who rescues messages from the spam folder) aggregated across millions of users — the most valuable data a mail provider has.',
        'Responses form a <b>spectrum</b>: reject at SMTP (high-confidence spam, malware), accept and file in <b>Spam</b> (medium confidence; kept 30 days so mistakes are recoverable), accept with a <b>warning banner</b>, or deliver. Attackers adapt — phishing, business-email-compromise (no links, just impersonation), compromised legitimate accounts — so the system retrains continuously, evaluates on held-out recent mail, and monitors false positives as carefully as false negatives. Never silently drop mail after accepting it.',
      ],
      changes: [{ text: 'Layers: IP reputation → SPF/DKIM/DMARC → link/attachment reputation → ML content', tone: 'info' }, { text: 'Spectrum: reject · spam folder (30 days) · banner · deliver', tone: 'info' }, { text: 'User feedback across millions of users is the key signal', tone: 'good' }],
      scene: { nodes: [mx(), spam({ tag: pill('cheap checks first, ML last', 'filter', 'good') }), store({ tag: pill('inbox', 'check') }), box('spamf', 8, 8, 'Spam folder (30 days)', 'red', 'alert', { size: [1.4, 1.4], height: 20 })], links: [link('mx', 'spam'), link('spam', 'store'), link('spam', 'spamf')], flows: [flow(['mx', 'spam', 'store'], { rate: 1.4 }), flow(['spam', 'spamf'], { kind: 'fail', rate: 1.8 })] },
    },
    {
      short: 'Base rate',
      kind: 'insight',
      title: 'Base rates: a 99.5% filter still lets spam through and loses good mail',
      body: [
        'With 90% of inbound mail spam, each user receives 90 spam and 10 good messages a day. A filter that catches <b>99.5%</b> of spam lets <b>0.45</b> spam message per user per day reach the inbox — about three a week. If it wrongly flags <b>0.1%</b> of good mail, that is 10 × 0.001 × 365 = <b>3.65 legitimate messages a year per user</b> sent to the spam folder — <b>365 million</b> good messages across 100 million users. Those two numbers are an inherent trade-off: moving the threshold to catch more spam raises the false-positive rate, and a missed invoice or job offer costs far more than a stray advert, so thresholds are set <i>asymmetrically</i> (and borderline mail goes to the folder, not the void).',
        '<b>Bayes</b> shows why the result looks good <i>on this population</i>: P(spam | flagged) = (0.9 × 0.995) ÷ (0.9 × 0.995 + 0.1 × 0.001) = <b>99.99%</b> — nearly everything in the spam folder is spam, because spam is so common. Change the base rate and the same filter looks different: for a user whose mail is 10% spam, precision drops to 0.1 × 0.995 ÷ (0.0995 + 0.9 × 0.001) = <b>99.1%</b>; for a targeted high-value mailbox where spam is rare, a flagged message is far more likely to be a false positive. Always evaluate classifiers on the <b>base rate of the deployment</b>, report precision and recall separately, and track false positives per user.',
      ],
      changes: [{ text: '99.5% detection: 0.45 spam/day reach each inbox', tone: 'bad' }, { text: '0.1% false positives: 3.65 good messages/year per user filed as spam', tone: 'bad' }, { text: 'P(spam | flagged) = 99.99% at a 90% base rate; 99.1% at 10%', tone: 'info' }],
      concepts: [{ term: 'Base rate', def: 'How common the condition is in the population; it controls how many of a classifier’s positives are true positives, independent of the classifier’s accuracy.' }],
      scene: { nodes: [mx({ tag: pill('90 spam + 10 good per user/day', 'list') }), spam({ tag: pill('99.5% caught · 0.1% FP', 'gauge') }), store({ tag: pill('0.45 spam in inbox', 'alert', 'warn') }), box('spamf', 8, 8, 'Spam folder', 'red', 'alert', { size: [1.4, 1.4], height: 20, tag: pill('0.01 good/day wrongly here', 'alert', 'warn') })], links: [link('mx', 'spam'), link('spam', 'store'), link('spam', 'spamf')], flows: [flow(['mx', 'spam', 'store'], { rate: 1.4 }), flow(['spam', 'spamf'], { rate: 1.4 })] },
    },
    {
      short: 'Storage',
      kind: 'technique',
      title: 'Mailbox storage: labels, threads, dedup and sharding',
      body: [
        'A mailbox is a <b>per-user, append-mostly log of messages with mutable metadata</b>. Shard the store <b>by user id</b>: every operation (list, read, label, search, delete) touches one user, so a user’s data lives on one shard (and its replicas) with local transactions and no cross-shard queries; a directory maps user → shard so hot or large users can be moved (see the Sharding Algorithms lesson). Model <b>labels</b> rather than folders — a message carries a set of labels (Inbox, Starred, a custom tag), so “moving” is a metadata change and a message can appear in several views — and group messages into <b>threads</b> by <code>Message-ID</code>, <code>In-Reply-To</code> and <code>References</code> headers (with subject heuristics). Keep a monotonically increasing <b>history id</b> per mailbox so clients sync “everything since id N”.',
        'Separate <b>bodies from metadata</b>: small, hot, mutable metadata (labels, flags, snippets) in a transactional store; immutable message bodies and attachments as <b>content-addressed blobs</b> in an object/blob store (see the Object Store lesson) — so a 5 MB attachment sent to 50 recipients at the same provider is stored once and referenced 50 times. Capacity: 10 good messages a day × 75 KB = 0.75 MB/day, <b>~286 MB per user per year</b> (10 good messages plus the 0.45 spam that slips through, × 75 KB) before replication; ×3 for replicas, plus indexes (often 20–50% of body size) — tens of petabytes for 100 million users, which is why retention policies, compression, tiering cold mail to cheaper storage and per-user quotas exist.',
      ],
      changes: [{ text: 'Shard by user; labels not folders; threads from Message-ID/References', tone: 'good' }, { text: 'Metadata (transactional) separate from immutable deduplicated blobs', tone: 'good' }, { text: '~286 MB/user/year raw; ×3 replicas + index', tone: 'info' }],
      scene: { nodes: [store({ tag: pill('labels, threads, history id', 'list') }), blobs({ tag: pill('one copy, many references', 'disk', 'good') }), clients({ tag: pill('sync since history id N', 'refresh') })], links: [link('store', 'blobs'), link('store', 'clients')], flows: [flow(['store', 'clients'], { rate: 1.6 })] },
    },
    {
      short: 'Search',
      kind: 'technique',
      title: 'Search, sync and scale',
      body: [
        '<b>Search</b> is per-user: an <b>inverted index</b> per mailbox (term → message ids) with fields for sender, recipient, subject, label, date, attachment type, updated as mail arrives (near-real-time, see the Search Engines and Elasticsearch lessons). Because each user’s index is small (thousands to millions of messages) and queries never span users, indexes shard with the mailbox and queries are fast; the hard parts are the <b>index write rate</b> (115,000 messages/s inbound means indexing every accepted message promptly), tokenisation across languages, and keeping indexes consistent with deletes and label changes. Large attachments are text-extracted asynchronously (PDFs, documents) and added later.',
        '<b>Sync and clients</b>: web and mobile clients keep a local cache and sync deltas from a history id; push notifications (see that lesson) say “mailbox changed”. <b>Reliability</b>: replicate each mailbox across zones with a consensus or primary/follower scheme, ack inbound mail only after durable replication, and keep <b>delete/undo windows</b> (trash for 30 days) because users delete by mistake. <b>Abuse also runs outbound</b>: compromised accounts spam the world, so rate limits and anomaly detection protect the provider’s sending reputation. Figures here are model outputs from the stated population, base rates and sizes.',
      ],
      changes: [{ text: 'Per-user inverted index, sharded with the mailbox; async attachment text', tone: 'good' }, { text: 'Delta sync by history id + push; undo and trash windows', tone: 'good' }, { text: 'Ack inbound only after replicated write; throttle outbound abuse', tone: 'info' }],
      scene: { nodes: [store(), idx({ tag: pill('terms → message ids', 'search') }), clients({ tag: pill('search: from:alice has:attachment', 'search') }), spam({ tag: pill('outbound abuse limits', 'shield') })], links: [link('store', 'idx'), link('idx', 'clients'), link('spam', 'store')], flows: [flow(['store', 'idx'], { kind: 'write', rate: 1.6 }), flow(['idx', 'clients'], { rate: 1.4, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Cheap filters first, per-user storage, honest base-rate maths',
      body: [
        'Inbound mail (~115,700/s here) passes layered abuse filters at SMTP and content level, then lands in a <b>per-user sharded mailbox</b> (labels, threads, history id) with <b>deduplicated blobs</b> and a <b>per-user search index</b>. A 99.5%-detection, 0.1%-FP filter at a 90% spam base rate leaves 0.45 spam a day in each inbox and files ~3.65 good messages a year in spam, while flagged mail is 99.99% truly spam.',
        'Reject early, never drop accepted mail, evaluate at the deployment’s base rate.',
      ],
      scene: { nodes: [senders(), mx(), spam(), store(), blobs(), idx()], links: [link('senders', 'mx'), link('mx', 'spam'), link('spam', 'store'), link('store', 'blobs'), link('store', 'idx')], flows: [flow(['senders', 'mx', 'spam', 'store'], { kind: 'write', rate: 1.8 })] },
    },
  ],
};

export default lesson;
