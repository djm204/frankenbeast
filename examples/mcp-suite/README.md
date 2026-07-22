# MCP suite example

From a Frankenbeast checkout, first run `npm run local:link` at the repository root so the current `fbeast` CLI and its server binaries are available on `PATH`, then copy or scaffold this project. Run setup from the example directory so registration and `.fbeast/beast.db` stay project-scoped.

```bash
npm ci

# Register the standard server set for the auto-detected client.
npm run mcp:init

# Or register the lower-context proxy server.
fbeast mcp init --mode=proxy

# Remove the generated client registration when finished.
npm run mcp:uninstall
```

The scripts invoke `fbeast mcp init` and `fbeast mcp uninstall`. Add `-- --client=claude`, `-- --client=gemini`, or `-- --client=codex` to an npm script when auto-detection is ambiguous. Add `--hooks` only after reviewing the generated project-scoped hook settings.

Do not use a one-shot `npx` invocation for initialization: registered clients launch the `fbeast-*` server binaries later, so the linked server commands must remain on `PATH`.
