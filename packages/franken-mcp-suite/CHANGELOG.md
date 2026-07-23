# Changelog

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

## [0.9.3](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.9.2...franken-mcp-suite-v0.9.3) (2026-07-23)


### Bug Fixes

* **mcp:** redact hook entrypoint failures ([#3619](https://github.com/djm204/frankenbeast/issues/3619)) ([5e08b5d](https://github.com/djm204/frankenbeast/commit/5e08b5d73a2e6f393484662f1fbcd1b52d6718b5)), closes [#3617](https://github.com/djm204/frankenbeast/issues/3617)


### Miscellaneous

* **deps:** bump the npm-security-and-maintenance group across 1 directory with 27 updates ([#3602](https://github.com/djm204/frankenbeast/issues/3602)) ([367903b](https://github.com/djm204/frankenbeast/commit/367903b8989dfbb8a52e3510c2fde8be95a6b391))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.16.0 to 0.16.1
    * @franken/brain bumped from 0.16.1 to 0.16.2
    * @franken/critique bumped from 0.10.3 to 0.10.4
    * @franken/governor bumped from 0.8.2 to 0.8.3
    * @franken/observer bumped from 0.11.4 to 0.11.5
    * @franken/orchestrator bumped from 0.57.1 to 0.57.2
    * @franken/planner bumped from 0.4.24 to 0.4.25

## [0.9.2](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.9.1...franken-mcp-suite-v0.9.2) (2026-07-22)


### Bug Fixes

* **mcp:** cover prefixed credential forms ([36338f5](https://github.com/djm204/frankenbeast/commit/36338f5ad38cc3a297a43c2e779b31ed876ff514))
* **mcp:** cover serialized header redaction ([483ac18](https://github.com/djm204/frankenbeast/commit/483ac185667dee22da89464831c2a55f0ebe30a6))
* **mcp:** redact credential pair structures ([9ace190](https://github.com/djm204/frankenbeast/commit/9ace190962eab939e9a93bd3cb38568bd12edb1f))
* **mcp:** redact post-tool observer payload secrets ([52d47e4](https://github.com/djm204/frankenbeast/commit/52d47e421f95c0f9e40cd225e324cbb40454b248))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/critique bumped from 0.10.2 to 0.10.3
    * @franken/observer bumped from 0.11.3 to 0.11.4
    * @franken/orchestrator bumped from 0.57.0 to 0.57.1

## [0.9.1](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.9.0...franken-mcp-suite-v0.9.1) (2026-07-22)


### Bug Fixes

* **brain:** quarantine corrupt episodic details ([#3471](https://github.com/djm204/frankenbeast/issues/3471)) ([0ce3a2a](https://github.com/djm204/frankenbeast/commit/0ce3a2a6830f826efb6b08fbe6eaaadd771bf25a))
* **deps:** override vulnerable Hono server ([#3515](https://github.com/djm204/frankenbeast/issues/3515)) ([302f6b2](https://github.com/djm204/frankenbeast/commit/302f6b2863feb2d85b0132d5538104cae1111698))
* **mcp-suite:** accept 16-hex legacy audit hashes ([#3560](https://github.com/djm204/frankenbeast/issues/3560)) ([d0fbd25](https://github.com/djm204/frankenbeast/commit/d0fbd25d610273d32ef5dcf678a7f1843d2e016f))
* **mcp-suite:** reject malformed observer metadata ([#3556](https://github.com/djm204/frankenbeast/issues/3556)) ([6ca1c0c](https://github.com/djm204/frankenbeast/commit/6ca1c0cd0fc27bfef182eab952cb2f80c2092287))
* **mcp:** redact prefixed env credential keys ([#3564](https://github.com/djm204/frankenbeast/issues/3564)) ([1f2b38c](https://github.com/djm204/frankenbeast/commit/1f2b38c84fa917a8346c045ba5efcfbb19504746))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.15.0 to 0.16.0
    * @franken/brain bumped from 0.16.0 to 0.16.1
    * @franken/critique bumped from 0.10.1 to 0.10.2
    * @franken/governor bumped from 0.8.1 to 0.8.2
    * @franken/observer bumped from 0.11.2 to 0.11.3
    * @franken/orchestrator bumped from 0.56.0 to 0.57.0
    * @franken/planner bumped from 0.4.23 to 0.4.24

## [0.9.0](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.8.1...franken-mcp-suite-v0.9.0) (2026-07-22)


### Features

* **brain:** add memory conflict resolution prompts ([#2396](https://github.com/djm204/frankenbeast/issues/2396)) ([eeb9155](https://github.com/djm204/frankenbeast/commit/eeb9155ccf06a1dd9cf2872685d3ac95b8bee7bf))
* **mcp-suite:** add agent-scoped memory reads ([#2316](https://github.com/djm204/frankenbeast/issues/2316)) ([f9d03fe](https://github.com/djm204/frankenbeast/commit/f9d03fecc7ccfed3f5b6f1c4a3d7124a07671b21))
* **memory:** add access audit report ([a39a13c](https://github.com/djm204/frankenbeast/commit/a39a13c1f6a1d44faa2e07c524723e21409e2f1f))
* **memory:** add access audit report ([0358044](https://github.com/djm204/frankenbeast/commit/035804436d3e495f565cd8f2a59087856c9bf655))
* **memory:** add conflict resolver ([#2320](https://github.com/djm204/frankenbeast/issues/2320)) ([6066b86](https://github.com/djm204/frankenbeast/commit/6066b861ca55505c5508f74b905362d68ef54b05))
* **memory:** add redacted project memory export ([#2321](https://github.com/djm204/frankenbeast/issues/2321)) ([6a7b8bb](https://github.com/djm204/frankenbeast/commit/6a7b8bb1dfbbc10282e7cd90ac34936a06943d15))
* **memory:** add retention policy report ([#2554](https://github.com/djm204/frankenbeast/issues/2554)) ([8b564d9](https://github.com/djm204/frankenbeast/commit/8b564d9c794db41af1e7e9e7be7a98bdf46f6ed6))
* **memory:** add source attribution viewer ([#2329](https://github.com/djm204/frankenbeast/issues/2329)) ([9a47d63](https://github.com/djm204/frankenbeast/commit/9a47d63ce4bed21908af873ed7588794ae19d25a))
* **memory:** expire temporary operational facts ([a5f581a](https://github.com/djm204/frankenbeast/commit/a5f581af955a937416760779dcbaffb64a1abf6d))
* **memory:** expire temporary operational facts ([5c46ae6](https://github.com/djm204/frankenbeast/commit/5c46ae662bbf52688d3c7afe8f8fbf3a4577fa0e))
* **memory:** expose promotion review queue tools ([efa666d](https://github.com/djm204/frankenbeast/commit/efa666df7eb49e0eadde812a45172fde33eaf6e0))
* **memory:** expose promotion review queue tools ([ecece38](https://github.com/djm204/frankenbeast/commit/ecece38986b9b8a74378c534005b57977197df79))
* **memory:** quarantine sensitive memory writes ([#2327](https://github.com/djm204/frankenbeast/issues/2327)) ([c77679b](https://github.com/djm204/frankenbeast/commit/c77679b3e33723d37c2b0d34484bfb5029b947b1))


### Bug Fixes

* address memory audit codex findings ([85d6eb7](https://github.com/djm204/frankenbeast/commit/85d6eb7c6d6ab9807804ad46f9fdd1d8629245c1))
* address memory audit hook provenance findings ([941320f](https://github.com/djm204/frankenbeast/commit/941320f0c0bd3f217d88c268efa003285f1645da))
* align MCP suite merge docs and hook test ([606ea64](https://github.com/djm204/frankenbeast/commit/606ea64b2c88882c8f6f2824bed90d6e03135940))
* classify retention and validate audit provenance filters ([394e1e1](https://github.com/djm204/frankenbeast/commit/394e1e15a30833f4ffece6ce0fa3c1b884aa0025))
* complete post-hook audit context closeout ([9f33321](https://github.com/djm204/frankenbeast/commit/9f33321db485b11a83f32b02008ad31e37969b38))
* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* **governor:** add high-risk action policy checks ([#2303](https://github.com/djm204/frankenbeast/issues/2303)) ([9071f78](https://github.com/djm204/frankenbeast/commit/9071f7828cdda8d83c75e096f6c4233b13546fb9))
* **governor:** honor skill HITL profiles ([#3380](https://github.com/djm204/frankenbeast/issues/3380)) ([ebe1d2f](https://github.com/djm204/frankenbeast/commit/ebe1d2fb7746bd8b57a2a8316c8dc166804514a3))
* harden public governor provenance checks ([0bc808e](https://github.com/djm204/frankenbeast/commit/0bc808e0a939f72e5bf6ce6189f9edd3d6f89595))
* **mcp-suite:** address Codex audit provenance findings ([5c33696](https://github.com/djm204/frankenbeast/commit/5c33696dce7fc575085f386d44db2e39a2a9deb5))
* **mcp-suite:** address memory governance Codex findings ([da08483](https://github.com/djm204/frankenbeast/commit/da08483304caf0de63784a0069cc408880b1b930))
* **mcp-suite:** close memory audit review gaps ([8b95b74](https://github.com/djm204/frankenbeast/commit/8b95b749aa359e0fac39c1b0aada8098c510a14b))
* **mcp-suite:** define typed package exports ([#3438](https://github.com/djm204/frankenbeast/issues/3438)) ([eed61bc](https://github.com/djm204/frankenbeast/commit/eed61bcad8577806ccf79400c8b62692ab7965d8))
* **mcp-suite:** sanitize proxy audit arguments ([#3446](https://github.com/djm204/frankenbeast/issues/3446)) ([6b99e84](https://github.com/djm204/frankenbeast/commit/6b99e841b449df7888c3794a7a938d6f32f0ef90))
* **mcp-suite:** write profile settings atomically ([#2656](https://github.com/djm204/frankenbeast/issues/2656)) ([e15b4f9](https://github.com/djm204/frankenbeast/commit/e15b4f97673cfc29d3f233ef85589c0dcaa1a3aa))
* **mcp:** cap brain startup hydration ([#3247](https://github.com/djm204/frankenbeast/issues/3247)) ([c63e531](https://github.com/djm204/frankenbeast/commit/c63e531ee287b902870c7a8e8e728bf89a4d6198))
* **mcp:** close observer resources on shutdown ([#3250](https://github.com/djm204/frankenbeast/issues/3250)) ([82272c1](https://github.com/djm204/frankenbeast/commit/82272c13bd420769db6ec7b0e6569cd4d78ce9c8))
* **mcp:** enforce per-tool execution deadlines ([#3238](https://github.com/djm204/frankenbeast/issues/3238)) ([88f56de](https://github.com/djm204/frankenbeast/commit/88f56de4b31b3e5931fc3bc08c773b76fa9e9acf))
* **mcp:** enforce tool schema bounds ([#3248](https://github.com/djm204/frankenbeast/issues/3248)) ([8b95dc9](https://github.com/djm204/frankenbeast/commit/8b95dc952cd1ec4a70954f863e034719b8c7887e))
* **mcp:** harden observer cost validation typing ([837a1f4](https://github.com/djm204/frankenbeast/commit/837a1f482b14b86d37ee4649ee94b2084456fd10)), closes [#2180](https://github.com/djm204/frankenbeast/issues/2180)
* **mcp:** preserve audit integrity during migration ([#3245](https://github.com/djm204/frankenbeast/issues/3245)) ([5c4aa84](https://github.com/djm204/frankenbeast/commit/5c4aa84c495d74b5b5dbe1dbfb2dbc3f36ff615d))
* **mcp:** reject unsafe integer arguments ([#3393](https://github.com/djm204/frankenbeast/issues/3393)) ([25cb09f](https://github.com/djm204/frankenbeast/commit/25cb09fc25adbaf3d9dc001415acfb4de4c5138c))
* **memory:** address audit provenance review findings ([98451e2](https://github.com/djm204/frankenbeast/commit/98451e2ecaeb1e27e75a112eae3f0320751410ed))
* **memory:** address audit report codex findings ([4ba8915](https://github.com/djm204/frankenbeast/commit/4ba8915a63f8fc0d1cdbd5527ba7cf523290ae20))
* **memory:** address audit report review findings ([32ecc5c](https://github.com/djm204/frankenbeast/commit/32ecc5cb246652a17dbf1e6a67d8fbe793cff840))
* **memory:** address audit report review findings ([6fa66d9](https://github.com/djm204/frankenbeast/commit/6fa66d9e5a27d54918c934541daac8076a45153f))
* **memory:** address audit report review findings ([a5b30f8](https://github.com/djm204/frankenbeast/commit/a5b30f8e1ec57120e170b953ee02359a5b0da9f0))
* **memory:** address review queue codex findings ([c6fa35d](https://github.com/djm204/frankenbeast/commit/c6fa35dbbb3571c7ef3f93b627abf8900b04c3b0))
* **memory:** address TTL hydration races ([102c710](https://github.com/djm204/frankenbeast/commit/102c7105bafab8afe7fb0786c1901d279c0630a2))
* **memory:** address TTL review edge cases ([f3c1c5f](https://github.com/djm204/frankenbeast/commit/f3c1c5f9cf0c01b29f69ea2e702ac5dc746941d2))
* **memory:** align audit SQL filters with derived tools ([4ad62b9](https://github.com/djm204/frankenbeast/commit/4ad62b97ce009918b4126185fb38af5f8881bdce))
* **memory:** align hook audit metadata ([04d4b5f](https://github.com/djm204/frankenbeast/commit/04d4b5fad91385e46e5761b7f06429f8f353d772))
* **memory:** close audit filter gaps ([c13d969](https://github.com/djm204/frankenbeast/commit/c13d9691e49ca8e19e6d41334890a473d9971176))
* **memory:** close final audit review gaps ([e8180dc](https://github.com/djm204/frankenbeast/commit/e8180dcf1f3b33f729c1b68f3b0c524b0455a9ee))
* **memory:** close review decision governance gaps ([a8f6ce6](https://github.com/djm204/frankenbeast/commit/a8f6ce6ac39da54c5c1f0fa760bae8a6a92edf54))
* **memory:** close review queue audit loop ([bff1b45](https://github.com/djm204/frankenbeast/commit/bff1b4545176f1b6ccb79634c222034cd57ff547))
* **memory:** close review queue redaction gaps ([d5a55ab](https://github.com/djm204/frankenbeast/commit/d5a55ab3f03aae3dce03708d79ff60021592d843))
* **memory:** cover hook audit edge cases ([8fd9a96](https://github.com/djm204/frankenbeast/commit/8fd9a96c2eaf4312103fc95481c1018ef61d9dfa))
* **memory:** document memory query limit bounds ([6897dba](https://github.com/djm204/frankenbeast/commit/6897dba3e726c389e42f0b64d3bbf837fbe4a211)), closes [#2127](https://github.com/djm204/frankenbeast/issues/2127)
* **memory:** enforce operator review boundaries ([17f5be9](https://github.com/djm204/frankenbeast/commit/17f5be99e1b1bb8b92ad248780fb6b1c28a2e081))
* **memory:** handle review decision edge cases ([5989d48](https://github.com/djm204/frankenbeast/commit/5989d4843c941bbe60b4ed4f26e8d3ef6a4e6c5d))
* **memory:** handle TTL review edge cases ([57b15e8](https://github.com/djm204/frankenbeast/commit/57b15e8c9a6309c544a5b43b64438c7f8afaa7f7))
* **memory:** harden access audit reporting ([17a61d3](https://github.com/djm204/frankenbeast/commit/17a61d36caa805c6f572f8cd7313b770742523d8))
* **memory:** harden audit event deduplication ([5f74d63](https://github.com/djm204/frankenbeast/commit/5f74d63195816c3ccb9903fccfd3e6cc7fc37205))
* **memory:** harden audit provenance handling ([de6ca51](https://github.com/djm204/frankenbeast/commit/de6ca51f8c4774429d20a0cc1d9d1ac58f03ecd9))
* **memory:** harden audit report edge cases ([8b9b05c](https://github.com/djm204/frankenbeast/commit/8b9b05c1b2022bac4a376e8d4ed0fa87542a540d))
* **memory:** harden audit report provenance handling ([f7b653e](https://github.com/djm204/frankenbeast/commit/f7b653e86cf13a4ac382295c54c256445a961740))
* **memory:** harden audit report validation ([07e3973](https://github.com/djm204/frankenbeast/commit/07e397348a35b788c95a7b2fd49efdace2c728c6))
* **memory:** harden hook audit provenance ([1ffaa81](https://github.com/djm204/frankenbeast/commit/1ffaa81c381322a2cfecfc5875af35650fd797a6))
* **memory:** harden proxied review audit paths ([708e073](https://github.com/djm204/frankenbeast/commit/708e073e25aa7d04192c5ef13912a383faf0ebc0))
* **memory:** harden review governance audit paths ([e89bb80](https://github.com/djm204/frankenbeast/commit/e89bb806af2201188fd020de4baf8b1f5ec1c96d))
* **memory:** harden review queue redaction gates ([a2e90ea](https://github.com/djm204/frankenbeast/commit/a2e90ea584ca815951cd9f25cc40737dc0f39fa5))
* **memory:** include trusted hook audit provenance ([31dce1e](https://github.com/djm204/frankenbeast/commit/31dce1eb50a39ca12f0e203e4dce04b4c775b7ce))
* **memory:** parse provenance keys structurally ([9886ac7](https://github.com/djm204/frankenbeast/commit/9886ac730fbb123fa61c0c016c02cc7bcb2ca282))
* **memory:** preserve audit provenance for access reports ([b28a6a8](https://github.com/djm204/frankenbeast/commit/b28a6a87efce1f28dee83158e18c1f0626b49a4b))
* **memory:** preserve durable TTL edge cases ([f3bd7cc](https://github.com/djm204/frankenbeast/commit/f3bd7cc5c9b4e961f67749d3495c6b12ed9deb39))
* **memory:** preserve filtered audit metadata ([2b18380](https://github.com/djm204/frankenbeast/commit/2b183803e034e75b13fab82fb818e9cc607f8305))
* **memory:** preserve hook audit gate coverage ([b306eea](https://github.com/djm204/frankenbeast/commit/b306eea1add2ed38252454551fd9cf1a1e73c9ef))
* **memory:** redact audit report review surfaces ([f984818](https://github.com/djm204/frankenbeast/commit/f9848180778634c09c457760e2e538da28050f63))
* **memory:** redact key-only attribution proxy filters ([#2544](https://github.com/djm204/frankenbeast/issues/2544)) ([67c0676](https://github.com/djm204/frankenbeast/commit/67c0676c957a2b53d8fdd722e6c57eca7a7b9d56))
* **memory:** redact queued promotion candidates ([9e29018](https://github.com/djm204/frankenbeast/commit/9e29018ba31558a4a721fd08978b9b50b2bd308c))
* **memory:** redact stripped proxy proposal args ([77d5167](https://github.com/djm204/frankenbeast/commit/77d51672b56155cef4acd63f04d0b85976f890b8))
* **memory:** refine audit report correlation ([6304e6b](https://github.com/djm204/frankenbeast/commit/6304e6be3c739501154bcd53c25cf4c09bc2d07c))
* **memory:** remove stale audit scan helper ([0296a8a](https://github.com/djm204/frankenbeast/commit/0296a8ac01064496382ec0bfe9fdabf16a4c8bb6))
* **memory:** require approval for review approvals ([c0b7069](https://github.com/djm204/frankenbeast/commit/c0b706921542d945750923cba5592f4b422d8752))
* **memory:** resolve audit report review followups ([ffbe8ff](https://github.com/djm204/frankenbeast/commit/ffbe8fff172112d630abffc3befc85d186ff158c))
* **memory:** resolve review queue audit findings ([d7f0033](https://github.com/djm204/frankenbeast/commit/d7f003323fd7001a6eb48b8ef64aa77517a286e1))
* **memory:** tighten audit report filters ([a2050be](https://github.com/djm204/frankenbeast/commit/a2050be6b60d813c268e2ccda4bb32391290611a))
* **memory:** tighten audit report filters ([3b8bd8f](https://github.com/djm204/frankenbeast/commit/3b8bd8ff57bc1160052a6ffc60cad86082ebc719))
* **memory:** tighten review queue governance ([6bba037](https://github.com/djm204/frankenbeast/commit/6bba0370f65a07dad44ee9a0c7e6b7b6a19104af))
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

* **memory:** merge latest governance policy ([7d38d44](https://github.com/djm204/frankenbeast/commit/7d38d441bf2ecd247e33cacdc77616133c52877b))
* **memory:** merge main into review queue branch ([f3e0a23](https://github.com/djm204/frankenbeast/commit/f3e0a23812418b82591280e03cf803658695495c))
* release main ([750094b](https://github.com/djm204/frankenbeast/commit/750094bab0859c49829b4abe85013a5007fc272b))
* release main ([100e3a8](https://github.com/djm204/frankenbeast/commit/100e3a887b6fbd538e8a1b83f4e88ce4caf6c443))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2553](https://github.com/djm204/frankenbeast/issues/2553)) ([1ca33c2](https://github.com/djm204/frankenbeast/commit/1ca33c2aa6e68792886ef599d1ac35bebcc8e3c9))
* release main ([#2572](https://github.com/djm204/frankenbeast/issues/2572)) ([1db889b](https://github.com/djm204/frankenbeast/commit/1db889b3f71d3cf81af579394ecd58c7fe481e43))
* release main ([#2630](https://github.com/djm204/frankenbeast/issues/2630)) ([c5306fd](https://github.com/djm204/frankenbeast/commit/c5306fd4ca17ef03cbd7b2e91f731707dac5148e))
* release main ([#3400](https://github.com/djm204/frankenbeast/issues/3400)) ([02fd894](https://github.com/djm204/frankenbeast/commit/02fd894bf6e7453e56d3446a73be277431ae6e12))


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
    * @franken/types bumped from 0.14.1 to 0.15.0
    * @franken/brain bumped from 0.15.2 to 0.16.0
    * @franken/critique bumped from 0.10.0 to 0.10.1
    * @franken/governor bumped from 0.8.0 to 0.8.1
    * @franken/observer bumped from 0.11.1 to 0.11.2
    * @franken/orchestrator bumped from 0.55.1 to 0.56.0
    * @franken/planner bumped from 0.4.22 to 0.4.23

## [0.8.1](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.8.0...franken-mcp-suite-v0.8.1) (2026-07-19)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/brain bumped from 0.15.1 to 0.15.2
    * @franken/orchestrator bumped from 0.55.0 to 0.55.1

## [0.8.0](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.7.0...franken-mcp-suite-v0.8.0) (2026-07-19)


### Features

* **memory:** add access audit report ([a39a13c](https://github.com/djm204/frankenbeast/commit/a39a13c1f6a1d44faa2e07c524723e21409e2f1f))


### Bug Fixes

* **dx:** align workspace TypeScript versions ([#3232](https://github.com/djm204/frankenbeast/issues/3232)) ([5a58ead](https://github.com/djm204/frankenbeast/commit/5a58ead0e541104b41d87e5780419386ea727c26))
* **mcp-suite:** write profile settings atomically ([#2656](https://github.com/djm204/frankenbeast/issues/2656)) ([e15b4f9](https://github.com/djm204/frankenbeast/commit/e15b4f97673cfc29d3f233ef85589c0dcaa1a3aa))
* **mcp:** cap brain startup hydration ([#3247](https://github.com/djm204/frankenbeast/issues/3247)) ([c63e531](https://github.com/djm204/frankenbeast/commit/c63e531ee287b902870c7a8e8e728bf89a4d6198))
* **mcp:** close observer resources on shutdown ([#3250](https://github.com/djm204/frankenbeast/issues/3250)) ([82272c1](https://github.com/djm204/frankenbeast/commit/82272c13bd420769db6ec7b0e6569cd4d78ce9c8))
* **mcp:** enforce per-tool execution deadlines ([#3238](https://github.com/djm204/frankenbeast/issues/3238)) ([88f56de](https://github.com/djm204/frankenbeast/commit/88f56de4b31b3e5931fc3bc08c773b76fa9e9acf))
* **mcp:** enforce tool schema bounds ([#3248](https://github.com/djm204/frankenbeast/issues/3248)) ([8b95dc9](https://github.com/djm204/frankenbeast/commit/8b95dc952cd1ec4a70954f863e034719b8c7887e))
* **mcp:** preserve audit integrity during migration ([#3245](https://github.com/djm204/frankenbeast/issues/3245)) ([5c4aa84](https://github.com/djm204/frankenbeast/commit/5c4aa84c495d74b5b5dbe1dbfb2dbc3f36ff615d))
* **mcp:** reject unsafe integer arguments ([#3393](https://github.com/djm204/frankenbeast/issues/3393)) ([25cb09f](https://github.com/djm204/frankenbeast/commit/25cb09fc25adbaf3d9dc001415acfb4de4c5138c))
* **memory:** address audit report review findings ([32ecc5c](https://github.com/djm204/frankenbeast/commit/32ecc5cb246652a17dbf1e6a67d8fbe793cff840))
* **memory:** align audit SQL filters with derived tools ([4ad62b9](https://github.com/djm204/frankenbeast/commit/4ad62b97ce009918b4126185fb38af5f8881bdce))
* **memory:** close audit filter gaps ([c13d969](https://github.com/djm204/frankenbeast/commit/c13d9691e49ca8e19e6d41334890a473d9971176))
* **memory:** close final audit review gaps ([e8180dc](https://github.com/djm204/frankenbeast/commit/e8180dcf1f3b33f729c1b68f3b0c524b0455a9ee))
* **memory:** cover hook audit edge cases ([8fd9a96](https://github.com/djm204/frankenbeast/commit/8fd9a96c2eaf4312103fc95481c1018ef61d9dfa))
* **memory:** harden audit report provenance handling ([f7b653e](https://github.com/djm204/frankenbeast/commit/f7b653e86cf13a4ac382295c54c256445a961740))
* **memory:** harden audit report validation ([07e3973](https://github.com/djm204/frankenbeast/commit/07e397348a35b788c95a7b2fd49efdace2c728c6))
* **memory:** preserve hook audit gate coverage ([b306eea](https://github.com/djm204/frankenbeast/commit/b306eea1add2ed38252454551fd9cf1a1e73c9ef))
* **memory:** redact audit report review surfaces ([f984818](https://github.com/djm204/frankenbeast/commit/f9848180778634c09c457760e2e538da28050f63))
* **memory:** redact key-only attribution proxy filters ([#2544](https://github.com/djm204/frankenbeast/issues/2544)) ([67c0676](https://github.com/djm204/frankenbeast/commit/67c0676c957a2b53d8fdd722e6c57eca7a7b9d56))
* **memory:** refine audit report correlation ([6304e6b](https://github.com/djm204/frankenbeast/commit/6304e6be3c739501154bcd53c25cf4c09bc2d07c))
* **memory:** remove stale audit scan helper ([0296a8a](https://github.com/djm204/frankenbeast/commit/0296a8ac01064496382ec0bfe9fdabf16a4c8bb6))
* **memory:** tighten audit report filters ([a2050be](https://github.com/djm204/frankenbeast/commit/a2050be6b60d813c268e2ccda4bb32391290611a))
* **memory:** tighten audit report filters ([3b8bd8f](https://github.com/djm204/frankenbeast/commit/3b8bd8ff57bc1160052a6ffc60cad86082ebc719))
* **security:** address Codex redaction findings ([#2583](https://github.com/djm204/frankenbeast/issues/2583)) ([e497d90](https://github.com/djm204/frankenbeast/commit/e497d904af9fb9ee81aa7a1edc94f53aeb4f6f7d))
* **security:** redact MCP handler exception details ([#3234](https://github.com/djm204/frankenbeast/issues/3234)) ([459985e](https://github.com/djm204/frankenbeast/commit/459985e0c98374bb423e63cc82f75905e816d739))
* **security:** redact tracked agent dispatch failures ([#3237](https://github.com/djm204/frankenbeast/issues/3237)) ([ac39f65](https://github.com/djm204/frankenbeast/commit/ac39f65941e7a2aaabc2a45ed724760e4800b000))


### Performance

* **mcp:** validate only audit trail tail on append ([#3244](https://github.com/djm204/frankenbeast/issues/3244)) ([05da76f](https://github.com/djm204/frankenbeast/commit/05da76f79218b9185fb1a586acc7118b0827d0e6))


### Tests

* **mcp:** expect trusted audit provenance metadata ([98cdccc](https://github.com/djm204/frankenbeast/commit/98cdcccdddc1196cb28146820df452d5571ee4ea))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.14.0 to 0.14.1
    * @franken/brain bumped from 0.15.0 to 0.15.1
    * @franken/critique bumped from 0.9.2 to 0.10.0
    * @franken/governor bumped from 0.7.3 to 0.8.0
    * @franken/observer bumped from 0.11.0 to 0.11.1
    * @franken/orchestrator bumped from 0.54.0 to 0.55.0
    * @franken/planner bumped from 0.4.21 to 0.4.22

## [0.7.0](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.6.0...franken-mcp-suite-v0.7.0) (2026-07-18)


### Features

* **brain:** add memory conflict resolution prompts ([#2396](https://github.com/djm204/frankenbeast/issues/2396)) ([eeb9155](https://github.com/djm204/frankenbeast/commit/eeb9155ccf06a1dd9cf2872685d3ac95b8bee7bf))
* **mcp-suite:** add agent-scoped memory reads ([#2316](https://github.com/djm204/frankenbeast/issues/2316)) ([f9d03fe](https://github.com/djm204/frankenbeast/commit/f9d03fecc7ccfed3f5b6f1c4a3d7124a07671b21))
* **memory:** add conflict resolver ([#2320](https://github.com/djm204/frankenbeast/issues/2320)) ([6066b86](https://github.com/djm204/frankenbeast/commit/6066b861ca55505c5508f74b905362d68ef54b05))
* **memory:** add redacted project memory export ([#2321](https://github.com/djm204/frankenbeast/issues/2321)) ([6a7b8bb](https://github.com/djm204/frankenbeast/commit/6a7b8bb1dfbbc10282e7cd90ac34936a06943d15))
* **memory:** add retention policy report ([#2554](https://github.com/djm204/frankenbeast/issues/2554)) ([8b564d9](https://github.com/djm204/frankenbeast/commit/8b564d9c794db41af1e7e9e7be7a98bdf46f6ed6))
* **memory:** add right-to-forget workflow ([#2212](https://github.com/djm204/frankenbeast/issues/2212)) ([229bc0d](https://github.com/djm204/frankenbeast/commit/229bc0d8f69d5243ba8e3703c266ec9466633ab2))
* **memory:** add source attribution viewer ([#2329](https://github.com/djm204/frankenbeast/issues/2329)) ([9a47d63](https://github.com/djm204/frankenbeast/commit/9a47d63ce4bed21908af873ed7588794ae19d25a))
* **memory:** expire temporary operational facts ([a5f581a](https://github.com/djm204/frankenbeast/commit/a5f581af955a937416760779dcbaffb64a1abf6d))
* **memory:** expire temporary operational facts ([5c46ae6](https://github.com/djm204/frankenbeast/commit/5c46ae662bbf52688d3c7afe8f8fbf3a4577fa0e))
* **memory:** expose promotion review queue tools ([efa666d](https://github.com/djm204/frankenbeast/commit/efa666df7eb49e0eadde812a45172fde33eaf6e0))
* **memory:** expose promotion review queue tools ([ecece38](https://github.com/djm204/frankenbeast/commit/ecece38986b9b8a74378c534005b57977197df79))
* **memory:** quarantine sensitive memory writes ([#2327](https://github.com/djm204/frankenbeast/issues/2327)) ([c77679b](https://github.com/djm204/frankenbeast/commit/c77679b3e33723d37c2b0d34484bfb5029b947b1))


### Bug Fixes

* **deps:** repair npm security and maintenance update ([4fd8ecc](https://github.com/djm204/frankenbeast/commit/4fd8eccf9b57960572d624aaa18ceac773fddcc0))
* **governor:** add high-risk action policy checks ([#2303](https://github.com/djm204/frankenbeast/issues/2303)) ([9071f78](https://github.com/djm204/frankenbeast/commit/9071f7828cdda8d83c75e096f6c4233b13546fb9))
* **governor:** resolve root test suite merge drift ([29270d5](https://github.com/djm204/frankenbeast/commit/29270d533f252535ff122b422d60095a949e6aab))
* **mcp-suite:** avoid forced exits in server startup ([#2192](https://github.com/djm204/frankenbeast/issues/2192)) ([f01f725](https://github.com/djm204/frankenbeast/commit/f01f7253181cba6d7c8df28187ef22298af4ac69))
* **mcp-suite:** deny unsafe tool argument shapes ([#2038](https://github.com/djm204/frankenbeast/issues/2038)) ([b1e8406](https://github.com/djm204/frankenbeast/commit/b1e8406aa7ecd9a7b95e9ac10ca77996c22f193b))
* **mcp-suite:** harden project-scoped MCP config paths ([#1350](https://github.com/djm204/frankenbeast/issues/1350)) ([e55be12](https://github.com/djm204/frankenbeast/commit/e55be12870523f3c7108ff4e650a94742230b7de))
* **mcp-suite:** protect unknown proxy workspace roots ([ca4f6a6](https://github.com/djm204/frankenbeast/commit/ca4f6a6817f900c0d38e5ac3ed4af1af9df405e7)), closes [#1786](https://github.com/djm204/frankenbeast/issues/1786)
* **mcp-suite:** share observer cost validation ([#2189](https://github.com/djm204/frankenbeast/issues/2189)) ([b1cd501](https://github.com/djm204/frankenbeast/commit/b1cd5015ef764e86a2e645995998f475a6d49291))
* **mcp-suite:** validate brain memory query limits ([#2029](https://github.com/djm204/frankenbeast/issues/2029)) ([1bcc3e3](https://github.com/djm204/frankenbeast/commit/1bcc3e34a9a91d4e3bea0863c13d6d209e5bf474)), closes [#2016](https://github.com/djm204/frankenbeast/issues/2016)
* **mcp-suite:** validate memory query limit safety ([#2001](https://github.com/djm204/frankenbeast/issues/2001)) ([6655e98](https://github.com/djm204/frankenbeast/commit/6655e98955ff75a87cd1c8237455c9207985b623))
* **mcp:** harden observer cost validation typing ([837a1f4](https://github.com/djm204/frankenbeast/commit/837a1f482b14b86d37ee4649ee94b2084456fd10)), closes [#2180](https://github.com/djm204/frankenbeast/issues/2180)
* **memory:** address review queue codex findings ([c6fa35d](https://github.com/djm204/frankenbeast/commit/c6fa35dbbb3571c7ef3f93b627abf8900b04c3b0))
* **memory:** address TTL hydration races ([102c710](https://github.com/djm204/frankenbeast/commit/102c7105bafab8afe7fb0786c1901d279c0630a2))
* **memory:** address TTL review edge cases ([f3c1c5f](https://github.com/djm204/frankenbeast/commit/f3c1c5f9cf0c01b29f69ea2e702ac5dc746941d2))
* **memory:** close review decision governance gaps ([a8f6ce6](https://github.com/djm204/frankenbeast/commit/a8f6ce6ac39da54c5c1f0fa760bae8a6a92edf54))
* **memory:** close review queue audit loop ([bff1b45](https://github.com/djm204/frankenbeast/commit/bff1b4545176f1b6ccb79634c222034cd57ff547))
* **memory:** close review queue redaction gaps ([d5a55ab](https://github.com/djm204/frankenbeast/commit/d5a55ab3f03aae3dce03708d79ff60021592d843))
* **memory:** document memory query limit bounds ([6897dba](https://github.com/djm204/frankenbeast/commit/6897dba3e726c389e42f0b64d3bbf837fbe4a211)), closes [#2127](https://github.com/djm204/frankenbeast/issues/2127)
* **memory:** enforce operator review boundaries ([17f5be9](https://github.com/djm204/frankenbeast/commit/17f5be99e1b1bb8b92ad248780fb6b1c28a2e081))
* **memory:** handle review decision edge cases ([5989d48](https://github.com/djm204/frankenbeast/commit/5989d4843c941bbe60b4ed4f26e8d3ef6a4e6c5d))
* **memory:** handle TTL review edge cases ([57b15e8](https://github.com/djm204/frankenbeast/commit/57b15e8c9a6309c544a5b43b64438c7f8afaa7f7))
* **memory:** harden proxied review audit paths ([708e073](https://github.com/djm204/frankenbeast/commit/708e073e25aa7d04192c5ef13912a383faf0ebc0))
* **memory:** harden review governance audit paths ([e89bb80](https://github.com/djm204/frankenbeast/commit/e89bb806af2201188fd020de4baf8b1f5ec1c96d))
* **memory:** harden review queue redaction gates ([a2e90ea](https://github.com/djm204/frankenbeast/commit/a2e90ea584ca815951cd9f25cc40737dc0f39fa5))
* **memory:** preserve durable TTL edge cases ([f3bd7cc](https://github.com/djm204/frankenbeast/commit/f3bd7cc5c9b4e961f67749d3495c6b12ed9deb39))
* **memory:** redact queued promotion candidates ([9e29018](https://github.com/djm204/frankenbeast/commit/9e29018ba31558a4a721fd08978b9b50b2bd308c))
* **memory:** redact stripped proxy proposal args ([77d5167](https://github.com/djm204/frankenbeast/commit/77d51672b56155cef4acd63f04d0b85976f890b8))
* **memory:** require approval for review approvals ([c0b7069](https://github.com/djm204/frankenbeast/commit/c0b706921542d945750923cba5592f4b422d8752))
* **memory:** resolve review queue audit findings ([d7f0033](https://github.com/djm204/frankenbeast/commit/d7f003323fd7001a6eb48b8ef64aa77517a286e1))
* **memory:** tighten review queue governance ([6bba037](https://github.com/djm204/frankenbeast/commit/6bba0370f65a07dad44ee9a0c7e6b7b6a19104af))
* **orchestrator:** close beast attempt cleanup issue ([#2003](https://github.com/djm204/frankenbeast/issues/2003)) ([ae34c42](https://github.com/djm204/frankenbeast/commit/ae34c42ecba98db09aa5b43c097d8ecf0819170e))
* preserve Codex hooks backup on invalid JSON ([5656689](https://github.com/djm204/frankenbeast/commit/56566899ade1ad75cd0f37b9a4c9643d5c6df7ee))
* preserve invalid Codex hooks with recoverable backup ([1e5d4a1](https://github.com/djm204/frankenbeast/commit/1e5d4a123e26c81798051497882694cdb0449214))


### Miscellaneous

* **memory:** merge latest governance policy ([7d38d44](https://github.com/djm204/frankenbeast/commit/7d38d441bf2ecd247e33cacdc77616133c52877b))
* **memory:** merge main into review queue branch ([f3e0a23](https://github.com/djm204/frankenbeast/commit/f3e0a23812418b82591280e03cf803658695495c))
* release main ([750094b](https://github.com/djm204/frankenbeast/commit/750094bab0859c49829b4abe85013a5007fc272b))
* release main ([100e3a8](https://github.com/djm204/frankenbeast/commit/100e3a887b6fbd538e8a1b83f4e88ce4caf6c443))
* release main ([#1892](https://github.com/djm204/frankenbeast/issues/1892)) ([8b3d61b](https://github.com/djm204/frankenbeast/commit/8b3d61ba99827525b5e60b647e1f1b9bb1877ace))
* release main ([#2216](https://github.com/djm204/frankenbeast/issues/2216)) ([7b2a02d](https://github.com/djm204/frankenbeast/commit/7b2a02d44ce6d09321e7129811c6e81e9d04b35c))
* release main ([#2217](https://github.com/djm204/frankenbeast/issues/2217)) ([fae513f](https://github.com/djm204/frankenbeast/commit/fae513fdd7115972f36a707db960800c64dd3b3e))
* release main ([#2219](https://github.com/djm204/frankenbeast/issues/2219)) ([ee6de79](https://github.com/djm204/frankenbeast/commit/ee6de793f48d4d4b93ea86fb8dc36001c01dc09e))
* release main ([#2222](https://github.com/djm204/frankenbeast/issues/2222)) ([40d3c99](https://github.com/djm204/frankenbeast/commit/40d3c9941e2d08d6d1b4c9994a3615152234b84b))
* release main ([#2232](https://github.com/djm204/frankenbeast/issues/2232)) ([69fd8f3](https://github.com/djm204/frankenbeast/commit/69fd8f30e0492f56863942c8eac89c9ec285822f))
* release main ([#2234](https://github.com/djm204/frankenbeast/issues/2234)) ([bdc6c17](https://github.com/djm204/frankenbeast/commit/bdc6c172184beefb391135e1119dee2cc8c42434))
* release main ([#2236](https://github.com/djm204/frankenbeast/issues/2236)) ([c410dd1](https://github.com/djm204/frankenbeast/commit/c410dd1a54bc1346aad48b47d6d30a56e9a0a499))
* release main ([#2239](https://github.com/djm204/frankenbeast/issues/2239)) ([dbcd153](https://github.com/djm204/frankenbeast/commit/dbcd1539d40a1f6dda7c7cf54bb39c09b5196eab))
* release main ([#2241](https://github.com/djm204/frankenbeast/issues/2241)) ([dc95440](https://github.com/djm204/frankenbeast/commit/dc95440e1d5ab59a176760f6a29dd36812f53699))
* release main ([#2245](https://github.com/djm204/frankenbeast/issues/2245)) ([c501037](https://github.com/djm204/frankenbeast/commit/c501037be1247eccc0a4cea1a25e6d9dcdebb41f))
* release main ([#2279](https://github.com/djm204/frankenbeast/issues/2279)) ([4c3a8e7](https://github.com/djm204/frankenbeast/commit/4c3a8e7484e691f10ae942252dfaec213848e395))
* release main ([#2286](https://github.com/djm204/frankenbeast/issues/2286)) ([1cd49cc](https://github.com/djm204/frankenbeast/commit/1cd49ccdc74e960f24e3ab0ec25ef63367ac862b))
* release main ([#2287](https://github.com/djm204/frankenbeast/issues/2287)) ([dd3f90d](https://github.com/djm204/frankenbeast/commit/dd3f90d59539c685f66ff8619fc66fa00db4006f))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2553](https://github.com/djm204/frankenbeast/issues/2553)) ([1ca33c2](https://github.com/djm204/frankenbeast/commit/1ca33c2aa6e68792886ef599d1ac35bebcc8e3c9))


### Documentation

* **security:** add agent tool execution threat model ([#2251](https://github.com/djm204/frankenbeast/issues/2251)) ([3e17ba8](https://github.com/djm204/frankenbeast/commit/3e17ba80f8606dbbc72f132e02cde392c8d62799))


### Tests

* **mcp-suite:** document tamper-evident audit chaining ([#2075](https://github.com/djm204/frankenbeast/issues/2075)) ([1cc34a4](https://github.com/djm204/frankenbeast/commit/1cc34a4ce8afdbea462ad790251b97fbc5e5863d))
* **mcp-suite:** exercise Codex executor CLI path ([#2062](https://github.com/djm204/frankenbeast/issues/2062)) ([0d052ee](https://github.com/djm204/frankenbeast/commit/0d052ee978864fbfd0d085e73664837beee0eb14))
* **mcp-suite:** keep test files in lint coverage ([#2047](https://github.com/djm204/frankenbeast/issues/2047)) ([79e5fcc](https://github.com/djm204/frankenbeast/commit/79e5fccc2f75b34a9af476125090edafbe3f10fa))
* **mcp-suite:** split integration vitest config ([#2599](https://github.com/djm204/frankenbeast/issues/2599)) ([410b92c](https://github.com/djm204/frankenbeast/commit/410b92c2b79b193f91ca9efa2348af561e0ddf64))
* **memory:** cover cross-profile memory isolation ([#2574](https://github.com/djm204/frankenbeast/issues/2574)) ([daaacec](https://github.com/djm204/frankenbeast/commit/daaacecba86209552eeed73c38d667f36076cce3))
* **security:** add secret redaction regression suite ([#2575](https://github.com/djm204/frankenbeast/issues/2575)) ([04a708f](https://github.com/djm204/frankenbeast/commit/04a708fcf324599aab9c490718ecd625090482c8))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.13.0 to 0.14.0
    * @franken/brain bumped from 0.14.0 to 0.15.0
    * @franken/critique bumped from 0.9.1 to 0.9.2
    * @franken/governor bumped from 0.7.2 to 0.7.3
    * @franken/observer bumped from 0.10.1 to 0.11.0
    * @franken/orchestrator bumped from 0.53.0 to 0.54.0
    * @franken/planner bumped from 0.4.20 to 0.4.21

## [0.6.0](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.5.1...franken-mcp-suite-v0.6.0) (2026-07-17)


### Features

* **brain:** add memory conflict resolution prompts ([#2396](https://github.com/djm204/frankenbeast/issues/2396)) ([eeb9155](https://github.com/djm204/frankenbeast/commit/eeb9155ccf06a1dd9cf2872685d3ac95b8bee7bf))
* **mcp-suite:** add agent-scoped memory reads ([#2316](https://github.com/djm204/frankenbeast/issues/2316)) ([f9d03fe](https://github.com/djm204/frankenbeast/commit/f9d03fecc7ccfed3f5b6f1c4a3d7124a07671b21))
* **memory:** add conflict resolver ([#2320](https://github.com/djm204/frankenbeast/issues/2320)) ([6066b86](https://github.com/djm204/frankenbeast/commit/6066b861ca55505c5508f74b905362d68ef54b05))
* **memory:** add redacted project memory export ([#2321](https://github.com/djm204/frankenbeast/issues/2321)) ([6a7b8bb](https://github.com/djm204/frankenbeast/commit/6a7b8bb1dfbbc10282e7cd90ac34936a06943d15))
* **memory:** add right-to-forget workflow ([#2212](https://github.com/djm204/frankenbeast/issues/2212)) ([229bc0d](https://github.com/djm204/frankenbeast/commit/229bc0d8f69d5243ba8e3703c266ec9466633ab2))
* **memory:** add source attribution viewer ([#2329](https://github.com/djm204/frankenbeast/issues/2329)) ([9a47d63](https://github.com/djm204/frankenbeast/commit/9a47d63ce4bed21908af873ed7588794ae19d25a))
* **memory:** expire temporary operational facts ([a5f581a](https://github.com/djm204/frankenbeast/commit/a5f581af955a937416760779dcbaffb64a1abf6d))
* **memory:** expire temporary operational facts ([5c46ae6](https://github.com/djm204/frankenbeast/commit/5c46ae662bbf52688d3c7afe8f8fbf3a4577fa0e))
* **memory:** expose promotion review queue tools ([efa666d](https://github.com/djm204/frankenbeast/commit/efa666df7eb49e0eadde812a45172fde33eaf6e0))
* **memory:** expose promotion review queue tools ([ecece38](https://github.com/djm204/frankenbeast/commit/ecece38986b9b8a74378c534005b57977197df79))
* **memory:** quarantine sensitive memory writes ([#2327](https://github.com/djm204/frankenbeast/issues/2327)) ([c77679b](https://github.com/djm204/frankenbeast/commit/c77679b3e33723d37c2b0d34484bfb5029b947b1))


### Bug Fixes

* **deps:** repair npm security and maintenance update ([4fd8ecc](https://github.com/djm204/frankenbeast/commit/4fd8eccf9b57960572d624aaa18ceac773fddcc0))
* **governor:** add high-risk action policy checks ([#2303](https://github.com/djm204/frankenbeast/issues/2303)) ([9071f78](https://github.com/djm204/frankenbeast/commit/9071f7828cdda8d83c75e096f6c4233b13546fb9))
* **governor:** resolve root test suite merge drift ([29270d5](https://github.com/djm204/frankenbeast/commit/29270d533f252535ff122b422d60095a949e6aab))
* **mcp-suite:** avoid forced exits in server startup ([#2192](https://github.com/djm204/frankenbeast/issues/2192)) ([f01f725](https://github.com/djm204/frankenbeast/commit/f01f7253181cba6d7c8df28187ef22298af4ac69))
* **mcp-suite:** deny unsafe tool argument shapes ([#2038](https://github.com/djm204/frankenbeast/issues/2038)) ([b1e8406](https://github.com/djm204/frankenbeast/commit/b1e8406aa7ecd9a7b95e9ac10ca77996c22f193b))
* **mcp-suite:** harden generated hook shell assignments ([baa1f49](https://github.com/djm204/frankenbeast/commit/baa1f49aac5218a72e08f83324f1cdaddaa33e9f)), closes [#1795](https://github.com/djm204/frankenbeast/issues/1795)
* **mcp-suite:** harden project-scoped MCP config paths ([#1350](https://github.com/djm204/frankenbeast/issues/1350)) ([e55be12](https://github.com/djm204/frankenbeast/commit/e55be12870523f3c7108ff4e650a94742230b7de))
* **mcp-suite:** protect unknown proxy workspace roots ([ca4f6a6](https://github.com/djm204/frankenbeast/commit/ca4f6a6817f900c0d38e5ac3ed4af1af9df405e7)), closes [#1786](https://github.com/djm204/frankenbeast/issues/1786)
* **mcp-suite:** share observer cost validation ([#2189](https://github.com/djm204/frankenbeast/issues/2189)) ([b1cd501](https://github.com/djm204/frankenbeast/commit/b1cd5015ef764e86a2e645995998f475a6d49291))
* **mcp-suite:** validate brain memory query limits ([#2029](https://github.com/djm204/frankenbeast/issues/2029)) ([1bcc3e3](https://github.com/djm204/frankenbeast/commit/1bcc3e34a9a91d4e3bea0863c13d6d209e5bf474)), closes [#2016](https://github.com/djm204/frankenbeast/issues/2016)
* **mcp-suite:** validate memory query limit safety ([#2001](https://github.com/djm204/frankenbeast/issues/2001)) ([6655e98](https://github.com/djm204/frankenbeast/commit/6655e98955ff75a87cd1c8237455c9207985b623))
* **memory:** address review queue codex findings ([c6fa35d](https://github.com/djm204/frankenbeast/commit/c6fa35dbbb3571c7ef3f93b627abf8900b04c3b0))
* **memory:** address TTL hydration races ([102c710](https://github.com/djm204/frankenbeast/commit/102c7105bafab8afe7fb0786c1901d279c0630a2))
* **memory:** address TTL review edge cases ([f3c1c5f](https://github.com/djm204/frankenbeast/commit/f3c1c5f9cf0c01b29f69ea2e702ac5dc746941d2))
* **memory:** close review decision governance gaps ([a8f6ce6](https://github.com/djm204/frankenbeast/commit/a8f6ce6ac39da54c5c1f0fa760bae8a6a92edf54))
* **memory:** close review queue audit loop ([bff1b45](https://github.com/djm204/frankenbeast/commit/bff1b4545176f1b6ccb79634c222034cd57ff547))
* **memory:** close review queue redaction gaps ([d5a55ab](https://github.com/djm204/frankenbeast/commit/d5a55ab3f03aae3dce03708d79ff60021592d843))
* **memory:** document memory query limit bounds ([6897dba](https://github.com/djm204/frankenbeast/commit/6897dba3e726c389e42f0b64d3bbf837fbe4a211)), closes [#2127](https://github.com/djm204/frankenbeast/issues/2127)
* **memory:** enforce operator review boundaries ([17f5be9](https://github.com/djm204/frankenbeast/commit/17f5be99e1b1bb8b92ad248780fb6b1c28a2e081))
* **memory:** handle review decision edge cases ([5989d48](https://github.com/djm204/frankenbeast/commit/5989d4843c941bbe60b4ed4f26e8d3ef6a4e6c5d))
* **memory:** handle TTL review edge cases ([57b15e8](https://github.com/djm204/frankenbeast/commit/57b15e8c9a6309c544a5b43b64438c7f8afaa7f7))
* **memory:** harden proxied review audit paths ([708e073](https://github.com/djm204/frankenbeast/commit/708e073e25aa7d04192c5ef13912a383faf0ebc0))
* **memory:** harden review governance audit paths ([e89bb80](https://github.com/djm204/frankenbeast/commit/e89bb806af2201188fd020de4baf8b1f5ec1c96d))
* **memory:** harden review queue redaction gates ([a2e90ea](https://github.com/djm204/frankenbeast/commit/a2e90ea584ca815951cd9f25cc40737dc0f39fa5))
* **memory:** preserve durable TTL edge cases ([f3bd7cc](https://github.com/djm204/frankenbeast/commit/f3bd7cc5c9b4e961f67749d3495c6b12ed9deb39))
* **memory:** redact queued promotion candidates ([9e29018](https://github.com/djm204/frankenbeast/commit/9e29018ba31558a4a721fd08978b9b50b2bd308c))
* **memory:** redact stripped proxy proposal args ([77d5167](https://github.com/djm204/frankenbeast/commit/77d51672b56155cef4acd63f04d0b85976f890b8))
* **memory:** require approval for review approvals ([c0b7069](https://github.com/djm204/frankenbeast/commit/c0b706921542d945750923cba5592f4b422d8752))
* **memory:** resolve review queue audit findings ([d7f0033](https://github.com/djm204/frankenbeast/commit/d7f003323fd7001a6eb48b8ef64aa77517a286e1))
* **memory:** tighten review queue governance ([6bba037](https://github.com/djm204/frankenbeast/commit/6bba0370f65a07dad44ee9a0c7e6b7b6a19104af))
* **orchestrator:** close beast attempt cleanup issue ([#2003](https://github.com/djm204/frankenbeast/issues/2003)) ([ae34c42](https://github.com/djm204/frankenbeast/commit/ae34c42ecba98db09aa5b43c097d8ecf0819170e))
* preserve Codex hooks backup on invalid JSON ([5656689](https://github.com/djm204/frankenbeast/commit/56566899ade1ad75cd0f37b9a4c9643d5c6df7ee))
* preserve invalid Codex hooks with recoverable backup ([1e5d4a1](https://github.com/djm204/frankenbeast/commit/1e5d4a123e26c81798051497882694cdb0449214))


### Miscellaneous

* **memory:** merge latest governance policy ([7d38d44](https://github.com/djm204/frankenbeast/commit/7d38d441bf2ecd247e33cacdc77616133c52877b))
* **memory:** merge main into review queue branch ([f3e0a23](https://github.com/djm204/frankenbeast/commit/f3e0a23812418b82591280e03cf803658695495c))
* release main ([#1764](https://github.com/djm204/frankenbeast/issues/1764)) ([13987c3](https://github.com/djm204/frankenbeast/commit/13987c314de9fff99ee7eaeb47a11c7d097a0834))
* release main ([#1892](https://github.com/djm204/frankenbeast/issues/1892)) ([8b3d61b](https://github.com/djm204/frankenbeast/commit/8b3d61ba99827525b5e60b647e1f1b9bb1877ace))
* release main ([#2216](https://github.com/djm204/frankenbeast/issues/2216)) ([7b2a02d](https://github.com/djm204/frankenbeast/commit/7b2a02d44ce6d09321e7129811c6e81e9d04b35c))
* release main ([#2217](https://github.com/djm204/frankenbeast/issues/2217)) ([fae513f](https://github.com/djm204/frankenbeast/commit/fae513fdd7115972f36a707db960800c64dd3b3e))
* release main ([#2219](https://github.com/djm204/frankenbeast/issues/2219)) ([ee6de79](https://github.com/djm204/frankenbeast/commit/ee6de793f48d4d4b93ea86fb8dc36001c01dc09e))
* release main ([#2222](https://github.com/djm204/frankenbeast/issues/2222)) ([40d3c99](https://github.com/djm204/frankenbeast/commit/40d3c9941e2d08d6d1b4c9994a3615152234b84b))
* release main ([#2232](https://github.com/djm204/frankenbeast/issues/2232)) ([69fd8f3](https://github.com/djm204/frankenbeast/commit/69fd8f30e0492f56863942c8eac89c9ec285822f))
* release main ([#2234](https://github.com/djm204/frankenbeast/issues/2234)) ([bdc6c17](https://github.com/djm204/frankenbeast/commit/bdc6c172184beefb391135e1119dee2cc8c42434))
* release main ([#2236](https://github.com/djm204/frankenbeast/issues/2236)) ([c410dd1](https://github.com/djm204/frankenbeast/commit/c410dd1a54bc1346aad48b47d6d30a56e9a0a499))
* release main ([#2239](https://github.com/djm204/frankenbeast/issues/2239)) ([dbcd153](https://github.com/djm204/frankenbeast/commit/dbcd1539d40a1f6dda7c7cf54bb39c09b5196eab))
* release main ([#2241](https://github.com/djm204/frankenbeast/issues/2241)) ([dc95440](https://github.com/djm204/frankenbeast/commit/dc95440e1d5ab59a176760f6a29dd36812f53699))
* release main ([#2245](https://github.com/djm204/frankenbeast/issues/2245)) ([c501037](https://github.com/djm204/frankenbeast/commit/c501037be1247eccc0a4cea1a25e6d9dcdebb41f))
* release main ([#2279](https://github.com/djm204/frankenbeast/issues/2279)) ([4c3a8e7](https://github.com/djm204/frankenbeast/commit/4c3a8e7484e691f10ae942252dfaec213848e395))
* release main ([#2286](https://github.com/djm204/frankenbeast/issues/2286)) ([1cd49cc](https://github.com/djm204/frankenbeast/commit/1cd49ccdc74e960f24e3ab0ec25ef63367ac862b))
* release main ([#2287](https://github.com/djm204/frankenbeast/issues/2287)) ([dd3f90d](https://github.com/djm204/frankenbeast/commit/dd3f90d59539c685f66ff8619fc66fa00db4006f))
* release main ([#2408](https://github.com/djm204/frankenbeast/issues/2408)) ([5545389](https://github.com/djm204/frankenbeast/commit/55453895d39a81c081dc9e919ac84f7750bfa2ee))
* release main ([#2409](https://github.com/djm204/frankenbeast/issues/2409)) ([39306c3](https://github.com/djm204/frankenbeast/commit/39306c3d03ed85ffa3624c8aad9c3b963542533b))
* release main ([#2553](https://github.com/djm204/frankenbeast/issues/2553)) ([1ca33c2](https://github.com/djm204/frankenbeast/commit/1ca33c2aa6e68792886ef599d1ac35bebcc8e3c9))


### Documentation

* **security:** add agent tool execution threat model ([#2251](https://github.com/djm204/frankenbeast/issues/2251)) ([3e17ba8](https://github.com/djm204/frankenbeast/commit/3e17ba80f8606dbbc72f132e02cde392c8d62799))


### Tests

* **mcp-suite:** document tamper-evident audit chaining ([#2075](https://github.com/djm204/frankenbeast/issues/2075)) ([1cc34a4](https://github.com/djm204/frankenbeast/commit/1cc34a4ce8afdbea462ad790251b97fbc5e5863d))
* **mcp-suite:** exercise Codex executor CLI path ([#2062](https://github.com/djm204/frankenbeast/issues/2062)) ([0d052ee](https://github.com/djm204/frankenbeast/commit/0d052ee978864fbfd0d085e73664837beee0eb14))
* **mcp-suite:** keep test files in lint coverage ([#2047](https://github.com/djm204/frankenbeast/issues/2047)) ([79e5fcc](https://github.com/djm204/frankenbeast/commit/79e5fccc2f75b34a9af476125090edafbe3f10fa))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/brain bumped from 0.13.0 to 0.14.0
    * @franken/observer bumped from 0.10.0 to 0.10.1
    * @franken/orchestrator bumped from 0.52.0 to 0.53.0

## [0.5.1](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.5.0...franken-mcp-suite-v0.5.1) (2026-07-16)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/brain bumped from 0.12.0 to 0.13.0
    * @franken/orchestrator bumped from 0.51.0 to 0.52.0

## [0.5.0](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.4.0...franken-mcp-suite-v0.5.0) (2026-07-16)


### Features

* **memory:** add source attribution viewer ([#2329](https://github.com/djm204/frankenbeast/issues/2329)) ([9a47d63](https://github.com/djm204/frankenbeast/commit/9a47d63ce4bed21908af873ed7588794ae19d25a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.12.0 to 0.13.0
    * @franken/brain bumped from 0.11.0 to 0.12.0
    * @franken/critique bumped from 0.9.0 to 0.9.1
    * @franken/governor bumped from 0.7.1 to 0.7.2
    * @franken/observer bumped from 0.9.0 to 0.10.0
    * @franken/orchestrator bumped from 0.50.0 to 0.51.0
    * @franken/planner bumped from 0.4.19 to 0.4.20

## [0.4.0](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.3.4...franken-mcp-suite-v0.4.0) (2026-07-16)


### Features

* **brain:** add memory conflict resolution prompts ([#2396](https://github.com/djm204/frankenbeast/issues/2396)) ([eeb9155](https://github.com/djm204/frankenbeast/commit/eeb9155ccf06a1dd9cf2872685d3ac95b8bee7bf))
* **mcp-suite:** add agent-scoped memory reads ([#2316](https://github.com/djm204/frankenbeast/issues/2316)) ([f9d03fe](https://github.com/djm204/frankenbeast/commit/f9d03fecc7ccfed3f5b6f1c4a3d7124a07671b21))
* **memory:** add conflict resolver ([#2320](https://github.com/djm204/frankenbeast/issues/2320)) ([6066b86](https://github.com/djm204/frankenbeast/commit/6066b861ca55505c5508f74b905362d68ef54b05))
* **memory:** add redacted project memory export ([#2321](https://github.com/djm204/frankenbeast/issues/2321)) ([6a7b8bb](https://github.com/djm204/frankenbeast/commit/6a7b8bb1dfbbc10282e7cd90ac34936a06943d15))
* **memory:** expire temporary operational facts ([a5f581a](https://github.com/djm204/frankenbeast/commit/a5f581af955a937416760779dcbaffb64a1abf6d))
* **memory:** expire temporary operational facts ([5c46ae6](https://github.com/djm204/frankenbeast/commit/5c46ae662bbf52688d3c7afe8f8fbf3a4577fa0e))
* **memory:** expose promotion review queue tools ([efa666d](https://github.com/djm204/frankenbeast/commit/efa666df7eb49e0eadde812a45172fde33eaf6e0))
* **memory:** expose promotion review queue tools ([ecece38](https://github.com/djm204/frankenbeast/commit/ecece38986b9b8a74378c534005b57977197df79))
* **memory:** quarantine sensitive memory writes ([#2327](https://github.com/djm204/frankenbeast/issues/2327)) ([c77679b](https://github.com/djm204/frankenbeast/commit/c77679b3e33723d37c2b0d34484bfb5029b947b1))


### Bug Fixes

* **governor:** add high-risk action policy checks ([#2303](https://github.com/djm204/frankenbeast/issues/2303)) ([9071f78](https://github.com/djm204/frankenbeast/commit/9071f7828cdda8d83c75e096f6c4233b13546fb9))
* **memory:** address review queue codex findings ([c6fa35d](https://github.com/djm204/frankenbeast/commit/c6fa35dbbb3571c7ef3f93b627abf8900b04c3b0))
* **memory:** address TTL hydration races ([102c710](https://github.com/djm204/frankenbeast/commit/102c7105bafab8afe7fb0786c1901d279c0630a2))
* **memory:** address TTL review edge cases ([f3c1c5f](https://github.com/djm204/frankenbeast/commit/f3c1c5f9cf0c01b29f69ea2e702ac5dc746941d2))
* **memory:** close review decision governance gaps ([a8f6ce6](https://github.com/djm204/frankenbeast/commit/a8f6ce6ac39da54c5c1f0fa760bae8a6a92edf54))
* **memory:** close review queue audit loop ([bff1b45](https://github.com/djm204/frankenbeast/commit/bff1b4545176f1b6ccb79634c222034cd57ff547))
* **memory:** close review queue redaction gaps ([d5a55ab](https://github.com/djm204/frankenbeast/commit/d5a55ab3f03aae3dce03708d79ff60021592d843))
* **memory:** enforce operator review boundaries ([17f5be9](https://github.com/djm204/frankenbeast/commit/17f5be99e1b1bb8b92ad248780fb6b1c28a2e081))
* **memory:** handle review decision edge cases ([5989d48](https://github.com/djm204/frankenbeast/commit/5989d4843c941bbe60b4ed4f26e8d3ef6a4e6c5d))
* **memory:** handle TTL review edge cases ([57b15e8](https://github.com/djm204/frankenbeast/commit/57b15e8c9a6309c544a5b43b64438c7f8afaa7f7))
* **memory:** harden proxied review audit paths ([708e073](https://github.com/djm204/frankenbeast/commit/708e073e25aa7d04192c5ef13912a383faf0ebc0))
* **memory:** harden review governance audit paths ([e89bb80](https://github.com/djm204/frankenbeast/commit/e89bb806af2201188fd020de4baf8b1f5ec1c96d))
* **memory:** harden review queue redaction gates ([a2e90ea](https://github.com/djm204/frankenbeast/commit/a2e90ea584ca815951cd9f25cc40737dc0f39fa5))
* **memory:** preserve durable TTL edge cases ([f3bd7cc](https://github.com/djm204/frankenbeast/commit/f3bd7cc5c9b4e961f67749d3495c6b12ed9deb39))
* **memory:** redact queued promotion candidates ([9e29018](https://github.com/djm204/frankenbeast/commit/9e29018ba31558a4a721fd08978b9b50b2bd308c))
* **memory:** redact stripped proxy proposal args ([77d5167](https://github.com/djm204/frankenbeast/commit/77d51672b56155cef4acd63f04d0b85976f890b8))
* **memory:** require approval for review approvals ([c0b7069](https://github.com/djm204/frankenbeast/commit/c0b706921542d945750923cba5592f4b422d8752))
* **memory:** resolve review queue audit findings ([d7f0033](https://github.com/djm204/frankenbeast/commit/d7f003323fd7001a6eb48b8ef64aa77517a286e1))
* **memory:** tighten review queue governance ([6bba037](https://github.com/djm204/frankenbeast/commit/6bba0370f65a07dad44ee9a0c7e6b7b6a19104af))
* preserve Codex hooks backup on invalid JSON ([5656689](https://github.com/djm204/frankenbeast/commit/56566899ade1ad75cd0f37b9a4c9643d5c6df7ee))
* preserve invalid Codex hooks with recoverable backup ([1e5d4a1](https://github.com/djm204/frankenbeast/commit/1e5d4a123e26c81798051497882694cdb0449214))


### Miscellaneous

* **memory:** merge latest governance policy ([7d38d44](https://github.com/djm204/frankenbeast/commit/7d38d441bf2ecd247e33cacdc77616133c52877b))
* **memory:** merge main into review queue branch ([f3e0a23](https://github.com/djm204/frankenbeast/commit/f3e0a23812418b82591280e03cf803658695495c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/brain bumped from 0.10.1 to 0.11.0
    * @franken/critique bumped from 0.8.3 to 0.9.0
    * @franken/governor bumped from 0.7.0 to 0.7.1
    * @franken/observer bumped from 0.8.2 to 0.9.0
    * @franken/orchestrator bumped from 0.49.2 to 0.50.0
    * @franken/planner bumped from 0.4.18 to 0.4.19

## [0.3.4](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.3.3...franken-mcp-suite-v0.3.4) (2026-07-15)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/orchestrator bumped from 0.49.1 to 0.49.2

## [0.3.3](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.3.2...franken-mcp-suite-v0.3.3) (2026-07-15)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/orchestrator bumped from 0.49.0 to 0.49.1

## [0.3.2](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.3.1...franken-mcp-suite-v0.3.2) (2026-07-15)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/brain bumped from 0.10.0 to 0.10.1
    * @franken/orchestrator bumped from 0.48.0 to 0.49.0

## [0.3.1](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.3.0...franken-mcp-suite-v0.3.1) (2026-07-15)


### Documentation

* **security:** add agent tool execution threat model ([#2251](https://github.com/djm204/frankenbeast/issues/2251)) ([3e17ba8](https://github.com/djm204/frankenbeast/commit/3e17ba80f8606dbbc72f132e02cde392c8d62799))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.11.0 to 0.12.0
    * @franken/brain bumped from 0.9.0 to 0.10.0
    * @franken/critique bumped from 0.8.2 to 0.8.3
    * @franken/governor bumped from 0.6.2 to 0.7.0
    * @franken/observer bumped from 0.8.1 to 0.8.2
    * @franken/orchestrator bumped from 0.47.1 to 0.48.0
    * @franken/planner bumped from 0.4.17 to 0.4.18

## [0.3.0](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.16...franken-mcp-suite-v0.3.0) (2026-07-14)


### Features

* **memory:** add right-to-forget workflow ([#2212](https://github.com/djm204/frankenbeast/issues/2212)) ([229bc0d](https://github.com/djm204/frankenbeast/commit/229bc0d8f69d5243ba8e3703c266ec9466633ab2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.10.1 to 0.11.0
    * @franken/brain bumped from 0.8.1 to 0.9.0
    * @franken/critique bumped from 0.8.1 to 0.8.2
    * @franken/governor bumped from 0.6.1 to 0.6.2
    * @franken/observer bumped from 0.8.0 to 0.8.1
    * @franken/orchestrator bumped from 0.47.0 to 0.47.1
    * @franken/planner bumped from 0.4.16 to 0.4.17

## [0.2.16](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.15...franken-mcp-suite-v0.2.16) (2026-07-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/orchestrator bumped from 0.46.1 to 0.47.0

## [0.2.15](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.14...franken-mcp-suite-v0.2.15) (2026-07-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/observer bumped from 0.7.18 to 0.8.0
    * @franken/orchestrator bumped from 0.46.0 to 0.46.1

## [0.2.14](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.13...franken-mcp-suite-v0.2.14) (2026-07-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/orchestrator bumped from 0.45.0 to 0.46.0

## [0.2.13](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.12...franken-mcp-suite-v0.2.13) (2026-07-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/orchestrator bumped from 0.44.2 to 0.45.0

## [0.2.12](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.11...franken-mcp-suite-v0.2.12) (2026-07-14)


### Bug Fixes

* **deps:** repair npm security and maintenance update ([4fd8ecc](https://github.com/djm204/frankenbeast/commit/4fd8eccf9b57960572d624aaa18ceac773fddcc0))
* **mcp-suite:** harden project-scoped MCP config paths ([#1350](https://github.com/djm204/frankenbeast/issues/1350)) ([e55be12](https://github.com/djm204/frankenbeast/commit/e55be12870523f3c7108ff4e650a94742230b7de))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/types bumped from 0.10.0 to 0.10.1
    * @franken/brain bumped from 0.8.0 to 0.8.1
    * @franken/critique bumped from 0.8.0 to 0.8.1
    * @franken/governor bumped from 0.6.0 to 0.6.1
    * @franken/observer bumped from 0.7.17 to 0.7.18
    * @franken/orchestrator bumped from 0.44.1 to 0.44.2
    * @franken/planner bumped from 0.4.15 to 0.4.16

## [0.2.11](https://github.com/djm204/frankenbeast/compare/franken-mcp-suite-v0.2.10...franken-mcp-suite-v0.2.11) (2026-07-14)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @franken/orchestrator bumped from 0.44.0 to 0.44.1

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
