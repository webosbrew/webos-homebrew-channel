/*
 * Homebrew Channel service entry point.
 *
 * Wires the real environment (webos-service bus, root detection, bundle
 * directory) into the handlers in ./handlers and also acts as the detached
 * self-update process when started with the `self-update` argument.
 */

import path from 'path';

import Service from 'webos-service';

import { http } from './platform';

import serviceInfo from './services.json';
import { createToast, defaultConfig, elevateService, installPackage, registerHandlers } from './handlers';
import { errorMessage } from './utils';
import ServiceRemote from './webos-service-remote';
import FakeActivityManager from './fake-activity-manager';

const config = defaultConfig(__dirname, __filename);

// The CA bundle is packaged next to the service bundle.
http.configure({ certsDir: path.join(__dirname, 'certs') });

function runService(): void {
  const fakeAM = new FakeActivityManager();
  const service = new Service(serviceInfo.id, fakeAM.cast());
  const serviceRemote = new ServiceRemote();

  fakeAM.setService(service);

  // legacy webOS (pre-ACG) used two luna buses: private and public.
  // by default, public handle is used for outbound calls.
  // AM inherits bus from requests and attempts to call trigger on public bus,
  // which does not work for our case
  if (config.runningAsRoot && service.privateHandle) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    service.sendingHandle = service.privateHandle;
  }

  // As root we can talk to appInstallService directly; otherwise go through
  // luna-send(-pub), which has the permissions our own name lacks.
  const installer = config.runningAsRoot ? service : (serviceRemote as Service);

  registerHandlers(service, installer, config);
}

if (process.argv[2] === 'self-update') {
  process.on('SIGTERM', () => {
    console.info('sigterm!');
  });

  void (async (): Promise<void> => {
    const service = new ServiceRemote() as Service;
    try {
      const packagePath = process.argv[3];
      if (typeof packagePath !== 'string') {
        throw new Error('missing package path');
      }

      await createToast('Performing self-update (inner)', service);
      const installedPackageId = await installPackage(packagePath, service);
      await createToast('Elevating...', service);
      await elevateService(`${installedPackageId}.service`, config);
      await createToast('Self-update finished!', service);
      process.exit(0);
    } catch (err: unknown) {
      console.error(err);
      await createToast(`Self-update failed: ${errorMessage(err)}`, service);
      process.exit(1);
    }
  })();
} else {
  runService();
}
