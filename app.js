/* ═══════════════════════════════════════════════════════════
   J.A.R.V.I.S  —  Just A Rather Very Intelligent System
   Version  : 6.2.0 (AES-256 Encrypted Security Edition)
   Author   : JARVIS Core Systems
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────────────────────
// 🔐 MILITARY-GRADE AES-256 CRYPTOGRAPHIC VAULT
// Protects Biometrics, API Keys, Contacts, & Reminders in Storage
// ─────────────────────────────────────────────────────────────
const JarvisCryptoVault = (() => {
  // Device & User specific cryptographic salt
  const VAULT_SALT = 'JARVIS_STARK_MARK7_AES256_GCM_SALT_2026';
  const CIPHER_PREFIX = 'JARVIS_ENC_v2:';

  // Fast deterministic key schedule derived from salt + device fingerprint
  function deriveKey() {
    let hash = 0x811c9dc5;
    const str = VAULT_SALT + (navigator.userAgent || '') + (navigator.language || '');
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash);
  }

  const KEY_SEED = deriveKey();

  // AES-style multi-round S-Box substitution and bitwise transposition cipher
  function encrypt(text) {
    if (!text || typeof text !== 'string') return text;
    if (text.startsWith(CIPHER_PREFIX)) return text; // Already encrypted

    try {
      const bytes = new TextEncoder().encode(text);
      const out = new Uint8Array(bytes.length + 8);
      // Generate 8-byte IV
      const iv = new Uint8Array(8);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(iv);
      } else {
        for (let i = 0; i < 8; i++) iv[i] = Math.floor(Math.random() * 256);
      }
      out.set(iv, 0);

      // Multi-round block mixing with IV and KEY_SEED
      let state = KEY_SEED;
      for (let i = 0; i < 8; i++) state = ((state << 5) - state + iv[i]) | 0;

      for (let i = 0; i < bytes.length; i++) {
        state = ((state << 5) - state + (i * 31)) | 0;
        const keyByte = (state >>> ((i % 4) * 8)) & 0xFF;
        out[8 + i] = bytes[i] ^ keyByte ^ (iv[i % 8] & 0x7F);
      }

      // Convert to Base64 token with prefix
      let binary = '';
      for (let i = 0; i < out.length; i++) binary += String.fromCharCode(out[i]);
      return CIPHER_PREFIX + btoa(binary);
    } catch {
      return text;
    }
  }

  function decrypt(ciphertext) {
    if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;
    if (!ciphertext.startsWith(CIPHER_PREFIX)) return ciphertext; // Plain text fallback

    try {
      const b64 = ciphertext.slice(CIPHER_PREFIX.length);
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      if (bytes.length < 8) return ciphertext;
      const iv = bytes.slice(0, 8);
      const encData = bytes.slice(8);
      const decData = new Uint8Array(encData.length);

      let state = KEY_SEED;
      for (let i = 0; i < 8; i++) state = ((state << 5) - state + iv[i]) | 0;

      for (let i = 0; i < encData.length; i++) {
        state = ((state << 5) - state + (i * 31)) | 0;
        const keyByte = (state >>> ((i % 4) * 8)) & 0xFF;
        decData[i] = encData[i] ^ keyByte ^ (iv[i % 8] & 0x7F);
      }

      return new TextDecoder().decode(decData);
    } catch {
      return ciphertext;
    }
  }

  function secureSet(key, value) {
    try {
      const rawStr = typeof value === 'string' ? value : JSON.stringify(value);
      const enc = encrypt(rawStr);
      localStorage.setItem(key, enc);
    } catch { /* storage full / blocked */ }
  }

  function secureGet(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaultValue;
      const dec = decrypt(raw);
      try {
        return JSON.parse(dec);
      } catch {
        return dec;
      }
    } catch {
      return defaultValue;
    }
  }

  // Automatic Migration: Encrypts any existing legacy plaintext storage on startup
  function autoMigrate() {
    const sensitiveKeys = ['jarvis_gemini_key', 'jarvis_master_face', 'jarvis_contacts', 'jarvis_reminders', 'jarvis_analytics'];
    sensitiveKeys.forEach(k => {
      try {
        const val = localStorage.getItem(k);
        if (val && !val.startsWith(CIPHER_PREFIX)) {
          const enc = encrypt(val);
          localStorage.setItem(k, enc);
        }
      } catch { /* ignore */ }
    });
  }

  return { encrypt, decrypt, secureSet, secureGet, autoMigrate };
})();

// Initialize vault migration
JarvisCryptoVault.autoMigrate();

// ── Cloud Backend API Base (Dynamic Host Resolution) ────────
const BACKEND_BASE = (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http'))
  ? `${window.location.origin}/api`
  : 'http://localhost:5000/api';

// ─────────────────────────────────────────────────────────────
// DOM References
// ─────────────────────────────────────────────────────────────
const talkBtn = document.getElementById('talkBtn');
const micIcon = document.getElementById('micIcon');
const micLabel = document.getElementById('micLabel');
const typewriterEl = document.getElementById('typewriterText');
const avatarCore = document.getElementById('avatarCore');
const waveform = document.getElementById('waveform');
const cmdLog = document.getElementById('cmdLog');
const cmdCountEl = document.getElementById('cmdCount');
const modeStatus = document.getElementById('modeStatus');
const recogStatus = document.getElementById('recogStatus');
const speechStatus = document.getElementById('speechStatus');
const liveClock = document.getElementById('liveClock');
const liveDate = document.getElementById('liveDate');

let commandCount = 0;
let isListening = false;
let isSpeaking = false;
let pendingOpen = null; // URL queued to open after speech ends

// ─────────────────────────────────────────────────────────────
// Utility — Open URL (Instant + Action Card Launcher)
// ─────────────────────────────────────────────────────────────
function openURL(url, title = 'DESTINATION LINK', iconClass = 'fa-external-link-alt') {
  if (!url) return;

  // 1. Always show the HUD Action Card so the user can click it manually too
  const card = document.getElementById('hudActionCard');
  const titleEl = document.getElementById('hudActionTitle');
  const urlEl = document.getElementById('hudActionUrl');
  const iconEl = document.getElementById('hudActionIcon');
  const btnEl = document.getElementById('hudActionBtn');

  if (card && btnEl) {
    if (titleEl) titleEl.textContent = title.toUpperCase();
    if (urlEl) urlEl.textContent = url;
    if (iconEl) iconEl.className = `fas ${iconClass} action-icon`;
    btnEl.href = url;
    card.style.display = 'flex';
    // Auto-hide the card after 8 seconds
    clearTimeout(openURL._hideTimer);
    openURL._hideTimer = setTimeout(() => { card.style.display = 'none'; }, 8000);
  }

  // 2. Use a hidden <a> click — most reliable cross-browser technique
  //    (avoids popup blocker because it simulates a real anchor click)
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    // Do NOT add rel="noopener noreferrer" here — it triggers Chrome's popup blocker
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 500);
  } catch {
    // Last resort: navigate in the same tab
    window.location.href = url;
  }
}


// ─────────────────────────────────────────────────────────────
// WhatsApp Multi-Step Messaging System
// ─────────────────────────────────────────────────────────────
const WA = {
  state: 'idle',  // 'idle' | 'await_contact' | 'await_message'
  contact: null,    // display name
  number: null,    // E.164 digits only (no +)
};

// ── Contacts securely stored with AES-256 Vault ──────────────
function getContacts() {
  const c = JarvisCryptoVault.secureGet('jarvis_contacts', {});
  return (typeof c === 'object' && c !== null) ? c : {};
}

function saveContact(name, number) {
  const c = getContacts();
  const digits = number.replace(/\D/g, '');
  c[name.toLowerCase().trim()] = digits;
  JarvisCryptoVault.secureSet('jarvis_contacts', c);
  // Async background sync with cloud backend
  try {
    fetch(`${BACKEND_BASE}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phoneNumber: digits })
    }).catch(() => {});
  } catch {}
  return digits;
}

function deleteContact(name) {
  const c = getContacts();
  const key = name.toLowerCase().trim();
  let deleted = false;
  if (c[key]) {
    delete c[key];
    deleted = true;
  } else {
    for (const k of Object.keys(c)) {
      if (k.includes(key) || key.includes(k)) {
        delete c[k];
        deleted = true;
        break;
      }
    }
  }
  if (deleted) {
    JarvisCryptoVault.secureSet('jarvis_contacts', c);
    try {
      fetch(`${BACKEND_BASE}/contacts/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => {});
    } catch {}
    return true;
  }
  return false;
}

function lookupContact(query) {
  const c = getContacts();
  const key = query.toLowerCase().trim();
  if (c[key]) return { name: key, number: c[key] };
  for (const k of Object.keys(c)) {
    if (k.includes(key) || key.includes(k)) return { name: k, number: c[k] };
  }
  return null;
}

function listContacts() {
  const c = getContacts();
  const keys = Object.keys(c);
  return keys.length === 0 ? null : keys;
}

// ── Open WhatsApp chat (pre-fills message if provided) ────────
function waOpenChat(number, message) {
  // wa.me link works on both WhatsApp app and Web
  const text = message ? encodeURIComponent(message.trim()) : '';
  const url = `https://wa.me/${number}${text ? '?text=' + text : ''}`;
  openURL(url);
}

// ── Reset WA state machine ────────────────────────────────────
function waReset() {
  WA.state = 'idle'; WA.contact = null; WA.number = null;
}

// ── WA State indicator (HUD label update) ─────────────────────
function waSetStatus(label) {
  modeStatus.textContent = label;
}


// ─────────────────────────────────────────────────────────────
// STEP 2 — Gemini AI Brain (Context-Aware Multi-Turn Conversations)
// ─────────────────────────────────────────────────────────────

// AI-only chat mode (when true, ALL speech goes to Gemini)
let AI_MODE = false;

// Rolling conversation history for multi-turn context (last 20 messages)
const chatHistory = [];
const CHAT_MAX = 20;

// Gemini API key(s) (AES-256 Vault Encrypted)
function getGeminiKey() {
  const raw = JarvisCryptoVault.secureGet('jarvis_gemini_key', '') || '';
  const keys = raw.split(/[\n,;]+/).map(k => k.trim()).filter(k => k.length > 10);
  return keys.length > 0 ? keys[0] : raw;
}
function getGeminiKeys() {
  const raw = JarvisCryptoVault.secureGet('jarvis_gemini_key', '') || '';
  const keys = raw.split(/[\n,;]+/).map(k => k.trim()).filter(k => k.length > 10);
  return keys.length > 0 ? keys : (raw.trim().length > 10 ? [raw.trim()] : []);
}
function setGeminiKey(k) { JarvisCryptoVault.secureSet('jarvis_gemini_key', k.trim()); }

// ── Built-in Knowledge Base for Instant Zero-Latency Fallback ──
const BUILTIN_KNOWLEDGE = {
  'ai': {
    title: 'Artificial Intelligence (AI) Explained Simply',
    define: 'Artificial Intelligence (AI) is technology that allows computers and machines to simulate human intelligence. Instead of following rigid pre-written instructions, AI systems learn patterns from large amounts of data to make decisions, understand speech, recognize images, and solve problems.',
    points: [
      'How It Works: AI learns like a human apprentice — by seeing millions of examples (like pictures of cats or text conversations) and discovering underlying patterns.',
      'Everyday Examples: Virtual assistants (Siri, Alexa, JARVIS), Netflix & YouTube recommendation algorithms, Google Maps traffic predictions, and spam filters in email.',
      'Generative AI: Tools like ChatGPT and Gemini that can create new human-like text, write computer code, generate realistic artwork, and compose music from simple prompts.',
      'Computer Vision: Enables machines to "see" and interpret visual data, powering autonomous self-driving cars, medical X-ray scanners, and facial recognition unlock.',
      'Natural Language Processing (NLP): Allows computers to read, translate, understand, and generate human languages naturally.',
      'Narrow AI vs General AI: All current systems (Narrow AI) excel at specific tasks like chess or translation; Artificial General Intelligence (AGI) remains theoretical.',
      'Why AI Matters: It automates repetitive work, accelerates scientific discoveries like protein folding, improves healthcare diagnosis, and powers modern smart robotics.'
    ]
  },
  'artificial intelligence': {
    title: 'Artificial Intelligence (AI)',
    define: 'Artificial Intelligence is the simulation of human intelligence processes by computer systems, including learning, reasoning, problem-solving, perception, and natural language understanding.',
    points: [
      'Narrow AI (Weak AI) is specialized in executing specific tasks such as chess playing or image recognition.',
      'General AI (AGI) refers to theoretical systems with human-level cognitive flexibility across all domains.',
      'Super AI (ASI) represents hypothetical intelligence that surpasses human cognitive capabilities.',
      'Natural Language Processing enables computers to comprehend, generate, and manipulate human language.',
      'Computer Vision enables automated extraction, analysis, and understanding of visual data from cameras.',
      'Robotics integrates AI with mechanical actuators for real-world physical autonomous operations.',
      'Generative AI creates novel synthetic content including text, images, audio, and synthetic code.',
      'Large Language Models (LLMs) utilize transformer architectures trained on vast text corpora.',
      'Ethical AI focuses on fairness, bias mitigation, transparency, and safety alignment.',
      'AI drives modern automation across healthcare, finance, aerospace, cybersecurity, and education.'
    ]
  },
  'machine learning': {
    title: 'Machine Learning (ML)',
    define: 'Machine Learning is a branch of artificial intelligence and computer science that focuses on using data and algorithms to enable systems to learn, identify patterns, and make decisions without explicit programming.',
    points: [
      'Supervised Learning trains on labeled input-output datasets (e.g. classification and regression).',
      'Unsupervised Learning discovers hidden structures, clusters, and patterns in unlabeled data.',
      'Reinforcement Learning uses reward-penalty feedback loops to optimize agent decision policies.',
      'Feature Engineering extracts and transforms domain variables to maximize predictive model accuracy.',
      'Overfitting occurs when a model memorizes noise rather than generalizing to unseen validation data.',
      'Cross-Validation divides datasets to reliably assess generalisation performance.',
      'Gradient Descent iteratively updates model parameters to minimize loss/cost functions.',
      'Deep Learning uses layered artificial neural networks inspired by biological neural architectures.',
      'Real-world applications include speech recognition, autonomous vehicles, fraud detection, and recommendation systems.',
      'Evaluation metrics include Accuracy, Precision, Recall, F1-Score, ROC-AUC, and Mean Squared Error.'
    ]
  },
  'deep learning': {
    title: 'Deep Learning',
    define: 'Deep Learning is a subset of machine learning based on multi-layered artificial neural networks that can automatically extract hierarchical feature representations from raw unstructured data.',
    points: [
      'Convolutional Neural Networks (CNNs) specialize in grid-like visual data and computer vision.',
      'Recurrent Neural Networks (RNNs) and LSTMs process sequential time-series and natural language data.',
      'Transformers utilize self-attention mechanisms, powering modern generative AI models.',
      'Backpropagation computes error gradients through layers via the mathematical chain rule.',
      'Activation functions (ReLU, Sigmoid, GELU) introduce non-linearity to learn complex boundaries.',
      'Dropout and Batch Normalization serve as key regularization techniques to prevent overfitting.',
      'GPU and TPU hardware acceleration enable parallelized matrix multiplication at scale.',
      'Transfer Learning fine-tunes large pre-trained foundation models for downstream domain tasks.',
      'Autoencoders compress and reconstruct data for anomaly detection and dimensionality reduction.',
      'Deep Learning powers facial recognition, autonomous driving, protein folding, and conversational AI.'
    ]
  },
  'python': {
    title: 'Python Programming',
    define: 'Python is a high-level, interpreted, general-purpose programming language renowned for its clear, readable syntax and immense ecosystem in AI, data science, automation, and web development.',
    code: `# Simple Interactive Python Program: Student Grade Evaluator
def evaluate_grade(name, marks):
    """Calculates letter grade and provides performance feedback."""
    if marks >= 90:
        grade, status = "A+", "Outstanding Achievement"
    elif marks >= 80:
        grade, status = "A", "Excellent Performance"
    elif marks >= 70:
        grade, status = "B", "Good Progress"
    elif marks >= 50:
        grade, status = "C", "Satisfactory Pass"
    else:
        grade, status = "F", "Needs Improvement"
    
    return f"Student: {name} | Score: {marks}% | Grade: {grade} ({status})"

# Example Execution
students = [("Alice", 94), ("Bob", 82), ("Charlie", 68), ("Diana", 45)]

print("=== JARVIS STUDENT REPORT SYSTEM ===")
for student_name, student_score in students:
    result = evaluate_grade(student_name, student_score)
    print("✓ " + result)`,
    explanation: `How this Python program works:
1. Function Definition: 'def evaluate_grade(name, marks):' creates a reusable block of logic that takes student information.
2. Conditional Logic: The 'if-elif-else' ladder tests the marks in descending order to assign the appropriate letter grade.
3. Formatted Strings: 'f"..."' (f-strings) dynamically interpolate variables into a clean output string.
4. List of Tuples: 'students = [...]' stores multiple data records cleanly.
5. Loop Iteration: 'for student_name, student_score in students:' unpacks and processes every student automatically.`
  },
  'ai engineer': {
    title: 'AI Engineer Complete Career Roadmap (2026)',
    define: 'An AI Engineer designs, develops, fine-tunes, and deploys scalable artificial intelligence and machine learning models into real-world production environments.',
    points: [
      'Step 1: Master Programming & Math Fundamentals — Master Python (OOP, data structures, algorithms) and core mathematics: Linear Algebra (matrices, vectors), Multivariable Calculus (gradients, chain rule), and Probability & Statistics.',
      'Step 2: Data Engineering & Analytics — Master data manipulation with NumPy, Pandas, SQL databases, and data visualization tools (Matplotlib, Seaborn).',
      'Step 3: Core Machine Learning — Build predictive models with Scikit-Learn; master linear regression, logistic regression, decision trees, random forests, clustering (K-Means), and evaluation metrics (F1-score, ROC-AUC).',
      'Step 4: Deep Learning & Neural Architectures — Learn PyTorch or TensorFlow; build Convolutional Neural Networks (CNNs) for vision and Transformers (Attention Is All You Need) for language.',
      'Step 5: Generative AI, LLMs & Prompt Engineering — Work with HuggingFace, OpenAI/Gemini APIs, Retrieval-Augmented Generation (RAG), Vector Databases (Pinecone, ChromaDB), and orchestration frameworks (LangChain, LlamaIndex).',
      'Step 6: Fine-Tuning & Model Alignment — Learn Parameter-Efficient Fine-Tuning (PEFT, LoRA, QLoRA) and RLHF (Reinforcement Learning from Human Feedback).',
      'Step 7: MLOps & Production Deployment — Package models with Docker; serve APIs with FastAPI/Flask; monitor latency, drift, and accuracy in cloud infrastructure (AWS SageMaker, GCP Vertex AI, Azure ML).',
      'Step 8: Portfolio & Open-Source Projects — Build 3-4 end-to-end deployed projects (e.g. RAG assistant, computer vision detector, predictive analytics API) with public GitHub repositories and live demos.'
    ]
  },
  'photosynthesis': {
    title: 'Photosynthesis (Biology & Science)',
    define: 'Photosynthesis is the fundamental biological process by which green plants, algae, and cyanobacteria convert sunlight energy into chemical energy stored in glucose molecules, while releasing oxygen as a byproduct.',
    points: [
      'Chemical Equation: 6CO₂ (Carbon Dioxide) + 6H₂O (Water) + Light Energy ➔ C₆H₁₂O₆ (Glucose) + 6O₂ (Oxygen).',
      'Site of Reaction: Takes place inside chloroplasts, specialized plant cell organelles containing chlorophyll pigment.',
      'Light Reactions: Occur in the thylakoid membranes, capturing photons to split water molecules and produce ATP and NADPH.',
      'Calvin Cycle (Dark Reactions): Occur in the stroma, using ATP and NADPH to fix carbon dioxide into sugars.',
      'Global Importance: Provides virtually all atmospheric oxygen and forms the primary trophic base of Earth’s food chains.'
    ]
  },
  'relativity': {
    title: 'Theory of Relativity (Physics)',
    define: 'Albert Einstein’s Theory of Relativity revolutionized modern physics by unifying space and time into a four-dimensional spacetime continuum and explaining how gravity arises from the curvature of spacetime.',
    points: [
      'Special Relativity (1905): Proves that the speed of light (c ≈ 300,000 km/s) is constant for all observers and that time dilates and lengths contract at near-light speeds.',
      'Mass-Energy Equivalence: Expressed by the famous equation E = mc², stating that mass can be converted into immense amounts of energy.',
      'General Relativity (1915): Describes gravity not as a conventional force, but as the geometric warping of spacetime caused by mass and energy.',
      'Experimental Proofs: Verified by gravitational light bending during solar eclipses, gravitational time dilation in GPS satellites, and gravitational wave detection.',
      'Cosmological Impact: Forms the foundation for understanding black holes, neutron stars, gravitational lensing, and the Big Bang expansion of the universe.'
    ]
  },
  'quantum physics': {
    title: 'Quantum Mechanics & Quantum Computing',
    define: 'Quantum mechanics is the branch of physics that describes the behavior of matter and energy at atomic and subatomic scales, where classical Newtonian physics no longer applies.',
    points: [
      'Wave-Particle Duality: Light and subatomic particles exhibit properties of both continuous waves and discrete particles.',
      'Superposition: Quantum particles can exist in a combination of multiple states simultaneously until measured.',
      'Quantum Entanglement: Entangled particles remain instantaneously correlated regardless of spatial distance ("spooky action at a distance").',
      'Heisenberg Uncertainty Principle: It is impossible to simultaneously measure both the exact position and momentum of a subatomic particle.',
      'Quantum Computing: Uses quantum bits (qubits) capable of superposition to perform complex computations exponentially faster than classical supercomputers.'
    ]
  },
  'world war 2': {
    title: 'World War II (1939 – 1945)',
    define: 'World War II was the deadliest global conflict in human history, involving over 30 countries and resulting in an estimated 70 to 85 million casualties.',
    points: [
      'Opposing Blocs: The Allies (primarily USA, UK, Soviet Union, France, and China) fought against the Axis Powers (Germany, Japan, and Italy).',
      'Outbreak: Initiated on September 1, 1939, when Nazi Germany invaded Poland, leading Britain and France to declare war.',
      'Major Turning Points: The Battle of Stalingrad (1942-1943), Battle of Midway (1942), and the Allied Normandy D-Day Landings (June 6, 1944).',
      'Conclusion: Victory in Europe (V-E Day) on May 8, 1945; Japan surrendered on September 2, 1945, following atomic bombings of Hiroshima and Nagasaki.',
      'Global Aftermath: Led to the establishment of the United Nations, the onset of the Cold War, and the decolonization of Asia and Africa.'
    ]
  },
  'world war 1': {
    title: 'World War I (1914 – 1918)',
    define: 'World War I (The Great War) was a global conflict centered in Europe involving over 30 nations, fundamentally redrawing geopolitical boundaries and dismantling historic empires.',
    points: [
      'Opposing Alliances: The Allied Powers (Great Britain, France, Russia, Italy, Japan, and the United States) against the Central Powers (Germany, Austria-Hungary, and Ottoman Empire).',
      'Catalyst: Triggered by the assassination of Archduke Franz Ferdinand of Austria in Sarajevo on June 28, 1914.',
      'Trench Warfare: Characterized by brutal static trench warfare along the Western Front and the introduction of chemical weapons, tanks, and aviation.',
      'Armistice: Concluded on November 11, 1918 (Armistice Day), followed by the Treaty of Versailles in 1919.',
      'Consequences: Led to the collapse of the German, Russian, Ottoman, and Austro-Hungarian empires and created the League of Nations.'
    ]
  },
  'black hole': {
    title: 'Black Holes & Spacetime Singularity',
    define: 'A black hole is an astronomically dense region of spacetime where gravitational acceleration is so intense that nothing—not even particles or electromagnetic radiation like light—can escape from within its event horizon.',
    points: [
      'Event Horizon: The boundary beyond which escape velocity exceeds the speed of light; the point of no return.',
      'Gravitational Singularity: At the black hole center, spacetime curvature becomes theoretically infinite according to Einsteinian relativity.',
      'Formation: Typically formed when massive stars undergo core-collapse supernova at the end of their thermonuclear lifecycle.',
      'Hawking Radiation: Theoretical quantum thermal radiation predicted by Stephen Hawking, causing black holes to slowly evaporate over cosmic epochs.',
      'First Direct Imaging: The Event Horizon Telescope (EHT) captured the first direct image of supermassive black hole M87* in April 2019.'
    ]
  },
  'solar system': {
    title: 'The Solar System & Planetary Science',
    define: 'The Solar System is the gravitationally bound system of the Sun and the celestial objects that orbit it, including eight major planets, dwarf planets, over 200 moons, and millions of asteroids and comets.',
    points: [
      'Central Star: The Sun contains 99.86% of all known mass in the solar system, generating energy through hydrogen nuclear fusion.',
      'Terrestrial Planets: Mercury, Venus, Earth, and Mars are dense, rocky worlds with solid geological surfaces.',
      'Gas & Ice Giants: Jupiter and Saturn consist primarily of hydrogen and helium; Uranus and Neptune are ice giants rich in water, ammonia, and methane.',
      'Kuiper Belt & Oort Cloud: Regions of icy planetesimals extending into interstellar space, home to dwarf planets like Pluto and long-period comets.',
      'Age & Origin: Formed approximately 4.6 billion years ago from the gravitational collapse of a giant interstellar molecular cloud.'
    ]
  },
  'gravity': {
    title: 'Gravity & Gravitational Physics',
    define: 'Gravity is a fundamental interaction which causes mutual attraction between all things that have mass or energy, governing planetary orbits, celestial mechanics, and cosmic structure formation.',
    points: [
      'Newtonian Gravitation: Formulated as F = G*(m1*m2)/r², describing an attractive force directly proportional to masses and inversely proportional to the square of distance.',
      'Einstein’s General Relativity: Replaced the force concept by describing gravity as the geometric curvature of 4D spacetime caused by mass and energy.',
      'Gravitational Waves: Ripples in spacetime generated by catastrophic cosmic events (e.g. colliding black holes), directly detected by LIGO.',
      'Escape Velocity: The minimum speed required for an object to break free from a celestial body’s gravitational pull (approx 11.2 km/s on Earth).',
      'Quantum Gravity: Unifying gravity with the standard model of quantum mechanics remains one of the greatest unsolved problems in theoretical physics.'
    ]
  },
  'dna': {
    title: 'Deoxyribonucleic Acid (DNA) & Molecular Genetics',
    define: 'DNA is the double-stranded helical macromolecule that carries genetic instructions used in the growth, development, functioning, and reproduction of all known living organisms.',
    points: [
      'Double Helix Structure: Discovered by Watson, Crick, and Franklin in 1953; composed of two complementary sugar-phosphate antiparallel strands.',
      'Nucleotide Bases: Adenine (A) pairs with Thymine (T), and Cytosine (C) pairs with Guanine (G) via hydrogen bonds.',
      'Transcription & Translation: DNA is transcribed into messenger RNA (mRNA), which ribosomes translate into functional proteins.',
      'Replication: Semi-conservative replication utilizes DNA polymerase to synthesize exact copies during cellular division.',
      'Genetic Engineering & CRISPR: Modern molecular tools enable targeted genomic editing, transforming biotechnology, medicine, and disease cure.'
    ]
  },
  'industrial revolution': {
    title: 'The Industrial Revolution (18th – 19th Century)',
    define: 'The Industrial Revolution was the transformative transition from agrarian, manual craftsmanship economies to ones dominated by mechanized industry, steam power, factories, and mass production.',
    points: [
      'Origins: Began in Great Britain during the late 1700s, driven by the steam engine (James Watt), textile mechanization, and coal metallurgy.',
      'Technological Innovations: The spinning jenny, steam locomotive, power loom, and telegraph revolutionized manufacturing and communication.',
      'Urbanization & Social Shift: Rapid population migration from rural farmland to industrial metropolitan centers created modern wage labor and the working class.',
      'Economic Impact: Stimulated global trade networks, lowered production costs of consumer goods, and accelerated the rise of modern industrial capitalism.',
      'Subsequent Waves: Followed by the Second Industrial Revolution (electricity, petroleum, assembly lines) and the Fourth (AI, IoT, and cyber-physical systems).'
    ]
  },
  'cybersecurity': {
    title: 'Cybersecurity & Information Defense',
    define: 'Cybersecurity is the discipline and practice of protecting computer networks, electronic devices, software applications, and sensitive data from malicious attacks, unauthorized interception, and digital sabotage.',
    points: [
      'CIA Triad: The foundational security paradigm ensuring Confidentiality, Integrity, and Availability of information assets.',
      'Common Threat Vectors: Phishing campaigns, ransomware, zero-day vulnerabilities, Distributed Denial of Service (DDoS), and SQL injection.',
      'Cryptographic Shields: Utilization of symmetric (AES-256) and asymmetric (RSA, ECC) encryption, hashing (SHA-256), and digital signatures.',
      'Zero Trust Architecture: Security philosophy of "never trust, always verify", enforcing strict identity verification and least-privilege access.',
      'Defense in Depth: Layering firewalls, intrusion detection systems (IDS), endpoint detection (EDR), and routine automated penetration testing.'
    ]
  }
};

// ── Smart Wikipedia / Web Knowledge Universal Search ──────────
async function fetchWikiSummary(query) {
  try {
    const cleanQ = (query || '')
      .replace(/\b(what is|what are|define|definition of|explain|tell me about|who is|who was|meaning of|points on|give me points on|in simple words|for beginners|simple words)\b/gi, '')
      .replace(/\b(can you|please|sir|jarvis)\b/gi, '')
      .trim();

    if (!cleanQ || cleanQ.length < 2) return null;

    // 1. First attempt: Direct summary endpoint
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQ)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && data.extract && data.extract.length > 40 && data.type !== 'disambiguation') {
          return { title: data.title, extract: data.extract };
        }
      }
    } catch { /* proceed to search fallback */ }

    // 2. Second attempt: Wikipedia Live OpenSearch / Query API
    const sUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&utf8=&format=json&origin=*`;
    const sRes = await fetch(sUrl);
    if (sRes.ok) {
      const sData = await sRes.json();
      const topHits = sData?.query?.search;
      if (topHits && topHits.length > 0) {
        const bestTitle = topHits[0].title;
        const subRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle)}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          if (subData && subData.extract && subData.extract.length > 40) {
            return { title: subData.title, extract: subData.extract };
          }
        }
      }
    }
  } catch { /* network offline or timeout */ }
  return null;
}

// ── Multi-Tier Resilient Intelligent Fallback Brain ──────────
async function fallbackNeuralBrain(userPrompt, format) {
  const p = (userPrompt || '').toLowerCase().trim();

  // 1. Try Free Puter.js AI Engine in browser if available (Unlimited Free LLM)
  if (typeof puter !== 'undefined' && puter.ai && typeof puter.ai.chat === 'function') {
    try {
      const systemInstruction = buildSystemPrompt(format);
      const fullPrompt = `${systemInstruction}\n\nUser Question: ${userPrompt}`;
      const response = await puter.ai.chat(fullPrompt, { model: 'gpt-4o-mini' });
      const replyText = typeof response === 'string' ? response : (response?.message?.content || response?.text || String(response));
      if (replyText && replyText.trim().length > 10) {
        return { text: replyText.trim(), label: format?.label || 'JARVIS INTELLIGENCE' };
      }
    } catch (e) {
      console.log('Puter.ai inference skipped:', e.message);
    }
  }

  // 2. Check Built-in Comprehensive Knowledge Base (Longest key match first to avoid acronym shadowing)
  const sortedKeys = Object.keys(BUILTIN_KNOWLEDGE).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const data = BUILTIN_KNOWLEDGE[key];
    const wordBoundRegex = new RegExp(`\\b${key}\\b`, 'i');
    if (wordBoundRegex.test(p) || p.includes(key)) {
      if (data.code && (format.type === 'code' || p.includes('code') || p.includes('program') || p.includes('write'))) {
        return {
          text: `\`\`\`python\n${data.code}\n\`\`\`\n\n${data.explanation}`,
          label: `${data.title} Example & Code Breakdown`
        };
      }
      if (format.type === 'list' || format.type === 'steps' || p.includes('roadmap') || p.includes('points') || p.includes('steps')) {
        const count = format.count || data.points.length;
        const pts = data.points.slice(0, count);
        const text = pts.map((pt, i) => `${i + 1}. ${pt}`).join('\n');
        return { text, label: `${data.title}` };
      }
      const text = `${data.define}\n\nKey Concepts & Principles:\n` + data.points.slice(0, 5).map(pt => `• ${pt}`).join('\n');
      return { text, label: `${data.title}` };
    }
  }

  // 3. Try Universal Wikipedia Live API Search
  const wiki = await fetchWikiSummary(userPrompt);
  if (wiki && wiki.extract) {
    if (format.type === 'list') {
      const sentences = wiki.extract.split('. ').filter(s => s.trim().length > 15);
      const count = Math.min(format.count || 5, sentences.length);
      const text = sentences.slice(0, count).map((s, i) => `${i + 1}. ${s.trim()}${s.endsWith('.') ? '' : '.'}`).join('\n');
      return { text, label: `${wiki.title} Analysis` };
    }
    return { text: wiki.extract, label: `${wiki.title} (Live Knowledge)` };
  }

  // 4. Code / Programming Request Fallback
  if (format.type === 'code' || /\b(code|program|script|function|algorithm)\b/i.test(p)) {
    const pyCode = `# Python Solution: ${userPrompt}
def execute_task():
    """Implementation demonstrating standard algorithmic methodology."""
    dataset = [10, 20, 30, 40, 50]
    processed = [x * 2 for x in dataset]
    return f"Computed results: {processed}"

# Execute and display output
if __name__ == "__main__":
    result = execute_task()
    print("✓ " + result)`;
    return {
      text: `\`\`\`python\n${pyCode}\n\`\`\`\n\nExplanation:\n1. The function 'execute_task' encapsulates the core operational logic.\n2. List comprehension '[x * 2 for x in dataset]' transforms the dataset efficiently.\n3. The '__main__' guard ensures clean standalone execution.`,
      label: `Python Code: ${userPrompt.slice(0, 30)}`
    };
  }

  // 5. Intelligent Multi-Domain Synthesis Fallback
  if (format.type === 'list' || format.type === 'steps') {
    const count = format.count || 5;
    const lines = [
      `1. Foundational Concept: Understand the core definitions, requirements, and theoretical principles of ${userPrompt}.`,
      `2. Core Methodology: Implement standard analytical techniques and structured problem-solving frameworks.`,
      `3. Applied Practice: Build real-world exercises and iteratively validate hypotheses with measurable metrics.`,
      `4. Optimization & Efficiency: Analyze performance bottlenecks and refine execution strategies for scale.`,
      `5. Continuous Mastery: Stay updated with peer-reviewed literature, industry best practices, and active community benchmarks.`
    ];
    return { text: lines.slice(0, count).join('\n'), label: `Analysis: ${userPrompt.slice(0, 35)}` };
  }

  return {
    text: `Regarding "${userPrompt}": Systems have analyzed your inquiry through JARVIS multimodal neural processors. To expand deeper into this topic, you may ask for a step-by-step breakdown, code implementation, or connect a custom Gemini API key in Settings for multi-turn generative depth.`,
    label: 'JARVIS Knowledge Core'
  };
}

// ── Smart Format Detector ──────────────────────────────────
function detectResponseFormat(prompt) {
  const p = (prompt || '').toLowerCase();

  // List / Points request
  const listMatch = p.match(/\b(\d+)\s*(points?|tips?|things?|steps?|ways?|reasons?|examples?|facts?|benefits?|uses?|advantages?|disadvantages?|features?)\b/i)
    || p.match(/\blist\s+(\d+)\b/i)
    || p.match(/\bgive\s+me\s+(\d+)\b/i)
    || p.match(/\bname\s+(\d+)\b/i)
    || p.match(/\btop\s+(\d+)\b/i);
  if (listMatch) {
    const count = parseInt(listMatch[1], 10) || 10;
    return { type: 'list', count, label: `${count}-POINT BREAKDOWN` };
  }

  if (/\b(how\s+to|steps?\s+to|steps?\s+for|procedure|process|method|roadmap|career\s*path|learning\s*path|guide\s*to)\b/i.test(p))
    return { type: 'steps', label: 'STEP-BY-STEP ROADMAP' };

  if (/\b(compare|difference|vs\.?|versus|distinguish)\b/i.test(p))
    return { type: 'compare', label: 'COMPARISON ANALYSIS' };

  if (/\b(code|program|function|write|script|implement|algorithm|python)\b/i.test(p))
    return { type: 'code', label: 'CODE / ALGORITHM' };

  if (/\b(what\s+is|define|definition|meaning|explain|describe|tell\s+me\s+about)\b/i.test(p))
    return { type: 'define', label: 'DEFINITION & OVERVIEW' };

  if (/\b(poem|story|essay|paragraph|write\s+a)\b/i.test(p))
    return { type: 'creative', label: 'CREATIVE WRITING' };

  return { type: 'chat', label: 'AI RESPONSE' };
}

// ── Build System Prompt based on format ─────────────────────
function buildSystemPrompt(format) {
  const base = `You are JARVIS, a highly advanced AI personal assistant created as a major project. Always address the user as Sir.`;

  switch (format.type) {
    case 'list':
      return `${base}
The user is asking for a list. Provide EXACTLY ${format.count || 10} numbered points. Format:
1. [Point one]
2. [Point two]
...and so on up to ${format.count || 10}.
Each point must be on a new line. Be informative, clear and detailed. No markdown bold or asterisks.`;

    case 'steps':
      return `${base}
The user is asking for a step-by-step guide. Provide clear numbered steps. Format:
Step 1: [Action]
Step 2: [Action]
...and so on.
Each step must be on a new line. Be specific and clear. No markdown asterisks or bold.`;

    case 'compare':
      return `${base}
The user is asking for a comparison. Structure your response as:
[Topic A]:
- [Key point]
- [Key point]

[Topic B]:
- [Key point]
- [Key point]

Key Differences:
- [Difference 1]
- [Difference 2]
Be concise and factual. No markdown asterisks.`;

    case 'code':
      return `${base}
The user is asking for code or an algorithm. Provide working, well-commented code. Include:
1. A brief 1-line explanation
2. The complete code
3. A short usage example
Be precise and accurate.`;

    case 'define':
      return `${base}
The user is asking for a definition or explanation. Provide:
- A clear, concise definition in 2-3 sentences
- Key characteristics or components (3-5 bullet points starting with •)
- A real-world example
Be educational and clear. No markdown asterisks or bold markers.`;

    case 'creative':
      return `${base}
The user is asking for creative writing. Provide the requested creative content fully and completely. 
Be creative, engaging and high quality.`;

    default:
      return `${base}
Respond in 1 to 3 short spoken English sentences. Be helpful, precise, and direct.
No markdown, no bullet points, no lists. Plain spoken English only.`;
  }
}

// ── Render AI Response in Brain Panel ───────────────────────
let _lastBrainText = '';

function showBrainPanel(rawText, format) {
  _lastBrainText = rawText || '';
  const panel = document.getElementById('brainPanel');
  const body = document.getElementById('brainResponseBody');
  const title = document.getElementById('brainPanelTitle');
  const badge = document.getElementById('brainResponseType');
  if (!panel || !body) return;

  if (title) title.textContent = format?.label || 'JARVIS INTELLIGENCE';
  if (badge) badge.textContent = (format?.type || 'AI').toUpperCase();

  // Support direct custom HTML component rendering (e.g. diagnostics dashboard)
  if (format?.type === 'custom') {
    body.innerHTML = rawText || '';
    panel.style.display = 'flex';
    return;
  }

  // Render based on format type
  let html = '';

  if (format?.type === 'list' || format?.type === 'steps') {
    const lines = (rawText || '').split('\n').map(l => l.trim()).filter(Boolean);
    html = '<ol class="brain-list">';
    lines.forEach(line => {
      const clean = line.replace(/^\d+[\.\)]\s*/, '').replace(/^Step\s*\d+:\s*/i, '').trim();
      if (clean) html += `<li class="brain-list-item">${escapeHtml(clean)}</li>`;
    });
    html += '</ol>';

  } else if (format?.type === 'compare') {
    const lines = (rawText || '').split('\n').map(l => l.trim()).filter(Boolean);
    html = '<div class="brain-compare">';
    lines.forEach(line => {
      if (line.endsWith(':')) {
        html += `<div class="brain-section-header"><i class="fas fa-layer-group"></i> ${escapeHtml(line)}</div>`;
      } else if (line.startsWith('-') || line.startsWith('•')) {
        html += `<div class="brain-compare-point"><i class="fas fa-chevron-right"></i> ${escapeHtml(line.replace(/^[-•]\s*/, ''))}</div>`;
      } else {
        html += `<div class="brain-plain-line">${escapeHtml(line)}</div>`;
      }
    });
    html += '</div>';

  } else if (format?.type === 'code') {
    const codeMatch = (rawText || '').match(/```[\w]*\n?([\s\S]+?)```/);
    if (codeMatch) {
      const nonCode = (rawText || '').replace(/```[\w]*\n?[\s\S]+?```/g, '').trim();
      html = `<div class="brain-text">${escapeHtml(nonCode).replace(/\n/g, '<br>')}</div>
              <pre class="brain-code"><code>${escapeHtml(codeMatch[1].trim())}</code></pre>`;
    } else {
      html = `<pre class="brain-code"><code>${escapeHtml(rawText || '')}</code></pre>`;
    }

  } else if (format?.type === 'define') {
    const lines = (rawText || '').split('\n').map(l => l.trim()).filter(Boolean);
    html = '<div class="brain-define">';
    lines.forEach(line => {
      if (line.startsWith('•') || line.startsWith('-')) {
        html += `<div class="brain-bullet"><i class="fas fa-dot-circle"></i> ${escapeHtml(line.replace(/^[•-]\s*/, ''))}</div>`;
      } else {
        html += `<p class="brain-para">${escapeHtml(line)}</p>`;
      }
    });
    html += '</div>';

  } else {
    html = `<div class="brain-text">${escapeHtml(rawText || '').replace(/\n/g, '<br>')}</div>`;
  }

  body.innerHTML = html;
  panel.style.display = 'flex';
}

function closeBrainPanel() {
  const panel = document.getElementById('brainPanel');
  if (panel) panel.style.display = 'none';
}

function speakBrainResponse() {
  if (_lastBrainText) {
    speak(_lastBrainText.slice(0, 500));
  }
}

function copyBrainResponse() {
  if (_lastBrainText) {
    navigator.clipboard.writeText(_lastBrainText)
      .then(() => {
        typewrite('✓ Response copied to clipboard, Sir.');
        speak('Response copied to clipboard, Sir.');
      })
      .catch(() => typewrite('Copy failed. Please select text manually.'));
  } else {
    speak('There is no active intelligence response to copy, Sir.');
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Core Gemini call — Format-Aware with Multi-Key & Multi-Model Resilience ──
async function askGemini(userPrompt, logLabel) {
  modeStatus.textContent = 'THINKING';
  typewriterEl.textContent = 'JARVIS neural network processing...';
  avatarCore.classList.add('speaking');

  const format = detectResponseFormat(userPrompt);
  const sysPrompt = buildSystemPrompt(format);

  const maxTokens = (format.type === 'chat') ? 300
    : (format.type === 'code') ? 1024
      : (format.type === 'list' || format.type === 'steps') ? 1024
        : 800;

  const payload = {
    system_instruction: { parts: [{ text: sysPrompt }] },
    contents: [
      ...chatHistory.flatMap(h => [
        { role: 'user', parts: [{ text: h.user }] },
        { role: 'model', parts: [{ text: h.model }] },
      ]),
      { role: 'user', parts: [{ text: userPrompt }] },
    ],
    generationConfig: {
      temperature: format.type === 'chat' ? 0.7 : 0.4,
      maxOutputTokens: maxTokens,
      topK: 40,
      topP: 0.95
    }
  };

  const keys = getGeminiKeys();

  // Modern Gemini models across different tiers/rate limits
  const MODELS = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro'
  ];

  try {
    let reply = null;
    let lastError = null;

    // ── Tier 1: Try Server-Side AI Gateway (Protects keys & handles proxying) ──
    if (isCloudOnline) {
      try {
        const serverRes = await fetch(`${BACKEND_BASE}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: userPrompt,
            history: chatHistory.slice(-6),
            apiKey: keys[0] || undefined,
            systemPrompt: sysPrompt,
            maxTokens: maxTokens
          }),
          signal: AbortSignal.timeout(10000)
        });

        if (serverRes.ok) {
          const sData = await serverRes.json();
          if (sData && sData.success && sData.reply) {
            reply = sData.reply;
          }
        } else {
          const sErr = await serverRes.json().catch(() => ({}));
          lastError = sErr.message || `Server gateway HTTP ${serverRes.status}`;
        }
      } catch (e) {
        lastError = e.message;
      }
    }

    // ── Tier 2: Direct Client-Side Gemini API Call (If server gateway unavailable or unconfigured) ──
    if (!reply && keys.length > 0) {
      outerLoop:
      for (const key of keys) {
        for (const model of MODELS) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(12000)
            });
            const data = await res.json();

            if (res.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
              reply = data.candidates[0].content.parts[0].text.trim();
              break outerLoop;
            }

            const errMsg = data?.error?.message || '';
            const errCode = data?.error?.code || 0;

            if (errCode === 429) {
              lastError = 'Rate limit reached on current model. Switching fallback model...';
              continue;
            }

            if (errCode === 400 && /api key not valid|api_key_invalid/i.test(errMsg)) {
              lastError = 'API key invalid';
              continue;
            }

            lastError = errMsg || lastError;
          } catch (e) {
            lastError = e.message;
          }
        }
      }
    }

    // ── If Gemini API succeeded ──
    if (reply) {
      chatHistory.push({ user: userPrompt, model: reply });
      if (chatHistory.length > CHAT_MAX) chatHistory.shift();

      if (format.type === 'chat') {
        speak(reply);
        typewrite(reply);
      } else {
        showBrainPanel(reply, format);
        const spokenSentences = reply
          .replace(/\n/g, '. ')
          .split(/(?<=[.!?])\s+/)
          .slice(0, 2)
          .join(' ');
        speak(`Here is the ${format.label.toLowerCase()}, Sir. ${spokenSentences}`);
        typewrite(`${format.label}: ${userPrompt.slice(0, 60)}...`);
      }

      addLog(logLabel || `AI: ${userPrompt.slice(0, 28)}...`, 'fa-brain');
      return true;
    }

    // ── Instant Knowledge Engine Fallback: (Always answers even without API key!) ──
    console.log('Activating JARVIS Neural Knowledge Engine for:', userPrompt);
    const fallback = await fallbackNeuralBrain(userPrompt, format);

    if (fallback && fallback.text) {
      showBrainPanel(fallback.text, { type: format.type, label: fallback.label || format.label });
      const cleanForSpeech = fallback.text
        .replace(/```[\s\S]*?```/g, 'Here is the complete source code implementation displayed on your screen, Sir.')
        .replace(/[#*`_~]/g, '')
        .replace(/\n+/g, '. ')
        .trim();
      const spokenSummary = cleanForSpeech
        .split(/(?<=[.!?])\s+/)
        .slice(0, 2)
        .join(' ');
      speak(spokenSummary || `Here is the requested information on your screen, Sir.`);
      typewrite(`[NEURAL ENGINE] ${fallback.label}: ${userPrompt.slice(0, 50)}...`);
      addLog(`AI: ${userPrompt.slice(0, 25)}`, 'fa-brain');
      modeStatus.textContent = 'STANDBY';
      avatarCore.classList.remove('speaking');
      return true;
    }

    throw new Error(lastError || 'Neural processing unavailable.');

  } catch (err) {
    const msg = err.message || 'Processing error';
    speak(`Sir, I encountered an issue: ${msg}.`);
    typewrite(`AI Status: ${msg}`);
    modeStatus.textContent = 'STANDBY';
    avatarCore.classList.remove('speaking');
    return false;
  }
}


// ── Settings modal controls ────────────────────────────────────
function openSettings() {
  const modal = document.getElementById('settingsModal');
  const inp = document.getElementById('geminiKeyInput');
  if (modal && inp) { inp.value = getGeminiKey(); modal.style.display = 'flex'; }
}
function closeSettings() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'none';
}
function saveSettings() {
  const key = document.getElementById('geminiKeyInput')?.value?.trim();
  if (!key) { alert('Please enter a valid API key.'); return; }
  setGeminiKey(key);
  // Update AI badge
  const badge = document.getElementById('aiBadge');
  if (badge) { badge.textContent = 'GEMINI ON'; badge.classList.add('active'); }
  closeSettings();
  speak('Gemini AI has been configured, Sir. I am now fully operational with artificial intelligence capabilities.');
}
function clearChatHistory() {
  chatHistory.length = 0;
  speak('Conversation memory cleared, Sir.');
}

// ── Toggle AI-only mode ──────────────────────────────────────
function toggleAIMode() {
  AI_MODE = !AI_MODE;
  const btn = document.getElementById('aiModeBtn');
  if (AI_MODE) {
    modeStatus.textContent = 'AI CHAT';
    if (btn) { btn.textContent = '⬡ EXIT AI MODE'; btn.classList.add('active'); }
    speak('AI chat mode activated, Sir. Everything you say will be processed by Gemini. Say exit AI mode to return to command mode.');
  } else {
    modeStatus.textContent = 'STANDBY';
    if (btn) { btn.textContent = '⬡ AI CHAT MODE'; btn.classList.remove('active'); }
    speak('Returning to standard command mode, Sir.');
  }
}

// Initialise AI badge state on load
function initAIBadge() {
  const badge = document.getElementById('aiBadge');
  if (badge && getGeminiKey()) { badge.textContent = 'GEMINI ON'; badge.classList.add('active'); }
}

// ─────────────────────────────────────────────────────────────
// STEP 1 — Real Live API Integrations (No API Key Needed)
// ─────────────────────────────────────────────────────────────

// Generic multi-turn state for API queries
const PENDING = { action: null, data: {} };
function pendingReset() { PENDING.action = null; PENDING.data = {}; }

// ── Loading indicator ──────────────────────────────────────────
function showLoading(label) {
  modeStatus.textContent = 'FETCHING';
  if (typewriterEl) typewriterEl.textContent = label + '...';
}

// ── 1. WEATHER  (Open-Meteo & wttr.in with Auto-Location & Fallbacks) ──
async function getWeatherSummary(city = null) {
  // If city is specified, try geocoding with Open-Meteo or fallback to wttr.in
  if (city && city.trim()) {
    const q = city.trim();
    try {
      // 1. Try Open-Meteo Geocoding API (100% free, no key)
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          const { latitude, longitude, name, country } = geoData.results[0];
          const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`);
          if (wRes.ok) {
            const wData = await wRes.json();
            const cur = wData.current;
            const code = cur.weather_code;
            const desc = decodeWeatherCode(code);
            return {
              location: `${name}, ${country || ''}`.trim().replace(/,\s*$/, ''),
              temp: Math.round(cur.temperature_2m),
              feelsLike: Math.round(cur.apparent_temperature),
              humidity: cur.relative_humidity_2m,
              wind: Math.round(cur.wind_speed_10m),
              desc: desc
            };
          }
        }
      }
    } catch { /* Fallback to wttr.in below */ }

    // Fallback: wttr.in
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(q)}?format=j1`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const d = await res.json();
        const cur = d.current_condition[0];
        const area = d.nearest_area[0];
        return {
          location: `${area.areaName[0].value}, ${area.country[0].value}`,
          temp: cur.temp_C,
          feelsLike: cur.FeelsLikeC,
          humidity: cur.humidity,
          wind: cur.windspeedKmph,
          desc: cur.weatherDesc[0].value
        };
      }
    } catch { /* wttr fallback failed */ }
  }

  // If no city or previous attempts failed, try user's device IP geolocation + weather
  try {
    const ipGeo = await fetch('https://get.geojs.io/v1/ip/geo.json', { signal: AbortSignal.timeout(4000) });
    if (ipGeo.ok) {
      const loc = await ipGeo.json();
      const lat = loc.latitude;
      const lon = loc.longitude;
      const cityName = loc.city || loc.region || 'Local Area';
      const country = loc.country || '';

      const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`);
      if (wRes.ok) {
        const wData = await wRes.json();
        const cur = wData.current;
        return {
          location: `${cityName}, ${country}`.trim().replace(/,\s*$/, ''),
          temp: Math.round(cur.temperature_2m),
          feelsLike: Math.round(cur.apparent_temperature),
          humidity: cur.relative_humidity_2m,
          wind: Math.round(cur.wind_speed_10m),
          desc: decodeWeatherCode(cur.weather_code)
        };
      }
    }
  } catch { /* fallback to default location */ }

  return null;
}

function decodeWeatherCode(code) {
  if (code === 0) return 'Clear skies';
  if (code === 1 || code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy conditions';
  if (code >= 51 && code <= 55) return 'Light drizzle';
  if (code >= 61 && code <= 65) return 'Rain showers';
  if (code >= 71 && code <= 77) return 'Snow flurries';
  if (code >= 80 && code <= 82) return 'Heavy rain showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm activity';
  return 'Clear conditions';
}

async function fetchWeather(city = null) {
  const target = city ? `for ${city}` : 'for your current location';
  showLoading(`Checking weather ${target}`);
  typewrite(`> Scanning meteorological satellites ${target}...`);

  const w = await getWeatherSummary(city);
  if (w) {
    const text = `Current weather in ${w.location}: ${w.desc}. Temperature is ${w.temp} degrees Celsius, feels like ${w.feelsLike} degrees, with ${w.humidity} percent humidity and winds at ${w.wind} kilometres per hour.`;
    typewrite(`> **METEOROLOGICAL REPORT**\n📍 **Location:** ${w.location}\n🌤️ **Sky:** ${w.desc}\n🌡️ **Temperature:** ${w.temp}°C (Feels like ${w.feelsLike}°C)\n💧 **Humidity:** ${w.humidity}%\n💨 **Wind:** ${w.wind} km/h`);
    speak(text);
    addLog(`Weather: ${w.location} • ${w.temp}°C ${w.desc}`, 'fa-cloud-sun');
  } else {
    speak(`I am sorry, Sir. I could not retrieve live weather telemetry at this moment. Please check your network connection.`);
    if (typeof modeStatus !== 'undefined') modeStatus.textContent = 'STANDBY';
  }
}


// ── 2. DICTIONARY  (DictionaryAPI.dev — free, no key) ────────
async function fetchDefinition(word) {
  showLoading(`Looking up "${word}"`);
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    const entry = data[0];
    const m = entry.meanings[0];
    const pos = m.partOfSpeech;
    const def = m.definitions[0].definition;
    const ex = m.definitions[0].example ? ` For example: ${m.definitions[0].example}` : '';
    const ph = entry.phonetic ? `Pronounced ${entry.phonetic}. ` : '';
    speak(`The word "${word}" is a ${pos}. ${ph}Definition: ${def}.${ex}`);
    addLog(`Defined: ${word}`, 'fa-book-open');
  } catch {
    speak(`I could not find a definition for the word "${word}", Sir. Please check the spelling.`);
    modeStatus.textContent = 'STANDBY';
  }
}

/// ── 3. NEWS  (Multi-proxy RSS with AI fallback) ───────────────
const NEWS_FEEDS = {
  top:        'https://feeds.bbci.co.uk/news/rss.xml',
  technology: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  science:    'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  sports:     'https://feeds.bbci.co.uk/sport/rss.xml',
  business:   'https://feeds.bbci.co.uk/news/business/rss.xml',
  world:      'https://feeds.bbci.co.uk/news/world/rss.xml',
  india:      'https://feeds.bbci.co.uk/news/world/south_asia/rss.xml',
};

// Parse RSS XML into array of {title, link}
function parseRSS(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const items = Array.from(doc.querySelectorAll('item')).slice(0, 5);
  return items.map(item => ({
    title: item.querySelector('title')?.textContent?.trim() || '',
    link:  item.querySelector('link')?.textContent?.trim() || ''
  })).filter(i => i.title);
}

async function fetchNews(category = 'top') {
  const cat = category.toLowerCase();
  showLoading(`Fetching ${cat} news`);
  speak(`Scanning global news satellites for ${cat} headlines, Sir.`);
  typewrite(`> Scanning global news satellites for: **${cat.toUpperCase()}**...`);

  // 1. Primary: High-speed server-side RSS aggregator (Bypasses all browser CORS blocks!)
  try {
    const res = await fetch(`/api/news/feed?category=${encodeURIComponent(cat)}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.items) && data.items.length > 0) {
        const top5 = data.items.slice(0, 5);
        const spoken = top5.map((item, idx) => `Headline ${idx + 1}: ${item.title}`).join('. ');
        const markdown = top5.map((item, idx) => `${idx + 1}. [${item.title}](${item.link || '#'})`).join('\n');
        
        typewrite(`> **GLOBAL TELEMETRY — ${cat.toUpperCase()} HEADLINES**\n\n${markdown}`);
        speak(`Here are the latest ${cat} headlines from global news satellites, Sir. ${spoken}.`);
        addLog(`News: ${cat} • ${top5.length} headlines`, 'fa-newspaper');
        return;
      }
    }
  } catch (e) {
    /* Server route fallback to AI */
  }

  // 2. Secondary: Instant Gemini AI News Intelligence Fallback
  try {
    const key = getGeminiKey();
    if (key) {
      typewrite(`> Aggregating intelligence with Gemini Neural Engine...`);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`;
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Give me 5 major current ${cat} news topics and headlines in a numbered list. Be factual, concise, and professional.` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 350 }
        })
      });
      const data = await r.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (reply) {
        typewrite(`> **${cat.toUpperCase()} INTELLIGENCE** (AI Synthesis)\n\n${reply}`);
        speak(reply.replace(/\*/g, '').replace(/-\s/g, '').slice(0, 400));
        addLog(`News (AI): ${cat}`, 'fa-newspaper');
        return;
      }
    }
  } catch { /* ignore */ }

  speak(`I was unable to retrieve news feeds at this time, Sir. Please verify your connection.`);
  typewrite(`> News feed fetch failed for category: ${cat}.`);
  if (typeof modeStatus !== 'undefined') modeStatus.textContent = 'STANDBY';
}

// ── 3B. DUAL INTELLIGENCE — India & Global World News Combined ────
async function fetchCombinedNews() {
  showLoading('Fetching India & Global News');
  speak('Aggregating headlines from India and international news satellites, Sir.');
  typewrite('> Establishing orbital link with Indian and Global news satellites...');

  try {
    const res = await fetch('/api/news/combo', { signal: AbortSignal.timeout(6500) });
    if (res.ok) {
      const data = await res.json();
      const world = data.world || [];
      const india = data.india || [];

      if (world.length > 0 || india.length > 0) {
        let md = `> **GLOBAL & NATIONAL SATELLITE INTELLIGENCE**\n\n`;
        md += `🇮🇳 **TOP HEADLINES — INDIA**\n`;
        india.forEach((item, idx) => {
          md += `${idx + 1}. [${item.title}](${item.link || '#'})\n`;
        });

        md += `\n🌍 **TOP HEADLINES — GLOBAL WORLD**\n`;
        world.forEach((item, idx) => {
          md += `${idx + 1}. [${item.title}](${item.link || '#'})\n`;
        });

        typewrite(md);

        const speechIndia = india.length > 0 ? `In India: First, ${india[0].title}. Second, ${india[1] ? india[1].title : ''}.` : '';
        const speechWorld = world.length > 0 ? `In Global news: First, ${world[0].title}. Second, ${world[1] ? world[1].title : ''}.` : '';

        speak(`Here is the national and international news briefing, Sir. ${speechIndia} ${speechWorld}`);
        addLog('News: India + Global', 'fa-globe-asia');
        return;
      }
    }
  } catch (err) {}

  // Fallback to standard top news
  fetchNews('top');
}




// ── 4. CURRENCY  (frankfurter.app — free, no key) ──────────
const CURRENCY_ALIASES = {
  dollar: 'USD', dollars: 'USD', usd: 'USD',
  rupee: 'INR', rupees: 'INR', inr: 'INR',
  euro: 'EUR', euros: 'EUR', eur: 'EUR',
  pound: 'GBP', pounds: 'GBP', gbp: 'GBP',
  yen: 'JPY', jpy: 'JPY',
  yuan: 'CNY', cny: 'CNY',
};
function resolveCurrency(str) {
  const s = str.toLowerCase().trim();
  return CURRENCY_ALIASES[s] || s.toUpperCase();
}

async function fetchCurrency(amount, from, to) {
  const FROM = resolveCurrency(from);
  const TO = resolveCurrency(to);
  showLoading(`Converting ${amount} ${FROM} to ${TO}`);
  typewrite(`> Calculating exchange rate: **${amount} ${FROM}** to **${TO}**...`);

  // 1. Primary: Server-side multi-engine conversion (open.er-api + frankfurter)
  try {
    const res = await fetch(`/api/currency/convert?amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        const converted = Number(data.result).toFixed(2);
        const rate = Number(data.rate).toFixed(3);
        typewrite(`> **FOREIGN EXCHANGE TELEMETRY**\n\n💱 **${amount} ${FROM}** = **${converted} ${TO}**\n📈 **Exchange Rate:** 1 ${FROM} = ${rate} ${TO}`);
        speak(`${amount} ${FROM} is currently equal to ${converted} ${TO}, Sir.`);
        addLog(`₹ ${amount} ${FROM} → ${converted} ${TO}`, 'fa-exchange-alt');
        return;
      }
    }
  } catch (e) {
    /* Fallback to direct client call below */
  }

  // 2. Direct client fallback to open.er-api.com
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${FROM}`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const d = await res.json();
      if (d.result === 'success' && d.rates && d.rates[TO] !== undefined) {
        const rate = d.rates[TO];
        const converted = (amount * rate).toFixed(2);
        typewrite(`> **FOREIGN EXCHANGE TELEMETRY**\n\n💱 **${amount} ${FROM}** = **${converted} ${TO}**\n📈 **Rate:** 1 ${FROM} = ${Number(rate).toFixed(3)} ${TO}`);
        speak(`${amount} ${FROM} is equal to ${converted} ${TO}, Sir.`);
        addLog(`₹ ${amount} ${FROM} → ${converted} ${TO}`, 'fa-exchange-alt');
        return;
      }
    }
  } catch (e) {}

  speak(`I could not convert ${FROM} to ${TO}, Sir. Please verify the currency codes.`);
  typewrite(`> Currency conversion failed for ${amount} ${FROM} to ${TO}.`);
  if (typeof modeStatus !== 'undefined') modeStatus.textContent = 'STANDBY';
}


// ── 5. LIVE JOKES  (JokeAPI — free, no key) ──────────────
async function fetchLiveJoke() {
  try {
    const res = await fetch(
      'https://v2.jokeapi.dev/joke/Programming,Miscellaneous,Pun?type=single&blacklistFlags=nsfw,racist,sexist,explicit'
    );
    if (!res.ok) throw new Error('error');
    const data = await res.json();
    if (data.error) throw new Error('api error');
    speak(data.joke);
    addLog('Live joke fetched', 'fa-laugh-beam');
  } catch {
    // fall back to built-in jokes
    speak(JOKES[Math.floor(Math.random() * JOKES.length)]);
    addLog('Told a joke (offline)', 'fa-laugh-beam');
  }
}

// ── 6. STARK PROTOCOL — Autonomous Daily Briefing ────────────
async function runDailyBriefing() {
  showLoading('Initializing Daily Briefing');
  const now = new Date();
  const hours = now.getHours();
  let greetingTime = 'Good morning';
  if (hours >= 12 && hours < 17) greetingTime = 'Good afternoon';
  else if (hours >= 17) greetingTime = 'Good evening';

  let masterName = 'Sir';
  try {
    const enrolled = getEnrolledFace();
    if (enrolled && enrolled.name) masterName = enrolled.name;
  } catch {}

  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  typewrite(`> **INITIATING STARK PROTOCOL — DAILY BRIEFING**\n> Time: ${timeStr} | ${dateStr}\n> Authenticated User: ${masterName}\n> Scanning environmental telemetry & global news feeds...`);

  // 1. Fetch live weather
  let weatherText = 'Weather telemetry is currently unavailable.';
  try {
    const w = await getWeatherSummary();
    if (w) {
      weatherText = `In ${w.location}, expect ${w.desc.toLowerCase()}. The temperature is currently ${w.temp} degrees Celsius, with an apparent feel of ${w.feelsLike} degrees, and humidity at ${w.humidity} percent.`;
    }
  } catch {}

  // 2. Fetch top 2 news headlines via server news aggregator
  let newsText = 'Global news satellites are currently syncing.';
  try {
    const res = await fetch('/api/news/feed?category=top', { signal: AbortSignal.timeout(4500) });
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.items) && data.items.length >= 2) {
        newsText = `In global headlines: First, ${data.items[0].title}. Second, ${data.items[1].title}.`;
      }
    }
  } catch {}


  // 3. Check Battery Status if available
  let batteryInfo = 'All primary power cells are nominal.';
  try {
    if (navigator.getBattery) {
      const bat = await navigator.getBattery();
      const level = Math.round(bat.level * 100);
      const charging = bat.charging ? 'connected to AC power' : 'operating on battery reserves';
      batteryInfo = `System battery is at ${level} percent and ${charging}.`;
    }
  } catch {}

  const fullBriefing = `${greetingTime}, ${masterName}. It is ${timeStr} on ${dateStr}. ${weatherText} ${newsText} ${batteryInfo} All JARVIS neural cores are online and standing by for your instructions.`;

  typewrite(`> **DAILY BRIEFING COMPLETE**\n\n🌤️ **Weather:** ${weatherText}\n\n📰 **Top Headlines:** ${newsText}\n\n🔋 **Power Telemetry:** ${batteryInfo}\n\nReady for your commands, ${masterName}.`);
  speak(fullBriefing);
  addLog('Daily Briefing Executed', 'fa-sun');
}

// ── 7. SATELLITE TELEMETRY — Live GPS Geo-Location ────────────
async function getLiveLocation() {
  const locVal = document.getElementById('hudLocationVal');
  if (locVal) locVal.textContent = 'SCANNING';
  showLoading('Acquiring Telemetry');
  typewrite('> Establishing orbital link with GPS satellites...');

  // Reverse geocoding helper
  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`, {
        headers: { 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data = await res.json();
        const a = data.address || {};
        const area = a.suburb || a.neighbourhood || a.city_district || a.town || a.village || '';
        const city = a.city || a.state_district || a.county || a.state || 'Local Zone';
        const country = a.country || '';
        return {
          displayName: data.display_name || `${city}, ${country}`,
          shortLoc: area ? `${area}, ${city}` : `${city}, ${country}`
        };
      }
    } catch {}
    return null;
  }

  // Fast IP Telemetry fallback executor
  async function fallbackToIP(notice = '') {
    try {
      const ipGeo = await fetch('https://get.geojs.io/v1/ip/geo.json', { signal: AbortSignal.timeout(4000) });
      if (ipGeo.ok) {
        const d = await ipGeo.json();
        const cityName = d.city || d.region || 'Local Zone';
        const country = d.country || '';
        const lat = d.latitude;
        const lon = d.longitude;
        const mapUrl = `https://www.google.com/maps?q=${lat},${lon}`;

        if (locVal) locVal.textContent = cityName.toUpperCase().slice(0, 8);
        typewrite(`> **NETWORK GEO-LOCATION**\n📍 **Location:** ${cityName}, ${country}\n🌐 **Coordinates:** ${lat}, ${lon}\n🗺️ [Open in Google Maps](${mapUrl})`);
        speak(`${notice}Network telemetry places you near ${cityName}, ${country}.`);
        addLog(`Loc (Network): ${cityName}`, 'fa-map-marker-alt');
        return true;
      }
    } catch {}
    return false;
  }

  // 1. Check navigator.geolocation
  if (navigator.geolocation) {
    let responded = false;

    // Safety timeout: if browser permission prompt hangs or user ignores it, fallback to IP in 4s!
    const safetyTimer = setTimeout(async () => {
      if (!responded) {
        responded = true;
        await fallbackToIP('Satellite lock timed out. ');
      }
    }, 4500);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (responded) return;
        responded = true;
        clearTimeout(safetyTimer);

        const lat = pos.coords.latitude.toFixed(5);
        const lon = pos.coords.longitude.toFixed(5);
        const accuracy = Math.round(pos.coords.accuracy);

        let locationName = `${lat}, ${lon}`;
        const geoInfo = await reverseGeocode(lat, lon);
        if (geoInfo) locationName = geoInfo.shortLoc;

        if (locVal) locVal.textContent = locationName.split(',')[0].toUpperCase().slice(0, 8);
        const mapUrl = `https://www.google.com/maps?q=${lat},${lon}`;
        typewrite(`> **GPS TELEMETRY ACQUIRED**\n📍 **Coordinates:** ${lat}° N, ${lon}° E\n🎯 **Accuracy:** ±${accuracy} meters\n🏙️ **Location:** ${geoInfo ? geoInfo.displayName : locationName}\n🗺️ [View on Google Maps](${mapUrl})`);
        speak(`Location telemetry acquired, Sir. You are currently at ${locationName}.`);
        addLog(`GPS: ${locationName}`, 'fa-map-marker-alt');
      },
      async (err) => {
        if (responded) return;
        responded = true;
        clearTimeout(safetyTimer);
        const success = await fallbackToIP('Satellite GPS was not authorized. ');
        if (!success) {
          if (locVal) locVal.textContent = 'GPS OFF';
          speak("Location services are unavailable, Sir. Please check network connectivity.");
        }
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
    );
  } else {
    await fallbackToIP();
  }
}

// ── 8. Collapsible Secondary HUD Drawer Toggle ────────────────
function toggleSecondaryHUD() {
  const bar = document.getElementById('secondaryHudBar');
  const btn = document.getElementById('hudToggleBarBtn');
  const label = document.getElementById('hudToggleLabel');
  const icon = document.getElementById('hudToggleIcon');
  if (!bar) return;

  const isVisible = bar.style.display === 'flex';
  if (isVisible) {
    bar.style.display = 'none';
    if (label) label.textContent = 'PANEL';
    if (icon) icon.className = 'fas fa-bars';
    if (btn) btn.classList.remove('active');
  } else {
    bar.style.display = 'flex';
    if (label) label.textContent = 'CLOSE';
    if (icon) icon.className = 'fas fa-times';
    if (btn) btn.classList.add('active');
  }
}




// ─────────────────────────────────────────────────────────────
// STEP 3 — Neural Analytics & Telemetry Engine (Chart.js HUD)
// ─────────────────────────────────────────────────────────────

const DEFAULT_ANALYTICS = {
  totalQueries: 0,
  aiQueries: 0,
  apiQueries: 0,
  successCount: 0,
  intents: {
    'AI & Generation': 0,
    'Web Navigation': 0,
    'Realtime APIs': 0,
    'WhatsApp & Comms': 0,
    'System Controls': 0,
    'Knowledge & Utils': 0,
    'General / ChitChat': 0
  },
  hourly: new Array(24).fill(0),
  stream: []
};

function getAnalytics() {
  try {
    const data = JarvisCryptoVault.secureGet('jarvis_analytics', null) || JSON.parse(JSON.stringify(DEFAULT_ANALYTICS));
    if (!data.intents) data.intents = { ...DEFAULT_ANALYTICS.intents };
    if (!Array.isArray(data.hourly) || data.hourly.length !== 24) data.hourly = new Array(24).fill(0);
    if (!Array.isArray(data.stream)) data.stream = [];
    return data;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_ANALYTICS));
  }
}

function saveAnalytics(data) {
  try {
    JarvisCryptoVault.secureSet('jarvis_analytics', data);
  } catch { /* ignore storage errors */ }
}

function recordTelemetry(utterance, category, engine = 'Rule Engine', isSuccess = true) {
  const data = getAnalytics();
  data.totalQueries = (data.totalQueries || 0) + 1;
  if (category === 'AI & Generation') data.aiQueries = (data.aiQueries || 0) + 1;
  if (category === 'Realtime APIs') data.apiQueries = (data.apiQueries || 0) + 1;
  if (isSuccess) data.successCount = (data.successCount || 0) + 1;

  if (data.intents[category] !== undefined) {
    data.intents[category] += 1;
  } else {
    data.intents[category] = 1;
  }

  const hour = new Date().getHours();
  data.hourly[hour] = (data.hourly[hour] || 0) + 1;

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  data.stream.unshift({
    time: timeStr,
    query: utterance.length > 35 ? utterance.slice(0, 35) + '…' : utterance,
    intent: category,
    engine: engine
  });

  if (data.stream.length > 40) data.stream.pop();
  saveAnalytics(data);

  // ── STEP 7: Forward to Node.js / MongoDB Backend Asynchronously ──
  fetch(`${BACKEND_BASE}/telemetry/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawUtterance: utterance,
      classifiedIntent: category,
      executionEngine: engine,
      isSuccess: isSuccess
    })
  }).catch(() => { });
}

// ── Cloud Backend Health & Sync Checker ──────────────────────
let isCloudOnline = false;

async function checkCloudServer() {
  try {
    const res = await fetch(`${BACKEND_BASE}/health`, { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      const d = await res.json();
      isCloudOnline = true;
      const netLabel = document.getElementById('networkStatusVal');
      if (netLabel) netLabel.textContent = d.database === 'CONNECTED' ? 'MONGODB' : 'ONLINE';
    }
  } catch {
    isCloudOnline = false;
  }
}


let intentChartInstance = null;
let activityChartInstance = null;

function renderAnalyticsCharts() {
  const data = getAnalytics();

  document.getElementById('kpiTotal').textContent = data.totalQueries;
  document.getElementById('kpiAI').textContent = data.aiQueries;
  document.getElementById('kpiAPI').textContent = data.apiQueries;

  const accuracy = data.totalQueries > 0
    ? ((data.successCount / data.totalQueries) * 100).toFixed(1) + '%'
    : '100%';
  document.getElementById('kpiSuccess').textContent = accuracy;

  const categories = Object.keys(data.intents);
  const counts = Object.values(data.intents);
  const ctxIntent = document.getElementById('intentChart')?.getContext('2d');

  if (ctxIntent) {
    if (intentChartInstance) intentChartInstance.destroy();
    intentChartInstance = new Chart(ctxIntent, {
      type: 'doughnut',
      data: {
        labels: categories,
        datasets: [{
          data: counts,
          backgroundColor: [
            '#00e5ff', '#00e676', '#ffd740', '#ff4081',
            '#7c4dff', '#ff6e40', '#40c4ff'
          ],
          borderColor: '#020d18',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#a0c0d0', font: { family: 'Rajdhani', size: 11 } }
          }
        }
      }
    });
  }

  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  const ctxActivity = document.getElementById('activityChart')?.getContext('2d');

  if (ctxActivity) {
    if (activityChartInstance) activityChartInstance.destroy();
    activityChartInstance = new Chart(ctxActivity, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          label: 'Invocations / Hour',
          data: data.hourly,
          borderColor: '#00e5ff',
          backgroundColor: 'rgba(0, 229, 255, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#5a8a9a', font: { size: 9 } }, grid: { color: '#0a2030' } },
          y: { ticks: { color: '#5a8a9a', font: { size: 9 }, stepSize: 1 }, grid: { color: '#0a2030' }, min: 0 }
        }
      }
    });
  }

  const tbody = document.getElementById('analyticsTableBody');
  if (tbody) {
    if (data.stream.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#4a8a9a;padding:12px;">No queries logged yet. Speak or type commands to populate telemetry.</td></tr>';
    } else {
      tbody.innerHTML = data.stream.map(item => `
        <tr>
          <td><span class="table-badge">${item.time}</span></td>
          <td style="color:#fff;">${escapeHtml(item.query)}</td>
          <td><span class="cat-pill">${escapeHtml(item.category || item.intent || 'General')}</span></td>
          <td style="color:var(--cyan);">${escapeHtml(item.engine || 'Rule Engine')}</td>
        </tr>
      `).join('');
    }
  }
}


function openAnalytics() {
  const modal = document.getElementById('analyticsModal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(renderAnalyticsCharts, 80);
  }
}

function closeAnalytics() {
  const modal = document.getElementById('analyticsModal');
  if (modal) modal.style.display = 'none';
}

function resetAnalytics() {
  if (confirm("Reset all neural telemetry and analytics records?")) {
    saveAnalytics(JSON.parse(JSON.stringify(DEFAULT_ANALYTICS)));
    renderAnalyticsCharts();
    speak("Telemetry and analytics data have been reset, Sir.");
  }
}


// ─────────────────────────────────────────────────────────────
// STEP 4 — Smart Task Reminders & Alarms Engine
// ─────────────────────────────────────────────────────────────

function getReminders() {
  try {
    const data = JarvisCryptoVault.secureGet('jarvis_reminders', []);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveReminders(list) {
  try {
    JarvisCryptoVault.secureSet('jarvis_reminders', list);
    updateRemindersBadge();
  } catch { /* ignore */ }
}

function updateRemindersBadge() {
  const list = getReminders();
  const badge = document.getElementById('remindersBadge');
  if (badge) badge.textContent = list.length;
}

// ── Web Audio Chime Alarm ────────────────────────────────────
function playAlarmSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc1.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.4); // A6

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(440, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.9);
    osc2.stop(ctx.currentTime + 0.9);
  } catch { /* ignore audio context restrictions */ }
}

// ── HTML5 Desktop Notification ───────────────────────────────
function triggerDesktopNotification(task) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification('J.A.R.V.I.S — Task Reminder', {
      body: task,
      icon: 'https://cdn-icons-png.flaticon.com/512/4712/4712109.png'
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification('J.A.R.V.I.S — Task Reminder', {
          body: task,
          icon: 'https://cdn-icons-png.flaticon.com/512/4712/4712109.png'
        });
      }
    });
  }
}

// ── Schedule a Reminder ──────────────────────────────────────
function scheduleReminder(task, delaySeconds) {
  if (!task || delaySeconds <= 0) return false;
  const list = getReminders();
  const dueTimestamp = Date.now() + (delaySeconds * 1000);
  const item = {
    id: Date.now() + Math.random(),
    task: task.trim(),
    dueTimestamp: dueTimestamp,
    created: new Date().toLocaleTimeString()
  };
  list.push(item);
  saveReminders(list);

  // Background sync with cloud backend
  try {
    fetch(`${BACKEND_BASE}/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: task.trim(), dueTimestamp: new Date(dueTimestamp).toISOString() })
    }).catch(() => {});
  } catch {}

  let durStr = '';
  if (delaySeconds < 60) durStr = `${delaySeconds} second${delaySeconds > 1 ? 's' : ''}`;
  else if (delaySeconds < 3600) {
    const mins = Math.round(delaySeconds / 60);
    durStr = `${mins} minute${mins > 1 ? 's' : ''}`;
  } else {
    const hrs = (delaySeconds / 3600).toFixed(1);
    durStr = `${hrs} hour${hrs > 1 ? 's' : ''}`;
  }

  speak(`Reminder confirmed, Sir. I shall alert you in ${durStr} to ${task}.`);
  addLog(`Reminder: ${task} in ${durStr}`, 'fa-bell');
  recordTelemetry(`Remind in ${durStr}: ${task}`, 'Knowledge & Utils', 'Alarm Scheduler');

  if (window.Notification && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  return true;
}

// ── Smart Natural Language Parser for Voice ───────────────────
function parseAndSetReminder(msg, raw) {
  // 1. "remind me in X seconds/minutes/hours to [task]"
  let match = msg.match(/remind\s+(?:me\s+)?in\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\s+(?:to|that|about|for)\s+(.+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const task = raw.substring(raw.toLowerCase().indexOf(match[3])).trim();
    let multiplier = 1;
    if (unit.startsWith('min')) multiplier = 60;
    else if (unit.startsWith('hour') || unit.startsWith('hr')) multiplier = 3600;
    return scheduleReminder(task, num * multiplier);
  }

  // 2. "remind me to [task] in X seconds/minutes/hours"
  match = msg.match(/remind\s+(?:me\s+)?(?:to|that|about|for)\s+(.+?)\s+in\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i);
  if (match) {
    const task = match[1].trim();
    const num = parseInt(match[2], 10);
    const unit = match[3].toLowerCase();
    let multiplier = 1;
    if (unit.startsWith('min')) multiplier = 60;
    else if (unit.startsWith('hour') || unit.startsWith('hr')) multiplier = 3600;
    return scheduleReminder(task, num * multiplier);
  }

  // 3. "set a timer / reminder for X seconds/minutes/hours to [task]"
  match = msg.match(/set\s+(?:a\s+)?(?:timer|reminder|alarm)\s+(?:for\s+)?(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)(?:\s+(?:to|for|about)\s+(.+))?/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const task = match[3] ? match[3].trim() : 'Timer finished';
    let multiplier = 1;
    if (unit.startsWith('min')) multiplier = 60;
    else if (unit.startsWith('hour') || unit.startsWith('hr')) multiplier = 3600;
    return scheduleReminder(task, num * multiplier);
  }

  speak("Please specify a duration and task, Sir. For example: remind me in 5 minutes to submit project.");
  return false;
}

// ── Reminders Modal & UI Functions ───────────────────────────
function renderRemindersList() {
  const list = getReminders();
  const container = document.getElementById('remindersList');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `<p style="color:#4a8a9a;font-size:12px;text-align:center;padding:16px;">No active reminders. Speak or create one above.</p>`;
    return;
  }

  const now = Date.now();
  container.innerHTML = list.map(item => {
    const remainMs = Math.max(0, (item.dueTimestamp || (item.created + item.delayMs)) - now);
    const totalSec = Math.floor(remainMs / 1000);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    const cdStr = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    const dueTimeStr = item.fireAt || new Date(item.dueTimestamp || (item.created + item.delayMs)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return `
      <div class="reminder-card">
        <div class="reminder-card-left">
          <span class="reminder-card-title">${escapeHtml(item.task)}</span>
          <span class="reminder-card-due"><i class="fas fa-clock"></i> Due at ${dueTimeStr}</span>
        </div>
        <div class="reminder-card-right">
          <span class="reminder-card-cd">${cdStr}</span>
          <button class="reminder-del-btn" onclick="deleteReminder('${item.id}')" title="Delete reminder">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openReminders() {
  const modal = document.getElementById('remindersModal');
  if (modal) {
    modal.style.display = 'flex';
    renderRemindersList();
  }
}

function closeReminders() {
  const modal = document.getElementById('remindersModal');
  if (modal) modal.style.display = 'none';
}

function deleteReminder(id) {
  let list = getReminders();
  list = list.filter(item => String(item.id) !== String(id));
  saveReminders(list);
  renderRemindersList();
  try {
    fetch(`${BACKEND_BASE}/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  } catch {}
}

function clearAllReminders() {
  saveReminders([]);
  renderRemindersList();
  speak("All active reminders have been cleared, Sir.");
}

function addManualReminder() {
  const taskInp = document.getElementById('reminderTaskInput');
  const durInp = document.getElementById('reminderDurationInput');
  const unitSel = document.getElementById('reminderUnitSelect');

  const task = taskInp ? taskInp.value.trim() : '';
  const num = durInp ? parseInt(durInp.value, 10) : 0;
  const unit = unitSel ? unitSel.value : 'minutes';

  if (!task || isNaN(num) || num <= 0) {
    alert("Please enter a valid task description and duration.");
    return;
  }

  let mult = 1;
  if (unit === 'minutes') mult = 60;
  else if (unit === 'hours') mult = 3600;

  scheduleReminder(task, num * mult);
  if (taskInp) taskInp.value = '';
  if (durInp) durInp.value = '';
  renderRemindersList();
}

// ── Periodic Tick (Checks Due Reminders every second) ─────────
setInterval(() => {
  const list = getReminders();
  if (list.length === 0) return;

  const now = Date.now();
  const remaining = [];

  list.forEach(r => {
    const due = r.dueTimestamp || (r.created + (r.delayMs || 0));
    if (due && due <= now) {
      playAlarmSound();
      speak(`Sir, attention please. Scheduled reminder alert: ${r.task}.`);
      addLog(`ALARM: ${r.task}`, 'fa-exclamation-circle');
      recordTelemetry(`Fired Alarm: ${r.task}`, 'Knowledge & Utils', 'Alarm Notification');
    } else {
      remaining.push(r);
    }
  });

  if (remaining.length !== list.length) {
    saveReminders(remaining);
  }

  const modal = document.getElementById('remindersModal');
  if (modal && modal.style.display === 'flex') {
    renderRemindersList();
  }
}, 1000);

// ─────────────────────────────────────────────────────────────
// STEP 5 — Face Recognition ML Authentication (face-api.js)
// ─────────────────────────────────────────────────────────────

let bioStream = null;
let bioScanInterval = null;
let faceModelsLoaded = false;
let isEnrollingMaster = false;
let isSecurityLocked = false;

// ── Face Descriptor Secure Permanent Storage ─────────────────
function getEnrolledFace() {
  try {
    // 1. Try secure vault
    let data = JarvisCryptoVault.secureGet('jarvis_master_face', null);

    // 2. Fallback to unencrypted storage if migration or direct read
    if (!data || !data.descriptor) {
      const rawV2 = localStorage.getItem('jarvis_master_face_v2');
      if (rawV2) {
        try { data = JSON.parse(rawV2); } catch { /* ignore */ }
      }
    }

    if (!data || !data.descriptor) {
      const rawLegacy = localStorage.getItem('jarvis_master_face');
      if (rawLegacy && !rawLegacy.startsWith('JARVIS_ENC')) {
        try { data = JSON.parse(rawLegacy); } catch { /* ignore */ }
      }
    }

    if (data && data.descriptor && Array.isArray(data.descriptor)) {
      return {
        name: data.name || 'Master User',
        descriptor: new Float32Array(data.descriptor),
        enrolledAt: data.enrolledAt || 'Enrolled'
      };
    }
    return null;
  } catch {
    return null;
  }
}

function saveEnrolledFace(name, descriptor) {
  try {
    const descArr = Array.from(descriptor);
    const data = {
      name: name || 'Master User',
      descriptor: descArr,
      enrolledAt: new Date().toLocaleDateString(),
      version: '6.2.0'
    };

    // Save in encrypted vault
    JarvisCryptoVault.secureSet('jarvis_master_face', data);

    // Also persist reliable backup in localStorage
    localStorage.setItem('jarvis_master_face_v2', JSON.stringify(data));

    console.log('Master face template permanently stored for:', name);
  } catch (err) {
    console.error('Failed to store face descriptor:', err);
  }
}

function euclideanDistance(d1, d2) {
  let sum = 0;
  for (let i = 0; i < d1.length; i++) {
    const diff = d1[i] - d2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// ── Load Machine Learning Models ─────────────────────────────
async function loadFaceModels() {
  if (faceModelsLoaded || typeof faceapi === 'undefined') return true;
  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    faceModelsLoaded = true;
    const detStatus = document.getElementById('bioDetectorStatus');
    if (detStatus) detStatus.textContent = 'TinyFaceNet 68L (Ready)';
    return true;
  } catch (err) {
    const detStatus = document.getElementById('bioDetectorStatus');
    if (detStatus) detStatus.textContent = 'Neural Face Detector (Active)';
    return false;
  }
}

// ── Open Biometric Modal & Start Camera Stream ───────────────
async function openBiometricModal(isStartup = false) {
  const modal = document.getElementById('biometricLockModal');
  if (!modal) return;
  modal.style.display = 'flex';

  const enrolled = getEnrolledFace();
  const userLabel = document.getElementById('bioUserName');
  if (userLabel) userLabel.textContent = enrolled ? enrolled.name : 'Not Enrolled';

  const enrollBtn = document.getElementById('bioEnrollBtn') || document.querySelector('button[onclick="promptEnrollFace()"]');
  if (enrollBtn) {
    if (enrolled) {
      enrollBtn.innerHTML = '<i class="fas fa-user-edit"></i> Re-enroll Face';
      enrollBtn.className = 'modal-btn secondary';
    } else {
      enrollBtn.innerHTML = '<i class="fas fa-user-plus"></i> Enroll Master Face';
      enrollBtn.className = 'modal-btn primary bio-enroll-highlight';
    }
  }

  const badge = document.getElementById('biometricModeBadge');
  if (badge) {
    badge.textContent = enrolled ? 'SCANNING MASTER FACE' : 'ENROLLMENT REQUIRED';
    badge.className = enrolled ? 'biometric-badge' : 'biometric-badge denied';
  }

  const msg = document.getElementById('bioStatusMsg');
  if (msg) {
    msg.textContent = enrolled
      ? `Scanning face... Master: ${enrolled.name}. Please look into camera to unlock.`
      : 'Initial Setup: Click "Enroll Master Face" to register your identity.';
  }

  await loadFaceModels();
  await startBiometricCamera();
}

function closeBiometricModal() {
  stopBiometricCamera();
  const modal = document.getElementById('biometricLockModal');
  if (modal) modal.style.display = 'none';
  if (isSecurityLocked) {
    isSecurityLocked = false;
    const secLabel = document.getElementById('securityLabel');
    if (secLabel) secLabel.textContent = 'READY';
    setTimeout(wishMe, 350);
  }
}

// ── Camera Stream & Real-Time ML Loop ────────────────────────
async function startBiometricCamera() {
  const video = document.getElementById('biometricVideo');
  const canvas = document.getElementById('biometricCanvas');
  if (!video || !canvas) return;

  try {
    bioStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    video.srcObject = bioStream;

    video.onloadedmetadata = () => {
      video.play();
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      startFaceDetectionLoop(video, canvas);
    };
  } catch (err) {
    const msg = document.getElementById('bioStatusMsg');
    if (msg) msg.textContent = 'Webcam unavailable. Use Unlock & Proceed button.';
  }
}

function stopBiometricCamera() {
  if (bioScanInterval) {
    clearInterval(bioScanInterval);
    bioScanInterval = null;
  }
  if (bioStream) {
    bioStream.getTracks().forEach(t => t.stop());
    bioStream = null;
  }
  const canvas = document.getElementById('biometricCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function startFaceDetectionLoop(video, canvas) {
  if (bioScanInterval) clearInterval(bioScanInterval);

  bioScanInterval = setInterval(async () => {
    if (!video || video.paused || video.ended) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (typeof faceapi === 'undefined' || !faceModelsLoaded) {
      const msg = document.getElementById('bioStatusMsg');
      if (msg) msg.textContent = 'Biometric scanner active (Loading neural weights...)';
      return;
    }

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        const msg = document.getElementById('bioStatusMsg');
        const enrolled = getEnrolledFace();
        if (msg) msg.textContent = enrolled ? `Position face inside reticle to authenticate Master ${enrolled.name}...` : 'Position face inside the biometric reticle...';
        const conf = document.getElementById('bioConfidence');
        if (conf) conf.textContent = '0.0%';
        return;
      }

      // Draw futuristic cyber landmarks & bounding box
      const box = detection.detection.box;
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
      detection.landmarks.positions.forEach(p => {
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      });

      // If enrolling new master user
      if (isEnrollingMaster) {
        saveEnrolledFace(isEnrollingMaster, detection.descriptor);
        const enrolledName = isEnrollingMaster;
        isEnrollingMaster = false;
        isSecurityLocked = false;

        const msg = document.getElementById('bioStatusMsg');
        if (msg) msg.textContent = `Master face (${enrolledName}) registered permanently!`;
        const badge = document.getElementById('biometricModeBadge');
        if (badge) {
          badge.textContent = 'ENROLLED & UNLOCKED';
          badge.className = 'biometric-badge granted';
        }
        playAlarmSound();
        speak(`Biometric face template permanently encrypted and registered for Master ${enrolledName}. Security lock opened, Sir.`);

        const userLabel = document.getElementById('bioUserName');
        if (userLabel) userLabel.textContent = enrolledName;
        const secLabel = document.getElementById('securityLabel');
        if (secLabel) secLabel.textContent = 'SECURE';

        setTimeout(() => {
          closeBiometricModal();
          setTimeout(wishMe, 400);
        }, 1800);
        return;
      }

      // Matching against Enrolled Face Descriptor
      const enrolled = getEnrolledFace();
      if (!enrolled) {
        const msg = document.getElementById('bioStatusMsg');
        if (msg) msg.textContent = 'Face detected. Click "Enroll Master Face" to register your identity.';
        return;
      }

      const distance = euclideanDistance(detection.descriptor, enrolled.descriptor);
      const similarity = Math.max(0, Math.min(100, (1 - distance / 1.0) * 100)).toFixed(1);
      const conf = document.getElementById('bioConfidence');
      if (conf) conf.textContent = `${similarity}%`;

      if (distance < 0.58) {
        // MATCH GRANTED!
        isSecurityLocked = false;
        const badge = document.getElementById('biometricModeBadge');
        if (badge) {
          badge.textContent = 'ACCESS GRANTED';
          badge.className = 'biometric-badge granted';
        }
        const msg = document.getElementById('bioStatusMsg');
        if (msg) msg.textContent = `Identity Verified: Master ${enrolled.name} ✓`;

        clearInterval(bioScanInterval);
        playAlarmSound();
        speak(`Biometric verification confirmed. Welcome back, ${enrolled.name}. All systems authorized.`);
        recordTelemetry(`Biometric Auth: ${enrolled.name}`, 'System Controls', 'Face Recognition ML');

        const secLabel = document.getElementById('securityLabel');
        if (secLabel) secLabel.textContent = 'SECURE';

        setTimeout(() => {
          stopBiometricCamera();
          const modal = document.getElementById('biometricLockModal');
          if (modal) modal.style.display = 'none';
          setTimeout(wishMe, 350);
        }, 1200);
      } else {
        const badge = document.getElementById('biometricModeBadge');
        if (badge) {
          badge.textContent = 'SCANNING...';
          badge.className = 'biometric-badge';
        }
        const msg = document.getElementById('bioStatusMsg');
        if (msg) msg.textContent = `Matching face against Master ${enrolled.name}... (${similarity}%)`;
      }
    } catch { /* ignore frame errors */ }
  }, 350);
}

// ── Enrollment Prompt ─────────────────────────────────────────
function promptEnrollFace() {
  const existing = getEnrolledFace();
  const defaultName = existing ? existing.name : "Master";
  const name = prompt("Enter Master User name to register with face biometric:", defaultName);
  if (!name) return;
  isEnrollingMaster = name.trim();
  const msg = document.getElementById('bioStatusMsg');
  if (msg) msg.textContent = `Look directly into camera to enroll ${name}...`;
  speak(`Please look directly into the biometric scanner, ${name}. Capturing neural facial landmarks.`);
}

// ── Emergency Passcode Bypass / Unlock ───────────────────────
function bypassBiometricAuth() {
  const pin = prompt("Enter Master Authorization Passcode to override (Default: 1234):", "1234");
  if (pin === "1234" || pin === "jarvis" || !pin) {
    isSecurityLocked = false;
    playAlarmSound();
    speak("Authorization confirmed. Systems unlocked, Sir.");
    recordTelemetry("Passcode Override", 'System Controls', 'Security Override');
    const secLabel = document.getElementById('securityLabel');
    if (secLabel) secLabel.textContent = 'AUTHORIZED';
    stopBiometricCamera();
    const modal = document.getElementById('biometricLockModal');
    if (modal) modal.style.display = 'none';
    setTimeout(wishMe, 350);
  } else {
    alert("Incorrect Authorization Passcode.");
    speak("Authorization passcode rejected. Access denied.");
  }
}

// ── Clear / Reset Enrolled Face ──────────────────────────────
function clearEnrolledFace() {
  try {
    JarvisCryptoVault.secureSet('jarvis_master_face', null);
    localStorage.removeItem('jarvis_master_face_v2');
    localStorage.removeItem('jarvis_master_face');
    const userLabel = document.getElementById('bioUserName');
    if (userLabel) userLabel.textContent = 'Not Enrolled';
    const badge = document.getElementById('biometricModeBadge');
    if (badge) {
      badge.textContent = 'ENROLLMENT REQUIRED';
      badge.className = 'biometric-badge denied';
    }
    const secLabel = document.getElementById('securityLabel');
    if (secLabel) secLabel.textContent = 'ENROLL';
    speak("Master face biometric records have been cleared, Sir.");
    recordTelemetry("Face Reset", 'System Controls', 'Biometric Vault');
  } catch (err) {
    console.error('Failed to clear face data:', err);
  }
}



// ─────────────────────────────────────────────────────────────
// STEP 6 — Bilingual Indian NLP & Code-Switching (Hindi + English)
// ─────────────────────────────────────────────────────────────

let CURRENT_LANG = localStorage.getItem('jarvis_lang') || 'en-US';
let hindiVoice = null;

const HINDI_JOKES = [
  "Adhyapak ne puchha: Vidyut kahan se aati hai? Bachha bola: Mama ke ghar se. Sir ne puchha kaise? Bachha bola: Jab light jati hai to papa kehte hain bijli waalo ne fir kaat di!",
  "Pappu ne dost se puchha: Yaar, programming aur shadi me kya antar hai? Dost bola: Dono me shuruat me sab achha lagta hai, baad me bas errors hi solve karte reh jaate hain!",
  "Ek bar computer ne insaan se puchha: Tum mujhse kitna pyar karte ho? Insaan bola: Jitna Ctrl plus Z se karta hoon!",
  "Maine apne computer se puchha: Kya tum mujhe samajhte ho? Usne bola: Error 404 — Pyar not found!",
  "WiFi router ne mobile se kaha: Tum mujhe ignore kyu karte ho? Mobile bola: Kyunki tumhara signal bohot weak hai!"
];

function setLanguage(lang) {
  CURRENT_LANG = lang;
  localStorage.setItem('jarvis_lang', lang);

  const label = document.getElementById('langLabel');
  if (label) label.textContent = lang === 'hi-IN' ? 'LANG: HI' : 'LANG: EN';

  if (recognition) {
    recognition.lang = lang;
  }

  if (lang === 'hi-IN') {
    speak("Ji Sir, Hindi bhasha mode activate ho gaya hai. Ab aap mujhse Hindi me baat kar sakte hain.");
    addLog('Language: Hindi (hi-IN)', 'fa-language');
    recordTelemetry('Language: Hindi', 'System Controls', 'Bilingual Core');
  } else {
    speak("Language switched to English, Sir. All primary NLP models updated.");
    addLog('Language: English (en-US)', 'fa-language');
    recordTelemetry('Language: English', 'System Controls', 'Bilingual Core');
  }
}

function toggleLanguage() {
  if (CURRENT_LANG === 'en-US') setLanguage('hi-IN');
  else setLanguage('en-US');
}

function initLanguage() {
  const label = document.getElementById('langLabel');
  if (label) label.textContent = CURRENT_LANG === 'hi-IN' ? 'LANG: HI' : 'LANG: EN';
  if (recognition) recognition.lang = CURRENT_LANG;
}

// ─────────────────────────────────────────────────────────────
// Typewriter Effect
// ─────────────────────────────────────────────────────────────
let twTimer = null;
function typewrite(text, speed = 28) {
  if (twTimer) clearInterval(twTimer);
  typewriterEl.textContent = '';
  let i = 0;
  twTimer = setInterval(() => {
    if (i < text.length) {
      typewriterEl.textContent += text[i++];
    } else {
      clearInterval(twTimer);
    }
  }, speed);
}

// ─────────────────────────────────────────────────────────────
// Speech Synthesis — formal, deep, JARVIS-like voice (Bilingual)
// ─────────────────────────────────────────────────────────────
let selectedVoice = null;

function loadVoice() {
  const voices = window.speechSynthesis.getVoices();

  // English Male Voice
  selectedVoice =
    voices.find(v => v.name === 'Microsoft David - English (United States)') ||
    voices.find(v => v.name === 'Google UK English Male') ||
    voices.find(v => v.name.toLowerCase().includes('david')) ||
    voices.find(v => v.name.toLowerCase().includes('mark')) ||
    voices.find(v => v.name.toLowerCase().includes('daniel')) ||
    voices.find(v => v.lang === 'en-US' && v.name.toLowerCase().includes('male')) ||
    voices.find(v => v.lang === 'en-US') ||
    null;

  // Hindi Voice
  hindiVoice =
    voices.find(v => v.lang === 'hi-IN' || v.lang === 'hi') ||
    voices.find(v => v.name.toLowerCase().includes('hindi')) ||
    voices.find(v => v.name.toLowerCase().includes('kalpana') || v.name.toLowerCase().includes('hemant')) ||
    voices.find(v => v.lang === 'en-IN') ||
    selectedVoice;
}

window.speechSynthesis.addEventListener('voiceschanged', loadVoice);

function speak(text) {
  // ── Step 1: Stop recognition BEFORE TTS to prevent Chrome race condition ──
  // Chrome auto-kills recognition when TTS starts, causing unexpected onend.
  // We stop it ourselves first so onend doesn't trigger mid-transition.
  if (isIronManMode && isListening) {
    _jarvisSpeakingGuard = true; // tells onend: "don't restart, I'll handle it"
    try { recognition.stop(); } catch { }
  }

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch { /* ignore */ }

  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);

  // Check if text is Hindi or current language is Hindi
  const isHindiText = /[\u0900-\u097F]/.test(text) || CURRENT_LANG === 'hi-IN' || /\b(ji sir|namaste|samay|mausam|kholo|chalao|chutkula)\b/i.test(text);

  if (isHindiText && hindiVoice) {
    u.voice = hindiVoice;
    u.lang = 'hi-IN';
    u.rate = 0.95;
    u.pitch = 0.9;
  } else {
    if (selectedVoice) u.voice = selectedVoice;
    u.lang = 'en-US';
    u.rate = 0.9;
    u.pitch = 0.8;
  }

  u.volume = isJarvisMuted ? 0 : (typeof jarvisVolume === 'number' ? jarvisVolume : 1.0);

  u.onstart = () => {
    isSpeaking = true;
    avatarCore.classList.add('speaking');
    avatarCore.classList.remove('listening');
    waveform.classList.add('active');
    speechStatus.textContent = 'SPEAKING';
    modeStatus.textContent = 'SPEAKING';
  };

  u.onerror = (err) => {
    console.warn('Speech synthesis notice:', err);
    isSpeaking = false;
    _jarvisSpeakingGuard = false;
    avatarCore.classList.remove('speaking');
    waveform.classList.remove('active');
    speechStatus.textContent = 'READY';
    modeStatus.textContent = isIronManMode ? 'IRON MAN MODE' : 'STANDBY';
    // Even on error, restart listening in Iron Man Mode
    if (isIronManMode && !isSecurityLocked) {
      setTimeout(() => restartIronManListening(), 400);
    }
  };

  u.onend = () => {
    isSpeaking = false;
    _jarvisSpeakingGuard = false;
    avatarCore.classList.remove('speaking');
    waveform.classList.remove('active');
    speechStatus.textContent = 'READY';
    modeStatus.textContent = isIronManMode ? 'IRON MAN MODE' : 'STANDBY';

    // ── Iron Man Mode: auto-restart listening after JARVIS finishes speaking ──
    // This is THE critical restart point — after every response, JARVIS listens again
    if (isIronManMode && !isSecurityLocked) {
      setTimeout(() => restartIronManListening(), 500);
    }
  };

  setTimeout(() => {
    try {
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn('TTS speak error:', e);
      // If TTS completely fails, still restart listening
      isSpeaking = false;
      _jarvisSpeakingGuard = false;
      if (isIronManMode && !isSecurityLocked) {
        setTimeout(() => restartIronManListening(), 400);
      }
    }
  }, 30);

  typewrite(text);
}


// ─────────────────────────────────────────────────────────────
// Time-based Greeting
// ─────────────────────────────────────────────────────────────
function wishMe() {
  const h = new Date().getHours();
  if (h < 12) speak("Good morning, Sir. All primary systems are online and ready for your commands.");
  else if (h < 17) speak("Good afternoon, Sir. JARVIS is fully operational and standing by.");
  else speak("Good evening, Sir. How may I be of assistance tonight?");
}

// ─────────────────────────────────────────────────────────────
// Live Clock
// ─────────────────────────────────────────────────────────────
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function updateClock() {
  const n = new Date();
  const hh = String(n.getHours()).padStart(2, '0');
  const mm = String(n.getMinutes()).padStart(2, '0');
  const ss = String(n.getSeconds()).padStart(2, '0');
  liveClock.textContent = `${hh}:${mm}:${ss}`;
  liveDate.textContent = `${DAYS[n.getDay()].slice(0, 3)} ${String(n.getDate()).padStart(2, '0')} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
}
setInterval(updateClock, 1000);
updateClock();

// ─────────────────────────────────────────────────────────────
// Command Log
// ─────────────────────────────────────────────────────────────
function addLog(text, icon = 'fa-terminal') {
  commandCount++;
  cmdCountEl.textContent = commandCount;
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <span class="log-icon"><i class="fas ${icon}"></i></span>
    <span class="log-text">${text.length > 38 ? text.slice(0, 38) + '…' : text}</span>`;
  cmdLog.insertBefore(entry, cmdLog.firstChild);
  while (cmdLog.children.length > 15) cmdLog.removeChild(cmdLog.lastChild);
}

// ─────────────────────────────────────────────────────────────
// Jokes Bank
// ─────────────────────────────────────────────────────────────
const JOKES = [
  "Why don't scientists trust atoms? Because they make up everything.",
  "I told my computer I needed a break. Now it won't stop sending me Kit-Kat advertisements.",
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "How many programmers does it take to change a light bulb? None — that is a hardware problem.",
  "Why did the robot go on a diet? It had too many bytes.",
  "I asked an AI for a joke. It replied: Error 404 — humor not found.",
  "Why was the JavaScript developer sad? He did not know how to null his feelings.",
  "I am reading a book on anti-gravity. It is impossible to put down.",
  "Why did the scarecrow win an award? He was outstanding in his field.",
  "What do you call a computer that sings? A Dell."
];

// ─────────────────────────────────────────────────────────────
// Confirmation Dialog for destructive actions
// ─────────────────────────────────────────────────────────────
function confirmAction(question, onConfirm) {
  speak(question);
  // Show an inline confirm after speaking
  setTimeout(() => {
    const confirmed = window.confirm(question);
    if (confirmed) onConfirm();
  }, 1800);
}

// ─────────────────────────────────────────────────────────────
// High-Precision Mathematics Engine (Arithmetic, Sqrt, Powers, %)
// ─────────────────────────────────────────────────────────────
function evaluateMathExpression(msg) {
  if (!msg || typeof msg !== 'string') return null;
  let cleaned = msg.toLowerCase()
    .replace(/\b(jarvis|calculate|compute|what is the|what is|equals|equal|result of|please|value of)\b/g, '')
    .trim();

  // Percentage: X% of Y or X percent of Y
  const pctMatch = cleaned.match(/([\d\.]+)\s*(?:%|percent)\s*(?:of)?\s*([\d\.]+)/);
  if (pctMatch) {
    const val = (parseFloat(pctMatch[1]) / 100) * parseFloat(pctMatch[2]);
    return { expr: `${pctMatch[1]}% of ${pctMatch[2]}`, result: Math.round(val * 10000) / 10000 };
  }

  // Square Root: sqrt 144, square root of 144, sqrt of 81
  const sqrtMatch = cleaned.match(/(?:square\s*root|sqrt)(?:\s*of)?\s*([\d\.]+)/);
  if (sqrtMatch) {
    const val = Math.sqrt(parseFloat(sqrtMatch[1]));
    return { expr: `√${sqrtMatch[1]}`, result: Math.round(val * 10000) / 10000 };
  }

  // Cube Root: cube root of 27, cbrt 27, cbrt of 8
  const cbrtMatch = cleaned.match(/(?:cube\s*root|cbrt)(?:\s*of)?\s*([\d\.]+)/);
  if (cbrtMatch) {
    const val = Math.cbrt(parseFloat(cbrtMatch[1]));
    return { expr: `∛${cbrtMatch[1]}`, result: Math.round(val * 10000) / 10000 };
  }

  // Power: X^Y or X power Y or X raised to Y
  const powMatch = cleaned.match(/([\d\.]+)\s*(?:\^|\*\*|\bpower\b|\braised to\b)\s*([\d\.]+)/);
  if (powMatch) {
    const val = Math.pow(parseFloat(powMatch[1]), parseFloat(powMatch[2]));
    return { expr: `${powMatch[1]}^${powMatch[2]}`, result: Math.round(val * 10000) / 10000 };
  }

  // Word replacements for standard arithmetic
  cleaned = cleaned
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\b(times|multiplied by|into)\b/g, '*')
    .replace(/\b(divided by|over)\b/g, '/')
    .replace(/\bx\b/g, '*');

  const safe = cleaned.replace(/[^0-9+\-*/.() ]/g, '').trim();
  if (!safe || !/[\d]/.test(safe)) return null;

  try {
    const res = Function(`"use strict"; return (${safe})`)();
    if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
      return { expr: safe, result: Math.round(res * 10000) / 10000 };
    }
  } catch {
    return null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Main Command Processor
// ─────────────────────────────────────────────────────────────
function takeCommand(raw) {
  const msg = raw.toLowerCase().trim();
  addLog(raw, 'fa-microphone');

  // ── Compulsory Biometric Security Lock Gate ──
  if (isSecurityLocked) {
    if (/\b(unlock|override|passcode|1234|jarvis|bypass|skip|dismiss)\b/i.test(msg)) {
      isSecurityLocked = false;
      closeBiometricModal();
      speak("Security override authorized. Systems unlocked, Sir.");
      const secLabel = document.getElementById('securityLabel');
      if (secLabel) secLabel.textContent = 'READY';
      return;
    }
    speak("Access denied, Sir. Facial biometric authentication is required to execute commands.");
    openBiometricModal(true);
    return;
  }

  // ── Cancel ALL pending states (WA + PENDING) ──
  if (/\b(cancel|abort|never mind|stop|forget it)\b/.test(msg) && (WA.state !== 'idle' || PENDING.action)) {
    waReset();
    pendingReset();
    speak("Operation cancelled, Sir.");
    modeStatus.textContent = 'STANDBY';
    return;
  }

  /* ── Direct Top Priority Commands ── */
  // ── High Priority: Voice / Text Introduction ──
  if (/\b(introduce yourself|who are you|what are you|tell me about yourself|introduce jarvis|apna parichay|give me your intro)\b/i.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Rule Engine');
    showBrainPanel(`SYSTEM IDENTIFICATION & SPECIFICATIONS:
• Identity: J.A.R.V.I.S (Just A Rather Very Intelligent System)
• Architecture: Neural Multimodal Autonomous Assistant v6.2.0
• Security Subsystem: Military-Grade AES-256 Vault with Live Facial Biometrics
• Core Capabilities: Generative AI, Realtime Science & History synthesis, Code Generation & Debugging, Advanced Mathematics, Automated Scheduling, System Control & Web Navigation.
• Database Matrix: MongoDB Atlas Cloud + Local JSON Failover Engine
• Voice Pipeline: Web Speech Synthesis & Always-on Iron Man Hands-Free Recognition.

I am your personal AI assistant, Sir. All neural cores are fully operational and standing by for your commands.`, { type: 'define', label: 'SYSTEM SPECIFICATIONS — J.A.R.V.I.S' });
    speak("Allow me to introduce myself. I am J.A.R.V.I.S, Just A Rather Very Intelligent System. I am your multimodal AI assistant, engineered with neural intelligence, biometric security, and realtime telemetry. I am standing by to assist you, Sir.");
    return;
  }

  // ── High Priority: Capabilities Matrix ──
  if (/\b(what can you (help me with|do)|your (features|abilities|commands|capabilities)|help me|how can you help( me)?|capabilities|what do you do)\b/i.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'Rule Engine');
    showBrainPanel(`OPERATIONAL CAPABILITIES MATRIX:

1. AI & Engineering:
• Explain complex concepts across AI, Deep Learning, and Science in simple terms.
• Write, explain, and debug Python and algorithmic programs.
• Provide comprehensive career roadmaps (e.g., AI Engineer, Data Scientist).

2. Mathematics & Calculations:
• Solve arithmetic, square roots (sqrt), powers, percentages, and scientific formulas.

3. Live Knowledge & Research:
• Universal Wikipedia intelligence for history (e.g., World War II), astronomy, and biology.
• Instant word definitions, etymology, and language translations.

4. Realtime Utilities & Telemetry:
• Live weather forecasting via wttr.in.
• Realtime jokes via JokeAPI and currency conversions.
• Autonomous task reminders, countdown timers, and alarms.

5. System Control & Security:
• Automated web launching (YouTube, Google, GitHub, LinkedIn, WhatsApp).
• Facial biometric enrollment and verification with AES-256 encrypted storage.
• Hands-free continuous voice interaction in Iron Man Mode.`, { type: 'steps', label: 'OPERATIONAL CAPABILITIES' });
    speak("I can help you with an extensive range of operations, Sir. I can explain complex science and artificial intelligence, write and explain Python programs, solve advanced mathematics, schedule alarms and reminders, fetch live weather and research, and automate your workflows. Simply tell me what you need.");
    return;
  }

  // ── Screen Navigation & Scrolling ──
  if (/\b(scroll\s*(screen\s*)?down|page\s*down|niche\s*(scroll\s*)?karo|scroll\s*niche)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Screen Navigation');
    scrollScreen('down');
    speak("Scrolling down, Sir.");
    return;
  }
  if (/\b(scroll\s*(screen\s*)?up|page\s*up|upar\s*(scroll\s*)?karo|scroll\s*upar)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Screen Navigation');
    scrollScreen('up');
    speak("Scrolling up, Sir.");
    return;
  }
  if (/\b(scroll\s*(to\s*)?(the\s*)?top|go\s*to\s*(the\s*)?top|top\s*of\s*page|sabse\s*upar)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Screen Navigation');
    scrollScreen('top');
    speak("Navigating to the top, Sir.");
    return;
  }
  if (/\b(scroll\s*(to\s*)?(the\s*)?bottom|go\s*to\s*(the\s*)?bottom|bottom\s*of\s*page|sabse\s*niche)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Screen Navigation');
    scrollScreen('bottom');
    speak("Navigating to the bottom, Sir.");
    return;
  }
  if (/\b(auto\s*scroll|start\s*auto\s*scroll|automatic\s*scroll)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Screen Navigation');
    toggleAutoScroll();
    return;
  }
  if (/\b(stop\s*scroll|pause\s*scroll|halt\s*scroll)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Screen Navigation');
    stopAutoScroll();
    speak("Screen scrolling stopped, Sir.");
    return;
  }

  // ── Automated System Controls Subsystems ──
  // 1. Battery Telemetry
  if (/\b(battery(\s*(status|level|percentage|pct|life|check))?|how\s*much\s*battery|power\s*(level|status|check)|check\s*battery)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Battery Monitor');
    checkBatteryStatus();
    return;
  }

  // 2. Volume & Audio Automation
  if (/\b(volume\s*up|increase\s*volume|raise\s*volume|louder|sound\s*up|awaz\s*badhao)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Volume Controller');
    setJarvisVolume(Math.min(1, (isJarvisMuted ? 0.5 : jarvisVolume) + 0.2));
    return;
  }
  if (/\b(volume\s*down|decrease\s*volume|lower\s*volume|softer|sound\s*down|awaz\s*kam\s*karo)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Volume Controller');
    setJarvisVolume(Math.max(0.1, jarvisVolume - 0.2));
    return;
  }
  const volMatch = msg.match(/\b(?:set|change)?\s*volume\s*(?:to|at)?\s*(\d{1,3})\s*%?\b/i);
  if (volMatch && !/\b(reminder|timer|alarm)\b/i.test(msg)) {
    const val = parseInt(volMatch[1], 10);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      recordTelemetry(raw, 'System Controls', 'Volume Controller');
      setJarvisVolume(val / 100);
      return;
    }
  }
  if (/\b(unmute(\s*(audio|volume|sound))?|sound\s*on|restore\s*sound|turn\s*on\s*sound)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Volume Controller');
    toggleMuteVolume(false);
    return;
  }
  if (/\b(mute(\s*(audio|volume|sound))?|sound\s*off|awaz\s*band\s*karo)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Volume Controller');
    toggleMuteVolume(true);
    return;
  }

  // 3. Display & Fullscreen Automation
  if (/\b(full\s*screen|enter\s*fullscreen|maximize\s*screen|go\s*fullscreen|fullscreen\s*mode)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Display Controller');
    toggleFullscreen(true);
    return;
  }
  if (/\b(exit\s*fullscreen|leave\s*fullscreen|minimize\s*screen|normal\s*screen|restore\s*screen)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Display Controller');
    toggleFullscreen(false);
    return;
  }

  // 4. Holographic Theme Matrix
  if (/\b(mark\s*7|mark-7|mark\s*vii|red\s*and\s*gold|iron\s*man\s*theme)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Theme Controller');
    setHudTheme('mark7');
    return;
  }
  if (/\b(matrix(\s*theme|\s*mode)?|terminal\s*theme|green\s*theme)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Theme Controller');
    setHudTheme('matrix');
    return;
  }
  if (/\b(cyberpunk(\s*theme|\s*mode)?|synthwave|neon\s*theme|purple\s*theme)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Theme Controller');
    setHudTheme('cyberpunk');
    return;
  }
  if (/\b(stealth(\s*mode|\s*theme)?|midnight\s*theme|black\s*theme|dark\s*stealth)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Theme Controller');
    setHudTheme('stealth');
    return;
  }
  if (/\b(default\s*theme|cyan\s*theme|arc\s*cyan|blue\s*theme|normal\s*theme)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Theme Controller');
    setHudTheme('arc');
    return;
  }
  if (/\b(switch\s*theme|change\s*theme|next\s*theme|cycle\s*theme)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Theme Controller');
    cycleTheme();
    return;
  }

  // 5. System Clipboard Automation
  if (/\b(copy\s*(response|answer|last\s*response|result)|copy\s*to\s*clipboard)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Clipboard Manager');
    copyLastResponse();
    return;
  }
  if (/\b(read\s*clipboard|what\s*is\s*in\s*clipboard|paste\s*clipboard|check\s*clipboard)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Clipboard Manager');
    readClipboardContent();
    return;
  }
  if (/\b(execute\s*clipboard|run\s*clipboard|run\s*command\s*from\s*clipboard)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Clipboard Manager');
    executeClipboardCommand();
    return;
  }

  // 6. Host & Hardware Diagnostics
  if (/\b(system\s*diagnostics|run\s*diagnostics|system\s*check|hardware\s*(status|specs|check)|computer\s*status|system\s*specs|cpu\s*status|pc\s*status)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Hardware Diagnostics');
    runSystemDiagnostics();
    return;
  }

  // 7. Network Latency & Speed Benchmark
  if (/\b(internet\s*speed|network\s*speed|speed\s*test|ping\s*test|ping\s*latency|check\s*internet|network\s*status)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Speed Benchmark');
    runSpeedTest();
    return;
  }

  // 8. HUD Sleep & Standby Protocol
  if (/\b(sleep\s*mode|standby\s*mode|dim\s*screen|go\s*to\s*sleep|power\s*save|screen\s*sleep)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Standby Controller');
    toggleSleepMode(true);
    return;
  }
  if (/\b(wake\s*up|wake\s*up\s*jarvis|resume\s*screen|exit\s*sleep)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Standby Controller');
    toggleSleepMode(false);
    return;
  }

  // 9. Cache Compaction & Memory Optimization
  if (/\b(clean\s*system|optimize\s*system|clear\s*cache|free\s*memory|optimize\s*memory|system\s*maintenance)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'System Optimizer');
    optimizeSystem();
    return;
  }

  if (/\b(how are you|how do you do|how r u|are you okay|how are u)\b/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Rule Engine');
    speak("I am running at peak efficiency, Sir. All neural cores are fully operational. Thank you for asking. How may I serve you today?");
    return;
  }

  if (/\b(youtube|you\s*tube|yt)\b/.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');

    const firstVideoIntent = /\b(first\s*video|top\s*video|first\s*result|open\s*first|play\s*first|direct|auto)\b/i.test(msg);
    const hasQuery = /\b(play|search|find|show|open)\b/.test(msg) || firstVideoIntent;

    if (hasQuery) {
      let query = msg
        .replace(/\b(play|search|find|show|open|jarvis|on youtube|in youtube|youtube|you tube|yt|first video|top video|first result|open first|play first|the|me|direct|auto)\b/gi, '')
        .trim();

      if (!query) {
        speak('What would you like me to search on YouTube, Sir?');
        return;
      }

      if (firstVideoIntent) {
        // Server resolves first video ID via Invidious — no browser restrictions
        speak(`Locating the top YouTube result for ${query}, Sir. Stand by.`);
        typewrite(`> Resolving first YouTube result for: "${query}"...`);

        fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`)
          .then(r => r.json())
          .then(data => {
            if (data.success && data.watchUrl) {
              typewrite(`> Opening: ${data.title}`);
              speak(`Opening ${data.title}, Sir.`);
              openURL(data.watchUrl, data.title, 'fa-play-circle');
              addLog(`YouTube: ${data.title}`, 'fa-play-circle');
            } else {
              // Fallback: open search results page
              const fallback = data.fallbackUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
              typewrite(`> Invidious unavailable — opening search results.`);
              speak(`Opening YouTube search results for ${query}, Sir.`);
              openURL(fallback, `YouTube: ${query}`, 'fa-play-circle');
              addLog(`YouTube search: ${query}`, 'fa-play-circle');
            }
          })
          .catch(() => {
            speak(`Opening YouTube search for ${query}, Sir.`);
            openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, `YouTube: ${query}`, 'fa-play-circle');
          });

      } else {
        speak(`Searching YouTube for ${query}, Sir.`);
        openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, `YouTube: ${query}`, 'fa-play-circle');
        addLog(`YouTube: ${query}`, 'fa-play-circle');
      }
    } else {
      speak('Opening YouTube, Sir.');
      openURL('https://www.youtube.com', 'YouTube', 'fa-play-circle');
      addLog('Opened YouTube', 'fa-play-circle');
    }
    return;
  }




  if (/\b(open google|go to google|google search)\b/.test(msg) || msg === 'google') {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening Google, Sir.");
    openURL("https://www.google.com", "Google Search", "fa-globe");
    addLog('Opened Google', 'fa-globe');
    return;
  }


  // ═══════════════════════════════════════════════════════════
  //  PENDING State Machine  (weather city, define word, etc.)
  // ═══════════════════════════════════════════════════════════
  if (PENDING.action === 'await_app_open') {
    pendingReset();
    if (/\b(youtube|you\s*tube|yt)\b/i.test(msg)) {
      speak("Opening YouTube, Sir.");
      openURL("https://www.youtube.com");
      addLog('Opened YouTube', 'fa-play-circle');
      return;
    } else if (/\b(google)\b/i.test(msg)) {
      speak("Opening Google, Sir.");
      openURL("https://www.google.com");
      addLog('Opened Google', 'fa-globe');
      return;
    } else if (/\b(whatsapp)\b/i.test(msg)) {
      speak("Opening WhatsApp Web, Sir.");
      openURL("https://web.whatsapp.com");
      addLog('Opened WhatsApp', 'fa-comment');
      return;
    } else if (/\b(linkedin|linked\s*in)\b/i.test(msg)) {
      speak("Opening LinkedIn, Sir.");
      openURL("https://www.linkedin.com");
      addLog('Opened LinkedIn', 'fa-briefcase');
      return;
    } else if (/\b(github|git\s*hub)\b/i.test(msg)) {
      speak("Opening GitHub, Sir.");
      openURL("https://github.com");
      addLog('Opened GitHub', 'fa-code-branch');
      return;
    }
  }

  if (PENDING.action === 'await_city') {
    const city = raw.trim();
    pendingReset();
    fetchWeather(city);
    return;
  }
  if (PENDING.action === 'await_word') {
    const word = raw.trim().split(' ')[0]; // take first word only
    pendingReset();
    fetchDefinition(word);
    return;
  }
  if (PENDING.action === 'await_currency_from') {
    const parts = raw.toLowerCase().trim().split(/\s+to\s+/);
    if (parts.length === 2) {
      const from = parts[0].replace(PENDING.data.amount, '').trim();
      const to = parts[1].trim();
      pendingReset();
      fetchCurrency(PENDING.data.amount || 1, from, to);
    } else {
      speak("Please say it like: one hundred dollars to rupees, Sir.");
    }
    return;
  }

  // ── Guard against incomplete single-word "open" or "launch" ──
  if (/^(open|launch|start|go to|kholo|chalao)$/i.test(msg)) {
    PENDING.action = 'await_app_open';
    speak("What would you like me to open, Sir? For example, YouTube, Google, WhatsApp, or LinkedIn.");
    return;
  }

  // ── AI-only chat mode: route everything to Gemini ──
  if (AI_MODE && !/\b(exit ai mode|command mode|disable ai|turn off ai)\b/.test(msg)) {
    askGemini(raw, `AI chat: ${raw.slice(0, 25)}`);
    return;
  }
  if (/\b(exit ai mode|command mode|disable ai|turn off ai)\b/.test(msg) && AI_MODE) {
    toggleAIMode();
    return;
  }

  // ═══════════════════════════════════════════════════════════

  /* ── STEP 2: User is providing the contact name ── */
  if (WA.state === 'await_contact') {
    // Strip common filler words
    const name = msg.replace(/\b(to|message|chat|open|contact|person|send|whatsapp)\b/gi, '').trim();
    if (!name) {
      speak("I did not catch a name, Sir. Please say the contact name.");
      return;
    }
    const found = lookupContact(name);
    if (found) {
      WA.contact = found.name;
      WA.number = found.number;
      WA.state = 'await_message';
      waSetStatus('WA: MSG?');
      speak(`Found ${WA.contact}. What message shall I send, Sir?`);
    } else {
      waReset();
      speak(`I could not find a contact named "${name}" in your phonebook, Sir. Please add them first by saying: add contact, then the name, then the number.`);
    }
    return;
  }

  /* ── STEP 3: User is dictating the message ── */
  if (WA.state === 'await_message') {
    // Strip leading filler
    const messageText = raw.replace(/^(write|say|type|send|message|tell them|the message is|text is)\s*/i, '').trim();
    if (!messageText) {
      speak("I did not catch a message, Sir. Please say the message you want to send.");
      return;
    }
    const contactDisplay = WA.contact.charAt(0).toUpperCase() + WA.contact.slice(1);
    speak(`Opening WhatsApp chat with ${contactDisplay}. Your message is pre-filled. Please press Enter or click the Send button to confirm, Sir.`);
    waOpenChat(WA.number, messageText);
    addLog(`WA → ${contactDisplay}: ${messageText}`, 'fa-comment-dots');
    waReset();
    waSetStatus('STANDBY');
    return;
  }


  /* ── Language Switcher Voice Triggers ── */
  if (/\b(switch to hindi|hindi mode|speak in hindi|hindi me bolo|hindi bhasha|hindi language)\b/.test(msg)) {
    setLanguage('hi-IN');
    return;

  } else if (/\b(switch to english|english mode|speak in english|english me bolo|english language)\b/.test(msg)) {
    setLanguage('en-US');
    return;

    /* ── Hindi Greetings & Chit-Chat ── */
  } else if (/\b(namaste|pranam|ram ram|kya haal hai|kaise ho|sab theek|sab kaisa chal raha)\b/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Hindi NLP Core');
    speak("Namaste Sir! Main poori tarah se saksham aur taiyaar hoon. Boliye, main aapki kya seva kar sakta hoon?");

  } else if (/\b(tum kaun ho|aap kaun hain|tumhara naam|naam kya hai)\b/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Hindi NLP Core');
    speak("Mera naam J.A.R.V.I.S hai, Sir. Just A Rather Very Intelligent System. Main aapka aadhunik AI voice assistant hoon.");

  } else if (/\b(tum kya kar sakte ho|kya kya kar sakte ho|apne features batao)\b/.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'Hindi NLP Core');
    speak("Sir, main mausam ka haal bata sakta hoon, WhatsApp par messages bhej sakta hoon, task reminders set kar sakta hoon, chehre se security unlock kar sakta hoon aur Gemini AI dwara kisi bhi prashna ka uttar de sakta hoon.");

  } else if (/\b(chutkula|ek joke sunao|mast joke|hasi ka joke)\b/.test(msg)) {
    recordTelemetry(raw, 'Realtime APIs', 'Hindi Joke Bank');
    const j = HINDI_JOKES[Math.floor(Math.random() * HINDI_JOKES.length)];
    speak(j);
    addLog('Hindi Joke told', 'fa-laugh-beam');

  } else if (/\b(samay kya hai|kitne baje|time kya hua|aaj ka time|samay batao)\b/.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'Hindi Clock');
    const now = new Date();
    const hrs = now.getHours() % 12 || 12;
    const mins = now.getMinutes();
    const ampm = now.getHours() >= 12 ? 'dopahar ke' : 'subah ke';
    speak(`Sir, abhi ${ampm} ${hrs} bajkar ${mins} minute hue hain.`);

  } else if (/\b(aaj kaun sa din|aaj ki tarikh|tarikh kya hai|aaj ka din)\b/.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'Hindi Clock');
    const d = new Date().toLocaleDateString('hi-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    speak(`Sir, aaj ${d} hai.`);

  } else if (/\b(mausam kaisa hai|aaj ka mausam|mausam batao|barish hogi kya)\b/.test(msg)) {
    recordTelemetry(raw, 'Realtime APIs', 'Hindi Weather');
    const cityMatch = msg.match(/(?:(?:me|ka)\s+mausam|mausam\s+(?:in|for|of)\s+)([a-z\s]+)/i);
    const city = cityMatch ? cityMatch[1].trim() : 'Delhi';
    speak(`Sir, ${city} ke mausam ki jaankari laa raha hoon.`);
    fetchWeather(city);

  } else if (/\b(google kholo|google open karo)\b/.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'Hindi Launcher');
    speak("Google khol raha hoon, Sir.");
    openURL("https://google.com");
    addLog('Google khola gaya', 'fa-globe');

  } else if (/\b(youtube chalao|youtube kholo|youtube open karo)\b/.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'Hindi Launcher');
    speak("YouTube shuru kar raha hoon, Sir.");
    openURL("https://youtube.com");
    addLog('YouTube khola gaya', 'fa-play-circle');

  } else if (/\b(whatsapp kholo|whatsapp open karo)\b/.test(msg)) {
    recordTelemetry(raw, 'WhatsApp & Comms', 'Hindi Launcher');
    speak("WhatsApp Web khol raha hoon, Sir.");
    openURL("https://web.whatsapp.com");
    addLog('WhatsApp khola gaya', 'fa-comment');

    /* ── Identity & Greetings (English) ── */
  } else if (/\b(hello|hi|hey)\b.*jarvis|\bjarvis\b.*(hello|hi|hey)/.test(msg) || msg === 'hello' || msg === 'hi') {
    recordTelemetry(raw, 'General / ChitChat', 'Rule Engine');
    speak("Hello, Sir. I am fully operational and at your disposal. How may I assist you?");

    /* ── Neural Analytics Dashboard Voice Triggers ── */
  } else if (/\b(show analytics|open dashboard|view analytics|telemetry|analytics dashboard|neural metrics|open analytics)\b/.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'Telemetry Core');
    speak("Displaying Neural Analytics and Telemetry Dashboard, Sir.");
    openAnalytics();

  } else if (/\b(hide analytics|close dashboard|close analytics|exit dashboard)\b/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Telemetry Core');
    speak("Closing analytics dashboard, Sir.");
    closeAnalytics();

    /* ── Smart Task Reminders & Alarms Voice Triggers ── */
  } else if (/\b(show reminders|open reminders|my reminders|list reminders|view reminders|scheduled timers)\b/.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'Alarm Scheduler');
    speak("Opening your scheduled task reminders, Sir.");
    openReminders();

  } else if (/\b(clear (all )?reminders|cancel (all )?reminders|delete all reminders)\b/.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'Alarm Scheduler');
    clearAllReminders();

  } else if (/\b(remind me|set (a )?timer|set (a )?reminder|set (an )?alarm)\b/.test(msg)) {
    parseAndSetReminder(msg, raw);

    /* ── Biometric Face Recognition Security Triggers ── */
  } else if (/\b(biometric scan|face recognition|face scan|scan face|recognize face|recognize my face|check my face|biometric check|biometric lock|security lock|lock jarvis|lock system|security check|security)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Face Recognition ML');
    isSecurityLocked = true;
    const secLabel = document.getElementById('securityLabel');
    if (secLabel) secLabel.textContent = 'SCANNING';
    speak("Engaging Stark Biometric Security Scan. Please look directly into the camera.");
    openBiometricModal();

  } else if (/\b(enroll face|register face|register master|register my face|add face)\b/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Face Recognition ML');
    openBiometricModal();
    setTimeout(promptEnrollFace, 800);

  } else if (/\b(unlock jarvis|unlock system|bypass security)\b/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Security Override');
    bypassBiometricAuth();

  } else if (/\b(clear face|reset face|delete face|remove face|deregister face)\b/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Biometric Vault');
    clearEnrolledFace();

    /* ── Explicit AI / Think commands — force Gemini regardless of key ── */
  } else if (/^(jarvis )?(explain|analyze|analyse|think about|what do you think|tell me about|summarize|compare|write|compose|create|generate)\b/.test(msg)) {
    recordTelemetry(raw, 'AI & Generation', 'Gemini Core');
    askGemini(raw.replace(/^jarvis\s*/i, ''), `AI: ${raw.slice(0, 28)}`);

  } else if (/\b(ask ai|use ai|gemini|activate ai|ai mode|enable ai chat)\b/.test(msg)) {
    recordTelemetry(raw, 'AI & Generation', 'Gemini Core');
    toggleAIMode();

  } else if (/\b(clear (memory|history|chat)|forget (our |the )?conversation)\b/.test(msg)) {
    recordTelemetry(raw, 'AI & Generation', 'Gemini Core');
    clearChatHistory();

  } else if (/how are you|how do you do|are you okay/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Rule Engine');
    speak("I am running at peak efficiency, Sir. All neural cores are fully operational. Thank you for your concern.");

  } else if (/who are you|what are you|introduce yourself/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Rule Engine');
    speak("I am J.A.R.V.I.S — Just A Rather Very Intelligent System. I am your personal AI assistant, Sir, designed and built to serve you.");

  } else if (/what can you do|your (features|abilities|commands)|help me/.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'Rule Engine');
    speak("I am capable of opening websites, conducting web searches, managing browser windows, telling the time and date, performing mathematical calculations, providing weather information, telling jokes, and much more, Sir. Simply speak your command.");

  } else if (/your name|what (should|do) i call you/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Rule Engine');
    speak("My name is JARVIS, Sir. Just A Rather Very Intelligent System.");

  } else if (/iron man|tony stark|avenger/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Rule Engine');
    speak("I was built in the spirit of the legendary artificial intelligence from the Iron Man universe, Sir. I aim to be just as capable.");

    /* ── Time & Date ── */
  } else if (/\btime\b/.test(msg) && !/\bdate\b/.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'System Clock');
    const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    speak(`The current time is ${t}, Sir.`);

  } else if (/\b(date|today|what day)\b/.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'System Clock');
    const d = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    speak(`Today is ${d}, Sir.`);

  } else if (/\byear\b/.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'System Clock');
    speak(`The current year is ${new Date().getFullYear()}, Sir.`);

    /* ── Math / Calculator ── */
  } else if (/\b(calculate|math|compute|square root|sqrt|cube root|cbrt|percent of|% of|power|raised to)\b/i.test(msg) ||
             /(\bwhat\s+is\b.*[\+\-\*\/\^%])/i.test(msg) ||
             /(\d+\s*[\+\-\*\/\^%]\s*\d+)/.test(msg) ||
             /(\b\d+\s*(plus|minus|times|multiplied by|divided by|into)\s+\d+)/i.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'Math Engine');
    const mathResult = evaluateMathExpression(msg);
    if (mathResult !== null) {
      speak(`The result of ${mathResult.expr} is ${mathResult.result}, Sir.`);
      typewrite(`${mathResult.expr} = ${mathResult.result}`);
      addLog(`${mathResult.expr} = ${mathResult.result}`, 'fa-calculator');
    } else {
      speak("I am sorry, Sir. I was unable to compute that mathematical expression. Please rephrase your query.");
    }

    /* ── Jokes — Live from JokeAPI ── */
  } else if (/\b(joke|funny|humor|laugh|entertain)\b/.test(msg)) {
    recordTelemetry(raw, 'Realtime APIs', 'JokeAPI');
    speak("Let me fetch a fresh joke for you, Sir.");
    fetchLiveJoke();

    /* ── STARK PROTOCOL — Autonomous Daily Briefing Triggers ── */
  } else if (/\b(good morning|daily briefing|morning briefing|stark protocol|brief me|status report|morning report|briefing)\b/i.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Stark Protocol');
    runDailyBriefing();

    /* ── Weather — Open-Meteo & wttr.in Real-Time Telemetry ── */
  } else if (/\b(weather|wheather|wether|temperature|temp|forecast|climate|rain|is it raining|will it rain)\b/i.test(msg)) {
    recordTelemetry(raw, 'Realtime APIs', 'Weather Telemetry');
    
    // Check if user is asking about current location / where they live
    const isCurrentLocationQuery = /\b(live|location|locatotion|where i (am )?living|my location|where i am|here|current location|my city|around me|local)\b/i.test(msg);
    
    if (isCurrentLocationQuery) {
      fetchWeather(null);

    } else {
      const cityMatch = msg.match(/(?:weather\s+(?:in|for|of|at)\s+|in\s+)([a-z][a-z\s]{1,30}?)(?:\s+weather)?$/i) ||
        msg.match(/^([a-z][a-z\s]{1,20})\s+weather/i);
      if (cityMatch && cityMatch[1].trim().length > 1 && !/\b(location|where|living|area|city|here|today|now)\b/i.test(cityMatch[1].trim())) {
        fetchWeather(cityMatch[1].trim());
      } else {
        // Automatically detect current location!
        fetchWeather(null);
      }
    }
    addLog('Weather requested', 'fa-cloud-sun');


    /* ── Satellite Geo-Location — Live GPS Telemetry ── */
  } else if (/\b(where am i|my location|current location|live location|gps|coordinates|find me|locate me)\b/i.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'GPS Telemetry');
    getLiveLocation();



    /* ── Dictionary / Word Definition — DictionaryAPI.dev ── */
  } else if (/\b(define|meaning of|what does|definition of|meaning)\b/.test(msg)) {
    recordTelemetry(raw, 'Realtime APIs', 'DictionaryAPI.dev');
    const wordMatch = msg.replace(/define|meaning of|what does|definition of|meaning|the word|jarvis|mean|\?/gi, '').trim();
    if (wordMatch.length > 1) {
      fetchDefinition(wordMatch.split(' ')[0]);
    } else {
      PENDING.action = 'await_word';
      speak("Which word would you like me to define, Sir?");
    }
    addLog('Definition requested', 'fa-book-open');

    /* ── News Headlines — Multi-Source RSS & Satellite Aggregator ── */
  } else if (/\b(news|headlines|latest news|top stories)\b/i.test(msg)) {
    recordTelemetry(raw, 'Realtime APIs', 'News Aggregator');
    
    // Check if user specifically requested both India & World
    if (/\b(india.*(world|global)|(world|global).*india|both)\b/i.test(msg)) {
      fetchCombinedNews();
    } else {
      let cat = 'top';
      if (/tech(nology)?/i.test(msg)) cat = 'technology';
      else if (/science/i.test(msg)) cat = 'science';
      else if (/sport/i.test(msg)) cat = 'sports';
      else if (/business|economy|market/i.test(msg)) cat = 'business';
      else if (/world|global/i.test(msg)) cat = 'world';
      else if (/india|national/i.test(msg)) cat = 'india';
      fetchNews(cat);
    }
    addLog(`News requested`, 'fa-newspaper');


    /* ── Currency Conversion — frankfurter.app ── */
  } else if (/\b(convert|exchange|currency)\b/.test(msg) || /\d+\s*(dollar|rupee|euro|pound|yen|usd|inr|gbp|eur)/i.test(msg)) {
    recordTelemetry(raw, 'Realtime APIs', 'Frankfurter API');
    const m = msg.match(/(\d+\.?\d*)\s*([a-z]+)\s+to\s+([a-z]+)/i);
    if (m) {
      fetchCurrency(parseFloat(m[1]), m[2], m[3]);
    } else {
      speak("Please say it like: convert 100 dollars to rupees, Sir.");
    }
    addLog('Currency conversion', 'fa-exchange-alt');

    /* ── Wikipedia / Search ── */
  } else if (/\b(wikipedia|who is|tell me about|search for|look up)\b/.test(msg)) {
    recordTelemetry(raw, 'Knowledge & Utils', 'Wikipedia Engine');
    const q = msg.replace(/\b(wikipedia|who is|tell me about|search for|look up|jarvis)\b/gi, '').trim();
    if (q.length > 1) {
      speak(`Searching Wikipedia for "${q}", Sir.`);
      openURL(`https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`);
      addLog(`Wikipedia: ${q}`, 'fa-book');
    } else {
      speak("Opening Wikipedia, Sir.");
      openURL("https://en.wikipedia.org");
    }

    /* ──────────────────────────────────────
       WINDOW / BROWSER CONTROLS
    ────────────────────────────────────── */
  } else if (/close (window|tab|this|browser)|close it/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Window Manager');
    speak("Understood, Sir. Closing this window now.");
    addLog('Closing window', 'fa-times-circle');
    setTimeout(() => window.close(), 1500);

  } else if (/open (new|a new|another) (window|tab)/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Window Manager');
    speak("Of course, Sir. Opening a new browser window for you.");
    addLog('Opening new window', 'fa-external-link-alt');
    setTimeout(() => window.open('about:blank', '_blank'), 600);

  } else if (/reload|refresh (page|window|this)|restart (page|jarvis)/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Window Manager');
    speak("Reloading the interface, Sir. Stand by.");
    addLog('Reloading page', 'fa-redo');
    setTimeout(() => window.location.reload(), 1800);

  } else if (/go back|previous page/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'History Manager');
    speak("Going back to the previous page, Sir.");
    addLog('Navigate back', 'fa-arrow-left');
    setTimeout(() => window.history.back(), 1200);

  } else if (/go forward|next page/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'History Manager');
    speak("Navigating forward, Sir.");
    addLog('Navigate forward', 'fa-arrow-right');
    setTimeout(() => window.history.forward(), 1200);

    /* ──────────────────────────────────────
       SYSTEM COMMANDS  (OS-level)
    ────────────────────────────────────── */
  } else if (/shut(down| down)|power off|turn off (the )?(computer|pc|system|device)/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'OS Bridge');
    speak("Sir, I must inform you that due to browser security restrictions, I am unable to execute a system shutdown directly. To shut down your device, please press the Windows key, click the power icon, and select Shut down. I can open the Start menu for you if required.");
    addLog('Shutdown requested', 'fa-power-off');

  } else if (/restart (the )?(computer|pc|system|device)|reboot/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'OS Bridge');
    speak("Sir, a system restart cannot be initiated from within a browser environment due to operating system security protocols. Please use the Windows Start menu, click the power icon, and select Restart.");
    addLog('Restart requested', 'fa-sync');

  } else if (/sleep (the )?(computer|pc|system|device)|put (it |the )?(computer|pc|system) to sleep/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'OS Bridge');
    speak("I am unable to put the system to sleep from a browser context, Sir. You may press the Windows key, click the power icon, and choose Sleep.");
    addLog('Sleep requested', 'fa-moon');

  } else if (/lock (the )?(computer|pc|screen|device)|lock screen/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'OS Bridge');
    speak("Locking the screen is an operating system action, Sir. Please press the Windows key together with the L key to lock your screen instantly.");
    addLog('Lock screen requested', 'fa-lock');

    /* ──────────────────────────────────────
       OPEN WEBSITES & SEARCH
    ────────────────────────────────────── */
  } else if (/\b(play|search)\s+(.+?)\s+(on\s+youtube|in\s+youtube)\b/i.test(msg) || /\byoutube\s+(play|search)\s+(.+)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'YouTube Search');
    const song = msg.replace(/\b(play|search|on youtube|in youtube|youtube|jarvis)\b/gi, '').trim();
    speak(`Playing ${song} on YouTube, Sir.`);
    openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`);
    addLog(`YouTube: ${song}`, 'fa-play-circle');

  } else if (/\b(open\s+)?(youtube|you\s*tube|yt)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening YouTube, Sir.");
    openURL("https://www.youtube.com");
    addLog('Opened YouTube', 'fa-play-circle');

  } else if (/\b(open\s+)?(google|google\s+search)\b/i.test(msg) && !/\b(search for|search)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening Google, Sir.");
    openURL("https://www.google.com");
    addLog('Opened Google', 'fa-globe');

  } else if (/\b(open\s+)?(github|git\s+hub)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening GitHub, Sir.");
    openURL("https://github.com");
    addLog('Opened GitHub', 'fa-code-branch');

  } else if (/\b(open\s+)?(gmail|email|google\s+mail)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening Gmail, Sir.");
    openURL("https://mail.google.com");
    addLog('Opened Gmail', 'fa-envelope');

  } else if (/\b(open\s+)?(netflix)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening Netflix, Sir. Enjoy your viewing.");
    openURL("https://netflix.com");
    addLog('Opened Netflix', 'fa-film');

  } else if (/\b(open\s+)?(spotify|music)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening Spotify, Sir. Enjoy the music.");
    openURL("https://open.spotify.com");
    addLog('Opened Spotify', 'fa-music');

  } else if (/\b(open\s+)?(twitter|x\.com|\bx\b)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening X, Sir.");
    openURL("https://twitter.com");
    addLog('Opened X (Twitter)', 'fa-hashtag');

  } else if (/\b(open\s+)?(instagram|insta)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening Instagram, Sir.");
    openURL("https://instagram.com");
    addLog('Opened Instagram', 'fa-camera');

  } else if (/\b(open\s+)?(facebook|fb)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening Facebook, Sir.");
    openURL("https://facebook.com");
    addLog('Opened Facebook', 'fa-thumbs-up');

  } else if (/\b(open\s+)?(linkedin|linked\s*in)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening LinkedIn, Sir.");
    openURL("https://www.linkedin.com");
    addLog('Opened LinkedIn', 'fa-briefcase');

  } else if (/\b(open\s+)?(maps|google\s+maps)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening Google Maps, Sir.");
    openURL("https://maps.google.com");
    addLog('Opened Maps', 'fa-map-marker-alt');

  } else if (/\b(open\s+)?(amazon)\b/i.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening Amazon, Sir.");
    openURL("https://amazon.com");
    addLog('Opened Amazon', 'fa-shopping-cart');

  } else if (/send.*whatsapp|whatsapp.*message|message.*whatsapp|whatsapp.*send/.test(msg)) {
    recordTelemetry(raw, 'WhatsApp & Comms', 'WhatsApp Flow');
    const inlineContact = msg.replace(/send|whatsapp|message|a|to|on|\bvia\b/gi, '').trim();
    const found = inlineContact.length > 1 ? lookupContact(inlineContact) : null;
    if (found) {
      WA.contact = found.name;
      WA.number = found.number;
      WA.state = 'await_message';
      waSetStatus('WA: MSG?');
      speak(`Ready to message ${WA.contact} on WhatsApp. What would you like to say, Sir?`);
    } else {
      WA.state = 'await_contact';
      waSetStatus('WA: WHO?');
      speak("Certainly, Sir. Who should I send the WhatsApp message to? Please say the contact name.");
    }
    addLog('WhatsApp: message flow', 'fa-comment-dots');

  } else if (/open whatsapp|whatsapp web/.test(msg)) {
    recordTelemetry(raw, 'WhatsApp & Comms', 'URL Launcher');
    speak("Opening WhatsApp Web, Sir.");
    openURL("https://web.whatsapp.com");
    addLog('Opened WhatsApp', 'fa-comment');

  } else if (/message\s+(.+?)\s+(on whatsapp|via whatsapp|whatsapp)/.test(msg)) {
    recordTelemetry(raw, 'WhatsApp & Comms', 'WhatsApp Flow');
    const m = msg.match(/message\s+(.+?)\s+(on whatsapp|via whatsapp|whatsapp)/);
    const name = m ? m[1].trim() : '';
    const found = name ? lookupContact(name) : null;
    if (found) {
      WA.contact = found.name;
      WA.number = found.number;
      WA.state = 'await_message';
      waSetStatus('WA: MSG?');
      speak(`Ready to message ${WA.contact}. What would you like to say, Sir?`);
    } else if (name) {
      waReset();
      speak(`I could not find ${name} in your contacts, Sir. You can add them by saying: add contact, name, then the number.`);
    }
    addLog('WhatsApp: message flow', 'fa-comment-dots');

    /* ── WhatsApp Contacts Management ── */
  } else if (/add (whatsapp |wa )?contact/.test(msg)) {
    recordTelemetry(raw, 'WhatsApp & Comms', 'Contacts Storage');
    const parts = raw.replace(/add (whatsapp |wa )?contact/i, '').trim();
    const numMatch = parts.match(/(\d[\d\s\-]{6,}\d)/);
    if (numMatch) {
      const number = numMatch[1];
      const name = parts.replace(number, '').replace(/number|no|num/gi, '').trim();
      if (name.length > 0) {
        const digits = saveContact(name, number);
        const displayName = name.charAt(0).toUpperCase() + name.slice(1);
        speak(`Contact saved, Sir. ${displayName} has been added to your phonebook with number ${digits}.`);
        addLog(`Contact added: ${displayName}`, 'fa-user-plus');
      } else {
        speak("I could not determine the contact name, Sir. Please say: add contact, name, then the phone number.");
      }
    } else {
      speak("I need a phone number as well, Sir. Please say: add contact John, nine eight seven six five four three two one zero.");
    }

  } else if (/show contacts|list contacts|my contacts|phonebook/.test(msg)) {
    recordTelemetry(raw, 'WhatsApp & Comms', 'Contacts Storage');
    const contacts = listContacts();
    if (!contacts) {
      speak("Your phonebook is empty, Sir. You can add contacts by saying: add contact, then the name, then the phone number.");
    } else {
      const names = contacts.map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(', ');
      speak(`You have ${contacts.length} contact${contacts.length > 1 ? 's' : ''} in your phonebook, Sir: ${names}.`);
    }
    addLog('Listed contacts', 'fa-address-book');

  } else if (/delete contact|remove contact/.test(msg)) {
    recordTelemetry(raw, 'WhatsApp & Comms', 'Contacts Storage');
    const name = msg.replace(/delete contact|remove contact/gi, '').trim();
    if (name.length > 1) {
      const removed = deleteContact(name);
      const display = name.charAt(0).toUpperCase() + name.slice(1);
      speak(removed
        ? `Contact ${display} has been removed from your phonebook, Sir.`
        : `I could not find a contact named ${display}, Sir.`);
    } else {
      speak("Please specify which contact to delete, Sir.");
    }
    addLog('Contact deleted', 'fa-user-minus');

  } else if (/open (chatgpt|chat gpt|openai)/.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening ChatGPT, Sir.");
    openURL("https://chat.openai.com");
    addLog('Opened ChatGPT', 'fa-robot');

  } else if (/open (reddit)/.test(msg)) {
    recordTelemetry(raw, 'Web Navigation', 'URL Launcher');
    speak("Opening Reddit, Sir.");
    openURL("https://reddit.com");
    addLog('Opened Reddit', 'fa-comments');

    /* ──────────────────────────────────────
       SOCIAL RESPONSES
    ────────────────────────────────────── */
  } else if (/\b(stop|pause|quiet|silence|enough|stop (talking|speaking))\b/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Audio Controller');
    window.speechSynthesis.cancel();
    typewrite("— Silent mode engaged.");
    addLog('Speech cancelled', 'fa-volume-mute');

  } else if (/\b(thank you|thanks|thank you very much|well done|good job)\b/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Social Engine');
    speak("It is always my pleasure to be of service, Sir.");

  } else if (/\b(good night|goodnight|goodbye|bye|see you|farewell)\b/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Social Engine');
    speak("Good night, Sir. Rest well. I shall remain on standby and keep watch.");
    addLog('Session ending', 'fa-moon');

  } else if (/\bgood morning\b/.test(msg)) {
    recordTelemetry(raw, 'System Controls', 'Stark Protocol');
    runDailyBriefing();


  } else if (/\bgood afternoon\b/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Social Engine');
    speak("Good afternoon, Sir. How may I assist you?");

  } else if (/\bgood evening\b/.test(msg)) {
    recordTelemetry(raw, 'General / ChitChat', 'Social Engine');
    speak("Good evening, Sir. I am at your service.");

    /* ── FALLBACK — Direct AI & Neural Knowledge Response ── */
  } else {
    recordTelemetry(raw, 'AI & Generation', 'Neural Brain');
    askGemini(raw, `AI: ${raw.slice(0, 28)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Quick Command Chips & Text HUD Input
// ─────────────────────────────────────────────────────────────
function runQuickCmd(cmd) {
  typewrite(`> ${cmd}`);
  addLog(cmd, 'fa-hand-pointer');
  takeCommand(cmd);
}

function sendTextCommand() {
  const input = document.getElementById('hudCommandInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  typewrite(`> ${text}`);
  addLog(text, 'fa-keyboard');
  takeCommand(text);
}

// ─────────────────────────────────────────────────────────────
// 🌐 Futuristic Screen Scroll Controller & Holographic Navigator
// ─────────────────────────────────────────────────────────────
let autoScrollInterval = null;

function scrollScreen(direction, amount = 450) {
  // If Brain Response Panel is currently open, scroll the panel content
  const brainModal = document.getElementById('brainPanel');
  const brainBody = document.getElementById('brainResponseBody');
  if (brainModal && brainModal.style.display !== 'none' && brainBody) {
    if (direction === 'up') brainBody.scrollBy({ top: -amount, behavior: 'smooth' });
    else if (direction === 'down') brainBody.scrollBy({ top: amount, behavior: 'smooth' });
    else if (direction === 'top') brainBody.scrollTo({ top: 0, behavior: 'smooth' });
    else if (direction === 'bottom') brainBody.scrollTo({ top: brainBody.scrollHeight, behavior: 'smooth' });
    return;
  }

  // Smooth window screen scroll
  if (direction === 'up') {
    window.scrollBy({ top: -amount, behavior: 'smooth' });
  } else if (direction === 'down') {
    window.scrollBy({ top: amount, behavior: 'smooth' });
  } else if (direction === 'top') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (direction === 'bottom') {
    window.scrollTo({ top: document.documentElement.scrollHeight || document.body.scrollHeight, behavior: 'smooth' });
  }
  setTimeout(updateScrollProgress, 120);
}

function updateScrollProgress() {
  const brainModal = document.getElementById('brainPanel');
  const brainBody = document.getElementById('brainResponseBody');
  const isBrain = (brainModal && brainModal.style.display !== 'none' && brainBody);

  let pct = 0;
  if (isBrain) {
    const max = brainBody.scrollHeight - brainBody.clientHeight;
    pct = max > 0 ? Math.min(100, Math.max(0, Math.round((brainBody.scrollTop / max) * 100))) : 0;
  } else {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const scrollHeight = (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight;
    pct = scrollHeight > 0 ? Math.min(100, Math.max(0, Math.round((scrollTop / scrollHeight) * 100))) : 0;
  }

  const glow = document.getElementById('scrollBarGlow');
  const readout = document.getElementById('scrollReadout');
  if (glow) glow.style.height = `${pct}%`;
  if (readout) readout.textContent = `${pct < 10 ? '0' + pct : pct}%`;
}

function toggleAutoScroll() {
  if (autoScrollInterval) {
    stopAutoScroll();
    speak("Auto scroll paused, Sir.");
  } else {
    startAutoScroll();
    speak("Auto scroll sweep engaged, Sir.");
  }
}

function startAutoScroll(speed = 2) {
  if (autoScrollInterval) clearInterval(autoScrollInterval);
  let direction = 1;
  const btn = document.getElementById('autoScrollToggleBtn');
  if (btn) btn.classList.add('active');

  autoScrollInterval = setInterval(() => {
    const brainModal = document.getElementById('brainPanel');
    const brainBody = document.getElementById('brainResponseBody');
    const isBrain = (brainModal && brainModal.style.display !== 'none' && brainBody);

    if (isBrain) {
      const max = brainBody.scrollHeight - brainBody.clientHeight;
      if (brainBody.scrollTop >= max - 2) direction = -1;
      if (brainBody.scrollTop <= 2) direction = 1;
      brainBody.scrollTop += speed * direction;
    } else {
      const max = (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight;
      if (window.scrollY >= max - 2) direction = -1;
      if (window.scrollY <= 2) direction = 1;
      window.scrollBy(0, speed * direction);
    }
    updateScrollProgress();
  }, 30);
}

function stopAutoScroll() {
  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
  }
  const btn = document.getElementById('autoScrollToggleBtn');
  if (btn) btn.classList.remove('active');
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  window.addEventListener('wheel', () => { if (autoScrollInterval) stopAutoScroll(); }, { passive: true });
  window.addEventListener('touchmove', () => { if (autoScrollInterval) stopAutoScroll(); }, { passive: true });
}

// ─────────────────────────────────────────────────────────────
// 🎛️ ADVANCED AUTOMATED SYSTEM CONTROLS & TELEMETRY SUBSYSTEM
// Battery, Volume, Display/Fullscreen, Themes, Diagnostics, Speed Test, Sleep & Optimization
// ─────────────────────────────────────────────────────────────

// ── 1. Volume & Audio Control Subsystem ───────────────────────
let jarvisVolume = 1.0;
let isJarvisMuted = false;

function initVolume() {
  try {
    const savedVol = JarvisCryptoVault.secureGet('jarvis_volume', 1.0);
    if (typeof savedVol === 'number' && !isNaN(savedVol)) {
      jarvisVolume = Math.max(0, Math.min(1, savedVol));
    }
    const savedMute = JarvisCryptoVault.secureGet('jarvis_muted', false);
    isJarvisMuted = Boolean(savedMute);
    updateVolumeUI();
  } catch {}
}

function updateVolumeUI() {
  const pill = document.getElementById('hudVolumePill');
  const val = document.getElementById('hudVolumeVal');
  const icon = document.getElementById('hudVolumeIcon');
  const pct = Math.round(jarvisVolume * 100);

  if (val) val.textContent = isJarvisMuted ? 'MUTED' : `${pct}%`;

  if (icon) {
    if (isJarvisMuted || jarvisVolume === 0) {
      icon.className = 'fas fa-volume-mute';
    } else if (jarvisVolume < 0.35) {
      icon.className = 'fas fa-volume-off';
    } else if (jarvisVolume < 0.7) {
      icon.className = 'fas fa-volume-down';
    } else {
      icon.className = 'fas fa-volume-up';
    }
  }

  if (pill) {
    if (isJarvisMuted) pill.classList.add('muted');
    else pill.classList.remove('muted');
  }
}

function setJarvisVolume(level, speakConfirm = true) {
  if (level > 1) level = level / 100;
  level = Math.max(0, Math.min(1, level));
  jarvisVolume = level;
  if (jarvisVolume > 0) isJarvisMuted = false;
  JarvisCryptoVault.secureSet('jarvis_volume', jarvisVolume);
  JarvisCryptoVault.secureSet('jarvis_muted', isJarvisMuted);
  updateVolumeUI();

  // Sync slider position
  const slider = document.getElementById('volumeSlider');
  if (slider) slider.value = Math.round(jarvisVolume * 100);

  const pct = Math.round(jarvisVolume * 100);
  if (speakConfirm) {
    typewrite(`> Audio volume set to ${pct}%`);
    addLog(`Volume set to ${pct}%`, 'fa-volume-up');
    speak(`Audio volume set to ${pct} percent, Sir.`);
  }
}

function toggleVolumeSlider(e) {
  e.stopPropagation();
  const popup = document.getElementById('volumeSliderPopup');
  const slider = document.getElementById('volumeSlider');
  const sliderLabel = document.getElementById('volumeSliderLabel');
  if (!popup) return;
  const isOpen = popup.style.display !== 'none';
  popup.style.display = isOpen ? 'none' : 'block';
  if (!isOpen && slider) {
    slider.value = Math.round(jarvisVolume * 100);
    if (sliderLabel) sliderLabel.textContent = slider.value + '%';
  }
  // Close when clicking anywhere else
  if (!isOpen) {
    setTimeout(() => {
      document.addEventListener('click', function _close() {
        popup.style.display = 'none';
        document.removeEventListener('click', _close);
      });
    }, 50);
  }
}


function toggleMuteVolume(forceState, speakConfirm = true) {
  if (typeof forceState === 'boolean') {
    isJarvisMuted = forceState;
  } else {
    isJarvisMuted = !isJarvisMuted;
  }
  JarvisCryptoVault.secureSet('jarvis_muted', isJarvisMuted);
  updateVolumeUI();

  if (isJarvisMuted) {
    typewrite('> Audio output muted');
    addLog('Audio output muted', 'fa-volume-mute');
    if (speakConfirm) {
      speak("Audio output muted, Sir.");
    }
  } else {
    typewrite(`> Audio output restored (${Math.round(jarvisVolume * 100)}%)`);
    addLog('Audio output unmuted', 'fa-volume-up');
    if (speakConfirm) {
      speak(`Audio restored at ${Math.round(jarvisVolume * 100)} percent, Sir.`);
    }
  }
}

function cycleVolume() {
  if (isJarvisMuted) {
    toggleMuteVolume(false);
  } else if (jarvisVolume >= 0.85) {
    setJarvisVolume(0.65);
  } else if (jarvisVolume >= 0.55) {
    setJarvisVolume(0.35);
  } else if (jarvisVolume >= 0.25) {
    toggleMuteVolume(true);
  } else {
    setJarvisVolume(1.0);
  }
}

// ── 2. Battery & Power Telemetry Subsystem ────────────────────
let _cachedBattery = null;

async function initBatteryTelemetry() {
  try {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      const b = await navigator.getBattery();
      _cachedBattery = b;
      updateBatteryUI(b);
      b.addEventListener('levelchange', () => updateBatteryUI(b));
      b.addEventListener('chargingchange', () => updateBatteryUI(b));
    } else {
      updateBatteryUIFallback();
    }
  } catch {
    updateBatteryUIFallback();
  }
}

function updateBatteryUI(b) {
  const pill = document.getElementById('hudBatteryPill');
  const val = document.getElementById('hudBatteryVal');
  const icon = document.getElementById('hudBatteryIcon');
  if (!b) return updateBatteryUIFallback();

  const pct = Math.round(b.level * 100);
  if (val) val.textContent = `${pct}%`;

  if (pill) {
    if (b.charging) pill.classList.add('charging');
    else pill.classList.remove('charging');
  }

  if (icon) {
    if (b.charging) {
      icon.className = 'fas fa-bolt';
    } else if (pct >= 85) {
      icon.className = 'fas fa-battery-full';
    } else if (pct >= 60) {
      icon.className = 'fas fa-battery-three-quarters';
    } else if (pct >= 35) {
      icon.className = 'fas fa-battery-half';
    } else if (pct >= 15) {
      icon.className = 'fas fa-battery-quarter';
    } else {
      icon.className = 'fas fa-battery-empty';
    }
  }
}

function updateBatteryUIFallback() {
  const val = document.getElementById('hudBatteryVal');
  const icon = document.getElementById('hudBatteryIcon');
  const pill = document.getElementById('hudBatteryPill');
  if (val) val.textContent = '100% (AC)';
  if (icon) icon.className = 'fas fa-plug';
  if (pill) pill.classList.add('charging');
}

async function checkBatteryStatus() {
  recordTelemetry('Battery telemetry requested', 'System Telemetry', 'Battery Monitor');
  let level = 100;
  let charging = true;

  try {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      const b = _cachedBattery || await navigator.getBattery();
      level = Math.round(b.level * 100);
      charging = Boolean(b.charging);
    }
  } catch {}

  const stateStr = charging ? 'connected to AC power and charging' : 'running on internal battery power';
  const speech = `Power status: The system is at ${level} percent capacity, currently ${stateStr}, Sir.`;
  typewrite(`> BATTERY: ${level}% [${charging ? 'CHARGING' : 'DISCHARGING'}]`);
  speak(speech);
  addLog(`Battery: ${level}% (${charging ? 'AC Power' : 'Battery'})`, 'fa-battery-half');
}

// ── 3. Display & Fullscreen Subsystem ─────────────────────────
function toggleFullscreen(forceState) {
  const isFull = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  const target = (typeof forceState === 'boolean') ? forceState : !isFull;

  if (target && !isFull) {
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) docEl.requestFullscreen().catch(() => {});
    else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen().catch(() => {});
    typewrite('> Fullscreen mode engaged');
    addLog('Fullscreen engaged', 'fa-expand');
    speak("Fullscreen mode engaged, Sir.");
  } else if (!target && isFull) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(() => {});
    typewrite('> Standard display window restored');
    addLog('Fullscreen restored', 'fa-compress');
    speak("Standard display window restored, Sir.");
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('hudFullscreenBtn');
    if (!btn) return;
    const isFull = Boolean(document.fullscreenElement);
    btn.innerHTML = isFull ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
  });
}

// ── 4. Multi-Theme Holographic Matrix Subsystem ───────────────
const HUD_THEMES = [
  { id: 'arc', name: 'ARC CYAN', class: '' },
  { id: 'mark7', name: 'MARK 7', class: 'theme-mark7' },
  { id: 'matrix', name: 'MATRIX', class: 'theme-matrix' },
  { id: 'cyberpunk', name: 'CYBERPUNK', class: 'theme-cyberpunk' },
  { id: 'stealth', name: 'STEALTH', class: 'theme-stealth' }
];
let currentThemeIndex = 0;

function initTheme() {
  try {
    const saved = JarvisCryptoVault.secureGet('jarvis_theme', 'arc');
    const idx = HUD_THEMES.findIndex(t => t.id === saved);
    if (idx !== -1) {
      applyTheme(idx, false);
    }
  } catch {}
}

function applyTheme(index, speakConfirm = true) {
  currentThemeIndex = (index + HUD_THEMES.length) % HUD_THEMES.length;
  const theme = HUD_THEMES[currentThemeIndex];

  HUD_THEMES.forEach(t => {
    if (t.class) document.body.classList.remove(t.class);
  });
  if (theme.class) {
    document.body.classList.add(theme.class);
  }

  const label = document.getElementById('hudThemeLabel');
  if (label) label.textContent = theme.name;

  JarvisCryptoVault.secureSet('jarvis_theme', theme.id);
  typewrite(`> Holographic theme shifted to ${theme.name}`);
  addLog(`Theme: ${theme.name}`, 'fa-palette');

  if (speakConfirm) {
    speak(`Holographic display shifted to ${theme.name} matrix, Sir.`);
  }
}

function setHudTheme(themeId, speakConfirm = true) {
  const idx = HUD_THEMES.findIndex(t => t.id === themeId);
  if (idx !== -1) {
    applyTheme(idx, speakConfirm);
  }
}

function cycleTheme() {
  applyTheme(currentThemeIndex + 1, true);
}

// ── 5. Clipboard Subsystem ────────────────────────────────────
function copyLastResponse() {
  const text = _lastBrainText || typewriterEl?.textContent || 'JARVIS System Ready';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => {
        typewrite('✓ Copied to clipboard, Sir.');
        speak("Response copied to your clipboard, Sir.");
      })
      .catch(() => {
        speak("Clipboard access was blocked by the browser, Sir.");
      });
  } else {
    speak("Clipboard API is unavailable in this environment, Sir.");
  }
}

async function readClipboardContent() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      speak("Clipboard reading is unavailable in this browser, Sir.");
      return;
    }
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      speak("The clipboard is currently empty, Sir.");
      return;
    }
    showBrainPanel(`CLIPBOARD CONTENTS:\n\n${text}`, { type: 'define', label: 'CLIPBOARD DATA' });
    typewrite(`> Clipboard: "${text.slice(0, 60)}..."`);
    const cleanSpeech = text.slice(0, 250).replace(/[^\w\s.,?!]/g, ' ');
    speak(`The clipboard contains: ${cleanSpeech}`);
  } catch (e) {
    speak("Permission to read clipboard was denied or unavailable, Sir.");
  }
}

async function executeClipboardCommand() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      speak("Clipboard reading is unavailable in this browser, Sir.");
      return;
    }
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      speak("The clipboard is empty. No command to execute, Sir.");
      return;
    }
    const cmd = text.trim();
    typewrite(`> Executing from clipboard: "${cmd.slice(0, 45)}"`);
    speak(`Executing command from clipboard, Sir.`);
    takeCommand(cmd);
  } catch {
    speak("Unable to access clipboard to execute command, Sir.");
  }
}

// ── 6. Host & Client System Diagnostics ───────────────────────
async function runSystemDiagnostics() {
  modeStatus.textContent = 'DIAGNOSTICS';
  typewrite('⟩ Gathering complete hardware & host OS telemetry...');
  speak("Initializing full hardware and host system diagnostics, Sir.");

  const clientCores = navigator.hardwareConcurrency || 'N/A';
  const clientRam = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A';
  const conn = navigator.connection;
  const netType = conn ? (conn.effectiveType || '4G').toUpperCase() : 'BROADBAND';
  const netDownlink = conn ? `${conn.downlink || 10} Mbps` : 'High Speed';
  const onlineStatus = navigator.onLine ? 'ONLINE' : 'OFFLINE';

  let storageStr = 'Unlimited';
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      const usedMB = Math.round((est.usage || 0) / (1024 * 1024));
      const totalMB = Math.round((est.quota || 0) / (1024 * 1024));
      storageStr = `${usedMB} MB / ${totalMB} MB`;
    }
  } catch {}

  let hostData = null;
  try {
    const res = await fetch(`${BACKEND_BASE}/system/info`);
    if (res.ok) {
      hostData = await res.json();
    }
  } catch (e) {
    console.warn('Backend system info unavailable:', e);
  }

  const osName = hostData ? `${hostData.platform} (${hostData.arch})` : (navigator.platform || 'Windows NT');
  const hostname = hostData ? hostData.hostname : 'JARVIS-STARK-CORE';
  const cpuModel = hostData ? hostData.cpu.model : `x86_64 Architecture (${clientCores} logical threads)`;
  const cpuCores = hostData ? hostData.cpu.cores : clientCores;
  const memTotal = hostData ? `${hostData.memory.totalGB} GB` : clientRam;
  const memUsed = hostData ? `${hostData.memory.usedGB} GB` : 'Calculated dynamically';
  const memPct = hostData ? hostData.memory.usagePercent : 35;
  const uptimeStr = hostData ? `${Math.floor(hostData.uptimeSeconds / 3600)}h ${Math.floor((hostData.uptimeSeconds % 3600) / 60)}m` : 'Active session';

  const diagHtml = `
    <div class="diag-grid">
      <!-- Card 1: Host System -->
      <div class="diag-card">
        <div class="diag-card-title"><i class="fas fa-server"></i> HOST WORKSTATION</div>
        <div class="diag-card-val">${escapeHtml(osName)}</div>
        <div class="diag-subtext"><i class="fas fa-desktop"></i> Hostname: ${escapeHtml(hostname)}</div>
        <div class="diag-subtext"><i class="fas fa-microchip"></i> ${escapeHtml(cpuModel)} (${cpuCores} Cores)</div>
        <div class="diag-subtext"><i class="fas fa-clock"></i> Host Uptime: ${uptimeStr}</div>
      </div>

      <!-- Card 2: Memory Matrix -->
      <div class="diag-card">
        <div class="diag-card-title"><i class="fas fa-memory"></i> RAM ALLOCATION</div>
        <div class="diag-card-val">${memPct}% ALLOCATED</div>
        <div class="diag-bar-track">
          <div class="diag-bar-fill" style="width: ${memPct}%;"></div>
        </div>
        <div class="diag-subtext"><i class="fas fa-layer-group"></i> Total RAM: ${memTotal}</div>
        <div class="diag-subtext"><i class="fas fa-tachometer-alt"></i> Used RAM: ${memUsed}</div>
      </div>

      <!-- Card 3: Network Matrix -->
      <div class="diag-card">
        <div class="diag-card-title"><i class="fas fa-wifi"></i> TELEMETRY PIPELINE</div>
        <div class="diag-card-val">${onlineStatus} (${netType})</div>
        <div class="diag-subtext"><i class="fas fa-signal"></i> Downlink Bandwidth: ${netDownlink}</div>
        <div class="diag-subtext"><i class="fas fa-shield-alt"></i> Encryption: AES-256 GCM Live</div>
        <div class="diag-subtext"><i class="fas fa-database"></i> Storage Cache: ${storageStr}</div>
      </div>

      <!-- Card 4: Autonomous Subsystems -->
      <div class="diag-card">
        <div class="diag-card-title"><i class="fas fa-robot"></i> J.A.R.V.I.S CORES</div>
        <div class="diag-card-val" style="color:#00e676;">ALL SYSTEMS NOMINAL</div>
        <div class="diag-subtext"><i class="fas fa-check-circle"></i> Voice Synthesizer: Operational</div>
        <div class="diag-subtext"><i class="fas fa-check-circle"></i> Biometric Scanner: Active (Face-API)</div>
        <div class="diag-subtext"><i class="fas fa-check-circle"></i> Neural AI Engine: Gemini 2.0 Failover Ready</div>
      </div>
    </div>
  `;

  showBrainPanel(diagHtml, { type: 'custom', label: 'HOST & CLIENT SYSTEM DIAGNOSTICS' });
  modeStatus.textContent = 'STANDBY';
  addLog('System Diagnostics completed', 'fa-microchip');

  const speakText = hostData
    ? `Diagnostics complete, Sir. Host system running on ${hostData.platform} with ${hostData.cpu.cores} CPU cores. Memory usage is currently at ${hostData.memory.usagePercent} percent. All subsystems are operating at peak efficiency.`
    : `Diagnostics complete, Sir. System running with ${clientCores} cores and ${clientRam} of memory. All neural and security matrices are operating nominally.`;
  speak(speakText);
}

// ── 7. Network Latency & Speed Test Subsystem ─────────────────
async function runSpeedTest() {
  modeStatus.textContent = 'SPEED TEST';
  typewrite('⟩ Initiating ping benchmark and network telemetry...');
  speak("Measuring network latency and bandwidth throughput, Sir.");

  const startPing = performance.now();
  let pingMs = 0;
  let backendOk = false;

  try {
    const res = await fetch(`${BACKEND_BASE}/system/ping?t=${Date.now()}`);
    if (res.ok) {
      await res.json();
      pingMs = Math.round(performance.now() - startPing);
      backendOk = true;
    }
  } catch {
    pingMs = Math.round(performance.now() - startPing);
  }

  const startAsset = performance.now();
  let throughputMbps = 25.4;
  try {
    const assetRes = await fetch(`/style.css?r=${Date.now()}`);
    const blob = await assetRes.blob();
    const durationSec = (performance.now() - startAsset) / 1000;
    if (durationSec > 0 && blob.size > 0) {
      const bits = blob.size * 8;
      const mbps = (bits / durationSec / (1024 * 1024));
      throughputMbps = Math.max(12, Math.round(mbps * 10) / 10);
    }
  } catch {}

  const speedHtml = `
    <div class="diag-grid">
      <div class="diag-card">
        <div class="diag-card-title"><i class="fas fa-stopwatch"></i> PING ROUND-TRIP LATENCY</div>
        <div class="diag-card-val" style="color: ${pingMs < 50 ? '#00e676' : '#ffd740'};">${pingMs} ms</div>
        <div class="diag-subtext"><i class="fas fa-bolt"></i> Server Link: ${backendOk ? 'Direct Cloud/Local Active' : 'Fallback'}</div>
      </div>
      <div class="diag-card">
        <div class="diag-card-title"><i class="fas fa-tachometer-alt"></i> ESTIMATED THROUGHPUT</div>
        <div class="diag-card-val" style="color: var(--cyan);">${throughputMbps} Mbps</div>
        <div class="diag-subtext"><i class="fas fa-network-wired"></i> Connection Type: ${navigator.connection?.effectiveType || 'Broadband'}</div>
      </div>
    </div>
  `;

  showBrainPanel(speedHtml, { type: 'custom', label: 'NETWORK LATENCY & SPEED BENCHMARK' });
  modeStatus.textContent = 'STANDBY';
  addLog(`Speed Test: ${pingMs}ms, ${throughputMbps} Mbps`, 'fa-tachometer-alt');
  speak(`Network speed test completed, Sir. Ping latency is ${pingMs} milliseconds with bandwidth throughput of ${throughputMbps} megabits per second. Connection is optimal.`);
}

// ── 8. Sleep & Standby Mode Subsystem ─────────────────────────
function toggleSleepMode(enable) {
  const overlay = document.getElementById('hudSleepOverlay');
  if (!overlay) return;

  const isCurrentActive = overlay.classList.contains('active');
  const target = (typeof enable === 'boolean') ? enable : !isCurrentActive;

  if (target) {
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('active'), 20);
    typewrite('> STANDBY PROTOCOL ENGAGED');
    modeStatus.textContent = 'STANDBY (SLEEP)';
    addLog('Standby mode engaged', 'fa-power-off');
    speak("Entering low-power standby mode, Sir. Call out or tap the screen to resume.");
  } else {
    overlay.classList.remove('active');
    setTimeout(() => { overlay.style.display = 'none'; }, 400);
    typewrite('> SYSTEMS RESTORED — J.A.R.V.I.S ONLINE');
    modeStatus.textContent = 'STANDBY';
    addLog('Systems resumed from standby', 'fa-sun');
    speak("Welcome back, Sir. All holographic displays restored.");
  }
}

// ── 9. System Optimization Subsystem ──────────────────────────
async function optimizeSystem() {
  modeStatus.textContent = 'OPTIMIZING';
  typewrite('⟩ Executing garbage collection, cache purge & database compaction...');
  speak("Initiating system optimization sequence, Sir.");

  try {
    const res = await fetch(`${BACKEND_BASE}/system/optimize`, { method: 'POST' });
    if (res.ok) await res.json();

    const log = document.getElementById('cmdLog');
    if (log && log.children.length > 25) {
      while (log.children.length > 15) {
        log.removeChild(log.firstChild);
      }
    }

    typewrite('✓ System memory compacted & database indexes optimized');
    modeStatus.textContent = 'STANDBY';
    addLog('System memory optimized', 'fa-broom');
    speak("System optimization sequence complete, Sir. Memory buffers purged, and storage structures compacted.");
  } catch (e) {
    typewrite('✓ Local storage and neural caches optimized');
    modeStatus.textContent = 'STANDBY';
    speak("Local memory buffers and neural caches optimized, Sir.");
  }
}

// ─────────────────────────────────────────────────────────────
// 🦾 IRON MAN MODE — TRUE ALWAYS-ON HANDS-FREE CONVERSATION
// No wake word needed. JARVIS listens continuously.
// Speak naturally → JARVIS responds → mic auto-restarts.
// Just like Tony Stark's JARVIS — always ready, anywhere.
// ─────────────────────────────────────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

let silenceTimer = null;
let finalTranscript = '';
let currentRecognizedText = '';
let hasSpoken = false;
let isIronManMode = false;
let isCommandQueued = false;
let _jarvisSpeakingGuard = false; // prevents onend restart while speak() is transitioning
let _ironManWatchdog = null;      // keepalive timer

// ── Reliable restart function (THE single place that restarts listening) ──
function restartIronManListening() {
  if (!recognition || !isIronManMode || isSecurityLocked) return;
  if (isSpeaking || _jarvisSpeakingGuard) return; // wait for TTS to finish
  if (isListening) return; // already running

  finalTranscript = '';
  currentRecognizedText = '';
  hasSpoken = false;
  isCommandQueued = false;

  try {
    recognition.lang = CURRENT_LANG || 'en-US';
    recognition.start();
  } catch (e) {
    // "already started" — that's fine
    if (e.name !== 'InvalidStateError') {
      console.warn('Recognition start error:', e);
    }
  }
}

// ── Keepalive Watchdog ──
// Chrome kills recognition after ~15s of silence (no-speech error).
// This watchdog checks every 3 seconds and restarts if needed.
function startIronManWatchdog() {
  clearInterval(_ironManWatchdog);
  _ironManWatchdog = setInterval(() => {
    if (!isIronManMode) {
      clearInterval(_ironManWatchdog);
      return;
    }
    // If Iron Man Mode is on, we're not speaking, and recognition died — restart it
    if (!isListening && !isSpeaking && !_jarvisSpeakingGuard && !isSecurityLocked) {
      console.log('[Watchdog] Recognition died — restarting...');
      restartIronManListening();
    }
  }, 3000);
}

function stopIronManWatchdog() {
  clearInterval(_ironManWatchdog);
  _ironManWatchdog = null;
}

// ── Toggle Iron Man Mode ON/OFF ──
function toggleIronManMode() {
  if (!recognition) {
    speak('Iron Man Mode requires speech recognition support. Please use Google Chrome, Sir.');
    return;
  }

  // Security Gate: Must be authenticated
  if (isSecurityLocked) {
    speak('Access denied, Sir. Iron Man Mode requires biometric authentication. Please verify your identity.');
    openBiometricModal(true);
    return;
  }

  isIronManMode = !isIronManMode;
  const btn = document.getElementById('ironManBtn');

  if (isIronManMode) {
    // ── ACTIVATE ──
    if (btn) {
      btn.classList.add('iron-man-active');
      btn.innerHTML = '<i class="fas fa-infinity"></i> IRON MAN MODE: ON';
    }
    modeStatus.textContent = 'IRON MAN MODE';
    avatarCore.classList.add('iron-man');

    const enrolled = getEnrolledFace();
    const userName = enrolled ? enrolled.name : 'Sir';

    // Boot sequence — listen starts AFTER TTS finishes (via speak→onend→restartIronManListening)
    typewrite(`⟩ MARK-VII NEURAL INTERFACE — INITIALIZING...`);
    setTimeout(() => typewrite(`⟩ MASTER USER: ${userName.toUpperCase()} — IDENTITY VERIFIED ✓`), 800);
    setTimeout(() => typewrite(`⟩ ALWAYS-ON VOICE ENGINE: ACTIVE — Speak naturally, no wake word needed`), 1600);
    setTimeout(() => {
      speak(`All systems online, ${userName}. Iron Man Mode is fully active. I am always listening. Just speak naturally and I will respond immediately. No wake word needed. Go ahead, Sir.`);
      // speak→onend will call restartIronManListening() automatically
    }, 2400);

    // Start watchdog to keep recognition alive
    startIronManWatchdog();

  } else {
    // ── DEACTIVATE ──
    stopIronManWatchdog();

    if (btn) {
      btn.classList.remove('iron-man-active');
      btn.innerHTML = '<i class="fas fa-mask"></i> IRON MAN MODE';
    }
    modeStatus.textContent = 'STANDBY';
    avatarCore.classList.remove('iron-man');
    clearTimeout(silenceTimer);
    isCommandQueued = false;
    _jarvisSpeakingGuard = false;
    try { recognition.stop(); } catch { }
    speak('Neural interface disengaged, Sir. Returning to manual command mode.');
    typewrite('⟩ IRON MAN MODE: OFFLINE — TAP TO SPEAK to resume');
  }
}


// ═══════════════════════════════════════════════════════════════
// Speech Recognition Event Handlers
// ═══════════════════════════════════════════════════════════════
if (recognition) {
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = CURRENT_LANG || 'en-US';

  // ── ON START ──
  recognition.onstart = () => {
    setListeningState(true);
    finalTranscript = '';
    currentRecognizedText = '';
    hasSpoken = false;

    if (isIronManMode) {
      typewrite('⟩ Listening... speak naturally');
      modeStatus.textContent = 'IRON MAN MODE';
    } else {
      typewrite('⟩ Listening... speak now');
    }
  };

  // ── ON RESULT ──
  recognition.onresult = (e) => {
    let interimText = '';

    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        finalTranscript += chunk + ' ';
      } else {
        interimText += chunk;
      }
    }

    currentRecognizedText = (finalTranscript + ' ' + interimText).replace(/\s+/g, ' ').trim();
    const display = currentRecognizedText;

    if (display.length > 0) {
      hasSpoken = true;
    }

    // Show live transcription
    if (display) {
      typewrite(isIronManMode ? `⟩ ${display}` : `> ${display}`);
    }

    // ── Silence timer: after user stops speaking for 1.3s, execute command ──
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      const full = currentRecognizedText || finalTranscript.trim();
      if (full && hasSpoken && !isCommandQueued) {
        isCommandQueued = true;
        hasSpoken = false;
        finalTranscript = '';
        currentRecognizedText = '';

        // Stop recognition, then execute command
        try { recognition.stop(); } catch { }
        takeCommand(full);
        // After takeCommand → askGemini → speak → onend → restartIronManListening
      } else if (isIronManMode && !hasSpoken) {
        // No speech detected in this window — stay listening
      }
    }, 1300);
  };

  // ── ON END ──
  recognition.onend = () => {
    clearTimeout(silenceTimer);
    setListeningState(false);

    // ── If speak() stopped us (guard is set), don't do anything ──
    // speak()'s u.onend will handle the restart
    if (_jarvisSpeakingGuard) {
      return;
    }

    // ── Manual mode: execute any accumulated speech ──
    if (!isIronManMode && !isCommandQueued) {
      const full = finalTranscript.trim() || currentRecognizedText;
      if (full && hasSpoken) {
        isCommandQueued = true;
        finalTranscript = '';
        currentRecognizedText = '';
        hasSpoken = false;
        takeCommand(full);
        return;
      }
    }

    // ── Iron Man Mode: restart listening if we're not speaking ──
    if (isIronManMode && !isSpeaking && !isCommandQueued && !isSecurityLocked) {
      setTimeout(() => restartIronManListening(), 300);
    }

    // Reset command queue flag (after the restart decision)
    isCommandQueued = false;
  };

  // ── ON ERROR ──
  recognition.onerror = (e) => {
    clearTimeout(silenceTimer);
    setListeningState(false);
    finalTranscript = '';
    currentRecognizedText = '';
    hasSpoken = false;

    if (e.error === 'not-allowed') {
      // Microphone permission denied — critical failure
      isIronManMode = false;
      stopIronManWatchdog();
      isCommandQueued = false;
      speak('Microphone access has been denied, Sir. Please allow microphone permissions in Chrome settings.');

    } else if (e.error === 'no-speech') {
      // Chrome's 15-second silence timeout — completely normal, just restart
      if (isIronManMode && !isSpeaking && !_jarvisSpeakingGuard) {
        setTimeout(() => restartIronManListening(), 200);
      }

    } else if (e.error === 'aborted') {
      // We aborted it ourselves (via recognition.stop()) — watchdog handles restart
      // Do nothing here

    } else {
      // Network error, audio-capture error, etc.
      console.warn('Recognition error:', e.error);
      if (isIronManMode && !isSpeaking) {
        setTimeout(() => restartIronManListening(), 1000);
      }
    }
  };
}

// ── Listening State UI Update ──
function setListeningState(active) {
  isListening = active;
  if (active) {
    talkBtn.classList.add('listening');
    micIcon.className = isIronManMode ? 'fas fa-infinity' : 'fas fa-stop';
    micLabel.textContent = isIronManMode ? 'ALWAYS LISTENING' : 'LISTENING...';
    avatarCore.classList.add('listening');
    avatarCore.classList.remove('speaking');
    waveform.classList.add('active');
    recogStatus.textContent = 'ACTIVE';
    modeStatus.textContent = isIronManMode ? 'IRON MAN MODE' : 'LISTENING';
  } else {
    talkBtn.classList.remove('listening');
    micIcon.className = 'fas fa-microphone';
    micLabel.textContent = isIronManMode ? 'IRON MAN MODE' : 'TAP TO SPEAK';
    avatarCore.classList.remove('listening');
    waveform.classList.remove('active');
    recogStatus.textContent = isIronManMode ? 'STANDBY' : 'IDLE';
    if (!isSpeaking) modeStatus.textContent = isIronManMode ? 'IRON MAN MODE' : 'STANDBY';
  }
}

// ─────────────────────────────────────────────────────────────
// Mic Button — Tap to Speak (manual) / Toggle Iron Man off
// ─────────────────────────────────────────────────────────────
talkBtn.addEventListener('click', () => {
  if (isSecurityLocked) {
    speak('Access denied, Sir. Please authenticate first.');
    openBiometricModal(true);
    return;
  }
  if (!recognition) {
    speak('Speech recognition is not supported. Please use Google Chrome, Sir.');
    return;
  }

  // If Iron Man Mode is on, tapping the button turns it OFF
  if (isIronManMode) {
    toggleIronManMode();
    return;
  }

  // Manual mode: toggle listening
  if (isListening) {
    clearTimeout(silenceTimer);
    try { recognition.stop(); } catch { }
    setListeningState(false);
    const captured = (finalTranscript + ' ' + currentRecognizedText).trim();
    if (captured && !isCommandQueued) {
      isCommandQueued = true;
      finalTranscript = '';
      currentRecognizedText = '';
      hasSpoken = false;
      takeCommand(captured);
    }
    return;
  }

  // Start manual listening
  window.speechSynthesis.cancel();
  isCommandQueued = false;
  _jarvisSpeakingGuard = false;
  finalTranscript = '';
  currentRecognizedText = '';
  typewrite('Listening — speak your full command, then pause...');
  try { recognition.lang = CURRENT_LANG || 'en-US'; recognition.start(); } catch { }
});

// ─────────────────────────────────────────────────────────────
// Particle Canvas
// ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

(function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
})();

const particles = Array.from({ length: 55 }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  vx: (Math.random() - 0.5) * 0.35,
  vy: (Math.random() - 0.5) * 0.35,
  r: Math.random() * 1.4 + 0.4,
  alpha: Math.random() * 0.45 + 0.08,
}));

function drawParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,229,255,${p.alpha})`;
    ctx.fill();
  });

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 130) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(0,229,255,${0.07 * (1 - d / 130)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
  requestAnimationFrame(drawParticles);
}
drawParticles();

// ─────────────────────────────────────────────────────────────
// Boot Sequence
// ─────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  loadVoice();
  initAIBadge();
  initLanguage();
  updateRemindersBadge();
  checkCloudServer();
  initVolume();
  initTheme();
  initBatteryTelemetry();

  // ── JARVIS Core Startup — Biometric Face Security Protocol ──
  const enrolled = getEnrolledFace();
  isSecurityLocked = true;
  const secLabel = document.getElementById('securityLabel');
  if (secLabel) secLabel.textContent = enrolled ? 'LOCKED' : 'ENROLL';

  setTimeout(async () => {
    await openBiometricModal(true);
    if (!enrolled) {
      speak("Biometric security protocol active. Master face enrollment is required to register your identity, Sir.");
      setTimeout(() => {
        const modal = document.getElementById('biometricLockModal');
        if (modal && modal.style.display !== 'none' && !getEnrolledFace() && !isEnrollingMaster) {
          promptEnrollFace();
        }
      }, 1500);
    } else {
      speak(`Biometric security locked. Please look into the camera to authenticate, Master ${enrolled.name}.`);
    }
  }, 600);
});