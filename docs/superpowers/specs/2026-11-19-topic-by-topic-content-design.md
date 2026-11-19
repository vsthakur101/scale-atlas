# Topic-by-topic course content migration

## Intent

Turn the 404-topic reference index derived from the public System Design 101
README into a complete, original Scale Atlas course. Every indexed topic keeps
its own lesson entry, while lesson prose, examples, diagrams, metrics, and
concept definitions are authored for this project in its existing visual style.

The audience is engineers learning system design through short, observable
scenarios rather than static reference pages.

## Goals

- Give every indexed topic its own lazy-loaded `Lesson`.
- Preserve the existing Scale Atlas lesson contract:
  - `blurb`, `minutes`, `level`, metrics, goals, legend, and ordered steps.
  - Narrated steps with problem/technique/insight/case/trade-off/recap framing.
  - An isometric scene for every step using `course/kit.ts` helpers.
  - Searchable concepts and links to related lessons where useful.
- Keep existing authored lessons and navigation behavior intact.
- Deliver content in independently type-checkable and reviewable batches.
- Use only original explanations, examples, numbers, and diagrams; source titles
  are treated as topic references, not prose to reproduce.

## Non-goals

- Copying source-repository prose, diagrams, assets, or linked article content.
- Reproducing the source repository's website or implementation.
- Adding a new content format, CMS, runtime dependency, or rendering system.
- Rewriting the existing 40 authored lessons unless a direct consistency issue
  is found while linking new material.

## Anti-goals

- Do not create placeholder lessons that look complete but contain generic text.
- Do not generate repetitive scenes that fail to explain the concept.
- Do not silently mark a lesson written until its steps, goals, and diagram
  behavior have been checked.

## Approaches considered

### One generated step per topic

This would make all 404 entries appear complete quickly, but it would produce
shallow lessons and poor instructional sequencing. It does not fit the current
lesson quality bar.

### Group topics into a smaller number of lessons

This would reduce authoring cost and can create strong narratives, but it would
break the one-source-topic/one-course-entry mapping requested here.

### Topic-by-topic authoring in batches — selected

Each source topic becomes one original multi-step lesson. Batches follow the
source sections, starting with API and Web Development, then Database and
Storage, Caching and Performance, and so on. This preserves discoverability and
the current catalog contract while keeping each change reviewable.

## Architecture

The existing `ModuleDef` and `LessonRef` types remain the source of truth.

- A completed lesson is added under `src/course/lessons/<slug>.ts`.
- Its catalog entry changes from a reference-only item to:
  `load: () => import('./lessons/<slug>')`.
- The existing `source-index.ts` remains the authoritative title list and
  continues to represent unwritten topics.
- No new lesson renderer or scene abstraction is introduced.
- Existing `course/kit.ts`, `types.ts`, `Board`, search, progress persistence,
  and routing are reused unchanged.
- New lessons use unique `source-<slug>` identifiers unless a deliberate
  migration replaces an existing core lesson.

## Lesson quality contract

Each migrated lesson should normally contain:

- 6–10 steps, including a problem, one or more techniques, a trade-off or case,
  and a recap.
- 3–6 measurable metrics that change across steps.
- 3–6 goals mapped to teaching steps.
- 2–6 searchable concept definitions.
- A meaningful scene for every step, with stable node IDs across transitions.
- At least one failure mode, operational trade-off, or boundary condition where
  the topic warrants it.
- Original examples and clearly labeled illustrative numbers.

Small factual topics may use fewer steps when that is more honest than padding;
complex case studies may use more.

## Batch workflow

For each section:

1. Select the next group of topics and define their learning sequence.
2. Author the lesson files and replace only those catalog entries' loaders.
3. Add focused tests or validation for any new behavior, especially parsing or
   calculations introduced by a lesson.
4. Run `npm run typecheck` and `npm run build`.
5. Verify the source index still has exactly the remaining unwritten entries.
6. Review for originality, accessibility, stable scene IDs, and routeability.

The first batch is the API and Web Development section. Subsequent batches are
independent and can be paused without leaving partially loaded lessons.

## Completion criteria

The migration is complete when all 404 source entries have loaders, every
lesson can be opened through hash routing, authored progress/search behavior
works, and the typecheck/build commands pass with the full catalog.

## Decisions from builder review

- Delivery is by independently accepted source-section batches; the full
  migration does not need to land as one release.
- The current 404-entry `source-index.ts` snapshot is canonical. Any future
  upstream additions are a separate index update.
- The existing 40 authored lessons remain the core curriculum. Overlapping
  source topics receive their own reference-index lesson only when they are not
  already covered; existing slugs and progress are not replaced.
- New lessons use the current audience model: Beginner, Intermediate, or
  Advanced according to the topic, with no separate learner track.
- Acceptance consists of original-content review, accessibility and scene
  review, route/search checks, `npm run typecheck`, and `npm run build`.
- The README documents topic provenance. Individual lessons do not copy source
  material and do not require per-paragraph citations unless a future lesson
  deliberately introduces an external factual source that needs attribution.
