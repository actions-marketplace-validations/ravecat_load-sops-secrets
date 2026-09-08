import { appendFileSync, rmSync } from 'node:fs';
import { createFixture } from './fixture.js';

const fixture = createFixture();
try {
  appendFileSync(process.env.GITHUB_OUTPUT, `directory=${fixture.directory}\nfile=${fixture.file}\nkey=${fixture.key}\n`);
} catch {
  rmSync(fixture.directory, { recursive: true, force: true });
  throw new Error('Could not publish synthetic fixture paths to GITHUB_OUTPUT.');
}
