import type { CompType, Design, LabNode, Traffic } from './model';
import type { SimResult } from './sim';

export type Goal =
  | { kind: 'errors'; max: number }
  | { kind: 'p99'; max: number }
  | { kind: 'cost'; max: number }
  | { kind: 'persist' }
  | { kind: 'spof' }
  | { kind: 'backlog' };

export interface Challenge {
  id: string;
  title: string;
  brief: string;
  traffic: Traffic;
  goals: Goal[];
  starter: Design;
  solution: Design;
  /** lessons that teach what this challenge needs */
  refs: { slug: string; step: number; label: string }[];
}

export interface GoalStatus {
  pass: boolean;
  label: string;
  value: string;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function evaluate(goal: Goal, r: SimResult): GoalStatus {
  switch (goal.kind) {
    case 'errors':
      return { pass: r.errorRate * 100 < goal.max, label: `Errors under ${goal.max}%`, value: `${(r.errorRate * 100).toFixed(r.errorRate < 0.1 ? 2 : 0)}%` };
    case 'p99':
      return { pass: r.p99 > 0 && r.p99 < goal.max, label: `p99 under ${goal.max} ms`, value: r.p99 ? `${Math.round(r.p99)} ms` : '—' };
    case 'cost':
      return { pass: r.cost <= goal.max, label: `Cost at most ${money(goal.max)}/mo`, value: money(r.cost) };
    case 'persist':
      return { pass: r.persisted > 0.99, label: 'Writes are stored in a database', value: `${Math.round(r.persisted * 100)}%` };
    case 'spof':
      return { pass: r.spofs.length === 0, label: 'No single point of failure', value: r.spofs.length ? `${r.spofs.length} found` : 'none' };
    case 'backlog':
      return { pass: r.backlog < 1, label: 'Async work keeps up (no backlog)', value: r.backlog < 1 ? 'keeping up' : `+${Math.round(r.backlog)}/s` };
  }
}

// ── compact design builder: n('app', 6) → id "app", count 6 ──
type Spec = [id: string, type: CompType, count?: number, standby?: boolean];
const design = (traffic: Traffic, nodes: Spec[], links: [string, string][]): Design => ({
  traffic,
  nodes: nodes.map(([id, type, count = 1, standby]): LabNode => ({ id, type, count, ...(standby ? { standby } : {}) })),
  edges: links.map(([from, to]) => ({ from, to })),
});

const t1: Traffic = { rps: 300, readPct: 90 };
const t2: Traffic = { rps: 3_000, readPct: 90 };
const t3: Traffic = { rps: 20_000, readPct: 95 };
const t4: Traffic = { rps: 2_000, readPct: 90 };
const t5: Traffic = { rps: 4_000, readPct: 50 };

export const CHALLENGES: Challenge[] = [
  {
    id: 'first-launch',
    title: 'First launch',
    brief: 'A small shop opens: 300 requests/s, 90% reads. Get requests answered and orders stored — nothing fancy.',
    traffic: t1,
    goals: [{ kind: 'errors', max: 1 }, { kind: 'p99', max: 200 }, { kind: 'persist' }, { kind: 'cost', max: 800 }],
    starter: design(t1, [['users', 'client']], []),
    solution: design(t1, [['users', 'client'], ['app', 'app'], ['db', 'db']], [['users', 'app'], ['app', 'db']]),
    refs: [{ slug: 'scale-up-out', step: 1, label: 'Everything on one server' }],
  },
  {
    id: 'launch-day',
    title: 'Launch day',
    brief: 'You’re on the front page: 3,000 requests/s, 90% reads. One app server handles 800/s. Keep it fast and inside budget.',
    traffic: t2,
    goals: [{ kind: 'errors', max: 1 }, { kind: 'p99', max: 150 }, { kind: 'persist' }, { kind: 'cost', max: 1_500 }],
    starter: design(t2, [['users', 'client'], ['app', 'app'], ['db', 'db']], [['users', 'app'], ['app', 'db']]),
    solution: design(
      t2,
      [['users', 'client'], ['lb', 'lb'], ['app', 'app', 6], ['cache', 'cache'], ['db', 'db']],
      [['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['app', 'db'], ['cache', 'db']],
    ),
    refs: [
      { slug: 'load-balancers', step: 2, label: 'Put a load balancer in front' },
      { slug: 'latency-throughput', step: 3, label: 'The hockey stick' },
    ],
  },
  {
    id: 'read-storm',
    title: 'Read storm',
    brief: 'A viral catalogue: 20,000 requests/s, 95% reads, users everywhere. You can’t simply buy your way out — app servers max out at 30.',
    traffic: t3,
    goals: [{ kind: 'errors', max: 1 }, { kind: 'p99', max: 120 }, { kind: 'persist' }, { kind: 'cost', max: 3_000 }],
    starter: design(t3, [['users', 'client'], ['lb', 'lb'], ['app', 'app', 10], ['db', 'db']], [['users', 'lb'], ['lb', 'app'], ['app', 'db']]),
    solution: design(
      t3,
      [['users', 'client'], ['cdn', 'cdn'], ['lb', 'lb'], ['app', 'app', 22], ['cache', 'cache'], ['db', 'db']],
      [['users', 'cdn'], ['cdn', 'lb'], ['lb', 'app'], ['app', 'cache'], ['app', 'db'], ['cache', 'db']],
    ),
    refs: [
      { slug: 'cdn', step: 3, label: 'Put copies at the edge' },
      { slug: 'caching', step: 3, label: 'Hit rate is the whole game' },
    ],
  },
  {
    id: 'no-spof',
    title: 'No single point of failure',
    brief: '2,000 requests/s, 90% reads — and any one component may die at any time. Use Break mode to test your design.',
    traffic: t4,
    goals: [{ kind: 'spof' }, { kind: 'errors', max: 1 }, { kind: 'p99', max: 200 }, { kind: 'persist' }, { kind: 'cost', max: 2_500 }],
    starter: design(
      t4,
      [['users', 'client'], ['lb', 'lb'], ['app', 'app', 4], ['cache', 'cache'], ['db', 'db']],
      [['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['app', 'db'], ['cache', 'db']],
    ),
    solution: design(
      t4,
      [['users', 'client'], ['lb', 'lb', 2], ['app', 'app', 5], ['cache', 'cache', 2], ['db', 'db', 1, true]],
      [['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['app', 'db'], ['cache', 'db']],
    ),
    refs: [
      { slug: 'failover', step: 5, label: 'Headroom for a lost zone' },
      { slug: 'load-balancers', step: 8, label: 'A pair with a floating address' },
    ],
  },
  {
    id: 'write-burst',
    title: 'Write burst',
    brief: 'An event-ticketing drop: 4,000 requests/s and half are writes. The database can’t take every write synchronously and still answer reads quickly.',
    traffic: t5,
    goals: [{ kind: 'errors', max: 1 }, { kind: 'p99', max: 100 }, { kind: 'persist' }, { kind: 'backlog' }, { kind: 'cost', max: 3_000 }],
    starter: design(
      t5,
      [['users', 'client'], ['lb', 'lb'], ['app', 'app', 8], ['cache', 'cache'], ['db', 'db']],
      [['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['app', 'db'], ['cache', 'db']],
    ),
    solution: design(
      t5,
      [['users', 'client'], ['lb', 'lb'], ['app', 'app', 9], ['cache', 'cache'], ['queue', 'queue'], ['worker', 'worker', 5], ['db', 'db'], ['replica', 'replica']],
      [['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['app', 'queue'], ['app', 'db'], ['cache', 'replica'], ['queue', 'worker'], ['worker', 'db']],
    ),
    refs: [
      { slug: 'queues', step: 2, label: 'Put a queue in between' },
      { slug: 'replication', step: 2, label: 'Leader-follower replication' },
    ],
  },
];

export const SANDBOX_DEFAULT: Design = design(
  { rps: 1_000, readPct: 80 },
  [['users', 'client'], ['app', 'app'], ['db', 'db']],
  [['users', 'app'], ['app', 'db']],
);
