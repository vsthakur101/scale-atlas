import { at, pill } from '../course/kit';
import { Board } from '../engine/board';
import { icon } from '../engine/icons';
import { load, save } from '../store';
import type { Pill, Scene, SceneFlow, SceneLink, SceneNode } from '../types';
import { toast } from '../ui/toast';
import { CHALLENGES, SANDBOX_DEFAULT, evaluate, type Challenge } from './challenges';
import {
  PALETTE,
  SPECS,
  canLink,
  clampCount,
  clampRps,
  cloneDesign,
  decodeDesign,
  encodeDesign,
  newId,
  nodeCost,
  type CompType,
  type Design,
  type LabNode,
} from './model';
import { edgeKey, simulate, type Failures, type SimResult } from './sim';

/**
 * Design Lab: build an architecture, push traffic through it, break things.
 * Every change re-runs the simulator and re-renders the board in place, so
 * components glide rather than redraw.
 */

type Tool = 'select' | 'link' | 'break';

interface LabState {
  key: string; // 'sandbox' or a challenge id
  challenge: Challenge | null;
  design: Design;
  selected: string | null;
  tool: Tool;
  linkFrom: string | null;
  failures: Failures;
  result: SimResult | null;
}

const SANDBOX = 'sandbox';

let root: HTMLElement | null = null;
let board: Board | null = null;
let st: LabState | null = null;
let passed = new Set(load<string[]>('lab-passed', []));

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = root?.querySelector<T>(sel);
  if (!el) throw new Error(`lab: missing ${sel}`);
  return el;
};
const fmtN = (n: number): string => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(n)}`);
const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
const storeKey = (key: string) => `lab-design-${key}`;

// ───────────────────────────── mount & routing ─────────────────────────────

export function mountLab(host: HTMLElement): void {
  if (root) return;
  root = host;
  host.innerHTML = `
    <aside class="sidebar l-sidebar" aria-label="Lab challenges">
      <div class="sb-head"><span>${icon('flask', 15)} Design Lab</span><small>${CHALLENGES.length} challenges</small></div>
      <nav class="tree" id="l-list"></nav>
      <div class="progress-card" id="l-progress"></div>
    </aside>
    <main class="p-main l-main" id="l-main">
      <div class="p-head" id="l-head"></div>
      <section class="card l-toolbar" aria-label="Components and tools">
        <div class="l-palette" id="l-palette"></div>
        <div class="l-tools" id="l-tools"></div>
      </section>
      <section class="card diagram l-board">
        <div class="diag-top"><div class="metrics" id="l-metrics"></div></div>
        <div class="board-host" id="l-board-host"></div>
        <div class="legend l-hint" id="l-hint"></div>
      </section>
      <section class="card l-traffic" id="l-traffic"></section>
    </main>
    <div class="p-side l-side">
      <section class="card p-panel l-goals" id="l-goals"></section>
      <section class="card p-panel l-inspector" id="l-inspector"></section>
    </div>`;
  $('#l-palette').innerHTML =
    `<span class="l-label">Add</span>` +
    PALETTE.map((t) => `<button class="l-add" data-type="${t}" title="${esc(SPECS[t].blurb)}">${icon(SPECS[t].icon, 14)}<span>${esc(SPECS[t].short)}</span></button>`).join('');
  $('#l-palette').querySelectorAll<HTMLButtonElement>('.l-add').forEach((b) => b.addEventListener('click', () => addNode(b.dataset.type as CompType)));
}

export function routeLab(hash: string): void {
  if (!root) return;
  const [key, code] = hash.replace(/^#\/lab\/?/, '').split('/');
  if (!key) {
    const last = load<string | null>('lab-last', null);
    history.replaceState(null, '', `#/lab/${last ?? CHALLENGES[0]!.id}`);
    return routeLab(location.hash);
  }
  const challenge = CHALLENGES.find((c) => c.id === key) ?? null;
  if (!challenge && key !== SANDBOX) {
    history.replaceState(null, '', `#/lab/${CHALLENGES[0]!.id}`);
    return routeLab(location.hash);
  }
  let design: Design;
  if (key === SANDBOX && code) {
    const shared = decodeDesign(code);
    if (shared) {
      design = shared;
      save(storeKey(SANDBOX), design);
      toast('Shared design loaded into your sandbox', 'link');
    } else {
      toast('That design link is damaged', 'alert');
      design = load<Design | null>(storeKey(SANDBOX), null) ?? cloneDesign(SANDBOX_DEFAULT);
    }
    history.replaceState(null, '', `#/lab/${SANDBOX}`);
  } else {
    const saved = load<Design | null>(storeKey(key), null);
    design = saved && Array.isArray(saved.nodes) ? saved : cloneDesign(challenge ? challenge.starter : SANDBOX_DEFAULT);
  }
  if (challenge) design.traffic = { ...challenge.traffic };
  save('lab-last', key);

  const switching = st?.key !== key;
  st = { key, challenge, design, selected: null, tool: st?.tool === 'break' ? 'select' : (st?.tool ?? 'select'), linkFrom: null, failures: new Map(), result: null };
  if (switching || !board) {
    board?.destroy();
    board = new Board($('#l-board-host'));
    board.svg.setAttribute('aria-label', 'Your design');
    board.setClickHandler(onBoardClick);
  }
  document.title = `${challenge ? challenge.title : 'Sandbox'} · Design Lab · Scale Atlas`;
  renderHead();
  renderTraffic();
  update();
  window.scrollTo({ top: 0 });
}

// ───────────────────────────── state changes ─────────────────────────────

function commit(): void {
  if (!st) return;
  save(storeKey(st.key), st.design);
  update();
}

function addNode(type: CompType): void {
  if (!st) return;
  const d = st.design;
  if (SPECS[type].maxCount === 1 && type !== 'db' && d.nodes.some((n) => n.type === type)) {
    toast(`You already have a ${SPECS[type].name.toLowerCase()} — select it to change it`, 'alert');
    return;
  }
  if (type === 'db' && d.nodes.some((n) => n.type === 'db')) {
    toast('One primary database is enough here — add read replicas or a standby instead', 'db');
    return;
  }
  const node: LabNode = { id: newId(type, d.nodes), type, count: 1 };
  d.nodes.push(node);
  // building a chain: auto-link from the selected component when that’s a valid link
  const from = st.selected ? d.nodes.find((n) => n.id === st!.selected) : undefined;
  if (from && canLink(from.type, type)) {
    d.edges.push({ from: from.id, to: node.id });
    toast(`Linked ${SPECS[from.type].short} → ${SPECS[type].short}`, 'link');
  }
  st.selected = node.id;
  commit();
}

function removeNode(id: string): void {
  if (!st) return;
  const n = st.design.nodes.find((x) => x.id === id);
  if (!n || n.type === 'client') return;
  st.design.nodes = st.design.nodes.filter((x) => x.id !== id);
  st.design.edges = st.design.edges.filter((e) => e.from !== id && e.to !== id);
  st.failures.delete(id);
  if (st.selected === id) st.selected = null;
  if (st.linkFrom === id) st.linkFrom = null;
  commit();
}

function toggleEdge(from: string, to: string): void {
  if (!st) return;
  const d = st.design;
  const i = d.edges.findIndex((e) => e.from === from && e.to === to);
  if (i >= 0) d.edges.splice(i, 1);
  else d.edges.push({ from, to });
  commit();
}

function toggleFailure(id: string): void {
  if (!st) return;
  const n = st.design.nodes.find((x) => x.id === id);
  if (!n || n.type === 'client') return;
  const cur = st.failures.get(id);
  const next = n.count > 1 ? (!cur ? 'one' : cur === 'one' ? 'down' : null) : cur ? null : 'down';
  if (next) st.failures.set(id, next);
  else st.failures.delete(id);
  update();
}

function onBoardClick(id: string | null): void {
  if (!st) return;
  if (!id || !st.design.nodes.some((n) => n.id === id)) {
    st.selected = null;
    st.linkFrom = null;
    update();
    return;
  }
  if (st.tool === 'break') {
    st.selected = id;
    toggleFailure(id);
    return;
  }
  if (st.tool === 'link') {
    if (!st.linkFrom || st.linkFrom === id) {
      st.linkFrom = id;
      st.selected = id;
      update();
      return;
    }
    const a = st.design.nodes.find((n) => n.id === st!.linkFrom)!;
    const b = st.design.nodes.find((n) => n.id === id)!;
    if (canLink(a.type, b.type)) toggleEdge(a.id, b.id);
    else if (canLink(b.type, a.type)) toggleEdge(b.id, a.id);
    else toast(`${SPECS[a.type].name} can’t send traffic to ${SPECS[b.type].name.toLowerCase()}`, 'alert');
    st.selected = id;
    st.linkFrom = id;
    update();
    return;
  }
  st.selected = id;
  update();
}

function setTool(tool: Tool): void {
  if (!st) return;
  st.tool = tool;
  st.linkFrom = tool === 'link' ? st.selected : null;
  if (tool !== 'break' && st.failures.size) {
    st.failures.clear();
    toast('Failures cleared', 'refresh');
  }
  update();
}

// ───────────────────────────── rendering ─────────────────────────────

function update(): void {
  if (!st || !board) return;
  st.result = simulate(st.design, st.failures);
  board.render(buildScene(st.design, st.result));
  for (const n of st.design.nodes) board.mark(n.id, n.id === st.selected ? 'sel' : null);
  renderMetrics();
  renderTools();
  renderGoals();
  renderInspector();
  renderList();
}

function buildScene(d: Design, r: SimResult): Scene {
  const cols = new Map<number, LabNode[]>();
  for (const n of d.nodes) {
    const c = SPECS[n.type].column;
    cols.set(c, [...(cols.get(c) ?? []), n]);
  }
  const used = [...cols.keys()].sort((a, b) => a - b);
  const nodes: SceneNode[] = [];
  used.forEach((col, ci) => {
    const list = cols.get(col)!;
    list.forEach((n, i) => {
      const spec = SPECS[n.type];
      const stat = r.nodes.get(n.id);
      const mid = (list.length - 1) / 2;
      const pos = at(-14 + ci * 6 + (i - mid) * 1.4, (i - mid) * 6.5);
      const fail = st?.failures.get(n.id);
      const warn = stat?.warnings.find((w) => w !== 'down');
      const isSpof = r.spofs.includes(n.id);
      let tag: Pill | undefined;
      if (fail) tag = pill(fail === 'one' ? '1 instance failed' : 'failed', 'alert', 'bad');
      else if (warn) tag = pill(warn.length > 34 ? `${warn.slice(0, 33)}…` : warn, 'alert', /overload|no |nowhere|down|read-only|only 1/.test(warn) ? 'bad' : 'warn');
      else if (isSpof) tag = pill('single point of failure', 'alert', 'warn');
      if (n.type === 'client') {
        nodes.push({ id: n.id, kind: 'crowd', at: pos, tone: 'green', count: 18, label: pill(`${fmtN(d.traffic.rps)} req/s · ${d.traffic.readPct}% reads`, 'users'), tag });
        return;
      }
      const sub = [n.count > 1 ? `× ${n.count}` : '', n.type === 'db' && n.standby ? '+ standby' : ''].filter(Boolean).join(' ');
      nodes.push({
        id: n.id,
        kind: spec.kind,
        at: pos,
        tone: spec.tone,
        name: spec.short,
        sub: sub || undefined,
        icon: spec.icon,
        size: n.type === 'queue' ? [2.2, 1.2] : spec.kind === 'db' ? [1.4, 1.4] : [1.35, 1.35],
        height: n.type === 'queue' ? 26 : spec.kind === 'db' ? 48 : 36,
        load: stat && !stat.down && spec.cap !== Infinity ? Math.min(100, Math.round(stat.rho * 100)) : undefined,
        state: stat?.down ? 'down' : stat && stat.rho > 1 ? 'hot' : 'ok',
        tag,
      });
    });
  });

  const links: SceneLink[] = [];
  const flows: SceneFlow[] = [];
  for (const e of d.edges) {
    const t = r.edges.get(edgeKey(e.from, e.to));
    const vol = t ? t.r + t.w + t.a : 0;
    links.push({ from: e.from, to: e.to, style: vol > 0 ? 'solid' : 'dashed' });
    if (vol > 0) {
      const rate = Math.min(4, 0.35 + Math.log10(1 + vol) / 1.2);
      const toStat = r.nodes.get(e.to);
      if (t!.a > t!.r + t!.w) flows.push({ route: [e.from, e.to], kind: 'write', rate });
      else flows.push({ route: [e.from, e.to], kind: 'request', back: true, rate });
      if (toStat && (toStat.down || toStat.rho > 1)) flows.push({ route: [e.from, e.to], kind: 'fail', rate: Math.min(2, rate / 2) });
    }
  }
  return { nodes, links, flows };
}

function renderHead(): void {
  if (!st) return;
  const c = st.challenge;
  $('#l-head').innerHTML = `
    <div class="crumbs">Design Lab <span>/</span> ${c ? `Challenge ${CHALLENGES.indexOf(c) + 1} of ${CHALLENGES.length}` : 'Sandbox'}</div>
    <h1 class="p-title">${esc(c ? c.title : 'Sandbox')}${c && passed.has(c.id) ? ` <span class="l-done">${icon('check', 14)} solved</span>` : ''}</h1>
    <p class="blurb">${esc(c ? c.brief : 'Free play: set any traffic, build anything, break anything. Your design is saved here, and you can share it as a link.')}</p>`;
}

function renderTraffic(): void {
  if (!st) return;
  const fixed = !!st.challenge;
  const t = st.design.traffic;
  $('#l-traffic').innerHTML = `
    <div class="l-tr-row">
      <label for="l-rps">${icon('activity', 13)} Traffic</label>
      <input id="l-rps" type="range" min="1" max="5" step="0.01" value="${Math.log10(t.rps)}" ${fixed ? 'disabled' : ''}/>
      <b id="l-rps-v">${fmtN(t.rps)} req/s</b>
    </div>
    <div class="l-tr-row">
      <label for="l-read">${icon('search', 13)} Reads</label>
      <input id="l-read" type="range" min="0" max="100" step="5" value="${t.readPct}" ${fixed ? 'disabled' : ''}/>
      <b id="l-read-v">${t.readPct}%</b>
    </div>
    ${fixed ? `<small class="p-muted">Traffic is fixed for this challenge — try the sandbox to play with it.</small>` : ''}`;
  if (fixed) return;
  const rps = $<HTMLInputElement>('#l-rps');
  const read = $<HTMLInputElement>('#l-read');
  const onInput = () => {
    if (!st) return;
    st.design.traffic = { rps: clampRps(10 ** Number(rps.value)), readPct: Number(read.value) };
    $('#l-rps-v').textContent = `${fmtN(st.design.traffic.rps)} req/s`;
    $('#l-read-v').textContent = `${st.design.traffic.readPct}%`;
    commit();
  };
  rps.addEventListener('input', onInput);
  read.addEventListener('input', onInput);
}

function renderMetrics(): void {
  if (!st?.result) return;
  const r = st.result;
  const m = (ico: Parameters<typeof icon>[0], label: string, v: string, tone = '') =>
    `<div class="metric${tone ? ' m-' + tone : ''}"><small>${icon(ico, 12)}${label}</small><b>${v}</b></div>`;
  $('#l-metrics').innerHTML =
    m('activity', 'Served', `${fmtN(r.served)}/s`, r.errorRate > 0.01 ? 'warn' : '') +
    m('timer', 'p99', r.p99 ? `${Math.round(r.p99)} ms` : '—', r.p99 > 500 ? 'bad' : r.p99 > 200 ? 'warn' : '') +
    m('alert', 'Errors', `${(r.errorRate * 100).toFixed(r.errorRate > 0 && r.errorRate < 0.1 ? 1 : 0)}%`, r.errorRate > 0.05 ? 'bad' : r.errorRate > 0.01 ? 'warn' : '') +
    m('dollar', 'Cost / mo', money(r.cost)) +
    m('shield', 'SPOFs', String(r.spofs.length), r.spofs.length ? 'warn' : 'good') +
    (r.backlog >= 1 ? m('queue', 'Backlog', `+${fmtN(r.backlog)}/s`, 'bad') : '');
  const hint =
    st.tool === 'link'
      ? st.linkFrom
        ? `Link mode: click another component to connect it with <b>${esc(SPECS[st.design.nodes.find((n) => n.id === st!.linkFrom)?.type ?? 'app'].short)}</b> (click again to unlink).`
        : 'Link mode: click a component, then the one it should send traffic to.'
      : st.tool === 'break'
        ? `Break mode: click a component to fail it (multi-instance: one, then all). ${st.failures.size ? `<b>${st.failures.size} failed</b>.` : ''}`
        : 'Click a component to inspect and connect it. Add components from the bar above.';
  $('#l-hint').innerHTML = `<span>${hint}</span><span class="l-legend"><i class="pkt-dot pkt-request"></i>request <i class="pkt-dot pkt-write"></i>async write <i class="pkt-dot pkt-fail"></i>dropped</span>`;
}

function renderTools(): void {
  if (!st) return;
  const t = st.tool;
  const btn = (tool: Tool, ico: Parameters<typeof icon>[0], label: string, key: string) =>
    `<button class="l-tool${t === tool ? ' on' : ''}" data-tool="${tool}" aria-pressed="${t === tool}" title="${label} (${key})">${icon(ico, 14)}<span>${label}</span></button>`;
  $('#l-tools').innerHTML = `
    <div class="l-seg" role="group" aria-label="Tool">${btn('select', 'pin', 'Select', 'V')}${btn('link', 'link', 'Link', 'L')}${btn('break', 'alert', 'Break', 'B')}</div>
    <div class="l-actions">
      <button class="ghost-btn" id="l-reset">${icon('refresh', 14)}<span>Reset</span></button>
      ${st.challenge ? `<button class="ghost-btn" id="l-solve">${icon('bulb', 14)}<span>Show a solution</span></button>` : `<button class="ghost-btn" id="l-share">${icon('share', 14)}<span>Share</span></button>`}
    </div>`;
  root!.querySelectorAll<HTMLButtonElement>('.l-tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool as Tool)));
  $('#l-reset').addEventListener('click', () => {
    if (!st || !confirm(st.challenge ? 'Reset to the starting design?' : 'Reset the sandbox to its default design?')) return;
    st.design = cloneDesign(st.challenge ? st.challenge.starter : SANDBOX_DEFAULT);
    st.selected = null;
    st.failures.clear();
    renderTraffic();
    commit();
  });
  root!.querySelector('#l-solve')?.addEventListener('click', () => {
    if (!st?.challenge || !confirm('Replace your design with a reference solution? (There are many valid answers.)')) return;
    st.design = cloneDesign(st.challenge.solution);
    st.selected = null;
    st.failures.clear();
    commit();
  });
  root!.querySelector('#l-share')?.addEventListener('click', () => {
    if (!st) return;
    const url = `${location.origin}${location.pathname}#/lab/${SANDBOX}/${encodeDesign(st.design)}`;
    navigator.clipboard?.writeText(url).then(
      () => toast('Link to this design copied', 'link'),
      () => toast('Could not copy the link', 'alert'),
    );
  });
}

function renderGoals(): void {
  if (!st?.result) return;
  const r = st.result;
  const c = st.challenge;
  if (!c) {
    $('#l-goals').innerHTML = `
      <b class="goals-title">Sandbox</b>
      <div class="p-stats">
        <div><b>${st.design.nodes.length - 1}</b><small>components</small></div>
        <div><b>${r.p99 ? Math.round(r.p99) : '—'}</b><small>p99 ms</small></div>
        <div><b>${money(r.cost)}</b><small>per month</small></div>
      </div>
      <small class="p-muted">Tip: turn on Break mode and click components to see what fails with them.</small>`;
    return;
  }
  const statuses = c.goals.map((g) => evaluate(g, r));
  const allPass = statuses.every((s) => s.pass) && st.failures.size === 0;
  if (allPass && !passed.has(c.id)) {
    passed.add(c.id);
    save('lab-passed', [...passed]);
    toast(`Challenge solved: ${c.title}`, 'sparkle', 3000);
    renderHead();
  }
  const idx = CHALLENGES.indexOf(c);
  const next = CHALLENGES[idx + 1];
  $('#l-goals').innerHTML = `
    <div class="sc-head"><b class="goals-title">Goals</b><span class="kind ${allPass ? 'kind-recap' : 'kind-problem'}">${allPass ? 'solved' : `${statuses.filter((s) => s.pass).length} / ${statuses.length}`}</span></div>
    <ul class="l-goal-list">${statuses
      .map((s) => `<li class="${s.pass ? 'ok' : 'no'}"><span class="box">${s.pass ? icon('check', 12) : icon('x', 12)}</span><span>${esc(s.label)}</span><b>${esc(s.value)}</b></li>`)
      .join('')}</ul>
    ${st.failures.size ? `<small class="p-muted">${icon('alert', 12)} Goals are measured with your injected failures — clear them to be scored.</small>` : ''}
    <div class="l-refs">${c.refs.map((x) => `<a class="p-ref" href="#/${x.slug}/${x.step}">${icon('learn', 13)} ${esc(x.label)}</a>`).join('')}</div>
    ${allPass && next ? `<a class="btn btn-next l-next" href="#/lab/${next.id}"><span>Next: ${esc(next.title)}</span>${icon('arrowRight', 15)}</a>` : ''}`;
}

function renderInspector(): void {
  if (!st?.result) return;
  const n = st.design.nodes.find((x) => x.id === st!.selected);
  const box = $('#l-inspector');
  if (!n) {
    box.innerHTML = `
      <b class="goals-title">How to build</b>
      <ol class="l-help">
        <li><b>Add</b> components from the bar above the diagram. If a component is selected, the new one is linked to it.</li>
        <li><b>Click</b> a component to inspect it: scale it, connect it, remove it.</li>
        <li><b>Link</b> mode: click a source, then a destination.</li>
        <li><b>Break</b> mode: click components to fail them and see what survives.</li>
      </ol>
      <small class="p-muted">Keys: <kbd>V</kbd> select · <kbd>L</kbd> link · <kbd>B</kbd> break · <kbd>Del</kbd> remove · <kbd>Esc</kbd> deselect</small>`;
    return;
  }
  const spec = SPECS[n.type];
  const stat = st.result.nodes.get(n.id);
  const d = st.design;
  const outs = d.nodes.filter((x) => canLink(n.type, x.type));
  const missing = spec.targets.filter((t) => !d.nodes.some((x) => x.type === t));
  const fail = st.failures.get(n.id);
  const inRate = stat ? stat.in.r + stat.in.w + stat.in.a : 0;
  box.innerHTML = `
    <div class="sc-head"><b class="goals-title">${icon(spec.icon, 13)} ${esc(spec.name)}</b>${st.result.spofs.includes(n.id) ? '<span class="kind kind-tradeoff">SPOF</span>' : ''}</div>
    <p class="l-blurb">${esc(spec.blurb)}</p>
    ${
      n.type === 'client'
        ? ''
        : `<div class="p-stats">
        <div><b>${stat?.down ? 'down' : `${Math.round((stat?.rho ?? 0) * 100)}%`}</b><small>load</small></div>
        <div><b>${fmtN(inRate)}/s</b><small>incoming</small></div>
        <div><b>${stat && !stat.down ? Math.round(stat.p99) : '—'}</b><small>p99 ms</small></div>
        <div><b>${money(nodeCost(n))}</b><small>per month</small></div>
      </div>`
    }
    ${
      spec.maxCount > 1
        ? `<div class="l-row"><span>Instances</span><div class="l-step"><button id="l-minus" aria-label="Fewer instances" ${n.count <= 1 ? 'disabled' : ''}>−</button><b>${n.count}</b><button id="l-plus" aria-label="More instances" ${n.count >= spec.maxCount ? 'disabled' : ''}>+</button></div></div>`
        : ''
    }
    ${n.type === 'db' ? `<label class="l-row l-check"><span>Hot standby (+${money(spec.cost)})</span><input type="checkbox" id="l-standby" ${n.standby ? 'checked' : ''}/></label>` : ''}
    ${
      spec.targets.length
        ? `<div class="l-sub">Sends traffic to</div>
      <div class="l-links">${
        outs.length
          ? outs
              .map((x) => {
                const on = d.edges.some((e) => e.from === n.id && e.to === x.id);
                return `<label class="l-link"><input type="checkbox" data-to="${esc(x.id)}" ${on ? 'checked' : ''}/>${icon(SPECS[x.type].icon, 13)}<span>${esc(SPECS[x.type].name)}</span></label>`;
              })
              .join('')
          : '<small class="p-muted">Nothing it can connect to yet.</small>'
      }</div>
      ${missing.length ? `<div class="l-quick">${missing.map((t) => `<button class="l-add sm" data-add="${t}">${icon('sparkle', 12)}Add ${esc(SPECS[t].short)}</button>`).join('')}</div>` : ''}`
        : ''
    }
    ${stat?.warnings.filter((w) => w !== 'down').length ? `<ul class="l-warn">${stat.warnings.filter((w) => w !== 'down').map((w) => `<li>${icon('alert', 12)} ${esc(w)}</li>`).join('')}</ul>` : ''}
    ${
      n.type === 'client'
        ? ''
        : `<div class="l-actions-row">
        <button class="ghost-btn" id="l-fail">${icon(fail ? 'refresh' : 'alert', 14)}<span>${fail ? 'Restore' : n.count > 1 ? 'Fail one' : 'Fail it'}</span></button>
        <button class="ghost-btn l-danger" id="l-remove">${icon('x', 14)}<span>Remove</span></button>
      </div>`
    }`;
  box.querySelector('#l-minus')?.addEventListener('click', () => {
    n.count = clampCount(n.type, n.count - 1);
    commit();
  });
  box.querySelector('#l-plus')?.addEventListener('click', () => {
    n.count = clampCount(n.type, n.count + 1);
    commit();
  });
  box.querySelector<HTMLInputElement>('#l-standby')?.addEventListener('change', (e) => {
    n.standby = (e.target as HTMLInputElement).checked;
    commit();
  });
  box.querySelectorAll<HTMLInputElement>('.l-link input').forEach((c) => c.addEventListener('change', () => toggleEdge(n.id, c.dataset.to!)));
  box.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((b) => b.addEventListener('click', () => addNode(b.dataset.add as CompType)));
  box.querySelector('#l-fail')?.addEventListener('click', () => {
    if (!st) return;
    if (st.failures.get(n.id)) st.failures.delete(n.id);
    else st.failures.set(n.id, n.count > 1 ? 'one' : 'down');
    if (st.tool !== 'break') st.tool = 'break';
    update();
  });
  box.querySelector('#l-remove')?.addEventListener('click', () => removeNode(n.id));
}

function renderList(): void {
  if (!st) return;
  const key = st.key;
  $('#l-list').innerHTML =
    `<a class="leaf p-leaf${key === SANDBOX ? ' active' : ''}" href="#/lab/${SANDBOX}">${icon('flask', 13)}<span>Sandbox</span></a>` +
    CHALLENGES.map(
      (c, i) =>
        `<a class="leaf p-leaf${key === c.id ? ' active' : ''}${passed.has(c.id) ? ' done' : ''}" href="#/lab/${c.id}">${passed.has(c.id) ? icon('check', 13) : icon('doc', 13)}<span>${i + 1}. ${esc(c.title)}</span></a>`,
    ).join('');
  const done = CHALLENGES.filter((c) => passed.has(c.id)).length;
  $('#l-progress').innerHTML = `
    <div class="pc-row"><span>Solved</span><b>${done} / ${CHALLENGES.length}</b></div>
    <div class="bar"><i style="width:${(done / CHALLENGES.length) * 100}%"></i></div>
    ${done ? `<button class="link-btn" id="l-reset-all">Reset lab progress</button>` : `<small>Designs save automatically.</small>`}`;
  root!.querySelector('#l-reset-all')?.addEventListener('click', () => {
    if (!confirm('Clear solved challenges and every saved lab design?')) return;
    passed = new Set();
    save('lab-passed', []);
    for (const k of [SANDBOX, ...CHALLENGES.map((c) => c.id)]) save(storeKey(k), null);
    routeLab(`#/lab/${st?.key ?? ''}`);
  });
}

// ───────────────────────────── keys ─────────────────────────────

export function onLabKey(e: KeyboardEvent): boolean {
  if (!st) return false;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return false;
  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      if (st.selected) {
        removeNode(st.selected);
        return true;
      }
      return false;
    case 'Escape':
      if (st.selected || st.linkFrom) {
        st.selected = null;
        st.linkFrom = null;
        update();
        return true;
      }
      return false;
    case 'v':
    case 'V':
      setTool('select');
      return true;
    case 'l':
    case 'L':
      setTool('link');
      return true;
    case 'b':
    case 'B':
      setTool('break');
      return true;
    default:
      return false;
  }
}
