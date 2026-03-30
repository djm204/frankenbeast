# Martin Loop

Executes chunk plans through the MartinLoop agent with multi-provider support.

## Usage

```bash
frankenbeast run --provider "<provider>" --plan-dir "<chunk-directory>"
```

## Parameters

- **provider** (required): LLM provider to use (claude, codex, gemini, aider)
- **chunkDirectory** (required): Directory containing chunk plan files to execute

## Behavior

1. Reads chunk files from the specified directory
2. Builds a dependency graph of tasks
3. Executes each chunk via the selected provider
4. Manages git branching, commits, and PR creation
5. Tracks progress via checkpoint files for crash recovery

## Beast Definition Equivalent

This skill mirrors the `martin-loop` beast definition in `src/beasts/definitions/martin-loop-definition.ts`. The beast definition remains operational for process-based dispatch via `frankenbeast beasts spawn martin-loop`.
