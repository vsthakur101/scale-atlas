import type { Lesson, SceneNode } from '../../types';
import { box, crowd, db, flow, link, pill } from '../kit';

const txs = (extra: Partial<SceneNode> = {}) => crowd('txs', -18, 0, 10, 'concurrent transactions', extra);
const lm = (extra: Partial<SceneNode> = {}) => box('lm', -8, 0, 'Lock manager (lock table + wait queues)', 'purple', 'lock', { size: [1.7, 1.7], height: 30, ...extra });
const tbl = (extra: Partial<SceneNode> = {}) => db('tbl', 4, -7, 'Table (IS / IX intent locks)', { size: [1.6, 1.6], ...extra });
const rowA = (extra: Partial<SceneNode> = {}) => box('rowA', 12, -4, 'Row A', 'blue', 'file', { size: [1.1, 1.0], height: 14, ...extra });
const rowB = (extra: Partial<SceneNode> = {}) => box('rowB', 12, 6, 'Row B', 'blue', 'file', { size: [1.1, 1.0], height: 14, ...extra });
const wfg = (extra: Partial<SceneNode> = {}) => box('wfg', 2, 8, 'Wait-for graph (cycle detector)', 'red', 'alert', { size: [1.4, 1.4], height: 24, ...extra });

const fmtN = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n).toLocaleString('en-US')}` : n < 10 ? n.toFixed(2) : `${Math.round(n)}`);
const fmtP = (p: number): string => (p >= 0.01 ? `${(p * 100).toFixed(1)}%` : p === 0 ? '0' : `${p.toExponential(1)}`);

const lesson: Lesson = {
  slug: 'source-database-locks-explained',
  title: 'Database Locks: Modes, Granularity, Waiting and Deadlock Probability',
  blurb: 'Shared and exclusive locks, intent locks for hierarchies, row and gap locks, how queues of waiters form — and the n·k⁴ ÷ N² rule that makes deadlocks rare at small scale and routine at large transaction sizes.',
  minutes: 14,
  level: 'Advanced',
  metrics: [
    { key: 'pw', label: 'Chance a transaction waits on a lock', icon: 'clock' },
    { key: 'pd', label: 'Chance a transaction deadlocks', icon: 'alert' },
    { key: 'rate', label: 'Deadlocks per hour at this throughput', icon: 'timer' },
    { key: 'dbl', label: 'Deadlocks per hour if each transaction locks 2× more rows', icon: 'scale' },
  ],
  goals: [
    { text: 'Why databases lock: protecting isolation', step: 1 },
    { text: 'Lock modes and compatibility', step: 2 },
    { text: 'Granularity, intent locks, gap locks and escalation', step: 3 },
    { text: 'Waiting, queues and deadlock detection', step: 4 },
    { text: 'The probability model and how to lower it', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'n', label: 'Concurrent transactions', min: 1, max: 2000, step: 1, default: 50, unit: '', description: 'Transactions in flight at once.' },
      { key: 'k', label: 'Rows locked per transaction', min: 1, max: 200, step: 1, default: 10, unit: '', description: 'Locks acquired (and held to commit) by each transaction.' },
      { key: 'rows', label: 'Rows in the contended set', min: 100, max: 1000000000, step: 100, default: 100000, unit: '', description: 'Rows transactions choose among; shrink it to model hot spots.' },
      { key: 'tps', label: 'Transactions per second', min: 1, max: 100000, step: 1, default: 2000, unit: '/s', description: 'Completion rate.' },
    ],
    calculate: (input, step) => {
      const n = Math.max(1, input.n ?? 50);
      const k = Math.max(1, input.k ?? 10);
      const N = Math.max(1, input.rows ?? 1e5);
      const tps = Math.max(0, input.tps ?? 2000);
      // Gray et al.: each lock request meets n·k/2 held locks among N rows; a transaction waits with probability ≈ n·k²/(2N);
      // a deadlock needs a waits-for cycle: P(deadlock) ≈ PW² / n = n·k⁴ / (4·N²).
      const pw = (n: number, k: number) => Math.min(1, (n * k * k) / (2 * N));
      const pd = (n: number, k: number) => Math.min(1, (pw(n, k) * pw(n, k)) / n);
      const perHour = (n2: number, k2: number) => pd(n2, k2) * tps * 3600;
      return {
        pw: step < 4 ? { v: '—' } : { v: fmtP(pw(n, k)), tone: pw(n, k) < 0.05 ? 'good' : pw(n, k) < 0.3 ? 'warn' : 'bad' },
        pd: step < 4 ? { v: '—' } : { v: fmtP(pd(n, k)), tone: pd(n, k) < 1e-5 ? 'good' : pd(n, k) < 1e-3 ? 'warn' : 'bad' },
        rate: step < 5 ? { v: '—' } : { v: `${fmtN(perHour(n, k))} / hour (${fmtN(pd(n, k) * tps)} per second)`, tone: perHour(n, k) < 10 ? 'good' : perHour(n, k) < 1000 ? 'warn' : 'bad' },
        dbl: step < 5 ? { v: '—' } : { v: `${fmtN(perHour(n, 2 * k))} / hour (≈ ${(perHour(n, 2 * k) / Math.max(1e-12, perHour(n, k))).toFixed(0)}×)`, tone: 'warn' },
      };
    },
  },
  steps: [
    {
      short: 'Why',
      kind: 'insight',
      title: 'Locks make concurrent transactions behave as if serial',
      body: [
        'When two transactions touch the same data, the database must stop them interleaving in a way that produces a result no serial order could (lost updates, dirty reads, write skew — see the Isolation Levels lesson). The classic mechanism is <b>locking</b>: before reading or writing a resource a transaction asks the <b>lock manager</b> for a lock; if another transaction holds an incompatible one, the requester <b>waits</b>. With <b>strict two-phase locking</b> (2PL) locks are acquired as needed and <b>all released only at commit or rollback</b>, which gives serialisable behaviour.',
        'MVCC engines (PostgreSQL, InnoDB, Oracle) avoid most <i>read</i> locks by giving readers a snapshot, but <b>writers still lock the rows they modify</b>, and explicit locking (<code>SELECT … FOR UPDATE</code>, <code>LOCK TABLE</code>, advisory locks) and constraint checks (unique, foreign key) take more. So locks remain central to throughput: they are the queue everyone stands in.',
      ],
      scene: { nodes: [txs(), lm({ tag: pill('grant · wait · release at commit', 'lock') }), rowA(), rowB()], links: [link('txs', 'lm'), link('lm', 'rowA'), link('lm', 'rowB')], flows: [flow(['txs', 'lm', 'rowA'], { kind: 'write', rate: 1.6 })] },
    },
    {
      short: 'Modes',
      kind: 'technique',
      title: 'Lock modes and the compatibility matrix',
      body: [
        'The basic modes: <b>Shared (S)</b> — “I am reading, don’t change it”; many holders may coexist. <b>Exclusive (X)</b> — “I am modifying it”; no other lock allowed. Compatibility: S–S ✓, S–X ✗, X–X ✗. Databases add <b>Update (U)</b> locks (SQL Server, <code>SELECT FOR UPDATE</code> intent): “I am reading now and will probably write” — compatible with S but not with another U, which prevents the classic <b>S→X upgrade deadlock</b> where two readers each try to upgrade the same row. PostgreSQL has finer row modes (<code>FOR KEY SHARE</code>, <code>FOR SHARE</code>, <code>FOR NO KEY UPDATE</code>, <code>FOR UPDATE</code>) so foreign-key checks don’t block unrelated column updates.',
        'Lock requests are <b>queued in arrival order</b> per resource. That has a consequence: an X request waiting behind a long-running S holder blocks every <i>later</i> S request too (to avoid starving the writer), so one slow reader plus one writer can stall a whole table’s traffic — the <b>lock convoy</b>. Long transactions are the multiplier: they hold locks while doing nothing database-related (waiting on a user, an HTTP call).',
      ],
      changes: [{ text: 'S–S compatible; S–X and X–X conflict', tone: 'info' }, { text: 'Update (U) locks prevent S→X upgrade deadlocks', tone: 'good' }, { text: 'FIFO queues: a waiting writer blocks later readers (convoy)', tone: 'bad' }],
      concepts: [{ term: 'Strict 2PL', def: 'Acquire locks as needed, hold every lock until commit or rollback; guarantees serialisable schedules at the cost of waiting and deadlocks.' }],
      scene: { nodes: [txs({ tag: pill('T1: S · T2: S · T3: X?', 'list') }), lm({ tag: pill('X waits behind S; later S queues too', 'queue', 'warn') }), rowA({ tag: pill('S held by T1, T2', 'lock') })], links: [link('txs', 'lm'), link('lm', 'rowA')], flows: [flow(['txs', 'lm', 'rowA'], { rate: 1.6 })] },
    },
    {
      short: 'Granularity',
      kind: 'technique',
      title: 'Granularity, intent locks, gap locks and escalation',
      body: [
        'Locks can cover a <b>row</b>, a <b>page</b>, a <b>table</b> or the <b>database</b>. Fine granularity allows more concurrency but needs more lock-manager memory and CPU; coarse is cheap but serialises more. To mix them safely, hierarchical locking uses <b>intent locks</b>: before locking a row in X mode, a transaction takes <b>IX</b> on the table (and IS before row S locks). A table-level <code>LOCK TABLE … X</code> request must conflict with <i>any</i> row activity — it does, because IX/IS on the table conflict with table X — without scanning every row lock.',
        '<b>Phantoms</b> (rows inserted into a range after a query) need locks on <i>ranges</i>: InnoDB’s <b>next-key / gap locks</b> lock index records plus the gaps between them at REPEATABLE READ, so a <code>WHERE price BETWEEN 10 AND 20</code> update blocks inserts into that range — correct, but a surprise source of waits and deadlocks. <b>Lock escalation</b> (SQL Server converts thousands of row locks to a table lock to save memory) can suddenly block everyone. Indexes matter: without a usable index a statement scans and locks (or touches) <b>many more rows than it changes</b>, inflating <i>k</i> in the model below.',
      ],
      changes: [{ text: 'IS/IX intent locks let table and row locks coexist safely', tone: 'good' }, { text: 'Gap locks stop phantoms but block inserts into ranges', tone: 'info' }, { text: 'Missing index → scans lock far more rows', tone: 'bad' }],
      scene: { nodes: [txs(), lm(), tbl({ tag: pill('IX held by T1, T2', 'lock') }), rowA({ tag: pill('X (T1)', 'lock', 'warn') }), rowB({ tag: pill('X (T2)', 'lock', 'warn') })], links: [link('txs', 'lm'), link('lm', 'tbl'), link('tbl', 'rowA'), link('tbl', 'rowB')], flows: [flow(['txs', 'lm', 'tbl', 'rowA'], { kind: 'write', rate: 1.4 })] },
    },
    {
      short: 'Deadlock',
      kind: 'problem',
      title: 'Waiting, cycles and deadlock detection',
      body: [
        'A <b>deadlock</b> is a cycle of waiters: T1 holds row A and wants B; T2 holds B and wants A. Neither can proceed, so something must break the cycle. Engines build a <b>wait-for graph</b> (edges transaction → transaction it waits for) and look for a cycle — continuously, or after a delay: PostgreSQL waits <code>deadlock_timeout</code> (1 s default) and then checks, because most waits resolve by themselves; InnoDB checks on each wait. They pick a <b>victim</b> (often the cheapest to roll back, fewest rows changed or youngest), abort it with an error (<code>SQLSTATE 40P01</code> / MySQL 1213) and let the others continue.',
        'Systems without detection use <b>lock timeouts</b> (wait N seconds, then fail) — simple, but slow to resolve and prone to false positives under load. Either way <b>the application must retry</b> a deadlock-aborted transaction (it is a retryable error, not a bug in isolation) with backoff and jitter; code that surfaces deadlocks to users as failures needs fixing. Deadlocks are <i>expected</i> at scale: the question is the rate.',
      ],
      changes: [{ text: 'Cycle in the wait-for graph → abort a victim', tone: 'info' }, { text: 'Retry deadlock errors with backoff; they are normal', tone: 'good' }],
      scene: { nodes: [txs({ tag: pill('T1 → B, T2 → A', 'alert', 'warn') }), lm(), wfg({ tag: pill('cycle: T1 ⇄ T2', 'alert', 'bad') }), rowA({ tag: pill('held by T1', 'lock') }), rowB({ tag: pill('held by T2', 'lock') })], links: [link('txs', 'lm'), link('lm', 'wfg'), link('lm', 'rowA'), link('lm', 'rowB')], flows: [flow(['txs', 'lm', 'wfg'], { kind: 'fail', rate: 1.6 })] },
    },
    {
      short: 'Model',
      kind: 'insight',
      title: 'How often deadlocks happen: n·k⁴ ÷ 4N²',
      body: [
        'A first-order model (Gray et al., “The Dangers of Replication”): with <b>n</b> concurrent transactions each locking <b>k</b> random rows out of <b>N</b>, a lock request meets about n·k/2 held locks among N rows, so a transaction <b>waits</b> with probability ≈ <code>n·k² ÷ 2N</code>. A deadlock needs a cycle of waits, and its probability is ≈ <code>PW² ÷ n = n·k⁴ ÷ 4N²</code>. With 50 transactions, 10 rows each and 100,000 contended rows: PW = 50 × 100 ÷ 200,000 = <b>2.5%</b>; PD = 50 × 10,000 ÷ (4 × 10¹⁰) = <b>1.25×10⁻⁵</b> per transaction — at 2,000 txn/s that is <b>90 deadlocks an hour</b>. Rare per transaction, constant in aggregate.',
        'The exponents tell you what to attack: deadlocks scale with <b>k⁴</b> — doubling the rows a transaction locks multiplies the rate by <b>16</b> — with n (linear) and with <b>1/N²</b>: concentrating access on a hot set of 10,000 rows instead of 100,000 raises it <b>100×</b>. So: <b>lock fewer rows</b> (small transactions, index every filter, no read-then-write of ranges), <b>access resources in a consistent global order</b> (sort ids before updating: eliminates the cycle entirely for those paths), keep transactions <b>short</b> (no user or network waits inside), avoid hot rows (see the Hot Account lesson), use <b>optimistic concurrency</b> (version column, retry) where conflicts are rare, <code>SELECT … FOR UPDATE SKIP LOCKED</code> for queue-style tables, and consider lower isolation levels deliberately. Figures here are model outputs; real access is skewed, so measured rates are usually worse.',
      ],
      changes: [{ text: 'PW ≈ n·k²/2N = 2.5%; PD ≈ n·k⁴/4N² = 1.25×10⁻⁵', tone: 'info' }, { text: '2× rows per transaction → 16× deadlocks; 10× hotter set → 100×', tone: 'bad' }, { text: 'Consistent lock order, short transactions, indexes, optimistic retries', tone: 'good' }],
      scene: { nodes: [txs({ tag: pill('50 txns × 10 rows', 'list') }), lm({ tag: pill('2.5% wait · 90 deadlocks/h', 'clock', 'warn') }), wfg({ tag: pill('victim → retry', 'refresh', 'good') })], links: [link('txs', 'lm'), link('lm', 'wfg')], flows: [flow(['txs', 'lm'], { kind: 'write', rate: 1.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Short, ordered, indexed transactions keep the queue short',
      body: [
        '<b>Locks</b> (S/X/U, row to table, intent and gap locks) enforce isolation; waiters queue FIFO; <b>deadlocks</b> are wait-for cycles resolved by aborting a victim that the application must retry. Their rate follows <b>n·k⁴ ÷ 4N²</b>: 90 an hour in the example, 16× more with double the rows per transaction.',
        'Reduce k, order locks consistently, keep transactions short, index filters, avoid hot rows, and retry.',
      ],
      scene: { nodes: [txs(), lm(), tbl(), rowA(), rowB()], links: [link('txs', 'lm'), link('lm', 'tbl'), link('tbl', 'rowA'), link('tbl', 'rowB')], flows: [flow(['txs', 'lm', 'tbl', 'rowA'], { kind: 'write', rate: 1.4 })] },
    },
  ],
};

export default lesson;
