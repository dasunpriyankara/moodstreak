// MongoDB (Atlas) persistence layer built on Mongoose.
const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });

const habitSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  emoji: { type: String, default: '✅', maxlength: 8 },
  archived: { type: Boolean, default: false },
}, { timestamps: true });

const checkinSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true, index: true },
  habit: { type: Schema.Types.ObjectId, ref: 'Habit', required: true },
  date: { type: String, required: true },
});
checkinSchema.index({ habit: 1, date: 1 }, { unique: true });

const moodSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true, index: true },
  date: { type: String, required: true },
  score: { type: Number, required: true, min: 1, max: 5 },
  note: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });
moodSchema.index({ user: 1, date: 1 }, { unique: true });

const revokedSchema = new Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }, // TTL cleanup
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Habit = mongoose.models.Habit || mongoose.model('Habit', habitSchema);
const Checkin = mongoose.models.Checkin || mongoose.model('Checkin', checkinSchema);
const Mood = mongoose.models.Mood || mongoose.model('Mood', moodSchema);
const Revoked = mongoose.models.Revoked || mongoose.model('Revoked', revokedSchema);

const ok = (id) => mongoose.isValidObjectId(id);
const out = (d) => {
  if (!d) return null;
  const o = d.toObject ? d.toObject() : { ...d };
  o.id = String(o._id);
  delete o._id; delete o.__v;
  for (const k of ['user', 'habit']) if (o[k]) o[k] = String(o[k]);
  return o;
};
const outAll = (arr) => arr.map(out);

function dateRange(q) {
  const r = {};
  if (q.from) r.$gte = q.from;
  if (q.to) r.$lte = q.to;
  return Object.keys(r).length ? { date: r } : {};
}

module.exports = {
  async connect(uri) {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    await Promise.all([User, Habit, Checkin, Mood, Revoked].map((m) => m.init()));
  },
  async disconnect() { await mongoose.disconnect(); },

  // users
  async createUser({ name, email, passwordHash }) {
    try { return out(await User.create({ name, email, passwordHash })); }
    catch (e) { if (e.code === 11000) return null; throw e; }
  },
  async findUserByEmail(email) { return out(await User.findOne({ email: String(email).toLowerCase() })); },
  async findUserById(id) { return ok(id) ? out(await User.findById(id)) : null; },

  // token revocation (logout)
  async revokeToken(jti, expiresAt) {
    await Revoked.updateOne({ jti }, { jti, expiresAt }, { upsert: true });
  },
  async isRevoked(jti) { return !!(await Revoked.exists({ jti })); },

  // habits
  async listHabits(uid) { return outAll(await Habit.find({ user: uid, archived: false }).sort({ createdAt: 1 })); },
  async createHabit(uid, data) { return out(await Habit.create({ ...data, user: uid })); },
  async updateHabit(uid, id, data) {
    if (!ok(id)) return null;
    return out(await Habit.findOneAndUpdate({ _id: id, user: uid }, { $set: data }, { new: true, runValidators: true }));
  },
  async deleteHabit(uid, id) {
    if (!ok(id)) return false;
    const r = await Habit.findOneAndDelete({ _id: id, user: uid });
    if (r) await Checkin.deleteMany({ habit: id, user: uid });
    return !!r;
  },
  async getHabit(uid, id) { return ok(id) ? out(await Habit.findOne({ _id: id, user: uid })) : null; },

  // check-ins
  async listCheckins(uid, q = {}) {
    const f = { user: uid, ...dateRange(q) };
    if (q.habitId && ok(q.habitId)) f.habit = q.habitId;
    return outAll(await Checkin.find(f).sort({ date: 1 }));
  },
  async addCheckin(uid, habitId, date) {
    try { return out(await Checkin.create({ user: uid, habit: habitId, date })); }
    catch (e) { if (e.code === 11000) return out(await Checkin.findOne({ habit: habitId, date })); throw e; }
  },
  async removeCheckin(uid, habitId, date) {
    if (!ok(habitId)) return false;
    return !!(await Checkin.findOneAndDelete({ user: uid, habit: habitId, date }));
  },

  // moods
  async listMoods(uid, q = {}) { return outAll(await Mood.find({ user: uid, ...dateRange(q) }).sort({ date: -1 })); },
  async getMood(uid, id) { return ok(id) ? out(await Mood.findOne({ _id: id, user: uid })) : null; },
  async createMood(uid, data) {
    try { return out(await Mood.create({ ...data, user: uid })); }
    catch (e) { if (e.code === 11000) return null; throw e; }
  },
  async updateMood(uid, id, data) {
    if (!ok(id)) return null;
    return out(await Mood.findOneAndUpdate({ _id: id, user: uid }, { $set: data }, { new: true, runValidators: true }));
  },
  async deleteMood(uid, id) { return ok(id) ? !!(await Mood.findOneAndDelete({ _id: id, user: uid })) : false; },
};
