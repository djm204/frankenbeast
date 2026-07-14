# Changelog

## [0.8.1](https://github.com/djm204/frankenbeast/compare/@franken/brain-v0.8.0...@franken/brain-v0.8.1) (2026-07-14)


### Bug Fixes

* **deps:** repair npm security and maintenance update ([4fd8ecc](https://github.com/djm204/frankenbeast/commit/4fd8eccf9b57960572d624aaa18ceac773fddcc0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.10.0 to 0.10.1

## [0.8.0](https://github.com/djm204/frankenbeast/compare/@franken/brain-v0.7.5...@franken/brain-v0.8.0) (2026-07-14)


### Features

* **brain:** add memory schema migrations ([1b4b494](https://github.com/djm204/frankenbeast/commit/1b4b494f416edddc43520868569b04a19432d0e8)), closes [#1687](https://github.com/djm204/frankenbeast/issues/1687)
* **learning:** add episodic learning cooldown ([#1873](https://github.com/djm204/frankenbeast/issues/1873)) ([badbe7c](https://github.com/djm204/frankenbeast/commit/badbe7c61fccb95e4076ddf8e38b11d42120bf3b))
* **memory:** add encryption-at-rest option ([dda831d](https://github.com/djm204/frankenbeast/commit/dda831d368fc7a79f23f9ee1338bd0f50bc6d144))
* **memory:** add encryption-at-rest option ([63e875d](https://github.com/djm204/frankenbeast/commit/63e875dff7415c1afb360d0525e8a14a564e2596))


### Bug Fixes

* **lint:** require parseInt radix arguments ([023d526](https://github.com/djm204/frankenbeast/commit/023d526a400bc1cd4f2a71bb134b47d750ad7ac0))
* **memory:** address encryption review findings ([103f106](https://github.com/djm204/frankenbeast/commit/103f1064a73a7541a61d810c2ff5a9724f4943c5))
* **orchestrator:** close beast attempt cleanup issue ([#2003](https://github.com/djm204/frankenbeast/issues/2003)) ([ae34c42](https://github.com/djm204/frankenbeast/commit/ae34c42ecba98db09aa5b43c097d8ecf0819170e))


### Documentation

* **brain:** refresh ramp-up wiring status ([7f4276b](https://github.com/djm204/frankenbeast/commit/7f4276b2738567200bbb7a27978364449e698b92)), closes [#2101](https://github.com/djm204/frankenbeast/issues/2101)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.9.0 to 0.10.0

## [0.7.5](https://github.com/djm204/frankenbeast/compare/@franken/brain-v0.7.4...@franken/brain-v0.7.5) (2026-07-11)


### Bug Fixes

* **brain:** chunk episodic recall keyword queries ([3fad876](https://github.com/djm204/frankenbeast/commit/3fad876d5b981c034c63c35c578bc388a21cccc2)), closes [#1106](https://github.com/djm204/frankenbeast/issues/1106)
* **brain:** clone working memory reads ([#1610](https://github.com/djm204/frankenbeast/issues/1610)) ([b62eb1a](https://github.com/djm204/frankenbeast/commit/b62eb1a7c9172dbaa93d4ac0aaa60ae68ca94838))
* **brain:** handle circular working-memory serialization ([#1655](https://github.com/djm204/frankenbeast/issues/1655)) ([7753816](https://github.com/djm204/frankenbeast/commit/7753816c321150e4e0192bd3be63f093bd38cd08)), closes [#1050](https://github.com/djm204/frankenbeast/issues/1050)
* **brain:** reduce working memory flush writes ([#1609](https://github.com/djm204/frankenbeast/issues/1609)) ([271c159](https://github.com/djm204/frankenbeast/commit/271c159883a762659f290c9d5bf2abbe5c93bada))
* **brain:** replace hydrated sqlite snapshot rows ([b90e4de](https://github.com/djm204/frankenbeast/commit/b90e4de27fe5701cebebbc35cbeccb29be2e3fe7)), closes [#920](https://github.com/djm204/frankenbeast/issues/920)
* **brain:** tolerate corrupt persisted JSON rows ([#1662](https://github.com/djm204/frankenbeast/issues/1662)) ([1bee9b3](https://github.com/djm204/frankenbeast/commit/1bee9b3ce1797b8c03ccf666be87ddc357dd5668))
* replace nondeterministic calls with deterministic utilities ([#1441](https://github.com/djm204/frankenbeast/issues/1441)) ([1585acf](https://github.com/djm204/frankenbeast/commit/1585acf39bb993b06d2b975045641ad662a44459))


### Miscellaneous

* **package:** normalize workspace metadata ([#1573](https://github.com/djm204/frankenbeast/issues/1573)) ([921c557](https://github.com/djm204/frankenbeast/commit/921c557e9f8392f1202f3fa2cdcc7952ffccd255))


### Documentation

* align documented node requirement ([#1585](https://github.com/djm204/frankenbeast/issues/1585)) ([c3482d3](https://github.com/djm204/frankenbeast/commit/c3482d3330ac741ac022d7bb571e1bb530b2de3b))
* **brain:** document maintenance commands ([a3e993c](https://github.com/djm204/frankenbeast/commit/a3e993c7e3bcd5c7d513cac2591399b4b526353e))


### Tests

* add deterministic Vitest seed mode ([#1429](https://github.com/djm204/frankenbeast/issues/1429)) ([f12b497](https://github.com/djm204/frankenbeast/commit/f12b497a0662a1b519cbf07d442316c734dcc778))
* wire brain critique integration suites ([#1463](https://github.com/djm204/frankenbeast/issues/1463)) ([38c92ca](https://github.com/djm204/frankenbeast/commit/38c92ca67b652229954bf25b641e2f7206e894e8)), closes [#973](https://github.com/djm204/frankenbeast/issues/973)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.2 to 0.9.0

## [0.7.4](https://github.com/djm204/frankenbeast/compare/@franken/brain-v0.7.3...@franken/brain-v0.7.4) (2026-07-10)


### Bug Fixes

* **brain:** make checkpoints atomic with working-memory flush ([7eafa81](https://github.com/djm204/frankenbeast/commit/7eafa812cb8848c31defb02d0dbde7b44940a772)), closes [#939](https://github.com/djm204/frankenbeast/issues/939)
* **mcp:** close Codex hook command quoting issue ([#1382](https://github.com/djm204/frankenbeast/issues/1382)) ([293c730](https://github.com/djm204/frankenbeast/commit/293c7301083883b56bb71e1eca19f1ddc4d23236)), closes [#1047](https://github.com/djm204/frankenbeast/issues/1047)
* **web:** resolve chat session syntax issue ([4ce15f7](https://github.com/djm204/frankenbeast/commit/4ce15f79ead878e53e9fe9ac10bd1d7943972dfd))


### Performance

* **brain:** batch SqliteBrain hydrate writes ([5837ccb](https://github.com/djm204/frankenbeast/commit/5837ccb8886ce836f0655d6848a86874e28a1447)), closes [#940](https://github.com/djm204/frankenbeast/issues/940)


### Documentation

* **web:** fix operator token auth header markdown ([#1303](https://github.com/djm204/frankenbeast/issues/1303)) ([1449e26](https://github.com/djm204/frankenbeast/commit/1449e268c54bafb994d5034fec1ccfc312194d9e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.1 to 0.8.2

## [0.7.3](https://github.com/djm204/frankenbeast/compare/@franken/brain-v0.7.2...@franken/brain-v0.7.3) (2026-07-08)


### Tests

* **ci:** exercise minimum supported Node version in CI ([#1057](https://github.com/djm204/frankenbeast/issues/1057)) ([26debe4](https://github.com/djm204/frankenbeast/commit/26debe4feb5221422680988a4a3bb1d112bb8adb))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.0 to 0.8.1

## [0.7.2](https://github.com/djm204/frankenbeast/compare/@franken/brain-v0.7.1...@franken/brain-v0.7.2) (2026-07-08)


### Documentation

* refresh package project outlines ([#1145](https://github.com/djm204/frankenbeast/issues/1145)) ([390aefd](https://github.com/djm204/frankenbeast/commit/390aefdc5bd51da421d7f412d82ec781a8579cb0))

## [0.7.1](https://github.com/djm204/frankenbeast/compare/@franken/brain-v0.7.0...@franken/brain-v0.7.1) (2026-07-07)


### Bug Fixes

* **security:** share realpath containment checks ([#875](https://github.com/djm204/frankenbeast/issues/875)) ([eb1ad94](https://github.com/djm204/frankenbeast/commit/eb1ad94736ead647df2f7840c0fad9555f86a73f))


### Refactoring

* **tests:** alias Vitest configs to package sources ([#845](https://github.com/djm204/frankenbeast/issues/845)) ([454b526](https://github.com/djm204/frankenbeast/commit/454b526e509d5762bde3ec5102d7521367f0c1a7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.7 to 0.8.0

## [0.7.0](https://github.com/djm204/frankenbeast/compare/@franken/brain-v0.6.6...@franken/brain-v0.7.0) (2026-07-06)


### Features

* **brain:** add SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([11b7cf0](https://github.com/djm204/frankenbeast/commit/11b7cf0d97b541e0fe51cc66eb75d024259221d2))
* **brain:** implement keyword-based episodic recall with LIKE escaping (Phase 2.3) ([2935709](https://github.com/djm204/frankenbeast/commit/2935709650c5779371694f2a7baeccd4c776c78d))
* **brain:** keyword-based episodic recall (Phase 2.3) ([d122c58](https://github.com/djm204/frankenbeast/commit/d122c587a832065b1c38043843cea1b59f432a85))
* **brain:** SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([f933824](https://github.com/djm204/frankenbeast/commit/f93382433780009edb2d5f14eae8172769f29daa))
* close launch parity gaps ([#284](https://github.com/djm204/frankenbeast/issues/284)) ([7309143](https://github.com/djm204/frankenbeast/commit/7309143648bba36b0788c0b44446455c9a61821a))
* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))


### Bug Fixes

* **brain:** bound working memory growth with configurable limits ([#322](https://github.com/djm204/frankenbeast/issues/322)) ([08bd1e3](https://github.com/djm204/frankenbeast/commit/08bd1e3d942a5716435c0180961302d18f5c81c1))
* **brain:** flush working memory to SQLite on recovery checkpoint ([e4fab04](https://github.com/djm204/frankenbeast/commit/e4fab044a7ee30274c2b6287c6b83a1ebb904dfe))
* **brain:** hydrate sqlite working memory ([#478](https://github.com/djm204/frankenbeast/issues/478)) ([67ec25e](https://github.com/djm204/frankenbeast/commit/67ec25e6570f9ba8a0ac02208acea95d47206013))
* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)
* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* replace console log statements ([#797](https://github.com/djm204/frankenbeast/issues/797)) ([ef5225f](https://github.com/djm204/frankenbeast/commit/ef5225f7e61196945d481ed40181f86aaea0f40d))
* residual one-shots (comms cleanup, HITL test, checkpoint flush, PROGRESS.md) ([e105db3](https://github.com/djm204/frankenbeast/commit/e105db3fe067c6473d3f2a4bc43fc85756487018))
* standardize package namespace strategy ([#825](https://github.com/djm204/frankenbeast/issues/825)) ([a2c236f](https://github.com/djm204/frankenbeast/commit/a2c236f9c7d46ab8fea079b85b3df3e4a7383e9b))


### Refactoring

* **brain:** delete legacy episodic memory and types ([c627d6a](https://github.com/djm204/frankenbeast/commit/c627d6ae2e878f454dbbeacda32974c2d12ea393))
* **brain:** delete legacy episodic memory and types ([e620c62](https://github.com/djm204/frankenbeast/commit/e620c622d3fb25b338e5ce7e5417f82be61163d0))
* **brain:** delete old brain code, promote SqliteBrain (Phase 2.4) ([69ec240](https://github.com/djm204/frankenbeast/commit/69ec24042ca8229b71719e585aa75bf76b5acefd))
* **brain:** delete old brain code, promote SqliteBrain (Phase 2.4) ([080ae32](https://github.com/djm204/frankenbeast/commit/080ae3205bb1286d69a8decdd02a0873cc37ef19))


### Miscellaneous

* add architecture docs and update brain packaging ([38652e9](https://github.com/djm204/frankenbeast/commit/38652e967f4065c199c187650add570cebdaedea))
* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* **packages:** align publishable package licenses ([#783](https://github.com/djm204/frankenbeast/issues/783)) ([398d37c](https://github.com/djm204/frankenbeast/commit/398d37c552954a94d08d90fce9ff76573b9ec664))
* release main ([41acdbe](https://github.com/djm204/frankenbeast/commit/41acdbe09c990c38ade8209b3283b4405399dcda))
* release main ([19664bb](https://github.com/djm204/frankenbeast/commit/19664bb4baf0e8e0acb4c7042bcfee7f0799526b))
* release main ([29f20c7](https://github.com/djm204/frankenbeast/commit/29f20c74d7e5b0d5633188d1c6aa14eb189d0cc8))
* release main ([f388c96](https://github.com/djm204/frankenbeast/commit/f388c9636e6b34f63dde32314cfada9935a52370))
* release main ([d428ecd](https://github.com/djm204/frankenbeast/commit/d428ecd6e627d5c3c48cd0ef98c45a8eeca56d3e))
* release main ([55f726e](https://github.com/djm204/frankenbeast/commit/55f726e1af6e84f3401fd5ad14f452e7ac727f22))
* release main ([4ee81c5](https://github.com/djm204/frankenbeast/commit/4ee81c571b79f98e41e6b9531336b7781592e680))
* release main ([4e4ab4c](https://github.com/djm204/frankenbeast/commit/4e4ab4c4c7cde525fef815c057bae24f2c6b34c5))
* release main ([#285](https://github.com/djm204/frankenbeast/issues/285)) ([5544c28](https://github.com/djm204/frankenbeast/commit/5544c28d035c0d770e96890e54675a5260892e58))
* release main ([#337](https://github.com/djm204/frankenbeast/issues/337)) ([1f819ef](https://github.com/djm204/frankenbeast/commit/1f819ef9f239137df6977bfbe57442d256a1d2a6))
* release main ([#448](https://github.com/djm204/frankenbeast/issues/448)) ([8c9934f](https://github.com/djm204/frankenbeast/commit/8c9934f4adbd05b1ebae48081a3b3406746a1bc3))
* release main ([#482](https://github.com/djm204/frankenbeast/issues/482)) ([66f5641](https://github.com/djm204/frankenbeast/commit/66f56417de1252b572fba1f11db008c0a21a34df))
* release main ([#537](https://github.com/djm204/frankenbeast/issues/537)) ([41d70dd](https://github.com/djm204/frankenbeast/commit/41d70dde60bbbc0983702fc2ebfb63ee0528aa53))
* release main ([#554](https://github.com/djm204/frankenbeast/issues/554)) ([660250e](https://github.com/djm204/frankenbeast/commit/660250e5a21616955b05386eea741f17363c9198))
* release main ([#723](https://github.com/djm204/frankenbeast/issues/723)) ([767f8e2](https://github.com/djm204/frankenbeast/commit/767f8e2d347d1c4757db921e8689170f7fa9a9f1))


### Documentation

* fix package README drift (governor, observer, brain, critique) ([#527](https://github.com/djm204/frankenbeast/issues/527)) ([4afdd51](https://github.com/djm204/frankenbeast/commit/4afdd51f0852cfb934c6db1307e61afc98ee51c4))
* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))
* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))


### Tests

* delete 26 fluff test files (~283 tests) identified by audit ([03358d4](https://github.com/djm204/frankenbeast/commit/03358d4cdc745197e48b61855ed77571a37a2939))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.5 to 0.7.6

## [0.6.6](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.6.5...franken-brain-v0.6.6) (2026-07-06)


### Bug Fixes

* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* replace console log statements ([#797](https://github.com/djm204/frankenbeast/issues/797)) ([ef5225f](https://github.com/djm204/frankenbeast/commit/ef5225f7e61196945d481ed40181f86aaea0f40d))


### Miscellaneous

* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* **packages:** align publishable package licenses ([#783](https://github.com/djm204/frankenbeast/issues/783)) ([398d37c](https://github.com/djm204/frankenbeast/commit/398d37c552954a94d08d90fce9ff76573b9ec664))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.4 to 0.7.5

## [0.6.5](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.6.4...franken-brain-v0.6.5) (2026-07-05)


### Bug Fixes

* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)

## [0.6.4](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.6.3...franken-brain-v0.6.4) (2026-07-04)


### Documentation

* fix package README drift (governor, observer, brain, critique) ([#527](https://github.com/djm204/frankenbeast/issues/527)) ([4afdd51](https://github.com/djm204/frankenbeast/commit/4afdd51f0852cfb934c6db1307e61afc98ee51c4))

## [0.6.3](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.6.2...franken-brain-v0.6.3) (2026-07-04)


### Bug Fixes

* **brain:** hydrate sqlite working memory ([#478](https://github.com/djm204/frankenbeast/issues/478)) ([67ec25e](https://github.com/djm204/frankenbeast/commit/67ec25e6570f9ba8a0ac02208acea95d47206013))

## [0.6.2](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.6.1...franken-brain-v0.6.2) (2026-07-01)


### Documentation

* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))

## [0.6.1](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.6.0...franken-brain-v0.6.1) (2026-06-13)


### Bug Fixes

* **brain:** bound working memory growth with configurable limits ([#322](https://github.com/djm204/frankenbeast/issues/322)) ([08bd1e3](https://github.com/djm204/frankenbeast/commit/08bd1e3d942a5716435c0180961302d18f5c81c1))

## [0.6.0](https://github.com/djm204/frankenbeast/compare/franken-brain-v0.5.2...franken-brain-v0.6.0) (2026-04-28)


### Features

* close launch parity gaps ([#284](https://github.com/djm204/frankenbeast/issues/284)) ([7309143](https://github.com/djm204/frankenbeast/commit/7309143648bba36b0788c0b44446455c9a61821a))

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
