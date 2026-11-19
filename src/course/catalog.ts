import type { ModuleDef } from '../types';

/**
 * The whole course map. A lesson with `load` is written; one without is listed as
 * coming soon. Lessons are code-split, so only the one being viewed is downloaded
 * (search pulls in the rest on demand).
 */
export const MODULES: ModuleDef[] = [
  {
    id: 'foundations',
    title: 'Foundations',
    tone: 'yellow',
    lessons: [
      { slug: 'request-journey', title: 'Anatomy of a Page Load', load: () => import('./lessons/request-journey') },
      { slug: 'latency-throughput', title: 'Latency & Throughput', load: () => import('./lessons/latency-throughput') },
      { slug: 'estimation', title: 'Back-of-the-Envelope Math', load: () => import('./lessons/estimation') },
    ],
  },
  {
    id: 'scaling',
    title: 'Scaling',
    tone: 'green',
    lessons: [
      { slug: 'scale-up-out', title: 'Scaling Up vs Out', load: () => import('./lessons/scale-up-out') },
      { slug: 'load-balancers', title: 'Load Balancers', load: () => import('./lessons/load-balancers') },
      { slug: 'stateless', title: 'Stateless Servers', load: () => import('./lessons/stateless') },
      { slug: 'caching', title: 'Caching', load: () => import('./lessons/caching') },
      { slug: 'cdn', title: 'Edge Caching & CDNs', load: () => import('./lessons/cdn') },
    ],
  },
  {
    id: 'data',
    title: 'Data & Storage',
    tone: 'purple',
    lessons: [
      { slug: 'choosing-a-database', title: 'Choosing a Database' },
      { slug: 'indexes', title: 'Indexes' },
      { slug: 'btree-lsm', title: 'B-Trees & LSM Trees' },
      { slug: 'replication', title: 'Replication' },
      { slug: 'partitioning', title: 'Partitioning' },
      { slug: 'consistent-hashing', title: 'Consistent Hashing' },
      { slug: 'ids', title: 'Generating IDs' },
      { slug: 'consistency-models', title: 'Consistency Models' },
      { slug: 'consensus', title: 'Leader Election & Consensus' },
      { slug: 'transactions', title: 'Transactions' },
      { slug: 'blob-storage', title: 'Blob Storage' },
    ],
  },
  {
    id: 'communication',
    title: 'Communication',
    tone: 'orange',
    lessons: [
      { slug: 'api-styles', title: 'API Styles' },
      { slug: 'queues', title: 'Queues' },
      { slug: 'pubsub', title: 'Events & Pub/Sub' },
      { slug: 'push', title: 'Push: Polling to WebSockets' },
    ],
  },
  {
    id: 'reliability',
    title: 'Reliability',
    tone: 'blue',
    lessons: [
      { slug: 'failover', title: 'Redundancy & Failover' },
      { slug: 'rate-limiting', title: 'Rate Limiting' },
      { slug: 'timeouts-retries', title: 'Timeouts, Retries & Breakers' },
      { slug: 'observability', title: 'Observability' },
    ],
  },
  {
    id: 'architecture',
    title: 'Architecture',
    tone: 'red',
    lessons: [
      { slug: 'services', title: 'Monolith to Services' },
      { slug: 'discovery', title: 'Service Discovery' },
      { slug: 'sagas', title: 'Sagas' },
      { slug: 'batch-streams', title: 'Batch & Streams' },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    tone: 'teal',
    lessons: [
      { slug: 'authn', title: 'Authentication' },
      { slug: 'authz', title: 'Authorization' },
      { slug: 'encryption', title: 'Encryption & Secrets' },
    ],
  },
  {
    id: 'shipping',
    title: 'Shipping',
    tone: 'sand',
    lessons: [
      { slug: 'testing', title: 'Testing at Scale' },
      { slug: 'deploys', title: 'Deploy Strategies' },
    ],
  },
  {
    id: 'cases',
    title: 'Case Studies',
    tone: 'grey',
    lessons: [
      { slug: 'requirements', title: 'From Requirements to Design' },
      { slug: 'link-shortener', title: 'A Link Shortener' },
      { slug: 'social-feed', title: 'A Social Feed' },
      { slug: 'messaging', title: 'A Messaging App' },
    ],
  },
];

export interface LessonLocation {
  moduleIndex: number;
  lessonIndex: number;
  module: ModuleDef;
}

export function locate(slug: string): LessonLocation | null {
  for (let mi = 0; mi < MODULES.length; mi++) {
    const m = MODULES[mi]!;
    const li = m.lessons.findIndex((l) => l.slug === slug);
    if (li >= 0) return { moduleIndex: mi, lessonIndex: li, module: m };
  }
  return null;
}

export const ALL_LESSONS = MODULES.flatMap((m) => m.lessons);
export const BUILT_LESSONS = ALL_LESSONS.filter((l) => l.load);

/** The next written lesson after `slug`, if any. */
export function nextBuilt(slug: string): (typeof ALL_LESSONS)[number] | undefined {
  const i = ALL_LESSONS.findIndex((l) => l.slug === slug);
  return ALL_LESSONS.slice(i + 1).find((l) => l.load);
}
