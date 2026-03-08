import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { requestId, errorHandler } from './middleware.js';
import type { GuardrailsConfig } from '../config/index.js';
import type { IAdapter } from '../adapters/index.js';
import type { UnifiedRequest } from '../types/index.js';
import { runPipeline } from '../pipeline/pipeline.js';

export interface FirewallAppOptions {
  config: GuardrailsConfig;
  adapters: Record<string, IAdapter>;
  defaultProvider?: string;
}

type AppEnv = {
  Variables: {
    requestId: string;
  };
};

export function createFirewallApp(options: FirewallAppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requestId);
  app.use('*', errorHandler);

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      providers: Object.keys(options.adapters),
      timestamp: new Date().toISOString(),
    });
  });

  // OpenAI-compatible completions proxy
  app.post('/v1/chat/completions', async (c) => {
    const body = await c.req.json();
    const provider = (body.provider as string | undefined) ?? options.defaultProvider ?? 'openai';
    const adapter = options.adapters[provider];

    if (!adapter) {
      return c.json(
        { error: { message: `Unknown provider: ${provider}`, type: 'invalid_request' } },
        400,
      );
    }

    const unifiedRequest: UnifiedRequest = {
      id: c.get('requestId'),
      provider,
      model: body.model ?? 'unknown',
      system: body.system,
      messages: (body.messages ?? []).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      max_tokens: body.max_tokens,
      session_id: body.session_id ?? randomUUID(),
    };

    const result = await runPipeline(unifiedRequest, adapter, options.config);

    if (result.response.finish_reason === 'content_filter') {
      return c.json(
        {
          error: {
            message: 'Request blocked by guardrails',
            type: 'guardrail_violation',
            violations: result.violations,
          },
        },
        422,
      );
    }

    return c.json({
      id: result.response.id,
      model: result.response.model_used,
      content: result.response.content,
      tool_calls: result.response.tool_calls,
      finish_reason: result.response.finish_reason,
      usage: result.response.usage,
      violations: result.violations.length > 0 ? result.violations : undefined,
    });
  });

  // Anthropic Messages API proxy
  app.post('/v1/messages', async (c) => {
    const body = await c.req.json();
    const provider = 'anthropic';
    const adapter = options.adapters[provider];

    if (!adapter) {
      return c.json(
        { error: { message: 'Anthropic adapter not configured', type: 'invalid_request' } },
        400,
      );
    }

    const unifiedRequest: UnifiedRequest = {
      id: c.get('requestId'),
      provider,
      model: body.model ?? 'claude-3-sonnet-20240229',
      system: body.system,
      messages: (body.messages ?? []).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      max_tokens: body.max_tokens,
      session_id: body.session_id ?? randomUUID(),
    };

    const result = await runPipeline(unifiedRequest, adapter, options.config);

    if (result.response.finish_reason === 'content_filter') {
      return c.json(
        {
          error: {
            message: 'Request blocked by guardrails',
            type: 'guardrail_violation',
            violations: result.violations,
          },
        },
        422,
      );
    }

    return c.json({
      id: result.response.id,
      model: result.response.model_used,
      content: result.response.content
        ? [{ type: 'text', text: result.response.content }]
        : [],
      stop_reason: result.response.finish_reason,
      usage: {
        input_tokens: result.response.usage.input_tokens,
        output_tokens: result.response.usage.output_tokens,
      },
    });
  });

  return app;
}
