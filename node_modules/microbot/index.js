'use strict';
var Base = require('base');
var plugin = require('base-plugins');
var option = require('base-options');

var debug = require('debug')('microbot');
var utils = require('./lib/utils');

/**
 * Create a new Microbot instance with the provided options.
 *
 * ```js
 * var microbot = new Microbot({a: 'b'});
 * ```
 *
 * @param {Object} `options` Options used to configure the new microbot.
 * @api public
 */

function Microbot(options) {
  if (!(this instanceof Microbot)) {
    return new Microbot(options);
  }
  debug('initializing Microbot');

  Base.call(this, null, options);
  this.use(plugin());
  this.use(option());

  this.define('actions', {})
}

/**
 * Extend Base onto Microbot
 */

Base.extend(Microbot);

/**
 * Register a handler function to be called when the microbot is activated.
 *
 * ```js
 * microbot.when(function(payload, options) {
 *   console.log(payload);
 *   //=> {foo: 'bar'}
 *   console.log(options);
 *   //=> {a: 'b', c: 'd'}
 *   return Promise.resolve({bar: 'baz'});
 * });
 * ```
 * @param  {Function} `fn` Handler function that will be called with a `payload` and `options`. The handler function should return a `Promise`.
 * @return {Object} Returns `this` for chaining
 * @api public
 */

Microbot.prototype.when = function(fn) {
  debug('adding `when` action handler');
  this.action('when', fn);
  return this;
};

/**
 * Register an action handler function using the given name.
 *
 * ```js
 * microbot.action('foo', function(payload, options) {
 *   return Promise.resolve(payload.foo);
 * });
 * microbot.dispatch('foo', {foo: 'bar'})
 *   .then(function(result) {
 *     console.log(result);
 *     //=> 'bar'
 *   });
 * ```
 * @param  {String} `name` Name of the action handler function.
 * @param  {Function} `fn` Action handler function to be called when the action is dispatched.
 * @return {Object} Returns `this` to allow chaining
 * @api public
 */

Microbot.prototype.action = function(name, fn) {
  if (typeof fn === 'function') {
    debug('setting action handler "%s"', name);
    this.union(['actions', utils.rename(name)], utils.wrapAction(fn));
    return this;
  }
  debug('getting action handler "%s"', name);
  return this.get(['actions', utils.rename(name)]);
};

/**
 * Dispatches a payload by calling the registered action handler function.
 *
 * ```js
 * microbot.dispatch({foo: 'bar'}, {c: 'd'})
 *   .then(function(results) {
 *     console.log(results);
 *     //=> {bar: 'baz'}
 *   });
 * ```
 * @param  {String} `name` Name of the action to dispatch. Defaults to "when".
 * @param  {Object} `payload` Payload object to send to the action handler function.
 * @param  {Object} `options` Additional options to send to the action handler function.
 * @return {Promise} Returns a promise after the action handler function has resolved.
 * @api public
 */

Microbot.prototype.dispatch = function(name, payload, options) {
  if (typeof name !== 'string') {
    options = payload;
    payload = name;
    name = 'when';
  }

  var actions = this.resolveActions(name);
  if (!actions) {
    debug('action handler "%s" could not be found to dispatch', name);
    return Promise.resolve();
  }
  debug('dispatching payload %j to action handler "%s"', payload, name);
  return utils.series(this, actions, payload, options);
  // return Promise.resolve(action.call(this, payload, options));
};

Microbot.prototype.resolveActions = function(name) {
  var action = this.action(name);
  if (!action) {
    return;
  }

  /**
   * before - before any actions
   * before.${action} - before current action
   * ${action} - current action
   * after.${action} - before current action
   * after - after any action
   */
  return [
    ...(this.action('before') || []),
    ...(this.action(`before.${name}`) || []),
    ...action,
    ...(this.action(`after.${name}`) || []),
    ...(this.action('after') || [])
  ];
};

/**
 * Exposes `Microbot`
 */

module.exports = Microbot;
