/*!
 * Module dependencies.
 */

var NeopreneError = require('../error');

/**
 * Casting Error constructor.
 *
 * @param {String} type
 * @param {String} value
 * @inherits NeopreneError
 * @api private
 */

function CastError (type, value) {
  NeopreneError.call(this, 'Cast to ' + type + ' failed for value "' + value + '"');
  Error.captureStackTrace(this, arguments.callee);
  this.name = 'CastError';
  this.type = type;
  this.value = value;
};

/*!
 * Inherits from NeopreneError.
 */

CastError.prototype.__proto__ = NeopreneError.prototype;

/*!
 * exports
 */

module.exports = CastError;
