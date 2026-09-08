# load-sops-secrets

Decrypt a SOPS-encrypted JSON file and expose its values as masked GitHub Actions step outputs.

## Usage

Check out the encrypted file, supply its decryption credentials, and consume outputs in later steps of the same job:

```yaml
name: Load secrets
on: workflow_dispatch
permissions:
  contents: read
jobs:
  example:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - name: Load secrets
        id: sops
        uses: ravecat/load-sops-secrets@v1
        with:
          file: secrets.enc.json
        env:
          SOPS_AGE_KEY: ${{ secrets.SOPS_AGE_KEY }}
      - name: Use a secret
        env:
          DEMO_SECRET: ${{ steps.sops.outputs.demo_secret }}
        run: test -n "$DEMO_SECRET"
```

The example requires an encrypted `secrets.enc.json` in your repository and its age identity in the `SOPS_AGE_KEY` repository secret. Use an existing published tag or full commit SHA for the action reference; a local checkout alone does not make `@v1` available on GitHub.

The decrypted document must be a flat JSON object of strings, for example:

```json
{
  "demo_secret": "local-example-value",
  "multiline": "first\nsecond",
  "empty": ""
}
```

## Inputs and outputs

| Input | Required | Meaning |
| --- | --- | --- |
| `file` | Yes | Absolute path, or a path relative to the workflow workspace, to the SOPS-encrypted JSON file. |

Each JSON key becomes an output with the same name. Read a known key with `steps.sops.outputs.demo_secret`, or serialize all outputs with `toJSON(steps.sops.outputs)`. There is no built-in aggregate output named `secrets`.

- Values must be strings. Nested objects, arrays, numbers, booleans, and null are rejected.
- Names must match `[a-zA-Z_][a-zA-Z0-9_-]*` and be unique ignoring case.
- Empty strings and multiline values are preserved. An empty object produces no outputs.
- The complete document is validated before any outputs are published.

Nonempty values are registered for log masking before outputs are written. Consume them within the same job: GitHub can discard secret-containing outputs passed between jobs. Masking does not make it safe to print secrets or arbitrary transformations of them. See [GitHub's output guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#example-masking-a-generated-output-within-a-single-job).

## Requirements

- A GitHub Actions runner that supports the Node.js 24 action runtime declared in [action.yml](action.yml).
- Decryption credentials supplied in the action step's environment. The example uses age; `SOPS_AGE_KEY_FILE` can instead point to an identity file. Other SOPS credential providers remain caller-configured.
- Network access to GitHub releases when SOPS is neither on `PATH` nor in the runner tool cache. The action downloads SOPS 3.13.1 and verifies its SHA-256 checksum. An existing `sops` on `PATH` is caller-managed.

Local validation covers Linux x64. The installer includes Linux, macOS, and Windows binaries for x64 and arm64; the other platform combinations have not been validated here. GitHub supplies the Node.js runtime for this JavaScript action; consumers do not need npm or Nix.

Setup, decryption, invalid-document, and output-write failures fail the step with sanitized messages. Decryption diagnostics and malformed plaintext are not printed. Missing required input stops before decryption.

## Development

With Nix and flakes enabled, run from this project's directory:

```sh
nix develop
npm ci --ignore-scripts
npm run build
npm test
npm run test:integration
```

Alternatively, run `direnv allow` once to load the Flake automatically. The tools are pinned in [flake.nix](flake.nix); npm dependencies and commands are defined in [package.json](package.json).

The build bundles the source and its dependencies into `dist/`, which is committed with the action. Process tests exercise both source and distribution. The real SOPS integration test checks download, cache reuse, decryption, and wrong-key failure with disposable synthetic credentials; its initial download requires network access to GitHub releases.

## License

No license has been declared yet.
