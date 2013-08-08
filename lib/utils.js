/*!
 * Neoprene - Shared utilities
 * MIT Licensed
 */
var EventEmitter = require('events').EventEmitter
  , GraphObject
  , NeopreneError = require('./error');
/*!
 * Add `once` to EventEmitter if absent
 *
 * @param {String} event name
 * @param {Function} listener
 * @api private
 */

var Events = EventEmitter;

if (!('once' in EventEmitter.prototype)){

  Events = function () {
    EventEmitter.apply(this, arguments);
  };

  /*!
   * Inherit from EventEmitter.
   */

  Events.prototype.__proto__ = EventEmitter.prototype;

  /*!
   * Add `once`.
   */

  Events.prototype.once = function (type, listener) {
    var self = this;
    self.on(type, function g(){
      self.removeListener(type, g);
      listener.apply(this, arguments);
    });
  };
}
exports.EventEmitter = Events;

//-----------------------------------------------------------------------------
//
//  Serialization / Deserialization
//
//-----------------------------------------------------------------------------

// deep inspects the given value -- object, array, primitive, whatever -- and
// transforms it or its subvalues into the appropriate Node/Relationship/Path
// instances. returns the transformed value.
exports.transform = transform = function(val, base) {
  var Path, end, hasProps, key, length, map, nodes, relationships, start, subval;
  if (!val || typeof val !== 'object') {
    return val;
  }
  if (val instanceof Array) {
    return val.map(function(val) {
      return transform(val, base);
    });
  }
  Path = require('./path');
  // Node = require('./node');
  // Relationship = require('./relationship');
  hasProps = function(props) {
    var key, keys, type, _i, _len, _ref;
    for (type in props) {
      keys = props[type];
      _ref = keys.split('|');
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        key = _ref[_i];
        if (typeof val[key] !== type) {
          return false;
        }
      }
    }
    return true;
  };
  if (hasProps({
    string: 'self|traverse',
    object: 'data'
  })) {
    return exports.loadObject(val, base);
  }
  if (hasProps({
    string: 'self|type|start|end',
    object: 'data'
  })) {
    return exports.loadObject(val, base);
  }
  if (hasProps({
    string: 'start|end',
    number: 'length',
    object: 'nodes|relationships'
  })) {
    start = exports.getId(val.start);
    end = exports.getId(val.end);
    length = val.length;
    nodes = val.nodes.map(function(node) {
      return exports.getId(node);
    });
    relationships = val.relationships.map(function(rel) {
      return exports.getId(rel);
    });
    return new Path(start, end, length, nodes, relationships);
  } else {
    map = {};
    for (key in val) {
      subval = val[key];
      map[key] = transform(subval, base);
    }
    return map;
  }
};

// exports.serialize = function(o, separator) {
//   return JSON.stringify(flatten(o, separator));
// };

// exports.deserialize = function(o, separator) {
//   return unflatten(JSON.parse(o), separator);
// };

// flatten = function(o, separator, result, prefix) {
//   var key, value, _i, _len, _ref;
//   separator = separator || '.';
//   result = result || {};
//   prefix = prefix || '';
//   if (typeof o !== 'object') {
//     return o;
//   }
//   _ref = Object.keys(o);
//   for (_i = 0, _len = _ref.length; _i < _len; _i++) {
//     key = _ref[_i];
//     value = o[key];
//     if (typeof value !== 'object') {
//       result[prefix + key] = value;
//     } else {
//       flatten(value, separator, result, key + separator);
//     }
//   }
//   return result;
// };

// unflatten = function(o, separator, result) {
//   var currentKey, i, key, keys, lastKey, numKeys, separatorIndex, target, value, _i, _j, _len, _ref, _ref1;
//   separator = separator || '.';
//   result = result || {};
//   if (typeof o !== 'object') {
//     return o;
//   }
//   _ref = Object.keys(o);
//   for (_i = 0, _len = _ref.length; _i < _len; _i++) {
//     key = _ref[_i];
//     value = o[key];
//     separatorIndex = key.indexOf(separator);
//     if (separatorIndex === -1) {
//       result[key] = value;
//     } else {
//       keys = key.split(separator);
//       target = result;
//       numKeys = keys.length;
//       for (i = _j = 0, _ref1 = numKeys - 2; 0 <= _ref1 ? _j <= _ref1 : _j >= _ref1; i = 0 <= _ref1 ? ++_j : --_j) {
//         currentKey = keys[i];
//         if (target[currentKey] === void 0) {
//           target[currentKey] = {};
//         }
//         target = target[currentKey];
//       }
//       lastKey = keys[numKeys - 1];
//       target[lastKey] = value;
//     }
//   }
//   return result;
// };

exports.getId = function(string){
  if(!string) return null;
  var match = /(?:node|relationship)\/(\d+)$/.exec(string);
  return parseInt(match[1]);
};

/**
 * A faster Array.prototype.slice.call(arguments) alternative
 * @api private
 */

exports.args = function (args, slice, sliceEnd) {
  var ret = [];
  var start = slice || 0;
  var end = 3 === arguments.length
    ? sliceEnd
    : args.length;

  for (var i = start; i < end; ++i) {
    ret[i - start] = args[i];
  }

  return ret;
}

/**
 * Object clone with Neoprene natives support.
 *
 * Creates a minimal data Object.
 * It does not clone empty Arrays, empty Objects, and undefined values.
 * This makes the data payload sent to MongoDB as minimal as possible.
 *
 * @param {Object} obj the object to clone
 * @param {Object} options
 * @return {Object} the cloned object
 * @api private
 */

exports.clone = function clone (obj, options) {
  if (obj === undefined || obj === null)
    return obj;

  if (isNeopreneObject(obj)) {
    if (options && options.json && 'function' === typeof obj.toJSON) {
      return obj.toJSON(options);
    } else {
      return obj.toObject(options);
    }
  }

  if ('Object' === obj.constructor.name)
    return cloneObject(obj, options);

  if ('Date' === obj.constructor.name || 'Function' === obj.constructor.name)
    return new obj.constructor(+obj);

  if ('RegExp' === obj.constructor.name)
    return new RegExp(obj.source);

  if (obj.valueOf)
    return obj.valueOf();
};
var clone = exports.clone;

/*!
 * ignore
 */

function cloneObject (obj, options) {
  var retainKeyOrder = options && options.retainKeyOrder
    , minimize = options && options.minimize
    , ret = {}
    , hasKeys
    , keys
    , val
    , k
    , i

  if (retainKeyOrder) {
    for (k in obj) {
      val = clone(obj[k], options);

      if (!minimize || ('undefined' !== typeof val)) {
        hasKeys || (hasKeys = true);
        ret[k] = val;
      }
    }
  } else {
    // faster

    keys = Object.keys(obj);
    i = keys.length;

    while (i--) {
      k = keys[i];
      val = clone(obj[k], options);

      if (!minimize || ('undefined' !== typeof val)) {
        if (!hasKeys) hasKeys = true;
        ret[k] = val;
      }
    }
  }

  return minimize
    ? hasKeys && ret
    : ret;
};
/**
 * Returns if `v` is a mongoose object that has a `toObject()` method we can use.
 *
 * This is for compatibility with libs like Date.js which do foolish things to Natives.
 *
 * @param {any} v
 * @api private
 */

exports.isNeopreneObject = function (v) {
  GraphObject || (GraphObject = require('./graphObject'));
  return v instanceof GraphObject
}
var isNeopreneObject = exports.isNeopreneObject;

/**
 * Determines if `a` and `b` are deep equal.
 *
 * Modified from node/lib/assert.js
 *
 * @param {any} a a value to compare to `b`
 * @param {any} b a value to compare to `a`
 * @return {Boolean}
 * @api private
 */

exports.deepEqual = function deepEqual (a, b) {
  if (a === b) return true;

  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();

  if (typeof a !== 'object' && typeof b !== 'object')
    return a == b;

  if (a === null || b === null || a === undefined || b === undefined)
    return false

  if (a.prototype !== b.prototype) return false;

  // Handle MongooseNumbers
  if (a instanceof Number && b instanceof Number) {
    return a.valueOf() === b.valueOf();
  }

  if (Buffer.isBuffer(a)) {
    if (!Buffer.isBuffer(b)) return false;
    if (a.length !== b.length) return false;
    for (var i = 0, len = a.length; i < len; ++i) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  if (isNeopreneObject(a)) a = a.toObject();
  if (isNeopreneObject(b)) b = b.toObject();

  try {
    var ka = Object.keys(a),
        kb = Object.keys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }

  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;

  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();

  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }

  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
};

/**
 * Copies and merges options with defaults.
 *
 * @param {Object} defaults
 * @param {Object} options
 * @return {Object} the merged object
 * @api private
 */

exports.options = function (defaults, options) {
  var keys = Object.keys(defaults)
    , i = keys.length
    , k ;

  options = options || {};

  while (i--) {
    k = keys[i];
    if (!(k in options)) {
      options[k] = defaults[k];
    }
  }

  return options;
};


/**
 * process.nextTick helper.
 *
 * Wraps `callback` in a try/catch + nextTick.
 *
 * node-mongodb-native has a habit of state corruption when an error is immediately thrown from within a collection callback.
 *
 * @param {Function} callback
 * @api private
 */

exports.tick = function tick (callback) {
  if ('function' !== typeof callback) return;
  return function () {
    try {
      callback.apply(this, arguments);
    } catch (err) {
      // only nextTick on err to get out of
      // the event loop and avoid state corruption.
      process.nextTick(function () {
        throw err;
      });
    }
  };
};

exports.loadObject = function loadObject (obj, base){
  if(obj[0] && (obj[0].type || obj[0].data)) obj = obj[0];

  var type, casted;
  if(obj.type) {
    // console.log(obj.data)
    // type = obj.type;
    casted = {};
    casted._start = exports.getId(obj.start);
    casted._end = exports.getId(obj.end);
    casted._type = obj.type;
    casted.data = obj.data;
  }
  else {
    type = obj.data._nodeType;
    var modelFrame = base.loadModel(type);
    if(typeof modelFrame === 'function'){
      casted = new modelFrame(obj.data);
      casted.isNew = false; // to be removed
    }
    else return new NeopreneError('Model: ' + type + ' not initialised');
  }

  casted._id = exports.getId(obj.self);
  casted._self = obj.self;
  // load in node._id
  if(casted._doc) {
    casted._doc._id = casted._id;
  }
  return casted;
};


exports.removeNulls = function removeNulls(obj){
  var keys= Object.keys(obj);
  var clone = {};
  keys.forEach(function(key){
    if(obj[key] !== null) clone[key] = obj[key];
  });
  return clone;
}