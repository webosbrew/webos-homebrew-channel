#!/usr/bin/env node

/*
 * elevate-service [serviceName [appName]]
 *
 * Rewrites the Luna service definition of a homebrew service so that it runs
 * as root, outside the jailer, with unrestricted bus access, then asks
 * luna-service2 to rescan. Defaults to the Homebrew Channel service itself.
 */

import { resolve } from 'path';

import { proc } from './platform';
import { defaultLunaRoots, elevate, resolveNames } from './elevate-run';

process.env['PATH'] = `/usr/sbin:${process.env['PATH']}`;

function main(argv: string[]): void {
  const { serviceName, appName } = resolveNames(argv);

  const configChanged = elevate(serviceName, appName, {
    roots: defaultLunaRoots,
    // run-js-service should be in the same directory as this script.
    runJsServicePath: resolve(__dirname, 'run-js-service'),
  });

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
