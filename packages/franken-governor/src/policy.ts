/**
 * Simple policy-as-code engine for high‑risk agent actions.
 *
 * The engine defines a set of actions that are considered high‑risk and
 * provides a central place to allow/deny them based on configurable rules.
 *
 * It is deliberately lightweight – the goal is to provide a single source of
 * truth that can be unit‑tested and referenced from the code‑base.
 */

export type Action =
  | 'git-push'
  | 'cron-modify'
  | 'memory-edit'
  | 'cross-profile-write'
  | 'webhook-send';

export interface Decision {
  allow: boolean;
  /** Human readable reason for the decision */
  reason: string;
}

/**
 * Policy configuration – callers can extend this shape as needed.
 * For now we only support a whitelist of safe git remotes for the `git-push`
 * action. Additional rules can be added later without breaking existing code.
 */
export interface PolicyConfig {
  /** Allowed git remote names for push operations */
  allowedGitRemotes?: readonly string[];
  /**
   * When set, the caller must supply the remote's *resolved* URL in
   * `details.remoteUrl` and it must appear here. This binds a whitelisted
   * remote name to its expected destination, so rewriting the name's URL in
   * .git/config cannot redirect a permitted push.
   */
  allowedGitRemoteUrls?: readonly string[];
}

/** Default policy – allow everything (except actions that have explicit safe checks). */
export const defaultPolicy: PolicyConfig = {
  allowedGitRemotes: ['origin'],
};

/**
 * Evaluate a single action against the supplied policy configuration.
 *
 * New actions should be added to the `Action` union and handled in the switch
 * below. The function returns a {@link Decision} that callers must honour – if
 * `allow` is false they should abort the operation and surface the reason to the
 * user (or to the governor approval flow).
 */
/**
 * Masks the userinfo (credentials) portion of a URL-style remote so reasons
 * are safe to surface in logs and approval UIs. Greedy through the last `@`
 * before the host's first `/`, so credentials containing `@` are fully hidden.
 */
function redactRemote(remote: unknown): string {
  return String(remote).replace(/\/\/[^/]*@/, '//***@');
}

export function evaluate(action: Action, config: PolicyConfig = defaultPolicy, details?: unknown): Decision {
  // The default parameter only covers `undefined`; JS/JSON callers can still
  // pass null or other non-objects. Deny rather than throw so the gate stays
  // fail-closed for malformed policy data.
  if (typeof config !== 'object' || config === null) {
    return { allow: false, reason: 'Malformed policy config; denying by default' };
  }
  switch (action) {
    case 'git-push': {
      const d = (typeof details === 'object' && details !== null ? details : {}) as { remote?: unknown; remoteUrl?: unknown };
      // Policy data may arrive from JSON/env or untyped JS callers; a string
      // here would make `.includes` a substring check, so fail closed unless
      // it is a real array of exact remote names.
      // Reasons are meant to be surfaced verbatim; never echo raw remotes or
      // URLs, which may be credential-bearing.
      const nameAllowed = Array.isArray(config.allowedGitRemotes)
        && config.allowedGitRemotes.includes(d.remote as string);
      if (!nameAllowed) {
        return { allow: false, reason: `Remote "${redactRemote(d.remote)}" is not allowed by policy` };
      }
      if (config.allowedGitRemoteUrls !== undefined) {
        if (!Array.isArray(config.allowedGitRemoteUrls)) {
          return { allow: false, reason: 'Malformed allowedGitRemoteUrls; denying by default' };
        }
        if (typeof d.remoteUrl !== 'string' || !config.allowedGitRemoteUrls.includes(d.remoteUrl)) {
          return {
            allow: false,
            reason: `Remote "${redactRemote(d.remote)}" resolves to URL "${redactRemote(d.remoteUrl)}", which is not allowed by policy`,
          };
        }
      }
      return { allow: true, reason: `Remote "${redactRemote(d.remote)}" is whitelisted for git push` };
    }
    case 'cron-modify':
    case 'memory-edit':
    case 'cross-profile-write':
    case 'webhook-send':
      // At present these are not whitelisted – they require explicit policy
      // entries in the future. Deny by default.
      return { allow: false, reason: `${action} is disallowed until a policy rule is added` };
    default:
      // Exhaustiveness check – if we get here TypeScript will warn.
      const _exhaustiveCheck: never = action;
      return { allow: false, reason: 'Unknown action' };
  }
}
