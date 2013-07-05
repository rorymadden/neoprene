// This needs to be renamed and merged with node

var request = require('superagent')
  , GraphObject = require('./graphObject')
  , Schema = require('./schema')
  , Promise = require('./promise')
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

  return model;
};

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
 * Persist a node in the database. Saves teh model name against nodes so that
 * the nodes can be loaded as the appropriate model when retreived from the
 * database
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
      if(!relationship.direction || !relationship.type || !(relationship.email || relationship.id)){
        return callback(new NeopreneError('Invalid relationship details'));
      }
      query = relationship.email ? 'START startnode = node:node_auto_index(email={email}) ' : 'START startnode = node({id}) ';
      query += 'CREATE newnode = {newNode}, '
      if(relationship.direction === "from"){
        query += '(startnode)<-[rel:'+relationship.type+']-(newnode) ';
      }
      else if(relationship.direction === "to"){
        query += '(startnode)-[rel:'+relationship.type+']->(newnode) ';
      }
      query += 'RETURN newnode, rel';

      var params = {
        newNode: this._doc,
        type: relationship.type,
        id: relationship.id,
        email: relationship.email
      };
    }
    else query = 'CREATE newnode = {newNode} RETURN newnode';


    var cypherUrl = this.db + '/db/data/cypher';
    var cypherQuery = { query: query, params: params };

    request
      .post(cypherUrl)
      .send(cypherQuery)
      .set('Accept', 'application/json')
      .set('X-Stream', true)
      .end(function(res) {
        // if(relationship) console.log('200 response '+JSON.stringify(res.body.data[0][0].self));
        if (res.status === 200) {
          // update the id variable with the new id
          self.id = utils.getId(res.body.data[0][0].self);
          self.self = res.body.data[0][0].self;


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
    //   
    // request
    //   .post(this.db + '/db/data/' + this.objectType)
    //   .send(this._doc)
    //   .set('Accept', 'application/json')
    //   .set('X-Stream', true)
    //   .end(function(res) {
    //     // REST API returns 201
    //     if (res.status !== 201) {
    //       if (res.status === 400) {
    //         return callback(new NeopreneError('Invalid data sent'), null);
    //       }
    //       return callback(new NeopreneError('Save error ' + res.status), null);
    //     }
    //     // update the id variable with the new id
    //     self.id = utils.getId(res.body.self);
    //     self.self = res.body.self;

    //     self._reset();
    //     self.isNew = false;
    //     self.emit('isNew', false);
    //     self._inserting = true;

    //     return callback(null, self);
    //   });


      // attempting promise implementation
      // .end(complete);

      // self._reset();
      // self.isNew = false;
      // this.emit('isNew', false);
      // self._inserting = true;
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


//     self.id = utils.getId(res.body.self);
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
Model.prototype.index = function(index, key, value, unique, callback) {
  // allow optional unique value
  if (typeof(unique) === 'function') {
    callback = unique;
    unique = '';
  }
  // check that index, key and value exist
  if (!value || typeof(value) === 'function') {
    callback = value ? value : key ? key : index;
    process.nextTick(function() {
      return callback(new NeopreneError('Invalid index request'));
    });
  }
  // check that node has been saved into the database before indexing
  else if (!this.id) {
    process.nextTick(function() {
      return callback(
        new NeopreneError('Object must be saved before indexing properties'));
    });
  }
  else {
    // if unique augment the url appropriately
    if (unique === true) unique = '?unique';
    var self = this;
    var url = this.db + '/db/data/index/' + this.objectType + '/' +
      index + unique;
    var jsonData = {
      key: key,
      value: value,
      uri: self.self
    };
    request
      .post(url)
      .send(jsonData)
      .set('Accept', 'application/json')
      .set('X-Stream', true)
      .end(function(res) {
        var err = null;
        // REST API returns 201 if index created or 200 if index exists
        if (res.status !== 201 && res.status !== 200) {
          err = new NeopreneError(res.body.message);
        }
        self.emit('index', err);
        return callback(err);
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
  if (!this.id) {
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
      var query = 'START n = node(' + self.id + ') MATCH n-[r?]-() DELETE r,n';
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
  this._createRelationship(this, otherModel, type, data, callback);
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
  this._createRelationship(otherModel, this, type, data, callback);
};

/**
 * Convenience function for createRelationshipTo and createRelationshipFrom.
 * @param  {Model} from      The relationship origin node.
 * @param  {Model} to        The relationship destination node.
 * @param  {String} type      The type of relationships e.g. friend.
 * @param  {Object} data      Key-Value properties of relationship. Optional
 * @param  {Function} callback
 * @return {Relationship}
 * @api    private
 */
Model.prototype._createRelationship = function(from, to, type, data, callback) {
  if(from.objectType !== 'node' || to.objectType !== 'node') 
    return callback(new NeopreneError('Can only create relationships from nodes'));
  // allow optional data field
  if (typeof(data) === 'function') {
    callback = data;
    data = {};
  }
  // validate that from and to are valid nodes and type exists
  if (typeof(type) === 'function' || !from.self || !to.self) {
    process.nextTick(function() {
      if (typeof(type) === 'function') callback = type;
      return callback(
        new NeopreneError('Cannot create relationship - invalid input'), null);
    });
  }
  else {
    var self = this;
    var createRelationshipURL = from.self + '/relationships';
    var otherModelURL = to.self;

    var jsonData = {
      to: otherModelURL,
      data: data,
      type: type
    };

    request
      .post(createRelationshipURL)
      .send(jsonData)
      .set('Accept', 'application/json')
      .set('X-Stream', true)
      .end(function(res) {
        // REST API returns 201 for success
        if (res.status !== 201) {
          // if (res.status === 400) {
          //   return callback(new NeopreneError('Invalid createRelationship: //' +
          //     '{from.id} //{type} //{to.id} w/ data: ' +
          //     '//{JSON.stringify(data)}'), null);
          // }
          // if (res.status === 409) {
          //   return callback(new NeopreneError('"to" node, or the node ' +
          //   'specified by the URI not found'), null);
          // }
          return callback(new NeopreneError(res.body.message), null);
        }
        return callback(null, utils.loadObject(res.body, self.base));
      });
  }
};

/**
 * Convenience function for getRelationshipTo and getRelationshipFrom
 * @param  {String} direction all, in or out.
 * @param  {String} type      The type of relationship e.g. friend. Optional. Defaults to all types.
 * @param  {Function} callback
 * @return {Array}             Array of Relationships or empty.
 * @api    private
 */
Model.prototype._getRelationships = function(direction, type, callback) {
  if(this.objectType !== 'node') return callback(new NeopreneError('Can only get relationships from nodes'))
  var self = this;
  // allow optional type value
  if (typeof(type) === 'function') {
    callback = type;
    type = [];
  }

  // Assume no types
  var types = null;

  // support passing in multiple types, as array
  if (type.length > 0) {
    types = (type instanceof Array) ? type : [type];
  }

  var relationshipsURL = this.self + '/relationships/' + direction;
  if (types) {
    relationshipsURL += '/' + types.join('&');
  }

  request
    .get(relationshipsURL)
    .set('Accept', 'application/json')
    .set('X-Stream', true)
    .end(function(res) {
      // REST API returns 200
      if (res.status !== 200) {
        return callback(new NeopreneError('Unrecognized response code: ' +
          res.status), null);
      }
      async.map(res.body,
        function(obj, callback) {
          return callback(null, utils.loadObject(obj, self.base));
        },
        function(err, results) {
          if (err) return callback(new NeopreneError(err), null);
          return callback(null, results);
        }
      );
    });
};

/**
 * Get all relationships for a node with an optional type. Direction of
 * relationship is not relevant
 * @param  {String} type      The type of relationship e.g. friend. Optional. Defaults to all types.
 * @param  {Function} callback
 * @return {Array}             Array of Relationships or empty.
 * @api    public
 */
Model.prototype.getAllRelationships = function(type, callback) {
  return this._getRelationships('all', type, callback);
};

/**
 * Get all outgoing relationships for a node with an optional type.
 * @param  {String} type      The type of relationship e.g. friend. Optional. Defaults to all types.
 * @param  {Function} callback
 * @return {Array}             Array of Relationships or empty.
 * @api    public
 */
Model.prototype.getOutgoingRelationships = function(type, callback) {
  return this._getRelationships('out', type, callback);
};

/**
 * Get all incoming relationships for a node with an optional type.
 * @param  {String} type      The type of relationship e.g. friend. Optional. Defaults to all types.
 * @param  {Function} callback
 * @return {Array}             Array of Relationships or empty.
 * @api    public
 */
Model.prototype.getIncomingRelationships = function(type, callback) {
  return this._getRelationships('in', type, callback);
};


/**
 * Return the Models with a relationship to the given node optionally
 * filtered by relationship types / direction to a specified depth
 * (number of levels)
 * Rels is very versatile. This can be a string type, e.g. `'likes'`, in
 * which case both directions are traversed. Or it can be an array of string
 * types, e.g. `['likes', 'loves']`. It can also be an object, e.g. `{type:
 * 'likes', direction: 'out'}`. Finally, it can be an array of objects, e.g.
 * `[{type: 'likes', direction: 'out'}, ...]`. Optional. Defaults to all
 * directions and all types.
 * 
 * @param  {String, Array<String>, Object, Array<Object>} rels
 * @param  {Number} depth    Optional. Defaults to 1.
 * @param  {Function} callback
 * @return {Array}             Models or empty.
 * @api   public
 */
Model.prototype.getAdjacentNodes = function(rels, depth, callback) {
  // optional depth and rels inputs
  if (typeof(depth) === 'function') {
    callback = depth;
    depth = 1;
  }
  if (typeof(rels) === 'function') {
    callback = rels;
    rels = null;
    depth = 1;
  }
  this.traverse('node', null, rels, null, null, depth, callback);
};

/**
 * Custom traversal of the graph database.
 * http://docs.neo4j.org/chunked/stable/rest-api-traverse.html#rest-api-traversal-using-a-return-filter
 *
 * Relationships is very versatile. This can be a string type, e.g. `'likes'`, in
 * which case both directions are traversed. Or it can be an array of string
 * types, e.g. `['likes', 'loves']`. It can also be an object, e.g. `{type:
 * 'likes', direction: 'out'}`. Finally, it can be an array of objects, e.g.
 * `[{type: 'likes', direction: 'out'}, ...]`. Optional. Defaults to all
 * directions and all types.
 * @param  {String} returnType    node, relationship, path, fullpath. Defaults to path.
 * @param  {String} order         breadth_first, depth_first. Defaults to breadth_first.
 * @param  {String, Array, Object}  relationships See description
 * @param  {String} uniqueness    node_global, none, relationship_global, node_path, relationship_path. Defaults to node_global.
 * @param  {String} returnFilter  all, all_but_start_node. Defaults to all_but_start_node.
 * @param  {Number} maxDepth      Number of levels. Defaults to 1.
 * @param  {Function} callback
 * @return {Array}                 Array of Models and,or Relationships
 *                                 Empty if no results returned.
 */
Model.prototype.traverse = function (returnType, order, relationships, uniqueness, returnFilter, maxDepth, callback) {
  if(this.objectType !== 'node') return callback(new NeopreneError('Can only create relationships from nodes'))
  // validate that all values exist
  if (!callback || typeof(callback) !== 'function') {
    process.nextTick(function() {
      return callback(new NeopreneError('Traverse function incorrectly called'),
        null);
    });
  }
  else {
    var self = this;

    // list the possible options for each input type
    var returnTypes = ['node', 'relationship', 'path', 'fullpath']
      , orders = ['breadth_first', 'depth_first']
      , relationshipsOptions = ['all', 'in', 'out']
      , uniquenessOptions = ['node_global', 'none', 'relationship_global',
        'node_path', 'relationship_path']
      , returnFilters = ['all', 'all_but_start_node'];

    // map relationships to array of objects
    if (!relationships) {
      relationships = [];
      relationships.push({ direction: 'all' });
    }
    else {
      if (!(relationships instanceof Array)) {
        relationships = [relationships];
      }
      relationships = relationships.map(function(rel) {
        if (typeof(rel) === 'string') return { direction: 'all', type: rel };
        else return rel;
      });
    }

    // set defaults if values are blank
    if (!returnType) returnType = 'path';
    if (!order) order = 'breadth_first';

    if (!uniqueness) uniqueness = 'node_global';
    if (!returnFilter) returnFilter = 'all_but_start_node';
    if (!maxDepth) maxDepth = '1';

    // validate that options entered are valid options
    if (returnTypes.indexOf(returnType) === -1 ||
     orders.indexOf(order) === -1 ||
     uniquenessOptions.indexOf(uniqueness) === -1 ||
     returnFilters.indexOf(returnFilter) === -1 ||
     typeof(maxDepth) !== 'number') {
      var issue = '';
      if (returnTypes.indexOf(returnType) === -1) {
        if (issue.length > 0) issue += ', ';
        issue += 'invalid returnType';
      }
      if (orders.indexOf(order) === -1) {
        if (issue.length > 0) issue += ', ';
        issue += 'invalid order';
      }
      if (uniquenesss.indexOf(uniqueness) === -1) {
        if (issue.length > 0) issue += ', ';
        issue += 'invalid uniqueness';
      }
      if (returnFilters.indexOf(returnFilter) === -1) {
        if (issue.length > 0) issue += ', ';
        issue += 'invalid returnFilter';
      }
      if (typeof(maxDepth) !== 'number') {
        if (issue.length > 0) issue += ', ';
        issue += 'invalid max depth';
      }
      process.nextTick(function() {
        return callback(new NeopreneError('Invalid traverse request ' + issue),
          null);
      });
    }
    else {
      var traverseURL = this.self + '/traverse/' + returnType;
      var jsonData = {
        order: order,
        relationships: relationships,
        uniqueness: uniqueness,
        return_filter: {
          'language' : 'builtin',
          'name' : returnFilter
        },
        max_depth: maxDepth
      };

      request
        .post(traverseURL)
        .send(jsonData)
        .set('Accept', 'application/json')
        .set('X-Stream', true)
        .end(function(res) {
          if (res.status !== 200) {
            // if (res.status === 404) {
            //   return callback(null, null);
            // }
            return callback(new NeopreneError('Traverse error: ' +
              res.status), null);
          }
          // map items returned to Models, Relationships or Paths
          async.map(res.body, function(data, callback) {
            return callback(null, utils.transform(data, self.base));
          }, function(err, results) {
            if (err) return callback(new NeopreneError(err));
            return callback(null, results);
          });
        });
    }
  }
};


/**
 * This is the function used by getNodeById and get RelationshipById.
 * Fetch a node/relationship by id
 *
 * NOTE: This will be moved to PropertyContainer.getObject once
 * rewrite is complete
 *
 * @param  {String} type     node or relationship.
 * @param  {Number} id
 * @param  {Function} callback
 * @return {Node/Relationship}  Error if no value returned.
 * @api    private
 */
Model.findById = function(id, callback) {
  // validate that id has been included
  if (typeof(id) === 'function') {
    callback = id;
    process.NextTick(function() {
      return callback(new NeopreneError('Invalid request'), null);
    });
  }
  else {
    var self = this;
    var url = this.db + '/db/data/' + self.objectType + '/' + id;
    request
      .get(url)
      .set('Accept', 'application/json')
      .set('X-Stream', true)
      .end(function(res) {
        // REST API returns 200
        if (res.status !== 200) {
          if (res.status === 404) {
            return callback(new NeopreneError('Id does not match'), null);
          }
          return callback(new NeopreneError(res.body.message), null);
        }
        // var modelFrame = self.base.loadModel(self.modelName);
        // var casted = new modelFrame(res.body.data);
        // casted.self = res.body.self;
        return callback(null, utils.loadObject(res.body, self.base));
      });
  }
};

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

/**
 * Return a single indexed relationship. Errors if more than one record
 * returned from the database
 * @param  {String}   index
 * @param  {String}   key
 * @param  {String}   value
 * @param  {Function} callback
 * @return {Node}
 * @api public
 */
Model.getIndexedRelationship = function(index, key, value, callback){
  this.base.getIndexedRelationship(index, key, value, callback);
};


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

/**
 * Run a Lucene query against a relationship index. If no relationships exist
 * an empty array is returned.
 *
 * NOTE: Neo4j currently uses Lucene 3.5
 *
 * @param  {String}   index
 * @param  {String}   query    Stringified query e.g. name=John*&age=20.
 * @param  {Function} callback
 * @return {Array}            The array of matched relationships or empty array.
 * @api    public
 */
Model.queryRelationshipIndex = function(index, query, callback){
  return this.base.queryIndex(index, query, 'relationship', callback);
};

/**
 * Run a Lucene query against a node index. If no nodes exist
 * an empty array is returned.
 *
 * NOTE: Neo4j currently uses Lucene 3.5
 *
 * @param  {String}   index
 * @param  {String}   query    Stringified query e.g. name=John*&age=20.
 * @param  {Function} callback
 * @return {Array}            The array of matched nodes or empty array.
 * @api    public
 */
Model.queryNodeIndex = function(index, query, callback){
  return this.base.queryIndex(index, query, 'node', callback);
};

module.exports = Model;