process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../src/app');
const createMemoryStore = require('../src/store/memoryStore');
const { currentStreak, longestStreak } = require('../src/utils/streaks');

let app;
const creds = { name: 'Alex', email: 'alex@example.com', password: 'correct-horse' };
const authed = (t) => ({ Authorization: `Bearer ${t}` });
let token;

before(async () => {
  app = createApp(createMemoryStore());
});

describe('auth', () => {
  test('signup creates account and returns token', async () => {
    const r = await request(app).post('/api/auth/signup').send(creds);
    assert.equal(r.status, 201); assert.ok(r.body.token); token = r.body.token;
    assert.equal(r.body.user.email, creds.email);
    assert.equal(r.body.user.passwordHash, undefined);
  });
  test('duplicate signup -> 409', async () => {
    assert.equal((await request(app).post('/api/auth/signup').send(creds)).status, 409);
  });
  test('weak password / bad email -> 400', async () => {
    assert.equal((await request(app).post('/api/auth/signup').send({ ...creds, email: 'x@y.com', password: 'short' })).status, 400);
    assert.equal((await request(app).post('/api/auth/signup').send({ ...creds, email: 'nope' })).status, 400);
  });
  test('NoSQL-injection style payload rejected', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    assert.equal(r.status, 400);
  });
  test('login ok / wrong password 401', async () => {
    assert.equal((await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password })).status, 200);
    assert.equal((await request(app).post('/api/auth/login').send({ email: creds.email, password: 'wrong-wrong' })).status, 401);
  });
  test('protected routes need token', async () => {
    for (const p of ['/api/habits', '/api/moods', '/api/stats/summary', '/api/auth/me']) {
      assert.equal((await request(app).get(p)).status, 401, p);
    }
    assert.equal((await request(app).get('/api/habits').set(authed('garbage'))).status, 401);
  });
  test('/me returns profile', async () => {
    const r = await request(app).get('/api/auth/me').set(authed(token));
    assert.equal(r.status, 200); assert.equal(r.body.name, 'Alex');
  });
});

describe('habits (GET/POST/PUT/DELETE)', () => {
  let id;
  test('create', async () => {
    const r = await request(app).post('/api/habits').set(authed(token)).send({ name: 'Meditate', emoji: '🧘' });
    assert.equal(r.status, 201); id = r.body.id; assert.equal(r.body.streak, 0);
  });
  test('validation', async () => {
    assert.equal((await request(app).post('/api/habits').set(authed(token)).send({ name: '' })).status, 400);
  });
  test('update', async () => {
    const r = await request(app).put(`/api/habits/${id}`).set(authed(token)).send({ name: 'Meditate 10m' });
    assert.equal(r.status, 200); assert.equal(r.body.name, 'Meditate 10m');
  });
  test('check-in is idempotent and drives streak', async () => {
    for (const d of ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-13']) {
      assert.equal((await request(app).post(`/api/habits/${id}/checkins`).set(authed(token)).send({ date: d })).status, 201);
    }
    const r = await request(app).get('/api/habits?today=2026-10-13').set(authed(token));
    assert.equal(r.body[0].streak, 3); assert.equal(r.body[0].doneToday, true); assert.equal(r.body[0].totalCheckins, 3);
  });
  test('bad date rejected', async () => {
    assert.equal((await request(app).post(`/api/habits/${id}/checkins`).set(authed(token)).send({ date: '2026-02-31' })).status, 400);
  });
  test('un-check', async () => {
    assert.equal((await request(app).delete(`/api/habits/${id}/checkins/2026-10-13`).set(authed(token))).status, 204);
    assert.equal((await request(app).delete(`/api/habits/${id}/checkins/2026-10-13`).set(authed(token))).status, 404);
  });
  test('another user cannot see or modify it (IDOR)', async () => {
    const o = await request(app).post('/api/auth/signup').send({ name: 'Bo', email: 'bo@example.com', password: 'another-pass' });
    const t2 = o.body.token;
    assert.deepEqual((await request(app).get('/api/habits').set(authed(t2))).body, []);
    assert.equal((await request(app).put(`/api/habits/${id}`).set(authed(t2)).send({ name: 'hax' })).status, 404);
    assert.equal((await request(app).delete(`/api/habits/${id}`).set(authed(t2))).status, 404);
    assert.equal((await request(app).post(`/api/habits/${id}/checkins`).set(authed(t2)).send({ date: '2026-10-13' })).status, 404);
  });
  test('delete', async () => {
    assert.equal((await request(app).delete(`/api/habits/${id}`).set(authed(token))).status, 204);
    assert.equal((await request(app).delete(`/api/habits/${id}`).set(authed(token))).status, 404);
  });
});

describe('moods', () => {
  let id;
  test('create / duplicate day 409', async () => {
    const r = await request(app).post('/api/moods').set(authed(token)).send({ date: '2026-10-13', score: 4, note: 'good' });
    assert.equal(r.status, 201); id = r.body.id;
    assert.equal((await request(app).post('/api/moods').set(authed(token)).send({ date: '2026-10-13', score: 2 })).status, 409);
  });
  test('score range validated', async () => {
    assert.equal((await request(app).post('/api/moods').set(authed(token)).send({ date: '2026-10-12', score: 9 })).status, 400);
  });
  test('list with range / update / delete', async () => {
    assert.equal((await request(app).get('/api/moods?from=2026-10-01&to=2026-10-31').set(authed(token))).body.length, 1);
    const u = await request(app).put(`/api/moods/${id}`).set(authed(token)).send({ score: 5 });
    assert.equal(u.body.score, 5);
    assert.equal((await request(app).delete(`/api/moods/${id}`).set(authed(token))).status, 204);
  });
});

describe('stats', () => {
  test('summary computes mood lift for a habit', async () => {
    const t = (await request(app).post('/api/auth/signup').send({ name: 'Cy', email: 'cy@example.com', password: 'password123' })).body.token;
    const h = (await request(app).post('/api/habits').set(authed(t)).send({ name: 'Walk' })).body.id;
    const days = ['01', '02', '03', '04', '05', '06'];
    for (const [i, d] of days.entries()) {
      const date = `2026-10-${d}`;
      const active = i < 3;
      if (active) await request(app).post(`/api/habits/${h}/checkins`).set(authed(t)).send({ date });
      await request(app).post('/api/moods').set(authed(t)).send({ date, score: active ? 5 : 2 });
    }
    const r = await request(app).get('/api/stats/summary?today=2026-10-06').set(authed(t));
    assert.equal(r.status, 200);
    assert.equal(r.body.habits[0].moodWith, 5); assert.equal(r.body.habits[0].moodWithout, 2); assert.equal(r.body.habits[0].moodLift, 3);
    assert.equal(r.body.bestHabit.name, 'Walk');
    assert.equal(r.body.mood.series.length, 30);
  });
});

describe('logout', () => {
  test('revokes the token', async () => {
    assert.equal((await request(app).post('/api/auth/logout').set(authed(token))).status, 200);
    assert.equal((await request(app).get('/api/habits').set(authed(token))).status, 401);
  });
});

describe('misc', () => {
  test('CORS allows Cordova origin, blocks unknown', async () => {
    const a = await request(app).options('/api/habits').set('Origin', 'https://localhost').set('Access-Control-Request-Method', 'GET');
    assert.equal(a.headers['access-control-allow-origin'], 'https://localhost');
    const b = await request(app).options('/api/habits').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    assert.equal(b.headers['access-control-allow-origin'], undefined);
  });
  test('security headers, malformed JSON, 404', async () => {
    const r = await request(app).get('/health');
    assert.ok(r.headers['strict-transport-security']); assert.equal(r.headers['x-powered-by'], undefined);
    assert.equal((await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad')).status, 400);
    assert.equal((await request(app).get('/nope')).status, 404);
  });
  test('streak helpers', () => {
    assert.equal(currentStreak(['2026-10-12', '2026-10-11'], '2026-10-13'), 2);
    assert.equal(currentStreak(['2026-10-10'], '2026-10-13'), 0);
    assert.equal(longestStreak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05']), 3);
  });
});
