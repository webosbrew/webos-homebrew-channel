// A vertically scrolling area that keeps the remote-focused control in view.
// The Magic Remote's wheel and pointer scroll it natively (overflow: auto).

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control'),
  Spotlight = require('spotlight');

// Room kept between a focused control and the scroller's edges.
var MARGIN = 48;

module.exports = kind({
  name: 'hb.Scroller',
  kind: Control,
  classes: 'hb-scroller',

  handlers: {
    onSpotlightFocused: 'keepInView',
  },

  keepInView: function (sender, event) {
    // The Magic Remote's pointer focuses whatever it is over, which is in view already; scrolling then would move
    // the item out from under the pointer.
    if (Spotlight.getPointerMode()) return;
    this.scrollIntoView(event.originator);
  },

  scrollIntoView: function (control) {
    var scroller = this.hasNode();
    var node = control && control.hasNode && control.hasNode();
    if (!scroller || !node) return;

    var scrollerRect = scroller.getBoundingClientRect();
    var rect = node.getBoundingClientRect();
    var top = rect.top - scrollerRect.top;
    var bottom = rect.bottom - scrollerRect.top;

    if (top < MARGIN) {
      scroller.scrollTop = Math.max(0, scroller.scrollTop + top - MARGIN);
    } else if (bottom > scroller.clientHeight - MARGIN) {
      scroller.scrollTop += bottom - (scroller.clientHeight - MARGIN);
    }
  },

  scrollToTop: function () {
    if (this.hasNode()) this.node.scrollTop = 0;
  },
});
