/**
 * Topic-library lessons (ByteByteGo / Academy / Front-End indexes) that are fully authored.
 *
 * Everything else in those indexes is still a title-only outline: it stays out of the
 * sidebar, search and progress totals until someone writes the real lesson. To publish
 * one, author `src/course/lessons/<file>.ts` (replacing the makeTopicLesson wrapper) and
 * add its catalog slug here.
 */
export const PUBLISHED: ReadonlySet<string> = new Set([
  // from earlier hand-authored work
  'source-short-long-polling-sse-websocket',
  'source-load-balancer-realistic-use-cases',
  'source-5-http-status-codes-that-should-never-have-been-created',
  'source-how-to-transform-a-system-to-be-cloud-native',
  'academy-how-mcdonald-s-food-delivery-platform-handles-20-000-orders-per-second',
  // rewritten: real mechanisms, worked examples and formula-driven sliders
  'academy-bloom-filter',
  'academy-gossip-protocol',
  'academy-hinted-handoff',
  'academy-distributed-counter',
  'academy-real-time-gaming-leaderboard',
  'academy-cell-based-architecture',
  'academy-how-kafka-works',
  'academy-google-spanner',
  'academy-virtual-waiting-room-architecture-that-handles-high-demand-ticket-sales-at-seatgeek',
  'academy-concurrency-is-not-parallelism',
  'academy-amazon-dynamo',
  'academy-how-stock-exchange-works-part-1',
  // batch 3
  'source-why-is-redis-so-fast',
  'source-database-isolation-levels',
  'source-delivery-semantics',
  'academy-how-amazon-s3-achieves-99-999999999-durability',
  'academy-how-stripe-prevents-double-payment-using-idempotent-api',
  'academy-consistency-patterns',
  'academy-how-uber-finds-nearby-drivers-at-1-million-requests-per-second',
]);
