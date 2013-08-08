'use strict';
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
};

/**
 * Create a new neoprene model
 * @param  {String} objType    node or relationship.
 * @param  {String} name   The name of the model.
 * @param  {Schema} schema The schema object for the model.
 * @return {Model}         The model constructor
 * @api public
 */
// Neoprene.prototype.model = function( objType, name, schema ) {
//   var objTypes = ['node', 'relationship'];
//   if(objTypes.indexOf(objType) === -1 || !schema || !(schema instanceof Schema)){
//     throw new Error('Schema hasn\'t been registered for model "' + name + '".\n' +
//                     'Use neoprene.model(type, name, schema) where type ' +
//                     'is node or relationship');
//   }
//   // look up models for the collection
//   if (!this.modelSchemas[name]) {
//     this.modelSchemas[name] = schema;
//     // for (var i = 0, l = this.plugins.length; i < l; i++) {
//     //   schema.plugin(this.plugins[i][0], this.plugins[i][1]);
//     // }
//   }

//   if (!this.models[name]) {
//     var model = Model.compile(name, this.modelSchemas[name], this.url, objType, this);
//     this.models[name] = model;
//   }

//   return this.models[name];
// };
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
    // this.modelSchemas['_'+name+'Joined'] = eventSchema;
    // this.modelSchemas['_'+name+'Quit'] = eventSchema;
    // this.modelSchemas['_'+name+'Activated'] = eventSchema;
    // this.modelSchemas['_'+name+'Deactivated'] = eventSchema;
    this.modelSchemas['_'+name+'Role'] = eventSchema;
    this.modelSchemas['_'+name+'RoleChanged'] = eventSchema;

    // for (var i = 0, l = this.plugins.length; i < l; i++) {
    //   schema.plugin(this.plugins[i][0], this.plugins[i][1]);
    // }
  }

  if (!this.models[name]) {
    var model = Model.compile(name, this.modelSchemas[name], this.url, this);
    var modelEventCreated = Model.compile('_'+name+'Created', this.modelSchemas['_'+name+'Created'], this.url, this);
    var modelEventUpdated = Model.compile('_'+name+'Updated', this.modelSchemas['_'+name+'Updated'], this.url, this);
    // var modelEventJoined = Model.compile(name, this.modelSchemas['_'+name+'Joined'], this.url, this);
    // var modelEventQuit = Model.compile(name, this.modelSchemas['_'+name+'Quit'], this.url, this);
    // var modelEventActivated = Model.compile(name, this.modelSchemas['_'+name+'Activated'], this.url, this);
    // var modelEventDeactivated = Model.compile(name, this.modelSchemas['_'+name+'Deactivated'], this.url, this);
    var modelEventRole = Model.compile('_'+name+'Role', this.modelSchemas['_'+name+'Role'], this.url, this);
    var modelEventRoleChanged = Model.compile('_'+name+'RoleChanged', this.modelSchemas['_'+name+'RoleChanged'], this.url, this);

    this.models[name] = model;
    this.models['_'+name+'Created'] = modelEventCreated;
    this.models['_'+name+'Updated'] = modelEventUpdated;
    // this.models['_'+name+'Joined'] = modelEventJoined;
    // this.models['_'+name+'Quit'] = modelEventQuit;
    // this.models['_'+name+'Activated'] = modelEventActivated;
    // this.models['_'+name+'Deactivated'] = modelEventDeactivated;
    this.models['_'+name+'Role'] = modelEventRole;
    this.models['_'+name+'RoleChanged'] = modelEventRoleChanged;
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
 * Convenience function for createRelationshipTo and createRelationshipFrom.
 * @param  {Model | Id} from      The relationship origin node or id.
 * @param  {Model | Id} to        The relationship destination node or id.
 * @param  {String} type      The type of relationships e.g. friend.
 * @param  {Object} data      Key-Value properties of relationship. Optional
 * @param  {Function} callback
 * @return {Relationship}
 * @api    private
 */
Neoprene.prototype._createRelationship = function(from, to, type, data, callback) {
  if(typeof data ==='function'){
    callback = data;
    data = null;
  }

  if (typeof type === 'function') {
    process.nextTick(function() {
      callback = type;
      return callback(
        new NeopreneError('Cannot remove relationship - invalid input'), null);
    });
  } else if (typeof to ==='function'){
    process.nextTick(function() {
      callback = to;
      return callback(
        new NeopreneError('Cannot remove relationship - invalid input'), null);
    });
  } else if (typeof from ==='function'){
    process.nextTick(function() {
      callback = from;
      return callback(
        new NeopreneError('Cannot remove relationship - invalid input'), null);
    });
  }
  // else if ((typeof from !== 'object' && typeof from !== 'number') || (typeof to !== 'object' && typeof to !== 'number')){
  //   process.nextTick(function() {
  //     return callback(
  //       new NeopreneError('Cannot remove relationship - invalid input'), null);
  //   });
  // }
  else {
    var self = this;

    // can pass either an object or just an id
    var fromSelf, toSelf;
    if(typeof from === 'number' || typeof from === 'string') {
      fromSelf = self.url + '/db/data/node/' + from;
    } else fromSelf = from._self;
    if(typeof to === 'number' || typeof to === 'string') {
      toSelf = self.url + '/db/data/node/' + to;
    } else toSelf = to._self;

    var createRelationshipURL = fromSelf + '/relationships';
    var otherModelURL = toSelf;

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
          return callback(new NeopreneError(res.body.message), null);
        }

        var rel = utils.loadObject(res.body, self);
        // test if error returned
        if(rel.name === 'Neoprene' && rel.message.indexOf('Model:') !== -1 && rel.message.indexOf(' not initialised') !== -1){
          return callback(rel, null);
        }
        else return callback(null, rel);
      });
  }
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

  if(typeof direction == 'function'){
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


/**
 * Convenience function for removeRelationshipTo and removeRelationshipFrom.
 * @param  {Model | Id} from      The relationship origin node or id.
 * @param  {Model | Id} to        The relationship destination node or id.
 * @param  {String} type      The type of relationships e.g. friend.
 * @param  {Function} callback
 * @return {Relationship}
 * @api    private
 */
Neoprene.prototype._removeRelationship = function(from, to, type, callback) {
  // validate that from and to are valid nodes and type exists
  if (typeof type === 'function') {
    process.nextTick(function() {
      callback = type;
      return callback(
        new NeopreneError('Cannot remove relationship - invalid input'), null);
    });
  } else if (typeof to ==='function'){
    process.nextTick(function() {
      callback = to;
      return callback(
        new NeopreneError('Cannot remove relationship - invalid input'), null);
    });
  } else if (typeof from ==='function'){
    process.nextTick(function() {
      callback = from;
      return callback(
        new NeopreneError('Cannot remove relationship - invalid input'), null);
    });
  }
  else {
    // can either pass an object or an id
    if(typeof from ==='object') from = from._id;
    if(typeof to ==='object') to = to._id;

    var query = 'START from=node({fromId}), to=node({toId}) MATCH (from)-[rel?:' + type + ']->(to) DELETE rel';
    var params = {
      fromId: from,
      toId: to
    };
    var cypherUrl = this.url + '/db/data/cypher';
    var cypherQuery = { query: query, params: params };

    request
      .post(cypherUrl)
      .send(cypherQuery)
      .set('Accept', 'application/json')
      .set('X-Stream', true)
      .end(function(res) {
        // REST API returns 200
        if (res.status === 200) {
          return callback(null, null);
        }
        else return callback(new NeopreneError(res.body.message));
      });
  }
};