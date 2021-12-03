#!/usr/bin/env node

import { statSync, readFileSync, writeFileSync } from 'fs';
import { execFile } from 'child_process';

process.env.PATH = `/usr/sbin:${process.env.PATH}`;

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch (err) {
    return false;
  }
}

function patchServiceFile(serviceFile: string): boolean {
  const serviceFileOriginal = readFileSync(serviceFile).toString();
  const serviceFileNew = serviceFileOriginal.replace('/usr/bin', '/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service');

  if (serviceFileNew !== serviceFileOriginal) {
    console.info(`[ ] Updating service definition: ${serviceFile}`);
    console.info('-', serviceFileOriginal);
    console.info('+', serviceFileNew);
    writeFileSync(serviceFile, serviceFileNew);
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

  const serviceFile = `/var/luna-service2-dev/services.d/${serviceName}.service`;
  const clientPermFile = `/var/luna-service2-dev/client-permissions.d/${serviceName}.root.json`;
  const apiPermFile = `/var/luna-service2-dev/client-permissions.d/${serviceName}.api.public.json`;
  const manifestFile = `/var/luna-service2-dev/manifests.d/${appName}.json`;

  if (isFile(serviceFile)) {
    console.info(`[~] Found webOS 3.x+ service file: ${serviceFile}`);
    if (patchServiceFile(serviceFile)) {
      configChanged = true;
    }

    if (!isFile(clientPermFile)) {
      console.info(`[ ] Creating client permissions file: ${clientPermFile}`);
      writeFileSync(
        clientPermFile,
        JSON.stringify({
          [`${serviceName}*`]: ['all'],
        }),
      );
      configChanged = true;
    }

    if (!isFile(apiPermFile)) {
      console.info(`[ ] Creating API permissions file: ${apiPermFile}`);
      writeFileSync(
        apiPermFile,
        JSON.stringify({
          public: [`${serviceName}/*`],
        }),
      );
      configChanged = true;
    }

    if (isFile(manifestFile)) {
      console.info(`[~] Found webOS 4.x+ manifest file: ${manifestFile}`);
      const manifestFileOriginal = readFileSync(manifestFile).toString();
      const manifestFileParsed = JSON.parse(manifestFileOriginal);
      if (manifestFileParsed.clientPermissionFiles && manifestFileParsed.clientPermissionFiles.indexOf(clientPermFile) === -1) {
        console.info('[ ] manifest - adding client permissions file...');
        manifestFileParsed.clientPermissionFiles.push(clientPermFile);
      }

      if (manifestFileParsed.apiPermissionFiles && manifestFileParsed.apiPermissionFiles.indexOf(apiPermFile) === -1) {
        console.info('[ ] manifest - adding API permissions file...');
        manifestFileParsed.apiPermissionFiles.push(apiPermFile);
      }

      const manifestFileNew = JSON.stringify(manifestFileParsed);
      if (manifestFileNew !== manifestFileOriginal) {
        console.info(`[~] Updating manifest file: ${manifestFile}`);
        console.info('-', manifestFileOriginal);
        console.info('+', manifestFileNew);
        writeFileSync(manifestFile, manifestFileNew);
        configChanged = true;
      }
    }
  }

  const legacyPubServiceFile = `/var/palm/ls2-dev/services/pub/${serviceName}.service`;
  const legacyPrvServiceFile = `/var/palm/ls2-dev/services/pub/${serviceName}.service`;
  const legacyPrvRolesFile = `/var/palm/ls2-dev/roles/prv/${serviceName}.json`;

  if (isFile(legacyPubServiceFile)) {
    console.info(`[~] Found legacy webOS <3.x service file: ${legacyPubServiceFile}`);
    if (patchServiceFile(legacyPubServiceFile)) {
      configChanged = true;
    }

    if (patchServiceFile(legacyPrvServiceFile)) {
      configChanged = true;
    }

    if (isFile(legacyPrvRolesFile)) {
      const prvRolesOriginal = readFileSync(legacyPrvRolesFile).toString();
      const prvRolesNew = prvRolesOriginal.replace('"outbound":[]', '"outbound":["*"]');
      if (prvRolesNew !== prvRolesOriginal) {
        console.info(`[ ] Updating service definition: ${legacyPrvRolesFile}`);
        console.info('-', prvRolesOriginal);
        console.info('+', prvRolesNew);
        writeFileSync(legacyPrvRolesFile, prvRolesNew);
        configChanged = true;
      }
    }
  }

  if (configChanged) {
    console.info('[+] Refreshing services...');
    execFile('ls-control', ['scan-services'], (err, stderr, stdout) => {
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
