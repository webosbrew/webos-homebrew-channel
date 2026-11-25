// The app shell: a stack of pages, like Limestone's Panels (Home, then Details or Settings on top).
//
// Opening a page adds a Back history entry; Back (or a page's back button) closes the top page and puts focus back
// where it was.

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control'),
  EnyoHistory = require('enyo/History'),
  Spotlight = require('spotlight'),
  HomeView = require('./HomeView.js'),
  SettingsView = require('./SettingsView.js');

// The stylesheet is laid out for 1080p at 24px per rem; scale that to the actual screen (720p TVs, desktop windows).
function fitRootFontSize() {
  var scale = Math.min(global.innerWidth / 1920, global.innerHeight / 1080);
  if (!(scale > 0)) scale = 1;
  document.documentElement.style.fontSize = (24 * scale) + 'px';
}

module.exports = kind({
  name: 'hb.MainView',
  kind: Control,
  classes: 'hb-app enyo-fit',

  handlers: {
    onRequestPushPanel: 'requestPushPanel',
    onRequestBack: 'requestBack',
  },

  components: [
    {name: 'pages', classes: 'hb-pages'},
  ],

  create: function () {
    this.inherited(arguments);
    document.title = 'Homebrew Channel';
    fitRootFontSize();
    global.addEventListener('resize', fitRootFontSize);

    this.stack = [];
    this.pushPage({kind: HomeView}, false);

    try {
      if (global.PalmSystem) {
        document.addEventListener('webOSRelaunch', (function (data) {
          this.processLaunchParams(data.detail);
        }).bind(this));
        this.processLaunchParams(JSON.parse(global.PalmSystem.launchParams));
      } else if (location.hash.length > 1) {
        var launchParams = JSON.parse(decodeURIComponent(location.hash.substring(1)));
        if (typeof launchParams === 'object') {
          this.processLaunchParams(launchParams);
        }
      }
    } catch (err) {
      console.warn('Process launch params failed:', err);
    }
  },

  rendered: function () {
    this.inherited(arguments);
    var top = this.stack[this.stack.length - 1];
    if (top) this.focusPage(top);
  },

  processLaunchParams: function (params) {
    console.info('parsing params:', params);
    if (params && typeof params === 'object' && params.launchMode === 'addRepository') {
      var self = this;
      setTimeout(function () {
        self.pushPage({kind: SettingsView, templateAddRepository: params.url});
      }, 300);
    }
  },

  requestPushPanel: function (sender, event) {
    this.pushPage(event.panel);
    return true;
  },

  requestBack: function () {
    if (this.stack.length > 1) EnyoHistory.pop();
    return true;
  },

  /**
   * Shows `definition` (a component definition) on top of the current page.
   */
  pushPage: function (definition, withHistory) {
    var below = this.stack[this.stack.length - 1];
    if (below) {
      below.lastFocus = Spotlight.getCurrent();
      this.setPageHidden(below, true);
    }

    var page = this.$.pages.createComponent(definition, {owner: this});
    this.stack.push(page);
    if (this.hasNode()) {
      page.render();
      this.focusPage(page);
    }
    document.title = page.title || 'Homebrew Channel';

    if (withHistory !== false) {
      EnyoHistory.push({context: this, handler: this.backKeyHandler});
    }
  },

  backKeyHandler: function () {
    this.popPage();
    return true;
  },

  popPage: function () {
    if (this.stack.length <= 1) return;
    var page = this.stack.pop();
    var closed = {app: page.app || null};
    page.destroy();

    var below = this.stack[this.stack.length - 1];
    this.setPageHidden(below, false);
    document.title = below.title || 'Homebrew Channel';
    if (below.pageShown) below.pageShown(closed);
    if (below.lastFocus && !below.lastFocus.destroyed && Spotlight.isSpottable(below.lastFocus)) {
      Spotlight.spot(below.lastFocus);
    } else {
      this.focusPage(below);
    }
  },

  // A page under another one keeps its layout (visibility, not display), so that coming back to it does not lay out
  // all of it again, which is slow on TVs with long app lists. It is not painted, and the remote cannot focus it.
  setPageHidden: function (page, hidden) {
    page.addRemoveClass('hb-page-hidden', hidden);
    page.spotlightDisabled = hidden;
    page.setAttribute('aria-hidden', hidden ? 'true' : null);
  },

  focusPage: function (page) {
    var target = page.initialFocus ? page.initialFocus() : null;
    if (target && Spotlight.isSpottable(target)) {
      Spotlight.spot(target);
    } else {
      Spotlight.spot(page);
    }
  },
});
