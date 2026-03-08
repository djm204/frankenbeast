# Copilot Instructions

Guidelines for GitHub Copilot in this project. Full rules are in `.cursor/rules/`.

## Project Configuration

**Installed Templates:** javascript-expert, web-backend, devops-sre, qa-engineering, testing

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
| `security-fundamentals.mdc` | Security fundamentals - zero trust, input validation, OWASP prevention, secrets management. Universal security practices for all software. |

## Template Rules

### javascript-expert

Principal-level JavaScript & TypeScript engineering (Node.js, React, type system, testing)

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

### web-backend

Backend APIs and services (REST, GraphQL, microservices)

| Rule | Guidance |
|------|----------|
| `api-design.mdc` | API Design |
| `authentication.mdc` | Authentication & Authorization |
| `database-patterns.mdc` | Database Patterns |
| `error-handling.mdc` | Error Handling |
| `overview.mdc` | Web Backend Development |
| `security.mdc` | Backend Security |
| `testing.mdc` | Backend Testing |

### devops-sre

DevOps and SRE practices (incident management, observability, SLOs, chaos engineering)

| Rule | Guidance |
|------|----------|
| `capacity-planning.mdc` | Capacity planning—measure first, plan for growth, load/stress test, right-size. Compute, storage, network, DB; thresholds and scaling. |
| `change-management.mdc` | Change management—small changes, progressive delivery, reversibility, observability. Risk levels, deployment checklist, rollback. |
| `chaos-engineering.mdc` | Chaos engineering—hypothesis-driven experiments, minimal blast radius, production-like env. Pod/network/resource failure; validate resilience and alerting. |
| `disaster-recovery.mdc` | Disaster recovery—RTO/RPO, backup strategy, failover, DR testing. Plan for failure; test regularly; automate where possible. |
| `incident-management.mdc` | Incident management—severity levels, response process, incident commander, communication. Detect, respond, mitigate, resolve; blameless postmortem. |
| `observability.mdc` | Observability—metrics (four golden signals, RED/USE), logs (structured), traces, alerting. User-centric; actionable; correlate across stack. |
| `overview.mdc` | DevOps/SRE Overview |
| `postmortems.mdc` | Postmortems—blameless, thorough, actionable. Timeline, root cause, action items, shared learnings. Focus on systems, not individuals. |
| `runbooks.mdc` | Runbooks—alert, service, and procedure runbooks. Executable steps, current and tested; link from alerts; update after incidents. |
| `slo-sli.mdc` | SLOs, SLIs, and error budgets—definitions, choosing SLIs, error budget policy, burn-rate alerting. Balance reliability and velocity. |
| `toil-reduction.mdc` | Toil reduction—identify, measure, automate or eliminate. Manual, repetitive, automatable work with no enduring value; invest in reduction. |

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
