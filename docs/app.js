/* ── AP2 Teil 2 Lernplattform – Statische Version ─────────────────
 *  Läuft komplett im Browser – ruft Claude API direkt auf (kein Backend)
 * ───────────────────────────────────────────────────────────────── */

// ── Konfiguration ─────────────────────────────────────────────────────────
const CLAUDE_MODEL   = 'claude-opus-4-6';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DATA_URL       = 'data/exams.json';   // Pfad zur Prüfungsdaten-Datei

const TOPICS = [
  { id:'algorithmen', label:'Algorithmen & Pseudocode', icon:'⚙️',  keywords:['Algorithmus','Pseudocode','Struktogramm'] },
  { id:'sortierung',  label:'Sortieralgorithmen',        icon:'🔢',  keywords:['Sortier','Bubble','Selection','Insertion','Quick'] },
  { id:'rekursion',   label:'Rekursion',                 icon:'🔁',  keywords:['rekursiv','Rekursion','Abbruchbedingung'] },
  { id:'uml',         label:'UML Aktivitätsdiagramm',   icon:'📊',  keywords:['Aktivitätsdiagramm','UML','Aktivität'] },
  { id:'sql',         label:'SQL & Datenbanken',         icon:'🗄️',  keywords:['SQL','SELECT','JOIN','Stored Procedure','Trigger'] },
  { id:'erm',         label:'ERM & Relationales Modell', icon:'🔗',  keywords:['ERM','ER-Modell','relationales Modell','Normalisierung','Entität'] },
  { id:'arrays',      label:'Arrays & Datenstrukturen',  icon:'📋',  keywords:['Array','zweidimensional','Liste','Stack','Queue'] },
  { id:'testing',     label:'Testing & Unit-Tests',      icon:'✅',  keywords:['Unit-Test','Testfall','Blackbox','Whitebox','Äquivalenzklasse'] },
  { id:'oop',         label:'OOP & Klassendiagramm',     icon:'🧱',  keywords:['Klasse','Objekt','Vererbung','Polymorphismus','Klassendiagramm'] },
  { id:'code',        label:'Code lesen & schreiben',    icon:'💻',  keywords:['Methode','Funktion','Rückgabe','Parameter','Schleife'] },
];

const SYSTEM_PROMPT = `Du bist ein spezialisierter Lernassistent für den AP2 Teil 2 der IHK-Abschlussprüfung für Fachinformatiker Anwendungsentwicklung (FIAE).

Dein Fokus liegt AUSSCHLIESSLICH auf dem Prüfungsteil "Entwicklung und Umsetzung von Algorithmen".

Die typischen Themen in AP2 Teil 2 sind:
1. Algorithmen & Pseudocode – Algorithmen lesen, schreiben, korrigieren (Sortierverfahren, etc.)
2. Rekursion – Rekursive Algorithmen verstehen, Schreibtischtest durchführen
3. UML Aktivitätsdiagramm – Prozesse als Aktivitätsdiagramm modellieren
4. Arrays – 1D und 2D Arrays traversieren, auswerten, befüllen
5. Datenbanken (SQL) – SELECT mit JOIN, GROUP BY, HAVING, Stored Procedures, Trigger, Indizes
6. ERM & Relationales Modell – Entity-Relationship-Modell erstellen und in relationales Modell überführen
7. Testing – Unit-Tests, Äquivalenzklassen, Grenzwertanalyse, Testfälle erstellen
8. OOP – Klassen implementieren, Vererbung, Methoden

Deine Aufgaben:
- Prüfungsaufgaben Schritt für Schritt erklären und musterhaft lösen
- Pseudocode/Struktogramme schreiben und erklären
- SQL-Abfragen schreiben und erklären
- Schreibtischtests durchführen
- Typische Prüfungsfehler benennen
- Merkhilfen und Prüfungsstrategien geben

Antworte immer auf Deutsch. Strukturiere Antworten klar mit Überschriften und Codeblöcken.`;

// ── State ─────────────────────────────────────────────────────────────────
let exams         = [];
let apiKey        = localStorage.getItem('ap2_key') || '';
let chatHistory   = [];    // messages array for Claude API
let chatMin       = false;
let currentExamId = null;
let searchTimer   = null;

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  setupEvents();
  await loadExams();
  updateKeyBtn();
}

// ── Load exam data ────────────────────────────────────────────────────────
async function loadExams() {
  try {
    const res = await fetch(DATA_URL);
    const data = await res.json();
    exams = data.exams;   // already filtered to Teil 2 in JSON
    renderHome();
    renderSidebar();
  } catch (e) {
    $('sidebarNav').innerHTML = '<div class="nav-placeholder" style="color:#f87171">Fehler beim Laden der Daten</div>';
  }
}

// ── Home / Welcome ────────────────────────────────────────────────────────
function renderHome() {
  const totalTasks  = exams.reduce((s, e) => s + e.tasks.length, 0);
  const totalPoints = exams.reduce((s, e) => s + e.tasks.reduce((ss, t) => ss + t.points, 0), 0);

  $('statsRow').innerHTML = `
    <div class="stat"><div class="stat-num">${exams.length}</div><div class="stat-lbl">Prüfungen</div></div>
    <div class="stat"><div class="stat-num">${totalTasks}</div><div class="stat-lbl">Aufgaben</div></div>
    <div class="stat"><div class="stat-num">${TOPICS.length}</div><div class="stat-lbl">Themen</div></div>
    <div class="stat"><div class="stat-num">${totalPoints}</div><div class="stat-lbl">Punkte</div></div>
  `;

  // Topic grid with live counts
  $('topicGrid').innerHTML = '';
  for (const t of TOPICS) {
    const count = countTasksForTopic(t);
    const card = document.createElement('div');
    card.className = 'topic-card';
    card.innerHTML = `<div class="tc-icon">${t.icon}</div><div><div class="tc-name">${t.label}</div><div class="tc-count">${count} Aufgaben</div></div>`;
    card.addEventListener('click', () => showTopicView(t));
    $('topicGrid').appendChild(card);
  }

  // Exam cards
  $('examGrid').innerHTML = '';
  for (const exam of exams) {
    const pts = exam.tasks.reduce((s, t) => s + t.points, 0);
    const card = document.createElement('div');
    card.className = 'exam-card';
    card.innerHTML = `<div class="ec-year">${exam.year}</div><div class="ec-season">${exam.season}</div><div class="ec-info">${exam.tasks.length} Aufgaben · ${pts} Punkte</div>`;
    card.addEventListener('click', () => showExamView(exam.id));
    $('examGrid').appendChild(card);
  }
}

// ── Sidebar ───────────────────────────────────────────────────────────────
function renderSidebar() {
  const nav = $('sidebarNav');
  nav.innerHTML = '';

  // Topics group
  const tg = makeNavGroup('Themen');
  for (const t of TOPICS) {
    const item = makeNavItem(`${t.icon} ${t.label}`, () => showTopicView(t), `nav-t-${t.id}`);
    tg.appendChild(item);
  }
  nav.appendChild(tg);

  // Exams group
  const eg = makeNavGroup('Prüfungen');
  for (const exam of exams) {
    const item = makeNavItem(`📄 ${exam.season} ${exam.year}`, () => showExamView(exam.id), `nav-e-${exam.id}`);
    eg.appendChild(item);
  }
  nav.appendChild(eg);
}

function makeNavGroup(label) {
  const g = document.createElement('div');
  g.className = 'nav-group';
  g.innerHTML = `<div class="nav-group-label">${label}</div>`;
  return g;
}

function makeNavItem(text, onClick, navId) {
  const el = document.createElement('div');
  el.className = 'nav-item';
  el.id = navId;
  el.innerHTML = text;
  el.addEventListener('click', () => { setActiveNav(navId); onClick(); });
  return el;
}

function setActiveNav(navId) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(navId);
  if (el) el.classList.add('active');
}

// ── Exam view ─────────────────────────────────────────────────────────────
function showExamView(examId) {
  currentExamId = examId;
  const exam = exams.find(e => e.id === examId);
  if (!exam) return;
  setActiveNav(`nav-e-${examId}`);
  showView('exam');
  $('examHeading').textContent = exam.label;
  const pts = exam.tasks.reduce((s, t) => s + t.points, 0);
  $('examMeta').textContent = `${exam.tasks.length} Aufgaben · ${pts} Punkte`;
  $('taskList').innerHTML = '';
  exam.tasks.forEach((task, i) => {
    const card = buildTaskCard(task, null);
    if (i === 0) card.classList.add('open');
    $('taskList').appendChild(card);
  });
}

// ── Topic view ────────────────────────────────────────────────────────────
function showTopicView(topic) {
  currentExamId = null;
  setActiveNav(`nav-t-${topic.id}`);
  showView('topic');
  $('topicHeading').textContent = `${topic.icon} ${topic.label}`;

  // Theory from Claude
  const box = $('theoryBox');
  if (apiKey) {
    box.textContent = 'KI erklärt das Thema…';
    box.className = 'theory-box loading';
    streamTheory(topic, box);
  } else {
    box.className = 'theory-box';
    box.textContent = 'ℹ️ Trage deinen API-Key unter ⚙ ein, um KI-Erklärungen zu erhalten.';
  }

  // Matching tasks
  const list = $('topicTaskList');
  list.innerHTML = '';
  const matching = findTasksForTopic(topic);
  if (!matching.length) {
    list.innerHTML = '<p style="color:var(--muted)">Keine direkten Treffer gefunden.</p>';
    return;
  }
  for (const { exam, task } of matching) {
    const card = buildTaskCard(task, exam.label);
    list.appendChild(card);
  }
}

async function streamTheory(topic, container) {
  if (!apiKey) return;
  const prompt = `Erkläre das Thema "${topic.label}" kompakt für die AP2 Teil 2 (FIAE).

Struktur:
1. Kurze Definition
2. Warum kommt es in der AP2 vor?
3. Die wichtigsten Konzepte mit konkreten Beispielen (Pseudocode/SQL/etc.)
4. Typische Aufgabenstellungen
5. Häufige Fehler vermeiden

Bleib prägnant und prüfungsrelevant.`;

  container.textContent = '';
  container.className = 'theory-box streaming';

  try {
    await claudeStream(
      [{ role: 'user', content: prompt }],
      chunk => { container.textContent += chunk; },
    );
  } catch (e) {
    container.textContent = '❌ Fehler: ' + e.message;
  } finally {
    container.classList.remove('streaming');
    container.className = 'theory-box';
  }
}

// ── Task card ─────────────────────────────────────────────────────────────
function buildTaskCard(task, examLabel) {
  const tags = detectTags(task.content);
  const card = document.createElement('div');
  card.className = 'task-card';
  card.innerHTML = `
    <div class="task-head">
      <div class="task-title">${task.num}. Aufgabe</div>
      <div class="task-meta">
        <span class="pts">${task.points} Punkte</span>
        <span class="toggle-arrow">▼</span>
      </div>
    </div>
    <div class="task-body">
      ${examLabel ? `<div class="exam-ref">${examLabel}</div>` : ''}
      ${tags.length ? `<div class="task-tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
      <div class="task-text">${formatTask(task.content)}</div>
      <div class="task-actions">
        <button class="btn-task btn-e">🔍 Erklären</button>
        <button class="btn-task btn-s">💡 Musterlösung</button>
        <button class="btn-task btn-t">📌 Tipps</button>
      </div>
    </div>
  `;

  card.querySelector('.task-head').addEventListener('click', () => card.classList.toggle('open'));

  const label = examLabel || (currentExamId ? exams.find(e => e.id === currentExamId)?.label : '') || '';

  card.querySelector('.btn-e').addEventListener('click', e => {
    e.stopPropagation();
    askAI(`Erkläre mir Schritt für Schritt die ${task.num}. Aufgabe (${task.points} Punkte)${label ? ` aus "${label}"` : ''}:\n\n${task.content}`);
  });
  card.querySelector('.btn-s').addEventListener('click', e => {
    e.stopPropagation();
    askAI(`Zeig mir eine vollständige Musterlösung für die ${task.num}. Aufgabe (${task.points} Punkte)${label ? ` aus "${label}"` : ''}:\n\n${task.content}\n\nErkläre jeden Schritt.`);
  });
  card.querySelector('.btn-t').addEventListener('click', e => {
    e.stopPropagation();
    askAI(`Was sind typische Fehler und wichtige Tipps für die ${task.num}. Aufgabe${label ? ` aus "${label}"` : ''}?\n\n${task.content}`);
  });

  return card;
}

function detectTags(content) {
  const lower = content.toLowerCase();
  const map = [
    ['Pseudocode','Pseudocode'],['Struktogramm','Struktogramm'],
    ['rekursiv','Rekursion'],['Aktivitätsdiagramm','UML'],
    ['SQL','SQL'],['SELECT','SQL'],['ERM','ERM'],['relational','Rel. Modell'],
    ['Unit-Test','Unit-Test'],['Sortier','Sortierung'],
    ['Array','Array'],['Schreibtischtest','Schreibtischtest'],
    ['Äquivalenz','Äquivalenzklasse'],['Klasse','OOP'],
  ];
  const found = new Set();
  for (const [kw, label] of map) if (lower.includes(kw.toLowerCase())) found.add(label);
  return [...found].slice(0, 4);
}

// ── Claude API (direkt vom Browser) ──────────────────────────────────────
/**
 * Ruft die Claude API direkt auf und streamt die Antwort.
 * @param {Array}    messages   - Array von {role, content} Objekten
 * @param {Function} onChunk    - Callback mit jedem Text-Chunk
 * @param {string}   [system]   - Optionaler System-Prompt (Default: SYSTEM_PROMPT)
 */
async function claudeStream(messages, onChunk, system = SYSTEM_PROMPT) {
  if (!apiKey) throw new Error('Kein API-Key. Bitte unter ⚙ einrichten.');

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Erlaubt direkte Browser-Aufrufe
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      stream: true,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error('Ungültiger API-Key. Bitte prüfen.');
    throw new Error(msg);
  }

  // SSE parsing
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') return;
      try {
        const event = JSON.parse(raw);
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          onChunk(event.delta.text);
        }
      } catch {}
    }
  }
}

// ── Chat ──────────────────────────────────────────────────────────────────
function askAI(prompt) {
  if (chatMin) toggleChat();
  $('quickBtns').style.display = 'none';
  $('chatInput').value = prompt;
  sendChat();
}

async function sendChat() {
  const text = $('chatInput').value.trim();
  if (!text) return;

  if (!apiKey) {
    showModal();
    return;
  }

  $('chatInput').value = '';
  $('chatInput').style.height = 'auto';
  $('chatSend').disabled = true;
  $('quickBtns').style.display = 'none';

  appendMsg('user', text);
  chatHistory.push({ role: 'user', content: text });

  // Prüfungskontext anhängen wenn aktiv
  let systemWithContext = SYSTEM_PROMPT;
  if (currentExamId) {
    const exam = exams.find(e => e.id === currentExamId);
    if (exam) {
      systemWithContext += `\n\nAktuell betrachtete Prüfung: ${exam.label}\n`;
      for (const task of exam.tasks) {
        systemWithContext += `\n${task.num}. Aufgabe (${task.points} Punkte):\n${task.content.slice(0, 800)}\n`;
      }
    }
  }

  const bubbleEl = appendMsg('ai', '', true);

  try {
    let fullText = '';
    await claudeStream(
      chatHistory,
      chunk => {
        fullText += chunk;
        bubbleEl.textContent = fullText;
        $('chatMsgs').scrollTop = $('chatMsgs').scrollHeight;
      },
      systemWithContext,
    );
    bubbleEl.classList.remove('streaming');
    chatHistory.push({ role: 'assistant', content: fullText });

  } catch (e) {
    bubbleEl.classList.remove('streaming');
    bubbleEl.textContent = '❌ ' + e.message;
    if (e.message.includes('API-Key')) showModal();
  }

  $('chatSend').disabled = false;
  $('chatMsgs').scrollTop = $('chatMsgs').scrollHeight;
}

function appendMsg(role, text, streaming = false) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = `bubble${streaming ? ' streaming' : ''}`;
  if (text) bubble.innerHTML = text;
  div.appendChild(bubble);
  $('chatMsgs').appendChild(div);
  $('chatMsgs').scrollTop = $('chatMsgs').scrollHeight;
  return bubble;
}

function toggleChat() {
  chatMin = !chatMin;
  $('chat').classList.toggle('minimized', chatMin);
  $('chatToggle').textContent = chatMin ? '▲' : '▼';
}

// ── Search ────────────────────────────────────────────────────────────────
function doSearch(query) {
  if (query.length < 2) { $('searchDropdown').classList.add('hidden'); return; }
  const q = query.toLowerCase();
  const results = [];

  for (const exam of exams) {
    for (const task of exam.tasks) {
      if (task.content.toLowerCase().includes(q)) {
        const idx = task.content.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 50);
        const end   = Math.min(task.content.length, idx + 180);
        results.push({ exam, task, snippet: '…' + task.content.slice(start, end) + '…' });
        if (results.length >= 8) break;
      }
    }
    if (results.length >= 8) break;
  }

  const hl = str => str.replace(new RegExp(escRe(query), 'gi'), m => `<mark class="search-mark">${m}</mark>`);

  if (!results.length) {
    $('searchDropdown').innerHTML = '<div class="sd-item" style="color:var(--muted)">Keine Treffer</div>';
  } else {
    $('searchDropdown').innerHTML = results.map((r, i) => `
      <div class="sd-item" data-i="${i}">
        <div class="sd-exam">${r.exam.label}</div>
        <div class="sd-task">Aufgabe ${r.task.num} (${r.task.points} Pkt.)</div>
        <div class="sd-snippet">${hl(r.snippet)}</div>
      </div>
    `).join('');
    $('searchDropdown').querySelectorAll('.sd-item').forEach((el, i) => {
      el.addEventListener('click', () => {
        showExamView(results[i].exam.id);
        $('searchDropdown').classList.add('hidden');
        $('searchInput').value = '';
      });
    });
  }
  $('searchDropdown').classList.remove('hidden');
}

// ── Topic helpers ─────────────────────────────────────────────────────────
function countTasksForTopic(topic) {
  let count = 0;
  for (const exam of exams)
    for (const task of exam.tasks)
      if (topic.keywords.some(kw => task.content.toLowerCase().includes(kw.toLowerCase()))) { count++; break; }
  return count;
}

function findTasksForTopic(topic) {
  const results = [];
  for (const exam of exams)
    for (const task of exam.tasks)
      if (topic.keywords.some(kw => task.content.toLowerCase().includes(kw.toLowerCase())))
        results.push({ exam, task });
  return results;
}

// ── View management ───────────────────────────────────────────────────────
function showView(name) {
  ['Home','Exam','Topic','Search'].forEach(v =>
    $('view' + v).classList.toggle('hidden', v.toLowerCase() !== name)
  );
  document.querySelectorAll('.nav-item').forEach(el => {
    if (name !== 'exam' && name !== 'topic') el.classList.remove('active');
  });
}

// ── Settings / API Key ────────────────────────────────────────────────────
function showModal() {
  $('apiKeyInput').value = apiKey;
  updateKeyStatus();
  $('overlay').classList.remove('hidden');
}

function updateKeyStatus() {
  const ks = $('keyStatus');
  if (apiKey) {
    ks.textContent = '✓ API-Key gespeichert';
    ks.className = 'key-status ok';
  } else {
    ks.textContent = '⚠ Kein API-Key – KI nicht verfügbar';
    ks.className = 'key-status err';
  }
}

function updateKeyBtn() {
  const btn = $('btnSettings');
  if (apiKey) {
    btn.textContent = '✓ KI aktiv';
    btn.classList.add('active');
  } else {
    btn.textContent = '⚙ API-Key einrichten';
    btn.classList.remove('active');
  }
}

// ── Events ────────────────────────────────────────────────────────────────
function setupEvents() {
  // Sidebar toggle
  $('sidebarToggle').addEventListener('click', () => {
    $('sidebar').classList.add('collapsed');
    $('sidebarOpenBtn').classList.remove('hidden');
  });
  $('sidebarOpenBtn').addEventListener('click', () => {
    $('sidebar').classList.remove('collapsed');
    $('sidebarOpenBtn').classList.add('hidden');
  });

  // Back buttons → home
  ['examBack','topicBack','searchBack'].forEach(id => {
    $(id).addEventListener('click', () => { showView('home'); currentExamId = null; });
  });

  // Exam AI overview button
  $('btnExamAI').addEventListener('click', () => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return;
    askAI(`Gib mir einen Überblick über die Prüfung "${exam.label}": Welche Themen kommen vor, was sind die Schwerpunkte, und wie gehe ich am besten vor?`);
  });

  // Chat
  $('chatToggle').addEventListener('click', e => { e.stopPropagation(); toggleChat(); });
  $('chatHead').addEventListener('click', e => { if (!e.target.closest('.chat-head-btns')) toggleChat(); });
  $('chatClear').addEventListener('click', e => {
    e.stopPropagation();
    chatHistory = [];
    $('chatMsgs').innerHTML = `<div class="msg ai"><div class="bubble">Chat geleert. Was möchtest du üben?</div></div>`;
    $('quickBtns').style.display = 'flex';
  });
  $('chatSend').addEventListener('click', sendChat);
  $('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
  $('chatInput').addEventListener('input', () => {
    $('chatInput').style.height = 'auto';
    $('chatInput').style.height = Math.min($('chatInput').scrollHeight, 110) + 'px';
  });

  // Quick buttons
  $('quickBtns').querySelectorAll('.qbtn').forEach(btn => {
    btn.addEventListener('click', () => askAI(btn.dataset.q));
  });

  // Settings
  $('btnSettings').addEventListener('click', showModal);
  $('modalClose').addEventListener('click', () => $('overlay').classList.add('hidden'));
  $('overlay').addEventListener('click', e => { if (e.target === $('overlay')) $('overlay').classList.add('hidden'); });
  $('btnSaveKey').addEventListener('click', () => {
    apiKey = $('apiKeyInput').value.trim();
    localStorage.setItem('ap2_key', apiKey);
    updateKeyBtn();
    updateKeyStatus();
    setTimeout(() => $('overlay').classList.add('hidden'), 600);
  });

  // Search
  $('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = $('searchInput').value.trim();
    if (!q) { $('searchDropdown').classList.add('hidden'); return; }
    searchTimer = setTimeout(() => doSearch(q), 280);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) $('searchDropdown').classList.add('hidden');
  });
}

// ── Task content formatter ────────────────────────────────────────────────
/**
 * Wandelt rohen Aufgaben-Text in strukturiertes HTML um.
 * Erkennt: Hauptfragen (a)/b)/c)), Unterfragen (aa)/ab)), Punkte-Badges,
 * Aufzählungen (-), Abschnittsüberschriften (Wort:) und Code-Blöcke.
 */
function formatTask(raw) {
  const lines = raw.split('\n');
  const out = [];
  let i = 0;

  // Sammelt aufeinanderfolgende Bullet-Zeilen zusammen
  function flushBullets(bullets) {
    if (!bullets.length) return;
    out.push(`<ul class="task-bullets">${bullets.map(b => `<li>${inlineFormat(b)}</li>`).join('')}</ul>`);
    bullets.length = 0;
  }

  const bullets = [];

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (!line) {
      flushBullets(bullets);
      continue;
    }

    // ── Hauptfrage: Zeile ist nur "a)" / "b)" / "c)" usw. ──
    if (/^[a-z]\)$/.test(line)) {
      flushBullets(bullets);
      // Nächste nicht-leere Zeile ist der Fragetext
      let questionText = '';
      while (i < lines.length && !lines[i].trim()) i++;
      if (i < lines.length) {
        const next = lines[i].trim();
        // Kein Punkt-Satz und keine neue Unterfrage einlesen
        if (next && !/^\([0-9]/.test(next) && !/^[a-z]{2}\)/.test(next)) {
          questionText = next;
          i++;
        }
      }
      out.push(`<div class="tq-main"><span class="tq-label">${esc(line)}</span><span class="tq-text">${inlineFormat(questionText)}</span></div>`);
      continue;
    }

    // ── Unterfrage: Zeile beginnt mit "aa)" / "ab)" / "ba)" usw. ──
    const subMatch = line.match(/^([a-z]{2})\)\s*(.*)/);
    if (subMatch) {
      flushBullets(bullets);
      const [, label, rest] = subMatch;
      // Punkte aus dem rest extrahieren
      const pts = rest.match(/\((\d+)\s*Punkte?\)/i);
      const text = rest.replace(/\(\d+\s*Punkte?\)/i, '').trim();
      const ptsHtml = pts ? `<span class="tq-pts">${pts[1]} Pkt.</span>` : '';
      out.push(`<div class="tq-sub"><span class="tq-sub-label">${esc(label)})</span><span class="tq-sub-text">${inlineFormat(text)}</span>${ptsHtml}</div>`);
      continue;
    }

    // ── Punkte-Badge alleine auf einer Zeile: "(3 Punkte)" ──
    const ptsAlone = line.match(/^\((\d+)\s*Punkte?\)$/i);
    if (ptsAlone) {
      flushBullets(bullets);
      out.push(`<div class="tq-pts-line"><span class="tq-pts">${ptsAlone[1]} Punkte</span></div>`);
      continue;
    }

    // ── Aufzählung: beginnt mit "- " oder "• " ──
    if (/^[-•]\s+/.test(line)) {
      bullets.push(line.replace(/^[-•]\s+/, ''));
      continue;
    }

    // ── Abschnittsüberschrift: kurze Zeile die mit ":" endet ──
    if (line.endsWith(':') && line.length < 60 && !line.includes('(')) {
      flushBullets(bullets);
      out.push(`<div class="tq-section">${esc(line)}</div>`);
      continue;
    }

    // ── Normaler Text ──
    flushBullets(bullets);
    out.push(`<p class="tq-para">${inlineFormat(line)}</p>`);
  }

  flushBullets(bullets);
  return out.join('');
}

/** Inline-Formatierung: Punkte fett, Schlüsselbegriffe hervorheben */
function inlineFormat(text) {
  return esc(text)
    // (X Punkte) → Badge
    .replace(/\((\d+)\s*Punkte?\)/gi, '<span class="tq-pts">$1 Pkt.</span>')
    // Variante 1 / Variante 2 → hervorheben
    .replace(/(Variante\s+\d+)/g, '<strong>$1</strong>')
    // SQL-Keywords → code
    .replace(/\b(SELECT|FROM|WHERE|JOIN|GROUP BY|HAVING|ORDER BY|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|INNER|LEFT|RIGHT|ON|AS)\b/g,
      '<code class="sql-kw">$1</code>');
}

// ── Utils ─────────────────────────────────────────────────────────────────
function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

// ── Start ─────────────────────────────────────────────────────────────────
init();
