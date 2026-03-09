# Changelog

## [0.5.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.4.1...franken-orchestrator-v0.5.0) (2026-03-09)


### Features

* **franken-orchestrator:** add spinner to LLM progress, extract cleanLlmJson utility, use lastChunks for plan output ([dccc569](https://github.com/djm204/frankenbeast/commit/dccc56923cda689fc06bdbbd3285400e0342f574))

## [0.4.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.4.0...franken-orchestrator-v0.4.1) (2026-03-09)


### Bug Fixes

* **franken-orchestrator:** prevent plugin poisoning in spawned CLI for planning ([3c9ea2f](https://github.com/djm204/frankenbeast/commit/3c9ea2f22f32ef329127ded67147f7efb25827fc))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.3.1...franken-orchestrator-v0.4.0) (2026-03-09)


### Features

* **franken-orchestrator:** stream LLM progress during planning phase ([9beeb0b](https://github.com/djm204/frankenbeast/commit/9beeb0b5618b02a0eea3323c365ef25e5f8577e5))


### Bug Fixes

* **franken-orchestrator:** strip hookSpecificOutput from LLM responses at all parse sites ([483ce6b](https://github.com/djm204/frankenbeast/commit/483ce6b944b8db6dd35db2c16b0275091bb10fda))
* hook output stripping + stream LLM progress during planning ([5bcc669](https://github.com/djm204/frankenbeast/commit/5bcc6693194edef1775688fc0082a2d1102a1b4c))

## [0.3.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.3.0...franken-orchestrator-v0.3.1) (2026-03-09)


### Bug Fixes

* release-please scoping and commit hygiene ([742c7cc](https://github.com/djm204/frankenbeast/commit/742c7cc7792aac3f6f85ee638ba3b165de34bc5f))

## [0.3.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.2.0...franken-orchestrator-v0.3.0) (2026-03-09)


### Features

* eslint configs, gitignore hygiene, CLI guard fix ([#99](https://github.com/djm204/frankenbeast/issues/99)) ([87d7427](https://github.com/djm204/frankenbeast/commit/87d74276a909b272141119ce151647118725ce2e))

## [0.2.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.1.0...franken-orchestrator-v0.2.0) (2026-03-09)


### Features

* migrate to real monorepo with npm workspaces + Turborepo ([#96](https://github.com/djm204/frankenbeast/issues/96)) ([f2028b1](https://github.com/djm204/frankenbeast/commit/f2028b139003a6bc09df35d8904a53c0457d67cb))
* **orchestrator:** add chunk prompt guardrails to prevent destructive agent actions ([9cdb5b0](https://github.com/djm204/frankenbeast/commit/9cdb5b0f93a8f0db756bd2386c6850ef363efa12))
* **orchestrator:** plan-scoped dirs, hook stripping, LLM response caching ([#98](https://github.com/djm204/frankenbeast/issues/98)) ([d97f37c](https://github.com/djm204/frankenbeast/commit/d97f37c05e02c01acb2fda75f2a121f507db62e5))
