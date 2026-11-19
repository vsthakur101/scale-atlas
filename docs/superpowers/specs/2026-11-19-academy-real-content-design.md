# Academy real content migration

## Intent

Replace the 211 generated overview wrappers for the System Design Academy
catalog with original hand-authored lessons that fit the existing Scale Atlas
lesson and simulator architecture.

Each lesson should explain the topic from first principles, show a meaningful
isometric scene, use real or explicitly bounded illustrative scenarios, and
provide real calculations where the topic has measurable behavior.

## Scope

- All 211 entries under the five Academy modules.
- The existing 404 ByteByteGo entries remain outside this migration.
- Existing 40 core lessons and existing three hand-authored ByteByteGo/API
  lessons remain unchanged.
- The upstream Academy license is consulted for attribution only. Lesson text,
  diagrams, and assets are original to this repository.

## Goals

- Every Academy catalog entry gets a dedicated lesson file or an explicit
  shared lesson that is topic-specific at runtime.
- 6–10 steps per lesson, with problem, mechanism, trade-off, failure, and recap.
- Domain-specific metrics with units and non-placeholder values.
- Real formulas for parameters that are meaningful to the topic.
- Dynamic controls in the existing lesson shell.
- Stable scene node IDs and packet routes.
- Existing search, progress, print, speech, routing, and lazy loading continue.

## Non-goals

- Copying upstream article text, diagrams, newsletter links, or images.
- Importing the Academy repository's 219-link dataset as raw visible content.
- Replacing the Design Lab.
- Claiming public company numbers or internal behavior are universal facts.

## Batch plan

1. Case studies: 64 lessons.
2. Fundamentals: 80 lessons.
3. Interview: 13 lessons.
4. AI Engineering: 51 lessons.
5. Software White Papers: 3 lessons.

Within each batch:

1. Group closely related lessons around shared architectural mechanisms.
2. Extract shared formulas only when they are genuinely reusable.
3. Author a dedicated lesson file or a named topic adapter with original prose.
4. Attach a dynamic model with a default scenario and bounded inputs.
5. Wire the loader in `academy-index.ts`.
6. Typecheck and build.
7. Spot-check routes and metric values.

## Lesson quality

A lesson is complete only if:

- the title is reflected in the step narrative;
- the normal mechanism is explained in its own step;
- at least one trade-off is explicit;
- at least one failure or recovery boundary is shown;
- metrics are labelled and use consistent units;
- the formula is deterministic;
- the dynamic controls expose meaningful inputs;
- an illustrative scenario is labeled as such when it does not come from public
  measurements.

## Formulas

Dynamic models may calculate:

- queue utilisation and latency;
- cache hit/miss and origin load;
- throughput and capacity;
- replica lag;
- retries, duplicate risk, and delivery rate;
- inference cost and latency;
- storage, data volume, and fan-out;
- availability and failure-domain recovery;
- case-specific order, payment, chat, feed, search, or media processing rates.

No generic “measured,” “degraded,” or “verified” state is accepted as the
primary metric output. State labels are allowed only as secondary semantics.

## Shared infrastructure

Keep:

- `Lesson`, `Step`, `Scene`, `MetricDef`, and `DynamicLessonModel`;
- `course/kit.ts`;
- `Board`;
- `topic-lesson.ts` as a temporary fallback only;
- `store.ts` persistence;
- hash routing and lazy imports.

Topic-specific data and formulas belong in dedicated lesson files or reusable
domain adapters, not in the global catalog.

## McDonald’s pilot

The first lesson will be McDonald's food delivery platform. It will model:

- orders per second;
- payment success or checkout share;
- restaurant and kitchen capacity;
- async queue backlog;
- p99 acknowledgement latency;
- database write amplification;
- failure and retry behavior.

Public-scale title claims are not represented as a verified architecture.
The lesson explicitly frames the numbers as a worked illustrative scenario.
