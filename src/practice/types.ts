import type { MetricDef, Scene, Tone } from '../types';

/** The lesson step that teaches what a drill tests. */
export interface DrillRef {
  slug: string;
  step: number;
}

interface DrillBase {
  id: string;
  prompt: string;
  /** shown after answering, whatever the outcome */
  explain: string;
  ref: DrillRef;
  scene?: Scene;
  metrics?: MetricDef[];
}

/** Click the component on the diagram that answers the prompt. */
export interface SpotDrill extends DrillBase {
  kind: 'spot';
  scene: Scene;
  answer: string;
  /** optional feedback for specific wrong picks, keyed by node id */
  why?: Record<string, string>;
}

/** Pick one option; every option explains itself afterwards. */
export interface ChoiceDrill extends DrillBase {
  kind: 'choice';
  options: { text: string; correct?: boolean; why: string }[];
}

/** Type a number; graded by ratio to the answer (≤2× right, ≤10× close). */
export interface EstimateDrill extends DrillBase {
  kind: 'estimate';
  answer: number;
  unit: string;
  hint?: string;
}

export type Drill = SpotDrill | ChoiceDrill | EstimateDrill;

export interface DrillSet {
  id: string;
  title: string;
  tone: Tone;
  drills: Drill[];
}

export type Grade = 'right' | 'close' | 'wrong';
