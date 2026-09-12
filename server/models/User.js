const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  // 128-dimensional Facial descriptor embedding vector for ML login
  faceDescriptor: {
    type: [Number],
    default: []
  },
  role: {
    type: String,
    enum: ['admin', 'master', 'guest'],
    default: 'master'
  },
  preferences: {
    language: { type: String, default: 'en-US' },
    speechRate: { type: Number, default: 0.9 },
    speechPitch: { type: Number, default: 0.8 },
    theme: { type: String, default: 'cyberpunk-cyan' }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);
