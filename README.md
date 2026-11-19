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
| 04–09 | Communication, Reliability, Architecture, Security, Shipping, Case Studies (21 lessons) | listed as "soon" |

Shell features: course tree with per-module progress, lesson stepper, keyboard nav (`←` `→` `R` `Space` `/` `⌘K`), swipe on touch, search palette over concepts and steps, light/dark theme with no flash, three layouts (desktop / tablet drawer / stacked phone), read-aloud, copy step link, print-a-lesson view, reduced-motion support. Practice / Design Lab / Cheatsheets tabs and the language menu are placeholders.

## Layout

```
src/
  main.ts                 shell, router (#/<lesson>/<step>), keyboard, speech, print
  engine/board.ts         isometric SVG renderer + packet simulation
  engine/icons.ts         stroke icon set
  course/catalog.ts       module/lesson map; a lesson with `load` is written
  course/kit.ts           authoring helpers (at, box, db, crowd, link, flow, pill, patch)
  course/lessons/*.ts     one file per lesson, code-split
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
