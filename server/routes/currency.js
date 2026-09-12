/* ═══════════════════════════════════════════════════════════
   J.A.R.V.I.S — High-Reliability Currency Exchange Engine
   Multi-API Fallback: open.er-api.com -> frankfurter.app
   ═══════════════════════════════════════════════════════════ */

const express = require('express');
const router = express.Router();

router.get('/convert', async (req, res) => {
  const amount = parseFloat(req.query.amount) || 1;
  const from = (req.query.from || 'USD').toUpperCase();
  const to = (req.query.to || 'INR').toUpperCase();

  // 1. Try open.er-api.com (100% free, fast, supports INR, USD, EUR, etc.)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(`https://open.er-api.com/v6/latest/${from}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (r.ok) {
      const d = await r.json();
      if (d.result === 'success' && d.rates && d.rates[to] !== undefined) {
        const rate = d.rates[to];
        const result = amount * rate;
        return res.json({ success: true, amount, from, to, rate, result });
      }
    }
  } catch (e) {}

  // 2. Fallback to Frankfurter API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(`https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (r.ok) {
      const d = await r.json();
      if (d.rates && d.rates[to] !== undefined) {
        const result = d.rates[to];
        const rate = result / amount;
        return res.json({ success: true, amount, from, to, rate, result });
      }
    }
  } catch (e) {}

  return res.status(502).json({ success: false, message: `Could not convert ${from} to ${to}` });
});

module.exports = router;
