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
