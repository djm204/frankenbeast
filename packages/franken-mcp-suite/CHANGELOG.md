# Changelog

## [0.2.3](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.2...franken-mcp-suite-v0.2.3) (2026-07-08)


### Bug Fixes

* **mcp-suite:** remove Windows shell passthrough ([#1063](https://github.com/djm204/frankenbeast/issues/1063)) ([53f4f3b](https://github.com/djm204/frankenbeast/commit/53f4f3bbf739c9416853d894356e27bcf8de4595))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/brain bumped from 0.7.1 to 0.7.2
    * @franken/critique bumped from 0.6.12 to 0.6.13
    * @franken/governor bumped from 0.5.10 to 0.5.11
    * @franken/observer bumped from 0.7.12 to 0.7.13
    * @franken/orchestrator bumped from 0.41.0 to 0.41.1
    * @franken/planner bumped from 0.4.10 to 0.4.11

## [0.2.2](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.1...franken-mcp-suite-v0.2.2) (2026-07-07)


### Bug Fixes

* **cli:** make fbeast --help and -h exit cleanly ([a877043](https://github.com/djm204/frankenbeast/commit/a87704304cfe96f9fb1cdc5c9276038e0295ad37)), closes [#418](https://github.com/djm204/frankenbeast/issues/418)
* **governor:** tighten dangerous pattern matching ([#879](https://github.com/djm204/frankenbeast/issues/879)) ([7cf183d](https://github.com/djm204/frankenbeast/commit/7cf183d5ca672a94e0875a843bdf0c433891e697))
* **mcp-suite:** tolerate commented settings writes ([#881](https://github.com/djm204/frankenbeast/issues/881)) ([4a9ab8c](https://github.com/djm204/frankenbeast/commit/4a9ab8c949bb5d20a975d0135c16ea244aa2b132))
* **mcp-suite:** use node for hook script json parsing ([#901](https://github.com/djm204/frankenbeast/issues/901)) ([8664ed4](https://github.com/djm204/frankenbeast/commit/8664ed4621e754fe65ecba55421cda49a7fe839d))
* **mcp:** stream hook audit payloads via stdin ([1814b48](https://github.com/djm204/frankenbeast/commit/1814b48efc9c77fed4f4add60d9f426beb5c21a7))
* **mcp:** validate beast provider values ([813561e](https://github.com/djm204/frankenbeast/commit/813561ed1e888848ca0e075b7f99c46f0471cd38)), closes [#420](https://github.com/djm204/frankenbeast/issues/420)
* **security:** share realpath containment checks ([#875](https://github.com/djm204/frankenbeast/issues/875)) ([eb1ad94](https://github.com/djm204/frankenbeast/commit/eb1ad94736ead647df2f7840c0fad9555f86a73f))


### Refactoring

* **tests:** alias Vitest configs to package sources ([#845](https://github.com/djm204/frankenbeast/issues/845)) ([454b526](https://github.com/djm204/frankenbeast/commit/454b526e509d5762bde3ec5102d7521367f0c1a7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.7 to 0.8.0
    * @franken/brain bumped from 0.7.0 to 0.7.1
    * @franken/critique bumped from 0.6.11 to 0.6.12
    * @franken/governor bumped from 0.5.9 to 0.5.10
    * @franken/observer bumped from 0.7.11 to 0.7.12
    * @franken/orchestrator bumped from 0.40.0 to 0.41.0
    * @franken/planner bumped from 0.4.9 to 0.4.10

## [0.2.1](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.0...franken-mcp-suite-v0.2.1) (2026-07-06)


### Bug Fixes

* standardize package namespace strategy ([#825](https://github.com/djm204/frankenbeast/issues/825)) ([a2c236f](https://github.com/djm204/frankenbeast/commit/a2c236f9c7d46ab8fea079b85b3df3e4a7383e9b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.5 to 0.7.6
    * @franken/brain bumped from 0.6.6 to 0.7.0
    * @franken/critique bumped from 0.6.10 to 0.6.11
    * @franken/governor bumped from 0.5.8 to 0.5.9
    * @franken/observer bumped from 0.7.10 to 0.7.11
    * @franken/orchestrator bumped from 0.39.1 to 0.40.0
    * @franken/planner bumped from 0.4.8 to 0.4.9

## [0.2.0](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.1.0...franken-mcp-suite-v0.2.0) (2026-07-06)


### Features

* add fbeast MCP suite — modular MCP servers for Claude Code ([#278](https://github.com/djm204/frankenbeast/issues/278)) ([116266b](https://github.com/djm204/frankenbeast/commit/116266b7a60f0d80d7e58661ba1325716ec6c18e))
* close launch parity gaps ([#284](https://github.com/djm204/frankenbeast/issues/284)) ([7309143](https://github.com/djm204/frankenbeast/commit/7309143648bba36b0788c0b44446455c9a61821a))
* complete dual-mode launch chunks 6-8 and fix adapter wrapping ([#282](https://github.com/djm204/frankenbeast/issues/282)) ([b86792d](https://github.com/djm204/frankenbeast/commit/b86792dac542751035d676230e7481238329a974))
* complete MCP launch chunks 1-5 and canonicalize .fbeast storage ([#279](https://github.com/djm204/frankenbeast/issues/279)) ([22c8ac3](https://github.com/djm204/frankenbeast/commit/22c8ac3ffea24c5a252ab466277ec63261d1ed2d))
* **mcp-suite:** make fbeast a 1:1 proxy for frankenbeast ([#289](https://github.com/djm204/frankenbeast/issues/289)) ([84470d6](https://github.com/djm204/frankenbeast/commit/84470d68b60fa23b9f9e70f4881666cec37d1a72))
* **web:** add observer analytics dashboard ([#286](https://github.com/djm204/frankenbeast/issues/286)) ([a375ec3](https://github.com/djm204/frankenbeast/commit/a375ec3c484f03bb67260050931609332d62bdd8))


### Bug Fixes

* **config:** harden insecure defaults ([5abc7f9](https://github.com/djm204/frankenbeast/commit/5abc7f9c51477706ab6246116d44116645b363af)), closes [#522](https://github.com/djm204/frankenbeast/issues/522)
* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)
* **governor:** construct real trigger contexts and make denied decisions reachable ([#581](https://github.com/djm204/frankenbeast/issues/581)) ([0b638eb](https://github.com/djm204/frankenbeast/commit/0b638ebe42776b13360c45b4d07f4fd9088d2747)), closes [#490](https://github.com/djm204/frankenbeast/issues/490) [#491](https://github.com/djm204/frankenbeast/issues/491)
* **mcp-memory:** align frontload scope contract ([#523](https://github.com/djm204/frankenbeast/issues/523)) ([bf85b30](https://github.com/djm204/frankenbeast/commit/bf85b30a79d77aa742881eca5b8047fe50ca3bfd))
* **mcp-suite:** audit MCP tool execution ([#445](https://github.com/djm204/frankenbeast/issues/445)) ([23a1e08](https://github.com/djm204/frankenbeast/commit/23a1e086e0d0f697fe2120ca7df204f51206e50e))
* **mcp-suite:** bind proxy firewall to project root ([#444](https://github.com/djm204/frankenbeast/issues/444)) ([c2592c0](https://github.com/djm204/frankenbeast/commit/c2592c000f4ec19ee37774efaa5c42846e87eb01))
* **mcp-suite:** drop never-used skill_state table from shared schema ([#546](https://github.com/djm204/frankenbeast/issues/546)) ([959ee17](https://github.com/djm204/frankenbeast/commit/959ee170356252336bf94a23243097df4f01f353)), closes [#493](https://github.com/djm204/frankenbeast/issues/493)
* **mcp-suite:** enforce governance centrally in MCP dispatch ([#391](https://github.com/djm204/frankenbeast/issues/391)) ([2bcaa6e](https://github.com/djm204/frankenbeast/commit/2bcaa6ede4dc16044cbacd7d32a14bbfdda2c1d6))
* **mcp-suite:** guide standalone beast handoff installs ([62b30ea](https://github.com/djm204/frankenbeast/commit/62b30ea3c301b9a245af57ee57402087c04ddddd))
* **mcp-suite:** mitigate hook hangs and uninstall residue ([#287](https://github.com/djm204/frankenbeast/issues/287)) ([b939d36](https://github.com/djm204/frankenbeast/commit/b939d36b68c8c3336af4df491819b32ec962d168))
* **mcp-suite:** namespace Codex MCP server names ([#443](https://github.com/djm204/frankenbeast/issues/443)) ([6e96c49](https://github.com/djm204/frankenbeast/commit/6e96c49b4a3b4dc5047a39b7c0a6d3b6ba231488))
* **mcp-suite:** pass tool payload to governor; fail closed on timeout/empty tool ([#397](https://github.com/djm204/frankenbeast/issues/397)) ([d5736ed](https://github.com/djm204/frankenbeast/commit/d5736edf116d070fae9c38042c961cf15006a350))
* **mcp:** expose proxy tool schemas ([#446](https://github.com/djm204/frankenbeast/issues/446)) ([b916056](https://github.com/djm204/frankenbeast/commit/b916056dae9055a5c1a8e835d31ee4e45cb2c13b))
* **mcp:** label planner scaffold provenance ([#485](https://github.com/djm204/frankenbeast/issues/485)) ([aa4cf8e](https://github.com/djm204/frankenbeast/commit/aa4cf8ed7eb9d14d746f296fc52dbe1a454a5f75))
* **mcp:** render init validation errors cleanly ([#535](https://github.com/djm204/frankenbeast/issues/535)) ([ba6dd5c](https://github.com/djm204/frankenbeast/commit/ba6dd5c93e7b0fd345d2b81dca05d61922d79912))
* **mcp:** validate tool schemas centrally ([#435](https://github.com/djm204/frankenbeast/issues/435)) ([b5a0afe](https://github.com/djm204/frankenbeast/commit/b5a0afe817356857345c2c95962756d8bb25164b))
* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* **release:** publish npm packages from releases ([#764](https://github.com/djm204/frankenbeast/issues/764)) ([e25ca62](https://github.com/djm204/frankenbeast/commit/e25ca62602289193297976ce92548c92930b67cf)), closes [#741](https://github.com/djm204/frankenbeast/issues/741)
* replace console log statements ([#797](https://github.com/djm204/frankenbeast/issues/797)) ([ef5225f](https://github.com/djm204/frankenbeast/commit/ef5225f7e61196945d481ed40181f86aaea0f40d))
* **security:** Chunk 2 — MCP schema enforcement & firewall path containment ([#297](https://github.com/djm204/frankenbeast/issues/297)) ([d8ac1e4](https://github.com/djm204/frankenbeast/commit/d8ac1e47c10b3e979bc6298f6d68bcf870e72bdb))
* **web:** remove operator token from frontend bundle ([fc1b8f5](https://github.com/djm204/frankenbeast/commit/fc1b8f5f7874488440b5755d4f71e8d6dd0774f1)), closes [#566](https://github.com/djm204/frankenbeast/issues/566)


### Miscellaneous

* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* **packages:** align publishable package licenses ([#783](https://github.com/djm204/frankenbeast/issues/783)) ([398d37c](https://github.com/djm204/frankenbeast/commit/398d37c552954a94d08d90fce9ff76573b9ec664))


### Documentation

* **mcp-suite:** align walkthrough with current behavior ([47f217f](https://github.com/djm204/frankenbeast/commit/47f217f822431d22bdfb09958cb9f9250052d611)), closes [#515](https://github.com/djm204/frankenbeast/issues/515)
* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))


### Tests

* replace secret-looking fixture literals ([#787](https://github.com/djm204/frankenbeast/issues/787)) ([e9b5d8a](https://github.com/djm204/frankenbeast/commit/e9b5d8af10d7144290ce0e513658c3b41b8f9597))
* **security:** avoid password literals in fixtures ([#788](https://github.com/djm204/frankenbeast/issues/788)) ([f411648](https://github.com/djm204/frankenbeast/commit/f41164879b1b35152d7bdc02b5e83dd586dd2344))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.4 to 0.7.5
    * @franken/brain bumped from 0.6.5 to 0.6.6
    * @franken/critique bumped from 0.6.9 to 0.6.10
    * @franken/governor bumped from 0.5.7 to 0.5.8
    * @franken/observer bumped from 0.7.9 to 0.7.10
    * @franken/orchestrator bumped from 0.39.0 to 0.39.1
    * @franken/planner bumped from 0.4.7 to 0.4.8
