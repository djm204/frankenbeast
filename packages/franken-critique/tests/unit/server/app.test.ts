import { describe, it, expect } from 'vitest';
import { createCritiqueApp } from '../../../src/server/app.js';
import { CritiquePipeline } from '../../../src/pipeline/critique-pipeline.js';
import type { Evaluator, EvaluationInput, EvaluationResult } from '../../../src/types/evaluation.js';

/** Minimal evaluator that always passes. */
function makePassEvaluator(name = 'test-eval'): Evaluator {
  return {
    name,
    category: 'deterministic',
    async evaluate(_input: EvaluationInput): Promise<EvaluationResult> {
      return {
        evaluatorName: name,
        verdict: 'pass',
        score: 0.9,
        findings: [],
      };
    },
  };
}

function makePipeline(): CritiquePipeline {
  return new CritiquePipeline([makePassEvaluator()]);
}

describe('Critique Hono Server', () => {
  describe('GET /health', () => {
    it('returns 200', async () => {
      const app = createCritiqueApp();
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('franken-critique');
    });

    it('reports pipeline configuration status', async () => {
      const appNoPipe = createCritiqueApp();
      const res1 = await appNoPipe.request('/health');
      expect((await res1.json()).pipelineConfigured).toBe(false);

      const appWithPipe = createCritiqueApp({ pipeline: makePipeline() });
      const res2 = await appWithPipe.request('/health');
      expect((await res2.json()).pipelineConfigured).toBe(true);
    });
  });

  describe('POST /v1/review', () => {
    it('returns 503 when no pipeline configured', async () => {
      const app = createCritiqueApp();
      const res = await app.request('/v1/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'function add(a, b) { return a + b; }' }),
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.type).toBe('config_error');
    });

    it('runs real pipeline and returns critique result', async () => {
      const app = createCritiqueApp({ pipeline: makePipeline() });
      const res = await app.request('/v1/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'function add(a, b) { return a + b; }' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.verdict).toBe('pass');
      expect(body.score).toBe(0.9);
      expect(body.evaluatorsRun).toEqual(['test-eval']);
      expect(body.shortCircuited).toBe(false);
    });

    it('returns 400 for invalid request', async () => {
      const app = createCritiqueApp({ pipeline: makePipeline() });
      const res = await app.request('/v1/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notCode: 123 }),
      });

      expect(res.status).toBe(400);
    });

    it('passes context through to pipeline', async () => {
      const app = createCritiqueApp({ pipeline: makePipeline() });
      const res = await app.request('/v1/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'const x = 1;',
          context: { language: 'typescript' },
        }),
      });

      expect(res.status).toBe(200);
    });
  });

  describe('auth', () => {
    it('returns 401 without bearer token', async () => {
      const app = createCritiqueApp({ bearerToken: 'secret-token', pipeline: makePipeline() });
      const res = await app.request('/v1/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'x' }),
      });

      expect(res.status).toBe(401);
    });

    it('returns 200 with valid bearer token', async () => {
      const app = createCritiqueApp({ bearerToken: 'secret-token', pipeline: makePipeline() });
      const res = await app.request('/v1/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
        },
        body: JSON.stringify({ code: 'x' }),
      });

      expect(res.status).toBe(200);
    });
  });

  describe('rate limiting', () => {
    it('returns 429 after exceeding limit', async () => {
      const app = createCritiqueApp({ rateLimitPerMinute: 2, pipeline: makePipeline() });

      // First two requests should succeed
      for (let i = 0; i < 2; i++) {
        const res = await app.request('/v1/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'x' }),
        });
        expect(res.status).toBe(200);
      }

      // Third should be rate limited
      const res = await app.request('/v1/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'x' }),
      });
      expect(res.status).toBe(429);
    });
  });
});
