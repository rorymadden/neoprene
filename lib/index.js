/*!
 * Neoprene - Main Database Object
 * MIT Licensed
 */

var request = require('superagent')
  , async = require('async')
  , utils = require('./utils')
  , NeopreneError = require('./error')

  , Model = require('./model')
  , Schema = require('./schema');

/**
 *
 * The class representing the Neo4j graph database. Provide a url to
 * the neo4j instance e.g. `'http://localhost:7474/'`. This URL should
 * include HTTP Basic Authentication info if needed,
 * e.g. `'http://user:password@example.com:7474/`.
 *
 * @param  url {string} The root URL where the Neo4j graph database
 * @return {object}     The neoprene object.
 * @api public
 */
function Neoprene() {

  this.models = {};
  this.modelSchemas = {};
}

/**
 * Pass the url of the Neo4j instance to neoprene
 * @param  {String} url
 * @api public
 */
Neoprene.prototype.connect = function(url){
  this.url = url;

  // create default event nodes
  var eventSchema = new Schema({date: Date}, {strict: false});
  this.modelSchemas._RelationshipCreated = eventSchema;
  this.modelSchemas._RelationshipUpdated = eventSchema;
  this.modelSchemas._RelationshipRemoved = eventSchema;
  var modelEventRelationshipCreated = Model.compile('_RelationshipCreated', this.modelSchemas._RelationshipCreated, this.url, this);
  var modelEventRelationshipUpdated = Model.compile('_RelationshipUpdated', this.modelSchemas._RelationshipUpdated, this.url, this);
  var modelEventRelationshipRemoved = Model.compile('_RelationshipRemoved', this.modelSchemas._RelationshipRemoved, this.url, this);
  this.models._RelationshipCreated = modelEventRelationshipCreated;
  this.models._RelationshipUpdated = modelEventRelationshipUpdated;
  this.models._RelationshipRemoved = modelEventRelationshipRemoved;
};

/**
 * Create a new neoprene model
 * @param  {String} objType    node or relationship.
 * @param  {String} name   The name of the model.
 * @param  {Schema} schema The schema object for the model.
 * @return {Model}         The model constructor
 * @api public
 */
Neoprene.prototype.model = function( name, schema ) {
  if(!schema || !(schema instanceof Schema)){
    throw new Error('Schema hasn\'t been registered for node "' + name + '".\n' +
                    'Use neoprene.model(name, schema)');
  }
  // look up models for the collection
  if (!this.modelSchemas[name]) {
    this.modelSchemas[name] = schema;
    // add in event nodes as well
    var eventSchema = new Schema({date: Date}, {strict: false});
    this.modelSchemas['_'+name+'Created'] = eventSchema;
    this.modelSchemas['_'+name+'Updated'] = eventSchema;
    this.modelSchemas['_'+name+'Removed'] = eventSchema;
    this.modelSchemas['_'+name+'Role'] = eventSchema;
    this.modelSchemas['_'+name+'RoleCreated'] = eventSchema;
    this.modelSchemas['_'+name+'RoleUpdated'] = eventSchema;
    this.modelSchemas['_'+name+'RoleRemoved'] = eventSchema;

    // for (var i = 0, l = this.plugins.length; i < l; i++) {
    //   schema.plugin(this.plugins[i][0], this.plugins[i][1]);
    // }
  }

  if (!this.models[name]) {
    var model = Model.compile(name, this.modelSchemas[name], this.url, this);
    var modelEventCreated = Model.compile('_'+name+'Created', this.modelSchemas['_'+name+'Created'], this.url, this);
    var modelEventUpdated = Model.compile('_'+name+'Updated', this.modelSchemas['_'+name+'Updated'], this.url, this);
    var modelEventRemoved = Model.compile('_'+name+'Removed', this.modelSchemas['_'+name+'Removed'], this.url, this);
    var modelEventRole = Model.compile('_'+name+'Role', this.modelSchemas['_'+name+'Role'], this.url, this);
    var modelEventRoleCreated = Model.compile('_'+name+'RoleCreated', this.modelSchemas['_'+name+'RoleCreated'], this.url, this);
    var modelEventRoleUpdated = Model.compile('_'+name+'RoleUpdated', this.modelSchemas['_'+name+'RoleUpdated'], this.url, this);
    var modelEventRoleRemoved = Model.compile('_'+name+'RoleRemoved', this.modelSchemas['_'+name+'RoleRemoved'], this.url, this);

    this.models[name] = model;
    this.models['_'+name+'Created'] = modelEventCreated;
    this.models['_'+name+'Updated'] = modelEventUpdated;
    this.models['_'+name+'Removed'] = modelEventRemoved;
    this.models['_'+name+'Role'] = modelEventRole;
    this.models['_'+name+'RoleCreated'] = modelEventRoleCreated;
    this.models['_'+name+'RoleUpdated'] = modelEventRoleUpdated;
    this.models['_'+name+'RoleRemoved'] = modelEventRoleRemoved;
  }

  return this.models[name];
};


/**
 * Neoprene version
 *
 * @api public
 */

Neoprene.version = JSON.parse(
  require('fs').readFileSync(__dirname + '/../package.json', 'utf8')
).version;

/**
 * The Neoprene Schema constructor
 *
 * ####Example:
 *
 *     var neoprene = require('neoprene');
 *     var Schema = neoprene.Schema;
 *     var CatSchema = new Schema(..);
 *
 * @api public
 */

Neoprene.prototype.Schema = Schema;

module.exports = new Neoprene();

/**
 * Defines or retrieves a model.
 *
 *     var neoprene = require('neoprene');
 *     neoprene.connect('http://...')
 *     neoprene.model('node', 'Venue', new Schema(..));
 *     var Venue = neoprene.loadModel('Venue')
 *
 * @param {String} name The model name.
 * @return {Model}      The compiled model.
 * @api public
 */

Neoprene.prototype.loadModel = function (name) {
  if (!this.models[name]) {
    return new NeopreneError('Model not defined for '+ name +
      'Please use neoprene.model(type, name, schema) to define.');
  }
  return this.models[name];
};



/**
 * Run a cypher query against the database. Optionally passing along the
 * given query parameters (recommended to avoid Cypher injection security
 * vulnerabilities). The returned results are an array of "rows" (matches),
 * where each row is a map from key name (as given in the query) to value.
 * Any values that represent nodes, relationships or paths are returned as
 * {Node}, {Relationship} or {Path} instances.
 * Example: Fetch a user's likes.
 *
 *   var query = [
 *     'START user=node({userId})',
 *     'MATCH (user) -[:likes]-> (other)',
 *     'RETURN other'
 *   ].join('\n');
 *
 *   var params = {
 *     userId: currentUser.id
 *   };
 *
 *   neoprene.query(query, params, function (err, results) {
 *     if (err) throw err;
 *     var likes = results.map(function (result) {
 *       return result['other'];
 *     });
 *     // ...
 *   });
 *
 * @param  {String} query    Cypher query e.g. START n=node(id) Return n.
 * @param  {Object} params   Param values for items in query string.
 * @param  {Function} callback
 * @return {Array}            Nodes / Relationships / Paths or empty array.
 * @api    public
 */
Neoprene.prototype.query = function(query, params, urlExt, callback) {
  // allow optional url
  if (typeof(urlExt) === 'function') {
    callback = urlExt;
    urlExt = null;
  }
  // allow optional params
  else if (typeof(params) === 'function') {
    callback = params;
    params = {};
  }

  // validate that query exists
  if (typeof(query) === 'function') {
    callback = query;
    process.nextTick(function() {
      return callback(new NeopreneError('Need to include query'), null);
    });
  }

  else {
    var self = this;
    var batch = true;
    if(!urlExt) {
      urlExt = '/db/data/cypher';
      batch = false;
    }
    var cypherUrl = this.url + urlExt;
    var cypherQuery = { query: query, params: params };
    if(batch) {
      cypherQuery = query;
    }

    request
      .post(cypherUrl)
      .send(cypherQuery)
      .set('Accept', 'application/json')
      .set('X-Stream', true)
      .end(function(res) {
        var resStatus = res.status;
        var resData = res.body.data || [];
        var resColumns = res.body.columns || [];
        var message = res.body.message;
        if(batch){
          for(var i=0, len = res.body.length; i< len; i++){
            if(res.body[i].status !== 200) {
              resStatus = res.body[i].status;
              message = 'Operation '+i+': '+res.body[i].body.message;
            }
            resData = resData.concat(res.body[i].body.data);
            resColumns = resColumns.concat(res.body[i].body.columns);
          }
        }
        // unknown error catch
        if (resStatus !== 200) {
          return callback(new NeopreneError(message), null);
        }
        // each row returned could represent a node, relationship or path

        var processRow = function(row, callback) {
          var map = {}, value;
          for (var i = 0, j = row.length; i < j; i++) {
            value = row[i];
            // transform the value to either Node, Relationship or Path
            map[resColumns[i]] = utils.transform(value, self);
          }
          return callback(null, map);
        };
        // map results to Array of Nodes, Relationships and/or Paths
        async.map(resData, processRow, function(err, results) {
          if (err) return callback(err);
          return callback(null, results);
        });
      });
  }
};

/**
 * Run a batch cypher query
 *
 * For more information check out: http://docs.neo4j.org/chunked/stable/rest-api-batch-ops.html
 *
 * @param  {String} query    Cypher query e.g. START n=node(id) Return n.
 * @param  {Object} params   Param values for items in query string.
 * @param  {Function} callback
 * @return {Array}            Nodes / Relationships / Paths or empty array.
 * @api public
 */
Neoprene.prototype.batchQuery = function(query, callback){
  return this.query(query, {}, '/db/data/batch', callback);
};

/**
 * Find a Relationship by Id. Returns error if not found or
 * the appropriate loaded Model
 * @param  {Number}   id
 * @param  {Function} callback
 * @return {Model}
 * @api public
 */
Neoprene.prototype.findRelationshipById = function(id, callback){
  return this.findById(id, 'relationship', callback);
};

/**
 * Find a neo4j object by id
 * @param  {Number}   id
 * @param  {String}   objectType 'node' or 'relationship'.
 * @param  {Function} callback
 * @return {Model}              The loaded Model
 * @api private
 */
Neoprene.prototype.findById = function (id, objectType, callback){
  // validate that id has been included
  if (typeof(id) === 'function') {
    callback = id;
    process.NextTick(function() {
      return callback(new NeopreneError('Invalid request'), null);
    });
  }
  else {
    var self = this;
    var url = this.url + '/db/data/' + objectType + '/' + id;
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
        var item = utils.loadObject(res.body, self);
        // test if error returned
        if(item.name === 'Neoprene' && item.message.indexOf('Model:') !== -1 && item.message.indexOf(' not initialised') !== -1){
          return callback(item, null);
        }
        else return callback(null, item);
      });
  }
};



/**
 * Convenience function for creating a new role for a node
 *
 *
 * @param  {String}   modelName The name of the model receiving the role
 * @param  {Object}   role      The name of the role, the user and the node receiving the role
 * @param  {Object}   options   Can contain eventNodes. Defaults to true
 * @param  {Function} callback
 * @return {Object}             The new role is returned
 */
Neoprene.prototype._createRole = function(modelName, role, options, callback){
  if(typeof role ==='function'){
    callback = role;
    return callback(new NeopreneError('Invalid role creation request. You must supply a role.'));
  }
  if(typeof options === 'function'){
    callback = options;
    options = {};
  }

  if(!role.user || !role.other || !role.name){
    return callback(new NeopreneError('Invalid role creation request. You must supply a from node, to node and a role name.'));
  }
  if(options.eventNodes !== false) options.eventNodes = true;

  var params = {
    userId: parseInt(role.user, 10),
    otherId: parseInt(role.other, 10),
    _currentDate: Date.now(),
    role: role.name,
    roleNodeType: '_'+modelName+'Role'
  };
  var query = 'START user=node({userId}), other = node({otherId})';

  if(options.eventNodes){
    query += ' MATCH (user)-[userLatestEventRel:LATEST_EVENT]->(userLatestEvent),' +
             ' other-[otherLatestEventRel:LATEST_EVENT]->(otherLatestEvent)';
  }

  query += ' CREATE user-[:HAS_ROLE_IN_' + modelName.toUpperCase() + ']->(role:_' + modelName +
           'Role {timestamp: {_currentDate}, role: {role}, _nodeType: {roleNodeType}})-' + '[:HAS_' +
            modelName.toUpperCase() + ']->other<-[:_MEMBER_OF]-user';

  // CREATE EVENTS AND SET LATEST_EVENT
  if(options.eventNodes){
    query += ', (event:_' + modelName + 'RoleCreated {timestamp: {_currentDate}, _nodeType: {_eventNodeType}})-' +
             // '[:EVENT_ROLE]->(role)-[:LATEST_EVENT]->(event)-' +
             '[:EVENT_USER]->(user)-[:LATEST_EVENT]->(event)-[:NEXT]->(userLatestEvent), ' +
             '(event)-[:EVENT_' + modelName.toUpperCase() + ']->(other)-[:LATEST_EVENT]->(event)-[:NEXT]->(otherLatestEvent)' +
             ' DELETE userLatestEventRel, otherLatestEventRel';
    params._eventNodeType = '_' + modelName + 'RoleCreated';
  }

  query += ' RETURN role';


  this.query(query, params, function(err, results){
    if(err) return callback(err);
    else return callback(null, results[0].role);
  });
};

/**
 * Convenience function for updating a user role
 * @param  {String}   modelName The name of the model on which the role is being updated.
 * @param  {Object}   newRole   The new role detials: the role id and the new role name.
 * @param  {Object}   options   May contain eventNodes options. Defaults to true.
 * @param  {Function} callback
 * @return {Role}              The updated role is returned
 */
Neoprene.prototype._updateRole = function(modelName, newRole, options, callback){
  if(typeof newRole ==='function'){
    callback = newRole;
    return callback(new NeopreneError('Invalid role update request. You must supply a role.'));
  }
  if(typeof options === 'function'){
    callback = options;
    options = {};
  }

  if(!newRole.id || !newRole.name){
    return callback(new NeopreneError('Invalid role update request. You must supply a from node, to node and a new role name.'));
  }
  if(options.eventNodes !== false) options.eventNodes = true;

  var params = {
    roleId: parseInt(newRole.id, 10),
    _currentDate: Date.now(),
    role: newRole.name
  };
  var query = 'START role=node({roleId})' +
              ' MATCH (userLatestEvent)<-[userLatestEventRel:LATEST_EVENT]-(user)-[:HAS_ROLE_IN_' +
              modelName.toUpperCase() + ']->(role)-[:HAS_' + modelName.toUpperCase() +
              ']->(other)-[otherLatestEventRel:LATEST_EVENT]->(otherLatestEvent)';

  if(options.eventNodes){
    query += ' CREATE (event:_' + modelName + 'RoleUpdated {timestamp: {_currentDate}, _nodeType: {_eventNodeType},'+
              'role_OLD: role.role})-[:EVENT_USER]->(user)-[:LATEST_EVENT]->(event)-[:NEXT]->(userLatestEvent), ' +
             '(event)-[:EVENT_' + modelName.toUpperCase() + ']->(other)-[:LATEST_EVENT]->(event)-[:NEXT]->(otherLatestEvent)' +
             ' DELETE userLatestEventRel, otherLatestEventRel';
    params._eventNodeType = '_' + modelName + 'RoleUpdated';
  }

  query += ' SET role.role = {role}';
  query += ' RETURN role';


  this.query(query, params, function(err, results){
    if(err) return callback(err);
    else return callback(null, results[0].role);
  });
};

/**
 * Convenience function for the removal of a role
 * @param  {String}   modelName The name of the model on which the role is being updated.
 * @param  {Object}   roleid    The id of the role to be removed
 * @param  {Object}   options   May contain eventNodes options. Defaults to true.
 * @param  {Function} callback
 * @return
 */
Neoprene.prototype._removeRole = function(modelName, roleId, options, callback){
  if(typeof roleId ==='function'){
    callback = roleId;
    return callback(new NeopreneError('Invalid role creation request. You must supply a role.'));
  }
  if(typeof options === 'function'){
    callback = options;
    options = {};
  }

  if(options.eventNodes !== false) options.eventNodes = true;

  var params = {
    _currentDate: Date.now(),
    roleId: roleId
  };
  var query = 'START role=node({roleId})' +
              ' MATCH (userLatestEvent)<-[userLatestEventRel:LATEST_EVENT]-(user)-[rel1:HAS_ROLE_IN_' +
             modelName.toUpperCase() + ']->(role)-[rel2:HAS_' + modelName.toUpperCase() +
             ']->(other)-[otherLatestEventRel:LATEST_EVENT]->(otherLatestEvent),' +
             ' (user)-[rel3:_MEMBER_OF]->(other)';

  if(options.eventNodes){
    query += ' CREATE (event:_' + modelName + 'RoleRemoved {timestamp: {_currentDate}, _nodeType: {_eventNodeType},'+
              'role_OLD: role.role})-[:EVENT_USER]->(user)-[:LATEST_EVENT]->(event)-[:NEXT]->(userLatestEvent), ' +
             '(event)-[:EVENT_' + modelName.toUpperCase() + ']->(other)-[:LATEST_EVENT]->(event)-[:NEXT]->(otherLatestEvent)';
    params._eventNodeType = '_' + modelName + 'RoleRemoved';
  }
  query += ' DELETE rel1, rel2, rel3, role';
  if(options.eventNodes) query += ', userLatestEventRel, otherLatestEventRel';

  this.query(query, params, function(err){
    return callback(err);
  });
};



/**
 * Activate a model. This will set the 'status' field to 'Active' on the model.
 * If the model was previously deactivated all roles will be re-instated.
 *
 * NOTE: Cannot be used to activate users.
 *
 * @param  {String}   modelName The name of the model being activated.
 * @param  {Number}   id       The id of the node to activate
 * @param  {Number}   uid      The id of the user activating
 * @param  {Object}   options  Object with eventNodes property. Defaults to true.
 * @param  {Function} callback
 * @return {Model}            The node which has been activated
 */
Neoprene.prototype._activate = function(modelName, id, uid, options, callback){
  if(typeof modelName ==='function'){
    callback = modelName;
    return callback(new NeopreneError('Invalid activation request. Node label and id must be included.'));
  }
  if(typeof id ==='function'){
    callback = id;
    return callback(new NeopreneError('Invalid activation request. Node id must be included.'));
  }
  if(typeof uid ==='function'){
    callback = uid;
    uid = null;
    options = {};
  }
  if (typeof options === 'function') {
    callback = options;
    options= {};
  }
  // default eventNodes
  if(options.eventNodes !== false) options.eventNodes = true;
  if(options.eventNodes && !uid){
    return callback(new NeopreneError('Invalid activation request. Schedule id and User id must be included.'));
  }


  //two queries
  // first - set to active and create event node
  var params = {
    id: parseInt(id, 10),
    uid: parseInt(uid, 10),
    _currentDate: Date.now(),
    newStatus: 'Active'
  };
  var query = 'START node = node({id})';
  if(options.eventNodes) {
    query += ', user = node({uid}) MATCH (node)-[nodeLatestEventRel:LATEST_EVENT]->(nodeLatestEvent), '+
      'user-[userLatestEventRel:LATEST_EVENT]->(userLatestEvent)' +
      ' CREATE (user)<-[:EVENT_USER]-(event:_' + modelName + 'Updated {timestamp: {_currentDate}, _nodeType: {_nodeType},' +
      'status_OLD: node.status, status_NEW: {newStatus}})-[:EVENT_' + modelName.toUpperCase() +
      ']->(node)-[:LATEST_EVENT]->(event)<-[:LATEST_EVENT]-(user), '+
      '(nodeLatestEvent)<-[:NEXT]-(event)-[:NEXT]->(userLatestEvent)';

    params._nodeType = '_' + modelName + 'Updated';
  }
  query += ' SET node.status = {newStatus}';
  if(options.eventNodes) query += ' DELETE userLatestEventRel, nodeLatestEventRel';
  query += ' RETURN node';


  // second - create member and change relationship
  var params2 = {
    id: parseInt(id, 10)
  };
  var query2 = 'START node = node({id}) MATCH node<-[:HAS_' + modelName.toUpperCase() +
    ']-(role)<-[r:HAS_ROLE_IN_DEACTIVATED_' + modelName.toUpperCase() + ']-(members)' +
    ' DELETE r' +
    ' CREATE (role)<-[:HAS_ROLE_IN_' + modelName.toUpperCase() + ']-(members)-[:_MEMBER_OF]->(node)';

  var batchQuery = [{
    'method':'POST',
    'to':'/cypher',
    'body':{
      'params':params,
      'query':query
    },
    'id':1
  },{
    'method':'POST',
    'to':'/cypher',
    'body':{
      'params':params2,
      'query':query2
    },
    'id':2
  }];

  this.batchQuery(batchQuery, function(err, results){
    if(err) return callback(err);
    else return callback(null, results[0].node);
  });
};

/**
 * Deactivate a model. This will set the 'status' field to 'Inctive' on the model.
 * If there are any roles associated with the model these will be deactivated also.
 *
 * NOTE: Cannot be used to deactivate users. This is complex and should be custom to your site.
 *
 * @param  {String}   modelName The name of the model being deacitvated.
 * @param  {Number}   id       The id of the node to activate
 * @param  {Number}   uid      The id of the user activating
 * @param  {Object}   options  Object with eventNodes property. Defaults to true.
 * @param  {Function} callback
 * @return {Model}            The node which has been activated
 */
Neoprene.prototype._deactivate = function(modelName, id, uid, options, callback){
  if(typeof modelName ==='function'){
    callback = modelName;
    return callback(new NeopreneError('Invalid activation request. Node label and id must be included.'));
  }
  if(typeof id ==='function'){
    callback = id;
    return callback(new NeopreneError('Invalid activation request. Node id must be included.'));
  }
  if(typeof uid ==='function'){
    callback = uid;
    uid = null;
    options = {};
  }

  if (typeof options === 'function') {
    callback = options;
    options= {};
  }
  // default eventNodes
  if(options.eventNodes !== false) options.eventNodes = true;
  if(options.eventNodes && !uid){
    return callback(new NeopreneError('Invalid activation request. User id must be included.'));
  }

  //two queries
  // first - set to inactive and create event node
  var params = {
    id: parseInt(id, 10),
    uid: parseInt(uid, 10),
    _currentDate: Date.now(),
    newStatus: 'Inactive'
  };
  var query = 'START node = node({id})';
  if(options.eventNodes) {
    query += ', user = node({uid}) MATCH (node)-[nodeLatestEventRel:LATEST_EVENT]->(nodeLatestEvent), '+
      'user-[userLatestEventRel:LATEST_EVENT]->(userLatestEvent)' +
      ' CREATE (user)<-[:EVENT_USER]-(event:_' + modelName + 'Updated {timestamp: {_currentDate}, _nodeType: {_nodeType},' +
      'status_OLD: node.status, status_NEW: {newStatus}})-[:EVENT_' + modelName.toUpperCase() +
      ']->(node)-[:LATEST_EVENT]->(event)<-[:LATEST_EVENT]-(user), '+
      '(nodeLatestEvent)<-[:NEXT]-(event)-[:NEXT]->(userLatestEvent)';

    params._nodeType = '_' + modelName + 'Updated';
  }
  query += ' SET node.status = {newStatus}';
  if(options.eventNodes) query += ' DELETE userLatestEventRel, nodeLatestEventRel';
  query += ' RETURN node';


  // second - delete member and change relationship
  var params2 = {
    id: parseInt(id, 10)
  };
  var query2 = 'START node = node({id}) MATCH node<-[:HAS_' + modelName.toUpperCase() +
    ']-(role)<-[r:HAS_ROLE_IN_' + modelName.toUpperCase() + ']-(members)-[memRel:_MEMBER_OF]->(node)' +
    ' DELETE r, memRel' +
    ' CREATE (role)<-[:HAS_ROLE_IN_DEACTIVATED_' + modelName.toUpperCase() + ']-(members)';

  var batchQuery = [{
    'method':'POST',
    'to':'/cypher',
    'body':{
      'params':params,
      'query':query
    },
    'id':1
  },{
    'method':'POST',
    'to':'/cypher',
    'body':{
      'params':params2,
      'query':query2
    },
    'id':2
  }];

  this.batchQuery(batchQuery, function(err, results){
    if(err) return callback(err);
    else return callback(null, results[0].node);
  });
};
/**
 * Convenience function for createRelationship, createRelationshipTo and createRelationshipFrom.
 *
 * Relationship contains:
 *   from: model or id
 *   fromType: model type. Only required if id entered in from
 *   to: model or id
 *   toType: model type. Only required if id entered in from
 *   type: the type of relationship
 *   data: Optional data for the relationship
 *
 * Options include eventNodes. Defaulted to true
 *   options = { eventNodes: false}
 *
 * @param  {Object} relationship  The relationship object.
 * @param  {Object} options       Eventnodes. Defaults to true
 * @param  {Function} callback
 * @return {Relationship}
 * @api    private
 */
Neoprene.prototype._createRelationship = function(relationship, options, callback) {
  if(typeof relationship ==='function'){
    callback = relationship;
    return callback(new NeopreneError('Invalid relationship creation request. Relationship details must be included.'));
  }

  if (typeof options === 'function') {
    callback = options;
    options= {};
  }

  if(!relationship.from || !relationship.to || !relationship.type){
    return callback(new NeopreneError('Invalid relationship creation request. Relationship details must include from, to and type.'));
  }
  // default eventNodes
  if(options.eventNodes !== false) options.eventNodes = true;


  var params = {
    _currentDate: Date.now(),
    relData: relationship.data || {}
  };

  var fromType, toType;
  // can pass either an object or just an id
  if(typeof relationship.from === 'object' && relationship.from._id) {
    params.from = relationship.from._id;
    fromType = params.fromType = relationship.from._doc._nodeType;
  } else if(typeof relationship.from === 'number' || typeof relationship.from === 'string'){
    if(!relationship.fromType && options.eventNodes){
      return callback(new NeopreneError('Invalid relationship request. You must provide the "from" model name if creating a relationship with an id.'));
    }
    params.from = parseInt(relationship.from, 10);
    fromType = params.fromType = relationship.fromType;
  } else {
    return callback(new NeopreneError('Invalid relationship creation request. You must supply a node model or id as the from node.'));
  }
  if(typeof relationship.to === 'object' && relationship.to._id) {
    params.to = relationship.to._id;
    toType = params.toType = relationship.to._doc._nodeType;
  } else if(typeof relationship.to === 'number' || typeof relationship.to === 'string'){
    if(!relationship.toType && options.eventNodes){
      return callback(new NeopreneError('Invalid relationship request. You must provide the "to" model name if creating a relationship with an id.'));
    }
    params.to = parseInt(relationship.to, 10);
    toType = params.toType = relationship.toType;
  } else {
    return callback(new NeopreneError('Invalid relationship creation request. You must supply a node model or id as the to node.'));
  }

  var query = 'START from=node({from}), to=node({to})';

  if(options.eventNodes){
    query += ' MATCH (from)-[fromLatestEventRel:LATEST_EVENT]->(fromLatestEvent),'+
             '(to)-[toLatestEventRel:LATEST_EVENT]->(toLatestEvent)';
  }

  query += ' CREATE from-[rel:' + relationship.type + ' {relData}]->to';

  if(options.eventNodes){
    query +=  ', (fromLatestEvent)<-[:NEXT]-(event:_RelationshipCreated'+
              ' {timestamp: {_currentDate}, _nodeType: {_eventNodeType}, from: {from}, fromType: {fromType}, to: {to}, toType:{toType}})' +
              '<-[:LATEST_EVENT]-(from)<-[:EVENT_' + fromType.toUpperCase() + ']-(event)-[:EVENT_' +
              toType.toUpperCase() + ']->(to)-[:LATEST_EVENT]->(event)-[:NEXT]->(toLatestEvent)' +
              ' DELETE toLatestEventRel, fromLatestEventRel';
    params._eventNodeType = '_RelationshipCreated';
  }

  query += ' RETURN rel';

  this.query(query, params, function(err, results){
    if(err) return callback(err);
    else return callback(null, results[0].rel);
  });
};

/**
 * Convenience function for removeRelationship.
 *
 * Options include eventNodes. Defaulted to true
 *   options = { eventNodes: false}
 *
 * @param  {Object}   relationship     The id of the from and to nodes and the model type of from and to
 * @param  {object}   options   Object containing eventNdoes. Defaulted to true.
 * @param  {Function} callback
 * @return {Relationship}
 * @api    public
 */
Neoprene.prototype._removeRelationship = function(relationship, options, callback) {
  // validate that from and to are valid nodes and type exists
  if (typeof relationship === 'function') {
    callback = relationship;
    return callback(
      new NeopreneError('Invalid remove relationship request. You need to supply a relationship id.'));
  }
  else if (typeof options ==='function'){
    callback = options;
    options = {};
  }

  // default eventNodes
  if(options.eventNodes !== false) options.eventNodes = true;

  if(options.eventNodes && !(relationship.fromType && relationship.toType)){
    return callback(
      new NeopreneError('Invalid remove relationship request. You need to supply the model types for from and to for the event nodes.'));
  }


  var params = {
    _currentDate: Date.now(),
    relId: relationship.rel
  };

  var query = 'START rel = relationship({relId})';

  if(options.eventNodes){
    var fromType = relationship.fromType;
    var toType = relationship.toType;
    query += ' MATCH (fromLatestEvent)<-[fromLatestEventRel:LATEST_EVENT]-(from)-[rel]' +
    '->(to)-[toLatestEventRel:LATEST_EVENT]->(toLatestEvent)' +
    ' CREATE (fromLatestEvent)<-[:NEXT]-(event:_RelationshipRemoved'+
             ' {timestamp: {_currentDate}, _nodeType: {_eventNodeType}, from: ID(from), fromType: {fromType}, to: ID(to), toType:{toType}})' +
             '<-[:LATEST_EVENT]-(from)<-[:EVENT_' + fromType.toUpperCase() + ']-(event)-[:EVENT_' +
             toType.toUpperCase() + ']->(to)-[:LATEST_EVENT]->(event)-[:NEXT]->(toLatestEvent)';
    params._eventNodeType = '_RelationshipRemoved';
    params.fromType = fromType;
    params.toType = toType;
  }
  query += ' DELETE rel';
  if(options.eventNodes) query += ', fromLatestEventRel, toLatestEventRel';

  this.query(query, params, function(err){
    return callback(err);
  });
};

/**
 * Convenience function for getRelationshipTo and getRelationshipFrom
 * @param  {String} direction all, in or out.
 * @param  {String} type      The type of relationship e.g. friend. Optional. Defaults to all types.
 * @param  {String} label     The node type that you are querying for. Optional.
 * @param  {Object} conditions Field values on the relationship (e.g. active = true). Optional.
 * @param  {Object} options    Limit, orderBy, skip and Using options. Optional.
 * @param  {Function} callback
 * @return {Array}             {rels: Array of relationships, nodes: Array of nodes}.
 * @api    private
 */
Neoprene.prototype._getRelationships = function(nodeId, direction, type, label, conditions, options, callback) {
  // if(this.objectType !== 'node') return callback(new NeopreneError('Can only get relationships from nodes'));
  var self = this;

  // allow optional label and type values
  if (typeof(options) === 'function') {
    callback = options;
    options = null;
  } else if (typeof(conditions) === 'function') {
    callback = conditions;
    conditions = null;
  } else if (typeof(label) === 'function') {
    callback = label;
    label = null;
  } else if (typeof(type) === 'function') {
    callback = type;
    type = null;
  }

  if(typeof direction === 'function'){
    return callback(new NeopreneError('Need to specify a direction'));
  }

  // Assume no types
  var types = '';

  // set up the relationship types query
  if (type instanceof Array) {
    var len = type.length;
    for(var i = 0; i < len; i++){
      types += ':' + type[i] + '| ';
    }
    // clear the last |
    types = types.substr(0, types.length-2);
  }
  else if(type){
    types = ':' + type;
  }

  var url = self.url + '/db/data/cypher';
  var query = 'START n=node(' + parseInt(nodeId, 10) + ') MATCH (n)';
  if(direction === 'out' || direction === 'all') query += '-';
  if(direction === 'in') query += '<-';

  if(types) query += '[r' + types + ']';
  else query += '[r]';

  if(direction === 'in' || direction === 'all') query += '-';
  if(direction === 'out') query += '->';
  if(label) query += '(o:' + label +')';
  else query += '(o)';

  // add in conditions
  // e.g. WHERE rel.active = true
  var params = {};
  if(conditions){
    // loop through all conditions and add a WHERE clause
    var firstWhere = true;
    for(var key in conditions){
      if(firstWhere) {
        query += ' WHERE r.' + key + ' = {' + key + '}';
        firstWhere = false;
      }
      else query += ' AND r.' + key + ' = {' + key + '}';
      params[key] = conditions[key];
    }
  }
  query += ' RETURN r, o';

  //if there are options add in the options
  if(options){
    for(var option in options){
      // many options can be array of values orderBy, using
      switch(option) {
      case 'limit':
        // expected format options = { limit: 1 }
        query += ' LIMIT ' + options[option];
        break;
      case 'orderBy':
        //expected format options = {orderBy: [{ field: 'name', nulls: true}, {field: 'gender', desc: true}] }
        // nulls and desc are optional
        for(var k=0, lenO = options[option].length; k < lenO; k++){
          if(options[option][k].field){
            query += ' ORDER BY r.' + options[option][k].field;
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
        query += ' SKIP ' + options[option];
        break;
      case 'using':
        //expected format options = {using: ['name', 'gender'] }
        if(typeof options[option] === 'array'){
          for(var l=0, lenO = options[option].length; l<lenO; l++){
            query += ' USING INDEX r:'+ this.modelName + '(' + options[option][l] + ')';
          }
        }
        else query += ' USING INDEX r:'+ this.modelName + '(' + options[option] + ')';
        break;
      }
    }
  }

  var cypherQuery = {query: query, params: params};

  request
    .post(url)
    .send(cypherQuery)
    .set('Accept', 'application/json')
    .set('X-Stream', true)
    .end(function(res) {
      // REST API returns 200
      if (res.status === 200) {
        var rels = [], nodes = [];
        var data = res.body.data;
        var len = res.body.data.length;
        for(var i= 0; i < len; i++){
          var direction;
          // load the relationship
          var rel = utils.loadObject(data[i][0], self);

          //get direction from relationship start id
          if(utils.getId(data[i][0].start) === parseInt(nodeId, 10)) direction = 'out';
          else direction = 'in';

          // add the direction to the relationship
          rel._direction = direction;
          // push the relationship to the rels array
          rels.push(rel);

          // load the node
          var node = utils.loadObject(data[i][1], self);
          // test if error returned
          if(node.name === 'Neoprene' && node.message.indexOf('Model:') !== -1 && node.message.indexOf(' not initialised') !== -1){
            return callback(node, null);
          }
          else nodes.push(node);
        }
        return callback(null, { rels: rels, nodes: nodes });
      }
      return callback(new NeopreneError(res.body.message));
    });
};

// TOD: Completely re-write. Need to be able to add conditions for which events to return
// Need to return the linked node with events.
Neoprene.prototype._getEvents = function(id, options, callback){
  if(typeof id ==='function'){
    callback = id;
    return callback(new NeopreneError('Invalid get events request. You need to provide the id of the node.'));
  }
  if (typeof options === 'function') {
    callback = options;
    options= {};
  }

  var offset = options.offset || 0;
  var numRecords = options.numRecords || 100;
  // decrement 1 due to counting starting at 0
  numRecords = offset+ numRecords -1;

  var params = {
    id: id
  };
  var query = 'START n=node({id}) MATCH n-[:LATEST_EVENT]->(event)-[:NEXT*'+offset + '..'+ numRecords + ']' +
    '->(events)-[]->(n)' +
    ' RETURN DISTINCT events';

  this.query(query, params, function(err, results){
    if(err) return callback(err);
    else return callback(null, results);
  });
};