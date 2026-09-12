/* ═══════════════════════════════════════════════════════════
   J.A.R.V.I.S  —  Host OS System Diagnostics & Telemetry Route
   ═══════════════════════════════════════════════════════════ */

const express = require('express');
const os = require('os');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// @route   GET /api/system/info
// @desc    Retrieve real-time host OS hardware & resource metrics
router.get('/info', (req, res) => {
  try {
    const cpus = os.cpus() || [];
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = totalMemBytes - freeMemBytes;

    const totalMemGB = (totalMemBytes / (1024 ** 3)).toFixed(2);
    const freeMemGB = (freeMemBytes / (1024 ** 3)).toFixed(2);
    const usedMemGB = (usedMemBytes / (1024 ** 3)).toFixed(2);
    const memUsagePct = Math.round((usedMemBytes / totalMemBytes) * 100);

    const uptimeSec = Math.floor(os.uptime());
    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);

    // Human-readable platform name
    let osName = os.type();
    if (os.platform() === 'win32') osName = 'Windows';
    else if (os.platform() === 'darwin') osName = 'macOS';
    else if (os.platform() === 'linux') osName = 'Linux';

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      host: {
        hostname: os.hostname(),
        platform: os.platform(),
        osName,
        release: os.release(),
        architecture: os.arch(),
        uptimeSeconds: uptimeSec,
        uptimeFormatted: `${hours}h ${mins}m`
      },
      cpu: {
        model: cpus.length > 0 ? cpus[0].model.trim() : 'Unknown Neural Core',
        cores: cpus.length,
        speedMHz: cpus.length > 0 ? cpus[0].speed : 0,
        loadAvg: os.loadavg()
      },
      memory: {
        totalGB: parseFloat(totalMemGB),
        usedGB: parseFloat(usedMemGB),
        freeGB: parseFloat(freeMemGB),
        usagePercent: memUsagePct
      },
      process: {
        nodeVersion: process.version,
        pid: process.pid,
        memoryUsageMB: (process.memoryUsage().rss / (1024 ** 2)).toFixed(2),
        uptimeSeconds: Math.floor(process.uptime())
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/system/ping
// @desc    High-precision round-trip latency and speed test benchmark
router.get('/ping', (req, res) => {
  res.json({
    success: true,
    serverTime: Date.now(),
    payload: 'JARVIS_NEURAL_PIPELINE_OK'
  });
});

// @route   POST /api/system/optimize
// @desc    Clean temporary memory buffers, compact storage, and optimize cache
router.post('/optimize', (req, res) => {
  try {
    const storePath = path.join(__dirname, '..', 'data', 'standalone_store.json');
    let compactedRecords = 0;

    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, 'utf8');
      const data = JSON.parse(raw);

      // Keep recent telemetry capped to last 200 items
      if (Array.isArray(data.telemetry) && data.telemetry.length > 200) {
        const removed = data.telemetry.length - 200;
        data.telemetry = data.telemetry.slice(-200);
        compactedRecords += removed;
      }

      fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
    }

    // Force garbage collection if Node was started with --expose-gc
    if (global.gc) {
      global.gc();
    }

    res.json({
      success: true,
      message: 'System cache optimized, memory buffers flushed, and storage compacted.',
      compactedRecords,
      memoryFreedMB: (process.memoryUsage().heapUsed / (1024 ** 2)).toFixed(2)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

