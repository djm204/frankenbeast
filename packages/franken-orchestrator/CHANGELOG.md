# Changelog

## [0.44.0](https://github.com/djm204/frankenbeast/compare/@franken/orchestrator-v0.43.1...@franken/orchestrator-v0.44.0) (2026-07-14)


### Features

* **memory:** add snapshot diff command ([#1890](https://github.com/djm204/frankenbeast/issues/1890)) ([c7ab1a1](https://github.com/djm204/frankenbeast/commit/c7ab1a1ce10f463a05ebd6a1f316ee39915712c0))

## [0.43.1](https://github.com/djm204/frankenbeast/compare/@franken/orchestrator-v0.43.0...@franken/orchestrator-v0.43.1) (2026-07-14)


### Bug Fixes

* **web:** preserve wizard launch selections ([#1478](https://github.com/djm204/frankenbeast/issues/1478)) ([002d39b](https://github.com/djm204/frankenbeast/commit/002d39ba6f27ae8a62ee72431aea5ab145be056c))

## [0.43.0](https://github.com/djm204/frankenbeast/compare/@franken/orchestrator-v0.42.3...@franken/orchestrator-v0.43.0) (2026-07-14)


### Features

* **comms:** add delivery sensitivity policy ([#2037](https://github.com/djm204/frankenbeast/issues/2037)) ([cf0c945](https://github.com/djm204/frankenbeast/commit/cf0c94552c79bbb2f80ca27f72c2116217eb2f6c))
* **learning:** add PM handoff quality rubric ([#1990](https://github.com/djm204/frankenbeast/issues/1990)) ([cfa52f2](https://github.com/djm204/frankenbeast/commit/cfa52f24bb9b4f6d467f7ca2388fe972aa09aef8))
* **orchestrator:** add scoped credential inventory ([#2078](https://github.com/djm204/frankenbeast/issues/2078)) ([eb2fa82](https://github.com/djm204/frankenbeast/commit/eb2fa82184efca8a5572f5df2583558e88fc758c))
* **orchestrator:** track redaction provenance ([#2110](https://github.com/djm204/frankenbeast/issues/2110)) ([2f40524](https://github.com/djm204/frankenbeast/commit/2f40524b54854a5d3402548bd8ae62a3bbe46ccc))


### Bug Fixes

* bound provider error body diagnostics ([189e3b0](https://github.com/djm204/frankenbeast/commit/189e3b08b218bd4a6ad76db92c7f297fb0383fe6))
* enrich HTTP error context ([681a32d](https://github.com/djm204/frankenbeast/commit/681a32d638c3b818389746cf220b331d57821e37))
* enrich HTTP error context ([79b5b40](https://github.com/djm204/frankenbeast/commit/79b5b4064d85b7d2037b30a6b90431cf893def94))
* **governor:** resolve root test suite merge drift ([29270d5](https://github.com/djm204/frankenbeast/commit/29270d533f252535ff122b422d60095a949e6aab))
* harden HTTP error body handling ([ba89762](https://github.com/djm204/frankenbeast/commit/ba8976259b36f86639c99382bf9da27ce9d12d8b))
* harden HTTP error redaction ([e244b16](https://github.com/djm204/frankenbeast/commit/e244b16c21faaa562ea52cd2c7c0ef019e9fca6b))
* **http:** scrub urls and cloned diagnostic streams ([62fb98c](https://github.com/djm204/frankenbeast/commit/62fb98c3d95a5514de2d96c97af14d96504ca0d8))
* **lint:** require parseInt radix arguments ([023d526](https://github.com/djm204/frankenbeast/commit/023d526a400bc1cd4f2a71bb134b47d750ad7ac0))
* **orchestrator:** accept common interview approvals ([#1918](https://github.com/djm204/frankenbeast/issues/1918)) ([4e2770d](https://github.com/djm204/frankenbeast/commit/4e2770d3d506d1e9313ee5af5b07f30c361a0185))
* **orchestrator:** align Gemini API key availability ([#2061](https://github.com/djm204/frankenbeast/issues/2061)) ([ceead42](https://github.com/djm204/frankenbeast/commit/ceead4220edd4155c0bf2070875732c70ae79300))
* **orchestrator:** allow global flags before subcommand ([b4a996f](https://github.com/djm204/frankenbeast/commit/b4a996fd231fec667ccdadb2182a5fc94ae5572b)), closes [#1902](https://github.com/djm204/frankenbeast/issues/1902)
* **orchestrator:** bound JSON parsing inputs ([#2215](https://github.com/djm204/frankenbeast/issues/2215)) ([48e7556](https://github.com/djm204/frankenbeast/commit/48e7556e6574b620ea3ca460b30b95d1707c008d))
* **orchestrator:** cap context snapshot imports ([#1964](https://github.com/djm204/frankenbeast/issues/1964)) ([03f2559](https://github.com/djm204/frankenbeast/commit/03f2559d1cba29b5b690f8e8b9c9992c067ad7c0))
* **orchestrator:** clear approval metadata in response ([23c4cd2](https://github.com/djm204/frankenbeast/commit/23c4cd2fcb271654728494f157be6cf8905ef0f9))
* **orchestrator:** close beast attempt cleanup issue ([#2003](https://github.com/djm204/frankenbeast/issues/2003)) ([ae34c42](https://github.com/djm204/frankenbeast/commit/ae34c42ecba98db09aa5b43c097d8ecf0819170e))
* **orchestrator:** cover 1Password keys with symbols ([#1997](https://github.com/djm204/frankenbeast/issues/1997)) ([e3d1ed7](https://github.com/djm204/frankenbeast/commit/e3d1ed7bbff2d78797c5de8ba18caef2b634f4f9)), closes [#1950](https://github.com/djm204/frankenbeast/issues/1950)
* **orchestrator:** escape Windows keychain targets ([c25ee1d](https://github.com/djm204/frankenbeast/commit/c25ee1d3ed765d8cadf838586e90f8d6c07f6ec9))
* **orchestrator:** handle invalid init JSON ([#1621](https://github.com/djm204/frankenbeast/issues/1621)) ([b64be91](https://github.com/djm204/frankenbeast/commit/b64be91e667054dbdc6023c155528b681d791716))
* **orchestrator:** harden analytics filter inputs ([426fb83](https://github.com/djm204/frankenbeast/commit/426fb8327e6bfad859058c730b6f42a9724ff1dd)), closes [#1799](https://github.com/djm204/frankenbeast/issues/1799)
* **orchestrator:** harden approval command replay ([#1915](https://github.com/djm204/frankenbeast/issues/1915)) ([af07a0d](https://github.com/djm204/frankenbeast/commit/af07a0d973cf7470665186549b49b284b71a397c))
* **orchestrator:** harden browser control cookie mutations ([#1959](https://github.com/djm204/frankenbeast/issues/1959)) ([e63df06](https://github.com/djm204/frankenbeast/commit/e63df068734089145fb8c9b371899d73599eeb04))
* **orchestrator:** harden cleanup symlink handling ([#1927](https://github.com/djm204/frankenbeast/issues/1927)) ([de6a322](https://github.com/djm204/frankenbeast/commit/de6a3227a9a41dd134b465e0dc9b710d64a1ae57))
* **orchestrator:** isolate chat runtime continuation by session ([#1996](https://github.com/djm204/frankenbeast/issues/1996)) ([befc35f](https://github.com/djm204/frankenbeast/commit/befc35f3be15887983c738eea2b3e4b0150f3808))
* **orchestrator:** log CLI process kill failures ([#2214](https://github.com/djm204/frankenbeast/issues/2214)) ([d273e08](https://github.com/djm204/frankenbeast/commit/d273e08c4fa66897a70ce7a9551a0dea1b870691))
* **orchestrator:** normalize workspace root patterns ([6db7a05](https://github.com/djm204/frankenbeast/commit/6db7a0556eaf98be8a0bfbf52d27e53919589611)), closes [#1953](https://github.com/djm204/frankenbeast/issues/1953)
* **orchestrator:** parse config boolean env vars strictly ([#1403](https://github.com/djm204/frankenbeast/issues/1403)) ([e6086b3](https://github.com/djm204/frankenbeast/commit/e6086b39c7eefed545c300a950626640ee03cb2d))
* **orchestrator:** parse unnumbered interview questions ([512d61f](https://github.com/djm204/frankenbeast/commit/512d61f42a8f184f3cb5724b5439adc9eefaeaf9)), closes [#1899](https://github.com/djm204/frankenbeast/issues/1899)
* **orchestrator:** redact secret-like logger metadata ([b16ba4a](https://github.com/djm204/frankenbeast/commit/b16ba4ab7c0219267e44eb15ed4350738d4418c2)), closes [#1801](https://github.com/djm204/frankenbeast/issues/1801)
* **orchestrator:** reject extra CLI positionals ([5e79de8](https://github.com/djm204/frankenbeast/commit/5e79de8bfcf6231a19693495f95dfd0e017fd480))
* **orchestrator:** reject invalid triage issue numbers ([#2025](https://github.com/djm204/frankenbeast/issues/2025)) ([db32719](https://github.com/djm204/frankenbeast/commit/db32719bfd51c49c26b7b62f60002606a1e08b50))
* **orchestrator:** reject malformed dashboard static port ([5bae0f5](https://github.com/djm204/frankenbeast/commit/5bae0f56646fae02ac5abb942af0a8e43f71538a)), closes [#2085](https://github.com/djm204/frankenbeast/issues/2085)
* **orchestrator:** reject stale approval chat input ([#1971](https://github.com/djm204/frankenbeast/issues/1971)) ([9350e11](https://github.com/djm204/frankenbeast/commit/9350e110c3a23b79f96e7de4a1bf23393938baf8))
* **orchestrator:** reject stale approval decisions ([d3e85f2](https://github.com/djm204/frankenbeast/commit/d3e85f28dade49ceb3373840859ded2928d80c09))
* **orchestrator:** reject stale approval responses ([#2148](https://github.com/djm204/frankenbeast/issues/2148)) ([3effbc1](https://github.com/djm204/frankenbeast/commit/3effbc152b40ceb0d5626b2cc73622d8fb57a028))
* **orchestrator:** require beasts action for mode flag ([#2000](https://github.com/djm204/frankenbeast/issues/2000)) ([f86a71d](https://github.com/djm204/frankenbeast/commit/f86a71ddb6b27c38486606ab349b36144bdc5783))
* **orchestrator:** require review for new runtime tools ([50f268b](https://github.com/djm204/frankenbeast/commit/50f268b567b10e53a2cd4ce2903a0c99303508bb))
* **orchestrator:** route comms reject actions through slash command ([41a5286](https://github.com/djm204/frankenbeast/commit/41a5286bce985053a43d22bbf170c9289bd42982))
* **orchestrator:** support managed chat rejection ([#1936](https://github.com/djm204/frankenbeast/issues/1936)) ([0552f23](https://github.com/djm204/frankenbeast/commit/0552f2374303c900f311162b699b99d2002c99b3))
* **orchestrator:** treat empty issue filters as no-op ([840690b](https://github.com/djm204/frankenbeast/commit/840690b84ef52b798dd0a2d94064d3cbb8c054f1)), closes [#2020](https://github.com/djm204/frankenbeast/issues/2020)
* **orchestrator:** validate chat session ids ([#2149](https://github.com/djm204/frankenbeast/issues/2149)) ([7677999](https://github.com/djm204/frankenbeast/commit/76779997a83d7cdf9063e4c417b8ab832e22456f))
* **orchestrator:** validate init security mode ([#2190](https://github.com/djm204/frankenbeast/issues/2190)) ([ccb1d41](https://github.com/djm204/frankenbeast/commit/ccb1d414ee85dec182cce3043431e568371e2cd0))
* **orchestrator:** validate replay content refs ([dbc2084](https://github.com/djm204/frankenbeast/commit/dbc208481fbacc9e76544d2f57d0578ce36a40c4)), closes [#2066](https://github.com/djm204/frankenbeast/issues/2066)
* **orchestrator:** wrap malformed run config JSON errors ([#1934](https://github.com/djm204/frankenbeast/issues/1934)) ([fed08f3](https://github.com/djm204/frankenbeast/commit/fed08f386a798eff14a6a7f82535237e013083ba))
* rate limit websocket chat messages before execution ([#1058](https://github.com/djm204/frankenbeast/issues/1058)) ([c43233b](https://github.com/djm204/frankenbeast/commit/c43233b7ffb95ab961be44e64989088ce4a31fe6))
* redact auth data in HTTP errors ([69f5f05](https://github.com/djm204/frankenbeast/commit/69f5f0540bccb21ccf11b943ec43e598fa12095a))
* **security:** deny cross-profile state access by default ([20333ff](https://github.com/djm204/frankenbeast/commit/20333ff4f2c363c63dae976286a59817c5e98ae0)), closes [#1784](https://github.com/djm204/frankenbeast/issues/1784)
* **security:** harden token comparisons ([#1961](https://github.com/djm204/frankenbeast/issues/1961)) ([82321ea](https://github.com/djm204/frankenbeast/commit/82321eae757df4eb7b78fad07d5752689a5402f8))


### Tests

* align HTTP error body mocks with stream readers ([26d7f44](https://github.com/djm204/frankenbeast/commit/26d7f44ae91989d26bdd5c8cfe9fa5adacdbfee6))
* **memory:** add injection budget coverage ([#2187](https://github.com/djm204/frankenbeast/issues/2187)) ([82f9948](https://github.com/djm204/frankenbeast/commit/82f994855644bedfeda01f82d84c402f5228106e))
* **orchestrator:** add deterministic event stream replay ([#2200](https://github.com/djm204/frankenbeast/issues/2200)) ([65ed2d8](https://github.com/djm204/frankenbeast/commit/65ed2d830ab4bd8c7a890a9952d9621db2c21bd0))
* **orchestrator:** cover Windows keychain target escaping ([b3170a3](https://github.com/djm204/frankenbeast/commit/b3170a3033973f8bdf3abd274dcf219e9a410e86)), closes [#1984](https://github.com/djm204/frankenbeast/issues/1984)
* **orchestrator:** guard e2e test discovery ([#1981](https://github.com/djm204/frankenbeast/issues/1981)) ([970cd87](https://github.com/djm204/frankenbeast/commit/970cd876dc35686e666174f664e9cc056d29b239))
* **orchestrator:** guard e2e zero-test discovery ([#1980](https://github.com/djm204/frankenbeast/issues/1980)) ([f8ca3da](https://github.com/djm204/frankenbeast/commit/f8ca3da95c037ffdd1ad355b254b30abb6235b49))
* **orchestrator:** lint singular test fixtures ([90279f7](https://github.com/djm204/frankenbeast/commit/90279f7307e948a892c9ac3ee20590946b0e69af)), closes [#1977](https://github.com/djm204/frankenbeast/issues/1977)
* **orchestrator:** make Beast SSE stream tests event-driven ([#2163](https://github.com/djm204/frankenbeast/issues/2163)) ([1be3c82](https://github.com/djm204/frankenbeast/commit/1be3c828125c7819335080fa145b240fd9922adb))
* **orchestrator:** stabilize http abort disconnect test ([1b66c04](https://github.com/djm204/frankenbeast/commit/1b66c04a1c1b92e34259521a9824662611cfdf65)), closes [#1932](https://github.com/djm204/frankenbeast/issues/1932)
* **orchestrator:** wait for agent failure events ([#2159](https://github.com/djm204/frankenbeast/issues/2159)) ([6ab7a98](https://github.com/djm204/frankenbeast/commit/6ab7a98a122a5a23730bd56012ffe995cda03612))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.7.0 to 0.8.0
    * @franken/governor bumped from 0.5.14 to 0.6.0
    * @franken/types bumped from 0.9.0 to 0.10.0
    * @franken/observer bumped from 0.7.16 to 0.7.17
    * @franken/planner bumped from 0.4.14 to 0.4.15
    * @franken/brain bumped from 0.7.5 to 0.8.0

## [0.42.3](https://github.com/djm204/frankenbeast/compare/@franken/orchestrator-v0.42.2...@franken/orchestrator-v0.42.3) (2026-07-11)


### Bug Fixes

* **orchestrator:** evict expired beast rate-limit counters ([e7cf20c](https://github.com/djm204/frankenbeast/commit/e7cf20c96a95301fa04a69a3ac0ce6b6c140e368)), closes [#1009](https://github.com/djm204/frankenbeast/issues/1009)
* **orchestrator:** harden unscoped snapshot restores ([#1565](https://github.com/djm204/frankenbeast/issues/1565)) ([a88f53e](https://github.com/djm204/frankenbeast/commit/a88f53e649e1f7cb803d5a7609b711269eb7a8a6))
* **orchestrator:** report corrupt Beast JSON hydration ([32a9096](https://github.com/djm204/frankenbeast/commit/32a90967a23fc2b83a69bb6cc20e56a5b071d4bb)), closes [#1008](https://github.com/djm204/frankenbeast/issues/1008)
* **orchestrator:** return 400 for malformed JSON in control-plane routes ([#1493](https://github.com/djm204/frankenbeast/issues/1493)) ([e049a7c](https://github.com/djm204/frankenbeast/commit/e049a7ce846c5506a1a9a92925ab1b9047b5c972))


### Tests

* **orchestrator:** assert CLI provider boundary failure ([#1865](https://github.com/djm204/frankenbeast/issues/1865)) ([fd92c4b](https://github.com/djm204/frankenbeast/commit/fd92c4b91fefcf4780c464857f93d7965e8e2d64))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.6.16 to 0.7.0

## [0.42.2](https://github.com/djm204/frankenbeast/compare/@franken/orchestrator-v0.42.1...@franken/orchestrator-v0.42.2) (2026-07-11)


### Bug Fixes

* **beasts:** align tracked-agent delete statuses ([#1604](https://github.com/djm204/frankenbeast/issues/1604)) ([95f0cba](https://github.com/djm204/frankenbeast/commit/95f0cba3e207094fa76ce7c8352a19494b6f6aaa)), closes [#1190](https://github.com/djm204/frankenbeast/issues/1190)
* **beasts:** reject malformed daemon pid files ([2beabe2](https://github.com/djm204/frankenbeast/commit/2beabe28917a53b0fc76dc362e2dd3f072e225e9)), closes [#995](https://github.com/djm204/frankenbeast/issues/995)
* **beasts:** return 404 for unknown interview sessions ([#1642](https://github.com/djm204/frankenbeast/issues/1642)) ([84467f0](https://github.com/djm204/frankenbeast/commit/84467f0031dac5cac3060a5166a5f6992a723050))
* **beasts:** return 404 for unknown run actions ([b613d82](https://github.com/djm204/frankenbeast/commit/b613d82c38e0e30ee60589e1c2d3d18feb9f1bc6)), closes [#1211](https://github.com/djm204/frankenbeast/issues/1211)
* **beasts:** surface Create Agent auto-dispatch failures ([f41de4f](https://github.com/djm204/frankenbeast/commit/f41de4f592d201066fa1503a0508248bd4b96849)), closes [#1212](https://github.com/djm204/frankenbeast/issues/1212)
* **comms:** acknowledge Discord interactions before processing ([e622768](https://github.com/djm204/frankenbeast/commit/e622768d836616dfead0f57a1dc4e4662d4f3564)), closes [#997](https://github.com/djm204/frankenbeast/issues/997)
* **network:** return 400 for unknown network service targets ([#1458](https://github.com/djm204/frankenbeast/issues/1458)) ([95afd83](https://github.com/djm204/frankenbeast/commit/95afd83002ccdb2a40fd5f56d9eca77ec43e6d31))
* **observer:** write audit trails atomically ([#1625](https://github.com/djm204/frankenbeast/issues/1625)) ([966521a](https://github.com/djm204/frankenbeast/commit/966521a41ac38f290c82abe1c6eaf1340acb4328))
* **orchestrator:** add ProcessSupervisor child process error cleanup ([#1460](https://github.com/djm204/frankenbeast/issues/1460)) ([f8b4bc6](https://github.com/djm204/frankenbeast/commit/f8b4bc6931c8747e649e5f47da93f03b495d487c))
* **orchestrator:** align 1Password key resolution ([0d1bdcc](https://github.com/djm204/frankenbeast/commit/0d1bdccf1cbe93f37d8aa9c241e05d9e2152bd1a)), closes [#677](https://github.com/djm204/frankenbeast/issues/677)
* **orchestrator:** avoid console.warn in console logger ([bd3a8d6](https://github.com/djm204/frankenbeast/commit/bd3a8d6bc1b137b7f879eb48292f7e19d4c3a2a9))
* **orchestrator:** bound chat gateway route metadata ([#1544](https://github.com/djm204/frankenbeast/issues/1544)) ([0f93b1f](https://github.com/djm204/frankenbeast/commit/0f93b1fc3b7ed574d72f4a6991e03ee15bf41512))
* **orchestrator:** clear stop exit telemetry ([47050ca](https://github.com/djm204/frankenbeast/commit/47050ca92943e5a2be515ddc3d3dfdc1528a1fd1))
* **orchestrator:** guard CLI provider spawns against startup failures ([5e6e249](https://github.com/djm204/frankenbeast/commit/5e6e2499ecdccf0b836116b2d9d0b808dbe81bd8)), closes [#1112](https://github.com/djm204/frankenbeast/issues/1112)
* **orchestrator:** guard domain allowlist tool scans ([#1614](https://github.com/djm204/frankenbeast/issues/1614)) ([d3f10c0](https://github.com/djm204/frankenbeast/commit/d3f10c0b27d4ba63230bda25ba3ec6013904e925))
* **orchestrator:** harden init JSON persistence ([#1638](https://github.com/djm204/frankenbeast/issues/1638)) ([a2827db](https://github.com/djm204/frankenbeast/commit/a2827dbfe7cf533bf2d3bad77d5a6a4c5f672b3a))
* **orchestrator:** harden managed chat websocket parsing ([292b57c](https://github.com/djm204/frankenbeast/commit/292b57ca35fc26c241c5abd527d246e042291158)), closes [#1082](https://github.com/djm204/frankenbeast/issues/1082)
* **orchestrator:** harden network state persistence ([#1568](https://github.com/djm204/frankenbeast/issues/1568)) ([40bcb6c](https://github.com/djm204/frankenbeast/commit/40bcb6c28fa7c85ff033e6dabb80e2f0ce864d6a))
* **orchestrator:** isolate beast event replay state ([b41b1b4](https://github.com/djm204/frankenbeast/commit/b41b1b43422270419011ea000051420671eaed86)), closes [#1101](https://github.com/djm204/frankenbeast/issues/1101)
* **orchestrator:** pass dashboard proxy target to web build ([#1637](https://github.com/djm204/frankenbeast/issues/1637)) ([f85ad00](https://github.com/djm204/frankenbeast/commit/f85ad00ae3bed6d66db8ce85bedd6525321dbe3c))
* **orchestrator:** preserve child spawn error details ([b4fb4ff](https://github.com/djm204/frankenbeast/commit/b4fb4ff05c9015c485eed06360af837ed4d208af)), closes [#1013](https://github.com/djm204/frankenbeast/issues/1013)
* **orchestrator:** probe long-running MCP health checks ([#1490](https://github.com/djm204/frankenbeast/issues/1490)) ([b7f670b](https://github.com/djm204/frankenbeast/commit/b7f670b41c65aca02cc47b0f820268d575c994d8))
* **orchestrator:** protect transcript message aliases ([8057c04](https://github.com/djm204/frankenbeast/commit/8057c0471f7d45b7b51d217cc5b43b8c85d88006)), closes [#1187](https://github.com/djm204/frankenbeast/issues/1187)
* **orchestrator:** reject invalid analytics outcomes ([#1641](https://github.com/djm204/frankenbeast/issues/1641)) ([b9424c4](https://github.com/djm204/frankenbeast/commit/b9424c4883f6a3c82c1d7e25b21dc4fb3e328aa6))
* **orchestrator:** reject malformed analytics pagination ([#1557](https://github.com/djm204/frankenbeast/issues/1557)) ([6a3cd18](https://github.com/djm204/frankenbeast/commit/6a3cd18f808200c45df2558bc4982ce00d110bc5))
* **orchestrator:** reject partial issue review numbers ([#1475](https://github.com/djm204/frankenbeast/issues/1475)) ([987c3b4](https://github.com/djm204/frankenbeast/commit/987c3b45e721c7d951d1486f98d6a91b2e535358))
* **orchestrator:** reject repo-local provider command trust ([#1646](https://github.com/djm204/frankenbeast/issues/1646)) ([3a8fe26](https://github.com/djm204/frankenbeast/commit/3a8fe2632801fdeaaed7bdbef3c95755be990ba4))
* **orchestrator:** report corrupt chat session files ([#1643](https://github.com/djm204/frankenbeast/issues/1643)) ([d62c992](https://github.com/djm204/frankenbeast/commit/d62c9929a556741889dffa443f0aee9e5c5b20f6))
* **orchestrator:** return 404 for missing beast run reads ([deddc4b](https://github.com/djm204/frankenbeast/commit/deddc4bf09e2975689a8030570e741ccac4f6a63)), closes [#989](https://github.com/djm204/frankenbeast/issues/989)
* **orchestrator:** return 404 for unknown Beast definition ([#1647](https://github.com/djm204/frankenbeast/issues/1647)) ([41d3998](https://github.com/djm204/frankenbeast/commit/41d3998fbdcdc0ba1ea83311ec11376e555556e7))
* **orchestrator:** terminate chat SSE turn streams ([5ed483a](https://github.com/djm204/frankenbeast/commit/5ed483a18b4615ea1a6c324603404354e9bb0a6d)), closes [#1532](https://github.com/djm204/frankenbeast/issues/1532)
* **orchestrator:** tighten e2e api failure skip boundary checks ([#1494](https://github.com/djm204/frankenbeast/issues/1494)) ([3e4d250](https://github.com/djm204/frankenbeast/commit/3e4d250fd1e2ffffa01788ede0bfa9fd5b9b7f2d))
* **orchestrator:** validate beast SSE replay cursors ([#1556](https://github.com/djm204/frankenbeast/issues/1556)) ([0bc4671](https://github.com/djm204/frankenbeast/commit/0bc46715d8a3da7e9b38248ca488eaa7cee060fd))
* **orchestrator:** validate SSE ticket durations ([#1600](https://github.com/djm204/frankenbeast/issues/1600)) ([a66e3be](https://github.com/djm204/frankenbeast/commit/a66e3be4d15ef044873083db061338ddfb381203)), closes [#1231](https://github.com/djm204/frankenbeast/issues/1231)
* replace nondeterministic calls with deterministic utilities ([#1441](https://github.com/djm204/frankenbeast/issues/1441)) ([1585acf](https://github.com/djm204/frankenbeast/commit/1585acf39bb993b06d2b975045641ad662a44459))
* **web:** expose tracked agent status filters ([#1506](https://github.com/djm204/frankenbeast/issues/1506)) ([6bf1e20](https://github.com/djm204/frankenbeast/commit/6bf1e2091ada17b0cbc24748c9b77f3aada42b9b)), closes [#1102](https://github.com/djm204/frankenbeast/issues/1102)
* **web:** load beast wizard model selectors from config ([c4247c4](https://github.com/djm204/frankenbeast/commit/c4247c46169aa2dc1c82f460e3a9d75aec58749e)), closes [#1174](https://github.com/djm204/frankenbeast/issues/1174)
* **web:** render controls for approval-paused agents ([756ef29](https://github.com/djm204/frankenbeast/commit/756ef2908139115c91b19086cc98fca4d0d8c788)), closes [#1172](https://github.com/djm204/frankenbeast/issues/1172)
* **whatsapp:** validate inbound message timestamps ([b1f9083](https://github.com/djm204/frankenbeast/commit/b1f9083d32322b7d949b8bb8c372c301a02629e6))


### Documentation

* **orchestrator:** document generic warning output ([#1650](https://github.com/djm204/frankenbeast/issues/1650)) ([dfebc79](https://github.com/djm204/frankenbeast/commit/dfebc79162b58e91e3d95a49f65ccb6b9607b2c0))
* **packages:** add remaining workspace READMEs ([#1576](https://github.com/djm204/frankenbeast/issues/1576)) ([c050151](https://github.com/djm204/frankenbeast/commit/c050151bcda2973825fd13d17751f348c8ce74f6))


### Tests

* add deterministic Vitest seed mode ([#1429](https://github.com/djm204/frankenbeast/issues/1429)) ([f12b497](https://github.com/djm204/frankenbeast/commit/f12b497a0662a1b519cbf07d442316c734dcc778))
* **cli:** cover invalid budget flag regression ([#1450](https://github.com/djm204/frankenbeast/issues/1450)) ([edd1823](https://github.com/djm204/frankenbeast/commit/edd1823416e06afba437d62a39addab43770ca0f))
* **orchestrator:** cover chat websocket peer cleanup ([e3386e1](https://github.com/djm204/frankenbeast/commit/e3386e108978397c9591af684d59f60a8a150ea4)), closes [#975](https://github.com/djm204/frankenbeast/issues/975)
* **orchestrator:** cover issues limit validation ([3940870](https://github.com/djm204/frankenbeast/commit/3940870f34ff8cd147c8ae566742583e39a23485)), closes [#974](https://github.com/djm204/frankenbeast/issues/974)
* **orchestrator:** cover live websocket chat sends ([#1570](https://github.com/djm204/frankenbeast/issues/1570)) ([8627ce1](https://github.com/djm204/frankenbeast/commit/8627ce162aaed29a0924e824011882b372462684))
* **orchestrator:** cover queued Beast start failures ([3727c4a](https://github.com/djm204/frankenbeast/commit/3727c4a7d75552424bc75befe43cc310989b2185)), closes [#1130](https://github.com/djm204/frankenbeast/issues/1130)
* **orchestrator:** cover singular e2e include glob ([7087cbd](https://github.com/djm204/frankenbeast/commit/7087cbd2c26cc424ba8a6d713bbf7321d4a14e9c))
* **orchestrator:** guard provider helper debug logs ([c7a2325](https://github.com/djm204/frankenbeast/commit/c7a2325b4e77c553c4ec3b111998ed5d311e4250)), closes [#1075](https://github.com/djm204/frankenbeast/issues/1075)
* **vitest:** parse suite env flags strictly ([#1658](https://github.com/djm204/frankenbeast/issues/1658)) ([e42e95e](https://github.com/djm204/frankenbeast/commit/e42e95e15e40a8b7ef14cb3cd7aa7c926c898b96))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.6.15 to 0.6.16
    * @franken/governor bumped from 0.5.13 to 0.5.14
    * @franken/types bumped from 0.8.2 to 0.9.0
    * @franken/observer bumped from 0.7.15 to 0.7.16
    * @franken/planner bumped from 0.4.13 to 0.4.14
    * @franken/brain bumped from 0.7.4 to 0.7.5

## [0.42.1](https://github.com/djm204/frankenbeast/compare/@franken/orchestrator-v0.42.0...@franken/orchestrator-v0.42.1) (2026-07-10)


### Bug Fixes

* **beasts:** surface daemon child shutdown failures ([9980fbe](https://github.com/djm204/frankenbeast/commit/9980fbea3a99f628f8fa6649f0e7d8a36cd970f0)), closes [#996](https://github.com/djm204/frankenbeast/issues/996)
* **cli:** persist implicit active plan name ([#839](https://github.com/djm204/frankenbeast/issues/839)) ([791cdd2](https://github.com/djm204/frankenbeast/commit/791cdd227f113f447119bf2b44f07e5b22944e1a))
* **critique:** isolate evaluator exceptions ([d5c2e2a](https://github.com/djm204/frankenbeast/commit/d5c2e2a57021cc5088bb9e6634873c9cdd704a8f)), closes [#1210](https://github.com/djm204/frankenbeast/issues/1210)
* **critique:** preserve loop warning verdicts ([715a1de](https://github.com/djm204/frankenbeast/commit/715a1de089d9071b7bf218bff7790dd0d544345a)), closes [#1160](https://github.com/djm204/frankenbeast/issues/1160)
* **mcp:** close Codex hook command quoting issue ([#1382](https://github.com/djm204/frankenbeast/issues/1382)) ([293c730](https://github.com/djm204/frankenbeast/commit/293c7301083883b56bb71e1eca19f1ddc4d23236)), closes [#1047](https://github.com/djm204/frankenbeast/issues/1047)
* **orchestrator:** accumulate stream progress input deltas ([862d902](https://github.com/djm204/frankenbeast/commit/862d9027ed51ddd35f3540572744138d8948e3d9)), closes [#1237](https://github.com/djm204/frankenbeast/issues/1237)
* **orchestrator:** block chat input while approval pending ([#1316](https://github.com/djm204/frankenbeast/issues/1316)) ([7d67c0f](https://github.com/djm204/frankenbeast/commit/7d67c0fa8de42db1e79c9cc05d89a9f3a20129d4)), closes [#1154](https://github.com/djm204/frankenbeast/issues/1154)
* **orchestrator:** cap websocket chat message size ([183e6e6](https://github.com/djm204/frankenbeast/commit/183e6e61e9f6a2c9eb4695840c58eadc7af646bc)), closes [#1093](https://github.com/djm204/frankenbeast/issues/1093)
* **orchestrator:** clean up CLI provider child processes ([99a42ba](https://github.com/djm204/frankenbeast/commit/99a42ba8399accc2bbfa9af104dea04340d01887)), closes [#872](https://github.com/djm204/frankenbeast/issues/872)
* **orchestrator:** handle CLI provider result frames ([#1279](https://github.com/djm204/frankenbeast/issues/1279)) ([807af5e](https://github.com/djm204/frankenbeast/commit/807af5e2afaa47fa511172be2f09bfed27d15c1b))
* **orchestrator:** harden generic comms gateway ([#1365](https://github.com/djm204/frankenbeast/issues/1365)) ([de36fea](https://github.com/djm204/frankenbeast/commit/de36fea36f0132a6d872486b22b8c0370129d169))
* **orchestrator:** isolate Gemini CLI prompt file ([#1277](https://github.com/djm204/frankenbeast/issues/1277)) ([8bf2025](https://github.com/djm204/frankenbeast/commit/8bf20254c7570fde6029f9f9bf0af94043cb5ed5))
* **orchestrator:** quarantine invalid analytics timestamps ([#1405](https://github.com/djm204/frankenbeast/issues/1405)) ([6353ac3](https://github.com/djm204/frankenbeast/commit/6353ac3ffbf49643dfd8468c03a1a200a34a0ea1))
* **orchestrator:** reject invalid analytics time windows ([#1386](https://github.com/djm204/frankenbeast/issues/1386)) ([df4aeb4](https://github.com/djm204/frankenbeast/commit/df4aeb4ae24c80d7c2c298f4c930b07ccae8871c))
* **orchestrator:** resolve run config hardening follow-ups ([38ac7f0](https://github.com/djm204/frankenbeast/commit/38ac7f0672c1c0d484f0d35ff5eda5d863ed7953))
* **orchestrator:** surface BeastEventBus listener failures ([#1343](https://github.com/djm204/frankenbeast/issues/1343)) ([1fb08dc](https://github.com/djm204/frankenbeast/commit/1fb08dc082803171fe442c5b74eda3ba8560fb4c))
* **orchestrator:** tolerate corrupt LLM cache JSON ([b454807](https://github.com/djm204/frankenbeast/commit/b454807d0c2174cf988a71402fe67b1ffd211a8e)), closes [#1219](https://github.com/djm204/frankenbeast/issues/1219)
* **orchestrator:** tolerate corrupt replay manifests ([758f5fb](https://github.com/djm204/frankenbeast/commit/758f5fb3f3fa3fe31f410a5df622e1c7be85d603)), closes [#1153](https://github.com/djm204/frankenbeast/issues/1153)
* **security:** scrub telegram webhook tokens from proxied paths ([#905](https://github.com/djm204/frankenbeast/issues/905)) ([3471078](https://github.com/djm204/frankenbeast/commit/347107887ea05c680f2f8979e04fa251ee3d6200))
* **web:** close dashboard proxy Codex follow-ups ([#813](https://github.com/djm204/frankenbeast/issues/813)) ([eee9613](https://github.com/djm204/frankenbeast/commit/eee96131d97cc653b2492eaefa3f4077f14c27b9))
* **web:** enforce auth for dashboard SSE tickets ([#1370](https://github.com/djm204/frankenbeast/issues/1370)) ([0a592f9](https://github.com/djm204/frankenbeast/commit/0a592f914bbddfd1203365996b3892e62364c65c))
* **web:** resolve chat session syntax issue ([4ce15f7](https://github.com/djm204/frankenbeast/commit/4ce15f79ead878e53e9fe9ac10bd1d7943972dfd))
* **web:** secure chat websocket authentication ([679b15d](https://github.com/djm204/frankenbeast/commit/679b15dfbd8cc592ed04b67339230494a5586a8c)), closes [#703](https://github.com/djm204/frankenbeast/issues/703)


### Documentation

* **mcp:** document skill health endpoint ([#1385](https://github.com/djm204/frankenbeast/issues/1385)) ([4c87b69](https://github.com/djm204/frankenbeast/commit/4c87b6983538d4030e8663d0d82f8ef92dec636e))
* **network:** document managed network marker ([4d2edf7](https://github.com/djm204/frankenbeast/commit/4d2edf78e457e8e612203559fb72ea98effd335d)), closes [#1257](https://github.com/djm204/frankenbeast/issues/1257)
* **web:** fix operator token auth header markdown ([#1303](https://github.com/djm204/frankenbeast/issues/1303)) ([1449e26](https://github.com/djm204/frankenbeast/commit/1449e268c54bafb994d5034fec1ccfc312194d9e))


### Tests

* **credentials:** remove remaining hard-coded test tokens ([#1304](https://github.com/djm204/frankenbeast/issues/1304)) ([a7cbc3a](https://github.com/djm204/frankenbeast/commit/a7cbc3af78f8ed96ac0de0883b5a5bbe4a7516bb))
* **orchestrator:** cover dynamic comms webhook security policy ([#1366](https://github.com/djm204/frankenbeast/issues/1366)) ([ee1877c](https://github.com/djm204/frankenbeast/commit/ee1877c0af8fe7b9e817cc05c9a3f03bd89d30c9))
* **orchestrator:** cover numeric CLI flag validation ([c7d9dc8](https://github.com/djm204/frankenbeast/commit/c7d9dc84b15ea6ae9cf6bd1db4c21108cccfe77a)), closes [#1249](https://github.com/djm204/frankenbeast/issues/1249)
* **orchestrator:** cover repo config provider override approval ([#1352](https://github.com/djm204/frankenbeast/issues/1352)) ([fbc4b5c](https://github.com/djm204/frankenbeast/commit/fbc4b5c882eebf274441d0d13b4b38acecfc8d59))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.6.14 to 0.6.15
    * @franken/governor bumped from 0.5.12 to 0.5.13
    * @franken/types bumped from 0.8.1 to 0.8.2
    * @franken/observer bumped from 0.7.14 to 0.7.15
    * @franken/planner bumped from 0.4.12 to 0.4.13
    * @franken/brain bumped from 0.7.3 to 0.7.4

## [0.42.0](https://github.com/djm204/frankenbeast/compare/@franken/orchestrator-v0.41.1...@franken/orchestrator-v0.42.0) (2026-07-08)


### Features

* **credentials:** externalize test credential placeholders ([#909](https://github.com/djm204/frankenbeast/issues/909)) ([b50ae79](https://github.com/djm204/frankenbeast/commit/b50ae797be6cbb77ea092c1ab3c8e30ed5274555)), closes [#518](https://github.com/djm204/frankenbeast/issues/518)


### Bug Fixes

* **orchestrator:** limit comms webhook request bodies ([#1282](https://github.com/djm204/frankenbeast/issues/1282)) ([fd28a16](https://github.com/djm204/frankenbeast/commit/fd28a1653dd7484c51baa2a18e80b4835ef3c629)), closes [#573](https://github.com/djm204/frankenbeast/issues/573)
* **orchestrator:** log cli hard-kill failures ([78f4bff](https://github.com/djm204/frankenbeast/commit/78f4bffa9328205bc5b120a5a61a5a996f13cdcf)), closes [#1213](https://github.com/djm204/frankenbeast/issues/1213)
* **orchestrator:** rate limit websocket chat execution ([#1266](https://github.com/djm204/frankenbeast/issues/1266)) ([3e88af5](https://github.com/djm204/frankenbeast/commit/3e88af574967635e1df69631ab33bcf08c4698de)), closes [#574](https://github.com/djm204/frankenbeast/issues/574)
* **orchestrator:** report cleanup artifact failures ([4fdfb0e](https://github.com/djm204/frankenbeast/commit/4fdfb0eb93cef1a875057790cd62237ca3d8c8d8))
* **orchestrator:** surface beast daemon dispatch failures ([0a3480a](https://github.com/djm204/frankenbeast/commit/0a3480aa7db0ca30e983e164fb422c73ae6efde9)), closes [#1164](https://github.com/djm204/frankenbeast/issues/1164)


### Documentation

* **config:** document FRANKEN env overrides ([a818cc8](https://github.com/djm204/frankenbeast/commit/a818cc8cde8ee8d570ef01c0a5efd0f838a7a5a1)), closes [#1263](https://github.com/djm204/frankenbeast/issues/1263)


### Tests

* **ci:** exercise minimum supported Node version in CI ([#1057](https://github.com/djm204/frankenbeast/issues/1057)) ([26debe4](https://github.com/djm204/frankenbeast/commit/26debe4feb5221422680988a4a3bb1d112bb8adb))
* **orchestrator:** avoid gitleaks fixture secret match ([#1273](https://github.com/djm204/frankenbeast/issues/1273)) ([7e850a1](https://github.com/djm204/frankenbeast/commit/7e850a1ce945655afeed0af92f822c1a01e95057)), closes [#1161](https://github.com/djm204/frankenbeast/issues/1161)
* **orchestrator:** cover HTTP approval state cleanup ([8f1fbf1](https://github.com/djm204/frankenbeast/commit/8f1fbf142b93bb0e3ce4c41e107e1650c6955e7a)), closes [#1155](https://github.com/djm204/frankenbeast/issues/1155)
* **orchestrator:** fail config cleanup errors loudly ([#1268](https://github.com/djm204/frankenbeast/issues/1268)) ([2a9e211](https://github.com/djm204/frankenbeast/commit/2a9e211208f4fdc8707276c860a1e0201775fa28))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.6.13 to 0.6.14
    * @franken/governor bumped from 0.5.11 to 0.5.12
    * @franken/types bumped from 0.8.0 to 0.8.1
    * @franken/observer bumped from 0.7.13 to 0.7.14
    * @franken/planner bumped from 0.4.11 to 0.4.12
    * @franken/brain bumped from 0.7.2 to 0.7.3

## [0.41.1](https://github.com/djm204/frankenbeast/compare/@franken/orchestrator-v0.41.0...@franken/orchestrator-v0.41.1) (2026-07-08)


### Bug Fixes

* harden Beast run config snapshot permissions ([#895](https://github.com/djm204/frankenbeast/issues/895)) ([2b681cf](https://github.com/djm204/frankenbeast/commit/2b681cf5b111e883aa31001a898820ae30bf18e1))
* **orchestrator:** add body limits to control APIs ([74a5c15](https://github.com/djm204/frankenbeast/commit/74a5c15344f09eacb514fff262cb8760b2c08c3c)), closes [#605](https://github.com/djm204/frankenbeast/issues/605)
* **orchestrator:** allow trusted override network launches ([#1260](https://github.com/djm204/frankenbeast/issues/1260)) ([3bb95c1](https://github.com/djm204/frankenbeast/commit/3bb95c140aedbae8c18eb37132d4a504dd183c1c))
* **orchestrator:** escape Beast metric label values ([#1024](https://github.com/djm204/frankenbeast/issues/1024)) ([72ceda4](https://github.com/djm204/frankenbeast/commit/72ceda4901693bf1da0326f821da0be0d21762d5))
* **orchestrator:** rate limit chat REST mutations ([#1062](https://github.com/djm204/frankenbeast/issues/1062)) ([e3cd756](https://github.com/djm204/frankenbeast/commit/e3cd7566ec0a3fb2e2d56f44a806ab26404c7c6d))
* **orchestrator:** redact beast run config snapshots ([#1064](https://github.com/djm204/frankenbeast/issues/1064)) ([f0323a5](https://github.com/djm204/frankenbeast/commit/f0323a533a75c97c75b46ef3003e860747f27268)), closes [#603](https://github.com/djm204/frankenbeast/issues/603)
* **orchestrator:** validate network subprocess specs ([#912](https://github.com/djm204/frankenbeast/issues/912)) ([4048ca9](https://github.com/djm204/frankenbeast/commit/4048ca941d5de21784862d9c170f4420033f5df2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.6.12 to 0.6.13
    * @franken/governor bumped from 0.5.10 to 0.5.11
    * @franken/observer bumped from 0.7.12 to 0.7.13
    * @franken/planner bumped from 0.4.10 to 0.4.11
    * @franken/brain bumped from 0.7.1 to 0.7.2

## [0.41.0](https://github.com/djm204/frankenbeast/compare/@franken/orchestrator-v0.40.0...@franken/orchestrator-v0.41.0) (2026-07-07)


### Features

* **orchestrator:** execute ready tasks in parallel waves ([ef72620](https://github.com/djm204/frankenbeast/commit/ef726201c9153e08c5dea9079f6c1e2bb26d6f81)), closes [#497](https://github.com/djm204/frankenbeast/issues/497)


### Bug Fixes

* **chat:** emit execution events after approval ([#877](https://github.com/djm204/frankenbeast/issues/877)) ([752f8ef](https://github.com/djm204/frankenbeast/commit/752f8ef2c56215d9c9cfb7cefe9f96a4a31cc49c))
* **cli:** print PR URL in run summary ([#894](https://github.com/djm204/frankenbeast/issues/894)) ([ae83ce5](https://github.com/djm204/frankenbeast/commit/ae83ce5985687aa81bdfc7ce65505e33974e10f1))
* **cli:** reject zero budget values ([#926](https://github.com/djm204/frankenbeast/issues/926)) ([605dca0](https://github.com/djm204/frankenbeast/commit/605dca0fe6bd0a70709bcf62a27ddbff2682e218))
* **cli:** show network help before root resolution ([71ebc60](https://github.com/djm204/frankenbeast/commit/71ebc60bcb292f228098759ffe22ba295cd7f34c)), closes [#414](https://github.com/djm204/frankenbeast/issues/414)
* **orchestrator:** bound CLI rate-limit retries ([#911](https://github.com/djm204/frankenbeast/issues/911)) ([c6f8c39](https://github.com/djm204/frankenbeast/commit/c6f8c3938185fb1f68b2a71086f72bbaf4fa0e17))
* **orchestrator:** clean up chat websocket listeners ([e9ccd1a](https://github.com/djm204/frankenbeast/commit/e9ccd1a1a8e6a97eb098eff91f122338deddfdd1)), closes [#690](https://github.com/djm204/frankenbeast/issues/690)
* **orchestrator:** clean up process beast worktrees ([d86a2ec](https://github.com/djm204/frankenbeast/commit/d86a2ec66461bd29823645d8e82de08058359a16))
* **orchestrator:** gate trusted provider command overrides ([#836](https://github.com/djm204/frankenbeast/issues/836)) ([0213c22](https://github.com/djm204/frankenbeast/commit/0213c2280c0650516e5af3954b8c95584d5cb2fb))
* **orchestrator:** handle child process spawn errors ([8767f8f](https://github.com/djm204/frankenbeast/commit/8767f8fcc68531f8feb0fd0b263229e385d2c081))
* **orchestrator:** log pr creator fallback errors ([#840](https://github.com/djm204/frankenbeast/issues/840)) ([e49fa8d](https://github.com/djm204/frankenbeast/commit/e49fa8dc89bac80440cf2aee3bd42407b6db2cb7))
* **orchestrator:** make sharp optional so the published CLI runs without it ([#854](https://github.com/djm204/frankenbeast/issues/854)) ([ff86b4a](https://github.com/djm204/frankenbeast/commit/ff86b4a0ef536b08791b55bc846bdeeeb7a0f970))
* **orchestrator:** make websocket session tickets one-time ([b6cf0a5](https://github.com/djm204/frankenbeast/commit/b6cf0a519797610bf3dedec894f28749f85b0868)), closes [#608](https://github.com/djm204/frankenbeast/issues/608)
* **orchestrator:** release supervisor exit on inherited stdio ([#876](https://github.com/djm204/frankenbeast/issues/876)) ([5bc0134](https://github.com/djm204/frankenbeast/commit/5bc0134986365b378f8f03ccd3752c79442e7696))
* **orchestrator:** remove unsafe type-safety bypasses ([95641cb](https://github.com/djm204/frankenbeast/commit/95641cbbdbd8e2a7e575460cd920158cfd510bad)), closes [#639](https://github.com/djm204/frankenbeast/issues/639)
* **orchestrator:** return bad request for invalid webhook payloads ([#868](https://github.com/djm204/frankenbeast/issues/868)) ([908621c](https://github.com/djm204/frankenbeast/commit/908621c3ae65b3f16848f8ce7c4bea4ee08e52a6))
* **orchestrator:** stop SSE ticket retry loops ([#891](https://github.com/djm204/frankenbeast/issues/891)) ([6c7c1a1](https://github.com/djm204/frankenbeast/commit/6c7c1a13c2deba0ce61de084e8d705b4739332a9))
* **orchestrator:** support init backend flag ([#869](https://github.com/djm204/frankenbeast/issues/869)) ([e9ea2bc](https://github.com/djm204/frankenbeast/commit/e9ea2bc263556ab757031de39bbff5ccd7e05d79))
* **orchestrator:** ticket-authenticate chat SSE streams ([#867](https://github.com/djm204/frankenbeast/issues/867)) ([bf2d315](https://github.com/djm204/frankenbeast/commit/bf2d315f1fcdb5c278ad6d3ffa16e6149df73146))
* **orchestrator:** validate chunk plan design docs ([#884](https://github.com/djm204/frankenbeast/issues/884)) ([27a0451](https://github.com/djm204/frankenbeast/commit/27a045115db56d5695d83c588d01aa5bfbc50609))
* **orchestrator:** validate skill MCP config writes ([#866](https://github.com/djm204/frankenbeast/issues/866)) ([8a97c2a](https://github.com/djm204/frankenbeast/commit/8a97c2abc88c2e0842f0b76e7c10e71ed95d64a8)), closes [#682](https://github.com/djm204/frankenbeast/issues/682)
* **planner:** reject invalid LLM dependency references ([#923](https://github.com/djm204/frankenbeast/issues/923)) ([bfe185d](https://github.com/djm204/frankenbeast/commit/bfe185d69ed2937e796e5b8e03ef3b33dc30bb1b))
* prefer secure defaults for local dashboard endpoints ([f9834bd](https://github.com/djm204/frankenbeast/commit/f9834bdd60db2cab1427550f6a4cd2ce111f6704)), closes [#502](https://github.com/djm204/frankenbeast/issues/502)
* **security:** add body limits to inbound and action routes ([0941a5e](https://github.com/djm204/frankenbeast/commit/0941a5e1e29e12e40eccbba912b79b2b1f3a6e43)), closes [#604](https://github.com/djm204/frankenbeast/issues/604)
* **security:** share realpath containment checks ([#875](https://github.com/djm204/frankenbeast/issues/875)) ([eb1ad94](https://github.com/djm204/frankenbeast/commit/eb1ad94736ead647df2f7840c0fad9555f86a73f))
* **web:** require explicit chat socket token TTL ([#892](https://github.com/djm204/frankenbeast/issues/892)) ([5065ddf](https://github.com/djm204/frankenbeast/commit/5065ddf1bc5340208433eebbcf7cfa19dce9fb68))


### Refactoring

* **tests:** alias Vitest configs to package sources ([#845](https://github.com/djm204/frankenbeast/issues/845)) ([454b526](https://github.com/djm204/frankenbeast/commit/454b526e509d5762bde3ec5102d7521367f0c1a7))


### Tests

* externalize credential fixtures ([#910](https://github.com/djm204/frankenbeast/issues/910)) ([84ff583](https://github.com/djm204/frankenbeast/commit/84ff5830a23095a32339a1970a3e2d6d0a443dca)), closes [#519](https://github.com/djm204/frankenbeast/issues/519)
* **security:** add unsigned webhook rejection tests ([#896](https://github.com/djm204/frankenbeast/issues/896)) ([3c2bf39](https://github.com/djm204/frankenbeast/commit/3c2bf392ccf66f859c300b2fb9bc24470874cd27)), closes [#613](https://github.com/djm204/frankenbeast/issues/613)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.6.11 to 0.6.12
    * @franken/governor bumped from 0.5.9 to 0.5.10
    * @franken/types bumped from 0.7.7 to 0.8.0
    * @franken/observer bumped from 0.7.11 to 0.7.12
    * @franken/planner bumped from 0.4.9 to 0.4.10
    * @franken/brain bumped from 0.7.0 to 0.7.1

## [0.40.0](https://github.com/djm204/frankenbeast/compare/@franken/orchestrator-v0.39.1...@franken/orchestrator-v0.40.0) (2026-07-06)


### Features

* add skill directory equivalents for beast definitions ([789b567](https://github.com/djm204/frankenbeast/commit/789b567207768e639d6f4cc9c9ef5bcf95882566))
* add skill directory equivalents for beast definitions ([b63d31f](https://github.com/djm204/frankenbeast/commit/b63d31fbbfd5108e2c22207a62a6d46fb2160040))
* **beasts:** add BeastEventBus with sequence IDs and replay buffer ([6851710](https://github.com/djm204/frankenbeast/commit/68517105fda4513733f40414eb0ac4fc3c19b62f))
* **beasts:** add ProcessCallbacks to ProcessSupervisor with output capture and registry ([5d67738](https://github.com/djm204/frankenbeast/commit/5d6773817776254f7b636de2c5d68c239a9e8f54))
* **beasts:** add resolveCliEntrypoint utility ([8c956ca](https://github.com/djm204/frankenbeast/commit/8c956ca73b0b8ada868bc6ec05a0b09fe7660e63))
* **beasts:** add RunConfigSchema and RunConfigLoader with Zod validation ([10d0864](https://github.com/djm204/frankenbeast/commit/10d0864d502bec3b7a978e77ed36ae2b7f7372a7))
* **beasts:** add SSE routes with connection ticket auth ([8641b32](https://github.com/djm204/frankenbeast/commit/8641b328014bb11ad601959adbff8453ede55d99))
* **beasts:** add SseConnectionTicketStore with single-use tickets and TTL ([69c4390](https://github.com/djm204/frankenbeast/commit/69c4390ac84f6fe6d89552ca1ecd36d2c6d8fc87))
* **beasts:** config file passthrough to spawned processes ([8fe66bb](https://github.com/djm204/frankenbeast/commit/8fe66bb537d4f31337397493a5b361eac0887d86))
* **beasts:** error reporting to dashboard ([a6d9cea](https://github.com/djm204/frankenbeast/commit/a6d9ceac7618d560e2d3da2fb8246a6e377f1efd))
* **beasts:** error reporting to dashboard with spawn failure handling and SIGTERM timeout ([990577c](https://github.com/djm204/frankenbeast/commit/990577c31c93fad8b45a1aa8b159849e62221399))
* **beasts:** expose notifyRunStatusChange on BeastRunService ([daa25fa](https://github.com/djm204/frankenbeast/commit/daa25fa9ab26bd5459c5e7e88731fda690241f9c))
* **beasts:** ProcessSupervisor exit handling + output capture ([6c2600f](https://github.com/djm204/frankenbeast/commit/6c2600fb8a92a57a02e879ce3a60d745120cc3e8))
* **beasts:** replace chunk-plan stub with real CLI spawn ([b368ad3](https://github.com/djm204/frankenbeast/commit/b368ad3970d59d1a3d5a343a7a785d33ce381184))
* **beasts:** replace design-interview stub with real CLI spawn ([d58f7b1](https://github.com/djm204/frankenbeast/commit/d58f7b1b1e0e661fa4b59557f5a8fec888fbe04a))
* **beasts:** replace martin-loop stub with real CLI spawn ([12acef2](https://github.com/djm204/frankenbeast/commit/12acef26756000f81bef3851a4b46f263742762f))
* **beasts:** replace stub buildProcessSpec with real CLI spawns ([2307c0c](https://github.com/djm204/frankenbeast/commit/2307c0cd55c6f8704b5363e76630fd9e6ec0026b))
* **beasts:** SSE event bus + connection tickets (Chunk 06) ([436dca9](https://github.com/djm204/frankenbeast/commit/436dca9567fae9cafcc4178f54c9ab07f2149455))
* **beasts:** wire BeastEventBus into RunService and ProcessBeastExecutor ([8b442bf](https://github.com/djm204/frankenbeast/commit/8b442bf3328ebc3002baefb45fa8beaa8b70b091))
* **beasts:** wire ProcessCallbacks through ProcessBeastExecutor to persistence ([c902168](https://github.com/djm204/frankenbeast/commit/c902168034d659b0428920483190ed8b69d81312))
* **beasts:** wire ProcessCallbacks through ProcessBeastExecutor to persistence ([a2ce1ba](https://github.com/djm204/frankenbeast/commit/a2ce1bacb0d769d212a7bd75321d6eb4ab21dc7e))
* **beasts:** write configSnapshot to JSON file before spawn and clean up on exit ([a010200](https://github.com/djm204/frankenbeast/commit/a010200d5fb5e6e958e201ff4a7471e5248a6a0d))
* **cli:** add franken and frkn as CLI aliases ([b651cd5](https://github.com/djm204/frankenbeast/commit/b651cd543408ba2e574f3da236d3c75d4354f2f5))
* **cli:** load RunConfig from env in session startup path ([e58844f](https://github.com/djm204/frankenbeast/commit/e58844f2fdfd648a9d62c5c72ef4373a91706e91))
* **cli:** wire RunConfig overrides into dep-factory ([a3831b8](https://github.com/djm204/frankenbeast/commit/a3831b823ab6e65dd9d8d2c5ac577d3cbd243ffd))
* close launch parity gaps ([#284](https://github.com/djm204/frankenbeast/issues/284)) ([7309143](https://github.com/djm204/frankenbeast/commit/7309143648bba36b0788c0b44446455c9a61821a))
* **comms:** enable Telegram and WhatsApp runtime transports ([#526](https://github.com/djm204/frankenbeast/issues/526)) ([bb4368b](https://github.com/djm204/frankenbeast/commit/bb4368b728c2a730004c6cfff27c7e4f8d878de9))
* complete dual-mode launch chunks 6-8 and fix adapter wrapping ([#282](https://github.com/djm204/frankenbeast/issues/282)) ([b86792d](https://github.com/djm204/frankenbeast/commit/b86792dac542751035d676230e7481238329a974))
* complete MCP launch chunks 1-5 and canonicalize .fbeast storage ([#279](https://github.com/djm204/frankenbeast/issues/279)) ([22c8ac3](https://github.com/djm204/frankenbeast/commit/22c8ac3ffea24c5a252ab466277ec63261d1ed2d))
* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))
* dashboard SSE routes and web UI panels ([0c8c8e0](https://github.com/djm204/frankenbeast/commit/0c8c8e0520be173cd921edda6c424cc41e7b1292))
* **franken-orchestrator:** add hybrid llm cache primitives ([c929e29](https://github.com/djm204/frankenbeast/commit/c929e29875460703f002b2ec28d738a243d986ec))
* **franken-orchestrator:** add intelligent LLM caching ([c00307c](https://github.com/djm204/frankenbeast/commit/c00307c91c7612f38aa86962f07d04e7feec6b61))
* **franken-orchestrator:** cache repeated planning and issue prompts ([89b3591](https://github.com/djm204/frankenbeast/commit/89b3591b3b92213f14129f60d4cce3b40b15b941))
* **observer:** add audit trail schema, replayer, persistence (Phase 7) ([6ffef1f](https://github.com/djm204/frankenbeast/commit/6ffef1ff67dfaa4fb6ac8f402036f1d22b871c92))
* **observer:** durable audit replay ([#299](https://github.com/djm204/frankenbeast/issues/299)) ([34ddc5a](https://github.com/djm204/frankenbeast/commit/34ddc5aa6b17ac6ae87f714e1342a101d7ecd195))
* **orchestrator:** add 6 adapter classes + createBeastDeps (Phase 8.1+8.2) ([b18d93b](https://github.com/djm204/frankenbeast/commit/b18d93be8d03b3da22a1eb86aa418d40e51775a1))
* **orchestrator:** add 6 provider adapters + shared handoff (Phase 3.3-3.8) ([58f5f10](https://github.com/djm204/frankenbeast/commit/58f5f1016a644160046d7cc38e3c147d2cde76a1))
* **orchestrator:** add CLI container beast mode ([0178c1d](https://github.com/djm204/frankenbeast/commit/0178c1d8f5fde156bec747b032a36cd49736e251))
* **orchestrator:** add comms config, token aggregation, delete EpisodicMemoryPortAdapter ([5eba2a8](https://github.com/djm204/frankenbeast/commit/5eba2a8bb5a9867c10fee361dec59c6112c18bfe))
* **orchestrator:** add comms run-config schema (Phase 4.5.04) ([0d7cd30](https://github.com/djm204/frankenbeast/commit/0d7cd309c79f54bdb1a485f072287b4b8c50f193))
* **orchestrator:** add credential store + health checker (Phase 5.9, 5.10) ([ac1a2bd](https://github.com/djm204/frankenbeast/commit/ac1a2bd4c6d8fe5f21081718e4f18c7112dbd571))
* **orchestrator:** add cross-provider token aggregation (Phase 3.10) ([39e2cae](https://github.com/djm204/frankenbeast/commit/39e2caef4464ee389aeafef40ca5438f5f04cbf0))
* **orchestrator:** add dashboard aggregation routes with SSE stream ([f2310e7](https://github.com/djm204/frankenbeast/commit/f2310e7fa401848f84a80374e5abce72856929a8))
* **orchestrator:** add dep-bridge for CliDepOptions → BeastDepsConfig mapping ([bb849ce](https://github.com/djm204/frankenbeast/commit/bb849ce946b538d1e030108356e9897df4411d7a))
* **orchestrator:** add domain allowlist middleware (Phase 4.4) ([854dce4](https://github.com/djm204/frankenbeast/commit/854dce48336c3b26bfef156a0b6b21b0fce26810))
* **orchestrator:** add E2E consolidated deps test + run-config v2 (Phase 8.5, 8.7) ([25a48ed](https://github.com/djm204/frankenbeast/commit/25a48ed4f2e731f0a3db03022fc21e17df7c69de))
* **orchestrator:** add LLM middleware chain + 3 middleware (Phase 4.2) ([ba1c2a1](https://github.com/djm204/frankenbeast/commit/ba1c2a11acdd28c66146814b3db32c0185345695))
* **orchestrator:** add provider skill translation + auth resolver (Phase 5.3, 5.4) ([f227431](https://github.com/djm204/frankenbeast/commit/f227431fcd132d00423b88a36fb169d9a0693fb4))
* **orchestrator:** add provider-aware outbound formatting (Phase 4.5.02) ([351e060](https://github.com/djm204/frankenbeast/commit/351e0605bab988b380a9cf3c11be1c82b6beff26))
* **orchestrator:** add ProviderRegistry with failover logic (Phase 3.2) ([3725cee](https://github.com/djm204/frankenbeast/commit/3725cee04c4445986862b0b088225243ce0e6ad3))
* **orchestrator:** add reflection runtime trigger (Phase 6.2) ([8ff8933](https://github.com/djm204/frankenbeast/commit/8ff89331e14a3ea4233eb2c9037b59ef805ede80))
* **orchestrator:** add security profiles + API routes (Phase 4.3) ([f516985](https://github.com/djm204/frankenbeast/commit/f51698522db5460f34554c27202e4196ef88817c))
* **orchestrator:** add skill API routes + context endpoints (Phase 5.6, 5.7, 5.11) ([b2804a2](https://github.com/djm204/frankenbeast/commit/b2804a2213cdea54d3e1bfda3c222cea96fb5ff6))
* **orchestrator:** add skill/provider/security/dashboard CLI commands ([23bcc2f](https://github.com/djm204/frankenbeast/commit/23bcc2f8a788f7acac26045108eea0f7e401de11))
* **orchestrator:** add skill/provider/security/dashboard CLI commands ([cd1ac1b](https://github.com/djm204/frankenbeast/commit/cd1ac1b189af357f59dbdbb8e5b8dde2a90f9509))
* **orchestrator:** add SkillConfigStore for persistent skill toggle state ([4920421](https://github.com/djm204/frankenbeast/commit/492042128980080976271f5dec76d2b6908de7c6))
* **orchestrator:** add SkillConfigStore for persistent skill toggle state ([05a5191](https://github.com/djm204/frankenbeast/commit/05a5191ab0a3f6a98cca32de5d700be727418acb))
* **orchestrator:** add SkillManager core CRUD (Phase 5.2) ([992105d](https://github.com/djm204/frankenbeast/commit/992105dceec8f661b93cc2b34f1876c5198288a2))
* **orchestrator:** add standalone beast daemon ([#477](https://github.com/djm204/frankenbeast/issues/477)) ([6b770a4](https://github.com/djm204/frankenbeast/commit/6b770a48f33d05e0c91a9b32800499e95049ade1))
* **orchestrator:** allow disabling PR creator branding ([91f6161](https://github.com/djm204/frankenbeast/commit/91f6161673a307fa06f520a457421541bbc5c19a))
* **orchestrator:** beast mode hardening — explicit resume, fail-closed deps, verification matrix ([#292](https://github.com/djm204/frankenbeast/issues/292)) ([c0dd018](https://github.com/djm204/frankenbeast/commit/c0dd01899fd429e4b80bfb85218f0f98890cc136))
* **orchestrator:** harden sandbox container execution ([849d87c](https://github.com/djm204/frankenbeast/commit/849d87ceb27377736af98ebfd26950ea108426af))
* **orchestrator:** intelligent LLM caching with work-scoped isolation ([b2d4e87](https://github.com/djm204/frankenbeast/commit/b2d4e870fb43f2dc91a887e058ccc06d961c0d4e))
* **orchestrator:** isolate beast processes in git worktrees ([efbe11e](https://github.com/djm204/frankenbeast/commit/efbe11e86fa032f2f1b360b954cea8a20a8bd8ba)), closes [#494](https://github.com/djm204/frankenbeast/issues/494)
* **orchestrator:** last-mile wiring — activate consolidation components in production runtime ([#275](https://github.com/djm204/frankenbeast/issues/275)) ([d318813](https://github.com/djm204/frankenbeast/commit/d318813518c99aede74aedc3ed9c4577cec114f4))
* **orchestrator:** mount skill routes in chat-app when skillManager provided ([9ae5889](https://github.com/djm204/frankenbeast/commit/9ae58893669c4a4c837ed5aad1cd7df1a22970ce))
* **orchestrator:** pass commsConfig through startChatServer to createChatApp ([fba06ca](https://github.com/djm204/frankenbeast/commit/fba06ca4f4b6024ec3010aeee660eb91be8de636))
* **orchestrator:** replace ChatSocketBridge with direct ChatRuntime (Phase 4.5.01) ([6879e26](https://github.com/djm204/frankenbeast/commit/6879e26574e7efeb7940553c8d0c489c243382e2))
* **orchestrator:** security profile integration for webhook verification (Phase 4.5.03) ([5c9c6ca](https://github.com/djm204/frankenbeast/commit/5c9c6caced4563e0150774a6595614c8bb41a1ac))
* **orchestrator:** wire container chat dispatch ([#468](https://github.com/djm204/frankenbeast/issues/468)) ([94d0f5e](https://github.com/djm204/frankenbeast/commit/94d0f5e7a55a09e8aa540ce0f9832b975af2e9de))
* **orchestrator:** wire critique module in dep-factory with fallback ([add4b1f](https://github.com/djm204/frankenbeast/commit/add4b1ffda6a1611662e5a0eab28e52f3741d855))
* **orchestrator:** wire discoverSkills into CLI adapters (Phase 5.5) ([fb06baa](https://github.com/djm204/frankenbeast/commit/fb06baaf6f2669f105a59f0d34496d6a83a3112b))
* **orchestrator:** wire execution recovery loop ([#553](https://github.com/djm204/frankenbeast/issues/553)) ([099067f](https://github.com/djm204/frankenbeast/commit/099067faa067414763b83376501fd87722ef0da9))
* **orchestrator:** wire governor module in dep-factory with HITL channel and fallback ([931da7f](https://github.com/djm204/frankenbeast/commit/931da7f8e53729e99a6f1aa6e5221c471559444b))
* Phase 3 — Provider Registry + Adapters ([0ceb582](https://github.com/djm204/frankenbeast/commit/0ceb582f95a7ac7cac877adeb6b08bbe4aa9efd1))
* Phase 4 — Security Middleware ([2f4112b](https://github.com/djm204/frankenbeast/commit/2f4112bac8f0d8940ef141f64c7229c397535eea))
* Phase 4.5 — Comms Integration ([a3e8053](https://github.com/djm204/frankenbeast/commit/a3e80537a5e1413aab5cedd976c9d6724e796266))
* Phase 5 — Skill Loading ([bc99631](https://github.com/djm204/frankenbeast/commit/bc99631f27cd2ea1b4072e19998b3fc89eb389b0))
* Phase 6 — Absorb Reflection into Critique ([82ac47d](https://github.com/djm204/frankenbeast/commit/82ac47d6a67763a622f2d24058e6c30dbe989c46))
* Phase 7 — Observer Audit Trail ([ea50e97](https://github.com/djm204/frankenbeast/commit/ea50e97b7b4d88c3a0e7261be8d5b08bb630441e))
* Phase 8 — Wire Everything Together (Core) ([12d5293](https://github.com/djm204/frankenbeast/commit/12d52933d8ac27d5b2d46a24229fc94cf3c8c7d9))
* Plan 1 — Foundation Execution Pipeline ([bc4cc63](https://github.com/djm204/frankenbeast/commit/bc4cc63b958dfe1d9763056f69b5495b7272b73e))
* **web:** add beast execution mode selection ([#469](https://github.com/djm204/frankenbeast/issues/469)) ([be44a79](https://github.com/djm204/frankenbeast/commit/be44a79b26d8c8dd2fcef0626e42541d78d6736d))
* **web:** add observer analytics dashboard ([#286](https://github.com/djm204/frankenbeast/issues/286)) ([a375ec3](https://github.com/djm204/frankenbeast/commit/a375ec3c484f03bb67260050931609332d62bdd8))
* **web:** stream beast run status and logs ([ef86e02](https://github.com/djm204/frankenbeast/commit/ef86e02776d6398e9b12e94480ec2e15e073692b))
* wire critique and governor modules in dep-factory (Tiers 3-4) ([8d55339](https://github.com/djm204/frankenbeast/commit/8d553399167860bad06a03c85e5b6045a0fb8b1e))


### Bug Fixes

* address 10 review issues on dashboard chunk ([037a57a](https://github.com/djm204/frankenbeast/commit/037a57a2538682233612143e02f289cd88a19cb2))
* address 10 review issues on dashboard chunk ([df52d71](https://github.com/djm204/frankenbeast/commit/df52d7152350c03f741f64ee55ee802da1da81b6))
* address codex sandbox and route follow-ups ([cda3cce](https://github.com/djm204/frankenbeast/commit/cda3ccec1ae728ec75f38bdb93069245bdcf8bd9))
* **api:** share web DTO contracts ([#544](https://github.com/djm204/frankenbeast/issues/544)) ([ec1e29a](https://github.com/djm204/frankenbeast/commit/ec1e29ae21bed03d156f0a58c0f27964566e5e80))
* **beasts:** add projectRoot to configSchema, strengthen env assertions ([8e4ba77](https://github.com/djm204/frankenbeast/commit/8e4ba7745070d2070dcc022d39754e9a7ed610c4))
* **beasts:** address PR [#241](https://github.com/djm204/frankenbeast/issues/241) review findings ([ffa9329](https://github.com/djm204/frankenbeast/commit/ffa9329e39d3901a0110a464e2a819dc38f7820a))
* **beasts:** buffer early exit events and handle null code/signal edge case ([dc899c1](https://github.com/djm204/frankenbeast/commit/dc899c14999b476c50e642c71b95b5b6eaead1b0))
* **beasts:** enable auto-dispatch for design-interview definition ([6cb16e1](https://github.com/djm204/frankenbeast/commit/6cb16e11ffd7f1a34e6707ed1b5f29dda8aae48a))
* **beasts:** fix stop() double-write, duplicate agent events, and spec compliance ([ad2c981](https://github.com/djm204/frankenbeast/commit/ad2c98199988612fe4478888a3b310e218998317))
* **beasts:** make ProcessCallbacks required, fix readline drain race condition ([5509d06](https://github.com/djm204/frankenbeast/commit/5509d0634daba29afa91bea11878a573a98cc307))
* **beasts:** resolve 3 high-severity discrepancies from Pass 7 audit ([bdc0f2c](https://github.com/djm204/frankenbeast/commit/bdc0f2cc4f1a85c3037c4e1b5c56143f30fd35ad))
* **beasts:** resolve all DISCREPANCIES.md findings from Plan 1 ([5679beb](https://github.com/djm204/frankenbeast/commit/5679beb7c72fb4adad3aa946af7f4879f0eab086))
* **beasts:** resolve all Pass 6 Deep Audit findings (R1-R8) ([a9eac61](https://github.com/djm204/frankenbeast/commit/a9eac6144d012928c013a5e4fbcb29a803fc9213))
* **beasts:** resolve Pass 4/5 truth audit findings ([ba0908b](https://github.com/djm204/frankenbeast/commit/ba0908be6512cc0161d648cc1ed4de81823adeab))
* **cli:** align RunConfigSchema with spec, fix module passthrough and error handling ([9873dfa](https://github.com/djm204/frankenbeast/commit/9873dfa570ef094171dcb21329b4d36efa91d38c))
* **cli:** auto-detect smart resume state ([#543](https://github.com/djm204/frankenbeast/issues/543)) ([461b5c0](https://github.com/djm204/frankenbeast/commit/461b5c0db7686ccdff71c2124e65306b55912d26))
* **cli:** correct provider setup guidance ([#438](https://github.com/djm204/frankenbeast/issues/438)) ([55703a9](https://github.com/djm204/frankenbeast/commit/55703a942effcfa800f3bc2374889c7cf8ad960f))
* **cli:** guide run users when no plan exists ([#778](https://github.com/djm204/frankenbeast/issues/778)) ([c0b334f](https://github.com/djm204/frankenbeast/commit/c0b334f8e48bad431feb4196a76364b0eecb4b3e))
* **cli:** honor non-interactive init ([#439](https://github.com/djm204/frankenbeast/issues/439)) ([2e8fc74](https://github.com/djm204/frankenbeast/commit/2e8fc749693d93ebc140f7c2089780b18ba055fe))
* **cli:** make beasts catalog exit cleanly ([#442](https://github.com/djm204/frankenbeast/issues/442)) ([5be5766](https://github.com/djm204/frankenbeast/commit/5be576690efbfd379085a307b138f4f0169f6d55))
* **cli:** pass provider override extra args ([6180dc9](https://github.com/djm204/frankenbeast/commit/6180dc972f66525b283e78e9e34af16a6356f39c))
* **cli:** persist network config sets ([#440](https://github.com/djm204/frankenbeast/issues/440)) ([a129823](https://github.com/djm204/frankenbeast/commit/a129823aa359f72418148b6a1c2dd23959a96bff))
* **cli:** persist security profile changes ([2e51d07](https://github.com/djm204/frankenbeast/commit/2e51d072d332c0ce4ef4b7e780341caff0a034ac)), closes [#403](https://github.com/djm204/frankenbeast/issues/403)
* **cli:** split runnable skill add from scaffold ([b1394aa](https://github.com/djm204/frankenbeast/commit/b1394aa4a4578535dd7b0876e32e58f8564af521)), closes [#404](https://github.com/djm204/frankenbeast/issues/404)
* **cli:** surface non-interactive HITL remedy ([02d65d9](https://github.com/djm204/frankenbeast/commit/02d65d993e533df5bb001f06a57abb9dad657805)), closes [#748](https://github.com/djm204/frankenbeast/issues/748)
* **cli:** surface PR auth failures ([deb8df7](https://github.com/djm204/frankenbeast/commit/deb8df7f7c94a87b106d6729404591a4e0fae871)), closes [#746](https://github.com/djm204/frankenbeast/issues/746)
* **cli:** validate numeric options ([61e3ffd](https://github.com/djm204/frankenbeast/commit/61e3ffd5ecda33263d6428a84913b95b5ba7c8cf))
* **config:** harden insecure defaults ([5abc7f9](https://github.com/djm204/frankenbeast/commit/5abc7f9c51477706ab6246116d44116645b363af)), closes [#522](https://github.com/djm204/frankenbeast/issues/522)
* **consolidation:** address review findings — lockfile, comms routes, docs ([e406cc2](https://github.com/djm204/frankenbeast/commit/e406cc2b32cd977f6212b05a300a96ae78480914))
* **critique:** make TokenBudgetBreaker actually enforce the budget ([#343](https://github.com/djm204/frankenbeast/issues/343)) ([b878f5f](https://github.com/djm204/frankenbeast/commit/b878f5f82700e3917e16da6c447cfa094b392595))
* dashboard review fixes, dispatch config stripping, error logging ([cdcf969](https://github.com/djm204/frankenbeast/commit/cdcf969541adfd69bca4a5ac9d4676571b639773))
* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)
* honor run config provider and model precedence ([17d3432](https://github.com/djm204/frankenbeast/commit/17d3432f858d2590f2cb0683dbd2b661bd667fab))
* **lint:** suppress false-positive prefer-const on deferred assignments ([df7779d](https://github.com/djm204/frankenbeast/commit/df7779d9d469ea26361da38147ba23e40321351d))
* **mcp-suite:** mitigate hook hangs and uninstall residue ([#287](https://github.com/djm204/frankenbeast/issues/287)) ([b939d36](https://github.com/djm204/frankenbeast/commit/b939d36b68c8c3336af4df491819b32ec962d168))
* **network:** track in-process comms gateway ([#487](https://github.com/djm204/frankenbeast/issues/487)) ([b3d7a3b](https://github.com/djm204/frankenbeast/commit/b3d7a3be68dabbfcf3ff6e967ab73b4c0d29677f))
* **observer,types:** guard token counters against overflow & bad input ([#341](https://github.com/djm204/frankenbeast/issues/341)) ([0a7c6b4](https://github.com/djm204/frankenbeast/commit/0a7c6b4852e959489fbb389971b56f0c64278e5b))
* **orchestrator:** abort martin loop on budget exceedance ([#486](https://github.com/djm204/frankenbeast/issues/486)) ([2040af2](https://github.com/djm204/frankenbeast/commit/2040af26e3c6ba24416782f3604a4db19816932e))
* **orchestrator:** add missing @franken/critique and @franken/governor dependencies ([31e71f0](https://github.com/djm204/frankenbeast/commit/31e71f01d4aacd062ec42aebcf7bca3762a7de39))
* **orchestrator:** add missing fields to dep-bridge BridgeComponents ([1f08b40](https://github.com/djm204/frankenbeast/commit/1f08b40d1f1ff40cd682f7d0551301b2b67e3795))
* **orchestrator:** address CLI command review issues ([a9bc9a6](https://github.com/djm204/frankenbeast/commit/a9bc9a6834dee58b48be6b78a6a4dd0598120af5))
* **orchestrator:** address Phase 3 review gaps + document residuals ([bfc84ee](https://github.com/djm204/frankenbeast/commit/bfc84ee3f4afa95957100635381a1cbc33fe16f7))
* **orchestrator:** address Phase 4 review gaps ([8e48d85](https://github.com/djm204/frankenbeast/commit/8e48d85b9acbb01a008fd2ace05c8ef6603594c2))
* **orchestrator:** address Phase 4.5 review gaps ([1313c58](https://github.com/djm204/frankenbeast/commit/1313c582fba6e978c22472a937679782c3de13f3))
* **orchestrator:** address PR [#251](https://github.com/djm204/frankenbeast/issues/251) review comments ([0052f0a](https://github.com/djm204/frankenbeast/commit/0052f0abbced47dc37dd32467f92376a0e1ba263))
* **orchestrator:** address PR [#253](https://github.com/djm204/frankenbeast/issues/253) review comments ([8d467a4](https://github.com/djm204/frankenbeast/commit/8d467a40d22b33e4f698fe4fad9de1aa60ae776d))
* **orchestrator:** address PR [#255](https://github.com/djm204/frankenbeast/issues/255) review comments ([5fdecda](https://github.com/djm204/frankenbeast/commit/5fdecda1dd552d69062feadf5e67db6a23e0a41f))
* **orchestrator:** address PR [#256](https://github.com/djm204/frankenbeast/issues/256) review comments ([abd918c](https://github.com/djm204/frankenbeast/commit/abd918cfcb30234affb72ef17e07f062aea2974b))
* **orchestrator:** address PR [#260](https://github.com/djm204/frankenbeast/issues/260) review comments ([75d628e](https://github.com/djm204/frankenbeast/commit/75d628e5a7affc50615e48c0b41622f95d7af1b4))
* **orchestrator:** allow dashboard CORS origins ([59cf742](https://github.com/djm204/frankenbeast/commit/59cf7422d6e543c6b5e56589336303152611d071))
* **orchestrator:** allow deleting failed/completed agents, fix dashboard test ([e67166b](https://github.com/djm204/frankenbeast/commit/e67166b1119c490f39f9896f59f2035b178b66a7))
* **orchestrator:** bound config budget limits ([#308](https://github.com/djm204/frankenbeast/issues/308)) ([b4e2ad8](https://github.com/djm204/frankenbeast/commit/b4e2ad83c214f15cdba67673396c5ef2aba99bf3))
* **orchestrator:** bridge provider registries ([#447](https://github.com/djm204/frankenbeast/issues/447)) ([930175f](https://github.com/djm204/frankenbeast/commit/930175f63c617d8767b8598430ac75c649f9d547))
* **orchestrator:** close graph-builder critique bypass in local CLI path ([#462](https://github.com/djm204/frankenbeast/issues/462)) ([3174314](https://github.com/djm204/frankenbeast/commit/31743147cbd0a4e497f7285ab59fe3b458a5224a))
* **orchestrator:** distrust repo command override approvals ([#834](https://github.com/djm204/frankenbeast/issues/834)) ([72659ee](https://github.com/djm204/frankenbeast/commit/72659eeb68cc5791c1ef6dddc96fd652e050f318))
* **orchestrator:** fail closed when safety-critical modules are absent ([#394](https://github.com/djm204/frankenbeast/issues/394)) ([26eb340](https://github.com/djm204/frankenbeast/commit/26eb340c40fd62049bcdbe85a8194db26834462a))
* **orchestrator:** fence chunk file prompts ([#317](https://github.com/djm204/frankenbeast/issues/317)) ([c2ddec1](https://github.com/djm204/frankenbeast/commit/c2ddec1f3bf2ab6e3d4dcc4bae6117f7190cd243))
* **orchestrator:** finalize issue-mode sessions ([#481](https://github.com/djm204/frankenbeast/issues/481)) ([6a53d9d](https://github.com/djm204/frankenbeast/commit/6a53d9d17697c0f78da6622f95ea3e506330edb3))
* **orchestrator:** gate provider command overrides ([#664](https://github.com/djm204/frankenbeast/issues/664)) ([b785bb9](https://github.com/djm204/frankenbeast/commit/b785bb92c3a462f27886b1e7190a30cf2e97092d)), closes [#590](https://github.com/djm204/frankenbeast/issues/590)
* **orchestrator:** guard readline creation behind TTY check in governor wiring ([7785c72](https://github.com/djm204/frankenbeast/commit/7785c72d21afa5d331ba02ab5ace298c40b580ed))
* **orchestrator:** handle missing provider CLIs ([#762](https://github.com/djm204/frankenbeast/issues/762)) ([6a9235d](https://github.com/djm204/frankenbeast/commit/6a9235dfca6538a27023c836473c9e0ea639a8c0))
* **orchestrator:** harden CLI adapter timeout handling ([#320](https://github.com/djm204/frankenbeast/issues/320)) ([df4a4e1](https://github.com/djm204/frankenbeast/commit/df4a4e110721d43726ea8bad3502c372718c65d0))
* **orchestrator:** harden verify command execution ([6a4c95e](https://github.com/djm204/frankenbeast/commit/6a4c95ef1f5d6e298bc4fde5ce8f5fad1cd81913)), closes [#521](https://github.com/djm204/frankenbeast/issues/521)
* **orchestrator:** improve CLI no-op UX ([#318](https://github.com/djm204/frankenbeast/issues/318)) ([b45818f](https://github.com/djm204/frankenbeast/commit/b45818fb150861add8b632d0de23ca6c6e9c82b2))
* **orchestrator:** log HTTP errors to terminal, allow deleting failed agents ([31fb762](https://github.com/djm204/frankenbeast/commit/31fb76286b4236e5fa822b8b41f6c51f3cb9fcec))
* **orchestrator:** make beast run updates atomic ([#838](https://github.com/djm204/frankenbeast/issues/838)) ([fe6fede](https://github.com/djm204/frankenbeast/commit/fe6fede5d024e5580f82d90107b1b6e376d3be52))
* **orchestrator:** make chunk session writes atomic and quarantine corrupt sessions ([#451](https://github.com/djm204/frankenbeast/issues/451)) ([6ab8f53](https://github.com/djm204/frankenbeast/commit/6ab8f530651d5c1c8dd3648920c1cdab1174c9d7))
* **orchestrator:** make FileCheckpointStore atomic and crash-safe ([#321](https://github.com/djm204/frankenbeast/issues/321)) ([fee14e3](https://github.com/djm204/frankenbeast/commit/fee14e3109df4ab9aae23169c2d16364167ff551))
* **orchestrator:** mark container workspaces git-safe ([#476](https://github.com/djm204/frankenbeast/issues/476)) ([c6fb6a8](https://github.com/djm204/frankenbeast/commit/c6fb6a892748b077443a1f1c924324d19124f348))
* **orchestrator:** mock session/GC classes in dep-factory tests to prevent CI timeouts ([582dd03](https://github.com/djm204/frankenbeast/commit/582dd032bc37aae92d58559e5919b8b587f9d50a))
* **orchestrator:** normalize non-object config root, persist on remove ([7956228](https://github.com/djm204/frankenbeast/commit/7956228ea4cda037633751af88d072cbd3d82d4f))
* **orchestrator:** operator-auth all control-plane routes + comms endpoints ([#396](https://github.com/djm204/frankenbeast/issues/396)) ([398c752](https://github.com/djm204/frankenbeast/commit/398c7524cd467d18ac03a75c046124104e8342ff))
* **orchestrator:** persist BeastLogger file writes ([#315](https://github.com/djm204/frankenbeast/issues/315)) ([0bba450](https://github.com/djm204/frankenbeast/commit/0bba450dd52ee8331d73cfb342638119c4c4ab29))
* **orchestrator:** populate phase in ChatRuntime.result(), update docs ([#277](https://github.com/djm204/frankenbeast/issues/277)) ([ec02071](https://github.com/djm204/frankenbeast/commit/ec02071c8987d8b1794784c09a9c2f8e98bb8f33))
* **orchestrator:** preserve cli:* skill compatibility in consolidated deps ([b0231c5](https://github.com/djm204/frankenbeast/commit/b0231c5250ebb6bb5b97726929835ea64970d11e))
* **orchestrator:** preserve MCP tool HITL metadata ([#552](https://github.com/djm204/frankenbeast/issues/552)) ([2008c70](https://github.com/djm204/frankenbeast/commit/2008c707c9297958c498ba3cc30cb898c1a46018))
* **orchestrator:** propagate adapter LLM failures instead of empty string ([#323](https://github.com/djm204/frankenbeast/issues/323)) ([ab9d64b](https://github.com/djm204/frankenbeast/commit/ab9d64b1453f3220511164226fff0b29b34f361a))
* **orchestrator:** propagate reflection flag into orchestrator config ([4db763c](https://github.com/djm204/frankenbeast/commit/4db763ce818d2be4354bcb75e3848b806f99cae5))
* **orchestrator:** prove and harden MartinLoop abort-listener cleanup ([#324](https://github.com/djm204/frankenbeast/issues/324)) ([5d0465d](https://github.com/djm204/frankenbeast/commit/5d0465d2bd82e7f921c365c9dffe5e024f34c4ba))
* **orchestrator:** redact configured Beast log secrets ([f81b2e7](https://github.com/djm204/frankenbeast/commit/f81b2e79d379de5ce4b5f0abcd0046ead72aa7a0))
* **orchestrator:** rehydrate checkpointed dependency outputs ([#483](https://github.com/djm204/frankenbeast/issues/483)) ([f23dbfe](https://github.com/djm204/frankenbeast/commit/f23dbfe9fb316338b49ae41cf82cc89e911bcf03))
* **orchestrator:** reject stale Discord interaction signatures ([#386](https://github.com/djm204/frankenbeast/issues/386)) ([3890e8d](https://github.com/djm204/frankenbeast/commit/3890e8d90c5db9f93449d7760aa8bda27a5f08db)), closes [#352](https://github.com/djm204/frankenbeast/issues/352)
* **orchestrator:** resolve Chunk A residuals R1-R4 ([7572d68](https://github.com/djm204/frankenbeast/commit/7572d68b62c520e4745f9d218f4c5806af71df79))
* **orchestrator:** resolve Chunk A residuals R1-R4 ([778acba](https://github.com/djm204/frankenbeast/commit/778acbae53803c1e2807c99c973392ee2e666429))
* **orchestrator:** resolve review action item hardening ([#336](https://github.com/djm204/frankenbeast/issues/336)) ([763178a](https://github.com/djm204/frankenbeast/commit/763178a1d1ce311cb6181184ef9f3ebbf60bb8e3))
* **orchestrator:** reuse beast control services ([#807](https://github.com/djm204/frankenbeast/issues/807)) ([590e82c](https://github.com/djm204/frankenbeast/commit/590e82c4dabc17098f943b808e88796bc3a5b683))
* **orchestrator:** strip unknown keys from dispatch config before validation ([1d20a54](https://github.com/djm204/frankenbeast/commit/1d20a548d6dec11bf1e0bc0a6a4f4c7255286798))
* **orchestrator:** swallow ENOENT in BeastLogStore.append ([02d303b](https://github.com/djm204/frankenbeast/commit/02d303be59caa5ac2c17be44f3315c42f0903d8a))
* **orchestrator:** use argv subprocess calls for PR/git commands ([#388](https://github.com/djm204/frankenbeast/issues/388)) ([2a9098e](https://github.com/djm204/frankenbeast/commit/2a9098eda6beeb8ccdc612b2bcaca7e9fdc0fb76))
* **orchestrator:** validate refreshed execution plans ([#540](https://github.com/djm204/frankenbeast/issues/540)) ([a2c5a22](https://github.com/djm204/frankenbeast/commit/a2c5a222b4995ea333451cf712c28a6f8870c23f))
* **orchestrator:** validate Slack interactive payloads ([766b75e](https://github.com/djm204/frankenbeast/commit/766b75ec623619a4b9f6e8dd9da09a35b955a7ca))
* **orchestrator:** validate telegram webhook secret token ([#805](https://github.com/djm204/frankenbeast/issues/805)) ([b6c9cb5](https://github.com/djm204/frankenbeast/commit/b6c9cb5efbc6059e63eaf8356a573d8db8df341a))
* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* replace console log statements ([#797](https://github.com/djm204/frankenbeast/issues/797)) ([ef5225f](https://github.com/djm204/frankenbeast/commit/ef5225f7e61196945d481ed40181f86aaea0f40d))
* residual one-shots (comms cleanup, HITL test, checkpoint flush, PROGRESS.md) ([e105db3](https://github.com/djm204/frankenbeast/commit/e105db3fe067c6473d3f2a4bc43fc85756487018))
* **runtime:** proxy chat-server when beast daemon is live ([#767](https://github.com/djm204/frankenbeast/issues/767)) ([7a1669a](https://github.com/djm204/frankenbeast/commit/7a1669a9f909356355bf7fb0df4ace468458bb98))
* **runtime:** scope beast run configs to project root ([#525](https://github.com/djm204/frankenbeast/issues/525)) ([626b8de](https://github.com/djm204/frankenbeast/commit/626b8de0f3f3754b3ecfaa863924216fa063498b))
* **security:** Chunk 1 — fail-closed HTTP & approval boundaries ([#296](https://github.com/djm204/frankenbeast/issues/296)) ([f281e8e](https://github.com/djm204/frankenbeast/commit/f281e8eb98c6208a7da2f06e2923c57bd9890090))
* **security:** constrain chunk-plan design doc path ([#719](https://github.com/djm204/frankenbeast/issues/719)) ([45b25d9](https://github.com/djm204/frankenbeast/commit/45b25d9cc6ecb6403726b9e4c80eefab2a9f1a2e))
* **security:** decouple webhook signature policy ([#712](https://github.com/djm204/frankenbeast/issues/712)) ([5d6f127](https://github.com/djm204/frankenbeast/commit/5d6f1277b110fda6a2f708427844a026b45c2d4e))
* **security:** fail closed for unsigned exposed webhooks ([ed740eb](https://github.com/djm204/frankenbeast/commit/ed740eb4f87ce3b04210721c777b21b950ab5212)), closes [#611](https://github.com/djm204/frankenbeast/issues/611)
* **security:** gate MCP health checks on trust ([a7968ee](https://github.com/djm204/frankenbeast/commit/a7968eee878d30f8428928bedbfc1d86bebb8560))
* **security:** handle malformed Slack interactive payloads ([#830](https://github.com/djm204/frankenbeast/issues/830)) ([8411c51](https://github.com/djm204/frankenbeast/commit/8411c51b580538c22822b94d74de4365729dd4ca))
* **security:** harden Hono CORS handling ([00a0d2b](https://github.com/djm204/frankenbeast/commit/00a0d2bbcb66121d343b3b3143c4253765a84ffe)), closes [#583](https://github.com/djm204/frankenbeast/issues/583)
* **security:** mask common secrets in PII middleware ([#306](https://github.com/djm204/frankenbeast/issues/306)) ([97e1374](https://github.com/djm204/frankenbeast/commit/97e13748dcd3afa00037a7195aee755ba8d1ef60))
* **security:** move chat socket tokens out of URLs ([#721](https://github.com/djm204/frankenbeast/issues/721)) ([71fd2f7](https://github.com/djm204/frankenbeast/commit/71fd2f76b7655f9ecbed802452b554b7f5835b02))
* **security:** redact Beast failure stderr tails ([#714](https://github.com/djm204/frankenbeast/issues/714)) ([99f4e73](https://github.com/djm204/frankenbeast/commit/99f4e73437b6f8222eb6f8d59ea359c3f2c8a969))
* **security:** redact Beast startup log lines ([#716](https://github.com/djm204/frankenbeast/issues/716)) ([d7cf39c](https://github.com/djm204/frankenbeast/commit/d7cf39cd0c7ea2101c458fa81dde69bc347267bf)), closes [#600](https://github.com/djm204/frankenbeast/issues/600)
* **security:** redact Telegram bot token URLs ([fdda455](https://github.com/djm204/frankenbeast/commit/fdda455f88d4f720f8221030857b1594f39482f1))
* **security:** reject non-loopback plaintext endpoints ([#733](https://github.com/djm204/frankenbeast/issues/733)) ([78741d1](https://github.com/djm204/frankenbeast/commit/78741d1c3c779e4baced6acd75190f36cb445435))
* **security:** sandbox Beast execution ([#298](https://github.com/djm204/frankenbeast/issues/298)) ([9a7b4f0](https://github.com/djm204/frankenbeast/commit/9a7b4f08a11bc3856d7090c4d2371e7048313cfd))
* **security:** ticket dashboard SSE streams ([#740](https://github.com/djm204/frankenbeast/issues/740)) ([6950ed8](https://github.com/djm204/frankenbeast/commit/6950ed84dfef95f4e3de474dd8928e896727b28e)), closes [#622](https://github.com/djm204/frankenbeast/issues/622)
* serve dashboard from production build ([#775](https://github.com/djm204/frankenbeast/issues/775)) ([7a4f8ab](https://github.com/djm204/frankenbeast/commit/7a4f8ab272c5c3dc5d06749d90f86284c63629d6))
* standardize package namespace strategy ([#825](https://github.com/djm204/frankenbeast/issues/825)) ([a2c236f](https://github.com/djm204/frankenbeast/commit/a2c236f9c7d46ab8fea079b85b3df3e4a7383e9b))
* **test:** validate orchestrator Vitest environment flags ([102e0e4](https://github.com/djm204/frankenbeast/commit/102e0e4145cb7ba784be2344fbf6371441156667)), closes [#555](https://github.com/djm204/frankenbeast/issues/555)
* **test:** validate Vitest environment flags ([1479dce](https://github.com/djm204/frankenbeast/commit/1479dcefc5bedfd065667fba75e2bd48b7a1ba5e)), closes [#557](https://github.com/djm204/frankenbeast/issues/557)
* **types:** add recovery fields to FrankenContext ([#312](https://github.com/djm204/frankenbeast/issues/312)) ([34c251a](https://github.com/djm204/frankenbeast/commit/34c251a62ea1eb054d08105beb1cbf659617698e))
* **types:** move orchestration contracts to canonical package ([#819](https://github.com/djm204/frankenbeast/issues/819)) ([e2e860e](https://github.com/djm204/frankenbeast/commit/e2e860e5576de1cc091dc3f3b59c9c06cd060fb9)), closes [#374](https://github.com/djm204/frankenbeast/issues/374)
* **web:** fail closed for dashboard SSE auth ([#739](https://github.com/djm204/frankenbeast/issues/739)) ([04e3b19](https://github.com/djm204/frankenbeast/commit/04e3b19de77c56be9d7ef5a7f383efd33694cc11))
* **web:** fall back to REST for approvals ([#479](https://github.com/djm204/frankenbeast/issues/479)) ([3ac7f74](https://github.com/djm204/frankenbeast/commit/3ac7f74384328418a483fc9a2e4fb8837d87a380))
* **web:** improve approval pending UX ([397aad6](https://github.com/djm204/frankenbeast/commit/397aad66ed038e7329447866e54c327c73952e3b)), closes [#654](https://github.com/djm204/frankenbeast/issues/654)
* **web:** keep chat bearer auth server-side ([#667](https://github.com/djm204/frankenbeast/issues/667)) ([6356ecf](https://github.com/djm204/frankenbeast/commit/6356ecf582e3238ea478b9daa698cdad9e7f6342))
* **web:** keep control-plane operator token server-side ([#666](https://github.com/djm204/frankenbeast/issues/666)) ([d201851](https://github.com/djm204/frankenbeast/commit/d201851f14b35d1388acf4ecf67b872d719559fb))
* **web:** persist agent detail edits ([#533](https://github.com/djm204/frankenbeast/issues/533)) ([de88101](https://github.com/djm204/frankenbeast/commit/de88101a2fcf9514c9785dee931177d098dd95ef))
* **web:** remove operator token from frontend bundle ([fc1b8f5](https://github.com/djm204/frankenbeast/commit/fc1b8f5f7874488440b5755d4f71e8d6dd0774f1)), closes [#566](https://github.com/djm204/frankenbeast/issues/566)
* **web:** stream dashboard sse updates ([#539](https://github.com/djm204/frankenbeast/issues/539)) ([b7d429e](https://github.com/djm204/frankenbeast/commit/b7d429eacdb7f54f83a9cd24ca137415e679306c))
* **web:** wire beast prompt file picker selection ([#815](https://github.com/djm204/frankenbeast/issues/815)) ([b283987](https://github.com/djm204/frankenbeast/commit/b283987264c3c5716c813c78c23c5fa8f65a9bad))
* **web:** wire dashboard Kill action to a real agent/run endpoint ([#450](https://github.com/djm204/frankenbeast/issues/450)) ([562ffad](https://github.com/djm204/frankenbeast/commit/562ffad0661821d7be53ce3d93dbb673b40262a5))
* **web:** wire Network page log fetching ([#532](https://github.com/djm204/frankenbeast/issues/532)) ([49051bd](https://github.com/djm204/frankenbeast/commit/49051bde6a4531c2d5d6439f596f1736e4d98b90))


### Refactoring

* **orchestrator:** clean up governor type assertions and document non-TTY path ([16cab0f](https://github.com/djm204/frankenbeast/commit/16cab0f0ff7281b67d25094f3c819839861d4f8a))
* **orchestrator:** delete standalone comms server files ([35cf137](https://github.com/djm204/frankenbeast/commit/35cf13706eb75e0ae07505fc57a766226206b3f6))
* **orchestrator:** migrate dep-factory to consolidated components ([e432b6d](https://github.com/djm204/frankenbeast/commit/e432b6dd845a059e292df70aba3f18c47f9cafe8))
* **orchestrator:** share analytics sqlite handle ([d9a6b69](https://github.com/djm204/frankenbeast/commit/d9a6b6904be9b193d67d1c4ee2c843a54c001bae)), closes [#681](https://github.com/djm204/frankenbeast/issues/681)
* **orchestrator:** unify CLI availability checks ([#792](https://github.com/djm204/frankenbeast/issues/792)) ([b1ea513](https://github.com/djm204/frankenbeast/commit/b1ea513275fc6cd5d5efd376d4ccc0ffe3131a86))
* **orchestrator:** wire createBeastDeps into dep-factory replacing stubs ([50184a3](https://github.com/djm204/frankenbeast/commit/50184a309f416b49243bf4ca5ae1b133771ca5ad))


### Miscellaneous

* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* release main ([41acdbe](https://github.com/djm204/frankenbeast/commit/41acdbe09c990c38ade8209b3283b4405399dcda))
* release main ([19664bb](https://github.com/djm204/frankenbeast/commit/19664bb4baf0e8e0acb4c7042bcfee7f0799526b))
* release main ([29f20c7](https://github.com/djm204/frankenbeast/commit/29f20c74d7e5b0d5633188d1c6aa14eb189d0cc8))
* release main ([f388c96](https://github.com/djm204/frankenbeast/commit/f388c9636e6b34f63dde32314cfada9935a52370))
* release main ([78fce35](https://github.com/djm204/frankenbeast/commit/78fce35668a8ef71ada15816587858e4f5499470))
* release main ([24ca434](https://github.com/djm204/frankenbeast/commit/24ca434931d802006ec3d7744f2c8d4de9723eb7))
* release main ([ebdbb58](https://github.com/djm204/frankenbeast/commit/ebdbb58c04e68ab5e14414dea2e5f200141c152e))
* release main ([490d5c4](https://github.com/djm204/frankenbeast/commit/490d5c42a79aeb79afb6fc1f00a39eaed09f6a34))
* release main ([50717e2](https://github.com/djm204/frankenbeast/commit/50717e2e2f6bd7c1dcc209e60d1b2cafed6af550))
* release main ([78d8495](https://github.com/djm204/frankenbeast/commit/78d849528ab990a50b2ed6859d98d10cab92b09f))
* release main ([48548f3](https://github.com/djm204/frankenbeast/commit/48548f32209176d6d9a1562fdb4725742ecb9515))
* release main ([1e760f3](https://github.com/djm204/frankenbeast/commit/1e760f3dde475636378bdba15afe4cbc13381239))
* release main ([4ee81c5](https://github.com/djm204/frankenbeast/commit/4ee81c571b79f98e41e6b9531336b7781592e680))
* release main ([4e4ab4c](https://github.com/djm204/frankenbeast/commit/4e4ab4c4c7cde525fef815c057bae24f2c6b34c5))
* release main ([cb2643c](https://github.com/djm204/frankenbeast/commit/cb2643c48eb86850bd76e1e0cd3af0b2e8301990))
* release main ([ed75081](https://github.com/djm204/frankenbeast/commit/ed750811df44ebc431b3aeca32b2606b503b25f3))
* release main ([ffee28a](https://github.com/djm204/frankenbeast/commit/ffee28a05bf220a38b0aa10070f6116db0e3c042))
* release main ([ade7f4a](https://github.com/djm204/frankenbeast/commit/ade7f4a923f9ab55a36744d646e70c6da3d8310c))
* release main ([2d3cf22](https://github.com/djm204/frankenbeast/commit/2d3cf2261539e1012e7a82bced3848d5688283cf))
* release main ([a6d94d3](https://github.com/djm204/frankenbeast/commit/a6d94d3456a0f8d011f3ca629f0ca92e520c117e))
* release main ([696580f](https://github.com/djm204/frankenbeast/commit/696580f097d1f7e982aa35e288eb06d89e86b13f))
* release main ([5e1ba59](https://github.com/djm204/frankenbeast/commit/5e1ba59e0ca6ff7296839508d551d97865adb8d1))
* release main ([#273](https://github.com/djm204/frankenbeast/issues/273)) ([fbdd6a4](https://github.com/djm204/frankenbeast/commit/fbdd6a4429eaf727acc178c5952b629845defc7d))
* release main ([#283](https://github.com/djm204/frankenbeast/issues/283)) ([0d1cc48](https://github.com/djm204/frankenbeast/commit/0d1cc48f4f1a4f75a3fc447cabd274d5eb184f39))
* release main ([#285](https://github.com/djm204/frankenbeast/issues/285)) ([5544c28](https://github.com/djm204/frankenbeast/commit/5544c28d035c0d770e96890e54675a5260892e58))
* release main ([#288](https://github.com/djm204/frankenbeast/issues/288)) ([2022fbe](https://github.com/djm204/frankenbeast/commit/2022fbe37fbe7a1f81beda8f09979c988441dfae))
* release main ([#290](https://github.com/djm204/frankenbeast/issues/290)) ([610a0ea](https://github.com/djm204/frankenbeast/commit/610a0eaae42fa9461e2b7665e0ad2eca6d3ed33a))
* release main ([#293](https://github.com/djm204/frankenbeast/issues/293)) ([f3be88e](https://github.com/djm204/frankenbeast/commit/f3be88ed17e5b296a3ec5bb1beed1d0399d9d4c0))
* release main ([#295](https://github.com/djm204/frankenbeast/issues/295)) ([693ee5e](https://github.com/djm204/frankenbeast/commit/693ee5e698c9f64478a2617d1be8676fcbf392f3))
* release main ([#303](https://github.com/djm204/frankenbeast/issues/303)) ([96f734e](https://github.com/djm204/frankenbeast/commit/96f734efc83b9d13c9df1a7f33ab73e33365b668))
* release main ([#307](https://github.com/djm204/frankenbeast/issues/307)) ([ff8284e](https://github.com/djm204/frankenbeast/commit/ff8284e5c840873912c9c14a475451c30cd0143e))
* release main ([#309](https://github.com/djm204/frankenbeast/issues/309)) ([9dadfae](https://github.com/djm204/frankenbeast/commit/9dadfae67be6686e3a7962c5fd9e21ed8b6b525b))
* release main ([#337](https://github.com/djm204/frankenbeast/issues/337)) ([1f819ef](https://github.com/djm204/frankenbeast/commit/1f819ef9f239137df6977bfbe57442d256a1d2a6))
* release main ([#378](https://github.com/djm204/frankenbeast/issues/378)) ([33629c1](https://github.com/djm204/frankenbeast/commit/33629c1b937e63a97fb06fdb32417ac19323b85d))
* release main ([#389](https://github.com/djm204/frankenbeast/issues/389)) ([24e5428](https://github.com/djm204/frankenbeast/commit/24e5428cc009a1ed497e25a94c0a0911b45eb8e0))
* release main ([#448](https://github.com/djm204/frankenbeast/issues/448)) ([8c9934f](https://github.com/djm204/frankenbeast/commit/8c9934f4adbd05b1ebae48081a3b3406746a1bc3))
* release main ([#474](https://github.com/djm204/frankenbeast/issues/474)) ([f49ac72](https://github.com/djm204/frankenbeast/commit/f49ac727e80491fcd479bacc06bc51d914975cf9))
* release main ([#482](https://github.com/djm204/frankenbeast/issues/482)) ([66f5641](https://github.com/djm204/frankenbeast/commit/66f56417de1252b572fba1f11db008c0a21a34df))
* release main ([#524](https://github.com/djm204/frankenbeast/issues/524)) ([0481cad](https://github.com/djm204/frankenbeast/commit/0481cadf1a5cc49b32e01ca6337bc84c6488bb92))
* release main ([#537](https://github.com/djm204/frankenbeast/issues/537)) ([41d70dd](https://github.com/djm204/frankenbeast/commit/41d70dde60bbbc0983702fc2ebfb63ee0528aa53))
* release main ([#545](https://github.com/djm204/frankenbeast/issues/545)) ([fb5a692](https://github.com/djm204/frankenbeast/commit/fb5a6920da9e053deba737d88f3c515f7d4ad798))
* release main ([#547](https://github.com/djm204/frankenbeast/issues/547)) ([9105085](https://github.com/djm204/frankenbeast/commit/9105085c4c751416999094dbb5a017712356c6d9))
* release main ([#554](https://github.com/djm204/frankenbeast/issues/554)) ([660250e](https://github.com/djm204/frankenbeast/commit/660250e5a21616955b05386eea741f17363c9198))
* release main ([#723](https://github.com/djm204/frankenbeast/issues/723)) ([767f8e2](https://github.com/djm204/frankenbeast/commit/767f8e2d347d1c4757db921e8689170f7fa9a9f1))


### Documentation

* **franken-orchestrator:** document intelligent llm caching ([12a0ea0](https://github.com/djm204/frankenbeast/commit/12a0ea0009d1daa504ed8e12876fe0220cfcd712))
* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))


### Tests

* delete 26 fluff test files (~283 tests) identified by audit ([03358d4](https://github.com/djm204/frankenbeast/commit/03358d4cdc745197e48b61855ed77571a37a2939))
* **franken-orchestrator:** speed up dep-factory harnesses ([9f0e859](https://github.com/djm204/frankenbeast/commit/9f0e859c82f4b39f281500b802dedd58e900efef))
* **governor:** cover factory and sandbox user policy ([#817](https://github.com/djm204/frankenbeast/issues/817)) ([48325c4](https://github.com/djm204/frankenbeast/commit/48325c4d1d86706295ef4a365b3d16b80e4a4817)), closes [#645](https://github.com/djm204/frankenbeast/issues/645)
* **orchestrator:** add comms round-trip integration test (Phase 4.5.05) ([b493ed3](https://github.com/djm204/frankenbeast/commit/b493ed3e3aafdab2f0e8f894c8e72c85815c9eb2))
* **orchestrator:** add HITL approval integration test via comms gateway ([0e31a39](https://github.com/djm204/frankenbeast/commit/0e31a3924134d240d7478a943b84db547a479d35))
* **orchestrator:** add provider failover integration tests (Phase 3.9) ([57d2e8f](https://github.com/djm204/frankenbeast/commit/57d2e8f9a883fd07920d4a07485189c324147352))
* **orchestrator:** cover live comms route mounting ([#765](https://github.com/djm204/frankenbeast/issues/765)) ([0779e89](https://github.com/djm204/frankenbeast/commit/0779e897f56a1cd4c0ae90fd161115513b856e30))
* **orchestrator:** guard chat attach console output ([#799](https://github.com/djm204/frankenbeast/issues/799)) ([f67c39a](https://github.com/djm204/frankenbeast/commit/f67c39a558a64f54b2bfeb794f6f9aed1d47d57e)), closes [#558](https://github.com/djm204/frankenbeast/issues/558)
* replace secret-looking fixture literals ([#787](https://github.com/djm204/frankenbeast/issues/787)) ([e9b5d8a](https://github.com/djm204/frankenbeast/commit/e9b5d8af10d7144290ce0e513658c3b41b8f9597))
* **security:** avoid password literals in fixtures ([#788](https://github.com/djm204/frankenbeast/issues/788)) ([f411648](https://github.com/djm204/frankenbeast/commit/f41164879b1b35152d7bdc02b5e83dd586dd2344))
* **security:** cover exposed unsigned webhook startup guard ([#724](https://github.com/djm204/frankenbeast/issues/724)) ([5f2b2c1](https://github.com/djm204/frankenbeast/commit/5f2b2c1096140a1b125f017f3b73314308d0a503))
* stabilize beast process failure fixtures ([88f4ed7](https://github.com/djm204/frankenbeast/commit/88f4ed7c15d13a1c316e7124e89f17d968b031e2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.6.10 to 0.6.11
    * @franken/governor bumped from 0.5.8 to 0.5.9
    * @franken/types bumped from 0.7.5 to 0.7.6
    * @franken/observer bumped from 0.7.10 to 0.7.11
    * @franken/planner bumped from 0.4.8 to 0.4.9
    * @franken/brain bumped from 0.6.6 to 0.7.0

## [0.39.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.39.0...franken-orchestrator-v0.39.1) (2026-07-06)


### Bug Fixes

* **cli:** guide run users when no plan exists ([#778](https://github.com/djm204/frankenbeast/issues/778)) ([c0b334f](https://github.com/djm204/frankenbeast/commit/c0b334f8e48bad431feb4196a76364b0eecb4b3e))
* **cli:** pass provider override extra args ([6180dc9](https://github.com/djm204/frankenbeast/commit/6180dc972f66525b283e78e9e34af16a6356f39c))
* **cli:** surface non-interactive HITL remedy ([02d65d9](https://github.com/djm204/frankenbeast/commit/02d65d993e533df5bb001f06a57abb9dad657805)), closes [#748](https://github.com/djm204/frankenbeast/issues/748)
* **orchestrator:** handle missing provider CLIs ([#762](https://github.com/djm204/frankenbeast/issues/762)) ([6a9235d](https://github.com/djm204/frankenbeast/commit/6a9235dfca6538a27023c836473c9e0ea639a8c0))
* **orchestrator:** redact configured Beast log secrets ([f81b2e7](https://github.com/djm204/frankenbeast/commit/f81b2e79d379de5ce4b5f0abcd0046ead72aa7a0))
* **orchestrator:** reuse beast control services ([#807](https://github.com/djm204/frankenbeast/issues/807)) ([590e82c](https://github.com/djm204/frankenbeast/commit/590e82c4dabc17098f943b808e88796bc3a5b683))
* **orchestrator:** validate Slack interactive payloads ([766b75e](https://github.com/djm204/frankenbeast/commit/766b75ec623619a4b9f6e8dd9da09a35b955a7ca))
* **orchestrator:** validate telegram webhook secret token ([#805](https://github.com/djm204/frankenbeast/issues/805)) ([b6c9cb5](https://github.com/djm204/frankenbeast/commit/b6c9cb5efbc6059e63eaf8356a573d8db8df341a))
* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* replace console log statements ([#797](https://github.com/djm204/frankenbeast/issues/797)) ([ef5225f](https://github.com/djm204/frankenbeast/commit/ef5225f7e61196945d481ed40181f86aaea0f40d))
* **runtime:** proxy chat-server when beast daemon is live ([#767](https://github.com/djm204/frankenbeast/issues/767)) ([7a1669a](https://github.com/djm204/frankenbeast/commit/7a1669a9f909356355bf7fb0df4ace468458bb98))
* **security:** move chat socket tokens out of URLs ([#721](https://github.com/djm204/frankenbeast/issues/721)) ([71fd2f7](https://github.com/djm204/frankenbeast/commit/71fd2f76b7655f9ecbed802452b554b7f5835b02))
* **security:** redact Telegram bot token URLs ([fdda455](https://github.com/djm204/frankenbeast/commit/fdda455f88d4f720f8221030857b1594f39482f1))
* **security:** reject non-loopback plaintext endpoints ([#733](https://github.com/djm204/frankenbeast/issues/733)) ([78741d1](https://github.com/djm204/frankenbeast/commit/78741d1c3c779e4baced6acd75190f36cb445435))
* **security:** ticket dashboard SSE streams ([#740](https://github.com/djm204/frankenbeast/issues/740)) ([6950ed8](https://github.com/djm204/frankenbeast/commit/6950ed84dfef95f4e3de474dd8928e896727b28e)), closes [#622](https://github.com/djm204/frankenbeast/issues/622)
* serve dashboard from production build ([#775](https://github.com/djm204/frankenbeast/issues/775)) ([7a4f8ab](https://github.com/djm204/frankenbeast/commit/7a4f8ab272c5c3dc5d06749d90f86284c63629d6))
* **test:** validate orchestrator Vitest environment flags ([102e0e4](https://github.com/djm204/frankenbeast/commit/102e0e4145cb7ba784be2344fbf6371441156667)), closes [#555](https://github.com/djm204/frankenbeast/issues/555)
* **test:** validate Vitest environment flags ([1479dce](https://github.com/djm204/frankenbeast/commit/1479dcefc5bedfd065667fba75e2bd48b7a1ba5e)), closes [#557](https://github.com/djm204/frankenbeast/issues/557)
* **web:** fail closed for dashboard SSE auth ([#739](https://github.com/djm204/frankenbeast/issues/739)) ([04e3b19](https://github.com/djm204/frankenbeast/commit/04e3b19de77c56be9d7ef5a7f383efd33694cc11))


### Refactoring

* **orchestrator:** share analytics sqlite handle ([d9a6b69](https://github.com/djm204/frankenbeast/commit/d9a6b6904be9b193d67d1c4ee2c843a54c001bae)), closes [#681](https://github.com/djm204/frankenbeast/issues/681)
* **orchestrator:** unify CLI availability checks ([#792](https://github.com/djm204/frankenbeast/issues/792)) ([b1ea513](https://github.com/djm204/frankenbeast/commit/b1ea513275fc6cd5d5efd376d4ccc0ffe3131a86))


### Miscellaneous

* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)


### Tests

* **orchestrator:** cover live comms route mounting ([#765](https://github.com/djm204/frankenbeast/issues/765)) ([0779e89](https://github.com/djm204/frankenbeast/commit/0779e897f56a1cd4c0ae90fd161115513b856e30))
* **orchestrator:** guard chat attach console output ([#799](https://github.com/djm204/frankenbeast/issues/799)) ([f67c39a](https://github.com/djm204/frankenbeast/commit/f67c39a558a64f54b2bfeb794f6f9aed1d47d57e)), closes [#558](https://github.com/djm204/frankenbeast/issues/558)
* replace secret-looking fixture literals ([#787](https://github.com/djm204/frankenbeast/issues/787)) ([e9b5d8a](https://github.com/djm204/frankenbeast/commit/e9b5d8af10d7144290ce0e513658c3b41b8f9597))
* **security:** avoid password literals in fixtures ([#788](https://github.com/djm204/frankenbeast/issues/788)) ([f411648](https://github.com/djm204/frankenbeast/commit/f41164879b1b35152d7bdc02b5e83dd586dd2344))
* **security:** cover exposed unsigned webhook startup guard ([#724](https://github.com/djm204/frankenbeast/issues/724)) ([5f2b2c1](https://github.com/djm204/frankenbeast/commit/5f2b2c1096140a1b125f017f3b73314308d0a503))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.6.9 to 0.6.10
    * @franken/governor bumped from 0.5.7 to 0.5.8
    * @franken/types bumped from 0.7.4 to 0.7.5
    * @frankenbeast/observer bumped from 0.7.9 to 0.7.10
    * franken-planner bumped from 0.4.7 to 0.4.8
    * franken-brain bumped from 0.6.5 to 0.6.6

## [0.39.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.38.1...franken-orchestrator-v0.39.0) (2026-07-05)


### Features

* **orchestrator:** isolate beast processes in git worktrees ([efbe11e](https://github.com/djm204/frankenbeast/commit/efbe11e86fa032f2f1b360b954cea8a20a8bd8ba)), closes [#494](https://github.com/djm204/frankenbeast/issues/494)
* **orchestrator:** wire execution recovery loop ([#553](https://github.com/djm204/frankenbeast/issues/553)) ([099067f](https://github.com/djm204/frankenbeast/commit/099067faa067414763b83376501fd87722ef0da9))


### Bug Fixes

* **config:** harden insecure defaults ([5abc7f9](https://github.com/djm204/frankenbeast/commit/5abc7f9c51477706ab6246116d44116645b363af)), closes [#522](https://github.com/djm204/frankenbeast/issues/522)
* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)
* **orchestrator:** gate provider command overrides ([#664](https://github.com/djm204/frankenbeast/issues/664)) ([b785bb9](https://github.com/djm204/frankenbeast/commit/b785bb92c3a462f27886b1e7190a30cf2e97092d)), closes [#590](https://github.com/djm204/frankenbeast/issues/590)
* **orchestrator:** harden verify command execution ([6a4c95e](https://github.com/djm204/frankenbeast/commit/6a4c95ef1f5d6e298bc4fde5ce8f5fad1cd81913)), closes [#521](https://github.com/djm204/frankenbeast/issues/521)
* **orchestrator:** preserve MCP tool HITL metadata ([#552](https://github.com/djm204/frankenbeast/issues/552)) ([2008c70](https://github.com/djm204/frankenbeast/commit/2008c707c9297958c498ba3cc30cb898c1a46018))
* **security:** constrain chunk-plan design doc path ([#719](https://github.com/djm204/frankenbeast/issues/719)) ([45b25d9](https://github.com/djm204/frankenbeast/commit/45b25d9cc6ecb6403726b9e4c80eefab2a9f1a2e))
* **security:** decouple webhook signature policy ([#712](https://github.com/djm204/frankenbeast/issues/712)) ([5d6f127](https://github.com/djm204/frankenbeast/commit/5d6f1277b110fda6a2f708427844a026b45c2d4e))
* **security:** fail closed for unsigned exposed webhooks ([ed740eb](https://github.com/djm204/frankenbeast/commit/ed740eb4f87ce3b04210721c777b21b950ab5212)), closes [#611](https://github.com/djm204/frankenbeast/issues/611)
* **security:** gate MCP health checks on trust ([a7968ee](https://github.com/djm204/frankenbeast/commit/a7968eee878d30f8428928bedbfc1d86bebb8560))
* **security:** harden Hono CORS handling ([00a0d2b](https://github.com/djm204/frankenbeast/commit/00a0d2bbcb66121d343b3b3143c4253765a84ffe)), closes [#583](https://github.com/djm204/frankenbeast/issues/583)
* **security:** redact Beast failure stderr tails ([#714](https://github.com/djm204/frankenbeast/issues/714)) ([99f4e73](https://github.com/djm204/frankenbeast/commit/99f4e73437b6f8222eb6f8d59ea359c3f2c8a969))
* **security:** redact Beast startup log lines ([#716](https://github.com/djm204/frankenbeast/issues/716)) ([d7cf39c](https://github.com/djm204/frankenbeast/commit/d7cf39cd0c7ea2101c458fa81dde69bc347267bf)), closes [#600](https://github.com/djm204/frankenbeast/issues/600)
* **web:** improve approval pending UX ([397aad6](https://github.com/djm204/frankenbeast/commit/397aad66ed038e7329447866e54c327c73952e3b)), closes [#654](https://github.com/djm204/frankenbeast/issues/654)
* **web:** keep chat bearer auth server-side ([#667](https://github.com/djm204/frankenbeast/issues/667)) ([6356ecf](https://github.com/djm204/frankenbeast/commit/6356ecf582e3238ea478b9daa698cdad9e7f6342))
* **web:** keep control-plane operator token server-side ([#666](https://github.com/djm204/frankenbeast/issues/666)) ([d201851](https://github.com/djm204/frankenbeast/commit/d201851f14b35d1388acf4ecf67b872d719559fb))
* **web:** remove operator token from frontend bundle ([fc1b8f5](https://github.com/djm204/frankenbeast/commit/fc1b8f5f7874488440b5755d4f71e8d6dd0774f1)), closes [#566](https://github.com/djm204/frankenbeast/issues/566)

## [0.38.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.38.0...franken-orchestrator-v0.38.1) (2026-07-04)


### Bug Fixes

* **orchestrator:** allow dashboard CORS origins ([59cf742](https://github.com/djm204/frankenbeast/commit/59cf7422d6e543c6b5e56589336303152611d071))
* **web:** fall back to REST for approvals ([#479](https://github.com/djm204/frankenbeast/issues/479)) ([3ac7f74](https://github.com/djm204/frankenbeast/commit/3ac7f74384328418a483fc9a2e4fb8837d87a380))
* **web:** persist agent detail edits ([#533](https://github.com/djm204/frankenbeast/issues/533)) ([de88101](https://github.com/djm204/frankenbeast/commit/de88101a2fcf9514c9785dee931177d098dd95ef))
* **web:** wire Network page log fetching ([#532](https://github.com/djm204/frankenbeast/issues/532)) ([49051bd](https://github.com/djm204/frankenbeast/commit/49051bde6a4531c2d5d6439f596f1736e4d98b90))

## [0.38.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.37.3...franken-orchestrator-v0.38.0) (2026-07-04)


### Features

* **comms:** enable Telegram and WhatsApp runtime transports ([#526](https://github.com/djm204/frankenbeast/issues/526)) ([bb4368b](https://github.com/djm204/frankenbeast/commit/bb4368b728c2a730004c6cfff27c7e4f8d878de9))


### Bug Fixes

* **cli:** auto-detect smart resume state ([#543](https://github.com/djm204/frankenbeast/issues/543)) ([461b5c0](https://github.com/djm204/frankenbeast/commit/461b5c0db7686ccdff71c2124e65306b55912d26))
* **network:** track in-process comms gateway ([#487](https://github.com/djm204/frankenbeast/issues/487)) ([b3d7a3b](https://github.com/djm204/frankenbeast/commit/b3d7a3be68dabbfcf3ff6e967ab73b4c0d29677f))

## [0.37.3](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.37.2...franken-orchestrator-v0.37.3) (2026-07-04)


### Bug Fixes

* **api:** share web DTO contracts ([#544](https://github.com/djm204/frankenbeast/issues/544)) ([ec1e29a](https://github.com/djm204/frankenbeast/commit/ec1e29ae21bed03d156f0a58c0f27964566e5e80))
* **cli:** persist security profile changes ([2e51d07](https://github.com/djm204/frankenbeast/commit/2e51d072d332c0ce4ef4b7e780341caff0a034ac)), closes [#403](https://github.com/djm204/frankenbeast/issues/403)
* **cli:** split runnable skill add from scaffold ([b1394aa](https://github.com/djm204/frankenbeast/commit/b1394aa4a4578535dd7b0876e32e58f8564af521)), closes [#404](https://github.com/djm204/frankenbeast/issues/404)
* **cli:** validate numeric options ([61e3ffd](https://github.com/djm204/frankenbeast/commit/61e3ffd5ecda33263d6428a84913b95b5ba7c8cf))
* **orchestrator:** abort martin loop on budget exceedance ([#486](https://github.com/djm204/frankenbeast/issues/486)) ([2040af2](https://github.com/djm204/frankenbeast/commit/2040af26e3c6ba24416782f3604a4db19816932e))
* **orchestrator:** rehydrate checkpointed dependency outputs ([#483](https://github.com/djm204/frankenbeast/issues/483)) ([f23dbfe](https://github.com/djm204/frankenbeast/commit/f23dbfe9fb316338b49ae41cf82cc89e911bcf03))
* **orchestrator:** validate refreshed execution plans ([#540](https://github.com/djm204/frankenbeast/issues/540)) ([a2c5a22](https://github.com/djm204/frankenbeast/commit/a2c5a222b4995ea333451cf712c28a6f8870c23f))
* **web:** stream dashboard sse updates ([#539](https://github.com/djm204/frankenbeast/issues/539)) ([b7d429e](https://github.com/djm204/frankenbeast/commit/b7d429eacdb7f54f83a9cd24ca137415e679306c))

## [0.37.2](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.37.1...franken-orchestrator-v0.37.2) (2026-07-04)


### Bug Fixes

* **runtime:** scope beast run configs to project root ([#525](https://github.com/djm204/frankenbeast/issues/525)) ([626b8de](https://github.com/djm204/frankenbeast/commit/626b8de0f3f3754b3ecfaa863924216fa063498b))

## [0.37.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.37.0...franken-orchestrator-v0.37.1) (2026-07-04)


### Bug Fixes

* **orchestrator:** finalize issue-mode sessions ([#481](https://github.com/djm204/frankenbeast/issues/481)) ([6a53d9d](https://github.com/djm204/frankenbeast/commit/6a53d9d17697c0f78da6622f95ea3e506330edb3))

## [0.37.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.36.0...franken-orchestrator-v0.37.0) (2026-07-03)


### Features

* **orchestrator:** add standalone beast daemon ([#477](https://github.com/djm204/frankenbeast/issues/477)) ([6b770a4](https://github.com/djm204/frankenbeast/commit/6b770a48f33d05e0c91a9b32800499e95049ade1))
* **web:** add beast execution mode selection ([#469](https://github.com/djm204/frankenbeast/issues/469)) ([be44a79](https://github.com/djm204/frankenbeast/commit/be44a79b26d8c8dd2fcef0626e42541d78d6736d))


### Bug Fixes

* address codex sandbox and route follow-ups ([cda3cce](https://github.com/djm204/frankenbeast/commit/cda3ccec1ae728ec75f38bdb93069245bdcf8bd9))
* **orchestrator:** close graph-builder critique bypass in local CLI path ([#462](https://github.com/djm204/frankenbeast/issues/462)) ([3174314](https://github.com/djm204/frankenbeast/commit/31743147cbd0a4e497f7285ab59fe3b458a5224a))
* **orchestrator:** make chunk session writes atomic and quarantine corrupt sessions ([#451](https://github.com/djm204/frankenbeast/issues/451)) ([6ab8f53](https://github.com/djm204/frankenbeast/commit/6ab8f530651d5c1c8dd3648920c1cdab1174c9d7))
* **orchestrator:** mark container workspaces git-safe ([#476](https://github.com/djm204/frankenbeast/issues/476)) ([c6fb6a8](https://github.com/djm204/frankenbeast/commit/c6fb6a892748b077443a1f1c924324d19124f348))
* **web:** wire dashboard Kill action to a real agent/run endpoint ([#450](https://github.com/djm204/frankenbeast/issues/450)) ([562ffad](https://github.com/djm204/frankenbeast/commit/562ffad0661821d7be53ce3d93dbb673b40262a5))

## [0.36.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.35.5...franken-orchestrator-v0.36.0) (2026-07-01)


### Features

* **orchestrator:** add CLI container beast mode ([0178c1d](https://github.com/djm204/frankenbeast/commit/0178c1d8f5fde156bec747b032a36cd49736e251))
* **orchestrator:** harden sandbox container execution ([849d87c](https://github.com/djm204/frankenbeast/commit/849d87ceb27377736af98ebfd26950ea108426af))
* **orchestrator:** wire container chat dispatch ([#468](https://github.com/djm204/frankenbeast/issues/468)) ([94d0f5e](https://github.com/djm204/frankenbeast/commit/94d0f5e7a55a09e8aa540ce0f9832b975af2e9de))
* **web:** stream beast run status and logs ([ef86e02](https://github.com/djm204/frankenbeast/commit/ef86e02776d6398e9b12e94480ec2e15e073692b))


### Bug Fixes

* **cli:** correct provider setup guidance ([#438](https://github.com/djm204/frankenbeast/issues/438)) ([55703a9](https://github.com/djm204/frankenbeast/commit/55703a942effcfa800f3bc2374889c7cf8ad960f))
* **cli:** honor non-interactive init ([#439](https://github.com/djm204/frankenbeast/issues/439)) ([2e8fc74](https://github.com/djm204/frankenbeast/commit/2e8fc749693d93ebc140f7c2089780b18ba055fe))
* **cli:** make beasts catalog exit cleanly ([#442](https://github.com/djm204/frankenbeast/issues/442)) ([5be5766](https://github.com/djm204/frankenbeast/commit/5be576690efbfd379085a307b138f4f0169f6d55))
* **cli:** persist network config sets ([#440](https://github.com/djm204/frankenbeast/issues/440)) ([a129823](https://github.com/djm204/frankenbeast/commit/a129823aa359f72418148b6a1c2dd23959a96bff))
* **orchestrator:** bridge provider registries ([#447](https://github.com/djm204/frankenbeast/issues/447)) ([930175f](https://github.com/djm204/frankenbeast/commit/930175f63c617d8767b8598430ac75c649f9d547))
* **orchestrator:** fail closed when safety-critical modules are absent ([#394](https://github.com/djm204/frankenbeast/issues/394)) ([26eb340](https://github.com/djm204/frankenbeast/commit/26eb340c40fd62049bcdbe85a8194db26834462a))
* **orchestrator:** operator-auth all control-plane routes + comms endpoints ([#396](https://github.com/djm204/frankenbeast/issues/396)) ([398c752](https://github.com/djm204/frankenbeast/commit/398c7524cd467d18ac03a75c046124104e8342ff))

## [0.35.5](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.35.4...franken-orchestrator-v0.35.5) (2026-06-28)


### Bug Fixes

* **orchestrator:** reject stale Discord interaction signatures ([#386](https://github.com/djm204/frankenbeast/issues/386)) ([3890e8d](https://github.com/djm204/frankenbeast/commit/3890e8d90c5db9f93449d7760aa8bda27a5f08db)), closes [#352](https://github.com/djm204/frankenbeast/issues/352)
* **orchestrator:** use argv subprocess calls for PR/git commands ([#388](https://github.com/djm204/frankenbeast/issues/388)) ([2a9098e](https://github.com/djm204/frankenbeast/commit/2a9098eda6beeb8ccdc612b2bcaca7e9fdc0fb76))

## [0.35.4](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.35.3...franken-orchestrator-v0.35.4) (2026-06-28)


### Bug Fixes

* **critique:** make TokenBudgetBreaker actually enforce the budget ([#343](https://github.com/djm204/frankenbeast/issues/343)) ([b878f5f](https://github.com/djm204/frankenbeast/commit/b878f5f82700e3917e16da6c447cfa094b392595))
* **observer,types:** guard token counters against overflow & bad input ([#341](https://github.com/djm204/frankenbeast/issues/341)) ([0a7c6b4](https://github.com/djm204/frankenbeast/commit/0a7c6b4852e959489fbb389971b56f0c64278e5b))

## [0.35.3](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.35.2...franken-orchestrator-v0.35.3) (2026-06-13)


### Bug Fixes

* **orchestrator:** make FileCheckpointStore atomic and crash-safe ([#321](https://github.com/djm204/frankenbeast/issues/321)) ([fee14e3](https://github.com/djm204/frankenbeast/commit/fee14e3109df4ab9aae23169c2d16364167ff551))
* **orchestrator:** propagate adapter LLM failures instead of empty string ([#323](https://github.com/djm204/frankenbeast/issues/323)) ([ab9d64b](https://github.com/djm204/frankenbeast/commit/ab9d64b1453f3220511164226fff0b29b34f361a))
* **orchestrator:** prove and harden MartinLoop abort-listener cleanup ([#324](https://github.com/djm204/frankenbeast/issues/324)) ([5d0465d](https://github.com/djm204/frankenbeast/commit/5d0465d2bd82e7f921c365c9dffe5e024f34c4ba))
* **orchestrator:** resolve review action item hardening ([#336](https://github.com/djm204/frankenbeast/issues/336)) ([763178a](https://github.com/djm204/frankenbeast/commit/763178a1d1ce311cb6181184ef9f3ebbf60bb8e3))

## [0.35.2](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.35.1...franken-orchestrator-v0.35.2) (2026-06-09)


### Bug Fixes

* **orchestrator:** bound config budget limits ([#308](https://github.com/djm204/frankenbeast/issues/308)) ([b4e2ad8](https://github.com/djm204/frankenbeast/commit/b4e2ad83c214f15cdba67673396c5ef2aba99bf3))
* **orchestrator:** fence chunk file prompts ([#317](https://github.com/djm204/frankenbeast/issues/317)) ([c2ddec1](https://github.com/djm204/frankenbeast/commit/c2ddec1f3bf2ab6e3d4dcc4bae6117f7190cd243))
* **orchestrator:** harden CLI adapter timeout handling ([#320](https://github.com/djm204/frankenbeast/issues/320)) ([df4a4e1](https://github.com/djm204/frankenbeast/commit/df4a4e110721d43726ea8bad3502c372718c65d0))
* **orchestrator:** improve CLI no-op UX ([#318](https://github.com/djm204/frankenbeast/issues/318)) ([b45818f](https://github.com/djm204/frankenbeast/commit/b45818fb150861add8b632d0de23ca6c6e9c82b2))
* **orchestrator:** persist BeastLogger file writes ([#315](https://github.com/djm204/frankenbeast/issues/315)) ([0bba450](https://github.com/djm204/frankenbeast/commit/0bba450dd52ee8331d73cfb342638119c4c4ab29))
* **types:** add recovery fields to FrankenContext ([#312](https://github.com/djm204/frankenbeast/issues/312)) ([34c251a](https://github.com/djm204/frankenbeast/commit/34c251a62ea1eb054d08105beb1cbf659617698e))

## [0.35.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.35.0...franken-orchestrator-v0.35.1) (2026-05-26)


### Bug Fixes

* **security:** mask common secrets in PII middleware ([#306](https://github.com/djm204/frankenbeast/issues/306)) ([97e1374](https://github.com/djm204/frankenbeast/commit/97e13748dcd3afa00037a7195aee755ba8d1ef60))

## [0.35.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.34.1...franken-orchestrator-v0.35.0) (2026-05-25)


### Features

* **observer:** durable audit replay ([#299](https://github.com/djm204/frankenbeast/issues/299)) ([34ddc5a](https://github.com/djm204/frankenbeast/commit/34ddc5aa6b17ac6ae87f714e1342a101d7ecd195))


### Bug Fixes

* **security:** sandbox Beast execution ([#298](https://github.com/djm204/frankenbeast/issues/298)) ([9a7b4f0](https://github.com/djm204/frankenbeast/commit/9a7b4f08a11bc3856d7090c4d2371e7048313cfd))

## [0.34.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.34.0...franken-orchestrator-v0.34.1) (2026-05-21)


### Bug Fixes

* **security:** Chunk 1 — fail-closed HTTP & approval boundaries ([#296](https://github.com/djm204/frankenbeast/issues/296)) ([f281e8e](https://github.com/djm204/frankenbeast/commit/f281e8eb98c6208a7da2f06e2923c57bd9890090))

## [0.34.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.33.1...franken-orchestrator-v0.34.0) (2026-05-17)


### Features

* **orchestrator:** beast mode hardening — explicit resume, fail-closed deps, verification matrix ([#292](https://github.com/djm204/frankenbeast/issues/292)) ([c0dd018](https://github.com/djm204/frankenbeast/commit/c0dd01899fd429e4b80bfb85218f0f98890cc136))

## [0.33.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.33.0...franken-orchestrator-v0.33.1) (2026-05-11)


### Bug Fixes

* **mcp-suite:** mitigate hook hangs and uninstall residue ([#287](https://github.com/djm204/frankenbeast/issues/287)) ([b939d36](https://github.com/djm204/frankenbeast/commit/b939d36b68c8c3336af4df491819b32ec962d168))

## [0.33.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.32.0...franken-orchestrator-v0.33.0) (2026-05-07)


### Features

* **web:** add observer analytics dashboard ([#286](https://github.com/djm204/frankenbeast/issues/286)) ([a375ec3](https://github.com/djm204/frankenbeast/commit/a375ec3c484f03bb67260050931609332d62bdd8))

## [0.32.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.31.0...franken-orchestrator-v0.32.0) (2026-04-28)


### Features

* add beast dashboard resume and path controls ([500999f](https://github.com/djm204/frankenbeast/commit/500999f8404ef680616341136cbe5c4eeef4fe10))
* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))
* add beasts dispatch station ([5d87015](https://github.com/djm204/frankenbeast/commit/5d87015b72c714481f846547bdfb847068478e00))
* add enabledModules to CliDepOptions with env var fallback ([f4234c3](https://github.com/djm204/frankenbeast/commit/f4234c341cae10c61e3b49b614a8f43cd8505b82))
* add EpisodicMemoryPortAdapter bridging EpisodicMemoryStore to IMemoryModule ([a3ce9d8](https://github.com/djm204/frankenbeast/commit/a3ce9d84a122a24ba98fbd41a7dc7f7f70e94763))
* add frankenbeast chat persona ([05e75f0](https://github.com/djm204/frankenbeast/commit/05e75f047fecee13145ed26b41cbe7b3db6051dd))
* add frankenbeast chat persona ([a56c434](https://github.com/djm204/frankenbeast/commit/a56c434d7d6660ce491eb175f62060e88febfe3c))
* add init cli surface ([015c599](https://github.com/djm204/frankenbeast/commit/015c599d96f512c0f2cec6a4baf146843cef65bd))
* add init config wizard ([9129b73](https://github.com/djm204/frankenbeast/commit/9129b736bf0d0fd79a9089dab9eebe6178b1ff4d))
* add init state and registries ([a00d3e3](https://github.com/djm204/frankenbeast/commit/a00d3e39f275adaf23733fcbfa86a94755833860))
* add init verify and repair flows ([4f44bb2](https://github.com/djm204/frankenbeast/commit/4f44bb214169b8576e270c864181191d55cb961e))
* add init wizard engine ([a1f9d95](https://github.com/djm204/frankenbeast/commit/a1f9d951418efcb43876a9176bfc2894fa3c206a))
* add ModuleConfig type and TrackedAgent.moduleConfig field ([69b1552](https://github.com/djm204/frankenbeast/commit/69b1552f804bf07dc30ecc1fbc1abec82aba4738))
* add skill directory equivalents for beast definitions ([789b567](https://github.com/djm204/frankenbeast/commit/789b567207768e639d6f4cc9c9ef5bcf95882566))
* add skill directory equivalents for beast definitions ([b63d31f](https://github.com/djm204/frankenbeast/commit/b63d31fbbfd5108e2c22207a62a6d46fb2160040))
* add SkillRegistryBridge to adapt ISkillRegistry to SkillRegistryPort ([5b3bba0](https://github.com/djm204/frankenbeast/commit/5b3bba0786f6a50c5a8a636373ae83cdf6bcce6e))
* add tracked agent dashboard controls ([0f9b4db](https://github.com/djm204/frankenbeast/commit/0f9b4db305950ccdd1580fee28d8ba1ee751d9ee))
* add tracked agent dashboard controls ([fb13aa7](https://github.com/djm204/frankenbeast/commit/fb13aa740788a9ec7b81066d732318ce5314efb7))
* add tracked agent foundations ([4073878](https://github.com/djm204/frankenbeast/commit/407387806cb8972b2115e6aef489df02bf3c07fe))
* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))
* **beasts:** add BeastEventBus with sequence IDs and replay buffer ([6851710](https://github.com/djm204/frankenbeast/commit/68517105fda4513733f40414eb0ac4fc3c19b62f))
* **beasts:** add ProcessCallbacks to ProcessSupervisor with output capture and registry ([5d67738](https://github.com/djm204/frankenbeast/commit/5d6773817776254f7b636de2c5d68c239a9e8f54))
* **beasts:** add resolveCliEntrypoint utility ([8c956ca](https://github.com/djm204/frankenbeast/commit/8c956ca73b0b8ada868bc6ec05a0b09fe7660e63))
* **beasts:** add RunConfigSchema and RunConfigLoader with Zod validation ([10d0864](https://github.com/djm204/frankenbeast/commit/10d0864d502bec3b7a978e77ed36ae2b7f7372a7))
* **beasts:** add SSE routes with connection ticket auth ([8641b32](https://github.com/djm204/frankenbeast/commit/8641b328014bb11ad601959adbff8453ede55d99))
* **beasts:** add SseConnectionTicketStore with single-use tickets and TTL ([69c4390](https://github.com/djm204/frankenbeast/commit/69c4390ac84f6fe6d89552ca1ecd36d2c6d8fc87))
* **beasts:** config file passthrough to spawned processes ([8fe66bb](https://github.com/djm204/frankenbeast/commit/8fe66bb537d4f31337397493a5b361eac0887d86))
* **beasts:** error reporting to dashboard ([a6d9cea](https://github.com/djm204/frankenbeast/commit/a6d9ceac7618d560e2d3da2fb8246a6e377f1efd))
* **beasts:** error reporting to dashboard with spawn failure handling and SIGTERM timeout ([990577c](https://github.com/djm204/frankenbeast/commit/990577c31c93fad8b45a1aa8b159849e62221399))
* **beasts:** expose notifyRunStatusChange on BeastRunService ([daa25fa](https://github.com/djm204/frankenbeast/commit/daa25fa9ab26bd5459c5e7e88731fda690241f9c))
* **beasts:** ProcessSupervisor exit handling + output capture ([6c2600f](https://github.com/djm204/frankenbeast/commit/6c2600fb8a92a57a02e879ce3a60d745120cc3e8))
* **beasts:** replace chunk-plan stub with real CLI spawn ([b368ad3](https://github.com/djm204/frankenbeast/commit/b368ad3970d59d1a3d5a343a7a785d33ce381184))
* **beasts:** replace design-interview stub with real CLI spawn ([d58f7b1](https://github.com/djm204/frankenbeast/commit/d58f7b1b1e0e661fa4b59557f5a8fec888fbe04a))
* **beasts:** replace martin-loop stub with real CLI spawn ([12acef2](https://github.com/djm204/frankenbeast/commit/12acef26756000f81bef3851a4b46f263742762f))
* **beasts:** replace stub buildProcessSpec with real CLI spawns ([2307c0c](https://github.com/djm204/frankenbeast/commit/2307c0cd55c6f8704b5363e76630fd9e6ec0026b))
* **beasts:** SSE event bus + connection tickets (Chunk 06) ([436dca9](https://github.com/djm204/frankenbeast/commit/436dca9567fae9cafcc4178f54c9ab07f2149455))
* **beasts:** wire BeastEventBus into RunService and ProcessBeastExecutor ([8b442bf](https://github.com/djm204/frankenbeast/commit/8b442bf3328ebc3002baefb45fa8beaa8b70b091))
* **beasts:** wire ProcessCallbacks through ProcessBeastExecutor to persistence ([c902168](https://github.com/djm204/frankenbeast/commit/c902168034d659b0428920483190ed8b69d81312))
* **beasts:** wire ProcessCallbacks through ProcessBeastExecutor to persistence ([a2ce1ba](https://github.com/djm204/frankenbeast/commit/a2ce1bacb0d769d212a7bd75321d6eb4ab21dc7e))
* **beasts:** write configSnapshot to JSON file before spawn and clean up on exit ([a010200](https://github.com/djm204/frankenbeast/commit/a010200d5fb5e6e958e201ff4a7471e5248a6a0d))
* **chat:** attach CLI chat to managed network service ([95fa321](https://github.com/djm204/frankenbeast/commit/95fa32102a0ab259ffc9a8af0a4742b3a8ae923b))
* **cli:** add franken and frkn as CLI aliases ([b651cd5](https://github.com/djm204/frankenbeast/commit/b651cd543408ba2e574f3da236d3c75d4354f2f5))
* **cli:** load RunConfig from env in session startup path ([e58844f](https://github.com/djm204/frankenbeast/commit/e58844f2fdfd648a9d62c5c72ef4373a91706e91))
* **cli:** wire RunConfig overrides into dep-factory ([a3831b8](https://github.com/djm204/frankenbeast/commit/a3831b823ab6e65dd9d8d2c5ac577d3cbd243ffd))
* close launch parity gaps ([#284](https://github.com/djm204/frankenbeast/issues/284)) ([7309143](https://github.com/djm204/frankenbeast/commit/7309143648bba36b0788c0b44446455c9a61821a))
* complete dual-mode launch chunks 6-8 and fix adapter wrapping ([#282](https://github.com/djm204/frankenbeast/issues/282)) ([b86792d](https://github.com/djm204/frankenbeast/commit/b86792dac542751035d676230e7481238329a974))
* complete MCP launch chunks 1-5 and canonicalize .fbeast storage ([#279](https://github.com/djm204/frankenbeast/issues/279)) ([22c8ac3](https://github.com/djm204/frankenbeast/commit/22c8ac3ffea24c5a252ab466277ec63261d1ed2d))
* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))
* dashboard SSE routes and web UI panels ([0c8c8e0](https://github.com/djm204/frankenbeast/commit/0c8c8e0520be173cd921edda6c424cc41e7b1292))
* **dashboard:** add beasts dispatch station ([2e5537a](https://github.com/djm204/frankenbeast/commit/2e5537a3cdecc078e55d2ecdfb84c62735bdf265))
* **franken-orchestrator:** add hybrid llm cache primitives ([c929e29](https://github.com/djm204/frankenbeast/commit/c929e29875460703f002b2ec28d738a243d986ec))
* **franken-orchestrator:** add intelligent LLM caching ([c00307c](https://github.com/djm204/frankenbeast/commit/c00307c91c7612f38aa86962f07d04e7feec6b61))
* **franken-orchestrator:** cache repeated planning and issue prompts ([89b3591](https://github.com/djm204/frankenbeast/commit/89b3591b3b92213f14129f60d4cce3b40b15b941))
* implement tracked agent init workflow ([366cc75](https://github.com/djm204/frankenbeast/commit/366cc756338774124ee5a4928a9ff451efec3bbd))
* inject FRANKENBEAST_MODULE_* env vars from run config into beast processes ([6e7aa16](https://github.com/djm204/frankenbeast/commit/6e7aa16a069f4801750b6ee14de57143646cb532))
* **network:** add canonical operator config ([aae7341](https://github.com/djm204/frankenbeast/commit/aae734127c218e412cf3a80449bc20193ef406b3))
* **network:** add cli command surface ([c5bb2c4](https://github.com/djm204/frankenbeast/commit/c5bb2c4594edd2c06e759252cbe1df44ed734cf0))
* **network:** add config-driven network operator control plane ([816ef85](https://github.com/djm204/frankenbeast/commit/816ef853cb0a74ef3d700dc365c2ad4fd198dba4))
* **network:** add config-driven service registry ([40e2c1f](https://github.com/djm204/frankenbeast/commit/40e2c1fb71ec13cf311f3a38963dde9100cc5793))
* **network:** add dashboard network control api ([4ab4dad](https://github.com/djm204/frankenbeast/commit/4ab4dadc774248560acad35128f0979fe3340987))
* **network:** add secure and insecure secret modes ([0ac7175](https://github.com/djm204/frankenbeast/commit/0ac7175d05f9bf82e8ef4b35296e08ffb86091a9))
* **network:** add supervisor runtime and state ([5605829](https://github.com/djm204/frankenbeast/commit/56058295b9d94805d3b4edae08c41b26c260a971))
* **network:** implement operator command family ([c142ec9](https://github.com/djm204/frankenbeast/commit/c142ec905cb256b1f6c4c48dbcecfc68b7e9bf5f))
* **network:** support managed service config overrides ([57974f1](https://github.com/djm204/frankenbeast/commit/57974f16a8a6cdc909f74cb1c1be47a6c7ae14ae))
* **observer:** add audit trail schema, replayer, persistence (Phase 7) ([6ffef1f](https://github.com/djm204/frankenbeast/commit/6ffef1ff67dfaa4fb6ac8f402036f1d22b871c92))
* **orchestrator:** add 6 adapter classes + createBeastDeps (Phase 8.1+8.2) ([b18d93b](https://github.com/djm204/frankenbeast/commit/b18d93be8d03b3da22a1eb86aa418d40e51775a1))
* **orchestrator:** add 6 provider adapters + shared handoff (Phase 3.3-3.8) ([58f5f10](https://github.com/djm204/frankenbeast/commit/58f5f1016a644160046d7cc38e3c147d2cde76a1))
* **orchestrator:** add beast cli dispatch commands ([1d9a44e](https://github.com/djm204/frankenbeast/commit/1d9a44ecbfa8ea7395a2c31c671b7f8b4f077378))
* **orchestrator:** add beast dispatch services and metrics ([dd1fcb2](https://github.com/djm204/frankenbeast/commit/dd1fcb2889ea4f057ddddac67cdb164ffed73fc1))
* **orchestrator:** add beast domain types and storage paths ([3776f12](https://github.com/djm204/frankenbeast/commit/3776f12b271942bc021104a2757f05595717ab03))
* **orchestrator:** add beast process executor and container stub ([4f35887](https://github.com/djm204/frankenbeast/commit/4f358872a58a3c1eaaf7696ec3e89d1f577c210d))
* **orchestrator:** add comms config, token aggregation, delete EpisodicMemoryPortAdapter ([5eba2a8](https://github.com/djm204/frankenbeast/commit/5eba2a8bb5a9867c10fee361dec59c6112c18bfe))
* **orchestrator:** add comms run-config schema (Phase 4.5.04) ([0d7cd30](https://github.com/djm204/frankenbeast/commit/0d7cd309c79f54bdb1a485f072287b4b8c50f193))
* **orchestrator:** add credential store + health checker (Phase 5.9, 5.10) ([ac1a2bd](https://github.com/djm204/frankenbeast/commit/ac1a2bd4c6d8fe5f21081718e4f18c7112dbd571))
* **orchestrator:** add cross-provider token aggregation (Phase 3.10) ([39e2cae](https://github.com/djm204/frankenbeast/commit/39e2caef4464ee389aeafef40ca5438f5f04cbf0))
* **orchestrator:** add dashboard aggregation routes with SSE stream ([f2310e7](https://github.com/djm204/frankenbeast/commit/f2310e7fa401848f84a80374e5abce72856929a8))
* **orchestrator:** add dep-bridge for CliDepOptions → BeastDepsConfig mapping ([bb849ce](https://github.com/djm204/frankenbeast/commit/bb849ce946b538d1e030108356e9897df4411d7a))
* **orchestrator:** add domain allowlist middleware (Phase 4.4) ([854dce4](https://github.com/djm204/frankenbeast/commit/854dce48336c3b26bfef156a0b6b21b0fce26810))
* **orchestrator:** add E2E consolidated deps test + run-config v2 (Phase 8.5, 8.7) ([25a48ed](https://github.com/djm204/frankenbeast/commit/25a48ed4f2e731f0a3db03022fc21e17df7c69de))
* **orchestrator:** add fixed beast catalog and interview service ([35942a2](https://github.com/djm204/frankenbeast/commit/35942a2aca31b85ee8724291d16af9745abcadfb))
* **orchestrator:** add LLM middleware chain + 3 middleware (Phase 4.2) ([ba1c2a1](https://github.com/djm204/frankenbeast/commit/ba1c2a11acdd28c66146814b3db32c0185345695))
* **orchestrator:** add provider skill translation + auth resolver (Phase 5.3, 5.4) ([f227431](https://github.com/djm204/frankenbeast/commit/f227431fcd132d00423b88a36fb169d9a0693fb4))
* **orchestrator:** add provider-aware outbound formatting (Phase 4.5.02) ([351e060](https://github.com/djm204/frankenbeast/commit/351e0605bab988b380a9cf3c11be1c82b6beff26))
* **orchestrator:** add ProviderRegistry with failover logic (Phase 3.2) ([3725cee](https://github.com/djm204/frankenbeast/commit/3725cee04c4445986862b0b088225243ce0e6ad3))
* **orchestrator:** add reflection runtime trigger (Phase 6.2) ([8ff8933](https://github.com/djm204/frankenbeast/commit/8ff89331e14a3ea4233eb2c9037b59ef805ede80))
* **orchestrator:** add secure beast dispatch routes ([36e63ac](https://github.com/djm204/frankenbeast/commit/36e63acb5ab8bda89e7632f7b00dab8e0c65a3f1))
* **orchestrator:** add security profiles + API routes (Phase 4.3) ([f516985](https://github.com/djm204/frankenbeast/commit/f51698522db5460f34554c27202e4196ef88817c))
* **orchestrator:** add skill API routes + context endpoints (Phase 5.6, 5.7, 5.11) ([b2804a2](https://github.com/djm204/frankenbeast/commit/b2804a2213cdea54d3e1bfda3c222cea96fb5ff6))
* **orchestrator:** add skill/provider/security/dashboard CLI commands ([23bcc2f](https://github.com/djm204/frankenbeast/commit/23bcc2f8a788f7acac26045108eea0f7e401de11))
* **orchestrator:** add skill/provider/security/dashboard CLI commands ([cd1ac1b](https://github.com/djm204/frankenbeast/commit/cd1ac1b189af357f59dbdbb8e5b8dde2a90f9509))
* **orchestrator:** add SkillConfigStore for persistent skill toggle state ([4920421](https://github.com/djm204/frankenbeast/commit/492042128980080976271f5dec76d2b6908de7c6))
* **orchestrator:** add SkillConfigStore for persistent skill toggle state ([05a5191](https://github.com/djm204/frankenbeast/commit/05a5191ab0a3f6a98cca32de5d700be727418acb))
* **orchestrator:** add SkillManager core CRUD (Phase 5.2) ([992105d](https://github.com/djm204/frankenbeast/commit/992105dceec8f661b93cc2b34f1876c5198288a2))
* **orchestrator:** dispatch beasts from chat sessions ([b4336ab](https://github.com/djm204/frankenbeast/commit/b4336ab17b830e4777cf4d302037628c01887585))
* **orchestrator:** intelligent LLM caching with work-scoped isolation ([b2d4e87](https://github.com/djm204/frankenbeast/commit/b2d4e870fb43f2dc91a887e058ccc06d961c0d4e))
* **orchestrator:** last-mile wiring — activate consolidation components in production runtime ([#275](https://github.com/djm204/frankenbeast/issues/275)) ([d318813](https://github.com/djm204/frankenbeast/commit/d318813518c99aede74aedc3ed9c4577cec114f4))
* **orchestrator:** mount skill routes in chat-app when skillManager provided ([9ae5889](https://github.com/djm204/frankenbeast/commit/9ae58893669c4a4c837ed5aad1cd7df1a22970ce))
* **orchestrator:** pass commsConfig through startChatServer to createChatApp ([fba06ca](https://github.com/djm204/frankenbeast/commit/fba06ca4f4b6024ec3010aeee660eb91be8de636))
* **orchestrator:** persist beast runs attempts and logs ([b8344e8](https://github.com/djm204/frankenbeast/commit/b8344e8767b4b3bbc5fdb9db67cbf34a645abf5b))
* **orchestrator:** replace ChatSocketBridge with direct ChatRuntime (Phase 4.5.01) ([6879e26](https://github.com/djm204/frankenbeast/commit/6879e26574e7efeb7940553c8d0c489c243382e2))
* **orchestrator:** security profile integration for webhook verification (Phase 4.5.03) ([5c9c6ca](https://github.com/djm204/frankenbeast/commit/5c9c6caced4563e0150774a6595614c8bb41a1ac))
* **orchestrator:** support upstream repo targeting for issues ([414b7e1](https://github.com/djm204/frankenbeast/commit/414b7e1c33e5762c5966b55d05932ef02ba2fe3a))
* **orchestrator:** support upstream repo targeting for issues ([20d0585](https://github.com/djm204/frankenbeast/commit/20d058503589bdf940b4cbc497b5e22ec3310fe8))
* **orchestrator:** support upstream repo targeting for issues ([aa1819e](https://github.com/djm204/frankenbeast/commit/aa1819e99105376a13b4b8e9f927aca5ba1aba5d))
* **orchestrator:** unify issue pipeline with BeastLoop and optimize context window ([ffa6299](https://github.com/djm204/frankenbeast/commit/ffa6299f446663cc724da6311467824d75bed0c5))
* **orchestrator:** wire critique module in dep-factory with fallback ([add4b1f](https://github.com/djm204/frankenbeast/commit/add4b1ffda6a1611662e5a0eab28e52f3741d855))
* **orchestrator:** wire discoverSkills into CLI adapters (Phase 5.5) ([fb06baa](https://github.com/djm204/frankenbeast/commit/fb06baaf6f2669f105a59f0d34496d6a83a3112b))
* **orchestrator:** wire governor module in dep-factory with HITL channel and fallback ([931da7f](https://github.com/djm204/frankenbeast/commit/931da7f8e53729e99a6f1aa6e5221c471559444b))
* Phase 3 — Provider Registry + Adapters ([0ceb582](https://github.com/djm204/frankenbeast/commit/0ceb582f95a7ac7cac877adeb6b08bbe4aa9efd1))
* Phase 4 — Security Middleware ([2f4112b](https://github.com/djm204/frankenbeast/commit/2f4112bac8f0d8940ef141f64c7229c397535eea))
* Phase 4.5 — Comms Integration ([a3e8053](https://github.com/djm204/frankenbeast/commit/a3e80537a5e1413aab5cedd976c9d6724e796266))
* Phase 5 — Skill Loading ([bc99631](https://github.com/djm204/frankenbeast/commit/bc99631f27cd2ea1b4072e19998b3fc89eb389b0))
* Phase 6 — Absorb Reflection into Critique ([82ac47d](https://github.com/djm204/frankenbeast/commit/82ac47d6a67763a622f2d24058e6c30dbe989c46))
* Phase 7 — Observer Audit Trail ([ea50e97](https://github.com/djm204/frankenbeast/commit/ea50e97b7b4d88c3a0e7261be8d5b08bb630441e))
* Phase 8 — Wire Everything Together (Core) ([12d5293](https://github.com/djm204/frankenbeast/commit/12d52933d8ac27d5b2d46a24229fc94cf3c8c7d9))
* Plan 1 — Foundation Execution Pipeline ([bc4cc63](https://github.com/djm204/frankenbeast/commit/bc4cc63b958dfe1d9763056f69b5495b7272b73e))
* secret store with 4 pluggable backends ([f05846f](https://github.com/djm204/frankenbeast/commit/f05846f70dbc6b6815ae4568c829d9eedc0a1670))
* **secret-store:** add backend selection and raw secret prompts to init wizard ([21c0ac6](https://github.com/djm204/frankenbeast/commit/21c0ac628ffd445cc9888bc9f79c73511956ec29))
* **secret-store:** add ISecretStore interface and factory with stubs ([9619b15](https://github.com/djm204/frankenbeast/commit/9619b15f8077e1fa0e18e87139fa986a78a3aaf4))
* **secret-store:** add secret-backend-selection to InitStepId ([8a329e9](https://github.com/djm204/frankenbeast/commit/8a329e9ce6aabae19b92c94e7f5de25176ba8540))
* **secret-store:** add shared CLI runner utility for secret backends ([8a2382e](https://github.com/djm204/frankenbeast/commit/8a2382e6e6240f3c2653ffd737b2c3e45362f74f))
* **secret-store:** consolidate OS backends to os-keychain, add operatorTokenRef, remove createSecretRef ([612a3ba](https://github.com/djm204/frankenbeast/commit/612a3ba30183c5b473e3656994b51a4ca407952f))
* **secret-store:** implement BitwardenStore with upsert and session management ([eb1a02b](https://github.com/djm204/frankenbeast/commit/eb1a02b455bb134e69ba6f39b62ff41488f23985))
* **secret-store:** implement LocalEncryptedStore with AES-256-GCM ([43ccbef](https://github.com/djm204/frankenbeast/commit/43ccbefbf3302bbbae175fa267f5732b3b2003f4))
* **secret-store:** implement OnePasswordStore with upsert and mock CLI runner ([90ce434](https://github.com/djm204/frankenbeast/commit/90ce434e0a744c552d58f5e008af08efd7653ee9))
* **secret-store:** implement OsKeychainStore with platform detection (linux/macOS/Windows) ([d4c1c34](https://github.com/djm204/frankenbeast/commit/d4c1c34fd1e43a6f61075d29d2b97a6ab1142e88))
* **secret-store:** implement SecretResolver for runtime secret resolution ([1306ec1](https://github.com/djm204/frankenbeast/commit/1306ec15f597a987acee0fc8b98c22ca88f47b4f))
* **secret-store:** resolve operator token from secret store at boot ([332127e](https://github.com/djm204/frankenbeast/commit/332127e7cb6cb893b0f458fc5c6d5f52e1b17fc0))
* **secret-store:** wire secret store into init engine and verification ([795da78](https://github.com/djm204/frankenbeast/commit/795da78762d2b8d7b5ecbb00203afada7bfc2b9d))
* wire critique and governor modules in dep-factory (Tiers 3-4) ([8d55339](https://github.com/djm204/frankenbeast/commit/8d553399167860bad06a03c85e5b6045a0fb8b1e))
* wire per-agent module toggle persistence and dispatch plumbing ([6ead11e](https://github.com/djm204/frankenbeast/commit/6ead11ef18447806863eaa8cb0cc3136638f0204))
* wire real EpisodicMemoryPortAdapter into createCliDeps with module toggle gate ([7979020](https://github.com/djm204/frankenbeast/commit/7979020f60a74c22efd630555d6a4f55f106f3c2))
* wire real Firewall, Skills, Memory modules into BeastLoop (Tiers 1-2) ([b835f52](https://github.com/djm204/frankenbeast/commit/b835f529b6167984d54586d8194485664418eef6))
* wire real FirewallPortAdapter into createCliDeps with module toggle gate ([62ff60e](https://github.com/djm204/frankenbeast/commit/62ff60eabba5b27ca08b4df6a9ac54e0e925c0b3))
* wire real SkillsPortAdapter into createCliDeps with module toggle gate ([9591a55](https://github.com/djm204/frankenbeast/commit/9591a552507e3519f8cda7825cc2fad5c4404229))
* wire tracked agents through dispatch and chat ([7179567](https://github.com/djm204/frankenbeast/commit/71795676226f9675c74902b83edd9c15b1d4a966))


### Bug Fixes

* add provider fallback to cli llm adapter ([643ed9f](https://github.com/djm204/frankenbeast/commit/643ed9f3876d760f9621d648dbf6cd2e5fb021ca))
* add rate limiting and dispatch failure handling to agent creation ([36641a7](https://github.com/djm204/frankenbeast/commit/36641a766725e6e6ee4022040a24036e3f76738c))
* address 10 review issues on dashboard chunk ([037a57a](https://github.com/djm204/frankenbeast/commit/037a57a2538682233612143e02f289cd88a19cb2))
* address 10 review issues on dashboard chunk ([df52d71](https://github.com/djm204/frankenbeast/commit/df52d7152350c03f741f64ee55ee802da1da81b6))
* **beasts:** add projectRoot to configSchema, strengthen env assertions ([8e4ba77](https://github.com/djm204/frankenbeast/commit/8e4ba7745070d2070dcc022d39754e9a7ed610c4))
* **beasts:** address PR [#241](https://github.com/djm204/frankenbeast/issues/241) review findings ([ffa9329](https://github.com/djm204/frankenbeast/commit/ffa9329e39d3901a0110a464e2a819dc38f7820a))
* **beasts:** buffer early exit events and handle null code/signal edge case ([dc899c1](https://github.com/djm204/frankenbeast/commit/dc899c14999b476c50e642c71b95b5b6eaead1b0))
* **beasts:** enable auto-dispatch for design-interview definition ([6cb16e1](https://github.com/djm204/frankenbeast/commit/6cb16e11ffd7f1a34e6707ed1b5f29dda8aae48a))
* **beasts:** fix stop() double-write, duplicate agent events, and spec compliance ([ad2c981](https://github.com/djm204/frankenbeast/commit/ad2c98199988612fe4478888a3b310e218998317))
* **beasts:** make ProcessCallbacks required, fix readline drain race condition ([5509d06](https://github.com/djm204/frankenbeast/commit/5509d0634daba29afa91bea11878a573a98cc307))
* **beasts:** resolve 3 high-severity discrepancies from Pass 7 audit ([bdc0f2c](https://github.com/djm204/frankenbeast/commit/bdc0f2cc4f1a85c3037c4e1b5c56143f30fd35ad))
* **beasts:** resolve all DISCREPANCIES.md findings from Plan 1 ([5679beb](https://github.com/djm204/frankenbeast/commit/5679beb7c72fb4adad3aa946af7f4879f0eab086))
* **beasts:** resolve all Pass 6 Deep Audit findings (R1-R8) ([a9eac61](https://github.com/djm204/frankenbeast/commit/a9eac6144d012928c013a5e4fbcb29a803fc9213))
* **beasts:** resolve Pass 4/5 truth audit findings ([ba0908b](https://github.com/djm204/frankenbeast/commit/ba0908be6512cc0161d648cc1ed4de81823adeab))
* **beasts:** wire dashboard control routes into chat server ([578f5cc](https://github.com/djm204/frankenbeast/commit/578f5cc4d5b93b0c3ecabec12f8dc222af9ccd16))
* broaden start endpoint status guard and clear selection on agent delete ([45026bf](https://github.com/djm204/frankenbeast/commit/45026bf0f7b7fc5edede087e00176f6ed09d3493))
* **cli:** align RunConfigSchema with spec, fix module passthrough and error handling ([9873dfa](https://github.com/djm204/frankenbeast/commit/9873dfa570ef094171dcb21329b4d36efa91d38c))
* **comms:** resolve build errors and unify websocket types ([2669d44](https://github.com/djm204/frankenbeast/commit/2669d4487bdfab9ef3ba522ce5a2dfa4b929cc7f))
* **consolidation:** address review findings — lockfile, comms routes, docs ([e406cc2](https://github.com/djm204/frankenbeast/commit/e406cc2b32cd977f6212b05a300a96ae78480914))
* correct gemini headless prompt args ([a076b7c](https://github.com/djm204/frankenbeast/commit/a076b7cab410b84a6ee141dbb40704b54d27d45b))
* dashboard review fixes, dispatch config stripping, error logging ([cdcf969](https://github.com/djm204/frankenbeast/commit/cdcf969541adfd69bca4a5ac9d4676571b639773))
* fix the connection between dashboard and backend, and make some UI changes ([d137437](https://github.com/djm204/frankenbeast/commit/d1374374b3e0e6195b58a7fd8f19a74dc7f6a40f))
* harden beast route failure handling ([ac53201](https://github.com/djm204/frankenbeast/commit/ac53201a045e777faa6de9f6daa2455349d1050e))
* harden tracked agent beast routes and dispatch validation ([39b6850](https://github.com/djm204/frankenbeast/commit/39b685052c810d09b7b7af237ed15a1d3d7805c8))
* honor provider selection in issues execution ([23073a3](https://github.com/djm204/frankenbeast/commit/23073a31bf0f922913f81006e2dbdf65c3117f41))
* honor run config provider and model precedence ([17d3432](https://github.com/djm204/frankenbeast/commit/17d3432f858d2590f2cb0683dbd2b661bd667fab))
* **lint:** suppress false-positive prefer-const on deferred assignments ([df7779d](https://github.com/djm204/frankenbeast/commit/df7779d9d469ea26361da38147ba23e40321351d))
* make tracked agent dispatch transactional ([4f622d2](https://github.com/djm204/frankenbeast/commit/4f622d2ac72f665267d7a7a2280baa51b970ac55))
* migrate legacy beast run schema ([f97d7f5](https://github.com/djm204/frankenbeast/commit/f97d7f548551afa95246563c7fc914e306f74247))
* **network:** harden startup flow and dashboard connectivity ([b881f2b](https://github.com/djm204/frankenbeast/commit/b881f2bd2d7bf5aa68e9e1f76986d18204811021))
* **network:** harden startup flow and dashboard connectivity ([c312e9f](https://github.com/djm204/frankenbeast/commit/c312e9fd4dd6e2db0f3388da765a3bcb6d7e1b92))
* **observer:** fix cost tracking and document implementation gaps ([7054989](https://github.com/djm204/frankenbeast/commit/7054989522894d5bd2429d71ef73d041e9599725))
* **observer:** fix zero-cost tracking and document implementation gaps ([c75c322](https://github.com/djm204/frankenbeast/commit/c75c322b46dc804873cff78c1ae8756104092cb7))
* **orchestrator:** add missing @franken/critique and @franken/governor dependencies ([31e71f0](https://github.com/djm204/frankenbeast/commit/31e71f01d4aacd062ec42aebcf7bca3762a7de39))
* **orchestrator:** add missing fields to dep-bridge BridgeComponents ([1f08b40](https://github.com/djm204/frankenbeast/commit/1f08b40d1f1ff40cd682f7d0551301b2b67e3795))
* **orchestrator:** address CLI command review issues ([a9bc9a6](https://github.com/djm204/frankenbeast/commit/a9bc9a6834dee58b48be6b78a6a4dd0598120af5))
* **orchestrator:** address issue runtime review feedback ([a1dc2fd](https://github.com/djm204/frankenbeast/commit/a1dc2fd05e08e969aa3edf2e3c7602501853b532))
* **orchestrator:** address Phase 3 review gaps + document residuals ([bfc84ee](https://github.com/djm204/frankenbeast/commit/bfc84ee3f4afa95957100635381a1cbc33fe16f7))
* **orchestrator:** address Phase 4 review gaps ([8e48d85](https://github.com/djm204/frankenbeast/commit/8e48d85b9acbb01a008fd2ace05c8ef6603594c2))
* **orchestrator:** address Phase 4.5 review gaps ([1313c58](https://github.com/djm204/frankenbeast/commit/1313c582fba6e978c22472a937679782c3de13f3))
* **orchestrator:** address PR [#251](https://github.com/djm204/frankenbeast/issues/251) review comments ([0052f0a](https://github.com/djm204/frankenbeast/commit/0052f0abbced47dc37dd32467f92376a0e1ba263))
* **orchestrator:** address PR [#253](https://github.com/djm204/frankenbeast/issues/253) review comments ([8d467a4](https://github.com/djm204/frankenbeast/commit/8d467a40d22b33e4f698fe4fad9de1aa60ae776d))
* **orchestrator:** address PR [#255](https://github.com/djm204/frankenbeast/issues/255) review comments ([5fdecda](https://github.com/djm204/frankenbeast/commit/5fdecda1dd552d69062feadf5e67db6a23e0a41f))
* **orchestrator:** address PR [#256](https://github.com/djm204/frankenbeast/issues/256) review comments ([abd918c](https://github.com/djm204/frankenbeast/commit/abd918cfcb30234affb72ef17e07f062aea2974b))
* **orchestrator:** address PR [#260](https://github.com/djm204/frankenbeast/issues/260) review comments ([75d628e](https://github.com/djm204/frankenbeast/commit/75d628e5a7affc50615e48c0b41622f95d7af1b4))
* **orchestrator:** allow deleting failed/completed agents, fix dashboard test ([e67166b](https://github.com/djm204/frankenbeast/commit/e67166b1119c490f39f9896f59f2035b178b66a7))
* **orchestrator:** guard readline creation behind TTY check in governor wiring ([7785c72](https://github.com/djm204/frankenbeast/commit/7785c72d21afa5d331ba02ab5ace298c40b580ed))
* **orchestrator:** honor provider selection and fallback semantics ([abf1b77](https://github.com/djm204/frankenbeast/commit/abf1b776226e67257ec39e2d34cd359bc3e7eb95))
* **orchestrator:** isolate issue stage sessions ([#212](https://github.com/djm204/frankenbeast/issues/212)) ([44a2c61](https://github.com/djm204/frankenbeast/commit/44a2c617327540bfd04253062e6017487656a3e2))
* **orchestrator:** log HTTP errors to terminal, allow deleting failed agents ([31fb762](https://github.com/djm204/frankenbeast/commit/31fb76286b4236e5fa822b8b41f6c51f3cb9fcec))
* **orchestrator:** make one-shot issues issue-aware and resumable ([09488cb](https://github.com/djm204/frankenbeast/commit/09488cb6f49ee2179ce9d2d0cfaff2f19cd1ef4f))
* **orchestrator:** make one-shot issues issue-aware and resumable ([66a5f4a](https://github.com/djm204/frankenbeast/commit/66a5f4a08680225f41d805bd217bbd5b81bc483d))
* **orchestrator:** mock session/GC classes in dep-factory tests to prevent CI timeouts ([582dd03](https://github.com/djm204/frankenbeast/commit/582dd032bc37aae92d58559e5919b8b587f9d50a))
* **orchestrator:** normalize non-object config root, persist on remove ([7956228](https://github.com/djm204/frankenbeast/commit/7956228ea4cda037633751af88d072cbd3d82d4f))
* **orchestrator:** populate phase in ChatRuntime.result(), update docs ([#277](https://github.com/djm204/frankenbeast/issues/277)) ([ec02071](https://github.com/djm204/frankenbeast/commit/ec02071c8987d8b1794784c09a9c2f8e98bb8f33))
* **orchestrator:** preserve cli:* skill compatibility in consolidated deps ([b0231c5](https://github.com/djm204/frankenbeast/commit/b0231c5250ebb6bb5b97726929835ea64970d11e))
* **orchestrator:** propagate reflection flag into orchestrator config ([4db763c](https://github.com/djm204/frankenbeast/commit/4db763ce818d2be4354bcb75e3848b806f99cae5))
* **orchestrator:** remove shell-backed git execution ([4f8f14d](https://github.com/djm204/frankenbeast/commit/4f8f14d881c150065ed7ccd0a665ea2f72a55cda))
* **orchestrator:** resolve Chunk A residuals R1-R4 ([7572d68](https://github.com/djm204/frankenbeast/commit/7572d68b62c520e4745f9d218f4c5806af71df79))
* **orchestrator:** resolve Chunk A residuals R1-R4 ([778acba](https://github.com/djm204/frankenbeast/commit/778acbae53803c1e2807c99c973392ee2e666429))
* **orchestrator:** standardize issue execution via chunk files ([63942f6](https://github.com/djm204/frankenbeast/commit/63942f6b2a6aff3088a1f5c55c652719717fe7f1))
* **orchestrator:** standardize issue execution via chunk files ([1e6d2eb](https://github.com/djm204/frankenbeast/commit/1e6d2ebbd6e8ad662ca6d70158078bf65070c28a))
* **orchestrator:** standardize subprocess failures ([#213](https://github.com/djm204/frankenbeast/issues/213)) ([130bce2](https://github.com/djm204/frankenbeast/commit/130bce266b71dcc84ba3e3b463d8ff5b4b46a475))
* **orchestrator:** strip unknown keys from dispatch config before validation ([1d20a54](https://github.com/djm204/frankenbeast/commit/1d20a548d6dec11bf1e0bc0a6a4f4c7255286798))
* **orchestrator:** swallow ENOENT in BeastLogStore.append ([02d303b](https://github.com/djm204/frankenbeast/commit/02d303be59caa5ac2c17be44f3315c42f0903d8a))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([1e88e62](https://github.com/djm204/frankenbeast/commit/1e88e6222bc1149311fb8ade17ac8eafa3525bc0))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([33dbf5a](https://github.com/djm204/frankenbeast/commit/33dbf5a483debc2460116f2b1cbbf0cd029a8061))
* preserve provider semantics during cli fallback ([5f34635](https://github.com/djm204/frankenbeast/commit/5f34635505c4dcc4f449e4f33b64c2d171189d5a))
* residual one-shots (comms cleanup, HITL test, checkpoint flush, PROGRESS.md) ([e105db3](https://github.com/djm204/frankenbeast/commit/e105db3fe067c6473d3f2a4bc43fc85756487018))
* **secret-store:** address PR review — 5 fixes for robustness and correctness ([89076b0](https://github.com/djm204/frankenbeast/commit/89076b06e9427b0adb38579f748009378ca1ae0a))
* **secret-store:** critical review fixes — remove dead stub, fix Linux stdin, fix publicKeyRef ([cf9aaf9](https://github.com/djm204/frankenbeast/commit/cf9aaf9fec5de40b7f0e9517d5ab4ef84c35a789))
* **secret-store:** fix exactOptionalPropertyTypes TS errors across all new interfaces ([bf8f267](https://github.com/djm204/frankenbeast/commit/bf8f267dec4f0658596a6cad03b67719031b6798))
* **secret-store:** update init-command test for passphrase and operator token prompts ([56afcdb](https://github.com/djm204/frankenbeast/commit/56afcdb6597384bb177fc61c47049449a8057213))
* start tracked beast agents from dashboard ([c71865f](https://github.com/djm204/frankenbeast/commit/c71865fe25c0c1341f7228cd718d25156056d479))
* start tracked beast agents from dashboard ([be65772](https://github.com/djm204/frankenbeast/commit/be65772b5fff6be06246a6817ef6a2d4e1afd3f0))
* wire beast control into chat server ([aa7d26e](https://github.com/djm204/frankenbeast/commit/aa7d26ed240621af2273d554ef8268c4d5ecbdb8))


### Refactoring

* **orchestrator:** clean up governor type assertions and document non-TTY path ([16cab0f](https://github.com/djm204/frankenbeast/commit/16cab0f0ff7281b67d25094f3c819839861d4f8a))
* **orchestrator:** delete standalone comms server files ([35cf137](https://github.com/djm204/frankenbeast/commit/35cf13706eb75e0ae07505fc57a766226206b3f6))
* **orchestrator:** migrate dep-factory to consolidated components ([e432b6d](https://github.com/djm204/frankenbeast/commit/e432b6dd845a059e292df70aba3f18c47f9cafe8))
* **orchestrator:** resolve hacks, unify pipeline with local files, and fix type safety ([049f2e3](https://github.com/djm204/frankenbeast/commit/049f2e3d4664dab91c7e1d2405adc5e051d3af08))
* **orchestrator:** wire createBeastDeps into dep-factory replacing stubs ([50184a3](https://github.com/djm204/frankenbeast/commit/50184a309f416b49243bf4ca5ae1b133771ca5ad))
* remove redundant init options interface ([66bb85d](https://github.com/djm204/frankenbeast/commit/66bb85da8d2fe62dee0035f94c46a2e7d3b10459))


### Miscellaneous

* add firewall, skills, brain workspace deps to orchestrator ([a8317b7](https://github.com/djm204/frankenbeast/commit/a8317b74d0ed177e55ee46eaa1da6cabcd3ac6ad))
* **franken-orchestrator:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([f6bad37](https://github.com/djm204/frankenbeast/commit/f6bad3795ebc310ec9a6c9f44d05f2b76a164088))
* **franken-orchestrator:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([d1cbef6](https://github.com/djm204/frankenbeast/commit/d1cbef6a1fdf7c7196a2f9d2c8ef48fbb33a990d))
* **franken-orchestrator:** implement read-homepfkdevfrankenbeastfrankenbeastplan ([695c286](https://github.com/djm204/frankenbeast/commit/695c286a3f69983c7cd8371330cf32b8cb46b8e1))
* **main:** release franken-governor 0.4.0 ([c1cb8f3](https://github.com/djm204/frankenbeast/commit/c1cb8f341abc745cf2a94a627e665ef961550433))
* **main:** release franken-governor 0.4.0 ([c252078](https://github.com/djm204/frankenbeast/commit/c252078a6e951748b06996b54f0ab006283af0b3))
* **main:** release franken-orchestrator 0.11.0 ([836fe1c](https://github.com/djm204/frankenbeast/commit/836fe1ce0d295c56ed04faef1fd42cbc61c824af))
* **main:** release franken-orchestrator 0.11.0 ([b5c71f8](https://github.com/djm204/frankenbeast/commit/b5c71f8f352f8743b3bb2d5856ad184232dc36a9))
* **main:** release franken-orchestrator 0.11.0 ([dbba9e9](https://github.com/djm204/frankenbeast/commit/dbba9e95f25530db1c3a5a6de738eae6c568ffe3))
* **main:** release franken-orchestrator 0.11.0 ([0a8862e](https://github.com/djm204/frankenbeast/commit/0a8862e02dbb6adf852d687386d3cbb4ded1ba9f))
* **main:** release franken-orchestrator 0.11.1 ([77db6f6](https://github.com/djm204/frankenbeast/commit/77db6f61228a1678c2d2f237cb421c395c1eff25))
* **main:** release franken-orchestrator 0.11.1 ([949bd84](https://github.com/djm204/frankenbeast/commit/949bd84557d7428d374b4447e1d8356e7df26af2))
* **main:** release franken-orchestrator 0.12.0 ([de2c822](https://github.com/djm204/frankenbeast/commit/de2c822d4dde5b70e98db06678646be8e98ea53b))
* **main:** release franken-orchestrator 0.12.0 ([b56a34d](https://github.com/djm204/frankenbeast/commit/b56a34d554b495278b4037cc6c5cefb9d56e33df))
* **main:** release franken-orchestrator 0.13.0 ([7bfef3d](https://github.com/djm204/frankenbeast/commit/7bfef3dc1dc8610bf7b05d621f5da28c91bfbef0))
* **main:** release franken-orchestrator 0.13.0 ([3608647](https://github.com/djm204/frankenbeast/commit/36086470d523deb50d7e78542c1f2338980cc674))
* **main:** release franken-orchestrator 0.14.0 ([bc15bce](https://github.com/djm204/frankenbeast/commit/bc15bcec9fd1463a3931c43fc5d64e32ecbfe7ea))
* **main:** release franken-orchestrator 0.14.0 ([967383d](https://github.com/djm204/frankenbeast/commit/967383d73814fc01aa58f623df994130d444c353))
* **main:** release franken-orchestrator 0.14.0 ([17ab09e](https://github.com/djm204/frankenbeast/commit/17ab09e21765c8ac894627053937fd365a60dc6b))
* **main:** release franken-orchestrator 0.14.0 ([36ed876](https://github.com/djm204/frankenbeast/commit/36ed876352be18ee97ff468e131da37d68a1a312))
* **main:** release franken-orchestrator 0.14.1 ([3d8b754](https://github.com/djm204/frankenbeast/commit/3d8b754310111e59c50f0c2d180c441380a35b24))
* **main:** release franken-orchestrator 0.14.1 ([2d784f7](https://github.com/djm204/frankenbeast/commit/2d784f79eaa3f34db01f59739c46b67e4d0c54e6))
* **main:** release franken-orchestrator 0.14.2 ([8a41a9f](https://github.com/djm204/frankenbeast/commit/8a41a9f7665826b8994967e3972369e4bf845b8c))
* **main:** release franken-orchestrator 0.14.2 ([3596d99](https://github.com/djm204/frankenbeast/commit/3596d99dc1416808b33a794b915b4fdffa487357))
* **main:** release franken-orchestrator 0.15.0 ([a5795d1](https://github.com/djm204/frankenbeast/commit/a5795d1b3714d8e88d21098494d1c45a6414b757))
* **main:** release franken-orchestrator 0.15.0 ([2f50aad](https://github.com/djm204/frankenbeast/commit/2f50aadde3aa7f8854ac8065e6643f94cd25959b))
* **main:** release franken-orchestrator 0.16.0 ([bc5f0b6](https://github.com/djm204/frankenbeast/commit/bc5f0b693b741a7b5901fe4564e3ec4e5d2452e0))
* **main:** release franken-orchestrator 0.16.0 ([1510dc9](https://github.com/djm204/frankenbeast/commit/1510dc94837ea66c15756f3869dc145ee9cc6ed2))
* **main:** release frankenfirewall 0.5.0 ([c9939d9](https://github.com/djm204/frankenbeast/commit/c9939d9b8011f8f7cfaa240b2f1c79fb010db1cc))
* release main ([41acdbe](https://github.com/djm204/frankenbeast/commit/41acdbe09c990c38ade8209b3283b4405399dcda))
* release main ([19664bb](https://github.com/djm204/frankenbeast/commit/19664bb4baf0e8e0acb4c7042bcfee7f0799526b))
* release main ([29f20c7](https://github.com/djm204/frankenbeast/commit/29f20c74d7e5b0d5633188d1c6aa14eb189d0cc8))
* release main ([f388c96](https://github.com/djm204/frankenbeast/commit/f388c9636e6b34f63dde32314cfada9935a52370))
* release main ([78fce35](https://github.com/djm204/frankenbeast/commit/78fce35668a8ef71ada15816587858e4f5499470))
* release main ([24ca434](https://github.com/djm204/frankenbeast/commit/24ca434931d802006ec3d7744f2c8d4de9723eb7))
* release main ([ebdbb58](https://github.com/djm204/frankenbeast/commit/ebdbb58c04e68ab5e14414dea2e5f200141c152e))
* release main ([490d5c4](https://github.com/djm204/frankenbeast/commit/490d5c42a79aeb79afb6fc1f00a39eaed09f6a34))
* release main ([50717e2](https://github.com/djm204/frankenbeast/commit/50717e2e2f6bd7c1dcc209e60d1b2cafed6af550))
* release main ([78d8495](https://github.com/djm204/frankenbeast/commit/78d849528ab990a50b2ed6859d98d10cab92b09f))
* release main ([48548f3](https://github.com/djm204/frankenbeast/commit/48548f32209176d6d9a1562fdb4725742ecb9515))
* release main ([1e760f3](https://github.com/djm204/frankenbeast/commit/1e760f3dde475636378bdba15afe4cbc13381239))
* release main ([4ee81c5](https://github.com/djm204/frankenbeast/commit/4ee81c571b79f98e41e6b9531336b7781592e680))
* release main ([4e4ab4c](https://github.com/djm204/frankenbeast/commit/4e4ab4c4c7cde525fef815c057bae24f2c6b34c5))
* release main ([cb2643c](https://github.com/djm204/frankenbeast/commit/cb2643c48eb86850bd76e1e0cd3af0b2e8301990))
* release main ([ed75081](https://github.com/djm204/frankenbeast/commit/ed750811df44ebc431b3aeca32b2606b503b25f3))
* release main ([ffee28a](https://github.com/djm204/frankenbeast/commit/ffee28a05bf220a38b0aa10070f6116db0e3c042))
* release main ([ade7f4a](https://github.com/djm204/frankenbeast/commit/ade7f4a923f9ab55a36744d646e70c6da3d8310c))
* release main ([2d3cf22](https://github.com/djm204/frankenbeast/commit/2d3cf2261539e1012e7a82bced3848d5688283cf))
* release main ([a6d94d3](https://github.com/djm204/frankenbeast/commit/a6d94d3456a0f8d011f3ca629f0ca92e520c117e))
* release main ([696580f](https://github.com/djm204/frankenbeast/commit/696580f097d1f7e982aa35e288eb06d89e86b13f))
* release main ([5e1ba59](https://github.com/djm204/frankenbeast/commit/5e1ba59e0ca6ff7296839508d551d97865adb8d1))
* release main ([8ae6599](https://github.com/djm204/frankenbeast/commit/8ae6599c1a9a30902d39c90e8789998f69424d66))
* release main ([7b7a0ff](https://github.com/djm204/frankenbeast/commit/7b7a0ffa7fa23d0ef398d38f21366d08c24010cd))
* release main ([ea3ffb4](https://github.com/djm204/frankenbeast/commit/ea3ffb4650c2eb8716f7a8b57750b88e6fa3ea2d))
* release main ([6c1bae4](https://github.com/djm204/frankenbeast/commit/6c1bae4ffc62e5d57b21b49fb4abfa4202068bc6))
* release main ([92b122d](https://github.com/djm204/frankenbeast/commit/92b122d377cb480c1f7e1f13150f3f8c49362099))
* release main ([973da3b](https://github.com/djm204/frankenbeast/commit/973da3bc20a6185adcf1b504c997cec4bd0f5170))
* release main ([d4a9d83](https://github.com/djm204/frankenbeast/commit/d4a9d8333d11593e0a678e520bd2f39a97c8ce7c))
* release main ([daed900](https://github.com/djm204/frankenbeast/commit/daed9006881558c39d010263f1c409be3785b09e))
* release main ([1ab0863](https://github.com/djm204/frankenbeast/commit/1ab086391aec199aa4685bcc65c0cf6b1a9ea0e6))
* release main ([db01295](https://github.com/djm204/frankenbeast/commit/db01295e7a3734d378c25c17fb5ad8d39e6891f2))
* release main ([4b47eca](https://github.com/djm204/frankenbeast/commit/4b47eca3bf14c4972f038bbd9e0f5bed31e1719c))
* release main ([fabea22](https://github.com/djm204/frankenbeast/commit/fabea2256bbf60ce9e81573564e599fedd7495c4))
* release main ([#211](https://github.com/djm204/frankenbeast/issues/211)) ([ad3e1a4](https://github.com/djm204/frankenbeast/commit/ad3e1a429d9d518254df9e81215d84fd17e6eac4))
* release main ([#214](https://github.com/djm204/frankenbeast/issues/214)) ([6fe0df8](https://github.com/djm204/frankenbeast/commit/6fe0df8c04d94121179bcf9da00fdfb3a025bf91))
* release main ([#273](https://github.com/djm204/frankenbeast/issues/273)) ([fbdd6a4](https://github.com/djm204/frankenbeast/commit/fbdd6a4429eaf727acc178c5952b629845defc7d))
* release main ([#283](https://github.com/djm204/frankenbeast/issues/283)) ([0d1cc48](https://github.com/djm204/frankenbeast/commit/0d1cc48f4f1a4f75a3fc447cabd274d5eb184f39))


### Documentation

* describe tracked agent init workflow ([efeebb8](https://github.com/djm204/frankenbeast/commit/efeebb8d7be5d0eb1abe2ef9323269f09a7bf0d7))
* **franken-orchestrator:** document intelligent llm caching ([12a0ea0](https://github.com/djm204/frankenbeast/commit/12a0ea0009d1daa504ed8e12876fe0220cfcd712))
* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))


### Tests

* add integration test for dep-factory real module wiring, toggles, and fallback ([2f42b66](https://github.com/djm204/frankenbeast/commit/2f42b66caf2426d577b6d98ba233a68b523aa235))
* delete 26 fluff test files (~283 tests) identified by audit ([03358d4](https://github.com/djm204/frankenbeast/commit/03358d4cdc745197e48b61855ed77571a37a2939))
* **franken-orchestrator:** speed up dep-factory harnesses ([9f0e859](https://github.com/djm204/frankenbeast/commit/9f0e859c82f4b39f281500b802dedd58e900efef))
* **orchestrator:** add comms round-trip integration test (Phase 4.5.05) ([b493ed3](https://github.com/djm204/frankenbeast/commit/b493ed3e3aafdab2f0e8f894c8e72c85815c9eb2))
* **orchestrator:** add HITL approval integration test via comms gateway ([0e31a39](https://github.com/djm204/frankenbeast/commit/0e31a3924134d240d7478a943b84db547a479d35))
* **orchestrator:** add provider failover integration tests (Phase 3.9) ([57d2e8f](https://github.com/djm204/frankenbeast/commit/57d2e8f9a883fd07920d4a07485189c324147352))
* stabilize beast process failure fixtures ([88f4ed7](https://github.com/djm204/frankenbeast/commit/88f4ed7c15d13a1c316e7124e89f17d968b031e2))

## [0.31.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.30.0...franken-orchestrator-v0.31.0) (2026-04-19)


### Features

* complete dual-mode launch chunks 6-8 and fix adapter wrapping ([#282](https://github.com/djm204/frankenbeast/issues/282)) ([100dd1f](https://github.com/djm204/frankenbeast/commit/100dd1f9b0bec44419e7412541e522f3785df472))

## [0.30.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.29.0...franken-orchestrator-v0.30.0) (2026-04-10)


### Features

* **orchestrator:** last-mile wiring — activate consolidation components in production runtime ([#275](https://github.com/djm204/frankenbeast/issues/275)) ([d318813](https://github.com/djm204/frankenbeast/commit/d318813518c99aede74aedc3ed9c4577cec114f4))


### Bug Fixes

* dashboard review fixes, dispatch config stripping, error logging ([cdcf969](https://github.com/djm204/frankenbeast/commit/cdcf969541adfd69bca4a5ac9d4676571b639773))
* **orchestrator:** populate phase in ChatRuntime.result(), update docs ([#277](https://github.com/djm204/frankenbeast/issues/277)) ([ec02071](https://github.com/djm204/frankenbeast/commit/ec02071c8987d8b1794784c09a9c2f8e98bb8f33))
* **orchestrator:** resolve Chunk A residuals R1-R4 ([7572d68](https://github.com/djm204/frankenbeast/commit/7572d68b62c520e4745f9d218f4c5806af71df79))
* **orchestrator:** resolve Chunk A residuals R1-R4 ([778acba](https://github.com/djm204/frankenbeast/commit/778acbae53803c1e2807c99c973392ee2e666429))

## [0.29.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.28.0...franken-orchestrator-v0.29.0) (2026-04-01)


### Features

* add skill directory equivalents for beast definitions ([789b567](https://github.com/djm204/frankenbeast/commit/789b567207768e639d6f4cc9c9ef5bcf95882566))
* add skill directory equivalents for beast definitions ([b63d31f](https://github.com/djm204/frankenbeast/commit/b63d31fbbfd5108e2c22207a62a6d46fb2160040))
* dashboard SSE routes and web UI panels ([0c8c8e0](https://github.com/djm204/frankenbeast/commit/0c8c8e0520be173cd921edda6c424cc41e7b1292))
* **orchestrator:** add dashboard aggregation routes with SSE stream ([f2310e7](https://github.com/djm204/frankenbeast/commit/f2310e7fa401848f84a80374e5abce72856929a8))
* **orchestrator:** add skill/provider/security/dashboard CLI commands ([23bcc2f](https://github.com/djm204/frankenbeast/commit/23bcc2f8a788f7acac26045108eea0f7e401de11))
* **orchestrator:** add skill/provider/security/dashboard CLI commands ([cd1ac1b](https://github.com/djm204/frankenbeast/commit/cd1ac1b189af357f59dbdbb8e5b8dde2a90f9509))
* **orchestrator:** add SkillConfigStore for persistent skill toggle state ([4920421](https://github.com/djm204/frankenbeast/commit/492042128980080976271f5dec76d2b6908de7c6))
* **orchestrator:** add SkillConfigStore for persistent skill toggle state ([05a5191](https://github.com/djm204/frankenbeast/commit/05a5191ab0a3f6a98cca32de5d700be727418acb))


### Bug Fixes

* address 10 review issues on dashboard chunk ([037a57a](https://github.com/djm204/frankenbeast/commit/037a57a2538682233612143e02f289cd88a19cb2))
* address 10 review issues on dashboard chunk ([df52d71](https://github.com/djm204/frankenbeast/commit/df52d7152350c03f741f64ee55ee802da1da81b6))
* **orchestrator:** address CLI command review issues ([a9bc9a6](https://github.com/djm204/frankenbeast/commit/a9bc9a6834dee58b48be6b78a6a4dd0598120af5))
* **orchestrator:** normalize non-object config root, persist on remove ([7956228](https://github.com/djm204/frankenbeast/commit/7956228ea4cda037633751af88d072cbd3d82d4f))
* residual one-shots (comms cleanup, HITL test, checkpoint flush, PROGRESS.md) ([e105db3](https://github.com/djm204/frankenbeast/commit/e105db3fe067c6473d3f2a4bc43fc85756487018))


### Refactoring

* **orchestrator:** delete standalone comms server files ([35cf137](https://github.com/djm204/frankenbeast/commit/35cf13706eb75e0ae07505fc57a766226206b3f6))


### Tests

* **orchestrator:** add HITL approval integration test via comms gateway ([0e31a39](https://github.com/djm204/frankenbeast/commit/0e31a3924134d240d7478a943b84db547a479d35))

## [0.28.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.27.0...franken-orchestrator-v0.28.0) (2026-03-27)


### Features

* **orchestrator:** add comms config, token aggregation, delete EpisodicMemoryPortAdapter ([5eba2a8](https://github.com/djm204/frankenbeast/commit/5eba2a8bb5a9867c10fee361dec59c6112c18bfe))
* **orchestrator:** mount skill routes in chat-app when skillManager provided ([9ae5889](https://github.com/djm204/frankenbeast/commit/9ae58893669c4a4c837ed5aad1cd7df1a22970ce))
* **orchestrator:** pass commsConfig through startChatServer to createChatApp ([fba06ca](https://github.com/djm204/frankenbeast/commit/fba06ca4f4b6024ec3010aeee660eb91be8de636))


### Bug Fixes

* **orchestrator:** preserve cli:* skill compatibility in consolidated deps ([b0231c5](https://github.com/djm204/frankenbeast/commit/b0231c5250ebb6bb5b97726929835ea64970d11e))


### Refactoring

* **orchestrator:** migrate dep-factory to consolidated components ([e432b6d](https://github.com/djm204/frankenbeast/commit/e432b6dd845a059e292df70aba3f18c47f9cafe8))
* **orchestrator:** wire createBeastDeps into dep-factory replacing stubs ([50184a3](https://github.com/djm204/frankenbeast/commit/50184a309f416b49243bf4ca5ae1b133771ca5ad))

## [0.27.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.26.0...franken-orchestrator-v0.27.0) (2026-03-26)


### Features

* **orchestrator:** add 6 adapter classes + createBeastDeps (Phase 8.1+8.2) ([b18d93b](https://github.com/djm204/frankenbeast/commit/b18d93be8d03b3da22a1eb86aa418d40e51775a1))
* **orchestrator:** add E2E consolidated deps test + run-config v2 (Phase 8.5, 8.7) ([25a48ed](https://github.com/djm204/frankenbeast/commit/25a48ed4f2e731f0a3db03022fc21e17df7c69de))
* Phase 8 — Wire Everything Together (Core) ([12d5293](https://github.com/djm204/frankenbeast/commit/12d52933d8ac27d5b2d46a24229fc94cf3c8c7d9))


### Bug Fixes

* **orchestrator:** address PR [#260](https://github.com/djm204/frankenbeast/issues/260) review comments ([75d628e](https://github.com/djm204/frankenbeast/commit/75d628e5a7affc50615e48c0b41622f95d7af1b4))
* **orchestrator:** swallow ENOENT in BeastLogStore.append ([02d303b](https://github.com/djm204/frankenbeast/commit/02d303be59caa5ac2c17be44f3315c42f0903d8a))

## [0.26.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.25.0...franken-orchestrator-v0.26.0) (2026-03-26)


### Features

* Phase 7 — Observer Audit Trail ([ea50e97](https://github.com/djm204/frankenbeast/commit/ea50e97b7b4d88c3a0e7261be8d5b08bb630441e))

## [0.25.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.24.0...franken-orchestrator-v0.25.0) (2026-03-26)


### Features

* **orchestrator:** add comms run-config schema (Phase 4.5.04) ([0d7cd30](https://github.com/djm204/frankenbeast/commit/0d7cd309c79f54bdb1a485f072287b4b8c50f193))
* **orchestrator:** add credential store + health checker (Phase 5.9, 5.10) ([ac1a2bd](https://github.com/djm204/frankenbeast/commit/ac1a2bd4c6d8fe5f21081718e4f18c7112dbd571))
* **orchestrator:** add domain allowlist middleware (Phase 4.4) ([854dce4](https://github.com/djm204/frankenbeast/commit/854dce48336c3b26bfef156a0b6b21b0fce26810))
* **orchestrator:** add LLM middleware chain + 3 middleware (Phase 4.2) ([ba1c2a1](https://github.com/djm204/frankenbeast/commit/ba1c2a11acdd28c66146814b3db32c0185345695))
* **orchestrator:** add provider skill translation + auth resolver (Phase 5.3, 5.4) ([f227431](https://github.com/djm204/frankenbeast/commit/f227431fcd132d00423b88a36fb169d9a0693fb4))
* **orchestrator:** add provider-aware outbound formatting (Phase 4.5.02) ([351e060](https://github.com/djm204/frankenbeast/commit/351e0605bab988b380a9cf3c11be1c82b6beff26))
* **orchestrator:** add reflection runtime trigger (Phase 6.2) ([8ff8933](https://github.com/djm204/frankenbeast/commit/8ff89331e14a3ea4233eb2c9037b59ef805ede80))
* **orchestrator:** add security profiles + API routes (Phase 4.3) ([f516985](https://github.com/djm204/frankenbeast/commit/f51698522db5460f34554c27202e4196ef88817c))
* **orchestrator:** add skill API routes + context endpoints (Phase 5.6, 5.7, 5.11) ([b2804a2](https://github.com/djm204/frankenbeast/commit/b2804a2213cdea54d3e1bfda3c222cea96fb5ff6))
* **orchestrator:** add SkillManager core CRUD (Phase 5.2) ([992105d](https://github.com/djm204/frankenbeast/commit/992105dceec8f661b93cc2b34f1876c5198288a2))
* **orchestrator:** replace ChatSocketBridge with direct ChatRuntime (Phase 4.5.01) ([6879e26](https://github.com/djm204/frankenbeast/commit/6879e26574e7efeb7940553c8d0c489c243382e2))
* **orchestrator:** security profile integration for webhook verification (Phase 4.5.03) ([5c9c6ca](https://github.com/djm204/frankenbeast/commit/5c9c6caced4563e0150774a6595614c8bb41a1ac))
* **orchestrator:** wire discoverSkills into CLI adapters (Phase 5.5) ([fb06baa](https://github.com/djm204/frankenbeast/commit/fb06baaf6f2669f105a59f0d34496d6a83a3112b))
* Phase 4 — Security Middleware ([2f4112b](https://github.com/djm204/frankenbeast/commit/2f4112bac8f0d8940ef141f64c7229c397535eea))
* Phase 4.5 — Comms Integration ([a3e8053](https://github.com/djm204/frankenbeast/commit/a3e80537a5e1413aab5cedd976c9d6724e796266))
* Phase 5 — Skill Loading ([bc99631](https://github.com/djm204/frankenbeast/commit/bc99631f27cd2ea1b4072e19998b3fc89eb389b0))
* Phase 6 — Absorb Reflection into Critique ([82ac47d](https://github.com/djm204/frankenbeast/commit/82ac47d6a67763a622f2d24058e6c30dbe989c46))


### Bug Fixes

* **orchestrator:** address Phase 4 review gaps ([8e48d85](https://github.com/djm204/frankenbeast/commit/8e48d85b9acbb01a008fd2ace05c8ef6603594c2))
* **orchestrator:** address Phase 4.5 review gaps ([1313c58](https://github.com/djm204/frankenbeast/commit/1313c582fba6e978c22472a937679782c3de13f3))
* **orchestrator:** address PR [#253](https://github.com/djm204/frankenbeast/issues/253) review comments ([8d467a4](https://github.com/djm204/frankenbeast/commit/8d467a40d22b33e4f698fe4fad9de1aa60ae776d))
* **orchestrator:** address PR [#255](https://github.com/djm204/frankenbeast/issues/255) review comments ([5fdecda](https://github.com/djm204/frankenbeast/commit/5fdecda1dd552d69062feadf5e67db6a23e0a41f))
* **orchestrator:** address PR [#256](https://github.com/djm204/frankenbeast/issues/256) review comments ([abd918c](https://github.com/djm204/frankenbeast/commit/abd918cfcb30234affb72ef17e07f062aea2974b))
* **orchestrator:** propagate reflection flag into orchestrator config ([4db763c](https://github.com/djm204/frankenbeast/commit/4db763ce818d2be4354bcb75e3848b806f99cae5))


### Tests

* **orchestrator:** add comms round-trip integration test (Phase 4.5.05) ([b493ed3](https://github.com/djm204/frankenbeast/commit/b493ed3e3aafdab2f0e8f894c8e72c85815c9eb2))

## [0.24.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.23.0...franken-orchestrator-v0.24.0) (2026-03-23)


### Features

* **orchestrator:** add 6 provider adapters + shared handoff (Phase 3.3-3.8) ([58f5f10](https://github.com/djm204/frankenbeast/commit/58f5f1016a644160046d7cc38e3c147d2cde76a1))
* **orchestrator:** add cross-provider token aggregation (Phase 3.10) ([39e2cae](https://github.com/djm204/frankenbeast/commit/39e2caef4464ee389aeafef40ca5438f5f04cbf0))
* **orchestrator:** add ProviderRegistry with failover logic (Phase 3.2) ([3725cee](https://github.com/djm204/frankenbeast/commit/3725cee04c4445986862b0b088225243ce0e6ad3))
* Phase 3 — Provider Registry + Adapters ([0ceb582](https://github.com/djm204/frankenbeast/commit/0ceb582f95a7ac7cac877adeb6b08bbe4aa9efd1))


### Bug Fixes

* **orchestrator:** address Phase 3 review gaps + document residuals ([bfc84ee](https://github.com/djm204/frankenbeast/commit/bfc84ee3f4afa95957100635381a1cbc33fe16f7))
* **orchestrator:** address PR [#251](https://github.com/djm204/frankenbeast/issues/251) review comments ([0052f0a](https://github.com/djm204/frankenbeast/commit/0052f0abbced47dc37dd32467f92376a0e1ba263))


### Tests

* **orchestrator:** add provider failover integration tests (Phase 3.9) ([57d2e8f](https://github.com/djm204/frankenbeast/commit/57d2e8f9a883fd07920d4a07485189c324147352))

## [0.23.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.22.0...franken-orchestrator-v0.23.0) (2026-03-21)


### Features

* **consolidation:** Phase 1 — remove 5 packages (13→8) ([2eac09c](https://github.com/djm204/frankenbeast/commit/2eac09c64e515d3b5007b1e39d3f73d7b3bdf12b))
* **consolidation:** remove 5 packages, absorb comms into orchestrator (Phase 1) ([1ee949d](https://github.com/djm204/frankenbeast/commit/1ee949d761c4eaf507858f63cccb68e0522bb8b1))


### Bug Fixes

* **consolidation:** address review findings — lockfile, comms routes, docs ([e406cc2](https://github.com/djm204/frankenbeast/commit/e406cc2b32cd977f6212b05a300a96ae78480914))

## [0.22.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.21.1...franken-orchestrator-v0.22.0) (2026-03-20)


### Features

* **beasts:** add BeastEventBus with sequence IDs and replay buffer ([6851710](https://github.com/djm204/frankenbeast/commit/68517105fda4513733f40414eb0ac4fc3c19b62f))
* **beasts:** add ProcessCallbacks to ProcessSupervisor with output capture and registry ([5d67738](https://github.com/djm204/frankenbeast/commit/5d6773817776254f7b636de2c5d68c239a9e8f54))
* **beasts:** add resolveCliEntrypoint utility ([8c956ca](https://github.com/djm204/frankenbeast/commit/8c956ca73b0b8ada868bc6ec05a0b09fe7660e63))
* **beasts:** add RunConfigSchema and RunConfigLoader with Zod validation ([10d0864](https://github.com/djm204/frankenbeast/commit/10d0864d502bec3b7a978e77ed36ae2b7f7372a7))
* **beasts:** add SSE routes with connection ticket auth ([8641b32](https://github.com/djm204/frankenbeast/commit/8641b328014bb11ad601959adbff8453ede55d99))
* **beasts:** add SseConnectionTicketStore with single-use tickets and TTL ([69c4390](https://github.com/djm204/frankenbeast/commit/69c4390ac84f6fe6d89552ca1ecd36d2c6d8fc87))
* **beasts:** config file passthrough to spawned processes ([8fe66bb](https://github.com/djm204/frankenbeast/commit/8fe66bb537d4f31337397493a5b361eac0887d86))
* **beasts:** error reporting to dashboard ([a6d9cea](https://github.com/djm204/frankenbeast/commit/a6d9ceac7618d560e2d3da2fb8246a6e377f1efd))
* **beasts:** error reporting to dashboard with spawn failure handling and SIGTERM timeout ([990577c](https://github.com/djm204/frankenbeast/commit/990577c31c93fad8b45a1aa8b159849e62221399))
* **beasts:** expose notifyRunStatusChange on BeastRunService ([daa25fa](https://github.com/djm204/frankenbeast/commit/daa25fa9ab26bd5459c5e7e88731fda690241f9c))
* **beasts:** ProcessSupervisor exit handling + output capture ([6c2600f](https://github.com/djm204/frankenbeast/commit/6c2600fb8a92a57a02e879ce3a60d745120cc3e8))
* **beasts:** replace chunk-plan stub with real CLI spawn ([b368ad3](https://github.com/djm204/frankenbeast/commit/b368ad3970d59d1a3d5a343a7a785d33ce381184))
* **beasts:** replace design-interview stub with real CLI spawn ([d58f7b1](https://github.com/djm204/frankenbeast/commit/d58f7b1b1e0e661fa4b59557f5a8fec888fbe04a))
* **beasts:** replace martin-loop stub with real CLI spawn ([12acef2](https://github.com/djm204/frankenbeast/commit/12acef26756000f81bef3851a4b46f263742762f))
* **beasts:** replace stub buildProcessSpec with real CLI spawns ([2307c0c](https://github.com/djm204/frankenbeast/commit/2307c0cd55c6f8704b5363e76630fd9e6ec0026b))
* **beasts:** SSE event bus + connection tickets (Chunk 06) ([436dca9](https://github.com/djm204/frankenbeast/commit/436dca9567fae9cafcc4178f54c9ab07f2149455))
* **beasts:** wire BeastEventBus into RunService and ProcessBeastExecutor ([8b442bf](https://github.com/djm204/frankenbeast/commit/8b442bf3328ebc3002baefb45fa8beaa8b70b091))
* **beasts:** wire ProcessCallbacks through ProcessBeastExecutor to persistence ([c902168](https://github.com/djm204/frankenbeast/commit/c902168034d659b0428920483190ed8b69d81312))
* **beasts:** wire ProcessCallbacks through ProcessBeastExecutor to persistence ([a2ce1ba](https://github.com/djm204/frankenbeast/commit/a2ce1bacb0d769d212a7bd75321d6eb4ab21dc7e))
* **beasts:** write configSnapshot to JSON file before spawn and clean up on exit ([a010200](https://github.com/djm204/frankenbeast/commit/a010200d5fb5e6e958e201ff4a7471e5248a6a0d))
* **cli:** add franken and frkn as CLI aliases ([b651cd5](https://github.com/djm204/frankenbeast/commit/b651cd543408ba2e574f3da236d3c75d4354f2f5))
* **cli:** load RunConfig from env in session startup path ([e58844f](https://github.com/djm204/frankenbeast/commit/e58844f2fdfd648a9d62c5c72ef4373a91706e91))
* **cli:** wire RunConfig overrides into dep-factory ([a3831b8](https://github.com/djm204/frankenbeast/commit/a3831b823ab6e65dd9d8d2c5ac577d3cbd243ffd))
* Plan 1 — Foundation Execution Pipeline ([bc4cc63](https://github.com/djm204/frankenbeast/commit/bc4cc63b958dfe1d9763056f69b5495b7272b73e))


### Bug Fixes

* **beasts:** add projectRoot to configSchema, strengthen env assertions ([8e4ba77](https://github.com/djm204/frankenbeast/commit/8e4ba7745070d2070dcc022d39754e9a7ed610c4))
* **beasts:** address PR [#241](https://github.com/djm204/frankenbeast/issues/241) review findings ([ffa9329](https://github.com/djm204/frankenbeast/commit/ffa9329e39d3901a0110a464e2a819dc38f7820a))
* **beasts:** buffer early exit events and handle null code/signal edge case ([dc899c1](https://github.com/djm204/frankenbeast/commit/dc899c14999b476c50e642c71b95b5b6eaead1b0))
* **beasts:** enable auto-dispatch for design-interview definition ([6cb16e1](https://github.com/djm204/frankenbeast/commit/6cb16e11ffd7f1a34e6707ed1b5f29dda8aae48a))
* **beasts:** fix stop() double-write, duplicate agent events, and spec compliance ([ad2c981](https://github.com/djm204/frankenbeast/commit/ad2c98199988612fe4478888a3b310e218998317))
* **beasts:** make ProcessCallbacks required, fix readline drain race condition ([5509d06](https://github.com/djm204/frankenbeast/commit/5509d0634daba29afa91bea11878a573a98cc307))
* **beasts:** resolve 3 high-severity discrepancies from Pass 7 audit ([bdc0f2c](https://github.com/djm204/frankenbeast/commit/bdc0f2cc4f1a85c3037c4e1b5c56143f30fd35ad))
* **beasts:** resolve all DISCREPANCIES.md findings from Plan 1 ([5679beb](https://github.com/djm204/frankenbeast/commit/5679beb7c72fb4adad3aa946af7f4879f0eab086))
* **beasts:** resolve all Pass 6 Deep Audit findings (R1-R8) ([a9eac61](https://github.com/djm204/frankenbeast/commit/a9eac6144d012928c013a5e4fbcb29a803fc9213))
* **beasts:** resolve Pass 4/5 truth audit findings ([ba0908b](https://github.com/djm204/frankenbeast/commit/ba0908be6512cc0161d648cc1ed4de81823adeab))
* **cli:** align RunConfigSchema with spec, fix module passthrough and error handling ([9873dfa](https://github.com/djm204/frankenbeast/commit/9873dfa570ef094171dcb21329b4d36efa91d38c))
* honor run config provider and model precedence ([17d3432](https://github.com/djm204/frankenbeast/commit/17d3432f858d2590f2cb0683dbd2b661bd667fab))
* **lint:** suppress false-positive prefer-const on deferred assignments ([df7779d](https://github.com/djm204/frankenbeast/commit/df7779d9d469ea26361da38147ba23e40321351d))

## [0.21.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.21.0...franken-orchestrator-v0.21.1) (2026-03-15)


### Bug Fixes

* **orchestrator:** add missing @franken/critique and @franken/governor dependencies ([31e71f0](https://github.com/djm204/frankenbeast/commit/31e71f01d4aacd062ec42aebcf7bca3762a7de39))

## [0.21.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.20.0...franken-orchestrator-v0.21.0) (2026-03-15)


### Features

* **franken-orchestrator:** add hybrid llm cache primitives ([c929e29](https://github.com/djm204/frankenbeast/commit/c929e29875460703f002b2ec28d738a243d986ec))
* **franken-orchestrator:** add intelligent LLM caching ([c00307c](https://github.com/djm204/frankenbeast/commit/c00307c91c7612f38aa86962f07d04e7feec6b61))
* **franken-orchestrator:** cache repeated planning and issue prompts ([89b3591](https://github.com/djm204/frankenbeast/commit/89b3591b3b92213f14129f60d4cce3b40b15b941))
* **orchestrator:** intelligent LLM caching with work-scoped isolation ([b2d4e87](https://github.com/djm204/frankenbeast/commit/b2d4e870fb43f2dc91a887e058ccc06d961c0d4e))
* **orchestrator:** wire critique module in dep-factory with fallback ([add4b1f](https://github.com/djm204/frankenbeast/commit/add4b1ffda6a1611662e5a0eab28e52f3741d855))
* **orchestrator:** wire governor module in dep-factory with HITL channel and fallback ([931da7f](https://github.com/djm204/frankenbeast/commit/931da7f8e53729e99a6f1aa6e5221c471559444b))
* wire critique and governor modules in dep-factory (Tiers 3-4) ([8d55339](https://github.com/djm204/frankenbeast/commit/8d553399167860bad06a03c85e5b6045a0fb8b1e))


### Bug Fixes

* **orchestrator:** guard readline creation behind TTY check in governor wiring ([7785c72](https://github.com/djm204/frankenbeast/commit/7785c72d21afa5d331ba02ab5ace298c40b580ed))
* **orchestrator:** mock session/GC classes in dep-factory tests to prevent CI timeouts ([582dd03](https://github.com/djm204/frankenbeast/commit/582dd032bc37aae92d58559e5919b8b587f9d50a))

## [0.20.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.19.3...franken-orchestrator-v0.20.0) (2026-03-13)


### Features

* add enabledModules to CliDepOptions with env var fallback ([f4234c3](https://github.com/djm204/frankenbeast/commit/f4234c341cae10c61e3b49b614a8f43cd8505b82))
* add EpisodicMemoryPortAdapter bridging EpisodicMemoryStore to IMemoryModule ([a3ce9d8](https://github.com/djm204/frankenbeast/commit/a3ce9d84a122a24ba98fbd41a7dc7f7f70e94763))
* add ModuleConfig type and TrackedAgent.moduleConfig field ([69b1552](https://github.com/djm204/frankenbeast/commit/69b1552f804bf07dc30ecc1fbc1abec82aba4738))
* add SkillRegistryBridge to adapt ISkillRegistry to SkillRegistryPort ([5b3bba0](https://github.com/djm204/frankenbeast/commit/5b3bba0786f6a50c5a8a636373ae83cdf6bcce6e))
* inject FRANKENBEAST_MODULE_* env vars from run config into beast processes ([6e7aa16](https://github.com/djm204/frankenbeast/commit/6e7aa16a069f4801750b6ee14de57143646cb532))
* wire per-agent module toggle persistence and dispatch plumbing ([6ead11e](https://github.com/djm204/frankenbeast/commit/6ead11ef18447806863eaa8cb0cc3136638f0204))
* wire real EpisodicMemoryPortAdapter into createCliDeps with module toggle gate ([7979020](https://github.com/djm204/frankenbeast/commit/7979020f60a74c22efd630555d6a4f55f106f3c2))
* wire real Firewall, Skills, Memory modules into BeastLoop (Tiers 1-2) ([b835f52](https://github.com/djm204/frankenbeast/commit/b835f529b6167984d54586d8194485664418eef6))
* wire real FirewallPortAdapter into createCliDeps with module toggle gate ([62ff60e](https://github.com/djm204/frankenbeast/commit/62ff60eabba5b27ca08b4df6a9ac54e0e925c0b3))
* wire real SkillsPortAdapter into createCliDeps with module toggle gate ([9591a55](https://github.com/djm204/frankenbeast/commit/9591a552507e3519f8cda7825cc2fad5c4404229))

## [0.19.3](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.19.2...franken-orchestrator-v0.19.3) (2026-03-13)


### Bug Fixes

* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([1e88e62](https://github.com/djm204/frankenbeast/commit/1e88e6222bc1149311fb8ade17ac8eafa3525bc0))
* **orchestrator:** use robust cleanLlmJson for issue triage and planning ([33dbf5a](https://github.com/djm204/frankenbeast/commit/33dbf5a483debc2460116f2b1cbbf0cd029a8061))

## [0.19.2](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.19.1...franken-orchestrator-v0.19.2) (2026-03-13)


### Bug Fixes

* **orchestrator:** standardize subprocess failures ([#213](https://github.com/djm204/frankenbeast/issues/213)) ([130bce2](https://github.com/djm204/frankenbeast/commit/130bce266b71dcc84ba3e3b463d8ff5b4b46a475))

## [0.19.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.19.0...franken-orchestrator-v0.19.1) (2026-03-13)


### Bug Fixes

* **orchestrator:** isolate issue stage sessions ([#212](https://github.com/djm204/frankenbeast/issues/212)) ([44a2c61](https://github.com/djm204/frankenbeast/commit/44a2c617327540bfd04253062e6017487656a3e2))
* **orchestrator:** remove shell-backed git execution ([4f8f14d](https://github.com/djm204/frankenbeast/commit/4f8f14d881c150065ed7ccd0a665ea2f72a55cda))

## [0.19.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.18.2...franken-orchestrator-v0.19.0) (2026-03-12)


### Features

* **orchestrator:** unify issue pipeline with BeastLoop and optimize context window ([ffa6299](https://github.com/djm204/frankenbeast/commit/ffa6299f446663cc724da6311467824d75bed0c5))


### Bug Fixes

* **orchestrator:** standardize issue execution via chunk files ([63942f6](https://github.com/djm204/frankenbeast/commit/63942f6b2a6aff3088a1f5c55c652719717fe7f1))
* **orchestrator:** standardize issue execution via chunk files ([1e6d2eb](https://github.com/djm204/frankenbeast/commit/1e6d2ebbd6e8ad662ca6d70158078bf65070c28a))

## [0.18.2](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.18.1...franken-orchestrator-v0.18.2) (2026-03-12)


### Bug Fixes

* **orchestrator:** address issue runtime review feedback ([a1dc2fd](https://github.com/djm204/frankenbeast/commit/a1dc2fd05e08e969aa3edf2e3c7602501853b532))
* **orchestrator:** make one-shot issues issue-aware and resumable ([09488cb](https://github.com/djm204/frankenbeast/commit/09488cb6f49ee2179ce9d2d0cfaff2f19cd1ef4f))
* **orchestrator:** make one-shot issues issue-aware and resumable ([66a5f4a](https://github.com/djm204/frankenbeast/commit/66a5f4a08680225f41d805bd217bbd5b81bc483d))

## [0.18.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.18.0...franken-orchestrator-v0.18.1) (2026-03-12)


### Bug Fixes

* add provider fallback to cli llm adapter ([643ed9f](https://github.com/djm204/frankenbeast/commit/643ed9f3876d760f9621d648dbf6cd2e5fb021ca))
* correct gemini headless prompt args ([a076b7c](https://github.com/djm204/frankenbeast/commit/a076b7cab410b84a6ee141dbb40704b54d27d45b))
* honor provider selection in issues execution ([23073a3](https://github.com/djm204/frankenbeast/commit/23073a31bf0f922913f81006e2dbdf65c3117f41))
* **orchestrator:** honor provider selection and fallback semantics ([abf1b77](https://github.com/djm204/frankenbeast/commit/abf1b776226e67257ec39e2d34cd359bc3e7eb95))
* preserve provider semantics during cli fallback ([5f34635](https://github.com/djm204/frankenbeast/commit/5f34635505c4dcc4f449e4f33b64c2d171189d5a))

## [0.18.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.17.0...franken-orchestrator-v0.18.0) (2026-03-12)


### Features

* add tracked agent dashboard controls ([0f9b4db](https://github.com/djm204/frankenbeast/commit/0f9b4db305950ccdd1580fee28d8ba1ee751d9ee))
* add tracked agent dashboard controls ([fb13aa7](https://github.com/djm204/frankenbeast/commit/fb13aa740788a9ec7b81066d732318ce5314efb7))


### Bug Fixes

* broaden start endpoint status guard and clear selection on agent delete ([45026bf](https://github.com/djm204/frankenbeast/commit/45026bf0f7b7fc5edede087e00176f6ed09d3493))

## [0.17.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.16.0...franken-orchestrator-v0.17.0) (2026-03-12)


### Features

* add frankenbeast chat persona ([05e75f0](https://github.com/djm204/frankenbeast/commit/05e75f047fecee13145ed26b41cbe7b3db6051dd))
* add frankenbeast chat persona ([a56c434](https://github.com/djm204/frankenbeast/commit/a56c434d7d6660ce491eb175f62060e88febfe3c))


### Bug Fixes

* start tracked beast agents from dashboard ([c71865f](https://github.com/djm204/frankenbeast/commit/c71865fe25c0c1341f7228cd718d25156056d479))
* start tracked beast agents from dashboard ([be65772](https://github.com/djm204/frankenbeast/commit/be65772b5fff6be06246a6817ef6a2d4e1afd3f0))

## [0.16.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.15.0...franken-orchestrator-v0.16.0) (2026-03-12)


### Features

* add beast dashboard resume and path controls ([500999f](https://github.com/djm204/frankenbeast/commit/500999f8404ef680616341136cbe5c4eeef4fe10))
* add beast dashboard resume controls and path validation ([195bc31](https://github.com/djm204/frankenbeast/commit/195bc310cdbf9754e0af1c84ffd80febf4dba227))
* secret store with 4 pluggable backends ([f05846f](https://github.com/djm204/frankenbeast/commit/f05846f70dbc6b6815ae4568c829d9eedc0a1670))


### Bug Fixes

* **secret-store:** address PR review — 5 fixes for robustness and correctness ([89076b0](https://github.com/djm204/frankenbeast/commit/89076b06e9427b0adb38579f748009378ca1ae0a))
* **secret-store:** fix exactOptionalPropertyTypes TS errors across all new interfaces ([bf8f267](https://github.com/djm204/frankenbeast/commit/bf8f267dec4f0658596a6cad03b67719031b6798))

## [0.15.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.14.1...franken-orchestrator-v0.15.0) (2026-03-11)


### Features

* add tracked agent foundations ([4073878](https://github.com/djm204/frankenbeast/commit/407387806cb8972b2115e6aef489df02bf3c07fe))
* implement tracked agent init workflow ([366cc75](https://github.com/djm204/frankenbeast/commit/366cc756338774124ee5a4928a9ff451efec3bbd))
* wire tracked agents through dispatch and chat ([7179567](https://github.com/djm204/frankenbeast/commit/71795676226f9675c74902b83edd9c15b1d4a966))


### Bug Fixes

* fix the connection between dashboard and backend, and make some UI changes ([d137437](https://github.com/djm204/frankenbeast/commit/d1374374b3e0e6195b58a7fd8f19a74dc7f6a40f))
* harden beast route failure handling ([ac53201](https://github.com/djm204/frankenbeast/commit/ac53201a045e777faa6de9f6daa2455349d1050e))
* harden tracked agent beast routes and dispatch validation ([39b6850](https://github.com/djm204/frankenbeast/commit/39b685052c810d09b7b7af237ed15a1d3d7805c8))
* make tracked agent dispatch transactional ([4f622d2](https://github.com/djm204/frankenbeast/commit/4f622d2ac72f665267d7a7a2280baa51b970ac55))
* migrate legacy beast run schema ([f97d7f5](https://github.com/djm204/frankenbeast/commit/f97d7f548551afa95246563c7fc914e306f74247))

## [0.14.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.14.0...franken-orchestrator-v0.14.1) (2026-03-11)


### Bug Fixes

* **beasts:** wire dashboard control routes into chat server ([578f5cc](https://github.com/djm204/frankenbeast/commit/578f5cc4d5b93b0c3ecabec12f8dc222af9ccd16))
* wire beast control into chat server ([aa7d26e](https://github.com/djm204/frankenbeast/commit/aa7d26ed240621af2273d554ef8268c4d5ecbdb8))

## [0.14.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.13.0...franken-orchestrator-v0.14.0) (2026-03-11)


### Features

* **orchestrator:** support upstream repo targeting for issues ([414b7e1](https://github.com/djm204/frankenbeast/commit/414b7e1c33e5762c5966b55d05932ef02ba2fe3a))
* **orchestrator:** support upstream repo targeting for issues ([20d0585](https://github.com/djm204/frankenbeast/commit/20d058503589bdf940b4cbc497b5e22ec3310fe8))
* **orchestrator:** support upstream repo targeting for issues ([aa1819e](https://github.com/djm204/frankenbeast/commit/aa1819e99105376a13b4b8e9f927aca5ba1aba5d))

## [0.13.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.12.0...franken-orchestrator-v0.13.0) (2026-03-10)


### Features

* add init cli surface ([015c599](https://github.com/djm204/frankenbeast/commit/015c599d96f512c0f2cec6a4baf146843cef65bd))
* add init config wizard ([9129b73](https://github.com/djm204/frankenbeast/commit/9129b736bf0d0fd79a9089dab9eebe6178b1ff4d))
* add init state and registries ([a00d3e3](https://github.com/djm204/frankenbeast/commit/a00d3e39f275adaf23733fcbfa86a94755833860))
* add init verify and repair flows ([4f44bb2](https://github.com/djm204/frankenbeast/commit/4f44bb214169b8576e270c864181191d55cb961e))
* add init wizard engine ([a1f9d95](https://github.com/djm204/frankenbeast/commit/a1f9d951418efcb43876a9176bfc2894fa3c206a))


### Bug Fixes

* **observer:** fix cost tracking and document implementation gaps ([7054989](https://github.com/djm204/frankenbeast/commit/7054989522894d5bd2429d71ef73d041e9599725))
* **observer:** fix zero-cost tracking and document implementation gaps ([c75c322](https://github.com/djm204/frankenbeast/commit/c75c322b46dc804873cff78c1ae8756104092cb7))

## [0.12.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.11.1...franken-orchestrator-v0.12.0) (2026-03-10)


### Features

* add beasts dispatch station ([5d87015](https://github.com/djm204/frankenbeast/commit/5d87015b72c714481f846547bdfb847068478e00))
* **dashboard:** add beasts dispatch station ([2e5537a](https://github.com/djm204/frankenbeast/commit/2e5537a3cdecc078e55d2ecdfb84c62735bdf265))
* **orchestrator:** add beast cli dispatch commands ([1d9a44e](https://github.com/djm204/frankenbeast/commit/1d9a44ecbfa8ea7395a2c31c671b7f8b4f077378))
* **orchestrator:** add beast dispatch services and metrics ([dd1fcb2](https://github.com/djm204/frankenbeast/commit/dd1fcb2889ea4f057ddddac67cdb164ffed73fc1))
* **orchestrator:** add beast domain types and storage paths ([3776f12](https://github.com/djm204/frankenbeast/commit/3776f12b271942bc021104a2757f05595717ab03))
* **orchestrator:** add beast process executor and container stub ([4f35887](https://github.com/djm204/frankenbeast/commit/4f358872a58a3c1eaaf7696ec3e89d1f577c210d))
* **orchestrator:** add fixed beast catalog and interview service ([35942a2](https://github.com/djm204/frankenbeast/commit/35942a2aca31b85ee8724291d16af9745abcadfb))
* **orchestrator:** add secure beast dispatch routes ([36e63ac](https://github.com/djm204/frankenbeast/commit/36e63acb5ab8bda89e7632f7b00dab8e0c65a3f1))
* **orchestrator:** dispatch beasts from chat sessions ([b4336ab](https://github.com/djm204/frankenbeast/commit/b4336ab17b830e4777cf4d302037628c01887585))
* **orchestrator:** persist beast runs attempts and logs ([b8344e8](https://github.com/djm204/frankenbeast/commit/b8344e8767b4b3bbc5fdb9db67cbf34a645abf5b))

## [0.11.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.11.0...franken-orchestrator-v0.11.1) (2026-03-10)


### Bug Fixes

* **network:** harden startup flow and dashboard connectivity ([b881f2b](https://github.com/djm204/frankenbeast/commit/b881f2bd2d7bf5aa68e9e1f76986d18204811021))
* **network:** harden startup flow and dashboard connectivity ([c312e9f](https://github.com/djm204/frankenbeast/commit/c312e9fd4dd6e2db0f3388da765a3bcb6d7e1b92))

## [0.11.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.10.0...franken-orchestrator-v0.11.0) (2026-03-10)


### Features

* **arch:** reconcile mirage by wiring real modules and hardening security ([4852a34](https://github.com/djm204/frankenbeast/commit/4852a348640d37b1717691a3e47a0aeb86999f0b))
* **arch:** reconcile mirage by wiring real modules and hardening security ([86a39f5](https://github.com/djm204/frankenbeast/commit/86a39f5932ec34f0fa16de47b597052ca786c3ce))
* **chat:** attach CLI chat to managed network service ([95fa321](https://github.com/djm204/frankenbeast/commit/95fa32102a0ab259ffc9a8af0a4742b3a8ae923b))
* **network:** add canonical operator config ([aae7341](https://github.com/djm204/frankenbeast/commit/aae734127c218e412cf3a80449bc20193ef406b3))
* **network:** add cli command surface ([c5bb2c4](https://github.com/djm204/frankenbeast/commit/c5bb2c4594edd2c06e759252cbe1df44ed734cf0))
* **network:** add config-driven network operator control plane ([816ef85](https://github.com/djm204/frankenbeast/commit/816ef853cb0a74ef3d700dc365c2ad4fd198dba4))
* **network:** add config-driven service registry ([40e2c1f](https://github.com/djm204/frankenbeast/commit/40e2c1fb71ec13cf311f3a38963dde9100cc5793))
* **network:** add dashboard network control api ([4ab4dad](https://github.com/djm204/frankenbeast/commit/4ab4dadc774248560acad35128f0979fe3340987))
* **network:** add secure and insecure secret modes ([0ac7175](https://github.com/djm204/frankenbeast/commit/0ac7175d05f9bf82e8ef4b35296e08ffb86091a9))
* **network:** add supervisor runtime and state ([5605829](https://github.com/djm204/frankenbeast/commit/56058295b9d94805d3b4edae08c41b26c260a971))
* **network:** implement operator command family ([c142ec9](https://github.com/djm204/frankenbeast/commit/c142ec905cb256b1f6c4c48dbcecfc68b7e9bf5f))
* **network:** support managed service config overrides ([57974f1](https://github.com/djm204/frankenbeast/commit/57974f16a8a6cdc909f74cb1c1be47a6c7ae14ae))


### Bug Fixes

* **comms:** resolve build errors and unify websocket types ([2669d44](https://github.com/djm204/frankenbeast/commit/2669d4487bdfab9ef3ba522ce5a2dfa4b929cc7f))
* **comms:** resolve build errors and unify websocket types ([bfd0fb8](https://github.com/djm204/frankenbeast/commit/bfd0fb8cbb4656a719d9024a96bb5ca60734c40d))

## [0.10.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.9.0...franken-orchestrator-v0.10.0) (2026-03-10)


### Features

* **chat:** add runnable dashboard chat server entrypoint ([d37004b](https://github.com/djm204/frankenbeast/commit/d37004b8be19257636f8e6b1f6c297f829861d33))
* **chat:** add runnable http and websocket chat server ([6fd66f6](https://github.com/djm204/frankenbeast/commit/6fd66f61e2d47f0012b229f07861b73e402e60f3))
* **cli:** add chat-server command surface ([6b456b4](https://github.com/djm204/frankenbeast/commit/6b456b46523c7bb7add0d96e1b1f13a8d10af354))
* **cli:** run websocket chat server from frankenbeast ([7ea6b3c](https://github.com/djm204/frankenbeast/commit/7ea6b3ce1b793cf8f4fee46d99d765c6ff9a38b0))

## [0.9.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.8.0...franken-orchestrator-v0.9.0) (2026-03-09)


### Features

* add websocket-backed Frankenbeast dashboard chat ([f0e089d](https://github.com/djm204/frankenbeast/commit/f0e089dea6f35685f016b0a373c6e3440ccc1e45))

## [0.8.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.7.0...franken-orchestrator-v0.8.0) (2026-03-09)


### Features

* Add canonical chunk-session execution state ([5d36b0c](https://github.com/djm204/frankenbeast/commit/5d36b0c6ba6edb385812d7d5c0bb98ea77216fff))
* **orchestrator:** garbage collect and clean chunk sessions ([78d7347](https://github.com/djm204/frankenbeast/commit/78d73473391c6eec5b114d9d9f562b46a230b8a2))
* **orchestrator:** make MartinLoop chunk-session aware ([936ca0b](https://github.com/djm204/frankenbeast/commit/936ca0b7f5907acfbe9badbb20665f3f8b06cb81))
* **orchestrator:** wire chunk session execution and recovery ([32c5cfb](https://github.com/djm204/frankenbeast/commit/32c5cfb7d47bdf2ad89efc35c17ceaf03f767d3e))

## [0.7.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.6.0...franken-orchestrator-v0.7.0) (2026-03-09)


### Features

* **chat:** add ChatAgentExecutor implementing ITaskExecutor ([b9dbaf0](https://github.com/djm204/frankenbeast/commit/b9dbaf045931c0097850149af98789f8ce703c1f))
* **chat:** add spinner to chat REPL during LLM replies ([01740d2](https://github.com/djm204/frankenbeast/commit/01740d2c40305b90b0d394796d014c892c7f7a24))
* **chat:** add withSpinner async helper for shared spinner UX ([1187ef8](https://github.com/djm204/frankenbeast/commit/1187ef88d5de5a6508724b075e9b791e19cec5ea))
* **chat:** replace stub executor with ChatAgentExecutor in chat subcommand ([64f92b0](https://github.com/djm204/frankenbeast/commit/64f92b0b445212a639bf3b6d4524623607a2ce77))
* **chat:** session continuation, input blocking, spinner, output sanitization, color diff ([e4eb862](https://github.com/djm204/frankenbeast/commit/e4eb86252fc641a17eded66040059c57f4e82702))
* **chat:** wire /run and /plan slash commands to TurnRunner dispatch ([97062ce](https://github.com/djm204/frankenbeast/commit/97062ceb5c41fe4dc1a0144d34900f2f86ac60d7))
* **franken-orchestrator:** add conversational chat interface with CLI, HTTP, SSE, and web UI ([13c01f4](https://github.com/djm204/frankenbeast/commit/13c01f410ab81f5fc8223543d567e454701365fb))


### Bug Fixes

* **chat:** foundational chat REPL fixes from prior session ([c3e8300](https://github.com/djm204/frankenbeast/commit/c3e8300ebd831bbae059007217e4dddbace5631f))

## [0.6.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.5.0...franken-orchestrator-v0.6.0) (2026-03-09)


### Features

* **planner:** add ChunkDecomposer with codebase-aware decomposition prompt ([24c521e](https://github.com/djm204/frankenbeast/commit/24c521e0afaf206b68269b60886a944e7cfff5f3))
* **planner:** add ChunkFileWriter for 10-field .md chunk output ([d7dc66b](https://github.com/djm204/frankenbeast/commit/d7dc66b17a76153e8c6a61066d53417fabfd011c))
* **planner:** add ChunkRemediator for auto-patching validation issues ([8a0d7e5](https://github.com/djm204/frankenbeast/commit/8a0d7e53f84c345e09cb2ec29f2bf4b98d429d23))
* **planner:** add ChunkValidator for multi-pass validation ([433d7a8](https://github.com/djm204/frankenbeast/commit/433d7a8f2f1e9507a807e534f79dee81563309fc))
* **planner:** add PlanContextGatherer for codebase-aware planning ([9d25187](https://github.com/djm204/frankenbeast/commit/9d25187386ca1bac1caa7d66fab8779d974109e6))
* **planner:** expand ChunkDefinition to 11 fields, consolidate type ([f8ac7be](https://github.com/djm204/frankenbeast/commit/f8ac7be3bc4dac2cc08bfbd4e953e9d9f2dcb96c))
* **planner:** multi-pass codebase-aware planning pipeline ([0877494](https://github.com/djm204/frankenbeast/commit/0877494c72b1dd2c78e217b1dc78af478a927a24))
* **planner:** refactor LlmGraphBuilder to multi-pass pipeline with 10-field prompts ([3fd09af](https://github.com/djm204/frankenbeast/commit/3fd09af56fba1ce17566f18447027ffd3275c636))
* **planner:** wire multi-pass pipeline and ChunkFileWriter into session.ts ([3dfd30c](https://github.com/djm204/frankenbeast/commit/3dfd30cdff42c359b71945a51b25e5d52ad946ce))

## [0.5.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.4.1...franken-orchestrator-v0.5.0) (2026-03-09)


### Features

* **franken-orchestrator:** add spinner to LLM progress, extract cleanLlmJson utility, use lastChunks for plan output ([dccc569](https://github.com/djm204/frankenbeast/commit/dccc56923cda689fc06bdbbd3285400e0342f574))

## [0.4.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.4.0...franken-orchestrator-v0.4.1) (2026-03-09)


### Bug Fixes

* **franken-orchestrator:** prevent plugin poisoning in spawned CLI for planning ([3c9ea2f](https://github.com/djm204/frankenbeast/commit/3c9ea2f22f32ef329127ded67147f7efb25827fc))

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.3.1...franken-orchestrator-v0.4.0) (2026-03-09)


### Features

* **franken-orchestrator:** stream LLM progress during planning phase ([9beeb0b](https://github.com/djm204/frankenbeast/commit/9beeb0b5618b02a0eea3323c365ef25e5f8577e5))


### Bug Fixes

* **franken-orchestrator:** strip hookSpecificOutput from LLM responses at all parse sites ([483ce6b](https://github.com/djm204/frankenbeast/commit/483ce6b944b8db6dd35db2c16b0275091bb10fda))
* hook output stripping + stream LLM progress during planning ([5bcc669](https://github.com/djm204/frankenbeast/commit/5bcc6693194edef1775688fc0082a2d1102a1b4c))

## [0.3.1](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.3.0...franken-orchestrator-v0.3.1) (2026-03-09)


### Bug Fixes

* release-please scoping and commit hygiene ([742c7cc](https://github.com/djm204/frankenbeast/commit/742c7cc7792aac3f6f85ee638ba3b165de34bc5f))

## [0.3.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.2.0...franken-orchestrator-v0.3.0) (2026-03-09)


### Features

* eslint configs, gitignore hygiene, CLI guard fix ([#99](https://github.com/djm204/frankenbeast/issues/99)) ([87d7427](https://github.com/djm204/frankenbeast/commit/87d74276a909b272141119ce151647118725ce2e))

## [0.2.0](https://github.com/djm204/frankenbeast/compare/franken-orchestrator-v0.1.0...franken-orchestrator-v0.2.0) (2026-03-09)


### Features

* migrate to real monorepo with npm workspaces + Turborepo ([#96](https://github.com/djm204/frankenbeast/issues/96)) ([f2028b1](https://github.com/djm204/frankenbeast/commit/f2028b139003a6bc09df35d8904a53c0457d67cb))
* **orchestrator:** add chunk prompt guardrails to prevent destructive agent actions ([9cdb5b0](https://github.com/djm204/frankenbeast/commit/9cdb5b0f93a8f0db756bd2386c6850ef363efa12))
* **orchestrator:** plan-scoped dirs, hook stripping, LLM response caching ([#98](https://github.com/djm204/frankenbeast/issues/98)) ([d97f37c](https://github.com/djm204/frankenbeast/commit/d97f37c05e02c01acb2fda75f2a121f507db62e5))
