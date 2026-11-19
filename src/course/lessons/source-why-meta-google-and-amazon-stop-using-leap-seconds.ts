import type { Lesson, SceneNode } from '../../types';
import { box, flow, link, pill } from '../kit';

const clock = (id: string, r: number, d: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(id, r, d, name, 'blue', 'clock', { size: [1.2, 1.2], height: 26, ...extra });
const ref = (extra: Partial<SceneNode> = {}) => box('ref', -13, 0, 'Time source (UTC)', 'green', 'globe', { size: [1.4, 1.4], height: 30, ...extra });

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : ms >= 10 ? `${Math.round(ms)} ms` : `${ms.toFixed(1)} ms`);

const lesson: Lesson = {
  slug: 'source-why-meta-google-and-amazon-stop-using-leap-seconds',
  title: 'Clocks, Time and Leap Seconds',
  blurb: 'Why two machines never agree on the time, how big the disagreement can be, how a leap second breaks software, and why large operators want it gone.',
  minutes: 13,
  level: 'Advanced',
  metrics: [
    { key: 'err', label: 'Worst-case clock error', icon: 'clock' },
    { key: 'win', label: 'Ordering ambiguity window', icon: 'alert' },
    { key: 'smear', label: 'Leap-smear slope', icon: 'gauge' },
  ],
  goals: [
    { text: 'Why every machine’s clock drifts and how NTP bounds it', step: 2 },
    { text: 'Wall-clock versus monotonic time', step: 3 },
    { text: 'Why timestamps can’t safely order concurrent events', step: 4 },
    { text: 'What a leap second does to software and how smearing works', step: 6 },
    { text: 'Logical and hybrid clocks as the alternative', step: 8 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'drift', label: 'Clock drift', min: 1, max: 200, step: 1, default: 50, unit: ' ppm', description: 'How fast the local oscillator runs fast or slow, in parts per million. 50 ppm ≈ 4.3 s per day.' },
      { key: 'sync', label: 'Time between syncs', min: 1, max: 3600, step: 1, default: 64, unit: ' s', description: 'How often the node corrects its clock against a time source.' },
      { key: 'serr', label: 'Sync accuracy', min: 0.05, max: 100, step: 0.05, default: 2, unit: ' ms', description: 'Error remaining just after a sync (network asymmetry, source quality).' },
      { key: 'smearh', label: 'Leap-smear window', min: 1, max: 48, step: 1, default: 24, unit: ' h', description: 'Time over which the extra second is spread out.' },
    ],
    calculate: (input, step) => {
      const drift = Math.max(0, input.drift ?? 50) / 1e6;
      const sync = Math.max(1, input.sync ?? 64);
      const serr = Math.max(0, input.serr ?? 2);
      const smear = Math.max(1, input.smearh ?? 24);
      // Right after a sync the error is `serr`; it then grows by `drift` per second until the next sync.
      const worst = serr + drift * sync * 1000;
      const slope = 1e6 / (smear * 3600);
      return {
        err: step < 1 ? { v: '—' } : { v: `±${fmtMs(worst)}`, tone: worst < 10 ? 'good' : worst < 100 ? 'warn' : 'bad' },
        win: step < 3 ? { v: '—' } : { v: fmtMs(2 * worst), tone: worst * 2 < 20 ? 'good' : worst * 2 < 200 ? 'warn' : 'bad' },
        smear: step < 5 ? { v: '—' } : { v: `${slope.toFixed(1)} ppm (${(slope / (drift * 1e6 || 1)).toFixed(2)}× natural drift)`, tone: slope < 20 ? 'good' : 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'No shared clock',
      kind: 'problem',
      title: 'Every machine keeps its own time',
      body: [
        'Programs constantly ask “what time is it?” — to timestamp rows, expire sessions, order events, rotate keys, decide which write is newer. Each machine answers from its <b>own hardware clock</b>, and no two agree exactly. There is no global “now” that all nodes can read at the same instant.',
        'Treating timestamps from different machines as directly comparable is one of the most common sources of subtle distributed bugs. The first step is knowing <i>how wrong</i> the clocks can be.',
      ],
      scene: { nodes: [ref(), clock('a', 4, -6, 'Server A', { tag: pill('10:00:00.012', 'clock') }), clock('b', 4, 0, 'Server B', { tag: pill('09:59:59.994', 'clock') }), clock('c', 4, 6, 'Server C', { tag: pill('10:00:00.031', 'clock') })], links: [link('ref', 'a', { style: 'dashed' }), link('ref', 'b', { style: 'dashed' }), link('ref', 'c', { style: 'dashed' })], flows: [] },
    },
    {
      short: 'Drift & NTP',
      kind: 'technique',
      title: 'Drift, and how synchronisation bounds it',
      body: [
        'A crystal oscillator runs a little fast or slow, typically tens of parts per million and dependent on temperature. At 50 ppm a free-running clock gains or loses about <b>4.3 seconds a day</b>. <b>NTP</b> (or PTP, or a cloud time service) periodically measures the offset to a reference and corrects the clock.',
        'Between corrections error grows linearly, so the worst case is <code>error ≤ sync accuracy + drift × time since last sync</code>. With 2 ms accuracy, 50 ppm drift and a sync every 64 s: 2 + 3.2 = <b>±5.2 ms</b>. Sync every hour and the bound is ±182 ms. Better references (GPS, atomic clocks, PTP hardware timestamping) shrink the first term; syncing more often shrinks the second.',
      ],
      changes: [{ text: '50 ppm drift ≈ 4.3 s/day uncorrected', tone: 'info' }, { text: 'Error ≤ accuracy + drift × interval', tone: 'info' }],
      concepts: [{ term: 'ppm', def: 'Parts per million: 1 ppm of drift is 1 µs gained or lost per second.' }],
      scene: { nodes: [ref({ tag: pill('NTP / PTP', 'refresh') }), clock('a', 4, -3, 'Server', { tag: pill('±5 ms bound', 'gauge', 'good') })], links: [link('ref', 'a', { arrow: 'both' })], flows: [flow(['ref', 'a'], { rate: 0.4 }), flow(['a', 'ref'], { kind: 'response', rate: 0.4 })] },
    },
    {
      short: 'Wall vs monotonic',
      kind: 'technique',
      title: 'Two clocks, two jobs',
      body: [
        'The <b>wall clock</b> (<code>System.currentTimeMillis</code>, <code>time.time</code>) tells you the date and time — and can <b>jump</b>: NTP steps it, a human sets it, a leap second repeats a second, a VM resumes from pause. Subtracting two wall-clock readings can give a <i>negative</i> duration.',
        'The <b>monotonic clock</b> (<code>System.nanoTime</code>, <code>CLOCK_MONOTONIC</code>) only counts forward from an arbitrary start and is never stepped. Use it for <b>durations, timeouts and rate limits</b>; use the wall clock only for human-meaningful timestamps. Monotonic readings from different machines are not comparable at all.',
      ],
      changes: [{ text: 'Durations & timeouts → monotonic', tone: 'good' }, { text: 'Timestamps for people → wall clock', tone: 'info' }, { text: 'Wall-clock subtraction can go negative', tone: 'bad' }],
      scene: { nodes: [box('wall', -6, 0, 'Wall clock', 'orange', 'clock', { size: [1.3, 1.3], height: 26, tag: pill('can jump back', 'alert', 'warn') }), box('mono', 6, 0, 'Monotonic clock', 'green', 'clock', { size: [1.3, 1.3], height: 26, tag: pill('only forward', 'check', 'good') })], links: [], flows: [] },
    },
    {
      short: 'Ordering',
      kind: 'problem',
      title: 'Timestamps cannot order close events',
      body: [
        'Two clients write the same row through different servers 4 ms apart. With each clock off by up to ±5 ms, server A’s timestamp can be <i>later</i> than server B’s even though the write actually happened first. A <b>last-write-wins</b> store keeps the wrong value and silently discards the right one — no error, no log.',
        'Anything closer than the <b>ambiguity window</b> (twice the error bound, ~10 ms here) cannot be ordered by timestamps. Spanner’s TrueTime makes the bound explicit and <i>waits it out</i> before committing (see that lesson); most systems instead avoid relying on cross-machine timestamps for correctness, or accept the loss window for data that tolerates it.',
      ],
      changes: [{ text: 'LWW with skew → newer write may lose', tone: 'bad' }, { text: 'Ambiguity window = 2 × error bound', tone: 'info' }],
      scene: { nodes: [clock('a', 2, -6, 'Server A', { tag: pill('write @ 10:00:00.012', 'file') }), clock('b', 2, 6, 'Server B', { tag: pill('write @ 10:00:00.009 (earlier clock)', 'file', 'warn') }), box('store', 14, 0, 'LWW store', 'purple', 'db', { size: [1.4, 1.4], height: 28, tag: pill('keeps A, drops B', 'alert', 'bad') })], links: [link('a', 'store'), link('b', 'store')], flows: [flow(['a', 'store'], { kind: 'write', rate: 1 }), flow(['b', 'store'], { kind: 'write', rate: 1 })] },
    },
    {
      short: 'Leap second',
      kind: 'problem',
      title: 'The leap second: a minute with 61 seconds',
      body: [
        'Earth’s rotation is slightly irregular, so UTC occasionally inserts a <b>leap second</b>: the clock reads 23:59:59, then <b>23:59:60</b>, then 00:00:00. Most computer clocks count seconds as a plain number (Unix time) with no way to say “second 60”, so systems either repeat a second or stall it.',
        'The result: duplicate timestamps, durations of zero or negative length, timers that fire immediately or never, busy-looping kernel code, and databases that panic on a time going backwards. Leap-second bugs have caused hangs and outages at large sites in 2012 and 2017. Every occurrence is a rare event that real code is rarely tested for — and there have been 27 of them since 1972.',
      ],
      changes: [{ text: '23:59:59 → 23:59:60 → 00:00:00', tone: 'info' }, { text: 'Repeated seconds, negative durations, stuck timers', tone: 'bad' }],
      scene: { nodes: [clock('a', -4, 0, 'Server', { state: 'hot', tag: pill('time went backwards', 'alert', 'bad') }), box('timer', 8, 0, 'Timeouts / sessions', 'red', 'clock', { size: [1.3, 1.3], height: 26, tag: pill('fire early or never', 'alert', 'warn') })], links: [link('a', 'timer', { style: 'broken' })], flows: [flow(['a', 'timer'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Smearing',
      kind: 'technique',
      title: 'Smearing: hide the second',
      body: [
        '<b>Leap smearing</b> slows the clock very slightly over a long window (typically 24 hours) so that the extra second is absorbed gradually and the clock never repeats or jumps. Spread over 24 h the slope is <code>1 s ÷ 86,400 s ≈ 11.6 ppm</code> — well below normal oscillator drift, so applications can’t see it.',
        'It works, and large operators run smeared time on their internal NTP. The costs: smeared and non-smeared clocks disagree by up to half a second for a day, so mixing sources (one provider smearing, another stepping, or different smear windows) creates exactly the skew you were avoiding; and the clock is <i>not</i> UTC during the smear, which matters for anything legally timestamped.',
      ],
      changes: [{ text: '1 s ÷ 24 h ≈ 11.6 ppm', tone: 'info' }, { text: 'Never mix smeared and stepped sources', tone: 'bad' }],
      scene: { nodes: [ref({ tag: pill('smeared over 24 h', 'refresh') }), clock('a', 4, -4, 'Server A', { tag: pill('smoothly slowed', 'check', 'good') }), clock('b', 4, 5, 'Server B (stepped)', { tag: pill('off by up to 0.5 s', 'alert', 'warn') })], links: [link('ref', 'a'), link('ref', 'b', { style: 'dashed' })], flows: [flow(['ref', 'a'], { rate: 0.6 })] },
    },
    {
      short: 'Retiring it',
      kind: 'insight',
      title: 'Why big operators want leap seconds abolished',
      body: [
        'Smearing is a workaround for a problem the standard creates. Every operator must build, test and trust a leap-second strategy for an event that happens every few years at unpredictable dates, announced only months ahead, and gets <i>harder</i> to handle as systems get tighter (microsecond-level synchronisation, financial timestamping, distributed databases). Meta, Google and Amazon have each publicly argued the cost isn’t worth it.',
        'In 2022 the international body that defines the second voted to stop adding leap seconds by 2035, letting UTC drift from astronomical time by more than a second instead. Until then, the pragmatic rule stands: use one consistent time source and smear policy fleet-wide, and test what your system does when time goes strange.',
      ],
      scene: { nodes: [box('now', -6, 0, 'Today: leap seconds + smearing', 'orange', 'alert', { size: [1.4, 1.4], height: 26 }), box('future', 8, 0, 'Future: continuous time', 'green', 'check', { size: [1.4, 1.4], height: 26 })], links: [link('now', 'future', { arrow: 'end' })], flows: [flow(['now', 'future'], { rate: 0.8 })] },
    },
    {
      short: 'Logical time',
      kind: 'technique',
      title: 'When you need order, not the time',
      body: [
        'Often you don’t need <i>when</i>, only <i>which came first</i>. A <b>Lamport clock</b> is a counter each node increments on every event and bumps past any counter it receives; if A caused B, A’s number is smaller. <b>Vector clocks</b> additionally detect concurrency (see the Dynamo lesson). <b>Hybrid logical clocks (HLC)</b> combine wall time and a counter: timestamps stay close to real time yet never go backwards and always respect causality — used by CockroachDB and others.',
        'Rule of thumb: physical time for humans, monotonic time for durations, logical or hybrid clocks for ordering events across machines, and explicit uncertainty (TrueTime-style) when you need real-time order with strong guarantees.',
      ],
      concepts: [{ term: 'Hybrid logical clock', def: 'A timestamp pairing physical time with a logical counter so it is close to wall time but still monotonic and causally consistent.' }],
      scene: { nodes: [box('lam', -8, -5, 'Lamport clock', 'blue', 'hash', { size: [1.3, 1.3], height: 24, tag: pill('causal order', 'check') }), box('vec', 8, -5, 'Vector clock', 'orange', 'layers', { size: [1.3, 1.3], height: 24, tag: pill('detects concurrency', 'search') }), box('hlc', 0, 6, 'Hybrid logical clock', 'green', 'clock', { size: [1.3, 1.3], height: 26, tag: pill('close to wall time', 'clock') })], links: [], flows: [] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Know your error bar, and never trust a timestamp further',
      body: [
        'Clocks drift (tens of ppm), sync bounds the error to <code>accuracy + drift × interval</code>, wall clocks can jump while monotonic ones can’t, and timestamps within the ambiguity window can’t order events. Leap seconds add rare, hard-to-test discontinuities, which smearing hides at the price of a non-UTC clock.',
        'Practical rules: monotonic for durations, one consistent time source and smear policy, no correctness that depends on cross-machine wall-clock order, and logical or hybrid clocks where ordering matters. Figures here are model outputs for sizing, not measurements.',
      ],
      scene: { nodes: [ref(), clock('a', 4, -5, 'Server A'), clock('b', 4, 5, 'Server B')], links: [link('ref', 'a', { arrow: 'both' }), link('ref', 'b', { arrow: 'both' })], flows: [flow(['ref', 'a'], { rate: 0.5 }), flow(['ref', 'b'], { rate: 0.5 })] },
    },
  ],
};

export default lesson;
