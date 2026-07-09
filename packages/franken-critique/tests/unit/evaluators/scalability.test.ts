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
    ['commented config separators', 'const cfg = { port /* docs */: /* docs */ 8080 };'],
    ['numeric suffixed config key', 'const cfg = { port2: 8080 };'],
    ['hyphenated quoted config key', 'const cfg = { "server-port": 8080, \'api-port\': 8443 };'],
    ['uppercase hyphenated quoted config key', 'const cfg = { "SERVER-PORT": 8080 };'],
    ['hyphenated bracket notation assignment', 'config["server-port"] = 8080;'],
    ['class field initializer', 'class ServerConfig { port = 8080; static defaultPort = 8443; }'],
    ['modified class field initializer', 'class ServerConfig { private port = 8080; readonly serverPort = 8443; public static defaultPort = 9090; }'],
    ['private class field initializer', 'class ServerConfig { #port = 8080; #serverPorts = 8443; }'],
    ['plural port declaration and property', 'const ports = 8080; const cfg = { serverPorts: 8443 };'],
    ['plural port container array', 'const cfg = { ports: [8080, 8443] };'],
    ['plural port container after symbolic element', 'const cfg = { ports: [DEFAULT_PORT_8080, 8443] };'],
    ['numeric separator config literal', 'const cfg = { port: 8_080 };'],
    ['template interpolation assignment', 'const text = `${config.port = 8080}`;'],
    ['template interpolation object literal', 'const text = `${{ port: 8080 }}`;'],
    ['template interpolation with comment brace', 'const text = `${/* } */ { port: 8080 }}`;'],
    ['template interpolation with regex brace', 'const text = `${/}/.test(input) && { port: 8080 }}`;'],
    ['runtime config after type declaration', 'interface Listener { host: string }\nconst cfg = { port: 8080 };'],
    ['parenthesized runtime config', 'const cfg = ({ host: "x", port: 8080, secure: true });'],
    ['nested runtime config object', 'const cfg = { host: "x", server: { port: 8080 } };'],
    ['lowercase compound port declaration', 'const serverport = 8080; const apiport = 8443;'],
    ['plural port container object map', 'const cfg = { ports: { http: 8080, https: 8443 } };'],
    ['plural port container array after ignored string', 'const cfg = { ports: ["8080", 8443] };'],
    ['typed declaration with generic comma annotation', 'const port: Brand<number, "Port"> = 8080;'],
    ['logical property assignment default', 'config.port ??= 8080; config.serverPort ||= 8443;'],
    ['top-level quoted port key fragment', '"server-port": 8080'],
  ])('flags hardcoded port numbers in %s', async (_name, content) => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(true);
  });

  it('does not treat non-port config keys containing port as port literals', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const cfg = { transport: 443, viewport: 1024, viewPortWidth: 1024, view_port: 1024, support: 1000, portalId: 1234, portfolio: 1000, support_portal: 8080 };
const VIEW_PORT_WIDTH = 1024;
const DEFAULT_VIEW_PORT_WIDTH = 1024;
const defaultViewPortWidth = 1024;
layout.viewPortWidth = 1024;
layout.defaultViewPortWidth = 1024;
layout.view_port_width = 1024;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('does not treat type-only object literals as hardcoded runtime ports', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `type ServerConfig = { port: 8080 };
type NestedConfig = { server: { port: 8080 } };
type ArrayConfig = { ports: [8080, 8443] };
interface ListenerConfig {
  port: 3000;
}
export interface ExportedListenerConfig {
  port: 3000;
}
declare interface AmbientListenerConfig {
  port: 3000;
}
interface MultilineListenerConfig
{
  port: 3000;
}
interface WrappedExtendsConfig extends BaseConfig,
  OtherConfig {
  port: 3000;
}
declare global { interface AmbientNestedConfig { port: 3000 } }
const cfg: { port: 8080 } = createCfg();
export const exportedCfg: { port: 8080 } = createCfg();
declare const declaredCfg: { port: 8080 };
function bind(opts: { port: 8080 }) {}
function bindLater(host: string, opts: { port: 8080 }) {}
function bindOptional(host: string, opts?: { port: 8080 }) {}
function bindLiteral(protocol: 'http', port: 8080) {}
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
function bindReadonly(opts: Readonly<{ port: 8080 }>) {}
makeConfig<{ port: 8080 }>();
makeConfig<string, { port: 8080 }>();
class GenericBaseConfig extends Base<string, { port: 8080 }> {}
function bindGeneric<T extends { port: 8080 }>() {}
function makeDefaultConfig<T = { port: 8080 }>() {}
const makeDefaultArrow = <T = { port: 8080 }>() => undefined;
const cfg = {} satisfies { port: 8080 };
function bindHost(host: string, port: 8080) {}
type BindHost = (host: string, port: 8080) => void;
class Server { bind(host: string, port: 8080) {} }
const tupleArgs: [host: string, port: 8080] = value;
const tupleLiteralArgs: [protocol: 'http', port: 8080] = value;
const tupleInsideGeneric: Array<[host: string, port: 8080]> = [];
const inlineUnion: Base | { port: 8080 } = makeCfg();
const inlineIntersection = {} as Base & { port: 8080 };
type ComplexConfig<T extends Record<string, unknown>> = { port: 8080 };
type DefaultedConfig<T = {}> = { port: 8080 };
class ImplementedPortConfig implements ListenerConfig {
  port: 8080;
}
class GenericPortConfig<T> {
  port: 8080;
}
class ExtendedGenericPortConfig extends Base<Foo> {
  port: 8080;
}
const AnonymousPortConfig = class {
  port: 8080;
}
class SemicolonlessPortConfig {
  port: 8080
}
interface LongGeneratedListenerConfig<T extends Record<string, unknown> = Record<string, unknown>> extends BaseGeneratedListenerConfigWithEnoughCharactersToPushTheOpeningBracePastTheOldShortContextWindow, OtherGeneratedListenerConfigWithEnoughCharactersToPushTheOpeningBracePastTheOldShortContextWindow {
  port: 3000;
}
type SplitConfig =
  { port: 8080 };`;
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

  it('does not let semicolonless type aliases hide later runtime config ports', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `type Listener = string
const cfg = { port: 8080 };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(true);
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
switch (true) {
  case /{ port: 8080 }/.test(input):
    break;
}
const nestedTemplateString = \`\${"{ port: 8080 }"}\`;
const nestedTemplateComment = \`\${/* { port: 8080 } */ value}\`;
if (enabled) /{ port: 8080 }/.test(input);
while (enabled) /{ port: 8080 }/.test(input);
await /{ port: 8080 }/.test(input);
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
