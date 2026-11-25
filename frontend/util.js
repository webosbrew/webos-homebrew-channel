// Small helpers shared by the views. ES5 only: old webOS TVs run Chromium 38.

/**
 * Whether version `newVer` is higher than `oldVer` (dot-separated numbers).
 */
function versionHigher(oldVer, newVer) {
  if (typeof oldVer !== 'string' || typeof newVer !== 'string') return false;

  var oldParts = oldVer.split('.');
  var newParts = newVer.split('.');
  for (var i = 0; i < newParts.length; i++) {
    var a = ~~newParts[i];
    var b = ~~oldParts[i];
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

/**
 * Human-readable size, e.g. 1.5 MB.
 */
function formatSize(bytes) {
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1000 * 1000) return Math.max(1, Math.round(bytes / 1000)) + ' KB';
  var mb = bytes / (1000 * 1000);
  return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + ' MB';
}

function escapeHTML(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Opens a URL in the TV's web browser.
 */
function openInBrowser(url) {
  try {
    global.webOS.service.request('luna://com.webos.applicationManager', {
      method: 'launch',
      parameters: {id: 'com.webos.app.browser', params: {target: url}},
      onSuccess: function (res) { console.info(res); },
      onFailure: function (res) { console.warn(res); },
    });
  } catch (err) {
    console.warn(err);
    if (!global.PalmSystem) global.open(url, '_blank');
  }
}

/**
 * Runs `worker(item, done)` over `items`, at most `limit` at a time, then calls `finished`.
 */
function forEachLimited(items, limit, worker, finished) {
  var next = 0;
  var running = 0;
  var completed = 0;

  function pump() {
    while (running < limit && next < items.length) {
      running++;
      worker(items[next++], function () {
        running--;
        completed++;
        if (completed === items.length) {
          if (finished) finished();
        } else {
          pump();
        }
      });
    }
  }

  if (items.length === 0) {
    if (finished) finished();
  } else {
    pump();
  }
}

/**
 * Calls a Luna service once. Off the TV (development in a desktop browser) it fails right away.
 */
function lunaCall(uri, params, onSuccess, onFailure) {
  if (!global.webOS || !global.webOS.service || !global.PalmSystem) {
    if (onFailure) onFailure({errorText: 'Luna is not available outside webOS'});
    return;
  }
  var split = uri.lastIndexOf('/');
  global.webOS.service.request(uri.substring(0, split), {
    method: uri.substring(split + 1),
    parameters: params || {},
    onSuccess: onSuccess,
    onFailure: onFailure,
  });
}

module.exports = {
  versionHigher: versionHigher,
  formatSize: formatSize,
  escapeHTML: escapeHTML,
  openInBrowser: openInBrowser,
  forEachLimited: forEachLimited,
  lunaCall: lunaCall,
};
