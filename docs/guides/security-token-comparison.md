# Token comparison hardening

Use the repo's constant-time token helpers whenever comparing operator, webhook verification, bearer, or other shared-secret tokens supplied by an HTTP client.

- `@franken/orchestrator` exposes `constantTimeTokenEqual()` from `src/http/security/constant-time.ts` for control-plane and webhook token checks.
- `@franken/critique` routes bearer Authorization checks through `timingSafeBearerTokenMatches()` in `src/server/token-auth.ts`.
- Do not compare client-supplied secret tokens with `===`, `!==`, prefix checks, or early-return length checks. The helpers hash both sides to fixed-length digests and use `timingSafeEqual`, then require the original lengths to match before accepting.
- Missing, malformed, partial, or wrong-scheme tokens must fail closed with the existing 401/403 responses; never log token values when reporting authentication failures.
