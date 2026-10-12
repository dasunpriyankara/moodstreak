const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const config = require('../config');
const { validate } = require('../middleware/errors');

module.exports = function authRouter(store, authenticate) {
  const router = express.Router();
  const limiter = config.isTest ? (q, r, n) => n() : rateLimit({
    windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many attempts, try again later' },
  });

  const issue = (user) => {
    const token = jwt.sign({}, config.jwtSecret, {
      subject: user.id, expiresIn: config.jwtExpiresIn, jwtid: crypto.randomUUID(), algorithm: 'HS256',
    });
    return { token, user: { id: user.id, name: user.name, email: user.email } };
  };

  router.post('/signup', limiter,
    body('name').isString().trim().isLength({ min: 1, max: 60 }).withMessage('Name is required (max 60 chars)'),
    body('email').isString().trim().isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').isString().isLength({ min: 8, max: 72 }).withMessage('Password must be 8-72 characters'),
    validate,
    async (req, res, next) => {
      try {
        const passwordHash = await bcrypt.hash(req.body.password, config.bcryptRounds);
        const user = await store.createUser({ name: req.body.name, email: req.body.email, passwordHash });
        if (!user) return res.status(409).json({ error: 'An account with that email already exists' });
        res.status(201).json(issue(user));
      } catch (e) { next(e); }
    });

  router.post('/login', limiter,
    body('email').isString().trim().isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 1, max: 72 }),
    validate,
    async (req, res, next) => {
      try {
        const user = await store.findUserByEmail(req.body.email);
        const ok = user && await bcrypt.compare(req.body.password, user.passwordHash);
        if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });
        res.json(issue(user));
      } catch (e) { next(e); }
    });

  router.get('/me', authenticate, async (req, res, next) => {
    try {
      const user = await store.findUserById(req.userId);
      if (!user) return res.status(401).json({ error: 'Account no longer exists' });
      res.json({ id: user.id, name: user.name, email: user.email });
    } catch (e) { next(e); }
  });

  router.post('/logout', authenticate, async (req, res, next) => {
    try {
      await store.revokeToken(req.token.jti, new Date(req.token.exp * 1000));
      res.json({ message: 'Logged out' });
    } catch (e) { next(e); }
  });

  return router;
};
