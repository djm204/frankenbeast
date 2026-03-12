# Issues Provider Fallback Design

**Date:** 2026-03-12

**Goal:** Make `frankenbeast issues` honor the selected `--provider` and fallback chain across the entire issues pipeline, including triage, issue decomposition, and chunk execution.

## Problem

The current `issues` flow does not consistently honor CLI provider selection:

- issue execution hardcodes `claude` inside `IssueRunner`
- single-shot LLM calls used by issue triage and graph decomposition do not rotate providers on rate limits
- when rate limits occur, the flow can keep retrying the exhausted provider until iteration failure instead of cascading through the fallback chain

## Requirements

- `frankenbeast issues --provider X --providers a,b,c` must use `X` as the initial provider everywhere in the issues pipeline
- if `--providers` is omitted, configured fallbacks still apply, with the selected provider normalized to the front
- issue triage, graph decomposition, and Martin execution must all use the same provider choice and fallback chain
- rate-limit fallback should only trigger on provider-detected rate limit errors
- non-rate-limit failures should still surface as normal failures

## Chosen Approach

Use a minimal patch rather than a shared fallback refactor.

### Why

- fixes the defects with the smallest code surface
- preserves the current split between single-shot adapter calls and Martin execution
- avoids a broader refactor that would increase risk and delay the fix

## Design

### 1. Provider propagation

`Session` and `createCliDeps()` already receive the selected provider and fallback chain. That data will be propagated into:

- issue triage LLM calls
- issue graph decomposition LLM calls
- issue execution `CliSkillConfig.martin`

`IssueRunner` will stop hardcoding `claude` and instead accept the selected provider and fallback chain in its config.

### 2. Single-shot fallback behavior

`CliLlmAdapter` will implement provider rotation for single-shot calls:

- start with the selected provider
- on provider-detected rate limit, mark that provider exhausted
- switch immediately to the next provider in the normalized chain
- if all providers are exhausted, sleep until the shortest parsed reset time and retry from the original provider

This matches the Martin loop’s intended behavior and prevents retrying the same exhausted provider in a failure loop.

### 3. Error handling

- only provider-specific rate limit detection triggers fallback
- parse failures, malformed output, and other non-zero exits remain real failures
- when all providers are exhausted and no reset time can be parsed, use the existing conservative fallback sleep window

## Testing Strategy

- add a failing `IssueRunner` test proving the configured provider is forwarded into Martin execution
- add failing `CliLlmAdapter` tests proving provider-order normalization and rate-limit fallback across providers
- run the targeted adapter, issue-runner, and Martin/provider tests after implementation

## Non-Goals

- extracting a shared fallback engine for all LLM callers
- redesigning the Martin loop
- changing retry behavior for non-rate-limit errors
