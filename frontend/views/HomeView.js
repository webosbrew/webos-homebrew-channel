// The home page: the repositories' apps, with tabs for installed apps and pending updates, search, and a featured
// app (the first pending update, otherwise a daily pick from the official repository).

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control'),
  EnyoImage = require('enyo/Image'),
  Input = require('enyo/Input'),
  Spotlight = require('spotlight'),
  Button = require('../components/Button.js'),
  AppCard = require('../components/AppCard.js'),
  Scroller = require('../components/Scroller.js'),
  ConfigUtils = require('../configutils.js'),
  repository = require('../repository.js'),
  icons = require('../icons.js'),
  util = require('../util.js'),
  DetailsView = require('./DetailsView.js'),
  SettingsView = require('./SettingsView.js');

var SERVICE = 'luna://org.webosbrew.hbchannel.service/';

var Tab = kind({
  name: 'hb.Tab',
  kind: Control,
  spotlight: true,
  classes: 'hb-tab',
  attributes: {role: 'tab'},
  tab: '',
  components: [
    {name: 'labelNode', tag: 'span'},
    {name: 'countNode', tag: 'span', classes: 'hb-tab-count', showing: false},
  ],
  create: function () {
    this.inherited(arguments);
    this.$.labelNode.set('content', this.label);
  },
  setCount: function (count, alert) {
    this.$.countNode.set('showing', count > 0);
    this.$.countNode.set('content', String(count));
    this.$.countNode.addRemoveClass('hb-tab-count-alert', !!alert);
  },
  setActive: function (active) {
    this.addRemoveClass('active', active);
    this.setAttribute('aria-selected', active ? 'true' : 'false');
  },
});

// The search box: OK starts typing (on a TV, that opens the on-screen keyboard), OK or Back on the keyboard ends it.
var SearchBox = kind({
  name: 'hb.SearchBox',
  kind: Control,
  spotlight: true,
  classes: 'hb-search hb-glass',
  events: {
    onSearch: '',
  },
  handlers: {
    ontap: 'startEditing',
    onSpotlightBlur: 'stopEditing',
  },
  components: [
    {tag: 'span', allowHtml: true, content: icons.search},
    // A plain text input: type=search adds a native clear button and behaves differently across old TV engines.
    {name: 'input', kind: Input, type: 'text', placeholder: 'Search apps', attributes: {'aria-label': 'Search apps'},
      oninput: 'inputChanged', onkeydown: 'inputKeyDown', onblur: 'inputBlurred'},
  ],
  startEditing: function () {
    if (this.editing) return true;
    this.editing = true;
    // While typing, Left/Right move the caret and Enter ends typing; Spotlight leaves them alone. Key events come from
    // the input, so it carries the list too.
    this.$.input.spotlightIgnoredKeys = this.spotlightIgnoredKeys = [13, 37, 39];
    // After the key that started typing has been handled; focusing during it does not stick.
    var input = this.$.input;
    setTimeout(function () {
      if (input.hasNode()) input.node.focus();
    }, 0);
    return true;
  },
  stopEditing: function () {
    if (!this.editing) return;
    this.editing = false;
    this.$.input.spotlightIgnoredKeys = this.spotlightIgnoredKeys = null;
    if (this.$.input.hasNode()) this.$.input.node.blur();
  },
  inputKeyDown: function (sender, event) {
    if (event.keyCode === 13) {
      // The box keeps Spotlight focus; spotting it again would put the caret back in the input.
      this.stopEditing();
      this.ignoreEnterKeyUp();
      return true;
    }
  },
  // Spotlight acts on the key-up of OK, which would start typing again right away.
  ignoreEnterKeyUp: function () {
    this.$.input.spotlightIgnoredKeys = this.spotlightIgnoredKeys = [13];
    var self = this;
    setTimeout(function () {
      if (!self.editing) self.$.input.spotlightIgnoredKeys = self.spotlightIgnoredKeys = null;
    }, 400);
  },
  inputBlurred: function () {
    this.editing = false;
    this.$.input.spotlightIgnoredKeys = this.spotlightIgnoredKeys = null;
  },
  inputChanged: function () {
    this.doSearch({query: this.$.input.getValue()});
  },
});

module.exports = kind({
  name: 'hb.HomeView',
  kind: Control,
  classes: 'hb-page',
  spotlight: 'container',
  title: 'Homebrew Channel',

  events: {
    onRequestPushPanel: '',
  },

  components: [
    {classes: 'hb-header', components: [
      {classes: 'hb-header-left', components: [
        {kind: EnyoImage, src: 'assets/icon160.png', classes: 'hb-brand-icon', alt: ''},
        {components: [
          {classes: 'hb-brand-title', content: 'Homebrew Channel'},
          {name: 'subtitle', classes: 'hb-brand-subtitle', content: 'Loading repositories…'},
        ]},
      ]},
      {name: 'tabs', classes: 'hb-tabs hb-glass hb-blur', spotlight: 'container', attributes: {role: 'tablist'}, components: [
        {name: 'tabDiscover', kind: Tab, tab: 'discover', label: 'Discover', ontap: 'selectTab'},
        {name: 'tabInstalled', kind: Tab, tab: 'installed', label: 'Installed', ontap: 'selectTab'},
        {name: 'tabUpdates', kind: Tab, tab: 'updates', label: 'Updates', ontap: 'selectTab'},
        {name: 'tabSettings', kind: Tab, tab: 'settings', label: 'Settings', ontap: 'openSettings'},
      ]},
      {classes: 'hb-header-right', components: [
        {name: 'search', kind: SearchBox, onSearch: 'searchChanged'},
        {name: 'refreshButton', kind: Button, iconOnly: true, icon: icons.refresh, label: 'Refresh repositories', classes: 'hb-glass hb-blur', ontap: 'reload'},
      ]},
    ]},

    {name: 'scroller', kind: Scroller, components: [
      // Repositories that failed to load: at the top, where it is seen.
      {name: 'notice', classes: 'hb-notice', showing: false, attributes: {role: 'alert'}, style: 'margin: 0 0 24px'},
      // A Spotlight container, so that Up from anywhere in the grid lands on its main button.
      {name: 'hero', classes: 'hb-hero hb-glass hb-blur', showing: false, spotlight: 'container', defaultSpotlightControl: 'heroAction',
        attributes: {role: 'region', 'aria-label': 'Featured app'}, components: [
        {name: 'heroIcon', kind: EnyoImage, classes: 'hb-hero-icon', alt: ''},
        {classes: 'hb-hero-body', components: [
          {name: 'heroLabel', classes: 'hb-hero-label'},
          {name: 'heroTitle', tag: 'h1', classes: 'hb-hero-title'},
          {name: 'heroText', tag: 'p', classes: 'hb-hero-text'},
          {name: 'heroChips'},
        ]},
        {classes: 'hb-hero-actions', components: [
          {name: 'heroAction', kind: Button, variant: 'primary', icon: icons.download, label: 'Install', ontap: 'heroActionTapped'},
          {name: 'heroDetails', kind: Button, label: 'Details', ontap: 'heroDetailsTapped'},
        ]},
      ]},

      {classes: 'hb-section-head', components: [
        {name: 'sectionTitle', tag: 'h2', classes: 'hb-section-title', content: 'All apps'},
        {name: 'sectionHint', classes: 'hb-section-hint', content: 'A–Z · press OK to open'},
      ]},
      {name: 'spinner', classes: 'hb-spinner', attributes: {role: 'status', 'aria-label': 'Loading'}},
      {name: 'grid', classes: 'hb-grid'},
      {name: 'empty', classes: 'hb-empty', showing: false},
    ]},
  ],

  create: function () {
    this.inherited(arguments);
    this.tab = 'discover';
    this.query = '';
    this.installed = {};
    this.updateTabs();
    this.reload();

    util.lunaCall(SERVICE + 'updateStartupScript', {}, null, function (err) { console.warn('updateStartupScript:', err); });
    util.lunaCall(SERVICE + 'autostart', {}, null, function (err) { console.warn('autostart:', err); });
  },

  initialFocus: function () {
    if (this.$.hero.showing) return this.$.heroAction;
    var first = this.visibleCards()[0];
    return first || this.$.tabDiscover;
  },

  /**
   * Called when this page is shown again after a page on top of it was closed.
   */
  pageShown: function () {
    if (JSON.stringify(ConfigUtils.getRepositories()) !== this.loadedRepositories) {
      this.reload();
    } else {
      this.checkInstalled();
    }
  },

  // ---- Loading ----

  reload: function () {
    this.loadedRepositories = JSON.stringify(ConfigUtils.getRepositories());
    this.$.spinner.set('showing', true);
    this.$.empty.set('showing', false);
    this.$.notice.set('showing', false);
    this.$.subtitle.set('content', 'Loading repositories…');

    var self = this;
    var generation = this.loadGeneration = (this.loadGeneration || 0) + 1;
    repository.loadAll(function (packages, errors) {
      if (generation !== self.loadGeneration || self.destroyed) return;
      self.packages = packages;
      self.$.spinner.set('showing', false);
      self.showErrors(errors);
      self.buildCards();
      self.checkInstalled();
    });
  },

  showErrors: function (errors) {
    this.$.notice.set('showing', errors.length > 0);
    if (errors.length) {
      this.$.notice.set('content', 'Some repositories could not be loaded: ' + errors.map(function (e) {
        return e.url + ' (' + e.reason + ')';
      }).join(', '));
    }
  },

  buildCards: function () {
    var focusedId = this.focusedAppUid();
    this.$.grid.destroyClientControls();
    this.cards = [];
    for (var i = 0; i < this.packages.length; i++) {
      this.cards.push(this.$.grid.createComponent({
        kind: AppCard,
        app: this.packages[i],
        installedVersion: this.installed[this.packages[i].id] || null,
        ontap: 'cardTapped',
      }, {owner: this}));
    }
    this.$.grid.render();

    var repos = ConfigUtils.getRepositories();
    var host = repos.length === 1 ? repository.repositoryHost(repos[0]) : repos.length + ' repositories';
    this.$.subtitle.set('content', host + ' · ' + this.packages.length + ' apps');

    this.applyFilter();
    this.updateHero();
    if (!Spotlight.getCurrent() || Spotlight.getCurrent().destroyed || focusedId) {
      var again = focusedId && this.cardForUid(focusedId);
      Spotlight.spot(again || this.initialFocus());
    }
  },

  focusedAppUid: function () {
    var current = Spotlight.getCurrent();
    return current && (this.cards || []).indexOf(current) !== -1 ? current.app.uid : null;
  },

  cardForUid: function (uid) {
    for (var i = 0; i < (this.cards || []).length; i++) {
      if (this.cards[i].app.uid === uid) return this.cards[i];
    }
    return null;
  },

  /**
   * Asks the service which of the listed apps are installed, a few at a time, and updates the cards as answers come.
   */
  checkInstalled: function () {
    var ids = [];
    var seen = {};
    (this.packages || []).forEach(function (pkg) {
      if (!seen[pkg.id]) {
        seen[pkg.id] = true;
        ids.push(pkg.id);
      }
    });

    var self = this;
    var generation = this.checkGeneration = (this.checkGeneration || 0) + 1;
    util.forEachLimited(ids, 4, function (id, done) {
      util.lunaCall(SERVICE + 'getAppInfo', {id: id}, function (response) {
        if (generation === self.checkGeneration && !self.destroyed) {
          self.setInstalledVersion(id, response && response.appInfo ? response.appInfo.version || '0' : null);
        }
        done();
      }, function () {
        if (generation === self.checkGeneration && !self.destroyed) self.setInstalledVersion(id, null);
        done();
      });
    }, function () {
      if (generation !== self.checkGeneration || self.destroyed) return;
      self.applyFilter();
      self.updateHero();
    });
  },

  setInstalledVersion: function (id, version) {
    if (this.installed[id] === version) return;
    this.installed[id] = version;
    (this.cards || []).forEach(function (card) {
      if (card.app.id === id) card.setInstalledVersion(version);
    });
    this.updateTabs();
  },

  // ---- Filtering ----

  hasUpdate: function (pkg) {
    return !!this.installed[pkg.id] && util.versionHigher(this.installed[pkg.id], repository.availableVersion(pkg));
  },

  matches: function (pkg) {
    if (this.tab === 'installed' && !this.installed[pkg.id]) return false;
    if (this.tab === 'updates' && !this.hasUpdate(pkg)) return false;
    if (this.query) {
      var haystack = ((pkg.title || '') + ' ' + pkg.id + ' ' + (pkg.shortDescription || '')).toLowerCase();
      if (haystack.indexOf(this.query) === -1) return false;
    }
    return true;
  },

  visibleCards: function () {
    return (this.cards || []).filter(function (card) { return card.showing; });
  },

  applyFilter: function () {
    var self = this;
    var count = 0;
    (this.cards || []).forEach(function (card) {
      var show = self.matches(card.app);
      card.set('showing', show);
      if (show) count++;
    });

    var titles = {discover: 'All apps', installed: 'Installed', updates: 'Updates'};
    this.$.sectionTitle.set('content', this.query ? 'Results for “' + this.query + '”' : titles[this.tab]);
    this.$.sectionHint.set('content', count + (count === 1 ? ' app' : ' apps') + ' · press OK to open');

    var empty = !this.$.spinner.showing && count === 0;
    this.$.empty.set('showing', empty);
    if (empty) {
      this.$.empty.set('content',
        this.query ? 'No apps match your search.'
          : this.tab === 'installed' ? 'No apps from these repositories are installed yet.'
            : this.tab === 'updates' ? 'Everything is up to date.'
              : 'No apps found. Check your repositories in Settings.');
    }
    this.$.hero.set('showing', this.tab === 'discover' && !this.query && !!this.heroApp);
  },

  updateTabs: function () {
    var installed = 0;
    var updates = 0;
    var self = this;
    var seen = {};
    (this.packages || []).forEach(function (pkg) {
      if (seen[pkg.id]) return;
      seen[pkg.id] = true;
      if (self.installed[pkg.id]) installed++;
      if (self.hasUpdate(pkg)) updates++;
    });
    this.$.tabDiscover.setActive(this.tab === 'discover');
    this.$.tabInstalled.setActive(this.tab === 'installed');
    this.$.tabUpdates.setActive(this.tab === 'updates');
    this.$.tabInstalled.setCount(installed, false);
    this.$.tabUpdates.setCount(updates, true);
  },

  selectTab: function (sender) {
    this.tab = sender.tab;
    this.updateTabs();
    this.applyFilter();
    this.$.scroller.scrollToTop();
    return true;
  },

  searchChanged: function (sender, event) {
    this.query = String(event.query || '').trim().toLowerCase();
    this.applyFilter();
    this.$.scroller.scrollToTop();
    return true;
  },

  // ---- Featured app ----

  updateHero: function () {
    var packages = this.packages || [];
    var self = this;
    var app = null;
    var label = 'Featured';

    for (var i = 0; i < packages.length && !app; i++) {
      if (this.hasUpdate(packages[i])) {
        app = packages[i];
        label = 'Update available';
      }
    }
    if (!app) {
      var candidates = packages.filter(function (pkg) {
        return pkg.official && pkg.manifest && pkg.id !== 'org.webosbrew.hbchannel' && !self.installed[pkg.id];
      });
      if (candidates.length) {
        // A different pick each day, the same all day.
        var day = Math.floor(Date.now() / 86400000);
        app = candidates[day % candidates.length];
      }
    }

    this.heroApp = app;
    if (app) {
      var manifest = app.manifest || {};
      this.$.heroIcon.set('src', app.iconUri || 'assets/icon160.png');
      this.$.heroLabel.set('content', label);
      this.$.heroTitle.set('content', app.title || app.id);
      this.$.heroText.set('content', app.shortDescription || manifest.appDescription || '');
      this.$.heroText.set('showing', !!(app.shortDescription || manifest.appDescription));

      var chips = [];
      if (manifest.version) chips.push({text: 'v' + manifest.version});
      var size = util.formatSize(manifest.ipkSize);
      if (size) chips.push({text: size});
      if (manifest.rootRequired === true) chips.push({text: 'Root required', cls: 'hb-chip-rose'});
      else if (manifest.rootRequired === 'optional') chips.push({text: 'Root optional'});
      else if (manifest.rootRequired === false) chips.push({text: 'No root needed', cls: 'hb-chip-green'});
      this.$.heroChips.set('allowHtml', true);
      this.$.heroChips.set('content', chips.map(function (c) {
        return '<span class="hb-chip ' + (c.cls || '') + '">' + util.escapeHTML(c.text) + '</span>';
      }).join(''));

      var installed = this.installed[app.id];
      this.$.heroAction.set('label', !installed ? 'Install' : this.hasUpdate(app) ? 'Update' : 'Open');
    }
    this.$.hero.set('showing', this.tab === 'discover' && !this.query && !!app);
  },

  heroActionTapped: function () {
    var app = this.heroApp;
    if (!app) return true;
    if (this.installed[app.id] && !this.hasUpdate(app)) {
      util.lunaCall('luna://com.webos.applicationManager/launch', {id: app.id}, null, function (err) { console.warn('launch:', err); });
    } else {
      // Details starts the installation itself, and shows its progress.
      this.openDetails(app, true);
    }
    return true;
  },

  heroDetailsTapped: function () {
    if (this.heroApp) this.openDetails(this.heroApp, false);
    return true;
  },

  // ---- Navigation ----

  cardTapped: function (sender) {
    this.openDetails(sender.app, false);
    return true;
  },

  openDetails: function (app, startInstall) {
    this.doRequestPushPanel({panel: {
      kind: DetailsView,
      app: app,
      repositoryURL: app.repository,
      startInstall: startInstall,
    }});
  },

  openSettings: function () {
    this.doRequestPushPanel({panel: {kind: SettingsView}});
    return true;
  },
});
