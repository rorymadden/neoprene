/*!
 * Neoprene - Error class
 * MIT Licensed
 */

/**
 * Neoprene error
 *
 * @api private
 * @inherits Error https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Error
 */

function NeopreneError (msg) {
  Error.call(this);
  Error.captureStackTrace(this, arguments.callee);
  this.message = msg;
  this.name = 'Neoprene';
}

/*!
 * Inherits from Error.
 */

NeopreneError.prototype = Object.create(Error.prototype);

/*!
 * Module exports.
 */

module.exports = NeopreneError;
