import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('installs SOPS with an empty PATH, reuses its cache, and rejects a wrong key', t => {
  const directory = mkdtempSync(join(tmpdir(), 'load-sops-integration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const temporary = join(directory, 'tmp');
  mkdirSync(temporary);
  cpSync(fileURLToPath(new URL('../dist', import.meta.url)), join(directory, 'dist'), { recursive: true });

  function fixtureCommand(command, args, input) {
    const result = spawnSync(command, args, {
      cwd: directory,
      encoding: 'utf8',
      input,
      timeout: 10_000,
      env: { PATH: process.env.PATH },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, 'Synthetic fixture preparation failed.');
    return result.stdout;
  }

  const identity = fixtureCommand('age-keygen', []);
  const recipient = fixtureCommand('age-keygen', ['-y'], identity).trim();
  const secrets = { token: 'synthetic-integration-token', multiline: 'first%line\r\nsecond "quoted" line', empty: '' };
  const plaintext = join(directory, 'fixture.json');
  writeFileSync(plaintext, JSON.stringify(secrets), { mode: 0o600 });
  const encrypted = fixtureCommand('sops', [
    'encrypt', '--age', recipient, '--input-type', 'json', '--output-type', 'json', plaintext,
  ]);
  rmSync(plaintext);
  writeFileSync(join(directory, 'fixture.enc.json'), encrypted);

  function run(entry, key, offline = false) {
    const output = join(directory, 'output');
    writeFileSync(output, '', { mode: 0o600 });
    const result = spawnSync(process.execPath, [entry], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        PATH: '',
        INPUT_FILE: 'fixture.enc.json',
        GITHUB_WORKSPACE: directory,
        GITHUB_OUTPUT: output,
        RUNNER_TEMP: temporary,
        RUNNER_TOOL_CACHE: join(directory, 'tools'),
        SOPS_AGE_KEY: key,
        ...(offline ? { https_proxy: 'http://127.0.0.1:1', http_proxy: 'http://127.0.0.1:1' } : {}),
      },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.stderr, '');
    const visible = result.stdout.split('\n').filter(line => !line.startsWith('::add-mask::')).join('\n');
    for (const value of Object.values(secrets).filter(Boolean)) {
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
  const cached = run(fileURLToPath(new URL('../src/index.js', import.meta.url)), identity, true);
  assertOutputs(cached);
  assert.equal(cached.stdout.includes('Downloading'), false);

  const wrongIdentity = fixtureCommand('age-keygen', []);
  const failed = run(bundle, wrongIdentity, true);
  assert.equal(failed.status, 1);
  assert.equal(failed.output, '');
  assert.ok(failed.stdout.includes('::error::SOPS decryption failed. Check the file and decryption key.'));
  assert.equal(failed.stdout.includes('::add-mask::'), false);
});
