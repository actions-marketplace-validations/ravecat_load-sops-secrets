# GitHub Action release strategy

Research date: 2026-09-11. Repository baseline: `721b274`. This note records the selected publication strategy and comparisons with the owner's npm projects and established npm repositories. The existing release workflow is retained.

## Recommendation

Selected decision: retain the existing publisher. The Git plugin commits the built distribution and changelog to the default branch, currently `master`, and semantic-release tags that release commit. Keep the existing exec success command that moves `v<major>` to the release commit; do not add a `latest` Git tag. Default-branch pushes remain previews, and manual dispatch remains the publication gate. Later source commits inherit the previous bundle until the next release, so consumers should use a release ref or release commit SHA for source/bundle correspondence.

Keeping generated distribution files out of `master` is also compatible with publishing a JavaScript GitHub Action. The earlier persistent `release` branch recommendation was conditional on that requirement and was not selected. If distribution must instead exist only in tagged commits with no persistent release branch, separate source version tracking from consumer distribution tags and provide an adapted publisher. The alternatives below document these tradeoffs rather than proposed changes to the selected workflow.

For consumers, retain exact `vX.Y.Z` tags and a moving major alias such as `v1`. A full release commit SHA also works. A moving `latest` Git tag could cross breaking major versions and is not part of the selected strategy.

## Verified current behavior

- [release.config.mjs](../../release.config.mjs) configures `v${version}`, conventional commit analysis, changelog generation, and `@semantic-release/git` with `CHANGELOG.md` and three `dist/` files as assets. Its success command updates the major alias.
- [package.json](../../package.json) pins semantic-release `25.0.9` and `@semantic-release/git` `11.0.1`. The installed Git plugin's prepare hook creates a commit and pushes `HEAD` to its release branch. With the current workflow, this is the default branch, currently `master`.
- [ci.yml](../../.github/workflows/ci.yml) builds before source/bundle process tests, real SOPS integration tests, and the native `uses: ./` invocation. The release job independently rebuilds and checks that the three distribution files are nonempty. It does not rerun the complete behavior tests on that independently built bundle.
- Branch pushes preview semantic-release with `--dry-run`. Manual dispatch on the default branch can publish after the lint and test jobs succeed.
- [action.yml](../../action.yml) declares `runs.main: dist/index.js`; [tests/index.test.ts](../../tests/index.test.ts) exercises both source and bundle. The integration tests also exercise the built distribution.
- [README.md](../../README.md), [docs/development.md](../development.md), and the [local-debugging specification](../specs/local-action-debugging.md) now describe release commits containing the distribution on the default branch and distinguish release SHAs from later source commits that inherit the previous bundle.

Source for the Git plugin's behavior and inclusion of explicitly configured ignored assets: [official plugin documentation](https://github.com/semantic-release/git#usage), [assets](https://github.com/semantic-release/git#assets). Installed implementation inspected: `node_modules/@semantic-release/git/lib/prepare.js` and `lib/git.js`.

## GitHub's documented strategies

GitHub's maintenance guide describes compiling and publishing dependencies only in tagged release commits, deliberately keeping them out of `main`. Its example references `JasonEtco/build-and-tag-action`. The same guide recommends semantic version tags and updating major and minor aliases. It also warns that retargeting an already published release tag conflicts with immutable releases. Source: [Releasing and maintaining actions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/release-and-maintain-actions).

The official JavaScript template demonstrates another valid approach: committed `dist/` plus a workflow that removes the directory, rebuilds it, and checks the resulting difference. That validates correspondence between reviewed source and committed runtime output. Source: [template distribution check](https://github.com/actions/javascript-action/blob/main/.github/workflows/check-dist.yml).

These sources demonstrate multiple supported publication approaches. The maintenance guide's phrase "semantic releases" describes versioning and is not a promise that the semantic-release npm package implements its example unchanged.

## Why this differs from npm publication

A workflow selects a GitHub Action by a repository ref, and a JavaScript action executes the file named by `runs.main`. Consequently the selected commit must contain the action metadata and executable distribution. A ZIP attached to a GitHub Release is not automatically substituted for the repository contents. This is an inference from [action ref selection](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions) and [runs.main metadata](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax#runsmain).

Source and distribution can have separate commits, but distribution is still stored in Git and is visible when inspecting all refs. It can be excluded from `master` history, not from the repository's object storage. Consumers may pin the SHA of the distribution commit; a source SHA without `dist/` is not runnable as this action.

## The semantic-release ancestry constraint

semantic-release `25.0.9` discovers branch tags with `git tag --merged <branch>` and then filters them using `tagFormat`. Therefore a tag on a build commit that is not an ancestor of `master` is not recognized as the previous release when semantic-release runs on `master`. Simply moving its only `v1.0.0` tag to a separate build commit can cause repeated version calculation and an existing-tag conflict. Sources: [version-pinned Git helper](https://github.com/semantic-release/semantic-release/blob/v25.0.9/lib/git.js), [branch tag filtering](https://github.com/semantic-release/semantic-release/blob/v25.0.9/lib/branches/get-tags.js), [last release selection](https://github.com/semantic-release/semantic-release/blob/v25.0.9/lib/get-last-release.js).

## Options and tradeoffs

| Strategy | Distribution location | semantic-release integration | Main tradeoff |
| --- | --- | --- | --- |
| Existing publisher | `master` release commits | Existing stock plugins | Generated files remain in source history; source/runtime correspondence needs validation. |
| Persistent release branch | Release branch and its version tags | Stock plugins run on the release branch | Maintain source promotion and preserve release ancestry. |
| Tagged build commits only | Separate commits reachable through consumer tags | Separate source tracking tags and adapted publishing | More publication and recovery logic; two tag namespaces. |

### Persistent release branch

Merge the selected source revision from `master` into the existing `release` branch using normal merges that preserve both source and previous release ancestry. Build and validate the resulting distribution, then run semantic-release on `release`; its Git plugin commits generated files there. The normal version tags remain discoverable in that branch's history. Do not merge the distribution branch back into `master` or force-reset it to a source revision.

The CI invocation must actually run with the release branch context and configure that branch for semantic-release. Changing only the `branches` option while keeping an incompatible CI branch context is insufficient. This is an architectural proposal based on [release workflow configuration](https://semantic-release.org/foundation/workflow-configuration/) and the ancestry implementation above; it has not been implemented or integration-tested here.

This preserves stock version calculation, release notes, GitHub publication, and the Git plugin. Its additional responsibility is reliable promotion of source changes to the distribution branch.

### Tagged build commits only

A possible mapping is:

```text
source-v1.0.0 -> source commit on master
v1.0.0       -> separate commit containing the tested build
v1          -> latest compatible distribution commit
```

semantic-release can track `source-v${version}` on `master`, while a publisher creates the consumer distribution commits and tags. However, `tagFormat` alone does not complete this scheme: the standard GitHub plugin publishes the tag supplied in `nextRelease.gitTag`, which would be the source tag. The GitHub Release must instead point to the consumer distribution tag through an adapted publisher. Sources: [semantic-release configuration](https://semantic-release.org/usage/configuration/), [GitHub publishing implementation](https://github.com/semantic-release/github/blob/master/lib/publish.js).

The publisher must handle a retry after source version tagging succeeds but distribution publication fails; an unchanged source tree may otherwise produce no new semantic-release publication. It also needs serialization and checks for an already published distribution tag. These are consequences of splitting publication into separately failing steps, not behavior provided merely by configuring a second tag format.

The GitHub-referenced [build-and-tag-action](https://github.com/JasonEtco/build-and-tag-action) is evidence that distribution-only tag commits are feasible. It should not be inserted unchanged after semantic-release: its tag rewriting conflicts with the ancestry requirement and with already immutable version tags.

## Consumer references and release ordering

- Use `v1.0.0` for an exact release and `v1` for the latest compatible major version. A minor alias such as `v1.0` is optional.
- A `latest` Git tag would be a custom moving ref. It has no npm dist-tag behavior in `uses:` and is unrelated to the GitHub Release UI's latest designation. Avoid it by default when major versions may break callers.
- A full distribution commit SHA provides immutable consumer pinning. A source-only SHA does not contain this action's runtime entrypoint.

Sources: [Managing custom actions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions), [Using immutable releases and tags](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/using-immutable-releases-and-tags-to-manage-your-actions-releases). The recommendation about `latest` is an inference about moving refs and compatibility.

Create the final tested build and version tag before publishing an immutable GitHub Release. Keep moving aliases separate from exact version releases. Also do not rely on a release created with the standard `GITHUB_TOKEN` to trigger another `on: release` workflow: the semantic-release GitHub plugin documents that limitation. Sequential publication steps in the same workflow avoid that trigger dependency. Source: [GitHub plugin authentication](https://github.com/semantic-release/github#github-authentication).

## The owner's npm projects

The requested "Phonic Session" was interpreted as `phoenix-session`, found at `/home/max/apps/@rvct/phoenix-session`. The other project is `/home/max/apps/semantic-release-run-when`. Both use semantic-release with a stable default branch and a prerelease `beta` branch. Both explicitly set `tagFormat: "${version}"`, so their version Git tags have no `v` prefix.

| Event | Result in both projects |
| --- | --- |
| Push to the default branch, currently `master` | Preview with `semantic-release --dry-run`. |
| Push to `beta` | Publish a prerelease if relevant changes exist; npm channel `beta`. |
| Manual workflow dispatch on the default branch | Publish a stable release if relevant changes exist; npm channel `latest`. |

The analyzer determines the release type from commit messages and semantic-release calculates the version from release history. The current value in `package.json` is not the version-selection mechanism. Promotion requires source changes to reach the stable branch and a stable release invocation; it is not implemented as automatically merging `beta` or merely renaming an npm dist-tag.

Pinned configurations and workflows: [phoenix-session release config](https://github.com/ravecat/phoenix-session/blob/a8c9857623a20e545de504a46945b6615f651fee/release.config.mjs), [phoenix-session publish workflow](https://github.com/ravecat/phoenix-session/blob/a8c9857623a20e545de504a46945b6615f651fee/.github/workflows/publish.yml), [run-when release config](https://github.com/ravecat/semantic-release-run-when/blob/dacd023162b20638a0b5df826b288d5f6d9caa56/release.config.mjs), [run-when publish workflow](https://github.com/ravecat/semantic-release-run-when/blob/dacd023162b20638a0b5df826b288d5f6d9caa56/.github/workflows/publish.yml).

### Conditional plugin execution and Git writeback

`semantic-release-run-when` is a conditional wrapper around other plugins' lifecycle hooks. It does not calculate versions. Both projects wrap the changelog and Git plugins with `when: { main: true }`. Here `main` means semantic-release's primary stable release branch, not a literal branch named `main`. Consequently stable releases commit the changelog and updated package manifest back to `master`, whereas prereleases skip those plugins. The npm plugin still writes the prerelease version into the CI checkout's manifest for registry publication. Sources: [wrapper dispatcher](https://github.com/ravecat/semantic-release-run-when/blob/dacd023162b20638a0b5df826b288d5f6d9caa56/src/index.js), the pinned configurations above, and [npm prepare hook](https://github.com/semantic-release/npm/blob/master/lib/prepare.js).

The stable release commits directly demonstrate writeback: [phoenix-session 1.1.0](https://github.com/ravecat/phoenix-session/commit/a8c9857623a20e545de504a46945b6615f651fee) and [semantic-release-run-when 1.0.0](https://github.com/ravecat/semantic-release-run-when/commit/dacd023162b20638a0b5df826b288d5f6d9caa56) each change `CHANGELOG.md` and `package.json` only. The run-when config also permits `pnpm-lock.yaml` as a Git asset; that is not evidence the lockfile changes in every release.

### Actual published contents and versions

| Package | npm `latest` | npm `beta` | Contents used by consumers |
| --- | --- | --- | --- |
| `phoenix-session` | `1.1.0` | `1.0.0-beta.1` | TypeScript source: `src/index.ts` and `src/session.ts`. |
| `semantic-release-run-when` | `1.0.0` | `1.0.0-beta.1` | JavaScript source: `src/index.js`. |

Neither project has a bundle build in its package scripts. Both publish `src`, the manifest, README and license; this was verified against the actual latest npm tarballs, not only the manifests. The published `phoenix-session` manifest exports `src/index.ts` for imports and types, and run-when exports `src/index.js`. Sources: [phoenix-session published metadata](https://registry.npmjs.org/phoenix-session/latest), [run-when published metadata](https://registry.npmjs.org/semantic-release-run-when/latest), [phoenix-session manifest](https://github.com/ravecat/phoenix-session/blob/a8c9857623a20e545de504a46945b6615f651fee/package.json), [run-when manifest](https://github.com/ravecat/semantic-release-run-when/blob/dacd023162b20638a0b5df826b288d5f6d9caa56/package.json).

Registry labels are distinct from Git tags: `latest` maps to a published npm version; it does not require a Git tag named `latest`. The inspected Git remotes contain numeric version tags, and neither configuration creates `v1` or `latest` aliases. Run-when additionally retains an npm `bootstrap` label pointing to `0.0.0`. Source: read-only registry queries and `git ls-remote --heads --tags origin`, checked on the research date; [npm dist-tag semantics](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/).

Both local `master` checkouts are one release commit behind their verified remote `master`. This explains the older checked-out manifest versions, `1.0.0` for phoenix-session and `0.0.0` for run-when. They are not evidence that stable release metadata is intentionally never committed. No checkout or remote ref was modified during inspection.

The workflows have different verification gates: run-when executes `pnpm run check` in its publication job, while phoenix-session's checks are in a separate workflow without an explicit publication dependency. Branch protection settings were not inspected. Phoenix passes the repository default branch name into its release configuration; run-when currently relies on the `master` fallback. These observations describe the inspected workflows, not proposed configuration changes.

## Established npm repository comparisons

Version selection, human review, and storage of package contents are separate decisions. The following primary-source examples demonstrate this separation rather than a universal npm policy.

| Project | How versions and publication are controlled | What is committed or distributed |
| --- | --- | --- |
| semantic-release itself | Conventional commit analysis and releases from branch pushes; no release PR in the inspected workflow. | Tracked manifest uses `0.0.0-development`; the default plugins publish npm and GitHub releases and Git tags without a version-writeback plugin. Existing JavaScript is packaged without a compile step. |
| pnpm, TypeScript CLI | Changeset-compatible files describe per-package release intent. A manually dispatched workflow prepares a release PR; maintainers review and merge, push signed version tags, then approve staged packages. | Versions and changelogs are committed. The CLI's `dist` output is generated for publication and ignored by Git. |
| npm/cli | Customized release-please prepares release PRs from commit history. Maintainers publish from a checked-out release PR before approving and merging it; merging then creates GitHub tags and releases. | Version metadata and changelogs are committed. Production `node_modules` are also tracked, while some documentation is generated for packing. |

semantic-release evidence, pinned to `8d905a56e80030c141a71a32c0c4cb870e90470a`: [release workflow](https://github.com/semantic-release/semantic-release/blob/8d905a56e80030c141a71a32c0c4cb870e90470a/.github/workflows/release.yml), [manifest](https://github.com/semantic-release/semantic-release/blob/8d905a56e80030c141a71a32c0c4cb870e90470a/package.json), [default plugin behavior](https://semantic-release.org/usage/configuration/#plugins). The release workflow and test workflow are separate; repository protection settings were not audited.

pnpm evidence, pinned to `7f49dda9875a1d3aca53a0aa9ec8892690c04367`: [release instructions](https://github.com/pnpm/pnpm/blob/7f49dda9875a1d3aca53a0aa9ec8892690c04367/RELEASING.md), [release PR workflow](https://github.com/pnpm/pnpm/blob/7f49dda9875a1d3aca53a0aa9ec8892690c04367/.github/workflows/create-release-pr.yml), [contributor instructions](https://github.com/pnpm/pnpm/blob/7f49dda9875a1d3aca53a0aa9ec8892690c04367/AGENTS.md), [TypeScript CLI manifest](https://github.com/pnpm/pnpm/blob/7f49dda9875a1d3aca53a0aa9ec8892690c04367/pnpm11/pnpm/package.json), [ignore rules](https://github.com/pnpm/pnpm/blob/7f49dda9875a1d3aca53a0aa9ec8892690c04367/.gitignore). The current workflow uses native `pnpm change` and `pnpm bump`; it should not be described as necessarily using the separate `@changesets/cli` package. The monorepo also contains Rust packages with different publication details.

npm/cli evidence, pinned to `c9876d7ea7150b0702e4151210b9fa1a8dbc7fbf`: [release workflow](https://github.com/npm/cli/blob/c9876d7ea7150b0702e4151210b9fa1a8dbc7fbf/.github/workflows/release.yml), [release-please config](https://github.com/npm/cli/blob/c9876d7ea7150b0702e4151210b9fa1a8dbc7fbf/release-please-config.json), [publish script](https://github.com/npm/cli/blob/c9876d7ea7150b0702e4151210b9fa1a8dbc7fbf/scripts/publish.js), [manifest](https://github.com/npm/cli/blob/c9876d7ea7150b0702e4151210b9fa1a8dbc7fbf/package.json), [tracked dependencies](https://github.com/npm/cli/tree/c9876d7ea7150b0702e4151210b9fa1a8dbc7fbf/node_modules). Its [maintainer release process](https://github.com/npm/cli/wiki/Release-Process) was inspected as current rather than commit-pinned. The CLI is initially published under `next-<MAJOR>`, with a separate decision to promote npm `latest`. The documented publish-before-merge sequence must not be generalized into the more common merge-then-publish release-PR workflow.

### Decision impact for this project

Keep commit-based semantic-release when commit messages should determine release intent. A release PR adds a review point for proposed versions and changelogs. Changeset files let contributors state release impact per package independently of commit messages, which is especially useful in a monorepo. These are recommendations inferred from the compared workflows.

None of these version-selection methods forces bundles into the development branch. An npm library can publish compiled output only inside its npm tarball while Git retains source and, optionally, release metadata. The owner's two npm projects already use registry tarballs but do not illustrate compiled-output isolation, because they publish source directly. The GitHub Action still requires the selected consumer commit to contain its distribution; the chosen strategy satisfies this with release commits on `master`.

## Testing implications and validation limits

Keeping `dist/` in a branch does not inherently require deleting and recommitting it after tests. The important checks are that the executed distribution was built from the intended source, that obsolete build output cannot survive a clean build, and that the published bytes are the validated bytes. If committing distribution in the source branch, a rebuild-and-diff check serves a different purpose from behavior tests. If publishing separate distribution commits, validate that final tree and its action metadata before exposing its tags.

Before implementing either new strategy, validate two consecutive releases, a non-releasing source change, a major bump and alias behavior, partial-publication retry, and the correspondence between source and distribution. These are suggested acceptance boundaries, not tests executed by this research.

The original read-only investigation inspected official documentation, upstream source, local pinned implementations, repository configuration and tests, the owner's remote Git refs, and npm registry metadata. The owner's two latest npm tarballs were downloaded into memory and their manifests and file lists inspected without installing or executing them. That research ran documentation lint without rerunning project test suites. Subsequent release preparation retained the existing executable configuration and passed `nix develop --command npm run check` in the owning worktree: type checking, build, all lint checks, 41 process tests, and six SOPS integration tests. The installed `@semantic-release/exec` success hook was also invoked against a temporary local bare remote with the current configuration, verifying initial `v1` creation, updating `v1`, creating `v2` without moving `v1`, and absence of a `latest` tag. Documentation lint and `git diff --check` passed after reconciliation. These local checks did not publish a release.
