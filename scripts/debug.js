import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFixture } from '../integration/fixture.js';

let fixture;
try {
  fixture = createFixture();
  const env = { ...process.env, INPUT_FILE: fixture.file, GITHUB_OUTPUT: fixture.output, INPUT_KEY: readFileSync(fixture.key, 'utf8') };
  const child = spawn(process.execPath, [
    '--inspect-brk=127.0.0.1:9229',
    fileURLToPath(new URL('../src/index.ts', import.meta.url)),
  ], {
    env,
    // A terminal does not redact the values carried by add-mask commands.
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    const [code, signal] = await once(child, 'exit');
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
} catch {
  process.stderr.write('Source debugging failed. Enter the Nix environment and try again.\n');
  process.exitCode = 1;
} finally {
  if (fixture) rmSync(fixture.directory, { recursive: true, force: true });
}
