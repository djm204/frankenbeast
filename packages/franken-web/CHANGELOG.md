# Changelog

## [0.3.0](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.11...franken-web-v0.3.0) (2026-07-15)


### Features

* **availability:** add provider outage incident banner ([#2270](https://github.com/djm204/frankenbeast/issues/2270)) ([3d37834](https://github.com/djm204/frankenbeast/commit/3d3783417ea57f9bea4d99c9b49cd62f42a9c160))

## [0.2.11](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.10...franken-web-v0.2.11) (2026-07-15)


### Refactoring

* **web:** decompose chat shell and session helpers ([d4808a9](https://github.com/djm204/frankenbeast/commit/d4808a9c77217371fa5c803c9a755f2182f915c2)), closes [#2228](https://github.com/djm204/frankenbeast/issues/2228)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.11.0 to 0.12.0

## [0.2.10](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.9...franken-web-v0.2.10) (2026-07-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.10.1 to 0.11.0

## [0.2.9](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.8...franken-web-v0.2.9) (2026-07-14)


### Bug Fixes

* **deps:** repair npm security and maintenance update ([4fd8ecc](https://github.com/djm204/frankenbeast/commit/4fd8eccf9b57960572d624aaa18ceac773fddcc0))


### Miscellaneous

* **web:** deduplicate API error helpers ([33a2a73](https://github.com/djm204/frankenbeast/commit/33a2a73637df5dd520e744d1151a0776a74c2ba1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.10.0 to 0.10.1

## [0.2.8](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.7...franken-web-v0.2.8) (2026-07-14)


### Bug Fixes

* **web:** preserve wizard launch selections ([#1478](https://github.com/djm204/frankenbeast/issues/1478)) ([002d39b](https://github.com/djm204/frankenbeast/commit/002d39ba6f27ae8a62ee72431aea5ab145be056c))

## [0.2.7](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.6...franken-web-v0.2.7) (2026-07-14)


### Bug Fixes

* address Codex HTTP error diagnostics feedback ([2d05a16](https://github.com/djm204/frankenbeast/commit/2d05a16de1f39211774875997d4c09c9eaee6c06))
* bound and redact error bodies ([de5b902](https://github.com/djm204/frankenbeast/commit/de5b902bb01c41caa2b7678bfbf2db99e2ddb00c))
* bound provider error body diagnostics ([189e3b0](https://github.com/djm204/frankenbeast/commit/189e3b08b218bd4a6ad76db92c7f297fb0383fe6))
* close remaining HTTP error body review gaps ([685727c](https://github.com/djm204/frankenbeast/commit/685727cba7b472380d1f6510d0ddce66581d430e))
* enrich HTTP error context ([681a32d](https://github.com/djm204/frankenbeast/commit/681a32d638c3b818389746cf220b331d57821e37))
* enrich HTTP error context ([79b5b40](https://github.com/djm204/frankenbeast/commit/79b5b4064d85b7d2037b30a6b90431cf893def94))
* **governor:** resolve root test suite merge drift ([29270d5](https://github.com/djm204/frankenbeast/commit/29270d533f252535ff122b422d60095a949e6aab))
* harden HTTP error body handling ([ba89762](https://github.com/djm204/frankenbeast/commit/ba8976259b36f86639c99382bf9da27ce9d12d8b))
* harden HTTP error redaction ([e244b16](https://github.com/djm204/frankenbeast/commit/e244b16c21faaa562ea52cd2c7c0ef019e9fca6b))
* **http:** scrub urls and cloned diagnostic streams ([62fb98c](https://github.com/djm204/frankenbeast/commit/62fb98c3d95a5514de2d96c97af14d96504ca0d8))
* **orchestrator:** close beast attempt cleanup issue ([#2003](https://github.com/djm204/frankenbeast/issues/2003)) ([ae34c42](https://github.com/djm204/frankenbeast/commit/ae34c42ecba98db09aa5b43c097d8ecf0819170e))
* redact auth data in HTTP errors ([69f5f05](https://github.com/djm204/frankenbeast/commit/69f5f0540bccb21ccf11b943ec43e598fa12095a))
* **web:** clarify dashboard SSE snapshot parse errors ([#2213](https://github.com/djm204/frankenbeast/issues/2213)) ([6758717](https://github.com/djm204/frankenbeast/commit/67587170fa1478e7f15d1c6b23192a0d6566719c)), closes [#2205](https://github.com/djm204/frankenbeast/issues/2205)
* **web:** clear Beast SSE reconnect errors ([#2195](https://github.com/djm204/frankenbeast/issues/2195)) ([1278ebc](https://github.com/djm204/frankenbeast/commit/1278ebc5b7a26dfe799171fc4e012a9f4746af04))
* **web:** fall back when websocket send throws ([#2147](https://github.com/djm204/frankenbeast/issues/2147)) ([3114fc2](https://github.com/djm204/frankenbeast/commit/3114fc2d81536414a52dbaba03187fb657156190))
* **web:** fall back when websocket send throws ([#2151](https://github.com/djm204/frankenbeast/issues/2151)) ([69a7b7b](https://github.com/djm204/frankenbeast/commit/69a7b7b1a45214040cb5169b14011a306b212f01))
* **web:** load Beast LLM targets from providers ([#2117](https://github.com/djm204/frankenbeast/issues/2117)) ([6bf0927](https://github.com/djm204/frankenbeast/commit/6bf09276330c4654a7acc446daae9dfe242ef818))
* **web:** preserve json-only network error envelopes ([683f5ff](https://github.com/djm204/frankenbeast/commit/683f5ff6f56759aa7c5f9cb8c73272ef60a49a30))
* **web:** reconnect Beast SSE after malformed payloads ([b13a575](https://github.com/djm204/frankenbeast/commit/b13a57579b5e190182da62dcddd7388f0597849e)), closes [#2082](https://github.com/djm204/frankenbeast/issues/2082)
* **web:** reject fake directory picker paths ([#2097](https://github.com/djm204/frankenbeast/issues/2097)) ([ac5b707](https://github.com/djm204/frankenbeast/commit/ac5b707a99226ae942f0c8d07b8f3613d565dfad))
* **web:** reject path traversal during normalization ([482cf54](https://github.com/djm204/frankenbeast/commit/482cf543cd579c23c0da157b910c5012365de069)), closes [#1792](https://github.com/djm204/frankenbeast/issues/1792)
* **web:** restrict untrusted markdown attachments ([#2017](https://github.com/djm204/frankenbeast/issues/2017)) ([a0aa90e](https://github.com/djm204/frankenbeast/commit/a0aa90e937376375e5fee8cb121fe73c43111dcb))
* **web:** surface analytics API error messages ([fb33e79](https://github.com/djm204/frankenbeast/commit/fb33e7900b912c7fa617653f86ee9d76d7c2e5fd))
* **web:** surface Beast API structured errors ([#2116](https://github.com/djm204/frankenbeast/issues/2116)) ([c4f4f5e](https://github.com/djm204/frankenbeast/commit/c4f4f5eb164755d24c01b9096e129ef7b6a00e4d))
* **web:** surface dashboard response errors ([2f7466f](https://github.com/djm204/frankenbeast/commit/2f7466f4f690b693d20037e307cb8ccdf33290d6))
* **web:** surface dashboard stream reconnect failures ([54edd90](https://github.com/djm204/frankenbeast/commit/54edd90b3f47e3038d15ef0f87c16db8d8ba0c5b)), closes [#2034](https://github.com/djm204/frankenbeast/issues/2034)


### Documentation

* **dx:** refresh franken-web ramp-up map ([#2115](https://github.com/djm204/frankenbeast/issues/2115)) ([91de9f6](https://github.com/djm204/frankenbeast/commit/91de9f66b2531e1f36cc13500b53abde6aea6f28))
* **web:** clarify dashboard backend proxy env vars ([#2028](https://github.com/djm204/frankenbeast/issues/2028)) ([171c79d](https://github.com/djm204/frankenbeast/commit/171c79d6943bb8a1d32514a1165b0d5fac2eacf4))
* **web:** refresh ramp-up source map ([232405c](https://github.com/djm204/frankenbeast/commit/232405c38dad086a3d1e54e5c286cfa72b0eb56c)), closes [#2109](https://github.com/djm204/frankenbeast/issues/2109)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.9.0 to 0.10.0

## [0.2.6](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.5...franken-web-v0.2.6) (2026-07-11)


### Bug Fixes

* **web:** add network service log actions ([#1869](https://github.com/djm204/frankenbeast/issues/1869)) ([22d1682](https://github.com/djm204/frankenbeast/commit/22d168275451beb627af013c1018dd56130ef9c4)), closes [#1017](https://github.com/djm204/frankenbeast/issues/1017)
* **web:** block invalid create-agent wizard launches ([1ebaa6c](https://github.com/djm204/frankenbeast/commit/1ebaa6c8155ab9f4ecb0d744a76035f9362efae9)), closes [#1012](https://github.com/djm204/frankenbeast/issues/1012)
* **web:** clear typing indicator on chat turn errors ([#1877](https://github.com/djm204/frankenbeast/issues/1877)) ([7bc4dbf](https://github.com/djm204/frankenbeast/commit/7bc4dbf3c0dff7d6c274f88e05660815655b6000))
* **web:** guard analytics detail drawer updates ([#1868](https://github.com/djm204/frankenbeast/issues/1868)) ([2eb368c](https://github.com/djm204/frankenbeast/commit/2eb368c8a615ac3857dd4a773bbe82b1c52e1022))
* **web:** persist tracked-agent detail edits ([e29811c](https://github.com/djm204/frankenbeast/commit/e29811c63de33b7d9e8084d309ec24015dbd38e0)), closes [#1010](https://github.com/djm204/frankenbeast/issues/1010)
* **web:** preserve transcript code wrapping ([#1884](https://github.com/djm204/frankenbeast/issues/1884)) ([8272465](https://github.com/djm204/frankenbeast/commit/827246506661e2d6935bf812ce19ff8d22b3aa1a)), closes [#1005](https://github.com/djm204/frankenbeast/issues/1005)
* **web:** refresh network config editor state ([a7a1072](https://github.com/djm204/frankenbeast/commit/a7a1072b237c7ef05b00162b86a08610b0f523f2)), closes [#1018](https://github.com/djm204/frankenbeast/issues/1018)


### Documentation

* **web:** clarify Beast API proxy target usage ([b4fff6b](https://github.com/djm204/frankenbeast/commit/b4fff6b5abcb80dcc08de3f4b7efd18acad7b38b)), closes [#1001](https://github.com/djm204/frankenbeast/issues/1001)


### Tests

* **web:** cover prompt file attachment flow ([71d6787](https://github.com/djm204/frankenbeast/commit/71d67873b61054065b7c69190c55d0178b95a483)), closes [#1011](https://github.com/djm204/frankenbeast/issues/1011)

## [0.2.5](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.4...franken-web-v0.2.5) (2026-07-11)


### Bug Fixes

* **beasts:** surface Create Agent auto-dispatch failures ([f41de4f](https://github.com/djm204/frankenbeast/commit/f41de4f592d201066fa1503a0508248bd4b96849)), closes [#1212](https://github.com/djm204/frankenbeast/issues/1212)
* **orchestrator:** report corrupt chat session files ([#1643](https://github.com/djm204/frankenbeast/issues/1643)) ([d62c992](https://github.com/djm204/frankenbeast/commit/d62c9929a556741889dffa443f0aee9e5c5b20f6))
* replace nondeterministic calls with deterministic utilities ([#1441](https://github.com/djm204/frankenbeast/issues/1441)) ([1585acf](https://github.com/djm204/frankenbeast/commit/1585acf39bb993b06d2b975045641ad662a44459))
* **web:** avoid mutating provider order during render ([529b6c8](https://github.com/djm204/frankenbeast/commit/529b6c885b7f255b85123ab19b6e86509804ffe8))
* **web:** clear stale analytics refresh data ([#1511](https://github.com/djm204/frankenbeast/issues/1511)) ([e3ffb09](https://github.com/djm204/frankenbeast/commit/e3ffb0973c3a2d89244f5a5a7c9a2aa83954e4b0)), closes [#1089](https://github.com/djm204/frankenbeast/issues/1089)
* **web:** confirm destructive beast actions ([#1483](https://github.com/djm204/frankenbeast/issues/1483)) ([d127b6f](https://github.com/djm204/frankenbeast/commit/d127b6fcc15561a244275f88962a3c98128ee31d))
* **web:** confirm tracked-agent deletes ([#1488](https://github.com/djm204/frankenbeast/issues/1488)) ([8f5f073](https://github.com/djm204/frankenbeast/commit/8f5f073b1540711892af7474d8718e82dd1fb889))
* **web:** disable unavailable Beast create actions ([ef48bd4](https://github.com/djm204/frankenbeast/commit/ef48bd43d3fa25b25595629274c2426e7222df6d)), closes [#1097](https://github.com/djm204/frankenbeast/issues/1097)
* **web:** expose tracked agent status filters ([#1506](https://github.com/djm204/frankenbeast/issues/1506)) ([6bf1e20](https://github.com/djm204/frankenbeast/commit/6bf1e2091ada17b0cbc24748c9b77f3aada42b9b)), closes [#1102](https://github.com/djm204/frankenbeast/issues/1102)
* **web:** gate network service controls by status ([7d61bb3](https://github.com/djm204/frankenbeast/commit/7d61bb3cb07ae91c57a9395660914029ea9b9ba4))
* **web:** guard dashboard SSE snapshot parsing ([e31035d](https://github.com/djm204/frankenbeast/commit/e31035d4fcfe91e88dce20faeab9f3357474b1d7))
* **web:** guard tracked-agent lifecycle actions ([1fe2fea](https://github.com/djm204/frankenbeast/commit/1fe2feae7ee828e5eddd7fcadf3497b5179f59ce)), closes [#1090](https://github.com/djm204/frankenbeast/issues/1090)
* **web:** hash root package version in turbo cache ([7f34ad7](https://github.com/djm204/frankenbeast/commit/7f34ad7a83b4d691662beac6294ca5b9a3cffb11)), closes [#1534](https://github.com/djm204/frankenbeast/issues/1534)
* **web:** hide deep module config keys in review ([#1550](https://github.com/djm204/frankenbeast/issues/1550)) ([c6fa36f](https://github.com/djm204/frankenbeast/commit/c6fa36fd389b402ddef3bd087384484725860923))
* **web:** interleave events and logs chronologically ([3e26b96](https://github.com/djm204/frankenbeast/commit/3e26b96c887cf79a9e2bc5763c18435373a4d151)), closes [#1182](https://github.com/djm204/frankenbeast/issues/1182)
* **web:** keep ActivityPane from crashing on unserializable runtime event data ([a8132fa](https://github.com/djm204/frankenbeast/commit/a8132fa7b34a53e9609df2358be7c72ebdd498a4)), closes [#1111](https://github.com/djm204/frankenbeast/issues/1111)
* **web:** keep analytics session options stable ([#1485](https://github.com/djm204/frankenbeast/issues/1485)) ([174e97c](https://github.com/djm204/frankenbeast/commit/174e97c107e2c8609d3c715d6c222a27a5af9a00))
* **web:** load beast wizard model selectors from config ([c4247c4](https://github.com/djm204/frankenbeast/commit/c4247c46169aa2dc1c82f460e3a9d75aec58749e)), closes [#1174](https://github.com/djm204/frankenbeast/issues/1174)
* **web:** preserve chat draft on fallback refresh failure ([#1552](https://github.com/djm204/frankenbeast/issues/1552)) ([d8f4439](https://github.com/djm204/frankenbeast/commit/d8f4439c2d047a6703ebd1bf958d95f8387f9000))
* **web:** preserve chat session for martin-loop launches ([4ab631e](https://github.com/djm204/frankenbeast/commit/4ab631e281eb0a7c350bfa1b0712b7e1c772af39))
* **web:** preserve SSE cursor on parse failure ([f9c5891](https://github.com/djm204/frankenbeast/commit/f9c58914d147a65e4336c4d59afe7f7709a38618))
* **web:** prevent blank module numbers saving zero ([e90f0d0](https://github.com/djm204/frankenbeast/commit/e90f0d08e520e9abb6200ffd7da80d2468c84a66)), closes [#1173](https://github.com/djm204/frankenbeast/issues/1173)
* **web:** prevent unavailable container launches ([3554dda](https://github.com/djm204/frankenbeast/commit/3554dda5b8f2b78e535573edff555796dc866940))
* **web:** reject fake directory picker paths ([b824fe5](https://github.com/djm204/frankenbeast/commit/b824fe54baca4680935cb52e3ab42cca23cca398))
* **web:** reject unsupported beast workflow definitions ([fe2891f](https://github.com/djm204/frankenbeast/commit/fe2891f5268de98b707456b26324ee3e045a953f))
* **web:** render controls for approval-paused agents ([756ef29](https://github.com/djm204/frankenbeast/commit/756ef2908139115c91b19086cc98fca4d0d8c788)), closes [#1172](https://github.com/djm204/frankenbeast/issues/1172)
* **web:** show analytics event pagination range ([b6c1018](https://github.com/djm204/frankenbeast/commit/b6c1018e5ad4eee55b6ed8d33efb1a2a2792abde))
* **web:** show unavailable chat cost telemetry ([#1636](https://github.com/djm204/frankenbeast/issues/1636)) ([75d70ee](https://github.com/djm204/frankenbeast/commit/75d70ee17b9990baa404c920aebe376a2bede1e6))
* **web:** summarize disabled module overrides in agent rows ([8f953b3](https://github.com/djm204/frankenbeast/commit/8f953b302e343b5a007f2ccade060158543ec1db))
* **web:** surface analytics API structured errors ([04ada0b](https://github.com/djm204/frankenbeast/commit/04ada0bc5ced056413d70f28cf74c2a5b1a71e8c)), closes [#1194](https://github.com/djm204/frankenbeast/issues/1194)
* **web:** surface Beasts API structured errors ([2416535](https://github.com/djm204/frankenbeast/commit/241653529e5170babdce4269c204f84734388058))
* **web:** surface Dashboard initial load failures ([b0ff786](https://github.com/djm204/frankenbeast/commit/b0ff786b9aee758168566c2b0c805ad1d41aedd0)), closes [#1196](https://github.com/djm204/frankenbeast/issues/1196)
* **web:** surface network service action failures ([#1553](https://github.com/djm204/frankenbeast/issues/1553)) ([2c43569](https://github.com/djm204/frankenbeast/commit/2c43569d63c3dd0f0c758f88e29bd00627ba4955))
* **web:** validate beast module numeric config ([#1466](https://github.com/djm204/frankenbeast/issues/1466)) ([25a4359](https://github.com/djm204/frankenbeast/commit/25a43592b1d446c800b579ff3d79a12ae902eb59))
* **web:** validate chat websocket server events ([626291e](https://github.com/djm204/frankenbeast/commit/626291e1af466d96f6f6409cf4938a18f03b22ce)), closes [#1091](https://github.com/djm204/frankenbeast/issues/1091)


### Miscellaneous

* **ci:** make workspace lint coverage explicit ([#1596](https://github.com/djm204/frankenbeast/issues/1596)) ([c1674ed](https://github.com/djm204/frankenbeast/commit/c1674ed69e460a9c7c14d8b7af2e4039edf174d8))
* **package:** normalize workspace metadata ([#1573](https://github.com/djm204/frankenbeast/issues/1573)) ([921c557](https://github.com/djm204/frankenbeast/commit/921c557e9f8392f1202f3fa2cdcc7952ffccd255))


### Documentation

* **web:** clarify dashboard proxy env guidance ([cb20c5c](https://github.com/djm204/frankenbeast/commit/cb20c5cafb100741c10f032f4d03250e0ee05556)), closes [#993](https://github.com/djm204/frankenbeast/issues/993)
* **web:** document Quick Start scripts ([e4261d7](https://github.com/djm204/frankenbeast/commit/e4261d754908e1b494dff417230fd079ece78868))


### Tests

* add deterministic Vitest seed mode ([#1429](https://github.com/djm204/frankenbeast/issues/1429)) ([f12b497](https://github.com/djm204/frankenbeast/commit/f12b497a0662a1b519cbf07d442316c734dcc778))
* add workspace coverage task ([#1589](https://github.com/djm204/frankenbeast/issues/1589)) ([1934756](https://github.com/djm204/frankenbeast/commit/1934756851e520c033f2a43c5b440c8268662714)), closes [#948](https://github.com/djm204/frankenbeast/issues/948)
* **web:** cover pending create-agent launch guard ([#1518](https://github.com/djm204/frankenbeast/issues/1518)) ([703404a](https://github.com/djm204/frankenbeast/commit/703404af589ea2394bed254d2056b577bbe32830))
* **web:** guard chat recovery against patch markers ([3b90460](https://github.com/djm204/frankenbeast/commit/3b90460c614ad16d1f42d5c23f40f18f3629a220)), closes [#1051](https://github.com/djm204/frankenbeast/issues/1051)
* **web:** guard chat send against patch markers ([9e7cf0f](https://github.com/djm204/frankenbeast/commit/9e7cf0fb68c90fd404396bdeb580b25a01993014))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.2 to 0.9.0

## [0.2.4](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.3...franken-web-v0.2.4) (2026-07-10)


### Bug Fixes

* **mcp:** close Codex hook command quoting issue ([#1382](https://github.com/djm204/frankenbeast/issues/1382)) ([293c730](https://github.com/djm204/frankenbeast/commit/293c7301083883b56bb71e1eca19f1ddc4d23236)), closes [#1047](https://github.com/djm204/frankenbeast/issues/1047)
* **orchestrator:** block chat input while approval pending ([#1316](https://github.com/djm204/frankenbeast/issues/1316)) ([7d67c0f](https://github.com/djm204/frankenbeast/commit/7d67c0fa8de42db1e79c9cc05d89a9f3a20129d4)), closes [#1154](https://github.com/djm204/frankenbeast/issues/1154)
* **web:** align Create Agent workflow configs ([#1312](https://github.com/djm204/frankenbeast/issues/1312)) ([940e945](https://github.com/djm204/frankenbeast/commit/940e945bcd0e1f7015282d905cf16597d2dc459a))
* **web:** drive beast wizard from catalog definitions ([#1378](https://github.com/djm204/frankenbeast/issues/1378)) ([9b6bfeb](https://github.com/djm204/frankenbeast/commit/9b6bfebfc42eccfd0bcc17cb92d0379cbfc23537))
* **web:** read chunk-plan design docs from workflow config ([0dbff10](https://github.com/djm204/frankenbeast/commit/0dbff10e004753212b3792f4976c7389da8c88f7))
* **web:** refresh chat socket token after errors ([aac89ac](https://github.com/djm204/frankenbeast/commit/aac89acc6ca2455d3a8889c81d6f670dc8c046ce)), closes [#1258](https://github.com/djm204/frankenbeast/issues/1258)
* **web:** resolve chat session syntax issue ([4ce15f7](https://github.com/djm204/frankenbeast/commit/4ce15f79ead878e53e9fe9ac10bd1d7943972dfd))
* **web:** secure chat websocket authentication ([679b15d](https://github.com/djm204/frankenbeast/commit/679b15dfbd8cc592ed04b67339230494a5586a8c)), closes [#703](https://github.com/djm204/frankenbeast/issues/703)
* **web:** surface Events and Logs fullscreen failures ([7d7dc21](https://github.com/djm204/frankenbeast/commit/7d7dc21858d7f97844550d281b9a5e1ac7fbad0f)), closes [#1332](https://github.com/djm204/frankenbeast/issues/1332)
* **web:** surface network API structured errors ([8bfb416](https://github.com/djm204/frankenbeast/commit/8bfb416acf5cfc315dee23a9ed6ed6605aa35cca)), closes [#1244](https://github.com/djm204/frankenbeast/issues/1244)


### Documentation

* **web:** fix operator token auth header markdown ([#1303](https://github.com/djm204/frankenbeast/issues/1303)) ([1449e26](https://github.com/djm204/frankenbeast/commit/1449e268c54bafb994d5034fec1ccfc312194d9e))
* **web:** fix Vite environment table ([#1328](https://github.com/djm204/frankenbeast/issues/1328)) ([b7c4697](https://github.com/djm204/frankenbeast/commit/b7c46976cf37330f90df6cfeeece50a3efe95c7b)), closes [#1198](https://github.com/djm204/frankenbeast/issues/1198)


### Tests

* **web:** cover analytics JSON copy rejection ([fb0d97b](https://github.com/djm204/frankenbeast/commit/fb0d97b61f3cd8e12248e0edd0cca246f4e98be2)), closes [#1250](https://github.com/djm204/frankenbeast/issues/1250)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.1 to 0.8.2

## [0.2.3](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.2...franken-web-v0.2.3) (2026-07-08)


### Bug Fixes

* **web:** hide placeholder dashboard routes ([#1272](https://github.com/djm204/frankenbeast/issues/1272)) ([4af005d](https://github.com/djm204/frankenbeast/commit/4af005d584a9468e77fade5921eee65c3c926269))


### Tests

* **ci:** exercise minimum supported Node version in CI ([#1057](https://github.com/djm204/frankenbeast/issues/1057)) ([26debe4](https://github.com/djm204/frankenbeast/commit/26debe4feb5221422680988a4a3bb1d112bb8adb))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.8.0 to 0.8.1

## [0.2.2](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.1...franken-web-v0.2.2) (2026-07-07)


### Bug Fixes

* **chat:** emit execution events after approval ([#877](https://github.com/djm204/frankenbeast/issues/877)) ([752f8ef](https://github.com/djm204/frankenbeast/commit/752f8ef2c56215d9c9cfb7cefe9f96a4a31cc49c))
* **cli:** show network help before root resolution ([71ebc60](https://github.com/djm204/frankenbeast/commit/71ebc60bcb292f228098759ffe22ba295cd7f34c)), closes [#414](https://github.com/djm204/frankenbeast/issues/414)
* **orchestrator:** make websocket session tickets one-time ([b6cf0a5](https://github.com/djm204/frankenbeast/commit/b6cf0a519797610bf3dedec894f28749f85b0868)), closes [#608](https://github.com/djm204/frankenbeast/issues/608)
* **orchestrator:** validate chunk plan design docs ([#884](https://github.com/djm204/frankenbeast/issues/884)) ([27a0451](https://github.com/djm204/frankenbeast/commit/27a045115db56d5695d83c588d01aa5bfbc50609))
* **security:** share realpath containment checks ([#875](https://github.com/djm204/frankenbeast/issues/875)) ([eb1ad94](https://github.com/djm204/frankenbeast/commit/eb1ad94736ead647df2f7840c0fad9555f86a73f))
* **web:** label skill catalog search field ([#846](https://github.com/djm204/frankenbeast/issues/846)) ([87e4295](https://github.com/djm204/frankenbeast/commit/87e42952f5554ff15b7560b88d622904e25b2227))
* **web:** prevent duplicate chat input echo ([#889](https://github.com/djm204/frankenbeast/issues/889)) ([479ab18](https://github.com/djm204/frankenbeast/commit/479ab1828846f4cc3b6542a158ca6b4e7dbd483c))
* **web:** remove outdated chat placeholder warning ([ddfd4ba](https://github.com/djm204/frankenbeast/commit/ddfd4ba65f1356584cf87007ace0512a790be1b9))
* **web:** show analytics JSON copy feedback ([edae673](https://github.com/djm204/frankenbeast/commit/edae6733d200897c23bfc5d76a4822f400376317)), closes [#633](https://github.com/djm204/frankenbeast/issues/633)
* **web:** use active route as page heading ([4392947](https://github.com/djm204/frankenbeast/commit/4392947c4fc89a32682ce8d934d520c90096693f))


### Refactoring

* **tests:** alias Vitest configs to package sources ([#845](https://github.com/djm204/frankenbeast/issues/845)) ([454b526](https://github.com/djm204/frankenbeast/commit/454b526e509d5762bde3ec5102d7521367f0c1a7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.7 to 0.8.0

## [0.2.1](https://github.com/djm204/frankenbeast/compare/franken-web-v0.2.0...franken-web-v0.2.1) (2026-07-06)


### Bug Fixes

* standardize package namespace strategy ([#825](https://github.com/djm204/frankenbeast/issues/825)) ([a2c236f](https://github.com/djm204/frankenbeast/commit/a2c236f9c7d46ab8fea079b85b3df3e4a7383e9b))
* **web:** wire beast prompt file picker selection ([#815](https://github.com/djm204/frankenbeast/issues/815)) ([b283987](https://github.com/djm204/frankenbeast/commit/b283987264c3c5716c813c78c23c5fa8f65a9bad))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.5 to 0.7.6

## [0.2.0](https://github.com/djm204/frankenbeast/compare/franken-web-v0.1.0...franken-web-v0.2.0) (2026-07-06)


### Features

* add module toggle UI to beast dispatch dashboard ([98e9dba](https://github.com/djm204/frankenbeast/commit/98e9dbaf41142cc16df71dda34776a4db96200f3))
* add module toggle UI to beast dispatch dashboard ([c13a1a3](https://github.com/djm204/frankenbeast/commit/c13a1a34849b67b0f1a41c59cba749ee291a7d59))
* complete MCP launch chunks 1-5 and canonicalize .fbeast storage ([#279](https://github.com/djm204/frankenbeast/issues/279)) ([22c8ac3](https://github.com/djm204/frankenbeast/commit/22c8ac3ffea24c5a252ab466277ec63261d1ed2d))
* dashboard SSE routes and web UI panels ([0c8c8e0](https://github.com/djm204/frankenbeast/commit/0c8c8e0520be173cd921edda6c424cc41e7b1292))
* **orchestrator:** add standalone beast daemon ([#477](https://github.com/djm204/frankenbeast/issues/477)) ([6b770a4](https://github.com/djm204/frankenbeast/commit/6b770a48f33d05e0c91a9b32800499e95049ade1))
* **orchestrator:** wire container chat dispatch ([#468](https://github.com/djm204/frankenbeast/issues/468)) ([94d0f5e](https://github.com/djm204/frankenbeast/commit/94d0f5e7a55a09e8aa540ce0f9832b975af2e9de))
* Plan 1 — Foundation Execution Pipeline ([bc4cc63](https://github.com/djm204/frankenbeast/commit/bc4cc63b958dfe1d9763056f69b5495b7272b73e))
* **web:** add AgentActionBar with force restart AlertDialog ([38be1e7](https://github.com/djm204/frankenbeast/commit/38be1e7e156d4bd3f2cfa33300d21065d7435574))
* **web:** add AgentDetailEdit with editable form and dirty tracking ([f69fc61](https://github.com/djm204/frankenbeast/commit/f69fc6102bc2c8a5ff4b6819c9e5e0c77ec9c01d))
* **web:** add AgentDetailPanel composing slide-in, readonly, and action bar ([1bfa3f1](https://github.com/djm204/frankenbeast/commit/1bfa3f1f3128a794a33b0e16dc89ae5220a1cdeb))
* **web:** add AgentDetailReadonly with accordion sections ([f63863f](https://github.com/djm204/frankenbeast/commit/f63863ff16804226124fce4e3a4102bb3049c7c6))
* **web:** add AgentList with search, density toggle, and empty state ([4e3525e](https://github.com/djm204/frankenbeast/commit/4e3525e396a540a717cdd51b9d4ab08170f7954b))
* **web:** add AgentRow component with density variants ([3d34665](https://github.com/djm204/frankenbeast/commit/3d3466579df89e9e55ee00ad6a6607e0b98233e5))
* **web:** add beast execution mode selection ([#469](https://github.com/djm204/frankenbeast/issues/469)) ([be44a79](https://github.com/djm204/frankenbeast/commit/be44a79b26d8c8dd2fcef0626e42541d78d6736d))
* **web:** add BeastsPage root component with agent list and detail panel ([a346104](https://github.com/djm204/frankenbeast/commit/a34610456813f100ef32256fe2a89de2f0132456))
* **web:** add dashboard page with skills, security, and provider panels ([d4e4bb4](https://github.com/djm204/frankenbeast/commit/d4e4bb445c20e82707279e9764723bf7af1395b0))
* **web:** add LogViewerModal with fullscreen toggle and search ([62352d1](https://github.com/djm204/frankenbeast/commit/62352d1fcc8de315c2517ea03ea66de26c1ef5d8))
* **web:** add observer analytics dashboard ([#286](https://github.com/djm204/frankenbeast/issues/286)) ([a375ec3](https://github.com/djm204/frankenbeast/commit/a375ec3c484f03bb67260050931609332d62bdd8))
* **web:** add shared form components (gap banner, provider select, preset cards, file picker) ([778dd39](https://github.com/djm204/frankenbeast/commit/778dd39878fbe06e6236b3174790e3dc3ad57a4a))
* **web:** add SinglePageForm accordion mode and fix lightningcss dep ([6aaece3](https://github.com/djm204/frankenbeast/commit/6aaece3d68aa971b87680266216d95b96fc12d0c))
* **web:** add SlideInPanel aside with CSS transitions ([63a27b0](https://github.com/djm204/frankenbeast/commit/63a27b0d0004c4564c4f557107d940cf90d0607f))
* **web:** add StatusLight component with glowing indicators ([e9437cf](https://github.com/djm204/frankenbeast/commit/e9437cffb4213eb44b4d5f2de049878e0b81c561))
* **web:** add token estimator and path normalization utilities ([08e9ca2](https://github.com/djm204/frankenbeast/commit/08e9ca293e9a1c49f17447930f19618584d7b80e))
* **web:** add wizard dialog shell with step indicator ([73bf365](https://github.com/djm204/frankenbeast/commit/73bf365242e060e3530af193c78fe8530bb5a7eb))
* **web:** add wizard steps 1-4 (identity, workflow, LLM targets, modules) ([4145da5](https://github.com/djm204/frankenbeast/commit/4145da542e657f98f39f75e90de31ffe1bc1e399))
* **web:** add Zustand beast store with wizard and edit slices ([c5d385b](https://github.com/djm204/frankenbeast/commit/c5d385b2cf5e26ce12f528fb038051f9ad107a85))
* **web:** beasts panel UX redesign — list-first agent management ([d192688](https://github.com/djm204/frankenbeast/commit/d1926889244ac00733621e09a6c43987ed3aeab7))
* **web:** configure Tailwind CSS v4 with beast theme tokens ([5b39266](https://github.com/djm204/frankenbeast/commit/5b39266ae3ed3bd03f62c6b3fe7304369f1b972a))
* **web:** extend beast-api with killAgent, patchAgentConfig, and extended config types ([b4c4df8](https://github.com/djm204/frankenbeast/commit/b4c4df81dff6126d02eac017160ab67d9ce2fa46))
* **web:** stream beast run status and logs ([ef86e02](https://github.com/djm204/frankenbeast/commit/ef86e02776d6398e9b12e94480ec2e15e073692b))
* **web:** wire AgentDetailEdit into detail panel edit mode ([9079ab2](https://github.com/djm204/frankenbeast/commit/9079ab2455ac772d3a264a548a16e69c0a791e93))
* **web:** wire BeastsPage into ChatShell, replace BeastDispatchPage ([4ad6706](https://github.com/djm204/frankenbeast/commit/4ad67069948be4fcda92a527851dde08819b5582))
* **web:** wire wizard steps, add module config forms, fix UX spacing ([ba61b6c](https://github.com/djm204/frankenbeast/commit/ba61b6c22d9ea5f375fdd875aa9ce3b6cf34647b))


### Bug Fixes

* address 10 review issues on dashboard chunk ([037a57a](https://github.com/djm204/frankenbeast/commit/037a57a2538682233612143e02f289cd88a19cb2))
* address 10 review issues on dashboard chunk ([df52d71](https://github.com/djm204/frankenbeast/commit/df52d7152350c03f741f64ee55ee802da1da81b6))
* **api:** share web DTO contracts ([#544](https://github.com/djm204/frankenbeast/issues/544)) ([ec1e29a](https://github.com/djm204/frankenbeast/commit/ec1e29ae21bed03d156f0a58c0f27964566e5e80))
* **ci:** add lightningcss-linux-x64-gnu as explicit optional dep ([0ec3262](https://github.com/djm204/frankenbeast/commit/0ec3262e7850ac5f80682df2ba420afa7619d91c))
* **ci:** remove explicit lightningcss-linux-x64-gnu dep, sync lockfile ([6eb7d09](https://github.com/djm204/frankenbeast/commit/6eb7d09aa703779819931420905ec0f9790f16a7))
* **config:** harden insecure defaults ([5abc7f9](https://github.com/djm204/frankenbeast/commit/5abc7f9c51477706ab6246116d44116645b363af)), closes [#522](https://github.com/djm204/frankenbeast/issues/522)
* dashboard review fixes, dispatch config stripping, error logging ([cdcf969](https://github.com/djm204/frankenbeast/commit/cdcf969541adfd69bca4a5ac9d4676571b639773))
* **deps:** resolve npm audit vulnerabilities ([6dbbf99](https://github.com/djm204/frankenbeast/commit/6dbbf99940b08a39397ff5ac588357b58cb87932)), closes [#517](https://github.com/djm204/frankenbeast/issues/517)
* **network:** track in-process comms gateway ([#487](https://github.com/djm204/frankenbeast/issues/487)) ([b3d7a3b](https://github.com/djm204/frankenbeast/commit/b3d7a3be68dabbfcf3ff6e967ab73b4c0d29677f))
* **orchestrator:** operator-auth all control-plane routes + comms endpoints ([#396](https://github.com/djm204/frankenbeast/issues/396)) ([398c752](https://github.com/djm204/frankenbeast/commit/398c7524cd467d18ac03a75c046124104e8342ff))
* **packaging:** pin internal package deps ([#763](https://github.com/djm204/frankenbeast/issues/763)) ([3603eac](https://github.com/djm204/frankenbeast/commit/3603eac5e23e2e95ee9c622c162fdd72b8ab33bb))
* **release:** publish npm packages from releases ([#764](https://github.com/djm204/frankenbeast/issues/764)) ([e25ca62](https://github.com/djm204/frankenbeast/commit/e25ca62602289193297976ce92548c92930b67cf)), closes [#741](https://github.com/djm204/frankenbeast/issues/741)
* **security:** Chunk 1 — fail-closed HTTP & approval boundaries ([#296](https://github.com/djm204/frankenbeast/issues/296)) ([f281e8e](https://github.com/djm204/frankenbeast/commit/f281e8eb98c6208a7da2f06e2923c57bd9890090))
* **security:** move chat socket tokens out of URLs ([#721](https://github.com/djm204/frankenbeast/issues/721)) ([71fd2f7](https://github.com/djm204/frankenbeast/commit/71fd2f76b7655f9ecbed802452b554b7f5835b02))
* **security:** reject non-loopback plaintext endpoints ([#733](https://github.com/djm204/frankenbeast/issues/733)) ([78741d1](https://github.com/djm204/frankenbeast/commit/78741d1c3c779e4baced6acd75190f36cb445435))
* **security:** ticket dashboard SSE streams ([#740](https://github.com/djm204/frankenbeast/issues/740)) ([6950ed8](https://github.com/djm204/frankenbeast/commit/6950ed84dfef95f4e3de474dd8928e896727b28e)), closes [#622](https://github.com/djm204/frankenbeast/issues/622)
* serve dashboard from production build ([#775](https://github.com/djm204/frankenbeast/issues/775)) ([7a4f8ab](https://github.com/djm204/frankenbeast/commit/7a4f8ab272c5c3dc5d06749d90f86284c63629d6))
* **test:** centralize token literals ([606f2db](https://github.com/djm204/frankenbeast/commit/606f2db3059d9fe33874cf2a8355658395f700b5)), closes [#610](https://github.com/djm204/frankenbeast/issues/610)
* **web:** add analytics detail dialog semantics ([2c28727](https://github.com/djm204/frankenbeast/commit/2c287275ae4c67c4e744a2e9cabead2dba4fd8a5))
* **web:** add analytics event pagination controls ([#534](https://github.com/djm204/frankenbeast/issues/534)) ([0ae15e8](https://github.com/djm204/frankenbeast/commit/0ae15e8d569e99a8357dfc9f53434dbfa18cc4c2))
* **web:** add missing available/failoverOrder to test mocks ([257a66f](https://github.com/djm204/frankenbeast/commit/257a66f5449a3d5367f24be294d9f18c05e14465))
* **web:** add recoverable app shell error state ([#663](https://github.com/djm204/frankenbeast/issues/663)) ([5bd7a9b](https://github.com/djm204/frankenbeast/commit/5bd7a9be1ddf3aacc3ed91edd38cc2846d7f8314))
* **web:** address critical review findings ([cf29b90](https://github.com/djm204/frankenbeast/commit/cf29b90552b663107088701b2e4820803d79d78f))
* **web:** announce create agent launch state ([#693](https://github.com/djm204/frankenbeast/issues/693)) ([d9bfb7d](https://github.com/djm204/frankenbeast/commit/d9bfb7d187afc2c1eca628c64df7dac76efd6b75))
* **web:** associate beast dispatch errors with fields ([e3bd5dc](https://github.com/djm204/frankenbeast/commit/e3bd5dc27d964736dfcf4fffc0c8afdc00d74b22)), closes [#659](https://github.com/djm204/frankenbeast/issues/659)
* **web:** clarify chat session switcher states ([#729](https://github.com/djm204/frankenbeast/issues/729)) ([386b366](https://github.com/djm204/frankenbeast/commit/386b366b0cf23a3d2036da8d845ce9e2389ebc3b))
* **web:** confirm destructive beast actions ([#705](https://github.com/djm204/frankenbeast/issues/705)) ([fca2e3e](https://github.com/djm204/frankenbeast/commit/fca2e3e44441405faff987f9849a425f97861d7f))
* **web:** distinguish partial analytics detail data ([a123716](https://github.com/djm204/frankenbeast/commit/a123716bc20d4fd39ebd11cc0dca08aa241fb1fc))
* **web:** explain disabled composer states ([#710](https://github.com/djm204/frankenbeast/issues/710)) ([79a2d0d](https://github.com/djm204/frankenbeast/commit/79a2d0dd724b5d075d45ec57ebd7534e2365fe80))
* **web:** fail closed for dashboard SSE auth ([#739](https://github.com/djm204/frankenbeast/issues/739)) ([04e3b19](https://github.com/djm204/frankenbeast/commit/04e3b19de77c56be9d7ef5a7f383efd33694cc11))
* **web:** fall back to REST for approvals ([#479](https://github.com/djm204/frankenbeast/issues/479)) ([3ac7f74](https://github.com/djm204/frankenbeast/commit/3ac7f74384328418a483fc9a2e4fb8837d87a380))
* **web:** fix launch wiring, fix Tailwind CSS layer conflict, improve spacing ([9d88618](https://github.com/djm204/frankenbeast/commit/9d8861801a6bf85235946948175f0fb74ffccaaa))
* **web:** guard disabled composer submissions ([39ffec9](https://github.com/djm204/frankenbeast/commit/39ffec9f5238b527a02473733d9a199eb1ae257e)), closes [#651](https://github.com/djm204/frankenbeast/issues/651)
* **web:** handle dashboard stream retry races ([#810](https://github.com/djm204/frankenbeast/issues/810)) ([8380ba6](https://github.com/djm204/frankenbeast/commit/8380ba6502b24b4fbad148a7be98aad044b8d83f))
* **web:** improve approval pending UX ([397aad6](https://github.com/djm204/frankenbeast/commit/397aad66ed038e7329447866e54c327c73952e3b)), closes [#654](https://github.com/djm204/frankenbeast/issues/654)
* **web:** improve network config save feedback ([#734](https://github.com/djm204/frankenbeast/issues/734)) ([f80e57c](https://github.com/djm204/frankenbeast/commit/f80e57c19dd238c1cdf9be3ad16fba0a63e09c13))
* **web:** keep chat bearer auth server-side ([#667](https://github.com/djm204/frankenbeast/issues/667)) ([6356ecf](https://github.com/djm204/frankenbeast/commit/6356ecf582e3238ea478b9daa698cdad9e7f6342))
* **web:** keep closed mobile sidebar out of focus ([#731](https://github.com/djm204/frankenbeast/issues/731)) ([1136fc4](https://github.com/djm204/frankenbeast/commit/1136fc4a87b35aaf6261dc78042584c8a4df0741))
* **web:** keep control-plane operator token server-side ([#666](https://github.com/djm204/frankenbeast/issues/666)) ([d201851](https://github.com/djm204/frankenbeast/commit/d201851f14b35d1388acf4ecf67b872d719559fb))
* **web:** make analytics events keyboard-accessible ([d14911f](https://github.com/djm204/frankenbeast/commit/d14911f3c7d0e6c278c030b67f87c38efa00df91)), closes [#631](https://github.com/djm204/frankenbeast/issues/631)
* **web:** mark stale analytics metrics during filter loads ([#728](https://github.com/djm204/frankenbeast/issues/728)) ([18b6ff5](https://github.com/djm204/frankenbeast/commit/18b6ff54366d5136f130943b767f743886bc7f14))
* **web:** mount dashboard overview route ([89108d3](https://github.com/djm204/frankenbeast/commit/89108d3e1c2be74706caff0852c6ad8a0bdd1c6b)), closes [#647](https://github.com/djm204/frankenbeast/issues/647)
* **web:** persist agent detail edits ([#533](https://github.com/djm204/frankenbeast/issues/533)) ([de88101](https://github.com/djm204/frankenbeast/commit/de88101a2fcf9514c9785dee931177d098dd95ef))
* **web:** preserve failed chat drafts ([640c035](https://github.com/djm204/frankenbeast/commit/640c0356b096f82cf5ebe53a26634fc883944130)), closes [#652](https://github.com/djm204/frankenbeast/issues/652)
* **web:** preserve transcript and activity scroll ([7e542c3](https://github.com/djm204/frankenbeast/commit/7e542c3cb78602a6bd51053953699c725c5f7887)), closes [#629](https://github.com/djm204/frankenbeast/issues/629)
* **web:** remove duplicate review launch action ([d1b559c](https://github.com/djm204/frankenbeast/commit/d1b559ccd45078ef4385e62b571c7dada4dab358)), closes [#662](https://github.com/djm204/frankenbeast/issues/662)
* **web:** remove misleading directory picker ([#735](https://github.com/djm204/frankenbeast/issues/735)) ([530e0ae](https://github.com/djm204/frankenbeast/commit/530e0ae7399f9e97edb598acd4fe6e60c92a3f03))
* **web:** remove operator token from frontend bundle ([fc1b8f5](https://github.com/djm204/frankenbeast/commit/fc1b8f5f7874488440b5755d4f71e8d6dd0774f1)), closes [#566](https://github.com/djm204/frankenbeast/issues/566)
* **web:** render activity timeline entries ([1ebc49e](https://github.com/djm204/frankenbeast/commit/1ebc49e924927df32aba3babcd5f9e864ec5c218)), closes [#630](https://github.com/djm204/frankenbeast/issues/630)
* **web:** resolve TypeScript strict null check errors across beasts components ([00493a4](https://github.com/djm204/frankenbeast/commit/00493a4afee7df9cb462344ece3ae1b81976d82b))
* **web:** share Beast wizard launch config ([#434](https://github.com/djm204/frankenbeast/issues/434)) ([595af54](https://github.com/djm204/frankenbeast/commit/595af541bdc879ab4560a0ffdeae55a051b2a5d8))
* **web:** show actionable chat error banners ([#695](https://github.com/djm204/frankenbeast/issues/695)) ([b2a48c6](https://github.com/djm204/frankenbeast/commit/b2a48c6af4578a0df264336c90b7e5ea333ca115))
* **web:** show network service action feedback ([9c9de85](https://github.com/djm204/frankenbeast/commit/9c9de8580c71c87bd59f782f3f77f99ff69ba88f)), closes [#650](https://github.com/djm204/frankenbeast/issues/650)
* **web:** show review summary in agent form view ([#736](https://github.com/djm204/frankenbeast/issues/736)) ([a03ab12](https://github.com/djm204/frankenbeast/commit/a03ab128b0f4c35fab649f6c9466b704ae352595)), closes [#635](https://github.com/djm204/frankenbeast/issues/635)
* **web:** surface dashboard operation failures ([#711](https://github.com/djm204/frankenbeast/issues/711)) ([692ea34](https://github.com/djm204/frankenbeast/commit/692ea34e338bf6d051ce6e6044a48586893355b3))
* **web:** sync network config editor ([#538](https://github.com/djm204/frankenbeast/issues/538)) ([55fcfe3](https://github.com/djm204/frankenbeast/commit/55fcfe38702c11a9e86b46b5ff048e1fd6252a87))
* **web:** upgrade network log viewer ([f19e88b](https://github.com/djm204/frankenbeast/commit/f19e88b8e9d7a1f10037b210153bbb0fb620b8a1))
* **web:** validate create agent wizard steps ([#706](https://github.com/djm204/frankenbeast/issues/706)) ([54869bb](https://github.com/djm204/frankenbeast/commit/54869bb0a52715a53621a08c478aad0032f43a57))
* **web:** wire dashboard Kill action to a real agent/run endpoint ([#450](https://github.com/djm204/frankenbeast/issues/450)) ([562ffad](https://github.com/djm204/frankenbeast/commit/562ffad0661821d7be53ce3d93dbb673b40262a5))
* **web:** wire Network page log fetching ([#532](https://github.com/djm204/frankenbeast/issues/532)) ([49051bd](https://github.com/djm204/frankenbeast/commit/49051bde6a4531c2d5d6439f596f1736e4d98b90))


### Miscellaneous

* **node:** align workspace engine constraints ([dcf5c4e](https://github.com/djm204/frankenbeast/commit/dcf5c4e90ca594f4ff282ea37c0a0d14000a39af)), closes [#757](https://github.com/djm204/frankenbeast/issues/757)
* **web:** add Radix UI, Tailwind v4, and Zustand dependencies ([31bf91a](https://github.com/djm204/frankenbeast/commit/31bf91a4a1a25a21190e3f471e01c38c8d636764))
* **web:** remove unmounted BeastDispatch page ([15b1c13](https://github.com/djm204/frankenbeast/commit/15b1c1360ce4b849b81008b55d1f9e2e47cdc4f6)), closes [#751](https://github.com/djm204/frankenbeast/issues/751)


### Documentation

* refresh accuracy against implementation ([#393](https://github.com/djm204/frankenbeast/issues/393)) ([e5a6088](https://github.com/djm204/frankenbeast/commit/e5a6088cddec35b5ac9c55b60323ff0c55663486))
* update RAMP_UP files across all packages to reflect current integration status ([a6f9f62](https://github.com/djm204/frankenbeast/commit/a6f9f627373e426278eaa98471d3f78da8064d26))
* update RAMP_UP for all packages with accurate integration status ([78220d6](https://github.com/djm204/frankenbeast/commit/78220d6ffb22720eae325f2f3f94823e6a29a463))


### Tests

* **web:** cover root Vite operator token rejection ([#779](https://github.com/djm204/frankenbeast/issues/779)) ([83cc7ac](https://github.com/djm204/frankenbeast/commit/83cc7acb974cfcedb371291368fa8fce5cc6dc0f))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.7.4 to 0.7.5
