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
                {kind: ToggleItem, name: 'ssh', disabled: true, content: 'SSH Server', onchange: 'updateConfiguration'},
                {kind: Divider, content: 'System information'},
                {
                  kind: LabeledTextItem,
                  label: 'webosbrew version',
                  text: '0.1.2.3',
                  ontap: 'versionTap',
                },
                {
                  kind: LabeledTextItem,
                  label: 'Root status',
                  text: 'unknown',
                  name: 'rootStatus',
                  disabled: true,
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
                    {kind: MarqueeText, content: 'https://repo.webosbrew.org/demo'}
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
  ],

  rootStatus: 'pending...',
  telnetEnabled: false,

  bindings: [
    {from: "rootStatus", to: '$.rootStatus.text'},
    // FIXME: shall this be a true/false/null value tranformed around?
    {from: "rootStatus", to: '$.telnet.disabled', transform: function (v) {return v !== 'ok';}},
    {from: "telnetEnabled", to: '$.telnet.checked', oneWay: false},
  ],
  create: function () {
    this.inherited(arguments);
    this.$.getConfiguration.send({});
  },
  onGetConfiguration: function (sender, response) {
    console.info(sender, response);
    if (response.errorText) {
      this.set('rootStatus', response.errorText);
    } else {
      this.set('rootStatus', response.root ? 'ok' : 'unelevated');
      this.set('telnetEnabled', !response.telnetDisabled);
    }
  },
  onSetConfiguration: function (sender, response) {
    if (response.errorText) {
      this.$.errorPopup.set('content', 'An error occured during configuration change: ' + response.errorText);
      this.$.errorPopup.show();
    }
  },
  updateConfiguration: function () {
    this.$.setConfiguration.send({
      telnetDisabled: !this.telnetEnabled,
    })
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

