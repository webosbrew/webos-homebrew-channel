// A block of long text (an app's description) that the remote can read through: focus it, and Up/Down scroll it.
// At the top or bottom, Up/Down move focus on as usual.

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

  handlers: {
    onSpotlightUp: 'scrollUp',
    onSpotlightDown: 'scrollDown',
    onSpotlightFocused: 'focused',
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
