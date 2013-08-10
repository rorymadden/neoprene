var libpath = process.env['LIB_COV'] ? '../lib-cov' : '../lib';

var neoprene = require(libpath)
  , Model = require(libpath + '/model')
  , Schema = require(libpath + '/schema')
  , GraphObject = require(libpath + '/graphObject')
  , VirtualType = require(libpath + '/virtualtype')
  , SchemaTypes = Schema.Types
  , Mixed = SchemaTypes.Mixed
  , NeopreneArray = require(libpath + '/types/array')
  , ValidationError = require(libpath + '/errors/validation')
  , ValidatorError = require(libpath + '/errors/validator')
  , CastError = require(libpath + '/errors/cast')
  , db = neoprene.connect('http://localhost:7475')
  , expect = require('expect.js')
  , assert = require('assert')
  , async = require('async')
  , request = require('superagent');

var GENDER = ['unknown', 'male', 'female'];
var emailRegEx = /^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/;
var userSchema = {
  first: {type: String, required: true, trim:true },
  last: "string",
  email: {type: "string", required: true, trim:true, lowercase:true, index: { unique: true}, match: emailRegEx},
  password: {type: String, required: true, min: 6, max: 10},
  gender: {type: String, trim:true, lowercase:true, default:'unknown', enum: GENDER},
  active: {type: Boolean, default: false},
  birthday: {type: Date, default: function(){
    return new Date();
  }},
  number: Number,
  mixed: {}
};

/**
 * Test Document constructor.
 */

function TestDocument () {
  GraphObject.apply(this, arguments);
};

/**
 * Inherits from Document.
 */

TestDocument.prototype.__proto__ = GraphObject.prototype;

/**
 * Set a dummy schema to simulate compilation.
 */

TestDocument.prototype._setSchema(new Schema({
    test    : String
}));

var UserSchema;

describe('schemas', function(){
  it('should create a schema', function(done){
    var simpleSchema = new Schema({name: String});
    expect(simpleSchema instanceof Schema).to.be.ok();
    done();
  });
  it('should create a more complex schema', function(done){
    UserSchema = new Schema(userSchema);
    expect(UserSchema instanceof Schema).to.be.ok();
    expect(UserSchema.path('first') instanceof SchemaTypes.String);
    expect(UserSchema.path('last') instanceof SchemaTypes.String);
    expect(UserSchema.path('email') instanceof SchemaTypes.String);
    expect(UserSchema.path('password') instanceof SchemaTypes.String);
    expect(UserSchema.path('gender') instanceof SchemaTypes.String);
    expect(UserSchema.path('birthday') instanceof SchemaTypes.Date);
    expect(UserSchema.path('number') instanceof SchemaTypes.Number);
    expect(UserSchema.path('mixed') instanceof SchemaTypes.Mixed);
    expect(UserSchema.path('active') instanceof SchemaTypes.Boolean);

    assert.strictEqual(UserSchema.path('unexistent'), undefined);

    done();
  });
  it('should default values', function(done){
    expect(UserSchema.path('gender').defaultValue).to.be.eql('unknown');
    expect(UserSchema.path('active').defaultValue).to.not.be.ok();
    expect(UserSchema.path('birthday').defaultValue).to.be.a('function');
    expect(UserSchema.path('gender').getDefault()).to.be.eql('unknown');
    expect(UserSchema.path('active').getDefault()).to.not.be.ok();
    expect(new Date(UserSchema.path('birthday').getDefault())).to.be.a(Date);
    done();
  });
  it('supports different schematypes', function(){

    var Ferret = new Schema({
        name      : String
      , fur       : String
      , color     : { type: String }
      , age       : Number
      , likes     : Array
      , alive     : Boolean
      , extra     : Mixed
    });

    assert.ok(Ferret.path('name') instanceof SchemaTypes.String);
    assert.ok(Ferret.path('fur') instanceof SchemaTypes.String);
    assert.ok(Ferret.path('color') instanceof SchemaTypes.String);
    assert.ok(Ferret.path('age') instanceof SchemaTypes.Number);
    assert.ok(Ferret.path('likes') instanceof SchemaTypes.Array);
    assert.ok(Ferret.path('alive') instanceof SchemaTypes.Boolean);
    assert.ok(Ferret.path('extra') instanceof SchemaTypes.Mixed);

    assert.strictEqual(Ferret.path('unexistent'), undefined);

    var Ferret1 = new Schema({
        name      : "string"
      , fur       : { type: "string" }
      , color     : { type: "String" }
      , friends   : Array
      , likes     : "array"
      , alive     : "Bool"
      , alive1    : "bool"
      , alive2    : "boolean"
      , extra     : "mixed"
      , obj       : "object"
    });

    assert.ok(Ferret1.path('name') instanceof SchemaTypes.String);
    assert.ok(Ferret1.path('fur') instanceof SchemaTypes.String);
    assert.ok(Ferret1.path('color') instanceof SchemaTypes.String);
    assert.ok(Ferret1.path('friends') instanceof SchemaTypes.Array);
    assert.ok(Ferret1.path('likes') instanceof SchemaTypes.Array);
    assert.ok(Ferret1.path('alive') instanceof SchemaTypes.Boolean);
    assert.ok(Ferret1.path('alive1') instanceof SchemaTypes.Boolean);
    assert.ok(Ferret1.path('alive2') instanceof SchemaTypes.Boolean);
    assert.ok(Ferret1.path('extra') instanceof SchemaTypes.Mixed);
    assert.ok(Ferret1.path('obj') instanceof SchemaTypes.Mixed);
  });

  it('default definition', function(){
    var Test = new Schema({
        simple    : { type: String, default: 'a' }
      , array     : { type: Array, default: [1,2,3,4,5] }
      , arrayX    : { type: Array, default: 9 }
      , arrayFn   : { type: Array, default: function () { return [8] } }
      , callback  : { type: Number, default: function(){
          assert.equal('b', this.a);
          return '3';
        }}
    });


    assert.equal(Test.path('simple').defaultValue, 'a');
    assert.equal(typeof Test.path('callback').defaultValue, 'function');

    assert.equal(Test.path('simple').getDefault(), 'a');
    assert.equal((+Test.path('callback').getDefault({ a: 'b' })), 3);
    assert.equal(typeof Test.path('array').defaultValue, 'function');
    assert.equal(Test.path('array').getDefault(new TestDocument)[3], 4);
    assert.equal(Test.path('arrayX').getDefault(new TestDocument)[0], 9);
    assert.equal(typeof Test.path('arrayFn').defaultValue, 'function');
    assert.ok(Test.path('arrayFn').getDefault(new TestDocument) instanceof NeopreneArray);
  })

  it('Mixed defaults can be empty arrays', function(){
    var Test = new Schema({
        mixed1    : { type: Mixed, default: [] }
      , mixed2    : { type: Mixed, default: Array }
    });

    assert.ok(Test.path('mixed1').getDefault() instanceof Array);
    assert.equal(Test.path('mixed1').getDefault().length, 0);
    assert.ok(Test.path('mixed2').getDefault() instanceof Array);
    assert.equal(Test.path('mixed2').getDefault().length, 0);
  });
  describe('validation', function(){
    it('invalid arguments are rejected (1044)', function(){
      assert.throws(function () {
        new Schema({
            simple: { type: String, validate: 'nope' }
        });
      }, /Invalid validator/);

      assert.throws(function () {
        new Schema({
            simple: { type: String, validate: ['nope'] }
        });
      }, /Invalid validator/);

      assert.throws(function () {
        new Schema({
          simple: { type: String, validate: { nope: 1, msg: 'nope' } }
        });
      }, /Invalid validator/);

      assert.throws(function () {
        new Schema({
          simple: { type: String, validate: [{ nope: 1, msg: 'nope' }, 'nope'] }
        });
      }, /Invalid validator/);
    })

    it('string required', function(){
      var Test = new Schema({
          simple: String
      });

      Test.path('simple').required(true);
      assert.equal(Test.path('simple').validators.length, 1);

      Test.path('simple').doValidate(null, function(err){
        assert.ok(err instanceof ValidatorError);
      });

      Test.path('simple').doValidate(undefined, function(err){
        assert.ok(err instanceof ValidatorError);
      });

      Test.path('simple').doValidate('', function(err){
        assert.ok(err instanceof ValidatorError);
      });

      Test.path('simple').doValidate('woot', function(err){
        assert.ifError(err);
      });
    });

    it('string enum', function(){
      var Test = new Schema({
          complex: { type: String, enum: ['a', 'b', undefined, 'c', null] }
      });

      assert.ok(Test.path('complex') instanceof SchemaTypes.String);
      assert.deepEqual(Test.path('complex').enumValues,['a', 'b', 'c', null]);
      assert.equal(Test.path('complex').validators.length, 1)

      Test.path('complex').enum('d', 'e');

      assert.deepEqual(Test.path('complex').enumValues, ['a', 'b', 'c', null, 'd', 'e']);

      Test.path('complex').doValidate('x', function(err){
        assert.ok(err instanceof ValidatorError);
      });

      // allow unsetting enums
      Test.path('complex').doValidate(undefined, function(err){
        assert.ifError(err);
      });

      Test.path('complex').doValidate(null, function(err){
        assert.ifError(err);
      });

      Test.path('complex').doValidate('da', function(err){
        assert.ok(err instanceof ValidatorError);
      })
    })

    it('string regexp', function(){
      var Test = new Schema({
          simple: { type: String, match: /[a-z]/ }
      });

      assert.equal(1, Test.path('simple').validators.length);

      Test.path('simple').doValidate('az', function(err){
        assert.ifError(err);
      });

      Test.path('simple').match(/[0-9]/);
      assert.equal(2, Test.path('simple').validators.length);

      Test.path('simple').doValidate('12', function(err){
        assert.ok(err instanceof ValidatorError);
      });

      Test.path('simple').doValidate('a12', function(err){
        assert.ifError(err);
      });

      Test.path('simple').doValidate('', function(err){
        assert.ifError(err);
      });
      Test.path('simple').doValidate(null, function(err){
        assert.ifError(err);
      });
      Test.path('simple').doValidate(undefined, function(err){
        assert.ifError(err);
      });
      Test.path('simple').validators = [];
      Test.path('simple').match(/[1-9]/);
      Test.path('simple').doValidate(0, function(err){
        assert.ok(err instanceof ValidatorError);
      });
    })

    it('number min and max', function(){
      var Tobi = new Schema({
          friends: { type: Number, max: 15, min: 5 }
      });

      assert.equal(Tobi.path('friends').validators.length, 2);

      Tobi.path('friends').doValidate(10, function(err){
        assert.ifError(err);
      });

      Tobi.path('friends').doValidate(100, function(err){
        assert.ok(err instanceof ValidatorError);
      });

      Tobi.path('friends').doValidate(1, function(err){
        assert.ok(err instanceof ValidatorError);
      });

      // null is allowed
      Tobi.path('friends').doValidate(null, function(err){
        assert.ifError(err);
      });
    });

    it('number required', function(){
      var Edwald = new Schema({
          friends: { type: Number, required: true }
      });

      Edwald.path('friends').doValidate(null, function(err){
        assert.ok(err instanceof ValidatorError);
      });

      Edwald.path('friends').doValidate(undefined, function(err){
        assert.ok(err instanceof ValidatorError);
      });

      Edwald.path('friends').doValidate(0, function(err){
        assert.ifError(err);
      });
    })

    it('date required', function(){
      var Loki = new Schema({
          birth_date: { type: Date, required: true }
      });

      Loki.path('birth_date').doValidate(null, function (err) {
        assert.ok(err instanceof ValidatorError);
      });

      Loki.path('birth_date').doValidate(undefined, function (err) {
        assert.ok(err instanceof ValidatorError);
      });

      Loki.path('birth_date').doValidate(new Date(), function (err) {
        assert.ifError(err);
      });
    });

    it('boolean required', function(){
      var Animal = new Schema({
          isFerret: { type: Boolean, required: true }
      });

      Animal.path('isFerret').doValidate(null, function(err){
        assert.ok(err instanceof ValidatorError);
      });

      Animal.path('isFerret').doValidate(undefined, function(err){
        assert.ok(err instanceof ValidatorError);
      });

      Animal.path('isFerret').doValidate(true, function(err){
        assert.ifError(err);
      });

      Animal.path('isFerret').doValidate(false, function(err){
        assert.ifError(err);
      });
    });
    describe('async', function(){
      it('works', function(done){
        var executed = 0;

        function validator (value, fn) {
          setTimeout(function(){
            executed++;
            fn(value === true);
            if (2 === executed) done();
          }, 5);
        };

        var Animal = new Schema({
            ferret: { type: Boolean, validate: validator }
        });

        Animal.path('ferret').doValidate(true, function(err){
          assert.ifError(err);
        });

        Animal.path('ferret').doValidate(false, function(err){
          assert.ok(err instanceof Error);
        });
      });

      it('multiple', function(done) {
        var executed = 0;

        function validator (value, fn) {
          setTimeout(function(){
            executed++;
            fn(value === true);
            if (2 === executed) done();
          }, 5);
        };

        var Animal = new Schema({
          ferret: {
            type: Boolean,
            validate: [
              {
                'validator': validator,
                'msg': 'validator1'
              },
              {
                'validator': validator,
                'msg': 'validator2'
              },
            ],
          }
        });

        Animal.path('ferret').doValidate(true, function(err){
          assert.ifError(err);
        });
      });

      it('scope', function(done){
        var called = false;
        function validator (value, fn) {
          assert.equal('b', this.a);

          setTimeout(function(){
            called = true;
            fn(true);
          }, 5);
        }

        var Animal = new Schema({
            ferret: { type: Boolean, validate: validator }
        });

        Animal.path('ferret').doValidate(true, function(err){
          assert.ifError(err);
          assert.equal(true, called);
          done();
        }, { a: 'b' });
      });
    });
  });

  describe('casting', function(){
    it('number', function(){
      var Tobi = new Schema({
          age: Number
      });

      // test String -> Number cast
      assert.equal('number', typeof Tobi.path('age').cast('0'));
      assert.equal(0, (+Tobi.path('age').cast('0')));

      assert.equal('number', typeof Tobi.path('age').cast(0));
      assert.equal(0, (+Tobi.path('age').cast(0)));
    });

    describe('string', function(){
      it('works', function(){
        var Tobi = new Schema({
            nickname: String
        });

        function Test(){};
        Test.prototype.toString = function(){
          return 'woot';
        };

        // test Number -> String cast
        assert.equal('string', typeof Tobi.path('nickname').cast(0));
        assert.equal('0', Tobi.path('nickname').cast(0));

        // test any object that implements toString
        assert.equal('string', typeof Tobi.path('nickname').cast(new Test));
        assert.equal('woot', Tobi.path('nickname').cast(new Test));
      });
      // it('casts undefined to "undefined"', function(done){
      //   var db= require('./common')();
      //   var schema = new Schema({ arr: [String] });
      //   var M = db.model('castingStringArrayWithUndefined', schema);
      //   M.find({ arr: { $in: [undefined] }}, function (err) {
      //     db.close();
      //     assert.equal(err && err.message, 'Cast to string failed for value "undefined"');
      //     done();
      //   });
      // });
    });

    it('date', function(){
      var Loki = new Schema({
          birth_date: { type: Date }
      });

      assert.ok(new Date(Loki.path('birth_date').cast(1294525628301)) instanceof Date);
      assert.ok(new Date(Loki.path('birth_date').cast('8/24/2000')) instanceof Date);
      assert.ok(new Date(Loki.path('birth_date').cast(new Date)) instanceof Date);
    });

    it('boolean', function(){
      var Animal = new Schema({
          isFerret: { type: Boolean, required: true }
      });

      assert.strictEqual(Animal.path('isFerret').cast(null), null);
      assert.equal(false, Animal.path('isFerret').cast(undefined));
      assert.equal(false, Animal.path('isFerret').cast(false));
      assert.equal(false, Animal.path('isFerret').cast(0));
      assert.equal(false, Animal.path('isFerret').cast('0'));
      assert.equal(true, Animal.path('isFerret').cast({}));
      assert.equal(true, Animal.path('isFerret').cast(true));
      assert.equal(true, Animal.path('isFerret').cast(1));
      assert.equal(true, Animal.path('isFerret').cast('1'));
    });
  });
  it('methods declaration', function(){
    var a = new Schema;
    a.method('test', function(){});
    a.method({
        a: function(){}
      , b: function(){}
    });
    assert.equal(3, Object.keys(a.methods).length);
  });

  it('static declaration', function(){
    var a = new Schema;
    a.static('test', function(){});
    a.static({
        a: function(){}
      , b: function(){}
      , c: function(){}
    });

    assert.equal(Object.keys(a.statics).length, 4)
  });

  describe('setters', function(){
    it('work', function(){
      function lowercase (v) {
        return v.toLowerCase();
      };

      var Tobi = new Schema({
          name: { type: String, set: lowercase }
      });

      assert.equal('woot', Tobi.path('name').applySetters('WOOT'));
      assert.equal(1, Tobi.path('name').setters.length);

      Tobi.path('name').set(function(v){
        return v + 'WOOT';
      });

      assert.equal('wootwoot', Tobi.path('name').applySetters('WOOT'));
      assert.equal(2, Tobi.path('name').setters.length);
    });

    // it('order', function(){
    //   function extract (v, self) {
    //     return (v && v._id)
    //       ? v._id
    //       : v
    //   };

    //   var Tobi = new Schema({
    //       name: { type: Schema.ObjectId, set: extract }
    //   });

    //   var id = new DocumentObjectId
    //     , sid = id.toString()
    //     , _id = { _id: id };

    //   assert.equal(Tobi.path('name').applySetters(sid, { a: 'b' }).toString(),sid);
    //   assert.equal(Tobi.path('name').applySetters(_id, { a: 'b' }).toString(),sid);
    //   assert.equal(Tobi.path('name').applySetters(id, { a: 'b' }).toString(),sid);
    // });

    it('scope', function(){
      function lowercase (v, self) {
        assert.equal('b', this.a);
        assert.equal('name', self.path);
        return v.toLowerCase();
      };

      var Tobi = new Schema({
          name: { type: String, set: lowercase }
      });

      assert.equal('what', Tobi.path('name').applySetters('WHAT', { a: 'b' }));
    });

    it('casting', function(){
      function last (v) {
        assert.equal('number', typeof v);
        assert.equal(0, v);
        return 'last';
      };

      function first (v) {
        return 0;
      };

      var Tobi = new Schema({
          name: { type: String, set: last }
      });

      Tobi.path('name').set(first);
      assert.equal('last', Tobi.path('name').applySetters('woot'));
    });

    describe('string', function(){
      it('lowercase', function(){
        var Tobi = new Schema({
            name: { type: String, lowercase: true }
        });

        assert.equal('what', Tobi.path('name').applySetters('WHAT'));
      });
      it('uppercase', function(){
        var Tobi = new Schema({
            name: { type: String, uppercase: true }
        });

        assert.equal('WHAT', Tobi.path('name').applySetters('what'));
      });
      it('trim', function(){
        var Tobi = new Schema({
            name: { type: String, uppercase: true, trim: true }
        });

        assert.equal('WHAT', Tobi.path('name').applySetters('  what   '));
      });
    });

    it('applying when none have been defined', function(){
      var Tobi = new Schema({
          name: String
      });

      assert.equal('woot', Tobi.path('name').applySetters('woot'));
    });

    it('assignment of non-functions throw', function(){
      var schema = new Schema({ fun: String });
      var g, s;

      try {
        schema.path('fun').set(4);
      } catch (err_) {
        g = err_;
      }

      assert.ok(g);
      assert.equal(g.message,'A setter must be a function.');
    })
  });

  describe('getters', function(){
    it('work', function(){
      function woot (v) {
        return v + ' woot';
      };

      var Tobi = new Schema({
          name: { type: String, get: woot }
      });

      assert.equal(1, Tobi.path('name').getters.length);
      assert.equal('test woot', Tobi.path('name').applyGetters('test'));
    });
    it('order', function(){
      function format (v, self) {
        return v
          ? '$' + v
          : v
      };

      var Tobi = new Schema({
          name: { type: Number, get: format }
      });

      assert.equal('$30', Tobi.path('name').applyGetters(30, { a: 'b' }));
    });
    it('scope', function(){
      function woot (v, self) {
        assert.equal('b', this.a);
        assert.equal('name', self.path);
        return v.toLowerCase();
      };

      var Tobi = new Schema({
          name: { type: String, get: woot }
      });

      assert.equal('yep', Tobi.path('name').applyGetters('YEP', { a: 'b' }));
    });
    it('casting', function(){
      function last (v) {
        assert.equal('number', typeof v);
        assert.equal(0, v);
        return 'last';
      };

      function first (v) {
        return 0;
      };

      var Tobi = new Schema({
          name: { type: String, get: last }
      });

      Tobi.path('name').get(first);
      assert.equal('last', Tobi.path('name').applyGetters('woot'));
    });
    it('applying when none have been defined', function(){
      var Tobi = new Schema({
          name: String
      });

      assert.equal('woot', Tobi.path('name').applyGetters('woot'));
    });
    it('assignment of non-functions throw', function(){
      var schema = new Schema({ fun: String });
      var g, s;

      try {
        schema.path('fun').get(true);
      } catch (err_) {
        g = err_;
      }

      assert.ok(g);
      assert.equal(g.message,'A getter must be a function.');
    });
  });

  describe('hooks', function(){
    it('registration', function(){
      var Tobi = new Schema();

      Tobi.pre('save', function(){});
      assert.equal(1, Tobi.callQueue.length);

      Tobi.post('save', function(){});
      assert.equal(2, Tobi.callQueue.length);

      Tobi.pre('save', function(){});
      assert.equal(3, Tobi.callQueue.length);
    });
  });
  it('properly handles specifying index in combination with unique', function(){
    var s = new Schema({ name: { type: String, index: true, unique: true }});
    assert.deepEqual(s.path('name')._index, { unique: true });
    var s = new Schema({ name: { type: String, index: true }});
    assert.deepEqual(s.path('name')._index, true);
    var s = new Schema({ name: { type: String, unique: true, index: true }});
    assert.deepEqual(s.path('name')._index, { unique: true });
    var s = new Schema({ name: { type: String, index: { unique: true }}});
    assert.deepEqual(s.path('name')._index, { unique: true });
  })
  // describe('indexes', function(){
  //   describe('definition', function(){
  //     it('basic', function(){
  //       var Tobi = new Schema({
  //           name: { type: String, index: true }
  //       });

  //       assert.equal(true, Tobi.path('name')._index);
  //       Tobi.path('name').index({ unique: true });
  //       assert.deepEqual(Tobi.path('name')._index, { unique: true });
  //       Tobi.path('name').unique(false);
  //       assert.deepEqual(Tobi.path('name')._index, { unique: false });

  //       var T, i;

  //       T = new Schema({
  //           name: { type: String, sparse: true }
  //       });
  //       assert.deepEqual(T.path('name')._index, { sparse: true });

  //       T = new Schema({
  //           name: { type: String, unique: true }
  //       });
  //       assert.deepEqual(T.path('name')._index, { unique: true });

  //       T = new Schema({
  //           name: { type: String, expires:  '1.5m' }
  //       });
  //       assert.deepEqual(T.path('name')._index, { expiresAfterSeconds: 90 });

  //       T = new Schema({
  //           name: { type: String, expires:  200 }
  //       });
  //       assert.deepEqual(T.path('name')._index, { expiresAfterSeconds: 200 });

  //       T = new Schema({
  //           name: { type: String, sparse: true, unique: true }
  //       });
  //       assert.deepEqual(T.path('name')._index, { sparse: true, unique: true });

  //       T = new Schema({
  //           name: { type: String, unique: true, sparse: true }
  //       });
  //       i = T.path('name')._index;
  //       assert.equal(true, i.unique);
  //       assert.equal(true, i.sparse);

  //       T = new Schema({
  //           name: { type: String, index: { sparse: true, unique: true, expiresAfterSeconds: 65 }}
  //       });
  //       i = T.path('name')._index;
  //       assert.equal(true, i.unique);
  //       assert.equal(true, i.sparse);
  //       assert.equal(65, i.expiresAfterSeconds);

  //       T = new Schema({
  //           name: { type: String, index: { sparse: true, unique: true, expires: '24h' }}
  //       });
  //       i = T.path('name')._index;
  //       assert.equal(true, i.unique);
  //       assert.equal(true, i.sparse);
  //       assert.equal(60*60*24, i.expiresAfterSeconds);

  //     })
  //     it('compound', function(){
  //       var Tobi = new Schema({
  //           name: { type: String, index: true }
  //         , last: { type: Number, sparse: true }
  //         , nope: { type: String, index: { background: false }}
  //       });

  //       Tobi.index({ firstname: 1, last: 1 }, { unique: true, expires: '1h' });
  //       Tobi.index({ firstname: 1, nope: 1 }, { unique: true, background: false });

  //       assert.deepEqual(Tobi.indexes(), [
  //           [{ name: 1 }, { background: true }]
  //         , [{ last: 1 }, { sparse: true, background :true }]
  //         , [{ nope: 1 }, { background : false}]
  //         , [{ firstname: 1, last: 1}, {unique: true, expiresAfterSeconds: 60*60, background: true }]
  //         , [{ firstname: 1, nope: 1 }, { unique: true, background: false }]
  //       ]);
  //     });
  //   });
  // });

  describe('plugins', function(){
    var Tobi = new Schema
      , called = false;

    Tobi.plugin(function(schema){
      assert.equal(schema, Tobi);
      called = true;
    });

    assert.equal(true, called);
  });

  describe('options', function(){
    it('defaults are set', function(){
      var Tobi = new Schema();

      assert.equal('object', typeof Tobi.options);
      // assert.equal(true, Tobi.options.safe);
      assert.equal(true, Tobi.options.strict);
      // assert.equal(false, Tobi.options.capped);
      assert.equal('__v', Tobi.options.versionKey);
      // assert.equal(null, Tobi.options.shardKey);
      // assert.equal(true, Tobi.options.id);
    });
  });

  describe('virtuals', function(){
    it('works', function(){
      var Contact = new Schema({
          firstName: String
        , lastName: String
      });

      Contact
      .virtual('fullName')
      .get(function () {
        return this.get('firstName') + ' ' + this.get('lastName');
      })
      .set(function (fullName) {
        var split = fullName.split(' ');
        this.set('firstName', split[0]);
        this.set('lastName', split[1]);
      });

      assert.ok(Contact.virtualpath('fullName') instanceof VirtualType);
    });

    describe('id', function(){
      it('default creation of id can be overridden', function(){
        assert.doesNotThrow(function () {
          new Schema({ id: String });
        });
      });
      it('disabling', function(){
        var schema = new Schema({ name: String }, { id: false });
        assert.strictEqual(undefined, schema.virtuals._id);
      });
    });
  });

  // describe('other contexts', function(){
  //   it('work', function(){
  //     var str = 'code = {' +
  //       '  name: String' +
  //       ', date: Date  ' +
  //       ', num: { type: Number }' +
  //       ', bool: Boolean' +
  //       ', nest: { type: {}, required: true }' +
  //       '}';

  //     var script = vm.createScript(str, 'testSchema.vm');
  //     var sandbox = { code: null };
  //     script.runInNewContext(sandbox);

  //     var Ferret = new Schema(sandbox.code);
  //     assert.ok(Ferret.path('nest') instanceof SchemaTypes.Mixed);
  //     assert.ok(Ferret.path('name') instanceof SchemaTypes.String);
  //     assert.ok(Ferret.path('date') instanceof SchemaTypes.Date);
  //     assert.ok(Ferret.path('num') instanceof SchemaTypes.Number);
  //     assert.ok(Ferret.path('bool') instanceof SchemaTypes.Boolean);
  //   });
  // });

  describe('#add()', function(){
    it('does not polute existing paths', function(){
      var o = { name: String }
      var s = new Schema(o);
      s.add({ age: Number }, 'name.');
      assert.equal(false, ('age' in o.name));
    });
  });

  it('debugging msgs', function(){
    var err;
    try {
      new Schema({ name: { first: null } })
    } catch (e) {
      err = e;
    }
    assert.equal(err.message,'Neo4j does not allow nested paths `name`')
    try {
      new Schema({ age: undefined })
    } catch (e) {
      err = e;
    }
    assert.equal(err.message, 'Invalid value for schema path `age`')
  });

  describe('conflicting property names', function(){
    it('throws', function(){
      var child = new Schema({ name: String });

      assert.throws(function(){
        new Schema({
            on: String
        });
      }, /`on` may not be used as a schema pathname/);

      assert.throws(function(){
        new Schema({
            options: String
        });
      }, /`options` may not be used as a schema pathname/);

      assert.doesNotThrow(function(){
        new Schema({
            model: String
        });
      });

      assert.throws(function(){
        new Schema({
            schema: String
        });
      }, /`schema` may not be used as a schema pathname/);

      assert.throws(function(){
        new Schema({
            _db: String
        });
      }, /`_db` may not be used as a schema pathname/);

      assert.throws(function(){
        new Schema({
            modelName: String
        });
      }, /`modelName` may not be used as a schema pathname/);

      assert.throws(function(){
        new Schema({
            isNew: String
        });
      }, /`isNew` may not be used as a schema pathname/);

      assert.throws(function(){
        new Schema({
            errors: String
        });
      }, /`errors` may not be used as a schema pathname/);

      assert.throws(function(){
        new Schema({
            init: String
        });
      }, /`init` may not be used as a schema pathname/);

      assert.throws(function(){
        new Schema({
            _self: String
        });
      }, /`_self` may not be used as a schema pathname/);

    })
  })
});
