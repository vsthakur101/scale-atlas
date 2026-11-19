import type { FlowKind, Pill, Scene, SceneFlow, SceneLink, SceneNode } from '../types';
import { svgIcon } from './icons';

/**
 * The isometric board: renders a Scene into an SVG, animates transitions between
 * scenes (keyed by node id) and runs the packet simulation for flows.
 *
 * Layers, back to front: grid · zones · links · packets · nodes (depth-sorted) · pills.
 * Packets travel at ground level, so they disappear "into" a node as they arrive.
 */

const S = 46; // px per grid unit
const C = Math.cos(Math.PI / 6);
const NS = 'http://www.w3.org/2000/svg';
const CHAR_W = 7.3; // JetBrains Mono at 12px, measured
const LINK_LIFT = 8;
const PACKET_SPEED = 210; // px / s

type Pt = { x: number; y: number };
type ViewBox = { x: number; y: number; w: number; h: number };

export const proj = (gx: number, gy: number): Pt => ({ x: (gx - gy) * C * S, y: (gx + gy) * 0.5 * S });

const DEFAULT_SIZE: Record<SceneNode['kind'], [number, number]> = {
  block: [1.7, 1.7],
  db: [1.5, 1.5],
  crowd: [2.8, 2.2],
  device: [2.3, 2.3],
  zone: [6, 6],
  disk: [1.6, 1.6],
  ring: [4, 4],
};
const DEFAULT_HEIGHT: Record<SceneNode['kind'], number> = {
  block: 50,
  db: 54,
  crowd: 10,
  device: 14,
  zone: 0,
  disk: 22,
  ring: 0,
};

const sizeOf = (n: SceneNode): [number, number] => n.size ?? DEFAULT_SIZE[n.kind];
const heightOf = (n: SceneNode): number => n.height ?? DEFAULT_HEIGHT[n.kind];

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pts = (...p: Pt[]): string => p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
const up = (p: Pt, h: number): Pt => ({ x: p.x, y: p.y - h });

/** footprint corners in local screen coords: back, right, front, left */
function corners(w: number, d: number): [Pt, Pt, Pt, Pt] {
  return [proj(-w / 2, -d / 2), proj(w / 2, -d / 2), proj(w / 2, d / 2), proj(-w / 2, d / 2)];
}

/** Half-extent of the footprint on screen — how far a link must stop short of the node. */
function radius(n: SceneNode): number {
  const [w, d] = sizeOf(n);
  if (n.kind === 'db') return w * S * 0.62;
  return ((w + d) / 2) * S * 0.62;
}

// ───────────────────────────── shapes ─────────────────────────────

function prism(w: number, d: number, h: number, cls = ''): string {
  const [b, r, f, l] = corners(w, d);
  return (
    `<polygon class="f-shadow" points="${pts({ x: b.x, y: b.y + 6 }, { x: r.x + 6, y: r.y + 6 }, { x: f.x, y: f.y + 8 }, { x: l.x - 2, y: l.y + 6 })}"/>` +
    `<polygon class="f-left ${cls}" points="${pts(l, f, up(f, h), up(l, h))}"/>` +
    `<polygon class="f-right ${cls}" points="${pts(f, r, up(r, h), up(f, h))}"/>` +
    `<polygon class="f-top ${cls}" points="${pts(up(b, h), up(r, h), up(f, h), up(l, h))}"/>`
  );
}

function blockShape(n: SceneNode): string {
  const [w, d] = sizeOf(n);
  const h = heightOf(n);
  let s = prism(w, d, h);
  // a seam on the top face reads as a lid and helps the eye find the 3D form
  const inset = corners(w - 0.5, d - 0.5).map((p) => up(p, h)) as [Pt, Pt, Pt, Pt];
  s += `<polygon class="f-seam" points="${pts(...inset)}"/>`;
  const topY = -h;
  if (n.icon) s += svgIcon(n.icon, 0, topY, 20);
  const textY = -h / 2 + (d * S) / 4 + 2;
  if (n.name) s += `<text class="n-name" x="0" y="${textY.toFixed(1)}">${esc(n.name)}</text>`;
  if (n.sub) s += `<text class="n-sub" x="0" y="${(textY + 14).toFixed(1)}">${esc(n.sub)}</text>`;
  return s;
}

function dbShape(n: SceneNode): string {
  const [w] = sizeOf(n);
  const h = heightOf(n);
  const rx = w * S * 0.6;
  const ry = rx * 0.5;
  const body = `M${-rx},${-h} L${-rx},0 A${rx},${ry} 0 0 0 ${rx},0 L${rx},${-h}`;
  const band = (y: number) => `<path class="f-seam" d="M${-rx},${y} A${rx},${ry} 0 0 0 ${rx},${y}"/>`;
  let s =
    `<ellipse class="f-shadow" cx="4" cy="6" rx="${rx + 2}" ry="${ry + 2}"/>` +
    `<path class="f-left" d="${body} Z"/>` +
    `<path class="f-right" d="M0,${-h} L0,${ry} A${rx},${ry} 0 0 0 ${rx},0 L${rx},${-h} Z" style="stroke:none"/>` +
    `<path class="f-outline" d="${body}"/>` +
    band(-h / 3) +
    band((-2 * h) / 3) +
    `<ellipse class="f-top" cx="0" cy="${-h}" rx="${rx}" ry="${ry}"/>`;
  if (n.icon) s += svgIcon(n.icon, 0, -h, 18);
  const textY = -h / 2 + ry * 0.55 + 8;
  if (n.name) s += `<text class="n-name" x="0" y="${textY}">${esc(n.name)}</text>`;
  if (n.sub) s += `<text class="n-sub" x="0" y="${textY + 14}">${esc(n.sub)}</text>`;
  return s;
}

function diskShape(n: SceneNode): string {
  const [w, d] = sizeOf(n);
  const h = heightOf(n);
  let s = prism(w, d, h);
  if (n.icon) s += svgIcon(n.icon, 0, -h, 16);
  if (n.name) s += `<text class="n-sub" x="0" y="${(d * S) / 4 + 8}">${esc(n.name)}</text>`;
  return s;
}

const FIGURE_TONES = ['#e9995c', '#87acdf', '#93c274', '#ae95dc', '#e6bb4f', '#e07b6d', '#6fc0b0'];

function crowdShape(n: SceneNode): string {
  const [w, d] = sizeOf(n);
  const h = heightOf(n);
  let s = prism(w, d, h);
  const want = Math.max(1, Math.min(n.count ?? 12, 24));
  const cols = Math.ceil(Math.sqrt(want * (w / d)));
  const rows = Math.ceil(want / cols);
  const figs: { p: Pt; i: number }[] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols && i < want; c++, i++) {
      const gx = -w / 2 + ((c + 0.5) * w) / cols;
      const gy = -d / 2 + ((r + 0.5) * d) / rows;
      figs.push({ p: up(proj(gx * 0.86, gy * 0.8), h), i });
    }
  }
  figs.sort((a, b) => a.p.y - b.p.y);
  for (const { p, i: k } of figs) {
    const col = FIGURE_TONES[k % FIGURE_TONES.length];
    s +=
      `<g class="fig" style="animation-delay:${(k % 7) * 0.13}s">` +
      `<rect x="${(p.x - 5).toFixed(1)}" y="${(p.y - 15).toFixed(1)}" width="10" height="14" rx="4" fill="${col}"/>` +
      `<circle cx="${p.x.toFixed(1)}" cy="${(p.y - 19).toFixed(1)}" r="4.3" class="fig-head"/></g>`;
  }
  return s;
}

function deviceShape(n: SceneNode): string {
  const [w, d] = sizeOf(n);
  const h = heightOf(n);
  let s = prism(w, d, h);
  const base = h + 3;
  const a = up(proj(-0.75, -0.55), base);
  const b = up(proj(0.75, -0.55), base);
  const c = up(proj(0.75, 0.55), base);
  const dd = up(proj(-0.75, 0.55), base);
  // keyboard deck
  s += `<polygon class="lap-deck" points="${pts(a, b, c, dd)}"/>`;
  const k1 = up(proj(-0.55, -0.2), base);
  const k2 = up(proj(0.55, -0.2), base);
  const k3 = up(proj(0.55, 0.25), base);
  const k4 = up(proj(-0.55, 0.25), base);
  s += `<polygon class="lap-keys" points="${pts(k1, k2, k3, k4)}"/>`;
  // screen hinged on the back-left edge (a→dd), leaning back slightly
  const lean = { x: -10, y: -2 };
  const sh = 46;
  const a2 = { x: a.x + lean.x, y: a.y - sh + lean.y };
  const d2 = { x: dd.x + lean.x, y: dd.y - sh + lean.y };
  s += `<polygon class="lap-lid" points="${pts(a, dd, d2, a2)}"/>`;
  const inset = (p: Pt, q: Pt, t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const sa = inset(inset(a, dd, 0.12), inset(a2, d2, 0.12), 0.12);
  const sd = inset(inset(a, dd, 0.88), inset(a2, d2, 0.88), 0.12);
  const sd2 = inset(inset(a, dd, 0.88), inset(a2, d2, 0.88), 0.9);
  const sa2 = inset(inset(a, dd, 0.12), inset(a2, d2, 0.12), 0.9);
  s += `<polygon class="lap-screen" points="${pts(sa, sd, sd2, sa2)}"/>`;
  const bar1 = inset(inset(sa, sd, 0.1), inset(sa2, sd2, 0.1), 0.78);
  const bar2 = inset(inset(sa, sd, 0.85), inset(sa2, sd2, 0.85), 0.78);
  s += `<line class="lap-bar" x1="${bar1.x}" y1="${bar1.y}" x2="${bar2.x}" y2="${bar2.y}"/>`;
  return s;
}

function zoneShape(n: SceneNode): string {
  const [w, d] = sizeOf(n);
  const [b, r, f, l] = corners(w, d);
  let s = `<polygon class="zone-fill" points="${pts(b, r, f, l)}"/>`;
  if (n.name) {
    s += `<text class="zone-name" x="${b.x.toFixed(1)}" y="${(b.y + 26).toFixed(1)}" text-anchor="middle">${esc(n.name)}</text>`;
  }
  return s;
}

/** A circle on the ground plane (radius = size[0] grid units), e.g. a hash ring. */
function ringShape(n: SceneNode): string {
  const [rad] = sizeOf(n);
  const rx = Math.SQRT2 * C * S * rad;
  const ry = Math.SQRT2 * 0.5 * S * rad;
  let s = `<ellipse class="ring-fill" cx="0" cy="0" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"/>`;
  s += `<ellipse class="ring-line" cx="0" cy="0" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"/>`;
  if (n.name) s += `<text class="zone-name" x="0" y="4" text-anchor="middle">${esc(n.name)}</text>`;
  if (n.sub) s += `<text class="n-sub" x="0" y="20">${esc(n.sub)}</text>`;
  return s;
}

function shapeFor(n: SceneNode): string {
  switch (n.kind) {
    case 'ring':
      return ringShape(n);
    case 'block':
      return blockShape(n);
    case 'db':
      return dbShape(n);
    case 'crowd':
      return crowdShape(n);
    case 'device':
      return deviceShape(n);
    case 'disk':
      return diskShape(n);
    case 'zone':
      return zoneShape(n);
  }
}

function stateBadge(n: SceneNode): string {
  if (n.state !== 'down') return '';
  const h = heightOf(n);
  return `<g class="down-badge" transform="translate(0 ${-h - 8})"><circle r="11"/><path d="M-4.5,-4.5 L4.5,4.5 M4.5,-4.5 L-4.5,4.5"/></g>`;
}

// ───────────────────────────── pills ─────────────────────────────

function pillWidth(p: Pill): number {
  return p.text.length * CHAR_W + (p.icon ? 34 : 18);
}

function pillMarkup(p: Pill, cx: number, cy: number): string {
  const w = pillWidth(p);
  const x0 = cx - w / 2;
  const tone = p.tone ?? 'default';
  let s = `<g class="pill pill-${tone}"><rect x="${x0.toFixed(1)}" y="${(cy - 12).toFixed(1)}" width="${w.toFixed(1)}" height="24" rx="12"/>`;
  let tx = cx;
  if (p.icon) {
    s += svgIcon(p.icon, x0 + 15, cy, 14);
    tx = cx + 8;
  }
  s += `<text x="${tx.toFixed(1)}" y="${(cy + 4).toFixed(1)}">${esc(p.text)}</text></g>`;
  return s;
}

function loadMarkup(load: number, cx: number, cy: number): string {
  const v = Math.max(0, Math.min(100, Math.round(load)));
  const w = 86;
  const x0 = cx - w / 2;
  const tone = v >= 85 ? 'bad' : v >= 65 ? 'warn' : 'good';
  return (
    `<g class="loadpill load-${tone}"><rect class="lp-bg" x="${x0}" y="${cy - 11}" width="${w}" height="22" rx="11"/>` +
    svgIcon('cpu', x0 + 13, cy, 12) +
    `<rect class="lp-track" x="${x0 + 23}" y="${cy - 3}" width="28" height="6" rx="3"/>` +
    `<rect class="lp-fill" x="${x0 + 23}" y="${cy - 3}" width="${(28 * v) / 100}" height="6" rx="3"/>` +
    `<text x="${x0 + 68}" y="${cy + 4}">${v}%</text></g>`
  );
}

function pillsFor(n: SceneNode): string {
  if (n.kind === 'zone') return '';
  if (n.kind === 'ring') return n.tag ? pillMarkup(n.tag, 0, -Math.SQRT2 * 0.5 * S * sizeOf(n)[0] - 26) : '';
  const [w, d] = sizeOf(n);
  const h = heightOf(n);
  const halfDown = ((w + d) / 2) * 0.5 * S;
  let s = '';
  let topY = -h - halfDown - (n.kind === 'device' ? 52 : 18);
  if (n.kind === 'crowd') topY -= 22;
  if (n.kind === 'db') topY = -h - w * S * 0.3 - 20;
  if (n.load !== undefined) {
    s += loadMarkup(n.load, 0, topY);
    topY -= 28;
  }
  if (n.tag) s += pillMarkup(n.tag, 0, topY);
  if (n.label) s += pillMarkup(n.label, 0, halfDown + 22);
  return s;
}

// ───────────────────────────── flows ─────────────────────────────

interface Packet {
  path: Pt[];
  lens: number[];
  total: number;
  t: number; // px travelled
  kind: FlowKind;
  el: SVGCircleElement;
  then?: { path: Pt[]; kind: FlowKind };
  speed: number;
  failAt?: number;
}

interface FlowRuntime {
  flow: SceneFlow;
  acc: number;
  path: Pt[];
}

function polyLen(path: Pt[]): { lens: number[]; total: number } {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(l);
    total += l;
  }
  return { lens, total };
}

function pointAt(path: Pt[], lens: number[], t: number): Pt {
  let rem = t;
  for (let i = 0; i < lens.length; i++) {
    const l = lens[i]!;
    if (rem <= l) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const k = l === 0 ? 0 : rem / l;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    rem -= l;
  }
  return path[path.length - 1]!;
}

// ───────────────────────────── board ─────────────────────────────

let boardSeq = 0;

export class Board {
  readonly svg: SVGSVGElement;
  private zones: SVGGElement;
  private links: SVGGElement;
  private packets: SVGGElement;
  private linkLabels: SVGGElement;
  private nodes: SVGGElement;
  private pills: SVGGElement;
  private scene: Scene | null = null;
  private pos = new Map<string, Pt>();
  private flows: FlowRuntime[] = [];
  private live: Packet[] = [];
  private raf = 0;
  private last = 0;
  private paused = false;
  private vb: ViewBox = { x: -400, y: -260, w: 800, h: 520 };
  private vbTween: { from: ViewBox; to: ViewBox; start: number } | null = null;
  private reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** ids for <defs> are per-board: a url(#…) into a hidden SVG renders nothing */
  private uid = `b${++boardSeq}`;
  private clickHandler: ((id: string) => void) | null = null;

  constructor(host: HTMLElement) {
    host.innerHTML = '';
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.classList.add('board');
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.setAttribute('role', 'img');
    const tw = 2 * C * S;
    this.svg.innerHTML =
      `<defs><pattern id="${this.uid}-grid" width="${tw}" height="${S}" patternUnits="userSpaceOnUse">` +
      `<path d="M0,${S / 2} L${tw / 2},0 L${tw},${S / 2} L${tw / 2},${S} Z" class="grid-line"/></pattern>` +
      `<marker id="${this.uid}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" class="arrow-head"/></marker></defs>` +
      `<rect class="grid-bg" x="-3000" y="-3000" width="6000" height="6000" fill="url(#${this.uid}-grid)"/>`;
    const layer = (cls: string) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', cls);
      this.svg.appendChild(g);
      return g;
    };
    this.zones = layer('l-zones');
    this.links = layer('l-links');
    this.packets = layer('l-packets');
    this.nodes = layer('l-nodes');
    this.linkLabels = layer('l-linklabels');
    this.pills = layer('l-pills');
    host.appendChild(this.svg);
    this.applyViewBox(this.vb);
    this.svg.addEventListener('click', (e) => {
      if (!this.clickHandler) return;
      const g = (e.target as Element).closest<SVGGElement>('.l-nodes > g.node, .l-pills > g.pillset');
      const id = g?.dataset.id;
      if (id) this.clickHandler(id);
    });
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Make nodes clickable (practice drills). Pass null to turn it off. */
  setClickHandler(fn: ((id: string) => void) | null): void {
    this.clickHandler = fn;
    this.svg.classList.toggle('clickable', !!fn);
  }

  /** Outline a node as a right or wrong pick; null clears it. */
  mark(id: string, tone: 'good' | 'bad' | null): void {
    const g = this.nodes.querySelector<SVGGElement>(`:scope > g[data-id="${CSS.escape(id)}"]`);
    if (!g) return;
    g.classList.remove('mark-good', 'mark-bad');
    if (tone) g.classList.add(`mark-${tone}`);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.svg.remove();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.svg.classList.toggle('is-paused', p);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Re-run the current scene from scratch: entrance animations and empty wires. */
  replay(): void {
    if (!this.scene) return;
    const s = this.scene;
    this.scene = null;
    this.pos.clear();
    this.nodes.innerHTML = '';
    this.pills.innerHTML = '';
    this.zones.innerHTML = '';
    this.render(s);
  }

  render(scene: Scene): void {
    const prev = this.scene;
    this.scene = scene;
    const byId = new Map(scene.nodes.map((n) => [n.id, n] as const));

    // nodes: keyed diff so shared ids glide to their new spot
    const keep = new Set<string>();
    for (const n of scene.nodes) {
      keep.add(n.id);
      const p = proj(n.at[0], n.at[1]);
      const layer = n.kind === 'zone' || n.kind === 'ring' ? this.zones : this.nodes;
      let g = layer.querySelector<SVGGElement>(`:scope > g[data-id="${CSS.escape(n.id)}"]`);
      const fresh = !g;
      if (!g) {
        g = document.createElementNS(NS, 'g');
        g.dataset.id = n.id;
        layer.appendChild(g);
      }
      g.setAttribute('class', `node k-${n.kind} tone-${n.tone ?? 'sand'} st-${n.state ?? 'ok'}${fresh && prev ? ' entering' : fresh ? ' entering first' : ''}`);
      g.style.transform = `translate(${p.x}px, ${p.y}px)`;
      g.dataset.depth = String(n.at[0] + n.at[1]);
      const inner = `<g class="node-body">${shapeFor(n)}${stateBadge(n)}</g>`;
      if (g.dataset.sig !== inner) {
        g.innerHTML = inner;
        g.dataset.sig = inner;
      }
      if (fresh) {
        g.addEventListener('animationend', () => g?.classList.remove('entering', 'first'), { once: true });
      }

      let pg = this.pills.querySelector<SVGGElement>(`:scope > g[data-id="${CSS.escape(n.id)}"]`);
      if (!pg) {
        pg = document.createElementNS(NS, 'g');
        pg.dataset.id = n.id;
        pg.setAttribute('class', 'pillset entering');
        pg.addEventListener('animationend', () => pg?.classList.remove('entering'), { once: true });
        this.pills.appendChild(pg);
      }
      pg.style.transform = `translate(${p.x}px, ${p.y}px)`;
      const pm = pillsFor(n);
      if (pg.dataset.sig !== pm) {
        pg.innerHTML = pm;
        pg.dataset.sig = pm;
        if (!fresh) {
          pg.classList.remove('changed');
          pg.getBoundingClientRect(); // restart the highlight animation
          pg.classList.add('changed');
        }
      }
      this.pos.set(n.id, p);
    }
    for (const layer of [this.nodes, this.zones, this.pills]) {
      for (const g of Array.from(layer.children) as SVGGElement[]) {
        const id = g.dataset.id;
        if (id && !keep.has(id) && !g.classList.contains('leaving')) {
          g.classList.add('leaving');
          setTimeout(() => g.remove(), 260);
          this.pos.delete(id);
        }
      }
    }
    // painter's order
    const sorted = (Array.from(this.nodes.children) as SVGGElement[]).sort(
      (a, b) => Number(a.dataset.depth ?? 0) - Number(b.dataset.depth ?? 0),
    );
    for (const g of sorted) this.nodes.appendChild(g);

    this.renderLinks(scene.links ?? [], byId);
    this.resetFlows(scene.flows ?? [], byId);
    this.fit(scene, !prev);
  }

  private anchor(n: SceneNode): Pt {
    const p = proj(n.at[0], n.at[1]);
    return { x: p.x, y: p.y - LINK_LIFT };
  }

  private renderLinks(links: SceneLink[], byId: Map<string, SceneNode>): void {
    let s = '';
    let labels = '';
    for (const l of links) {
      const a = byId.get(l.from);
      const b = byId.get(l.to);
      if (!a || !b) continue;
      const pa = this.anchor(a);
      const pb = this.anchor(b);
      const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
      const ux = (pb.x - pa.x) / len;
      const uy = (pb.y - pa.y) / len;
      const ra = radius(a) + 4;
      const rb = radius(b) + 6;
      const x1 = pa.x + ux * ra;
      const y1 = pa.y + uy * ra;
      const x2 = pb.x - ux * rb;
      const y2 = pb.y - uy * rb;
      const arrow = l.arrow ?? 'end';
      const ms = arrow === 'both' ? ` marker-start="url(#${this.uid}-arrow)"` : '';
      const me = arrow !== 'none' ? ` marker-end="url(#${this.uid}-arrow)"` : '';
      s += `<line class="link link-${l.style ?? 'solid'}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"${ms}${me}/>`;
      if (l.style === 'broken') {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        s += `<g class="link-break" transform="translate(${mx.toFixed(1)} ${my.toFixed(1)})"><circle r="9"/><path d="M-3.5,-3.5 L3.5,3.5 M3.5,-3.5 L-3.5,3.5"/></g>`;
      }
      if (l.label) labels += pillMarkup(l.label, (x1 + x2) / 2, (y1 + y2) / 2 + (l.style === 'broken' ? 24 : 0));
    }
    if (this.links.dataset.sig !== s + labels) {
      this.links.innerHTML = s;
      this.linkLabels.innerHTML = labels;
      this.links.dataset.sig = s + labels;
      for (const g of [this.links, this.linkLabels]) {
        g.classList.remove('fade-in');
        g.getBoundingClientRect();
        g.classList.add('fade-in');
      }
    }
  }

  private resetFlows(flows: SceneFlow[], byId: Map<string, SceneNode>): void {
    for (const p of this.live) p.el.remove();
    this.live = [];
    this.flows = [];
    for (const f of flows) {
      const path = f.route.map((id) => byId.get(id)).filter((n): n is SceneNode => !!n).map((n) => this.anchor(n));
      if (path.length < 2) continue;
      // stagger first packets so parallel flows don't fire in lockstep
      this.flows.push({ flow: f, acc: 0.55 + Math.random() * 0.4, path });
    }
  }

  private spawn(fr: FlowRuntime): void {
    const kind = fr.flow.kind ?? 'request';
    const el = document.createElementNS(NS, 'circle');
    el.setAttribute('class', `pkt pkt-${kind}`);
    el.setAttribute('r', kind === 'heavy' ? '6.5' : '4.6');
    this.packets.appendChild(el);
    const { lens, total } = polyLen(fr.path);
    const pk: Packet = {
      path: fr.path,
      lens,
      total,
      t: 0,
      kind,
      el,
      speed: PACKET_SPEED * (fr.flow.speed ?? 1) * (kind === 'heavy' ? 0.6 : 1),
    };
    if (kind === 'fail') pk.failAt = total - (lens[lens.length - 1] ?? 0) * 0.45;
    if (fr.flow.back) pk.then = { path: [...fr.path].reverse(), kind: 'response' };
    this.live.push(pk);
  }

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    this.stepViewBox(now);
    if (this.paused || this.reduceMotion) return;
    if (!this.svg.isConnected || this.svg.getBoundingClientRect().width === 0) return;

    for (const fr of this.flows) {
      fr.acc += dt * (fr.flow.rate ?? 1.2);
      while (fr.acc >= 1) {
        fr.acc -= 1;
        if (this.live.length < 220) this.spawn(fr);
      }
    }
    const done: Packet[] = [];
    for (const p of this.live) {
      p.t += p.speed * dt;
      if (p.failAt !== undefined && p.t >= p.failAt) {
        const at = pointAt(p.path, p.lens, p.failAt);
        this.burst(at);
        done.push(p);
        continue;
      }
      if (p.t >= p.total) {
        if (p.then) {
          const nxt = p.then;
          const { lens, total } = polyLen(nxt.path);
          p.path = nxt.path;
          p.lens = lens;
          p.total = total;
          p.t = 0;
          p.kind = nxt.kind;
          p.el.setAttribute('class', `pkt pkt-${nxt.kind}`);
          p.el.setAttribute('r', '4.6');
          delete p.then;
        } else {
          done.push(p);
          continue;
        }
      }
      const at = pointAt(p.path, p.lens, p.t);
      p.el.setAttribute('cx', at.x.toFixed(1));
      p.el.setAttribute('cy', at.y.toFixed(1));
    }
    if (done.length) {
      for (const p of done) p.el.remove();
      this.live = this.live.filter((p) => !done.includes(p));
    }
  };

  private burst(at: Pt): void {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'burst');
    g.setAttribute('transform', `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
    g.innerHTML = '<circle r="7"/><path d="M-3,-3 L3,3 M3,-3 L-3,3"/>';
    this.packets.appendChild(g);
    setTimeout(() => g.remove(), 600);
  }

  // ─────────── framing ───────────

  private fit(scene: Scene, instant: boolean): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of scene.nodes) {
      const p = proj(n.at[0], n.at[1]);
      const [w, d] = sizeOf(n);
      const h = heightOf(n);
      const ringK = n.kind === 'ring' ? Math.SQRT2 : 1;
      const half = ((w + d) / 2) * C * S * ringK;
      const halfDown = ((w + d) / 2) * 0.5 * S * ringK;
      let top = p.y - h - halfDown - 20;
      if (n.tag) top -= 30;
      if (n.load !== undefined) top -= 28;
      if (n.kind === 'device') top -= 50;
      const bottom = p.y + halfDown + (n.label ? 40 : 12);
      const extra = Math.max(n.tag ? pillWidth(n.tag) / 2 : 0, n.label ? pillWidth(n.label) / 2 : 0);
      minX = Math.min(minX, p.x - Math.max(half, extra));
      maxX = Math.max(maxX, p.x + Math.max(half, extra));
      minY = Math.min(minY, top);
      maxY = Math.max(maxY, bottom);
    }
    if (!Number.isFinite(minX)) return;
    const pad = 36;
    let w = maxX - minX + pad * 2;
    let h = maxY - minY + pad * 2;
    // never zoom in past "comfortable": small scenes stay small
    const minW = 680;
    const minH = 440;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    w = Math.max(w, minW);
    h = Math.max(h, minH);
    const to = { x: cx - w / 2, y: cy - h / 2, w, h };
    if (instant || this.reduceMotion) {
      this.vb = to;
      this.vbTween = null;
      this.applyViewBox(to);
    } else {
      this.vbTween = { from: { ...this.vb }, to, start: performance.now() };
    }
  }

  private stepViewBox(now: number): void {
    if (!this.vbTween) return;
    const { from, to, start } = this.vbTween;
    const k = Math.min(1, (now - start) / 600);
    const e = 1 - Math.pow(1 - k, 3);
    const lerp = (a: number, b: number) => a + (b - a) * e;
    this.vb = { x: lerp(from.x, to.x), y: lerp(from.y, to.y), w: lerp(from.w, to.w), h: lerp(from.h, to.h) };
    this.applyViewBox(this.vb);
    if (k >= 1) this.vbTween = null;
  }

  private applyViewBox(v: { x: number; y: number; w: number; h: number }): void {
    this.svg.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`);
  }
}
