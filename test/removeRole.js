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
  , role1
  , User
  , Schedule
  , Activity;

describe('remove role', function(){
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
            // relationship: {
            //   nodeLabel: 'User',
            //   indexField: '_id',
            //   indexValue: user1._id,
            //   type: 'MEMBER_OF',
            //   direction: 'to'
            // },
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
  describe("success", function(){
    it("should allow a role to be removed: with eventNodes", function(done){
      schedule1.getIncomingRelationships('HAS_SCHEDULE', '_ScheduleRole', function(err, results){
        role1 = results.nodes[0];
        // pass through to index._createRole
        Schedule.removeRole(role1._id, function(err){
          expect(err).to.not.be.ok();
          schedule1.getIncomingRelationships('HAS_SCHEDULE', '_ScheduleRole', function(err, results){
            expect(results.nodes.length).to.be(0);
            schedule1.getOutgoingRelationships('LATEST_EVENT', '_ScheduleRoleRemoved', function(err, results){
              expect(results.nodes.length).to.be(1);
              Schedule.findById(role1._id, function(err, role){
                expect(err).to.be.ok();
                expect(role).to.not.be.ok();
                done();
              });
            });
          });
        });
      });
    });
    it("should allow a role to be removed: without eventNodes", function(done){
      var role = {
        name: 'Yellow',
        user: user2._id,
        other: schedule1._id
      };
      var options = {
        eventNodes: false
      };
      // pass through to index._createRole
      Schedule.createRole(role, options, function(err, role){
        role1 = role;
        expect(err).to.not.be.ok();
        expect(role._doc.role).to.be.equal('Yellow');
        Schedule.removeRole(role1._id, options, function(err){
          expect(err).to.not.be.ok();
          schedule1.getIncomingRelationships('HAS_SCHEDULE', '_ScheduleRole', function(err, results){
            expect(results.nodes.length).to.be(0);
            schedule1.getOutgoingRelationships('LATEST_EVENT', '_ScheduleRoleRemoved', function(err, results){
              expect(results.nodes.length).to.be(1);
              Schedule.findById(role._id, function(err, role){
                expect(err).to.be.ok();
                expect(role).to.not.be.ok();
                done();
              });
            });
          });
        });
      });
    });
  });
  describe("validations fail", function(){
    it("should fail with no role", function(done){
      Schedule.removeRole(function(err, role){
        expect(err).to.be.ok();
        expect(role).to.not.be.ok();
        done();
      });
    });
  });
});