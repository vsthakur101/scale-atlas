import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const caller = (extra: Partial<SceneNode> = {}) => box('caller', -17, 0, 'Caller (encode)', 'teal', 'server', { size: [1.4, 1.4], height: 26, ...extra });
const wire = (extra: Partial<SceneNode> = {}) => box('wire', -4, 0, 'Network link', 'blue', 'wifi', { size: [1.8, 1.2], height: 12, ...extra });
const callee = (extra: Partial<SceneNode> = {}) => box('callee', 9, 0, 'Callee (decode)', 'orange', 'server', { size: [1.4, 1.4], height: 26, ...extra });
const schema = (extra: Partial<SceneNode> = {}) => db('schema', -4, -8, 'Schema (.proto / Avro) in a registry', { size: [1.4, 1.4], ...extra });
const old = (extra: Partial<SceneNode> = {}) => box('old', 9, 8, 'Older consumer (schema v1)', 'red', 'server', { size: [1.2, 1.2], height: 20, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(1) : `${Math.round(n)}`);
const fmtBw = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB/s` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB/s` : `${Math.round(b / 1e3)} KB/s`);

const lesson: Lesson = {
  slug: 'academy-how-linkedin-adopted-protocol-buffers-to-reduce-latency-by-60',
  title: 'Serialization Formats: JSON vs Protocol Buffers vs Avro',
  blurb: 'Text formats repeat every field name in every message; binary formats with a schema send numbers and values. Compare payload size, CPU for encode/decode, bandwidth and per-call latency — and what schema evolution rules keep old and new services compatible.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'size', label: 'Message size: JSON → binary', icon: 'file' },
    { key: 'bw', label: 'Bandwidth at this request rate', icon: 'gauge' },
    { key: 'cpu', label: 'CPU cores spent on encode + decode', icon: 'cpu' },
    { key: 'lat', label: 'Per-message time over the link + codec', icon: 'clock' },
  ],
  goals: [
    { text: 'What serialization must do', step: 1 },
    { text: 'JSON: self-describing text', step: 2 },
    { text: 'Protobuf and Avro: schema-driven binary', step: 3 },
    { text: 'The numbers: size, CPU and latency', step: 4 },
    { text: 'Schema evolution and compatibility rules', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'fail'],
  dynamic: {
    parameters: [
      { key: 'rps', label: 'Messages per second', min: 100, max: 50000000, step: 100, default: 500000, unit: '/s', description: 'Calls or events serialised each second.' },
      { key: 'json', label: 'JSON message size', min: 50, max: 1000000, step: 10, default: 2000, unit: ' B', description: 'Encoded size including field names and quotes.' },
      { key: 'ratio', label: 'Binary size as a share of JSON', min: 10, max: 100, step: 1, default: 35, unit: '%', description: 'Typical protobuf/Avro: 25–60% for field-heavy records.' },
      { key: 'jmb', label: 'JSON encode/decode speed', min: 20, max: 2000, step: 10, default: 300, unit: ' MB/s', description: 'Per core, over encoded bytes.' },
      { key: 'bmb', label: 'Binary encode/decode speed', min: 20, max: 4000, step: 10, default: 800, unit: ' MB/s', description: 'Per core, over encoded bytes.' },
      { key: 'link', label: 'Link bandwidth', min: 0.1, max: 40000, step: 0.1, default: 20, unit: ' Mbps', description: 'Mobile ≈ 5–50 Mbps; a datacentre link ≈ 10,000+.' },
    ],
    calculate: (input, step) => {
      const rps = Math.max(1, input.rps ?? 5e5);
      const json = Math.max(1, input.json ?? 2000);
      const ratio = Math.min(1, Math.max(0.05, (input.ratio ?? 35) / 100));
      const bin = json * ratio;
      const jmb = Math.max(0.1, input.jmb ?? 300) * 1e6;
      const bmb = Math.max(0.1, input.bmb ?? 800) * 1e6;
      const link = Math.max(0.01, input.link ?? 20) * 1e6 / 8;
      // CPU: each message is encoded once and decoded once.
      const cpuJ = (2 * json * rps) / jmb;
      const cpuB = (2 * bin * rps) / bmb;
      const tJ = json / link + (2 * json) / jmb;
      const tB = bin / link + (2 * bin) / bmb;
      return {
        size: step < 2 ? { v: '—' } : { v: `${fmtN(json)} B → ${fmtN(bin)} B (${((1 - ratio) * 100).toFixed(0)}% smaller)`, tone: 'good' },
        bw: step < 4 ? { v: '—' } : { v: `${fmtBw(json * rps)} → ${fmtBw(bin * rps)}`, tone: 'good' },
        cpu: step < 4 ? { v: '—' } : { v: `${cpuJ.toFixed(1)} → ${cpuB.toFixed(1)} cores`, tone: cpuB < cpuJ ? 'good' : 'warn' },
        lat: step < 4 ? { v: '—' } : { v: `${(tJ * 1000).toFixed(2)} ms → ${(tB * 1000).toFixed(2)} ms (${((1 - tB / tJ) * 100).toFixed(0)}% less)`, tone: tB < tJ ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Job',
      kind: 'insight',
      title: 'Turn in-memory objects into bytes, and back',
      body: [
        '<b>Serialization</b> converts a data structure into a byte sequence for a wire or disk, and <b>deserialization</b> rebuilds it on the other side — possibly in a different language, on a different CPU architecture, years later. The format fixes <b>size</b> (bandwidth, storage), <b>CPU</b> (every service call pays for encode and decode), <b>human readability</b> (debugging), <b>schema evolution</b> (can old and new code exchange data?) and <b>safety</b> (parsers handle untrusted input).',
        'At service-to-service scale the choice is measurable. At 500,000 messages/s even microseconds per message become full cores, and each byte becomes cost on every hop (see the Back-of-the-Envelope lesson). The comparison below uses an illustrative 2 KB record with many named fields — the kind of rich object that dominates internal APIs.',
      ],
      scene: { nodes: [caller({ tag: pill('object → bytes', 'file') }), wire(), callee({ tag: pill('bytes → object', 'file') })], links: [link('caller', 'wire'), link('wire', 'callee')], flows: [flow(['caller', 'wire', 'callee'], { rate: 1.6 })] },
    },
    {
      short: 'JSON',
      kind: 'technique',
      title: 'JSON: self-describing text',
      body: [
        '<b>JSON</b> is text with named fields: <code>{"memberId": 12345, "firstName": "Ada", "connections": [..]}</code>. It is <b>self-describing</b> (the keys travel with the data), universal (every language and browser parses it), human-readable, trivially debuggable with <code>curl</code>, and schema-optional — which is why it is the default for public APIs and browser clients.',
        'The costs are intrinsic: every message repeats <b>every field name</b> as quoted text, numbers are decimal strings (<code>1234567890</code> is 10 bytes where a 32-bit varint is 5 or fewer), binary data must be base64-encoded (+33%), and parsing means scanning characters, handling escapes and Unicode, allocating strings and building maps — slower and more allocation-heavy than reading fixed-layout binary. No schema also means no compile-time check that producer and consumer agree; mismatches surface at run time. (Compression — gzip/brotli — recovers much of the size, since keys repeat, but costs CPU and doesn’t reduce parse work.)',
      ],
      changes: [{ text: 'Self-describing, universal, debuggable', tone: 'good' }, { text: 'Repeats field names; decimal numbers; base64 binary (+33%)', tone: 'bad' }, { text: 'Text scanning + allocation = slower decode', tone: 'bad' }],
      scene: { nodes: [caller({ tag: pill('{"memberId":12345,…}', 'doc') }), wire({ tag: pill('2,000 B', 'file', 'warn') }), callee({ tag: pill('scan, unescape, allocate', 'cpu', 'warn') })], links: [link('caller', 'wire'), link('wire', 'callee')], flows: [flow(['caller', 'wire', 'callee'], { kind: 'heavy', rate: 2.4 })] },
    },
    {
      short: 'Binary',
      kind: 'technique',
      title: 'Protobuf and Avro: schema-driven binary',
      body: [
        '<b>Protocol Buffers</b> define messages in a <code>.proto</code> schema: each field has a <b>number</b>, a name and a type (<code>int64 member_id = 1; string first_name = 2;</code>). On the wire a field is <b>(field number, wire type) + value</b>: the tag is usually one byte, integers use <b>varints</b> (small numbers take 1–2 bytes), and strings are length-prefixed. Names never travel; absent fields cost nothing; the decoder uses generated code for the schema, with no string-key lookups. <b>Avro</b> goes further: the data carries <i>no per-field tags at all</i> — the reader needs the <b>writer’s schema</b> (shipped once in a file header or fetched by id from a <b>schema registry</b>) and decodes fields in order, giving the smallest payloads and strong schema-evolution tooling (popular with Kafka and data lakes).',
        'Typical savings for field-heavy records are 2–4× smaller (here a 35% ratio: 2,000 → 700 B) and several times faster to parse. Costs: <b>not human-readable</b> (you need tooling and the schema to inspect traffic), a <b>build step</b> for code generation, and <b>discipline</b> about schema changes. They pair naturally with <b>gRPC</b> (protobuf over HTTP/2 — see that lesson) for service-to-service calls, while browsers and third parties still often get JSON or JSON-transcoded views of the same schema.',
      ],
      changes: [{ text: 'Protobuf: (field number, type) + varints; names never sent', tone: 'good' }, { text: 'Avro: no tags; reader uses the writer’s schema from a registry', tone: 'good' }, { text: 'Opaque on the wire: need schema + tooling to debug', tone: 'bad' }],
      concepts: [{ term: 'Varint', def: 'A variable-length integer encoding where small values use few bytes (1 byte up to 127), saving space on typical IDs and counters.' }],
      scene: { nodes: [caller({ tag: pill('field 1: varint · field 2: len+bytes', 'hash', 'good') }), schema({ tag: pill('generated codecs', 'file') }), wire({ tag: pill('700 B', 'file', 'good') }), callee({ tag: pill('fixed-layout decode', 'cpu', 'good') })], links: [link('caller', 'wire'), link('wire', 'callee'), link('schema', 'caller', { style: 'dashed' }), link('schema', 'callee', { style: 'dashed' })], flows: [flow(['caller', 'wire', 'callee'], { rate: 2.4 })] },
    },
    {
      short: 'Numbers',
      kind: 'insight',
      title: 'The numbers: size, CPU and latency',
      body: [
        'With 500,000 messages/s: JSON at 2,000 B is <b>1.0 GB/s</b> of traffic; binary at 700 B is <b>350 MB/s</b> — 65% less. CPU: each message is encoded once and decoded once, so JSON at 300 MB/s costs 2 × 2,000 × 500,000 ÷ 300 MB/s = <b>6.7 cores</b>; binary at 800 MB/s costs 2 × 700 × 500,000 ÷ 800 MB/s = <b>0.9 cores</b> — a 7× reduction that also shrinks garbage-collection pressure from fewer allocations.',
        'Per-call latency matters most on <b>slow links</b>: over a 20 Mbps mobile connection (2.5 MB/s), a 2,000 B message takes 0.8 ms to transmit plus 13 µs of codec time; 700 B takes 0.28 ms plus 2 µs: <b>about 65% less time per message</b> — the sort of gain behind reported latency reductions from adopting binary formats, which depend heavily on payload shape, language runtime and network. In a datacentre (10 Gbps) transfer is negligible and CPU/serialisation dominates. Measure with <i>your</i> payloads: tiny messages or ones dominated by large strings and blobs see far less benefit, and compression narrows the size gap.',
      ],
      changes: [{ text: '500k/s: 1.0 GB/s → 350 MB/s; 6.7 → 0.9 cores', tone: 'good' }, { text: 'Biggest latency wins on slow links; CPU wins in the datacentre', tone: 'info' }],
      scene: { nodes: [caller(), wire({ tag: pill('1.0 GB/s → 350 MB/s', 'gauge', 'good') }), callee({ tag: pill('6.7 → 0.9 cores', 'cpu', 'good') })], links: [link('caller', 'wire'), link('wire', 'callee')], flows: [flow(['caller', 'wire', 'callee'], { rate: 2.4 })] },
    },
    {
      short: 'Evolve',
      kind: 'tradeoff',
      title: 'Schema evolution: keep old and new talking',
      body: [
        'Services deploy independently, so producers and consumers run <b>different schema versions at the same time</b> — compatibility is the real engineering problem. <b>Backward compatible</b>: new readers can read old data; <b>forward compatible</b>: old readers can read new data; <b>full</b>: both. Protobuf’s rules: <b>never change or reuse a field number</b> (it is the identity on the wire), add new fields as optional with sensible defaults (old readers <b>skip unknown fields</b>; new readers see defaults for missing ones), <b>reserve</b> removed numbers and names, and don’t change a field’s type incompatibly (int32 → string breaks decoding). Avoid <code>required</code> — it makes removal impossible.',
        'Avro resolves <b>writer schema vs reader schema</b> by field name: fields can be added with defaults or removed if they had defaults; a <b>schema registry</b> stores versions and enforces a compatibility mode on publish, so an incompatible change fails in CI rather than in production (see the Kafka and Change Data Capture lessons). JSON has no enforcement, so use JSON Schema/OpenAPI contracts and contract tests. For all formats: version through <b>additive changes</b>, deprecate before removing, deploy consumers before producers when making backward-incompatible-sensitive changes, and monitor deserialisation errors. All figures here are model outputs with assumed throughputs.',
      ],
      changes: [{ text: 'Never reuse a field number; add optional fields; reserve removed ones', tone: 'good' }, { text: 'Registry enforces compatibility on publish', tone: 'good' }, { text: 'Changing a type or removing a required field breaks old readers', tone: 'bad' }],
      scene: { nodes: [caller({ name: 'Producer (schema v2)', tag: pill('adds field 7', 'check', 'good') }), schema({ tag: pill('compat check: backward', 'shield', 'good') }), callee({ name: 'Consumer (schema v2)' }), old({ tag: pill('skips unknown field 7', 'check') })], links: [link('caller', 'callee'), link('caller', 'old'), link('schema', 'caller', { style: 'dashed' })], flows: [flow(['caller', 'callee'], { rate: 1.8 }), flow(['caller', 'old'], { rate: 1.4 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Names once in a schema, not in every message',
      body: [
        '<b>JSON</b> is self-describing and universal but repeats names and parses slowly. <b>Protobuf</b> and <b>Avro</b> move the names into a schema: ~65% smaller, ~7× less CPU in this model, at the cost of readability and a build/registry workflow.',
        'Protect compatibility with additive changes, stable field numbers, a registry or contract tests, and measure with your own payloads and links.',
      ],
      scene: { nodes: [caller(), wire(), callee(), schema()], links: [link('caller', 'wire'), link('wire', 'callee'), link('schema', 'caller', { style: 'dashed' }), link('schema', 'callee', { style: 'dashed' })], flows: [flow(['caller', 'wire', 'callee'], { rate: 2 })] },
    },
  ],
};

export default lesson;
