# Secret redaction regression fixtures

Frankenbeast keeps a shared regression harness in `tests/security-secret-redaction-regression.test.ts`. It pushes representative credential shapes through logs, memory writes, trace persistence, and HTTP error responses, then asserts each surface identifies the leaking surface without printing the raw credential.

## Covered fixture families

- GitHub-style tokens.
- Discord webhook URLs.
- npm automation tokens.
- Database URLs with user/password authority sections.
- Cookie and Set-Cookie headers.
- Generic Bearer/token authorization strings.

## Adding a new secret pattern safely

1. Add the smallest redaction rule in the surface implementation that owns the leak.
2. Add a fixture to the shared harness by constructing the sample from string fragments, not by pasting a real-looking credential literal.
3. Assert with `assertNoFixtureLeak(surface, value)` so failures report only the fixture name and surface, not the secret bytes.
4. Run the targeted harness and the owning package tests before widening to package-level checks.
5. Never use production credentials in fixtures; use deterministic fake fragments with enough shape to exercise the matcher.
