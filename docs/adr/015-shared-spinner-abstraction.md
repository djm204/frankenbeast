# ADR-015: Shared Spinner Abstraction

## Status
Accepted

## Context
Multiple services need a loading spinner (chat REPL, planner, build runner). The existing `Spinner` class in `src/cli/spinner.ts` works but is not exposed as a reusable helper with consistent start/stop semantics across different async operations.

## Decision
Create a shared `withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T>` helper that wraps any async operation with spinner start/stop. It:

- Starts the spinner with the given label before calling `fn`
- Stops the spinner when `fn` resolves or rejects
- Returns the result or rethrows the error
- Uses the existing `Spinner` class internally

This is used by the chat REPL for conversational replies and can be adopted by the planner and other services.

## Consequences
- Consistent spinner UX across all CLI services
- Single helper function — no new classes or abstractions
- Existing `Spinner` class unchanged; helper is a thin wrapper
