const passport = require('passport');

const { Strategy, ExtractJwt } = require('passport-jwt');

const config = require('./config');
const User = require('./models/user');

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.secret
};

const strategy = new Strategy(opts, (payload, done) => {
  User.findOne({ _id: payload._id }, (err, user) => {
    if (err) return done(err, false);
    if (user) return done(null, user);
    return done(null, false);
  });
});

passport.use(strategy);

module.exports = {
  init () { return passport.initialize(); },
  auth () { return passport.authenticate('jwt', { session: false }); }
};
