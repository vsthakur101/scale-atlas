import './styles.css';
import { ALL_LESSONS, BUILT_LESSONS, MODULES, locate, nextBuilt } from './course/catalog';
import { Board } from './engine/board';
import { icon, type IconName } from './engine/icons';
import { SITE } from './site';
import { getProgress, load, markStep, onProgress, resetProgress, save } from './store';
import type { FlowKind, Lesson, MetricValue, Step, StepKind } from './types';
import { openSearch } from './ui/search';
import { toast } from './ui/toast';

// ───────────────────────────── state ─────────────────────────────

const lessons = new Map<string, Lesson>();
let lesson: Lesson | null = null;
let stepIdx = 0; // 0-based
let board: Board | null = null;
let prevMetrics: Record<string, string> = {};
let speaking = false;
let openModules = new Set<string>(load<string[]>('open-modules', ['foundations']));

async function loadLesson(slug: string): Promise<Lesson> {
  const cached = lessons.get(slug);
  if (cached) return cached;
  const ref = ALL_LESSONS.find((l) => l.slug === slug);
  if (!ref?.load) throw new Error(`Lesson not available: ${slug}`);
  const mod = await ref.load();
  lessons.set(slug, mod.default);
  return mod.default;
}

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ───────────────────────────── shell ─────────────────────────────

const KIND_LABEL: Record<StepKind, string> = {
  problem: 'Problem',
  technique: 'Technique',
  insight: 'Insight',
  case: 'Case',
  tradeoff: 'Trade-off',
  recap: 'Recap',
};

const NOTE_META: Record<'key' | 'tip' | 'warn', { label: string; icon: IconName }> = {
  key: { label: 'Key idea', icon: 'sparkle' },
  tip: { label: 'Worth knowing', icon: 'bulb' },
  warn: { label: 'Watch out', icon: 'alert' },
};

const LEGEND: Record<FlowKind, string> = {
  request: 'request',
  response: 'response',
  handshake: 'handshake',
  heavy: 'heavy request',
  fail: 'failed request',
  write: 'write',
  hit: 'cache hit',
};

function renderShell(): void {
  const app = $('#app');
  app.innerHTML = `
  <header class="topbar">
    <button class="icon-btn drawer-only" id="menu-btn" aria-label="Open course menu">${icon('menu', 18)}</button>
    <a class="brand" href="#/" aria-label="${esc(SITE.name)} home">
      <img src="/favicon.svg" alt="" width="28" height="28"/>
      <span class="wordmark">${esc(SITE.name.split(' ')[0] ?? '')} <mark>${esc(SITE.name.split(' ').slice(1).join(' '))}</mark></span>
    </a>
    <nav class="tabs" aria-label="Sections">
      <button class="tab active" data-tab="learn">${icon('learn', 15)}<span>Learn</span></button>
      <button class="tab" data-tab="Practice">${icon('dumbbell', 15)}<span>Practice</span></button>
      <button class="tab" data-tab="Design Lab">${icon('flask', 15)}<span>Design Lab</span></button>
      <button class="tab" data-tab="Cheatsheets">${icon('sheet', 15)}<span>Cheatsheets</span></button>
    </nav>
    <div class="top-right">
      <button class="search-btn" id="search-btn" aria-label="Search (Ctrl+K)">${icon('search', 15)}<span class="sb-text">Search lessons &amp; concepts…</span><kbd>${navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K'}</kbd></button>
      <div class="lang">
        <button class="chip-btn" id="lang-btn" aria-haspopup="menu" aria-expanded="false">${icon('translate', 15)}<span>EN</span>${icon('chevron', 12, 'rot90')}</button>
        <div class="menu" id="lang-menu" role="menu" hidden>
          <button role="menuitemradio" aria-checked="true" class="menu-item on">${icon('check', 14)} English</button>
          <div class="menu-note">More languages are on the way.</div>
        </div>
      </div>
      <button class="icon-btn" id="theme-btn" aria-label="Toggle dark mode"></button>
      <a class="credit" href="${esc(SITE.authorUrl)}" target="_blank" rel="noopener">
        <span class="credit-mark">${icon('sparkle', 14)}</span>
        <span class="credit-text"><small>built by</small><b>${esc(SITE.author)}</b></span>
      </a>
    </div>
  </header>
  <div class="shell">
    <aside class="sidebar" id="sidebar" aria-label="Course outline">
      <div class="sb-head"><span>${icon('folder', 15)} Course</span><small>${ALL_LESSONS.length} lessons</small></div>
      <nav class="tree" id="tree"></nav>
      <div class="progress-card" id="progress-card"></div>
    </aside>
    <main class="stage" id="stage">
      <div class="lesson-head" id="lesson-head"></div>
      <section class="card diagram" aria-label="Diagram">
        <div class="diag-top">
          <div class="metrics" id="metrics"></div>
          <div class="diag-ctrl">
            <button class="ghost-btn" id="replay-btn" title="Replay (R)">${icon('refresh', 14)}<span>Replay</span></button>
            <button class="ghost-btn" id="pause-btn" title="Pause (Space)"></button>
          </div>
        </div>
        <div class="board-host" id="board-host"></div>
        <div class="legend" id="legend"></div>
      </section>
      <section class="card stepper-card" id="stepper" aria-label="Steps in this lesson"></section>
    </main>
    <div class="side" id="side">
      <section class="card step-card" id="step-card" aria-live="polite"></section>
      <section class="card goals-card" id="goals"></section>
    </div>
  </div>
  <div class="scrim" id="scrim"></div>
  <div class="print-view" id="print-view"></div>`;

  $('#menu-btn').addEventListener('click', () => toggleDrawer());
  $('#scrim').addEventListener('click', () => toggleDrawer(false));
  $('#search-btn').addEventListener('click', () => openSearch({ loadLesson, go: (s, n) => go(s, n) }));
  $('#theme-btn').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  $('#replay-btn').addEventListener('click', () => replay());
  $('#pause-btn').addEventListener('click', () => togglePause());
  document.querySelectorAll<HTMLButtonElement>('.tab:not(.active)').forEach((b) =>
    b.addEventListener('click', () => toast(`${b.dataset.tab} is coming soon`, 'sparkle')),
  );
  const langBtn = $('#lang-btn');
  const langMenu = $('#lang-menu');
  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = langMenu.hidden;
    langMenu.hidden = !open;
    langBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', () => {
    langMenu.hidden = true;
    langBtn.setAttribute('aria-expanded', 'false');
  });
  paintTheme();
  paintPause();
  renderTree();
  onProgress(() => {
    renderTree();
    if (lesson) renderGoals();
  });

  // swipe between steps on touch screens
  let sx = 0;
  let sy = 0;
  const host = $('#board-host');
  host.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (!t) return;
    sx = t.clientX;
    sy = t.clientY;
  }, { passive: true });
  host.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(t.clientY - sy) * 1.5) step(dx < 0 ? 1 : -1);
  });
}

// ───────────────────────────── theme & layout ─────────────────────────────

const currentTheme = (): 'light' | 'dark' => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

function setTheme(t: 'light' | 'dark'): void {
  if (t === 'dark') document.documentElement.dataset.theme = 'dark';
  else document.documentElement.dataset.theme = 'light';
  save('theme', t);
  paintTheme();
}

function paintTheme(): void {
  const dark = currentTheme() === 'dark';
  $('#theme-btn').innerHTML = icon(dark ? 'sun' : 'moon', 17);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1916' : '#f3eadf');
}

function fitWindow(): void {
  const w = innerWidth;
  const h = innerHeight;
  const layout = w >= 1200 && h >= 560 ? 'desktop' : w >= 960 && h >= 600 ? 'tablet' : 'stack';
  if (document.documentElement.dataset.layout !== layout) {
    document.documentElement.dataset.layout = layout;
    toggleDrawer(false);
  }
}

function toggleDrawer(force?: boolean): void {
  const open = force ?? !document.body.classList.contains('drawer-open');
  document.body.classList.toggle('drawer-open', open);
}

// ───────────────────────────── sidebar ─────────────────────────────

function renderTree(): void {
  const tree = $('#tree');
  const activeSlug = lesson?.slug;
  tree.innerHTML = MODULES.map((m, mi) => {
    const done = m.lessons.filter((l) => getProgress(l.slug).done).length;
    const open = openModules.has(m.id);
    const items = m.lessons
      .map((l) => {
        const p = getProgress(l.slug);
        const state = !l.load ? 'soon' : p.done ? 'done' : p.max > 0 ? 'started' : '';
        const ico = p.done ? icon('check', 13) : icon('doc', 13);
        return `<a class="leaf ${state}${l.slug === activeSlug ? ' active' : ''}" href="#/${l.slug}/1" data-slug="${l.slug}" ${l.slug === activeSlug ? 'aria-current="page"' : ''}>${ico}<span>${esc(l.title)}</span>${!l.load ? '<em>soon</em>' : ''}</a>`;
      })
      .join('');
    return `<div class="mod ${open ? 'open' : ''}" data-mod="${m.id}">
      <button class="mod-head" aria-expanded="${open}">${icon('chevron', 12, 'chev')}<span class="folder tone-${m.tone}">${icon('folder', 15)}</span><span class="mod-title">${String(mi + 1).padStart(2, '0')}. ${esc(m.title)}</span><small>${done}/${m.lessons.length}</small></button>
      <div class="mod-body">${items}</div></div>`;
  }).join('');
  tree.querySelectorAll<HTMLButtonElement>('.mod-head').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.parentElement!.dataset.mod!;
      if (openModules.has(id)) openModules.delete(id);
      else openModules.add(id);
      save('open-modules', [...openModules]);
      b.parentElement!.classList.toggle('open');
      b.setAttribute('aria-expanded', String(openModules.has(id)));
    }),
  );
  tree.querySelectorAll<HTMLAnchorElement>('.leaf.soon').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      toast(`“${a.textContent?.replace('soon', '').trim()}” is still being written`, 'doc');
    }),
  );
  tree.querySelectorAll<HTMLAnchorElement>('.leaf:not(.soon)').forEach((a) =>
    a.addEventListener('click', () => toggleDrawer(false)),
  );

  const total = ALL_LESSONS.length;
  const finished = ALL_LESSONS.filter((l) => getProgress(l.slug).done).length;
  $('#progress-card').innerHTML = `
    <div class="pc-row"><span>Progress</span><b>${finished} / ${total}</b></div>
    <div class="bar"><i style="width:${(finished / total) * 100}%"></i></div>
    ${finished ? `<button class="link-btn" id="reset-btn">Reset progress</button>` : `<small>${BUILT_LESSONS.length} lessons ready · more coming</small>`}`;
  document.getElementById('reset-btn')?.addEventListener('click', () => {
    if (confirm('Clear your progress on every lesson?')) resetProgress();
  });
}

// ───────────────────────────── lesson ─────────────────────────────

function renderLessonHead(): void {
  if (!lesson) return;
  const loc = locate(lesson.slug)!;
  $('#lesson-head').innerHTML = `
    <div class="crumbs">${String(loc.moduleIndex + 1).padStart(2, '0')}. ${esc(loc.module.title)} <span>/</span> Lesson ${loc.lessonIndex + 1} of ${loc.module.lessons.length}</div>
    <div class="title-row">
      <h1>${esc(lesson.title)}</h1>
      <div class="badges">
        <span class="badge b-time">${icon('timer', 13)}${lesson.minutes} min</span>
        <span class="badge b-level">${icon('signal', 13)}${lesson.level}</span>
        <span class="badge b-steps">${icon('list', 13)}${lesson.steps.length} steps</span>
      </div>
    </div>
    <p class="blurb">${esc(lesson.blurb)}</p>`;
  // derive the legend from the packets the lesson actually animates, so it can't drift
  const used = new Set<FlowKind>(lesson.legend);
  for (const s of lesson.steps) {
    for (const f of s.scene.flows ?? []) {
      used.add(f.kind ?? 'request');
      if (f.back) used.add('response');
    }
  }
  const order = Object.keys(LEGEND) as FlowKind[];
  $('#legend').innerHTML = order
    .filter((k) => used.has(k))
    .map((k) => `<span class="lg"><i class="pkt-dot pkt-${k}"></i>${LEGEND[k]}</span>`)
    .join('');
}

function renderStepper(): void {
  if (!lesson) return;
  const reached = getProgress(lesson.slug).max;
  const n = lesson.steps.length;
  $('#stepper').innerHTML = `
    <div class="st-head"><b>In this lesson</b><span>Step ${stepIdx + 1} of ${n}</span></div>
    <ol class="st-track" style="--n:${n}">
      <li class="st-line" aria-hidden="true"><i style="width:${n > 1 ? (stepIdx / (n - 1)) * 100 : 0}%"></i></li>
      ${lesson.steps
        .map(
          (s, i) =>
            `<li><button class="st-dot${i === stepIdx ? ' cur' : ''}${i < stepIdx || i < reached ? ' seen' : ''}" data-i="${i}" aria-label="Step ${i + 1}: ${esc(s.title)}" ${i === stepIdx ? 'aria-current="step"' : ''}><span class="num">${i + 1}</span><span class="lbl">${esc(s.short)}</span></button></li>`,
        )
        .join('')}
    </ol>`;
  $('#stepper').querySelectorAll<HTMLButtonElement>('.st-dot').forEach((b) =>
    b.addEventListener('click', () => gotoStep(Number(b.dataset.i))),
  );
}

function renderStepCard(): void {
  if (!lesson) return;
  const s = lesson.steps[stepIdx]!;
  const n = lesson.steps.length;
  const next = lesson.steps[stepIdx + 1];
  const nextLesson = nextBuilt(lesson.slug);
  const nextLabel = next
    ? `Next: ${esc(next.short)}`
    : nextLesson
      ? `Next lesson: ${esc(nextLesson.title)}`
      : 'Course complete';
  const note = s.note
    ? `<div class="note note-${s.note.kind}"><span class="note-ico">${icon(NOTE_META[s.note.kind].icon, 16)}</span><div><b>${NOTE_META[s.note.kind].label}</b><p>${s.note.text}</p></div></div>`
    : '';
  const changes = s.changes?.length
    ? `<div class="changes"><b>What changed</b><ul>${s.changes
        .map((c) => `<li class="ch-${c.tone ?? 'info'}"><i></i>${c.text}</li>`)
        .join('')}</ul></div>`
    : '';
  $('#step-card').innerHTML = `
    <div class="sc-head">
      <span class="sc-count">Step ${stepIdx + 1} / ${n}</span>
      <div class="sc-tools">
        <button class="mini-btn${speaking ? ' on' : ''}" id="speak-btn" title="Read aloud" aria-pressed="${speaking}">${icon('speaker', 14)}</button>
        <button class="mini-btn" id="share-btn" title="Copy link to this step">${icon('link', 14)}</button>
        <button class="mini-btn" id="print-btn" title="Print this lesson">${icon('printer', 14)}</button>
        <span class="kind kind-${s.kind}">${KIND_LABEL[s.kind]}</span>
      </div>
    </div>
    <h2>${esc(s.title)}</h2>
    <div class="sc-body">${s.body.map((p) => `<p>${p}</p>`).join('')}${note}${changes}</div>
    <div class="sc-nav">
      <button class="btn btn-back" id="back-btn" ${stepIdx === 0 ? 'disabled' : ''}>${icon('arrowLeft', 15)}Back</button>
      <button class="btn btn-next" id="next-btn" ${!next && !nextLesson ? 'disabled' : ''}><span>${nextLabel}</span>${icon('arrowRight', 15)}</button>
    </div>
    <div class="kbd-hints"><kbd>←</kbd><kbd>→</kbd> step · <kbd>R</kbd> replay · <kbd>Space</kbd> pause</div>`;
  $('#back-btn').addEventListener('click', () => step(-1));
  $('#next-btn').addEventListener('click', () => step(1));
  $('#speak-btn').addEventListener('click', () => toggleSpeech());
  $('#share-btn').addEventListener('click', () => {
    const url = location.href;
    navigator.clipboard?.writeText(url).then(
      () => toast('Link to this step copied', 'link'),
      () => toast('Could not copy the link', 'alert'),
    );
  });
  $('#print-btn').addEventListener('click', () => {
    renderPrintView();
    window.print();
  });
  $('.sc-body', $('#step-card')).scrollTop = 0;
}

function renderGoals(): void {
  if (!lesson) return;
  const reached = Math.max(getProgress(lesson.slug).max, stepIdx + 1);
  $('#goals').innerHTML = `<b class="goals-title">You'll learn</b><ul>${lesson.goals
    .map(
      (g) =>
        `<li class="${reached >= g.step ? 'got' : ''}"><button data-step="${g.step}"><span class="box">${reached >= g.step ? icon('check', 12) : ''}</span>${esc(g.text)}</button></li>`,
    )
    .join('')}</ul>`;
  $('#goals').querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
    b.addEventListener('click', () => gotoStep(Number(b.dataset.step) - 1)),
  );
}

function renderMetrics(s: Step): void {
  if (!lesson) return;
  const vals = s.scene.metrics ?? {};
  const html = lesson.metrics
    .map((m) => {
      const raw = vals[m.key];
      const mv: MetricValue = typeof raw === 'string' ? { v: raw } : (raw ?? { v: '—' });
      const changed = prevMetrics[m.key] !== undefined && prevMetrics[m.key] !== mv.v;
      return `<div class="metric${mv.tone ? ' m-' + mv.tone : ''}${changed ? ' flash' : ''}"><small>${icon(m.icon, 12)}${esc(m.label)}</small><b>${esc(mv.v)}</b></div>`;
    })
    .join('');
  $('#metrics').innerHTML = html;
  prevMetrics = Object.fromEntries(
    lesson.metrics.map((m) => {
      const raw = vals[m.key];
      return [m.key, typeof raw === 'string' ? raw : (raw?.v ?? '—')];
    }),
  );
}

function renderPrintView(): void {
  if (!lesson) return;
  $('#print-view').innerHTML = `<h1>${esc(lesson.title)}</h1><p class="blurb">${esc(lesson.blurb)}</p>${lesson.steps
    .map(
      (s, i) =>
        `<section><h2>${i + 1}. ${esc(s.title)} <small>${KIND_LABEL[s.kind]}</small></h2>${s.body.map((p) => `<p>${p}</p>`).join('')}${s.note ? `<p class="pv-note"><b>${NOTE_META[s.note.kind].label}:</b> ${s.note.text}</p>` : ''}</section>`,
    )
    .join('')}<p class="pv-foot">${esc(SITE.name)} · ${esc(location.origin)}/#/${lesson.slug}/1</p>`;
}

function paintPause(): void {
  const paused = board?.isPaused ?? false;
  $('#pause-btn').innerHTML = paused ? `${icon('play', 14)}<span>Play</span>` : `${icon('pause', 14)}<span>Pause</span>`;
}

function togglePause(): void {
  if (!board) return;
  board.setPaused(!board.isPaused);
  paintPause();
}

function replay(): void {
  board?.replay();
  if (board?.isPaused) togglePause();
}

// ───────────────────────────── speech ─────────────────────────────

function speakCurrent(): void {
  if (!lesson || !('speechSynthesis' in window)) return;
  const s = lesson.steps[stepIdx]!;
  const text = [s.title, ...s.body, s.note?.text ?? ''].join('. ').replace(/<[^>]+>/g, '');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  u.onend = () => {
    if (speaking && u === current) {
      speaking = false;
      $('#speak-btn').classList.remove('on');
    }
  };
  current = u;
  speechSynthesis.speak(u);
}
let current: SpeechSynthesisUtterance | null = null;

function toggleSpeech(): void {
  if (!('speechSynthesis' in window)) {
    toast('Read-aloud is not supported in this browser', 'alert');
    return;
  }
  speaking = !speaking;
  if (speaking) speakCurrent();
  else speechSynthesis.cancel();
  $('#speak-btn').classList.toggle('on', speaking);
  $('#speak-btn').setAttribute('aria-pressed', String(speaking));
}

// ───────────────────────────── navigation ─────────────────────────────

function showStep(): void {
  if (!lesson || !board) return;
  const s = lesson.steps[stepIdx]!;
  board.render(s.scene);
  renderMetrics(s);
  renderStepCard();
  renderStepper();
  markStep(lesson.slug, stepIdx + 1, lesson.steps.length);
  renderGoals();
  document.title = `${lesson.title} · ${SITE.name}`;
  save('last', { slug: lesson.slug, step: stepIdx + 1 });
  if (speaking) speakCurrent();
}

function gotoStep(i: number): void {
  if (!lesson) return;
  const n = Math.max(0, Math.min(lesson.steps.length - 1, i));
  if (n === stepIdx) return;
  stepIdx = n;
  history.replaceState(null, '', `#/${lesson.slug}/${stepIdx + 1}`);
  showStep();
}

function step(d: number): void {
  if (!lesson) return;
  if (d > 0 && stepIdx === lesson.steps.length - 1) {
    const nl = nextBuilt(lesson.slug);
    if (nl) go(nl.slug, 1);
    return;
  }
  gotoStep(stepIdx + d);
}

function go(slug: string, stepNo: number): void {
  location.hash = `#/${slug}/${stepNo}`;
}

let routeToken = 0;

async function route(): Promise<void> {
  const m = location.hash.match(/^#\/([\w-]+)(?:\/(\d+))?/);
  const fallback = load<{ slug: string; step: number } | null>('last', null);
  let slug = m?.[1] ?? fallback?.slug ?? BUILT_LESSONS[0]!.slug;
  let stepNo = m?.[2] ? Number(m[2]) : m ? 1 : (fallback?.step ?? 1);
  const ref = ALL_LESSONS.find((l) => l.slug === slug);
  if (!ref?.load) {
    if (ref) toast(`“${ref.title}” is still being written`, 'doc');
    slug = BUILT_LESSONS[0]!.slug;
    stepNo = 1;
  }
  const token = ++routeToken;
  let next: Lesson;
  try {
    next = await loadLesson(slug);
  } catch (err) {
    console.error('Failed to load lesson', { slug, err });
    toast('That lesson failed to load. Check your connection and retry.', 'alert', 4000);
    return;
  }
  if (token !== routeToken) return; // a newer navigation won
  const idx = Math.max(0, Math.min(next.steps.length - 1, stepNo - 1));
  const canonical = `#/${slug}/${idx + 1}`;
  if (location.hash !== canonical) history.replaceState(null, '', canonical);

  const loc = locate(slug);
  if (loc && !openModules.has(loc.module.id)) {
    openModules.add(loc.module.id);
    save('open-modules', [...openModules]);
  }
  if (lesson?.slug !== slug) {
    lesson = next;
    stepIdx = idx;
    prevMetrics = {};
    const wasPaused = board?.isPaused ?? false;
    board?.destroy();
    board = new Board($('#board-host'));
    board.svg.setAttribute('aria-label', `Diagram for ${next.title}`);
    if (wasPaused) board.setPaused(true);
    renderLessonHead();
    renderTree();
    showStep();
    $('#stage').scrollTo?.({ top: 0 });
    if (document.documentElement.dataset.layout === 'stack') window.scrollTo({ top: 0 });
  } else if (idx !== stepIdx) {
    stepIdx = idx;
    showStep();
  }
}

// ───────────────────────────── keys ─────────────────────────────

function onKey(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openSearch({ loadLesson, go });
    return;
  }
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (document.querySelector('.palette')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      step(1);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      step(-1);
      break;
    case 'r':
    case 'R':
      replay();
      break;
    case ' ':
      if (t?.tagName === 'BUTTON' || t?.tagName === 'A') return;
      e.preventDefault();
      togglePause();
      break;
    case '/':
      e.preventDefault();
      openSearch({ loadLesson, go });
      break;
    case 'Escape':
      toggleDrawer(false);
      break;
  }
}

// ───────────────────────────── boot ─────────────────────────────

renderShell();
addEventListener('hashchange', () => void route());
addEventListener('resize', fitWindow);
addEventListener('keydown', onKey);
addEventListener('beforeprint', renderPrintView);
fitWindow();
void route();
