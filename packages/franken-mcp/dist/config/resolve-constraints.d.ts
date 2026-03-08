import type { McpToolConstraints } from "../types/mcp-tool-constraints.js";
/** Partial constraints where each property may be explicitly undefined (zod compat). */
type LoosePartial<T> = {
    [K in keyof T]?: T[K] | undefined;
};
export declare function resolveConstraints(serverConstraints?: LoosePartial<McpToolConstraints>, toolOverrideConstraints?: LoosePartial<McpToolConstraints>): McpToolConstraints;
export {};
