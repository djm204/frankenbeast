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
export function evaluate(action: Action, config: PolicyConfig = defaultPolicy, details?: unknown): Decision {
  switch (action) {
    case 'git-push': {
      const remote = typeof details === 'object' && details !== null && 'remote' in details ? (details as any).remote : undefined;
      const allowed = config.allowedGitRemotes?.includes(remote as string);
      return allowed
        ? { allow: true, reason: `Remote "${remote}" is whitelisted for git push` }
        : { allow: false, reason: `Remote "${remote}" is not allowed by policy` };
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
