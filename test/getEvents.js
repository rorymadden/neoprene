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

describe('get events', function(){
  before(function(done){
    var query = 'start n=node(*) match n-[r?]->() where id(n) <> 0 delete r,n';
    var params = {};

    //wipe models and add new ones
    neoprene.models = {};
    neoprene.modelSchemas = {};
    User = neoprene.model('User', new Schema(userSchema));
    Activity = neoprene.model('Activity', new Schema({activityName:String}, {strict: false}));
    Schedule = neoprene.model('Schedule', new Schema({scheduleName:String, activityCount: Number, status: {type: String, default: 'Draft'}}));

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
  describe("user -> schedule -> activity", function(){
    it("should get events for a user", function(done){
      User.getEvents(user1._id, function(err, events){
        expect(err).to.not.be.ok();
        expect(events.length).to.be(3);
        done();
      });
    });
    it("should get events for a schedule", function(done){
      Schedule.getEvents(schedule1._id, function(err, events){
        expect(err).to.not.be.ok();
        expect(events.length).to.be(2);
        done();
      });
    });
    it("should get events for an activity", function(done){
      Activity.getEvents(activity1._id, function(err, events){
        expect(err).to.not.be.ok();
        expect(events.length).to.be(1);
        done();
      });
    });
  });
  describe("multiple user changes", function(){
    before(function(done){
      schedule1.update({scheduleName: 'new'}, user2._id, function(err, schedule){
        expect(err).to.not.be.ok();
        schedule1.update({scheduleName: 'old'}, user1._id, function(err, schedule){
          expect(err).to.not.be.ok();
          done();
        });
      });
    });
    it("should get events for a user", function(done){
      User.getEvents(user1._id, function(err, events){
        expect(err).to.not.be.ok();
        expect(events.length).to.be(4);
        done();
      });
    });
    it("should get events for a schedule", function(done){
      Schedule.getEvents(schedule1._id, function(err, events){
        expect(err).to.not.be.ok();
        expect(events.length).to.be(4);
        done();
      });
    });
    it("should get events for a second user", function(done){
      User.getEvents(user2._id, function(err, events){
        expect(err).to.not.be.ok();
        expect(events.length).to.be(2);
        done();
      });
    });
  });
  describe("user-> user relationship", function(){
    before(function(done){
      user1.createRelationshipTo({node:user2, type: 'FRIEND'}, function(err, rel){
        expect(err).to.not.be.ok();
        done();
      });
    });
    it("should get events for a user", function(done){
      User.getEvents(user1._id, function(err, events){
        expect(err).to.not.be.ok();
        expect(events.length).to.be(5);
        done();
      });
    });
    it("should get events for second user", function(done){
      User.getEvents(user2._id, function(err, events){
        expect(err).to.not.be.ok();
        expect(events.length).to.be(3);
        done();
      });
    });
  });
  describe("options", function(){
    it("should allow the input of an offset", function(done){
      User.getEvents(user1._id, {offset:2}, function(err, events){
        expect(err).to.not.be.ok();
        expect(events.length).to.be(3);
        done();
      });
    });
    it("should allow the input of a numRecords", function(done){
      User.getEvents(user1._id, {numRecords:2}, function(err, events){
        expect(err).to.not.be.ok();
        expect(events.length).to.be(2);
        done();
      });
    });
    it("should allow the input of an offset and numRecords", function(done){
      User.getEvents(user1._id, {offset: 1, numRecords:2}, function(err, events){
        console.log()
        expect(err).to.not.be.ok();
        expect(events.length).to.be(2);
        done();
      });
    });
  });
  describe("validations fail", function(){
    it("should fail get events with no id", function(done){
      User.getEvents(function(err, events){
        expect(err).to.be.ok();
        expect(events).to.not.be.ok();
        done();
      });
    });
  });
});