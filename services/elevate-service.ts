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

type Roles = {
  appId: string;
  type: string;
  allowedNames: string[];
  trustLevel: string;
  permissions: Permission[];
};

type LegacyRoles = {
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

function patchRolesFile(path: string, legacy: boolean, requiredNames: string[] = ['*', 'com.webos.service.capture.client*']) {
  const rolesOriginal = readFileSync(path).toString();
  const rolesNew = JSON.parse(rolesOriginal) as Roles | LegacyRoles;

  let allowedNames: string[] | null = null;

  if (legacy) {
    // webOS <4.x /var/palm/ls2-dev role file
    const legacyRoles = rolesNew as LegacyRoles;
    if (isRecord(legacyRoles.role) && Array.isArray(legacyRoles.role.allowedNames)) {
      allowedNames = legacyRoles.role.allowedNames;
    } else {
      console.warn('[!] Legacy roles is missing allowedNames');
    }
  } else {
    // webOS 4.x+ /var/luna-service2 role file
    const newRoles = rolesNew as Roles;
    if (Array.isArray(newRoles.allowedNames)) {
      allowedNames = newRoles.allowedNames;
    } else {
      console.warn('[!] Roles file is missing allowedNames');
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
  if (Array.isArray(rolesNew.permissions)) {
    const missingPermissionNames = requiredNames;
    rolesNew.permissions.forEach((perm: { outbound?: string[]; service?: string }) => {
      if (perm.service && missingPermissionNames.includes(perm.service))
        missingPermissionNames.splice(missingPermissionNames.indexOf(perm.service), 1);
      if (perm.outbound && !perm.outbound.includes('*')) {
        perm.outbound.push('*');
      }
    });

    for (const name of missingPermissionNames) {
      console.info(`[ ] Adding permission for name: ${name}`);
      rolesNew.permissions.push({
        service: name,
        inbound: ['*'],
        outbound: ['*'],
      });
    }
  }

  const rolesNewContents = JSON.stringify(rolesNew);
  if (rolesNewContents !== JSON.stringify(JSON.parse(rolesOriginal))) {
    console.info(`[ ] Updating roles definition: ${path}`);
    console.info('-', rolesOriginal);
    console.info('+', rolesNewContents);
    writeFileSync(path, rolesNewContents);
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

  for (const lunaRoot of ['/var/luna-service2-dev', '/var/luna-service2']) {
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
    } else {
      // Skip everything else if service file is not found.
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
      if (patchRolesFile(roleFile, false)) {
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

  for (const legacyLunaRoot of ['/var/palm/ls2-dev', '/var/palm/ls2']) {
    const legacyPubServiceFile = `${legacyLunaRoot}/services/pub/${serviceName}.service`;
    const legacyPrvServiceFile = `${legacyLunaRoot}/services/prv/${serviceName}.service`;
    const legacyPubRolesFile = `${legacyLunaRoot}/roles/pub/${serviceName}.json`;
    const legacyPrvRolesFile = `${legacyLunaRoot}/roles/prv/${serviceName}.json`;

    if (isFile(legacyPubServiceFile)) {
      console.info(`[~] Found legacy webOS <3.x service file: ${legacyPubServiceFile}`);
      if (patchServiceFile(legacyPubServiceFile)) {
        configChanged = true;
      }

      if (isFile(legacyPrvServiceFile)) {
        if (patchServiceFile(legacyPrvServiceFile)) {
          configChanged = true;
        }
      } else {
        console.warn(`[!] Did not find legacy private service file: ${legacyPrvServiceFile}`);
      }
    }

    if (isFile(legacyPubRolesFile)) {
      if (patchRolesFile(legacyPubRolesFile, true)) {
        configChanged = true;
      }
    }

    if (isFile(legacyPrvRolesFile)) {
      if (patchRolesFile(legacyPrvRolesFile, true)) {
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
