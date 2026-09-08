# load-sops-secrets

A GitHub Action project for loading SOPS-encrypted JSON values as masked step outputs.

## Development environment

With Nix and flakes enabled, enter the pinned development shell:

```sh
nix develop
```

The shell provides Node.js 24, SOPS, age, and Git. Alternatively, run `direnv allow` once to load the Flake automatically. An optional ignored `.env` file can supply local environment settings.

The environment is defined in [flake.nix](flake.nix), with dependency revisions pinned in [flake.lock](flake.lock).

## License

No license has been declared yet.
