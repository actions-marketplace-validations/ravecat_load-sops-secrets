import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createFixture, secrets as fixtureSecrets } from './fixture.js';

const secrets = { ...fixtureSecrets, multiline: 'first%line\r\nsecond "quoted" line' };

test('installs SOPS with an empty PATH, reuses its cache, and rejects a wrong key', t => {
  const { directory, key, file } = createFixture(secrets);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const temporary = join(directory, 'tmp');
  mkdirSync(temporary);
  cpSync(fileURLToPath(new URL('../dist', import.meta.url)), join(directory, 'dist'), { recursive: true });

  const identity = readFileSync(key, 'utf8');

  function run(entry, key, offline = false) {
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
    assert.equal(result.error, undefined);
    assert.equal(result.stderr, '');
    const visible = result.stdout.split('\n').filter(line => !line.startsWith('::add-mask::')).join('\n');
    for (const value of [key.trim(), ...key.trim().split(/\r?\n/).filter(Boolean), ...Object.values(secrets).filter(Boolean)]) {
      assert.equal(visible.includes(value), false);
      assert.equal(visible.includes(JSON.stringify(value).slice(1, -1)), false);
    }
    assert.deepEqual(readdirSync(temporary), [], 'Installer must remove its temporary download.');
    return { ...result, output: readFileSync(output, 'utf8') };
  }

  function assertOutputs(result) {
    assert.equal(result.status, 0, 'SOPS installation or decryption failed.');
    const values = {};
    let remaining = result.output;
    while (remaining !== '') {
      const headerEnd = remaining.indexOf('\n');
      const [name, delimiter] = remaining.slice(0, headerEnd).split('<<');
      assert.ok(delimiter);
      const end = remaining.indexOf(`\n${delimiter}\n`, headerEnd + 1);
      assert.ok(end >= 0);
      values[name] = remaining.slice(headerEnd + 1, end);
      remaining = remaining.slice(end + delimiter.length + 2);
    }
    assert.deepEqual(values, secrets);
    assert.ok(result.stdout.includes('::add-mask::'));
  }

  const bundle = join(directory, 'dist', 'index.js');
  assertOutputs(run(bundle, identity));
  const cached = run(fileURLToPath(new URL('../src/index.ts', import.meta.url)), identity, true);
  assertOutputs(cached);
  assert.equal(cached.stdout.includes('Downloading'), false);

  const wrongFixture = createFixture();
  t.after(() => rmSync(wrongFixture.directory, { recursive: true, force: true }));
  const wrongIdentity = readFileSync(wrongFixture.key, 'utf8');
  const failed = run(bundle, wrongIdentity, true);
  assert.equal(failed.status, 1);
  assert.equal(failed.output, '');
  assert.ok(failed.stdout.includes('::error::SOPS decryption failed. Check the file and decryption key.'));
  const mask = wrongIdentity.trim().replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  assert.ok(failed.stdout.includes(`::add-mask::${mask}\n`));
  assert.equal(failed.stdout.split('\n').filter(line => line.startsWith('::add-mask::')).length, 1);
});
