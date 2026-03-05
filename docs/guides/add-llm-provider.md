# Adding an LLM Provider

Frankenfirewall's adapter layer lets you plug in any LLM provider. This guide walks through creating a new adapter.

## Architecture

All LLM communication goes through the `IAdapter` interface:

```typescript
interface IAdapter {
  transformRequest(unified: UnifiedRequest): ProviderRequest;
  execute(request: ProviderRequest): Promise<ProviderResponse>;
  transformResponse(response: ProviderResponse): UnifiedResponse;
  validateCapabilities(config: AdapterConfig): ValidationResult;
}
```

## Step 1: Create the adapter file

```
frankenfirewall/src/adapters/your-provider/your-adapter.ts
```

Extend `BaseAdapter`:

```typescript
import { BaseAdapter } from '../base-adapter.js';

export class YourAdapter extends BaseAdapter {
  readonly provider = 'your-provider';

  transformRequest(unified: UnifiedRequest): YourProviderRequest {
    return {
      model: unified.model,
      messages: unified.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };
  }

  async execute(request: YourProviderRequest): Promise<YourProviderResponse> {
    const response = await fetch('https://api.your-provider.com/v1/chat', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify(request),
    });
    return response.json();
  }

  transformResponse(response: YourProviderResponse): UnifiedResponse {
    return {
      content: response.choices[0].message.content,
      finish_reason: response.choices[0].finish_reason,
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      },
    };
  }

  validateCapabilities(config: AdapterConfig): ValidationResult {
    return { valid: true, errors: [] };
  }
}
```

## Step 2: Add conformance tests

Run your adapter against the conformance suite:

```typescript
import { runAdapterConformance } from '../conformance/index.js';
import { YourAdapter } from './your-adapter.js';

runAdapterConformance(
  () => new YourAdapter({ model: 'your-model' }),
  yourFixtures,
);
```

## Step 3: Register in the adapter factory

Add your adapter to the factory in `src/adapters/index.ts`.

## Step 4: Update allowed providers

In your `guardrails.config.json`, add `'your-provider'` to `allowed_providers`.

## Local providers (Ollama pattern)

For local models, set `cost_usd: 0` in the response since there's no API cost. See `OllamaAdapter` for reference.
