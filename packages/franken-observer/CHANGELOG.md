# Changelog

## [0.8.2](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.8.1...franken-observer-v0.8.2) (2026-07-15)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.11.0 to 0.12.0

## [0.8.1](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.8.0...franken-observer-v0.8.1) (2026-07-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.10.1 to 0.11.0

## [0.8.0](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.18...franken-observer-v0.8.0) (2026-07-14)


### Features

* **observer:** classify runtime artifacts ([#2235](https://github.com/djm204/frankenbeast/issues/2235)) ([ed2f803](https://github.com/djm204/frankenbeast/commit/ed2f803fec0aa19837c51a779c418135b947bed5))

## [0.7.18](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.17...franken-observer-v0.7.18) (2026-07-14)


### Bug Fixes

* **deps:** repair npm security and maintenance update ([4fd8ecc](https://github.com/djm204/frankenbeast/commit/4fd8eccf9b57960572d624aaa18ceac773fddcc0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.10.0 to 0.10.1

## [0.7.17](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.16...franken-observer-v0.7.17) (2026-07-14)


### Bug Fixes

* bound and redact error bodies ([de5b902](https://github.com/djm204/frankenbeast/commit/de5b902bb01c41caa2b7678bfbf2db99e2ddb00c))
* cap and sanitize webhook error bodies ([f9829b1](https://github.com/djm204/frankenbeast/commit/f9829b19a3222dcf5ab194cabfa76a45ff78251a))
* close remaining HTTP error body review gaps ([685727c](https://github.com/djm204/frankenbeast/commit/685727cba7b472380d1f6510d0ddce66581d430e))
* enrich HTTP error context ([681a32d](https://github.com/djm204/frankenbeast/commit/681a32d638c3b818389746cf220b331d57821e37))
* enrich HTTP error context ([79b5b40](https://github.com/djm204/frankenbeast/commit/79b5b4064d85b7d2037b30a6b90431cf893def94))
* **governor:** resolve root test suite merge drift ([29270d5](https://github.com/djm204/frankenbeast/commit/29270d533f252535ff122b422d60095a949e6aab))
* harden HTTP error body handling ([ba89762](https://github.com/djm204/frankenbeast/commit/ba8976259b36f86639c99382bf9da27ce9d12d8b))
* harden HTTP error redaction ([e244b16](https://github.com/djm204/frankenbeast/commit/e244b16c21faaa562ea52cd2c7c0ef019e9fca6b))
* **http:** scrub urls and cloned diagnostic streams ([62fb98c](https://github.com/djm204/frankenbeast/commit/62fb98c3d95a5514de2d96c97af14d96504ca0d8))
* **observer:** bound InMemoryAdapter trace retention ([#1969](https://github.com/djm204/frankenbeast/issues/1969)) ([e55ac66](https://github.com/djm204/frankenbeast/commit/e55ac66bec376f202f68784b56563bc59e65cac3))
* **observer:** bound webhook error body reads ([e78cd20](https://github.com/djm204/frankenbeast/commit/e78cd208471d115e6c602d2abb329b79e55bd3a3))
* **observer:** cancel exact-cap error body reads ([7e3e412](https://github.com/djm204/frankenbeast/commit/7e3e4123a2b00a9f951d35c24fd8b4c252d90780))
* **observer:** enforce webhook target allowlist ([0055ddb](https://github.com/djm204/frankenbeast/commit/0055ddba117a7fafcc07e68b4b374cf60dee8ef6))
* **observer:** validate attribution token counts ([#2009](https://github.com/djm204/frankenbeast/issues/2009)) ([d3cebf9](https://github.com/djm204/frankenbeast/commit/d3cebf9aa01f9667fc3152f2b01a84b0725be488))
* **observer:** validate HTTP retry count ([#2172](https://github.com/djm204/frankenbeast/issues/2172)) ([a7d01af](https://github.com/djm204/frankenbeast/commit/a7d01afc6fc198a5461dd602453e4e7bc19d9d97))
* **observer:** validate webhook retry bounds ([#2162](https://github.com/djm204/frankenbeast/issues/2162)) ([58782a9](https://github.com/djm204/frankenbeast/commit/58782a93adb286a8919c310b98954b966032a0b9))
* **observer:** validate webhook retry counts ([f8ab30d](https://github.com/djm204/frankenbeast/commit/f8ab30d90cb0e69f16886c37fb211e5ea6086a57)), closes [#2015](https://github.com/djm204/frankenbeast/issues/2015)
* **orchestrator:** close beast attempt cleanup issue ([#2003](https://github.com/djm204/frankenbeast/issues/2003)) ([ae34c42](https://github.com/djm204/frankenbeast/commit/ae34c42ecba98db09aa5b43c097d8ecf0819170e))
* redact auth data in HTTP errors ([69f5f05](https://github.com/djm204/frankenbeast/commit/69f5f0540bccb21ccf11b943ec43e598fa12095a))
* redact webhook error endpoints ([3de22b9](https://github.com/djm204/frankenbeast/commit/3de22b904ccedbb35a47dbd74b0ff1e2ba2c174b))


### Documentation

* **dx:** document Grafana observer env vars ([#2131](https://github.com/djm204/frankenbeast/issues/2131)) ([97c806b](https://github.com/djm204/frankenbeast/commit/97c806bb809dd04f79ac9d5f070e11e71d049c4c))
* **observer:** document Grafana env vars ([9caf363](https://github.com/djm204/frankenbeast/commit/9caf363b2f822860ac27563fbbf80252eab09bf2)), closes [#2130](https://github.com/djm204/frankenbeast/issues/2130)
* **observer:** document Langfuse environment variables ([#2185](https://github.com/djm204/frankenbeast/issues/2185)) ([9bb68ca](https://github.com/djm204/frankenbeast/commit/9bb68ca139e2d646ed4f0d16c19b133f8eae1ea0))


### Tests

* document webhook redaction edge cases ([6eb32c9](https://github.com/djm204/frankenbeast/commit/6eb32c9ff5427dc17501482b888487b6ce173bc9))
* **observer:** assert invalid replay refs skip blob reads ([#2054](https://github.com/djm204/frankenbeast/issues/2054)) ([ad36aea](https://github.com/djm204/frankenbeast/commit/ad36aea28093cb4342b0357dce69bd68862d9d88)), closes [#2052](https://github.com/djm204/frankenbeast/issues/2052)
* **observer:** cover missing audit hash content ([#2053](https://github.com/djm204/frankenbeast/issues/2053)) ([bb0064f](https://github.com/djm204/frankenbeast/commit/bb0064fd1e991ebefb0fd4d64b412f3f6292b3a0)), closes [#2048](https://github.com/djm204/frankenbeast/issues/2048)
* **observer:** cover missing rate limit header ([#2202](https://github.com/djm204/frankenbeast/issues/2202)) ([660d3d0](https://github.com/djm204/frankenbeast/commit/660d3d05e6bea29576452db693290b57de58ffd2))
* **observer:** document webhook async drain ([7dbf4ed](https://github.com/djm204/frankenbeast/commit/7dbf4ed27c1315663abc9fe6f0ed49a71a565c4e)), closes [#2155](https://github.com/djm204/frankenbeast/issues/2155)
* **observer:** isolate eval suite discovery ([#1972](https://github.com/djm204/frankenbeast/issues/1972)) ([19b217f](https://github.com/djm204/frankenbeast/commit/19b217f1784fa469ed7cd91488fda831f5299607)), closes [#1962](https://github.com/djm204/frankenbeast/issues/1962)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.9.0 to 0.10.0

## [0.7.16](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.15...franken-observer-v0.7.16) (2026-07-11)


### Bug Fixes

* **observer:** bound webhook retry jitter ([981938e](https://github.com/djm204/frankenbeast/commit/981938e796d4306a60e70267671b0e7a428a2d54))
* **observer:** clamp webhook retry jitter delay ([#1563](https://github.com/djm204/frankenbeast/issues/1563)) ([d3d802f](https://github.com/djm204/frankenbeast/commit/d3d802f734dd621a965ea6717f758e57c75dca47))
* **observer:** clone redacted spans before export ([6d62135](https://github.com/djm204/frankenbeast/commit/6d621352a63b24574a295a5861661bc5de44ade4))
* **observer:** cover empty Grafana dashboard UID derivation ([#1499](https://github.com/djm204/frankenbeast/issues/1499)) ([2db7ca6](https://github.com/djm204/frankenbeast/commit/2db7ca6f1f9151acb0a321fc2648224447db0a93))
* **observer:** fail audit verification for missing hashed content ([ed2975f](https://github.com/djm204/frankenbeast/commit/ed2975f8aa56de3af03a25ba2619093c51b5ac22)), closes [#1014](https://github.com/djm204/frankenbeast/issues/1014)
* **observer:** harden SQLite adapter database opens ([e809f8d](https://github.com/djm204/frankenbeast/commit/e809f8d901ef0de24ab18052c0554d7c23f4456e)), closes [#1025](https://github.com/djm204/frankenbeast/issues/1025)
* **observer:** isolate circuit breaker handler failures ([8d1ab97](https://github.com/djm204/frankenbeast/commit/8d1ab97a5160c2580ff9bb51d791bd295eaeda45))
* **observer:** isolate LoopDetector handler failures ([#1628](https://github.com/djm204/frankenbeast/issues/1628)) ([446ba1c](https://github.com/djm204/frankenbeast/commit/446ba1c4502efd93a8fe072fea34b079a3cbf865))
* **observer:** isolate multi adapter read failures ([4773bd1](https://github.com/djm204/frankenbeast/commit/4773bd1461999fdf0cee236f3ffc8b7548197779)), closes [#1188](https://github.com/djm204/frankenbeast/issues/1188)
* **observer:** make SpanRedactor regex rules stateless ([#1603](https://github.com/djm204/frankenbeast/issues/1603)) ([f3adcd1](https://github.com/djm204/frankenbeast/commit/f3adcd10ad3c793286baf8d3e5dda14955a8cce4))
* **observer:** protect AuditTrail immutable state ([#1635](https://github.com/djm204/frankenbeast/issues/1635)) ([4914dab](https://github.com/djm204/frankenbeast/commit/4914dab87467ff62611590701f48bf9d4652070a))
* **observer:** reject invalid replay timestamps ([c68da2c](https://github.com/djm204/frankenbeast/commit/c68da2c6423ca99170c8a804afbbae404291f67b)), closes [#1143](https://github.com/djm204/frankenbeast/issues/1143)
* **observer:** reject invalid TraceSampler numeric options ([1757c35](https://github.com/djm204/frankenbeast/commit/1757c3558e62a92388a8801b68fc7b7d95230de1)), closes [#1118](https://github.com/djm204/frankenbeast/issues/1118)
* **observer:** reject traces with active spans ([4a3a3b7](https://github.com/djm204/frankenbeast/commit/4a3a3b7dd5c9dc9ce3a07f6678e8a0a922b3f425)), closes [#1074](https://github.com/djm204/frankenbeast/issues/1074)
* **observer:** repair corrupt replay blobs atomically ([01b8ed2](https://github.com/djm204/frankenbeast/commit/01b8ed23c0e311a1ec17f3a63cf352a2bf0c4e1a))
* **observer:** sanitize tracestate parsing and formatting ([#1500](https://github.com/djm204/frankenbeast/issues/1500)) ([7df5c52](https://github.com/djm204/frankenbeast/commit/7df5c52bd1b25c8a3fbdaccff8d6fb9b18ac5f21))
* **observer:** snapshot in-memory traces ([#1630](https://github.com/djm204/frankenbeast/issues/1630)) ([3d193ca](https://github.com/djm204/frankenbeast/commit/3d193ca60287596bf3673e0ef6c3bf9fbcceb548))
* **observer:** tighten W3C traceparent validation ([c10882b](https://github.com/djm204/frankenbeast/commit/c10882bba677805abc53a129e7cfa8b6e428e7a0))
* **observer:** tolerate invalid post-mortem timestamps ([#1443](https://github.com/djm204/frankenbeast/issues/1443)) ([61c0060](https://github.com/djm204/frankenbeast/commit/61c0060cae7d97cc98b54403fd2e22c797d694b0))
* **observer:** validate BatchAdapter numeric options ([7385994](https://github.com/djm204/frankenbeast/commit/7385994b47d993720ee26569d503ebf2c6d0db4f)), closes [#1227](https://github.com/djm204/frankenbeast/issues/1227)
* **observer:** validate circuit breaker spend inputs ([b9764ee](https://github.com/djm204/frankenbeast/commit/b9764ee1aeff6b2d87eaaa87c25b88ccc8f43824)), closes [#1218](https://github.com/djm204/frankenbeast/issues/1218)
* **observer:** validate ModelAttribution token counts ([f3f6390](https://github.com/djm204/frankenbeast/commit/f3f6390bee0f637b872efa0b53f05df0329d3d04))
* **observer:** validate rate limit sampler maximum ([97d7d90](https://github.com/djm204/frankenbeast/commit/97d7d904813f3450779a467b45acda23ea62fe2c))
* **observer:** validate rate limit sampler windows ([a2279f5](https://github.com/djm204/frankenbeast/commit/a2279f5d8edb56f583d508542b775e6f9e6003e0)), closes [#1126](https://github.com/djm204/frankenbeast/issues/1126)
* **observer:** write audit trails atomically ([#1625](https://github.com/djm204/frankenbeast/issues/1625)) ([966521a](https://github.com/djm204/frankenbeast/commit/966521a41ac38f290c82abe1c6eaf1340acb4328))
* replace nondeterministic calls with deterministic utilities ([#1441](https://github.com/djm204/frankenbeast/issues/1441)) ([1585acf](https://github.com/djm204/frankenbeast/commit/1585acf39bb993b06d2b975045641ad662a44459))


### Miscellaneous

* **ci:** make workspace lint coverage explicit ([#1596](https://github.com/djm204/frankenbeast/issues/1596)) ([c1674ed](https://github.com/djm204/frankenbeast/commit/c1674ed69e460a9c7c14d8b7af2e4039edf174d8))
* **package:** normalize workspace metadata ([#1573](https://github.com/djm204/frankenbeast/issues/1573)) ([921c557](https://github.com/djm204/frankenbeast/commit/921c557e9f8392f1202f3fa2cdcc7952ffccd255))


### Documentation

* **observer:** avoid I/O in W3CTraceContext examples ([#1491](https://github.com/djm204/frankenbeast/issues/1491)) ([dbfeb1e](https://github.com/djm204/frankenbeast/commit/dbfeb1e87e4ebecff5ab33b0f6ff4bd3ddf189f6))
* **observer:** clarify ESM-only build output contract ([#1457](https://github.com/djm204/frankenbeast/issues/1457)) ([989824e](https://github.com/djm204/frankenbeast/commit/989824ef040473eb511296290f65f89f6c68ab45)), closes [#1453](https://github.com/djm204/frankenbeast/issues/1453)


### Tests

* add deterministic Vitest seed mode ([#1429](https://github.com/djm204/frankenbeast/issues/1429)) ([f12b497](https://github.com/djm204/frankenbeast/commit/f12b497a0662a1b519cbf07d442316c734dcc778))
* add workspace coverage task ([#1589](https://github.com/djm204/frankenbeast/issues/1589)) ([1934756](https://github.com/djm204/frankenbeast/commit/1934756851e520c033f2a43c5b440c8268662714)), closes [#948](https://github.com/djm204/frankenbeast/issues/948)
* **ci:** stabilize observer discovery smoke tests ([#1620](https://github.com/djm204/frankenbeast/issues/1620)) ([a2aac90](https://github.com/djm204/frankenbeast/commit/a2aac9023d9ea67319def8c65bb0e39a7b71d072))
* **observer:** avoid flaky setTimeout in circuit-breaker limit-not-reached test ([440ec02](https://github.com/djm204/frankenbeast/commit/440ec027c27aac747e337f871b12b1072dc3ea33)), closes [#1123](https://github.com/djm204/frankenbeast/issues/1123)
* **observer:** cover BatchAdapter failed drain retention ([0c3a926](https://github.com/djm204/frankenbeast/commit/0c3a926a1ba1bd8dca75a70f6cec07ee5a84e3c6))
* **observer:** fail on empty test discovery ([93e69c1](https://github.com/djm204/frankenbeast/commit/93e69c1adfe47c615d8eff328dd7c9380cb819c7))
* **observer:** run eval suite from eval script ([db1b238](https://github.com/djm204/frankenbeast/commit/db1b238107222cfd02ef332a86929557a402ed27)), closes [#1185](https://github.com/djm204/frankenbeast/issues/1185)
* **vitest:** parse suite env flags strictly ([#1658](https://github.com/djm204/frankenbeast/issues/1658)) ([e42e95e](https://github.com/djm204/frankenbeast/commit/e42e95e15e40a8b7ef14cb3cd7aa7c926c898b96))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.2 to 0.9.0

## [0.7.15](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.14...franken-observer-v0.7.15) (2026-07-10)


### Bug Fixes

* **mcp:** close Codex hook command quoting issue ([#1382](https://github.com/djm204/frankenbeast/issues/1382)) ([293c730](https://github.com/djm204/frankenbeast/commit/293c7301083883b56bb71e1eca19f1ddc4d23236)), closes [#1047](https://github.com/djm204/frankenbeast/issues/1047)
* **observer:** close cache follow-up findings ([#1310](https://github.com/djm204/frankenbeast/issues/1310)) ([df47845](https://github.com/djm204/frankenbeast/commit/df47845b48d9dcf06a149a3ff2f8064d82ec895b))
* **observer:** enforce GoldenTraceEval span order ([0845425](https://github.com/djm204/frankenbeast/commit/0845425cbd563533ea6ce5c544bf2d5f9c442b5f))
* **observer:** flush only new dirty spans ([#1297](https://github.com/djm204/frankenbeast/issues/1297)) ([136da1e](https://github.com/djm204/frankenbeast/commit/136da1ed41ed5e910829127793bc568b9c9b48b5))
* **observer:** reject invalid Prometheus token metadata ([fd2d70c](https://github.com/djm204/frankenbeast/commit/fd2d70c8d6a1343ab74b908ab7a2eff12d0b9fd4)), closes [#1224](https://github.com/djm204/frankenbeast/issues/1224)
* **observer:** report ADR rule exceptions by rule ([7f9362c](https://github.com/djm204/frankenbeast/commit/7f9362cf59955773371c56b3323b70499cac43b8))
* **observer:** sanitize non-finite OTEL numeric attributes ([b7c54a1](https://github.com/djm204/frankenbeast/commit/b7c54a1c790038f3f721d6ad28358797bc89d076)), closes [#1225](https://github.com/djm204/frankenbeast/issues/1225)
* **observer:** validate http retry bounds ([#1391](https://github.com/djm204/frankenbeast/issues/1391)) ([d7abdb5](https://github.com/djm204/frankenbeast/commit/d7abdb54ecb7aca009fc93737e7c194c9b94ebd9))
* **observer:** validate LLMJudgeEval scores ([4605c8d](https://github.com/djm204/frankenbeast/commit/4605c8dd34286beb02ea1db698b37b437278f581)), closes [#1221](https://github.com/djm204/frankenbeast/issues/1221)
* **observer:** validate LoopDetector numeric options ([#1401](https://github.com/djm204/frankenbeast/issues/1401)) ([0b926b7](https://github.com/djm204/frankenbeast/commit/0b926b7fa27e9fa4c19dbf2102c484548ce6e4df))
* **observer:** validate persisted audit trail shape ([#1402](https://github.com/djm204/frankenbeast/issues/1402)) ([255afb4](https://github.com/djm204/frankenbeast/commit/255afb4c320c27d0077817c866e09bd6bff1b5dd))
* **observer:** validate span lifecycle token counts ([#1387](https://github.com/djm204/frankenbeast/issues/1387)) ([5dda43e](https://github.com/djm204/frankenbeast/commit/5dda43ec559f895e231711402abd59a915f83b4b))
* **web:** resolve chat session syntax issue ([4ce15f7](https://github.com/djm204/frankenbeast/commit/4ce15f79ead878e53e9fe9ac10bd1d7943972dfd))


### Documentation

* **observer:** document ESM-only build outputs ([#1393](https://github.com/djm204/frankenbeast/issues/1393)) ([d1cad94](https://github.com/djm204/frankenbeast/commit/d1cad942471fd1eb5fca6a718f8b1a5dc256004a))
* **web:** fix operator token auth header markdown ([#1303](https://github.com/djm204/frankenbeast/issues/1303)) ([1449e26](https://github.com/djm204/frankenbeast/commit/1449e268c54bafb994d5034fec1ccfc312194d9e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.1 to 0.8.2

## [0.7.14](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.13...franken-observer-v0.7.14) (2026-07-08)


### Tests

* **ci:** exercise minimum supported Node version in CI ([#1057](https://github.com/djm204/frankenbeast/issues/1057)) ([26debe4](https://github.com/djm204/frankenbeast/commit/26debe4feb5221422680988a4a3bb1d112bb8adb))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.0 to 0.8.1

## [0.7.13](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.12...franken-observer-v0.7.13) (2026-07-08)


### Documentation

* refresh package project outlines ([#1145](https://github.com/djm204/frankenbeast/issues/1145)) ([390aefd](https://github.com/djm204/frankenbeast/commit/390aefdc5bd51da421d7f412d82ec781a8579cb0))


### Tests

* **observer:** cover replay blob symlink reads ([#897](https://github.com/djm204/frankenbeast/issues/897)) ([851417e](https://github.com/djm204/frankenbeast/commit/851417e53af4a639cb52963f3d06d869f6937034))

## [0.7.12](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.11...franken-observer-v0.7.12) (2026-07-07)


### Bug Fixes

* **observer:** bind trace server to loopback ([#837](https://github.com/djm204/frankenbeast/issues/837)) ([f0ab367](https://github.com/djm204/frankenbeast/commit/f0ab3678e197a77882ed7fe34c8071401b2e29a5))
* **observer:** contain post-mortem report paths ([b647be6](https://github.com/djm204/frankenbeast/commit/b647be6d53cc62167b48d12b4a34df888e873782))
* **observer:** hash trace ids in post-mortem filenames ([#874](https://github.com/djm204/frankenbeast/issues/874)) ([0aa2791](https://github.com/djm204/frankenbeast/commit/0aa27914af7fbafcf5e02ce53e39360e315f2501))
* **observer:** retain batch queue on drain failure ([#855](https://github.com/djm204/frankenbeast/issues/855)) ([ec0e505](https://github.com/djm204/frankenbeast/commit/ec0e5053e3747f9a873a0fd26364238c6e4e9c34))
* **observer:** set SQLite busy timeout ([50c5536](https://github.com/djm204/frankenbeast/commit/50c55361ed6515361707ce194c6e38b54fa94653))
* **security:** share realpath containment checks ([#875](https://github.com/djm204/frankenbeast/issues/875)) ([eb1ad94](https://github.com/djm204/frankenbeast/commit/eb1ad94736ead647df2f7840c0fad9555f86a73f))


### Refactoring

* **tests:** alias Vitest configs to package sources ([#845](https://github.com/djm204/frankenbeast/issues/845)) ([454b526](https://github.com/djm204/frankenbeast/commit/454b526e509d5762bde3ec5102d7521367f0c1a7))


### Tests

* externalize credential fixtures ([#910](https://github.com/djm204/frankenbeast/issues/910)) ([84ff583](https://github.com/djm204/frankenbeast/commit/84ff5830a23095a32339a1970a3e2d6d0a443dca)), closes [#519](https://github.com/djm204/frankenbeast/issues/519)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.7 to 0.8.0

## [0.7.11](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.10...franken-observer-v0.7.11) (2026-07-06)


### Bug Fixes

* **observer:** remove replay test mutator from production class ([#820](https://github.com/djm204/frankenbeast/issues/820)) ([f00094b](https://github.com/djm204/frankenbeast/commit/f00094b1464c0d80fdefa545f56e35bb084ce0d4))
* standardize package namespace strategy ([#825](https://github.com/djm204/frankenbeast/issues/825)) ([a2c236f](https://github.com/djm204/frankenbeast/commit/a2c236f9c7d46ab8fea079b85b3df3e4a7383e9b))

## [0.7.10](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.9...franken-observer-v0.7.10) (2026-07-06)


### Bug Fixes

* **observer:** optimize trace summaries ([#781](https://github.com/djm204/frankenbeast/issues/781)) ([447ef1c](https://github.com/djm204/frankenbeast/commit/447ef1c9041c6256ac64b3d25aba131f2c79eb9f))
* **observer:** validate replay content refs ([5f8c120](https://github.com/djm204/frankenbeast/commit/5f8c1201da8dee267486dde3f0ebb7799a0e4ff7)), closes [#618](https://github.com/djm204/frankenbeast/issues/618)
* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* replace console log statements ([#797](https://github.com/djm204/frankenbeast/issues/797)) ([ef5225f](https://github.com/djm204/frankenbeast/commit/ef5225f7e61196945d481ed40181f86aaea0f40d))
* **test:** validate Vitest environment flags ([1479dce](https://github.com/djm204/frankenbeast/commit/1479dcefc5bedfd065667fba75e2bd48b7a1ba5e)), closes [#557](https://github.com/djm204/frankenbeast/issues/557)


### Refactoring

* **observer:** unify content hashing and cache token totals ([#789](https://github.com/djm204/frankenbeast/issues/789)) ([0fe0c02](https://github.com/djm204/frankenbeast/commit/0fe0c02cf35d2f71b19436dbddef7d217f6e0a0e))


### Miscellaneous

* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* **packages:** align publishable package licenses ([#783](https://github.com/djm204/frankenbeast/issues/783)) ([398d37c](https://github.com/djm204/frankenbeast/commit/398d37c552954a94d08d90fce9ff76573b9ec664))


### Tests

* replace secret-looking fixture literals ([#787](https://github.com/djm204/frankenbeast/issues/787)) ([e9b5d8a](https://github.com/djm204/frankenbeast/commit/e9b5d8af10d7144290ce0e513658c3b41b8f9597))
* **security:** avoid password literals in fixtures ([#788](https://github.com/djm204/frankenbeast/issues/788)) ([f411648](https://github.com/djm204/frankenbeast/commit/f41164879b1b35152d7bdc02b5e83dd586dd2344))

## [0.7.9](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.8...franken-observer-v0.7.9) (2026-07-05)


### Bug Fixes

* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)

## [0.7.8](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.7...franken-observer-v0.7.8) (2026-07-04)


### Documentation

* fix package README drift (governor, observer, brain, critique) ([#527](https://github.com/djm204/frankenbeast/issues/527)) ([4afdd51](https://github.com/djm204/frankenbeast/commit/4afdd51f0852cfb934c6db1307e61afc98ee51c4))

## [0.7.7](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.6...franken-observer-v0.7.7) (2026-07-04)


### Bug Fixes

* **observer:** detect orphaned spans ([#484](https://github.com/djm204/frankenbeast/issues/484)) ([07d7814](https://github.com/djm204/frankenbeast/commit/07d7814cb4269e957f057a9008fc4e7e863301a5))

## [0.7.6](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.5...franken-observer-v0.7.6) (2026-07-03)


### Bug Fixes

* **observer:** sanitize audit run IDs against path traversal ([#449](https://github.com/djm204/frankenbeast/issues/449)) ([34fbe71](https://github.com/djm204/frankenbeast/commit/34fbe719dc0261b3dd55875ec1149c21e8afa2bb))

## [0.7.5](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.4...franken-observer-v0.7.5) (2026-07-01)


### Documentation

* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))

## [0.7.4](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.3...franken-observer-v0.7.4) (2026-06-28)


### Bug Fixes

* **franken-observer:** handle PostMortemGenerator file write errors gracefully ([#383](https://github.com/djm204/frankenbeast/issues/383)) ([7146e62](https://github.com/djm204/frankenbeast/commit/7146e626c49b8a20c510847d0f8f2a34843603b8)), closes [#72](https://github.com/djm204/frankenbeast/issues/72)
* **observer:** escape trace IDs in trace viewer to prevent XSS ([#382](https://github.com/djm204/frankenbeast/issues/382)) ([8662ef3](https://github.com/djm204/frankenbeast/commit/8662ef33505f724e7fff4f68d6e2d3f9caf2b01b))
* **observer:** validate audit trail run IDs before filesystem access ([#381](https://github.com/djm204/frankenbeast/issues/381)) ([4f486b7](https://github.com/djm204/frankenbeast/commit/4f486b7f987ef6fe3d346a1555f21c7bcc8e837a))

## [0.7.3](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.2...franken-observer-v0.7.3) (2026-06-28)


### Bug Fixes

* **observer,types:** guard token counters against overflow & bad input ([#341](https://github.com/djm204/frankenbeast/issues/341)) ([0a7c6b4](https://github.com/djm204/frankenbeast/commit/0a7c6b4852e959489fbb389971b56f0c64278e5b))
* **observer:** add bounded retry with backoff to HTTP export adapters ([#342](https://github.com/djm204/frankenbeast/issues/342)) ([a11f472](https://github.com/djm204/frankenbeast/commit/a11f472d957ea6a61e97b054bc5c6f166ac8e7cd))
* **observer:** fire CircuitBreaker handler on rising edge; add reset() ([#339](https://github.com/djm204/frankenbeast/issues/339)) ([0522411](https://github.com/djm204/frankenbeast/commit/052241139cf7fe4f009ca8ad4dcde2908ce5fdeb))
* **observer:** tolerate corrupt JSON columns in SQLiteAdapter reads ([#340](https://github.com/djm204/frankenbeast/issues/340)) ([343cf52](https://github.com/djm204/frankenbeast/commit/343cf52486b1b723f97141d07f8449ec69c8d880))

## [0.7.2](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.1...franken-observer-v0.7.2) (2026-06-09)


### Bug Fixes

* **observer:** detect varied loop patterns ([#313](https://github.com/djm204/frankenbeast/issues/313)) ([9411914](https://github.com/djm204/frankenbeast/commit/9411914488a2722649a98ba49b29deae1522cd2d))
* **observer:** escape Prometheus label values ([#310](https://github.com/djm204/frankenbeast/issues/310)) ([6b68825](https://github.com/djm204/frankenbeast/commit/6b688255c7fd2b06e28c38eedcf5cc81f631ae21))

## [0.7.1](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.7.0...franken-observer-v0.7.1) (2026-05-26)


### Bug Fixes

* **observer:** escape trace viewer template metacharacters ([#305](https://github.com/djm204/frankenbeast/issues/305)) ([5403809](https://github.com/djm204/frankenbeast/commit/54038093b36f9e4539f8910117a4837c50cfdd28))

## [0.7.0](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.6.0...franken-observer-v0.7.0) (2026-05-25)


### Features

* **observer:** durable audit replay ([#299](https://github.com/djm204/frankenbeast/issues/299)) ([34ddc5a](https://github.com/djm204/frankenbeast/commit/34ddc5aa6b17ac6ae87f714e1342a101d7ecd195))

## [0.6.0](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.5.0...franken-observer-v0.6.0) (2026-04-28)


### Features

* complete MCP launch chunks 1-5 and canonicalize .fbeast storage ([#279](https://github.com/djm204/frankenbeast/issues/279)) ([22c8ac3](https://github.com/djm204/frankenbeast/commit/22c8ac3ffea24c5a252ab466277ec63261d1ed2d))

## [0.5.0](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.4.3...franken-observer-v0.5.0) (2026-03-26)


### Features

* **observer:** add audit trail schema, replayer, persistence (Phase 7) ([6ffef1f](https://github.com/djm204/frankenbeast/commit/6ffef1ff67dfaa4fb6ac8f402036f1d22b871c92))
* Phase 7 — Observer Audit Trail ([ea50e97](https://github.com/djm204/frankenbeast/commit/ea50e97b7b4d88c3a0e7261be8d5b08bb630441e))


### Bug Fixes

* **observer:** handle empty string in audit event hashing and verification ([6acda86](https://github.com/djm204/frankenbeast/commit/6acda867229e737244368cf0f07d20e59c8378b4))

## [0.4.3](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.4.2...franken-observer-v0.4.3) (2026-03-15)


### Bug Fixes

* replace flaky setTimeout race with proper Promise in PostMortemGenerator E2E test ([49a4d7d](https://github.com/djm204/frankenbeast/commit/49a4d7df67fbe452679bdba59a085e8d4b570701))

## [0.4.2](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.4.1...franken-observer-v0.4.2) (2026-03-12)


### Bug Fixes

* **orchestrator:** make one-shot issues issue-aware and resumable ([09488cb](https://github.com/djm204/frankenbeast/commit/09488cb6f49ee2179ce9d2d0cfaff2f19cd1ef4f))

## [0.4.1](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.4.0...franken-observer-v0.4.1) (2026-03-12)


### Bug Fixes

* **orchestrator:** honor provider selection and fallback semantics ([abf1b77](https://github.com/djm204/frankenbeast/commit/abf1b776226e67257ec39e2d34cd359bc3e7eb95))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.3.2...franken-observer-v0.4.0) (2026-03-12)


### Features

* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))

## [0.3.2](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.3.1...franken-observer-v0.3.2) (2026-03-10)


### Bug Fixes

* **observer:** fix cost tracking and document implementation gaps ([7054989](https://github.com/djm204/frankenbeast/commit/7054989522894d5bd2429d71ef73d041e9599725))
* **observer:** fix zero-cost tracking and document implementation gaps ([c75c322](https://github.com/djm204/frankenbeast/commit/c75c322b46dc804873cff78c1ae8756104092cb7))

## [0.3.1](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.3.0...franken-observer-v0.3.1) (2026-03-09)


### Bug Fixes

* release-please scoping and commit hygiene ([742c7cc](https://github.com/djm204/frankenbeast/commit/742c7cc7792aac3f6f85ee638ba3b165de34bc5f))

## [0.3.0](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.2.0...franken-observer-v0.3.0) (2026-03-09)


### Features

* eslint configs, gitignore hygiene, CLI guard fix ([#99](https://github.com/djm204/frankenbeast/issues/99)) ([87d7427](https://github.com/djm204/frankenbeast/commit/87d74276a909b272141119ce151647118725ce2e))

## [0.2.0](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.1.0...franken-observer-v0.2.0) (2026-03-09)


### Features

* migrate to real monorepo with npm workspaces + Turborepo ([#96](https://github.com/djm204/frankenbeast/issues/96)) ([f2028b1](https://github.com/djm204/frankenbeast/commit/f2028b139003a6bc09df35d8904a53c0457d67cb))
