# Chunk 09: Add CI Workflow

## Objective

Create a GitHub Actions CI workflow that runs `turbo run build test lint` on push to main and on pull requests. The existing `release-please.yml` should work as-is with the updated configs.

## Files

- **Create**: `.github/workflows/ci.yml`
- **Verify**: `.github/workflows/release-please.yml` (no changes expected)

## Context

Currently the only workflow is `release-please.yml`. There is no CI build/test workflow. With Turborepo now orchestrating builds, a simple CI workflow can run everything.

## Success Criteria

- [ ] `.github/workflows/ci.yml` exists
- [ ] Triggers on push to `main` and pull requests to `main`
- [ ] Uses Node.js 22 (orchestrator requires `>=22.0.0`)
- [ ] Runs `npm ci` then `npx turbo run build test lint`
- [ ] YAML is valid
- [ ] `release-please.yml` still references correct config/manifest paths (verify, don't modify)

## Verification Command

```bash
cd /home/pfk/dev/frankenbeast && \
test -f .github/workflows/ci.yml && echo "ci.yml: OK" && \
grep -q 'turbo run' .github/workflows/ci.yml && echo "uses turbo: OK" && \
grep -q 'node-version' .github/workflows/ci.yml && echo "node setup: OK" && \
echo "ALL PASSED"
```

## Hardening Requirements

- Use `npm ci` (not `npm install`) in CI for deterministic installs
- Cache npm dependencies for faster CI (`actions/setup-node` has built-in cache support)
- Do NOT modify `release-please.yml` unless it's broken
- Keep the workflow simple — no matrix builds, no separate jobs per module (turbo handles parallelism)
- Commit: `ci: add CI workflow with Turborepo build/test/lint`
