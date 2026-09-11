import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { createFixture, secrets as fixtureSecrets } from './fixture.ts';

const secrets = { ...fixtureSecrets, multiline: 'first%line\r\nsecond "quoted" line' };

type ActionResult = Omit<SpawnSyncReturns<string>, 'output'> & {
  output: string;
  temporaryFiles: string[];
  key: string;
};

describe('SOPS Integration', () => {
  const directories: string[] = [];
  let identity: string;
  let wrongIdentity: string;
  let installed: ActionResult;
  let cached: ActionResult;
  let failed: ActionResult;

  after(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  });

  before(() => {
    const { directory, key, file } = createFixture(secrets);
    directories.push(directory);
    const temporary = join(directory, 'tmp');
    mkdirSync(temporary);
    cpSync(fileURLToPath(new URL('../../dist', import.meta.url)), join(directory, 'dist'), { recursive: true });

    identity = readFileSync(key, 'utf8');

    function run(entry: string, key: string, offline = false): ActionResult {
      const output = join(directory, 'output');
      writeFileSync(output, '', { mode: 0o600 });
      const result = spawnSync(process.execPath, [entry], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          PATH: '',
          INPUT_FILE: file,
          GITHUB_WORKSPACE: directory,
          GITHUB_OUTPUT: output,
          RUNNER_TEMP: temporary,
          RUNNER_TOOL_CACHE: join(directory, 'tools'),
          INPUT_KEY: key,
          SOPS_AGE_KEY: identity,
          ...(offline ? { https_proxy: 'http://127.0.0.1:1', http_proxy: 'http://127.0.0.1:1' } : {}),
        },
      });
      return { ...result, output: readFileSync(output, 'utf8'), temporaryFiles: readdirSync(temporary), key };
    }

    const bundle = join(directory, 'dist', 'index.js');
    installed = run(bundle, identity);
    cached = run(fileURLToPath(new URL('../../src/index.ts', import.meta.url)), identity, true);

    const wrongFixture = createFixture();
    directories.push(wrongFixture.directory);
    wrongIdentity = readFileSync(wrongFixture.key, 'utf8');
    failed = run(bundle, wrongIdentity, true);
  });

  test('installs SOPS and decrypts with the bundle', () => {
    assert.equal(installed.error, undefined);
    assert.equal(installed.status, 0, 'SOPS installation or decryption failed.');
  });

  test('reuses cached SOPS offline', () => {
    assert.equal(cached.error, undefined);
    assert.equal(cached.status, 0, 'Cached SOPS decryption failed.');
  });

  test('preserves output names and values', () => {
    for (const result of [installed, cached]) {
      const values: Record<string, string> = {};
      let remaining = result.output;
      while (remaining !== '') {
        const headerEnd = remaining.indexOf('\n');
        const [name, delimiter] = remaining.slice(0, headerEnd).split('<<');
        assert.ok(name);
        assert.ok(delimiter);
        const end = remaining.indexOf(`\n${delimiter}\n`, headerEnd + 1);
        assert.ok(end >= 0);
        values[name] = remaining.slice(headerEnd + 1, end);
        remaining = remaining.slice(end + delimiter.length + 2);
      }
      assert.deepEqual(values, secrets);
      assert.ok(result.stdout.includes('::add-mask::'));
    }
  });

  test('keeps keys and secrets out of visible logs', () => {
    for (const result of [installed, cached, failed]) {
      assert.equal(result.stderr, '');
      const visible = result.stdout.split('\n').filter(line => !line.startsWith('::add-mask::')).join('\n');
      const key = result.key.trim();
      for (const value of [key, ...key.split(/\r?\n/).filter(Boolean), ...Object.values(secrets).filter(Boolean)]) {
        assert.equal(visible.includes(value), false);
        assert.equal(visible.includes(JSON.stringify(value).slice(1, -1)), false);
      }
    }
  });

  test('cleans up temporary downloads', () => {
    for (const result of [installed, cached, failed]) {
      assert.deepEqual(result.temporaryFiles, [], 'Installer must remove its temporary download.');
    }
  });

  test('rejects a wrong INPUT_KEY despite a correct ambient SOPS_AGE_KEY', () => {
    assert.equal(failed.error, undefined);
    assert.equal(failed.status, 1);
    assert.equal(failed.output, '');
    assert.ok(failed.stdout.includes('::error::SOPS decryption failed. Check the file and decryption key.'));
    const mask = wrongIdentity.trim().replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    assert.ok(failed.stdout.includes(`::add-mask::${mask}\n`));
    assert.equal(failed.stdout.split('\n').filter(line => line.startsWith('::add-mask::')).length, 1);
  });
});
