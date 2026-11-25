// One app, as a tile: its icon with a status badge beside it, then title, version and size. In Limestone's colors:
// a translucent fill at rest; focused, the tile turns white with dark text and grows slightly.

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control'),
  EnyoImage = require('enyo/Image'),
  util = require('../util.js'),
  repository = require('../repository.js');

var BADGES = {
  update: {label: 'Update', classes: 'hb-chip hb-badge hb-chip-amber'},
  installed: {label: 'Installed', classes: 'hb-chip hb-badge hb-chip-green'},
  root: {label: 'Root', classes: 'hb-chip hb-badge hb-chip-rose'},
};

module.exports = kind({
  name: 'hb.AppCard',
  kind: Control,
  spotlight: true,
  classes: 'hb-card',
  attributes: {role: 'link'},

  // The repository package entry, and what is known about the installed copy (null: not installed).
  app: null,
  installedVersion: null,

  components: [
    {classes: 'hb-card-top', components: [
      {name: 'icon', kind: EnyoImage, classes: 'hb-card-icon', alt: ''},
      {name: 'badge', tag: 'span', showing: false},
    ]},
    {name: 'title', classes: 'hb-card-title'},
    {name: 'meta', classes: 'hb-card-meta'},
  ],

  create: function () {
    this.inherited(arguments);
    this.refresh();
  },

  setInstalledVersion: function (version) {
    this.installedVersion = version;
    this.refresh();
  },

  badgeKind: function () {
    var app = this.app || {};
    var available = repository.availableVersion(app);
    if (this.installedVersion) {
      return util.versionHigher(this.installedVersion, available) ? 'update' : 'installed';
    }
    var manifest = app.manifest || {};
    return manifest.rootRequired === true ? 'root' : null;
  },

  refresh: function () {
    var app = this.app || {};
    var manifest = app.manifest || {};
    this.$.icon.set('src', app.iconUri || 'assets/icon130.png');
    this.$.title.set('content', app.title || app.id);

    var meta = [];
    if (manifest.version) meta.push('v' + manifest.version);
    var size = util.formatSize(manifest.ipkSize);
    if (size) meta.push(size);
    if (!app.official) meta.push(repository.repositoryHost(app.repository));
    this.$.meta.set('content', meta.join(' · ') || app.id);

    var badge = BADGES[this.badgeKind()];
    this.$.badge.set('showing', !!badge);
    if (badge) {
      this.$.badge.set('content', badge.label);
      this.$.badge.set('classes', badge.classes);
    }
    this.setAttribute('aria-label', (app.title || app.id) + (badge ? ', ' + badge.label : ''));
  },
});
