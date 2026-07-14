# Changelog

## [0.2.10](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.9...franken-mcp-suite-v0.2.10) (2026-07-14)


### Tests

* **mcp-suite:** keep test files in lint coverage ([#2047](https://github.com/djm204/frankenbeast/issues/2047)) ([79e5fcc](https://github.com/djm204/frankenbeast/commit/79e5fccc2f75b34a9af476125090edafbe3f10fa))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/orchestrator bumped from 0.43.1 to 0.44.0

## [0.2.9](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.8...franken-mcp-suite-v0.2.9) (2026-07-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/orchestrator bumped from 0.43.0 to 0.43.1

## [0.2.8](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.7...franken-mcp-suite-v0.2.8) (2026-07-14)


### Bug Fixes

* **governor:** resolve root test suite merge drift ([29270d5](https://github.com/djm204/frankenbeast/commit/29270d533f252535ff122b422d60095a949e6aab))
* **mcp-suite:** avoid forced exits in server startup ([#2192](https://github.com/djm204/frankenbeast/issues/2192)) ([f01f725](https://github.com/djm204/frankenbeast/commit/f01f7253181cba6d7c8df28187ef22298af4ac69))
* **mcp-suite:** deny unsafe tool argument shapes ([#2038](https://github.com/djm204/frankenbeast/issues/2038)) ([b1e8406](https://github.com/djm204/frankenbeast/commit/b1e8406aa7ecd9a7b95e9ac10ca77996c22f193b))
* **mcp-suite:** harden generated hook shell assignments ([baa1f49](https://github.com/djm204/frankenbeast/commit/baa1f49aac5218a72e08f83324f1cdaddaa33e9f)), closes [#1795](https://github.com/djm204/frankenbeast/issues/1795)
* **mcp-suite:** protect unknown proxy workspace roots ([ca4f6a6](https://github.com/djm204/frankenbeast/commit/ca4f6a6817f900c0d38e5ac3ed4af1af9df405e7)), closes [#1786](https://github.com/djm204/frankenbeast/issues/1786)
* **mcp-suite:** share observer cost validation ([#2189](https://github.com/djm204/frankenbeast/issues/2189)) ([b1cd501](https://github.com/djm204/frankenbeast/commit/b1cd5015ef764e86a2e645995998f475a6d49291))
* **mcp-suite:** validate brain memory query limits ([#2029](https://github.com/djm204/frankenbeast/issues/2029)) ([1bcc3e3](https://github.com/djm204/frankenbeast/commit/1bcc3e34a9a91d4e3bea0863c13d6d209e5bf474)), closes [#2016](https://github.com/djm204/frankenbeast/issues/2016)
* **mcp-suite:** validate memory query limit safety ([#2001](https://github.com/djm204/frankenbeast/issues/2001)) ([6655e98](https://github.com/djm204/frankenbeast/commit/6655e98955ff75a87cd1c8237455c9207985b623))
* **orchestrator:** close beast attempt cleanup issue ([#2003](https://github.com/djm204/frankenbeast/issues/2003)) ([ae34c42](https://github.com/djm204/frankenbeast/commit/ae34c42ecba98db09aa5b43c097d8ecf0819170e))


### Tests

* **mcp-suite:** document tamper-evident audit chaining ([#2075](https://github.com/djm204/frankenbeast/issues/2075)) ([1cc34a4](https://github.com/djm204/frankenbeast/commit/1cc34a4ce8afdbea462ad790251b97fbc5e5863d))
* **mcp-suite:** exercise Codex executor CLI path ([#2062](https://github.com/djm204/frankenbeast/issues/2062)) ([0d052ee](https://github.com/djm204/frankenbeast/commit/0d052ee978864fbfd0d085e73664837beee0eb14))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.9.0 to 0.10.0
    * @franken/brain bumped from 0.7.5 to 0.8.0
    * @franken/critique bumped from 0.7.0 to 0.8.0
    * @franken/governor bumped from 0.5.14 to 0.6.0
    * @franken/observer bumped from 0.7.16 to 0.7.17
    * @franken/orchestrator bumped from 0.42.3 to 0.43.0
    * @franken/planner bumped from 0.4.14 to 0.4.15

## [0.2.7](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.6...franken-mcp-suite-v0.2.7) (2026-07-11)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.6.16 to 0.7.0
    * @franken/orchestrator bumped from 0.42.2 to 0.42.3

## [0.2.6](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.5...franken-mcp-suite-v0.2.6) (2026-07-11)


### Bug Fixes

* enforce immutable audit_trail writes ([#1459](https://github.com/djm204/frankenbeast/issues/1459)) ([0121ae4](https://github.com/djm204/frankenbeast/commit/0121ae4c081d5bba99396bda1702aa7783507a94))
* **mcp-suite:** recover invalid JSON settings ([#1470](https://github.com/djm204/frankenbeast/issues/1470)) ([15d448e](https://github.com/djm204/frankenbeast/commit/15d448e535b8ce32caef58cec0c070b8d2a8d5ab))
* **mcp-suite:** reject invalid observer cost inputs ([#1535](https://github.com/djm204/frankenbeast/issues/1535)) ([2ce5c4f](https://github.com/djm204/frankenbeast/commit/2ce5c4f3024113d36b46094bcad7a7b03468c988)), closes [#980](https://github.com/djm204/frankenbeast/issues/980)
* **mcp-suite:** validate init mcpServers shape ([#1547](https://github.com/djm204/frankenbeast/issues/1547)) ([47aad6e](https://github.com/djm204/frankenbeast/commit/47aad6ed7609c9c1b0543bd16490ef5810502b1d))
* **mcp-suite:** validate memory query limits ([#1465](https://github.com/djm204/frankenbeast/issues/1465)) ([ac2d053](https://github.com/djm204/frankenbeast/commit/ac2d053c0d7cdd6e61cb829566e0d187bf744e58)), closes [#972](https://github.com/djm204/frankenbeast/issues/972)
* **mcp:** point planner guidance at status tool ([#1489](https://github.com/djm204/frankenbeast/issues/1489)) ([9455922](https://github.com/djm204/frankenbeast/commit/945592246e578a6c2ec1c06eae6f2aebb1ad7aef))
* **mcp:** quote Gemini hook script paths ([0e70cff](https://github.com/djm204/frankenbeast/commit/0e70cff9873a8355a5c9e44c6375f73707a3e284)), closes [#1040](https://github.com/djm204/frankenbeast/issues/1040)
* **mcp:** tolerate skills adapter filesystem races ([2eabf30](https://github.com/djm204/frankenbeast/commit/2eabf305f5caac540ef58cff68ae147ca6d38dc5)), closes [#935](https://github.com/djm204/frankenbeast/issues/935)
* replace nondeterministic calls with deterministic utilities ([#1441](https://github.com/djm204/frankenbeast/issues/1441)) ([1585acf](https://github.com/djm204/frankenbeast/commit/1585acf39bb993b06d2b975045641ad662a44459))


### Miscellaneous

* **ci:** make workspace lint coverage explicit ([#1596](https://github.com/djm204/frankenbeast/issues/1596)) ([c1674ed](https://github.com/djm204/frankenbeast/commit/c1674ed69e460a9c7c14d8b7af2e4039edf174d8))
* **package:** normalize workspace metadata ([#1573](https://github.com/djm204/frankenbeast/issues/1573)) ([921c557](https://github.com/djm204/frankenbeast/commit/921c557e9f8392f1202f3fa2cdcc7952ffccd255))


### Documentation

* **web:** clarify dashboard proxy env guidance ([cb20c5c](https://github.com/djm204/frankenbeast/commit/cb20c5cafb100741c10f032f4d03250e0ee05556)), closes [#993](https://github.com/djm204/frankenbeast/issues/993)


### Tests

* add deterministic Vitest seed mode ([#1429](https://github.com/djm204/frankenbeast/issues/1429)) ([f12b497](https://github.com/djm204/frankenbeast/commit/f12b497a0662a1b519cbf07d442316c734dcc778))
* **mcp-suite:** add integration test script ([5a98605](https://github.com/djm204/frankenbeast/commit/5a986057f976a6b83a60e8dbcc0f5ebe4576a96d)), closes [#947](https://github.com/djm204/frankenbeast/issues/947)
* **mcp-suite:** assert Windows fbeast shim passthrough ([#1474](https://github.com/djm204/frankenbeast/issues/1474)) ([760b146](https://github.com/djm204/frankenbeast/commit/760b146b3a87ce1f6fe8eaf91526d6d86a5b332d))
* **mcp-suite:** cover observer log edge cases ([#1645](https://github.com/djm204/frankenbeast/issues/1645)) ([600e870](https://github.com/djm204/frankenbeast/commit/600e870914e0f1b1b67da5ab8c9dd32bba77220c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.2 to 0.9.0
    * @franken/brain bumped from 0.7.4 to 0.7.5
    * @franken/critique bumped from 0.6.15 to 0.6.16
    * @franken/governor bumped from 0.5.13 to 0.5.14
    * @franken/observer bumped from 0.7.15 to 0.7.16
    * @franken/orchestrator bumped from 0.42.1 to 0.42.2
    * @franken/planner bumped from 0.4.13 to 0.4.14

## [0.2.5](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.4...franken-mcp-suite-v0.2.5) (2026-07-10)


### Bug Fixes

* **governor:** reload firewall security profile ([#1358](https://github.com/djm204/frankenbeast/issues/1358)) ([40d34c0](https://github.com/djm204/frankenbeast/commit/40d34c0f999b713fc6dde628ffdd5d758f8ae011))
* **mcp-suite:** harden project MCP config paths ([#1349](https://github.com/djm204/frankenbeast/issues/1349)) ([8b6d184](https://github.com/djm204/frankenbeast/commit/8b6d184a904faf958a4192e1a575f985f540f1e5))
* **mcp-suite:** keep json client config project-scoped ([#1313](https://github.com/djm204/frankenbeast/issues/1313)) ([492335d](https://github.com/djm204/frankenbeast/commit/492335d661eebd47db71ec3396bf3ba848cd30fa))
* **mcp-suite:** preserve Windows shim trailing backslashes ([7320ce3](https://github.com/djm204/frankenbeast/commit/7320ce3a5e2d372964d42846023b78b8b94aa9a0))
* **mcp-suite:** quote Codex hook command paths ([9b6ff3d](https://github.com/djm204/frankenbeast/commit/9b6ff3d62831ada2547252bb58a43f216c6043e1)), closes [#1236](https://github.com/djm204/frankenbeast/issues/1236)
* **mcp:** avoid global settings path crossover ([#1295](https://github.com/djm204/frankenbeast/issues/1295)) ([7aaec80](https://github.com/djm204/frankenbeast/commit/7aaec80ab9974be07f580c965a340b24c55a3c79))
* **mcp:** close Codex hook command quoting issue ([#1382](https://github.com/djm204/frankenbeast/issues/1382)) ([293c730](https://github.com/djm204/frankenbeast/commit/293c7301083883b56bb71e1eca19f1ddc4d23236)), closes [#1047](https://github.com/djm204/frankenbeast/issues/1047)
* **mcp:** reject unknown critique evaluators ([5251af7](https://github.com/djm204/frankenbeast/commit/5251af77d48279fa2775cddbd5d68123e89c0582))
* **mcp:** reject unsupported recovery memory type ([#907](https://github.com/djm204/frankenbeast/issues/907)) ([62867ea](https://github.com/djm204/frankenbeast/commit/62867ea63a7a8662bbc6464ac26d5590a232d824))
* **mcp:** surface unknown model costs ([#1293](https://github.com/djm204/frankenbeast/issues/1293)) ([1656e5d](https://github.com/djm204/frankenbeast/commit/1656e5dd9f7927234e7831127226cc734295aae2)), closes [#1163](https://github.com/djm204/frankenbeast/issues/1163)
* **mcp:** validate stored planner DAGs ([#1408](https://github.com/djm204/frankenbeast/issues/1408)) ([1d86aa5](https://github.com/djm204/frankenbeast/commit/1d86aa5c129e91ea0ed464c19678c09a97f22429))
* quote hook script db paths to prevent shell injection ([#900](https://github.com/djm204/frankenbeast/issues/900)) ([2b469e8](https://github.com/djm204/frankenbeast/commit/2b469e8358726a78600db1f56ba3e0f87b2b1b44))
* **web:** resolve chat session syntax issue ([4ce15f7](https://github.com/djm204/frankenbeast/commit/4ce15f79ead878e53e9fe9ac10bd1d7943972dfd))


### Documentation

* **agents:** make fbeast MCP instructions conditional ([#1309](https://github.com/djm204/frankenbeast/issues/1309)) ([1433a1d](https://github.com/djm204/frankenbeast/commit/1433a1d416a7f2d797ed42c2d1998d646eec3ca3))
* **mcp:** document skill health endpoint ([#1385](https://github.com/djm204/frankenbeast/issues/1385)) ([4c87b69](https://github.com/djm204/frankenbeast/commit/4c87b6983538d4030e8663d0d82f8ef92dec636e))
* **mcp:** update local link recovery advice ([439dee4](https://github.com/djm204/frankenbeast/commit/439dee42d20320d8bb26ef2504ccfde499ef29a4)), closes [#1209](https://github.com/djm204/frankenbeast/issues/1209)
* **readme:** clarify init backend setup ([#1384](https://github.com/djm204/frankenbeast/issues/1384)) ([fd0fbc9](https://github.com/djm204/frankenbeast/commit/fd0fbc956f41b2ceddddf2b7bfb2378366dd7827))
* **web:** fix operator token auth header markdown ([#1303](https://github.com/djm204/frankenbeast/issues/1303)) ([1449e26](https://github.com/djm204/frankenbeast/commit/1449e268c54bafb994d5034fec1ccfc312194d9e))


### Tests

* **mcp:** cover post-tool option termination ([8c9231b](https://github.com/djm204/frankenbeast/commit/8c9231b3673165f2672c2af94d2f66aaeeaedd73)), closes [#914](https://github.com/djm204/frankenbeast/issues/914)
* **mcp:** guard README tool inventory ([31f516f](https://github.com/djm204/frankenbeast/commit/31f516f1cfd45c3c32a96a855b7153236f6bd766)), closes [#1131](https://github.com/djm204/frankenbeast/issues/1131)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.1 to 0.8.2
    * @franken/brain bumped from 0.7.3 to 0.7.4
    * @franken/critique bumped from 0.6.14 to 0.6.15
    * @franken/governor bumped from 0.5.12 to 0.5.13
    * @franken/observer bumped from 0.7.14 to 0.7.15
    * @franken/orchestrator bumped from 0.42.0 to 0.42.1
    * @franken/planner bumped from 0.4.12 to 0.4.13

## [0.2.4](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.3...franken-mcp-suite-v0.2.4) (2026-07-08)


### Bug Fixes

* **mcp:** configure BrainAdapter sqlite pragmas ([09ee4bd](https://github.com/djm204/frankenbeast/commit/09ee4bd373cd99f8d25a418045710461e0a9ef1a))


### Refactoring

* **mcp:** source standalone tools from registry ([796f4bb](https://github.com/djm204/frankenbeast/commit/796f4bbd05fed92881606c38c8d1d58c385c5691))


### Documentation

* **config:** document FRANKEN env overrides ([a818cc8](https://github.com/djm204/frankenbeast/commit/a818cc8cde8ee8d570ef01c0a5efd0f838a7a5a1)), closes [#1263](https://github.com/djm204/frankenbeast/issues/1263)
* **mcp:** document central audit session ids ([7209458](https://github.com/djm204/frankenbeast/commit/7209458bb35d4ad0641b24e8f44fa5e8e13b0c72))


### Tests

* **ci:** exercise minimum supported Node version in CI ([#1057](https://github.com/djm204/frankenbeast/issues/1057)) ([26debe4](https://github.com/djm204/frankenbeast/commit/26debe4feb5221422680988a4a3bb1d112bb8adb))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.0 to 0.8.1
    * @franken/brain bumped from 0.7.2 to 0.7.3
    * @franken/critique bumped from 0.6.13 to 0.6.14
    * @franken/governor bumped from 0.5.11 to 0.5.12
    * @franken/observer bumped from 0.7.13 to 0.7.14
    * @franken/orchestrator bumped from 0.41.1 to 0.42.0
    * @franken/planner bumped from 0.4.11 to 0.4.12

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
