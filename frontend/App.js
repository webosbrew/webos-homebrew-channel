/**
	Define your enyo/Application kind in this file.
*/

var
	kind = require('enyo/kind'),
	Application = require('enyo/Application'),
	MainView = require('./views/MainView');

module.exports = kind({
	kind: Application,
	view: MainView
});
