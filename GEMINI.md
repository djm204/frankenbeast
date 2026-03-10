# GEMINI.md - Development Guide

This project uses AI-assisted development with Gemini CLI. Rules in `.cursor/rules/` provide guidance.

## Installed Templates

- **Shared** (always included): Core principles, code quality, security, git workflow, communication, gemini cli
- **web-frontend**: Frontend web applications (SPAs, SSR, static sites, PWAs)

## Rule Files

All rules are in `.cursor/rules/`. The AI assistant reads these automatically.

#### Shared Rules

| Rule | Purpose |
|------|---------|
| `core-principles.mdc` | Honesty, simplicity, testing requirements |
| `code-quality.mdc` | SOLID, DRY, clean code patterns |
| `security-fundamentals.mdc` | Zero trust, input validation, secrets |
| `git-workflow.mdc` | Commits, branches, PRs, safety |
| `communication.mdc` | Direct, objective, professional |
| `gemini-cli.mdc` | Guidelines for Gemini CLI |

#### Web-frontend Rules

| Rule | Purpose |
|------|---------|
| `web-frontend-accessibility.mdc` | accessibility guidelines |
| `web-frontend-component-patterns.mdc` | component patterns guidelines |
| `web-frontend-overview.mdc` | overview guidelines |
| `web-frontend-performance.mdc` | performance guidelines |
| `web-frontend-state-management.mdc` | state management guidelines |
| `web-frontend-styling.mdc` | styling guidelines |
| `web-frontend-testing.mdc` | testing guidelines |

## Customization

- Create new `.mdc` files in `.cursor/rules/` for project-specific rules
- Edit existing files directly; changes take effect immediately
- Re-run to update: `npx @djm204/agent-skills web-frontend`
