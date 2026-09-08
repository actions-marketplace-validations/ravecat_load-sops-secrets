import * as core from '@actions/core';
import { getExecOutput } from '@actions/exec';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setupSops } from './sops.js';

export async function run() {
  let failure = 'A file input and a writable GITHUB_OUTPUT file are required.';

  try {
    const file = core.getInput('file', { required: true });
    if (file === '') throw new Error();
    await access(process.env.GITHUB_OUTPUT, constants.W_OK);

    failure = 'SOPS setup failed. Check platform support, network access, and the runner tool cache.';
    const executable = await setupSops();

    failure = 'SOPS decryption failed. Check the file and decryption key.';
    const path = resolve(process.env.GITHUB_WORKSPACE || process.cwd(), file);
    const { stdout } = await getExecOutput(
      executable,
      ['decrypt', '--output-type', 'json', path],
      { silent: true, input: Buffer.alloc(0) },
    );

    failure = 'Decrypted SOPS content must be a JSON object of strings with valid, case-insensitively unique output names.';
    const secrets = JSON.parse(stdout);
    if (secrets === null || typeof secrets !== 'object' || Array.isArray(secrets)) {
      throw new Error();
    }

    const entries = Object.entries(secrets);
    const names = new Set();
    for (const [name, value] of entries) {
      if (
        !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name) ||
        typeof value !== 'string' ||
        names.has(name.toLowerCase())
      ) {
        throw new Error();
      }
      names.add(name.toLowerCase());
    }

    failure = 'Could not register secret masks or write action outputs.';
    for (const [, value] of entries) {
      if (value !== '') {
        core.setSecret(value);
        // Consumers can serialize all outputs with toJSON, which escapes string values.
        const escaped = JSON.stringify(value).slice(1, -1);
        if (escaped !== value) core.setSecret(escaped);
      }
    }
    for (const [name, value] of entries) {
      core.setOutput(name, value);
    }
  } catch {
    // SOPS stderr and JSON parser errors can contain unmasked decrypted content.
    core.setFailed(failure);
  }
}
