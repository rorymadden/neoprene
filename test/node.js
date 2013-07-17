var libpath = process.env['LIB_COV'] ? '../lib-cov' : '../lib';

var neoprene = require(libpath)
  , Schema = require(libpath + '/schema')
  , SchemaTypes = Schema.Types
  , expect = require('expect.js')
  , assert = require('assert')
  , async = require('async')
  , request = require('superagent');

neoprene.connect('http://localhost:7475')

var GENDER = ['unknown', 'male', 'female'];
var emailRegEx = /^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/;
var userSchema = {
  first: {type: String, required: true, trim:true, index:true },
  last: "string",
  alias: [String],
  email: {type: "string", required: true, trim:true, lowercase:true, index: { unique: true}, match: emailRegEx},
  password: {type: String, trim:true, required: true},
  gender: {type: String, trim:true, lowercase:true, default:'unknown', enum: GENDER},
  active: {type: Boolean, default: false},
  birthday: {type: Date, default: function(){
    return new Date();
  }},
  number: {type: Number, min: 1, max: 100},
  mixed: {}
};

var userData = [{
    first: 'John',
    last: 'Doe',
    alias: ['Johnny', 'Jon'],
    email: 'mail@test.com',
    password: 'password',
    gender: 'male',
    birthday: new Date(1980, 05, 16),
    number: 42,
    mixed: 'string'
  },{
    first: 'Jane',
    last: 'Briggs',
    alias: ['J', 'Briggsy'],
    email: 'jane@test.com',
    password: 'monkey',
    gender: 'female',
    active: true,
    birthday: new Date(1975, 09, 6),
    number: 2,
    mixed: new Date()
  }, {
    first: 'Susan',
    last: 'Doyle',
    alias: 'Susie',
    email: 'susan@test.com',
    password: 'bluebird',
    gender: 'female',
    birthday: new Date(1955, 9, 17),
    number: 37,
    mixed: 12
  }
];
var UserSchema
  , User
  , user1
  , user2
  , user3
  , users = []
  , rels = [];

describe('model create', function(){
  before(function(done){
    UserSchema = new Schema(userSchema);
    UserSchema.virtual('name').get(function(){
      return this.first + " " + this.last;
    });
    var query = 'start n=node(*) match n-[r?]->() where id(n) <> 0 delete r,n';
    var params = {};

    neoprene.query(query, params, function(err, results) {
      done();
    });
  })
  it('should create relationships', function(done){
    // Setup relationship types
    var RelSchema = new Schema({
      created: 'string',
      tip: 'string'
    });
    var Likes = neoprene.model('relationship', 'likes', RelSchema);
    var Dislikes = neoprene.model('relationship', 'dislikes', RelSchema);
    var Loves = neoprene.model('relationship', 'loves', RelSchema);
    var Follows = neoprene.model('relationship', 'follows', RelSchema);
    done();
  });
  it('works without "new" keyword', function(){
    User = neoprene.model('node', 'User', UserSchema);
    var user = User();
    expect(user instanceof User).to.be.ok();
    expect(User.schema instanceof Schema).to.be.ok();
    expect(User.prototype.schema instanceof Schema).to.be.ok();

    expect(neoprene.models['User'].modelName).to.be.equal('User');
    expect(user.constructor.modelName).to.be.equal('User');

    expect(user.get('first')).to.be.eql(undefined);
    expect(user.get('last')).to.be.eql(undefined);
    expect(user.get('email')).to.be.eql(undefined);
    expect(user.get('password')).to.be.eql(undefined);
    expect(user.get('gender')).to.not.be.eql(undefined);
    expect(user.get('number')).to.be.eql(undefined);
    expect(user.get('mixed')).to.be.eql(undefined);
    expect(user.get('birthday')).to.not.be.eql(undefined);
    expect(user.get('active')).to.not.be.ok();
  });
  it('works "new" keyword', function(){
    var user = new User(userData[0]);
    expect(user instanceof User).to.be.ok();
    expect(user.isNew).to.be.ok();
    expect(user.first).to.be.eql('John');
    expect(user.last).to.be.eql('Doe');
    expect(user.alias).to.be.an(Array);
    expect(user.alias[0]).to.be('Johnny');
    expect(user.email).to.be.eql('mail@test.com');
    expect(user.password).to.be.eql('password');
    expect(user.gender).to.be.eql('male');
    expect(user.number).to.be.eql(42);
    expect(user.mixed).to.be.eql('string');
    expect(user.birthday).to.be.a('number');
    expect(user.active).to.not.be.ok();
  });
  it('should create multiple nodes', function(done){
    var i = 0, len = userData.length;
    for(;i<len; i++){
      users[i] = new User(userData[i]);
    }
    user1 = users[0];
    user2 = users[1];
    user3 = users[2];
    users = [user1, user2, user3];

    expect(users).to.be.an('array');
    expect(users.length).to.be(3);
    expect(users[0]).to.be.an('object');
    expect(users[0].first).to.be(userData[0].first);
    expect(users[0].self).to.be.equal(undefined);
    expect(users[0]._id).to.not.be(null);
    expect(users[1]).to.be.an('object');
    expect(users[1].first).to.be(userData[1].first);
    expect(users[1].self).to.be.equal(undefined);
    expect(users[1]._id).to.not.be(null);
    expect(users[2]).to.be.an('object');
    expect(users[2].first).to.be(userData[2].first);
    expect(users[2].self).to.be.equal(undefined);
    expect(users[2]._id).to.not.be(null);
    done();
  });
  it('should create a node with a relationship based on node id', function(done){
    var userRel1 = new User(userData[0]);
    var userRel2 = new User({first: 'IDTest', alias: 'test', email: 'idtest@test.com', password: 'whatever'});
    userRel2.save(function(err, res){
      var relType = { nodeLabel: 'User', indexField: '_id', indexValue: res._id, type: 'Friend', direction: 'from' };
      userRel1.save(relType, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node.self).to.be.a('string');
        expect(res.rel.type).to.be('Friend');
        // need to test response direction
        done();
      });
    });
  });
  it('should create a node with a relationship based on email', function(done){
    var userRel1 = new User(userData[0]);
    var userRel2 = new User({first: 'Unique', alias: 'bug', email: 'unique@test.com', password: 'unique'});
    var relType = { nodeLabel: 'User', indexField: 'email', indexValue: 'unique@test.com', type: 'Friend', direction: 'to' };
    userRel2.save(function(err, res){
      userRel1.save(relType, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node.self).to.be.a('string');
        expect(res.rel.type).to.be('Friend');
        // need to test response direction
        done();
      });
    });
  });
  it('should save users', function(done){
    async.forEach(users, function(user, callback){
      user.save(function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.self).to.be.a('string');
        callback();
      });
    }, function(err){
      expect(err).to.be(null);
      done();
    });
  });
  it('should fail on required', function(done){
    user1.first = '';
    user1.email = '';
    user1.save(function(err){
      expect(err.message).to.be.eql('Validation failed');
      expect(err.name).to.be.eql('ValidationError');
      expect(Object.keys(err.errors).length).to.be.eql(2);
      user1.first = 'John';
      user1.email = 'mail@test.com';
      done();
    });
  });
  it('should trim values', function(done){
    user1.first = '      John      ';
    user1.save(function(err, user){
      expect(err).to.be(null);
      expect(user.first).to.be.eql('John');
      done();
    });
  });
  it('should lowercase values', function(done){
    user1.email = 'MAIL@TEST.COM';
    user1.save(function(err, user){
      expect(err).to.be(null);
      expect(user.email).to.be.eql('mail@test.com');
      done();
    });
  });
  it('should match strings', function(done){
    user1.email = 'notanemail';
    user1.save(function(err, user){
      expect(err.message).to.be.eql('Validation failed');
      expect(err.name).to.be.eql('ValidationError');
      expect(Object.keys(err.errors).length).to.be.eql(1);
      user1.email = 'mail@test.com';
      done();
    });
  });
  it('should enforce min numbers', function(done){
    user1.number = 0;
    user1.save(function(err, user){
      expect(err.message).to.be.eql('Validation failed');
      expect(err.name).to.be.eql('ValidationError');
      expect(Object.keys(err.errors).length).to.be.eql(1);
      user1.number = 42;
      done();
    });
  });
  it('should enforce max numbers', function(done){
    user1.number = 257;
    user1.save(function(err, user){
      expect(err.message).to.be.eql('Validation failed');
      expect(err.name).to.be.eql('ValidationError');
      expect(Object.keys(err.errors).length).to.be.eql(1);
      user1.number = 42;
      done();
    });
  });
  it('should validate enums values', function(done){
    user1.gender = 'blue';
    user1.save(function(err, user){
      expect(err.message).to.be.eql('Validation failed');
      expect(err.name).to.be.eql('ValidationError');
      expect(Object.keys(err.errors).length).to.be.eql(1);
      user1.gender = 'male';
      done();
    });
  });
  it('should apply others before validating enums', function(done){
    user1.gender = 'MALE';
    user1.save(function(err, user){
      expect(err).to.be(null);
      expect(user.gender).to.be.eql('male');
      done();
    });
  });
  it('should get virtuals', function(done){
    expect(user1.name).to.be.equal("John Doe");
    done();
  });
  it('should add a relationship', function(done){
    user1.createRelationshipFrom(user2, 'likes', { created: new Date() , tip: 'likes'},
      function(err, rel){
      rels.push(rel);
      expect(err).to.be(null);
      expect(rel).to.be.an('object');
      expect(rel._id).to.be.a('number');
      expect(rel.self).to.be.a('string');
      expect(rel.start).to.be(user2._id);
      expect(rel.end).to.be(user1._id);
      expect(rel.type).to.be('likes');
      expect(rel.created).to.be.a('string');
      done();
    });
  });
  it('should not add a relationship with bad input', function(done){
    user1.createRelationshipFrom('user2', 'likes', { created: new Date() },
      function(err, rel){
      expect(err).to.not.be(null);
      expect(rel).to.be(null);
      done();
    });
  });
  it('should allow multiple relationships', function(done){
    var types = ['dislikes', 'follows', 'loves', 'likes'];
    async.map(types, function(type, callback){
      user1.createRelationshipTo(user3, type, { tip: type }, callback);
    }, function(err, results){
      expect(err).to.be(null);
      expect(results).to.be.an('array');
      expect(results.length).to.be(4);
      rels.push(results[0]);
      expect(results[0]).to.be.an('object');
      expect(results[0]._id).to.be.a('number');
      expect(results[0].self).to.be.a('string');
      expect(results[0].start).to.be(user1._id);
      expect(results[0].end).to.be(user3._id);
      expect(types).to.contain(results[0].tip);
      expect(types).to.contain(results[0].type);
      rels.push(results[1]);
      expect(results[1]).to.be.an('object');
      expect(results[1]._id).to.be.a('number');
      expect(results[1].self).to.be.a('string');
      expect(results[1].start).to.be(user1._id);
      expect(results[1].end).to.be(user3._id);
      rels.push(results[2]);
      expect(types).to.contain(results[1].tip);
      expect(types).to.contain(results[1].type);
      expect(results[2]).to.be.an('object');
      expect(results[2]._id).to.be.a('number');
      expect(results[2].self).to.be.a('string');
      expect(results[2].start).to.be(user1._id);
      expect(results[2].end).to.be(user3._id);
      expect(types).to.contain(results[2].tip);
      expect(types).to.contain(results[2].type);
      done();
    });
  });
  it('should remove a relationship from', function(done){
    user1.createRelationshipFrom(user2._id, 'loves', { created: new Date() , tip: 'likes'}, function(err, rel){
      expect(err).to.be(null);
      user1.removeRelationshipFrom(user2, 'loves', function(err){
        expect(err).to.be(null);
        done();
      });
    });
  });
  it('should remove a relationship to', function(done){
    user1.createRelationshipTo(user2._id, 'dislikes', { created: new Date() , tip: 'likes'}, function(err, rel){
      expect(err).to.be(null);
      user1.removeRelationshipTo(user2, 'dislikes', function(err){
        expect(err).to.be(null);
        done();
      });
    });
  });
});
describe('model read', function(){
  it('should get a node by id', function(done){
    User.findById(user1._id, function(err, node){
      expect(err).to.be(null);
      expect(node._id).to.be.eql(user1._id);
      expect(new Date(node.birthday)).to.be.eql(userData[0].birthday);
      expect(node.self).to.be.eql(user1.self);
      done();
    });
  });
  it('should not get a node with bad id', function(done){
    User.findById('user', function(err, node){
      expect(err).to.not.be(null);
      expect(node).to.be.undefined;
      done();
    });
  });
  it("should error if relationship has not been defined", function(done){
    user1.createRelationshipTo(user2._id, 'newRel', function(err, rel){
      expect(err).to.exist;
      user1.removeRelationshipTo(user2._id, 'newRel', function(err){
        expect(err).to.not.exist;
        done();
      });
    });
  });
  it('should get all relationships for a node', function(done){
    user1.getAllRelationships(function(err, results){
      expect(err).to.be(null);
      expect(results.rels).to.be.an('array');
      expect(results.nodes).to.be.an('array');
      expect(results.rels.length).to.be(5);
      expect(results.nodes.length).to.be(5);
      expect(results.nodes[0]).to.be.an('object');
      expect(results.nodes[0]._id).to.be.a('number');
      expect(results.nodes[0].self).to.be.a('string');
      expect(results.rels[0]).to.be.an('object');
      expect(results.rels[0]._doc._id).to.be.a('number');
      expect(results.rels[0]._doc.direction).to.be.a('string');
      expect(results.rels[0]._doc.type).to.be.a('string');
      expect(results.rels[0]._doc.data).to.be.an('object');
      done();
    });
  });
  it('should get all relationships of a type', function(done){
    user1.getAllRelationships('likes', function(err, results){
      expect(err).to.be(null);
      expect(results.rels).to.be.an('array');
      expect(results.nodes).to.be.an('array');
      expect(results.rels.length).to.be(2);
      expect(results.nodes.length).to.be(2);
      expect(results.nodes[0]).to.be.an('object');
      expect(results.nodes[0]._id).to.be.a('number');
      expect(results.nodes[0].self).to.be.a('string');
      expect(results.rels[0]._doc._id).to.be.a('number');
      expect(results.rels[0]._doc.direction).to.be.a('string');
      expect(results.rels[0]._doc.type).to.be.a('string');
      expect(results.rels[0]._doc.data).to.be.an('object');
      done();
    });
  });
  it('should get not return results if no matches', function(done){
    user1.getAllRelationships('badtype', function(err, results){
      expect(err).to.be(null);
      expect(results.rels).to.be.an('array');
      expect(results.nodes).to.be.an('array');
      expect(results.rels.length).to.be(0);
      expect(results.nodes.length).to.be(0);
      done();
    });
  });
  it('should get all incoming relationships', function(done){
    user1.getIncomingRelationships(function(err, results){
      expect(err).to.be(null);
      expect(results.rels).to.be.an('array');
      expect(results.nodes).to.be.an('array');
      expect(results.rels.length).to.be(1);
      expect(results.nodes.length).to.be(1);
      expect(results.nodes[0]).to.be.an('object');
      expect(results.nodes[0]._id).to.be.a('number');
      expect(results.nodes[0].self).to.be.a('string');
      expect(results.rels[0]._doc._id).to.be.a('number');
      expect(results.rels[0]._doc.direction).to.be.a('string');
      expect(results.rels[0]._doc.type).to.be.a('string');
      expect(results.rels[0]._doc.data).to.be.an('object');
      done();
    });
  });
  it('should get all outgoing relationships - all types', function(done){
    user1.getOutgoingRelationships(function(err, results){
      expect(err).to.be(null);
      expect(results.rels).to.be.an('array');
      expect(results.nodes).to.be.an('array');
      expect(results.rels.length).to.be(4);
      expect(results.nodes.length).to.be(4);
      expect(results.nodes[0]).to.be.an('object');
      expect(results.nodes[0]._id).to.be.a('number');
      expect(results.nodes[0].self).to.be.a('string');
      expect(results.rels[0]._doc._id).to.be.a('number');
      expect(results.rels[0]._doc.direction).to.be.a('string');
      expect(results.rels[0]._doc.type).to.be.a('string');
      expect(results.rels[0]._doc.data).to.be.an('object');
      done();
    });
  });
  it('should get all outgoing relationships - one type', function(done){
    user1.getOutgoingRelationships('loves', function(err, results){
      expect(err).to.be(null);
      expect(results.rels).to.be.an('array');
      expect(results.nodes).to.be.an('array');
      expect(results.rels.length).to.be(1);
      expect(results.nodes.length).to.be(1);
      expect(results.nodes[0]).to.be.an('object');
      expect(results.nodes[0]._id).to.be.a('number');
      expect(results.nodes[0].self).to.be.a('string');
      expect(results.rels[0]._doc._id).to.be.a('number');
      expect(results.rels[0]._doc.direction).to.be.a('string');
      expect(results.rels[0]._doc.type).to.be.a('string');
      expect(results.rels[0]._doc.data).to.be.an('object');
      done();
    });
  });
  it('should get all outgoing relationships - all types using label', function(done){
    user1.getOutgoingRelationships(null, 'User', function(err, results){
      expect(err).to.be(null);
      expect(results.rels).to.be.an('array');
      expect(results.nodes).to.be.an('array');
      expect(results.rels.length).to.be(4);
      expect(results.nodes.length).to.be(4);
      expect(results.nodes[0]).to.be.an('object');
      expect(results.nodes[0]._id).to.be.a('number');
      expect(results.nodes[0].self).to.be.a('string');
      expect(results.rels[0]._doc._id).to.be.a('number');
      expect(results.rels[0]._doc.direction).to.be.a('string');
      expect(results.rels[0]._doc.type).to.be.a('string');
      expect(results.rels[0]._doc.data).to.be.an('object');
      done();
    });
  });
  it('should get all outgoing relationships - bad label', function(done){
    user1.getOutgoingRelationships(null, 'Bad', function(err, results){
      expect(err).to.be(null);
      expect(results.rels).to.be.an('array');
      expect(results.nodes).to.be.an('array');
      expect(results.rels.length).to.be(0);
      expect(results.nodes.length).to.be(0);
      done();
    });
  });
  // it('should get nodes via relationships', function(done){
  //   user1.getAdjacentNodes('follows', function(err, nodes) {
  //     expect(nodes).to.be.an('array');
  //     expect(nodes).to.have.length(1);
  //     expect(nodes[0]).to.be.an('object');
  //     expect(nodes[0].self).to.equal(user3.self);
  //     expect(nodes[0].last).to.eql(userData[2].last);
  //     done();
  //   });
  // });
  // it('should get nodes via relationships (array)', function(done){
  //   user1.getAdjacentNodes(['follows', 'likes'], function(err, nodes) {
  //     expect(nodes).to.be.an('array');
  //     expect(nodes).to.have.length(2);
  //     expect(nodes[0]).to.be.an('object');
  //     done();
  //   });
  // });
  // it('should get no nodes via bad relationships', function(done){
  //   user1.getAdjacentNodes('badrel', function(err, results) {
  //     expect(err).to.be(null);
  //     expect(results).to.be.an('array');
  //     expect(results.length).to.be(0);
  //     done();
  //   });
  // });
  // it('should get no nodes via bad relationships', function(done){
  //   user1.traverse('badrel', function(err, results) {
  //     expect(err).to.be(null);
  //     expect(results).to.be.an('array');
  //     expect(results.length).to.be(0);
  //     done();
  //   });
  // });
  it('should index node', function(done){
    user1.index('last', function(err) {
      expect(err).to.be(null);
      done();
    });
  });
  // TODO: When unique contraints are added to neo4j2
  // it('should unique index node', function(done){
  //   user2.index('name', true, function(err) {
  //     expect(err).to.be(null);
  //     done();
  //   });
  // });
  it('should index relationship', function(done){
    rels[0].index('tip', function(err) {
      expect(err).to.be(null);
      done();
    });
  });
  it('should not index node - bad input', function(done){
    user1.index(function(err) {
      expect(err).to.not.be(null);
      done();
    });
  });
  it('should not index relationship - bad input', function(done){
    rels[0].index(function(err) {
      expect(err).to.not.be(null);
      done();
    });
  });
  // it('should get indexed nodes', function(done){
  //   neoprene.getIndexedNodes('User', 'first', user1.first, function(err, node) {
  //     expect(err).to.be(null);
  //     expect(node).to.be.an('array');
  //     expect(node.length).to.be(3);
  //     expect(node[0].email).to.eql(user1.email);
  //     done();
  //   });
  // });
  // it('should get indexed node', function(done){
  //   User.getIndexedNode('User', 'first', user3.first, function(err, node) {
  //     expect(err).to.be(null);
  //     expect(node.email).to.eql(user3.email);
  //     done();
  //   });
  // });
  // it('should not get indexed nodes - bad', function(done){
  //   neoprene.getIndexedNodes('User', 'first', 'blah', function(err, node) {
  //     expect(err).to.be(null);
  //     expect(node).to.be.an('array');
  //     expect(node.length).to.be(0);
  //     done();
  //   });
  // });
  // TODO: can you query relationship indexes any more?
  // it('should get indexed relationship', function(done){
  //   neoprene.getIndexedRelationships('likes', 'tip', 'likes', function(err, rels) {
  //     expect(err).to.be(null);
  //     expect(rels).to.be.an('array');
  //     expect(rels.length).to.be(1);
  //     expect(rels[0].self).to.be.a('string');
  //     done();
  //   });
  // });
  // it('should get indexed relationship', function(done){
  //   User.getIndexedRelationship('likes', 'tip', 'likes', function(err, rels) {
  //     expect(err).to.be(null);
  //     expect(rels.self).to.be.a('string');
  //     done();
  //   });
  // });
  // it('should get a path between nodes', function(done){
  //   user2.path(user3, )
  //   done();
  // });
});
describe('model update', function(){
  it('should update a node', function(done){
    user1.first = 'Fred';
    user1.save(function(err, node){
      expect(err).to.be(null);
      expect(node).to.be.an('object');
      expect(node.first).to.be('Fred');
      expect(node.last).to.be('Doe');
      expect(node.gender).to.be('male');
      done();
    });
  });
  it('should update a relationship', function(done){
    var tip = rels[0].tip;
    rels[0].created = 'string';
    rels[0].save(function(err, rel){
      expect(err).to.be(null);
      expect(rel).to.be.an('object');
      expect(rel.tip).to.be(tip);
      expect(rel.created).to.be('string');
      done();
    });
  });
  it('should update a node', function(done){
    var updates = {
      first: 'Jack',
      last: '',
      email: 'newemail@test.com',
      blue: 'test'
    };
    user1.update(updates, function(err, node){
      expect(err).to.be(null);
      expect(node).to.be.an('object');
      expect(node.first).to.be('Jack');
      expect(node.blue).to.be('test');
      done();
    });
  });
  it('should update a relationship', function(done){
    var updates = {
      tip: 'pointy',
      created: 'stringy'
    };
    rels[0].update(updates, function(err, rel){
      expect(err).to.be(null);
      expect(rel).to.be.an('object');
      expect(rel.tip).to.be('pointy');
      expect(rel.created).to.be('stringy');
      done();
    });
  });
  it('should not update a node - no updates', function(done){
    user1.update(function(err, node){
      expect(err).to.not.be(null);
      expect(node).to.be(null);
      done();
    });
  });
  it('should not update a relationship - no updates', function(done){
    rels[0].update(function(err, rel){
      expect(err).to.not.be(null);
      expect(rel).to.be(null);
      done();
    });
  });
});

describe("model queries", function(){
  var id;
  it("should find based on conditions", function(done){
    User.find({email: "mail@test.com"}, function(err, nodes){
      expect(err).to.be(null);
      expect(nodes.length).to.be(2);
      expect(nodes[0].email).to.be("mail@test.com");
      done();
    });
  });
  // TODO: turn this into a query response
  it("should return all for the label if no conditions", function(done){
    User.find(function(err, users){
      expect(err).to.not.exist;
      expect(users.length).to.be(7);
      done();
    });
  });
  it("should return limited fields if fields are specified", function(done){
    User.find({email: "mail@test.com"}, 'first last', function(err, nodes){
      expect(err).to.be(null);
      expect(nodes.length).to.be(2);
      expect(nodes[0].email).to.be.undefined;
      expect(nodes[0].gender).to.be.undefined;
      expect(nodes[0].first).to.not.be(null);
      expect(nodes[0].last).to.not.be(null);
      expect(nodes[0]._id).to.not.be.undefined;
      expect(nodes[0].self).to.not.be.undefined;
      done();
    });
  });
  it("should return a single node with findOne", function(done){
    User.findOne({first: 'John'}, function(err, nodes){
      expect(nodes.length).to.be.undefined;
      expect(err).to.be(null);
      expect(nodes.email).to.be("mail@test.com");
      done();
    })
  });
  it("should find with limit and orderBy", function(done){
    User.find({active: false}, 'first', { orderBy: [{field: 'first', desc: true }], limit: 5}, function(err, nodes){
      expect(nodes.length).to.be(5);
      expect(err).to.be(null);
      expect(nodes[0].first).to.be('Unique');
      done();
    });
  });
  it("should ignore limit with findOne", function(done){
    User.findOne({email: 'mail@test.com'}, '', {limit:5}, function(err, nodes){
      expect(nodes).to.not.be.an.array;
      expect(err).to.be(null);
      done();
    });
  });
  it("should skip records with skip option", function(done){
    User.find({email: "mail@test.com"}, '', {skip:1}, function(err, nodes){
      expect(err).to.be(null);
      expect(nodes.length).to.be(1);
      expect(nodes[0].email).to.be("mail@test.com");
      done();
    });
  });
  it("should find and update a record", function(done){
    User.findOneAndUpdate({first: 'John'}, {first: 'John2', last: 'Surname'}, function(err, node){
      expect(err).to.be(null);
      expect(node.first).to.eql('John2');
      expect(node.last).to.eql('Surname');
      done();
    });
  });
  it("should find and remove a record - fail with relationships", function(done){
    User.findOne({email: "mail@test.com"}, function(err, node){
      id = node._id;
      User.findOneAndRemove({email:"mail@test.com"}, function(err, node){
        expect(err).to.not.be(null);
        User.findById(id, function(err, node){
          expect(node.email).to.eql('mail@test.com');
          done();
        });
      });
    });
  });
  it("should find and remove a record - force", function(done){
    User.findOneAndRemove({email:"mail@test.com"}, { remove: {force: true }}, function(err, node){
      expect(err).to.be(null);
      User.findById(id, function(err, node){
        expect(err).to.exist;
        done();
      });
    });
  });
  it("should ignore update if find used", function(done){
    User.find({first: 'Jane'}, '', {update: {first: 'Jane2', last: 'Surname'}}, function(err, node){
      expect(err).to.be(null);
      expect(node[0].first).to.eql('Jane');
      expect(node[0].last).to.eql('Briggs');
      done();
    });
  });
  it("should ignore a remove if find used", function(done){
    User.find({first: 'Jane'}, '', {remove: {force:true}}, function(err, node){
      expect(err).to.be(null);
      expect(node[0].first).to.eql('Jane');
      expect(node[0].last).to.eql('Briggs');
      done();
    });
  });

});
describe('model delete', function(){
  it('should remove a single relationship', function(done){
    user2.getAllRelationships(function(err, relationships){
      var id = relationships.rels[0]._id;
      expect(err).to.be(null);
      relationships.rels[0].del(function(err){
        neoprene.findRelationshipById(id, function(err, rel){
          expect(err).to.not.be(null);
          expect(rel).to.be(null);
          done();
        });
      });
    });
  });
  it('should remove a node with no relationships', function(done){
    var id = user2._id;
    user2.del(function(err){
      expect(err).to.be(null);
      User.findById(id, function(err, node){
        expect(err).to.not.be(null);
        expect(node).to.not.exist;
        done();
      });
    });
  });
  it('should fail to remove a node with relationships', function(done){
    var id = user1._id;
    user1.del(function(err){
      expect(err).to.not.be(null);
      User.findById(id, function(err, node){
        expect(err).to.be(null);
        expect(node).to.be.an('object');
        done();
      });
    });
  });
  it('should remove a node with multiple relationships - force', function(done){
    var id = user1._id;
    user1.del(true, function(err){
      expect(err).to.be(null);
      User.findById(id, function(err, node){
        expect(err).to.not.be(null);
        expect(node).to.not.exist;
        done();
      });
    });
  });
  it('should remove a node with multiple relationships', function(done){
    var id = user3._id;
    user3.del(true, function(err){
      expect(err).to.be(null);
      User.findById(id, function(err, node){
        expect(err).to.not.be(null);
        expect(node).to.not.exist;
        done();
      });
    });
  });
  it('should remove a node index', function(done){
    var url = 'http://localhost:7475/db/data/schema/index/User/last';
    request
      .del(url)
      .end(function(res) {
        expect(res.status).to.be.equal(204);
        done();
      });
  });
  it('should remove an automated node index', function(done){
    var url = 'http://localhost:7475/db/data/schema/index/User/first';
    request
      .del(url)
      .end(function(res) {
        expect(res.status).to.be.equal(204);
        done();
      });
  });
  it('should remove a relationship index', function(done){
    var url = 'http://localhost:7475/db/data/schema/index/likes/tip';
    request
      .del(url)
      .end(function(res) {
        expect(res.status).to.be.equal(204);
        done();
      });
  });
});