/*!
 * Module dependencies.
 */

var NeopreneError = require('../error');

/**
 * Schema validator error
 *
 * @param {String} path
 * @param {String} msg
 * @inherits NeopreneError
 * @api private
 */

function ValidatorError (path, type) {
  var msg = type
    ? '"' + type + '" '
    : '';
  NeopreneError.call(this, 'Validator ' + msg + 'failed for path ' + path);
  Error.captureStackTrace(this, arguments.callee);
  this.name = 'ValidatorError';
  this.path = path;
  this.type = type;
};

/*!
 * toString helper
 */

ValidatorError.prototype.toString = function () {
  return this.message;
}

/*!
 * Inherits from NeopreneError
 */

ValidatorError.prototype.__proto__ = NeopreneError.prototype;

/*!
 * exports
 */

module.exports = ValidatorError;
