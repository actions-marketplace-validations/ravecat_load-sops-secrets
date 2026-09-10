# GitHub Action authoring research for load-sops-secrets

Research date: 2026-09-08. This is a historical assessment of the project before the development update; the development specification records subsequent implementation and verification. Scope: official authoring and documentation guidance, practices in established actions, and applicability to the current local project. This is research and recommendations, not an implementation plan or completed implementation.

## Main recommendation

Keep the current JavaScript action format, Node.js test runner, ncc bundle, Nix development environment, source debugger, and synthetic SOPS fixtures. The highest-value additions would be consumer-facing documentation and a native GitHub Actions test that invokes the checked-out action through `uses: ./` and verifies outputs in a subsequent step. These are recommendations inferred from the comparison, not changes made in this investigation.

The current official JavaScript template demonstrates separate source tests, a real action invocation, bundle consistency checks, and local debugging. This separation is more transferable than its particular choice of Jest, Rollup, or linting dependencies. Sources: [template CI](https://github.com/actions/javascript-action/blob/1fead38ed9c0cc1cee241ecea2e5b3e28772eab6/.github/workflows/ci.yml), [bundle check](https://github.com/actions/javascript-action/blob/1fead38ed9c0cc1cee241ecea2e5b3e28772eab6/.github/workflows/check-dist.yml), [scripts](https://github.com/actions/javascript-action/blob/1fead38ed9c0cc1cee241ecea2e5b3e28772eab6/package.json).

## Method and limits

- Primary sources only: GitHub documentation, maintainers' repositories and CI files, and the act maintainers' documentation.
- The comparison covers actions/checkout, actions/setup-node, actions/cache, docker/build-push-action, and aws-actions/configure-aws-credentials. This is a representative sample of established workflow building blocks, not a verified global ranking by workflow executions. Repository stars are not execution counts.
- Repository evidence is pinned to inspected commit SHAs where possible. Official documentation pages were read on the research date.
- Remote source and configuration files were inspected, not executed. Local source, tests, workflows, package scripts, README, and development specification were read. Local tests and remote CI jobs were not rerun for this research, so existing written validation records are not presented as new test results.
- At research time, the local project had an unborn main branch and existing uncommitted implementation and documentation. The original report was stored outside the repository to avoid changing that baseline, then retained here with the authorized development update. No new issue, specification, or implementation task status was created.
- During the final read-only status check, dist/ was absent, although it existed at the start. No command in this research deleted or rebuilt it. Distribution observations describe the inspected metadata, build scripts and test definitions, not a currently verified release artifact.

## Official guidance and its purpose

### Describe the consumer contract

GitHub recommends that README explain the action's purpose, required and optional inputs and outputs, credentials or secrets, environment variables, and a workflow example. This lets a consumer decide whether the action fits their workflow before learning how the maintainer builds it. Source: [Managing custom actions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions#creating-a-readme-file-for-your-action).

`action.yml` supplies machine-readable metadata and execution settings. Setting `required: true` in metadata does not itself enforce a missing-input error; the implementation must validate it. JavaScript action outputs may be set without being declared in metadata. Consequently, load-sops-secrets can retain dynamic output names and document their generation rule rather than invent a fixed aggregate output. Source: [Metadata syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax).

### Publish executable distribution and verify it

A JavaScript action must include the dependencies needed for execution in the revision consumers use. GitHub documents bundling source and dependencies, including with ncc. The runnable artifact and action metadata must agree. Source: [Creating a JavaScript action](https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action#commit-tag-and-push-your-action).

The official template has a separate CI job invoking `uses: ./` after checkout. It also rebuilds dist and checks the difference. These catch different problems: source tests can pass while metadata or the committed bundle is wrong. Sources: [template CI](https://github.com/actions/javascript-action/blob/1fead38ed9c0cc1cee241ecea2e5b3e28772eab6/.github/workflows/ci.yml), [template dist check](https://github.com/actions/javascript-action/blob/1fead38ed9c0cc1cee241ecea2e5b3e28772eab6/.github/workflows/check-dist.yml).

GitHub encourages unit, integration, and end-to-end coverage and semantic releases. Its maintenance guide also demonstrates building distribution only in release commits; therefore committing dist on every development branch is an established approach, not a universal requirement. For this project, preserving its existing checked-in-dist approach is the smaller change. Sources: [Releasing and maintaining actions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/release-and-maintain-actions), [local CI](../../.github/workflows/test.yml).

### Document secrets within the correct scope

GitHub explicitly documents masking a generated secret and exposing it through GITHUB_OUTPUT to later steps in the same job. Job outputs crossing job boundaries are a different mechanism: secret-containing job outputs are withheld. The README should make the intended same-job consumption explicit. Sources: [same-job masked output example](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#example-masking-a-generated-output-within-a-single-job), [job outputs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs).

Masking is a log-redaction mechanism, not an assurance that every transformed secret is safe to print. Synthetic fixtures and sanitized error assertions are directly relevant to this action. Source: [GitHub secure use reference](https://docs.github.com/en/actions/reference/security/secure-use#use-secrets-for-sensitive-information).

## Local execution and debugging

| Method | What it answers | Important boundary |
| --- | --- | --- |
| Native Node.js tests | Does the code and process contract behave correctly for controlled inputs and failures? | Does not execute GitHub's runner expression and command handling |
| Node Inspector | Where does the actual JavaScript execution diverge from expectations? | The developer supplies inputs, output files, credentials, and other environment requirements |
| `@github/local-action` | Can source logic run with emulated Toolkit functionality and IDE breakpoints? | Replaces Toolkit behavior; targets source, not a bundle containing dependencies |
| `act` | Does a local workflow connect steps and outputs as expected? | Partial runner emulation with unsupported platform features |
| GitHub CI using `uses: ./` | Does the delivered action work through the native runner and metadata? | Requires a workflow run on GitHub; cannot consume unpublished changes on a developer's disk |

The template supplies a local-action npm command, an example environment file, and a VS Code launch configuration. These improve the contributor path by making debugger setup repeatable. Sources: [template launch configuration](https://github.com/actions/javascript-action/blob/1fead38ed9c0cc1cee241ecea2e5b3e28772eab6/.vscode/launch.json), [example environment](https://github.com/actions/javascript-action/blob/1fead38ed9c0cc1cee241ecea2e5b3e28772eab6/.env.example).

### Why local-action is not a drop-in contract test here

The inspected local-action version is 7.0.1 at commit b9351d8a8f1e6eed27646f4d892b49a3847ba180. Its README says it emulates Toolkit functions and cannot stub dependencies already bundled into dist. Its published support table identifies @actions/core 2.0.2, while this project uses 3.0.1; that difference requires checking rather than assuming compatibility. Sources: [README](https://github.com/github/local-action/blob/b9351d8a8f1e6eed27646f4d892b49a3847ba180/README.md), [package manifest](https://github.com/github/local-action/blob/b9351d8a8f1e6eed27646f4d892b49a3847ba180/package.json), [local manifest](../../package.json).

More concretely, its `setSecret` stub records the secret, and its `setOutput` stub skips values containing a registered secret. In this project, all nonempty secret values are registered before outputs are written. Inference from the inspected code: this emulator would reject those outputs if execution reaches the stub, even though GitHub documents this same-job step-output pattern as supported. It is therefore unsuitable as the sole verification of this action's output contract. This conclusion comes from source comparison, not a local-action execution performed in this research. Sources: [local-action core stub](https://github.com/github/local-action/blob/b9351d8a8f1e6eed27646f4d892b49a3847ba180/src/stubs/core/core.ts#L337), [our main function](../../src/main.ts), [GitHub same-job example](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#example-masking-a-generated-output-within-a-single-job).

Recommendation: keep direct Node Inspector as the default source debugger; an editor launch configuration and a disposable fixture setup can improve ergonomics without changing Toolkit behavior.

### act remains useful with explicit limits

act supports host execution via a runner mapping to `-self-hosted`; this does not require installing or registering a GitHub self-hosted runner. Its documented limitations include ignored permissions and concurrency, incomplete context, and missing OIDC endpoint support. A successful act run therefore cannot certify permission or cloud OIDC behavior. Sources: [act runner modes](https://nektosact.com/usage/runners.html), [unsupported functionality](https://nektosact.com/not_supported.html).

The project's `.actrc` uses host execution and disables implicit loading of local env/secret/input/variable files. Its local workflow generates a fresh age identity and synthetic encrypted data, then checks ordinary, multiline, and empty outputs. This is well aligned with a fast local workflow check. Sources: [act configuration](../../.actrc), [local workflow](../../integration/workflow.yml), [development guide](../../docs/development.md).

For diagnosing actual GitHub runs, document ACTIONS_STEP_DEBUG and ACTIONS_RUNNER_DEBUG or the debug rerun option. These provide additional logs, not source breakpoints. Source: [Enabling debug logging](https://docs.github.com/en/actions/how-tos/monitor-workflows/enable-debug-logging).

## Findings in the local project

| Area | Observed state | Practical recommendation |
| --- | --- | --- |
| README | Opens with local workflow execution; lacks a normal consumer example and a full input/output contract | Lead with purpose, a real usage example, expected plaintext JSON shape, dynamic outputs, credential environment, requirements and errors; link development instructions separately |
| Architecture | Small entrypoint invokes an exported main function; SOPS setup is separate | Preserve the existing structure |
| Source and bundle tests | The same process-level cases exercise src/index.js and dist/index.js using a fake SOPS executable | Keep these tests; calling them only unit tests understates the process and file protocol checks |
| Real SOPS integration | Exercises download, cache reuse with unreachable proxies, correct decryption, and a wrong key | Keep synthetic integration coverage and document its network prerequisite |
| CI distribution check | Rebuilds and runs `git diff --exit-code -- dist` | Retain; it only compares tracked content, so it should not be described as proving no untracked build output exists |
| Native runner invocation | GitHub CI runs Node tests but never invokes the local action through uses | Add a small native workflow test using `uses: ./` and verify dynamic outputs in the next step |
| Supported platforms | Installer lists Linux, macOS and Windows binaries for x64/arm64; CI has one Ubuntu job | State what is actually tested; add platforms only when they are part of the intended support contract |
| Portability of tests | Fake SOPS uses an executable script with a POSIX shebang | A Windows matrix requires adapting the fixture; simply adding a runner label is insufficient |
| Documentation checks | No dedicated Markdown, link, metadata-to-README, or documented-example check appears in current scripts or CI | Start with one consumer example exercised as a workflow; use formatting/link checks where useful; avoid generating a large docs framework for a single input |
| Local breakpoints | `node --inspect-brk src/index.js`, with environment and output-file setup documented | Make launch and fixture setup repeatable if this is a frequent workflow |

Local evidence: [README](../../README.md), [package scripts](../../package.json), [CI](../../.github/workflows/test.yml), [process tests](../../test/index.test.js), [SOPS integration test](../../integration/sops.js), [installer](../../src/sops.ts).

## Recommended documentation boundary

For this small action, README should own consumer usage and the public contract. The existing docs/development.md should own environment setup, build/test commands, synthetic fixtures, source breakpoints, act workflow runs, and release preparation. A short CONTRIBUTING.md can link there if external contributions become relevant; duplicating the same setup instructions would create drift.

The consumer-facing material should explain:

1. A workflow step with id, file input, supplied decryption environment, and use of a known output in a later step through env.
2. The decrypted shape: a flat JSON object of strings; treatment of empty and multiline values; output-name constraints and case-insensitive collisions.
3. Dynamic outputs, including that an output called secrets is just an ordinary key rather than a built-in aggregate.
4. Existing SOPS versus automatically downloaded SOPS, network needs, and tested runtime/platform requirements.
5. Same-job scope of secret outputs, sanitized errors, and limits of log masking.
6. The release reference consumers can use after publication; distinguish a placeholder example from a version that actually exists.

These items are inferred directly from [action metadata](../../action.yml), [runtime behavior](../../src/main.ts), [SOPS setup](../../src/sops.ts), and the official README guidance above. No public release was verified during this research.

Documentation validation has separate levels: Markdown formatting checks presentation; link checks catch broken references; metadata generation checks parameter drift; an executed workflow example checks whether documented usage actually works. No one of these proves the others. A native same-job output test provides the most direct additional assurance for this project's documented use case.

## Established action comparison

The following appendix records the independent primary-source repository comparison.

## GitHub Action maintenance practices observed in five established repositories

Researched on 2026-09-08. Read-only source inspection; no remote project code was executed. This is a purpose-selected comparison of checkout, runtime setup, caching, container builds, and cloud authentication, not a ranking by workflow usage. GitHub stars are only an interest proxy and cannot establish which actions are most used.

### Pinned revisions

| Repository | Default branch revision inspected | Commit date | Stars observed via GitHub API |
| --- | --- | --- | ---: |
| [actions/checkout](https://github.com/actions/checkout) | `f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a` | 2026-07-20 | 8,856 |
| [actions/setup-node](https://github.com/actions/setup-node) | `94196ee1d15439c1b6651cd87ef14e88ec435966` | 2026-08-25 | 4,956 |
| [actions/cache](https://github.com/actions/cache) | `3edfce9056124e459a23f683a21433670d47daca` | 2026-07-15 | 5,544 |
| [docker/build-push-action](https://github.com/docker/build-push-action) | `2ca78c6bec76527009825f31aae0532b4d40d820` | 2026-08-10 | 5,393 |
| [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) | `6782cb1b6df5d32e9354c1e6d6da4f956c0d61c4` | 2026-09-08 | 3,000 |

Revision and star metadata came from each repository's first-party `api.github.com/repos/{owner}/{repo}` and `commits/{default_branch}` endpoints. The code citations below are immutable. Default-branch snapshots are not necessarily the latest released versions.

### actions/checkout

- Local development: TypeScript, Node >=24, Jest; `npm run build` runs `tsc`, bundles with `ncc`, then regenerates the README usage block. Separate `format-check` and `lint` scripts exist. The contributor guide explicitly requires tests and rebuilding `dist/index.js`. [package.json](https://github.com/actions/checkout/blob/f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/package.json), [CONTRIBUTING.md](https://github.com/actions/checkout/blob/f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/CONTRIBUTING.md).
- Tests: a Linux build/unit/static-check job, plus actual `uses: ./` integration on Ubuntu, macOS, and Windows. Scenarios exercise cleaning, sparse checkout, LFS, submodules, worktree credentials, REST fallback, proxy behavior, and outputs. The workflow verifies observable files and Git state with shell scripts. [test.yml](https://github.com/actions/checkout/blob/f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/.github/workflows/test.yml).
- Distribution: CI rebuilds and compares `dist/`. This tests whether the committed executable matches source, separately from source unit tests. [check-dist.yml](https://github.com/actions/checkout/blob/f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/.github/workflows/check-dist.yml).
- Documentation: `src/misc/generate-docs.ts` reads `action.yml`, derives input descriptions/defaults, and replaces the README block between usage markers. The build job subsequently runs `__test__/verify-no-unstaged-changes.sh`, which fails on nonempty `git status --porcelain`, so a stale generated README also fails CI. This is metadata-to-documentation consistency checking, not execution of README YAML examples. [generator](https://github.com/actions/checkout/blob/f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/src/misc/generate-docs.ts), [clean-tree check](https://github.com/actions/checkout/blob/f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/__test__/verify-no-unstaged-changes.sh).
- Consumer docs present inputs, scenario recipes, version changes, and recommended token permissions. The current README says contributions are paused, while CONTRIBUTING still describes submitting PRs. This is an observed documentation inconsistency; popularity does not guarantee every instruction is current. [README](https://github.com/actions/checkout/blob/f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/README.md).

### actions/setup-node

- Local development: Jest with coverage, `ncc` bundles for the main action and cache-save post step, and `npm run pre-checkin` that formats, fixes lint, builds, and tests. Contributors are told where unit and workflow end-to-end tests live, and to cover successful execution, edge cases, and errors. [package.json](https://github.com/actions/setup-node/blob/94196ee1d15439c1b6651cd87ef14e88ec435966/package.json), [contributors guide](https://github.com/actions/setup-node/blob/94196ee1d15439c1b6651cd87ef14e88ec435966/docs/contributors.md).
- Tests: real `uses: ./` installation/version tests and npm/pnpm/Yarn caching scenarios. Main matrices include Ubuntu, Windows, macOS, Intel macOS, and installed Node versions 22/24/26. This version matrix tests Node installations supplied to consumers; it does not mean the action itself runs under three Node runtimes. Separate proxy tests exist. [versions.yml](https://github.com/actions/setup-node/blob/94196ee1d15439c1b6651cd87ef14e88ec435966/.github/workflows/versions.yml), [e2e-cache.yml](https://github.com/actions/setup-node/blob/94196ee1d15439c1b6651cd87ef14e88ec435966/.github/workflows/e2e-cache.yml), [proxy.yml](https://github.com/actions/setup-node/blob/94196ee1d15439c1b6651cd87ef14e88ec435966/.github/workflows/proxy.yml).
- Basic validation and dist freshness delegate to `actions/reusable-workflows@main`, with Node 24. At inspected reusable revision `d468c63c53c1184242904d1a3ac74fd1081f36c8`, basic validation runs lockfile installation, formatting, lint, build, tests, and an npm audit on three OSes. Dist validation rebuilds and compares the distribution. These callers use a moving branch, so repository SHA alone does not freeze their full behavior. [caller](https://github.com/actions/setup-node/blob/94196ee1d15439c1b6651cd87ef14e88ec435966/.github/workflows/basic-validation.yml), [dist caller](https://github.com/actions/setup-node/blob/94196ee1d15439c1b6651cd87ef14e88ec435966/.github/workflows/check-dist.yml), [reusable validation](https://github.com/actions/reusable-workflows/blob/d468c63c53c1184242904d1a3ac74fd1081f36c8/.github/workflows/basic-validation.yml), [reusable dist check](https://github.com/actions/reusable-workflows/blob/d468c63c53c1184242904d1a3ac74fd1081f36c8/.github/workflows/check-dist.yml).
- Local debugging: checked-in VS Code configuration launches Jest with `--inspect-brk` and `--runInBand`. However, unlike the current npm test script, it lacks `--experimental-vm-modules`; treat it as a debugging pattern requiring verification, not a validated drop-in configuration. It was not executed during this research. [launch.json](https://github.com/actions/setup-node/blob/94196ee1d15439c1b6651cd87ef14e88ec435966/.vscode/launch.json).
- Docs separate README/quick usage, advanced scenarios, contributor process, architectural decisions, and test-fixture provenance. The contributor guide requests manual spelling/consistency review. Inspected format scripts target TS/YAML, not Markdown, and the inspected workflows do not execute extracted README examples. [advanced usage](https://github.com/actions/setup-node/blob/94196ee1d15439c1b6651cd87ef14e88ec435966/docs/advanced-usage.md), [fixture README](https://github.com/actions/setup-node/blob/94196ee1d15439c1b6651cd87ef14e88ec435966/__tests__/README.md).

### actions/cache

- Local development: `npm test` performs `tsc --noEmit` followed by Jest with coverage; the build bundles four main/post/standalone entry points using `ncc`. [package.json](https://github.com/actions/cache/blob/3edfce9056124e459a23f683a21433670d47daca/package.json).
- Tests: three-OS source validation plus separate real-runner save and restore jobs. Restore depends on save and verifies files both inside and outside the workspace. Proxy cases use Squid and block direct HTTP/HTTPS to prove the proxy path is actually used. `check-dist` delegates to the reusable workflow above. [workflow.yml](https://github.com/actions/cache/blob/3edfce9056124e459a23f683a21433670d47daca/.github/workflows/workflow.yml), [check-dist.yml](https://github.com/actions/cache/blob/3edfce9056124e459a23f683a21433670d47daca/.github/workflows/check-dist.yml).
- Debugging caution: the VS Code Jest configuration references `jest.config.js`, but the inspected tree contains `jest.config.ts`. It also omits the ESM runtime flag present in `npm test`. This is concrete stale-config evidence, not a claim that the config was run and failed. [launch.json](https://github.com/actions/cache/blob/3edfce9056124e459a23f683a21433670d47daca/.vscode/launch.json), [actual config](https://github.com/actions/cache/blob/3edfce9056124e459a23f683a21433670d47daca/jest.config.ts).
- Consumer documentation separates the main contract, language-specific examples, cache strategies, restore/save subactions, and tips for timeouts, cross-OS behavior, scope, and eviction. No automatic README-example execution or documentation-link checking was identified in the inspected scripts/workflows. [README](https://github.com/actions/cache/blob/3edfce9056124e459a23f683a21433670d47daca/README.md), [examples](https://github.com/actions/cache/blob/3edfce9056124e459a23f683a21433670d47daca/examples.md), [tips](https://github.com/actions/cache/blob/3edfce9056124e459a23f683a21433670d47daca/tips-and-workarounds.md).

### docker/build-push-action

- Local and CI commands share a containerized development definition: `docker buildx bake test`, `pre-checkin`, and `validate`. The latter checks lint, regenerated distribution, and lockfile consistency. `pre-checkin` updates dependency lockfile, formatting, and build. The Node 24 development image runs immutable Yarn installation. [contributing](https://github.com/docker/build-push-action/blob/2ca78c6bec76527009825f31aae0532b4d40d820/.github/CONTRIBUTING.md), [Bake targets](https://github.com/docker/build-push-action/blob/2ca78c6bec76527009825f31aae0532b4d40d820/docker-bake.hcl), [development Dockerfile](https://github.com/docker/build-push-action/blob/2ca78c6bec76527009825f31aae0532b4d40d820/dev.Dockerfile).
- Toolchain: Vitest, ESLint, esbuild; bundle output is `dist/index.cjs`, with a source map and dependency licenses. Coverage covers source TS but excludes the main entry point. The unit CI calls the same Bake test target. [package.json](https://github.com/docker/build-push-action/blob/2ca78c6bec76527009825f31aae0532b4d40d820/package.json), [Vitest config](https://github.com/docker/build-push-action/blob/2ca78c6bec76527009825f31aae0532b4d40d820/vitest.config.ts), [test workflow](https://github.com/docker/build-push-action/blob/2ca78c6bec76527009825f31aae0532b4d40d820/.github/workflows/test.yml).
- Integration: extensive Ubuntu `uses: ./`/`./action` scenarios cover contexts, secrets, build errors, cache backends, outputs, proxies, attestations, and summaries. A separate scheduled/main/tag/manual end-to-end workflow tests multiple real registries against stable, edge, and development Buildx/BuildKit combinations. These are integration dimensions chosen for the domain, not a generic three-OS requirement. [ci.yml](https://github.com/docker/build-push-action/blob/2ca78c6bec76527009825f31aae0532b4d40d820/.github/workflows/ci.yml), [e2e.yml](https://github.com/docker/build-push-action/blob/2ca78c6bec76527009825f31aae0532b4d40d820/.github/workflows/e2e.yml), [reusable e2e](https://github.com/docker/build-push-action/blob/2ca78c6bec76527009825f31aae0532b4d40d820/.github/workflows/.e2e-run.yml).
- Diagnostics: troubleshooting tells users to enable BuildKit debugging in setup-buildx and attach container logs. README explains job summaries and downloadable build records importable into Docker Desktop. This is both producer-side diagnostics and consumer-side inspection. These instructions are domain-specific; uploading an equivalent record of decrypted secrets would be inappropriate. [troubleshooting](https://github.com/docker/build-push-action/blob/2ca78c6bec76527009825f31aae0532b4d40d820/TROUBLESHOOTING.md), [README summaries](https://github.com/docker/build-push-action/blob/2ca78c6bec76527009825f31aae0532b4d40d820/README.md#summaries).

### aws-actions/configure-aws-credentials

- Local checks: `npm test` runs Biome/Markdown lint, Vitest with coverage, and TypeScript build. `npm run package` separately bundles both action and cleanup with esbuild for Node 24 and generates dependency licensing output. [package.json](https://github.com/aws-actions/configure-aws-credentials/blob/6782cb1b6df5d32e9354c1e6d6da4f956c0d61c4/package.json), [Vitest config](https://github.com/aws-actions/configure-aws-credentials/blob/6782cb1b6df5d32e9354c1e6d6da4f956c0d61c4/vitest.config.mts).
- Unit CI uses Windows, Ubuntu, and macOS. Real AWS integration tests are separately gated; examples cover OIDC, static credentials, role chaining, restrictive policies, proxies, token files, and profiles. They verify behavior using AWS CLI identity/permission checks, not only successful action exit. [unit workflow](https://github.com/aws-actions/configure-aws-credentials/blob/6782cb1b6df5d32e9354c1e6d6da4f956c0d61c4/.github/workflows/tests-unit.yml), [integration workflow](https://github.com/aws-actions/configure-aws-credentials/blob/6782cb1b6df5d32e9354c1e6d6da4f956c0d61c4/.github/workflows/tests-integ-release.yml).
- Packaging differs from the other examples: a workflow builds/tests/packages on main, then commits generated distribution and licensing files using bot credentials. A subsequent dist-changing push runs actual `uses: ./` integration. An explicit PR `check-dist` gate was not found in the inspected workflows; do not describe all five projects as using the same release discipline. [package-dist.yml](https://github.com/aws-actions/configure-aws-credentials/blob/6782cb1b6df5d32e9354c1e6d6da4f956c0d61c4/.github/workflows/package-dist.yml), [tests-integ-push.yml](https://github.com/aws-actions/configure-aws-credentials/blob/6782cb1b6df5d32e9354c1e6d6da4f956c0d61c4/.github/workflows/tests-integ-push.yml).
- Documentation starts with a complete OIDC quick start, then security/permissions, authentication choices, options, failure workarounds, trust policy details, and examples. It recommends a dedicated OIDC debugger for inspecting claim values, with a private-repository caveat. CONTRIBUTING asks for reproducible reports and locally passing tests but does not provide a detailed local stepping-debugger tutorial. [README](https://github.com/aws-actions/configure-aws-credentials/blob/6782cb1b6df5d32e9354c1e6d6da4f956c0d61c4/README.md), [CONTRIBUTING](https://github.com/aws-actions/configure-aws-credentials/blob/6782cb1b6df5d32e9354c1e6d6da4f956c0d61c4/CONTRIBUTING.md).

### Transferable conclusions and limits

1. Use fast local tests for parsing, branching, failures, and mockable boundaries; use real runner `uses: ./` tests to exercise the action metadata and distributed entry point. All five inspected repositories use actual checked-out actions in at least some integration workflows.
2. Make bundle freshness a distinct delivery check. For a small action, lockfile install, build, and a checked distribution comparison are simpler than AWS's privileged bot packaging pipeline. Do not assume a successful source test proves the shipped JavaScript works.
3. Verify the README's minimal user scenario through an explicit smoke workflow. This is a recommendation inferred from the observed integration pattern; automatic extraction/execution of README fenced YAML was not observed. Checkout checks generated metadata consistency; AWS runs Markdown lint. Neither is equivalent to executing all examples or validating every link/schema.
4. Separate user instructions from contributor instructions. User docs need a working example, inputs/outputs/defaults, permissions, supported environments, limitations, and actionable diagnostics. Contributor docs need exact install, test, build, debug, and release commands. Borrow the structure without copying the full documentation volume of a much larger action.
5. Local debugging does not require workflow emulation as the first step: Jest/Vitest under the Node debugger can inspect ordinary source code. No `nektos/act` or `@github/local-action` contributor recipe was found in the inspected README/contributor/VS Code files for this sample. That is a scoped observation, not a project-wide absence claim or proof these tools are unsuitable.
6. Test documented debugging commands themselves. The stale cache launch configuration and setup-node's runtime-flag mismatch show why a checked-in debugger file alone is insufficient evidence of a working developer experience.
7. For a SOPS action, infer a small acceptance set from its actual contract: synthetic encrypted fixture decryption; missing/invalid key and malformed input; downloaded versus preinstalled SOPS where supported; output transport including multiline/special characters; and absence of plaintext secrets in captured diagnostics. Use public test-only keys and synthetic values for such fixtures. Keep real cloud/OIDC integration separate from the default local loop if it is needed at all.

No schema/link checker or automatic README-example runner was established by this bounded inspection. This does not exclude checks in shared organization infrastructure or other uninspected files. No CI runs or debugger configurations were executed; observations describe source definitions, not verified current pass rates.

## TypeScript source follow-up, 2026-09-09

The runtime source now uses strict TypeScript while the Node test runner, JavaScript helpers, and ncc delivery bundle remain in place. The explicit compiler check runs through `npm run typecheck`; Node.js 24 executes the same TypeScript source directly for process tests and debugging. ncc includes the runtime npm dependencies in `dist/index.js`, preserving the consumer entrypoint. This extends the current authoring and delivery work; the earlier assessment above remains historical. Source paths in maintained links now resolve to `.ts` files. See the [development contract](../specs/local-action-debugging.md) for migration constraints and verification.
