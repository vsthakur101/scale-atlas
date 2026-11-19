import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const user = (extra: Partial<SceneNode> = {}) => box('user', -14, 0, 'PUT object', 'green', 'user', { size: [1.2, 1.2], height: 24, ...extra });
const shard = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}): SceneNode =>
  box(`s${i}`, 6, (i - (n - 1) / 2) * 3.2, name, 'blue', 'disk', { size: [1.1, 1.1], height: 18, ...extra });
const shards = (n: number, data: number, extra: (i: number) => Partial<SceneNode> = () => ({})) =>
  Array.from({ length: n }, (_, i) => shard(i, n, i < data ? `data ${i + 1}` : `parity ${i - data + 1}`, { tone: i < data ? 'blue' : 'orange', ...extra(i) }));
const fan = (n: number) => Array.from({ length: n }, (_, i) => link('enc', `s${i}`, { arrow: 'end' }));
const fanFlow = (n: number) => Array.from({ length: n }, (_, i) => flow(['enc', `s${i}`], { kind: 'write', rate: 0.8 }));
const enc = (extra: Partial<SceneNode> = {}) => box('enc', -4, 0, 'Encoder', 'teal', 'layers', { size: [1.3, 1.3], height: 28, ...extra });

const binom = (n: number, k: number): number => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
/** Annual probability of losing an object: first shard fails, then more than m−1 more fail within one repair window. */
function lossPerYear(n: number, m: number, afr: number, repairH: number): number {
  const q = (afr * repairH) / 8760;
  return Math.min(1, n * afr * binom(n - 1, m) * Math.pow(q, m));
}
const nines = (p: number): number => (p <= 0 ? 99 : Math.max(0, -Math.log10(p)));
const fmtNines = (x: number): string => (x >= 20 ? '> 20 nines' : `${x.toFixed(1)} nines`);

const lesson: Lesson = {
  slug: 'academy-how-amazon-s3-achieves-99-999999999-durability',
  title: 'Eleven Nines: How Object Stores Stay Durable',
  blurb: 'Replication versus erasure coding, a failure-and-repair model you can play with, and why correlated failures — not disks — are what really threaten data.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'ec', label: 'Erasure-coded durability', icon: 'shield' },
    { key: 'rep', label: '3× replication durability', icon: 'layers' },
    { key: 'over', label: 'Storage overhead (EC vs 3×)', icon: 'disk' },
    { key: 'repair', label: 'Read traffic to repair one shard', icon: 'refresh' },
  ],
  goals: [
    { text: 'What “eleven nines” does and does not promise', step: 1 },
    { text: 'Why replicating three times is expensive', step: 2 },
    { text: 'How k data + m parity shards survive m losses', step: 3 },
    { text: 'The failure/repair model: durability from AFR and repair time', step: 4 },
    { text: 'Why correlated failures set the real limit', step: 6 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'k', label: 'Data shards (k)', min: 2, max: 20, step: 1, default: 10, unit: '', description: 'Pieces the object is split into.' },
      { key: 'm', label: 'Parity shards (m)', min: 1, max: 8, step: 1, default: 4, unit: '', description: 'Extra shards; any k of the k + m rebuild the object.' },
      { key: 'afr', label: 'Annual failure rate / drive', min: 0.5, max: 10, step: 0.1, default: 2, unit: '%', description: 'Chance a drive dies in a year.' },
      { key: 'repair', label: 'Time to rebuild a lost shard', min: 1, max: 168, step: 1, default: 24, unit: ' h', description: 'Window in which a second failure is dangerous.' },
    ],
    calculate: (input, step) => {
      const k = Math.max(2, Math.round(input.k ?? 10));
      const m = Math.max(1, Math.round(input.m ?? 4));
      const f = (input.afr ?? 2) / 100;
      const r = Math.max(1, input.repair ?? 24);
      const n = k + m;
      const ec = nines(lossPerYear(n, m, f, r));
      const rep = nines(lossPerYear(3, 2, f, r));
      return {
        ec: step < 3 ? { v: '—' } : { v: fmtNines(ec), tone: ec >= 11 ? 'good' : ec >= 8 ? 'warn' : 'bad' },
        rep: step < 3 ? { v: '—' } : { v: fmtNines(rep), tone: rep >= 11 ? 'good' : rep >= 8 ? 'warn' : 'bad' },
        over: step < 1 ? { v: '—' } : { v: `${(n / k).toFixed(2)}× vs 3.00×`, tone: n / k < 3 ? 'good' : 'warn' },
        repair: step < 4 ? { v: '—' } : { v: `${k} shards read (vs 1 for a copy)`, tone: k > 12 ? 'warn' : undefined },
      };
    },
  },
  steps: [
    {
      short: 'Eleven nines',
      kind: 'problem',
      title: 'What “99.999999999% durability” means',
      body: [
        'Durability is the probability that an object <i>still exists and is readable</i> after a year. Eleven nines means an expected loss of about <b>one object in 100 billion per year</b> — store 10 million objects and you expect to lose one every 10,000 years. It is a design target and a statistical claim, not a guarantee about any particular object.',
        'It is different from <b>availability</b> (can I read it right now?), which is far lower, around 3–4 nines. This lesson builds a simplified model of how such a number arises. Real object stores’ internals aren’t public in detail; the structure below — redundancy, independent failure domains, fast repair, checksums — is the general design.',
      ],
      concepts: [{ term: 'Durability', def: 'The probability data is not lost over a period, usually a year; distinct from availability.' }],
      scene: { nodes: [user(), box('store', 4, 0, 'Object store', 'blue', 'db', { size: [1.6, 1.6], height: 32, tag: pill('~1 in 10¹¹ lost / year', 'shield', 'good') })], links: [link('user', 'store', { arrow: 'both' })], flows: [flow(['user', 'store'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: '3× copies',
      kind: 'technique',
      title: 'The simple answer: three copies',
      body: [
        'Keep three full copies on different drives in different racks or zones. Losing an object then requires all three to fail before any is rebuilt. It is easy to reason about and fast to read — and costs <b>200% overhead</b>: every stored terabyte needs three physical terabytes.',
        'At the scale of an object store, cold data dominates the bill, so tripling it is a lot of money. The question becomes: can we keep the same or better durability with less redundant data?',
      ],
      changes: [{ text: '3 copies → 3.0× raw storage', tone: 'bad' }, { text: 'Survives any 2 losses', tone: 'good' }],
      scene: { nodes: [user(), enc({ name: 'Copy ×3' }), ...[0, 1, 2].map((i) => shard(i, 3, `copy ${i + 1}`, { tone: 'blue' }))], links: [link('user', 'enc'), ...[0, 1, 2].map((i) => link('enc', `s${i}`, { arrow: 'end' }))], flows: [flow(['user', 'enc'], { kind: 'write', rate: 1.2 }), ...fanFlow(3)] },
    },
    {
      short: 'Erasure coding',
      kind: 'technique',
      title: 'Split into k pieces, add m parity pieces',
      body: [
        '<b>Erasure coding</b> (Reed–Solomon is the classic code) cuts the object into <b>k data shards</b> and computes <b>m parity shards</b> from them. Any <b>k of the k + m</b> shards are enough to rebuild the whole object, so it survives the loss of any m shards — like RAID, but across machines and racks.',
        'Take k = 10, m = 4: 14 shards, any 4 can be lost, storage overhead <b>1.4×</b> instead of 3×. It survives <i>four</i> simultaneous losses where triple copies survive two. The cost moves to compute (encoding) and to <b>reads and repairs</b>, which now touch many shards.',
      ],
      changes: [{ text: '10 + 4 shards: tolerate any 4 losses at 1.4×', tone: 'good' }, { text: 'Rebuild needs k shards read', tone: 'info' }],
      concepts: [{ term: 'Erasure code', def: 'Encoding data into k + m shards so that any k suffice to reconstruct it.' }],
      scene: { nodes: [user(), enc({ tag: pill('k=10 + m=4', 'layers') }), ...shards(6, 4)], links: [link('user', 'enc'), ...fan(6)], flows: [flow(['user', 'enc'], { kind: 'write', rate: 1.2 }), ...fanFlow(6)] },
    },
    {
      short: 'The model',
      kind: 'insight',
      title: 'Durability from failure rate and repair time',
      body: [
        'Model: each drive fails independently with annual rate <code>f</code>. When one shard fails the system rebuilds it within <code>R</code> hours. The object is lost only if <b>more than m</b> further shards fail <i>inside that window</i>. A shard’s chance of failing in the window is <code>q = f × R ÷ 8760</code>, so the yearly loss probability is about <code>(k+m) × f × C(k+m−1, m) × q^m</code>.',
        'With f = 2% and R = 24 h, q ≈ 5.5×10⁻⁵. Three copies (m = 2): loss ≈ 1.8×10⁻¹⁰ per year → <b>9.7 nines</b>. Ten plus four: ≈ 1.8×10⁻¹⁵ → <b>14.7 nines</b> — more durable <i>and</i> less than half the overhead. The parity count is an exponent: each extra parity shard multiplies durability by roughly 1 ÷ q.',
      ],
      changes: [{ text: '3× copies: ~9.7 nines', tone: 'info' }, { text: '10+4 erasure code: ~14.7 nines at 1.4×', tone: 'good' }],
      note: { kind: 'key', text: 'Durability = how many failures you tolerate (m) combined with how quickly you repair (R). Both appear in the exponent.' },
      scene: { nodes: [user({ name: 'Drive fails' }), enc({ name: 'Repair clock', tag: pill('R hours to rebuild', 'clock') }), ...shards(6, 4, (i) => (i === 1 ? { state: 'down', tone: 'red' } : {}))], links: [link('user', 'enc', { style: 'dashed' }), ...fan(6)], flows: [flow(['s0', 'enc'], { rate: 1 }), flow(['s2', 'enc'], { rate: 1 })] },
    },
    {
      short: 'Repair',
      kind: 'tradeoff',
      title: 'Repair is where erasure coding pays',
      body: [
        'Rebuilding one lost 3-copy replica reads one surviving copy. Rebuilding one lost shard of a 10 + 4 code reads <b>10 shards</b> and recomputes — ten times the read traffic and network for every failed drive, at the moment the cluster is already degraded.',
        'Since <code>R</code> sits in the exponent, repair speed is a durability lever: halving R roughly multiplies durability by 2^m. Systems spread each shard’s rebuild across thousands of drives so a failed disk heals in minutes, not hours, and use <b>locally repairable</b> codes to cut how many shards a single repair must read.',
      ],
      changes: [{ text: 'Repair reads: 1 shard (copy) vs k shards (EC)', tone: 'bad' }, { text: 'Halve repair time → ~2^m × durability', tone: 'good' }],
      scene: { nodes: [enc({ name: 'Repair', tag: pill('read 10 shards, rebuild 1', 'refresh', 'warn') }), ...shards(6, 4, (i) => (i === 1 ? { state: 'down', tone: 'red' } : {}))], links: [...[0, 2, 3, 4, 5].map((i) => link(`s${i}`, 'enc', { arrow: 'end' }))], flows: [0, 2, 3, 4, 5].map((i) => flow([`s${i}`, 'enc'], { rate: 1 })) },
    },
    {
      short: 'Correlated',
      kind: 'problem',
      title: 'The real threat: failures that aren’t independent',
      body: [
        'The model assumes independent drive failures. Real losses come from <b>correlation</b>: a bad firmware batch, a power or cooling event in one room, a bug that corrupts data on every replica, an operator deleting the wrong thing. No parity count helps if every shard is in the same blast radius.',
        'Defences: spread shards across <b>racks, availability zones and (optionally) regions</b>, so one event removes at most m shards; stagger hardware batches; verify <b>checksums</b> end to end and scrub data in the background to catch silent corruption before the redundancy is spent; and keep versioning or soft-delete so human error is recoverable. These matter more than the 15th nine.',
      ],
      changes: [{ text: 'One zone down must cost ≤ m shards', tone: 'good' }, { text: 'Checksums + background scrubbing', tone: 'good' }, { text: 'Versioning guards against accidental deletes', tone: 'info' }],
      scene: { nodes: [user({ name: 'Zone outage' }), ...shards(6, 4, (i) => (i < 2 ? { state: 'down', tone: 'red', tag: pill('zone A', 'alert', 'bad') } : i < 4 ? { tag: pill('zone B', 'globe') } : { tag: pill('zone C', 'globe') }))], links: [], flows: [] },
    },
    {
      short: 'Reading',
      kind: 'technique',
      title: 'Reads, checksums and hot data',
      body: [
        'A healthy read fetches the k data shards (no decoding) in parallel; if one is slow or missing it fetches a parity shard and decodes instead — a built-in tail-latency hedge. Every shard carries a checksum, verified on read; a mismatch is treated as a failure and triggers repair.',
        'Small objects are expensive to shard, so stores often <b>replicate small or hot objects</b> and erasure-code large cold ones. The two techniques coexist: replication for speed and simplicity, erasure coding where bytes are cheap to compute and expensive to store.',
      ],
      scene: { nodes: [user({ name: 'GET object' }), enc({ name: 'Decoder', tag: pill('any k shards', 'check', 'good') }), ...shards(6, 4, (i) => (i === 1 ? { state: 'down', tone: 'red' } : {}))], links: [link('user', 'enc', { arrow: 'both' }), ...[0, 2, 3, 4, 5].map((i) => link(`s${i}`, 'enc', { arrow: 'end' }))], flows: [flow(['s0', 'enc'], { rate: 1 }), flow(['s2', 'enc'], { rate: 1 }), flow(['enc', 'user'], { kind: 'response', rate: 1.2 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Redundancy, repair speed and independence',
      body: [
        'Durability comes from <b>how many failures you tolerate</b> (replicas or parity m), <b>how fast you repair</b> (R, in the exponent), and <b>how independent the failures are</b> (placement across racks and zones). Erasure coding delivers more durability for less storage than copies, at the cost of compute and repair traffic.',
        'Eleven nines is a modelled design target: it assumes independence, working repair and no bugs. Real systems add checksums, scrubbing, versioning and zone-level placement precisely because those assumptions are what break. Figures in this lesson are illustrative model outputs, not measurements of any service.',
      ],
      scene: { nodes: [user(), enc(), ...shards(6, 4)], links: [link('user', 'enc'), ...fan(6)], flows: [flow(['user', 'enc'], { kind: 'write', rate: 1.2 }), ...fanFlow(6)] },
    },
  ],
};

export default lesson;
