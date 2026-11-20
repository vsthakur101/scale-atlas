# Topic-library triage (2026-11-19)

The three index files list **883 hidden, title-only outlines** (400 ByteByteGo-style, 198 Academy-style, 285 front-end).
Writing all of them would produce 883 chapters but far fewer *different things to learn*, and bulk-generating them is what
produced the low-quality first pass. This is the plan instead: write the distinct, teachable mechanisms; fold duplicates into
existing lessons; drop lists, roadmaps and tool tours.

## Selection rule

A title is **WRITE** only if it has (a) a mechanism that can be drawn as a moving diagram, (b) a worked number or small model
for a slider, and (c) claims I can state accurately without company-specific figures. Otherwise it is **MERGE** or **DROP**.

## Already covered by the 40 core lessons (→ MERGE, don't rewrite)

Caching, CDN, load balancers, consistent hashing, B-tree vs LSM, replication, partitioning/sharding, transactions, sagas,
rate limiting (token bucket etc.), consistency models, leader election/consensus, IDs, queues, pub/sub, push (polling →
WebSockets), timeouts/retries/breakers, observability, service discovery, authn/authz/encryption, deploy strategies, link
shortener, social feed, messaging app. Roughly 190 outlines are repeats of these (HTTP/JWT/cookie/OAuth variants, five
"caching strategies", five "Kubernetes cheat sheets" and so on).

## WRITE queue (~115, in batches of 6–8)

**Batch 3 — data & reliability mechanisms (DONE 2026-11-19)**
Why Redis is fast (event loop, persistence, pipelining) · Database isolation levels (anomalies, write skew) · Delivery
semantics + "can Kafka lose messages?" · S3-style durability (erasure coding maths) · Idempotency / double payment ·
Consistency patterns (read-your-writes, read repair) · Geospatial search (geohash / quadtree, nearby drivers)

**Batch 4 — distributed systems** (DONE 2026-11-19)
Distributed lock · Failure detection (heartbeats, phi-accrual) · Clocks and leap seconds · Unique-ID generators (Snowflake)
· Quotient filter · Actor model · Sidecar/service mesh · Resiliency patterns · Erasure-coding repair · CRDTs
· Stock exchange parts 2 & 3 · Time-series databases · Sharding algorithms

**Batch 5 — networking & security** (DONE 2026-11-19)
DNS · HTTP/1 → 2 → 3 · TLS handshake · TCP vs UDP · NAT · gRPC · GraphQL · API pagination · Webhooks vs polling · WebSockets
· OAuth 2.0 flows · JWT · Passwords & hashing · TOTP authenticators · Digital signatures · SSH/VPN

**Batch 6 — systems & infrastructure** (DONE 2026-11-19)
How Kubernetes works · Docker/containers · CI/CD · GitOps/Terraform · Logs-traces-metrics pipeline · Lambda internals
· Virtual machines · Nginx and C10K · Load-balancing algorithms · Disaster recovery · High availability maths

**Batch 7 — case studies (mechanisms only; figures labelled illustrative) (8 written 2026-11-19; remainder of list left for later)**
Uber ETA / payments · WhatsApp · Discord message storage · Slack message journey · Netflix (caching, chaos) · Twitter
timeline · YouTube upload · Figma/Google Docs collaboration · Google search & crawler · Zoom/live streaming · Flash sales
· Payments (card network, UPI, ACH, SWIFT, reconciliation) · Gmail · Maps · Stack Overflow

**Batch 8 — AI systems (5 written 2026-11-19)**
RAG · Vector search · LLM inference & KV cache · Agents & MCP · Evals & guardrails

## DROP / not lessons (~300)

Cheat-sheet lists, roadmaps, "top N tools", books, resume and behavioural interview playbooks, UML/OOP/design-pattern
catalogues, programming-language tours (CSS, JS, C++, Java collections, history), Linux command maps, SEO, vendor service
cheat sheets (AWS/Azure/GCP), and duplicates of the above. Some belong in the Cheatsheets tab instead of the course.

## Front-end (285) — deferred

Mostly links to external engineering articles (Figma, Slack, Airbnb…) and UI component patterns. A different audience and
largely commentary on other people's writing; hidden until there is a real front-end track plan.

## Index cleanup (DONE 2026-11-20)

`source-index.ts` and `academy-index.ts` now contain only authored lessons (171); `front-end-index.ts`, `published.ts`,
`topic-lesson.ts` and the 729 generated placeholder files were deleted (recoverable from git history). The title-only
backlog is preserved in `docs/unwritten-topics.md`. Two entries that had been marked published but lacked a `load`
function (AI evals/guardrails, multi-agent architectures) were fixed and now open normally.
