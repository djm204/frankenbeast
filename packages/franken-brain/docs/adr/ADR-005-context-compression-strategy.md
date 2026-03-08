# ADR-005: LLM-Based Context Compression Strategy

- **Date:** 2026-02-19
- **Status:** Accepted
- **Deciders:** franken-brain team

## Context

Working memory grows linearly with conversation length. Without compression, every agent turn costs more tokens than the last, eventually hitting the model's context window limit. The project-outline.md specifies:

- **Context Pruning**: Summarise older turns while keeping the most recent Plan and Tool Outputs in full
- **Token Density Management**: Dynamic calculation to avoid "Lost in the Middle" syndrome
- **Compression Tasks**: Background "Lessons Learned" extraction from long episodic traces

Two compression operations are required:
1. **Working memory pruning** — triggered synchronously before each LLM call when `tokenCount > budget`
2. **Episodic compression** — triggered asynchronously on a schedule or when trace count exceeds a threshold

## Decision

Implement compression as a **strategy pattern** with a default LLM-based compressor:

```typescript
interface ICompressionStrategy {
  compress(turns: Turn[], budget: TokenBudget): Promise<CompressedContext>;
}

class LlmSummarisationStrategy implements ICompressionStrategy {
  // Calls the configured LLM to produce a "summary turn" for the oldest N turns
}

class TruncationStrategy implements ICompressionStrategy {
  // Fallback: drops oldest turns until budget is satisfied (no LLM call)
}
```

**Pruning rules (WorkingMemoryStore):**
1. Count tokens using `tiktoken` (model-agnostic tokeniser)
2. If `total > budget * 0.85`, compress the oldest 50% of turns via `LlmSummarisationStrategy`
3. Always preserve: the most recent Plan turn, the most recent Tool Output, and any turn tagged `pinned: true`

**Episodic compression (background):**
- Runs when `episodic_traces` count for a `(project_id, task_id)` exceeds 20
- Calls LLM to produce a "Lesson Learned" summary string
- Stores the summary as a new `SemanticChunk` in the vector store
- Marks source traces `status = 'compressed'` (not deleted — preserves audit trail)

## Consequences

### Positive
- Predictable token budget: agent never exceeds context window mid-conversation
- Lessons Learned flow naturally into semantic memory, making prior failures searchable
- Strategy pattern means compression can be mocked in unit tests (no real LLM calls needed)
- `TruncationStrategy` as fallback ensures graceful degradation when the LLM is unavailable

### Negative
- LLM-based compression adds latency and token cost to the summarisation step itself
- Summary quality depends on the model — a poor summary loses information permanently from working memory
- `tiktoken` adds a native dependency (WASM-based)

### Risks
- If the LLM call to compress fails, the agent could be stuck with an overflowing context. Mitigation: fall back to `TruncationStrategy` on LLM error; emit a warning event

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Simple truncation (drop oldest) | Zero complexity, no LLM cost | Loses context permanently; "Lost in the Middle" not addressed | Doesn't meet the summarisation requirement from the outline |
| Sliding window (keep last N turns) | Simple | No summary of pruned history | Same problem — prior context is lost, not summarised |
| Extractive summarisation (local NLP) | No LLM API cost | Lower quality summaries; adds a large NLP library dependency | Quality tradeoff not worth it when LLM is already a project dependency |
