var
  kind = require('enyo/kind'),
  Panel = require('moonstone/Panel'),
  AjaxSource = require('enyo/AjaxSource'),
  Spinner = require('moonstone/Spinner'),
  Popup = require('moonstone/Popup'),
  Icon = require('moonstone/Icon'),
  Divider = require('moonstone/Divider'),
  Item = require('moonstone/Item'),
  Model = require('enyo/Model'),
  Button = require('moonstone/Button'),
  ProgressButton = require('moonstone/ProgressButton'),
  Marquee = require('moonstone/Marquee'),
  MarqueeText = Marquee.Text,
  BodyText = require('moonstone/BodyText'),
  LunaService = require('enyo-webos/LunaService'),
  LabeledTextItem = require('moonstone/LabeledTextItem');

function versionHigher(oldVer, newVer) {
  if (typeof oldVer !== 'string' || typeof newVer !== 'string') return false

  var oldParts = oldVer.split('.')
  var newParts = newVer.split('.')
  for (var i = 0; i < newParts.length; i++) {
    var a = ~~newParts[i] // parse int
    var b = ~~oldParts[i] // parse int
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

module.exports = kind({
  name: 'DetailsPanel',
  kind: Panel,
  title: '',
  titleBelow: '',
  headerType: 'medium',
  loading: true,
  error: false,
  components: [
    {kind: Spinner, name: 'spinner', content: 'Loading...', center: true, middle: true},
    {kind: Popup, name: 'errorPopup', content: 'An error occured while loading app info.', modal: false, autoDismiss: true, allowBackKey: true},
    {
      classes: 'moon-hspacing top', components: [
        {
          components: [
            {kind: Divider, content: 'App information'},
            {
              kind: LabeledTextItem,
              label: 'Version',
              name: 'version',
              text: 'unknown',
              disabled: true,
            },
            {
              kind: LabeledTextItem,
              label: 'Root required',
              name: 'rootRequired',
              text: 'unknown',
              disabled: true,
            },
            {
              components: [
                {
                  name: 'installButton', kind: ProgressButton, content: 'Install', progress: 0,
                  style: 'width:100%;min-width:100%;', ontap: 'installApp',
                  disabled: true,
                },
              ],
            },
            {
              components: [
                {
                  name: 'launchButton', kind: ProgressButton, content: 'Launch', progress: 0,
                  style: 'width:100%;min-width:100%;', ontap: 'launchApp',
                  disabled: true,
                },
              ],
            },
            {
              // WIP
              showing: false,
              components: [
                {
                  name: 'uninstallButton', kind: Button, content: 'Uninstall', style: 'width:100%;min-width:100%', small: true,
                  disabled: true,
                  ontap: 'uninstallApp',
                },
              ],
            },
          ],
          classes: 'moon-6h',
        },
        {
          components: [
            {kind: Divider, content: 'Description'},
            {
              name: 'appDescription',
              kind: BodyText,
              content: 'No description provided for this package'
            },
            {
              kind: LabeledTextItem,
              label: 'Project page',
              name: 'projectPage',
              text: 'unknown',
              disabled: true,
              ontap: 'openProjectPage',
            },
          ],
          classes: 'moon-16h',
        },
      ],
    },

    {
      kind: LunaService,
      name: 'appInfoCall',
      service: 'luna://org.webosbrew.hbchannel.service', // com.webos.applicationManager',
      method: 'getAppInfo',
      onResponse: 'onAppInfoResponse',
      onError: 'onAppInfoError',
    },
    {
      kind: LunaService,
      name: 'installCall',
      service: 'luna://org.webosbrew.hbchannel.service',
      method: 'install',
      onResponse: 'onInstallResponse',
      onError: 'onInstallError',
      subscribe: true,
    },
    {
      kind: LunaService,
      name: 'launchCall',
      service: 'luna://com.webos.applicationManager',
      method: 'launch',
      onResponse: 'onLaunchResponse',
      onError: 'onLaunchError',
    },
  ],
  bindings: [
    // This is model passed when launching the view
    {from: 'model.title', to: 'title'},
    {from: 'model.id', to: 'titleBelow'},

    // This is data loaded from the web service
    {from: 'packageInfo.title', to: 'title'},
    {from: 'packageInfo.id', to: 'titleBelow'},
    {
      from: 'packageInfo.appDescription', to: '$.appDescription.content', transform: function (description) {
        var appDescription = 'No description provided for this package'
        if (description instanceof String && description.trim().length) {
          appDescription = description;
        }
        return appDescription;
      }
    },
    {from: 'packageInfo.version', to: '$.version.text'},
    {from: 'packageInfo.sourceUrl', to: '$.projectPage.text'},
    {
      from: 'packageInfo.sourceUrl', to: '$.projectPage.disabled', transform: function (v) {
        return v instanceof String && v.trim().length
      }
    },
    {
      from: 'packageInfo.rootRequired', to: '$.rootRequired.text', transform: function (value) {
        return value === true ? 'yes' : value === false ? 'no' : value === 'optional' ? 'optional' : 'unknown';
      }
    },

    {
      from: 'packageInfo.status', to: '$.spinner.showing', transform: function (value) {
        console.info(this.packageInfo.isReady(), this.packageInfo.isError(), this.packageInfo.status);
        return !this.packageInfo.isReady() && !this.packageInfo.isError();
      }
    },
    {
      from: 'packageInfo.status', to: '$.errorPopup.showing', transform: function (value) {
        console.info('error:', this.packageInfo.isError());
        return this.packageInfo.isError();
      }
    },

    {
      from: 'appInfo', to: '$.installButton.content', transform: function (value) {
        if (!value) {
          return 'Install';
        } else {
          return 'Update';
        }
      },
    },

    {from: 'appInfo', to: '$.installButton.disabled', transform: 'installDisabled'},
    {from: 'packageInfo.status', to: '$.installButton.disabled', transform: 'installDisabled'},

    {
      from: 'appInfo', to: '$.launchButton.disabled', transform: function (value) {
        return !value; // === null;
      },
    },
    {
      from: 'appInfo', to: '$.uninstallButton.disabled', transform: function (value) {
        return !value; // === null;
      },
    },
  ],

  appInfo: undefined,

  transitionFinished: function () {
    // We are launching a web request in post transition to fix a race condition
    // when showing the error popup, whoops.
    console.info('transitionFinished');
    this.refresh();
  },

  installDisabled: function () {
    var disabled = this.appInfo === undefined || !this.packageInfo.isReady() || this.packageInfo.isError() || (this.appInfo !== null && this.appInfo.version === this.packageInfo.get('version'))
    console.info('installDisabled:', this.appInfo ? this.appInfo.version : undefined, this.packageInfo ? this.packageInfo.get('version') : undefined, disabled);
    return disabled;
  },

  refresh: function () {
    console.info('refresh');
    this.set('packageInfo', new Model(undefined, {
      source: new AjaxSource(),
      url: new URL(this.model.get('manifestUrl'), this.repositoryURL).href,
    }));
    this.packageInfo.fetch({
      // Why is model.status non-observable by default!?
      success: function (t) {t.set('status', t.status);},
      error: function (t) {t.set('status', t.status);},
    });
    this.$.appInfoCall.send({id: this.model.get("id")});
    console.info('appinfo sent:', this.appInfoRequest);
  },
  openProjectPage: function () {
    // TODO luna://com.webos.applicationManager/launch
    // {
    //   id: "com.webos.app.browser",
    //   params: {target: "..."},
    // }
    if (this.packageInfo.get('sourceUrl')) {
      this.$.launchCall.send({id: 'com.webos.app.browser', params: {target: this.packageInfo.get('sourceUrl')}});
    }
  },
  installApp: function () {
    console.info('installApp...');
    this.installRequest = this.$.installCall.send({
      ipkUrl: this.packageInfo.get('ipkUrl'),
      ipkHash: this.packageInfo.get('ipkHash').sha256,
      subscribe: true,
    });
    this.$.installButton.set('disabled', true);
  },
  launchApp: function () {
    this.$.launchCall.send({id: this.model.get("id")});
  },

  onInstallResponse: function (sender, msg) {
    console.info('installResponse:', msg, msg.finished, msg.statusText);
    if (msg.progress !== undefined && msg.progress < 99) {
      this.$.installButton.animateProgressTo(msg.progress);
    } else if (msg.finished) {
      console.info('Finishing!');
      this.$.installButton.set('progress', 100);
      this.$.installButton.set('disabled', false);
      this.$.installCall.cancel(this.installRequest);
      this.appInfoRequest = this.$.appInfoCall.send({id: this.model.get("id")});
    }
  },
  onInstallError: function (sender, msg) {
    console.info('install error:', msg);
    this.$.errorPopup.setContent('An error occured during installation: ' + msg.errorText);
    this.$.errorPopup.show();
    this.$.installButton.set('progress', 0);
    this.$.installButton.set('disabled', false);
    this.$.installCall.cancel(this.installRequest);
  },

  onAppInfoResponse: function (sender, msg) {
    console.info('appInfo:', msg, sender);
    if (msg.appInfo) {
      this.set('appInfo', msg.appInfo);
    } else {
      this.set('appInfo', null);
    }
  },
  onAppInfoError: function (sender, msg) {
    console.warn('appInfo read failed:', msg, sender);
    this.set('appInfo', null);
  },

  onLaunchResponse: function (sender, msg) {
    console.info('launch response:', msg);
  },
  onLaunchError: function (sender, msg) {
    console.warn('launch error:', msg);
  },
});
