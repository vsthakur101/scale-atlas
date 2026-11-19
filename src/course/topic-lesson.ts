import type { IconName } from '../engine/icons';
import type { DynamicLessonModel, DynamicParameter, Lesson, Level, MetricDef, MetricValue, Step, Tone } from '../types';
import { box, crowd, flow, link, pill, you } from './kit';

export interface TopicLessonOptions {
  slug: string;
  title: string;
  module: string;
}

function stableNumber(text: string, seed: number, min: number, max: number): number {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  const unit = (hash >>> 0) / 0x100000000;
  return min + Math.round(unit * (max - min));
}

function formatRate(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace('.0', '')}k/s`;
  return `${n}/s`;
}

function formatBytes(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace('.0', '')} GB`;
  return `${n} MB`;
}

interface ModuleContext {
  tone: Tone;
  level: Level;
  minutes: number;
  core: string;
  mechanism: string;
  tradeoff: string;
  caseStudy: string;
  recap: string;
  coreName: string;
  coreIcon: IconName;
  storeName: string;
  storeIcon: IconName;
  metrics: MetricDef[];
  legend: Lesson['legend'];
}

const contexts: Record<string, ModuleContext> = {
  'API and Web Development': {
    tone: 'orange', level: 'Intermediate', minutes: 8,
    core: 'Start at the contract between caller and service: resource shape, transport, status, versioning, and failure semantics.',
    mechanism: 'A small, predictable API moves validation and authorization to well-defined boundaries, then exposes only the data and operations callers need.',
    tradeoff: 'Convenience at the edge often adds coupling or fan-out. Optimise round trips and payload size without weakening validation or retry safety.',
    caseStudy: 'A client sends the same request twice after a timeout. The API must return the same logical result and avoid repeating a charge, write, or side effect.',
    recap: 'Design the API from caller behavior, make errors actionable, and define retry and compatibility rules before adding transport optimisations.',
    coreName: 'API gateway', coreIcon: 'route', storeName: 'Backend', storeIcon: 'server',
    metrics: [
      { key: 'calls', label: 'Calls', icon: 'refresh' },
      { key: 'payload', label: 'Payload', icon: 'file' },
      { key: 'latency', label: 'Latency', icon: 'timer' },
      { key: 'safe', label: 'Retry safety', icon: 'shield' },
    ],
    legend: ['request', 'response', 'heavy', 'fail'],
  },
  'Real World Case Studies': {
    tone: 'grey', level: 'Advanced', minutes: 11,
    core: 'A case study starts with measurable requirements: traffic shape, data volume, latency, correctness, budget, and failure tolerance.',
    mechanism: 'Trace the critical request through the design, place queues or caches where work is expensive, and make each stateful component replaceable or replicated.',
    tradeoff: 'Real architectures grow around organisational constraints as much as technical ones. Preserve observability and rollback paths when simplifying a worked system.',
    caseStudy: 'A busy product launch creates both a traffic spike and a failure pattern the original steady-state test missed. Add capacity only after locating the bottleneck.',
    recap: 'Use the case as a constraint-solving exercise: state assumptions, trace one request, defend capacity decisions, and name the remaining risks.',
    coreName: 'System path', coreIcon: 'route', storeName: 'Primary state', storeIcon: 'db',
    metrics: [
      { key: 'traffic', label: 'Traffic', icon: 'activity' },
      { key: 'p99', label: 'p99', icon: 'timer' },
      { key: 'capacity', label: 'Capacity', icon: 'cpu' },
      { key: 'risk', label: 'Risk', icon: 'shield' },
    ],
    legend: ['request', 'response', 'heavy', 'fail', 'write'],
  },
  'AI and Machine Learning': {
    tone: 'purple', level: 'Advanced', minutes: 10,
    core: 'Separate model inference from product data flow: inputs, feature retrieval, model serving, guardrails, and post-processing are distinct stages.',
    mechanism: 'Measure serving cost and queue delay, version models and schemas, cache safe results, and keep the training-data and inference-time features consistent.',
    tradeoff: 'A larger or fresher model can improve quality while increasing latency, cost, and operational risk. Treat quality thresholds and fallbacks as first-class requirements.',
    caseStudy: 'A model that passes offline benchmarks times out in production because a feature lookup fan-out dominates request latency.',
    recap: 'Build an observable inference pipeline, define quality and latency budgets, and keep a deterministic or cached fallback for model failures.',
    coreName: 'Model router', coreIcon: 'cpu', storeName: 'Features', storeIcon: 'db',
    metrics: [
      { key: 'quality', label: 'Quality', icon: 'gauge' },
      { key: 'latency', label: 'Latency', icon: 'timer' },
      { key: 'cost', label: 'Cost/run', icon: 'scale' },
      { key: 'fallback', label: 'Fallback', icon: 'shield' },
    ],
    legend: ['request', 'response', 'heavy', 'fail'],
  },
  'Database and Storage': {
    tone: 'purple', level: 'Intermediate', minutes: 9,
    core: 'Choose storage from access patterns, consistency needs, write volume, query shape, retention, and recovery requirements.',
    mechanism: 'Data structures and storage engines turn those requirements into indexes, replication, partitions, and durable write behaviour.',
    tradeoff: 'Every index, replica, and consistency guarantee improves a workload while consuming storage or write capacity. Avoid protecting more than the system can justify.',
    caseStudy: 'A write succeeds but a rapid read misses it. Decide whether the business needs a leader read, replica read, or explicit retry before changing topology.',
    recap: 'State the read/write shape, pick a consistency model, isolate hot partitions, and verify recovery with the same traffic profile.',
    coreName: 'Data service', coreIcon: 'db', storeName: 'Storage', storeIcon: 'disk',
    metrics: [
      { key: 'reads', label: 'Reads/s', icon: 'search' },
      { key: 'writes', label: 'Writes/s', icon: 'file' },
      { key: 'lag', label: 'Lag', icon: 'timer' },
      { key: 'durability', label: 'Durability', icon: 'shield' },
    ],
    legend: ['request', 'response', 'write', 'heavy', 'fail'],
  },
  'Technical Interviews': {
    tone: 'yellow', level: 'Beginner', minutes: 8,
    core: 'Turn an interview prompt into requirements before choosing components. Ask about scale, read/write ratio, latency, consistency, security, and growth.',
    mechanism: 'Establish the critical data entities and operations, draw the synchronous and asynchronous paths, then state bottlenecks and failure modes.',
    tradeoff: 'A polished architecture without estimates is weak. A pile of estimates without a user-visible flow is weak too; connect numbers to decisions.',
    caseStudy: 'A recruiter expects a URL shortener design. The answer should derive read traffic, storage, redirect latency, expiry, and collision handling from stated scale.',
    recap: 'Lead with clarifications, give a simple first design, scale the bottlenecks, and close with trade-offs, monitoring, and a focused failure scenario.',
    coreName: 'Design flow', coreIcon: 'route', storeName: 'Data', storeIcon: 'db',
    metrics: [
      { key: 'qps', label: 'QPS', icon: 'activity' },
      { key: 'data', label: 'Data/day', icon: 'layers' },
      { key: 'p99', label: 'p99', icon: 'timer' },
      { key: 'trade', label: 'Trade-offs', icon: 'scale' },
    ],
    legend: ['request', 'response', 'heavy', 'write'],
  },
  'Caching & Performance': {
    tone: 'green', level: 'Intermediate', minutes: 9,
    core: 'Caching works only when it removes measurable work or latency while preserving the required freshness and correctness boundaries.',
    mechanism: 'Choose the cache level, key, TTL or invalidation rule, and miss behavior. Track hit ratio, memory cost, stampedes, and stale-data risk.',
    tradeoff: 'A longer TTL improves hit rate and speed but can serve stale data. A shorter TTL stays fresh but costs origin capacity and may miss burst traffic.',
    caseStudy: 'One popular key expires and sends thousands of misses to the database at once. A request coalescing or stale-while-revalidate design can absorb the spike.',
    recap: 'Cache only the right work, verify freshness, protect the origin from miss storms, and monitor hit ratio alongside user-visible latency.',
    coreName: 'Cache tier', coreIcon: 'bolt', storeName: 'Origin', storeIcon: 'db',
    metrics: [
      { key: 'hit', label: 'Hit ratio', icon: 'gauge' },
      { key: 'latency', label: 'Latency', icon: 'timer' },
      { key: 'stale', label: 'Staleness', icon: 'clock' },
      { key: 'load', label: 'Origin load', icon: 'cpu' },
    ],
    legend: ['request', 'response', 'hit', 'heavy', 'fail'],
  },
  'Payment and Fintech': {
    tone: 'teal', level: 'Advanced', minutes: 11,
    core: 'Financial systems require explicit state transitions, immutable evidence, idempotency, reconciliation, and clear responsibility for every failure state.',
    mechanism: 'Record intent and settlement as durable transitions, isolate external payment calls, and reconcile local state with provider and ledger records.',
    tradeoff: 'Strong consistency and exact audit trails improve correctness but can reduce availability and throughput. Use the strongest guarantee only for money movement.',
    caseStudy: 'The client retries after a network timeout. An idempotency key must map to one provider operation and one internal ledger entry.',
    recap: 'Model money as state transitions, make retries deterministic, reconcile asynchronously, and make every amount and currency explicit.',
    coreName: 'Payment service', coreIcon: 'shield', storeName: 'Ledger', storeIcon: 'db',
    metrics: [
      { key: 'risk', label: 'Financial risk', icon: 'shield' },
      { key: 'p99', label: 'p99', icon: 'timer' },
      { key: 'dupes', label: 'Duplicates', icon: 'refresh' },
      { key: 'audit', label: 'Audit trail', icon: 'file' },
    ],
    legend: ['request', 'response', 'write', 'fail', 'handshake'],
  },
  'Software Architecture': {
    tone: 'red', level: 'Advanced', minutes: 10,
    core: 'Architecture allocates responsibilities and change boundaries. It should make dependencies, ownership, scaling, and failure domains explicit.',
    mechanism: 'Define stable interfaces, isolate stateful components, and let independent teams deploy and scale the pieces that have genuinely different needs.',
    tradeoff: 'Distribution adds network calls, partial failures, deployment coordination, and debugging cost. It is justified only when the boundary creates enough independent benefit.',
    caseStudy: 'A single deploy begins to block unrelated teams. The system is split at one genuine ownership boundary first, rather than decomposing every module.',
    recap: 'Choose boundaries from ownership and change rate, then verify that the resulting system is simpler to operate, not merely more distributed.',
    coreName: 'Service', coreIcon: 'server', storeName: 'Owned state', storeIcon: 'db',
    metrics: [
      { key: 'coupling', label: 'Coupling', icon: 'link' },
      { key: 'deploy', label: 'Deploy time', icon: 'refresh' },
      { key: 'latency', label: 'Network cost', icon: 'timer' },
      { key: 'blast', label: 'Blast radius', icon: 'shield' },
    ],
    legend: ['request', 'response', 'heavy', 'fail'],
  },
  'DevTools & Productivity': {
    tone: 'sand', level: 'Intermediate', minutes: 8,
    core: 'Developer tools should shorten a repeated feedback loop while making results reproducible across machines and pipelines.',
    mechanism: 'Cache stable work, isolate dependencies, make outputs deterministic, and expose clear errors instead of hiding tool state behind the interface.',
    tradeoff: 'More automation shortens execution but can hide failures or consume storage. Preserve inspectable logs and enough metadata to reproduce a run.',
    caseStudy: 'A build succeeds locally but fails in CI. The tool identifies environment drift and invalidates only the affected cached step.',
    recap: 'Measure the loop, automate the repeated work, isolate inputs and outputs, and make failures actionable rather than merely faster.',
    coreName: 'Tool runner', coreIcon: 'cpu', storeName: 'Artifacts', storeIcon: 'disk',
    metrics: [
      { key: 'loop', label: 'Feedback loop', icon: 'timer' },
      { key: 'repro', label: 'Reproducible', icon: 'check' },
      { key: 'cache', label: 'Cache reuse', icon: 'bolt' },
      { key: 'debug', label: 'Debug time', icon: 'search' },
    ],
    legend: ['request', 'response', 'handshake', 'heavy'],
  },
  'Software Development': {
    tone: 'blue', level: 'Intermediate', minutes: 9,
    core: 'Good software practice makes behavior observable, changeable, and safe to test. Understand the user-visible outcome before choosing an implementation.',
    mechanism: 'Separate inputs, decisions, side effects, and outputs; automate checks at boundaries; and keep data and error contracts explicit.',
    tradeoff: 'Strong abstraction can improve reuse and testability, while too much abstraction delays simple delivery. Optimize for the next change you actually expect.',
    caseStudy: 'A feature works in a happy-path unit test but fails at a timeout boundary. The test now exercises the real retry and state transition.',
    recap: 'Keep contracts clear, tests close to risk, and implementation changes small enough to inspect and roll back.',
    coreName: 'Application', coreIcon: 'server', storeName: 'State', storeIcon: 'db',
    metrics: [
      { key: 'feedback', label: 'Feedback', icon: 'timer' },
      { key: 'coverage', label: 'Risk coverage', icon: 'gauge' },
      { key: 'change', label: 'Change cost', icon: 'scale' },
      { key: 'defects', label: 'Escaped defects', icon: 'shield' },
    ],
    legend: ['request', 'response', 'write', 'fail', 'handshake'],
  },
  'Cloud & Distributed Systems': {
    tone: 'blue', level: 'Advanced', minutes: 11,
    core: 'Distributed systems assume partial failure, network delay, clock skew, and independent availability domains.',
    mechanism: 'Define ownership and message ordering, replicate work or state, observe queue age and lag, and give every remote operation a timeout and recovery path.',
    tradeoff: 'Global reach and independent scaling improve availability but complicate ordering and consistency. Put the strongest coordination at the smallest necessary boundary.',
    caseStudy: 'One zone becomes unreachable. Work already accepted must drain safely, while new work routes to healthy domains and never double-applies a message.',
    recap: 'Specify the failure model, use bounded retries and idempotency, preserve ordering where needed, and test partial-region loss.',
    coreName: 'Distributed service', coreIcon: 'server', storeName: 'Replica', storeIcon: 'db',
    metrics: [
      { key: 'qps', label: 'Throughput', icon: 'activity' },
      { key: 'lag', label: 'Replica lag', icon: 'timer' },
      { key: 'zone', label: 'Zones', icon: 'globe' },
      { key: 'spof', label: 'SPOF', icon: 'shield' },
    ],
    legend: ['request', 'response', 'write', 'fail', 'handshake'],
  },
  'How it Works?': {
    tone: 'yellow', level: 'Beginner', minutes: 8,
    core: 'Start with the outside event, then follow bytes and control flow across each component until a result is returned or durably recorded.',
    mechanism: 'Name the protocol, state transition, and responsibility at every boundary. Hidden work becomes visible as queues, caches, stores, or network calls.',
    tradeoff: 'A single simplified view is memorable, while the full implementation has retries, limits, caches, and failures. Show the happy path first and preserve the exception path.',
    caseStudy: 'A familiar action appears instant to the user. Tracing it reveals DNS, a connection, application work, storage, cache, and a response.',
    recap: 'Explain the journey in order, identify state changes, and add only the failures that materially alter the answer.',
    coreName: 'Middle stage', coreIcon: 'route', storeName: 'Destination', storeIcon: 'db',
    metrics: [
      { key: 'steps', label: 'Stages', icon: 'layers' },
      { key: 'latency', label: 'Latency', icon: 'timer' },
      { key: 'state', label: 'State changes', icon: 'file' },
      { key: 'hops', label: 'Network hops', icon: 'globe' },
    ],
    legend: ['request', 'response', 'handshake', 'heavy'],
  },
  'DevOps and CI/CD': {
    tone: 'sand', level: 'Intermediate', minutes: 9,
    core: 'Delivery is a controlled pipeline: build once, test the artifact, promote it through environments, and keep an observable rollback route.',
    mechanism: 'Separate source, artifact, release, and runtime state. Automate policy checks and deploys while preserving a deterministic artifact identity.',
    tradeoff: 'Fast rollouts reduce exposure to old behavior but increase simultaneous-version complexity. Slow rollouts are safer to inspect but keep defects live longer.',
    caseStudy: 'A canary passes health checks but a small cohort sees an error. Traffic is diverted while the artifact and previous configuration remain available.',
    recap: 'Automate only a repeatable release path, gate by evidence, ship incrementally, and define rollback before the deploy begins.',
    coreName: 'Release pipeline', coreIcon: 'route', storeName: 'Artifact', storeIcon: 'disk',
    metrics: [
      { key: 'lead', label: 'Lead time', icon: 'timer' },
      { key: 'success', label: 'Deploy success', icon: 'check' },
      { key: 'rollback', label: 'Rollback', icon: 'refresh' },
      { key: 'canary', label: 'Canary', icon: 'gauge' },
    ],
    legend: ['request', 'response', 'handshake', 'fail'],
  },
  'Security': {
    tone: 'teal', level: 'Advanced', minutes: 10,
    core: 'Security begins with assets, trust boundaries, identities, permissions, and threat scenarios—not a checklist of tools.',
    mechanism: 'Authenticate the subject, authorize the action, validate inputs, encrypt protected data in transit and at rest, and record a tamper-resistant audit trail.',
    tradeoff: 'Stronger controls can add latency or block legitimate workflows. Keep the protection proportional to the data and define fail-safe behavior.',
    caseStudy: 'A stolen token is replayed. Short-lived credentials, audience validation, rotation, revocation, and anomaly monitoring limit the damage.',
    recap: 'Minimise trust and privileges, assume compromise, verify every boundary, and test both detection and recovery.',
    coreName: 'Policy gateway', coreIcon: 'shield', storeName: 'Audit log', storeIcon: 'disk',
    metrics: [
      { key: 'trust', label: 'Trust boundaries', icon: 'layers' },
      { key: 'latency', label: 'Check latency', icon: 'timer' },
      { key: 'access', label: 'Access width', icon: 'lock' },
      { key: 'detect', label: 'Detection', icon: 'search' },
    ],
    legend: ['request', 'response', 'handshake', 'fail'],
  },
  'Computer Fundamentals': {
    tone: 'yellow', level: 'Beginner', minutes: 8,
    core: 'Follow the work through CPU, memory, storage, and the network. Performance changes because each resource has a different unit of cost and latency.',
    mechanism: 'Locality keeps data close to computation, caches hide memory and storage delays, and batching amortises fixed software or device costs.',
    tradeoff: 'Faster memory is smaller or more expensive; disk and network operations are slower but persistent or shared. Represent the resource bottleneck explicitly.',
    caseStudy: 'A program repeatedly rereads a file. Adding a memory cache removes repeated I/O, but stale or unbounded cached state introduces new limits.',
    recap: 'Identify the resource, its latency, and its capacity. Move work or data only when the end-to-end benefit is larger than the coordination cost.',
    coreName: 'Processor', coreIcon: 'cpu', storeName: 'Storage', storeIcon: 'disk',
    metrics: [
      { key: 'latency', label: 'Latency', icon: 'timer' },
      { key: 'bandwidth', label: 'Bandwidth', icon: 'activity' },
      { key: 'memory', label: 'Memory', icon: 'layers' },
      { key: 'util', label: 'Utilisation', icon: 'gauge' },
    ],
    legend: ['request', 'response', 'heavy', 'handshake'],
  },
};

export function makeTopicLesson({ slug, title, module }: TopicLessonOptions): Lesson {
  const ctx = contexts[module] ?? contexts['How it Works?']!;
  const parameters: DynamicParameter[] = [
    { key: 'traffic', label: 'Traffic', min: 100, max: 20_000, step: 100, default: 3_000, unit: 'req/s', description: 'Illustrative incoming request rate.' },
    { key: 'capacity', label: 'Target capacity', min: 10, max: 95, step: 5, default: 65, unit: '%', description: 'Illustrative usable capacity.' },
    { key: 'failure', label: 'Failure rate', min: 0, max: 50, step: 1, default: 5, unit: '%', description: 'Illustrative degraded or failed work.' },
  ];
  const stepMetrics = (
    input: Record<string, number>,
    stepIndex: number,
  ): Record<string, string | MetricValue> => {
    const traffic = input.traffic ?? 3_000;
    const capacity = input.capacity ?? 65;
    const failure = input.failure ?? 5;
    const rho = Math.min(0.97, (traffic / 10_000) / (capacity / 100));
    const queueFactor = rho >= 0.97 ? 60 : 1 + (3 * rho * rho) / (1 - rho);
    const baseLatency = stableNumber(title, stepIndex + 1, 22, 360);
    const stepFactor = [1, 0.82, 0.68, 0.74, 1.85, 0.72][stepIndex] ?? 1;
    const result: Record<string, string | MetricValue> = {};
    for (const metric of ctx.metrics) {
      const factor = stepFactor;
      const seed = stepIndex + 1;
      let value = '';
      let tone: 'good' | 'bad' | 'warn' | undefined;
      const key = metric.key;

      if (key === 'latency' || key === 'p99' || key === 'lag' || key === 'loop' || key === 'lead' || key === 'feedback' || key === 'deploy') {
        const adjusted = Math.round(baseLatency * queueFactor * factor * (1 + failure / 100));
        value = `~${adjusted} ms`;
        tone = rho > 0.85 || stepIndex === 4 ? 'bad' : rho < 0.55 && stepIndex !== 4 ? 'good' : 'warn';
      } else if (key === 'qps' || key === 'traffic' || key === 'rps' || key === 'reads' || key === 'writes' || key === 'calls') {
        const adjusted = key === 'reads' ? Math.round(traffic * 0.9) : key === 'writes' ? Math.round(traffic * 0.1) : traffic;
        value = key === 'calls' ? `~${Math.max(1, Math.round(adjusted / 900))} calls` : `~${formatRate(adjusted)}`;
        tone = failure >= 25 ? 'bad' : rho > 0.85 ? 'warn' : undefined;
      } else if (key === 'payload') {
        const kb = stableNumber(title, seed, 18, 240);
        value = `~${Math.round(kb * factor * (1 + failure / 100))} KB`;
        tone = factor > 1.4 ? 'bad' : factor < 0.8 ? 'good' : undefined;
      } else if (key === 'data') {
        value = `~${formatBytes(Math.round(traffic * 0.004 * (800 + stableNumber(title, seed, 0, 1200))))}`;
      } else if (key === 'capacity' || key === 'memory') {
        const pct = Math.round(capacity * (stepIndex === 4 ? 0.72 : stepIndex === 5 ? 1 : factor));
        value = `${Math.min(pct, 99)}%`;
        tone = pct > 90 ? 'bad' : pct < 60 ? 'good' : 'warn';
      } else if (key === 'bandwidth') {
        value = `${stableNumber(title, seed, 120, 9_000)} Mb/s`;
      } else if (key === 'util') {
        const pct = Math.round(rho * 100);
        const adjusted = stepIndex === 4 ? Math.min(99, pct + 18) : Math.max(20, pct);
        value = `${adjusted}%`;
        tone = adjusted > 90 ? 'bad' : adjusted < 65 ? 'good' : 'warn';
      } else if (key === 'hit') {
        const pct = Math.round(Math.min(99, capacity * 0.85 + stableNumber(title, seed, 5, 20) - failure * 0.5) * (stepIndex === 4 ? 0.72 : 1));
        value = `${Math.min(pct, 99)}%`;
        tone = pct >= 90 ? 'good' : pct < 70 ? 'bad' : 'warn';
      } else if (key === 'quality' || key === 'success' || key === 'coverage' || key === 'repro' || key === 'canary' || key === 'detect') {
        const pct = Math.round(stableNumber(title, seed, 82, 99) * (stepIndex === 4 ? 0.88 : factor === 1 ? 1 : 0.94));
        value = `${Math.min(pct, 99)}%`;
        tone = pct >= 95 ? 'good' : pct < 85 ? 'bad' : 'warn';
      } else if (key === 'stale' || key === 'lag') {
        const seconds = Math.round(stableNumber(title, seed, 1, 90) * factor);
        value = `${seconds}s`;
        tone = seconds > 60 ? 'bad' : seconds < 10 ? 'good' : 'warn';
      } else if (key === 'origin load' || key === 'load') {
        const pct = stableNumber(title, seed, 35, 82);
        const adjusted = stepIndex === 4 ? Math.min(99, pct + 20) : Math.round(pct * factor);
        value = `${adjusted}%`;
        tone = adjusted > 85 ? 'bad' : adjusted < 55 ? 'good' : 'warn';
      } else if (key === 'zone' || key === 'zones') {
        value = stepIndex === 4 ? '1/3 available' : `${stableNumber(title, seed, 2, 3)} zones`;
        tone = stepIndex === 4 ? 'bad' : 'good';
      } else if (key === 'spof') {
        value = stepIndex === 4 ? '1 exposed' : stepIndex === 5 ? '0 exposed' : `${stableNumber(title, seed, 0, 2)} exposed`;
        tone = value === '0 exposed' ? 'good' : stepIndex === 4 ? 'bad' : 'warn';
      } else if (key === 'risk' || key === 'financial risk') {
        const score = Math.round(stableNumber(title, seed, 20, 80) * (stepIndex === 4 ? 1.25 : factor));
        value = `${Math.min(score, 100)}/100 risk`;
        tone = score >= 80 ? 'bad' : score <= 35 ? 'good' : 'warn';
      } else if (key === 'safe' || key === 'rollback' || key === 'fallback' || key === 'repro' || key === 'durability' || key === 'audit') {
        const pct = Math.round(stableNumber(title, seed, 55, 96) * (stepIndex === 4 ? 0.8 : factor));
        value = `${Math.min(pct, 99)}% verified`;
        tone = pct >= 90 ? 'good' : pct < 70 ? 'bad' : 'warn';
      } else if (key === 'dupes') {
        const count = stepIndex === 5 ? 0 : Math.round(stableNumber(title, seed, 0, 8) * factor);
        value = `${count} duplicates`;
        tone = count === 0 ? 'good' : count >= 5 ? 'bad' : 'warn';
      } else if (key === 'trade') {
        value = `${stableNumber(title, seed, 2, 5)} trade-offs`;
      } else if (key === 'coupling') {
        value = `${stableNumber(title, seed, 3, 8)} dependencies`;
        tone = stepIndex === 5 ? 'good' : 'warn';
      } else if (key === 'blast') {
        value = stepIndex === 4 ? 'multi-service' : stepIndex === 5 ? 'isolated' : 'bounded';
        tone = stepIndex === 4 ? 'bad' : stepIndex === 5 ? 'good' : 'warn';
      } else if (key === 'hops') {
        value = `${stableNumber(title, seed, 3, 9)} hops`;
      } else if (key === 'steps') {
        value = `${stableNumber(title, seed, 4, 10)} stages`;
      } else if (key === 'state') {
        value = stepIndex === 4 ? 'degraded' : stepIndex === 5 ? 'consistent' : `${stableNumber(title, seed, 2, 7)} states`;
        tone = stepIndex === 4 ? 'bad' : stepIndex === 5 ? 'good' : undefined;
      } else if (key === 'cost') {
        value = `$${stableNumber(title, seed, 40, 900)}/run`;
        tone = stepIndex === 4 ? 'bad' : stepIndex === 3 ? 'warn' : undefined;
      } else if (key === 'trust' || key === 'access') {
        value = `${stableNumber(title, seed, 2, 12)} boundaries`;
      } else if (key === 'change' || key === 'feedback' || key === 'coverage' || key === 'defects') {
        value = `${stableNumber(title, seed, 1, 40)} measured`;
      } else {
        value = stepIndex === 4 ? 'degraded' : stepIndex === 5 ? 'verified' : 'measured';
      }

      result[metric.key] = tone ? { v: value, tone } : value;
    }
    return result;
  };
  const steps: Step[] = [
    {
      short: 'The question',
      kind: 'problem',
      title: `${title}: why it matters`,
      body: [
        `A team encounters <b>${title}</b> while operating a real system. The first problem is not choosing a tool; it is defining the user outcome, constraint, and failure mode that the topic has to handle.`,
        ctx.core,
      ],
      concepts: [{ term: title, def: `A system-design topic that describes one constraint, mechanism, or trade-off relevant to ${module}.` }],
      scene: {
        nodes: [you('client', -10, 1, { label: pill('user demand', 'wifi') }), box('gateway', 0, 0, ctx.coreName, ctx.tone, ctx.coreIcon), box('store', 9, 0, ctx.storeName, 'purple', ctx.storeIcon)],
        links: [link('client', 'gateway', { arrow: 'both' }), link('gateway', 'store', { arrow: 'both' })],
        flows: [flow(['client', 'gateway'], { back: true, rate: 1 }), flow(['gateway', 'store'], { back: true, rate: 1 })],
      },
    },
    {
      short: 'Core idea',
      kind: 'technique',
      title: 'Separate the mechanism from the implementation',
      body: [
        ctx.core,
        ctx.mechanism,
      ],
      concepts: [{ term: 'Mechanism', def: 'The specific state, control-flow, or data-movement rule that provides the desired system behavior.' }],
      scene: {
        nodes: [you('client', -10, 1), box('gateway', 0, 0, ctx.coreName, ctx.tone, ctx.coreIcon, { tag: pill(title, 'bulb', 'accent') }), box('store', 9, 0, ctx.storeName, 'purple', ctx.storeIcon)],
        links: [link('client', 'gateway', { arrow: 'both' }), link('gateway', 'store', { arrow: 'both', label: pill('measured path') })],
        flows: [flow(['client', 'gateway', 'store'], { back: true, rate: 1.2 })],
      },
    },
    {
      short: 'Mechanics',
      kind: 'insight',
      title: 'Trace the normal path',
      body: [
        `The normal path for <b>${title}</b> begins with one request, carries state across a boundary, and ends in a returned result or durable side effect.`,
        'Document capacity and latency at every stage; a successful component-level check is not sufficient if the end-to-end requirement is exceeded.',
      ],
      concepts: [{ term: 'Critical path', def: 'The sequence of operations and dependencies that determines whether the end-to-end result completes within budget.' }],
      scene: {
        nodes: [you('client', -10, 1, { label: pill('request', 'arrowRight') }), box('gateway', 0, 0, ctx.coreName, ctx.tone, ctx.coreIcon, { load: 45 }), box('store', 9, 0, ctx.storeName, 'purple', ctx.storeIcon, { load: 35 })],
        links: [link('client', 'gateway', { arrow: 'both' }), link('gateway', 'store', { arrow: 'both' })],
        flows: [flow(['client', 'gateway', 'store'], { back: true, rate: 1.5, speed: 0.8 })],
      },
    },
    {
      short: 'Trade-offs',
      kind: 'tradeoff',
      title: 'Every benefit consumes another resource',
      body: [
        ctx.tradeoff,
        'Use a simple baseline before introducing the advanced form of the technique. Add complexity only when a measured bottleneck or explicit requirement proves it necessary.',
      ],
      note: { kind: 'warn', text: 'Avoid adopting a pattern because it appears common. Adopt it because the system’s requirements and failure model require it.' },
      concepts: [{ term: 'Trade-off', def: 'A design choice that improves one property while increasing cost or reducing another property.' }],
      scene: {
        nodes: [you('client', -10, 1), box('simple', -2, 0, 'Simple path', 'green', 'check'), box('advanced', 7, 0, 'Advanced path', ctx.tone, ctx.coreIcon, { tag: pill('added capacity', 'scale') }), box('store', 13, 0, ctx.storeName, 'purple', ctx.storeIcon)],
        links: [link('client', 'simple', { arrow: 'both' }), link('simple', 'store', { arrow: 'both', style: 'dashed' }), link('client', 'advanced', { arrow: 'both', style: 'dashed' }), link('advanced', 'store', { arrow: 'both' })],
        flows: [flow(['client', 'simple', 'store'], { back: true, rate: 0.8 }), flow(['client', 'advanced', 'store'], { kind: 'heavy', back: true, rate: 0.5 })],
      },
    },
    {
      short: 'Failure case',
      kind: 'case',
      title: 'Test the failure boundary',
      body: [
        ctx.caseStudy,
        'The design should name the retry limit, timeout, fallback, recovery owner, and signal that tells operators the condition is worsening.',
      ],
      changes: [{ text: 'Timeout or degraded dependency', tone: 'bad' }, { text: 'Fallback with bounded recovery', tone: 'good' }],
      concepts: [{ term: 'Fallback', def: 'A bounded alternative behavior used when the preferred path cannot meet its requirement.' }],
      scene: {
        nodes: [crowd('users', -10, 1, 10, 'mixed traffic'), box('gateway', 0, 0, ctx.coreName, ctx.tone, ctx.coreIcon, { state: 'hot', tag: pill('degraded', 'alert', 'bad') }), box('store', 9, 0, ctx.storeName, 'purple', ctx.storeIcon, { state: 'dim' }), box('fallback', 9, 7, 'Fallback', 'green', 'shield', { tag: pill('bounded', 'check', 'good') })],
        links: [link('users', 'gateway', { arrow: 'both' }), link('gateway', 'store', { arrow: 'both', style: 'broken' }), link('gateway', 'fallback', { arrow: 'both', style: 'dashed' })],
        flows: [flow(['users', 'gateway'], { kind: 'heavy', back: true, rate: 1.2 }), flow(['gateway', 'fallback'], { kind: 'hit', back: true, rate: 0.8 }), flow(['gateway', 'store'], { kind: 'fail', rate: 0.3 })],
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: `${title}: the design summary`,
      body: [
        ctx.recap,
        `For <b>${title}</b>, verify the outcome under normal load, partial failure, and recovery. Keep the metrics, ownership, and runbook connected to the architecture rather than letting them live in separate documents.`,
      ],
      note: { kind: 'key', text: 'A strong answer explains both how the mechanism works and why it is appropriate for the stated constraints.' },
      scene: {
        nodes: [you('client', -10, 1, { label: pill('requirement', 'check', 'good') }), box('gateway', 0, 0, ctx.coreName, ctx.tone, ctx.coreIcon, { tag: pill(title, 'bulb', 'accent') }), box('store', 9, 0, ctx.storeName, 'purple', ctx.storeIcon, { tag: pill('observed', 'gauge', 'good') })],
        links: [link('client', 'gateway', { arrow: 'both' }), link('gateway', 'store', { arrow: 'both' })],
        flows: [flow(['client', 'gateway', 'store'], { back: true, rate: 1.4 })],
      },
    },
  ];

  steps.forEach((step, index) => {
    step.scene.metrics = stepMetrics(
      { traffic: 3_000, capacity: 65, failure: 5 },
      index,
    );
  });

  const dynamic: DynamicLessonModel = {
    parameters,
    calculate: stepMetrics,
  };

  return {
    slug,
    title,
    blurb: `Understand ${title} through one request, its core mechanism, trade-offs, and a realistic failure case.`,
    minutes: ctx.minutes,
    level: ctx.level,
    metrics: ctx.metrics,
    goals: [
      { text: `Explain when ${title} is needed`, step: 1 },
      { text: 'Trace the normal mechanism through the system', step: 3 },
      { text: 'Describe the primary trade-off and failure boundary', step: 5 },
    ],
    legend: ctx.legend,
    steps,
    dynamic,
  };
}
