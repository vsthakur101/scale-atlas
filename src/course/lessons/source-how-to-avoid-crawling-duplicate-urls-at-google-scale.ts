import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const frontier = (extra: Partial<SceneNode> = {}) => db('frontier', -18, 0, 'URL frontier (per-host queues)', { size: [1.7, 1.7], ...extra });
const norm = (extra: Partial<SceneNode> = {}) => box('norm', -9, -6, 'URL canonicaliser', 'orange', 'filter', { size: [1.4, 1.4], height: 24, ...extra });
const seen = (extra: Partial<SceneNode> = {}) => db('seen', -1, -6, 'URL-seen test (sharded Bloom / hash set)', { size: [1.6, 1.6], ...extra });
const fetchers = (extra: Partial<SceneNode> = {}) => crowd('fetchers', 8, 0, 10, 'fetchers (polite, per host)', extra);
const fp = (extra: Partial<SceneNode> = {}) => box('fp', 8, 8, 'Content fingerprints (hash, simhash)', 'purple', 'hash', { size: [1.5, 1.5], height: 24, ...extra });
const store = (extra: Partial<SceneNode> = {}) => disk('store', 17, 0, 'Page store (unique content only)', { size: [3, 1.2], height: 14, tone: 'yellow', ...extra });
const trap = (extra: Partial<SceneNode> = {}) => box('trap', -9, 8, 'Crawler trap (infinite URLs)', 'red', 'alert', { size: [1.4, 1.4], height: 22, ...extra });

const fmtN = (n: number): string => (n >= 1e12 ? `${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtB = (b: number): string => (b >= 1e15 ? `${(b / 1e15).toFixed(1)} PB` : b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(0)} MB`);

const lesson: Lesson = {
  slug: 'source-how-to-avoid-crawling-duplicate-urls-at-google-scale',
  title: 'Crawler Deduplication: URL Canonicalisation, Bloom Filters and Near-Duplicate Content',
  blurb: 'A web crawler meets the same page through thousands of URL spellings and the same content under different URLs. Normalise URLs, answer “seen it?” for 100 billion of them in a sharded Bloom filter or hash set — with the memory arithmetic — then fingerprint content for exact and near duplicates.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'bloom', label: 'Bloom filter memory for the URL-seen test', icon: 'disk' },
    { key: 'hashes', label: 'Bits per URL and hash functions', icon: 'hash' },
    { key: 'miss', label: 'Novel pages lost to false positives per day', icon: 'alert' },
    { key: 'exact', label: 'Exact fingerprint set instead (8 B each)', icon: 'db' },
    { key: 'bw', label: 'Fetch volume avoided by content dedup per day', icon: 'wifi' },
  ],
  goals: [
    { text: 'Why duplicates are the crawler’s main waste', step: 1 },
    { text: 'URL normalisation and canonical URLs', step: 2 },
    { text: 'The URL-seen test: Bloom filter vs exact set', step: 3 },
    { text: 'Content duplicates: exact hashes and simhash', step: 4 },
    { text: 'Traps, politeness and sharding', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'urls', label: 'URLs ever seen', min: 1000000, max: 1000000000000, step: 1000000, default: 100000000000, unit: '', description: 'Distinct URLs the crawler has encountered.' },
      { key: 'fpr', label: 'Bloom false-positive rate', min: 0.0001, max: 10, step: 0.0001, default: 1, unit: '%', description: 'Chance a never-seen URL is wrongly reported “seen”.' },
      { key: 'chk', label: 'URLs checked per day', min: 1000000, max: 1000000000000, step: 1000000, default: 20000000000, unit: '', description: 'Links extracted and tested against the seen set.' },
      { key: 'nov', label: 'Share of checked URLs that are new', min: 0.1, max: 100, step: 0.1, default: 25, unit: '%', description: 'Never seen before.' },
      { key: 'fb', label: 'Bytes per stored fingerprint', min: 4, max: 32, step: 1, default: 8, unit: ' B', description: '64-bit hash of the canonical URL.' },
      { key: 'rate', label: 'Pages fetched per second', min: 100, max: 5000000, step: 100, default: 50000, unit: '/s', description: 'Crawl throughput.' },
      { key: 'dup', label: 'Fetched pages that duplicate known content', min: 0, max: 90, step: 1, default: 30, unit: '%', description: 'Same or near-same content under another URL.' },
      { key: 'kb', label: 'Average page size fetched', min: 5, max: 5000, step: 5, default: 100, unit: ' KB', description: 'Bytes per fetch.' },
    ],
    calculate: (input, step) => {
      const urls = Math.max(1, input.urls ?? 1e11);
      const p = Math.min(0.5, Math.max(1e-6, (input.fpr ?? 1) / 100));
      const chk = Math.max(0, input.chk ?? 2e10);
      const nov = Math.min(1, Math.max(0, (input.nov ?? 25) / 100));
      const fb = Math.max(1, input.fb ?? 8);
      const rate = Math.max(1, input.rate ?? 5e4);
      const dup = Math.min(1, Math.max(0, (input.dup ?? 30) / 100));
      const kb = Math.max(1, input.kb ?? 100);
      // Optimal Bloom filter: m/n = −ln p / (ln 2)², k = (m/n)·ln 2.
      const bpu = -Math.log(p) / (Math.LN2 * Math.LN2);
      const k = Math.max(1, Math.round(bpu * Math.LN2));
      const bytes = (urls * bpu) / 8;
      const missed = chk * nov * p;
      const exact = urls * fb;
      const saved = rate * 86400 * dup * kb * 1000;
      return {
        bloom: step < 3 ? { v: '—' } : { v: `${fmtB(bytes)} (${fmtB(bytes / 100)} per shard across 100)`, tone: 'good' },
        hashes: step < 3 ? { v: '—' } : { v: `${bpu.toFixed(2)} bits/URL · k = ${k} hashes` },
        miss: step < 3 ? { v: '—' } : { v: `${fmtN(missed)} pages (${fmtN(chk * nov)} new × ${(p * 100).toFixed(2)}%)`, tone: missed < 1e7 ? 'good' : 'warn' },
        exact: step < 3 ? { v: '—' } : { v: `${fmtB(exact)} (${(exact / Math.max(1, bytes)).toFixed(1)}× the Bloom filter, no false positives)` },
        bw: step < 4 ? { v: '—' } : { v: `${fmtB(saved)}/day (${fmtN(rate * 86400 * dup)} fetches × ${kb} KB)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Waste',
      kind: 'problem',
      title: 'Duplicates are most of what a naive crawler fetches',
      body: [
        'A crawler follows links: fetch a page, extract its URLs, add unseen ones to the <b>frontier</b>, repeat. Without care it re-fetches enormous amounts. The same page is reachable by many <b>URL spellings</b> (<code>HTTP://Example.com:80/a/../b?x=1&amp;y=2</code> vs <code>http://example.com/b?y=2&amp;x=1#top</code>), through session ids and tracking parameters (<code>?utm_source=…</code>), via redirects, with and without <code>www</code>, and under mirrors. And different URLs often serve <b>identical or near-identical content</b> — syndicated articles, printer-friendly versions, paginated lists with the same items.',
        'Each wasted fetch costs bandwidth, fetcher time, the target site’s capacity (a politeness violation), and downstream storage and indexing. At 50,000 pages/s with 30% duplicate content, that’s <b>130 terabytes of pointless downloads a day</b>. Worse, some sites generate <b>infinite distinct URLs</b> (calendars, session-id loops) that trap a crawler forever. Deduplication happens at two levels — <b>URLs before fetching</b>, <b>content after</b> — and both must scale to hundreds of billions of items.',
      ],
      scene: { nodes: [frontier({ tag: pill('links from every page', 'list') }), fetchers({ tag: pill('30% fetch known content', 'alert', 'warn') }), trap({ tag: pill('/cal?d=2031-05-17…', 'alert', 'bad') }), store()], links: [link('frontier', 'fetchers'), link('fetchers', 'store'), link('trap', 'frontier', { style: 'dashed' })], flows: [flow(['frontier', 'fetchers', 'store'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Normalise',
      kind: 'technique',
      title: 'URL canonicalisation',
      body: [
        'Before testing whether a URL was seen, reduce it to a <b>canonical form</b> (RFC 3986 normalisation plus crawler policy): lower-case scheme and host; remove the default port (<code>:80</code>, <code>:443</code>); resolve <code>.</code> and <code>..</code> path segments; percent-decode unreserved characters and upper-case hex escapes; strip the <b>fragment</b> (<code>#top</code> never reaches the server); <b>sort query parameters</b> and drop known tracking and session parameters (<code>utm_*</code>, <code>gclid</code>, <code>sessionid</code>); collapse repeated slashes and decide on trailing slash and default documents (<code>index.html</code>); resolve relative links against the page’s base URL. Treat <code>www.</code> and non-<code>www.</code> hosts as the same only when verified (compare fetched content).',
        'Use the site’s own signals: follow <b>redirects</b> and record the final URL as canonical; honour <code>&lt;link rel="canonical"&gt;</code> and <code>rel="alternate"</code> hints (as hints, not commands — they can be wrong or abused); read <code>sitemap.xml</code> for the site’s declared URLs. <b>Per-site learned rules</b> catch the rest: if two URLs differing only in parameter <code>ref</code> repeatedly return identical content, drop that parameter for the host. Canonicalisation is cheap (CPU, no I/O) and typically removes a large share of duplicate URLs before any network or memory cost.',
      ],
      changes: [{ text: 'Lower-case host, drop default port and fragment, resolve dot-segments, sort params', tone: 'good' }, { text: 'Strip tracking/session parameters; follow redirects; use canonical hints with care', tone: 'good' }, { text: 'Learn per-host parameter rules from identical content', tone: 'info' }],
      scene: { nodes: [frontier({ tag: pill('HTTP://Ex.com:80/a/../b?y=2&x=1#top', 'list') }), norm({ tag: pill('→ http://ex.com/b?x=1&y=2', 'check', 'good') }), seen()], links: [link('frontier', 'norm'), link('norm', 'seen')], flows: [flow(['frontier', 'norm', 'seen'], { rate: 1.6 })] },
    },
    {
      short: 'URL-seen',
      kind: 'technique',
      title: 'The URL-seen test: Bloom filter vs exact set',
      body: [
        'For every extracted link the crawler asks “have I seen this canonical URL?” — tens of billions of times a day against a set of 100 billion. Storing the URLs themselves (averaging 80+ bytes) needs 8+ TB; storing a <b>64-bit fingerprint</b> of each needs 100B × 8 B = <b>800 GB</b> (exact, apart from 2⁻⁶⁴-scale collisions). A <b>Bloom filter</b> (see that lesson) answers membership in far less space: for a 1% false-positive rate it needs −ln(0.01) ÷ (ln 2)² = <b>9.6 bits per URL</b> with 7 hash functions: <b>120 GB</b> for 100 billion — 6.7× smaller than fingerprints — and constant-time lookups.',
        'The catch is the false positive: a <i>new</i> URL that the filter wrongly says it has seen is <b>never crawled</b>. With 20 billion checks a day of which 25% are new, 1% false positives silently drop <b>50 million novel pages every day</b> (and the lost URL is still “seen” tomorrow). Mitigate with a lower rate (0.1% costs 14.4 bits/URL: 180 GB), a <b>two-stage test</b> (Bloom as a fast negative filter, then an exact check against a disk-backed set only on “seen” answers — which are mostly true — and for URLs from important hosts), or counting/ scalable Bloom filters that can grow. <b>Shard by host hash</b> so each shard holds ~1.2 GB in RAM and all URLs of a site live together, which also keeps the per-host queue and politeness state local.',
      ],
      changes: [{ text: 'Fingerprint set: 100B × 8 B = 800 GB; Bloom @1%: 9.6 bits/URL = 120 GB', tone: 'info' }, { text: '1% false positives lose 50M new pages/day', tone: 'bad' }, { text: 'Shard by host; Bloom as a negative filter + exact check to confirm', tone: 'good' }],
      concepts: [{ term: 'URL-seen test', def: 'The membership check that stops the crawler adding a URL to its frontier twice; a Bloom filter makes it cheap in memory at the price of occasional false “seen” answers.' }],
      scene: { nodes: [norm(), seen({ tag: pill('120 GB across 100 shards', 'db', 'good') }), frontier({ tag: pill('only unseen URLs', 'check', 'good') })], links: [link('norm', 'seen'), link('seen', 'frontier')], flows: [flow(['norm', 'seen', 'frontier'], { rate: 1.8 })] },
    },
    {
      short: 'Content',
      kind: 'technique',
      title: 'Content duplicates: exact hashes and simhash',
      body: [
        'After fetching, <b>exact duplicate</b> content is caught by hashing the (normalised) body — strip markup boilerplate, whitespace and volatile elements — and looking the digest up in a fingerprint set: identical bytes under 5 URLs are stored and indexed once, and the URLs are grouped in a cluster. <b>Near-duplicates</b> (the same article with a different ad block and timestamp) need similarity, not equality. <b>Simhash</b> maps a document to a 64-bit fingerprint where <i>similar documents have fingerprints differing in few bits</i>: hash each word/shingle, sum +1/−1 per bit position weighted by term importance, keep the sign. Two pages are near-duplicates if their Hamming distance is ≤ 3.',
        'Searching “all fingerprints within Hamming distance 3” across billions would be impractical by scanning, so use the pigeonhole trick (Manku et al., Google): split the 64 bits into <b>k + 1 = 4</b> blocks; any two fingerprints within 3 bits must agree <i>exactly</i> on at least one block. Keep sorted tables indexed on each block (or its permutation), look up exact matches on a block, then verify the full Hamming distance on that small candidate set. (<b>MinHash</b> with locality-sensitive hashing does the equivalent for Jaccard similarity of shingle sets.) Removing 30% duplicate fetches/stores at 50,000 pages/s and 100 KB saves <b>130 TB of fetching a day</b> — dedup by content before indexing also saves storage and keeps search results diverse.',
      ],
      changes: [{ text: 'Exact: hash the normalised body; cluster identical pages', tone: 'good' }, { text: 'Near-dup: simhash, Hamming distance ≤ 3, 4-block pigeonhole lookup', tone: 'good' }, { text: '30% duplicates ≈ 130 TB/day of fetches avoided at 50k pages/s', tone: 'good' }],
      scene: { nodes: [fetchers({ tag: pill('page body', 'file') }), fp({ tag: pill('hash + simhash', 'hash', 'good') }), store({ tag: pill('unique content only', 'check', 'good') })], links: [link('fetchers', 'fp'), link('fp', 'store')], flows: [flow(['fetchers', 'fp', 'store'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Traps',
      kind: 'tradeoff',
      title: 'Traps, politeness and sharding',
      body: [
        '<b>Crawler traps</b> generate unbounded URL spaces: calendars (<code>?date=…</code> into the year 9999), faceted navigation (every filter combination), session-id URLs, relative-link loops (<code>/a/b/a/b/…</code>). Defences: <b>depth and path-repetition limits</b>, a <b>maximum URL length and parameter count</b>, a <b>per-host page budget</b> scaled to the host’s importance (PageRank-like score), detecting <b>patterns that keep yielding duplicate or empty content</b>, and prioritising by estimated value so traps fall to the bottom of the frontier instead of being blocked outright. Honour <code>robots.txt</code> and <b>crawl-delay</b>: <b>politeness</b> means limiting concurrent connections and requests per host, which the per-host queue structure enforces.',
        '<b>Architecture</b>: partition the URL space by <b>host hash</b> across crawler shards, so each shard owns the frontier queues, politeness state, URL-seen filter, and DNS/robots caches for its hosts; links to other shards’ hosts are forwarded in batches. Keep the filter durable (periodic snapshots plus a log) so a restart doesn’t re-crawl the web, and re-crawl on a <b>freshness schedule</b> (a “seen” URL still needs periodic revisits — the seen set prevents <i>re-discovery</i>, while a separate scheduler decides re-fetching by change rate). Metrics: duplicate-fetch rate, false-positive losses (audit with a sample exact check), trap-host detection, memory per shard. All figures here are model outputs for the stated corpus and rates.',
      ],
      changes: [{ text: 'Depth, length and per-host budgets; value-based frontier priority', tone: 'good' }, { text: 'Shard by host: frontier, politeness, seen-set and robots cache are local', tone: 'good' }, { text: 'Seen-set prevents re-discovery; revisits are scheduled separately', tone: 'info' }],
      scene: { nodes: [trap({ tag: pill('budget exhausted → deprioritised', 'shield', 'good') }), frontier({ tag: pill('per-host queues + crawl-delay', 'queue') }), fetchers({ tag: pill('shard by host hash', 'hash') }), seen()], links: [link('trap', 'frontier', { style: 'dashed' }), link('frontier', 'fetchers'), link('fetchers', 'seen')], flows: [flow(['frontier', 'fetchers', 'seen'], { rate: 1.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Canonicalise, test cheaply, fingerprint content',
      body: [
        '<b>Canonicalise</b> URLs, test “seen?” with a <b>host-sharded Bloom filter</b> (9.6 bits/URL → 120 GB for 100B URLs, with 1% false positives costing ~50M new pages/day) or an exact fingerprint set (800 GB), then <b>fingerprint content</b> — exact hash and simhash with a pigeonhole lookup — to avoid fetching and storing duplicates (~130 TB/day here).',
        'Defend against traps with budgets and priorities, stay polite per host, and schedule revisits separately.',
      ],
      scene: { nodes: [frontier(), norm(), seen(), fetchers(), fp(), store()], links: [link('frontier', 'norm'), link('norm', 'seen'), link('seen', 'fetchers'), link('fetchers', 'fp'), link('fp', 'store')], flows: [flow(['frontier', 'norm', 'seen', 'fetchers'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
