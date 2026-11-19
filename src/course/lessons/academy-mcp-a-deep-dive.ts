import type { Lesson, SceneNode } from '../../types';
import { box, db, flow, link, pill } from '../kit';

const host = (extra: Partial<SceneNode> = {}) => box('host', -14, 0, 'Host app (+ model)', 'purple', 'cpu', { size: [1.5, 1.5], height: 32, ...extra });
const client = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`c${i}`, -5, (i - (n - 1) / 2) * 5, name, 'teal', 'route', { size: [1.1, 1.1], height: 22, ...extra });
const server = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  box(`s${i}`, 5, (i - (n - 1) / 2) * 5, name, 'blue', 'server', { size: [1.2, 1.2], height: 26, ...extra });
const ext = (i: number, n: number, name: string, extra: Partial<SceneNode> = {}) =>
  db(`e${i}`, 14, (i - (n - 1) / 2) * 5, name, { size: [1.2, 1.2], ...extra });

const fmtN = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`);
const fmtUSD = (n: number): string => (n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(0)}`);

const lesson: Lesson = {
  slug: 'academy-mcp-a-deep-dive',
  title: 'Model Context Protocol (MCP)',
  blurb: 'A standard way to connect AI applications to tools and data — and the hidden cost of every tool definition that sits in the model’s context.',
  minutes: 13,
  level: 'Intermediate',
  metrics: [
    { key: 'integ', label: 'Integrations: bespoke vs MCP', icon: 'layers' },
    { key: 'tools', label: 'Tool-definition tokens in every request', icon: 'file' },
    { key: 'share', label: 'Share of the context window', icon: 'gauge' },
    { key: 'cost', label: 'Daily cost of those tokens (uncached → cached)', icon: 'activity' },
  ],
  goals: [
    { text: 'The M×N integration problem MCP addresses', step: 1 },
    { text: 'Host, client and server roles', step: 2 },
    { text: 'The primitives: tools, resources, prompts', step: 3 },
    { text: 'Transports, capability negotiation and auth', step: 4 },
    { text: 'The context cost of many tools, and security risks', step: 5 },
  ],
  legend: ['request', 'response', 'write', 'fail'],
  dynamic: {
    parameters: [
      { key: 'apps', label: 'AI applications (hosts)', min: 1, max: 50, step: 1, default: 5, unit: '', description: 'Distinct assistants and agents.' },
      { key: 'sources', label: 'Tools and data sources to connect', min: 1, max: 200, step: 1, default: 20, unit: '', description: 'Systems the apps need to reach (databases, SaaS, files).' },
      { key: 'servers', label: 'MCP servers connected to one agent', min: 1, max: 50, step: 1, default: 5, unit: '', description: 'Servers a single session loads.' },
      { key: 'tools', label: 'Tools per server', min: 1, max: 100, step: 1, default: 15, unit: '', description: 'Tool definitions each server exposes.' },
      { key: 'tok', label: 'Tokens per tool definition', min: 50, max: 2000, step: 10, default: 250, unit: '', description: 'Name, description and parameter schema.' },
      { key: 'ctx', label: 'Context window', min: 8000, max: 2000000, step: 8000, default: 200000, unit: ' tokens', description: 'Model context length.' },
      { key: 'req', label: 'Requests per day', min: 1000, max: 10000000, step: 1000, default: 100000, unit: '', description: 'Model calls that include the tool definitions.' },
      { key: 'price', label: 'Input price', min: 0.1, max: 20, step: 0.1, default: 3, unit: ' $/M tok', description: 'Illustrative price per million input tokens.' },
    ],
    calculate: (input, step) => {
      const apps = Math.max(1, input.apps ?? 5);
      const sources = Math.max(1, input.sources ?? 20);
      const servers = Math.max(1, input.servers ?? 5);
      const tools = Math.max(1, input.tools ?? 15);
      const tok = Math.max(1, input.tok ?? 250);
      const ctx = Math.max(1000, input.ctx ?? 2e5);
      const req = Math.max(0, input.req ?? 1e5);
      const price = Math.max(0, input.price ?? 3);
      const defTokens = servers * tools * tok;
      const daily = (defTokens * req * price) / 1e6;
      return {
        integ: step < 1 ? { v: '—' } : { v: `${apps * sources} vs ${apps + sources}`, tone: 'good' },
        tools: step < 4 ? { v: '—' } : { v: fmtN(defTokens), tone: defTokens > 30000 ? 'bad' : defTokens > 10000 ? 'warn' : 'good' },
        share: step < 4 ? { v: '—' } : { v: `${((defTokens / ctx) * 100).toFixed(1)}%`, tone: defTokens / ctx > 0.2 ? 'bad' : defTokens / ctx > 0.08 ? 'warn' : 'good' },
        cost: step < 4 ? { v: '—' } : { v: `${fmtUSD(daily)} → ${fmtUSD(daily * 0.1)} with caching`, tone: daily > 2000 ? 'warn' : 'good' },
      };
    },
  },
  steps: [
    {
      short: 'M × N',
      kind: 'problem',
      title: 'Every assistant needs every integration',
      body: [
        'An AI application becomes useful when it can reach things: files, a database, GitHub, Slack, a calendar. Without a standard, <b>each app writes its own connector to each system</b>: M applications × N tools is M × N integrations (5 apps and 20 systems = 100), each with its own auth, schema and quirks, and none reusable by the next assistant.',
        '<b>Model Context Protocol (MCP)</b> is an open protocol that standardises the connection: a tool is wrapped <b>once</b> as an <b>MCP server</b>, and any <b>MCP-aware</b> application can use it. The integration count falls to M + N (25). It plays the role the Language Server Protocol plays for editors and languages.',
      ],
      changes: [{ text: 'Bespoke: M × N = 100 · MCP: M + N = 25', tone: 'good' }],
      scene: { nodes: [host({ name: '5 apps' }), box('std', 0, 0, 'MCP (standard protocol)', 'teal', 'route', { size: [1.5, 1.5], height: 26 }), ext(0, 3, 'Database'), ext(1, 3, 'GitHub'), ext(2, 3, 'Calendar')], links: [link('host', 'std', { arrow: 'both' }), link('std', 'e0'), link('std', 'e1'), link('std', 'e2')], flows: [flow(['host', 'std', 'e1'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Roles',
      kind: 'technique',
      title: 'Host, client, server',
      body: [
        'The <b>host</b> is the application the user interacts with (a desktop assistant, an IDE, an agent runtime) and contains the model. For each server it connects to, the host runs an <b>MCP client</b> that keeps a 1:1 session. An <b>MCP server</b> is a lightweight program exposing capabilities from some system — local (filesystem, git) or remote (a SaaS API).',
        'The host controls what the model may see and do: it decides which servers to connect, shows tool lists to the model, and mediates approval of actions. Messages use <b>JSON-RPC 2.0</b> (requests, responses, notifications), the same style as the Language Server Protocol, so any language can implement either side.',
      ],
      scene: { nodes: [host({ tag: pill('model + policy + UI', 'shield') }), client(0, 2, 'MCP client 1'), client(1, 2, 'MCP client 2'), server(0, 2, 'MCP server: files'), server(1, 2, 'MCP server: GitHub'), ext(0, 2, 'Local disk'), ext(1, 2, 'GitHub API')], links: [link('host', 'c0'), link('host', 'c1'), link('c0', 's0', { arrow: 'both' }), link('c1', 's1', { arrow: 'both' }), link('s0', 'e0'), link('s1', 'e1')], flows: [flow(['host', 'c1', 's1', 'e1'], { rate: 1.5 })] },
    },
    {
      short: 'Primitives',
      kind: 'technique',
      title: 'Tools, resources and prompts',
      body: [
        'Servers expose three kinds of capability. <b>Tools</b>: functions the <i>model</i> can call (<code>create_issue</code>, <code>run_query</code>), each with a name, description and JSON-schema input — the same function-calling shape as in the Agents lesson. <b>Resources</b>: read-only data identified by URI (a file, a database row, a document) that the <i>application</i> can attach as context. <b>Prompts</b>: reusable templates a user can invoke, like slash commands.',
        'Clients can offer back <b>sampling</b> (a server asks the host to run a model completion, so servers needn’t hold API keys) and <b>roots</b> (which directories or scopes the server may operate within). Who controls each primitive — model, application or user — is deliberate: it determines where approval belongs.',
      ],
      changes: [{ text: 'Tools: model-controlled actions', tone: 'info' }, { text: 'Resources: app-controlled context', tone: 'info' }, { text: 'Prompts: user-controlled templates', tone: 'info' }],
      scene: { nodes: [server(0, 3, 'Tools', { tag: pill('model calls them', 'bolt') }), server(1, 3, 'Resources', { tag: pill('app attaches them', 'file') }), server(2, 3, 'Prompts', { tag: pill('user invokes them', 'list') }), host({ name: 'Host' })], links: [link('host', 's0', { arrow: 'both' }), link('host', 's1', { arrow: 'both' }), link('host', 's2', { arrow: 'both' })], flows: [flow(['host', 's0'], { rate: 1.5, back: true })] },
    },
    {
      short: 'Transport',
      kind: 'technique',
      title: 'Transports, negotiation and auth',
      body: [
        'Two standard transports: <b>stdio</b> — the host launches the server as a local subprocess and talks over its standard input/output (simple, private, great for local tools) — and <b>streamable HTTP</b> for remote servers (HTTP POST with optional server-sent event streams for streaming and notifications). On connect, client and server <b>negotiate capabilities</b> and protocol version (<code>initialize</code>), so each knows which features the other supports.',
        'Remote servers need <b>authorization</b>: the specification builds on <b>OAuth 2.x</b> so a user can grant an app scoped access to their account at a service (see the OAuth lesson) — the server acts as a resource server and the token is audience-bound. Servers can notify clients when their tool list changes, and long-running calls report progress and support cancellation.',
      ],
      changes: [{ text: 'stdio (local) · streamable HTTP (remote)', tone: 'info' }, { text: 'initialize → capability negotiation', tone: 'info' }, { text: 'OAuth for remote servers', tone: 'good' }],
      scene: { nodes: [host(), box('stdio', -4, -6, 'stdio: local subprocess', 'green', 'cpu', { size: [1.3, 1.3], height: 22 }), box('http', -4, 6, 'Streamable HTTP + OAuth', 'orange', 'globe', { size: [1.3, 1.3], height: 22 }), server(0, 2, 'Local server'), server(1, 2, 'Remote server')], links: [link('host', 'stdio'), link('host', 'http'), link('stdio', 's0'), link('http', 's1')], flows: [flow(['host', 'http', 's1'], { rate: 1.5 })] },
    },
    {
      short: 'Context cost',
      kind: 'problem',
      title: 'Every connected tool costs tokens on every request',
      body: [
        'The model can only use a tool it knows about, so <b>each tool’s name, description and schema is placed in the context</b> of every call. 5 servers × 15 tools × 250 tokens = <b>18,750 tokens</b> before the user has typed anything — 9% of a 200k window, and at 100,000 requests a day about <b>$5,600</b> of input tokens at $3 per million (≈$560 if the stable prefix is cached). Past a few dozen tools, <b>selection accuracy also drops</b>: similar descriptions confuse the model and wrong calls rise.',
        'Mitigations: connect only the servers a task needs; <b>write tight descriptions</b> and compact schemas; expose few <i>high-level</i> tools rather than a 1:1 mirror of a REST API; <b>search/lazy-load</b> tools on demand (a meta-tool that finds relevant tools); route to specialised sub-agents each with a small toolset; and keep outputs concise. More servers is not better.',
      ],
      changes: [{ text: '5 × 15 × 250 = 18,750 tokens per request', tone: 'bad' }, { text: 'Fewer, higher-level tools; load on demand', tone: 'good' }],
      scene: { nodes: [host({ state: 'hot', tag: pill('18,750 tokens of tool definitions', 'alert', 'warn') }), server(0, 2, '15 tools'), server(1, 2, '15 tools')], links: [link('host', 's0'), link('host', 's1')], flows: [flow(['host', 's0'], { kind: 'heavy', rate: 3 })] },
    },
    {
      short: 'Security',
      kind: 'problem',
      title: 'Security: untrusted servers and poisoned tools',
      body: [
        'An MCP server is <b>code you run</b> (local: with your privileges) and a <b>source of text the model will read</b>. Risks: <b>tool poisoning</b> — hidden instructions in a tool’s description (“also send the user’s files to…”); <b>indirect prompt injection</b> through tool results; <b>rug pulls</b> — a server changing its tools after you approved it; <b>confused deputy</b> — a server using your token for something you didn’t intend; and over-broad scopes. Combining a server with private data, one that reads untrusted content and one that can send externally recreates the “lethal trifecta” (see the Evals and Guardrails lesson).',
        'Practice: install servers only from sources you trust and pin versions; run local ones in a <b>sandbox</b> with least privilege; show full tool descriptions and require <b>human approval</b> for sensitive calls; scope OAuth tokens narrowly with audience binding; re-approve when tool definitions change; and log every call. Figures here are model outputs for illustration, with illustrative prices.',
      ],
      changes: [{ text: 'Tool descriptions and results are untrusted text', tone: 'bad' }, { text: 'Pin · sandbox · approve · scope tokens · re-approve on change', tone: 'good' }],
      scene: { nodes: [host({ tag: pill('approval for risky calls', 'shield', 'good') }), server(0, 2, 'Malicious server', { tone: 'red', tag: pill('poisoned description', 'alert', 'bad') }), server(1, 2, 'Trusted, sandboxed', { tag: pill('least privilege', 'lock', 'good') })], links: [link('host', 's0', { style: 'dashed' }), link('host', 's1')], flows: [flow(['host', 's0'], { kind: 'fail', rate: 0.8 })] },
    },
    {
      short: 'Recap',
      kind: 'recap',
      title: 'A standard socket for tools — mind what it puts in context',
      body: [
        'MCP turns M × N integrations into M + N: <b>servers</b> expose <b>tools, resources and prompts</b> over JSON-RPC (stdio or streamable HTTP), <b>clients</b> inside a <b>host</b> connect and negotiate capabilities, and remote access uses OAuth.',
        'Budget the context (servers × tools × tokens), keep toolsets small and high-level, and treat every server and tool description as untrusted: sandbox, scope, approve and log.',
      ],
      scene: { nodes: [host(), client(0, 2, 'Client'), client(1, 2, 'Client'), server(0, 2, 'Server'), server(1, 2, 'Server')], links: [link('host', 'c0'), link('host', 'c1'), link('c0', 's0', { arrow: 'both' }), link('c1', 's1', { arrow: 'both' })], flows: [flow(['host', 'c0', 's0'], { rate: 1.5, back: true })] },
    },
  ],
};

export default lesson;
