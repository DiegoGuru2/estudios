// =====================================================================
//  features.js — Funciones avanzadas de aprendizaje
//  Repaso espaciado · Opciones barajadas · Preguntas extra · Puntos débiles
//  Examen cronometrado · Glosario · Comparativas · Apuntes · Audio
//  Copia de seguridad · Impresión
// =====================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const SRS_INTERVALS = [1, 3, 7, 14, 30]; // días tras cada acierto consecutivo
const LETTERS = ["A", "B", "C", "D"];

// ---------- Estado extendido ----------
state.srs = {};          // { qid: {box, due, fails, last} }
state.notes = {};        // { topicKey: "texto" }
state.audioPos = {};     // { topicKey: { seg: 0, charOffset: 0 } }
state.settings = { shuffle: true, ttsRate: 1, theme: "dark" };
state.shuffleCache = {}; // { qid: ["C","A","D","B"] } (solo sesión)
state.review = null;
state.glossaryFilter = "all";

loadState = function () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    state.completedTopics = s.completedTopics || {};
    state.userAnswers = s.userAnswers || {};
    state.testMode = s.testMode || "instant";
    state.examSubmitted = s.examSubmitted || {};
    state.srs = s.srs || {};
    state.notes = s.notes || {};
    state.audioPos = s.audioPos || {};
    state.settings = Object.assign({ shuffle: true, ttsRate: 1, theme: "dark" }, s.settings || {});
    if (s.view && s.view !== "search" && s.view !== "review") state.view = s.view;
    if (s.activeTopicKey) state.activeTopicKey = s.activeTopicKey;
    if (s.openSubjects) state.openSubjects = Object.assign(state.openSubjects, s.openSubjects);
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.setAttribute("data-theme", state.settings.theme || "dark");
    }
  } catch (e) {
    console.warn("No se pudo cargar el progreso:", e);
  }
};

function progressPayload() {
  return {
    view: state.view,
    activeTopicKey: state.activeTopicKey,
    openSubjects: state.openSubjects,
    completedTopics: state.completedTopics,
    userAnswers: state.userAnswers,
    testMode: state.testMode,
    examSubmitted: state.examSubmitted,
    srs: state.srs,
    notes: state.notes,
    audioPos: state.audioPos,
    settings: state.settings
  };
}

toggleTheme = function () {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme") || state.settings.theme || "dark";
  const next = current === "light" ? "dark" : "light";
  root.setAttribute("data-theme", next);
  state.settings.theme = next;
  saveState();
};

const _selectTopicBase = selectTopic;
selectTopic = function (topicKey, tab = null) {
  _selectTopicBase(topicKey, tab);
  saveState();
};

const _navigateDashboardBase = navigateDashboard;
navigateDashboard = function () {
  _navigateDashboardBase();
  saveState();
};

const _toggleSubjectBase = toggleSubject;
toggleSubject = function (subjId) {
  _toggleSubjectBase(subjId);
  saveState();
};

saveState = function () {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progressPayload()));
  } catch (e) {
    console.warn("No se pudo guardar el progreso:", e);
  }
};

// ---------- Índice de preguntas ----------
let QINDEX = null;
function qIndex() {
  if (QINDEX) return QINDEX;
  QINDEX = {};
  for (const subj of window.STUDY_DATA.subjects) {
    for (const topic of subj.topics) {
      for (const q of topic.questions) {
        QINDEX[`${topic.key}:${q.num}`] = { subj, topic, q, extra: false };
      }
      for (const q of topic.extra_questions || []) {
        QINDEX[`${topic.key}:${q.num}`] = { subj, topic, q, extra: true };
      }
    }
  }
  return QINDEX;
}

function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// No se barajan las preguntas cuyas opciones dependen de la posición ("Todas las anteriores", "A y B"...)
function canShuffle(q) {
  if (q.type === "tf") return false;
  return !Object.values(q.options).some((v) =>
    /anteriores|ninguna de las|todas las|ambas|\b[A-D]\s*(y|e|o)\s*[A-D]\b|respuestas?\s+[A-D]\b/i.test(v)
  );
}

function getOrder(qid, q) {
  const letters = Object.keys(q.options).sort();
  if (!state.settings.shuffle || !canShuffle(q)) return letters;
  if (!state.shuffleCache[qid]) state.shuffleCache[qid] = shuffleArr(letters);
  return state.shuffleCache[qid];
}

function toggleShuffle() {
  state.settings.shuffle = !state.settings.shuffle;
  state.shuffleCache = {};
  saveState();
  renderMain();
}

// ---------- Repaso espaciado ----------
function srsUpdate(qid, correct) {
  const now = Date.now();
  const r = state.srs[qid];
  if (!correct) {
    state.srs[qid] = { box: 0, due: now, fails: ((r && r.fails) || 0) + 1, last: now };
  } else if (r) {
    r.box = Math.min(r.box + 1, SRS_INTERVALS.length);
    r.due = now + SRS_INTERVALS[r.box - 1] * DAY_MS;
    r.last = now;
  }
}

function srsDue() {
  const now = Date.now();
  const idx = qIndex();
  return Object.keys(state.srs).filter((qid) => idx[qid] && state.srs[qid].due <= now);
}

function srsStats() {
  let learning = 0, mastered = 0;
  for (const r of Object.values(state.srs)) {
    if (r.box >= 4) mastered++;
    else learning++;
  }
  return { due: srsDue().length, learning, mastered };
}

// ---------- Puntuación (solo preguntas oficiales) ----------
getTopicScore = function (topic) {
  const m = state.userAnswers[topic.key] || {};
  let answered = 0, correct = 0;
  for (const q of topic.questions) {
    if (m[q.num]) {
      answered++;
      if (m[q.num] === q.correct) correct++;
    }
  }
  return answered ? { answered, total: topic.questions.length, correct } : null;
};

function getExtraScore(topic) {
  const m = state.userAnswers[topic.key] || {};
  const ex = topic.extra_questions || [];
  let answered = 0, correct = 0;
  for (const q of ex) {
    if (m[q.num]) {
      answered++;
      if (m[q.num] === q.correct) correct++;
    }
  }
  return { answered, correct, total: ex.length };
}

// ---------- Tarjeta de pregunta reutilizable ----------
function questionCard(o) {
  const q = o.q;
  const order = getOrder(o.qid, q);
  const chosen = o.chosen;
  const reveal = o.reveal && chosen;
  const ok = chosen === q.correct;
  let cls = "question-card";
  if (reveal) cls += ok ? " answered-correct" : " answered-wrong";

  const typeBadge =
    q.type === "tf" ? `<span class="q-type">Verdadero / Falso</span>` :
    q.type === "case" ? `<span class="q-type case">Caso práctico</span>` : "";

  const buttons = order
    .map((L, i) => {
      let b = "option-btn";
      if (reveal) {
        if (L === q.correct) b += " correct";
        else if (L === chosen) b += " wrong";
      } else if (chosen === L) b += " selected-exam";
      return `
        <button class="${b}" ${o.locked ? "disabled" : ""} onclick="${o.onPick(L)}">
          <span class="opt-letter">${LETTERS[i]}</span>
          <span>${escapeHtml(q.options[L])}</span>
        </button>`;
    })
    .join("");

  let feedback = "";
  if (reveal) {
    const corrLabel = LETTERS[order.indexOf(q.correct)];
    const chosenLabel = LETTERS[order.indexOf(chosen)];
    feedback = `
      <div class="q-feedback ${ok ? "ok" : "ko"}">
        <strong>${ok ? `✅ ¡Correcto! (${corrLabel})` : `❌ Incorrecto: marcaste ${chosenLabel}, la correcta es ${corrLabel}`}</strong><br/>
        <span style="color:var(--text-secondary)"><strong>Explicación:</strong> ${escapeHtml(q.explanation || "")}</span>
      </div>`;
  }

  return `
    <div class="${cls}">
      ${o.header || ""}
      <div class="q-header">
        <span class="q-num-badge">${o.label}</span>
        <div class="q-title">${typeBadge}${escapeHtml(q.question)}</div>
      </div>
      <div class="options-list">${buttons}</div>
      ${feedback}
    </div>`;
}

// ---------- Test del tema (oficiales + extra) ----------
renderTestTab = function (topic) {
  const ansMap = state.userAnswers[topic.key] || {};
  const isExam = state.testMode === "exam";
  const submitted = !!state.examSubmitted[topic.key];
  const reveal = !isExam || submitted;
  const sc = getTopicScore(topic);

  let banner;
  if (sc && reveal) {
    const grade = ((sc.correct / sc.total) * 10).toFixed(1);
    const c = sc.correct >= 8 ? "var(--accent-emerald)" : sc.correct >= 5 ? "var(--accent-amber)" : "var(--accent-rose)";
    banner = `<span style="font-weight:700;">Oficiales: ${sc.answered}/${sc.total} · Aciertos <span style="color:${c}">${sc.correct}</span> · Nota <span style="color:${c}">${grade}/10</span></span>`;
  } else {
    banner = `<span style="font-size:0.88rem; color:var(--text-secondary);">${isExam ? "Responde todas y pulsa «Calificar»." : "Al responder verás al instante si acertaste."}</span>`;
  }

  const pick = (num) => (L) => `answerQuestion('${topic.key}','${num}','${L}')`;

  let html = `
    <div class="test-toolbar">
      <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
        <div class="mode-switch">
          <button class="${!isExam ? "active" : ""}" onclick="setTestMode('instant')">⚡ Corrección instantánea</button>
          <button class="${isExam ? "active" : ""}" onclick="setTestMode('exam')">🎓 Modo examen</button>
        </div>
        <button class="btn" onclick="toggleShuffle()" title="Cambia el orden de las opciones para no memorizar la letra">
          🔀 Barajar opciones: <strong>${state.settings.shuffle ? "Sí" : "No"}</strong>
        </button>
        ${banner}
      </div>
      <div style="display:flex; gap:0.5rem;">
        ${isExam && !submitted ? `<button class="btn btn-primary" onclick="submitTopicExam('${topic.key}')">✅ Calificar</button>` : ""}
        <button class="btn" onclick="resetTopicTest('${topic.key}')">🔄 Repetir test</button>
      </div>
    </div>
    <h4 class="flow-sub">📄 Preguntas oficiales del PDF (${topic.questions.length})</h4>
  `;

  html += topic.questions
    .map((q) =>
      questionCard({
        qid: `${topic.key}:${q.num}`,
        q,
        label: `P${q.num}`,
        chosen: ansMap[q.num],
        reveal,
        locked: !isExam && !!ansMap[q.num],
        onPick: pick(q.num)
      })
    )
    .join("");

  const extras = topic.extra_questions || [];
  if (extras.length) {
    const es = getExtraScore(topic);
    html += `
      <h4 class="flow-sub" style="margin-top:2rem;">➕ Preguntas extra de práctica (${extras.length})
        <span style="font-size:0.82rem; color:var(--text-muted); font-weight:600;">
          — verdadero/falso, casos prácticos y más · ${es.answered ? `${es.correct}/${es.answered} aciertos` : "no cuentan para la nota del tema"}
        </span>
      </h4>`;
    html += extras
      .map((q, i) =>
        questionCard({
          qid: `${topic.key}:${q.num}`,
          q,
          label: `E${i + 1}`,
          chosen: ansMap[q.num],
          reveal,
          locked: !isExam && !!ansMap[q.num],
          onPick: pick(q.num)
        })
      )
      .join("");
  }
  return html;
};

answerQuestion = function (topicKey, qNum, letter) {
  const entry = qIndex()[`${topicKey}:${qNum}`];
  if (!entry) return;
  const map = (state.userAnswers[topicKey] = state.userAnswers[topicKey] || {});
  const isExam = state.testMode === "exam";
  if (!isExam && map[qNum]) return; // en modo instantáneo la respuesta queda fijada
  if (isExam && state.examSubmitted[topicKey]) return;
  map[qNum] = letter;
  if (!isExam) srsUpdate(`${topicKey}:${qNum}`, letter === entry.q.correct);

  const t = entry.topic;
  if (t.questions.every((q) => map[q.num])) state.completedTopics[topicKey] = true;
  saveState();
  renderSidebar();
  renderMain();
};

submitTopicExam = function (topicKey) {
  const found = findTopic(topicKey);
  if (!found) return;
  const map = state.userAnswers[topicKey] || {};
  const all = found.topic.questions.concat(found.topic.extra_questions || []);
  for (const q of all) {
    if (map[q.num]) srsUpdate(`${topicKey}:${q.num}`, map[q.num] === q.correct);
  }
  state.examSubmitted[topicKey] = true;
  saveState();
  renderSidebar();
  renderMain();
};

resetTopicTest = function (topicKey) {
  delete state.userAnswers[topicKey];
  delete state.examSubmitted[topicKey];
  for (const k of Object.keys(state.shuffleCache)) if (k.startsWith(topicKey + ":")) delete state.shuffleCache[k];
  saveState();
  renderSidebar();
  renderMain();
};

// ---------- Vista: Repaso de hoy ----------
function startReview() {
  const queue = shuffleArr(srsDue());
  state.review = { queue, pos: 0, chosen: null, ok: 0, ko: 0 };
  state.view = "review";
  renderAll();
  window.scrollTo({ top: 0 });
}

function answerReview(letter) {
  const r = state.review;
  if (!r || r.chosen) return;
  const qid = r.queue[r.pos];
  const entry = qIndex()[qid];
  r.chosen = letter;
  const ok = letter === entry.q.correct;
  srsUpdate(qid, ok);
  if (ok) r.ok++;
  else {
    r.ko++;
    r.queue.push(qid); // vuelve a salir al final de la sesión
  }
  saveState();
  renderSidebar();
  renderMain();
}

function nextReview() {
  const r = state.review;
  r.pos++;
  r.chosen = null;
  renderMain();
}

function renderReviewView() {
  const st = srsStats();
  const r = state.review;
  let html = `
    <div class="hero-banner">
      <div>
        <h2>🔁 Repaso de hoy</h2>
        <p>Aquí vuelven las preguntas que fallaste. Cada vez que aciertas una, se aleja en el tiempo (1, 3, 7, 14 y 30 días). Si la fallas, vuelve a empezar. Así se fija en la memoria a largo plazo.</p>
      </div>
      <div class="kpi-grid" style="margin:0; min-width:300px;">
        <div class="kpi-card"><span class="kpi-val" style="color:var(--accent-amber)">${st.due}</span><span class="kpi-label">Pendientes hoy</span></div>
        <div class="kpi-card"><span class="kpi-val">${st.learning}</span><span class="kpi-label">En aprendizaje</span></div>
        <div class="kpi-card"><span class="kpi-val" style="color:var(--accent-emerald)">${st.mastered}</span><span class="kpi-label">Dominadas</span></div>
      </div>
    </div>`;

  if (!r || r.pos >= r.queue.length) {
    if (r && r.queue.length) {
      html += `<div class="flow-finish ok"><div><h3>🎉 ¡Repaso completado!</h3><p>Aciertos: <strong>${r.ok}</strong> · Fallos: <strong>${r.ko}</strong>. Las preguntas acertadas volverán más adelante.</p></div>
        <button class="btn btn-primary" onclick="navigateDashboard()">Volver al inicio</button></div>`;
    } else if (st.due === 0) {
      html += `<div class="flow-finish ok"><div><h3>✅ No tienes nada pendiente hoy</h3>
        <p>${Object.keys(state.srs).length ? "Vuelve mañana: las preguntas aparecerán cuando toque repasarlas." : "Cuando falles preguntas en los tests, aparecerán aquí para repasarlas."}</p></div>
        <button class="btn btn-primary" onclick="navigateDashboard()">Seguir estudiando</button></div>`;
    } else {
      html += `<div class="flow-finish"><div><h3>Tienes ${st.due} preguntas para repasar</h3><p>Te llevará unos ${Math.max(1, Math.round(st.due * 0.5))} minutos.</p></div>
        <button class="btn btn-primary" onclick="startReview()">▶ Empezar repaso</button></div>`;
    }
    return html;
  }

  const qid = r.queue[r.pos];
  const e = qIndex()[qid];
  html += `
    <div class="test-toolbar">
      <span><strong>Pregunta ${r.pos + 1} de ${r.queue.length}</strong> · ✅ ${r.ok} · ❌ ${r.ko}</span>
      <div class="progress-bar-bg" style="max-width:300px;"><div class="progress-bar-fill" style="width:${(r.pos / r.queue.length) * 100}%"></div></div>
      <button class="btn" onclick="state.review=null; renderMain();">⏹ Terminar</button>
    </div>`;
  html += questionCard({
    qid,
    q: e.q,
    label: "?",
    chosen: r.chosen,
    reveal: true,
    locked: !!r.chosen,
    onPick: (L) => `answerReview('${L}')`,
    header: `<div class="q-origin">${escapeHtml(e.subj.name)} · Tema ${e.topic.num}${e.extra ? " · extra" : ""}
      <span>Fallada ${state.srs[qid] ? state.srs[qid].fails : 1} vez/veces</span></div>`
  });
  if (r.chosen) {
    html += `<div style="display:flex; justify-content:flex-end; gap:0.5rem;">
      <button class="btn" onclick="selectTopic('${e.topic.key}')">📖 Ver el tema</button>
      <button class="btn btn-primary" onclick="nextReview()">Siguiente →</button></div>`;
  }
  return html;
}

// ---------- Vista: Puntos débiles ----------
function renderWeakView() {
  const idx = qIndex();
  const subjRows = [];
  const topicRows = [];
  for (const subj of window.STUDY_DATA.subjects) {
    let a = 0, c = 0, started = 0;
    for (const t of subj.topics) {
      const sc = getTopicScore(t);
      if (sc) {
        a += sc.answered;
        c += sc.correct;
        started++;
        topicRows.push({ subj, t, sc, pct: sc.correct / sc.answered });
      }
    }
    subjRows.push({ subj, a, c, started });
  }
  topicRows.sort((x, y) => x.pct - y.pct);
  const failed = Object.entries(state.srs)
    .filter(([qid]) => idx[qid])
    .sort((x, y) => y[1].fails - x[1].fails || x[1].box - y[1].box)
    .slice(0, 15);
  const st = srsStats();

  let html = `
    <div class="hero-banner">
      <div><h2>📊 Mis puntos débiles</h2>
      <p>Aquí ves en qué materias y temas fallas más y qué preguntas se te resisten, para que sepas exactamente qué repasar.</p></div>
      <button class="btn btn-primary" onclick="startReview()" ${st.due ? "" : "disabled"}>🔁 Repasar fallos ahora (${st.due})</button>
    </div>
    <h3 class="flow-sub">Rendimiento por materia</h3>
    <div class="weak-subjects">`;
  for (const r of subjRows) {
    const pct = r.a ? Math.round((r.c / r.a) * 100) : 0;
    const col = !r.a ? "var(--text-muted)" : pct >= 70 ? "var(--accent-emerald)" : pct >= 50 ? "var(--accent-amber)" : "var(--accent-rose)";
    html += `
      <div class="weak-row">
        <span>${SUBJECT_ICONS[r.subj.id]} ${escapeHtml(r.subj.name)}</span>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%; background:${col}"></div></div>
        <strong style="color:${col}">${r.a ? pct + "%" : "—"}</strong>
        <span class="weak-meta">${r.started}/10 temas hechos</span>
      </div>`;
  }
  html += `</div><h3 class="flow-sub">Temas que más te cuestan</h3>`;
  if (!topicRows.length) {
    html += `<p style="color:var(--text-muted)">Aún no has hecho ningún test. Empieza por el primer tema de cualquier materia.</p>`;
  } else {
    html += `<div class="key-points-grid">`;
    for (const r of topicRows.slice(0, 9)) {
      const col = r.pct >= 0.7 ? "var(--accent-emerald)" : r.pct >= 0.5 ? "var(--accent-amber)" : "var(--accent-rose)";
      html += `
        <div class="key-point-card" style="border-top-color:${col}; cursor:pointer" onclick="selectTopic('${r.t.key}')">
          <span style="font-size:0.72rem; color:var(--text-muted)">${escapeHtml(r.subj.name)}</span>
          <h4>${escapeHtml(r.t.title)}</h4>
          <p><strong style="color:${col}">${r.sc.correct}/${r.sc.answered}</strong> aciertos · clic para repasar</p>
        </div>`;
    }
    html += `</div>`;
  }
  html += `<h3 class="flow-sub">Preguntas que más fallas</h3>`;
  if (!failed.length) {
    html += `<p style="color:var(--text-muted)">Todavía no hay preguntas falladas registradas. 👏</p>`;
  } else {
    for (const [qid, r] of failed) {
      const e = idx[qid];
      html += `
        <div class="section-card" style="padding:1rem 1.25rem; margin-bottom:0.75rem;">
          <div class="q-origin">${escapeHtml(e.subj.name)} · Tema ${e.topic.num}
            <span>❌ ${r.fails} fallo(s) · ${r.box >= 4 ? "dominada" : r.box > 0 ? "mejorando" : "pendiente"}</span></div>
          <p style="color:var(--text-primary); font-weight:600; margin-bottom:0.35rem;">${escapeHtml(e.q.question)}</p>
          <p style="font-size:0.85rem; color:var(--accent-emerald); margin:0;">✅ ${escapeHtml(e.q.options[e.q.correct])}</p>
        </div>`;
    }
  }
  return html;
}

// ---------- Simulacro (con cronómetro y preguntas extra) ----------
let simTimer = null;
Object.assign(state.simulacro, { includeExtra: false, minutesPerQ: 0, endAt: null, startAt: null, qids: [] });

generateSimulacroQuestions = function () {
  const sim = state.simulacro;
  const idx = qIndex();
  let pool = Object.keys(idx).filter((qid) => {
    const e = idx[qid];
    if (sim.subjectId !== "all" && e.subj.id !== sim.subjectId) return false;
    if (e.extra && !sim.includeExtra) return false;
    if (sim.onlyWrong) return !!state.srs[qid] && state.srs[qid].box < 4;
    return true;
  });
  sim.qids = shuffleArr(pool).slice(0, sim.count);
  sim.questions = sim.qids; // compatibilidad
  sim.answers = {};
  sim.submitted = false;
  sim.startAt = Date.now();
  sim.endAt = sim.minutesPerQ ? Date.now() + sim.qids.length * sim.minutesPerQ * 60000 : null;
  startSimTimer();
};

updateSimulacroConfig = function (field, value) {
  if (field === "count") value = parseInt(value, 10);
  if (field === "minutesPerQ") value = parseFloat(value);
  if (field === "onlyWrong" || field === "includeExtra") value = value === "true" || value === true;
  state.simulacro[field] = value;
  generateSimulacroQuestions();
  renderMain();
};

function startSimTimer() {
  clearInterval(simTimer);
  if (!state.simulacro.endAt) return;
  simTimer = setInterval(() => {
    const sim = state.simulacro;
    const left = sim.endAt - Date.now();
    const el = document.getElementById("sim-timer");
    if (el) {
      const m = Math.max(0, Math.floor(left / 60000));
      const s = Math.max(0, Math.floor((left % 60000) / 1000));
      el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      el.classList.toggle("urgent", left < 60000);
    }
    if (left <= 0) {
      submitSimulacro(true);
    }
  }, 1000);
}

function recordSimAnswer(qid, letter) {
  const e = qIndex()[qid];
  srsUpdate(qid, letter === e.q.correct);
  const map = (state.userAnswers[e.topic.key] = state.userAnswers[e.topic.key] || {});
  map[e.q.num] = letter;
  if (e.topic.questions.every((q) => map[q.num])) state.completedTopics[e.topic.key] = true;
}

answerSimulacro = function (i, letter) {
  const sim = state.simulacro;
  if (sim.submitted) return;
  if (sim.endAt) {
    sim.answers[i] = letter; // examen: sin corrección hasta entregar
  } else {
    if (sim.answers[i]) return;
    sim.answers[i] = letter;
    recordSimAnswer(sim.qids[i], letter);
    saveState();
    renderSidebar();
  }
  renderMain();
};

function submitSimulacro(auto) {
  const sim = state.simulacro;
  if (sim.submitted) return;
  sim.submitted = true;
  clearInterval(simTimer);
  if (sim.endAt) {
    sim.qids.forEach((qid, i) => sim.answers[i] && recordSimAnswer(qid, sim.answers[i]));
    saveState();
    renderSidebar();
  }
  sim.finishedAt = Date.now();
  if (auto) alert("⏰ ¡Se acabó el tiempo! El examen se ha entregado automáticamente.");
  if (state.view === "simulacro") {
    renderMain();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

renderSimulacroView = function () {
  const sim = state.simulacro;
  const idx = qIndex();
  if (!sim.qids || !sim.qids.length) {
    if (!sim._generated) {
      sim._generated = true;
      generateSimulacroQuestions();
    }
  }
  const timed = !!sim.endAt;
  const reveal = !timed || sim.submitted;
  let correct = 0, answered = 0;
  sim.qids.forEach((qid, i) => {
    if (sim.answers[i]) {
      answered++;
      if (sim.answers[i] === idx[qid].q.correct) correct++;
    }
  });
  const grade = sim.qids.length ? ((correct / sim.qids.length) * 10).toFixed(1) : "0.0";
  const opt = (v, cur, label) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${label}</option>`;

  let html = `
    <div class="topic-header-card">
      <h2 class="topic-title-main" style="margin-bottom:0.5rem;">🎯 Simulacro de examen</h2>
      <p style="color:var(--text-secondary); margin-bottom:1.25rem;">Mezcla preguntas al azar. Con cronómetro, funciona como el examen real: no ves la corrección hasta entregar.</p>
      <div class="sim-config">
        <label>Materia
          <select class="btn" onchange="updateSimulacroConfig('subjectId', this.value)">
            ${opt("all", sim.subjectId, "🌐 Todas las materias")}
            ${window.STUDY_DATA.subjects.map((s) => opt(s.id, sim.subjectId, escapeHtml(s.name))).join("")}
          </select></label>
        <label>Nº de preguntas
          <select class="btn" onchange="updateSimulacroConfig('count', this.value)">
            ${[10, 20, 30, 40, 50].map((n) => opt(n, sim.count, n + " preguntas")).join("")}
          </select></label>
        <label>Tiempo
          <select class="btn" onchange="updateSimulacroConfig('minutesPerQ', this.value)">
            ${opt(0, sim.minutesPerQ, "Sin tiempo (corrección al momento)")}
            ${opt(1, sim.minutesPerQ, "⏱ Cronometrado: 1 min/pregunta")}
            ${opt(1.5, sim.minutesPerQ, "⏱ Cronometrado: 1,5 min/pregunta")}
            ${opt(0.75, sim.minutesPerQ, "⏱ Exigente: 45 s/pregunta")}
          </select></label>
        <label>Preguntas
          <select class="btn" onchange="updateSimulacroConfig('includeExtra', this.value)">
            ${opt(false, sim.includeExtra, "Solo oficiales del PDF")}
            ${opt(true, sim.includeExtra, "Oficiales + extra")}
          </select></label>
        <label>Filtro
          <select class="btn" onchange="updateSimulacroConfig('onlyWrong', this.value)">
            ${opt(false, sim.onlyWrong, "Todas")}
            ${opt(true, sim.onlyWrong, "Solo las que he fallado")}
          </select></label>
        <button class="btn btn-primary" onclick="generateSimulacroQuestions(); renderMain();">🎲 Nuevo examen</button>
      </div>
    </div>`;

  if (!sim.qids.length) {
    return html + `<div class="section-card" style="text-align:center; padding:3rem;"><h3>No hay preguntas con este filtro</h3><p>Cambia el filtro a «Todas».</p></div>`;
  }

  if (sim.submitted) {
    const passed = correct / sim.qids.length >= 0.5;
    const usedMin = Math.round(((sim.finishedAt || Date.now()) - sim.startAt) / 60000);
    html += `
      <div class="flow-finish ${passed ? "ok" : "ko"}">
        <div><h3>${passed ? "🎉 ¡Aprobado!" : "📚 Suspendido: toca repasar"}</h3>
        <p><strong>${correct}/${sim.qids.length}</strong> aciertos · Nota <strong>${grade}/10</strong> · ${answered} respondidas · ${usedMin} min</p></div>
        <div style="display:flex; gap:0.5rem;">
          <button class="btn" onclick="startReview()">🔁 Repasar fallos</button>
          <button class="btn btn-primary" onclick="generateSimulacroQuestions(); renderMain(); window.scrollTo({top:0});">🎲 Otro examen</button>
        </div>
      </div>`;
  } else {
    html += `
      <div class="test-toolbar sim-sticky">
        <span><strong>${answered}/${sim.qids.length}</strong> respondidas${reveal ? ` · ✅ ${correct} · Nota ${grade}` : ""}</span>
        ${timed ? `<span class="sim-timer" id="sim-timer">--:--</span>` : ""}
        <button class="btn btn-primary" onclick="if(confirm('¿Entregar el examen?')) submitSimulacro(false)">📤 Entregar</button>
      </div>`;
  }

  sim.qids.forEach((qid, i) => {
    const e = idx[qid];
    html += questionCard({
      qid,
      q: e.q,
      label: `#${i + 1}`,
      chosen: sim.answers[i],
      reveal,
      locked: sim.submitted || (!timed && !!sim.answers[i]),
      onPick: (L) => `answerSimulacro(${i},'${L}')`,
      header: `<div class="q-origin">${escapeHtml(e.subj.name)} · Tema ${e.topic.num}${e.extra ? " · extra" : ""}
        <button class="btn" style="padding:2px 8px; font-size:0.72rem;" onclick="selectTopic('${e.topic.key}')">📖 Ver tema</button></div>`
    });
  });
  if (timed) setTimeout(startSimTimer, 0);
  return html;
};

// ---------- Glosario ----------
function renderGlossaryView() {
  const rows = [];
  for (const subj of window.STUDY_DATA.subjects) {
    if (state.glossaryFilter !== "all" && subj.id !== state.glossaryFilter) continue;
    for (const g of subj.glossary || []) rows.push({ subj, g });
  }
  rows.sort((a, b) => a.g.term.localeCompare(b.g.term, "es"));
  let html = `
    <div class="hero-banner"><div><h2>📖 Glosario de siglas y términos</h2>
      <p>${rows.length} términos clave. Escribe para filtrar al instante. Pulsa el tema para ir a estudiarlo.</p></div></div>
    <div class="test-toolbar">
      <input class="gl-search" id="gl-search" placeholder="Buscar término o definición (ej. SGSI, XSS, cadena de custodia)…" oninput="filterGlossary(this.value)" />
      <select class="btn" onchange="state.glossaryFilter=this.value; renderMain();">
        <option value="all">Todas las materias</option>
        ${window.STUDY_DATA.subjects.map((s) => `<option value="${s.id}" ${state.glossaryFilter === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
      </select>
    </div>
    <div class="glossary-list">`;
  for (const { subj, g } of rows) {
    const tKey = `${subj.id}_t${g.topic}`;
    html += `
      <div class="gl-item" data-text="${escapeHtml((g.term + " " + g.def).toLowerCase())}">
        <div class="gl-term">${escapeHtml(g.term)}</div>
        <div class="gl-def">${escapeHtml(g.def)}</div>
        <button class="gl-topic" style="border-color:${SUBJECT_COLORS[subj.id]}66; color:${SUBJECT_COLORS[subj.id]}" onclick="selectTopic('${tKey}')">
          ${SUBJECT_ICONS[subj.id]} Tema ${g.topic}</button>
      </div>`;
  }
  return html + `</div>`;
}

function filterGlossary(text) {
  const t = text.toLowerCase().trim();
  document.querySelectorAll(".gl-item").forEach((el) => {
    el.style.display = !t || el.dataset.text.includes(t) ? "" : "none";
  });
}

// ---------- Tablas comparativas ----------
function comparisonTable(c) {
  return `
    <div class="cmp-card">
      <h4>⚖️ ${escapeHtml(c.title)}</h4>
      <div class="cmp-scroll"><table class="cmp-table">
        <thead><tr>${c.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>${c.rows.map((r) => `<tr>${r.map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>
    </div>`;
}

function renderCompareView() {
  let html = `<div class="hero-banner"><div><h2>⚖️ Tablas comparativas</h2>
    <p>Los conceptos que más se confunden en los exámenes, cara a cara.</p></div></div>`;
  for (const subj of window.STUDY_DATA.subjects) {
    const cs = (subj.comparisons || []).slice().sort((a, b) => a.topic - b.topic);
    if (!cs.length) continue;
    html += `<h3 class="flow-sub">${SUBJECT_ICONS[subj.id]} ${escapeHtml(subj.name)}</h3>`;
    html += cs
      .map((c) => comparisonTable(c).replace("<h4>", `<h4><button class="gl-topic" onclick="selectTopic('${subj.id}_t${c.topic}')">Tema ${c.topic}</button> `))
      .join("");
  }
  return html;
}

// ---------- Bloques que se insertan en la página de cada tema ----------
function buildTtsSegments(topic) {
  const segs = [];
  segs.push({
    seg: 0,
    label: "Título del tema",
    prefix: "",
    body: topic.title
  });
  const paras = (topic.summary || "").split("\n\n");
  paras.forEach((p, idx) => {
    segs.push({
      seg: segs.length,
      label: `Resumen · Párrafo ${idx + 1}`,
      prefix: "",
      body: p
    });
  });
  (topic.key_points || []).forEach((kp, idx) => {
    segs.push({
      seg: segs.length,
      label: `Punto clave #${idx + 1}: ${kp.title}`,
      prefix: `Punto clave ${idx + 1}. ${kp.title}. `,
      body: kp.desc
    });
  });
  (topic.examples || []).forEach((ex, idx) => {
    segs.push({
      seg: segs.length,
      label: `Ejemplo práctico #${idx + 1}: ${ex.title}`,
      prefix: `Ejemplo práctico ${idx + 1}. ${ex.title}. `,
      body: `${ex.scenario} Conclusión para el examen: ${ex.takeaway}`
    });
  });
  return segs;
}

function renderTopicTools(topic) {
  const segs = buildTtsSegments(topic);
  const saved = state.audioPos[topic.key] || { seg: 0, charOffset: 0 };
  const hasSavedPos = saved.seg > 0 || saved.charOffset > 0;
  const isThisPlaying = ttsState.topicKey === topic.key && ttsState.status === "playing";
  const isThisPaused = ttsState.topicKey === topic.key && ttsState.status === "paused";
  const curSeg = Math.min(saved.seg || 0, segs.length - 1);
  const pct = Math.round(((curSeg + 1) / segs.length) * 100);
  const rate = state.settings.ttsRate || 1;

  let mainBtnLabel = "▶ Escuchar clase";
  if (isThisPlaying) {
    mainBtnLabel = "⏸ Pausar lectura";
  } else if (isThisPaused || hasSavedPos) {
    mainBtnLabel = `▶ Continuar (Bloque ${curSeg + 1}/${segs.length})`;
  }

  return `
    <div class="tts-player-box" id="tts-player-box">
      <div class="tts-controls-row">
        <button class="btn btn-primary" id="tts-btn" onclick="ttsPlayPause('${topic.key}')">${mainBtnLabel}</button>
        <button class="btn" onclick="ttsStep('${topic.key}', -1)" title="Bloque anterior">⏮</button>
        <button class="btn" onclick="ttsStep('${topic.key}', 1)" title="Bloque siguiente">⏭</button>
        <button class="btn" onclick="ttsReset('${topic.key}')" title="Reiniciar desde el principio">⏹ Reiniciar</button>
        <select class="btn" onchange="ttsSetRate('${topic.key}', this.value)" title="Velocidad de lectura">
          <option value="1" ${rate == 1 ? "selected" : ""}>1x Normal</option>
          <option value="1.25" ${rate == 1.25 ? "selected" : ""}>1.25x Rápido</option>
          <option value="1.5" ${rate == 1.5 ? "selected" : ""}>1.5x Muy rápido</option>
        </select>
        <span class="tts-seg-badge" id="tts-seg-badge">
          📍 Bloque ${curSeg + 1}/${segs.length}: ${escapeHtml(segs[curSeg].label)}
        </span>
        <div style="margin-left:auto; display:flex; gap:0.4rem;">
          <button class="btn" onclick="printTopics(['${topic.key}'])">🖨️ Imprimir / PDF</button>
          <button class="btn" onclick="scrollToStep('paso-apuntes')">📝 Mis apuntes</button>
        </div>
      </div>
      <div class="tts-progress-track" onclick="ttsSeekBar(event, '${topic.key}')">
        <div class="tts-progress-fill" id="tts-progress-fill" style="width:${hasSavedPos || isThisPlaying ? pct : 0}%"></div>
      </div>
      <div class="tts-live-caption" id="tts-live-caption">
        <span style="color:var(--text-muted)">💡 Pulsa <strong>▶ Escuchar clase</strong> (o haz clic sobre cualquier párrafo o tarjeta) para que se lea en voz alta marcando en vivo cada palabra y apartado por donde va.</span>
      </div>
    </div>`;
}

function renderTopicExtras(subj, topic) {
  const terms = (subj.glossary || []).filter((g) => Number(g.topic) === topic.num);
  const cmps = (subj.comparisons || []).filter((c) => Number(c.topic) === topic.num);
  let html = "";
  if (cmps.length) {
    html += `<h4 class="flow-sub">⚖️ No los confundas</h4>` + cmps.map(comparisonTable).join("");
  }
  if (terms.length) {
    html += `<details class="roadmap"><summary>📖 Términos y siglas de este tema (${terms.length})</summary>
      <div class="glossary-list compact">${terms
        .map((g) => `<div class="gl-item"><div class="gl-term">${escapeHtml(g.term)}</div><div class="gl-def">${escapeHtml(g.def)}</div></div>`)
        .join("")}</div></details>`;
  }
  return html;
}

function renderTopicNotes(topic) {
  return `
    <section class="flow-step" id="paso-apuntes">
      <h3 class="flow-step-title"><span>✎</span> Mis apuntes del tema</h3>
      <textarea class="notes-area" placeholder="Escribe aquí tus propias notas, dudas o trucos para recordar… Se guardan solos."
        oninput="saveNote('${topic.key}', this.value)">${escapeHtml(state.notes[topic.key] || "")}</textarea>
      <div class="notes-status" id="notes-status">${state.notes[topic.key] ? "💾 Guardado" : ""}</div>
    </section>`;
}

let noteTimer = null;
function saveNote(key, value) {
  state.notes[key] = value;
  if (!value) delete state.notes[key];
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    saveState();
    const el = document.getElementById("notes-status");
    if (el) el.textContent = "💾 Guardado";
  }, 400);
}

// ---------- Reproductor Interactivo de Clase con Pausa Persistente y Resaltado en Vivo ----------
const ttsState = {
  topicKey: null,
  status: "idle", // 'idle' | 'playing' | 'paused'
  segs: [],
  segIdx: 0,
  charOffset: 0,
  fallbackTimer: null,
  boundaryWorked: false,
  originalHtmlMap: {}
};

function clearDomHighlights() {
  if (typeof document === "undefined" || !document.querySelectorAll) return;
  document.querySelectorAll(".tts-active-seg").forEach((el) => {
    el.classList.remove("tts-active-seg");
  });
  for (const [segId, origHtml] of Object.entries(ttsState.originalHtmlMap)) {
    const target = findBodyTarget(segId);
    if (target) target.innerHTML = origHtml;
  }
  ttsState.originalHtmlMap = {};
}

function findBodyTarget(segIdx) {
  if (typeof document === "undefined" || !document.querySelector) return null;
  const bodyEl = document.querySelector(`[data-tts-body="${segIdx}"]`);
  if (bodyEl) return bodyEl;
  return document.querySelector(`[data-tts-seg="${segIdx}"]`);
}

function highlightWithWordRange(fullText, startChar, endChar) {
  const safeStart = Math.max(0, Math.min(startChar, fullText.length));
  const safeEnd = Math.max(safeStart, Math.min(endChar, fullText.length));
  const before = escapeHtml(fullText.slice(0, safeStart));
  const active = escapeHtml(fullText.slice(safeStart, safeEnd));
  const after = escapeHtml(fullText.slice(safeEnd));
  return `${before}<mark class="tts-word-mark">${active}</mark>${after}`;
}

function highlightWordAtOffset(segObj, fullSpokenText, absCharIndex) {
  // Update live caption box
  const captionEl = document.getElementById("tts-live-caption");
  const rest = fullSpokenText.slice(absCharIndex);
  const wordMatch = rest.match(/^\S+/);
  const wordLen = wordMatch ? wordMatch[0].length : 1;

  if (captionEl) {
    captionEl.innerHTML = `<span class="tts-caption-tag">${escapeHtml(segObj.label)}:</span> ` +
      highlightWithWordRange(fullSpokenText, absCharIndex, absCharIndex + wordLen);
  }

  // Also highlight the word inside the actual paragraph/card on the page!
  const prefixLen = (segObj.prefix || "").length;
  if (absCharIndex >= prefixLen) {
    const bodyOffset = absCharIndex - prefixLen;
    const bodyText = segObj.body || "";
    if (bodyOffset < bodyText.length) {
      const target = findBodyTarget(segObj.seg);
      if (target && !target.querySelector("strong")) {
        if (!(segObj.seg in ttsState.originalHtmlMap)) {
          ttsState.originalHtmlMap[segObj.seg] = target.innerHTML;
        }
        const bRest = bodyText.slice(bodyOffset);
        const bMatch = bRest.match(/^\S+/);
        const bLen = bMatch ? bMatch[0].length : 1;
        target.innerHTML = highlightWithWordRange(bodyText, bodyOffset, bodyOffset + bLen);
      }
    }
  }
}

function updateTtsPlayerUI(topicKey) {
  const found = findTopic(topicKey);
  if (!found) return;
  const segs = ttsState.segs.length ? ttsState.segs : buildTtsSegments(found.topic);
  const saved = state.audioPos[topicKey] || { seg: 0, charOffset: 0 };
  const curSeg = Math.min(saved.seg || 0, segs.length - 1);

  const btn = document.getElementById("tts-btn");
  if (btn) {
    if (ttsState.topicKey === topicKey && ttsState.status === "playing") {
      btn.textContent = "⏸ Pausar lectura";
    } else if ((ttsState.topicKey === topicKey && ttsState.status === "paused") || saved.seg > 0 || saved.charOffset > 0) {
      btn.textContent = `▶ Continuar (Bloque ${curSeg + 1}/${segs.length})`;
    } else {
      btn.textContent = "▶ Escuchar clase";
    }
  }

  const badge = document.getElementById("tts-seg-badge");
  if (badge && segs[curSeg]) {
    badge.textContent = `📍 Bloque ${curSeg + 1}/${segs.length}: ${segs[curSeg].label}`;
  }

  const fill = document.getElementById("tts-progress-fill");
  if (fill) {
    const pct = Math.round(((curSeg + 1) / segs.length) * 100);
    fill.style.width = `${pct}%`;
  }
}

function speakCurrentSegment(topicKey) {
  if (!("speechSynthesis" in window)) {
    alert("Tu navegador no permite la lectura en voz alta.");
    return;
  }
  clearInterval(ttsState.fallbackTimer);
  clearDomHighlights();

  const found = findTopic(topicKey);
  if (!found) return;
  ttsState.topicKey = topicKey;
  ttsState.segs = buildTtsSegments(found.topic);

  const saved = state.audioPos[topicKey] || { seg: 0, charOffset: 0 };
  if (saved.seg >= ttsState.segs.length) {
    saved.seg = 0;
    saved.charOffset = 0;
  }
  ttsState.segIdx = saved.seg;
  ttsState.charOffset = saved.charOffset || 0;

  const segObj = ttsState.segs[ttsState.segIdx];
  const fullText = (segObj.prefix || "") + (segObj.body || "");
  const startOffset = Math.min(ttsState.charOffset, Math.max(0, fullText.length - 1));
  const sliceText = fullText.slice(startOffset);

  // Highlight block in DOM and scroll smoothly into view
  if (typeof document !== "undefined" && document.querySelector) {
    const blockEl = document.querySelector(`[data-tts-seg="${segObj.seg}"]`);
    if (blockEl) {
      blockEl.classList.add("tts-active-seg");
      blockEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  ttsState.status = "playing";
  ttsState.boundaryWorked = false;
  updateTtsPlayerUI(topicKey);
  highlightWordAtOffset(segObj, fullText, startOffset);

  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(sliceText);
  u.lang = "es-ES";
  u.rate = Number(state.settings.ttsRate) || 1;
  const voices = speechSynthesis.getVoices ? speechSynthesis.getVoices() : [];
  const esVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("es"));
  if (esVoice) u.voice = esVoice;

  u.onboundary = (ev) => {
    if (typeof ev.charIndex === "number") {
      ttsState.boundaryWorked = true;
      const absIdx = startOffset + ev.charIndex;
      ttsState.charOffset = absIdx;
      state.audioPos[topicKey] = { seg: ttsState.segIdx, charOffset: absIdx };
      saveState();
      highlightWordAtOffset(segObj, fullText, absIdx);
    }
  };

  // Fallback progressive word highlighter in case the voice doesn't emit onboundary events
  const charsPerSec = 14.5 * u.rate;
  let simOffset = startOffset;
  ttsState.fallbackTimer = setInterval(() => {
    if (ttsState.status !== "playing" || ttsState.boundaryWorked) return;
    simOffset = Math.min(fullText.length - 1, simOffset + Math.max(4, Math.round(charsPerSec * 0.25)));
    // Snap to start of word
    while (simOffset > 0 && simOffset < fullText.length && /\S/.test(fullText[simOffset - 1])) {
      simOffset++;
    }
    ttsState.charOffset = simOffset;
    state.audioPos[topicKey] = { seg: ttsState.segIdx, charOffset: simOffset };
    highlightWordAtOffset(segObj, fullText, simOffset);
  }, 250);

  u.onend = () => {
    clearInterval(ttsState.fallbackTimer);
    if (ttsState.status !== "playing") return; // Was paused or cancelled manually
    clearDomHighlights();
    if (ttsState.segIdx + 1 < ttsState.segs.length) {
      state.audioPos[topicKey] = { seg: ttsState.segIdx + 1, charOffset: 0 };
      saveState();
      speakCurrentSegment(topicKey);
    } else {
      // Finished the whole topic class!
      ttsState.status = "idle";
      state.audioPos[topicKey] = { seg: 0, charOffset: 0 };
      saveState();
      updateTtsPlayerUI(topicKey);
      const captionEl = document.getElementById("tts-live-caption");
      if (captionEl) {
        captionEl.innerHTML = `✅ <strong>¡Lectura del tema completada!</strong> Puedes repetirla o bajar al test del tema.`;
      }
    }
  };

  speechSynthesis.speak(u);
}

function ttsPlayPause(topicKey) {
  if (!("speechSynthesis" in window)) {
    alert("Tu navegador no permite la lectura en voz alta.");
    return;
  }
  if (ttsState.topicKey === topicKey && ttsState.status === "playing") {
    // Pause and persist exact position!
    ttsState.status = "paused";
    clearInterval(ttsState.fallbackTimer);
    state.audioPos[topicKey] = { seg: ttsState.segIdx, charOffset: ttsState.charOffset };
    saveState();
    speechSynthesis.cancel();
    updateTtsPlayerUI(topicKey);
    return;
  }
  // Resume or start from saved segment + charOffset
  speakCurrentSegment(topicKey);
}

function ttsStep(topicKey, delta) {
  const found = findTopic(topicKey);
  if (!found) return;
  const segs = buildTtsSegments(found.topic);
  const saved = state.audioPos[topicKey] || { seg: 0, charOffset: 0 };
  const nextSeg = Math.max(0, Math.min(segs.length - 1, (saved.seg || 0) + delta));
  state.audioPos[topicKey] = { seg: nextSeg, charOffset: 0 };
  saveState();
  if (ttsState.status === "playing") {
    speakCurrentSegment(topicKey);
  } else {
    clearDomHighlights();
    const blockEl = document.querySelector && document.querySelector(`[data-tts-seg="${nextSeg}"]`);
    if (blockEl) {
      blockEl.classList.add("tts-active-seg");
      blockEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    updateTtsPlayerUI(topicKey);
  }
}

function ttsReset(topicKey) {
  clearInterval(ttsState.fallbackTimer);
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  ttsState.status = "idle";
  state.audioPos[topicKey] = { seg: 0, charOffset: 0 };
  saveState();
  clearDomHighlights();
  updateTtsPlayerUI(topicKey);
  const captionEl = document.getElementById("tts-live-caption");
  if (captionEl) {
    captionEl.innerHTML = `<span style="color:var(--text-muted)">🔄 Posición reiniciada al inicio del tema. Pulsa <strong>▶ Escuchar clase</strong> cuando quieras.</span>`;
  }
}

function ttsSetRate(topicKey, rateVal) {
  state.settings.ttsRate = parseFloat(rateVal) || 1;
  saveState();
  if (ttsState.topicKey === topicKey && ttsState.status === "playing") {
    speakCurrentSegment(topicKey);
  }
}

function ttsSeekBar(ev, topicKey) {
  const found = findTopic(topicKey);
  if (!found) return;
  const segs = buildTtsSegments(found.topic);
  const rect = ev.currentTarget.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
  const targetSeg = Math.min(segs.length - 1, Math.floor(ratio * segs.length));
  state.audioPos[topicKey] = { seg: targetSeg, charOffset: 0 };
  saveState();
  speakCurrentSegment(topicKey);
}

window.ttsJumpIfActive = function (topicKey, segIndex) {
  if (ttsState.status === "playing" || ttsState.status === "paused") {
    state.audioPos[topicKey] = { seg: segIndex, charOffset: 0 };
    saveState();
    speakCurrentSegment(topicKey);
  }
};

function toggleSpeak(topicKey) {
  ttsPlayPause(topicKey);
}

// ---------- Copia de seguridad ----------
function exportProgress() {
  const blob = new Blob([JSON.stringify({ app: "CyberStudyHub", version: 1, exportedAt: new Date().toISOString(), data: progressPayload() }, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `progreso-estudio-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function importProgress() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = () => {
    const f = input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const d = parsed.data || parsed;
        if (!d.userAnswers) throw new Error("formato");
        if (!confirm("Esto reemplazará tu progreso actual por el del archivo. ¿Continuar?")) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
        loadState();
        renderAll();
        alert("✅ Progreso importado correctamente.");
      } catch (e) {
        alert("❌ El archivo no es una copia de seguridad válida.");
      }
    };
    reader.readAsText(f);
  };
  input.click();
}

// ---------- Impresión / PDF ----------
function printTopics(keys) {
  const blocks = keys
    .map((k) => {
      const { subj, topic } = findTopic(k);
      const cmps = (subj.comparisons || []).filter((c) => Number(c.topic) === topic.num);
      const terms = (subj.glossary || []).filter((g) => Number(g.topic) === topic.num);
      return `
      <section>
        <p class="subj">${escapeHtml(subj.name)}</p>
        <h1>${escapeHtml(topic.title)}</h1>
        <h2>Resumen</h2>${(topic.summary || "").split("\n\n").map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
        <h2>Puntos clave</h2><ol>${(topic.key_points || []).map((kp) => `<li><b>${escapeHtml(kp.title)}:</b> ${escapeHtml(kp.desc)}</li>`).join("")}</ol>
        ${cmps.length ? `<h2>Comparativas</h2>` + cmps.map((c) => `<h3>${escapeHtml(c.title)}</h3><table><tr>${c.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>${c.rows.map((r) => `<tr>${r.map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}</table>`).join("") : ""}
        <h2>Ejemplos prácticos</h2>${(topic.examples || []).map((ex) => `<h3>${escapeHtml(ex.title)}</h3><p>${escapeHtml(ex.scenario)}</p><pre>${escapeHtml(ex.code_or_steps)}</pre><p><b>Para el examen:</b> ${escapeHtml(ex.takeaway)}</p>`).join("")}
        ${terms.length ? `<h2>Glosario</h2><ul>${terms.map((g) => `<li><b>${escapeHtml(g.term)}:</b> ${escapeHtml(g.def)}</li>`).join("")}</ul>` : ""}
        <h2>Preguntas de repaso</h2><ul>${(topic.flashcards || []).map((f) => `<li><b>${escapeHtml(f.front)}</b><br/>${escapeHtml(f.back)}</li>`).join("")}</ul>
        ${state.notes[k] ? `<h2>Mis apuntes</h2><pre>${escapeHtml(state.notes[k])}</pre>` : ""}
      </section>`;
    })
    .join("");
  const w = window.open("", "_blank");
  if (!w) {
    alert("Permite las ventanas emergentes para imprimir.");
    return;
  }
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Resumen de estudio</title><style>
    body{font-family:Segoe UI,Arial,sans-serif;color:#111;max-width:820px;margin:0 auto;padding:24px;line-height:1.5;font-size:12.5px}
    section{page-break-after:always} section:last-child{page-break-after:auto}
    h1{font-size:22px;margin:4px 0 12px;color:#1e3a8a} h2{font-size:15px;border-bottom:2px solid #3b82f6;padding-bottom:3px;margin-top:20px;color:#1e3a8a}
    h3{font-size:13px;margin:12px 0 4px} .subj{color:#64748b;margin:0;font-weight:600}
    pre{white-space:pre-wrap;background:#f1f5f9;border:1px solid #cbd5e1;padding:8px;border-radius:6px;font-size:11px}
    table{border-collapse:collapse;width:100%;margin:6px 0} th,td{border:1px solid #cbd5e1;padding:5px;text-align:left;vertical-align:top} th{background:#e2e8f0}
    li{margin-bottom:4px}
  </style></head><body>${blocks}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}

function printSubject(subjId) {
  const subj = window.STUDY_DATA.subjects.find((s) => s.id === subjId);
  printTopics(subj.topics.map((t) => t.key));
}

// ---------- Integración con la navegación existente ----------
function goView(v) {
  state.view = v;
  document.getElementById("sidebar").classList.remove("open");
  saveState();
  renderAll();
  window.scrollTo({ top: 0 });
}

const _renderSidebarBase = renderSidebar;
renderSidebar = function () {
  _renderSidebarBase();
  const due = srsDue().length;
  const btns = document.querySelectorAll("#nav-tree .nav-special-btn");
  const last = btns[btns.length - 1];
  if (!last) return;
  const b = (view, icon, label, extra = "") =>
    `<button class="nav-special-btn ${state.view === view ? "active" : ""}" onclick="${view === "review" ? "startReview()" : `goView('${view}')`}"><span>${icon}</span> ${label}${extra}</button>`;
  last.insertAdjacentHTML(
    "afterend",
    b("review", "🔁", "Repaso de hoy", due ? ` <span class="due-badge">${due}</span>` : "") +
      b("weak", "📊", "Mis puntos débiles") +
      b("glossary", "📖", "Glosario") +
      b("compare", "⚖️", "Tablas comparativas") +
      `<div class="nav-backup">
        <button class="btn" onclick="exportProgress()" title="Descarga tu progreso en un archivo">💾 Exportar</button>
        <button class="btn" onclick="importProgress()" title="Carga un progreso guardado">📂 Importar</button>
      </div>`
  );
};

const EXTRA_VIEWS = {
  review: [renderReviewView, "Repaso de hoy"],
  weak: [renderWeakView, "Mis puntos débiles"],
  glossary: [renderGlossaryView, "Glosario"],
  compare: [renderCompareView, "Tablas comparativas"]
};

const _renderMainBase = renderMain;
renderMain = function () {
  if (EXTRA_VIEWS[state.view]) {
    document.getElementById("main-content").innerHTML = EXTRA_VIEWS[state.view][0]();
  } else {
    _renderMainBase();
  }
};

const _renderTopbarBase = renderTopbar;
renderTopbar = function () {
  if (EXTRA_VIEWS[state.view]) {
    document.getElementById("breadcrumb").innerHTML =
      `<span style="cursor:pointer" onclick="navigateDashboard()">Inicio</span> <span>›</span> <strong>${EXTRA_VIEWS[state.view][1]}</strong>`;
  } else {
    _renderTopbarBase();
  }
};

const _renderDashboardBase = renderDashboard;
renderDashboard = function () {
  const st = srsStats();
  const tools = `
    <div class="tools-grid">
      <button class="tool-card" onclick="startReview()"><span>🔁</span><b>Repaso de hoy</b><small>${st.due} pendientes · ${st.mastered} dominadas</small></button>
      <button class="tool-card" onclick="goView('weak')"><span>📊</span><b>Puntos débiles</b><small>Qué te cuesta más</small></button>
      <button class="tool-card" onclick="navigateSimulacro()"><span>⏱</span><b>Examen cronometrado</b><small>Como el examen real</small></button>
      <button class="tool-card" onclick="goView('glossary')"><span>📖</span><b>Glosario</b><small>Siglas y términos</small></button>
      <button class="tool-card" onclick="goView('compare')"><span>⚖️</span><b>Comparativas</b><small>Lo que más se confunde</small></button>
      <button class="tool-card" onclick="exportProgress()"><span>💾</span><b>Copia de seguridad</b><small>Exportar progreso</small></button>
    </div>`;
  let html = _renderDashboardBase().replace('<div class="kpi-grid">', tools + '<div class="kpi-grid">');
  // botón de imprimir la materia completa en cada tarjeta
  html = html.replace(
    /(onclick="navigateSimulacro\('(\w+)'\)">\s*🎯 Test Materia\s*<\/button>)/g,
    (m, all, id) => `${all}<button class="btn" title="Imprimir resúmenes de la materia" onclick="printSubject('${id}')">🖨️</button>`
  );
  return html;
};

navigateSimulacro = function (subjId = null) {
  state.view = "simulacro";
  if (subjId) {
    state.simulacro.subjectId = subjId;
    generateSimulacroQuestions();
  } else if (!state.simulacro.qids || !state.simulacro.qids.length) {
    generateSimulacroQuestions();
  }
  saveState();
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
};
