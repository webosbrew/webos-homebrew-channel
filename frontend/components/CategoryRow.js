// One category on the Discover page: its name and app count, then a horizontal row of its apps that slides along as
// the remote moves focus through it, ending in a "See all" tile.
//
// The row is a Spotlight container, so Up/Down move between rows and come back to the card last focused in each.
// The header's "See all" button is for the Magic Remote's pointer (which cannot slide the row); the arrow keys skip it
// and reach the tile at the end of the row instead.

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control'),
  Spotlight = require('spotlight'),
  AppCard = require('./AppCard.js'),
  Button = require('./Button.js');

// Cards shown in a row; the rest are behind "See all".
var LIMIT = 15;
// Room kept between the focused card and the row's edges.
var MARGIN = 120;

var SeeAllTile = kind({
  name: 'hb.SeeAllTile',
  kind: Control,
  spotlight: true,
  classes: 'hb-card hb-seeall',
  attributes: {role: 'button'},
  components: [
    {name: 'countNode', classes: 'hb-seeall-count'},
    {classes: 'hb-seeall-label', content: 'See all'},
  ],
  setCount: function (count, title) {
    this.$.countNode.set('content', String(count));
    this.setAttribute('aria-label', 'See all ' + count + ' ' + title + ' apps');
  },
});

module.exports = kind({
  name: 'hb.CategoryRow',
  kind: Control,
  classes: 'hb-category',
  attributes: {role: 'region'},

  // {id, title}, the repository packages in it, and the installed versions by app id.
  category: null,
  apps: null,
  installed: null,

  events: {
    onSeeAll: '',
    onOpenApp: '',
  },

  handlers: {
    onSpotlightFocused: 'keepInView',
  },

  components: [
    {classes: 'hb-category-head', components: [
      {tag: 'h2', classes: 'hb-category-title', components: [
        {name: 'titleNode', tag: 'span'},
        {name: 'countNode', tag: 'span', classes: 'hb-category-count'},
      ]},
      {name: 'seeAll', kind: Button, label: 'See all', spotlight: false, classes: 'hb-button-small', ontap: 'seeAllTapped'},
    ]},
    {name: 'track', classes: 'hb-track', spotlight: 'container', components: [
      {name: 'strip', classes: 'hb-strip'},
    ]},
  ],

  create: function () {
    this.inherited(arguments);
    var category = this.category || {};
    var apps = this.apps || [];
    this.$.titleNode.set('content', category.title);
    this.$.countNode.set('content', String(apps.length));
    this.setAttribute('aria-label', category.title);

    this.cards = [];
    for (var i = 0; i < apps.length && i < LIMIT; i++) {
      this.cards.push(this.$.strip.createComponent({
        kind: AppCard,
        app: apps[i],
        installedVersion: (this.installed && this.installed[apps[i].id]) || null,
        ontap: 'cardTapped',
      }, {owner: this}));
    }
    this.tile = this.$.strip.createComponent({kind: SeeAllTile, ontap: 'seeAllTapped'}, {owner: this});
    this.tile.setCount(apps.length, category.title);
  },

  seeAllTapped: function () {
    this.doSeeAll({category: this.category, row: this});
    return true;
  },

  cardTapped: function (sender) {
    this.doOpenApp({app: sender.app});
    return true;
  },

  keepInView: function (sender, event) {
    var target = event.originator;
    if ((target !== this.tile && this.cards.indexOf(target) === -1) || Spotlight.getPointerMode()) return;
    var track = this.$.track.hasNode();
    var node = target.hasNode();
    if (!track || !node) return;

    var trackRect = track.getBoundingClientRect();
    var rect = node.getBoundingClientRect();
    var left = rect.left - trackRect.left;
    var right = rect.right - trackRect.left;
    if (left < MARGIN) {
      track.scrollLeft = Math.max(0, track.scrollLeft + left - MARGIN);
    } else if (right > track.clientWidth - MARGIN) {
      track.scrollLeft += right - (track.clientWidth - MARGIN);
    }
  },
});
