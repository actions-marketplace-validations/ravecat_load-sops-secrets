import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const actionDirectory = fileURLToPath(new URL('..', import.meta.url));

function runAction(t, entry, document, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'load-sops-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = '-fixture $(touch injected).enc.json';
  const workspace = join(directory, 'workspace');
  mkdirSync(workspace);
  writeFileSync(join(workspace, file), document);
  writeFileSync(join(directory, 'output'), '');
  writeFileSync(join(directory, 'environment'), '');
  writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
  writeFileSync(join(directory, 'sops'), `#!${process.execPath}
import { appendFileSync, readFileSync } from 'node:fs';
appendFileSync('calls', JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.SOPS_TEST_STDIN && readFileSync(0).length !== 0) process.exit(2);
process.stderr.write('synthetic private diagnostic');
process.stdout.write(readFileSync(process.argv.at(-1)));
process.exit(Number(process.env.SOPS_TEST_EXIT || 0));
`, { mode: 0o700 });

  let main = resolve(actionDirectory, entry);
  if (entry.startsWith('dist/')) {
    main = join(directory, 'index.js');
    copyFileSync(resolve(actionDirectory, entry), main);
  }
  const result = spawnSync(process.execPath, [main], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      PATH: directory,
      INPUT_FILE: file,
      GITHUB_WORKSPACE: workspace,
      GITHUB_OUTPUT: join(directory, 'output'),
      GITHUB_ENV: join(directory, 'environment'),
      RUNNER_TEMP: directory,
      ...options,
    },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, '');
  assert.equal(readFileSync(join(directory, 'environment'), 'utf8'), '');
  assert.equal(readdirSync(directory).some(name => name.startsWith('sops-secrets.')), false);
  assert.equal(readdirSync(directory).includes('injected'), false);
  const calls = readdirSync(directory).includes('calls')
    ? readFileSync(join(directory, 'calls'), 'utf8').trim().split('\n').map(JSON.parse)
    : [];
  if (calls.length > 0) {
    assert.deepEqual(calls, [['decrypt', '--output-type', 'json', resolve(workspace, file)]]);
  }
  return { ...result, calls, output: readFileSync(join(directory, 'output'), 'utf8') };
}

function parseOutputs(text) {
  const outputs = {};
  while (text !== '') {
    const headerEnd = text.indexOf('\n');
    const [name, delimiter] = text.slice(0, headerEnd).split('<<');
    assert.ok(delimiter);
    const end = text.indexOf(`\n${delimiter}\n`, headerEnd + 1);
    assert.ok(end >= 0);
    Object.defineProperty(outputs, name, {
      value: text.slice(headerEnd + 1, end), enumerable: true,
    });
    text = text.slice(end + delimiter.length + 2);
  }
  return outputs;
}

for (const entry of ['src/index.js', 'dist/index.js']) {
  test(`${entry}: dynamic outputs preserve strings and register masks`, t => {
    const secrets = {
      api_token: 'synthetic-api-token',
      future_secret: 'a future value',
      empty: '',
      multiline: '\nfirst%line\r\nsecond "quoted" \\ line\n',
      'hyphen-key': 'Пример',
      command: '$(touch injected)\n::error::not a command',
      secrets: 'an ordinary key, not a reserved aggregate output',
    };
    const result = runAction(t, entry, JSON.stringify(secrets));
    assert.equal(result.status, 0);
    assert.equal(result.calls.length, 1);
    assert.deepEqual(parseOutputs(result.output), secrets);
    const lines = result.stdout.trimEnd().split('\n');
    assert.ok(lines.every(line => line.startsWith('::add-mask::')));
    const masks = new Set(lines.map(line => line.slice('::add-mask::'.length)
      .replaceAll('%0D', '\r').replaceAll('%0A', '\n').replaceAll('%25', '%')));
    assert.equal(masks.has(''), false);
    for (const value of Object.values(secrets).filter(value => value !== '')) {
      assert.ok(masks.has(value));
      assert.ok(masks.has(JSON.stringify(value).slice(1, -1)));
    }
  });

  test(`${entry}: an empty object yields no outputs or masks`, t => {
    const result = runAction(t, entry, '{}');
    assert.equal(result.status, 0);
    assert.equal(result.output, '');
    assert.equal(result.stdout, '');
    assert.equal(result.calls.length, 1);
  });

  test(`${entry}: closes SOPS stdin for noninteractive decryption`, t => {
    const result = runAction(t, entry, '{}', { SOPS_TEST_STDIN: '1' });
    assert.equal(result.status, 0);
    assert.equal(result.output, '');
    assert.equal(result.stdout, '');
    assert.equal(result.calls.length, 1);
  });

  const invalidDocuments = {
    'malformed JSON': '{"secret":"synthetic-private-value",',
    'null document': 'null',
    'array document': '["synthetic-private-value"]',
    'scalar document': '"synthetic-private-value"',
    'nested value': '{"valid":"synthetic-private-value","nested":{"key":"value"}}',
    'non-string value': '{"valid":"synthetic-private-value","number":1}',
    'invalid output name': '{"valid":"synthetic-private-value","bad\\nname":"value"}',
    'case-insensitive collision': '{"token":"synthetic-private-value","TOKEN":"different"}',
  };
  for (const [scenario, document] of Object.entries(invalidDocuments)) {
    test(`${entry}: rejects ${scenario} before publishing outputs`, t => {
      const result = runAction(t, entry, document);
      assert.equal(result.status, 1);
      assert.equal(result.output, '');
      assert.equal(result.calls.length, 1);
      assert.equal(result.stdout, '::error::Decrypted SOPS content must be a JSON object of strings with valid, case-insensitively unique output names.\n');
    });
  }

  test(`${entry}: decryption failure reveals neither stdout nor stderr`, t => {
    const result = runAction(t, entry, '{"secret":"synthetic-private-value"}', { SOPS_TEST_EXIT: '1' });
    assert.equal(result.status, 1);
    assert.equal(result.output, '');
    assert.equal(result.calls.length, 1);
    assert.equal(result.stdout, '::error::SOPS decryption failed. Check the file and decryption key.\n');
  });

  for (const variable of ['INPUT_FILE', 'GITHUB_OUTPUT']) {
    test(`${entry}: missing ${variable} stops before decryption`, t => {
      const result = runAction(t, entry, '{}', { [variable]: '' });
      assert.equal(result.status, 1);
      assert.equal(result.output, '');
      assert.equal(result.calls.length, 0);
      assert.equal(result.stdout, '::error::A file input and a writable GITHUB_OUTPUT file are required.\n');
    });
  }

  test(`${entry}: whitespace-only input stops before decryption`, t => {
    const result = runAction(t, entry, '{}', { INPUT_FILE: ' \t\n ' });
    assert.equal(result.status, 1);
    assert.equal(result.output, '');
    assert.equal(result.calls.length, 0);
    assert.equal(result.stdout, '::error::A file input and a writable GITHUB_OUTPUT file are required.\n');
  });

  test(`${entry}: missing SOPS and runner cache fail without publishing outputs`, t => {
    const result = runAction(t, entry, '{}', { PATH: '' });
    assert.equal(result.status, 1);
    assert.equal(result.output, '');
    assert.equal(result.calls.length, 0);
    assert.equal(result.stdout.split('\n').filter(line => line.startsWith('::error::')).join('\n'), '::error::SOPS setup failed. Check platform support, network access, and the runner tool cache.');
  });

  test(`${entry}: a corrupted cached binary is rejected before execution`, t => {
    const cache = mkdtempSync(join(tmpdir(), 'load-sops-cache-test-'));
    t.after(() => rmSync(cache, { recursive: true, force: true }));
    const directory = join(cache, `load-sops-secrets-${process.platform}`, '3.13.1', process.arch);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, process.platform === 'win32' ? 'sops.exe' : 'sops'), 'untrusted executable', { mode: 0o755 });
    writeFileSync(`${directory}.complete`, '');
    const result = runAction(t, entry, '{}', { PATH: '', RUNNER_TOOL_CACHE: cache });
    assert.equal(result.status, 1);
    assert.equal(result.output, '');
    assert.equal(result.calls.length, 0);
    assert.equal(result.stdout.split('\n').filter(line => line.startsWith('::error::')).join('\n'), '::error::SOPS setup failed. Check platform support, network access, and the runner tool cache.');
  });
}

test('main module can be imported without running the action', async () => {
  const { run } = await import('../src/main.js');
  assert.equal(typeof run, 'function');
  assert.equal(process.exitCode, undefined);
});
