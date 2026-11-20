import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const dev = (extra: Partial<SceneNode> = {}) => box('dev', -16, 0, 'Working directory', 'green', 'user', { size: [1.3, 1.3], height: 24, ...extra });
const idx = (extra: Partial<SceneNode> = {}) => box('idx', -8, 0, 'Index (staging area)', 'orange', 'list', { size: [1.3, 1.3], height: 22, ...extra });
const store = (extra: Partial<SceneNode> = {}) => db('store', 0, 0, 'Object database (.git/objects)', { size: [1.5, 1.5], ...extra });
const remote = (extra: Partial<SceneNode> = {}) => box('remote', 11, 0, 'Remote repository', 'blue', 'globe', { size: [1.4, 1.4], height: 28, ...extra });
const obj = (id: string, r: number, d: number, name: string, tone: NonNullable<SceneNode['tone']>, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, tone, 'file', { size: [1.2, 1.1], height: 16, ...extra });
const pack = (extra: Partial<SceneNode> = {}) => disk('pack', 0, 8, 'Packfile (deltas)', { size: [2.6, 1], height: 12, tone: 'yellow', ...extra });

const fmtB = (b: number): string => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.round(b / 1e3)} KB`);
const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : s >= 1 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`);

const lesson: Lesson = {
  slug: 'source-how-does-git-work',
  title: 'How Git Works: Content-Addressed Objects and the Commit Graph',
  blurb: 'Blobs, trees, commits and references: a content-addressed object store with history as a graph, why branches cost nothing, and what packfiles and shallow clones do to repository size and clone time.',
  minutes: 14,
  level: 'Intermediate',
  metrics: [
    { key: 'loose', label: 'History stored as whole files', icon: 'disk' },
    { key: 'packed', label: 'History in a delta-compressed pack', icon: 'layers' },
    { key: 'clone', label: 'Full clone time', icon: 'clock' },
    { key: 'shallow', label: 'Shallow clone (depth 1) time', icon: 'check' },
    { key: 'coll', label: 'Chance of an accidental hash collision', icon: 'hash' },
  ],
  goals: [
    { text: 'Content addressing: objects named by the hash of their content', step: 1 },
    { text: 'Blobs, trees and commits form a Merkle graph', step: 2 },
    { text: 'Branches and tags as movable references', step: 3 },
    { text: 'Merge vs rebase: two ways to combine histories', step: 4 },
    { text: 'Packfiles, deltas and shallow clones', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'files', label: 'Files in the project', min: 10, max: 1000000, step: 10, default: 5000, unit: '', description: 'Tracked files at the tip.' },
      { key: 'fsize', label: 'Average file size', min: 100, max: 1000000, step: 100, default: 10000, unit: ' B', description: 'Uncompressed bytes per file.' },
      { key: 'commits', label: 'Commits in history', min: 100, max: 10000000, step: 100, default: 100000, unit: '', description: 'Length of the project’s history.' },
      { key: 'k', label: 'Files changed per commit', min: 1, max: 200, step: 1, default: 3, unit: '', description: 'Average files touched by a commit.' },
      { key: 'delta', label: 'Bytes actually changed per file edit', min: 10, max: 100000, step: 10, default: 300, unit: ' B', description: 'Size of the real change within a file.' },
      { key: 'bw', label: 'Download speed', min: 1, max: 1000, step: 1, default: 50, unit: ' MB/s', description: 'Network throughput for the clone.' },
    ],
    calculate: (input, step) => {
      const F = Math.max(1, input.files ?? 5000);
      const S = Math.max(1, input.fsize ?? 10000);
      const N = Math.max(1, input.commits ?? 1e5);
      const k = Math.max(1, input.k ?? 3);
      const d = Math.max(1, input.delta ?? 300);
      const bw = Math.max(0.1, input.bw ?? 50) * 1e6;
      const comp = 0.4; // zlib compression of typical source text
      const tip = F * S * comp;
      // Each commit creates new blobs for the files it changed: whole files if stored loose, tiny deltas if packed.
      const loose = tip + N * k * S * comp;
      const packed = tip + N * k * d * comp;
      // A random SHA-1 collision among n objects: p ≈ n² ÷ 2¹⁶¹.
      const n = F + N * (k + 2);
      const log10p = 2 * Math.log10(n) - 161 * Math.log10(2);
      return {
        loose: step < 4 ? { v: '—' } : { v: fmtB(loose), tone: loose > 1e9 ? 'bad' : 'warn' },
        packed: step < 4 ? { v: '—' } : { v: `${fmtB(packed)} (${(loose / packed).toFixed(0)}× smaller)`, tone: 'good' },
        clone: step < 4 ? { v: '—' } : { v: fmtT(packed / bw), tone: packed / bw < 30 ? 'good' : 'warn' },
        shallow: step < 4 ? { v: '—' } : { v: `${fmtT(tip / bw)} (${fmtB(tip)})`, tone: 'good' },
        coll: step < 1 ? { v: '—' } : { v: `~10^${Math.round(log10p)} (negligible by accident)` },
      };
    },
  },
  steps: [
    {
      short: 'Addressing',
      kind: 'insight',
      title: 'Everything is stored under the hash of its content',
      body: [
        'Git is a <b>content-addressable file system</b> with a version-control interface on top. Every piece of data is an <b>object</b> stored under a name that is the <b>hash of its contents</b> (SHA-1, 40 hex characters; SHA-256 is being introduced). Same content → same name, so identical files are stored <b>once</b>, across files and across history; change one byte and the name changes completely.',
        'Consequences: objects are <b>immutable</b> (editing means creating a new object), integrity is automatic (a corrupted object no longer matches its name), and two repositories can compare what they have just by comparing names — which is how fetch and push avoid sending data the other side already has. A random collision among 100 million objects has a probability around 10⁻³³; deliberate SHA-1 attacks exist, so Git uses a hardened SHA-1 and is migrating to SHA-256.',
      ],
      changes: [{ text: 'name = hash(content): dedup, immutability, integrity', tone: 'good' }, { text: 'Accidental collision ≈ 10⁻³³ for 10⁸ objects', tone: 'info' }],
      scene: { nodes: [dev({ tag: pill('git add', 'file') }), store({ tag: pill('e69de29… = hash(content)', 'hash', 'good') })], links: [link('dev', 'store')], flows: [flow(['dev', 'store'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Objects',
      kind: 'technique',
      title: 'Blobs, trees and commits',
      body: [
        'Four object types. A <b>blob</b> holds a file’s contents (no name, no metadata). A <b>tree</b> is a directory listing: entries of (mode, name, hash of a blob or sub-tree). A <b>commit</b> records the hash of the <b>root tree</b> (a complete snapshot of the project), the hash(es) of its <b>parent commit(s)</b>, author, committer, timestamps and message. A <b>tag</b> object is a named, signed pointer to a commit.',
        'Because each object names its children by hash, the whole thing is a <b>Merkle DAG</b>: a commit’s hash covers its tree, which covers every file, plus its parents’ hashes — so one commit id vouches for the entire history behind it. Commits are <i>snapshots</i>, not diffs; unchanged files and directories are simply the <i>same blob/tree hashes</i> reused, which is why a commit is cheap.',
      ],
      changes: [{ text: 'commit → tree → blobs; commit → parent commits', tone: 'info' }, { text: 'Snapshots share unchanged objects', tone: 'good' }],
      scene: { nodes: [obj('c', -8, -6, 'commit 7a3f…', 'purple', { tag: pill('tree · parent · message', 'list') }), obj('t', 0, -6, 'tree 91bc…', 'orange'), obj('b1', 8, -9, 'blob (README)', 'blue'), obj('b2', 8, -4, 'blob (main.c)', 'blue'), obj('p', -8, 2, 'parent commit 4e1d…', 'purple')], links: [link('c', 't', { arrow: 'end' }), link('t', 'b1', { arrow: 'end' }), link('t', 'b2', { arrow: 'end' }), link('c', 'p', { arrow: 'end' })], flows: [flow(['c', 't', 'b2'], { rate: 1.2 })] },
    },
    {
      short: 'References',
      kind: 'technique',
      title: 'Branches are just movable names',
      body: [
        'A <b>branch</b> is a 41-byte file containing a commit hash (<code>.git/refs/heads/main</code>); <code>HEAD</code> says which branch (or commit) you are on. Creating a branch writes one tiny file — <b>no copying of anything</b>, however large the project — and committing just moves the current branch pointer forward to the new commit. Tags are fixed pointers; remote-tracking branches (<code>origin/main</code>) record where the remote’s branch was at last fetch.',
        'This explains Git’s signature features: <b>cheap branching</b> (make one per idea), <b>fast operations</b> (everything is local reads of immutable objects), and the “detached HEAD” and “lost commit” confusion — a commit not reachable from any ref is garbage, collected after a grace period, but recoverable via the <b>reflog</b> until then.',
      ],
      changes: [{ text: 'Branch = pointer to a commit; moves on commit', tone: 'good' }, { text: 'Unreachable commits recoverable via reflog, then GC’d', tone: 'info' }],
      scene: { nodes: [obj('c1', -9, 0, 'A', 'purple'), obj('c2', -3, 0, 'B', 'purple'), obj('c3', 3, -4, 'C', 'purple'), obj('c4', 3, 4, 'D', 'purple'), box('main', 10, -4, 'main', 'green', 'route', { size: [1, 1], height: 14 }), box('feat', 10, 4, 'feature (HEAD)', 'orange', 'route', { size: [1, 1], height: 14 })], links: [link('c2', 'c1', { arrow: 'end' }), link('c3', 'c2', { arrow: 'end' }), link('c4', 'c2', { arrow: 'end' }), link('main', 'c3', { style: 'dashed', arrow: 'end' }), link('feat', 'c4', { style: 'dashed', arrow: 'end' })], flows: [] },
    },
    {
      short: 'Merge / rebase',
      kind: 'tradeoff',
      title: 'Combining work: merge vs rebase',
      body: [
        '<b>Merge</b> creates a new commit with <b>two parents</b> joining the histories (a three-way merge: the two tips plus their common ancestor). It preserves exactly what happened and never rewrites existing commits — safe for shared branches — at the cost of a branchier history. <b>Rebase</b> takes your commits and <b>replays them on top of</b> the other branch, creating <i>new</i> commits (new hashes) — a linear, tidy history, but it <b>rewrites history</b>, so never rebase commits others have already based work on.',
        'Common practice: rebase your own local branch onto the latest main before opening a pull request (clean, reviewable), merge (or squash-merge) into main (preserves shared history), and never force-push shared branches. <code>cherry-pick</code> copies a single commit; <code>revert</code> adds a commit that undoes one — the safe way to “undo” published history.',
      ],
      changes: [{ text: 'Merge: two-parent commit, history preserved', tone: 'good' }, { text: 'Rebase: new commits, linear history, rewrites hashes', tone: 'info' }, { text: 'Don’t rewrite published history', tone: 'bad' }],
      scene: { nodes: [obj('a', -9, 0, 'A', 'purple'), obj('b', -3, -4, 'B (main)', 'purple'), obj('c', -3, 4, 'C (feature)', 'purple'), obj('m', 5, 0, 'M: merge commit', 'green', { tag: pill('parents: B, C', 'share') })], links: [link('b', 'a', { arrow: 'end' }), link('c', 'a', { arrow: 'end' }), link('m', 'b', { arrow: 'end' }), link('m', 'c', { arrow: 'end' })], flows: [flow(['c', 'm'], { rate: 1.2 })] },
    },
    {
      short: 'Packfiles',
      kind: 'technique',
      title: 'Packfiles, deltas and clone cost',
      body: [
        'Each new version of a file is a <b>new whole blob</b> — a 10 KB file edited by 300 bytes stores another ~10 KB (compressed ~4 KB). Left as loose objects, 100,000 commits touching 3 files each is ~1.2 GB. <b>Packing</b> (<code>git gc</code>, and automatically on push/fetch) groups objects into <b>packfiles</b> and stores similar blobs as <b>deltas</b> against each other — here 300-byte changes — shrinking the same history to ~<b>56 MB</b>, about <b>22×</b> smaller, with an index for fast lookup.',
        'The numbers drive clone behaviour: a full clone transfers the pack (56 MB ≈ 1.1 s at 50 MB/s, minutes for huge monorepos), but CI often only needs the tip: a <b>shallow clone</b> (<code>--depth 1</code>) fetches ~20 MB; <b>partial clone</b> (<code>--filter=blob:none</code>) defers file contents until needed; <b>sparse checkout</b> materialises only some directories. Large binaries do poorly in Git (each version is a whole blob that deltas poorly) — use Git LFS or an artifact store. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Loose: whole blob per change (~1.2 GB) · packed deltas: ~56 MB', tone: 'info' }, { text: 'Shallow / partial / sparse clones for CI and monorepos', tone: 'good' }, { text: 'Large binaries: LFS or external storage', tone: 'info' }],
      scene: { nodes: [store({ tag: pill('loose objects', 'file') }), pack({ tag: pill('deltas: 22× smaller', 'check', 'good') }), remote({ tag: pill('clone = transfer the pack', 'share') })], links: [link('store', 'pack', { arrow: 'end' }), link('pack', 'remote', { arrow: 'both' })], flows: [flow(['pack', 'remote'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Immutable objects, movable pointers',
      body: [
        'Git stores <b>blobs, trees and commits</b> under the hash of their content — a Merkle DAG where a commit id vouches for the full history — and <b>branches are 41-byte pointers</b>, so branching is free. Merge joins histories; rebase rewrites them. <b>Packfiles</b> delta-compress history, so clone cost is packed size ÷ bandwidth, and shallow/partial clones cut it further.',
        'Rebase only what is yours, keep large binaries out, and use shallow clones in CI.',
      ],
      scene: { nodes: [dev(), idx(), store(), remote()], links: [link('dev', 'idx'), link('idx', 'store'), link('store', 'remote', { arrow: 'both' })], flows: [flow(['dev', 'idx', 'store', 'remote'], { kind: 'write', rate: 1.5 })] },
    },
  ],
};

export default lesson;
