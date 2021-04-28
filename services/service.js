import "regenerator-runtime/runtime";
import "es6-shim";
// ??
// require('@babel/runtime/core-js/promise').default = require('bluebird');

import serviceInfo from './services.json';
import Service from 'webos-service';
import child_process from 'child_process';
import path from 'path';

import * as Promise from "bluebird";
import fs from 'fs';
import pipeline from 'stream.pipeline-shim';
import fetch from 'node-fetch';
import progress from 'progress-stream';
import {createHash} from 'crypto';

fetch.Promise = Promise;
const pipelinePromise = Promise.promisify(pipeline);
const execPromise = Promise.promisify(child_process.exec);
const unlinkPromise = Promise.promisify(fs.unlink);
const writeFilePromise = Promise.promisify(fs.writeFile);

var service = new Service(serviceInfo.id);

function promiseCall(svc, uri, args) {
  return new Promise((resolve, reject) => {
    svc.call(uri, args, ({payload}) => {
      if (payload.returnValue) {
        resolve(payload);
      } else {
        reject(payload);
      }
    })
  });
}

function createToast(message) {
  return promiseCall(service, 'luna://com.webos.notification/createToast', {sourceId: pkgInfo.name, message});
}

/**
 * Generate local file checksum
 */
async function hashFile(filePath, type) {
  const targetDownloaded = fs.createReadStream(filePath);
  const hash = createHash(type);
  hash.setEncoding('hex');
  await pipelinePromise(targetDownloaded, hash);
  hash.end();

  return hash.read();
}

/**
 * Perform appInstallService/dev/install request
 */
async function installPackage(filePath) {
  return new Promise((resolve, reject) => {
    const req = service.subscribe('luna://com.webos.appInstallService/dev/install', {
      id: "testing",
      ipkUrl: filePath,
      subscribe: true,
    });
    req.on('response', (res) => {
      if (res.payload.details && res.payload.details.errorCode !== undefined) {
        reject(new Error(`${res.payload.details.errorCode}: ${res.payload.details.reason}`));
        req.cancel();
      }

      console.info(res.payload);

      if (res.payload.statusValue === 30) {
        resolve(res.payload.details.packageId);
        req.cancel();
      }
    });
    req.on('cancel', (msg) => {
      reject(msg);
    });
  });
}

service.register("install", async (message) => {
  try {
    const targetPath = '/tmp/incoming.ipk';

    message.respond({
      statusText: 'downloading',
    });

    // Download file
    const res = await fetch(message.payload.ipkUrl);
    if (!res.ok) {
      throw new Error(res.statusText);
    }
    const progressReporter = progress({
      length: res.headers.get('content-length'),
      time: 300 /* ms */
    });
    progressReporter.on('progress', (progress) => {
      message.respond({statusText: 'downloading', progress: progress.percentage});
    });
    const targetFile = fs.createWriteStream(targetPath);
    await pipelinePromise(res.body, progressReporter, targetFile);

    message.respond({
      statusText: 'verifying',
    });

    const checksum = await hashFile(targetPath, 'sha256');
    if (checksum !== message.payload.ipkHash) {
      throw new Error('Invalid file checksum');
    }

    message.respond({
      statusText: 'installing',
    });

    const installedPackageId = await installPackage(targetPath);

    message.respond({
      statusText: 'finished',
      finished: true,
      returnValue: true
    });

    await createToast(`Application installed: ${installedPackageId}`);

    if (installedPackageId === 'org.webosbrew.hbchannel') {
      if (process.getuid() === 0) {
        console.info('Elevating service...');
        await execPromise(path.join(__dirname, 'elevate-service'));
        console.info('Finished, dying as soon as possible.');
      }

      service.activityManager.idleTimeout = 1;
      await createToast('Homebrew Channel update finished');
    }
  } catch (err) {
    console.error(err);
    console.log(err.stack);
    message.respond({
      returnValue: false,
      errorText: err.toString(),
    });
  }
  message.cancel();
}, () => {
  console.info('canceled!');
  // TODO
});

async function flagRead(name) {
  return fs.existsSync(`/var/luna/preferences/${name}`);
}

async function flagSet(name, value) {
  if (value === true) {
    if (!await flagRead(name)) {
      await writeFilePromise(`/var/luna/preferences/${name}`, '1');
    }
  } else {
    if (await flagRead(name)) {
      await unlinkPromise(`/var/luna/preferences/${name}`);
    }
  }

  return flagRead(name);
}

service.register("getConfiguration", async (message) => {
  message.respond({
    returnValue: true,
    root: process.getuid() === 0,
    telnetDisabled: await flagRead('webosbrew_telnet_disabled'),
    sshdEnabled: await flagRead('webosbrew_sshd_enabled'),
    blockUpdates: await flagRead('webosbrew_block_updates'),
    failsafe: await flagRead('webosbrew_failsafe'),
  });
});

service.register("setConfiguration", async (message) => {
  try {
    const resp = {};
    if (message.payload.telnetDisabled !== undefined) {
      resp.telnetDisabled = await flagSet('webosbrew_telnet_disabled', message.payload.telnetDisabled);
    }
    if (message.payload.failsafe !== undefined) {
      resp.failsafe = await flagSet('webosbrew_failsafe', message.payload.failsafe);
    }
    if (message.payload.sshdEnabled !== undefined) {
      resp.sshdEnabled = await flagSet('webosbrew_sshd_enabled', message.payload.sshdEnabled);
    }
    if (message.payload.blockUpdates !== undefined) {
      resp.blockUpdates = await flagSet('webosbrew_block_updates', message.payload.blockUpdates);
    }
    message.respond({
      returnValue: true,
      ...resp
    });
  } catch (err) {
    message.respond({
      returnValue: false,
      errorText: err.toString(),
    });
  }
});

service.register("reboot", async (message) => {
  try {
    await execPromise('reboot');
    message.respond({
      returnValue: true,
    });
  } catch (err) {
    message.respond({
      returnValue: false,
      errorText: err.toString(),
    });
  }
});

service.register("checkRoot", function (message) {
  message.respond({
    returnValue: process.getuid() === 0,
  });
});

// This roughly replicates com.webos.applicationManager/getAppInfo request in an
// environment-independent way (non-root vs root)
service.register("getAppInfo", async (message) => {
  try {
    const appId = message.payload.id;

    if (!appId) {
      throw new Error('Fail to parse json');
    }

    const appList = await promiseCall(service, 'luna://com.webos.applicationManager/dev/listApps', {});
    const appInfo = appList.apps.find(a => a.id === appId);
    if (appInfo) {
      message.respond({
        returnValue: true,
        appId,
        appInfo,
      });
    } else {
      throw new Error(`Invalid appId specified OR Unsupported Application Type: ${appId}`);
    }
  } catch (err) {
    console.info(err);
    message.respond({
      returnValue: false,
      errorText: err.toString(),
    })
  }
  message.cancel();
});

service.register("exec", function (message) {
  child_process.exec(message.payload.command, {encoding: "buffer"}, function (error, stdout, stderr) {
    message.respond({
      returnValue: !error,
      error: error,
      stdoutString: stdout.toString(),
      stdoutBytes: stdout.toString("base64"),
      stderrString: stderr.toString(),
      stderrBytes: stderr.toString("base64")
    });
  });
});

service.register("spawn", function (message) {
  var proc = child_process.spawn("/bin/sh", ["-c", message.payload.command]);

  proc.stdout.on('data', function (data) {
    message.respond({
      event: "stdoutData",
      stdoutString: data.toString(),
      stdoutBytes: data.toString("base64")
    });
  });
  proc.stderr.on('data', function (data) {
    message.respond({
      event: "stderrData",
      stderrString: data.toString(),
      stderrBytes: data.toString("base64")
    });
  });
  proc.on('close', function (code) {
    message.respond({
      event: "close",
      closeCode: code
    });
  });
  proc.on('exit', function (code) {
    message.respond({
      event: "exit",
      exitCode: code
    });
  });
});

// stub service that emulates luna://com.webos.service.sm/license/apps/getDrmStatus
service.register("getDrmStatus", (message) => {
  message.respond({
    "appId": message.payload.appId,
    "drmType": "NCG DRM",
    "installBasePath": "/media/cryptofs",
    "returnValue": true,
    "isTimeLimited": false
  });
});
