/*
 * Repository configuration persisted in localStorage.
 * All logic lives in core/repository.js; this only supplies the storage.
 */

var repository = require('./core/repository');

function storage() {
  return window.localStorage;
}

function getConfig() {
  try {
    return repository.readConfig(storage());
  } catch (err) {
    console.warn('Config load failed:', err);
    return repository.defaultConfig();
  }
}

function getRepositories() {
  try {
    return repository.repositoryUrls(getConfig());
  } catch (err) {
    console.warn(err);
    return [repository.DEFAULT_REPOSITORY_URL];
  }
}

function setConfig(config) {
  repository.writeConfig(storage(), config);
  console.info(storage()[repository.CONFIG_STORAGE_KEY]);
}

module.exports = {
  repositoryBaseURL: repository.DEFAULT_REPOSITORY_URL,

  getRepositories: getRepositories,
  getConfig: getConfig,
  setConfig: setConfig,
};
