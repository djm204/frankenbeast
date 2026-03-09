# Changelog

## [0.7.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.6.0...franken-orchestrator-v0.7.0) (2026-03-09)


### Features

* **chat:** add ChatAgentExecutor implementing ITaskExecutor ([b9dbaf0](https://github.com/djm204/frankenbeast/commit/b9dbaf045931c0097850149af98789f8ce703c1f))
* **chat:** add spinner to chat REPL during LLM replies ([01740d2](https://github.com/djm204/frankenbeast/commit/01740d2c40305b90b0d394796d014c892c7f7a24))
* **chat:** add withSpinner async helper for shared spinner UX ([1187ef8](https://github.com/djm204/frankenbeast/commit/1187ef88d5de5a6508724b075e9b791e19cec5ea))
* **chat:** replace stub executor with ChatAgentExecutor in chat subcommand ([64f92b0](https://github.com/djm204/frankenbeast/commit/64f92b0b445212a639bf3b6d4524623607a2ce77))
* **chat:** session continuation, input blocking, spinner, output sanitization, color diff ([e4eb862](https://github.com/djm204/frankenbeast/commit/e4eb86252fc641a17eded66040059c57f4e82702))
* **chat:** wire /run and /plan slash commands to TurnRunner dispatch ([97062ce](https://github.com/djm204/frankenbeast/commit/97062ceb5c41fe4dc1a0144d34900f2f86ac60d7))
* **franken-orchestrator:** add conversational chat interface with CLI, HTTP, SSE, and web UI ([13c01f4](https://github.com/djm204/frankenbeast/commit/13c01f410ab81f5fc8223543d567e454701365fb))


### Bug Fixes

* **chat:** foundational chat REPL fixes from prior session ([c3e8300](https://github.com/djm204/frankenbeast/commit/c3e8300ebd831bbae059007217e4dddbace5631f))

## [0.6.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.5.0...franken-orchestrator-v0.6.0) (2026-03-09)


### Features

* **planner:** add ChunkDecomposer with codebase-aware decomposition prompt ([24c521e](https://github.com/djm204/frankenbeast/commit/24c521e0afaf206b68269b60886a944e7cfff5f3))
* **planner:** add ChunkFileWriter for 10-field .md chunk output ([d7dc66b](https://github.com/djm204/frankenbeast/commit/d7dc66b17a76153e8c6a61066d53417fabfd011c))
* **planner:** add ChunkRemediator for auto-patching validation issues ([8a0d7e5](https://github.com/djm204/frankenbeast/commit/8a0d7e53f84c345e09cb2ec29f2bf4b98d429d23))
* **planner:** add ChunkValidator for multi-pass validation ([433d7a8](https://github.com/djm204/frankenbeast/commit/433d7a8f2f1e9507a807e534f79dee81563309fc))
* **planner:** add PlanContextGatherer for codebase-aware planning ([9d25187](https://github.com/djm204/frankenbeast/commit/9d25187386ca1bac1caa7d66fab8779d974109e6))
* **planner:** expand ChunkDefinition to 11 fields, consolidate type ([f8ac7be](https://github.com/djm204/frankenbeast/commit/f8ac7be3bc4dac2cc08bfbd4e953e9d9f2dcb96c))
* **planner:** multi-pass codebase-aware planning pipeline ([0877494](https://github.com/djm204/frankenbeast/commit/0877494c72b1dd2c78e217b1dc78af478a927a24))
* **planner:** refactor LlmGraphBuilder to multi-pass pipeline with 10-field prompts ([3fd09af](https://github.com/djm204/frankenbeast/commit/3fd09af56fba1ce17566f18447027ffd3275c636))
* **planner:** wire multi-pass pipeline and ChunkFileWriter into session.ts ([3dfd30c](https://github.com/djm204/frankenbeast/commit/3dfd30cdff42c359b71945a51b25e5d52ad946ce))

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
