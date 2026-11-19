import { ALL_LESSONS } from '../course/catalog';
import { Board } from '../engine/board';
import { icon, type IconName } from '../engine/icons';
import type { MetricValue, SceneNode } from '../types';
import { drillKindLabel, formatNumber, gradeEstimate, parseNumber, SCORE, stableShuffle } from './grading';
import { getStreak, mastery, pickReview, recordAnswer, recordOf, resetPractice, totals } from './progress';
import { ALL_DRILLS, MIX_ID, MIX_SIZE, SETS } from './sets';
import type { ChoiceDrill, Drill, Grade, SpotDrill } from './types';

/**
 * The Practice tab: drill sets per module, a weighted mixed review, and a
 * summary per session. Lives in its own shell next to the Learn view.
 */

type Pick =
  | { kind: 'option'; index: number }
  | { kind: 'node'; id: string }
  | { kind: 'number'; value: number; raw: string }
  | { kind: 'reveal' };

interface Session {
  setId: string;
  title: string;
  drills: Drill[];
  picks: (Pick | null)[];
  grades: (Grade | null)[];
}

const RETRY_ID = 'retry';

let root: HTMLElement | null = null;
let session: Session | null = null;
let board: Board | null = null;
let view: { kind: 'home' } | { kind: 'drill'; idx: number } | { kind: 'summary' } = { kind: 'home' };

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = root?.querySelector<T>(sel);
  if (!el) throw new Error(`practice: missing ${sel}`);
  return el;
};

const lessonTitle = (slug: string): string => ALL_LESSONS.find((l) => l.slug === slug)?.title ?? slug;
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const go = (hash: string): void => {
  location.hash = hash;
};

const GRADE_META: Record<Grade, { label: string; icon: IconName }> = {
  right: { label: 'Correct', icon: 'check' },
  close: { label: 'Close — right order of magnitude', icon: 'scale' },
  wrong: { label: 'Not quite', icon: 'x' },
};

// ───────────────────────────── mount & routing ─────────────────────────────

export function mountPractice(host: HTMLElement): void {
  if (root) return;
  root = host;
  host.innerHTML = `
    <aside class="sidebar p-sidebar" aria-label="Drill sets">
      <div class="sb-head"><span>${icon('dumbbell', 15)} Practice</span><small>${ALL_DRILLS.length} drills</small></div>
      <nav class="tree p-sets" id="p-sets"></nav>
      <div class="progress-card" id="p-mini"></div>
    </aside>
    <main class="p-main" id="p-main"></main>
    <div class="p-side" id="p-side"></div>`;
}

/** Handle any hash under #/practice. */
export function routePractice(hash: string): void {
  if (!root) return;
  const parts = hash.replace(/^#\/practice\/?/, '').split('/').filter(Boolean);
  const [setId, step] = parts;
  board?.destroy();
  board = null;

  if (!setId) {
    view = { kind: 'home' };
    renderHome();
  } else {
    if (!ensureSession(setId)) {
      go('#/practice');
      return;
    }
    if (!step) {
      history.replaceState(null, '', `#/practice/${setId}/1`);
      view = { kind: 'drill', idx: 0 };
    } else if (step === 'done') {
      view = { kind: 'summary' };
    } else {
      const n = Math.max(1, Math.min(session!.drills.length, Number(step) || 1));
      view = { kind: 'drill', idx: n - 1 };
    }
    if (view.kind === 'summary') renderSummary();
    else renderDrill(view.idx);
  }
  renderSidebar();
  window.scrollTo({ top: 0 });
  $('#p-main').scrollTop = 0;
}

function ensureSession(setId: string): boolean {
  if (session?.setId === setId) return true;
  let title: string;
  let drills: Drill[];
  if (setId === MIX_ID) {
    title = 'Mixed review';
    drills = pickReview(ALL_DRILLS, MIX_SIZE);
  } else if (setId === RETRY_ID) {
    return false; // only reachable from a summary; a reload lands back home
  } else {
    const set = SETS.find((s) => s.id === setId);
    if (!set) return false;
    title = set.title;
    drills = set.drills;
  }
  session = { setId, title, drills, picks: drills.map(() => null), grades: drills.map(() => null) };
  return true;
}

function startRetry(): void {
  if (!session) return;
  const missed = session.drills.filter((_, i) => session!.grades[i] !== 'right');
  if (!missed.length) return;
  session = { setId: RETRY_ID, title: `${session.title} · retry`, drills: missed, picks: missed.map(() => null), grades: missed.map(() => null) };
  go(`#/practice/${RETRY_ID}/1`);
}

// ───────────────────────────── sidebar ─────────────────────────────

function renderSidebar(): void {
  const active = view.kind === 'home' ? '' : session?.setId;
  const t = totals();
  const streak = getStreak();
  $('#p-sets').innerHTML =
    `<a class="leaf p-leaf${active === MIX_ID ? ' active' : ''}" href="#/practice/${MIX_ID}">${icon('refresh', 13)}<span>Mixed review</span><em class="p-count">${MIX_SIZE}</em></a>` +
    SETS.map((s, i) => {
      const m = mastery(s.drills);
      return `<a class="leaf p-leaf${active === s.id ? ' active' : ''}" href="#/practice/${s.id}">
        <span class="folder tone-${s.tone}">${icon('folder', 14)}</span>
        <span>${String(i + 1).padStart(2, '0')}. ${esc(s.title)}</span>
        <em class="p-count${m === 1 ? ' full' : ''}">${Math.round(m * s.drills.length)}/${s.drills.length}</em></a>`;
    }).join('');
  const accuracy = t.answers ? t.right / t.answers : 0;
  $('#p-mini').innerHTML = `
    <div class="pc-row"><span>Mastered</span><b>${ALL_DRILLS.filter((d) => mastery([d]) === 1).length} / ${ALL_DRILLS.length}</b></div>
    <div class="bar"><i style="width:${mastery(ALL_DRILLS) * 100}%"></i></div>
    <small>${t.answers ? `${pct(accuracy)} accuracy · streak ${streak.current} (best ${streak.best})` : 'No answers yet'}</small>`;
}

// ───────────────────────────── home ─────────────────────────────

function renderHome(): void {
  document.title = 'Practice · Scale Atlas';
  const kinds = (ds: Drill[]) => {
    const c = { spot: 0, choice: 0, estimate: 0 };
    ds.forEach((d) => c[d.kind]++);
    return c;
  };
  $('#p-main').innerHTML = `
    <div class="p-head">
      <div class="crumbs">Practice</div>
      <h1 class="p-title">Sharpen your instincts</h1>
      <p class="blurb">Short drills built on the same live diagrams as the lessons. Spot the failing component, choose the right fix, and estimate like an engineer — every answer explains itself and links back to the lesson that teaches it.</p>
    </div>
    <a class="card p-mix" href="#/practice/${MIX_ID}">
      <span class="p-mix-ico">${icon('refresh', 22)}</span>
      <span class="p-mix-text"><b>Mixed review</b><small>${MIX_SIZE} drills from every module, weighted toward ones you missed or haven’t tried.</small></span>
      <span class="btn btn-next p-mix-go">Start ${icon('arrowRight', 15)}</span>
    </a>
    <div class="p-grid">
      ${SETS.map((s, i) => {
        const m = mastery(s.drills);
        const k = kinds(s.drills);
        return `<a class="card p-card" href="#/practice/${s.id}">
          <span class="p-card-top"><span class="folder tone-${s.tone}">${icon('folder', 16)}</span><small>${String(i + 1).padStart(2, '0')}</small></span>
          <b>${esc(s.title)}</b>
          <span class="p-card-kinds">${k.spot ? `<span>${icon('pin', 11)}${k.spot}</span>` : ''}${k.choice ? `<span>${icon('list', 11)}${k.choice}</span>` : ''}${k.estimate ? `<span>${icon('calc', 11)}${k.estimate}</span>` : ''}</span>
          <span class="bar"><i style="width:${m * 100}%"></i></span>
          <small>${m ? `${pct(m)} mastered` : `${s.drills.length} drills`}</small>
        </a>`;
      }).join('')}
    </div>`;

  const t = totals();
  const weakest = SETS.map((s) => ({ s, m: mastery(s.drills), tried: s.drills.some((d) => !!recordOf(d.id)) }))
    .filter((x) => x.tried)
    .sort((a, b) => a.m - b.m)[0];
  $('#p-side').innerHTML = `
    <section class="card p-panel">
      <b class="goals-title">Three kinds of drill</b>
      <ul class="p-kinds">
        <li><span class="kind p-kind-spot">Spot it</span><span>Click the component on the live diagram that answers the question.</span></li>
        <li><span class="kind p-kind-choice">Choose</span><span>Pick the best option. Every option explains why it’s right or wrong.</span></li>
        <li><span class="kind p-kind-estimate">Estimate</span><span>Napkin maths. Within 2× is right; within 10× is close.</span></li>
      </ul>
    </section>
    <section class="card p-panel">
      <b class="goals-title">Your practice</b>
      <div class="p-stats">
        <div><b>${t.attempted}</b><small>drills tried</small></div>
        <div><b>${t.answers ? pct(t.right / t.answers) : '—'}</b><small>accuracy</small></div>
        <div><b>${getStreak().best}</b><small>best streak</small></div>
      </div>
      ${weakest ? `<a class="p-ref" href="#/practice/${weakest.s.id}">${icon('activity', 14)} Weakest: ${esc(weakest.s.title)} (${pct(weakest.m)})</a>` : '<small class="p-muted">Answer a few drills to see your weakest topic.</small>'}
      ${t.answers ? `<button class="link-btn" id="p-reset">Reset practice history</button>` : ''}
    </section>`;
  root?.querySelector('#p-reset')?.addEventListener('click', () => {
    if (confirm('Clear your practice history on every drill?')) {
      resetPractice();
      renderHome();
      renderSidebar();
    }
  });
}


// ───────────────────────────── drill ─────────────────────────────

function dots(): string {
  if (!session) return '';
  const cur = view.kind === 'drill' ? view.idx : -1;
  return session.drills
    .map((_, i) => {
      const g = session!.grades[i];
      return `<a class="p-dot${g ? ` g-${g}` : ''}${i === cur ? ' cur' : ''}" href="#/practice/${session!.setId}/${i + 1}" aria-label="Drill ${i + 1}${g ? `: ${g}` : ''}"></a>`;
    })
    .join('');
}

function selectable(d: SpotDrill): SceneNode[] {
  return d.scene.nodes.filter((n) => n.kind !== 'zone' && n.kind !== 'ring');
}

const nodeName = (n: SceneNode): string => n.name || n.label?.text || n.tag?.text || n.id;

function renderDrill(idx: number): void {
  if (!session) return;
  const d = session.drills[idx]!;
  const n = session.drills.length;
  document.title = `${session.title} · Practice · Scale Atlas`;
  $('#p-main').innerHTML = `
    <div class="p-head">
      <div class="crumbs"><a href="#/practice">Practice</a><span>/</span>${esc(session.title)}<span>/</span>Drill ${idx + 1} of ${n}</div>
      <div class="p-head-row"><span class="kind p-kind-${d.kind}">${drillKindLabel(d)}</span><div class="p-dots">${dots()}</div></div>
      <h1 class="p-prompt">${esc(d.prompt)}</h1>
    </div>
    ${
      d.scene
        ? `<section class="card diagram p-board"><div class="diag-top"><div class="metrics" id="p-metrics"></div></div><div class="board-host" id="p-board-host"></div></section>`
        : ''
    }
    <section class="card p-answer" id="p-answer"></section>`;

  if (d.scene) {
    board = new Board($('#p-board-host'));
    board.svg.setAttribute('aria-label', 'Drill diagram');
    board.render(d.scene);
    const vals = d.scene.metrics ?? {};
    $('#p-metrics').innerHTML = (d.metrics ?? [])
      .map((m) => {
        const raw = vals[m.key];
        const mv: MetricValue = typeof raw === 'string' ? { v: raw } : (raw ?? { v: '—' });
        return `<div class="metric${mv.tone ? ' m-' + mv.tone : ''}"><small>${icon(m.icon, 12)}${esc(m.label)}</small><b>${esc(mv.v)}</b></div>`;
      })
      .join('');
  }

  $('#p-side').innerHTML = `<section class="card step-card p-feedback" id="p-feedback" aria-live="polite"></section>`;
  paintAnswer(idx);
}

/** Paint the answer area and feedback panel for the drill, answered or not. */
function paintAnswer(idx: number): void {
  if (!session) return;
  const d = session.drills[idx]!;
  const pick = session.picks[idx];
  const grade = session.grades[idx];
  const area = $('#p-answer');

  if (d.kind === 'choice') {
    const order = stableShuffle(
      d.options.map((_, i) => i),
      d.id,
    );
    area.innerHTML = `<div class="p-opts" role="list">${order
      .map((oi, k) => {
        const o = d.options[oi]!;
        const picked = pick?.kind === 'option' && pick.index === oi;
        const state = !grade ? '' : o.correct ? ' good' : picked ? ' bad' : ' dim';
        return `<button class="p-opt${state}" data-i="${oi}" ${grade ? 'disabled' : ''} role="listitem">
          <span class="p-key">${'ABCD'[k]}</span>
          <span class="p-opt-body"><span>${esc(o.text)}</span>${grade ? `<small>${esc(o.why)}</small>` : ''}</span>
          ${grade && o.correct ? icon('check', 16) : grade && picked ? icon('x', 16) : ''}
        </button>`;
      })
      .join('')}</div>`;
    area.querySelectorAll<HTMLButtonElement>('.p-opt').forEach((b) =>
      b.addEventListener('click', () => submit(idx, { kind: 'option', index: Number(b.dataset.i) })),
    );
  } else if (d.kind === 'estimate') {
    const guess = pick?.kind === 'number' ? pick.raw : '';
    area.innerHTML = `
      <form class="p-est" novalidate>
        <label for="p-est-in">Your estimate</label>
        <div class="p-est-row">
          <input id="p-est-in" inputmode="decimal" autocomplete="off" placeholder="e.g. 2,500 or 2.5k" value="${esc(guess)}" ${grade ? 'disabled' : ''}/>
          <span class="p-unit">${esc(d.unit)}</span>
          <button class="btn btn-next" type="submit" ${grade ? 'disabled' : ''}>Check</button>
        </div>
        ${d.hint && !grade ? `<button type="button" class="link-btn" id="p-hint">Show a hint</button><p class="p-hint" hidden>${esc(d.hint)}</p>` : ''}
        ${grade && pick?.kind === 'number' ? `<p class="p-est-result">You said <b>${formatNumber(pick.value)}</b> · answer <b>${formatNumber(d.answer)} ${esc(d.unit)}</b> · off by <b>${ratioText(pick.value, d.answer)}</b></p>` : ''}
        ${grade && pick?.kind !== 'number' ? `<p class="p-est-result">Answer: <b>${formatNumber(d.answer)} ${esc(d.unit)}</b></p>` : ''}
        <p class="p-err" hidden>Type a number — commas and k/M/B suffixes are fine.</p>
      </form>`;
    const form = area.querySelector('form')!;
    const input = area.querySelector<HTMLInputElement>('#p-est-in')!;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = parseNumber(input.value);
      if (!Number.isFinite(v)) {
        area.querySelector<HTMLElement>('.p-err')!.hidden = false;
        input.focus();
        return;
      }
      submit(idx, { kind: 'number', value: v, raw: input.value });
    });
    area.querySelector('#p-hint')?.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).remove();
      area.querySelector<HTMLElement>('.p-hint')!.hidden = false;
    });
    if (!grade) setTimeout(() => input.focus({ preventScroll: true }), 50);
  } else {
    const nodes = selectable(d);
    const pickedId = pick?.kind === 'node' ? pick.id : null;
    area.innerHTML = `
      <p class="p-instr">${icon('pin', 15)} ${grade ? 'The answer is highlighted on the diagram.' : 'Click a component on the diagram — or pick it from the list.'}</p>
      <div class="p-chips">${nodes
        .map((nd) => {
          const state = !grade ? '' : nd.id === d.answer ? ' good' : nd.id === pickedId ? ' bad' : ' dim';
          return `<button class="p-chip${state}" data-id="${esc(nd.id)}" ${grade ? 'disabled' : ''}>${esc(nodeName(nd))}</button>`;
        })
        .join('')}</div>
      ${grade ? '' : `<button class="link-btn" id="p-reveal">I don’t know — show me</button>`}`;
    area.querySelectorAll<HTMLButtonElement>('.p-chip').forEach((b) =>
      b.addEventListener('click', () => submit(idx, { kind: 'node', id: b.dataset.id! })),
    );
    area.querySelector('#p-reveal')?.addEventListener('click', () => submit(idx, { kind: 'reveal' }));
    const ids = new Set(nodes.map((nd) => nd.id));
    if (board) {
      if (grade) {
        board.setClickHandler(null);
        board.mark(d.answer, 'good');
        if (pickedId && pickedId !== d.answer) board.mark(pickedId, 'bad');
      } else {
        board.setClickHandler((id) => {
          if (id && ids.has(id)) submit(idx, { kind: 'node', id });
        });
      }
    }
  }
  paintFeedback(idx);
}

function ratioText(guess: number, answer: number): string {
  const r = Math.max(guess / answer, answer / guess);
  return r < 1.05 ? 'almost nothing' : `${r < 10 ? r.toFixed(1) : Math.round(r)}×`;
}

function paintFeedback(idx: number): void {
  if (!session) return;
  const d = session.drills[idx]!;
  const grade = session.grades[idx];
  const pick = session.picks[idx];
  const n = session.drills.length;
  const fb = $('#p-feedback');
  if (!grade) {
    const how =
      d.kind === 'spot'
        ? 'Read the metrics, load bars and labels. Symptoms often show up somewhere other than the cause.'
        : d.kind === 'choice'
          ? 'Several options sound reasonable. Look for the one that addresses the cause, not the symptom.'
          : 'Round aggressively and show your working to yourself. Within 2× counts as right.';
    const keys =
      d.kind === 'choice' ? '<kbd>A</kbd>–<kbd>D</kbd> or <kbd>1</kbd>–<kbd>4</kbd> to answer' : d.kind === 'estimate' ? '<kbd>Enter</kbd> to check' : 'click the diagram';
    fb.innerHTML = `
      <div class="sc-head"><span class="sc-count">Drill ${idx + 1} / ${n}</span><span class="kind p-kind-${d.kind}">${drillKindLabel(d)}</span></div>
      <h2>How to approach it</h2>
      <div class="sc-body"><p>${how}</p></div>
      <div class="kbd-hints">${keys} · <kbd>←</kbd> previous</div>`;
    return;
  }
  const last = idx === n - 1;
  let specific = '';
  if (d.kind === 'spot' && pick?.kind === 'node' && pick.id !== d.answer) specific = d.why?.[pick.id] ?? '';
  if (d.kind === 'choice' && pick?.kind === 'option' && !(d as ChoiceDrill).options[pick.index]?.correct) {
    specific = (d as ChoiceDrill).options[pick.index]?.why ?? '';
  }
  fb.innerHTML = `
    <div class="p-result p-${grade}">${icon(GRADE_META[grade].icon, 18)}<b>${pick?.kind === 'reveal' ? 'Here’s the answer' : GRADE_META[grade].label}</b></div>
    <div class="sc-body">
      ${specific ? `<p class="p-specific">${esc(specific)}</p>` : ''}
      <p>${esc(d.explain)}</p>
      <a class="p-ref" href="#/${d.ref.slug}/${d.ref.step}">${icon('learn', 14)} Review: ${esc(lessonTitle(d.ref.slug))} · step ${d.ref.step}</a>
    </div>
    <div class="sc-nav">
      ${idx > 0 ? `<a class="btn btn-back" href="#/practice/${session.setId}/${idx}">${icon('arrowLeft', 15)}</a>` : ''}
      <a class="btn btn-next" id="p-next" href="#/practice/${session.setId}/${last ? 'done' : idx + 2}"><span>${last ? 'See results' : 'Next drill'}</span>${icon('arrowRight', 15)}</a>
    </div>
    <div class="kbd-hints"><kbd>Enter</kbd> or <kbd>→</kbd> continue</div>`;
  $('.p-head .p-dots').innerHTML = dots();
  renderSidebar();
}

function submit(idx: number, pick: Pick): void {
  if (!session || session.grades[idx]) return;
  const d = session.drills[idx]!;
  let grade: Grade;
  if (pick.kind === 'reveal') grade = 'wrong';
  else if (d.kind === 'choice' && pick.kind === 'option') grade = d.options[pick.index]?.correct ? 'right' : 'wrong';
  else if (d.kind === 'estimate' && pick.kind === 'number') grade = gradeEstimate(pick.value, d.answer);
  else if (d.kind === 'spot' && pick.kind === 'node') grade = pick.id === d.answer ? 'right' : 'wrong';
  else return;
  session.picks[idx] = pick;
  session.grades[idx] = grade;
  recordAnswer(d.id, grade);
  paintAnswer(idx);
  root?.querySelector<HTMLElement>('#p-next')?.focus({ preventScroll: true });
  if (matchMedia('(max-width: 959px)').matches) $('#p-feedback').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ───────────────────────────── summary ─────────────────────────────

function renderSummary(): void {
  if (!session) return;
  const s = session;
  const answered = s.grades.filter(Boolean).length;
  const score = s.grades.reduce((sum, g) => sum + (g ? SCORE[g] : 0), 0);
  const ratio = s.drills.length ? score / s.drills.length : 0;
  const missed = s.grades.filter((g) => g !== 'right').length;
  const setIndex = SETS.findIndex((x) => x.id === s.setId);
  const nextSet = setIndex >= 0 ? SETS[setIndex + 1] : undefined;
  document.title = `${s.title} results · Practice · Scale Atlas`;
  $('#p-main').innerHTML = `
    <div class="p-head">
      <div class="crumbs"><a href="#/practice">Practice</a><span>/</span>${esc(s.title)}<span>/</span>Results</div>
      <h1 class="p-title">${ratio >= 0.85 ? 'Excellent.' : ratio >= 0.6 ? 'Solid work.' : 'Good practice.'} ${formatNumber(score)} / ${s.drills.length}</h1>
      ${answered < s.drills.length ? `<p class="blurb">${s.drills.length - answered} drill${s.drills.length - answered === 1 ? '' : 's'} skipped — skipped drills count as missed.</p>` : ''}
    </div>
    <section class="card p-summary">
      <div class="p-ring" style="--p:${ratio * 100}"><b>${pct(ratio)}</b><small>score</small></div>
      <ol class="p-rows">${s.drills
        .map((d, i) => {
          const g = s.grades[i];
          return `<li class="p-row g-${g ?? 'none'}">
            <span class="p-row-ico">${icon(g === 'right' ? 'check' : g === 'close' ? 'scale' : g ? 'x' : 'clock', 14)}</span>
            <a href="#/practice/${s.setId}/${i + 1}">${esc(d.prompt)}</a>
            <a class="p-row-ref" href="#/${d.ref.slug}/${d.ref.step}" title="Review in lesson">${icon('learn', 14)}</a>
          </li>`;
        })
        .join('')}</ol>
    </section>
    <div class="p-actions">
      ${missed ? `<button class="btn btn-next" id="p-retry"><span>Retry ${missed} missed</span>${icon('refresh', 15)}</button>` : ''}
      ${nextSet ? `<a class="btn btn-back" href="#/practice/${nextSet.id}">Next: ${esc(nextSet.title)} ${icon('arrowRight', 15)}</a>` : ''}
      <a class="btn btn-back" href="#/practice">All drill sets</a>
    </div>`;
  root?.querySelector('#p-retry')?.addEventListener('click', startRetry);
  const streak = getStreak();
  $('#p-side').innerHTML = `
    <section class="card p-panel">
      <b class="goals-title">Streak</b>
      <div class="p-stats"><div><b>${streak.current}</b><small>current</small></div><div><b>${streak.best}</b><small>best</small></div></div>
      <small class="p-muted">Consecutive correct answers across all practice.</small>
    </section>`;
}

// ───────────────────────────── keys ─────────────────────────────

/** Keyboard handling while the Practice view is showing. Returns true if handled. */
export function onPracticeKey(e: KeyboardEvent): boolean {
  if (!session || view.kind !== 'drill') return false;
  const t = e.target as HTMLElement | null;
  if (t && t.tagName === 'INPUT') return false;
  const idx = view.idx;
  const d = session.drills[idx]!;
  const answered = !!session.grades[idx];
  if (!answered && d.kind === 'choice') {
    const k = e.key.toLowerCase();
    const pos = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k);
    if (pos >= 0) {
      const order = stableShuffle(
        d.options.map((_, i) => i),
        d.id,
      );
      const oi = order[pos];
      if (oi !== undefined) {
        submit(idx, { kind: 'option', index: oi });
        return true;
      }
    }
  }
  if (answered && (e.key === 'Enter' || e.key === 'ArrowRight')) {
    if (t?.tagName === 'A' && e.key === 'Enter') return false; // let the focused link act
    go(`#/practice/${session.setId}/${idx === session.drills.length - 1 ? 'done' : idx + 2}`);
    return true;
  }
  if (e.key === 'ArrowLeft' && idx > 0) {
    go(`#/practice/${session.setId}/${idx}`);
    return true;
  }
  return false;
}
