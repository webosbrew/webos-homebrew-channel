#!/usr/bin/env node

/* Array.prototype.includes() only available from around Node.js v6. */
import 'core-js/es/array/includes';

/* String.prototype.includes() only available from around Node.js v4. */
import 'core-js/es/string/includes';

import { existsSync, statSync, readFileSync, writeFileSync } from 'fs';
import { execFile } from 'child_process';
import { dirname, resolve } from 'path';

process.env['PATH'] = `/usr/sbin:${process.env['PATH']}`;

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function parentExists(path: string): boolean {
  try {
    return statSync(dirname(path)).isDirectory();
  } catch {
    return false;
  }
}

function patchServiceFile(serviceFile: string): boolean {
  const serviceFileOriginal = readFileSync(serviceFile).toString();
  let serviceFileNew = serviceFileOriginal;

  if (serviceFileNew.includes('/run-js-service')) {
    console.info(`[ ] ${serviceFile} is a JS service`);

    // run-js-service should be in the same directory as this script.
    const runJsServicePath = resolve(__dirname, 'run-js-service');

    if (!existsSync(runJsServicePath)) {
      console.error(`[!] run-js-service does not exist at ${runJsServicePath}`);
      return false;
    }

    serviceFileNew = serviceFileNew.replace(/^Exec=\/usr\/bin\/run-js-service/gm, `Exec=${runJsServicePath}`);
  } else if (serviceFileNew.includes('/jailer')) {
    console.info(`[ ] ${serviceFile} is a native service`);
    serviceFileNew = serviceFileNew.replace(/^Exec=\/usr\/bin\/jailer .* ([^ ]*)$/gm, (_, binaryPath) => `Exec=${binaryPath}`);
  } else if (!serviceFileNew.includes('Exec=/media')) {
    // Ignore elevated native services...
    console.info(`[~] ${serviceFile}: unknown service type, this may cause some troubles`);
  }

  if (serviceFileNew !== serviceFileOriginal) {
    console.info(`[ ] Updating service definition: ${serviceFile}`);
    console.info('-', serviceFileOriginal);
    console.info('+', serviceFileNew);
    writeFileSync(serviceFile, serviceFileNew);
    return true;
  }
  return false;
}

type Permission = {
  service: string;
  inbound?: string[];
  outbound?: string[];
};

type Role = {
  appId: string;
  type: string;
  allowedNames: string[];
  trustLevel: string;
  permissions: Permission[];
};

type LegacyRole = {
  role: {
    exeName: string;
    type: string;
    allowedNames: string[];
  };
  permissions: Permission[];
};

function isRecord(obj: unknown): obj is Record<string, any> {
  return typeof obj === 'object' && !Array.isArray(obj);
}

function patchRoleFile(path: string, legacy: boolean, requiredNames: string[] = ['*', 'com.webos.service.capture.client*']) {
  const roleOriginal = readFileSync(path).toString();
  const roleNew = JSON.parse(roleOriginal) as Role | LegacyRole;

  let allowedNames: string[] | null = null;

  if (legacy) {
    // webOS <4.x /var/palm/ls2-dev role file
    const legacyRole = roleNew as LegacyRole;
    if (isRecord(legacyRole.role) && Array.isArray(legacyRole.role.allowedNames)) {
      allowedNames = legacyRole.role.allowedNames;
    } else {
      console.warn('[!] Legacy role file is missing allowedNames');
    }
  } else {
    // webOS 4.x+ /var/luna-service2 role file
    const newRole = roleNew as Role;
    if (Array.isArray(newRole.allowedNames)) {
      allowedNames = newRole.allowedNames;
    } else {
      console.warn('[!] Role file is missing allowedNames');
    }
  }

  if (allowedNames !== null) {
    for (const name of requiredNames) {
      if (!allowedNames.includes(name)) {
        allowedNames.push(name);
      }
    }
  }

  // permissions / allowedNames interactions are fairly odd. It seems like
  // "service" field in permission is one of allowedNames that this executable
  // can use, outbound are remote client names that our executable/name can use,
  // and inbound are remote client names that can access our executable.
  //
  // Oddly, even though there seems to be some support for wildcards, some
  // pieces of software verify explicit permission "service" key, thus we
  // sometimes may need some extra allowedNames/permissions, even though we
  // default to "*"
  if (Array.isArray(roleNew.permissions)) {
    const missingPermissionNames = requiredNames;
    roleNew.permissions.forEach((perm: { outbound?: string[]; service?: string }) => {
      if (perm.service && missingPermissionNames.includes(perm.service))
        missingPermissionNames.splice(missingPermissionNames.indexOf(perm.service), 1);
      if (perm.outbound && !perm.outbound.includes('*')) {
        perm.outbound.push('*');
      }
    });

    for (const name of missingPermissionNames) {
      console.info(`[ ] Adding permission for name: ${name}`);
      roleNew.permissions.push({
        service: name,
        inbound: ['*'],
        outbound: ['*'],
      });
    }
  }

  const roleNewContents = JSON.stringify(roleNew);
  if (roleNewContents !== JSON.stringify(JSON.parse(roleOriginal))) {
    console.info(`[ ] Updating role definition: ${path}`);
    console.info('-', roleOriginal);
    console.info('+', roleNewContents);
    writeFileSync(path, roleNewContents);
    return true;
  }

  return false;
}

type Manifest = {
  version: string;
  serviceFiles: string[];
  apiPermissionFiles?: string[];
  id: string;
  roleFiles: string[];
  clientPermissionFiles?: string[];
};

function main(argv: string[]) {
  let [serviceName = 'org.webosbrew.hbchannel.service', appName = serviceName.split('.').slice(0, -1).join('.')] = argv;

  if (serviceName === 'org.webosbrew.hbchannel') {
    serviceName = 'org.webosbrew.hbchannel.service';
    appName = 'org.webosbrew.hbchannel';
  }

  let configChanged = false;

  let foundLegacyDev = false;
  let foundLegacyNonDev = false;

  const legacyLunaRootDev = '/var/palm/ls2-dev';
  const legacyLunaRootNonDev = '/var/palm/ls2';

  for (const legacyLunaRoot of [legacyLunaRootDev, legacyLunaRootNonDev]) {
    const legacyPubServiceFile = `${legacyLunaRoot}/services/pub/${serviceName}.service`;
    const legacyPrvServiceFile = `${legacyLunaRoot}/services/prv/${serviceName}.service`;
    const legacyPubRoleFile = `${legacyLunaRoot}/roles/pub/${serviceName}.json`;
    const legacyPrvRoleFile = `${legacyLunaRoot}/roles/prv/${serviceName}.json`;

    if (isFile(legacyPubServiceFile)) {
      console.info(`[~] Found legacy webOS <3.x service file: ${legacyPubServiceFile}`);
      if (patchServiceFile(legacyPubServiceFile)) {
        console.info(`[ ] Patched legacy public service file: ${legacyPubServiceFile}`);
        configChanged = true;
      }

      if (isFile(legacyPrvServiceFile)) {
        if (patchServiceFile(legacyPrvServiceFile)) {
          console.info(`[ ] Patched legacy private service file: ${legacyPrvServiceFile}`);
          configChanged = true;
        }
      } else {
        console.warn(`[!] Did not find legacy private service file: ${legacyPrvServiceFile}`);
      }

      if (legacyLunaRoot === legacyLunaRootDev) {
        foundLegacyDev = true;
      } else if (legacyLunaRoot === legacyLunaRootNonDev) {
        foundLegacyNonDev = true;
      } else {
        console.error('[!] Something is wrong: unexpected path');
      }
    }

    if (isFile(legacyPubRoleFile)) {
      if (patchRoleFile(legacyPubRoleFile, true)) {
        console.info(`[ ] Patched legacy public role file: ${legacyPubRoleFile}`);
        configChanged = true;
      }
    }

    if (isFile(legacyPrvRoleFile)) {
      if (patchRoleFile(legacyPrvRoleFile, true)) {
        console.info(`[ ] Patched legacy private role file: ${legacyPrvRoleFile}`);
        configChanged = true;
      }
    }
  }

  const lunaRootDev = '/var/luna-service2-dev';
  const lunaRootNonDev = '/var/luna-service2';

  for (const lunaRoot of [lunaRootDev, lunaRootNonDev]) {
    const serviceFile = `${lunaRoot}/services.d/${serviceName}.service`;
    const clientPermFile = `${lunaRoot}/client-permissions.d/${serviceName}.root.json`;
    const apiPermFile = `${lunaRoot}/api-permissions.d/${serviceName}.api.public.json`;
    const manifestFile = `${lunaRoot}/manifests.d/${appName}.json`;
    const roleFile = `${lunaRoot}/roles.d/${serviceName}.service.json`;

    if (isFile(serviceFile)) {
      console.info(`[~] Found webOS 3.x+ service file: ${serviceFile}`);
      if (patchServiceFile(serviceFile)) {
        configChanged = true;
      }
    } else if ((lunaRoot === lunaRootDev && !foundLegacyDev) || (lunaRoot === lunaRootNonDev && !foundLegacyNonDev)) {
      // Skip everything else if no service file was found (including in legacy dir)
      continue;
    }

    if (parentExists(clientPermFile) && !isFile(clientPermFile)) {
      console.info(`[ ] Creating client permissions file: ${clientPermFile}`);
      writeFileSync(
        clientPermFile,
        JSON.stringify({
          [`${serviceName}*`]: ['all'],
        }),
      );
      configChanged = true;
    }

    if (parentExists(apiPermFile) && !isFile(apiPermFile)) {
      console.info(`[ ] Creating API permissions file: ${apiPermFile}`);
      writeFileSync(
        apiPermFile,
        JSON.stringify({
          public: [`${serviceName}/*`],
        }),
      );
      configChanged = true;
    }

    if (isFile(roleFile)) {
      if (patchRoleFile(roleFile, false)) {
        console.info(`[ ] Patched role file: ${roleFile}`);
        configChanged = true;
      }
    }

    if (isFile(manifestFile)) {
      console.info(`[~] Found webOS 4.x+ manifest file: ${manifestFile}`);
      const manifestFileOriginal = readFileSync(manifestFile).toString();
      const manifest = JSON.parse(manifestFileOriginal) as Manifest;
      if (Array.isArray(manifest.clientPermissionFiles) && !manifest.clientPermissionFiles.includes(clientPermFile)) {
        console.info('[ ] manifest - adding client permissions file...');
        manifest.clientPermissionFiles.push(clientPermFile);
      }

      if (Array.isArray(manifest.apiPermissionFiles) && !manifest.apiPermissionFiles.includes(apiPermFile)) {
        console.info('[ ] manifest - adding API permissions file...');
        manifest.apiPermissionFiles.push(apiPermFile);
      }

      const manifestFileNew = JSON.stringify(manifest);
      if (manifestFileNew !== manifestFileOriginal) {
        console.info(`[~] Updating manifest file: ${manifestFile}`);
        console.info('-', manifestFileOriginal);
        console.info('+', manifestFileNew);
        writeFileSync(manifestFile, manifestFileNew);
        configChanged = true;
      }
    }
  }

  if (configChanged) {
    console.info('[+] Refreshing services...');
    execFile('ls-control', ['scan-services'], { timeout: 10000 }, (err, stderr, stdout) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      if (stdout) console.info(stdout);
      if (stderr) console.info(stderr);
      process.exit(0);
    });
  } else {
    console.info('[-] No changes, no rescan needed');
  }
}

main(process.argv.slice(2));
