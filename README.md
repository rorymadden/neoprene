# Neoprene

Neo4j Object Modelling for Node.js
NOTE: This only works with Neo4j 2.0

Acknowledgements:
This library is based heavily on the mongoose ORM for mongodb. The neo4j REST API was based on the 'node-neo4j' library.


## Installation

    npm install neoprene


## Usage

```js
var neoprene = require('neoprene');
neoprene.connect('http://localhost:7474');
```

If you have used mongoose before there are a few things which need to be handled differently.

Firstly Node has two types of objects: Nodes and Relationships. When specifying a new model you need to identify the model type that you want.

***Note***
Specifying unique indexes in Schemas does not work until CONSTRAINTS get added to neo4j

```js
var TestNodeSchema = new Schema({
  name: { type:String }
})
var TestNode = neoprene.model('node', 'TestNode', TestNodeSchema)

var node = new TestNode({name: 'test'})
node.save(function(err, node){
  ....
});

var node2 = new TestNode({name: 'test2'})
node2.save(function(err, node){
  ....
});
```

Instead of creating joins between tables you need to create relationships. Relationships need a direction. You can create relationships To or From another node.

```js
var FollowsSchema = new Schema({
  start: { type:Date, required: true },
  end: { type:Date, required: true }
});
neoprene.model('relationship', 'follows', FollowsSchema);

var startDate = new Date(2013, 0, 16);
var endDate = new Date(2014, 0, 16);

node.createRelationshipTo(node2, 'follows', {start: startDate, end: endDate}, function(err, rel){
  ...
});
```

You often want to create a relationship when you are creating a node. It wouldn't be good to make you hit the database twice. When saving a node for the first time you can add in a relationship as well.

```js
var node1 = new TestNode({name: 'no relationship'});
var node2 = new TestNode({name: 'should link to 1'});

node1.save(function(err, savedNode){
  // you need to supply the label of the node that you are linking to, the field to search by and the value.
  // you should ensure that the field you are using has an index on it.
  // you need to supply a type and a direction as well
  var rel = {nodeLabel: 'TestNode', indexedField: '_id', indexedValue: savedNode.id, type: 'Friend', direction: 'to' };
  node2.save(rel, function(err, savedNode2){
    // other code
  })
})
```


To query / navigate around the graph you start with a single node. You can index nodes to enable quick lookup at a later time.

```js
TestNode.findOne({email="test@test.com"}, function(err, node){
  ...
});
```

If you are familiar with Mongoose the same options are available -
1. find(conditions, fields, options, callback)
2. findOne(conditions, fields, options, callback)
3. findOneAndUpdate(conditions, update, options, callback)
4. findOneAndRemove(conditions, options, callback)
5. findById(id, fields, options, callback)
6. findByIdAndUpdate(id, update, options, callback)
7. findByIdAndRemove(id, options, callback)


Conditions is an object with fields and values. This is your search criteria
Fields (optional) is a space delimited string. Only the fields listed will be returned. (NOTE: this does not save database performance at present as everything is still returned from the database).
Options (optional) is an Object with available values: limit, skip, orderBy and using. Read th documentation for more information.
Update is an Object with field and value changes to be applied.
On remove you can add a {remove: {force:true}} option to delete all linked relationships as well. See the documentation for more information

Once you have a node you can traverse the graph.
To get relationships you can choose incoming, outgoing or all relationships. In addition you must specify a type or array of relationship types.

```js
node.getAllRelationships('follows', function(err, rels){
  ...
})
```

When getting nodes you can use the adjacentNodes helper or the more complete traverse function.
```js
node.adjacentNodes('follows', 2, function(err, nodes){
  ...
})
```

The final way to query the graph is to run a Cypher query against the graph.

```js
var query = [
  'START user=node({userId})',
  'MATCH (user) -[:likes]-> (other)',
  'RETURN other'
].join('\n');

var params = {
  userId: currentUser.id
};

neoprene.query(query, params, function (err, results) {
  if (err) throw err;
  var likes = results.map(function (result) {
    return result['other'];
  });
  // ...
});
```

If you're new to Neo4j, read the [Getting Started][neo4j-getting-started] page.


[neo4j]: http://neo4j.org/
[neo4j-rest-api]: http://docs.neo4j.org/chunked/stable/rest-api.html

[neo4j-getting-started]: http://wiki.neo4j.org/content/Getting_Started_With_Neo4j_Server
