# Changelog

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
