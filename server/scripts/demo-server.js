// DEMO / OFFLINE MODE: runs the real Express app over HTTPS with an in-memory
// store (no MongoDB needed) and seeded data. NOT for production.
// Usage: npm run gen-cert && node scripts/demo-server.js
process.env.MONGODB_URI = process.env.MONGODB_URI || 'demo';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-change-me';
process.env.BCRYPT_ROUNDS = '6';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:8080';
const fs = require('fs'); const https = require('https'); const path = require('path');
const bcrypt = require('bcryptjs');
const createApp = require('../src/app');
const createMemoryStore = require('../src/store/memoryStore');
const { addDays } = require('../src/utils/dates');

(async () => {
  const store = createMemoryStore();
  const u = await store.createUser({ name: 'Demo User', email: 'demo@moodstreak.app', passwordHash: await bcrypt.hash('demo12345', 6) });
  const today = new Date().toISOString().slice(0, 10);
  const habits = [['Meditate', '🧘', 0.75], ['Drink 2L water', '💧', 0.6], ['Read 20 pages', '📖', 0.5], ['Evening walk', '🚶', 0.85]];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [name, emoji, p] of habits) {
    const h = await store.createHabit(u.id, { name, emoji });
    for (let i = 1; i <= 29; i++) if (rnd() < p || (i < 4 && name === 'Evening walk')) await store.addCheckin(u.id, h.id, addDays(today, -i));
  }
  for (let i = 1; i <= 26; i++) {
    if (rnd() < 0.2) continue;
    const walked = (await store.listCheckins(u.id, { from: addDays(today, -i), to: addDays(today, -i) })).length;
    const score = Math.max(1, Math.min(5, Math.round(2.2 + walked * 0.7 + rnd() * 1.2)));
    await store.createMood(u.id, { date: addDays(today, -i), score, note: '' });
  }
  const app = createApp(store);
  const port = process.env.PORT || 8443;
  https.createServer({ key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')), cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem')) }, app)
    .listen(port, () => console.log(`DEMO https server on https://localhost:${port}  (login demo@moodstreak.app / demo12345)`));
})();
