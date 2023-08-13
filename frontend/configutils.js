export const repositoryBaseURL = 'https://repo.webosbrew.org/api/apps.json';
export const repositoryNonfreeBaseURL = 'https://repo.webosbrew.org/api/non-free/apps.json';

export function getConfig() {
  const repositoriesConfig = {
    repositories: [],
    disableDefault: false,
    enableNonfree: false,
  };

  try {
    const parsed = JSON.parse(window.localStorage.getItem('repositoriesConfig'));

    Object.assign(repositoriesConfig, parsed);
  } catch (err) {
    console.warn('Config load failed:', err);
  }

  return repositoriesConfig;
}

export function getRepositories() {
  try {
    const { repositories, disableDefault, enableNonfree } = getConfig();

    const urls = repositories.map(({ url }) => url);

    if (!disableDefault) {
      urls.push(repositoryBaseURL);
    }

    if (enableNonfree) {
      urls.push(repositoryNonfreeBaseURL);
    }

    return urls;
  } catch (err) {
    console.warn(err);

    return [repositoryBaseURL];
  }
}

export function setConfig(config) {
  window.localStorage.setItem('repositoriesConfig', JSON.stringify(config));
  console.info(window.localStorage['repositoriesConfig']);
}
