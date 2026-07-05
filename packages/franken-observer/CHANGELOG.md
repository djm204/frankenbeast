# Changelog

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
