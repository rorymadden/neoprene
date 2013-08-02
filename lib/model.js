'use strict';

var request = require('superagent')
  , GraphObject = require('./graphObject')
  , Schema = require('./schema')
  // , Promise = require('./promise')
  , utils = require('./utils')
  , async = require('async')
  , NeopreneError = require('./error')
  , tick = utils.tick;

var VERSION_INC = 2;

/**
 * Model constructor
 *
 * @param {Object} doc values to with which to create the document
 * @inherits GraphObject
 * @event `error`: If listening to this Model event, it is emitted when a document was saved without passing a callback and an `error` occurred. If not listening, the event bubbles to the connection used to create this Model.
 * @event `index`: Emitted after `Model#ensureIndexes` completes. If an error occurred it is passed with the event.
 * @api public
 */

function Model (doc, fields) {
  GraphObject.call(this, doc, fields);
}

/*!
 * Inherits from GraphObject.
 */

Model.prototype.__proto__ = GraphObject.prototype;

/**
 * Connection the model uses.
 *
 * @api public
 * @property url
 */

Model.prototype.db;

/**
 * The name of the model
 *
 * @api public
 * @property modelName
 */

Model.prototype.modelName;
/**
 * The type of the model
 *
 * @api public
 * @property objectType
 */

Model.prototype.objectType;

/*!
 * Compiler utilsity.
 *
 * @param {String} name model name
 * @param {Schema} schema
 * @param {String} db The url for the neo4j server
 */

Model.compile = function compile (name, schema, db, objectType, base) {
  // generate new class
  function model (doc, fields) {
    if (!(this instanceof model))
      return new model(doc, fields);
    Model.call(this, doc, fields);
  }

  model.prototype.modelName = name;
  model.__proto__ = Model;
  model.prototype.__proto__ = Model.prototype;
  model.prototype.db = db;
  model.prototype.objectType = objectType;
  model.prototype.base = base;
  model.prototype._setSchema(schema);

  // apply methods
  for (var i in schema.methods)
    model.prototype[i] = schema.methods[i];

  // apply statics
  for (var j in schema.statics)
    model[j] = schema.statics[j];

  // TODO: figure out what these 2 do?
  // model.model = model.prototype.model;
  // model.options = model.prototype.options;

  model.db = model.prototype.db;
  model.schema = model.prototype.schema;
  model.objectType = model.prototype.objectType;
  model.base = model.prototype.base;
  model.modelName = model.prototype.modelName;

  model.init();

  return model;
};

/**
 * Called when the model compiles.
 *
 * @api private
 */

Model.init = function init () {
  if (this.schema.options.autoIndex) {
    this.ensureIndexes();
  }

  this.schema.emit('init', this);
};

/**
 * Sends `ensureIndex` commands to mongo for each index declared in the schema.
 *
 * ####Example:
 *
 *     Event.ensureIndexes(function (err) {
 *       if (err) return handleError(err);
 *     });
 *
 * After completion, an `index` event is emitted on this `Model` passing an error if one occurred.
 *
 * ####Example:
 *
 *     var eventSchema = new Schema({ thing: { type: 'string', unique: true }})
 *     var Event = mongoose.model('Event', eventSchema);
 *
 *     Event.on('index', function (err) {
 *       if (err) console.error(err); // error occurred during index creation
 *     })
 *
 * _NOTE: It is not recommended that you run this in production. Index creation may impact database performance depending on your load. Use with caution._
 *
 * The `ensureIndex` commands are not sent in parallel. This is to avoid the `MongoError: cannot add index with a background operation in progress` error. See [this ticket](https://github.com/LearnBoost/mongoose/issues/1365) for more information.
 *
 * @param {Function} [cb] optional callback
 * @api public
 */

Model.ensureIndexes = function ensureIndexes (cb) {
  var indexes = this.schema.indexes();
  if (!indexes.length) {
    return cb && process.nextTick(cb);
  }

  // Indexes are created one-by-one to support how MongoDB < 2.4 deals
  // with background indexes.

  var self = this
    , safe = self.schema.options.safe;

  function done (err) {
    // self.emit('index', err);
    cb && cb(err);
  }

  function create () {
    var index = indexes.shift();
    if (!index) return done();
    var options = index[1];

    var property_key;
    for(var key in index[0]){
      property_key = key;
    }

    self.prototype.index(property_key, options.required, function(err){
      if(err && err.message.indexOf('already indexed') === -1){
        return done(err);
      }
      create();
    });
  }

  create();
}


/**
 * Schema the model uses.
 *
 * @property schema
 * @receiver Model
 * @api public
 */

Model.schema;

/**
 * Database url the model uses.
 *
 * @property db
 * @receiver Model
 * @api public
 */

Model.db;

/**
 * Persist a node in the database. Saves the model name against nodes so that
 * the nodes can be loaded as the appropriate model when retreived from the
 * database
 *
 * For convenience, as it is a likely use case, you can create a relationship at the
 * same time as creating the node. On the first save of a node you cna pass a relationship
 * object with the following format:
 * var rel = {
 *   indexField: '_id',
 *   indexValue: req.user._id,
 *   nodeLabel: 'User',
 *   type: 'ADMIN_OF',
 *   direction: 'to',
 *   data: {
 *     active: true,
 *     created: new Date()
 *   }
 * };
 *
 * Only data is optional.
 *
 * @param  {object}  relationship The details fo the relationship from the new node
 * @param  {Function} callback
 * @return {Object}            The saved Model / Relationship.
 * @api private
 */
Model.prototype.save = function(relationship, callback) {
  // var promise = new Promise(callback)
  //   , complete = handleSave(promise, this)
  // //   , options = {}

  if(typeof(relationship) === 'function'){
    callback = relationship;
    relationship = null;
  };

  var self = this;
  //add a type to nodes so that they can be correctly allocated a Schema
  if(this.objectType === 'node') this._doc.nodeType = this.modelName;

  // check if this is a new node (first save) or existing node
  if (!this.isNew) {
    // var delta = this._delta();
    // if (delta) {
    //   var where = this._where(delta[0]);
    //   this.collection.update(where, delta[1], options, complete);
    // } else {
    //   complete(null);
    // }
    // TODO: investigate delta updates for complex documents
    // Build cypher query START n = node(2) SET n={params} RETURN n

    // if exists we want to update properties

    this._inserting = false;
    var url = self.self + '/properties';

    request
      .put(url)
      .send(utils.removeNulls(self._doc))
      .set('Accept', 'application/json')
      .set('X-Stream', true)
      .end(function(res) {
        // REST API returns 204 for success
        if (res.status !== 204) {
          if (res.status === 400) {
            return callback(new NeopreneError('Invalid data sent'), null);
          }
          if (res.status === 404) {
            return callback(new NeopreneError(res.body), null);
          }
          return callback(new NeopreneError('Save error ' + res.status), null);
        }
        // was this an update that required a version bump?
        if (self.__version) {
          var doIncrement = VERSION_INC === (VERSION_INC & self.__version);
          self.__version = undefined;
          // increment version if was successful
            if (doIncrement) {
              var key = self.schema.options.versionKey;
              var version = self.getValue(key) | 0;
              self.setValue(key, version + 1);
            }
        }
        self._reset();
        self.emit('isNew', false);
        return callback(null, self);
      });
      // // attempting promise implementation
      // .end(complete);
      // this._reset();
      // this.emit('isNew', false);
  }
  // else this is a new node / relationship
  else {
    self._version(true, this);


    var query, params = { newNode: this._doc };
    if(relationship){
      if(!relationship.direction || !relationship.type || !relationship.indexField || !relationship.indexValue  || !relationship.nodeLabel){
        return callback(new NeopreneError('Invalid relationship details'));
      }
      if(relationship.indexField === '_id') {
        query = 'START startnode=node({indexValue}) ';
      }
      else query = 'MATCH startnode:' + relationship.nodeLabel + ' WHERE startnode.' + relationship.indexField + '={indexValue} ';
      query += 'CREATE (newnode:' + self.modelName + ' {newNode}), ';

      // stringify the relationship data
      if(!relationship.data) relationship.data = {};
      // else relationship.data = JSON.stringify(relationship.data);

      if(relationship.direction === 'from'){
        query += '(startnode)<-[rel:'+ relationship.type + ' {relData}]-(newnode) ';
      }
      else if(relationship.direction === 'to'){
        query += '(startnode)-[rel:'+relationship.type+ ' {relData}]->(newnode) ';
      }
      query += 'RETURN newnode, rel';

      var params = {
        newNode: this._doc,
        indexValue: relationship.indexValue,
        relData: relationship.data
      };
    }
    else query = 'CREATE (newnode:' + self.modelName + ' {newNode}) RETURN newnode';


    var cypherUrl = this.db + '/db/data/cypher';
    var cypherQuery = { query: query, params: params };

    request
      .post(cypherUrl)
      .send(cypherQuery)
      .set('Accept', 'application/json')
      .set('X-Stream', true)
      .end(function(res) {
        if (res.status === 200) {
          // update the id variable with the new id
          self._id = utils.getId(res.body.data[0][0].self);
          self.self = res.body.data[0][0].self;

          // load in node._id
          self._doc._id = self._id;

          self._reset();
          self.isNew = false;
          self.emit('isNew', false);
          self._inserting = true;
          // need to separate between only a node returned and a rel as well
          var response;
          if(res.body.data[0][1]){
            response = {node: self, rel: res.body.data[0][1]};
          }
          else response = self;

          return callback(null, response);
        }
        return callback(new NeopreneError(res.body.message));
    });
  }
};

/*!
 * Handles doc.save() callbacks
 */

// function handleSave (promise, self) {
//   return tick(function handleSave (res) {
//     if(!(res.status === 201 || res.status === 204 )){
//       var err;
//       if (res.status === 400) {
//         err = new NeopreneError('Invalid data sent');
//       }
//       // if (res.status === 404) {
//       //   return callback(new NeopreneError(res.body), null);
//       // }
//       err = new NeopreneError('Save error ' + res.status);
//       if (self._inserting) {
//         self.isNew = true;
//         self.emit('isNew', true);
//       }
//       promise.error(err);
//       promise = self = null;
//       return;
//     }
//     // was this an update that required a version bump?
//     if (self.__version) {
//       var doIncrement = VERSION_INC === (VERSION_INC & self.__version);
//       self.__version = undefined;
//       // increment version if was successful
//       if (doIncrement) {
//         var key = self.schema.options.versionKey;
//         var version = self.getValue(key) | 0;
//         self.setValue(key, version + 1);
//       }
//     }

//     // var numAffected;
//     // if (res.body) {
//     //   // when inserting, the array of created docs is returned
//     //   numAffected = res.body.length
//     //     ? res.body.length
//     //     : res.body;
//     // } else {
//     //   numAffected = 0;
//     // }

//     // was this an update that required a version bump?
//     if (self.__version && !self._inserting) {
//       var doIncrement = VERSION_INC === (VERSION_INC & self.__version);
//       self.__version = undefined;

//       if (doIncrement) {
//         var key = self.schema.options.versionKey;
//         var version = self.getValue(key) | 0;
//         self.setValue(key, version + 1);
//       }
//     }


//     self._id = utils.getId(res.body.self);
//     self.self = res.body.self;

//     self.emit('save', self);
//     promise.complete(self);
//     promise = self = null;
//   });
// }


/**
 * Pass an object of properties to update the Node / Relationship
 * @param  {Object} updates     {name: 'New Name', age: 30}.
 * @param  {Function} callback
 * @return {Object}            The Node/Relationship which called the update.
 * @api private
 */
Model.prototype.update = function(updates, callback) {
  // validate that updates object passed
  if (typeof(updates) === 'function') {
    callback = updates;
    process.nextTick(function() {
      return callback(new NeopreneError('Need to provide updates for object'),
        null);
    });
  }
  else {
    var self = this;
    // map updates to the object and save
    for (var key in updates) {
      this[key] = updates[key];
    }
    this.save(callback);
  }
};

/**
 * Add a Node / Relationship to a given index and key-value GraphObject.
 * @param  {String}   index
 * @param  {String}   key
 * @param  {String}   value
 * @param  {Boolean}  unique    Boolean for unique - defaults to false.
 * @param  {Function} callback
 * @api private
 */
Model.prototype.index = function(key, unique, callback){
  var self = this, query, url;
  // allow optional unique value
  if (typeof(unique) === 'function') {
    callback = unique;
    unique = '';
  }
  // check that key exists
  if (typeof(key) === 'function') {
    callback = key;
    process.nextTick(function() {
      return callback(new NeopreneError('Invalid index request, key is necessary'));
    });
  }
  else {
    url = this.db + '/db/data/cypher';
    // if unique augment the url appropriately
    if (unique === true) {
      query = 'CREATE CONSTRAINT ON (n:' + self.modelName + ') ASSERT n.' + key + ' IS UNIQUE';
    }
    else {
      query = 'CREATE INDEX ON :' + self.modelName + '(' + key + ')';

    }

    request
      .post(url)
      .send({query: query, params: {}})
      .set('Accept', 'application/json')
      .set('X-Stream', true)
      .end(function(res) {
        // REST API returns 201 if index created or 200 if index exists
        if (res.status === 200) {
          self.emit('index');
          return callback(null);
        }
        return callback(new NeopreneError(res.body.message));
      });
  }
};


/**
 * Delete the Node / Relationship
 * @param  {Boolean} force     Delete all linked relationships. Defaults to false.
 * @param  {Function} callback
 * @return {null}
 * @api private
 */
Model.prototype['delete'] = function (force, callback) {

  // allow for optional force value
  if (typeof(force) === 'function') {
    callback = force;
    force = false;
  }

  // check that item exists in the database
  if (!this._id) {
    process.nextTick(function() {
      callback(new NeopreneError('Object does not exist to delete'));
    });
  }
  else {

    var self = this;
    // you cannot delete a node which has active relationships
    // if force we need to delete all linked relationships before
    // deleting the node. Instead of sending multiple http requests
    // we will contruct a single query to delete all relationships
    // and then the node
    if (force) {
      // turn force into a count to retry the delete if tehre is an issue
      if (force === true || typeof(force) !== 'number' || force > 3) force = 0;
      var query = 'START n = node(' + self._id + ') MATCH n-[r?]-() DELETE r,n';
      var cypherUrl = this.db + '/db/data/cypher';
      var cypherQuery = { query: query, params: {} };

      request
        .post(cypherUrl)
        .send(cypherQuery)
        .set('Accept', 'application/json')
        .set('X-Stream', true)
        .end(function(res) {
          // REST API returns 200
          if (res.status === 200) {
            self.emit('remove', self);
            return callback(null, null);
          }
          // check if error from records being locked and try again
          // Up to three tries
          if (res.status === 500) {
            if (force++ < 3) return self.del(force, callback);
          }
          return callback(new NeopreneError(res.body.message));
        });
    }
    else {
      // not forced so attempt to delete single node
      request
        .del(self.self)
        .set('Accept', 'application/json')
        .set('X-Stream', true)
        .end(function(res) {
          // returns 204 for success
          if (res.status !== 204) {
            if (res.status === 404) {
              return callback(new NeopreneError('Object not found'));
            }
            if (res.status === 409) {
              return callback(new NeopreneError('Node could not be deleted ' +
                '(still has relationships?)'));
            }
            return callback(new NeopreneError('Delete error ' + err.status));
          }
          // remove object
          self.emit('remove', self);
          self = null;
          callback(null);
        });
    }
  }
};

/**
 * A convenience function for Node / Relationship delete
 * @api private
 */
Model.prototype.del = function() {
  return this['delete'].apply(this, arguments);
};

/**
 * A convenience function for Node / Relationship delete
 * @api private
 */
Model.prototype.remove = function() {
  return this['delete'].apply(this, arguments);
};

/**
 * Appends versioning to the where and update clauses.
 *
 * @api private
 */

Model.prototype._version = function _version (where, delta) {
  var key = this.schema.options.versionKey;

  if (true === where) {
    // this is an insert
    if (key) this.setValue(key, delta[key] = 0);
    return;
  }
};

/**
 * Create relationship with direction from node to otherModel with given
 * type and data properties.
 * @param  {Model} otherModel The destination node.
 * @param  {String} type      The type of relationships e.g. friend.
 * @param  {Object} data      Key-Value properties of relationship. Optional
 * @param  {Function} callback
 * @return {Relationship}
 * @api    public
 */
Model.prototype.createRelationshipTo = function(otherModel, type, data, callback) {
  return this.base._createRelationship(this, otherModel, type, data, callback);
};


/**
 * Create relationship with direction to node from otherModel with given
 * type and data properties.
 * @param  {Model} otherModel The relationship origin node.
 * @param  {String} type      The type of relationships e.g. friend.
 * @param  {Object} data      Key-Value properties of relationship. Optional
 * @param  {Function} callback
 * @return {Relationship}
 * @api    public
 */
Model.prototype.createRelationshipFrom = function(otherModel, type, data, callback) {
  return this.base._createRelationship(otherModel, this, type, data, callback);
};

/**
 * Create relationship with direction from node to otherModel with given type.
 * @param  {Model} otherModel The destination node.
 * @param  {String} type      The type of relationships e.g. friend.
 * @param  {Function} callback
 * @return {null}
 * @api    public
 */
Model.prototype.removeRelationshipTo = function(otherModel, type, callback) {
  return this.base._removeRelationship(this, otherModel, type, callback);
};


/**
 * Remove relationship with direction to node from otherModel with given type.
 * @param  {Model} otherModel The relationship origin node.
 * @param  {String} type      The type of relationships e.g. friend.
 * @param  {Function} callback
 * @return {null}
 * @api    public
 */
Model.prototype.removeRelationshipFrom = function(otherModel, type, callback) {
  return this.base._removeRelationship(otherModel, this, type, callback);
};


/**
 * Get all relationships and associated nodes for a node with an optional type and node label. Direction of
 * relationship is not relevant.
 *
 * Example. I have a node and I want all linked User nodes which have a relationship of type 'Follows'
 * node.getAllRelationships('Follows', 'User', function(err, results){})
 *
 * I can use multiple relationship types
 * node.getAllRelationships(['Follows', 'likes'], 'User', function(err, results){})
 *
 * I dont need to include the node label
 * node.getAllRelationships(['Follows', 'likes'], function(err, results){})
 *
 * I can add conditions and options
 * Conditions are based on the relationship data attributes
 * node.getAllRelationships(['Follows', 'likes'], 'User', { active = true }, {limit: 5}, function(err, results){})
 *
 * If I want all linked User nodes regardless of relationship type I need to populate a null
 * node.getAllRelationships(null, 'User', function(err, results){})
 *
 * I can also just get all relationships and nodes
 * node.getAllRelationships(function(err, results){})
 *
 * Results is an onject with two elements: rels and nodes
 * Rels is an array of relationships. Each relationship has an _id, a direction ('in' or 'out' from the calling node)
 * and a type (e.g. Follows). There is an options data parameter as well if the relationship has data.
 *
 * @param  {String} type      The type of relationship e.g. friend. Optional. Defaults to all types.
 * @param  {String} label     The node type that you are querying for. Optional.
 * @param  {Object} conditions Field values on the relationship (e.g. active = true). Optional.
 * @param  {Object} options    Limit, orderBy, skip and Using options. Optional.
 * @param  {Function} callback
 * @return {Object}           {rels: Array of relationships, nodes: Array of nodes}.
 * @api    public
 */
Model.prototype.getAllRelationships = function(type, label, conditions, options, callback) {
  return this.base._getRelationships(this._id, 'all', type, label, conditions, options, callback);
};

/**
 * Get all outgoing relationships and associated nodes for a node with an optional type and node label.
 *
 * Example. I have a node and I want all linked User nodes which this node 'Follows'
 * node.getOutgoingRelationships('Follows', 'User', function(err, results){})
 *
 * I can use multiple relationship types
 * node.getOutgoingRelationships(['Follows', 'likes'], 'User', function(err, results){})
 *
 * I dont need to include the node label
 * node.getOutgoingRelationships(['Follows', 'likes'], function(err, results){})
 *
 * I can add conditions and options
 * Conditions are based on the relationship data attributes
 * node.getOutgoingRelationships(['Follows', 'likes'], 'User', { active = true }, {limit: 5}, function(err, results){})
 *
 * If I want all linked User nodes regardless of relationship type I need to populate a null
 * node.getOutgoingRelationships(null, 'User', function(err, results){})
 *
 * I can also just get all outgoing relationships and nodes
 * node.getOutgoingRelationships(function(err, results){})
 *
 * Results is an onject with two elements: rels and nodes
 * Rels is an array of relationships. Each relationship has an _id, a direction (always 'out' in this case)
 * and a type (e.g. Follows). There is an options data parameter as well if the relationship has data.
 *
 * @param  {String} type      The type of relationship e.g. friend. Optional. Defaults to all types.
 * @param  {String} label     The node type that you are querying for. Optional.
 * @param  {Object} conditions Field values on the relationship (e.g. active = true). Optional.
 * @param  {Object} options    Limit, orderBy, skip and Using options. Optional.
 * @param  {Function} callback
 * @return {Array}             {rels: Array of relationships, nodes: Array of nodes}.
 * @api    public
 */
Model.prototype.getOutgoingRelationships = function(type, label, conditions, options, callback) {
  return this.base._getRelationships(this._id, 'out', type, label, conditions, options, callback);
};

/**
 * Get all incoming relationships and associated nodes for a node with an optional type and node label.
 *
 * Example. I have a node and I want all linked User nodes which 'Follows' this node
 * node.getIncomingRelationships('Follows', 'User', function(err, results){})
 *
 * I can use multiple relationship types
 * node.getIncomingRelationships(['Follows', 'likes'], 'User', function(err, results){})
 *
 * I dont need to include the node label
 * node.getIncomingRelationships(['Follows', 'likes'], function(err, results){})
 *
 * I can add conditions and options
 * Conditions are based on the relationship data attributes
 * node.getIncomingRelationships(['Follows', 'likes'], 'User', { active = true }, {limit: 5}, function(err, results){})
 *
 * If I want all linked User nodes regardless of relationship type I need to populate a null
 * node.getIncomingRelationships(null, 'User', function(err, results){})
 *
 * I can also just get all incoming relationships and nodes
 * node.getIncomingRelationships(function(err, results){})
 *
 * Results is an onject with two elements: rels and nodes
 * Rels is an array of relationships. Each relationship has an _id, a direction (always 'out' in this case)
 * and a type (e.g. Follows). There is an options data parameter as well if the relationship has data.
 *
 * @param  {String} type      The type of relationship e.g. friend. Optional. Defaults to all types.
 * @param  {String} label     The node type that you are querying for. Optional.
 * @param  {Object} conditions Field values on the relationship (e.g. active = true). Optional.
 * @param  {Object} options    Limit, orderBy, skip and Using options. Optional.
 * @param  {Function} callback
 * @return {Array}             {rels: Array of relationships, nodes: Array of nodes}.
 * @api    public
 */
Model.prototype.getIncomingRelationships = function(type, label, conditions, options, callback) {
  return this.base._getRelationships(this._id, 'in', type, label, conditions, options, callback);
};


/**
 * Generic find for your model
 * Conditions and callback are mandatory but fields and options are not
 *
 * Examples:
 * User.find({first:'Rory'}, function(err, nodes){})
 *
 * Fields will return object with only those fields
 * At present everything is being returned from the database so there is no performance benefit
 * This will be investigated in a later release
 * User.find({first:'Rory', last: 'Madden'}, 'first last gender', function(err, nodes){})
 *
 * Options can include: limit, skip, using (to specify an index) or orderBy
 * limit: options = {limit: 10}
 * skip: options = {skip: 7}
 * using: options = {using: ['first, last']}  // can be a single value string or an array
 * orderBy: options = {orderBy: [{field: 'first', desc:true, nulls:true}]}
 * orderBy must be an array of objects - even if there is only one onject
 * each object in orderBy must contain a field element, desc and nulls are optional and default to false
 * User.find({first:'Rory'}, '', {limit: 5, skip:3, orderBy: [{first: 'last', desc:true, nulls: true}]}, function(){})
 *
 *
 * @param  {Object}   conditions  Object of fields and value
 * @param  {String}   fields      Space delimited string
 * @param  {Object}   options     Object of options
 * @param  {Function} callback
 * @return {Node or Array}        If you specify a limit of 1 a single node is returned, otherwise an array of nodes
 */
Model.find = function(conditions, fields, options, callback){
  var self = this;

  if ('function' == typeof conditions) {
    callback = conditions;
    conditions = null;
    fields = null;
    options = null;
  } else if ('function' == typeof fields) {
    callback = fields;
    fields = null;
    options = null;
  } else if ('function' == typeof options) {
    callback = options;
    options = null;
  }

  // Todo: replace with query (mquery)
  // if(conditions === null){
  //   return callback(new NeopreneError('Need to enter some conditions in your query'));
  // }

  var remove = null;
  // is the intention to delete the node?
  if(options && options.hasOwnProperty('remove')){
    //in case a user tries to enter this value in
    delete options.remove.return;
    remove = options.remove;
    delete options.remove;
  }

  var update = null;
  if(options && options.hasOwnProperty('update')){
    update = options.update;
    delete options.update;
  }

  // build query
  var query = 'MATCH (n:' + this.modelName + ')';
  // if there are conditions add in the where clauses
  if(conditions){
    // if we are querying for an id we have to start our search differently
    if(conditions.hasOwnProperty('_id')){
      query = 'START n='+this.objectType+'('+conditions['_id']+')';
      // remove the condition so it doesn't get checked again
      // delete conditions['_id'];
      conditions = null;
    }
    else if(remove && remove.force && options && options.limit === 1) {
      query += '-[r]-()';
      remove.force = null;
      remove.return = true;
    }
    // loop through all conditions and add a WHERE clause
    var params = {};
    var firstWhere = true;
    for(var key in conditions){
      if(firstWhere) {
        query += ' WHERE n.' + key + ' = {' + key + '}';
        firstWhere = false;
      }
      else query += ' AND n.' + key + ' = {' + key + '}';
      params[key] = self.schema.paths[key].instance === 'Number' ? parseInt(conditions[key]) : conditions[key];
      // params[key] = conditions[key];
    }
  }

  // if we need to make updates set the values here
  if(update && options && options.limit === 1 && !remove){
    // expected format update = { first: 'Rory', last: 'Madden'}
    for(var key in update){
      query += ' SET n.' + key + ' = {update' + key + '}';
      params['update' + key] = update[key];
    }
  }

  // return or delete the value (delete only for one record)
  if(remove && options && options.limit === 1) {
    if(remove.force) {
      query += ' MATCH n-[r?]-() DELETE r,n';
    }
    else if (remove.return){
      query += ' DELETE r,n';
    }
    else query += ' DELETE n'
  }
  else query += ' RETURN n';

  //if there are options add in the options
  if(options && !(remove && options.limit === 1)){
    for(var option in options){
      // many options can be array of values orderBy, using
      switch(option) {
        case 'limit':
          // expected format options = { limit: 1 }
          query += ' LIMIT '+options[option];
          break;
        case 'orderBy':
          //expected format options = {orderBy: [{ field: 'name', nulls: true}, {field: 'gender', desc: true}] }
          // nulls and desc are optional
          var lenO = options[option].length;
          for(var k=0; k<lenO; k++){
            if(options[option][k].field){
              query += ' ORDER BY n.' + options[option][k].field;
              if(options[option][k].nulls) query += '?';
              if(options[option][k].desc) query += ' DESC';
              query += ', ';
            }
          }
          // clean up comma at end
          if(query.substr(-2,2) === ', ') query = query.substr(0, query.length - 2);
          break;
        case 'skip':
          // expected format options = { skip: 1 }
          query += ' SKIP '+options[option];
          break;
        case 'using':
          //expected format options = {using: ['name', 'gender'] }
          if(typeof options[option] === 'array'){
            var lenO = options[option].length;
            for(var l=0; l<lenO; l++){
              query += ' USING INDEX n:'+ this.modelName + '(' + options[option][l] + ')';
            }
          }
          else query += ' USING INDEX n:'+ this.modelName + '(' + options[option] + ')';
          break;
      }
    }
  }

  var cypherUrl = this.db + '/db/data/cypher';
  var cypherQuery = { query: query, params: params };

  request
    .post(cypherUrl)
    .send(cypherQuery)
    .set('Accept', 'application/json')
    .set('X-Stream', true)
    .end(function(res) {
      // REST API returns 200
      if (res.status === 200) {
        // loop through all nodes returned and load them as models
        var len = res.body.data.length;
        var results = [];
        for(var i=0; i < len; i++){
          var node = utils.loadObject(res.body.data[i][0], self.base);
          //TODO: test if node has errors - e.g. model could not be loaded.
          if(node.name === 'Neoprene' && node.message.indexOf('Model:') !== -1 && node.message.indexOf(' not initialised') !== -1){
            return callback(node, null);
          }
          // if fields have been specified reduce the fields available
          // TODO: to reduce strain on the database and post processing this should be done in the query
          //        difficulty loading multiple fields into an object though - investigate query object
          if(fields){
            var elements = fields.split(' ');
            for(var key in node._doc){
              if(elements.indexOf(key) === -1) delete node._doc[key];
            }
          }
          results.push(node);
        }
        // findOne, findById should return a single value
        if(options && options.limit === 1) results = results[0];

        // if a value has been updated then increment version
        if(update && options && options.limit===1){
          if (results.__version) {
            var doIncrement = VERSION_INC === (VERSION_INC & results.__version);
            results.__version = undefined;
            // increment version if was successful
            if (doIncrement) {
              var key = results.schema.options.versionKey;
              var version = results.getValue(key) | 0;
              results.setValue(key, version + 1);
            }
          }
        }
        return callback(null, results);
      }
      else return callback(new NeopreneError(res.body.message));
    });
}


/**
 * Returns a single node which matches the conditions.
 * If multiple nodes match the first node will be returned
 * Conditions and callback are mandatory but fields and options are not
 *
 * Examples:
 * User.findOne({first:'Rory'}, function(err, nodes){})
 *
 * Fields will return object with only those fields
 * At present everything is being returned from the database so there is no performance benefit
 * This will be investigated in a later release
 * User.findOne({first:'Rory', last: 'Madden'}, 'first last gender', function(err, nodes){})
 *
 * Options can include: skip, using (to specify an index) or orderBy
 * skip: options = {skip: 7}
 * using: options = {using: ['first, last']}  // can be a single value string or an array
 * orderBy: options = {orderBy: [{field: 'first', desc:true, nulls:true}]}
 * orderBy must be an array of objects - even if there is only one onject
 * each object in orderBy must contain a field element, desc and nulls are optional and default to false
 * User.findOne({first:'Rory'}, '', {skip:3, orderBy: [{first: 'last', desc:true, nulls: true}]}, function(){})
 *
 *
 * @param  {Object}   conditions  Object of fields and value
 * @param  {String}   fields      Space delimited string
 * @param  {Object}   options     Object of options
 * @param  {Function} callback
 * @return {Node/Relationship}    Node/Relationship
 */
Model.findOne = function(conditions, fields, options, callback){
  if ('function' == typeof options) {
    callback = options;
    options = {};
  } else if ('function' == typeof fields) {
    callback = fields;
    fields = null;
    options = {};
  } else if ('function' == typeof conditions) {
    callback = conditions;
    conditions = {};
    fields = null;
    options = {};
  }

  // only want to return one item
  options.limit = 1;

  // pass to find
  return this.find(conditions, fields, options, callback);
}



/**
 * Returns a single node which matches the id.
 * If multiple nodes match the first node will be returned
 * Id and callback are mandatory but fields and options are not
 *
 * Examples:
 * User.findById(20189, function(err, nodes){})
 *
 * Fields will return object with only those fields
 * At present everything is being returned from the database so there is no performance benefit
 * This will be investigated in a later release
 * User.findById(20189, 'first last gender', function(err, nodes){})
 *
 * Options dont make much sense with findById
 * but you can include: skip, using (to specify an index) or orderBy
 * skip: options = {skip: 7}
 * using: options = {using: ['first, last']}  // can be a single value string or an array
 * orderBy: options = {orderBy: [{field: 'first', desc:true, nulls:true}]}
 * orderBy must be an array of objects - even if there is only one onject
 * each object in orderBy must contain a field element, desc and nulls are optional and default to false
 * User.findById(20189, '', {skip:3, orderBy: [{first: 'last', desc:true, nulls: true}]}, function(){})
 *
 *
 * @param  {Number}   id          Id requested
 * @param  {String}   fields      Space delimited string
 * @param  {Object}   options     Object of options
 * @param  {Function} callback
 * @return {Node/Relationship}    Node/Relationship
 */
Model.findById = function(id, fields, options, callback) {
  if(typeof id ==='function'){
    callback = id;
    return callback(new NeopreneError('Need to include an id'));
  }
  return this.findOne({ _id: id }, fields, options, callback);
};


/**
 * Updates and returns a single node which matches the conditions.
 * If multiple nodes match the first node will be returned and updated
 * Conditions, update and callback are mandatory but options is not
 *
 * Examples:
 * User.findOneAndUpdate({first:'Rory'}, {first:'Other'}, function(err, nodes){})
 *
 * Options can include: skip, using (to specify an index) or orderBy
 * skip: options = {skip: 7}
 * using: options = {using: ['first, last']}  // can be a single value string or an array
 * orderBy: options = {orderBy: [{field: 'first', desc:true, nulls:true}]}
 * orderBy must be an array of objects - even if there is only one onject
 * each object in orderBy must contain a field element, desc and nulls are optional and default to false
 * User.findOneAndUpdate({first:'Rory'}, {first:'Other'}, {skip:3, orderBy: [{first: 'last', desc:true, nulls: true}]}, function(){})
 *
 *
 * @param  {Object}   conditions  Object of fields and value
 * @param  {Object}   update      Object with fields and updates
 * @param  {Object}   options     Object of options
 * @param  {Function} callback
 * @return {Node/Relationship}    Node/Relationship
 */
Model.findOneAndUpdate = function(conditions, update, options, callback){
  if(typeof options === 'function'){
    callback = options;
    options = {};
  }
  else if (arguments.length < 3) {
    if ('function' == typeof conditions) {
      callback = conditions;
    }
    else if('function' === typeof update){
      callback = update;
    }
    return callback(new NeopreneError('Conditions, updates and callback are mandatory'))
  }
  options.update = update;
  this.findOne(conditions, '', options, callback);
}

/**
 * Finds and removes a single node which matches the conditions.
 * Requires two database calls - one to find the id and the second to remove
 * If multiple nodes match the first node will be returned and removed
 * Conditions and callback are mandatory but options is not
 *
 * Examples:
 * User.findOneAndRemove({first:'Rory'}, function(err, nodes){})
 *
 * Options are used to force a delete. If a node has relationships you cannot delete it
 * Set options to force to remove all relationships as well
 * User.findOneAndRemove({first:'Rory'}, {remove: {force: true}}, function(){})
 *
 *
 * @param  {Object}   conditions  Object of fields and value
 * @param  {Object}   update      Object with fields and updates
 * @param  {Object}   options     Object of options
 * @param  {Function} callback
 * @return {Node/Relationship}    Node/Relationship
 */
Model.findOneAndRemove = function(conditions, options, callback){
  var self = this;
  if (1 === arguments.length && 'function' == typeof conditions) {
    callback = conditions;
    return callback(new NeopreneError('You need to enter conditions to find the node'))
  }
  if(typeof options === 'function'){
    callback = options;
    options = {};
  }

  // if(!options) options = {};
  // if(options && options.remove){
  //   var temp = options.remove;
  //   delete options.remove
  // }
  // this.findOne(conditions, '', options, function(err, node){
  //   if(options && temp) options.remove = temp;
  //   if(err) return callback(err);
  //   else if(!node) return callback(new NeopreneError('Cannot find Node'));
  //   else return self.findByIdAndRemove(node._id, options, callback);
  // });

  if(!options.remove) options.remove = true;
  this.findOne(conditions, '', options, callback);
}

/**
 * Updates and returns a single node which matches the id.
 * If multiple nodes match the first node will be returned and updated
 * Conditions, update and callback are mandatory but options is not
 *
 * Examples:
 * User.findByIdAndUpdate(20138, {first:'Other'}, function(err, nodes){})
 *
 * @param  {Object}   id          Id of node/relationship
 * @param  {Object}   update      Object with fields and updates
 * @param  {Function} callback
 * @return {Node/Relationship}    Node/Relationship
 */
Model.findByIdAndUpdate = function(id, update, options, callback){
  if(typeof options === 'function'){
    callback = options;
    options = {};
  }
  else if (arguments.length < 3) {
    if ('function' == typeof id) {
      callback = id;
    }
    else if('function' === typeof update){
      callback = update;
    }
    return callback(new NeopreneError('Conditions, updates and callback are mandatory'))
  }
  options.update = update;
  this.findOne({ _id: id }, '', options, callback);
}

/**
 * Finds and removes a single node which matches the id.
 * If multiple nodes match the first node will be returned and removed
 * Conditions and callback are mandatory but options is not
 *
 * Examples:
 * User.findByIdAndRemove(20138, function(err, nodes){})
 *
 * Options are used to force a delete. If a node has relationships you cannot delete it
 * Set options to force to remove all relationships as well
 * User.findByIdAndRemove(20138, {force: true}, function(){})
 *
 *
 * @param  {Number}   id          Id of node/relationship
 * @param  {Object}   update      Object with fields and updates
 * @param  {Object}   options     Object of options
 * @param  {Function} callback
 * @return {Node/Relationship}    Node/Relationship
 */
Model.findByIdAndRemove = function(id, options, callback){
  if (1 === arguments.length && 'function' == typeof id) {
    callback = id;
    return callback(new NeopreneError('You need to enter conditions to find the node'))
  }
  if(typeof options === 'function'){
    callback = options;
    options = {};
  }
  if(!options.remove) options.remove = true;
  this.findOne({ _id: id }, '', options, callback);
}

/**
 * Return a single indexed node. Errors if more than one record
 * returned from the database
 * @param  {String}   index
 * @param  {String}   key
 * @param  {String}   value
 * @param  {Function} callback
 * @return {Node}
 * @api public
 */
Model.getIndexedNode = function(index, key, value, callback){
  this.base.getIndexedNode(index, key, value, callback);
};

// /**
//  * Return a single indexed relationship. Errors if more than one record
//  * returned from the database
//  * @param  {String}   index
//  * @param  {String}   key
//  * @param  {String}   value
//  * @param  {Function} callback
//  * @return {Node}
//  * @api public
//  */
// Model.getIndexedRelationship = function(index, key, value, callback){
//   this.base.getIndexedRelationship(index, key, value, callback);
// };


/**
 * Run a query against the database. Use params to protect against injection
 * @param  {String}   query    Cypher query
 * @param  {Object}   params   Name/Value pairs for the query
 * @param  {Function} callback
 * @return {Array}            Array of nodes/relationships or empty array
 */
Model.query = function(query, params, callback){
  this.base.query(query, params, callback);
};

// /**
//  * Run a Lucene query against a relationship index. If no relationships exist
//  * an empty array is returned.
//  *
//  * NOTE: Neo4j currently uses Lucene 3.5
//  *
//  * @param  {String}   index
//  * @param  {String}   query    Stringified query e.g. name=John*&age=20.
//  * @param  {Function} callback
//  * @return {Array}            The array of matched relationships or empty array.
//  * @api    public
//  */
// Model.queryRelationshipIndex = function(index, query, callback){
//   return this.base.queryIndex(index, query, 'relationship', callback);
// };

// /**
//  * Run a Lucene query against a node index. If no nodes exist
//  * an empty array is returned.
//  *
//  * NOTE: Neo4j currently uses Lucene 3.5
//  *
//  * @param  {String}   index
//  * @param  {String}   query    Stringified query e.g. name=John*&age=20.
//  * @param  {Function} callback
//  * @return {Array}            The array of matched nodes or empty array.
//  * @api    public
//  */
// Model.queryNodeIndex = function(index, query, callback){
//   return this.base.queryIndex(index, query, 'node', callback);
// };

module.exports = Model;