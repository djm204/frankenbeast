# Changelog

## [0.5.2](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.5.1...franken-brain-v0.5.2) (2026-04-01)


### Bug Fixes

* **brain:** flush working memory to SQLite on recovery checkpoint ([e4fab04](https://github.com/djm204/frankenbeast/commit/e4fab044a7ee30274c2b6287c6b83a1ebb904dfe))
* residual one-shots (comms cleanup, HITL test, checkpoint flush, PROGRESS.md) ([e105db3](https://github.com/djm204/frankenbeast/commit/e105db3fe067c6473d3f2a4bc43fc85756487018))

## [0.5.1](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.5.0...franken-brain-v0.5.1) (2026-03-27)


### Refactoring

* **brain:** delete legacy episodic memory and types ([c627d6a](https://github.com/djm204/frankenbeast/commit/c627d6ae2e878f454dbbeacda32974c2d12ea393))
* **brain:** delete legacy episodic memory and types ([e620c62](https://github.com/djm204/frankenbeast/commit/e620c622d3fb25b338e5ce7e5417f82be61163d0))

## [0.5.0](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.4.0...franken-brain-v0.5.0) (2026-03-21)


### Features

* **brain:** add SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([11b7cf0](https://github.com/djm204/frankenbeast/commit/11b7cf0d97b541e0fe51cc66eb75d024259221d2))
* **brain:** implement keyword-based episodic recall with LIKE escaping (Phase 2.3) ([2935709](https://github.com/djm204/frankenbeast/commit/2935709650c5779371694f2a7baeccd4c776c78d))
* **brain:** keyword-based episodic recall (Phase 2.3) ([d122c58](https://github.com/djm204/frankenbeast/commit/d122c587a832065b1c38043843cea1b59f432a85))
* **brain:** SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([f933824](https://github.com/djm204/frankenbeast/commit/f93382433780009edb2d5f14eae8172769f29daa))


### Refactoring

* **brain:** delete old brain code, promote SqliteBrain (Phase 2.4) ([69ec240](https://github.com/djm204/frankenbeast/commit/69ec24042ca8229b71719e585aa75bf76b5acefd))
* **brain:** delete old brain code, promote SqliteBrain (Phase 2.4) ([080ae32](https://github.com/djm204/frankenbeast/commit/080ae3205bb1286d69a8decdd02a0873cc37ef19))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.3.1...franken-brain-v0.4.0) (2026-03-21)


### Features

* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))

## [0.3.1](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.3.0...franken-brain-v0.3.1) (2026-03-09)


### Bug Fixes

* release-please scoping and commit hygiene ([742c7cc](https://github.com/djm204/frankenbeast/commit/742c7cc7792aac3f6f85ee638ba3b165de34bc5f))

## [0.3.0](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.2.0...franken-brain-v0.3.0) (2026-03-09)


### Features

* eslint configs, gitignore hygiene, CLI guard fix ([#99](https://github.com/djm204/frankenbeast/issues/99)) ([87d7427](https://github.com/djm204/frankenbeast/commit/87d74276a909b272141119ce151647118725ce2e))

## [0.2.0](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.1.0...franken-brain-v0.2.0) (2026-03-09)


### Features

* migrate to real monorepo with npm workspaces + Turborepo ([#96](https://github.com/djm204/frankenbeast/issues/96)) ([f2028b1](https://github.com/djm204/frankenbeast/commit/f2028b139003a6bc09df35d8904a53c0457d67cb))
* **orchestrator:** plan-scoped dirs, hook stripping, LLM response caching ([#98](https://github.com/djm204/frankenbeast/issues/98)) ([d97f37c](https://github.com/djm204/frankenbeast/commit/d97f37c05e02c01acb2fda75f2a121f507db62e5))
