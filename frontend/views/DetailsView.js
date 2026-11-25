// One app, as a Limestone panel: a header with the app's name, then on the left its icon, install/update/launch/
// uninstall, facts (versions, sizes) and a link to its project page, and on the right its screenshots, if it has any,
// and its description. An action guide at the bottom says when the description goes on below.

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control'),
  EnyoImage = require('enyo/Image'),
  Ajax = require('enyo/Ajax'),
  Spotlight = require('spotlight'),
  LunaService = require('enyo-webos/LunaService'),
  DOMPurify = require('dompurify/dist/purify.cjs.js'),
  Button = require('../components/Button.js'),
  Dialog = require('../components/Dialog.js'),
  TextBlock = require('../components/TextBlock.js'),
  Gallery = require('../components/Gallery.js'),
  repository = require('../repository.js'),
  icons = require('../icons.js'),
  util = require('../util.js'),
  resolveURL = require('../baseurl').resolveURL;

var NO_DESCRIPTION = '<p>No description provided for this package.</p>';

// Links in descriptions open in the TV's browser.
DOMPurify.addHook('afterSanitizeAttributes', function (node) {
  if ('href' in node) {
    node.setAttribute('data-href', node.href);
    node.setAttribute('href', 'javascript:openLinkInBrowser(' + JSON.stringify(node.href) + ')');
  }
});
global.openLinkInBrowser = util.openInBrowser;

var Fact = kind({
  name: 'hb.Fact',
  kind: Control,
  classes: 'hb-fact',
  components: [
    {name: 'labelNode', classes: 'hb-fact-label'},
    {name: 'valueNode', classes: 'hb-fact-value', content: '…'},
  ],
  create: function () {
    this.inherited(arguments);
    this.$.labelNode.set('content', this.label);
  },
  setValue: function (value, highlight) {
    this.$.valueNode.set('content', value);
    this.addRemoveClass('hb-fact-highlight', !!highlight);
  },
});

module.exports = kind({
  name: 'hb.DetailsView',
  kind: Control,
  classes: 'hb-page',
  spotlight: 'container',

  // The repository's package entry, the repository it came from, and whether to install as soon as possible.
  app: null,
  repositoryURL: null,
  startInstall: false,

  events: {
    onRequestBack: '',
  },

  handlers: {
    onSpotlightKeyUp: 'keyUp',
    onSpotlightFocused: 'focusMoved',
    onTextScrolled: 'updateGuide',
  },

  components: [
    {classes: 'hb-header', components: [
      {classes: 'hb-header-before', components: [
        {name: 'backButton', kind: Button, iconOnly: true, variant: 'transparent', icon: icons.back, label: 'Back', ontap: 'goBack'},
      ]},
      {classes: 'hb-header-titles', components: [
        {name: 'title', tag: 'h1', classes: 'hb-header-title'},
        {name: 'appId', classes: 'hb-header-subtitle'},
      ]},
      {name: 'chips', classes: 'hb-header-after', allowHtml: true},
    ]},

    {classes: 'hb-body', components: [
      {classes: 'hb-column hb-details-side', components: [
        {classes: 'hb-app-image', components: [
          {name: 'icon', kind: EnyoImage, classes: 'hb-app-icon', alt: ''},
        ]},
        {classes: 'hb-actions', components: [
          {name: 'installButton', kind: Button, size: 'large', icon: icons.download, label: 'Install', disabled: true, ontap: 'installApp'},
          {classes: 'hb-actions-row', components: [
            {name: 'launchButton', kind: Button, label: 'Launch', disabled: true, ontap: 'launchApp'},
            {name: 'uninstallButton', kind: Button, label: 'Uninstall', disabled: true, ontap: 'uninstallApp'},
          ]},
        ]},
        {classes: 'hb-facts', components: [
          {name: 'availableTile', kind: Fact, label: 'Available'},
          {name: 'installedTile', kind: Fact, label: 'Installed'},
          {name: 'downloadTile', kind: Fact, label: 'Download'},
          {name: 'sizeTile', kind: Fact, label: 'Installed size'},
        ]},
        {name: 'projectLink', classes: 'hb-link', spotlight: true, showing: false, ontap: 'openProjectPage', attributes: {role: 'link'}, components: [
          {classes: 'hb-link-text', components: [
            {classes: 'hb-link-label', content: 'Project page'},
            {name: 'projectURL', classes: 'hb-link-value hb-ellipsis'},
          ]},
          {tag: 'span', allowHtml: true, content: icons.external},
        ]},
      ]},

      {classes: 'hb-column-main', components: [
        {name: 'gallery', kind: Gallery},
        {classes: 'hb-heading', components: [
          {tag: 'h2', classes: 'hb-heading-title', content: 'About'},
        ]},
        {name: 'description', kind: TextBlock, content: '<p>Loading…</p>'},
      ]},
    ]},

    {name: 'guide', classes: 'hb-actionguide hb-actionguide-hidden', allowHtml: true, attributes: {'aria-hidden': 'true'},
      content: icons.arrowDown + 'Press Down on the description to read more'},

    {name: 'errorDialog', kind: Dialog, title: 'Something went wrong', allowHtmlMessage: true, buttons: [{label: 'OK', action: 'close'}]},

    {kind: LunaService, name: 'appInfoCall', service: 'luna://org.webosbrew.hbchannel.service', method: 'getAppInfo', onResponse: 'onAppInfoResponse', onError: 'onAppInfoError'},
    {kind: LunaService, name: 'installCall', service: 'luna://org.webosbrew.hbchannel.service', method: 'install', onResponse: 'onInstallResponse', onError: 'onInstallError', subscribe: true},
    {kind: LunaService, name: 'uninstallCall', service: 'luna://org.webosbrew.hbchannel.service', method: 'uninstall', onResponse: 'onUninstallResponse', onError: 'onUninstallError'},
    {kind: LunaService, name: 'launchCall', service: 'luna://com.webos.applicationManager', method: 'launch', onResponse: 'onLaunchResponse', onError: 'onLaunchError'},
  ],

  create: function () {
    this.inherited(arguments);
    var app = this.app || {};
    this.title = app.title || app.id;
    // undefined: not asked yet; null: not installed.
    this.appInfo = undefined;
    this.packageInfo = null;
    this.installing = false;
    this.forceReinstall = false;

    this.$.icon.set('src', app.iconUri || 'assets/icon160.png');
    this.$.title.set('content', this.title);
    this.$.appId.set('content', app.id);
    this.$.gallery.set('screenshots', app.screenshots || null);
    this.renderState();
    this.refresh();
  },

  // Until the service says whether the app is installed, Install is disabled and the description gets focus; it then
  // moves to Install when that is ready, unless the remote has moved it meanwhile.
  initialFocus: function () {
    this.waitingForInstall = this.$.installButton.disabled;
    return this.waitingForInstall ? this.$.description : this.$.installButton;
  },

  focusMoved: function (sender, event) {
    if (event.originator !== this.$.description) this.waitingForInstall = false;
  },

  goBack: function () {
    this.doRequestBack();
    return true;
  },

  // ---- Loading ----

  refresh: function () {
    var app = this.app || {};
    var self = this;

    if (app.manifest) {
      this.packageInfo = app.manifest;
      this.renderState();
    } else if (app.manifestUrl) {
      var manifestRequest = new Ajax({url: resolveURL(app.manifestUrl, this.repositoryURL), cacheBust: false, handleAs: 'json'});
      manifestRequest.response(function (sender, data) {
        if (self.destroyed) return;
        self.packageInfo = data || {};
        self.renderState();
      });
      manifestRequest.error(function () {
        if (self.destroyed) return;
        self.packageInfo = {};
        self.renderState();
        self.showError('Could not load this app’s information from its repository.');
      });
      manifestRequest.go();
    }

    if (app.fullDescriptionUrl) {
      var descriptionRequest = new Ajax({url: resolveURL(app.fullDescriptionUrl, this.repositoryURL), cacheBust: false, handleAs: 'text'});
      descriptionRequest.response(function (sender, text) {
        if (!self.destroyed) self.setDescription(text || NO_DESCRIPTION);
      });
      descriptionRequest.error(function () {
        if (!self.destroyed) self.setDescription(util.escapeHTML(app.shortDescription) || NO_DESCRIPTION);
      });
      descriptionRequest.go();
    } else {
      this.setDescription(app.shortDescription ? '<p>' + util.escapeHTML(app.shortDescription) + '</p>' : NO_DESCRIPTION);
    }

    this.$.appInfoCall.send({id: app.id});
  },

  setDescription: function (html) {
    var sanitized = DOMPurify.sanitize(html, {FORBID_TAGS: ['style', 'form', 'input', 'button']});
    this.$.description.set('content', sanitized);
    // Once the text is laid out.
    this.startJob('updateGuide', 'updateGuide', 100);
  },

  // The action guide shows while there is more of the description below what is on screen.
  updateGuide: function () {
    this.$.guide.addRemoveClass('hb-actionguide-hidden', !this.$.description.hasMoreBelow());
    return true;
  },

  onAppInfoResponse: function (sender, msg) {
    this.appInfo = msg.appInfo || null;
    this.renderState();
    this.maybeStartInstall();
  },

  onAppInfoError: function (sender, msg) {
    console.warn('appInfo read failed:', msg);
    this.appInfo = null;
    this.renderState();
    this.maybeStartInstall();
  },

  // ---- State ----

  isSelf: function () {
    return this.app && this.app.id === 'org.webosbrew.hbchannel';
  },

  availableVersion: function () {
    return this.packageInfo && this.packageInfo.version ? this.packageInfo.version : null;
  },

  installedVersion: function () {
    return this.appInfo && this.appInfo.version ? this.appInfo.version : null;
  },

  canInstall: function () {
    if (this.installing || this.appInfo === undefined || !this.packageInfo || !this.packageInfo.ipkUrl) return false;
    if (this.forceReinstall) return true;
    return !this.appInfo || this.appInfo.version !== this.packageInfo.version;
  },

  renderState: function () {
    var app = this.app || {};
    var pkg = this.packageInfo || {};
    var available = this.availableVersion();
    var installed = this.installedVersion();
    var hasUpdate = !!installed && util.versionHigher(installed, available);

    // Chips: where it comes from, and whether it needs root.
    var chips = [];
    chips.push(app.official
      ? '<span class="hb-chip">Official repository</span>'
      : '<span class="hb-chip">' + util.escapeHTML(repository.repositoryHost(this.repositoryURL)) + '</span>');
    if (pkg.rootRequired === true) chips.push('<span class="hb-chip hb-chip-rose">Root required</span>');
    else if (pkg.rootRequired === 'optional') chips.push('<span class="hb-chip">Root optional</span>');
    else if (pkg.rootRequired === false) chips.push('<span class="hb-chip hb-chip-green">No root needed</span>');
    this.$.chips.set('content', chips.join(''));

    this.$.availableTile.setValue(available || (this.packageInfo ? 'Unknown' : '…'));
    this.$.installedTile.setValue(
      this.appInfo === undefined ? '…' : installed || 'Not installed',
      hasUpdate);
    this.$.downloadTile.setValue(util.formatSize(pkg.ipkSize) || (this.packageInfo ? '—' : '…'));
    this.$.sizeTile.setValue(util.formatSize(pkg.installedSize) || (this.packageInfo ? '—' : '…'));

    if (!this.installing) {
      var label = this.forceReinstall ? 'Reinstall'
        : !this.appInfo ? 'Install'
          : hasUpdate || installed !== available ? 'Update'
            : 'Up to date';
      this.$.installButton.set('label', label);
      this.$.installButton.set('progress', null);
    }
    this.$.installButton.set('disabled', !this.canInstall());
    this.$.launchButton.set('disabled', !this.appInfo || this.isSelf() || this.installing);
    this.$.uninstallButton.set('disabled', !this.appInfo || this.isSelf() || this.installing);

    this.$.projectLink.set('showing', !!pkg.sourceUrl);
    this.$.projectURL.set('content', String(pkg.sourceUrl || '').replace(/^https?:\/\//, ''));

    // Keep focus somewhere useful when the focused button just became disabled.
    var current = Spotlight.getCurrent();
    var ownButtons = [this.$.installButton, this.$.launchButton, this.$.uninstallButton];
    if (current && current.disabled && ownButtons.indexOf(current) !== -1 && this.hasNode()) {
      Spotlight.spot(this.initialFocus());
    } else if (this.waitingForInstall && current === this.$.description && !this.$.installButton.disabled &&
        !Spotlight.getPointerMode()) {
      this.waitingForInstall = false;
      Spotlight.spot(this.$.installButton);
    }
  },

  maybeStartInstall: function () {
    if (this.startInstall && this.canInstall()) {
      this.startInstall = false;
      // Not from inside a service response, which may come while this page is still being created.
      this.startJob('autoInstall', 'installApp', 300);
    }
  },

  cancelInstallRequest: function () {
    // The request is not there yet when the service fails from inside send().
    if (this.installRequest) this.$.installCall.cancel(this.installRequest);
    this.installRequest = null;
  },

  // ---- Actions ----

  installApp: function () {
    if (!this.canInstall()) return true;
    var pkg = this.packageInfo;
    this.installing = true;
    this.forceReinstall = false;
    this.$.installButton.set('label', 'Installing…');
    this.$.installButton.set('progress', 0);
    this.renderState();
    Spotlight.spot(this.$.installButton);

    this.installRequest = null;
    var request = this.$.installCall.send({
      ipkUrl: resolveURL(pkg.ipkUrl, this.app.manifestUrl || this.repositoryURL),
      ipkHash: pkg.ipkHash && pkg.ipkHash.sha256,
      id: this.app.id,
      subscribe: true,
    });
    // An error during send() has finished the installation already.
    if (this.installing) this.installRequest = request;
    return true;
  },

  onInstallResponse: function (sender, msg) {
    if (msg.progress !== undefined && msg.progress < 99) {
      var percent = Math.round(msg.progress);
      this.$.installButton.set('progress', percent);
      this.$.installButton.set('label', (msg.statusText && msg.statusText.indexOf('nstall') !== -1 ? 'Installing… ' : 'Downloading… ') + percent + '%');
    } else if (msg.finished) {
      this.$.installButton.set('progress', 100);
      this.cancelInstallRequest();
      this.installing = false;
      this.appInfo = undefined;
      this.renderState();
      this.$.appInfoCall.send({id: this.app.id});
    }
  },

  onInstallError: function (sender, msg) {
    this.cancelInstallRequest();
    this.installing = false;
    this.renderState();
    this.showServiceError(msg, 'installation');
  },

  launchApp: function () {
    this.$.launchCall.send({id: this.app.id});
    return true;
  },

  uninstallApp: function () {
    this.$.uninstallButton.set('disabled', true);
    this.$.uninstallCall.send({id: this.app.id});
    return true;
  },

  onUninstallResponse: function () {
    this.$.appInfoCall.send({id: this.app.id});
  },

  onUninstallError: function (sender, msg) {
    this.showServiceError(msg, 'removal');
    this.$.appInfoCall.send({id: this.app.id});
  },

  onLaunchResponse: function (sender, msg) {
    console.info('launch response:', msg);
  },

  onLaunchError: function (sender, msg) {
    console.warn('launch error:', msg);
    this.showServiceError(msg, 'launch');
  },

  openProjectPage: function () {
    if (this.packageInfo && this.packageInfo.sourceUrl) util.openInBrowser(this.packageInfo.sourceUrl);
    return true;
  },

  showServiceError: function (msg, operation) {
    var text = (msg && msg.errorText) || 'unknown error';
    var message = 'An error occurred during ' + operation + ': ' + util.escapeHTML(text);
    if (text.indexOf('luna-send-pub') !== -1 && text.indexOf('ECONNREFUSED') !== -1) {
      message += '<br><br>If you just updated Homebrew Channel, you may need to reboot.';
    }
    this.showError(message);
  },

  showError: function (html) {
    this.$.errorDialog.set('message', DOMPurify.sanitize(html));
    this.$.errorDialog.open();
  },

  keyUp: function (sender, event) {
    // Remote button "5": allow reinstalling the same version.
    if (event.keyCode === 53 && !this.installing && this.appInfo) {
      this.forceReinstall = true;
      this.renderState();
    }
  },
});
