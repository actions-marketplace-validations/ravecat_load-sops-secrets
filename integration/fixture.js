import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const secrets = {
  demo_secret: 'local-example-value',
  multiline: 'first\nsecond',
  empty: '',
};

export function createFixture() {
  const directory = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'sops-fixture-'));
  const key = join(directory, 'key.txt');
  const file = join(directory, 'secrets.enc.json');
  const output = join(directory, 'output');
  const plaintext = join(directory, 'fixture.json');
  const options = { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] };

  try {
    execFileSync('age-keygen', ['-o', key], options);
    const recipient = execFileSync('age-keygen', ['-y', key], options).trim();
    // Node's child stdin is a socket that SOPS cannot reopen through /dev/stdin.
    writeFileSync(plaintext, JSON.stringify(secrets), { mode: 0o600 });
    const encrypted = execFileSync('sops', [
      'encrypt', '--age', recipient, '--input-type', 'json', '--output-type', 'json', plaintext,
    ], options);
    rmSync(plaintext);
    writeFileSync(file, encrypted, { mode: 0o600 });
    writeFileSync(output, '', { mode: 0o600 });
    return { directory, key, file, output };
  } catch {
    rmSync(directory, { recursive: true, force: true });
    throw new Error('Could not create the synthetic fixture. Check that SOPS and age are available.');
  }
}
