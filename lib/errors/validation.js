
/*!
 * Module requirements
 */

var NeopreneError = require('../error')

/**
 * Document Validation Error
 *
 * @api private
 * @param {Document} instance
 * @inherits NeopreneError
 */

function ValidationError (instance) {
  NeopreneError.call(this, "Validation failed");
  Error.captureStackTrace(this, arguments.callee);
  this.name = 'ValidationError';
  this.errors = instance.errors = {};
};

/**
 * Console.log helper
 * @api private
 */

ValidationError.prototype.toString = function () {
  return this.name + ': ' + Object.keys(this.errors).map(function (key) {
    return String(this.errors[key]);
  }, this).join(', ');
};

/*!
 * Inherits from NeopreneError.
 */

ValidationError.prototype.__proto__ = NeopreneError.prototype;

/*!
 * Module exports
 */

module.exports = exports = ValidationError;
