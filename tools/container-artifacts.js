#!/usr/bin/env node
// Collect only the artifacts from this build, plus enough metadata to identify it.
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { execFileSync } = require('child_process');

const app = require('../appinfo.json');
const output = path.resolve('artifacts/container');
const ipk = `${app.id}_${app.version}_all.ipk`;
const manifest = `${app.id}.manifest.json`;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

fs.mkdirSync(output, { recursive: true });
for (const file of [ipk, manifest]) {
  fs.copyFileSync(file, path.join(output, file));
}
const info = {
  appId: app.id,
  version: app.version,
  sourceCommit: git('rev-parse', 'HEAD'),
  sourceDirty: git('status', '--porcelain').length > 0,
  nodeVersion: process.version,
  npmVersion: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
  packageLockSha256: hash('package-lock.json'),
  serviceBundleSha256: hash('dist/services/service.js'),
  ipkSha256: hash(ipk),
};
fs.writeFileSync(path.join(output, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
const sums = [ipk, manifest, 'build-info.json'].map((file) => `${hash(path.join(output, file))}  ${file}\n`).join('');
fs.writeFileSync(path.join(output, 'SHA256SUMS'), sums);
console.info(`[ ] Artifacts ready in ${output}`);
