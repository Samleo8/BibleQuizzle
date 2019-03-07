'use strict';

var debug = require('debug')('microbot');
var utils = module.exports = {};

utils.extend = require('extend-shallow');

/**
 * Wrap an action function to extend global options before calling the action.
 *
 * ```js
 * var fn = utils.wrapAction(function(payload, options) {
 *   console.log(options);
 *   //=> contains global options and options passed to `dispatch`
 * });
 * ```
 * @param  {Function} `fn` action function to wrap
 * @return {Function} wrapped action function
 */

utils.wrapAction = function(fn) {
  return function(payload, options) {
    var opts = utils.extend({}, this.options, options);
    return fn.call(this, payload, opts);
  };
};

/**
 * Renames an action name to normalize `before*` and `after*` actions
 *
 * ```js
 * console.log(utils.rename('before.when'));
 * //=> "before.when"
 * console.log(utils.rename('when'));
 * //=> "when"
 * console.log(utils.rename('after.when'));
 * //=> "after.when"
 * console.log(utils.rename('before-when'));
 * //=> "before.when"
 * console.log(utils.rename('after-when'));
 * //=> "after.when"
 * console.log(utils.rename('before_when'));
 * //=> "before.when"
 * console.log(utils.rename('after_when'));
 * //=> "after.when"
 * ```
 * @param  {String} `name` Action name to rename
 * @return {String} Renamed action name
 */

utils.rename = function(name) {
  debug('rename', name);
  if (/^(before|after)/.test(name)) {
    if (name === 'before' || name === 'after') {
      return `${name}.all`;
    }

    var val = name.split(/[._-]/).join('.');
    debug('rename replace', val);
    return val;
  }
  return name;
};

/**
 * Executes an array of functions in series, resolving their results
 * as Promises. Passes the given `args` to each function, replacing the first
 * argument with the results from the previous function.
 *
 * ```js
 * var arr = [
 *   function(payload, options) {
 *     payload.calls.push('first');
 *     return payload;
 *   },
 *   function(payload, options) {
 *     return new Promise(function(resolve) {
 *       setTimeout(function() {
 *         payload.calls.push('second');
 *         resolve(payload);
 *       }, options.delay);
 *     });
 *   },
 *   function(payload, options) {
 *     payload.calls.push(options.third);
 *     return payload;
 *   }
 * ];
 *
 * var payload = {calls: []};
 * var options = {
 *   // used in third function
 *   third: 'third',
 *   // used in second function to delay execution
 *   delay: 1000
 * };
 *
 * utils.series(null, arr, payload, options)
 *   .then(function(payload) {
 *     console.log(payload);
 *     //=> {calls: ['first', 'second', 'third']};
 *   });
 * ```
 * @param  {Object} `thisArg` Object to use to set the `this` context for each function.
 * @param  {Array} `arr` Array of functions that will be called with the given arguments. May return a Promise to be resolved.
 * @param  {...} `args` additional arguments to pass to the functions
 * @return {Promise} Promise that will be resolved when all functions have been resolved.
 */

utils.series = function(thisArg, arr, ...args) {
  arr = utils.arrayify(arr);

  // immediately return if the array has only 1 item
  var first = arr.shift();
  var init = first ? first.apply(thisArg, args) : args[0];

  if (arr.length === 0) {
    return Promise.resolve(init);
  }

  var prev;
  return Promise.resolve(arr.reduce(function(acc, cur) {
    // bail out early
    if (acc === false || !cur) {
      return acc;
    }

    // remove the first arg (will be replaced with `acc`)
    var [, ...rest] = args;

    // resolve accumlated value, then return current promise
    return Promise.resolve(acc)
      .then(function(res) {
        if (typeof res !== 'undefined') {
          prev = res;
        } else if (typeof prev !== 'undefined') {
          res = prev;
        }
        return cur.apply(thisArg, [res, ...rest]);
      });
  }, init))
};

/**
 * Turn a value into an array.
 * ```js
 * console.log(utils.arrayify('foo'));
 * //=> ['foo']
 * console.log(utils.arrayify(['foo']));
 * //=> ['foo']
 * console.log(utils.arrayify(''));
 * //=> []
 * ```
 * @param  {Mixed} `val` Any value
 * @return {Array} Array with given value or value itself if already an array.
 */

utils.arrayify = function(val) {
  return val ? (Array.isArray(val) ? val : [val]) : [];
};
