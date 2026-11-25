var repositoryBaseURL = 'https://repo.webosbrew.org/api/apps.json';
var repositoryNonfreeBaseURL = 'https://repo.webosbrew.org/api/non-free/apps.json';

function getConfig() {
  var repositoriesConfig = {
    repositories: [],
    disableDefault: false,
    enableNonfree: false,
  };

  var storedConfig = window.localStorage['repositoriesConfig'];

  if (storedConfig === undefined) {
    return repositoriesConfig;
  }

  try {
    var parsed = JSON.parse(storedConfig);
    if (parsed.disableDefault !== undefined)
      repositoriesConfig.disableDefault = parsed.disableDefault;
    if (parsed.repositories !== undefined)
      repositoriesConfig.repositories = parsed.repositories;
    if (parsed.enableNonfree !== undefined)
      repositoriesConfig.enableNonfree = parsed.enableNonfree;
  } catch (err) {
    console.warn('Config load failed:', err);
  }

  return repositoriesConfig;
}

function getRepositories() {
  try {
    var repositoriesConfig = getConfig();
    var repos = repositoriesConfig.repositories.map(function (repo) { return repo.url; });
    if (!repositoriesConfig.disableDefault) repos.push(repositoryBaseURL);
    if (repositoriesConfig.enableNonfree) repos.push(repositoryNonfreeBaseURL);
    return repos;
  } catch (err) {
    console.warn(err);
    return [repositoryBaseURL];
  }
}

function setConfig(config) {
  window.localStorage['repositoriesConfig'] = JSON.stringify(config);
  console.info(window.localStorage['repositoriesConfig']);
}

function getHiddenApps() {
  var stored = window.localStorage['hiddenApps'];
  if (!stored) {
    return [];
  }
  try {
    var parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(function (item) {
      return item && typeof item.id === 'string' && item.id.length > 0;
    });
  } catch (err) {
    console.warn('Hidden apps load failed:', err);
    return [];
  }
}

function setHiddenApps(apps) {
  window.localStorage['hiddenApps'] = JSON.stringify(apps || []);
}

function getHiddenAppIdMap() {
  var map = {};
  var apps = getHiddenApps();
  for (var i = 0; i < apps.length; i++) {
    map[apps[i].id] = true;
  }
  return map;
}

function hideApp(app) {
  if (!app || !app.id) {
    return;
  }
  var apps = getHiddenApps();
  for (var i = 0; i < apps.length; i++) {
    if (apps[i].id === app.id) {
      return;
    }
  }
  apps.push({
    id: app.id,
    title: app.title || app.id,
    iconUri: app.iconUri || '',
  });
  setHiddenApps(apps);
}

function unhideApp(id) {
  var apps = getHiddenApps().filter(function (item) {
    return item.id !== id;
  });
  setHiddenApps(apps);
}

function clearHiddenApps() {
  setHiddenApps([]);
}

module.exports = {
  repositoryBaseURL: repositoryBaseURL,

  getRepositories: getRepositories,
  getConfig: getConfig,
  setConfig: setConfig,
  getHiddenApps: getHiddenApps,
  setHiddenApps: setHiddenApps,
  getHiddenAppIdMap: getHiddenAppIdMap,
  hideApp: hideApp,
  unhideApp: unhideApp,
  clearHiddenApps: clearHiddenApps,
};
