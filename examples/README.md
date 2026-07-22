# Frankenbeast examples

These standalone sample projects are intentionally outside the monorepo workspaces. Each one has its own locked dependencies and can be copied with `npm run create:project -- <name> <target-directory>` from the repository root.

| Example                                              | What it demonstrates                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| [Quick start](quick-start/README.md)                 | A dependency-free scaffold and environment-file smoke test       |
| [CLI plan](cli-plan/README.md)                       | Running `frankenbeast plan` against a small design document      |
| [MCP suite](mcp-suite/README.md)                     | Registering project-scoped MCP servers and removing them cleanly |
| [Orchestrator config](orchestrator-config/README.md) | Starting the orchestrator with a minimal validated JSON config   |

## Use an example

From the Frankenbeast repository root:

```bash
npm run create:project -- quick-start ../my-frankenbeast-app
cd ../my-frankenbeast-app
npm start
```

The scaffold command copies the selected directory, creates `.env` from `.env.example` when present, and runs `npm ci`. You can also copy an example yourself and run `npm ci` inside it.

The CLI, MCP, and orchestrator examples may call an external AI provider. Review each example's README and configure only the provider credentials it needs; never commit credentials or generated `.env` files.
