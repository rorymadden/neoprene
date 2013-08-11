'use strict';

var libpath = process.env['LIB_COV'] ? '../lib-cov' : '../lib';

var neoprene = require(libpath)
  , Schema = require(libpath + '/schema')
  , expect = require('expect.js')
  , request = require('superagent');

var testURL = 'http://localhost:7475';

var userSchema = {
  first: {type: String},
  countSchedules: Number,
  countActivities: {type: Number, default: 0}
};

var userData = [{
    first: 'John',
    countSchedules: 1
  },{
    first: 'Jane',
    countSchedules: 5
  }
];
var user1 = {}
  , user2 = {}
  , User;

describe('create relationship', function(){
  before(function(done){
    var query = 'start n=node(*) match n-[r?]->() where id(n) <> 0 delete r,n';
    var params = {};

    //wipe models and add new ones
    neoprene.models = {};
    neoprene.modelSchemas = {};
    User = neoprene.model('User', new Schema(userSchema));

    neoprene.connect(testURL);
    neoprene.query(query, params, function(err, results) {
      User.create(userData[0], function(err, user){
        expect(err).to.not.be.ok();
        user1 = user;
        expect(user.first).to.be.eql('John');
        User.create(userData[1], function(err, user){
          expect(err).to.not.be.ok();
          user2 = user;
          expect(user.first).to.be.eql('Jane');
          done();
        });
      });
    });
  });
  describe("success", function(){
    it("should allow a relationship to be created: with eventNodes", function(done){
      var relationship = {
        from: user1._id,
        fromType: 'User',
        to: user2._id,
        toType: 'User',
        type: 'FRIEND',
        data: {
          property: 'Recorded'
        }
      };
      // pass through to index._createRelationship
      User.createRelationship(relationship, function(err, relationship){
        expect(err).to.not.be.ok();
        expect(relationship._type).to.be.equal('FRIEND');
        expect(relationship.data.property).to.be.equal('Recorded');
        user2.getIncomingRelationships('FRIEND', 'User', function(err, results){
          expect(results.nodes.length).to.be(1);
          expect(results.nodes[0]._id).to.be.equal(user1._id);
          user1.getIncomingRelationships('EVENT_USER', '_RelationshipCreated', function(err, results){
            expect(results.nodes.length).to.be(1);
            // get relationships for event node
            results.nodes[0].getAllRelationships(function(err, results){
              expect(results.rels.length).to.be(6);
              var relTypes = [];
              var counts = {};
              for(var i=0, len = results.rels.length; i< len; i++){
                relTypes.push(results.rels[i]._type);
                counts[results.rels[i]._type] = counts[results.rels[i]._type] ? counts[results.rels[i]._type]+1 : 1;
              }
              // May need to fix this for getEvents
              expect(counts.NEXT).to.be.equal(2);
              expect(counts.EVENT_USER).to.be.equal(2);
              expect(counts.LATEST_EVENT).to.be.equal(2);
              done();
            });
          });
        });
      });
    });
    it("should allow a relationship to be created: with eventNodes, object call", function(done){
      var relationship = {
        from: user1,
        to: user2,
        type: 'LIKES'
      };
      // pass through to index._createRelationship
      User.createRelationship(relationship, function(err, relationship){
        expect(err).to.not.be.ok();
        expect(relationship._type).to.be.equal('LIKES');
        expect(relationship.data.property).to.not.be.ok();
        user2.getIncomingRelationships('LIKES', 'User', function(err, results){
          expect(results.nodes.length).to.be(1);
          expect(results.nodes[0]._id).to.be.equal(user1._id);
          user1.getIncomingRelationships('EVENT_USER', '_RelationshipCreated', function(err, results){
            expect(results.nodes.length).to.be(2);
            // get relationships for event node
            results.nodes[0].getAllRelationships(function(err, results){
              expect(results.rels.length).to.be(6);
              var relTypes = [];
              var counts = {};
              for(var i=0, len = results.rels.length; i< len; i++){
                relTypes.push(results.rels[i]._type);
                counts[results.rels[i]._type] = counts[results.rels[i]._type] ? counts[results.rels[i]._type]+1 : 1;
              }
              // May need to fix this for getEvents
              expect(counts.NEXT).to.be.equal(2);
              expect(counts.EVENT_USER).to.be.equal(2);
              expect(counts.LATEST_EVENT).to.be.equal(2);
              done();
            });
          });
        });
      });
    });
    it("should allow a relationship to be created: without eventNodes", function(done){
      var relationship = {
        from: user1._id,
        fromType: 'User',
        to: user2._id,
        toType: 'User',
        type: 'Follows',
        data: {
          property: 'Recorded'
        }
      };

      var options = {
        eventNodes: false
      };
      // pass through to index._createRelationship
      User.createRelationship(relationship, options, function(err, relationship){
        expect(err).to.not.be.ok();
        expect(relationship._type).to.be.equal('Follows');
        expect(relationship.data.property).to.be.equal('Recorded');
        user2.getIncomingRelationships('Follows', 'User', function(err, results){
          expect(results.nodes.length).to.be(1);
          expect(results.nodes[0]._id).to.be.equal(user1._id);
          user1.getIncomingRelationships('EVENT_USER', '_RelationshipCreated', function(err, results){
            // has not incremented since previous relationship creation
            expect(results.nodes.length).to.be(2);
            done();
          });
        });
      });
    });
  });
  describe("validations fail", function(){
    it("should fail with no relationship", function(done){
      User.createRelationship(function(err, relationship){
        expect(err).to.be.ok();
        expect(relationship).to.not.be.ok();
        done();
      });
    });
    it("should fail with no relationship:from", function(done){
      var relationship = {
        fromType: 'User',
        to: user2._id,
        toType: 'User',
        type: 'FRIEND',
        data: {
          property: 'Recorded'
        }
      };
      User.createRelationship(relationship, function(err, relationship){
        expect(err).to.be.ok();
        expect(relationship).to.not.be.ok();
        done();
      });
    });
    it("should fail with no relationship:fromType", function(done){
      var relationship = {
        from: user1._id,
        to: user2._id,
        toType: 'User',
        type: 'FRIEND',
        data: {
          property: 'Recorded'
        }
      };
      User.createRelationship(relationship, function(err, relationship){
        expect(err).to.be.ok();
        expect(relationship).to.not.be.ok();
        done();
      });
    });
    it("should fail with no relationship:to", function(done){
      var relationship = {
        from: user1._id,
        fromType: 'User',
        toType: 'User',
        type: 'FRIEND',
        data: {
          property: 'Recorded'
        }
      };
      User.createRelationship(relationship, function(err, relationship){
        expect(err).to.be.ok();
        expect(relationship).to.not.be.ok();
        done();
      });
    });
    it("should fail with no relationship:toType", function(done){
      var relationship = {
        from: user1._id,
        fromType: 'User',
        to: user2._id,
        type: 'FRIEND',
        data: {
          property: 'Recorded'
        }
      };
      User.createRelationship(relationship, function(err, relationship){
        expect(err).to.be.ok();
        expect(relationship).to.not.be.ok();
        done();
      });
    });
    it("should fail with no relationship:type", function(done){
      var relationship = {
        from: user1._id,
        fromType: 'User',
        to: user2._id,
        toType: 'User',
        data: {
          property: 'Recorded'
        }
      };
      User.createRelationship(relationship, function(err, relationship){
        expect(err).to.be.ok();
        expect(relationship).to.not.be.ok();
        done();
      });
    });
    it("should fail with no relationship:from (object)", function(done){
      var relationship = {
        to: user2,
        type: 'FRIEND',
        data: {
          property: 'Recorded'
        }
      };
      User.createRelationship(relationship, function(err, relationship){
        expect(err).to.be.ok();
        expect(relationship).to.not.be.ok();
        done();
      });
    });
    it("should fail with no relationship:to (object)", function(done){
      var relationship = {
        to: user2,
        type: 'FRIEND',
        data: {
          property: 'Recorded'
        }
      };
      User.createRelationship(relationship, function(err, relationship){
        expect(err).to.be.ok();
        expect(relationship).to.not.be.ok();
        done();
      });
    });
    it("should fail with invalid relationship:from", function(done){
      var relationship = {
        from: 'user1._id',
        fromType: 'User',
        to: user2._id,
        toType: 'User',
        type: 'FRIEND',
        data: {
          property: 'Recorded'
        }
      };
      User.createRelationship(relationship, function(err, relationship){
        expect(err).to.be.ok();
        expect(relationship).to.not.be.ok();
        done();
      });
    });
    it("should fail with invalid relationship:to", function(done){
      var relationship = {
        from: user1._id,
        fromType: 'User',
        to: 'user2._id',
        toType: 'User',
        type: 'FRIEND',
        data: {
          property: 'Recorded'
        }
      };
      User.createRelationship(relationship, function(err, relationship){
        expect(err).to.be.ok();
        expect(relationship).to.not.be.ok();
        done();
      });
    });
  });
});