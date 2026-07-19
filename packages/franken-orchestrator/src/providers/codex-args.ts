const DEFAULT_SANDBOX_ARGS = ['--sandbox', 'workspace-write'] as const;

export interface ResolvedCodexArgs {
  sandboxArgs: string[];
  extraArgs: string[];
}

/**
 * Resolve a single deterministic Codex sandbox selection while preserving
 * supported user arguments. Explicit user/config sandbox settings replace the
 * default; ambiguous combinations fail before a Codex process is spawned.
 */
export function resolveCodexSandboxArgs(
  extraArgs: readonly string[] | undefined,
  hasConfiguredSandbox = false,
): ResolvedCodexArgs {
  const extras = [...(extraArgs ?? [])];
  let sandboxSelections = hasConfiguredSandbox ? 1 : 0;

  for (let index = 0; index < extras.length; index++) {
    const arg = extras[index]!;
    if (arg === '--full-auto' || arg.startsWith('--full-auto=')) {
      throw new Error(
        'Codex --full-auto is deprecated for Frankenbeast launches; use --sandbox workspace-write or one explicit sandbox selection.',
      );
    }

    if (arg === '--sandbox' || arg === '-s') {
      const value = extras[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`Codex ${arg} requires a sandbox mode.`);
      }
      sandboxSelections++;
      index++;
      continue;
    }

    if (arg.startsWith('--sandbox=') || arg.startsWith('-s=')) {
      if (arg.endsWith('=')) {
        throw new Error('Codex sandbox selection requires a sandbox mode.');
      }
      sandboxSelections++;
      continue;
    }

    if (arg === '--dangerously-bypass-approvals-and-sandbox' || arg === '--yolo') {
      sandboxSelections++;
      continue;
    }

    if (/^(?:--config|-c)=(?:sandbox_mode|default_permissions)\s*=/.test(arg)) {
      sandboxSelections++;
      continue;
    }

    if (
      (arg === '-c' || arg === '--config')
      && /^(?:sandbox_mode|default_permissions)\s*=/.test(extras[index + 1] ?? '')
    ) {
      sandboxSelections++;
      index++;
    }
  }

  if (sandboxSelections > 1) {
    throw new Error('Configure exactly one Codex sandbox selection; conflicting sandbox arguments are not supported.');
  }

  return {
    sandboxArgs: sandboxSelections === 0 ? [...DEFAULT_SANDBOX_ARGS] : [],
    extraArgs: extras,
  };
}
