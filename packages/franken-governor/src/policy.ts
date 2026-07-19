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
   * When set, the caller must supply *every* resolved push URL for the remote
   * in `details.remoteUrls` and all of them must appear here. This binds a
   * whitelisted remote name to its expected destination(s), so rewriting the
   * name's URL(s) in .git/config cannot redirect a permitted push. A remote
   * that is itself a URL listed here is also accepted without a name match.
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
      const d = (typeof details === 'object' && details !== null ? details : {}) as { remote?: unknown; remoteUrls?: unknown };
      // Policy data may arrive from JSON/env or untyped JS callers; a string
      // here would make `.includes` a substring check, so fail closed unless
      // whitelists are real arrays of exact values.
      // Reasons are meant to be surfaced verbatim; never echo raw remotes or
      // URLs, which may be credential-bearing.
      const urlList = config.allowedGitRemoteUrls;
      if (urlList !== undefined && !Array.isArray(urlList)) {
        return { allow: false, reason: 'Malformed allowedGitRemoteUrls; denying by default' };
      }
      // A remote that is itself a whitelisted URL is acceptable without a name
      // match; PrCreator supports URL-valued remotes directly.
      const nameAllowed = (Array.isArray(config.allowedGitRemotes)
        && config.allowedGitRemotes.includes(d.remote as string))
        || (Array.isArray(urlList) && urlList.includes(d.remote as string));
      if (!nameAllowed) {
        return { allow: false, reason: `Remote "${redactRemote(d.remote)}" is not allowed by policy` };
      }
      if (urlList !== undefined) {
        const urls = d.remoteUrls;
        const allUrlsAllowed = Array.isArray(urls)
          && urls.length > 0
          && urls.every((url) => typeof url === 'string' && urlList.includes(url));
        if (!allUrlsAllowed) {
          const shown = Array.isArray(urls) ? urls.map(redactRemote).join(', ') : redactRemote(urls);
          return {
            allow: false,
            reason: `Remote "${redactRemote(d.remote)}" resolves to push URL(s) [${shown}], not all of which are allowed by policy`,
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
