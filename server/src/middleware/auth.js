const jwt = require('jsonwebtoken');
const config = require('../config');

// Authenticates every incoming request that passes through it using a
// Bearer JWT. Logged-out (revoked) tokens are rejected.
module.exports = function authenticate(store) {
  return async (req, res, next) => {
    try {
      const header = req.get('Authorization') || '';
      const [scheme, token] = header.split(' ');
      if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Authentication required' });
      let payload;
      try { payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }); }
      catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
      if (await store.isRevoked(payload.jti)) return res.status(401).json({ error: 'Token has been logged out' });
      req.userId = payload.sub;
      req.token = { jti: payload.jti, exp: payload.exp };
      next();
    } catch (e) { next(e); }
  };
};
