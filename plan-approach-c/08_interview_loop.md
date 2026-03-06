# Chunk 08: InterviewLoop — Idea to Design Doc

## Objective

Create the `InterviewLoop` component that uses `ILlmClient` to interview the user, gather requirements, and generate a design document. This is Mode 3 (interview input) — the full "idea to PR" pipeline.

## Files

- **Create**: `franken-orchestrator/src/planning/interview-loop.ts`
- **Create**: `franken-orchestrator/tests/unit/interview-loop.test.ts`
- **Modify**: `franken-orchestrator/src/index.ts` — export `InterviewLoop`
- **Modify**: `plan-beast-runner/build-runner.ts` — wire `--mode interview` to `InterviewLoop`

## Key Reference Files

- `franken-orchestrator/src/planning/llm-graph-builder.ts` — chunk 07 (consumed by InterviewLoop)
- `franken-types/src/llm.ts` — `ILlmClient` interface
- `docs/plans/2026-03-05-approach-c-full-pipeline-design.md` — design doc format example

## Design

```typescript
interface InterviewIO {
  ask(question: string): Promise<string>;    // prompt user, get response
  display(message: string): void;            // show info to user
}

class InterviewLoop {
  constructor(
    private readonly llm: ILlmClient,
    private readonly io: InterviewIO,
    private readonly graphBuilder: LlmGraphBuilder,
  ) {}

  async build(intent: Intent): Promise<PlanGraph> {
    // 1. Send intent.goal to LLM with interview prompt:
    //    "Given this goal, what clarifying questions do you need?"
    // 2. Parse questions from LLM response
    // 3. For each question, ask user via io.ask()
    // 4. Accumulate answers into context
    // 5. Send goal + answers to LLM: "Generate a design document"
    // 6. Show design doc to user via io.display()
    // 7. Ask user to confirm via io.ask("Approve this design? (yes/no)")
    // 8. If approved: pass design doc to graphBuilder.build()
    // 9. If rejected: ask what to change, loop back to step 5
    // 10. Return PlanGraph from graphBuilder
  }
}
```

## Success Criteria

- [ ] `InterviewLoop` implements `GraphBuilder` interface
- [ ] Uses `ILlmClient.complete()` to generate clarifying questions
- [ ] Collects user answers via `InterviewIO.ask()`
- [ ] Generates design document from goal + answers via `ILlmClient.complete()`
- [ ] Displays generated design doc to user via `InterviewIO.display()`
- [ ] Asks user approval — if rejected, allows revision loop
- [ ] On approval, delegates to `LlmGraphBuilder.build()` for decomposition
- [ ] Test with mock `ILlmClient` and mock `InterviewIO`
- [ ] Test approval flow: questions → answers → design doc → approved → PlanGraph
- [ ] Test rejection flow: questions → answers → design doc → rejected → revision → approved
- [ ] `--mode interview` in build-runner uses stdin/stdout for `InterviewIO`
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run tests/unit/interview-loop.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/interview-loop.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- `InterviewIO` is an interface — the build-runner provides a stdin/stdout implementation, tests provide mocks
- Maximum 5 clarifying questions per interview (prevent infinite loops)
- Maximum 3 revision rounds after rejection (then abort with error)
- Design doc output should follow the project's design doc format (Problem, Goal, Architecture, etc.)
- Do NOT read from stdin in the orchestrator module — IO is injected
- Do NOT import from `franken-brain` directly — use `ILlmClient` from `@franken/types`
- Use `.js` extensions in all import paths (NodeNext)
