# Action development and workflow debugging

## Purpose and ownership

Develop and validate this standalone action without publishing each edit or manually copying distribution into Infra. This extends the existing local-debugging outcome with consumer documentation, repeatable source debugging, shared synthetic workflow fixtures, and native GitHub CI coverage.

This specification owns the project's development interface, including migration of runtime source to strict TypeScript and the associated type checking, tests, and source debugger. Infra's `terraform-sops-variables` specification continues to own infrastructure credential delivery; this change does not modify Infra. The output-key follow-up removes the action's custom naming restrictions while preserving string-value validation and masking. The local history introduces the Nix environment first, then the action source and behavior tests, then the workflow validation and debugging environment described here. TypeScript migration and the explicit key input extend these authoring and delivery improvements.

## Contract

- README owns the consumer example, input/output contract, credential requirements, tested-platform limits, and same-job secret-output scope. It links to development instructions rather than embedding local setup and sibling-checkout walkthroughs.
- JSON keys pass unchanged to `core.setOutput`, without a naming regex, normalization, or case-folded uniqueness check. The full decrypted document must still be a JSON object of strings before any decrypted-value masks or outputs are written. Process tests verify unusual and case-distinct names at the `GITHUB_OUTPUT` write boundary; they do not emulate GitHub runner key lookup.
- `docs/development.md` owns environment entry, build/test/check commands, source breakpoints, local workflow execution, sibling overrides, CI behavior, and troubleshooting. This specification owns the development contract.
- Runtime source, tests, and test helpers use TypeScript with strict checking, checked indexed access, and exact optional property types. Debug and release scripts remain JavaScript. Keep Node.js 24, the Node test runner for process tests, ncc, and the existing Nix lock pins. Pin Vitest for real-SOPS integration tests. Preserve `.envrc` and its optional ignored `.env` convention.
- `npm run typecheck` runs `tsc --noEmit` over `src/`, `tests/`, and the Vitest configuration. The same `.ts` sources run directly under Node.js 24 for source tests and debugging, using explicit `.ts` imports and erasable syntax. ncc compiles and bundles the action into the unchanged `dist/index.js` consumer entrypoint. Runtime JSON validation, error messages, masking, cache integrity, and cleanup remain enforced by behavior tests.
- `npm run check` checks types, builds, validates workflow, TypeScript/JavaScript, and Markdown files, and runs process and real-SOPS integration tests. `npm test` retains the fast source/bundle checks.
- All tests live under `tests/` and use the `.test.ts` suffix. `npm test` selects `tests/*.test.ts` with Node's test runner, while `npm run test:integration` uses Vitest configured to select only `tests/integration/*.test.ts`. Shared fixtures and workflow scripts live under `tests/integration/` without the `.test` suffix, and neither command discovers them as tests.
- `npm run debug` creates disposable synthetic credentials and input/output files, pauses `src/index.ts` with Node Inspector on loopback, suppresses action stdout, and cleans its fixture after normal exit, failure, or handled interruption. The editor attaches to the actual TypeScript source process without Toolkit stubs.
- One shared fixture builder, `create`, supplies source debugging, local and GitHub workflow tests, and real-SOPS integration without depending on a test runner. It uses a private temporary directory, age identity, and encrypted JSON with ordinary, multiline, and empty values, plus dotted, spaced, numeric-leading, and Unicode keys. Partial fixture creation is cleaned up, and each caller owns final cleanup. Real-download integration retains cold installation, offline cache reuse, and wrong-key coverage. Mocked process fixtures remain separate for controlled parsing and failure scenarios.
- The generator accepts caller-provided document values. The workflow smoke case uses LF for act compatibility, while real-SOPS integration checks CRLF, percent signs, and quotes without normalizing its output assertions.
- Vitest context contains only the prepared action environment with `directory`, `bundle`, and `run`. Scenario-specific input values stay in the test body. Tests needing an incorrect key call the shared `createKey()` generator explicitly; it returns a new age private key as text without creating a second encrypted fixture or temporary files.
- The `SOPS Integration` suite reports installation, offline cache reuse, output preservation, log secrecy, temporary-download cleanup, and wrong-key handling as six named scenarios. The wrong-key scenario includes exit status, absent outputs, sanitized errors, and input-key masking. Vitest's `test.extend` provides typed, isolated per-test fixture context; `prepare` removes partial setup on failure, and `onCleanup` removes successful preparations after each test, including failed assertions. Action calls and assertions run in each test body, with no suite-wide mutable results or dependency on another test. Cache reuse warms its own cache before successful source decryption with an unavailable download proxy, without asserting library log text. Installation, cache reuse, and download cleanup perform three independent downloads per full suite; the remaining scenarios use SOPS from the development environment.
- `npm run debug:workflow` rebuilds and runs `tests/integration/workflow.yml` through `act --local-repository`, mapping `ravecat/load-sops-secrets@local` to the current checkout. `.actrc` retains host execution and disables implicit local credential-file loading.
- Native CI invokes `uses: ./` and verifies outputs in a later step. The local workflow retains its external-reference override to exercise the sibling-consumer development pattern. Both workflows use the shared fixture and assertion scripts, and clean fixtures with `always()`.
- One CI workflow owns inline `lint`, `test`, and `release` jobs. Branch pushes, pull requests, and manual dispatches run lint and test in parallel without reusable workflows or routing inputs. Lint builds the distribution bundle before validating workflows, because that validation resolves the local action entrypoint produced by the build. Release requires both checks to succeed, then builds and verifies its own distribution bundle before semantic-release runs, so an incomplete bundle cannot reach a release. The distribution is committed only by the release commit that the version tag points at, so consumers reference release tags rather than branches or commit SHAs. Tag pushes do not trigger CI.
- The default branch is read from `github.event.repository.default_branch` and compared against `github.ref_name`, with `github.ref_type == 'branch'` excluding tags. A push to that branch runs only semantic-release dry-run after successful checks. A manual CI dispatch on that branch runs fresh lint and test jobs before normal semantic-release execution; publication still depends on releasable commits. Both commands explicitly pass the same default branch through `--branches "$RELEASE_BRANCH"`; release configuration contains no static branch selection. Changing the repository default from `master` to `main` requires no edits. Pull requests and other refs skip only the release job. Release execution remains serialized with `contents: write`, including dry-run's push-permission verification; check jobs retain read-only permissions.
- Workflows mask the generated multiline identity and pass its text as a same-job output into `with.key`, alongside `with.file`. Source and act entry commands retain the inherited environment and supply synthetic file and key inputs. Assertions report failure without printing decrypted values. Forced process termination may prevent cleanup; fixtures remain synthetic.
- Ubuntu 24.04 is the configured CI target. Local verification is Linux x64. The installer binary matrix must not be presented as tested cross-platform support; POSIX test fixtures require adaptation before Windows CI is added.
- Consumer overrides must match the exact `uses` repository and ref. Infra's `ravecat/load-sops-secrets@v1` maps to this checkout, while the standalone debug workflow uses `@local`. No Infra workflow or release tag is changed.

## Key input contract and acceptance

- The action has two required inputs: `file` and `key`. Consumers pass age private identity text through `with.key` at job runtime from any trusted secret source, without a required storage provider or secret name. GitHub Actions secrets such as `${{ secrets.DECRYPTION_KEY }}` and masked outputs from an earlier trusted step are examples. An identity path is not accepted as a replacement for its contents.
- Missing or whitespace-only `key` fails before SOPS setup or decryption, even when ambient age credentials exist. Multiline identity text is supported; the Toolkit trims surrounding input whitespace.
- Register the supplied key once for masking before setup and decryption; the standard GitHub runner also masks its JSON-escaped representation. Decrypted values are masked only after the complete JSON object passes validation. Failures publish no outputs and expose only sanitized errors.
- Forward the inherited environment to the SOPS child process with `SOPS_AGE_KEY` set from `key`. Preserve all other environment variables, and neither mutate the parent environment nor write runtime key files or include the key in command arguments.
- Source and bundled process tests must cover required/blank keys, multiline input, masking on failure, and explicit-key precedence over inherited `SOPS_AGE_KEY`. Real integration must decrypt using `INPUT_KEY`, preserve cold installation and offline cache coverage, and reject a wrong explicit key despite a valid ambient key.
- README, debugger, and both workflow fixtures use the same `file`/`key` contract. Native CI and local act verify the masked multiline fixture output reaches `with.key`; fixture cleanup remains required.
- This change preserves the JavaScript action runtime, SOPS installation/cache behavior, arbitrary JSON-key outputs, and same-job consumption. It does not introduce Docker or modify Infra.

## Development verification

Verified on Linux x64 on 2026-09-09:

- `npm ci --ignore-scripts` installs the pinned compiler, parser, and Node types from the lockfile.
- `npm run check` passes strict type checking without skipping dependency declarations, ncc compilation, all lint checks, 33 source/bundle tests, and real SOPS integration.
- `npm run debug:workflow` passes the actual bundled action and output assertions through act, including dotted, spaced, numeric-leading, and Unicode keys.
- An Inspector protocol smoke check starts `scripts/debug.js`, sets and hits a breakpoint in `src/main.ts`, resumes successful execution, and verifies fixture cleanup.
- Read-only review found no runtime contract or tooling defects.

Key-input verification on Linux x64 on 2026-09-10:

- `nix develop --command npm run check` passed strict type checking, the distribution build, all lint checks, 41 source/bundle tests, and real SOPS integration. The integration rejects a wrong explicit key even when the ambient key is valid, and checks that key material appears only in masking commands.
- `nix develop --command npm run debug:workflow` passed masked multiline key transport through `with.key`, decryption, all dynamic-output assertions, and fixture cleanup. The fixture dependency installation uses the pinned Nix shell through `path:.` because act's copied workspace has incomplete Git metadata.
- An Inspector smoke check resumed `scripts/debug.js` with invalid inherited key settings, verified successful source execution with the generated `INPUT_KEY`, confirmed suppressed stdout, and checked fixture cleanup.
- Review confirmed that test, release, and local workflows supply both required inputs. The release workflow was inspected and linted; no release or GitHub-hosted run was performed.

Earlier separate-workflow verification on Linux x64 on 2026-09-10:

- `nix develop --command npm run check` passed strict type checking, the distribution build, workflow/source/documentation lint, 41 source/bundle tests, and the real SOPS integration test after adding reusable checks and release event guards.
- A temporary act simulation of copies of the three workflows retained their reusable calls, dependencies, and event/ref guards while replacing commands with harmless probes. All nine cases passed: master push selects dry-run, master manual dispatch selects publication, either failed check blocks release for either event, non-master manual dispatch skips all Release jobs, and a skipped check blocks release in both sampled event cases.
- Diff review and `git diff --check` passed. No semantic-release command, publication, or GitHub-hosted workflow was run; simulation does not validate release credentials or hosted-runner behavior.

Earlier reusable-workflow default-branch verification on Linux x64 on 2026-09-10:

- `nix develop --command npm run lint` passed workflow, source/configuration, and documentation lint. Runtime source was unchanged; the preceding full check remains applicable.
- A temporary act simulation of copied workflows preserved conditions, dependencies, reusable inputs, and the release branch environment. Harmless probes replaced checks/builds, and a fake npm executable captured the actual release command arguments. All 19 cases passed, covering default branches `master`, `main`, and `release/stable`; push dry-run versus manual execution; exact `--branches` forwarding; old-master and other-branch exclusion; same-name tag exclusion on manual dispatch; failed/skipped check gates; and retained PR and standalone manual checks.
- Running the simulated push workflows together verified exactly one lint and test execution on default-branch pushes. Diff review and `git diff --check` passed; workflow files and release configuration contain no hardcoded `master` references. No real semantic-release command, credentials, external actions, or GitHub-hosted run was used.

Unified CI verification on Linux x64 on 2026-09-10:

- `nix develop --command npm run lint` passed workflow, source/configuration, and documentation lint. Parsed lint/test step arrays match the preceding workflow bodies exactly; both jobs run without conditions or dependencies, and CI contains only the three inline jobs.
- All 18 temporary act simulations passed with a copied CI workflow, harmless check probes, and actual release arguments routed to a fake npm executable. They verified default-branch push/manual modes and branch arguments, other-branch and same-name-tag manual checks without release, failed/skipped check gates, and PR exclusion even with a default-branch ref. Each invocation executed lint and test once.
- Diff review and `git diff --check` passed. Runtime source and release configuration were unchanged. No real semantic-release command, credentials, external actions, or GitHub-hosted run was used.

Inherited-environment simplification verification on Linux x64 on 2026-09-10:

- Removed runtime deletion of inherited `SOPS_AGE_KEY_FILE` and `SOPS_AGE_KEY_CMD` and the synthetic test settings used to verify that deletion. The required `file`/`key` contract, key masking, and replacement of inherited `SOPS_AGE_KEY` remain covered.
- `nix develop --command npm run check` passed strict type checking, the distribution build, all lint checks, 41 source/bundle tests, and real SOPS integration covering cold installation, offline cache reuse, and wrong-key rejection.

Input-key masking simplification verification on Linux x64 on 2026-09-10:

- Removed the duplicate JSON-escaped input-key mask registration, retaining one `core.setSecret(key)` call. The standard GitHub runner supplies JSON escaping; decrypted-value mask registration remains unchanged.
- `nix develop --command npm run check` passed strict type checking, the distribution build, all lint checks, 41 source/bundle tests, and real SOPS integration. Tests verify one input-key mask command, including wrong-key failure; they do not emulate runner log redaction.

Debug-environment simplification verification on Linux x64 on 2026-09-11:

- Removed inherited age-variable cleanup from both debug entrypoints. `nix develop --command npm run lint` passed, and `nix develop --command npm run debug:workflow` passed the direct act invocation, distribution build, fixture setup, dynamic-output assertions, and cleanup.
- An Inspector smoke check resumed `scripts/debug.js` and verified exit code zero, suppressed stdout, and fixture cleanup. No inherited age variables were present or artificially injected; the earlier invalid-environment smoke result describes the preceding implementation.

Earlier integration-test reporting verification on Linux x64 on 2026-09-11:

- Split the real-SOPS integration into nine named tests, preserving all previous assertions and three action runs with one cold download. Setup captures results without assertions; tests do not depend on another test having run or passed.
- `nix develop --command npm run test:integration` passed all nine tests on `master`. `nix develop --command node --test --test-name-pattern='reuses cached SOPS' integration/sops.js` passed the cache-reuse test in isolation, including shared preparation.
- `nix develop --command npm run lint:js`, `nix develop --command npm run lint:docs`, and `git diff --check` passed. Diff review found no coverage regressions. Runtime source and workflows were unchanged; no GitHub-hosted run was performed.

Test layout and scenario verification on Linux x64 on 2026-09-11:

- Moved process tests to `tests/index.test.ts` and real-SOPS tests to `tests/integration/sops.test.ts`, with typed fixtures and workflow scripts in the same integration directory. Type checking and ESLint include all test TypeScript. Updated package commands, workflow paths, debug imports, and maintained documentation links.
- `nix develop --command npm run typecheck` and `nix develop --command npm run build` passed. `nix develop --command npm test` passed all 41 process tests, and `nix develop --command npm run test:integration` passed all six `SOPS Integration` scenarios. A filtered offline-cache run passed one test with shared preparation.
- The wrong-key assertions now form one scenario. Removed the assertion against the tool-cache library's `Downloading` log message; offline decryption still verifies our cache reuse. Preserved output fidelity, masking, sanitized errors, checksum rejection, and our temporary-download cleanup checks.
- `nix develop --command npm run lint:js`, `nix develop --command npm run lint:workflows`, `nix develop --command npm run lint:docs`, and `git diff --check` passed. Read-only review found no coverage or path regressions.
- `nix develop --command npm run debug:workflow` passed the relocated workflow through act, including the TypeScript fixture scripts, bundled action, dynamic-output verification, and fixture cleanup. Runtime source and dependencies were unchanged; no GitHub-hosted run was performed.

Per-test integration context verification on Linux x64 on 2026-09-11:

- Replaced suite-wide mutable fixtures and captured action results with Vitest's typed `test.extend` context. Each of the six scenarios runs its own actions; the cache scenario installs into its own cache before the offline source invocation. Renamed the shared generator to `create` and added `prepare` for the isolated action environment.
- Pinned Vitest 4.1.11, scoped discovery to integration tests, and included its configuration in type and lint checks. Vitest 5.0.0 failed the existing strict type check because of incompatible dependency declarations; no compiler settings were relaxed. Process tests retain Node's test runner.
- `nix develop --command npm run check` passed strict types, the distribution build, all lint checks, 41 process tests, and six integration scenarios. After refining partial-setup cleanup, type checking and all six integration scenarios passed again.
- An isolated temporary runner directory was empty after the complete integration suite and after the offline-cache scenario selected by `-t`. Temporary fault-injection copies of the suite confirmed cleanup after an intentional assertion failure and an error during environment preparation. The probes were removed after verification.
- `nix develop --command npm run debug:workflow` passed the act workflow, including a clean lockfile install with scripts disabled, the renamed fixture generator, bundled action execution, dynamic outputs, and cleanup. Diff review found no coverage or lifecycle defects. No GitHub-hosted run was performed.

Scenario-local key verification on Linux x64 on 2026-09-11:

- Removed the `wrongIdentity` context fixture. The three scenarios that need an incorrect key now create a local `wrongKey` explicitly. Context contains only the prepared action environment, while assertions remain in each test.
- Extracted `createKey(): string` for both encrypted-fixture creation and scenario inputs. It returns the complete generated age identity, captures subprocess diagnostics, and reports a sanitized generation error without creating files. The encrypted fixture writes its key with mode `0o600` and retains existing partial-creation cleanup.
- `nix develop --command npm run typecheck`, `nix develop --command npm run test:integration` (six scenarios), `nix develop --command npm run lint`, and `git diff --check` passed. Wrong-key rejection, input-key precedence, masking, outputs, and temporary-download cleanup remain covered. Runtime action code and workflows were unchanged.

Release-bundle CI verification on Linux x64 on 2026-09-11:

- The first GitHub-hosted default-branch run failed the `lint` job: workflow validation reported that the local action entrypoint, a build artifact, does not exist in that checkout. The `test` job passed, and `release` was skipped because it requires both checks to succeed.
- The failure reproduced in a fresh linked worktree, where workflow validation fails while no distribution exists. Building the bundle in the `lint` job beforehand matches the repository's `npm run check` order and satisfies entrypoint resolution.
- The release job verifies the built distribution after building, so an incomplete bundle cannot reach a release.
- `nix develop --command npm run check` passed strict type checking, the distribution build, all lint checks, 41 process tests, and six integration scenarios. The verification rejects a missing bundle and accepts the built one. `git diff --check` passed. Subsequent GitHub-hosted default-branch runs passed all three jobs, and their release dry run published nothing.

This specification accompanies the local completion commits for TypeScript authoring, the required key input, output-key passthrough, CI/release configuration, and test organization, reporting, and fixture lifecycle. Earlier verification results describe preceding layouts and behavior.

## Rollback

Revert each affected behavior together with its tests, configuration, and supporting documentation. TypeScript authoring, the required key input, output-key passthrough, and CI/release configuration are separate changes; account for dependencies when reverting earlier changes. Build the local distribution before executing it. No infrastructure operation or credential migration is involved.

To reverse only the TypeScript migration, restore the JavaScript source and its test/debug/build references, remove the compiler/parser dependencies and TypeScript configuration and check step, then rebuild and run the same behavior tests. The action metadata and consumer input/output contract do not change.

To reverse only the explicit key input, restore the previous environment-based credential contract together with its metadata, examples, fixtures, and tests, then rebuild the distribution. Consumers must update their workflow credential wiring accordingly.

## References

- [Research report](../research/action-authoring.md)
- [GitHub JavaScript action template CI](https://github.com/actions/javascript-action/blob/1fead38ed9c0cc1cee241ecea2e5b3e28772eab6/.github/workflows/ci.yml)
- [GitHub action documentation guidance](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions)
- [act local repository mapping](https://github.com/nektos/act/blob/v0.2.89/cmd/root.go)
- [act limitations](https://nektosact.com/not_supported.html)
