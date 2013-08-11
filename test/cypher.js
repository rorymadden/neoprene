// we'll be creating a somewhat complex graph and testing that cypher queries
// on it return expected results.
var libpath = process.env['LIB_COV'] ? '../lib-cov' : '../lib';

var expect = require('expect.js')
  , async = require('async')
  , neoprene = require(libpath)
  , Schema = require(libpath + '/schema');

neoprene.connect('http://localhost:7475');

var query
  , CypherNodeSchema
  , CypherRelSchema
  , CypherUser
  , CypherFollows
  , users = []
  , user0
  , user1
  , user2
  , user3
  , user4
  , user5
  , user6
  , user7
  , user8
  , user9;

function createRelationships(user, callback) {
  var node = user;
  var i = users.indexOf(user);
  var i1 = (i + 1) % users.length;
  var i2 = (i + 2) % users.length;
  var i3 = (i + 3) % users.length;

  // ISSUE here. For some reason they are failing.
  node.createRelationshipTo({ node: users[i1], type: 'cypherfollows'}, {eventNodes:false}, function(err, rel) {
    process.nextTick(function(){
      node.createRelationshipTo({ node: users[i2], type: 'cypherfollows'}, {eventNodes:false}, function(err, rel) {
        process.nextTick(function(){
          node.createRelationshipTo({ node: users[i3], type: 'cypherfollows'}, {eventNodes:false}, function(err, rel) {
            callback();
          });
        });
      });
    });
  });
}

function createCypherUsers(callback) {
  var count = 0;
  async.whilst(
    function () { return count < 10; },
    function (cb) {
      // var user = new CypherUser({ name: 'user' + count++});
      // user.save(function(err, node){
      //   users.push(node);
      //   cb();
      // });
      var options = {
        eventNodes: {
          user:false
        }
      };
      CypherUser.create({ name: 'user' + count++}, options, function(err, user){
        if(err) callback(err);
        else {
          users.push(user);
          cb();
        }
      });
    },
    function (err) {
      // convenience aliases
      user0 = users[0];
      user1 = users[1];
      user2 = users[2];
      user3 = users[3];
      user4 = users[4];
      user5 = users[5];
      user6 = users[6];
      user7 = users[7];
      user8 = users[8];
      user9 = users[9];
      callback();
    });
}



describe('cypher queries', function() {
  before(function(done){
    CypherNodeSchema = new Schema({name: String});
    CypherUser = neoprene.model('CypherUser', CypherNodeSchema);
    createCypherUsers(done);
  });
  it('should fail with no query', function(done) {
    // query = 'START n=node(' + user0._id + ') RETURN n';
    neoprene.query(function(err, results) {
      expect(err).to.not.be(null);
      expect(results).to.be(null);
      done();
    });
  });
  it('should return no results with query', function(done) {
    query = 'START n=node(' + user0._id + ') MATCH n-[:bad]->r RETURN n';
    neoprene.query(query, function(err, results) {
      expect(err).to.be(null);
      expect(results).to.be.a('array');
      expect(results.length).to.be(0);
      done();
    });
  });
  it('should query single user', function(done) {
    query = 'START n=node(' + user0._id + ') RETURN n';
    neoprene.query(query, function(err, results) {
      expect(err).to.be(null);
      expect(results).to.be.an('array');
      expect(results).to.have.length(1);

      expect(results[0]).to.be.an('object');
      expect(results[0]['n']).to.be.an('object');
      expect(results[0]['n']._id).to.equal(user0._id);
      expect(results[0]['n'].data).to.eql(user0.data);
      done();
    });
  });
  it('should query multiple users', function(done) {
    query = 'START n=node(' + user0._id + ',' + user1._id + ',' + user2._id + ')' +
            ' RETURN n' +
            ' ORDER BY n.name';
    neoprene.query(query, function(err, results) {
      expect(err).to.be(null);
      expect(results).to.be.an('array');
      expect(results).to.have.length(3);

      expect(results[1]).to.be.an('object');
      expect(results[1]['n']).to.be.an('object');
      expect(results[1]['n'].data).to.eql(user1.data);
      done();
    });
  });
  it("should allow batch queries", function(done){
    query = [{
      'method':'POST',
      'to':'/cypher',
      'body':{
        'params':{'user0Id': user0._id, 'user1Id': user1._id},
        'query':'START u0 = node({user0Id}), u1 = node({user1Id})' +
                ' CREATE (u0)<-[r:cypherfollows]-(u1)' +
                ' RETURN r'
      },
      'id':1
    },{
      'method':'POST',
      'to':'/cypher',
      'body':{
        'params':{'user0Id': user0._id, 'user1Id': user1._id, 'relationshipType': 'relationship2'},
        'query':'START u0 = node({user0Id}), u1 = node({user1Id})' +
                ' CREATE (u0)<-[r2:cypherfollows {relationshipType: {relationshipType}}]-(u1)' +
                ' RETURN r2'
      },
      'id':2
    }];

    neoprene.batchQuery(query, function(err, results) {
      expect(err).to.be(null);
      expect(results).to.be.an('array');
      expect(results).to.have.length(2);

      expect(results[0]).to.be.an('object');
      expect(results[0]['r']).to.be.an('object');
      expect(results[1]).to.be.an('object');
      expect(results[1]['r']).to.be.an('object');
      expect(results[1]['r'].data.relationshipType).to.eql('relationship2');
      done();
    });
  });
  it("should fail batch query without a query", function(done){
    neoprene.batchQuery(function(err, results) {
      expect(err).to.not.be(null);
      expect(results).to.be(null);
      done();
    });
  });
  describe(':relationships', function() {
    before(function(done) {
      async.forEach(users, createRelationships, done);
    });
    it('should query relationships', function(done) {
      query = 'START n=node(' + user6._id + ')' +
            ' MATCH (n) -[r:cypherfollows]-> (m)' +
            ' RETURN r, m.name' +
            ' ORDER BY m.name';
      neoprene.query(query, function(err, results) {
        expect(err).to.be(null);
        expect(results).to.be.an('array');
        expect(results).to.have.length(3);

        expect(results[1]).to.be.an('object');
        expect(results[1]['r']).to.be.an('object');
        expect(results[1]['r']._type).to.be('cypherfollows');
        expect(results[1]['m.name']).to.equal(user8.name);
        done();
      });
    });
    it('send query params instead of literals', function(done) {
      query = 'START n=node({userId})' +
            ' MATCH (n) -[r:cypherfollows]-> (m)' +
            ' RETURN r, m.name' +
            ' ORDER BY m.name';
      neoprene.query(query, {userId: user3._id}, function(err, results) {
        expect(err).to.be(null);
        expect(results).to.be.an('array');
        expect(results).to.have.length(3);

        expect(results[1]).to.be.an('object');
        expect(results[1]['r']).to.be.an('object');
        expect(results[1]['r']._type).to.be('cypherfollows');
        expect(results[1]['m.name']).to.equal(user5.name);
        done();
      });
    });
    it('should return collection/array of nodes', function(done) {
      query = 'START n=node(' + user0._id + ',' + user1._id + ',' + user2._id +
              ') RETURN collect(n)';
      neoprene.query(query, function(err, results) {
        expect(err).to.be(null);
        expect(results).to.be.an('array');
        expect(results).to.have.length(1);

        expect(results[0]).to.be.an('object');
        expect(results[0]['collect(n)']).to.be.an('array');
        expect(results[0]['collect(n)']).to.have.length(3);
        expect(results[0]['collect(n)'][1]).to.be.an('object');
        expect(results[0]['collect(n)'][1]._id).to.equal(user1._id);
        expect(results[0]['collect(n)'][1].data).to.eql(user1.data);
        done();
      });
    });
    it('should return paths', function(done) {
      query = 'START from=node({fromId}), to=node({toId})' +
            ' MATCH path=shortestPath(from -[:cypherfollows*..3]-> to)' +
            ' RETURN path';
      neoprene.query(query, {fromId: user0._id, toId: user6._id},
        function(err, results) {
        expect(err).to.be(null);
        // TODO Node and Rel instances in returned Path objects aren't
        // necessarily "filled", so we don't assert equality for those
        // instances' data. it'd be great if future versions of this library
        // fixed that, but is it possible?

        expect(results).to.be.an('array');
        expect(results).to.have.length(1);

        expect(results[0]).to.be.an('object');
        expect(results[0]['path']).to.be.an('object');

        expect(results[0]['path'].start).to.equal(user0._id);

        expect(results[0]['path'].end).to.equal(user6._id);

        expect(results[0]['path'].nodes).to.be.an('array');
        expect(results[0]['path'].nodes).to.have.length(3);
        expect(results[0]['path'].nodes[1]).to.equal(user3._id);

        expect(results[0]['path'].relationships).to.be.an('array');
        expect(results[0]['path'].relationships).to.have.length(2);
        expect(results[0]['path'].relationships[1]).to.be.an('number');
        done();
      });
    });
  });
});
