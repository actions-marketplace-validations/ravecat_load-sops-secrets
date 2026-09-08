# Development

## Environment and checks

The [Flake](../flake.nix) provides Node.js 24 with npm, Git, SOPS, age, `act`, `actionlint`, and `markdownlint-cli2`. Local development and GitHub CI use the same `flake.lock`; JavaScript dependencies are pinned in `package-lock.json`.

With Nix and flakes enabled, run from this project's directory:

```sh
nix develop
npm ci --ignore-scripts
npm run check
```

Alternatively, run `direnv allow` once to load the environment on directory entry. `.envrc` also loads an optional, ignored `.env`; [.env.example](../.env.example) documents the optional diagnostic setting. No `.env` file or real credentials are needed for the normal development commands.

| Command | Purpose |
| --- | --- |
| `npm run build` | Bundle the source and npm dependencies into `dist/`. |
| `npm test` | Check source and bundle behavior using a fake SOPS executable. Build first. |
| `npm run test:integration` | Exercise real SOPS download, decryption, offline cache reuse, and a wrong key. Build first. |
| `npm run lint:workflows` | Validate GitHub CI and the local workflow with actionlint. |
| `npm run lint:docs` | Check README and documentation Markdown. |
| `npm run check` | Build, lint workflows and documentation, then run both test layers. |
| `npm run check:dist` | Require the distribution files to be tracked and unchanged from the index, with no untracked distribution files. |
| `npm run debug` | Create a disposable fixture and pause the actual source entrypoint in Node Inspector. |
| `npm run debug:workflow` | Rebuild and execute the synthetic workflow with act. |

The process tests cover source and distribution with the same cases, including malformed documents, required inputs, error sanitization, output encoding, and cache integrity. The real integration test needs network access for its first SOPS download; subsequent checks force offline cache reuse. Test data and keys are synthetic.

The test executables and workflow fixture currently use POSIX facilities. Run this development loop on Linux; Windows support requires adapting those fixtures before adding a Windows test matrix.

actionlint assumes a closed output schema for local actions. [.github/actionlint.yaml](../.github/actionlint.yaml) suppresses only its missing-property diagnostics for the two dynamic fixture outputs in native CI. The next workflow step checks their values and the complete output object at runtime.

## Debug the source

From the development environment:

```sh
npm run debug
```

The command creates a fresh age identity, encrypted JSON, and writable output file in a private temporary directory. It starts `src/index.js` with Node Inspector paused before execution, using that fixture instead of ambient age credentials.

Attach your editor's Node.js debugger to `127.0.0.1:9229` and set a breakpoint in `src/main.js`. VS Code includes the **Attach to SOPS action** configuration in [.vscode/launch.json](../.vscode/launch.json). Continue execution, inspect the values, and disconnect when finished so Node can exit. Ctrl+C stops the child process and removes its fixture.

Action stdout is discarded because a terminal does not process GitHub's `add-mask` commands and would print their values. The Inspector address remains visible on stderr. The wrapper removes the fixture after normal exit, failure, or a handled interruption. Forced termination such as SIGKILL can prevent cleanup, so only synthetic values are used.

This runs the real Actions Toolkit. The inspected `@github/local-action` implementation skips outputs containing registered secrets, so it is not used to verify this action's masked-output contract. See its [setOutput implementation](https://github.com/github/local-action/blob/b9351d8a8f1e6eed27646f4d892b49a3847ba180/src/stubs/core/core.ts#L337) and GitHub's [same-job output example](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#example-masking-a-generated-output-within-a-single-job).

## Debug the workflow

From the development environment:

```sh
npm run debug:workflow
```

npm first rebuilds `dist/`, then `act --local-repository` resolves the [workflow](../integration/workflow.yml)'s `ravecat/load-sops-secrets@local` reference from the current directory, including uncommitted changes. Re-run the command after source edits. The override removes the need for publication or manual copying into another project.

The checkout step makes this project's helper files available in act's runner workspace. The project [.actrc](../.actrc) selects this workflow and maps `ubuntu-24.04` to host execution. The Flake supplies the tools; Docker and GitHub runner registration are not required. Automatic `.env`, `.secrets`, `.input`, and `.vars` file loading by act is disabled. The npm command also removes inherited age-key settings before starting act.

The workflow creates a private temporary fixture using [integration/fixture.js](../integration/fixture.js). Only paths are passed between setup and the action. The next step verifies all dynamic outputs, including ordinary, multiline, and empty strings, without printing values. An `always()` step removes the fixture on success or failure. Source debugging and native CI use the same fixture builder.

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

## GitHub CI and distribution

The [CI workflow](../.github/workflows/test.yml) installs the pinned environment and npm dependencies, runs `npm run check`, and checks distribution consistency. It then invokes the checked-out action with `uses: ./` and verifies the outputs in the next step. This covers `action.yml`, the built entrypoint, and the same input/credential/output pattern shown in README.

The direct action step uses GitHub's Node.js 24 runtime. The custom Nix shell applies to `run` steps only, so the action's SOPS lookup and automatic installation also run in the consumer environment. All credentials in this test are disposable age identities; no repository secret is required.

Local act validation and static workflow checks do not establish that GitHub CI has passed. The first GitHub-hosted run must be checked after publication.

After source or dependency changes, rebuild and include `dist/index.js`, `dist/package.json`, and `dist/licenses.txt` with the change. `npm run check:dist` detects a missing, stale, or untracked distribution in a clean CI checkout. It is expected to fail locally while new distribution files have not been staged.

A release must contain `action.yml` and the verified distribution at the Git ref consumers use. Publishing an npm package is unnecessary. Release publication and tag management remain separate from local development checks.

## Troubleshooting

- **Fixture creation fails:** enter `nix develop` and check that `sops` and `age-keygen` are available. The fixture builder removes partial output and reports a sanitized error.
- **Debugger does not connect:** confirm port 9229 is free, run `npm run debug`, and attach before continuing execution.
- **Workflow cannot find the action:** check the exact repository/ref mapping and rebuild in the mapped checkout.
- **SOPS setup fails:** check platform support, writable runner cache/temp directories, and network access to GitHub releases on a cold cache.
- **Decryption fails:** check the encrypted file and the credential provider. Use synthetic fixtures for reproductions instead of printing real SOPS diagnostics.
- **GitHub-only failure:** enable `ACTIONS_STEP_DEBUG` or `ACTIONS_RUNNER_DEBUG`, or re-run with debug logging. Extra logs do not provide source breakpoints; avoid printing secrets while collecting diagnostics.

## References

- [GitHub JavaScript action template](https://github.com/actions/javascript-action)
- [GitHub action documentation guidance](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions)
- [GitHub debug logging](https://docs.github.com/en/actions/how-tos/monitor-workflows/enable-debug-logging)
- [Node.js Inspector](https://nodejs.org/docs/latest-v24.x/api/debugger.html#v8-inspector-integration-for-nodejs)
- [SOPS 3.13.1 release](https://github.com/getsops/sops/releases/tag/v3.13.1)
- [act local repository mapping](https://github.com/nektos/act/blob/v0.2.89/cmd/root.go)
- [act host execution](https://nektosact.com/usage/runners.html)
- [act limitations](https://nektosact.com/not_supported.html)
