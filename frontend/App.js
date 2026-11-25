/**
  Define your enyo/Application kind in this file.
*/

var
  kind = require('enyo/kind'),
  Application = require('enyo/Application'),
  // Remote-control focus handling (5-way navigation, the Magic Remote pointer, OK as tap).
  Spotlight = require('spotlight'),
  MainView = require('./views/MainView');

module.exports = kind({
  kind: Application,
  view: MainView
});
