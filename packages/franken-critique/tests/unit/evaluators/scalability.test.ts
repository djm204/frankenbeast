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
    ['prefixed port-number declaration', 'const serverPortNumber = 8080;'],
    ['prefixed port-default declaration', 'const apiPortDefault = 8080;'],
    ['preview port declaration', 'const previewPort = 8080;'],
    ['numeric suffixed port declaration', 'const serverPort2 = 8080;'],
    ['bracket notation assignment', 'config["serverPort"] = 8080;'],
    ['computed literal object key', 'const cfg = { ["serverPort"]: 8080 };'],
    ['commented config property', 'const cfg = { /* docs */ port: 8080 };'],
    ['numeric suffixed config key', 'const cfg = { port2: 8080 };'],
  ])('flags hardcoded port numbers in %s', async (_name, content) => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number: 8080'))).toBe(true);
  });

  it('does not treat non-port config keys containing port as port literals', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const cfg = { transport: 443, viewport: 1024, viewPortWidth: 1024, view_port: 1024, support: 1000, portalId: 1234, portfolio: 1000, support_portal: 8080 };
const VIEW_PORT_WIDTH = 1024;
layout.viewPortWidth = 1024;
layout.view_port_width = 1024;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('does not treat type-only object literals as hardcoded runtime ports', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `type ServerConfig = { port: 8080 };
type NestedConfig = { server: { port: 8080 } };
interface ListenerConfig {
  port: 3000;
}
const cfg: { port: 8080 } = createCfg();
function bind(opts: { port: 8080 }) {}
const castCfg = {} as { port: 8080 };
function getConfig(): { port: 8080 } {
  return createCfg();
}
const getConfigArrow = (): { port: 8080 } => createCfg();
type IntersectConfig = BaseConfig & { port: 8080 };
type ReadonlyConfig = Readonly<{ port: 8080 }>;
type GenericConfig<T> = { port: 8080 };
interface GenericListenerConfig<T> {
  port: 3000;
}
interface ExtendedListenerConfig extends BaseConfig {
  port: 3000;
}
class LiteralPortConfig {
  port: 8080;
}
function bindReadonly(opts: Readonly<{ port: 8080 }>) {}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('does not let typed port declarations consume an initializer from a later line', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `let port: number
const retryDelay = 5000;
let listenerPort: number, retryTimeout = 5000;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('does not treat TypeScript parameter literal types as hardcoded runtime ports', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `function bind(port: 8080) {}
type Bind = (host: string, port: 8080) => void;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('does not scan comments or strings for port-shaped assignments', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `// const port = 8080
/* config.port = 8080 */
const text = "{ port: 8080 }";
const template = \`serverPort = 8080\`;
const re = /{ port: 8080 }/;
const escaped = /config\\.port = 8080/;
function portRegex() {
  return /config\\.port = 8080/;
}
const arrowRegex = () => /{ port: 8080 }/;
log('debug', "port: 8080");`;
    const result = await evaluator.evaluate(createInput(content));

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
