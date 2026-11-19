import type { Lesson } from '../../types';
import { box, flow, link, pill, you } from '../kit';

const lesson: Lesson = {
  slug: 'source-5-http-status-codes-that-should-never-have-been-created',
  title: 'HTTP Status Codes as System Signals',
  blurb: 'Status codes are part of an API contract: clients use them to decide whether to retry, fix input, or stop.',
  minutes: 8,
  level: 'Beginner',
  metrics: [
    { key: 'class', label: 'Class', icon: 'layers' },
    { key: 'retry', label: 'Retry?', icon: 'refresh' },
    { key: 'cache', label: 'Cacheable', icon: 'db' },
    { key: 'debug', label: 'Debug path', icon: 'search' },
  ],
  goals: [
    { text: 'Read status-code classes as client guidance', step: 1 },
    { text: 'Distinguish client, auth, rate, and server failures', step: 3 },
    { text: 'Design stable errors without leaking internals', step: 5 },
  ],
  legend: ['request', 'response', 'fail', 'handshake'],
  steps: [
    {
      short: 'Signal',
      kind: 'insight',
      title: 'The first digit narrows the decision',
      body: [
        'HTTP status codes are not decoration. The first digit tells the client which side owns the next action: 2xx succeeded, 3xx redirects or cache validation, 4xx asks the client to change something, and 5xx means the server failed to complete a valid request.',
        'A client can build safe defaults from that signal even when it does not understand every code.',
      ],
      concepts: [{ term: 'HTTP status code', def: 'A three-digit response signal describing the outcome of an HTTP request.' }],
      scene: {
        nodes: [you('client', -10, 1, { label: pill('API client', 'wifi') }), box('api', 0, 0, 'API', 'blue', 'server'), box('signal', 9, 0, 'Status signal', 'green', 'check', { tag: pill('2xx · 3xx · 4xx · 5xx') })],
        links: [link('client', 'api', { arrow: 'both' }), link('api', 'signal', { arrow: 'end' })],
        flows: [flow(['client', 'api'], { back: true, rate: 1.2 })],
        metrics: { class: '2xx–5xx', retry: 'depends', cache: 'depends', debug: 'status + body' },
      },
    },
    {
      short: '400s',
      kind: 'problem',
      title: 'Not every failure deserves a retry',
      body: [
        '<code>400</code> means the request is malformed, while <code>422</code> can describe well-formed input that violates a domain rule. Retrying the same bytes will not help.',
        '<code>401</code> means the caller lacks valid authentication; <code>403</code> means the server understood the caller but refuses the action. That distinction drives login behavior and support diagnostics.',
      ],
      changes: [{ text: 'Bad input → fix request', tone: 'info' }, { text: 'Auth failure → refresh credentials', tone: 'info' }],
      scene: {
        nodes: [you('client', -10, 1, { label: pill('same request', 'refresh', 'bad') }), box('api', 0, 0, 'API', 'blue', 'server'), box('error', 9, 0, '4xx response', 'red', 'alert', { tag: pill('do not blindly retry', 'alert', 'warn') })],
        links: [link('client', 'api', { arrow: 'both' }), link('api', 'error', { arrow: 'end' })],
        flows: [flow(['client', 'api', 'error'], { kind: 'fail', rate: 1 })],
        metrics: { class: '4xx', retry: 'usually no', cache: 'rarely', debug: 'request + field errors' },
      },
    },
    {
      short: '429',
      kind: 'technique',
      title: '429 is a timing instruction',
      body: [
        '<code>429 Too Many Requests</code> says the request may be valid but the caller is over a limit. A good response includes <code>Retry-After</code> or enough rate-limit headers for the client to back off.',
        'Clients should use exponential backoff with jitter. Without jitter, thousands of clients wake up together and recreate the spike the limiter just stopped.',
      ],
      note: { kind: 'tip', text: 'Return a stable machine-readable error code alongside the human message; clients should not parse prose.' },
      concepts: [{ term: 'Retry-After', def: 'An HTTP response header telling a client when it may retry a request.' }],
      scene: {
        nodes: [you('client', -10, 1, { label: pill('backoff + jitter', 'clock', 'good') }), box('limit', 0, 0, 'Rate limiter', 'orange', 'shield', { tag: pill('429 · Retry-After: 2', 'clock', 'warn') }), box('api', 9, 0, 'API', 'blue', 'server')],
        links: [link('client', 'limit', { arrow: 'both' }), link('limit', 'api', { arrow: 'end' })],
        flows: [flow(['client', 'limit'], { kind: 'fail', rate: 1 }), flow(['client', 'limit', 'api'], { rate: 0.4 })],
        metrics: { class: '429', retry: 'yes, delayed', cache: 'no', debug: 'limit + retry time' },
      },
    },
    {
      short: '500s',
      kind: 'technique',
      title: '5xx separates outage from dependency trouble',
      body: [
        '<code>500</code> is a generic server failure. <code>502</code> usually means a gateway received an invalid response from an upstream, while <code>503</code> means the service is temporarily unable to serve traffic. <code>504</code> means an upstream took too long.',
        'These distinctions help operators find the failing hop, but clients still need a retry policy based on idempotency and a bounded deadline.',
      ],
      concepts: [{ term: '503 Service Unavailable', def: 'A temporary inability to serve a request, often used during overload or maintenance.' }],
      scene: {
        nodes: [you('client', -10, 1, { label: pill('bounded retry', 'refresh') }), box('gateway', 0, 0, 'Gateway', 'orange', 'route'), box('upstream', 9, 0, 'Upstream', 'blue', 'server', { state: 'down', tag: pill('timeout', 'clock', 'bad') })],
        links: [link('client', 'gateway', { arrow: 'both' }), link('gateway', 'upstream', { arrow: 'both' })],
        flows: [flow(['client', 'gateway', 'upstream'], { kind: 'fail', rate: 0.8 })],
        metrics: { class: '502/503/504', retry: 'maybe', cache: 'no', debug: 'failing hop' },
      },
    },
    {
      short: 'Contract',
      kind: 'tradeoff',
      title: 'Make errors useful and safe',
      body: [
        'Use the status code for broad client behavior and a stable JSON error shape for application logic: an internal code, a safe message, and optional field details. Keep request IDs so support can find the server-side trace.',
        'Never put stack traces, SQL fragments, tokens, or private data in a public error. Detailed diagnostics belong in logs and traces, correlated by the request ID.',
      ],
      note: { kind: 'warn', text: 'A retryable status does not make every operation safe to repeat. Pair status semantics with idempotency.' },
      scene: {
        nodes: [you('client', -10, 1, { label: pill('{ code, message, requestId }', 'file') }), box('api', 0, 0, 'API', 'blue', 'server', { tag: pill('safe error contract', 'shield', 'good') }), box('logs', 9, 0, 'Private logs', 'purple', 'search')],
        links: [link('client', 'api', { arrow: 'both' }), link('api', 'logs', { arrow: 'end', style: 'dashed', label: pill('requestId') })],
        flows: [flow(['client', 'api'], { kind: 'fail', back: true, rate: 0.7 }), flow(['api', 'logs'], { kind: 'handshake', rate: 0.7 })],
        metrics: { class: 'contract', retry: 'explicit', cache: 'careful', debug: 'request ID' },
      },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'Let the response guide the next move',
      body: [
        'Treat status codes as a small protocol between your service and its clients: 4xx asks for a different request, 429 asks for patience, and 5xx asks for bounded recovery or an error shown to the user.',
        'Stable error bodies, request IDs, and safe logging turn the same signal into something both clients and operators can act on.',
      ],
      scene: {
        nodes: [you('client', -10, 1, { label: pill('decide', 'check', 'good') }), box('api', 0, 0, 'API contract', 'green', 'server', { tag: pill('status + structured error', 'check', 'good') }), box('ops', 9, 0, 'Operator view', 'purple', 'search')],
        links: [link('client', 'api', { arrow: 'both' }), link('api', 'ops', { arrow: 'end' })],
        flows: [flow(['client', 'api'], { back: true, rate: 1 }), flow(['api', 'ops'], { kind: 'handshake', rate: 0.6 })],
        metrics: { class: 'clear', retry: 'bounded', cache: 'intentional', debug: 'traceable' },
      },
    },
  ],
};

export default lesson;
