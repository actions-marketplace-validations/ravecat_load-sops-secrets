# GitHub Action release strategy

Research date: 2026-09-11. Repository baseline: `721b274`. This note supports a publication strategy decision; it is not an implementation plan or a record of a changed release workflow.

## Recommendation

Keeping generated distribution files out of `master` is compatible with publishing a JavaScript GitHub Action. If retaining stock semantic-release is the priority, use a persistent `release` branch containing source and built distribution, and run semantic-release there. If distribution must exist only in tagged commits with no persistent release branch, separate source version tracking from consumer distribution tags and provide an adapted publisher. These recommendations follow from the mechanisms below, rather than a single universally preferred GitHub workflow.

For consumers, retain exact `vX.Y.Z` tags and a moving major alias such as `v1`. A full release commit SHA also works. A moving `latest` Git tag is possible but should be an explicit opt-in because it may cross breaking major versions.

## Verified current behavior

- [release.config.mjs](../../release.config.mjs) configures `v${version}`, conventional commit analysis, changelog generation, and `@semantic-release/git` with `CHANGELOG.md` and three `dist/` files as assets. Its success command updates the major alias.
- [package.json](../../package.json) pins semantic-release `25.0.9` and `@semantic-release/git` `11.0.1`. The installed Git plugin's prepare hook creates a commit and pushes `HEAD` to its release branch. With the current workflow, this is the default branch, currently `master`.
- [ci.yml](../../.github/workflows/ci.yml) builds before source/bundle process tests, real SOPS integration tests, and the native `uses: ./` invocation. The release job independently rebuilds and checks that the three distribution files are nonempty. It does not rerun the complete behavior tests on that independently built bundle.
- Branch pushes preview semantic-release with `--dry-run`. Manual dispatch on the default branch can publish after the lint and test jobs succeed.
- [action.yml](../../action.yml) declares `runs.main: dist/index.js`; [tests/index.test.ts](../../tests/index.test.ts) exercises both source and bundle. The integration tests also exercise the built distribution.
- The claims in [README.md](../../README.md) and [docs/development.md](../development.md) that branch and commit SHA references lack the distribution are inaccurate for the current publisher. A release commit SHA remains valid even in a future strategy where `master` has no distribution. Those documents were inspected, not changed by this research.

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

## Testing implications and validation limits

Keeping `dist/` in a branch does not inherently require deleting and recommitting it after tests. The important checks are that the executed distribution was built from the intended source, that obsolete build output cannot survive a clean build, and that the published bytes are the validated bytes. If committing distribution in the source branch, a rebuild-and-diff check serves a different purpose from behavior tests. If publishing separate distribution commits, validate that final tree and its action metadata before exposing its tags.

Before implementing either new strategy, validate two consecutive releases, a non-releasing source change, a major bump and alias behavior, partial-publication retry, and the correspondence between source and distribution. These are suggested acceptance boundaries, not tests executed by this research.

This investigation inspected official documentation, upstream source, local pinned implementations, and repository configuration and tests. It did not publish a release or modify executable files. Both the existing Markdown baseline and the added research note passed `nix develop --command npm run lint:docs` in the isolated documentation worktree.
