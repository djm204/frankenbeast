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
    ['service-named compound port declarations', 'const supportPort = 8080; const transportPort = 8443; const portalPort = 9000;'],
    ['plural port container object map', 'const cfg = { ports: { http: 8080, https: 8443 } };'],
    ['plural port container array after ignored string', 'const cfg = { ports: ["8080", 8443] };'],
    ['typed declaration with generic comma annotation', 'const port: Brand<number, "Port"> = 8080;'],
    ['typed declaration with nested generic annotation', 'const port: Promise<Brand<number, "Port">> = 8080;'],
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
function bindPorts(host: string, ports: [8080, 8443]) {}
const nestedGenericArgs = makeConfig<Record<string, unknown>, { port: 8080 }>();
class NestedGenericBaseConfig extends Base<Record<string, unknown>, { port: 8080 }> {}
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

  it('keeps service-named port identifiers reportable while ignoring non-port words', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const supportPort = 8080;
const transportPort = 8443;
const portalPort = 9000;
const cfg = { support: 1000, transport: 443, portalId: 1234, portfolio: 7, support_portal: 8080 };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
      'Found hardcoded port number: 8443. Use environment variables or config.',
      'Found hardcoded port number: 9000. Use environment variables or config.',
    ]);
  });

  it('does not treat plural port tuple parameter types as runtime ports', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `function bind(host: string, ports: [8080, 8443]) {}
type Binder = (host: string, ports: [8080, 8443]) => void;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('flags nested generic typed port declarations without flagging nested generic type arguments', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const runtimePort: Promise<Brand<number, 'Port'>> = 8080;
makeConfig<Record<string, unknown>, { port: 8443 }>();
class NestedGenericBaseConfig extends Base<Record<string, unknown>, { port: 9000 }> {}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
  });

  it('deduplicates plural port container literals already reported by property scans', async () => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput('const cfg = { ports: [8080] };'));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
  });

  it('does not treat every port substring as a config port key', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const cfg = { report: 8080, important: 8443, imports: 9000, exports: 3000, port: 5000 };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 5000. Use environment variables or config.',
    ]);
  });

  it('limits plural port container scanning to port values inside object elements', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const cfg = { ports: [{ port: 8080, weight: 10 }], serverPorts: [{ serverPort: 8443, timeoutMs: 5000 }] };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
      'Found hardcoded port number: 8443. Use environment variables or config.',
    ]);
  });

  it('does not let completed interface prefixes hide later same-line runtime configs', async () => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput('interface I { x: string } const cfg = { port: 8443 };'));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8443. Use environment variables or config.',
    ]);
  });

  it('does not classify JSX config props as type-only braces', async () => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput('const view = <Component config={{ port: 8080 }} />;'));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
  });

  it('preserves class context for long literal fields', async () => {
    const evaluator = new ScalabilityEvaluator();
    const longComment = 'x'.repeat(400);
    const content = `class LiteralPortConfig {\n  other: string;\n  // ${longComment}\n  port: 8080;\n}`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('applies config key exclusions to property assignment names', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `module.exports = 3000;
metrics.report = 8080;
metrics.important = 8443;
config.port = 5000;
this.#port = 9000;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 5000. Use environment variables or config.',
      'Found hardcoded port number: 9000. Use environment variables or config.',
    ]);
  });

  it('requires nested object values under port options to be port-shaped', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const cfg = { portOptions: { timeoutMs: 5000, retryCount: 3, port: 8080 } };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
  });

  it('reports every value in flat plural port maps', async () => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput('const cfg = { ports: { http: 8080, https: 8443 } };'));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
      'Found hardcoded port number: 8443. Use environment variables or config.',
    ]);
  });

  it('covers Codex-reviewed port scanner false positives and missed fallbacks', async () => {
    const evaluator = new ScalabilityEvaluator();
    const cleanContent = `const cfg = { ports: [{ port: process.env.PORT, weight: 10 }] };
const weightedPorts = { ports: [{ weight: 10, port: 8080 }] };
const IMPORTANT_TIMEOUT_MS = 5000;
const REPORT_LIMIT = 1000;
const IMPORT_LIMIT = 5000;
const EXPORT_BATCH_SIZE = 3000;
const cfgWords = { passport: 1234, sport: 55, airportCode: 7890, portfolioId: 42, reporting: 8080, imported: 8443, exporter: 9000, importantValue: 3000 };
function bind(reallyLongParameterNameThatKeepsTheOpeningParenOutsideThePreviousShortLookbackWindowAlpha: string, reallyLongParameterNameThatKeepsTheOpeningParenOutsideThePreviousShortLookbackWindowBeta: string, reallyLongParameterNameThatKeepsTheOpeningParenOutsideThePreviousShortLookbackWindowGamma: string, port: 8080) {}
if (x) foo(); else /{ port: 8080 }/.test(input);
do /{ port: 8443 }/.test(input); while (x);
type ConditionalConfig<T> = T extends true ? { port: 8080 } : { port: 8443 };
const options = { "portOptions": { timeoutMs: 5000, port: 8080 } };
const singular = { portConfig: { timeoutMs: 5000 } };
class C { // {
  port: 8080;
}
/* type Foo = */ const masked = { ports: { http: 8080 } };`;
    const cleanResult = await evaluator.evaluate(createInput(cleanContent));

    expect(cleanResult.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
      'Found hardcoded port number: 8080. Use environment variables or config.',
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);

    const fallbackResult = await evaluator.evaluate(createInput('const cfg = useEnv ? loadConfig() : { port: 8080 };'));

    expect(fallbackResult.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
  });

  it('includes dotted quoted port keys', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const cfg = { "server.port": 8080 };
config['admin.port'] = 8443;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
      'Found hardcoded port number: 8443. Use environment variables or config.',
    ]);
  });

  it('ignores matches that start inside comments', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const x = 1; // { port:
const y = 8080;`;
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


  it('does not report object-array metadata when port values are externalized', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const cfg = { ports: [{ port: process.env.PORT, weight: 10 }, { weight: 20, port: 8080 }] };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
  });

  it('excludes uppercase non-port constants from declaration scans', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const IMPORTANT_TIMEOUT_MS = 5000;
const REPORT_LIMIT = 1000;
const EXPORT_BATCH_SIZE = 3000;
const DEFAULT_PORT = 8080;`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
  });

  it('requires port-like config keys to avoid ordinary embedded words', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const cfg = { passport: 1, sport: 2, airportCode: 3, portfolioId: 4, serverPort: 8080 };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
  });

  it('does not suppress ternary fallback config objects as return types', async () => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput('const cfg = useEnv ? loadConfig() : { port: 8080 };'));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
  });

  it('scans full parameter lists before suppressing literal types', async () => {
    const evaluator = new ScalabilityEvaluator();
    const longName = `param${'x'.repeat(350)}`;
    const result = await evaluator.evaluate(createInput(`function bind(${longName}: string, port: 8080) {}`));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('treats regex literals after else and do as ignored ranges', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `if (x) foo(); else /{ port: 8080 }/.test(input);
do /{ port: 8443 }/.test(input); while (x);`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('preserves type alias context across conditional branches', async () => {
    const evaluator = new ScalabilityEvaluator();
    const result = await evaluator.evaluate(createInput('type ConditionalConfig<T> = T extends true ? { port: 8080 } : { port: 8443 };'));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('normalizes quoted option keys before filtering metadata', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const cfg = { "portOptions": { timeoutMs: 5000, port: 8080 } };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
  });

  it('filters singular port option object metadata', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `const cfg = { portConfig: { timeoutMs: 5000, port: 8080 } };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
  });

  it('ignores comment braces when checking class port literal types', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `class C { // {
 port: 8080; }`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.some((f) => f.message.includes('hardcoded port number'))).toBe(false);
  });

  it('masks comments before checking plural port maps for type-only signatures', async () => {
    const evaluator = new ScalabilityEvaluator();
    const content = `/* type Foo = */ const cfg = { ports: { http: 8080 } };`;
    const result = await evaluator.evaluate(createInput(content));

    expect(result.findings.map((finding) => finding.message)).toEqual([
      'Found hardcoded port number: 8080. Use environment variables or config.',
    ]);
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
