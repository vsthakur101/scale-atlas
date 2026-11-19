import { load, save } from '../store';
import type { Drill, Grade } from './types';

/** Per-drill history, kept in this browser only. */
export interface DrillRecord {
  attempts: number;
  right: number;
  last: Grade;
}

interface Streak {
  current: number;
  best: number;
}

let records = load<Record<string, DrillRecord>>('practice', {});
let streak = load<Streak>('practice-streak', { current: 0, best: 0 });

export function recordOf(id: string): DrillRecord | undefined {
  return records[id];
}

export function recordAnswer(id: string, grade: Grade): void {
  const prev = records[id] ?? { attempts: 0, right: 0, last: grade };
  records = { ...records, [id]: { attempts: prev.attempts + 1, right: prev.right + (grade === 'right' ? 1 : 0), last: grade } };
  save('practice', records);
  const current = grade === 'right' ? streak.current + 1 : 0;
  streak = { current, best: Math.max(streak.best, current) };
  save('practice-streak', streak);
}

export function getStreak(): Streak {
  return streak;
}

/** Share of a set's drills whose latest answer was right. */
export function mastery(drills: Drill[]): number {
  if (!drills.length) return 0;
  return drills.filter((d) => records[d.id]?.last === 'right').length / drills.length;
}

export function totals(): { attempted: number; answers: number; right: number } {
  const all = Object.values(records);
  return {
    attempted: all.length,
    answers: all.reduce((n, r) => n + r.attempts, 0),
    right: all.reduce((n, r) => n + r.right, 0),
  };
}

/**
 * Weighted sample for mixed review: drills last answered wrong are most likely,
 * unseen next, "close" after that, and ones you got right least.
 */
export function pickReview(pool: Drill[], n: number): Drill[] {
  const weight = (d: Drill) => {
    const r = records[d.id];
    if (!r) return 3;
    return r.last === 'wrong' ? 6 : r.last === 'close' ? 3 : 1;
  };
  const bag = pool.map((d) => ({ d, w: weight(d) }));
  const out: Drill[] = [];
  while (out.length < n && bag.length) {
    const total = bag.reduce((s, x) => s + x.w, 0);
    let roll = Math.random() * total;
    const i = bag.findIndex((x) => (roll -= x.w) <= 0);
    out.push(bag.splice(i < 0 ? bag.length - 1 : i, 1)[0]!.d);
  }
  return out;
}

export function resetPractice(): void {
  records = {};
  streak = { current: 0, best: 0 };
  save('practice', records);
  save('practice-streak', streak);
}
