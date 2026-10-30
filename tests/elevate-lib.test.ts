import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { defaultRequiredNames, patchManifestContents, patchRoleFileContents, patchServiceFileContents } from '../services/elevate-lib';

const runJsService = '/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/run-js-service';

describe('patchServiceFileContents', () => {
  it('rewrites JS services to use our run-js-service', () => {
    const original = [
      '[D-BUS Service]',
      'Name=org.webosbrew.hbchannel.service',
      'Exec=/usr/bin/run-js-service -n /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service',
      'Type=dynamic',
      '',
    ].join('\n');
    const result = patchServiceFileContents(original, runJsService);
    assert.equal(result.type, 'js');
    assert.equal(
      result.contents,
      [
        '[D-BUS Service]',
        'Name=org.webosbrew.hbchannel.service',
        `Exec=${runJsService} -n /media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service`,
        'Type=dynamic',
        '',
      ].join('\n'),
    );
  });

  it('strips the jailer from native services', () => {
    const original =
      'Exec=/usr/bin/jailer -t native_devmode -i com.example.svc -p /media/developer/apps/usr/palm/services/com.example.svc /media/developer/apps/usr/palm/services/com.example.svc/svc\n';
    const result = patchServiceFileContents(original, runJsService);
    assert.equal(result.type, 'native');
    assert.equal(result.contents, 'Exec=/media/developer/apps/usr/palm/services/com.example.svc/svc\n');
  });

  it('leaves already-elevated native services alone', () => {
    const original = 'Exec=/media/developer/apps/usr/palm/services/com.example.svc/svc\n';
    const result = patchServiceFileContents(original, runJsService);
    assert.equal(result.type, 'elevated-native');
    assert.equal(result.contents, original);
  });

  it('flags unknown service types without changing them', () => {
    const original = 'Exec=/usr/bin/something-else\n';
    const result = patchServiceFileContents(original, runJsService);
    assert.equal(result.type, 'unknown');
    assert.equal(result.contents, original);
  });

  it('is idempotent', () => {
    const original = 'Exec=/usr/bin/run-js-service -n /x\n';
    const once = patchServiceFileContents(original, runJsService).contents;
    const twice = patchServiceFileContents(once, runJsService).contents;
    assert.equal(twice, once);
  });
});

describe('patchRoleFileContents', () => {
  const modernRole = {
    appId: 'org.webosbrew.hbchannel.service',
    type: 'regular',
    allowedNames: ['org.webosbrew.hbchannel.service'],
    trustLevel: 'dev',
    permissions: [{ service: 'org.webosbrew.hbchannel.service', inbound: ['*'], outbound: ['com.webos.service.foo'] }],
  };

  it('adds required names and permissions to a modern role file', () => {
    const result = patchRoleFileContents(JSON.stringify(modernRole), false);
    assert.equal(result.changed, true);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.addedPermissions, ['*', 'com.webos.service.capture.client*']);

    const patched = JSON.parse(result.contents);
    assert.deepEqual(patched.allowedNames, ['org.webosbrew.hbchannel.service', '*', 'com.webos.service.capture.client*']);
    assert.deepEqual(patched.permissions[0].outbound, ['com.webos.service.foo', '*']);
    assert.deepEqual(patched.permissions[1], { service: '*', inbound: ['*'], outbound: ['*'] });
    assert.deepEqual(patched.permissions[2], { service: 'com.webos.service.capture.client*', inbound: ['*'], outbound: ['*'] });
  });

  it('is idempotent and reports no change the second time', () => {
    const first = patchRoleFileContents(JSON.stringify(modernRole), false);
    const second = patchRoleFileContents(first.contents, false);
    assert.equal(second.changed, false);
    assert.equal(second.contents, first.contents);
    assert.deepEqual(second.addedPermissions, []);
  });

  it('handles the legacy role format', () => {
    const legacyRole = {
      role: { exeName: '/usr/bin/run-js-service', type: 'regular', allowedNames: ['org.webosbrew.hbchannel.service'] },
      permissions: [{ service: 'org.webosbrew.hbchannel.service', inbound: ['*'], outbound: ['*'] }],
    };
    const result = patchRoleFileContents(JSON.stringify(legacyRole), true);
    assert.equal(result.changed, true);
    const patched = JSON.parse(result.contents);
    assert.ok(patched.role.allowedNames.includes('*'));
    assert.ok(patched.role.allowedNames.includes('com.webos.service.capture.client*'));
  });

  it('warns when allowedNames is missing instead of throwing', () => {
    const result = patchRoleFileContents(JSON.stringify({ permissions: [] }), false);
    assert.deepEqual(result.warnings, ['Role file is missing allowedNames']);
    assert.equal(result.changed, true);
  });

  it('does not throw on a legacy file with a null role', () => {
    const result = patchRoleFileContents(JSON.stringify({ role: null, permissions: [] }), true);
    assert.deepEqual(result.warnings, ['Legacy role file is missing allowedNames']);
  });

  it('does not mutate the caller-supplied requiredNames array', () => {
    const names = ['*', 'com.example.extra'];
    const snapshot = [...names];
    patchRoleFileContents(JSON.stringify(modernRole), false, names);
    assert.deepEqual(names, snapshot);
    assert.deepEqual([...defaultRequiredNames], ['*', 'com.webos.service.capture.client*']);
  });
});

describe('patchManifestContents', () => {
  const manifest = {
    version: '1.0.0',
    id: 'org.webosbrew.hbchannel',
    serviceFiles: ['/var/luna-service2/services.d/org.webosbrew.hbchannel.service.service'],
    roleFiles: ['/var/luna-service2/roles.d/org.webosbrew.hbchannel.service.service.json'],
    clientPermissionFiles: ['/var/luna-service2/client-permissions.d/org.webosbrew.hbchannel.service.json'],
    apiPermissionFiles: ['/var/luna-service2/api-permissions.d/org.webosbrew.hbchannel.service.json'],
  };
  const clientPerm = '/var/luna-service2/client-permissions.d/org.webosbrew.hbchannel.service.root.json';
  const apiPerms = [
    '/var/luna-service2/api-permissions.d/org.webosbrew.hbchannel.service.api.public.json',
    '/var/luna-service2/api-permissions.d/org.webosbrew.hbchannel.service.api.lunabus.query.json',
  ];

  it('registers the extra permission files', () => {
    const result = patchManifestContents(JSON.stringify(manifest), clientPerm, apiPerms);
    assert.equal(result.changed, true);
    assert.deepEqual(result.added, [clientPerm, ...apiPerms]);
    const patched = JSON.parse(result.contents);
    assert.ok(patched.clientPermissionFiles.includes(clientPerm));
    for (const f of apiPerms) assert.ok(patched.apiPermissionFiles.includes(f));
  });

  it('is idempotent', () => {
    const first = patchManifestContents(JSON.stringify(manifest), clientPerm, apiPerms);
    const second = patchManifestContents(first.contents, clientPerm, apiPerms);
    assert.equal(second.changed, false);
    assert.deepEqual(second.added, []);
  });

  it('skips arrays that are absent from the manifest', () => {
    const minimal: Partial<typeof manifest> = { ...manifest };
    delete minimal.clientPermissionFiles;
    delete minimal.apiPermissionFiles;
    const result = patchManifestContents(JSON.stringify(minimal), clientPerm, apiPerms);
    assert.equal(result.changed, false);
    assert.deepEqual(result.added, []);
  });
});
