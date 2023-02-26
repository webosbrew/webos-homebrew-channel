var
  kind = require('enyo/kind'),
  Panel = require('moonstone/Panel'),
  AjaxSource = require('enyo/AjaxSource'),
  Spinner = require('moonstone/Spinner'),
  Popup = require('moonstone/Popup'),
  Icon = require('moonstone/Icon'),
  Divider = require('moonstone/Divider'),
  Item = require('moonstone/Item'),
  MoonImage = require('moonstone/Image'),
  Model = require('enyo/Model'),
  States = require('enyo/States'),
  Button = require('moonstone/Button'),
  ProgressButton = require('moonstone/ProgressButton'),
  Marquee = require('moonstone/Marquee'),
  MarqueeText = Marquee.Text,
  BodyText = require('moonstone/BodyText'),
  LunaService = require('enyo-webos/LunaService'),
  Scroller = require('moonstone/Scroller'),
  LabeledTextItem = require('moonstone/LabeledTextItem'),
  FittableRows = require('layout/FittableRows'),
  FittableColumns = require('layout/FittableColumns'),
  DOMPurify = require('dompurify/dist/purify.cjs.js'),
  resolveURL = require('../baseurl').resolveURL;

DOMPurify.addHook('afterSanitizeAttributes', function (node) {
  if ('href' in node) {
    console.info(node);

    node.setAttribute('data-href', node.href);
    node.setAttribute('href', 'javascript:openLinkInBrowser(' + JSON.stringify(node.href)+ ')');
  }
});


global.openLinkInBrowser = function (url) {
  try {
    webOS.service.request('luna://com.webos.applicationManager', {
      method: 'launch',
      parameters: {id: 'com.webos.app.browser', params: {target: url}},
      onSuccess: function(res) { console.info(res); },
      onFailure: function(res) { console.warn(res); },
    });
  } catch (err) {
    console.warn(err);
  }
}

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
  headerComponents: [
    {
      kind: MoonImage,
      name: 'headerImage',
      style: 'width: 100px; height: 100px; float: left; padding-right: 20px; padding-top: 5px',
      sizing: 'contain',
    },
  ],
  handlers: {
    onSpotlightKeyUp: 'onKeyUp',
  },
  components: [
    {kind: Spinner, name: 'spinner', content: 'Loading...', center: true, middle: true},
    {kind: Popup, name: 'errorPopup', content: 'An error occured while loading app info.', modal: false, autoDismiss: true, allowBackKey: true, allowHtml: true},
    {
      kind: FittableColumns,
      classes: 'enyo-fill',
      components: [
        {classes: 'moon-6h', components: [
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
                classes: 'full-button',
                minWidth: false,
                ontap: 'installApp',
                disabled: true,
              },
            ],
          },
          {
            components: [
              {
                name: 'launchButton', kind: Button, content: 'Launch',
                classes: 'full-button',
                minWidth: false,
                ontap: 'launchApp',
                disabled: true,
              },
            ],
          },
          {
            components: [
              {
                name: 'uninstallButton', kind: Button, content: 'Uninstall',
                classes: 'full-button',
                minWidth: false,
                ontap: 'uninstallApp',
                disabled: true,
                small: true,
              },
            ],
          },
        ]},

        {kind: FittableRows, fit: true, components: [
          {kind: Divider, content: 'Description'},
          {fit: true,
            kind: Scroller,
            horizontal: 'hidden',
            spotlightPagingControls: true,
            components: [
              {
                name: 'appDescription',
                kind: BodyText,
                classes: 'app-description',
                content: 'No description provided for this package',
                allowHtml: true,
                spotlight: true,
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
          },
        ]}
      ]
    },

    {
      kind: LunaService,
      name: 'appInfoCall',
      service: 'luna://org.webosbrew.hbchannel.service',
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
      name: 'uninstallCall',
      service: 'luna://org.webosbrew.hbchannel.service',
      method: 'uninstall',
      onResponse: 'onUninstallResponse',
      onError: 'onUninstallError',
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
    {from: 'model.iconUri', to: '$.headerImage.src'},
    {from: 'model.title', to: 'title'},
    {from: 'model.id', to: 'titleBelow', transform: 'subtitleID'},

    // This is data loaded from the web service
    {from: 'packageInfo.title', to: 'title'},
    {from: 'packageInfo.id', to: 'titleBelow', transform: 'subtitleID'},
    {from: 'descriptionModel.content', to: '$.appDescription.content', transform: function (description) {
      var sanitized = DOMPurify.sanitize(description, {FORBID_TAGS: ['style', 'form', 'input', 'button']});
      return '<div class="rich-description">' + sanitized + '</div>';
    }},

    {from: 'packageInfo.version', to: '$.version.text', transform: 'version'},
    {from: 'appInfo', to: '$.version.text', transform: 'version'},

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
        return this.packageInfo.isBusy();
      }
    },
    {
      from: 'packageInfo.status', to: '$.errorPopup.showing', transform: function (value) {
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
        return !value || this.model.get('id') == 'org.webosbrew.hbchannel';
      },
    },
    {
      from: 'appInfo', to: '$.uninstallButton.disabled', transform: function (value) {
        return !value || this.model.get('id') == 'org.webosbrew.hbchannel';
      },
    },
  ],

  appInfo: undefined,

  transitionFinished: function (evt) {
    // We are launching a web request in post transition to fix a race condition
    // when showing the error popup, whoops.
    if (!evt.isOffscreen) {
      this.refresh();
    }
  },

  subtitleID: function (id) {
    return id + (!this.model.get('official') ? ' (from ' + this.repositoryURL + ')' : '');
  },

  version: function (v) {
    var pkgver = (this.packageInfo && this.packageInfo.isReady()) ? this.packageInfo.get('version') : 'unknown';
    var localver = (this.appInfo && this.appInfo.version) ? this.appInfo.version : undefined;
    return pkgver + ((localver && localver != pkgver) ? ' (installed: ' + localver + ')' : '');
  },

  installDisabled: function () {
    var disabled = this.appInfo === undefined || !this.packageInfo.isReady() || this.packageInfo.isError() || (this.appInfo !== null && this.appInfo.version === this.packageInfo.get('version'))
    console.info('installDisabled:', this.appInfo ? this.appInfo.version : undefined, this.packageInfo ? this.packageInfo.get('version') : undefined, disabled);
    return disabled;
  },

  refresh: function () {
    console.info('refresh');
    if (this.model.get('manifest')) {
      this.set('packageInfo', new Model(this.model.get('manifest')));
      this.packageInfo.set('status', States.READY);
    } else {
      this.set('packageInfo', new Model(undefined, {
        source: new AjaxSource(),
        url: resolveURL(this.model.get('manifestUrl'), this.repositoryURL),
      }));
      this.packageInfo.fetch({
        // Why is model.status non-observable by default!?
        success: function (t) {t.set('status', t.status);},
        error: function (t) {t.set('status', t.status);},
      });
    }

    if (this.model.get('fullDescriptionUrl')) {
      this.set('descriptionModel', new Model(undefined, {
        source: new AjaxSource(),
        options: {parse: true},
        url: resolveURL(this.model.get('fullDescriptionUrl'), this.repositoryURL),
        parse: function (data) {
          return {content: data || '<p>No description provided for this package</p>'};
        },
      }));
      this.descriptionModel.fetch({
        handleAs: 'text',
        success: function (t) {t.set('status', t.status);},
        error: function(t) {t.set('status', t.status);},
      });
    } else {
      this.set('descriptionModel', new Model({content: this.model.get('shortDescription') || '<p>No description provided for this package</p>'}));
      this.descriptionModel.set('status', States.READY);
    }

    this.$.appInfoCall.send({id: this.model.get("id")});
    console.info('appinfo sent:', this.appInfoRequest);
  },
  openProjectPage: function () {
    if (this.packageInfo.get('sourceUrl')) {
      this.$.launchCall.send({id: 'com.webos.app.browser', params: {target: this.packageInfo.get('sourceUrl')}});
    }
  },
  installApp: function () {
    console.info('installApp...');
    this.installRequest = this.$.installCall.send({
      ipkUrl: resolveURL(this.packageInfo.get('ipkUrl'), this.model.get('manifestUrl') || this.repositoryURL),
      ipkHash: this.packageInfo.get('ipkHash').sha256,
      id: this.model.get("id"),
      subscribe: true,
    });
    this.$.installButton.set('disabled', true);
  },
  launchApp: function () {
    this.$.launchCall.send({id: this.model.get("id")});
  },
  uninstallApp: function () {
    this.$.uninstallCall.send({id: this.model.get("id")});
    this.$.uninstallButton.set('disabled', false);
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

  showError: function(msg, operation) {
    console.info('install error:', msg);
    var errorMessage = 'An error occured during ' + operation + ': ' + msg.errorText;
    if (msg.errorText.indexOf('luna-send-pub') != -1 && msg.errorText.indexOf('ECONNREFUSED') != -1) {
      errorMessage += '<br /><br />If you just updated Homebrew Channel app you may need to perform a reboot.';
    }
    this.$.errorPopup.setContent(DOMPurify.sanitize(errorMessage));
    this.$.errorPopup.show();
  },

  onInstallError: function (sender, msg) {
    this.showError(msg, 'installation');
    this.$.installButton.set('progress', 0);
    this.$.installButton.set('disabled', false);
    this.$.installCall.cancel(this.installRequest);
  },

  onUninstallResponse: function(sender, msg) {
    this.$.appInfoCall.send({id: this.model.get("id")});
  },

  onUninstallError: function (sender, msg) {
    this.showError(msg, 'removal');
    this.$.appInfoCall.send({id: this.model.get("id")});
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

  onKeyUp: function (sender, evt) {
    // Remote button "5"
    if (evt.keyCode == 53) {
      this.$.installButton.set('disabled', false);
      this.$.installButton.set('content', 'Reinstall');
    }
  }
});
