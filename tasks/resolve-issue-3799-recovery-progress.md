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
