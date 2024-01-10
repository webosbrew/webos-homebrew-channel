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

module.exports = {
  repositoryBaseURL: repositoryBaseURL,

  getRepositories: getRepositories,
  getConfig: getConfig,
  setConfig: setConfig,
};
