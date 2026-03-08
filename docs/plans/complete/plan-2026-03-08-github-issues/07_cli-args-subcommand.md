# Chunk 07: CLI Args — `issues` Subcommand

## Objective

Extend the CLI argument parser to support the `issues` subcommand with all filter flags (`--label`, `--milestone`, `--search`, `--assignee`, `--limit`, `--repo`, `--dry-run`).

## Files

- **Modify**: `franken-orchestrator/src/cli/args.ts` (add subcommand + flags)
- **Test**: `franken-orchestrator/tests/unit/cli/args.test.ts` (add test cases)

## Success Criteria

- [ ] `Subcommand` type extended: `'interview' | 'plan' | 'run' | 'issues' | undefined`
- [ ] `VALID_SUBCOMMANDS` set includes `'issues'`
- [ ] `CliArgs` interface extended with: `issueLabel?: string[]`, `issueMilestone?: string`, `issueSearch?: string`, `issueAssignee?: string`, `issueLimit?: number`, `issueRepo?: string`, `dryRun?: boolean`
- [ ] `parseArgs()` handles `--label` (comma-separated → string array), `--milestone`, `--search`, `--assignee`, `--limit` (number), `--repo`, `--dry-run`
- [ ] Usage text updated with `issues` subcommand and all flags documented
- [ ] `parseArgs(['issues', '--label', 'critical,high'])` returns `{ subcommand: 'issues', issueLabel: ['critical', 'high'] }`
- [ ] `parseArgs(['issues', '--dry-run'])` returns `{ subcommand: 'issues', dryRun: true }`
- [ ] All existing arg tests still pass
- [ ] New tests cover all issue-specific flags
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/cli/args.test.ts
```

## Hardening Requirements

- `--label` is comma-separated: `--label "critical,high"` → `['critical', 'high']`
- `--limit` must parse as integer, default 30 when subcommand is `issues` and flag is absent
- Do NOT break existing flag parsing — issue flags are additive
- `--dry-run` should only be relevant for the `issues` subcommand but doesn't hurt to parse globally
- Check for conflicts: `--design-doc` and `issues` subcommand should warn (not crash)
