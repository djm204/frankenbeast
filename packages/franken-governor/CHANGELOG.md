# Changelog

## [0.6.0](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.14...franken-governor-v0.6.0) (2026-07-14)


### Features

* **governor:** add signed approval policy manifests ([#2173](https://github.com/djm204/frankenbeast/issues/2173)) ([353bd4b](https://github.com/djm204/frankenbeast/commit/353bd4b5efa23379f9f7bca2643126c116598b01))


### Bug Fixes

* **governor:** add approval prompt anti-spoofing markers ([#2013](https://github.com/djm204/frankenbeast/issues/2013)) ([f13c71c](https://github.com/djm204/frankenbeast/commit/f13c71ca688e918e585d1334535cf34bf9decd21))
* **governor:** honor scoped operator session tokens ([#2112](https://github.com/djm204/frankenbeast/issues/2112)) ([1420a32](https://github.com/djm204/frankenbeast/commit/1420a328a61b44ff168ae02051766086ad741abc))
* **governor:** reject duplicate approval waiters ([8940ade](https://github.com/djm204/frankenbeast/commit/8940ade873e198b90b9d69c7dcd1c7c7055becf0)), closes [#1956](https://github.com/djm204/frankenbeast/issues/1956)
* **governor:** resolve root test suite merge drift ([29270d5](https://github.com/djm204/frankenbeast/commit/29270d533f252535ff122b422d60095a949e6aab))
* **governor:** sweep expired session tokens ([#2005](https://github.com/djm204/frankenbeast/issues/2005)) ([5e23567](https://github.com/djm204/frankenbeast/commit/5e23567dbab5ad265a2362e4b928817f6c959791))
* **orchestrator:** close beast attempt cleanup issue ([#2003](https://github.com/djm204/frankenbeast/issues/2003)) ([ae34c42](https://github.com/djm204/frankenbeast/commit/ae34c42ecba98db09aa5b43c097d8ecf0819170e))


### Documentation

* **governor:** refresh ramp-up wiring status ([15e413c](https://github.com/djm204/frankenbeast/commit/15e413c83f688eaacec66f3cd4ee5a8aec20e75b))


### Tests

* add root integration and eval entrypoints ([fae9bad](https://github.com/djm204/frankenbeast/commit/fae9bad925976c208b5199046ccf794378c72070))
* **governor:** accept conditional vitest suite selection ([b36994d](https://github.com/djm204/frankenbeast/commit/b36994d9cd19455661f6bdefda51e81ff8c99f07))
* **governor:** isolate integration suite ([#1891](https://github.com/djm204/frankenbeast/issues/1891)) ([93f6be9](https://github.com/djm204/frankenbeast/commit/93f6be9dfa97ae4a9c464c4a679c166088f27a12))
* **governor:** verify integration test selection ([#1968](https://github.com/djm204/frankenbeast/issues/1968)) ([c88865e](https://github.com/djm204/frankenbeast/commit/c88865e2ebd26d568c190d0de9ef900de302543f))
* include integration and eval suites in turbo ([585744c](https://github.com/djm204/frankenbeast/commit/585744c04d0c354f15e3cc0a0db242438cd17e8c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.9.0 to 0.10.0

## [0.5.14](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.13...franken-governor-v0.5.14) (2026-07-11)


### Bug Fixes

* **governor:** handle trigger evaluator exceptions ([#1530](https://github.com/djm204/frankenbeast/issues/1530)) ([ec95839](https://github.com/djm204/frankenbeast/commit/ec95839d6a9ad18e39ab70437bf9a6847f1a8cec)), closes [#1184](https://github.com/djm204/frankenbeast/issues/1184)
* **governor:** prune expired session tokens on write ([7d20cdb](https://github.com/djm204/frankenbeast/commit/7d20cdb93ceea33b9f528d43956ac08ffc9c8622)), closes [#1109](https://github.com/djm204/frankenbeast/issues/1109)
* **governor:** reject invalid session token TTLs ([2c28524](https://github.com/djm204/frankenbeast/commit/2c285243010b99b32f4c018693e02712c50730b8)), closes [#1171](https://github.com/djm204/frankenbeast/issues/1171)
* **governor:** verify Slack webhooks from raw bytes ([ce02e1a](https://github.com/djm204/frankenbeast/commit/ce02e1a43322b2f5ab6e7ee8efe46637c3462975))
* replace nondeterministic calls with deterministic utilities ([#1441](https://github.com/djm204/frankenbeast/issues/1441)) ([1585acf](https://github.com/djm204/frankenbeast/commit/1585acf39bb993b06d2b975045641ad662a44459))


### Miscellaneous

* **ci:** make workspace lint coverage explicit ([#1596](https://github.com/djm204/frankenbeast/issues/1596)) ([c1674ed](https://github.com/djm204/frankenbeast/commit/c1674ed69e460a9c7c14d8b7af2e4039edf174d8))


### Documentation

* **ramp-up:** refresh package safety status ([ee13582](https://github.com/djm204/frankenbeast/commit/ee135822f14bbc89212e2c5cca246cb0ef71206b)), closes [#949](https://github.com/djm204/frankenbeast/issues/949)


### Tests

* add deterministic Vitest seed mode ([#1429](https://github.com/djm204/frankenbeast/issues/1429)) ([f12b497](https://github.com/djm204/frankenbeast/commit/f12b497a0662a1b519cbf07d442316c734dcc778))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.2 to 0.9.0

## [0.5.13](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.12...franken-governor-v0.5.13) (2026-07-10)


### Bug Fixes

* **governor:** audit failed signature verification ([ead0094](https://github.com/djm204/frankenbeast/commit/ead009461aaa4c28a1a220f60220d3dbf8255b20)), closes [#1108](https://github.com/djm204/frankenbeast/issues/1108)
* **governor:** persist approval session tokens ([#1302](https://github.com/djm204/frankenbeast/issues/1302)) ([16be6a9](https://github.com/djm204/frankenbeast/commit/16be6a917c1b6bb335ef0c242a08c870c09fb003))
* **governor:** refresh approval signature verifier ([4d331ac](https://github.com/djm204/frankenbeast/commit/4d331ac3436325982273a9f1a6c4fdb1f5e58fe9)), closes [#933](https://github.com/djm204/frankenbeast/issues/933)
* **governor:** sign approval responder metadata ([#1351](https://github.com/djm204/frankenbeast/issues/1351)) ([69c26b0](https://github.com/djm204/frankenbeast/commit/69c26b0304d990867102e9ce7d880746cc942318))
* **mcp:** close Codex hook command quoting issue ([#1382](https://github.com/djm204/frankenbeast/issues/1382)) ([293c730](https://github.com/djm204/frankenbeast/commit/293c7301083883b56bb71e1eca19f1ddc4d23236)), closes [#1047](https://github.com/djm204/frankenbeast/issues/1047)
* **web:** resolve chat session syntax issue ([4ce15f7](https://github.com/djm204/frankenbeast/commit/4ce15f79ead878e53e9fe9ac10bd1d7943972dfd))
* **web:** secure chat websocket authentication ([679b15d](https://github.com/djm204/frankenbeast/commit/679b15dfbd8cc592ed04b67339230494a5586a8c)), closes [#703](https://github.com/djm204/frankenbeast/issues/703)


### Documentation

* fix broken internal markdown links ([#1374](https://github.com/djm204/frankenbeast/issues/1374)) ([51068df](https://github.com/djm204/frankenbeast/commit/51068df99e04355d51ae54bae07d0d83001c9681))
* **web:** fix operator token auth header markdown ([#1303](https://github.com/djm204/frankenbeast/issues/1303)) ([1449e26](https://github.com/djm204/frankenbeast/commit/1449e268c54bafb994d5034fec1ccfc312194d9e))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.1 to 0.8.2

## [0.5.12](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.11...franken-governor-v0.5.12) (2026-07-08)


### Tests

* **ci:** exercise minimum supported Node version in CI ([#1057](https://github.com/djm204/frankenbeast/issues/1057)) ([26debe4](https://github.com/djm204/frankenbeast/commit/26debe4feb5221422680988a4a3bb1d112bb8adb))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.0 to 0.8.1

## [0.5.11](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.10...franken-governor-v0.5.11) (2026-07-08)


### Documentation

* refresh package project outlines ([#1145](https://github.com/djm204/frankenbeast/issues/1145)) ([390aefd](https://github.com/djm204/frankenbeast/commit/390aefdc5bd51da421d7f412d82ec781a8579cb0))

## [0.5.10](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.9...franken-governor-v0.5.10) (2026-07-07)


### Bug Fixes

* **governor:** authenticate approval requests ([ef60ce3](https://github.com/djm204/frankenbeast/commit/ef60ce39db4a705c6e30f1142101ccd2e9a15585)), closes [#769](https://github.com/djm204/frankenbeast/issues/769)
* **governor:** guard signature buffer lengths ([39ef380](https://github.com/djm204/frankenbeast/commit/39ef380babb3d381674f547ee6b8b0b04910fdf5))
* **publish:** add files allowlist to governor/planner/types so dist actually ships ([#844](https://github.com/djm204/frankenbeast/issues/844)) ([46cb1a1](https://github.com/djm204/frankenbeast/commit/46cb1a1f1517da3cf88d589894fdc30b863b8e99))
* **security:** share realpath containment checks ([#875](https://github.com/djm204/frankenbeast/issues/875)) ([eb1ad94](https://github.com/djm204/frankenbeast/commit/eb1ad94736ead647df2f7840c0fad9555f86a73f))


### Refactoring

* **tests:** alias Vitest configs to package sources ([#845](https://github.com/djm204/frankenbeast/issues/845)) ([454b526](https://github.com/djm204/frankenbeast/commit/454b526e509d5762bde3ec5102d7521367f0c1a7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.7 to 0.8.0

## [0.5.9](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.8...franken-governor-v0.5.9) (2026-07-06)


### Bug Fixes

* standardize package namespace strategy ([#825](https://github.com/djm204/frankenbeast/issues/825)) ([a2c236f](https://github.com/djm204/frankenbeast/commit/a2c236f9c7d46ab8fea079b85b3df3e4a7383e9b))


### Tests

* **governor:** cover factory and sandbox user policy ([#817](https://github.com/djm204/frankenbeast/issues/817)) ([48325c4](https://github.com/djm204/frankenbeast/commit/48325c4d1d86706295ef4a365b3d16b80e4a4817)), closes [#645](https://github.com/djm204/frankenbeast/issues/645)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.5 to 0.7.6

## [0.5.8](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.7...franken-governor-v0.5.8) (2026-07-06)


### Bug Fixes

* **governor:** preserve error causes ([754b29a](https://github.com/djm204/frankenbeast/commit/754b29aac2810b0fc869c633a225135045349e31)), closes [#643](https://github.com/djm204/frankenbeast/issues/643)
* **governor:** use deterministic signature payloads ([20c8313](https://github.com/djm204/frankenbeast/commit/20c8313619a2442427bb1ab4327f8ac37cbd6915)), closes [#689](https://github.com/djm204/frankenbeast/issues/689)
* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* replace console log statements ([#797](https://github.com/djm204/frankenbeast/issues/797)) ([ef5225f](https://github.com/djm204/frankenbeast/commit/ef5225f7e61196945d481ed40181f86aaea0f40d))


### Miscellaneous

* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* **packages:** align publishable package licenses ([#783](https://github.com/djm204/frankenbeast/issues/783)) ([398d37c](https://github.com/djm204/frankenbeast/commit/398d37c552954a94d08d90fce9ff76573b9ec664))


### Tests

* replace secret-looking fixture literals ([#787](https://github.com/djm204/frankenbeast/issues/787)) ([e9b5d8a](https://github.com/djm204/frankenbeast/commit/e9b5d8af10d7144290ce0e513658c3b41b8f9597))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.4 to 0.7.5

## [0.5.7](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.6...franken-governor-v0.5.7) (2026-07-05)


### Bug Fixes

* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)
* **governor:** construct real trigger contexts and make denied decisions reachable ([#581](https://github.com/djm204/frankenbeast/issues/581)) ([0b638eb](https://github.com/djm204/frankenbeast/commit/0b638ebe42776b13360c45b4d07f4fd9088d2747)), closes [#490](https://github.com/djm204/frankenbeast/issues/490) [#491](https://github.com/djm204/frankenbeast/issues/491)

## [0.5.6](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.5...franken-governor-v0.5.6) (2026-07-04)


### Documentation

* fix package README drift (governor, observer, brain, critique) ([#527](https://github.com/djm204/frankenbeast/issues/527)) ([4afdd51](https://github.com/djm204/frankenbeast/commit/4afdd51f0852cfb934c6db1307e61afc98ee51c4))

## [0.5.5](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.4...franken-governor-v0.5.5) (2026-07-03)


### Bug Fixes

* **governor:** wire standalone approval HTTP responses to pending waiters ([#452](https://github.com/djm204/frankenbeast/issues/452)) ([786b1a1](https://github.com/djm204/frankenbeast/commit/786b1a17b11ea60718c507fbec28b1e35178d775))

## [0.5.4](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.3...franken-governor-v0.5.4) (2026-07-01)


### Bug Fixes

* **governor:** bind approval response to active request ID ([#392](https://github.com/djm204/frankenbeast/issues/392)) ([05a493c](https://github.com/djm204/frankenbeast/commit/05a493cd133854914d431369c187c8a0e4b8f521))
* **governor:** fail closed for signed approvals ([#433](https://github.com/djm204/frankenbeast/issues/433)) ([0ae1b31](https://github.com/djm204/frankenbeast/commit/0ae1b316871cab39796c648d55f1f4613f925cd2))
* **governor:** verify approval signatures over raw body ([#441](https://github.com/djm204/frankenbeast/issues/441)) ([632a904](https://github.com/djm204/frankenbeast/commit/632a9046ff8b206ddb127789d54285db92296594))


### Documentation

* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))

## [0.5.3](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.2...franken-governor-v0.5.3) (2026-06-28)


### Bug Fixes

* **governor:** authenticate Slack callbacks and resolve pending approvals ([#387](https://github.com/djm204/frankenbeast/issues/387)) ([f717767](https://github.com/djm204/frankenbeast/commit/f71776791c86ea293bcecb8aa744abc6c884042e))
* **governor:** validate approval decision against allowed response codes ([#380](https://github.com/djm204/frankenbeast/issues/380)) ([722f963](https://github.com/djm204/frankenbeast/commit/722f963c18ba37f3402e99dc1d92c47b390b253e)), closes [#350](https://github.com/djm204/frankenbeast/issues/350)

## [0.5.2](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.1...franken-governor-v0.5.2) (2026-06-09)


### Documentation

* refresh issue 86 status docs ([#319](https://github.com/djm204/frankenbeast/issues/319)) ([a21612f](https://github.com/djm204/frankenbeast/commit/a21612f5e0ce8cb73bd536746ac143b34e2df2f6))

## [0.5.1](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.5.0...franken-governor-v0.5.1) (2026-05-21)


### Bug Fixes

* **security:** Chunk 1 — fail-closed HTTP & approval boundaries ([#296](https://github.com/djm204/frankenbeast/issues/296)) ([f281e8e](https://github.com/djm204/frankenbeast/commit/f281e8eb98c6208a7da2f06e2923c57bd9890090))

## [0.5.0](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.4.0...franken-governor-v0.5.0) (2026-03-21)


### Features

* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.3.1...franken-governor-v0.4.0) (2026-03-10)


### Features

* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.3.1...franken-governor-v0.4.0) (2026-03-10)


### Features

* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.3.1...franken-governor-v0.4.0) (2026-03-10)


### Features

* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))

## [0.3.1](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.3.0...franken-governor-v0.3.1) (2026-03-09)


### Bug Fixes

* release-please scoping and commit hygiene ([742c7cc](https://github.com/djm204/frankenbeast/commit/742c7cc7792aac3f6f85ee638ba3b165de34bc5f))

## [0.3.0](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.2.0...franken-governor-v0.3.0) (2026-03-09)


### Features

* eslint configs, gitignore hygiene, CLI guard fix ([#99](https://github.com/djm204/frankenbeast/issues/99)) ([87d7427](https://github.com/djm204/frankenbeast/commit/87d74276a909b272141119ce151647118725ce2e))

## [0.2.0](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.1.0...franken-governor-v0.2.0) (2026-03-09)


### Features

* migrate to real monorepo with npm workspaces + Turborepo ([#96](https://github.com/djm204/frankenbeast/issues/96)) ([f2028b1](https://github.com/djm204/frankenbeast/commit/f2028b139003a6bc09df35d8904a53c0457d67cb))
