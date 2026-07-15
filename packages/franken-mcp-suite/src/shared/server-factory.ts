import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export interface ToolContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, { type: string; description: string; enum?: readonly unknown[] }>;
  required?: string[];
}

export interface ToolSchemaDef {
  name: string;
  inputSchema: ToolInputSchema;
}

export interface ToolDef extends ToolSchemaDef {
  description: string;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface FbeastMcpServer {
  name: string;
  tools: ToolDef[];
  /** Invoke a tool through the same validation gate the MCP CallTool path uses. */
  callTool(name: string, args: unknown): Promise<ToolResult>;
  start(): Promise<void>;
}

export interface GovernanceDecision {
  decision: 'approved' | 'review_recommended' | 'denied';
  reason: string;
}

/**
 * Central, in-process governance gate consulted on every dispatched tool call.
 * This is the server-side enforcement point that does NOT depend on external
 * client hooks being installed (see ADR-038).
 */
export interface GovernanceGate {
  check(input: {
    tool: string;
    args: Record<string, unknown>;
  }): Promise<GovernanceDecision> | GovernanceDecision;
}

/**
 * Best-effort, server-side audit sink invoked after every dispatched tool call
 * (success or failure). Mirrors the post-tool hook's observer logging so the
 * central dispatch path produces an audit record even when client hooks are
 * absent (see ADR-035). Audit failures never fail the tool call.
 */
export interface AuditSink {
  record(input: {
    tool: string;
    ok: boolean;
    /**
     * Outcome classifier when the call did not run to a normal handler result:
     * the governance decision (`denied`/`review_recommended`) for a blocked
     * call, or `error` for a fail-closed gate error. Omitted for handler runs.
     */
    decision?: string;
    /** Validated call arguments, so the trail records *what* was attempted. */
    args?: Record<string, unknown>;
  }): Promise<void> | void;
}

export interface CreateMcpServerOptions {
  /**
   * When set, every tool call dispatched through this server is checked by the
   * gate after argument validation and before the handler runs. Any decision
   * other than `approved` short-circuits the handler (matching the hook path's
   * fail-closed enforcement); a gate error also fails closed (denied).
   */
  governance?: GovernanceGate;
  /**
   * When set, each dispatched tool call is recorded after the handler runs,
   * giving the central path a server-side audit trail independent of hooks.
   */
  audit?: AuditSink;
}

const DENIED_ARGUMENT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_ARGUMENT_SHAPE_DEPTH = 64;

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPlainJsonObject(value: Record<string, unknown>): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateSafeArgumentShape(
  value: unknown,
  path: string,
  depth = 0,
  skipRootChildren: ReadonlySet<string> = new Set(),
): { ok: true } | { ok: false; message: string } {
  if (depth > MAX_ARGUMENT_SHAPE_DEPTH) {
    return { ok: false, message: `${path} exceeds maximum nesting depth ${MAX_ARGUMENT_SHAPE_DEPTH}` };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true } : { ok: false, message: `${path} must be a finite number` };
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return { ok: false, message: `${path} must be a JSON value` };
  }
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key === 'length') continue;
      if (typeof key !== 'string') {
        return { ok: false, message: `${path} contains non-string property keys` };
      }
      if (DENIED_ARGUMENT_KEYS.has(key)) {
        return { ok: false, message: `${path} contains denied property name: ${key}` };
      }
      const descriptor = descriptors[key];
      if (!descriptor) continue;
      if ('get' in descriptor || 'set' in descriptor) {
        return { ok: false, message: `${path}[${key}] must be a data property` };
      }
      const child = validateSafeArgumentShape(descriptor.value, `${path}[${key}]`, depth + 1, skipRootChildren);
      if (!child.ok) return child;
    }
    return { ok: true };
  }
  if (!isObjectLike(value)) {
    return { ok: true };
  }
  if (!isPlainJsonObject(value)) {
    return { ok: false, message: `${path} must be a plain JSON object` };
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') {
      return { ok: false, message: `${path} contains non-string property keys` };
    }
    if (DENIED_ARGUMENT_KEYS.has(key)) {
      return { ok: false, message: `${path} contains denied property name: ${key}` };
    }
    const descriptor = descriptors[key];
    if (!descriptor) continue;
    if ('get' in descriptor || 'set' in descriptor) {
      return { ok: false, message: `${path}.${key} must be a data property` };
    }
    if (depth === 0 && skipRootChildren.has(key)) {
      continue;
    }
    const child = validateSafeArgumentShape(descriptor.value, `${path}.${key}`, depth + 1, skipRootChildren);
    if (!child.ok) return child;
  }
  return { ok: true };
}

function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (depth > MAX_ARGUMENT_SHAPE_DEPTH) {
    return '[max-depth]';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '[non-finite-number]';
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return '[non-json-value]';
  }
  if (Array.isArray(value)) {
    const sanitized: unknown[] = [];
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key === 'length' || typeof key !== 'string') continue;
      if (DENIED_ARGUMENT_KEYS.has(key)) {
        Object.defineProperty(sanitized, key, { enumerable: true, value: '[denied-property]' });
        continue;
      }
      const descriptor = descriptors[key];
      if (!descriptor) continue;
      if ('get' in descriptor || 'set' in descriptor) {
        Object.defineProperty(sanitized, key, { enumerable: true, value: '[accessor]' });
        continue;
      }
      Object.defineProperty(sanitized, key, { enumerable: descriptor.enumerable ?? true, value: sanitizeForAudit(descriptor.value, depth + 1) });
    }
    return sanitized;
  }
  if (!isObjectLike(value)) {
    return value;
  }
  if (!isPlainJsonObject(value)) {
    return '[non-plain-object]';
  }
  const sanitized: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') continue;
    if (DENIED_ARGUMENT_KEYS.has(key)) {
      sanitized[key] = '[denied-property]';
      continue;
    }
    const descriptor = descriptors[key];
    if (!descriptor) continue;
    if ('get' in descriptor || 'set' in descriptor) {
      sanitized[key] = '[accessor]';
      continue;
    }
    sanitized[key] = sanitizeForAudit(descriptor.value, depth + 1);
  }
  return sanitized;
}

export function sanitizeToolArgumentsForAudit(args: unknown): Record<string, unknown> {
  const value = sanitizeForAudit(args);
  return isObjectLike(value) && !Array.isArray(value) ? (value as Record<string, unknown>) : { invalid: value };
}

const RIGHT_TO_FORGET_SELECTOR_KEYS = new Set(['key', 'category', 'sourceScope', 'query']);
const RIGHT_TO_FORGET_SAFE_AUDIT_KEYS = new Set(['type', 'dryRun']);
const RIGHT_TO_FORGET_SAFE_TYPES = new Set(['working', 'episodic', 'all']);
const MEMORY_REVIEW_PROPOSE_TOOL = 'fbeast_memory_review_propose';
const MEMORY_REVIEW_PROPOSE_SAFE_AUDIT_KEYS = new Set(['type', 'confidence']);
const MEMORY_REVIEW_PROPOSE_SAFE_TYPES = new Set(['working', 'episodic']);
const MEMORY_REVIEW_DECIDE_TOOL = 'fbeast_memory_review_decide';
const MEMORY_REVIEW_DECIDE_SAFE_AUDIT_KEYS = new Set(['id', 'action']);

function unqualifyMcpToolName(toolName: string): string {
  const marker = '__';
  const index = toolName.lastIndexOf(marker);
  return index >= 0 ? toolName.slice(index + marker.length) : toolName;
}

function redactMemoryReviewProposalArgs(sanitized: Record<string, unknown>, redaction = '[memory-review-proposal-redacted]'): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(sanitized, 'invalid')) {
    sanitized['invalid'] = redaction;
    return sanitized;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'type') && !MEMORY_REVIEW_PROPOSE_SAFE_TYPES.has(String(sanitized['type']))) {
    sanitized['type'] = redaction;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'confidence') && typeof sanitized['confidence'] !== 'number') {
    sanitized['confidence'] = redaction;
  }
  for (const key of Object.keys(sanitized)) {
    if (!MEMORY_REVIEW_PROPOSE_SAFE_AUDIT_KEYS.has(key)) {
      sanitized[key] = redaction;
    }
  }
  return sanitized;
}

function redactMemoryReviewProposalEnvelope(sanitized: Record<string, unknown>, redaction = '[memory-review-proposal-redacted]'): Record<string, unknown> {
  const safeEnvelopeKeys = new Set(['tool', 'args']);
  for (const key of Object.keys(sanitized)) {
    sanitized[key] = safeEnvelopeKeys.has(key) ? sanitized[key] : redaction;
  }
  sanitized['args'] = redaction;
  return sanitized;
}

function redactMemoryReviewDecisionArgs(sanitized: Record<string, unknown>, redaction = '[memory-review-decision-metadata-redacted]'): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(sanitized, 'invalid')) {
    sanitized['invalid'] = redaction;
    return sanitized;
  }
  for (const key of Object.keys(sanitized)) {
    if (!MEMORY_REVIEW_DECIDE_SAFE_AUDIT_KEYS.has(key)) {
      sanitized[key] = redaction;
    }
  }
  return sanitized;
}

function redactMemoryReviewDecisionEnvelope(sanitized: Record<string, unknown>, redaction = '[memory-review-decision-metadata-redacted]'): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(sanitized, 'args')) {
    const args = sanitized['args'];
    sanitized['args'] = isObjectLike(args) && !Array.isArray(args)
      ? redactMemoryReviewDecisionArgs(args as Record<string, unknown>, redaction)
      : redaction;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'context')) {
    sanitized['context'] = redaction;
  }
  for (const key of Object.keys(sanitized)) {
    if (!['tool', 'action', 'args', 'context'].includes(key)) {
      sanitized[key] = redaction;
    }
  }
  return sanitized;
}

export function sanitizeToolArgumentsForAuditTrail(toolName: string, args: unknown): Record<string, unknown> {
  const sanitized = sanitizeToolArgumentsForAudit(args);
  const unqualifiedToolName = unqualifyMcpToolName(toolName);
  const isMemoryReviewPropose = unqualifiedToolName === MEMORY_REVIEW_PROPOSE_TOOL;
  const isDirectMemoryReviewDecide = unqualifiedToolName === MEMORY_REVIEW_DECIDE_TOOL;
  const isDirectRightToForget = unqualifiedToolName === 'fbeast_memory_right_to_forget';
  const auditedTool = unqualifiedToolName === 'fbeast_memory_right_to_forget'
    ? unqualifiedToolName
    : typeof sanitized['tool'] === 'string'
      ? unqualifyMcpToolName(sanitized['tool'])
      : unqualifiedToolName;
  const auditedAction = typeof sanitized['action'] === 'string' ? unqualifyMcpToolName(sanitized['action']) : undefined;
  if (auditedTool === MEMORY_REVIEW_PROPOSE_TOOL || auditedAction === MEMORY_REVIEW_PROPOSE_TOOL) {
    if (unqualifiedToolName === 'execute_tool') {
      return redactMemoryReviewProposalEnvelope(sanitized);
    }
    if (auditedAction === MEMORY_REVIEW_PROPOSE_TOOL && Object.prototype.hasOwnProperty.call(sanitized, 'context')) {
      sanitized['context'] = '[memory-review-proposal-redacted]';
    }
    if (isMemoryReviewPropose) {
      return redactMemoryReviewProposalArgs(sanitized);
    }
    return sanitized;
  }
  if (auditedTool === MEMORY_REVIEW_DECIDE_TOOL || auditedAction === MEMORY_REVIEW_DECIDE_TOOL) {
    if (unqualifiedToolName === 'execute_tool') {
      return redactMemoryReviewDecisionEnvelope(sanitized);
    }
    if (auditedAction === MEMORY_REVIEW_DECIDE_TOOL && Object.prototype.hasOwnProperty.call(sanitized, 'context')) {
      sanitized['context'] = '[memory-review-decision-metadata-redacted]';
    }
    if (isDirectMemoryReviewDecide) {
      return redactMemoryReviewDecisionArgs(sanitized);
    }
    return sanitized;
  }
  if (auditedTool !== 'fbeast_memory_right_to_forget' && auditedAction !== 'fbeast_memory_right_to_forget') return sanitized;
  if (auditedAction === 'fbeast_memory_right_to_forget' && Object.prototype.hasOwnProperty.call(sanitized, 'context')) {
    sanitized['context'] = '[right-to-forget-args-redacted]';
  }
  if (toolName === 'execute_tool' && Object.prototype.hasOwnProperty.call(sanitized, 'args')) {
    sanitized['args'] = '[right-to-forget-args-redacted]';
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'invalid')) {
    sanitized['invalid'] = '[right-to-forget-args-redacted]';
    return sanitized;
  }
  for (const key of RIGHT_TO_FORGET_SELECTOR_KEYS) {
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
      sanitized[key] = '[right-to-forget-selector-redacted]';
    }
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'type') && !RIGHT_TO_FORGET_SAFE_TYPES.has(String(sanitized['type']))) {
    sanitized['type'] = '[right-to-forget-args-redacted]';
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'dryRun') && typeof sanitized['dryRun'] !== 'boolean') {
    sanitized['dryRun'] = '[right-to-forget-args-redacted]';
  }
  for (const key of Object.keys(sanitized)) {
    const isWrapperToolKey = key === 'tool' && !isDirectRightToForget && sanitized[key] === 'fbeast_memory_right_to_forget';
    const isPreflightActionKey = key === 'action' && !isDirectRightToForget && sanitized[key] === 'fbeast_memory_right_to_forget';
    if (!RIGHT_TO_FORGET_SELECTOR_KEYS.has(key) && !RIGHT_TO_FORGET_SAFE_AUDIT_KEYS.has(key) && !isWrapperToolKey && !isPreflightActionKey) {
      sanitized[key] = '[right-to-forget-args-redacted]';
    }
  }
  return sanitized;
}

export function validateToolArguments(
  tool: ToolSchemaDef,
  args: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, message: `Tool ${tool.name} expects an object argument` };
  }
  const obj = args as Record<string, unknown>;
  // The proxy wrapper validates only its envelope here. Its nested `args`
  // payload is validated after target resolution so governance/audit can record
  // the real target tool instead of the generic execute_tool wrapper.
  const shape = validateSafeArgumentShape(obj, 'arguments', 0, tool.name === 'execute_tool' ? new Set(['args']) : new Set());
  if (!shape.ok) {
    return { ok: false, message: `Tool ${tool.name} rejected unsafe argument shape: ${shape.message}` };
  }
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  const schema = tool.inputSchema;
  for (const req of schema.required ?? []) {
    const descriptor = descriptors[req];
    if (!descriptor || descriptor.value === undefined) {
      return { ok: false, message: `Tool ${tool.name} missing required property: ${req}` };
    }
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    const prop = schema.properties[key];
    if (!prop) {
      return { ok: false, message: `Tool ${tool.name} received unknown property: ${key}` };
    }
    const value = descriptor.value;
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (prop.type === 'integer' ? !Number.isInteger(value) : actual !== prop.type) {
      return { ok: false, message: `Tool ${tool.name} property ${key} must be ${prop.type}` };
    }
    if (prop.type === 'number' && !Number.isFinite(value)) {
      return { ok: false, message: `Tool ${tool.name} property ${key} must be a finite number` };
    }
    if (prop.enum && !prop.enum.includes(value)) {
      return { ok: false, message: `Tool ${tool.name} property ${key} must be one of: ${prop.enum.join(', ')}` };
    }
  }
  return { ok: true, value: obj };
}

async function dispatchTool(
  toolMap: Map<string, ToolDef>,
  toolName: string,
  args: unknown,
  options: CreateMcpServerOptions = {},
): Promise<ToolResult> {
  const { governance, audit } = options;
  // Best-effort server-side audit (never fails the tool call). Records the
  // attempted args so the trail captures *what* was attempted — including
  // rejected probes and governance denials, the highest-risk events to
  // reconstruct. `args` carries the validated payload once available, or the
  // raw (possibly malformed) payload for pre-validation rejections.
  const recordAudit = async (input: {
    ok: boolean;
    decision?: string;
    args: Record<string, unknown>;
  }): Promise<void> => {
    if (!audit) return;
    try {
      await audit.record({ tool: toolName, ok: input.ok, ...(input.decision !== undefined ? { decision: input.decision } : {}), args: sanitizeToolArgumentsForAuditTrail(toolName, input.args) });
    } catch (err) {
      process.stderr.write(`fbeast audit failed for ${toolName}: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  };
  // Normalize the raw payload to an object so a malformed (null/array/scalar)
  // probe is still captured in the audit record rather than dropped.
  const rawArgs = sanitizeToolArgumentsForAuditTrail(toolName, args);

  const tool = toolMap.get(toolName);
  if (!tool) {
    await recordAudit({ ok: false, decision: 'unknown_tool', args: rawArgs });
    return { content: [{ type: 'text' as const, text: `Unknown tool: ${toolName}` }], isError: true };
  }
  // Only an *absent* argument object defaults to {}; an explicit `null` (or any
  // non-object) on the wire must reach the validator and be rejected.
  const validated = validateToolArguments(tool, args === undefined ? {} : args);
  if (!validated.ok) {
    await recordAudit({ ok: false, decision: 'validation_error', args: rawArgs });
    return { content: [{ type: 'text' as const, text: `Error: ${validated.message}` }], isError: true };
  }
  // Central governance gate: enforced server-side regardless of client hooks.
  // Fails closed — any non-`approved` decision (denied OR review_recommended)
  // or a gate error blocks the handler, matching the hook path's enforcement
  // (`cli/hook.ts` rejects every decision other than `approved`).
  if (governance) {
    let decision: GovernanceDecision;
    try {
      decision = await governance.check({ tool: toolName, args: validated.value });
    } catch (err) {
      await recordAudit({ ok: false, decision: 'error', args: validated.value });
      return {
        content: [{ type: 'text' as const, text: `Denied by governance (fail-closed): ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
    if (decision.decision !== 'approved') {
      await recordAudit({ ok: false, decision: decision.decision, args: validated.value });
      return {
        content: [{ type: 'text' as const, text: `Denied by governance (${decision.decision}): ${decision.reason}` }],
        isError: true,
      };
    }
  }
  let result: ToolResult;
  try {
    result = await tool.handler(validated.value);
  } catch (err) {
    result = {
      content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
  await recordAudit({ ok: !result.isError, args: validated.value });
  return result;
}

export function createMcpServer(
  name: string,
  version: string,
  tools: ToolDef[],
  options: CreateMcpServerOptions = {},
): FbeastMcpServer {
  const server = new Server({ name, version }, { capabilities: { tools: {} } });
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<Record<string, unknown>> => {
    const { name: toolName, arguments: args } = request.params;
    return { ...(await dispatchTool(toolMap, toolName, args, options)) };
  });

  return {
    name,
    tools,
    callTool: (toolName, args) => dispatchTool(toolMap, toolName, args, options),
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}
