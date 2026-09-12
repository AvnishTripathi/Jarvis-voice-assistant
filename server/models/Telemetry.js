const mongoose = require('mongoose');

const TelemetrySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  rawUtterance: {
    type: String,
    required: true,
    trim: true
  },
  classifiedIntent: {
    type: String,
    required: true,
    enum: [
      'AI & Generation',
      'Web Navigation',
      'Realtime APIs',
      'WhatsApp & Comms',
      'System Controls',
      'Knowledge & Utils',
      'General / ChitChat'
    ]
  },
  executionEngine: {
    type: String,
    required: true
  },
  isSuccess: {
    type: Boolean,
    default: true
  },
  responseLatencyMs: {
    type: Number,
    default: 120
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Telemetry', TelemetrySchema);
