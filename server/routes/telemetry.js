const express = require('express');
const router = express.Router();
const storage = require('../services/storageAdapter');

// @route   POST /api/telemetry/log
// @desc    Log a classified query utterance
router.post('/log', async (req, res) => {
  try {
    const { userId, rawUtterance, classifiedIntent, executionEngine, isSuccess, responseLatencyMs } = req.body;

    const log = await storage.logTelemetry({
      userId,
      rawUtterance,
      classifiedIntent,
      executionEngine,
      isSuccess,
      responseLatencyMs
    });

    res.status(201).json({ success: true, log });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/telemetry/stats
// @desc    Get aggregated telemetry stats and charts data
router.get('/stats', async (req, res) => {
  try {
    const stats = await storage.getTelemetryStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
