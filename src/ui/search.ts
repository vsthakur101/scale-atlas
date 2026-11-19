import { BUILT_LESSONS, locate } from '../course/catalog';
import { icon } from '../engine/icons';
import type { Lesson, StepKind } from '../types';

interface Entry {
  type: 'concept' | 'step';
  title: string;
  text: string;
  slug: string;
  lessonTitle: string;
  step: number;
  kind?: StepKind;
  hay: string;
}

let index: Entry[] | null = null;
let building: Promise<Entry[]> | null = null;

const strip = (html: string): string => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');

async function buildIndex(loadLesson: (slug: string) => Promise<Lesson>): Promise<Entry[]> {
  if (index) return index;
  if (building) return building;
  building = (async () => {
    const lessons = await Promise.all(BUILT_LESSONS.map((l) => loadLesson(l.slug)));
    const out: Entry[] = [];
    for (const lesson of lessons) {
      lesson.steps.forEach((s, i) => {
        for (const c of s.concepts ?? []) {
          out.push({
            type: 'concept',
            title: c.term,
            text: c.def,
            slug: lesson.slug,
            lessonTitle: lesson.title,
            step: i + 1,
            hay: `${c.term} ${c.def}`.toLowerCase(),
          });
        }
        const text = strip(s.body.join(' '));
        out.push({
          type: 'step',
          title: s.title,
          text,
          slug: lesson.slug,
          lessonTitle: lesson.title,
          step: i + 1,
          kind: s.kind,
          hay: `${s.title} ${text} ${lesson.title}`.toLowerCase(),
        });
      });
    }
    index = out;
    return out;
  })();
  return building;
}

function score(e: Entry, terms: string[]): number {
  let sc = 0;
  const t = e.title.toLowerCase();
  for (const term of terms) {
    if (!e.hay.includes(term)) return -1;
    if (t.startsWith(term)) sc += 6;
    else if (t.includes(term)) sc += 3;
    else sc += 1;
  }
  return sc + (e.type === 'concept' ? 2 : 0);
}

const escHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlight(s: string, terms: string[]): string {
  let out = escHtml(s);
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    out = out.replace(re, '<mark>$1</mark>');
  }
  return out;
}

/** Trim long text to a window around the first match so the hit is visible. */
function snippet(text: string, terms: string[], len = 120): string {
  const lower = text.toLowerCase();
  const first = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, first - 40);
  const s = text.slice(start, start + len);
  return (start > 0 ? '…' : '') + s + (start + len < text.length ? '…' : '');
}

export interface SearchDeps {
  loadLesson: (slug: string) => Promise<Lesson>;
  go: (slug: string, step: number) => void;
}

export function openSearch(deps: SearchDeps): void {
  if (document.querySelector('.palette')) return;
  const wrap = document.createElement('div');
  wrap.className = 'palette-wrap';
  wrap.innerHTML = `
    <div class="palette" role="dialog" aria-modal="true" aria-label="Search the course">
      <div class="pal-input">${icon('search', 16)}<input type="search" placeholder="Search lessons, concepts, steps…" aria-label="Search" autocomplete="off" spellcheck="false"/><kbd>esc</kbd></div>
      <div class="pal-results" role="listbox"></div>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span><span class="pal-count"></span></div>
    </div>`;
  document.body.appendChild(wrap);
  const input = wrap.querySelector('input')!;
  const results = wrap.querySelector<HTMLElement>('.pal-results')!;
  const count = wrap.querySelector<HTMLElement>('.pal-count')!;
  let items: Entry[] = [];
  let sel = 0;

  const close = () => {
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 150);
    document.removeEventListener('keydown', onKey, true);
  };

  const pick = (e: Entry | undefined) => {
    if (!e) return;
    close();
    deps.go(e.slug, e.step);
  };

  const paint = () => {
    const q = input.value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    if (!index) {
      results.innerHTML = `<div class="pal-empty">Indexing the course…</div>`;
      return;
    }
    if (!terms.length) {
      // empty query: list lessons as a table of contents
      items = [];
      results.innerHTML =
        `<div class="pal-sec">Lessons</div>` +
        BUILT_LESSONS.map((l, i) => {
          const loc = locate(l.slug);
          return `<button class="pal-item${i === sel ? ' sel' : ''}" data-slug="${l.slug}" data-i="${i}"><span class="pal-ico">${icon('doc', 14)}</span><span class="pal-main"><b>${escHtml(l.title)}</b><small>${escHtml(loc?.module.title ?? '')}</small></span></button>`;
        }).join('');
      count.textContent = `${BUILT_LESSONS.length} lessons`;
      results.querySelectorAll<HTMLButtonElement>('.pal-item').forEach((b) =>
        b.addEventListener('click', () => {
          close();
          deps.go(b.dataset.slug!, 1);
        }),
      );
      return;
    }
    const scored = index
      .map((e) => ({ e, s: score(e, terms) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s);
    const concepts = scored.filter((x) => x.e.type === 'concept').slice(0, 6).map((x) => x.e);
    const steps = scored.filter((x) => x.e.type === 'step').slice(0, 30).map((x) => x.e);
    items = [...concepts, ...steps];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    if (!items.length) {
      results.innerHTML = `<div class="pal-empty">Nothing matches “${escHtml(q)}”.</div>`;
      count.textContent = '0 results';
      return;
    }
    let html = '';
    let i = 0;
    if (concepts.length) {
      html += `<div class="pal-sec">Concepts</div>`;
      for (const e of concepts) {
        html += `<button class="pal-item${i === sel ? ' sel' : ''}" data-i="${i}" role="option"><span class="pal-ico c">${icon('bulb', 14)}</span><span class="pal-main"><b>${highlight(e.title, terms)}</b> <small>${escHtml(e.lessonTitle)} · step ${e.step}</small><span class="pal-text">${highlight(e.text, terms)}</span></span></button>`;
        i++;
      }
    }
    if (steps.length) {
      html += `<div class="pal-sec">Steps <span>${scored.filter((x) => x.e.type === 'step').length}</span></div>`;
      for (const e of steps) {
        html += `<button class="pal-item${i === sel ? ' sel' : ''}" data-i="${i}" role="option"><span class="pal-ico n">${e.step}</span><span class="pal-main"><b>${highlight(e.title, terms)}</b> <small>${escHtml(e.lessonTitle)}</small><span class="pal-text">${highlight(snippet(e.text, terms), terms)}</span></span><span class="kind kind-${e.kind}">${e.kind}</span></button>`;
        i++;
      }
    }
    results.innerHTML = html;
    count.textContent = `${scored.length} results`;
    results.querySelectorAll<HTMLButtonElement>('.pal-item').forEach((b) =>
      b.addEventListener('click', () => pick(items[Number(b.dataset.i)])),
    );
  };

  const moveSel = (d: number) => {
    const n = items.length || BUILT_LESSONS.length;
    sel = (sel + d + n) % n;
    results.querySelectorAll('.pal-item').forEach((el, i) => el.classList.toggle('sel', i === sel));
    results.querySelector('.pal-item.sel')?.scrollIntoView({ block: 'nearest' });
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSel(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSel(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items.length) pick(items[sel]);
      else {
        const l = BUILT_LESSONS[sel];
        if (l) {
          close();
          deps.go(l.slug, 1);
        }
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap) close();
  });
  input.addEventListener('input', () => {
    sel = 0;
    paint();
  });
  input.focus();
  paint();
  void buildIndex(deps.loadLesson).then(paint);
}
