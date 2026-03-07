# Changelog

## [0.2.0](https://github.com/djm204/frankenbeast/compare/frankenbeast-v0.1.0...frankenbeast-v0.2.0) (2026-03-07)


### Features

* add Approach C implementation chunks + build-runner ([b620d5e](https://github.com/djm204/frankenbeast/commit/b620d5ed70cf2de5d0afbf182896651b09f1e51b))
* add beast runner implementation plan + RALPH loop chunks ([4720f32](https://github.com/djm204/frankenbeast/commit/4720f32770819aa85f456e0e5ee116fc867525bd))
* add franken-mcp module with design and implementation plan ([1acf1b9](https://github.com/djm204/frankenbeast/commit/1acf1b94dccf50f181570f52d0bc362ea52e8542))
* add LLM integration examples across 3 tiers ([699a9b7](https://github.com/djm204/frankenbeast/commit/699a9b7af978fb3e253c4dcaf412ca0d9add9d5c))
* add RALPH-loop execution plan for executeTask workflow ([45793de](https://github.com/djm204/frankenbeast/commit/45793de6889e5c74d79eea4f78dcc341a5a8c671))
* **examples:** add claude-hello quickstart ([bae09fb](https://github.com/djm204/frankenbeast/commit/bae09fb5fc99ff527c1ec155408177c58b23b95c))
* **examples:** add code-review-agent scenario with full Beast Loop simulation ([5202840](https://github.com/djm204/frankenbeast/commit/520284016d2f7278a5dacbfac5a2800a6ce6458d))
* **examples:** add cost-aware-routing pattern with complexity-based provider selection ([7aefead](https://github.com/djm204/frankenbeast/commit/7aefead95ba75ed5637df358980b5238cd2d22f2))
* **examples:** add custom-adapter quickstart with Groq IAdapter implementation ([828ccf5](https://github.com/djm204/frankenbeast/commit/828ccf5779aeade33b8a01c874760968bebfa4c1))
* **examples:** add local-model-gallery pattern comparing Ollama models ([a6162d7](https://github.com/djm204/frankenbeast/commit/a6162d776e3c492f1402ac16c44b6a08dc604883))
* **examples:** add multi-provider-fallback pattern ([7068233](https://github.com/djm204/frankenbeast/commit/7068233525af200072d86d7367d7ab386b616c66))
* **examples:** add ollama-hello quickstart with local model setup ([bae9c3a](https://github.com/djm204/frankenbeast/commit/bae9c3afbb0e6c63061cd0a55c31a16e98e1c2b3))
* **examples:** add openai-hello quickstart ([8056d44](https://github.com/djm204/frankenbeast/commit/8056d44692dee3fcaf4a2bfb2c000e3c666a8b64))
* **examples:** add privacy-first-local scenario with Docker Compose and PII masking ([0926ecb](https://github.com/djm204/frankenbeast/commit/0926ecb3cc09fa465d0764bd0766574e297a2bf4))
* **examples:** add research-agent-hitl scenario with CLI approval flow ([7de6377](https://github.com/djm204/frankenbeast/commit/7de63779938ed80a5f1777e0c667c1e6563ed9e7))
* **examples:** add tool-calling pattern with normalized tool_calls output ([4a970e5](https://github.com/djm204/frankenbeast/commit/4a970e5300f1f9a2767ccef4ce2a52716ac32681))
* global CLI with interactive pipeline, session orchestrator, and HITM review loops ([dc4a529](https://github.com/djm204/frankenbeast/commit/dc4a5292ef647335c4d950af93caefae687716c2))
* make build-runner.ts reusable with --plan-dir and --base-branch ([069272e](https://github.com/djm204/frankenbeast/commit/069272e02e61f965fe1e1fb431bf5c15f70024c0))
* **PR-19:** contract audit, compatibility matrix, and integration tests ([ef24cb6](https://github.com/djm204/frankenbeast/commit/ef24cb61f000cc9a7a3ba3831822ce690480c720))
* **PR-33:** OpenClaw integration example ([51f1e0c](https://github.com/djm204/frankenbeast/commit/51f1e0c0ce75c7c5d8f48026b258757b272ab067))
* **PR-41:** local dev environment ([4d505be](https://github.com/djm204/frankenbeast/commit/4d505be2d6a680cb3dcbaf6862921b75a2b56ca4))
* **PR-42:** documentation — guides, ADRs, progress tracker ([6ee4f9a](https://github.com/djm204/frankenbeast/commit/6ee4f9ae441c7bf349b2ca9ae1776d44f07635de))
* rate-limit resilience with provider fallback ([618a79f](https://github.com/djm204/frankenbeast/commit/618a79fb42b9a88a7e019ae4452dbbafe7b371da))


### Bug Fixes

* **plan-beast-runner:** accept base branch as CLI arg instead of hardcoding ([ba2b548](https://github.com/djm204/frankenbeast/commit/ba2b548c7b104299c956531d13ccaca643a386b0))


### Miscellaneous

* add .worktrees to .gitignore ([5ec322e](https://github.com/djm204/frankenbeast/commit/5ec322edc551466428dd067c56e0a0e342b9a43b))
* add project logo assets ([b654cb9](https://github.com/djm204/frankenbeast/commit/b654cb9e3b430a4ea03d8b6f4e110740db563d7a))
* add shared tsconfig for examples directory ([122d9f0](https://github.com/djm204/frankenbeast/commit/122d9f041cbda188fc4740026089e4bb558c7606))
* **assets:** weird New Folder removed and images restored to proper folder ([488209d](https://github.com/djm204/frankenbeast/commit/488209ddea4739a19d2de07c80b13d8b660c8548))
* **img:** img folder was renamed for New Folder, mystery solved, restored. ([bd7f424](https://github.com/djm204/frankenbeast/commit/bd7f4241b43fadcdbcecb69b8f5f0a110c1f1c70))
* update franken-orchestrator gitlink (01_checkpoint_store) ([24c29e4](https://github.com/djm204/frankenbeast/commit/24c29e4c0ffb933e7e9aeec99a5c5884d8cc7f3b))
* update franken-orchestrator gitlink (01_types_and_config) ([cbc8415](https://github.com/djm204/frankenbeast/commit/cbc84156c33c702d7be39b65a94bbfe6ed401027))
* update franken-orchestrator gitlink (02_chunk_file_graph_builder) ([47d5caa](https://github.com/djm204/frankenbeast/commit/47d5caa13299350916a0e3898fb873a3efe7eb1f))
* update franken-orchestrator gitlink (02_ralph_loop) ([c16165a](https://github.com/djm204/frankenbeast/commit/c16165a295dda00b140d3b72e916b0c86050e57e))
* update franken-orchestrator gitlink (03_git_branch_isolator) ([5ea3a79](https://github.com/djm204/frankenbeast/commit/5ea3a793db6535cd792158ea1b9aa633e999dec7))
* update franken-orchestrator gitlink (04_cli_skill_executor) ([fc8b85d](https://github.com/djm204/frankenbeast/commit/fc8b85deb13c59a6f2ca8d48f0a323881a786157))
* update franken-orchestrator gitlink (05_execution_wiring) ([3a97663](https://github.com/djm204/frankenbeast/commit/3a9766396234a9570b27bee161800c0654315ff0))
* update franken-orchestrator gitlink (06_beast_loop_wiring) ([63f92fc](https://github.com/djm204/frankenbeast/commit/63f92fcb8896c824f0b8f1ab90f3dc32015765bb))
* update franken-orchestrator gitlink (07_e2e_integration) ([2ce4a54](https://github.com/djm204/frankenbeast/commit/2ce4a54deabe815c9d82932579e06dade9678a93))
* update gitlinks after release-please setup ([6aa172b](https://github.com/djm204/frankenbeast/commit/6aa172b1d846c36812e1fc0c9f156f21d384410d))
* update planner and governor submodule refs ([3f16419](https://github.com/djm204/frankenbeast/commit/3f16419d5e447056316f6636f4f2bc7b7218c54a))
* update submodule gitlinks ([53a758e](https://github.com/djm204/frankenbeast/commit/53a758e942b03ca205ebd90fa5491a048da5af92))
* update submodule refs after Phase 1 stabilisation ([e1a72c8](https://github.com/djm204/frankenbeast/commit/e1a72c8daf2d3e26809ec8b4d60c5f073752d996))
* update submodule refs after Phases 2-7 implementation ([5bc7b0d](https://github.com/djm204/frankenbeast/commit/5bc7b0d1c553caa09b4152042929d41ffa14e658))


### Documentation

* add --verbose flag for debug-level logging in build runner ([a389f39](https://github.com/djm204/frankenbeast/commit/a389f398088d478f5a1926ebacc2346c72d13399))
* add Approach C full pipeline design doc ([d884b93](https://github.com/djm204/frankenbeast/commit/d884b9302a09189f2d509795805c7b8536b03a9f))
* add beast loop iteration mechanics explainer ([c43d59f](https://github.com/djm204/frankenbeast/commit/c43d59f4d0c32b871aceb1b0cb6c5929c1ff69e8))
* add beast runner productization design doc ([1aed640](https://github.com/djm204/frankenbeast/commit/1aed640814722387b8f76097654a4a594b331419))
* add CLI skill execution path to ARCHITECTURE.md and ADR-007 ([2ae9687](https://github.com/djm204/frankenbeast/commit/2ae96879397b225d8f5ddff51b2bc8277b3582f0))
* add executeTask workflow design ([bff626e](https://github.com/djm204/frankenbeast/commit/bff626ec25916ad0ec5c0121d19826bff680b7ea))
* add LLM integration examples design document ([a55a6f5](https://github.com/djm204/frankenbeast/commit/a55a6f5d2881ef2c0ac4ea5311dd8beb48255e4d))
* add LLM integration examples implementation plan ([05f0a8a](https://github.com/djm204/frankenbeast/commit/05f0a8a6995dd84829ec95bb89f663d956f7e2ed))
* add plain-language project overview ([d7dbbe0](https://github.com/djm204/frankenbeast/commit/d7dbbe0032e0c5454a74ea1917e20db7cd4b2d9b))
* add RAMP_UP.md for agent onboarding ([1daf158](https://github.com/djm204/frankenbeast/commit/1daf15833662936c2cb68a83e3b262616880418e))
* add status description for franken-skills in implementation plan ([8a599c0](https://github.com/djm204/frankenbeast/commit/8a599c079da92effedb46f4eb351d59205db5e77))
* **examples:** add root README with example index and run instructions ([851e101](https://github.com/djm204/frankenbeast/commit/851e1016a4829838f0270089800cc97c3e8a5dea))
* move ARCHITECTURE.md to docs/, update with orchestrator and ports ([c35d08a](https://github.com/djm204/frankenbeast/commit/c35d08a307bb9d5f6571be64e59a01be7f988855))
* rewrite RALPH-loop plan with observer integration and chunk splits ([050a6bc](https://github.com/djm204/frankenbeast/commit/050a6bca59a7a6242cc439d7b55fb69ad08d2840))
* update ARCHITECTURE.md with franken-mcp and examples ([2e23942](https://github.com/djm204/frankenbeast/commit/2e23942e5a6508dfa292cdf86616d16c64e5b537))
* update gitlinks for RAMP_UP.md across all submodules ([0af79d1](https://github.com/djm204/frankenbeast/commit/0af79d1e5907e31aedeadd60d5737e5439531550))
* update implementation plan to reflect completed state ([c0fcfc5](https://github.com/djm204/frankenbeast/commit/c0fcfc54090acc2a43913d64ff00a6f928f24181))
* update README with current project state ([91d4b67](https://github.com/djm204/frankenbeast/commit/91d4b673d9a608fac5fb9d7b1b87b2fce6be1202))


### CI/CD

* add release-please config and workflow ([d258bfd](https://github.com/djm204/frankenbeast/commit/d258bfd505751c3e456bcb173e1270707a79450e))


### Refactoring

* move build-runner.ts into plan-beast-runner/ ([e0a94bb](https://github.com/djm204/frankenbeast/commit/e0a94bb78bba0e13ba283590cf20f0be3a0a21e3))
