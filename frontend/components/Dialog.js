// A modal dialog in the style of Limestone's overlay Alert: a title, a message, optional content (the instance's own
// components) and buttons.
//
// Back closes it (unless `dismissible` is false), and focus goes back to where it was when it opened.
//
//   {kind: Dialog, name: 'errorDialog', title: 'Something went wrong', buttons: [{label: 'OK', action: 'close'}]}
//
// A button's `action` is passed in the onAction event; 'close' just closes the dialog.

var
  kind = require('enyo/kind'),
  Control = require('enyo/Control'),
  EnyoHistory = require('enyo/History'),
  Spotlight = require('spotlight'),
  Button = require('./Button.js');

module.exports = kind({
  name: 'hb.Dialog',
  kind: Control,
  classes: 'hb-dialog-overlay',
  showing: false,
  spotlight: 'container',
  spotlightModal: true,

  published: {
    title: '',
    message: '',
    allowHtmlMessage: false,
    dismissible: true,
    buttons: null,
    // For confirmations of something hard to undo: focus starts on the first button (Cancel), not the last.
    safeFocus: false,
  },

  events: {
    onAction: '',
    onClosed: '',
  },

  controlParentName: 'body',

  components: [
    {name: 'box', classes: 'hb-dialog', attributes: {role: 'dialog', 'aria-modal': 'true'}, components: [
      {name: 'titleNode', tag: 'h2', classes: 'hb-dialog-title'},
      {name: 'messageNode', classes: 'hb-dialog-message'},
      {name: 'body', classes: 'hb-dialog-body'},
      {name: 'buttonRow', classes: 'hb-dialog-buttons'},
    ]},
  ],

  create: function () {
    this.inherited(arguments);
    this.titleChanged();
    this.messageChanged();
    this.buttonsChanged();
  },

  titleChanged: function () {
    this.$.titleNode.set('content', this.title);
    this.$.titleNode.set('showing', !!this.title);
  },

  messageChanged: function () {
    this.$.messageNode.set('allowHtml', !!this.allowHtmlMessage);
    this.$.messageNode.set('content', this.message);
    this.$.messageNode.set('showing', !!this.message);
  },

  allowHtmlMessageChanged: function () {
    this.messageChanged();
  },

  buttonsChanged: function () {
    this.$.buttonRow.destroyClientControls();
    var defs = this.buttons || [];
    for (var i = 0; i < defs.length; i++) {
      this.$.buttonRow.createComponent({
        kind: Button,
        label: defs[i].label,
        variant: defs[i].variant || '',
        action: defs[i].action,
        ontap: 'buttonTapped',
      }, {owner: this});
    }
    this.$.buttonRow.set('showing', defs.length > 0);
    if (this.hasNode()) this.$.buttonRow.render();
  },

  /**
   * Opens the dialog; `focus` is the control to focus first (default: the last button, or the first with safeFocus).
   */
  open: function (focus) {
    if (this.showing) return;
    this.previousFocus = Spotlight.getCurrent();
    this.set('showing', true);
    if (this.dismissible) {
      EnyoHistory.push({context: this, handler: this.backKeyHandler});
      this.inHistory = true;
    }
    var buttons = this.$.buttonRow.getClientControls();
    var target = focus || (this.safeFocus ? buttons[0] : buttons[buttons.length - 1]);
    if (target) Spotlight.spot(target);
  },

  /**
   * Closes the dialog. With a Back history entry, it is taken off the history, which closes the dialog.
   */
  close: function () {
    if (!this.showing) return;
    if (this.inHistory) {
      EnyoHistory.pop();
    } else {
      this.closeNow();
    }
  },

  backKeyHandler: function () {
    this.closeNow();
    return true;
  },

  closeNow: function () {
    this.inHistory = false;
    this.set('showing', false);
    if (this.previousFocus && !this.previousFocus.destroyed) {
      Spotlight.spot(this.previousFocus);
    }
    this.doClosed();
  },

  buttonTapped: function (sender) {
    if (sender.action === 'close') {
      this.close();
    } else {
      this.doAction({action: sender.action});
    }
    return true;
  },
});
