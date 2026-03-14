# franken-brain (MOD-03) Ramp-Up

**Status**: **GHOST** — This module is currently **unwired** from the primary `franken-orchestrator` production path. The orchestrator uses a `stubMemory` adapter in `dep-factory.ts`.

## Module Overview
`franken-brain` is the tiered memory system for the Frankenbeast agent. It provides Working Memory (in-process), Episodic Memory (SQLite trace logs), and Semantic Memory (ChromaDB vector store).

## Current Functionality (Implemented but Unused)
- **Memory Orchestrator**: Unified interface for recording turns and searching context.
- **Working Memory**: Manages the immediate conversation buffer with pruning strategies.
- **Episodic Store**: Records every tool execution and result in a persistent SQLite database.
- **Semantic Store**: Enables RAG (Retrieval-Augmented Generation) via vector embeddings.
- **PII Guard**: Scans incoming and outgoing data for sensitive information.

## Integration Gap
The `franken-orchestrator` currently bypasses this package. While the logic here is fully tested and functional, the agent operates without long-term episodic or semantic memory in its current CLI configuration. **Phase 8 Focus**: Replace the orchestrator's memory stub with the concrete implementation in this package.

## Key API
- `MemoryOrchestrator`: The primary entry point for all memory operations.
- `WorkingMemoryStore`: Handles turn-based conversation history.
- `EpisodicMemoryStore`: SQLite-backed persistence for traces.

## Build & Test
```bash
npm run build          # tsc
npm run test           # vitest run (unit)
npm run test:integration # requires SQLite/ChromaDB mocks
```

## Dependencies
- `ulid`: For sortable unique IDs.
- `zod`: For memory entry validation.
- `@franken/types`: For shared context definitions.
