# Wrapping an External Agent with Frankenbeast

The current repo does not ship a `firewall` Docker Compose service or a standalone `frankenfirewall` HTTP proxy on port 9090. External-agent integration should use one of the current surfaces below.

## Option 1: Use MCP mode for tool governance

Install the MCP suite in the project you want to govern. The `fbeast` binary ships from the `@franken/mcp-suite` package (there is no package named `fbeast`), and `mcp init` registers servers as bare `fbeast-memory`/`fbeast-proxy` commands that the AI client spawns later — so install the package persistently (global or `npm link`) rather than via a one-shot `npx`, otherwise the registered servers won't be on PATH at runtime:

```bash
npm install -g @franken/mcp-suite      # or, from this repo: npm run local:link
fbeast mcp init
fbeast mcp init --hooks                # optional: pre/post-tool governance and audit logs
```

This creates `.fbeast/beast.db`, registers MCP servers with the detected client (Claude Code, Gemini CLI, or Codex CLI), and optionally installs generated hook scripts. MCP tools, hooks, Beast runs, and the dashboard can share the same project database.

## Option 2: Call the orchestrator runtime

Use `frankenbeast` when you want Frankenbeast to own the interview/plan/run loop:

```bash
frankenbeast interview
frankenbeast plan --design-doc path/to/design.md
frankenbeast run --plan-dir .fbeast/plans/my-plan/
```

For browser or service integration, run the orchestrator chat/dashboard backend:

```bash
npm --workspace @franken/orchestrator run chat-server -- --port 3737
```

The integrated Hono app always mounts chat (WebSocket at `/v1/chat/ws`), network, and analytics routes. The `chat-server` CLI mounts Beast agents/SSE only when an operator token resolves, and skills/dashboard routes only when a provider registry is configured. When comms channels are enabled, the CLI resolves comms config, auto-wires a `ChatRuntimeCommsAdapter`, and mounts `/comms/health`, `/v1/comms/inbound`, `/v1/comms/action`, and enabled `/webhooks/*` routes in-process. Security (`/api/security`) is mounted by `createChatApp()` when `securityConfig` is supplied.

## Option 3: Implement BeastLoop dependencies around your agent

For deeper integration, wire your agent components into the orchestrator's ports instead of routing through a standalone proxy:

```typescript
import { BeastLoop } from '@franken/orchestrator';

const loop = new BeastLoop(deps, { maxTotalTokens: 50_000 });
const result = await loop.run({
  projectId: 'my-project',
  userInput: 'Build the feature',
});
```

`deps` should provide the capabilities your integration needs: LLM/provider calls, planning, execution, memory, observer, critique, governor, and checkpointing. See `packages/franken-orchestrator/src/beast-loop.ts` and neighboring tests for the current constructor and dependency shape before implementing against it.

## Historical proxy docs

If you see older examples like this, treat them as historical:

```text
Your Agent -> Frankenfirewall (port 9090) -> LLM Provider
docker compose up firewall
guardrails.config.json
```

Those commands and files do not match the current repo. The current `docker-compose.yml` only defines ChromaDB, Grafana, and Tempo.
