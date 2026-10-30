/*
 * Static checks on the shell scripts and build tools that cannot be executed
 * safely here (startup.sh mounts filesystems; install.sh talks to a TV).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import nodeFs from 'node:fs';
import path from 'node:path';

import { haveTool } from './helpers/env';

const repoRoot = path.resolve(__dirname, '..');
const rel = (p: string): string => path.join(repoRoot, p);

function syntaxOk(shell: string, file: string): void {
  const result = spawnSync(shell, ['-n', rel(file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${shell} -n ${file}: ${result.stderr}`);
}

describe('shell scripts', () => {
  it('startup.sh is valid bash and declares itself as such', () => {
    assert.ok(nodeFs.readFileSync(rel('services/startup.sh'), 'utf8').startsWith('#!/bin/bash\n'));
    syntaxOk('bash', 'services/startup.sh');
  });

  it('jumpstart.sh is valid POSIX sh', () => {
    syntaxOk('sh', 'services/jumpstart.sh');
  });

  it('install.sh is valid POSIX sh', () => {
    syntaxOk('sh', 'tools/install.sh');
  });

  it('build-binaries.sh and rebuild-icons.sh are valid bash', () => {
    syntaxOk('bash', 'tools/build-binaries.sh');
    syntaxOk('bash', 'tools/rebuild-icons.sh');
  });

  it('startup.sh guards every run with the once-flag and lock', () => {
    const src = nodeFs.readFileSync(rel('services/startup.sh'), 'utf8');
    assert.match(src, /once=\/tmp\/webosbrew_startup/);
    assert.match(src, /flock -x -n 200/);
    assert.match(src, /touch "\$\{once\}"/);
  });

  it('startup.sh honours SERVICE_DIR and SKIP_ELEVATION as the service expects', () => {
    const src = nodeFs.readFileSync(rel('services/startup.sh'), 'utf8');
    assert.match(src, /SERVICE_DIR="\$\{SERVICE_DIR-/);
    assert.match(src, /SKIP_ELEVATION/);
    assert.match(src, /webosbrew_failsafe/);
  });

  it('passes shellcheck when available', { skip: !haveTool('shellcheck') && 'shellcheck not installed' }, () => {
    const checks: [string, string[]][] = [
      // SC2064: `trap "rm -f ${once}.lock"` expands at definition on purpose; the path is constant.
      ['services/startup.sh', ['-e', 'SC2064']],
      // No shebang (SC2148) and a stray `& >/dev/null` (SC2188): historical quirks in a file
      // that is part of the RootMyTV chain and must stay byte-identical to what is deployed.
      ['services/jumpstart.sh', ['-s', 'sh', '-e', 'SC2148,SC2188']],
      ['tools/install.sh', []],
      ['tools/build-binaries.sh', []],
      ['tools/rebuild-icons.sh', []],
    ];
    for (const [file, extra] of checks) {
      const result = spawnSync('shellcheck', ['-S', 'warning', ...extra, rel(file)], { encoding: 'utf8' });
      assert.equal(result.status, 0, `${file}:\n${result.stdout}`);
    }
  });
});

describe('frontend modules bundled for old WebKit are ES5', () => {
  const acorn = require('acorn') as typeof import('acorn');
  for (const file of [
    'frontend/core/service-contract.js',
    'frontend/core/manifest.js',
    'frontend/core/repository.js',
    'frontend/configutils.js',
    'frontend/baseurl.js',
  ]) {
    it(`${file} parses as ES5`, () => {
      assert.doesNotThrow(() => acorn.parse(nodeFs.readFileSync(rel(file), 'utf8'), { ecmaVersion: 5, sourceType: 'script' }));
    });
  }
});

describe('node tools', () => {
  for (const tool of ['tools/gen-manifest.js', 'tools/sync-version.js', 'tools/build-dompurify.js', 'tools/gen-startup-checksums.js']) {
    it(`${tool} parses`, () => {
      execFileSync('node', ['--check', rel(tool)], { stdio: 'pipe' });
    });
  }

  it('gen-manifest.js produces the manifest format install.sh and the frontend expect', () => {
    const tmp = nodeFs.mkdtempSync(path.join(repoRoot, '.tmp-manifest-'));
    try {
      const appinfo = JSON.parse(nodeFs.readFileSync(rel('appinfo.json'), 'utf8')) as { id: string; version: string };
      nodeFs.copyFileSync(rel('appinfo.json'), path.join(tmp, 'appinfo.json'));
      const ipk = path.join(tmp, `${appinfo.id}_${appinfo.version}_all.ipk`);
      nodeFs.writeFileSync(ipk, 'fake ipk contents');
      const out = path.join(tmp, 'manifest.json');
      execFileSync('node', [rel('tools/gen-manifest.js'), out], { cwd: tmp, stdio: 'pipe' });
      const manifest = JSON.parse(nodeFs.readFileSync(out, 'utf8')) as Record<string, any>;
      assert.equal(manifest['id'], appinfo.id);
      assert.equal(manifest['version'], appinfo.version);
      assert.equal(manifest['ipkUrl'], path.basename(ipk));
      assert.match(String(manifest['ipkHash']?.sha256), /^[0-9a-f]{64}$/);
    } finally {
      nodeFs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('packaging metadata', () => {
  it('appinfo.json and package.json agree on the version', () => {
    const appinfo = JSON.parse(nodeFs.readFileSync(rel('appinfo.json'), 'utf8')) as { version: string };
    const pkg = JSON.parse(nodeFs.readFileSync(rel('package.json'), 'utf8')) as { version: string; assets: string[] };
    assert.equal(appinfo.version, pkg.version);
  });

  it('every asset the service needs is listed for packaging', () => {
    const pkg = JSON.parse(nodeFs.readFileSync(rel('package.json'), 'utf8')) as { assets: string[] };
    for (const required of [
      'services/certs/**',
      'services/services.json',
      'services/startup.sh',
      'services/jumpstart.sh',
      'services/elevate-service',
      'services/run-js-service',
      'services/bin/**',
    ]) {
      assert.ok(pkg.assets.includes(required), `${required} missing from package.json assets`);
    }
  });

  it('exactly one CA bundle is shipped', () => {
    const certs = nodeFs.readdirSync(rel('services/certs')).filter((f) => f.endsWith('.pem'));
    assert.equal(certs.length, 1, `expected one bundle, found ${certs.join(', ')}`);
    const count = (nodeFs.readFileSync(rel(`services/certs/${certs[0]}`), 'utf8').match(/BEGIN CERTIFICATE/g) ?? []).length;
    assert.ok(count > 50, `bundle looks truncated (${count} certs)`);
  });

  it('the startup checksum list covers the bundled startup.sh', () => {
    const list = JSON.parse(nodeFs.readFileSync(rel('services/startup-checksums.json'), 'utf8')) as { sha256: string }[];
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const current = createHash('sha256')
      .update(nodeFs.readFileSync(rel('services/startup.sh')))
      .digest('hex');
    assert.ok(
      list.some((e) => e.sha256 === current),
      'services/startup.sh changed but startup-checksums.json was not regenerated (npm run startup-checksums)',
    );
  });
});
