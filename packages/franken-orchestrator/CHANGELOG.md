# Changelog

## [0.30.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.29.0...franken-orchestrator-v0.30.0) (2026-04-10)


### Features

* **orchestrator:** last-mile wiring — activate consolidation components in production runtime ([#275](https://github.com/djm204/frankenbeast/issues/275)) ([d318813](https://github.com/djm204/frankenbeast/commit/d318813518c99aede74aedc3ed9c4577cec114f4))


### Bug Fixes

* dashboard review fixes, dispatch config stripping, error logging ([cdcf969](https://github.com/djm204/frankenbeast/commit/cdcf969541adfd69bca4a5ac9d4676571b639773))
* **orchestrator:** populate phase in ChatRuntime.result(), update docs ([#277](https://github.com/djm204/frankenbeast/issues/277)) ([ec02071](https://github.com/djm204/frankenbeast/commit/ec02071c8987d8b1794784c09a9c2f8e98bb8f33))
* **orchestrator:** resolve Chunk A residuals R1-R4 ([7572d68](https://github.com/djm204/frankenbeast/commit/7572d68b62c520e4745f9d218f4c5806af71df79))
* **orchestrator:** resolve Chunk A residuals R1-R4 ([778acba](https://github.com/djm204/frankenbeast/commit/778acbae53803c1e2807c99c973392ee2e666429))

## [0.29.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.28.0...franken-orchestrator-v0.29.0) (2026-04-01)


### Features

* add skill directory equivalents for beast definitions ([789b567](https://github.com/djm204/frankenbeast/commit/789b567207768e639d6f4cc9c9ef5bcf95882566))
* add skill directory equivalents for beast definitions ([b63d31f](https://github.com/djm204/frankenbeast/commit/b63d31fbbfd5108e2c22207a62a6d46fb2160040))
* dashboard SSE routes and web UI panels ([0c8c8e0](https://github.com/djm204/frankenbeast/commit/0c8c8e0520be173cd921edda6c424cc41e7b1292))
* **orchestrator:** add dashboard aggregation routes with SSE stream ([f2310e7](https://github.com/djm204/frankenbeast/commit/f2310e7fa401848f84a80374e5abce72856929a8))
* **orchestrator:** add skill/provider/security/dashboard CLI commands ([23bcc2f](https://github.com/djm204/frankenbeast/commit/23bcc2f8a788f7acac26045108eea0f7e401de11))
* **orchestrator:** add skill/provider/security/dashboard CLI commands ([cd1ac1b](https://github.com/djm204/frankenbeast/commit/cd1ac1b189af357f59dbdbb8e5b8dde2a90f9509))
* **orchestrator:** add SkillConfigStore for persistent skill toggle state ([4920421](https://github.com/djm204/frankenbeast/commit/492042128980080976271f5dec76d2b6908de7c6))
* **orchestrator:** add SkillConfigStore for persistent skill toggle state ([05a5191](https://github.com/djm204/frankenbeast/commit/05a5191ab0a3f6a98cca32de5d700be727418acb))


### Bug Fixes

* address 10 review issues on dashboard chunk ([037a57a](https://github.com/djm204/frankenbeast/commit/037a57a2538682233612143e02f289cd88a19cb2))
* address 10 review issues on dashboard chunk ([df52d71](https://github.com/djm204/frankenbeast/commit/df52d7152350c03f741f64ee55ee802da1da81b6))
* **orchestrator:** address CLI command review issues ([a9bc9a6](https://github.com/djm204/frankenbeast/commit/a9bc9a6834dee58b48be6b78a6a4dd0598120af5))
* **orchestrator:** normalize non-object config root, persist on remove ([7956228](https://github.com/djm204/frankenbeast/commit/7956228ea4cda037633751af88d072cbd3d82d4f))
* residual one-shots (comms cleanup, HITL test, checkpoint flush, PROGRESS.md) ([e105db3](https://github.com/djm204/frankenbeast/commit/e105db3fe067c6473d3f2a4bc43fc85756487018))


### Refactoring

* **orchestrator:** delete standalone comms server files ([35cf137](https://github.com/djm204/frankenbeast/commit/35cf13706eb75e0ae07505fc57a766226206b3f6))


### Tests

* **orchestrator:** add HITL approval integration test via comms gateway ([0e31a39](https://github.com/djm204/frankenbeast/commit/0e31a3924134d240d7478a943b84db547a479d35))

## [0.28.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.27.0...franken-orchestrator-v0.28.0) (2026-03-27)


### Features

* **orchestrator:** add comms config, token aggregation, delete EpisodicMemoryPortAdapter ([5eba2a8](https://github.com/djm204/frankenbeast/commit/5eba2a8bb5a9867c10fee361dec59c6112c18bfe))
* **orchestrator:** mount skill routes in chat-app when skillManager provided ([9ae5889](https://github.com/djm204/frankenbeast/commit/9ae58893669c4a4c837ed5aad1cd7df1a22970ce))
* **orchestrator:** pass commsConfig through startChatServer to createChatApp ([fba06ca](https://github.com/djm204/frankenbeast/commit/fba06ca4f4b6024ec3010aeee660eb91be8de636))


### Bug Fixes

* **orchestrator:** preserve cli:* skill compatibility in consolidated deps ([b0231c5](https://github.com/djm204/frankenbeast/commit/b0231c5250ebb6bb5b97726929835ea64970d11e))


### Refactoring

* **orchestrator:** migrate dep-factory to consolidated components ([e432b6d](https://github.com/djm204/frankenbeast/commit/e432b6dd845a059e292df70aba3f18c47f9cafe8))
* **orchestrator:** wire createBeastDeps into dep-factory replacing stubs ([50184a3](https://github.com/djm204/frankenbeast/commit/50184a309f416b49243bf4ca5ae1b133771ca5ad))

## [0.27.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.26.0...franken-orchestrator-v0.27.0) (2026-03-26)


### Features

* **orchestrator:** add 6 adapter classes + createBeastDeps (Phase 8.1+8.2) ([b18d93b](https://github.com/djm204/frankenbeast/commit/b18d93be8d03b3da22a1eb86aa418d40e51775a1))
* **orchestrator:** add E2E consolidated deps test + run-config v2 (Phase 8.5, 8.7) ([25a48ed](https://github.com/djm204/frankenbeast/commit/25a48ed4f2e731f0a3db03022fc21e17df7c69de))
* Phase 8 — Wire Everything Together (Core) ([12d5293](https://github.com/djm204/frankenbeast/commit/12d52933d8ac27d5b2d46a24229fc94cf3c8c7d9))


### Bug Fixes

* **orchestrator:** address PR [#260](https://github.com/djm204/frankenbeast/issues/260) review comments ([75d628e](https://github.com/djm204/frankenbeast/commit/75d628e5a7affc50615e48c0b41622f95d7af1b4))
* **orchestrator:** swallow ENOENT in BeastLogStore.append ([02d303b](https://github.com/djm204/frankenbeast/commit/02d303be59caa5ac2c17be44f3315c42f0903d8a))

## [0.26.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.25.0...franken-orchestrator-v0.26.0) (2026-03-26)


### Features

* Phase 7 — Observer Audit Trail ([ea50e97](https://github.com/djm204/frankenbeast/commit/ea50e97b7b4d88c3a0e7261be8d5b08bb630441e))

## [0.25.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.24.0...franken-orchestrator-v0.25.0) (2026-03-26)


### Features

* **orchestrator:** add comms run-config schema (Phase 4.5.04) ([0d7cd30](https://github.com/djm204/frankenbeast/commit/0d7cd309c79f54bdb1a485f072287b4b8c50f193))
* **orchestrator:** add credential store + health checker (Phase 5.9, 5.10) ([ac1a2bd](https://github.com/djm204/frankenbeast/commit/ac1a2bd4c6d8fe5f21081718e4f18c7112dbd571))
* **orchestrator:** add domain allowlist middleware (Phase 4.4) ([854dce4](https://github.com/djm204/frankenbeast/commit/854dce48336c3b26bfef156a0b6b21b0fce26810))
* **orchestrator:** add LLM middleware chain + 3 middleware (Phase 4.2) ([ba1c2a1](https://github.com/djm204/frankenbeast/commit/ba1c2a11acdd28c66146814b3db32c0185345695))
* **orchestrator:** add provider skill translation + auth resolver (Phase 5.3, 5.4) ([f227431](https://github.com/djm204/frankenbeast/commit/f227431fcd132d00423b88a36fb169d9a0693fb4))
* **orchestrator:** add provider-aware outbound formatting (Phase 4.5.02) ([351e060](https://github.com/djm204/frankenbeast/commit/351e0605bab988b380a9cf3c11be1c82b6beff26))
* **orchestrator:** add reflection runtime trigger (Phase 6.2) ([8ff8933](https://github.com/djm204/frankenbeast/commit/8ff89331e14a3ea4233eb2c9037b59ef805ede80))
* **orchestrator:** add security profiles + API routes (Phase 4.3) ([f516985](https://github.com/djm204/frankenbeast/commit/f51698522db5460f34554c27202e4196ef88817c))
* **orchestrator:** add skill API routes + context endpoints (Phase 5.6, 5.7, 5.11) ([b2804a2](https://github.com/djm204/frankenbeast/commit/b2804a2213cdea54d3e1bfda3c222cea96fb5ff6))
* **orchestrator:** add SkillManager core CRUD (Phase 5.2) ([992105d](https://github.com/djm204/frankenbeast/commit/992105dceec8f661b93cc2b34f1876c5198288a2))
* **orchestrator:** replace ChatSocketBridge with direct ChatRuntime (Phase 4.5.01) ([6879e26](https://github.com/djm204/frankenbeast/commit/6879e26574e7efeb7940553c8d0c489c243382e2))
* **orchestrator:** security profile integration for webhook verification (Phase 4.5.03) ([5c9c6ca](https://github.com/djm204/frankenbeast/commit/5c9c6caced4563e0150774a6595614c8bb41a1ac))
* **orchestrator:** wire discoverSkills into CLI adapters (Phase 5.5) ([fb06baa](https://github.com/djm204/frankenbeast/commit/fb06baaf6f2669f105a59f0d34496d6a83a3112b))
* Phase 4 — Security Middleware ([2f4112b](https://github.com/djm204/frankenbeast/commit/2f4112bac8f0d8940ef141f64c7229c397535eea))
* Phase 4.5 — Comms Integration ([a3e8053](https://github.com/djm204/frankenbeast/commit/a3e80537a5e1413aab5cedd976c9d6724e796266))
* Phase 5 — Skill Loading ([bc99631](https://github.com/djm204/frankenbeast/commit/bc99631f27cd2ea1b4072e19998b3fc89eb389b0))
* Phase 6 — Absorb Reflection into Critique ([82ac47d](https://github.com/djm204/frankenbeast/commit/82ac47d6a67763a622f2d24058e6c30dbe989c46))


### Bug Fixes

* **orchestrator:** address Phase 4 review gaps ([8e48d85](https://github.com/djm204/frankenbeast/commit/8e48d85b9acbb01a008fd2ace05c8ef6603594c2))
* **orchestrator:** address Phase 4.5 review gaps ([1313c58](https://github.com/djm204/frankenbeast/commit/1313c582fba6e978c22472a937679782c3de13f3))
* **orchestrator:** address PR [#253](https://github.com/djm204/frankenbeast/issues/253) review comments ([8d467a4](https://github.com/djm204/frankenbeast/commit/8d467a40d22b33e4f698fe4fad9de1aa60ae776d))
* **orchestrator:** address PR [#255](https://github.com/djm204/frankenbeast/issues/255) review comments ([5fdecda](https://github.com/djm204/frankenbeast/commit/5fdecda1dd552d69062feadf5e67db6a23e0a41f))
* **orchestrator:** address PR [#256](https://github.com/djm204/frankenbeast/issues/256) review comments ([abd918c](https://github.com/djm204/frankenbeast/commit/abd918cfcb30234affb72ef17e07f062aea2974b))
* **orchestrator:** propagate reflection flag into orchestrator config ([4db763c](https://github.com/djm204/frankenbeast/commit/4db763ce818d2be4354bcb75e3848b806f99cae5))


### Tests

* **orchestrator:** add comms round-trip integration test (Phase 4.5.05) ([b493ed3](https://github.com/djm204/frankenbeast/commit/b493ed3e3aafdab2f0e8f894c8e72c85815c9eb2))

## [0.24.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.23.0...franken-orchestrator-v0.24.0) (2026-03-23)


### Features

* **orchestrator:** add 6 provider adapters + shared handoff (Phase 3.3-3.8) ([58f5f10](https://github.com/djm204/frankenbeast/commit/58f5f1016a644160046d7cc38e3c147d2cde76a1))
* **orchestrator:** add cross-provider token aggregation (Phase 3.10) ([39e2cae](https://github.com/djm204/frankenbeast/commit/39e2caef4464ee389aeafef40ca5438f5f04cbf0))
* **orchestrator:** add ProviderRegistry with failover logic (Phase 3.2) ([3725cee](https://github.com/djm204/frankenbeast/commit/3725cee04c4445986862b0b088225243ce0e6ad3))
* Phase 3 — Provider Registry + Adapters ([0ceb582](https://github.com/djm204/frankenbeast/commit/0ceb582f95a7ac7cac877adeb6b08bbe4aa9efd1))


### Bug Fixes

* **orchestrator:** address Phase 3 review gaps + document residuals ([bfc84ee](https://github.com/djm204/frankenbeast/commit/bfc84ee3f4afa95957100635381a1cbc33fe16f7))
* **orchestrator:** address PR [#251](https://github.com/djm204/frankenbeast/issues/251) review comments ([0052f0a](https://github.com/djm204/frankenbeast/commit/0052f0abbced47dc37dd32467f92376a0e1ba263))


### Tests

* **orchestrator:** add provider failover integration tests (Phase 3.9) ([57d2e8f](https://github.com/djm204/frankenbeast/commit/57d2e8f9a883fd07920d4a07485189c324147352))

## [0.23.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.22.0...franken-orchestrator-v0.23.0) (2026-03-21)


### Features

* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))


### Bug Fixes

* **consolidation:** address review findings — lockfile, comms routes, docs ([e406cc2](https://github.com/djm204/frankenbeast/commit/e406cc2b32cd977f6212b05a300a96ae78480914))

## [0.22.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.21.1...franken-orchestrator-v0.22.0) (2026-03-20)


### Features

* **beasts:** add BeastEventBus with sequence IDs and replay buffer ([6851710](https://github.com/djm204/frankenbeast/commit/68517105fda4513733f40414eb0ac4fc3c19b62f))
* **beasts:** add ProcessCallbacks to ProcessSupervisor with output capture and registry ([5d67738](https://github.com/djm204/frankenbeast/commit/5d6773817776254f7b636de2c5d68c239a9e8f54))
* **beasts:** add resolveCliEntrypoint utility ([8c956ca](https://github.com/djm204/frankenbeast/commit/8c956ca73b0b8ada868bc6ec05a0b09fe7660e63))
* **beasts:** add RunConfigSchema and RunConfigLoader with Zod validation ([10d0864](https://github.com/djm204/frankenbeast/commit/10d0864d502bec3b7a978e77ed36ae2b7f7372a7))
* **beasts:** add SSE routes with connection ticket auth ([8641b32](https://github.com/djm204/frankenbeast/commit/8641b328014bb11ad601959adbff8453ede55d99))
* **beasts:** add SseConnectionTicketStore with single-use tickets and TTL ([69c4390](https://github.com/djm204/frankenbeast/commit/69c4390ac84f6fe6d89552ca1ecd36d2c6d8fc87))
* **beasts:** config file passthrough to spawned processes ([8fe66bb](https://github.com/djm204/frankenbeast/commit/8fe66bb537d4f31337397493a5b361eac0887d86))
* **beasts:** error reporting to dashboard ([a6d9cea](https://github.com/djm204/frankenbeast/commit/a6d9ceac7618d560e2d3da2fb8246a6e377f1efd))
* **beasts:** error reporting to dashboard with spawn failure handling and SIGTERM timeout ([990577c](https://github.com/djm204/frankenbeast/commit/990577c31c93fad8b45a1aa8b159849e62221399))
* **beasts:** expose notifyRunStatusChange on BeastRunService ([daa25fa](https://github.com/djm204/frankenbeast/commit/daa25fa9ab26bd5459c5e7e88731fda690241f9c))
* **beasts:** ProcessSupervisor exit handling + output capture ([6c2600f](https://github.com/djm204/frankenbeast/commit/6c2600fb8a92a57a02e879ce3a60d745120cc3e8))
* **beasts:** replace chunk-plan stub with real CLI spawn ([b368ad3](https://github.com/djm204/frankenbeast/commit/b368ad3970d59d1a3d5a343a7a785d33ce381184))
* **beasts:** replace design-interview stub with real CLI spawn ([d58f7b1](https://github.com/djm204/frankenbeast/commit/d58f7b1b1e0e661fa4b59557f5a8fec888fbe04a))
* **beasts:** replace martin-loop stub with real CLI spawn ([12acef2](https://github.com/djm204/frankenbeast/commit/12acef26756000f81bef3851a4b46f263742762f))
* **beasts:** replace stub buildProcessSpec with real CLI spawns ([2307c0c](https://github.com/djm204/frankenbeast/commit/2307c0cd55c6f8704b5363e76630fd9e6ec0026b))
* **beasts:** SSE event bus + connection tickets (Chunk 06) ([436dca9](https://github.com/djm204/frankenbeast/commit/436dca9567fae9cafcc4178f54c9ab07f2149455))
* **beasts:** wire BeastEventBus into RunService and ProcessBeastExecutor ([8b442bf](https://github.com/djm204/frankenbeast/commit/8b442bf3328ebc3002baefb45fa8beaa8b70b091))
* **beasts:** wire ProcessCallbacks through ProcessBeastExecutor to persistence ([c902168](https://github.com/djm204/frankenbeast/commit/c902168034d659b0428920483190ed8b69d81312))
* **beasts:** wire ProcessCallbacks through ProcessBeastExecutor to persistence ([a2ce1ba](https://github.com/djm204/frankenbeast/commit/a2ce1bacb0d769d212a7bd75321d6eb4ab21dc7e))
* **beasts:** write configSnapshot to JSON file before spawn and clean up on exit ([a010200](https://github.com/djm204/frankenbeast/commit/a010200d5fb5e6e958e201ff4a7471e5248a6a0d))
* **cli:** add franken and frkn as CLI aliases ([b651cd5](https://github.com/djm204/frankenbeast/commit/b651cd543408ba2e574f3da236d3c75d4354f2f5))
* **cli:** load RunConfig from env in session startup path ([e58844f](https://github.com/djm204/frankenbeast/commit/e58844f2fdfd648a9d62c5c72ef4373a91706e91))
* **cli:** wire RunConfig overrides into dep-factory ([a3831b8](https://github.com/djm204/frankenbeast/commit/a3831b823ab6e65dd9d8d2c5ac577d3cbd243ffd))
* Plan 1 — Foundation Execution Pipeline ([bc4cc63](https://github.com/djm204/frankenbeast/commit/bc4cc63b958dfe1d9763056f69b5495b7272b73e))


### Bug Fixes

* **beasts:** add projectRoot to configSchema, strengthen env assertions ([8e4ba77](https://github.com/djm204/frankenbeast/commit/8e4ba7745070d2070dcc022d39754e9a7ed610c4))
* **beasts:** address PR [#241](https://github.com/djm204/frankenbeast/issues/241) review findings ([ffa9329](https://github.com/djm204/frankenbeast/commit/ffa9329e39d3901a0110a464e2a819dc38f7820a))
* **beasts:** buffer early exit events and handle null code/signal edge case ([dc899c1](https://github.com/djm204/frankenbeast/commit/dc899c14999b476c50e642c71b95b5b6eaead1b0))
* **beasts:** enable auto-dispatch for design-interview definition ([6cb16e1](https://github.com/djm204/frankenbeast/commit/6cb16e11ffd7f1a34e6707ed1b5f29dda8aae48a))
* **beasts:** fix stop() double-write, duplicate agent events, and spec compliance ([ad2c981](https://github.com/djm204/frankenbeast/commit/ad2c98199988612fe4478888a3b310e218998317))
* **beasts:** make ProcessCallbacks required, fix readline drain race condition ([5509d06](https://github.com/djm204/frankenbeast/commit/5509d0634daba29afa91bea11878a573a98cc307))
* **beasts:** resolve 3 high-severity discrepancies from Pass 7 audit ([bdc0f2c](https://github.com/djm204/frankenbeast/commit/bdc0f2cc4f1a85c3037c4e1b5c56143f30fd35ad))
* **beasts:** resolve all DISCREPANCIES.md findings from Plan 1 ([5679beb](https://github.com/djm204/frankenbeast/commit/5679beb7c72fb4adad3aa946af7f4879f0eab086))
* **beasts:** resolve all Pass 6 Deep Audit findings (R1-R8) ([a9eac61](https://github.com/djm204/frankenbeast/commit/a9eac6144d012928c013a5e4fbcb29a803fc9213))
* **beasts:** resolve Pass 4/5 truth audit findings ([ba0908b](https://github.com/djm204/frankenbeast/commit/ba0908be6512cc0161d648cc1ed4de81823adeab))
* **cli:** align RunConfigSchema with spec, fix module passthrough and error handling ([9873dfa](https://github.com/djm204/frankenbeast/commit/9873dfa570ef094171dcb21329b4d36efa91d38c))
* honor run config provider and model precedence ([17d3432](https://github.com/djm204/frankenbeast/commit/17d3432f858d2590f2cb0683dbd2b661bd667fab))
* **lint:** suppress false-positive prefer-const on deferred assignments ([df7779d](https://github.com/djm204/frankenbeast/commit/df7779d9d469ea26361da38147ba23e40321351d))

## [0.21.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.21.0...franken-orchestrator-v0.21.1) (2026-03-15)


### Bug Fixes

* **orchestrator:** add missing @franken/critique and @franken/governor dependencies ([31e71f0](https://github.com/djm204/frankenbeast/commit/31e71f01d4aacd062ec42aebcf7bca3762a7de39))

## [0.21.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.20.0...franken-orchestrator-v0.21.0) (2026-03-15)


### Features

* **franken-orchestrator:** add hybrid llm cache primitives ([c929e29](https://github.com/djm204/frankenbeast/commit/c929e29875460703f002b2ec28d738a243d986ec))
* **franken-orchestrator:** add intelligent LLM caching ([c00307c](https://github.com/djm204/frankenbeast/commit/c00307c91c7612f38aa86962f07d04e7feec6b61))
* **franken-orchestrator:** cache repeated planning and issue prompts ([89b3591](https://github.com/djm204/frankenbeast/commit/89b3591b3b92213f14129f60d4cce3b40b15b941))
* **orchestrator:** intelligent LLM caching with work-scoped isolation ([b2d4e87](https://github.com/djm204/frankenbeast/commit/b2d4e870fb43f2dc91a887e058ccc06d961c0d4e))
* **orchestrator:** wire critique module in dep-factory with fallback ([add4b1f](https://github.com/djm204/frankenbeast/commit/add4b1ffda6a1611662e5a0eab28e52f3741d855))
* **orchestrator:** wire governor module in dep-factory with HITL channel and fallback ([931da7f](https://github.com/djm204/frankenbeast/commit/931da7f8e53729e99a6f1aa6e5221c471559444b))
* wire critique and governor modules in dep-factory (Tiers 3-4) ([8d55339](https://github.com/djm204/frankenbeast/commit/8d553399167860bad06a03c85e5b6045a0fb8b1e))


### Bug Fixes

* **orchestrator:** guard readline creation behind TTY check in governor wiring ([7785c72](https://github.com/djm204/frankenbeast/commit/7785c72d21afa5d331ba02ab5ace298c40b580ed))
* **orchestrator:** mock session/GC classes in dep-factory tests to prevent CI timeouts ([582dd03](https://github.com/djm204/frankenbeast/commit/582dd032bc37aae92d58559e5919b8b587f9d50a))

## [0.20.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.19.3...franken-orchestrator-v0.20.0) (2026-03-13)


### Features

* add enabledModules to CliDepOptions with env var fallback ([f4234c3](https://github.com/djm204/frankenbeast/commit/f4234c341cae10c61e3b49b614a8f43cd8505b82))
* add EpisodicMemoryPortAdapter bridging EpisodicMemoryStore to IMemoryModule ([a3ce9d8](https://github.com/djm204/frankenbeast/commit/a3ce9d84a122a24ba98fbd41a7dc7f7f70e94763))
* add ModuleConfig type and TrackedAgent.moduleConfig field ([69b1552](https://github.com/djm204/frankenbeast/commit/69b1552f804bf07dc30ecc1fbc1abec82aba4738))
* add SkillRegistryBridge to adapt ISkillRegistry to SkillRegistryPort ([5b3bba0](https://github.com/djm204/frankenbeast/commit/5b3bba0786f6a50c5a8a636373ae83cdf6bcce6e))
* inject FRANKENBEAST_MODULE_* env vars from run config into beast processes ([6e7aa16](https://github.com/djm204/frankenbeast/commit/6e7aa16a069f4801750b6ee14de57143646cb532))
* wire per-agent module toggle persistence and dispatch plumbing ([6ead11e](https://github.com/djm204/frankenbeast/commit/6ead11ef18447806863eaa8cb0cc3136638f0204))
* wire real EpisodicMemoryPortAdapter into createCliDeps with module toggle gate ([7979020](https://github.com/djm204/frankenbeast/commit/7979020f60a74c22efd630555d6a4f55f106f3c2))
* wire real Firewall, Skills, Memory modules into BeastLoop (Tiers 1-2) ([b835f52](https://github.com/djm204/frankenbeast/commit/b835f529b6167984d54586d8194485664418eef6))
* wire real FirewallPortAdapter into createCliDeps with module toggle gate ([62ff60e](https://github.com/djm204/frankenbeast/commit/62ff60eabba5b27ca08b4df6a9ac54e0e925c0b3))
* wire real SkillsPortAdapter into createCliDeps with module toggle gate ([9591a55](https://github.com/djm204/frankenbeast/commit/9591a552507e3519f8cda7825cc2fad5c4404229))

## [0.19.3](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.19.2...franken-orchestrator-v0.19.3) (2026-03-13)


### Bug Fixes

* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([1e88e62](https://github.com/djm204/frankenbeast/commit/1e88e6222bc1149311fb8ade17ac8eafa3525bc0))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([33dbf5a](https://github.com/djm204/frankenbeast/commit/33dbf5a483debc2460116f2b1cbbf0cd029a8061))

## [0.19.2](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.19.1...franken-orchestrator-v0.19.2) (2026-03-13)


### Bug Fixes

* **orchestrator:** standardize subprocess failures ([#213](https://github.com/djm204/frankenbeast/issues/213)) ([130bce2](https://github.com/djm204/frankenbeast/commit/130bce266b71dcc84ba3e3b463d8ff5b4b46a475))

## [0.19.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.19.0...franken-orchestrator-v0.19.1) (2026-03-13)


### Bug Fixes

* **orchestrator:** isolate issue stage sessions ([#212](https://github.com/djm204/frankenbeast/issues/212)) ([44a2c61](https://github.com/djm204/frankenbeast/commit/44a2c617327540bfd04253062e6017487656a3e2))
* **orchestrator:** remove shell-backed git execution ([4f8f14d](https://github.com/djm204/frankenbeast/commit/4f8f14d881c150065ed7ccd0a665ea2f72a55cda))

## [0.19.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.18.2...franken-orchestrator-v0.19.0) (2026-03-12)


### Features

* **orchestrator:** unify issue pipeline with BeastLoop and optimize context window ([ffa6299](https://github.com/djm204/frankenbeast/commit/ffa6299f446663cc724da6311467824d75bed0c5))


### Bug Fixes

* **orchestrator:** standardize issue execution via chunk files ([63942f6](https://github.com/djm204/frankenbeast/commit/63942f6b2a6aff3088a1f5c55c652719717fe7f1))
* **orchestrator:** standardize issue execution via chunk files ([1e6d2eb](https://github.com/djm204/frankenbeast/commit/1e6d2ebbd6e8ad662ca6d70158078bf65070c28a))

## [0.18.2](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.18.1...franken-orchestrator-v0.18.2) (2026-03-12)


### Bug Fixes

* **orchestrator:** address issue runtime review feedback ([a1dc2fd](https://github.com/djm204/frankenbeast/commit/a1dc2fd05e08e969aa3edf2e3c7602501853b532))
* **orchestrator:** make one-shot issues issue-aware and resumable ([09488cb](https://github.com/djm204/frankenbeast/commit/09488cb6f49ee2179ce9d2d0cfaff2f19cd1ef4f))
* **orchestrator:** make one-shot issues issue-aware and resumable ([66a5f4a](https://github.com/djm204/frankenbeast/commit/66a5f4a08680225f41d805bd217bbd5b81bc483d))

## [0.18.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.18.0...franken-orchestrator-v0.18.1) (2026-03-12)


### Bug Fixes

* add provider fallback to cli llm adapter ([643ed9f](https://github.com/djm204/frankenbeast/commit/643ed9f3876d760f9621d648dbf6cd2e5fb021ca))
* correct gemini headless prompt args ([a076b7c](https://github.com/djm204/frankenbeast/commit/a076b7cab410b84a6ee141dbb40704b54d27d45b))
* honor provider selection in issues execution ([23073a3](https://github.com/djm204/frankenbeast/commit/23073a31bf0f922913f81006e2dbdf65c3117f41))
* **orchestrator:** honor provider selection and fallback semantics ([abf1b77](https://github.com/djm204/frankenbeast/commit/abf1b776226e67257ec39e2d34cd359bc3e7eb95))
* preserve provider semantics during cli fallback ([5f34635](https://github.com/djm204/frankenbeast/commit/5f34635505c4dcc4f449e4f33b64c2d171189d5a))

## [0.18.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.17.0...franken-orchestrator-v0.18.0) (2026-03-12)


### Features

* add tracked agent dashboard controls ([0f9b4db](https://github.com/djm204/frankenbeast/commit/0f9b4db305950ccdd1580fee28d8ba1ee751d9ee))
* add tracked agent dashboard controls ([fb13aa7](https://github.com/djm204/frankenbeast/commit/fb13aa740788a9ec7b81066d732318ce5314efb7))


### Bug Fixes

* broaden start endpoint status guard and clear selection on agent delete ([45026bf](https://github.com/djm204/frankenbeast/commit/45026bf0f7b7fc5edede087e00176f6ed09d3493))

## [0.17.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.16.0...franken-orchestrator-v0.17.0) (2026-03-12)


### Features

* add frankenbeast chat persona ([05e75f0](https://github.com/djm204/frankenbeast/commit/05e75f047fecee13145ed26b41cbe7b3db6051dd))
* add frankenbeast chat persona ([a56c434](https://github.com/djm204/frankenbeast/commit/a56c434d7d6660ce491eb175f62060e88febfe3c))


### Bug Fixes

* start tracked beast agents from dashboard ([c71865f](https://github.com/djm204/frankenbeast/commit/c71865fe25c0c1341f7228cd718d25156056d479))
* start tracked beast agents from dashboard ([be65772](https://github.com/djm204/frankenbeast/commit/be65772b5fff6be06246a6817ef6a2d4e1afd3f0))

## [0.16.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.15.0...franken-orchestrator-v0.16.0) (2026-03-12)


### Features

* add beast dashboard resume and path controls ([500999f](https://github.com/djm204/frankenbeast/commit/500999f8404ef680616341136cbe5c4eeef4fe10))
* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))
* secret store with 4 pluggable backends ([f05846f](https://github.com/djm204/frankenbeast/commit/f05846f70dbc6b6815ae4568c829d9eedc0a1670))


### Bug Fixes

* **secret-store:** address PR review — 5 fixes for robustness and correctness ([89076b0](https://github.com/djm204/frankenbeast/commit/89076b06e9427b0adb38579f748009378ca1ae0a))
* **secret-store:** fix exactOptionalPropertyTypes TS errors across all new interfaces ([bf8f267](https://github.com/djm204/frankenbeast/commit/bf8f267dec4f0658596a6cad03b67719031b6798))

## [0.15.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.14.1...franken-orchestrator-v0.15.0) (2026-03-11)


### Features

* add tracked agent foundations ([4073878](https://github.com/djm204/frankenbeast/commit/407387806cb8972b2115e6aef489df02bf3c07fe))
* implement tracked agent init workflow ([366cc75](https://github.com/djm204/frankenbeast/commit/366cc756338774124ee5a4928a9ff451efec3bbd))
* wire tracked agents through dispatch and chat ([7179567](https://github.com/djm204/frankenbeast/commit/71795676226f9675c74902b83edd9c15b1d4a966))


### Bug Fixes

* fix the connection between dashboard and backend, and make some UI changes ([d137437](https://github.com/djm204/frankenbeast/commit/d1374374b3e0e6195b58a7fd8f19a74dc7f6a40f))
* harden beast route failure handling ([ac53201](https://github.com/djm204/frankenbeast/commit/ac53201a045e777faa6de9f6daa2455349d1050e))
* harden tracked agent beast routes and dispatch validation ([39b6850](https://github.com/djm204/frankenbeast/commit/39b685052c810d09b7b7af237ed15a1d3d7805c8))
* make tracked agent dispatch transactional ([4f622d2](https://github.com/djm204/frankenbeast/commit/4f622d2ac72f665267d7a7a2280baa51b970ac55))
* migrate legacy beast run schema ([f97d7f5](https://github.com/djm204/frankenbeast/commit/f97d7f548551afa95246563c7fc914e306f74247))

## [0.14.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.14.0...franken-orchestrator-v0.14.1) (2026-03-11)


### Bug Fixes

* **beasts:** wire dashboard control routes into chat server ([578f5cc](https://github.com/djm204/frankenbeast/commit/578f5cc4d5b93b0c3ecabec12f8dc222af9ccd16))
* wire beast control into chat server ([aa7d26e](https://github.com/djm204/frankenbeast/commit/aa7d26ed240621af2273d554ef8268c4d5ecbdb8))

## [0.14.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.13.0...franken-orchestrator-v0.14.0) (2026-03-11)


### Features

* **orchestrator:** support upstream repo targeting for issues ([414b7e1](https://github.com/djm204/frankenbeast/commit/414b7e1c33e5762c5966b55d05932ef02ba2fe3a))
* **orchestrator:** support upstream repo targeting for issues ([20d0585](https://github.com/djm204/frankenbeast/commit/20d058503589bdf940b4cbc497b5e22ec3310fe8))
* **orchestrator:** support upstream repo targeting for issues ([aa1819e](https://github.com/djm204/frankenbeast/commit/aa1819e99105376a13b4b8e9f927aca5ba1aba5d))

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
