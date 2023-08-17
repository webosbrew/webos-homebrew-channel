import 'core-js/stable';
import 'regenerator-runtime/runtime';

import fs from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import child_process from 'child_process';

// @ts-ignore
import { Promise } from 'bluebird';
import progress from 'progress-stream';
import Service, { Message } from 'webos-service';
import fetch from 'node-fetch';
import {
  asyncStat,
  asyncExecFile,
  asyncPipeline,
  asyncUnlink,
  asyncWriteFile,
  asyncReadFile,
  asyncChmod,
  asyncExists,
  asyncMkdir,
} from './adapter';

import rootAppInfo from '../appinfo.json';
import serviceInfo from './services.json';
import { makeError, makeSuccess } from './protocol';
import ServiceRemote from './webos-service-remote';

const kHomebrewChannelPackageId = rootAppInfo.id;
const startDevmode = '/media/cryptofs/apps/usr/palm/services/com.palmdts.devmode.service/start-devmode.sh';

// Maps internal setting field name with filesystem flag name.
type FlagName = string;
const availableFlags = {
  telnetDisabled: 'webosbrew_telnet_disabled',
  failsafe: 'webosbrew_failsafe',
  sshdEnabled: 'webosbrew_sshd_enabled',
  blockUpdates: 'webosbrew_block_updates',
} as Record<string, FlagName>;

function runningAsRoot(): boolean {
  return process.getuid() === 0;
}

function asyncCall<T extends Record<string, any>>(srv: Service, uri: string, args: Record<string, any>): Promise<T> {
  return new Promise((resolve, reject) => {
    srv.call(uri, args, ({ payload }) => {
      if (payload.returnValue) {
        resolve(payload as T);
      } else {
        reject(payload);
      }
    });
  });
}

function createToast(message: string, service: Service, extras: Record<string, any> = {}): Promise<Record<string, any>> {
  console.info(`[toast] ${message}`);
  return asyncCall(service, 'luna://com.webos.notification/createToast', {
    sourceId: kHomebrewChannelPackageId,
    message,
    ...extras,
  });
}

/**
 * Check whether a path is a valid file
 */
async function isFile(targetPath: string): Promise<boolean> {
  try {
    return (await asyncStat(targetPath)).isFile();
  } catch (err) {
    return false;
  }
}

/**
 * Copies a file
 */
async function copyScript(sourcePath: string, targetPath: string): Promise<void> {
  if (!(await isFile(sourcePath))) {
    throw new Error(`${sourcePath} is not a file`);
  }

  await asyncPipeline(fs.createReadStream(sourcePath), fs.createWriteStream(targetPath));
  await asyncChmod(targetPath, 0o755);
}

/**
 * Generates local file checksum.
 */
async function hashFile(filePath: string, algorithm: string): Promise<string> {
  const download = fs.createReadStream(filePath);
  const hash = createHash(algorithm, { encoding: 'hex' });
  await asyncPipeline(download, hash);
  hash.end();
  return hash.read();
}

/**
 * Hashes a string with specified algorithm.
 *
 * Input should be UTF-8.
 */
function hashString(data: string, algorithm: string): string {
  return createHash(algorithm).update(data, 'utf-8').digest('hex');
}

/**
 * Elevates a package by name.
 */
async function elevateService(pkg: string): Promise<void> {
  if (runningAsRoot()) {
    console.info('Elevating service...');
    await asyncExecFile(path.join(__dirname, 'elevate-service'), [pkg]);
  } else {
    console.error('Trying to elevate service without running as root. Skipping.');
  }
}

/**
 * Returns the file path for a flag.
 */
function flagPath(flag: FlagName): string {
  return `/var/luna/preferences/${flag}`;
}

/**
 * Returns whether a flag is set or not.
 */
async function flagRead(flag: FlagName): Promise<boolean> {
  return asyncExists(flagPath(flag));
}

/**
 * Sets the value of a flag.
 */
async function flagSet(flag: FlagName, enabled: boolean): Promise<boolean> {
  if (enabled) {
    // The file content is ignored, file presence is what matters. Writing '1' acts as a hint.
    await asyncWriteFile(flagPath(flag), '1');
  } else {
    try {
      await asyncUnlink(flagPath(flag));
    } catch (err) {
      // Already deleted is not a fatal error.
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return flagRead(flag);
}

/**
 * Package info
 */
async function packageInfo(filePath: string): Promise<Record<string, string>> {
  const control = await asyncExecFile('sh', ['-c', `ar -p ${filePath} control.tar.gz | tar zxO`], { encoding: 'utf8' });

  const resp = Object.fromEntries(
    control
      .split('\n')
      .filter((m) => m.length)
      .map((p) => [p.slice(0, p.indexOf(': ')), p.slice(p.indexOf(': ') + 2)]),
  );
  if (!resp.Package) {
    throw new Error(`Invalid package info: ${JSON.stringify(resp)}`);
  }
  return resp;
}

/**
 * Performs appInstallService/dev/install request.
 */
async function installPackage(filePath: string, service: Service): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = service.subscribe('luna://com.webos.appInstallService/dev/install', {
      id: 'testing',
      ipkUrl: filePath,
      subscribe: true,
    });
    req.on('response', (res) => {
      console.info('appInstallService response:', res.payload);

      if (res.payload.returnValue === false) {
        reject(new Error(`${res.payload.errorCode}: ${res.payload.errorText}`));
        req.cancel();
        return;
      }

      if (res.payload.details && res.payload.details.errorCode !== undefined) {
        reject(new Error(`${res.payload.details.errorCode}: ${res.payload.details.reason}`));
        req.cancel();
        return;
      }

      if (res.payload.statusValue === 30) {
        resolve(res.payload.details.packageId);
        req.cancel();
      }
    });
    req.on('cancel', (msg) => {
      if (msg.payload && msg.payload.errorText) {
        reject(new Error(msg.payload.errorText));
      } else {
        reject(new Error('cancelled'));
      }
    });
  });
}

async function removePackage(packageId: string, service: Service): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = service.subscribe('luna://com.webos.appInstallService/dev/remove', {
      id: packageId,
      subscribe: true,
    });

    req.on('response', (res) => {
      console.info('appInstallService remove response:', res);

      if (res.payload.returnValue === false) {
        reject(new Error(`${res.payload.errorCode}: ${res.payload.errorText}`));
        req.cancel();
        return;
      }

      if (res.payload.details && res.payload.details.errorCode !== undefined) {
        reject(new Error(`${res.payload.details.errorCode}: ${res.payload.details.reason}`));
        req.cancel();
        return;
      }

      if (res.payload.statusValue === 25 && res.payload.details.reason !== undefined) {
        reject(new Error(res.payload.details.reason));
        req.cancel();
        return;
      }

      if (res.payload.statusValue === 31) {
        resolve();
        req.cancel();
      }
    });

    req.on('cancel', (msg) => {
      if (msg.payload && msg.payload.errorText) {
        reject(new Error(msg.payload.errorText));
      } else {
        reject(new Error('cancelled'));
      }
    });
  });
}

/**
 * Register activity to call /autostart on boot
 */
async function registerActivity(service: Service) {
  const activity = {
    name: 'org.webosbrew.hbchannel.service.autostart',
    description: 'Start HBChannel service on boot.',
    type: {
      foreground: true,
      persist: true,
      continuous: true,
    },
    trigger: {
      method: 'luna://com.webos.bootManager/getBootStatus',
      params: {
        subscribe: true,
      },
      where: {
        prop: ['signals', 'core-boot-done'],
        op: '=',
        val: true,
      },
    },
    callback: {
      method: 'luna://org.webosbrew.hbchannel.service/autostart',
      params: {
        reason: 'activity',
      },
    },
  };

  const spec = {
    activity,
    start: true,
    replace: true,
  };

  return new Promise((resolve) => service.activityManager.create(spec, resolve));
}

/**
 * Thin wrapper that responds with a successful message or an error in case of a JS exception.
 */
function tryRespond<T extends Record<string, any>>(runner: (message: Message) => T) {
  return async (message: Message): Promise<void> => {
    try {
      const reply: T = await runner(message);
      message.respond(makeSuccess(reply));
    } catch (err) {
      message.respond(makeError(err.message));
    } finally {
      message.cancel({});
    }
  };
}

function runService() {
  const service = new Service(serviceInfo.id);
  const serviceRemote = new ServiceRemote(service);

  service.activityManager.idleTimeout = 30;

  function getInstallerService(): Service {
    if (runningAsRoot()) {
      return service;
    }
    return serviceRemote as Service;
  }

  async function getAppInfo(appId: string): Promise<Record<string, any>> {
    const appList = await asyncCall<{ apps: { id: string }[] }>(
      getInstallerService(),
      'luna://com.webos.applicationManager/dev/listApps',
      {},
    );
    const appInfo = appList.apps.find((app) => app.id === appId);
    if (!appInfo) throw new Error(`Invalid appId, or unsupported application type: ${appId}`);
    return appInfo;
  }

  /**
   * Installs the requested ipk from a URL.
   */
  type InstallPayload = { ipkUrl: string; ipkHash: string; id?: string };
  service.register(
    'install',
    tryRespond(async (message: Message) => {
      const payload = message.payload as InstallPayload;
      const targetPath = `/tmp/.hbchannel-incoming-${Date.now()}.ipk`;

      // Download
      message.respond({ statusText: 'Downloading…' });
      const res = await fetch(payload.ipkUrl);
      if (!res.ok) {
        throw new Error(res.statusText);
      }
      const progressReporter = progress({
        length: parseInt(res.headers.get('content-length'), 10),
        time: 300 /* ms */,
      });
      progressReporter.on('progress', (p) => {
        message.respond({ statusText: 'Downloading…', progress: p.percentage });
      });
      const targetFile = fs.createWriteStream(targetPath);
      await asyncPipeline(res.body, progressReporter, targetFile);

      // Checksum
      message.respond({ statusText: 'Verifying…' });
      const checksum = await hashFile(targetPath, 'sha256');
      if (checksum !== payload.ipkHash) {
        throw new Error(`Invalid file checksum (${payload.ipkHash} expected, got ${checksum}`);
      }

      let pkginfo: Record<string, string> = { Package: payload.id };

      try {
        pkginfo = await packageInfo(targetPath);
      } catch (err) {
        await createToast(`Package info fetch failed: ${err.message}`, service);
      }

      // If we are running as root we likely want to retain root
      // execution/private bus permissions. During package install running app
      // and its services (since webOS 4.x) are killed using SIGKILL (9) signal.
      // In order to retain some part of our service still running as root
      // during upgrade we fork off our process and do self-update installation
      // in there. After a successful install we relevate the service and exit.
      // Exiting cleanly is an important part, since forked process retains open
      // luna bus socket, and thus a new service will not be able to launch
      // until we do that.
      //
      // If reelevation fails for some reason the service should still be
      // reelevated on reboot on devices with persistent autostart hooks (since
      // we launch elevate-service in startup.sh script)
      if (runningAsRoot() && pkginfo && pkginfo.Package === kHomebrewChannelPackageId) {
        message.respond({ statusText: 'Self-update…' });
        await createToast('Performing self-update...', service);

        child_process.fork(__filename, ['self-update', targetPath]);
        service.activityManager.idleTimeout = 1;
        return { statusText: 'Self-update' };
      }

      // Install
      message.respond({ statusText: 'Installing…' });
      const installedPackageId = await installPackage(targetPath, getInstallerService());

      try {
        const appInfo = await getAppInfo(installedPackageId);
        await createToast(`Application installed: ${appInfo.title}`, service);
      } catch (err) {
        console.warn('appinfo fetch failed:', err);
        await createToast(`Application installed: ${installedPackageId}`, service);
      }

      return { statusText: 'Finished.', finished: true };
    }),
    () => {
      // TODO: support cancellation.
    },
  );

  /**
   * Removes existing package.
   */
  service.register(
    'uninstall',
    tryRespond(async (message: Message) => {
      await removePackage(message.payload.id, getInstallerService());
      return { statusText: 'Finished.' };
    }),
  );

  /**
   * Returns the current value of all available flags, plus whether we're running as root.
   */
  service.register(
    'getConfiguration',
    tryRespond(async () => {
      const futureFlags = Object.entries(availableFlags).map(
        async ([field, flagName]) => [field, await flagRead(flagName)] as [string, boolean],
      );
      const flags = Object.fromEntries(await Promise.all(futureFlags));
      return {
        root: process.getuid() === 0,
        ...flags,
      };
    }),
  );

  /**
   * Sets any of the available flags.
   */
  type SetConfigurationPayload = Record<string, boolean>;
  service.register(
    'setConfiguration',
    tryRespond(async (message) => {
      const payload = message.payload as SetConfigurationPayload;
      const futureFlagSets = Object.entries(payload)
        .map(([field, value]) => [field, availableFlags[field], value] as [string, FlagName | undefined, boolean])
        .filter(([, flagName]) => flagName !== undefined)
        .map(async ([field, flagName, value]) => [field, await flagSet(flagName, value)]);
      return Object.fromEntries(await Promise.all(futureFlagSets));
    }),
  );

  /**
   * Invokes a platform reboot.
   */
  service.register(
    'reboot',
    tryRespond(async () => {
      await asyncExecFile('reboot');
    }),
  );

  /**
   * Returns whether the service is running as root.
   */
  service.register(
    'checkRoot',
    tryRespond(async () => ({ returnValue: runningAsRoot() })),
  );

  /**
   * Check for startup script updates
   */
  service.register(
    'updateStartupScript',
    tryRespond(async () => {
      if (!runningAsRoot()) {
        return { returnValue: true, statusText: 'Not running as root.' };
      }

      let messages = [];

      try {
        const bundledStartup = path.join(__dirname, 'startup.sh');
        const bundledJumpstart = path.join(__dirname, 'jumpstart.sh');

        const webosbrewStartup = '/var/lib/webosbrew/startup.sh';

        const bundledStartupChecksum = await hashFile(bundledStartup, 'sha256');
        const bundledJumpstartChecksum = await hashFile(bundledJumpstart, 'sha256');

        const updatableChecksums = [
          'c5e69325c5327cff3643b87fd9c4c905e06b600304eae820361dcb41ff52db92',
          'bcbe9f8cea451c40190334ee4819427b316c0dba889b502049fb99f7a4807c6b',
          '15bd94b71c652b5d64ff79f2a88f965f9a61992ed3ce064617323d6a950d5d49',
          '5caab3681cdd52cc9b59136a180cd0a1ffb98ec39bf571c38c0a4eb528ce13fb',
          'befe927c6f62b87545aaefb4b2648a227b22695fa0f78a228dcacf1fbba11aeb',
          'd914b3b444433bf49ff83c3c0ae0b729cf7544c074e72c23ec24e5f86aaaf4ac',
          '6215795aed50c11bb7be716cf66326f3657a129143b5edc1b635dab8b8d2fc9f',
        ];

        // RootMyTV v2
        if (await isFile(webosbrewStartup)) {
          const localChecksum = await hashFile(webosbrewStartup, 'sha256');
          if (localChecksum !== bundledStartupChecksum) {
            if (updatableChecksums.indexOf(localChecksum) !== -1) {
              await copyScript(bundledStartup, webosbrewStartup);
              messages.push(`${webosbrewStartup} updated!`);
            } else {
              // Show notification about mismatched startup script
              messages.push(`${webosbrewStartup} has been manually modified!`);
            }
          }

          // Check for checksum of start-devmode.sh based on
          // https://gist.githubusercontent.com/stek29/761232c6f7e1ffbc36b98da2a3a0f4d9/raw/f56660ab3f293d8a53de664ac66d0503d398baf3/install.sh
          // and reinstall clean jumpstart.sh...
          if (
            (await isFile(startDevmode)) &&
            (await hashFile(startDevmode, 'sha256')) === '98bf599e3787cc4de949d2e7831308379b8f93a6deacf93887aeed15d5a0317e'
          ) {
            await copyScript(bundledJumpstart, startDevmode);
            messages.push(`${startDevmode} updated!`);
          }
        }

        // RootMyTV v1
        if (await isFile(startDevmode)) {
          // Warn and return empty string on read error
          const startDevmodeContents = (await asyncReadFile(startDevmode, { encoding: 'utf-8' }).catch((err) => {
            console.warn(`reading ${startDevmode} failed: ${err.toString()}`);
            return '';
          })) as string;

          const localChecksum = hashString(startDevmodeContents, 'sha256');

          if (localChecksum !== bundledStartupChecksum && updatableChecksums.indexOf(localChecksum) !== -1) {
            await copyScript(bundledStartup, startDevmode);
            messages.push(`${startDevmode} updated!`);
          } else if (localChecksum !== bundledJumpstartChecksum && startDevmodeContents.indexOf('org.webosbrew') !== -1) {
            // Show notification about mismatched startup script if contains
            // org.webosbrew string (which is not used on jumpstart.sh nor
            // official start-devmode.sh)
            messages.push(`${startDevmode} has been manually modified!`);
          }
        }
      } catch (err) {
        console.log(`Startup script update failed: ${err.stack}`);
        messages = ['Startup script update failed!', ...messages, `Error: ${err.toString()}`];
        await createToast(messages.join('<br/>'), service);
        return { returnValue: false, statusText: 'Startup script update failed.', stack: err.stack, messages };
      }

      if (messages.length) {
        await createToast(messages.join('<br/>'), service);
        return { returnValue: true, statusText: 'Update succeeded', messages };
      }

      return { returnValue: true, statusText: 'Nothing changed', messages };
    }),
  );

  /**
   * Roughly replicates com.webos.applicationManager/getAppInfo request in an
   * environment-independent way (non-root vs root).
   */
  type GetAppInfoPayload = { id: string };
  service.register(
    'getAppInfo',
    tryRespond(async (message) => {
      const payload = message.payload as GetAppInfoPayload;
      const appId: string = payload.id;
      if (!appId) throw new Error('missing `id` string field');
      const appInfo = await getAppInfo(appId);
      return { appId, appInfo };
    }),
  );

  /**
   * Executes a shell command and responds with exit code, stdout and stderr.
   */
  type ExecPayload = { command: string };
  service.register('exec', (message) => {
    const payload = message.payload as ExecPayload;
    child_process.exec(payload.command, { encoding: 'buffer' }, (error, stdout, stderr) => {
      const response = {
        error,
        stdoutString: stdout.toString(),
        stdoutBytes: stdout.toString('base64'),
        stderrString: stderr.toString(),
        stderrBytes: stderr.toString('base64'),
      };
      if (error) {
        message.respond(makeError(error.message, response));
      } else {
        message.respond(makeSuccess(response));
      }
    });
  });

  /**
   * Spawns a shell command and streams stdout & stderr bytes.
   */
  service.register('spawn', (message) => {
    const payload = message.payload as ExecPayload;
    const respond = (event: string, args: Record<string, any>) => message.respond({ event, ...args });
    const proc = child_process.spawn('/bin/sh', ['-c', payload.command]);
    proc.stdout.on('data', (data) =>
      respond('stdoutData', {
        stdoutString: data.toString(),
        stdoutBytes: data.toString('base64'),
      }),
    );
    proc.stderr.on('data', (data) =>
      respond('stderrData', {
        stderrString: data.toString(),
        stderrBytes: data.toString('base64'),
      }),
    );
    proc.on('close', (closeCode) => respond('close', { closeCode }));
    proc.on('exit', (exitCode) => respond('exit', { exitCode }));
  });

  /**
   * Stub service that emulates luna://com.webos.service.sm/license/apps/getDrmStatus
   */
  type GetDrmStatusPayload = { appId: string };
  service.register(
    'getDrmStatus',
    tryRespond(async (message) => ({
      appId: (message.payload as GetDrmStatusPayload).appId,
      drmType: 'NCG DRM',
      installBasePath: '/media/cryptofs',
      returnValue: true,
      isTimeLimited: false,
    })),
  );

  service.register(
    'registerActivity',
    tryRespond(() => registerActivity(service)),
  );

  service.register(
    'autostart',
    tryRespond(async (message) => {
      if (!runningAsRoot()) {
        return { message: 'Not running as root.', returnValue: true };
      }
      if (await asyncExists('/tmp/webosbrew_startup')) {
        return { message: 'Startup script already executed.', returnValue: true };
      }
      // Copy startup.sh if doesn't exist
      if (!(await asyncExists('/var/lib/webosbrew/startup.sh'))) {
        try {
          await asyncMkdir('/var/lib/webosbrew/', 0o755);
        } catch (e) {
          // Ignore
        }
        await copyScript(path.join(__dirname, 'startup.sh'), '/var/lib/webosbrew/startup.sh');
      }
      // Make startup.sh executable
      await asyncChmod('/var/lib/webosbrew/startup.sh', 0o755);

      child_process.spawn('/bin/sh', ['-c', '/var/lib/webosbrew/startup.sh'], {
        cwd: '/home/root',
        env: {
          LD_PRELOAD: '',
          SKIP_ELEVATION: 'true',
          SERVICE_DIR: __dirname,
        },
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      });

      // Register activity if autostart was triggered in traditional way
      if (message.payload?.reason !== 'activity') {
        await registerActivity(service);
      }

      return { returnValue: true };
    }),
  );
}

if (process.argv[2] === 'self-update') {
  process.on('SIGTERM', () => {
    console.info('sigterm!');
  });

  (async () => {
    const service = new ServiceRemote(null) as Service;
    try {
      await createToast('Performing self-update (inner)', service);
      const installedPackageId = await installPackage(process.argv[3], service);
      await createToast('Elevating...', service);
      await elevateService(`${installedPackageId}.service`);
      await createToast('Self-update finished!', service);
      process.exit(0);
    } catch (err) {
      console.info(err);
      await createToast(`Self-update failed: ${err.message}`, service);
      process.exit(1);
    }
  })();
} else {
  runService();
}
