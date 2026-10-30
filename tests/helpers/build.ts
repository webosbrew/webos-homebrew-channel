/*
 * Build artifacts that tests read (the webpack service bundle and the ES5
 * DOMPurify vendor file), produced exactly once per test run.
 *
 * `npm test` builds them up front (the `pretest` script), so test files only
 * verify they are current. When a single test file is run by hand the first
 * caller builds; concurrent test processes coordinate through a lock
 * directory so two never build into the same output at once.
 *
 * "Current" means: a stamp file records the newest mtime of the inputs at
 * build time; if any input is newer now, the artifact is rebuilt. Existence
 * alone proves nothing (a stale bundle hid a missing shim once).
 */

import { execFileSync } from 'node:child_process';
import nodeFs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..');

interface Artifact {
  name: string;
  output: string;
  stamp: string;
  inputs: string[];
  build: () => void;
}

function newestMtime(paths: string[]): number {
  let newest = 0;
  const visit = (p: string): void => {
    if (!nodeFs.existsSync(p)) return;
    const st = nodeFs.statSync(p);
    if (st.isDirectory()) {
      for (const entry of nodeFs.readdirSync(p)) {
        if (entry === 'node_modules' || entry === 'bin' || entry === 'certs') continue;
        visit(path.join(p, entry));
      }
    } else {
      newest = Math.max(newest, st.mtimeMs);
    }
  };
  paths.forEach(visit);
  return newest;
}

function isCurrent(artifact: Artifact): boolean {
  if (!nodeFs.existsSync(artifact.output) || !nodeFs.existsSync(artifact.stamp)) return false;
  const stamped = Number(nodeFs.readFileSync(artifact.stamp, 'utf8'));
  return Number.isFinite(stamped) && stamped >= newestMtime(artifact.inputs);
}

function withLock(name: string, fn: () => void): void {
  const lockDir = path.join(repoRoot, 'dist', `.${name}.lock`);
  nodeFs.mkdirSync(path.dirname(lockDir), { recursive: true });
  const deadline = Date.now() + 180000;
  for (;;) {
    try {
      nodeFs.mkdirSync(lockDir);
      break;
    } catch {
      // another process holds the lock; stale locks (> 3 min) are broken
      try {
        if (Date.now() - nodeFs.statSync(lockDir).mtimeMs > 180000) nodeFs.rmSync(lockDir, { recursive: true, force: true });
      } catch {
        /* vanished */
      }
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${name} build lock`);
      const until = Date.now() + 100;
      while (Date.now() < until) {
        /* spin; tests run in separate processes */
      }
    }
  }
  try {
    fn();
  } finally {
    nodeFs.rmSync(lockDir, { recursive: true, force: true });
  }
}

function ensure(artifact: Artifact): void {
  if (isCurrent(artifact)) return;
  withLock(artifact.name, () => {
    if (isCurrent(artifact)) return; // built by whoever held the lock
    const inputsMtime = newestMtime(artifact.inputs);
    artifact.build();
    nodeFs.mkdirSync(path.dirname(artifact.stamp), { recursive: true });
    nodeFs.writeFileSync(artifact.stamp, String(inputsMtime));
  });
}

const serviceBundle: Artifact = {
  name: 'service-bundle',
  output: path.join(repoRoot, 'dist', 'services', 'service.js'),
  stamp: path.join(repoRoot, 'dist', '.service-bundle.stamp'),
  inputs: ['services', 'appinfo.json', 'webpack.config.js', 'babel.config.json', 'tsconfig.json', 'package-lock.json'].map((p) =>
    path.join(repoRoot, p),
  ),
  build: () => {
    execFileSync('npx', ['webpack', '--env', 'production'], { cwd: repoRoot, stdio: 'pipe', timeout: 180000 });
  },
};

const dompurifyVendor: Artifact = {
  name: 'dompurify-vendor',
  output: path.join(repoRoot, 'frontend', 'vendor', 'purify.es5.js'),
  stamp: path.join(repoRoot, 'dist', '.dompurify-vendor.stamp'),
  inputs: ['tools/build-dompurify.js', 'package-lock.json'].map((p) => path.join(repoRoot, p)),
  build: () => {
    execFileSync('node', [path.join(repoRoot, 'tools', 'build-dompurify.js')], { cwd: repoRoot, stdio: 'pipe', timeout: 180000 });
  },
};

/** Path of the current service bundle directory (dist/services), building if needed. */
export function ensureServiceBundle(): string {
  ensure(serviceBundle);
  return path.dirname(serviceBundle.output);
}

/** Path of the current ES5 DOMPurify vendor file, building if needed. */
export function ensureDompurifyVendor(): string {
  ensure(dompurifyVendor);
  return dompurifyVendor.output;
}

/** Used by the `pretest` script: build everything once, up front. */
if (require.main === module) {
  ensureServiceBundle();
  ensureDompurifyVendor();
  console.info('[ ] test artifacts current: dist/services, frontend/vendor/purify.es5.js');
}
