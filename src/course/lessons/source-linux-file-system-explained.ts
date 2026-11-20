import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const app = (extra: Partial<SceneNode> = {}) => box('app', -16, 0, 'Application: open / read / write', 'green', 'cpu', { size: [1.3, 1.3], height: 26, ...extra });
const vfs = (extra: Partial<SceneNode> = {}) => box('vfs', -8, 0, 'VFS + page cache', 'orange', 'layers', { size: [1.4, 1.4], height: 28, ...extra });
const fs = (extra: Partial<SceneNode> = {}) => box('fs', 0, 0, 'File system (ext4 / XFS)', 'purple', 'list', { size: [1.5, 1.5], height: 30, ...extra });
const inode = (extra: Partial<SceneNode> = {}) => db('inode', 8, -6, 'Inode table', { size: [1.3, 1.3], ...extra });
const blocks = (extra: Partial<SceneNode> = {}) => disk('blocks', 8, 6, 'Data blocks', { size: [3, 1.2], height: 16, tone: 'yellow', icon: 'list', ...extra });
const journal = (extra: Partial<SceneNode> = {}) => disk('journal', 0, 9, 'Journal', { size: [2.4, 1], height: 10, tone: 'grey', ...extra });

const fmtB = (b: number): string => (b >= 1e15 ? `${(b / 1e15).toFixed(1)} PB` : b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-linux-file-system-explained',
  title: 'How a Linux File System Works: Inodes, Blocks and Journals',
  blurb: 'Names, inodes and data blocks; the pointer tree that limits file size; why you can run out of inodes with free space; and how journalling survives a crash.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'maxfile', label: 'Largest file (classic pointer scheme)', icon: 'file' },
    { key: 'inodes', label: 'Inodes on the volume', icon: 'list' },
    { key: 'small', label: 'Space used by a tiny file', icon: 'disk' },
    { key: 'waste', label: 'Space lost to partial blocks (many small files)', icon: 'alert' },
    { key: 'reads', label: 'Disk reads to fetch the last block of a big file', icon: 'search' },
  ],
  goals: [
    { text: 'Directories map names to inodes; inodes describe files', step: 1 },
    { text: 'How an inode locates data: direct, indirect and extents', step: 2 },
    { text: 'Block size, internal fragmentation and inode exhaustion', step: 3 },
    { text: 'Hard links, symbolic links and permissions', step: 4 },
    { text: 'Journalling, the page cache and fsync', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'block', label: 'Block size', min: 1024, max: 65536, step: 1024, default: 4096, unit: ' B', description: 'Unit of allocation on disk.' },
      { key: 'ptr', label: 'Pointer size', min: 4, max: 8, step: 4, default: 4, unit: ' B', description: 'Bytes per block pointer in the classic ext2/3 scheme.' },
      { key: 'vol', label: 'Volume size', min: 1, max: 100000, step: 1, default: 1000, unit: ' GB', description: 'Size of the file system.' },
      { key: 'bpi', label: 'Bytes of disk per inode', min: 1024, max: 1048576, step: 1024, default: 16384, unit: ' B', description: 'Format-time ratio (mkfs -i): one inode per this many bytes.' },
      { key: 'files', label: 'Number of small files', min: 1000, max: 1000000000, step: 1000, default: 50000000, unit: '', description: 'Files each smaller than a block, for the waste estimate.' },
      { key: 'avg', label: 'Average small-file size', min: 10, max: 100000, step: 10, default: 1500, unit: ' B', description: 'Bytes of data per small file.' },
    ],
    calculate: (input, step) => {
      const bs = Math.max(512, input.block ?? 4096);
      const ptr = Math.max(4, input.ptr ?? 4);
      const vol = Math.max(1, input.vol ?? 1000) * 1e9;
      const bpi = Math.max(512, input.bpi ?? 16384);
      const files = Math.max(1, input.files ?? 5e7);
      const avg = Math.max(1, input.avg ?? 1500);
      // Pointers per indirect block, and the classic 12-direct + single/double/triple indirect layout.
      const ppb = bs / ptr;
      const maxBlocks = 12 + ppb + ppb * ppb + ppb * ppb * ppb;
      const maxBytes = maxBlocks * bs;
      const inodes = vol / bpi;
      const blocksPerFile = Math.ceil(avg / bs);
      const used = blocksPerFile * bs;
      const waste = files * (used - avg);
      return {
        maxfile: step < 2 ? { v: '—' } : { v: fmtB(maxBytes) },
        inodes: step < 3 ? { v: '—' } : { v: `${fmtN(inodes)} (${fmtN(vol / bpi)} files max, whatever the free space)`, tone: inodes < files ? 'bad' : 'good' },
        small: step < 3 ? { v: '—' } : { v: `${fmtB(used)} for ${avg} B of data (+ 1 inode)`, tone: used > avg * 3 ? 'warn' : 'good' },
        waste: step < 3 ? { v: '—' } : { v: `${fmtB(waste)} wasted over ${fmtN(files)} files`, tone: waste > 1e11 ? 'bad' : waste > 1e10 ? 'warn' : 'good' },
        reads: step < 2 ? { v: '—' } : { v: '4 (inode + 3 indirect blocks) without caching; 1–2 with extents' },
      };
    },
  },
  steps: [
    {
      short: 'Names → inodes',
      kind: 'insight',
      title: 'A name is not the file',
      body: [
        'On Unix-like systems a file is identified by an <b>inode</b> (index node): a small record holding everything <i>about</i> the file except its name — type, owner, permissions, size, timestamps, link count and <b>where its data blocks are</b>. A <b>directory</b> is just a special file mapping <b>names to inode numbers</b>. Opening <code>/var/log/app.log</code> walks the path: look up <code>var</code> in <code>/</code>, then <code>log</code> in it, then <code>app.log</code>, each step a directory read, finally reading the target inode.',
        'This separation is why you can have <b>several names for one file</b> (hard links), rename or move a file without touching its data (just a directory entry change), and delete a file that is still open (the inode lives until the last name <i>and</i> the last open descriptor are gone).',
      ],
      scene: { nodes: [app(), vfs(), fs(), inode({ tag: pill('owner · mode · size · block map', 'file') }), blocks()], links: [link('app', 'vfs'), link('vfs', 'fs'), link('fs', 'inode'), link('fs', 'blocks')], flows: [flow(['app', 'vfs', 'fs', 'inode'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Block map',
      kind: 'technique',
      title: 'How an inode finds the data: pointers and extents',
      body: [
        'Classic ext2/ext3 inodes hold <b>15 pointers</b>: 12 <b>direct</b> (pointing straight at data blocks), then one <b>single-indirect</b> (a block full of pointers), one <b>double-indirect</b> (a block of blocks of pointers) and one <b>triple-indirect</b>. With 4 KB blocks and 4-byte pointers, an indirect block holds 1,024 pointers, so the largest file is <code>(12 + 1,024 + 1,024² + 1,024³) × 4 KB</code> ≈ <b>4 TB</b>. Small files use only direct pointers (up to 48 KB with no extra reads); a block near the end of a big file needs up to <b>three extra reads</b> to walk the indirection.',
        'Modern file systems (ext4, XFS, Btrfs) use <b>extents</b> instead: one entry says “<i>N contiguous blocks starting at block B</i>”, so a large, unfragmented file is described by a few extents rather than millions of pointers — less metadata, fewer reads, and faster allocation. File systems also <b>preallocate</b> and delay allocation to keep files contiguous, which matters for sequential throughput (see the Kafka lesson).',
      ],
      changes: [{ text: '12 direct + 1 single + 1 double + 1 triple indirect', tone: 'info' }, { text: '(12 + 1K + 1K² + 1K³) × 4 KB ≈ 4 TB', tone: 'info' }, { text: 'Extents: “N blocks from B” replace pointer lists', tone: 'good' }],
      concepts: [{ term: 'Extent', def: 'A run of contiguous blocks described by a start and a length, replacing many individual block pointers.' }],
      scene: { nodes: [inode({ tag: pill('12 direct · 1 · 2 · 3 levels', 'list') }), box('ind', 3, -6, 'Indirect block (1,024 ptrs)', 'teal', 'list', { size: [1.3, 1.2], height: 14 }), blocks({ tag: pill('file data', 'check') })], links: [link('inode', 'ind'), link('inode', 'blocks'), link('ind', 'blocks')], flows: [flow(['inode', 'ind', 'blocks'], { rate: 1.2 })] },
    },
    {
      short: 'Blocks',
      kind: 'tradeoff',
      title: 'Block size, partial blocks and running out of inodes',
      body: [
        'Space is allocated in whole blocks, so a 1,500-byte file occupies a full 4 KB block — <b>2,596 bytes wasted</b> (<i>internal fragmentation</i>); 50 million such files waste <b>~130 GB</b>. Larger blocks improve sequential throughput and shrink metadata but waste more on small files; smaller blocks do the reverse. (Some file systems pack tiny files into the inode or tail-merge to cut the waste.)',
        'The number of inodes is usually <b>fixed when the file system is created</b> (one per 16 KB of disk by default): a 1 TB volume has ~61 million. A directory full of small files — mail spools, session files, caches — can exhaust the inodes while <code>df</code> still shows plenty of free space, and writes fail with “No space left on device”. Check <code>df -i</code>; plan the inode ratio at format time or choose a file system that allocates them dynamically (XFS, Btrfs). Also beware directories with millions of entries — lookups slow down without indexed directories.',
      ],
      changes: [{ text: '1,500 B file → 4 KB block: 2.6 KB wasted each', tone: 'bad' }, { text: 'df shows space but df -i shows 100% inodes', tone: 'bad' }],
      scene: { nodes: [fs({ tag: pill('61M inodes on a 1 TB volume', 'gauge') }), inode({ state: 'hot', tag: pill('inodes full', 'alert', 'bad') }), blocks({ tag: pill('plenty of free blocks', 'check', 'good') })], links: [link('fs', 'inode'), link('fs', 'blocks')], flows: [flow(['fs', 'inode'], { kind: 'fail', rate: 1 })] },
    },
    {
      short: 'Links',
      kind: 'technique',
      title: 'Hard links, symbolic links and permissions',
      body: [
        'A <b>hard link</b> is another directory entry pointing to the <i>same inode</i>: identical file, two names, the inode’s link count increments, and data is freed only when the count (and open handles) reach zero. Hard links can’t cross file systems or point to directories. A <b>symbolic link</b> is a tiny file whose content is a <i>path</i>; it can cross file systems and dangle if the target disappears. Copy-on-write file systems and <code>cp --reflink</code> share blocks between files until they change.',
        '<b>Permissions</b> live in the inode: owner, group and other, each with read/write/execute bits (<code>rwxr-x---</code> = 750), plus setuid/setgid/sticky bits, and optional ACLs and extended attributes. For a directory, “execute” means <i>may traverse</i>, “read” means <i>may list</i>. The kernel checks them on every open — path traversal needs execute on <b>every directory</b> along the way.',
      ],
      changes: [{ text: 'Hard link: same inode, two names · Symlink: a path', tone: 'info' }, { text: 'Directory x = traverse, r = list', tone: 'info' }],
      scene: { nodes: [box('n1', -8, -5, '/data/report.txt', 'blue', 'file', { size: [1.3, 1.1], height: 14 }), box('n2', -8, 5, '/backup/r.txt', 'blue', 'file', { size: [1.3, 1.1], height: 14 }), inode({ tag: pill('link count = 2', 'hash') })], links: [link('n1', 'inode'), link('n2', 'inode')], flows: [flow(['n1', 'inode'], { rate: 1 })] },
    },
    {
      short: 'Journal',
      kind: 'technique',
      title: 'Journalling, the page cache and fsync',
      body: [
        'Creating or extending a file touches several structures — the inode, the block bitmap, the directory — and a crash between updates leaves them inconsistent (a leaked block, a file pointing to freed data). Old systems repaired this with a slow full <code>fsck</code> scan. <b>Journalling</b> first writes a <b>description of the changes to a journal</b> (a sequential log) and marks it committed; then applies them in place; after a crash it replays committed entries — recovery in seconds, however large the disk. ext4’s default journals <i>metadata</i> only (data ordered before its metadata); full data journalling is safer and slower.',
        'Meanwhile writes go to the <b>page cache</b> in RAM and reach disk later — fast, but data isn’t durable until written. <code>fsync(fd)</code> forces the file’s data <i>and</i> metadata to stable storage (and its directory entry needs a directory <code>fsync</code> too) — the expensive call databases use for commit durability (see the transactions and Kafka lessons). Copy-on-write designs (Btrfs, ZFS) avoid in-place overwrite entirely. Figures here are model outputs for sizing.',
      ],
      changes: [{ text: 'Journal the intent → apply → replay after a crash', tone: 'good' }, { text: 'Page cache is fast but not durable until fsync', tone: 'bad' }],
      scene: { nodes: [app({ tag: pill('write(); fsync()', 'lock') }), vfs({ tag: pill('page cache (RAM)', 'bolt') }), fs(), journal({ tag: pill('commit record', 'check', 'good') }), blocks()], links: [link('app', 'vfs'), link('vfs', 'fs'), link('fs', 'journal'), link('fs', 'blocks')], flows: [flow(['app', 'vfs', 'fs', 'journal'], { kind: 'write', rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Names, inodes, blocks — and a log to survive crashes',
      body: [
        'Directories map names to <b>inodes</b>; inodes hold metadata and a <b>block map</b> (direct/indirect pointers, or extents); space is allocated in <b>blocks</b>, which wastes space on small files and bounds file count by inode supply. Hard links share an inode; permissions live in it; the <b>journal</b> makes metadata updates crash-safe and <b>fsync</b> makes data durable.',
        'Choose block size and inode ratio at format time, monitor <code>df -i</code> as well as <code>df</code>, and fsync what must survive.',
      ],
      scene: { nodes: [app(), vfs(), fs(), inode(), blocks()], links: [link('app', 'vfs'), link('vfs', 'fs'), link('fs', 'inode'), link('fs', 'blocks')], flows: [flow(['app', 'vfs', 'fs', 'blocks'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
