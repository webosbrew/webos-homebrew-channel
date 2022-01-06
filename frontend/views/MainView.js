var
  kind = require('enyo/kind'),
  Panels = require('moonstone/Panels'),
  IconButton = require('moonstone/IconButton'),
  BrowserPanel = require('./BrowserPanel.js'),
  SettingsPanel = require('./SettingsPanel.js');

module.exports = kind({
  name: 'myapp.MainView',
  classes: 'moon enyo-fit main-view',
  components: [
    {
      kind: Panels,
      pattern: 'activity',
      hasCloseButton: false,
      wrap: true,
      popOnBack: true,
      components: [
        {
          kind: BrowserPanel,
        },
      ],
      onTransitionFinish: 'transitionFinish',
    }
  ],
  create: function () {
    this.inherited(arguments);
    document.title = 'Homebrew Channel';

    try {
      if (window.PalmSystem) {
        document.addEventListener('webOSRelaunch', (function(data) {
          this.processLaunchParams(data.detail);
        }).bind(this));
        this.processLaunchParams(JSON.parse(window.PalmSystem.launchParams));
      } else {
        var launchParams = JSON.parse(decodeURIComponent(location.hash.substring(1)));
        if (typeof launchParams === 'object') {
          this.processLaunchParams(launchParams);
        }
      }
    } catch (err) {
      console.warn('Process launch params failed:', err);
    }
  },
  processLaunchParams: function (params) {
    console.info('parsing params:', params);
    if (typeof params === 'object' && params.launchMode === 'addRepository') {
      console.info('panels:', this.$.panels);

      var self = this;
      setTimeout(function () {
        self.requestPushPanel(null, {
          panel: {
            kind: SettingsPanel,
            templateAddRepository: params.url,
          }
        });
      }, 500);
    }
  },
  handlers: {
    onRequestPushPanel: 'requestPushPanel',
  },
  transitionFinish: function (evt, sender) {
    document.title = this.$.panels.getActive().title;
  },
  requestPushPanel: function (sender, ev) {
    this.$.panels.pushPanel(ev.panel);
  },
});
