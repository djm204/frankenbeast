# Changelog

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
