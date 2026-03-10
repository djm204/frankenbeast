# Changelog

## [0.13.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.12.0...franken-orchestrator-v0.13.0) (2026-03-10)


### Features

* add init cli surface ([015c599](https://github.com/djm204/frankenbeast/commit/015c599d96f512c0f2cec6a4baf146843cef65bd))
* add init config wizard ([9129b73](https://github.com/djm204/frankenbeast/commit/9129b736bf0d0fd79a9089dab9eebe6178b1ff4d))
* add init state and registries ([a00d3e3](https://github.com/djm204/frankenbeast/commit/a00d3e39f275adaf23733fcbfa86a94755833860))
* add init verify and repair flows ([4f44bb2](https://github.com/djm204/frankenbeast/commit/4f44bb214169b8576e270c864181191d55cb961e))
* add init wizard engine ([a1f9d95](https://github.com/djm204/frankenbeast/commit/a1f9d951418efcb43876a9176bfc2894fa3c206a))


### Bug Fixes

* **observer:** fix cost tracking and document implementation gaps ([7054989](https://github.com/djm204/frankenbeast/commit/7054989522894d5bd2429d71ef73d041e9599725))
* **observer:** fix zero-cost tracking and document implementation gaps ([c75c322](https://github.com/djm204/frankenbeast/commit/c75c322b46dc804873cff78c1ae8756104092cb7))

## [0.12.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.11.1...franken-orchestrator-v0.12.0) (2026-03-10)


### Features

* add beasts dispatch station ([5d87015](https://github.com/djm204/frankenbeast/commit/5d87015b72c714481f846547bdfb847068478e00))
* **dashboard:** add beasts dispatch station ([2e5537a](https://github.com/djm204/frankenbeast/commit/2e5537a3cdecc078e55d2ecdfb84c62735bdf265))
* **orchestrator:** add beast cli dispatch commands ([1d9a44e](https://github.com/djm204/frankenbeast/commit/1d9a44ecbfa8ea7395a2c31c671b7f8b4f077378))
* **orchestrator:** add beast dispatch services and metrics ([dd1fcb2](https://github.com/djm204/frankenbeast/commit/dd1fcb2889ea4f057ddddac67cdb164ffed73fc1))
* **orchestrator:** add beast domain types and storage paths ([3776f12](https://github.com/djm204/frankenbeast/commit/3776f12b271942bc021104a2757f05595717ab03))
* **orchestrator:** add beast process executor and container stub ([4f35887](https://github.com/djm204/frankenbeast/commit/4f358872a58a3c1eaaf7696ec3e89d1f577c210d))
* **orchestrator:** add fixed beast catalog and interview service ([35942a2](https://github.com/djm204/frankenbeast/commit/35942a2aca31b85ee8724291d16af9745abcadfb))
* **orchestrator:** add secure beast dispatch routes ([36e63ac](https://github.com/djm204/frankenbeast/commit/36e63acb5ab8bda89e7632f7b00dab8e0c65a3f1))
* **orchestrator:** dispatch beasts from chat sessions ([b4336ab](https://github.com/djm204/frankenbeast/commit/b4336ab17b830e4777cf4d302037628c01887585))
* **orchestrator:** persist beast runs attempts and logs ([b8344e8](https://github.com/djm204/frankenbeast/commit/b8344e8767b4b3bbc5fdb9db67cbf34a645abf5b))

## [0.11.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.11.0...franken-orchestrator-v0.11.1) (2026-03-10)


### Bug Fixes

* **network:** harden startup flow and dashboard connectivity ([b881f2b](https://github.com/djm204/frankenbeast/commit/b881f2bd2d7bf5aa68e9e1f76986d18204811021))
* **network:** harden startup flow and dashboard connectivity ([c312e9f](https://github.com/djm204/frankenbeast/commit/c312e9fd4dd6e2db0f3388da765a3bcb6d7e1b92))

## [0.11.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.10.0...franken-orchestrator-v0.11.0) (2026-03-10)


### Features

* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))
* **chat:** attach CLI chat to managed network service ([95fa321](https://github.com/djm204/frankenbeast/commit/95fa32102a0ab259ffc9a8af0a4742b3a8ae923b))
* **network:** add canonical operator config ([aae7341](https://github.com/djm204/frankenbeast/commit/aae734127c218e412cf3a80449bc20193ef406b3))
* **network:** add cli command surface ([c5bb2c4](https://github.com/djm204/frankenbeast/commit/c5bb2c4594edd2c06e759252cbe1df44ed734cf0))
* **network:** add config-driven network operator control plane ([816ef85](https://github.com/djm204/frankenbeast/commit/816ef853cb0a74ef3d700dc365c2ad4fd198dba4))
* **network:** add config-driven service registry ([40e2c1f](https://github.com/djm204/frankenbeast/commit/40e2c1fb71ec13cf311f3a38963dde9100cc5793))
* **network:** add dashboard network control api ([4ab4dad](https://github.com/djm204/frankenbeast/commit/4ab4dadc774248560acad35128f0979fe3340987))
* **network:** add secure and insecure secret modes ([0ac7175](https://github.com/djm204/frankenbeast/commit/0ac7175d05f9bf82e8ef4b35296e08ffb86091a9))
* **network:** add supervisor runtime and state ([5605829](https://github.com/djm204/frankenbeast/commit/56058295b9d94805d3b4edae08c41b26c260a971))
* **network:** implement operator command family ([c142ec9](https://github.com/djm204/frankenbeast/commit/c142ec905cb256b1f6c4c48dbcecfc68b7e9bf5f))
* **network:** support managed service config overrides ([57974f1](https://github.com/djm204/frankenbeast/commit/57974f16a8a6cdc909f74cb1c1be47a6c7ae14ae))


### Bug Fixes

* **comms:** resolve build errors and unify websocket types ([2669d44](https://github.com/djm204/frankenbeast/commit/2669d4487bdfab9ef3ba522ce5a2dfa4b929cc7f))
* **comms:** resolve build errors and unify websocket types ([bfd0fb8](https://github.com/djm204/frankenbeast/commit/bfd0fb8cbb4656a719d9024a96bb5ca60734c40d))

## [0.10.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.9.0...franken-orchestrator-v0.10.0) (2026-03-10)


### Features

* **chat:** add runnable dashboard chat server entrypoint ([d37004b](https://github.com/djm204/frankenbeast/commit/d37004b8be19257636f8e6b1f6c297f829861d33))
* **chat:** add runnable http and websocket chat server ([6fd66f6](https://github.com/djm204/frankenbeast/commit/6fd66f61e2d47f0012b229f07861b73e402e60f3))
* **cli:** add chat-server command surface ([6b456b4](https://github.com/djm204/frankenbeast/commit/6b456b46523c7bb7add0d96e1b1f13a8d10af354))
* **cli:** run websocket chat server from frankenbeast ([7ea6b3c](https://github.com/djm204/frankenbeast/commit/7ea6b3ce1b793cf8f4fee46d99d765c6ff9a38b0))

## [0.9.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.8.0...franken-orchestrator-v0.9.0) (2026-03-09)


### Features

* add websocket-backed Frankenbeast dashboard chat ([f0e089d](https://github.com/djm204/frankenbeast/commit/f0e089dea6f35685f016b0a373c6e3440ccc1e45))

## [0.8.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.7.0...franken-orchestrator-v0.8.0) (2026-03-09)


### Features

* Add canonical chunk-session execution state ([5d36b0c](https://github.com/djm204/frankenbeast/commit/5d36b0c6ba6edb385812d7d5c0bb98ea77216fff))
* **orchestrator:** garbage collect and clean chunk sessions ([78d7347](https://github.com/djm204/frankenbeast/commit/78d73473391c6eec5b114d9d9f562b46a230b8a2))
* **orchestrator:** make MartinLoop chunk-session aware ([936ca0b](https://github.com/djm204/frankenbeast/commit/936ca0b7f5907acfbe9badbb20665f3f8b06cb81))
* **orchestrator:** wire chunk session execution and recovery ([32c5cfb](https://github.com/djm204/frankenbeast/commit/32c5cfb7d47bdf2ad89efc35c17ceaf03f767d3e))

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
