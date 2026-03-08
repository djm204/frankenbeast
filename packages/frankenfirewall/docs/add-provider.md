# Adding a New LLM Provider

This guide explains how to add a new LLM provider adapter to Frankenfirewall.

## 1. Implement IAdapter

Create `src/adapters/<provider>/<provider>-adapter.ts`:

```typescript
import { BaseAdapter } from "../base-adapter.js";
import type { IAdapter, CapabilityFeature } from "../i-adapter.js";
import type { UnifiedRequest, UnifiedResponse } from "../../types/index.js";

export class MyProviderAdapter extends BaseAdapter implements IAdapter {
  constructor(config: { apiKey: string; model: string }) {
    super({
      costPerInputTokenM: 0,  // USD per 1M input tokens
      costPerOutputTokenM: 0, // USD per 1M output tokens
    });
    // ...
  }

  validateCapabilities(feature: CapabilityFeature): boolean { /* ... */ }
  transformRequest(request: UnifiedRequest): unknown { /* ... */ }
  async execute(providerRequest: unknown): Promise<unknown> { /* ... */ }
  transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse { /* ... */ }
}
```

## 2. Key rules

- Provider-specific types stay **private** to the adapter file
- `transformResponse` must return a `UnifiedResponse` — no provider fields leak through
- `execute` should use `this.withRetry()` and `this.withTimeout()` from `BaseAdapter`
- `validateCapabilities` returns `boolean` for all four features: `function_calling`, `vision`, `streaming`, `system_prompt`

## 3. Register in AdapterRegistry

```typescript
const registry = new AdapterRegistry(["my-provider"]);
registry.register("my-provider", new MyProviderAdapter({ ... }));
```

## 4. Run conformance tests

```typescript
import { runAdapterConformance, SIMPLE_TEXT_REQUEST } from "../conformance/index.js";

const result = runAdapterConformance(
  () => new MyProviderAdapter({ apiKey: "test", model: "my-model" }),
  SIMPLE_TEXT_REQUEST,
  { textResponse: MY_TEXT_FIXTURE, toolResponse: MY_TOOL_FIXTURE },
);

expect(result.passed).toBe(true);
```

The conformance suite validates:
1. `transformRequest` returns a non-null value
2. `transformResponse` produces a valid `UnifiedResponse` shape
3. `validateCapabilities` returns boolean for all features
4. No provider-specific fields leak into `UnifiedResponse`
5. Tool calls are correctly normalised (string id, function_name, arguments)
