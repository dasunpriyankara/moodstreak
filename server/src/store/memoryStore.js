// In-memory implementation of the same store interface. Used ONLY by the
// automated tests so they can run without a MongoDB instance.
const crypto = require('crypto');
const uid = () => crypto.randomBytes(12).toString('hex');

module.exports = function createMemoryStore() {
  const s = { users: [], habits: [], checkins: [], moods: [], revoked: new Map() };
  const inRange = (d, q) => (!q.from || d >= q.from) && (!q.to || d <= q.to);
  const clone = (x) => (x ? { ...x } : null);
  return {
    async connect() {}, async disconnect() {},
    async createUser({ name, email, passwordHash }) {
      email = email.toLowerCase();
      if (s.users.some((u) => u.email === email)) return null;
      const u = { id: uid(), name, email, passwordHash, createdAt: new Date() };
      s.users.push(u); return clone(u);
    },
    async findUserByEmail(email) { return clone(s.users.find((u) => u.email === String(email).toLowerCase())); },
    async findUserById(id) { return clone(s.users.find((u) => u.id === id)); },
    async revokeToken(jti, exp) { s.revoked.set(jti, exp); },
    async isRevoked(jti) { return s.revoked.has(jti); },
    async listHabits(u) { return s.habits.filter((h) => h.user === u && !h.archived).map(clone); },
    async createHabit(u, d) { const h = { id: uid(), user: u, emoji: '✅', archived: false, ...d, createdAt: new Date() }; s.habits.push(h); return clone(h); },
    async updateHabit(u, id, d) { const h = s.habits.find((x) => x.id === id && x.user === u); if (!h) return null; Object.assign(h, d); return clone(h); },
    async deleteHabit(u, id) {
      const i = s.habits.findIndex((x) => x.id === id && x.user === u); if (i < 0) return false;
      s.habits.splice(i, 1); s.checkins = s.checkins.filter((c) => c.habit !== id); return true;
    },
    async getHabit(u, id) { return clone(s.habits.find((x) => x.id === id && x.user === u)); },
    async listCheckins(u, q = {}) {
      return s.checkins.filter((c) => c.user === u && inRange(c.date, q) && (!q.habitId || c.habit === q.habitId))
        .sort((a, b) => a.date.localeCompare(b.date)).map(clone);
    },
    async addCheckin(u, habit, date) {
      let c = s.checkins.find((x) => x.habit === habit && x.date === date);
      if (!c) { c = { id: uid(), user: u, habit, date }; s.checkins.push(c); }
      return clone(c);
    },
    async removeCheckin(u, habit, date) {
      const i = s.checkins.findIndex((c) => c.user === u && c.habit === habit && c.date === date);
      if (i < 0) return false; s.checkins.splice(i, 1); return true;
    },
    async listMoods(u, q = {}) { return s.moods.filter((m) => m.user === u && inRange(m.date, q)).sort((a, b) => b.date.localeCompare(a.date)).map(clone); },
    async getMood(u, id) { return clone(s.moods.find((m) => m.id === id && m.user === u)); },
    async createMood(u, d) {
      if (s.moods.some((m) => m.user === u && m.date === d.date)) return null;
      const m = { id: uid(), user: u, note: '', ...d }; s.moods.push(m); return clone(m);
    },
    async updateMood(u, id, d) { const m = s.moods.find((x) => x.id === id && x.user === u); if (!m) return null; Object.assign(m, d); return clone(m); },
    async deleteMood(u, id) { const i = s.moods.findIndex((m) => m.id === id && m.user === u); if (i < 0) return false; s.moods.splice(i, 1); return true; },
  };
};
