/* ═══════════════════════════════════════════════════════════
   J.A.R.V.I.S — YouTube First-Result Resolver
   Uses free Invidious API (open-source YouTube frontend)
   No API key required. Falls back across multiple instances.
   ═══════════════════════════════════════════════════════════ */

const express = require('express');
const router = express.Router();

const INVIDIOUS_INSTANCES = [
  'https://iv.ggtyler.dev',
  'https://invidious.nerdvpn.de',
  'https://invidious.privacyredirect.com',
  'https://yt.artemislena.eu',
  'https://invidious.fdn.fr',
];

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ success: false, message: 'Query q is required' });

  let videoId = null, videoTitle = null;

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(q)}&type=video&page=1`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) continue;
      const data = await response.json();
      if (!Array.isArray(data) || !data.length) continue;
      const first = data.find(item => item.type === 'video' && item.videoId);
      if (first) { videoId = first.videoId; videoTitle = first.title || q; break; }
    } catch { continue; }
  }

  if (!videoId) {
    return res.json({
      success: false,
      fallbackUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      message: 'Invidious unavailable — use search page'
    });
  }

  return res.json({
    success: true,
    videoId,
    title: videoTitle,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1`
  });
});

module.exports = router;
