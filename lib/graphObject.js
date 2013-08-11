/*!
 * Neoprene - Property class. Parent for Nodes and Relationships
 * MIT Licensed
 */

var EventEmitter = require('events').EventEmitter
  , hooks = require('hooks')
  , inspect = require('util').inspect

  , utils = require('./utils')
  , clone = utils.clone
  // , isNeopreneObject = utils.isNeopreneObject
  , deepEqual = utils.deepEqual

  , StateMachine = require('./statemachine')
  , ActiveRoster = StateMachine.ctor('require', 'modify', 'init', 'default')

  , Schema = require('./schema')
  , MixedSchema = require('./schema/mixed')

  , NeopreneError = require('./error')
  , ValidatorError = require('./schematype').ValidatorError
  , ValidationError = require('./errors/validation')
  // , GraphObjectError = require('./errors/document')
  ;

/**
 * A wrapper object for a neo4j node or relationship
 * @param  {String} url        Url for the neo4j database.
 * @param  {Object} data       The properties of the neo4j object.
 * @param  {String} objectType node or relationship.
 * @return {Object}            The GraphObject object.
 * @api     private
 */
function GraphObject(obj, fields) {
  this.isNew = true;
  this.errors = undefined;
  this._saveError = undefined;
  this._validationError = undefined;
  // this._adhocPaths = undefined;
  // this._removing = undefined;
  // this._inserting = undefined;
  // this.__version = undefined;
  this.__getters = {};
  // this.__id = undefined;
  // the type of container - node or relationship

  this._activePaths = new ActiveRoster();

  var required = this.schema.requiredPaths();
  for (var i = 0; i < required.length; ++i) {
    this._activePaths.require(required[i]);
  }

  this._doc = this._buildDoc(obj, fields);
  if (obj) this.set(obj, undefined, true);
  this._registerHooks();
}

/*!
 * Inherit from EventEmitter.
 * Not used yet but may be in future
 */

GraphObject.prototype = new EventEmitter();

// /**
//  * The documents schema.
//  *
//  * @api public
//  * @property schema
//  */

// GraphObject.prototype.schema;

// /**
//  * Boolean flag specifying if the document is new.
//  *
//  * @api public
//  * @property isNew
//  */

// GraphObject.prototype.isNew;

// *
//  * The string version of this documents _id.
//  *
//  * ####Note:
//  *
//  * This getter exists on all documents by default. The getter can be disabled by setting the `id` [option](/docs/guide.html#id) of its `Schema` to false at construction time.
//  *
//  *     new Schema({ name: String }, { id: false });
//  *
//  * @api public
//  * @see Schema options /docs/guide.html#options
//  * @property id


// GraphObject.prototype.id;

// /**
//  * Hash containing current validation errors.
//  *
//  * @api public
//  * @property errors
//  */

// GraphObject.prototype.errors;

/**
 * Builds the default doc structure
 *
 * @param {Object} obj
 * @param {Object} [fields] Not used at present
 * @return {Object}
 * @api private
 */

GraphObject.prototype._buildDoc = function (obj, fields) {
  var doc = {}
    , self = this
    , exclude
    , keys
    , ki;

  // determine if this doc is a result of a query with
  // excluded fields
  if (fields && 'Object' === fields.constructor.name) {
    keys = Object.keys(fields);
    ki = keys.length;

    while (ki--) {
      if ('id' !== keys[ki]) {
        exclude = 0 === fields[keys[ki]];
        break;
      }
    }
  }
  // get schema paths e.g. first, last
  var paths = Object.keys(this.schema.paths)
    , plen = paths.length
    , ii = 0;

  // for each path
  for (; ii < plen; ++ii) {
    var p = paths[ii];

    // ignore if the path is id and there is an id in the obj
    if ('id' === p) {
      if (obj && 'id' in obj) continue;
    }

    // get the SchemaType object associated with the path
    var type = this.schema.paths[p]
      , doc_ = doc
      , def;

    if (fields) {
      if (exclude) {
        // apply defaults to all non-excluded fields
        if (p in fields) continue;

        def = type.getDefault(self, true);
        if ('undefined' !== typeof def) {
          doc_[p] = def;
          self._activePaths.default(p);
        }

      } else if (p in fields) {
        // selected field
        def = type.getDefault(self, true);
        if ('undefined' !== typeof def) {
          doc_[p] = def;
          self._activePaths.default(p);
        }
      }
    } else {
      //default value;
      def = type.getDefault(self, true);
      if ('undefined' !== typeof def) {
        doc_[p] = def;
        self._activePaths.default(p);
      }
    }

    if ('undefined' !== typeof def) {
      doc_[p] = def;
      // self._activePaths.default(p);
    }
  }

  return doc;
};

/**
 * Sets the value of a path, or many paths.
 *
 * ####Example:
 *
 *     // path, value
 *     doc.set(path, value)
 *
 *     // object
 *     doc.set({
 *         path  : value
 *       , path2 : {
 *            path  : value
 *         }
 *     })
 *
 *     // only-the-fly cast to number
 *     doc.set(path, value, Number)
 *
 *     // only-the-fly cast to string
 *     doc.set(path, value, String)
 *
 * @param {String|Object} path path or object of key/vals to set
 * @param {Any} val the value to set
 * @param {Schema|String|Number|Buffer|etc..} [type] optionally specify a type for "on-the-fly" attributes
 * @api public
 */

GraphObject.prototype.set = function (path, val, type) {
  var constructing = true === type
    , adhoc = type && true !== type
    , adhocs;

  if (adhoc) {
    adhocs = this._adhocPaths || (this._adhocPaths = {});
    adhocs[path] = Schema.interpretAsType(path, type);
  }

  if ('string' !== typeof path) {
    // new GraphObject({ key: val })

    // not sure when this could happen
    if (null === path || undefined === path) {
      var _ = path;
      path = val;
      val = _;

    } else {
      if (path instanceof GraphObject) path = path._doc;

      var keys = Object.keys(path)
        , i = keys.length
        , pathtype
        , key;

      while (i--) {
        key = keys[i];
        // e.g. {"path":"first","validators":[[null,"required"]],"setters":[],
        // "getters":[],"options":{"required":true,"trim":true},"_index":null,
        // "isRequired":true}
        if (null !== path[key] && 'Object' === path[key].constructor.name &&
          !(this._path(key) instanceof MixedSchema)) {
          this.set(path[key], key, constructing);
        } else if (this._strictMode) {
          pathtype = this.schema.pathType(key);
          if ('real' === pathtype || 'virtual' === pathtype) {
            this.set(key, path[key], constructing);
          } else if ('throw' === this._strictMode) {
            throw new Error("Field `" + key + "` is not in schema.");
          }
        }
        //
        else if (undefined !== path[key]) {
          this.set(key, path[key], constructing);
        }
      }

      return this;
    }
  }


  // ensure _strict is honored for obj props
  // docschema = new Schema({ path: { nest: 'string' }})
  // doc.set('path', obj);
  var pathType = this.schema.pathType(path);
  var schema;
  if ('adhocOrUndefined' === pathType && this._strictMode) {
    return this;
  } else if ('virtual' === pathType) {
    schema = this.schema.virtualpath(path);
    schema.applySetters(val, this);
    return this;
  } else {
    schema = this._path(path);
  }

  if (!schema || null === val || undefined === val) {
    this._set(path, constructing, schema, val);
    return this;
  }
  var self = this;

  // if this doc is being constructed we should not
  // trigger getters.
  var priorVal = constructing ? undefined : this.get(path);

  var shouldSet = this.try(function(){
    val = schema.applySetters(val, self, false, priorVal);
  });

  if (shouldSet) {
    this._set(path, constructing, schema, val, priorVal);
  }

  return this;
};

/**
 * Handles the actual setting of the value and marking the path modified if appropriate.
 *
 * @api private
 */

GraphObject.prototype._set = function (path, constructing, schema, val, priorVal) {
  if (this.isNew) {
    this.markModified(path);
  } else {

    priorVal || (priorVal = this.get(path));

    if (!this.isDirectModified(path)) {
      if (undefined === val && !this.isSelected(path)) {
        // special case:
        // when a path is not selected in a query its initial
        // value will be undefined.
        this.markModified(path, priorVal);
      } else if (undefined === val && path in this._activePaths.states.default) {
        // do nothing
        // unsetting the default value which was never saved
      } else if (!deepEqual(val, priorVal)) {
        this.markModified(path, priorVal);
      } else if (!constructing &&
                 null != val &&
                 path in this._activePaths.states.default &&
                 deepEqual(val, schema.getDefault(this, constructing))) {
        // special case:
        // a path with a default was $unset on the server
        // and the user is setting it to the same value again
        this.markModified(path, priorVal);
      }
    }
  }

  // update the value
  this._doc[path] = val;
};


/**
 * Gets a raw value from a path (no getters)
 *
 * @param {String} path
 * @api private
 */

GraphObject.prototype.getValue = function (path) {
  return this._doc[path];
};

/**
 * Sets a raw value for a path (no casting, setters, transformations)
 *
 * @param {String} path
 * @param {Object} value
 * @api private
 */

GraphObject.prototype.setValue = function (path, val) {
  this._doc[path] = val;
  return this;
};

/**
 * Returns the value of a path.
 *
 * ####Example
 *
 *     // path
 *     doc.get('age') // 47
 *
 * @param {String} path
 * @param {Schema|String|Number|Buffer|etc..} [type] optionally specify a type for on-the-fly attributes
 * @api public
 */

GraphObject.prototype.get = function (path, type) {
  var adhocs;
  if (type) {
    adhocs = this._adhocPaths || (this._adhocPaths = {});
    adhocs[path] = Schema.interpretAsType(path, type);
  }

  var schema = this._path(path) || this.schema.virtualpath(path)
    , obj = this._doc[path];

  if (schema) {
    obj = schema.applyGetters(obj, this);
  }

  return obj;
};

/**
 * Returns the schematype for the given `path`.
 *
 * @param {String} path
 * @api private
 */

GraphObject.prototype._path = function (path) {
  var adhocs = this._adhocPaths
    , adhocType = adhocs && adhocs[path];

  if (adhocType) {
    return adhocType;
  } else {
    return this.schema.path(path);
  }
};

/**
 * Marks the path as having pending changes to write to the db.
 *
 * _Very helpful when using [Mixed](./schematypes.html#mixed) types._
 *
 * ####Example:
 *
 *     doc.mixed.type = 'changed';
 *     doc.markModified('mixed.type');
 *     doc.save() // changes to mixed.type are now persisted
 *
 * @param {String} path the path to mark modified
 * @api public
 */

GraphObject.prototype.markModified = function (path) {
  this._activePaths.modify(path);
};

/**
 * Catches errors that occur during execution of `fn` and stores them to later be passed when `save()` is executed.
 *
 * @param {Function} fn function to execute
 * @param {Object} scope the scope with which to call fn
 * @api private
 */

GraphObject.prototype.try = function (fn, scope) {
  var res;
  try {
    fn.call(scope);
    res = true;
  } catch (e) {
    this._error(e);
    res = false;
  }
  return res;
};

/**
 * Returns the list of paths that have been modified.
 *
 * @return {Array}
 * @api public
 */

GraphObject.prototype.modifiedPaths = function () {
  var directModifiedPaths = Object.keys(this._activePaths.states.modify);

  // TODO: figure out how this works to remove the path split part
  return directModifiedPaths.reduce(function (list, path) {
    var parts = path.split('.');
    return list.concat(parts.reduce(function (chains, part, i) {
      return chains.concat(parts.slice(0, i).concat(part).join('.'));
    }, []));
  }, []);
};

/**
 * Returns true if this document was modified, else false.
 *
 * If `path` is given, checks if a path or any full path containing `path` as part of its path chain has been modified.
 *
 * ####Example
 *
 *     doc.set('documents.0.title', 'changed');
 *     doc.isModified()                    // true
 *     doc.isModified('documents')         // true
 *     doc.isModified('documents.0.title') // true
 *     doc.isDirectModified('documents')   // false
 *
 * @param {String} [path] optional
 * @return {Boolean}
 * @api public
 */

GraphObject.prototype.isModified = function (path) {
  return path ? !!~this.modifiedPaths().indexOf(path) : this._activePaths.some('modify');
};

/**
 * Returns true if `path` was directly set and modified, else false.
 *
 * ####Example
 *
 *     doc.set('documents.0.title', 'changed');
 *     doc.isDirectModified('documents.0.title') // true
 *     doc.isDirectModified('documents') // false
 *
 * @param {String} path
 * @return {Boolean}
 * @api public
 */

GraphObject.prototype.isDirectModified = function (path) {
  return (path in this._activePaths.states.modify);
};

/**
 * Checks if `path` was initialized.
 *
 * @param {String} path
 * @return {Boolean}
 * @api public
 */

GraphObject.prototype.isInit = function (path) {
  return (path in this._activePaths.states.init);
};

/**
 * Checks if `path` was selected in the source query which initialized this document.
 *
 * ####Example
 *
 *     Thing.findOne().select('name').exec(function (err, doc) {
 *        doc.isSelected('name') // true
 *        doc.isSelected('age')  // false
 *     })
 *
 * @param {String} path
 * @return {Boolean}
 * @api public
 */

GraphObject.prototype.isSelected = function isSelected (path) {
  if (this._selected) {

    if ('id' === path) {
      return 0 !== this._selected.id;
    }

    var paths = Object.keys(this._selected)
      , i = paths.length
      , inclusive = false
      , cur;

    if (1 === i && 'id' === paths[0]) {
      // only _id was selected.
      return 0 === this._selected.id;
    }

    while (i--) {
      cur = paths[i];
      if ('id' === cur) continue;
      inclusive = !! this._selected[cur];
      break;
    }

    if (path in this._selected) {
      return inclusive;
    }

    // i = paths.length;
    // var pathDot = path + '.';

    // while (i--) {
    //   cur = paths[i];
    //   if ('id' === cur) continue;

    //   if (0 === cur.indexOf(pathDot)) {
    //     return inclusive;
    //   }

    //   if (0 === pathDot.indexOf(cur)) {
    //     return inclusive;
    //   }
    // }

    return ! inclusive;
  }

  return true;
};

/**
 * Executes registered validation rules for this document.
 *
 * ####Note:
 *
 * This method is called `pre` save and if a validation rule is violated, [save](#model_Model-save) is aborted and the error is returned to your `callback`.
 *
 * ####Example:
 *
 *     doc.validate(function (err) {
 *       if (err) handleError(err);
 *       else // validation passed
 *     });
 *
 * @param {Function} cb called after validation completes, passing an error if one occurred
 * @api public
 */

GraphObject.prototype.validate = function (cb) {
  var self = this;

  // only validate required fields when necessary
  var paths = Object.keys(this._activePaths.states.require).filter(function (path) {
    if (!self.isSelected(path) && !self.isModified(path)) return false;
    return true;
  });

  paths = paths.concat(Object.keys(this._activePaths.states.init));
  paths = paths.concat(Object.keys(this._activePaths.states.modify));

  if (0 === paths.length) {
    complete();
    return this;
  }

  var validating = {}
    , total = 0;

  paths.forEach(validatePath);
  return this;

  function validatePath (path) {
    if (validating[path]) return;

    validating[path] = true;
    total++;

    process.nextTick(function(){
      var p = self.schema.path(path);
      if (!p) return --total || complete();

      p.doValidate(self.getValue(path), function (err) {
        if (err) {
          self.invalidate(path, err, true);
        }
        --total || complete();
      }, self);
    });
  }

  function complete () {
    var err = self._validationError;
    self._validationError = undefined;
    cb(err);
  }
};


/**
 * Marks a path as invalid, causing validation to fail.
 *
 * @param {String} path the field to invalidate
 * @param {String|Error} err the error which states the reason `path` was invalid
 * @api public
 */

GraphObject.prototype.invalidate = function (path, err) {
  if (!this._validationError) {
    this._validationError = new ValidationError(this);
  }

  if (!err || 'string' === typeof err) {
    err = new ValidatorError(path, err);
  }

  this._validationError.errors[path] = err;
};

/**
 * Resets the internal modified state of this document.
 *
 * @api private
 * @return {GraphObject}
 */

GraphObject.prototype._reset = function reset () {
  var self = this;

  // clear atomics
  this._dirty().forEach(function (dirt) {
    var type = dirt.value;
    if (type && type._atomics) {
      type._atomics = {};
    }
  });

  // Clear 'modify'('dirty') cache
  this._activePaths.clear('modify');
  this._validationError = undefined;
  this.errors = undefined;
  this.schema.requiredPaths().forEach(function (path) {
    self._activePaths.require(path);
  });

  return this;
};

/**
 * Returns this documents dirty paths / vals.
 *
 * @api private
 */

GraphObject.prototype._dirty = function _dirty () {
  var self = this;

  var all = this._activePaths.map('modify', function (path) {
    return { path: path
           , value: self.getValue(path)
           , schema: self._path(path) };
  });

  // Sort dirty paths in a flat hierarchy.
  all.sort(function (a, b) {
    return (a.path < b.path ? -1 : (a.path > b.path ? 1 : 0));
  });

  // Ignore "foo.a" if "foo" is dirty already.
  var minimal = []
    , lastPath
    , top;

  all.forEach(function (item) {
    if (item.path.indexOf(lastPath) !== 0) {
      lastPath = item.path + '.';
      minimal.push(item);
      top = item;
    } else {
      if (!(item.value && top.value)) return;

      // special case for top level MongooseArrays
      if (top.value._atomics && top.value.hasAtomics()) {
        // the `top` array itself and a sub path of `top` are being modified.
        // the only way to honor all of both modifications is through a $set
        // of entire array.
        top.value._atomics = {};
        top.value._atomics.$set = top.value;
      }
    }
  });

  top = lastPath = null;
  return minimal;
};


/**
 * Assigns/compiles `schema` into this documents prototype.
 *
 * @param {Schema} schema
 * @api private
 */

GraphObject.prototype._setSchema = function (schema) {
  compile(schema.tree, this);
  this.schema = schema;
};

function compile (tree, proto) {
  var keys = Object.keys(tree)
    , i = keys.length
    , key;

  while (i--) {
    key = keys[i];
    define(key, proto);
  }
}

/*!
 * Defines the accessor named prop on the incoming prototype.
 */

function define (prop, prototype) {
  Object.defineProperty(prototype, prop, {
      enumerable: true
    , get: function ( ) { return this.get.call(this._scope || this, prop); }
    , set: function (v) { return this.set.call(this._scope || this, prop, v); }
  });
}

/*!
 * Set up middleware support
 */

for (var k in hooks) {
  GraphObject.prototype[k] = GraphObject[k] = hooks[k];
}

/**
 * Register default hooks
 *
 * @api private
 */

GraphObject.prototype._registerHooks = function _registerHooks () {
  // if (!this.save) return;
  // this.pre('save', function checkForExistingErrors (next) {
  //   // if any doc.set() calls failed
  //   if (this._saveError) {
  //     next(this._saveError);
  //     this._saveError = null;
  //   } else {
  //     next();
  //   }
  // }).pre('save', function validation (next) {
  //   return this.validate(next);
  // });
  if(!this.create && !this.execUpdate){
    return;
  }
  else {
    this.pre('create', function checkForExistingErrors (next) {
      // if any doc.set() calls failed
      if (this._saveError) {
        next(this._saveError);
        this._saveError = null;
      } else {
        next();
      }
    }).pre('create', function validation (next) {
      return this.validate(next);
    });
  }
  this.pre('execUpdate', function checkForExistingErrors (next) {
    // if any doc.set() calls failed
    if (this._saveError) {
      next(this._saveError);
      this._saveError = null;
    } else {
      next();
    }
  }).pre('execUpdate', function validation (next) {
    return this.validate(next);
  });

  // add user defined queues
  this._doQueue();
};

/**
 * Validates that unique indexes are unique before saving the document.
 *
 * ####Note:
 *
 * This method is called `pre` save and if a validation rule is violated, [save](#model_Model-save) is aborted and the error is returned to your `callback`.
 *
 * ####Example:
 *
 *     doc.validateUniqueIndexes(function (err) {
 *       if (err) handleError(err);
 *       else // validation passed
 *     });
 *
 * @param {Function} cb called after validation completes, passing an error if one occurred
 * @api public
 */

GraphObject.prototype.validateUniqueIndexes = function (cb) {
  // get schema indexes
  var indexesArray = this.schema.indexes();
  var indexLength = indexesArray.length;
  var indexes = [];
  // if there are no indexes return
  if (!indexLength) {
    return cb && cb();
  }
  // get keys for indexes
  for(var i=0; i< indexLength; i++){
    if(Object.keys(indexesArray[i][1]).indexOf('unique') !== -1){
      indexes.push(Object.keys(indexesArray[i][0])[0]);
    }
  }

  // check if any of the index fields have been modified
  // console.log('log '+JSON.stringify(this._activePaths.states.init))
  var paths = Object.keys(this._activePaths.states.init);
  paths = paths.concat(Object.keys(this._activePaths.states.modify));

  var filteredPaths = paths.filter(function(path) {
    if(indexes.indexOf(path) === -1) return false;
    return true;
  });

  // if none of the indexed fields have been modified then return
  if (!filteredPaths.length) {
    return cb && cb();
  }

  // check to see if a value already exists for the unique keys
  var self = this
    // , safe = self.schema.options.safe
    , validating = []
    , total = 0;

  filteredPaths.forEach(validateIndex);
  return this;

  function validateIndex (path) {
    if (validating[path]) return;

    validating[path] = true;
    total++;

    process.nextTick(function(){
      self.base.getIndexed(self.modelName, path, self.getValue(path), self.objectType, function(err, results){
        //validate that no index already exists or it is the same record
        if(err || (results.length === 1 && results[0].id === self.id)) return --total || complete();
        //otherwise present an error
        var indexExists = new NeopreneError(path, 'Duplicate value already exists');
        self.invalidate(path, indexExists, true);
        return --total || complete();
      });
    });
  }

  function complete () {
    var err = self._validationError;
    self._validationError = undefined;
    cb(err);
  }
};

/**
 * Registers an error
 *
 * @param {Error} err
 * @api private
 */

GraphObject.prototype._error = function (err) {
  this._saveError = err;
  return this;
};

/**
 * Executes methods queued from the Schema definition
 *
 * @api private
 */

GraphObject.prototype._doQueue = function () {
  var q = this.schema && this.schema.callQueue;
  if (q) {
    for (var i = 0, l = q.length; i < l; i++) {
      this[q[i][0]].apply(this, q[i][1]);
    }
  }
  return this;
};


/*!
 * Applies virtuals properties to `json`.
 *
 * @param {GraphObject} self
 * @param {Object} json
 * @param {String} type either `virtuals` or `paths`
 * @return {Object} `json`
 */

function applyGetters (self, json, type, options) {
  var schema = self.schema
    , paths = Object.keys(schema[type])
    , i = paths.length
    , path;


  while (i--) {
    path = paths[i];
    json[path] = clone(self.get(path), options);
  }

  return json;
}

/**
 * Converts this document into a plain javascript object
 *
 * ####Options:
 *
 * - `getters` apply all getters (path and virtual getters)
 * - `virtuals` apply virtual getters (can override `getters` option)
 * - `minimize` remove empty objects (defaults to true)
 *
 * Example of only applying path getters
 *
 *     doc.toObject({ getters: true, virtuals: false })
 *
 * Example of only applying virtual getters
 *
 *     doc.toObject({ virtuals: true })
 *
 * Example of applying both path and virtual getters
 *
 *     doc.toObject({ getters: true })
 *
 * @param {Object} [options]
 * @return {Object} js object
 * @api public
 */

GraphObject.prototype.toObject = function (options) {
  // When internally saving this document we always pass options,
  // bypassing the custom schema options.
  if (!(options && 'Object' === options.constructor.name)) {
    options = this.schema.options.toObject
      ? clone(this.schema.options.toObject)
      : {};
  }

  ;('minimize' in options) || (options.minimize = this.schema.options.minimize);

  var ret = clone(this._doc, options);

  if (options.virtuals || options.getters && false !== options.virtuals) {
    applyGetters(this, ret, 'virtuals', options);
  }

  if (options.getters) {
    applyGetters(this, ret, 'paths', options);
  }

  return ret;
};

/**
 * The return value of this method is used in calls to JSON.stringify(doc).
 *
 * @param {Object} options same options as GraphObject#toObject
 * @return {Object}
 * @see GraphObject#toObject
 * @api public
 */

GraphObject.prototype.toJSON = function (options) {
  // check for object type since an array of documents
  // being stringified passes array indexes instead
  // of options objects. JSON.stringify([doc, doc])
  if (!(options && 'Object' === options.constructor.name)) {
    options = this.schema.options.toJSON ? clone(this.schema.options.toJSON) : {};
  }
  options.json = true;
  return this.toObject(options);
};

/**
 * Helper for console.log
 *
 * @api public
 */

GraphObject.prototype.inspect = function (options) {
  var opts = options && 'Object' === options.constructor.name ? options : undefined;
  return inspect(this.toObject(opts));
};

/**
 * Helper for console.log
 *
 * @api public
 * @method toString
 */

GraphObject.prototype.toString = GraphObject.prototype.inspect;
/*!
 * Module exports.
 */

GraphObject.ValidationError = ValidationError;
module.exports = exports = GraphObject;

