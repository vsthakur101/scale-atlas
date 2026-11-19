import { icon } from '../engine/icons';
import { toast } from '../ui/toast';
import { CALCS } from './calcs';
import { SHEETS } from './sheets';
import type { Block, Sheet } from './types';

/**
 * Cheatsheets: a reference library. One sheet per topic, each made of tables,
 * formulas, checklists and live calculators; searchable down to individual rows,
 * printable, and exportable as Markdown.
 */

let root: HTMLElement | null = null;
let current: Sheet | null = null;
let query = '';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tiny inline formatter: escapes first, then `code` and **bold**. */
const fmt = (s: string): string => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const plain = (s: string): string => s.replace(/`/g, '').replace(/\*\*/g, '');
/** calculators carry their own title; everything else uses the block title */
const titleOf = (b: Block): string => (b.kind === 'calc' ? CALCS[b.calc].title : b.title);

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = root?.querySelector<T>(sel);
  if (!el) throw new Error(`sheets: missing ${sel}`);
  return el;
};

// ───────────────────────────── search index ─────────────────────────────

interface Hit {
  sheet: Sheet;
  block: Block;
  text: string;
  score: number;
}

function blockText(b: Block): string[] {
  switch (b.kind) {
    case 'table':
      return b.rows.map((r) => r.join(' · '));
    case 'list':
      return b.items.map((i) => `${i.term}: ${i.text}`);
    case 'formula':
      return b.items.map((i) => `${i.name}: ${i.expr} — ${i.note}`);
    case 'steps':
    case 'pitfalls':
      return b.items;
    case 'calc':
      return [CALCS[b.calc].title];
  }
}

function search(q: string): Hit[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: Hit[] = [];
  for (const sheet of SHEETS) {
    for (const block of sheet.blocks) {
      for (const raw of blockText(block)) {
        const text = plain(raw);
        const hay = `${text} ${titleOf(block)} ${sheet.title}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) continue;
        const inRow = terms.filter((t) => text.toLowerCase().includes(t)).length;
        hits.push({ sheet, block, text, score: inRow * 2 + (titleOf(block).toLowerCase().includes(terms[0]!) ? 1 : 0) });
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 40);
}

function highlight(s: string, q: string): string {
  let out = esc(s);
  for (const t of q.split(/\s+/).filter(Boolean)) {
    const re = new RegExp(`(${esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    out = out.replace(re, '<mark>$1</mark>');
  }
  return out;
}

// ───────────────────────────── blocks ─────────────────────────────

function renderBlock(b: Block): string {
  const head = `<h3>${esc(b.title)}</h3>`;
  switch (b.kind) {
    case 'table':
      return `<section class="card sh-block" id="b-${b.id}">${head}
        <div class="sh-scroll"><table class="sh-table"><thead><tr>${b.cols.map((c) => `<th>${fmt(c)}</th>`).join('')}</tr></thead>
        <tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${fmt(c)}</th>` : `<td>${fmt(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>
        ${b.note ? `<p class="sh-note">${icon('bulb', 13)}<span>${fmt(b.note)}</span></p>` : ''}</section>`;
    case 'list':
      return `<section class="card sh-block" id="b-${b.id}">${head}<dl class="sh-dl">${b.items.map((i) => `<div><dt>${fmt(i.term)}</dt><dd>${fmt(i.text)}</dd></div>`).join('')}</dl></section>`;
    case 'formula':
      return `<section class="card sh-block" id="b-${b.id}">${head}<div class="sh-formulas">${b.items
        .map((i) => `<div class="sh-formula"><small>${esc(i.name)}</small><code>${esc(i.expr)}</code><span>${fmt(i.note)}</span></div>`)
        .join('')}</div></section>`;
    case 'steps':
      return `<section class="card sh-block" id="b-${b.id}">${head}<ol class="sh-steps">${b.items.map((i) => `<li>${fmt(i)}</li>`).join('')}</ol></section>`;
    case 'pitfalls':
      return `<section class="card sh-block sh-pit" id="b-${b.id}">${head}<ul class="sh-pitfalls">${b.items.map((i) => `<li>${icon('alert', 13)}<span>${fmt(i)}</span></li>`).join('')}</ul></section>`;
    case 'calc': {
      const c = CALCS[b.calc];
      return `<section class="card sh-block sh-calc" id="b-${b.id}" data-calc="${b.calc}">
        <h3>${icon('calc', 14)} ${esc(c.title)}</h3>
        <div class="sh-calc-grid">
          <div class="sh-inputs">${c.inputs
            .map((i) => `<label><span>${esc(i.label)}</span><span class="sh-field"><input type="number" inputmode="decimal" data-k="${i.key}" value="${i.value}" ${i.step ? `step="${i.step}"` : 'step="any"'} ${i.min !== undefined ? `min="${i.min}"` : ''}/>${i.unit ? `<em>${esc(i.unit)}</em>` : ''}</span></label>`)
            .join('')}${c.text ? `<label><span>${esc(c.text.label)}</span><span class="sh-field"><input type="text" data-t="1" value="${esc(c.text.value)}"/></span></label>` : ''}</div>
          <dl class="sh-results" aria-live="polite"></dl>
        </div></section>`;
    }
  }
}

function wireCalcs(): void {
  root?.querySelectorAll<HTMLElement>('.sh-calc').forEach((el) => {
    const calc = CALCS[el.dataset.calc as keyof typeof CALCS];
    const out = el.querySelector<HTMLElement>('.sh-results')!;
    const run = () => {
      const v: Record<string, number> = {};
      el.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((i) => (v[i.dataset.k!] = Number(i.value)));
      const text = el.querySelector<HTMLInputElement>('input[data-t]')?.value ?? '';
      out.innerHTML = calc.compute(v, text).map((r) => `<div class="${r.strong ? 'strong' : ''}"><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('');
    };
    el.addEventListener('input', run);
    run();
  });
}

// ───────────────────────────── markdown & print ─────────────────────────────

export function sheetToMarkdown(s: Sheet): string {
  const lines: string[] = [`# ${s.title}`, '', s.blurb, ''];
  for (const b of s.blocks) {
    if (b.kind === 'calc') continue;
    lines.push(`## ${b.title}`, '');
    if (b.kind === 'table') {
      lines.push(`| ${b.cols.map((c) => c || ' ').join(' | ')} |`, `| ${b.cols.map(() => '---').join(' | ')} |`);
      b.rows.forEach((r) => lines.push(`| ${r.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`));
      if (b.note) lines.push('', `> ${b.note}`);
    } else if (b.kind === 'list') b.items.forEach((i) => lines.push(`- **${plain(i.term)}** — ${i.text}`));
    else if (b.kind === 'formula') b.items.forEach((i) => lines.push(`- **${i.name}**: \`${i.expr}\` — ${i.note}`));
    else if (b.kind === 'steps') b.items.forEach((i, n) => lines.push(`${n + 1}. ${i}`));
    else b.items.forEach((i) => lines.push(`- [ ] ${i}`));
    lines.push('');
  }
  lines.push('---', `Scale Atlas · ${location.origin}/#/sheets/${s.id}`);
  return lines.join('\n');
}

/** HTML for the print layout of the sheet currently shown (or the whole library). */
export function sheetPrintHtml(): string {
  const sheets = current ? [current] : SHEETS;
  return sheets
    .map(
      (s) => `<h1>${esc(s.title)}</h1><p class="blurb">${esc(s.blurb)}</p>${s.blocks
        .filter((b) => b.kind !== 'calc')
        .map((b) => {
          const el = document.createElement('div');
          el.innerHTML = renderBlock(b);
          return el.innerHTML.replace(/class="card sh-block[^"]*"/, 'class="sh-pblock"');
        })
        .join('')}`,
    )
    .join('<hr/>');
}

// ───────────────────────────── mount & routing ─────────────────────────────

export function mountSheets(host: HTMLElement): void {
  if (root) return;
  root = host;
  host.innerHTML = `
    <aside class="sidebar p-sidebar" aria-label="Cheatsheets">
      <div class="sb-head"><span>${icon('sheet', 15)} Cheatsheets</span><small>${SHEETS.length} sheets</small></div>
      <label class="sh-search">${icon('search', 14)}<input id="sh-q" type="search" placeholder="Search every sheet…" aria-label="Search cheatsheets" autocomplete="off" spellcheck="false"/></label>
      <nav class="tree" id="sh-list"></nav>
    </aside>
    <main class="p-main" id="sh-main"></main>
    <div class="p-side" id="sh-side"></div>`;
  $<HTMLInputElement>('#sh-q').addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value;
    if (query.trim() && current) history.replaceState(null, '', '#/sheets');
    paint();
  });
}

export function routeSheets(hash: string): void {
  if (!root) return;
  const [id, block] = hash.replace(/^#\/sheets\/?/, '').split('/').filter(Boolean);
  const found = SHEETS.find((s) => s.id === id) ?? null;
  if (id && !found) {
    history.replaceState(null, '', '#/sheets');
    return routeSheets('#/sheets');
  }
  current = found;
  if (found) {
    query = '';
    $<HTMLInputElement>('#sh-q').value = '';
  }
  paint();
  document.title = found ? `${found.title} · Cheatsheets · Scale Atlas` : 'Cheatsheets · Scale Atlas';
  const target = block ? root.querySelector<HTMLElement>(`#b-${CSS.escape(block)}`) : null;
  if (target) {
    target.scrollIntoView({ block: 'start' });
    target.classList.add('sh-flash');
  } else {
    window.scrollTo({ top: 0 });
    $('#sh-main').scrollTop = 0;
  }
}

function paint(): void {
  paintList();
  if (query.trim()) paintResults();
  else if (current) paintSheet(current);
  else paintLibrary();
}

function paintList(): void {
  $('#sh-list').innerHTML =
    `<a class="leaf p-leaf${!current && !query ? ' active' : ''}" href="#/sheets">${icon('folder', 13)}<span>All sheets</span></a>` +
    SHEETS.map(
      (s) => `<a class="leaf p-leaf${current?.id === s.id ? ' active' : ''}" href="#/sheets/${s.id}"><span class="folder tone-${s.tone}">${icon(s.icon, 13)}</span><span>${esc(s.title)}</span></a>`,
    ).join('');
}

function countOf(s: Sheet): { tables: number; calcs: number } {
  return { tables: s.blocks.filter((b) => b.kind !== 'calc').length, calcs: s.blocks.filter((b) => b.kind === 'calc').length };
}

function paintLibrary(): void {
  $('#sh-main').innerHTML = `
    <div class="p-head">
      <div class="crumbs">Cheatsheets</div>
      <h1 class="p-title">Keep it on your desk</h1>
      <p class="blurb">Dense one-page references for every module: comparison tables, formulas with worked examples, checklists and live calculators. Search every row, print a sheet, or copy it as Markdown.</p>
    </div>
    <div class="p-grid">${SHEETS.map((s) => {
      const c = countOf(s);
      return `<a class="card p-card" href="#/sheets/${s.id}"><span class="p-card-top"><span class="folder tone-${s.tone}">${icon(s.icon, 16)}</span></span><b>${esc(s.title)}</b><small class="sh-blurb">${esc(s.blurb)}</small><span class="p-card-kinds"><span>${icon('sheet', 11)}${c.tables} sections</span>${c.calcs ? `<span>${icon('calc', 11)}${c.calcs} calculator${c.calcs > 1 ? 's' : ''}</span>` : ''}</span></a>`;
    }).join('')}</div>`;
  $('#sh-side').innerHTML = `
    <section class="card p-panel"><b class="goals-title">Using the sheets</b>
      <ul class="sh-tips">
        <li>${icon('search', 13)} Search matches individual rows across every sheet.</li>
        <li>${icon('calc', 13)} Calculators recompute as you type.</li>
        <li>${icon('printer', 13)} Print gives a clean black-and-white page.</li>
        <li>${icon('copy', 13)} Copy as Markdown for notes or docs.</li>
        <li>${icon('learn', 13)} Each sheet links back to the lessons behind it.</li>
      </ul></section>
    <section class="card p-panel"><button class="ghost-btn" id="sh-print-all">${icon('printer', 14)}<span>Print every sheet</span></button></section>`;
  root!.querySelector('#sh-print-all')?.addEventListener('click', () => window.print());
}

function paintSheet(s: Sheet): void {
  const idx = SHEETS.indexOf(s);
  const prev = SHEETS[idx - 1];
  const next = SHEETS[idx + 1];
  $('#sh-main').innerHTML = `
    <div class="p-head">
      <div class="crumbs"><a href="#/sheets">Cheatsheets</a><span>/</span>${esc(s.title)}</div>
      <h1 class="p-title">${esc(s.title)}</h1>
      <p class="blurb">${esc(s.blurb)}</p>
    </div>
    ${s.blocks.map(renderBlock).join('')}
    <div class="p-actions">
      ${prev ? `<a class="btn btn-back" href="#/sheets/${prev.id}">${icon('arrowLeft', 15)} ${esc(prev.title)}</a>` : ''}
      ${next ? `<a class="btn btn-back" href="#/sheets/${next.id}">${esc(next.title)} ${icon('arrowRight', 15)}</a>` : ''}
    </div>`;
  wireCalcs();
  $('#sh-side').innerHTML = `
    <section class="card p-panel"><b class="goals-title">On this sheet</b><nav class="sh-toc">${s.blocks.map((b) => `<a href="#/sheets/${s.id}/${b.id}">${b.kind === 'calc' ? `${icon('calc', 12)} ` : ''}${esc(titleOf(b))}</a>`).join('')}</nav></section>
    <section class="card p-panel"><b class="goals-title">Learn more</b><div class="l-refs">${s.refs
      .map((r) => `<a class="p-ref" href="#/${r.slug}/${r.step}">${icon('learn', 13)} ${esc(r.label)}</a>`)
      .join('')}</div></section>
    <section class="card p-panel sh-actions">
      <button class="ghost-btn" id="sh-print">${icon('printer', 14)}<span>Print</span></button>
      <button class="ghost-btn" id="sh-copy">${icon('copy', 14)}<span>Copy Markdown</span></button>
      <button class="ghost-btn" id="sh-dl">${icon('file', 14)}<span>Download .md</span></button>
    </section>`;
  root!.querySelector('#sh-print')?.addEventListener('click', () => window.print());
  root!.querySelector('#sh-copy')?.addEventListener('click', () =>
    navigator.clipboard?.writeText(sheetToMarkdown(s)).then(
      () => toast(`${s.title} copied as Markdown`, 'copy'),
      () => toast('Could not copy to the clipboard', 'alert'),
    ),
  );
  root!.querySelector('#sh-dl')?.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([sheetToMarkdown(s)], { type: 'text/markdown' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${s.id}-cheatsheet.md` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

function paintResults(): void {
  const q = query.trim();
  const hits = search(q);
  $('#sh-main').innerHTML = `
    <div class="p-head">
      <div class="crumbs"><a href="#/sheets">Cheatsheets</a><span>/</span>Search</div>
      <h1 class="p-title">${hits.length} result${hits.length === 1 ? '' : 's'} for “${esc(q)}”</h1>
    </div>
    ${
      hits.length
        ? `<ol class="sh-hits">${hits
            .map((h) => `<li><a class="card" href="#/sheets/${h.sheet.id}/${h.block.id}"><small><span class="folder tone-${h.sheet.tone}">${icon(h.sheet.icon, 12)}</span> ${esc(h.sheet.title)} · ${esc(titleOf(h.block))}</small><span>${highlight(h.text, q)}</span></a></li>`)
            .join('')}</ol>`
        : '<p class="blurb">Nothing matches. Try fewer or different words.</p>'
    }`;
  $('#sh-side').innerHTML = '';
}

export function onSheetsKey(e: KeyboardEvent): boolean {
  if (e.key === '/' && root) {
    e.preventDefault();
    $<HTMLInputElement>('#sh-q').focus();
    return true;
  }
  return false;
}
