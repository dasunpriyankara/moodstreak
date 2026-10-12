const { addDays } = require('./dates');

// dates: iterable of 'YYYY-MM-DD' strings (check-ins for one habit)
function currentStreak(dates, today) {
  const set = new Set(dates);
  // A streak is still "alive" if today is not yet done but yesterday was.
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

function longestStreak(dates) {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

module.exports = { currentStreak, longestStreak };
