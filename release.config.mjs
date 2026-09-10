export default {
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    ['@semantic-release/changelog', { changelogTitle: '# Changelog' }],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'dist/index.js', 'dist/package.json', 'dist/licenses.txt'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    [
      '@semantic-release/github',
      { successComment: false, failComment: false, releasedLabels: false },
    ],
    [
      '@semantic-release/exec',
      {
        successCmd: 'git push "${options.repositoryUrl}" "${nextRelease.gitHead}:refs/tags/v${nextRelease.version.split(\'.\')[0]}" --force',
      },
    ],
  ],
};
