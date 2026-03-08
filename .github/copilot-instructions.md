# Copilot Instructions

Guidelines for GitHub Copilot in this project. Full rules are in `.cursor/rules/`.

## Project Configuration

**Installed Templates:** javascript-expert, qa-engineering, testing, cli-tools, ml-ai, security-expert

## Core Principles

- **Honesty over output**: Say what works and what doesn't; admit uncertainty
- **Security first**: Zero trust, validate all inputs, no secrets in code
- **Tests required**: No feature ships without tests; test behavior, not implementation
- **Code quality**: SOLID, DRY, explicit over implicit

## Shared Rules

| Rule | Guidance |
|------|----------|
| `code-quality.mdc` | Code quality standards - SOLID, DRY, clean code practices, naming, error handling, immutability. Universal across languages and frameworks. |
| `communication.mdc` | Communication guidelines - direct, honest, objective interaction when assisting with development. Tone, code communication, avoiding common issues. |
| `core-principles.mdc` | Core principles - honesty over output, simplicity, tests required, professional objectivity, incremental progress. Universal guidance for all development. |
| `git-workflow.mdc` | Git workflow - commits, branching, PRs, safety rules. Universal git practices for clean, traceable project history. |
| `review-protocol.mdc` | Review protocol for plan mode, architecture reviews, and code changes. Phased review with structured issue reporting. |
| `security-fundamentals.mdc` | Security fundamentals - zero trust, input validation, OWASP prevention, secrets management. Universal security practices for all software. |

## Template Rules

### javascript-expert

JavaScript and TypeScript — Node.js, React, type system, performance, and testing

| Rule | Guidance |
|------|----------|
| `language-deep-dive.mdc` | JavaScript Language Deep Dive |
| `node-patterns.mdc` | Node.js Patterns |
| `overview.mdc` | JavaScript & TypeScript Expert |
| `performance.mdc` | JavaScript Performance |
| `react-patterns.mdc` | React Patterns |
| `testing.mdc` | JavaScript Testing |
| `tooling.mdc` | JavaScript Tooling |
| `typescript-deep-dive.mdc` | TypeScript Deep Dive |

### qa-engineering

Quality assurance programs for confident, rapid software delivery

| Rule | Guidance |
|------|----------|
| `automation.mdc` | Test Automation |
| `metrics.mdc` | QA Metrics |
| `overview.mdc` | QA Engineering |
| `quality-gates.mdc` | Quality Gates |
| `test-design.mdc` | Test Design |
| `test-strategy.mdc` | Test Strategy |

### testing

Comprehensive testing practices (TDD, test design, CI/CD integration, performance testing)

| Rule | Guidance |
|------|----------|
| `advanced-techniques.mdc` | Advanced testing—property-based, mutation, contract (Pact), chaos. Invariants over examples; test quality; consumer-driven contracts. |
| `ci-cd-integration.mdc` | CI/CD test integration—pipeline order (static, unit, integration, E2E), fast feedback, coverage and artifacts. Concurrency and reporting. |
| `overview.mdc` | Testing Best Practices |
| `performance-testing.mdc` | Performance testing—smoke, load, stress, spike, soak. k6 stages and thresholds; baseline and regression; run in CI or on schedule. |
| `quality-metrics.mdc` | Quality Metrics |
| `reliability.mdc` | Test reliability—eliminate flakiness. Timing (explicit waits), isolation, no order dependency, mock time; zero flaky in CI. |
| `tdd-methodology.mdc` | TDD Methodology |
| `test-data.mdc` | Test data—factories, fixtures, isolation, determinism. Realistic but minimal; no production data; Faker with seed for reproducibility. |
| `test-design.mdc` | Test design—AAA, Given-When-Then, isolation, one assertion focus. Test behavior; use factories; avoid shared state and implementation coupling. |
| `test-types.mdc` | Test Types |

### cli-tools

Command-line applications and developer tools (Cobra, Commander, Click)

| Rule | Guidance |
|------|----------|
| `architecture.mdc` | CLI Architecture |
| `arguments.mdc` | Command-Line Arguments |
| `distribution.mdc` | CLI distribution—versioning (SemVer), packaging (npm, Homebrew, binaries), shell completions, install scripts. Version flag and release flow. |
| `error-handling.mdc` | Error Handling |
| `overview.mdc` | CLI Tools Development Overview |
| `testing.mdc` | CLI testing—unit (business logic), integration (full commands, capture stdout/stderr), exit codes. Mock I/O; test non-interactively. |
| `user-experience.mdc` | CLI UX—stdout vs stderr, output formats (table, JSON, plain), colors, progress, non-interactive. Human-first, scriptable. |

### ml-ai

Machine learning and AI systems (model development, deployment, monitoring)

| Rule | Guidance |
|------|----------|
| `data-engineering.mdc` | Data Engineering for ML |
| `deployment.mdc` | ML deployment—real-time vs batch, KServe/Triton, scaling, versioning, rollback. Package model and deps; same preprocessing as training. |
| `model-development.mdc` | Model development—experiment tracking, metrics, evaluation by segment, hyperparameter tuning. Reproducibility; version data, code, config. |
| `monitoring.mdc` | ML monitoring—data and concept drift, performance tracking, latency and throughput. Evidently/WhyLabs-style checks; alerts on degradation. |
| `overview.mdc` | ML/AI Development Overview |
| `security.mdc` | ML security and responsible AI—input validation, adversarial robustness, fairness, explainability. Data poisoning, extraction, abuse; NIST-aligned. |
| `testing.mdc` | ML testing - data validation, transform parity, model behavior, integration. Statistical correctness; train/serve consistency. |

### security-expert

Application security engineering — threat modeling, secure code, OWASP prevention, supply chain security

| Rule | Guidance |
|------|----------|
| `overview.mdc` | Application Security Engineering |
| `threat-modeling.mdc` | Threat Modeling and Secure Design |
| `input-validation.mdc` | Input Validation and Injection Prevention |
| `auth.mdc` | Authentication and Authorization Patterns |
| `cryptography.mdc` | Cryptography Selection and Key Management |
| `dependencies.mdc` | Dependency Security and Supply Chain Hardening |
| `error-handling-logging.mdc` | Secure Error Handling and Security Logging |
| `headers-api.mdc` | Security Headers, CORS, and API Hardening |
