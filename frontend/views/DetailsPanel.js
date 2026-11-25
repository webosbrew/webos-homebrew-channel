var
  kind = require('enyo/kind'),
  Panel = require('moonstone/Panel'),
  AjaxSource = require('enyo/AjaxSource'),
  Ajax = require('enyo/Ajax'),
  Spinner = require('moonstone/Spinner'),
  Popup = require('moonstone/Popup'),
  Divider = require('moonstone/Divider'),
  EnyoImage = require('enyo/Image'),
  Model = require('enyo/Model'),
  States = require('enyo/States'),
  Button = require('moonstone/Button'),
  ProgressButton = require('moonstone/ProgressButton'),
  BodyText = require('moonstone/BodyText'),
  LunaService = require('enyo-webos/LunaService'),
  Scroller = require('moonstone/Scroller'),
  FittableRows = require('layout/FittableRows'),
  FittableColumns = require('layout/FittableColumns'),
  DOMPurify = require('dompurify/dist/purify.cjs.js'),
  resolveURL = require('../baseurl').resolveURL;

DOMPurify.addHook('afterSanitizeAttributes', function (node) {
  if ('href' in node) {
    node.setAttribute('data-href', node.href);
    node.setAttribute('href', 'javascript:openLinkInBrowser(' + JSON.stringify(node.href) + ')');
  }
});

global.openLinkInBrowser = function (url) {
  try {
    webOS.service.request('luna://com.webos.applicationManager', {
      method: 'launch',
      parameters: {id: 'com.webos.app.browser', params: {target: url}},
      onSuccess: function (res) { console.info(res); },
      onFailure: function (res) { console.warn(res); },
    });
  } catch (err) {
    console.warn(err);
  }
};

function parseGithubRepo(url) {
  if (typeof url !== 'string') {
    return null;
  }
  var m = url.match(/github\.com\/([^\/\s#?]+)\/([^\/\s#?]+)/i);
  if (!m) {
    return null;
  }
  return {
    owner: m[1],
    repo: m[2].replace(/\.git$/i, ''),
  };
}

function escapeHtml(str) {
  if (typeof str !== 'string') {
    return '';
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatReleaseMarkdown(md) {
  if (typeof md !== 'string' || !md.trim()) {
    return '<p>No release notes provided.</p>';
  }
  var lines = md.replace(/\r\n/g, '\n').split('\n');
  var out = [];
  var inList = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      continue;
    }
    var safe = escapeHtml(line)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
    if (safe.indexOf('### ') === 0) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<h4>' + safe.substring(4) + '</h4>');
    } else if (safe.indexOf('## ') === 0) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<h3>' + safe.substring(3) + '</h3>');
    } else if (safe.indexOf('# ') === 0) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<h3>' + safe.substring(2) + '</h3>');
    } else if (safe.indexOf('- ') === 0 || safe.indexOf('* ') === 0) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + safe.substring(2) + '</li>');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<p>' + safe + '</p>');
    }
  }
  if (inList) {
    out.push('</ul>');
  }
  return out.join('');
}

module.exports = kind({
  name: 'DetailsPanel',
  kind: Panel,
  title: '',
  titleBelow: '',
  headerType: 'small',
  headerComponents: [
    {
      kind: EnyoImage,
      name: 'headerImage',
      classes: 'hb-details-header-icon',
    },
  ],
  handlers: {
    onSpotlightKeyUp: 'onKeyUp',
  },
  components: [
    {kind: Spinner, name: 'spinner', content: 'Loading...', center: true, middle: true},
    {kind: Popup, name: 'errorPopup', classes: 'hb-dark-popup', animate: false, content: 'An error occured while loading app info.', modal: false, autoDismiss: true, allowBackKey: true, allowHtml: true},
    {
      kind: FittableColumns,
      classes: 'enyo-fill hb-details-layout',
      components: [
        {
          classes: 'hb-details-sidebar',
          components: [
            {
              classes: 'hb-details-card',
              components: [
                {
                  classes: 'hb-meta-row',
                  components: [
                    {classes: 'hb-meta-label', content: 'Version'},
                    {name: 'version', classes: 'hb-meta-value', content: 'unknown'},
                  ],
                },
                {
                  classes: 'hb-meta-row',
                  components: [
                    {classes: 'hb-meta-label', content: 'Package Size'},
                    {name: 'packageSize', classes: 'hb-meta-value', content: 'unknown'},
                  ],
                },
                {
                  classes: 'hb-meta-row',
                  components: [
                    {classes: 'hb-meta-label', content: 'Root Required'},
                    {name: 'rootRequired', classes: 'hb-meta-value', content: 'unknown'},
                  ],
                },
                {
                  classes: 'hb-meta-row',
                  name: 'webosReqRow',
                  showing: false,
                  components: [
                    {classes: 'hb-meta-label', content: 'webOS'},
                    {name: 'webosReq', classes: 'hb-meta-value', content: ''},
                  ],
                },
                {
                  classes: 'hb-meta-row hb-meta-row-last',
                  components: [
                    {classes: 'hb-meta-label', content: 'Repository'},
                    {name: 'repoSource', classes: 'hb-meta-value', content: 'Official'},
                  ],
                },
              ],
            },
            {
              classes: 'hb-details-actions',
              components: [
                {
                  name: 'installButton',
                  kind: ProgressButton,
                  content: 'Install',
                  progress: 0,
                  classes: 'full-button hb-primary-btn',
                  minWidth: false,
                  ontap: 'installApp',
                  disabled: true,
                },
                {
                  name: 'launchButton',
                  kind: Button,
                  content: 'Launch',
                  classes: 'full-button hb-secondary-btn',
                  minWidth: false,
                  ontap: 'launchApp',
                  disabled: true,
                },
                {
                  name: 'uninstallButton',
                  kind: Button,
                  content: 'Uninstall',
                  classes: 'full-button hb-secondary-btn hb-danger-btn',
                  minWidth: false,
                  ontap: 'uninstallApp',
                  disabled: true,
                  small: true,
                },
                {
                  name: 'projectPage',
                  kind: Button,
                  content: 'Project Page',
                  classes: 'full-button hb-secondary-btn',
                  minWidth: false,
                  ontap: 'openProjectPage',
                  disabled: true,
                  small: true,
                },
              ],
            },
          ],
        },
        {
          kind: FittableRows,
          fit: true,
          classes: 'hb-details-main',
          components: [
            {
              classes: 'hb-details-tabs',
              components: [
                {kind: Button, name: 'tabDesc', content: 'Description', small: true, minWidth: false, classes: 'hb-category-btn hb-category-active', ontap: 'showDescTab'},
                {kind: Button, name: 'tabChangelog', content: 'Changelog', small: true, minWidth: false, classes: 'hb-category-btn', ontap: 'showChangelogTab'},
              ],
            },
            {
              fit: true,
              kind: Scroller,
              name: 'contentScroller',
              classes: 'hb-details-content-card',
              horizontal: 'hidden',
              spotlightPagingControls: true,
              components: [
                {
                  name: 'appDescription',
                  kind: BodyText,
                  classes: 'app-description',
                  content: 'No description provided for this package.',
                  allowHtml: true,
                  spotlight: true,
                },
                {
                  name: 'changelogContent',
                  kind: BodyText,
                  classes: 'app-description hb-changelog-body',
                  content: 'Loading changelog...',
                  allowHtml: true,
                  showing: false,
                  spotlight: true,
                },
              ],
            },
            {
              name: 'repoFooter',
              classes: 'hb-repo-footer',
              components: [
                {classes: 'hb-repo-footer-label', content: 'Repository:'},
                {name: 'repoFullUrl', classes: 'hb-repo-footer-url', content: ''},
              ],
            },
          ],
        },
      ],
    },

    {
      kind: LunaService,
      name: 'appInfoCall',
      service: 'luna://org.webosbrew.hbchannel.service',
      method: 'getAppInfo',
      onResponse: 'onAppInfoResponse',
      onError: 'onAppInfoError',
    },
    {
      kind: LunaService,
      name: 'installCall',
      service: 'luna://org.webosbrew.hbchannel.service',
      method: 'install',
      onResponse: 'onInstallResponse',
      onError: 'onInstallError',
      subscribe: true,
    },
    {
      kind: LunaService,
      name: 'uninstallCall',
      service: 'luna://org.webosbrew.hbchannel.service',
      method: 'uninstall',
      onResponse: 'onUninstallResponse',
      onError: 'onUninstallError',
    },
    {
      kind: LunaService,
      name: 'launchCall',
      service: 'luna://com.webos.applicationManager',
      method: 'launch',
      onResponse: 'onLaunchResponse',
      onError: 'onLaunchError',
    },
  ],
  bindings: [
    {from: 'model.iconUri', to: '$.headerImage.src'},
    {from: 'model.title', to: 'title'},
    {from: 'model.id', to: 'titleBelow', transform: 'subtitleID'},

    {from: 'packageInfo.title', to: 'title'},
    {from: 'packageInfo.id', to: 'titleBelow', transform: 'subtitleID'},
    {from: 'descriptionModel.content', to: '$.appDescription.content', transform: function (description) {
      var sanitized = DOMPurify.sanitize(description || '', {FORBID_TAGS: ['style', 'form', 'input', 'button']});
      return '<div class="rich-description">' + sanitized + '</div>';
    }},

    {from: 'packageInfo.version', to: '$.version.content', transform: 'version'},
    {from: 'appInfo', to: '$.version.content', transform: 'version'},

    {
      from: 'packageInfo.sourceUrl', to: '$.projectPage.disabled', transform: function (v) {
        return !(typeof v === 'string' && v.trim().length > 0);
      }
    },
    {
      from: 'packageInfo.rootRequired', to: '$.rootRequired.content', transform: function (value) {
        return value === true ? 'Yes' : value === false ? 'No' : value === 'optional' ? 'Optional' : 'Unknown';
      }
    },
    {
      from: 'packageInfo.ipkSize', to: '$.packageSize.content', transform: function (bytes) {
        if (typeof bytes !== 'number' || bytes <= 0) {
          return 'Unknown';
        }
        if (bytes >= 1048576) {
          return (bytes / 1048576).toFixed(1) + ' MB';
        }
        return Math.round(bytes / 1024) + ' KB';
      }
    },

    {
      from: 'packageInfo.status', to: '$.spinner.showing', transform: function () {
        return this.packageInfo.isBusy();
      }
    },
    {
      from: 'packageInfo.status', to: '$.errorPopup.showing', transform: function () {
        return this.packageInfo.isError();
      }
    },

    {
      from: 'appInfo', to: '$.installButton.content', transform: function (value) {
        if (!value) {
          return 'Install';
        }
        return 'Update';
      },
    },

    {from: 'appInfo', to: '$.installButton.disabled', transform: 'installDisabled'},
    {from: 'packageInfo.status', to: '$.installButton.disabled', transform: 'installDisabled'},

    {
      from: 'appInfo', to: '$.launchButton.disabled', transform: function (value) {
        return !value || this.model.get('id') == 'org.webosbrew.hbchannel';
      },
    },
    {
      from: 'appInfo', to: '$.uninstallButton.disabled', transform: function (value) {
        return !value || this.model.get('id') == 'org.webosbrew.hbchannel';
      },
    },
  ],

  appInfo: undefined,
  activeDetailTab: 'desc',
  _changelogFetchedFor: null,

  transitionFinished: function (evt) {
    if (!evt.isOffscreen) {
      this.refresh();
    }
  },

  subtitleID: function (id) {
    return id || '';
  },

  version: function () {
    var pkgver = (this.packageInfo && this.packageInfo.isReady()) ? this.packageInfo.get('version') : 'unknown';
    var localver = (this.appInfo && this.appInfo.version) ? this.appInfo.version : undefined;
    if (localver && localver != pkgver) {
      return pkgver + ' (installed: ' + localver + ')';
    }
    if (localver && localver == pkgver) {
      return pkgver + ' (installed)';
    }
    return pkgver;
  },

  installDisabled: function () {
    return this.appInfo === undefined || !this.packageInfo.isReady() || this.packageInfo.isError() || (this.appInfo !== null && this.appInfo.version === this.packageInfo.get('version'));
  },

  showDescTab: function () {
    this.activeDetailTab = 'desc';
    this.$.appDescription.set('showing', true);
    this.$.changelogContent.set('showing', false);
    this.$.tabDesc.addClass('hb-category-active');
    this.$.tabChangelog.removeClass('hb-category-active');
    this.$.contentScroller.setScrollTop(0);
    return true;
  },

  showChangelogTab: function () {
    this.activeDetailTab = 'changelog';
    this.$.appDescription.set('showing', false);
    this.$.changelogContent.set('showing', true);
    this.$.tabDesc.removeClass('hb-category-active');
    this.$.tabChangelog.addClass('hb-category-active');
    this.$.contentScroller.setScrollTop(0);
    return true;
  },

  loadChangelog: function () {
    if (!this.packageInfo || !this.packageInfo.isReady()) {
      return;
    }
    var appId = this.packageInfo.get('id') || this.model.get('id');
    if (this._changelogFetchedFor === appId) {
      return;
    }
    this._changelogFetchedFor = appId;

    var directNotes = this.packageInfo.get('changelog') || this.packageInfo.get('releaseNotes');
    if (typeof directNotes === 'string' && directNotes.trim().length > 0) {
      var cleanDirect = DOMPurify.sanitize(formatReleaseMarkdown(directNotes), {FORBID_TAGS: ['style', 'form', 'input', 'button']});
      this.$.changelogContent.set('content', '<div class="hb-release-entry"><div class="hb-release-header"><strong>v' + escapeHtml(this.packageInfo.get('version') || '') + '</strong></div>' + cleanDirect + '</div>');
      this.$.tabChangelog.set('content', 'Changelog');
      return;
    }

    var sourceUrl = this.packageInfo.get('sourceUrl');
    var gh = parseGithubRepo(sourceUrl);
    if (!gh) {
      this.$.changelogContent.set('content', '<p style="color:#9e9ea8;">No changelog available for this package.</p>');
      return;
    }

    this.$.changelogContent.set('content', '<p style="color:#9e9ea8;">Loading recent releases from GitHub...</p>');
    var self = this;
    var req = new Ajax({
      url: 'https://api.github.com/repos/' + encodeURIComponent(gh.owner) + '/' + encodeURIComponent(gh.repo) + '/releases?per_page=5',
      handleAs: 'json',
    });
    req.response(function (inSender, releases) {
      if (self.destroyed) {
        return;
      }
      if (!Array.isArray(releases) || releases.length === 0) {
        self.$.changelogContent.set('content', '<p style="color:#9e9ea8;">No GitHub releases published for this project yet.</p>');
        return;
      }
      var chunks = [];
      for (var i = 0; i < releases.length; i++) {
        var r = releases[i];
        var tag = r.tag_name || r.name || 'Release';
        var title = (r.name && r.name !== tag) ? (' — ' + r.name) : '';
        var dateStr = r.published_at ? r.published_at.substring(0, 10) : '';
        var bodyHtml = formatReleaseMarkdown(r.body || '');
        chunks.push(
          '<div class="hb-release-entry">' +
            '<div class="hb-release-header">' +
              '<span class="hb-release-tag">' + escapeHtml(tag) + '</span>' +
              '<span class="hb-release-title">' + escapeHtml(title) + '</span>' +
              (dateStr ? '<span class="hb-release-date">' + escapeHtml(dateStr) + '</span>' : '') +
            '</div>' +
            '<div class="hb-release-notes">' + bodyHtml + '</div>' +
          '</div>'
        );
      }
      var sanitized = DOMPurify.sanitize(chunks.join(''), {FORBID_TAGS: ['style', 'form', 'input', 'button']});
      self.$.changelogContent.set('content', sanitized);
      self.$.tabChangelog.set('content', 'Changelog (' + releases.length + ')');
    });
    req.error(function () {
      if (self.destroyed) {
        return;
      }
      self.$.changelogContent.set('content', '<p style="color:#9e9ea8;">Could not fetch GitHub releases (offline or rate-limited). Use Project Page to view releases in browser.</p>');
    });
    req.go();
  },

  refresh: function () {
    console.info('refresh');
    var reqs = this.model.get('requirements');
    if (reqs && reqs.webosRelease) {
      this.$.webosReq.set('content', reqs.webosRelease);
      this.$.webosReqRow.set('showing', true);
    } else {
      this.$.webosReqRow.set('showing', false);
    }
    var fullRepo = this.repositoryURL || 'https://repo.webosbrew.org/api/apps.json';
    var shortRepo = 'Official';
    if (!this.model.get('official')) {
      var hostMatch = fullRepo.match(/^https?:\/\/([^\/]+)/i);
      shortRepo = hostMatch ? hostMatch[1] : fullRepo;
    }
    this.$.repoSource.set('content', shortRepo);
    this.$.repoFullUrl.set('content', fullRepo);

    var self = this;
    if (this.model.get('manifest')) {
      this.set('packageInfo', new Model(this.model.get('manifest')));
      this.packageInfo.set('status', States.READY);
      this.loadChangelog();
    } else {
      this.set('packageInfo', new Model(undefined, {
        source: new AjaxSource(),
        url: resolveURL(this.model.get('manifestUrl'), this.repositoryURL),
      }));
      this.packageInfo.fetch({
        success: function (t) {
          t.set('status', t.status);
          self.loadChangelog();
        },
        error: function (t) {
          t.set('status', t.status);
        },
      });
    }

    if (this.model.get('fullDescriptionUrl')) {
      this.set('descriptionModel', new Model(undefined, {
        source: new AjaxSource(),
        options: {parse: true},
        url: resolveURL(this.model.get('fullDescriptionUrl'), this.repositoryURL),
        parse: function (data) {
          return {content: data || '<p>No description provided for this package.</p>'};
        },
      }));
      this.descriptionModel.fetch({
        handleAs: 'text',
        success: function (t) { t.set('status', t.status); },
        error: function (t) { t.set('status', t.status); },
      });
    } else {
      this.set('descriptionModel', new Model({content: this.model.get('shortDescription') || '<p>No description provided for this package.</p>'}));
      this.descriptionModel.set('status', States.READY);
    }

    this.$.appInfoCall.send({id: this.model.get('id')});
  },
  openProjectPage: function () {
    if (this.packageInfo && this.packageInfo.get('sourceUrl')) {
      this.$.launchCall.send({id: 'com.webos.app.browser', params: {target: this.packageInfo.get('sourceUrl')}});
    }
  },
  installApp: function () {
    console.info('installApp...');
    this.installRequest = this.$.installCall.send({
      ipkUrl: resolveURL(this.packageInfo.get('ipkUrl'), this.model.get('manifestUrl') || this.repositoryURL),
      ipkHash: this.packageInfo.get('ipkHash').sha256,
      id: this.model.get('id'),
      subscribe: true,
    });
    this.$.installButton.set('disabled', true);
  },
  launchApp: function () {
    this.$.launchCall.send({id: this.model.get('id')});
  },
  uninstallApp: function () {
    this.$.uninstallCall.send({id: this.model.get('id')});
    this.$.uninstallButton.set('disabled', false);
  },

  onInstallResponse: function (sender, msg) {
    console.info('installResponse:', msg, msg.finished, msg.statusText);
    if (msg.progress !== undefined && msg.progress < 99) {
      this.$.installButton.animateProgressTo(msg.progress);
    } else if (msg.finished) {
      this.$.installButton.set('progress', 100);
      this.$.installButton.set('disabled', false);
      this.$.installCall.cancel(this.installRequest);
      this.appInfoRequest = this.$.appInfoCall.send({id: this.model.get('id')});
    }
  },

  showError: function (msg, operation) {
    console.info('install error:', msg);
    var errorMessage = 'An error occured during ' + operation + ': ' + msg.errorText;
    if (msg.errorText && msg.errorText.indexOf('luna-send-pub') != -1 && msg.errorText.indexOf('ECONNREFUSED') != -1) {
      errorMessage += '<br /><br />If you just updated Homebrew Channel app you may need to perform a reboot.';
    }
    this.$.errorPopup.setContent(DOMPurify.sanitize(errorMessage));
    this.$.errorPopup.show();
  },

  onInstallError: function (sender, msg) {
    this.showError(msg, 'installation');
    this.$.installButton.set('progress', 0);
    this.$.installButton.set('disabled', false);
    this.$.installCall.cancel(this.installRequest);
  },

  onUninstallResponse: function () {
    this.$.appInfoCall.send({id: this.model.get('id')});
  },

  onUninstallError: function (sender, msg) {
    this.showError(msg, 'removal');
    this.$.appInfoCall.send({id: this.model.get('id')});
  },

  onAppInfoResponse: function (sender, msg) {
    if (msg.appInfo) {
      this.set('appInfo', msg.appInfo);
    } else {
      this.set('appInfo', null);
    }
  },
  onAppInfoError: function () {
    this.set('appInfo', null);
  },

  onLaunchResponse: function (sender, msg) {
    console.info('launch response:', msg);
  },

  onLaunchError: function (sender, msg) {
    console.warn('launch error:', msg);
  },

  onKeyUp: function (sender, evt) {
    // Remote button "5"
    if (evt.keyCode == 53) {
      this.$.installButton.set('disabled', false);
      this.$.installButton.set('content', 'Reinstall');
    }
  }
});
