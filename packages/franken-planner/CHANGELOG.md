# Changelog

## [0.4.16](https://github.com/djm204/frankenbeast/compare/@franken/planner-v0.4.15...@franken/planner-v0.4.16) (2026-07-14)


### Bug Fixes

* **deps:** repair npm security and maintenance update ([4fd8ecc](https://github.com/djm204/frankenbeast/commit/4fd8eccf9b57960572d624aaa18ceac773fddcc0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.10.0 to 0.10.1

## [0.4.15](https://github.com/djm204/frankenbeast/compare/@franken/planner-v0.4.14...@franken/planner-v0.4.15) (2026-07-14)


### Bug Fixes

* **governor:** honor scoped operator session tokens ([#2112](https://github.com/djm204/frankenbeast/issues/2112)) ([1420a32](https://github.com/djm204/frankenbeast/commit/1420a328a61b44ff168ae02051766086ad741abc))
* **lint:** require parseInt radix arguments ([023d526](https://github.com/djm204/frankenbeast/commit/023d526a400bc1cd4f2a71bb134b47d750ad7ac0))
* **orchestrator:** close beast attempt cleanup issue ([#2003](https://github.com/djm204/frankenbeast/issues/2003)) ([ae34c42](https://github.com/djm204/frankenbeast/commit/ae34c42ecba98db09aa5b43c097d8ecf0819170e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.9.0 to 0.10.0

## [0.4.14](https://github.com/djm204/frankenbeast/compare/@franken/planner-v0.4.13...@franken/planner-v0.4.14) (2026-07-11)


### Bug Fixes

* detect parallel plan cycles before execution ([#1436](https://github.com/djm204/frankenbeast/issues/1436)) ([97ab6fe](https://github.com/djm204/frankenbeast/commit/97ab6fe8c77a1fa40eb4f912f300be9860d880a0))
* **planner:** dedupe recursive expansion tasks ([dd54eff](https://github.com/djm204/frankenbeast/commit/dd54eff77ef5dcc57b0a4aa8bd0ef0b61e52577c))
* **planner:** handle domain errors before execution ([57ab4d3](https://github.com/djm204/frankenbeast/commit/57ab4d3d986dc228d24b22c44ec4f2311cf13ee8)), closes [#1041](https://github.com/djm204/frankenbeast/issues/1041)
* **planner:** preserve fix task dependencies ([7ac5832](https://github.com/djm204/frankenbeast/commit/7ac58329162eed89584b1cb21594e43e933b5ec5))
* **planner:** protect graph task immutability ([ec2f517](https://github.com/djm204/frankenbeast/commit/ec2f517dbebfdaa4730660112fe48ede991ab38c))
* **planner:** recover recursive subgraph failures ([#1505](https://github.com/djm204/frankenbeast/issues/1505)) ([89b0751](https://github.com/djm204/frankenbeast/commit/89b0751af763de621467894e1a43fa41b216ad88))
* **planner:** sync task dependsOn during graph mutations ([73bca39](https://github.com/djm204/frankenbeast/commit/73bca39ce9982666938a884f9a2f33be04dfbb88))
* replace nondeterministic calls with deterministic utilities ([#1441](https://github.com/djm204/frankenbeast/issues/1441)) ([1585acf](https://github.com/djm204/frankenbeast/commit/1585acf39bb993b06d2b975045641ad662a44459))


### Miscellaneous

* **package:** normalize workspace metadata ([#1573](https://github.com/djm204/frankenbeast/issues/1573)) ([921c557](https://github.com/djm204/frankenbeast/commit/921c557e9f8392f1202f3fa2cdcc7952ffccd255))


### Tests

* add deterministic Vitest seed mode ([#1429](https://github.com/djm204/frankenbeast/issues/1429)) ([f12b497](https://github.com/djm204/frankenbeast/commit/f12b497a0662a1b519cbf07d442316c734dcc778))
* add workspace coverage task ([#1589](https://github.com/djm204/frankenbeast/issues/1589)) ([1934756](https://github.com/djm204/frankenbeast/commit/1934756851e520c033f2a43c5b440c8268662714)), closes [#948](https://github.com/djm204/frankenbeast/issues/948)
* **planner:** cover fix-it dependency ordering ([#1656](https://github.com/djm204/frankenbeast/issues/1656)) ([4e97a81](https://github.com/djm204/frankenbeast/commit/4e97a810b3f6793a29779468486e8ca9bcbf3fcf)), closes [#1042](https://github.com/djm204/frankenbeast/issues/1042)
* **planner:** isolate integration vitest suites ([#1602](https://github.com/djm204/frankenbeast/issues/1602)) ([a4bdca4](https://github.com/djm204/frankenbeast/commit/a4bdca46cec160e4432cb9597973d76f5f59a6eb))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.2 to 0.9.0

## [0.4.13](https://github.com/djm204/frankenbeast/compare/@franken/planner-v0.4.12...@franken/planner-v0.4.13) (2026-07-10)


### Bug Fixes

* **mcp:** close Codex hook command quoting issue ([#1382](https://github.com/djm204/frankenbeast/issues/1382)) ([293c730](https://github.com/djm204/frankenbeast/commit/293c7301083883b56bb71e1eca19f1ddc4d23236)), closes [#1047](https://github.com/djm204/frankenbeast/issues/1047)
* **planner:** convert strategy domain exceptions ([#1354](https://github.com/djm204/frankenbeast/issues/1354)) ([82d27aa](https://github.com/djm204/frankenbeast/commit/82d27aa7a30553edd45f614114ee4eca9eeb97f4))
* **planner:** fail parallel planner on dangling dependencies ([#1306](https://github.com/djm204/frankenbeast/issues/1306)) ([a5baa8f](https://github.com/djm204/frankenbeast/commit/a5baa8f35e91ccd215cf77d3d06dc4fe9c72d724))
* **planner:** limit parallel wave concurrency ([#1296](https://github.com/djm204/frankenbeast/issues/1296)) ([66ce5c5](https://github.com/djm204/frankenbeast/commit/66ce5c5c2fa113c275b5ebf6c3309041610eecdd))
* **planner:** skip completed recovery tasks ([6b247d5](https://github.com/djm204/frankenbeast/commit/6b247d5249f8d00f24528cc1d1c19d32196e36e6)), closes [#917](https://github.com/djm204/frankenbeast/issues/917)
* **web:** resolve chat session syntax issue ([4ce15f7](https://github.com/djm204/frankenbeast/commit/4ce15f79ead878e53e9fe9ac10bd1d7943972dfd))


### Documentation

* **web:** fix operator token auth header markdown ([#1303](https://github.com/djm204/frankenbeast/issues/1303)) ([1449e26](https://github.com/djm204/frankenbeast/commit/1449e268c54bafb994d5034fec1ccfc312194d9e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.1 to 0.8.2

## [0.4.12](https://github.com/djm204/frankenbeast/compare/@franken/planner-v0.4.11...@franken/planner-v0.4.12) (2026-07-08)


### Tests

* **ci:** exercise minimum supported Node version in CI ([#1057](https://github.com/djm204/frankenbeast/issues/1057)) ([26debe4](https://github.com/djm204/frankenbeast/commit/26debe4feb5221422680988a4a3bb1d112bb8adb))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.0 to 0.8.1

## [0.4.11](https://github.com/djm204/frankenbeast/compare/@franken/planner-v0.4.10...@franken/planner-v0.4.11) (2026-07-08)


### Documentation

* refresh package project outlines ([#1145](https://github.com/djm204/frankenbeast/issues/1145)) ([390aefd](https://github.com/djm204/frankenbeast/commit/390aefdc5bd51da421d7f412d82ec781a8579cb0))

## [0.4.10](https://github.com/djm204/frankenbeast/compare/@franken/planner-v0.4.9...@franken/planner-v0.4.10) (2026-07-07)


### Bug Fixes

* **planner:** detect cycles in parallel planner ([b6102c3](https://github.com/djm204/frankenbeast/commit/b6102c3f6fc1f2c12e35599ac2fc6e83929e8cf0)), closes [#687](https://github.com/djm204/frankenbeast/issues/687)
* **planner:** isolate recovery attempts per task ([#890](https://github.com/djm204/frankenbeast/issues/890)) ([c0f0b4d](https://github.com/djm204/frankenbeast/commit/c0f0b4d9d197d40e5cb4492e824445d3c397542c))
* **planner:** preserve recursive subgraph dependencies ([#893](https://github.com/djm204/frankenbeast/issues/893)) ([999b6a2](https://github.com/djm204/frankenbeast/commit/999b6a2dd0ccd7709dbb5760518cdfbc7c18a9f2))
* **planner:** reject dangling raw DAG edges ([fcb271d](https://github.com/djm204/frankenbeast/commit/fcb271d444ed439baa32533cc6faa44e9d7a6260)), closes [#847](https://github.com/djm204/frankenbeast/issues/847)
* **planner:** support dynamic expansions in planners ([#924](https://github.com/djm204/frankenbeast/issues/924)) ([482ca64](https://github.com/djm204/frankenbeast/commit/482ca64aa9e205a85b921a2ad64f519088b192c1))
* **publish:** add files allowlist to governor/planner/types so dist actually ships ([#844](https://github.com/djm204/frankenbeast/issues/844)) ([46cb1a1](https://github.com/djm204/frankenbeast/commit/46cb1a1f1517da3cf88d589894fdc30b863b8e99))
* **security:** share realpath containment checks ([#875](https://github.com/djm204/frankenbeast/issues/875)) ([eb1ad94](https://github.com/djm204/frankenbeast/commit/eb1ad94736ead647df2f7840c0fad9555f86a73f))


### Refactoring

* **tests:** alias Vitest configs to package sources ([#845](https://github.com/djm204/frankenbeast/issues/845)) ([454b526](https://github.com/djm204/frankenbeast/commit/454b526e509d5762bde3ec5102d7521367f0c1a7))


### Tests

* **planner:** cover missing raw DAG dependencies ([#921](https://github.com/djm204/frankenbeast/issues/921)) ([02ec022](https://github.com/djm204/frankenbeast/commit/02ec0224b85aa010dbee6725b6cf8c8b8b56ed7e)), closes [#916](https://github.com/djm204/frankenbeast/issues/916)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.7 to 0.8.0

## [0.4.9](https://github.com/djm204/frankenbeast/compare/@franken/planner-v0.4.8...@franken/planner-v0.4.9) (2026-07-06)


### Bug Fixes

* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)
* **franken-planner:** error on cyclic sub-graph instead of dropping tasks ([#384](https://github.com/djm204/frankenbeast/issues/384)) ([06f7b19](https://github.com/djm204/frankenbeast/commit/06f7b19125900b832da8ab44fb1ce2470191ac7d)), closes [#54](https://github.com/djm204/frankenbeast/issues/54)
* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* **planner:** escape markdown in plan exports ([#311](https://github.com/djm204/frankenbeast/issues/311)) ([98d63b5](https://github.com/djm204/frankenbeast/commit/98d63b5bb78fc05c224090cc24fe1aecb0145ff7))
* **planner:** guard insertFixItTask against duplicate task IDs ([#379](https://github.com/djm204/frankenbeast/issues/379)) ([5d222cc](https://github.com/djm204/frankenbeast/commit/5d222cc5d68a5ed70edf65c8aa1d3a5e8481944b)), closes [#358](https://github.com/djm204/frankenbeast/issues/358)
* **planner:** keep stub HITL gate test-only ([0b898b1](https://github.com/djm204/frankenbeast/commit/0b898b1a9dff2e761941c3945dac3099984147af)), closes [#412](https://github.com/djm204/frankenbeast/issues/412)
* **planner:** preserve governance rejection in parallel strategy ([#480](https://github.com/djm204/frankenbeast/issues/480)) ([f98a453](https://github.com/djm204/frankenbeast/commit/f98a4535f8fcaa3ad5ed06bc7a4c2a4eb086329b))
* **planner:** reject trivial error patterns ([#314](https://github.com/djm204/frankenbeast/issues/314)) ([1a67f64](https://github.com/djm204/frankenbeast/commit/1a67f648ea115aa18af06cc44593a5826ee09292))
* standardize package namespace strategy ([#825](https://github.com/djm204/frankenbeast/issues/825)) ([a2c236f](https://github.com/djm204/frankenbeast/commit/a2c236f9c7d46ab8fea079b85b3df3e4a7383e9b))


### Refactoring

* **planner:** extract fix-it injection logic ([fb2579c](https://github.com/djm204/frankenbeast/commit/fb2579c4f1980a1fb6572d16b89c8a1424ba5e63)), closes [#642](https://github.com/djm204/frankenbeast/issues/642)


### Miscellaneous

* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* **packages:** align publishable package licenses ([#783](https://github.com/djm204/frankenbeast/issues/783)) ([398d37c](https://github.com/djm204/frankenbeast/commit/398d37c552954a94d08d90fce9ff76573b9ec664))
* release main ([d428ecd](https://github.com/djm204/frankenbeast/commit/d428ecd6e627d5c3c48cd0ef98c45a8eeca56d3e))
* release main ([55f726e](https://github.com/djm204/frankenbeast/commit/55f726e1af6e84f3401fd5ad14f452e7ac727f22))
* release main ([#309](https://github.com/djm204/frankenbeast/issues/309)) ([9dadfae](https://github.com/djm204/frankenbeast/commit/9dadfae67be6686e3a7962c5fd9e21ed8b6b525b))
* release main ([#389](https://github.com/djm204/frankenbeast/issues/389)) ([24e5428](https://github.com/djm204/frankenbeast/commit/24e5428cc009a1ed497e25a94c0a0911b45eb8e0))
* release main ([#448](https://github.com/djm204/frankenbeast/issues/448)) ([8c9934f](https://github.com/djm204/frankenbeast/commit/8c9934f4adbd05b1ebae48081a3b3406746a1bc3))
* release main ([#482](https://github.com/djm204/frankenbeast/issues/482)) ([66f5641](https://github.com/djm204/frankenbeast/commit/66f56417de1252b572fba1f11db008c0a21a34df))
* release main ([#537](https://github.com/djm204/frankenbeast/issues/537)) ([41d70dd](https://github.com/djm204/frankenbeast/commit/41d70dde60bbbc0983702fc2ebfb63ee0528aa53))
* release main ([#554](https://github.com/djm204/frankenbeast/issues/554)) ([660250e](https://github.com/djm204/frankenbeast/commit/660250e5a21616955b05386eea741f17363c9198))
* release main ([#723](https://github.com/djm204/frankenbeast/issues/723)) ([767f8e2](https://github.com/djm204/frankenbeast/commit/767f8e2d347d1c4757db921e8689170f7fa9a9f1))


### Documentation

* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))
* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))


### Tests

* delete 26 fluff test files (~283 tests) identified by audit ([03358d4](https://github.com/djm204/frankenbeast/commit/03358d4cdc745197e48b61855ed77571a37a2939))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.5 to 0.7.6

## [0.4.8](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.4.7...franken-planner-v0.4.8) (2026-07-06)


### Bug Fixes

* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))


### Refactoring

* **planner:** extract fix-it injection logic ([fb2579c](https://github.com/djm204/frankenbeast/commit/fb2579c4f1980a1fb6572d16b89c8a1424ba5e63)), closes [#642](https://github.com/djm204/frankenbeast/issues/642)


### Miscellaneous

* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* **packages:** align publishable package licenses ([#783](https://github.com/djm204/frankenbeast/issues/783)) ([398d37c](https://github.com/djm204/frankenbeast/commit/398d37c552954a94d08d90fce9ff76573b9ec664))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.4 to 0.7.5

## [0.4.7](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.4.6...franken-planner-v0.4.7) (2026-07-05)


### Bug Fixes

* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)

## [0.4.6](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.4.5...franken-planner-v0.4.6) (2026-07-04)


### Bug Fixes

* **planner:** keep stub HITL gate test-only ([0b898b1](https://github.com/djm204/frankenbeast/commit/0b898b1a9dff2e761941c3945dac3099984147af)), closes [#412](https://github.com/djm204/frankenbeast/issues/412)

## [0.4.5](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.4.4...franken-planner-v0.4.5) (2026-07-04)


### Bug Fixes

* **planner:** preserve governance rejection in parallel strategy ([#480](https://github.com/djm204/frankenbeast/issues/480)) ([f98a453](https://github.com/djm204/frankenbeast/commit/f98a4535f8fcaa3ad5ed06bc7a4c2a4eb086329b))

## [0.4.4](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.4.3...franken-planner-v0.4.4) (2026-07-01)


### Documentation

* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))

## [0.4.3](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.4.2...franken-planner-v0.4.3) (2026-06-28)


### Bug Fixes

* **franken-planner:** error on cyclic sub-graph instead of dropping tasks ([#384](https://github.com/djm204/frankenbeast/issues/384)) ([06f7b19](https://github.com/djm204/frankenbeast/commit/06f7b19125900b832da8ab44fb1ce2470191ac7d)), closes [#54](https://github.com/djm204/frankenbeast/issues/54)
* **planner:** guard insertFixItTask against duplicate task IDs ([#379](https://github.com/djm204/frankenbeast/issues/379)) ([5d222cc](https://github.com/djm204/frankenbeast/commit/5d222cc5d68a5ed70edf65c8aa1d3a5e8481944b)), closes [#358](https://github.com/djm204/frankenbeast/issues/358)

## [0.4.2](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.4.1...franken-planner-v0.4.2) (2026-06-09)


### Bug Fixes

* **planner:** escape markdown in plan exports ([#311](https://github.com/djm204/frankenbeast/issues/311)) ([98d63b5](https://github.com/djm204/frankenbeast/commit/98d63b5bb78fc05c224090cc24fe1aecb0145ff7))
* **planner:** reject trivial error patterns ([#314](https://github.com/djm204/frankenbeast/issues/314)) ([1a67f64](https://github.com/djm204/frankenbeast/commit/1a67f648ea115aa18af06cc44593a5826ee09292))

## [0.4.1](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.4.0...franken-planner-v0.4.1) (2026-03-21)


### Miscellaneous

* **main:** release franken-planner 0.4.0 ([7f17b8e](https://github.com/djm204/frankenbeast/commit/7f17b8e22a28a96c642c0239461d08a06e9da2a1))
* **main:** release franken-planner 0.4.0 ([521f2c1](https://github.com/djm204/frankenbeast/commit/521f2c128558af40065111d6ecf5e650089050b3))
* **main:** release frankenfirewall 0.5.0 ([c9939d9](https://github.com/djm204/frankenbeast/commit/c9939d9b8011f8f7cfaa240b2f1c79fb010db1cc))


### Documentation

* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))


### Tests

* delete 26 fluff test files (~283 tests) identified by audit ([03358d4](https://github.com/djm204/frankenbeast/commit/03358d4cdc745197e48b61855ed77571a37a2939))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.3.1...franken-planner-v0.4.0) (2026-03-12)


### Features

* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.3.1...franken-planner-v0.4.0) (2026-03-12)


### Features

* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))

## [0.3.1](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.3.0...franken-planner-v0.3.1) (2026-03-09)


### Bug Fixes

* release-please scoping and commit hygiene ([742c7cc](https://github.com/djm204/frankenbeast/commit/742c7cc7792aac3f6f85ee638ba3b165de34bc5f))

## [0.3.0](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.2.0...franken-planner-v0.3.0) (2026-03-09)


### Features

* eslint configs, gitignore hygiene, CLI guard fix ([#99](https://github.com/djm204/frankenbeast/issues/99)) ([87d7427](https://github.com/djm204/frankenbeast/commit/87d74276a909b272141119ce151647118725ce2e))

## [0.2.0](https://github.com/djm204/frankenbeast/compare/franken-planner-v0.1.0...franken-planner-v0.2.0) (2026-03-09)


### Features

* migrate to real monorepo with npm workspaces + Turborepo ([#96](https://github.com/djm204/frankenbeast/issues/96)) ([f2028b1](https://github.com/djm204/frankenbeast/commit/f2028b139003a6bc09df35d8904a53c0457d67cb))
