/*
 * Builds a throwaway "TV filesystem" and ServiceConfig for handler tests.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import nodeFs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import type { ServiceConfig } from '../../services/handlers';

export interface TestEnv {
  root: string;
  config: ServiceConfig;
  selfUpdates: string[];
  cleanup: () => void;
}

const repoRoot = path.resolve(__dirname, '..', '..');

/**
 * Creates a temp tree mirroring the paths the service touches and a config
 * pointing at it. The "bundle" directory gets harmless stand-ins for
 * startup.sh / jumpstart.sh / elevate-service so nothing real can run.
 */
export function createTestEnv(overrides: Partial<ServiceConfig> & { runningAsRoot?: boolean } = {}): TestEnv {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'hbchannel-env-'));
  const serviceDir = path.join(root, 'service');
  const preferencesDir = path.join(root, 'preferences');
  const tmpDir = path.join(root, 'tmp');
  const webosbrewDir = path.join(root, 'webosbrew');
  const devmodeDir = path.join(root, 'devmode');
  const homeDir = path.join(root, 'home');

  for (const dir of [serviceDir, preferencesDir, tmpDir, devmodeDir, homeDir]) {
    nodeFs.mkdirSync(dir, { recursive: true });
  }

  // Bundled scripts: the real startup.sh contents (so checksums match what
  // we ship) for comparisons, but they are never executed by the handlers
  // under test except via autostart, which runs the *copy* we control.
  nodeFs.copyFileSync(path.join(repoRoot, 'services', 'startup.sh'), path.join(serviceDir, 'startup.sh'));
  nodeFs.copyFileSync(path.join(repoRoot, 'services', 'jumpstart.sh'), path.join(serviceDir, 'jumpstart.sh'));
  // elevate-service stand-in: records its arguments.
  nodeFs.writeFileSync(path.join(serviceDir, 'elevate-service'), `#!/bin/sh\necho "$@" >> "${root}/elevate-calls.log"\n`, { mode: 0o755 });

  const selfUpdates: string[] = [];

  const config: ServiceConfig = {
    runningAsRoot: true,
    paths: {
      serviceDir,
      preferencesDir,
      tmpDir,
      startupOnceFlag: path.join(tmpDir, 'webosbrew_startup'),
      webosbrewDir,
      startDevmode: path.join(devmodeDir, 'start-devmode.sh'),
      homeDir,
      homebrewBaseDir: path.join(root, 'homebrew'),
    },
    downloadTimeoutMs: 5000,
    execDefaultTimeoutMs: 5000,
    execMaxBuffer: 1024 * 1024,
    rebootCommand: 'true',
    startSelfUpdate: (p) => {
      selfUpdates.push(p);
    },
    ...overrides,
  };

  return {
    root,
    config,
    selfUpdates,
    cleanup: () => {
      nodeFs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function haveTool(name: string): boolean {
  try {
    execFileSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds a minimal but structurally valid .ipk (ar archive with
 * control.tar.gz) the way opkg/ares-package lay it out.
 */
export function buildIpk(dir: string, control: Record<string, string>): { path: string; sha256: string } {
  const work = nodeFs.mkdtempSync(path.join(dir, 'ipk-'));
  const controlDir = path.join(work, 'control');
  nodeFs.mkdirSync(controlDir);
  const controlText = `${Object.entries(control)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n`;
  nodeFs.writeFileSync(path.join(controlDir, 'control'), controlText);
  nodeFs.writeFileSync(path.join(work, 'debian-binary'), '2.0\n');
  execFileSync('tar', ['-czf', path.join(work, 'control.tar.gz'), '-C', controlDir, 'control']);
  execFileSync('tar', ['-czf', path.join(work, 'data.tar.gz'), '-T', '/dev/null']);
  const ipk = path.join(work, 'package.ipk');
  execFileSync('ar', ['rc', ipk, 'debian-binary', 'control.tar.gz', 'data.tar.gz'], { cwd: work });
  return { path: ipk, sha256: sha256(nodeFs.readFileSync(ipk)) };
}

/**
 * Serves files from `dir` over HTTP on a random port.
 */
export function serveDir(dir: string): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = path.join(dir, decodeURIComponent((req.url ?? '/').replace(/^\//, '')));
      if (!file.startsWith(dir) || !nodeFs.existsSync(file)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const data = nodeFs.readFileSync(file);
      res.writeHead(200, { 'content-length': data.length });
      res.end(data);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('no address');
      resolve({ url: `http://127.0.0.1:${address.port}`, close: () => server.close() });
    });
  });
}
