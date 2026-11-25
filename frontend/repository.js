// Loading the package lists of all enabled repositories.

var
  Ajax = require('enyo/Ajax'),
  ConfigUtils = require('./configutils.js');

/**
 * Fetches every enabled repository and calls `done(packages, errors)` once all have answered.
 *
 * `packages`: the repositories' package entries, each with `uid` (id|repository), `repository` (its URL) and
 * `official`, sorted by title. A package that several repositories list appears once per repository.
 * `errors`: `{url, reason}` for each repository that could not be loaded or parsed.
 */
function loadAll(done) {
  var urls = ConfigUtils.getRepositories();
  var results = [];
  var errors = [];
  var remaining = urls.length;

  if (remaining === 0) {
    done([], []);
    return;
  }

  function finished() {
    remaining--;
    if (remaining > 0) return;
    var packages = [];
    results.forEach(function (list) { packages = packages.concat(list); });
    packages.sort(function (a, b) {
      var ta = String(a.title || a.id).toLowerCase();
      var tb = String(b.title || b.id).toLowerCase();
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    done(packages, errors);
  }

  urls.forEach(function (url) {
    var request = new Ajax({url: url, cacheBust: false, handleAs: 'json'});
    request.response(function (sender, data) {
      if (data && data.packages && data.packages.forEach) {
        data.packages.forEach(function (pkg) {
          pkg.uid = pkg.id + '|' + url;
          pkg.repository = url;
          pkg.official = url === ConfigUtils.repositoryBaseURL;
        });
        results.push(data.packages);
      } else {
        errors.push({url: url, reason: 'not a repository'});
      }
      finished();
    });
    request.error(function (sender, error) {
      errors.push({url: url, reason: (sender && sender.xhrResponse && sender.xhrResponse.status) || error || 'unreachable'});
      finished();
    });
    request.go();
  });
}

/**
 * The version a repository entry offers, when it carries its manifest.
 */
function availableVersion(pkg) {
  return pkg && pkg.manifest && pkg.manifest.version ? pkg.manifest.version : null;
}

/**
 * Short host name of a repository URL, for display.
 */
function repositoryHost(url) {
  var match = /^[a-z]+:\/\/([^\/?#]+)/i.exec(url || '');
  return match ? match[1] : url;
}

module.exports = {
  loadAll: loadAll,
  availableVersion: availableVersion,
  repositoryHost: repositoryHost,
};
