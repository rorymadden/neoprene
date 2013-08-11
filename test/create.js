'use strict';

var libpath = process.env['LIB_COV'] ? '../lib-cov' : '../lib';

var neoprene = require(libpath)
  , Schema = require(libpath + '/schema')
  , expect = require('expect.js')
  , async = require('async')
  , request = require('superagent');

var testURL = 'http://localhost:7475';
neoprene.connect(testURL);

var userSchema = {
  first: {type: String},
  last: {type: String},
  countSchedules: Number,
  countActivities: {type: Number, default: 0},
  active: {type: Boolean, default:true}
};
var UserSchema = new Schema(userSchema);
UserSchema.virtual('virtual').get(function(){
  return this.first + this.countActivities;
});

var userData = [{
    first: 'John',
    countSchedules: 1
  }
];
var User,
    Activity,
    Schedule,
    user1 = {},
    user2 = {},
    user3 = {},
    schedule = {};

describe('model create', function(){
  before(function(done){
    var query = 'start n=node(*) match n-[r?]->() where id(n) <> 0 delete r,n';
    var params = {};

    //wipe models and add new ones
    neoprene.models = {};
    neoprene.modelSchemas = {};
    User = neoprene.model('User', UserSchema);
    Activity = neoprene.model('Activity', new Schema({activityName:String}));
    Schedule = neoprene.model('Schedule', new Schema({scheduleName:String, activityCount: Number}));


    neoprene.query(query, params, function(err, results) {
      expect(err).to.not.be.ok();
      expect(results).to.be.ok();
      User.create(userData[0], function(err, user){
        expect(err).to.not.be.ok();
        user1 = user;
        expect(user.first).to.be.eql('John');
        user.getAllRelationships(null, '_UserCreated', function(err, results){
          expect(err).to.not.be.ok();
          expect(results.rels.length).to.be.equal(2);
          expect(results.rels[1]._type).to.be.equal('LATEST_EVENT');
          expect(results.rels[0]._type).to.be.equal('EVENT_USER');
          done();
        });
      });
    });
  });
  // describe("models", function(){
  //   it("should create without new keyword", function(done){
  //     var user = User();
  //     expect(user instanceof User).to.be.ok();
  //     done();
  //   });
  //   it("should create with new keyword", function(done){
  //     var user = new User();
  //     expect(user instanceof User).to.be.ok();
  //     done();
  //   });
  //   it('should get virtuals', function(done){
  //     var user = new User({first: 'Test', countActivities: 1});
  //     user.create(function(err, user){
  //       console.log(user);
  //       expect(user.virtual).to.be.equal("Test1");
  //       done();
  //     });
  //   });
  // });
  describe("validation fail", function(){
    it("should fail on required validation", function(done){
      var schema1 = new Schema({
        first: {type: String, required: true, lowercase: true, trim: true}
      });
      var Model1 = neoprene.model('Model1', schema1);
      Model1.create({}, user1._id, function(err, model){
        expect(err).to.be.ok();
        expect(model).to.not.be.ok();
        Model1.create({first: '  BIG  '}, user1._id, function(err, model){
          expect(err).to.not.be.ok();
          expect(model).to.be.ok();
          done();
        });
      });
    });
    it("should fail regular expression", function(done){
      var emailRegEx = /^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/;
      var schema2 = new Schema({
        email: {type: "string", trim:true, lowercase:true, match: emailRegEx},
      });
      var Model2 = neoprene.model('Model2', schema2);
      Model2.create({email: '    MAILTEST.COM   '}, user1._id, function(err, model){
        expect(err).to.be.ok();
        expect(model).to.not.be.ok();
        Model2.create({email: '    MAIL@TEST.COM   '}, user1._id, function(err, model){
          expect(err).to.not.be.ok();
          expect(model).to.be.ok();
          expect(model.email).to.be.equal('mail@test.com');
          done();
        });
      });
    });
    it("should fail on min/max number", function(done){
      var schema3 = new Schema({
        number: {type: Number, min: 1, max: 50}
      });
      var Model3 = neoprene.model('Model3', schema3);
      Model3.create({number: 0}, user1._id, function(err, model){
        expect(err).to.be.ok();
        expect(model).to.not.be.ok();
        Model3.create({number:51}, user1._id, function(err, model){
          expect(err).to.be.ok();
          expect(model).to.not.be.ok();
          Model3.create({number:30}, user1._id, function(err, model){
            expect(err).to.not.be.ok();
            expect(model).to.be.ok();
            done();
          });
        });
      });
    });
    it("should fail on enum values", function(done){
      var GENDER = ['unknown', 'male', 'female'];
      var schema4 = new Schema({
        gender: {type: String, enum: GENDER},
      });
      var Model4 = neoprene.model('Model4', schema4);
      Model4.create({gender: 'blue'}, user1._id, function(err, model){
        expect(err).to.be.ok();
        expect(model).to.not.be.ok();
        Model4.create({gender: 'male'}, user1._id, function(err, model){
          expect(err).to.not.be.ok();
          expect(model).to.be.ok();
          done();
        });
      });
    });
    it("should fail on enum values", function(done){
      var GENDER = ['unknown', 'male', 'female'];
      var schema5 = new Schema({
        gender: {type: String, lowercase: true, trim: true, enum: GENDER},
      });
      var Model5 = neoprene.model('Model5', schema5);
      Model5.create({gender: 'blue'}, user1._id, function(err, model){
        expect(err).to.be.ok();
        expect(model).to.not.be.ok();
        Model5.create({gender: '  MALE  '}, user1._id, function(err, model){
          expect(err).to.not.be.ok();
          expect(model).to.be.ok();
          done();
        });
      });
    });
    it("should create index", function(done){
      var schema6 = new Schema({
        email: {type: String, index:true},
      });
      var Model6 = neoprene.model('Model6', schema6);
      Model6.create({email: 'delay'}, user1._id, function(err, model){
        request
          .get(testURL + '/db/data/schema/index/Model6')
          .end(function(err, res){
            expect(err).to.not.be.ok();
            expect(res.body.length).to.be.equal(1);
            expect(res.body[0]['property-keys'].length).to.be(1);
            expect(res.body[0]['property-keys'][0]).to.be.equal('email');
            request
              .del(testURL + '/db/data/schema/index/Model6/email')
              .end(function(err, res){
                expect(res.status).to.be(204);
                done();
              });
          });
      });
    });
    // it("should fail on duplicate unique indexes", function(done){
    //   var schema7 = new Schema({
    //     second: {type: String, index:{ unique: true}},
    //   });
    //   var Model7 = neoprene.model('Model7', schema7);
    //   Model7.create({second:'unique'}, user1._id, function(err, model){
    //     expect(err).to.not.be.ok();
    //     expect(model.second).to.be.equal('unique');
    //     console.log(model);
    //     request
    //       .get(testURL + '/db/data/schema/index/Model7')
    //       .end(function(err, res){
    //         expect(err).to.not.be.ok();
    //         expect(res.body.length).to.be.equal(1);
    //         expect(res.body[0]['property-keys'].length).to.be(1);
    //         expect(res.body[0]['property-keys'][0]).to.be.equal('second');
    //         Model7.create({second:'unique'}, user1._id, function(err, model2){
    //           console.log(model2);
    //           expect(err).to.be.ok();
    //           expect(model2).to.not.be.ok();
    //           var query = 'DROP CONSTRAINT ON (model:Model7) ASSERT model.second IS UNIQUE';
    //           neoprene.query(query, function(err){
    //             expect(err).to.not.be.ok();
    //             done();
    //           });
    //         });
    //       });
    //   });
    // });
  });
  describe("validations pass", function(){
    it("should create a node using the create option", function(done){
      var options = {

      };
      User.create(userData[0], options, function(err, user){
        expect(err).to.not.be.ok();
        expect(user.first).to.be.eql('John');
        user.getAllRelationships(null, '_UserCreated', function(err, results){
          expect(err).to.not.be.ok();
          expect(results.rels.length).to.be.equal(2);
          expect(results.rels[1]._type).to.be.equal('LATEST_EVENT');
          expect(results.rels[0]._type).to.be.equal('EVENT_USER');
          done();
        });
      });
    });
    it("should create a node using the create option with relationship", function(done){
      Schedule.create({scheduleName: 'S1', activityCount: 0}, user1._id, function(err, sched){
        schedule._id = sched._id;
        var options = {
          relationship: {
            nodeLabel: 'Schedule',
            indexField: '_id',
            indexValue: schedule._id,
            type: 'CONTAINS',
            direction: 'from'
          }
        };
        Activity.create({activityName: 'A1'}, user1._id, options, function(err, results){
          expect(err).to.not.be.ok();
          expect(results.node.activityName).to.be.equal('A1');
          expect(results.rel._type).to.be('CONTAINS');
          results.node.getAllRelationships(null, '_ActivityCreated', function(err, results){
            expect(results.rels.length).to.be.equal(2);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results.rels.length; i< len; i++){
              relTypes.push(results.rels[i]._type);
              counts[results.rels[i]._type] = counts[results.rels[i]._type] ? counts[results.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('LATEST_EVENT')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            done();
          });
        });
      });
    });
    it('should create a node with a relationship with relationship data', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from',
          data: {
            name: 'RelName',
            other: true
          }
        }
      };
      Activity.create({activityName: 'A2'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        expect(res.rel.data.other).to.be(true);
        expect(res.rel.data.name).to.be('RelName');
        // need to test response direction
        done();
      });
    });
    it('should create a node with a relationship based on email', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from',
          data: {
            name: 'RelName',
            other: true
          }
        }
      };
      Activity.create({activityName: 'A3'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        // need to test response direction
        done();
      });
    });
    it('should create a node with eventNodes node:false', function(done){
      var options = {
        eventNodes: {
          node: false,
          user: false
        }
      };
      Activity.create({activityName: 'A4'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res._self).to.be.a('string');
        res.getAllRelationships(null, '_ActivityCreated', function(err, results){
          expect(results.length).to.be(undefined);
          done();
        });
      });
    });
    // source and target need to be for create relationship, not create
    // it('should create a user node with eventNodes: SOURCE and TARGET', function(done){
    //   var options = {
    //     eventNodes: {
    //       user: true
    //     }
    //   };
    //   User.create(userData[0], user1._id, options, function(err, res){
    //     expect(err).to.be(null);
    //     expect(res).to.be.an('object');
    //     expect(res._self).to.be.a('string');
    //     res.getAllRelationships(null, '_UserCreated', function(err, results){
    //       expect(results.rels.length).to.be.equal(2);
    //       results.nodes[0].getAllRelationships(function(err, results2){
    //         expect(results2.rels.length).to.be.equal(5);
    //         var relTypes = [];
    //         var counts = {};
    //         for(var i=0, len = results2.rels.length; i< len; i++){
    //           relTypes.push(results2.rels[i]._type);
    //           counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
    //         }
    //         expect(relTypes.indexOf('NEXT')).to.not.be.equal(-1);
    //         expect(relTypes.indexOf('LATEST_EVENT')).to.not.be.equal(-1);
    //         expect(relTypes.indexOf('EVENT_SOURCE_USER')).to.not.be.equal(-1);
    //         expect(relTypes.indexOf('EVENT_TARGET_USER')).to.not.be.equal(-1);
    //         expect(counts.LATEST_EVENT).to.be.equal(2);
    //         done();
    //       });
    //     });
    //   });
    // });
    it('should create a node with user roles', function(done){
      var options = {
        role: {
          roleOwner: 'user',
          name: 'Admin'
        }
      };
      Activity.create({activityName: 'A6'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res._self).to.be.a('string');
        res.getAllRelationships(null, '_ActivityRole', function(err, results){
          expect(results.rels.length).to.be.equal(1);
          done();
        });
      });
    });
    it('should create a node with a relationship and counters', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        },
        counters: [{
          node: 'relationshipNode',
          field: 'activityCount'
        }]
      };
      Activity.create({activityName: 'A5'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        expect(res.rel._direction).to.be('from');
        Schedule.findById(schedule._id, function(err, schedule){
          expect(schedule.activityCount).to.be.equal(1);
          done();
        });
      });
    });
    it('should create a node with relationship and eventNodes node:false', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        },
        eventNodes: {
          node: false,
          user:false
        }
      };
      Activity.create({activityName: 'A4'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        expect(res.rel._direction).to.be('from');
        res.node.getAllRelationships(null, '_ActivityCreated', function(err, results){
          expect(results.length).to.be(undefined);
          done();
        });
      });
    });
    it('should create a node with a relationship and eventNodes', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        },
        eventNodes: {
          user: true,
          relationshipNode: true
        }
      };
      Activity.create({activityName: 'A4'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        expect(res.rel._direction).to.be('from');
        res.node.getAllRelationships(null, '_ActivityCreated', function(err, results){
          expect(results.rels.length).to.be.equal(2);
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.rels.length).to.be.equal(8);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('NEXT')).to.not.be.equal(-1);
            expect(relTypes.indexOf('NEXT')).to.not.be.equal(-1);
            expect(relTypes.indexOf('LATEST_EVENT')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_SCHEDULE')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_USER')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(3);
            done();
          });
        });
      });
    });
    it('should create a node with a relationship and eventNodes', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        },
        eventNodes: {
          user: true
        }
      };
      Activity.create({activityName: 'A4'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        expect(res.rel._direction).to.be('from');
        res.node.getAllRelationships(null, '_ActivityCreated', function(err, results){
          expect(results.rels.length).to.be.equal(2);
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.rels.length).to.be.equal(5);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('NEXT')).to.not.be.equal(-1);
            expect(relTypes.indexOf('LATEST_EVENT')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_USER')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(2);
            done();
          });
        });
      });
    });
    it('should create a user node with a relationship and eventNodes', function(done){
      var options = {
        relationship: {
          nodeLabel: 'User',
          indexField: '_id',
          indexValue: user1._id,
          type: 'Friends',
          direction: 'from'
        },
        eventNodes: {
          relationshipNode: true
        }
      };
      User.create(userData[0], user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('Friends');
        expect(res.rel._direction).to.be('from');
        res.node.getAllRelationships(null, '_UserCreated', function(err, results){
          expect(results.rels.length).to.be.equal(2);
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.rels.length).to.be.equal(5);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('NEXT')).to.not.be.equal(-1);
            expect(relTypes.indexOf('LATEST_EVENT')).to.not.be.equal(-1);
            // expect(relTypes.indexOf('EVENT_SOURCE_USER')).to.not.be.equal(-1);
            // expect(relTypes.indexOf('EVENT_TARGET_USER')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(2);
            expect(counts.NEXT).to.be.equal(1);
            done();
          });
        });
      });
    });
    it('should create a node with a relationship and node roles', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        },
        role: {
          roleOwner: 'user',
          name: 'Member'
        }
      };
      Activity.create({activityName: 'A6'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        expect(res.rel._direction).to.be('from');
        res.node.getAllRelationships(null, '_ActivityRole', function(err, results){
          expect(results.rels.length).to.be.equal(1);
          done();
        });
      });
    });
    it('should create a node with a relationship and relationship roles', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        },
        role: {
          roleOwner: 'user',
          name: 'Admin'
        }
      };
      Activity.create({activityName: 'A6'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        expect(res.rel._direction).to.be('from');
        res.node.getAllRelationships(null, '_ActivityRole', function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('HAS_ACTIVITY');
          results.nodes[0].getAllRelationships(null, 'User', function(err, results){
            expect(results.rels.length).to.be.equal(1);
            expect(results.rels[0]._type).to.be.equal('HAS_ROLE_IN_ACTIVITY');
            done();
          });
        });
      });
    });
    it('should create a node with a eventNodes and roles', function(done){
      var options = {
        eventNodes: {
          user: true
        },
        role: {
          roleOwner: 'user',
          name: 'Admin'
        }
      };
      Activity.create({activityName: 'A5'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res._self).to.be.a('string');
        res.getAllRelationships(null, '_ActivityCreated', function(err, results){
          expect(results.rels.length).to.be.equal(2);
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.nodes.length).to.be.equal(5);
            res.getAllRelationships(null, '_ActivityRole', function(err, results){
              expect(results.rels.length).to.be.equal(1);
              expect(results.rels[0]._type).to.be.equal('HAS_ACTIVITY');
                results.nodes[0].getAllRelationships(null, 'User', function(err, results){
                  expect(results.rels.length).to.be.equal(1);
                  expect(results.rels[0]._type).to.be.equal('HAS_ROLE_IN_ACTIVITY');
                  done();
                });
            });
          });
        });
      });
    });
    it('should create a node with eventNodes and counters', function(done){
      var options = {
        eventNodes: {
          user: true
        },
        counters: [{
          node: 'user',
          field: 'countSchedules'
        },{
          node: 'user',
          field: 'countActivities'
        }]
      };
      Activity.create({activityName: 'A5.2'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res._self).to.be.a('string');
        res.getAllRelationships(null, '_ActivityCreated', function(err, results){
          expect(results.nodes[0]._doc.timestamp).to.be.ok();
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.nodes.length).to.be.equal(5);
            expect(results2.nodes[0].countSchedules).to.be.equal(2);
            expect(results2.nodes[0].countActivities).to.be.equal(1);
            done();
          });
        });
      });
    });
    it('should create a node with a relationship, counters and roles', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        },
        counters: [{
          node: 'relationshipNode',
          field: 'activityCount'
        }],
        role: {
          roleOwner: 'user',
          name: 'Admin'
        }
      };
      Activity.create({activityName: 'A6'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        expect(res.rel._direction).to.be('from');
        res.node.getAllRelationships(null, '_ActivityCreated', function(err, results){
          expect(results.rels.length).to.be.equal(2);
          // find the Schedule
          res.node.getAllRelationships(null, 'Schedule', function(err, results2){
            expect(results2.nodes.length).to.be.equal(1);
            expect(results2.nodes[0].activityCount).to.be.equal(2);
            res.node.getAllRelationships(null, '_ActivityRole', function(err, results){
              expect(results.rels.length).to.be.equal(1);
              expect(results.rels[0]._type).to.be.equal('HAS_ACTIVITY');
                results.nodes[0].getAllRelationships(null, 'User', function(err, results){
                  expect(results.rels.length).to.be.equal(1);
                  expect(results.rels[0]._type).to.be.equal('HAS_ROLE_IN_ACTIVITY');
                  done();
                });
            });
          });
        });
      });
    });
    it('should create a node with a relationship, eventNodes and roles', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        },
        eventNodes: {
          user: true,
          relationshipNode: true
        },
        role: {
          roleOwner: 'user',
          name: 'Admin'
        }
      };
      Activity.create({activityName: 'A6'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        expect(res.rel._direction).to.be('from');
        res.node.getAllRelationships(null, '_ActivityCreated', function(err, results){
          expect(results.rels.length).to.be.equal(2);
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.nodes.length).to.be.equal(8);
            res.node.getAllRelationships(null, '_ActivityRole', function(err, results){
              expect(results.rels.length).to.be.equal(1);
              expect(results.rels[0]._type).to.be.equal('HAS_ACTIVITY');
              results.nodes[0].getAllRelationships(null, 'User', function(err, results){
                expect(results.rels.length).to.be.equal(1);
                expect(results.rels[0]._type).to.be.equal('HAS_ROLE_IN_ACTIVITY');
                done();
              });
            });
          });
        });
      });
    });
    it('should create a node with a relationship, counters and roles', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        },
        eventNodes: {
          node: false,
          user:false
        },
        counters: [{
          node: 'user',
          field: 'countActivities'
        }],
        role: {
          roleOwner: 'user',
          name: 'Admin'
        }
      };
      Activity.create({activityName: 'A6'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        expect(res.rel._direction).to.be('from');
        res.node.getAllRelationships(null, '_ActivityCreated', function(err, results){
          expect(results.rels.length).to.be.equal(0);
          res.node.getAllRelationships(null, '_ActivityRole', function(err, results2){
            expect(results2.rels.length).to.be.equal(1);
            expect(results2.rels[0]._type).to.be.equal('HAS_ACTIVITY');
            results2.nodes[0].getAllRelationships(null, 'User', function(err, results){
              expect(results.rels.length).to.be.equal(1);
              expect(results.rels[0]._type).to.be.equal('HAS_ROLE_IN_ACTIVITY');
              expect(results.nodes[0].countActivities).to.be.equal(2);
              done();
            });
          });
        });
      });
    });
    it('should create a node with eventNodes, counters and roles', function(done){
      var options = {
        eventNodes: {
          user: true
        },
        counters: [{
          node: 'user',
          field: 'countSchedules'
        }],
        role: {
          roleOwner: 'user',
          name: 'Admin'
        }
      };
      Activity.create({activityName: 'A6'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        expect(res._self).to.be.a('string');
        res.getAllRelationships(null, '_ActivityCreated', function(err, results){
          expect(results.rels.length).to.be.equal(2);
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.nodes.length).to.be.equal(5);
            expect(results2.nodes[0].countSchedules).to.be.equal(3);
            res.getAllRelationships(null, '_ActivityRole', function(err, results){
              expect(results.rels.length).to.be.equal(1);
              expect(results.rels[0]._type).to.be.equal('HAS_ACTIVITY');
              results.nodes[0].getAllRelationships(null, 'User', function(err, results){
                expect(results.rels.length).to.be.equal(1);
                expect(results.rels[0]._type).to.be.equal('HAS_ROLE_IN_ACTIVITY');
                done();
              });
            });
          });
        });
      });
    });
    it('should create a node with a relationship, eventNodes, counters and roles', function(done){
      var options = {
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        },
        eventNodes: {
          user: true,
          relationshipNode: true
        },
        counters: [{
          node: 'user',
          field: 'countSchedules'
        },{
          node: 'relationshipNode',
          field: 'activityCount'
        }],
        role: {
          roleOwner: 'user',
          name: 'Admin'
        }
      };
      Activity.create({activityName: 'A6'}, user1._id, options, function(err, res){
        expect(err).to.be(null);
        expect(res).to.be.an('object');
        // confirm relationship
        expect(res.node._self).to.be.a('string');
        expect(res.rel._type).to.be('CONTAINS');
        expect(res.rel._direction).to.be('from');
        res.node.getAllRelationships(null, '_ActivityCreated', function(err, results){
          expect(results.rels.length).to.be.equal(2);
          results.nodes[0].getAllRelationships(function(err, results2){
            // confirm event nodes
            expect(results2.nodes.length).to.be.equal(8);
            for(var i=0, len = results2.nodes.length; i< len; i ++){
              if(results2.nodes[i]._nodeType === 'Schedule'){
                expect(results2.nodes[i].countSchedules).to.be.equal(4);
                expect(results2.nodes[i].activityCount).to.be.equal(4);
                break;
              }
            }
            //confirm counters
            // confirm roles
            res.node.getAllRelationships(null, '_ActivityRole', function(err, results){
              expect(results.rels.length).to.be.equal(1);
              expect(results.rels[0]._type).to.be.equal('HAS_ACTIVITY');
              results.nodes[0].getAllRelationships(null, 'User', function(err, results){
                expect(results.rels.length).to.be.equal(1);
                expect(results.rels[0]._type).to.be.equal('HAS_ROLE_IN_ACTIVITY');
                done();
              });
            });
          });
        });
      });
    });

    //errors
    it('should error with just counters', function(done){
      var options = {
        counters: [{
          node: 'user',
          field: 'countSchedules'
        },{
          node: 'user',
          field: 'countActivities'
        }],
        eventNodes: {
          user:false
        }
      };
      Activity.create({activityName: 'Error'}, user1._id, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it('should error with user counters and no user eventNodes', function(done){
      var options = {
        counters: [{
          node: 'user',
          field: 'countSchedules'
        },{
          node: 'user',
          field: 'countActivities'
        }],
        relationship: {
          nodeLabel: 'Schedule',
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        }
      };
      Activity.create({activityName: 'Error'}, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it('should error with relationship counters and no relationship', function(done){
      var options = {
        counters: [{
          node: 'user',
          field: 'countSchedules'
        },{
          node: 'user',
          field: 'countActivities'
        }],
        eventNodes: {
          user: true
        }
      };
      Activity.create({activityName: 'Error'}, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it('should error with user counters and no user', function(done){
      var options = {
        counters: [{
          node: 'user',
          field: 'countSchedules'
        },{
          node: 'user',
          field: 'countActivities'
        }]
      };
      Activity.create({activityName: 'Error'}, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it('should error with just role', function(done){
      var options = {
        role: {
          roleOwner: 'user',
          name: 'Admin'
        }
      };
      Activity.create({activityName: 'Error'}, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it('should error with user eventNodes and no user id', function(done){
      var options = {
        eventNodes: {
          user: true,
          relationshipNode: true
        },
      };
      Activity.create({activityName: 'Error'}, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it('should error with relationship eventNodes and no relationship', function(done){
      var options = {
        eventNodes: {
          user: true,
          relationshipNode: true
        },
      };
      Activity.create({activityName: 'Error'}, user1._id, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it('should error with bad relationship details', function(done){
      var options = {
        relationship: {
          indexField: '_id',
          indexValue: schedule._id,
          type: 'CONTAINS',
          direction: 'from'
        }
      };
      Activity.create({activityName: 'Error'}, user1._id, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it('should error on second create', function(done){
      user1.create({activityName: 'Error'}, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
  });
  describe('model read', function(){
    before(function(done){
      //create users to play around with
      var userData = [{
          first: 'John',
          countSchedules: 1
        },{
          first: 'Jane',
          countSchedules: 1024,
        }, {
          first: 'Susan',
          countSchedules: 37
        }
      ];

      var users = [];
      for(var i =0, len = userData.length; i<len; i++){
        users[i] = new User(userData[i]);
      }
      var counter = 0;
      async.forEach(users, function(user, callback){
        user.create(function(err, res){
          users[counter++] = res;
          expect(err).to.be(null);
          expect(res).to.be.an('object');
          expect(res._self).to.be.a('string');
          callback();
        });
      }, function(err){
        expect(err).to.be(null);
        for(var i=0, len = users.length; i<len; i++){
          // if(users[i].first === 'John') user1 = users[i];
          if(users[i].first === 'Jane') user2 = users[i];
          if(users[i].first === 'Susan') user3 = users[i];
        }
        done();
      });
    });
    it('should get a node by id', function(done){
      User.findById(user1._id, function(err, node){
        expect(err).to.be(null);
        expect(node._id).to.be.eql(user1._id);
        expect(node.first).to.be.eql(userData[0].first);
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
    // it("should error if relationship has not been defined", function(done){
    //   user1.createRelationshipTo(user2._id, 'newRel', function(err, rel){
    //     expect(err).to.exist;
    //     user1.removeRelationshipTo(user2._id, 'newRel', function(err){
    //       expect(err).to.not.exist;
    //       done();
    //     });
    //   });
    // });
    it('should get all relationships for a node', function(done){
      user1.getAllRelationships(function(err, results){
        expect(err).to.be(null);
        expect(results.rels).to.be.an('array');
        expect(results.nodes).to.be.an('array');
        expect(results.rels.length).to.be(44);
        expect(results.nodes.length).to.be(44);
        expect(results.nodes[0]).to.be.an('object');
        expect(results.nodes[0]._id).to.be.a('number');
        expect(results.nodes[0]._self).to.be.a('string');
        expect(results.rels[0]).to.be.an('object');
        expect(results.rels[0]._id).to.be.a('number');
        expect(results.rels[0]._direction).to.be.a('string');
        expect(results.rels[0]._type).to.be.a('string');
        expect(results.rels[0].data).to.be.an('object');
        done();
      });
    });
    it('should get all relationships of a type', function(done){
      user1.getAllRelationships('EVENT_USER', function(err, results){
        expect(err).to.be(null);
        expect(results.rels).to.be.an('array');
        expect(results.nodes).to.be.an('array');
        expect(results.rels.length).to.be(24);
        expect(results.nodes.length).to.be(24);
        expect(results.nodes[0]).to.be.an('object');
        expect(results.nodes[0]._id).to.be.a('number');
        expect(results.nodes[0]._self).to.be.a('string');
        expect(results.rels[0]._id).to.be.a('number');
        expect(results.rels[0]._direction).to.be.a('string');
        expect(results.rels[0]._type).to.be.a('string');
        expect(results.rels[0].data).to.be.an('object');
        done();
      });
    });
    it('should get all relationships of a type with array input', function(done){
      user1.getAllRelationships(['EVENT_USER', 'HAS_ROLE_IN_ACTIVITY'], function(err, results){
        expect(err).to.be(null);
        expect(results.rels).to.be.an('array');
        expect(results.nodes).to.be.an('array');
        expect(results.rels.length).to.be(33);
        expect(results.nodes.length).to.be(33);
        expect(results.nodes[0]).to.be.an('object');
        expect(results.nodes[0]._id).to.be.a('number');
        expect(results.nodes[0]._self).to.be.a('string');
        expect(results.rels[0]._id).to.be.a('number');
        expect(results.rels[0]._direction).to.be.a('string');
        expect(results.rels[0]._type).to.be.a('string');
        expect(results.rels[0].data).to.be.an('object');
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
        expect(results.rels.length).to.be(25);
        expect(results.nodes.length).to.be(25);
        expect(results.nodes[0]).to.be.an('object');
        expect(results.nodes[0]._id).to.be.a('number');
        expect(results.nodes[0]._self).to.be.a('string');
        expect(results.rels[0]._id).to.be.a('number');
        expect(results.rels[0]._direction).to.be.a('string');
        expect(results.rels[0]._type).to.be.a('string');
        expect(results.rels[0].data).to.be.an('object');
        done();
      });
    });
    it('should get all outgoing relationships - all types', function(done){
      user1.getOutgoingRelationships(function(err, results){
        expect(err).to.be(null);
        expect(results.rels).to.be.an('array');
        expect(results.nodes).to.be.an('array');
        expect(results.rels.length).to.be(19);
        expect(results.nodes.length).to.be(19);
        expect(results.nodes[0]).to.be.an('object');
        expect(results.nodes[0]._id).to.be.a('number');
        expect(results.nodes[0]._self).to.be.a('string');
        expect(results.rels[0]._id).to.be.a('number');
        expect(results.rels[0]._direction).to.be.a('string');
        expect(results.rels[0]._type).to.be.a('string');
        expect(results.rels[0].data).to.be.an('object');
        done();
      });
    });
    it('should get all outgoing relationships - one type', function(done){
      user1.getOutgoingRelationships('LATEST_EVENT', function(err, results){
        expect(err).to.be(null);
        expect(results.rels).to.be.an('array');
        expect(results.nodes).to.be.an('array');
        expect(results.rels.length).to.be(1);
        expect(results.nodes.length).to.be(1);
        expect(results.nodes[0]).to.be.an('object');
        expect(results.nodes[0]._id).to.be.a('number');
        expect(results.nodes[0]._self).to.be.a('string');
        expect(results.rels[0]._id).to.be.a('number');
        expect(results.rels[0]._direction).to.be.a('string');
        expect(results.rels[0]._type).to.be.a('string');
        expect(results.rels[0].data).to.be.an('object');
        done();
      });
    });
    it('should get all outgoing relationships - all types using label', function(done){
      user1.getOutgoingRelationships(null, '_ActivityRole', function(err, results){
        expect(err).to.be(null);
        expect(results.rels).to.be.an('array');
        expect(results.nodes).to.be.an('array');
        expect(results.rels.length).to.be(9);
        expect(results.nodes.length).to.be(9);
        expect(results.nodes[0]).to.be.an('object');
        expect(results.nodes[0]._id).to.be.a('number');
        expect(results.nodes[0]._self).to.be.a('string');
        expect(results.rels[0]._id).to.be.a('number');
        expect(results.rels[0]._direction).to.be.a('string');
        expect(results.rels[0]._type).to.be.a('string');
        expect(results.rels[0].data).to.be.an('object');
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
    it('should get all outgoing relationships - limit 2', function(done){
      user1.getOutgoingRelationships(null, '_ActivityRole', {}, {limit: 2}, function(err, results){
        expect(err).to.be(null);
        expect(results.rels).to.be.an('array');
        expect(results.nodes).to.be.an('array');
        expect(results.rels.length).to.be(2);
        expect(results.nodes.length).to.be(2);
        done();
      });
    });
    // it('should get all outgoing relationships which satisfy data condition', function(done){
    //   user1.getOutgoingRelationships(null, '_ActivityRole', {role: 'Admin'}, function(err, results){
    //     expect(err).to.be(null);
    //     expect(results.rels).to.be.an('array');
    //     expect(results.nodes).to.be.an('array');
    //     expect(results.rels.length).to.be(3);
    //     expect(results.nodes.length).to.be(3);
    //     done();
    //   });
    // });
    it('should get all incoming relationships - limit 2', function(done){
      user1.getIncomingRelationships(null, '_ActivityCreated', {}, {limit: 2}, function(err, results){
        expect(err).to.be(null);
        expect(results.rels).to.be.an('array');
        expect(results.nodes).to.be.an('array');
        expect(results.rels.length).to.be(2);
        expect(results.nodes.length).to.be(2);
        done();
      });
    });
    // it('should get all incoming relationships which satisfy data condition', function(done){
    //   user1.getIncomingRelationships(null, 'User', {countSchedules: 1}, function(err, results){
    //     expect(err).to.be(null);
    //     expect(results.rels).to.be.an('array');
    //     expect(results.nodes).to.be.an('array');
    //     expect(results.rels.length).to.be(1);
    //     expect(results.nodes.length).to.be(1);
    //     done();
    //   });
    // });
    it('should get all relationships - limit 2', function(done){
      user1.getAllRelationships(null, '_ActivityCreated', {}, {limit: 2}, function(err, results){
        expect(err).to.be(null);
        expect(results.rels).to.be.an('array');
        expect(results.nodes).to.be.an('array');
        expect(results.rels.length).to.be(2);
        expect(results.nodes.length).to.be(2);
        done();
      });
    });
    // it('should get all relationships which satisfy data condition', function(done){
    //   user1.getAllRelationships(null, '_ActivityRole', {role: 'Admin'}, function(err, results){
    //     expect(err).to.be(null);
    //     expect(results.rels).to.be.an('array');
    //     expect(results.nodes).to.be.an('array');
    //     expect(results.rels.length).to.be(3);
    //     expect(results.nodes.length).to.be(3);
    //     done();
    //   });
    // });
  });
  describe('model queries', function(){
    var id;
    it("should find based on conditions", function(done){
      User.find({first: "John"}, function(err, nodes){
        expect(err).to.be(null);
        expect(nodes.length).to.be(4);
        expect(nodes[0].first).to.be("John");
        done();
      });
    });
    // it("should find based on number conditions", function(done){
    //   User.find({number: "42"}, function(err, nodes){
    //     expect(err).to.be(null);
    //     expect(nodes.length).to.be(3);
    //     expect(nodes[0].email).to.be("mail@test.com");
    //     done();
    //   });
    // });
    // TODO: turn this into a query response
    it("should return all for the label if no conditions", function(done){
      User.find(function(err, users){
        expect(err).to.not.exist;
        expect(users.length).to.be(6);
        done();
      });
    });
    it("should return limited fields if fields are specified", function(done){
      User.find({first: "John"}, 'first countSchedules', function(err, nodes){
        expect(err).to.be(null);
        expect(nodes.length).to.be(4);
        expect(nodes[0].email).to.be.undefined;
        expect(nodes[0].gender).to.be.undefined;
        expect(nodes[0].first).to.not.be(null);
        expect(nodes[0].countSchedules).to.not.be(null);
        expect(nodes[0]._id).to.not.be.undefined;
        expect(nodes[0]._self).to.not.be.undefined;
        done();
      });
    });
    it("should return a single node with findOne", function(done){
      User.findOne({first: 'John'}, function(err, nodes){
        expect(nodes.length).to.be.undefined;
        expect(err).to.be(null);
        expect(nodes.countSchedules).to.be(4);
        done();
      })
    });
    it("should find with limit and orderBy", function(done){
      User.find({active: true}, 'first', { orderBy: [{field: 'first', desc: true }], limit: 5}, function(err, nodes){
        expect(nodes.length).to.be(5);
        expect(err).to.be(null);
        expect(nodes[0].first).to.be('Susan');
        done();
      });
    });
    it("should ignore limit with findOne", function(done){
      User.findOne({first: 'John'}, '', {limit:5}, function(err, nodes){
        expect(nodes).to.not.be.an.array;
        expect(err).to.be(null);
        done();
      });
    });
    it("should skip records with skip option", function(done){
      User.find({first: "John"}, '', {skip:1}, function(err, nodes){
        expect(err).to.be(null);
        expect(nodes.length).to.be(3);
        expect(nodes[0].first).to.be("John");
        done();
      });
    });
    // it("should find and update a record", function(done){
    //   User.findOneAndUpdate({first: 'John'}, {first: 'John2', last: 'Surname'}, function(err, node){
    //     expect(err).to.be(null);
    //     expect(node.first).to.eql('John2');
    //     expect(node.last).to.eql('Surname');
    //     done();
    //   });
    // });
    // it("should find and remove a record - fail with relationships", function(done){
    //   User.findOne({first: "John"}, function(err, node){
    //     id = node._id;
    //     User.findOneAndRemove({first:"John"}, function(err, node){
    //       expect(err).to.not.be(null);
    //       User.findById(id, function(err, node){
    //         expect(node.first).to.eql('John');
    //         done();
    //       });
    //     });
    //   });
    // });
    // it("should find and remove a record - force", function(done){
    //   User.findOneAndRemove({first:"John"}, { remove: {force: true }}, function(err, node){
    //     expect(err).to.be(null);
    //     User.findById(id, function(err, node){
    //       expect(err).to.exist;
    //       done();
    //     });
    //   });
    // });
    it("should ignore update if find used", function(done){
      User.find({first: 'Jane'}, '', {update: {first: 'Jane2', last: 'Surname'}}, function(err, node){
        expect(err).to.be(null);
        expect(node[0].first).to.eql('Jane');
        expect(node[0].last).to.be.undefined;
        done();
      });
    });
    it("should ignore a remove if find used", function(done){
      User.find({first: 'Jane'}, '', {remove: {force:true}}, function(err, node){
        expect(err).to.be(null);
        expect(node[0].first).to.eql('Jane');
        done();
      });
    });
  });
});