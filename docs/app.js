/* ── AP2 Teil 2 Lernplattform – Statische Version ─────────────────
 *  Läuft komplett im Browser – ruft Claude API direkt auf (kein Backend)
 * ───────────────────────────────────────────────────────────────── */

// ── Konfiguration ─────────────────────────────────────────────────────────
const CLAUDE_MODEL   = 'claude-opus-4-6';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_MODEL   = 'gpt-4o-mini';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
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

// Cache für KI-Erklärungen – wird in localStorage dauerhaft gespeichert
const theoryCache = JSON.parse(localStorage.getItem('ap2_theory_cache') || '{}');
function saveTheoryCache() {
  localStorage.setItem('ap2_theory_cache', JSON.stringify(theoryCache));
}

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
let claudeKey     = localStorage.getItem('ap2_claude_key') || localStorage.getItem('ap2_key') || '';
let openaiKey     = localStorage.getItem('ap2_openai_key') || '';
let aiProvider    = localStorage.getItem('ap2_provider') || (claudeKey ? 'claude' : (openaiKey ? 'openai' : 'claude'));
let chatHistory   = [];    // messages array for active provider API
let chatMin       = true;   // chat starts hidden (right sidebar)
let currentExamId = null;
let searchTimer   = null;

function getProviderLabel(provider = aiProvider) {
  return provider === 'openai' ? 'ChatGPT (OpenAI)' : 'Claude (Anthropic)';
}

function getActiveKey(provider = aiProvider) {
  return provider === 'openai' ? openaiKey : claudeKey;
}

function hasActiveKey(provider = aiProvider) {
  return !!getActiveKey(provider);
}

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

  // Theory from Claude – only on demand
  const box = $('theoryBox');
  box._topic = topic;
  if (hasActiveKey()) {
    box.style.display = '';
    if (theoryCache[topic.id]) {
      renderTheoryResult(box, theoryCache[topic.id]);
    } else {
      box.className = 'theory-box';
      box.innerHTML = '<button class="btn-explain" onclick="triggerTheory()">🤖 KI-Erklärung laden</button>';
    }
  } else {
    box.style.display = 'none';
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

function triggerTheory() {
  const box = $('theoryBox');
  const topic = box._topic;
  if (!topic) return;
  box.innerHTML = '';
  box.textContent = 'KI erklärt das Thema…';
  box.className = 'theory-box loading';
  streamTheory(topic, box);
}

function regenTheory() {
  const box = $('theoryBox');
  const topic = box._topic;
  if (!topic) return;
  delete theoryCache[topic.id];
  saveTheoryCache();
  box.innerHTML = '';
  box.textContent = 'KI erklärt das Thema…';
  box.className = 'theory-box loading';
  streamTheory(topic, box);
}

function renderTheoryResult(box, text) {
  box.className = 'theory-box';
  box.innerHTML = `<div class="theory-content">${renderMarkdown(text)}</div>
    <button class="btn-regenerate" onclick="regenTheory()">🔄 Neu generieren</button>`;
}

function renderMarkdown(text) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Protect fenced code blocks
  const codeBlocks = [];
  text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre><code>${esc(code.trim())}</code></pre>`);
    return `\x00CODE${codeBlocks.length - 1}\x00`;
  });
  // Protect inline code
  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    inlineCodes.push(`<code class="ic">${esc(code)}</code>`);
    return `\x00IC${inlineCodes.length - 1}\x00`;
  });

  const inlineFmt = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\x00IC(\d+)\x00/g, (_, i) => inlineCodes[i]);

  let html = '';
  let inUl = false, inOl = false;
  const closeList = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };

  for (const line of text.split('\n')) {
    if (/^#{1,2} /.test(line)) {
      closeList();
      html += `<h3>${inlineFmt(esc(line.replace(/^#{1,2} /, '')))}</h3>`;
    } else if (/^### /.test(line)) {
      closeList();
      html += `<h4>${inlineFmt(esc(line.slice(4)))}</h4>`;
    } else if (/^- /.test(line)) {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul>'; inUl = true; }
      html += `<li>${inlineFmt(esc(line.slice(2)))}</li>`;
    } else if (/^\d+\. /.test(line)) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol>'; inOl = true; }
      html += `<li>${inlineFmt(esc(line.replace(/^\d+\. /, '')))}</li>`;
    } else if (line.trim() === '') {
      closeList();
      html += '<br>';
    } else if (/^\x00CODE\d+\x00$/.test(line.trim())) {
      closeList();
      html += line.trim();
    } else {
      closeList();
      html += `<p>${inlineFmt(esc(line))}</p>`;
    }
  }
  closeList();

  // Restore code blocks
  html = html.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[i]);
  return html;
}

async function streamTheory(topic, container) {
  if (!hasActiveKey()) return;
  const prompt = `Erkläre das Thema "${topic.label}" kompakt für die AP2 Teil 2 (FIAE).

Struktur:
1. Kurze Definition
2. Warum kommt es in der AP2 vor?
3. Die wichtigsten Konzepte mit konkreten Beispielen (Pseudocode/SQL/etc.)
4. Typische Aufgabenstellungen
5. Häufige Fehler vermeiden

Bleib prägnant und prüfungsrelevant. Nutze Markdown für Formatierung (## Überschriften, **fett**, \`Code\`, Aufzählungen).`;

  let fullText = '';
  container.textContent = '';
  container.className = 'theory-box streaming';

  try {
    await streamAI(
      [{ role: 'user', content: prompt }],
      chunk => { fullText += chunk; container.textContent = fullText; },
    );
    theoryCache[topic.id] = fullText;
    saveTheoryCache();
    renderTheoryResult(container, fullText);
  } catch (e) {
    container.textContent = '❌ Fehler: ' + e.message;
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
        <button class="btn-task btn-check">✏️ Lösung prüfen</button>
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

  card.querySelector('.btn-check').addEventListener('click', e => {
    e.stopPropagation();
    toggleAnswerPanel(card, task, label);
  });

  return card;
}

// ── Answer panel (Lösung einreichen & prüfen) ─────────────────────────────
function toggleAnswerPanel(card, task, label) {
  let panel = card.querySelector('.answer-panel');
  if (!panel) {
    panel = createAnswerPanel(task, label);
    card.querySelector('.task-body').appendChild(panel);
  }
  const willShow = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !willShow);
  if (willShow) panel.querySelector('.ap-text').focus();
}

function createAnswerPanel(task, label) {
  const panel = document.createElement('div');
  panel.className = 'answer-panel hidden';
  panel.innerHTML = `
    <div class="ap-header">✏️ Deine Lösung einreichen &amp; prüfen lassen</div>
    <textarea class="ap-text" rows="4" placeholder="Deine Antwort, Pseudocode, SQL-Abfrage, Erklärung…"></textarea>
    <div class="ap-img-zone">
      <div class="ap-img-hint">📎 Bild hochladen (draw.io PNG, UML, Foto) — klicken oder reinziehen</div>
      <img class="ap-img-preview" alt="Vorschau" style="display:none">
      <button type="button" class="ap-img-clear" style="display:none">× Bild entfernen</button>
      <input type="file" class="ap-img-input" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none">
    </div>
    <div class="ap-actions">
      <button type="button" class="btn-task ap-submit">🔍 Von KI prüfen lassen</button>
      <button type="button" class="btn-task ap-cancel">Abbrechen</button>
    </div>
    <div class="ap-feedback hidden"></div>
  `;

  const imgZone    = panel.querySelector('.ap-img-zone');
  const imgInput   = panel.querySelector('.ap-img-input');
  const imgPreview = panel.querySelector('.ap-img-preview');
  const imgClear   = panel.querySelector('.ap-img-clear');
  const imgHint    = panel.querySelector('.ap-img-hint');
  let imageData = null;  // base64 string (without data: prefix)
  let imageType = null;  // MIME type

  function loadImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const [, data] = ev.target.result.split(',');
      imageData = data;
      imageType = file.type;
      imgPreview.src = ev.target.result;
      imgPreview.style.display = 'block';
      imgClear.style.display   = 'inline-block';
      imgHint.style.display    = 'none';
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    imageData = null; imageType = null;
    imgPreview.style.display = 'none'; imgPreview.src = '';
    imgClear.style.display   = 'none';
    imgHint.style.display    = '';
    imgInput.value = '';
  }

  imgZone.addEventListener('click', e => {
    if (!e.target.closest('.ap-img-clear')) imgInput.click();
  });
  imgZone.addEventListener('dragover', e => { e.preventDefault(); imgZone.classList.add('dragover'); });
  imgZone.addEventListener('dragleave', () => imgZone.classList.remove('dragover'));
  imgZone.addEventListener('drop', e => {
    e.preventDefault(); imgZone.classList.remove('dragover');
    loadImageFile(e.dataTransfer.files[0]);
  });
  imgInput.addEventListener('change', () => loadImageFile(imgInput.files[0]));
  imgClear.addEventListener('click', e => { e.stopPropagation(); clearImage(); });

  panel.querySelector('.ap-cancel').addEventListener('click', () => {
    panel.classList.add('hidden');
  });

  panel.querySelector('.ap-submit').addEventListener('click', () => {
    if (!hasActiveKey()) { showModal(); return; }
    const text = panel.querySelector('.ap-text').value.trim();
    if (!text && !imageData) {
      panel.querySelector('.ap-text').focus();
      return;
    }
    evaluateAnswer(panel, task, label, text, imageData, imageType);
  });

  return panel;
}

const EVAL_SYSTEM_PROMPT = `Du bist ein erfahrener AP2-Prüfungsexperte für Fachinformatiker Anwendungsentwicklung (FIAE). Bewerte die eingereichte Schülerlösung sachlich und konstruktiv.

Dein Bewertungsformat (immer auf Deutsch):
Beginne mit einer klaren Einschätzung in der ersten Zeile:
✅ Richtig  ODER  ⚠️ Teilweise richtig  ODER  ❌ Falsch

Danach strukturiert:
**Was korrekt ist:** (falls vorhanden, sonst weglassen)
**Was fehlt oder falsch ist:** (konkret benennen)
**Tipp zur Verbesserung:** (einen konkreten Hinweis)

Spezifische Hinweise nach Aufgabentyp:
- UML/Aktivitätsdiagramm: Prüfe Startknoten, Endknoten, Aktionen, Entscheidungsknoten (Rauten), Zusammenführungen, Swimlanes und die logische Abfolge
- SQL: Prüfe Syntax, Tabellenauswahl, JOIN-Bedingungen, WHERE/HAVING, GROUP BY, Spaltenausgaben
- Pseudocode/Algorithmus: Prüfe Logik, Schleifen, Abbruchbedingungen, Variablen, Randwerte
- ERM/Relationales Modell: Prüfe Entitäten, Attribute, Kardinalitäten, Primär- und Fremdschlüssel

Sei präzise und lehrreich. Falls ein Bild eingereicht wurde, analysiere es genau.`;

async function evaluateAnswer(panel, task, label, textAnswer, imageData, imageType) {
  const feedback  = panel.querySelector('.ap-feedback');
  const submitBtn = panel.querySelector('.ap-submit');

  feedback.classList.remove('hidden');
  feedback.className = 'ap-feedback streaming';
  feedback.textContent = '';
  submitBtn.disabled = true;

  const taskContext = `Aufgabe ${task.num}${label ? ` aus „${label}"` : ''} (${task.points} Punkte):\n${task.content.slice(0, 1500)}`;
  const answerNote = textAnswer
    ? `\n\nMeine Lösung:\n${textAnswer}`
    : '\n\nMeine Lösung: (siehe eingefügtes Bild)';

  const evalPrompt = `${taskContext}${answerNote}\n\nBitte bewerte meine Lösung.`;

  try {
    let fullText = '';
    await streamAIForEvaluation(evalPrompt, imageData, imageType, chunk => {
      fullText += chunk;
      feedback.textContent = fullText;
    });
    feedback.className = 'ap-feedback';
    feedback.innerHTML = formatFeedback(fullText);
  } catch (e) {
    feedback.className = 'ap-feedback';
    feedback.innerHTML = `<span style="color:var(--red)">❌ Fehler: ${esc(e.message)}</span>`;
    if (e.message.includes('API-Key')) showModal();
  }

  submitBtn.disabled = false;
}

function formatFeedback(text) {
  let html = esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(✅[^\n<]*)/g, '<span class="fb-ok">$1</span>')
    .replace(/(⚠️[^\n<]*)/g, '<span class="fb-warn">$1</span>')
    .replace(/(❌[^\n<]*)/g, '<span class="fb-err">$1</span>')
    .replace(/\n\n+/g, '</p><p class="fb-p">')
    .replace(/\n/g, '<br>');
  return `<p class="fb-p">${html}</p>`;
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
  if (!claudeKey) throw new Error('Kein Claude API-Key. Bitte unter ⚙ einrichten.');

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
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
    if (res.status === 401) throw new Error('Ungültiger Claude API-Key. Bitte prüfen.');
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

async function openaiStream(messages, onChunk, system = SYSTEM_PROMPT) {
  if (!openaiKey) throw new Error('Kein ChatGPT API-Key. Bitte unter ⚙ einrichten.');

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error('Ungültiger ChatGPT API-Key. Bitte prüfen.');
    throw new Error(msg);
  }

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
        const delta = event?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') onChunk(delta);
      } catch {}
    }
  }
}

async function streamAI(messages, onChunk, system = SYSTEM_PROMPT) {
  if (aiProvider === 'openai') return openaiStream(messages, onChunk, system);
  return claudeStream(messages, onChunk, system);
}

async function streamAIForEvaluation(prompt, imageData, imageType, onChunk) {
  if (aiProvider === 'openai') {
    const content = [{ type: 'text', text: prompt }];
    if (imageData && imageType) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${imageType};base64,${imageData}` },
      });
    }
    return openaiStream([{ role: 'user', content }], onChunk, EVAL_SYSTEM_PROMPT);
  }

  const content = imageData && imageType
    ? [
        { type: 'image', source: { type: 'base64', media_type: imageType, data: imageData } },
        { type: 'text', text: prompt },
      ]
    : prompt;
  return claudeStream([{ role: 'user', content }], onChunk, EVAL_SYSTEM_PROMPT);
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

  if (!hasActiveKey()) {
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
    await streamAI(
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
      if (topic.keywords.some(kw => task.content.toLowerCase().includes(kw.toLowerCase())))
        count++;
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
  $('apiKeyClaude').value = claudeKey;
  $('apiKeyOpenAI').value = openaiKey;
  const radio = document.querySelector(`input[name="apiProvider"][value="${aiProvider}"]`);
  if (radio) radio.checked = true;
  updateKeyStatus();
  $('overlay').classList.remove('hidden');
}

function updateKeyStatus() {
  const ks = $('keyStatus');
  if (hasActiveKey()) {
    ks.textContent = `KI aktiv: ${getProviderLabel()}`;
    ks.className = 'key-status ok';
  } else {
    ks.textContent = `Kein aktiver API-Key für ${getProviderLabel()}`;
    ks.className = 'key-status err';
  }
}

function updateKeyBtn() {
  const btn = $('btnSettings');
  if (hasActiveKey()) {
    btn.textContent = `✓ KI aktiv (${aiProvider === 'openai' ? 'ChatGPT' : 'Claude'})`;
    btn.classList.add('active');
  } else {
    btn.textContent = '⚙ API-Key einrichten';
    btn.classList.remove('active');
  }
  // Sync sidebar KI indicator
  const dot    = $('sbKiDot');
  const status = $('sbKiStatus');
  if (dot)    dot.className    = hasActiveKey() ? 'sb-ki-dot active' : 'sb-ki-dot';
  if (status) status.textContent = hasActiveKey()
    ? `${getProviderLabel()} aktiv – klicken zum öffnen`
    : `Kein API-Key für ${getProviderLabel()} – klicken zum einrichten`;
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

  // Sidebar KI entry
  $('sbKi').addEventListener('click', () => {
    if (!hasActiveKey()) { showModal(); return; }
    // Unminimize chat if needed, then focus input
    if (chatMin) toggleChat();
    $('chatInput').focus();
  });

  // Settings
  $('btnSettings').addEventListener('click', showModal);
  $('modalClose').addEventListener('click', () => $('overlay').classList.add('hidden'));
  $('overlay').addEventListener('click', e => { if (e.target === $('overlay')) $('overlay').classList.add('hidden'); });
  $('btnSaveKey').addEventListener('click', () => {
    claudeKey = $('apiKeyClaude').value.trim();
    openaiKey = $('apiKeyOpenAI').value.trim();
    aiProvider = document.querySelector('input[name="apiProvider"]:checked')?.value || 'claude';

    if (!hasActiveKey()) {
      updateKeyStatus();
      return;
    }

    localStorage.setItem('ap2_claude_key', claudeKey);
    localStorage.setItem('ap2_openai_key', openaiKey);
    localStorage.setItem('ap2_provider', aiProvider);
    localStorage.removeItem('ap2_key');
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

// ── DB Table detection helpers ────────────────────────────────────────────
/** Returns true if a line looks like a database column name */
function looksLikeColumnName(line) {
  if (!line) return false;
  const t = line.trim();
  if (!t || t.length > 50) return false;
  if (/\s/.test(t)) return false;           // no spaces
  if (/^\d/.test(t)) return false;          // doesn't start with digit
  if (t.includes('_')) return true;         // e.g. Kd_IdKey, MID_Sol
  if (t.includes('/')) return true;         // e.g. Datum/Uhrzeit
  if (/^[A-Z]{2,6}[a-z]{0,2}$/.test(t)) return true; // PID, OID, UTNr, PDNr
  if (/^[A-ZÜÄÖ][a-züäöA-ZÜÄÖ0-9]{1,20}$/.test(t)) return true; // Datum, Patient
  return false;
}

/** Returns true if a line is a strong primary-key / ID column indicator */
function looksLikeTableStartColumn(line) {
  if (!line) return false;
  const t = line.trim();
  if (/^\d/.test(t)) return false;
  if (t.includes('_')) return true;                    // Kd_IdKey, WA_IdKey
  if (t.includes('/')) return true;                    // Datum/Uhrzeit
  if (/^[A-Z]{2,5}[a-z]{0,2}$/.test(t)) return true; // PID, OID, UTNr, MID
  return false;
}

/** Returns true when a line signals the end of table data */
function isTableEndLine(line) {
  if (!line) return false;
  const t = line.trim();
  if (!t) return false;
  if (/^[a-z]\)$/.test(t)) return true;
  if (/^[a-z]{2,3}\)\s/.test(t)) return true;
  if (/^Hinweis:/i.test(t)) return true;
  if (/^Fortsetzung/i.test(t)) return true;
  if (/^L.{1,4}sung/i.test(t)) return true;
  if (t.length > 65) return true; // long sentence = not a data cell
  return false;
}

/**
 * Try to parse a DB table starting at lines[start].
 * Returns { tableName, headers, rows, hadEllipsis, endIndex } or null.
 */
function tryParseTable(lines, start) {
  let i = start;
  let tableName = '';
  const t0 = lines[i] ? lines[i].trim() : '';

  // Case 1: explicit "Tabelle: X" marker
  const tabMatch = t0.match(/^Tabelle:\s*(.+)$/);
  if (tabMatch) {
    tableName = tabMatch[1].trim();
    i++;
  }
  // Case 2: standalone word + next line is a strong column ID (e.g. "Pflegearbeit" + "PID")
  else if (/^[A-ZÜÄÖ][a-züäöA-ZÜÄÖ0-9]+$/.test(t0) && t0.length <= 25) {
    const nextT = lines[i + 1] ? lines[i + 1].trim() : '';
    if (looksLikeTableStartColumn(nextT)) {
      tableName = t0;
      i++;
    } else {
      return null;
    }
  }
  // Case 3: anonymous table – starts directly with a strong column indicator
  else if (looksLikeTableStartColumn(t0)) {
    tableName = '';
    // i stays at start
  } else {
    return null;
  }

  // Collect header columns (stop at first digit-starting line)
  const headers = [];
  while (i < lines.length && headers.length < 15) {
    const l = lines[i].trim();
    if (!l) { i++; continue; }
    if (/^\d/.test(l)) break;
    if (!looksLikeColumnName(l)) break;
    headers.push(l);
    i++;
  }

  if (headers.length < 2) return null;
  if (!headers.some(h => looksLikeTableStartColumn(h))) return null;

  const N = headers.length;

  // Collect data rows (groups of exactly N lines; rows always start with a digit PK)
  const rows = [];
  while (i < lines.length) {
    const firstCell = lines[i] ? lines[i].trim() : '';
    if (!firstCell) { i++; break; }
    if (isTableEndLine(firstCell)) break;
    if (!/^\d/.test(firstCell)) break; // data rows start with numeric PK

    const row = [];
    let j = i;
    for (let c = 0; c < N; c++) {
      if (j >= lines.length) break;
      const cell = lines[j].trim();
      if (isTableEndLine(cell)) break;
      row.push(cell);
      j++;
    }

    if (row.length === N) {
      rows.push(row);
      i = j;
    } else {
      break;
    }
  }

  // Consume trailing "…" (ellipsis = more rows exist)
  let hadEllipsis = false;
  if (i < lines.length && lines[i].trim() === '\u2026') {
    hadEllipsis = true;
    i++;
  }

  if (rows.length === 0) return null;
  return { tableName, headers, rows, hadEllipsis, endIndex: i };
}

/** Render a parsed DB table as styled HTML */
function renderDbTable(t) {
  let html = '<div class="db-table-wrap">';
  if (t.tableName) html += `<div class="db-table-name">${esc(t.tableName)}</div>`;
  html += '<div class="db-table-scroll"><table class="db-table"><thead><tr>';
  for (const h of t.headers) html += `<th>${esc(h)}</th>`;
  html += '</tr></thead><tbody>';
  for (const row of t.rows) {
    html += '<tr>';
    for (const cell of row) html += `<td>${esc(cell)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  if (t.hadEllipsis) html += '<div class="db-table-more">… weitere Einträge</div>';
  html += '</div>';
  return html;
}

// ── Task content formatter ────────────────────────────────────────────────
/**
 * Wandelt rohen Aufgaben-Text in strukturiertes HTML um.
 * Erkennt: DB-Tabellen, Hauptfragen (a)/b)/c)), Unterfragen (aa)/ab)),
 * Punkte-Badges, Aufzählungen (-), Abschnittsüberschriften (Wort:).
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

    // ── DB Table detection ────────────────────────────────────────────
    {
      const nextLine = i < lines.length ? lines[i].trim() : '';
      const shouldTryTable =
        /^Tabelle:\s/.test(line) ||
        (/^[A-ZÜÄÖ][a-züäöA-ZÜÄÖ0-9]+$/.test(line) && line.length <= 25 &&
          looksLikeTableStartColumn(nextLine)) ||
        (looksLikeTableStartColumn(line) && looksLikeColumnName(nextLine));

      if (shouldTryTable) {
        const tableResult = tryParseTable(lines, i - 1);
        if (tableResult) {
          flushBullets(bullets);
          out.push(renderDbTable(tableResult));
          i = tableResult.endIndex;
          continue;
        }
      }
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
