import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, disk, flow, link, pill, zone } from '../kit';

const users = (extra: Partial<SceneNode> = {}) => crowd('users', -12, 1, 14, 'uploaders', extra);
const app = (extra: Partial<SceneNode> = {}) => box('app', -4, -2, 'API', 'blue', 'server', { size: [1.5, 1.5], height: 42, ...extra });
const meta = (extra: Partial<SceneNode> = {}) => db('meta', 4, -8, 'Metadata DB', extra);
const bucket = (extra: Partial<SceneNode> = {}) =>
  disk('bucket', 5, 3, 'object store · videos/', { size: [3.2, 2.4], height: 30, tone: 'orange', icon: 'image', ...extra });
const queue = (extra: Partial<SceneNode> = {}) => box('queue', 11, -3, 'Queue', 'yellow', 'queue', { size: [1.3, 1.3], height: 30, ...extra });
const workers = (extra: Partial<SceneNode> = {}) => box('work', 14, 3, 'Transcoders', 'purple', 'cpu', { size: [1.5, 1.5], height: 40, ...extra });
const cdn = (extra: Partial<SceneNode> = {}) => box('cdn', -3, 9, 'CDN', 'teal', 'globe', { size: [1.4, 1.4], height: 36, ...extra });

const lesson: Lesson = {
  slug: 'blob-storage',
  title: 'Blob Storage',
  blurb: 'Videos, images and documents don’t belong in your database. Here’s where they go, how they get there, and how they get out.',
  minutes: 11,
  level: 'Intermediate',
  metrics: [
    { key: 'dbsize', label: 'DB size', icon: 'db' },
    { key: 'cost', label: 'Storage $/mo', icon: 'dollar' },
    { key: 'upload', label: 'Upload success', icon: 'activity' },
    { key: 'durability', label: 'Durability', icon: 'shield' },
  ],
  goals: [
    { text: 'Why large files don’t belong in the database', step: 1 },
    { text: 'Object stores and metadata pointers', step: 2 },
    { text: 'Direct and multipart uploads', step: 3 },
    { text: 'Erasure coding for durability', step: 4 },
    { text: 'Processing pipelines, lifecycle tiers and orphans', step: 8 },
  ],
  legend: ['write', 'request', 'response', 'heavy', 'hit'],
  steps: [
    {
      short: 'BLOBs',
      kind: 'problem',
      title: 'Videos in a BLOB column',
      body: [
        'A course platform stores lecture videos in a <code>bytea</code> column. The database has grown to 6 TB, nightly backups take 14 hours, restoring would take a day, and every video read pushes useful pages out of the buffer cache.',
        'Databases are built for small, structured, frequently changing rows. Large immutable files want a different kind of storage.',
      ],
      changes: [{ text: 'DB 6 TB, backups 14 h', tone: 'bad' }],
      scene: {
        nodes: [users(), app(), meta({ name: 'Database', load: 88, state: 'hot', tag: pill('6 TB of video', 'alert', 'bad') })],
        links: [link('users', 'app'), link('app', 'meta', { arrow: 'both' })],
        flows: [flow(['users', 'app', 'meta'], { kind: 'heavy', rate: 1, speed: 0.4 })],
        metrics: { dbsize: { v: '6 TB', tone: 'bad' }, cost: { v: '$2,900', tone: 'bad' }, upload: '91%', durability: 'backups' },
      },
    },
    {
      short: 'Object store',
      kind: 'technique',
      title: 'Objects in a bucket, pointers in the database',
      body: [
        'An <b>object store</b> (S3, GCS, Azure Blob, MinIO) holds immutable objects under keys in a flat namespace: <code>videos/course-81/lesson-3.mp4</code>. It scales to petabytes, costs a fraction of database storage per GB, and replicates automatically.',
        'The database keeps only <b>metadata</b>: title, owner, size, duration, and the object key. It shrinks from 6 TB to 40 GB and backs up in minutes.',
      ],
      changes: [{ text: 'DB 6 TB → 40 GB', tone: 'good' }, { text: 'Storage cost −85%', tone: 'good' }],
      concepts: [{ term: 'Object storage', def: 'Storage for immutable blobs addressed by key in buckets, accessed over HTTP, highly durable and cheap per GB.' }],
      scene: {
        nodes: [users(), app(), meta({ tag: pill('key: videos/81/3.mp4', 'key') }), bucket()],
        links: [link('users', 'app'), link('app', 'meta', { arrow: 'both' }), link('app', 'bucket', { arrow: 'both' })],
        flows: [flow(['users', 'app', 'bucket'], { kind: 'heavy', rate: 0.8, speed: 0.5 }), flow(['app', 'meta'], { kind: 'write', rate: 0.8 })],
        metrics: { dbsize: { v: '40 GB', tone: 'good' }, cost: { v: '$430', tone: 'good' }, upload: '91%', durability: 'replicated' },
      },
    },
    {
      short: 'Uploads',
      kind: 'technique',
      title: 'Upload straight to storage, in parts',
      body: [
        'Proxying 2 GB uploads through the API ties up servers and fails often on flaky connections. Instead the API returns <b>pre-signed URLs</b> and the browser uploads directly to the bucket.',
        'For large files, use <b>multipart upload</b>: split into 16 MB parts, upload several in parallel, retry only failed parts, and complete the object at the end. A dropped connection at 1.9 GB costs one part, not the whole file.',
      ],
      changes: [{ text: 'Direct, parallel, resumable', tone: 'good' }, { text: 'Upload success 91% → 99.6%', tone: 'good' }],
      concepts: [{ term: 'Multipart upload', def: 'Uploading a large object as independently retried parts that the store assembles on completion.' }],
      scene: {
        nodes: [users({ tag: pill('part 87 of 128', 'layers') }), app({ tag: pill('issues signed URLs', 'key') }), meta(), bucket({ tag: pill('assembling parts', 'layers', 'good') })],
        links: [link('users', 'app', { style: 'dashed' }), link('users', 'bucket', { label: pill('PUT part (signed)', 'link') }), link('app', 'meta', { arrow: 'both' })],
        flows: [flow(['users', 'bucket'], { kind: 'write', rate: 4 }), flow(['users', 'app'], { back: true, rate: 0.3 })],
        metrics: { dbsize: '40 GB', cost: '$430', upload: { v: '99.6%', tone: 'good' }, durability: 'replicated' },
      },
    },
    {
      short: 'Durability',
      kind: 'insight',
      title: 'Eleven nines, without three full copies',
      body: [
        'Object stores advertise durability like 99.999999999%. Keeping three full copies across zones would triple the raw storage. Instead they use <b>erasure coding</b>: split an object into, say, 8 data shards plus 4 parity shards spread across failure domains.',
        'Any 8 of the 12 rebuild the object, so it survives 4 simultaneous losses at only 1.5× storage overhead. The trade is CPU and network on reconstruction.',
      ],
      concepts: [{ term: 'Erasure coding', def: 'Encoding data into n shards such that any k of them can reconstruct it, tolerating n − k losses with low overhead.' }],
      scene: {
        nodes: [
          zone('z1', -7, 0, 4, 4, 'zone a', 'blue'),
          zone('z2', 0, 0, 4, 4, 'zone b', 'green'),
          zone('z3', 7, 0, 4, 4, 'zone c', 'yellow'),
          ...[-8.4, -5.6, -1.4, 1.4, 5.6, 8.4].map((r, i) =>
            disk(`sh${i}`, r, i % 2 ? 1.2 : -1.2, i < 4 ? `data` : 'parity', { size: [0.9, 0.9], height: 14, tone: i < 4 ? 'orange' : 'purple', icon: i < 4 ? 'file' : 'shield', state: i === 2 ? 'down' : 'ok' }),
          ),
        ],
        metrics: { dbsize: '40 GB', cost: '$430', upload: '99.6%', durability: { v: '11 nines', tone: 'good' } },
      },
    },
    {
      short: 'Processing',
      kind: 'technique',
      title: 'An upload kicks off a pipeline',
      body: [
        'Raw uploads aren’t playable everywhere. When an object lands, the store emits an <b>event</b> onto a queue; transcoder workers pick it up, produce 1080p/720p/360p renditions and a thumbnail, write them back under new keys, and update the metadata row to “ready”.',
        'The upload request returns immediately; heavy work happens asynchronously and scales by adding workers.',
      ],
      changes: [{ text: 'Object created → event → workers', tone: 'good' }],
      scene: {
        nodes: [users(), app(), meta({ tag: pill('status: processing', 'clock', 'warn') }), bucket(), queue({ tag: pill('ObjectCreated', 'bolt') }), workers({ load: 70 })],
        links: [link('users', 'bucket'), link('bucket', 'queue'), link('queue', 'work'), link('work', 'bucket', { label: pill('720p, 360p, thumb') }), link('work', 'meta', { style: 'dashed' })],
        flows: [flow(['bucket', 'queue', 'work'], { rate: 1 }), flow(['work', 'bucket'], { kind: 'write', rate: 1.5 }), flow(['work', 'meta'], { kind: 'write', rate: 0.4 })],
        metrics: { dbsize: '40 GB', cost: '$470', upload: '99.6%', durability: '11 nines' },
      },
    },
    {
      short: 'Serving',
      kind: 'technique',
      title: 'Serve through a CDN with signed access',
      body: [
        'Students stream through a <b>CDN</b> in front of the bucket, so popular lectures are served from the edge. Paid courses use short-lived <b>signed URLs</b> or cookies, so a link copied to a forum stops working within minutes.',
        'Video players request byte ranges (<code>Range: bytes=…</code>) and adaptive streaming formats split videos into small segments — both cache well at the edge.',
      ],
      scene: {
        nodes: [crowd('users', -12, 1, 18, 'students'), app({ tag: pill('signs playback URL', 'key') }), meta(), bucket(), cdn({ tag: pill('segments cached', 'globe', 'good') })],
        links: [link('users', 'app', { style: 'dashed' }), link('users', 'cdn', { arrow: 'both' }), link('cdn', 'bucket', { style: 'dashed' })],
        flows: [flow(['users', 'cdn'], { kind: 'hit', back: true, rate: 3 }), flow(['cdn', 'bucket'], { back: true, rate: 0.3 })],
        metrics: { dbsize: '40 GB', cost: '$470', upload: '99.6%', durability: '11 nines' },
      },
    },
    {
      short: 'Lifecycle',
      kind: 'technique',
      title: 'Lifecycle rules: cheaper as files cool',
      body: [
        'Most files are hot for weeks and then barely touched. <b>Lifecycle rules</b> move objects automatically: standard storage for 30 days, infrequent-access tier after that, archive after a year, delete raw uploads once renditions exist.',
        'Colder tiers cost far less per GB but charge more (and take longer, for archive) to read — so tier by actual access patterns, not by age alone.',
      ],
      changes: [{ text: 'Raw uploads deleted after 7 days', tone: 'good' }, { text: 'Storage $470 → $260', tone: 'good' }],
      concepts: [{ term: 'Storage tiering', def: 'Moving data to cheaper, slower storage classes as it is accessed less often.' }],
      scene: {
        nodes: [
          disk('hot', -7, 0, 'standard', { size: [2.2, 2.2], height: 34, tone: 'orange', icon: 'bolt', tag: pill('0–30 days') }),
          disk('ia', 0, 0, 'infrequent', { size: [2.2, 2.2], height: 26, tone: 'blue', icon: 'clock', tag: pill('30–365 days') }),
          disk('arch', 7, 0, 'archive', { size: [2.2, 2.2], height: 18, tone: 'grey', icon: 'box', tag: pill('1 year +') }),
        ],
        links: [link('hot', 'ia', { label: pill('day 30') }), link('ia', 'arch', { label: pill('day 365') })],
        flows: [flow(['hot', 'ia', 'arch'], { kind: 'write', rate: 0.8 })],
        metrics: { dbsize: '40 GB', cost: { v: '$260', tone: 'good' }, upload: '99.6%', durability: '11 nines' },
      },
    },
    {
      short: 'Orphans',
      kind: 'case',
      title: 'Case: 30% of the bucket belongs to nobody',
      body: [
        'An audit finds 30% of stored bytes have no metadata row: uploads abandoned before completion, renditions of deleted courses, and deletes that removed the row but crashed before removing the object. Nothing references them; everything bills for them.',
        'Two writes to two systems can’t be atomic. Pick an order that fails safe (write the object first, then the row; delete the row first, then the object), expire incomplete multipart uploads, and run a periodic <b>reconciliation</b> job that deletes objects with no owner.',
      ],
      note: { kind: 'tip', text: 'Put an owner prefix in object keys (course/81/…) so cleanup of a deleted course is one prefix delete, not a search.' },
      changes: [{ text: '30% orphaned bytes found', tone: 'bad' }, { text: 'Nightly reconcile job', tone: 'good' }],
      scene: {
        nodes: [box('recon', -4, -2, 'Reconciler', 'red', 'refresh', { size: [1.4, 1.4], height: 36, tag: pill('nightly', 'clock') }), meta(), bucket({ tag: pill('orphans: 1.4 TB', 'alert', 'bad') })],
        links: [link('recon', 'meta', { arrow: 'both' }), link('recon', 'bucket', { arrow: 'both', label: pill('list → diff → delete') })],
        flows: [flow(['recon', 'meta'], { back: true, rate: 0.6 }), flow(['recon', 'bucket'], { kind: 'fail', rate: 0.8 })],
        metrics: { dbsize: '40 GB', cost: { v: '$260 → $185', tone: 'good' }, upload: '99.6%', durability: '11 nines' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Bytes in buckets, facts in the database',
      body: [
        'Keep large immutable files in an <b>object store</b> and only their metadata and keys in the database. Upload <b>directly</b> with pre-signed, multipart uploads; process asynchronously from storage events; serve through a <b>CDN</b> with signed URLs.',
        'Durability comes from replication or erasure coding; cost control comes from <b>lifecycle tiers</b>; and because two systems can’t share a transaction, plan write order and <b>reconcile</b> orphans.',
      ],
      scene: {
        nodes: [users(), app(), meta(), bucket({ tag: pill('durable · cheap', 'shield', 'good') }), queue(), workers(), cdn()],
        links: [link('users', 'bucket'), link('app', 'meta', { arrow: 'both' }), link('bucket', 'queue'), link('queue', 'work'), link('work', 'bucket'), link('cdn', 'bucket', { style: 'dashed' }), link('users', 'cdn', { arrow: 'both' })],
        flows: [flow(['users', 'bucket'], { kind: 'write', rate: 1.5 }), flow(['bucket', 'queue', 'work'], { rate: 0.6 }), flow(['users', 'cdn'], { kind: 'hit', back: true, rate: 1.5 })],
        metrics: { dbsize: '40 GB', cost: '$185', upload: '99.6%', durability: '11 nines' },
      },
    },
  ],
};

export default lesson;
