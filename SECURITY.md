# Security Policy

Frankenbeast is a deterministic guardrails framework, so security reports and operational hardening guidance are handled as first-class project work.

## Reporting a vulnerability

Please report suspected vulnerabilities privately instead of opening a public issue. Use GitHub's private vulnerability reporting flow for this repository when available:

- https://github.com/djm204/frankenbeast/security/advisories/new

If private reporting is unavailable, contact the repository owner and include enough detail to reproduce the issue safely:

- affected package, command, route, or workflow;
- impact and prerequisites;
- minimal reproduction steps or proof-of-concept details;
- whether credentials, secrets, or user data may be exposed.

We will acknowledge actionable reports as quickly as possible, triage severity, and coordinate a fix before public disclosure when warranted.

## Supported versions

Frankenbeast is pre-1.0 and evolves quickly. Security fixes are applied to `main` first and included in the next tagged release. Operators should track the latest release line and review release notes for security-related changes.

## Dependency updates

- Dependabot is configured for npm workspace dependencies and GitHub Actions updates.
- Keep npm dependencies on the repository-pinned package manager (`packageManager` in `package.json`).
- Run `npm run audit:dependencies` and `npm run audit:security` before shipping security-sensitive changes.
- The CI workflow runs dependency vulnerability checks, major-version freshness checks, and SBOM generation on pull requests.
- Dependabot must ignore first-party `@franken/*` workspace packages and exclude that scope from broad npm update groups; release automation owns internal package version changes so registry-driven dependency PRs cannot confuse workspace packages with public packages.
- The daily deterministic security scan runs Semgrep, Gitleaks, and dependency audit jobs; treat its filed issues as active security work until closed.
- Prefer targeted dependency upgrades with lockfile review over broad updates that mix unrelated changes.

## Secret handling

- Never commit real API keys, webhook secrets, tokens, private keys, cookies, session dumps, or customer data.
- Use `.env.example` for placeholder configuration only; keep local `.env` files untracked.
- Prefer runtime secret stores and environment injection over hard-coded config values.
- Redact secrets from logs, traces, screenshots, SARIF output, and issue/PR comments.
- Rotate any secret that may have been exposed in a branch, artifact, dependency report, or chat transcript.

## HTTPS and network exposure

- Use HTTPS for production deployments and public callbacks.
- Keep dashboard and chat-server traffic same-origin through a trusted proxy/BFF when browser clients need protected routes.
- Do not expose operator-token-protected endpoints directly to untrusted networks without TLS, authentication, and rate limiting.
- Treat loopback development defaults as local-only conveniences, not production security settings.

## Runtime hardening

When deploying Frankenbeast services, apply defense-in-depth controls around the Node.js runtime and HTTP surface:

- Run services with the least privileges and a dedicated service account.
- Set explicit project roots (`--base-dir` where supported) so file access and generated artifacts stay inside the intended checkout.
- Keep human-in-the-loop approval gateways enabled for destructive or high-risk actions.
- Validate webhook signatures and operator tokens before processing privileged requests.
- Use secure HTTP headers such as Helmet-compatible defaults at the edge or application layer.
- Apply rate limits to authentication, webhook, chat, and operator-action endpoints.
- Store logs and traces in locations with restricted access and retention appropriate for their sensitivity.
- Monitor security scan output and GitHub security alerts regularly.

## Security checks

Useful local checks before opening or merging security-sensitive changes:

```bash
npm run audit:dependencies
npm run audit:security
npm run check:dependabot-supply-chain
npm run lint:security
```

Pull requests also run the CI security gates and the scheduled daily security workflow reports deterministic SAST, secret-scan, and dependency-audit findings.
