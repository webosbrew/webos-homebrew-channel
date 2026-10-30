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
  // ES5 build generated from the dompurify package by tools/build-dompurify.js
  DOMPurify = require('../vendor/purify.es5.js'),
  resolveURL = require('../baseurl').resolveURL,
  contract = require('../core/service-contract'),
  manifest = require('../core/manifest');

/**
 * Finds the closest <a href> ancestor of a DOM node, stopping at `root`.
 */
function findLink(node, root) {
  while (node && node !== root) {
    if (node.tagName === 'A' && node.href) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
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
      style: 'width: 5rem; height: 5rem; float: left; padding-right: 1rem; padding-top: 0.25rem;',
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
                onclick: 'onDescriptionClick',
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
      service: contract.SERVICE_URI,
      method: contract.METHODS.getAppInfo,
      onResponse: 'onAppInfoResponse',
      onError: 'onAppInfoError',
    },
    {
      kind: LunaService,
      name: 'installCall',
      service: contract.SERVICE_URI,
      method: contract.METHODS.install,
      onResponse: 'onInstallResponse',
      onError: 'onInstallError',
      subscribe: true,
    },
    {
      kind: LunaService,
      name: 'uninstallCall',
      service: contract.SERVICE_URI,
      method: contract.METHODS.uninstall,
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
      return manifest.wrapDescription(DOMPurify.sanitize(description, manifest.DESCRIPTION_SANITIZE_CONFIG));
    }},

    {from: 'packageInfo.version', to: '$.version.text', transform: 'version'},
    {from: 'appInfo', to: '$.version.text', transform: 'version'},

    {from: 'packageInfo.sourceUrl', to: '$.projectPage.text'},
    {
      from: 'packageInfo.sourceUrl', to: '$.projectPage.disabled', transform: function (v) {
        return !manifest.projectPageEnabled(v);
      }
    },
    {from: 'packageInfo.rootRequired', to: '$.rootRequired.text', transform: manifest.rootRequiredText},

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

    {from: 'appInfo', to: '$.installButton.content', transform: manifest.installButtonLabel},

    {from: 'appInfo', to: '$.installButton.disabled', transform: 'installDisabled'},
    {from: 'packageInfo.status', to: '$.installButton.disabled', transform: 'installDisabled'},

    {
      from: 'appInfo', to: '$.launchButton.disabled', transform: function (value) {
        return !manifest.canLaunch(value, this.model.get('id'));
      },
    },
    {
      from: 'appInfo', to: '$.uninstallButton.disabled', transform: function (value) {
        return !manifest.canUninstall(value, this.model.get('id'));
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
    return manifest.subtitleText(id, this.model.get('official'), this.repositoryURL);
  },

  manifestState: function () {
    var ready = !!(this.packageInfo && this.packageInfo.isReady());
    return {
      ready: ready,
      error: !!(this.packageInfo && this.packageInfo.isError()),
      version: ready ? this.packageInfo.get('version') : undefined,
    };
  },

  version: function (v) {
    return manifest.versionText(this.manifestState().version, this.appInfo);
  },

  installDisabled: function () {
    var disabled = manifest.installDisabled(this.appInfo, this.manifestState());
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
          return {content: manifest.fullDescription(data)};
        },
      }));
      this.descriptionModel.fetch({
        handleAs: 'text',
        success: function (t) {t.set('status', t.status);},
        error: function(t) {t.set('status', t.status);},
      });
    } else {
      this.set('descriptionModel', new Model({content: manifest.fallbackDescription(this.model.get('shortDescription'))}));
      this.descriptionModel.set('status', States.READY);
    }

    this.$.appInfoCall.send(contract.buildGetAppInfoPayload(this.model.get('id')));
    console.info('appinfo sent:', this.appInfoRequest);
  },
  openInBrowser: function (url) {
    if (typeof url === 'string' && url.length) {
      this.$.launchCall.send({id: 'com.webos.app.browser', params: {target: url}});
    }
  },
  openProjectPage: function () {
    this.openInBrowser(this.packageInfo.get('sourceUrl'));
  },
  /**
   * Links in the (sanitized) description are opened in the system browser
   * instead of navigating the app's webview away.
   */
  onDescriptionClick: function (sender, evt) {
    var link = findLink(evt.target, sender.hasNode());
    if (link) {
      evt.preventDefault();
      this.openInBrowser(link.href);
      return true;
    }
  },
  installApp: function () {
    console.info('installApp...');
    var payload;
    try {
      payload = contract.buildInstallPayload(
        {
          ipkUrl: this.packageInfo.get('ipkUrl'),
          ipkHash: this.packageInfo.get('ipkHash'),
          id: this.model.get('id'),
        },
        this.model.get('manifestUrl'),
        this.repositoryURL
      );
    } catch (err) {
      this.showError({errorText: err.message}, 'installation');
      return;
    }
    this.installRequest = this.$.installCall.send(payload);
    this.$.installButton.set('disabled', true);
  },
  launchApp: function () {
    this.$.launchCall.send({id: this.model.get("id")});
  },
  uninstallApp: function () {
    this.$.uninstallCall.send(contract.buildUninstallPayload(this.model.get('id')));
    this.$.uninstallButton.set('disabled', false);
  },

  onInstallResponse: function (sender, msg) {
    console.info('installResponse:', msg, msg.finished, msg.statusText);
    var event = contract.classifyInstallResponse(msg);
    switch (event.type) {
      case 'progress':
        if (event.percent < 99) {
          this.$.installButton.animateProgressTo(event.percent);
        }
        break;
      case 'finished':
        console.info('Finishing!');
        this.$.installButton.set('progress', 100);
        this.$.installButton.set('disabled', false);
        this.$.installCall.cancel(this.installRequest);
        this.appInfoRequest = this.$.appInfoCall.send(contract.buildGetAppInfoPayload(this.model.get('id')));
        break;
      case 'error':
        // LunaService routes returnValue:false to onInstallError; nothing to do here.
        break;
      default:
        break;
    }
  },

  showError: function(msg, operation) {
    console.info('install error:', msg);
    this.$.errorPopup.setContent(DOMPurify.sanitize(contract.formatOperationError(msg, operation)));
    this.$.errorPopup.show();
  },

  onInstallError: function (sender, msg) {
    this.showError(msg, 'installation');
    this.$.installButton.set('progress', 0);
    this.$.installButton.set('disabled', false);
    this.$.installCall.cancel(this.installRequest);
  },

  onUninstallResponse: function(sender, msg) {
    this.$.appInfoCall.send(contract.buildGetAppInfoPayload(this.model.get('id')));
  },

  onUninstallError: function (sender, msg) {
    this.showError(msg, 'removal');
    this.$.appInfoCall.send(contract.buildGetAppInfoPayload(this.model.get('id')));
  },

  onAppInfoResponse: function (sender, msg) {
    console.info('appInfo:', msg, sender);
    this.set('appInfo', contract.parseAppInfoResponse(msg));
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
