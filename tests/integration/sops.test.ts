import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test as base } from 'vitest';
import { create, createKey, secrets as fixtureSecrets } from './fixture.ts';

const secrets = { ...fixtureSecrets, multiline: 'first%line\r\nsecond "quoted" line' };
const source = fileURLToPath(new URL('../../src/index.ts', import.meta.url));
const offline = { PATH: '', https_proxy: 'http://127.0.0.1:1', http_proxy: 'http://127.0.0.1:1' };

type ActionResult = Omit<SpawnSyncReturns<string>, 'output'> & {
  output: string;
  temporaryFiles: string[];
  key: string;
};

function prepare() {
  const fixture = create(secrets);
  try {
    const { directory, key, file, output } = fixture;
    const temporary = join(directory, 'tmp');
    mkdirSync(temporary);
    cpSync(fileURLToPath(new URL('../../dist', import.meta.url)), join(directory, 'dist'), { recursive: true });
    const bundle = join(directory, 'dist', 'index.js');
    const identity = readFileSync(key, 'utf8');

    function run(entry: string, env: NodeJS.ProcessEnv = {}): ActionResult {
      writeFileSync(output, '', { mode: 0o600 });
      const inputKey = env.INPUT_KEY ?? identity;
      const result = spawnSync(process.execPath, [entry], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          PATH: process.env.PATH,
          INPUT_FILE: file,
          GITHUB_WORKSPACE: directory,
          GITHUB_OUTPUT: output,
          RUNNER_TEMP: temporary,
          RUNNER_TOOL_CACHE: join(directory, 'tools'),
          INPUT_KEY: inputKey,
          SOPS_AGE_KEY: identity,
          ...env,
        },
      });
      return { ...result, output: readFileSync(output, 'utf8'), temporaryFiles: readdirSync(temporary), key: inputKey };
    }
    return { directory, bundle, run };
  } catch (error) {
    rmSync(fixture.directory, { recursive: true, force: true });
    throw error;
  }
}

const test = base.extend('fixture', ({}, { onCleanup }) => {
  const fixture = prepare();
  onCleanup(() => rmSync(fixture.directory, { recursive: true, force: true }));
  return fixture;
});

describe('SOPS Integration', () => {
  test('installs SOPS and decrypts with the bundle', ({ fixture }) => {
    const result = fixture.run(fixture.bundle, { PATH: '' });

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, 'SOPS installation or decryption failed.');
  });

  test('reuses cached SOPS offline', ({ fixture }) => {
    const installed = fixture.run(fixture.bundle, { PATH: '' });
    assert.equal(installed.error, undefined);
    assert.equal(installed.status, 0, 'SOPS installation or decryption failed.');

    const cached = fixture.run(source, offline);

    assert.equal(cached.error, undefined);
    assert.equal(cached.status, 0, 'Cached SOPS decryption failed.');
  });

  test('preserves output names and values', ({ fixture }) => {
    for (const entry of [fixture.bundle, source]) {
      const result = fixture.run(entry);

      assert.equal(result.error, undefined);
      assert.equal(result.status, 0);
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

  test('keeps keys and secrets out of visible logs', ({ fixture }) => {
    const wrongKey = createKey();
    const bundled = fixture.run(fixture.bundle);
    const sourced = fixture.run(source);
    const failed = fixture.run(fixture.bundle, { INPUT_KEY: wrongKey });

    assert.equal(bundled.status, 0);
    assert.equal(sourced.status, 0);
    assert.equal(failed.status, 1);
    for (const result of [bundled, sourced, failed]) {
      assert.equal(result.error, undefined);
      assert.equal(result.stderr, '');
      const visible = result.stdout.split('\n').filter(line => !line.startsWith('::add-mask::')).join('\n');
      const key = result.key.trim();
      for (const value of [key, ...key.split(/\r?\n/).filter(Boolean), ...Object.values(secrets).filter(Boolean)]) {
        assert.equal(visible.includes(value), false);
        assert.equal(visible.includes(JSON.stringify(value).slice(1, -1)), false);
      }
    }
  });

  test('cleans up temporary downloads', ({ fixture }) => {
    const wrongKey = createKey();
    const installed = fixture.run(fixture.bundle, { PATH: '' });
    const cached = fixture.run(source, offline);
    const failed = fixture.run(fixture.bundle, { ...offline, INPUT_KEY: wrongKey });

    assert.equal(installed.status, 0);
    assert.equal(cached.status, 0);
    assert.equal(failed.status, 1);
    for (const result of [installed, cached, failed]) {
      assert.equal(result.error, undefined);
      assert.deepEqual(result.temporaryFiles, [], 'Installer must remove its temporary download.');
    }
  });

  test('rejects a wrong INPUT_KEY despite a correct ambient SOPS_AGE_KEY', ({ fixture }) => {
    const wrongKey = createKey();
    const failed = fixture.run(fixture.bundle, { INPUT_KEY: wrongKey });

    assert.equal(failed.error, undefined);
    assert.equal(failed.status, 1);
    assert.equal(failed.output, '');
    assert.ok(failed.stdout.includes('::error::SOPS decryption failed. Check the file and decryption key.'));
    const mask = wrongKey.trim().replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    assert.ok(failed.stdout.includes(`::add-mask::${mask}\n`));
    assert.equal(failed.stdout.split('\n').filter(line => line.startsWith('::add-mask::')).length, 1);
  });
});
