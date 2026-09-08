import { which } from '@actions/io';
import * as toolCache from '@actions/tool-cache';
import { createHash } from 'node:crypto';
import { chmod, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const version = '3.13.1';
// SHA-256 values from the official sops-v3.13.1.checksums.txt release asset.
const releases = {
  'linux-x64': ['linux.amd64', '620a9d7e3352ababeca6908cea24a6e8b14ce89a448ddbd3f94f1ef3398f470a'],
  'linux-arm64': ['linux.arm64', '19576fb1734dbf8fb77eda0cf0f3a2218f99bf4d33b814318e5e10d6babb9820'],
  'darwin-x64': ['darwin.amd64', 'dad79d1b1dea767ca38ffaa50e10330a3e807dd13c853ef9c880567acef4f1ef'],
  'darwin-arm64': ['darwin.arm64', 'a2c0dd37eb031068af6ef213b78cfa67b7f1afd76c2e5cc404257f42bbc8367d'],
  'win32-x64': ['amd64.exe', '4654e53fff6d0a1842facd3a0ed5a66a8ab6164004b0ad4ca2d5e2b1c5473b65'],
  'win32-arm64': ['arm64.exe', 'dda6e1778f4248a2faa999735d16e97e80c9de0dae8c1da3f5fb79815bc78f26'],
};

export async function setupSops() {
  const installed = await which('sops');
  if (installed) return installed;

  const platform = `${process.platform}-${process.arch}`;
  const release = releases[platform];
  if (!release) throw new Error('Unsupported SOPS platform.');

  const [suffix, checksum] = release;
  const name = process.platform === 'win32' ? 'sops.exe' : 'sops';
  const tool = `load-sops-secrets-${process.platform}`;
  let directory = toolCache.find(tool, version, process.arch);
  if (!directory) {
    const url = `https://github.com/getsops/sops/releases/download/v${version}/sops-v${version}.${suffix}`;
    const download = await toolCache.downloadTool(url);
    try {
      await verifyChecksum(download, checksum);
      if (process.platform !== 'win32') await chmod(download, 0o755);
      directory = await toolCache.cacheFile(download, name, tool, version, process.arch);
    } finally {
      await rm(download, { force: true });
    }
  }

  const executable = join(directory, name);
  // Check cache hits too, before executing a previously downloaded binary.
  await verifyChecksum(executable, checksum);
  return executable;
}

async function verifyChecksum(file, expected) {
  const actual = createHash('sha256').update(await readFile(file)).digest('hex');
  if (actual !== expected) throw new Error('SOPS checksum mismatch.');
}
