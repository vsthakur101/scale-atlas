# Scale Atlas

An interactive system design course. Every idea is an animated isometric diagram you step through, with a running metrics strip, a step narrative, goals that tick off as you go, and progress saved per lesson.

All lesson text, scenarios and diagrams are original to this project.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle in dist/
```

## Status

| Module | Lessons | State |
|---|---|---|
| 01 Foundations | Anatomy of a Page Load · Latency & Throughput · Back-of-the-Envelope Math | written |
| 02 Scaling | Scaling Up vs Out · Load Balancers · Stateless Servers · Caching · Edge Caching & CDNs | written |
| 03 Data & Storage | Choosing a Database · Indexes · B-Trees & LSM Trees · Replication · Partitioning · Consistent Hashing · Generating IDs · Consistency Models · Leader Election & Consensus · Transactions · Blob Storage | written |
| 04 Communication | API Styles · Queues · Events & Pub/Sub · Push: Polling to WebSockets | written |
| 05 Reliability | Redundancy & Failover · Rate Limiting · Timeouts, Retries & Breakers · Observability | written |
| 06 Architecture | Monolith to Services · Service Discovery · Sagas · Batch & Streams | written |
| 07 Security | Authentication · Authorization · Encryption & Secrets | written |
| 08 Shipping | Testing at Scale · Deploy Strategies | written |
| 09 Case Studies | From Requirements to Design · A Link Shortener · A Social Feed · A Messaging App | written |

All 40 core lessons (380 steps, 298 searchable concepts) are written.

## Topic library

Beyond the core lessons, `src/course/source-index.ts` (ByteByteGo-style topics) and `src/course/academy-index.ts`
(System Design Academy-style topics) list **171 authored topic lessons** — 212 lessons in total with the 41 core ones.
Every entry in those files is a real lesson in `src/course/lessons/`: specific isometric scenes, worked numbers, and a
`dynamic` model whose formulas are checked against the text (figures in company-flavoured lessons are labelled
illustrative and describe general mechanisms only). Topic titles are used as references; no upstream prose, diagrams or
assets are copied.

Coverage, by theme: data and storage engines (Bloom filters, LSM/B-trees, WAL and ACID, Redis, Elasticsearch, S3-style
object stores, sharding, replicas, serverless databases), distributed systems (gossip, consensus-adjacent patterns,
failure detection, clocks, locks, CRDTs, idempotency, queues and delivery semantics), networking and security (DNS, TLS,
HTTP, IP/CIDR, VPNs, SSH, passkeys, OAuth/SSO, firewalls, secrets), infrastructure and delivery (Kubernetes, Docker,
CI/CD, GitOps, Terraform, canaries and flags, observability), payments (card networks, UPI-style rails, reconciliation,
wallets, FX), AI systems (RAG, vector search, LLM inference, agents, evals, LLM-as-a-judge) and case-study mechanisms.

**Adding a lesson:** write `src/course/lessons/<slug>.ts` (default export a `Lesson`), add one entry
`{ slug, title, load: () => import('./lessons/<slug>') }` to a module in the matching index file, then run `npx tsc
--noEmit` and `npm run build`. Titles that were listed but never written are kept, title-only, in
`docs/unwritten-topics.md`; the selection rationale is in `docs/topic-triage.md`. Third-party licence notices are in
`THIRD_PARTY_LICENSES.md`.

## Practice

The Practice tab (`#/practice`) has 52 drills — one set per module plus a weighted mixed review:

- **Spot it**: a live diagram with symptoms; click the component that answers the prompt (or pick from the list).
- **Choose**: one correct option; every option explains why it is right or wrong after answering.
- **Estimate**: napkin maths graded by ratio — within 2× is right, within 10× is close. Accepts `4,096,000`, `4.1M`, `2k`, `1e6`.

Every drill links back to the lesson step that teaches it. History (per-drill last result, streak) is kept in `localStorage` under `atlas:practice*`; mixed review favours drills you missed or haven't tried. Code lives in `src/practice/` (`drills-core.ts`, `drills-advanced.ts` for content; `view.ts` for the UI).

## Design Lab

The Design Lab tab (`#/lab`) is a live capacity simulator. Add components (CDN, load balancer, app servers, cache, queue, workers, database with optional hot standby, read replicas), link them, and every change re-runs a steady-state traffic model:

- Requests flow through the links in column order; reads go cache → stores, writes go queue → workers → database or straight to the primary. Each component serves up to its capacity and drops the excess.
- Latency per component follows the queueing curve `base × (1 + 3ρ²/(1−ρ))`; p99 is the slowest path carrying ≥1% of traffic.
- A component is a single point of failure if losing it (or one of its instances) adds >5% errors or stops writes reaching a database.
- **Break mode** fails components (one instance, then all) so you can watch failover or collapse.

Five challenges (first launch, launch day, read storm, no single point of failure, write burst) each have live pass/fail goals and a reference solution that is verified to pass. The sandbox has adjustable traffic and a shareable link (`#/lab/sandbox/<code>`). Designs and solved challenges save in `localStorage` under `atlas:lab*`. Code: `src/lab/` (`model.ts`, `sim.ts`, `challenges.ts`, `view.ts`).

## Cheatsheets

The Cheatsheets tab (`#/sheets`) is a reference library of 10 sheets — Numbers to know, Foundations, Scaling, Data & Storage, Communication, Reliability, Architecture, Security, Shipping and Design method. Each sheet mixes comparison tables, formulas with worked examples, checklists and pitfalls, links back to the lessons it summarises, and (on five sheets) live calculators: per-day → per-second, availability → downtime, Little's Law, fan-out tail, cache effectiveness, chain availability, storage growth and bandwidth.

Search (`/`) matches individual rows across every sheet and deep-links to the section (`#/sheets/<sheet>/<block>`). **Print** gives a plain black-and-white layout (calculators omitted; the library page prints every sheet), and sheets can be copied or downloaded as Markdown. Content is data in `src/sheets/content-*.ts`; text fields support `` `code` `` and `**bold**`. Code: `src/sheets/` (`types.ts`, `calcs.ts`, `content-core.ts`, `content-advanced.ts`, `sheets.ts`, `view.ts`).

Shell features: course tree with per-module progress, lesson stepper, keyboard nav (`←` `→` `R` `Space` `/` `⌘K`), swipe on touch, search palette over concepts and steps, light/dark theme with no flash, three layouts (desktop / tablet drawer / stacked phone), read-aloud, copy step link, print-a-lesson view, reduced-motion support. The language menu is a placeholder.

## Layout

```
src/
  main.ts                 shell, router (#/<lesson>/<step>), keyboard, speech, print
  engine/board.ts         isometric SVG renderer + packet simulation
  engine/icons.ts         stroke icon set
  course/catalog.ts       module/lesson map; a lesson with `load` is written
  course/kit.ts           authoring helpers (at, box, db, crowd, link, flow, pill, patch)
  course/lessons/*.ts     one file per lesson, code-split
  practice/               drill sets, grading, progress and the Practice view (lazy-loaded)
  lab/                    Design Lab: component model, traffic simulator, challenges, view (lazy-loaded)
  sheets/                 Cheatsheets: sheet content, calculators, view, print/Markdown (lazy-loaded)
  ui/search.ts, toast.ts  palette + toasts
  store.ts                localStorage (prefix `atlas:`), guarded
  site.ts                 name / author branding
```

## Writing a lesson

A lesson is data: `metrics`, `goals`, `legend`, and `steps[]`. Each step has text (`title`, `body`, optional `note`, `changes`, `concepts` for search) and a full `scene`:

- `nodes`: `block` | `db` | `crowd` | `device` | `disk` | `zone` | `ring`, placed with `at(right, down)` (or `onRing(center, radius, deg)` for circular layouts). Optional `tag` (pill above), `label` (pill below), `load` (0–100 bar), `state` (`hot` | `down` | `ghost` | `dim`).
- `links`: `solid` | `dashed` | `broken`, optional label pill.
- `flows`: packets along a route of node ids; `kind` sets colour, `rate` is packets/s, `back: true` returns a response. The legend is derived from the flows a lesson uses.
- `metrics`: values for the lesson's metric strip; `{ v, tone }` colours a card.

Nodes keep their identity across steps by `id`, so a node present in consecutive steps glides to its new position instead of re-entering. Add the file under `course/lessons/` and give its catalog entry `load: () => import('./lessons/<slug>')`.
