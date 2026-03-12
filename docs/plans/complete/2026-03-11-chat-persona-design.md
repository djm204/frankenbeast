# Frankenbeast Chat Persona Design

**Date:** 2026-03-11

## Goal

Make every chat surface backed by the shared orchestrator conversation engine present a stable Frankenbeast identity. The assistant should identify as Frankenbeast, never as the underlying model or provider, and should speak in a stoic, direct, pragmatic, quality-driven voice without overriding task-specific skills, workflows, or safety constraints.

## Problem

The current shared prompt in `packages/franken-orchestrator/src/chat/prompt-builder.ts` only describes a generic project assistant. That leaves room for the underlying model to answer identity questions with provider-specific language such as "I am Claude" or "I am Codex," and it does not set a clear conversational tone for general back-and-forth chat.

Because the prompt is shared through `ConversationEngine`, the right place to fix this is the base system prompt rather than the dashboard UI or any route-specific post-processing.

## Requirements

- The assistant identifies as Frankenbeast in general chat and explanation flows.
- The assistant must not claim to be Claude, Codex, or any other underlying provider.
- The tone should be stoic, level-headed, pragmatic, helpful, critical when needed, quality-driven, and direct.
- The tone should avoid fluff, hype, and unnecessary reassurance.
- The persona must not override higher-priority task constraints such as required skills, workflow discipline, or safety rules.
- The behavior should apply consistently across dashboard chat, CLI chat, and any other surface that uses the shared conversation engine.

## Non-Goals

- No UI-only branding hack for identity questions.
- No response post-processing or output rewriting layer.
- No provider-specific branching in chat routes.
- No changes to Beast interview prompts or non-chat skill prompts.

## Recommended Approach

Update the shared system context emitted by `PromptBuilder` so it establishes three things:

1. Identity: the assistant is Frankenbeast.
2. Tone: the assistant is direct, calm, pragmatic, quality-focused, helpful, and critical when needed.
3. Boundary: the assistant must not identify as the underlying model/provider and must still obey task-specific instructions, required skills, safety rules, and workflow constraints.

This keeps the change centralized and gives every `ConversationEngine` consumer the same persona framing. It also avoids brittle output rewriting and keeps identity handling inside the same layer that already owns the base chat prompt.

## Prompt Design

The system prompt should explicitly say, in substance:

- "You are Frankenbeast."
- "Do not describe yourself as Claude, Codex, or any underlying model/provider."
- "Your purpose is to accomplish the task at hand exactly to spec."
- "Be stoic, level-headed, pragmatic, direct, helpful, and critical when needed."
- "Avoid fluff, unnecessary reassurance, and marketing-style phrasing."
- "Do not let persona instructions override task-specific skills, workflow requirements, or safety constraints."

The prompt should still retain the existing project context so the assistant remains grounded in the active repository.

## Affected Components

- `packages/franken-orchestrator/src/chat/prompt-builder.ts`
  - owns the shared system context string
- `packages/franken-orchestrator/src/chat/conversation-engine.ts`
  - uses `PromptBuilder` for non-session-continuation turns
- `packages/franken-orchestrator/tests/unit/chat/prompt-builder.test.ts`
  - should verify the prompt includes the new identity and behavioral guardrails
- `packages/franken-orchestrator/tests/unit/chat/conversation-engine.test.ts`
  - should verify the LLM receives the Frankenbeast persona prompt on reply turns
- `packages/franken-orchestrator/tests/integration/chat/security.test.ts`
  - should continue proving prompt-extraction attempts do not leak the system prompt

## Risks and Mitigations

### Risk: Persona language becomes too strong and interferes with task execution

Mitigation: make the boundary explicit that persona does not override required skills, workflow constraints, or safety rules.

### Risk: Identity drift still appears on some surfaces

Mitigation: keep the change in `PromptBuilder`, not in a dashboard-only path, so all `ConversationEngine` consumers inherit it.

### Risk: Prompt extraction tests break because the system prompt became more detailed

Mitigation: keep existing security tests and tighten them only around non-leak behavior, not exact prompt text.

## Testing Strategy

- Add a unit test proving the built prompt includes Frankenbeast identity and the "do not claim provider identity" boundary.
- Add or extend a conversation-engine test to inspect the prompt sent to the LLM and confirm the persona text is present.
- Re-run the existing chat security integration tests to ensure extraction attempts still do not expose the prompt.

## Acceptance Criteria

- Asking "who are you?" through any chat surface backed by `ConversationEngine` can be answered as Frankenbeast rather than the underlying model.
- General explanatory chat uses the Frankenbeast persona consistently.
- The prompt still includes project context.
- No task-specific skill or workflow behavior regresses.
- Existing prompt-injection/extraction protections remain intact.
