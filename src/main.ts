import * as core from '@actions/core';
import { getExecOutput } from '@actions/exec';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setup } from './sops.ts';

export async function run(): Promise<void> {
  let failure = 'File and key inputs and a writable GITHUB_OUTPUT file are required.';

  try {
    const file = core.getInput('file', { required: true });
    const key = core.getInput('key', { required: true });
    if (file === '' || key === '') throw new Error();
    const output = process.env.GITHUB_OUTPUT;
    if (output === undefined) throw new Error();
    await access(output, constants.W_OK);
    core.setSecret(key);

    const env: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    env.SOPS_AGE_KEY = key;

    failure = 'SOPS setup failed. Check platform support, network access, and the runner tool cache.';
    const executable = await setup();

    failure = 'SOPS decryption failed. Check the file and decryption key.';
    const path = resolve(process.env.GITHUB_WORKSPACE || process.cwd(), file);
    const { stdout } = await getExecOutput(
      executable,
      ['decrypt', '--output-type', 'json', path],
      { silent: true, input: Buffer.alloc(0), env },
    );

    failure = 'Decrypted SOPS content must be a JSON object of strings.';
    const secrets: unknown = JSON.parse(stdout);
    if (secrets === null || typeof secrets !== 'object' || Array.isArray(secrets)) {
      throw new Error();
    }

    const values: [string, unknown][] = Object.entries(secrets);
    const entries: [string, string][] = [];
    for (const [name, value] of values) {
      if (typeof value !== 'string') throw new Error();
      entries.push([name, value]);
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
