# GreatFrontEnd front-end system design integration

## Intent

Merge the public topic index from
`greatfrontend/awesome-front-end-system-design` into Scale Atlas as original,
interactive front-end system-design lessons.

The integration preserves the existing course catalog, lesson contract,
isometric renderer, dynamic metric controls, search, progress, and routing.

## Scope

- 285 normalized-unique public README titles.
- 4 titles under General.
- 219 titles under Applications.
- 28 titles under Techniques / Topics.
- 34 titles under User Interface Components.
- Existing core, ByteByteGo, and System Design Academy entries remain intact.
- 17 normalized overlaps or duplicates are reused or de-duplicated rather than
  created again.

## Source license

The upstream repository is MIT-licensed. Preserve its copyright notice and
permission notice in the repository where source-derived index attribution is
documented. The app will not copy upstream article prose, diagrams, images, or
paid guide content.

The resulting lesson text and scenes are original to Scale Atlas. Title lists
and public resource provenance may be linked or cited, but the implementation
does not reproduce third-party articles.

## Goals

- Add unique front-end titles as lazy-loaded lesson entries.
- Organize titles into a Front-End module family while keeping the existing
  course as one merged catalog.
- Use a real front-end scenario for applications: users, rendered items,
  requests, payload bytes, cache hit rate, LCP, and failure behavior.
- Use real UI-component scenarios: items, virtualized range, DOM nodes,
  accessibility constraints, and interaction latency.
- Use real technique scenarios: bundle bytes, cache keys, network requests,
  retry behavior, or data refresh.
- Give every lesson dynamic parameters and deterministic metric calculations.
- Use 6–10 original steps per completed hand-authored lesson.
- Preserve stable node IDs, links, flows, replay, and print/speech behavior.

## Non-goals

- Copying upstream links into lesson step text as a replacement for content.
- Copying paid GreatFrontEnd solution text or diagrams.
- Downloading or redistributing upstream assets.
- Importing third-party article pages into an iframe.
- Replacing the existing backend-focused `topic-lesson.ts` runtime.

## Approaches considered

### Separate track

This would keep the content isolated and easy to navigate, but it would duplicate
module metadata and route/search integration. It was rejected because the app
already uses one merged course catalog.

### Index only

This would make 285 titles visible fastest but would repeat the earlier
placeholder problem: titles would not provide useful content or metrics.
It was rejected.

### Merged original lessons — selected

Unique titles merge into existing `ModuleDef` values under original
front-end-focused modules. Lessons are authored in batches and lazy-loaded.
The existing generated-runtime pattern may be used for overview lessons where
appropriate, but no lesson is complete without topic-specific narrative and
domain-real formulas.

## Module structure

Use one or more modules in the existing catalog:

- `frontend-general`
- `frontend-applications`
- `frontend-techniques`
- `frontend-ui-components`

The top-level source heading is retained as module or sub-module context.
Application names and UI component names become lesson titles and are never
manufactured into unsupported company claims.

## Lesson quality

Each lesson must:

- explain the user and technical requirements;
- show the normal browser or application path;
- expose at least one bottleneck;
- define a trade-off;
- demonstrate one failure or recovery boundary;
- close with a measurable recap;
- include dynamic parameters only when the topic has meaningful formulas.

Case-study lessons must distinguish original worked scenarios from public
claims. Company measurements may be used only from the public source title or
public evidence and must be labeled.

## Formula domains

Front-end lesson formulas may cover:

- bundle and transfer bytes;
- LCP, FCP, TTI, INP, or p99 interaction latency;
- request and render counts;
- cache hit/miss and stale-data behavior;
- virtualized visible row and DOM-node counts;
- feed pagination and cursor fan-out;
- image and video bitrate;
- accessibility focus traversal;
- service-worker boot and offline recovery;
- state size and re-render cost;
- retry, timeout, and WebSocket reconnection behavior.

No placeholder word values such as “measured,” “baseline,” or “verified” are
the primary metric output.

## Batch plan

1. Front-end General and radio/framework lessons.
2. Representative applications:
   news feed, e-commerce, photo sharing, chat, travel booking, Pinterest,
   email, rideshare, video, music, cloud drive, maps, and search.
3. Techniques/topics:
   performance, accessibility, state, rendering, caching, networking,
   internationalization, security, and testing.
4. UI components:
   autocomplete, data table, modal, carousel, image gallery, pagination,
   virtual list, form, toast, tab, and date/time pickers.
5. Remaining application and resource-style titles.

## Architecture

Add `front-end-index.ts` and one lesson file per meaningful topic or reusable
topic adapter. The existing `topic-lesson.ts` may be extended with
front-end domain context and formulas, but hand-authored modules may export
their own `Lesson.dynamic` model.

Catalog entries use lazy imports. The 17 overlaps remain linked to existing
authored slugs where possible.

## Validation

- Count 285 unique entries and all 4 module sections.
- Run `npm run typecheck`.
- Run `npm run build`.
- Verify an application, technique, UI component, and General route.
- Verify dynamic sliders update metric values and persist per slug.
- Review no upstream article text or assets were copied.

## Decisions from builder review

- All 285 normalized-unique titles are in scope and receive lazy-loaded lesson
  entries. The migration may be delivered in batches, but the catalog is not
  considered complete until 285 entries are reachable.
- Existing normalized overlaps route to the already authored lesson when one
  exists. Canonical matching ignores punctuation and stop words, preserves
  unambiguously meaningful numbers, and prefers an existing core lesson before
  Source, Academy, or new Front-End entries.
- The four source headings map to exactly four top-level modules:
  General, Applications, Techniques / Topics, and User Interface Components.
- Reusable adapters are acceptable when they use the title, module, and detected
  domain to produce meaningful narrative and formulas. The adapter must explain
  normal path, trade-off, and failure behavior, not only substitute a title.
- Every new lesson receives a dynamic model when it has measurable parameters.
  Resource-list-style titles may use a smaller 2-parameter model, but no new
  lesson is left with generic “measured” or “verified” values.
- MIT attribution is stored in `THIRD_PARTY_LICENSES.md` or the README license
  section, with upstream repository name and license link. Public performance
  claims appear only in title or evidence context and are labeled as public
  measurements rather than verified Scale Atlas benchmarks.
