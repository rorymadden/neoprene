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
 * @event `error`: If listening to this Model event, it is emitted when a document was saved without passing a
 * callback and an `error` occurred. If not listening, the event bubbles to the connection used to create this Model.
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

/*!
 * Compiler utilsity.
 *
 * @param {String} name model name
 * @param {Schema} schema
 * @param {String} db The url for the neo4j server
 */

Model.compile = function compile (name, schema, db, base) {
  // generate new class
  function model (doc, fields) {
    if (!(this instanceof model))
      return new model(doc, fields);
    Model.call(this, doc, fields);
  }

  model.prototype.modelName = name;
  model.__proto__ = Model;
  model.prototype.__proto__ = Model.prototype;
  model.prototype._db = db;
  // model.prototype.objectType = objectType;
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

  model._db = model.prototype._db;
  model.schema = model.prototype.schema;
  // model.objectType = model.prototype.objectType;
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

    self.prototype.index(property_key, options, function(err){
      if(err && err.message.indexOf('already indexed') === -1){
        return done(err);
      }
      create();
    });
  }

  create();
}

/**
 * Add a Node / Relationship to a given index and key-value GraphObject.
 * @param  {String}   index
 * @param  {String}   key
 * @param  {String}   value
 * @param  {Boolean}  unique    Boolean for unique - defaults to false.
 * @param  {Function} callback
 * @api private
 */
Model.prototype.index = function(key, options, callback){
  var self = this, query, url;
  // allow optional unique value
  if (typeof(options) === 'function') {
    callback = options;
    options = {};
  }
  // check that key exists
  if (typeof(key) === 'function') {
    callback = key;
    process.nextTick(function() {
      return callback(new NeopreneError('Invalid index request, key is necessary'));
    });
  }
  else {
    url = this._db + '/db/data/cypher';
    // if unique augment the url appropriately
    if (options && options.unique === true) {
      console.log('ERROR: Not yet working');
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
 * Returns another Model instance.
 *
 * ####Example:
 *
 *     var doc = new Tank;
 *     doc.model('User').findById(id, callback);
 *
 * @param {String} name model name
 * @api public
 */

Model.prototype.model = function model (name) {
  return this._db.model(name);
};

/**
 * Persist a node in the database. Saves the model name against nodes so that
 * the nodes can be loaded as the appropriate model when retreived from the
 * database
 *
 * You can perform a number of additional actions upon creation of a node.
 * The options object can contain: relationship, eventNodes, counters and role
 *
 * relationship is used to create a relationship to/from the new node to another node
 * relationship requires: indexField, indexValue, nodeLabel, type, direction and, optionally, data
 *
 * eventNodes. Event nodes create a history of changes in the database. When you create a new node
 * and eventNode with a label of '{Node Label}Created' is created and associated with the new node and the user.
 *
 * var options = {
 *   relationship: {
 *     indexField: '_id',
 *     indexValue: req.user._id,
 *     nodeLabel: 'User',
 *     type: 'ADMIN_OF',
 *     direction: 'to',
 *     data: {
 *       active: true,
 *       created: new Date()
 *     }
 *   },
 *   eventNodes: {
 *     node: true, // create an event node for the new node, defaults to true. If you set to false this will
 *                 // break future events as it is assumed that the first event node will exist
 *     user: true, // create an event node for the user
 *     relationshipNode: true // create an event node for the related node
 *   },
 *   counters: [{
 *     node: 'node', // node or relationshipNode
 *     field: 'countMembers'
 *   }],
 *   // you can only specify a role if a relationship is specified
 *   role: {
 *     roleOwner: 'relationshipNode', // node or relationshipNode
 *     name: 'Admin'
 *   }
 * };
 *
 * @param  {Object}   node     The data for the new node
 * @param  {Number}   uid      The user id
 * @param  {object}   options  The details fo the relationship from the new node
 * @param  {Function} callback
 * @return {Object}            The saved Model / Relationship.
 * @api private
 */
Model.create = function(node, uid, options, callback){
  // save the modelName in the node so that it can be used for loading the model on lookup
  node._nodeType = this.modelName;
  // convert new node data into an object with a data element. This mimics the response from neo4j database
  var temp = {data: node };

  var loadedModel = utils.loadObject(temp, this.base);
  //id will be null so remove it
  delete loadedModel._doc._id;

  // pop the first argument as we no longer need the node
  [].shift.apply(arguments);
  // create the node in the database
  loadedModel.create.apply(loadedModel, arguments);
};

/**
 * Persist a node in the database. Saves the model name against nodes so that
 * the nodes can be loaded as the appropriate model when retreived from the
 * database
 *
 * You can perform a number of additional actions upon creation of a node.
 * The options object can contain: relationship, eventNodes, counters and role
 *
 * relationship is used to create a relationship to/from the new node to another node
 * relationship requires: indexField, indexValue, nodeLabel, type, direction and, optionally, data
 *
 * eventNodes. Event nodes create a history of changes in the database. When you create a new node
 * and eventNode with a label of '{Node Label}Created' is created and associated with the new node and the user.
 *
 * var options = {
 *   relationship: {
 *     indexField: '_id',
 *     indexValue: req.user._id,
 *     nodeLabel: 'User',
 *     type: 'ADMIN_OF',
 *     direction: 'to',
 *     data: {
 *       active: true,
 *       created: new Date()
 *     }
 *   },
 *   eventNodes: {
 *     node: true, // create an event node for the new node, defaults to true. If you set to false this will
 *                 // break future events as it is assumed that the first event node will exist
 *     user: true, // create an event node for the user
 *     relationshipNode: true // create an event node for the related node
 *   },
 *   counters: [{
 *     node: 'node', // node or relationshipNode
 *     field: 'countMembers'
 *   }],
 *   // you can only specify a role if a relationship is specified
 *   role: {
 *     roleOwner: 'relationshipNode', // node or relationshipNode
 *     name: 'Admin'
 *   }
 * };
 *
 * @param  {Object}   node     The data for the new node
 * @param  {Number}   uid      The user id
 * @param  {object}   options  The details fo the relationship from the new node
 * @param  {Function} callback
 * @return {Object}            The saved Model / Relationship.
 * @api private
 * */
Model.prototype.create = function(uid, options, callback){
  if(typeof uid === 'function'){
    callback = uid;
    uid = null;
    options= {};
  }
  else if(typeof options === 'function'){
    callback = options;
    if(typeof uid === 'object') {
      options = uid;
      uid = null;
    }
    else options = {};
  }

  if(this._id) {
    return callback(new NeopreneError('The node already exists. You cannot call create on an existing node'));
  }

  if((options.role && options.role.roleOwner === 'relationshipNode') && !options.relationship){
    return callback(new NeopreneError('Invalid create request. You cannot have a relationship role if there is no relationship.'));
  }
  if((options.role && options.role.roleOwner === 'user') && !uid){
    return callback(new NeopreneError('Invalid create request. You cannot have a user role if there is no user.'));
  }
  if(!uid && (options.eventNodes && options.eventNodes.user)){
    return callback(new NeopreneError('Invalid create request. You cannot have event nodes on an non existant user.'));
  }
  if(!options.relationship && (options.eventNodes && options.eventNodes.relationshipNode)){
    return callback(
      new NeopreneError('Invalid create request. You cannot have event nodes on a non existant relationship.'));
  }
  if(options.counters && !(options.relationship || (options.eventNodes && options.eventNodes.user))){
    return callback(
      new NeopreneError('Invalid create request. You cannot have counters without an event node or relationship.'));
  }
  if(!options.eventNodes || options.eventNodes.node !== false){
    if(!options.eventNodes){
      options.eventNodes = {
        node: true
      };
    }
    else options.eventNodes.node = true;
  }
  if(options.eventNodes && ((options.eventNodes.user || options.eventNodes.relationshipNode) && !options.eventNodes.node)){
    return callback(new NeopreneError('Invalid create request. You cannot have user/relationship event nodes without node event nodes.'));
  }
  var self = this;

  // Handle User-User events
  // Instead of two EVENT_USER relationships, which do not specify the owner we create
  // USER_SOURCE_EVENT and USER_TARGET_EVENT
  var userSource = '';
  var userTarget = '';
  if(options.eventNodes.user && this.modelName === 'User'){
    userTarget = 'TARGET_';
    userSource = 'SOURCE_';
  }

  // in case this is called directly and not via the Model.create function
  if(!this._doc._nodeType) this._doc._nodeType = this.modelName;
  var query = '',
      params = { newNode: this._doc};
  if(uid) params.userId = parseInt(uid, 10);

  // CREATE THE NEW NODE
  // If there is a relationship we will need to create the new realtionship as well as the node
  // e.g. options: {relationship {...}}
  if(options.relationship){
    if(!options.relationship.direction || !options.relationship.type || !options.relationship.indexField ||
     !options.relationship.indexValue  || !options.relationship.nodeLabel){
      return callback(new NeopreneError('Invalid relationship details'));
    }

    // Lookup logic - Relationship (based on _id) and EventNodes, if requested
    // Need to lookup starting nodes if the relationship requested has an indexField of _id
    // Need to lookup user if evtNodes user is specified
    // Need to lookup LATEST EVENT for user and/or relationshipNode if eventNodes requested
    // e.g options: {eventNodes:{user:true, relationshipNode:true}}
    if(options.relationship.indexField === '_id' || options.eventNodes.user) {
      query += 'START ';
    }
    if(options.relationship.indexField === '_id') query += 'relNode=node({indexValue}), ';
    if(options.eventNodes.user) query += 'user = node({userId}), ';
    //remove extra comma
    query = query.slice(0, -2);

    // find the latest nodes if eventNodes has been selected
    if(options.eventNodes.relationshipNode || options.eventNodes.user){
      query += ' MATCH';
      if(options.eventNodes.user) {
        query += ' user-[userLatestRel:LATEST_EVENT]->(userLatestEvent),';
      }
    }
    if(options.eventNodes.relationshipNode) {
      query+= ' (relNode';
      // if the relationship hasn't been found above, find it here
      if(options.relationship.indexField !== '_id') query+=':' + options.relationship.nodeLabel;
      query += ')-[relNodeLatestRel:LATEST_EVENT]->(relNodeLatestEvent)';
      if(options.relationship.indexField !== '_id') {
        query+= ' WHERE relNode.' + options.relationship.indexField + '={indexValue} ';
      }
    }
    //remove extra comma
    else if(options.eventNodes.user) query = query.slice(0, - 1);


    // once the starting nodes have been found
    // e.g. straight create with no options passed
    query += ' CREATE ';

    if(options.relationship.direction === 'from'){
      query += '(relNode)<-[rel:'+ options.relationship.type + ' {relData}]-';
    }
    else if(options.relationship.direction === 'to'){
      query += '(relNode)-[rel:'+options.relationship.type+ ' {relData}]->';
    }
    query += '(newNode:' + self.modelName + ' {newNode})';

    params.indexValue = options.relationship.indexValue;
    params.relData = options.relationship.data ? options.relationship.data : {};
  }

  // if there are no relationships to create there might still be eventNodes for the user
  else if(options.eventNodes.user){
    query = 'START user = node({userId})'+
      ' MATCH user-[userLatestRel:LATEST_EVENT]->(userLatestEvent) ' +
      'CREATE (newNode:' + self.modelName + ' {newNode})';
  }
  // if there are no relationships and no eventNodes then just create the new node
  else {
    query = 'CREATE (newNode:' + self.modelName + ' {newNode})';
  }

  // CREATE EVENTS AND SET LATEST_EVENT
  if(options.eventNodes){
    if(options.eventNodes.node) query += '<-[:EVENT_' + userTarget + self.modelName.toUpperCase() + ']-(event:_' +
      self.modelName + 'Created {date: {_currentDate}, _nodeType: {_eventNodeType}})<-[:LATEST_EVENT]-(newNode)';
    // if there is a relationship then we need to add a relationship to the other node
    if(options.eventNodes.relationshipNode){
      // TODO: Will fail if oldStartEvent is not found (e.g. first instance of a model)
      query += ', (event)-[:EVENT_' + options.relationship.nodeLabel.toUpperCase() +
      ']->(relNode)-[:LATEST_EVENT]->(event)-[:NEXT_' + options.relationship.nodeLabel.toUpperCase() +
      ']->(relNodeLatestEvent)';
    }
    if(options.eventNodes.user){
      // TODO: Will fail if oldStartEvent is not found (e.g. first instance of a model)
      // Also hardcoding EVENT_USER may not be appropriate
      query += ', (event)-[:EVENT_' + userSource + 'USER]->(user)-[:LATEST_EVENT]->(event)-[:NEXT_USER]->(userLatestEvent)';
    }
    params._currentDate = Date.now();
    params._eventNodeType = '_' + self.modelName + 'Created';
  }

  // CREATE HAS_ROLE_IN_ and HAS_ relationships
  if(options.role){
    if(options.role.roleOwner === 'node'){
      query += ', (newNode)-[:HAS_ROLE_IN_' + options.relationship.nodeLabel.toUpperCase() +
               ']->(role:_' + options.relationship.nodeLabel + 'Role {role: {_role}, _nodeType: {_roleNodeType}})-[:HAS_' + options.relationship.nodeLabel.toUpperCase() +
               ']->(relNode)';
      params._roleNodeType = '_' + options.relationship.nodeLabel + 'Role';
    }
    else if(options.role.roleOwner === 'relationshipNode'){
      query += ', (relNode)-[:HAS_ROLE_IN_' + self.modelName.toUpperCase() +
               ']->(role:_' + self.modelName + 'Role {role: {_role}, _nodeType: {_roleNodeType}})-[:HAS_' + self.modelName.toUpperCase() +
               ']->(newNode)';
      params._roleNodeType = '_' + self.modelName + 'Role';
    }
    else if(options.role.roleOwner === 'user'){
      query += ', (user)-[:HAS_ROLE_IN_' + self.modelName.toUpperCase() +
               ']->(role:_' + self.modelName + 'Role {role: {_role}, _nodeType: {_roleNodeType}})-[:HAS_' + self.modelName.toUpperCase() +
               ']->(newNode)';
      params._roleNodeType = '_' + self.modelName + 'Role';
    }
    params._role = options.role.name;
  }

  // UPDATE COUNTERS
  if(options.counters){
    if(typeof options.counters !== 'array') options.counters = [options.counters];
    for(var i=0, len = options.counters.length; i< len; i++){
      for(var key in options.counters[i]){
        if(options.counters[i][key].node === 'user' && !options.eventNodes.user){
          return callback(new NeopreneError('You cannot update a counter for a user without setting eventNodes on that user.'));
        }
        if(options.counters[i][key].node === 'relationshipNode' && !options.relationship){
          return callback(new NeopreneError('You cannot update a counter on a non existant relationship.'));
        }
        // cannot update a counter for a not yet existant node. Set the default
        if(options.counters[i][key].node === 'node'){
        //   query += ' SET newNode.' + options.counters[i][key].field + '= newNode.' + options.counters[i][key].field + '+1';
          return callback(new NeopreneError('You cannot update a counter for a not yet existant node. Set a default value in the schema instead.'));
        }
        else if(options.counters[i][key].node === 'relationshipNode' && options.relationship){
          query += ' SET relNode.' + options.counters[i][key].field + '= relNode.' + options.counters[i][key].field + '+1';
        }
        else if(options.counters[i][key].node === 'user' && uid){
          query += ' SET user.' + options.counters[i][key].field + '= user.' + options.counters[i][key].field + '+1';
        }
      }
    }
  }

  // REMOVE
  // OLd LATEST EVENT relationships
  if(options.eventNodes.user || options.eventNodes.relationshipNode){
    query += ' DELETE ';
    if(options.eventNodes.user) query += ' userLatestRel,';
    if(options.eventNodes.relationshipNode) query += ' relNodeLatestRel,';
    // remove the last comma
    query = query.slice(0,-1);
  }

  // RETURN
  // Node and optional relationship
  if(!options.relationship) query += ' RETURN newNode';
  else query += ' RETURN newNode, rel';

  var cypherUrl = this._db + '/db/data/cypher';
  var cypherQuery = { query: query, params: params };

  // console.log(JSON.stringify(cypherQuery));

  request
    .post(cypherUrl)
    .send(cypherQuery)
    .set('Accept', 'application/json')
    .set('X-Stream', true)
    .end(function(res) {
      if (res.status === 200) {
        // update the id variable with the new id
        var nodeModel = utils.loadObject(res.body.data[0], self.base);
        nodeModel.emit(self.modelName+'Created', nodeModel);

        // need to separate between only a node returned and a rel as well
        var response;
        if(res.body.data[0][1]){
          var rel = utils.loadObject(res.body.data[0][1], self.base);
          rel._direction = options.relationship.direction;
          response = {node: nodeModel, rel: rel};
        }
        else response = nodeModel;

        return callback(null, response);
      }
      return callback(new NeopreneError(res.body.message));
    });
};

/**
 * Update a node in the database
 *
 * Options include:
 *  eventNodes: {
 *     node: true, // create an event node for the updated node, defaults to true.
 *     user: true, // create an event node for the user
 *     relationshipNode: { // create an event node for the related node
 *       id: 1003
 *       type: 'Schedule'
 *     }
 *   }
 *
 * @param  {Number}   id       Id of model
 * @param  {Object}   updates  Updates to be made to object
 * @param  {Options}  options  Updates object
 * @param  {Function} callback
 * @return {Model}            412 or model
 */
Model.update = function(node, uid, updates, options, callback){
  // load the model
  // Two databases calls or one?
  // E.g. just pass the id and fetch the node from the database or force the passing of the node
  var temp = {data: node };

  var loadedModel = utils.loadObject(temp, this.base);

  // pop the first argument as we no longer need the node
  [].shift.apply(arguments);
  // create the node in the database
  loadedModel.update.apply(loadedModel, arguments);
};

Model.prototype.update = function(uid, updates, options, callback){
  // allow optional arguments
  if(typeof uid === 'function'){
    callback = uid;
    return callback(new NeopreneError('Invalid update request. You need to provide updates.'));
  }
  else if(typeof updates === 'function'){
    callback = updates;
    updates = uid;
    uid = null;
    options = {};
  }
  else if(typeof options === 'function'){
    callback = options;
    options = {};
  }

  //validations that the arguments are correct
  if(typeof updates !== 'object'){
    return callback(new NeopreneError('Invalid update request. You need to provide updates.'));
  }
  if(options.role){
    return callback(new NeopreneError('Invalid update request. You cannot create roles on an update.'));
  }
  if(options.relationship){
    return callback(new NeopreneError('Invalid update request. You cannot create a relationship on an update.'));
  }
  if(options.counters){
    return callback(new NeopreneError('Invalid update request. You cannot modify counters on an update.'));
  }
  if((options.eventNodes && options.eventNodes.user) && !uid) {
    return callback(new NeopreneError('Invalid update request. You need to supply the user id in order to create user event nodes'));
  }
  if((options.eventNodes && options.eventNodes.relationshipNode) &&
    !(options.eventNodes.relationshipNode.id && options.eventNodes.relationshipNode.type )) {
    return callback(new NeopreneError('Invalid update request. You need to supply the node id in order to create relationship event nodes'));
  }


  // default the node events
  if(!options.eventNodes || options.eventNodes.node !== false){
    if(!options.eventNodes){
      options.eventNodes = {
        node: true
      };
    }
    else options.eventNodes.node = true;
  }
  if(options.eventNodes && ((options.eventNodes.user || options.eventNodes.relationshipNode) && !options.eventNodes.node)){
    return callback(new NeopreneError('Invalid create request. You cannot have user/relationship event nodes without node event nodes.'));
  }
  var self = this;

  // set the initial params
  var params = {
    nodeId: this._id,
    currentDate: Date.now()
  };

  // prepare teh params for the updates and create teh setQUeyr syntax
  var setQuery = '';
  var eventNodeText = '';
  for(var key in updates){
    params[key+'_OLD'] = this.key;
    params[key+'_NEW'] = updates.key;
    this.key = updates.key;

    setQuery += ' SET node.'+ key +' = {'+key+ '_NEW}';
    eventNodeText += ', ' + key + '_OLD = {'+key+'_OLD}, ' + key + '_NEW = {'+key+'_NEW}';
  }

  var query = 'START node = node({nodeId}';
  if(options.eventNodes){
    // find starting nodes
    if(options.eventNodes.user) {
      query += ', user = node({userId})';
      params.userId = parseInt(uid, 10);
    }
    if(options.eventNodes.relationshipNode) {
      query += ', relNode = node({relNodeId})';
      params.relNodeId = parseInt(options.eventNodes.options.eventNodes.relationshipNode.id, 10);
    }

    // match to latest events for each of the starting nodes
    query += ' MATCH';
    if(options.eventNodes.node) query += ' node-[nodeLatestRel:LATEST_EVENT]->(nodeLatestEvent),';
    if(options.eventNodes.user) query += ' user-[userLatestRel:LATEST_EVENT]->(userLatestEvent),';
    if(options.eventNodes.relationshipNode) query += ' relNode-[relNodeLatestRel:LATEST_EVENT]->(relNodeLatestEvent),';
    query.slice(0, -1);

    // create the new events and change the links
    query += ' CREATE';
    if(options.eventNodes.node) {
      query += ' (event:_' + self.modelName + 'Updated {date: {currentDate}, _nodeType: {nodeNodeType}' + eventNodeText + '})' +
               '<-[:LATEST_EVENT]-node<-[:EVENT_' + self.modelName.toUpperCase() + ']-(event)' +
               '-[:NEXT_' + self.modelName.toUpperCase() + ']->(nodeLatestEvent),';
      params.nodeNodeType = '_' + self.modelName + 'Updated';
    }
    if(options.eventNodes.user) {
      query += ' (event)<-[:LATEST_EVENT]-user<-[:EVENT_USER]-(event)-[:NEXT_USER]->(userLatestEvent),';
    }
    if(options.eventNodes.relationshipNode) {
      var relNodeType = options.eventNodes.relationshipNode.type;
      query += ' (event)<-[:LATEST_EVENT]-relNode<-[:EVENT_' + relNodeType.toUpperCase() + ']-(event)' +
               '-[:NEXT_' + relNodeType.toUpperCase() + ']->(nodeLatestEvent),';
    }
    query.slice(0, -1);
  }

  query += setQuery;

  if(options.eventNodes){
    query += ' DELETE';
    if(options.eventNodes.node) query += ' nodeLatestRel,';
    if(options.eventNodes.user) query += ' userLatestRel,';
    if(options.eventNodes.relationshipNode) query += ' relNodeLatestRel,';
    query.slice(0, -1);
  }

  query += ' RETURN node';

  var cypherUrl = this._db + '/db/data/cypher';
  var cypherQuery = { query: query, params: params };
  request
    .post(cypherUrl)
    .send(cypherQuery)
    .set('Accept', 'application/json')
    .set('X-Stream', true)
    .end(function(res) {
      if (res.status === 200) {
        // update the id variable with the new id
        var nodeModel = utils.loadObject(res.body.data[0], self.base);
        nodeModel.emit(self.modelName+'Updated', nodeModel);

        // need to separate between only a node returned and a rel as well
        var response;
        if(res.body.data[0][1]){
          var rel = utils.loadObject(res.body.data[0][1], self.base);
          rel._direction = options.relationship.direction;
          response = {node: nodeModel, rel: rel};
        }
        else response = nodeModel;

        return callback(null, response);
      }
      return callback(new NeopreneError(res.body.message));
    });
};

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
  }

  var self = this;
  //add a type to nodes so that they can be correctly allocated a Schema
  // if(this.objectType === 'node') this._doc._nodeType = this.modelName;
  this._doc._nodeType = this.modelName;

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
    // self._version(true, this);


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


    var cypherUrl = this._db + '/db/data/cypher';
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
          self._self = res.body.data[0][0].self;

          // load in node._id
          self._doc._id = self._id;

          self._reset();
          self.isNew = false;
          self.emit('isNew', false);
          self._inserting = true;
          // need to separate between only a node returned and a rel as well
          var response;
          if(res.body.data[0][1]){
            response = {node: self, rel: utils.loadObject(res.body.data[0][1])};
          }
          else response = self;

          return callback(null, response);
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

// change force into options
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
      var cypherUrl = this._db + '/db/data/cypher';
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
      // query = 'START n='+this.objectType+'('+conditions['_id']+')';
      query = 'START n=node('+conditions['_id']+')';
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
      if(!self.schema.paths[key]) console.log(key)
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

  var cypherUrl = this._db + '/db/data/cypher';
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
 * Run a query against the database.
 * You need to reference the ._doc of the returned nodes to access their properties.
 *
 * ###Example
 * results[0].s._doc.name
 *
 * @param  {String}   query    Cypher batch query
 * @param  {Function} callback
 * @return {Array}            Array of nodes/relationships or empty array.
 */
Model.batchQuery = function(query, callback){
  this.base.qubatchQueryery(query, callback);
};

module.exports = Model;