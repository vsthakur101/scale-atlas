/**
 * Per-viewer persistence. Everything here is a convenience: storage can be blocked
 * (private mode, sandboxed previews) so every access is guarded and has a default.
 */
const PREFIX = 'atlas:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the session still works, it just won't remember */
  }
}

export interface LessonProgress {
  /** highest 1-based step reached */
  max: number;
  done: boolean;
}

type ProgressMap = Record<string, LessonProgress>;

let progress: ProgressMap = load<ProgressMap>('progress', {});
const listeners = new Set<() => void>();

export function getProgress(slug: string): LessonProgress {
  return progress[slug] ?? { max: 0, done: false };
}

export function markStep(slug: string, step: number, total: number): void {
  const cur = getProgress(slug);
  const next: LessonProgress = { max: Math.max(cur.max, step), done: cur.done || step >= total };
  if (next.max === cur.max && next.done === cur.done) return;
  progress = { ...progress, [slug]: next };
  save('progress', progress);
  listeners.forEach((fn) => fn());
}

export function resetProgress(): void {
  progress = {};
  save('progress', progress);
  listeners.forEach((fn) => fn());
}

export function onProgress(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
