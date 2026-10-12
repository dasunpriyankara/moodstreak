const express = require('express');
const { body, query, param } = require('express-validator');
const { validate } = require('../middleware/errors');
const { isValidDate } = require('../utils/dates');

const pub = (m) => ({ id: m.id, date: m.date, score: m.score, note: m.note || '' });

module.exports = function moodsRouter(store) {
  const router = express.Router();

  router.get('/',
    query('from').optional().custom(isValidDate).withMessage('from must be YYYY-MM-DD'),
    query('to').optional().custom(isValidDate).withMessage('to must be YYYY-MM-DD'),
    validate,
    async (req, res, next) => {
      try { res.json((await store.listMoods(req.userId, { from: req.query.from, to: req.query.to })).map(pub)); }
      catch (e) { next(e); }
    });

  router.post('/',
    body('date').custom(isValidDate).withMessage('date must be YYYY-MM-DD'),
    body('score').isInt({ min: 1, max: 5 }).withMessage('score must be 1-5').toInt(),
    body('note').optional().isString().isLength({ max: 500 }),
    validate,
    async (req, res, next) => {
      try {
        const m = await store.createMood(req.userId, { date: req.body.date, score: req.body.score, note: req.body.note || '' });
        if (!m) return res.status(409).json({ error: 'A mood is already logged for that day - edit it instead' });
        res.status(201).json(pub(m));
      } catch (e) { next(e); }
    });

  router.put('/:id',
    param('id').isString(),
    body('score').optional().isInt({ min: 1, max: 5 }).toInt(),
    body('note').optional().isString().isLength({ max: 500 }),
    validate,
    async (req, res, next) => {
      try {
        const data = {};
        if (req.body.score !== undefined) data.score = req.body.score;
        if (req.body.note !== undefined) data.note = req.body.note;
        const m = await store.updateMood(req.userId, req.params.id, data);
        if (!m) return res.status(404).json({ error: 'Mood entry not found' });
        res.json(pub(m));
      } catch (e) { next(e); }
    });

  router.delete('/:id', param('id').isString(), validate, async (req, res, next) => {
    try {
      if (!(await store.deleteMood(req.userId, req.params.id))) return res.status(404).json({ error: 'Mood entry not found' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
};
