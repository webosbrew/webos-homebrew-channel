// A block of long text (an app's description) that the remote can read through: focus it, and Up/Down scroll it.
// At the top or bottom, Up/Down move focus on as usual. It sends onTextScrolled when it scrolls, by the remote or by
// the Magic Remote's wheel.

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control');

var STEP = 160;

module.exports = kind({
  name: 'hb.TextBlock',
  kind: Control,
  spotlight: true,
  classes: 'hb-textblock',
  allowHtml: true,

  events: {
    onTextScrolled: '',
  },

  handlers: {
    onSpotlightUp: 'scrollUp',
    onSpotlightDown: 'scrollDown',
    onSpotlightFocused: 'focused',
  },

  rendered: function () {
    this.inherited(arguments);
    var self = this;
    // Scroll events do not bubble, so Enyo does not dispatch them; listen on the node.
    if (this.hasNode()) {
      this.node.addEventListener('scroll', function () {
        self.doTextScrolled();
      }, false);
    }
  },

  // Whether part of the text is below the visible area.
  hasMoreBelow: function () {
    var node = this.hasNode();
    return !!node && this.canScroll() && node.scrollTop + node.clientHeight < node.scrollHeight - 2;
  },

  focused: function () {
    // The scrollbar-free box needs a cue that there is more to read.
    this.updateOverflowHint();
  },

  canScroll: function () {
    var node = this.hasNode();
    return node && node.scrollHeight > node.clientHeight + 2;
  },

  scrollUp: function () {
    var node = this.hasNode();
    if (!this.canScroll() || node.scrollTop <= 0) return false;
    node.scrollTop = Math.max(0, node.scrollTop - STEP);
    return true;
  },

  scrollDown: function () {
    var node = this.hasNode();
    if (!this.canScroll() || node.scrollTop + node.clientHeight >= node.scrollHeight - 1) return false;
    node.scrollTop += STEP;
    return true;
  },

  contentChanged: function () {
    this.inherited(arguments);
    if (this.hasNode()) this.node.scrollTop = 0;
  },

  updateOverflowHint: function () {
    this.setAttribute('aria-description', this.canScroll() ? 'Use up and down to scroll' : null);
  },
});
