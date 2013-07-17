/*!
 * Neoprene - Main Database Object
 * MIT Licensed
 */

var request = require('superagent')
  , async = require('async')
  , nodeUrl = require('url')
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
  // parse url to extract auth information
  // var uri = nodeUrl.parse(this.url)
  //   , host = uri.hostname
  //   , port = uri.port || 7474;

  // if (!host) {
  //   return new Error('Missing connection hostname.');
  // }

  // //// handle authentication
  // if (uri && uri.auth) {
  //   var auth = uri.auth.split(':');
  //   this.user = auth[0];
  //   this.pass = auth[1];

  // // Check hostname for user/pass
  // } else if (/@/.test(host) && /:/.test(host.split('@')[0])) {
  //   host = host.split('@');
  //   var auth = host.shift().split(':');
  //   host = host.pop();
  //   this.user = auth[0];
  //   this.pass = auth[1];

  // } else {
  //   this.user = this.pass = undefined;
  // }

  // this.host = host;
  // this.port = port;

  // return this;
}

/**
 * Create a new neoprene model
 * @param  {String} obj    node or relationship.
 * @param  {String} name   The name of the model.
 * @param  {Schema} schema The schema object for the model.
 * @return {Model}         The model constructor
 * @api public
 */
Neoprene.prototype.model = function( obj, name, schema ) {
  var objTypes = ['node', 'relationship'];
  if(objTypes.indexOf(obj) === -1 || !schema || !(schema instanceof Schema)){
    throw new Error('Schema hasn\'t been registered for model "' + name + '".\n'
                    + 'Use neoprene.model(type, name, schema) where type '+
                    'is node or relationship');
  }
  // look up models for the collection
  if (!this.modelSchemas[name]) {
    this.modelSchemas[name] = schema;
    // for (var i = 0, l = this.plugins.length; i < l; i++) {
    //   schema.plugin(this.plugins[i][0], this.plugins[i][1]);
    // }
  }

  if (!this.models[name]) {
    var model = Model.compile(name, this.modelSchemas[name], this.url, obj, this);
    this.models[name] = model;
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

module.exports = new Neoprene;

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
      'Please use neoprene.model(type, name, schema) to define.')
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
Neoprene.prototype.query = function(query, params, callback) {
  // allow optional params
  if (typeof(params) === 'function') {
    callback = params;
    params = {};
  }
  // validate that query exists
  if (typeof(query) === 'function') {
    callback = query;
    query = null;
  }
  if (!query) {
    process.nextTick(function() {
      return callback(new NeopreneError('Need to include query'), null);
    });
  }
  else {
    var self = this;
    var cypherUrl = this.url + '/db/data/cypher';
    var cypherQuery = { query: query, params: params };

    request
      .post(cypherUrl)
      .send(cypherQuery)
      .set('Accept', 'application/json')
      .set('X-Stream', true)
      .end(function(res) {
        // unknown error catch
        if (res.status !== 200) {
          return callback(new NeopreneError(res.body.message), null);
        }
        // each row returned could represent a node, relationship or path
        var body = res.body;
        var columns = body.columns;
        var results;

        var processRow = function(row, callback) {
          var map = {}, value;
          for (var i = 0, j = row.length; i < j; i++) {
            var _i = i;
            value = row[i];
            // transform the value to either Node, Relationship or Path
            map[columns[i]] = utils.transform(value, self);
          }
          return callback(null, map);
        };
        // map results to Array of Nodes, Relationships and/or Paths
        async.map(body.data, processRow, function(err, results) {
          if (err) return callback(err);
          return callback(null, results);
        });
      });
  }
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
}

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
    } else fromSelf = from.self;
    if(typeof to === 'number' || typeof to === 'string') {
      toSelf = self.url + '/db/data/node/' + to;
    } else toSelf = to.self;

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
    var self = this;
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