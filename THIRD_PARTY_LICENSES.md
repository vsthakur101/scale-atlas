# Third-party license notices

## awesome-front-end-system-design

Source: https://github.com/greatfrontend/awesome-front-end-system-design

MIT License

Copyright (c) 2023 GreatFrontEnd

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Scale Atlas uses topic titles and the source repository's public index structure
under the MIT license. Lesson narratives, isometric scenes, formulas, and
assets in Scale Atlas are original to this project; upstream article prose,
paid guide content, diagrams, and images are not copied.

---

## Title sources and licence status (reviewed 2026-11-20)

Scale Atlas’s topic lessons are original work. The only third-party material in the code is a short **title** per
lesson (`src/course/source-index.ts`, `src/course/academy-index.ts`), used as a topic reference. No upstream prose,
diagrams, images or code is copied.

| Index file | Title source | Licence status |
| --- | --- | --- |
| `source-index.ts` | ByteByteGoHq/system-design-101 topic titles | **Not verified.** Public metadata labels the repository licence as custom/“other” (one aggregator says MIT; the others disagree). Read the repository’s `LICENSE` file before public release. |
| `academy-index.ts` | systemdesign42/system-design-academy topic titles | **Not verified.** Public metadata labels the licence “other” with a `LICENSE.md` (likely custom). Read it before public release. |
| _(removed)_ | greatfrontend/awesome-front-end-system-design | MIT (notice above). The front-end index and its titles were deleted in the 2026-11-20 cleanup; no material from it remains in the shipped code. |

**Renamed (2026-11-20):** every index title and lesson title now uses Scale Atlas’s own wording — none of the 171
topic lessons carries its source list’s title verbatim (generic topic names such as “Bloom Filters” or “Kafka” remain,
as they name the subject itself). The module (section) names in the index files are generic categories. What remains
derived from the two unverified sources is therefore only the *choice of topics* and the slug identifiers
(`source-…`, `academy-…`), which are internal route names. Still worth reading both `LICENSE` files before public
release, and renaming slugs/section names if you want zero overlap. This is a review of public metadata, not legal advice.
