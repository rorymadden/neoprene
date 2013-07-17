# Neoprene

Neo4j Object Modelling for Node.js

NOTE: This only works with Neo4j 2.0. If you are using Neo4j < 2.0 then use neoprene 0.1.x. This version of neoprene is no longer supported as the changes are too large between the versions of Neo4j.

###Acknowledgements:
This library is based heavily on the mongoose ORM for mongodb. The neo4j REST API was based on the 'node-neo4j' library.

## Sample application
Have a look at [neoprene-template][] for a sample application that uses neoprene with neo4j 2.0.

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
  name: { type:String, index:true, required: true, lowercase: true, trim: true }
})
var TestNode = neoprene.model('node', 'TestNode', TestNodeSchema)

var node = new TestNode({name: 'Test'})
node.save(function(err, node){
    //node.name will be set to test due to the lowercase option
  ....
});

var node2 = new TestNode({name: 'test2'})
node2.save(function(err, node){
  ....
});
```

Instead of creating joins between tables you need to create relationships. Relationships need a direction. You can create relationships To or From another node.

You rarely create and save a relationship independently, you would use node.save or node.createRelationshipTo/From. These methods do not use the schema. The schema for a relationship is used when you get the relationship from the database. Therefore you need to be careful about options such as required, trim and lowercase as it will not give you your desired behaviour. However indexes will work.
```js
var FollowsSchema = new Schema({
  start: { type:Date, index: true },
  end: { type:Date }
});
neoprene.model('relationship', 'follows', FollowsSchema);

var startDate = new Date(2013, 0, 16);
var endDate = new Date(2014, 0, 16);

node.createRelationshipTo(node2, 'follows', {start: startDate, end: endDate}, function(err, rel){
  ...
});

// or to later remove the relationship
node.removeRelationshipTo(node2, 'follows', function(err, rel){
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
  });
});
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
See the docs for more information.

```js
node.getAllRelationships('follows', function(err, results){
    //results.rels is an array of rels (rel has a format (type: 'Follows', direction: 'in', data: {})
    
    //results.nodes is an array of nodes
  ...
})
```
To update a node you can either directly update it or use the update method, examples below. Also, if you want to remove a node you can use the remove function. The first argument is whether you want to force the removal. As neo4j does not allow the deletion of a node with relationships you must set force to true to delete the node and relationships.

```js
node.first = 'New';
node.save(function(err, node){});

var updates = {
    first: 'New';
    last: 'Name';
}
node.update(updates, function(err, node){});

//node.delete and node.del work as well
node.remove(function(err){})

//setting the first argument to true forces the deleteion of the node and associated relationships
node.remove(true, function(err){})
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
[neoprene-template]: https://github.com/rorymadden/neoprene-template
[neo4j-getting-started]: http://wiki.neo4j.org/content/Getting_Started_With_Neo4j_Server
