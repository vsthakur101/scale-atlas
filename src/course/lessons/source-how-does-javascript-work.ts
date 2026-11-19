import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const stack = (extra: Partial<SceneNode> = {}) => box('stack', -6, 0, 'Call stack (one thread)', 'purple', 'cpu', { size: [1.5, 1.5], height: 34, ...extra });
const loop = (extra: Partial<SceneNode> = {}) => box('loop', -14, 0, 'Event loop', 'orange', 'refresh', { size: [1.3, 1.3], height: 26, ...extra });
const micro = (extra: Partial<SceneNode> = {}) => box('micro', 3, -6, 'Microtask queue', 'teal', 'queue', { size: [1.6, 1], height: 14, ...extra });
const tasks = (extra: Partial<SceneNode> = {}) => box('tasks', 3, 0, 'Task queue (timers, events, I/O)', 'yellow', 'queue', { size: [1.8, 1], height: 14, ...extra });
const render = (extra: Partial<SceneNode> = {}) => box('render', 3, 6, 'Rendering (every ~16.7 ms)', 'green', 'bolt', { size: [1.6, 1], height: 16, ...extra });
const web = (extra: Partial<SceneNode> = {}) => db('web', 13, 0, 'Web APIs (timers, fetch, DOM events)', { size: [1.4, 1.4], ...extra });

const fmtMs = (ms: number): string => `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;

const lesson: Lesson = {
  slug: 'source-how-does-javascript-work',
  title: 'How JavaScript Runs: The Event Loop and the Main Thread',
  blurb: 'One thread, a call stack, task and microtask queues, and a renderer that waits its turn — why a long task freezes a page and how yielding keeps input responsive.',
  minutes: 12,
  level: 'Intermediate',
  metrics: [
    { key: 'budget', label: 'Frame budget', icon: 'clock' },
    { key: 'drop', label: 'Frames dropped by one long task', icon: 'alert' },
    { key: 'delay', label: 'Average input delay if a click lands during it', icon: 'activity' },
    { key: 'busy', label: 'Main thread busy with long tasks', icon: 'gauge' },
    { key: 'worst', label: 'Worst-case delay when the work is chunked', icon: 'check' },
  ],
  goals: [
    { text: 'A single thread with a call stack and run-to-completion', step: 1 },
    { text: 'How asynchronous work uses queues and Web APIs', step: 2 },
    { text: 'Tasks vs microtasks and ordering', step: 3 },
    { text: 'How long tasks block rendering and input', step: 4 },
    { text: 'Yielding, workers and keeping the thread free', step: 5 },
  ],
  legend: ['request', 'response', 'heavy', 'fail'],
  dynamic: {
    parameters: [
      { key: 'task', label: 'Long task duration', min: 1, max: 2000, step: 1, default: 120, unit: ' ms', description: 'A synchronous block of JavaScript (parsing JSON, rendering a big list, a loop).' },
      { key: 'hz', label: 'Display refresh rate', min: 30, max: 240, step: 1, default: 60, unit: ' Hz', description: 'Frames the browser tries to produce per second.' },
      { key: 'freq', label: 'Long tasks per second', min: 0, max: 20, step: 0.1, default: 2, unit: '/s', description: 'How often such a task occurs.' },
      { key: 'chunk', label: 'Chunk size when yielding', min: 1, max: 200, step: 1, default: 12, unit: ' ms', description: 'Length of each slice if the same work is split with yields.' },
    ],
    calculate: (input, step) => {
      const t = Math.max(0.1, input.task ?? 120);
      const hz = Math.max(1, input.hz ?? 60);
      const freq = Math.max(0, input.freq ?? 2);
      const chunk = Math.max(0.5, input.chunk ?? 12);
      const frame = 1000 / hz;
      const dropped = Math.max(0, Math.floor(t / frame));
      // A click arriving at a uniformly random moment within a busy period waits, on average, half of it.
      const avgDelay = t / 2;
      const busy = Math.min(1, (freq * t) / 1000);
      return {
        budget: step < 1 ? { v: '—' } : { v: `${fmtMs(frame)} (${hz} Hz)` },
        drop: step < 3 ? { v: '—' } : { v: `${dropped}`, tone: dropped === 0 ? 'good' : dropped < 4 ? 'warn' : 'bad' },
        delay: step < 3 ? { v: '—' } : { v: fmtMs(avgDelay), tone: avgDelay < 50 ? 'good' : avgDelay < 200 ? 'warn' : 'bad' },
        busy: step < 3 ? { v: '—' } : { v: `${(busy * 100).toFixed(0)}%`, tone: busy < 0.2 ? 'good' : busy < 0.5 ? 'warn' : 'bad' },
        worst: step < 4 ? { v: '—' } : { v: `${fmtMs(Math.min(chunk, t))} (vs ${fmtMs(t)} unchunked)`, tone: Math.min(chunk, t) <= 50 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'One thread',
      kind: 'insight',
      title: 'JavaScript runs on one thread, one job at a time',
      body: [
        'A JavaScript engine (V8, SpiderMonkey, JavaScriptCore) executes code on a single <b>call stack</b>: functions push frames and pop them when they return. A running function <b>runs to completion</b> — nothing can interrupt it, not a timer, not a click, not a network response — which makes shared state simple (no data races within a thread) and makes <i>any long computation</i> stall everything else on that thread.',
        'In a browser that thread is the <b>main thread</b>, shared with <b>DOM updates, style, layout, painting and user input handling</b> (see the browser rendering lesson). Node.js has the same single-threaded JavaScript model, which is why one slow request handler delays every other request. The event loop is what decides what runs next.',
      ],
      scene: { nodes: [stack({ tag: pill('runs to completion', 'lock') }), loop({ tag: pill('picks the next job', 'refresh') })], links: [link('loop', 'stack', { arrow: 'both' })], flows: [flow(['loop', 'stack'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Async',
      kind: 'technique',
      title: 'Asynchrony: hand the waiting to the platform',
      body: [
        '<code>setTimeout</code>, <code>fetch</code>, DOM events and file I/O aren’t part of the language: they are <b>Web APIs</b> (or Node’s libuv) implemented outside the JavaScript thread, typically in the browser’s network and timer machinery. Your code starts the operation and returns immediately with a callback or promise; when the operation completes, the platform puts a <b>task</b> on a queue.',
        'The <b>event loop</b> repeats: when the call stack is empty, take the next task from a queue and run it to completion. So “asynchronous” means <i>not blocked while waiting</i>, not <i>parallel</i>: while 1,000 requests are in flight the thread is free, but the moment a response arrives its callback needs the stack to itself. This is why a single thread can serve many concurrent I/O operations (see the C10K lesson).',
      ],
      changes: [{ text: 'I/O runs in the platform; completion enqueues a task', tone: 'info' }, { text: 'Async = not waiting, not parallel', tone: 'info' }],
      scene: { nodes: [stack(), web({ tag: pill('timers · network · DOM events', 'globe') }), tasks({ tag: pill('callback waits its turn', 'queue') }), loop()], links: [link('stack', 'web', { style: 'dashed' }), link('web', 'tasks'), link('tasks', 'loop'), link('loop', 'stack')], flows: [flow(['web', 'tasks', 'loop', 'stack'], { rate: 1.5 })] },
    },
    {
      short: 'Micro vs macro',
      kind: 'technique',
      title: 'Tasks, microtasks and the order things run',
      body: [
        'There are two kinds of queued work. <b>Tasks</b> (macrotasks): timers, UI events, message events, I/O completions — the loop takes <i>one</i> per turn. <b>Microtasks</b>: promise reactions (<code>.then</code>, <code>await</code> continuations), <code>queueMicrotask</code>, mutation observers — after <i>each</i> task (and whenever the stack empties) the engine <b>drains the whole microtask queue</b> before anything else, including rendering.',
        'Consequences: <code>Promise.resolve().then(a)</code> runs <i>before</i> <code>setTimeout(b, 0)</code>; a microtask that keeps scheduling more microtasks <b>starves</b> rendering and input just like a synchronous loop; and <code>await</code> doesn’t yield to rendering — it only defers to the end of the current microtask checkpoint. After the microtasks the browser may <b>render</b> (about once per frame, ~16.7 ms at 60 Hz), running <code>requestAnimationFrame</code> callbacks first.',
      ],
      changes: [{ text: 'task → drain ALL microtasks → maybe render → next task', tone: 'info' }, { text: 'Endless microtasks starve rendering', tone: 'bad' }],
      scene: { nodes: [loop(), stack(), micro({ tag: pill('drained completely', 'check') }), tasks({ tag: pill('one per turn', 'queue') }), render({ tag: pill('between tasks, ~per frame', 'bolt') })], links: [link('loop', 'stack'), link('micro', 'stack'), link('tasks', 'stack'), link('render', 'loop', { style: 'dashed' })], flows: [flow(['micro', 'stack'], { rate: 1.5 })] },
    },
    {
      short: 'Long tasks',
      kind: 'problem',
      title: 'A long task freezes rendering and input',
      body: [
        'At 60 Hz the browser has <b>16.7 ms per frame</b> to run JavaScript, style, layout and paint. A synchronous task of 120 ms occupies the thread for about <b>7 frames</b>: nothing is painted (animation freezes), and a click or keypress that arrives meanwhile is queued — on average it waits <b>half the task, 60 ms</b>, and in the worst case all of it. The browser flags tasks over <b>50 ms</b> as “long tasks” and measures responsiveness with INP (interaction to next paint).',
        'Typical culprits: parsing or transforming a huge JSON payload, rendering thousands of DOM nodes at once, synchronous loops over large arrays, heavy framework re-renders, and third-party scripts. In Node the same task blocks <i>every</i> request: at 2 such tasks a second the thread is <b>24% busy</b> with them alone.',
      ],
      changes: [{ text: '120 ms task ≈ 7 dropped frames at 60 Hz', tone: 'bad' }, { text: 'Click arrives mid-task: waits ~60 ms on average', tone: 'bad' }],
      scene: { nodes: [stack({ state: 'hot', load: 100, tag: pill('120 ms synchronous task', 'alert', 'bad') }), tasks({ tag: pill('click waiting…', 'clock', 'warn') }), render({ tag: pill('blocked: no frames', 'alert', 'warn') })], links: [link('tasks', 'stack', { style: 'dashed' }), link('render', 'stack', { style: 'dashed' })], flows: [flow(['tasks', 'stack'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Yield',
      kind: 'technique',
      title: 'Yield, defer or move the work',
      body: [
        '<b>Chunk and yield</b>: split the work into slices of ~10 ms and hand control back between them — <code>await scheduler.yield()</code> (or <code>setTimeout</code>, <code>MessageChannel</code>, <code>requestIdleCallback</code> for low priority) — so queued input and frames run in the gaps. The worst-case input delay becomes the slice length (12 ms) instead of 120 ms; total work is a little longer but the page stays responsive. <b>Move it off the main thread</b>: <b>Web Workers</b> run JavaScript in parallel threads (communicating by message passing, with transferable buffers), WebAssembly and OffscreenCanvas for heavy compute.',
        'Also reduce the work: virtualise long lists, paginate, debounce handlers, memoise, avoid forced layouts, defer non-critical scripts and split bundles. In Node, push CPU-bound work to worker threads or separate processes and keep the event loop for I/O. Measure with the Performance panel and Long Tasks API; aim for no task over 50 ms. Figures here are model arithmetic.',
      ],
      changes: [{ text: '120 ms → ten 12 ms slices: worst-case delay 12 ms', tone: 'good' }, { text: 'Workers for CPU-heavy work', tone: 'good' }],
      scene: { nodes: [stack({ tag: pill('12 ms slice, then yield', 'check', 'good') }), tasks({ tag: pill('input runs between slices', 'check', 'good') }), box('wk', 13, 0, 'Web Worker thread', 'blue', 'cpu', { size: [1.4, 1.4], height: 28, tag: pill('heavy compute off-thread', 'bolt') })], links: [link('tasks', 'stack'), link('stack', 'wk', { arrow: 'both', style: 'dashed' })], flows: [flow(['tasks', 'stack'], { rate: 1.5 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'One thread: keep every turn short',
      body: [
        'JavaScript runs <b>one task at a time to completion</b>; async I/O is handled by the platform and re-enters through queues; <b>microtasks drain fully</b> before rendering; a long task blocks frames and input for its whole duration (average delay ≈ half the task).',
        'Keep tasks under 50 ms, yield in slices, offload compute to workers, and measure long tasks and INP.',
      ],
      scene: { nodes: [loop(), stack(), tasks(), micro(), render()], links: [link('loop', 'stack'), link('tasks', 'stack'), link('micro', 'stack'), link('render', 'loop', { style: 'dashed' })], flows: [flow(['tasks', 'stack'], { rate: 1.5 })] },
    },
  ],
};

export default lesson;
