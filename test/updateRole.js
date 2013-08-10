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

describe('update role', function(){
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
  describe("success", function(){
    it("should allow a role to be updated: with eventNodes", function(done){
      schedule1.getIncomingRelationships('HAS_SCHEDULE', '_ScheduleRole', function(err, results){
        role1 = results.nodes[0];
        var role = {
          name: 'Blue',
          id: role1._id
        };
        // pass through to index._createRole
        Schedule.updateRole(role, function(err, role){
          expect(err).to.not.be.ok();
          expect(role._doc.role).to.be.equal('Blue');
          schedule1.getIncomingRelationships('HAS_SCHEDULE', '_ScheduleRole', function(err, results){
            expect(results.nodes.length).to.be(1);
            expect(results.nodes[0]._doc.role).to.be.equal('Blue');
            schedule1.getOutgoingRelationships('LATEST_EVENT', '_ScheduleRoleUpdated', function(err, results){
              expect(results.nodes.length).to.be(1);
              done();
            });
          });
        });
      });
    });
    it("should allow a role to be updated: without eventNodes", function(done){
      var role = {
        name: 'Yellow',
        id: role1._id
      };
      var options = {
        eventNodes: false
      };
      // pass through to index._updateRole
      Schedule.updateRole(role, options, function(err, role){
        expect(err).to.not.be.ok();
        expect(role._doc.role).to.be.equal('Yellow');
        schedule1.getIncomingRelationships('HAS_SCHEDULE', '_ScheduleRole', function(err, results){
          expect(results.nodes.length).to.be(1);
          expect(results.nodes[0]._doc.role).to.be.equal('Yellow');
          schedule1.getIncomingRelationships('EVENT_SCHEDULE', function(err, results){
            expect(results.nodes.length).to.be(3);
            done();
          });
        });
      });
    });
  });
  describe("validations fail", function(){
    it("should fail with no role", function(done){
      Schedule.updateRole(function(err, role){
        expect(err).to.be.ok();
        expect(role).to.not.be.ok();
        done();
      });
    });
    it("should fail with no role:id", function(done){
      var role = {
        name: 'Admin'
      };
      Schedule.updateRole(role, function(err, role){
        expect(err).to.be.ok();
        expect(role).to.not.be.ok();
        done();
      });
    });
    it("should fail with no role:name", function(done){
      var role = {
        id: role1._id
      };
      Schedule.updateRole(role, function(err, role){
        expect(err).to.be.ok();
        expect(role).to.not.be.ok();
        done();
      });
    });
  });
});