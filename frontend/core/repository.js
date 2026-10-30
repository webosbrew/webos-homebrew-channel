/*
 * Repository configuration and repository-feed parsing, free of Enyo and of
 * window/localStorage so it can be unit-tested. Used by configutils.js,
 * views/BrowserPanel.js and views/SettingsPanel.js.
 *
 * Plain ES5 CommonJS.
 */

var DEFAULT_REPOSITORY_URL = 'https://repo.webosbrew.org/api/apps.json';
var NONFREE_REPOSITORY_URL = 'https://repo.webosbrew.org/api/non-free/apps.json';
var CONFIG_STORAGE_KEY = 'repositoriesConfig';

/** Error code reported for a repository whose feed could not be parsed. */
var INVALID_FEED_ERROR_CODE = '600';

function defaultConfig() {
  return {
    repositories: [],
    disableDefault: false,
    enableNonfree: false,
  };
}

/**
 * Reads the repositories configuration from a storage object (localStorage
 * or anything with string properties). Malformed data yields the defaults.
 */
function readConfig(storage) {
  var config = defaultConfig();
  var stored = storage ? storage[CONFIG_STORAGE_KEY] : undefined;
  if (stored === undefined || stored === null) {
    return config;
  }
  try {
    var parsed = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) {
      return config;
    }
    if (typeof parsed.disableDefault === 'boolean') config.disableDefault = parsed.disableDefault;
    if (typeof parsed.enableNonfree === 'boolean') config.enableNonfree = parsed.enableNonfree;
    if (Object.prototype.toString.call(parsed.repositories) === '[object Array]') {
      config.repositories = parsed.repositories.filter(function (repo) {
        return typeof repo === 'object' && repo !== null && typeof repo.url === 'string' && repo.url;
      });
    }
  } catch (err) {
    // keep defaults
  }
  return config;
}

function writeConfig(storage, config) {
  storage[CONFIG_STORAGE_KEY] = JSON.stringify({
    repositories: (config.repositories || []).map(function (repo) {
      return { url: repo.url };
    }),
    disableDefault: !!config.disableDefault,
    enableNonfree: !!config.enableNonfree,
  });
}

/** The ordered list of feed URLs to load for a configuration. */
function repositoryUrls(config) {
  var urls = (config.repositories || []).map(function (repo) {
    return repo.url;
  });
  if (!config.disableDefault) urls.push(DEFAULT_REPOSITORY_URL);
  if (config.enableNonfree) urls.push(NONFREE_REPOSITORY_URL);
  return urls;
}

/**
 * Turns a repository feed (apps.json) into the package records the app list
 * shows. Returns null when the feed is not a valid repository.
 *
 * Each package gets:
 *  - uid: unique across repositories (id|url)
 *  - repository: the feed URL it came from
 *  - official: whether it came from the default webosbrew repository
 */
function parseRepositoryFeed(data, url) {
  if (typeof data !== 'object' || data === null) return null;
  if (Object.prototype.toString.call(data.packages) !== '[object Array]') return null;
  var packages = [];
  for (var i = 0; i < data.packages.length; i += 1) {
    var pkg = data.packages[i];
    if (typeof pkg !== 'object' || pkg === null || typeof pkg.id !== 'string' || !pkg.id) {
      continue;
    }
    pkg.uid = pkg.id + '|' + url;
    pkg.repository = url;
    pkg.official = url === DEFAULT_REPOSITORY_URL;
    packages.push(pkg);
  }
  return packages;
}

/** Sentinel record used to signal a failed parse through Enyo's Collection. */
function invalidFeedMarker() {
  return [{ repository: null }];
}

function isInvalidFeedResult(result) {
  return !!result && result.length === 1 && result[0] && result[0].repository === null;
}

/**
 * "url (code), url (code)" for the feeds that failed, for the error popup.
 * @param {{url:string, errorCode?:string}[]} feeds
 */
function failedFeedsSummary(feeds) {
  return (feeds || [])
    .filter(function (feed) {
      return feed && feed.errorCode !== undefined;
    })
    .map(function (feed) {
      return feed.url + ' (' + feed.errorCode + ')';
    })
    .join(', ');
}

module.exports = {
  DEFAULT_REPOSITORY_URL: DEFAULT_REPOSITORY_URL,
  NONFREE_REPOSITORY_URL: NONFREE_REPOSITORY_URL,
  CONFIG_STORAGE_KEY: CONFIG_STORAGE_KEY,
  INVALID_FEED_ERROR_CODE: INVALID_FEED_ERROR_CODE,

  defaultConfig: defaultConfig,
  readConfig: readConfig,
  writeConfig: writeConfig,
  repositoryUrls: repositoryUrls,
  parseRepositoryFeed: parseRepositoryFeed,
  invalidFeedMarker: invalidFeedMarker,
  isInvalidFeedResult: isInvalidFeedResult,
  failedFeedsSummary: failedFeedsSummary,
};
