/*
 * Luna method handlers for the Homebrew Channel service.
 *
 * Everything environment-specific (paths, whether we run as root, how the
 * process exits or forks) comes in through ServiceConfig so the handlers can
 * be exercised in tests against a temp directory and a fake bus. The entry
 * point (service.ts) supplies the real values.
 */

import path from 'path';

import type Service from 'webos-service';
import type { Message } from 'webos-service';

import { crypto, fs, http, proc, stream } from './platform';

import rootAppInfo from '../appinfo.json';
import startupChecksums from './startup-checksums.json';
import { makeError, makeSuccess } from './protocol';
import { errorMessage, parseControlFile } from './utils';

export const homebrewChannelPackageId = rootAppInfo.id;
export const autostartActivityName = `${homebrewChannelPackageId}.service.autostart`;

/**
 * The subset of webos-service's Service the handlers use for outbound calls.
 */
export type LunaClient = Pick<Service, 'call' | 'subscribe'>;

export interface ServicePaths {
  /** Directory the service bundle runs from (startup.sh, jumpstart.sh, elevate-service, certs live here). */
  serviceDir: string;
  /** Where boolean flag files live (webosbrew_telnet_disabled, ...). */
  preferencesDir: string;
  /** Scratch space for downloads. */
  tmpDir: string;
  /** Marker created by startup.sh once it has run this boot. */
  startupOnceFlag: string;
  /** Persistent webosbrew state (startup.sh copy, init.d, sshd). */
  webosbrewDir: string;
  /** RootMyTV's start-devmode.sh hook. */
  startDevmode: string;
  /** Working directory for the startup script. */
  homeDir: string;
  /** Reported to the frontend as the homebrew install root. */
  homebrewBaseDir: string | null;
}

export interface ServiceConfig {
  runningAsRoot: boolean;
  paths: ServicePaths;
  /** Give up on a download if no headers arrive, or no data flows, for this long. */
  downloadTimeoutMs: number;
  /** Default limits for the `exec` endpoint. */
  execDefaultTimeoutMs: number;
  execMaxBuffer: number;
  /** Command run by the `reboot` endpoint. */
  rebootCommand: string;
  /** Hands a downloaded Homebrew Channel package to a detached installer and schedules our exit. */
  startSelfUpdate: (packagePath: string) => void;
}

export function defaultPaths(serviceDir: string): ServicePaths {
  let homebrewBaseDir: string | null = null;
  try {
    homebrewBaseDir = path.resolve(serviceDir, '../../../../');
  } catch (err) {
    console.warn('getting homebrewBaseDir failed:', err);
  }
  return {
    serviceDir,
    preferencesDir: '/var/luna/preferences',
    tmpDir: '/tmp',
    startupOnceFlag: '/tmp/webosbrew_startup',
    webosbrewDir: '/var/lib/webosbrew',
    startDevmode: '/media/cryptofs/apps/usr/palm/services/com.palmdts.devmode.service/start-devmode.sh',
    homeDir: '/home/root',
    homebrewBaseDir,
  };
}

/**
 * Production configuration.
 *
 * @param serviceDir directory of the service bundle (its __dirname)
 * @param entryFile  the service's own script, re-run detached with `self-update` (its __filename)
 */
export function defaultConfig(serviceDir: string, entryFile: string): ServiceConfig {
  return {
    runningAsRoot: proc.runningAsRoot,
    paths: defaultPaths(serviceDir),
    downloadTimeoutMs: 60 * 1000,
    execDefaultTimeoutMs: 60 * 1000,
    execMaxBuffer: 16 * 1024 * 1024,
    rebootCommand: 'reboot',
    startSelfUpdate: (packagePath: string): void => {
      proc.fork(entryFile, ['self-update', packagePath]);
      setTimeout(() => process.exit(0), 1000);
    },
  };
}

// Maps internal setting field name with filesystem flag name.
export const availableFlags = {
  telnetDisabled: 'webosbrew_telnet_disabled',
  failsafe: 'webosbrew_failsafe',
  sshdEnabled: 'webosbrew_sshd_enabled',
  blockUpdates: 'webosbrew_block_updates',
} as const;
type FlagName = keyof typeof availableFlags;
type FlagFileName = (typeof availableFlags)[FlagName];

export function asyncCall<T extends Record<string, any>>(srv: LunaClient, uri: string, args: Record<string, any>): Promise<T> {
  return new Promise((resolve, reject) => {
    srv.call(uri, args, ({ payload }) => {
      if (payload['returnValue']) {
        resolve(payload as T);
        return;
      }

      if ('errorText' in payload) {
        reject(new Error(`Luna Error: ${payload['errorText']}`));
      } else {
        reject(new Error(`Luna Error: ${JSON.stringify(payload, null, 2)}`));
      }
    });
  });
}

export function createToast(message: string, service: LunaClient, extras: Record<string, any> = {}): Promise<Record<string, any>> {
  console.info(`[toast] ${message}`);
  return asyncCall(service, 'luna://com.webos.notification/createToast', {
    sourceId: homebrewChannelPackageId,
    message,
    ...extras,
  });
}

/**
 * Copies a script and makes it executable.
 */
async function copyScript(sourcePath: string, targetPath: string): Promise<void> {
  if (!(await fs.isFile(sourcePath))) {
    throw new Error(`${sourcePath} is not a file`);
  }

  await stream.pipeline(fs.createReadStream(sourcePath), fs.createWriteStream(targetPath));
  await fs.chmod(targetPath, 0o755);
}

/**
 * Elevates a package by name using the bundled elevate-service binary.
 */
export async function elevateService(pkg: string, config: Pick<ServiceConfig, 'runningAsRoot' | 'paths'>): Promise<boolean> {
  if (!config.runningAsRoot) {
    console.error('Trying to elevate service without running as root. Skipping.');
    return false;
  }

  console.info('Elevating service...');
  await proc.execFile(path.join(config.paths.serviceDir, 'elevate-service'), [pkg]);
  return true;
}

/**
 * Returns whether a flag is set or not.
 */
async function flagFileRead(preferencesDir: string, flagFile: FlagFileName): Promise<boolean> {
  return fs.exists(path.join(preferencesDir, flagFile));
}

/**
 * Sets the value of a flag.
 */
async function flagFileSet(preferencesDir: string, flagFile: FlagFileName, enabled: boolean): Promise<boolean> {
  const flagPath = path.join(preferencesDir, flagFile);
  if (enabled) {
    // The file content is ignored, file presence is what matters. Writing '1' acts as a hint.
    await fs.writeFile(flagPath, '1');
  } else {
    try {
      await fs.unlink(flagPath);
    } catch (err: unknown) {
      // Already deleted is not a fatal error.
      if (!fs.isNotFound(err)) throw err;
    }
  }
  return flagFileRead(preferencesDir, flagFile);
}

/**
 * Package info
 */
export async function packageInfo(filePath: string): Promise<Record<string, string>> {
  // Pass the path as a positional parameter rather than interpolating it into the script.
  const control = await proc.execFile('sh', ['-c', 'ar -p "$1" control.tar.gz | tar zxO', 'sh', filePath]);

  const resp = parseControlFile(control);
  if (!resp['Package']) {
    throw new Error(`Invalid package info: ${JSON.stringify(resp)}`);
  }
  return resp;
}

function isRecord(obj: unknown): obj is Record<string, any> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

/**
 * Performs appInstallService/dev/install request.
 */
export async function installPackage(filePath: string, service: LunaClient, id: string = homebrewChannelPackageId): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = service.subscribe('luna://com.webos.appInstallService/dev/install', {
      // "id" is just a client-chosen label for this install request; it does not
      // need to match the package being installed (ares-install uses a fixed string).
      id,
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
          reject(new Error('"details.packageId" in response is not a string'));
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

export async function removePackage(packageId: string, service: LunaClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = service.subscribe('luna://com.webos.appInstallService/dev/remove', {
      id: packageId,
      subscribe: true,
    });

    req.on('response', (res: Message) => {
      console.info('appInstallService remove response:', res.payload);

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
export function registerActivity(service: LunaClient): Promise<Record<string, any>> {
  const activity = {
    name: autostartActivityName,
    description: 'Start Homebrew Channel service on boot',
    type: {
      foreground: true,
      persist: true,
      continuous: true,
      explicit: true,
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
    },
  };

  const spec = {
    activity,
    start: true,
    replace: true,
  };

  return asyncCall(service, 'luna://com.palm.activitymanager/create', spec);
}

export async function pauseActivity(service: LunaClient, activityName: string = autostartActivityName) {
  await asyncCall(service, 'luna://com.palm.activitymanager/pause', { activityName });
}

/**
 * Thin wrapper that responds with a successful message or an error in case of a JS exception.
 *
 * Any rejection value is turned into an error response (not only Error
 * instances), so the caller always gets a reply.
 */
export function tryRespond<T extends Record<string, any>>(runner: (message: Message) => Promise<T>) {
  return (message: Message): void => {
    runner(message)
      .then((reply: T): void => {
        message.respond(makeSuccess(reply));
      })
      .catch((err: unknown): void => {
        console.warn(`${message.method} failed:`, err);
        message.respond(makeError(errorMessage(err)));
      })
      .finally(() => {
        message.cancel({});
      });
  };
}

export function simpleTryRespond(runner: (message: Message) => Promise<void>) {
  return tryRespond(async (message: Message): Promise<Record<string, never>> => {
    await runner(message);
    return {};
  });
}

/**
 * Registers all Luna methods on `service`.
 *
 * `installer` is the client used for appInstallService / applicationManager
 * calls: the service itself when running as root, otherwise a luna-send
 * based remote that has the required permissions.
 */
export function registerHandlers(service: Service, installer: LunaClient, config: ServiceConfig): void {
  const { runningAsRoot, paths } = config;

  function getInstallerService(): LunaClient {
    return installer;
  }

  interface AppInfo {
    id: string;
    title: string;
    type: string;
    folderPath: string;
  }
  interface AppsList {
    apps: AppInfo[];
  }
  async function getAppInfo(appId: string): Promise<AppInfo> {
    const appList = await asyncCall<AppsList>(getInstallerService(), 'luna://com.webos.applicationManager/dev/listApps', {});
    if (!Array.isArray(appList.apps)) {
      throw new Error('listApps returned no "apps" array');
    }
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
      if (typeof payload.ipkUrl !== 'string' || !payload.ipkUrl) {
        throw new Error('missing "ipkUrl" string field');
      }
      if (typeof payload.ipkHash !== 'string' || !payload.ipkHash) {
        throw new Error('missing "ipkHash" string field');
      }
      const targetPath = path.join(paths.tmpDir, `.hbchannel-incoming-${Date.now()}.ipk`);

      // The downloaded package is removed again unless the self-update path
      // hands it over to the forked installer process.
      let keepTargetFile = false;
      const removeTargetFile = async (): Promise<void> => {
        if (keepTargetFile) return;
        try {
          await fs.unlink(targetPath);
        } catch (err: unknown) {
          if (!fs.isNotFound(err)) {
            console.warn(`removing ${targetPath} failed:`, err);
          }
        }
      };

      try {
        // Download
        message.respond({ statusText: 'Downloading…' });
        await http.downloadToFile(payload.ipkUrl, targetPath, {
          timeout: config.downloadTimeoutMs,
          onProgress: (percentage) => {
            message.respond({ statusText: 'Downloading…', progress: percentage });
          },
        });

        // Checksum
        message.respond({ statusText: 'Verifying…' });
        const checksum = await crypto.hashFile(targetPath, 'sha256');
        if (checksum !== payload.ipkHash) {
          throw new Error(`Invalid file checksum (${payload.ipkHash} expected, got ${checksum})`);
        }

        let pkginfo: Record<string, string | undefined> = { Package: payload.id };

        try {
          pkginfo = await packageInfo(targetPath);
        } catch (err: unknown) {
          await createToast(`Package info fetch failed: ${errorMessage(err)}`, service);
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
        if (runningAsRoot && isRecord(pkginfo) && pkginfo['Package'] === homebrewChannelPackageId) {
          message.respond({ statusText: 'Self-update…' });
          await createToast('Performing self-update...', service);

          keepTargetFile = true;
          config.startSelfUpdate(targetPath);
          return { statusText: 'Self-update' };
        }

        // Install
        message.respond({ statusText: 'Installing…' });
        const installedPackageId = await installPackage(targetPath, getInstallerService(), pkginfo['Package'] ?? payload.id);

        try {
          const appInfo = await getAppInfo(installedPackageId);
          await createToast(`Application installed: ${appInfo.title}`, service);
        } catch (err: unknown) {
          console.warn('appinfo fetch failed:', err);
          await createToast(`Application installed: ${installedPackageId}`, service);
        }

        return { statusText: 'Finished.', finished: true };
      } finally {
        await removeTargetFile();
      }
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
        async ([flag, flagFile]) => [flag, await flagFileRead(paths.preferencesDir, flagFile)] as [FlagName, boolean],
      );
      const flags = Object.fromEntries(await Promise.all(futureFlags));
      return {
        root: runningAsRoot,
        homebrewBaseDir: paths.homebrewBaseDir,
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
        .map(async ([flagName, value]): Promise<[FlagName, boolean]> => [
          flagName,
          await flagFileSet(paths.preferencesDir, availableFlags[flagName], value),
        ]);
      return Object.fromEntries(await Promise.all(futureFlagSets));
    }),
  );

  /**
   * Invokes a platform reboot.
   */
  service.register(
    'reboot',
    simpleTryRespond(async (_message: Message) => {
      await proc.execFile(config.rebootCommand);
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
        const bundledStartup = path.join(paths.serviceDir, 'startup.sh');
        const bundledJumpstart = path.join(paths.serviceDir, 'jumpstart.sh');
        const { startDevmode } = paths;

        const webosbrewStartup = path.join(paths.webosbrewDir, 'startup.sh');

        const bundledStartupChecksum = await crypto.hashFile(bundledStartup, 'sha256');
        const bundledJumpstartChecksum = await crypto.hashFile(bundledJumpstart, 'sha256');

        // Checksums of every startup.sh we have ever shipped (plus a few
        // installer-provided variants). Generated from git history by
        // tools/gen-startup-checksums.js - run `npm run startup-checksums`
        // after changing startup.sh.
        const updatableChecksums: string[] = startupChecksums.map((entry) => entry.sha256);

        // RootMyTV v2
        if (await fs.isFile(webosbrewStartup)) {
          const localChecksum = await crypto.hashFile(webosbrewStartup, 'sha256');
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
            (await fs.isFile(startDevmode)) &&
            (await crypto.hashFile(startDevmode, 'sha256')) === '98bf599e3787cc4de949d2e7831308379b8f93a6deacf93887aeed15d5a0317e'
          ) {
            await copyScript(bundledJumpstart, startDevmode);
            messages.push(`${startDevmode} updated!`);
          }
        }

        // RootMyTV v1
        if (await fs.isFile(startDevmode)) {
          // Warn and return empty string on read error
          const startDevmodeContents = await fs.readFile(startDevmode, 'utf-8').catch((err: unknown) => {
            console.warn(`reading ${startDevmode} failed: ${errorMessage(err)}`);
            return '';
          });

          const localChecksum = crypto.hashString(startDevmodeContents, 'sha256');

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
        const stack = err instanceof Error ? err.stack : undefined;
        console.log(`Startup script update failed: ${stack ?? errorMessage(err)}`);
        messages = ['Startup script update failed!', ...messages, `Error: ${errorMessage(err)}`];
        await createToast(messages.join('<br/>'), service);
        return { returnValue: false, statusText: 'Startup script update failed.', stack, messages };
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
    /** Optional timeout in milliseconds (0 disables). Defaults to execDefaultTimeoutMs. */
    timeout?: number;
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
    const timeout = typeof payload.timeout === 'number' && payload.timeout >= 0 ? payload.timeout : config.execDefaultTimeoutMs;

    void proc.exec(payload.command, { timeout, maxBuffer: config.execMaxBuffer }).then(({ error, stdout, stderr }) => {
      const response = {
        stdoutString: stdout.toString(),
        stdoutBytes: stdout.toString('base64'),
        stderrString: stderr.toString(),
        stderrBytes: stderr.toString('base64'),
      };
      if (error !== null) {
        // A killed process (timeout) has no exit code but does have a signal.
        const detail = error.killed ? ` (killed${error.signal ? ` by ${error.signal}` : ''}, timeout ${timeout}ms)` : '';
        message.respond(makeError(`${error.message}${detail}`, response));
      } else {
        message.respond(makeSuccess(response));
      }
    });
  });

  /**
   * Spawns a shell command and streams stdout & stderr bytes.
   *
   * The process is killed if the subscription is cancelled (client went away).
   */
  const spawnedProcesses = new Map<string, proc.ChildProcess>();
  service.register(
    'spawn',
    (message) => {
      if (!('command' in message.payload)) {
        message.respond(makeError('missing "command"'));
        return;
      } else if (typeof message.payload['command'] !== 'string') {
        message.respond(makeError('"command" is not a string'));
        return;
      }

      const payload = message.payload as ExecPayload;
      const respond = (event: string, args: Record<string, any>) => message.respond({ event, ...args });
      const child = proc.spawnShell(payload.command);
      spawnedProcesses.set(message.uniqueToken, child);

      child.stdout.on(
        'data',
        (data: Buffer): void =>
          void respond('stdoutData', {
            stdoutString: data.toString(),
            stdoutBytes: data.toString('base64'),
          }),
      );
      child.stderr.on(
        'data',
        (data: Buffer): void =>
          void respond('stderrData', {
            stderrString: data.toString(),
            stderrBytes: data.toString('base64'),
          }),
      );
      child.on('error', (err): void => {
        spawnedProcesses.delete(message.uniqueToken);
        respond('error', { errorText: errorMessage(err) });
      });
      child.on('close', (closeCode): void => {
        spawnedProcesses.delete(message.uniqueToken);
        respond('close', { closeCode });
      });
      child.on('exit', (exitCode): void => void respond('exit', { exitCode }));
    },
    (message) => {
      const child = spawnedProcesses.get(message.uniqueToken);
      if (child) {
        console.info(`spawn: subscription cancelled, killing pid ${child.pid}`);
        spawnedProcesses.delete(message.uniqueToken);
        proc.killTree(child, 'SIGTERM');
      }
    },
  );

  service.register(
    'registerActivity',
    tryRespond((_message: Message) => registerActivity(service)),
  );

  service.register(
    'autostart',
    tryRespond(async (message: Message) => {
      const calledByActivityManager = /^com\.(?:palm|webos)(?:\.service)?\.activitymanager$/.test(
        (message.ls2Message as { senderServiceName: () => string }).senderServiceName(),
      );
      // legacy ActivityManager does not expire/satisfy activity after invoking the callback
      // to prevent the service from restarting over and over, manually pause the activity
      // it's done without await to avoid slowing down autostart
      if (calledByActivityManager) {
        pauseActivity(service).catch((payload: unknown) => {
          // /pause will complain on modern webOS about invalid activity state transition
          // it's safe to ignore, activity is still persisted in db
          console.warn('failed to pause autostart activity', payload);
        });
      }
      if (!runningAsRoot) {
        return { message: 'Not running as root.', returnValue: true };
      }
      if (await fs.exists(paths.startupOnceFlag)) {
        return { message: 'Startup script already executed.', returnValue: true };
      }
      const startupScript = path.join(paths.webosbrewDir, 'startup.sh');
      // Copy startup.sh if doesn't exist
      if (!(await fs.exists(startupScript))) {
        try {
          await fs.mkdir(paths.webosbrewDir, 0o755);
        } catch {
          // Ignore
        }
        await copyScript(path.join(paths.serviceDir, 'startup.sh'), startupScript);
      }
      // Make startup.sh executable
      await fs.chmod(startupScript, 0o755);

      proc.spawn('/bin/sh', ['-c', startupScript], {
        cwd: paths.homeDir,
        env: {
          LD_PRELOAD: '',
          SKIP_ELEVATION: 'true',
          SERVICE_DIR: paths.serviceDir,
        },
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      });

      // frontend calls /autostart on launch
      if (!calledByActivityManager) {
        try {
          await registerActivity(service);
        } catch (e) {
          console.warn('failed to register activity', e);
        }
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

      const status = await elevateService(payload.id, config);

      if (!status) {
        throw new Error('elevateService() failed');
      }
    }),
  );
}
