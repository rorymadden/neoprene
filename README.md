# Neoprene

Neo4j Object Modelling for Node.js

NOTE: This only works with Neo4j 2.0. If you are using Neo4j < 2.0 then use neoprene 0.1.x. Versions pre 1.0 of neoprene are no longer supported as the changes are too large between the versions of Neo4j.

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

Firstly Node has two types of objects: Nodes and Relationships. Neoprene only supports models for nodes. Also instead of a single save method neoprene has separate create and update methods.

***Note***
Specifying unique indexes in Schemas only works with > Neo4j 2.0 M04, still some bugs remain. Hopefully fixed by full 2.0 release
There is also an issue with indexing boolean values. Don't try it. Recommendation is to store the values as strings.


*** Mandatory Model ***
In this release, due to time constraints there is a mandatory need for a 'User' model. Hopefully this will be removed in the future. Pull requests are welcome.

```js
var TestNodeSchema = new Schema({
  name: { type:String, index:true, required: true, lowercase: true, trim: true }
})
var TestNode = neoprene.model('TestNode', TestNodeSchema)

var node = new TestNode({name: 'Test'})
node.create(function(err, node){
    //node.name will be set to test due to the lowercase option
  ....
});

var node2 = new TestNode({name: 'test2'})
node2.create(function(err, node){
  ....
});
```

Instead of creating joins between tables you need to create relationships. You often want to create a relationship when you are creating a node. It wouldn't be good to make you hit the database twice. When saving a node for the first time you can add in a relationship as well.

```js
var options = {
  relationship: {
    nodeLabel: 'TestNode',
    indexField: '_id',
    indexValue: 1,
    direction: 'to',
    type: 'Friend'
  }
}

node.create(userId, options, function(err, results){
  results.rel // the created relationship
  results.node // the created node
});
```
Neoprene creates event nodes by default. If you create a User, there is a UserCreated node. If you update the user there is a UserUpdated node. If you create a 'Project' node there is a ProjectCreated node, which will be linked to the user and the project. This is why you need to provide the userId to the create function. The userId is not required only when creting a 'User' node.

These nodes can be used to show a log of changes over time or an activity stream. There is a getEvents method but be warned that this is likely to change in the future. If you want to turn off eventNodes you can set them in the options parameter whenever you create or update a node.

```js
var options: {
  eventNodes: {
    node: false,
    user: false
  }
}

node.create(userId, options, function(err, results){
  ...
})
```
Event nodes by default only attach to the user and the created event. But you may want them to be attached to a related node in the case of a parent-child like relationship. In this case you can specify that you want the 'ProjectItemCreated' event to be linked to the related node as well.

```js
var options = {
  relationship: {
    nodeLabel: 'Project',
    indexField: '_id',
    indexValue: 1,
    direction: 'from',
    type: 'CONTAINS'
  },
  eventNodes: {
    relationshipNode: true
  }
}

var projectItem = new ProjectItem({data: 'this'});

projectItem.create(userId, options, function(err, results){
  results.rel // the created relationship
  results.node // the created node
});
```

Other useful options include roles and counters. Counters will be incremented when a node is created. At present you can only set the roleOwner to 'user'. But this may change in the future.

```js
var options = {
  counters: [{
    node: 'user' // other options include node or relationshipnode
    field: 'count'
  }],
  role: {
    roleOwner: 'user'
    name: 'Admin'
  }
}

node.create(userId, options, function(err, results){
  ...
})
```

You can also just create a relationship between nodes if you want to (e.g. Follow another user)

```js
var relationship = {
  node: otherNode or id of otherNode
  nodeType: 'User' // only need to specify a type if you are passing an id to node
  type: 'FRIEND',
  data: {
    timestamp: Date.now()
  }
}
var options = {
  eventNodes: false
}

node.createRelationshipTo(relationship, options, function(err, rel){
  ...
});

node.createRelationshipFrom(relationship, options, function(err, rel){
  ...
});


// or to later remove the relationship
node.removeRelationship(relId, options, function(err, rel){
  ...
});
```

To update a node you use the update method. There is also the convenience findByIdAndUpdate function, but this results in two database calls: the first to fetch the node and the second to update it. All validations set in the schema run against the updates.

```js
var udpates = {
  first: 'New First',
  last: 'New Last'
}

node.update(updates, userId, options, function(err, node){

});

ProjectItem.findByIdAndUpdate(pid, updates, userId, options, function(err, node){

})
```
Options on the update include adding eventNodes to a related node (e.g. the Project node in the ProjectItem example) or turning off eventNodes

```js
var options = {
  eventNodes: {
    relationshipNode: {
      id: relatedNodeId
      type: 'Project'
    }
  }
}

node.update(updates, userId, options, function(err, node){

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
4. findOneAndRemove(conditions, options, callback) // be careful, this may leave orphan nodes. Better to write your own remove function
5. findById(id, fields, options, callback)
6. findByIdAndUpdate(id, update, options, callback)
7. findByIdAndRemove(id, options, callback) // be careful, this may leave orphan nodes. Better to write your own remove function


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
