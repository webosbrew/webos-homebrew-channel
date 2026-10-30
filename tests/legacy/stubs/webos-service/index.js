/*
 * Stand-in for LG's `webos-service` module, used to load the *built* service
 * bundle under old Node.js versions without a Luna bus.
 *
 * MUST stay plain ES5 (var, function, no Promise): it runs on Node.js 0.10.
 */

'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');

function Subscription(uri, args) {
  EventEmitter.call(this);
  this.uri = uri;
  this.args = args;
  this.cancelled = false;
}
util.inherits(Subscription, EventEmitter);

Subscription.prototype.cancel = function () {
  this.cancelled = true;
};

Subscription.prototype.respond = function (payload) {
  this.emit('response', { payload: payload });
};

function Service(id, activityManager) {
  this.id = id;
  this.activityManager = activityManager;
  this.privateHandle = null;
  this.sendingHandle = null;
  this.handlers = {};
  this.calls = [];
  this.subscriptions = [];
  this.callScripts = {};
  this.subscribeScripts = {};
  Service.instances.push(this);
}

Service.instances = [];

Service.prototype.register = function (name, handler, cancel) {
  this.handlers[name] = { handler: handler, cancel: cancel };
};

Service.prototype.unregister = function () {};

Service.prototype.call = function (uri, args, callback) {
  this.calls.push({ uri: uri, args: args });
  var script = this.callScripts[uri];
  var payload;
  if (script === undefined) {
    payload = { returnValue: true };
  } else if (typeof script === 'function') {
    payload = script(args);
  } else {
    payload = script;
  }
  setTimeout(function () {
    callback({ payload: payload });
  }, 0);
};

Service.prototype.subscribe = function (uri, args) {
  var sub = new Subscription(uri, args);
  this.subscriptions.push(sub);
  var script = this.subscribeScripts[uri];
  if (script && script.length !== undefined && typeof script !== 'function') {
    var delay = 0;
    script.forEach(function (payload) {
      delay += 1;
      setTimeout(function () {
        if (!sub.cancelled) sub.respond(payload);
      }, delay);
    });
  } else if (typeof script === 'function') {
    setTimeout(function () {
      script(sub, args);
    }, 0);
  }
  return sub;
};

function Message() {}

module.exports = Service;
module.exports.Service = Service;
module.exports.Message = Message;
module.exports.Subscription = Subscription;
