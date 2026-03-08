# Copilot Instructions

Guidelines for GitHub Copilot in this project. Full rules are in `.cursor/rules/`.

## Project Configuration

**Installed Templates:** javascript-expert, qa-engineering, testing, web-backend

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
