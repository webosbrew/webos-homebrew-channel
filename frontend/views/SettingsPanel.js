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
                {kind: ToggleItem, content: 'Telnet', checked: true, onchange: 'itemChanged'},
                {kind: ToggleItem, content: 'SSH Server', onchange: 'itemChanged'},
                {
                  kind: TooltipDecorator, components: [
                    {kind: ToggleItem, content: 'Disable metrics', onchange: 'itemChanged', checked: true},
                    {kind: Tooltip, content: 'This disables certain metrics reporting to TV manufacturer (crash logs, system logs)', position: 'below'}, // , position: 'right-below'}
                  ], style: 'width: 100%',
                },
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
    {kind: LunaService, name: 'checkroot', service: 'luna://org.webosbrew.hbchannel.service', method: 'checkRoot', onResponse: 'onCheckRoot', onError: 'onCheckRoot'},
  ],

  rootStatus: 'pending...',
  bindings: [
    {from: "rootStatus", to: '$.rootStatus.text'},
  ],
  create: function () {
    this.inherited(arguments);
    this.$.checkroot.send({});
  },
  onCheckRoot: function (sender, response) {
    console.info(sender, response);
    if (response.errorText) {
      this.set('rootStatus', response.errorText);
    } else {
      this.set('rootStatus', response.returnValue ? 'ok' : 'unelevated');
    }
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

