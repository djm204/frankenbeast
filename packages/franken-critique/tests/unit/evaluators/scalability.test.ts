import { describe, it, expect } from 'vitest';
import { ScalabilityEvaluator } from '../../../src/evaluators/scalability.js';
import type { EvaluationInput } from '../../../src/types/evaluation.js';

function createInput(content: string): EvaluationInput {
  return { content, metadata: {} };
}

describe('ScalabilityEvaluator', () => {
  it('implements Evaluator interface', () => {
    const evaluator = new ScalabilityEvaluator();
    expect(evaluator.name).toBe('scalability');
    expect(evaluator.category).toBe('heuristic');
  });

  it('passes clean code without hardcoded values', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const port = process.env.PORT ?? 3000;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('flags hardcoded URLs', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const api = "http://localhost:3000/api";`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded'))).toBe(true);
  });

  it('flags hardcoded IP addresses', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const host = "192.168.1.100";`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded'))).toBe(true);
  });

  it.each([
    ['bare declaration', 'const port = 8080;'],
    ['typed declaration', 'const port: number = 8080;'],
    ['exported declaration', 'export const DEFAULT_PORT = 8080;'],
    ['typed exported declaration', 'export const DEFAULT_PORT: number = 8080;'],
    ['object literal property', 'const cfg = { port: 8080 };'],
    ['call-site options object', 'createServer({ host: "0.0.0.0", port: 8080 });'],
    ['property assignment', 'config.port = 8080;'],
  ])('flags hardcoded port numbers in %s', async (_name, content) => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number: 8080'))).toBe(true);
  });

  it('does not treat non-port config keys containing port as port literals', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const cfg = { transport: 443, viewport: 1024, viewPortWidth: 1024, support: 1000, portalId: 1234, portfolio: 1000 };
layout.viewPortWidth = 1024;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('does not treat type-only object literals as hardcoded runtime ports', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `type ServerConfig = { port: 8080 };
interface ListenerConfig {
  port: 3000;
}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('does not let typed port declarations consume an initializer from a later line', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `let port: number
const retryDelay = 5000;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('does not treat TypeScript parameter literal types as hardcoded runtime ports', async () => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput('function bind(port: 8080) {}'));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('uses env-focused guidance for config-shape hardcoded ports', async () => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput('const cfg = { port: 8080 };'));

    expect(result.findings.find((f) => f.message.includes('hardcoded port number: 8080'))?.suggestion).toBe(
      'Move port to environment variable or external configuration',
    );
  });

  it('passes empty content', async () => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput(''));

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(1);
  });
});
