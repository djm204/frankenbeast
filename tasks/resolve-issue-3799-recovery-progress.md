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

## Trigger-14 exact-head remediation (`256471568a`)

- [x] Finding 1 RED→GREEN: aggregate isolated RED reported this named test failed because the unmatched marker remained; focused GREEN preserves `terraform destroy -auto-approve` and `aws s3 rm ... --recursive` after one `[REDACTED]` marker.
- [x] Finding 2 RED→GREEN: aggregate isolated RED received `[REDACTED];shutdown)...`; focused GREEN preserves the complete balanced substitution in an unquoted sensitive flag and redacts both literal fragments.
- [x] Finding 3 RED→GREEN: aggregate isolated RED received `Bearer [REDACTED];shutdown)...`; focused GREEN preserves the complete balanced substitution and following `&& echo` context.
- [x] Finding 4 RED→GREEN: aggregate isolated RED received `Authorization:[REDACTED];shutdown)...`; focused GREEN preserves the complete inline-header substitution and following URL.
- [x] Finding 5 RED→GREEN: aggregate isolated RED received `alice:[REDACTED];shutdown)...`; focused GREEN preserves the complete curl-password substitution and following URL.
- [x] Finding 6 RED→GREEN: aggregate isolated RED collapsed the structured-header string to `[REDACTED]`; focused GREEN retains `$(reboot;shutdown)` between redacted literal fragments.
- [x] Finding 7 RED→GREEN: aggregate isolated RED collapsed the escaped JSON value to `[REDACTED]`; focused GREEN retains the executable substitution between matching escaped delimiters.
- [x] Finding 8 RED→GREEN: aggregate isolated RED exposed the synthetic UPN password; focused GREEN preserves `user@example.com:` and replaces only its password.
- [x] Finding 9 RED→GREEN: aggregate isolated RED exposed both array elements; focused GREEN uses the existing 65,536-character/depth-64 balanced collection scanner for sensitive arrays and objects.
- [x] Finding 10 RED→GREEN: aggregate isolated RED stopped at the case arm's `)` and hid `reboot;; esac`; focused GREEN retains the complete case-containing command substitution.
- [x] Finding 11 RED→GREEN: aggregate isolated RED left the credential after non-Basic/Bearer schemes; focused GREEN covers Basic, Bearer, Digest, OAuth, HOBA, Mutual, Negotiate, VAPID, SCRAM-SHA-256, and AWS4-HMAC-SHA256.
- [x] Finding 12 RED→GREEN: aggregate isolated RED exposed the first PowerShell fixture; focused GREEN covers `$env:`, case-insensitive `$Env:`, and ordinary `$NAME` assignments while preserving prefixes/quotes.
- [x] Finding 13 RED→GREEN: aggregate isolated RED hid `$(cat` and left a broken suffix; focused GREEN retains the full substitution-first assignment and following command.
- [x] Finding 14 RED→GREEN: aggregate isolated RED exposed the second physical-line literal; focused GREEN consumes the escaped LF as part of the unquoted value and preserves the following command.
- [x] Finding 15 RED→GREEN: aggregate isolated RED exposed the more-indented continuation; focused GREEN redacts it until indentation returns to the property level and preserves the safe sibling.
- [x] Finding 16 RED→GREEN: aggregate isolated RED exposed the scalar append; focused GREEN covers direct scalar, `declare` scalar, and balanced array `+=` assignments.
- [x] RED command evidence: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "general command-shaped|balances substitutions|structured-header string|escaped JSON assignments|UPN usernames|collection-valued|case-pattern|all supported multi-token|PowerShell environment|substitution-first|escaped physical|continued YAML plain|Bash append"` failed with all 16 new named regressions failing (16 failed, 2 selected compatibility tests passed, 146 skipped).
- [x] GREEN command evidence: the identical focused command passed all selected tests (18 passed, 146 skipped).
- [x] Run the complete CLI-channel test file (164/164 passed) and all `@franken/governor` tests (483/483 across 25 files).
- [x] Run `@franken/governor` typecheck, lint (zero errors; the same three unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`), and build plus `git diff --check`; all passed.
- [x] Inspect exact changed-file scope and diff for hidden commands, leaked fixture literals, bounded scans, false-positive concealment, and unrelated edits; scope is exactly the production redactor, focused CLI test, and this existing progress document, all credential fixtures are synthetic, collection scans retain the existing 65,536-character/depth-64 bounds, executable contexts remain asserted, and general unmatched-key command recognition is isolated from YAML plaintext classification.

### Local Codex review P1 follow-up

- [x] Case-pattern RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "parses quoted multi-pattern case terminators inside command substitutions"` failed as expected (1 failed, 164 skipped), receiving `PASSWORD="[REDACTED]"$x" in x|y) reboot;; esac)quartz"` and proving the arm terminator concealed executable body context.
- [x] PowerShell quoted-escape RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "consumes PowerShell-native escapes in quoted assignment values"` failed as expected (1 failed, 165 skipped), receiving `$env:PASSWORD='[REDACTED]''quartz' && echo visible_single_quote_context` and proving a doubled single quote left the credential suffix visible.
- [x] Focused GREEN: recognize quoted, escaped, whitespace-separated, and `|`-separated case patterns while rejecting unquoted command separators; scan double-quoted sensitive assignments through balanced shell expressions with the existing 65,536-character chunked boundary scanner; consume PowerShell doubled-single-quote and backtick escapes. The combined isolated selection passed (2 passed, 164 skipped), and the expanded case-only selection covering `x|y` plus `x | "y z" ` passed (1 passed, 165 skipped).
- [x] Verification GREEN: the complete CLI-channel file passed 166/166; all Governor tests passed 485/485 across 25 files; package typecheck and build passed; lint passed with zero errors and the same three unrelated warnings. `git diff --check` passed, and `git status --short`, `git diff --name-only`, and exact-hunk inspection confirm scope remains exactly the existing production redactor, focused CLI test, and this progress document; executable shell context remains asserted and the new quoted-assignment scan reuses the constant-state 65,536-character chunk traversal.

### Second local Codex review P1 follow-up

- [x] Focused synthetic RED first: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "ordinary case and in command arguments|executable interpolation in double-quoted PowerShell assignments"` failed exactly both new tests (2 failed, 166 skipped). Both `PASSWORD="violet$(echo case in foo)quartz"` and `$env:PASSWORD="violet$(reboot)quartz"` collapsed to a quoted `[REDACTED]`, concealing their complete executable substitutions.
- [x] Narrow GREEN: case-arm recognition now requires a command-boundary `case`, a single quoted/escaped shell word, and the `in` reserved word, while tracking nested `case`/`esac` closure; ordinary `echo case in foo` no longer impersonates a case header. PowerShell double-quoted values now redact only literal fragments around balanced executable substitutions, while single-quoted values remain wholly literal.
- [x] Focused compatibility GREEN: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "ordinary case and in command arguments|executable interpolation in double-quoted PowerShell assignments|case-pattern terminators|PowerShell-native escapes"` passed 4/4 selected tests (164 skipped), covering the two regressions plus existing simple/quoted/multi/whitespace case patterns and PowerShell-native quote escapes.
- [x] Verification GREEN: the complete CLI-channel file passed 168/168; all Governor tests passed 487/487 across 25 files; package typecheck and build passed; lint passed with zero errors and the same three unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] Final scope and hygiene inspection: `git diff --check` passed; `git status --short`, `git diff --name-only`, and changed-hunk inspection confirm the same exact three-file scope, with no GitHub mutation and no edits outside the production redactor, focused CLI test, and this progress document.

### Third local Codex review YAML-continuation follow-up

- [x] Focused synthetic RED first: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "sibling YAML mapping keys|physical line delimiters exactly"` failed both new tests (2 failed, 168 skipped). The list-item mapping received `- password: [REDACTED]\n  [REDACTED]`, concealing `command: reboot`, and unchanged mixed CRLF/lone-CR input was normalized to LF.
- [x] Narrow GREEN: preserve captured CRLF/LF/lone-CR separator tokens while replacing only continuation line bodies; stop continuation scanning at syntactic quoted or unquoted YAML mapping entries, including list-item mapping siblings. Make the preceding block-scalar pass a true no-op when no block-scalar header exists so it cannot pre-normalize plain-scalar input.
- [x] Focused GREEN: the identical two-test command passed (2 passed, 168 skipped). An intermediate run after the continuation-only change passed the sibling-mapping test but kept the delimiter test RED (1 passed, 1 failed, 168 skipped), directly identifying the unconditional block-scalar pass; the final narrow no-op guard resolved it.
- [x] YAML compatibility GREEN: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "YAML|block scalar|physical line delimiters"` passed 20/20 selected tests (150 skipped), covering sibling mappings, continued scalars, block scalars, diff prefixes, and CRLF/LF/lone-CR variants.
- [x] Verification GREEN: the complete CLI-channel file passed 170/170; all Governor tests passed 489/489 across 25 files; package typecheck and build passed; lint passed with zero errors and the same three unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] Final scope and hygiene inspection: `git diff --check` passed; `git status --short`, `git diff --name-only`, and exact changed-hunk inspection confirm the same three-file scope: the production redactor, focused CLI-channel test, and this existing progress document.

### Fourth local Codex review shell-parser follow-up

- [x] Focused synthetic RED first: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "every valid Bash case arm terminator|case-pattern parsing work linear|PowerShell backticks as escapes"` failed all three selected tests (3 failed, 170 skipped). The `;&`/`;;&` fixture stopped after the next arm, the bounded repeated-arm fixture stopped after its first arm, and `$env:PASSWORD="violet`nquartz`nstone"` exposed escaped suffixes as `$env:PASSWORD="[REDACTED]`nquartz`[REDACTED]"`.
- [x] Narrow parser GREEN: use a single forward lexical case-state pass per substitution, record actual pattern-closing `)` positions, transition arms for all Bash terminators (`;;`, `;&`, and `;;&`), and close `esac` without another prefix scan. Use a PowerShell-specific double-quoted fragment scanner that consumes backtick escapes as literal secret content, never pairs backticks as a Bash expression, and preserves only balanced, unescaped `$()` interpolation.
- [x] Deterministic complexity guard GREEN: a 2,048-arm synthetic input counts characters requested through `String.prototype.slice` and requires work no greater than 64 times input length, avoiding wall-clock assertions while guarding the parser behavior well below the existing 65,536-character sensitive-value bound.
- [x] Focused and sibling-form GREEN: the new three-test selection passed 3/3; the expanded `case|PowerShell|backtick|substitution` compatibility selection passed 34/34; the complete CLI-channel file passed 173/173.
- [x] Verification GREEN: all Governor tests passed 492/492 across 25 files; package typecheck and build passed; lint passed with zero errors and the same three unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] Final `git diff --check`, exact changed-hunk review, `git status --short`, and `git diff --name-only` passed; scope remains exactly the production redactor, focused CLI-channel test, and this progress document.

### Fifth local Codex review unquoted PowerShell follow-up

- [x] Focused synthetic RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "preserves complete unquoted PowerShell command substitutions"` failed as expected (1 failed, 173 skipped), receiving `$env:PASSWORD=$[REDACTED]$` for `$env:PASSWORD=$(reboot)`.
- [x] Narrow GREEN: replace the whitespace-only unquoted PowerShell value match with the existing balanced, chunked shell-value boundary scanner; classify only actual `'`, `$'`, and `"` openers as quotes, preserving complete `$()` values with internal spaces and redacting only adjacent literal fragments.
- [x] Focused sibling-form GREEN: the new regression plus PowerShell environment-variable, native quoted-escape, double-quoted interpolation/backtick, and substitution-first assignment compatibility tests passed 6/6 selected tests (168 skipped).
- [x] Verification GREEN: complete CLI-channel tests passed 174/174; all Governor tests passed 493/493 across 25 files; typecheck and build passed; lint passed with zero errors and the same three pre-existing unrelated warnings; `git diff --check` passed.
- [x] Final scope/diff inspection confirms only the existing production redactor, focused CLI-channel test, and this Trigger-14 progress document are modified; the reported `$env:`/ordinary-variable forms, internal-space substitution, adjacent literal-fragment redaction, following command context, and quoted sibling forms are all asserted or covered.

### Sixth local Codex review PowerShell trailing-backslash follow-up

- [x] Focused synthetic RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "trailing backslashes as literals in PowerShell quoted assignments"` failed as expected (1 failed, 174 skipped), receiving `$env:PASSWORD=[REDACTED]` for the single-quoted fixture and concealing `; reboot`.
- [x] Narrow GREEN: stop treating backslash as an escape in PowerShell quoted values while retaining backtick escape handling for double-quoted strings and doubled-single-quote handling for single-quoted strings.
- [x] Focused sibling-form GREEN: the new single- and double-quoted trailing-backslash regression plus the native quoted-escape and backtick compatibility tests passed 3/3 selected tests (172 skipped).
- [x] Verification GREEN: complete CLI-channel tests passed 175/175; all Governor tests passed 494/494 across 25 files; package typecheck and build passed; lint passed with zero errors and the same three pre-existing unrelated warnings; `git diff --check` passed.
- [x] Final `git status --short`, `git diff --name-only`, `git diff --stat`, and exact changed-hunk inspection confirm the unchanged three-file scope: the production redactor, focused CLI-channel test, and this Trigger-14 progress document. Both quoted fixtures assert that only the assigned value is redacted and the following `; reboot` remains visible.

### Seventh local Codex review boundary follow-up

- [x] Add synthetic LF/CRLF/lone-CR command-preservation regressions for even Bash backslash runs and unquoted PowerShell backtick-newline escapes, while retaining balanced unescaped `$()` interpolation coverage.
- [x] Focused RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "even Bash backslash runs|PowerShell boundaries after backtick-newline"` failed both selected tests (2 failed, 175 skipped). The Bash fixture received `PASSWORD=[REDACTED] -rf ...`, concealing the leading `rm`, and the PowerShell fixture retained the escaped physical newline because the Bash backtick-substitution state stopped at that boundary.
- [x] Narrow implementation: consume Bash backslash-newline only when the full backslash run is odd; scan unquoted PowerShell values separately with constant state, treating backticks as single-character/physical-newline escapes and retaining only balanced unescaped `$()` spans.
- [x] Focused and sibling GREEN: the two new regressions plus escaped Bash physical newlines, complete unquoted PowerShell substitutions, PowerShell quoted backticks, and PowerShell trailing-backslash behavior passed 7/7 selected tests (170 skipped).
- [x] Verification GREEN: the complete CLI-channel file passed 177/177; all Governor tests passed 496/496 across 25 files; package typecheck and build passed; lint passed with zero errors and the same three pre-existing unrelated warnings.
- [x] Final hygiene and scope: `git diff --check` passed; exact changed-hunk review confirms the parity gate and PowerShell scanner are localized, every new credential/command fixture is synthetic, and `git status --short`, `git diff --name-only`, and `git diff --stat` confirm the unchanged exact three-file scope.

### Eighth local Codex review case-reserved-word follow-up

- [x] Add the reported `echo esac` case-body regression and sibling `printf %s esac` / `command echo esac` argument forms, requiring preservation of the full executable substitution.
- [x] Focused RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "does not treat esac command arguments as case reserved-word terminators"` failed as expected (1 failed, 177 skipped), receiving `PASSWORD="[REDACTED]$(case x in x) echo esac;; y)[REDACTED]"` and concealing `reboot;; esac)`.
- [x] Narrow GREEN: require body-phase `esac` to begin at the scanner's existing shell command/reserved-word boundary. The focused case-parser selection passed 5/5 (173 skipped), covering the reported and sibling argument forms, quoted/multi-pattern arms, every Bash arm terminator, ordinary `case` arguments, and the deterministic linear-work guard.
- [x] Verification GREEN: the complete CLI-channel file passed 178/178; all Governor tests passed 497/497 across 25 files; package typecheck and build passed; lint passed with zero errors and the same three pre-existing unrelated warnings; `git diff --check` passed.
- [x] Final scope/hunk inspection: `git status --short`, `git diff --name-only`, and `git diff --stat` confirm the unchanged exact three-file scope (production redactor, focused CLI test, and this Trigger-14 progress document). The eighth-review production delta is only the existing command-boundary predicate on body-phase `esac`; the test delta contains the exact reported expression and two sibling command-argument forms. No GitHub or out-of-scope mutation was performed.

### Ninth local Codex review many-substitution complexity follow-up

- [x] Deterministic RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "keeps case-pattern parsing work linear across many command substitutions"` failed as expected (1 failed, 178 skipped). The 4,119-character input required 4,206,592 case-scanner character classifications, exceeding the 65,904-character guard while output correctness remained intact.
- [x] Linear implementation: replace the suffix-wide terminator set with a constant-state case-pattern tracker consumed by each expression's existing forward matching scan. `shellExpressionSpans` and `shellValueBoundary` now perform no case-parser suffix rescan, and Bash `;;`, `;&`, and `;;&` recognition uses bounded lookahead without substring allocation.
- [x] Focused GREEN: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "case-pattern|balanced nested|case and in command arguments|esac command arguments|many command substitutions"` passed all 6 selected complexity, nested-substitution, case-arm, and reserved-word regressions (173 skipped).
- [x] Verification GREEN: the complete CLI-channel file passed 179/179; all Governor tests passed 498/498 across 25 files; package typecheck and build passed; lint passed with zero errors and the same three pre-existing unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`; `git diff --check` passed.
- [x] Final scope/diff inspection: `git status --short`, `git diff --name-only`, `git diff --stat`, and targeted ninth-remediation hunk review confirm the unchanged exact three-file scope: the production redactor, focused CLI test, and this Trigger-14 progress document. The ninth-review delta removes both calls that rescanned remaining suffixes, shares the constant-state tracker across the existing forward expression scans, and adds only the deterministic 1,024-substitution work guard plus this evidence. No prohibited repository or GitHub mutation was performed.

### Tenth local Codex review escaped-case-pattern follow-up

- [x] Focused RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "parses escaped case-pattern characters inside command substitutions"` failed as expected (1 failed, 179 skipped). For `PASSWORD="violet$(case x in x\)) reboot;; esac)quartz"`, expected `PASSWORD="[REDACTED]$(case x in x\)) reboot;; esac)[REDACTED]"` but received `PASSWORD="[REDACTED]$(case x in x\))[REDACTED]"`, proving the executable substitution was truncated after the escaped pattern character.
- [x] Narrow GREEN: when `shellExpressionSpans` advances over a backslash escape, advance the case-pattern tracker over the same escaped character before incrementing the expression index. The identical focused command passed (1 passed, 179 skipped).
- [x] Case-pattern compatibility GREEN: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "case-pattern|ordinary case and in command arguments|esac command arguments"` passed all 6 selected tests (174 skipped), covering escaped, quoted, multi-arm, complexity, and reserved-word compatibility.
- [x] Continuation full-suite RED: the complete CLI-channel file exposed two fallback-pass interactions (2 failed, 181 passed): substitution-first standalone Bearer and balanced unquoted curl credentials were reprocessed after the balanced prepasses.
- [x] Continuation GREEN: skip only already-balanced or already-redacted-and-balanced credentials in the Bearer/curl fallback passes. The focused pair passed 2/2; the complete CLI-channel file passed 183/183 and all Governor tests passed 502/502 across 25 files.
- [x] Package verification: Governor typecheck, lint (zero errors; the same three pre-existing unrelated warnings), build, and `git diff --check` passed.
- [x] Independent local Codex review was attempted with both `codex review --uncommitted` and an ephemeral read-only `codex exec`; the installed CLI could not initialize its app-server client because the externally enforced filesystem sandbox makes its state directory read-only. No GitHub review was triggered.

## Canonical closeout continuation

- [x] Reconfirm the exact canonical worktree, existing branch `resolve/issue-3799-redact-governor-cli-prompt`, unchanged base/local/origin head `256471568a4d4a258f1b3564c27d476b4882a389`, requested Git identity, and exact three-file uncommitted scope.
- [x] Re-run the minimum preserved-state integrity gates: CLI-channel tests passed 183/183, all Governor tests passed 502/502, typecheck and build passed, lint reported zero errors and the same three pre-existing unrelated warnings, and `git diff --check` passed.
- [x] Re-read the live PR #3897 review-thread state and confirm the 16 Trigger-14 threads remain unresolved on the current head before publication.
- [ ] Commit and push the replacement head. Blocked in this runtime because the canonical worktree's Git administrative directory `/home/pfkagent/dev/frankenbeast/.git/worktrees/t_0b4dcbaa` is externally mounted read-only, so Git cannot create `index.lock`; no alternate branch, worktree, checkout, or remote-only commit was created.
- [ ] Reply to and resolve the 16 current-head review threads, then verify local/origin/live PR head equality, current-head CI, and exhaustively paginated zero unresolved threads.
- [ ] Record the exact tier-24 Approval Cop handoff on `t_e8da5db0` and root `t_7406290d`. The same runtime exposes the Hermes state directory read-only (`/home/pfkagent/.hermes/kanban.db.init.lock` cannot be created), and no `approval-cop` executable is installed, so neither Kanban record was mutated.

## Current-head seven-finding remediation (`30de291cfa3d6747629b84e764f1b20f68c74670`)

- [x] Finding 1 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "preserves active substitutions inside sensitive JSON collections"` failed as expected (1 failed, 183 skipped), receiving `{"password":[REDACTED],"safe":"visible"}` and proving the complete active-expression-bearing collection was concealed.
- [x] Finding 1 GREEN: the identical focused command passed (1 passed, 183 skipped) after reusing bounded shell-expression spans to preserve JSON structure and executable spans while replacing literal value fragments.
- [x] Finding 2 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "retains later general command-shaped lines after YAML shell context is established"` failed as expected (1 failed, 184 skipped); the prompt retained the establishing `systemctl` line but omitted the later `terraform` line.
- [x] Finding 2 GREEN: the identical focused command passed (1 passed, 184 skipped) after allowing the existing bounded general-command classifier only within already-established YAML shell context; operands remain redacted.
- [x] Finding 3 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "classifies percent-encoded URL query keys while preserving their spelling"` failed as expected (1 failed, 185 skipped), leaving the synthetic query credential visible.
- [x] Finding 3 GREEN: the identical focused command passed (1 passed, 185 skipped) after accepting complete percent bytes in the bounded key token and decoding only a classification copy; `access%5Ftoken` remains unchanged in output.
- [x] Finding 4 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "locates URL userinfo authority separators outside balanced substitutions"` failed as expected (1 failed, 186 skipped), leaving the synthetic password unchanged because whitespace and an internal `@` stopped the regex.
- [x] Finding 4 GREEN: the identical focused command passed (1 passed, 186 skipped) after reusing the balanced shell-value boundary scanner to locate only an authority `@` outside the substitution and redact literal fragments around the preserved expression.
- [x] Finding 5 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "consumes mixed quoted and unquoted sensitive assignment shell words"` failed as expected (1 failed, 187 skipped), redacting only the first unquoted fragment and exposing all later quoted/unquoted fragments.
- [x] Finding 5 GREEN: the identical focused command passed (1 passed, 187 skipped) after a bounded full-shell-word prepass reused balanced expression spans and existing quote-aware fragment redaction; unquoted/double-quoted substitutions remain visible, while single-quoted substitution text is redacted as literal.
- [x] Finding 6 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "redacts bounded Bash indexed and associative array-element assignments"` failed as expected (1 failed, 188 skipped), exposing both synthetic assigned values.
- [x] Finding 6 GREEN: the identical focused command passed (1 passed, 188 skipped) after recognizing only identifier bases and at most 256 identifier/number characters in indexed or quoted associative subscripts, classifying both base and key, and reusing balanced value scanning.
- [x] Finding 7 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "redacts attached curl short-option credentials without matching longer options"` failed as expected (1 failed, 189 skipped), exposing both attached synthetic passwords.
- [x] Finding 7 GREEN: the identical focused command passed (1 passed, 189 skipped) after adding a token-boundary-anchored `-u`/`-U` attached-argument pass that reuses balanced password scanning and does not match the unrelated `--user-agent` option.
- [x] Interaction repair: the first complete CLI-channel run found five regressions caused by the mixed-word prepass intercepting pure/unterminated quotes, ANSI-C quotes, and arrays (5 failed, 185 passed). Narrowing it to actual concatenated words and stopping at physical newlines restored the focused compatibility selection (7 passed, 183 skipped) without weakening the new mixed-word regression.
- [x] Complete CLI-channel verification: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts` passed 190/190.
- [x] Full Governor verification: `npm test --workspace @franken/governor` passed 509/509 across 25 files.
- [x] Package typecheck passed; lint passed with zero errors and the same three pre-existing unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] `git diff --check` passed, and status/name inspection confirmed exact scope is the production redactor, focused CLI-channel test, and this existing progress document.

### Local Codex review P1 over-cap mixed-word follow-up

- [x] Add one deterministic focused regression for a mixed quoted/unquoted sensitive shell word whose quoted credential suffix begins beyond the 65,536-character scan cap, requiring fail-closed concealment through the physical line while preserving the following line.
- [x] Isolated RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "fails closed for over-cap mixed sensitive assignment shell words"` failed as expected (1 failed, 190 skipped). Expected `PASSWORD=[REDACTED]` before the newline; received `PASSWORD=[REDACTED]"violetquartz"`, proving the quoted credential suffix beyond the cap was appended verbatim.
- [x] Implement the narrowest bounded, constant-state fail-closed correction: when the bounded mixed-word scan reaches its cap without proving a real boundary, emit one redaction marker and advance to the next CR/LF (or end of input). This retains no over-cap credential content or growing parser state; cursor advancement makes affected physical-line regions disjoint.
- [x] Identical focused GREEN: the exact isolated command passed (1 passed, 190 skipped).
- [x] Related compatibility GREEN: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "over-cap|mixed quoted and unquoted"` passed all 3 selected tests (188 skipped), covering the new fail-closed case, the existing in-cap mixed-word behavior, and the existing chunked over-cap query boundary behavior.
- [x] Complete CLI-channel GREEN: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts` passed 191/191.
- [x] Rationale: a scan cap is not evidence of a credential boundary. The safe bounded response is therefore to withhold the uncertain remainder of that physical line, without accumulating the over-cap value or attempting an unbounded parse; the next physical line remains unchanged.
- [x] Final hygiene: `git diff --check` passed. `git status --short`, `git diff --name-only`, and hunk inspection confirm the requested unchanged three-file scope: the existing production redactor, focused CLI-channel test, and this progress document. No commit, push, GitHub mutation, or secret read was performed.
- [x] Independent terminal verification after the local-review fix: complete CLI-channel tests passed 191/191; all Governor tests passed 510/510 across 25 files; package typecheck and build passed; lint passed with zero errors and the same three pre-existing unrelated warnings; `git diff --check` passed.
- [x] Final local `codex review --uncommitted` returned: “No discrete correctness issue was identified in the modified code.”

### Current-head CI bounded-array performance regression

- [x] CI evidence: live run `30596235656`, rerun job `91050026253`, timed out in `@franken/governor` on all three retries at the unchanged 5,000 ms timeout while running `bounds sensitive array scans while continuing after unterminated candidates`. The focused test passed locally before the fix but took about 1.3–1.45 seconds in the reported reproduction, leaving insufficient margin under monorepo CI load.
- [x] Deterministic instrumentation: add an optional scan-metrics object to `redactSecrets` and count only entries into the expensive `shellExpressionSpans` call in `redactMixedShellWordAssignments`; the assertion is an operation bound, not a wall-clock threshold.
- [x] Focused RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "bounds sensitive array scans while continuing after unterminated candidates"` failed as expected (1 failed, 190 skipped) with `expected 0, received 258`. The test body took 850 ms locally, proving all 258 Bash-array candidates performed an irrelevant mixed-word expression scan before the dedicated array pass.
- [x] Narrow production fix: check the already-located value's first character and immediately leave `(` candidates to `redactSensitiveArrayAssignments` before allocating the bounded slice or invoking `shellExpressionSpans`. The dedicated Bash indexed/associative array-element pass retains its existing early base/subscript sensitivity classification before its balanced value scan.
- [x] Identical focused GREEN and original bounded-array behavior: the exact RED command passed (1 passed, 190 skipped), the operation count was zero, all existing output assertions remained unchanged, and the test body took 123 ms locally. The existing 5,000 ms timeout was neither weakened nor increased.
- [x] Seven-finding and fail-closed compatibility GREEN: the exact-name selection for all seven current-head finding regressions plus `fails closed for over-cap mixed sensitive assignment shell words` passed 8/8 (183 skipped).
- [x] Complete verification: the CLI-channel file passed 191/191; the full Governor package passed 510/510 across 25 files.
- [x] Final hygiene: Governor package typecheck and `git diff --check` passed; status and diff inspection confirmed the exact requested three-file scope. No timeout change, commit, push, branch/worktree/PR/card creation, GitHub mutation/review trigger, merge, or secret read was performed.
- [x] CI rationale: the regression was deterministic excess work rather than a correctness failure. Skipping 258 irrelevant bounded expression scans removes the load-amplified work while preserving the dedicated bounded/fail-closed array handling, all seven new behaviors, and the over-cap physical-line fail-closed behavior.
- [x] Independent post-optimization gates: all Governor tests passed 510/510; package typecheck and build passed; lint passed with zero errors and the same three pre-existing unrelated warnings; `git diff --check` passed.
- [x] Fresh local `codex review --uncommitted` found no correctness issues in the optimization and confirmed the focused bounded-array regression passes.

## Trigger 16 current-head seven-finding remediation (`05e934f30d5ec252f48a2641ad279d6721429f59`)

- [x] Finding 1 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "independently mixed unified-diff prefixes"` failed as expected (1 failed, 191 skipped), leaving the complete synthetic key visible when removed and added Base64 lines had independent `-`/`+` prefixes between unchanged markers.
- [x] Finding 1 GREEN: the identical command passed (1 passed, 191 skipped) after normalizing one canonical unified-diff body prefix per nonempty physical line only when every such line is prefixed.
- [x] Finding 2 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "collection-valued structured sensitive headers"` failed as expected (1 failed, 192 skipped), collapsing the entire collection to a marker and concealing `$(reboot)`.
- [x] Finding 2 GREEN: the identical command passed (1 passed, 192 skipped) after reusing the bounded collection literal-fragment redactor for active-expression-bearing structured header values while retaining the prior single-marker behavior for inert collections.
- [x] Finding 3 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "later script-runner commands"` failed as expected (1 failed, 193 skipped), omitting both `bash evil.sh` and `node exploit.js` after `systemctl` established YAML shell context.
- [x] Finding 3 GREEN: the identical command passed (1 passed, 193 skipped) after recognizing only `bash` and `node` with a nonempty operand in established shell context; both command names remain visible and their operands become `[REDACTED]`.
- [x] Finding 4 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "scoped PowerShell assignments"` failed as expected (1 failed, 194 skipped), exposing `$global:PASSWORD`, `$script:API_KEY`, and `${global:PASSWORD}` values.
- [x] Finding 4 GREEN: the identical command passed (1 passed, 194 skipped) after classifying the underlying variable name for `env`, `global`, and `script` scoped forms while preserving the complete active `$(reboot)` substitution.
- [x] Finding 5 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "curl passwords with empty usernames"` failed as expected (1 failed, 195 skipped), exposing both separated `--user :password` and quoted `-u ":password"` credentials.
- [x] Finding 5 GREEN: the identical command passed (1 passed, 195 skipped) after permitting a zero-length username only inside the already option-anchored curl credential patterns.
- [x] Finding 6 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "plain YAML scalars under quoted sensitive keys"` failed as expected (1 failed, 196 skipped), exposing values beneath both a double-quoted key and a list-item single-quoted key.
- [x] Finding 6 GREEN: the identical command passed (1 passed, 196 skipped) after adding a line-bounded quoted-key plain-scalar pass; the final regression also asserts that `; reboot` and `&& node exploit.js` remain visible after the literal credentials are redacted.
- [x] Finding 7 RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "acronym-prefix PascalCase"` failed as expected (1 failed, 197 skipped), exposing `DBPassword`, `JWTToken`, and `HTTPAuthorization` while the synthetic near-miss keys remained unchanged.
- [x] Finding 7 GREEN: the identical command passed (1 passed, 197 skipped) after inserting separators only at acronym-to-PascalCase word boundaries before existing sensitive-vocabulary classification.
- [x] Seven-finding interaction selection passed 7/7 (191 skipped).
- [x] Complete CLI-channel verification passed 198/198.
- [x] Full Governor verification passed 517/517 across 25 files.
- [x] Package typecheck and build passed; lint passed with zero errors and exactly the known three pre-existing warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] `git diff --check` passed; exact hunk, status, name, and stat inspection confirmed only the production redactor, focused CLI-channel test, and this existing progress document changed. The new scans remain line/balanced-value bounded, literal credentials are concealed, and asserted shell substitutions/operators/commands remain visible.

## Trigger-17 current-head eleven-finding remediation (`760bc515`)

- [x] Finding 1 RED→GREEN: isolated tuple-header test failed 1/1 by collapsing the active expression, then passed 1/1 with the full harmless substitution retained between redacted literal fragments.
- [x] Finding 2 RED→GREEN: isolated multiline PowerShell test failed 1/1 by leaking both continuation lines, then passed 1/1 with bounded matching-quote scans for single and double quotes.
- [x] Finding 3 RED→GREEN: isolated PowerShell `+=` test failed 1/1 with both values visible, then passed 1/1 after narrowly extending the assignment operator.
- [x] Finding 4 RED→GREEN: isolated established-YAML-context test failed 1/1 by omitting `ruby` and a dot-relative executable, then passed 1/1 while hiding pre-context plaintext and all command operands.
- [x] Finding 5 RED→GREEN: isolated parity test failed 1/1 by leaking suffixes after escaped space/semicolon boundaries, then passed 1/1 while retaining an even-parity real boundary.
- [x] Finding 6 RED→GREEN: isolated multiline POSIX test failed 1/1 by leaking both continuation lines, then passed 1/1 with a 65,536-character matching-quote bound; the unterminated-opposite-quote interaction selection passed 2/2.
- [x] Finding 7 RED→GREEN: isolated tilde-userinfo test failed 1/1 with the password visible, then passed 1/1 while retaining existing authority/host validation.
- [x] Finding 8 RED→GREEN: isolated curl OAuth bearer test failed 1/1 with quoted and unquoted arguments visible, then passed 1/1 with following URLs/operators/commands intact.
- [x] Finding 9 RED→GREEN: isolated quoted-query test failed 1/1 by inserting a marker before the quote and leaking the full value, then passed 1/1 with quoted semicolon data consumed and an unquoted semicolon preserved as an operator.
- [x] Finding 10 RED→GREEN: isolated nested-option test failed 1/1 for Terraform and Docker `--env=` payloads, then passed 1/1 while the `notpassword` near misses stayed visible.
- [x] Finding 11 RED→GREEN: isolated netrc test failed 1/1 with both record passwords visible, then passed 1/1 while unrelated `note password visible_plaintext` remained unchanged.
- [x] Exact eleven-test selection passed 11/11; the complete CLI-channel file passed 209/209 after repairing the multiline-POSIX unterminated-quote interaction and preserving argumentless YAML plaintext concealment.
- [x] All Governor tests passed 528/528 across 25 files; package typecheck and build passed; lint reported zero errors and exactly the three known pre-existing warnings.
- [x] `git diff --check` passed. Bounds, literal hiding, executable-context assertions, and status/name/diff inspection confirm exact scope is the production redactor, focused CLI-channel test, and this progress document.

## Trigger-17 Finding 9 whole-URL-quote follow-up

- [x] Replaced the query-value-only Finding 9 fixture with the harmless immutable-report shape `curl "https://safe.example/?access_token=violet;quartz$(printf harmless-query)amber&safe=visible"` before changing production.
- [x] Strict RED observed: the isolated test failed 1/1 because production returned `access_token=[REDACTED];quartz$(printf harmless-query)amber`, exposing the suffix after treating the quoted URL's semicolon as an unquoted shell boundary.
- [x] Narrow GREEN: a line- and 65,536-character-bounded enclosing-shell-quote scan now supplies query-value context. Double-quoted URL data consumes the semicolon while retaining the complete active substitution between redacted literal fragments; single-quoted URL contents are wholly literal and redacted; an unquoted semicolon remains visible as a shell operator boundary.
- [x] The focused Finding 9 selection passed 1/1. The first complete-file run exposed a compatibility regression in ordinary unquoted active-expression values (2 failures); the focused correction selection passed 3/3 after restricting forced-literal treatment to inherited single quotes, and the full CLI-channel file then passed 209/209.
- [x] Re-audited the exact eleven Finding 1–11 tests against the immutable reports; no other material fixture mismatch was found. The exact eleven-test selection passed 11/11.
- [x] Verified established sensitive-YAML shell context retains the presumed executable token from every later nonempty more-indented multi-word line and hides every remaining word. This necessarily cannot distinguish an arbitrary first plaintext word from an executable after shell context is established; the tests keep pre-context plaintext completely hidden and avoid broadening recognition beyond that report-required context.
- [x] Final validation: full CLI-channel 209/209; all Governor tests 528/528 across 25 files; typecheck and build passed; lint reported zero errors and exactly the three known pre-existing warnings; `git diff --check` and exact scoped status/diff inspection passed.

## Trigger-17 local-review P1 follow-up

- [x] P1 A regression added for a quoted curl URL containing `;` before `--oauth2-bearer`, using an option-looking synthetic credential to exercise the reviewed edge. The end-to-end regression was already GREEN before the targeted change because a later generic sensitive-flag fallback also concealed the credential, so an isolated behavioral RED could not be honestly recorded. Replaced the independently defective separator regex with a 65,536-character-bounded shell-quote state scan: semicolons and other separators inside single or double quotes remain in the curl command, while unquoted separators end it. Focused post-change verification passed 1/1.
- [x] P1 B strict RED→GREEN: the isolated column-zero netrc directive regression failed 1/1 with `password violetquartz` visible after column-zero `login synthetic-user`; after making recognized `login`, `password`, `account`, and `macdef` directives indentation-independent, it passed 1/1 while the unrelated `note password visible_plaintext` line still ended the record and remained unchanged.
- [x] Both new local-review tests passed together 2/2. The exact original eleven Trigger-17 selections plus both follow-ups passed 13/13.
- [x] Full CLI-channel verification passed 211/211; all Governor tests passed 530/530 across 25 files.
- [x] Governor typecheck and build passed. Lint reported zero errors and exactly the three known pre-existing warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] `git diff --check` passed. Final scope inspection confirmed only the existing production redactor, focused CLI-channel test, and this progress document are modified.

## Latest local-review three-P1 follow-up

- [x] Add focused regressions for quoted Terraform separators, attached `-var=`, and blank/comment-only netrc record lines.
- [x] Observe all three focused regressions RED before changing production: the combined isolated run failed 3/3, exposing both Terraform values and the netrc password.
- [x] Implement narrow, bounded fixes in the existing production redactor: use a 65,536-character quote-state Terraform command scan, accept only the standard separated/attached `-var` spellings, and treat only blank/comment-only lines as netrc record continuations.
- [x] Run the three focused tests together: 3/3 passed (211 skipped).
- [x] Run the complete CLI-channel file: 214/214 passed.
- [x] Run all Governor tests: 533/533 passed across 25 files.
- [x] Run Governor typecheck, lint, and build: all passed; lint retained exactly the three known unrelated warnings and reported zero errors.
- [x] Run `git diff --check` successfully and confirm the unchanged three-file scope: production redactor, focused CLI-channel test, and this progress document only. No external side effects were performed.

## Escaped-quote Terraform P1 follow-up

- [x] Focused RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "consumes escaped quotes in double-quoted Terraform var assignments"` failed 1/1 (214 skipped), receiving `password=[REDACTED]"quartz"` and proving the escaped quote was treated as the value close.
- [x] Narrow bounded GREEN: replace only the nested Terraform assignment regex's closing-quote detection with a cursor scan over the already 65,536-character-capped command; double-quoted values skip escaped characters, single-quoted behavior is retained, and active expression redaction remains unchanged. The identical focused command passed 1/1 (214 skipped).
- [x] Relevant Terraform/nested-option sibling selection passed 4/4 (211 skipped); the complete CLI-channel file passed 215/215.
- [x] All Governor tests passed 534/534 across 25 files. Package typecheck and build passed; lint passed with zero errors and the same three pre-existing unrelated warnings.
- [x] `git diff --check` passed, and status/name inspection confirmed the exact existing three-file scope. No commit, push, GitHub/Kanban mutation, review trigger, merge, unrelated file change, or secret inspection was performed.

## Post-fix Codex review two-P1 over-cap follow-up

- [x] PowerShell strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "fails closed through the physical line when a PowerShell closing quote lies beyond the scan cap"` failed 1/1 (215 skipped). The received output contained the synthetic credential remainder, closing quote, and same-line suffix after the initial `[REDACTED]`, proving the 65,536-character cap was incorrectly treated as a value boundary.
- [x] PowerShell narrow bounded GREEN: when a quoted sensitive assignment exhausts the existing scan cap without a matching quote, advance the redaction cursor through the next CR/LF (or end of input) instead of emitting the uncertain remainder. The identical focused command passed 1/1 (215 skipped), preserving `Write-Output visible_next_line`.
- [x] PowerShell sibling compatibility: the focused quoted/escape/boundary selection passed 5/5 (211 skipped).
- [x] Multiline POSIX strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "fails closed through the physical line when a multiline POSIX closing quote lies beyond the scan cap"` failed 1/1 (216 skipped). The received output redacted only the first physical line and exposed the complete synthetic continuation and same-line suffix because the bounded matching-quote prepass skipped the candidate.
- [x] Multiline POSIX narrow bounded GREEN: only when the existing scan cap is exhausted after a physical newline without a matching quote, retain the assignment/opening quote, emit one marker, and advance through the next CR/LF (or end of input). The identical focused command passed 1/1 (216 skipped), preserving `echo visible_next_line`.
- [x] Multiline POSIX sibling compatibility: the multiline/unterminated/opposite-quote/escaped-newline/even-backslash selection passed 7/7 (210 skipped).
- [x] Complete CLI-channel verification passed 217/217.
- [x] Full Governor verification passed 536/536 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and exactly the three known pre-existing warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] `git diff --check` passed. The work remained within the existing production redactor, CLI-channel unit test, and this progress document; no commit, push, GitHub/Kanban mutation, review trigger, merge, extra file, or secret inspection was performed.

## Latest independent Codex review four-P1 follow-up

- [x] Curl strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "fails closed for unmatched and ANSI-C quoted curl oauth2 bearer values"` failed 1/1 (217 skipped). The unmatched double-quoted synthetic value was emitted verbatim, and the ANSI-C value retained its synthetic literal tail after a marker.
- [x] Curl narrow bounded GREEN: reuse a 65,536-character quote-aware command-end scan that falls back to the first physical newline only when a quote remains unmatched; accept unmatched ordinary quotes and ANSI-C single-quoted bearer arguments and replace uncertain literal payloads with one marker. The identical focused command passed 1/1 (217 skipped), preserving both following lines/commands.
- [x] Terraform strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "fails closed for a Terraform sensitive var with no bounded closing quote"` failed 1/1 (218 skipped), emitting the entire synthetic value unchanged.
- [x] Terraform narrow bounded GREEN: reuse the bounded quote-aware command scan and, for a classified `-var` key with no closing quote in that bounded command, retain only the option/opening quote/key and emit one marker through the physical-line boundary. The identical focused command passed 1/1 (218 skipped), preserving the next line.
- [x] Docker-bound strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "keeps separators in earlier Docker arguments while scanning later env credentials"` failed 1/1 (219 skipped), leaving the later synthetic `--env=API_KEY` value visible after a semicolon inside an earlier quoted argument.
- [x] Docker-bound narrow bounded GREEN: replace the separator regex command slice with the shared 65,536-character quote-aware command-end scan. The identical focused command passed 1/1 (219 skipped), retaining the quoted argument and following command.
- [x] Docker-quote strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "redacts quoted Docker --env and -e assignment payloads"` failed 1/1 (220 skipped), exposing both synthetic quoted assignment values.
- [x] Docker-quote narrow bounded GREEN: add a command-local quoted payload pass for separated/attached `--env` and `-e` forms, classify only the nested assignment key, preserve its quote form, and redact its literal value. The identical focused command passed 1/1 (220 skipped).
- [x] Exact four-finding selection passed 4/4 (217 skipped): `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "fails closed for unmatched and ANSI-C quoted curl oauth2 bearer values|fails closed for a Terraform sensitive var with no bounded closing quote|keeps separators in earlier Docker arguments while scanning later env credentials|redacts quoted Docker --env and -e assignment payloads"`.
- [x] Relevant curl/Terraform/Docker sibling compatibility selection passed 9/9 (212 skipped): `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "curl oauth2|Terraform|Docker option payloads|Docker arguments|Docker --env"`.
- [x] Complete CLI-channel verification passed 221/221; full Governor verification passed 540/540 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and exactly the three known pre-existing warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] Final `git diff --check` passed after the evidence append. Status, name-only, stat, and scoped diff inspection confirmed that only the existing production redactor, CLI-channel test, and this progress document are modified; no prohibited external or repository side effects were performed.

## Latest independent review three-P1 continuation follow-up

- [x] Sensitive-query strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "fails closed through the physical line for unmatched quoted sensitive query values"` failed 1/1 (221 skipped). Both unmatched single- and double-quoted synthetic values remained visible after the initial marker, across CRLF and LF fixtures respectively.
- [x] Sensitive-query bounded GREEN: when the existing 65,536-character quote scan finds no matching delimiter, consume only through the next physical CR/LF (or end of input). The identical focused command passed 1/1 (221 skipped), preserving both following commands.
- [x] Curl-continuation strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "accepts shell continuations before curl oauth2 bearer values"` failed 1/1 (222 skipped). Production replaced only each continuation backslash and left both synthetic bearer values visible.
- [x] Curl-continuation narrow GREEN: accept POSIX backslash-LF/CRLF/CR continuations in the existing bearer-option separator and bounded command scan, consume the real argument, and normalize the consumed separator to one space so the later generic sensitive-flag pass cannot add a second marker. The identical focused command passed 1/1 (222 skipped), preserving both following URLs and commands.
- [x] Terraform-continuation strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "accepts shell continuations before quoted Terraform var assignments"` failed 1/1 (223 skipped), leaving both quoted synthetic sensitive assignments visible.
- [x] Terraform-continuation narrow GREEN: accept POSIX backslash-LF/CRLF/CR continuations in the established separated `-var` whitespace form while retaining the option spelling and physical continuation. The identical focused command passed 1/1 (223 skipped), preserving both following commands.
- [x] Exact three-test selection passed 3/3 (221 skipped): `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "fails closed through the physical line for unmatched quoted sensitive query values|accepts shell continuations before curl oauth2 bearer values|accepts shell continuations before quoted Terraform var assignments"`.
- [x] Relevant sibling selection passed 16/16 (208 skipped): `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "query|curl oauth2|Terraform"`.
- [x] Complete CLI-channel verification passed 224/224; full Governor verification passed 543/543 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and exactly the three known pre-existing warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] `git diff --check` passed before this evidence append. Status and name-only inspection confirmed exact scope remains the production redactor, CLI-channel test, and this progress document; no prohibited external or repository side effects were performed.

## Latest independent review concatenated-shell-fragment follow-up

- [x] Sensitive-query strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "redacts concatenated shell fragments in sensitive query values"` failed 1/1 (224 skipped). The received value redacted only the first single-quoted fragment and exposed the following double-quoted/unquoted synthetic literals around the retained harmless substitution.
- [x] Sensitive-query bounded GREEN: scan the complete shell word through its real URL/shell boundary, retain single/double quote delimiters and the complete active substitution, and redact every literal fragment. The identical focused command passed 1/1 (224 skipped), preserving the safe query sibling and adjacent `&& echo` command.
- [x] Curl OAuth strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "redacts concatenated shell fragments in curl oauth2 bearer arguments"` failed 1/1 (225 skipped). The received argument redacted only the first single-quoted fragment and exposed the following double-quoted/unquoted synthetic literals around the retained harmless substitution.
- [x] Curl OAuth bounded GREEN: a command-local full-shell-word prepass now consumes concatenated bearer fragments before the established option redactor, retains quote delimiters and the complete active substitution, and redacts every literal fragment. The identical focused command passed 1/1 (225 skipped), preserving the following URL and adjacent `&& echo` command.
- [x] Exact two-test selection passed 2/2 (224 skipped): `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "redacts concatenated shell fragments in sensitive query values|redacts concatenated shell fragments in curl oauth2 bearer arguments"`.
- [x] Relevant query/OAuth sibling selection initially found one unmatched-query compatibility regression; after restoring the established whole-value fail-closed marker, `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "query|curl oauth2"` passed 12/12 (214 skipped).
- [x] Complete CLI-channel verification passed 226/226; full Governor verification passed 545/545 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and exactly the three known pre-existing warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] Final `git diff --check` passed after this evidence append. Status, name-only, stat, and scoped-diff inspection confirmed exact scope remains the production redactor, CLI-channel test, and this progress document; no prohibited external or repository side effects were performed.

## Latest independent review ANSI-C concatenated-shell-word follow-up

- [x] Added one deterministic curl OAuth regression combining ANSI-C, double-quoted, single-quoted, and unquoted bearer fragments with a retained `$(printf harmless-ansi-oauth)` substitution and adjacent `&& echo visible_after_ansi_oauth_word` command.
- [x] Isolated strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "redacts ANSI-C-prefixed concatenated shell fragments in curl oauth2 bearer arguments"` failed 1/1 (226 skipped). The received output was `--oauth2-bearer=[REDACTED]"quartz"'amber'opal$(printf harmless-ansi-oauth)jade`, proving the full-word prepass skipped the leading `$` and every later literal fragment leaked.
- [x] Minimal repair: recognize `$'` as an ANSI-C quote opener in the shared literal-fragment redactor, admit a closed ANSI-C-prefixed concatenated word to the curl OAuth full-word prepass, and prevent the later option fallback from collapsing the prepass's canonical `$'[REDACTED]'` fragment. Original or unmatched ANSI-C values retain the established whole-marker fail-closed behavior.
- [x] The first post-change isolated run still failed 1/1 (226 skipped) only because the generic fallback collapsed the already-redacted ANSI-C fragment to `[REDACTED]`; after the narrow canonical-marker guard, the identical isolated command passed 1/1 (226 skipped).
- [x] Relevant OAuth and concatenation siblings passed 6/6 (221 skipped): `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "curl oauth2|concatenated shell fragments"`.
- [x] Complete CLI-channel verification passed 227/227. Full Governor verification passed 546/546 across 25 files.
- [x] `npm run typecheck --workspace @franken/governor` and `npm run build --workspace @franken/governor` passed. `npm run lint --workspace @franken/governor` passed with zero errors and exactly the three known unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] `git diff --check` passed before this evidence append. Status, name-only, stat, and scoped-diff inspection confirmed the exact existing three-file scope: production redactor, CLI-channel test, and this progress document. No commit, push, GitHub/Kanban mutation, review trigger, merge, added file, unrelated edit, or secret inspection was performed.

## Independent-review TypeScript compile follow-up

- [x] RED: `npm run typecheck --workspace @franken/governor` failed with TS2345 at `approval-prompt-markers.ts:606` because `closingQuote` widened to `string`, outside `boundedClosingShellQuoteIndex`'s `"'" | '"'` parameter.
- [x] GREEN: explicitly narrow `closingQuote` to recognized shell quote literals or `undefined`; the exact package typecheck passed, and the focused ANSI-C concatenated OAuth regression passed 1/1 (228 skipped).

## Latest independent-review quoted-operator shell-word follow-up

- [x] Added focused sensitive-query and curl OAuth regressions for a first quoted fragment containing `&` followed by a concatenated `LEAK` literal.
- [x] Strict RED: the combined focused run failed 2/2 (229 skipped); both received values retained `LEAK` after the first redacted quoted fragment.
- [x] Narrow bounded GREEN: determine enclosing quote context before classifying a value-opening quote, scan the shell-word candidate through its enclosing quote/physical-line boundary, and apply structural boundaries only outside local quote fragments. Existing active-substitution fragment redaction remains in place.
- [x] The identical focused selection passed 2/2 (229 skipped); relevant query/OAuth siblings passed 16/16 (215 skipped).
- [x] Full CLI-channel passed 231/231; all Governor tests passed 550/550 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and the same three known unrelated warnings.
- [x] Final `git diff --check` passed; status/name inspection confirmed the unchanged three-file scope.

## Latest independent-review unquoted-first curl OAuth shell-word follow-up

- [x] Added one focused regression for an unquoted-first bearer word concatenated with double-quoted, single-quoted, substitution, and trailing unquoted fragments, followed by a real URL and `&& echo` command.
- [x] Strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "redacts unquoted-first concatenated shell fragments in curl oauth2 bearer arguments"` failed 1/1 (231 skipped). The received output redacted only `violet`; `"quartz"'amber'$(printf harmless-unquoted-oauth)opal` remained exposed.
- [x] Minimal bounded GREEN: admit an unquoted-first word to the existing full-word prepass only when its already bounded scan finds a genuine unescaped quote fragment or concatenated shell expression. The established literal-fragment redactor then preserves quote delimiters and substitutions while redacting every literal fragment; ordinary whole values and subsequent URLs/operators/commands retain their current paths.
- [x] The identical focused command passed 1/1 (231 skipped). OAuth siblings passed 8/8 (224 skipped): `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "curl oauth2|unquoted-first concatenated shell fragments"`.
- [x] Complete CLI-channel verification passed 232/232. Full Governor verification passed 551/551 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and exactly the same three known unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] Final `git diff --check` passed; status and name-only inspection confirmed the exact existing three-file scope: production redactor, CLI-channel unit test, and this progress document.

## Latest independent-review unquoted attached Terraform var follow-up

- [x] Added one focused regression for `terraform apply -var=password=violetquartz`, with an adjacent unquoted non-sensitive `-var=`, following tfvars argument, `&&` boundary, and next command pinned unchanged.
- [x] Strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "redacts unquoted attached Terraform var assignments"` failed 1/1 (232 skipped), returning the sensitive nested value unchanged.
- [x] Narrow GREEN: allow a quote-free nested assignment only for the attached `-var=` spelling, classify its nested key with the existing sensitive-key predicate, and consume its value only through the unquoted shell-word boundary. Existing quoted and separated forms retain their established quote-aware paths.
- [x] The identical focused command passed 1/1 (232 skipped). Terraform/nested-option siblings passed 7/7 (226 skipped): `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "Terraform|sensitive assignments nested in Terraform and Docker option payloads"`.
- [x] Complete CLI-channel verification passed 233/233. Full Governor verification passed 552/552 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and exactly the same three known unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] Final `git diff --check` passed; status, name-only, stat, and scoped-diff inspection confirmed the exact existing three-file scope: production redactor, CLI-channel unit test, and this progress document. No prohibited repository or external side effects were performed.

## Final-review Terraform expression and operator-boundary follow-up

- [x] Added focused regressions for pure and literal-surrounded command substitutions in unquoted attached sensitive `-var=` values, plus `>` and `|` shell boundaries with their following command context pinned unchanged.
- [x] Strict RED: the combined isolated run failed 2/2 (233 skipped). Both command substitutions were collapsed to markers, and `>output.log` was consumed with the sensitive value.
- [x] Minimal bounded GREEN: replace only the Terraform unquoted whitespace loop with the existing balanced `shellValueBoundary` helper and apply the existing password literal-fragment redactor to expression-bearing unquoted values. Quoted, separated, non-sensitive, and command-boundary paths were otherwise unchanged.
- [x] The identical focused selection passed 2/2 (233 skipped). Terraform/nested-option siblings passed 9/9 (226 skipped).
- [x] Complete CLI-channel verification passed 235/235. Full Governor verification passed 554/554 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and exactly the same three known unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] `git diff --check` passed; status, name-only, stat, and scoped diff inspection confirmed the exact existing three-file scope. No prohibited repository or external side effects were performed.

## Latest independent-review balanced-substitution command-boundary follow-up

- [x] Added minimal Terraform and Docker regressions with a credential option after `$(echo x; echo y)` and the following outer `&& echo` context pinned unchanged.
- [x] Strict RED: `npm test --workspace @franken/governor -- --run tests/unit/channels/cli-channel.test.ts -t "keeps separators in balanced substitutions before Terraform credentials|keeps separators in balanced substitutions before Docker credentials"` failed 2/2 (235 skipped); both synthetic credential literals remained visible because the bounded command scan stopped at the substitution's semicolon.
- [x] Minimal bounded GREEN: use the established balanced-expression parser on only the existing 65,536-character command window and skip parser-confirmed expression spans while scanning. Outer quotes and operators retain their existing handling; unmatched or over-cap expressions produce no skippable span and therefore retain fail-closed behavior.
- [x] The identical focused selection passed 2/2 (235 skipped). Terraform/Docker siblings passed 13/13 (224 skipped).
- [x] Complete CLI-channel verification passed 237/237. Full Governor verification passed 556/556 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and exactly the same three known unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] Final `git diff --check` passed; status, name-only, stat, and scoped diff inspection confirmed the exact existing three-file scope. No commit, push, GitHub/Kanban mutation, review trigger, merge, secret inspection, or unrelated edit was performed.

## Latest independent-review matched multiline POSIX quote follow-up

- [x] Added focused matched single- and double-quote regressions whose interior contains an assignment-like line, while pinning active expressions, following commands, and non-sensitive assignments.
- [x] Strict RED: the isolated regression failed 1/1 (237 skipped); the double-quoted value was cut after its first line and exposed `foo=bar`, the trailing literal, active substitution, closing quote, and following command.
- [x] Narrowed the interior assignment-like-line bypass after the bounded matching-quote scan to only a following sensitive assignment with an opposite opening quote, which preserves the established truly-unmatched-quote case; scan-cap handling and non-multiline candidates retain their existing branches.
- [x] The focused/multiline/unmatched/continuation selection passed 8/8 (230 skipped), including matched single and double quotes, active expressions, the opposite-quote unmatched guard, scan-cap handling, and following-command boundaries.
- [x] Complete CLI-channel verification passed 238/238; full Governor verification passed 557/557 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and exactly the same three unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] Final `git diff --check` passed; status, name-only, stat, and scoped-diff inspection confirmed the exact three-file scope. No prohibited repository or external side effects were performed.

## Latest independent-review curl OAuth bounded-shell-word follow-up

- [x] Added focused regressions for an unquoted bearer word containing escaped whitespace and an unquoted bearer word containing a command substitution with spaced arguments; both pin the following URL, `&&` operator, and command.
- [x] Strict RED: the combined focused run failed 2/2 (238 skipped). The replacement regex exposed `barZZ` after `foo\ ` and exposed the spaced substitution body after truncating at its first internal space.
- [x] Minimal bounded GREEN: admit escaped-whitespace values to the already computed `shellWordEnd` prepass and apply the legacy option regex only to command segments not claimed by that prepass. Complete bounded arguments are therefore redacted once, active substitutions remain intact, and following URLs/operators remain outside the redaction.
- [x] The identical focused selection passed 2/2 (238 skipped). OAuth siblings passed 10/10 (230 skipped).
- [x] Complete CLI-channel verification passed 240/240 on a standalone rerun. Its first concurrent run hit one existing 5-second scan-cap stress-test timeout under contention; the same test passed both in the full Governor run and the standalone CLI rerun.
- [x] Full Governor verification passed 559/559 across 25 files. Governor typecheck and build passed. Lint passed with zero errors and exactly the same three unrelated warnings.
- [x] Final `git diff --check` passed; status, name-only, stat, and scoped-diff inspection confirmed the exact existing three-file scope. No prohibited repository or external side effects were performed.

## Latest independent-review prose-apostrophe P2 follow-up

- [x] Added focused contraction and possessive regressions that place ordinary prose apostrophes before sensitive query URLs and pin all following prose as visible.
- [x] Strict RED: the exact two-test selection failed 2/2 (240 skipped); both received strings ended at the redaction marker, proving the earlier apostrophe was misclassified as an enclosing single quote and whitespace no longer bounded the query value.
- [x] Minimal GREEN: ignore an embedded alphanumeric apostrophe only when no later single quote exists before the sensitive URL position. Immediate URL-opening quotes and matched shell quotes—including concatenated fragments—retain the existing shell paths, while ordinary prose restores the unquoted whitespace boundary.
- [x] The identical focused selection passed 2/2 (240 skipped). Query, quoted URL, concatenation, operator, substitution, and fail-closed siblings passed 61/61 (181 skipped).
- [x] Complete CLI-channel verification passed 242/242. Full Governor verification passed 561/561 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and exactly the same three unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] Final `git diff --check` passed; status, name-only, stat, and scoped-diff inspection confirmed the exact existing three-file scope. No prohibited repository or external side effects were performed.

## Latest independent-review ANSI-C command-boundary P1 follow-up

- [x] Added a focused Terraform regression with an escaped apostrophe and internal semicolon in an earlier ANSI-C argument, followed by a synthetic sensitive `-var`. Strict RED failed 1/1 (242 skipped): the received output retained the complete synthetic credential after the scan truncated at the internal semicolon.
- [x] Minimally taught the bounded shared command scan to distinguish `$'…'`, suppress expression-span skipping inside that single-quoted mode, and skip its backslash-escaped characters before recognizing a closing apostrophe. Normal single/double quotes, unmatched-newline fallback, bounded expression spans, and outer operators retain their existing paths.
- [x] Focused GREEN passed 1/1 (242 skipped); Terraform/Docker/curl OAuth siblings passed 24/24 (219 skipped); full CLI passed 243/243; full Governor passed 562/562 across 25 files. Governor typecheck and build passed. Lint passed with zero errors and the same three unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`. An initial typecheck exposed that the widened local union had mechanically landed on an earlier helper; moving it to the intended bounded scanner restored type safety, and the focused regression was rerun GREEN afterward.
- [x] Final `git diff --check` passed; status, name-only, and scoped-diff inspection confirmed the exact existing three-file scope: production redactor, CLI-channel unit test, and this progress document. No commit, push, GitHub/Kanban mutation, review trigger, merge, secret inspection, or unrelated edit was performed.

## Latest independent-review pure spaced curl OAuth expression P1 follow-up

- [x] Added the minimal deterministic pure command-substitution regression for `curl --oauth2-bearer $(cat /tmp/token)`, with the following URL, `&&` operator, and command pinned unchanged. Strict RED failed 1/1 (243 skipped): expected the complete active expression, but received `--oauth2-bearer [REDACTED] /tmp/token)`, proving the fallback redacted only the first whitespace-delimited prefix.
- [x] Covered the same behavior slice for the pure braced expansion `${TOKEN:-fallback value}`. The first post-production focused run retained the command substitution but failed the braced assertion as `${TOKEN:[REDACTED] value}`, identifying the later generic assignment pass as a second prefix-corruption path.
- [x] Minimal bounded GREEN: admit only a single parser-confirmed expression span covering the entire already-bounded OAuth word to the full-word prepass, and skip the later generic assignment replacement only when a bounded parser-confirmed braced expression starts immediately before that match. Both complete active expressions and all following context remain unchanged. The identical focused command passed 1/1 (243 skipped).
- [x] OAuth siblings passed 11/11 (233 skipped). The complete CLI-channel file passed 244/244; all Governor tests passed 563/563 across 25 files.
- [x] Governor typecheck and build passed. Lint passed with zero errors and exactly the same three unrelated warnings in `src/policy.ts` and `tests/integration/full-approval-flow.test.ts`.
- [x] `git diff --check` passed. Status, name-only, stat, and scoped-diff inspection confirmed the exact existing three-file scope. No commit, push, GitHub/Kanban mutation, review trigger, merge, secret inspection, dependency/file addition, or unrelated edit was performed.
- [x] Fresh independent `codex review --uncommitted` after the pure-expression repair found no discrete correctness, security, or compatibility regression. Independent orchestrator verification then passed CLI-channel 244/244, full Governor 563/563 across 25 files, typecheck, build, lint with zero errors and the same three unrelated warnings, and `git diff --check`.
