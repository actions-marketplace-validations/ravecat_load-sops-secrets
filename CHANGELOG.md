# Changelog

## 1.0.0 (2026-09-11)

### ⚠ BREAKING CHANGES

* consumers must supply age private identity text through with.key; environment-only credentials no longer satisfy the action input contract.

### Features

* load SOPS secrets as masked step outputs ([942d906](https://github.com/ravecat/load-sops-secrets/commit/942d9063e64b682ff6e2cebf2b7b9b673e99abaa))
* preserve decrypted JSON keys as output names ([e344138](https://github.com/ravecat/load-sops-secrets/commit/e344138aae463145d0bea21c855ba687a375f6cf))
* require an explicit decryption key input ([a1078f2](https://github.com/ravecat/load-sops-secrets/commit/a1078f2a70df789748eba963c0b2df3d1e2b15c4))
