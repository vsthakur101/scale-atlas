# Dynamic topic metrics

## Intent

Make topic lessons interactive by allowing the lesson author to define real
scenario inputs and formulas for its metric strip. Users should be able to
change traffic or workload parameters and immediately see derived metrics
change in the isometric scene.

This replaces synthetic or phase-based values in overview lessons with inputs
and calculations that represent a stated scenario.

## Approaches considered

### Shared lesson controls

A small set of traffic, pressure, and failure controls would cover all topics
without much implementation work. It was rejected because cache hit ratios,
database lag, queue depth, financial risk, and other domains require different
inputs and units.

### Per-topic custom parameter models — selected

Each lesson may declare an optional scenario model:

- named numeric parameters with labels and ranges;
- a deterministic calculation function that produces `Scene.metrics`;
- optional per-step parameter multipliers or failure state;
- a reset value and visible units.

Lessons without a custom model use a section-aware generated overview model.
This gives authored lessons complete control while avoiding 401 identical
placeholder formulas.

### Reuse the Design Lab

The Design Lab already has a strong component simulator, but embedding or
linking it would not make lesson metric strips interactive and would couple
course topics to architecture-builder state.

## Goals

- Add real, replayable parameter controls to eligible topic lessons.
- Keep hand-authored lessons free to define domain-specific inputs and formulas.
- Recalculate every metric strip when a user changes a parameter.
- Preserve existing lesson routing, step navigation, and replay behavior.
- Keep generated overview lessons usable with a clearly separated fallback model.
- Persist parameters per lesson and restore them on revisit.
- Avoid changing the existing `Lesson` and `Step` scene contracts.

## Non-goals

- Replacing the Design Lab simulator.
- Building a different rendering engine or a CMS.
- Supplying peer-reviewed formulas for all 404 topics immediately.
- Inventing a topic-specific formula for every currently generated overview
  lesson before its prose is hand-authored.

## Anti-goals

- Do not label generic percentages or “Fallback/Verified” states as real data.
- Do not use random values for a lesson scenario.
- Do not mutate static lesson definitions during interaction.
- Do not show controls for which the underlying lesson has no formula.

## Existing architecture

The Learn view owns a loaded `Lesson`, current step, `Board`, and metric
renderer. [course/topic-lesson.ts](../../../src/course/topic-lesson.ts) creates
the generated overview lessons. [types.ts](../../../src/types.ts) defines
`MetricDef`, `Step`, `Scene`, and `MetricValue`.

The implementation will extend lesson metadata, not replace it:

```ts
interface DynamicLesson {
  parameters: DynamicParameter[];
  calculate: (
    input: Record<string, number>,
    stepIndex: number,
  ) => Record<string, string | MetricValue>;
}
```

The exact exported type names may be refined during implementation, but the
shape remains declarative: parameter metadata plus a deterministic calculation.

The existing `lesson.metrics` array remains the metric-strip definition.
`calculate()` must return only the keys that are declared in `lesson.metrics`;
missing values fall back to `Scene.metrics` or `—` for hand-authored lessons.

## Parameter model

Each parameter has:

- stable key;
- label;
- minimum, maximum, and default;
- step size;
- unit;
- optional short description;
- optional topic-specific presets.

Controls render inside a compact row beneath or beside the existing metric strip.
Only one range control needs to be visible at a time? No: the design should
support multiple small range controls, wrapped consistently on narrow layouts.

For the MVP:

- maximum 3 parameters per lesson;
- integer values or decimal values at a one-decimal precision;
- same controls for every step in a lesson;
- reset to defaults;
- local persistence per slug.

## Calculation flow

1. Load the lesson.
2. Read the lesson's dynamic model and stored parameter values.
3. Apply the stored values or defaults.
4. For each step, call `calculate(values, stepIndex, lessonSlug)`.
5. Merge calculated metrics into `step.scene.metrics`.
6. Render the metric strip and update it without rebuilding the board.
7. Replay and step navigation preserve the current parameter values.

Dynamic values must not mutate `lesson.steps`, because the route cache and
repeated step navigation would otherwise become stateful.

## Step behaviour

Changing a parameter updates:

- metric values;
- metric tones;
- the board scene's metric card;
- optional scene node tags or flow rates if the lesson model includes them.

The board animation remains unchanged unless a lesson explicitly supplies a
derived scene patch.

## Fallback overview model

Generated section-aware lessons receive a conservative, clearly documented
fallback. It may calculate approximate educational values, but it must not
present invented data as measured or publish a precise claim.

The fallback should:

- derive values only from generic parameters;
- use ranges and estimates such as “~”;
- show labels like “illustrative”;
- avoid domain-specific unexplained numbers.

The cloud-native and other selected hand-authored topic lessons opt into
custom parameter models and replace the fallback.

## Persistence

Storage key:

`lesson-dynamic:<slug>`

Values are guarded by the existing `store.load/save` helpers. Invalid, negative,
or out-of-range values are clamped to parameter defaults and ranges.

## Validation

- TypeScript validates parameter and calculation shapes.
- Existing `npm run typecheck` and `npm run build` must pass.
- Add focused tests for:
  - deterministic calculation;
  - parameter clamping;
  - persistence load/save fallback;
  - metric tone transitions;
  - generated fallback behavior.

Tests can live in the existing project test setup if added; no test framework
is introduced unless needed.

## Decisions from builder review

- The MVP covers all generated overview lessons and hand-authored lessons that
  opt into a dynamic model. It is not limited to one section.
- The cloud-native lesson gets a custom model first. Existing hand-authored
  lessons retain static behavior unless they are migrated explicitly.
- `DynamicLesson` is attached to `Lesson` as an optional field:
  `dynamic?: DynamicLessonModel`.
- `calculate()` is synchronous, deterministic, and must not throw for valid
  parameter ranges.
- The MVP updates only metric values and tones. Scene node tags, flow rates,
  and scene patches remain static.
- Optional presets and per-step multipliers are not part of the MVP. Each
  model may calculate using `stepIndex` directly.
- Parameter sharing is local-only; copied step links do not encode scenario
  values. This is intentionally documented and may be added later.
- Persisted values use `lesson-dynamic:<slug>` because `store.load/save`
  prepend `atlas:`.
- Persisted numeric values must be finite. Non-numeric or missing values use
  the parameter default. Numeric out-of-range values clamp to the parameter
  min/max. Schema changes should reset to defaults rather than accepting
  incompatible keys.
- Generated overview lessons use a generic `traffic`, `capacity`, and
  `failure` model in the MVP. Labels include “illustrative” or use ranges
  and estimates. These values must not be presented as measured telemetry.
