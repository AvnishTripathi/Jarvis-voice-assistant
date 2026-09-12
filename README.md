# 🔊 J.A.R.V.I.S — Production Multimodal AI Voice Assistant

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org)
[![Version](https://img.shields.io/badge/Version-v6.2.0-cyan.svg)](https://github.com)
[![Build Status](https://img.shields.io/badge/System%20Tests-19%2F19%20Passing-success.svg)](server/test_system.js)

**J.A.R.V.I.S** (*Just A Rather Very Intelligent System*) is a production-grade, multimodal AI voice assistant engineered with a cybernetic Iron Man HUD, Web Speech recognition & synthesis, browser-based Face-API.js ML biometric security, Chart.js neural telemetry, and a resilient fullstack Node.js / Express backend with automated failover between MongoDB and local standalone persistence.

---

## 🖥️ System Interface



<p align="center">
 <img width="959" height="539" alt="my-jarvis png" src="https://github.com/user-attachments/assets/794f80e9-60d2-4eee-8c03-cdd9d0feacec" />
</p>

<p align="center">
  <b>Holographic Arc Reactor HUD</b> • <b>Real-Time Neural Telemetry</b> • <b>Bilingual Voice Engine</b> • <b>Stark Security Biometrics</b>
</p>


---


## 🌟 Core System Architecture

```
                               ┌────────────────────────────────────────┐
                               │       J.A.R.V.I.S Client HUD           │
                               │  (Web Speech API + Face-API + Chart.js)│
                               └──────────────────┬─────────────────────┘
                                                  │
                                                  ▼
                        ┌──────────────────────────────────────────────────┐
                        │      Resilient 3-Tier AI Execution Pipeline      │
                        ├──────────────────────────────────────────────────┤
                        │ Tier 1: Express Server AI Gateway (/api/ai/chat) │
                        │ Tier 2: Direct Client Gemini 2.0 / 1.5 Call      │
                        │ Tier 3: Zero-Latency Local Knowledge + Wikipedia │
                        └─────────────────────────┬────────────────────────┘
                                                  │
                                                  ▼
                        ┌──────────────────────────────────────────────────┐
                        │      Dual-Mode Enterprise Data Persistence       │
                        ├──────────────────────────────────────────────────┤
                        │ Online:     MongoDB Mongoose (Atlas / Local)     │
                        │ Standalone: ACID-Safe Local JSON Storage Adapter │
                        └──────────────────────────────────────────────────┘
```

### 1. 🧠 Resilient 3-Tier AI Brain
- **Tier 1 (Server AI Gateway)**: Routes prompts through the secure Express backend gateway (`/api/ai/chat`), keeping API keys confidential and enforcing rate-limit handling.
- **Tier 2 (Direct Client Gemini)**: If running without the backend server, connects directly from the browser to Google AI Studio using modern `gemini-2.0-flash`, `gemini-1.5-flash`, and `gemini-2.0-flash-lite` models.
- **Tier 3 (Zero-Latency Fallback)**: Built-in neural knowledge base and live Wikipedia REST API ensure answers are provided even with no API key or during network downtime.

### 2. 🛡️ Biometric Security & Cryptographic Vault
- **Face-API.js ML**: Real-time 68-point neural landmark tracking and TinyFaceNet embeddings for master user facial verification.
- **AES-256 Storage Vault**: Encrypts biometric face embeddings, API keys, phonebook contacts, and telemetry in browser storage.
- **Dual-Mode Persistence**: The backend automatically uses MongoDB if available, or switches instantly without hanging to a persistent local store (`server/data/standalone_store.json`).

### 3. 🎙️ Bilingual NLP & Hands-Free "Iron Man" Mode
- **Bilingual NLP**: Full support for English (`en-US`) and Hindi (`hi-IN`) voice queries, jokes, greetings, and commands.
- **Iron Man Mode**: Always-on voice recognition with an automatic keepalive watchdog—no wake word or button click required after activation.

### 4. 🛰️ Autonomous Satellite & Environmental Telemetry
- **Precision Meteorological Engine**: Auto-detects local GPS coordinates, temperature, humidity, and weather conditions via Open-Meteo & wttr.in.
- **Dual India & Global News Aggregator**: High-speed server-side RSS feeds combining regional headlines (*Google News India, Times of India*) and international stories (*BBC World, NYT*).
- **Direct YouTube Video Resolver**: Server-side metadata resolution to find and play direct YouTube watch URLs via voice.
- **Foreign Exchange Engine**: Live currency conversions backed by Open Exchange Rates and European Central Bank telemetry.
- **Android Ready (Capacitor)**: Built-in native Android project configured for Google Play Store release.

---


## 🚀 Quickstart & Setup

### Prerequisites
- [Node.js](https://nodejs.org) (v18.0.0 or higher)
- Google Chrome (recommended for Web Speech API and Face-API camera access)

### 1. Installation
Clone the repository and install server dependencies:
```bash
git clone https://github.com/AvnishTripathi/jarvis-voice-assistant.git
cd jarvis-voice-assistant
npm install --prefix server
```

### 2. Configuration (Optional)
Copy the environment template:
```bash
cp server/.env.example server/.env
```
Edit `server/.env` to configure your settings:
```env
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb://localhost:27017/jarvis_ai_db
JWT_SECRET=jarvis_stark_industries_secret_key_2026
GEMINI_API_KEY=your_optional_gemini_api_key_here
```
*(Note: If MongoDB is not running, JARVIS automatically runs in Resilient Standalone Mode—no setup required!)*

### 3. Launch the Server
Start the production server from the project root:
```bash
npm start
```
Open **`http://localhost:5000`** in Google Chrome.

---

## 🧪 Automated Testing

JARVIS includes an automated 19-point system verification suite testing API health, bcrypt auth, JWT issuance, biometric updates, contacts CRUD, reminders scheduling, telemetry analytics, and static asset delivery:

```bash
npm test
```

Expected output:
```text
=============================================================
       J.A.R.V.I.S  PRODUCTION SYSTEM VERIFICATION SUITE       
=============================================================
1. Health & Server Diagnostics:
  ✔ [PASS] System Health Status Endpoint (Database: STANDALONE_LOCAL, Version: v6.2.0)
2. User Authentication & Biometrics:
  ✔ [PASS] User Registration with Bcrypt & JWT
  ✔ [PASS] User Login with Password Authentication
  ✔ [PASS] Rejection of Invalid Credentials
  ✔ [PASS] Biometric Facial Descriptor Update
...
=============================================================
TOTAL TESTS: 19 | PASSED: 19 | FAILED: 0
=============================================================
🎉 ALL SYSTEMS PRODUCTION READY AND VERIFIED SUCCESSFULLY!
```

---

## 📡 REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | System health, database state, uptime, and version |
| `/api/auth/register` | `POST` | Register new user with bcrypt password and face descriptor |
| `/api/auth/login` | `POST` | Authenticate user credentials and issue 7-day JWT token |
| `/api/auth/update-face` | `POST` | Update enrolled biometric facial embeddings |
| `/api/contacts` | `GET` | Retrieve list of phonebook contacts |
| `/api/contacts` | `POST` | Save or update a contact |
| `/api/contacts/:name` | `DELETE` | Remove a contact by name |
| `/api/reminders` | `GET` | List active scheduled task timers |
| `/api/reminders` | `POST` | Create a new scheduled reminder |
| `/api/reminders/:id` | `DELETE` | Delete or clear a reminder |
| `/api/telemetry/log` | `POST` | Log classified query utterance and latency |
| `/api/telemetry/stats` | `GET` | Aggregated NLP intent breakdown and KPI metrics |
| `/api/ai/status` | `GET` | Check server-side Gemini AI gateway readiness |
| `/api/ai/chat` | `POST` | Server-side Gemini AI proxy gateway |

---

## 🗣️ Voice Command Reference

### System & Controls
- `"switch to hindi"` / `"switch to english"` — Toggle bilingual NLP mode
- `"biometric scan"` / `"lock system"` — Trigger Face-API.js security scanner
- `"show analytics"` / `"close dashboard"` — Open/close Neural Analytics HUD
- `"open reminders"` / `"remind me in 5 minutes to submit report"` — Smart task alarm

### Real-Time Live APIs (Zero-Key)
- `"weather in Tokyo"` — Live weather from `wttr.in`
- `"define serendipity"` — Dictionary definitions from `dictionaryapi.dev`
- `"top news headlines"` / `"technology news"` — BBC News live feed
- `"convert 100 dollars to rupees"` — Real-time FX exchange from `frankfurter.app`
- `"tell me a joke"` / `"ek chutkula sunao"` — Live jokes from `JokeAPI` / Hindi bank

### WhatsApp & Communications
- `"send whatsapp message to John"` — Multi-step conversational dictation
- `"add contact Pepper Potts, 9876543210"` — Store contacts in phonebook

### General & AI
- `"explain quantum entanglement"` — 3-tier Gemini AI knowledge synthesis
- `"play Bohemian Rhapsody on YouTube"` — Direct media search and launch

---

##  Repository Structure

```
jarvis-voice-assistant/
├── index.html                   # Cybernetic Holographic HUD Interface
├── style.css                    # Futuristic HUD, Scanlines & Responsive Styles
├── app.js                       # Core Assistant Engine, NLP, & Web APIs
├── package.json                 # Project root manifest & scripts
├── MAJOR_PROJECT_REPORT.md      # Comprehensive academic project documentation
├── README.md                    # Production documentation and setup
└── server/                      # Production REST API Backend
    ├── package.json             # Server dependencies and configuration
    ├── server.js                # Express app, security headers & static server
    ├── test_system.js           # Automated system verification test suite
    ├── .env.example             # Environment configuration template
    ├── data/                    # Local persistent storage directory
    │   └── standalone_store.json # ACID-safe JSON fallback database
    ├── models/                  # Mongoose Schemas (User, Contact, Reminder, Telemetry)
    ├── routes/                  # Express REST API Routes (auth, ai, contacts, reminders, telemetry)
    └── services/                # Backend services
        └── storageAdapter.js    # Dual-mode (MongoDB + Standalone) storage engine
```

---

##  Credits & License

- **Author**: Avnish Tripathi
- **License**: [MIT](LICENSE)
- **Built for**: Educational & Advanced Multimodal Assistant Demonstration
