var
  kind = require('enyo/kind'),
  Panel = require('moonstone/Panel'),
  Scroller = require('moonstone/Scroller'),
  Divider = require('moonstone/Divider'),
  ToggleItem = require('moonstone/ToggleItem'),
  Tooltip = require('moonstone/Tooltip'),
  Icon = require('moonstone/Icon'),
  IconButton = require('moonstone/IconButton'),
  ObjectActionDecorator = require('moonstone/ObjectActionDecorator'),
  ItemOverlay = require('moonstone/ItemOverlay'),
  ItemOverlaySupport = ItemOverlay.ItemOverlaySupport,
  Marquee = require('moonstone/Marquee'),
  MarqueeText = Marquee.Text,
  Item = require('moonstone/Item'),
  Popup = require('moonstone/Popup'),
  TooltipDecorator = require('moonstone/TooltipDecorator'),
  LabeledTextItem = require('moonstone/LabeledTextItem'),
  LunaService = require('enyo-webos/LunaService');

var not = function (x) { return !x };

var magic = {t: 0, n: 0};

module.exports = kind({
  name: 'SettingsPanel',
  kind: Panel,
  title: 'Settings',
  headerType: 'medium',
  components: [
    {
      kind: Scroller, fit: true, components: [
        {
          classes: 'moon-hspacing top', components: [
            {
              components: [
                {kind: Divider, content: 'Root configuration'},
                {kind: ToggleItem, name: 'telnet', disabled: true, content: 'Telnet', onchange: 'updateConfiguration'},
                {kind: ToggleItem, name: 'sshd', disabled: true, content: 'SSH Server', onchange: 'updateConfiguration'},
                {kind: ToggleItem, name: 'blockUpdates', disabled: true, content: 'Block system updates', onchange: 'updateConfiguration'},
                {
                  kind: TooltipDecorator, components: [
                    {kind: ToggleItem, name: 'failsafe', disabled: true, content: 'Failsafe mode', onchange: 'updateConfiguration'},
                    {
                      kind: Tooltip, position: 'right bottom', components: [
                        {content: 'This disables all early system modifications and leaves recovery telnet running. Gets automatically tripped in case of a reboot/crash during early system startup.', uppercase: false, style: 'width: 30rem; white-space: normal'}
                      ]
                    },
                  ], style: 'width: 100%',
                },
                {kind: Divider, content: 'System information'},
                {
                  kind: LabeledTextItem,
                  name: 'version',
                  label: 'webosbrew version',
                  text: 'unknown',
                  ontap: 'versionTap',
                },
                {
                  kind: LabeledTextItem,
                  label: 'Root status',
                  text: 'unknown',
                  name: 'rootStatus',
                  disabled: true,
                },
                {
                  kind: LabeledTextItem,
                  label: 'System reboot',
                  text: 'Configuration changes require a system reboot to apply.',
                  ontap: 'reboot',
                },
              ],
              classes: 'moon-6h',
            },
            {
              components: [
                {kind: Divider, content: 'Repositories (Coming Soon...)'},
                {kind: ToggleItem, content: 'Default repository - https://repo.webosbrew.org', checked: true, disabled: true},
                {
                  kind: Item, mixins: [ItemOverlaySupport], components: [
                    {kind: MarqueeText, content: 'https://repo.webosbrew.org/api/'}
                  ], endingComponents: [
                    {kind: Icon, icon: 'trash', small: true}
                  ], disabled: true,
                },
                {kind: Item, content: 'Add repository', centered: true, style: 'margin-top: 3rem', disabled: true},
              ],
              classes: 'moon-16h',
            }
          ]
        }
      ]
    },
    {kind: Popup, name: 'errorPopup', content: 'An error occured while downloading repository.', allowHtml: true, modal: true, allowBackKey: true},
    {kind: LunaService, name: 'getConfiguration', service: 'luna://org.webosbrew.hbchannel.service', method: 'getConfiguration', onResponse: 'onGetConfiguration', onError: 'onGetConfiguration'},
    {kind: LunaService, name: 'setConfiguration', service: 'luna://org.webosbrew.hbchannel.service', method: 'setConfiguration', onResponse: 'onSetConfiguration', onError: 'onSetConfiguration'},
    {kind: LunaService, name: 'reboot', service: 'luna://org.webosbrew.hbchannel.service', method: 'reboot'},
  ],

  rootTextStatus: 'pending...',
  rootIsActive: false,
  telnetEnabled: false,
  sshdEnabled: false,
  blockUpdates: false,
  failsafe: false,
  rebootRequired: false,

  bindings: [
    {from: "rootTextStatus", to: '$.rootStatus.text'},
    {from: "rootIsActive", to: '$.telnet.disabled', transform: not},
    {from: "rootIsActive", to: '$.sshd.disabled', transform: not},
    {from: "rootIsActive", to: '$.blockUpdates.disabled', transform: not},
    {from: "rootIsActive", to: '$.failsafe.disabled', transform: not},
    {from: "rootIsActive", to: '$.reboot.disabled', transform: not},
    {from: "telnetEnabled", to: '$.telnet.checked', oneWay: false},
    {from: "sshdEnabled", to: '$.sshd.checked', oneWay: false},
    {from: "blockUpdates", to: '$.blockUpdates.checked', oneWay: false},
    {from: "failsafe", to: "$.failsafe.checked", oneWay: false},
  ],
  create: function () {
    this.inherited(arguments);
    this.$.getConfiguration.send({});
    global.webOS.fetchAppInfo((function (info) {
      this.$.version.set('text', info.version);
    }).bind(this));
  },
  onGetConfiguration: function (sender, response) {
    console.info(sender, response);
    if (response.errorText) {
      this.set('rootTextStatus', response.errorText);
    } else {
      this.set('rootIsActive', response.root);
      this.set('rootTextStatus', response.root ? 'ok' : 'unelevated');
      this.set('telnetEnabled', !response.telnetDisabled);
      this.set('sshdEnabled', response.sshdEnabled);
      this.set('blockUpdates', response.blockUpdates);
      this.set('failsafe', response.failsafe);
    }
  },
  onSetConfiguration: function (sender, response) {
    if (response.errorText) {
      this.$.errorPopup.set('content', 'An error occurred during configuration change: ' + response.errorText);
      this.$.errorPopup.show();
    }
  },
  updateConfiguration: function () {
    this.set('rebootRequired', true);
    this.$.setConfiguration.send({
      telnetDisabled: !this.telnetEnabled,
      sshdEnabled: this.sshdEnabled,
      blockUpdates: this.blockUpdates,
      failsafe: this.failsafe,
    })
  },
  reboot: function () {
    this.$.reboot.send({reason: 'SwDownload'});
    this.$.errorPopup.set('content', 'Rebooting...');
    this.$.errorPopup.set('allowBackKey', false);
    this.$.errorPopup.set('spotlightModal', true);
    this.$.errorPopup.show();
  },
  versionTap: function (sender, evt) {
    var t = new Date().getTime();
    if (t - magic.t > 5000) magic.n = 0;
    magic.n += 1;
    magic.t = t;
    if (magic.n == 7) {
      magic.n = 0;
      this.$.errorPopup.set('content', 'hello world!');
      this.$.errorPopup.show();
    }
  },
});

