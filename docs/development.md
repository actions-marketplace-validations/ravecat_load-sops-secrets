# Development

## Environment and checks

The [Flake](../flake.nix) provides Node.js 24.16.0 with npm, Git, SOPS, age, `act`, `actionlint`, and `markdownlint-cli2`. Local development and GitHub CI use the same `flake.lock`; JavaScript dependencies are pinned in `package-lock.json`. Development tooling requires Node.js 24.15.0 or newer; the action metadata continues to select the GitHub Node.js 24 runtime.

Runtime source under `src/` and tests and fixtures under `tests/` use strict TypeScript. TypeScript 6.0.3 is pinned for compatibility with ncc 0.45 and the ESLint TypeScript parser; TypeScript 7 changes the compiler API used by these tools. `tsc --noEmit` checks source, test, and fixture types, while ncc compiles and bundles the action and its npm dependencies into the ready-to-run `dist/index.js`. Debug and release scripts remain JavaScript.

With Nix and flakes enabled, run from this project's directory:

```sh
nix develop
npm ci --ignore-scripts
npm run check
```

Alternatively, run `direnv allow` once to load the environment on directory entry. `.envrc` also loads an optional, ignored `.env` for local overrides. No environment variables, `.env` file, or real credentials are needed for the normal development commands.

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Check runtime, test, and fixture TypeScript with strict compiler settings without emitting files. |
| `npm run build` | Compile TypeScript and bundle npm dependencies into `dist/`. |
| `npm test` | Check source and bundle behavior without network access. Build first. |
| `npm run test:integration` | Exercise real SOPS download, decryption, offline cache reuse, and a wrong key. Build first. |
| `npm run lint` | Run workflow, source, and documentation lint. |
| `npm run lint:workflows` | Validate GitHub CI and the local workflow with actionlint. |
| `npm run lint:js` | Check TypeScript source, tests, fixtures, and JavaScript scripts and configuration with ESLint. |
| `npm run lint:docs` | Check README and documentation Markdown. |
| `npm run check` | Check types, build, lint, and run action and SOPS tests. |
| `npm run debug` | Create a disposable fixture and pause the actual source entrypoint in Node Inspector. |
| `npm run debug:workflow` | Rebuild and execute the synthetic workflow with act. |

The process tests cover source and distribution with the same cases, including malformed documents, required inputs, error sanitization, output encoding, and cache integrity. The real integration suite reports installation, offline cache reuse, output preservation, log secrecy, temporary-download cleanup, and wrong-key handling as named tests. Shared preparation needs network access for one SOPS download; subsequent action runs force offline cache reuse. Each test checks a captured result without depending on another test having run or passed.

Test files use the `.test.ts` suffix. `npm test` selects only `tests/*.test.ts`; `npm run test:integration` selects only `tests/integration/*.test.ts`. Fixtures and workflow scripts have no `.test` suffix and are not discovered as tests:

```text
tests/
  index.test.ts
  integration/
    sops.test.ts
    fixture.ts
    prepare.ts
    verify.ts
    workflow.yml
```

Node.js 24 runs the `.ts` source directly by stripping erasable type syntax; type checking is performed separately by `npm run typecheck`. Relative source imports use explicit `.ts` extensions. The compiler configuration enforces erasable syntax and rewrites relative import extensions for the emitted bundle. Decrypted JSON enters the program as `unknown` and is validated before any decrypted values are masked or published; TypeScript does not replace those runtime checks.

SOPS integration, source debugging, and workflow tests share [tests/integration/fixture.ts](../tests/integration/fixture.ts). It generates disposable age identities and encrypted synthetic data in private temporary directories. Each caller removes its fixture after use; partial creation is cleaned up by the builder. The mocked SOPS process in the fast tests remains separate because it supplies malformed documents and controlled failures without encryption or downloads.

The test executables and workflow fixture currently use POSIX facilities. Run this development loop on Linux; Windows support requires adapting those fixtures before adding a Windows test matrix.

actionlint assumes a closed output schema for local actions. [.github/actionlint.yaml](../.github/actionlint.yaml) suppresses only its missing-property diagnostics for the two dynamic fixture outputs in native CI. The next workflow step checks their values and the complete output object at runtime.

## Debug the source

From the development environment:

```sh
npm run debug
```

The command creates a fresh age identity, encrypted JSON, and writable output file in a private temporary directory. It starts `src/index.ts` with Node Inspector paused before execution, retaining the inherited environment and supplying that fixture through `INPUT_FILE` and `INPUT_KEY`.

Attach your editor's Node.js debugger to `127.0.0.1:9229` and set a breakpoint in `src/main.ts`. VS Code includes the **Attach to SOPS action** configuration in [.vscode/launch.json](../.vscode/launch.json). Continue execution, inspect the values, and disconnect when finished so Node can exit. Ctrl+C stops the child process and removes its fixture.

Action stdout is discarded because a terminal does not process GitHub's `add-mask` commands and would print their values. The Inspector address remains visible on stderr. The wrapper removes the fixture after normal exit, failure, or a handled interruption. Forced termination such as SIGKILL can prevent cleanup, so only synthetic values are used.

This runs the real Actions Toolkit. The inspected `@github/local-action` implementation skips outputs containing registered secrets, so it is not used to verify this action's masked-output contract. See its [setOutput implementation](https://github.com/github/local-action/blob/b9351d8a8f1e6eed27646f4d892b49a3847ba180/src/stubs/core/core.ts#L337) and GitHub's [same-job output example](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#example-masking-a-generated-output-within-a-single-job).

## Debug the workflow

From the development environment:

```sh
npm run debug:workflow
```

npm first rebuilds `dist/`, then `act --local-repository` resolves the [workflow](../tests/integration/workflow.yml)'s `ravecat/load-sops-secrets@local` reference from the current directory, including uncommitted changes. Re-run the command after source edits. The override removes the need for publication or manual copying into another project.

The checkout step makes this project's helper files available in act's runner workspace. The project [.actrc](../.actrc) selects this workflow and maps `ubuntu-24.04` to host execution. The Flake supplies the tools; Docker and GitHub runner registration are not required. Automatic `.env`, `.secrets`, `.input`, and `.vars` file loading by act is disabled.

The dependency installation step enters the pinned Nix shell using `path:.`, so it uses the required Node.js version without relying on Git metadata in act's copied workspace. Subsequent fixture steps and the action continue to use Node.js 24 from the runner. The workflow installs the pinned npm dependencies for the fixture helper, then creates a private temporary fixture using [tests/integration/fixture.ts](../tests/integration/fixture.ts). Setup masks the generated multiline identity before publishing it as a same-job step output. The action receives the encrypted file path and identity text through `with.file` and `with.key`. The next step verifies all dynamic outputs, including ordinary, multiline, and empty strings, without printing values. An `always()` step removes the fixture on success or failure.

The default workflow fixture uses LF line endings because [act v0.2.89's output-file parser](https://github.com/nektos/act/blob/v0.2.89/pkg/container/parse_env_file.go) normalizes CRLF to LF. The real SOPS integration supplies a CRLF document to the same generator and checks exact output bytes, including percent signs and quotes. Assertions do not normalize expected values to accommodate the emulator.

This local-only workflow stays outside `.github/workflows/` because GitHub cannot resolve its unpublished `@local` reference. act may report missing Git-ref warnings before a repository's first commit. Its local repository override still supports that development state.

act only approximates GitHub's runner: its documented limitations include permissions and OIDC. A passing local workflow does not verify cloud authentication or replace a run on GitHub. Workflow execution also does not provide source breakpoints; use Node Inspector for those.

## Use a sibling action checkout

From another project's directory, map the exact repository and ref used in its workflow to this action's checkout:

```sh
act workflow_dispatch -W path/to/test-workflow.yml \
  --local-repository \
  'ravecat/load-sops-secrets@v1=/absolute/path/to/load-sops-secrets'
```

Replace the workflow path and action directory with your local paths. Build the action in its own environment before running the consumer's workflow. The left side of `--local-repository` must match the consumer's `uses` repository and ref exactly; it does not replace `uses: ./path/to/action`.

Infra uses `ravecat/load-sops-secrets@v1`, so its override uses `@v1` while this project's standalone workflow uses `@local`. act prepares its own runner workspace from the mapped checkout. GitHub execution requires a published repository and revision; it cannot read a directory on your computer.

## GitHub CI checks

[ci.yml](../.github/workflows/ci.yml) runs on branch pushes, pull requests, and manual dispatches. Its `lint` and `test` jobs run in parallel on every invocation. Lint checks workflows, TypeScript types, source, and Markdown. Test builds the action and covers source and bundle behavior, real SOPS integration, and a native `uses: ./` invocation with output verification in the next step.

The `release` job requires both checks to succeed and runs only for a push or manual dispatch on the current default branch from `github.event.repository.default_branch`. It rebuilds the bundle in its own runner. A push runs `npm run release -- --branches "$RELEASE_BRANCH" --dry-run` to preview the next release. A manual CI dispatch runs fresh checks before `npm run release -- --branches "$RELEASE_BRANCH"` can publish. `RELEASE_BRANCH` comes from the same event metadata, so changing the default branch from `master` to `main` requires no workflow or release configuration edits. Pull requests and other refs run checks without release execution. Tag pushes do not trigger CI.

The release job serializes release attempts and holds `contents: write`; the check jobs have read-only access. Dry-run also needs release credentials because semantic-release verifies push permission. It does not publish a release. A manual run publishes only when semantic-release finds releasable commits.

The native action step uses GitHub's Node.js 24 runtime. The custom Nix shell applies to `run` steps only, so SOPS lookup and automatic installation run in the consumer environment. Test credentials are disposable age identities, and fixtures are cleaned after success or failure.

## Troubleshooting

- **Fixture creation fails:** enter `nix develop` and check that `sops` and `age-keygen` are available. The fixture builder removes partial output and reports a sanitized error.
- **Debugger does not connect:** confirm port 9229 is free, run `npm run debug`, and attach before continuing execution.
- **Workflow cannot find the action:** check the exact repository/ref mapping and rebuild in the mapped checkout.
- **SOPS setup fails:** check platform support, writable runner cache/temp directories, and network access to GitHub releases on a cold cache.
- **Decryption fails:** check the encrypted file and the age identity supplied through `with.key`. Use synthetic fixtures for reproductions instead of printing real SOPS diagnostics.
- **GitHub-only failure:** enable `ACTIONS_STEP_DEBUG` or `ACTIONS_RUNNER_DEBUG`, or re-run with debug logging. Extra logs do not provide source breakpoints; avoid printing secrets while collecting diagnostics.

## References

- [GitHub JavaScript action template](https://github.com/actions/javascript-action)
- [Checkout test workflow](https://github.com/actions/checkout/blob/f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a/.github/workflows/test.yml)
- [GitHub workflow triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub action documentation guidance](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions)
- [GitHub debug logging](https://docs.github.com/en/actions/how-tos/monitor-workflows/enable-debug-logging)
- [Node.js Inspector](https://nodejs.org/docs/latest-v24.x/api/debugger.html#v8-inspector-integration-for-nodejs)
- [Node.js TypeScript support](https://nodejs.org/docs/latest-v24.x/api/typescript.html)
- [ncc TypeScript support](https://github.com/vercel/ncc#with-typescript)
- [TypeScript compiler API compatibility](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0)
- [SOPS 3.13.1 release](https://github.com/getsops/sops/releases/tag/v3.13.1)
- [act local repository mapping](https://github.com/nektos/act/blob/v0.2.89/cmd/root.go)
- [act host execution](https://nektosact.com/usage/runners.html)
- [act limitations](https://nektosact.com/not_supported.html)
