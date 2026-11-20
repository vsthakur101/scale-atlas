import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill } from '../kit';

const client = (extra: Partial<SceneNode> = {}) => box('client', -18, 0, 'Sync client (watches folder)', 'teal', 'folder', { size: [1.5, 1.5], height: 26, ...extra });
const chunker = (extra: Partial<SceneNode> = {}) => box('chunker', -8, 0, 'Chunker + hasher', 'orange', 'hash', { size: [1.5, 1.5], height: 26, ...extra });
const meta = (extra: Partial<SceneNode> = {}) => db('meta', 3, -7, 'Metadata service (file → chunk list)', { size: [1.6, 1.6], ...extra });
const blocks = (extra: Partial<SceneNode> = {}) => disk('blocks', 3, 7, 'Block store (content-addressed)', { size: [3, 1.2], height: 14, tone: 'yellow', ...extra });
const notify = (extra: Partial<SceneNode> = {}) => box('notify', 14, -5, 'Change notification (long poll)', 'purple', 'bolt', { size: [1.4, 1.4], height: 22, ...extra });
const others = (extra: Partial<SceneNode> = {}) => crowd('others', 14, 6, 8, 'your other devices', extra);

const fmtMB = (mb: number): string => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(s < 10 ? 1 : 0)} s`);

const lesson: Lesson = {
  slug: 'academy-how-dropbox-scaled-to-100-thousand-users-in-a-year-after-launch',
  title: 'File Sync at Scale: Chunking, Content Hashes and Delta Upload',
  blurb: 'Why syncing a 100 MB file after a 1 MB edit should move ~5 MB, not 100 — fixed vs content-defined chunking, content-addressed block storage with deduplication, metadata/blob separation and change notification.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'full', label: 'Re-upload the whole file', icon: 'timer' },
    { key: 'over', label: 'Fixed chunks: in-place edit', icon: 'copy' },
    { key: 'ins', label: 'Fixed chunks: insertion shifts everything after', icon: 'alert' },
    { key: 'cdc', label: 'Content-defined chunks: the same insertion', icon: 'check' },
    { key: 'dedup', label: 'Storage saved by cross-file deduplication', icon: 'disk' },
  ],
  goals: [
    { text: 'The problem: many files, small edits, slow links', step: 1 },
    { text: 'Chunk, hash, and store by content', step: 2 },
    { text: 'Delta sync: send only chunks the server lacks', step: 3 },
    { text: 'Content-defined chunking beats insertion shifts', step: 4 },
    { text: 'Metadata, notifications, conflicts and dedup trade-offs', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'handshake'],
  dynamic: {
    parameters: [
      { key: 'file', label: 'File size', min: 1, max: 100000, step: 1, default: 100, unit: ' MB', description: 'Size of the edited file.' },
      { key: 'chunk', label: 'Chunk size (average)', min: 0.01, max: 64, step: 0.01, default: 4, unit: ' MB', description: 'Fixed size, or the target average for content-defined chunks.' },
      { key: 'edit', label: 'Bytes changed by the edit', min: 0.001, max: 1000, step: 0.001, default: 1, unit: ' MB', description: 'Size of the edited region.' },
      { key: 'bw', label: 'Upload bandwidth', min: 0.5, max: 10000, step: 0.5, default: 20, unit: ' Mbps', description: 'Client uplink.' },
      { key: 'dd', label: 'Chunks that duplicate existing ones', min: 0, max: 90, step: 1, default: 30, unit: '%', description: 'Share of stored chunks identical to others (copies, shared files, common content).' },
      { key: 'pb', label: 'Logical data stored', min: 0.001, max: 1000, step: 0.001, default: 1, unit: ' PB', description: 'Total bytes users have synced, before deduplication.' },
    ],
    calculate: (input, step) => {
      const file = Math.max(0.001, input.file ?? 100);
      const chunk = Math.max(0.001, input.chunk ?? 4);
      const edit = Math.min(file, Math.max(0.0001, input.edit ?? 1));
      const bw = Math.max(0.01, input.bw ?? 20);
      const dd = Math.min(0.99, Math.max(0, (input.dd ?? 30) / 100));
      const pb = Math.max(0.0001, input.pb ?? 1);
      const t = (mb: number) => (mb * 8) / bw;
      // A changed region of size e touches about e + one chunk of partially-changed data at its edges.
      const over = Math.min(file, edit + chunk);
      // With fixed boundaries an insertion shifts every later byte: on average half the file re-chunks differently.
      const ins = Math.min(file, file / 2 + edit);
      const cdc = Math.min(file, edit + chunk);
      return {
        full: step < 1 ? { v: '—' } : { v: `${fmtMB(file)} → ${fmtT(t(file))}`, tone: t(file) < 10 ? 'good' : 'bad' },
        over: step < 3 ? { v: '—' } : { v: `${fmtMB(over)} → ${fmtT(t(over))} (${((over / file) * 100).toFixed(0)}% of the file)`, tone: 'good' },
        ins: step < 4 ? { v: '—' } : { v: `${fmtMB(ins)} → ${fmtT(t(ins))} (${((ins / file) * 100).toFixed(0)}%)`, tone: ins / file < 0.2 ? 'good' : 'bad' },
        cdc: step < 4 ? { v: '—' } : { v: `${fmtMB(cdc)} → ${fmtT(t(cdc))} (${((cdc / file) * 100).toFixed(0)}%)`, tone: 'good' },
        dedup: step < 5 ? { v: '—' } : { v: `${(pb * dd * 1000).toFixed(0)} TB of ${(pb * 1000).toFixed(0)} TB (${(dd * 100).toFixed(0)}%)`, tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Problem',
      kind: 'problem',
      title: 'Sync should move what changed, not what exists',
      body: [
        'A file-sync service keeps a folder identical across a user’s devices through a server. The workload is brutal: <b>hundreds of millions of files</b>, most of them rarely changed; a minority edited constantly (documents, spreadsheets, databases, VM disks); uplinks that are slow and asymmetric; devices that are offline for days; and users who expect “it just works” including <b>never losing data</b>. The simplest design — on change, upload the whole file — is catastrophically wasteful: changing one cell in a 100 MB spreadsheet re-uploads 100 MB, which takes <b>40 seconds on a 20 Mbps uplink</b>, and every other device then downloads all 100 MB too.',
        'The key idea: split files into <b>chunks</b> identified by a <b>hash of their content</b>, and let the server tell the client which chunks it already has. Only new chunks move. The server needs two very different stores — <b>metadata</b> (which chunks make up this version of this file; small, transactional, hot) and <b>blobs</b> (the chunk bytes; huge, immutable, cold) — which scale independently (see the Object Store lesson).',
      ],
      scene: { nodes: [client({ tag: pill('100 MB file, 1 MB edit', 'folder') }), meta(), blocks()], links: [link('client', 'meta'), link('client', 'blocks')], flows: [flow(['client', 'blocks'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Chunks',
      kind: 'technique',
      title: 'Chunk, hash and store by content',
      body: [
        'The client splits each file into chunks (say 4 MB on average) and computes a <b>cryptographic hash</b> (SHA-256) of each. The hash is the chunk’s <b>name</b> — a <b>content-addressed</b> block store (like Git objects: see the Git lesson). A file version is then just an ordered <b>list of chunk hashes</b> (the “blocklist”); a 100 MB file is 25 hashes ≈ 1 KB of metadata at ~40 bytes per entry (hash + size), so even 100 million files’ metadata is ~100 GB — small enough to keep in a sharded relational/key-value store with strong transactions.',
        'Content addressing gives you for free: <b>integrity</b> (a corrupt chunk doesn’t match its name), <b>immutability</b> (chunks never change, so they cache and replicate trivially and version history is cheap), and <b>deduplication</b> — identical content stores once. Copying a file, saving the same attachment in many folders, or two users uploading the same installer references the same chunks: with 30% duplicate chunks, 1 PB of user data needs <b>700 TB</b> of storage, saving 300 TB.',
      ],
      changes: [{ text: 'Chunk name = SHA-256(content); a file = ordered list of hashes', tone: 'info' }, { text: '100 MB file ≈ 25 hashes ≈ 1 KB of metadata', tone: 'good' }, { text: 'Identical chunks stored once: 30% duplicates saves 300 TB per PB', tone: 'good' }],
      concepts: [{ term: 'Content-addressed storage', def: 'Storing blobs under the hash of their bytes, so equal content has the same name and is stored once.' }],
      scene: { nodes: [client(), chunker({ tag: pill('4 MB chunks → SHA-256', 'hash', 'good') }), meta({ tag: pill('blocklist: h1…h25', 'list') }), blocks({ tag: pill('keyed by hash', 'disk') })], links: [link('client', 'chunker'), link('chunker', 'meta'), link('chunker', 'blocks')], flows: [flow(['client', 'chunker', 'blocks'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Delta',
      kind: 'technique',
      title: 'Delta sync: send only the chunks the server lacks',
      body: [
        'After an edit the client re-chunks and re-hashes the file (locally, cheap), then sends the new <b>blocklist</b> to the metadata service. The server replies with which of those hashes it <b>doesn’t already have</b>; the client uploads only those chunks, then <b>commits</b> the new blocklist atomically (the file version changes only when all its chunks are durable). If the 1 MB edit lands inside one 4 MB chunk, one chunk changes — about <b>edit + one chunk ≈ 5 MB</b> on average, since the edit rarely aligns with chunk boundaries: <b>2 seconds</b> instead of 40, 5% of the file.',
        'The same trick makes downloads efficient: another device fetches the new blocklist, compares with the chunks it already holds locally, and downloads only the missing ones. Resumable uploads fall out naturally (a failed transfer simply re-asks which chunks are still missing), as does parallelism (chunks upload concurrently) and <b>LAN sync</b> (devices on the same network exchange chunks directly). Compression and per-chunk encryption apply at the chunk level.',
      ],
      changes: [{ text: 'Server returns the hashes it lacks; client uploads only those', tone: 'good' }, { text: '1 MB edit ≈ 5 MB uploaded: 2 s vs 40 s', tone: 'good' }, { text: 'Atomic commit of the new blocklist; resumable and parallel', tone: 'info' }],
      scene: { nodes: [client({ tag: pill('new blocklist', 'list') }), chunker(), meta({ tag: pill('missing: h12 only', 'search', 'good') }), blocks({ tag: pill('+ 1 chunk (4 MB)', 'disk') })], links: [link('client', 'chunker'), link('chunker', 'meta'), link('chunker', 'blocks')], flows: [flow(['chunker', 'meta'], { kind: 'handshake', rate: 1.2, back: true }), flow(['chunker', 'blocks'], { kind: 'write', rate: 1.2 })] },
    },
    {
      short: 'CDC',
      kind: 'insight',
      title: 'Content-defined chunking survives insertions',
      body: [
        'Fixed-size chunking has a flaw: <b>insert one byte near the start</b> and every later byte shifts, so every subsequent chunk boundary lands on different data and <i>all</i> their hashes change. The expected damage is about half the file — <b>~50 MB</b> re-uploaded for a 1 MB insertion into a 100 MB file, 20 seconds. (Overwrites in place don’t shift anything, but text edits, document saves that rewrite the file, and recompressed archives often do.)',
        '<b>Content-defined chunking (CDC)</b> picks boundaries from the data itself: slide a <b>rolling hash</b> (Rabin fingerprint, Gear/FastCDC) over the bytes and cut wherever the hash’s low bits match a pattern, subject to minimum and maximum sizes — average chunk 4 MB when the pattern has probability 1/4 MB. Because the boundary depends only on the nearby bytes, an insertion changes the chunk(s) containing it and then <b>boundaries resynchronise</b>: later chunks are identical to before. The same insertion costs about <b>edit + one chunk ≈ 5 MB</b> — back to 2 seconds. CDC costs CPU (hash every byte — FastCDC is several GB/s) and gives variable chunk sizes, but it is the standard in backup tools (restic, borg), deduplicating storage and modern sync clients.',
      ],
      changes: [{ text: 'Fixed chunks: insertion re-uploads ~half the file (50 MB, 20 s)', tone: 'bad' }, { text: 'CDC: boundaries follow content; resync after the edit (~5 MB, 2 s)', tone: 'good' }, { text: 'Costs CPU for the rolling hash; variable chunk sizes', tone: 'info' }],
      scene: { nodes: [client({ tag: pill('insert 1 byte at the start', 'alert', 'warn') }), chunker({ tag: pill('rolling hash: cut where low bits = 0', 'hash', 'good') }), blocks({ tag: pill('only 1–2 new chunks', 'check', 'good') })], links: [link('client', 'chunker'), link('chunker', 'blocks')], flows: [flow(['client', 'chunker', 'blocks'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'System',
      kind: 'tradeoff',
      title: 'Metadata, notifications, conflicts and deduplication trade-offs',
      body: [
        '<b>Metadata</b> is the source of truth: a per-account <b>journal/namespace</b> of file versions, kept consistent in a strongly consistent store; blobs are eventually replicated in the object store. <b>Notification</b>: devices hold a long-poll or persistent connection to a notification service (see the Push Notifications lesson) that says “namespace changed — call /list_changes with your cursor”, so an idle client costs almost nothing, and sync is cursor-based (“changes since journal position N”) rather than re-scanning. <b>Conflicts</b> — two devices edit the same version offline — can’t be merged generically, so the service keeps both: the second to commit is saved as a <b>“conflicted copy”</b> rather than overwriting; collaborative document formats (OT/CRDT — see that lesson) avoid it for supported types.',
        'Trade-offs of dedup: <b>chunk size</b> (small chunks dedupe and delta better but multiply metadata and request counts; large chunks are cheap but coarse), <b>cross-user deduplication leaks information</b> — if the server skips an upload because it has the hash, an attacker can test whether someone has a given file (a side channel; mitigations: per-user or convergent-with-secret-salt encryption, upload-then-verify for sensitive classes), and <b>client-side encryption</b> defeats cross-user dedup entirely (a conscious privacy-vs-storage choice). Also: scan chunks for malware/legal compliance by hash, garbage-collect unreferenced chunks with reference counts and a delay, and rate-limit sync storms after mass edits. Figures here are model outputs with assumed sizes and rates.',
      ],
      changes: [{ text: 'Journal + cursor sync; long-poll notification; conflicted copies', tone: 'info' }, { text: 'Cross-user dedup leaks “does anyone have this file?”', tone: 'bad' }, { text: 'Chunk size trades dedup/delta efficiency against metadata and requests', tone: 'info' }],
      scene: { nodes: [meta({ tag: pill('journal cursor', 'list') }), notify({ tag: pill('namespace changed', 'bolt') }), others({ tag: pill('list_changes → fetch missing', 'refresh') }), blocks({ tag: pill('refcount + GC', 'disk') })], links: [link('meta', 'notify'), link('notify', 'others'), link('others', 'blocks', { style: 'dashed' })], flows: [flow(['meta', 'notify', 'others'], { rate: 1.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Name chunks by content; move only what the server lacks',
      body: [
        'Split files into <b>chunks named by their hash</b>, keep a small <b>metadata</b> blocklist per version and the chunks in a <b>content-addressed block store</b> (with deduplication). A sync sends only <b>missing chunks</b>: ~5 MB instead of 100 MB for a 1 MB edit; <b>content-defined chunking</b> keeps that true for insertions.',
        'Notify with a cursor-based change feed, keep conflicts as copies, and weigh chunk size and the dedup privacy trade-off.',
      ],
      scene: { nodes: [client(), chunker(), meta(), blocks(), notify(), others()], links: [link('client', 'chunker'), link('chunker', 'meta'), link('chunker', 'blocks'), link('meta', 'notify'), link('notify', 'others')], flows: [flow(['client', 'chunker', 'blocks'], { kind: 'write', rate: 1.6 })] },
    },
  ],
};

export default lesson;
