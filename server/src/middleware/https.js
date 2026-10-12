const config = require('../config');

// Refuse plain-HTTP traffic. When the app sits behind a TLS-terminating proxy
// (Render), the proxy sets X-Forwarded-Proto; otherwise req.secure is true
// because the server itself speaks TLS.
module.exports = function requireHttps(req, res, next) {
  if (config.isTest) return next();
  if (req.secure) return next();
  return res.status(426).json({ error: 'HTTPS required' });
};
