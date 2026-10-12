const express = require('express');
const { query } = require('express-validator');
const { validate } = require('../middleware/errors');
const { isValidDate, todayUTC, addDays } = require('../utils/dates');
const { currentStreak, longestStreak } = require('../utils/streaks');

const avg = (a) => (a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 100) / 100 : null);

module.exports = function statsRouter(store) {
  const router = express.Router();

  // GET /api/stats/summary?today=YYYY-MM-DD
  router.get('/summary', query('today').optional().custom(isValidDate), validate, async (req, res, next) => {
    try {
      const today = req.query.today || todayUTC();
      const from30 = addDays(today, -29);
      const from7 = addDays(today, -6);
      const [habits, checkins, moods] = await Promise.all([
        store.listHabits(req.userId), store.listCheckins(req.userId), store.listMoods(req.userId, { from: from30, to: today }),
      ]);

      const moodByDate = Object.fromEntries(moods.map((m) => [m.date, m.score]));
      const series = [];
      for (let i = 29; i >= 0; i--) { const d = addDays(today, -i); series.push({ date: d, score: moodByDate[d] ?? null }); }

      const habitStats = habits.map((h) => {
        const dates = checkins.filter((c) => c.habit === h.id).map((c) => c.date);
        const set = new Set(dates);
        const last30 = dates.filter((d) => d >= from30 && d <= today).length;
        // Mood on days the habit was done vs. not done (only days with a mood entry)
        const withDays = moods.filter((m) => set.has(m.date)).map((m) => m.score);
        const withoutDays = moods.filter((m) => !set.has(m.date)).map((m) => m.score);
        const enough = withDays.length >= 3 && withoutDays.length >= 3;
        return {
          id: h.id, name: h.name, emoji: h.emoji,
          currentStreak: currentStreak(dates, today), longestStreak: longestStreak(dates),
          completion30: Math.round((last30 / 30) * 100),
          moodWith: enough ? avg(withDays) : null, moodWithout: enough ? avg(withoutDays) : null,
          moodLift: enough ? Math.round((avg(withDays) - avg(withoutDays)) * 100) / 100 : null,
        };
      });

      res.json({
        today,
        mood: {
          avg7: avg(moods.filter((m) => m.date >= from7).map((m) => m.score)),
          avg30: avg(moods.map((m) => m.score)),
          entries30: moods.length, series,
        },
        habits: habitStats,
        bestHabit: habitStats.filter((h) => h.moodLift !== null && h.moodLift > 0).sort((a, b) => b.moodLift - a.moodLift)[0] || null,
      });
    } catch (e) { next(e); }
  });

  return router;
};
