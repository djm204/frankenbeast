# Changelog

## [0.44.0](https://github.com/djm204/frankenbeast/compare/v0.43.1...v0.44.0) (2026-07-08)


### Features

* **credentials:** externalize test credential placeholders ([#909](https://github.com/djm204/frankenbeast/issues/909)) ([b50ae79](https://github.com/djm204/frankenbeast/commit/b50ae797be6cbb77ea092c1ab3c8e30ed5274555)), closes [#518](https://github.com/djm204/frankenbeast/issues/518)


### Miscellaneous

* **repo:** track code comment debt markers ([#1278](https://github.com/djm204/frankenbeast/issues/1278)) ([158e522](https://github.com/djm204/frankenbeast/commit/158e522e41199286af5ff7e9d17490aa6615f534)), closes [#1077](https://github.com/djm204/frankenbeast/issues/1077)


### Documentation

* **cli:** document plain banner env toggle ([739438f](https://github.com/djm204/frankenbeast/commit/739438fb103988a06f2756cd88bf6827c7497ff9)), closes [#1264](https://github.com/djm204/frankenbeast/issues/1264)
* **config:** document FRANKEN env overrides ([a818cc8](https://github.com/djm204/frankenbeast/commit/a818cc8cde8ee8d570ef01c0a5efd0f838a7a5a1)), closes [#1263](https://github.com/djm204/frankenbeast/issues/1263)
* document Gemini API env keys ([1e41b8e](https://github.com/djm204/frankenbeast/commit/1e41b8edfbf37319c1f718cfe34bebf40def99f3))

## [0.43.1](https://github.com/djm204/frankenbeast/compare/v0.43.0...v0.43.1) (2026-07-08)


### Bug Fixes

* harden Beast run config snapshot permissions ([#895](https://github.com/djm204/frankenbeast/issues/895)) ([2b681cf](https://github.com/djm204/frankenbeast/commit/2b681cf5b111e883aa31001a898820ae30bf18e1))
* **security:** pin Anthropic SDK override ([366972d](https://github.com/djm204/frankenbeast/commit/366972d6e386e7673ca059fd72614c67381be688)), closes [#587](https://github.com/djm204/frankenbeast/issues/587)


### Documentation

* record late codex follow-up lesson ([7efef5b](https://github.com/djm204/frankenbeast/commit/7efef5be68ff6a7c9da6a38e1552ccf96c9f0235))
* refresh README project tree guides description ([#1142](https://github.com/djm204/frankenbeast/issues/1142)) ([823e5f5](https://github.com/djm204/frankenbeast/commit/823e5f5bc840149aca0ea3dcb87ebe43a745a3fc))


### Tests

* **web:** guard dev-server dependency upgrades ([#1060](https://github.com/djm204/frankenbeast/issues/1060)) ([7921136](https://github.com/djm204/frankenbeast/commit/792113659ced632c44f6208f9120cd61fa7e6632))

## [0.43.0](https://github.com/djm204/frankenbeast/compare/v0.42.0...v0.43.0) (2026-07-07)


### Features

* **orchestrator:** execute ready tasks in parallel waves ([ef72620](https://github.com/djm204/frankenbeast/commit/ef726201c9153e08c5dea9079f6c1e2bb26d6f81)), closes [#497](https://github.com/djm204/frankenbeast/issues/497)


### Bug Fixes

* **cli:** make fbeast --help and -h exit cleanly ([a877043](https://github.com/djm204/frankenbeast/commit/a87704304cfe96f9fb1cdc5c9276038e0295ad37)), closes [#418](https://github.com/djm204/frankenbeast/issues/418)
* **compose:** pin local observability images ([0dd9c16](https://github.com/djm204/frankenbeast/commit/0dd9c1626c623abca1820ea79d0cd885de7e2290)), closes [#754](https://github.com/djm204/frankenbeast/issues/754)
* **critique:** ignore inert source text in evaluators ([#863](https://github.com/djm204/frankenbeast/issues/863)) ([99dbda1](https://github.com/djm204/frankenbeast/commit/99dbda1b9414200f9b54eb4394c09ea03531427e))
* **orchestrator:** log pr creator fallback errors ([#840](https://github.com/djm204/frankenbeast/issues/840)) ([e49fa8d](https://github.com/djm204/frankenbeast/commit/e49fa8dc89bac80440cf2aee3bd42407b6db2cb7))
* **orchestrator:** make sharp optional so the published CLI runs without it ([#854](https://github.com/djm204/frankenbeast/issues/854)) ([ff86b4a](https://github.com/djm204/frankenbeast/commit/ff86b4a0ef536b08791b55bc846bdeeeb7a0f970))
* **orchestrator:** release supervisor exit on inherited stdio ([#876](https://github.com/djm204/frankenbeast/issues/876)) ([5bc0134](https://github.com/djm204/frankenbeast/commit/5bc0134986365b378f8f03ccd3752c79442e7696))
* **orchestrator:** support init backend flag ([#869](https://github.com/djm204/frankenbeast/issues/869)) ([e9ea2bc](https://github.com/djm204/frankenbeast/commit/e9ea2bc263556ab757031de39bbff5ccd7e05d79))
* remove unsafe eval test fixtures in critique tests ([#906](https://github.com/djm204/frankenbeast/issues/906)) ([d0f13fc](https://github.com/djm204/frankenbeast/commit/d0f13fc2fed79a55040cd5a569444b6ee65f29e0))
* **security:** guard hard-coded example secrets ([#913](https://github.com/djm204/frankenbeast/issues/913)) ([fcecbab](https://github.com/djm204/frankenbeast/commit/fcecbabfa3b9c1a70dc96ce0a74a13ac1c07def9))
* **security:** pin protobufjs transitive dependency ([6377bc9](https://github.com/djm204/frankenbeast/commit/6377bc975c63184e55bd121cbb51e380c869216b)), closes [#585](https://github.com/djm204/frankenbeast/issues/585)
* **security:** share realpath containment checks ([#875](https://github.com/djm204/frankenbeast/issues/875)) ([eb1ad94](https://github.com/djm204/frankenbeast/commit/eb1ad94736ead647df2f7840c0fad9555f86a73f))


### Refactoring

* **tests:** alias Vitest configs to package sources ([#845](https://github.com/djm204/frankenbeast/issues/845)) ([454b526](https://github.com/djm204/frankenbeast/commit/454b526e509d5762bde3ec5102d7521367f0c1a7))
* **tests:** remove recursive Turbo verification ([#878](https://github.com/djm204/frankenbeast/issues/878)) ([cbfa80b](https://github.com/djm204/frankenbeast/commit/cbfa80bb515030c296f1ff1b1b9a13e5f39a53eb))


### Documentation

* clarify operator token header example ([#1122](https://github.com/djm204/frankenbeast/issues/1122)) ([13fa66e](https://github.com/djm204/frankenbeast/commit/13fa66e168aa9baacad25bb0ddf8ecb7d2da45d3))


### CI/CD

* add daily deterministic security scan (semgrep + gitleaks + npm audit) ([#826](https://github.com/djm204/frankenbeast/issues/826)) ([e868142](https://github.com/djm204/frankenbeast/commit/e8681424f5dfa121ec94d2ff519d7551c9050f62))
* add publish-smoke + workspace-dep guards to lock the boundary ([#860](https://github.com/djm204/frankenbeast/issues/860)) ([1e64b6f](https://github.com/djm204/frankenbeast/commit/1e64b6f65852302f416fac864748a47636c4f21a))


### Tests

* externalize credential fixtures ([#910](https://github.com/djm204/frankenbeast/issues/910)) ([84ff583](https://github.com/djm204/frankenbeast/commit/84ff5830a23095a32339a1970a3e2d6d0a443dca)), closes [#519](https://github.com/djm204/frankenbeast/issues/519)
* **release-please:** derive expected package list from filesystem glob ([#1056](https://github.com/djm204/frankenbeast/issues/1056)) ([c3bd130](https://github.com/djm204/frankenbeast/commit/c3bd130719af12f05706df89e9b877a998412ea3))

## [0.42.0](https://github.com/djm204/frankenbeast/compare/v0.41.1...v0.42.0) (2026-07-06)


### Features

* **orchestrator:** allow disabling PR creator branding ([91f6161](https://github.com/djm204/frankenbeast/commit/91f6161673a307fa06f520a457421541bbc5c19a))


### Bug Fixes

* **cli:** surface PR auth failures ([deb8df7](https://github.com/djm204/frankenbeast/commit/deb8df7f7c94a87b106d6729404591a4e0fae871)), closes [#746](https://github.com/djm204/frankenbeast/issues/746)
* **security:** require explicit Grafana credentials ([#822](https://github.com/djm204/frankenbeast/issues/822)) ([6fa7084](https://github.com/djm204/frankenbeast/commit/6fa7084a3f719a045a39fa066d6c4cf120baccd0))
* standardize package namespace strategy ([#825](https://github.com/djm204/frankenbeast/issues/825)) ([a2c236f](https://github.com/djm204/frankenbeast/commit/a2c236f9c7d46ab8fea079b85b3df3e4a7383e9b))
* validate pinned npm install executable ([#821](https://github.com/djm204/frankenbeast/issues/821)) ([0e710c9](https://github.com/djm204/frankenbeast/commit/0e710c9ad9be9e90d169a2c77b118386cdde6bee))


### Documentation

* **type-safety:** inventory explicit any migration plan ([7b01d89](https://github.com/djm204/frankenbeast/commit/7b01d89c70da2dfd07780cfcc244b70c2dc7ac86)), closes [#338](https://github.com/djm204/frankenbeast/issues/338)


### CI/CD

* enforce pinned npm package manager ([#811](https://github.com/djm204/frankenbeast/issues/811)) ([2881063](https://github.com/djm204/frankenbeast/commit/28810638142bea66c5146a0f8495d4a3a06b63a2))
* route security audits through pinned npm ([#829](https://github.com/djm204/frankenbeast/issues/829)) ([003c4d9](https://github.com/djm204/frankenbeast/commit/003c4d9d95671b835948b7abd4725eb265428a66))


### Tests

* **security:** cover npm audit dependency floors ([737e406](https://github.com/djm204/frankenbeast/commit/737e4065fa3d4b1072d2cb37c25f4a819c888b0f)), closes [#498](https://github.com/djm204/frankenbeast/issues/498)
* **security:** guard Turbo advisory floor ([#828](https://github.com/djm204/frankenbeast/issues/828)) ([3d1b054](https://github.com/djm204/frankenbeast/commit/3d1b0545265d88ccb37952809e3563ee355c4883))

## [0.41.1](https://github.com/djm204/frankenbeast/compare/v0.41.0...v0.41.1) (2026-07-06)


### Bug Fixes

* **cli:** surface non-interactive HITL remedy ([02d65d9](https://github.com/djm204/frankenbeast/commit/02d65d993e533df5bb001f06a57abb9dad657805)), closes [#748](https://github.com/djm204/frankenbeast/issues/748)
* **critique:** remove literal fixme markers ([#793](https://github.com/djm204/frankenbeast/issues/793)) ([d2f1e2d](https://github.com/djm204/frankenbeast/commit/d2f1e2d88c873a5f6733424b7f5810f41ba334f4))
* **orchestrator:** validate telegram webhook secret token ([#805](https://github.com/djm204/frankenbeast/issues/805)) ([b6c9cb5](https://github.com/djm204/frankenbeast/commit/b6c9cb5efbc6059e63eaf8356a573d8db8df341a))
* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* **release:** publish npm packages from releases ([#764](https://github.com/djm204/frankenbeast/issues/764)) ([e25ca62](https://github.com/djm204/frankenbeast/commit/e25ca62602289193297976ce92548c92930b67cf)), closes [#741](https://github.com/djm204/frankenbeast/issues/741)
* replace console log statements ([#797](https://github.com/djm204/frankenbeast/issues/797)) ([ef5225f](https://github.com/djm204/frankenbeast/commit/ef5225f7e61196945d481ed40181f86aaea0f40d))
* **repo:** remove literal todo markers ([ee3026b](https://github.com/djm204/frankenbeast/commit/ee3026ba9e8a753d378fd69818b2e4d868398f7f)), closes [#563](https://github.com/djm204/frankenbeast/issues/563)
* **runtime:** proxy chat-server when beast daemon is live ([#767](https://github.com/djm204/frankenbeast/issues/767)) ([7a1669a](https://github.com/djm204/frankenbeast/commit/7a1669a9f909356355bf7fb0df4ace468458bb98))
* **scripts:** update local setup checks for Chroma v2 ([d1e14c3](https://github.com/djm204/frankenbeast/commit/d1e14c3d3a90652eae491ec57aaa0a58e22efe2d))
* **security:** redact Telegram bot token URLs ([fdda455](https://github.com/djm204/frankenbeast/commit/fdda455f88d4f720f8221030857b1594f39482f1))
* **security:** reject non-loopback plaintext endpoints ([#733](https://github.com/djm204/frankenbeast/issues/733)) ([78741d1](https://github.com/djm204/frankenbeast/commit/78741d1c3c779e4baced6acd75190f36cb445435))
* **security:** remove Function usage ([#796](https://github.com/djm204/frankenbeast/issues/796)) ([b2f3c7f](https://github.com/djm204/frankenbeast/commit/b2f3c7f5199348c110056c7356d0b599f09b014b))
* serve dashboard from production build ([#775](https://github.com/djm204/frankenbeast/issues/775)) ([7a4f8ab](https://github.com/djm204/frankenbeast/commit/7a4f8ab272c5c3dc5d06749d90f86284c63629d6))
* **test:** centralize token literals ([606f2db](https://github.com/djm204/frankenbeast/commit/606f2db3059d9fe33874cf2a8355658395f700b5)), closes [#610](https://github.com/djm204/frankenbeast/issues/610)
* **test:** validate Vitest environment flags ([1479dce](https://github.com/djm204/frankenbeast/commit/1479dcefc5bedfd065667fba75e2bd48b7a1ba5e)), closes [#557](https://github.com/djm204/frankenbeast/issues/557)


### Miscellaneous

* **docs:** remove todo marker literals ([c960582](https://github.com/djm204/frankenbeast/commit/c960582583d30a91c883bd4de160127987f2cdf1)), closes [#594](https://github.com/djm204/frankenbeast/issues/594)
* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* **packages:** align publishable package licenses ([#783](https://github.com/djm204/frankenbeast/issues/783)) ([398d37c](https://github.com/djm204/frankenbeast/commit/398d37c552954a94d08d90fce9ff76573b9ec664))


### Documentation

* **env:** reconcile local environment example ([cf5f16b](https://github.com/djm204/frankenbeast/commit/cf5f16b2f9b207479f6e38c91d12774d55143cf9)), closes [#755](https://github.com/djm204/frankenbeast/issues/755)
* **mcp-suite:** align walkthrough with current behavior ([47f217f](https://github.com/djm204/frankenbeast/commit/47f217f822431d22bdfb09958cb9f9250052d611)), closes [#515](https://github.com/djm204/frankenbeast/issues/515)
* refresh agent ramp-up guidance ([de6861e](https://github.com/djm204/frankenbeast/commit/de6861eb115e6187deeb857d33c8cf5f72f393d1)), closes [#511](https://github.com/djm204/frankenbeast/issues/511)
* **tasks:** record Codex final-gate lesson ([6a288e9](https://github.com/djm204/frankenbeast/commit/6a288e96da7470e83f2c2d28d90abd6eb97f5ede))


### Tests

* **orchestrator:** cover live comms route mounting ([#765](https://github.com/djm204/frankenbeast/issues/765)) ([0779e89](https://github.com/djm204/frankenbeast/commit/0779e897f56a1cd4c0ae90fd161115513b856e30))
* replace secret-looking fixture literals ([#787](https://github.com/djm204/frankenbeast/issues/787)) ([e9b5d8a](https://github.com/djm204/frankenbeast/commit/e9b5d8af10d7144290ce0e513658c3b41b8f9597))
* **security:** cover exposed unsigned webhook startup guard ([#724](https://github.com/djm204/frankenbeast/issues/724)) ([5f2b2c1](https://github.com/djm204/frankenbeast/commit/5f2b2c1096140a1b125f017f3b73314308d0a503))
* **security:** remove dynamic eval fixture from e2e beast loop ([bfb0ea0](https://github.com/djm204/frankenbeast/commit/bfb0ea0ca077a6faaa9d709ade1500e3e87ace9c)), closes [#556](https://github.com/djm204/frankenbeast/issues/556)
* **security:** remove eval fixtures from tests ([f222ef9](https://github.com/djm204/frankenbeast/commit/f222ef91bc6468fea4c33eee83d9b3dba75d9403)), closes [#559](https://github.com/djm204/frankenbeast/issues/559)

## [0.41.0](https://github.com/djm204/frankenbeast/compare/v0.40.5...v0.41.0) (2026-07-05)


### Features

* **orchestrator:** wire execution recovery loop ([#553](https://github.com/djm204/frankenbeast/issues/553)) ([099067f](https://github.com/djm204/frankenbeast/commit/099067faa067414763b83376501fd87722ef0da9))


### Bug Fixes

* **config:** harden insecure defaults ([5abc7f9](https://github.com/djm204/frankenbeast/commit/5abc7f9c51477706ab6246116d44116645b363af)), closes [#522](https://github.com/djm204/frankenbeast/issues/522)
* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)
* **governor:** construct real trigger contexts and make denied decisions reachable ([#581](https://github.com/djm204/frankenbeast/issues/581)) ([0b638eb](https://github.com/djm204/frankenbeast/commit/0b638ebe42776b13360c45b4d07f4fd9088d2747)), closes [#490](https://github.com/djm204/frankenbeast/issues/490) [#491](https://github.com/djm204/frankenbeast/issues/491)
* **security:** enforce safe ws dependency floor ([#717](https://github.com/djm204/frankenbeast/issues/717)) ([2f07779](https://github.com/djm204/frankenbeast/commit/2f077799694440aae0fcb32f1ea0e4af1915f7d7))
* **security:** harden Hono CORS handling ([00a0d2b](https://github.com/djm204/frankenbeast/commit/00a0d2bbcb66121d343b3b3143c4253765a84ffe)), closes [#583](https://github.com/djm204/frankenbeast/issues/583)
* **web:** add recoverable app shell error state ([#663](https://github.com/djm204/frankenbeast/issues/663)) ([5bd7a9b](https://github.com/djm204/frankenbeast/commit/5bd7a9be1ddf3aacc3ed91edd38cc2846d7f8314))
* **web:** announce create agent launch state ([#693](https://github.com/djm204/frankenbeast/issues/693)) ([d9bfb7d](https://github.com/djm204/frankenbeast/commit/d9bfb7d187afc2c1eca628c64df7dac76efd6b75))
* **web:** associate beast dispatch errors with fields ([e3bd5dc](https://github.com/djm204/frankenbeast/commit/e3bd5dc27d964736dfcf4fffc0c8afdc00d74b22)), closes [#659](https://github.com/djm204/frankenbeast/issues/659)
* **web:** confirm destructive beast actions ([#705](https://github.com/djm204/frankenbeast/issues/705)) ([fca2e3e](https://github.com/djm204/frankenbeast/commit/fca2e3e44441405faff987f9849a425f97861d7f))
* **web:** explain disabled composer states ([#710](https://github.com/djm204/frankenbeast/issues/710)) ([79a2d0d](https://github.com/djm204/frankenbeast/commit/79a2d0dd724b5d075d45ec57ebd7534e2365fe80))
* **web:** guard disabled composer submissions ([39ffec9](https://github.com/djm204/frankenbeast/commit/39ffec9f5238b527a02473733d9a199eb1ae257e)), closes [#651](https://github.com/djm204/frankenbeast/issues/651)
* **web:** improve approval pending UX ([397aad6](https://github.com/djm204/frankenbeast/commit/397aad66ed038e7329447866e54c327c73952e3b)), closes [#654](https://github.com/djm204/frankenbeast/issues/654)
* **web:** keep chat bearer auth server-side ([#667](https://github.com/djm204/frankenbeast/issues/667)) ([6356ecf](https://github.com/djm204/frankenbeast/commit/6356ecf582e3238ea478b9daa698cdad9e7f6342))
* **web:** keep control-plane operator token server-side ([#666](https://github.com/djm204/frankenbeast/issues/666)) ([d201851](https://github.com/djm204/frankenbeast/commit/d201851f14b35d1388acf4ecf67b872d719559fb))
* **web:** make analytics events keyboard-accessible ([d14911f](https://github.com/djm204/frankenbeast/commit/d14911f3c7d0e6c278c030b67f87c38efa00df91)), closes [#631](https://github.com/djm204/frankenbeast/issues/631)
* **web:** remove duplicate review launch action ([d1b559c](https://github.com/djm204/frankenbeast/commit/d1b559ccd45078ef4385e62b571c7dada4dab358)), closes [#662](https://github.com/djm204/frankenbeast/issues/662)
* **web:** remove operator token from frontend bundle ([fc1b8f5](https://github.com/djm204/frankenbeast/commit/fc1b8f5f7874488440b5755d4f71e8d6dd0774f1)), closes [#566](https://github.com/djm204/frankenbeast/issues/566)
* **web:** show actionable chat error banners ([#695](https://github.com/djm204/frankenbeast/issues/695)) ([b2a48c6](https://github.com/djm204/frankenbeast/commit/b2a48c6af4578a0df264336c90b7e5ea333ca115))
* **web:** validate create agent wizard steps ([#706](https://github.com/djm204/frankenbeast/issues/706)) ([54869bb](https://github.com/djm204/frankenbeast/commit/54869bb0a52715a53621a08c478aad0032f43a57))


### Documentation

* clarify unwired beast loop architecture ([#550](https://github.com/djm204/frankenbeast/issues/550)) ([dc4f523](https://github.com/djm204/frankenbeast/commit/dc4f523338ee193c7126c00327f4551b5450e924))
* reconcile PROGRESS, issue index, audits, and .env.example with reality ([#646](https://github.com/djm204/frankenbeast/issues/646)) ([fc817f5](https://github.com/djm204/frankenbeast/commit/fc817f57bfc7e6cd474638bf1fb9afccd6544083))
* record create agent wizard validation lesson ([#709](https://github.com/djm204/frankenbeast/issues/709)) ([430b4da](https://github.com/djm204/frankenbeast/commit/430b4dac4a788cc7ea54bba663aab8d80975867f))


### Tests

* **security:** guard Vitest toolchain floor ([d0f5ef3](https://github.com/djm204/frankenbeast/commit/d0f5ef3361a9fbe4695a430f7a250456118ad0b7)), closes [#582](https://github.com/djm204/frankenbeast/issues/582)

## [0.40.5](https://github.com/djm204/frankenbeast/compare/v0.40.4...v0.40.5) (2026-07-04)


### Bug Fixes

* **mcp-suite:** drop never-used skill_state table from shared schema ([#546](https://github.com/djm204/frankenbeast/issues/546)) ([959ee17](https://github.com/djm204/frankenbeast/commit/959ee170356252336bf94a23243097df4f01f353)), closes [#493](https://github.com/djm204/frankenbeast/issues/493)
* **orchestrator:** allow dashboard CORS origins ([59cf742](https://github.com/djm204/frankenbeast/commit/59cf7422d6e543c6b5e56589336303152611d071))
* **web:** add analytics event pagination controls ([#534](https://github.com/djm204/frankenbeast/issues/534)) ([0ae15e8](https://github.com/djm204/frankenbeast/commit/0ae15e8d569e99a8357dfc9f53434dbfa18cc4c2))
* **web:** fall back to REST for approvals ([#479](https://github.com/djm204/frankenbeast/issues/479)) ([3ac7f74](https://github.com/djm204/frankenbeast/commit/3ac7f74384328418a483fc9a2e4fb8837d87a380))
* **web:** persist agent detail edits ([#533](https://github.com/djm204/frankenbeast/issues/533)) ([de88101](https://github.com/djm204/frankenbeast/commit/de88101a2fcf9514c9785dee931177d098dd95ef))
* **web:** wire Network page log fetching ([#532](https://github.com/djm204/frankenbeast/issues/532)) ([49051bd](https://github.com/djm204/frankenbeast/commit/49051bde6a4531c2d5d6439f596f1736e4d98b90))


### Documentation

* correct architecture docs to match real local-CLI wiring and contracts ([4a8cded](https://github.com/djm204/frankenbeast/commit/4a8cdede52dfb54ce5e0beadd76b36f63031e16e))

## [0.40.4](https://github.com/djm204/frankenbeast/compare/v0.40.3...v0.40.4) (2026-07-04)


### Bug Fixes

* **network:** track in-process comms gateway ([#487](https://github.com/djm204/frankenbeast/issues/487)) ([b3d7a3b](https://github.com/djm204/frankenbeast/commit/b3d7a3be68dabbfcf3ff6e967ab73b4c0d29677f))


### Documentation

* align CLAUDE.md monorepo layout and README secret-backend docs with reality ([#528](https://github.com/djm204/frankenbeast/issues/528)) ([9729137](https://github.com/djm204/frankenbeast/commit/97291374833d7312c43155861a1c4b960b3fb737))

## [0.40.3](https://github.com/djm204/frankenbeast/compare/v0.40.2...v0.40.3) (2026-07-04)


### Bug Fixes

* **api:** share web DTO contracts ([#544](https://github.com/djm204/frankenbeast/issues/544)) ([ec1e29a](https://github.com/djm204/frankenbeast/commit/ec1e29ae21bed03d156f0a58c0f27964566e5e80))
* **cli:** split runnable skill add from scaffold ([b1394aa](https://github.com/djm204/frankenbeast/commit/b1394aa4a4578535dd7b0876e32e58f8564af521)), closes [#404](https://github.com/djm204/frankenbeast/issues/404)
* **mcp:** render init validation errors cleanly ([#535](https://github.com/djm204/frankenbeast/issues/535)) ([ba6dd5c](https://github.com/djm204/frankenbeast/commit/ba6dd5c93e7b0fd345d2b81dca05d61922d79912))
* **web:** sync network config editor ([#538](https://github.com/djm204/frankenbeast/issues/538)) ([55fcfe3](https://github.com/djm204/frankenbeast/commit/55fcfe38702c11a9e86b46b5ff048e1fd6252a87))

## [0.40.2](https://github.com/djm204/frankenbeast/compare/v0.40.1...v0.40.2) (2026-07-04)


### Bug Fixes

* **mcp-memory:** align frontload scope contract ([#523](https://github.com/djm204/frankenbeast/issues/523)) ([bf85b30](https://github.com/djm204/frankenbeast/commit/bf85b30a79d77aa742881eca5b8047fe50ca3bfd))

## [0.40.1](https://github.com/djm204/frankenbeast/compare/v0.40.0...v0.40.1) (2026-07-04)


### Bug Fixes

* **mcp:** label planner scaffold provenance ([#485](https://github.com/djm204/frankenbeast/issues/485)) ([aa4cf8e](https://github.com/djm204/frankenbeast/commit/aa4cf8ed7eb9d14d746f296fc52dbe1a454a5f75))

## [0.40.0](https://github.com/djm204/frankenbeast/compare/v0.39.0...v0.40.0) (2026-07-03)


### Features

* **orchestrator:** add standalone beast daemon ([#477](https://github.com/djm204/frankenbeast/issues/477)) ([6b770a4](https://github.com/djm204/frankenbeast/commit/6b770a48f33d05e0c91a9b32800499e95049ade1))
* **web:** add beast execution mode selection ([#469](https://github.com/djm204/frankenbeast/issues/469)) ([be44a79](https://github.com/djm204/frankenbeast/commit/be44a79b26d8c8dd2fcef0626e42541d78d6736d))


### Bug Fixes

* address codex sandbox and route follow-ups ([cda3cce](https://github.com/djm204/frankenbeast/commit/cda3ccec1ae728ec75f38bdb93069245bdcf8bd9))
* **mcp-suite:** audit MCP tool execution ([#445](https://github.com/djm204/frankenbeast/issues/445)) ([23a1e08](https://github.com/djm204/frankenbeast/commit/23a1e086e0d0f697fe2120ca7df204f51206e50e))
* **mcp-suite:** bind proxy firewall to project root ([#444](https://github.com/djm204/frankenbeast/issues/444)) ([c2592c0](https://github.com/djm204/frankenbeast/commit/c2592c000f4ec19ee37774efaa5c42846e87eb01))
* **mcp-suite:** enforce governance centrally in MCP dispatch ([#391](https://github.com/djm204/frankenbeast/issues/391)) ([2bcaa6e](https://github.com/djm204/frankenbeast/commit/2bcaa6ede4dc16044cbacd7d32a14bbfdda2c1d6))
* **mcp-suite:** pass tool payload to governor; fail closed on timeout/empty tool ([#397](https://github.com/djm204/frankenbeast/issues/397)) ([d5736ed](https://github.com/djm204/frankenbeast/commit/d5736edf116d070fae9c38042c961cf15006a350))
* **orchestrator:** mark container workspaces git-safe ([#476](https://github.com/djm204/frankenbeast/issues/476)) ([c6fb6a8](https://github.com/djm204/frankenbeast/commit/c6fb6a892748b077443a1f1c924324d19124f348))
* **web:** wire dashboard Kill action to a real agent/run endpoint ([#450](https://github.com/djm204/frankenbeast/issues/450)) ([562ffad](https://github.com/djm204/frankenbeast/commit/562ffad0661821d7be53ce3d93dbb673b40262a5))

## [0.39.0](https://github.com/djm204/frankenbeast/compare/v0.38.5...v0.39.0) (2026-07-01)


### Features

* add beast dashboard resume and path controls ([500999f](https://github.com/djm204/frankenbeast/commit/500999f8404ef680616341136cbe5c4eeef4fe10))
* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))
* add fbeast MCP suite — modular MCP servers for Claude Code ([#278](https://github.com/djm204/frankenbeast/issues/278)) ([116266b](https://github.com/djm204/frankenbeast/commit/116266b7a60f0d80d7e58661ba1325716ec6c18e))
* add init config wizard ([9129b73](https://github.com/djm204/frankenbeast/commit/9129b736bf0d0fd79a9089dab9eebe6178b1ff4d))
* add module toggle UI to beast dispatch dashboard ([98e9dba](https://github.com/djm204/frankenbeast/commit/98e9dbaf41142cc16df71dda34776a4db96200f3))
* add module toggle UI to beast dispatch dashboard ([c13a1a3](https://github.com/djm204/frankenbeast/commit/c13a1a34849b67b0f1a41c59cba749ee291a7d59))
* add skill directory equivalents for beast definitions ([789b567](https://github.com/djm204/frankenbeast/commit/789b567207768e639d6f4cc9c9ef5bcf95882566))
* add skill directory equivalents for beast definitions ([b63d31f](https://github.com/djm204/frankenbeast/commit/b63d31fbbfd5108e2c22207a62a6d46fb2160040))
* add tracked agent dashboard controls ([0f9b4db](https://github.com/djm204/frankenbeast/commit/0f9b4db305950ccdd1580fee28d8ba1ee751d9ee))
* add tracked agent dashboard controls ([fb13aa7](https://github.com/djm204/frankenbeast/commit/fb13aa740788a9ec7b81066d732318ce5314efb7))
* add tracked agent foundations ([4073878](https://github.com/djm204/frankenbeast/commit/407387806cb8972b2115e6aef489df02bf3c07fe))
* **brain:** add SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([11b7cf0](https://github.com/djm204/frankenbeast/commit/11b7cf0d97b541e0fe51cc66eb75d024259221d2))
* **brain:** SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([f933824](https://github.com/djm204/frankenbeast/commit/f93382433780009edb2d5f14eae8172769f29daa))
* **cli:** add franken and frkn as CLI aliases ([b651cd5](https://github.com/djm204/frankenbeast/commit/b651cd543408ba2e574f3da236d3c75d4354f2f5))
* close launch parity gaps ([#284](https://github.com/djm204/frankenbeast/issues/284)) ([7309143](https://github.com/djm204/frankenbeast/commit/7309143648bba36b0788c0b44446455c9a61821a))
* complete dual-mode launch chunks 6-8 and fix adapter wrapping ([#282](https://github.com/djm204/frankenbeast/issues/282)) ([b86792d](https://github.com/djm204/frankenbeast/commit/b86792dac542751035d676230e7481238329a974))
* complete MCP launch chunks 1-5 and canonicalize .fbeast storage ([#279](https://github.com/djm204/frankenbeast/issues/279)) ([22c8ac3](https://github.com/djm204/frankenbeast/commit/22c8ac3ffea24c5a252ab466277ec63261d1ed2d))
* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))
* dashboard SSE routes and web UI panels ([0c8c8e0](https://github.com/djm204/frankenbeast/commit/0c8c8e0520be173cd921edda6c424cc41e7b1292))
* **franken-orchestrator:** add intelligent LLM caching ([c00307c](https://github.com/djm204/frankenbeast/commit/c00307c91c7612f38aa86962f07d04e7feec6b61))
* **franken-orchestrator:** cache repeated planning and issue prompts ([89b3591](https://github.com/djm204/frankenbeast/commit/89b3591b3b92213f14129f60d4cce3b40b15b941))
* implement tracked agent init workflow ([366cc75](https://github.com/djm204/frankenbeast/commit/366cc756338774124ee5a4928a9ff451efec3bbd))
* launch tracked agents from the dashboard ([fa33f0e](https://github.com/djm204/frankenbeast/commit/fa33f0e2b18fecd2e16fb5e0b26b57063da57bb6))
* **live-bench:** add benchmark foundation ([#300](https://github.com/djm204/frankenbeast/issues/300)) ([1203826](https://github.com/djm204/frankenbeast/commit/12038267bff530fa805e0904efaff4efc340d6be))
* **live-bench:** provision isolated benchmark workspaces ([#301](https://github.com/djm204/frankenbeast/issues/301)) ([74a7969](https://github.com/djm204/frankenbeast/commit/74a7969e822421017de48e60b21dbee109d82fc1))
* **mcp-suite:** make fbeast a 1:1 proxy for frankenbeast ([#289](https://github.com/djm204/frankenbeast/issues/289)) ([84470d6](https://github.com/djm204/frankenbeast/commit/84470d68b60fa23b9f9e70f4881666cec37d1a72))
* **observer:** durable audit replay ([#299](https://github.com/djm204/frankenbeast/issues/299)) ([34ddc5a](https://github.com/djm204/frankenbeast/commit/34ddc5aa6b17ac6ae87f714e1342a101d7ecd195))
* **orchestrator:** add 6 provider adapters + shared handoff (Phase 3.3-3.8) ([58f5f10](https://github.com/djm204/frankenbeast/commit/58f5f1016a644160046d7cc38e3c147d2cde76a1))
* **orchestrator:** add CLI container beast mode ([0178c1d](https://github.com/djm204/frankenbeast/commit/0178c1d8f5fde156bec747b032a36cd49736e251))
* **orchestrator:** beast mode hardening — explicit resume, fail-closed deps, verification matrix ([#292](https://github.com/djm204/frankenbeast/issues/292)) ([c0dd018](https://github.com/djm204/frankenbeast/commit/c0dd01899fd429e4b80bfb85218f0f98890cc136))
* **orchestrator:** harden sandbox container execution ([849d87c](https://github.com/djm204/frankenbeast/commit/849d87ceb27377736af98ebfd26950ea108426af))
* **orchestrator:** last-mile wiring — activate consolidation components in production runtime ([#275](https://github.com/djm204/frankenbeast/issues/275)) ([d318813](https://github.com/djm204/frankenbeast/commit/d318813518c99aede74aedc3ed9c4577cec114f4))
* **orchestrator:** support upstream repo targeting for issues ([414b7e1](https://github.com/djm204/frankenbeast/commit/414b7e1c33e5762c5966b55d05932ef02ba2fe3a))
* **orchestrator:** support upstream repo targeting for issues ([20d0585](https://github.com/djm204/frankenbeast/commit/20d058503589bdf940b4cbc497b5e22ec3310fe8))
* **orchestrator:** unify issue pipeline with BeastLoop and optimize context window ([ffa6299](https://github.com/djm204/frankenbeast/commit/ffa6299f446663cc724da6311467824d75bed0c5))
* **orchestrator:** wire container chat dispatch ([#468](https://github.com/djm204/frankenbeast/issues/468)) ([94d0f5e](https://github.com/djm204/frankenbeast/commit/94d0f5e7a55a09e8aa540ce0f9832b975af2e9de))
* Phase 3 — Provider Registry + Adapters ([0ceb582](https://github.com/djm204/frankenbeast/commit/0ceb582f95a7ac7cac877adeb6b08bbe4aa9efd1))
* Phase 4 — Security Middleware ([2f4112b](https://github.com/djm204/frankenbeast/commit/2f4112bac8f0d8940ef141f64c7229c397535eea))
* Phase 4.5 — Comms Integration ([a3e8053](https://github.com/djm204/frankenbeast/commit/a3e80537a5e1413aab5cedd976c9d6724e796266))
* Phase 5 — Skill Loading ([bc99631](https://github.com/djm204/frankenbeast/commit/bc99631f27cd2ea1b4072e19998b3fc89eb389b0))
* Phase 6 — Absorb Reflection into Critique ([82ac47d](https://github.com/djm204/frankenbeast/commit/82ac47d6a67763a622f2d24058e6c30dbe989c46))
* Phase 7 — Observer Audit Trail ([ea50e97](https://github.com/djm204/frankenbeast/commit/ea50e97b7b4d88c3a0e7261be8d5b08bb630441e))
* Phase 8 — Wire Everything Together (Core) ([12d5293](https://github.com/djm204/frankenbeast/commit/12d52933d8ac27d5b2d46a24229fc94cf3c8c7d9))
* Plan 1 — Foundation Execution Pipeline ([bc4cc63](https://github.com/djm204/frankenbeast/commit/bc4cc63b958dfe1d9763056f69b5495b7272b73e))
* secret store with 4 pluggable backends ([f05846f](https://github.com/djm204/frankenbeast/commit/f05846f70dbc6b6815ae4568c829d9eedc0a1670))
* **types:** add brain interfaces and BrainSnapshot types (Phase 2.1) ([5167997](https://github.com/djm204/frankenbeast/commit/5167997c99954fd37d66822ad8efb87913f0b432))
* **types:** brain interfaces + BrainSnapshot types (Phase 2.1) ([f2ed2fd](https://github.com/djm204/frankenbeast/commit/f2ed2fd52257c8fc44f1005bddc924af16d24177))
* **web:** add AgentActionBar with force restart AlertDialog ([38be1e7](https://github.com/djm204/frankenbeast/commit/38be1e7e156d4bd3f2cfa33300d21065d7435574))
* **web:** add AgentDetailEdit with editable form and dirty tracking ([f69fc61](https://github.com/djm204/frankenbeast/commit/f69fc6102bc2c8a5ff4b6819c9e5e0c77ec9c01d))
* **web:** add AgentDetailPanel composing slide-in, readonly, and action bar ([1bfa3f1](https://github.com/djm204/frankenbeast/commit/1bfa3f1f3128a794a33b0e16dc89ae5220a1cdeb))
* **web:** add AgentDetailReadonly with accordion sections ([f63863f](https://github.com/djm204/frankenbeast/commit/f63863ff16804226124fce4e3a4102bb3049c7c6))
* **web:** add AgentList with search, density toggle, and empty state ([4e3525e](https://github.com/djm204/frankenbeast/commit/4e3525e396a540a717cdd51b9d4ab08170f7954b))
* **web:** add AgentRow component with density variants ([3d34665](https://github.com/djm204/frankenbeast/commit/3d3466579df89e9e55ee00ad6a6607e0b98233e5))
* **web:** add BeastsPage root component with agent list and detail panel ([a346104](https://github.com/djm204/frankenbeast/commit/a34610456813f100ef32256fe2a89de2f0132456))
* **web:** add dashboard page with skills, security, and provider panels ([d4e4bb4](https://github.com/djm204/frankenbeast/commit/d4e4bb445c20e82707279e9764723bf7af1395b0))
* **web:** add LogViewerModal with fullscreen toggle and search ([62352d1](https://github.com/djm204/frankenbeast/commit/62352d1fcc8de315c2517ea03ea66de26c1ef5d8))
* **web:** add observer analytics dashboard ([#286](https://github.com/djm204/frankenbeast/issues/286)) ([a375ec3](https://github.com/djm204/frankenbeast/commit/a375ec3c484f03bb67260050931609332d62bdd8))
* **web:** add shared form components (gap banner, provider select, preset cards, file picker) ([778dd39](https://github.com/djm204/frankenbeast/commit/778dd39878fbe06e6236b3174790e3dc3ad57a4a))
* **web:** add SinglePageForm accordion mode and fix lightningcss dep ([6aaece3](https://github.com/djm204/frankenbeast/commit/6aaece3d68aa971b87680266216d95b96fc12d0c))
* **web:** add SlideInPanel aside with CSS transitions ([63a27b0](https://github.com/djm204/frankenbeast/commit/63a27b0d0004c4564c4f557107d940cf90d0607f))
* **web:** add StatusLight component with glowing indicators ([e9437cf](https://github.com/djm204/frankenbeast/commit/e9437cffb4213eb44b4d5f2de049878e0b81c561))
* **web:** add token estimator and path normalization utilities ([08e9ca2](https://github.com/djm204/frankenbeast/commit/08e9ca293e9a1c49f17447930f19618584d7b80e))
* **web:** add wizard dialog shell with step indicator ([73bf365](https://github.com/djm204/frankenbeast/commit/73bf365242e060e3530af193c78fe8530bb5a7eb))
* **web:** add wizard steps 1-4 (identity, workflow, LLM targets, modules) ([4145da5](https://github.com/djm204/frankenbeast/commit/4145da542e657f98f39f75e90de31ffe1bc1e399))
* **web:** add Zustand beast store with wizard and edit slices ([c5d385b](https://github.com/djm204/frankenbeast/commit/c5d385b2cf5e26ce12f528fb038051f9ad107a85))
* **web:** beasts panel UX redesign — list-first agent management ([d192688](https://github.com/djm204/frankenbeast/commit/d1926889244ac00733621e09a6c43987ed3aeab7))
* **web:** configure Tailwind CSS v4 with beast theme tokens ([5b39266](https://github.com/djm204/frankenbeast/commit/5b39266ae3ed3bd03f62c6b3fe7304369f1b972a))
* **web:** extend beast-api with killAgent, patchAgentConfig, and extended config types ([b4c4df8](https://github.com/djm204/frankenbeast/commit/b4c4df81dff6126d02eac017160ab67d9ce2fa46))
* **web:** stream beast run status and logs ([ef86e02](https://github.com/djm204/frankenbeast/commit/ef86e02776d6398e9b12e94480ec2e15e073692b))
* **web:** wire AgentDetailEdit into detail panel edit mode ([9079ab2](https://github.com/djm204/frankenbeast/commit/9079ab2455ac772d3a264a548a16e69c0a791e93))
* **web:** wire BeastsPage into ChatShell, replace BeastDispatchPage ([4ad6706](https://github.com/djm204/frankenbeast/commit/4ad67069948be4fcda92a527851dde08819b5582))
* **web:** wire wizard steps, add module config forms, fix UX spacing ([ba61b6c](https://github.com/djm204/frankenbeast/commit/ba61b6c22d9ea5f375fdd875aa9ce3b6cf34647b))
* wire critique and governor modules in dep-factory (Tiers 3-4) ([8d55339](https://github.com/djm204/frankenbeast/commit/8d553399167860bad06a03c85e5b6045a0fb8b1e))
* wire real Firewall, Skills, Memory modules into BeastLoop (Tiers 1-2) ([b835f52](https://github.com/djm204/frankenbeast/commit/b835f529b6167984d54586d8194485664418eef6))


### Bug Fixes

* address 10 review issues on dashboard chunk ([037a57a](https://github.com/djm204/frankenbeast/commit/037a57a2538682233612143e02f289cd88a19cb2))
* address 10 review issues on dashboard chunk ([df52d71](https://github.com/djm204/frankenbeast/commit/df52d7152350c03f741f64ee55ee802da1da81b6))
* **beasts:** resolve 3 high-severity discrepancies from Pass 7 audit ([bdc0f2c](https://github.com/djm204/frankenbeast/commit/bdc0f2cc4f1a85c3037c4e1b5c56143f30fd35ad))
* **beasts:** resolve all DISCREPANCIES.md findings from Plan 1 ([5679beb](https://github.com/djm204/frankenbeast/commit/5679beb7c72fb4adad3aa946af7f4879f0eab086))
* **beasts:** resolve all Pass 6 Deep Audit findings (R1-R8) ([a9eac61](https://github.com/djm204/frankenbeast/commit/a9eac6144d012928c013a5e4fbcb29a803fc9213))
* **beasts:** resolve Pass 4/5 truth audit findings ([ba0908b](https://github.com/djm204/frankenbeast/commit/ba0908be6512cc0161d648cc1ed4de81823adeab))
* broaden start endpoint status guard and clear selection on agent delete ([45026bf](https://github.com/djm204/frankenbeast/commit/45026bf0f7b7fc5edede087e00176f6ed09d3493))
* **ci:** add lightningcss-linux-x64-gnu as explicit optional dep ([0ec3262](https://github.com/djm204/frankenbeast/commit/0ec3262e7850ac5f80682df2ba420afa7619d91c))
* **ci:** remove explicit lightningcss-linux-x64-gnu dep, sync lockfile ([6eb7d09](https://github.com/djm204/frankenbeast/commit/6eb7d09aa703779819931420905ec0f9790f16a7))
* **ci:** sync package-lock.json with @fbeast/mcp-suite workspace ([#280](https://github.com/djm204/frankenbeast/issues/280)) ([cf1bdf6](https://github.com/djm204/frankenbeast/commit/cf1bdf681acbd2866bdc8b82c17ab12fca0c2858))
* **cli:** correct provider setup guidance ([#438](https://github.com/djm204/frankenbeast/issues/438)) ([55703a9](https://github.com/djm204/frankenbeast/commit/55703a942effcfa800f3bc2374889c7cf8ad960f))
* **consolidation:** address review findings — lockfile, comms routes, docs ([e406cc2](https://github.com/djm204/frankenbeast/commit/e406cc2b32cd977f6212b05a300a96ae78480914))
* **critique:** make TokenBudgetBreaker actually enforce the budget ([#343](https://github.com/djm204/frankenbeast/issues/343)) ([b878f5f](https://github.com/djm204/frankenbeast/commit/b878f5f82700e3917e16da6c447cfa094b392595))
* dashboard review fixes, dispatch config stripping, error logging ([cdcf969](https://github.com/djm204/frankenbeast/commit/cdcf969541adfd69bca4a5ac9d4676571b639773))
* fix the connection between dashboard and backend, and make some UI changes ([d137437](https://github.com/djm204/frankenbeast/commit/d1374374b3e0e6195b58a7fd8f19a74dc7f6a40f))
* honor run config provider and model precedence ([17d3432](https://github.com/djm204/frankenbeast/commit/17d3432f858d2590f2cb0683dbd2b661bd667fab))
* **mcp-suite:** mitigate hook hangs and uninstall residue ([#287](https://github.com/djm204/frankenbeast/issues/287)) ([b939d36](https://github.com/djm204/frankenbeast/commit/b939d36b68c8c3336af4df491819b32ec962d168))
* **mcp-suite:** namespace Codex MCP server names ([#443](https://github.com/djm204/frankenbeast/issues/443)) ([6e96c49](https://github.com/djm204/frankenbeast/commit/6e96c49b4a3b4dc5047a39b7c0a6d3b6ba231488))
* **mcp:** expose proxy tool schemas ([#446](https://github.com/djm204/frankenbeast/issues/446)) ([b916056](https://github.com/djm204/frankenbeast/commit/b916056dae9055a5c1a8e835d31ee4e45cb2c13b))
* **mcp:** validate tool schemas centrally ([#435](https://github.com/djm204/frankenbeast/issues/435)) ([b5a0afe](https://github.com/djm204/frankenbeast/commit/b5a0afe817356857345c2c95962756d8bb25164b))
* **observer:** fix cost tracking and document implementation gaps ([7054989](https://github.com/djm204/frankenbeast/commit/7054989522894d5bd2429d71ef73d041e9599725))
* **observer:** fix zero-cost tracking and document implementation gaps ([c75c322](https://github.com/djm204/frankenbeast/commit/c75c322b46dc804873cff78c1ae8756104092cb7))
* **orchestrator:** add missing @franken/critique and @franken/governor dependencies ([31e71f0](https://github.com/djm204/frankenbeast/commit/31e71f01d4aacd062ec42aebcf7bca3762a7de39))
* **orchestrator:** address Phase 3 review gaps + document residuals ([bfc84ee](https://github.com/djm204/frankenbeast/commit/bfc84ee3f4afa95957100635381a1cbc33fe16f7))
* **orchestrator:** bridge provider registries ([#447](https://github.com/djm204/frankenbeast/issues/447)) ([930175f](https://github.com/djm204/frankenbeast/commit/930175f63c617d8767b8598430ac75c649f9d547))
* **orchestrator:** fail closed when safety-critical modules are absent ([#394](https://github.com/djm204/frankenbeast/issues/394)) ([26eb340](https://github.com/djm204/frankenbeast/commit/26eb340c40fd62049bcdbe85a8194db26834462a))
* **orchestrator:** fence chunk file prompts ([#317](https://github.com/djm204/frankenbeast/issues/317)) ([c2ddec1](https://github.com/djm204/frankenbeast/commit/c2ddec1f3bf2ab6e3d4dcc4bae6117f7190cd243))
* **orchestrator:** honor provider selection and fallback semantics ([abf1b77](https://github.com/djm204/frankenbeast/commit/abf1b776226e67257ec39e2d34cd359bc3e7eb95))
* **orchestrator:** isolate issue stage sessions ([#212](https://github.com/djm204/frankenbeast/issues/212)) ([44a2c61](https://github.com/djm204/frankenbeast/commit/44a2c617327540bfd04253062e6017487656a3e2))
* **orchestrator:** make one-shot issues issue-aware and resumable ([09488cb](https://github.com/djm204/frankenbeast/commit/09488cb6f49ee2179ce9d2d0cfaff2f19cd1ef4f))
* **orchestrator:** operator-auth all control-plane routes + comms endpoints ([#396](https://github.com/djm204/frankenbeast/issues/396)) ([398c752](https://github.com/djm204/frankenbeast/commit/398c7524cd467d18ac03a75c046124104e8342ff))
* **orchestrator:** populate phase in ChatRuntime.result(), update docs ([#277](https://github.com/djm204/frankenbeast/issues/277)) ([ec02071](https://github.com/djm204/frankenbeast/commit/ec02071c8987d8b1794784c09a9c2f8e98bb8f33))
* **orchestrator:** resolve Chunk A residuals R1-R4 ([7572d68](https://github.com/djm204/frankenbeast/commit/7572d68b62c520e4745f9d218f4c5806af71df79))
* **orchestrator:** resolve review action item hardening ([#336](https://github.com/djm204/frankenbeast/issues/336)) ([763178a](https://github.com/djm204/frankenbeast/commit/763178a1d1ce311cb6181184ef9f3ebbf60bb8e3))
* **orchestrator:** standardize issue execution via chunk files ([63942f6](https://github.com/djm204/frankenbeast/commit/63942f6b2a6aff3088a1f5c55c652719717fe7f1))
* **orchestrator:** standardize issue execution via chunk files ([1e6d2eb](https://github.com/djm204/frankenbeast/commit/1e6d2ebbd6e8ad662ca6d70158078bf65070c28a))
* **orchestrator:** standardize subprocess failures ([#213](https://github.com/djm204/frankenbeast/issues/213)) ([130bce2](https://github.com/djm204/frankenbeast/commit/130bce266b71dcc84ba3e3b463d8ff5b4b46a475))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([1e88e62](https://github.com/djm204/frankenbeast/commit/1e88e6222bc1149311fb8ade17ac8eafa3525bc0))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([33dbf5a](https://github.com/djm204/frankenbeast/commit/33dbf5a483debc2460116f2b1cbbf0cd029a8061))
* **release:** hoist changelog-sections to top level so all packages show refactor commits ([4ad202e](https://github.com/djm204/frankenbeast/commit/4ad202e6d2cb4925e5cbd59beb973ec9c05499cf))
* residual one-shots (comms cleanup, HITL test, checkpoint flush, PROGRESS.md) ([e105db3](https://github.com/djm204/frankenbeast/commit/e105db3fe067c6473d3f2a4bc43fc85756487018))
* satisfy dashboard control typecheck ([065a566](https://github.com/djm204/frankenbeast/commit/065a566b14ddc66dd3d8fb034b575f538c889f4a))
* **security:** Chunk 1 — fail-closed HTTP & approval boundaries ([#296](https://github.com/djm204/frankenbeast/issues/296)) ([f281e8e](https://github.com/djm204/frankenbeast/commit/f281e8eb98c6208a7da2f06e2923c57bd9890090))
* **security:** Chunk 2 — MCP schema enforcement & firewall path containment ([#297](https://github.com/djm204/frankenbeast/issues/297)) ([d8ac1e4](https://github.com/djm204/frankenbeast/commit/d8ac1e47c10b3e979bc6298f6d68bcf870e72bdb))
* **security:** reject unsafe safety regex rules ([#302](https://github.com/djm204/frankenbeast/issues/302)) ([c639420](https://github.com/djm204/frankenbeast/commit/c639420a3a250d756e634e6e5db21d8a4f2d3fac))
* **security:** sandbox Beast execution ([#298](https://github.com/djm204/frankenbeast/issues/298)) ([9a7b4f0](https://github.com/djm204/frankenbeast/commit/9a7b4f08a11bc3856d7090c4d2371e7048313cfd))
* **skills:** fix global skill discovery validation failures ([2dc938e](https://github.com/djm204/frankenbeast/commit/2dc938e70ace981a5b1ecebe89c5d290d4dca4c5))
* **skills:** set source to GLOBAL and add interface field in skill flattener ([035d6be](https://github.com/djm204/frankenbeast/commit/035d6be862e03a91615866a9fa9ff3e63289617a))
* **skills:** use Object.values to avoid unused destructured variable ([f84a15b](https://github.com/djm204/frankenbeast/commit/f84a15b41eae9edf266eab9fd2a079115abf6481))
* use --json flag for agent-skills CLI discovery ([6ddc4da](https://github.com/djm204/frankenbeast/commit/6ddc4da7d0a98c6b988a6cefbdc2244d43dadbaf))
* use --json flag for agent-skills CLI discovery ([3549dc8](https://github.com/djm204/frankenbeast/commit/3549dc8930c3a785e24957406af9b4db8eddbb1f))
* **web:** add missing available/failoverOrder to test mocks ([257a66f](https://github.com/djm204/frankenbeast/commit/257a66f5449a3d5367f24be294d9f18c05e14465))
* **web:** address critical review findings ([cf29b90](https://github.com/djm204/frankenbeast/commit/cf29b90552b663107088701b2e4820803d79d78f))
* **web:** fix launch wiring, fix Tailwind CSS layer conflict, improve spacing ([9d88618](https://github.com/djm204/frankenbeast/commit/9d8861801a6bf85235946948175f0fb74ffccaaa))
* **web:** resolve TypeScript strict null check errors across beasts components ([00493a4](https://github.com/djm204/frankenbeast/commit/00493a4afee7df9cb462344ece3ae1b81976d82b))
* **web:** share Beast wizard launch config ([#434](https://github.com/djm204/frankenbeast/issues/434)) ([595af54](https://github.com/djm204/frankenbeast/commit/595af541bdc879ab4560a0ffdeae55a051b2a5d8))


### Refactoring

* **brain:** delete legacy episodic memory and types ([c627d6a](https://github.com/djm204/frankenbeast/commit/c627d6ae2e878f454dbbeacda32974c2d12ea393))
* **brain:** delete legacy episodic memory and types ([e620c62](https://github.com/djm204/frankenbeast/commit/e620c622d3fb25b338e5ce7e5417f82be61163d0))
* **orchestrator:** migrate dep-factory to consolidated components ([e432b6d](https://github.com/djm204/frankenbeast/commit/e432b6dd845a059e292df70aba3f18c47f9cafe8))


### Miscellaneous

* add architecture docs and update brain packaging ([38652e9](https://github.com/djm204/frankenbeast/commit/38652e967f4065c199c187650add570cebdaedea))
* add firewall, skills, brain workspace deps to orchestrator ([a8317b7](https://github.com/djm204/frankenbeast/commit/a8317b74d0ed177e55ee46eaa1da6cabcd3ac6ad))
* consolidate release-please into single PR for all version bumps ([59ad9c9](https://github.com/djm204/frankenbeast/commit/59ad9c905fc0fe301ab90321e140cabb723d70e1))
* delete auto merge workflow that doesnt work ([c496042](https://github.com/djm204/frankenbeast/commit/c4960427453f48d183d08d945e7c9ae6b8a51a0e))
* **docs:** delete old docs ([abeeb7f](https://github.com/djm204/frankenbeast/commit/abeeb7f5b7757e6cf0227d521728a6628dd5ab05))
* **franken-observer:** implement fix-issue-89-costcalculator-silently-returns-0-f ([ca26308](https://github.com/djm204/frankenbeast/commit/ca2630882bf79032e66da42fce92f410c35afe7c))
* **franken-orchestrator:** implement you-are-hardening-chunk-homepfkdevfrankenbeas ([362d813](https://github.com/djm204/frankenbeast/commit/362d81366976d04ea822f3d32797b8525504891d))
* implement you-are-hardening-chunk-homepfkdevfrankenbeas ([1b1917c](https://github.com/djm204/frankenbeast/commit/1b1917ca8feaf0bdcea735876253d7918cb3d619))
* **main:** release 0.15.0 ([67049f2](https://github.com/djm204/frankenbeast/commit/67049f262cff7ca4ee2ffade5603c2bc9df3e39c))
* **main:** release 0.16.0 ([4a7b97d](https://github.com/djm204/frankenbeast/commit/4a7b97dd3d45d7944fa3f396f6202a769e7f3a6e))
* **main:** release 0.16.0 ([291ff80](https://github.com/djm204/frankenbeast/commit/291ff80b190d72bc48a9c2cf259fb4f09f8d639c))
* **main:** release 0.16.1 ([3eecb23](https://github.com/djm204/frankenbeast/commit/3eecb23d6f466f94d76328c147fe51b9f9663182))
* **main:** release 0.16.1 ([9d08a35](https://github.com/djm204/frankenbeast/commit/9d08a353b62433bad58f989fb8e6ead9f541fc34))
* **main:** release 0.16.2 ([7c74ef0](https://github.com/djm204/frankenbeast/commit/7c74ef0ba9077ddff64abb21641aa3b30f66c172))
* **main:** release 0.16.2 ([2d0015e](https://github.com/djm204/frankenbeast/commit/2d0015edbcbddd50356c57f63802df06f1e1b2c9))
* **main:** release 0.16.3 ([33fb882](https://github.com/djm204/frankenbeast/commit/33fb88281508bbe968e96f45aa808d9e40d5ae70))
* **main:** release 0.16.3 ([d2c6b2a](https://github.com/djm204/frankenbeast/commit/d2c6b2a6be3758f695374037c701e06148f96f82))
* **main:** release 0.17.0 ([9350350](https://github.com/djm204/frankenbeast/commit/9350350f56b8b0a91e162bd8c1b9dfc57c0823fb))
* **main:** release 0.17.0 ([7828796](https://github.com/djm204/frankenbeast/commit/78287965313033b6f93c3d9dca3e446f5439c14b))
* **main:** release franken-observer 0.3.2 ([c61c47d](https://github.com/djm204/frankenbeast/commit/c61c47d0b73275e1ee7514fa37f3b7ef733e1e7d))
* **main:** release franken-observer 0.3.2 ([84cc110](https://github.com/djm204/frankenbeast/commit/84cc110c0e2f161f797151f0e92326433a43ddd9))
* **main:** release franken-observer 0.4.0 ([48b478a](https://github.com/djm204/frankenbeast/commit/48b478ac7316bfae25a43f0460f232138e883df6))
* **main:** release franken-observer 0.4.0 ([cb218a4](https://github.com/djm204/frankenbeast/commit/cb218a46d5dbe8aa3ac21eac4922189ddb6914e8))
* **main:** release franken-observer 0.4.0 ([8a6c421](https://github.com/djm204/frankenbeast/commit/8a6c4214ddb33af629897ea01caf03a97cae9af3))
* **main:** release franken-observer 0.4.0 ([92febeb](https://github.com/djm204/frankenbeast/commit/92febeb6b856f9c0af790beee2e54be80159624b))
* **main:** release franken-orchestrator 0.13.0 ([7bfef3d](https://github.com/djm204/frankenbeast/commit/7bfef3dc1dc8610bf7b05d621f5da28c91bfbef0))
* **main:** release franken-orchestrator 0.13.0 ([3608647](https://github.com/djm204/frankenbeast/commit/36086470d523deb50d7e78542c1f2338980cc674))
* **main:** release franken-orchestrator 0.14.0 ([17ab09e](https://github.com/djm204/frankenbeast/commit/17ab09e21765c8ac894627053937fd365a60dc6b))
* **main:** release franken-orchestrator 0.14.0 ([36ed876](https://github.com/djm204/frankenbeast/commit/36ed876352be18ee97ff468e131da37d68a1a312))
* **main:** release franken-orchestrator 0.14.1 ([3d8b754](https://github.com/djm204/frankenbeast/commit/3d8b754310111e59c50f0c2d180c441380a35b24))
* **main:** release franken-orchestrator 0.14.1 ([2d784f7](https://github.com/djm204/frankenbeast/commit/2d784f79eaa3f34db01f59739c46b67e4d0c54e6))
* **main:** release franken-orchestrator 0.14.2 ([8a41a9f](https://github.com/djm204/frankenbeast/commit/8a41a9f7665826b8994967e3972369e4bf845b8c))
* **main:** release franken-orchestrator 0.14.2 ([3596d99](https://github.com/djm204/frankenbeast/commit/3596d99dc1416808b33a794b915b4fdffa487357))
* **main:** release franken-orchestrator 0.15.0 ([a5795d1](https://github.com/djm204/frankenbeast/commit/a5795d1b3714d8e88d21098494d1c45a6414b757))
* **main:** release franken-orchestrator 0.15.0 ([2f50aad](https://github.com/djm204/frankenbeast/commit/2f50aadde3aa7f8854ac8065e6643f94cd25959b))
* **main:** release franken-orchestrator 0.16.0 ([bc5f0b6](https://github.com/djm204/frankenbeast/commit/bc5f0b693b741a7b5901fe4564e3ec4e5d2452e0))
* **main:** release franken-orchestrator 0.16.0 ([1510dc9](https://github.com/djm204/frankenbeast/commit/1510dc94837ea66c15756f3869dc145ee9cc6ed2))
* **main:** release franken-planner 0.4.0 ([7f17b8e](https://github.com/djm204/frankenbeast/commit/7f17b8e22a28a96c642c0239461d08a06e9da2a1))
* **main:** release franken-planner 0.4.0 ([521f2c1](https://github.com/djm204/frankenbeast/commit/521f2c128558af40065111d6ecf5e650089050b3))
* **main:** release franken-planner 0.4.0 ([4ad33cf](https://github.com/djm204/frankenbeast/commit/4ad33cf35c2c22efe34359191e510a6c671d5b1f))
* **main:** release franken-skills 0.4.0 ([5e13bfe](https://github.com/djm204/frankenbeast/commit/5e13bfe55cc6bc616fd2d05e7d9b8e074500b3fc))
* **main:** release franken-skills 0.4.0 ([525b447](https://github.com/djm204/frankenbeast/commit/525b4471e19c95fcb4966c8ab5f2ae01500ffd65))
* **main:** release franken-skills 0.4.0 ([4de5013](https://github.com/djm204/frankenbeast/commit/4de50135f88e9f565d06abb50c188640a9ba3fdd))
* **main:** release franken-skills 0.4.0 ([bc03094](https://github.com/djm204/frankenbeast/commit/bc030943491c239ce9ced84e77b3f3e275a99afb))
* **main:** release frankenfirewall 0.5.0 ([9c6a7dc](https://github.com/djm204/frankenbeast/commit/9c6a7dcb144316d4b9e11cf364ea234b58a958ea))
* **main:** release frankenfirewall 0.5.0 ([746f749](https://github.com/djm204/frankenbeast/commit/746f749120864d41b1de376f862120cc48389472))
* **main:** release frankenfirewall 0.5.0 ([d4488aa](https://github.com/djm204/frankenbeast/commit/d4488aa7ca5a71be9e8f5ea0d011d45baa40cc21))
* **package-lock:** update package-lock ([7105406](https://github.com/djm204/frankenbeast/commit/71054064b589f322a6d46502a39e09ff2372b6eb))
* release main ([41acdbe](https://github.com/djm204/frankenbeast/commit/41acdbe09c990c38ade8209b3283b4405399dcda))
* release main ([19664bb](https://github.com/djm204/frankenbeast/commit/19664bb4baf0e8e0acb4c7042bcfee7f0799526b))
* release main ([29f20c7](https://github.com/djm204/frankenbeast/commit/29f20c74d7e5b0d5633188d1c6aa14eb189d0cc8))
* release main ([f388c96](https://github.com/djm204/frankenbeast/commit/f388c9636e6b34f63dde32314cfada9935a52370))
* release main ([78fce35](https://github.com/djm204/frankenbeast/commit/78fce35668a8ef71ada15816587858e4f5499470))
* release main ([24ca434](https://github.com/djm204/frankenbeast/commit/24ca434931d802006ec3d7744f2c8d4de9723eb7))
* release main ([ebdbb58](https://github.com/djm204/frankenbeast/commit/ebdbb58c04e68ab5e14414dea2e5f200141c152e))
* release main ([490d5c4](https://github.com/djm204/frankenbeast/commit/490d5c42a79aeb79afb6fc1f00a39eaed09f6a34))
* release main ([50717e2](https://github.com/djm204/frankenbeast/commit/50717e2e2f6bd7c1dcc209e60d1b2cafed6af550))
* release main ([78d8495](https://github.com/djm204/frankenbeast/commit/78d849528ab990a50b2ed6859d98d10cab92b09f))
* release main ([48548f3](https://github.com/djm204/frankenbeast/commit/48548f32209176d6d9a1562fdb4725742ecb9515))
* release main ([1e760f3](https://github.com/djm204/frankenbeast/commit/1e760f3dde475636378bdba15afe4cbc13381239))
* release main ([d428ecd](https://github.com/djm204/frankenbeast/commit/d428ecd6e627d5c3c48cd0ef98c45a8eeca56d3e))
* release main ([55f726e](https://github.com/djm204/frankenbeast/commit/55f726e1af6e84f3401fd5ad14f452e7ac727f22))
* release main ([4ee81c5](https://github.com/djm204/frankenbeast/commit/4ee81c571b79f98e41e6b9531336b7781592e680))
* release main ([4e4ab4c](https://github.com/djm204/frankenbeast/commit/4e4ab4c4c7cde525fef815c057bae24f2c6b34c5))
* release main ([cb2643c](https://github.com/djm204/frankenbeast/commit/cb2643c48eb86850bd76e1e0cd3af0b2e8301990))
* release main ([ed75081](https://github.com/djm204/frankenbeast/commit/ed750811df44ebc431b3aeca32b2606b503b25f3))
* release main ([aca7ca8](https://github.com/djm204/frankenbeast/commit/aca7ca8eacd9fed4b189e38ab1742cfb0bf375d2))
* release main ([575ba5f](https://github.com/djm204/frankenbeast/commit/575ba5f659a5b3ea9d4e1d2f6c602217ef086ef6))
* release main ([c823154](https://github.com/djm204/frankenbeast/commit/c8231545bd31c69edbbcd8d5d8ef8ba87641e897))
* release main ([86a1f8d](https://github.com/djm204/frankenbeast/commit/86a1f8da0d2d4e547b3ad9df079da581bc947c80))
* release main ([9424d30](https://github.com/djm204/frankenbeast/commit/9424d303b7d2673f805a85338f029b5f40311be9))
* release main ([0cb248b](https://github.com/djm204/frankenbeast/commit/0cb248b7a1fda5821b7f7b1c14e2ece639cbde71))
* release main ([ffee28a](https://github.com/djm204/frankenbeast/commit/ffee28a05bf220a38b0aa10070f6116db0e3c042))
* release main ([ade7f4a](https://github.com/djm204/frankenbeast/commit/ade7f4a923f9ab55a36744d646e70c6da3d8310c))
* release main ([2d3cf22](https://github.com/djm204/frankenbeast/commit/2d3cf2261539e1012e7a82bced3848d5688283cf))
* release main ([a6d94d3](https://github.com/djm204/frankenbeast/commit/a6d94d3456a0f8d011f3ca629f0ca92e520c117e))
* release main ([cda3767](https://github.com/djm204/frankenbeast/commit/cda376733c6c0315470b068c04a9c22a2374bf78))
* release main ([32ccdeb](https://github.com/djm204/frankenbeast/commit/32ccdeb50094924a24da0d75cc9cf489e5435496))
* release main ([696580f](https://github.com/djm204/frankenbeast/commit/696580f097d1f7e982aa35e288eb06d89e86b13f))
* release main ([5e1ba59](https://github.com/djm204/frankenbeast/commit/5e1ba59e0ca6ff7296839508d551d97865adb8d1))
* release main ([8ae6599](https://github.com/djm204/frankenbeast/commit/8ae6599c1a9a30902d39c90e8789998f69424d66))
* release main ([7b7a0ff](https://github.com/djm204/frankenbeast/commit/7b7a0ffa7fa23d0ef398d38f21366d08c24010cd))
* release main ([ea3ffb4](https://github.com/djm204/frankenbeast/commit/ea3ffb4650c2eb8716f7a8b57750b88e6fa3ea2d))
* release main ([6c1bae4](https://github.com/djm204/frankenbeast/commit/6c1bae4ffc62e5d57b21b49fb4abfa4202068bc6))
* release main ([92b122d](https://github.com/djm204/frankenbeast/commit/92b122d377cb480c1f7e1f13150f3f8c49362099))
* release main ([973da3b](https://github.com/djm204/frankenbeast/commit/973da3bc20a6185adcf1b504c997cec4bd0f5170))
* release main ([d4a9d83](https://github.com/djm204/frankenbeast/commit/d4a9d8333d11593e0a678e520bd2f39a97c8ce7c))
* release main ([daed900](https://github.com/djm204/frankenbeast/commit/daed9006881558c39d010263f1c409be3785b09e))
* release main ([1ab0863](https://github.com/djm204/frankenbeast/commit/1ab086391aec199aa4685bcc65c0cf6b1a9ea0e6))
* release main ([db01295](https://github.com/djm204/frankenbeast/commit/db01295e7a3734d378c25c17fb5ad8d39e6891f2))
* release main ([4b47eca](https://github.com/djm204/frankenbeast/commit/4b47eca3bf14c4972f038bbd9e0f5bed31e1719c))
* release main ([fabea22](https://github.com/djm204/frankenbeast/commit/fabea2256bbf60ce9e81573564e599fedd7495c4))
* release main ([#211](https://github.com/djm204/frankenbeast/issues/211)) ([ad3e1a4](https://github.com/djm204/frankenbeast/commit/ad3e1a429d9d518254df9e81215d84fd17e6eac4))
* release main ([#214](https://github.com/djm204/frankenbeast/issues/214)) ([6fe0df8](https://github.com/djm204/frankenbeast/commit/6fe0df8c04d94121179bcf9da00fdfb3a025bf91))
* release main ([#273](https://github.com/djm204/frankenbeast/issues/273)) ([fbdd6a4](https://github.com/djm204/frankenbeast/commit/fbdd6a4429eaf727acc178c5952b629845defc7d))
* release main ([#281](https://github.com/djm204/frankenbeast/issues/281)) ([70c2d8d](https://github.com/djm204/frankenbeast/commit/70c2d8dea5bc63ed04048a60a33dc8be0d46a8c0))
* release main ([#283](https://github.com/djm204/frankenbeast/issues/283)) ([0d1cc48](https://github.com/djm204/frankenbeast/commit/0d1cc48f4f1a4f75a3fc447cabd274d5eb184f39))
* release main ([#285](https://github.com/djm204/frankenbeast/issues/285)) ([5544c28](https://github.com/djm204/frankenbeast/commit/5544c28d035c0d770e96890e54675a5260892e58))
* release main ([#288](https://github.com/djm204/frankenbeast/issues/288)) ([2022fbe](https://github.com/djm204/frankenbeast/commit/2022fbe37fbe7a1f81beda8f09979c988441dfae))
* release main ([#290](https://github.com/djm204/frankenbeast/issues/290)) ([610a0ea](https://github.com/djm204/frankenbeast/commit/610a0eaae42fa9461e2b7665e0ad2eca6d3ed33a))
* release main ([#293](https://github.com/djm204/frankenbeast/issues/293)) ([f3be88e](https://github.com/djm204/frankenbeast/commit/f3be88ed17e5b296a3ec5bb1beed1d0399d9d4c0))
* release main ([#295](https://github.com/djm204/frankenbeast/issues/295)) ([693ee5e](https://github.com/djm204/frankenbeast/commit/693ee5e698c9f64478a2617d1be8676fcbf392f3))
* release main ([#303](https://github.com/djm204/frankenbeast/issues/303)) ([96f734e](https://github.com/djm204/frankenbeast/commit/96f734efc83b9d13c9df1a7f33ab73e33365b668))
* release main ([#307](https://github.com/djm204/frankenbeast/issues/307)) ([ff8284e](https://github.com/djm204/frankenbeast/commit/ff8284e5c840873912c9c14a475451c30cd0143e))
* release main ([#309](https://github.com/djm204/frankenbeast/issues/309)) ([9dadfae](https://github.com/djm204/frankenbeast/commit/9dadfae67be6686e3a7962c5fd9e21ed8b6b525b))
* release main ([#337](https://github.com/djm204/frankenbeast/issues/337)) ([1f819ef](https://github.com/djm204/frankenbeast/commit/1f819ef9f239137df6977bfbe57442d256a1d2a6))
* release main ([#378](https://github.com/djm204/frankenbeast/issues/378)) ([33629c1](https://github.com/djm204/frankenbeast/commit/33629c1b937e63a97fb06fdb32417ac19323b85d))
* release main ([#389](https://github.com/djm204/frankenbeast/issues/389)) ([24e5428](https://github.com/djm204/frankenbeast/commit/24e5428cc009a1ed497e25a94c0a0911b45eb8e0))
* release main ([#395](https://github.com/djm204/frankenbeast/issues/395)) ([e6ea486](https://github.com/djm204/frankenbeast/commit/e6ea486ba9ed8ccdb340803a2c88d0b705a7ca64))
* update README ([b514e04](https://github.com/djm204/frankenbeast/commit/b514e045599d44cb8d8236493a107defe4da4790))
* **web:** add Radix UI, Tailwind v4, and Zustand dependencies ([31bf91a](https://github.com/djm204/frankenbeast/commit/31bf91a4a1a25a21190e3f471e01c38c8d636764))


### Documentation

* add agent init workflow design and plan ([95421a0](https://github.com/djm204/frankenbeast/commit/95421a04cc78bc330acff3a1349af3948eb1e23e))
* add Chunk A residual issues ([51ba39e](https://github.com/djm204/frankenbeast/commit/51ba39eb81945e201bd7cb1be814ab2def6e901d))
* add comprehensive data flow guide ([441c310](https://github.com/djm204/frankenbeast/commit/441c310a14280aeb5456f71f9499c321183af45b))
* add consolidation plan, ADRs 027-031, specs, and remove stale docs ([69f04a5](https://github.com/djm204/frankenbeast/commit/69f04a5323ad4eafeb9572312acc315fac5add1b))
* add dashboard beast deploy guide ([9362dcf](https://github.com/djm204/frankenbeast/commit/9362dcfd929da64213e06b4c04d7bb3513d7f5fa))
* add frankenbeast.example.json with all config properties ([814eaa8](https://github.com/djm204/frankenbeast/commit/814eaa8feb3c2bb965b99e4cd672d9a27ebb7c1b))
* add I5 and I6 residual issues for Phase 2 Brain Rewrite ([2ad7050](https://github.com/djm204/frankenbeast/commit/2ad70502db4c94d596bbfcddca766db0f1faf631))
* add issue-aware issues resume design and plan ([a87a74b](https://github.com/djm204/frankenbeast/commit/a87a74bdfe91c153ad0f40bd788ae29c958bdc84))
* add issues provider fallback design and plan ([8623a74](https://github.com/djm204/frankenbeast/commit/8623a74ada6b8aeb6bb86be82dfbbbb675b46dfb))
* add Phase 1 residual issues to minor-issues plan folder ([a64ea88](https://github.com/djm204/frankenbeast/commit/a64ea881518b65f6f2019755d59a6e842e91807a))
* add Phase 2 (Brain Rewrite) residual issues ([5bb9786](https://github.com/djm204/frankenbeast/commit/5bb97862657e2159b2349da44c2cfd8492cd4138))
* add Phase 4 residual issues ([7b840f9](https://github.com/djm204/frankenbeast/commit/7b840f9b7482a2ecc7b4633664e687b0b16f679c))
* add Phase 4.5 residual issues ([2b2e003](https://github.com/djm204/frankenbeast/commit/2b2e003e48cd6a8ea148d0e7861320ddd238d2ab))
* add Phase 5 residual issues ([b004987](https://github.com/djm204/frankenbeast/commit/b0049873525a91b38de3b13e9e3811dca6a3f0bc))
* add Phase 6 residual issues ([03f4302](https://github.com/djm204/frankenbeast/commit/03f430209bc5171b88440a0063b24c7c9ebfdfb4))
* add Phase 7 residual issues ([a098ee1](https://github.com/djm204/frankenbeast/commit/a098ee1d0b4433708891ca4d4d7b44a8eb428b7a))
* add Phase 8 residual issues ([b485954](https://github.com/djm204/frankenbeast/commit/b48595420e0ae3498adbcdba0230ab4353fba05f))
* add residuals master plan and chunk breakdown ([26b8d18](https://github.com/djm204/frankenbeast/commit/26b8d185ce731775280a1e8cd632622dbfc06cd2))
* add Secret Management guide to README and franken-web setup ([584e7cc](https://github.com/djm204/frankenbeast/commit/584e7cc97c556007cae1b6f2aa65ac99e84bdb79))
* add secret store to RAMP_UP and ARCHITECTURE ([a002d2a](https://github.com/djm204/frankenbeast/commit/a002d2aefbd8c4c9fb6e645e3119c1e191a40b23))
* add tracked agent workflow adr ([0d550a2](https://github.com/djm204/frankenbeast/commit/0d550a2f1ec16f286d2260a80e06374046ef3442))
* ADR-018 secret store architecture ([6b0f59f](https://github.com/djm204/frankenbeast/commit/6b0f59ffb0473336f98d85ffc8268a073159eb3e))
* ADR-019 secret backend comparison and recommendations ([524ef08](https://github.com/djm204/frankenbeast/commit/524ef08e09cca737786cbe329904f43fb5c0588c))
* defer ADR-027 beast daemon extraction ([0be3f71](https://github.com/djm204/frankenbeast/commit/0be3f718ac1e757c93b23a6b654e7984835125de))
* describe tracked agent init workflow ([efeebb8](https://github.com/djm204/frankenbeast/commit/efeebb8d7be5d0eb1abe2ef9323269f09a7bf0d7))
* fix deploy beasts Codex feedback ([69f0b01](https://github.com/djm204/frankenbeast/commit/69f0b014901d39ca8c4a9caa4e039847d050648f))
* **issues:** document upstream repo targeting ([e8632ad](https://github.com/djm204/frankenbeast/commit/e8632ad9ada8689b0f6d3f48a48555ba68ab5c97))
* mark beastloop tiers 3-4 wiring as implemented ([2c4bdc4](https://github.com/djm204/frankenbeast/commit/2c4bdc489667acb4b8750594fcd88746bbcf707d))
* mark Chunk A residuals R1-R4 as resolved ([8758431](https://github.com/djm204/frankenbeast/commit/87584315ecd80ef623aeb9987b17f8403865c598))
* mark Phase 2 M1/M2 residuals as resolved ([b980eee](https://github.com/djm204/frankenbeast/commit/b980eeed164af2e965d84f2aad120f6788b78110))
* mark tiers 1-2 wiring design as implemented ([57ffee1](https://github.com/djm204/frankenbeast/commit/57ffee10153a7dc88632607a56d7b99f00188ea1))
* move completed plans into complete ([914c8c1](https://github.com/djm204/frankenbeast/commit/914c8c1caef4d5751589b1119910c04f82047d7e))
* **plans:** chunk 2026-04-28 security gap-fill into 4 implementation plans ([#294](https://github.com/djm204/frankenbeast/issues/294)) ([bd26d85](https://github.com/djm204/frankenbeast/commit/bd26d85af9b5042eba305cad980e6b25ddbf8d07))
* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))
* refresh init workflow design and plan ([d590651](https://github.com/djm204/frankenbeast/commit/d5906511dba6a7ee07d809987a4bef63e6329c07))
* refresh issue 86 status docs ([#319](https://github.com/djm204/frankenbeast/issues/319)) ([a21612f](https://github.com/djm204/frankenbeast/commit/a21612f5e0ce8cb73bd536746ac143b34e2df2f6))
* sync ramp-up guides with workspace ([d989aa5](https://github.com/djm204/frankenbeast/commit/d989aa52b9c9378c45cf28c470e267f0e46caeed))
* update ARCHITECTURE, PROGRESS, and RAMP_UP for Plan 1 ([13a2038](https://github.com/djm204/frankenbeast/commit/13a20389b19c8c05e898b52b191cb91aefd8d8f6))
* update PROGRESS.md with Architecture Consolidation Phases 2-8 ([89ce9a0](https://github.com/djm204/frankenbeast/commit/89ce9a0ff075ee02cde17996b80d0d57b79057b6))
* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))


### CI/CD

* auto-merge release please prs after ci ([5c9afbe](https://github.com/djm204/frankenbeast/commit/5c9afbe2c561cb9fae87b7fc00361e6c35aeaa4a))
* auto-merge release please prs after ci ([6e1557a](https://github.com/djm204/frankenbeast/commit/6e1557a7ed4cedf3f731b717c62451d5129d05c7))


### Tests

* delete 26 fluff test files (~283 tests) identified by audit ([03358d4](https://github.com/djm204/frankenbeast/commit/03358d4cdc745197e48b61855ed77571a37a2939))
* **skills:** update agent-skills-cli test expectations for GLOBAL source and interface ([8ba8ccc](https://github.com/djm204/frankenbeast/commit/8ba8cccc48d3f5b9bcac69f7f10ec78198609201))

## [0.38.5](https://github.com/djm204/frankenbeast/compare/v0.38.4...v0.38.5) (2026-06-28)


### Miscellaneous

* release main ([#389](https://github.com/djm204/frankenbeast/issues/389)) ([24e5428](https://github.com/djm204/frankenbeast/commit/24e5428cc009a1ed497e25a94c0a0911b45eb8e0))

## [0.38.4](https://github.com/djm204/frankenbeast/compare/v0.38.3...v0.38.4) (2026-06-28)


### Bug Fixes

* **critique:** make TokenBudgetBreaker actually enforce the budget ([#343](https://github.com/djm204/frankenbeast/issues/343)) ([b878f5f](https://github.com/djm204/frankenbeast/commit/b878f5f82700e3917e16da6c447cfa094b392595))

## [0.38.3](https://github.com/djm204/frankenbeast/compare/v0.38.2...v0.38.3) (2026-06-13)


### Bug Fixes

* **orchestrator:** resolve review action item hardening ([#336](https://github.com/djm204/frankenbeast/issues/336)) ([763178a](https://github.com/djm204/frankenbeast/commit/763178a1d1ce311cb6181184ef9f3ebbf60bb8e3))

## [0.38.2](https://github.com/djm204/frankenbeast/compare/v0.38.1...v0.38.2) (2026-06-09)


### Bug Fixes

* **orchestrator:** fence chunk file prompts ([#317](https://github.com/djm204/frankenbeast/issues/317)) ([c2ddec1](https://github.com/djm204/frankenbeast/commit/c2ddec1f3bf2ab6e3d4dcc4bae6117f7190cd243))


### Documentation

* refresh issue 86 status docs ([#319](https://github.com/djm204/frankenbeast/issues/319)) ([a21612f](https://github.com/djm204/frankenbeast/commit/a21612f5e0ce8cb73bd536746ac143b34e2df2f6))

## [0.38.1](https://github.com/djm204/frankenbeast/compare/v0.38.0...v0.38.1) (2026-05-26)


### Bug Fixes

* **security:** reject unsafe safety regex rules ([#302](https://github.com/djm204/frankenbeast/issues/302)) ([c639420](https://github.com/djm204/frankenbeast/commit/c639420a3a250d756e634e6e5db21d8a4f2d3fac))

## [0.38.0](https://github.com/djm204/frankenbeast/compare/v0.37.1...v0.38.0) (2026-05-25)


### Features

* **live-bench:** add benchmark foundation ([#300](https://github.com/djm204/frankenbeast/issues/300)) ([1203826](https://github.com/djm204/frankenbeast/commit/12038267bff530fa805e0904efaff4efc340d6be))
* **live-bench:** provision isolated benchmark workspaces ([#301](https://github.com/djm204/frankenbeast/issues/301)) ([74a7969](https://github.com/djm204/frankenbeast/commit/74a7969e822421017de48e60b21dbee109d82fc1))
* **observer:** durable audit replay ([#299](https://github.com/djm204/frankenbeast/issues/299)) ([34ddc5a](https://github.com/djm204/frankenbeast/commit/34ddc5aa6b17ac6ae87f714e1342a101d7ecd195))


### Bug Fixes

* **security:** sandbox Beast execution ([#298](https://github.com/djm204/frankenbeast/issues/298)) ([9a7b4f0](https://github.com/djm204/frankenbeast/commit/9a7b4f08a11bc3856d7090c4d2371e7048313cfd))

## [0.37.1](https://github.com/djm204/frankenbeast/compare/v0.37.0...v0.37.1) (2026-05-21)


### Bug Fixes

* **security:** Chunk 1 — fail-closed HTTP & approval boundaries ([#296](https://github.com/djm204/frankenbeast/issues/296)) ([f281e8e](https://github.com/djm204/frankenbeast/commit/f281e8eb98c6208a7da2f06e2923c57bd9890090))
* **security:** Chunk 2 — MCP schema enforcement & firewall path containment ([#297](https://github.com/djm204/frankenbeast/issues/297)) ([d8ac1e4](https://github.com/djm204/frankenbeast/commit/d8ac1e47c10b3e979bc6298f6d68bcf870e72bdb))


### Documentation

* **plans:** chunk 2026-04-28 security gap-fill into 4 implementation plans ([#294](https://github.com/djm204/frankenbeast/issues/294)) ([bd26d85](https://github.com/djm204/frankenbeast/commit/bd26d85af9b5042eba305cad980e6b25ddbf8d07))

## [0.37.0](https://github.com/djm204/frankenbeast/compare/v0.36.0...v0.37.0) (2026-05-17)


### Features

* **orchestrator:** beast mode hardening — explicit resume, fail-closed deps, verification matrix ([#292](https://github.com/djm204/frankenbeast/issues/292)) ([c0dd018](https://github.com/djm204/frankenbeast/commit/c0dd01899fd429e4b80bfb85218f0f98890cc136))

## [0.36.0](https://github.com/djm204/frankenbeast/compare/v0.35.0...v0.36.0) (2026-05-11)


### Features

* **mcp-suite:** make fbeast a 1:1 proxy for frankenbeast ([#289](https://github.com/djm204/frankenbeast/issues/289)) ([84470d6](https://github.com/djm204/frankenbeast/commit/84470d68b60fa23b9f9e70f4881666cec37d1a72))


### Bug Fixes

* **mcp-suite:** mitigate hook hangs and uninstall residue ([#287](https://github.com/djm204/frankenbeast/issues/287)) ([b939d36](https://github.com/djm204/frankenbeast/commit/b939d36b68c8c3336af4df491819b32ec962d168))

## [0.35.0](https://github.com/djm204/frankenbeast/compare/v0.34.0...v0.35.0) (2026-05-07)


### Features

* **web:** add observer analytics dashboard ([#286](https://github.com/djm204/frankenbeast/issues/286)) ([a375ec3](https://github.com/djm204/frankenbeast/commit/a375ec3c484f03bb67260050931609332d62bdd8))

## [0.34.0](https://github.com/djm204/frankenbeast/compare/v0.33.0...v0.34.0) (2026-04-28)


### Features

* add beast dashboard resume and path controls ([500999f](https://github.com/djm204/frankenbeast/commit/500999f8404ef680616341136cbe5c4eeef4fe10))
* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))
* add beasts dispatch station ([5d87015](https://github.com/djm204/frankenbeast/commit/5d87015b72c714481f846547bdfb847068478e00))
* add fbeast MCP suite — modular MCP servers for Claude Code ([#278](https://github.com/djm204/frankenbeast/issues/278)) ([116266b](https://github.com/djm204/frankenbeast/commit/116266b7a60f0d80d7e58661ba1325716ec6c18e))
* add init config wizard ([9129b73](https://github.com/djm204/frankenbeast/commit/9129b736bf0d0fd79a9089dab9eebe6178b1ff4d))
* add module toggle UI to beast dispatch dashboard ([98e9dba](https://github.com/djm204/frankenbeast/commit/98e9dbaf41142cc16df71dda34776a4db96200f3))
* add module toggle UI to beast dispatch dashboard ([c13a1a3](https://github.com/djm204/frankenbeast/commit/c13a1a34849b67b0f1a41c59cba749ee291a7d59))
* add skill directory equivalents for beast definitions ([789b567](https://github.com/djm204/frankenbeast/commit/789b567207768e639d6f4cc9c9ef5bcf95882566))
* add skill directory equivalents for beast definitions ([b63d31f](https://github.com/djm204/frankenbeast/commit/b63d31fbbfd5108e2c22207a62a6d46fb2160040))
* add tracked agent dashboard controls ([0f9b4db](https://github.com/djm204/frankenbeast/commit/0f9b4db305950ccdd1580fee28d8ba1ee751d9ee))
* add tracked agent dashboard controls ([fb13aa7](https://github.com/djm204/frankenbeast/commit/fb13aa740788a9ec7b81066d732318ce5314efb7))
* add tracked agent foundations ([4073878](https://github.com/djm204/frankenbeast/commit/407387806cb8972b2115e6aef489df02bf3c07fe))
* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))
* **brain:** add SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([11b7cf0](https://github.com/djm204/frankenbeast/commit/11b7cf0d97b541e0fe51cc66eb75d024259221d2))
* **brain:** SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([f933824](https://github.com/djm204/frankenbeast/commit/f93382433780009edb2d5f14eae8172769f29daa))
* **cli:** add franken and frkn as CLI aliases ([b651cd5](https://github.com/djm204/frankenbeast/commit/b651cd543408ba2e574f3da236d3c75d4354f2f5))
* close launch parity gaps ([#284](https://github.com/djm204/frankenbeast/issues/284)) ([7309143](https://github.com/djm204/frankenbeast/commit/7309143648bba36b0788c0b44446455c9a61821a))
* complete dual-mode launch chunks 6-8 and fix adapter wrapping ([#282](https://github.com/djm204/frankenbeast/issues/282)) ([b86792d](https://github.com/djm204/frankenbeast/commit/b86792dac542751035d676230e7481238329a974))
* complete MCP launch chunks 1-5 and canonicalize .fbeast storage ([#279](https://github.com/djm204/frankenbeast/issues/279)) ([22c8ac3](https://github.com/djm204/frankenbeast/commit/22c8ac3ffea24c5a252ab466277ec63261d1ed2d))
* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))
* dashboard SSE routes and web UI panels ([0c8c8e0](https://github.com/djm204/frankenbeast/commit/0c8c8e0520be173cd921edda6c424cc41e7b1292))
* **dashboard:** add beasts dispatch station ([2e5537a](https://github.com/djm204/frankenbeast/commit/2e5537a3cdecc078e55d2ecdfb84c62735bdf265))
* **franken-orchestrator:** add intelligent LLM caching ([c00307c](https://github.com/djm204/frankenbeast/commit/c00307c91c7612f38aa86962f07d04e7feec6b61))
* **franken-orchestrator:** cache repeated planning and issue prompts ([89b3591](https://github.com/djm204/frankenbeast/commit/89b3591b3b92213f14129f60d4cce3b40b15b941))
* implement tracked agent init workflow ([366cc75](https://github.com/djm204/frankenbeast/commit/366cc756338774124ee5a4928a9ff451efec3bbd))
* launch tracked agents from the dashboard ([fa33f0e](https://github.com/djm204/frankenbeast/commit/fa33f0e2b18fecd2e16fb5e0b26b57063da57bb6))
* **network:** add config-driven network operator control plane ([816ef85](https://github.com/djm204/frankenbeast/commit/816ef853cb0a74ef3d700dc365c2ad4fd198dba4))
* **network:** support managed service config overrides ([57974f1](https://github.com/djm204/frankenbeast/commit/57974f16a8a6cdc909f74cb1c1be47a6c7ae14ae))
* **orchestrator:** add 6 provider adapters + shared handoff (Phase 3.3-3.8) ([58f5f10](https://github.com/djm204/frankenbeast/commit/58f5f1016a644160046d7cc38e3c147d2cde76a1))
* **orchestrator:** last-mile wiring — activate consolidation components in production runtime ([#275](https://github.com/djm204/frankenbeast/issues/275)) ([d318813](https://github.com/djm204/frankenbeast/commit/d318813518c99aede74aedc3ed9c4577cec114f4))
* **orchestrator:** persist beast runs attempts and logs ([b8344e8](https://github.com/djm204/frankenbeast/commit/b8344e8767b4b3bbc5fdb9db67cbf34a645abf5b))
* **orchestrator:** support upstream repo targeting for issues ([414b7e1](https://github.com/djm204/frankenbeast/commit/414b7e1c33e5762c5966b55d05932ef02ba2fe3a))
* **orchestrator:** support upstream repo targeting for issues ([20d0585](https://github.com/djm204/frankenbeast/commit/20d058503589bdf940b4cbc497b5e22ec3310fe8))
* **orchestrator:** unify issue pipeline with BeastLoop and optimize context window ([ffa6299](https://github.com/djm204/frankenbeast/commit/ffa6299f446663cc724da6311467824d75bed0c5))
* Phase 3 — Provider Registry + Adapters ([0ceb582](https://github.com/djm204/frankenbeast/commit/0ceb582f95a7ac7cac877adeb6b08bbe4aa9efd1))
* Phase 4 — Security Middleware ([2f4112b](https://github.com/djm204/frankenbeast/commit/2f4112bac8f0d8940ef141f64c7229c397535eea))
* Phase 4.5 — Comms Integration ([a3e8053](https://github.com/djm204/frankenbeast/commit/a3e80537a5e1413aab5cedd976c9d6724e796266))
* Phase 5 — Skill Loading ([bc99631](https://github.com/djm204/frankenbeast/commit/bc99631f27cd2ea1b4072e19998b3fc89eb389b0))
* Phase 6 — Absorb Reflection into Critique ([82ac47d](https://github.com/djm204/frankenbeast/commit/82ac47d6a67763a622f2d24058e6c30dbe989c46))
* Phase 7 — Observer Audit Trail ([ea50e97](https://github.com/djm204/frankenbeast/commit/ea50e97b7b4d88c3a0e7261be8d5b08bb630441e))
* Phase 8 — Wire Everything Together (Core) ([12d5293](https://github.com/djm204/frankenbeast/commit/12d52933d8ac27d5b2d46a24229fc94cf3c8c7d9))
* Plan 1 — Foundation Execution Pipeline ([bc4cc63](https://github.com/djm204/frankenbeast/commit/bc4cc63b958dfe1d9763056f69b5495b7272b73e))
* secret store with 4 pluggable backends ([f05846f](https://github.com/djm204/frankenbeast/commit/f05846f70dbc6b6815ae4568c829d9eedc0a1670))
* **types:** add brain interfaces and BrainSnapshot types (Phase 2.1) ([5167997](https://github.com/djm204/frankenbeast/commit/5167997c99954fd37d66822ad8efb87913f0b432))
* **types:** brain interfaces + BrainSnapshot types (Phase 2.1) ([f2ed2fd](https://github.com/djm204/frankenbeast/commit/f2ed2fd52257c8fc44f1005bddc924af16d24177))
* **web:** add AgentActionBar with force restart AlertDialog ([38be1e7](https://github.com/djm204/frankenbeast/commit/38be1e7e156d4bd3f2cfa33300d21065d7435574))
* **web:** add AgentDetailEdit with editable form and dirty tracking ([f69fc61](https://github.com/djm204/frankenbeast/commit/f69fc6102bc2c8a5ff4b6819c9e5e0c77ec9c01d))
* **web:** add AgentDetailPanel composing slide-in, readonly, and action bar ([1bfa3f1](https://github.com/djm204/frankenbeast/commit/1bfa3f1f3128a794a33b0e16dc89ae5220a1cdeb))
* **web:** add AgentDetailReadonly with accordion sections ([f63863f](https://github.com/djm204/frankenbeast/commit/f63863ff16804226124fce4e3a4102bb3049c7c6))
* **web:** add AgentList with search, density toggle, and empty state ([4e3525e](https://github.com/djm204/frankenbeast/commit/4e3525e396a540a717cdd51b9d4ab08170f7954b))
* **web:** add AgentRow component with density variants ([3d34665](https://github.com/djm204/frankenbeast/commit/3d3466579df89e9e55ee00ad6a6607e0b98233e5))
* **web:** add BeastsPage root component with agent list and detail panel ([a346104](https://github.com/djm204/frankenbeast/commit/a34610456813f100ef32256fe2a89de2f0132456))
* **web:** add dashboard network operator controls ([1cafbba](https://github.com/djm204/frankenbeast/commit/1cafbba2f7542e5561fb3bc8863fe1458fce0575))
* **web:** add dashboard page with skills, security, and provider panels ([d4e4bb4](https://github.com/djm204/frankenbeast/commit/d4e4bb445c20e82707279e9764723bf7af1395b0))
* **web:** add LogViewerModal with fullscreen toggle and search ([62352d1](https://github.com/djm204/frankenbeast/commit/62352d1fcc8de315c2517ea03ea66de26c1ef5d8))
* **web:** add shared form components (gap banner, provider select, preset cards, file picker) ([778dd39](https://github.com/djm204/frankenbeast/commit/778dd39878fbe06e6236b3174790e3dc3ad57a4a))
* **web:** add SinglePageForm accordion mode and fix lightningcss dep ([6aaece3](https://github.com/djm204/frankenbeast/commit/6aaece3d68aa971b87680266216d95b96fc12d0c))
* **web:** add SlideInPanel aside with CSS transitions ([63a27b0](https://github.com/djm204/frankenbeast/commit/63a27b0d0004c4564c4f557107d940cf90d0607f))
* **web:** add StatusLight component with glowing indicators ([e9437cf](https://github.com/djm204/frankenbeast/commit/e9437cffb4213eb44b4d5f2de049878e0b81c561))
* **web:** add token estimator and path normalization utilities ([08e9ca2](https://github.com/djm204/frankenbeast/commit/08e9ca293e9a1c49f17447930f19618584d7b80e))
* **web:** add wizard dialog shell with step indicator ([73bf365](https://github.com/djm204/frankenbeast/commit/73bf365242e060e3530af193c78fe8530bb5a7eb))
* **web:** add wizard steps 1-4 (identity, workflow, LLM targets, modules) ([4145da5](https://github.com/djm204/frankenbeast/commit/4145da542e657f98f39f75e90de31ffe1bc1e399))
* **web:** add Zustand beast store with wizard and edit slices ([c5d385b](https://github.com/djm204/frankenbeast/commit/c5d385b2cf5e26ce12f528fb038051f9ad107a85))
* **web:** beasts panel UX redesign — list-first agent management ([d192688](https://github.com/djm204/frankenbeast/commit/d1926889244ac00733621e09a6c43987ed3aeab7))
* **web:** configure Tailwind CSS v4 with beast theme tokens ([5b39266](https://github.com/djm204/frankenbeast/commit/5b39266ae3ed3bd03f62c6b3fe7304369f1b972a))
* **web:** extend beast-api with killAgent, patchAgentConfig, and extended config types ([b4c4df8](https://github.com/djm204/frankenbeast/commit/b4c4df81dff6126d02eac017160ab67d9ce2fa46))
* **web:** refresh dashboard shell and controls ([570383f](https://github.com/djm204/frankenbeast/commit/570383f35f7c0f53fb7c8bf0eeb9b5ca73c4a7c8))
* **web:** refresh dashboard shell UX and controls ([7d103d9](https://github.com/djm204/frankenbeast/commit/7d103d97efc3d5c76e85d952c786bf3f8c20130a))
* **web:** wire AgentDetailEdit into detail panel edit mode ([9079ab2](https://github.com/djm204/frankenbeast/commit/9079ab2455ac772d3a264a548a16e69c0a791e93))
* **web:** wire BeastsPage into ChatShell, replace BeastDispatchPage ([4ad6706](https://github.com/djm204/frankenbeast/commit/4ad67069948be4fcda92a527851dde08819b5582))
* **web:** wire wizard steps, add module config forms, fix UX spacing ([ba61b6c](https://github.com/djm204/frankenbeast/commit/ba61b6c22d9ea5f375fdd875aa9ce3b6cf34647b))
* wire critique and governor modules in dep-factory (Tiers 3-4) ([8d55339](https://github.com/djm204/frankenbeast/commit/8d553399167860bad06a03c85e5b6045a0fb8b1e))
* wire real Firewall, Skills, Memory modules into BeastLoop (Tiers 1-2) ([b835f52](https://github.com/djm204/frankenbeast/commit/b835f529b6167984d54586d8194485664418eef6))


### Bug Fixes

* address 10 review issues on dashboard chunk ([037a57a](https://github.com/djm204/frankenbeast/commit/037a57a2538682233612143e02f289cd88a19cb2))
* address 10 review issues on dashboard chunk ([df52d71](https://github.com/djm204/frankenbeast/commit/df52d7152350c03f741f64ee55ee802da1da81b6))
* **beasts:** resolve 3 high-severity discrepancies from Pass 7 audit ([bdc0f2c](https://github.com/djm204/frankenbeast/commit/bdc0f2cc4f1a85c3037c4e1b5c56143f30fd35ad))
* **beasts:** resolve all DISCREPANCIES.md findings from Plan 1 ([5679beb](https://github.com/djm204/frankenbeast/commit/5679beb7c72fb4adad3aa946af7f4879f0eab086))
* **beasts:** resolve all Pass 6 Deep Audit findings (R1-R8) ([a9eac61](https://github.com/djm204/frankenbeast/commit/a9eac6144d012928c013a5e4fbcb29a803fc9213))
* **beasts:** resolve Pass 4/5 truth audit findings ([ba0908b](https://github.com/djm204/frankenbeast/commit/ba0908be6512cc0161d648cc1ed4de81823adeab))
* broaden start endpoint status guard and clear selection on agent delete ([45026bf](https://github.com/djm204/frankenbeast/commit/45026bf0f7b7fc5edede087e00176f6ed09d3493))
* **ci:** add lightningcss-linux-x64-gnu as explicit optional dep ([0ec3262](https://github.com/djm204/frankenbeast/commit/0ec3262e7850ac5f80682df2ba420afa7619d91c))
* **ci:** remove explicit lightningcss-linux-x64-gnu dep, sync lockfile ([6eb7d09](https://github.com/djm204/frankenbeast/commit/6eb7d09aa703779819931420905ec0f9790f16a7))
* **ci:** sync package-lock.json with @fbeast/mcp-suite workspace ([#280](https://github.com/djm204/frankenbeast/issues/280)) ([cf1bdf6](https://github.com/djm204/frankenbeast/commit/cf1bdf681acbd2866bdc8b82c17ab12fca0c2858))
* **comms:** resolve build errors and unify websocket types ([2669d44](https://github.com/djm204/frankenbeast/commit/2669d4487bdfab9ef3ba522ce5a2dfa4b929cc7f))
* **comms:** use concrete http request and response types ([7624751](https://github.com/djm204/frankenbeast/commit/762475103ac4e7135da0de7e41cb8d6fa51054d1))
* **consolidation:** address review findings — lockfile, comms routes, docs ([e406cc2](https://github.com/djm204/frankenbeast/commit/e406cc2b32cd977f6212b05a300a96ae78480914))
* dashboard review fixes, dispatch config stripping, error logging ([cdcf969](https://github.com/djm204/frankenbeast/commit/cdcf969541adfd69bca4a5ac9d4676571b639773))
* fix the connection between dashboard and backend, and make some UI changes ([d137437](https://github.com/djm204/frankenbeast/commit/d1374374b3e0e6195b58a7fd8f19a74dc7f6a40f))
* honor run config provider and model precedence ([17d3432](https://github.com/djm204/frankenbeast/commit/17d3432f858d2590f2cb0683dbd2b661bd667fab))
* **network:** harden startup flow and dashboard connectivity ([b881f2b](https://github.com/djm204/frankenbeast/commit/b881f2bd2d7bf5aa68e9e1f76986d18204811021))
* **network:** harden startup flow and dashboard connectivity ([c312e9f](https://github.com/djm204/frankenbeast/commit/c312e9fd4dd6e2db0f3388da765a3bcb6d7e1b92))
* **observer:** fix cost tracking and document implementation gaps ([7054989](https://github.com/djm204/frankenbeast/commit/7054989522894d5bd2429d71ef73d041e9599725))
* **observer:** fix zero-cost tracking and document implementation gaps ([c75c322](https://github.com/djm204/frankenbeast/commit/c75c322b46dc804873cff78c1ae8756104092cb7))
* **orchestrator:** add missing @franken/critique and @franken/governor dependencies ([31e71f0](https://github.com/djm204/frankenbeast/commit/31e71f01d4aacd062ec42aebcf7bca3762a7de39))
* **orchestrator:** address Phase 3 review gaps + document residuals ([bfc84ee](https://github.com/djm204/frankenbeast/commit/bfc84ee3f4afa95957100635381a1cbc33fe16f7))
* **orchestrator:** honor provider selection and fallback semantics ([abf1b77](https://github.com/djm204/frankenbeast/commit/abf1b776226e67257ec39e2d34cd359bc3e7eb95))
* **orchestrator:** isolate issue stage sessions ([#212](https://github.com/djm204/frankenbeast/issues/212)) ([44a2c61](https://github.com/djm204/frankenbeast/commit/44a2c617327540bfd04253062e6017487656a3e2))
* **orchestrator:** make one-shot issues issue-aware and resumable ([09488cb](https://github.com/djm204/frankenbeast/commit/09488cb6f49ee2179ce9d2d0cfaff2f19cd1ef4f))
* **orchestrator:** populate phase in ChatRuntime.result(), update docs ([#277](https://github.com/djm204/frankenbeast/issues/277)) ([ec02071](https://github.com/djm204/frankenbeast/commit/ec02071c8987d8b1794784c09a9c2f8e98bb8f33))
* **orchestrator:** resolve Chunk A residuals R1-R4 ([7572d68](https://github.com/djm204/frankenbeast/commit/7572d68b62c520e4745f9d218f4c5806af71df79))
* **orchestrator:** standardize issue execution via chunk files ([63942f6](https://github.com/djm204/frankenbeast/commit/63942f6b2a6aff3088a1f5c55c652719717fe7f1))
* **orchestrator:** standardize issue execution via chunk files ([1e6d2eb](https://github.com/djm204/frankenbeast/commit/1e6d2ebbd6e8ad662ca6d70158078bf65070c28a))
* **orchestrator:** standardize subprocess failures ([#213](https://github.com/djm204/frankenbeast/issues/213)) ([130bce2](https://github.com/djm204/frankenbeast/commit/130bce266b71dcc84ba3e3b463d8ff5b4b46a475))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([1e88e62](https://github.com/djm204/frankenbeast/commit/1e88e6222bc1149311fb8ade17ac8eafa3525bc0))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([33dbf5a](https://github.com/djm204/frankenbeast/commit/33dbf5a483debc2460116f2b1cbbf0cd029a8061))
* **release:** hoist changelog-sections to top level so all packages show refactor commits ([4ad202e](https://github.com/djm204/frankenbeast/commit/4ad202e6d2cb4925e5cbd59beb973ec9c05499cf))
* residual one-shots (comms cleanup, HITL test, checkpoint flush, PROGRESS.md) ([e105db3](https://github.com/djm204/frankenbeast/commit/e105db3fe067c6473d3f2a4bc43fc85756487018))
* satisfy dashboard control typecheck ([065a566](https://github.com/djm204/frankenbeast/commit/065a566b14ddc66dd3d8fb034b575f538c889f4a))
* **skills:** fix global skill discovery validation failures ([2dc938e](https://github.com/djm204/frankenbeast/commit/2dc938e70ace981a5b1ecebe89c5d290d4dca4c5))
* **skills:** set source to GLOBAL and add interface field in skill flattener ([035d6be](https://github.com/djm204/frankenbeast/commit/035d6be862e03a91615866a9fa9ff3e63289617a))
* **skills:** use Object.values to avoid unused destructured variable ([f84a15b](https://github.com/djm204/frankenbeast/commit/f84a15b41eae9edf266eab9fd2a079115abf6481))
* use --json flag for agent-skills CLI discovery ([6ddc4da](https://github.com/djm204/frankenbeast/commit/6ddc4da7d0a98c6b988a6cefbdc2244d43dadbaf))
* use --json flag for agent-skills CLI discovery ([3549dc8](https://github.com/djm204/frankenbeast/commit/3549dc8930c3a785e24957406af9b4db8eddbb1f))
* **web:** add missing available/failoverOrder to test mocks ([257a66f](https://github.com/djm204/frankenbeast/commit/257a66f5449a3d5367f24be294d9f18c05e14465))
* **web:** address critical review findings ([cf29b90](https://github.com/djm204/frankenbeast/commit/cf29b90552b663107088701b2e4820803d79d78f))
* **web:** fix launch wiring, fix Tailwind CSS layer conflict, improve spacing ([9d88618](https://github.com/djm204/frankenbeast/commit/9d8861801a6bf85235946948175f0fb74ffccaaa))
* **web:** resolve TypeScript strict null check errors across beasts components ([00493a4](https://github.com/djm204/frankenbeast/commit/00493a4afee7df9cb462344ece3ae1b81976d82b))


### Refactoring

* **brain:** delete legacy episodic memory and types ([c627d6a](https://github.com/djm204/frankenbeast/commit/c627d6ae2e878f454dbbeacda32974c2d12ea393))
* **brain:** delete legacy episodic memory and types ([e620c62](https://github.com/djm204/frankenbeast/commit/e620c622d3fb25b338e5ce7e5417f82be61163d0))
* **orchestrator:** migrate dep-factory to consolidated components ([e432b6d](https://github.com/djm204/frankenbeast/commit/e432b6dd845a059e292df70aba3f18c47f9cafe8))


### Miscellaneous

* add architecture docs and update brain packaging ([38652e9](https://github.com/djm204/frankenbeast/commit/38652e967f4065c199c187650add570cebdaedea))
* add docs ([72d0814](https://github.com/djm204/frankenbeast/commit/72d0814a39970990887bea0aff431c5030a89271))
* add firewall, skills, brain workspace deps to orchestrator ([a8317b7](https://github.com/djm204/frankenbeast/commit/a8317b74d0ed177e55ee46eaa1da6cabcd3ac6ad))
* consolidate release-please into single PR for all version bumps ([59ad9c9](https://github.com/djm204/frankenbeast/commit/59ad9c905fc0fe301ab90321e140cabb723d70e1))
* delete auto merge workflow that doesnt work ([c496042](https://github.com/djm204/frankenbeast/commit/c4960427453f48d183d08d945e7c9ae6b8a51a0e))
* **docs:** delete old docs ([abeeb7f](https://github.com/djm204/frankenbeast/commit/abeeb7f5b7757e6cf0227d521728a6628dd5ab05))
* **franken-observer:** implement fix-issue-89-costcalculator-silently-returns-0-f ([ca26308](https://github.com/djm204/frankenbeast/commit/ca2630882bf79032e66da42fce92f410c35afe7c))
* **franken-orchestrator:** implement you-are-hardening-chunk-homepfkdevfrankenbeas ([362d813](https://github.com/djm204/frankenbeast/commit/362d81366976d04ea822f3d32797b8525504891d))
* implement you-are-hardening-chunk-homepfkdevfrankenbeas ([1b1917c](https://github.com/djm204/frankenbeast/commit/1b1917ca8feaf0bdcea735876253d7918cb3d619))
* **main:** release 0.13.0 ([5ae747f](https://github.com/djm204/frankenbeast/commit/5ae747fbf4ed0a65b043a06b9013fe94222fe913))
* **main:** release 0.14.0 ([95bafc4](https://github.com/djm204/frankenbeast/commit/95bafc4f10b49c084a7914da10a15992d27a4022))
* **main:** release 0.14.0 ([5a74920](https://github.com/djm204/frankenbeast/commit/5a74920d618d70fb29d5ca3f5e409b898b43f9e7))
* **main:** release 0.14.1 ([19eae53](https://github.com/djm204/frankenbeast/commit/19eae53eace7b8db7b1fddaa03d1b5ca7c1e3ec0))
* **main:** release 0.14.1 ([bdcbea8](https://github.com/djm204/frankenbeast/commit/bdcbea8ae78825a17a5f8e91156741af236be65c))
* **main:** release 0.14.2 ([84bff28](https://github.com/djm204/frankenbeast/commit/84bff28f92c869bff0e46bbdc03c42d41b85cf34))
* **main:** release 0.14.2 ([8351789](https://github.com/djm204/frankenbeast/commit/835178959e3a387c8122992fef8f74d17e9626ee))
* **main:** release 0.15.0 ([67049f2](https://github.com/djm204/frankenbeast/commit/67049f262cff7ca4ee2ffade5603c2bc9df3e39c))
* **main:** release 0.15.0 ([a303567](https://github.com/djm204/frankenbeast/commit/a30356712ef8f6a844e73f5c248e3c809b1979c6))
* **main:** release 0.16.0 ([4a7b97d](https://github.com/djm204/frankenbeast/commit/4a7b97dd3d45d7944fa3f396f6202a769e7f3a6e))
* **main:** release 0.16.0 ([291ff80](https://github.com/djm204/frankenbeast/commit/291ff80b190d72bc48a9c2cf259fb4f09f8d639c))
* **main:** release 0.16.1 ([3eecb23](https://github.com/djm204/frankenbeast/commit/3eecb23d6f466f94d76328c147fe51b9f9663182))
* **main:** release 0.16.1 ([9d08a35](https://github.com/djm204/frankenbeast/commit/9d08a353b62433bad58f989fb8e6ead9f541fc34))
* **main:** release 0.16.2 ([7c74ef0](https://github.com/djm204/frankenbeast/commit/7c74ef0ba9077ddff64abb21641aa3b30f66c172))
* **main:** release 0.16.2 ([2d0015e](https://github.com/djm204/frankenbeast/commit/2d0015edbcbddd50356c57f63802df06f1e1b2c9))
* **main:** release 0.16.3 ([33fb882](https://github.com/djm204/frankenbeast/commit/33fb88281508bbe968e96f45aa808d9e40d5ae70))
* **main:** release 0.16.3 ([d2c6b2a](https://github.com/djm204/frankenbeast/commit/d2c6b2a6be3758f695374037c701e06148f96f82))
* **main:** release 0.17.0 ([9350350](https://github.com/djm204/frankenbeast/commit/9350350f56b8b0a91e162bd8c1b9dfc57c0823fb))
* **main:** release 0.17.0 ([7828796](https://github.com/djm204/frankenbeast/commit/78287965313033b6f93c3d9dca3e446f5439c14b))
* **main:** release franken-critique 0.4.0 ([8c506d9](https://github.com/djm204/frankenbeast/commit/8c506d90279c82e9c38ea6ca65d4fb11b0b7ee11))
* **main:** release franken-critique 0.4.0 ([dc1150b](https://github.com/djm204/frankenbeast/commit/dc1150b5f6e0b838b6326037e0be70a96b25d455))
* **main:** release franken-critique 0.4.0 ([9ab0ec2](https://github.com/djm204/frankenbeast/commit/9ab0ec20a2afc9715436e9267245ba4d71be7d9c))
* **main:** release franken-critique 0.4.0 ([3329e93](https://github.com/djm204/frankenbeast/commit/3329e93066bb40ebc8f4cd47839a1052ae78d807))
* **main:** release franken-critique 0.4.0 ([9b62707](https://github.com/djm204/frankenbeast/commit/9b627076d79f8b6ab92d13ccedb5294b12f35bde))
* **main:** release franken-governor 0.4.0 ([da52fa4](https://github.com/djm204/frankenbeast/commit/da52fa41013e85635eb6a59f5001ac32f60b2365))
* **main:** release franken-governor 0.4.0 ([0430d42](https://github.com/djm204/frankenbeast/commit/0430d42062f4e658de609ffeb8862407dc28a008))
* **main:** release franken-governor 0.4.0 ([6faab25](https://github.com/djm204/frankenbeast/commit/6faab25d6676329e5d7fbc4f84d304a30c90817f))
* **main:** release franken-governor 0.4.0 ([4e66333](https://github.com/djm204/frankenbeast/commit/4e663333c719fbb61541da92aa5efa142e44cec6))
* **main:** release franken-governor 0.4.0 ([422adc0](https://github.com/djm204/frankenbeast/commit/422adc0b0a69a102b38027c8677bce3801933d77))
* **main:** release franken-observer 0.3.2 ([c61c47d](https://github.com/djm204/frankenbeast/commit/c61c47d0b73275e1ee7514fa37f3b7ef733e1e7d))
* **main:** release franken-observer 0.3.2 ([84cc110](https://github.com/djm204/frankenbeast/commit/84cc110c0e2f161f797151f0e92326433a43ddd9))
* **main:** release franken-observer 0.4.0 ([48b478a](https://github.com/djm204/frankenbeast/commit/48b478ac7316bfae25a43f0460f232138e883df6))
* **main:** release franken-observer 0.4.0 ([cb218a4](https://github.com/djm204/frankenbeast/commit/cb218a46d5dbe8aa3ac21eac4922189ddb6914e8))
* **main:** release franken-observer 0.4.0 ([8a6c421](https://github.com/djm204/frankenbeast/commit/8a6c4214ddb33af629897ea01caf03a97cae9af3))
* **main:** release franken-observer 0.4.0 ([92febeb](https://github.com/djm204/frankenbeast/commit/92febeb6b856f9c0af790beee2e54be80159624b))
* **main:** release franken-orchestrator 0.11.0 ([dbba9e9](https://github.com/djm204/frankenbeast/commit/dbba9e95f25530db1c3a5a6de738eae6c568ffe3))
* **main:** release franken-orchestrator 0.11.0 ([0a8862e](https://github.com/djm204/frankenbeast/commit/0a8862e02dbb6adf852d687386d3cbb4ded1ba9f))
* **main:** release franken-orchestrator 0.11.1 ([77db6f6](https://github.com/djm204/frankenbeast/commit/77db6f61228a1678c2d2f237cb421c395c1eff25))
* **main:** release franken-orchestrator 0.11.1 ([949bd84](https://github.com/djm204/frankenbeast/commit/949bd84557d7428d374b4447e1d8356e7df26af2))
* **main:** release franken-orchestrator 0.12.0 ([de2c822](https://github.com/djm204/frankenbeast/commit/de2c822d4dde5b70e98db06678646be8e98ea53b))
* **main:** release franken-orchestrator 0.12.0 ([b56a34d](https://github.com/djm204/frankenbeast/commit/b56a34d554b495278b4037cc6c5cefb9d56e33df))
* **main:** release franken-orchestrator 0.13.0 ([7bfef3d](https://github.com/djm204/frankenbeast/commit/7bfef3dc1dc8610bf7b05d621f5da28c91bfbef0))
* **main:** release franken-orchestrator 0.13.0 ([3608647](https://github.com/djm204/frankenbeast/commit/36086470d523deb50d7e78542c1f2338980cc674))
* **main:** release franken-orchestrator 0.14.0 ([17ab09e](https://github.com/djm204/frankenbeast/commit/17ab09e21765c8ac894627053937fd365a60dc6b))
* **main:** release franken-orchestrator 0.14.0 ([36ed876](https://github.com/djm204/frankenbeast/commit/36ed876352be18ee97ff468e131da37d68a1a312))
* **main:** release franken-orchestrator 0.14.1 ([3d8b754](https://github.com/djm204/frankenbeast/commit/3d8b754310111e59c50f0c2d180c441380a35b24))
* **main:** release franken-orchestrator 0.14.1 ([2d784f7](https://github.com/djm204/frankenbeast/commit/2d784f79eaa3f34db01f59739c46b67e4d0c54e6))
* **main:** release franken-orchestrator 0.14.2 ([8a41a9f](https://github.com/djm204/frankenbeast/commit/8a41a9f7665826b8994967e3972369e4bf845b8c))
* **main:** release franken-orchestrator 0.14.2 ([3596d99](https://github.com/djm204/frankenbeast/commit/3596d99dc1416808b33a794b915b4fdffa487357))
* **main:** release franken-orchestrator 0.15.0 ([a5795d1](https://github.com/djm204/frankenbeast/commit/a5795d1b3714d8e88d21098494d1c45a6414b757))
* **main:** release franken-orchestrator 0.15.0 ([2f50aad](https://github.com/djm204/frankenbeast/commit/2f50aadde3aa7f8854ac8065e6643f94cd25959b))
* **main:** release franken-orchestrator 0.16.0 ([bc5f0b6](https://github.com/djm204/frankenbeast/commit/bc5f0b693b741a7b5901fe4564e3ec4e5d2452e0))
* **main:** release franken-orchestrator 0.16.0 ([1510dc9](https://github.com/djm204/frankenbeast/commit/1510dc94837ea66c15756f3869dc145ee9cc6ed2))
* **main:** release franken-planner 0.4.0 ([7f17b8e](https://github.com/djm204/frankenbeast/commit/7f17b8e22a28a96c642c0239461d08a06e9da2a1))
* **main:** release franken-planner 0.4.0 ([521f2c1](https://github.com/djm204/frankenbeast/commit/521f2c128558af40065111d6ecf5e650089050b3))
* **main:** release franken-planner 0.4.0 ([4ad33cf](https://github.com/djm204/frankenbeast/commit/4ad33cf35c2c22efe34359191e510a6c671d5b1f))
* **main:** release franken-skills 0.4.0 ([5e13bfe](https://github.com/djm204/frankenbeast/commit/5e13bfe55cc6bc616fd2d05e7d9b8e074500b3fc))
* **main:** release franken-skills 0.4.0 ([525b447](https://github.com/djm204/frankenbeast/commit/525b4471e19c95fcb4966c8ab5f2ae01500ffd65))
* **main:** release franken-skills 0.4.0 ([4de5013](https://github.com/djm204/frankenbeast/commit/4de50135f88e9f565d06abb50c188640a9ba3fdd))
* **main:** release franken-skills 0.4.0 ([bc03094](https://github.com/djm204/frankenbeast/commit/bc030943491c239ce9ced84e77b3f3e275a99afb))
* **main:** release franken-types 0.3.2 ([5d88dcb](https://github.com/djm204/frankenbeast/commit/5d88dcb63d5c43f7a66e79b4fd5c976c795df164))
* **main:** release franken-types 0.3.2 ([64381db](https://github.com/djm204/frankenbeast/commit/64381db3ca76cd36107dfb5a44e6b8c3a278561f))
* **main:** release franken-types 0.3.2 ([ab62699](https://github.com/djm204/frankenbeast/commit/ab62699ec265117d2ef72d4cd937034dc24b70c4))
* **main:** release franken-types 0.3.2 ([f43701b](https://github.com/djm204/frankenbeast/commit/f43701b48e1029af08c20fd09f6e0e8b200c2e44))
* **main:** release franken-types 0.3.2 ([f5e8572](https://github.com/djm204/frankenbeast/commit/f5e8572a4a4dc044e38520a5f54ffe31faedd39f))
* **main:** release franken-types 0.3.2 ([1412544](https://github.com/djm204/frankenbeast/commit/1412544ec61add96aa25c92a8b57e51c8e429cd8))
* **main:** release frankenfirewall 0.4.0 ([02e3d6a](https://github.com/djm204/frankenbeast/commit/02e3d6a9944c9e0a67cb04c5162fd0d21fbb6085))
* **main:** release frankenfirewall 0.4.0 ([d46094f](https://github.com/djm204/frankenbeast/commit/d46094f06b689bd1a96003f1db167f9996d99b39))
* **main:** release frankenfirewall 0.5.0 ([9c6a7dc](https://github.com/djm204/frankenbeast/commit/9c6a7dcb144316d4b9e11cf364ea234b58a958ea))
* **main:** release frankenfirewall 0.5.0 ([746f749](https://github.com/djm204/frankenbeast/commit/746f749120864d41b1de376f862120cc48389472))
* **main:** release frankenfirewall 0.5.0 ([d4488aa](https://github.com/djm204/frankenbeast/commit/d4488aa7ca5a71be9e8f5ea0d011d45baa40cc21))
* **package-lock:** update package-lock ([7105406](https://github.com/djm204/frankenbeast/commit/71054064b589f322a6d46502a39e09ff2372b6eb))
* release main ([41acdbe](https://github.com/djm204/frankenbeast/commit/41acdbe09c990c38ade8209b3283b4405399dcda))
* release main ([19664bb](https://github.com/djm204/frankenbeast/commit/19664bb4baf0e8e0acb4c7042bcfee7f0799526b))
* release main ([29f20c7](https://github.com/djm204/frankenbeast/commit/29f20c74d7e5b0d5633188d1c6aa14eb189d0cc8))
* release main ([f388c96](https://github.com/djm204/frankenbeast/commit/f388c9636e6b34f63dde32314cfada9935a52370))
* release main ([78fce35](https://github.com/djm204/frankenbeast/commit/78fce35668a8ef71ada15816587858e4f5499470))
* release main ([24ca434](https://github.com/djm204/frankenbeast/commit/24ca434931d802006ec3d7744f2c8d4de9723eb7))
* release main ([ebdbb58](https://github.com/djm204/frankenbeast/commit/ebdbb58c04e68ab5e14414dea2e5f200141c152e))
* release main ([490d5c4](https://github.com/djm204/frankenbeast/commit/490d5c42a79aeb79afb6fc1f00a39eaed09f6a34))
* release main ([50717e2](https://github.com/djm204/frankenbeast/commit/50717e2e2f6bd7c1dcc209e60d1b2cafed6af550))
* release main ([78d8495](https://github.com/djm204/frankenbeast/commit/78d849528ab990a50b2ed6859d98d10cab92b09f))
* release main ([48548f3](https://github.com/djm204/frankenbeast/commit/48548f32209176d6d9a1562fdb4725742ecb9515))
* release main ([1e760f3](https://github.com/djm204/frankenbeast/commit/1e760f3dde475636378bdba15afe4cbc13381239))
* release main ([d428ecd](https://github.com/djm204/frankenbeast/commit/d428ecd6e627d5c3c48cd0ef98c45a8eeca56d3e))
* release main ([55f726e](https://github.com/djm204/frankenbeast/commit/55f726e1af6e84f3401fd5ad14f452e7ac727f22))
* release main ([4ee81c5](https://github.com/djm204/frankenbeast/commit/4ee81c571b79f98e41e6b9531336b7781592e680))
* release main ([4e4ab4c](https://github.com/djm204/frankenbeast/commit/4e4ab4c4c7cde525fef815c057bae24f2c6b34c5))
* release main ([cb2643c](https://github.com/djm204/frankenbeast/commit/cb2643c48eb86850bd76e1e0cd3af0b2e8301990))
* release main ([ed75081](https://github.com/djm204/frankenbeast/commit/ed750811df44ebc431b3aeca32b2606b503b25f3))
* release main ([aca7ca8](https://github.com/djm204/frankenbeast/commit/aca7ca8eacd9fed4b189e38ab1742cfb0bf375d2))
* release main ([575ba5f](https://github.com/djm204/frankenbeast/commit/575ba5f659a5b3ea9d4e1d2f6c602217ef086ef6))
* release main ([c823154](https://github.com/djm204/frankenbeast/commit/c8231545bd31c69edbbcd8d5d8ef8ba87641e897))
* release main ([86a1f8d](https://github.com/djm204/frankenbeast/commit/86a1f8da0d2d4e547b3ad9df079da581bc947c80))
* release main ([9424d30](https://github.com/djm204/frankenbeast/commit/9424d303b7d2673f805a85338f029b5f40311be9))
* release main ([0cb248b](https://github.com/djm204/frankenbeast/commit/0cb248b7a1fda5821b7f7b1c14e2ece639cbde71))
* release main ([ffee28a](https://github.com/djm204/frankenbeast/commit/ffee28a05bf220a38b0aa10070f6116db0e3c042))
* release main ([ade7f4a](https://github.com/djm204/frankenbeast/commit/ade7f4a923f9ab55a36744d646e70c6da3d8310c))
* release main ([2d3cf22](https://github.com/djm204/frankenbeast/commit/2d3cf2261539e1012e7a82bced3848d5688283cf))
* release main ([a6d94d3](https://github.com/djm204/frankenbeast/commit/a6d94d3456a0f8d011f3ca629f0ca92e520c117e))
* release main ([cda3767](https://github.com/djm204/frankenbeast/commit/cda376733c6c0315470b068c04a9c22a2374bf78))
* release main ([32ccdeb](https://github.com/djm204/frankenbeast/commit/32ccdeb50094924a24da0d75cc9cf489e5435496))
* release main ([696580f](https://github.com/djm204/frankenbeast/commit/696580f097d1f7e982aa35e288eb06d89e86b13f))
* release main ([5e1ba59](https://github.com/djm204/frankenbeast/commit/5e1ba59e0ca6ff7296839508d551d97865adb8d1))
* release main ([8ae6599](https://github.com/djm204/frankenbeast/commit/8ae6599c1a9a30902d39c90e8789998f69424d66))
* release main ([7b7a0ff](https://github.com/djm204/frankenbeast/commit/7b7a0ffa7fa23d0ef398d38f21366d08c24010cd))
* release main ([ea3ffb4](https://github.com/djm204/frankenbeast/commit/ea3ffb4650c2eb8716f7a8b57750b88e6fa3ea2d))
* release main ([6c1bae4](https://github.com/djm204/frankenbeast/commit/6c1bae4ffc62e5d57b21b49fb4abfa4202068bc6))
* release main ([92b122d](https://github.com/djm204/frankenbeast/commit/92b122d377cb480c1f7e1f13150f3f8c49362099))
* release main ([973da3b](https://github.com/djm204/frankenbeast/commit/973da3bc20a6185adcf1b504c997cec4bd0f5170))
* release main ([d4a9d83](https://github.com/djm204/frankenbeast/commit/d4a9d8333d11593e0a678e520bd2f39a97c8ce7c))
* release main ([daed900](https://github.com/djm204/frankenbeast/commit/daed9006881558c39d010263f1c409be3785b09e))
* release main ([1ab0863](https://github.com/djm204/frankenbeast/commit/1ab086391aec199aa4685bcc65c0cf6b1a9ea0e6))
* release main ([db01295](https://github.com/djm204/frankenbeast/commit/db01295e7a3734d378c25c17fb5ad8d39e6891f2))
* release main ([4b47eca](https://github.com/djm204/frankenbeast/commit/4b47eca3bf14c4972f038bbd9e0f5bed31e1719c))
* release main ([fabea22](https://github.com/djm204/frankenbeast/commit/fabea2256bbf60ce9e81573564e599fedd7495c4))
* release main ([#211](https://github.com/djm204/frankenbeast/issues/211)) ([ad3e1a4](https://github.com/djm204/frankenbeast/commit/ad3e1a429d9d518254df9e81215d84fd17e6eac4))
* release main ([#214](https://github.com/djm204/frankenbeast/issues/214)) ([6fe0df8](https://github.com/djm204/frankenbeast/commit/6fe0df8c04d94121179bcf9da00fdfb3a025bf91))
* release main ([#273](https://github.com/djm204/frankenbeast/issues/273)) ([fbdd6a4](https://github.com/djm204/frankenbeast/commit/fbdd6a4429eaf727acc178c5952b629845defc7d))
* release main ([#281](https://github.com/djm204/frankenbeast/issues/281)) ([70c2d8d](https://github.com/djm204/frankenbeast/commit/70c2d8dea5bc63ed04048a60a33dc8be0d46a8c0))
* release main ([#283](https://github.com/djm204/frankenbeast/issues/283)) ([0d1cc48](https://github.com/djm204/frankenbeast/commit/0d1cc48f4f1a4f75a3fc447cabd274d5eb184f39))
* update README ([b514e04](https://github.com/djm204/frankenbeast/commit/b514e045599d44cb8d8236493a107defe4da4790))
* **web:** add Radix UI, Tailwind v4, and Zustand dependencies ([31bf91a](https://github.com/djm204/frankenbeast/commit/31bf91a4a1a25a21190e3f471e01c38c8d636764))


### Documentation

* add agent init workflow design and plan ([95421a0](https://github.com/djm204/frankenbeast/commit/95421a04cc78bc330acff3a1349af3948eb1e23e))
* add beasts dispatch design and implementation plan ([a2c2b77](https://github.com/djm204/frankenbeast/commit/a2c2b770b97c60f98a20a764f2c22563e851555d))
* add Chunk A residual issues ([51ba39e](https://github.com/djm204/frankenbeast/commit/51ba39eb81945e201bd7cb1be814ab2def6e901d))
* add comprehensive data flow guide ([441c310](https://github.com/djm204/frankenbeast/commit/441c310a14280aeb5456f71f9499c321183af45b))
* add consolidation plan, ADRs 027-031, specs, and remove stale docs ([69f04a5](https://github.com/djm204/frankenbeast/commit/69f04a5323ad4eafeb9572312acc315fac5add1b))
* add frankenbeast.example.json with all config properties ([814eaa8](https://github.com/djm204/frankenbeast/commit/814eaa8feb3c2bb965b99e4cd672d9a27ebb7c1b))
* add I5 and I6 residual issues for Phase 2 Brain Rewrite ([2ad7050](https://github.com/djm204/frankenbeast/commit/2ad70502db4c94d596bbfcddca766db0f1faf631))
* add issue-aware issues resume design and plan ([a87a74b](https://github.com/djm204/frankenbeast/commit/a87a74bdfe91c153ad0f40bd788ae29c958bdc84))
* add issues provider fallback design and plan ([8623a74](https://github.com/djm204/frankenbeast/commit/8623a74ada6b8aeb6bb86be82dfbbbb675b46dfb))
* add Phase 1 residual issues to minor-issues plan folder ([a64ea88](https://github.com/djm204/frankenbeast/commit/a64ea881518b65f6f2019755d59a6e842e91807a))
* add Phase 2 (Brain Rewrite) residual issues ([5bb9786](https://github.com/djm204/frankenbeast/commit/5bb97862657e2159b2349da44c2cfd8492cd4138))
* add Phase 4 residual issues ([7b840f9](https://github.com/djm204/frankenbeast/commit/7b840f9b7482a2ecc7b4633664e687b0b16f679c))
* add Phase 4.5 residual issues ([2b2e003](https://github.com/djm204/frankenbeast/commit/2b2e003e48cd6a8ea148d0e7861320ddd238d2ab))
* add Phase 5 residual issues ([b004987](https://github.com/djm204/frankenbeast/commit/b0049873525a91b38de3b13e9e3811dca6a3f0bc))
* add Phase 6 residual issues ([03f4302](https://github.com/djm204/frankenbeast/commit/03f430209bc5171b88440a0063b24c7c9ebfdfb4))
* add Phase 7 residual issues ([a098ee1](https://github.com/djm204/frankenbeast/commit/a098ee1d0b4433708891ca4d4d7b44a8eb428b7a))
* add Phase 8 residual issues ([b485954](https://github.com/djm204/frankenbeast/commit/b48595420e0ae3498adbcdba0230ab4353fba05f))
* add residuals master plan and chunk breakdown ([26b8d18](https://github.com/djm204/frankenbeast/commit/26b8d185ce731775280a1e8cd632622dbfc06cd2))
* add Secret Management guide to README and franken-web setup ([584e7cc](https://github.com/djm204/frankenbeast/commit/584e7cc97c556007cae1b6f2aa65ac99e84bdb79))
* add secret store to RAMP_UP and ARCHITECTURE ([a002d2a](https://github.com/djm204/frankenbeast/commit/a002d2aefbd8c4c9fb6e645e3119c1e191a40b23))
* add tracked agent workflow adr ([0d550a2](https://github.com/djm204/frankenbeast/commit/0d550a2f1ec16f286d2260a80e06374046ef3442))
* ADR-018 secret store architecture ([6b0f59f](https://github.com/djm204/frankenbeast/commit/6b0f59ffb0473336f98d85ffc8268a073159eb3e))
* ADR-019 secret backend comparison and recommendations ([524ef08](https://github.com/djm204/frankenbeast/commit/524ef08e09cca737786cbe329904f43fb5c0588c))
* describe tracked agent init workflow ([efeebb8](https://github.com/djm204/frankenbeast/commit/efeebb8d7be5d0eb1abe2ef9323269f09a7bf0d7))
* **issues:** document upstream repo targeting ([e8632ad](https://github.com/djm204/frankenbeast/commit/e8632ad9ada8689b0f6d3f48a48555ba68ab5c97))
* mark beastloop tiers 3-4 wiring as implemented ([2c4bdc4](https://github.com/djm204/frankenbeast/commit/2c4bdc489667acb4b8750594fcd88746bbcf707d))
* mark Chunk A residuals R1-R4 as resolved ([8758431](https://github.com/djm204/frankenbeast/commit/87584315ecd80ef623aeb9987b17f8403865c598))
* mark Phase 2 M1/M2 residuals as resolved ([b980eee](https://github.com/djm204/frankenbeast/commit/b980eeed164af2e965d84f2aad120f6788b78110))
* mark tiers 1-2 wiring design as implemented ([57ffee1](https://github.com/djm204/frankenbeast/commit/57ffee10153a7dc88632607a56d7b99f00188ea1))
* move completed plans into complete ([914c8c1](https://github.com/djm204/frankenbeast/commit/914c8c1caef4d5751589b1119910c04f82047d7e))
* **network:** add operator guide and ADR ([a396268](https://github.com/djm204/frankenbeast/commit/a396268d0893e131a7de7c9ff4ed4ca8ed310cc9))
* **plan:** add network operator design and implementation plan ([eef8acc](https://github.com/djm204/frankenbeast/commit/eef8acc2e0b435d3a9a1a0e3c4f38c870500da79))
* **plans:** add dashboard ux refresh design and plan ([2976f43](https://github.com/djm204/frankenbeast/commit/2976f4360cc84d35cbfdfe793fede52c8b69f39d))
* refresh init workflow design and plan ([d590651](https://github.com/djm204/frankenbeast/commit/d5906511dba6a7ee07d809987a4bef63e6329c07))
* sync ramp-up guides with workspace ([d989aa5](https://github.com/djm204/frankenbeast/commit/d989aa52b9c9378c45cf28c470e267f0e46caeed))
* update ARCHITECTURE, PROGRESS, and RAMP_UP for Plan 1 ([13a2038](https://github.com/djm204/frankenbeast/commit/13a20389b19c8c05e898b52b191cb91aefd8d8f6))
* update PROGRESS.md with Architecture Consolidation Phases 2-8 ([89ce9a0](https://github.com/djm204/frankenbeast/commit/89ce9a0ff075ee02cde17996b80d0d57b79057b6))
* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))
* update README, RAMP_UP, and ARCHITECTURE for current project state ([24f9952](https://github.com/djm204/frankenbeast/commit/24f9952f25e3b77d3cc7e768c2e35415eff71b5a))


### CI/CD

* auto-merge release please prs after ci ([5c9afbe](https://github.com/djm204/frankenbeast/commit/5c9afbe2c561cb9fae87b7fc00361e6c35aeaa4a))
* auto-merge release please prs after ci ([6e1557a](https://github.com/djm204/frankenbeast/commit/6e1557a7ed4cedf3f731b717c62451d5129d05c7))


### Tests

* **comms:** remove real socket listeners from websocket unit tests ([130b607](https://github.com/djm204/frankenbeast/commit/130b6070af14e8b8e40c2dddb6cf0769e7c5ffb5))
* **comms:** remove real socket listeners from websocket unit tests ([595cd07](https://github.com/djm204/frankenbeast/commit/595cd0799a7c2f389e3e86f10fa98154df99d26d))
* delete 26 fluff test files (~283 tests) identified by audit ([03358d4](https://github.com/djm204/frankenbeast/commit/03358d4cdc745197e48b61855ed77571a37a2939))
* **skills:** update agent-skills-cli test expectations for GLOBAL source and interface ([8ba8ccc](https://github.com/djm204/frankenbeast/commit/8ba8cccc48d3f5b9bcac69f7f10ec78198609201))

## [0.33.0](https://github.com/djm204/frankenbeast/compare/v0.32.1...v0.33.0) (2026-04-19)


### Features

* add beast dashboard resume and path controls ([500999f](https://github.com/djm204/frankenbeast/commit/500999f8404ef680616341136cbe5c4eeef4fe10))
* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))
* add beasts dispatch station ([5d87015](https://github.com/djm204/frankenbeast/commit/5d87015b72c714481f846547bdfb847068478e00))
* add fbeast MCP suite — modular MCP servers for Claude Code ([#278](https://github.com/djm204/frankenbeast/issues/278)) ([116266b](https://github.com/djm204/frankenbeast/commit/116266b7a60f0d80d7e58661ba1325716ec6c18e))
* add init config wizard ([9129b73](https://github.com/djm204/frankenbeast/commit/9129b736bf0d0fd79a9089dab9eebe6178b1ff4d))
* add module toggle UI to beast dispatch dashboard ([98e9dba](https://github.com/djm204/frankenbeast/commit/98e9dbaf41142cc16df71dda34776a4db96200f3))
* add module toggle UI to beast dispatch dashboard ([c13a1a3](https://github.com/djm204/frankenbeast/commit/c13a1a34849b67b0f1a41c59cba749ee291a7d59))
* add skill directory equivalents for beast definitions ([789b567](https://github.com/djm204/frankenbeast/commit/789b567207768e639d6f4cc9c9ef5bcf95882566))
* add skill directory equivalents for beast definitions ([b63d31f](https://github.com/djm204/frankenbeast/commit/b63d31fbbfd5108e2c22207a62a6d46fb2160040))
* add tracked agent dashboard controls ([0f9b4db](https://github.com/djm204/frankenbeast/commit/0f9b4db305950ccdd1580fee28d8ba1ee751d9ee))
* add tracked agent dashboard controls ([fb13aa7](https://github.com/djm204/frankenbeast/commit/fb13aa740788a9ec7b81066d732318ce5314efb7))
* add tracked agent foundations ([4073878](https://github.com/djm204/frankenbeast/commit/407387806cb8972b2115e6aef489df02bf3c07fe))
* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))
* **brain:** add SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([11b7cf0](https://github.com/djm204/frankenbeast/commit/11b7cf0d97b541e0fe51cc66eb75d024259221d2))
* **brain:** SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([f933824](https://github.com/djm204/frankenbeast/commit/f93382433780009edb2d5f14eae8172769f29daa))
* **cli:** add franken and frkn as CLI aliases ([b651cd5](https://github.com/djm204/frankenbeast/commit/b651cd543408ba2e574f3da236d3c75d4354f2f5))
* complete dual-mode launch chunks 6-8 and fix adapter wrapping ([#282](https://github.com/djm204/frankenbeast/issues/282)) ([100dd1f](https://github.com/djm204/frankenbeast/commit/100dd1f9b0bec44419e7412541e522f3785df472))
* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))
* dashboard SSE routes and web UI panels ([0c8c8e0](https://github.com/djm204/frankenbeast/commit/0c8c8e0520be173cd921edda6c424cc41e7b1292))
* **dashboard:** add beasts dispatch station ([2e5537a](https://github.com/djm204/frankenbeast/commit/2e5537a3cdecc078e55d2ecdfb84c62735bdf265))
* **franken-orchestrator:** add intelligent LLM caching ([c00307c](https://github.com/djm204/frankenbeast/commit/c00307c91c7612f38aa86962f07d04e7feec6b61))
* **franken-orchestrator:** cache repeated planning and issue prompts ([89b3591](https://github.com/djm204/frankenbeast/commit/89b3591b3b92213f14129f60d4cce3b40b15b941))
* implement tracked agent init workflow ([366cc75](https://github.com/djm204/frankenbeast/commit/366cc756338774124ee5a4928a9ff451efec3bbd))
* launch tracked agents from the dashboard ([fa33f0e](https://github.com/djm204/frankenbeast/commit/fa33f0e2b18fecd2e16fb5e0b26b57063da57bb6))
* **network:** add config-driven network operator control plane ([816ef85](https://github.com/djm204/frankenbeast/commit/816ef853cb0a74ef3d700dc365c2ad4fd198dba4))
* **network:** support managed service config overrides ([57974f1](https://github.com/djm204/frankenbeast/commit/57974f16a8a6cdc909f74cb1c1be47a6c7ae14ae))
* **orchestrator:** add 6 provider adapters + shared handoff (Phase 3.3-3.8) ([58f5f10](https://github.com/djm204/frankenbeast/commit/58f5f1016a644160046d7cc38e3c147d2cde76a1))
* **orchestrator:** last-mile wiring — activate consolidation components in production runtime ([#275](https://github.com/djm204/frankenbeast/issues/275)) ([d318813](https://github.com/djm204/frankenbeast/commit/d318813518c99aede74aedc3ed9c4577cec114f4))
* **orchestrator:** persist beast runs attempts and logs ([b8344e8](https://github.com/djm204/frankenbeast/commit/b8344e8767b4b3bbc5fdb9db67cbf34a645abf5b))
* **orchestrator:** support upstream repo targeting for issues ([414b7e1](https://github.com/djm204/frankenbeast/commit/414b7e1c33e5762c5966b55d05932ef02ba2fe3a))
* **orchestrator:** support upstream repo targeting for issues ([20d0585](https://github.com/djm204/frankenbeast/commit/20d058503589bdf940b4cbc497b5e22ec3310fe8))
* **orchestrator:** unify issue pipeline with BeastLoop and optimize context window ([ffa6299](https://github.com/djm204/frankenbeast/commit/ffa6299f446663cc724da6311467824d75bed0c5))
* Phase 3 — Provider Registry + Adapters ([0ceb582](https://github.com/djm204/frankenbeast/commit/0ceb582f95a7ac7cac877adeb6b08bbe4aa9efd1))
* Phase 4 — Security Middleware ([2f4112b](https://github.com/djm204/frankenbeast/commit/2f4112bac8f0d8940ef141f64c7229c397535eea))
* Phase 4.5 — Comms Integration ([a3e8053](https://github.com/djm204/frankenbeast/commit/a3e80537a5e1413aab5cedd976c9d6724e796266))
* Phase 5 — Skill Loading ([bc99631](https://github.com/djm204/frankenbeast/commit/bc99631f27cd2ea1b4072e19998b3fc89eb389b0))
* Phase 6 — Absorb Reflection into Critique ([82ac47d](https://github.com/djm204/frankenbeast/commit/82ac47d6a67763a622f2d24058e6c30dbe989c46))
* Phase 7 — Observer Audit Trail ([ea50e97](https://github.com/djm204/frankenbeast/commit/ea50e97b7b4d88c3a0e7261be8d5b08bb630441e))
* Phase 8 — Wire Everything Together (Core) ([12d5293](https://github.com/djm204/frankenbeast/commit/12d52933d8ac27d5b2d46a24229fc94cf3c8c7d9))
* Plan 1 — Foundation Execution Pipeline ([bc4cc63](https://github.com/djm204/frankenbeast/commit/bc4cc63b958dfe1d9763056f69b5495b7272b73e))
* secret store with 4 pluggable backends ([f05846f](https://github.com/djm204/frankenbeast/commit/f05846f70dbc6b6815ae4568c829d9eedc0a1670))
* **types:** add brain interfaces and BrainSnapshot types (Phase 2.1) ([5167997](https://github.com/djm204/frankenbeast/commit/5167997c99954fd37d66822ad8efb87913f0b432))
* **types:** brain interfaces + BrainSnapshot types (Phase 2.1) ([f2ed2fd](https://github.com/djm204/frankenbeast/commit/f2ed2fd52257c8fc44f1005bddc924af16d24177))
* **web:** add AgentActionBar with force restart AlertDialog ([38be1e7](https://github.com/djm204/frankenbeast/commit/38be1e7e156d4bd3f2cfa33300d21065d7435574))
* **web:** add AgentDetailEdit with editable form and dirty tracking ([f69fc61](https://github.com/djm204/frankenbeast/commit/f69fc6102bc2c8a5ff4b6819c9e5e0c77ec9c01d))
* **web:** add AgentDetailPanel composing slide-in, readonly, and action bar ([1bfa3f1](https://github.com/djm204/frankenbeast/commit/1bfa3f1f3128a794a33b0e16dc89ae5220a1cdeb))
* **web:** add AgentDetailReadonly with accordion sections ([f63863f](https://github.com/djm204/frankenbeast/commit/f63863ff16804226124fce4e3a4102bb3049c7c6))
* **web:** add AgentList with search, density toggle, and empty state ([4e3525e](https://github.com/djm204/frankenbeast/commit/4e3525e396a540a717cdd51b9d4ab08170f7954b))
* **web:** add AgentRow component with density variants ([3d34665](https://github.com/djm204/frankenbeast/commit/3d3466579df89e9e55ee00ad6a6607e0b98233e5))
* **web:** add BeastsPage root component with agent list and detail panel ([a346104](https://github.com/djm204/frankenbeast/commit/a34610456813f100ef32256fe2a89de2f0132456))
* **web:** add dashboard network operator controls ([1cafbba](https://github.com/djm204/frankenbeast/commit/1cafbba2f7542e5561fb3bc8863fe1458fce0575))
* **web:** add dashboard page with skills, security, and provider panels ([d4e4bb4](https://github.com/djm204/frankenbeast/commit/d4e4bb445c20e82707279e9764723bf7af1395b0))
* **web:** add LogViewerModal with fullscreen toggle and search ([62352d1](https://github.com/djm204/frankenbeast/commit/62352d1fcc8de315c2517ea03ea66de26c1ef5d8))
* **web:** add shared form components (gap banner, provider select, preset cards, file picker) ([778dd39](https://github.com/djm204/frankenbeast/commit/778dd39878fbe06e6236b3174790e3dc3ad57a4a))
* **web:** add SinglePageForm accordion mode and fix lightningcss dep ([6aaece3](https://github.com/djm204/frankenbeast/commit/6aaece3d68aa971b87680266216d95b96fc12d0c))
* **web:** add SlideInPanel aside with CSS transitions ([63a27b0](https://github.com/djm204/frankenbeast/commit/63a27b0d0004c4564c4f557107d940cf90d0607f))
* **web:** add StatusLight component with glowing indicators ([e9437cf](https://github.com/djm204/frankenbeast/commit/e9437cffb4213eb44b4d5f2de049878e0b81c561))
* **web:** add token estimator and path normalization utilities ([08e9ca2](https://github.com/djm204/frankenbeast/commit/08e9ca293e9a1c49f17447930f19618584d7b80e))
* **web:** add wizard dialog shell with step indicator ([73bf365](https://github.com/djm204/frankenbeast/commit/73bf365242e060e3530af193c78fe8530bb5a7eb))
* **web:** add wizard steps 1-4 (identity, workflow, LLM targets, modules) ([4145da5](https://github.com/djm204/frankenbeast/commit/4145da542e657f98f39f75e90de31ffe1bc1e399))
* **web:** add Zustand beast store with wizard and edit slices ([c5d385b](https://github.com/djm204/frankenbeast/commit/c5d385b2cf5e26ce12f528fb038051f9ad107a85))
* **web:** beasts panel UX redesign — list-first agent management ([d192688](https://github.com/djm204/frankenbeast/commit/d1926889244ac00733621e09a6c43987ed3aeab7))
* **web:** configure Tailwind CSS v4 with beast theme tokens ([5b39266](https://github.com/djm204/frankenbeast/commit/5b39266ae3ed3bd03f62c6b3fe7304369f1b972a))
* **web:** extend beast-api with killAgent, patchAgentConfig, and extended config types ([b4c4df8](https://github.com/djm204/frankenbeast/commit/b4c4df81dff6126d02eac017160ab67d9ce2fa46))
* **web:** refresh dashboard shell and controls ([570383f](https://github.com/djm204/frankenbeast/commit/570383f35f7c0f53fb7c8bf0eeb9b5ca73c4a7c8))
* **web:** refresh dashboard shell UX and controls ([7d103d9](https://github.com/djm204/frankenbeast/commit/7d103d97efc3d5c76e85d952c786bf3f8c20130a))
* **web:** wire AgentDetailEdit into detail panel edit mode ([9079ab2](https://github.com/djm204/frankenbeast/commit/9079ab2455ac772d3a264a548a16e69c0a791e93))
* **web:** wire BeastsPage into ChatShell, replace BeastDispatchPage ([4ad6706](https://github.com/djm204/frankenbeast/commit/4ad67069948be4fcda92a527851dde08819b5582))
* **web:** wire wizard steps, add module config forms, fix UX spacing ([ba61b6c](https://github.com/djm204/frankenbeast/commit/ba61b6c22d9ea5f375fdd875aa9ce3b6cf34647b))
* wire critique and governor modules in dep-factory (Tiers 3-4) ([8d55339](https://github.com/djm204/frankenbeast/commit/8d553399167860bad06a03c85e5b6045a0fb8b1e))
* wire real Firewall, Skills, Memory modules into BeastLoop (Tiers 1-2) ([b835f52](https://github.com/djm204/frankenbeast/commit/b835f529b6167984d54586d8194485664418eef6))


### Bug Fixes

* address 10 review issues on dashboard chunk ([037a57a](https://github.com/djm204/frankenbeast/commit/037a57a2538682233612143e02f289cd88a19cb2))
* address 10 review issues on dashboard chunk ([df52d71](https://github.com/djm204/frankenbeast/commit/df52d7152350c03f741f64ee55ee802da1da81b6))
* **beasts:** resolve 3 high-severity discrepancies from Pass 7 audit ([bdc0f2c](https://github.com/djm204/frankenbeast/commit/bdc0f2cc4f1a85c3037c4e1b5c56143f30fd35ad))
* **beasts:** resolve all DISCREPANCIES.md findings from Plan 1 ([5679beb](https://github.com/djm204/frankenbeast/commit/5679beb7c72fb4adad3aa946af7f4879f0eab086))
* **beasts:** resolve all Pass 6 Deep Audit findings (R1-R8) ([a9eac61](https://github.com/djm204/frankenbeast/commit/a9eac6144d012928c013a5e4fbcb29a803fc9213))
* **beasts:** resolve Pass 4/5 truth audit findings ([ba0908b](https://github.com/djm204/frankenbeast/commit/ba0908be6512cc0161d648cc1ed4de81823adeab))
* broaden start endpoint status guard and clear selection on agent delete ([45026bf](https://github.com/djm204/frankenbeast/commit/45026bf0f7b7fc5edede087e00176f6ed09d3493))
* **ci:** add lightningcss-linux-x64-gnu as explicit optional dep ([0ec3262](https://github.com/djm204/frankenbeast/commit/0ec3262e7850ac5f80682df2ba420afa7619d91c))
* **ci:** remove explicit lightningcss-linux-x64-gnu dep, sync lockfile ([6eb7d09](https://github.com/djm204/frankenbeast/commit/6eb7d09aa703779819931420905ec0f9790f16a7))
* **ci:** sync package-lock.json with @fbeast/mcp-suite workspace ([#280](https://github.com/djm204/frankenbeast/issues/280)) ([dd7356e](https://github.com/djm204/frankenbeast/commit/dd7356e58cb5fc52c46b3d0cd17d0c3cc7a691ec))
* **comms:** resolve build errors and unify websocket types ([2669d44](https://github.com/djm204/frankenbeast/commit/2669d4487bdfab9ef3ba522ce5a2dfa4b929cc7f))
* **comms:** resolve build errors and unify websocket types ([bfd0fb8](https://github.com/djm204/frankenbeast/commit/bfd0fb8cbb4656a719d9024a96bb5ca60734c40d))
* **comms:** use concrete http request and response types ([7624751](https://github.com/djm204/frankenbeast/commit/762475103ac4e7135da0de7e41cb8d6fa51054d1))
* **consolidation:** address review findings — lockfile, comms routes, docs ([e406cc2](https://github.com/djm204/frankenbeast/commit/e406cc2b32cd977f6212b05a300a96ae78480914))
* dashboard review fixes, dispatch config stripping, error logging ([cdcf969](https://github.com/djm204/frankenbeast/commit/cdcf969541adfd69bca4a5ac9d4676571b639773))
* fix the connection between dashboard and backend, and make some UI changes ([d137437](https://github.com/djm204/frankenbeast/commit/d1374374b3e0e6195b58a7fd8f19a74dc7f6a40f))
* honor run config provider and model precedence ([17d3432](https://github.com/djm204/frankenbeast/commit/17d3432f858d2590f2cb0683dbd2b661bd667fab))
* **network:** harden startup flow and dashboard connectivity ([b881f2b](https://github.com/djm204/frankenbeast/commit/b881f2bd2d7bf5aa68e9e1f76986d18204811021))
* **network:** harden startup flow and dashboard connectivity ([c312e9f](https://github.com/djm204/frankenbeast/commit/c312e9fd4dd6e2db0f3388da765a3bcb6d7e1b92))
* **observer:** fix cost tracking and document implementation gaps ([7054989](https://github.com/djm204/frankenbeast/commit/7054989522894d5bd2429d71ef73d041e9599725))
* **observer:** fix zero-cost tracking and document implementation gaps ([c75c322](https://github.com/djm204/frankenbeast/commit/c75c322b46dc804873cff78c1ae8756104092cb7))
* **orchestrator:** add missing @franken/critique and @franken/governor dependencies ([31e71f0](https://github.com/djm204/frankenbeast/commit/31e71f01d4aacd062ec42aebcf7bca3762a7de39))
* **orchestrator:** address Phase 3 review gaps + document residuals ([bfc84ee](https://github.com/djm204/frankenbeast/commit/bfc84ee3f4afa95957100635381a1cbc33fe16f7))
* **orchestrator:** honor provider selection and fallback semantics ([abf1b77](https://github.com/djm204/frankenbeast/commit/abf1b776226e67257ec39e2d34cd359bc3e7eb95))
* **orchestrator:** isolate issue stage sessions ([#212](https://github.com/djm204/frankenbeast/issues/212)) ([44a2c61](https://github.com/djm204/frankenbeast/commit/44a2c617327540bfd04253062e6017487656a3e2))
* **orchestrator:** make one-shot issues issue-aware and resumable ([09488cb](https://github.com/djm204/frankenbeast/commit/09488cb6f49ee2179ce9d2d0cfaff2f19cd1ef4f))
* **orchestrator:** populate phase in ChatRuntime.result(), update docs ([#277](https://github.com/djm204/frankenbeast/issues/277)) ([ec02071](https://github.com/djm204/frankenbeast/commit/ec02071c8987d8b1794784c09a9c2f8e98bb8f33))
* **orchestrator:** resolve Chunk A residuals R1-R4 ([7572d68](https://github.com/djm204/frankenbeast/commit/7572d68b62c520e4745f9d218f4c5806af71df79))
* **orchestrator:** standardize issue execution via chunk files ([63942f6](https://github.com/djm204/frankenbeast/commit/63942f6b2a6aff3088a1f5c55c652719717fe7f1))
* **orchestrator:** standardize issue execution via chunk files ([1e6d2eb](https://github.com/djm204/frankenbeast/commit/1e6d2ebbd6e8ad662ca6d70158078bf65070c28a))
* **orchestrator:** standardize subprocess failures ([#213](https://github.com/djm204/frankenbeast/issues/213)) ([130bce2](https://github.com/djm204/frankenbeast/commit/130bce266b71dcc84ba3e3b463d8ff5b4b46a475))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([1e88e62](https://github.com/djm204/frankenbeast/commit/1e88e6222bc1149311fb8ade17ac8eafa3525bc0))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([33dbf5a](https://github.com/djm204/frankenbeast/commit/33dbf5a483debc2460116f2b1cbbf0cd029a8061))
* **release:** hoist changelog-sections to top level so all packages show refactor commits ([4ad202e](https://github.com/djm204/frankenbeast/commit/4ad202e6d2cb4925e5cbd59beb973ec9c05499cf))
* residual one-shots (comms cleanup, HITL test, checkpoint flush, PROGRESS.md) ([e105db3](https://github.com/djm204/frankenbeast/commit/e105db3fe067c6473d3f2a4bc43fc85756487018))
* satisfy dashboard control typecheck ([065a566](https://github.com/djm204/frankenbeast/commit/065a566b14ddc66dd3d8fb034b575f538c889f4a))
* **skills:** fix global skill discovery validation failures ([2dc938e](https://github.com/djm204/frankenbeast/commit/2dc938e70ace981a5b1ecebe89c5d290d4dca4c5))
* **skills:** set source to GLOBAL and add interface field in skill flattener ([035d6be](https://github.com/djm204/frankenbeast/commit/035d6be862e03a91615866a9fa9ff3e63289617a))
* **skills:** use Object.values to avoid unused destructured variable ([f84a15b](https://github.com/djm204/frankenbeast/commit/f84a15b41eae9edf266eab9fd2a079115abf6481))
* use --json flag for agent-skills CLI discovery ([6ddc4da](https://github.com/djm204/frankenbeast/commit/6ddc4da7d0a98c6b988a6cefbdc2244d43dadbaf))
* use --json flag for agent-skills CLI discovery ([3549dc8](https://github.com/djm204/frankenbeast/commit/3549dc8930c3a785e24957406af9b4db8eddbb1f))
* **web:** add missing available/failoverOrder to test mocks ([257a66f](https://github.com/djm204/frankenbeast/commit/257a66f5449a3d5367f24be294d9f18c05e14465))
* **web:** address critical review findings ([cf29b90](https://github.com/djm204/frankenbeast/commit/cf29b90552b663107088701b2e4820803d79d78f))
* **web:** fix launch wiring, fix Tailwind CSS layer conflict, improve spacing ([9d88618](https://github.com/djm204/frankenbeast/commit/9d8861801a6bf85235946948175f0fb74ffccaaa))
* **web:** resolve TypeScript strict null check errors across beasts components ([00493a4](https://github.com/djm204/frankenbeast/commit/00493a4afee7df9cb462344ece3ae1b81976d82b))


### Refactoring

* **brain:** delete legacy episodic memory and types ([c627d6a](https://github.com/djm204/frankenbeast/commit/c627d6ae2e878f454dbbeacda32974c2d12ea393))
* **brain:** delete legacy episodic memory and types ([e620c62](https://github.com/djm204/frankenbeast/commit/e620c622d3fb25b338e5ce7e5417f82be61163d0))
* **orchestrator:** migrate dep-factory to consolidated components ([e432b6d](https://github.com/djm204/frankenbeast/commit/e432b6dd845a059e292df70aba3f18c47f9cafe8))


### Miscellaneous

* add architecture docs and update brain packaging ([38652e9](https://github.com/djm204/frankenbeast/commit/38652e967f4065c199c187650add570cebdaedea))
* add docs ([72d0814](https://github.com/djm204/frankenbeast/commit/72d0814a39970990887bea0aff431c5030a89271))
* add firewall, skills, brain workspace deps to orchestrator ([a8317b7](https://github.com/djm204/frankenbeast/commit/a8317b74d0ed177e55ee46eaa1da6cabcd3ac6ad))
* consolidate release-please into single PR for all version bumps ([59ad9c9](https://github.com/djm204/frankenbeast/commit/59ad9c905fc0fe301ab90321e140cabb723d70e1))
* delete auto merge workflow that doesnt work ([c496042](https://github.com/djm204/frankenbeast/commit/c4960427453f48d183d08d945e7c9ae6b8a51a0e))
* **docs:** delete old docs ([abeeb7f](https://github.com/djm204/frankenbeast/commit/abeeb7f5b7757e6cf0227d521728a6628dd5ab05))
* **franken-observer:** implement fix-issue-89-costcalculator-silently-returns-0-f ([ca26308](https://github.com/djm204/frankenbeast/commit/ca2630882bf79032e66da42fce92f410c35afe7c))
* **franken-orchestrator:** implement you-are-hardening-chunk-homepfkdevfrankenbeas ([362d813](https://github.com/djm204/frankenbeast/commit/362d81366976d04ea822f3d32797b8525504891d))
* implement you-are-hardening-chunk-homepfkdevfrankenbeas ([1b1917c](https://github.com/djm204/frankenbeast/commit/1b1917ca8feaf0bdcea735876253d7918cb3d619))
* **main:** release 0.12.0 ([9481d8a](https://github.com/djm204/frankenbeast/commit/9481d8ae468775ee829dd5ec4384318ebb971cef))
* **main:** release 0.13.0 ([5ae747f](https://github.com/djm204/frankenbeast/commit/5ae747fbf4ed0a65b043a06b9013fe94222fe913))
* **main:** release 0.14.0 ([95bafc4](https://github.com/djm204/frankenbeast/commit/95bafc4f10b49c084a7914da10a15992d27a4022))
* **main:** release 0.14.0 ([5a74920](https://github.com/djm204/frankenbeast/commit/5a74920d618d70fb29d5ca3f5e409b898b43f9e7))
* **main:** release 0.14.1 ([19eae53](https://github.com/djm204/frankenbeast/commit/19eae53eace7b8db7b1fddaa03d1b5ca7c1e3ec0))
* **main:** release 0.14.1 ([bdcbea8](https://github.com/djm204/frankenbeast/commit/bdcbea8ae78825a17a5f8e91156741af236be65c))
* **main:** release 0.14.2 ([84bff28](https://github.com/djm204/frankenbeast/commit/84bff28f92c869bff0e46bbdc03c42d41b85cf34))
* **main:** release 0.14.2 ([8351789](https://github.com/djm204/frankenbeast/commit/835178959e3a387c8122992fef8f74d17e9626ee))
* **main:** release 0.15.0 ([67049f2](https://github.com/djm204/frankenbeast/commit/67049f262cff7ca4ee2ffade5603c2bc9df3e39c))
* **main:** release 0.15.0 ([a303567](https://github.com/djm204/frankenbeast/commit/a30356712ef8f6a844e73f5c248e3c809b1979c6))
* **main:** release 0.16.0 ([4a7b97d](https://github.com/djm204/frankenbeast/commit/4a7b97dd3d45d7944fa3f396f6202a769e7f3a6e))
* **main:** release 0.16.0 ([291ff80](https://github.com/djm204/frankenbeast/commit/291ff80b190d72bc48a9c2cf259fb4f09f8d639c))
* **main:** release 0.16.1 ([3eecb23](https://github.com/djm204/frankenbeast/commit/3eecb23d6f466f94d76328c147fe51b9f9663182))
* **main:** release 0.16.1 ([9d08a35](https://github.com/djm204/frankenbeast/commit/9d08a353b62433bad58f989fb8e6ead9f541fc34))
* **main:** release 0.16.2 ([7c74ef0](https://github.com/djm204/frankenbeast/commit/7c74ef0ba9077ddff64abb21641aa3b30f66c172))
* **main:** release 0.16.2 ([2d0015e](https://github.com/djm204/frankenbeast/commit/2d0015edbcbddd50356c57f63802df06f1e1b2c9))
* **main:** release 0.16.3 ([33fb882](https://github.com/djm204/frankenbeast/commit/33fb88281508bbe968e96f45aa808d9e40d5ae70))
* **main:** release 0.16.3 ([d2c6b2a](https://github.com/djm204/frankenbeast/commit/d2c6b2a6be3758f695374037c701e06148f96f82))
* **main:** release 0.17.0 ([9350350](https://github.com/djm204/frankenbeast/commit/9350350f56b8b0a91e162bd8c1b9dfc57c0823fb))
* **main:** release 0.17.0 ([7828796](https://github.com/djm204/frankenbeast/commit/78287965313033b6f93c3d9dca3e446f5439c14b))
* **main:** release franken-critique 0.4.0 ([8c506d9](https://github.com/djm204/frankenbeast/commit/8c506d90279c82e9c38ea6ca65d4fb11b0b7ee11))
* **main:** release franken-critique 0.4.0 ([dc1150b](https://github.com/djm204/frankenbeast/commit/dc1150b5f6e0b838b6326037e0be70a96b25d455))
* **main:** release franken-critique 0.4.0 ([9ab0ec2](https://github.com/djm204/frankenbeast/commit/9ab0ec20a2afc9715436e9267245ba4d71be7d9c))
* **main:** release franken-critique 0.4.0 ([3329e93](https://github.com/djm204/frankenbeast/commit/3329e93066bb40ebc8f4cd47839a1052ae78d807))
* **main:** release franken-critique 0.4.0 ([9b62707](https://github.com/djm204/frankenbeast/commit/9b627076d79f8b6ab92d13ccedb5294b12f35bde))
* **main:** release franken-governor 0.4.0 ([da52fa4](https://github.com/djm204/frankenbeast/commit/da52fa41013e85635eb6a59f5001ac32f60b2365))
* **main:** release franken-governor 0.4.0 ([0430d42](https://github.com/djm204/frankenbeast/commit/0430d42062f4e658de609ffeb8862407dc28a008))
* **main:** release franken-governor 0.4.0 ([6faab25](https://github.com/djm204/frankenbeast/commit/6faab25d6676329e5d7fbc4f84d304a30c90817f))
* **main:** release franken-governor 0.4.0 ([4e66333](https://github.com/djm204/frankenbeast/commit/4e663333c719fbb61541da92aa5efa142e44cec6))
* **main:** release franken-governor 0.4.0 ([422adc0](https://github.com/djm204/frankenbeast/commit/422adc0b0a69a102b38027c8677bce3801933d77))
* **main:** release franken-observer 0.3.2 ([c61c47d](https://github.com/djm204/frankenbeast/commit/c61c47d0b73275e1ee7514fa37f3b7ef733e1e7d))
* **main:** release franken-observer 0.3.2 ([84cc110](https://github.com/djm204/frankenbeast/commit/84cc110c0e2f161f797151f0e92326433a43ddd9))
* **main:** release franken-observer 0.4.0 ([48b478a](https://github.com/djm204/frankenbeast/commit/48b478ac7316bfae25a43f0460f232138e883df6))
* **main:** release franken-observer 0.4.0 ([cb218a4](https://github.com/djm204/frankenbeast/commit/cb218a46d5dbe8aa3ac21eac4922189ddb6914e8))
* **main:** release franken-observer 0.4.0 ([8a6c421](https://github.com/djm204/frankenbeast/commit/8a6c4214ddb33af629897ea01caf03a97cae9af3))
* **main:** release franken-observer 0.4.0 ([92febeb](https://github.com/djm204/frankenbeast/commit/92febeb6b856f9c0af790beee2e54be80159624b))
* **main:** release franken-orchestrator 0.11.0 ([dbba9e9](https://github.com/djm204/frankenbeast/commit/dbba9e95f25530db1c3a5a6de738eae6c568ffe3))
* **main:** release franken-orchestrator 0.11.0 ([0a8862e](https://github.com/djm204/frankenbeast/commit/0a8862e02dbb6adf852d687386d3cbb4ded1ba9f))
* **main:** release franken-orchestrator 0.11.1 ([77db6f6](https://github.com/djm204/frankenbeast/commit/77db6f61228a1678c2d2f237cb421c395c1eff25))
* **main:** release franken-orchestrator 0.11.1 ([949bd84](https://github.com/djm204/frankenbeast/commit/949bd84557d7428d374b4447e1d8356e7df26af2))
* **main:** release franken-orchestrator 0.12.0 ([de2c822](https://github.com/djm204/frankenbeast/commit/de2c822d4dde5b70e98db06678646be8e98ea53b))
* **main:** release franken-orchestrator 0.12.0 ([b56a34d](https://github.com/djm204/frankenbeast/commit/b56a34d554b495278b4037cc6c5cefb9d56e33df))
* **main:** release franken-orchestrator 0.13.0 ([7bfef3d](https://github.com/djm204/frankenbeast/commit/7bfef3dc1dc8610bf7b05d621f5da28c91bfbef0))
* **main:** release franken-orchestrator 0.13.0 ([3608647](https://github.com/djm204/frankenbeast/commit/36086470d523deb50d7e78542c1f2338980cc674))
* **main:** release franken-orchestrator 0.14.0 ([17ab09e](https://github.com/djm204/frankenbeast/commit/17ab09e21765c8ac894627053937fd365a60dc6b))
* **main:** release franken-orchestrator 0.14.0 ([36ed876](https://github.com/djm204/frankenbeast/commit/36ed876352be18ee97ff468e131da37d68a1a312))
* **main:** release franken-orchestrator 0.14.1 ([3d8b754](https://github.com/djm204/frankenbeast/commit/3d8b754310111e59c50f0c2d180c441380a35b24))
* **main:** release franken-orchestrator 0.14.1 ([2d784f7](https://github.com/djm204/frankenbeast/commit/2d784f79eaa3f34db01f59739c46b67e4d0c54e6))
* **main:** release franken-orchestrator 0.14.2 ([8a41a9f](https://github.com/djm204/frankenbeast/commit/8a41a9f7665826b8994967e3972369e4bf845b8c))
* **main:** release franken-orchestrator 0.14.2 ([3596d99](https://github.com/djm204/frankenbeast/commit/3596d99dc1416808b33a794b915b4fdffa487357))
* **main:** release franken-orchestrator 0.15.0 ([a5795d1](https://github.com/djm204/frankenbeast/commit/a5795d1b3714d8e88d21098494d1c45a6414b757))
* **main:** release franken-orchestrator 0.15.0 ([2f50aad](https://github.com/djm204/frankenbeast/commit/2f50aadde3aa7f8854ac8065e6643f94cd25959b))
* **main:** release franken-orchestrator 0.16.0 ([bc5f0b6](https://github.com/djm204/frankenbeast/commit/bc5f0b693b741a7b5901fe4564e3ec4e5d2452e0))
* **main:** release franken-orchestrator 0.16.0 ([1510dc9](https://github.com/djm204/frankenbeast/commit/1510dc94837ea66c15756f3869dc145ee9cc6ed2))
* **main:** release franken-planner 0.4.0 ([7f17b8e](https://github.com/djm204/frankenbeast/commit/7f17b8e22a28a96c642c0239461d08a06e9da2a1))
* **main:** release franken-planner 0.4.0 ([521f2c1](https://github.com/djm204/frankenbeast/commit/521f2c128558af40065111d6ecf5e650089050b3))
* **main:** release franken-planner 0.4.0 ([4ad33cf](https://github.com/djm204/frankenbeast/commit/4ad33cf35c2c22efe34359191e510a6c671d5b1f))
* **main:** release franken-skills 0.4.0 ([5e13bfe](https://github.com/djm204/frankenbeast/commit/5e13bfe55cc6bc616fd2d05e7d9b8e074500b3fc))
* **main:** release franken-skills 0.4.0 ([525b447](https://github.com/djm204/frankenbeast/commit/525b4471e19c95fcb4966c8ab5f2ae01500ffd65))
* **main:** release franken-skills 0.4.0 ([4de5013](https://github.com/djm204/frankenbeast/commit/4de50135f88e9f565d06abb50c188640a9ba3fdd))
* **main:** release franken-skills 0.4.0 ([bc03094](https://github.com/djm204/frankenbeast/commit/bc030943491c239ce9ced84e77b3f3e275a99afb))
* **main:** release franken-types 0.3.2 ([5d88dcb](https://github.com/djm204/frankenbeast/commit/5d88dcb63d5c43f7a66e79b4fd5c976c795df164))
* **main:** release franken-types 0.3.2 ([64381db](https://github.com/djm204/frankenbeast/commit/64381db3ca76cd36107dfb5a44e6b8c3a278561f))
* **main:** release franken-types 0.3.2 ([ab62699](https://github.com/djm204/frankenbeast/commit/ab62699ec265117d2ef72d4cd937034dc24b70c4))
* **main:** release franken-types 0.3.2 ([f43701b](https://github.com/djm204/frankenbeast/commit/f43701b48e1029af08c20fd09f6e0e8b200c2e44))
* **main:** release franken-types 0.3.2 ([f5e8572](https://github.com/djm204/frankenbeast/commit/f5e8572a4a4dc044e38520a5f54ffe31faedd39f))
* **main:** release franken-types 0.3.2 ([1412544](https://github.com/djm204/frankenbeast/commit/1412544ec61add96aa25c92a8b57e51c8e429cd8))
* **main:** release frankenfirewall 0.4.0 ([02e3d6a](https://github.com/djm204/frankenbeast/commit/02e3d6a9944c9e0a67cb04c5162fd0d21fbb6085))
* **main:** release frankenfirewall 0.4.0 ([d46094f](https://github.com/djm204/frankenbeast/commit/d46094f06b689bd1a96003f1db167f9996d99b39))
* **main:** release frankenfirewall 0.5.0 ([9c6a7dc](https://github.com/djm204/frankenbeast/commit/9c6a7dcb144316d4b9e11cf364ea234b58a958ea))
* **main:** release frankenfirewall 0.5.0 ([746f749](https://github.com/djm204/frankenbeast/commit/746f749120864d41b1de376f862120cc48389472))
* **main:** release frankenfirewall 0.5.0 ([d4488aa](https://github.com/djm204/frankenbeast/commit/d4488aa7ca5a71be9e8f5ea0d011d45baa40cc21))
* **package-lock:** update package-lock ([7105406](https://github.com/djm204/frankenbeast/commit/71054064b589f322a6d46502a39e09ff2372b6eb))
* release main ([41acdbe](https://github.com/djm204/frankenbeast/commit/41acdbe09c990c38ade8209b3283b4405399dcda))
* release main ([19664bb](https://github.com/djm204/frankenbeast/commit/19664bb4baf0e8e0acb4c7042bcfee7f0799526b))
* release main ([29f20c7](https://github.com/djm204/frankenbeast/commit/29f20c74d7e5b0d5633188d1c6aa14eb189d0cc8))
* release main ([f388c96](https://github.com/djm204/frankenbeast/commit/f388c9636e6b34f63dde32314cfada9935a52370))
* release main ([78fce35](https://github.com/djm204/frankenbeast/commit/78fce35668a8ef71ada15816587858e4f5499470))
* release main ([24ca434](https://github.com/djm204/frankenbeast/commit/24ca434931d802006ec3d7744f2c8d4de9723eb7))
* release main ([ebdbb58](https://github.com/djm204/frankenbeast/commit/ebdbb58c04e68ab5e14414dea2e5f200141c152e))
* release main ([490d5c4](https://github.com/djm204/frankenbeast/commit/490d5c42a79aeb79afb6fc1f00a39eaed09f6a34))
* release main ([50717e2](https://github.com/djm204/frankenbeast/commit/50717e2e2f6bd7c1dcc209e60d1b2cafed6af550))
* release main ([78d8495](https://github.com/djm204/frankenbeast/commit/78d849528ab990a50b2ed6859d98d10cab92b09f))
* release main ([48548f3](https://github.com/djm204/frankenbeast/commit/48548f32209176d6d9a1562fdb4725742ecb9515))
* release main ([1e760f3](https://github.com/djm204/frankenbeast/commit/1e760f3dde475636378bdba15afe4cbc13381239))
* release main ([d428ecd](https://github.com/djm204/frankenbeast/commit/d428ecd6e627d5c3c48cd0ef98c45a8eeca56d3e))
* release main ([55f726e](https://github.com/djm204/frankenbeast/commit/55f726e1af6e84f3401fd5ad14f452e7ac727f22))
* release main ([4ee81c5](https://github.com/djm204/frankenbeast/commit/4ee81c571b79f98e41e6b9531336b7781592e680))
* release main ([4e4ab4c](https://github.com/djm204/frankenbeast/commit/4e4ab4c4c7cde525fef815c057bae24f2c6b34c5))
* release main ([cb2643c](https://github.com/djm204/frankenbeast/commit/cb2643c48eb86850bd76e1e0cd3af0b2e8301990))
* release main ([ed75081](https://github.com/djm204/frankenbeast/commit/ed750811df44ebc431b3aeca32b2606b503b25f3))
* release main ([aca7ca8](https://github.com/djm204/frankenbeast/commit/aca7ca8eacd9fed4b189e38ab1742cfb0bf375d2))
* release main ([575ba5f](https://github.com/djm204/frankenbeast/commit/575ba5f659a5b3ea9d4e1d2f6c602217ef086ef6))
* release main ([c823154](https://github.com/djm204/frankenbeast/commit/c8231545bd31c69edbbcd8d5d8ef8ba87641e897))
* release main ([86a1f8d](https://github.com/djm204/frankenbeast/commit/86a1f8da0d2d4e547b3ad9df079da581bc947c80))
* release main ([9424d30](https://github.com/djm204/frankenbeast/commit/9424d303b7d2673f805a85338f029b5f40311be9))
* release main ([0cb248b](https://github.com/djm204/frankenbeast/commit/0cb248b7a1fda5821b7f7b1c14e2ece639cbde71))
* release main ([ffee28a](https://github.com/djm204/frankenbeast/commit/ffee28a05bf220a38b0aa10070f6116db0e3c042))
* release main ([ade7f4a](https://github.com/djm204/frankenbeast/commit/ade7f4a923f9ab55a36744d646e70c6da3d8310c))
* release main ([2d3cf22](https://github.com/djm204/frankenbeast/commit/2d3cf2261539e1012e7a82bced3848d5688283cf))
* release main ([a6d94d3](https://github.com/djm204/frankenbeast/commit/a6d94d3456a0f8d011f3ca629f0ca92e520c117e))
* release main ([cda3767](https://github.com/djm204/frankenbeast/commit/cda376733c6c0315470b068c04a9c22a2374bf78))
* release main ([32ccdeb](https://github.com/djm204/frankenbeast/commit/32ccdeb50094924a24da0d75cc9cf489e5435496))
* release main ([696580f](https://github.com/djm204/frankenbeast/commit/696580f097d1f7e982aa35e288eb06d89e86b13f))
* release main ([5e1ba59](https://github.com/djm204/frankenbeast/commit/5e1ba59e0ca6ff7296839508d551d97865adb8d1))
* release main ([8ae6599](https://github.com/djm204/frankenbeast/commit/8ae6599c1a9a30902d39c90e8789998f69424d66))
* release main ([7b7a0ff](https://github.com/djm204/frankenbeast/commit/7b7a0ffa7fa23d0ef398d38f21366d08c24010cd))
* release main ([ea3ffb4](https://github.com/djm204/frankenbeast/commit/ea3ffb4650c2eb8716f7a8b57750b88e6fa3ea2d))
* release main ([6c1bae4](https://github.com/djm204/frankenbeast/commit/6c1bae4ffc62e5d57b21b49fb4abfa4202068bc6))
* release main ([92b122d](https://github.com/djm204/frankenbeast/commit/92b122d377cb480c1f7e1f13150f3f8c49362099))
* release main ([973da3b](https://github.com/djm204/frankenbeast/commit/973da3bc20a6185adcf1b504c997cec4bd0f5170))
* release main ([d4a9d83](https://github.com/djm204/frankenbeast/commit/d4a9d8333d11593e0a678e520bd2f39a97c8ce7c))
* release main ([daed900](https://github.com/djm204/frankenbeast/commit/daed9006881558c39d010263f1c409be3785b09e))
* release main ([1ab0863](https://github.com/djm204/frankenbeast/commit/1ab086391aec199aa4685bcc65c0cf6b1a9ea0e6))
* release main ([db01295](https://github.com/djm204/frankenbeast/commit/db01295e7a3734d378c25c17fb5ad8d39e6891f2))
* release main ([4b47eca](https://github.com/djm204/frankenbeast/commit/4b47eca3bf14c4972f038bbd9e0f5bed31e1719c))
* release main ([fabea22](https://github.com/djm204/frankenbeast/commit/fabea2256bbf60ce9e81573564e599fedd7495c4))
* release main ([#211](https://github.com/djm204/frankenbeast/issues/211)) ([ad3e1a4](https://github.com/djm204/frankenbeast/commit/ad3e1a429d9d518254df9e81215d84fd17e6eac4))
* release main ([#214](https://github.com/djm204/frankenbeast/issues/214)) ([6fe0df8](https://github.com/djm204/frankenbeast/commit/6fe0df8c04d94121179bcf9da00fdfb3a025bf91))
* release main ([#273](https://github.com/djm204/frankenbeast/issues/273)) ([fbdd6a4](https://github.com/djm204/frankenbeast/commit/fbdd6a4429eaf727acc178c5952b629845defc7d))
* release main ([#281](https://github.com/djm204/frankenbeast/issues/281)) ([71b7e79](https://github.com/djm204/frankenbeast/commit/71b7e799d16faf7ec85ffe092b7d19bb3713fb64))
* update README ([b514e04](https://github.com/djm204/frankenbeast/commit/b514e045599d44cb8d8236493a107defe4da4790))
* **web:** add Radix UI, Tailwind v4, and Zustand dependencies ([31bf91a](https://github.com/djm204/frankenbeast/commit/31bf91a4a1a25a21190e3f471e01c38c8d636764))


### Documentation

* add agent init workflow design and plan ([95421a0](https://github.com/djm204/frankenbeast/commit/95421a04cc78bc330acff3a1349af3948eb1e23e))
* add beasts dispatch design and implementation plan ([a2c2b77](https://github.com/djm204/frankenbeast/commit/a2c2b770b97c60f98a20a764f2c22563e851555d))
* add Chunk A residual issues ([51ba39e](https://github.com/djm204/frankenbeast/commit/51ba39eb81945e201bd7cb1be814ab2def6e901d))
* add comprehensive data flow guide ([441c310](https://github.com/djm204/frankenbeast/commit/441c310a14280aeb5456f71f9499c321183af45b))
* add consolidation plan, ADRs 027-031, specs, and remove stale docs ([69f04a5](https://github.com/djm204/frankenbeast/commit/69f04a5323ad4eafeb9572312acc315fac5add1b))
* add frankenbeast.example.json with all config properties ([814eaa8](https://github.com/djm204/frankenbeast/commit/814eaa8feb3c2bb965b99e4cd672d9a27ebb7c1b))
* add I5 and I6 residual issues for Phase 2 Brain Rewrite ([2ad7050](https://github.com/djm204/frankenbeast/commit/2ad70502db4c94d596bbfcddca766db0f1faf631))
* add issue-aware issues resume design and plan ([a87a74b](https://github.com/djm204/frankenbeast/commit/a87a74bdfe91c153ad0f40bd788ae29c958bdc84))
* add issues provider fallback design and plan ([8623a74](https://github.com/djm204/frankenbeast/commit/8623a74ada6b8aeb6bb86be82dfbbbb675b46dfb))
* add Phase 1 residual issues to minor-issues plan folder ([a64ea88](https://github.com/djm204/frankenbeast/commit/a64ea881518b65f6f2019755d59a6e842e91807a))
* add Phase 2 (Brain Rewrite) residual issues ([5bb9786](https://github.com/djm204/frankenbeast/commit/5bb97862657e2159b2349da44c2cfd8492cd4138))
* add Phase 4 residual issues ([7b840f9](https://github.com/djm204/frankenbeast/commit/7b840f9b7482a2ecc7b4633664e687b0b16f679c))
* add Phase 4.5 residual issues ([2b2e003](https://github.com/djm204/frankenbeast/commit/2b2e003e48cd6a8ea148d0e7861320ddd238d2ab))
* add Phase 5 residual issues ([b004987](https://github.com/djm204/frankenbeast/commit/b0049873525a91b38de3b13e9e3811dca6a3f0bc))
* add Phase 6 residual issues ([03f4302](https://github.com/djm204/frankenbeast/commit/03f430209bc5171b88440a0063b24c7c9ebfdfb4))
* add Phase 7 residual issues ([a098ee1](https://github.com/djm204/frankenbeast/commit/a098ee1d0b4433708891ca4d4d7b44a8eb428b7a))
* add Phase 8 residual issues ([b485954](https://github.com/djm204/frankenbeast/commit/b48595420e0ae3498adbcdba0230ab4353fba05f))
* add residuals master plan and chunk breakdown ([26b8d18](https://github.com/djm204/frankenbeast/commit/26b8d185ce731775280a1e8cd632622dbfc06cd2))
* add Secret Management guide to README and franken-web setup ([584e7cc](https://github.com/djm204/frankenbeast/commit/584e7cc97c556007cae1b6f2aa65ac99e84bdb79))
* add secret store to RAMP_UP and ARCHITECTURE ([a002d2a](https://github.com/djm204/frankenbeast/commit/a002d2aefbd8c4c9fb6e645e3119c1e191a40b23))
* add tracked agent workflow adr ([0d550a2](https://github.com/djm204/frankenbeast/commit/0d550a2f1ec16f286d2260a80e06374046ef3442))
* ADR-018 secret store architecture ([6b0f59f](https://github.com/djm204/frankenbeast/commit/6b0f59ffb0473336f98d85ffc8268a073159eb3e))
* ADR-019 secret backend comparison and recommendations ([524ef08](https://github.com/djm204/frankenbeast/commit/524ef08e09cca737786cbe329904f43fb5c0588c))
* describe tracked agent init workflow ([efeebb8](https://github.com/djm204/frankenbeast/commit/efeebb8d7be5d0eb1abe2ef9323269f09a7bf0d7))
* **issues:** document upstream repo targeting ([e8632ad](https://github.com/djm204/frankenbeast/commit/e8632ad9ada8689b0f6d3f48a48555ba68ab5c97))
* mark beastloop tiers 3-4 wiring as implemented ([2c4bdc4](https://github.com/djm204/frankenbeast/commit/2c4bdc489667acb4b8750594fcd88746bbcf707d))
* mark Chunk A residuals R1-R4 as resolved ([8758431](https://github.com/djm204/frankenbeast/commit/87584315ecd80ef623aeb9987b17f8403865c598))
* mark Phase 2 M1/M2 residuals as resolved ([b980eee](https://github.com/djm204/frankenbeast/commit/b980eeed164af2e965d84f2aad120f6788b78110))
* mark tiers 1-2 wiring design as implemented ([57ffee1](https://github.com/djm204/frankenbeast/commit/57ffee10153a7dc88632607a56d7b99f00188ea1))
* move completed plans into complete ([914c8c1](https://github.com/djm204/frankenbeast/commit/914c8c1caef4d5751589b1119910c04f82047d7e))
* **network:** add operator guide and ADR ([a396268](https://github.com/djm204/frankenbeast/commit/a396268d0893e131a7de7c9ff4ed4ca8ed310cc9))
* **plan:** add network operator design and implementation plan ([eef8acc](https://github.com/djm204/frankenbeast/commit/eef8acc2e0b435d3a9a1a0e3c4f38c870500da79))
* **plans:** add dashboard ux refresh design and plan ([2976f43](https://github.com/djm204/frankenbeast/commit/2976f4360cc84d35cbfdfe793fede52c8b69f39d))
* refresh init workflow design and plan ([d590651](https://github.com/djm204/frankenbeast/commit/d5906511dba6a7ee07d809987a4bef63e6329c07))
* sync ramp-up guides with workspace ([d989aa5](https://github.com/djm204/frankenbeast/commit/d989aa52b9c9378c45cf28c470e267f0e46caeed))
* update ARCHITECTURE, PROGRESS, and RAMP_UP for Plan 1 ([13a2038](https://github.com/djm204/frankenbeast/commit/13a20389b19c8c05e898b52b191cb91aefd8d8f6))
* update PROGRESS.md with Architecture Consolidation Phases 2-8 ([89ce9a0](https://github.com/djm204/frankenbeast/commit/89ce9a0ff075ee02cde17996b80d0d57b79057b6))
* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))
* update README, RAMP_UP, and ARCHITECTURE for current project state ([24f9952](https://github.com/djm204/frankenbeast/commit/24f9952f25e3b77d3cc7e768c2e35415eff71b5a))


### CI/CD

* auto-merge release please prs after ci ([5c9afbe](https://github.com/djm204/frankenbeast/commit/5c9afbe2c561cb9fae87b7fc00361e6c35aeaa4a))
* auto-merge release please prs after ci ([6e1557a](https://github.com/djm204/frankenbeast/commit/6e1557a7ed4cedf3f731b717c62451d5129d05c7))


### Tests

* **comms:** remove real socket listeners from websocket unit tests ([130b607](https://github.com/djm204/frankenbeast/commit/130b6070af14e8b8e40c2dddb6cf0769e7c5ffb5))
* **comms:** remove real socket listeners from websocket unit tests ([595cd07](https://github.com/djm204/frankenbeast/commit/595cd0799a7c2f389e3e86f10fa98154df99d26d))
* delete 26 fluff test files (~283 tests) identified by audit ([03358d4](https://github.com/djm204/frankenbeast/commit/03358d4cdc745197e48b61855ed77571a37a2939))
* **skills:** update agent-skills-cli test expectations for GLOBAL source and interface ([8ba8ccc](https://github.com/djm204/frankenbeast/commit/8ba8cccc48d3f5b9bcac69f7f10ec78198609201))

## [0.32.1](https://github.com/djm204/frankenbeast/compare/v0.32.0...v0.32.1) (2026-04-16)


### Bug Fixes

* **ci:** sync package-lock.json with @fbeast/mcp-suite workspace ([#280](https://github.com/djm204/frankenbeast/issues/280)) ([dd7356e](https://github.com/djm204/frankenbeast/commit/dd7356e58cb5fc52c46b3d0cd17d0c3cc7a691ec))

## [0.32.0](https://github.com/djm204/frankenbeast/compare/v0.31.0...v0.32.0) (2026-04-10)


### Features

* add fbeast MCP suite — modular MCP servers for Claude Code ([#278](https://github.com/djm204/frankenbeast/issues/278)) ([116266b](https://github.com/djm204/frankenbeast/commit/116266b7a60f0d80d7e58661ba1325716ec6c18e))
* **orchestrator:** last-mile wiring — activate consolidation components in production runtime ([#275](https://github.com/djm204/frankenbeast/issues/275)) ([d318813](https://github.com/djm204/frankenbeast/commit/d318813518c99aede74aedc3ed9c4577cec114f4))


### Bug Fixes

* dashboard review fixes, dispatch config stripping, error logging ([cdcf969](https://github.com/djm204/frankenbeast/commit/cdcf969541adfd69bca4a5ac9d4676571b639773))
* **orchestrator:** populate phase in ChatRuntime.result(), update docs ([#277](https://github.com/djm204/frankenbeast/issues/277)) ([ec02071](https://github.com/djm204/frankenbeast/commit/ec02071c8987d8b1794784c09a9c2f8e98bb8f33))
* **orchestrator:** resolve Chunk A residuals R1-R4 ([7572d68](https://github.com/djm204/frankenbeast/commit/7572d68b62c520e4745f9d218f4c5806af71df79))


### Documentation

* mark Chunk A residuals R1-R4 as resolved ([8758431](https://github.com/djm204/frankenbeast/commit/87584315ecd80ef623aeb9987b17f8403865c598))

## [0.31.0](https://github.com/djm204/frankenbeast/compare/v0.30.1...v0.31.0) (2026-04-01)


### Features

* add skill directory equivalents for beast definitions ([789b567](https://github.com/djm204/frankenbeast/commit/789b567207768e639d6f4cc9c9ef5bcf95882566))
* add skill directory equivalents for beast definitions ([b63d31f](https://github.com/djm204/frankenbeast/commit/b63d31fbbfd5108e2c22207a62a6d46fb2160040))
* dashboard SSE routes and web UI panels ([0c8c8e0](https://github.com/djm204/frankenbeast/commit/0c8c8e0520be173cd921edda6c424cc41e7b1292))
* **web:** add dashboard page with skills, security, and provider panels ([d4e4bb4](https://github.com/djm204/frankenbeast/commit/d4e4bb445c20e82707279e9764723bf7af1395b0))


### Bug Fixes

* address 10 review issues on dashboard chunk ([037a57a](https://github.com/djm204/frankenbeast/commit/037a57a2538682233612143e02f289cd88a19cb2))
* address 10 review issues on dashboard chunk ([df52d71](https://github.com/djm204/frankenbeast/commit/df52d7152350c03f741f64ee55ee802da1da81b6))
* residual one-shots (comms cleanup, HITL test, checkpoint flush, PROGRESS.md) ([e105db3](https://github.com/djm204/frankenbeast/commit/e105db3fe067c6473d3f2a4bc43fc85756487018))


### Documentation

* update PROGRESS.md with Architecture Consolidation Phases 2-8 ([89ce9a0](https://github.com/djm204/frankenbeast/commit/89ce9a0ff075ee02cde17996b80d0d57b79057b6))

## [0.30.1](https://github.com/djm204/frankenbeast/compare/v0.30.0...v0.30.1) (2026-03-27)


### Refactoring

* **brain:** delete legacy episodic memory and types ([c627d6a](https://github.com/djm204/frankenbeast/commit/c627d6ae2e878f454dbbeacda32974c2d12ea393))
* **brain:** delete legacy episodic memory and types ([e620c62](https://github.com/djm204/frankenbeast/commit/e620c622d3fb25b338e5ce7e5417f82be61163d0))
* **orchestrator:** migrate dep-factory to consolidated components ([e432b6d](https://github.com/djm204/frankenbeast/commit/e432b6dd845a059e292df70aba3f18c47f9cafe8))


### Documentation

* add Chunk A residual issues ([51ba39e](https://github.com/djm204/frankenbeast/commit/51ba39eb81945e201bd7cb1be814ab2def6e901d))
* add residuals master plan and chunk breakdown ([26b8d18](https://github.com/djm204/frankenbeast/commit/26b8d185ce731775280a1e8cd632622dbfc06cd2))
* mark Phase 2 M1/M2 residuals as resolved ([b980eee](https://github.com/djm204/frankenbeast/commit/b980eeed164af2e965d84f2aad120f6788b78110))

## [0.30.0](https://github.com/djm204/frankenbeast/compare/v0.29.0...v0.30.0) (2026-03-26)


### Features

* Phase 8 — Wire Everything Together (Core) ([12d5293](https://github.com/djm204/frankenbeast/commit/12d52933d8ac27d5b2d46a24229fc94cf3c8c7d9))


### Documentation

* add Phase 8 residual issues ([b485954](https://github.com/djm204/frankenbeast/commit/b48595420e0ae3498adbcdba0230ab4353fba05f))

## [0.29.0](https://github.com/djm204/frankenbeast/compare/v0.28.0...v0.29.0) (2026-03-26)


### Features

* Phase 7 — Observer Audit Trail ([ea50e97](https://github.com/djm204/frankenbeast/commit/ea50e97b7b4d88c3a0e7261be8d5b08bb630441e))

## [0.28.0](https://github.com/djm204/frankenbeast/compare/v0.27.0...v0.28.0) (2026-03-26)


### Features

* Phase 4 — Security Middleware ([2f4112b](https://github.com/djm204/frankenbeast/commit/2f4112bac8f0d8940ef141f64c7229c397535eea))
* Phase 4.5 — Comms Integration ([a3e8053](https://github.com/djm204/frankenbeast/commit/a3e80537a5e1413aab5cedd976c9d6724e796266))
* Phase 5 — Skill Loading ([bc99631](https://github.com/djm204/frankenbeast/commit/bc99631f27cd2ea1b4072e19998b3fc89eb389b0))
* Phase 6 — Absorb Reflection into Critique ([82ac47d](https://github.com/djm204/frankenbeast/commit/82ac47d6a67763a622f2d24058e6c30dbe989c46))


### Documentation

* add Phase 4 residual issues ([7b840f9](https://github.com/djm204/frankenbeast/commit/7b840f9b7482a2ecc7b4633664e687b0b16f679c))
* add Phase 4.5 residual issues ([2b2e003](https://github.com/djm204/frankenbeast/commit/2b2e003e48cd6a8ea148d0e7861320ddd238d2ab))
* add Phase 5 residual issues ([b004987](https://github.com/djm204/frankenbeast/commit/b0049873525a91b38de3b13e9e3811dca6a3f0bc))
* add Phase 6 residual issues ([03f4302](https://github.com/djm204/frankenbeast/commit/03f430209bc5171b88440a0063b24c7c9ebfdfb4))

## [0.27.0](https://github.com/djm204/frankenbeast/compare/v0.26.0...v0.27.0) (2026-03-23)


### Features

* **orchestrator:** add 6 provider adapters + shared handoff (Phase 3.3-3.8) ([58f5f10](https://github.com/djm204/frankenbeast/commit/58f5f1016a644160046d7cc38e3c147d2cde76a1))
* Phase 3 — Provider Registry + Adapters ([0ceb582](https://github.com/djm204/frankenbeast/commit/0ceb582f95a7ac7cac877adeb6b08bbe4aa9efd1))


### Bug Fixes

* **orchestrator:** address Phase 3 review gaps + document residuals ([bfc84ee](https://github.com/djm204/frankenbeast/commit/bfc84ee3f4afa95957100635381a1cbc33fe16f7))


### Documentation

* add I5 and I6 residual issues for Phase 2 Brain Rewrite ([2ad7050](https://github.com/djm204/frankenbeast/commit/2ad70502db4c94d596bbfcddca766db0f1faf631))

## [0.26.0](https://github.com/djm204/frankenbeast/compare/v0.25.0...v0.26.0) (2026-03-21)


### Features

* **brain:** add SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([11b7cf0](https://github.com/djm204/frankenbeast/commit/11b7cf0d97b541e0fe51cc66eb75d024259221d2))
* **brain:** SqliteBrain implementation with serialize/hydrate (Phase 2.2) ([f933824](https://github.com/djm204/frankenbeast/commit/f93382433780009edb2d5f14eae8172769f29daa))
* **types:** add brain interfaces and BrainSnapshot types (Phase 2.1) ([5167997](https://github.com/djm204/frankenbeast/commit/5167997c99954fd37d66822ad8efb87913f0b432))
* **types:** brain interfaces + BrainSnapshot types (Phase 2.1) ([f2ed2fd](https://github.com/djm204/frankenbeast/commit/f2ed2fd52257c8fc44f1005bddc924af16d24177))


### Bug Fixes

* **release:** hoist changelog-sections to top level so all packages show refactor commits ([4ad202e](https://github.com/djm204/frankenbeast/commit/4ad202e6d2cb4925e5cbd59beb973ec9c05499cf))


### Documentation

* add Phase 2 (Brain Rewrite) residual issues ([5bb9786](https://github.com/djm204/frankenbeast/commit/5bb97862657e2159b2349da44c2cfd8492cd4138))

## [0.25.0](https://github.com/djm204/frankenbeast/compare/v0.24.0...v0.25.0) (2026-03-21)


### Features

* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))


### Bug Fixes

* **consolidation:** address review findings — lockfile, comms routes, docs ([e406cc2](https://github.com/djm204/frankenbeast/commit/e406cc2b32cd977f6212b05a300a96ae78480914))


### Documentation

* add Phase 1 residual issues to minor-issues plan folder ([a64ea88](https://github.com/djm204/frankenbeast/commit/a64ea881518b65f6f2019755d59a6e842e91807a))

## [0.24.0](https://github.com/djm204/frankenbeast/compare/v0.23.0...v0.24.0) (2026-03-20)


### Features

* add beast dashboard resume and path controls ([500999f](https://github.com/djm204/frankenbeast/commit/500999f8404ef680616341136cbe5c4eeef4fe10))
* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))
* add beasts dispatch station ([5d87015](https://github.com/djm204/frankenbeast/commit/5d87015b72c714481f846547bdfb847068478e00))
* Add canonical chunk-session execution state ([5d36b0c](https://github.com/djm204/frankenbeast/commit/5d36b0c6ba6edb385812d7d5c0bb98ea77216fff))
* add init config wizard ([9129b73](https://github.com/djm204/frankenbeast/commit/9129b736bf0d0fd79a9089dab9eebe6178b1ff4d))
* add module toggle UI to beast dispatch dashboard ([98e9dba](https://github.com/djm204/frankenbeast/commit/98e9dbaf41142cc16df71dda34776a4db96200f3))
* add module toggle UI to beast dispatch dashboard ([c13a1a3](https://github.com/djm204/frankenbeast/commit/c13a1a34849b67b0f1a41c59cba749ee291a7d59))
* add tracked agent dashboard controls ([0f9b4db](https://github.com/djm204/frankenbeast/commit/0f9b4db305950ccdd1580fee28d8ba1ee751d9ee))
* add tracked agent dashboard controls ([fb13aa7](https://github.com/djm204/frankenbeast/commit/fb13aa740788a9ec7b81066d732318ce5314efb7))
* add tracked agent foundations ([4073878](https://github.com/djm204/frankenbeast/commit/407387806cb8972b2115e6aef489df02bf3c07fe))
* add websocket-backed Frankenbeast dashboard chat ([f0e089d](https://github.com/djm204/frankenbeast/commit/f0e089dea6f35685f016b0a373c6e3440ccc1e45))
* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))
* **chat:** add runnable dashboard chat server entrypoint ([d37004b](https://github.com/djm204/frankenbeast/commit/d37004b8be19257636f8e6b1f6c297f829861d33))
* **chat:** session continuation, input blocking, spinner, output sanitization, color diff ([e4eb862](https://github.com/djm204/frankenbeast/commit/e4eb86252fc641a17eded66040059c57f4e82702))
* **cli:** add franken and frkn as CLI aliases ([b651cd5](https://github.com/djm204/frankenbeast/commit/b651cd543408ba2e574f3da236d3c75d4354f2f5))
* **comms:** add discord integration with secure ed25519 interactions ([670b98a](https://github.com/djm204/frankenbeast/commit/670b98af821ea2fc0562ade5169824dba1f08eb9))
* **comms:** add franken-comms package with core abstractions and slack adapter ([e1a9078](https://github.com/djm204/frankenbeast/commit/e1a9078162e51a482d38741799a4fb8a04267813))
* **comms:** add slack signature verification and events/interactivity routing ([8ff7133](https://github.com/djm204/frankenbeast/commit/8ff7133afb920d283e39f6c014f25f517f01773f))
* **comms:** complete multi-channel integration (Slack, Discord, Telegram, WhatsApp) ([8c421a3](https://github.com/djm204/frankenbeast/commit/8c421a35eb48bf6a5f19ea95d455aad3385b7051))
* **comms:** implement franken-comms core and slack adapter ([b4164ba](https://github.com/djm204/frankenbeast/commit/b4164ba7198abc6f5961f91aeb6e6c543c7ea04b))
* **dashboard:** add beasts dispatch station ([2e5537a](https://github.com/djm204/frankenbeast/commit/2e5537a3cdecc078e55d2ecdfb84c62735bdf265))
* **franken-orchestrator:** add conversational chat interface with CLI, HTTP, SSE, and web UI ([13c01f4](https://github.com/djm204/frankenbeast/commit/13c01f410ab81f5fc8223543d567e454701365fb))
* **franken-orchestrator:** add intelligent LLM caching ([c00307c](https://github.com/djm204/frankenbeast/commit/c00307c91c7612f38aa86962f07d04e7feec6b61))
* **franken-orchestrator:** add spinner to LLM progress, extract cleanLlmJson utility, use lastChunks for plan output ([dccc569](https://github.com/djm204/frankenbeast/commit/dccc56923cda689fc06bdbbd3285400e0342f574))
* **franken-orchestrator:** cache repeated planning and issue prompts ([89b3591](https://github.com/djm204/frankenbeast/commit/89b3591b3b92213f14129f60d4cce3b40b15b941))
* implement tracked agent init workflow ([366cc75](https://github.com/djm204/frankenbeast/commit/366cc756338774124ee5a4928a9ff451efec3bbd))
* launch tracked agents from the dashboard ([fa33f0e](https://github.com/djm204/frankenbeast/commit/fa33f0e2b18fecd2e16fb5e0b26b57063da57bb6))
* **network:** add config-driven network operator control plane ([816ef85](https://github.com/djm204/frankenbeast/commit/816ef853cb0a74ef3d700dc365c2ad4fd198dba4))
* **network:** support managed service config overrides ([57974f1](https://github.com/djm204/frankenbeast/commit/57974f16a8a6cdc909f74cb1c1be47a6c7ae14ae))
* **orchestrator:** persist beast runs attempts and logs ([b8344e8](https://github.com/djm204/frankenbeast/commit/b8344e8767b4b3bbc5fdb9db67cbf34a645abf5b))
* **orchestrator:** support upstream repo targeting for issues ([414b7e1](https://github.com/djm204/frankenbeast/commit/414b7e1c33e5762c5966b55d05932ef02ba2fe3a))
* **orchestrator:** support upstream repo targeting for issues ([20d0585](https://github.com/djm204/frankenbeast/commit/20d058503589bdf940b4cbc497b5e22ec3310fe8))
* **orchestrator:** unify issue pipeline with BeastLoop and optimize context window ([ffa6299](https://github.com/djm204/frankenbeast/commit/ffa6299f446663cc724da6311467824d75bed0c5))
* Plan 1 — Foundation Execution Pipeline ([bc4cc63](https://github.com/djm204/frankenbeast/commit/bc4cc63b958dfe1d9763056f69b5495b7272b73e))
* **planner:** multi-pass codebase-aware planning pipeline ([0877494](https://github.com/djm204/frankenbeast/commit/0877494c72b1dd2c78e217b1dc78af478a927a24))
* secret store with 4 pluggable backends ([f05846f](https://github.com/djm204/frankenbeast/commit/f05846f70dbc6b6815ae4568c829d9eedc0a1670))
* **web:** add AgentActionBar with force restart AlertDialog ([38be1e7](https://github.com/djm204/frankenbeast/commit/38be1e7e156d4bd3f2cfa33300d21065d7435574))
* **web:** add AgentDetailEdit with editable form and dirty tracking ([f69fc61](https://github.com/djm204/frankenbeast/commit/f69fc6102bc2c8a5ff4b6819c9e5e0c77ec9c01d))
* **web:** add AgentDetailPanel composing slide-in, readonly, and action bar ([1bfa3f1](https://github.com/djm204/frankenbeast/commit/1bfa3f1f3128a794a33b0e16dc89ae5220a1cdeb))
* **web:** add AgentDetailReadonly with accordion sections ([f63863f](https://github.com/djm204/frankenbeast/commit/f63863ff16804226124fce4e3a4102bb3049c7c6))
* **web:** add AgentList with search, density toggle, and empty state ([4e3525e](https://github.com/djm204/frankenbeast/commit/4e3525e396a540a717cdd51b9d4ab08170f7954b))
* **web:** add AgentRow component with density variants ([3d34665](https://github.com/djm204/frankenbeast/commit/3d3466579df89e9e55ee00ad6a6607e0b98233e5))
* **web:** add BeastsPage root component with agent list and detail panel ([a346104](https://github.com/djm204/frankenbeast/commit/a34610456813f100ef32256fe2a89de2f0132456))
* **web:** add dashboard network operator controls ([1cafbba](https://github.com/djm204/frankenbeast/commit/1cafbba2f7542e5561fb3bc8863fe1458fce0575))
* **web:** add LogViewerModal with fullscreen toggle and search ([62352d1](https://github.com/djm204/frankenbeast/commit/62352d1fcc8de315c2517ea03ea66de26c1ef5d8))
* **web:** add shared form components (gap banner, provider select, preset cards, file picker) ([778dd39](https://github.com/djm204/frankenbeast/commit/778dd39878fbe06e6236b3174790e3dc3ad57a4a))
* **web:** add SinglePageForm accordion mode and fix lightningcss dep ([6aaece3](https://github.com/djm204/frankenbeast/commit/6aaece3d68aa971b87680266216d95b96fc12d0c))
* **web:** add SlideInPanel aside with CSS transitions ([63a27b0](https://github.com/djm204/frankenbeast/commit/63a27b0d0004c4564c4f557107d940cf90d0607f))
* **web:** add StatusLight component with glowing indicators ([e9437cf](https://github.com/djm204/frankenbeast/commit/e9437cffb4213eb44b4d5f2de049878e0b81c561))
* **web:** add token estimator and path normalization utilities ([08e9ca2](https://github.com/djm204/frankenbeast/commit/08e9ca293e9a1c49f17447930f19618584d7b80e))
* **web:** add wizard dialog shell with step indicator ([73bf365](https://github.com/djm204/frankenbeast/commit/73bf365242e060e3530af193c78fe8530bb5a7eb))
* **web:** add wizard steps 1-4 (identity, workflow, LLM targets, modules) ([4145da5](https://github.com/djm204/frankenbeast/commit/4145da542e657f98f39f75e90de31ffe1bc1e399))
* **web:** add Zustand beast store with wizard and edit slices ([c5d385b](https://github.com/djm204/frankenbeast/commit/c5d385b2cf5e26ce12f528fb038051f9ad107a85))
* **web:** beasts panel UX redesign — list-first agent management ([d192688](https://github.com/djm204/frankenbeast/commit/d1926889244ac00733621e09a6c43987ed3aeab7))
* **web:** build dashboard chat shell with live socket UX ([95af810](https://github.com/djm204/frankenbeast/commit/95af810040ff0e7679117a1978091eea085ea0e5))
* **web:** configure Tailwind CSS v4 with beast theme tokens ([5b39266](https://github.com/djm204/frankenbeast/commit/5b39266ae3ed3bd03f62c6b3fe7304369f1b972a))
* **web:** extend beast-api with killAgent, patchAgentConfig, and extended config types ([b4c4df8](https://github.com/djm204/frankenbeast/commit/b4c4df81dff6126d02eac017160ab67d9ce2fa46))
* **web:** refresh dashboard shell and controls ([570383f](https://github.com/djm204/frankenbeast/commit/570383f35f7c0f53fb7c8bf0eeb9b5ca73c4a7c8))
* **web:** refresh dashboard shell UX and controls ([7d103d9](https://github.com/djm204/frankenbeast/commit/7d103d97efc3d5c76e85d952c786bf3f8c20130a))
* **web:** wire AgentDetailEdit into detail panel edit mode ([9079ab2](https://github.com/djm204/frankenbeast/commit/9079ab2455ac772d3a264a548a16e69c0a791e93))
* **web:** wire BeastsPage into ChatShell, replace BeastDispatchPage ([4ad6706](https://github.com/djm204/frankenbeast/commit/4ad67069948be4fcda92a527851dde08819b5582))
* **web:** wire wizard steps, add module config forms, fix UX spacing ([ba61b6c](https://github.com/djm204/frankenbeast/commit/ba61b6c22d9ea5f375fdd875aa9ce3b6cf34647b))
* wire critique and governor modules in dep-factory (Tiers 3-4) ([8d55339](https://github.com/djm204/frankenbeast/commit/8d553399167860bad06a03c85e5b6045a0fb8b1e))
* wire real Firewall, Skills, Memory modules into BeastLoop (Tiers 1-2) ([b835f52](https://github.com/djm204/frankenbeast/commit/b835f529b6167984d54586d8194485664418eef6))


### Bug Fixes

* **beasts:** resolve 3 high-severity discrepancies from Pass 7 audit ([bdc0f2c](https://github.com/djm204/frankenbeast/commit/bdc0f2cc4f1a85c3037c4e1b5c56143f30fd35ad))
* **beasts:** resolve all DISCREPANCIES.md findings from Plan 1 ([5679beb](https://github.com/djm204/frankenbeast/commit/5679beb7c72fb4adad3aa946af7f4879f0eab086))
* **beasts:** resolve all Pass 6 Deep Audit findings (R1-R8) ([a9eac61](https://github.com/djm204/frankenbeast/commit/a9eac6144d012928c013a5e4fbcb29a803fc9213))
* **beasts:** resolve Pass 4/5 truth audit findings ([ba0908b](https://github.com/djm204/frankenbeast/commit/ba0908be6512cc0161d648cc1ed4de81823adeab))
* broaden start endpoint status guard and clear selection on agent delete ([45026bf](https://github.com/djm204/frankenbeast/commit/45026bf0f7b7fc5edede087e00176f6ed09d3493))
* **ci:** add lightningcss-linux-x64-gnu as explicit optional dep ([0ec3262](https://github.com/djm204/frankenbeast/commit/0ec3262e7850ac5f80682df2ba420afa7619d91c))
* **ci:** remove explicit lightningcss-linux-x64-gnu dep, sync lockfile ([6eb7d09](https://github.com/djm204/frankenbeast/commit/6eb7d09aa703779819931420905ec0f9790f16a7))
* **comms:** resolve build errors and unify websocket types ([2669d44](https://github.com/djm204/frankenbeast/commit/2669d4487bdfab9ef3ba522ce5a2dfa4b929cc7f))
* **comms:** resolve build errors and unify websocket types ([bfd0fb8](https://github.com/djm204/frankenbeast/commit/bfd0fb8cbb4656a719d9024a96bb5ca60734c40d))
* **comms:** resolve linting issues and modernize eslint config ([5e361e9](https://github.com/djm204/frankenbeast/commit/5e361e9b561e16701d3c340e46273ca5d496aeee))
* **comms:** synchronize package-lock.json with new franken-comms package ([bd3be73](https://github.com/djm204/frankenbeast/commit/bd3be73ef8219afcf595c05688865aae7deacacf))
* **comms:** use concrete http request and response types ([7624751](https://github.com/djm204/frankenbeast/commit/762475103ac4e7135da0de7e41cb8d6fa51054d1))
* fix the connection between dashboard and backend, and make some UI changes ([d137437](https://github.com/djm204/frankenbeast/commit/d1374374b3e0e6195b58a7fd8f19a74dc7f6a40f))
* honor run config provider and model precedence ([17d3432](https://github.com/djm204/frankenbeast/commit/17d3432f858d2590f2cb0683dbd2b661bd667fab))
* **network:** harden startup flow and dashboard connectivity ([b881f2b](https://github.com/djm204/frankenbeast/commit/b881f2bd2d7bf5aa68e9e1f76986d18204811021))
* **network:** harden startup flow and dashboard connectivity ([c312e9f](https://github.com/djm204/frankenbeast/commit/c312e9fd4dd6e2db0f3388da765a3bcb6d7e1b92))
* **observer:** fix cost tracking and document implementation gaps ([7054989](https://github.com/djm204/frankenbeast/commit/7054989522894d5bd2429d71ef73d041e9599725))
* **observer:** fix zero-cost tracking and document implementation gaps ([c75c322](https://github.com/djm204/frankenbeast/commit/c75c322b46dc804873cff78c1ae8756104092cb7))
* **orchestrator:** add missing @franken/critique and @franken/governor dependencies ([31e71f0](https://github.com/djm204/frankenbeast/commit/31e71f01d4aacd062ec42aebcf7bca3762a7de39))
* **orchestrator:** honor provider selection and fallback semantics ([abf1b77](https://github.com/djm204/frankenbeast/commit/abf1b776226e67257ec39e2d34cd359bc3e7eb95))
* **orchestrator:** isolate issue stage sessions ([#212](https://github.com/djm204/frankenbeast/issues/212)) ([44a2c61](https://github.com/djm204/frankenbeast/commit/44a2c617327540bfd04253062e6017487656a3e2))
* **orchestrator:** make one-shot issues issue-aware and resumable ([09488cb](https://github.com/djm204/frankenbeast/commit/09488cb6f49ee2179ce9d2d0cfaff2f19cd1ef4f))
* **orchestrator:** standardize issue execution via chunk files ([63942f6](https://github.com/djm204/frankenbeast/commit/63942f6b2a6aff3088a1f5c55c652719717fe7f1))
* **orchestrator:** standardize issue execution via chunk files ([1e6d2eb](https://github.com/djm204/frankenbeast/commit/1e6d2ebbd6e8ad662ca6d70158078bf65070c28a))
* **orchestrator:** standardize subprocess failures ([#213](https://github.com/djm204/frankenbeast/issues/213)) ([130bce2](https://github.com/djm204/frankenbeast/commit/130bce266b71dcc84ba3e3b463d8ff5b4b46a475))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([1e88e62](https://github.com/djm204/frankenbeast/commit/1e88e6222bc1149311fb8ade17ac8eafa3525bc0))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([33dbf5a](https://github.com/djm204/frankenbeast/commit/33dbf5a483debc2460116f2b1cbbf0cd029a8061))
* satisfy dashboard control typecheck ([065a566](https://github.com/djm204/frankenbeast/commit/065a566b14ddc66dd3d8fb034b575f538c889f4a))
* **web:** address critical review findings ([cf29b90](https://github.com/djm204/frankenbeast/commit/cf29b90552b663107088701b2e4820803d79d78f))
* **web:** fix launch wiring, fix Tailwind CSS layer conflict, improve spacing ([9d88618](https://github.com/djm204/frankenbeast/commit/9d8861801a6bf85235946948175f0fb74ffccaaa))
* **web:** resolve TypeScript strict null check errors across beasts components ([00493a4](https://github.com/djm204/frankenbeast/commit/00493a4afee7df9cb462344ece3ae1b81976d82b))


### Miscellaneous

* add architecture docs and update brain packaging ([38652e9](https://github.com/djm204/frankenbeast/commit/38652e967f4065c199c187650add570cebdaedea))
* add docs ([72d0814](https://github.com/djm204/frankenbeast/commit/72d0814a39970990887bea0aff431c5030a89271))
* add firewall, skills, brain workspace deps to orchestrator ([a8317b7](https://github.com/djm204/frankenbeast/commit/a8317b74d0ed177e55ee46eaa1da6cabcd3ac6ad))
* consolidate release-please into single PR for all version bumps ([59ad9c9](https://github.com/djm204/frankenbeast/commit/59ad9c905fc0fe301ab90321e140cabb723d70e1))
* delete auto merge workflow that doesnt work ([c496042](https://github.com/djm204/frankenbeast/commit/c4960427453f48d183d08d945e7c9ae6b8a51a0e))
* **dev:** add runnable local flow for dashboard chat ([08962f3](https://github.com/djm204/frankenbeast/commit/08962f3f180c9f5f40939a19529e8a1639e124ed))
* **docs:** delete old docs ([abeeb7f](https://github.com/djm204/frankenbeast/commit/abeeb7f5b7757e6cf0227d521728a6628dd5ab05))
* **franken-observer:** implement fix-issue-89-costcalculator-silently-returns-0-f ([ca26308](https://github.com/djm204/frankenbeast/commit/ca2630882bf79032e66da42fce92f410c35afe7c))
* **franken-orchestrator:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([1d85288](https://github.com/djm204/frankenbeast/commit/1d8528826af44828725dc12015e57a15c23467ab))
* **franken-orchestrator:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([a4ad1f5](https://github.com/djm204/frankenbeast/commit/a4ad1f57f53ab7cb36769a65972ce35681bc81ec))
* **franken-orchestrator:** implement you-are-hardening-chunk-homepfkdevfrankenbeas ([362d813](https://github.com/djm204/frankenbeast/commit/362d81366976d04ea822f3d32797b8525504891d))
* **franken-web:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([8c9b0aa](https://github.com/djm204/frankenbeast/commit/8c9b0aaea9708f530b5cfaefca7cb71e3a857c9e))
* **franken-web:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([f680458](https://github.com/djm204/frankenbeast/commit/f680458d11940f2a60aeffc8570fe96b785ca69b))
* implement you-are-hardening-chunk-homepfkdevfrankenbeas ([1b1917c](https://github.com/djm204/frankenbeast/commit/1b1917ca8feaf0bdcea735876253d7918cb3d619))
* **main:** release 0.10.0 ([db55db6](https://github.com/djm204/frankenbeast/commit/db55db61f580a7dbc265c1d2ad8a28004ae57c69))
* **main:** release 0.10.0 ([573ad0f](https://github.com/djm204/frankenbeast/commit/573ad0f733e07d342d22a3d8c190e59803923c56))
* **main:** release 0.11.0 ([76479b2](https://github.com/djm204/frankenbeast/commit/76479b2cf4cef55a0352ba6ff7cc34df5ee6f723))
* **main:** release 0.11.0 ([6deda7f](https://github.com/djm204/frankenbeast/commit/6deda7f778922dce3f79d9fc9c5eb3ea685ba706))
* **main:** release 0.12.0 ([9481d8a](https://github.com/djm204/frankenbeast/commit/9481d8ae468775ee829dd5ec4384318ebb971cef))
* **main:** release 0.12.0 ([182d1a5](https://github.com/djm204/frankenbeast/commit/182d1a55e08e60ee7327a70f18e60ca693f5b6b3))
* **main:** release 0.13.0 ([5ae747f](https://github.com/djm204/frankenbeast/commit/5ae747fbf4ed0a65b043a06b9013fe94222fe913))
* **main:** release 0.14.0 ([95bafc4](https://github.com/djm204/frankenbeast/commit/95bafc4f10b49c084a7914da10a15992d27a4022))
* **main:** release 0.14.0 ([5a74920](https://github.com/djm204/frankenbeast/commit/5a74920d618d70fb29d5ca3f5e409b898b43f9e7))
* **main:** release 0.14.1 ([19eae53](https://github.com/djm204/frankenbeast/commit/19eae53eace7b8db7b1fddaa03d1b5ca7c1e3ec0))
* **main:** release 0.14.1 ([bdcbea8](https://github.com/djm204/frankenbeast/commit/bdcbea8ae78825a17a5f8e91156741af236be65c))
* **main:** release 0.14.2 ([84bff28](https://github.com/djm204/frankenbeast/commit/84bff28f92c869bff0e46bbdc03c42d41b85cf34))
* **main:** release 0.14.2 ([8351789](https://github.com/djm204/frankenbeast/commit/835178959e3a387c8122992fef8f74d17e9626ee))
* **main:** release 0.15.0 ([67049f2](https://github.com/djm204/frankenbeast/commit/67049f262cff7ca4ee2ffade5603c2bc9df3e39c))
* **main:** release 0.15.0 ([a303567](https://github.com/djm204/frankenbeast/commit/a30356712ef8f6a844e73f5c248e3c809b1979c6))
* **main:** release 0.16.0 ([4a7b97d](https://github.com/djm204/frankenbeast/commit/4a7b97dd3d45d7944fa3f396f6202a769e7f3a6e))
* **main:** release 0.16.0 ([291ff80](https://github.com/djm204/frankenbeast/commit/291ff80b190d72bc48a9c2cf259fb4f09f8d639c))
* **main:** release 0.16.1 ([3eecb23](https://github.com/djm204/frankenbeast/commit/3eecb23d6f466f94d76328c147fe51b9f9663182))
* **main:** release 0.16.1 ([9d08a35](https://github.com/djm204/frankenbeast/commit/9d08a353b62433bad58f989fb8e6ead9f541fc34))
* **main:** release 0.16.2 ([7c74ef0](https://github.com/djm204/frankenbeast/commit/7c74ef0ba9077ddff64abb21641aa3b30f66c172))
* **main:** release 0.16.2 ([2d0015e](https://github.com/djm204/frankenbeast/commit/2d0015edbcbddd50356c57f63802df06f1e1b2c9))
* **main:** release 0.16.3 ([33fb882](https://github.com/djm204/frankenbeast/commit/33fb88281508bbe968e96f45aa808d9e40d5ae70))
* **main:** release 0.16.3 ([d2c6b2a](https://github.com/djm204/frankenbeast/commit/d2c6b2a6be3758f695374037c701e06148f96f82))
* **main:** release 0.17.0 ([9350350](https://github.com/djm204/frankenbeast/commit/9350350f56b8b0a91e162bd8c1b9dfc57c0823fb))
* **main:** release 0.17.0 ([7828796](https://github.com/djm204/frankenbeast/commit/78287965313033b6f93c3d9dca3e446f5439c14b))
* **main:** release 0.7.2 ([#108](https://github.com/djm204/frankenbeast/issues/108)) ([6f592cc](https://github.com/djm204/frankenbeast/commit/6f592cc4ec7ee86c2735a5e911269b306b0d5c24))
* **main:** release 0.8.0 ([f4528a1](https://github.com/djm204/frankenbeast/commit/f4528a1c1d770d8b2d88800ec706df9ae37dd5e4))
* **main:** release 0.8.0 ([26615ca](https://github.com/djm204/frankenbeast/commit/26615ca35a620a809511aa9dd9440816cf7d3df0))
* **main:** release 0.9.0 ([ad38632](https://github.com/djm204/frankenbeast/commit/ad38632f5dcd0314f509abaf0e402be3a8fc4be5))
* **main:** release 0.9.0 ([03f02ac](https://github.com/djm204/frankenbeast/commit/03f02ace020cb1cfa85068afa5de7b394196f1c5))
* **main:** release franken-brain 0.3.1 ([effa089](https://github.com/djm204/frankenbeast/commit/effa08962666df7e8a4a38e03e4f496bac29dd88))
* **main:** release franken-brain 0.3.1 ([7ac1899](https://github.com/djm204/frankenbeast/commit/7ac18999020a6acef9a3833170fa3a5844ea4aa8))
* **main:** release franken-critique 0.3.1 ([0070ce4](https://github.com/djm204/frankenbeast/commit/0070ce4a4145c8ddefb9cfc75ccd3b98ae1492cc))
* **main:** release franken-critique 0.3.1 ([06ebfce](https://github.com/djm204/frankenbeast/commit/06ebfce410f5c7088e2566d56303216102a54e30))
* **main:** release franken-critique 0.4.0 ([8c506d9](https://github.com/djm204/frankenbeast/commit/8c506d90279c82e9c38ea6ca65d4fb11b0b7ee11))
* **main:** release franken-critique 0.4.0 ([dc1150b](https://github.com/djm204/frankenbeast/commit/dc1150b5f6e0b838b6326037e0be70a96b25d455))
* **main:** release franken-critique 0.4.0 ([9ab0ec2](https://github.com/djm204/frankenbeast/commit/9ab0ec20a2afc9715436e9267245ba4d71be7d9c))
* **main:** release franken-critique 0.4.0 ([3329e93](https://github.com/djm204/frankenbeast/commit/3329e93066bb40ebc8f4cd47839a1052ae78d807))
* **main:** release franken-critique 0.4.0 ([9b62707](https://github.com/djm204/frankenbeast/commit/9b627076d79f8b6ab92d13ccedb5294b12f35bde))
* **main:** release franken-governor 0.3.1 ([1f2ee34](https://github.com/djm204/frankenbeast/commit/1f2ee3438c72308c000658d04c0f70e491f7812d))
* **main:** release franken-governor 0.3.1 ([1c4dc1d](https://github.com/djm204/frankenbeast/commit/1c4dc1d405fc9122c5b04e36965e380d1a511471))
* **main:** release franken-governor 0.4.0 ([da52fa4](https://github.com/djm204/frankenbeast/commit/da52fa41013e85635eb6a59f5001ac32f60b2365))
* **main:** release franken-governor 0.4.0 ([0430d42](https://github.com/djm204/frankenbeast/commit/0430d42062f4e658de609ffeb8862407dc28a008))
* **main:** release franken-governor 0.4.0 ([6faab25](https://github.com/djm204/frankenbeast/commit/6faab25d6676329e5d7fbc4f84d304a30c90817f))
* **main:** release franken-governor 0.4.0 ([4e66333](https://github.com/djm204/frankenbeast/commit/4e663333c719fbb61541da92aa5efa142e44cec6))
* **main:** release franken-governor 0.4.0 ([422adc0](https://github.com/djm204/frankenbeast/commit/422adc0b0a69a102b38027c8677bce3801933d77))
* **main:** release franken-heartbeat 0.3.1 ([705a3ed](https://github.com/djm204/frankenbeast/commit/705a3ed944fd2f05a60bd1db6709a02f65f3d8ce))
* **main:** release franken-heartbeat 0.3.1 ([aca8e23](https://github.com/djm204/frankenbeast/commit/aca8e23ef80a312b738f3b4fbe9cb613e76ccb14))
* **main:** release franken-mcp 0.3.1 ([b1883ff](https://github.com/djm204/frankenbeast/commit/b1883ffb516129bc1717e4416e5c9ff07914e8b7))
* **main:** release franken-mcp 0.3.1 ([b5d29a8](https://github.com/djm204/frankenbeast/commit/b5d29a805d83c587674b68e01ee7310bc9d384a8))
* **main:** release franken-observer 0.3.1 ([6185508](https://github.com/djm204/frankenbeast/commit/61855086227deea864955d3f524a40e0caf0d6b2))
* **main:** release franken-observer 0.3.1 ([0149ef1](https://github.com/djm204/frankenbeast/commit/0149ef1a92cffbe26c9f53aea0f01597a8363ab0))
* **main:** release franken-observer 0.3.2 ([c61c47d](https://github.com/djm204/frankenbeast/commit/c61c47d0b73275e1ee7514fa37f3b7ef733e1e7d))
* **main:** release franken-observer 0.3.2 ([84cc110](https://github.com/djm204/frankenbeast/commit/84cc110c0e2f161f797151f0e92326433a43ddd9))
* **main:** release franken-observer 0.4.0 ([48b478a](https://github.com/djm204/frankenbeast/commit/48b478ac7316bfae25a43f0460f232138e883df6))
* **main:** release franken-observer 0.4.0 ([cb218a4](https://github.com/djm204/frankenbeast/commit/cb218a46d5dbe8aa3ac21eac4922189ddb6914e8))
* **main:** release franken-observer 0.4.0 ([8a6c421](https://github.com/djm204/frankenbeast/commit/8a6c4214ddb33af629897ea01caf03a97cae9af3))
* **main:** release franken-observer 0.4.0 ([92febeb](https://github.com/djm204/frankenbeast/commit/92febeb6b856f9c0af790beee2e54be80159624b))
* **main:** release franken-orchestrator 0.10.0 ([7d57b9b](https://github.com/djm204/frankenbeast/commit/7d57b9b921c14d0f683398cbe004b0b6b1184b0d))
* **main:** release franken-orchestrator 0.10.0 ([c860347](https://github.com/djm204/frankenbeast/commit/c860347ba56772e925c4dc4d551094eeb7fcd02d))
* **main:** release franken-orchestrator 0.11.0 ([dbba9e9](https://github.com/djm204/frankenbeast/commit/dbba9e95f25530db1c3a5a6de738eae6c568ffe3))
* **main:** release franken-orchestrator 0.11.0 ([0a8862e](https://github.com/djm204/frankenbeast/commit/0a8862e02dbb6adf852d687386d3cbb4ded1ba9f))
* **main:** release franken-orchestrator 0.11.1 ([77db6f6](https://github.com/djm204/frankenbeast/commit/77db6f61228a1678c2d2f237cb421c395c1eff25))
* **main:** release franken-orchestrator 0.11.1 ([949bd84](https://github.com/djm204/frankenbeast/commit/949bd84557d7428d374b4447e1d8356e7df26af2))
* **main:** release franken-orchestrator 0.12.0 ([de2c822](https://github.com/djm204/frankenbeast/commit/de2c822d4dde5b70e98db06678646be8e98ea53b))
* **main:** release franken-orchestrator 0.12.0 ([b56a34d](https://github.com/djm204/frankenbeast/commit/b56a34d554b495278b4037cc6c5cefb9d56e33df))
* **main:** release franken-orchestrator 0.13.0 ([7bfef3d](https://github.com/djm204/frankenbeast/commit/7bfef3dc1dc8610bf7b05d621f5da28c91bfbef0))
* **main:** release franken-orchestrator 0.13.0 ([3608647](https://github.com/djm204/frankenbeast/commit/36086470d523deb50d7e78542c1f2338980cc674))
* **main:** release franken-orchestrator 0.14.0 ([17ab09e](https://github.com/djm204/frankenbeast/commit/17ab09e21765c8ac894627053937fd365a60dc6b))
* **main:** release franken-orchestrator 0.14.0 ([36ed876](https://github.com/djm204/frankenbeast/commit/36ed876352be18ee97ff468e131da37d68a1a312))
* **main:** release franken-orchestrator 0.14.1 ([3d8b754](https://github.com/djm204/frankenbeast/commit/3d8b754310111e59c50f0c2d180c441380a35b24))
* **main:** release franken-orchestrator 0.14.1 ([2d784f7](https://github.com/djm204/frankenbeast/commit/2d784f79eaa3f34db01f59739c46b67e4d0c54e6))
* **main:** release franken-orchestrator 0.14.2 ([8a41a9f](https://github.com/djm204/frankenbeast/commit/8a41a9f7665826b8994967e3972369e4bf845b8c))
* **main:** release franken-orchestrator 0.14.2 ([3596d99](https://github.com/djm204/frankenbeast/commit/3596d99dc1416808b33a794b915b4fdffa487357))
* **main:** release franken-orchestrator 0.15.0 ([a5795d1](https://github.com/djm204/frankenbeast/commit/a5795d1b3714d8e88d21098494d1c45a6414b757))
* **main:** release franken-orchestrator 0.15.0 ([2f50aad](https://github.com/djm204/frankenbeast/commit/2f50aadde3aa7f8854ac8065e6643f94cd25959b))
* **main:** release franken-orchestrator 0.16.0 ([bc5f0b6](https://github.com/djm204/frankenbeast/commit/bc5f0b693b741a7b5901fe4564e3ec4e5d2452e0))
* **main:** release franken-orchestrator 0.16.0 ([1510dc9](https://github.com/djm204/frankenbeast/commit/1510dc94837ea66c15756f3869dc145ee9cc6ed2))
* **main:** release franken-orchestrator 0.4.0 ([dc59ca3](https://github.com/djm204/frankenbeast/commit/dc59ca3bf2483386a596eea8aa1660553d887420))
* **main:** release franken-orchestrator 0.4.0 ([1e0d119](https://github.com/djm204/frankenbeast/commit/1e0d119f3b7f9daacb5fbb3101e7c7e3cd9532cc))
* **main:** release franken-orchestrator 0.4.1 ([#109](https://github.com/djm204/frankenbeast/issues/109)) ([012a01a](https://github.com/djm204/frankenbeast/commit/012a01aba1d7bb908ff83d92fc54c68c5fc6377f))
* **main:** release franken-orchestrator 0.5.0 ([#111](https://github.com/djm204/frankenbeast/issues/111)) ([c0ecd21](https://github.com/djm204/frankenbeast/commit/c0ecd215267c534ae48dca5c984fff974acaaa62))
* **main:** release franken-orchestrator 0.6.0 ([04f3e83](https://github.com/djm204/frankenbeast/commit/04f3e831f773607f3e0913257bd389fde8d5a3a2))
* **main:** release franken-orchestrator 0.6.0 ([f26d8d5](https://github.com/djm204/frankenbeast/commit/f26d8d5f85a3f554a717c226b6995a46a268f0e2))
* **main:** release franken-orchestrator 0.7.0 ([a2c3d28](https://github.com/djm204/frankenbeast/commit/a2c3d28325ab7df69322812f7e3d0de9610541a4))
* **main:** release franken-orchestrator 0.7.0 ([c5faafa](https://github.com/djm204/frankenbeast/commit/c5faafa5a30431c21d63d601a761fa32141697c1))
* **main:** release franken-orchestrator 0.8.0 ([ebf5d22](https://github.com/djm204/frankenbeast/commit/ebf5d2270d8da2bedfab62ced7924577e74a05c1))
* **main:** release franken-orchestrator 0.8.0 ([c710711](https://github.com/djm204/frankenbeast/commit/c710711c73f9ce43820d4aba26518f47702c3b5e))
* **main:** release franken-orchestrator 0.9.0 ([1d329a9](https://github.com/djm204/frankenbeast/commit/1d329a93b747c583a33d30119dc70f001c7434f7))
* **main:** release franken-orchestrator 0.9.0 ([60d3c35](https://github.com/djm204/frankenbeast/commit/60d3c35026f473573b8cd402764363b9e8b28805))
* **main:** release franken-planner 0.3.1 ([b9af413](https://github.com/djm204/frankenbeast/commit/b9af41366d4113a58571df48f7b6a1ac8dfa6293))
* **main:** release franken-planner 0.3.1 ([4d53eda](https://github.com/djm204/frankenbeast/commit/4d53edac55621b491cab8860efc990a88f19ab53))
* **main:** release franken-planner 0.4.0 ([7f17b8e](https://github.com/djm204/frankenbeast/commit/7f17b8e22a28a96c642c0239461d08a06e9da2a1))
* **main:** release franken-planner 0.4.0 ([521f2c1](https://github.com/djm204/frankenbeast/commit/521f2c128558af40065111d6ecf5e650089050b3))
* **main:** release franken-planner 0.4.0 ([4ad33cf](https://github.com/djm204/frankenbeast/commit/4ad33cf35c2c22efe34359191e510a6c671d5b1f))
* **main:** release franken-skills 0.3.1 ([e8079d9](https://github.com/djm204/frankenbeast/commit/e8079d91d29a9f2bf4d3f793eeabaff509600824))
* **main:** release franken-skills 0.3.1 ([98fb1ef](https://github.com/djm204/frankenbeast/commit/98fb1ef3984217f6d562fd1825154f18b4020435))
* **main:** release franken-skills 0.4.0 ([5e13bfe](https://github.com/djm204/frankenbeast/commit/5e13bfe55cc6bc616fd2d05e7d9b8e074500b3fc))
* **main:** release franken-skills 0.4.0 ([525b447](https://github.com/djm204/frankenbeast/commit/525b4471e19c95fcb4966c8ab5f2ae01500ffd65))
* **main:** release franken-skills 0.4.0 ([4de5013](https://github.com/djm204/frankenbeast/commit/4de50135f88e9f565d06abb50c188640a9ba3fdd))
* **main:** release franken-skills 0.4.0 ([bc03094](https://github.com/djm204/frankenbeast/commit/bc030943491c239ce9ced84e77b3f3e275a99afb))
* **main:** release franken-types 0.3.1 ([d79e88c](https://github.com/djm204/frankenbeast/commit/d79e88c91781f7a1f45971363ca6c5890033c4bf))
* **main:** release franken-types 0.3.1 ([bfeee54](https://github.com/djm204/frankenbeast/commit/bfeee54916f3cbb849e49532f473d25949385eba))
* **main:** release franken-types 0.3.2 ([5d88dcb](https://github.com/djm204/frankenbeast/commit/5d88dcb63d5c43f7a66e79b4fd5c976c795df164))
* **main:** release franken-types 0.3.2 ([64381db](https://github.com/djm204/frankenbeast/commit/64381db3ca76cd36107dfb5a44e6b8c3a278561f))
* **main:** release franken-types 0.3.2 ([ab62699](https://github.com/djm204/frankenbeast/commit/ab62699ec265117d2ef72d4cd937034dc24b70c4))
* **main:** release franken-types 0.3.2 ([f43701b](https://github.com/djm204/frankenbeast/commit/f43701b48e1029af08c20fd09f6e0e8b200c2e44))
* **main:** release franken-types 0.3.2 ([f5e8572](https://github.com/djm204/frankenbeast/commit/f5e8572a4a4dc044e38520a5f54ffe31faedd39f))
* **main:** release franken-types 0.3.2 ([1412544](https://github.com/djm204/frankenbeast/commit/1412544ec61add96aa25c92a8b57e51c8e429cd8))
* **main:** release frankenfirewall 0.3.1 ([925d307](https://github.com/djm204/frankenbeast/commit/925d3074dffdec32f7bbf221f52fef8cbd4e8f39))
* **main:** release frankenfirewall 0.3.1 ([b2b5b79](https://github.com/djm204/frankenbeast/commit/b2b5b79796dacc49f8984a398bc9bd575cbfa225))
* **main:** release frankenfirewall 0.4.0 ([02e3d6a](https://github.com/djm204/frankenbeast/commit/02e3d6a9944c9e0a67cb04c5162fd0d21fbb6085))
* **main:** release frankenfirewall 0.4.0 ([d46094f](https://github.com/djm204/frankenbeast/commit/d46094f06b689bd1a96003f1db167f9996d99b39))
* **main:** release frankenfirewall 0.5.0 ([9c6a7dc](https://github.com/djm204/frankenbeast/commit/9c6a7dcb144316d4b9e11cf364ea234b58a958ea))
* **main:** release frankenfirewall 0.5.0 ([746f749](https://github.com/djm204/frankenbeast/commit/746f749120864d41b1de376f862120cc48389472))
* **main:** release frankenfirewall 0.5.0 ([d4488aa](https://github.com/djm204/frankenbeast/commit/d4488aa7ca5a71be9e8f5ea0d011d45baa40cc21))
* **package-lock:** update package-lock ([7105406](https://github.com/djm204/frankenbeast/commit/71054064b589f322a6d46502a39e09ff2372b6eb))
* release main ([aca7ca8](https://github.com/djm204/frankenbeast/commit/aca7ca8eacd9fed4b189e38ab1742cfb0bf375d2))
* release main ([575ba5f](https://github.com/djm204/frankenbeast/commit/575ba5f659a5b3ea9d4e1d2f6c602217ef086ef6))
* release main ([c823154](https://github.com/djm204/frankenbeast/commit/c8231545bd31c69edbbcd8d5d8ef8ba87641e897))
* release main ([86a1f8d](https://github.com/djm204/frankenbeast/commit/86a1f8da0d2d4e547b3ad9df079da581bc947c80))
* release main ([9424d30](https://github.com/djm204/frankenbeast/commit/9424d303b7d2673f805a85338f029b5f40311be9))
* release main ([0cb248b](https://github.com/djm204/frankenbeast/commit/0cb248b7a1fda5821b7f7b1c14e2ece639cbde71))
* release main ([ffee28a](https://github.com/djm204/frankenbeast/commit/ffee28a05bf220a38b0aa10070f6116db0e3c042))
* release main ([ade7f4a](https://github.com/djm204/frankenbeast/commit/ade7f4a923f9ab55a36744d646e70c6da3d8310c))
* release main ([2d3cf22](https://github.com/djm204/frankenbeast/commit/2d3cf2261539e1012e7a82bced3848d5688283cf))
* release main ([a6d94d3](https://github.com/djm204/frankenbeast/commit/a6d94d3456a0f8d011f3ca629f0ca92e520c117e))
* release main ([cda3767](https://github.com/djm204/frankenbeast/commit/cda376733c6c0315470b068c04a9c22a2374bf78))
* release main ([32ccdeb](https://github.com/djm204/frankenbeast/commit/32ccdeb50094924a24da0d75cc9cf489e5435496))
* release main ([696580f](https://github.com/djm204/frankenbeast/commit/696580f097d1f7e982aa35e288eb06d89e86b13f))
* release main ([5e1ba59](https://github.com/djm204/frankenbeast/commit/5e1ba59e0ca6ff7296839508d551d97865adb8d1))
* release main ([8ae6599](https://github.com/djm204/frankenbeast/commit/8ae6599c1a9a30902d39c90e8789998f69424d66))
* release main ([7b7a0ff](https://github.com/djm204/frankenbeast/commit/7b7a0ffa7fa23d0ef398d38f21366d08c24010cd))
* release main ([ea3ffb4](https://github.com/djm204/frankenbeast/commit/ea3ffb4650c2eb8716f7a8b57750b88e6fa3ea2d))
* release main ([6c1bae4](https://github.com/djm204/frankenbeast/commit/6c1bae4ffc62e5d57b21b49fb4abfa4202068bc6))
* release main ([92b122d](https://github.com/djm204/frankenbeast/commit/92b122d377cb480c1f7e1f13150f3f8c49362099))
* release main ([973da3b](https://github.com/djm204/frankenbeast/commit/973da3bc20a6185adcf1b504c997cec4bd0f5170))
* release main ([d4a9d83](https://github.com/djm204/frankenbeast/commit/d4a9d8333d11593e0a678e520bd2f39a97c8ce7c))
* release main ([daed900](https://github.com/djm204/frankenbeast/commit/daed9006881558c39d010263f1c409be3785b09e))
* release main ([1ab0863](https://github.com/djm204/frankenbeast/commit/1ab086391aec199aa4685bcc65c0cf6b1a9ea0e6))
* release main ([db01295](https://github.com/djm204/frankenbeast/commit/db01295e7a3734d378c25c17fb5ad8d39e6891f2))
* release main ([4b47eca](https://github.com/djm204/frankenbeast/commit/4b47eca3bf14c4972f038bbd9e0f5bed31e1719c))
* release main ([fabea22](https://github.com/djm204/frankenbeast/commit/fabea2256bbf60ce9e81573564e599fedd7495c4))
* release main ([#211](https://github.com/djm204/frankenbeast/issues/211)) ([ad3e1a4](https://github.com/djm204/frankenbeast/commit/ad3e1a429d9d518254df9e81215d84fd17e6eac4))
* release main ([#214](https://github.com/djm204/frankenbeast/issues/214)) ([6fe0df8](https://github.com/djm204/frankenbeast/commit/6fe0df8c04d94121179bcf9da00fdfb3a025bf91))
* resolve manifest conflict ([6da6efa](https://github.com/djm204/frankenbeast/commit/6da6efac2ceb2fac9b1ff57a338d40c0b7d16041))
* resolve manifest conflict ([c777b97](https://github.com/djm204/frankenbeast/commit/c777b9714bf46f78c9b9d0467e1a78e085217665))
* resolve manifest conflict ([ec9e9be](https://github.com/djm204/frankenbeast/commit/ec9e9be4a6ae0d43c27b6a7df1ab2ca0db60093b))
* resolve manifest conflict ([55623d9](https://github.com/djm204/frankenbeast/commit/55623d923502b1cedef3503dc9a19b151b33671c))
* resolve manifest conflict ([d66f706](https://github.com/djm204/frankenbeast/commit/d66f706c88d9bd9f175d28e40f2428285eaa9ade))
* resolve manifest conflict ([6e41dbb](https://github.com/djm204/frankenbeast/commit/6e41dbb5fa8067a96054d201b86cf1928fab2a11))
* resolve manifest conflict after franken-types merge ([9df4952](https://github.com/djm204/frankenbeast/commit/9df49529ba12edce9fbf081cfb21729bb9a2617d))
* update README ([b514e04](https://github.com/djm204/frankenbeast/commit/b514e045599d44cb8d8236493a107defe4da4790))
* **web:** add Radix UI, Tailwind v4, and Zustand dependencies ([31bf91a](https://github.com/djm204/frankenbeast/commit/31bf91a4a1a25a21190e3f471e01c38c8d636764))


### Documentation

* add ADR-012 (multi-pass pipeline) and ADR-013 (expanded chunk schema) ([39a5a49](https://github.com/djm204/frankenbeast/commit/39a5a49bc66ea984f73cd364250c77c4540f1c1f))
* add agent init workflow design and plan ([95421a0](https://github.com/djm204/frankenbeast/commit/95421a04cc78bc330acff3a1349af3948eb1e23e))
* add beasts dispatch design and implementation plan ([a2c2b77](https://github.com/djm204/frankenbeast/commit/a2c2b770b97c60f98a20a764f2c22563e851555d))
* add chat agent dispatch design doc ([6958b2b](https://github.com/djm204/frankenbeast/commit/6958b2b27235eb4eb1fe68ed65908237ff2e05f2))
* add chat agent dispatch implementation plan ([784a44c](https://github.com/djm204/frankenbeast/commit/784a44c06605c05ae087dcc4b017db3911814ca8))
* add comprehensive data flow guide ([441c310](https://github.com/djm204/frankenbeast/commit/441c310a14280aeb5456f71f9499c321183af45b))
* add consolidation plan, ADRs 027-031, specs, and remove stale docs ([69f04a5](https://github.com/djm204/frankenbeast/commit/69f04a5323ad4eafeb9572312acc315fac5add1b))
* add frankenbeast.example.json with all config properties ([814eaa8](https://github.com/djm204/frankenbeast/commit/814eaa8feb3c2bb965b99e4cd672d9a27ebb7c1b))
* add issue-aware issues resume design and plan ([a87a74b](https://github.com/djm204/frankenbeast/commit/a87a74bdfe91c153ad0f40bd788ae29c958bdc84))
* add issues provider fallback design and plan ([8623a74](https://github.com/djm204/frankenbeast/commit/8623a74ada6b8aeb6bb86be82dfbbbb675b46dfb))
* add planner hardening implementation plan ([610de89](https://github.com/djm204/frankenbeast/commit/610de8969e20838708917a951bd97fee7d5c40d9))
* add Secret Management guide to README and franken-web setup ([584e7cc](https://github.com/djm204/frankenbeast/commit/584e7cc97c556007cae1b6f2aa65ac99e84bdb79))
* add secret store to RAMP_UP and ARCHITECTURE ([a002d2a](https://github.com/djm204/frankenbeast/commit/a002d2aefbd8c4c9fb6e645e3119c1e191a40b23))
* add tracked agent workflow adr ([0d550a2](https://github.com/djm204/frankenbeast/commit/0d550a2f1ec16f286d2260a80e06374046ef3442))
* ADR-018 secret store architecture ([6b0f59f](https://github.com/djm204/frankenbeast/commit/6b0f59ffb0473336f98d85ffc8268a073159eb3e))
* ADR-019 secret backend comparison and recommendations ([524ef08](https://github.com/djm204/frankenbeast/commit/524ef08e09cca737786cbe329904f43fb5c0588c))
* **adr:** add ADR-016 for external comms gateway architecture ([cfbdef3](https://github.com/djm204/frankenbeast/commit/cfbdef3e17120825a96e1959ec4036b197605588))
* **adr:** ADR-014 chat two-tier dispatch architecture ([bcec6a0](https://github.com/djm204/frankenbeast/commit/bcec6a0ef1c05b15df19fee73297c5900d9ece02))
* **adr:** ADR-015 shared spinner abstraction ([e347467](https://github.com/djm204/frankenbeast/commit/e3474674ba8ac5a1db2bd46d86dc92a90ebbc37c))
* **adr:** record dashboard chat server entrypoint ([6108351](https://github.com/djm204/frankenbeast/commit/61083513e2e8940dee468b2c6e6cdf620b733715))
* **chat:** add dashboard chat run guide ([dde4c18](https://github.com/djm204/frankenbeast/commit/dde4c1845c04ed19872f46253d21e90cbeb45c5d))
* describe tracked agent init workflow ([efeebb8](https://github.com/djm204/frankenbeast/commit/efeebb8d7be5d0eb1abe2ef9323269f09a7bf0d7))
* **issues:** document upstream repo targeting ([e8632ad](https://github.com/djm204/frankenbeast/commit/e8632ad9ada8689b0f6d3f48a48555ba68ab5c97))
* mark beastloop tiers 3-4 wiring as implemented ([2c4bdc4](https://github.com/djm204/frankenbeast/commit/2c4bdc489667acb4b8750594fcd88746bbcf707d))
* mark tiers 1-2 wiring design as implemented ([57ffee1](https://github.com/djm204/frankenbeast/commit/57ffee10153a7dc88632607a56d7b99f00188ea1))
* move completed plans into complete ([914c8c1](https://github.com/djm204/frankenbeast/commit/914c8c1caef4d5751589b1119910c04f82047d7e))
* **network:** add operator guide and ADR ([a396268](https://github.com/djm204/frankenbeast/commit/a396268d0893e131a7de7c9ff4ed4ca8ed310cc9))
* **orchestrator:** document chunk session execution model ([bf4347c](https://github.com/djm204/frankenbeast/commit/bf4347ca1e1d7544d522313767966d1b40c7d746))
* **plan:** add network operator design and implementation plan ([eef8acc](https://github.com/djm204/frankenbeast/commit/eef8acc2e0b435d3a9a1a0e3c4f38c870500da79))
* **plans:** add dashboard ux refresh design and plan ([2976f43](https://github.com/djm204/frankenbeast/commit/2976f4360cc84d35cbfdfe793fede52c8b69f39d))
* **plans:** move channel-integrations implementation plan to complete ([84962f0](https://github.com/djm204/frankenbeast/commit/84962f0296e6ba5aa4a603dbf2d3b86d1e38f32d))
* **plans:** update init workflow and add new design documents ([a26402b](https://github.com/djm204/frankenbeast/commit/a26402b65f609b6825fef14807609f02f067cd7b))
* **plan:** update init workflow for current project state ([48434a2](https://github.com/djm204/frankenbeast/commit/48434a2dc9c30b0861af45821422be4f4be1704e))
* refresh init workflow design and plan ([d590651](https://github.com/djm204/frankenbeast/commit/d5906511dba6a7ee07d809987a4bef63e6329c07))
* sync ramp-up guides with workspace ([d989aa5](https://github.com/djm204/frankenbeast/commit/d989aa52b9c9378c45cf28c470e267f0e46caeed))
* update ARCHITECTURE, PROGRESS, and RAMP_UP for Plan 1 ([13a2038](https://github.com/djm204/frankenbeast/commit/13a20389b19c8c05e898b52b191cb91aefd8d8f6))
* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))
* update RAMP_UP.md with chat agent dispatch and new ADRs ([e94f69f](https://github.com/djm204/frankenbeast/commit/e94f69f5c9bdde0d18f74daddf7a27e2c18fa89f))
* update README, RAMP_UP, and ARCHITECTURE for current project state ([24f9952](https://github.com/djm204/frankenbeast/commit/24f9952f25e3b77d3cc7e768c2e35415eff71b5a))


### CI/CD

* auto-merge release please prs after ci ([5c9afbe](https://github.com/djm204/frankenbeast/commit/5c9afbe2c561cb9fae87b7fc00361e6c35aeaa4a))
* auto-merge release please prs after ci ([6e1557a](https://github.com/djm204/frankenbeast/commit/6e1557a7ed4cedf3f731b717c62451d5129d05c7))


### Tests

* **comms:** remove real socket listeners from websocket unit tests ([130b607](https://github.com/djm204/frankenbeast/commit/130b6070af14e8b8e40c2dddb6cf0769e7c5ffb5))
* **comms:** remove real socket listeners from websocket unit tests ([595cd07](https://github.com/djm204/frankenbeast/commit/595cd0799a7c2f389e3e86f10fa98154df99d26d))
* delete 26 fluff test files (~283 tests) identified by audit ([03358d4](https://github.com/djm204/frankenbeast/commit/03358d4cdc745197e48b61855ed77571a37a2939))

## [0.23.0](https://github.com/djm204/frankenbeast/compare/v0.22.2...v0.23.0) (2026-03-16)


### Features

* add beast dashboard resume and path controls ([500999f](https://github.com/djm204/frankenbeast/commit/500999f8404ef680616341136cbe5c4eeef4fe10))
* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))
* add beasts dispatch station ([5d87015](https://github.com/djm204/frankenbeast/commit/5d87015b72c714481f846547bdfb847068478e00))
* Add canonical chunk-session execution state ([5d36b0c](https://github.com/djm204/frankenbeast/commit/5d36b0c6ba6edb385812d7d5c0bb98ea77216fff))
* add init config wizard ([9129b73](https://github.com/djm204/frankenbeast/commit/9129b736bf0d0fd79a9089dab9eebe6178b1ff4d))
* add module toggle UI to beast dispatch dashboard ([98e9dba](https://github.com/djm204/frankenbeast/commit/98e9dbaf41142cc16df71dda34776a4db96200f3))
* add module toggle UI to beast dispatch dashboard ([c13a1a3](https://github.com/djm204/frankenbeast/commit/c13a1a34849b67b0f1a41c59cba749ee291a7d59))
* add tracked agent dashboard controls ([0f9b4db](https://github.com/djm204/frankenbeast/commit/0f9b4db305950ccdd1580fee28d8ba1ee751d9ee))
* add tracked agent dashboard controls ([fb13aa7](https://github.com/djm204/frankenbeast/commit/fb13aa740788a9ec7b81066d732318ce5314efb7))
* add tracked agent foundations ([4073878](https://github.com/djm204/frankenbeast/commit/407387806cb8972b2115e6aef489df02bf3c07fe))
* add websocket-backed Frankenbeast dashboard chat ([f0e089d](https://github.com/djm204/frankenbeast/commit/f0e089dea6f35685f016b0a373c6e3440ccc1e45))
* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))
* **chat:** add runnable dashboard chat server entrypoint ([d37004b](https://github.com/djm204/frankenbeast/commit/d37004b8be19257636f8e6b1f6c297f829861d33))
* **chat:** session continuation, input blocking, spinner, output sanitization, color diff ([e4eb862](https://github.com/djm204/frankenbeast/commit/e4eb86252fc641a17eded66040059c57f4e82702))
* **comms:** add discord integration with secure ed25519 interactions ([670b98a](https://github.com/djm204/frankenbeast/commit/670b98af821ea2fc0562ade5169824dba1f08eb9))
* **comms:** add franken-comms package with core abstractions and slack adapter ([e1a9078](https://github.com/djm204/frankenbeast/commit/e1a9078162e51a482d38741799a4fb8a04267813))
* **comms:** add slack signature verification and events/interactivity routing ([8ff7133](https://github.com/djm204/frankenbeast/commit/8ff7133afb920d283e39f6c014f25f517f01773f))
* **comms:** complete multi-channel integration (Slack, Discord, Telegram, WhatsApp) ([8c421a3](https://github.com/djm204/frankenbeast/commit/8c421a35eb48bf6a5f19ea95d455aad3385b7051))
* **comms:** implement franken-comms core and slack adapter ([b4164ba](https://github.com/djm204/frankenbeast/commit/b4164ba7198abc6f5961f91aeb6e6c543c7ea04b))
* **dashboard:** add beasts dispatch station ([2e5537a](https://github.com/djm204/frankenbeast/commit/2e5537a3cdecc078e55d2ecdfb84c62735bdf265))
* eslint configs, gitignore hygiene, CLI guard fix ([#99](https://github.com/djm204/frankenbeast/issues/99)) ([87d7427](https://github.com/djm204/frankenbeast/commit/87d74276a909b272141119ce151647118725ce2e))
* **franken-orchestrator:** add conversational chat interface with CLI, HTTP, SSE, and web UI ([13c01f4](https://github.com/djm204/frankenbeast/commit/13c01f410ab81f5fc8223543d567e454701365fb))
* **franken-orchestrator:** add intelligent LLM caching ([c00307c](https://github.com/djm204/frankenbeast/commit/c00307c91c7612f38aa86962f07d04e7feec6b61))
* **franken-orchestrator:** add spinner to LLM progress, extract cleanLlmJson utility, use lastChunks for plan output ([dccc569](https://github.com/djm204/frankenbeast/commit/dccc56923cda689fc06bdbbd3285400e0342f574))
* **franken-orchestrator:** cache repeated planning and issue prompts ([89b3591](https://github.com/djm204/frankenbeast/commit/89b3591b3b92213f14129f60d4cce3b40b15b941))
* GitHub issues as autonomous work source ([#90](https://github.com/djm204/frankenbeast/issues/90)) ([152970f](https://github.com/djm204/frankenbeast/commit/152970f3e192c80673c77d0a29816ca0728de1a5))
* implement tracked agent init workflow ([366cc75](https://github.com/djm204/frankenbeast/commit/366cc756338774124ee5a4928a9ff451efec3bbd))
* launch tracked agents from the dashboard ([fa33f0e](https://github.com/djm204/frankenbeast/commit/fa33f0e2b18fecd2e16fb5e0b26b57063da57bb6))
* migrate to real monorepo with npm workspaces + Turborepo ([#96](https://github.com/djm204/frankenbeast/issues/96)) ([f2028b1](https://github.com/djm204/frankenbeast/commit/f2028b139003a6bc09df35d8904a53c0457d67cb))
* **network:** add config-driven network operator control plane ([816ef85](https://github.com/djm204/frankenbeast/commit/816ef853cb0a74ef3d700dc365c2ad4fd198dba4))
* **network:** support managed service config overrides ([57974f1](https://github.com/djm204/frankenbeast/commit/57974f16a8a6cdc909f74cb1c1be47a6c7ae14ae))
* **orchestrator:** persist beast runs attempts and logs ([b8344e8](https://github.com/djm204/frankenbeast/commit/b8344e8767b4b3bbc5fdb9db67cbf34a645abf5b))
* **orchestrator:** support upstream repo targeting for issues ([414b7e1](https://github.com/djm204/frankenbeast/commit/414b7e1c33e5762c5966b55d05932ef02ba2fe3a))
* **orchestrator:** support upstream repo targeting for issues ([20d0585](https://github.com/djm204/frankenbeast/commit/20d058503589bdf940b4cbc497b5e22ec3310fe8))
* **orchestrator:** unify issue pipeline with BeastLoop and optimize context window ([ffa6299](https://github.com/djm204/frankenbeast/commit/ffa6299f446663cc724da6311467824d75bed0c5))
* **planner:** multi-pass codebase-aware planning pipeline ([0877494](https://github.com/djm204/frankenbeast/commit/0877494c72b1dd2c78e217b1dc78af478a927a24))
* secret store with 4 pluggable backends ([f05846f](https://github.com/djm204/frankenbeast/commit/f05846f70dbc6b6815ae4568c829d9eedc0a1670))
* **web:** add AgentActionBar with force restart AlertDialog ([38be1e7](https://github.com/djm204/frankenbeast/commit/38be1e7e156d4bd3f2cfa33300d21065d7435574))
* **web:** add AgentDetailEdit with editable form and dirty tracking ([f69fc61](https://github.com/djm204/frankenbeast/commit/f69fc6102bc2c8a5ff4b6819c9e5e0c77ec9c01d))
* **web:** add AgentDetailPanel composing slide-in, readonly, and action bar ([1bfa3f1](https://github.com/djm204/frankenbeast/commit/1bfa3f1f3128a794a33b0e16dc89ae5220a1cdeb))
* **web:** add AgentDetailReadonly with accordion sections ([f63863f](https://github.com/djm204/frankenbeast/commit/f63863ff16804226124fce4e3a4102bb3049c7c6))
* **web:** add AgentList with search, density toggle, and empty state ([4e3525e](https://github.com/djm204/frankenbeast/commit/4e3525e396a540a717cdd51b9d4ab08170f7954b))
* **web:** add AgentRow component with density variants ([3d34665](https://github.com/djm204/frankenbeast/commit/3d3466579df89e9e55ee00ad6a6607e0b98233e5))
* **web:** add BeastsPage root component with agent list and detail panel ([a346104](https://github.com/djm204/frankenbeast/commit/a34610456813f100ef32256fe2a89de2f0132456))
* **web:** add dashboard network operator controls ([1cafbba](https://github.com/djm204/frankenbeast/commit/1cafbba2f7542e5561fb3bc8863fe1458fce0575))
* **web:** add LogViewerModal with fullscreen toggle and search ([62352d1](https://github.com/djm204/frankenbeast/commit/62352d1fcc8de315c2517ea03ea66de26c1ef5d8))
* **web:** add shared form components (gap banner, provider select, preset cards, file picker) ([778dd39](https://github.com/djm204/frankenbeast/commit/778dd39878fbe06e6236b3174790e3dc3ad57a4a))
* **web:** add SinglePageForm accordion mode and fix lightningcss dep ([6aaece3](https://github.com/djm204/frankenbeast/commit/6aaece3d68aa971b87680266216d95b96fc12d0c))
* **web:** add SlideInPanel aside with CSS transitions ([63a27b0](https://github.com/djm204/frankenbeast/commit/63a27b0d0004c4564c4f557107d940cf90d0607f))
* **web:** add StatusLight component with glowing indicators ([e9437cf](https://github.com/djm204/frankenbeast/commit/e9437cffb4213eb44b4d5f2de049878e0b81c561))
* **web:** add token estimator and path normalization utilities ([08e9ca2](https://github.com/djm204/frankenbeast/commit/08e9ca293e9a1c49f17447930f19618584d7b80e))
* **web:** add wizard dialog shell with step indicator ([73bf365](https://github.com/djm204/frankenbeast/commit/73bf365242e060e3530af193c78fe8530bb5a7eb))
* **web:** add wizard steps 1-4 (identity, workflow, LLM targets, modules) ([4145da5](https://github.com/djm204/frankenbeast/commit/4145da542e657f98f39f75e90de31ffe1bc1e399))
* **web:** add Zustand beast store with wizard and edit slices ([c5d385b](https://github.com/djm204/frankenbeast/commit/c5d385b2cf5e26ce12f528fb038051f9ad107a85))
* **web:** beasts panel UX redesign — list-first agent management ([d192688](https://github.com/djm204/frankenbeast/commit/d1926889244ac00733621e09a6c43987ed3aeab7))
* **web:** build dashboard chat shell with live socket UX ([95af810](https://github.com/djm204/frankenbeast/commit/95af810040ff0e7679117a1978091eea085ea0e5))
* **web:** configure Tailwind CSS v4 with beast theme tokens ([5b39266](https://github.com/djm204/frankenbeast/commit/5b39266ae3ed3bd03f62c6b3fe7304369f1b972a))
* **web:** extend beast-api with killAgent, patchAgentConfig, and extended config types ([b4c4df8](https://github.com/djm204/frankenbeast/commit/b4c4df81dff6126d02eac017160ab67d9ce2fa46))
* **web:** refresh dashboard shell and controls ([570383f](https://github.com/djm204/frankenbeast/commit/570383f35f7c0f53fb7c8bf0eeb9b5ca73c4a7c8))
* **web:** refresh dashboard shell UX and controls ([7d103d9](https://github.com/djm204/frankenbeast/commit/7d103d97efc3d5c76e85d952c786bf3f8c20130a))
* **web:** wire AgentDetailEdit into detail panel edit mode ([9079ab2](https://github.com/djm204/frankenbeast/commit/9079ab2455ac772d3a264a548a16e69c0a791e93))
* **web:** wire BeastsPage into ChatShell, replace BeastDispatchPage ([4ad6706](https://github.com/djm204/frankenbeast/commit/4ad67069948be4fcda92a527851dde08819b5582))
* **web:** wire wizard steps, add module config forms, fix UX spacing ([ba61b6c](https://github.com/djm204/frankenbeast/commit/ba61b6c22d9ea5f375fdd875aa9ce3b6cf34647b))
* wire critique and governor modules in dep-factory (Tiers 3-4) ([8d55339](https://github.com/djm204/frankenbeast/commit/8d553399167860bad06a03c85e5b6045a0fb8b1e))
* wire real Firewall, Skills, Memory modules into BeastLoop (Tiers 1-2) ([b835f52](https://github.com/djm204/frankenbeast/commit/b835f529b6167984d54586d8194485664418eef6))


### Bug Fixes

* broaden start endpoint status guard and clear selection on agent delete ([45026bf](https://github.com/djm204/frankenbeast/commit/45026bf0f7b7fc5edede087e00176f6ed09d3493))
* **comms:** resolve build errors and unify websocket types ([2669d44](https://github.com/djm204/frankenbeast/commit/2669d4487bdfab9ef3ba522ce5a2dfa4b929cc7f))
* **comms:** resolve build errors and unify websocket types ([bfd0fb8](https://github.com/djm204/frankenbeast/commit/bfd0fb8cbb4656a719d9024a96bb5ca60734c40d))
* **comms:** resolve linting issues and modernize eslint config ([5e361e9](https://github.com/djm204/frankenbeast/commit/5e361e9b561e16701d3c340e46273ca5d496aeee))
* **comms:** synchronize package-lock.json with new franken-comms package ([bd3be73](https://github.com/djm204/frankenbeast/commit/bd3be73ef8219afcf595c05688865aae7deacacf))
* **comms:** use concrete http request and response types ([7624751](https://github.com/djm204/frankenbeast/commit/762475103ac4e7135da0de7e41cb8d6fa51054d1))
* ensure sub-package releases never become GitHub latest ([da2590d](https://github.com/djm204/frankenbeast/commit/da2590d13ba2f80e09259731f07e0fb84427de4a))
* fix the connection between dashboard and backend, and make some UI changes ([d137437](https://github.com/djm204/frankenbeast/commit/d1374374b3e0e6195b58a7fd8f19a74dc7f6a40f))
* **network:** harden startup flow and dashboard connectivity ([b881f2b](https://github.com/djm204/frankenbeast/commit/b881f2bd2d7bf5aa68e9e1f76986d18204811021))
* **network:** harden startup flow and dashboard connectivity ([c312e9f](https://github.com/djm204/frankenbeast/commit/c312e9fd4dd6e2db0f3388da765a3bcb6d7e1b92))
* **observer:** fix cost tracking and document implementation gaps ([7054989](https://github.com/djm204/frankenbeast/commit/7054989522894d5bd2429d71ef73d041e9599725))
* **observer:** fix zero-cost tracking and document implementation gaps ([c75c322](https://github.com/djm204/frankenbeast/commit/c75c322b46dc804873cff78c1ae8756104092cb7))
* **orchestrator:** add missing @franken/critique and @franken/governor dependencies ([31e71f0](https://github.com/djm204/frankenbeast/commit/31e71f01d4aacd062ec42aebcf7bca3762a7de39))
* **orchestrator:** honor provider selection and fallback semantics ([abf1b77](https://github.com/djm204/frankenbeast/commit/abf1b776226e67257ec39e2d34cd359bc3e7eb95))
* **orchestrator:** isolate issue stage sessions ([#212](https://github.com/djm204/frankenbeast/issues/212)) ([44a2c61](https://github.com/djm204/frankenbeast/commit/44a2c617327540bfd04253062e6017487656a3e2))
* **orchestrator:** make one-shot issues issue-aware and resumable ([09488cb](https://github.com/djm204/frankenbeast/commit/09488cb6f49ee2179ce9d2d0cfaff2f19cd1ef4f))
* **orchestrator:** standardize issue execution via chunk files ([63942f6](https://github.com/djm204/frankenbeast/commit/63942f6b2a6aff3088a1f5c55c652719717fe7f1))
* **orchestrator:** standardize issue execution via chunk files ([1e6d2eb](https://github.com/djm204/frankenbeast/commit/1e6d2ebbd6e8ad662ca6d70158078bf65070c28a))
* **orchestrator:** standardize subprocess failures ([#213](https://github.com/djm204/frankenbeast/issues/213)) ([130bce2](https://github.com/djm204/frankenbeast/commit/130bce266b71dcc84ba3e3b463d8ff5b4b46a475))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([1e88e62](https://github.com/djm204/frankenbeast/commit/1e88e6222bc1149311fb8ade17ac8eafa3525bc0))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([33dbf5a](https://github.com/djm204/frankenbeast/commit/33dbf5a483debc2460116f2b1cbbf0cd029a8061))
* release-please scoping and commit hygiene ([742c7cc](https://github.com/djm204/frankenbeast/commit/742c7cc7792aac3f6f85ee638ba3b165de34bc5f))
* satisfy dashboard control typecheck ([065a566](https://github.com/djm204/frankenbeast/commit/065a566b14ddc66dd3d8fb034b575f538c889f4a))
* scope release-please to only bump packages with actual changes ([59cddcd](https://github.com/djm204/frankenbeast/commit/59cddcd697fee65bae68b6d25c9c7f9df834768d))
* **web:** address critical review findings ([cf29b90](https://github.com/djm204/frankenbeast/commit/cf29b90552b663107088701b2e4820803d79d78f))
* **web:** fix launch wiring, fix Tailwind CSS layer conflict, improve spacing ([9d88618](https://github.com/djm204/frankenbeast/commit/9d8861801a6bf85235946948175f0fb74ffccaaa))
* **web:** resolve TypeScript strict null check errors across beasts components ([00493a4](https://github.com/djm204/frankenbeast/commit/00493a4afee7df9cb462344ece3ae1b81976d82b))


### Miscellaneous

* add docs ([72d0814](https://github.com/djm204/frankenbeast/commit/72d0814a39970990887bea0aff431c5030a89271))
* add firewall, skills, brain workspace deps to orchestrator ([a8317b7](https://github.com/djm204/frankenbeast/commit/a8317b74d0ed177e55ee46eaa1da6cabcd3ac6ad))
* consolidate release-please into single PR for all version bumps ([59ad9c9](https://github.com/djm204/frankenbeast/commit/59ad9c905fc0fe301ab90321e140cabb723d70e1))
* delete auto merge workflow that doesnt work ([c496042](https://github.com/djm204/frankenbeast/commit/c4960427453f48d183d08d945e7c9ae6b8a51a0e))
* delete the old plans ([eb191d5](https://github.com/djm204/frankenbeast/commit/eb191d5c0f08f559bdb43803c10eb072b1966de8))
* **dev:** add runnable local flow for dashboard chat ([08962f3](https://github.com/djm204/frankenbeast/commit/08962f3f180c9f5f40939a19529e8a1639e124ed))
* **franken-observer:** implement fix-issue-89-costcalculator-silently-returns-0-f ([ca26308](https://github.com/djm204/frankenbeast/commit/ca2630882bf79032e66da42fce92f410c35afe7c))
* **franken-orchestrator:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([1d85288](https://github.com/djm204/frankenbeast/commit/1d8528826af44828725dc12015e57a15c23467ab))
* **franken-orchestrator:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([a4ad1f5](https://github.com/djm204/frankenbeast/commit/a4ad1f57f53ab7cb36769a65972ce35681bc81ec))
* **franken-orchestrator:** implement you-are-hardening-chunk-homepfkdevfrankenbeas ([362d813](https://github.com/djm204/frankenbeast/commit/362d81366976d04ea822f3d32797b8525504891d))
* **franken-web:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([8c9b0aa](https://github.com/djm204/frankenbeast/commit/8c9b0aaea9708f530b5cfaefca7cb71e3a857c9e))
* **franken-web:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([f680458](https://github.com/djm204/frankenbeast/commit/f680458d11940f2a60aeffc8570fe96b785ca69b))
* implement you-are-hardening-chunk-homepfkdevfrankenbeas ([1b1917c](https://github.com/djm204/frankenbeast/commit/1b1917ca8feaf0bdcea735876253d7918cb3d619))
* **main:** release 0.10.0 ([db55db6](https://github.com/djm204/frankenbeast/commit/db55db61f580a7dbc265c1d2ad8a28004ae57c69))
* **main:** release 0.10.0 ([573ad0f](https://github.com/djm204/frankenbeast/commit/573ad0f733e07d342d22a3d8c190e59803923c56))
* **main:** release 0.11.0 ([76479b2](https://github.com/djm204/frankenbeast/commit/76479b2cf4cef55a0352ba6ff7cc34df5ee6f723))
* **main:** release 0.11.0 ([6deda7f](https://github.com/djm204/frankenbeast/commit/6deda7f778922dce3f79d9fc9c5eb3ea685ba706))
* **main:** release 0.12.0 ([9481d8a](https://github.com/djm204/frankenbeast/commit/9481d8ae468775ee829dd5ec4384318ebb971cef))
* **main:** release 0.12.0 ([182d1a5](https://github.com/djm204/frankenbeast/commit/182d1a55e08e60ee7327a70f18e60ca693f5b6b3))
* **main:** release 0.13.0 ([5ae747f](https://github.com/djm204/frankenbeast/commit/5ae747fbf4ed0a65b043a06b9013fe94222fe913))
* **main:** release 0.14.0 ([95bafc4](https://github.com/djm204/frankenbeast/commit/95bafc4f10b49c084a7914da10a15992d27a4022))
* **main:** release 0.14.0 ([5a74920](https://github.com/djm204/frankenbeast/commit/5a74920d618d70fb29d5ca3f5e409b898b43f9e7))
* **main:** release 0.14.1 ([19eae53](https://github.com/djm204/frankenbeast/commit/19eae53eace7b8db7b1fddaa03d1b5ca7c1e3ec0))
* **main:** release 0.14.1 ([bdcbea8](https://github.com/djm204/frankenbeast/commit/bdcbea8ae78825a17a5f8e91156741af236be65c))
* **main:** release 0.14.2 ([84bff28](https://github.com/djm204/frankenbeast/commit/84bff28f92c869bff0e46bbdc03c42d41b85cf34))
* **main:** release 0.14.2 ([8351789](https://github.com/djm204/frankenbeast/commit/835178959e3a387c8122992fef8f74d17e9626ee))
* **main:** release 0.15.0 ([67049f2](https://github.com/djm204/frankenbeast/commit/67049f262cff7ca4ee2ffade5603c2bc9df3e39c))
* **main:** release 0.15.0 ([a303567](https://github.com/djm204/frankenbeast/commit/a30356712ef8f6a844e73f5c248e3c809b1979c6))
* **main:** release 0.16.0 ([4a7b97d](https://github.com/djm204/frankenbeast/commit/4a7b97dd3d45d7944fa3f396f6202a769e7f3a6e))
* **main:** release 0.16.0 ([291ff80](https://github.com/djm204/frankenbeast/commit/291ff80b190d72bc48a9c2cf259fb4f09f8d639c))
* **main:** release 0.16.1 ([3eecb23](https://github.com/djm204/frankenbeast/commit/3eecb23d6f466f94d76328c147fe51b9f9663182))
* **main:** release 0.16.1 ([9d08a35](https://github.com/djm204/frankenbeast/commit/9d08a353b62433bad58f989fb8e6ead9f541fc34))
* **main:** release 0.16.2 ([7c74ef0](https://github.com/djm204/frankenbeast/commit/7c74ef0ba9077ddff64abb21641aa3b30f66c172))
* **main:** release 0.16.2 ([2d0015e](https://github.com/djm204/frankenbeast/commit/2d0015edbcbddd50356c57f63802df06f1e1b2c9))
* **main:** release 0.16.3 ([33fb882](https://github.com/djm204/frankenbeast/commit/33fb88281508bbe968e96f45aa808d9e40d5ae70))
* **main:** release 0.16.3 ([d2c6b2a](https://github.com/djm204/frankenbeast/commit/d2c6b2a6be3758f695374037c701e06148f96f82))
* **main:** release 0.17.0 ([9350350](https://github.com/djm204/frankenbeast/commit/9350350f56b8b0a91e162bd8c1b9dfc57c0823fb))
* **main:** release 0.17.0 ([7828796](https://github.com/djm204/frankenbeast/commit/78287965313033b6f93c3d9dca3e446f5439c14b))
* **main:** release 0.7.0 ([d786060](https://github.com/djm204/frankenbeast/commit/d786060ebe069ebb8ae7049d82a86897df017bcc))
* **main:** release 0.7.0 ([d6a3439](https://github.com/djm204/frankenbeast/commit/d6a3439409f94c526e2819a53c6418af6db68678))
* **main:** release 0.7.1 ([8d972c5](https://github.com/djm204/frankenbeast/commit/8d972c59384edc282a8f1c13c25517670a64a06e))
* **main:** release 0.7.1 ([c946948](https://github.com/djm204/frankenbeast/commit/c94694802de7b4dda2671d57312f45ab4db9202d))
* **main:** release 0.7.2 ([#108](https://github.com/djm204/frankenbeast/issues/108)) ([6f592cc](https://github.com/djm204/frankenbeast/commit/6f592cc4ec7ee86c2735a5e911269b306b0d5c24))
* **main:** release 0.8.0 ([f4528a1](https://github.com/djm204/frankenbeast/commit/f4528a1c1d770d8b2d88800ec706df9ae37dd5e4))
* **main:** release 0.8.0 ([26615ca](https://github.com/djm204/frankenbeast/commit/26615ca35a620a809511aa9dd9440816cf7d3df0))
* **main:** release 0.9.0 ([ad38632](https://github.com/djm204/frankenbeast/commit/ad38632f5dcd0314f509abaf0e402be3a8fc4be5))
* **main:** release 0.9.0 ([03f02ac](https://github.com/djm204/frankenbeast/commit/03f02ace020cb1cfa85068afa5de7b394196f1c5))
* **main:** release franken-brain 0.3.1 ([effa089](https://github.com/djm204/frankenbeast/commit/effa08962666df7e8a4a38e03e4f496bac29dd88))
* **main:** release franken-brain 0.3.1 ([7ac1899](https://github.com/djm204/frankenbeast/commit/7ac18999020a6acef9a3833170fa3a5844ea4aa8))
* **main:** release franken-critique 0.3.1 ([0070ce4](https://github.com/djm204/frankenbeast/commit/0070ce4a4145c8ddefb9cfc75ccd3b98ae1492cc))
* **main:** release franken-critique 0.3.1 ([06ebfce](https://github.com/djm204/frankenbeast/commit/06ebfce410f5c7088e2566d56303216102a54e30))
* **main:** release franken-critique 0.4.0 ([8c506d9](https://github.com/djm204/frankenbeast/commit/8c506d90279c82e9c38ea6ca65d4fb11b0b7ee11))
* **main:** release franken-critique 0.4.0 ([dc1150b](https://github.com/djm204/frankenbeast/commit/dc1150b5f6e0b838b6326037e0be70a96b25d455))
* **main:** release franken-critique 0.4.0 ([9ab0ec2](https://github.com/djm204/frankenbeast/commit/9ab0ec20a2afc9715436e9267245ba4d71be7d9c))
* **main:** release franken-critique 0.4.0 ([3329e93](https://github.com/djm204/frankenbeast/commit/3329e93066bb40ebc8f4cd47839a1052ae78d807))
* **main:** release franken-critique 0.4.0 ([9b62707](https://github.com/djm204/frankenbeast/commit/9b627076d79f8b6ab92d13ccedb5294b12f35bde))
* **main:** release franken-governor 0.3.1 ([1f2ee34](https://github.com/djm204/frankenbeast/commit/1f2ee3438c72308c000658d04c0f70e491f7812d))
* **main:** release franken-governor 0.3.1 ([1c4dc1d](https://github.com/djm204/frankenbeast/commit/1c4dc1d405fc9122c5b04e36965e380d1a511471))
* **main:** release franken-governor 0.4.0 ([da52fa4](https://github.com/djm204/frankenbeast/commit/da52fa41013e85635eb6a59f5001ac32f60b2365))
* **main:** release franken-governor 0.4.0 ([0430d42](https://github.com/djm204/frankenbeast/commit/0430d42062f4e658de609ffeb8862407dc28a008))
* **main:** release franken-governor 0.4.0 ([6faab25](https://github.com/djm204/frankenbeast/commit/6faab25d6676329e5d7fbc4f84d304a30c90817f))
* **main:** release franken-governor 0.4.0 ([4e66333](https://github.com/djm204/frankenbeast/commit/4e663333c719fbb61541da92aa5efa142e44cec6))
* **main:** release franken-governor 0.4.0 ([422adc0](https://github.com/djm204/frankenbeast/commit/422adc0b0a69a102b38027c8677bce3801933d77))
* **main:** release franken-heartbeat 0.3.1 ([705a3ed](https://github.com/djm204/frankenbeast/commit/705a3ed944fd2f05a60bd1db6709a02f65f3d8ce))
* **main:** release franken-heartbeat 0.3.1 ([aca8e23](https://github.com/djm204/frankenbeast/commit/aca8e23ef80a312b738f3b4fbe9cb613e76ccb14))
* **main:** release franken-mcp 0.3.1 ([b1883ff](https://github.com/djm204/frankenbeast/commit/b1883ffb516129bc1717e4416e5c9ff07914e8b7))
* **main:** release franken-mcp 0.3.1 ([b5d29a8](https://github.com/djm204/frankenbeast/commit/b5d29a805d83c587674b68e01ee7310bc9d384a8))
* **main:** release franken-observer 0.3.1 ([6185508](https://github.com/djm204/frankenbeast/commit/61855086227deea864955d3f524a40e0caf0d6b2))
* **main:** release franken-observer 0.3.1 ([0149ef1](https://github.com/djm204/frankenbeast/commit/0149ef1a92cffbe26c9f53aea0f01597a8363ab0))
* **main:** release franken-observer 0.3.2 ([c61c47d](https://github.com/djm204/frankenbeast/commit/c61c47d0b73275e1ee7514fa37f3b7ef733e1e7d))
* **main:** release franken-observer 0.3.2 ([84cc110](https://github.com/djm204/frankenbeast/commit/84cc110c0e2f161f797151f0e92326433a43ddd9))
* **main:** release franken-observer 0.4.0 ([48b478a](https://github.com/djm204/frankenbeast/commit/48b478ac7316bfae25a43f0460f232138e883df6))
* **main:** release franken-observer 0.4.0 ([cb218a4](https://github.com/djm204/frankenbeast/commit/cb218a46d5dbe8aa3ac21eac4922189ddb6914e8))
* **main:** release franken-observer 0.4.0 ([8a6c421](https://github.com/djm204/frankenbeast/commit/8a6c4214ddb33af629897ea01caf03a97cae9af3))
* **main:** release franken-observer 0.4.0 ([92febeb](https://github.com/djm204/frankenbeast/commit/92febeb6b856f9c0af790beee2e54be80159624b))
* **main:** release franken-orchestrator 0.10.0 ([7d57b9b](https://github.com/djm204/frankenbeast/commit/7d57b9b921c14d0f683398cbe004b0b6b1184b0d))
* **main:** release franken-orchestrator 0.10.0 ([c860347](https://github.com/djm204/frankenbeast/commit/c860347ba56772e925c4dc4d551094eeb7fcd02d))
* **main:** release franken-orchestrator 0.11.0 ([dbba9e9](https://github.com/djm204/frankenbeast/commit/dbba9e95f25530db1c3a5a6de738eae6c568ffe3))
* **main:** release franken-orchestrator 0.11.0 ([0a8862e](https://github.com/djm204/frankenbeast/commit/0a8862e02dbb6adf852d687386d3cbb4ded1ba9f))
* **main:** release franken-orchestrator 0.11.1 ([77db6f6](https://github.com/djm204/frankenbeast/commit/77db6f61228a1678c2d2f237cb421c395c1eff25))
* **main:** release franken-orchestrator 0.11.1 ([949bd84](https://github.com/djm204/frankenbeast/commit/949bd84557d7428d374b4447e1d8356e7df26af2))
* **main:** release franken-orchestrator 0.12.0 ([de2c822](https://github.com/djm204/frankenbeast/commit/de2c822d4dde5b70e98db06678646be8e98ea53b))
* **main:** release franken-orchestrator 0.12.0 ([b56a34d](https://github.com/djm204/frankenbeast/commit/b56a34d554b495278b4037cc6c5cefb9d56e33df))
* **main:** release franken-orchestrator 0.13.0 ([7bfef3d](https://github.com/djm204/frankenbeast/commit/7bfef3dc1dc8610bf7b05d621f5da28c91bfbef0))
* **main:** release franken-orchestrator 0.13.0 ([3608647](https://github.com/djm204/frankenbeast/commit/36086470d523deb50d7e78542c1f2338980cc674))
* **main:** release franken-orchestrator 0.14.0 ([17ab09e](https://github.com/djm204/frankenbeast/commit/17ab09e21765c8ac894627053937fd365a60dc6b))
* **main:** release franken-orchestrator 0.14.0 ([36ed876](https://github.com/djm204/frankenbeast/commit/36ed876352be18ee97ff468e131da37d68a1a312))
* **main:** release franken-orchestrator 0.14.1 ([3d8b754](https://github.com/djm204/frankenbeast/commit/3d8b754310111e59c50f0c2d180c441380a35b24))
* **main:** release franken-orchestrator 0.14.1 ([2d784f7](https://github.com/djm204/frankenbeast/commit/2d784f79eaa3f34db01f59739c46b67e4d0c54e6))
* **main:** release franken-orchestrator 0.14.2 ([8a41a9f](https://github.com/djm204/frankenbeast/commit/8a41a9f7665826b8994967e3972369e4bf845b8c))
* **main:** release franken-orchestrator 0.14.2 ([3596d99](https://github.com/djm204/frankenbeast/commit/3596d99dc1416808b33a794b915b4fdffa487357))
* **main:** release franken-orchestrator 0.15.0 ([a5795d1](https://github.com/djm204/frankenbeast/commit/a5795d1b3714d8e88d21098494d1c45a6414b757))
* **main:** release franken-orchestrator 0.15.0 ([2f50aad](https://github.com/djm204/frankenbeast/commit/2f50aadde3aa7f8854ac8065e6643f94cd25959b))
* **main:** release franken-orchestrator 0.16.0 ([bc5f0b6](https://github.com/djm204/frankenbeast/commit/bc5f0b693b741a7b5901fe4564e3ec4e5d2452e0))
* **main:** release franken-orchestrator 0.16.0 ([1510dc9](https://github.com/djm204/frankenbeast/commit/1510dc94837ea66c15756f3869dc145ee9cc6ed2))
* **main:** release franken-orchestrator 0.3.1 ([ef13160](https://github.com/djm204/frankenbeast/commit/ef13160bd37ec2b9d6ea50913af790b570eacd33))
* **main:** release franken-orchestrator 0.3.1 ([20a1ada](https://github.com/djm204/frankenbeast/commit/20a1ada6de182831751bb389ad9b1095827941a4))
* **main:** release franken-orchestrator 0.4.0 ([dc59ca3](https://github.com/djm204/frankenbeast/commit/dc59ca3bf2483386a596eea8aa1660553d887420))
* **main:** release franken-orchestrator 0.4.0 ([1e0d119](https://github.com/djm204/frankenbeast/commit/1e0d119f3b7f9daacb5fbb3101e7c7e3cd9532cc))
* **main:** release franken-orchestrator 0.4.1 ([#109](https://github.com/djm204/frankenbeast/issues/109)) ([012a01a](https://github.com/djm204/frankenbeast/commit/012a01aba1d7bb908ff83d92fc54c68c5fc6377f))
* **main:** release franken-orchestrator 0.5.0 ([#111](https://github.com/djm204/frankenbeast/issues/111)) ([c0ecd21](https://github.com/djm204/frankenbeast/commit/c0ecd215267c534ae48dca5c984fff974acaaa62))
* **main:** release franken-orchestrator 0.6.0 ([04f3e83](https://github.com/djm204/frankenbeast/commit/04f3e831f773607f3e0913257bd389fde8d5a3a2))
* **main:** release franken-orchestrator 0.6.0 ([f26d8d5](https://github.com/djm204/frankenbeast/commit/f26d8d5f85a3f554a717c226b6995a46a268f0e2))
* **main:** release franken-orchestrator 0.7.0 ([a2c3d28](https://github.com/djm204/frankenbeast/commit/a2c3d28325ab7df69322812f7e3d0de9610541a4))
* **main:** release franken-orchestrator 0.7.0 ([c5faafa](https://github.com/djm204/frankenbeast/commit/c5faafa5a30431c21d63d601a761fa32141697c1))
* **main:** release franken-orchestrator 0.8.0 ([ebf5d22](https://github.com/djm204/frankenbeast/commit/ebf5d2270d8da2bedfab62ced7924577e74a05c1))
* **main:** release franken-orchestrator 0.8.0 ([c710711](https://github.com/djm204/frankenbeast/commit/c710711c73f9ce43820d4aba26518f47702c3b5e))
* **main:** release franken-orchestrator 0.9.0 ([1d329a9](https://github.com/djm204/frankenbeast/commit/1d329a93b747c583a33d30119dc70f001c7434f7))
* **main:** release franken-orchestrator 0.9.0 ([60d3c35](https://github.com/djm204/frankenbeast/commit/60d3c35026f473573b8cd402764363b9e8b28805))
* **main:** release franken-planner 0.3.1 ([b9af413](https://github.com/djm204/frankenbeast/commit/b9af41366d4113a58571df48f7b6a1ac8dfa6293))
* **main:** release franken-planner 0.3.1 ([4d53eda](https://github.com/djm204/frankenbeast/commit/4d53edac55621b491cab8860efc990a88f19ab53))
* **main:** release franken-planner 0.4.0 ([7f17b8e](https://github.com/djm204/frankenbeast/commit/7f17b8e22a28a96c642c0239461d08a06e9da2a1))
* **main:** release franken-planner 0.4.0 ([521f2c1](https://github.com/djm204/frankenbeast/commit/521f2c128558af40065111d6ecf5e650089050b3))
* **main:** release franken-planner 0.4.0 ([4ad33cf](https://github.com/djm204/frankenbeast/commit/4ad33cf35c2c22efe34359191e510a6c671d5b1f))
* **main:** release franken-skills 0.3.1 ([e8079d9](https://github.com/djm204/frankenbeast/commit/e8079d91d29a9f2bf4d3f793eeabaff509600824))
* **main:** release franken-skills 0.3.1 ([98fb1ef](https://github.com/djm204/frankenbeast/commit/98fb1ef3984217f6d562fd1825154f18b4020435))
* **main:** release franken-skills 0.4.0 ([5e13bfe](https://github.com/djm204/frankenbeast/commit/5e13bfe55cc6bc616fd2d05e7d9b8e074500b3fc))
* **main:** release franken-skills 0.4.0 ([525b447](https://github.com/djm204/frankenbeast/commit/525b4471e19c95fcb4966c8ab5f2ae01500ffd65))
* **main:** release franken-skills 0.4.0 ([4de5013](https://github.com/djm204/frankenbeast/commit/4de50135f88e9f565d06abb50c188640a9ba3fdd))
* **main:** release franken-skills 0.4.0 ([bc03094](https://github.com/djm204/frankenbeast/commit/bc030943491c239ce9ced84e77b3f3e275a99afb))
* **main:** release franken-types 0.3.1 ([d79e88c](https://github.com/djm204/frankenbeast/commit/d79e88c91781f7a1f45971363ca6c5890033c4bf))
* **main:** release franken-types 0.3.1 ([bfeee54](https://github.com/djm204/frankenbeast/commit/bfeee54916f3cbb849e49532f473d25949385eba))
* **main:** release franken-types 0.3.2 ([5d88dcb](https://github.com/djm204/frankenbeast/commit/5d88dcb63d5c43f7a66e79b4fd5c976c795df164))
* **main:** release franken-types 0.3.2 ([64381db](https://github.com/djm204/frankenbeast/commit/64381db3ca76cd36107dfb5a44e6b8c3a278561f))
* **main:** release franken-types 0.3.2 ([ab62699](https://github.com/djm204/frankenbeast/commit/ab62699ec265117d2ef72d4cd937034dc24b70c4))
* **main:** release franken-types 0.3.2 ([f43701b](https://github.com/djm204/frankenbeast/commit/f43701b48e1029af08c20fd09f6e0e8b200c2e44))
* **main:** release franken-types 0.3.2 ([f5e8572](https://github.com/djm204/frankenbeast/commit/f5e8572a4a4dc044e38520a5f54ffe31faedd39f))
* **main:** release franken-types 0.3.2 ([1412544](https://github.com/djm204/frankenbeast/commit/1412544ec61add96aa25c92a8b57e51c8e429cd8))
* **main:** release frankenbeast 0.3.0 ([#10](https://github.com/djm204/frankenbeast/issues/10)) ([e2f5be0](https://github.com/djm204/frankenbeast/commit/e2f5be03cc40cf0b2af043532175a3f09c95b857))
* **main:** release frankenbeast 0.3.1 ([#15](https://github.com/djm204/frankenbeast/issues/15)) ([6812b65](https://github.com/djm204/frankenbeast/commit/6812b65450a7fc1a24880749302018f806fc2855))
* **main:** release frankenbeast 0.4.0 ([#91](https://github.com/djm204/frankenbeast/issues/91)) ([db0bdba](https://github.com/djm204/frankenbeast/commit/db0bdba6ef74ef3706ac215b001b0b58bd0b3096))
* **main:** release frankenbeast 0.4.1 ([#93](https://github.com/djm204/frankenbeast/issues/93)) ([40d5814](https://github.com/djm204/frankenbeast/commit/40d581460c17b14968b7054c52d2b060b40514f4))
* **main:** release frankenfirewall 0.3.1 ([925d307](https://github.com/djm204/frankenbeast/commit/925d3074dffdec32f7bbf221f52fef8cbd4e8f39))
* **main:** release frankenfirewall 0.3.1 ([b2b5b79](https://github.com/djm204/frankenbeast/commit/b2b5b79796dacc49f8984a398bc9bd575cbfa225))
* **main:** release frankenfirewall 0.4.0 ([02e3d6a](https://github.com/djm204/frankenbeast/commit/02e3d6a9944c9e0a67cb04c5162fd0d21fbb6085))
* **main:** release frankenfirewall 0.4.0 ([d46094f](https://github.com/djm204/frankenbeast/commit/d46094f06b689bd1a96003f1db167f9996d99b39))
* **main:** release frankenfirewall 0.5.0 ([9c6a7dc](https://github.com/djm204/frankenbeast/commit/9c6a7dcb144316d4b9e11cf364ea234b58a958ea))
* **main:** release frankenfirewall 0.5.0 ([746f749](https://github.com/djm204/frankenbeast/commit/746f749120864d41b1de376f862120cc48389472))
* **main:** release frankenfirewall 0.5.0 ([d4488aa](https://github.com/djm204/frankenbeast/commit/d4488aa7ca5a71be9e8f5ea0d011d45baa40cc21))
* move completed plan docs to docs/plans/complete/ ([45a8cac](https://github.com/djm204/frankenbeast/commit/45a8cac11580acce9447902c8e83358cabd01f25))
* move finished plans to complete folder ([f5df763](https://github.com/djm204/frankenbeast/commit/f5df7634aeae10d6b715241f5f091e1e68a72e42))
* release main ([c823154](https://github.com/djm204/frankenbeast/commit/c8231545bd31c69edbbcd8d5d8ef8ba87641e897))
* release main ([86a1f8d](https://github.com/djm204/frankenbeast/commit/86a1f8da0d2d4e547b3ad9df079da581bc947c80))
* release main ([9424d30](https://github.com/djm204/frankenbeast/commit/9424d303b7d2673f805a85338f029b5f40311be9))
* release main ([0cb248b](https://github.com/djm204/frankenbeast/commit/0cb248b7a1fda5821b7f7b1c14e2ece639cbde71))
* release main ([ffee28a](https://github.com/djm204/frankenbeast/commit/ffee28a05bf220a38b0aa10070f6116db0e3c042))
* release main ([ade7f4a](https://github.com/djm204/frankenbeast/commit/ade7f4a923f9ab55a36744d646e70c6da3d8310c))
* release main ([2d3cf22](https://github.com/djm204/frankenbeast/commit/2d3cf2261539e1012e7a82bced3848d5688283cf))
* release main ([a6d94d3](https://github.com/djm204/frankenbeast/commit/a6d94d3456a0f8d011f3ca629f0ca92e520c117e))
* release main ([cda3767](https://github.com/djm204/frankenbeast/commit/cda376733c6c0315470b068c04a9c22a2374bf78))
* release main ([32ccdeb](https://github.com/djm204/frankenbeast/commit/32ccdeb50094924a24da0d75cc9cf489e5435496))
* release main ([696580f](https://github.com/djm204/frankenbeast/commit/696580f097d1f7e982aa35e288eb06d89e86b13f))
* release main ([5e1ba59](https://github.com/djm204/frankenbeast/commit/5e1ba59e0ca6ff7296839508d551d97865adb8d1))
* release main ([8ae6599](https://github.com/djm204/frankenbeast/commit/8ae6599c1a9a30902d39c90e8789998f69424d66))
* release main ([7b7a0ff](https://github.com/djm204/frankenbeast/commit/7b7a0ffa7fa23d0ef398d38f21366d08c24010cd))
* release main ([ea3ffb4](https://github.com/djm204/frankenbeast/commit/ea3ffb4650c2eb8716f7a8b57750b88e6fa3ea2d))
* release main ([6c1bae4](https://github.com/djm204/frankenbeast/commit/6c1bae4ffc62e5d57b21b49fb4abfa4202068bc6))
* release main ([92b122d](https://github.com/djm204/frankenbeast/commit/92b122d377cb480c1f7e1f13150f3f8c49362099))
* release main ([973da3b](https://github.com/djm204/frankenbeast/commit/973da3bc20a6185adcf1b504c997cec4bd0f5170))
* release main ([d4a9d83](https://github.com/djm204/frankenbeast/commit/d4a9d8333d11593e0a678e520bd2f39a97c8ce7c))
* release main ([daed900](https://github.com/djm204/frankenbeast/commit/daed9006881558c39d010263f1c409be3785b09e))
* release main ([1ab0863](https://github.com/djm204/frankenbeast/commit/1ab086391aec199aa4685bcc65c0cf6b1a9ea0e6))
* release main ([db01295](https://github.com/djm204/frankenbeast/commit/db01295e7a3734d378c25c17fb5ad8d39e6891f2))
* release main ([4b47eca](https://github.com/djm204/frankenbeast/commit/4b47eca3bf14c4972f038bbd9e0f5bed31e1719c))
* release main ([fabea22](https://github.com/djm204/frankenbeast/commit/fabea2256bbf60ce9e81573564e599fedd7495c4))
* release main ([979b103](https://github.com/djm204/frankenbeast/commit/979b103b6644a4b5f92dda8a0408aece11c627c4))
* release main ([66b746c](https://github.com/djm204/frankenbeast/commit/66b746cc350cc535edab515bea5564f580c5f7e7))
* release main ([#211](https://github.com/djm204/frankenbeast/issues/211)) ([ad3e1a4](https://github.com/djm204/frankenbeast/commit/ad3e1a429d9d518254df9e81215d84fd17e6eac4))
* release main ([#214](https://github.com/djm204/frankenbeast/issues/214)) ([6fe0df8](https://github.com/djm204/frankenbeast/commit/6fe0df8c04d94121179bcf9da00fdfb3a025bf91))
* release main ([#97](https://github.com/djm204/frankenbeast/issues/97)) ([3e6925f](https://github.com/djm204/frankenbeast/commit/3e6925f7e274e8b5271c65d1f1533b1c5cef21b5))
* resolve manifest conflict ([6da6efa](https://github.com/djm204/frankenbeast/commit/6da6efac2ceb2fac9b1ff57a338d40c0b7d16041))
* resolve manifest conflict ([c777b97](https://github.com/djm204/frankenbeast/commit/c777b9714bf46f78c9b9d0467e1a78e085217665))
* resolve manifest conflict ([ec9e9be](https://github.com/djm204/frankenbeast/commit/ec9e9be4a6ae0d43c27b6a7df1ab2ca0db60093b))
* resolve manifest conflict ([55623d9](https://github.com/djm204/frankenbeast/commit/55623d923502b1cedef3503dc9a19b151b33671c))
* resolve manifest conflict ([d66f706](https://github.com/djm204/frankenbeast/commit/d66f706c88d9bd9f175d28e40f2428285eaa9ade))
* resolve manifest conflict ([6e41dbb](https://github.com/djm204/frankenbeast/commit/6e41dbb5fa8067a96054d201b86cf1928fab2a11))
* resolve manifest conflict after franken-types merge ([9df4952](https://github.com/djm204/frankenbeast/commit/9df49529ba12edce9fbf081cfb21729bb9a2617d))
* **submodule:** update franken-critique — fix TS7030 middleware returns ([987cee1](https://github.com/djm204/frankenbeast/commit/987cee13cf42d87290dce6bb9df01c7a49f6660c))
* **submodule:** update orchestrator — --cleanup flag and branding ([a29f946](https://github.com/djm204/frankenbeast/commit/a29f946d8c817a00d94d880e22f1b83a7351e9a6))
* **submodule:** update orchestrator — PR creator head==base guard ([1bd2dd2](https://github.com/djm204/frankenbeast/commit/1bd2dd2328c4f70c96d024cf6277fb5e9353c6dc))
* **submodule:** update orchestrator — strip hook output from CLI responses ([3dd5e3d](https://github.com/djm204/frankenbeast/commit/3dd5e3db9dcb336716665334623bd3d22cbaac7a))
* **submodule:** update orchestrator — tool-use stream summarization ([6999e80](https://github.com/djm204/frankenbeast/commit/6999e80594574b16ce2c17158c29cbe93a5be6f6))
* update franken-orchestrator gitlink — fix [#92](https://github.com/djm204/frankenbeast/issues/92) stream-JSON commits ([58c3cbe](https://github.com/djm204/frankenbeast/commit/58c3cbeba33b3b68fa7e0c9694f1728ffc876c2c))
* update franken-planner gitlink — fix vitest watch mode ([99640b8](https://github.com/djm204/frankenbeast/commit/99640b8a0f2d09ac3f2cfb12cea144e79020203a))
* update frankenfirewall gitlink — fix TS strictness errors ([708c787](https://github.com/djm204/frankenbeast/commit/708c787838c420a255b672b6e545450d4c1ef0cf))
* update orchestrator gitlink — baseBranch creation fix ([435e0dc](https://github.com/djm204/frankenbeast/commit/435e0dc6421e4ede631b0180c98f34223ab214a2))
* update README ([b514e04](https://github.com/djm204/frankenbeast/commit/b514e045599d44cb8d8236493a107defe4da4790))
* **web:** add Radix UI, Tailwind v4, and Zustand dependencies ([31bf91a](https://github.com/djm204/frankenbeast/commit/31bf91a4a1a25a21190e3f471e01c38c8d636764))


### Documentation

* add ADR-012 (multi-pass pipeline) and ADR-013 (expanded chunk schema) ([39a5a49](https://github.com/djm204/frankenbeast/commit/39a5a49bc66ea984f73cd364250c77c4540f1c1f))
* add agent init workflow design and plan ([95421a0](https://github.com/djm204/frankenbeast/commit/95421a04cc78bc330acff3a1349af3948eb1e23e))
* add beasts dispatch design and implementation plan ([a2c2b77](https://github.com/djm204/frankenbeast/commit/a2c2b770b97c60f98a20a764f2c22563e851555d))
* add chat agent dispatch design doc ([6958b2b](https://github.com/djm204/frankenbeast/commit/6958b2b27235eb4eb1fe68ed65908237ff2e05f2))
* add chat agent dispatch implementation plan ([784a44c](https://github.com/djm204/frankenbeast/commit/784a44c06605c05ae087dcc4b017db3911814ca8))
* add comprehensive data flow guide ([441c310](https://github.com/djm204/frankenbeast/commit/441c310a14280aeb5456f71f9499c321183af45b))
* add frankenbeast.example.json with all config properties ([814eaa8](https://github.com/djm204/frankenbeast/commit/814eaa8feb3c2bb965b99e4cd672d9a27ebb7c1b))
* add interview loop UX improvements design ([a923536](https://github.com/djm204/frankenbeast/commit/a923536e8e865ad8ad41e0def9c14b1006f1eaa7))
* add interview UX implementation plan (8 tasks) ([98096a1](https://github.com/djm204/frankenbeast/commit/98096a1114b1990229f97ef2df2fd1d501b9df7f))
* add issue-aware issues resume design and plan ([a87a74b](https://github.com/djm204/frankenbeast/commit/a87a74bdfe91c153ad0f40bd788ae29c958bdc84))
* add issues provider fallback design and plan ([8623a74](https://github.com/djm204/frankenbeast/commit/8623a74ada6b8aeb6bb86be82dfbbbb675b46dfb))
* add monorepo migration ADR, design doc, and implementation plan ([47b96b0](https://github.com/djm204/frankenbeast/commit/47b96b0bc42b24eea5d3e8f16c6d3e09979e7a63))
* add planner hardening implementation plan ([610de89](https://github.com/djm204/frankenbeast/commit/610de8969e20838708917a951bd97fee7d5c40d9))
* add Secret Management guide to README and franken-web setup ([584e7cc](https://github.com/djm204/frankenbeast/commit/584e7cc97c556007cae1b6f2aa65ac99e84bdb79))
* add secret store to RAMP_UP and ARCHITECTURE ([a002d2a](https://github.com/djm204/frankenbeast/commit/a002d2aefbd8c4c9fb6e645e3119c1e191a40b23))
* add tracked agent workflow adr ([0d550a2](https://github.com/djm204/frankenbeast/commit/0d550a2f1ec16f286d2260a80e06374046ef3442))
* ADR-018 secret store architecture ([6b0f59f](https://github.com/djm204/frankenbeast/commit/6b0f59ffb0473336f98d85ffc8268a073159eb3e))
* ADR-019 secret backend comparison and recommendations ([524ef08](https://github.com/djm204/frankenbeast/commit/524ef08e09cca737786cbe329904f43fb5c0588c))
* **adr:** add ADR-016 for external comms gateway architecture ([cfbdef3](https://github.com/djm204/frankenbeast/commit/cfbdef3e17120825a96e1959ec4036b197605588))
* **adr:** ADR-014 chat two-tier dispatch architecture ([bcec6a0](https://github.com/djm204/frankenbeast/commit/bcec6a0ef1c05b15df19fee73297c5900d9ece02))
* **adr:** ADR-015 shared spinner abstraction ([e347467](https://github.com/djm204/frankenbeast/commit/e3474674ba8ac5a1db2bd46d86dc92a90ebbc37c))
* **adr:** record dashboard chat server entrypoint ([6108351](https://github.com/djm204/frankenbeast/commit/61083513e2e8940dee468b2c6e6cdf620b733715))
* **chat:** add dashboard chat run guide ([dde4c18](https://github.com/djm204/frankenbeast/commit/dde4c1845c04ed19872f46253d21e90cbeb45c5d))
* describe tracked agent init workflow ([efeebb8](https://github.com/djm204/frankenbeast/commit/efeebb8d7be5d0eb1abe2ef9323269f09a7bf0d7))
* fix stale documentation — test counts, ADR count, PR target branch ([0055602](https://github.com/djm204/frankenbeast/commit/0055602cf564e090f9175aa3f5b172569f7d9141))
* **issues:** document upstream repo targeting ([e8632ad](https://github.com/djm204/frankenbeast/commit/e8632ad9ada8689b0f6d3f48a48555ba68ab5c97))
* mark beastloop tiers 3-4 wiring as implemented ([2c4bdc4](https://github.com/djm204/frankenbeast/commit/2c4bdc489667acb4b8750594fcd88746bbcf707d))
* mark tiers 1-2 wiring design as implemented ([57ffee1](https://github.com/djm204/frankenbeast/commit/57ffee10153a7dc88632607a56d7b99f00188ea1))
* move completed plans into complete ([914c8c1](https://github.com/djm204/frankenbeast/commit/914c8c1caef4d5751589b1119910c04f82047d7e))
* **network:** add operator guide and ADR ([a396268](https://github.com/djm204/frankenbeast/commit/a396268d0893e131a7de7c9ff4ed4ca8ed310cc9))
* **orchestrator:** document chunk session execution model ([bf4347c](https://github.com/djm204/frankenbeast/commit/bf4347ca1e1d7544d522313767966d1b40c7d746))
* **plan:** add network operator design and implementation plan ([eef8acc](https://github.com/djm204/frankenbeast/commit/eef8acc2e0b435d3a9a1a0e3c4f38c870500da79))
* **plans:** add dashboard ux refresh design and plan ([2976f43](https://github.com/djm204/frankenbeast/commit/2976f4360cc84d35cbfdfe793fede52c8b69f39d))
* **plans:** move channel-integrations implementation plan to complete ([84962f0](https://github.com/djm204/frankenbeast/commit/84962f0296e6ba5aa4a603dbf2d3b86d1e38f32d))
* **plans:** update init workflow and add new design documents ([a26402b](https://github.com/djm204/frankenbeast/commit/a26402b65f609b6825fef14807609f02f067cd7b))
* **plan:** update init workflow for current project state ([48434a2](https://github.com/djm204/frankenbeast/commit/48434a2dc9c30b0861af45821422be4f4be1704e))
* refresh init workflow design and plan ([d590651](https://github.com/djm204/frankenbeast/commit/d5906511dba6a7ee07d809987a4bef63e6329c07))
* sync ramp-up guides with workspace ([d989aa5](https://github.com/djm204/frankenbeast/commit/d989aa52b9c9378c45cf28c470e267f0e46caeed))
* update RalphLoop→MartinLoop references in root docs ([515ae01](https://github.com/djm204/frankenbeast/commit/515ae015d7cb1a73b14a359acc949b5536165616))
* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))
* update RAMP_UP.md with chat agent dispatch and new ADRs ([e94f69f](https://github.com/djm204/frankenbeast/commit/e94f69f5c9bdde0d18f74daddf7a27e2c18fa89f))
* update README, RAMP_UP, and ARCHITECTURE for current project state ([24f9952](https://github.com/djm204/frankenbeast/commit/24f9952f25e3b77d3cc7e768c2e35415eff71b5a))


### CI/CD

* auto-merge release please prs after ci ([5c9afbe](https://github.com/djm204/frankenbeast/commit/5c9afbe2c561cb9fae87b7fc00361e6c35aeaa4a))
* auto-merge release please prs after ci ([6e1557a](https://github.com/djm204/frankenbeast/commit/6e1557a7ed4cedf3f731b717c62451d5129d05c7))


### Tests

* **comms:** remove real socket listeners from websocket unit tests ([130b607](https://github.com/djm204/frankenbeast/commit/130b6070af14e8b8e40c2dddb6cf0769e7c5ffb5))
* **comms:** remove real socket listeners from websocket unit tests ([595cd07](https://github.com/djm204/frankenbeast/commit/595cd0799a7c2f389e3e86f10fa98154df99d26d))

## [0.22.2](https://github.com/djm204/frankenbeast/compare/v0.22.1...v0.22.2) (2026-03-16)


### Miscellaneous

* release main ([9424d30](https://github.com/djm204/frankenbeast/commit/9424d303b7d2673f805a85338f029b5f40311be9))
* release main ([0cb248b](https://github.com/djm204/frankenbeast/commit/0cb248b7a1fda5821b7f7b1c14e2ece639cbde71))

## [0.22.1](https://github.com/djm204/frankenbeast/compare/v0.22.0...v0.22.1) (2026-03-15)


### Bug Fixes

* **orchestrator:** add missing @franken/critique and @franken/governor dependencies ([31e71f0](https://github.com/djm204/frankenbeast/commit/31e71f01d4aacd062ec42aebcf7bca3762a7de39))

## [0.22.0](https://github.com/djm204/frankenbeast/compare/v0.21.0...v0.22.0) (2026-03-15)


### Features

* **franken-orchestrator:** add intelligent LLM caching ([c00307c](https://github.com/djm204/frankenbeast/commit/c00307c91c7612f38aa86962f07d04e7feec6b61))
* **franken-orchestrator:** cache repeated planning and issue prompts ([89b3591](https://github.com/djm204/frankenbeast/commit/89b3591b3b92213f14129f60d4cce3b40b15b941))
* wire critique and governor modules in dep-factory (Tiers 3-4) ([8d55339](https://github.com/djm204/frankenbeast/commit/8d553399167860bad06a03c85e5b6045a0fb8b1e))


### Documentation

* mark beastloop tiers 3-4 wiring as implemented ([2c4bdc4](https://github.com/djm204/frankenbeast/commit/2c4bdc489667acb4b8750594fcd88746bbcf707d))
* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))

## [0.21.0](https://github.com/djm204/frankenbeast/compare/v0.20.0...v0.21.0) (2026-03-13)


### Features

* add module toggle UI to beast dispatch dashboard ([98e9dba](https://github.com/djm204/frankenbeast/commit/98e9dbaf41142cc16df71dda34776a4db96200f3))
* add module toggle UI to beast dispatch dashboard ([c13a1a3](https://github.com/djm204/frankenbeast/commit/c13a1a34849b67b0f1a41c59cba749ee291a7d59))


### Documentation

* add comprehensive data flow guide ([441c310](https://github.com/djm204/frankenbeast/commit/441c310a14280aeb5456f71f9499c321183af45b))

## [0.20.0](https://github.com/djm204/frankenbeast/compare/v0.19.3...v0.20.0) (2026-03-13)


### Features

* wire real Firewall, Skills, Memory modules into BeastLoop (Tiers 1-2) ([b835f52](https://github.com/djm204/frankenbeast/commit/b835f529b6167984d54586d8194485664418eef6))


### Miscellaneous

* add firewall, skills, brain workspace deps to orchestrator ([a8317b7](https://github.com/djm204/frankenbeast/commit/a8317b74d0ed177e55ee46eaa1da6cabcd3ac6ad))
* delete auto merge workflow that doesnt work ([c496042](https://github.com/djm204/frankenbeast/commit/c4960427453f48d183d08d945e7c9ae6b8a51a0e))
* **franken-orchestrator:** implement you-are-hardening-chunk-homepfkdevfrankenbeas ([362d813](https://github.com/djm204/frankenbeast/commit/362d81366976d04ea822f3d32797b8525504891d))
* implement you-are-hardening-chunk-homepfkdevfrankenbeas ([1b1917c](https://github.com/djm204/frankenbeast/commit/1b1917ca8feaf0bdcea735876253d7918cb3d619))


### Documentation

* mark tiers 1-2 wiring design as implemented ([57ffee1](https://github.com/djm204/frankenbeast/commit/57ffee10153a7dc88632607a56d7b99f00188ea1))

## [0.19.3](https://github.com/djm204/frankenbeast/compare/v0.19.2...v0.19.3) (2026-03-13)


### Bug Fixes

* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([1e88e62](https://github.com/djm204/frankenbeast/commit/1e88e6222bc1149311fb8ade17ac8eafa3525bc0))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([33dbf5a](https://github.com/djm204/frankenbeast/commit/33dbf5a483debc2460116f2b1cbbf0cd029a8061))

## [0.19.2](https://github.com/djm204/frankenbeast/compare/v0.19.1...v0.19.2) (2026-03-13)


### Bug Fixes

* **orchestrator:** standardize subprocess failures ([#213](https://github.com/djm204/frankenbeast/issues/213)) ([130bce2](https://github.com/djm204/frankenbeast/commit/130bce266b71dcc84ba3e3b463d8ff5b4b46a475))

## [0.19.1](https://github.com/djm204/frankenbeast/compare/v0.19.0...v0.19.1) (2026-03-13)


### Bug Fixes

* **orchestrator:** isolate issue stage sessions ([#212](https://github.com/djm204/frankenbeast/issues/212)) ([44a2c61](https://github.com/djm204/frankenbeast/commit/44a2c617327540bfd04253062e6017487656a3e2))

## [0.19.0](https://github.com/djm204/frankenbeast/compare/v0.18.2...v0.19.0) (2026-03-12)


### Features

* **orchestrator:** unify issue pipeline with BeastLoop and optimize context window ([ffa6299](https://github.com/djm204/frankenbeast/commit/ffa6299f446663cc724da6311467824d75bed0c5))


### Bug Fixes

* **orchestrator:** standardize issue execution via chunk files ([63942f6](https://github.com/djm204/frankenbeast/commit/63942f6b2a6aff3088a1f5c55c652719717fe7f1))
* **orchestrator:** standardize issue execution via chunk files ([1e6d2eb](https://github.com/djm204/frankenbeast/commit/1e6d2ebbd6e8ad662ca6d70158078bf65070c28a))

## [0.18.2](https://github.com/djm204/frankenbeast/compare/v0.18.1...v0.18.2) (2026-03-12)


### Bug Fixes

* **orchestrator:** make one-shot issues issue-aware and resumable ([09488cb](https://github.com/djm204/frankenbeast/commit/09488cb6f49ee2179ce9d2d0cfaff2f19cd1ef4f))


### Documentation

* add issue-aware issues resume design and plan ([a87a74b](https://github.com/djm204/frankenbeast/commit/a87a74bdfe91c153ad0f40bd788ae29c958bdc84))

## [0.18.1](https://github.com/djm204/frankenbeast/compare/v0.18.0...v0.18.1) (2026-03-12)


### Bug Fixes

* **orchestrator:** honor provider selection and fallback semantics ([abf1b77](https://github.com/djm204/frankenbeast/commit/abf1b776226e67257ec39e2d34cd359bc3e7eb95))


### Miscellaneous

* **franken-observer:** implement fix-issue-89-costcalculator-silently-returns-0-f ([ca26308](https://github.com/djm204/frankenbeast/commit/ca2630882bf79032e66da42fce92f410c35afe7c))


### Documentation

* add issues provider fallback design and plan ([8623a74](https://github.com/djm204/frankenbeast/commit/8623a74ada6b8aeb6bb86be82dfbbbb675b46dfb))

## [0.18.0](https://github.com/djm204/frankenbeast/compare/v0.17.1...v0.18.0) (2026-03-12)


### Features

* add tracked agent dashboard controls ([0f9b4db](https://github.com/djm204/frankenbeast/commit/0f9b4db305950ccdd1580fee28d8ba1ee751d9ee))
* add tracked agent dashboard controls ([fb13aa7](https://github.com/djm204/frankenbeast/commit/fb13aa740788a9ec7b81066d732318ce5314efb7))


### Bug Fixes

* broaden start endpoint status guard and clear selection on agent delete ([45026bf](https://github.com/djm204/frankenbeast/commit/45026bf0f7b7fc5edede087e00176f6ed09d3493))
* satisfy dashboard control typecheck ([065a566](https://github.com/djm204/frankenbeast/commit/065a566b14ddc66dd3d8fb034b575f538c889f4a))

## [0.17.1](https://github.com/djm204/frankenbeast/compare/v0.17.0...v0.17.1) (2026-03-12)


### Miscellaneous

* **main:** release franken-planner 0.4.0 ([7f17b8e](https://github.com/djm204/frankenbeast/commit/7f17b8e22a28a96c642c0239461d08a06e9da2a1))

## [0.17.0](https://github.com/djm204/frankenbeast/compare/v0.16.3...v0.17.0) (2026-03-12)


### Features

* add beast dashboard resume and path controls ([500999f](https://github.com/djm204/frankenbeast/commit/500999f8404ef680616341136cbe5c4eeef4fe10))
* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))
* secret store with 4 pluggable backends ([f05846f](https://github.com/djm204/frankenbeast/commit/f05846f70dbc6b6815ae4568c829d9eedc0a1670))


### Miscellaneous

* **main:** release franken-observer 0.4.0 ([8a6c421](https://github.com/djm204/frankenbeast/commit/8a6c4214ddb33af629897ea01caf03a97cae9af3))
* **main:** release franken-observer 0.4.0 ([92febeb](https://github.com/djm204/frankenbeast/commit/92febeb6b856f9c0af790beee2e54be80159624b))
* **main:** release franken-orchestrator 0.16.0 ([bc5f0b6](https://github.com/djm204/frankenbeast/commit/bc5f0b693b741a7b5901fe4564e3ec4e5d2452e0))
* **main:** release franken-orchestrator 0.16.0 ([1510dc9](https://github.com/djm204/frankenbeast/commit/1510dc94837ea66c15756f3869dc145ee9cc6ed2))
* **main:** release franken-planner 0.4.0 ([4ad33cf](https://github.com/djm204/frankenbeast/commit/4ad33cf35c2c22efe34359191e510a6c671d5b1f))
* **main:** release franken-skills 0.4.0 ([4de5013](https://github.com/djm204/frankenbeast/commit/4de50135f88e9f565d06abb50c188640a9ba3fdd))
* **main:** release franken-skills 0.4.0 ([bc03094](https://github.com/djm204/frankenbeast/commit/bc030943491c239ce9ced84e77b3f3e275a99afb))


### Documentation

* sync ramp-up guides with workspace ([d989aa5](https://github.com/djm204/frankenbeast/commit/d989aa52b9c9378c45cf28c470e267f0e46caeed))

## [0.16.3](https://github.com/djm204/frankenbeast/compare/v0.16.2...v0.16.3) (2026-03-11)


### Miscellaneous

* **main:** release franken-orchestrator 0.14.2 ([8a41a9f](https://github.com/djm204/frankenbeast/commit/8a41a9f7665826b8994967e3972369e4bf845b8c))

## [0.16.2](https://github.com/djm204/frankenbeast/compare/v0.16.1...v0.16.2) (2026-03-11)


### Bug Fixes

* fix the connection between dashboard and backend, and make some UI changes ([d137437](https://github.com/djm204/frankenbeast/commit/d1374374b3e0e6195b58a7fd8f19a74dc7f6a40f))


### Miscellaneous

* **main:** release franken-orchestrator 0.14.1 ([3d8b754](https://github.com/djm204/frankenbeast/commit/3d8b754310111e59c50f0c2d180c441380a35b24))
* **main:** release franken-orchestrator 0.14.1 ([2d784f7](https://github.com/djm204/frankenbeast/commit/2d784f79eaa3f34db01f59739c46b67e4d0c54e6))
* update README ([b514e04](https://github.com/djm204/frankenbeast/commit/b514e045599d44cb8d8236493a107defe4da4790))


### Documentation

* add agent init workflow design and plan ([95421a0](https://github.com/djm204/frankenbeast/commit/95421a04cc78bc330acff3a1349af3948eb1e23e))

## [0.16.1](https://github.com/djm204/frankenbeast/compare/v0.16.0...v0.16.1) (2026-03-11)


### Miscellaneous

* **main:** release franken-orchestrator 0.14.0 ([17ab09e](https://github.com/djm204/frankenbeast/commit/17ab09e21765c8ac894627053937fd365a60dc6b))

## [0.16.0](https://github.com/djm204/frankenbeast/compare/v0.15.0...v0.16.0) (2026-03-11)


### Features

* add init config wizard ([9129b73](https://github.com/djm204/frankenbeast/commit/9129b736bf0d0fd79a9089dab9eebe6178b1ff4d))
* **orchestrator:** support upstream repo targeting for issues ([414b7e1](https://github.com/djm204/frankenbeast/commit/414b7e1c33e5762c5966b55d05932ef02ba2fe3a))
* **orchestrator:** support upstream repo targeting for issues ([20d0585](https://github.com/djm204/frankenbeast/commit/20d058503589bdf940b4cbc497b5e22ec3310fe8))


### Bug Fixes

* **observer:** fix cost tracking and document implementation gaps ([7054989](https://github.com/djm204/frankenbeast/commit/7054989522894d5bd2429d71ef73d041e9599725))
* **observer:** fix zero-cost tracking and document implementation gaps ([c75c322](https://github.com/djm204/frankenbeast/commit/c75c322b46dc804873cff78c1ae8756104092cb7))


### Miscellaneous

* **main:** release franken-observer 0.3.2 ([c61c47d](https://github.com/djm204/frankenbeast/commit/c61c47d0b73275e1ee7514fa37f3b7ef733e1e7d))
* **main:** release franken-observer 0.3.2 ([84cc110](https://github.com/djm204/frankenbeast/commit/84cc110c0e2f161f797151f0e92326433a43ddd9))
* **main:** release franken-orchestrator 0.13.0 ([7bfef3d](https://github.com/djm204/frankenbeast/commit/7bfef3dc1dc8610bf7b05d621f5da28c91bfbef0))
* **main:** release franken-orchestrator 0.13.0 ([3608647](https://github.com/djm204/frankenbeast/commit/36086470d523deb50d7e78542c1f2338980cc674))


### Documentation

* **issues:** document upstream repo targeting ([e8632ad](https://github.com/djm204/frankenbeast/commit/e8632ad9ada8689b0f6d3f48a48555ba68ab5c97))
* refresh init workflow design and plan ([d590651](https://github.com/djm204/frankenbeast/commit/d5906511dba6a7ee07d809987a4bef63e6329c07))


### CI/CD

* auto-merge release please prs after ci ([5c9afbe](https://github.com/djm204/frankenbeast/commit/5c9afbe2c561cb9fae87b7fc00361e6c35aeaa4a))
* auto-merge release please prs after ci ([6e1557a](https://github.com/djm204/frankenbeast/commit/6e1557a7ed4cedf3f731b717c62451d5129d05c7))

## [0.15.0](https://github.com/djm204/frankenbeast/compare/v0.14.1...v0.15.0) (2026-03-10)


### Features

* add beasts dispatch station ([5d87015](https://github.com/djm204/frankenbeast/commit/5d87015b72c714481f846547bdfb847068478e00))
* **dashboard:** add beasts dispatch station ([2e5537a](https://github.com/djm204/frankenbeast/commit/2e5537a3cdecc078e55d2ecdfb84c62735bdf265))
* **orchestrator:** persist beast runs attempts and logs ([b8344e8](https://github.com/djm204/frankenbeast/commit/b8344e8767b4b3bbc5fdb9db67cbf34a645abf5b))


### Miscellaneous

* add docs ([72d0814](https://github.com/djm204/frankenbeast/commit/72d0814a39970990887bea0aff431c5030a89271))
* **main:** release 0.14.2 ([84bff28](https://github.com/djm204/frankenbeast/commit/84bff28f92c869bff0e46bbdc03c42d41b85cf34))
* **main:** release 0.14.2 ([8351789](https://github.com/djm204/frankenbeast/commit/835178959e3a387c8122992fef8f74d17e9626ee))
* **main:** release franken-orchestrator 0.12.0 ([de2c822](https://github.com/djm204/frankenbeast/commit/de2c822d4dde5b70e98db06678646be8e98ea53b))
* **main:** release franken-orchestrator 0.12.0 ([b56a34d](https://github.com/djm204/frankenbeast/commit/b56a34d554b495278b4037cc6c5cefb9d56e33df))


### Documentation

* add beasts dispatch design and implementation plan ([a2c2b77](https://github.com/djm204/frankenbeast/commit/a2c2b770b97c60f98a20a764f2c22563e851555d))

## [0.14.2](https://github.com/djm204/frankenbeast/compare/v0.14.1...v0.14.2) (2026-03-10)


### Miscellaneous

* add docs ([72d0814](https://github.com/djm204/frankenbeast/commit/72d0814a39970990887bea0aff431c5030a89271))

## [0.14.1](https://github.com/djm204/frankenbeast/compare/v0.14.0...v0.14.1) (2026-03-10)


### Bug Fixes

* **network:** harden startup flow and dashboard connectivity ([b881f2b](https://github.com/djm204/frankenbeast/commit/b881f2bd2d7bf5aa68e9e1f76986d18204811021))
* **network:** harden startup flow and dashboard connectivity ([c312e9f](https://github.com/djm204/frankenbeast/commit/c312e9fd4dd6e2db0f3388da765a3bcb6d7e1b92))


### Miscellaneous

* **main:** release franken-critique 0.4.0 ([8c506d9](https://github.com/djm204/frankenbeast/commit/8c506d90279c82e9c38ea6ca65d4fb11b0b7ee11))
* **main:** release franken-governor 0.4.0 ([da52fa4](https://github.com/djm204/frankenbeast/commit/da52fa41013e85635eb6a59f5001ac32f60b2365))
* **main:** release franken-governor 0.4.0 ([0430d42](https://github.com/djm204/frankenbeast/commit/0430d42062f4e658de609ffeb8862407dc28a008))
* **main:** release franken-governor 0.4.0 ([6faab25](https://github.com/djm204/frankenbeast/commit/6faab25d6676329e5d7fbc4f84d304a30c90817f))
* **main:** release franken-orchestrator 0.11.1 ([77db6f6](https://github.com/djm204/frankenbeast/commit/77db6f61228a1678c2d2f237cb421c395c1eff25))
* **main:** release franken-orchestrator 0.11.1 ([949bd84](https://github.com/djm204/frankenbeast/commit/949bd84557d7428d374b4447e1d8356e7df26af2))
* **main:** release franken-types 0.3.2 ([5d88dcb](https://github.com/djm204/frankenbeast/commit/5d88dcb63d5c43f7a66e79b4fd5c976c795df164))
* **main:** release franken-types 0.3.2 ([64381db](https://github.com/djm204/frankenbeast/commit/64381db3ca76cd36107dfb5a44e6b8c3a278561f))

## [0.14.0](https://github.com/djm204/frankenbeast/compare/v0.13.0...v0.14.0) (2026-03-10)


### Features

* **web:** refresh dashboard shell and controls ([570383f](https://github.com/djm204/frankenbeast/commit/570383f35f7c0f53fb7c8bf0eeb9b5ca73c4a7c8))
* **web:** refresh dashboard shell UX and controls ([7d103d9](https://github.com/djm204/frankenbeast/commit/7d103d97efc3d5c76e85d952c786bf3f8c20130a))


### Bug Fixes

* **comms:** use concrete http request and response types ([7624751](https://github.com/djm204/frankenbeast/commit/762475103ac4e7135da0de7e41cb8d6fa51054d1))


### Miscellaneous

* **main:** release franken-governor 0.4.0 ([4e66333](https://github.com/djm204/frankenbeast/commit/4e663333c719fbb61541da92aa5efa142e44cec6))
* **main:** release frankenfirewall 0.4.0 ([02e3d6a](https://github.com/djm204/frankenbeast/commit/02e3d6a9944c9e0a67cb04c5162fd0d21fbb6085))


### Documentation

* **plans:** add dashboard ux refresh design and plan ([2976f43](https://github.com/djm204/frankenbeast/commit/2976f4360cc84d35cbfdfe793fede52c8b69f39d))

## [0.13.0](https://github.com/djm204/frankenbeast/compare/v0.12.0...v0.13.0) (2026-03-10)


### Features

* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))
* **network:** add config-driven network operator control plane ([816ef85](https://github.com/djm204/frankenbeast/commit/816ef853cb0a74ef3d700dc365c2ad4fd198dba4))
* **network:** support managed service config overrides ([57974f1](https://github.com/djm204/frankenbeast/commit/57974f16a8a6cdc909f74cb1c1be47a6c7ae14ae))
* **web:** add dashboard network operator controls ([1cafbba](https://github.com/djm204/frankenbeast/commit/1cafbba2f7542e5561fb3bc8863fe1458fce0575))


### Bug Fixes

* **comms:** resolve build errors and unify websocket types ([2669d44](https://github.com/djm204/frankenbeast/commit/2669d4487bdfab9ef3ba522ce5a2dfa4b929cc7f))
* **comms:** resolve build errors and unify websocket types ([bfd0fb8](https://github.com/djm204/frankenbeast/commit/bfd0fb8cbb4656a719d9024a96bb5ca60734c40d))


### Miscellaneous

* **main:** release franken-critique 0.4.0 ([3329e93](https://github.com/djm204/frankenbeast/commit/3329e93066bb40ebc8f4cd47839a1052ae78d807))
* **main:** release franken-critique 0.4.0 ([9b62707](https://github.com/djm204/frankenbeast/commit/9b627076d79f8b6ab92d13ccedb5294b12f35bde))
* **main:** release franken-orchestrator 0.11.0 ([dbba9e9](https://github.com/djm204/frankenbeast/commit/dbba9e95f25530db1c3a5a6de738eae6c568ffe3))
* **main:** release franken-orchestrator 0.11.0 ([0a8862e](https://github.com/djm204/frankenbeast/commit/0a8862e02dbb6adf852d687386d3cbb4ded1ba9f))
* **main:** release franken-types 0.3.2 ([f5e8572](https://github.com/djm204/frankenbeast/commit/f5e8572a4a4dc044e38520a5f54ffe31faedd39f))
* **main:** release franken-types 0.3.2 ([1412544](https://github.com/djm204/frankenbeast/commit/1412544ec61add96aa25c92a8b57e51c8e429cd8))


### Documentation

* **network:** add operator guide and ADR ([a396268](https://github.com/djm204/frankenbeast/commit/a396268d0893e131a7de7c9ff4ed4ca8ed310cc9))
* **plan:** add network operator design and implementation plan ([eef8acc](https://github.com/djm204/frankenbeast/commit/eef8acc2e0b435d3a9a1a0e3c4f38c870500da79))
* update README, RAMP_UP, and ARCHITECTURE for current project state ([24f9952](https://github.com/djm204/frankenbeast/commit/24f9952f25e3b77d3cc7e768c2e35415eff71b5a))


### Tests

* **comms:** remove real socket listeners from websocket unit tests ([130b607](https://github.com/djm204/frankenbeast/commit/130b6070af14e8b8e40c2dddb6cf0769e7c5ffb5))
* **comms:** remove real socket listeners from websocket unit tests ([595cd07](https://github.com/djm204/frankenbeast/commit/595cd0799a7c2f389e3e86f10fa98154df99d26d))

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
