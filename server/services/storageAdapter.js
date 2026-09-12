const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Mongoose Models
const ContactModel = require('../models/Contact');
const ReminderModel = require('../models/Reminder');
const TelemetryModel = require('../models/Telemetry');
const UserModel = require('../models/User');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOCAL_STORE_PATH = path.join(DATA_DIR, 'standalone_store.json');

// Ensure local data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default store template
const DEFAULT_STORE = {
  users: [],
  contacts: [],
  reminders: [],
  telemetry: []
};

// In-memory cache for ultra-fast local operations
let memoryStore = null;

function loadLocalStore() {
  if (memoryStore) return memoryStore;
  try {
    if (fs.existsSync(LOCAL_STORE_PATH)) {
      const raw = fs.readFileSync(LOCAL_STORE_PATH, 'utf-8');
      memoryStore = JSON.parse(raw);
    } else {
      memoryStore = JSON.parse(JSON.stringify(DEFAULT_STORE));
      persistLocalStore();
    }
  } catch (e) {
    console.warn('⚠️ [StorageAdapter] Error loading standalone store, reinitializing:', e.message);
    memoryStore = JSON.parse(JSON.stringify(DEFAULT_STORE));
  }
  return memoryStore;
}

function persistLocalStore() {
  try {
    if (!memoryStore) memoryStore = JSON.parse(JSON.stringify(DEFAULT_STORE));
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(memoryStore, null, 2), 'utf-8');
  } catch (e) {
    console.error('❌ [StorageAdapter] Failed to persist standalone store:', e.message);
  }
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

// ─────────────────────────────────────────────────────────────
// CONTACTS
// ─────────────────────────────────────────────────────────────
async function getContacts() {
  if (isMongoConnected()) {
    return await ContactModel.find().sort({ name: 1 });
  }
  const store = loadLocalStore();
  return [...store.contacts].sort((a, b) => a.name.localeCompare(b.name));
}

async function saveContact({ name, phoneNumber, userId }) {
  const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
  const cleanName = name.toLowerCase().trim();

  if (isMongoConnected()) {
    let contact = await ContactModel.findOne({ name: cleanName });
    if (contact) {
      contact.phoneNumber = cleanNumber;
      await contact.save();
    } else {
      contact = new ContactModel({
        userId: userId || null,
        name: cleanName,
        phoneNumber: cleanNumber
      });
      await contact.save();
    }
    return contact;
  }

  const store = loadLocalStore();
  let contact = store.contacts.find(c => c.name === cleanName);
  if (contact) {
    contact.phoneNumber = cleanNumber;
    contact.updatedAt = new Date().toISOString();
  } else {
    contact = {
      _id: 'local_cnt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId: userId || null,
      name: cleanName,
      phoneNumber: cleanNumber,
      createdAt: new Date().toISOString()
    };
    store.contacts.push(contact);
  }
  persistLocalStore();
  return contact;
}

async function deleteContact(name) {
  const cleanName = (name || '').toLowerCase().trim();
  if (isMongoConnected()) {
    return await ContactModel.findOneAndDelete({ name: cleanName });
  }

  const store = loadLocalStore();
  const idx = store.contacts.findIndex(c => c.name === cleanName);
  if (idx !== -1) {
    const removed = store.contacts.splice(idx, 1)[0];
    persistLocalStore();
    return removed;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// REMINDERS
// ─────────────────────────────────────────────────────────────
async function getReminders() {
  if (isMongoConnected()) {
    return await ReminderModel.find({ isCompleted: false }).sort({ dueTimestamp: 1 });
  }
  const store = loadLocalStore();
  return store.reminders
    .filter(r => !r.isCompleted)
    .sort((a, b) => new Date(a.dueTimestamp) - new Date(b.dueTimestamp));
}

async function saveReminder({ task, dueTimestamp, userId }) {
  if (isMongoConnected()) {
    const reminder = new ReminderModel({
      userId: userId || null,
      task: task.trim(),
      dueTimestamp: new Date(dueTimestamp)
    });
    await reminder.save();
    return reminder;
  }

  const store = loadLocalStore();
  const reminder = {
    _id: 'local_rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    userId: userId || null,
    task: task.trim(),
    dueTimestamp: new Date(dueTimestamp).toISOString(),
    isCompleted: false,
    createdAt: new Date().toISOString()
  };
  store.reminders.push(reminder);
  persistLocalStore();
  return reminder;
}

async function deleteReminder(id) {
  if (isMongoConnected()) {
    return await ReminderModel.findByIdAndDelete(id);
  }

  const store = loadLocalStore();
  const idx = store.reminders.findIndex(r => String(r._id) === String(id));
  if (idx !== -1) {
    const removed = store.reminders.splice(idx, 1)[0];
    persistLocalStore();
    return removed;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// TELEMETRY
// ─────────────────────────────────────────────────────────────
async function logTelemetry(entry) {
  const payload = {
    userId: entry.userId || null,
    rawUtterance: entry.rawUtterance || 'Unknown',
    classifiedIntent: entry.classifiedIntent || 'General / ChitChat',
    executionEngine: entry.executionEngine || 'Rule Engine',
    isSuccess: entry.isSuccess !== undefined ? entry.isSuccess : true,
    responseLatencyMs: entry.responseLatencyMs || 100,
    timestamp: new Date()
  };

  if (isMongoConnected()) {
    const log = new TelemetryModel(payload);
    await log.save();
    return log;
  }

  const store = loadLocalStore();
  const log = {
    _id: 'local_tel_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    ...payload,
    timestamp: payload.timestamp.toISOString()
  };
  store.telemetry.unshift(log);
  if (store.telemetry.length > 500) {
    store.telemetry = store.telemetry.slice(0, 500);
  }
  persistLocalStore();
  return log;
}

async function getTelemetryStats() {
  if (isMongoConnected()) {
    const totalQueries = await TelemetryModel.countDocuments();
    const aiQueries = await TelemetryModel.countDocuments({ classifiedIntent: 'AI & Generation' });
    const apiQueries = await TelemetryModel.countDocuments({ classifiedIntent: 'Realtime APIs' });
    const successCount = await TelemetryModel.countDocuments({ isSuccess: true });

    const intentAgg = await TelemetryModel.aggregate([
      { $group: { _id: '$classifiedIntent', count: { $sum: 1 } } }
    ]);

    const intents = {
      'AI & Generation': 0,
      'Web Navigation': 0,
      'Realtime APIs': 0,
      'WhatsApp & Comms': 0,
      'System Controls': 0,
      'Knowledge & Utils': 0,
      'General / ChitChat': 0
    };

    intentAgg.forEach(item => {
      if (intents[item._id] !== undefined) intents[item._id] = item.count;
    });

    const recentLogs = await TelemetryModel.find()
      .sort({ timestamp: -1 })
      .limit(30)
      .select('rawUtterance classifiedIntent executionEngine isSuccess timestamp');

    return {
      totalQueries,
      aiQueries,
      apiQueries,
      successRate: totalQueries > 0 ? ((successCount / totalQueries) * 100).toFixed(1) : 100,
      intents,
      recentLogs
    };
  }

  // Standalone mode calculation
  const store = loadLocalStore();
  const logs = store.telemetry || [];
  const totalQueries = logs.length;
  const aiQueries = logs.filter(l => l.classifiedIntent === 'AI & Generation').length;
  const apiQueries = logs.filter(l => l.classifiedIntent === 'Realtime APIs').length;
  const successCount = logs.filter(l => l.isSuccess !== false).length;

  const intents = {
    'AI & Generation': 0,
    'Web Navigation': 0,
    'Realtime APIs': 0,
    'WhatsApp & Comms': 0,
    'System Controls': 0,
    'Knowledge & Utils': 0,
    'General / ChitChat': 0
  };

  logs.forEach(l => {
    if (intents[l.classifiedIntent] !== undefined) {
      intents[l.classifiedIntent]++;
    }
  });

  const recentLogs = logs.slice(0, 30).map(l => ({
    rawUtterance: l.rawUtterance,
    classifiedIntent: l.classifiedIntent,
    executionEngine: l.executionEngine,
    isSuccess: l.isSuccess,
    timestamp: l.timestamp
  }));

  return {
    totalQueries,
    aiQueries,
    apiQueries,
    successRate: totalQueries > 0 ? ((successCount / totalQueries) * 100).toFixed(1) : 100,
    intents,
    recentLogs
  };
}

// ─────────────────────────────────────────────────────────────
// USERS & AUTH
// ─────────────────────────────────────────────────────────────
async function findUser(query) {
  if (isMongoConnected()) {
    if (query._id) return await UserModel.findById(query._id);
    const conditions = [];
    if (query.username) conditions.push({ username: query.username });
    if (query.email) conditions.push({ email: query.email });
    return await UserModel.findOne({ $or: conditions });
  }

  const store = loadLocalStore();
  return store.users.find(u => {
    if (query._id && String(u._id) === String(query._id)) return true;
    if (query.username && (u.username === query.username || u.email === query.username)) return true;
    if (query.email && (u.email === query.email || u.username === query.email)) return true;
    return false;
  }) || null;
}

async function saveUser({ username, email, passwordHash, faceDescriptor, preferences }) {
  if (isMongoConnected()) {
    const user = new UserModel({
      username,
      email,
      passwordHash,
      faceDescriptor: faceDescriptor || [],
      preferences: preferences || {}
    });
    await user.save();
    return user;
  }

  const store = loadLocalStore();
  const user = {
    _id: 'local_usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    username,
    email: email.toLowerCase().trim(),
    passwordHash,
    faceDescriptor: faceDescriptor || [],
    preferences: preferences || { language: 'en-US', theme: 'stark_cyan' },
    createdAt: new Date().toISOString()
  };
  store.users.push(user);
  persistLocalStore();
  return user;
}

async function updateUserFace(userId, faceDescriptor) {
  if (isMongoConnected()) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return null;
    }
    return await UserModel.findByIdAndUpdate(userId, { faceDescriptor }, { new: true });
  }

  const store = loadLocalStore();
  const user = store.users.find(u => String(u._id) === String(userId));
  if (user) {
    user.faceDescriptor = faceDescriptor;
    persistLocalStore();
    return user;
  }
  return null;
}

module.exports = {
  isMongoConnected,
  getContacts,
  saveContact,
  deleteContact,
  getReminders,
  saveReminder,
  deleteReminder,
  logTelemetry,
  getTelemetryStats,
  findUser,
  saveUser,
  updateUserFace
};

