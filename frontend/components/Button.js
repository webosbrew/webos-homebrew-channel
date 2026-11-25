// A focusable glass button with an optional icon and progress fill.
//
//   variant:  '' (glass), 'primary', 'danger'
//   size:     '' or 'large'; iconOnly makes a round icon button
//   progress: null, or 0–100 to show the button as a progress bar (e.g. while installing)

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control'),
  util = require('../util.js');

module.exports = kind({
  name: 'hb.Button',
  kind: Control,
  spotlight: true,
  classes: 'hb-button',
  attributes: {role: 'button'},

  published: {
    label: '',
    icon: '',
    variant: '',
    size: '',
    iconOnly: false,
    progress: null,
    disabled: false,
  },

  handlers: {
    ontap: 'handleTap',
  },

  components: [
    {name: 'progressBar', classes: 'hb-button-progress', showing: false},
    {name: 'labelNode', tag: 'span', classes: 'hb-button-label', allowHtml: true},
  ],

  create: function () {
    this.inherited(arguments);
    this.variantChanged(null);
    this.sizeChanged(null);
    this.iconOnlyChanged();
    this.disabledChanged();
    this.progressChanged();
    this.renderLabel();
  },

  labelChanged: function () { this.renderLabel(); },
  iconChanged: function () { this.renderLabel(); },

  renderLabel: function () {
    this.$.labelNode.set('content', (this.icon || '') + (this.iconOnly ? '' : util.escapeHTML(this.label)));
    if (this.iconOnly) this.setAttribute('aria-label', this.label);
  },

  variantChanged: function (old) {
    if (old) this.removeClass('hb-button-' + old);
    if (this.variant) this.addClass('hb-button-' + this.variant);
  },

  sizeChanged: function (old) {
    if (old) this.removeClass('hb-button-' + old);
    if (this.size) this.addClass('hb-button-' + this.size);
  },

  iconOnlyChanged: function () {
    this.addRemoveClass('hb-button-icon', !!this.iconOnly);
  },

  disabledChanged: function () {
    this.addRemoveClass('disabled', !!this.disabled);
    this.setAttribute('aria-disabled', this.disabled ? 'true' : null);
  },

  progressChanged: function () {
    var active = typeof this.progress === 'number';
    this.$.progressBar.set('showing', active);
    this.addRemoveClass('hb-busy', active);
    if (active) {
      this.$.progressBar.applyStyle('width', Math.max(0, Math.min(100, this.progress)) + '%');
    }
  },

  handleTap: function () {
    // A disabled button swallows the tap, so that its owner's handler never runs.
    return !!this.disabled;
  },
});
