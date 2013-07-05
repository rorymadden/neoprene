# Neoprene

Neo4j Object Modelling for Node.js

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
Specifying indexes in Schemas does not work at present. Please see the issues section - pull requests welcome.

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
  // you need to supply the linked node by either id or email
  // you need to supply a type and a direction as well
  var rel = {id: savedNode.id, type: 'Friend', direction: 'to' };
  node2.save(rel, function(err, savedNode2){
    // other code
  })
})
})
```


To query / navigate around the graph you start with a single node. You can index nodes to enable quick lookup at a later time.

```js
node.index('Test', 'name', this.name, function(err){
  ...
});

var myFetchedNode;
neoprene.getIndexedNode('Test', 'name', 'test', function(err, node){
  myFetchedNode = node;
})
```

Once you have a node you can traverse the graph. You can get Relationships or Nodes. 
To get relationships you can choose incoming, outgoing or all relationships. In addition you must specify a type or array of relationship types. 
When getting nodes you can use the adjacentNodes helper or the more complete traverse function. 

```js
node.getAllRelationships('follows', function(err, rels){
  ...
})

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
