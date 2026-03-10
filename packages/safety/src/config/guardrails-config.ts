export type SecurityTier = "STRICT" | "MODERATE" | "PERMISSIVE";

export type Provider = "anthropic" | "openai" | "local-ollama";

export interface AgnosticSettings {
  redact_pii: boolean;
  max_token_spend_per_call: number;
  allowed_providers: Provider[];
}

export interface SafetyHooks {
  pre_flight: string[];
  post_flight: string[];
}

export interface GuardrailsConfig {
  project_name: string;
  security_tier: SecurityTier;
  schema_version: 1;
  agnostic_settings: AgnosticSettings;
  safety_hooks: SafetyHooks;
  /** Package names allowed in LLM-generated code. Scraper flags anything outside this list. */
  dependency_whitelist?: string[];
}
