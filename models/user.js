const mongoose = require('mongoose');
const bcrypt = require('bcrypt-nodejs');

const { formSchema } = require('./form');

const SALT_FACTOR = 10;

const userSchema = mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  personalInformation: {
    lastName: {
      type: String,
      required: true
    },
    firstName: {
      type: String,
      required: true
    },
    institute: {
      type: String,
      required: true
    },
    position: {
      type: String,
      required: true,
      enum: ['employee', 'graduateStudent', 'student'],
      default: 'employee'
    },
    phone: {
      type: String,
      default: ''
    }
  },
  bankInformation: [{}],
  forms: [formSchema]
});

const noop = () => {};

userSchema.pre('save', function (done) {
  const user = this;
  if (!user.isModified('password')) return done();
  bcrypt.genSalt(SALT_FACTOR, (err, salt) => {
    if (err) return done(err);
    bcrypt.hash(user.password, salt, noop, (err, hashedPassword) => {
      if (err) return done(err);
      user.password = hashedPassword;
      done();
    });
  });
});

userSchema.methods.checkPassword = function (guess, done) {
  bcrypt.compare(guess, this.password, (err, isMatch) => done(err, isMatch));
};

module.exports = mongoose.model('User', userSchema);