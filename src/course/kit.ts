import type { IconName } from '../engine/icons';
import type { Pill, SceneFlow, SceneLink, SceneNode, Tone } from '../types';

/**
 * Authoring helpers for lessons. Scenes are plain data; these just make them
 * terse to write and keep positions readable.
 */

/**
 * Screen-oriented placement: `r` moves right (~40px per unit), `d` moves down
 * (~23px per unit). Converted to the board's isometric grid.
 */
export const at = (r: number, d: number): [number, number] => [(r + d) / 2, (d - r) / 2];

type Extra = Partial<Omit<SceneNode, 'id' | 'kind' | 'at'>>;

export const you = (id: string, r: number, d: number, extra: Extra = {}): SceneNode => ({
  id,
  kind: 'device',
  at: at(r, d),
  tone: 'sand',
  label: { text: 'you', icon: 'user' },
  ...extra,
});

export const crowd = (id: string, r: number, d: number, count: number, text: string, extra: Extra = {}): SceneNode => ({
  id,
  kind: 'crowd',
  at: at(r, d),
  tone: 'green',
  count,
  label: { text, icon: 'users' },
  ...extra,
});

export const box = (
  id: string,
  r: number,
  d: number,
  name: string,
  tone: Tone,
  ico: IconName,
  extra: Extra = {},
): SceneNode => ({ id, kind: 'block', at: at(r, d), name, tone, icon: ico, ...extra });

export const db = (id: string, r: number, d: number, name: string, extra: Extra = {}): SceneNode => ({
  id,
  kind: 'db',
  at: at(r, d),
  name,
  tone: 'purple',
  icon: 'db',
  ...extra,
});

export const disk = (id: string, r: number, d: number, name: string, extra: Extra = {}): SceneNode => ({
  id,
  kind: 'disk',
  at: at(r, d),
  name,
  tone: 'grey',
  icon: 'disk',
  ...extra,
});

export const zone = (id: string, r: number, d: number, w: number, dd: number, name: string, tone: Tone = 'sand'): SceneNode => ({
  id,
  kind: 'zone',
  at: at(r, d),
  size: [w, dd],
  name,
  tone,
});

/** Copy `nodes`, merging per-id overrides; `null` drops a node. */
export function patch(nodes: SceneNode[], over: Record<string, Extra | null>): SceneNode[] {
  return nodes
    .filter((n) => over[n.id] !== null)
    .map((n) => (over[n.id] ? { ...n, ...over[n.id] } : n));
}

export const link = (from: string, to: string, extra: Partial<SceneLink> = {}): SceneLink => ({ from, to, ...extra });

export const flow = (route: string[], extra: Partial<SceneFlow> = {}): SceneFlow => ({ route, ...extra });

export const pill = (text: string, ico?: IconName, tone?: Pill['tone']): Pill => ({ text, icon: ico, tone });

/**
 * Grid position on a ground-plane circle around `center` (grid coords). `deg` is a
 * screen angle: 0 = top of the screen, increasing clockwise.
 */
export function onRing(center: [number, number], radius: number, deg: number): [number, number] {
  const t = ((225 + deg) * Math.PI) / 180;
  return [center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)];
}

export const ring = (id: string, r: number, d: number, radius: number, name?: string, extra: Extra = {}): SceneNode => ({
  id,
  kind: 'ring',
  at: at(r, d),
  size: [radius, radius],
  name,
  tone: 'sand',
  ...extra,
});
