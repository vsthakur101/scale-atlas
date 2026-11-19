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
  // batch 4
  'source-why-use-a-distributed-lock',
  'source-how-to-detect-node-failures-in-distributed-systems',
  'source-why-meta-google-and-amazon-stop-using-leap-seconds',
  'source-time-series-db-tsdb-in-20-lines',
  'academy-actor-model',
  'academy-how-stock-exchange-handles-concurrency-at-scale-part-2',
  'academy-how-sidecar-pattern-works',
  'academy-quotient-filter',
  // batch 5
  'academy-how-dns-works',
  'source-http-1-http-2-http-3',
  'source-https-ssl-handshake-and-data-encryption-explained',
  'source-tcp-vs-udp-for-online-gaming',
  'source-oauth-2-0-flows',
  'source-storing-passwords-safely-a-comprehensive-guide',
  'source-how-google-authenticator-works',
  'source-how-do-we-perform-pagination-in-api-design',
  // batch 6
  'academy-what-is-high-availability',
  'source-cloud-disaster-recovery-strategies',
  'academy-how-load-balancing-algorithms-work',
  'academy-how-nginx-was-able-to-support-1-million-concurrent-connections-on-a-single-server',
  'academy-how-kubernetes-works',
  'source-how-does-docker-work',
  'academy-how-amazon-lambda-works',
  'academy-how-virtual-machines-work',
  // batch 7
  'academy-how-google-docs-works',
  'source-how-do-search-engines-work',
  'academy-how-shopify-handles-flash-sales-at-32-million-requests-per-minute',
  'source-how-youtube-handles-massive-video-uploads',
  'source-how-visa-works-when-swiping-a-credit-card',
  'source-live-streaming-explained',
  'source-how-discord-stores-trillions-of-messages',
  'source-how-does-a-typical-push-notification-system-work',
  // batch 8 (AI systems)
  'academy-how-llm-inference-works',
  'academy-how-rag-works',
  'academy-how-vector-database-search-billions-of-vectors-in-milliseconds',
  'academy-how-ai-agents-work',
  'academy-ai-evals-guardrails-and-security',
  // batch 9 (leftovers: infra and APIs)
  'academy-how-ci-cd-works',
  'academy-how-terraform-works',
  'source-how-nat-enabled-the-internet',
  'source-how-digital-signatures-work',
  'source-how-does-grpc-work',
  'source-what-is-graphql',
  'academy-how-do-websockets-work',
  'academy-how-do-webhooks-work',
  'academy-mcp-a-deep-dive',
  'academy-how-fine-tuning-works',
  'academy-multi-agent-architectures-clearly-explained',
]);
