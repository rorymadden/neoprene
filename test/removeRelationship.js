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
  , relationship1
  , User;

describe('remove relationship', function(){
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
    it("should allow a relationship to be removed: with rel details and eventNodes", function(done){
      var relationship = {
        from: user1,
        to: user2,
        type: 'COLLEAGUE'
      };
      User.createRelationship(relationship, function(err, rel){
        relationship1 = rel;
        expect(err).to.not.be.ok();
        expect(rel).to.be.ok();

        var relationship = {
          rel: relationship1._id,
          fromType: 'User',
          toType: 'User'
        };
        // pass through to index._removeRelationship
        User.removeRelationship(relationship, function(err){
          expect(err).to.not.be.ok();
          user2.getIncomingRelationships('COLLEAGUE', 'User', function(err, results){
            expect(results.nodes.length).to.be(0);
            user1.getIncomingRelationships('EVENT_USER', '_RelationshipRemoved', function(err, results){
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
    });
    it("should allow a relationship to be removed: without eventNodes", function(done){
      var relationship = {
        from: user1,
        to: user2,
        type: 'LIKES'
      };
      User.createRelationship(relationship, function(err, rel){
        relationship1 = rel;
        expect(err).to.not.be.ok();
        expect(rel).to.be.ok();
        var relationship2 = {
          rel: relationship1._id,
          fromType: 'User',
          toType: 'User'
        };

        var options = {
          eventNodes: false
        };
        // pass through to index._removeRelationship
        User.removeRelationship(relationship2, options, function(err){
          expect(err).to.not.be.ok();
          user2.getIncomingRelationships('LIKES', 'User', function(err, results){
            expect(results.nodes.length).to.be(0);
            user1.getIncomingRelationships('EVENT_USER', '_RelationshipRemoved', function(err, results){
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
                expect(counts.NEXT).to.be.equal(4);
                expect(counts.EVENT_USER).to.be.equal(2);
                done();
              });
            });
          });
        });
      });
    });
  });
  describe("validations fail", function(){
    it("should fail with no relationship", function(done){
      User.removeRelationship(function(err){
        expect(err).to.be.ok();
        done();
      });
    });

    it("should fail with invalid relationship: no fromType", function(done){
      var relationship = {
        rel: relationship1._id,
        toType: 'User'
      };
      User.removeRelationship(relationship, function(err){
        expect(err).to.be.ok();
        done();
      });
    });

    it("should fail with invalid relationship: no toType", function(done){
      var relationship = {
        rel: relationship1._id,
        fromType: 'User'
      };
      User.removeRelationship(relationship, function(err){
        expect(err).to.be.ok();
        done();
      });
    });

    it("should fail with invalid relationship: no rel", function(done){
      var relationship = {
        fromType: 'User',
        toType: 'User'
      };
      User.removeRelationship(relationship, function(err){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should fail with no relationship: with options", function(done){
      var options = {
        eventNodes: false
      };
      User.removeRelationship(options, function(err){
        expect(err).to.be.ok();
        done();
      });
    });
  });
});