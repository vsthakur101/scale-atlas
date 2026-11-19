import type { IconName } from './engine/icons';

export type Tone = 'sand' | 'blue' | 'orange' | 'green' | 'purple' | 'red' | 'teal' | 'grey' | 'yellow';

export type NodeKind = 'block' | 'db' | 'crowd' | 'device' | 'zone' | 'disk';

export type PillTone = 'default' | 'good' | 'bad' | 'warn' | 'accent';

export interface Pill {
  text: string;
  icon?: IconName;
  tone?: PillTone;
}

export type NodeState = 'ok' | 'down' | 'hot' | 'ghost' | 'dim';

/** One thing on the isometric board. `at` is in grid units; the board projects it. */
export interface SceneNode {
  id: string;
  kind: NodeKind;
  at: [number, number];
  /** footprint in grid units (width along x, depth along y) */
  size?: [number, number];
  /** extrusion height in px (blocks, cylinders) */
  height?: number;
  tone?: Tone;
  name?: string;
  sub?: string;
  icon?: IconName;
  /** pill under the node */
  label?: Pill;
  /** pill above the node */
  tag?: Pill;
  /** 0–100, renders a load bar above the node */
  load?: number;
  state?: NodeState;
  /** crowd: number of figures to draw (capped) */
  count?: number;
}

export type LinkStyle = 'solid' | 'dashed' | 'broken';

export interface SceneLink {
  from: string;
  to: string;
  label?: Pill;
  style?: LinkStyle;
  arrow?: 'end' | 'both' | 'none';
}

export type FlowKind = 'request' | 'response' | 'handshake' | 'heavy' | 'fail' | 'write' | 'hit';

export interface SceneFlow {
  /** node ids the packet visits, in order */
  route: string[];
  kind?: FlowKind;
  /** packets per second */
  rate?: number;
  /** after arriving, return along the same route as a response packet */
  back?: boolean;
  /** packet speed multiplier (1 = default) */
  speed?: number;
}

export interface MetricValue {
  v: string;
  tone?: 'good' | 'bad' | 'warn';
}

export interface Scene {
  nodes: SceneNode[];
  links?: SceneLink[];
  flows?: SceneFlow[];
  metrics?: Record<string, string | MetricValue>;
}

export type StepKind = 'problem' | 'technique' | 'insight' | 'case' | 'tradeoff' | 'recap';

export interface StepNote {
  kind: 'key' | 'tip' | 'warn';
  text: string;
}

export interface StepChange {
  text: string;
  tone?: 'good' | 'bad' | 'info';
}

export interface Concept {
  term: string;
  def: string;
}

export interface Step {
  /** label under the stepper dot (keep to ~12 chars) */
  short: string;
  kind: StepKind;
  title: string;
  /** paragraphs; may contain <b>, <code>, <i> */
  body: string[];
  note?: StepNote;
  changes?: StepChange[];
  concepts?: Concept[];
  scene: Scene;
}

export interface MetricDef {
  key: string;
  label: string;
  icon: IconName;
}

export interface Goal {
  text: string;
  /** 1-based step that teaches it */
  step: number;
}

export type Level = 'Beginner' | 'Intermediate' | 'Advanced';

export interface Lesson {
  slug: string;
  title: string;
  blurb: string;
  minutes: number;
  level: Level;
  metrics: MetricDef[];
  goals: Goal[];
  legend: FlowKind[];
  steps: Step[];
}

export interface LessonRef {
  slug: string;
  title: string;
  load?: () => Promise<{ default: Lesson }>;
}

export interface ModuleDef {
  id: string;
  title: string;
  tone: Tone;
  lessons: LessonRef[];
}
