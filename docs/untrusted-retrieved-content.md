# Untrusted Retrieved Content

Frankenbeast prompt assembly treats retrieved files, web pages, GitHub issues, PR comments, memory, and tool output as data, not instructions. This document implements the prompt-data boundary described in [Agent Tool Execution Threat Model](agent-tool-execution-threat-model.md) (`docs/agent-tool-execution-threat-model.md`).

Use `wrapUntrustedContent()` from `@franken/orchestrator` whenever adding retrieved text to an LLM prompt. The wrapper records:

- source kind, such as `file`, `web`, `github-issue`, or `github-pr-comment`
- source locator, such as a path, URL, issue URL, or PR comment URL
- retrieval timestamp
- an explicit warning that the payload is untrusted data
- a line-prefixed payload so forged prompt markers remain quoted source material

Example:

```ts
import { wrapUntrustedContent } from '@franken/orchestrator';

const promptContext = wrapUntrustedContent(
  {
    kind: 'web',
    source: 'https://example.com/spec',
    retrievedAt: new Date().toISOString(),
  },
  pageText,
);
```

Do not concatenate raw retrieved content into trusted system/developer/user instructions. Keep trusted instructions outside the wrapper and describe how to use the quoted data; never let retrieved content redefine the agent role, priority, tools, safety policy, or output contract.
