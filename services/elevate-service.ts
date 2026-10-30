#!/usr/bin/env node

import { dirname, resolve } from 'path';

import { fs, proc } from './platform';
import { patchManifestContents, patchRoleFileContents, patchServiceFileContents } from './elevate-lib';

process.env['PATH'] = `/usr/sbin:${process.env['PATH']}`;

const isFile = fs.isFileSync;

function parentExists(path: string): boolean {
  return fs.isDirectorySync(dirname(path));
}

function patchServiceFile(serviceFile: string): boolean {
  const serviceFileOriginal = fs.readFileSync(serviceFile).toString();

  // run-js-service should be in the same directory as this script.
  const runJsServicePath = resolve(__dirname, 'run-js-service');

  const { type, contents: serviceFileNew } = patchServiceFileContents(serviceFileOriginal, runJsServicePath);

  switch (type) {
    case 'js':
      console.info(`[ ] ${serviceFile} is a JS service`);
      if (!fs.existsSync(runJsServicePath)) {
        console.error(`[!] run-js-service does not exist at ${runJsServicePath}`);
        return false;
      }
      break;
    case 'native':
      console.info(`[ ] ${serviceFile} is a native service`);
      break;
    case 'elevated-native':
      // Ignore elevated native services...
      break;
    default:
      console.info(`[~] ${serviceFile}: unknown service type, this may cause some troubles`);
  }

  if (serviceFileNew !== serviceFileOriginal) {
    console.info(`[ ] Updating service definition: ${serviceFile}`);
    console.info('-', serviceFileOriginal);
    console.info('+', serviceFileNew);
    fs.writeFileSync(serviceFile, serviceFileNew);
    return true;
  }
  return false;
}

function patchRoleFile(path: string, legacy: boolean): boolean {
  const roleOriginal = fs.readFileSync(path).toString();
  const { changed, contents, warnings, addedPermissions } = patchRoleFileContents(roleOriginal, legacy);

  for (const warning of warnings) {
    console.warn(`[!] ${warning}`);
  }
  for (const name of addedPermissions) {
    console.info(`[ ] Adding permission for name: ${name}`);
  }

  if (changed) {
    console.info(`[ ] Updating role definition: ${path}`);
    console.info('-', roleOriginal);
    console.info('+', contents);
    fs.writeFileSync(path, contents);
    return true;
  }

  return false;
}

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
    const apiPermPublicFile = `${lunaRoot}/api-permissions.d/${serviceName}.api.public.json`;
    const apiPermLunaBusFile = `${lunaRoot}/api-permissions.d/${serviceName}.api.lunabus.query.json`;
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
      fs.writeFileSync(
        clientPermFile,
        JSON.stringify({
          [`${serviceName}*`]: ['all'],
        }),
      );
      configChanged = true;
    }

    for (const [path, group] of [
      [apiPermPublicFile, 'public'],
      [apiPermLunaBusFile, 'lunabus.query'],
    ] as [string, string][]) {
      if (parentExists(path) && !isFile(path)) {
        console.info(`[ ] Creating API permissions file: ${path}`);
        fs.writeFileSync(
          path,
          JSON.stringify({
            [group]: [`${serviceName}/*`],
          }),
        );
        configChanged = true;
      }
    }

    if (isFile(roleFile)) {
      if (patchRoleFile(roleFile, false)) {
        console.info(`[ ] Patched role file: ${roleFile}`);
        configChanged = true;
      }
    }

    if (isFile(manifestFile)) {
      console.info(`[~] Found webOS 4.x+ manifest file: ${manifestFile}`);
      const manifestFileOriginal = fs.readFileSync(manifestFile).toString();
      const { changed, contents, added } = patchManifestContents(manifestFileOriginal, clientPermFile, [
        apiPermPublicFile,
        apiPermLunaBusFile,
      ]);
      for (const file of added) {
        console.info(`[ ] manifest - adding permissions file: ${file}`);
      }
      if (changed) {
        console.info(`[~] Updating manifest file: ${manifestFile}`);
        console.info('-', manifestFileOriginal);
        console.info('+', contents);
        fs.writeFileSync(manifestFile, contents);
        configChanged = true;
      }
    }
  }

  if (configChanged) {
    console.info('[+] Refreshing services...');
    proc.execFileCallback('ls-control', ['scan-services'], { timeout: 10000 }, (err, stdout, stderr) => {
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
