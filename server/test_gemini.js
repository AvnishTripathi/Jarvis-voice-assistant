// Quick diagnostic script to check valid Gemini endpoints and models

async function testEndpoints() {
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp'
  ];

  const versions = ['v1beta', 'v1'];
  
  console.log("=== GEMINI API MODEL DIAGNOSTIC ===");
  console.log("To test with your key, run: node test_gemini.js YOUR_API_KEY");
  const key = process.argv[2] || process.env.GEMINI_API_KEY || 'TEST_KEY';

  for (const ver of versions) {
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${key}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Hello" }] }]
          })
        });
        const status = res.status;
        const text = await res.text();
        console.log(`[${ver}] ${model} -> HTTP ${status} | ${text.slice(0, 100)}`);
      } catch (err) {
        console.log(`[${ver}] ${model} -> ERROR: ${err.message}`);
      }
    }
  }
}

testEndpoints();
