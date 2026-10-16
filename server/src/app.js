const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const corsMiddleware = require('./middleware/cors');
const requireHttps = require('./middleware/https');
const authenticate = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');

module.exports = function createApp(store) {
  const app = express();
  app.disable('x-powered-by');
  if (config.behindTlsProxy) app.set('trust proxy', 1); // so req.secure honours X-Forwarded-Proto

  app.use(requireHttps);
  app.use(helmet());
  app.use(corsMiddleware());
  if (!config.isTest) app.use(morgan('combined'));
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/', (req, res) => res.type('text').send('MoodStreak API'));   // <-- add this

  const auth = authenticate(store);
  app.use('/api/auth', require('./routes/auth')(store, auth));
  // Everything below requires a valid (non-revoked) token
  app.use('/api/habits', auth, require('./routes/habits')(store));
  app.use('/api/moods', auth, require('./routes/moods')(store));
  app.use('/api/stats', auth, require('./routes/stats')(store));

  app.use(notFound);
  app.use(errorHandler);
  return app;
};
