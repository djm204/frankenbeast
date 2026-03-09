/**
 * Guardrails injected into every chunk prompt.
 * Prevents spawned agents from performing actions that belong to the
 * orchestrator (PR creation, branch management, plan file mutation).
 */
export const CHUNK_GUARDRAILS =
  `IMPORTANT RULES — do NOT violate these:\n` +
  `- Do NOT run "gh pr create" or create pull requests. PR creation is handled by the orchestrator after all chunks complete.\n` +
  `- Do NOT delete, move, or modify chunk/plan files. They are read-only inputs.\n` +
  `- Do NOT run "git push". The orchestrator manages pushing.\n` +
  `- Do NOT delete source code files unless the chunk explicitly requires it.\n` +
  `- Do NOT commit build artifacts, caches, or generated output (dist/, node_modules/, .turbo/, coverage/, .build/, .env, *.db). These must ALWAYS be in .gitignore. If you add new tools or build steps, add their output directories to .gitignore BEFORE committing.\n` +
  `- If you discover tracked files that should be ignored (build output, caches, logs), remove them from tracking with "git rm -r --cached <path>" and ensure .gitignore covers them.\n`;
