# LLM and Tool Chaos Fixtures

The orchestrator stability tests use deterministic fake adapters instead of live model or tool calls. Keep new chaos coverage small and clock-controlled so CI cannot hang.

## Covered failure modes

- Dropped LLM response: return a never-settling promise and configure a short planner timeout. Advance Vitest fake timers and assert the fallback or explicit failure plus `vi.getTimerCount() === 0`.
- Malformed LLM response: return non-JSON text and assert the caller takes its documented fallback/error path.
- Empty LLM response: return whitespace and assert the same recoverable fallback/error path as malformed output.
- Duplicate LLM completion: return duplicated task IDs or duplicated completion markers and assert the runtime rejects the ambiguous result before downstream dependency mapping proceeds.
- Tool exception: make the fake tool/Martin loop reject, then assert the operator-visible error, terminal error span, replay/audit behavior, and lack of leaked polling timers.

## Adding a new fixture

1. Put provider-response fixtures beside the unit that consumes them; prefer inline `vi.fn()` fakes for single-case tests.
2. Use `vi.useFakeTimers()` for dropped or delayed responses; always restore real timers in `finally`.
3. Assert three things for every chaos case: final state, user/operator-visible error or fallback, and cleanup of timers/listeners/process handles.
4. Do not call live providers, CLIs, GitHub, or network services from chaos tests.
