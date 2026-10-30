/*
 * Presentation logic for a package manifest + installed-app state, kept free
 * of Enyo so it can be unit-tested. Used by views/DetailsPanel.js.
 *
 * Plain ES5 CommonJS.
 */

var HOMEBREW_CHANNEL_ID = 'org.webosbrew.hbchannel';

/** DOMPurify configuration for repository-provided HTML descriptions. */
var DESCRIPTION_SANITIZE_CONFIG = { FORBID_TAGS: ['style', 'form', 'input', 'button'] };

var NO_DESCRIPTION_HTML = '<p>No description provided for this package</p>';

function rootRequiredText(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  if (value === 'optional') return 'optional';
  return 'unknown';
}

/**
 * "1.2.3" or "1.2.3 (installed: 1.2.0)".
 * @param {string|undefined} manifestVersion version from the repository manifest (undefined while loading)
 * @param {object|null|undefined} appInfo installed app record, null when not installed
 */
function versionText(manifestVersion, appInfo) {
  var pkgver = typeof manifestVersion === 'string' && manifestVersion ? manifestVersion : 'unknown';
  var localver = appInfo && typeof appInfo.version === 'string' ? appInfo.version : undefined;
  return pkgver + (localver && localver !== pkgver ? ' (installed: ' + localver + ')' : '');
}

/**
 * Whether the install/update button is disabled.
 * @param {object|null|undefined} appInfo undefined = not loaded yet, null = not installed
 * @param {{ready:boolean, error:boolean, version?:string}} manifestState
 */
function installDisabled(appInfo, manifestState) {
  if (appInfo === undefined) return true;
  if (!manifestState || !manifestState.ready || manifestState.error) return true;
  if (appInfo !== null && appInfo.version === manifestState.version) return true;
  return false;
}

function installButtonLabel(appInfo) {
  return appInfo ? 'Update' : 'Install';
}

/** Launching/uninstalling Homebrew Channel from itself is not allowed. */
function canLaunch(appInfo, id) {
  return !!appInfo && id !== HOMEBREW_CHANNEL_ID;
}

function canUninstall(appInfo, id) {
  return !!appInfo && id !== HOMEBREW_CHANNEL_ID;
}

function projectPageEnabled(sourceUrl) {
  return typeof sourceUrl === 'string' && sourceUrl.trim().length > 0;
}

/** Subtitle under the title: the id, plus the repository for third-party packages. */
function subtitleText(id, official, repositoryUrl) {
  return id + (official ? '' : ' (from ' + repositoryUrl + ')');
}

/** Picks the HTML to show when no full description was fetched. */
function fallbackDescription(shortDescription) {
  return typeof shortDescription === 'string' && shortDescription ? shortDescription : NO_DESCRIPTION_HTML;
}

/** Normalises a fetched full description (may be empty) into HTML. */
function fullDescription(data) {
  return typeof data === 'string' && data ? data : NO_DESCRIPTION_HTML;
}

/** Wraps sanitized description HTML for styling. */
function wrapDescription(sanitizedHtml) {
  return '<div class="rich-description">' + sanitizedHtml + '</div>';
}

module.exports = {
  HOMEBREW_CHANNEL_ID: HOMEBREW_CHANNEL_ID,
  DESCRIPTION_SANITIZE_CONFIG: DESCRIPTION_SANITIZE_CONFIG,
  NO_DESCRIPTION_HTML: NO_DESCRIPTION_HTML,

  rootRequiredText: rootRequiredText,
  versionText: versionText,
  installDisabled: installDisabled,
  installButtonLabel: installButtonLabel,
  canLaunch: canLaunch,
  canUninstall: canUninstall,
  projectPageEnabled: projectPageEnabled,
  subtitleText: subtitleText,
  fallbackDescription: fallbackDescription,
  fullDescription: fullDescription,
  wrapDescription: wrapDescription,
};
