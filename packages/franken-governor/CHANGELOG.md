# Changelog

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
