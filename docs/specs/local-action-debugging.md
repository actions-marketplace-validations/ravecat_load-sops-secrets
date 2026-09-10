# Action development and workflow debugging

Status: Implemented and verified locally. This specification accompanies the local completion commit. Publication and the first GitHub-hosted run remain outside this local delivery.

## Purpose and ownership

Develop and validate this standalone action without publishing each edit or manually copying distribution into Infra. This extends the existing local-debugging outcome with consumer documentation, repeatable source debugging, shared synthetic workflow fixtures, and native GitHub CI coverage.

This specification owns the project's development interface. Infra's `terraform-sops-variables` specification continues to own infrastructure credential delivery; this change does not modify Infra; the action now requires an explicit key input. The local history introduces the Nix environment first, then the action with its distribution and behavior tests, then the workflow validation and debugging environment described here. This continuation includes the strict TypeScript authoring migration.

## Contract

- JSON keys pass unchanged to `core.setOutput`, without a naming regex, normalization, or case-folded uniqueness check. The full decrypted document must still be a JSON object of strings before any decrypted-value masks or outputs are written. Process tests verify unusual and case-distinct names at the `GITHUB_OUTPUT` write boundary; they do not emulate GitHub runner key lookup.

- README owns the consumer example, input/output contract, credential requirements, tested-platform limits, and same-job secret-output scope. It links to development instructions rather than embedding local setup and sibling-checkout walkthroughs.
- `docs/development.md` owns environment entry, build/test/check commands, source breakpoints, local workflow execution, sibling overrides, CI behavior, and troubleshooting. This specification owns acceptance and validation evidence.
- Runtime source uses TypeScript with strict checking, checked indexed access, and exact optional property types. Test helpers remain JavaScript. Keep Node.js 24, the Node test runner, ncc, and the existing Nix lock pins. Preserve `.envrc` and its optional ignored `.env` convention.
- `npm run typecheck` runs `tsc --noEmit` over `src/`. The same `.ts` sources run directly under Node.js 24 for source tests and debugging, using explicit `.ts` imports and erasable syntax. ncc compiles and bundles them into the unchanged `dist/index.js` consumer entrypoint. Runtime JSON validation, error messages, masking, cache integrity, and cleanup remain enforced by behavior tests.
- `npm run check` checks types, builds, validates workflow, TypeScript/JavaScript, and Markdown files, and runs process and real-SOPS integration tests. `npm test` retains the fast source/bundle checks. A separate distribution check requires the generated files to be tracked and unchanged.
- `npm run debug` creates disposable synthetic credentials and input/output files, pauses `src/index.ts` with Node Inspector on loopback, suppresses action stdout, and cleans its fixture after normal exit, failure, or handled interruption. The editor attaches to the actual TypeScript source process without Toolkit stubs.
- One shared fixture builder supplies source debugging, local and GitHub workflow tests, and real-SOPS integration. It uses a private temporary directory, age identity, and encrypted JSON with ordinary, multiline, and empty values, plus dotted, spaced, numeric-leading, and Unicode keys. Partial fixture creation is cleaned up, and each caller owns final cleanup. Real-download integration retains cold installation, offline cache reuse, and wrong-key coverage. Mocked process fixtures remain separate for controlled parsing and failure scenarios.
- The generator accepts caller-provided document values. The workflow smoke case uses LF for act compatibility, while real-SOPS integration checks CRLF, percent signs, and quotes without normalizing its output assertions.
- `npm run debug:workflow` rebuilds and runs `integration/workflow.yml` through `act --local-repository`, mapping `ravecat/load-sops-secrets@local` to the current checkout. `.actrc` retains host execution and disables implicit local credential-file loading.
- Native CI invokes `uses: ./` and verifies outputs in a later step. The local workflow retains its external-reference override to exercise the sibling-consumer development pattern. Both workflows use the shared fixture and assertion scripts, and clean fixtures with `always()`.
- Workflows mask the generated multiline identity and pass its text as a same-job output into `with.key`, alongside `with.file`. Source and act entry commands retain the inherited environment and supply synthetic file and key inputs. Assertions report failure without printing decrypted values. Forced process termination may prevent cleanup; fixtures remain synthetic.
- Ubuntu 24.04 is the configured CI target. Local verification is Linux x64. The installer binary matrix must not be presented as tested cross-platform support; POSIX test fixtures require adaptation before Windows CI is added.
- Consumer overrides must match the exact `uses` repository and ref. Infra's `ravecat/load-sops-secrets@v1` maps to this checkout, while the standalone debug workflow uses `@local`. No production workflow or release tag is changed.

## Key input contract and acceptance

- The action has two required inputs: `file` and `key`. Consumers pass age private identity text through `with.key` at job runtime from any trusted secret source, without a required storage provider or secret name. GitHub Actions secrets such as `${{ secrets.DECRYPTION_KEY }}` and masked outputs from an earlier trusted step are examples. An identity path is not accepted as a replacement for its contents.
- Missing or whitespace-only `key` fails before SOPS setup or decryption, even when ambient age credentials exist. Multiline identity text is supported; the Toolkit trims surrounding input whitespace.
- Register the supplied key once for masking before setup and decryption; the standard GitHub runner also masks its JSON-escaped representation. Decrypted values are masked only after the complete JSON object passes validation. Failures publish no outputs and expose only sanitized errors.
- Forward the inherited environment to the SOPS child process with `SOPS_AGE_KEY` set from `key`. Preserve all other environment variables, and neither mutate the parent environment nor write runtime key files or include the key in command arguments.
- Source and bundled process tests must cover required/blank keys, multiline input, masking on failure, and explicit-key precedence over inherited `SOPS_AGE_KEY`. Real integration must decrypt using `INPUT_KEY`, preserve cold installation and offline cache coverage, and reject a wrong explicit key despite a valid ambient key.
- README, debugger, and both workflow fixtures use the same `file`/`key` contract. Native CI and local act verify the masked multiline fixture output reaches `with.key`; fixture cleanup remains required.
- This change preserves the JavaScript action runtime, SOPS installation/cache behavior, arbitrary JSON-key outputs, and same-job consumption. It does not introduce Docker or modify Infra.

## Verification

- [x] Establish the isolated baseline: npm installation, ncc build, and all 35 existing tests pass.
- [x] Evaluate the extended Flake without changing either lockfile and resolve the expected tools through Nix and direnv.
- [x] Run `npm run check` and verify workflow/Markdown lint, process tests, and real SOPS integration.
- [x] Execute `npm run debug:workflow` and verify output transport and fixture cleanup.
- [x] Validate native `uses: ./` workflow behavior locally, while clearly distinguishing act from a GitHub-hosted run.
- [x] Attach to the source debugger, hit a source breakpoint, resume, disconnect, and verify successful exit and fixture cleanup.
- [x] Verify interrupted source debugging and controlled workflow failure also clean their fixtures.
- [x] Verify sibling-directory mapping, README/development links, example YAML, and distribution consistency.
- [x] Reconcile this specification with observed results and include it in the local completion commit.

## Baseline validation results

On Linux x64 with the unchanged lockfiles:

- `nix develop --command npm run check` passed workflow lint, Markdown lint, all 35 source/bundle process tests, and the real SOPS installation/decryption/cache integration test.
- `npm run debug:workflow` passed checkout, fixture preparation, action execution, output assertions, and cleanup using act 0.2.89. Checkout is necessary to make the shared helper files available in act's runner workspace.
- The native CI action block was executed locally with `uses: ./` after checkout. The validation harness omitted the GitHub-specific Nix bootstrap and checks already run directly; it did not claim a full hosted CI run. Output assertions and an additional cleanup assertion passed.
- A controlled ciphertext corruption failed with the sanitized decryption error, then passed the `always()` cleanup and a subsequent absence check. A temporary sibling consumer resolved `ravecat/load-sops-secrets@v1` to the worktree and passed the same assertions. These validation runs used an unreachable Docker socket and host execution.
- A Node Inspector client attached on loopback, set and hit a breakpoint in `src/main.js`, resumed, disconnected, and observed exit code zero. It verified mode 0700 on the temporary directory, mode 0600 on key/ciphertext/output files, suppressed stdout, and cleanup. A SIGTERM run also removed its fixture. Both checks passed with invalid inherited age credentials and a failing inherited key command.
- A missing-tool fixture check failed with a sanitized message and left no partial directory. The builder uses a private synthetic plaintext file during encryption because Node child stdin cannot be reopened by SOPS through `/dev/stdin`; the plaintext is deleted immediately after encryption.
- `direnv exec .` resolved Node.js 24, Git, SOPS, age, act, actionlint 1.7.12, and markdownlint-cli2 0.22.1 from the Flake. Markdown lint also passed through direnv.
- Local Markdown paths and anchors, the README workflow structure, JSON configurations, ignore rules, whitespace, and distribution consistency were checked. Runtime source, action metadata, `flake.lock`, and `package-lock.json` match the baseline.

The narrow actionlint exception applies only to the two synthetic dynamic-output names in the CI workflow. GitHub permits undeclared JavaScript action outputs; runtime assertions verify these values and the full output object. Markdown lint checks document structure, while a separate inspection checked local links and the README example. No claim is made that Markdown lint executes examples or validates remote links.

## Previous validation

Before this continuation, the original local workflow was recorded as passing on Linux x64 with act 0.2.89, including a sibling-directory mapping and cleanup after controlled failure. The previous record also reported 35 passing process tests. Those historical results do not validate the new fixture builder, debugger wrapper, or CI changes.

## Output-key verification

The staged output-key snapshot passed `npm run check` in the pinned Nix environment on 2026-09-11, including all 41 process tests and real SOPS integration. Tests verify unchanged names at the output-file boundary and retain complete string-value validation.

## Key input verification

The staged key-input snapshot passed `npm run check` in the pinned Nix environment on 2026-09-11, including all 43 process tests and real SOPS integration. The final workflow and source-debugger checks also passed with synthetic `file` and `key` inputs.

## TypeScript acceptance and verification

- Strict TypeScript checks and ncc compilation preserve the JavaScript action entrypoint.
- Source and bundle behavior tests continue to enforce parsing, masking, errors, and cache integrity.
- Source tests and debugging use explicit `.ts` paths under Node.js 24.
- The staged TypeScript snapshot passed a clean offline npm install and `npm run check` in the pinned Nix environment on 2026-09-11, including all 35 process tests and real SOPS integration.

## Rollback

Revert the development tooling commit to remove its commands, fixture wiring, workflow checks, and supporting documentation together. The preceding action commit retains the runtime source, action metadata, distribution, and behavior tests. No infrastructure operation or credential migration is involved.

To reverse only the TypeScript migration, restore the JavaScript source and its test/debug/build references, remove the compiler/parser dependencies and TypeScript configuration and check step, then rebuild and run the same behavior tests. The action metadata and consumer input/output contract do not change.

To reverse only the explicit key input, restore the previous environment-based credential contract together with its metadata, examples, fixtures, and tests, then rebuild the distribution. Consumers must update their workflow credential wiring accordingly.

## References

- [Research report](../research/action-authoring.md)
- [GitHub JavaScript action template CI](https://github.com/actions/javascript-action/blob/1fead38ed9c0cc1cee241ecea2e5b3e28772eab6/.github/workflows/ci.yml)
- [GitHub action documentation guidance](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions)
- [act local repository mapping](https://github.com/nektos/act/blob/v0.2.89/cmd/root.go)
- [act limitations](https://nektosact.com/not_supported.html)
