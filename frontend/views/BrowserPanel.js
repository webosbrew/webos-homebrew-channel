var
  kind = require('enyo/kind'),
  Model = require('enyo/Model'),
  DetailsPanel = require('./DetailsPanel'),
  Overlay = require('moonstone/Overlay'),
  Item = require('moonstone/Item'),
  IconButton = require('moonstone/IconButton'),
  Scroller = require('moonstone/Scroller'),
  MoonImage = require('moonstone/Image'),
  EnyoImage = require('enyo/Image'),
  Marquee = require('moonstone/Marquee'),
  Panel = require('moonstone/Panel'),
  Source = require('enyo/Source'),
  Popup = require('moonstone/Popup'),
  Spinner = require('moonstone/Spinner'),
  DataGridList = require('moonstone/DataGridList'),
  GridListImageItem = require('moonstone/GridListImageItem'), // FIXME: we use styles from that :/
  AjaxSource = require('enyo/AjaxSource'),
  Ajax = require('enyo/Ajax'),
  Collection = require('enyo/Collection'),
  LunaService = require('enyo-webos/LunaService'),
  ConfigUtils = require('../configutils.js'),
  SettingsPanel = require('./SettingsPanel.js');

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
      style: 'width: 100px; height: 100px; float: left; padding-right: 20px; padding-top: 5px',
      sizing: 'contain',
    },
    {name: 'caption', classes: 'caption', kind: Marquee.Text},
    {name: 'subCaption', classes: 'sub-caption', kind: Marquee.Text},
  ],
  published: {
    caption: '',
    subCaption: '',
  },

  bindings: [
    {from: 'model.title', to: '$.caption.content'},
    {from: 'model.id', to: '$.subCaption.content'},
    {from: 'model.iconUri', to: '$.img.src'},
  ]
});

module.exports = kind({
  name: 'BrowserPanel',
  kind: Panel,
  title: 'Homebrew Channel',
  titleBelow: 'webosbrew.org',
  headerType: 'medium',
  headerComponents: [
    {kind: IconButton, icon: 'rollbackward', ontap: 'refresh'},
    {kind: IconButton, icon: 'gear', ontap: 'openSettings'},
  ],
  components: [
    {kind: Spinner, name: 'spinner', content: 'Loading...', center: true, middle: true},
    {kind: Popup, name: 'errorPopup', content: 'An error occured while downloading some repositories.', modal: false, autoDismiss: true, allowBackKey: true},
    {
      name: 'appList', selection: false, fit: true, spacing: 20, minWidth: 500, minHeight: 120, kind: DataGridList, scrollerOptions: {kind: Scroller, vertical: 'scroll', horizontal: 'hidden', spotlightPagingControls: true}, components: [
        {kind: AppListItem}
      ], ontap: 'itemSelected',
    },
    {kind: LunaService, name: 'updateStartupScript', service: 'luna://org.webosbrew.hbchannel.service', method: 'updateStartupScript'},
    {kind: LunaService, name: 'autostart', service: 'luna://org.webosbrew.hbchannel.service', method: 'autostart'},
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
  create: function () {
    this.inherited(arguments);
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
  },

  loadRepositories: function (repos) {
    console.info('Loading from:', repos);
    if (repos.length === 0) {
      this.set('repository', new Collection([]));
    } else {
      this.set('repository', new Collection({
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
      }));
      this.repository.fetch();
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
