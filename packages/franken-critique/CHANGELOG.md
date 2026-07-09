# Changelog

## [0.6.14](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.13...franken-critique-v0.6.14) (2026-07-08)


### Bug Fixes

* **critique:** anchor reflection severity parsing ([c846c05](https://github.com/djm204/frankenbeast/commit/c846c05bf60d009b89d3bb5813b054c4e9f54ffc))
* **critique:** detect ghost dependencies in re-exports ([3904d36](https://github.com/djm204/frankenbeast/commit/3904d36db6cd2a3204f4e65357e350e77971b97d)), closes [#1165](https://github.com/djm204/frankenbeast/issues/1165)
* **critique:** ignore braces in literals for complexity ([17d15ea](https://github.com/djm204/frankenbeast/commit/17d15eaa7d51fbf265134c5f558dfebcca0b3375))


### Documentation

* **config:** document FRANKEN env overrides ([a818cc8](https://github.com/djm204/frankenbeast/commit/a818cc8cde8ee8d570ef01c0a5efd0f838a7a5a1)), closes [#1263](https://github.com/djm204/frankenbeast/issues/1263)


### Tests

* **ci:** exercise minimum supported Node version in CI ([#1057](https://github.com/djm204/frankenbeast/issues/1057)) ([26debe4](https://github.com/djm204/frankenbeast/commit/26debe4feb5221422680988a4a3bb1d112bb8adb))
* **critique:** make safety timeout test deterministic ([091f602](https://github.com/djm204/frankenbeast/commit/091f60258aa44c8c29b654ed8f3f73bf118db2f4)), closes [#1216](https://github.com/djm204/frankenbeast/issues/1216)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.0 to 0.8.1

## [0.6.13](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.12...franken-critique-v0.6.13) (2026-07-08)


### Bug Fixes

* **critique:** harden logic-loop syntax masking ([#925](https://github.com/djm204/frankenbeast/issues/925)) ([bf2f0dc](https://github.com/djm204/frankenbeast/commit/bf2f0dc28c5115539e627f3bb15a751c84436d29))


### Documentation

* refresh package project outlines ([#1145](https://github.com/djm204/frankenbeast/issues/1145)) ([390aefd](https://github.com/djm204/frankenbeast/commit/390aefdc5bd51da421d7f412d82ec781a8579cb0))

## [0.6.12](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.11...franken-critique-v0.6.12) (2026-07-07)


### Bug Fixes

* **critique:** ignore inert source text in evaluators ([#863](https://github.com/djm204/frankenbeast/issues/863)) ([99dbda1](https://github.com/djm204/frankenbeast/commit/99dbda1b9414200f9b54eb4394c09ea03531427e))
* **orchestrator:** log pr creator fallback errors ([#840](https://github.com/djm204/frankenbeast/issues/840)) ([e49fa8d](https://github.com/djm204/frankenbeast/commit/e49fa8dc89bac80440cf2aee3bd42407b6db2cb7))
* remove unsafe eval test fixtures in critique tests ([#906](https://github.com/djm204/frankenbeast/issues/906)) ([d0f13fc](https://github.com/djm204/frankenbeast/commit/d0f13fc2fed79a55040cd5a569444b6ee65f29e0))
* **security:** share realpath containment checks ([#875](https://github.com/djm204/frankenbeast/issues/875)) ([eb1ad94](https://github.com/djm204/frankenbeast/commit/eb1ad94736ead647df2f7840c0fad9555f86a73f))


### Refactoring

* **tests:** alias Vitest configs to package sources ([#845](https://github.com/djm204/frankenbeast/issues/845)) ([454b526](https://github.com/djm204/frankenbeast/commit/454b526e509d5762bde3ec5102d7521367f0c1a7))


### CI/CD

* add publish-smoke + workspace-dep guards to lock the boundary ([#860](https://github.com/djm204/frankenbeast/issues/860)) ([1e64b6f](https://github.com/djm204/frankenbeast/commit/1e64b6f65852302f416fac864748a47636c4f21a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.7 to 0.8.0

## [0.6.11](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.10...franken-critique-v0.6.11) (2026-07-06)


### Bug Fixes

* standardize package namespace strategy ([#825](https://github.com/djm204/frankenbeast/issues/825)) ([a2c236f](https://github.com/djm204/frankenbeast/commit/a2c236f9c7d46ab8fea079b85b3df3e4a7383e9b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.5 to 0.7.6

## [0.6.10](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.9...franken-critique-v0.6.10) (2026-07-06)


### Bug Fixes

* **critique:** remove literal fixme markers ([#793](https://github.com/djm204/frankenbeast/issues/793)) ([d2f1e2d](https://github.com/djm204/frankenbeast/commit/d2f1e2d88c873a5f6733424b7f5810f41ba334f4))
* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* replace console log statements ([#797](https://github.com/djm204/frankenbeast/issues/797)) ([ef5225f](https://github.com/djm204/frankenbeast/commit/ef5225f7e61196945d481ed40181f86aaea0f40d))
* **repo:** remove literal todo markers ([ee3026b](https://github.com/djm204/frankenbeast/commit/ee3026ba9e8a753d378fd69818b2e4d868398f7f)), closes [#563](https://github.com/djm204/frankenbeast/issues/563)
* **security:** remove Function usage ([#796](https://github.com/djm204/frankenbeast/issues/796)) ([b2f3c7f](https://github.com/djm204/frankenbeast/commit/b2f3c7f5199348c110056c7356d0b599f09b014b))


### Miscellaneous

* **docs:** remove todo marker literals ([c960582](https://github.com/djm204/frankenbeast/commit/c960582583d30a91c883bd4de160127987f2cdf1)), closes [#594](https://github.com/djm204/frankenbeast/issues/594)
* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)


### Tests

* **security:** remove eval fixtures from tests ([f222ef9](https://github.com/djm204/frankenbeast/commit/f222ef91bc6468fea4c33eee83d9b3dba75d9403)), closes [#559](https://github.com/djm204/frankenbeast/issues/559)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.4 to 0.7.5

## [0.6.9](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.8...franken-critique-v0.6.9) (2026-07-05)


### Bug Fixes

* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)

## [0.6.8](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.7...franken-critique-v0.6.8) (2026-07-04)


### Bug Fixes

* **critique:** share max-iteration boundary logic ([#530](https://github.com/djm204/frankenbeast/issues/530)) ([08f9eb7](https://github.com/djm204/frankenbeast/commit/08f9eb72b3d38f13fb811deeea25a7bd7bf8071a))


### Documentation

* fix package README drift (governor, observer, brain, critique) ([#527](https://github.com/djm204/frankenbeast/issues/527)) ([4afdd51](https://github.com/djm204/frankenbeast/commit/4afdd51f0852cfb934c6db1307e61afc98ee51c4))

## [0.6.7](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.6...franken-critique-v0.6.7) (2026-07-04)


### Bug Fixes

* **critique:** align warning evaluator verdicts ([#492](https://github.com/djm204/frankenbeast/issues/492)) ([2a0d7a0](https://github.com/djm204/frankenbeast/commit/2a0d7a001f285c6703c422edc3d959a94b95ba18))

## [0.6.6](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.5...franken-critique-v0.6.6) (2026-07-01)


### Documentation

* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))

## [0.6.5](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.4...franken-critique-v0.6.5) (2026-06-28)


### Bug Fixes

* **critique:** token-aware loop detection (closes [#69](https://github.com/djm204/frankenbeast/issues/69)) ([#385](https://github.com/djm204/frankenbeast/issues/385)) ([6d5701f](https://github.com/djm204/frankenbeast/commit/6d5701fa702ebb4cbcd4a8b437e3e2907312fdaa))

## [0.6.4](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.3...franken-critique-v0.6.4) (2026-06-28)


### Bug Fixes

* **critique:** make TokenBudgetBreaker actually enforce the budget ([#343](https://github.com/djm204/frankenbeast/issues/343)) ([b878f5f](https://github.com/djm204/frankenbeast/commit/b878f5f82700e3917e16da6c447cfa094b392595))

## [0.6.3](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.2...franken-critique-v0.6.3) (2026-06-13)


### Bug Fixes

* **orchestrator:** resolve review action item hardening ([#336](https://github.com/djm204/frankenbeast/issues/336)) ([763178a](https://github.com/djm204/frankenbeast/commit/763178a1d1ce311cb6181184ef9f3ebbf60bb8e3))

## [0.6.2](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.1...franken-critique-v0.6.2) (2026-06-09)


### Bug Fixes

* **security:** harden safety rule regex evaluation ([#316](https://github.com/djm204/frankenbeast/issues/316)) ([e66d05d](https://github.com/djm204/frankenbeast/commit/e66d05ded19d281e57ed19881d3151d89158db0f))

## [0.6.1](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.6.0...franken-critique-v0.6.1) (2026-05-26)


### Bug Fixes

* **security:** harden reflection prompt context ([#304](https://github.com/djm204/frankenbeast/issues/304)) ([53beea2](https://github.com/djm204/frankenbeast/commit/53beea233254f76c9c2b92b82eef8641a3cfaeaa))
* **security:** reject unsafe safety regex rules ([#302](https://github.com/djm204/frankenbeast/issues/302)) ([c639420](https://github.com/djm204/frankenbeast/commit/c639420a3a250d756e634e6e5db21d8a4f2d3fac))

## [0.6.0](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.5.0...franken-critique-v0.6.0) (2026-03-26)


### Features

* **critique:** add ReflectionEvaluator (Phase 6.1) ([bdc4764](https://github.com/djm204/frankenbeast/commit/bdc4764992acb27fc1451ecb280d404bd1f78f8b))
* Phase 6 — Absorb Reflection into Critique ([82ac47d](https://github.com/djm204/frankenbeast/commit/82ac47d6a67763a622f2d24058e6c30dbe989c46))

## [0.5.0](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.4.0...franken-critique-v0.5.0) (2026-03-21)


### Features

* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.3.1...franken-critique-v0.4.0) (2026-03-10)


### Features

* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.3.1...franken-critique-v0.4.0) (2026-03-10)


### Features

* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))

## [0.3.1](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.3.0...franken-critique-v0.3.1) (2026-03-09)


### Bug Fixes

* release-please scoping and commit hygiene ([742c7cc](https://github.com/djm204/frankenbeast/commit/742c7cc7792aac3f6f85ee638ba3b165de34bc5f))

## [0.3.0](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.2.0...franken-critique-v0.3.0) (2026-03-09)


### Features

* eslint configs, gitignore hygiene, CLI guard fix ([#99](https://github.com/djm204/frankenbeast/issues/99)) ([87d7427](https://github.com/djm204/frankenbeast/commit/87d74276a909b272141119ce151647118725ce2e))

## [0.2.0](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.1.0...franken-critique-v0.2.0) (2026-03-09)


### Features

* migrate to real monorepo with npm workspaces + Turborepo ([#96](https://github.com/djm204/frankenbeast/issues/96)) ([f2028b1](https://github.com/djm204/frankenbeast/commit/f2028b139003a6bc09df35d8904a53c0457d67cb))
