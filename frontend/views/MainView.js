var
  kind = require('enyo/kind'),
  Panels = require('moonstone/Panels'),
  IconButton = require('moonstone/IconButton'),
  BrowserPanel = require('./BrowserPanel.js');

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
  handlers: {
    onRequestPushPanel: 'requestPushPanel',
  },
  transitionFinish: function (evt, sender) {
    document.title = this.$.panels.getActive().title;
  },
  /*
  observers: [
    // the path can be a single string or an array of strings
    {method: 'panelChanged', path: ['$.panels.index']}
  ],
  panelChanged: function (oldIndex, newIndex) {
    console.info('PANEL CHANGED', oldIndex, newIndex);
    // document.title = this.$.panels.getActive().title;
  },
  */
  requestPushPanel: function (sender, ev) {
    this.$.panels.pushPanel(ev.panel);
  },
});
