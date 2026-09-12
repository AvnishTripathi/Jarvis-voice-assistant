/* ═══════════════════════════════════════════════════════════
   J.A.R.V.I.S  —  Automated System Integration & Health Test Suite
   ═══════════════════════════════════════════════════════════ */

process.env.NODE_ENV = 'test';
process.env.PORT = '5099';

const http = require('http');
const path = require('path');
const { app } = require('./server');

const TEST_PORT = 5099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let server = null;
let passedCount = 0;
let failedCount = 0;

function logTest(name, passed, detail = '') {
  if (passed) {
    passedCount++;
    console.log(`  \x1b[32m✔\x1b[0m [PASS] ${name} ${detail ? '(' + detail + ')' : ''}`);
  } else {
    failedCount++;
    console.log(`  \x1b[31m✖\x1b[0m [FAIL] ${name} ${detail ? '— ' + detail : ''}`);
  }
}

async function request(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, data, headers: res.headers };
}

async function runTests() {
  console.log('\n=============================================================');
  console.log('       J.A.R.V.I.S  PRODUCTION SYSTEM VERIFICATION SUITE       ');
  console.log('=============================================================\n');

  try {
    // Start temporary test server
    server = app.listen(TEST_PORT);
    await new Promise(resolve => setTimeout(resolve, 500));

    // ─────────────────────────────────────────────────────────
    // Test 1: Health & Dual-Mode Status
    // ─────────────────────────────────────────────────────────
    console.log('1. Health & Server Diagnostics:');
    const health = await request('GET', '/api/health');
    logTest(
      'System Health Status Endpoint',
      health.status === 200 && health.data.status === 'ONLINE',
      `Database: ${health.data.database}, Version: ${health.data.version}`
    );

    // ─────────────────────────────────────────────────────────
    // Test 2: User Authentication & JWT Security
    // ─────────────────────────────────────────────────────────
    console.log('\n2. User Authentication & Biometrics:');
    const testUser = {
      username: 'stark_tester_' + Date.now(),
      email: `tony_${Date.now()}@stark.ai`,
      password: 'ArcReactorPassword2026!',
      faceDescriptor: [0.12, -0.45, 0.88, 0.05]
    };

    const regRes = await request('POST', '/api/auth/register', testUser);
    const userCreated = regRes.status === 201 && regRes.data.success && Boolean(regRes.data.token);
    logTest('User Registration with Bcrypt & JWT', userCreated, `UserId: ${regRes.data?.user?.id}`);

    const loginRes = await request('POST', '/api/auth/login', {
      username: testUser.username,
      password: testUser.password
    });
    logTest('User Login with Password Authentication', loginRes.status === 200 && loginRes.data.success);

    const badLogin = await request('POST', '/api/auth/login', {
      username: testUser.username,
      password: 'WrongPassword'
    });
    logTest('Rejection of Invalid Credentials', badLogin.status === 400 && !badLogin.data.success);

    const userId = regRes.data?.user?.id;
    const faceUpdate = await request('POST', '/api/auth/update-face', {
      userId,
      faceDescriptor: [0.22, -0.35, 0.91, 0.12]
    });
    logTest('Biometric Facial Descriptor Update', faceUpdate.status === 200 && faceUpdate.data.success);

    // ─────────────────────────────────────────────────────────
    // Test 3: Contacts Management & Dual-Mode Storage
    // ─────────────────────────────────────────────────────────
    console.log('\n3. Contacts Directory & Persistence:');
    const saveContact = await request('POST', '/api/contacts', {
      name: 'Pepper Potts',
      phoneNumber: '+1 (555) 987-6543'
    });
    logTest('Add / Update Phonebook Contact', saveContact.status === 201 && saveContact.data.contact.phoneNumber === '15559876543');

    const listContacts = await request('GET', '/api/contacts');
    const hasPepper = listContacts.status === 200 && listContacts.data.contacts.some(c => c.name.includes('pepper potts'));
    logTest('Retrieve Phonebook Contacts List', hasPepper, `Total: ${listContacts.data?.contacts?.length}`);

    const delContact = await request('DELETE', '/api/contacts/pepper potts');
    logTest('Delete Phonebook Contact', delContact.status === 200 && delContact.data.success);

    // ─────────────────────────────────────────────────────────
    // Test 4: Task Reminders & Alarms Engine
    // ─────────────────────────────────────────────────────────
    console.log('\n4. Reminders & Scheduling Engine:');
    const reminderDue = new Date(Date.now() + 600000).toISOString();
    const saveReminder = await request('POST', '/api/reminders', {
      task: 'Initiate Mark-VII Suit Flight Diagnostics',
      dueTimestamp: reminderDue
    });
    const remId = saveReminder.data?.reminder?._id;
    logTest('Schedule Active Task Reminder', saveReminder.status === 201 && Boolean(remId));

    const listReminders = await request('GET', '/api/reminders');
    const hasRem = listReminders.status === 200 && listReminders.data.reminders.some(r => String(r._id) === String(remId));
    logTest('Fetch Active Scheduled Reminders', hasRem, `Total: ${listReminders.data?.reminders?.length}`);

    const delReminder = await request('DELETE', `/api/reminders/${remId}`);
    logTest('Delete Scheduled Reminder', delReminder.status === 200 && delReminder.data.success);

    // ─────────────────────────────────────────────────────────
    // Test 5: Telemetry & Neural Analytics
    // ─────────────────────────────────────────────────────────
    console.log('\n5. Telemetry & Intent Analytics:');
    const log1 = await request('POST', '/api/telemetry/log', {
      rawUtterance: 'What is the weather today?',
      classifiedIntent: 'Realtime APIs',
      executionEngine: 'wttr.in API',
      isSuccess: true
    });
    const log2 = await request('POST', '/api/telemetry/log', {
      rawUtterance: 'Explain quantum computing',
      classifiedIntent: 'AI & Generation',
      executionEngine: 'Gemini 2.0 Core',
      isSuccess: true
    });
    logTest('Log Utterance Telemetry Data', log1.status === 201 && log2.status === 201);

    const stats = await request('GET', '/api/telemetry/stats');
    const statsValid = stats.status === 200 && stats.data.stats.totalQueries >= 2 && stats.data.stats.intents;
    logTest('Aggregate Intent Breakdown & KPI Stats', statsValid, `Total Queries: ${stats.data?.stats?.totalQueries}`);

    // ─────────────────────────────────────────────────────────
    // Test 6: Server AI Gateway Route
    // ─────────────────────────────────────────────────────────
    console.log('\n6. AI Gateway & Model Endpoints:');
    const aiStatus = await request('GET', '/api/ai/status');
    logTest('AI Status & Model Compatibility Endpoint', aiStatus.status === 200 && Array.isArray(aiStatus.data.supportedModels));

    const aiBadReq = await request('POST', '/api/ai/chat', { prompt: '' });
    logTest('AI Gateway Prompt Validation', aiBadReq.status === 400);

    // ─────────────────────────────────────────────────────────
    // Test 7: Static Assets & Production Delivery
    // ─────────────────────────────────────────────────────────
    console.log('\n7. Frontend Static Delivery & Security Headers:');
    const htmlRes = await request('GET', '/');
    const htmlOk = htmlRes.status === 200 && typeof htmlRes.data === 'string' && htmlRes.data.includes('J.A.R.V.I.S');
    logTest('Serve index.html Landing Page', htmlOk);

    const jsRes = await request('GET', '/app.js');
    const jsOk = jsRes.status === 200 && typeof jsRes.data === 'string' && jsRes.data.includes('JarvisCryptoVault');
    logTest('Serve app.js Client Logic', jsOk);

    const cssRes = await request('GET', '/style.css');
    const cssOk = cssRes.status === 200 && typeof cssRes.data === 'string' && cssRes.data.includes('--cyan');
    logTest('Serve style.css Holographic HUD Styles', cssOk);

    const nosniff = htmlRes.headers.get('x-content-type-options') === 'nosniff';
    logTest('Security Header: X-Content-Type-Options nosniff', nosniff);

    // ─────────────────────────────────────────────────────────
    // Test 8: Host OS Telemetry & Diagnostics
    // ─────────────────────────────────────────────────────────
    console.log('\n8. Host OS Telemetry & Hardware Diagnostics:');
    const sysInfo = await request('GET', '/api/system/info');
    logTest('Host Hardware Diagnostics Endpoint', sysInfo.status === 200 && sysInfo.data.cpu?.cores > 0, `OS: ${sysInfo.data.host?.osName}, Cores: ${sysInfo.data.cpu?.cores}, RAM: ${sysInfo.data.memory?.totalGB}GB`);

    const sysPing = await request('GET', '/api/system/ping');
    logTest('High-Precision Ping Benchmark Endpoint', sysPing.status === 200 && sysPing.data.serverTime > 0);

    const sysOpt = await request('POST', '/api/system/optimize');
    logTest('Cache Optimization & Compaction Endpoint', sysOpt.status === 200 && sysOpt.data.success === true);

    // ─────────────────────────────────────────────────────────
    // Summary
    // ─────────────────────────────────────────────────────────
    console.log('\n=============================================================');
    console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: \x1b[32m${passedCount}\x1b[0m | FAILED: \x1b[31m${failedCount}\x1b[0m`);
    console.log('=============================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      console.log('🎉 ALL SYSTEMS PRODUCTION READY AND VERIFIED SUCCESSFULLY!\n');
      process.exit(0);
    }

  } catch (err) {
    console.error('\n❌ Uncaught error during system tests:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests();

