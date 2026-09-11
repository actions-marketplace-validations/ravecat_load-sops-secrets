# load-sops-secrets

Decrypt a SOPS-encrypted JSON file and expose its values as masked GitHub Actions step outputs.

## Usage

Check out the encrypted file, supply its age private identity, and consume outputs in later steps of the same job:

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
          key: ${{ secrets.DECRYPTION_KEY }}
      - name: Use a secret
        env:
          DEMO_SECRET: ${{ steps.sops.outputs.demo_secret }}
        run: test -n "$DEMO_SECRET"
```

This action currently supports only SOPS-encrypted files that decrypt to a flat JSON object with string values, for example:

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
| `key` | Yes | Age private identity text used to decrypt the file. Multiline identities are supported. |

Each JSON key becomes an output with the same name. Read a known key with `steps.sops.outputs.demo_secret` or bracket access such as `steps.sops.outputs['api.token']`, or serialize all outputs with `toJSON(steps.sops.outputs)`. There is no built-in aggregate output named `secrets`.

- Values must be strings. Nested objects, arrays, numbers, booleans, and null are rejected.
- JSON keys are passed through unchanged, without name validation, normalization, or case-insensitive uniqueness checks.
- Empty strings and multiline values are preserved. An empty object produces no outputs.
- The JSON object structure and all string values are validated before any outputs are published.

GitHub's [output-file format](https://github.com/actions/runner/blob/main/src/Runner.Worker/FileCommandManager.cs) still applies: empty names and names containing newlines, `=`, or `<<` cannot be transported reliably. Its [output lookup is case-insensitive](https://github.com/actions/runner/blob/main/src/Sdk/DTPipelines/Pipelines/ContextData/DictionaryContextData.cs), so `TOKEN` and `token` collide and the later value wins.

Pass the key through `with.key` at job runtime from a trusted secret source. GitHub Actions secrets are one option; an earlier trusted step can also fetch the key from a secret manager and expose it as a masked output within the same job. The action accepts the key text regardless of its storage provider or secret name and registers it for masking before SOPS setup or decryption.

Nonempty decrypted values are registered for log masking before outputs are written. Consume them within the same job: GitHub can discard secret-containing outputs passed between jobs. Masking does not make it safe to print secrets or arbitrary transformations of them. See [GitHub's output guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#example-masking-a-generated-output-within-a-single-job).

## Requirements

- A GitHub Actions runner that supports the Node.js 24 action runtime declared in [action.yml](action.yml).
- The age private identity for the encrypted file, supplied through `with.key`.
- Network access to GitHub releases when SOPS is neither on `PATH` nor in the runner tool cache. The action downloads SOPS 3.13.1 and verifies its SHA-256 checksum. An existing `sops` on `PATH` is caller-managed.

The automated checks target Ubuntu 24.04, and local validation covers Linux x64. The installer includes Linux, macOS, and Windows binaries for x64 and arm64; the other platform combinations have not been validated here. GitHub supplies the Node.js runtime for this JavaScript action; consumers do not need npm or Nix.

Setup, decryption, invalid-document, and output-write failures fail the step with sanitized messages. Decryption diagnostics and malformed plaintext are not printed. Missing required input stops before decryption.

## Development

The action source, tests, and test helpers use strict TypeScript with the Node.js test runner. Test files use the `.test.ts` suffix under `tests/`, with real SOPS tests and fixtures under `tests/integration/`. TypeScript checks types, and ncc bundles the source and npm dependencies into the JavaScript distribution consumed by GitHub. Debug and release scripts use JavaScript. Dependencies are in [package.json](package.json), with development tools in [flake.nix](flake.nix).

[Environment and checks](docs/development.md#environment-and-checks) | [Source debugging](docs/development.md#debug-the-source) | [Local workflow](docs/development.md#debug-the-workflow) | [Sibling checkout](docs/development.md#use-a-sibling-action-checkout) | [Development specification](docs/specs/local-action-debugging.md)

## License

Licensed under the [MIT License](LICENSE).
