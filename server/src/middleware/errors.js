const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const r = validationResult(req);
  if (r.isEmpty()) return next();
  res.status(400).json({ error: 'Validation failed', details: r.array().map((e) => ({ field: e.path, message: e.msg })) });
}

function notFound(req, res) { res.status(404).json({ error: 'Not found' }); }

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { validate, notFound, errorHandler };
