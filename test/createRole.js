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
  },{
    first: 'Jane',
    countSchedules: 5
  }
];
var user1 = {}
  , user2 = {}
  , schedule1 = {}
  , activity1 = {}
  , User
  , Schedule
  , Activity;

describe.only('create role', function(){
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
        expect(err).to.not.be.ok();
        user1 = user;
        expect(user.first).to.be.eql('John');
        User.create(userData[1], function(err, user){
          expect(err).to.not.be.ok();
          user2 = user;
          expect(user.first).to.be.eql('Jane');
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
            expect(err).to.not.be.ok();
            expect(schedule).to.be.ok();
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
              expect(err).to.not.be.ok();
              expect(activity).to.be.ok();
              done();
            });
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
      Model1.create({first: '  BIG  '}, function(err, model){
        expect(err).to.not.be.ok();
        expect(model).to.be.ok();
        Model1.update(model.toJSON(), {first: null}, function(err, model){
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
      Model2.create({email: '    MAIL@TEST.COM   '}, function(err, model){
        expect(err).to.not.be.ok();
        expect(model).to.be.ok();
        Model2.update(model.toJSON(), {email: '    MAILTEST.COM   '}, function(err, model){
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
      Model3.create({number: 30}, function(err, model){
        expect(err).to.not.be.ok();
        expect(model).to.be.ok();
        Model3.update(model.toJSON(), {number:51}, function(err, model2){
          expect(err).to.be.ok();
          expect(model2).to.not.be.ok();
          Model3.update(model.toJSON(), {number:0}, function(err, model3){
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
      Model4.create({gender: 'male'}, function(err, model){
        expect(err).to.not.be.ok();
        expect(model).to.be.ok();
        Model4.update(model.toJSON(), {gender: 'blue'}, function(err, model){
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
      Model5.create({gender: '  MALE  '}, function(err, model){
        expect(err).to.not.be.ok();
        expect(model).to.be.ok();
        Model5.update(model.toJSON(), {gender: 'blue'}, function(err, model){
          expect(err).to.be.ok();
          expect(model).to.not.be.ok();
          done();
        });
      });
    });
    it("should fail on duplicate unique indexes", function(done){
      var schema7 = new Schema({
        second: {type: String, index:{ unique: true}},
      });
      var Model7 = neoprene.model('Model7', schema7);
      Model7.create({second:'unique'}, function(err, model){
        expect(err).to.not.be.ok();
        expect(model.second).to.be.equal('unique');
        request
          .get(testURL + '/db/data/schema/index/Model7')
          .end(function(err, res){
            expect(err).to.not.be.ok();
            expect(res.body.length).to.be.equal(1);
            expect(res.body[0]['property-keys'].length).to.be(1);
            expect(res.body[0]['property-keys'][0]).to.be.equal('second');
            Model7.create({second:'unique2'}, function(err, model2){
              expect(err).to.not.be.ok();
              expect(model2).to.be.ok();
              console.log(model2)
              Model7.update(model2.toJSON(), {second:'unique'}, function(err, model3){
                expect(err).to.be.ok();
                expect(model).to.not.be.ok();
                request
                  .del(testURL + '/db/data/schema/index/Model7/second')
                  .end(function(err, res){
                    expect(res.status).to.be(204);
                    done();
                  });
              });
            });
          });
      });
    });
  });
  describe("validations pass", function(){
    it("should allow an update: user and relationship events", function(done){
      var updates = {
        name: 'Activity: user and relationship events'
      };

      var options = {
        eventNodes: {
          relationshipNode: {
            id: schedule1._id,
            type: 'Schedule'
          },
          user: true
        }
      };

      Activity.update(activity1.toJSON(), updates, options, function(err, activity){
        expect(activity.name).to.be.equal(updates.name);
        activity.getOutgoingRelationships(function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('LATEST_EVENT');
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.resl.length).to.be.equal(8);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('NEXT_USER')).to.not.be.equal(-1);
            expect(relTypes.indexOf('NEXT_SCHEDULE')).to.not.be.equal(-1);
            expect(relTypes.indexOf('NEXT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_USER')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_SCHEDULE')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(3);
            done();
          });
        });
      });
    });
    it("should allow an update: user events", function(done){
      var updates = {
        name: 'Activity: user events'
      };

      var options = {
        eventNodes: {
          user: true
        }
      };

      Activity.update(activity1.toJSON(), updates, options, function(err, activity){
        expect(activity.name).to.be.equal(updates.name);
        activity.getOutgoingRelationships(function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('LATEST_EVENT');
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.resl.length).to.be.equal(5);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('NEXT_USER')).to.not.be.equal(-1);
            expect(relTypes.indexOf('NEXT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_USER')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(2);
            done();
          });
        });
      });
    });
    it("should allow an update: relationship events", function(done){
      var updates = {
        name: 'Activity: relationship events'
      };

      var options = {
        eventNodes: {
          relationshipNode: {
            id: schedule1._id,
            type: 'Schedule'
          }
        }
      };

      Activity.update(activity1.toJSON(), updates, options, function(err, activity){
        expect(activity.name).to.be.equal(updates.name);
        activity.getOutgoingRelationships(function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('LATEST_EVENT');
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.resl.length).to.be.equal(5);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('NEXT_SCHEDULE')).to.not.be.equal(-1);
            expect(relTypes.indexOf('NEXT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_SCHEDULE')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(2);
            done();
          });
        });
      });
    });
    it("should allow an update: node events", function(done){
      var updates = {
        name: 'Activity: node events'
      };

      Activity.update(activity1.toJSON(), updates, function(err, activity){
        expect(activity.name).to.be.equal(updates.name);
        activity.getOutgoingRelationships(function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('LATEST_EVENT');
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.resl.length).to.be.equal(3);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('NEXT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(1);
            done();
          });
        });
      });
    });
    it("should allow an update: no events", function(done){
      var updates = {
        name: 'Activity: no events'
      };
      var options = {
        eventNodes: {
          node: false
        }
      }

      Activity.update(activity1.toJSON(), updates, options, function(err, activity){
        expect(activity.name).to.be.equal(updates.name);
        activity.getOutgoingRelationships(function(err, results){
          expect(results.rels.length).to.be.equal(1);
          expect(results.rels[0]._type).to.be.equal('LATEST_EVENT');
          results.nodes[0].getAllRelationships(function(err, results2){
            expect(results2.resl.length).to.be.equal(3);
            var relTypes = [];
            var counts = {};
            for(var i=0, len = results2.rels.length; i< len; i++){
              relTypes.push(results2.rels[i]._type);
              counts[results2.rels[i]._type] = counts[results2.rels[i]._type] ? counts[results2.rels[i]._type]+1 : 1;
            }
            expect(relTypes.indexOf('NEXT_ACTIVITY')).to.not.be.equal(-1);
            expect(relTypes.indexOf('EVENT_ACTIVITY')).to.not.be.equal(-1);
            expect(counts.LATEST_EVENT).to.be.equal(1);
            done();
          });
        });
      });
    });
  });
  describe("validations fail", function(){
    it("should fail with no updates", function(done){
      Activity.update(activity1.toJSON(), function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid relationship eventNode format", function(done){
      var updates = {
        name: 'Error'
      };
      var options = {
        eventNodes: {
          relationshipNode: true
        }
      };
      Activity.update(activity1.toJSON(), updates, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid relationship eventNode format: no type", function(done){
      var updates = {
        name: 'Error'
      };
      var options = {
        eventNodes: {
          relationshipNode: {
            id: schedule1._id
          }
        }
      };
      Activity.update(activity1.toJSON(), updates, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid relationship eventNode format: no id", function(done){
      var updates = {
        name: 'Error'
      };
      var options = {
        eventNodes: {
          relationshipNode: {
            type: 'Schedule'
          }
        }
      };
      Activity.update(activity1.toJSON(), updates, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid option: role", function(done){
      var updates = {
        name: 'Error'
      };
      var options = {
        role:true
      };
      Activity.update(activity1.toJSON(), updates, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid options: counters", function(done){
      var updates = {
        name: 'Error'
      };
      var options = {
        counters: true
      };
      Activity.update(activity1.toJSON(), updates, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid options: relationship", function(done){
      var updates = {
        name: 'Error'
      };
      var options = {
        relationship: true
      };
      Activity.update(activity1.toJSON(), updates, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
    it("should error on invalid relationship eventNode format: user with no user id", function(done){
      var updates = {
        name: 'Error'
      };
      var options = {
        eventNodes: {
          user: true
        }
      };
      Activity.update(activity1.toJSON(), updates, options, function(err, res){
        expect(err).to.be.ok();
        done();
      });
    });
  });
});