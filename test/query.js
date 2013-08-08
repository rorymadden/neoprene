// var libpath = process.env['LIB_COV'] ? '../lib-cov' : '../lib';

// var neoprene = require(libpath)
//   , Schema = require(libpath + '/schema')
//   , SchemaTypes = Schema.Types
//   , expect = require('expect.js')
//   , assert = require('assert')
//   , async = require('async')
//   , request = require('superagent');

// neoprene.connect('http://localhost:7475')

// var GENDER = ['unknown', 'male', 'female'];
// var emailRegEx = /^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/;
// var userSchema = {
//   first: {type: String, required: true, trim:true, index:true },
//   last: "string",
//   alias: [String],
//   email: {type: "string", required: true, trim:true, lowercase:true, index: { unique: true}, match: emailRegEx},
//   password: {type: String, trim:true, required: true},
//   gender: {type: String, trim:true, lowercase:true, default:'unknown', enum: GENDER},
//   active: {type: Boolean, default: false},
//   birthday: {type: Date, default: function(){
//     return new Date();
//   }},
//   countSchedules: {type: Number, min: 1, max: 100},
//   countActivities: {type: Number, min: 1, max: 100, default: 0},
//   mixed: {}
// };
// var Activity = neoprene.model('Activity', new Schema({activityName:String}));
// var Schedule = neoprene.model('Schedule', new Schema({scheduleName:String, activityCount: Number}));

// var userData = [{
//     first: 'John',
//     last: 'Doe',
//     alias: ['Johnny', 'Jon'],
//     email: 'mail@test.com',
//     password: 'password',
//     gender: 'male',
//     birthday: new Date(1980, 05, 16),
//     countSchedules: 1,
//     mixed: 'string'
//   },{
//     first: 'Jane',
//     last: 'Briggs',
//     alias: ['J', 'Briggsy'],
//     email: 'jane@test.com',
//     password: 'monkey',
//     gender: 'female',
//     active: true,
//     birthday: new Date(1975, 09, 6),
//     countSchedules: 1,
//     mixed: new Date()
//   }, {
//     first: 'Susan',
//     last: 'Doyle',
//     alias: 'Susie',
//     email: 'susan@test.com',
//     password: 'bluebird',
//     gender: 'female',
//     birthday: new Date(1955, 9, 17),
//     countSchedules: 37,
//     mixed: 12
//   }
// ];
// var UserTestSchema
//   , UserTest
//   , user1
//   , user2
//   , user3
//   , users = []
//   , rels = [];

// describe('model delete', function(){
//   it('should remove a single relationship', function(done){
//     user2.getAllRelationships(function(err, relationships){
//       var id = relationships.rels[0]._id;
//       expect(err).to.be(null);
//       relationships.rels[0].del(function(err){
//         neoprene.findRelationshipById(id, function(err, rel){
//           expect(err).to.not.be(null);
//           expect(rel).to.be(null);
//           done();
//         });
//       });
//     });
//   });
//   it('should remove a node with no relationships', function(done){
//     var id = user2._id;
//     user2.del(function(err){
//       expect(err).to.be(null);
//       UserTest.findById(id, function(err, node){
//         expect(err).to.not.be(null);
//         expect(node).to.not.exist;
//         done();
//       });
//     });
//   });
//   it('should fail to remove a node with relationships', function(done){
//     var id = user1._id;
//     user1.del(function(err){
//       expect(err).to.not.be(null);
//       UserTest.findById(id, function(err, node){
//         expect(err).to.be(null);
//         expect(node).to.be.an('object');
//         done();
//       });
//     });
//   });
//   it('should remove a node with multiple relationships - force', function(done){
//     var id = user1._id;
//     user1.del(true, function(err){
//       expect(err).to.be(null);
//       UserTest.findById(id, function(err, node){
//         expect(err).to.not.be(null);
//         expect(node).to.not.exist;
//         done();
//       });
//     });
//   });
//   it('should remove a node with multiple relationships', function(done){
//     var id = user3._id;
//     user3.del(true, function(err){
//       expect(err).to.be(null);
//       UserTest.findById(id, function(err, node){
//         expect(err).to.not.be(null);
//         expect(node).to.not.exist;
//         done();
//       });
//     });
//   });
//   it('should remove a node index', function(done){
//     var url = 'http://localhost:7475/db/data/schema/index/UserTest/last';
//     request
//       .del(url)
//       .end(function(res) {
//         expect(res.status).to.be.equal(204);
//         done();
//       });
//   });
//   it('should remove an automated node index', function(done){
//     var url = 'http://localhost:7475/db/data/schema/index/UserTest/first';
//     request
//       .del(url)
//       .end(function(res) {
//         expect(res.status).to.be.equal(204);
//         done();
//       });
//   });
//   it('should remove a relationship index', function(done){
//     var url = 'http://localhost:7475/db/data/schema/index/likes/tip';
//     request
//       .del(url)
//       .end(function(res) {
//         expect(res.status).to.be.equal(204);
//         done();
//       });
//   });
// });