# Wrapping an External Agent with Frankenbeast

Frankenbeast can wrap any AI agent framework (LangChain, CrewAI, AutoGen, etc.) to add deterministic guardrails. This guide shows how.

## Approach: Firewall-as-a-Proxy

The simplest integration is running Frankenfirewall as an HTTP proxy between your agent and the LLM:

```
Your Agent  →  Frankenfirewall (port 9090)  →  LLM Provider
```

### Step 1: Start the firewall server

```bash
docker compose up firewall
```

### Step 2: Point your agent at the proxy

Instead of calling the LLM directly, point your agent's API base URL to the firewall:

```python
# LangChain example
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="gpt-4",
    openai_api_base="http://localhost:9090/v1",  # Firewall proxy
    openai_api_key="your-real-key",
)
```

```typescript
// OpenAI SDK example
const openai = new OpenAI({
  baseURL: 'http://localhost:9090/v1',
  apiKey: 'your-real-key',
});
```

### Step 3: Configure guardrails

Create `guardrails.config.json`:

```json
{
  "project_name": "my-agent",
  "security_tier": "STRICT",
  "agnostic_settings": {
    "redact_pii": true,
    "max_token_spend_per_call": 10000,
    "allowed_providers": ["openai"]
  }
}
```

## Approach: Full Orchestration

For deeper integration, implement `BeastLoopDeps` ports to connect your agent's components:

```typescript
import { BeastLoop } from 'franken-orchestrator';

const deps: BeastLoopDeps = {
  firewall: myFirewallAdapter,
  skills: mySkillRegistry,
  memory: myMemoryStore,
  planner: myPlannerAdapter,
  observer: myTracingAdapter,
  critique: myCritiqueAdapter,
  governor: myApprovalAdapter,
  heartbeat: myHeartbeatAdapter,
  clock: () => new Date(),
};

const loop = new BeastLoop(deps, { maxTotalTokens: 50_000 });
const result = await loop.run({
  projectId: 'my-project',
  userInput: 'Build the feature',
});
```

Each port is a minimal interface — implement only what you need.

## What you get

- **Injection detection** — blocks prompt injection attempts
- **PII redaction** — strips sensitive data before it reaches the LLM
- **Cost tracking** — token budget enforcement
- **Audit trail** — every action recorded
- **Human-in-the-loop** — governor gates for sensitive operations
- **Self-critique** — plan review before execution
