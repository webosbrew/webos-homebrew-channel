// Settings: root options, system information and repositories.

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control'),
  Input = require('enyo/Input'),
  Spotlight = require('spotlight'),
  LunaService = require('enyo-webos/LunaService'),
  Button = require('../components/Button.js'),
  ToggleRow = require('../components/ToggleRow.js'),
  Dialog = require('../components/Dialog.js'),
  Scroller = require('../components/Scroller.js'),
  ConfigUtils = require('../configutils.js'),
  icons = require('../icons.js');

var magic = {t: 0, n: 0};

// A text field: OK starts typing (the on-screen keyboard on a TV); Enter on the keyboard submits.
var TextField = kind({
  name: 'hb.TextField',
  kind: Control,
  spotlight: true,
  classes: 'hb-field',
  events: {
    onSubmit: '',
  },
  handlers: {
    ontap: 'startEditing',
    onSpotlightBlur: 'stopEditing',
  },
  components: [
    {name: 'input', kind: Input, type: 'url', onkeydown: 'inputKeyDown', onblur: 'inputBlurred'},
  ],
  create: function () {
    this.inherited(arguments);
    this.$.input.set('placeholder', this.placeholder || '');
    // Enyo finds a control's node by its own id, so the input is labelled by aria-label rather than <label for>.
    if (this.label) this.$.input.setAttribute('aria-label', this.label);
  },
  getValue: function () {
    return this.$.input.getValue();
  },
  setValue: function (value) {
    this.$.input.set('value', value);
  },
  startEditing: function () {
    if (this.editing) return true;
    this.editing = true;
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
      this.stopEditing();
      // Spotlight acts on the key-up of OK, which would start typing again right away.
      this.$.input.spotlightIgnoredKeys = this.spotlightIgnoredKeys = [13];
      var self = this;
      setTimeout(function () {
        if (!self.editing) self.$.input.spotlightIgnoredKeys = self.spotlightIgnoredKeys = null;
      }, 400);
      this.doSubmit();
      return true;
    }
  },
  inputBlurred: function () {
    this.editing = false;
    this.$.input.spotlightIgnoredKeys = this.spotlightIgnoredKeys = null;
  },
});

// One custom repository: its address, and a button that removes it.
var RepositoryRow = kind({
  name: 'hb.RepositoryRow',
  kind: Control,
  classes: 'hb-row',
  style: 'cursor: default',
  url: '',
  events: {
    onRemove: '',
  },
  components: [
    {name: 'urlNode', classes: 'hb-row-label hb-ellipsis', style: 'font-weight: 500; font-size: 21px'},
    {name: 'removeButton', kind: Button, iconOnly: true, variant: 'danger', icon: icons.trash, label: 'Remove repository', ontap: 'removeTapped', style: 'width: 52px; height: 52px; line-height: 50px'},
  ],
  create: function () {
    this.inherited(arguments);
    this.$.urlNode.set('content', this.url);
    this.$.removeButton.set('label', 'Remove ' + this.url);
  },
  removeTapped: function () {
    this.doRemove({url: this.url});
    return true;
  },
});

module.exports = kind({
  name: 'hb.SettingsView',
  kind: Control,
  classes: 'hb-page',
  spotlight: 'container',
  title: 'Settings',

  // Set when the app was launched to add a repository (launchMode: addRepository).
  templateAddRepository: null,

  events: {
    onRequestBack: '',
  },

  components: [
    {classes: 'hb-header', components: [
      {classes: 'hb-header-left', components: [
        {kind: Button, iconOnly: true, icon: icons.back, label: 'Back', classes: 'hb-glass hb-blur', ontap: 'goBack', style: 'margin-right: 22px'},
        {tag: 'h1', classes: 'hb-page-title', content: 'Settings'},
      ]},
      {name: 'rebootBanner', classes: 'hb-banner hb-glass hb-blur', showing: false, attributes: {role: 'status'}, components: [
        {classes: 'hb-banner-dot'},
        {classes: 'hb-banner-text', content: 'Changes apply after a reboot'},
        {name: 'bannerRebootButton', kind: Button, label: 'Reboot now', ontap: 'confirmReboot'},
      ]},
    ]},

    {classes: 'hb-columns', components: [
      {classes: 'hb-column', style: 'width: 760px; flex-shrink: 0', components: [
        {classes: 'hb-panel hb-glass hb-blur', components: [
          {style: 'display: flex; align-items: baseline; justify-content: space-between', components: [
            {tag: 'h2', classes: 'hb-panel-title', content: 'Root configuration'},
            {name: 'rootChip', tag: 'span', classes: 'hb-chip', content: 'Checking…'},
          ]},
          {name: 'telnet', kind: ToggleRow, label: 'Telnet', disabled: true, onChange: 'updateConfiguration'},
          {name: 'sshd', kind: ToggleRow, label: 'SSH Server', disabled: true, onChange: 'updateConfiguration'},
          {name: 'blockUpdates', kind: ToggleRow, label: 'Block system updates', disabled: true, onChange: 'updateConfiguration'},
          {name: 'failsafe', kind: ToggleRow, label: 'Failsafe mode', disabled: true, onChange: 'updateConfiguration',
            description: 'Disables all early system modifications and leaves recovery telnet running. Turns on by itself after a reboot or crash during early startup.'},
        ]},
        {classes: 'hb-panel hb-glass hb-blur', components: [
          {classes: 'hb-tiles', components: [
            {name: 'versionTile', classes: 'hb-tile', spotlight: true, ontap: 'versionTap', components: [
              {classes: 'hb-tile-label', content: 'Homebrew Channel'},
              {name: 'version', classes: 'hb-tile-value', content: '…'},
            ]},
            {classes: 'hb-tile', components: [
              {classes: 'hb-tile-label', content: 'Root status'},
              {name: 'rootStatus', classes: 'hb-tile-value hb-ellipsis', content: 'Checking…'},
            ]},
          ]},
          {name: 'rebootButton', kind: Button, label: 'Reboot TV', disabled: true, ontap: 'confirmReboot', style: 'display: block; width: 100%'},
        ]},
      ]},

      {classes: 'hb-panel hb-glass hb-blur', style: 'flex: 1; min-width: 0', components: [
        {tag: 'h2', classes: 'hb-panel-title', content: 'Repositories'},
        {name: 'repoScroller', kind: Scroller, components: [
          {name: 'enableDefault', kind: ToggleRow, label: 'Default repository', description: 'repo.webosbrew.org', onChange: 'saveRepositories'},
          {name: 'enableNonfree', kind: ToggleRow, label: 'Extra non-free software', description: 'repo.webosbrew.org', onChange: 'saveRepositories'},
          {name: 'customLabel', classes: 'hb-overline', content: 'CUSTOM'},
          {name: 'customList'},
        ]},
        {name: 'addButton', kind: Button, icon: icons.plus, label: 'Add repository', classes: 'hb-add-row', ontap: 'showAddDialog'},
      ]},
    ]},

    {name: 'addDialog', kind: Dialog, title: 'Add repository',
      message: 'Enter the address of a repository’s app list. Its apps appear in Discover, marked with where they come from.',
      buttons: [{label: 'Cancel', action: 'close'}, {label: 'Add repository', variant: 'primary', action: 'add'}],
      onAction: 'addDialogAction',
      components: [
        {classes: 'hb-field-label', content: 'Repository URL', attributes: {'aria-hidden': 'true'}},
        {name: 'repoField', kind: TextField, label: 'Repository URL', placeholder: 'https://…', onSubmit: 'addRepositorySubmit'},
        {classes: 'hb-field-hint', content: 'Press OK to open the on-screen keyboard'},
      ]},
    {name: 'removeDialog', kind: Dialog, title: 'Remove repository?', safeFocus: true,
      buttons: [{label: 'Cancel', action: 'close'}, {label: 'Remove', variant: 'danger', action: 'remove'}],
      onAction: 'removeDialogAction'},
    {name: 'rebootDialog', kind: Dialog, title: 'Reboot the TV?', safeFocus: true, message: 'Configuration changes take effect after a reboot.',
      buttons: [{label: 'Cancel', action: 'close'}, {label: 'Reboot', variant: 'primary', action: 'reboot'}],
      onAction: 'rebootDialogAction'},
    {name: 'messageDialog', kind: Dialog, buttons: [{label: 'OK', action: 'close'}]},
    {name: 'rebootingDialog', kind: Dialog, title: 'Rebooting…', dismissible: false},

    {kind: LunaService, name: 'getConfiguration', service: 'luna://org.webosbrew.hbchannel.service', method: 'getConfiguration', onResponse: 'onGetConfiguration', onError: 'onGetConfiguration'},
    {kind: LunaService, name: 'setConfiguration', service: 'luna://org.webosbrew.hbchannel.service', method: 'setConfiguration', onResponse: 'onSetConfiguration', onError: 'onSetConfiguration'},
    {kind: LunaService, name: 'reboot', service: 'luna://org.webosbrew.hbchannel.service', method: 'reboot'},
  ],

  create: function () {
    this.inherited(arguments);
    this.rootIsActive = false;
    this.$.getConfiguration.send({});

    var config = ConfigUtils.getConfig();
    this.extraRepositories = config.repositories.slice();
    this.$.enableDefault.set('checked', !config.disableDefault);
    this.$.enableNonfree.set('checked', !!config.enableNonfree);
    this.renderRepositories();

    var self = this;
    if (global.webOS && global.webOS.fetchAppInfo) {
      global.webOS.fetchAppInfo(function (info) {
        if (!self.destroyed && info) self.$.version.set('content', info.version);
      });
    }
  },

  rendered: function () {
    this.inherited(arguments);
    if (this.templateAddRepository !== null && !this.templateShown) {
      this.templateShown = true;
      this.showAddDialog(null, null, this.templateAddRepository);
    }
  },

  initialFocus: function () {
    return this.rootIsActive ? this.$.telnet : this.$.enableDefault;
  },

  goBack: function () {
    this.doRequestBack();
    return true;
  },

  // ---- Root configuration ----

  onGetConfiguration: function (sender, response) {
    if (response.errorText) {
      this.setRootState(false, response.errorText);
      return;
    }
    this.setRootState(!!response.root, response.root ? 'Elevated' : 'Not elevated');
    this.$.telnet.set('checked', !response.telnetDisabled);
    this.$.sshd.set('checked', !!response.sshdEnabled);
    this.$.blockUpdates.set('checked', !!response.blockUpdates);
    this.$.failsafe.set('checked', !!response.failsafe);
  },

  setRootState: function (active, text) {
    this.rootIsActive = active;
    this.$.rootStatus.set('content', text);
    this.$.rootStatus.applyStyle('color', active ? '#a7f3d0' : null);
    this.$.rootChip.set('content', active ? 'Rooted' : 'Not rooted');
    this.$.rootChip.set('classes', active ? 'hb-chip hb-chip-green' : 'hb-chip hb-chip-rose');
    ['telnet', 'sshd', 'blockUpdates', 'failsafe', 'rebootButton'].forEach(function (name) {
      this.$[name].set('disabled', !active);
    }, this);
  },

  updateConfiguration: function () {
    this.$.rebootBanner.set('showing', true);
    this.$.setConfiguration.send({
      telnetDisabled: !this.$.telnet.checked,
      sshdEnabled: this.$.sshd.checked,
      blockUpdates: this.$.blockUpdates.checked,
      failsafe: this.$.failsafe.checked,
    });
    return true;
  },

  onSetConfiguration: function (sender, response) {
    if (response.errorText) {
      this.showMessage('Could not change the configuration', response.errorText);
    }
  },

  confirmReboot: function () {
    this.$.rebootDialog.open();
    return true;
  },

  rebootDialogAction: function (sender, event) {
    if (event.action !== 'reboot') return true;
    this.$.rebootDialog.close();
    this.$.reboot.send({reason: 'SwDownload'});
    this.$.rebootingDialog.open();
    return true;
  },

  versionTap: function () {
    var t = new Date().getTime();
    if (t - magic.t > 5000) magic.n = 0;
    magic.n += 1;
    magic.t = t;
    if (magic.n === 7) {
      magic.n = 0;
      this.showMessage('hello world!', '');
    }
    return true;
  },

  showMessage: function (title, text) {
    this.$.messageDialog.set('title', title);
    this.$.messageDialog.set('message', text || '');
    this.$.messageDialog.open();
  },

  // ---- Repositories ----

  renderRepositories: function () {
    this.$.customList.destroyClientControls();
    this.extraRepositories.forEach(function (repo) {
      this.$.customList.createComponent({kind: RepositoryRow, url: repo.url, onRemove: 'askRemoveRepository'}, {owner: this});
    }, this);
    this.$.customLabel.set('showing', this.extraRepositories.length > 0);
    if (this.$.customList.hasNode()) this.$.customList.render();
  },

  saveRepositories: function () {
    ConfigUtils.setConfig({
      repositories: this.extraRepositories,
      disableDefault: !this.$.enableDefault.checked,
      enableNonfree: this.$.enableNonfree.checked,
    });
    return true;
  },

  showAddDialog: function (sender, event, prefill) {
    this.$.repoField.setValue(typeof prefill === 'string' ? prefill : '');
    this.$.addDialog.open(this.$.repoField);
    return true;
  },

  addDialogAction: function (sender, event) {
    if (event.action === 'add') this.addRepositorySubmit();
    return true;
  },

  addRepositorySubmit: function () {
    var url = String(this.$.repoField.getValue() || '').trim();
    if (!/^https?:\/\/[^\/\s]+/i.test(url)) {
      Spotlight.spot(this.$.repoField);
      return true;
    }
    var exists = this.extraRepositories.some(function (repo) { return repo.url === url; });
    if (!exists) {
      this.extraRepositories.push({url: url});
      this.saveRepositories();
      this.renderRepositories();
    }
    this.$.addDialog.close();
    return true;
  },

  askRemoveRepository: function (sender, event) {
    this.pendingRemoval = event.url;
    this.$.removeDialog.set('message', event.url);
    this.$.removeDialog.open();
    return true;
  },

  removeDialogAction: function (sender, event) {
    if (event.action !== 'remove') return true;
    var url = this.pendingRemoval;
    this.extraRepositories = this.extraRepositories.filter(function (repo) { return repo.url !== url; });
    this.saveRepositories();
    // The removed row had focus; once the dialog is gone, focus goes to something that is still there.
    this.$.removeDialog.previousFocus = this.$.addButton;
    this.$.removeDialog.close();
    this.renderRepositories();
    return true;
  },
});
