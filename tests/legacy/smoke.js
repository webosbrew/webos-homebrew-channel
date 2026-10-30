#!/usr/bin/env node
/*
 * Legacy Node.js smoke test for the BUILT service bundle.
 *
 * Loads dist/services/service.js the way the TV would (webos-service is
 * stubbed), then drives the registered Luna methods through the parts of the
 * code that depend on the Node.js runtime: child processes, streams, the
 * HTTP download path, hashing, filesystem access and the Promise polyfill.
 *
 * Usage: node tests/legacy/smoke.js [path/to/dist/services]
 *
 * It is run against the built bundle under the build Node.js by
 * tests/bundle.test.ts. It is kept strict ES5 (var, function, callbacks, no
 * Promise, no Buffer.from) so it can also be run by hand on a TV or on an
 * old Node.js binary when one is available. The per-version differences the
 * bundle depends on are covered deterministically by tests/node-compat.test.ts.
 */

'use strict';

var path = require('path');
var fs = require('fs');
var http = require('http');
var nodeCrypto = require('crypto');
var childProcess = require('child_process');
var Module = require('module');

var repoRoot = path.join(__dirname, '..', '..');
var builtDir = path.resolve(process.argv[2] || path.join(repoRoot, 'dist', 'services'));
var stubsDir = path.join(__dirname, 'stubs');

/* ares-package copies the non-compiled assets (startup.sh, certs, ...) next
 * to the bundles; webpack alone does not. Stage the same layout the TV sees. */
var distDir = path.join(require('os').tmpdir(), 'hbchannel-smoke-' + process.pid);
function copyFile(src, dst) {
  fs.writeFileSync(dst, fs.readFileSync(src));
  try {
    fs.chmodSync(dst, fs.statSync(src).mode);
  } catch (e) {
    /* ignore */
  }
}
function copyTree(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst);
  fs.readdirSync(src).forEach(function (name) {
    var s = path.join(src, name);
    var d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) {
      copyTree(s, d);
    } else {
      copyFile(s, d);
    }
  });
}
copyTree(builtDir, distDir);
['startup.sh', 'jumpstart.sh', 'run-js-service', 'services.json'].forEach(function (name) {
  copyFile(path.join(repoRoot, 'services', name), path.join(distDir, name));
});
copyTree(path.join(repoRoot, 'services', 'certs'), path.join(distDir, 'certs'));

/* ---- reporting ------------------------------------------------------- */

var failures = 0;
var passes = 0;
var done = false;

function log(msg) {
  process.stdout.write(msg + '\n');
}

function ok(cond, name, detail) {
  if (cond) {
    passes += 1;
    log('ok - ' + name);
  } else {
    failures += 1;
    log('not ok - ' + name + (detail !== undefined ? '\n  # ' + String(detail).replace(/\n/g, '\n  # ') : ''));
  }
}

function cleanupStaging() {
  try {
    if (childProcess.execFileSync) {
      childProcess.execFileSync('rm', ['-rf', distDir]);
    } else {
      /* Node.js 0.10 has no execFileSync */
      childProcess.exec('rm -rf ' + distDir);
    }
  } catch (e) {
    /* ignore */
  }
}

function finish() {
  done = true;
  cleanupStaging();
  log('# node ' + process.version + ': ' + passes + ' passed, ' + failures + ' failed');
  realExit(failures === 0 ? 0 : 1);
}

/* The bundle's idle timer calls process.exit(0) after 30s; make sure that is
 * never mistaken for success. */
var realExit = process.exit.bind(process);
process.exit = function (code) {
  if (!done) {
    log('not ok - the service exited on its own (code ' + code + ') before the smoke test finished');
    failures += 1;
    done = true;
    log('# node ' + process.version + ': ' + passes + ' passed, ' + failures + ' failed');
    realExit(1);
  }
  realExit(code);
};

var deadline = setTimeout(function () {
  ok(false, 'smoke test finished within 25s');
  finish();
}, 25000);

process.on('uncaughtException', function (err) {
  ok(false, 'no uncaught exception', err && err.stack ? err.stack : err);
  finish();
});

/* ---- load the bundle -------------------------------------------------- */

/* Redirect require('webos-service') to the stub, ahead of the real module in
 * node_modules (which needs LG's native pmloglib). */
var stubPath = path.join(stubsDir, 'webos-service', 'index.js');
var originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'webos-service') {
    return originalLoad.call(Module, stubPath, parent, isMain);
  }
  return originalLoad.call(Module, request, parent, isMain);
};

var WebosService = require('webos-service');
var bundlePath = path.join(distDir, 'service.js');

log('# loading ' + bundlePath + ' under node ' + process.version);
require(bundlePath);

var service = WebosService.instances[0];
ok(!!service, 'bundle constructed a Service');
if (!service) {
  finish();
}

/* When running as root the bundle talks to appInstallService through this
 * stub; answer with an error so the install path completes. (Non-root goes
 * through luna-send-pub, which does not exist here and fails on its own.) */
service.subscribeScripts['luna://com.webos.appInstallService/dev/install'] = [
  { returnValue: false, errorCode: -1, errorText: 'no appInstallService in smoke test' }
];

var expectedMethods = [
  'autostart',
  'checkRoot',
  'elevateService',
  'exec',
  'getAppInfo',
  'getConfiguration',
  'install',
  'reboot',
  'registerActivity',
  'setConfiguration',
  'spawn',
  'uninstall',
  'updateStartupScript'
];
var registered = Object.keys(service.handlers).sort();
ok(registered.join(',') === expectedMethods.join(','), 'all 13 Luna methods registered', registered.join(','));

/* ---- fake messages ---------------------------------------------------- */

var tokenCounter = 0;

/**
 * Invokes `method` and calls back once the handler cancels the message (the
 * tryRespond pattern) or after `settleOn` responses for streaming handlers.
 */
function invoke(method, payload, options, callback) {
  var settled = false;
  var responses = [];
  tokenCounter += 1;
  var message = {
    method: method,
    payload: payload,
    uniqueToken: 'token-' + tokenCounter,
    token: 'token-' + tokenCounter,
    ls2Message: {
      senderServiceName: function () {
        return options.sender || 'com.example.client';
      }
    },
    responses: responses,
    cancelledWith: null,
    respond: function (response) {
      responses.push(response);
      if (options.settleOn !== undefined && responses.length >= options.settleOn) {
        settle();
      }
      return true;
    },
    cancel: function (response) {
      message.cancelledWith = response;
      settle();
    }
  };
  var timer = setTimeout(function () {
    ok(false, method + ' completed in time', JSON.stringify(responses));
    settle();
  }, options.timeoutMs || 8000);

  function settle() {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    setTimeout(function () {
      callback(message);
    }, 0);
  }

  service.handlers[method].handler(message);
  return message;
}

function last(message) {
  return message.responses[message.responses.length - 1] || {};
}

function sha256(buf) {
  return nodeCrypto.createHash('sha256').update(buf).digest('hex');
}

/* Only count downloads created by this run (an earlier aborted run may have left some). */
var preexistingTmp = fs.readdirSync('/tmp');
function tmpLeftovers() {
  return fs.readdirSync('/tmp').filter(function (f) {
    return f.indexOf('.hbchannel-incoming-') === 0 && preexistingTmp.indexOf(f) === -1;
  });
}

/* ---- the checks, as a callback chain ---------------------------------- */

var steps = [];

/* The bundle installs shims for APIs this Node.js may lack; third-party code
 * inside it (tr46, node-fetch) calls them unguarded, so they must be there
 * right after the bundle loaded, on every Node.js version. */
steps.push(function platformShims(next) {
  var EventEmitter = require('events').EventEmitter;
  ok(typeof String.prototype.normalize === 'function', 'String.prototype.normalize available after bundle load');
  ok(typeof EventEmitter.prototype.listenerCount === 'function', 'EventEmitter.prototype.listenerCount available after bundle load');
  var em = new EventEmitter();
  em.on('data', function () {});
  ok(em.listenerCount('data') === 1 && em.listenerCount('end') === 0, 'listenerCount() counts instance listeners');
  ok('abc'.normalize('NFC') === 'abc', 'normalize() is the identity on ASCII');
  next();
});

steps.push(function checkRoot(next) {
  invoke('checkRoot', {}, { settleOn: 1 }, function (m) {
    ok(typeof last(m).returnValue === 'boolean', 'checkRoot answers with a boolean');
    next();
  });
});

steps.push(function getConfiguration(next) {
  invoke('getConfiguration', {}, {}, function (m) {
    var r = last(m);
    ok(r.returnValue === true, 'getConfiguration succeeds', JSON.stringify(r));
    ok(
      typeof r.telnetDisabled === 'boolean' &&
        typeof r.sshdEnabled === 'boolean' &&
        typeof r.failsafe === 'boolean' &&
        typeof r.blockUpdates === 'boolean',
      'getConfiguration reports all flags',
      JSON.stringify(r)
    );
    next();
  });
});

steps.push(function execOutput(next) {
  invoke('exec', { command: 'printf hi; printf err >&2' }, { settleOn: 1 }, function (m) {
    var r = last(m);
    ok(r.returnValue === true && r.stdoutString === 'hi' && r.stderrString === 'err', 'exec returns stdout/stderr text', JSON.stringify(r));
    ok(r.stdoutBytes === new Buffer('hi').toString('base64'), 'exec returns base64 bytes', r.stdoutBytes);
    next();
  });
});

steps.push(function execFailure(next) {
  invoke('exec', { command: 'echo partial; exit 7' }, { settleOn: 1 }, function (m) {
    var r = last(m);
    ok(r.returnValue === false && r.stdoutString === 'partial\n', 'exec reports non-zero exit with output', JSON.stringify(r));
    next();
  });
});

steps.push(function execTimeout(next) {
  invoke('exec', { command: 'sleep 5', timeout: 200 }, { settleOn: 1 }, function (m) {
    var r = last(m);
    ok(r.returnValue === false && /killed/.test(r.errorText || ''), 'exec kills on timeout', JSON.stringify(r));
    next();
  });
});

steps.push(function execMissingCommand(next) {
  invoke('exec', {}, { settleOn: 1 }, function (m) {
    ok(last(m).returnValue === false, 'exec rejects a missing command');
    next();
  });
});

steps.push(function spawnStream(next) {
  invoke('spawn', { command: 'echo out; echo err >&2; exit 3' }, { settleOn: 4 }, function (m) {
    var events = m.responses.map(function (r) {
      return r.event;
    });
    var exit = null;
    m.responses.forEach(function (r) {
      if (r.event === 'exit') exit = r;
    });
    ok(events.indexOf('stdoutData') !== -1 && events.indexOf('stderrData') !== -1, 'spawn streams stdout and stderr', events.join(','));
    ok(exit && exit.exitCode === 3, 'spawn reports the exit code', JSON.stringify(exit));
    ok(events.indexOf('close') !== -1, 'spawn emits close', events.join(','));
    next();
  });
});

steps.push(function spawnCancel(next) {
  var started = Date.now();
  var message = invoke('spawn', { command: 'sleep 30' }, { settleOn: 2, timeoutMs: 6000 }, function (m) {
    var events = m.responses.map(function (r) {
      return r.event;
    });
    ok(
      events.indexOf('close') !== -1,
      'spawn cancel kills the whole process group (close within ' + (Date.now() - started) + 'ms)',
      events.join(',')
    );
    next();
  });
  setTimeout(function () {
    service.handlers.spawn.cancel(message);
  }, 150);
});

/* A local HTTP server for the download path. */
var server = null;
var serverUrl = null;
var ipkBytes = new Buffer(200000);
for (var i = 0; i < ipkBytes.length; i += 1) ipkBytes[i] = i % 251;

steps.push(function startServer(next) {
  server = http.createServer(function (req, res) {
    if (req.url === '/pkg.ipk') {
      res.writeHead(200, { 'content-length': ipkBytes.length });
      res.end(ipkBytes);
    } else {
      res.writeHead(404);
      res.end('nope');
    }
  });
  server.listen(0, '127.0.0.1', function () {
    serverUrl = 'http://127.0.0.1:' + server.address().port;
    next();
  });
});

steps.push(function installChecksumMismatch(next) {
  invoke('install', { ipkUrl: serverUrl + '/pkg.ipk', ipkHash: sha256('other') }, {}, function (m) {
    var r = last(m);
    var statuses = m.responses.map(function (x) {
      return x.statusText;
    });
    ok(
      statuses.indexOf('Downloading…') !== -1 && statuses.indexOf('Verifying…') !== -1,
      'install downloads and verifies',
      statuses.join(',')
    );
    ok(
      r.returnValue === false && /Invalid file checksum/.test(r.errorText || ''),
      'install rejects a checksum mismatch',
      JSON.stringify(r)
    );
    ok(tmpLeftovers().length === 0, 'install removes the temporary download', tmpLeftovers().join(','));
    var progressSeen = m.responses.some(function (x) {
      return typeof x.progress === 'number';
    });
    ok(progressSeen, 'install reports download progress');
    next();
  });
});

steps.push(function installHttpError(next) {
  invoke('install', { ipkUrl: serverUrl + '/missing.ipk', ipkHash: sha256(ipkBytes) }, {}, function (m) {
    var r = last(m);
    ok(r.returnValue === false && /404/.test(r.errorText || ''), 'install reports HTTP errors', JSON.stringify(r));
    next();
  });
});

steps.push(function installValidHashReachesInstaller(next) {
  /* The checksum matches, so the bundle goes on to read the package control
   * file and then talk to appInstallService. Neither a real .ipk nor a Luna
   * bus exists here, so this must end in a clean error - not a hang or crash -
   * and the download must be cleaned up. */
  invoke('install', { ipkUrl: serverUrl + '/pkg.ipk', ipkHash: sha256(ipkBytes) }, { timeoutMs: 15000 }, function (m) {
    var r = last(m);
    ok(
      r.returnValue === false && typeof r.errorText === 'string' && r.errorText.length > 0,
      'install with a valid hash fails cleanly without a bus',
      JSON.stringify(r)
    );
    ok(tmpLeftovers().length === 0, 'install cleans up after a failed install', tmpLeftovers().join(','));
    next();
  });
});

steps.push(function stopServer(next) {
  server.close();
  next();
});

steps.push(function updateStartupScript(next) {
  /* Read-only when not root ("Not running as root."), and when root on a
   * machine without any webosbrew files it finds nothing to do. */
  invoke('updateStartupScript', {}, {}, function (m) {
    var r = last(m);
    ok(
      r.returnValue === true && /Not running as root|Nothing changed/.test(r.statusText || ''),
      'updateStartupScript runs against the bundled scripts',
      JSON.stringify(r)
    );
    next();
  });
});

steps.push(function getAppInfoWithoutBus(next) {
  invoke('getAppInfo', { id: 'com.example.app' }, { timeoutMs: 15000 }, function (m) {
    var r = last(m);
    ok(r.returnValue === false && typeof r.errorText === 'string', 'getAppInfo fails cleanly without a bus', JSON.stringify(r));
    next();
  });
});

steps.push(function elevateServiceBundle(next) {
  /* The second bundle: run it as a CLI against a service that does not exist. */
  childProcess.execFile(
    process.execPath,
    [path.join(distDir, 'elevate-service'), 'com.example.nonexistent.service'],
    function (err, stdout, stderr) {
      ok(!err, 'elevate-service bundle runs under this node', err ? String(err) + '\n' + stderr : undefined);
      ok(/No changes/.test(stdout), 'elevate-service finds nothing to patch', stdout);
      next();
    }
  );
});

function run(index) {
  if (index >= steps.length) {
    clearTimeout(deadline);
    finish();
    return;
  }
  try {
    steps[index](function () {
      run(index + 1);
    });
  } catch (err) {
    ok(false, steps[index].name + ' threw', err && err.stack ? err.stack : err);
    run(index + 1);
  }
}

run(0);
