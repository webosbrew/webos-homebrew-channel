import 'core-js/stable';
import 'regenerator-runtime/runtime';

import fs from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import child_process from 'child_process';

// @ts-expect-error
import { Promise } from 'bluebird'; // eslint-disable-line @typescript-eslint/no-redeclare
import progress from 'progress-stream';
import Service, { Message } from 'webos-service';

import { asyncStat, asyncExecFile, asyncPipeline, asyncUnlink, asyncWriteFile, asyncReadFile, asyncChmod, asyncMkdir } from './adapter';
import { fetchWrapper } from './fetch-wrapper';

import rootAppInfo from '../appinfo.json';
import serviceInfo from './services.json';
import { makeError, makeSuccess } from './protocol';
import ServiceRemote from './webos-service-remote';

const kHomebrewChannelPackageId = rootAppInfo.id;
const startDevmode = '/media/cryptofs/apps/usr/palm/services/com.palmdts.devmode.service/start-devmode.sh';
const homebrewBaseDir = ((): string | null => {
  try {
    return path.resolve(__dirname, '../../../../');
  } catch (err) {
    console.warn('getting homebrewBaseDir failed:', err);
    return null;
  }
})();

const nodeVersion = (() => {
  try {
    // Just in case there's a build/pre-release suffix.
    const core = process.versions.node.split(/[-+]/, 1)[0] as string;
    const [major, minor = 0, patch = 0] = core.split('.').map((x) => parseInt(x, 10));
    return { major, minor, patch };
  } catch (err) {
    console.warn('getting nodeVersion failed:', err);
    return { major: 0, minor: 0, patch: 0 };
  }
})();

// Maps internal setting field name with filesystem flag name.
const availableFlags = {
  telnetDisabled: 'webosbrew_telnet_disabled',
  failsafe: 'webosbrew_failsafe',
  sshdEnabled: 'webosbrew_sshd_enabled',
  blockUpdates: 'webosbrew_block_updates',
} as const;
type FlagName = keyof typeof availableFlags;
type FlagFileName = (typeof availableFlags)[FlagName];

const runningAsRoot: boolean = (() => {
  if (typeof process.getuid === 'undefined') {
    throw new Error('process.getuid() is missing');
  }
  return process.getuid() === 0;
})();

function assertNodeError(error: unknown): asserts error is NodeJS.ErrnoException {
  if (!(error instanceof Error)) {
    throw error;
  }
}

function asyncCall<T extends Record<string, any>>(srv: Service, uri: string, args: Record<string, any>): Promise<T> {
  return new Promise((resolve, reject) => {
    srv.call(uri, args, ({ payload }) => {
      if (payload['returnValue']) {
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
  } catch {
    return false;
  }
}

/**
 * Check whether a path exists
 */
function exists(targetPath: string): Promise<boolean> {
  return asyncStat(targetPath).then(
    () => true,
    () => false,
  );
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
  const ret: unknown = hash.read();

  if (typeof ret !== 'string') {
    throw new Error('reading result of hash failed');
  }

  return ret;
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
async function elevateService(pkg: string): Promise<boolean> {
  if (!runningAsRoot) {
    console.error('Trying to elevate service without running as root. Skipping.');
    return false;
  }

  console.info('Elevating service...');
  await asyncExecFile(path.join(__dirname, 'elevate-service'), [pkg]);
  return true;
}

/**
 * Returns the file path for a flag.
 */
function flagFilePath(flagFile: FlagFileName): string {
  return `/var/luna/preferences/${flagFile}`;
}

/**
 * Returns whether a flag is set or not.
 */
async function flagFileRead(flagFile: FlagFileName): Promise<boolean> {
  return exists(flagFilePath(flagFile));
}

/**
 * Sets the value of a flag.
 */
async function flagFileSet(flagFile: FlagFileName, enabled: boolean): Promise<boolean> {
  if (enabled) {
    // The file content is ignored, file presence is what matters. Writing '1' acts as a hint.
    await asyncWriteFile(flagFilePath(flagFile), '1');
  } else {
    try {
      await asyncUnlink(flagFilePath(flagFile));
    } catch (err: unknown) {
      assertNodeError(err);
      // Already deleted is not a fatal error.
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return flagFileRead(flagFile);
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
  if (!resp['Package']) {
    throw new Error(`Invalid package info: ${JSON.stringify(resp)}`);
  }
  return resp;
}

function isRecord(obj: unknown): obj is Record<string, any> {
  return typeof obj === 'object' && !Array.isArray(obj);
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

    req.on('response', (res: Message): void => {
      console.info('appInstallService response:', res.payload);

      if (res.payload['returnValue'] === false) {
        reject(new Error(`${res.payload['errorCode']}: ${res.payload['errorText']}`));
        req.cancel();
        return;
      }

      if (isRecord(res.payload['details']) && res.payload['details']['errorCode'] !== undefined) {
        reject(new Error(`${res.payload['details']['errorCode']}: ${res.payload['details']['reason']}`));
        req.cancel();
        return;
      }

      if (res.payload['statusValue'] === 30) {
        const details: unknown = res.payload['details'];
        if (!isRecord(details)) {
          reject(new Error('"details" in response is not an object'));
        } else if (typeof details['packageId'] !== 'string') {
          reject(new Error('"details.payloadId" in response is not a string'));
        } else {
          resolve(details['packageId']);
        }
        req.cancel();
      }
    });

    req.on('cancel', (msg: Message): void => {
      if (isRecord(msg.payload) && 'errorText' in msg.payload) {
        const errorText: unknown = msg.payload['errorText'];
        reject(new Error(typeof errorText === 'string' ? errorText : 'errorText is not a string'));
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

    req.on('response', (res: Message) => {
      console.info('appInstallService remove response:', res);

      if (res.payload['returnValue'] === false) {
        reject(new Error(`${res.payload['errorCode']}: ${res.payload['errorText']}`));
        req.cancel();
        return;
      }

      if (isRecord(res.payload['details']) && res.payload['details']['errorCode'] !== undefined) {
        reject(new Error(`${res.payload['details']['errorCode']}: ${res.payload['details']['reason']}`));
        req.cancel();
        return;
      }

      if (res.payload['statusValue'] === 25) {
        const details: unknown = res.payload['details'];
        if (!isRecord(details)) {
          reject(new Error('"details" in response is not an object'));
        } else if (typeof details['reason'] !== 'string') {
          reject(new Error('"details.reason" in response is not a string'));
        } else {
          reject(new Error(details['reason']));
        }
        req.cancel();
        return;
      }

      if (res.payload['statusValue'] === 31) {
        resolve();
        req.cancel();
      }
    });

    req.on('cancel', (msg: Message) => {
      if (isRecord(msg.payload) && 'errorText' in msg.payload) {
        const errorText: unknown = msg.payload['errorText'];
        reject(new Error(typeof errorText === 'string' ? errorText : 'errorText is not a string'));
      } else {
        reject(new Error('cancelled'));
      }
    });
  });
}

/**
 * Register activity to call /autostart on boot
 */
async function registerActivity(service: Service): Promise<void> {
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

  return new Promise((resolve) => {
    service.activityManager.create(spec, () => {
      resolve();
    });
  });
}

function simpleTryRespond(runner: (message: Message) => Promise<void>) {
  return (message: Message): void => {
    runner(message)
      .then((): void => {
        message.respond(makeSuccess());
      })
      .catch((err: unknown): void => {
        assertNodeError(err);
        message.respond(makeError(err.message));
      })
      .finally(() => {
        message.cancel({});
      });
  };
}

/**
 * Thin wrapper that responds with a successful message or an error in case of a JS exception.
 */
function tryRespond<T extends Record<string, any>>(runner: (message: Message) => Promise<T>) {
  return (message: Message): void => {
    runner(message)
      .then((reply?: T): void => {
        message.respond(makeSuccess(reply));
      })
      .catch((err: unknown): void => {
        assertNodeError(err);
        message.respond(makeError(err.message));
      })
      .finally(() => {
        message.cancel({});
      });
  };
}

function runService(): void {
  const service = new Service(serviceInfo.id, undefined, { idleTimer: 30 });
  const serviceRemote = new ServiceRemote();

  function getInstallerService(): Service {
    if (runningAsRoot) {
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
  interface InstallPayload {
    ipkUrl: string;
    ipkHash: string;
    id?: string;
  }
  service.register(
    'install',
    tryRespond(async (message: Message) => {
      const payload = message.payload as InstallPayload;
      const targetPath = `/tmp/.hbchannel-incoming-${Date.now()}.ipk`;

      // Download
      message.respond({ statusText: 'Downloading…' });
      const res = await fetchWrapper(payload.ipkUrl);
      if (!res.ok) {
        throw new Error(res.statusText);
      }
      const progressReporter = progress({
        length: parseInt(res.headers.get('content-length') ?? '0', 10),
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

      let pkginfo: Record<string, string | undefined> = { Package: payload.id };

      try {
        pkginfo = await packageInfo(targetPath);
      } catch (err: unknown) {
        assertNodeError(err);
        await createToast(`Package info fetch failed: ${err.message}`, service);
      }

      // If we are running as root we likely want to retain root
      // execution/private bus permissions. During package install running app
      // and its services (since webOS 4.x) are killed using SIGKILL (9) signal.
      // In order to retain some part of our service still running as root
      // during upgrade we fork off our process and do self-update installation
      // in there. After a successful install we re-elevate the service and exit.
      // Exiting cleanly is an important part, since forked process retains open
      // luna bus socket, and thus a new service will not be able to launch
      // until we do that.
      //
      // If re-elevation fails for some reason the service should still be
      // re-elevated on reboot on devices with persistent autostart hooks (since
      // we launch elevate-service in startup.sh script)
      if (runningAsRoot && isRecord(pkginfo) && pkginfo['Package'] === kHomebrewChannelPackageId) {
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
        await createToast(`Application installed: ${appInfo['title']}`, service);
      } catch (err: unknown) {
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
  interface UninstallPayload {
    id: string;
  }
  service.register(
    'uninstall',
    tryRespond(async (message: Message) => {
      if (!('id' in message.payload)) {
        throw new Error('missing "id"');
      } else if (typeof message.payload['id'] !== 'string') {
        throw new Error('"id" is not a string');
      }

      const payload = message.payload as UninstallPayload;
      await removePackage(payload.id, getInstallerService());
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
        async ([flag, flagFile]) => [flag, await flagFileRead(flagFile)] as [FlagName, boolean],
      );
      const flags = Object.fromEntries(await Promise.all(futureFlags));
      return {
        root: runningAsRoot,
        homebrewBaseDir,
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
    tryRespond(async (message: Message) => {
      const payload = message.payload as SetConfigurationPayload;
      // TODO: Use destructuring again once it works with type predicates.
      //       See https://github.com/microsoft/TypeScript/issues/41173
      const futureFlagSets = Object.entries(payload)
        .filter((pair: [string, boolean]): pair is [FlagName, boolean] => pair[0] in availableFlags)
        .map(async ([flagName, value]): Promise<[FlagName, boolean]> => [flagName, await flagFileSet(availableFlags[flagName], value)]);
      return Object.fromEntries(await Promise.all(futureFlagSets));
    }),
  );

  /**
   * Invokes a platform reboot.
   */
  service.register(
    'reboot',
    simpleTryRespond(async (_message: Message) => {
      await asyncExecFile('reboot');
    }),
  );

  /**
   * Returns whether the service is running as root.
   */
  service.register('checkRoot', (message: Message) => message.respond({ returnValue: runningAsRoot }));

  /**
   * Check for startup script updates
   */
  service.register(
    'updateStartupScript',
    tryRespond(async () => {
      if (!runningAsRoot) {
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
          'e04a3d61098c6f74d466da6fb457a52fb61a9cc86869059ae32b13bf43cd9d10',
        ];

        // RootMyTV v2
        if (await isFile(webosbrewStartup)) {
          const localChecksum = await hashFile(webosbrewStartup, 'sha256');
          if (localChecksum !== bundledStartupChecksum) {
            if (updatableChecksums.includes(localChecksum)) {
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
          const startDevmodeContents = (await asyncReadFile(startDevmode, { encoding: 'utf-8' }).catch((err: NodeJS.ErrnoException) => {
            console.warn(`reading ${startDevmode} failed: ${err.toString()}`);
            return '';
          })) as string;

          const localChecksum = hashString(startDevmodeContents, 'sha256');

          if (localChecksum !== bundledStartupChecksum && updatableChecksums.includes(localChecksum)) {
            await copyScript(bundledStartup, startDevmode);
            messages.push(`${startDevmode} updated!`);
          } else if (localChecksum !== bundledJumpstartChecksum && startDevmodeContents.includes('org.webosbrew')) {
            // Show notification about mismatched startup script if contains
            // org.webosbrew string (which is not used on jumpstart.sh nor
            // official start-devmode.sh)
            messages.push(`${startDevmode} has been manually modified!`);
          }
        }
      } catch (err: unknown) {
        assertNodeError(err);
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
  interface GetAppInfoPayload {
    id: string;
  }
  service.register(
    'getAppInfo',
    tryRespond(async (message: Message) => {
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
  interface ExecPayload {
    command: string;
  }
  service.register('exec', (message: Message) => {
    if (!('command' in message.payload)) {
      message.respond(makeError('missing "command"'));
      return;
    } else if (typeof message.payload['command'] !== 'string') {
      message.respond(makeError('"command" is not a string'));
      return;
    }

    const payload = message.payload as ExecPayload;

    function commonResponse(error: child_process.ExecException | null, stdout: Buffer, stderr: Buffer) {
      const response = {
        stdoutString: stdout.toString(),
        stdoutBytes: stdout.toString('base64'),
        stderrString: stderr.toString(),
        stderrBytes: stderr.toString('base64'),
      };
      if (error !== null) {
        message.respond(makeError(error.message, response));
      } else {
        message.respond(makeSuccess(response));
      }
    }

    if (nodeVersion.major !== 0 && nodeVersion.minor >= 12) {
      child_process.exec(payload.command, { encoding: 'buffer' }, commonResponse);
    } else {
      /* Node.js v0.10.x doesn't provide callback with Buffers, so fake it */
      child_process.exec(
        payload.command,
        { encoding: 'binary' },
        (error: child_process.ExecException | null, stdout: string, stderr: string) => {
          commonResponse(error, Buffer.from(stdout, 'binary'), Buffer.from(stderr, 'binary'));
        },
      );
    }
  });

  /**
   * Spawns a shell command and streams stdout & stderr bytes.
   */
  service.register('spawn', (message) => {
    if (!('command' in message.payload)) {
      message.respond(makeError('missing "command"'));
      return;
    } else if (typeof message.payload['command'] !== 'string') {
      message.respond(makeError('"command" is not a string'));
      return;
    }

    const payload = message.payload as ExecPayload;
    const respond = (event: string, args: Record<string, any>) => message.respond({ event, ...args });
    const proc = child_process.spawn('/bin/sh', ['-c', '--', payload.command]);
    proc.stdout.on(
      'data',
      (data: Buffer): void =>
        void respond('stdoutData', {
          stdoutString: data.toString(),
          stdoutBytes: data.toString('base64'),
        }),
    );
    proc.stderr.on(
      'data',
      (data: Buffer): void =>
        void respond('stderrData', {
          stderrString: data.toString(),
          stderrBytes: data.toString('base64'),
        }),
    );
    proc.on('close', (closeCode): void => void respond('close', { closeCode }));
    proc.on('exit', (exitCode): void => void respond('exit', { exitCode }));
  });

  /**
   * Stub service that emulates luna://com.webos.service.sm/license/apps/getDrmStatus
   *
   * This is intended to work with sampatcher.py, but it is not currently used.
   */
  interface GetDrmStatusPayload {
    appId: string;
  }
  service.register('getDrmStatus', (message: Message) =>
    message.respond({
      appId: (message.payload as GetDrmStatusPayload).appId,
      drmType: 'NCG DRM',
      installBasePath: '/media/cryptofs',
      returnValue: true,
      isTimeLimited: false,
    }),
  );

  service.register(
    'registerActivity',
    simpleTryRespond((_message: Message) => registerActivity(service)),
  );

  service.register(
    'autostart',
    tryRespond(async (message: Message) => {
      if (!runningAsRoot) {
        return { message: 'Not running as root.', returnValue: true };
      }
      if (await exists('/tmp/webosbrew_startup')) {
        return { message: 'Startup script already executed.', returnValue: true };
      }
      // Copy startup.sh if doesn't exist
      if (!(await exists('/var/lib/webosbrew/startup.sh'))) {
        try {
          await asyncMkdir('/var/lib/webosbrew/', 0o755);
        } catch {
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
      if (message.payload['reason'] !== 'activity') {
        await registerActivity(service);
      }

      return { returnValue: true };
    }),
  );

  /**
   * Elevates the service specified by "id".
   */
  interface ElevateServicePayload {
    id: string;
  }
  service.register(
    'elevateService',
    simpleTryRespond(async (message: Message) => {
      if (!('id' in message.payload)) {
        throw new Error('missing "id"');
      } else if (typeof message.payload['id'] !== 'string') {
        throw new Error('"id" is not a string');
      } else if (message.payload['id'] === '') {
        throw new Error('"id" is empty');
      }

      if (!runningAsRoot) {
        throw new Error('not running as root');
      }

      const payload = message.payload as ElevateServicePayload;

      const status = await elevateService(payload.id);

      if (!status) {
        throw new Error('elevateService() failed');
      }
    }),
  );
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
      await elevateService(`${installedPackageId}.service`);
      await createToast('Self-update finished!', service);
      process.exit(0);
    } catch (err: unknown) {
      console.error(err);
      assertNodeError(err);
      await createToast(`Self-update failed: ${err.message}`, service);
      process.exit(1);
    }
  })();
} else {
  runService();
}
