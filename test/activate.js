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
  countActivities: {type: Number, default: 0},
  status: {type:String, default: 'Active'}
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

describe('activation/deactivation', function(){
  before(function(done){
    var query = 'start n=node(*) match n-[r?]->() where id(n) <> 0 delete r,n';
    var params = {};

    //wipe models and add new ones
    neoprene.models = {};
    neoprene.modelSchemas = {};
    User = neoprene.model('User', new Schema(userSchema));
    Activity = neoprene.model('Activity', new Schema({activityName:String}, {strict: false}));
    Schedule = neoprene.model('Schedule', new Schema({scheduleName:String, activityCount: Number, status: {type: String, default: 'Draft'}}));

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
            schedule1 = schedule;
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
  describe("success", function(){
    it("should allow a draft schedule to be activated: one role, with eventNodes", function(done){
      // pass through to index._createRole
      Schedule.activate(schedule1._id, user1._id, function(err, schedule){
        expect(err).to.not.be.ok();
        expect(schedule._doc.status).to.be.equal('Active');
        schedule1.getOutgoingRelationships('LATEST_EVENT', '_ScheduleUpdated', function(err, results){
          expect(results.nodes.length).to.be(1);

          expect(results.nodes[0]._doc.status_NEW).to.be('Active');
          expect(results.nodes[0]._doc.status_OLD).to.be('Draft');
          done();
        });
      });
    });
    it("should allow a schedule to be de-activated: one role, with eventNodes", function(done){
      // pass through to index._createRole
      Schedule.deactivate(schedule1._id, user1._id, function(err, schedule){
        expect(err).to.not.be.ok();
        expect(schedule._doc.status).to.be.equal('Inactive');
        schedule1.getOutgoingRelationships('LATEST_EVENT', '_ScheduleUpdated', function(err, results){
          expect(results.nodes.length).to.be(1);
          expect(results.nodes[0]._doc.status_NEW).to.be('Inactive');
          expect(results.nodes[0]._doc.status_OLD).to.be('Active');
          schedule1.getIncomingRelationships('HAS_SCHEDULE', '_ScheduleRole', function(err, results){
            expect(results.nodes.length).to.be(1);
            results.nodes[0].getIncomingRelationships(null, 'User', function(err, results2){
              expect(results2.nodes.length).to.be(1);
              expect(results2.rels[0]._type).to.be.equal('HAS_ROLE_IN_DEACTIVATED_SCHEDULE');
              schedule1.getIncomingRelationships('_MEMBER_OF', 'User', function(err, results){
                expect(results.nodes.length).to.be(0);
                done();
              });
            });
          });
        });
      });
    });
    it("should allow an inactive schedule to be re-activated: one role, with eventNodes", function(done){
      // pass through to index._createRole
      Schedule.activate(schedule1._id, user1._id, function(err, schedule){
        expect(err).to.not.be.ok();
        expect(schedule._doc.status).to.be.equal('Active');
        schedule1.getOutgoingRelationships('LATEST_EVENT', '_ScheduleUpdated', function(err, results){
          expect(results.nodes.length).to.be(1);
          expect(results.nodes[0]._doc.status_NEW).to.be('Active');
          expect(results.nodes[0]._doc.status_OLD).to.be('Inactive');
          schedule1.getIncomingRelationships('HAS_SCHEDULE', '_ScheduleRole', function(err, results){
            expect(results.nodes.length).to.be(1);
            results.nodes[0].getIncomingRelationships(null, 'User', function(err, results2){
              expect(results2.nodes.length).to.be(1);
              expect(results2.rels[0]._type).to.be.equal('HAS_ROLE_IN_SCHEDULE');
              schedule1.getIncomingRelationships('_MEMBER_OF', 'User', function(err, results){
                expect(results.nodes.length).to.be(1);
                done();
              });
            });
          });
        });
      });
    });
    it("should allow a schedule to be de-activated: one role, without eventNodes", function(done){
      var options = {
        eventNodes: false
      };
      // pass through to index._createRole
      Schedule.deactivate(schedule1._id, user1._id, options, function(err, schedule){
        expect(err).to.not.be.ok();
        expect(schedule._doc.status).to.be.equal('Inactive');
        schedule1.getIncomingRelationships('EVENT_SCHEDULE', '_ScheduleUpdated', function(err, results){
          expect(results.nodes.length).to.be(3);
          schedule1.getIncomingRelationships('HAS_SCHEDULE', '_ScheduleRole', function(err, results){
            expect(results.nodes.length).to.be(1);
            results.nodes[0].getIncomingRelationships(null, 'User', function(err, results2){
              expect(results2.nodes.length).to.be(1);
              expect(results2.rels[0]._type).to.be.equal('HAS_ROLE_IN_DEACTIVATED_SCHEDULE');
              schedule1.getIncomingRelationships('_MEMBER_OF', 'User', function(err, results){
                expect(results.nodes.length).to.be(0);
                done();
              });
            });
          });
        });
      });
    });
    it("should allow a schedule to be re-activated: one role, without eventNodes", function(done){
      var options = {
        eventNodes: false
      };
      // pass through to index._createRole
      Schedule.activate(schedule1._id, user1._id, options, function(err, schedule){
        expect(err).to.not.be.ok();
        expect(schedule._doc.status).to.be.equal('Active');
        schedule1.getIncomingRelationships('EVENT_SCHEDULE', '_ScheduleUpdated', function(err, results){
          expect(results.nodes.length).to.be(3);
          schedule1.getIncomingRelationships('HAS_SCHEDULE', '_ScheduleRole', function(err, results){
            expect(results.nodes.length).to.be(1);
            results.nodes[0].getIncomingRelationships(null, 'User', function(err, results2){
              expect(results2.nodes.length).to.be(1);
              expect(results2.rels[0]._type).to.be.equal('HAS_ROLE_IN_SCHEDULE');
              schedule1.getIncomingRelationships('_MEMBER_OF', 'User', function(err, results){
                expect(results.nodes.length).to.be(1);
                done();
              });
            });
          });
        });
      });
    });
  });
  describe("validations fail", function(){
    it("should fail activation with no schedule_id", function(done){
      Schedule.activate(user1._id, function(err, schedule){
        expect(err).to.be.ok();
        expect(schedule).to.not.be.ok();
        done();
      });
    });
    it("should fail deactivation with no schedule_id", function(done){
      Schedule.deactivate(user1._id, function(err, schedule){
        expect(err).to.be.ok();
        expect(schedule).to.not.be.ok();
        done();
      });
    });
    it("should fail activation with no user_id", function(done){
      Schedule.activate(schedule1._id, function(err, schedule){
        expect(err).to.be.ok();
        expect(schedule).to.not.be.ok();
        done();
      });
    });
    it("should fail deactivation with no user_id", function(done){
      Schedule.deactivate(schedule1._id, function(err, schedule){
        expect(err).to.be.ok();
        expect(schedule).to.not.be.ok();
        done();
      });
    });
  });
});