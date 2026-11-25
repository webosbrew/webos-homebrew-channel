var
  kind = require('enyo/kind'),
  Model = require('enyo/Model'),
  DetailsPanel = require('./DetailsPanel'),
  Overlay = require('moonstone/Overlay'),
  Item = require('moonstone/Item'),
  Button = require('moonstone/Button'),
  IconButton = require('moonstone/IconButton'),
  Scroller = require('moonstone/Scroller'),
  MoonImage = require('moonstone/Image'),
  EnyoImage = require('enyo/Image'),
  Marquee = require('moonstone/Marquee'),
  Panel = require('moonstone/Panel'),
  Source = require('enyo/Source'),
  Popup = require('moonstone/Popup'),
  Dialog = require('moonstone/Dialog'),
  Spinner = require('moonstone/Spinner'),
  DataGridList = require('moonstone/DataGridList'),
  GridListImageItem = require('moonstone/GridListImageItem'), // FIXME: we use styles from that :/
  AjaxSource = require('enyo/AjaxSource'),
  Ajax = require('enyo/Ajax'),
  Collection = require('enyo/Collection'),
  LunaService = require('enyo-webos/LunaService'),
  ConfigUtils = require('../configutils.js'),
  resolveURL = require('../baseurl').resolveURL,
  SettingsPanel = require('./SettingsPanel.js');

function versionHigher(oldVer, newVer) {
  if (typeof oldVer !== 'string' || typeof newVer !== 'string') {
    return false;
  }
  var cleanOld = oldVer.replace(/^v/i, '').split('-')[0];
  var cleanNew = newVer.replace(/^v/i, '').split('-')[0];
  var oldParts = cleanOld.split('.');
  var newParts = cleanNew.split('.');
  var len = Math.max(oldParts.length, newParts.length);
  for (var i = 0; i < len; i++) {
    var a = parseInt(newParts[i], 10) || 0;
    var b = parseInt(oldParts[i], 10) || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

// TODO: Support pagniation https://repo.webosbrew.org/api/apps/{page}.json
// Page starts with 1

var RepoPackageModel = kind({
  kind: Model,
  name: "RepoPackageModel",
  primaryKey: "uid",
});

var NestedSource = kind({
  kind: Source,
  name: 'NestedSource',
  collection: null,
  fetch: function (model, opts) {
    console.info('NestedSource.fetch()', model, opts, this.collection);
    this.collection.fetch({
      success: function(col, _, result) {
        console.info('nested success:', result, col);
        if (result.length === 1 && result[0].attributes.repository === null) {
          col.errorCode = '600';
          opts.error([], '600');
        } else {
          opts.success(result);
        }
      },
      error: function(col, state, next, errorCode) {
        console.info('nested error:', arguments, this);
        col.errorCode = errorCode;
        opts.error([], errorCode);
      },
    });
  },
});

var AppListItem = kind({
  name: 'AppListItem',
  kind: Item,
  classes: 'moon-gridlist-imageitem horizontal-gridList-item horizontal-gridList-image-item', //  moon-imageitem',
  mixins: [Overlay.Support, Overlay.Selection],

  components: [
    {
      kind: MoonImage,
      name: 'img',
      // placeholder: EnyoImage.placeholder,
      style: 'width: 4.25rem; height: 4.25rem; float: left; padding-right: 1rem; padding-top: 0.25rem',
      sizing: 'contain',
    },
    {name: 'caption', classes: 'caption', kind: Marquee.Text},
    {name: 'subCaption', classes: 'sub-caption', kind: Marquee.Text},
    {name: 'statusBadge', classes: 'hb-badge', showing: false},
  ],
  published: {
    caption: '',
    subCaption: '',
  },

  bindings: [
    {from: 'model.title', to: '$.caption.content'},
    {from: 'model.id', to: '$.subCaption.content'},
    {from: 'model.iconUri', to: '$.img.src'},
    {from: 'model.statusBadgeText', to: '$.statusBadge.content'},
    {from: 'model.statusBadgeText', to: '$.statusBadge.showing', transform: function (v) { return Boolean(v); }},
    {from: 'model.updateAvailable', to: '$.statusBadge.classes', transform: function (isUpdate) {
      return isUpdate ? 'hb-badge hb-badge-update' : 'hb-badge hb-badge-installed';
    }},
  ]
});

module.exports = kind({
  name: 'BrowserPanel',
  kind: Panel,
  title: 'Homebrew Channel',
  titleBelow: 'webosbrew.org',
  headerType: 'medium',
  headerComponents: [
    {kind: Button, name: 'updateAllButton', content: 'Update All', small: true, minWidth: false, showing: false, classes: 'hb-update-all-btn', ontap: 'showUpdateAllDialog'},
    {kind: IconButton, icon: 'rollbackward', ontap: 'refresh'},
    {kind: IconButton, icon: 'gear', ontap: 'openSettings'},
  ],
  components: [
    {kind: Spinner, name: 'spinner', content: 'Loading...', center: true, middle: true},
    {kind: Popup, name: 'errorPopup', content: 'An error occured while downloading some repositories.', modal: false, autoDismiss: true, allowBackKey: true},
    {
      name: 'updateAllDialog',
      kind: Dialog,
      animate: false,
      title: 'App Updates Available',
      subTitle: '',
      message: '',
      allowBackKey: true,
      components: [
        {kind: Button, name: 'confirmUpdateAllBtn', content: 'Update All', ontap: 'startUpdateAll'},
        {kind: Button, name: 'cancelUpdateAllBtn', content: 'Close', ontap: 'closeUpdateAllDialog'},
      ],
    },
    {
      name: 'appList', selection: false, fit: true, spacing: 20, minWidth: 500, minHeight: 120, kind: DataGridList, scrollerOptions: {kind: Scroller, vertical: 'scroll', horizontal: 'hidden', spotlightPagingControls: true}, components: [
        {kind: AppListItem}
      ], ontap: 'itemSelected',
    },
    {kind: LunaService, name: 'updateStartupScript', service: 'luna://org.webosbrew.hbchannel.service', method: 'updateStartupScript'},
    {kind: LunaService, name: 'autostart', service: 'luna://org.webosbrew.hbchannel.service', method: 'autostart'},
    {kind: LunaService, name: 'listAppsCall', service: 'luna://org.webosbrew.hbchannel.service', method: 'listApps', onResponse: 'onListAppsResponse', onError: 'onListAppsError'},
    {kind: LunaService, name: 'notifyCall', service: 'luna://org.webosbrew.hbchannel.service', method: 'notify'},
    {kind: LunaService, name: 'batchInstallCall', service: 'luna://org.webosbrew.hbchannel.service', method: 'install', subscribe: true, onResponse: 'onBatchInstallResponse', onError: 'onBatchInstallError'},
  ],
  bindings: [
    {from: 'repository', to: '$.appList.collection'},
    {
      from: 'repository.status', to: '$.spinner.showing', transform: function (value) {
        return this.repository.isBusy() && !this.repository.isError();
      }
    },
    {
      from: 'repository.status', to: '$.errorPopup.showing', transform: function (value) {
        return this.repository.isError();
      }
    },
    {
      from: 'repository.status', to: '$.errorPopup.content', transform: function (value) {
        var statusList = this.repository.source ? this.repository.source.filter(function(s) { return s.collection.errorCode !== undefined; }).map(function(s) { console.info(s.collection); return s.collection.url + ' (' + s.collection.errorCode + ')'; }).filter(Boolean).join(', ') : '';
        return 'An error occured while downloading some repositories:\n'+statusList;
      }
    },
  ],
  installedAppsMap: null,
  availableUpdates: null,
  _notifiedUpdateKey: null,
  _batchQueue: null,
  _batchIndex: 0,
  _batchSucceeded: 0,
  _batchFailed: null,
  _batchRequest: null,
  _batchRunning: false,

  create: function () {
    this.inherited(arguments);
    this.installedAppsMap = {};
    this.availableUpdates = [];
    this.refresh();

    this.$.updateStartupScript.send({});
    this.$.autostart.send({});
  },

  transitionFinished: function (evt) {
    if (!evt.isOffscreen) {
      console.info('transitionFinished:', evt);
      this.refresh();
    }
  },

  refresh: function () {
    console.info('refresh');

    this.loadRepositories(ConfigUtils.getRepositories());
    if (ConfigUtils.getConfig().autoCheckUpdates !== false) {
      this.checkInstalledApps();
    }
  },

  checkInstalledApps: function () {
    this.$.listAppsCall.send({});
  },

  onListAppsResponse: function (sender, msg) {
    var map = {};
    if (msg && Array.isArray(msg.apps)) {
      for (var i = 0; i < msg.apps.length; i++) {
        var app = msg.apps[i];
        if (app && app.id) {
          map[app.id] = app;
        }
      }
    }
    this.installedAppsMap = map;
    this.evaluateUpdates();
  },

  onListAppsError: function (sender, msg) {
    console.warn('listApps failed:', msg);
  },

  evaluateUpdates: function () {
    if (!this.repository || !this.repository.models) {
      return;
    }
    var updatesById = {};
    var updates = [];
    var installedMap = this.installedAppsMap || {};

    for (var i = 0; i < this.repository.models.length; i++) {
      var model = this.repository.models[i];
      var id = model.get('id');
      var local = installedMap[id];
      var manifest = model.get('manifest');
      var remoteVer = manifest && manifest.version ? manifest.version : null;

      if (local) {
        var isNewer = Boolean(remoteVer && local.version && versionHigher(local.version, remoteVer));
        model.set('installed', true);
        model.set('installedVersion', local.version || '');
        model.set('updateAvailable', isNewer);
        model.set('statusBadgeText', isNewer ? ('UPDATE ' + remoteVer) : 'INSTALLED');

        if (isNewer && !updatesById[id]) {
          updatesById[id] = true;
          updates.push({
            id: id,
            title: model.get('title') || id,
            installedVersion: local.version,
            remoteVersion: remoteVer,
            model: model,
          });
        }
      } else {
        model.set('installed', false);
        model.set('installedVersion', '');
        model.set('updateAvailable', false);
        model.set('statusBadgeText', '');
      }
    }

    // Always schedule Homebrew Channel self-update last so its service restart does not interrupt other updates.
    updates.sort(function (a, b) {
      if (a.id === 'org.webosbrew.hbchannel') return 1;
      if (b.id === 'org.webosbrew.hbchannel') return -1;
      return a.title.localeCompare(b.title);
    });

    this.availableUpdates = updates;
    if (updates.length > 0) {
      this.$.updateAllButton.set('content', 'Update All (' + updates.length + ')');
      this.$.updateAllButton.set('showing', true);
      this.set('titleBelow', 'webosbrew.org • ' + updates.length + ' update' + (updates.length === 1 ? '' : 's') + ' available');

      var notifyKey = updates.map(function (u) { return u.id + '@' + u.remoteVersion; }).join(',');
      if (this._notifiedUpdateKey !== notifyKey) {
        this._notifiedUpdateKey = notifyKey;
        this.$.notifyCall.send({
          message: 'Homebrew Channel: ' + updates.length + ' app update' + (updates.length === 1 ? '' : 's') + ' available',
        });
      }
    } else {
      this.$.updateAllButton.set('showing', false);
      this.set('titleBelow', 'webosbrew.org');
    }
  },

  showUpdateAllDialog: function () {
    if (!this.availableUpdates || this.availableUpdates.length === 0) {
      return true;
    }
    var lines = this.availableUpdates.map(function (u) {
      return u.title + ': ' + u.installedVersion + ' -> ' + u.remoteVersion;
    });
    this.$.updateAllDialog.set('title', 'Update All (' + this.availableUpdates.length + ')');
    this.$.updateAllDialog.set('subTitle', 'The following installed apps have updates:');
    this.$.updateAllDialog.set('message', lines.join('\n'));
    this.$.confirmUpdateAllBtn.set('disabled', false);
    this.$.confirmUpdateAllBtn.set('showing', true);
    this.$.cancelUpdateAllBtn.set('disabled', false);
    this.$.updateAllDialog.set('allowBackKey', true);
    this.$.updateAllDialog.show();
    return true;
  },

  closeUpdateAllDialog: function () {
    if (this._batchRunning) {
      return true;
    }
    this.$.updateAllDialog.hide();
    return true;
  },

  startUpdateAll: function () {
    if (this._batchRunning || !this.availableUpdates || this.availableUpdates.length === 0) {
      return true;
    }
    this._batchRunning = true;
    this._batchQueue = this.availableUpdates.slice();
    this._batchIndex = 0;
    this._batchSucceeded = 0;
    this._batchFailed = [];
    this.$.confirmUpdateAllBtn.set('disabled', true);
    this.$.confirmUpdateAllBtn.set('showing', false);
    this.$.cancelUpdateAllBtn.set('disabled', true);
    this.$.updateAllDialog.set('allowBackKey', false);
    this.runNextBatchUpdate();
    return true;
  },

  runNextBatchUpdate: function () {
    if (this._batchIndex >= this._batchQueue.length) {
      this._batchRunning = false;
      this.$.cancelUpdateAllBtn.set('disabled', false);
      this.$.updateAllDialog.set('allowBackKey', true);
      var summary = 'Updated ' + this._batchSucceeded + ' of ' + this._batchQueue.length + ' app(s).';
      if (this._batchFailed.length > 0) {
        summary += '\nFailed:\n' + this._batchFailed.join('\n');
      }
      this.$.updateAllDialog.set('subTitle', 'Updates complete');
      this.$.updateAllDialog.set('message', summary);
      this.checkInstalledApps();
      return;
    }

    var item = this._batchQueue[this._batchIndex];
    var step = (this._batchIndex + 1) + '/' + this._batchQueue.length;
    this.$.updateAllDialog.set('subTitle', 'Updating ' + step + ': ' + item.title);
    this.$.updateAllDialog.set('message', 'Preparing download...');

    var manifest = item.model.get('manifest');
    var repoUrl = item.model.get('repository');
    var manifestUrl = item.model.get('manifestUrl');
    if (manifest && manifest.ipkUrl && manifest.ipkHash && manifest.ipkHash.sha256) {
      this.dispatchBatchInstall(item, manifest, manifestUrl || repoUrl);
    } else if (manifestUrl) {
      var self = this;
      var req = new Ajax({url: resolveURL(manifestUrl, repoUrl), handleAs: 'json'});
      req.response(function (inSender, data) {
        if (data && data.ipkUrl && data.ipkHash && data.ipkHash.sha256) {
          self.dispatchBatchInstall(item, data, manifestUrl);
        } else {
          self._batchFailed.push(item.title + ': invalid manifest');
          self._batchIndex++;
          self.runNextBatchUpdate();
        }
      });
      req.error(function () {
        self._batchFailed.push(item.title + ': failed to fetch manifest');
        self._batchIndex++;
        self.runNextBatchUpdate();
      });
      req.go();
    } else {
      this._batchFailed.push(item.title + ': missing manifest URL');
      this._batchIndex++;
      this.runNextBatchUpdate();
    }
  },

  dispatchBatchInstall: function (item, manifest, baseUrl) {
    this._batchRequest = this.$.batchInstallCall.send({
      ipkUrl: resolveURL(manifest.ipkUrl, baseUrl),
      ipkHash: manifest.ipkHash.sha256,
      id: item.id,
      subscribe: true,
    });
  },

  onBatchInstallResponse: function (sender, msg) {
    if (!this._batchRunning) {
      return;
    }
    var item = this._batchQueue[this._batchIndex];
    if (msg.progress !== undefined && msg.progress < 99) {
      this.$.updateAllDialog.set('message', (msg.statusText || 'Downloading...') + ' (' + Math.round(msg.progress) + '%)');
    } else if (msg.statusText && !msg.finished) {
      this.$.updateAllDialog.set('message', msg.statusText);
    }
    if (msg.finished) {
      if (this._batchRequest) {
        this.$.batchInstallCall.cancel(this._batchRequest);
        this._batchRequest = null;
      }
      this._batchSucceeded++;
      this._batchIndex++;
      this.runNextBatchUpdate();
    }
  },

  onBatchInstallError: function (sender, msg) {
    if (!this._batchRunning) {
      return;
    }
    var item = this._batchQueue[this._batchIndex];
    if (this._batchRequest) {
      this.$.batchInstallCall.cancel(this._batchRequest);
      this._batchRequest = null;
    }
    this._batchFailed.push((item ? item.title : 'App') + ': ' + ((msg && msg.errorText) || 'install failed'));
    this._batchIndex++;
    this.runNextBatchUpdate();
  },

  loadRepositories: function (repos) {
    console.info('Loading from:', repos);
    if (repos.length === 0) {
      this.set('repository', new Collection([]));
      this.evaluateUpdates();
    } else {
      var self = this;
      var col = new Collection({
        model: RepoPackageModel,
        source: repos.map(function (url) {
          return new NestedSource({
            collection: new Collection({
              model: RepoPackageModel,
              url: url,
              source: new AjaxSource(),
              options: {parse: true},
              parse: function (data) {
                try {
                  if (data && data.packages) {
                    data.packages.forEach(function (element) {
                      element.uid = element.id + '|' + url;
                      element.repository = url;
                      element.official = url === ConfigUtils.repositoryBaseURL;
                    });
                    return data.packages;
                  }
                } catch (err) { console.warn('parsing failed', err, arguments, this); }

                // This is very dirty. We don't have a way of indicating an
                // invalid repository to NestedResource. Since uid is generated
                // by our code, let's just assume `null` uid is an indicator of
                // a failed parse...
                return [{repository: null}];
              },
            }),
          });
        }),
      });
      col.on('add', function () { self.evaluateUpdates(); });
      col.on('reset', function () { self.evaluateUpdates(); });
      this.set('repository', col);
      this.repository.fetch({
        success: function () { self.evaluateUpdates(); },
      });
    }
  },

  events: {
    onRequestPushPanel: ''
  },
  itemSelected: function (sender, ev) {
    if (ev.model) {
      this.doRequestPushPanel({panel: {kind: DetailsPanel, model: ev.model, repositoryURL: ev.model.get('repository')}});
    }
  },
  openSettings: function (sender, ev) {
    this.doRequestPushPanel({
      panel: {
        kind: SettingsPanel,
      }
    });
  },
});
