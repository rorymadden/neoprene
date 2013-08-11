'use strict';

var libpath = process.env['LIB_COV'] ? '../lib-cov' : '../lib';

var neoprene = require(libpath)
  , Schema = require(libpath + '/schema')
  , expect = require('expect.js')
  , request = require('superagent');

var testURL = 'http://localhost:7475';
neoprene.connect(testURL);

var userSchema = {
  first: {type: String},
  countSchedules: Number,
  countActivities: {type: Number, default: 0}
};

var userData = [{
    first: 'John',
    countSchedules: 1
  }
];
var user1 = {}
  , schedule1 = {}
  , activity1 = {}
  , User
  , Schedule
  , Activity;

describe('model update', function(){
  before(function(done){
    var query = 'start n=node(*) match n-[r?]->() where id(n) <> 0 delete r,n';
    var params = {};

    //wipe models and add new ones
    neoprene.models = {};
    neoprene.modelSchemas = {};
    User = neoprene.model('User', new Schema(userSchema));
    Activity = neoprene.model('Activity', new Schema({activityName:String}, {strict: false}));
    Schedule = neoprene.model('Schedule', new Schema({scheduleName:String, activityCount: Number}));

    neoprene.query(query, params, function(err, results) {
      User.create(userData[0], function(err, user){
        expect(err).to.not.exist;
        user1 = user;
        expect(user.first).to.be.eql('John');
        var options = {
          relationship: {
            nodeLabel: 'User',
            indexField: '_id',
            indexValue: user1._id,
            type: 'MEMBER',
            direction: 'to'
          },
          eventNodes: {
            user: true
          },
          counters: [{
            node: 'user',
            field: 'countSchedules'
          }],
          role :{
            roleOwner: 'user',
            name: 'Admin'
          }
        };
        Schedule.create({scheduleName: 'Schedule', activityCount: 0}, user1._id, options, function(err, schedule){
          schedule1 = schedule.node;
          expect(err).to.not.exist;
          expect(schedule).to.exist;
          var optionsA = {
            relationship: {
              nodeLabel: 'Schedule',
              indexField: '_id',
              indexValue: schedule1._id,
              type: 'CONTAINS',
              direction: 'to'
            },
            eventNodes: {
              relationshipNode: true,
              user: true
            },
            counters: [{
              node: 'relationshipNode',
              field: 'activityCount'
            }]
          };
          Activity.create({activityName: 'A1'}, user1._id, optionsA, function(err, activity){
            activity1 = activity.node;
            expect(err).to.not.exist;
            expect(activity).to.exist;
            done();
          });
        });
      });
    });
  });
  describe("validation fail", function(){
    it("should fail on required validation", function(done){
      var schema1 = new Schema({
        first: {type: String, required: true, lowercase: true, trim: true}
      });
      var Model1 = neoprene.model('Model1', schema1);
      Model1.create({first: '  BIG  '}, user1._id, function(err, model){
        expect(err).to.not.be.ok();
        expect(model).to.be.ok();
        model.update({first: null}, user1._id, function(err, model){
          expect(err).to.be.ok();
          expect(model).to.not.be.ok();
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
      Model2.create({email: '    MAIL@TEST.COM   '}, user1._id, function(err, model){
        expect(err).to.not.be.ok();
        expect(model).to.be.ok();
        model.update({email: '    MAILTEST.COM   '}, user1._id, function(err, model){
          expect(err).to.be.ok();
          expect(model).to.not.be.ok();
          done();
        });
      });
    });
    it("should fail on min/max number", function(done){
      var schema3 = new Schema({
        number: {type: Number, min: 1, max: 50}
      });
      var Model3 = neoprene.model('Model3', schema3);
      Model3.create({number: 30}, user1._id, function(err, model){
        expect(err).to.not.be.ok();
        expect(model).to.be.ok();
        model.update({number:51}, user1._id, function(err, model2){
          expect(err).to.be.ok();
          expect(model2).to.not.be.ok();
          model.update({number:0}, user1._id, function(err, model3){
            expect(err).to.be.ok();
            expect(model3).to.not.be.ok();
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
      Model4.create({gender: 'male'}, user1._id, function(err, model){
        expect(err).to.not.be.ok();
        expect(model).to.be.ok();
        model.update({gender: 'blue'}, user1._id, function(err, model){
          expect(err).to.be.ok();
          expect(model).to.not.be.ok();
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
      Model5.create({gender: '  MALE  '}, user1._id, function(err, model){
        expect(err).to.not.be.ok();
        expect(model).to.be.ok();
        model.update({gender: 'blue'}, user1._id, function(err, model){
          expect(err).to.be.ok();
          expect(model).to.not.be.ok();
          done();
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
    //     request
    //       .get(testURL + '/db/data/schema/index/Model7')
    //       .end(function(err, res){
    //         expect(err).to.not.be.ok();
    //         expect(res.body.length).to.be.equal(1);
    //         expect(res.body[0]['property-keys'].length).to.be(1);
    //         expect(res.body[0]['property-keys'][0]).to.be.equal('second');
    //         Model7.create({second:'unique2'}, user1._id, function(err, model2){
    //           expect(err).to.not.be.ok();
    //           expect(model2).to.be.ok();
    //           console.log(model2)
    //           model2.update({second:'unique'}, user1._id, function(err, model3){
    //             expect(err).to.be.ok();
    //             expect(model3).to.not.be.ok();
    //             var query = 'DROP CONSTRAINT ON (model:Model7) ASSERT model.second IS UNIQUE';
    //             neoprene.query(query, function(err){
    //               expect(err).to.not.be.ok();
    //               done();
    //             });
    //           });
    //         });
    //       });
    //   });
    // });
  });
  describe("validations pass", function(){
    it("should allow an update: user, node and relationship events", function(done){
      var updates = {
        activityName: 'Activity: user, node and relationship events'
      };

      var options = {
        eventNodes: {
          relationshipNode: {
            id: schedule1._id,
            type: 'Schedule'
          }
        }
      };

      activity1.update(updates, user1._id, options, function(err, activity){
        expect(activity.name).to.be.equal(updates.name);
        activity.getOutgoingRelationships(function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('LATEST_EVENT');
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.rels.length).to.be.equal(9);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_USER')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_SCHEDULE')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(3);
            expect(counts.NEXT).to.be.equal(3);
            done();
          });
        });
      });
    });
    it("should allow an update: node and user events", function(done){
      var updates = {
        activityName: 'Activity: node and user events'
      };

      activity1.update(updates, user1._id, function(err, activity){
        expect(activity.name).to.be.equal(updates.name);
        activity.getOutgoingRelationships(function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('LATEST_EVENT');
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.rels.length).to.be.equal(6);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_USER')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(2);
            expect(counts.NEXT).to.be.equal(2);
            done();
          });
        });
      });
    });
    it("should allow an update: relationship events", function(done){
      var updates = {
        activityName: 'Activity: node and relationship events'
      };

      var options = {
        eventNodes: {
          relationshipNode: {
            id: schedule1._id,
            type: 'Schedule'
          },
          user: false
        }
      };

      activity1.update(updates, user1._id, options, function(err, activity){
        expect(activity.name).to.be.equal(updates.name);
        activity.getOutgoingRelationships(function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('LATEST_EVENT');
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.rels.length).to.be.equal(6);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_SCHEDULE')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(2);
            expect(counts.NEXT).to.be.equal(2);
            done();
          });
        });
      });
    });
    it("should allow an update: node events", function(done){
      var updates = {
        activityName: 'Activity: node events'
      };

      var options = {
        eventNodes: {
          user: false
        }
      }

      activity1.update(updates, user1._id, options, function(err, activity){
        expect(activity.name).to.be.equal(updates.name);
        activity.getOutgoingRelationships(function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('LATEST_EVENT');
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.rels.length).to.be.equal(3);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('NEXT')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(1);
            expect(counts.NEXT).to.be.equal(1);
            done();
          });
        });
      });
    });
    it("should allow an update: no events", function(done){
      var updates = {
        activityName: 'Activity: no events'
      };
      var options = {
        eventNodes: {
          node: false,
          user: false
        }
      };

      activity1.update(updates, user1._id, options, function(err, activity){
        expect(activity.activityName).to.be.equal(updates.activityName);
        activity.getOutgoingRelationships(function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('LATEST_EVENT');
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.rels.length).to.be.equal(3);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('NEXT')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(1);
            expect(counts.NEXT).to.be.equal(1);
            done();
          });
        });
      });
    });
    it("should allow an update by id: user, node and relationship events", function(done){
      var updates = {
        activityName: 'Activity: user, node and relationship events'
      };

      var options = {
        eventNodes: {
          relationshipNode: {
            id: schedule1._id,
            type: 'Schedule'
          }
        }
      };

      Activity.findByIdAndUpdate(activity1._id, updates, user1._id, options, function(err, activity){
        expect(activity.name).to.be.equal(updates.name);
        activity.getOutgoingRelationships(function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('LATEST_EVENT');
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.rels.length).to.be.equal(9);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_USER')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_SCHEDULE')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(3);
            expect(counts.NEXT).to.be.equal(3);
            done();
          });
        });
      });
    });
  });
  describe("validations fail", function(){
    it("should fail with no updates", function(done){
      activity1.update(function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid relationship eventNode format", function(done){
      var updates = {
        activityName: 'Error'
      };
      var options = {
        eventNodes: {
          relationshipNode: true
        }
      };
      activity1.update(updates, user1._id, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid relationship eventNode format: no type", function(done){
      var updates = {
        activityName: 'Error'
      };
      var options = {
        eventNodes: {
          relationshipNode: {
            id: schedule1._id
          }
        }
      };
      activity1.update(updates, user1._id, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid relationship eventNode format: no id", function(done){
      var updates = {
        activityName: 'Error'
      };
      var options = {
        eventNodes: {
          relationshipNode: {
            type: 'Schedule'
          }
        }
      };
      activity1.update(updates, user1._id, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid option: role", function(done){
      var updates = {
        activityName: 'Error'
      };
      var options = {
        role:true
      };
      activity1.update(updates, user1._id, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid options: counters", function(done){
      var updates = {
        activityName: 'Error'
      };
      var options = {
        counters: true
      };
      activity1.update(updates, user1._id, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid options: relationship", function(done){
      var updates = {
        activityName: 'Error'
      };
      var options = {
        relationship: true
      };
      activity1.update(updates, user1._id, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid relationship eventNode format: user with no user id", function(done){
      var updates = {
        activityName: 'Error'
      };
      activity1.update(updates, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
  });
});