// A settings row with a label, an optional description and an on/off switch. OK toggles it.

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control');

module.exports = kind({
  name: 'hb.ToggleRow',
  kind: Control,
  spotlight: true,
  classes: 'hb-row',
  attributes: {role: 'switch'},

  published: {
    label: '',
    description: '',
    checked: false,
    disabled: false,
  },

  events: {
    onChange: '',
  },

  handlers: {
    ontap: 'toggle',
  },

  components: [
    {classes: 'hb-row-text', components: [
      {name: 'labelNode', classes: 'hb-row-label'},
      {name: 'descriptionNode', classes: 'hb-row-description', showing: false},
    ]},
    {classes: 'hb-switch', attributes: {'aria-hidden': 'true'}, components: [
      {classes: 'hb-switch-knob'},
    ]},
  ],

  create: function () {
    this.inherited(arguments);
    this.labelChanged();
    this.descriptionChanged();
    this.checkedChanged();
    this.disabledChanged();
  },

  labelChanged: function () {
    this.$.labelNode.set('content', this.label);
  },

  descriptionChanged: function () {
    this.$.descriptionNode.set('content', this.description);
    this.$.descriptionNode.set('showing', !!this.description);
  },

  checkedChanged: function () {
    this.addRemoveClass('checked', !!this.checked);
    this.setAttribute('aria-checked', this.checked ? 'true' : 'false');
  },

  disabledChanged: function () {
    this.addRemoveClass('disabled', !!this.disabled);
    this.setAttribute('aria-disabled', this.disabled ? 'true' : null);
  },

  toggle: function () {
    if (this.disabled) return true;
    this.set('checked', !this.checked);
    this.doChange({checked: this.checked});
    return true;
  },
});
