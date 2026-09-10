import * as core from '@actions/core';
import { readFileSync, rmSync } from 'node:fs';
import { createFixture } from './fixture.js';

const fixture = createFixture();
try {
  const key = readFileSync(fixture.key, 'utf8').trim();
  core.setSecret(key);
  core.setSecret(JSON.stringify(key).slice(1, -1));
  core.setOutput('directory', fixture.directory);
  core.setOutput('file', fixture.file);
  core.setOutput('key', key);
} catch {
  rmSync(fixture.directory, { recursive: true, force: true });
  throw new Error('Could not publish the synthetic fixture to GITHUB_OUTPUT.');
}
