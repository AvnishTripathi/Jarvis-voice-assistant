const express = require('express');
const os = require('os');
const router = express.Router();

// @route   GET /api/ai/status
// @desc    Check if server-side Gemini AI key is configured
router.get('/status', (req, res) => {
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
  res.json({
    success: true,
    hasServerKey,
    supportedModels: [
      'gemini-3.6-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-pro'
    ]
  });
});

// Detect if user is asking about system hardware / memory / processes
function isSystemQuery(prompt) {
  return /\b(cpu|ram|memory|hardware|metrics|processes|system|telemetry|usage|performance|disk|storage|uptime|cores|specs|inspect)\b/i.test(prompt);
}

// Collect real live system telemetry from the host machine
function getLiveSystemData() {
  const cpus = os.cpus() || [];
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const uptimeSec = Math.floor(os.uptime());

  // Calculate per-core CPU load
  const coreLoads = cpus.map(cpu => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    const idle = cpu.times.idle;
    return Math.round(((total - idle) / total) * 100);
  });
  const avgCpu = coreLoads.length > 0
    ? Math.round(coreLoads.reduce((a, b) => a + b, 0) / coreLoads.length)
    : 0;

  let platform = os.platform();
  if (platform === 'win32') platform = 'Windows';
  else if (platform === 'darwin') platform = 'macOS';
  else if (platform === 'linux') platform = 'Linux';

  return `
=== LIVE SYSTEM TELEMETRY (collected right now) ===
Platform   : ${platform} ${os.release()} (${os.arch()})
Hostname   : ${os.hostname()}
Uptime     : ${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m
CPU Model  : ${cpus.length > 0 ? cpus[0].model.trim() : 'Unknown'}
CPU Cores  : ${cpus.length}
CPU Load   : ~${avgCpu}% average (cores: ${coreLoads.join('%, ')}%)
RAM Total  : ${(totalMem / 1024 ** 3).toFixed(2)} GB
RAM Used   : ${(usedMem / 1024 ** 3).toFixed(2)} GB (${Math.round((usedMem / totalMem) * 100)}%)
RAM Free   : ${(freeMem / 1024 ** 3).toFixed(2)} GB
Node PID   : ${process.pid} | Node Mem: ${(process.memoryUsage().rss / 1024 ** 2).toFixed(1)} MB
====================================================
Note: Per-process memory breakdown requires OS-level tools (tasklist/ps). Report what you have above.
`;
}

// @route   POST /api/ai/chat
// @desc    Server-side Gemini gateway with real-time system telemetry injection
router.post('/chat', async (req, res) => {
  try {
    const { prompt, history, apiKey, systemPrompt, maxTokens } = req.body;
    const key = apiKey || (process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here' ? process.env.GEMINI_API_KEY : null);

    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }

    if (!key) {
      return res.status(400).json({ success: false, message: 'Gemini API key is required (none configured on server or in request)' });
    }

    const JARVIS_SYSTEM = systemPrompt || `You are JARVIS, an advanced AI personal assistant. Address user as Sir. Be concise and direct. When given real system telemetry data, report the exact numbers in a clean formatted table. Never say you cannot access system data if telemetry is provided to you.`;

    // Inject live telemetry if this is a hardware/system question
    let finalPrompt = prompt;
    if (isSystemQuery(prompt)) {
      const telemetry = getLiveSystemData();
      finalPrompt = `${prompt}\n\n${telemetry}\n\nUsing the live data above, give me a detailed formatted report with exact numbers.`;
    }

    const contents = [
      { role: 'user', parts: [{ text: JARVIS_SYSTEM }] },
      { role: 'model', parts: [{ text: 'Understood, Sir. JARVIS core online. I have direct access to live system telemetry.' }] },
      ...(history || []).flatMap(h => [
        { role: 'user', parts: [{ text: h.user }] },
        { role: 'model', parts: [{ text: h.model }] }
      ]),
      { role: 'user', parts: [{ text: finalPrompt }] }
    ];

    const candidateModels = [
      'gemini-3.6-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-pro'
    ];
    let lastError = null;
    let reply = null;

    for (const model of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: maxTokens || 500
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (reply) break;
        } else {
          const errData = await response.json();
          lastError = errData?.error?.message || `HTTP ${response.status}`;
        }
      } catch (e) {
        lastError = e.message;
      }
    }

    if (!reply) {
      return res.status(502).json({ success: false, message: lastError || 'AI models unavailable' });
    }

    res.json({ success: true, reply });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

