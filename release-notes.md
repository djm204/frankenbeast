:robot: I have created a release *beep* *boop*
---


<details><summary>@franken/brain: 0.17.0</summary>

## [0.17.0](https://github.com/djm204/frankenbeast/compare/@franken/brain-v0.16.2...@franken/brain-v0.17.0) (2026-07-23)


### Features

* **brain:** add memory conflict resolution prompts ([#2396](https://github.com/djm204/frankenbeast/issues/2396)) ([eeb9155](https://github.com/djm204/frankenbeast/commit/eeb9155ccf06a1dd9cf2872685d3ac95b8bee7bf))
* **brain:** suggest memory candidate merge duplicates ([47d1a70](https://github.com/djm204/frankenbeast/commit/47d1a70064ea7731fc18b6376252c3a23c96524c))
* **learning:** add skill evolution review gate ([#2413](https://github.com/djm204/frankenbeast/issues/2413)) ([25cec22](https://github.com/djm204/frankenbeast/commit/25cec22c6512dc810f5a013b91db89242c7c78ce))
* **memory:** add confidence decay model ([#2326](https://github.com/djm204/frankenbeast/issues/2326)) ([3d59a83](https://github.com/djm204/frankenbeast/commit/3d59a83becb8d1e4f318a12f6c8f57216fa6f556))
* **memory:** add conflict resolver ([#2320](https://github.com/djm204/frankenbeast/issues/2320)) ([6066b86](https://github.com/djm204/frankenbeast/commit/6066b861ca55505c5508f74b905362d68ef54b05))
* **memory:** add memory access audit trail ([#2317](https://github.com/djm204/frankenbeast/issues/2317)) ([ef889da](https://github.com/djm204/frankenbeast/commit/ef889dae092d996a6ca463e5abcaf5ed4d296158))
* **memory:** add provenance confidence metadata ([#2552](https://github.com/djm204/frankenbeast/issues/2552)) ([835816b](https://github.com/djm204/frankenbeast/commit/835816bea0ac0149c7874b5b441bb979f8e044f5))
* **memory:** add retention policy report ([#2554](https://github.com/djm204/frankenbeast/issues/2554)) ([8b564d9](https://github.com/djm204/frankenbeast/commit/8b564d9c794db41af1e7e9e7be7a98bdf46f6ed6))
* **memory:** add source attribution viewer ([#2329](https://github.com/djm204/frankenbeast/issues/2329)) ([9a47d63](https://github.com/djm204/frankenbeast/commit/9a47d63ce4bed21908af873ed7588794ae19d25a))


### Bug Fixes

* **brain:** audit corrupt recovery checkpoints ([#3568](https://github.com/djm204/frankenbeast/issues/3568)) ([4d78061](https://github.com/djm204/frankenbeast/commit/4d78061ec4cb71cb0940469d9c3340c3383aeefd))
* **brain:** bound checkpoint listings ([#3592](https://github.com/djm204/frankenbeast/issues/3592)) ([5d60114](https://github.com/djm204/frankenbeast/commit/5d60114f652ecf380f0ba61d47467475e2624ef2))
* **brain:** define public package exports ([#3401](https://github.com/djm204/frankenbeast/issues/3401)) ([8b66824](https://github.com/djm204/frankenbeast/commit/8b66824ef583273d93b23a5619bf7f39979c9dd0))
* **brain:** expose episodic snapshot truncation ([#3575](https://github.com/djm204/frankenbeast/issues/3575)) ([97bcc6c](https://github.com/djm204/frankenbeast/commit/97bcc6c0f3ecfdc586efbe06ad1a0360461227b0))
* **brain:** guard checkpoint serialization budgets ([#3569](https://github.com/djm204/frankenbeast/issues/3569)) ([9a8f24f](https://github.com/djm204/frankenbeast/commit/9a8f24f1f80ca5ffa352f56ad4247db9332ccc26))
* **brain:** index episodic hot-path queries ([#3470](https://github.com/djm204/frankenbeast/issues/3470)) ([0176350](https://github.com/djm204/frankenbeast/commit/0176350de3b3c742fab32306a78ab5fadd7ff593))
* **brain:** normalize episodic recall punctuation ([#3591](https://github.com/djm204/frankenbeast/issues/3591)) ([7a97cf1](https://github.com/djm204/frankenbeast/commit/7a97cf1bc40a8e3e1b366d74e01c61f78fa2b515))
* **brain:** preserve concurrent SQLite writes ([#3423](https://github.com/djm204/frankenbeast/issues/3423)) ([be06e50](https://github.com/djm204/frankenbeast/commit/be06e50dfa3b689023dd3a238945435a259811ae))
* **brain:** prune persisted memory on reduced entry limits ([#2635](https://github.com/djm204/frankenbeast/issues/2635)) ([5325b99](https://github.com/djm204/frankenbeast/commit/5325b9923bead81af45d0ff8d0b0c3c2c510f115))
* **brain:** quarantine corrupt episodic details ([#3471](https://github.com/djm204/frankenbeast/issues/3471)) ([0ce3a2a](https://github.com/djm204/frankenbeast/commit/0ce3a2a6830f826efb6b08fbe6eaaadd771bf25a))
* **brain:** reject corrupt working memory hydration ([#3263](https://github.com/djm204/frankenbeast/issues/3263)) ([ef5a3d8](https://github.com/djm204/frankenbeast/commit/ef5a3d85dab3c4be70f9055a066abdba7d813760))
* **brain:** validate working memory keys ([#3265](https://github.com/djm204/frankenbeast/issues/3265)) ([dc6cbfd](https://github.com/djm204/frankenbeast/commit/dc6cbfd9b73793b796d37e239efaf7c83bd85165))
* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* **mcp:** cap brain startup hydration ([#3247](https://github.com/djm204/frankenbeast/issues/3247)) ([c63e531](https://github.com/djm204/frankenbeast/commit/c63e531ee287b902870c7a8e8e728bf89a4d6198))
* **security:** address Codex redaction findings ([#2583](https://github.com/djm204/frankenbeast/issues/2583)) ([e497d90](https://github.com/djm204/frankenbeast/commit/e497d904af9fb9ee81aa7a1edc94f53aeb4f6f7d))


### Miscellaneous

* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))
* **eslint:** enable type-aware promise linting ([#3435](https://github.com/djm204/frankenbeast/issues/3435)) ([c089f8b](https://github.com/djm204/frankenbeast/commit/c089f8b1cc0ff78a4fc5790567328b9c4928e8bf))
* **mcp:** reconcile observer redaction review fixes ([66f5339](https://github.com/djm204/frankenbeast/commit/66f53391e2265a7511a008595971c3a0d0f00dd0))
* release main ([d19cce0](https://github.com/djm204/frankenbeast/commit/d19cce08188e79330228990ea311d38b0a2218eb))
* release main ([1064be4](https://github.com/djm204/frankenbeast/commit/1064be4436a8cc085155bf56d87668832c9e55bc))
* release main ([750094b](https://github.com/djm204/frankenbeast/commit/750094bab0859c49829b4abe85013a5007fc272b))
* release main ([100e3a8](https://github.com/djm204/frankenbeast/commit/100e3a887b6fbd538e8a1b83f4e88ce4caf6c443))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2553](https://github.com/djm204/frankenbeast/issues/2553)) ([1ca33c2](https://github.com/djm204/frankenbeast/commit/1ca33c2aa6e68792886ef599d1ac35bebcc8e3c9))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3400](https://github.com/djm204/frankenbeast/issues/3400)) ([02fd894](https://github.com/djm204/frankenbeast/commit/02fd894bf6e7453e56d3446a73be277431ae6e12))
* release main ([#3407](https://github.com/djm204/frankenbeast/issues/3407)) ([c1cb208](https://github.com/djm204/frankenbeast/commit/c1cb208923376aef3eccd371b178352abb2a6c9c))
* release main ([#3521](https://github.com/djm204/frankenbeast/issues/3521)) ([a3c8c12](https://github.com/djm204/frankenbeast/commit/a3c8c121f2ff4b7563c88cce9b31d6163bba82b7))


### Documentation

* remove PM-swarm terminology from Frankenbeast docs ([dcf183d](https://github.com/djm204/frankenbeast/commit/dcf183da6c8c176ecabd5278adbd6d3e6068be17))


### Tests

* **brain:** lock in atomic working-memory flushes ([#3552](https://github.com/djm204/frankenbeast/issues/3552)) ([879e650](https://github.com/djm204/frankenbeast/commit/879e650d59d2e2973d4b523ee406f2939ea4b2ba))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.16.1 to 0.17.0
</details>

<details><summary>franken-critique: 0.11.0</summary>

## [0.11.0](https://github.com/djm204/frankenbeast/compare/franken-critique-v0.10.4...franken-critique-v0.11.0) (2026-07-23)


### Features

* **critique:** add lesson promotion critique ([#2342](https://github.com/djm204/frankenbeast/issues/2342)) ([7e6ab35](https://github.com/djm204/frankenbeast/commit/7e6ab3513dc5e074e20f18aa0791fd62635e7a8d))
* **learning:** add post-task lesson extraction ([#2548](https://github.com/djm204/frankenbeast/issues/2548)) ([32e0bb7](https://github.com/djm204/frankenbeast/commit/32e0bb72310a6c45638c87e6212caea0c05e57c4))
* **learning:** cluster repeated failure families ([#2341](https://github.com/djm204/frankenbeast/issues/2341)) ([659c773](https://github.com/djm204/frankenbeast/commit/659c7738ce08b72f0755f604111e4ba55d288eac))
* **learning:** scope cross-agent lesson sharing ([#2357](https://github.com/djm204/frankenbeast/issues/2357)) ([563b8ea](https://github.com/djm204/frankenbeast/commit/563b8ea581be03f10b5f3f72aee55a4868547ddd))


### Bug Fixes

* **critique:** accept unknown error causes ([#3641](https://github.com/djm204/frankenbeast/issues/3641)) ([34f226b](https://github.com/djm204/frankenbeast/commit/34f226ba19c9726f458ab03e763abf0636d8f526))
* **critique:** bound complexity evaluator input size ([#3605](https://github.com/djm204/frankenbeast/issues/3605)) ([56c1ced](https://github.com/djm204/frankenbeast/commit/56c1ced17c071e94dc24743280149171e7da1e6f))
* **critique:** decode braced unicode class escapes ([#3540](https://github.com/djm204/frankenbeast/issues/3540)) ([a11e8f8](https://github.com/djm204/frankenbeast/commit/a11e8f88825bd35b935ec9349402a8ca7d893e8b))
* **critique:** forward reflection max tokens ([891d990](https://github.com/djm204/frankenbeast/commit/891d990f24fed66da5b51f66052e0a60bc71af89)), closes [#2045](https://github.com/djm204/frankenbeast/issues/2045)
* **critique:** harden lesson scope metadata validation ([#2613](https://github.com/djm204/frankenbeast/issues/2613)) ([ab0ea47](https://github.com/djm204/frankenbeast/commit/ab0ea4751f2838278ead921367adb088de1597ff))
* **critique:** honor request evaluator selectors ([#3611](https://github.com/djm204/frankenbeast/issues/3611)) ([9e3e6fb](https://github.com/djm204/frankenbeast/commit/9e3e6fbc1bcd09f944d620eb52f9b62be2348800))
* **critique:** parse nested unicode set classes ([#3399](https://github.com/djm204/frankenbeast/issues/3399)) ([613162e](https://github.com/djm204/frankenbeast/commit/613162e40b7a6345ca8fd2775b0e07279558baa0))
* **critique:** redact token budget breaker reasons ([#3604](https://github.com/djm204/frankenbeast/issues/3604)) ([9db5cfb](https://github.com/djm204/frankenbeast/commit/9db5cfb1afb0fac02b71aa7bef282776976c6686))
* **critique:** report reflection formatting failures ([#3625](https://github.com/djm204/frankenbeast/issues/3625)) ([72e77cf](https://github.com/djm204/frankenbeast/commit/72e77cf63647ffddf1422ff6ee8282c5b139c36b))
* **critique:** return structured 400 for malformed review JSON ([#2595](https://github.com/djm204/frankenbeast/issues/2595)) ([261a482](https://github.com/djm204/frankenbeast/commit/261a48201ed50f104e9c4753beff6d0a66802fa0))
* **critique:** validate rate limit configuration ([73a44f7](https://github.com/djm204/frankenbeast/commit/73a44f76249b9b07ea4b5435416e103bf6d1be5c)), closes [#2042](https://github.com/djm204/frankenbeast/issues/2042)
* disambiguate critique result type exports ([#3316](https://github.com/djm204/frankenbeast/issues/3316)) ([48756fd](https://github.com/djm204/frankenbeast/commit/48756fd04b2490566ba5e2a28b6f96fa0cb9d153))
* **docs:** remove stale package references ([#3473](https://github.com/djm204/frankenbeast/issues/3473)) ([8e6e431](https://github.com/djm204/frankenbeast/commit/8e6e431cbc05b337f7a56b5000b65e1f5dfd1ef1))
* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* **types:** share branded critique score contract ([#3433](https://github.com/djm204/frankenbeast/issues/3433)) ([6800c5d](https://github.com/djm204/frankenbeast/commit/6800c5d0da90d5b0aabd5043a24306456c9b4f8c))


### Miscellaneous

* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))
* **eslint:** enable type-aware promise linting ([#3435](https://github.com/djm204/frankenbeast/issues/3435)) ([c089f8b](https://github.com/djm204/frankenbeast/commit/c089f8b1cc0ff78a4fc5790567328b9c4928e8bf))
* **mcp:** reconcile observer redaction review fixes ([66f5339](https://github.com/djm204/frankenbeast/commit/66f53391e2265a7511a008595971c3a0d0f00dd0))
* release main ([d19cce0](https://github.com/djm204/frankenbeast/commit/d19cce08188e79330228990ea311d38b0a2218eb))
* release main ([1064be4](https://github.com/djm204/frankenbeast/commit/1064be4436a8cc085155bf56d87668832c9e55bc))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3407](https://github.com/djm204/frankenbeast/issues/3407)) ([c1cb208](https://github.com/djm204/frankenbeast/commit/c1cb208923376aef3eccd371b178352abb2a6c9c))
* release main ([#3521](https://github.com/djm204/frankenbeast/issues/3521)) ([a3c8c12](https://github.com/djm204/frankenbeast/commit/a3c8c121f2ff4b7563c88cce9b31d6163bba82b7))
* release main ([#3606](https://github.com/djm204/frankenbeast/issues/3606)) ([3d33c74](https://github.com/djm204/frankenbeast/commit/3d33c746587a861c97c1e140e93e536ec7d23f23))


### Documentation

* **onboarding:** relocate concise agent ramp-up guide ([#3396](https://github.com/djm204/frankenbeast/issues/3396)) ([c39eb74](https://github.com/djm204/frankenbeast/commit/c39eb74886803b2a8f041553cfc742e0655aa483))
* remove PM-swarm terminology from Frankenbeast docs ([dcf183d](https://github.com/djm204/frankenbeast/commit/dcf183da6c8c176ecabd5278adbd6d3e6068be17))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.16.1 to 0.17.0
</details>

<details><summary>franken-governor: 0.9.0</summary>

## [0.9.0](https://github.com/djm204/frankenbeast/compare/franken-governor-v0.8.3...franken-governor-v0.9.0) (2026-07-23)


### Features

* **governor:** add policy-as-code engine and gate PrCreator git pushes ([#2661](https://github.com/djm204/frankenbeast/issues/2661)) ([ebb2b91](https://github.com/djm204/frankenbeast/commit/ebb2b91b0f94c09159fc7f119f782a017517631c))


### Bug Fixes

* **docs:** remove stale package references ([#3473](https://github.com/djm204/frankenbeast/issues/3473)) ([8e6e431](https://github.com/djm204/frankenbeast/commit/8e6e431cbc05b337f7a56b5000b65e1f5dfd1ef1))
* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* explain invalid CLI approval responses ([#3314](https://github.com/djm204/frankenbeast/issues/3314)) ([745723f](https://github.com/djm204/frankenbeast/commit/745723f7fe7d78cab6959a1b4451cc305b45eb53))
* **governor:** add approval anomaly detection ([#2353](https://github.com/djm204/frankenbeast/issues/2353)) ([84a1222](https://github.com/djm204/frankenbeast/commit/84a12225d5e900e9c9be5597cf6ae6a10ea604e7))
* **governor:** authorize Slack approvers ([#3269](https://github.com/djm204/frankenbeast/issues/3269)) ([938940b](https://github.com/djm204/frankenbeast/commit/938940b3f561f5f916ef61505fc05508df877aa5))
* **governor:** preserve out-of-order approval responses ([#3456](https://github.com/djm204/frankenbeast/issues/3456)) ([f89fcef](https://github.com/djm204/frankenbeast/commit/f89fcef6291fd564944626dc260bebdead750e97))
* **governor:** validate Slack timestamp integers ([#3566](https://github.com/djm204/frankenbeast/issues/3566)) ([b4cc339](https://github.com/djm204/frankenbeast/commit/b4cc339f772026faa8f9273007fdd7ecad3d9edb))
* **orchestrator:** prevent duplicate terminal input ([#3436](https://github.com/djm204/frankenbeast/issues/3436)) ([fd4517b](https://github.com/djm204/frankenbeast/commit/fd4517b0bd1e365942b6e1dd55cf31397fb004e7)), closes [#3364](https://github.com/djm204/frankenbeast/issues/3364)


### Miscellaneous

* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))
* **mcp:** reconcile observer redaction review fixes ([66f5339](https://github.com/djm204/frankenbeast/commit/66f53391e2265a7511a008595971c3a0d0f00dd0))
* release main ([d19cce0](https://github.com/djm204/frankenbeast/commit/d19cce08188e79330228990ea311d38b0a2218eb))
* release main ([1064be4](https://github.com/djm204/frankenbeast/commit/1064be4436a8cc085155bf56d87668832c9e55bc))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3407](https://github.com/djm204/frankenbeast/issues/3407)) ([c1cb208](https://github.com/djm204/frankenbeast/commit/c1cb208923376aef3eccd371b178352abb2a6c9c))
* release main ([#3521](https://github.com/djm204/frankenbeast/issues/3521)) ([a3c8c12](https://github.com/djm204/frankenbeast/commit/a3c8c121f2ff4b7563c88cce9b31d6163bba82b7))


### Documentation

* **onboarding:** relocate concise agent ramp-up guide ([#3396](https://github.com/djm204/frankenbeast/issues/3396)) ([c39eb74](https://github.com/djm204/frankenbeast/commit/c39eb74886803b2a8f041553cfc742e0655aa483))


### Tests

* **governor:** make integration script config-only ([#2601](https://github.com/djm204/frankenbeast/issues/2601)) ([ee0d289](https://github.com/djm204/frankenbeast/commit/ee0d2891e2c448e116d1a7d8d72aa5b28ec6afb4)), closes [#2022](https://github.com/djm204/frankenbeast/issues/2022)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.16.1 to 0.17.0
</details>

<details><summary>live-bench: 0.5.0</summary>

## [0.5.0](https://github.com/djm204/frankenbeast/compare/live-bench-v0.4.5...live-bench-v0.5.0) (2026-07-23)


### Features

* **learning:** add strategy experiment sandbox ([#2579](https://github.com/djm204/frankenbeast/issues/2579)) ([bc1de3d](https://github.com/djm204/frankenbeast/commit/bc1de3d3e0d685f4a0c5e375a82c657c289fb651))
* **learning:** add workflow regression benchmark ([#2356](https://github.com/djm204/frankenbeast/issues/2356)) ([b9101f5](https://github.com/djm204/frankenbeast/commit/b9101f5a7d0ddace3cd730532a15b4e72af8fb05))


### Bug Fixes

* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* **live-bench:** bound corpus traversal ([#3448](https://github.com/djm204/frankenbeast/issues/3448)) ([64dada9](https://github.com/djm204/frankenbeast/commit/64dada90609944a1637c60ca7e015b5b73c0150a)), closes [#3068](https://github.com/djm204/frankenbeast/issues/3068)
* **live-bench:** bound run timestamp years ([#3572](https://github.com/djm204/frankenbeast/issues/3572)) ([134de09](https://github.com/djm204/frankenbeast/commit/134de09389221d1475289b5e42d776e16dfc9e19))
* **live-bench:** harden run directory cleanup ([#3294](https://github.com/djm204/frankenbeast/issues/3294)) ([a5761a5](https://github.com/djm204/frankenbeast/commit/a5761a554f2b45fc602416bfebf27d483da57890))
* **live-bench:** quarantine malformed candidate tasks ([#3440](https://github.com/djm204/frankenbeast/issues/3440)) ([be05795](https://github.com/djm204/frankenbeast/commit/be05795e1734798f40b8cf9f14b2e90d0020a680))
* **live-bench:** reject extra list arguments ([#3557](https://github.com/djm204/frankenbeast/issues/3557)) ([fb9955a](https://github.com/djm204/frankenbeast/commit/fb9955a9ce33e901169e4347647a82f2bcf4902c))
* **live-bench:** validate artifact paths ([#3293](https://github.com/djm204/frankenbeast/issues/3293)) ([710c9d0](https://github.com/djm204/frankenbeast/commit/710c9d097bdc98805d9544fb8e15b46c154c4f27))


### Miscellaneous

* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))
* **mcp:** reconcile observer redaction review fixes ([66f5339](https://github.com/djm204/frankenbeast/commit/66f53391e2265a7511a008595971c3a0d0f00dd0))
* release main ([d19cce0](https://github.com/djm204/frankenbeast/commit/d19cce08188e79330228990ea311d38b0a2218eb))
* release main ([1064be4](https://github.com/djm204/frankenbeast/commit/1064be4436a8cc085155bf56d87668832c9e55bc))
* release main ([750094b](https://github.com/djm204/frankenbeast/commit/750094bab0859c49829b4abe85013a5007fc272b))
* release main ([100e3a8](https://github.com/djm204/frankenbeast/commit/100e3a887b6fbd538e8a1b83f4e88ce4caf6c443))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3407](https://github.com/djm204/frankenbeast/issues/3407)) ([c1cb208](https://github.com/djm204/frankenbeast/commit/c1cb208923376aef3eccd371b178352abb2a6c9c))
* release main ([#3521](https://github.com/djm204/frankenbeast/issues/3521)) ([a3c8c12](https://github.com/djm204/frankenbeast/commit/a3c8c121f2ff4b7563c88cce9b31d6163bba82b7))
* release main ([#3606](https://github.com/djm204/frankenbeast/issues/3606)) ([3d33c74](https://github.com/djm204/frankenbeast/commit/3d33c746587a861c97c1e140e93e536ec7d23f23))
* **types:** enforce workspace strictness ([#3458](https://github.com/djm204/frankenbeast/issues/3458)) ([503b644](https://github.com/djm204/frankenbeast/commit/503b6448f05f74ccd28493fcf8f46a23ba4d80aa))


### Tests

* **live-bench:** relax CLI smoke timeouts ([474c704](https://github.com/djm204/frankenbeast/commit/474c7048b0cad04125a7e12d236c5688f5838cc5))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/observer bumped from 0.11.5 to 0.12.0
    * @franken/types bumped from 0.16.1 to 0.17.0
</details>

<details><summary>franken-mcp-suite: 0.10.0</summary>

## [0.10.0](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.9.3...franken-mcp-suite-v0.10.0) (2026-07-23)


### Features

* **brain:** add memory conflict resolution prompts ([#2396](https://github.com/djm204/frankenbeast/issues/2396)) ([eeb9155](https://github.com/djm204/frankenbeast/commit/eeb9155ccf06a1dd9cf2872685d3ac95b8bee7bf))
* **memory:** add access audit report ([a39a13c](https://github.com/djm204/frankenbeast/commit/a39a13c1f6a1d44faa2e07c524723e21409e2f1f))
* **memory:** add access audit report ([0358044](https://github.com/djm204/frankenbeast/commit/035804436d3e495f565cd8f2a59087856c9bf655))
* **memory:** add conflict resolver ([#2320](https://github.com/djm204/frankenbeast/issues/2320)) ([6066b86](https://github.com/djm204/frankenbeast/commit/6066b861ca55505c5508f74b905362d68ef54b05))
* **memory:** add redacted project memory export ([#2321](https://github.com/djm204/frankenbeast/issues/2321)) ([6a7b8bb](https://github.com/djm204/frankenbeast/commit/6a7b8bb1dfbbc10282e7cd90ac34936a06943d15))
* **memory:** add retention policy report ([#2554](https://github.com/djm204/frankenbeast/issues/2554)) ([8b564d9](https://github.com/djm204/frankenbeast/commit/8b564d9c794db41af1e7e9e7be7a98bdf46f6ed6))
* **memory:** add source attribution viewer ([#2329](https://github.com/djm204/frankenbeast/issues/2329)) ([9a47d63](https://github.com/djm204/frankenbeast/commit/9a47d63ce4bed21908af873ed7588794ae19d25a))
* **memory:** expose promotion review queue tools ([efa666d](https://github.com/djm204/frankenbeast/commit/efa666df7eb49e0eadde812a45172fde33eaf6e0))
* **memory:** quarantine sensitive memory writes ([#2327](https://github.com/djm204/frankenbeast/issues/2327)) ([c77679b](https://github.com/djm204/frankenbeast/commit/c77679b3e33723d37c2b0d34484bfb5029b947b1))


### Bug Fixes

* address memory audit codex findings ([85d6eb7](https://github.com/djm204/frankenbeast/commit/85d6eb7c6d6ab9807804ad46f9fdd1d8629245c1))
* address memory audit hook provenance findings ([941320f](https://github.com/djm204/frankenbeast/commit/941320f0c0bd3f217d88c268efa003285f1645da))
* align MCP suite merge docs and hook test ([606ea64](https://github.com/djm204/frankenbeast/commit/606ea64b2c88882c8f6f2824bed90d6e03135940))
* **brain:** quarantine corrupt episodic details ([#3471](https://github.com/djm204/frankenbeast/issues/3471)) ([0ce3a2a](https://github.com/djm204/frankenbeast/commit/0ce3a2a6830f826efb6b08fbe6eaaadd771bf25a))
* classify retention and validate audit provenance filters ([394e1e1](https://github.com/djm204/frankenbeast/commit/394e1e15a30833f4ffece6ce0fa3c1b884aa0025))
* complete post-hook audit context closeout ([9f33321](https://github.com/djm204/frankenbeast/commit/9f33321db485b11a83f32b02008ad31e37969b38))
* **deps:** override vulnerable Hono server ([#3515](https://github.com/djm204/frankenbeast/issues/3515)) ([302f6b2](https://github.com/djm204/frankenbeast/commit/302f6b2863feb2d85b0132d5538104cae1111698))
* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* **governor:** honor skill HITL profiles ([#3380](https://github.com/djm204/frankenbeast/issues/3380)) ([ebe1d2f](https://github.com/djm204/frankenbeast/commit/ebe1d2fb7746bd8b57a2a8316c8dc166804514a3))
* harden public governor provenance checks ([0bc808e](https://github.com/djm204/frankenbeast/commit/0bc808e0a939f72e5bf6ce6189f9edd3d6f89595))
* **mcp-suite:** accept 16-hex legacy audit hashes ([#3560](https://github.com/djm204/frankenbeast/issues/3560)) ([d0fbd25](https://github.com/djm204/frankenbeast/commit/d0fbd25d610273d32ef5dcf678a7f1843d2e016f))
* **mcp-suite:** address Codex audit provenance findings ([5c33696](https://github.com/djm204/frankenbeast/commit/5c33696dce7fc575085f386d44db2e39a2a9deb5))
* **mcp-suite:** address memory governance Codex findings ([da08483](https://github.com/djm204/frankenbeast/commit/da08483304caf0de63784a0069cc408880b1b930))
* **mcp-suite:** close memory audit review gaps ([8b95b74](https://github.com/djm204/frankenbeast/commit/8b95b749aa359e0fac39c1b0aada8098c510a14b))
* **mcp-suite:** define typed package exports ([#3438](https://github.com/djm204/frankenbeast/issues/3438)) ([eed61bc](https://github.com/djm204/frankenbeast/commit/eed61bcad8577806ccf79400c8b62692ab7965d8))
* **mcp-suite:** reject malformed observer metadata ([#3556](https://github.com/djm204/frankenbeast/issues/3556)) ([6ca1c0c](https://github.com/djm204/frankenbeast/commit/6ca1c0cd0fc27bfef182eab952cb2f80c2092287))
* **mcp-suite:** sanitize proxy audit arguments ([#3446](https://github.com/djm204/frankenbeast/issues/3446)) ([6b99e84](https://github.com/djm204/frankenbeast/commit/6b99e841b449df7888c3794a7a938d6f32f0ef90))
* **mcp-suite:** write profile settings atomically ([#2656](https://github.com/djm204/frankenbeast/issues/2656)) ([e15b4f9](https://github.com/djm204/frankenbeast/commit/e15b4f97673cfc29d3f233ef85589c0dcaa1a3aa))
* **mcp:** address observer redaction review findings ([3112db4](https://github.com/djm204/frankenbeast/commit/3112db4f2aab764cc67ce5c0f2b0cd3cb7664e82))
* **mcp:** cap brain startup hydration ([#3247](https://github.com/djm204/frankenbeast/issues/3247)) ([c63e531](https://github.com/djm204/frankenbeast/commit/c63e531ee287b902870c7a8e8e728bf89a4d6198))
* **mcp:** close observer resources on shutdown ([#3250](https://github.com/djm204/frankenbeast/issues/3250)) ([82272c1](https://github.com/djm204/frankenbeast/commit/82272c13bd420769db6ec7b0e6569cd4d78ce9c8))
* **mcp:** close post-tool redaction gaps ([0ecbc9e](https://github.com/djm204/frankenbeast/commit/0ecbc9e92484adc4a17c8f54d62b9f15287acc7f))
* **mcp:** cover nested credential payloads ([cec07c5](https://github.com/djm204/frankenbeast/commit/cec07c556a49f89c2d989ccae487a0baa517a4fa))
* **mcp:** cover prefixed credential forms ([36338f5](https://github.com/djm204/frankenbeast/commit/36338f5ad38cc3a297a43c2e779b31ed876ff514))
* **mcp:** cover serialized header redaction ([483ac18](https://github.com/djm204/frankenbeast/commit/483ac185667dee22da89464831c2a55f0ebe30a6))
* **mcp:** enforce per-tool execution deadlines ([#3238](https://github.com/djm204/frankenbeast/issues/3238)) ([88f56de](https://github.com/djm204/frankenbeast/commit/88f56de4b31b3e5931fc3bc08c773b76fa9e9acf))
* **mcp:** enforce tool schema bounds ([#3248](https://github.com/djm204/frankenbeast/issues/3248)) ([8b95dc9](https://github.com/djm204/frankenbeast/commit/8b95dc952cd1ec4a70954f863e034719b8c7887e))
* **mcp:** harden observer cost validation typing ([837a1f4](https://github.com/djm204/frankenbeast/commit/837a1f482b14b86d37ee4649ee94b2084456fd10)), closes [#2180](https://github.com/djm204/frankenbeast/issues/2180)
* **mcp:** harden raw credential redaction ([18f9c1a](https://github.com/djm204/frankenbeast/commit/18f9c1acc6d3e05108f812b354821e67c078eeb9))
* **mcp:** preserve audit integrity during migration ([#3245](https://github.com/djm204/frankenbeast/issues/3245)) ([5c4aa84](https://github.com/djm204/frankenbeast/commit/5c4aa84c495d74b5b5dbe1dbfb2dbc3f36ff615d))
* **mcp:** preserve governance while redacting outputs ([cbe9cab](https://github.com/djm204/frankenbeast/commit/cbe9cabfabeae3ceb5359fa14009a3b9b106739d))
* **mcp:** redact credential pair structures ([9ace190](https://github.com/djm204/frankenbeast/commit/9ace190962eab939e9a93bd3cb38568bd12edb1f))
* **mcp:** redact hook entrypoint failures ([#3619](https://github.com/djm204/frankenbeast/issues/3619)) ([5e08b5d](https://github.com/djm204/frankenbeast/commit/5e08b5d73a2e6f393484662f1fbcd1b52d6718b5)), closes [#3617](https://github.com/djm204/frankenbeast/issues/3617)
* **mcp:** redact post-tool observer payload secrets ([52d47e4](https://github.com/djm204/frankenbeast/commit/52d47e421f95c0f9e40cd225e324cbb40454b248))
* **mcp:** redact post-tool observer payload secrets ([18a8d23](https://github.com/djm204/frankenbeast/commit/18a8d231426d935e853f50e957dc8b5462c977ec))
* **mcp:** redact post-tool observer payload secrets ([92cda2c](https://github.com/djm204/frankenbeast/commit/92cda2c82a9848bbfa59a28784483bdb00803235))
* **mcp:** redact prefixed env credential keys ([#3564](https://github.com/djm204/frankenbeast/issues/3564)) ([1f2b38c](https://github.com/djm204/frankenbeast/commit/1f2b38c84fa917a8346c045ba5efcfbb19504746))
* **mcp:** reject unsafe integer arguments ([#3393](https://github.com/djm204/frankenbeast/issues/3393)) ([25cb09f](https://github.com/djm204/frankenbeast/commit/25cb09fc25adbaf3d9dc001415acfb4de4c5138c))
* **memory:** address audit provenance review findings ([98451e2](https://github.com/djm204/frankenbeast/commit/98451e2ecaeb1e27e75a112eae3f0320751410ed))
* **memory:** address audit report codex findings ([4ba8915](https://github.com/djm204/frankenbeast/commit/4ba8915a63f8fc0d1cdbd5527ba7cf523290ae20))
* **memory:** address audit report review findings ([32ecc5c](https://github.com/djm204/frankenbeast/commit/32ecc5cb246652a17dbf1e6a67d8fbe793cff840))
* **memory:** address audit report review findings ([6fa66d9](https://github.com/djm204/frankenbeast/commit/6fa66d9e5a27d54918c934541daac8076a45153f))
* **memory:** address audit report review findings ([a5b30f8](https://github.com/djm204/frankenbeast/commit/a5b30f8e1ec57120e170b953ee02359a5b0da9f0))
* **memory:** align audit SQL filters with derived tools ([4ad62b9](https://github.com/djm204/frankenbeast/commit/4ad62b97ce009918b4126185fb38af5f8881bdce))
* **memory:** align hook audit metadata ([04d4b5f](https://github.com/djm204/frankenbeast/commit/04d4b5fad91385e46e5761b7f06429f8f353d772))
* **memory:** close audit filter gaps ([c13d969](https://github.com/djm204/frankenbeast/commit/c13d9691e49ca8e19e6d41334890a473d9971176))
* **memory:** close final audit review gaps ([e8180dc](https://github.com/djm204/frankenbeast/commit/e8180dcf1f3b33f729c1b68f3b0c524b0455a9ee))
* **memory:** cover hook audit edge cases ([8fd9a96](https://github.com/djm204/frankenbeast/commit/8fd9a96c2eaf4312103fc95481c1018ef61d9dfa))
* **memory:** document memory query limit bounds ([6897dba](https://github.com/djm204/frankenbeast/commit/6897dba3e726c389e42f0b64d3bbf837fbe4a211)), closes [#2127](https://github.com/djm204/frankenbeast/issues/2127)
* **memory:** harden access audit reporting ([17a61d3](https://github.com/djm204/frankenbeast/commit/17a61d36caa805c6f572f8cd7313b770742523d8))
* **memory:** harden audit event deduplication ([5f74d63](https://github.com/djm204/frankenbeast/commit/5f74d63195816c3ccb9903fccfd3e6cc7fc37205))
* **memory:** harden audit provenance handling ([de6ca51](https://github.com/djm204/frankenbeast/commit/de6ca51f8c4774429d20a0cc1d9d1ac58f03ecd9))
* **memory:** harden audit report edge cases ([8b9b05c](https://github.com/djm204/frankenbeast/commit/8b9b05c1b2022bac4a376e8d4ed0fa87542a540d))
* **memory:** harden audit report provenance handling ([f7b653e](https://github.com/djm204/frankenbeast/commit/f7b653e86cf13a4ac382295c54c256445a961740))
* **memory:** harden audit report validation ([07e3973](https://github.com/djm204/frankenbeast/commit/07e397348a35b788c95a7b2fd49efdace2c728c6))
* **memory:** harden hook audit provenance ([1ffaa81](https://github.com/djm204/frankenbeast/commit/1ffaa81c381322a2cfecfc5875af35650fd797a6))
* **memory:** include trusted hook audit provenance ([31dce1e](https://github.com/djm204/frankenbeast/commit/31dce1eb50a39ca12f0e203e4dce04b4c775b7ce))
* **memory:** parse provenance keys structurally ([9886ac7](https://github.com/djm204/frankenbeast/commit/9886ac730fbb123fa61c0c016c02cc7bcb2ca282))
* **memory:** preserve audit provenance for access reports ([b28a6a8](https://github.com/djm204/frankenbeast/commit/b28a6a87efce1f28dee83158e18c1f0626b49a4b))
* **memory:** preserve filtered audit metadata ([2b18380](https://github.com/djm204/frankenbeast/commit/2b183803e034e75b13fab82fb818e9cc607f8305))
* **memory:** preserve hook audit gate coverage ([b306eea](https://github.com/djm204/frankenbeast/commit/b306eea1add2ed38252454551fd9cf1a1e73c9ef))
* **memory:** redact audit report review surfaces ([f984818](https://github.com/djm204/frankenbeast/commit/f9848180778634c09c457760e2e538da28050f63))
* **memory:** redact key-only attribution proxy filters ([#2544](https://github.com/djm204/frankenbeast/issues/2544)) ([67c0676](https://github.com/djm204/frankenbeast/commit/67c0676c957a2b53d8fdd722e6c57eca7a7b9d56))
* **memory:** refine audit report correlation ([6304e6b](https://github.com/djm204/frankenbeast/commit/6304e6be3c739501154bcd53c25cf4c09bc2d07c))
* **memory:** remove stale audit scan helper ([0296a8a](https://github.com/djm204/frankenbeast/commit/0296a8ac01064496382ec0bfe9fdabf16a4c8bb6))
* **memory:** resolve audit report review followups ([ffbe8ff](https://github.com/djm204/frankenbeast/commit/ffbe8fff172112d630abffc3befc85d186ff158c))
* **memory:** tighten audit report filters ([a2050be](https://github.com/djm204/frankenbeast/commit/a2050be6b60d813c268e2ccda4bb32391290611a))
* **memory:** tighten audit report filters ([3b8bd8f](https://github.com/djm204/frankenbeast/commit/3b8bd8ff57bc1160052a6ffc60cad86082ebc719))
* **memory:** trust only central audit evidence ([d8ad387](https://github.com/djm204/frankenbeast/commit/d8ad387b7619a6d682dd2c13d4d2b8977109cc7e))
* pass sanitized post-hook memory audit context ([dc12671](https://github.com/djm204/frankenbeast/commit/dc126719199f6ecc4445782773cfc9d4bfbf548d))
* preserve Codex hooks backup on invalid JSON ([5656689](https://github.com/djm204/frankenbeast/commit/56566899ade1ad75cd0f37b9a4c9643d5c6df7ee))
* preserve invalid Codex hooks with recoverable backup ([1e5d4a1](https://github.com/djm204/frankenbeast/commit/1e5d4a123e26c81798051497882694cdb0449214))
* **security:** address Codex redaction findings ([#2583](https://github.com/djm204/frankenbeast/issues/2583)) ([e497d90](https://github.com/djm204/frankenbeast/commit/e497d904af9fb9ee81aa7a1edc94f53aeb4f6f7d))
* **security:** redact MCP handler exception details ([#3234](https://github.com/djm204/frankenbeast/issues/3234)) ([459985e](https://github.com/djm204/frankenbeast/commit/459985e0c98374bb423e63cc82f75905e816d739))
* **security:** redact tracked agent dispatch failures ([#3237](https://github.com/djm204/frankenbeast/issues/3237)) ([ac39f65](https://github.com/djm204/frankenbeast/commit/ac39f65941e7a2aaabc2a45ed724760e4800b000))


### Performance

* **mcp:** validate only audit trail tail on append ([#3244](https://github.com/djm204/frankenbeast/issues/3244)) ([05da76f](https://github.com/djm204/frankenbeast/commit/05da76f79218b9185fb1a586acc7118b0827d0e6))


### Miscellaneous

* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))
* **mcp:** reconcile observer redaction review fixes ([66f5339](https://github.com/djm204/frankenbeast/commit/66f53391e2265a7511a008595971c3a0d0f00dd0))
* release main ([d19cce0](https://github.com/djm204/frankenbeast/commit/d19cce08188e79330228990ea311d38b0a2218eb))
* release main ([1064be4](https://github.com/djm204/frankenbeast/commit/1064be4436a8cc085155bf56d87668832c9e55bc))
* release main ([750094b](https://github.com/djm204/frankenbeast/commit/750094bab0859c49829b4abe85013a5007fc272b))
* release main ([100e3a8](https://github.com/djm204/frankenbeast/commit/100e3a887b6fbd538e8a1b83f4e88ce4caf6c443))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2553](https://github.com/djm204/frankenbeast/issues/2553)) ([1ca33c2](https://github.com/djm204/frankenbeast/commit/1ca33c2aa6e68792886ef599d1ac35bebcc8e3c9))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3400](https://github.com/djm204/frankenbeast/issues/3400)) ([02fd894](https://github.com/djm204/frankenbeast/commit/02fd894bf6e7453e56d3446a73be277431ae6e12))
* release main ([#3407](https://github.com/djm204/frankenbeast/issues/3407)) ([c1cb208](https://github.com/djm204/frankenbeast/commit/c1cb208923376aef3eccd371b178352abb2a6c9c))
* release main ([#3521](https://github.com/djm204/frankenbeast/issues/3521)) ([a3c8c12](https://github.com/djm204/frankenbeast/commit/a3c8c121f2ff4b7563c88cce9b31d6163bba82b7))
* release main ([#3606](https://github.com/djm204/frankenbeast/issues/3606)) ([3d33c74](https://github.com/djm204/frankenbeast/commit/3d33c746587a861c97c1e140e93e536ec7d23f23))


### Documentation

* **memory:** update access audit inventory ([904dbe1](https://github.com/djm204/frankenbeast/commit/904dbe1e2023b744270694a595b3b07835c329d9))
* update mcp suite tool count ([30db821](https://github.com/djm204/frankenbeast/commit/30db8215c2bb5d965b4166e4d3e7eb71a8abb2af))


### Tests

* **mcp-suite:** align audit report hook expectation ([50cc028](https://github.com/djm204/frankenbeast/commit/50cc028af9de107c9100a577dfa0a6e9bddccd49))
* **mcp-suite:** align hook integration audit outcome ([5f20cc3](https://github.com/djm204/frankenbeast/commit/5f20cc391db4ff63f3febe3acec4c7500323eba0))
* **mcp-suite:** align tool registry count descriptions ([fb456da](https://github.com/djm204/frankenbeast/commit/fb456da130ff7e31b59c0ef7f1ca4c22364c30a2))
* **mcp-suite:** split integration vitest config ([#2599](https://github.com/djm204/frankenbeast/issues/2599)) ([410b92c](https://github.com/djm204/frankenbeast/commit/410b92c2b79b193f91ca9efa2348af561e0ddf64))
* **mcp:** expect trusted audit provenance metadata ([98cdccc](https://github.com/djm204/frankenbeast/commit/98cdcccdddc1196cb28146820df452d5571ee4ea))
* **memory:** cover cross-profile memory isolation ([#2574](https://github.com/djm204/frankenbeast/issues/2574)) ([daaacec](https://github.com/djm204/frankenbeast/commit/daaacecba86209552eeed73c38d667f36076cce3))
* **security:** add secret redaction regression suite ([#2575](https://github.com/djm204/frankenbeast/issues/2575)) ([04a708f](https://github.com/djm204/frankenbeast/commit/04a708fcf324599aab9c490718ecd625090482c8))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.16.1 to 0.17.0
    * @franken/brain bumped from 0.16.2 to 0.17.0
    * @franken/critique bumped from 0.10.4 to 0.11.0
    * @franken/governor bumped from 0.8.3 to 0.9.0
    * @franken/observer bumped from 0.11.5 to 0.12.0
    * @franken/orchestrator bumped from 0.57.2 to 0.58.0
    * @franken/planner bumped from 0.4.25 to 0.4.26
</details>

<details><summary>franken-observer: 0.12.0</summary>

## [0.12.0](https://github.com/djm204/frankenbeast/compare/franken-observer-v0.11.5...franken-observer-v0.12.0) (2026-07-23)


### Features

* **observer:** add decision outcome attribution ([#2412](https://github.com/djm204/frankenbeast/issues/2412)) ([081eba6](https://github.com/djm204/frankenbeast/commit/081eba6568b2ea05f64409bdd81308a262748756)), closes [#1693](https://github.com/djm204/frankenbeast/issues/1693)


### Bug Fixes

* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* **observer:** add idempotent webhook receipts ([#2350](https://github.com/djm204/frankenbeast/issues/2350)) ([b6ab9f1](https://github.com/djm204/frankenbeast/commit/b6ab9f145de48914adf7c318b05faa2f97235fb8))
* **observer:** add safe Tempo retry defaults ([#3647](https://github.com/djm204/frankenbeast/issues/3647)) ([0b1cc8a](https://github.com/djm204/frankenbeast/commit/0b1cc8ab79e7aab6a910281d34b9e7a767a29491))
* **observer:** batch SQLite adapter drains ([#3417](https://github.com/djm204/frankenbeast/issues/3417)) ([eeba02e](https://github.com/djm204/frankenbeast/commit/eeba02eff4cad61607956caf5b0655b782c1fed6))
* **observer:** bound HTTP exporter attempts ([#3630](https://github.com/djm204/frankenbeast/issues/3630)) ([aff2564](https://github.com/djm204/frankenbeast/commit/aff25646c2249da208c7fb01cd0d06814e0e7992))
* **observer:** bound MultiAdapter list fan-out ([#3597](https://github.com/djm204/frankenbeast/issues/3597)) ([c38773a](https://github.com/djm204/frankenbeast/commit/c38773a00d0631b8e1d539bb187e0b618716b8d8))
* **observer:** cap model attribution cardinality ([#3450](https://github.com/djm204/frankenbeast/issues/3450)) ([205d538](https://github.com/djm204/frankenbeast/commit/205d5383bbaac32ddb2d45c22778d00c6d5f1890))
* **observer:** expose unknown model cost attribution ([#3637](https://github.com/djm204/frankenbeast/issues/3637)) ([a917af3](https://github.com/djm204/frankenbeast/commit/a917af37b46d1bc39d4fcb4d9d01b3997f6445ba))
* **observer:** handle missing trace details ([#3274](https://github.com/djm204/frankenbeast/issues/3274)) ([8272ed0](https://github.com/djm204/frankenbeast/commit/8272ed0b44df8f61f85a4a746af7999efb589fc5))
* **observer:** harden trace server responses ([#3285](https://github.com/djm204/frankenbeast/issues/3285)) ([5399908](https://github.com/djm204/frankenbeast/commit/539990832073b5540134f14ec301311f5fba77c2))
* **observer:** index ordered SQLite trace queries ([#3430](https://github.com/djm204/frankenbeast/issues/3430)) ([e79d239](https://github.com/djm204/frankenbeast/commit/e79d239a1fc0dae51ea6320f875ff21ffcab4180))
* **observer:** make SQLite worker shutdown non-blocking ([#3623](https://github.com/djm204/frankenbeast/issues/3623)) ([d16415b](https://github.com/djm204/frankenbeast/commit/d16415bcc35516ff3d219f18c7b0f1a9f5a68015))
* **observer:** make trace rows keyboard accessible ([#3394](https://github.com/djm204/frankenbeast/issues/3394)) ([b806101](https://github.com/djm204/frankenbeast/commit/b8061014299210ab688e84a8280612e3227f1c7c))
* **observer:** multiply token counts before rate scaling ([#3405](https://github.com/djm204/frankenbeast/issues/3405)) ([3e9178b](https://github.com/djm204/frankenbeast/commit/3e9178b048893c3cc370365fc90c376210cae17c))
* **observer:** offload SQLite operations to worker ([#3444](https://github.com/djm204/frankenbeast/issues/3444)) ([c527b11](https://github.com/djm204/frankenbeast/commit/c527b117a9d4744029172b87e8e77e47760a59cc))
* **observer:** redact credentials from OTEL exports ([#3626](https://github.com/djm204/frankenbeast/issues/3626)) ([f6019ee](https://github.com/djm204/frankenbeast/commit/f6019ee8c864a724421c0ebbc4938e421f582408))
* **observer:** reject unsafe webhook retry counts ([#3645](https://github.com/djm204/frankenbeast/issues/3645)) ([442d763](https://github.com/djm204/frankenbeast/commit/442d763eaaa9cd607b612dc91f07e81e8961bc93))
* **observer:** reset trace server state after stop ([#3601](https://github.com/djm204/frankenbeast/issues/3601)) ([cbc1b5c](https://github.com/djm204/frankenbeast/commit/cbc1b5ca2dfa67c5f91a6a25a5db30057ca6ed83))
* **observer:** retry sqlite lock failures ([7723f66](https://github.com/djm204/frankenbeast/commit/7723f66f67591e6e3fafe3af97bca6a53fb2c77b))
* **observer:** stabilize cost accumulation ([#3432](https://github.com/djm204/frankenbeast/issues/3432)) ([ebf0b8b](https://github.com/djm204/frankenbeast/commit/ebf0b8b9b2e89b41c5a436d1a9930bccfb9ecf7c))
* **observer:** surface periodic batch drain failures ([#3610](https://github.com/djm204/frankenbeast/issues/3610)) ([6151f31](https://github.com/djm204/frankenbeast/commit/6151f316ab1c85df1e8a1874029a99a5134efcf0))
* **observer:** unref BatchAdapter flush interval timers ([7f5354c](https://github.com/djm204/frankenbeast/commit/7f5354cec9f5ff5392dfe6703d538a4207c0f229)), closes [#2030](https://github.com/djm204/frankenbeast/issues/2030)
* **observer:** use monotonic span durations ([#3562](https://github.com/djm204/frankenbeast/issues/3562)) ([a99d66c](https://github.com/djm204/frankenbeast/commit/a99d66c6c060c8186c48445f9efc59b35a871eb7))
* **observer:** validate total cost token aggregates ([#3643](https://github.com/djm204/frankenbeast/issues/3643)) ([18e4fd7](https://github.com/djm204/frankenbeast/commit/18e4fd71c613633364b7d4a113def38337be24d1))


### Performance

* **observer:** avoid repeated SQLite schema DDL ([#3411](https://github.com/djm204/frankenbeast/issues/3411)) ([5b7479c](https://github.com/djm204/frankenbeast/commit/5b7479ccbee4879f97493ad7df441e63e061793d))
* **observer:** cache loop detector comparisons ([#3408](https://github.com/djm204/frankenbeast/issues/3408)) ([5e9b678](https://github.com/djm204/frankenbeast/commit/5e9b678d2f3e038ab2904c6821ec77230cfaf8ca))
* **observer:** pre-index allowed tool parameters ([#3410](https://github.com/djm204/frankenbeast/issues/3410)) ([be3c7f2](https://github.com/djm204/frankenbeast/commit/be3c7f28ef7d0ce0d5bec96f47d230cc37247cdd))


### Miscellaneous

* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))
* **mcp:** reconcile observer redaction review fixes ([66f5339](https://github.com/djm204/frankenbeast/commit/66f53391e2265a7511a008595971c3a0d0f00dd0))
* release main ([d19cce0](https://github.com/djm204/frankenbeast/commit/d19cce08188e79330228990ea311d38b0a2218eb))
* release main ([1064be4](https://github.com/djm204/frankenbeast/commit/1064be4436a8cc085155bf56d87668832c9e55bc))
* release main ([750094b](https://github.com/djm204/frankenbeast/commit/750094bab0859c49829b4abe85013a5007fc272b))
* release main ([100e3a8](https://github.com/djm204/frankenbeast/commit/100e3a887b6fbd538e8a1b83f4e88ce4caf6c443))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3407](https://github.com/djm204/frankenbeast/issues/3407)) ([c1cb208](https://github.com/djm204/frankenbeast/commit/c1cb208923376aef3eccd371b178352abb2a6c9c))
* release main ([#3521](https://github.com/djm204/frankenbeast/issues/3521)) ([a3c8c12](https://github.com/djm204/frankenbeast/commit/a3c8c121f2ff4b7563c88cce9b31d6163bba82b7))
* release main ([#3606](https://github.com/djm204/frankenbeast/issues/3606)) ([3d33c74](https://github.com/djm204/frankenbeast/commit/3d33c746587a861c97c1e140e93e536ec7d23f23))
* **types:** enforce workspace strictness ([#3458](https://github.com/djm204/frankenbeast/issues/3458)) ([503b644](https://github.com/djm204/frankenbeast/commit/503b6448f05f74ccd28493fcf8f46a23ba4d80aa))


### Documentation

* **observer:** clarify trace server bind security ([#3289](https://github.com/djm204/frankenbeast/issues/3289)) ([f1da921](https://github.com/djm204/frankenbeast/commit/f1da9210a57f8c4c489cf17fb5d63572c4add86a))
* **observer:** fix SamplingAdapter SQLite example ([df2e92a](https://github.com/djm204/frankenbeast/commit/df2e92a50815a99a1dca64d72facaf52920c2935)), closes [#2628](https://github.com/djm204/frankenbeast/issues/2628)


### Tests

* **observer:** clean replay temp fixtures ([9fcb921](https://github.com/djm204/frankenbeast/commit/9fcb921594dd6fcdd4d90dee718a1a97ca8dd94a)), closes [#2067](https://github.com/djm204/frankenbeast/issues/2067)
* **observer:** cover invalid CircuitBreaker budgets ([d76ddd5](https://github.com/djm204/frankenbeast/commit/d76ddd518f964e3cce57f3b759f72e79af48e35c)), closes [#1965](https://github.com/djm204/frankenbeast/issues/1965)
* **observer:** cover invalid traceparent version fields ([de157da](https://github.com/djm204/frankenbeast/commit/de157dabb583a1d5b7688f56f7bfa5320505f3a5)), closes [#2055](https://github.com/djm204/frankenbeast/issues/2055)
* **observer:** focus TraceServer client script coverage ([acc4341](https://github.com/djm204/frankenbeast/commit/acc434169c0cc156e6bec90fe6e6ccf0a5c3114a))
* **security:** add secret redaction regression suite ([#2575](https://github.com/djm204/frankenbeast/issues/2575)) ([04a708f](https://github.com/djm204/frankenbeast/commit/04a708fcf324599aab9c490718ecd625090482c8))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.16.1 to 0.17.0
</details>

<details><summary>@franken/orchestrator: 0.58.0</summary>

## [0.58.0](https://github.com/djm204/frankenbeast/compare/@franken/orchestrator-v0.57.2...@franken/orchestrator-v0.58.0) (2026-07-23)


### Features

* **availability:** add read-only degraded mode ([#2402](https://github.com/djm204/frankenbeast/issues/2402)) ([4dcd49b](https://github.com/djm204/frankenbeast/commit/4dcd49b14a856330c6ae287124c04eb2928b4c05))
* **availability:** add service health aggregator ([#2582](https://github.com/djm204/frankenbeast/issues/2582)) ([3e6f9f9](https://github.com/djm204/frankenbeast/commit/3e6f9f93699d3565727465f5f2172db18ff9b17a))
* **availability:** expose SLO dashboard ([#2580](https://github.com/djm204/frankenbeast/issues/2580)) ([6e1918c](https://github.com/djm204/frankenbeast/commit/6e1918cffe5ffb10a0acfc72f08d118836172864))
* **availability:** reserve urgent agent capacity ([70cd020](https://github.com/djm204/frankenbeast/commit/70cd020b52cd3418fd61d00f0d29c8fe49b319ef))
* **beasts:** add maintenance dispatch guardrails ([#2400](https://github.com/djm204/frankenbeast/issues/2400)) ([f50e966](https://github.com/djm204/frankenbeast/commit/f50e966246a1a05902fd0054ffa79bb59ffe35e7))
* **cli:** add slash command tab completion ([#3542](https://github.com/djm204/frankenbeast/issues/3542)) ([04b77fa](https://github.com/djm204/frankenbeast/commit/04b77fafe02e82f0d1167f2ea9b4f2b92d4a37c1))
* **cli:** agent-style terminal rendering for fbeast chat ([#3427](https://github.com/djm204/frankenbeast/issues/3427)) ([d8f0a55](https://github.com/djm204/frankenbeast/commit/d8f0a55f92b4af2a89a3945c2ef9b86f51ba6fe7))
* **cli:** box the chat input, purple/green theme, real usage stats + provider self-awareness ([#3505](https://github.com/djm204/frankenbeast/issues/3505)) ([32d11ff](https://github.com/djm204/frankenbeast/commit/32d11ff9bc8a263c4083e75d0961c35a8c691bd0))
* **cli:** simplify startup banner ([40f680d](https://github.com/djm204/frankenbeast/commit/40f680d8001faff993321b06d2191ef2212e5c27))
* **dashboard:** surface dependency availability ([#2347](https://github.com/djm204/frankenbeast/issues/2347)) ([0298dd5](https://github.com/djm204/frankenbeast/commit/0298dd58133a30015f3487893d64ef0d3d02dbb7))
* **dr:** add point-in-time incident export ([#2551](https://github.com/djm204/frankenbeast/issues/2551)) ([38197b9](https://github.com/djm204/frankenbeast/commit/38197b9e2c6c14516a38270c3c6d63d31afc880e))
* **dr:** add state snapshot diff tool ([#2403](https://github.com/djm204/frankenbeast/issues/2403)) ([f80c473](https://github.com/djm204/frankenbeast/commit/f80c4738c55fa0061faf153fa92b81d2cb9939ed))
* **governor:** add policy-as-code engine and gate PrCreator git pushes ([#2661](https://github.com/djm204/frankenbeast/issues/2661)) ([ebb2b91](https://github.com/djm204/frankenbeast/commit/ebb2b91b0f94c09159fc7f119f782a017517631c))
* **memory:** add duplicate memory report ([#2328](https://github.com/djm204/frankenbeast/issues/2328)) ([20325c6](https://github.com/djm204/frankenbeast/commit/20325c65e95de587bfda6440899493b61aaaa885))
* **memory:** add memory access audit trail ([#2317](https://github.com/djm204/frankenbeast/issues/2317)) ([ef889da](https://github.com/djm204/frankenbeast/commit/ef889dae092d996a6ca463e5abcaf5ed4d296158))
* **memory:** add project-scoped snapshot builder ([#2343](https://github.com/djm204/frankenbeast/issues/2343)) ([8d1142b](https://github.com/djm204/frankenbeast/commit/8d1142b32eb4c65ea14c5bb41f5ef82eaa0b1a4f)), closes [#1758](https://github.com/djm204/frankenbeast/issues/1758)
* **memory:** add provenance confidence metadata ([#2552](https://github.com/djm204/frankenbeast/issues/2552)) ([835816b](https://github.com/djm204/frankenbeast/commit/835816bea0ac0149c7874b5b441bb979f8e044f5))
* **memory:** add redacted project memory export ([#2321](https://github.com/djm204/frankenbeast/issues/2321)) ([6a7b8bb](https://github.com/djm204/frankenbeast/commit/6a7b8bb1dfbbc10282e7cd90ac34936a06943d15))
* **onboarding:** add agent handoff template validator ([#2331](https://github.com/djm204/frankenbeast/issues/2331)) ([11bf733](https://github.com/djm204/frankenbeast/commit/11bf733e3a2c93551bcfd720a2b24827525479af))
* **orchestrator:** add accessible plain CLI output ([#3425](https://github.com/djm204/frankenbeast/issues/3425)) ([2e4f947](https://github.com/djm204/frankenbeast/commit/2e4f947d372afe6146143de29d7819bd518f3201))
* **orchestrator:** add automation dead-letter queue ([#2344](https://github.com/djm204/frankenbeast/issues/2344)) ([3a68010](https://github.com/djm204/frankenbeast/commit/3a680103198cdcb5b7341c61ce362a7f0b18074e))
* **orchestrator:** add DR process cleanup plan ([#2397](https://github.com/djm204/frankenbeast/issues/2397)) ([105e3fb](https://github.com/djm204/frankenbeast/commit/105e3fb20790dd9855ba735fec1e68a2b9aa23fe))
* **orchestrator:** add queue priority aging ([#2351](https://github.com/djm204/frankenbeast/issues/2351)) ([69d30c2](https://github.com/djm204/frankenbeast/commit/69d30c2c37d50675bc1dd23bc29d3e085e896360)), closes [#1748](https://github.com/djm204/frankenbeast/issues/1748)
* **orchestrator:** bound tracked-agent creation payloads ([#3214](https://github.com/djm204/frankenbeast/issues/3214)) ([#3462](https://github.com/djm204/frankenbeast/issues/3462)) ([1bb0115](https://github.com/djm204/frankenbeast/commit/1bb0115de77fd7b4173a61ea9bd96e0edc2aef58))
* **orchestrator:** show stage-aware planning progress ([#3371](https://github.com/djm204/frankenbeast/issues/3371)) ([e99dcd0](https://github.com/djm204/frankenbeast/commit/e99dcd0de708b2e335f9496f8fa4df77eec9fbd5))
* **stability:** add stuck-run watchdog hints ([#2550](https://github.com/djm204/frankenbeast/issues/2550)) ([52f064a](https://github.com/djm204/frankenbeast/commit/52f064af0a5dc31b9ceccf3643c79df66094667f))


### Bug Fixes

* **beasts:** bound run log responses ([#3415](https://github.com/djm204/frankenbeast/issues/3415)) ([01cdb22](https://github.com/djm204/frankenbeast/commit/01cdb22dfa21d791df05f4b46f1f076892c4e819))
* **beasts:** describe design document file prompt ([#3469](https://github.com/djm204/frankenbeast/issues/3469)) ([697151c](https://github.com/djm204/frankenbeast/commit/697151cd5fc6e7601f9dbb9e6eaf207832278720))
* **beasts:** paginate run event API ([#3419](https://github.com/djm204/frankenbeast/issues/3419)) ([396a863](https://github.com/djm204/frankenbeast/commit/396a863b55ecf308968dd82fee3dae105bf1787a))
* **brain:** expose episodic snapshot truncation ([#3575](https://github.com/djm204/frankenbeast/issues/3575)) ([97bcc6c](https://github.com/djm204/frankenbeast/commit/97bcc6c0f3ecfdc586efbe06ad1a0360461227b0))
* **chat:** bound message content length ([#3381](https://github.com/djm204/frankenbeast/issues/3381)) ([1d4201b](https://github.com/djm204/frankenbeast/commit/1d4201b37f7ec35c6503f922fad2a0c5de8fb43e))
* **cli:** preserve fatal error stack traces ([#3535](https://github.com/djm204/frankenbeast/issues/3535)) ([4e398b5](https://github.com/djm204/frankenbeast/commit/4e398b5db316827e8609a6bd9cdfdfcac046ad49))
* **cli:** reject zero port values ([94c26b6](https://github.com/djm204/frankenbeast/commit/94c26b6283c4918490ced9b355840fc0b6f00531))
* **comms:** bound outbound adapter fetches ([#3468](https://github.com/djm204/frankenbeast/issues/3468)) ([1ab6e81](https://github.com/djm204/frankenbeast/commit/1ab6e8199b856ac0241a21f2ff57643b9ec802f1))
* **config:** default chat to Codex provider ([#3424](https://github.com/djm204/frankenbeast/issues/3424)) ([462b7df](https://github.com/djm204/frankenbeast/commit/462b7dfa4bc47d701875d4d0fd8cfcc07f790063))
* **critique:** forward reflection max tokens ([891d990](https://github.com/djm204/frankenbeast/commit/891d990f24fed66da5b51f66052e0a60bc71af89)), closes [#2045](https://github.com/djm204/frankenbeast/issues/2045)
* **dr:** close restore backup codex followups ([#2611](https://github.com/djm204/frankenbeast/issues/2611)) ([739f30d](https://github.com/djm204/frankenbeast/commit/739f30d8a9a3845f0fbbce1e44ea1e3a8bd6f87d))
* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* **observer:** make SQLite worker shutdown non-blocking ([#3623](https://github.com/djm204/frankenbeast/issues/3623)) ([d16415b](https://github.com/djm204/frankenbeast/commit/d16415bcc35516ff3d219f18c7b0f1a9f5a68015))
* **orchestrator:** add crash-only worker restart contract ([#2560](https://github.com/djm204/frankenbeast/issues/2560)) ([ed23c8d](https://github.com/djm204/frankenbeast/commit/ed23c8ded62c71ffb79ad73a332644751bf039b6))
* **orchestrator:** add heartbeat monotonicity diagnostics ([#2349](https://github.com/djm204/frankenbeast/issues/2349)) ([2abc60e](https://github.com/djm204/frankenbeast/commit/2abc60ed68766cc9e414b94fc3432125a29a5923))
* **orchestrator:** bound beast run log growth ([#2404](https://github.com/djm204/frankenbeast/issues/2404)) ([c763d97](https://github.com/djm204/frankenbeast/commit/c763d97e31970a699353af6eab7ca47b75cd0f39))
* **orchestrator:** bound early process output buffers ([#3635](https://github.com/djm204/frankenbeast/issues/3635)) ([970eedb](https://github.com/djm204/frankenbeast/commit/970eedb08675ec65532ad479a8353521b76ccb4f))
* **orchestrator:** bound hook output stripping ([#3258](https://github.com/djm204/frankenbeast/issues/3258)) ([84b4f9d](https://github.com/djm204/frankenbeast/commit/84b4f9d3a062de874ddcdeeb4a73a17c4478a57d))
* **orchestrator:** bound MCP health probes ([#3305](https://github.com/djm204/frankenbeast/issues/3305)) ([7bf1e22](https://github.com/djm204/frankenbeast/commit/7bf1e224c8010a36f99e6bcb12cf60b68514998a))
* **orchestrator:** bound rate-limit stderr warnings ([#3615](https://github.com/djm204/frankenbeast/issues/3615)) ([d1c24f7](https://github.com/djm204/frankenbeast/commit/d1c24f70e2a0e88ca031c92a1af742376d1d2e29))
* **orchestrator:** bound reflected request ids ([#3284](https://github.com/djm204/frankenbeast/issues/3284)) ([a520146](https://github.com/djm204/frankenbeast/commit/a520146f363f412250811161575a97ea609ce21d))
* **orchestrator:** bound skill context writes ([#3613](https://github.com/djm204/frankenbeast/issues/3613)) ([f9c010c](https://github.com/djm204/frankenbeast/commit/f9c010c9fb00a3ce2829063e91afd5ef96cec18e))
* **orchestrator:** bound stream JSON text extraction ([#3574](https://github.com/djm204/frankenbeast/issues/3574)) ([e952b65](https://github.com/djm204/frankenbeast/commit/e952b65aac34461468352bd2e477fbf3c261618b))
* **orchestrator:** cap Gemini retry delays ([#3257](https://github.com/djm204/frankenbeast/issues/3257)) ([cd676f2](https://github.com/djm204/frankenbeast/commit/cd676f29a5bf50608f18b45822e89a241ab9238d))
* **orchestrator:** clamp parsed rate-limit sleeps ([#3264](https://github.com/djm204/frankenbeast/issues/3264)) ([728f0c4](https://github.com/djm204/frankenbeast/commit/728f0c41fb0af63906441f8dc0681f2b1bbb580c)), closes [#3172](https://github.com/djm204/frankenbeast/issues/3172)
* **orchestrator:** clarify functional heartbeat wiring ([#3526](https://github.com/djm204/frankenbeast/issues/3526)) ([5a096ac](https://github.com/djm204/frankenbeast/commit/5a096ac3ac291c9c99ae8efc15fc5e226a6325df))
* **orchestrator:** clean abandoned beast worktrees ([fc24446](https://github.com/djm204/frankenbeast/commit/fc2444614a7add519d4edaa0be22ea3744184e76)), closes [#1744](https://github.com/djm204/frankenbeast/issues/1744)
* **orchestrator:** close session readline interface ([#3547](https://github.com/djm204/frankenbeast/issues/3547)) ([abae4d6](https://github.com/djm204/frankenbeast/commit/abae4d640d5bcaa77e339319e4175f70f06a04f9))
* **orchestrator:** contain Beast log paths ([#3279](https://github.com/djm204/frankenbeast/issues/3279)) ([5ea4a23](https://github.com/djm204/frankenbeast/commit/5ea4a23eb2ec2a8fde4463202159ea324bd128ec))
* **orchestrator:** end dashboard stream on write failure ([#3406](https://github.com/djm204/frankenbeast/issues/3406)) ([87ebd81](https://github.com/djm204/frankenbeast/commit/87ebd8128743b15ac3dbeea2fcb8be53e512e05e))
* **orchestrator:** guard Gemini prompt file writes ([#3567](https://github.com/djm204/frankenbeast/issues/3567)) ([b1ba811](https://github.com/djm204/frankenbeast/commit/b1ba811771702d81f0d28fdf233230305f64a51d))
* **orchestrator:** handle CLI stdin errors ([#3563](https://github.com/djm204/frankenbeast/issues/3563)) ([5cfa883](https://github.com/djm204/frankenbeast/commit/5cfa8830b7496997f76dd699527612e122f3d952))
* **orchestrator:** harden beast event fallback cloning ([#2603](https://github.com/djm204/frankenbeast/issues/2603)) ([afb5e55](https://github.com/djm204/frankenbeast/commit/afb5e551dcbd54a1b924968fd7ab484da5b00292))
* **orchestrator:** index beast run attempts ([#3454](https://github.com/djm204/frankenbeast/issues/3454)) ([498099d](https://github.com/djm204/frankenbeast/commit/498099db97b072637f7faf96b4e10d78f6b922a8))
* **orchestrator:** isolate cached Claude sessions ([#3367](https://github.com/djm204/frankenbeast/issues/3367)) ([89dc035](https://github.com/djm204/frankenbeast/commit/89dc03518413ada97adf26e4f5297b8becbdcf8d))
* **orchestrator:** isolate managed service environments ([#3296](https://github.com/djm204/frankenbeast/issues/3296)) ([24ab0b6](https://github.com/djm204/frankenbeast/commit/24ab0b6b91ed9f7616d1ab8a9f17922c1a6291f1))
* **orchestrator:** make chat session writes durable ([#3550](https://github.com/djm204/frankenbeast/issues/3550)) ([59bdf54](https://github.com/djm204/frankenbeast/commit/59bdf5483bfcd84d53cdcc31659a84925223adda))
* **orchestrator:** make chunk rewrites non-destructive ([#2592](https://github.com/djm204/frankenbeast/issues/2592)) ([b9cefad](https://github.com/djm204/frankenbeast/commit/b9cefad93e9c7c240d2096638547584bdd844344))
* **orchestrator:** make kanban updates idempotent ([#2549](https://github.com/djm204/frankenbeast/issues/2549)) ([9523167](https://github.com/djm204/frankenbeast/commit/95231673319fca0ebbd9a94dd3d1b42d3ce715ce))
* **orchestrator:** normalize provider stream events ([#3366](https://github.com/djm204/frankenbeast/issues/3366)) ([fe754fc](https://github.com/djm204/frankenbeast/commit/fe754fc08c5350924fdb90415696bbb3828bf956))
* **orchestrator:** omit comms provider error bodies ([#3638](https://github.com/djm204/frankenbeast/issues/3638)) ([e9b6703](https://github.com/djm204/frankenbeast/commit/e9b6703ff26ef9461eca04deee7e9c38c4674a83))
* **orchestrator:** paginate Beast run listings ([#3445](https://github.com/djm204/frankenbeast/issues/3445)) ([319806a](https://github.com/djm204/frankenbeast/commit/319806a035380cbce53e04c8e7051e3422bf621f))
* **orchestrator:** paginate tracked agent listings ([#3418](https://github.com/djm204/frankenbeast/issues/3418)) ([98cf74b](https://github.com/djm204/frankenbeast/commit/98cf74b1dcea83424df14a4a6e21e74ec21e64db))
* **orchestrator:** persist skill toggles atomically ([#3303](https://github.com/djm204/frankenbeast/issues/3303)) ([6c24a5b](https://github.com/djm204/frankenbeast/commit/6c24a5b7af48e9f91ba065fd3f27765f62e1a7af))
* **orchestrator:** preserve comms transports in secret init ([#2562](https://github.com/djm204/frankenbeast/issues/2562)) ([00f3d12](https://github.com/djm204/frankenbeast/commit/00f3d12d0cbb60972a49f77f4d8f122f88189425))
* **orchestrator:** preserve daemon interview validation ([a84b88c](https://github.com/djm204/frankenbeast/commit/a84b88c891fff76e9ac4416a6a872a82cd4269ef))
* **orchestrator:** prevent duplicate terminal input ([#3436](https://github.com/djm204/frankenbeast/issues/3436)) ([fd4517b](https://github.com/djm204/frankenbeast/commit/fd4517b0bd1e365942b6e1dd55cf31397fb004e7)), closes [#3364](https://github.com/djm204/frankenbeast/issues/3364)
* **orchestrator:** propagate governor approval tokens ([#3555](https://github.com/djm204/frankenbeast/issues/3555)) ([c293778](https://github.com/djm204/frankenbeast/commit/c293778138a820432cd0d81e5c153f5b033afa18))
* **orchestrator:** protect unauthenticated dashboard streams ([#3389](https://github.com/djm204/frankenbeast/issues/3389)) ([23e4579](https://github.com/djm204/frankenbeast/commit/23e4579ae0064186e8db6490b9b20a46d497fa3f))
* **orchestrator:** quarantine malformed init config fallback ([#2606](https://github.com/djm204/frankenbeast/issues/2606)) ([fcc3f5d](https://github.com/djm204/frankenbeast/commit/fcc3f5dbfa2f0d2b8b0f8640d05e95dbbd6b86d7))
* **orchestrator:** rate-limit tracked-agent lifecycle actions ([#2651](https://github.com/djm204/frankenbeast/issues/2651)) ([ceabbf9](https://github.com/djm204/frankenbeast/commit/ceabbf94074381a7d9b7d1b1fa8119e3c765015e))
* **orchestrator:** reconcile beast queue on restart ([#2406](https://github.com/djm204/frankenbeast/issues/2406)) ([5f3077c](https://github.com/djm204/frankenbeast/commit/5f3077c6c401d032610fe4cff69fb0a4a888d1e2))
* **orchestrator:** recover corrupt beast JSON lists ([#3395](https://github.com/djm204/frankenbeast/issues/3395)) ([be0caa7](https://github.com/djm204/frankenbeast/commit/be0caa78b690d569f76638557c486a4b5577946f))
* **orchestrator:** recover local Codex chat startup ([#3412](https://github.com/djm204/frankenbeast/issues/3412)) ([90b376c](https://github.com/djm204/frankenbeast/commit/90b376c4fc0812ab3adad4274e3350bb5f0d5a26))
* **orchestrator:** redact Beast host execution paths ([#3510](https://github.com/djm204/frankenbeast/issues/3510)) ([8cd618a](https://github.com/djm204/frankenbeast/commit/8cd618ab0f2c29d88b423120ca02c3bc4c473bab))
* **orchestrator:** reject invalid numeric config env vars ([315c27c](https://github.com/djm204/frankenbeast/commit/315c27c1d608a0f6dd8d0a9d41d79e25cabcec54)), closes [#2063](https://github.com/djm204/frankenbeast/issues/2063)
* **orchestrator:** reject Slack sends without routing ([#3465](https://github.com/djm204/frankenbeast/issues/3465)) ([82b3618](https://github.com/djm204/frankenbeast/commit/82b36180172ce6f49ce2389a40fb4c614f72f2ee))
* **orchestrator:** reject unroutable Discord sends ([#3467](https://github.com/djm204/frankenbeast/issues/3467)) ([3a64587](https://github.com/djm204/frankenbeast/commit/3a645871fa76e35ea50eead266f6e95babc531ee))
* **orchestrator:** reject unroutable Telegram sends ([#3459](https://github.com/djm204/frankenbeast/issues/3459)) ([13d2ef8](https://github.com/djm204/frankenbeast/commit/13d2ef8fbeb2c3efa37dd186615a5cb848eccd7e))
* **orchestrator:** reject WhatsApp sends without recipient ([#3460](https://github.com/djm204/frankenbeast/issues/3460)) ([0beb1a0](https://github.com/djm204/frankenbeast/commit/0beb1a07efdb3d1d4259de8e00a0f2b589c5eea8))
* **orchestrator:** remove stale banner dependencies ([#3383](https://github.com/djm204/frankenbeast/issues/3383)) ([84bcac1](https://github.com/djm204/frankenbeast/commit/84bcac15c7e64204b244b983a0a77e55204d3e83))
* **orchestrator:** require MCP handshake for healthy skills ([#3256](https://github.com/djm204/frankenbeast/issues/3256)) ([a119d95](https://github.com/djm204/frankenbeast/commit/a119d955f3c47b09d4ada73eec04951f47e5b6df))
* **orchestrator:** resolve late restart contract review ([#2616](https://github.com/djm204/frankenbeast/issues/2616)) ([eed99f4](https://github.com/djm204/frankenbeast/commit/eed99f4e07e868db87a3a405fd40a1595cc56524))
* **orchestrator:** reuse network route supervisor ([#3447](https://github.com/djm204/frankenbeast/issues/3447)) ([d6c875e](https://github.com/djm204/frankenbeast/commit/d6c875eb88538704eb6c4565b5a24e72e6da5fa3))
* **orchestrator:** scan skill responses for injection ([#3429](https://github.com/djm204/frankenbeast/issues/3429)) ([c41e2fe](https://github.com/djm204/frankenbeast/commit/c41e2fee74c4b05651416acc1b11935cf01f9622))
* **orchestrator:** serialize beast event sequence allocation ([#3434](https://github.com/djm204/frankenbeast/issues/3434)) ([0c3d4ad](https://github.com/djm204/frankenbeast/commit/0c3d4ada20cb6ecd930132249ec5d3e458e282f7))
* **orchestrator:** serialize chat session writes ([#2617](https://github.com/djm204/frankenbeast/issues/2617)) ([5e234b8](https://github.com/djm204/frankenbeast/commit/5e234b8102a5a1e8bf7215a1e1d29bd0f3e7030c))
* **orchestrator:** simplify cleanupBuild removal counting ([#3311](https://github.com/djm204/frankenbeast/issues/3311)) ([ce2d362](https://github.com/djm204/frankenbeast/commit/ce2d36299868640943c06126f5ffce9c94477455))
* **orchestrator:** skip malformed skill manifests ([#3397](https://github.com/djm204/frankenbeast/issues/3397)) ([013f998](https://github.com/djm204/frankenbeast/commit/013f99884835a9831e2de5f999a9935fbaa28fc7))
* **orchestrator:** strip proxy operator credentials ([#3295](https://github.com/djm204/frankenbeast/issues/3295)) ([b63c31d](https://github.com/djm204/frankenbeast/commit/b63c31d73f157eef2046a5a59cecd528e49bc785))
* **orchestrator:** surface skill health probe diagnostics ([#3398](https://github.com/djm204/frankenbeast/issues/3398)) ([513351f](https://github.com/djm204/frankenbeast/commit/513351f9e8a9dd63ffff27d37b05fd8a4202d9e7))
* **orchestrator:** update Codex workspace sandbox args ([#3372](https://github.com/djm204/frankenbeast/issues/3372)) ([6dbe101](https://github.com/djm204/frankenbeast/commit/6dbe101caa2c3980502e68cef8a71dee18c395a3))
* **orchestrator:** validate beast rate limiter options ([e5be73b](https://github.com/djm204/frankenbeast/commit/e5be73b7e5a5c87bbac9cafaffde7d946ea6c0d1))
* **orchestrator:** validate cached llm entries on read ([38a25ed](https://github.com/djm204/frankenbeast/commit/38a25ed3be5c8f186876f3156bcf89d108fcf0b1))
* **orchestrator:** validate comms inbound payloads ([#3509](https://github.com/djm204/frankenbeast/issues/3509)) ([bbc2d24](https://github.com/djm204/frankenbeast/commit/bbc2d242c5a1d6c4ec4707628bb0dc24b509b0cb))
* **orchestrator:** validate decrypted local secrets ([#3620](https://github.com/djm204/frankenbeast/issues/3620)) ([368b96d](https://github.com/djm204/frankenbeast/commit/368b96d6a66264cbb9ed393c71d50c312eab3404))
* **orchestrator:** validate provider session records ([#3554](https://github.com/djm204/frankenbeast/issues/3554)) ([7a3c7b8](https://github.com/djm204/frankenbeast/commit/7a3c7b8460a850d50dc43d41519a9e778a21093d))
* **orchestrator:** validate signed token expiry metadata ([#3628](https://github.com/djm204/frankenbeast/issues/3628)) ([3b95908](https://github.com/djm204/frankenbeast/commit/3b959086e1f13a3c499a08a765c3faefade47229))
* **orchestrator:** validate skill install request bodies ([#3614](https://github.com/djm204/frankenbeast/issues/3614)) ([8d0026b](https://github.com/djm204/frankenbeast/commit/8d0026bace09ab7896b9dd06cd1cd70e0b51e5e4))
* **orchestrator:** verify recovered process identity ([#3441](https://github.com/djm204/frankenbeast/issues/3441)) ([d70b92e](https://github.com/djm204/frankenbeast/commit/d70b92eaff32a670546bee8463038685260ea505))
* **orchestrator:** verify signed runtime configs ([#2612](https://github.com/djm204/frankenbeast/issues/2612)) ([f9cadc3](https://github.com/djm204/frankenbeast/commit/f9cadc3644844ec1eb32e007054589be1012a0e5))
* **orchestrator:** verify webhook signatures over raw bytes ([#3548](https://github.com/djm204/frankenbeast/issues/3548)) ([e87c03b](https://github.com/djm204/frankenbeast/commit/e87c03b61eaba5ffb2a618862432ccc2dcf2cc3a))
* **orchestrator:** write cache JSON atomically ([#2559](https://github.com/djm204/frankenbeast/issues/2559)) ([0065ec0](https://github.com/djm204/frankenbeast/commit/0065ec086aeaf491f597695e37bce0794d10fbf1))
* **orchestrator:** write local secrets atomically ([#3631](https://github.com/djm204/frankenbeast/issues/3631)) ([0c04dc5](https://github.com/djm204/frankenbeast/commit/0c04dc5d328fc00a7bcc49402727313d1c789867))
* **planning:** persist live plan cycle progress ([#3368](https://github.com/djm204/frankenbeast/issues/3368)) ([3208efb](https://github.com/djm204/frankenbeast/commit/3208efb6c8b8679946e8f0e5c380fb2f76bf81ca))
* **security:** audit HITL approval replay ([#2576](https://github.com/djm204/frankenbeast/issues/2576)) ([c89ea75](https://github.com/djm204/frankenbeast/commit/c89ea75593d8b75d1c787d978d1aedac15624f7b))
* **security:** bound profile update request bodies ([#3508](https://github.com/djm204/frankenbeast/issues/3508)) ([8705537](https://github.com/djm204/frankenbeast/commit/870553719732e60e04e24a5ae1e7c37565534731))
* **security:** enforce role tool manifests ([#2573](https://github.com/djm204/frankenbeast/issues/2573)) ([1d7e7c3](https://github.com/djm204/frankenbeast/commit/1d7e7c3b7c9255dd95d21863bb43790bc5a38e3d))
* **security:** fail closed on approval audit errors ([#3437](https://github.com/djm204/frankenbeast/issues/3437)) ([2b29732](https://github.com/djm204/frankenbeast/commit/2b29732d5fbd961ef4d3d96970921c640533db73))
* **security:** isolate concurrent SSE ticket cookies ([#3387](https://github.com/djm204/frankenbeast/issues/3387)) ([d826141](https://github.com/djm204/frankenbeast/commit/d82614172c45f3da9b8a6353fc198b5e55c18419))
* **security:** keep SSE tickets out of request URLs ([#3385](https://github.com/djm204/frankenbeast/issues/3385)) ([819a0f8](https://github.com/djm204/frankenbeast/commit/819a0f8d3726049a517d0eb02985ff89e74116e9))
* **security:** prevent secret exposure in stores ([2640f76](https://github.com/djm204/frankenbeast/commit/2640f76a486382da2cd99cffb373ae37b7969764))
* **security:** redact spawn failure details ([#3239](https://github.com/djm204/frankenbeast/issues/3239)) ([cfc16da](https://github.com/djm204/frankenbeast/commit/cfc16da217696d34e0dd6c16198633c10688dcf5))
* **security:** redact tracked agent dispatch failures ([#3237](https://github.com/djm204/frankenbeast/issues/3237)) ([ac39f65](https://github.com/djm204/frankenbeast/commit/ac39f65941e7a2aaabc2a45ed724760e4800b000))
* **security:** validate chunk snapshot reasons ([#3236](https://github.com/djm204/frankenbeast/issues/3236)) ([a2a62bb](https://github.com/djm204/frankenbeast/commit/a2a62bb79c93cef86419501ba7d98128bdd9bb7e))
* **web:** close SSE ticket persistence gaps ([#3243](https://github.com/djm204/frankenbeast/issues/3243)) ([6fbee34](https://github.com/djm204/frankenbeast/commit/6fbee3430631043647547680c1899d9897535dcc))
* **web:** persist SSE connection tickets ([#3241](https://github.com/djm204/frankenbeast/issues/3241)) ([84af3b3](https://github.com/djm204/frankenbeast/commit/84af3b381c5d9871777da392bce1db7b2ff371bd))
* **web:** reconcile timed-out approval responses ([#3588](https://github.com/djm204/frankenbeast/issues/3588)) ([45f042a](https://github.com/djm204/frankenbeast/commit/45f042aa12b2780831ec386431701165b26d3c57))


### Performance

* **orchestrator:** bound multi-pass planning latency ([#3373](https://github.com/djm204/frankenbeast/issues/3373)) ([3218426](https://github.com/djm204/frankenbeast/commit/3218426b3f997de65fc3bfeabb09cfe83b44ad87))


### Miscellaneous

* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))
* **eslint:** enable type-aware promise linting ([#3435](https://github.com/djm204/frankenbeast/issues/3435)) ([c089f8b](https://github.com/djm204/frankenbeast/commit/c089f8b1cc0ff78a4fc5790567328b9c4928e8bf))
* **mcp:** reconcile observer redaction review fixes ([66f5339](https://github.com/djm204/frankenbeast/commit/66f53391e2265a7511a008595971c3a0d0f00dd0))
* merge main into issue 1727 branch ([43e2b7b](https://github.com/djm204/frankenbeast/commit/43e2b7b0bcb31d03a8e8443626ad6027ad7d0c8c))
* merge main into security scanner fix ([c480810](https://github.com/djm204/frankenbeast/commit/c4808106d27edd04fb877a721f59e11fb439ff6a))
* release main ([d19cce0](https://github.com/djm204/frankenbeast/commit/d19cce08188e79330228990ea311d38b0a2218eb))
* release main ([1064be4](https://github.com/djm204/frankenbeast/commit/1064be4436a8cc085155bf56d87668832c9e55bc))
* release main ([750094b](https://github.com/djm204/frankenbeast/commit/750094bab0859c49829b4abe85013a5007fc272b))
* release main ([100e3a8](https://github.com/djm204/frankenbeast/commit/100e3a887b6fbd538e8a1b83f4e88ce4caf6c443))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2553](https://github.com/djm204/frankenbeast/issues/2553)) ([1ca33c2](https://github.com/djm204/frankenbeast/commit/1ca33c2aa6e68792886ef599d1ac35bebcc8e3c9))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3400](https://github.com/djm204/frankenbeast/issues/3400)) ([02fd894](https://github.com/djm204/frankenbeast/commit/02fd894bf6e7453e56d3446a73be277431ae6e12))
* release main ([#3407](https://github.com/djm204/frankenbeast/issues/3407)) ([c1cb208](https://github.com/djm204/frankenbeast/commit/c1cb208923376aef3eccd371b178352abb2a6c9c))
* release main ([#3521](https://github.com/djm204/frankenbeast/issues/3521)) ([a3c8c12](https://github.com/djm204/frankenbeast/commit/a3c8c121f2ff4b7563c88cce9b31d6163bba82b7))
* release main ([#3606](https://github.com/djm204/frankenbeast/issues/3606)) ([3d33c74](https://github.com/djm204/frankenbeast/commit/3d33c746587a861c97c1e140e93e536ec7d23f23))


### Documentation

* **dr:** add corrupted worktree and queue runbook ([#2547](https://github.com/djm204/frankenbeast/issues/2547)) ([b143462](https://github.com/djm204/frankenbeast/commit/b14346247f3193a012db5a636298a4ffe1b44647))
* **onboarding:** relocate concise agent ramp-up guide ([#3396](https://github.com/djm204/frankenbeast/issues/3396)) ([c39eb74](https://github.com/djm204/frankenbeast/commit/c39eb74886803b2a8f041553cfc742e0655aa483))
* record Beast log containment lesson ([#3282](https://github.com/djm204/frankenbeast/issues/3282)) ([947eb8d](https://github.com/djm204/frankenbeast/commit/947eb8d0f79acdaf43417a15c2a10e5bbe84e370))
* remove PM-swarm terminology from Frankenbeast docs ([dcf183d](https://github.com/djm204/frankenbeast/commit/dcf183da6c8c176ecabd5278adbd6d3e6068be17))


### Tests

* harden HTTP abort fixture timing ([#3317](https://github.com/djm204/frankenbeast/issues/3317)) ([e28b70f](https://github.com/djm204/frankenbeast/commit/e28b70fd041522645309fb3a6d6d4cca7c9f6132))
* **memory:** cover cross-profile memory isolation ([#2574](https://github.com/djm204/frankenbeast/issues/2574)) ([daaacec](https://github.com/djm204/frankenbeast/commit/daaacecba86209552eeed73c38d667f36076cce3))
* **orchestrator:** add LLM chaos stability coverage ([cac1ee2](https://github.com/djm204/frankenbeast/commit/cac1ee2222f9465d99f479290279fc38a5cf280a))
* **orchestrator:** bound issue scheduler liveness payloads ([#2346](https://github.com/djm204/frankenbeast/issues/2346)) ([fa6f09c](https://github.com/djm204/frankenbeast/commit/fa6f09c0b3c3e51c66a4f82e1bbfa6947fe77754))
* **orchestrator:** cover budget abort flow ([#3428](https://github.com/djm204/frankenbeast/issues/3428)) ([31cc9ea](https://github.com/djm204/frankenbeast/commit/31cc9ea767b8bc048bba58b5cceff6bbb295b8b0))
* **orchestrator:** cover cancellation stability ([#2348](https://github.com/djm204/frankenbeast/issues/2348)) ([afefd41](https://github.com/djm204/frankenbeast/commit/afefd4197320d9fac32f1619e605ca6e19142963))
* **orchestrator:** cover failed chat mutation queues ([#3299](https://github.com/djm204/frankenbeast/issues/3299)) ([60d7ba7](https://github.com/djm204/frankenbeast/commit/60d7ba76c59d244ac7be98fbc456da86aca50eb4))
* **orchestrator:** cover invalid comms auth tokens ([#3268](https://github.com/djm204/frankenbeast/issues/3268)) ([8f0422c](https://github.com/djm204/frankenbeast/commit/8f0422c842247ad0cdab33f292a979b4ff1752cb))
* **orchestrator:** cover missing Slack interaction payload ([#3297](https://github.com/djm204/frankenbeast/issues/3297)) ([ba33b6b](https://github.com/djm204/frankenbeast/commit/ba33b6b583ae7e381e28e7300c84ff048c026ccb))
* **orchestrator:** make process stop assertions deterministic ([#3581](https://github.com/djm204/frankenbeast/issues/3581)) ([6c0cb93](https://github.com/djm204/frankenbeast/commit/6c0cb93fcb2faaa41ab4e106cf52b5f4ee77de62)), closes [#3576](https://github.com/djm204/frankenbeast/issues/3576)
* **orchestrator:** wait for async log persistence ([e978f18](https://github.com/djm204/frankenbeast/commit/e978f18f8fff938be1ce70eb0a6c62cdba81c089))
* **security:** add secret redaction regression suite ([#2575](https://github.com/djm204/frankenbeast/issues/2575)) ([04a708f](https://github.com/djm204/frankenbeast/commit/04a708fcf324599aab9c490718ecd625090482c8))
* **security:** avoid gitleaks fixture secrets ([#2607](https://github.com/djm204/frankenbeast/issues/2607)) ([bbb7c87](https://github.com/djm204/frankenbeast/commit/bbb7c87d1621a778f6b521d84678f4009d15dafc)), closes [#2399](https://github.com/djm204/frankenbeast/issues/2399)
* **stability:** add stream replay coverage ([#2578](https://github.com/djm204/frankenbeast/issues/2578)) ([92bacf0](https://github.com/djm204/frankenbeast/commit/92bacf068b14e2e6e25d97eca0f543afcad56a41))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.10.4 to 0.11.0
    * @franken/governor bumped from 0.8.3 to 0.9.0
    * @franken/types bumped from 0.16.1 to 0.17.0
    * @franken/observer bumped from 0.11.5 to 0.12.0
    * @franken/planner bumped from 0.4.25 to 0.4.26
    * @franken/brain bumped from 0.16.2 to 0.17.0
</details>

<details><summary>@franken/planner: 0.4.26</summary>

## [0.4.26](https://github.com/djm204/frankenbeast/compare/@franken/planner-v0.4.25...@franken/planner-v0.4.26) (2026-07-23)


### Bug Fixes

* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* **planner:** advance versions on graph mutations ([#3544](https://github.com/djm204/frankenbeast/issues/3544)) ([bacaf2a](https://github.com/djm204/frankenbeast/commit/bacaf2aabf7b17d849a7d7353d7a2700de962366))
* **planner:** inspect error pattern code points ([#3451](https://github.com/djm204/frankenbeast/issues/3451)) ([aab7360](https://github.com/djm204/frankenbeast/commit/aab736016076f734f5e7fb04fe103800ba8447cc))
* **planner:** preserve task dependencies in addTask ([#3545](https://github.com/djm204/frankenbeast/issues/3545)) ([5a83c9f](https://github.com/djm204/frankenbeast/commit/5a83c9f22edac21bd533ff25a33d3db9094a2cd5))
* **planner:** recover concurrent wave failures together ([#3457](https://github.com/djm204/frankenbeast/issues/3457)) ([a08a27f](https://github.com/djm204/frankenbeast/commit/a08a27f580ac52190592b356bff81c36ec62508f))


### Performance

* **planner:** make topo sort queue linear ([#3585](https://github.com/djm204/frankenbeast/issues/3585)) ([b297496](https://github.com/djm204/frankenbeast/commit/b297496da62a204bc479eedc6faf7b167d01f14a))


### Miscellaneous

* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))
* **eslint:** enable type-aware promise linting ([#3435](https://github.com/djm204/frankenbeast/issues/3435)) ([c089f8b](https://github.com/djm204/frankenbeast/commit/c089f8b1cc0ff78a4fc5790567328b9c4928e8bf))
* **mcp:** reconcile observer redaction review fixes ([66f5339](https://github.com/djm204/frankenbeast/commit/66f53391e2265a7511a008595971c3a0d0f00dd0))
* release main ([d19cce0](https://github.com/djm204/frankenbeast/commit/d19cce08188e79330228990ea311d38b0a2218eb))
* release main ([1064be4](https://github.com/djm204/frankenbeast/commit/1064be4436a8cc085155bf56d87668832c9e55bc))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3407](https://github.com/djm204/frankenbeast/issues/3407)) ([c1cb208](https://github.com/djm204/frankenbeast/commit/c1cb208923376aef3eccd371b178352abb2a6c9c))
* release main ([#3521](https://github.com/djm204/frankenbeast/issues/3521)) ([a3c8c12](https://github.com/djm204/frankenbeast/commit/a3c8c121f2ff4b7563c88cce9b31d6163bba82b7))
* **types:** enforce workspace strictness ([#3458](https://github.com/djm204/frankenbeast/issues/3458)) ([503b644](https://github.com/djm204/frankenbeast/commit/503b6448f05f74ccd28493fcf8f46a23ba4d80aa))


### Tests

* **planner:** prove same-wave concurrency ([#3416](https://github.com/djm204/frankenbeast/issues/3416)) ([c17da84](https://github.com/djm204/frankenbeast/commit/c17da84574ec9332ebc9f3e8dfe2d8aad477d358))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.16.1 to 0.17.0
</details>

<details><summary>franken-types: 0.17.0</summary>

## [0.17.0](https://github.com/djm204/frankenbeast/compare/franken-types-v0.16.1...franken-types-v0.17.0) (2026-07-23)


### Features

* **cli:** agent-style terminal rendering for fbeast chat ([#3427](https://github.com/djm204/frankenbeast/issues/3427)) ([d8f0a55](https://github.com/djm204/frankenbeast/commit/d8f0a55f92b4af2a89a3945c2ef9b86f51ba6fe7))
* **cli:** box the chat input, purple/green theme, real usage stats + provider self-awareness ([#3505](https://github.com/djm204/frankenbeast/issues/3505)) ([32d11ff](https://github.com/djm204/frankenbeast/commit/32d11ff9bc8a263c4083e75d0961c35a8c691bd0))
* **dr:** add point-in-time incident export ([#2551](https://github.com/djm204/frankenbeast/issues/2551)) ([38197b9](https://github.com/djm204/frankenbeast/commit/38197b9e2c6c14516a38270c3c6d63d31afc880e))
* **learning:** add skill evolution review gate ([#2413](https://github.com/djm204/frankenbeast/issues/2413)) ([25cec22](https://github.com/djm204/frankenbeast/commit/25cec22c6512dc810f5a013b91db89242c7c78ce))


### Bug Fixes

* **beasts:** describe design document file prompt ([#3469](https://github.com/djm204/frankenbeast/issues/3469)) ([697151c](https://github.com/djm204/frankenbeast/commit/697151cd5fc6e7601f9dbb9e6eaf207832278720))
* **beasts:** paginate run event API ([#3419](https://github.com/djm204/frankenbeast/issues/3419)) ([396a863](https://github.com/djm204/frankenbeast/commit/396a863b55ecf308968dd82fee3dae105bf1787a))
* **brain:** bound checkpoint listings ([#3592](https://github.com/djm204/frankenbeast/issues/3592)) ([5d60114](https://github.com/djm204/frankenbeast/commit/5d60114f652ecf380f0ba61d47467475e2624ef2))
* **brain:** expose episodic snapshot truncation ([#3575](https://github.com/djm204/frankenbeast/issues/3575)) ([97bcc6c](https://github.com/djm204/frankenbeast/commit/97bcc6c0f3ecfdc586efbe06ad1a0360461227b0))
* **chat:** bound message content length ([#3381](https://github.com/djm204/frankenbeast/issues/3381)) ([1d4201b](https://github.com/djm204/frankenbeast/commit/1d4201b37f7ec35c6503f922fad2a0c5de8fb43e))
* **comms:** bound outbound adapter fetches ([#3468](https://github.com/djm204/frankenbeast/issues/3468)) ([1ab6e81](https://github.com/djm204/frankenbeast/commit/1ab6e8199b856ac0241a21f2ff57643b9ec802f1))
* **config:** default chat to Codex provider ([#3424](https://github.com/djm204/frankenbeast/issues/3424)) ([462b7df](https://github.com/djm204/frankenbeast/commit/462b7dfa4bc47d701875d4d0fd8cfcc07f790063))
* disambiguate critique result type exports ([#3316](https://github.com/djm204/frankenbeast/issues/3316)) ([48756fd](https://github.com/djm204/frankenbeast/commit/48756fd04b2490566ba5e2a28b6f96fa0cb9d153))
* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* **orchestrator:** paginate tracked agent listings ([#3418](https://github.com/djm204/frankenbeast/issues/3418)) ([98cf74b](https://github.com/djm204/frankenbeast/commit/98cf74b1dcea83424df14a4a6e21e74ec21e64db))
* **security:** audit HITL approval replay ([#2576](https://github.com/djm204/frankenbeast/issues/2576)) ([c89ea75](https://github.com/djm204/frankenbeast/commit/c89ea75593d8b75d1c787d978d1aedac15624f7b))
* **types:** share branded critique score contract ([#3433](https://github.com/djm204/frankenbeast/issues/3433)) ([6800c5d](https://github.com/djm204/frankenbeast/commit/6800c5d0da90d5b0aabd5043a24306456c9b4f8c))


### Performance

* **orchestrator:** bound multi-pass planning latency ([#3373](https://github.com/djm204/frankenbeast/issues/3373)) ([3218426](https://github.com/djm204/frankenbeast/commit/3218426b3f997de65fc3bfeabb09cfe83b44ad87))


### Miscellaneous

* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))
* **mcp:** reconcile observer redaction review fixes ([66f5339](https://github.com/djm204/frankenbeast/commit/66f53391e2265a7511a008595971c3a0d0f00dd0))
* merge main into issue 1727 branch ([43e2b7b](https://github.com/djm204/frankenbeast/commit/43e2b7b0bcb31d03a8e8443626ad6027ad7d0c8c))
* release main ([d19cce0](https://github.com/djm204/frankenbeast/commit/d19cce08188e79330228990ea311d38b0a2218eb))
* release main ([1064be4](https://github.com/djm204/frankenbeast/commit/1064be4436a8cc085155bf56d87668832c9e55bc))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3407](https://github.com/djm204/frankenbeast/issues/3407)) ([c1cb208](https://github.com/djm204/frankenbeast/commit/c1cb208923376aef3eccd371b178352abb2a6c9c))
* release main ([#3521](https://github.com/djm204/frankenbeast/issues/3521)) ([a3c8c12](https://github.com/djm204/frankenbeast/commit/a3c8c121f2ff4b7563c88cce9b31d6163bba82b7))
* **types:** enforce workspace strictness ([#3458](https://github.com/djm204/frankenbeast/issues/3458)) ([503b644](https://github.com/djm204/frankenbeast/commit/503b6448f05f74ccd28493fcf8f46a23ba4d80aa))


### Tests

* **stability:** add stream replay coverage ([#2578](https://github.com/djm204/frankenbeast/issues/2578)) ([92bacf0](https://github.com/djm204/frankenbeast/commit/92bacf068b14e2e6e25d97eca0f543afcad56a41))
</details>

<details><summary>franken-web: 0.10.0</summary>

## [0.10.0](https://github.com/djm204/frankenbeast/compare/franken-web-v0.9.2...franken-web-v0.10.0) (2026-07-23)


### Features

* **availability:** add read-only degraded mode ([#2402](https://github.com/djm204/frankenbeast/issues/2402)) ([4dcd49b](https://github.com/djm204/frankenbeast/commit/4dcd49b14a856330c6ae287124c04eb2928b4c05))
* **availability:** add service health aggregator ([#2582](https://github.com/djm204/frankenbeast/issues/2582)) ([3e6f9f9](https://github.com/djm204/frankenbeast/commit/3e6f9f93699d3565727465f5f2172db18ff9b17a))
* **availability:** expose SLO dashboard ([#2580](https://github.com/djm204/frankenbeast/issues/2580)) ([6e1918c](https://github.com/djm204/frankenbeast/commit/6e1918cffe5ffb10a0acfc72f08d118836172864))
* **beasts:** add maintenance dispatch guardrails ([#2400](https://github.com/djm204/frankenbeast/issues/2400)) ([f50e966](https://github.com/djm204/frankenbeast/commit/f50e966246a1a05902fd0054ffa79bb59ffe35e7))
* **dashboard:** surface dependency availability ([#2347](https://github.com/djm204/frankenbeast/issues/2347)) ([0298dd5](https://github.com/djm204/frankenbeast/commit/0298dd58133a30015f3487893d64ef0d3d02dbb7))
* **web:** adopt Radix provider selectors ([#3520](https://github.com/djm204/frankenbeast/issues/3520)) ([217a031](https://github.com/djm204/frankenbeast/commit/217a031ae09d36cd7968d3b7853a10d9e03855aa))
* **web:** centralize wizard dirty tracking ([#3527](https://github.com/djm204/frankenbeast/issues/3527)) ([cbacaae](https://github.com/djm204/frankenbeast/commit/cbacaae091e4cd68b0b21ec3201c472aa33ba8d4))
* **web:** terminal-style chat transcript and conversational interview ([#3413](https://github.com/djm204/frankenbeast/issues/3413)) ([ebdd27a](https://github.com/djm204/frankenbeast/commit/ebdd27acaad24aeb4b1eef1e7360849afd6c2584))


### Bug Fixes

* **beasts:** bound run log responses ([#3415](https://github.com/djm204/frankenbeast/issues/3415)) ([01cdb22](https://github.com/djm204/frankenbeast/commit/01cdb22dfa21d791df05f4b46f1f076892c4e819))
* **beasts:** describe design document file prompt ([#3469](https://github.com/djm204/frankenbeast/issues/3469)) ([697151c](https://github.com/djm204/frankenbeast/commit/697151cd5fc6e7601f9dbb9e6eaf207832278720))
* **beasts:** paginate run event API ([#3419](https://github.com/djm204/frankenbeast/issues/3419)) ([396a863](https://github.com/djm204/frankenbeast/commit/396a863b55ecf308968dd82fee3dae105bf1787a))
* **config:** default chat to Codex provider ([#3424](https://github.com/djm204/frankenbeast/issues/3424)) ([462b7df](https://github.com/djm204/frankenbeast/commit/462b7dfa4bc47d701875d4d0fd8cfcc07f790063))
* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* expose skill selection state and test keyboard flow ([#3315](https://github.com/djm204/frankenbeast/issues/3315)) ([8706c6d](https://github.com/djm204/frankenbeast/commit/8706c6ded0c9455b628a9ea27a179073925e2dd0))
* import shared ServerSocketEvent type ([#3321](https://github.com/djm204/frankenbeast/issues/3321)) ([ed900f2](https://github.com/djm204/frankenbeast/commit/ed900f243dea5775250482008cc2f0963c1ad7e4))
* improve wizard step indicator accessibility ([#3325](https://github.com/djm204/frankenbeast/issues/3325)) ([6587733](https://github.com/djm204/frankenbeast/commit/6587733f06ce00868ac274d5b7bbfdef7a2b182e))
* **orchestrator:** paginate Beast run listings ([#3445](https://github.com/djm204/frankenbeast/issues/3445)) ([319806a](https://github.com/djm204/frankenbeast/commit/319806a035380cbce53e04c8e7051e3422bf621f))
* **orchestrator:** paginate tracked agent listings ([#3418](https://github.com/djm204/frankenbeast/issues/3418)) ([98cf74b](https://github.com/djm204/frankenbeast/commit/98cf74b1dcea83424df14a4a6e21e74ec21e64db))
* **orchestrator:** protect unauthenticated dashboard streams ([#3389](https://github.com/djm204/frankenbeast/issues/3389)) ([23e4579](https://github.com/djm204/frankenbeast/commit/23e4579ae0064186e8db6490b9b20a46d497fa3f))
* **security:** isolate concurrent SSE ticket cookies ([#3387](https://github.com/djm204/frankenbeast/issues/3387)) ([d826141](https://github.com/djm204/frankenbeast/commit/d82614172c45f3da9b8a6353fc198b5e55c18419))
* **security:** keep SSE tickets out of request URLs ([#3385](https://github.com/djm204/frankenbeast/issues/3385)) ([819a0f8](https://github.com/djm204/frankenbeast/commit/819a0f8d3726049a517d0eb02985ff89e74116e9))
* **web:** adopt accessible non-modal detail drawer ([#3259](https://github.com/djm204/frankenbeast/issues/3259)) ([1dca742](https://github.com/djm204/frankenbeast/commit/1dca742fccbb2eb3d8f0028453f9841b37dfed69))
* **web:** align dashboard approval requirement type ([#3538](https://github.com/djm204/frankenbeast/issues/3538)) ([e29d93b](https://github.com/djm204/frankenbeast/commit/e29d93b8a55d8f56a850261f0a40c777fdf27464))
* **web:** announce analytics detail errors ([#3301](https://github.com/djm204/frankenbeast/issues/3301)) ([9598a96](https://github.com/djm204/frankenbeast/commit/9598a96de7d1e5d5af8f6a330d39d32c67d04279))
* **web:** announce approval queue changes ([#3390](https://github.com/djm204/frankenbeast/issues/3390)) ([cbdb7b5](https://github.com/djm204/frankenbeast/commit/cbdb7b505c3d45c44677420ca972434a00016da9))
* **web:** announce beast load errors to screen readers ([#3312](https://github.com/djm204/frankenbeast/issues/3312)) ([bda894b](https://github.com/djm204/frankenbeast/commit/bda894b4edca2c2ca41b642b26c5d47aa1c3f48c))
* **web:** announce module toggle state ([#3276](https://github.com/djm204/frankenbeast/issues/3276)) ([dd86f02](https://github.com/djm204/frankenbeast/commit/dd86f021526be81cd324e7a2e05e8321419397cd))
* **web:** announce runtime activity updates ([#3553](https://github.com/djm204/frankenbeast/issues/3553)) ([c5224b3](https://github.com/djm204/frankenbeast/commit/c5224b398844537220bad53cdcc688fa6d1806cb))
* **web:** back off Beast event stream reconnects ([#3636](https://github.com/djm204/frankenbeast/issues/3636)) ([cff499f](https://github.com/djm204/frankenbeast/commit/cff499f255bed7b430bf8ac14324c2e1b089c856))
* **web:** back off chat websocket reconnects ([#3640](https://github.com/djm204/frankenbeast/issues/3640)) ([653e702](https://github.com/djm204/frankenbeast/commit/653e702418f284166409384fc76b6778976b0bbc))
* **web:** confirm destructive network service actions ([#3403](https://github.com/djm204/frankenbeast/issues/3403)) ([0d60e65](https://github.com/djm204/frankenbeast/commit/0d60e65d45f43ee0bd0e8cd5f5732292bad709bf))
* **web:** describe agent creation wizard ([#3298](https://github.com/djm204/frankenbeast/issues/3298)) ([308ea05](https://github.com/djm204/frankenbeast/commit/308ea053a220193bfb818181c266eb086d59a087))
* **web:** describe analytics event drawer ([#3622](https://github.com/djm204/frankenbeast/issues/3622)) ([d73ecff](https://github.com/djm204/frankenbeast/commit/d73ecff26b5faf4a55afd1a8fa1ab94cb460e7dd))
* **web:** disable composer input with dispatch ([#3561](https://github.com/djm204/frankenbeast/issues/3561)) ([a844c8f](https://github.com/djm204/frankenbeast/commit/a844c8f2c7ae74fc2c4d0f27bca10d5281fc6ac2))
* **web:** explain disabled model selector ([#3280](https://github.com/djm204/frankenbeast/issues/3280)) ([583b5c8](https://github.com/djm204/frankenbeast/commit/583b5c84374026d35e99fe3fdae0e4f5ac468020))
* **web:** explain locked wizard steps ([#3375](https://github.com/djm204/frankenbeast/issues/3375)) ([658c3c4](https://github.com/djm204/frankenbeast/commit/658c3c4ff063ffb2126a56eace466291c8faf3d6))
* **web:** expose module toggle state via aria-pressed ([#3322](https://github.com/djm204/frankenbeast/issues/3322)) ([8423fa0](https://github.com/djm204/frankenbeast/commit/8423fa093396f65fed22408e077762dbf26c8880))
* **web:** expose preset card selection state ([#3275](https://github.com/djm204/frankenbeast/issues/3275)) ([7ebc720](https://github.com/djm204/frankenbeast/commit/7ebc720b85ff9a5c3d683fbd7e0c9819ce00bbae))
* **web:** expose selected agent row state ([#3292](https://github.com/djm204/frankenbeast/issues/3292)) ([2a94a47](https://github.com/djm204/frankenbeast/commit/2a94a47274a1d4315840e5557473120d4d651556))
* **web:** preserve shared agent DTO exports ([#3539](https://github.com/djm204/frankenbeast/issues/3539)) ([a9f8604](https://github.com/djm204/frankenbeast/commit/a9f860452626566f8671274ea485c2418444e4c3))
* **web:** prevent skill switches from submitting forms ([#3272](https://github.com/djm204/frankenbeast/issues/3272)) ([7bea34a](https://github.com/djm204/frankenbeast/commit/7bea34a49363135f840301d464307a97c84514ab))
* **web:** reconcile timed-out approval responses ([#3588](https://github.com/djm204/frankenbeast/issues/3588)) ([45f042a](https://github.com/djm204/frankenbeast/commit/45f042aa12b2780831ec386431701165b26d3c57))
* **web:** reset force restart state per tracked agent ([3704b38](https://github.com/djm204/frankenbeast/commit/3704b38f4a973906698b9a072535f0f7987b5e2b)), closes [#2643](https://github.com/djm204/frankenbeast/issues/2643)
* **web:** surface initial network config load failures ([#3255](https://github.com/djm204/frankenbeast/issues/3255)) ([c097daa](https://github.com/djm204/frankenbeast/commit/c097daaf9f9c4ad2b04a463232074087da44e945))
* **web:** use live skills in agent wizard ([#3384](https://github.com/djm204/frankenbeast/issues/3384)) ([2c631c4](https://github.com/djm204/frankenbeast/commit/2c631c46aeb4b118a63bf791652d4b7ab99330ae))
* **web:** validate package metadata parsing ([#3320](https://github.com/djm204/frankenbeast/issues/3320)) ([92012d3](https://github.com/djm204/frankenbeast/commit/92012d3a122b3a3ef22ba3de1e8a128d128621c6))


### Performance

* **web:** code-split route pages to fix chunk-size warning ([#3304](https://github.com/djm204/frankenbeast/issues/3304)) ([b0c9309](https://github.com/djm204/frankenbeast/commit/b0c9309eeaa582fc2c4a02f961acb52229a4a175))


### Refactoring

* **web:** scope wizard Zustand selectors ([#3477](https://github.com/djm204/frankenbeast/issues/3477)) ([a762240](https://github.com/djm204/frankenbeast/commit/a7622408f9a345b9c3e20702b264b42834205945))


### Miscellaneous

* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))
* **mcp:** reconcile observer redaction review fixes ([66f5339](https://github.com/djm204/frankenbeast/commit/66f53391e2265a7511a008595971c3a0d0f00dd0))
* release main ([d19cce0](https://github.com/djm204/frankenbeast/commit/d19cce08188e79330228990ea311d38b0a2218eb))
* release main ([1064be4](https://github.com/djm204/frankenbeast/commit/1064be4436a8cc085155bf56d87668832c9e55bc))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3400](https://github.com/djm204/frankenbeast/issues/3400)) ([02fd894](https://github.com/djm204/frankenbeast/commit/02fd894bf6e7453e56d3446a73be277431ae6e12))
* release main ([#3407](https://github.com/djm204/frankenbeast/issues/3407)) ([c1cb208](https://github.com/djm204/frankenbeast/commit/c1cb208923376aef3eccd371b178352abb2a6c9c))
* release main ([#3521](https://github.com/djm204/frankenbeast/issues/3521)) ([a3c8c12](https://github.com/djm204/frankenbeast/commit/a3c8c121f2ff4b7563c88cce9b31d6163bba82b7))
* release main ([#3606](https://github.com/djm204/frankenbeast/issues/3606)) ([3d33c74](https://github.com/djm204/frankenbeast/commit/3d33c746587a861c97c1e140e93e536ec7d23f23))
* **types:** enforce workspace strictness ([#3458](https://github.com/djm204/frankenbeast/issues/3458)) ([503b644](https://github.com/djm204/frankenbeast/commit/503b6448f05f74ccd28493fcf8f46a23ba4d80aa))
* **web:** upgrade jest-dom to version 7 ([#3476](https://github.com/djm204/frankenbeast/issues/3476)) ([2158876](https://github.com/djm204/frankenbeast/commit/2158876397237fbb1480f55008303cbcc067f9be))


### Tests

* **stability:** add stream replay coverage ([#2578](https://github.com/djm204/frankenbeast/issues/2578)) ([92bacf0](https://github.com/djm204/frankenbeast/commit/92bacf068b14e2e6e25d97eca0f543afcad56a41))
* **web:** cover Beast edit persistence flow ([#3286](https://github.com/djm204/frankenbeast/issues/3286)) ([c8728ab](https://github.com/djm204/frankenbeast/commit/c8728ab6d9797216f24358f6a52b127d68067d05))
* **web:** cover chat client auth plumbing ([#3530](https://github.com/djm204/frankenbeast/issues/3530)) ([88fa3df](https://github.com/djm204/frankenbeast/commit/88fa3dfc1543d772cb004c13303606f8820cf625))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.16.1 to 0.17.0
</details>

<details><summary>0.64.0</summary>

## [0.64.0](https://github.com/djm204/frankenbeast/compare/v0.63.2...v0.64.0) (2026-07-23)


### Features

* **availability:** add service health aggregator ([#2582](https://github.com/djm204/frankenbeast/issues/2582)) ([3e6f9f9](https://github.com/djm204/frankenbeast/commit/3e6f9f93699d3565727465f5f2172db18ff9b17a))
* **availability:** expose SLO dashboard ([#2580](https://github.com/djm204/frankenbeast/issues/2580)) ([6e1918c](https://github.com/djm204/frankenbeast/commit/6e1918cffe5ffb10a0acfc72f08d118836172864))
* **availability:** reserve urgent agent capacity ([70cd020](https://github.com/djm204/frankenbeast/commit/70cd020b52cd3418fd61d00f0d29c8fe49b319ef))
* **beasts:** add maintenance dispatch guardrails ([#2400](https://github.com/djm204/frankenbeast/issues/2400)) ([f50e966](https://github.com/djm204/frankenbeast/commit/f50e966246a1a05902fd0054ffa79bb59ffe35e7))
* **brain:** add memory conflict resolution prompts ([#2396](https://github.com/djm204/frankenbeast/issues/2396)) ([eeb9155](https://github.com/djm204/frankenbeast/commit/eeb9155ccf06a1dd9cf2872685d3ac95b8bee7bf))
* **cli:** add slash command tab completion ([#3542](https://github.com/djm204/frankenbeast/issues/3542)) ([04b77fa](https://github.com/djm204/frankenbeast/commit/04b77fafe02e82f0d1167f2ea9b4f2b92d4a37c1))
* **cli:** box the chat input, purple/green theme, real usage stats + provider self-awareness ([#3505](https://github.com/djm204/frankenbeast/issues/3505)) ([32d11ff](https://github.com/djm204/frankenbeast/commit/32d11ff9bc8a263c4083e75d0961c35a8c691bd0))
* **dr:** add point-in-time incident export ([#2551](https://github.com/djm204/frankenbeast/issues/2551)) ([38197b9](https://github.com/djm204/frankenbeast/commit/38197b9e2c6c14516a38270c3c6d63d31afc880e))
* **dr:** add state snapshot diff tool ([#2403](https://github.com/djm204/frankenbeast/issues/2403)) ([f80c473](https://github.com/djm204/frankenbeast/commit/f80c4738c55fa0061faf153fa92b81d2cb9939ed))
* **learning:** add post-task lesson extraction ([#2548](https://github.com/djm204/frankenbeast/issues/2548)) ([32e0bb7](https://github.com/djm204/frankenbeast/commit/32e0bb72310a6c45638c87e6212caea0c05e57c4))
* **learning:** add strategy experiment sandbox ([#2579](https://github.com/djm204/frankenbeast/issues/2579)) ([bc1de3d](https://github.com/djm204/frankenbeast/commit/bc1de3d3e0d685f4a0c5e375a82c657c289fb651))
* **memory:** add access audit report ([a39a13c](https://github.com/djm204/frankenbeast/commit/a39a13c1f6a1d44faa2e07c524723e21409e2f1f))
* **memory:** add confidence decay model ([#2326](https://github.com/djm204/frankenbeast/issues/2326)) ([3d59a83](https://github.com/djm204/frankenbeast/commit/3d59a83becb8d1e4f318a12f6c8f57216fa6f556))
* **memory:** add conflict resolver ([#2320](https://github.com/djm204/frankenbeast/issues/2320)) ([6066b86](https://github.com/djm204/frankenbeast/commit/6066b861ca55505c5508f74b905362d68ef54b05))
* **memory:** add memory access audit trail ([#2317](https://github.com/djm204/frankenbeast/issues/2317)) ([ef889da](https://github.com/djm204/frankenbeast/commit/ef889dae092d996a6ca463e5abcaf5ed4d296158))
* **memory:** add project-scoped snapshot builder ([#2343](https://github.com/djm204/frankenbeast/issues/2343)) ([8d1142b](https://github.com/djm204/frankenbeast/commit/8d1142b32eb4c65ea14c5bb41f5ef82eaa0b1a4f)), closes [#1758](https://github.com/djm204/frankenbeast/issues/1758)
* **memory:** add redacted project memory export ([#2321](https://github.com/djm204/frankenbeast/issues/2321)) ([6a7b8bb](https://github.com/djm204/frankenbeast/commit/6a7b8bb1dfbbc10282e7cd90ac34936a06943d15))
* **memory:** add retention policy report ([#2554](https://github.com/djm204/frankenbeast/issues/2554)) ([8b564d9](https://github.com/djm204/frankenbeast/commit/8b564d9c794db41af1e7e9e7be7a98bdf46f6ed6))
* **memory:** add source attribution viewer ([#2329](https://github.com/djm204/frankenbeast/issues/2329)) ([9a47d63](https://github.com/djm204/frankenbeast/commit/9a47d63ce4bed21908af873ed7588794ae19d25a))
* **onboarding:** add agent handoff template validator ([#2331](https://github.com/djm204/frankenbeast/issues/2331)) ([11bf733](https://github.com/djm204/frankenbeast/commit/11bf733e3a2c93551bcfd720a2b24827525479af))
* **onboarding:** add agent practice fixture ([#2570](https://github.com/djm204/frankenbeast/issues/2570)) ([1ce618a](https://github.com/djm204/frankenbeast/commit/1ce618a00f0552c70a73966b0d5a1928090f06f2))
* **onboarding:** add bootstrap progress status badges ([#2325](https://github.com/djm204/frankenbeast/issues/2325)) ([626c05c](https://github.com/djm204/frankenbeast/commit/626c05cbd65a73c2c62d43ca7b1bfb8114de5025))
* **onboarding:** add first-run checklist generator ([#2340](https://github.com/djm204/frankenbeast/issues/2340)) ([10c5611](https://github.com/djm204/frankenbeast/commit/10c56111740067e8e05c67219ed76d905aa2109d))
* **onboarding:** add issue worktree bootstrap helper ([#2337](https://github.com/djm204/frankenbeast/issues/2337)) ([cbd0713](https://github.com/djm204/frankenbeast/commit/cbd07132c60e9dd2c8e132fe24924e9ebe43a324))
* **onboarding:** add local-to-PR dry run ([#2411](https://github.com/djm204/frankenbeast/issues/2411)) ([c5f2d13](https://github.com/djm204/frankenbeast/commit/c5f2d130fa2b2c696491b5e3596a1668b07b25f7))
* **onboarding:** add new-worker preflight command ([#2338](https://github.com/djm204/frankenbeast/issues/2338)) ([f931e69](https://github.com/djm204/frankenbeast/commit/f931e69b042d95210cc95f46a47ccc60dcd0196e))
* **onboarding:** add profile capability self-test ([#2410](https://github.com/djm204/frankenbeast/issues/2410)) ([d576f31](https://github.com/djm204/frankenbeast/commit/d576f31fb81b90cf405e6bb6c9c3d87207813839))
* **onboarding:** add setup healthcheck ([#2581](https://github.com/djm204/frankenbeast/issues/2581)) ([12a9d83](https://github.com/djm204/frankenbeast/commit/12a9d8330d5614ad3dc2740a4904433ad61282cf))
* **onboarding:** add workspace tour command ([#2354](https://github.com/djm204/frankenbeast/issues/2354)) ([43b73c1](https://github.com/djm204/frankenbeast/commit/43b73c124b5bb139dd5b9373355be61f075654c5))
* **orchestrator:** add accessible plain CLI output ([#3425](https://github.com/djm204/frankenbeast/issues/3425)) ([2e4f947](https://github.com/djm204/frankenbeast/commit/2e4f947d372afe6146143de29d7819bd518f3201))
* **orchestrator:** add automation dead-letter queue ([#2344](https://github.com/djm204/frankenbeast/issues/2344)) ([3a68010](https://github.com/djm204/frankenbeast/commit/3a680103198cdcb5b7341c61ce362a7f0b18074e))
* **orchestrator:** add DR process cleanup plan ([#2397](https://github.com/djm204/frankenbeast/issues/2397)) ([105e3fb](https://github.com/djm204/frankenbeast/commit/105e3fb20790dd9855ba735fec1e68a2b9aa23fe))
* **orchestrator:** add queue priority aging ([#2351](https://github.com/djm204/frankenbeast/issues/2351)) ([69d30c2](https://github.com/djm204/frankenbeast/commit/69d30c2c37d50675bc1dd23bc29d3e085e896360)), closes [#1748](https://github.com/djm204/frankenbeast/issues/1748)
* **orchestrator:** show stage-aware planning progress ([#3371](https://github.com/djm204/frankenbeast/issues/3371)) ([e99dcd0](https://github.com/djm204/frankenbeast/commit/e99dcd0de708b2e335f9496f8fa4df77eec9fbd5))
* **security:** add external helper allowlist ([#2407](https://github.com/djm204/frankenbeast/issues/2407)) ([d122e94](https://github.com/djm204/frankenbeast/commit/d122e94d1fe3e179c5b29df3accf027f9b37c5e9))
* **web:** adopt Radix provider selectors ([#3520](https://github.com/djm204/frankenbeast/issues/3520)) ([217a031](https://github.com/djm204/frankenbeast/commit/217a031ae09d36cd7968d3b7853a10d9e03855aa))
* **web:** centralize wizard dirty tracking ([#3527](https://github.com/djm204/frankenbeast/issues/3527)) ([cbacaae](https://github.com/djm204/frankenbeast/commit/cbacaae091e4cd68b0b21ec3201c472aa33ba8d4))


### Bug Fixes

* **beasts:** bound run log responses ([#3415](https://github.com/djm204/frankenbeast/issues/3415)) ([01cdb22](https://github.com/djm204/frankenbeast/commit/01cdb22dfa21d791df05f4b46f1f076892c4e819))
* **beasts:** paginate run event API ([#3419](https://github.com/djm204/frankenbeast/issues/3419)) ([396a863](https://github.com/djm204/frankenbeast/commit/396a863b55ecf308968dd82fee3dae105bf1787a))
* **brain:** bound checkpoint listings ([#3592](https://github.com/djm204/frankenbeast/issues/3592)) ([5d60114](https://github.com/djm204/frankenbeast/commit/5d60114f652ecf380f0ba61d47467475e2624ef2))
* **brain:** preserve concurrent SQLite writes ([#3423](https://github.com/djm204/frankenbeast/issues/3423)) ([be06e50](https://github.com/djm204/frankenbeast/commit/be06e50dfa3b689023dd3a238945435a259811ae))
* **brain:** quarantine corrupt episodic details ([#3471](https://github.com/djm204/frankenbeast/issues/3471)) ([0ce3a2a](https://github.com/djm204/frankenbeast/commit/0ce3a2a6830f826efb6b08fbe6eaaadd771bf25a))
* **brain:** reject corrupt working memory hydration ([#3263](https://github.com/djm204/frankenbeast/issues/3263)) ([ef5a3d8](https://github.com/djm204/frankenbeast/commit/ef5a3d85dab3c4be70f9055a066abdba7d813760))
* **ci:** bound root release tag selection ([#3558](https://github.com/djm204/frankenbeast/issues/3558)) ([2b163da](https://github.com/djm204/frankenbeast/commit/2b163daec72731f0cbdaef482f7028646c58bf32))
* **comms:** bound outbound adapter fetches ([#3468](https://github.com/djm204/frankenbeast/issues/3468)) ([1ab6e81](https://github.com/djm204/frankenbeast/commit/1ab6e8199b856ac0241a21f2ff57643b9ec802f1))
* **compose:** tolerate slow Chroma startup ([#3302](https://github.com/djm204/frankenbeast/issues/3302)) ([b04fd64](https://github.com/djm204/frankenbeast/commit/b04fd6436f3eaf1e7a83ab50720550718e0355ce))
* **critique:** parse nested unicode set classes ([#3399](https://github.com/djm204/frankenbeast/issues/3399)) ([613162e](https://github.com/djm204/frankenbeast/commit/613162e40b7a6345ca8fd2775b0e07279558baa0))
* **deps:** override vulnerable Hono server ([#3515](https://github.com/djm204/frankenbeast/issues/3515)) ([302f6b2](https://github.com/djm204/frankenbeast/commit/302f6b2863feb2d85b0132d5538104cae1111698))
* **deps:** update body-parser past audit advisory ([#3511](https://github.com/djm204/frankenbeast/issues/3511)) ([c2a5b3a](https://github.com/djm204/frankenbeast/commit/c2a5b3a358969e1900f332a1e1b998f7db7ca4c5))
* disambiguate critique result type exports ([#3316](https://github.com/djm204/frankenbeast/issues/3316)) ([48756fd](https://github.com/djm204/frankenbeast/commit/48756fd04b2490566ba5e2a28b6f96fa0cb9d153))
* **docs:** align package inventory references ([#2634](https://github.com/djm204/frankenbeast/issues/2634)) ([a9491d3](https://github.com/djm204/frankenbeast/commit/a9491d326439b7466f1cdce00214b6aed9640541))
* **docs:** remove stale package references ([#3473](https://github.com/djm204/frankenbeast/issues/3473)) ([8e6e431](https://github.com/djm204/frankenbeast/commit/8e6e431cbc05b337f7a56b5000b65e1f5dfd1ef1))
* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* **governor:** add approval anomaly detection ([#2353](https://github.com/djm204/frankenbeast/issues/2353)) ([84a1222](https://github.com/djm204/frankenbeast/commit/84a12225d5e900e9c9be5597cf6ae6a10ea604e7))
* **governor:** honor skill HITL profiles ([#3380](https://github.com/djm204/frankenbeast/issues/3380)) ([ebe1d2f](https://github.com/djm204/frankenbeast/commit/ebe1d2fb7746bd8b57a2a8316c8dc166804514a3))
* import shared ServerSocketEvent type ([#3321](https://github.com/djm204/frankenbeast/issues/3321)) ([ed900f2](https://github.com/djm204/frankenbeast/commit/ed900f243dea5775250482008cc2f0963c1ad7e4))
* improve wizard step indicator accessibility ([#3325](https://github.com/djm204/frankenbeast/issues/3325)) ([6587733](https://github.com/djm204/frankenbeast/commit/6587733f06ce00868ac274d5b7bbfdef7a2b182e))
* **live-bench:** harden run directory cleanup ([#3294](https://github.com/djm204/frankenbeast/issues/3294)) ([a5761a5](https://github.com/djm204/frankenbeast/commit/a5761a554f2b45fc602416bfebf27d483da57890))
* **live-bench:** validate artifact paths ([#3293](https://github.com/djm204/frankenbeast/issues/3293)) ([710c9d0](https://github.com/djm204/frankenbeast/commit/710c9d097bdc98805d9544fb8e15b46c154c4f27))
* **mcp-suite:** sanitize proxy audit arguments ([#3446](https://github.com/djm204/frankenbeast/issues/3446)) ([6b99e84](https://github.com/djm204/frankenbeast/commit/6b99e841b449df7888c3794a7a938d6f32f0ef90))
* **mcp:** close observer resources on shutdown ([#3250](https://github.com/djm204/frankenbeast/issues/3250)) ([82272c1](https://github.com/djm204/frankenbeast/commit/82272c13bd420769db6ec7b0e6569cd4d78ce9c8))
* **mcp:** close post-tool redaction gaps ([0ecbc9e](https://github.com/djm204/frankenbeast/commit/0ecbc9e92484adc4a17c8f54d62b9f15287acc7f))
* **mcp:** cover prefixed credential forms ([36338f5](https://github.com/djm204/frankenbeast/commit/36338f5ad38cc3a297a43c2e779b31ed876ff514))
* **mcp:** cover serialized header redaction ([483ac18](https://github.com/djm204/frankenbeast/commit/483ac185667dee22da89464831c2a55f0ebe30a6))
* **mcp:** enforce per-tool execution deadlines ([#3238](https://github.com/djm204/frankenbeast/issues/3238)) ([88f56de](https://github.com/djm204/frankenbeast/commit/88f56de4b31b3e5931fc3bc08c773b76fa9e9acf))
* **mcp:** preserve governance while redacting outputs ([cbe9cab](https://github.com/djm204/frankenbeast/commit/cbe9cabfabeae3ceb5359fa14009a3b9b106739d))
* **mcp:** redact credential pair structures ([9ace190](https://github.com/djm204/frankenbeast/commit/9ace190962eab939e9a93bd3cb38568bd12edb1f))
* **mcp:** redact post-tool observer payload secrets ([52d47e4](https://github.com/djm204/frankenbeast/commit/52d47e421f95c0f9e40cd225e324cbb40454b248))
* **mcp:** reject unsafe integer arguments ([#3393](https://github.com/djm204/frankenbeast/issues/3393)) ([25cb09f](https://github.com/djm204/frankenbeast/commit/25cb09fc25adbaf3d9dc001415acfb4de4c5138c))
* **memory:** address audit report codex findings ([4ba8915](https://github.com/djm204/frankenbeast/commit/4ba8915a63f8fc0d1cdbd5527ba7cf523290ae20))
* **memory:** harden audit event deduplication ([5f74d63](https://github.com/djm204/frankenbeast/commit/5f74d63195816c3ccb9903fccfd3e6cc7fc37205))
* **memory:** preserve audit provenance for access reports ([b28a6a8](https://github.com/djm204/frankenbeast/commit/b28a6a87efce1f28dee83158e18c1f0626b49a4b))
* **observer:** add idempotent webhook receipts ([#2350](https://github.com/djm204/frankenbeast/issues/2350)) ([b6ab9f1](https://github.com/djm204/frankenbeast/commit/b6ab9f145de48914adf7c318b05faa2f97235fb8))
* **observer:** batch SQLite adapter drains ([#3417](https://github.com/djm204/frankenbeast/issues/3417)) ([eeba02e](https://github.com/djm204/frankenbeast/commit/eeba02eff4cad61607956caf5b0655b782c1fed6))
* **observer:** bound MultiAdapter list fan-out ([#3597](https://github.com/djm204/frankenbeast/issues/3597)) ([c38773a](https://github.com/djm204/frankenbeast/commit/c38773a00d0631b8e1d539bb187e0b618716b8d8))
* **observer:** expose unknown model cost attribution ([#3637](https://github.com/djm204/frankenbeast/issues/3637)) ([a917af3](https://github.com/djm204/frankenbeast/commit/a917af37b46d1bc39d4fcb4d9d01b3997f6445ba))
* **observer:** make SQLite worker shutdown non-blocking ([#3623](https://github.com/djm204/frankenbeast/issues/3623)) ([d16415b](https://github.com/djm204/frankenbeast/commit/d16415bcc35516ff3d219f18c7b0f1a9f5a68015))
* **observer:** offload SQLite operations to worker ([#3444](https://github.com/djm204/frankenbeast/issues/3444)) ([c527b11](https://github.com/djm204/frankenbeast/commit/c527b117a9d4744029172b87e8e77e47760a59cc))
* **observer:** retry sqlite lock failures ([7723f66](https://github.com/djm204/frankenbeast/commit/7723f66f67591e6e3fafe3af97bca6a53fb2c77b))
* **orchestrator:** add crash-only worker restart contract ([#2560](https://github.com/djm204/frankenbeast/issues/2560)) ([ed23c8d](https://github.com/djm204/frankenbeast/commit/ed23c8ded62c71ffb79ad73a332644751bf039b6))
* **orchestrator:** bound beast run log growth ([#2404](https://github.com/djm204/frankenbeast/issues/2404)) ([c763d97](https://github.com/djm204/frankenbeast/commit/c763d97e31970a699353af6eab7ca47b75cd0f39))
* **orchestrator:** clamp parsed rate-limit sleeps ([#3264](https://github.com/djm204/frankenbeast/issues/3264)) ([728f0c4](https://github.com/djm204/frankenbeast/commit/728f0c41fb0af63906441f8dc0681f2b1bbb580c)), closes [#3172](https://github.com/djm204/frankenbeast/issues/3172)
* **orchestrator:** clean abandoned beast worktrees ([fc24446](https://github.com/djm204/frankenbeast/commit/fc2444614a7add519d4edaa0be22ea3744184e76)), closes [#1744](https://github.com/djm204/frankenbeast/issues/1744)
* **orchestrator:** isolate cached Claude sessions ([#3367](https://github.com/djm204/frankenbeast/issues/3367)) ([89dc035](https://github.com/djm204/frankenbeast/commit/89dc03518413ada97adf26e4f5297b8becbdcf8d))
* **orchestrator:** make kanban updates idempotent ([#2549](https://github.com/djm204/frankenbeast/issues/2549)) ([9523167](https://github.com/djm204/frankenbeast/commit/95231673319fca0ebbd9a94dd3d1b42d3ce715ce))
* **orchestrator:** omit comms provider error bodies ([#3638](https://github.com/djm204/frankenbeast/issues/3638)) ([e9b6703](https://github.com/djm204/frankenbeast/commit/e9b6703ff26ef9461eca04deee7e9c38c4674a83))
* **orchestrator:** paginate tracked agent listings ([#3418](https://github.com/djm204/frankenbeast/issues/3418)) ([98cf74b](https://github.com/djm204/frankenbeast/commit/98cf74b1dcea83424df14a4a6e21e74ec21e64db))
* **orchestrator:** prevent duplicate terminal input ([#3436](https://github.com/djm204/frankenbeast/issues/3436)) ([fd4517b](https://github.com/djm204/frankenbeast/commit/fd4517b0bd1e365942b6e1dd55cf31397fb004e7)), closes [#3364](https://github.com/djm204/frankenbeast/issues/3364)
* **orchestrator:** remove stale banner dependencies ([#3383](https://github.com/djm204/frankenbeast/issues/3383)) ([84bcac1](https://github.com/djm204/frankenbeast/commit/84bcac15c7e64204b244b983a0a77e55204d3e83))
* **orchestrator:** resolve late restart contract review ([#2616](https://github.com/djm204/frankenbeast/issues/2616)) ([eed99f4](https://github.com/djm204/frankenbeast/commit/eed99f4e07e868db87a3a405fd40a1595cc56524))
* **orchestrator:** update Codex workspace sandbox args ([#3372](https://github.com/djm204/frankenbeast/issues/3372)) ([6dbe101](https://github.com/djm204/frankenbeast/commit/6dbe101caa2c3980502e68cef8a71dee18c395a3))
* **orchestrator:** validate cached llm entries on read ([38a25ed](https://github.com/djm204/frankenbeast/commit/38a25ed3be5c8f186876f3156bcf89d108fcf0b1))
* **orchestrator:** validate comms inbound payloads ([#3509](https://github.com/djm204/frankenbeast/issues/3509)) ([bbc2d24](https://github.com/djm204/frankenbeast/commit/bbc2d242c5a1d6c4ec4707628bb0dc24b509b0cb))
* **orchestrator:** verify recovered process identity ([#3441](https://github.com/djm204/frankenbeast/issues/3441)) ([d70b92e](https://github.com/djm204/frankenbeast/commit/d70b92eaff32a670546bee8463038685260ea505))
* **orchestrator:** verify signed runtime configs ([#2612](https://github.com/djm204/frankenbeast/issues/2612)) ([f9cadc3](https://github.com/djm204/frankenbeast/commit/f9cadc3644844ec1eb32e007054589be1012a0e5))
* **planner:** preserve task dependencies in addTask ([#3545](https://github.com/djm204/frankenbeast/issues/3545)) ([5a83c9f](https://github.com/djm204/frankenbeast/commit/5a83c9f22edac21bd533ff25a33d3db9094a2cd5))
* **planning:** persist live plan cycle progress ([#3368](https://github.com/djm204/frankenbeast/issues/3368)) ([3208efb](https://github.com/djm204/frankenbeast/commit/3208efb6c8b8679946e8f0e5c380fb2f76bf81ca))
* preserve Codex hooks backup on invalid JSON ([5656689](https://github.com/djm204/frankenbeast/commit/56566899ade1ad75cd0f37b9a4c9643d5c6df7ee))
* **release:** target repository for latest-tag repair ([#3618](https://github.com/djm204/frankenbeast/issues/3618)) ([67392e2](https://github.com/djm204/frankenbeast/commit/67392e2c0352fa62a85761b0e23216eeb94994c0))
* **reliability:** bound PR reviewer diff ingestion ([#3270](https://github.com/djm204/frankenbeast/issues/3270)) ([a27935a](https://github.com/djm204/frankenbeast/commit/a27935aeea9b7505a4b7180450efbe3a3f9d8897))
* **reviewer:** persist PR attempt diagnostics ([#3577](https://github.com/djm204/frankenbeast/issues/3577)) ([f801e6b](https://github.com/djm204/frankenbeast/commit/f801e6b0437635fe547182d0ee45e70650336984))
* **security:** address Codex redaction findings ([#2583](https://github.com/djm204/frankenbeast/issues/2583)) ([e497d90](https://github.com/djm204/frankenbeast/commit/e497d904af9fb9ee81aa7a1edc94f53aeb4f6f7d))
* **security:** audit HITL approval replay ([#2576](https://github.com/djm204/frankenbeast/issues/2576)) ([c89ea75](https://github.com/djm204/frankenbeast/commit/c89ea75593d8b75d1c787d978d1aedac15624f7b))
* **security:** bind observability ports to localhost ([#3627](https://github.com/djm204/frankenbeast/issues/3627)) ([00c82b5](https://github.com/djm204/frankenbeast/commit/00c82b50b2b1d96cb3afdc176a0540ae40d69c45))
* **security:** bound profile update request bodies ([#3508](https://github.com/djm204/frankenbeast/issues/3508)) ([8705537](https://github.com/djm204/frankenbeast/commit/870553719732e60e04e24a5ae1e7c37565534731))
* **security:** close child process scanner bypasses ([aa0c7ae](https://github.com/djm204/frankenbeast/commit/aa0c7ae713d54dac00a358411f254fcfb9fbb0cc))
* **security:** close child process scanner gaps ([928f30b](https://github.com/djm204/frankenbeast/commit/928f30bc16fcee92ff654713dc15e96294afb4e6))
* **security:** close child process scanner scope gaps ([87b9f77](https://github.com/djm204/frankenbeast/commit/87b9f7711c888698b536fb079cc7a0b8cadf2812))
* **security:** close child process scanner scope gaps ([96ac9ae](https://github.com/djm204/frankenbeast/commit/96ac9ae716f54bd5b4d4187b0d1f590554fe9006))
* **security:** close child process scanner scope gaps ([b6d92df](https://github.com/djm204/frankenbeast/commit/b6d92df7bbb73fee46800ae96949f055e8e7ddc8))
* **security:** close child process scanner scope gaps ([535efa6](https://github.com/djm204/frankenbeast/commit/535efa6d9612c2642b145506a21c40999651a1bc))
* **security:** close child process scanner scope gaps ([3402f66](https://github.com/djm204/frankenbeast/commit/3402f668e2142cf3bd4c4a764c3f4a03b8d170e5))
* **security:** close child process spawn variants ([a6ee9a1](https://github.com/djm204/frankenbeast/commit/a6ee9a12bc73916c6aec8edb927aeab4114d7fcf))
* **security:** close remaining spawn scanner gaps ([2f3cb0b](https://github.com/djm204/frankenbeast/commit/2f3cb0be2a4bf28d69ac5763315d6066d42fac06))
* **security:** cover child process import variants ([23c858e](https://github.com/djm204/frankenbeast/commit/23c858e887ccd61ce345c718123554de203955ea))
* **security:** cover child process syntax variants ([ec3cdf8](https://github.com/djm204/frankenbeast/commit/ec3cdf8d8ac3ba73605e0b4e7da25eb1255485a5))
* **security:** cover remaining child process aliases ([a362210](https://github.com/djm204/frankenbeast/commit/a3622104f0f1faa6ea413daf1529ce22f5d986de))
* **security:** cover typed child process aliases ([a01e8d6](https://github.com/djm204/frankenbeast/commit/a01e8d6cc1b698d8355102f95bbaacee7da4221c))
* **security:** disable anonymous Grafana by default ([#3633](https://github.com/djm204/frankenbeast/issues/3633)) ([8eea49d](https://github.com/djm204/frankenbeast/commit/8eea49d79c82f3fd64169d17af1dadb069119c38))
* **security:** enforce role tool manifests ([#2573](https://github.com/djm204/frankenbeast/issues/2573)) ([1d7e7c3](https://github.com/djm204/frankenbeast/commit/1d7e7c3b7c9255dd95d21863bb43790bc5a38e3d))
* **security:** gate cron skip-permissions mode ([#3184](https://github.com/djm204/frankenbeast/issues/3184)) ([7860153](https://github.com/djm204/frankenbeast/commit/7860153118fc741a5a4781ab8926379bfcdf0b50))
* **security:** guard cron installers from persisting PATs ([#3182](https://github.com/djm204/frankenbeast/issues/3182)) ([46ebc52](https://github.com/djm204/frankenbeast/commit/46ebc526ccd12965c3c20dcb4bccc7e07fd6d04e))
* **security:** harden child process alias discovery ([ab48c94](https://github.com/djm204/frankenbeast/commit/ab48c94101d8c1a5ce0b98b164fb5e577974ef93))
* **security:** harden child process alias tracking ([5e33832](https://github.com/djm204/frankenbeast/commit/5e338327deae48385bcacdf99d338466393051da))
* **security:** harden spawn alias scanner ([4dbf80f](https://github.com/djm204/frankenbeast/commit/4dbf80f851ede434060d3557af340221a2cea1d2))
* **security:** isolate concurrent SSE ticket cookies ([#3387](https://github.com/djm204/frankenbeast/issues/3387)) ([d826141](https://github.com/djm204/frankenbeast/commit/d82614172c45f3da9b8a6353fc198b5e55c18419))
* **security:** keep SSE tickets out of request URLs ([#3385](https://github.com/djm204/frankenbeast/issues/3385)) ([819a0f8](https://github.com/djm204/frankenbeast/commit/819a0f8d3726049a517d0eb02985ff89e74116e9))
* **security:** normalize child process import aliases ([51aa396](https://github.com/djm204/frankenbeast/commit/51aa39604bd575b534772a06cd65afcd4c719d7d))
* **security:** patch dependency audit vulnerabilities ([#3517](https://github.com/djm204/frankenbeast/issues/3517)) ([bde2a2c](https://github.com/djm204/frankenbeast/commit/bde2a2c12f633f0047a66029d13e30a8e9d61692))
* **security:** redact deterministic scan credential tokens ([#3183](https://github.com/djm204/frankenbeast/issues/3183)) ([79992cf](https://github.com/djm204/frankenbeast/commit/79992cfbb7b93e52e3681afd9dd571a695c8a7a8))
* **security:** redact spawn failure details ([#3239](https://github.com/djm204/frankenbeast/issues/3239)) ([cfc16da](https://github.com/djm204/frankenbeast/commit/cfc16da217696d34e0dd6c16198633c10688dcf5))
* **security:** redact tracked agent dispatch failures ([#3237](https://github.com/djm204/frankenbeast/issues/3237)) ([ac39f65](https://github.com/djm204/frankenbeast/commit/ac39f65941e7a2aaabc2a45ed724760e4800b000))
* **security:** track child process cron spawn aliases ([d6e4b5b](https://github.com/djm204/frankenbeast/commit/d6e4b5bf0dbab4103983e9f204e29c177daf50c7))
* **security:** track child process cron spawn aliases ([e7fef88](https://github.com/djm204/frankenbeast/commit/e7fef882fad9b9356cd66bf500c920b5ea3db434))
* **test:** allow scanner integration test headroom ([4c2443c](https://github.com/djm204/frankenbeast/commit/4c2443c47987286d45a5aa6f19119ab1212d2856))
* **types:** alias MCP suite and live bench sources ([#3386](https://github.com/djm204/frankenbeast/issues/3386)) ([84b24d9](https://github.com/djm204/frankenbeast/commit/84b24d9a5aef1004ae4da1ae563ac04541d914f5))
* **web:** adopt accessible non-modal detail drawer ([#3259](https://github.com/djm204/frankenbeast/issues/3259)) ([1dca742](https://github.com/djm204/frankenbeast/commit/1dca742fccbb2eb3d8f0028453f9841b37dfed69))
* **web:** announce module toggle state ([#3276](https://github.com/djm204/frankenbeast/issues/3276)) ([dd86f02](https://github.com/djm204/frankenbeast/commit/dd86f021526be81cd324e7a2e05e8321419397cd))
* **web:** back off chat websocket reconnects ([#3640](https://github.com/djm204/frankenbeast/issues/3640)) ([653e702](https://github.com/djm204/frankenbeast/commit/653e702418f284166409384fc76b6778976b0bbc))
* **web:** close SSE ticket persistence gaps ([#3243](https://github.com/djm204/frankenbeast/issues/3243)) ([6fbee34](https://github.com/djm204/frankenbeast/commit/6fbee3430631043647547680c1899d9897535dcc))
* **web:** persist SSE connection tickets ([#3241](https://github.com/djm204/frankenbeast/issues/3241)) ([84af3b3](https://github.com/djm204/frankenbeast/commit/84af3b381c5d9871777da392bce1db7b2ff371bd))
* **web:** reconcile timed-out approval responses ([#3588](https://github.com/djm204/frankenbeast/issues/3588)) ([45f042a](https://github.com/djm204/frankenbeast/commit/45f042aa12b2780831ec386431701165b26d3c57))
* **workspaces:** link all local packages ([#3249](https://github.com/djm204/frankenbeast/issues/3249)) ([f2c92e9](https://github.com/djm204/frankenbeast/commit/f2c92e95cd61e6719f0e2ac64459d43a4cc45461))


### Performance

* **orchestrator:** bound multi-pass planning latency ([#3373](https://github.com/djm204/frankenbeast/issues/3373)) ([3218426](https://github.com/djm204/frankenbeast/commit/3218426b3f997de65fc3bfeabb09cfe83b44ad87))


### Refactoring

* **web:** scope wizard Zustand selectors ([#3477](https://github.com/djm204/frankenbeast/issues/3477)) ([a762240](https://github.com/djm204/frankenbeast/commit/a7622408f9a345b9c3e20702b264b42834205945))


### Miscellaneous

* **deps:** bump actions/setup-python from 6 to 7 ([#3578](https://github.com/djm204/frankenbeast/issues/3578)) ([f10f32b](https://github.com/djm204/frankenbeast/commit/f10f32bfb2eb04e00c5cd023a9262f42076b25ff))
* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))
* **eslint:** enable type-aware promise linting ([#3435](https://github.com/djm204/frankenbeast/issues/3435)) ([c089f8b](https://github.com/djm204/frankenbeast/commit/c089f8b1cc0ff78a4fc5790567328b9c4928e8bf))
* merge main into issue 1727 branch ([43e2b7b](https://github.com/djm204/frankenbeast/commit/43e2b7b0bcb31d03a8e8443626ad6027ad7d0c8c))
* merge main into security scanner fix ([c480810](https://github.com/djm204/frankenbeast/commit/c4808106d27edd04fb877a721f59e11fb439ff6a))
* release main ([d19cce0](https://github.com/djm204/frankenbeast/commit/d19cce08188e79330228990ea311d38b0a2218eb))
* release main ([1064be4](https://github.com/djm204/frankenbeast/commit/1064be4436a8cc085155bf56d87668832c9e55bc))
* release main ([750094b](https://github.com/djm204/frankenbeast/commit/750094bab0859c49829b4abe85013a5007fc272b))
* release main ([100e3a8](https://github.com/djm204/frankenbeast/commit/100e3a887b6fbd538e8a1b83f4e88ce4caf6c443))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2553](https://github.com/djm204/frankenbeast/issues/2553)) ([1ca33c2](https://github.com/djm204/frankenbeast/commit/1ca33c2aa6e68792886ef599d1ac35bebcc8e3c9))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3400](https://github.com/djm204/frankenbeast/issues/3400)) ([02fd894](https://github.com/djm204/frankenbeast/commit/02fd894bf6e7453e56d3446a73be277431ae6e12))
* release main ([#3407](https://github.com/djm204/frankenbeast/issues/3407)) ([c1cb208](https://github.com/djm204/frankenbeast/commit/c1cb208923376aef3eccd371b178352abb2a6c9c))
* release main ([#3521](https://github.com/djm204/frankenbeast/issues/3521)) ([a3c8c12](https://github.com/djm204/frankenbeast/commit/a3c8c121f2ff4b7563c88cce9b31d6163bba82b7))
* release main ([#3606](https://github.com/djm204/frankenbeast/issues/3606)) ([3d33c74](https://github.com/djm204/frankenbeast/commit/3d33c746587a861c97c1e140e93e536ec7d23f23))
* **tasks:** remove closeout progress artifact ([79ef76f](https://github.com/djm204/frankenbeast/commit/79ef76f4b9e72221db2a0988f7bafe245df18347))
* **types:** enforce workspace strictness ([#3458](https://github.com/djm204/frankenbeast/issues/3458)) ([503b644](https://github.com/djm204/frankenbeast/commit/503b6448f05f74ccd28493fcf8f46a23ba4d80aa))
* **web:** upgrade jest-dom to version 7 ([#3476](https://github.com/djm204/frankenbeast/issues/3476)) ([2158876](https://github.com/djm204/frankenbeast/commit/2158876397237fbb1480f55008303cbcc067f9be))


### Documentation

* add reusable lesson on cache schema validation ([295d8f2](https://github.com/djm204/frankenbeast/commit/295d8f2604890e9a9fafa5e168f972c65ac7421d))
* **architecture:** reconcile workspace package counts ([#3376](https://github.com/djm204/frankenbeast/issues/3376)) ([e15572a](https://github.com/djm204/frankenbeast/commit/e15572aa400cbbcb0e9e3acbb54793638c696270)), closes [#3370](https://github.com/djm204/frankenbeast/issues/3370)
* **data-flow:** refresh current-state anchor ([#2644](https://github.com/djm204/frankenbeast/issues/2644)) ([cfe14d1](https://github.com/djm204/frankenbeast/commit/cfe14d19229891faee3c7a5bac4b464a7efbc752)), closes [#2642](https://github.com/djm204/frankenbeast/issues/2642)
* document npm 11 packageManager requirement in ramp-up ([#3324](https://github.com/djm204/frankenbeast/issues/3324)) ([84b1f7b](https://github.com/djm204/frankenbeast/commit/84b1f7ba04ffe03071adfc48c9a0a70f72394469))
* **dr:** add backup retention policy ([#2345](https://github.com/djm204/frankenbeast/issues/2345)) ([394da89](https://github.com/djm204/frankenbeast/commit/394da893c2c0c93bcc9b61261304029dc90eefbe))
* **dr:** add corrupted worktree and queue runbook ([#2547](https://github.com/djm204/frankenbeast/issues/2547)) ([b143462](https://github.com/djm204/frankenbeast/commit/b14346247f3193a012db5a636298a4ffe1b44647))
* **dr:** add provider outage recovery drill ([#2398](https://github.com/djm204/frankenbeast/issues/2398)) ([6a7ded6](https://github.com/djm204/frankenbeast/commit/6a7ded6f0e9cf7f408fa11a07fcb20029016a391)), closes [#1722](https://github.com/djm204/frankenbeast/issues/1722)
* **examples:** add runnable sample projects ([#3524](https://github.com/djm204/frankenbeast/issues/3524)) ([7d115ef](https://github.com/djm204/frankenbeast/commit/7d115ef6525f2761b636e1b77f6793185572510d))
* **guides:** remove duplicate dashboard chat env matrix ([686cc74](https://github.com/djm204/frankenbeast/commit/686cc7480a37a496272b47db2b46fdf3de1b0aa0)), closes [#2649](https://github.com/djm204/frankenbeast/issues/2649)
* **lessons:** close bearer token code span ([#3391](https://github.com/djm204/frankenbeast/issues/3391)) ([88b4251](https://github.com/djm204/frankenbeast/commit/88b42510fa1370ec70d8b660481cf68507aae28a))
* **mcp:** use canonical registry tool IDs ([#3571](https://github.com/djm204/frankenbeast/issues/3571)) ([3c50cb1](https://github.com/djm204/frankenbeast/commit/3c50cb18e99bed07733b591968aa0bf25f69cb38))
* **onboarding:** add agent architecture map ([#2604](https://github.com/djm204/frankenbeast/issues/2604)) ([5de6ccc](https://github.com/djm204/frankenbeast/commit/5de6ccc97b497dd672b77b5762b288d0ff203fd6))
* **onboarding:** add architecture reading path ([#2324](https://github.com/djm204/frankenbeast/issues/2324)) ([a23a3a4](https://github.com/djm204/frankenbeast/commit/a23a3a4e988e1223c3ab3a736b11c2e20a856a50))
* **onboarding:** add coding-agent PR etiquette guide ([e5d8697](https://github.com/djm204/frankenbeast/commit/e5d869715c13950290834ccb49bbdafa06ed3a6c)), closes [#1770](https://github.com/djm204/frankenbeast/issues/1770)
* **onboarding:** add dashboard UX contribution path ([#3271](https://github.com/djm204/frankenbeast/issues/3271)) ([62e1189](https://github.com/djm204/frankenbeast/commit/62e118946555afc3157d1047ed548bae0b30a261))
* **onboarding:** add docs-only contribution quickstart ([#3260](https://github.com/djm204/frankenbeast/issues/3260)) ([8243113](https://github.com/djm204/frankenbeast/commit/82431139cdd1fb15ae455cf9feaedb323cbab9ca))
* **onboarding:** add first contribution guide ([#3254](https://github.com/djm204/frankenbeast/issues/3254)) ([9ced9ef](https://github.com/djm204/frankenbeast/commit/9ced9ef43ab02b8d0866db6b85e6356c330e893c))
* **onboarding:** add first PR completion path ([#3277](https://github.com/djm204/frankenbeast/issues/3277)) ([cef1dfa](https://github.com/djm204/frankenbeast/commit/cef1dfa55a17a89f8bb5eaa705f2415dd434cd0a))
* **onboarding:** add first PR handoff recipe ([#3266](https://github.com/djm204/frankenbeast/issues/3266)) ([d1c5d5a](https://github.com/djm204/frankenbeast/commit/d1c5d5a30dc6d75ccf54e05691bbfe938ac99c37))
* **onboarding:** add first-contribution help path ([#3267](https://github.com/djm204/frankenbeast/issues/3267)) ([a2b9963](https://github.com/djm204/frankenbeast/commit/a2b99638afbf848cbc68041dfaf6c0425496cdc4))
* **onboarding:** add first-pr agent runbook ([#2558](https://github.com/djm204/frankenbeast/issues/2558)) ([d882caa](https://github.com/djm204/frankenbeast/commit/d882caae7f4dcdd77ef730eef8647c19e0b9e0e8))
* **onboarding:** add first-PR CI triage guide ([#3287](https://github.com/djm204/frankenbeast/issues/3287)) ([20e894a](https://github.com/djm204/frankenbeast/commit/20e894a3612551183aea2a44f3413108e10a25ac))
* **onboarding:** add fork recovery guide ([#3273](https://github.com/djm204/frankenbeast/issues/3273)) ([03f295c](https://github.com/djm204/frankenbeast/commit/03f295c17c2bab1a1181ded8beced0b1c62c67b8))
* **onboarding:** add goal-based guide index ([#3242](https://github.com/djm204/frankenbeast/issues/3242)) ([dcea12c](https://github.com/djm204/frankenbeast/commit/dcea12cde950c9b56bc377081cfe1d2d1d4c0247))
* **onboarding:** add issue complexity rubric ([#2355](https://github.com/djm204/frankenbeast/issues/2355)) ([9848062](https://github.com/djm204/frankenbeast/commit/984806211c28fed585a83860c507588087151fe6))
* **onboarding:** add local service dependency explainer ([#2336](https://github.com/djm204/frankenbeast/issues/2336)) ([790dea2](https://github.com/djm204/frankenbeast/commit/790dea2470f8b5593bb1e7627ef792329615b2e1))
* **onboarding:** add persona quickstart tracks ([#2584](https://github.com/djm204/frankenbeast/issues/2584)) ([9efb790](https://github.com/djm204/frankenbeast/commit/9efb7908479177f49c7f2ba98cc6e5a7c9de0ff3))
* **onboarding:** add PM-swarm runtime glossary ([2d482b8](https://github.com/djm204/frankenbeast/commit/2d482b8320533cedb5ea325c7a3fbae62deb5a74))
* **onboarding:** add pull request self-review checklist ([#3288](https://github.com/djm204/frankenbeast/issues/3288)) ([8e2a5d8](https://github.com/djm204/frankenbeast/commit/8e2a5d8af4700574bfd2bab882ba5f80b765422e))
* **onboarding:** add release deployment mental model ([#2571](https://github.com/djm204/frankenbeast/issues/2571)) ([538d7d9](https://github.com/djm204/frankenbeast/commit/538d7d91337073e56ac8a817589358caafa4a78a))
* **onboarding:** add repository ownership manifest ([#2332](https://github.com/djm204/frankenbeast/issues/2332)) ([9f580f1](https://github.com/djm204/frankenbeast/commit/9f580f1f9d1199fa6bc076750112fbf51307a341))
* **onboarding:** add setup troubleshooting matrix ([#2569](https://github.com/djm204/frankenbeast/issues/2569)) ([d868b1c](https://github.com/djm204/frankenbeast/commit/d868b1caa785c74ac352b080fb5e3c04a730faee)), closes [#1701](https://github.com/djm204/frankenbeast/issues/1701)
* **onboarding:** add stalled worker troubleshooting guide ([380949a](https://github.com/djm204/frankenbeast/commit/380949a3f77a89ae2ae17124f9a20c1ed9b59eea))
* **onboarding:** add starter issue discovery guide ([#3261](https://github.com/djm204/frankenbeast/issues/3261)) ([b1758cc](https://github.com/djm204/frankenbeast/commit/b1758ccdf70d6f6d12bfbfd459357536dc033ecb))
* **onboarding:** add test command decision tree ([a1acabe](https://github.com/djm204/frankenbeast/commit/a1acabe7c24dd81ddbe08e97d2b870f1a07e3e44)), closes [#1772](https://github.com/djm204/frankenbeast/issues/1772)
* **onboarding:** address dependency explainer followups ([#2564](https://github.com/djm204/frankenbeast/issues/2564)) ([c65711f](https://github.com/djm204/frankenbeast/commit/c65711f5fbae37afee81396aef032346e4c0d18c))
* **onboarding:** expand PM-swarm runtime glossary ([6b49658](https://github.com/djm204/frankenbeast/commit/6b4965812325632950624e8820a71ce1ba107c3a)), closes [#1703](https://github.com/djm204/frankenbeast/issues/1703)
* **onboarding:** explain the first review feedback loop ([#3262](https://github.com/djm204/frankenbeast/issues/3262)) ([176215b](https://github.com/djm204/frankenbeast/commit/176215b8c084ea3db60f9b9ec82a8923ca9595a4)), closes [#2539](https://github.com/djm204/frankenbeast/issues/2539)
* **onboarding:** map agent roles to repository responsibilities ([#2339](https://github.com/djm204/frankenbeast/issues/2339)) ([b585c69](https://github.com/djm204/frankenbeast/commit/b585c697c85ccbc4fc37aaf3bc82880656220189))
* **onboarding:** relocate concise agent ramp-up guide ([#3396](https://github.com/djm204/frankenbeast/issues/3396)) ([c39eb74](https://github.com/djm204/frankenbeast/commit/c39eb74886803b2a8f041553cfc742e0655aa483))
* **readme:** add architecture text alternatives ([#3452](https://github.com/djm204/frankenbeast/issues/3452)) ([5bcb776](https://github.com/djm204/frankenbeast/commit/5bcb7765e3f9b5f55b59984858a719b131b22372))
* **readme:** clarify ADR reference status ([#3522](https://github.com/djm204/frankenbeast/issues/3522)) ([3e79597](https://github.com/djm204/frankenbeast/commit/3e79597790f2a8e62cf84e82b0ff81012263a839))
* **readme:** clarify current testing baseline ([#3478](https://github.com/djm204/frankenbeast/issues/3478)) ([3662316](https://github.com/djm204/frankenbeast/commit/36623164ad99d80a52db6f26c291144633a9e6c0))
* **readme:** explain issue label filters ([#3442](https://github.com/djm204/frankenbeast/issues/3442)) ([2a32548](https://github.com/djm204/frankenbeast/commit/2a32548fb530d9cbb27a57d177a5e198606675c8))
* **readme:** link package map before architecture ([#3404](https://github.com/djm204/frankenbeast/issues/3404)) ([52f28dc](https://github.com/djm204/frankenbeast/commit/52f28dc297c7b8deb744a4ac85e9305ac080b48b))
* **readme:** link ramp-up guide from onboarding ([#2654](https://github.com/djm204/frankenbeast/issues/2654)) ([d0c057c](https://github.com/djm204/frankenbeast/commit/d0c057c89f8b64e9a43f51cade6745550d028d71))
* **readme:** remove stale release announcement ([#3379](https://github.com/djm204/frankenbeast/issues/3379)) ([88b9082](https://github.com/djm204/frankenbeast/commit/88b90827c3347bfd2a6507fe8e8fdb55c0cd8bdf))
* **readme:** update external agent integration index ([#3377](https://github.com/djm204/frankenbeast/issues/3377)) ([3b05391](https://github.com/djm204/frankenbeast/commit/3b05391a52a1d49f543080e53db2975c38dba3a3))
* **readme:** use plan for design document example ([#3382](https://github.com/djm204/frankenbeast/issues/3382)) ([6c778e1](https://github.com/djm204/frankenbeast/commit/6c778e13128a39d6e0de54fcaaaa5041257b104c))
* record Beast log containment lesson ([#3282](https://github.com/djm204/frankenbeast/issues/3282)) ([947eb8d](https://github.com/djm204/frankenbeast/commit/947eb8d0f79acdaf43417a15c2a10e5bbe84e370))
* record Codex usage-limit lessons for init hooks fix ([c3fd1ab](https://github.com/djm204/frankenbeast/commit/c3fd1abeda2f276eec8e4aaf19d0819b9856bdcb))
* record memory governance closeout lesson ([374c091](https://github.com/djm204/frankenbeast/commit/374c0910c1e5aa48133f4d971cb2c9f9792f61b7))
* remove PM-swarm terminology from Frankenbeast docs ([dcf183d](https://github.com/djm204/frankenbeast/commit/dcf183da6c8c176ecabd5278adbd6d3e6068be17))
* replace legacy architecture labels ([#2655](https://github.com/djm204/frankenbeast/issues/2655)) ([852ecb0](https://github.com/djm204/frankenbeast/commit/852ecb0f5a2793c75805773f6b4a5ba7577116a2)), closes [#2652](https://github.com/djm204/frankenbeast/issues/2652)
* **resolve:** record pr 2358 closeout lessons ([b4f21f0](https://github.com/djm204/frankenbeast/commit/b4f21f0a3ed583607e2577cb41bc198f72686e43))
* **security:** document secret backend argv safeguards ([#3278](https://github.com/djm204/frankenbeast/issues/3278)) ([50c131d](https://github.com/djm204/frankenbeast/commit/50c131dce8619a0a32c3de017007ca87784e394c))
* **security:** document Telegram webhook migration ([#3233](https://github.com/djm204/frankenbeast/issues/3233)) ([ca3be5a](https://github.com/djm204/frankenbeast/commit/ca3be5aec19de914d53d8e15b08b00c2009cae67))
* **tasks:** record namespace spawn repair PR ([1b58615](https://github.com/djm204/frankenbeast/commit/1b58615ff53f0fd85ff46f22a0fa9462c88b1a52))
* **tasks:** update issue 1727 closeout progress ([2bf3c5e](https://github.com/djm204/frankenbeast/commit/2bf3c5e42b9db0211761041aabee1697c66990a4))
* update dashboard chat provider troubleshooting ([#3519](https://github.com/djm204/frankenbeast/issues/3519)) ([2f7d9d4](https://github.com/djm204/frankenbeast/commit/2f7d9d447971536e73e73a2481278ed6ec879d17))
* update pr2358 closeout progress ([e719c32](https://github.com/djm204/frankenbeast/commit/e719c324f8752a207222305a20bde137c821bd74))
* **web:** clarify canonical dashboard SSE endpoint ([#3229](https://github.com/djm204/frankenbeast/issues/3229)) ([41c48b2](https://github.com/djm204/frankenbeast/commit/41c48b21c616cf4eb3e1d98349a21af92d75dfce))


### CI/CD

* **actions:** cancel superseded pull request runs ([#3251](https://github.com/djm204/frankenbeast/issues/3251)) ([8224329](https://github.com/djm204/frankenbeast/commit/8224329380ce6f3b9afb802506edb5290eea5d66))
* add explicit workflow job timeouts ([#3300](https://github.com/djm204/frankenbeast/issues/3300)) ([da21d37](https://github.com/djm204/frankenbeast/commit/da21d379af781c2b78a351f0c934b4b41a37f2df))
* **release:** fail closed during latest-tag repair ([#3449](https://github.com/djm204/frankenbeast/issues/3449)) ([a5d6efb](https://github.com/djm204/frankenbeast/commit/a5d6efbc43ad0c42e6703c83344085b6fa0d9c48))
* **security:** restrict workflow token permissions ([#3290](https://github.com/djm204/frankenbeast/issues/3290)) ([d1c3eb7](https://github.com/djm204/frankenbeast/commit/d1c3eb7d097a415178234f5bcfe6b4171831e0ea))
* **testing:** publish coverage artifacts ([#3283](https://github.com/djm204/frankenbeast/issues/3283)) ([d6a38dc](https://github.com/djm204/frankenbeast/commit/d6a38dcc2fbfebece7df290a8c1dd0dcb20807a1))
* **types:** run root typecheck explicitly ([#3291](https://github.com/djm204/frankenbeast/issues/3291)) ([337d99b](https://github.com/djm204/frankenbeast/commit/337d99b4c61ce3988ab30ea5383105d401a7e911))


### Tests

* add RAMP_UP package drift guard for workspace metadata ([#3319](https://github.com/djm204/frankenbeast/issues/3319)) ([69cf567](https://github.com/djm204/frankenbeast/commit/69cf5673496882a6239cc136b9f02e553829edde))
* **availability:** add synthetic uptime probes ([#2401](https://github.com/djm204/frankenbeast/issues/2401)) ([e5a49a7](https://github.com/djm204/frankenbeast/commit/e5a49a7f0deb5a9fa31089e90ef55ef9ed613670))
* **availability:** simulate provider outage fallback paths ([#2545](https://github.com/djm204/frankenbeast/issues/2545)) ([4b86f20](https://github.com/djm204/frankenbeast/commit/4b86f20ca109dad07edabfcb785c7df3b9fd3722))
* **brain:** lock in atomic working-memory flushes ([#3552](https://github.com/djm204/frankenbeast/issues/3552)) ([879e650](https://github.com/djm204/frankenbeast/commit/879e650d59d2e2973d4b523ee406f2939ea4b2ba))
* **ci:** guard Docker sandbox smoke skip in CI ([e021e28](https://github.com/djm204/frankenbeast/commit/e021e280a3cf31a2209d8900daaf79f34f5ef835)), closes [#2056](https://github.com/djm204/frankenbeast/issues/2056)
* **config:** derive path aliases from package metadata ([#3474](https://github.com/djm204/frankenbeast/issues/3474)) ([922ed08](https://github.com/djm204/frankenbeast/commit/922ed087d82cd3b9a9ee462d10e1ea281e466ffa))
* **dr:** add restore rehearsal CI job ([#2546](https://github.com/djm204/frankenbeast/issues/2546)) ([8838488](https://github.com/djm204/frankenbeast/commit/883848837eaafd195f4a81b10b9c832d45f12cd8))
* harden HTTP abort fixture timing ([#3317](https://github.com/djm204/frankenbeast/issues/3317)) ([e28b70f](https://github.com/djm204/frankenbeast/commit/e28b70fd041522645309fb3a6d6d4cca7c9f6132))
* **mcp-suite:** split integration vitest config ([#2599](https://github.com/djm204/frankenbeast/issues/2599)) ([410b92c](https://github.com/djm204/frankenbeast/commit/410b92c2b79b193f91ca9efa2348af561e0ddf64))
* **onboarding:** guard Node and npm docs alignment ([#3252](https://github.com/djm204/frankenbeast/issues/3252)) ([bee60a6](https://github.com/djm204/frankenbeast/commit/bee60a60970ea10b614bf868e2c2440d7b980b28))
* **orchestrator:** add LLM chaos stability coverage ([cac1ee2](https://github.com/djm204/frankenbeast/commit/cac1ee2222f9465d99f479290279fc38a5cf280a))
* **orchestrator:** bound issue scheduler liveness payloads ([#2346](https://github.com/djm204/frankenbeast/issues/2346)) ([fa6f09c](https://github.com/djm204/frankenbeast/commit/fa6f09c0b3c3e51c66a4f82e1bbfa6947fe77754))
* **orchestrator:** cover cancellation stability ([#2348](https://github.com/djm204/frankenbeast/issues/2348)) ([afefd41](https://github.com/djm204/frankenbeast/commit/afefd4197320d9fac32f1619e605ca6e19142963))
* **pr-reviewer:** cover failed review retry ([#3455](https://github.com/djm204/frankenbeast/issues/3455)) ([422592b](https://github.com/djm204/frankenbeast/commit/422592ba42984e49ab4badfbf058fb9a0276f766))
* **root:** validate aggregate task wiring ([#3421](https://github.com/djm204/frankenbeast/issues/3421)) ([fad577e](https://github.com/djm204/frankenbeast/commit/fad577e2740de8fa228e6507abdca6824f521cf6))
* **sandbox:** reject root Docker user groups ([#3525](https://github.com/djm204/frankenbeast/issues/3525)) ([0b62bad](https://github.com/djm204/frankenbeast/commit/0b62bad03d6f0049b63cc4711c90046e51d4db28))
* **sandbox:** require valid Dockerfile user directive ([#3230](https://github.com/djm204/frankenbeast/issues/3230)) ([e7435af](https://github.com/djm204/frankenbeast/commit/e7435afb776faa445f057aa1fecdf861181c70d4))
* **security:** add secret redaction regression suite ([#2575](https://github.com/djm204/frankenbeast/issues/2575)) ([04a708f](https://github.com/djm204/frankenbeast/commit/04a708fcf324599aab9c490718ecd625090482c8))
* **security:** avoid gitleaks fixture secrets ([#2607](https://github.com/djm204/frankenbeast/issues/2607)) ([bbb7c87](https://github.com/djm204/frankenbeast/commit/bbb7c87d1621a778f6b521d84678f4009d15dafc)), closes [#2399](https://github.com/djm204/frankenbeast/issues/2399)
* **security:** cover cron prompt shell metacharacters ([12ad742](https://github.com/djm204/frankenbeast/commit/12ad7420c99fa6b929959247ff26b3af5dd21748))
* **stability:** add stream replay coverage ([#2578](https://github.com/djm204/frankenbeast/issues/2578)) ([92bacf0](https://github.com/djm204/frankenbeast/commit/92bacf068b14e2e6e25d97eca0f543afcad56a41))
* strengthen removed workspace wiring assertions ([#3523](https://github.com/djm204/frankenbeast/issues/3523)) ([4232160](https://github.com/djm204/frankenbeast/commit/42321603f02ecb344c7cc1922a9178cbb9cb90da))
* **turbo:** assert exact task contracts ([#3443](https://github.com/djm204/frankenbeast/issues/3443)) ([839c053](https://github.com/djm204/frankenbeast/commit/839c053e7376fd3130d482cd6197e84ef2a8bcd0))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).