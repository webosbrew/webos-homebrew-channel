/*
 * The frontend's half of the Luna contract with org.webosbrew.hbchannel.service.
 *
 * Every payload the app sends to the service is built here, and every
 * response it interprets is parsed here, so the contract lives in one place
 * and can be tested against the service handlers directly
 * (tests/contract.test.ts) without any Enyo involved.
 *
 * Plain ES5 CommonJS: bundled by enyo-dev (uglify-js 2) and executed by the
 * WebKit on webOS 1.x/2.x.
 */

var resolveURL = require('../baseurl').resolveURL;

var SERVICE_URI = 'luna://org.webosbrew.hbchannel.service';

/** Methods the frontend calls, by the name used in the views. */
var METHODS = {
  getConfiguration: 'getConfiguration',
  setConfiguration: 'setConfiguration',
  reboot: 'reboot',
  updateStartupScript: 'updateStartupScript',
  autostart: 'autostart',
  getAppInfo: 'getAppInfo',
  install: 'install',
  uninstall: 'uninstall',
};

/** Configuration flags as the service names them (getConfiguration/setConfiguration). */
var FLAGS = ['telnetDisabled', 'sshdEnabled', 'blockUpdates', 'failsafe'];

/** Hint appended to install/uninstall errors right after a self-update. */
var RESTART_HINT = 'If you just updated Homebrew Channel app you may need to perform a reboot.';

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

/* ---------------------------------------------------------------- payloads */

/**
 * Builds the `install` payload from a package manifest.
 *
 * @param {object|null|undefined} packageInfo  manifest fields (ipkUrl, ipkHash.sha256, id)
 * @param {string} [manifestUrl]  URL the manifest was fetched from (base for relative ipkUrl)
 * @param {string} [repositoryUrl] fallback base when the manifest was inlined in the repository
 * @throws {Error} when the manifest lacks what the service requires
 */
function buildInstallPayload(packageInfo, manifestUrl, repositoryUrl) {
  if (!isObject(packageInfo)) {
    throw new Error('package manifest is missing');
  }
  if (typeof packageInfo.ipkUrl !== 'string' || !packageInfo.ipkUrl) {
    throw new Error('package manifest has no ipkUrl');
  }
  var hash = isObject(packageInfo.ipkHash) ? packageInfo.ipkHash.sha256 : undefined;
  if (typeof hash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error('package manifest has no sha256 ipkHash');
  }
  var payload = {
    ipkUrl: resolveURL(packageInfo.ipkUrl, manifestUrl || repositoryUrl),
    ipkHash: hash.toLowerCase(),
    subscribe: true,
  };
  if (typeof packageInfo.id === 'string' && packageInfo.id) {
    payload.id = packageInfo.id;
  }
  return payload;
}

function buildUninstallPayload(id) {
  if (typeof id !== 'string' || !id) {
    throw new Error('application id is missing');
  }
  return { id: id };
}

function buildGetAppInfoPayload(id) {
  if (typeof id !== 'string' || !id) {
    throw new Error('application id is missing');
  }
  return { id: id };
}

/**
 * Builds the `setConfiguration` payload from the UI state.
 * Note the UI shows "Telnet enabled" while the service stores "telnetDisabled".
 */
function buildSetConfigurationPayload(state) {
  return {
    telnetDisabled: !state.telnetEnabled,
    sshdEnabled: !!state.sshdEnabled,
    blockUpdates: !!state.blockUpdates,
    failsafe: !!state.failsafe,
  };
}

function buildRebootPayload() {
  return { reason: 'SwDownload' };
}

/* --------------------------------------------------------------- responses */

/**
 * Interprets a `getConfiguration` response (or error) into UI state.
 */
function parseConfigurationResponse(response) {
  if (!isObject(response)) {
    return { error: 'invalid response', rootIsActive: false, rootStatusText: 'invalid response' };
  }
  if (response.returnValue === false || typeof response.errorText === 'string') {
    var text = typeof response.errorText === 'string' ? response.errorText : 'unknown error';
    return { error: text, rootIsActive: false, rootStatusText: text };
  }
  var root = response.root === true;
  return {
    error: null,
    rootIsActive: root,
    rootStatusText: root ? 'ok' : 'unelevated',
    telnetEnabled: !response.telnetDisabled,
    sshdEnabled: response.sshdEnabled === true,
    blockUpdates: response.blockUpdates === true,
    failsafe: response.failsafe === true,
  };
}

/**
 * Classifies one message of the `install` subscription.
 *
 * Returns one of:
 *   { type: 'error', text }           - returnValue false
 *   { type: 'finished' }              - installation complete
 *   { type: 'progress', percent }     - download progress (0-100)
 *   { type: 'status', text }          - a status line without progress
 *   { type: 'ignore' }                - anything else
 */
function classifyInstallResponse(response) {
  if (!isObject(response)) {
    return { type: 'ignore' };
  }
  if (response.returnValue === false) {
    return { type: 'error', text: typeof response.errorText === 'string' ? response.errorText : 'unknown error' };
  }
  if (response.finished === true) {
    return { type: 'finished' };
  }
  if (typeof response.progress === 'number') {
    var percent = Math.max(0, Math.min(100, response.progress));
    return { type: 'progress', percent: percent, text: typeof response.statusText === 'string' ? response.statusText : undefined };
  }
  if (typeof response.statusText === 'string') {
    return { type: 'status', text: response.statusText };
  }
  return { type: 'ignore' };
}

/**
 * Builds the user-facing text for a failed install/uninstall.
 */
function formatOperationError(response, operation) {
  var errorText = isObject(response) && typeof response.errorText === 'string' ? response.errorText : 'unknown error';
  var message = 'An error occured during ' + operation + ': ' + errorText;
  if (errorText.indexOf('luna-send-pub') !== -1 && errorText.indexOf('ECONNREFUSED') !== -1) {
    message += '<br /><br />' + RESTART_HINT;
  }
  return message;
}

/**
 * Extracts the installed-app record from a `getAppInfo` response, or null
 * when the app is not installed / the call failed.
 */
function parseAppInfoResponse(response) {
  if (!isObject(response) || response.returnValue === false) {
    return null;
  }
  return isObject(response.appInfo) ? response.appInfo : null;
}

module.exports = {
  SERVICE_URI: SERVICE_URI,
  METHODS: METHODS,
  FLAGS: FLAGS,
  RESTART_HINT: RESTART_HINT,

  buildInstallPayload: buildInstallPayload,
  buildUninstallPayload: buildUninstallPayload,
  buildGetAppInfoPayload: buildGetAppInfoPayload,
  buildSetConfigurationPayload: buildSetConfigurationPayload,
  buildRebootPayload: buildRebootPayload,

  parseConfigurationResponse: parseConfigurationResponse,
  classifyInstallResponse: classifyInstallResponse,
  formatOperationError: formatOperationError,
  parseAppInfoResponse: parseAppInfoResponse,
};
