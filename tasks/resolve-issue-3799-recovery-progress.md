# Issue #3799 exact-head recovery progress

- [x] Reconstruct local/remote/PR exact-head state and verify clean singular worktree ownership.
- [x] Confirm Git identity and current-head CI status.
- [x] Fetch and inspect all paginated current-head Codex review threads.
- [x] Add strict failing regression coverage for all nine seventh-round findings.
- [x] Implement the narrowest redaction fixes while preserving executable approval context.
- [x] Run focused and full Governor tests plus package typecheck, lint, and build.
- [x] Inspect the resulting diff for scope, security, and regression risk.
- [x] Commit with Conventional Commit format and push the existing branch only.
- [x] Reply to and resolve all nine seventh-round Codex threads.
- [x] Run a Codex CLI review, reproduce its line-leading header P1, and remediate it test-first without hiding shell commands.
- [x] Verify seventh-round repair head, local/remote equality, current-head CI, and zero unresolved threads.
- [x] Record the exact tier-12 review command/workdir handoff and block for fresh human authorization.
- [x] Confirm the authorized eighth exact-head review returned ten actionable P1 threads on head `50c68b07a81343c7c119b08d219b61a260ab89a3`.
- [x] Add and observe focused failing regressions for all ten eighth-round findings.
- [x] Apply narrow fixes that redact literals while preserving adjacent shell expressions and commands.
- [x] Run focused Governor tests plus package test, typecheck, lint, build, and diff/scope/identity gates.
- [ ] Commit conventionally and push only the existing branch.
- [ ] Reply to and resolve all ten eighth-round threads.
- [ ] Verify the new exact head, local/remote/PR equality, zero unresolved threads, and current-head CI state.
- [ ] Record the terminal handoff and stop before another Codex review or merge.

## Ninth-round local remediation

- [x] Add and observe a focused RED regression for curl userinfo passwords with active command substitutions, then make it GREEN.
- [x] Add and observe a focused RED regression for URL userinfo passwords with active command substitutions, then make it GREEN.
- [x] Add and observe a focused RED regression for ANSI-C quoted sensitive flag values, then make it GREEN.
- [x] Add and observe a focused RED regression for unmatched private-key markers at command newlines, then make it GREEN.
- [x] Add and observe a focused RED regression for YAML-looking shell text followed by an indented destructive command, then make it GREEN.
- [x] Add and observe focused RED regressions for established sensitive-key aliases without unrelated-word overmatching, then make them GREEN.
- [x] Add and observe focused RED regressions for structured header objects and tuple arrays, then make them GREEN.
- [x] Run the focused CLI-channel suite and inspect the final diff for scope and preserved shell context.
- [x] Add and observe a focused RED regression for punctuation-only dynamic curl/URL password fragments, then redact every literal fragment while preserving active expressions.
- [x] Add and observe a focused RED regression for destructive-looking YAML secret scalars, then fail closed while preserving only safe shell command/option structure.
- [x] Run both focused GREEN regressions and the full CLI-channel test file.
- [x] Add and observe focused RED regressions for auth-scheme password fragments, then separate password and header literal redaction.
- [x] Add and observe focused RED regressions for nested structured-header objects and quoted braces, then use a bounded balanced-object scanner.
- [x] Run the full Governor test, typecheck, lint, and build gates and obtain a clean local Codex review.

## Tenth-round local remediation

- [x] Confirm clean exact head `c7729592d0fd1e8b8355b8550d5fc8b04afa4835` and inspect the nine immutable current-head inline comments.
- [x] Observe RED then GREEN for preserving arbitrary command structure beneath YAML-looking sensitive headers.
- [x] Observe RED then GREEN for redacting assignment literals around active shell expansions.
- [x] Observe RED then GREEN for redacting query-parameter literals around active shell expansions.
- [x] Observe RED then GREEN for preserving active substitutions in standalone sensitive headers.
- [x] Observe RED then GREEN for preserving arbitrary newline commands after unmatched private-key markers.
- [x] Observe RED then GREEN for retaining over-depth structured objects without sensitive headers.
- [x] Observe RED then GREEN for complete redaction of diff-prefixed sensitive headers.
- [x] Observe RED then GREEN for CR-only armored private-key line endings.
- [x] Observe RED then GREEN for observer-aligned npm, Slack, GitLab, and Gemini standalone token families.
- [x] Run the complete focused CLI-channel test file after resolving interaction regressions.
- [x] Run the Governor package tests, typecheck, lint, and build.
- [x] Inspect the final diff, changed-file scope, and worktree/head state.

### Local Codex review P1 remediation

- [x] Observe RED then GREEN for fully hiding ordinary multi-word plaintext in sensitive YAML block scalars while retaining structurally identifiable arbitrary shell commands.
- [x] Observe RED then GREEN for password-literal treatment of authorization-scheme words around active expansions in complete and unterminated quoted assignments.
- [x] Run the complete focused CLI-channel test file (93/93 passing).
- [x] Run the Governor package tests (412/412), typecheck, lint (zero errors; three existing unrelated warnings), and build.
- [x] Inspect the final diff and confirm the changed-file scope remains limited to the existing issue #3799 files.

#### Final bounded P1 fix attempt

- [x] Slice 1 RED: argument-shaped YAML plaintext regression failed because `topsecret` was exposed for flag, URL, path, and assignment variants (1 failed; 93 skipped).
- [x] Slice 1 GREEN: remove weak command-path and argument-shape signals; retain explicit shell operators/expansions, the existing `*ctl` command-family signal, and established destructive command syntax (3 passed; 91 skipped).
- [x] Slice 2 RED: argumentless `shutdown`, `reboot`, and `mkfs` regression failed because all three command words were swallowed (1 failed; 94 skipped).
- [x] Slice 2 GREEN: exempt only the previously supported argumentless destructive command set from the token-count guard (4 passed; 91 skipped, including slice 1 and pipeline/service-manager coverage).
- [x] Run the complete focused CLI-channel test file (95/95 passing).
- [x] Run the Governor package tests (414/414), typecheck, lint (zero errors; three existing unrelated warnings), and build.
- [x] Inspect the final diff and confirm the changed-file scope remains limited to the existing issue #3799 source, test, and progress files.

##### Selected narrow service-manager policy

- [x] RED: add a regression proving sensitive YAML plaintext beginning with `productctl` remains fully hidden; the isolated run failed because the generic `*ctl` heuristic exposed that first word (1 failed; 95 skipped).
- [x] GREEN/policy: replace the generic `ctl` suffix heuristic with exact recognition of `systemctl`, the service-manager command required by the current finding; retain strong shell operators/expansions and established destructive-command handling unchanged (1 passed; 95 skipped).
- [x] Run the existing pipeline/service-manager/plaintext/argumentless compatibility set plus the new regression (6/6 passing).
- [x] Run the complete CLI-channel test file (96/96) and Governor package tests (415/415).
- [x] Run Governor typecheck, lint (zero errors; three existing unrelated warnings), and build successfully.

##### Two new actionable local-review findings

- [x] Slice 1 RED: extend the diff-prefixed sensitive-header regression with unspaced `+Authorization` and `-Cookie` forms; the isolated run exposed the complete bearer credential after partially redacting only its scheme (1 failed; 95 skipped).
- [x] Slice 1 GREEN: minimally allow zero or more spaces after a single diff prefix while preserving the prefix and fully hiding each credential (1 passed; 95 skipped).
- [x] Slice 2 RED: add a focused unmatched-private-key-marker regression using established argumentless `shutdown`, `reboot`, and `mkfs` commands across LF, CR, and CRLF; the isolated run failed because `shutdown` was swallowed (1 failed; 96 skipped).
- [x] Slice 2 GREEN: restore explicit argumentless destructive-command boundaries while retaining arbitrary commands with arguments and all three newline forms (3 passed; 94 skipped in the compatibility set).
- [x] Run the complete CLI-channel test file (97/97) and Governor package tests (416/416).
- [x] Run Governor typecheck, lint (zero errors; three existing unrelated warnings), and build successfully.
- [x] Confirm the changed-file scope remains limited to the existing issue #3799 source, test, and progress files.

##### Latest two actionable local-review findings

- [x] Slice 1 RED: add a sensitive-YAML regression with `systemctl poweroff` followed by three ordinary multi-word plaintext tokens; the isolated test failed because the first plaintext token remained visible.
- [x] Slice 1 GREEN: require concrete shell syntax independently on every preserved line, retaining only the established narrow `echo`/`printf` followup recognition inside an already recognized shell sequence; the focused pipeline, service-manager, plaintext, argumentless-destructive, and visible-followup compatibility set passed 8/8.
- [x] Slice 2 RED: add unmatched-private-key-marker regressions for `/usr/local/bin/deploy`, `./scripts/recover`, and `../bin/repair` with arguments across LF, CR, and CRLF; the isolated test failed because the absolute path command was swallowed.
- [x] Slice 2 GREEN: extend only the bounded newline lookahead's executable token to accept absolute and dot-relative paths while retaining the required same-line argument; the focused path-qualified, bare command-with-arguments, and argumentless-destructive compatibility set passed 4/4.
- [x] Run the complete CLI-channel test file (99/99) and Governor package tests (418/418).
- [x] Run Governor typecheck, lint (zero errors; three existing unrelated warnings), and build successfully.
- [x] Confirm the changed-file scope remains limited to the existing issue #3799 source, test, and progress files.

##### Final unmatched-private-key P1 narrow recognized-command policy

- [x] RED: add a regression proving generic lowercase plaintext plus another token after an unmatched private-key marker remains hidden; the isolated run failed as expected (1 failed; 99 skipped), exposing both plaintext tokens.
- [x] GREEN/policy: replace the generic bare-command-plus-argument newline lookahead with a bounded basename classifier for the selected service-manager and HTTP-client commands, Python interpreter variants, established destructive forms, and established `deploy`/`recover`/`repair` compatibility commands; apply the same recognition to bare, absolute, and dot-relative executable paths while retaining LF, CR, and CRLF scanning.
- [x] Run the new regression GREEN (1 passed; 99 skipped) and all unmatched-private-key compatibility tests (6 passed; 94 skipped).
- [x] Run the complete CLI-channel test file (100/100) and Governor package tests (419/419).
- [x] Run Governor typecheck, lint (zero errors; three existing unrelated warnings), and build successfully.
- [x] Confirm the changed-file scope remains limited to the existing issue #3799 source, test, and progress files.

##### Remaining sensitive-YAML shell-expression P1

- [x] RED: add a sensitive-YAML regression where ordinary plaintext `violetquartz` is followed by the active shell-expression-shaped token `$(reboot)`; the isolated run failed as expected (1 failed; 100 skipped) because the plaintext first token leaked.
- [x] GREEN/policy: remove shell-expression presence by itself from YAML command evidence, retaining the already selected exact `systemctl` and destructive-command policy plus explicit shell operator structure; the isolated regression passed (1 passed; 100 skipped).
- [x] Run all YAML-named compatibility tests (11/11) and the complete CLI-channel test file (101/101).
- [x] Run the Governor package tests (420/420), typecheck, lint (zero errors; three existing unrelated warnings), and build successfully.
- [x] Confirm the changed-file scope remains limited to the existing issue #3799 source, test, and progress files.

##### Remaining sensitive-YAML shell-punctuation P1

- [x] RED: add a sensitive-YAML regression where generic plaintext `violetquartz` is followed by standalone shell punctuation `;`; the isolated run failed as expected (1 failed; 101 skipped) because the first plaintext token remained visible.
- [x] GREEN/policy: remove shell punctuation by itself as sufficient command evidence and use only the selected bounded recognized-command classifier, retaining the established narrow `echo`/`printf` followups after recognized context; the isolated regression passed (1 passed; 101 skipped).
- [x] Run all YAML-named compatibility tests (12/12), including the existing curl-pipeline and `systemctl` service-manager cases, which remain visible because their command basenames are recognized.
- [x] Run the complete CLI-channel test file (102/102) and Governor package tests (421/421).
- [x] Run Governor typecheck, lint (zero errors; three existing unrelated warnings), and build successfully.
- [x] Confirm the changed-file scope remains limited to the existing issue #3799 source, test, and progress files.

##### Remaining local P2 filesystem-variant regression

- [x] RED: add focused sensitive-YAML regressions for argumentless `mkfs.ext4` and privilege-wrapper-prefixed `sudo mkfs.xfs`; the isolated run failed because the argument-count guard swallowed both recognized command contexts (1 failed; 102 skipped).
- [x] GREEN/policy: let only the downstream classifier's already recognized `mkfs` and `mkfs.<filesystem>` basename shape through the argument-count guard, without changing any other command recognition (1 passed; 102 skipped).
- [x] Run all YAML-named compatibility tests (13/13) and the complete CLI-channel test file (103/103).
- [x] Run Governor package tests (422/422), typecheck, lint (zero errors; three existing unrelated warnings), and build successfully.
- [x] Confirm the final diff remains limited to the existing issue #3799 source, test, and progress files.

## Eleventh exact-head review remediation (`69ee75a35`)

- [x] Slice 1 RED→GREEN: isolated test leaked both unquoted literal fragments (1 failed, 103 skipped); password-fragment redaction preserved `$(date)` and passed (1 passed, 103 skipped).
- [x] Slice 2 RED→GREEN: isolated multi-cookie test exposed the second and third cookies (1 failed, 104 skipped); standalone Cookie scanning consumed cookie separators and passed (1 passed, 104 skipped).
- [x] Slice 3 RED→GREEN: isolated signed/fractional/exponent JSON-number test exposed all numeric values (1 failed, 105 skipped); full JSON number grammar passed (1 passed, 105 skipped).
- [x] Slice 4 RED→GREEN: isolated newline-variant YAML test exposed CR-only block content (1 failed, 106 skipped); CRLF/LF/CR splitting passed all variants (1 passed, 106 skipped).
- [x] Slice 5 RED→GREEN: isolated curl ANSI-C argument test exposed the credential (1 failed, 107 skipped); whole-argument consumption passed (1 passed, 107 skipped).
- [x] Slice 6 RED→GREEN: isolated sensitive-flag test exposed `Basic` and `Bearer` literals (1 failed, 108 skipped); password-literal semantics preserved `$(date)` and passed (1 passed, 108 skipped).
- [x] Slice 7 RED→GREEN: isolated standalone Bearer test exposed suffixes and substitution-first credentials (1 failed, 109 skipped); expression-aware Bearer redaction passed (1 passed, 109 skipped).
- [x] Slice 8 RED→GREEN: isolated unspaced diff-assignment test exposed the added value (1 failed, 110 skipped); canonical `+`/`-` prefixes were preserved and passed (1 passed, 110 skipped).
- [x] Slice 9 RED→GREEN: isolated mismatched-END test exposed the entire bounded key block (1 failed, 111 skipped); plausible bounded mismatched-label fallback passed (1 passed, 111 skipped).
- [x] Slice 10 RED→GREEN: isolated unmatched-key recovery test returned more than `maxLength` before the marker (1 failed, 112 skipped); post-recovery slicing passed (1 passed, 112 skipped).
- [x] Slice 11 RED→GREEN: isolated nested-substitution test redacted the outer closing parenthesis (1 failed, 113 skipped); shared balanced expression scanning preserved the complete outer substitution and passed (1 passed, 113 skipped).
- [x] Run the focused compatibility set (52 passed, 62 skipped) and complete CLI-channel test file (114/114 passed).
- [x] Run all Governor tests (433/433), typecheck, lint (zero errors; three pre-existing warnings), build, and `git diff --check`.
- [x] Confirm changed-file scope is limited to the production file, test file, and this progress document.
- [x] Actionable local P1 RED: a focused standalone multi-cookie regression showed `&& echo visible_cookie_context` was consumed with the final cookie value (1 failed, 114 skipped).
- [x] Actionable local P1 GREEN: bound standalone Cookie matching to cookie `name=value` syntax and repeated semicolon-delimited pairs, preserving the explicit operator and full following command context (1 passed, 114 skipped).
- [x] Re-run cookie/header compatibility tests (27/27), the complete CLI-channel file (115/115), all Governor tests (434/434), typecheck, lint (zero errors; three pre-existing warnings), build, and `git diff --check`.
- [x] Remaining local P1 RED: a focused plan-diff regression across CRLF, LF, and CR exposed an unspaced canonical `+PASSWORD=...` value after prior visible context (1 failed, 115 skipped), while asserting the diff prefix and context must remain.
- [x] Remaining local P1 GREEN: make the sensitive-assignment key boundary explicitly consume CRLF, LF, or CR followed by an optional canonical `+`/`-` prefix; the focused regression passed all newline variants (1 passed, 115 skipped) without changing existing inline boundary alternatives.
- [x] Re-run diff/assignment compatibility tests (17/17), the complete CLI-channel file (116/116), all Governor tests (435/435), typecheck, lint (zero errors; three pre-existing warnings), build, and `git diff --check`.

## Twelfth exact-head review remediation (`4e857b0a`)

- [x] Finding 1 RED→GREEN: isolated regression exposed the second physical-line fragment (1 failed, 116 skipped); escaped-newline-aware quoted flag consumption hid both fragments and preserved the following command (1 passed, 116 skipped).
- [x] Finding 2 RED→GREEN: isolated regression leaked the second array element (1 failed, 117 skipped); a bounded quote-aware balanced-array scan hid the full value while retaining array delimiters and following command (1 passed, 117 skipped).
- [x] Finding 3 RED→GREEN: isolated regression truncated the substitution at a single-quoted `)` (1 failed, 118 skipped); quote-aware parenthesis balancing preserved the full executable substitution and hid both literal fragments (2 compatibility tests passed, 117 skipped).
- [x] Finding 4 RED→GREEN: isolated regression truncated the outer legacy substitution at an escaped inner backtick (1 failed, 119 skipped); bounded parity-aware closing-backtick scanning preserved its executable content and hid surrounding literals (1 passed, 119 skipped).
- [x] Finding 5 RED→GREEN: isolated regression stopped at `&&` inside a substitution and leaked the suffix (1 failed, 120 skipped); line-bounded scanning now ignores operators covered by balanced expression spans and preserves the complete substitution plus following command (1 passed, 120 skipped).
- [x] Finding 6 RED→GREEN: isolated regression leaked an empty-username URL password (1 failed, 121 skipped); userinfo matching now permits zero username characters while still requiring colon, non-empty password, `@`, and host (1 passed, 121 skipped).
- [x] Finding 7 RED→GREEN: isolated serialized-JSON regression leaked the value (1 failed, 122 skipped); an observer-aligned line-bounded escaped-delimiter matcher preserves the original slashes/quotes around `[REDACTED]` (1 passed, 122 skipped).
- [x] Finding 8 RED→GREEN: isolated serialized-PEM regression left the key markers/body visible (1 failed, 123 skipped); plausibility validation now normalizes literal escaped CR/LF separators only for validation, leaving rendered context handling unchanged (1 passed, 123 skipped).
- [x] Finding 9 RED→GREEN: isolated plan-diff regression leaked the prefixed block body (1 failed, 124 skipped); YAML scanning now separates canonical diff prefixes from indentation and emits a prefixed redaction placeholder per hidden body line (3 compatibility tests passed, 122 skipped).
- [x] Finding 10 RED→GREEN: isolated bounded incomplete object leaked its sensitive header value (1 failed, 125 skipped); the existing depth-aware object redactor now processes bounded unterminated remainders while unrelated incomplete objects stay unchanged (2 compatibility tests passed, 124 skipped).
- [x] Finding 11 RED→GREEN: isolated uppercase plural-key regression leaked all three values (1 failed, 126 skipped); exact plural vocabulary entries redact `SECRETS`, `TOKENS`, and `PASSWORDS` while unrelated longer words remain visible (1 passed, 126 skipped).
- [x] Finding 12 RED→GREEN: isolated regression left both established webhook URLs intact (1 failed, 127 skipped); observer-aligned Slack/Discord format matchers redact each complete webhook while preserving a non-webhook Discord URL and following command (1 passed, 127 skipped).
- [x] Run the complete CLI-channel test file (128/128 passed).
- [x] Run all Governor tests (447/447), package typecheck, lint (zero errors; three pre-existing unrelated warnings), build, and `git diff --check`.
- [x] Independently inspect the diff for secret leaks, hidden executable context, bounded scanning, synthetic fixtures, and allowed-file scope; only the production file, focused test file, and this progress document changed.

### Fresh uncommitted-review P1 remediation

- [x] Finding A RED: the isolated single-quoted sensitive-array regression failed (1 failed, 128 skipped) because literal `$(literal-secret)` content remained visible.
- [x] Finding A GREEN: retain array element quote context, fully redact single-quoted element content, and preserve active substitutions in unquoted and double-quoted elements (1 passed, 128 skipped).
- [x] Finding B RED: the isolated escaped-serialized-quote regression failed (1 failed, 129 skipped) because `secret-tail` remained visible after the first inner serialized quote.
- [x] Finding B GREEN: bounded line scanning consumes escaped serialized quote sequences before accepting the actual closing delimiter, preserving the serialized delimiters and following `$(date)` command context (1 passed, 129 skipped).
- [x] Run both new regressions together (2 passed, 128 skipped), all 130 CLI tests, all Governor tests (449/449), package typecheck, lint (zero errors; three pre-existing unrelated warnings), build, and `git diff --check`.
- [x] Inspect the final diff and focused prompt assertions: both literal secret suffixes are absent; array `$(date)`/`$(whoami)` and serialized-JSON `&& echo $(date)` context remain; changed-file scope is exactly the production file, focused test file, and this progress document.

### Second uncommitted-review P1 remediation

- [x] Finding C RED: the isolated triple-backslash serialized-JSON regression failed (1 failed, 130 skipped), with `synthetic-depth-secret` visible before the preserved `&& echo visible_multiply_serialized_context`.
- [x] Finding C GREEN: matching key/value delimiter escape depths and requiring the same depth at value close redacts the synthetic value while treating deeper escaped inner quotes as content; the serialized-JSON compatibility set passed (3 passed, 128 skipped).
- [x] Run the complete CLI-channel test file (131/131), all Governor tests (450/450), package typecheck, lint (zero errors; three pre-existing unrelated warnings), build, and `git diff --check`.
- [x] Confirm the synthetic secret suffix is absent, following executable context is preserved, and changed-file scope remains exactly the existing production file, focused test file, and progress document.

### Third uncommitted-review P2 remediation

- [x] RED: add a deterministic regression with 256 unterminated sensitive-array starts, one over-limit balanced candidate, and a following ordinary balanced array; the isolated run failed as expected (1 failed, 131 skipped) because the over-limit candidate was scanned and rendered as a balanced array.
- [x] GREEN: bound each sensitive-array candidate to 65,536 body characters plus a possible closing delimiter and its physical CR/LF line; the isolated regression passed (1 passed, 131 skipped), hiding all synthetic literals while preserving the following `&& echo visible_bounded_array_context`.
- [x] Run the complete CLI-channel test file (132/132), all Governor tests (451/451), package typecheck, lint (zero errors; three pre-existing unrelated warnings), and build successfully.
- [x] Run `git diff --check` and confirm the existing three-file scope, synthetic secret hiding, and preservation of `&& echo visible_bounded_array_context`.
- [x] Run a fresh final local Codex uncommitted review; no discrete correctness issue remained in the current diff.

## Thirteenth exact-head review remediation (`07a5dbcad1`)

- [x] Finding 3686161929 RED→GREEN: isolated query regression truncated at the substitution operator (1 failed, 132 skipped); bounded expression-aware scanning preserved `$(reboot;shutdown)`, redacted both literal fragments, and passed (1 passed, 132 skipped).
- [x] Finding 3686161935 RED→GREEN: isolated structured-header regression exposed number, boolean, and null values (1 failed, 133 skipped); direct bounded value-property redaction passed while preserving the sibling field (1 passed, 133 skipped).
- [x] Finding 3686161936 RED→GREEN: isolated Cookie regression truncated an active substitution at its semicolon (1 failed, 134 skipped); dynamic Cookie lines now defer to the balanced standalone-header scanner and pass with the following command intact (1 passed, 134 skipped).
- [x] Finding 3686161943 RED→GREEN: isolated assignment regression hid the substitution opener/first command at an internal semicolon (1 failed, 135 skipped); a bounded dynamic-assignment prepass preserved the complete substitution and redacted its surrounding literals (1 passed, 135 skipped).
- [x] Finding 3686161954 RED→GREEN: isolated alias regression exposed AUTH and COOKIE (1 failed, 136 skipped); exact vocabulary additions redact all three established aliases while AUTHOR, COOKIECUTTER, and PERSONAL_ACCESS_TOKENIZER remain visible (1 passed, 136 skipped).
- [x] Finding 3686161961 RED→GREEN: isolated inline-header regression hid `$(reboot)` (1 failed, 137 skipped); expression-aware literal redaction preserves the active substitution and following URL/command (1 passed, 137 skipped).
- [x] Finding 3686161964 RED→GREEN: isolated multiline-array regression exposed both literal elements after replacing only the assignment opener (1 failed, 138 skipped); the existing 65,536-character balanced scan now crosses physical lines and redacts quoted/unquoted elements while preserving `$(date)` and the following command (1 passed, 138 skipped).
- [x] Finding 3686161966 RED→GREEN: isolated added-key regression left the complete markers/body visible (1 failed, 139 skipped); plausibility validation strips only a consistent context/add/remove prefix per nonempty body line and emits `+[REDACTED]` with following diff context intact (1 passed, 139 skipped).
- [x] Finding 3686161969 RED→GREEN: isolated mixed-prefix YAML regression exposed removed, added, and context body values (1 failed, 140 skipped); per-line diff-marker separation keeps all three body forms associated with the sensitive block and preserves the following safe context (1 passed, 140 skipped).
- [x] Finding 3686161972 RED→GREEN: isolated spoof regression exposed the literal following `[REDACTED]` (1 failed, 141 skipped); standalone headers now scan to a genuine external shell boundary before collapsing the complete value, while a marker-only value remains stable (1 passed, 141 skipped).
- [x] Finding 3686161977 RED→GREEN: isolated valid-JSON regression exposed string and numeric values under `pass\u0077ord` and `api\u005fkey` (1 failed, 142 skipped); bounded quoted-key escape decoding classifies them while preserving the original serialized key spelling and safe sibling (1 passed, 142 skipped).
- [x] Finding 3686161981 RED→GREEN: isolated literal/control ANSI regression exposed both sensitive values (1 failed, 143 skipped); key tokenization now accepts supported SGR sequences between characters, after which existing normalization redacts PASSWORD/API_KEY without overmatching COLORWAY (1 passed, 143 skipped).
- [x] Resolve two array interaction regressions, then run the complete CLI-channel file (144/144), all Governor tests (463/463), typecheck, lint (zero errors; three pre-existing unrelated warnings), build, and `git diff --check`.
- [x] Inspect the final diff for credential exposure, preserved executable context, bounded scans, and scope; exactly the production file, focused test file, and this progress document are modified.

### Follow-up narrowly scoped acceptance gaps

- [x] YAML diff-prefix slice RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "retains ordinary YAML indentation while redacting a one-space sensitive block body"` failed as expected (1 failed, 144 skipped), exposing `|  secret`.
- [x] YAML diff-prefix slice GREEN: the same isolated command passed (1 passed, 144 skipped); `-t "YAML|block scalar|diff-prefix"` passed the relevant compatibility selection (18 passed, 127 skipped).
- [x] Structured-header collection slice RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "redacts complete direct array and object values in sensitive structured headers"` failed as expected (1 failed, 145 skipped), exposing the complete `["Bearer","opaque"]` value while only nested generic redaction touched the object form.
- [x] Structured-header collection slice GREEN: the same isolated command passed (1 passed, 145 skipped); `-t "structured|bounded incomplete"` passed the relevant compatibility selection (8 passed, 138 skipped).
- [x] Run the complete CLI-channel file (146/146), all Governor tests (465/465 across 25 files), package typecheck, lint (zero errors; three pre-existing unrelated warnings), build, and `git diff --check`; confirm exactly the production file, focused test file, and this progress document are modified.

### Fresh array-substitution P1 follow-up

- [x] Strict RED→GREEN: the isolated synthetic `printf '%s' harmless-argument` array regression first failed (1 failed, 146 skipped) because quote-oriented scanning hid the executable substitution; consuming balanced shell-expression spans before interpreting element quotes preserved the complete substitution and redacted both surrounding literals (1 passed, 146 skipped). Array/substitution compatibility passed 23/23, the complete CLI-channel file passed 147/147, all Governor tests passed 466/466 across 25 files, package typecheck/build passed, lint reported zero errors and the same three pre-existing unrelated warnings, `git diff --check` passed, and changed-file scope remained exactly the production file, focused test file, and this progress document.

### Bounded sensitive-query P1 follow-up

- [x] RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "redacts over-cap sensitive query values through their real boundary"` failed as expected (1 failed, 147 skipped). Expected `token=[REDACTED]$(reboot;shutdown)[REDACTED]&safe=visible`; received `token=[REDACTED]}violetquartz$(reboot;shutdown)amberstone&safe=visible`, proving the 65,536-character scan cap was returned as a false value boundary and the credential suffix survived unchanged.
- [x] GREEN: replace the false cap boundary with a constant-state 65,536-character chunk scan that carries balanced-expression state between chunks and returns only a real external boundary. The isolated regression, including an expression opener split across the chunk boundary, passed (1 passed, 147 skipped); the initial query/assignment/header boundary compatibility selection passed (4 passed, 144 skipped).
- [x] Final verification: `-t "query|boundary|operator|substitution|escaped dollar expansion markers"` passed 31/31 relevant compatibility tests; the complete CLI-channel file passed 148/148; all Governor tests passed 467/467 across 25 files; package typecheck and build passed; lint passed with zero errors and the same three pre-existing unrelated warnings. `git diff --check`, `git status --short`, and `git diff --name-only` confirm exact scope remains the existing production file, focused test file, and this progress document.
