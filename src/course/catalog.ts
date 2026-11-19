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
      { slug: 'choosing-a-database', title: 'Choosing a Database', load: () => import('./lessons/choosing-a-database') },
      { slug: 'indexes', title: 'Indexes', load: () => import('./lessons/indexes') },
      { slug: 'btree-lsm', title: 'B-Trees & LSM Trees', load: () => import('./lessons/btree-lsm') },
      { slug: 'replication', title: 'Replication', load: () => import('./lessons/replication') },
      { slug: 'partitioning', title: 'Partitioning', load: () => import('./lessons/partitioning') },
      { slug: 'consistent-hashing', title: 'Consistent Hashing', load: () => import('./lessons/consistent-hashing') },
      { slug: 'ids', title: 'Generating IDs', load: () => import('./lessons/ids') },
      { slug: 'consistency-models', title: 'Consistency Models', load: () => import('./lessons/consistency-models') },
      { slug: 'consensus', title: 'Leader Election & Consensus', load: () => import('./lessons/consensus') },
      { slug: 'transactions', title: 'Transactions', load: () => import('./lessons/transactions') },
      { slug: 'blob-storage', title: 'Blob Storage', load: () => import('./lessons/blob-storage') },
    ],
  },
  {
    id: 'communication',
    title: 'Communication',
    tone: 'orange',
    lessons: [
      { slug: 'api-styles', title: 'API Styles', load: () => import('./lessons/api-styles') },
      { slug: 'queues', title: 'Queues', load: () => import('./lessons/queues') },
      { slug: 'pubsub', title: 'Events & Pub/Sub', load: () => import('./lessons/pubsub') },
      { slug: 'push', title: 'Push: Polling to WebSockets', load: () => import('./lessons/push') },
    ],
  },
  {
    id: 'reliability',
    title: 'Reliability',
    tone: 'blue',
    lessons: [
      { slug: 'failover', title: 'Redundancy & Failover', load: () => import('./lessons/failover') },
      { slug: 'rate-limiting', title: 'Rate Limiting', load: () => import('./lessons/rate-limiting') },
      { slug: 'timeouts-retries', title: 'Timeouts, Retries & Breakers', load: () => import('./lessons/timeouts-retries') },
      { slug: 'observability', title: 'Observability', load: () => import('./lessons/observability') },
    ],
  },
  {
    id: 'architecture',
    title: 'Architecture',
    tone: 'red',
    lessons: [
      { slug: 'services', title: 'Monolith to Services', load: () => import('./lessons/services') },
      { slug: 'discovery', title: 'Service Discovery', load: () => import('./lessons/discovery') },
      { slug: 'sagas', title: 'Sagas', load: () => import('./lessons/sagas') },
      { slug: 'batch-streams', title: 'Batch & Streams', load: () => import('./lessons/batch-streams') },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    tone: 'teal',
    lessons: [
      { slug: 'authn', title: 'Authentication', load: () => import('./lessons/authn') },
      { slug: 'authz', title: 'Authorization', load: () => import('./lessons/authz') },
      { slug: 'encryption', title: 'Encryption & Secrets', load: () => import('./lessons/encryption') },
    ],
  },
  {
    id: 'shipping',
    title: 'Shipping',
    tone: 'sand',
    lessons: [
      { slug: 'testing', title: 'Testing at Scale', load: () => import('./lessons/testing') },
      { slug: 'deploys', title: 'Deploy Strategies', load: () => import('./lessons/deploys') },
    ],
  },
  {
    id: 'cases',
    title: 'Case Studies',
    tone: 'grey',
    lessons: [
      { slug: 'requirements', title: 'From Requirements to Design', load: () => import('./lessons/requirements') },
      { slug: 'link-shortener', title: 'A Link Shortener', load: () => import('./lessons/link-shortener') },
      { slug: 'social-feed', title: 'A Social Feed', load: () => import('./lessons/social-feed') },
      { slug: 'messaging', title: 'A Messaging App', load: () => import('./lessons/messaging') },
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
