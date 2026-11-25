// An app's screenshots, one at a time, with arrows on either side to slide through them and the position in a corner.
// The caption is only the image's text alternative, so that the gallery takes no room beyond its frame.
//
// Made for old TVs: only the screenshot on screen is loaded (some are over 2000px wide, and old TVs have little
// memory), it is fitted with plain positioning rather than object-fit, and a screenshot the TV cannot show (WebP on
// webOS 1 and 2, or a broken link) is replaced by a note instead of an empty frame.

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control'),
  EnyoImage = require('enyo/Image'),
  Button = require('./Button.js'),
  icons = require('../icons.js');

module.exports = kind({
  name: 'hb.Gallery',
  kind: Control,
  classes: 'hb-gallery',
  attributes: {role: 'region', 'aria-label': 'Screenshots'},

  published: {
    // [{url, caption}], as in the repository's package entry.
    screenshots: null,
  },

  components: [
    {name: 'frame', classes: 'hb-gallery-frame', components: [
      // enyo/Image passes the image's load and error events on, which a plain <img> does not.
      {name: 'image', kind: EnyoImage, classes: 'hb-gallery-image', alt: '', onload: 'imageLoaded', onerror: 'imageFailed'},
      {name: 'note', classes: 'hb-gallery-note', showing: false},
      {name: 'previousButton', kind: Button, iconOnly: true, icon: icons.previous, label: 'Previous screenshot',
        classes: 'hb-gallery-arrow hb-gallery-previous', ontap: 'showPrevious'},
      {name: 'nextButton', kind: Button, iconOnly: true, icon: icons.next, label: 'Next screenshot',
        classes: 'hb-gallery-arrow hb-gallery-next', ontap: 'showNext'},
      {name: 'position', classes: 'hb-gallery-position', showing: false},
    ]},
  ],

  create: function () {
    this.inherited(arguments);
    this.index = 0;
    this.screenshotsChanged();
  },

  screenshotsChanged: function () {
    var list = (this.screenshots || []).filter(function (shot) { return shot && shot.url; });
    this.list = list;
    this.index = 0;
    this.set('showing', list.length > 0);
    var several = list.length > 1;
    this.$.previousButton.set('showing', several);
    this.$.nextButton.set('showing', several);
    if (list.length) this.showScreenshot();
  },

  showScreenshot: function () {
    var shot = this.list[this.index];
    this.$.note.set('showing', false);
    this.$.image.set('showing', true);
    this.$.image.addClass('hb-gallery-loading');
    this.$.image.set('src', shot.url);
    this.$.image.set('alt', shot.caption || '');
    this.$.position.set('showing', this.list.length > 1);
    this.$.position.set('content', (this.index + 1) + ' / ' + this.list.length);
  },

  imageLoaded: function () {
    this.$.image.removeClass('hb-gallery-loading');
    return true;
  },

  imageFailed: function () {
    this.$.image.set('showing', false);
    this.$.note.set('content', 'This screenshot can’t be shown on this TV.');
    this.$.note.set('showing', true);
    return true;
  },

  // The arrows go round: after the last screenshot comes the first.
  showPrevious: function () {
    this.index = (this.index + this.list.length - 1) % this.list.length;
    this.showScreenshot();
    return true;
  },

  showNext: function () {
    this.index = (this.index + 1) % this.list.length;
    this.showScreenshot();
    return true;
  },
});
