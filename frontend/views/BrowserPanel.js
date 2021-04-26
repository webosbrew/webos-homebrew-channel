var
  kind = require('enyo/kind'),
  DetailsPanel = require('./DetailsPanel'),
  Overlay = require('moonstone/Overlay'),
  Item = require('moonstone/Item'),
  IconButton = require('moonstone/IconButton'),
  Scroller = require('moonstone/Scroller'),
  MoonImage = require('moonstone/Image'),
  EnyoImage = require('enyo/Image'),
  Marquee = require('moonstone/Marquee'),
  Panel = require('moonstone/Panel'),
  Popup = require('moonstone/Popup'),
  Spinner = require('moonstone/Spinner'),
  DataGridList = require('moonstone/DataGridList'),
  GridListImageItem = require('moonstone/GridListImageItem'), // FIXME: we use styles from that :/
  AjaxSource = require('enyo/AjaxSource'),
  Collection = require('enyo/Collection'),
  SettingsPanel = require('./SettingsPanel.js');

// TODO: Support pagniation https://repo.webosbrew.org/api/apps/{page}.json
// Page starts with 1
var repositoryBaseURL = 'https://repo.webosbrew.org/api/apps.json';

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
    {kind: Popup, name: 'errorPopup', content: 'An error occured while downloading repository.', modal: false, autoDismiss: true, allowBackKey: true},
    {
      name: 'appList', selection: false, fit: true, spacing: 20, minWidth: 500, minHeight: 120, kind: DataGridList, scrollerOptions: {kind: Scroller, vertical: 'scroll', horizontal: 'hidden', spotlightPagingControls: true}, components: [
        {kind: AppListItem}
      ], ontap: 'itemSelected',
    },
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
  ],
  create: function () {
    this.inherited(arguments);
    this.refresh();
  },
  refresh: function () {
    console.info('refresh');
    this.set('repository', new Collection({
      source: new AjaxSource(),
      url: repositoryBaseURL,
      options: {parse: true},
      parse: function (data) {
        return data.packages;
      },
    }));
    this.repository.fetch();
  },
  events: {
    onRequestPushPanel: ''
  },
  itemSelected: function (sender, ev) {
    if (ev.model) {
      this.doRequestPushPanel({panel: {kind: DetailsPanel, model: ev.model, repositoryURL: repositoryBaseURL}});
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

