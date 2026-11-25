// One category on the Discover page: its name, app count and a "See all" button, then a horizontal row of all its
// apps that slides along as the remote moves focus through it.
//
// The row is a Spotlight container, so Up/Down move between rows and come back to the card last focused in each.
// Down from a card always goes to the next row's cards; nearest-first would take it to that row's "See all" button
// when the focused card is on the right. The button is reached with Up instead, from where it sits.

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control'),
  Spotlight = require('spotlight'),
  AppCard = require('./AppCard.js'),
  Button = require('./Button.js');

// Room kept between the focused card and the row's edges.
var MARGIN = 120;

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
    onSpotlightDown: 'downFromCard',
  },

  components: [
    {classes: 'hb-heading', components: [
      {tag: 'h2', classes: 'hb-heading-title', components: [
        {name: 'titleNode', tag: 'span'},
        {name: 'countNode', tag: 'span', classes: 'hb-heading-count'},
      ]},
      {name: 'seeAll', kind: Button, label: 'See all', size: 'small', ontap: 'seeAllTapped'},
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
    this.$.seeAll.setAttribute('aria-label', 'See all ' + apps.length + ' ' + category.title + ' apps');

    this.cards = [];
    for (var i = 0; i < apps.length; i++) {
      this.cards.push(this.$.strip.createComponent({
        kind: AppCard,
        app: apps[i],
        installedVersion: (this.installed && this.installed[apps[i].id]) || null,
        ontap: 'cardTapped',
      }, {owner: this}));
    }
  },

  seeAllTapped: function () {
    this.doSeeAll({category: this.category, row: this});
    return true;
  },

  cardTapped: function (sender) {
    this.doOpenApp({app: sender.app});
    return true;
  },

  downFromCard: function (sender, event) {
    if (this.cards.indexOf(event.originator) === -1) return false;
    var rows = this.parent ? this.parent.getClientControls() : [];
    var next = rows[rows.indexOf(this) + 1];
    if (!next || !next.cards || !next.cards.length) return false;
    Spotlight.spot(next.$.track);
    return true;
  },

  keepInView: function (sender, event) {
    var target = event.originator;
    if (this.cards.indexOf(target) === -1 || Spotlight.getPointerMode()) return;
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
