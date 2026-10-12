const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/errors');
const { isValidDate, todayUTC } = require('../utils/dates');
const { currentStreak } = require('../utils/streaks');

const dateField = (chain) => chain.custom(isValidDate).withMessage('Date must be YYYY-MM-DD');

module.exports = function habitsRouter(store) {
  const router = express.Router();

  // GET /api/habits  -> habits with today's completion + current streak
  router.get('/', async (req, res, next) => {
    try {
      const today = isValidDate(req.query.today) ? req.query.today : todayUTC();
      const [habits, checkins] = await Promise.all([store.listHabits(req.userId), store.listCheckins(req.userId)]);
      const byHabit = {};
      for (const c of checkins) (byHabit[c.habit] ||= []).push(c.date);
      res.json(habits.map((h) => {
        const dates = byHabit[h.id] || [];
        return { id: h.id, name: h.name, emoji: h.emoji, doneToday: dates.includes(today), streak: currentStreak(dates, today), totalCheckins: dates.length };
      }));
    } catch (e) { next(e); }
  });

  // POST /api/habits
  router.post('/',
    body('name').isString().trim().isLength({ min: 1, max: 60 }).withMessage('Name is required (max 60 chars)'),
    body('emoji').optional().isString().isLength({ min: 1, max: 8 }),
    validate,
    async (req, res, next) => {
      try {
        const h = await store.createHabit(req.userId, { name: req.body.name, emoji: req.body.emoji || '✅' });
        res.status(201).json({ id: h.id, name: h.name, emoji: h.emoji, doneToday: false, streak: 0, totalCheckins: 0 });
      } catch (e) { next(e); }
    });

  // PUT /api/habits/:id
  router.put('/:id',
    param('id').isString(),
    body('name').optional().isString().trim().isLength({ min: 1, max: 60 }),
    body('emoji').optional().isString().isLength({ min: 1, max: 8 }),
    validate,
    async (req, res, next) => {
      try {
        const data = {};
        if (req.body.name !== undefined) data.name = req.body.name;
        if (req.body.emoji !== undefined) data.emoji = req.body.emoji;
        const h = await store.updateHabit(req.userId, req.params.id, data);
        if (!h) return res.status(404).json({ error: 'Habit not found' });
        res.json({ id: h.id, name: h.name, emoji: h.emoji });
      } catch (e) { next(e); }
    });

  // DELETE /api/habits/:id
  router.delete('/:id', param('id').isString(), validate, async (req, res, next) => {
    try {
      const ok = await store.deleteHabit(req.userId, req.params.id);
      if (!ok) return res.status(404).json({ error: 'Habit not found' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // POST /api/habits/:id/checkins  {date}   (idempotent)
  router.post('/:id/checkins', param('id').isString(), dateField(body('date')), validate, async (req, res, next) => {
    try {
      const h = await store.getHabit(req.userId, req.params.id);
      if (!h) return res.status(404).json({ error: 'Habit not found' });
      const c = await store.addCheckin(req.userId, h.id, req.body.date);
      res.status(201).json({ id: c.id, habit: c.habit, date: c.date });
    } catch (e) { next(e); }
  });

  // DELETE /api/habits/:id/checkins/:date
  router.delete('/:id/checkins/:date', param('id').isString(), dateField(param('date')), validate, async (req, res, next) => {
    try {
      const ok = await store.removeCheckin(req.userId, req.params.id, req.params.date);
      if (!ok) return res.status(404).json({ error: 'Check-in not found' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
};
