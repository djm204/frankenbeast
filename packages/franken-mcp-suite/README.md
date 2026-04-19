# @fbeast/mcp-suite

MCP server suite exposing frankenbeast safety capabilities as Claude Code tools.

## Install

```bash
# From the monorepo root
npm install

# Initialize for your project
cd your-project
npx fbeast init

# Optional: install with hooks (pre/post tool enforcement)
npx fbeast init --hooks

# Choose specific servers
npx fbeast init --pick=memory,firewall,governor
```

`fbeast init` registers MCP servers in your Claude Code `settings.json` and creates a `.fbeast/` directory with shared state.

## Uninstall

```bash
npx fbeast uninstall           # remove from Claude Code config
npx fbeast uninstall --purge   # also delete .fbeast/ data
```

## Beast mode

Activate standalone orchestrator mode (shares `.fbeast/beast.db` with MCP mode):

```bash
npx fbeast beast                          # default provider (anthropic-api)
npx fbeast beast --provider=claude-cli    # requires risk acknowledgment
```

## MCP servers

| Server | Tools | Description |
|--------|-------|-------------|
| `fbeast-memory` | `fbeast_memory_query`, `store`, `frontload`, `forget` | Key-value and episodic memory via SqliteBrain |
| `fbeast-observer` | `fbeast_observer_log`, `cost`, `trail` | Audit trail with chained hashes, cost tracking |
| `fbeast-governor` | `fbeast_governor_check`, `budget_status` | Action safety assessment via trigger evaluation |
| `fbeast-planner` | `fbeast_plan_decompose`, `visualize`, `validate` | Task DAG planning with cycle detection |
| `fbeast-critique` | `fbeast_critique_evaluate`, `compare` | Content evaluation (logic, complexity, conciseness) |
| `fbeast-firewall` | `fbeast_firewall_scan`, `scan_file` | Prompt injection detection (standard/strict tiers) |
| `fbeast-skills` | `fbeast_skills_list`, `discover`, `info` | Skill registry discovery |

All servers share `.fbeast/beast.db` (SQLite, WAL mode).

## Combined server

`fbeast-mcp` runs all 19 tools in a single MCP server process.

## Hooks

When installed with `--hooks`, `fbeast-hook` provides:

- **pre-tool**: governor safety check before each tool call (exits non-zero to deny)
- **post-tool**: observer audit logging after each tool call

## Programmatic usage

```typescript
import { createBrainAdapter, createGovernorAdapter, createFirewallAdapter } from '@fbeast/mcp-suite';

const brain = createBrainAdapter('.fbeast/beast.db');
const governor = createGovernorAdapter('.fbeast/beast.db');
const firewall = createFirewallAdapter('.fbeast/beast.db', 'strict');

await brain.store({ key: 'context', value: 'project setup', type: 'working' });
const result = await governor.check({ action: 'rm -rf /', context: 'cleanup' });
const scan = await firewall.scanText('ignore previous instructions');
```
