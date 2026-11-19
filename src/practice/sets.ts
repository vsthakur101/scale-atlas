import { MODULES } from '../course/catalog';
import { architecture, cases, security, shipping } from './drills-advanced';
import { communication, data, foundations, reliability, scaling } from './drills-core';
import type { Drill, DrillSet } from './types';

const BY_MODULE: Record<string, Drill[]> = {
  foundations,
  scaling,
  data,
  communication,
  reliability,
  architecture,
  security,
  shipping,
  cases,
};

/** One drill set per course module, in course order. */
export const SETS: DrillSet[] = MODULES.map((m) => ({
  id: m.id,
  title: m.title,
  tone: m.tone,
  drills: BY_MODULE[m.id] ?? [],
})).filter((s) => s.drills.length > 0);

export const ALL_DRILLS: Drill[] = SETS.flatMap((s) => s.drills);

export const MIX_ID = 'mix';
export const MIX_SIZE = 8;

export function setOf(drill: Drill): DrillSet | undefined {
  return SETS.find((s) => s.drills.includes(drill));
}
