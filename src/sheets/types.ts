import type { IconName } from '../engine/icons';
import type { Tone } from '../types';

/**
 * Text fields may use `backticks` for inline code and **double asterisks** for bold;
 * everything else is escaped.
 */

export type CalcId = 'per-second' | 'nines' | 'littles' | 'fanout' | 'cache' | 'chain' | 'storage' | 'bandwidth';

export type Block =
  | { id: string; kind: 'table'; title: string; cols: string[]; rows: string[][]; note?: string }
  | { id: string; kind: 'list'; title: string; items: { term: string; text: string }[] }
  | { id: string; kind: 'formula'; title: string; items: { name: string; expr: string; note: string }[] }
  | { id: string; kind: 'steps'; title: string; items: string[] }
  | { id: string; kind: 'pitfalls'; title: string; items: string[] }
  | { id: string; kind: 'calc'; title: string; calc: CalcId };

export interface Sheet {
  id: string;
  title: string;
  tone: Tone;
  icon: IconName;
  blurb: string;
  blocks: Block[];
  refs: { slug: string; step: number; label: string }[];
}
