# Point-in-time incident export

Use `frankenbeast dr export` when incident responders need a compact evidence bundle without copying raw secrets or restoring state.

```bash
frankenbeast dr export .fbeast /tmp/franken-incident-export.json
frankenbeast --dry-run dr export .fbeast /tmp/franken-incident-export.json
```

The source directory should be the full `.fbeast` evidence root in the default layout, so sibling config, state, run, and log paths are captured together.

The export is a JSON report with:

- manifest timestamp, source directory, section counts, file checksums, and config checksums;
- approval summaries with sensitive fields redacted;
- memory metadata only, not memory values;
- Kanban/task and run summaries when JSON metadata files are present;
- redacted tails for log files.

Dry-run mode prints the same report shape with `wouldWrite: false` and does not create the output file. Non-dry-run output is written with mode `0600`.

The command uses the shared logging redaction suite before printing or writing. Treat the artifact as incident evidence anyway: attach it only to restricted postmortem or recovery threads and avoid using it as a restore source.
