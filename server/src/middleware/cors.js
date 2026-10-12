const cors = require('cors');
const config = require('../config');

// Origins used by Cordova WebViews (Android https/http://localhost, iOS app://localhost, ionic://localhost)
// plus any origins listed in CORS_ORIGINS. "null" is the origin of file:// pages.
const defaults = ['https://localhost', 'http://localhost', 'app://localhost', 'ionic://localhost', 'null'];

module.exports = function corsMiddleware() {
  const allowed = new Set([...defaults, ...config.corsOrigins]);
  return cors({
    origin(origin, cb) {
      if (!origin || allowed.has(origin)) return cb(null, true);
      cb(null, false); // no CORS headers -> browser blocks the call
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
};
