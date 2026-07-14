export type EgressLane = 'docs' | 'triage' | 'test' | 'fallback' | 'implementation' | 'operator' | 'unrestricted';
export type EgressDestinationClass = 'github' | 'provider' | 'messaging' | 'local' | 'arbitrary';
export type EgressDecisionReason =
  | 'allowed'
  | 'explicit-override'
  | 'unknown-lane'
  | 'method-not-allowed'
  | 'destination-class-not-allowed'
  | 'domain-not-allowed'
  | 'scheme-not-allowed'
  | 'invalid-url';

export interface LaneEgressPolicy {
  readonly allowedDestinationClasses?: readonly EgressDestinationClass[] | undefined;
  readonly allowedDomains?: readonly string[] | undefined;
  readonly allowedMethods?: readonly string[] | undefined;
}

export interface EgressPolicyConfig {
  readonly enabled?: boolean | undefined;
  readonly lanes?: Partial<Record<EgressLane, LaneEgressPolicy>> | undefined;
}

export interface EgressOverride {
  readonly allow: boolean;
  readonly reason: string;
}

export interface EgressPolicyRequest {
  readonly lane: EgressLane | string;
  readonly url: string | URL;
  readonly method?: string | undefined;
  readonly policy?: EgressPolicyConfig | undefined;
  readonly override?: EgressOverride | undefined;
}

export interface EgressDecision {
  readonly lane: string;
  readonly destinationClass: EgressDestinationClass;
  readonly host: string;
  readonly method: string;
  readonly allowed: boolean;
  readonly reason: EgressDecisionReason | `explicit-override: ${string}`;
}

export type EgressAuditSink = (decision: ReturnType<typeof redactEgressDecisionForLog>) => void;

interface ResolvedLaneEgressPolicy {
  readonly allowedDestinationClasses: readonly EgressDestinationClass[];
  readonly allowedDomains: readonly string[];
  readonly allowedMethods: readonly string[];
}

const GITHUB_DOMAINS = ['github.com', 'api.github.com', 'raw.githubusercontent.com', 'uploads.github.com', 'codeload.github.com'];
const PROVIDER_DOMAINS = [
  'api.anthropic.com',
  'api.openai.com',
  'openrouter.ai',
  'api.openrouter.ai',
  'generativelanguage.googleapis.com',
  'aiplatform.googleapis.com',
  'ollama.com',
  'cloud.ollama.com',
];
const MESSAGING_DOMAINS = [
  'slack.com',
  'discord.com',
  'discordapp.com',
  'api.telegram.org',
  'graph.facebook.com',
];

export const defaultLaneEgressPolicies: Readonly<Record<EgressLane, Required<LaneEgressPolicy>>> = {
  docs: {
    allowedDestinationClasses: ['github', 'local'],
    allowedDomains: [],
    allowedMethods: ['GET', 'HEAD'],
  },
  triage: {
    allowedDestinationClasses: ['github', 'local'],
    allowedDomains: [],
    allowedMethods: ['GET', 'HEAD'],
  },
  test: {
    allowedDestinationClasses: ['local'],
    allowedDomains: [],
    allowedMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  },
  fallback: {
    allowedDestinationClasses: ['github', 'provider', 'local'],
    allowedDomains: [],
    allowedMethods: ['GET', 'HEAD', 'POST'],
  },
  implementation: {
    allowedDestinationClasses: ['github', 'provider', 'local'],
    allowedDomains: [],
    allowedMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
  operator: {
    allowedDestinationClasses: ['github', 'provider', 'messaging', 'local'],
    allowedDomains: [],
    allowedMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
  unrestricted: {
    allowedDestinationClasses: ['github', 'provider', 'messaging', 'local', 'arbitrary'],
    allowedDomains: ['*'],
    allowedMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  },
};

export class EgressPolicyViolation extends Error {
  constructor(readonly decision: EgressDecision) {
    super(`Egress denied for lane ${decision.lane}: ${decision.method} ${decision.destinationClass}:${decision.host} (${decision.reason})`);
    this.name = 'EgressPolicyViolation';
  }
}

export function evaluateEgressPolicy(request: EgressPolicyRequest): EgressDecision {
  const method = normalizeMethod(request.method);
  const parsed = parseUrl(request.url);
  if (!parsed) {
    return {
      lane: request.lane,
      destinationClass: 'arbitrary',
      host: '<invalid-url>',
      method,
      allowed: false,
      reason: 'invalid-url',
    };
  }

  const host = normalizeEgressHostname(parsed.hostname);
  const destinationClass = classifyEgressDestination(parsed);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { lane: request.lane, destinationClass, host, method, allowed: false, reason: 'scheme-not-allowed' };
  }

  if (request.override?.allow) {
    return {
      lane: request.lane,
      destinationClass,
      host,
      method,
      allowed: true,
      reason: `explicit-override: ${request.override.reason}`,
    };
  }

  if (request.policy?.enabled === false) {
    return { lane: request.lane, destinationClass, host, method, allowed: true, reason: 'allowed' };
  }

  const lanePolicy = resolveLanePolicy(request.lane, request.policy);
  if (!lanePolicy) {
    return { lane: request.lane, destinationClass, host, method, allowed: false, reason: 'unknown-lane' };
  }

  if (!lanePolicy.allowedMethods.map(normalizeMethod).includes(method)) {
    return { lane: request.lane, destinationClass, host, method, allowed: false, reason: 'method-not-allowed' };
  }

  if (lanePolicy.allowedDestinationClasses.includes(destinationClass)) {
    return { lane: request.lane, destinationClass, host, method, allowed: true, reason: 'allowed' };
  }

  if (lanePolicy.allowedDomains.some((domain) => hostMatchesDomain(host, domain))) {
    return { lane: request.lane, destinationClass, host, method, allowed: true, reason: 'allowed' };
  }

  const hasDomainOnlyPolicy = lanePolicy.allowedDestinationClasses.length === 0 && lanePolicy.allowedDomains.length > 0;
  return {
    lane: request.lane,
    destinationClass,
    host,
    method,
    allowed: false,
    reason: hasDomainOnlyPolicy ? 'domain-not-allowed' : 'destination-class-not-allowed',
  };
}

export function redactEgressDecisionForLog(decision: EgressDecision): {
  lane: string;
  destinationClass: EgressDestinationClass;
  host: string;
  method: string;
  allowed: boolean;
  reason: EgressDecision['reason'];
} {
  return {
    lane: decision.lane,
    destinationClass: decision.destinationClass,
    host: decision.host,
    method: decision.method,
    allowed: decision.allowed,
    reason: decision.reason,
  };
}

export function createEgressGuardedFetch(options: {
  readonly lane: EgressLane | string;
  readonly policy?: EgressPolicyConfig | undefined;
  readonly override?: EgressOverride | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly audit?: EgressAuditSink | undefined;
}): typeof fetch {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = input instanceof Request ? input.url : input.toString();
    const requestMethod = init?.method ?? (input instanceof Request ? input.method : undefined);
    enforceEgressDecision({
      lane: options.lane,
      url: requestUrl,
      method: requestMethod,
      policy: options.policy,
      override: options.override,
    }, options.audit);

    const guardedInit = { ...init, redirect: 'manual' as const };
    const response = await fetchImpl(input, guardedInit);
    const location = response.headers?.get?.('location') ?? null;
    if (!location || response.status < 300 || response.status >= 400) {
      return response;
    }

    const redirectUrl = new URL(location, requestUrl).toString();
    const requestRedirect = input instanceof Request ? input.redirect : undefined;
    if (init?.redirect === 'error' || requestRedirect === 'error') {
      throw new TypeError(`Egress redirect blocked for lane ${options.lane}: ${redirectUrl}`);
    }

    enforceEgressDecision({
      lane: options.lane,
      url: redirectUrl,
      method: requestMethod,
      policy: options.policy,
      override: options.override,
    }, options.audit);

    return response;
  }) as typeof fetch;
}

function enforceEgressDecision(request: EgressPolicyRequest, audit: EgressAuditSink | undefined): void {
  const decision = evaluateEgressPolicy(request);
  if (!decision.allowed) {
    audit?.(redactEgressDecisionForLog(decision));
    throw new EgressPolicyViolation(decision);
  }
}

export function classifyEgressDestination(url: URL): EgressDestinationClass {
  const host = normalizeEgressHostname(url.hostname);
  if (isLocalHost(host)) return 'local';
  if (GITHUB_DOMAINS.some((domain) => hostMatchesDomain(host, domain))) return 'github';
  if (PROVIDER_DOMAINS.some((domain) => hostMatchesDomain(host, domain))) return 'provider';
  if (MESSAGING_DOMAINS.some((domain) => hostMatchesDomain(host, domain))) return 'messaging';
  return 'arbitrary';
}

function normalizeEgressHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/u, '');
}

function resolveLanePolicy(lane: string, policy?: EgressPolicyConfig | undefined): ResolvedLaneEgressPolicy | undefined {
  if (!isKnownLane(lane)) return undefined;
  const base = defaultLaneEgressPolicies[lane];
  if (!base) return undefined;
  const override = policy?.lanes?.[lane];
  return {
    allowedDestinationClasses: override?.allowedDestinationClasses ?? base.allowedDestinationClasses ?? [],
    allowedDomains: override?.allowedDomains ?? base.allowedDomains ?? [],
    allowedMethods: override?.allowedMethods ?? base.allowedMethods ?? [],
  };
}

function isKnownLane(lane: string): lane is EgressLane {
  return Object.prototype.hasOwnProperty.call(defaultLaneEgressPolicies, lane);
}

function normalizeMethod(method: string | undefined): string {
  return (method ?? 'GET').trim().toUpperCase();
}

function parseUrl(url: string | URL): URL | undefined {
  try {
    return url instanceof URL ? url : new URL(url);
  } catch {
    return undefined;
  }
}

function hostMatchesDomain(host: string, domain: string): boolean {
  const normalizedDomain = domain.toLowerCase();
  if (normalizedDomain === '*') return true;
  if (normalizedDomain.startsWith('*.')) {
    const suffix = normalizedDomain.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
}

function isLocalHost(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '0:0:0:0:0:0:0:1'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
    || normalized.endsWith('.localhost');
}
