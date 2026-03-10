# Changelog

## [0.12.0](https://github.com/djm204/frankenbeast/compare/v0.11.0...v0.12.0) (2026-03-10)


### Features

* **chat:** add runnable dashboard chat server entrypoint ([d37004b](https://github.com/djm204/frankenbeast/commit/d37004b8be19257636f8e6b1f6c297f829861d33))
* **comms:** add discord integration with secure ed25519 interactions ([670b98a](https://github.com/djm204/frankenbeast/commit/670b98af821ea2fc0562ade5169824dba1f08eb9))
* **comms:** add franken-comms package with core abstractions and slack adapter ([e1a9078](https://github.com/djm204/frankenbeast/commit/e1a9078162e51a482d38741799a4fb8a04267813))
* **comms:** add slack signature verification and events/interactivity routing ([8ff7133](https://github.com/djm204/frankenbeast/commit/8ff7133afb920d283e39f6c014f25f517f01773f))
* **comms:** complete multi-channel integration (Slack, Discord, Telegram, WhatsApp) ([8c421a3](https://github.com/djm204/frankenbeast/commit/8c421a35eb48bf6a5f19ea95d455aad3385b7051))
* **comms:** implement franken-comms core and slack adapter ([b4164ba](https://github.com/djm204/frankenbeast/commit/b4164ba7198abc6f5961f91aeb6e6c543c7ea04b))


### Bug Fixes

* **comms:** resolve linting issues and modernize eslint config ([5e361e9](https://github.com/djm204/frankenbeast/commit/5e361e9b561e16701d3c340e46273ca5d496aeee))
* **comms:** synchronize package-lock.json with new franken-comms package ([bd3be73](https://github.com/djm204/frankenbeast/commit/bd3be73ef8219afcf595c05688865aae7deacacf))


### Miscellaneous

* **dev:** add runnable local flow for dashboard chat ([08962f3](https://github.com/djm204/frankenbeast/commit/08962f3f180c9f5f40939a19529e8a1639e124ed))
* **main:** release franken-orchestrator 0.10.0 ([7d57b9b](https://github.com/djm204/frankenbeast/commit/7d57b9b921c14d0f683398cbe004b0b6b1184b0d))
* **main:** release franken-orchestrator 0.10.0 ([c860347](https://github.com/djm204/frankenbeast/commit/c860347ba56772e925c4dc4d551094eeb7fcd02d))


### Documentation

* **adr:** add ADR-016 for external comms gateway architecture ([cfbdef3](https://github.com/djm204/frankenbeast/commit/cfbdef3e17120825a96e1959ec4036b197605588))
* **adr:** record dashboard chat server entrypoint ([6108351](https://github.com/djm204/frankenbeast/commit/61083513e2e8940dee468b2c6e6cdf620b733715))
* **chat:** add dashboard chat run guide ([dde4c18](https://github.com/djm204/frankenbeast/commit/dde4c1845c04ed19872f46253d21e90cbeb45c5d))
* **plans:** move channel-integrations implementation plan to complete ([84962f0](https://github.com/djm204/frankenbeast/commit/84962f0296e6ba5aa4a603dbf2d3b86d1e38f32d))
* **plans:** update init workflow and add new design documents ([a26402b](https://github.com/djm204/frankenbeast/commit/a26402b65f609b6825fef14807609f02f067cd7b))
* **plan:** update init workflow for current project state ([48434a2](https://github.com/djm204/frankenbeast/commit/48434a2dc9c30b0861af45821422be4f4be1704e))

## [0.11.0](https://github.com/djm204/frankenbeast/compare/v0.10.0...v0.11.0) (2026-03-09)


### Features

* Add canonical chunk-session execution state ([5d36b0c](https://github.com/djm204/frankenbeast/commit/5d36b0c6ba6edb385812d7d5c0bb98ea77216fff))
* add websocket-backed Frankenbeast dashboard chat ([f0e089d](https://github.com/djm204/frankenbeast/commit/f0e089dea6f35685f016b0a373c6e3440ccc1e45))
* **web:** build dashboard chat shell with live socket UX ([95af810](https://github.com/djm204/frankenbeast/commit/95af810040ff0e7679117a1978091eea085ea0e5))


### Miscellaneous

* **main:** release franken-orchestrator 0.8.0 ([ebf5d22](https://github.com/djm204/frankenbeast/commit/ebf5d2270d8da2bedfab62ced7924577e74a05c1))
* **main:** release franken-orchestrator 0.8.0 ([c710711](https://github.com/djm204/frankenbeast/commit/c710711c73f9ce43820d4aba26518f47702c3b5e))
* **main:** release franken-orchestrator 0.9.0 ([1d329a9](https://github.com/djm204/frankenbeast/commit/1d329a93b747c583a33d30119dc70f001c7434f7))
* **main:** release franken-orchestrator 0.9.0 ([60d3c35](https://github.com/djm204/frankenbeast/commit/60d3c35026f473573b8cd402764363b9e8b28805))


### Documentation

* **orchestrator:** document chunk session execution model ([bf4347c](https://github.com/djm204/frankenbeast/commit/bf4347ca1e1d7544d522313767966d1b40c7d746))

## [0.10.0](https://github.com/djm204/frankenbeast/compare/v0.9.0...v0.10.0) (2026-03-09)


### Features

* **chat:** session continuation, input blocking, spinner, output sanitization, color diff ([e4eb862](https://github.com/djm204/frankenbeast/commit/e4eb86252fc641a17eded66040059c57f4e82702))
* **franken-orchestrator:** add conversational chat interface with CLI, HTTP, SSE, and web UI ([13c01f4](https://github.com/djm204/frankenbeast/commit/13c01f410ab81f5fc8223543d567e454701365fb))


### Miscellaneous

* **franken-orchestrator:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([1d85288](https://github.com/djm204/frankenbeast/commit/1d8528826af44828725dc12015e57a15c23467ab))
* **franken-orchestrator:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([a4ad1f5](https://github.com/djm204/frankenbeast/commit/a4ad1f57f53ab7cb36769a65972ce35681bc81ec))
* **franken-web:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([8c9b0aa](https://github.com/djm204/frankenbeast/commit/8c9b0aaea9708f530b5cfaefca7cb71e3a857c9e))
* **franken-web:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([f680458](https://github.com/djm204/frankenbeast/commit/f680458d11940f2a60aeffc8570fe96b785ca69b))
* **main:** release franken-orchestrator 0.7.0 ([a2c3d28](https://github.com/djm204/frankenbeast/commit/a2c3d28325ab7df69322812f7e3d0de9610541a4))
* **main:** release franken-orchestrator 0.7.0 ([c5faafa](https://github.com/djm204/frankenbeast/commit/c5faafa5a30431c21d63d601a761fa32141697c1))


### Documentation

* add chat agent dispatch design doc ([6958b2b](https://github.com/djm204/frankenbeast/commit/6958b2b27235eb4eb1fe68ed65908237ff2e05f2))
* add chat agent dispatch implementation plan ([784a44c](https://github.com/djm204/frankenbeast/commit/784a44c06605c05ae087dcc4b017db3911814ca8))
* **adr:** ADR-014 chat two-tier dispatch architecture ([bcec6a0](https://github.com/djm204/frankenbeast/commit/bcec6a0ef1c05b15df19fee73297c5900d9ece02))
* **adr:** ADR-015 shared spinner abstraction ([e347467](https://github.com/djm204/frankenbeast/commit/e3474674ba8ac5a1db2bd46d86dc92a90ebbc37c))
* update RAMP_UP.md with chat agent dispatch and new ADRs ([e94f69f](https://github.com/djm204/frankenbeast/commit/e94f69f5c9bdde0d18f74daddf7a27e2c18fa89f))

## [0.9.0](https://github.com/djm204/frankenbeast/compare/v0.8.0...v0.9.0) (2026-03-09)


### Features

* **planner:** multi-pass codebase-aware planning pipeline ([0877494](https://github.com/djm204/frankenbeast/commit/0877494c72b1dd2c78e217b1dc78af478a927a24))


### Miscellaneous

* **main:** release franken-orchestrator 0.6.0 ([04f3e83](https://github.com/djm204/frankenbeast/commit/04f3e831f773607f3e0913257bd389fde8d5a3a2))
* **main:** release franken-orchestrator 0.6.0 ([f26d8d5](https://github.com/djm204/frankenbeast/commit/f26d8d5f85a3f554a717c226b6995a46a268f0e2))

## [0.8.0](https://github.com/djm204/frankenbeast/compare/v0.7.2...v0.8.0) (2026-03-09)


### Features

* **franken-orchestrator:** add spinner to LLM progress, extract cleanLlmJson utility, use lastChunks for plan output ([dccc569](https://github.com/djm204/frankenbeast/commit/dccc56923cda689fc06bdbbd3285400e0342f574))


### Miscellaneous

* **main:** release franken-brain 0.3.1 ([effa089](https://github.com/djm204/frankenbeast/commit/effa08962666df7e8a4a38e03e4f496bac29dd88))
* **main:** release franken-brain 0.3.1 ([7ac1899](https://github.com/djm204/frankenbeast/commit/7ac18999020a6acef9a3833170fa3a5844ea4aa8))
* **main:** release franken-critique 0.3.1 ([0070ce4](https://github.com/djm204/frankenbeast/commit/0070ce4a4145c8ddefb9cfc75ccd3b98ae1492cc))
* **main:** release franken-critique 0.3.1 ([06ebfce](https://github.com/djm204/frankenbeast/commit/06ebfce410f5c7088e2566d56303216102a54e30))
* **main:** release franken-governor 0.3.1 ([1f2ee34](https://github.com/djm204/frankenbeast/commit/1f2ee3438c72308c000658d04c0f70e491f7812d))
* **main:** release franken-governor 0.3.1 ([1c4dc1d](https://github.com/djm204/frankenbeast/commit/1c4dc1d405fc9122c5b04e36965e380d1a511471))
* **main:** release franken-heartbeat 0.3.1 ([705a3ed](https://github.com/djm204/frankenbeast/commit/705a3ed944fd2f05a60bd1db6709a02f65f3d8ce))
* **main:** release franken-heartbeat 0.3.1 ([aca8e23](https://github.com/djm204/frankenbeast/commit/aca8e23ef80a312b738f3b4fbe9cb613e76ccb14))
* **main:** release franken-mcp 0.3.1 ([b1883ff](https://github.com/djm204/frankenbeast/commit/b1883ffb516129bc1717e4416e5c9ff07914e8b7))
* **main:** release franken-mcp 0.3.1 ([b5d29a8](https://github.com/djm204/frankenbeast/commit/b5d29a805d83c587674b68e01ee7310bc9d384a8))
* **main:** release franken-observer 0.3.1 ([6185508](https://github.com/djm204/frankenbeast/commit/61855086227deea864955d3f524a40e0caf0d6b2))
* **main:** release franken-observer 0.3.1 ([0149ef1](https://github.com/djm204/frankenbeast/commit/0149ef1a92cffbe26c9f53aea0f01597a8363ab0))
* **main:** release franken-orchestrator 0.5.0 ([#111](https://github.com/djm204/frankenbeast/issues/111)) ([c0ecd21](https://github.com/djm204/frankenbeast/commit/c0ecd215267c534ae48dca5c984fff974acaaa62))
* **main:** release franken-planner 0.3.1 ([b9af413](https://github.com/djm204/frankenbeast/commit/b9af41366d4113a58571df48f7b6a1ac8dfa6293))
* **main:** release franken-planner 0.3.1 ([4d53eda](https://github.com/djm204/frankenbeast/commit/4d53edac55621b491cab8860efc990a88f19ab53))
* **main:** release franken-skills 0.3.1 ([e8079d9](https://github.com/djm204/frankenbeast/commit/e8079d91d29a9f2bf4d3f793eeabaff509600824))
* **main:** release franken-skills 0.3.1 ([98fb1ef](https://github.com/djm204/frankenbeast/commit/98fb1ef3984217f6d562fd1825154f18b4020435))
* **main:** release franken-types 0.3.1 ([d79e88c](https://github.com/djm204/frankenbeast/commit/d79e88c91781f7a1f45971363ca6c5890033c4bf))
* **main:** release franken-types 0.3.1 ([bfeee54](https://github.com/djm204/frankenbeast/commit/bfeee54916f3cbb849e49532f473d25949385eba))
* **main:** release frankenfirewall 0.3.1 ([925d307](https://github.com/djm204/frankenbeast/commit/925d3074dffdec32f7bbf221f52fef8cbd4e8f39))
* **main:** release frankenfirewall 0.3.1 ([b2b5b79](https://github.com/djm204/frankenbeast/commit/b2b5b79796dacc49f8984a398bc9bd575cbfa225))
* resolve manifest conflict ([6da6efa](https://github.com/djm204/frankenbeast/commit/6da6efac2ceb2fac9b1ff57a338d40c0b7d16041))
* resolve manifest conflict ([c777b97](https://github.com/djm204/frankenbeast/commit/c777b9714bf46f78c9b9d0467e1a78e085217665))
* resolve manifest conflict ([ec9e9be](https://github.com/djm204/frankenbeast/commit/ec9e9be4a6ae0d43c27b6a7df1ab2ca0db60093b))
* resolve manifest conflict ([55623d9](https://github.com/djm204/frankenbeast/commit/55623d923502b1cedef3503dc9a19b151b33671c))
* resolve manifest conflict ([d66f706](https://github.com/djm204/frankenbeast/commit/d66f706c88d9bd9f175d28e40f2428285eaa9ade))
* resolve manifest conflict ([6e41dbb](https://github.com/djm204/frankenbeast/commit/6e41dbb5fa8067a96054d201b86cf1928fab2a11))
* resolve manifest conflict after franken-types merge ([9df4952](https://github.com/djm204/frankenbeast/commit/9df49529ba12edce9fbf081cfb21729bb9a2617d))

## [0.7.2](https://github.com/djm204/frankenbeast/compare/v0.7.1...v0.7.2) (2026-03-09)


### Miscellaneous

* **main:** release franken-orchestrator 0.4.0 ([dc59ca3](https://github.com/djm204/frankenbeast/commit/dc59ca3bf2483386a596eea8aa1660553d887420))
* **main:** release franken-orchestrator 0.4.0 ([1e0d119](https://github.com/djm204/frankenbeast/commit/1e0d119f3b7f9daacb5fbb3101e7c7e3cd9532cc))
* **main:** release franken-orchestrator 0.4.1 ([#109](https://github.com/djm204/frankenbeast/issues/109)) ([012a01a](https://github.com/djm204/frankenbeast/commit/012a01aba1d7bb908ff83d92fc54c68c5fc6377f))

## [0.7.1](https://github.com/djm204/frankenbeast/compare/v0.7.0...v0.7.1) (2026-03-09)


### Bug Fixes

* ensure sub-package releases never become GitHub latest ([da2590d](https://github.com/djm204/frankenbeast/commit/da2590d13ba2f80e09259731f07e0fb84427de4a))

## [0.7.0](https://github.com/djm204/frankenbeast/compare/v0.6.0...v0.7.0) (2026-03-09)


### Features

* add Approach C implementation chunks + build-runner ([b620d5e](https://github.com/djm204/frankenbeast/commit/b620d5ed70cf2de5d0afbf182896651b09f1e51b))
* add beast runner implementation plan + RALPH loop chunks ([4720f32](https://github.com/djm204/frankenbeast/commit/4720f32770819aa85f456e0e5ee116fc867525bd))
* add franken-mcp module with design and implementation plan ([1acf1b9](https://github.com/djm204/frankenbeast/commit/1acf1b94dccf50f181570f52d0bc362ea52e8542))
* add LLM integration examples across 3 tiers ([699a9b7](https://github.com/djm204/frankenbeast/commit/699a9b7af978fb3e253c4dcaf412ca0d9add9d5c))
* add RALPH-loop execution plan for executeTask workflow ([45793de](https://github.com/djm204/frankenbeast/commit/45793de6889e5c74d79eea4f78dcc341a5a8c671))
* eslint configs, gitignore hygiene, CLI guard fix ([#99](https://github.com/djm204/frankenbeast/issues/99)) ([87d7427](https://github.com/djm204/frankenbeast/commit/87d74276a909b272141119ce151647118725ce2e))
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
* GitHub issues as autonomous work source ([#90](https://github.com/djm204/frankenbeast/issues/90)) ([152970f](https://github.com/djm204/frankenbeast/commit/152970f3e192c80673c77d0a29816ca0728de1a5))
* global CLI with interactive pipeline, session orchestrator, and HITM review loops ([dc4a529](https://github.com/djm204/frankenbeast/commit/dc4a5292ef647335c4d950af93caefae687716c2))
* make build-runner.ts reusable with --plan-dir and --base-branch ([069272e](https://github.com/djm204/frankenbeast/commit/069272e02e61f965fe1e1fb431bf5c15f70024c0))
* migrate to real monorepo with npm workspaces + Turborepo ([#96](https://github.com/djm204/frankenbeast/issues/96)) ([f2028b1](https://github.com/djm204/frankenbeast/commit/f2028b139003a6bc09df35d8904a53c0457d67cb))
* **orchestrator:** add LLM-powered squash commits and PR descriptions ([#9](https://github.com/djm204/frankenbeast/issues/9)) ([f792a5c](https://github.com/djm204/frankenbeast/commit/f792a5c0fc552cbd82a19e2c143b8358c5609b04))
* **PR-19:** contract audit, compatibility matrix, and integration tests ([ef24cb6](https://github.com/djm204/frankenbeast/commit/ef24cb61f000cc9a7a3ba3831822ce690480c720))
* **PR-33:** OpenClaw integration example ([51f1e0c](https://github.com/djm204/frankenbeast/commit/51f1e0c0ce75c7c5d8f48026b258757b272ab067))
* **PR-41:** local dev environment ([4d505be](https://github.com/djm204/frankenbeast/commit/4d505be2d6a680cb3dcbaf6862921b75a2b56ca4))
* **PR-42:** documentation — guides, ADRs, progress tracker ([6ee4f9a](https://github.com/djm204/frankenbeast/commit/6ee4f9ae441c7bf349b2ca9ae1776d44f07635de))
* rate-limit resilience with provider fallback ([618a79f](https://github.com/djm204/frankenbeast/commit/618a79fb42b9a88a7e019ae4452dbbafe7b371da))


### Bug Fixes

* gitignore all .build/ dirs + force-checkout on conflicts ([bd73c07](https://github.com/djm204/frankenbeast/commit/bd73c071b41c92f99d3bc74207dbf36576f39d59))
* **plan-beast-runner:** accept base branch as CLI arg instead of hardcoding ([ba2b548](https://github.com/djm204/frankenbeast/commit/ba2b548c7b104299c956531d13ccaca643a386b0))
* release-please scoping and commit hygiene ([742c7cc](https://github.com/djm204/frankenbeast/commit/742c7cc7792aac3f6f85ee638ba3b165de34bc5f))
* rewrite cli-gaps build-runner + sync orchestrator gitlink ([aaf8fcb](https://github.com/djm204/frankenbeast/commit/aaf8fcbe5faf43ebba514235b77e74f3c7bead38))
* scope release-please to only bump packages with actual changes ([59cddcd](https://github.com/djm204/frankenbeast/commit/59cddcd697fee65bae68b6d25c9c7f9df834768d))
* update orchestrator gitlink — plugin poisoning + false success bugs ([da29da5](https://github.com/djm204/frankenbeast/commit/da29da5c11aa300c332e2401a200dab6b351893b))
* update orchestrator gitlink — safe checkout conflict resolution ([a335deb](https://github.com/djm204/frankenbeast/commit/a335deba149176cee9ff289c6cf10ce23d7131ea))
* update orchestrator gitlink — thinking output + build.log tee ([d15630b](https://github.com/djm204/frankenbeast/commit/d15630b6dda79e2ed71867bb60584725aebe1f88))
* update orchestrator gitlink + restore BeastLoop runner for cli-gaps ([c9e3327](https://github.com/djm204/frankenbeast/commit/c9e3327c6d1497db804fefb9458fb128ff2df625))
* use integration branch so PR is not empty ([7181a43](https://github.com/djm204/frankenbeast/commit/7181a43aa83b7f7df2dbd1d3a813e5bdf063d946))


### Miscellaneous

* add .worktrees to .gitignore ([5ec322e](https://github.com/djm204/frankenbeast/commit/5ec322edc551466428dd067c56e0a0e342b9a43b))
* add project logo assets ([b654cb9](https://github.com/djm204/frankenbeast/commit/b654cb9e3b430a4ea03d8b6f4e110740db563d7a))
* add shared tsconfig for examples directory ([122d9f0](https://github.com/djm204/frankenbeast/commit/122d9f041cbda188fc4740026089e4bb558c7606))
* **assets:** weird New Folder removed and images restored to proper folder ([488209d](https://github.com/djm204/frankenbeast/commit/488209ddea4739a19d2de07c80b13d8b660c8548))
* delete the old plans ([eb191d5](https://github.com/djm204/frankenbeast/commit/eb191d5c0f08f559bdb43803c10eb072b1966de8))
* **img:** img folder was renamed for New Folder, mystery solved, restored. ([bd7f424](https://github.com/djm204/frankenbeast/commit/bd7f4241b43fadcdbcecb69b8f5f0a110c1f1c70))
* **main:** release frankenbeast 0.2.0 ([#8](https://github.com/djm204/frankenbeast/issues/8)) ([74383e3](https://github.com/djm204/frankenbeast/commit/74383e377cb9615ea1f3494837ab4893e6f0b0b2))
* **main:** release frankenbeast 0.3.0 ([#10](https://github.com/djm204/frankenbeast/issues/10)) ([e2f5be0](https://github.com/djm204/frankenbeast/commit/e2f5be03cc40cf0b2af043532175a3f09c95b857))
* **main:** release frankenbeast 0.3.1 ([#15](https://github.com/djm204/frankenbeast/issues/15)) ([6812b65](https://github.com/djm204/frankenbeast/commit/6812b65450a7fc1a24880749302018f806fc2855))
* **main:** release frankenbeast 0.4.0 ([#91](https://github.com/djm204/frankenbeast/issues/91)) ([db0bdba](https://github.com/djm204/frankenbeast/commit/db0bdba6ef74ef3706ac215b001b0b58bd0b3096))
* **main:** release frankenbeast 0.4.1 ([#93](https://github.com/djm204/frankenbeast/issues/93)) ([40d5814](https://github.com/djm204/frankenbeast/commit/40d581460c17b14968b7054c52d2b060b40514f4))
* move completed plan docs to docs/plans/complete/ ([45a8cac](https://github.com/djm204/frankenbeast/commit/45a8cac11580acce9447902c8e83358cabd01f25))
* move finished plans to complete folder ([f5df763](https://github.com/djm204/frankenbeast/commit/f5df7634aeae10d6b715241f5f091e1e68a72e42))
* release main ([979b103](https://github.com/djm204/frankenbeast/commit/979b103b6644a4b5f92dda8a0408aece11c627c4))
* release main ([66b746c](https://github.com/djm204/frankenbeast/commit/66b746cc350cc535edab515bea5564f580c5f7e7))
* release main ([#97](https://github.com/djm204/frankenbeast/issues/97)) ([3e6925f](https://github.com/djm204/frankenbeast/commit/3e6925f7e274e8b5271c65d1f1533b1c5cef21b5))
* **submodule:** update franken-critique — fix TS7030 middleware returns ([987cee1](https://github.com/djm204/frankenbeast/commit/987cee13cf42d87290dce6bb9df01c7a49f6660c))
* **submodule:** update orchestrator — --cleanup flag and branding ([a29f946](https://github.com/djm204/frankenbeast/commit/a29f946d8c817a00d94d880e22f1b83a7351e9a6))
* **submodule:** update orchestrator — PR creator head==base guard ([1bd2dd2](https://github.com/djm204/frankenbeast/commit/1bd2dd2328c4f70c96d024cf6277fb5e9353c6dc))
* **submodule:** update orchestrator — RalphLoop→MartinLoop rename ([2c1fc35](https://github.com/djm204/frankenbeast/commit/2c1fc35b7c25abfb515a19e48c2d2c3760f2640f))
* **submodule:** update orchestrator — strip hook output from CLI responses ([3dd5e3d](https://github.com/djm204/frankenbeast/commit/3dd5e3db9dcb336716665334623bd3d22cbaac7a))
* **submodule:** update orchestrator — tool-use stream summarization ([6999e80](https://github.com/djm204/frankenbeast/commit/6999e80594574b16ce2c17158c29cbe93a5be6f6))
* update franken-orchestrator gitlink — fix [#92](https://github.com/djm204/frankenbeast/issues/92) stream-JSON commits ([58c3cbe](https://github.com/djm204/frankenbeast/commit/58c3cbeba33b3b68fa7e0c9694f1728ffc876c2c))
* update franken-orchestrator gitlink (01_checkpoint_store) ([24c29e4](https://github.com/djm204/frankenbeast/commit/24c29e4c0ffb933e7e9aeec99a5c5884d8cc7f3b))
* update franken-orchestrator gitlink (01_types_and_config) ([cbc8415](https://github.com/djm204/frankenbeast/commit/cbc84156c33c702d7be39b65a94bbfe6ed401027))
* update franken-orchestrator gitlink (02_chunk_file_graph_builder) ([47d5caa](https://github.com/djm204/frankenbeast/commit/47d5caa13299350916a0e3898fb873a3efe7eb1f))
* update franken-orchestrator gitlink (02_ralph_loop) ([c16165a](https://github.com/djm204/frankenbeast/commit/c16165a295dda00b140d3b72e916b0c86050e57e))
* update franken-orchestrator gitlink (03_git_branch_isolator) ([5ea3a79](https://github.com/djm204/frankenbeast/commit/5ea3a793db6535cd792158ea1b9aa633e999dec7))
* update franken-orchestrator gitlink (04_cli_skill_executor) ([fc8b85d](https://github.com/djm204/frankenbeast/commit/fc8b85deb13c59a6f2ca8d48f0a323881a786157))
* update franken-orchestrator gitlink (05_execution_wiring) ([3a97663](https://github.com/djm204/frankenbeast/commit/3a9766396234a9570b27bee161800c0654315ff0))
* update franken-orchestrator gitlink (06_beast_loop_wiring) ([63f92fc](https://github.com/djm204/frankenbeast/commit/63f92fcb8896c824f0b8f1ab90f3dc32015765bb))
* update franken-orchestrator gitlink (07_e2e_integration) ([2ce4a54](https://github.com/djm204/frankenbeast/commit/2ce4a54deabe815c9d82932579e06dade9678a93))
* update franken-planner gitlink — fix vitest watch mode ([99640b8](https://github.com/djm204/frankenbeast/commit/99640b8a0f2d09ac3f2cfb12cea144e79020203a))
* update frankenfirewall gitlink — fix TS strictness errors ([708c787](https://github.com/djm204/frankenbeast/commit/708c787838c420a255b672b6e545450d4c1ef0cf))
* update gitlinks after release-please setup ([6aa172b](https://github.com/djm204/frankenbeast/commit/6aa172b1d846c36812e1fc0c9f156f21d384410d))
* update orchestrator gitlink — baseBranch creation fix ([435e0dc](https://github.com/djm204/frankenbeast/commit/435e0dc6421e4ede631b0180c98f34223ab214a2))
* update orchestrator gitlink — CliLlmAdapter implementation ([bf03635](https://github.com/djm204/frankenbeast/commit/bf036354f1015bb0464ffb9455183c07c7a47b6b))
* update orchestrator gitlink — CliLlmAdapter wiring (chunk 03) ([8aa7469](https://github.com/djm204/frankenbeast/commit/8aa74696f1ac6d862f7911f3687cf2dc58679c4e))
* update orchestrator gitlink — observer bridge tests (chunk 05) ([cf9ee61](https://github.com/djm204/frankenbeast/commit/cf9ee61ab181a764abbd9052edb3ec2f5f785b91))
* update orchestrator gitlink — observer bridge wiring ([1b14e37](https://github.com/djm204/frankenbeast/commit/1b14e37659112f457b407fdf51e44194d57f2b06))
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
* add interview loop UX improvements design ([a923536](https://github.com/djm204/frankenbeast/commit/a923536e8e865ad8ad41e0def9c14b1006f1eaa7))
* add interview UX implementation plan (8 tasks) ([98096a1](https://github.com/djm204/frankenbeast/commit/98096a1114b1990229f97ef2df2fd1d501b9df7f))
* add LLM integration examples design document ([a55a6f5](https://github.com/djm204/frankenbeast/commit/a55a6f5d2881ef2c0ac4ea5311dd8beb48255e4d))
* add LLM integration examples implementation plan ([05f0a8a](https://github.com/djm204/frankenbeast/commit/05f0a8a6995dd84829ec95bb89f663d956f7e2ed))
* add monorepo migration ADR, design doc, and implementation plan ([47b96b0](https://github.com/djm204/frankenbeast/commit/47b96b0bc42b24eea5d3e8f16c6d3e09979e7a63))
* add plain-language project overview ([d7dbbe0](https://github.com/djm204/frankenbeast/commit/d7dbbe0032e0c5454a74ea1917e20db7cd4b2d9b))
* add RAMP_UP.md for agent onboarding ([1daf158](https://github.com/djm204/frankenbeast/commit/1daf15833662936c2cb68a83e3b262616880418e))
* add security audit, CLI gap analysis, and security-expert cursor rules ([fb1d74a](https://github.com/djm204/frankenbeast/commit/fb1d74aef95e81e75eccf968393eff13fd7043fb))
* add status description for franken-skills in implementation plan ([8a599c0](https://github.com/djm204/frankenbeast/commit/8a599c079da92effedb46f4eb351d59205db5e77))
* close CLI gaps, add design docs, update architecture ([#12](https://github.com/djm204/frankenbeast/issues/12)) ([3159d22](https://github.com/djm204/frankenbeast/commit/3159d228e0865b932cd4297b9c9e97bcc83f7046))
* **examples:** add root README with example index and run instructions ([851e101](https://github.com/djm204/frankenbeast/commit/851e1016a4829838f0270089800cc97c3e8a5dea))
* fix stale documentation — test counts, ADR count, PR target branch ([0055602](https://github.com/djm204/frankenbeast/commit/0055602cf564e090f9175aa3f5b172569f7d9141))
* move ARCHITECTURE.md to docs/, update with orchestrator and ports ([c35d08a](https://github.com/djm204/frankenbeast/commit/c35d08a307bb9d5f6571be64e59a01be7f988855))
* **plans:** add docs truth cleanup implementation plan ([b44bbe2](https://github.com/djm204/frankenbeast/commit/b44bbe25bee562702ab40e6ac6f083ef6c551c49))
* rewrite RALPH-loop plan with observer integration and chunk splits ([050a6bc](https://github.com/djm204/frankenbeast/commit/050a6bca59a7a6242cc439d7b55fb69ad08d2840))
* sync main docs with current CLI state ([2049901](https://github.com/djm204/frankenbeast/commit/2049901bdc8f82a8231f21545ae0318560277a0b))
* update ARCHITECTURE.md with franken-mcp and examples ([2e23942](https://github.com/djm204/frankenbeast/commit/2e23942e5a6508dfa292cdf86616d16c64e5b537))
* update gitlinks for RAMP_UP.md across all submodules ([0af79d1](https://github.com/djm204/frankenbeast/commit/0af79d1e5907e31aedeadd60d5737e5439531550))
* update implementation plan to reflect completed state ([c0fcfc5](https://github.com/djm204/frankenbeast/commit/c0fcfc54090acc2a43913d64ff00a6f928f24181))
* update RalphLoop→MartinLoop references in root docs ([515ae01](https://github.com/djm204/frankenbeast/commit/515ae015d7cb1a73b14a359acc949b5536165616))
* update README with current project state ([91d4b67](https://github.com/djm204/frankenbeast/commit/91d4b673d9a608fac5fb9d7b1b87b2fce6be1202))


### CI/CD

* add release-please config and workflow ([d258bfd](https://github.com/djm204/frankenbeast/commit/d258bfd505751c3e456bcb173e1270707a79450e))


### Tests

* **docs:** tighten docs contract coverage ([9ae3070](https://github.com/djm204/frankenbeast/commit/9ae3070b84c0972509d46a8f02acc8580eac38d3))


### Refactoring

* move build-runner.ts into plan-beast-runner/ ([e0a94bb](https://github.com/djm204/frankenbeast/commit/e0a94bb78bba0e13ba283590cf20f0be3a0a21e3))

## [0.6.0](https://github.com/djm204/frankenbeast/compare/frankenbeast-v0.5.0...frankenbeast-v0.6.0) (2026-03-09)


### Features

* eslint configs, gitignore hygiene, CLI guard fix ([#99](https://github.com/djm204/frankenbeast/issues/99)) ([87d7427](https://github.com/djm204/frankenbeast/commit/87d74276a909b272141119ce151647118725ce2e))


### Miscellaneous

* remove stale per-package release-please workflows ([#101](https://github.com/djm204/frankenbeast/issues/101)) ([f7516df](https://github.com/djm204/frankenbeast/commit/f7516df5f68584c1cc56aa1faae5994f9a5eae1b))

## [0.5.0](https://github.com/djm204/frankenbeast/compare/frankenbeast-v0.4.1...frankenbeast-v0.5.0) (2026-03-09)


### Features

* migrate to real monorepo with npm workspaces + Turborepo ([#96](https://github.com/djm204/frankenbeast/issues/96)) ([f2028b1](https://github.com/djm204/frankenbeast/commit/f2028b139003a6bc09df35d8904a53c0457d67cb))
* **orchestrator:** add chunk prompt guardrails to prevent destructive agent actions ([9cdb5b0](https://github.com/djm204/frankenbeast/commit/9cdb5b0f93a8f0db756bd2386c6850ef363efa12))
* **orchestrator:** plan-scoped dirs, hook stripping, LLM response caching ([#98](https://github.com/djm204/frankenbeast/issues/98)) ([d97f37c](https://github.com/djm204/frankenbeast/commit/d97f37c05e02c01acb2fda75f2a121f507db62e5))


### Miscellaneous

* delete the old plans ([eb191d5](https://github.com/djm204/frankenbeast/commit/eb191d5c0f08f559bdb43803c10eb072b1966de8))
* move finished plans to complete folder ([f5df763](https://github.com/djm204/frankenbeast/commit/f5df7634aeae10d6b715241f5f091e1e68a72e42))
* remove unecessary rules now that it is a monorepo ([5113b8d](https://github.com/djm204/frankenbeast/commit/5113b8d67a5e1daec8b8d50c26c7563d70c54623))
* update orchestrator gitlink — baseBranch creation fix ([435e0dc](https://github.com/djm204/frankenbeast/commit/435e0dc6421e4ede631b0180c98f34223ab214a2))

## [0.4.1](https://github.com/djm204/frankenbeast/compare/frankenbeast-v0.4.0...frankenbeast-v0.4.1) (2026-03-08)


### Miscellaneous

* move completed plan docs to docs/plans/complete/ ([45a8cac](https://github.com/djm204/frankenbeast/commit/45a8cac11580acce9447902c8e83358cabd01f25))
* update franken-orchestrator gitlink — fix [#92](https://github.com/djm204/frankenbeast/issues/92) stream-JSON commits ([58c3cbe](https://github.com/djm204/frankenbeast/commit/58c3cbeba33b3b68fa7e0c9694f1728ffc876c2c))
* update franken-planner gitlink — fix vitest watch mode ([99640b8](https://github.com/djm204/frankenbeast/commit/99640b8a0f2d09ac3f2cfb12cea144e79020203a))
* update frankenfirewall gitlink — fix TS strictness errors ([708c787](https://github.com/djm204/frankenbeast/commit/708c787838c420a255b672b6e545450d4c1ef0cf))


### Documentation

* add monorepo migration ADR, design doc, and implementation plan ([47b96b0](https://github.com/djm204/frankenbeast/commit/47b96b0bc42b24eea5d3e8f16c6d3e09979e7a63))
* fix stale documentation — test counts, ADR count, PR target branch ([0055602](https://github.com/djm204/frankenbeast/commit/0055602cf564e090f9175aa3f5b172569f7d9141))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/frankenbeast-v0.3.1...frankenbeast-v0.4.0) (2026-03-08)


### Features

* GitHub issues as autonomous work source ([#90](https://github.com/djm204/frankenbeast/issues/90)) ([152970f](https://github.com/djm204/frankenbeast/commit/152970f3e192c80673c77d0a29816ca0728de1a5))

## [0.3.1](https://github.com/djm204/frankenbeast/compare/frankenbeast-v0.3.0...frankenbeast-v0.3.1) (2026-03-08)


### Miscellaneous

* **submodule:** update franken-critique — fix TS7030 middleware returns ([987cee1](https://github.com/djm204/frankenbeast/commit/987cee13cf42d87290dce6bb9df01c7a49f6660c))
* **submodule:** update orchestrator — --cleanup flag and branding ([a29f946](https://github.com/djm204/frankenbeast/commit/a29f946d8c817a00d94d880e22f1b83a7351e9a6))
* **submodule:** update orchestrator — PR creator head==base guard ([1bd2dd2](https://github.com/djm204/frankenbeast/commit/1bd2dd2328c4f70c96d024cf6277fb5e9353c6dc))
* **submodule:** update orchestrator — strip hook output from CLI responses ([3dd5e3d](https://github.com/djm204/frankenbeast/commit/3dd5e3db9dcb336716665334623bd3d22cbaac7a))
* **submodule:** update orchestrator — tool-use stream summarization ([6999e80](https://github.com/djm204/frankenbeast/commit/6999e80594574b16ce2c17158c29cbe93a5be6f6))


### Documentation

* add interview loop UX improvements design ([a923536](https://github.com/djm204/frankenbeast/commit/a923536e8e865ad8ad41e0def9c14b1006f1eaa7))
* add interview UX implementation plan (8 tasks) ([98096a1](https://github.com/djm204/frankenbeast/commit/98096a1114b1990229f97ef2df2fd1d501b9df7f))

## [0.3.0](https://github.com/djm204/frankenbeast/compare/frankenbeast-v0.2.0...frankenbeast-v0.3.0) (2026-03-08)


### Features

* **orchestrator:** add LLM-powered squash commits and PR descriptions ([#9](https://github.com/djm204/frankenbeast/issues/9)) ([f792a5c](https://github.com/djm204/frankenbeast/commit/f792a5c0fc552cbd82a19e2c143b8358c5609b04))


### Bug Fixes

* gitignore all .build/ dirs + force-checkout on conflicts ([bd73c07](https://github.com/djm204/frankenbeast/commit/bd73c071b41c92f99d3bc74207dbf36576f39d59))
* rewrite cli-gaps build-runner + sync orchestrator gitlink ([aaf8fcb](https://github.com/djm204/frankenbeast/commit/aaf8fcbe5faf43ebba514235b77e74f3c7bead38))
* update orchestrator gitlink — plugin poisoning + false success bugs ([da29da5](https://github.com/djm204/frankenbeast/commit/da29da5c11aa300c332e2401a200dab6b351893b))
* update orchestrator gitlink — safe checkout conflict resolution ([a335deb](https://github.com/djm204/frankenbeast/commit/a335deba149176cee9ff289c6cf10ce23d7131ea))
* update orchestrator gitlink — thinking output + build.log tee ([d15630b](https://github.com/djm204/frankenbeast/commit/d15630b6dda79e2ed71867bb60584725aebe1f88))
* update orchestrator gitlink + restore BeastLoop runner for cli-gaps ([c9e3327](https://github.com/djm204/frankenbeast/commit/c9e3327c6d1497db804fefb9458fb128ff2df625))
* use integration branch so PR is not empty ([7181a43](https://github.com/djm204/frankenbeast/commit/7181a43aa83b7f7df2dbd1d3a813e5bdf063d946))


### Miscellaneous

* **submodule:** update orchestrator — RalphLoop→MartinLoop rename ([2c1fc35](https://github.com/djm204/frankenbeast/commit/2c1fc35b7c25abfb515a19e48c2d2c3760f2640f))
* update orchestrator gitlink — CliLlmAdapter implementation ([bf03635](https://github.com/djm204/frankenbeast/commit/bf036354f1015bb0464ffb9455183c07c7a47b6b))
* update orchestrator gitlink — CliLlmAdapter wiring (chunk 03) ([8aa7469](https://github.com/djm204/frankenbeast/commit/8aa74696f1ac6d862f7911f3687cf2dc58679c4e))
* update orchestrator gitlink — observer bridge tests (chunk 05) ([cf9ee61](https://github.com/djm204/frankenbeast/commit/cf9ee61ab181a764abbd9052edb3ec2f5f785b91))
* update orchestrator gitlink — observer bridge wiring ([1b14e37](https://github.com/djm204/frankenbeast/commit/1b14e37659112f457b407fdf51e44194d57f2b06))


### Documentation

* add security audit, CLI gap analysis, and security-expert cursor rules ([fb1d74a](https://github.com/djm204/frankenbeast/commit/fb1d74aef95e81e75eccf968393eff13fd7043fb))
* close CLI gaps, add design docs, update architecture ([#12](https://github.com/djm204/frankenbeast/issues/12)) ([3159d22](https://github.com/djm204/frankenbeast/commit/3159d228e0865b932cd4297b9c9e97bcc83f7046))
* **plans:** add docs truth cleanup implementation plan ([b44bbe2](https://github.com/djm204/frankenbeast/commit/b44bbe25bee562702ab40e6ac6f083ef6c551c49))
* sync main docs with current CLI state ([2049901](https://github.com/djm204/frankenbeast/commit/2049901bdc8f82a8231f21545ae0318560277a0b))
* update RalphLoop→MartinLoop references in root docs ([515ae01](https://github.com/djm204/frankenbeast/commit/515ae015d7cb1a73b14a359acc949b5536165616))


### Tests

* **docs:** tighten docs contract coverage ([9ae3070](https://github.com/djm204/frankenbeast/commit/9ae3070b84c0972509d46a8f02acc8580eac38d3))

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
