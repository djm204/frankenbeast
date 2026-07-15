# Changelog

## [0.12.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.11.0...franken-types-v0.12.0) (2026-07-15)


### Features

* **availability:** add capacity watermark alerts ([#2266](https://github.com/djm204/frankenbeast/issues/2266)) ([219ffd3](https://github.com/djm204/frankenbeast/commit/219ffd34483126e6f09b11c17b86d89226c39280))
* **orchestrator:** add approval readiness health endpoint ([#2262](https://github.com/djm204/frankenbeast/issues/2262)) ([e5ba904](https://github.com/djm204/frankenbeast/commit/e5ba904987618708bacc27731ae6f565d90e02d6))

## [0.11.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.10.1...franken-types-v0.11.0) (2026-07-14)


### Features

* **memory:** add right-to-forget workflow ([#2212](https://github.com/djm204/frankenbeast/issues/2212)) ([229bc0d](https://github.com/djm204/frankenbeast/commit/229bc0d8f69d5243ba8e3703c266ec9466633ab2))

## [0.10.1](https://github.com/djm204/frankenbeast/compare/franken-types-v0.10.0...franken-types-v0.10.1) (2026-07-14)


### Bug Fixes

* **deps:** repair npm security and maintenance update ([4fd8ecc](https://github.com/djm204/frankenbeast/commit/4fd8eccf9b57960572d624aaa18ceac773fddcc0))

## [0.10.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.9.0...franken-types-v0.10.0) (2026-07-14)


### Features

* **learning:** add episodic learning cooldown ([#1873](https://github.com/djm204/frankenbeast/issues/1873)) ([badbe7c](https://github.com/djm204/frankenbeast/commit/badbe7c61fccb95e4076ddf8e38b11d42120bf3b))


### Bug Fixes

* **governor:** honor scoped operator session tokens ([#2112](https://github.com/djm204/frankenbeast/issues/2112)) ([1420a32](https://github.com/djm204/frankenbeast/commit/1420a328a61b44ff168ae02051766086ad741abc))
* **orchestrator:** clear approval metadata in response ([23c4cd2](https://github.com/djm204/frankenbeast/commit/23c4cd2fcb271654728494f157be6cf8905ef0f9))
* **orchestrator:** close beast attempt cleanup issue ([#2003](https://github.com/djm204/frankenbeast/issues/2003)) ([ae34c42](https://github.com/djm204/frankenbeast/commit/ae34c42ecba98db09aa5b43c097d8ecf0819170e))
* **types:** harden archive extraction path containment ([#1988](https://github.com/djm204/frankenbeast/issues/1988)) ([c065d48](https://github.com/djm204/frankenbeast/commit/c065d48281bbd0d91994ae3b34b14cb5c799de5f)), closes [#1793](https://github.com/djm204/frankenbeast/issues/1793)
* **types:** harden JSON pointer handling ([#1989](https://github.com/djm204/frankenbeast/issues/1989)) ([975239f](https://github.com/djm204/frankenbeast/commit/975239fc5396d75c11e7f5ce91c7ac09b1bfc4ac))
* **web:** clear Beast SSE reconnect errors ([#2195](https://github.com/djm204/frankenbeast/issues/2195)) ([1278ebc](https://github.com/djm204/frankenbeast/commit/1278ebc5b7a26dfe799171fc4e012a9f4746af04))

## [0.9.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.8.2...franken-types-v0.9.0) (2026-07-11)


### Features

* **types:** add deterministic utility helpers ([#1440](https://github.com/djm204/frankenbeast/issues/1440)) ([1bab25d](https://github.com/djm204/frankenbeast/commit/1bab25da77c4eb27a4bc0766f0e44c77391799cd))


### Bug Fixes

* replace nondeterministic calls with deterministic utilities ([#1441](https://github.com/djm204/frankenbeast/issues/1441)) ([1585acf](https://github.com/djm204/frankenbeast/commit/1585acf39bb993b06d2b975045641ad662a44459))
* **web:** expose tracked agent status filters ([#1506](https://github.com/djm204/frankenbeast/issues/1506)) ([6bf1e20](https://github.com/djm204/frankenbeast/commit/6bf1e2091ada17b0cbc24748c9b77f3aada42b9b)), closes [#1102](https://github.com/djm204/frankenbeast/issues/1102)


### Miscellaneous

* **ci:** make workspace lint coverage explicit ([#1596](https://github.com/djm204/frankenbeast/issues/1596)) ([c1674ed](https://github.com/djm204/frankenbeast/commit/c1674ed69e460a9c7c14d8b7af2e4039edf174d8))
* **package:** normalize workspace metadata ([#1573](https://github.com/djm204/frankenbeast/issues/1573)) ([921c557](https://github.com/djm204/frankenbeast/commit/921c557e9f8392f1202f3fa2cdcc7952ffccd255))


### Documentation

* **packages:** add remaining workspace READMEs ([#1576](https://github.com/djm204/frankenbeast/issues/1576)) ([c050151](https://github.com/djm204/frankenbeast/commit/c050151bcda2973825fd13d17751f348c8ce74f6))
* **skills:** clarify SkillManager phase status ([#1462](https://github.com/djm204/frankenbeast/issues/1462)) ([4b3cd35](https://github.com/djm204/frankenbeast/commit/4b3cd35f74f0fa7ce443a312d10484bb749bb46b)), closes [#986](https://github.com/djm204/frankenbeast/issues/986)


### Tests

* add deterministic Vitest seed mode ([#1429](https://github.com/djm204/frankenbeast/issues/1429)) ([f12b497](https://github.com/djm204/frankenbeast/commit/f12b497a0662a1b519cbf07d442316c734dcc778))
* add workspace coverage task ([#1589](https://github.com/djm204/frankenbeast/issues/1589)) ([1934756](https://github.com/djm204/frankenbeast/commit/1934756851e520c033f2a43c5b440c8268662714)), closes [#948](https://github.com/djm204/frankenbeast/issues/948)

## [0.8.2](https://github.com/djm204/frankenbeast/compare/franken-types-v0.8.1...franken-types-v0.8.2) (2026-07-10)


### Bug Fixes

* **mcp:** close Codex hook command quoting issue ([#1382](https://github.com/djm204/frankenbeast/issues/1382)) ([293c730](https://github.com/djm204/frankenbeast/commit/293c7301083883b56bb71e1eca19f1ddc4d23236)), closes [#1047](https://github.com/djm204/frankenbeast/issues/1047)
* **types:** validate provider token usage counts ([#1348](https://github.com/djm204/frankenbeast/issues/1348)) ([e2387f3](https://github.com/djm204/frankenbeast/commit/e2387f32c91a04452da269c022e8297d81f8ab94))
* **web:** resolve chat session syntax issue ([4ce15f7](https://github.com/djm204/frankenbeast/commit/4ce15f79ead878e53e9fe9ac10bd1d7943972dfd))
* **web:** secure chat websocket authentication ([679b15d](https://github.com/djm204/frankenbeast/commit/679b15dfbd8cc592ed04b67339230494a5586a8c)), closes [#703](https://github.com/djm204/frankenbeast/issues/703)


### Miscellaneous

* **types:** disambiguate critique contracts ([#1360](https://github.com/djm204/frankenbeast/issues/1360)) ([ddd0bd0](https://github.com/djm204/frankenbeast/commit/ddd0bd0b1dfc8a5a0d2a78cd9b4a570e7974e57f))


### Documentation

* **web:** fix operator token auth header markdown ([#1303](https://github.com/djm204/frankenbeast/issues/1303)) ([1449e26](https://github.com/djm204/frankenbeast/commit/1449e268c54bafb994d5034fec1ccfc312194d9e))


### Tests

* **types:** fail when no tests are discovered ([8817b8b](https://github.com/djm204/frankenbeast/commit/8817b8b29c3a20af1fee5d0593669ae1b28fb15b)), closes [#970](https://github.com/djm204/frankenbeast/issues/970)

## [0.8.1](https://github.com/djm204/frankenbeast/compare/franken-types-v0.8.0...franken-types-v0.8.1) (2026-07-08)


### Tests

* **ci:** exercise minimum supported Node version in CI ([#1057](https://github.com/djm204/frankenbeast/issues/1057)) ([26debe4](https://github.com/djm204/frankenbeast/commit/26debe4feb5221422680988a4a3bb1d112bb8adb))

## [0.8.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.7.7...franken-types-v0.8.0) (2026-07-07)


### Features

* **orchestrator:** wire container chat dispatch ([#468](https://github.com/djm204/frankenbeast/issues/468)) ([94d0f5e](https://github.com/djm204/frankenbeast/commit/94d0f5e7a55a09e8aa540ce0f9832b975af2e9de))
* Phase 3 — Provider Registry + Adapters ([0ceb582](https://github.com/djm204/frankenbeast/commit/0ceb582f95a7ac7cac877adeb6b08bbe4aa9efd1))
* Phase 5 — Skill Loading ([bc99631](https://github.com/djm204/frankenbeast/commit/bc99631f27cd2ea1b4072e19998b3fc89eb389b0))
* **types:** add brain interfaces and BrainSnapshot types (Phase 2.1) ([5167997](https://github.com/djm204/frankenbeast/commit/5167997c99954fd37d66822ad8efb87913f0b432))
* **types:** add provider interfaces, types, and Zod schemas (Phase 3.1) ([7f8c728](https://github.com/djm204/frankenbeast/commit/7f8c728a4320f798a8795875a05b8a45d0d0d7d8))
* **types:** add skill directory schemas (Phase 5.1) ([bb55f53](https://github.com/djm204/frankenbeast/commit/bb55f532a653988122d86f00f61d0b55b2c001a4))
* **types:** brain interfaces + BrainSnapshot types (Phase 2.1) ([f2ed2fd](https://github.com/djm204/frankenbeast/commit/f2ed2fd52257c8fc44f1005bddc924af16d24177))


### Bug Fixes

* **api:** share web DTO contracts ([#544](https://github.com/djm204/frankenbeast/issues/544)) ([ec1e29a](https://github.com/djm204/frankenbeast/commit/ec1e29ae21bed03d156f0a58c0f27964566e5e80))
* **chat:** emit execution events after approval ([#877](https://github.com/djm204/frankenbeast/issues/877)) ([752f8ef](https://github.com/djm204/frankenbeast/commit/752f8ef2c56215d9c9cfb7cefe9f96a4a31cc49c))
* **cli:** show network help before root resolution ([71ebc60](https://github.com/djm204/frankenbeast/commit/71ebc60bcb292f228098759ffe22ba295cd7f34c)), closes [#414](https://github.com/djm204/frankenbeast/issues/414)
* **critique:** align warning evaluator verdicts ([#492](https://github.com/djm204/frankenbeast/issues/492)) ([2a0d7a0](https://github.com/djm204/frankenbeast/commit/2a0d7a001f285c6703c422edc3d959a94b95ba18))
* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)
* **network:** track in-process comms gateway ([#487](https://github.com/djm204/frankenbeast/issues/487)) ([b3d7a3b](https://github.com/djm204/frankenbeast/commit/b3d7a3be68dabbfcf3ff6e967ab73b4c0d29677f))
* **observer,types:** guard token counters against overflow & bad input ([#341](https://github.com/djm204/frankenbeast/issues/341)) ([0a7c6b4](https://github.com/djm204/frankenbeast/commit/0a7c6b4852e959489fbb389971b56f0c64278e5b))
* **orchestrator:** address Phase 3 review gaps + document residuals ([bfc84ee](https://github.com/djm204/frankenbeast/commit/bfc84ee3f4afa95957100635381a1cbc33fe16f7))
* **orchestrator:** preserve MCP tool HITL metadata ([#552](https://github.com/djm204/frankenbeast/issues/552)) ([2008c70](https://github.com/djm204/frankenbeast/commit/2008c707c9297958c498ba3cc30cb898c1a46018))
* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* **publish:** add files allowlist to governor/planner/types so dist actually ships ([#844](https://github.com/djm204/frankenbeast/issues/844)) ([46cb1a1](https://github.com/djm204/frankenbeast/commit/46cb1a1f1517da3cf88d589894fdc30b863b8e99))
* **security:** share realpath containment checks ([#875](https://github.com/djm204/frankenbeast/issues/875)) ([eb1ad94](https://github.com/djm204/frankenbeast/commit/eb1ad94736ead647df2f7840c0fad9555f86a73f))
* standardize package namespace strategy ([#825](https://github.com/djm204/frankenbeast/issues/825)) ([a2c236f](https://github.com/djm204/frankenbeast/commit/a2c236f9c7d46ab8fea079b85b3df3e4a7383e9b))
* **types:** add recovery fields to FrankenContext ([#312](https://github.com/djm204/frankenbeast/issues/312)) ([34c251a](https://github.com/djm204/frankenbeast/commit/34c251a62ea1eb054d08105beb1cbf659617698e))
* **types:** move orchestration contracts to canonical package ([#819](https://github.com/djm204/frankenbeast/issues/819)) ([e2e860e](https://github.com/djm204/frankenbeast/commit/e2e860e5576de1cc091dc3f3b59c9c06cd060fb9)), closes [#374](https://github.com/djm204/frankenbeast/issues/374)
* **web:** improve approval pending UX ([397aad6](https://github.com/djm204/frankenbeast/commit/397aad66ed038e7329447866e54c327c73952e3b)), closes [#654](https://github.com/djm204/frankenbeast/issues/654)


### Refactoring

* **tests:** alias Vitest configs to package sources ([#845](https://github.com/djm204/frankenbeast/issues/845)) ([454b526](https://github.com/djm204/frankenbeast/commit/454b526e509d5762bde3ec5102d7521367f0c1a7))


### Miscellaneous

* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* **packages:** align publishable package licenses ([#783](https://github.com/djm204/frankenbeast/issues/783)) ([398d37c](https://github.com/djm204/frankenbeast/commit/398d37c552954a94d08d90fce9ff76573b9ec664))
* release main ([50717e2](https://github.com/djm204/frankenbeast/commit/50717e2e2f6bd7c1dcc209e60d1b2cafed6af550))
* release main ([78d8495](https://github.com/djm204/frankenbeast/commit/78d849528ab990a50b2ed6859d98d10cab92b09f))
* release main ([48548f3](https://github.com/djm204/frankenbeast/commit/48548f32209176d6d9a1562fdb4725742ecb9515))
* release main ([1e760f3](https://github.com/djm204/frankenbeast/commit/1e760f3dde475636378bdba15afe4cbc13381239))
* release main ([d428ecd](https://github.com/djm204/frankenbeast/commit/d428ecd6e627d5c3c48cd0ef98c45a8eeca56d3e))
* release main ([55f726e](https://github.com/djm204/frankenbeast/commit/55f726e1af6e84f3401fd5ad14f452e7ac727f22))
* release main ([#309](https://github.com/djm204/frankenbeast/issues/309)) ([9dadfae](https://github.com/djm204/frankenbeast/commit/9dadfae67be6686e3a7962c5fd9e21ed8b6b525b))
* release main ([#378](https://github.com/djm204/frankenbeast/issues/378)) ([33629c1](https://github.com/djm204/frankenbeast/commit/33629c1b937e63a97fb06fdb32417ac19323b85d))
* release main ([#448](https://github.com/djm204/frankenbeast/issues/448)) ([8c9934f](https://github.com/djm204/frankenbeast/commit/8c9934f4adbd05b1ebae48081a3b3406746a1bc3))
* release main ([#524](https://github.com/djm204/frankenbeast/issues/524)) ([0481cad](https://github.com/djm204/frankenbeast/commit/0481cadf1a5cc49b32e01ca6337bc84c6488bb92))
* release main ([#537](https://github.com/djm204/frankenbeast/issues/537)) ([41d70dd](https://github.com/djm204/frankenbeast/commit/41d70dde60bbbc0983702fc2ebfb63ee0528aa53))
* release main ([#545](https://github.com/djm204/frankenbeast/issues/545)) ([fb5a692](https://github.com/djm204/frankenbeast/commit/fb5a6920da9e053deba737d88f3c515f7d4ad798))
* release main ([#554](https://github.com/djm204/frankenbeast/issues/554)) ([660250e](https://github.com/djm204/frankenbeast/commit/660250e5a21616955b05386eea741f17363c9198))
* release main ([#723](https://github.com/djm204/frankenbeast/issues/723)) ([767f8e2](https://github.com/djm204/frankenbeast/commit/767f8e2d347d1c4757db921e8689170f7fa9a9f1))
* release main ([#818](https://github.com/djm204/frankenbeast/issues/818)) ([2e22e95](https://github.com/djm204/frankenbeast/commit/2e22e9535df3fb40370c141d40394b99416b31d8))


### Documentation

* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))


### Tests

* delete 26 fluff test files (~283 tests) identified by audit ([03358d4](https://github.com/djm204/frankenbeast/commit/03358d4cdc745197e48b61855ed77571a37a2939))

## [0.7.6](https://github.com/djm204/frankenbeast/compare/franken-types-v0.7.5...franken-types-v0.7.6) (2026-07-06)


### Bug Fixes

* standardize package namespace strategy ([#825](https://github.com/djm204/frankenbeast/issues/825)) ([a2c236f](https://github.com/djm204/frankenbeast/commit/a2c236f9c7d46ab8fea079b85b3df3e4a7383e9b))
* **types:** move orchestration contracts to canonical package ([#819](https://github.com/djm204/frankenbeast/issues/819)) ([e2e860e](https://github.com/djm204/frankenbeast/commit/e2e860e5576de1cc091dc3f3b59c9c06cd060fb9)), closes [#374](https://github.com/djm204/frankenbeast/issues/374)

## [0.7.5](https://github.com/djm204/frankenbeast/compare/franken-types-v0.7.4...franken-types-v0.7.5) (2026-07-06)


### Bug Fixes

* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))


### Miscellaneous

* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* **packages:** align publishable package licenses ([#783](https://github.com/djm204/frankenbeast/issues/783)) ([398d37c](https://github.com/djm204/frankenbeast/commit/398d37c552954a94d08d90fce9ff76573b9ec664))

## [0.7.4](https://github.com/djm204/frankenbeast/compare/franken-types-v0.7.3...franken-types-v0.7.4) (2026-07-05)


### Bug Fixes

* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)
* **orchestrator:** preserve MCP tool HITL metadata ([#552](https://github.com/djm204/frankenbeast/issues/552)) ([2008c70](https://github.com/djm204/frankenbeast/commit/2008c707c9297958c498ba3cc30cb898c1a46018))
* **web:** improve approval pending UX ([397aad6](https://github.com/djm204/frankenbeast/commit/397aad66ed038e7329447866e54c327c73952e3b)), closes [#654](https://github.com/djm204/frankenbeast/issues/654)

## [0.7.3](https://github.com/djm204/frankenbeast/compare/franken-types-v0.7.2...franken-types-v0.7.3) (2026-07-04)


### Bug Fixes

* **network:** track in-process comms gateway ([#487](https://github.com/djm204/frankenbeast/issues/487)) ([b3d7a3b](https://github.com/djm204/frankenbeast/commit/b3d7a3be68dabbfcf3ff6e967ab73b4c0d29677f))

## [0.7.2](https://github.com/djm204/frankenbeast/compare/franken-types-v0.7.1...franken-types-v0.7.2) (2026-07-04)


### Bug Fixes

* **api:** share web DTO contracts ([#544](https://github.com/djm204/frankenbeast/issues/544)) ([ec1e29a](https://github.com/djm204/frankenbeast/commit/ec1e29ae21bed03d156f0a58c0f27964566e5e80))

## [0.7.1](https://github.com/djm204/frankenbeast/compare/franken-types-v0.7.0...franken-types-v0.7.1) (2026-07-04)


### Bug Fixes

* **critique:** align warning evaluator verdicts ([#492](https://github.com/djm204/frankenbeast/issues/492)) ([2a0d7a0](https://github.com/djm204/frankenbeast/commit/2a0d7a001f285c6703c422edc3d959a94b95ba18))

## [0.7.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.6.2...franken-types-v0.7.0) (2026-07-01)


### Features

* **orchestrator:** wire container chat dispatch ([#468](https://github.com/djm204/frankenbeast/issues/468)) ([94d0f5e](https://github.com/djm204/frankenbeast/commit/94d0f5e7a55a09e8aa540ce0f9832b975af2e9de))


### Documentation

* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))

## [0.6.2](https://github.com/djm204/frankenbeast/compare/franken-types-v0.6.1...franken-types-v0.6.2) (2026-06-28)


### Bug Fixes

* **observer,types:** guard token counters against overflow & bad input ([#341](https://github.com/djm204/frankenbeast/issues/341)) ([0a7c6b4](https://github.com/djm204/frankenbeast/commit/0a7c6b4852e959489fbb389971b56f0c64278e5b))

## [0.6.1](https://github.com/djm204/frankenbeast/compare/franken-types-v0.6.0...franken-types-v0.6.1) (2026-06-09)


### Bug Fixes

* **types:** add recovery fields to FrankenContext ([#312](https://github.com/djm204/frankenbeast/issues/312)) ([34c251a](https://github.com/djm204/frankenbeast/commit/34c251a62ea1eb054d08105beb1cbf659617698e))

## [0.6.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.5.0...franken-types-v0.6.0) (2026-03-26)


### Features

* Phase 5 — Skill Loading ([bc99631](https://github.com/djm204/frankenbeast/commit/bc99631f27cd2ea1b4072e19998b3fc89eb389b0))
* **types:** add skill directory schemas (Phase 5.1) ([bb55f53](https://github.com/djm204/frankenbeast/commit/bb55f532a653988122d86f00f61d0b55b2c001a4))

## [0.5.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.4.0...franken-types-v0.5.0) (2026-03-23)


### Features

* Phase 3 — Provider Registry + Adapters ([0ceb582](https://github.com/djm204/frankenbeast/commit/0ceb582f95a7ac7cac877adeb6b08bbe4aa9efd1))
* **types:** add provider interfaces, types, and Zod schemas (Phase 3.1) ([7f8c728](https://github.com/djm204/frankenbeast/commit/7f8c728a4320f798a8795875a05b8a45d0d0d7d8))


### Bug Fixes

* **orchestrator:** address Phase 3 review gaps + document residuals ([bfc84ee](https://github.com/djm204/frankenbeast/commit/bfc84ee3f4afa95957100635381a1cbc33fe16f7))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.3.2...franken-types-v0.4.0) (2026-03-21)


### Features

* **types:** add brain interfaces and BrainSnapshot types (Phase 2.1) ([5167997](https://github.com/djm204/frankenbeast/commit/5167997c99954fd37d66822ad8efb87913f0b432))
* **types:** brain interfaces + BrainSnapshot types (Phase 2.1) ([f2ed2fd](https://github.com/djm204/frankenbeast/commit/f2ed2fd52257c8fc44f1005bddc924af16d24177))


### Miscellaneous

* **main:** release franken-governor 0.4.0 ([c1cb8f3](https://github.com/djm204/frankenbeast/commit/c1cb8f341abc745cf2a94a627e665ef961550433))
* **main:** release franken-governor 0.4.0 ([c252078](https://github.com/djm204/frankenbeast/commit/c252078a6e951748b06996b54f0ab006283af0b3))
* **main:** release @franken/orchestrator 0.14.0 ([bc15bce](https://github.com/djm204/frankenbeast/commit/bc15bcec9fd1463a3931c43fc5d64e32ecbfe7ea))
* **main:** release @franken/orchestrator 0.14.0 ([967383d](https://github.com/djm204/frankenbeast/commit/967383d73814fc01aa58f623df994130d444c353))
* **main:** release franken-types 0.3.2 ([5d88dcb](https://github.com/djm204/frankenbeast/commit/5d88dcb63d5c43f7a66e79b4fd5c976c795df164))
* **main:** release franken-types 0.3.2 ([64381db](https://github.com/djm204/frankenbeast/commit/64381db3ca76cd36107dfb5a44e6b8c3a278561f))
* **main:** release franken-types 0.3.2 ([1f7bb59](https://github.com/djm204/frankenbeast/commit/1f7bb596d6b7b9fbcd8c865365e657a2ea4fb04f))
* **main:** release franken-types 0.3.2 ([ab62699](https://github.com/djm204/frankenbeast/commit/ab62699ec265117d2ef72d4cd937034dc24b70c4))
* **main:** release frankenfirewall 0.5.0 ([c9939d9](https://github.com/djm204/frankenbeast/commit/c9939d9b8011f8f7cfaa240b2f1c79fb010db1cc))


### Documentation

* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))


### Tests

* delete 26 fluff test files (~283 tests) identified by audit ([03358d4](https://github.com/djm204/frankenbeast/commit/03358d4cdc745197e48b61855ed77571a37a2939))

## [0.3.2](https://github.com/djm204/frankenbeast/compare/franken-types-v0.3.1...franken-types-v0.3.2) (2026-03-10)


### Bug Fixes

* **comms:** resolve build errors and unify websocket types ([2669d44](https://github.com/djm204/frankenbeast/commit/2669d4487bdfab9ef3ba522ce5a2dfa4b929cc7f))
* **comms:** resolve build errors and unify websocket types ([bfd0fb8](https://github.com/djm204/frankenbeast/commit/bfd0fb8cbb4656a719d9024a96bb5ca60734c40d))

## [0.3.2](https://github.com/djm204/frankenbeast/compare/franken-types-v0.3.1...franken-types-v0.3.2) (2026-03-10)


### Bug Fixes

* **comms:** resolve build errors and unify websocket types ([2669d44](https://github.com/djm204/frankenbeast/commit/2669d4487bdfab9ef3ba522ce5a2dfa4b929cc7f))
* **comms:** resolve build errors and unify websocket types ([bfd0fb8](https://github.com/djm204/frankenbeast/commit/bfd0fb8cbb4656a719d9024a96bb5ca60734c40d))

## [0.3.2](https://github.com/djm204/frankenbeast/compare/franken-types-v0.3.1...franken-types-v0.3.2) (2026-03-10)


### Bug Fixes

* **comms:** resolve build errors and unify websocket types ([2669d44](https://github.com/djm204/frankenbeast/commit/2669d4487bdfab9ef3ba522ce5a2dfa4b929cc7f))
* **comms:** resolve build errors and unify websocket types ([bfd0fb8](https://github.com/djm204/frankenbeast/commit/bfd0fb8cbb4656a719d9024a96bb5ca60734c40d))

## [0.3.1](https://github.com/djm204/frankenbeast/compare/franken-types-v0.3.0...franken-types-v0.3.1) (2026-03-09)


### Bug Fixes

* release-please scoping and commit hygiene ([742c7cc](https://github.com/djm204/frankenbeast/commit/742c7cc7792aac3f6f85ee638ba3b165de34bc5f))

## [0.3.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.2.0...franken-types-v0.3.0) (2026-03-09)


### Features

* eslint configs, gitignore hygiene, CLI guard fix ([#99](https://github.com/djm204/frankenbeast/issues/99)) ([87d7427](https://github.com/djm204/frankenbeast/commit/87d74276a909b272141119ce151647118725ce2e))

## [0.2.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.1.0...franken-types-v0.2.0) (2026-03-09)


### Features

* migrate to real monorepo with npm workspaces + Turborepo ([#96](https://github.com/djm204/frankenbeast/issues/96)) ([f2028b1](https://github.com/djm204/frankenbeast/commit/f2028b139003a6bc09df35d8904a53c0457d67cb))
