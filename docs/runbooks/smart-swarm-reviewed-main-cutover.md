# Smart Swarm reviewed-main dashboard cutover

This runbook replaces the acceptance-only `brain-vitals-stage` deployment with the canonical Smart Swarm operator surface backed by the live Hermes Kanban database.

## Deployment contract

- Deploy only an immutable commit already merged to reviewed `origin/main`.
- Use a detached deployment checkout and point `$HOME/.local/share/frankenbeast/live-dashboard/current` at that checkout.
- Build with `npm ci && npm run build` inside the detached checkout.
- Configure the backend explicitly with:
  - `HERMES_HOME=$HOME/.hermes`
  - `HERMES_KANBAN_DB=$HERMES_HOME/kanban.db`
- Keep backend port `3747` and dashboard/BFF port `5190` bound to `127.0.0.1` only.
- Expose only the dashboard/BFF through an authenticated HTTPS tunnel.
- Set `FRANKENBEAST_DASHBOARD_TRUSTED_PROXY_ORIGIN` to the tunnel's exact public HTTPS origin (scheme plus host, with no path).
- Generate a separate high-entropy proxy token, load it into the dashboard through a systemd encrypted credential as `FRANKENBEAST_DASHBOARD_TRUSTED_PROXY_TOKEN`, and configure the tunnel traffic policy to remove any client-supplied `X-Frankenbeast-Proxy-Token` before adding the credential value. Never reuse the operator token.
- Forwarded HTTP/WebSocket origin metadata is rejected unless it matches the explicit origin, arrives through the loopback proxy peer, and carries the matching proxy token. The BFF strips the proxy token before forwarding upstream.
- Load the operator and proxy tokens through separate systemd encrypted credentials. Never store or print them in a unit, wrapper, repository file, command transcript, or acceptance artifact.
- Make service wrappers compare the detached checkout's `git rev-parse HEAD` with the configured reviewed SHA and fail closed on a mismatch.
- Do not seed, copy, or fall back to staging, fixture, demo, `design-interview`, or synthetic acceptance records.

The durable user services are:

- `frankenbeast-smart-swarm-live-backend.service`
- `frankenbeast-smart-swarm-live-dashboard.service`
- `frankenbeast-smart-swarm-live-ngrok.service`

The former `frankenbeast-brain-vitals-stage-*` units must remain disabled and inactive after cutover.

## Verification

1. Confirm all three live units are enabled and active.
2. Confirm the backend and dashboard process working directories resolve through the immutable `current` symlink and that the detached checkout HEAD equals the recorded reviewed SHA.
3. Confirm ports `3747`, `5190`, and ngrok's local control port are loopback-only.
4. Confirm an unauthenticated public request returns `401` and authenticated local/public dashboard requests return `200`.
5. Compare the local and public `index.html` SHA-256 digests.
6. Query the authenticated local and public Hermes provider/snapshot APIs. Confirm both expose current real task/workspace/activity state and no `design-interview` fallback.
7. Mint an authenticated runtime SSE ticket and receive a public stream frame.
8. In a real browser, open `#/brain-vitals`, confirm it canonicalizes to `#/smart-swarm`, select Hermes, observe `Live · connected`, and verify a current live task is visible without console errors or unexpected resource failures.
9. Restart all three live units, then repeat health, provenance, API, SSE, and browser checks.

Do not publish credentials, raw database contents, authenticated request headers, or unredacted task bodies as evidence.

## Rollback

1. Stop and disable the three `frankenbeast-smart-swarm-live-*` units.
2. Repoint the `current` symlink to the previous immutable reviewed deployment checkout; never point it at a mutable development worktree.
3. Update each unit's expected SHA to the rollback commit and run `systemctl --user daemon-reload`.
4. Enable/start the live backend, dashboard, and ngrok units in dependency order.
5. Repeat every verification step above against the rollback SHA.

If the replacement cannot pass authenticated local/public health, SSE, browser, and provenance checks, keep the public tunnel stopped rather than serving an unverified or stale artifact.

## Teardown

When the operator explicitly withdraws the public dashboard, disable and stop the three live units. Remove only the dashboard `current` symlink and local tunnel policy/credential material after confirming no other service references them. Detached deployment checkouts can then be removed with `git worktree remove` from the repository that owns them.
