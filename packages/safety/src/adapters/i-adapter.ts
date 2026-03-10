import type { UnifiedRequest } from "../types/index.js";
import type { UnifiedResponse } from "../types/index.js";

export type CapabilityFeature = "function_calling" | "vision" | "streaming" | "system_prompt";

/**
 * The four-method contract every provider adapter must implement.
 * This is the only interface the pipeline ever calls — never concrete adapters.
 */
export interface IAdapter {
  /**
   * Maps the provider-agnostic UnifiedRequest into the provider's native request format.
   * Throws if the request requires a capability the model does not support.
   */
  transformRequest(request: UnifiedRequest): unknown;

  /**
   * Executes the HTTP/gRPC call to the provider.
   * Handles transport, timeouts, and provider-specific retry logic via BaseAdapter.
   * Returns raw provider response — transformResponse normalises it.
   */
  execute(providerRequest: unknown): Promise<unknown>;

  /**
   * Maps the raw provider response to a UnifiedResponse.
   * Must always return the canonical shape — never a provider-specific field.
   */
  transformResponse(providerResponse: unknown, requestId: string): UnifiedResponse;

  /**
   * Returns true if the configured model supports the requested feature.
   * Called by transformRequest before mapping to catch unsupported feature requests early.
   */
  validateCapabilities(feature: CapabilityFeature): boolean;
}
