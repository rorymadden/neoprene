
/*!
 * Module dependencies.
 */

// var GraphObject = require('../graphObject');

/**
 * Neoprene Array constructor.
 *
 * ####NOTE:
 *
 * _Values always have to be passed to the constructor to initialize, otherwise `NeopreneArray#push` will mark the array as modified._
 *
 * @param {Array} values
 * @param {String} path
 * @param {GraphObject} doc parent graphObject
 * @api private
 * @inherits Array
 * @see http://bit.ly/f6CnZU
 */

function NeopreneArray (values, path, doc) {
  var arr = [];
  arr.push.apply(arr, values);
  arr.__proto__ = NeopreneArray.prototype;

  arr._atomics = {};
  arr.validators = [];
  arr._path = path;

  if (doc) {
    arr._parent = doc;
    arr._schema = doc.schema.path(path);
  }

  return arr;
};

/*!
 * Inherit from Array
 */

NeopreneArray.prototype = new Array;

/**
 * Stores a queue of atomic operations to perform
 *
 * @property _atomics
 * @api private
 */

NeopreneArray.prototype._atomics;

/**
 * Parent owner graphObject
 *
 * @property _parent
 * @api private
 */

NeopreneArray.prototype._parent;

/**
 * Casts a member based on this arrays schema.
 *
 * @param {any} value
 * @return value the casted value
 * @api private
 */

NeopreneArray.prototype._cast = function (value) {
  var cast = this._schema.caster.cast
    , doc = this._parent;

  return cast.call(null, value, doc);
};

/**
 * Marks this array as modified.
 *
 * @api private
 */

NeopreneArray.prototype._markModified = function () {
  var parent = this._parent
    , dirtyPath;

  if (parent) {
    dirtyPath = this._path;
    parent.markModified(dirtyPath);
  }

  return this;
};

/**
 * Register an atomic operation with the parent.
 *
 * @param {Array} op operation
 * @param {any} val
 * @api private
 */

NeopreneArray.prototype._registerAtomic = function (op, val) {
  if ('$set' == op) {
    // $set takes precedence over all other ops.
    // mark entire array modified.
    this._atomics = { $set: val };
    this._markModified();
    return this;
  }

  var atomics = this._atomics;

  // reset pop/shift after save
  if ('$pop' == op && !('$pop' in atomics)) {
    var self = this;
    this._parent.once('save', function () {
      self._popped = self._shifted = null;
    });
  }

  if (this._atomics.$set) {
    return this;
  }

  // check for impossible $atomic combos (Mongo denies more than one
  // $atomic op on a single path
  if (Object.keys(atomics).length && !(op in atomics)) {
    // a different op was previously registered.
    // save the entire thing.
    this._atomics = { $set: this };
    this._markModified();
    return this;
  }

  if (op === '$pullAll' || op === '$pushAll' || op === '$addToSet') {
    atomics[op] || (atomics[op] = []);
    atomics[op] = atomics[op].concat(val);
  } else if (op === '$pullDocs') {
    var pullOp = atomics['$pull'] || (atomics['$pull'] = {})
      , selector = pullOp['_id'] || (pullOp['_id'] = {'$in' : [] });
    selector['$in'] = selector['$in'].concat(val);
  } else {
    atomics[op] = val;
  }

  this._markModified();
  return this;
};

/**
 * Returns the number of pending atomic operations to send to the db for this array.
 *
 * @api private
 * @return {Number}
 */

NeopreneArray.prototype.hasAtomics = function hasAtomics () {
  if (!(this._atomics && 'Object' === this._atomics.constructor.name)) {
    return 0;
  }

  return Object.keys(this._atomics).length;
}

/**
 * Wraps [`Array#push`](https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/push) with proper change tracking.
 *
 * @param {Object} [args...]
 * @api private
 */

NeopreneArray.prototype.push = function () {
  var values = [].map.call(arguments, this._cast, this)
    , ret = [].push.apply(this, values);

  // $pushAll might be fibbed (could be $push). But it makes it easier to
  // handle what could have been $push, $pushAll combos
  this._registerAtomic('$pushAll', values);
  return ret;
};

/**
 * Pushes items to the array non-atomically.
 *
 * ####NOTE:
 *
 * _marks the entire array as modified, which if saved, will store it as a `$set` operation, potentially overwritting any changes that happen between when you retrieved the object and when you save it._
 *
 * @param {any} [args...]
 * @api private
 */

NeopreneArray.prototype.nonAtomicPush = function () {
  var values = [].map.call(arguments, this._cast, this)
    , ret = [].push.apply(this, values);
  this._registerAtomic('$set', this);
  return ret;
};

/**
 * Pops the array atomically at most one time per graphObject `save()`.
 *
 * #### NOTE:
 *
 * _Calling this mulitple times on an array before saving sends the same command as calling it once._
 * _This update is implemented using the MongoDB [$pop](http://www.mongodb.org/display/DOCS/Updating/#Updating-%24pop) method which enforces this restriction._
 *
 *      doc.array = [1,2,3];
 *
 *      var popped = doc.array.$pop();
 *      console.log(popped); // 3
 *      console.log(doc.array); // [1,2]
 *
 *      // no affect
 *      popped = doc.array.$pop();
 *      console.log(doc.array); // [1,2]
 *
 *      doc.save(function (err) {
 *        if (err) return handleError(err);
 *
 *        // we saved, now $pop works again
 *        popped = doc.array.$pop();
 *        console.log(popped); // 2
 *        console.log(doc.array); // [1]
 *      })
 *
 * @api private
 * @method $pop
 * @memberOf NeopreneArray
 * @see mongodb http://www.mongodb.org/display/DOCS/Updating/#Updating-%24pop
 */

NeopreneArray.prototype.$pop = function () {
  this._registerAtomic('$pop', 1);

  // only allow popping once
  if (this._popped) return;
  this._popped = true;

  return [].pop.call(this);
};

/**
 * Wraps [`Array#pop`](https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/pop) with proper change tracking.
 *
 * ####Note:
 *
 * _marks the entire array as modified which will pass the entire thing to $set potentially overwritting any changes that happen between when you retrieved the object and when you save it._
 *
 * @see NeopreneArray#$pop #types_array_NeopreneArray-%24pop
 * @api private
 */

NeopreneArray.prototype.pop = function () {
  var ret = [].pop.call(this);
  this._registerAtomic('$set', this);
  return ret;
};

/**
 * Atomically shifts the array at most one time per graphObject `save()`.
 *
 * ####NOTE:
 *
 * _Calling this mulitple times on an array before saving sends the same command as calling it once._
 * _This update is implemented using the MongoDB [$pop](http://www.mongodb.org/display/DOCS/Updating/#Updating-%24pop) method which enforces this restriction._
 *
 *      doc.array = [1,2,3];
 *
 *      var shifted = doc.array.$shift();
 *      console.log(shifted); // 1
 *      console.log(doc.array); // [2,3]
 *
 *      // no affect
 *      shifted = doc.array.$shift();
 *      console.log(doc.array); // [2,3]
 *
 *      doc.save(function (err) {
 *        if (err) return handleError(err);
 *
 *        // we saved, now $shift works again
 *        shifted = doc.array.$shift();
 *        console.log(shifted ); // 2
 *        console.log(doc.array); // [3]
 *      })
 *
 * @api private
 * @memberOf NeopreneArray
 * @method $shift
 * @see mongodb http://www.mongodb.org/display/DOCS/Updating/#Updating-%24pop
 */

NeopreneArray.prototype.$shift = function $shift () {
  this._registerAtomic('$pop', -1);

  // only allow shifting once
  if (this._shifted) return;
  this._shifted = true;

  return [].shift.call(this);
};

/**
 * Wraps [`Array#shift`](https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/unshift) with proper change tracking.
 *
 * ####Example:
 *
 *     doc.array = [2,3];
 *     var res = doc.array.shift();
 *     console.log(res) // 2
 *     console.log(doc.array) // [3]
 *
 * ####Note:
 *
 * _marks the entire array as modified, which if saved, will store it as a `$set` operation, potentially overwritting any changes that happen between when you retrieved the object and when you save it._
 *
 * @api private
 */

NeopreneArray.prototype.shift = function () {
  var ret = [].shift.call(this);
  this._registerAtomic('$set', this);
  return ret;
};

/**
 * Removes items from an array atomically
 *
 * ####Examples:
 *
 *     doc.array.remove('tag 1', 'tag 2')
 *
 * @param {Object} [args...] values to remove
 * @see mongodb http://www.mongodb.org/display/DOCS/Updating/#Updating-%24pull
 * @api private
 */

NeopreneArray.prototype.remove = function () {
  var args = [].map.call(arguments, this._cast, this);
  if (args.length == 1)
    this.pull(args[0]);
  else
    this.pull.apply(this, args);
  return args;
};

/**
 * Pulls items from the array atomically.
 *
 * @param {any} [args...]
 * @see mongodb http://www.mongodb.org/display/DOCS/Updating/#Updating-%24pull
 * @api private
 */

NeopreneArray.prototype.pull = function () {
  var values = [].map.call(arguments, this._cast, this)
    , cur = this._parent.get(this._path)
    , i = cur.length
    , mem;

  while (i--) {
    mem = cur[i];
    if (~cur.indexOf.call(values, mem)) {
      [].splice.call(cur, i, 1);
    }
  }

  this._registerAtomic('$pullAll', values);

  return this;
};

/**
 * Wraps [`Array#splice`](https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/splice) with proper change tracking.
 *
 * ####Note:
 *
 * _marks the entire array as modified, which if saved, will store it as a `$set` operation, potentially overwritting any changes that happen between when you retrieved the object and when you save it._
 *
 * @api private
 */

NeopreneArray.prototype.splice = function () {
  if (arguments.length) {
    var ret = [].splice.apply(this, arguments);
    this._registerAtomic('$set', this);
  }
  return ret;
};

/**
 * Wraps [`Array#unshift`](https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/unshift) with proper change tracking.
 *
 * ####Note:
 *
 * _marks the entire array as modified, which if saved, will store it as a `$set` operation, potentially overwritting any changes that happen between when you retrieved the object and when you save it._
 *
 * @api private
 */

NeopreneArray.prototype.unshift = function () {
  var values = [].map.call(arguments, this._cast, this);
  [].unshift.apply(this, values);
  this._registerAtomic('$set', this);
  return this.length;
};

/**
 * Wraps [`Array#sort`](https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/sort) with proper change tracking.
 *
 * ####NOTE:
 *
 * _marks the entire array as modified, which if saved, will store it as a `$set` operation, potentially overwritting any changes that happen between when you retrieved the object and when you save it._
 *
 * @api private
 */

NeopreneArray.prototype.sort = function () {
  var ret = [].sort.apply(this, arguments);
  this._registerAtomic('$set', this);
  return ret;
}

/**
 * Adds values to the array if not already present.
 *
 * ####Example:
 *
 *     console.log(doc.array) // [2,3,4]
 *     var added = doc.array.addToSet(4,5);
 *     console.log(doc.array) // [2,3,4,5]
 *     console.log(added)     // [5]
 *
 * @param {any} [args...]
 * @return {Array} the values that were added
 * @api private
 */

NeopreneArray.prototype.addToSet = function addToSet () {
  var values = [].map.call(arguments, this._cast, this)
    , added = []
    , type = values[0] instanceof Date ? 'date' :
             '';

  values.forEach(function (v) {
    var found;
    switch (type) {
      case 'doc':
        found = this.some(function(doc){ return doc.equals(v) });
        break;
      case 'date':
        var val = +v;
        found = this.some(function(d){ return +d === val });
        break;
      default:
        found = ~this.indexOf(v);
    }

    if (!found) {
      [].push.call(this, v);
      this._registerAtomic('$addToSet', v);
      [].push.call(added, v);
    }
  }, this);

  return added;
};

/**
 * Returns a native js Array.
 *
 * @param {Object} options
 * @return {Array}
 * @api private
 */

NeopreneArray.prototype.toObject = function (options) {
  // if (options && options.depopulate && this[0] instanceof GraphObject) {
  //   return this.map(function (doc) {
  //     return doc._id;
  //   });
  // }

  // return this.slice()?
  return this.map(function (doc) {
    return doc;
  });
};

/**
 * Helper for console.log
 *
 * @api private
 */

NeopreneArray.prototype.inspect = function () {
  return '[' + this.map(function (doc) {
    return ' ' + doc;
  }) + ' ]';
};

/**
 * Return the index of `obj` or `-1` if not found.
 *
 * @param {Object} obj the item to look for
 * @return {Number}
 * @api private
 */

NeopreneArray.prototype.indexOf = function indexOf (obj) {
  for (var i = 0, len = this.length; i < len; ++i) {
    if (obj == this[i])
      return i;
  }
  return -1;
};

/*!
 * Module exports.
 */

module.exports = exports = NeopreneArray;
