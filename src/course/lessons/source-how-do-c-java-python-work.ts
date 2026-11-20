import type { Lesson, SceneNode } from '../../types';
import { box, db, disk, flow, link, pill } from '../kit';

const src = (extra: Partial<SceneNode> = {}) => box('src', -18, 0, 'Source code', 'teal', 'doc', { size: [1.3, 1.3], height: 18, ...extra });
const comp = (extra: Partial<SceneNode> = {}) => box('comp', -9, -8, 'Compiler + linker (ahead of time)', 'orange', 'cpu', { size: [1.5, 1.5], height: 26, ...extra });
const exe = (extra: Partial<SceneNode> = {}) => disk('exe', 0, -8, 'Native executable (machine code)', { size: [2.6, 1], height: 12, tone: 'yellow', ...extra });
const bc = (extra: Partial<SceneNode> = {}) => disk('bc', 0, 0, 'Bytecode (.pyc / .class)', { size: [2.6, 1], height: 12, tone: 'yellow', ...extra });
const vm = (extra: Partial<SceneNode> = {}) => box('vm', 9, 0, 'VM: interpreter loop (+ JIT)', 'purple', 'layers', { size: [1.7, 1.7], height: 30, ...extra });
const jit = (extra: Partial<SceneNode> = {}) => box('jit', 9, 8, 'JIT: hot code → machine code', 'red', 'bolt', { size: [1.4, 1.4], height: 24, ...extra });
const cpu = (extra: Partial<SceneNode> = {}) => box('cpu', 18, -4, 'CPU executes instructions', 'green', 'cpu', { size: [1.5, 1.5], height: 26, ...extra });
const prof = (extra: Partial<SceneNode> = {}) => db('prof', 18, 6, 'Profile counters', { size: [1.2, 1.2], ...extra });

const fmtT = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${(s / 60).toFixed(1)} min` : s >= 1 ? `${s.toFixed(2)} s` : `${(s * 1000).toFixed(s < 0.01 ? 1 : 0)} ms`);
const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n)}`);

const lesson: Lesson = {
  slug: 'source-how-do-c-java-python-work',
  title: 'How C, Java and Python Run: Compilation, Interpretation and JIT',
  blurb: 'Source code becomes machine instructions in three ways: compiled ahead of time, interpreted from bytecode, or interpreted and then compiled while running. What each costs at start-up and in steady state, with a runtime model and the break-even points.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'c', label: 'Ahead-of-time compiled (C): total time', icon: 'cpu' },
    { key: 'py', label: 'Interpreted bytecode (CPython-style): total time', icon: 'timer' },
    { key: 'jvm', label: 'Interpreter + JIT (JVM-style): total time', icon: 'bolt' },
    { key: 'short', label: 'A short job of 1M operations', icon: 'clock' },
    { key: 'even', label: 'Work where JIT overtakes the interpreter', icon: 'scale' },
  ],
  goals: [
    { text: 'From text to instructions: the pipeline', step: 1 },
    { text: 'Ahead-of-time compilation: C, Rust, Go', step: 2 },
    { text: 'Interpreters and bytecode: Python', step: 3 },
    { text: 'JIT compilation: the JVM and warm-up', step: 4 },
    { text: 'Choosing: start-up, steady state and escape hatches', step: 5 },
  ],
  legend: ['request', 'response', 'handshake', 'heavy'],
  dynamic: {
    parameters: [
      { key: 'ops', label: 'Work to do', min: 1000, max: 100000000000, step: 1000, default: 1000000000, unit: ' ops', description: 'Basic operations (a loop iteration, an arithmetic step) the program performs.' },
      { key: 'cns', label: 'Native code: time per operation', min: 0.2, max: 20, step: 0.1, default: 1, unit: ' ns', description: 'Optimised machine code.' },
      { key: 'pns', label: 'Interpreter (Python-style): time per operation', min: 5, max: 500, step: 1, default: 50, unit: ' ns', description: 'Dispatch, type checks, boxed values and reference counting.' },
      { key: 'ins', label: 'JVM interpreter: time per operation', min: 5, max: 200, step: 1, default: 20, unit: ' ns', description: 'Before code is compiled.' },
      { key: 'jns', label: 'JIT-compiled code: time per operation', min: 0.2, max: 20, step: 0.1, default: 1.5, unit: ' ns', description: 'Optimised steady state (a bit slower than ahead-of-time).' },
      { key: 'thr', label: 'Operations before hot code is compiled', min: 1000, max: 10000000, step: 1000, default: 100000, unit: ' ops', description: 'Profile threshold that triggers the JIT.' },
      { key: 'comp', label: 'JIT compile time on the critical path', min: 0, max: 2000, step: 10, default: 200, unit: ' ms', description: 'Charged in full (a spare core would overlap it).' },
      { key: 'jst', label: 'JVM start-up', min: 5, max: 500, step: 5, default: 40, unit: ' ms', description: 'Runtime initialisation and class loading.' },
      { key: 'pst', label: 'Python start-up', min: 1, max: 200, step: 1, default: 15, unit: ' ms', description: 'Interpreter and import start-up.' },
    ],
    calculate: (input, step) => {
      const ops = Math.max(1, input.ops ?? 1e9);
      const cns = Math.max(0.01, input.cns ?? 1) / 1e9;
      const pns = Math.max(0.01, input.pns ?? 50) / 1e9;
      const ins = Math.max(0.01, input.ins ?? 20) / 1e9;
      const jns = Math.max(0.01, input.jns ?? 1.5) / 1e9;
      const thr = Math.max(1, input.thr ?? 1e5);
      const comp = Math.max(0, (input.comp ?? 200) / 1000);
      const jst = Math.max(0, (input.jst ?? 40) / 1000);
      const pst = Math.max(0, (input.pst ?? 15) / 1000);
      const cst = 0.001;
      const total = (n: number) => ({
        c: cst + n * cns,
        py: pst + n * pns,
        jvm: n <= thr ? jst + n * ins : jst + thr * ins + comp + (n - thr) * jns,
      });
      const t = total(ops);
      const s = total(1e6);
      // JIT total = jst + comp + thr·(ins − jns) + n·jns; interpreter total = pst + n·pns.
      const even = pns > jns ? (jst + comp + thr * (ins - jns) - pst) / (pns - jns) : Infinity;
      return {
        c: step < 2 ? { v: '—' } : { v: fmtT(t.c), tone: 'good' },
        py: step < 3 ? { v: '—' } : { v: `${fmtT(t.py)} (${(t.py / t.c).toFixed(0)}× native)`, tone: t.py / t.c > 20 ? 'bad' : 'warn' },
        jvm: step < 4 ? { v: '—' } : { v: `${fmtT(t.jvm)} (${(t.jvm / t.c).toFixed(1)}× native)`, tone: t.jvm / t.c < 3 ? 'good' : 'warn' },
        short: step < 4 ? { v: '—' } : { v: `C ${fmtT(s.c)} · Python ${fmtT(s.py)} · JVM ${fmtT(s.jvm)}`, tone: s.jvm > s.py ? 'warn' : 'good' },
        even: step < 4 ? { v: '—' } : { v: Number.isFinite(even) && even > 0 ? `${fmtN(even)} ops` : 'always / never', tone: 'good' },
      };
    },
  },
  steps: [
    {
      short: 'Pipeline',
      kind: 'insight',
      title: 'A CPU only runs machine instructions',
      body: [
        'A processor executes a fixed set of binary instructions (x86-64, ARM64). Every language therefore needs a way to turn text like <code>total += price * qty</code> into those instructions — and <i>when</i> that translation happens is the fundamental difference between C, Java and Python, not the syntax. Three strategies: <b>ahead-of-time (AOT) compilation</b> translates everything before the program runs; <b>interpretation</b> has a program (the interpreter) read and carry out the code step by step at run time; <b>just-in-time (JIT) compilation</b> starts by interpreting, watches what runs, and compiles the hot parts to machine code while the program is running.',
        'Each strategy makes a different trade between <b>start-up latency</b>, <b>steady-state speed</b>, <b>memory</b>, <b>portability</b> and <b>flexibility</b> (dynamic typing, reflection, hot reload). The model in this lesson uses illustrative per-operation costs — 1 ns native, 50 ns interpreted, 20 ns JVM-interpreted then 1.5 ns compiled — to show how those trade-offs play out as the amount of work grows.',
      ],
      scene: { nodes: [src(), comp(), bc(), vm(), cpu()], links: [link('src', 'comp'), link('src', 'bc'), link('bc', 'vm'), link('vm', 'cpu')], flows: [flow(['src', 'comp'], { rate: 1.2 }), flow(['src', 'bc', 'vm', 'cpu'], { rate: 1.4 })] },
    },
    {
      short: 'AOT',
      kind: 'technique',
      title: 'Compiled ahead of time: C, C++, Rust, Go',
      body: [
        'A compiler runs <b>before</b> the program does: <b>lex</b> (tokens) → <b>parse</b> (abstract syntax tree) → <b>type-check</b> → lower to an <b>intermediate representation</b> (LLVM IR, GIMPLE) → <b>optimise</b> (inlining, constant folding, loop unrolling, vectorisation, dead-code elimination) → <b>generate machine code</b> → an <b>assembler</b> and <b>linker</b> combine object files and libraries into an executable (ELF on Linux, Mach-O on macOS, PE on Windows). At run time the OS loader maps the file into memory, resolves any shared libraries (<b>dynamic linking</b>) and jumps to <code>main</code>.',
        'Because types are known statically and nothing is translated at run time, the CPU runs the result directly: ~1 ns per simple operation in this model, so 10⁹ operations take <b>about 1 second</b>, start-up is a millisecond, and memory use is just the program’s. The costs are build time, a binary per platform (cross-compilation or per-OS builds), and less run-time dynamism (no loading new code without plugins/dlopen). Optimisation is limited by what is knowable at compile time, which is why profile-guided optimisation (PGO) feeds real run profiles back into the compiler.',
      ],
      changes: [{ text: 'lex → parse → typecheck → IR → optimise → codegen → link', tone: 'info' }, { text: '10⁹ ops ≈ 1 s; start-up ~1 ms', tone: 'good' }, { text: 'Per-platform binaries; limited run-time dynamism', tone: 'bad' }],
      scene: { nodes: [src(), comp({ tag: pill('optimise: inline, vectorise', 'cpu', 'good') }), exe({ tag: pill('ELF / Mach-O / PE', 'file') }), cpu({ tag: pill('runs directly', 'bolt', 'good') })], links: [link('src', 'comp'), link('comp', 'exe'), link('exe', 'cpu')], flows: [flow(['src', 'comp', 'exe', 'cpu'], { rate: 1.6 })] },
    },
    {
      short: 'Interpreter',
      kind: 'technique',
      title: 'Interpreted bytecode: Python',
      body: [
        'CPython first <b>compiles source to bytecode</b> — a compact instruction set for a virtual stack machine (<code>LOAD_FAST</code>, <code>BINARY_OP</code>, <code>CALL</code>), cached as <code>.pyc</code> — and then an <b>evaluation loop</b> fetches each bytecode, jumps to its C implementation and executes it. Nothing is compiled to machine code, so one portable bytecode runs wherever the interpreter does, and the language can stay dynamic: types, attributes and even code can change at run time.',
        'That flexibility costs per operation. <code>a + b</code> is not an <code>ADD</code> instruction: the interpreter must look up the types, find the right method, unbox two heap-allocated integer objects, allocate a result, and adjust <b>reference counts</b> — typically 30–100× slower than native code. Here 50 ns/op means 10⁹ operations take <b>50 seconds</b> (50× native). Mitigations: push hot loops into compiled libraries (NumPy, pandas, regexes — written in C), use multiprocessing or async I/O (CPython’s <b>GIL</b> lets only one thread run Python bytecode at a time, though recent versions make it optional), or use a JIT-based implementation (PyPy) or ahead-of-time tools (Cython, Numba, mypyc).',
      ],
      changes: [{ text: 'Source → bytecode (.pyc) → eval loop', tone: 'info' }, { text: 'Dynamic dispatch, boxing, refcounts: ~50× native', tone: 'bad' }, { text: 'Offload hot loops to C libraries; processes for CPU parallelism', tone: 'good' }],
      concepts: [{ term: 'Bytecode', def: 'A portable, compact instruction set for a virtual machine, executed by an interpreter or compiled further by a JIT.' }],
      scene: { nodes: [src({ tag: pill('x = a + b', 'doc') }), bc({ tag: pill('LOAD a · LOAD b · ADD', 'list') }), vm({ tag: pill('fetch → dispatch → execute', 'layers', 'warn') }), cpu({ tag: pill('50 ns per op', 'timer', 'warn') })], links: [link('src', 'bc'), link('bc', 'vm'), link('vm', 'cpu')], flows: [flow(['src', 'bc', 'vm', 'cpu'], { kind: 'heavy', rate: 2.4 })] },
    },
    {
      short: 'JIT',
      kind: 'technique',
      title: 'JIT: interpret first, compile what turns out to be hot',
      body: [
        'Java compiles to <b>bytecode</b> (<code>.class</code>) ahead of time, but the JVM then runs it in <b>tiers</b>: the <b>interpreter</b> executes cold code immediately (20 ns/op here) while counting method invocations and loop back-edges; once code crosses a threshold the <b>C1</b> compiler produces quickly-built machine code, and for the hottest methods the <b>C2</b> compiler produces heavily optimised code using the <i>observed profile</i> — inlining across virtual calls it has only ever seen resolve one way, eliminating bounds checks, escape-analysing allocations away. Speculative optimisations are guarded; when an assumption breaks, the VM <b>deoptimises</b> back to the interpreter.',
        'The result is steady-state speed near native (1.5 ns/op) — sometimes better than AOT code, because it uses run-time information — but a <b>warm-up</b> cost. For 10⁹ ops: 40 ms start-up + 2 ms interpreting the first 100,000 ops + 200 ms compile + 1.5 s compiled ≈ <b>1.74 s</b> (1.7× native), versus 50 s for the Python-style interpreter. For a <b>short 1M-op job</b> the picture reverses: native 2 ms, Python 65 ms, JVM <b>243 ms</b> — dominated by start-up and compilation. The JIT overtakes the interpreter after roughly <b>4.7 million operations</b> of work.',
      ],
      changes: [{ text: 'Tiered: interpreter → C1 → C2 using run-time profiles', tone: 'info' }, { text: '10⁹ ops: 1.74 s (1.7× native) vs 50 s interpreted', tone: 'good' }, { text: '1M ops: JVM 243 ms vs Python 65 ms — warm-up dominates', tone: 'bad' }],
      scene: { nodes: [bc(), vm({ tag: pill('interpret + count', 'layers') }), prof({ tag: pill('hot: 100k invocations', 'activity') }), jit({ tag: pill('compile with profile', 'bolt', 'good') }), cpu({ tag: pill('1.5 ns per op', 'timer', 'good') })], links: [link('bc', 'vm'), link('vm', 'prof'), link('vm', 'jit'), link('jit', 'cpu')], flows: [flow(['bc', 'vm', 'jit', 'cpu'], { rate: 1.6 })] },
    },
    {
      short: 'Choose',
      kind: 'tradeoff',
      title: 'Start-up, steady state and the escape hatches',
      body: [
        'Rule of thumb by workload shape: <b>short-lived or start-up-sensitive</b> (CLIs, serverless functions, scripts) favour AOT or a light interpreter — JVM warm-up is a real cost there, so use <b>native-image/AOT</b> (GraalVM) or CDS/CRaC snapshots; <b>long-running servers and batch jobs</b> amortise JIT warm-up and gain its optimisations; <b>I/O-bound glue</b> works well in an interpreter because the time is in the network and disk, not bytecode dispatch. Profile before choosing: the language’s per-operation cost matters only for the part of the program that is actually CPU-bound.',
        'Practical consequences: warm up instances before sending production traffic (and exclude cold ones from latency SLOs), watch for <b>deoptimisation storms</b> and compile-queue backlogs in JIT runtimes, keep hot Python paths vectorised or in extension modules, and remember that memory management differs too — manual (C), garbage-collected (JVM — see the Garbage Collection lesson) or reference-counted plus cycle collector (CPython). The figures here are a first-order model with assumed per-op costs, not benchmarks of any implementation.',
      ],
      changes: [{ text: 'Short jobs → AOT/light interpreter; long servers → JIT', tone: 'info' }, { text: 'Warm instances before traffic; vectorise hot Python', tone: 'good' }],
      scene: { nodes: [src(), exe({ tag: pill('CLI, serverless', 'bolt') }), vm({ tag: pill('long-running servers', 'layers') }), cpu()], links: [link('src', 'exe'), link('src', 'vm'), link('exe', 'cpu'), link('vm', 'cpu')], flows: [flow(['src', 'vm', 'cpu'], { rate: 1.6 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'When translation happens decides the trade-off',
      body: [
        '<b>AOT</b> (C/Rust/Go): translate once, run fast, no warm-up, per-platform binaries. <b>Interpreter</b> (CPython): portable and dynamic, ~50× slower per operation. <b>JIT</b> (JVM): interpret, profile, compile the hot code — near-native steady state, a warm-up cost, and a break-even around millions of operations.',
        'Match the runtime to the job’s length and CPU-boundness, and measure instead of assuming.',
      ],
      scene: { nodes: [src(), comp(), exe(), bc(), vm(), cpu()], links: [link('src', 'comp'), link('comp', 'exe'), link('src', 'bc'), link('bc', 'vm'), link('exe', 'cpu'), link('vm', 'cpu')], flows: [flow(['src', 'comp', 'exe', 'cpu'], { rate: 1.6 })] },
    },
  ],
};

export default lesson;
