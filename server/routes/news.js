/* ═══════════════════════════════════════════════════════════
   J.A.R.V.I.S — Server-Side High Reliability News Aggregator
   Fetches directly from BBC, Reuters, Google News RSS.
   Zero CORS blocking. Instant, reliable response.
   ═══════════════════════════════════════════════════════════ */

const express = require('express');
const router = express.Router();

const RSS_FEEDS = {
  top:        ['https://feeds.bbci.co.uk/news/rss.xml', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
  technology: ['https://feeds.bbci.co.uk/news/technology/rss.xml', 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml'],
  science:    ['https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', 'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml'],
  sports:     ['https://feeds.bbci.co.uk/sport/rss.xml', 'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml'],
  business:   ['https://feeds.bbci.co.uk/news/business/rss.xml', 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml'],
  world:      ['https://feeds.bbci.co.uk/news/world/rss.xml', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
  india: [
    'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en',
    'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    'https://feeds.bbci.co.uk/news/world/south_asia/rss.xml'
  ]
};

function parseXMLItems(xml, limit = 5) {
  const items = [];
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const itemXml of itemMatches.slice(0, limit)) {
    const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || itemXml.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch  = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
    if (titleMatch && titleMatch[1]) {
      const cleanTitle = titleMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/ - [^-]+$/, '')
        .trim();
      items.push({
        title: cleanTitle,
        link: linkMatch ? linkMatch[1].trim() : ''
      });
    }
  }
  return items;
}

async function fetchFromUrls(urls, limit = 4) {
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!resp.ok) continue;
      const xml = await resp.text();
      const items = parseXMLItems(xml, limit);
      if (items.length > 0) return items;
    } catch {
      continue;
    }
  }
  return [];
}

// Single category endpoint
router.get('/feed', async (req, res) => {
  const cat = (req.query.category || 'top').toLowerCase();
  const urls = RSS_FEEDS[cat] || RSS_FEEDS.top;
  const items = await fetchFromUrls(urls, 5);

  if (items.length > 0) {
    return res.json({ success: true, category: cat, items });
  }
  return res.status(502).json({ success: false, message: 'News feeds temporarily unreachable' });
});

// Dual World + India Combined Endpoint
router.get('/combo', async (req, res) => {
  const [worldItems, indiaItems] = await Promise.all([
    fetchFromUrls(RSS_FEEDS.world, 3),
    fetchFromUrls(RSS_FEEDS.india, 3)
  ]);

  return res.json({
    success: true,
    world: worldItems,
    india: indiaItems
  });
});


module.exports = router;
