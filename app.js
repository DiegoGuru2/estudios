// Estado global de la aplicación de estudio
const STORAGE_KEY = "unir_ciberseguridad_study_state_v1";

const SUBJECT_COLORS = {
  ciberdelitos: "#f43f5e",
  gobierno: "#8b5cf6",
  forense: "#06b6d4",
  redes: "#10b981",
  sistemas: "#f59e0b"
};

const SUBJECT_ICONS = {
  ciberdelitos: "⚖️",
  gobierno: "🏛️",
  forense: "🔍",
  redes: "🌐",
  sistemas: "🛡️"
};

let state = {
  view: "dashboard", // 'dashboard' | 'topic' | 'simulacro' | 'search'
  activeTopicKey: "ciberdelitos_t1",
  activeTab: "teoria", // 'teoria' | 'ejemplos' | 'esquema' | 'test'
  testMode: "instant", // 'instant' | 'exam'
  examSubmitted: {}, // { [topicKey]: boolean }
  completedTopics: {}, // { [topicKey]: boolean }
  userAnswers: {}, // { [topicKey]: { [qNum]: 'A'|'B'|'C'|'D' } }
  openSubjects: {
    ciberdelitos: true,
    gobierno: false,
    forense: false,
    redes: false,
    sistemas: false
  },
  simulacro: {
    subjectId: "all",
    count: 15,
    onlyWrong: false,
    questions: [],
    answers: {},
    submitted: false,
    instant: true
  },
  searchQuery: ""
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state.completedTopics = saved.completedTopics || {};
      state.userAnswers = saved.userAnswers || {};
      state.testMode = saved.testMode || "instant";
    }
  } catch (e) {
    console.warn("No se pudo cargar estado previo:", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        completedTopics: state.completedTopics,
        userAnswers: state.userAnswers,
        testMode: state.testMode
      })
    );
  } catch (e) {
    console.warn("No se pudo guardar estado:", e);
  }
}

function findTopic(topicKey) {
  for (const subj of window.STUDY_DATA.subjects) {
    for (const topic of subj.topics) {
      if (topic.key === topicKey) {
        return { subj, topic };
      }
    }
  }
  return null;
}

function getTopicScore(topic) {
  const ansMap = state.userAnswers[topic.key] || {};
  const answeredKeys = Object.keys(ansMap);
  if (answeredKeys.length === 0) return null;
  let correctCount = 0;
  for (const q of topic.questions) {
    const chosen = ansMap[q.num];
    if (chosen && chosen === q.correct) {
      correctCount++;
    }
  }
  return {
    answered: answeredKeys.length,
    total: topic.questions.length,
    correct: correctCount
  };
}

function computeGlobalStats() {
  let completedCount = 0;
  let totalTopics = 0;
  let totalQuestions = 0;
  let answeredQuestions = 0;
  let correctQuestions = 0;

  for (const subj of window.STUDY_DATA.subjects) {
    for (const topic of subj.topics) {
      totalTopics++;
      if (state.completedTopics[topic.key]) completedCount++;
      totalQuestions += topic.questions.length;
      const ansMap = state.userAnswers[topic.key] || {};
      for (const q of topic.questions) {
        if (ansMap[q.num]) {
          answeredQuestions++;
          if (ansMap[q.num] === q.correct) {
            correctQuestions++;
          }
        }
      }
    }
  }

  const avgGrade =
    answeredQuestions > 0
      ? ((correctQuestions / answeredQuestions) * 10).toFixed(1)
      : "—";

  return {
    completedCount,
    totalTopics,
    totalQuestions,
    answeredQuestions,
    correctQuestions,
    avgGrade
  };
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSidebar() {
  const stats = computeGlobalStats();
  const pctTopics = Math.round((stats.completedCount / stats.totalTopics) * 100);
  const pctTests = Math.round((stats.answeredQuestions / stats.totalQuestions) * 100);

  document.getElementById("sidebar-stats").innerHTML = `
    <div class="stat-row">
      <span>Temas estudiados</span>
      <span>${stats.completedCount}/${stats.totalTopics} (${pctTopics}%)</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width: ${pctTopics}%"></div>
    </div>
    <div class="stat-row" style="margin-top:4px;">
      <span>Preguntas de Test</span>
      <span>${stats.answeredQuestions}/${stats.totalQuestions} (${pctTests}%)</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width: ${pctTests}%"></div>
    </div>
  `;

  const navTree = document.getElementById("nav-tree");
  let html = `
    <button class="nav-special-btn ${state.view === "dashboard" ? "active" : ""}" onclick="navigateDashboard()">
      <span>🏠</span> Panel General de Estudio
    </button>
    <button class="nav-special-btn ${state.view === "simulacro" ? "active" : ""}" onclick="navigateSimulacro()">
      <span>🎯</span> Simulacro de Examen Global
    </button>
  `;

  for (const subj of window.STUDY_DATA.subjects) {
    const isOpen = state.openSubjects[subj.id];
    const color = SUBJECT_COLORS[subj.id] || "#3b82f6";
    const icon = SUBJECT_ICONS[subj.id] || "📘";

    let subjDone = 0;
    for (const t of subj.topics) {
      if (state.completedTopics[t.key] || (getTopicScore(t) && getTopicScore(t).answered === 10)) {
        subjDone++;
      }
    }

    html += `
      <div class="subj-group ${isOpen ? "open" : ""}">
        <button class="subj-header" onclick="toggleSubject('${subj.id}')">
          <div class="subj-header-left">
            <span class="subj-dot" style="background:${color}"></span>
            <span>${icon} ${escapeHtml(subj.name)}</span>
          </div>
          <span style="font-size:0.72rem; color:var(--text-muted);">${subjDone}/10</span>
          <span class="subj-chevron">▶</span>
        </button>
        <div class="subj-topics">
    `;

    for (const t of subj.topics) {
      const isActive = state.view === "topic" && state.activeTopicKey === t.key;
      const sc = getTopicScore(t);
      const isDone = state.completedTopics[t.key];
      let badgeHtml = "";
      if (sc) {
        const cls = sc.correct >= 8 ? "high" : sc.correct >= 5 ? "mid" : "low";
        badgeHtml += `<span class="badge-score ${cls}">${sc.correct}/${sc.total}</span>`;
      }
      if (isDone) {
        badgeHtml += `<span title="Tema completado">✅</span>`;
      }
      const shortTitle = t.title.replace(/^Tema\s+\d+\.\s*/i, "");
      html += `
        <button class="topic-btn ${isActive ? "active" : ""}" onclick="selectTopic('${t.key}')">
          <span><strong>T${t.num}.</strong> ${escapeHtml(shortTitle)}</span>
          <span class="topic-status">${badgeHtml}</span>
        </button>
      `;
    }

    html += `
        </div>
      </div>
    `;
  }

  navTree.innerHTML = html;
}

function toggleSubject(subjId) {
  state.openSubjects[subjId] = !state.openSubjects[subjId];
  renderSidebar();
}

function navigateDashboard() {
  state.view = "dashboard";
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function navigateSimulacro(subjId = null) {
  state.view = "simulacro";
  if (subjId) {
    state.simulacro.subjectId = subjId;
  }
  if (state.simulacro.questions.length === 0 || subjId) {
    generateSimulacroQuestions();
  }
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectTopic(topicKey, tab = null) {
  const found = findTopic(topicKey);
  if (!found) return;
  state.view = "topic";
  state.activeTopicKey = topicKey;
  state.openSubjects[found.subj.id] = true;
  if (tab) {
    state.activeTab = tab;
  }
  document.getElementById("sidebar").classList.remove("open");
  renderAll();
  if (tab === "test") {
    scrollToStep("paso-test");
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function scrollToStep(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setTab(tabName) {
  const map = { teoria: "paso-resumen", ejemplos: "paso-ejemplos", esquema: "paso-repaso", test: "paso-test" };
  scrollToStep(map[tabName] || "paso-resumen");
}

function toggleTopicComplete(topicKey) {
  state.completedTopics[topicKey] = !state.completedTopics[topicKey];
  saveState();
  renderAll();
}

function renderTopbar() {
  const bc = document.getElementById("breadcrumb");
  if (state.view === "dashboard") {
    bc.innerHTML = `<span>Portal Académico</span> <span>›</span> <strong>Panel General (5 Materias · 50 Temas · 500 Preguntas)</strong>`;
  } else if (state.view === "simulacro") {
    bc.innerHTML = `<span style="cursor:pointer" onclick="navigateDashboard()">Inicio</span> <span>›</span> <strong>Simulacro de Examen Dinámico</strong>`;
  } else if (state.view === "search") {
    bc.innerHTML = `<span style="cursor:pointer" onclick="navigateDashboard()">Inicio</span> <span>›</span> <strong>Resultados de búsqueda: "${escapeHtml(state.searchQuery)}"</strong>`;
  } else {
    const found = findTopic(state.activeTopicKey);
    if (found) {
      bc.innerHTML = `
        <span style="cursor:pointer" onclick="navigateDashboard()">Inicio</span>
        <span>›</span>
        <span>${escapeHtml(found.subj.name)}</span>
        <span>›</span>
        <strong>${escapeHtml(found.topic.title)}</strong>
      `;
    }
  }
}

function renderDashboard() {
  const stats = computeGlobalStats();
  let html = `
    <div class="hero-banner">
      <div>
        <h2>🎓 Plataforma Integral de Estudio en Ciberseguridad</h2>
        <p>Material interactivo completo de las <strong>5 asignaturas (50 temas oficiales)</strong>. Incluye teoría estructurada, esquemas conceptuales oficiales, más de 100 casos prácticos y ejemplos técnicos, tarjetas de memoria activa (flashcards) y los <strong>500 tests oficiales interactivos</strong> con corrección y justificación al instante.</p>
      </div>
      <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="navigateSimulacro('all')">🎯 Iniciar Simulacro Global</button>
        <button class="btn" onclick="resetAllProgress()">🔄 Reiniciar Estadísticas</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <span class="kpi-val">${stats.completedCount} / ${stats.totalTopics}</span>
        <span class="kpi-label">Temas Completados</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-val">${stats.answeredQuestions} / ${stats.totalQuestions}</span>
        <span class="kpi-label">Preguntas Respondidas</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-val" style="color:var(--accent-emerald)">${stats.correctQuestions}</span>
        <span class="kpi-label">Respuestas Correctas</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-val" style="color:var(--accent-amber)">${stats.avgGrade}</span>
        <span class="kpi-label">Nota Media de Tests (sobre 10)</span>
      </div>
    </div>

    <h3 style="margin-bottom: 1rem; font-size: 1.25rem;">📚 Materias del Programa (Selecciona un tema o lanza un test)</h3>
    <div class="subjects-grid">
  `;

  for (const subj of window.STUDY_DATA.subjects) {
    const color = SUBJECT_COLORS[subj.id] || "#3b82f6";
    const icon = SUBJECT_ICONS[subj.id] || "📘";

    let answeredSubj = 0;
    let correctSubj = 0;
    for (const t of subj.topics) {
      const sc = getTopicScore(t);
      if (sc) {
        answeredSubj += sc.answered;
        correctSubj += sc.correct;
      }
    }

    html += `
      <div class="subject-card">
        <div>
          <div class="subject-card-header">
            <span class="subject-badge" style="background:${color}22; color:${color}; border:1px solid ${color}55;">
              ${icon} 10 Temas · 100 Preguntas
            </span>
            <span style="font-size:0.78rem; color:var(--text-muted); font-weight:700;">
              Aciertos: ${correctSubj}/${answeredSubj || 100}
            </span>
          </div>
          <h3 style="margin: 0.65rem 0 0.9rem;">${escapeHtml(subj.name)}</h3>
          <div class="subject-topic-pills">
    `;

    for (const t of subj.topics) {
      const sc = getTopicScore(t);
      const isDone = state.completedTopics[t.key];
      let statusRight = "";
      if (sc) {
        statusRight = `<span style="color:${sc.correct >= 7 ? "var(--accent-emerald)" : "var(--accent-amber)"}; font-weight:700;">${sc.correct}/10</span>`;
      } else if (isDone) {
        statusRight = `<span>✅</span>`;
      } else {
        statusRight = `<span style="color:var(--text-muted)">Ir →</span>`;
      }

      html += `
        <div class="topic-pill" onclick="selectTopic('${t.key}', 'teoria')">
          <span><strong>Tema ${t.num}.</strong> ${escapeHtml(t.title.replace(/^Tema\s+\d+\.\s*/i, ""))}</span>
          ${statusRight}
        </div>
      `;
    }

    html += `
          </div>
        </div>
        <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
          <button class="btn btn-primary" style="flex:1; justify-content:center;" onclick="selectTopic('${subj.id}_t1', 'teoria')">
            📖 Estudiar Temas
          </button>
          <button class="btn" style="flex:1; justify-content:center;" onclick="navigateSimulacro('${subj.id}')">
            🎯 Test Materia
          </button>
        </div>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

function formatTheoryContent(lines) {
  if (!lines || lines.length === 0) return "";
  let html = "";
  let inList = false;
  let paragraphBuffer = [];

  function flushParagraph() {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join(" ");
      // Detect short subheadings or callouts
      if (text.length < 95 && !text.endsWith(".") && !text.endsWith(":")) {
        html += `<div class="callout-sub">${escapeHtml(text)}</div>`;
      } else {
        html += `<p>${escapeHtml(text)}</p>`;
      }
      paragraphBuffer = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    if (rawLine === "▸" || rawLine === "•" || rawLine.startsWith("▸ ") || rawLine.startsWith("• ")) {
      flushParagraph();
      if (!inList) {
        html += `<ul>`;
        inList = true;
      }
      let itemText = rawLine.replace(/^[▸•]\s*/, "").trim();
      if (!itemText && i + 1 < lines.length) {
        itemText = lines[++i].trim();
      }
      if (itemText) {
        html += `<li>${escapeHtml(itemText)}</li>`;
      }
    } else if (rawLine.startsWith("Figura ") || rawLine.startsWith("Tabla ")) {
      flushParagraph();
      if (inList) {
        html += `</ul>`;
        inList = false;
      }
      html += `<p style="font-size:0.82rem; color:var(--text-muted); font-style:italic;">📌 ${escapeHtml(rawLine)}</p>`;
    } else {
      if (inList) {
        // Check if previous line did not end with punctuation, meaning continuation
        html += `</ul>`;
        inList = false;
      }
      paragraphBuffer.push(rawLine);
      if (rawLine.endsWith(".") || rawLine.endsWith(":") || rawLine.endsWith("?") || paragraphBuffer.join(" ").length > 420) {
        flushParagraph();
      }
    }
  }

  flushParagraph();
  if (inList) html += `</ul>`;
  return html;
}

function renderTopicView() {
  const found = findTopic(state.activeTopicKey);
  if (!found) return renderDashboard();
  const { subj, topic } = found;
  const color = SUBJECT_COLORS[subj.id] || "#3b82f6";
  const isDone = !!state.completedTopics[topic.key];
  const sc = getTopicScore(topic);

  // Find previous and next topics
  const allTopicKeys = [];
  for (const s of window.STUDY_DATA.subjects) {
    for (const t of s.topics) {
      allTopicKeys.push(t.key);
    }
  }
  const idx = allTopicKeys.indexOf(topic.key);
  const prevKey = idx > 0 ? allTopicKeys[idx - 1] : null;
  const nextKey = idx < allTopicKeys.length - 1 ? allTopicKeys[idx + 1] : null;

  let html = `
    <div class="topic-header-card">
      <div class="topic-meta-bar">
        <span class="subject-badge" style="background:${color}22; color:${color}; border:1px solid ${color}55;">
          ${SUBJECT_ICONS[subj.id]} ${escapeHtml(subj.name)} · Tema ${topic.num} de 10 (${topic.pages} págs. PDF)
        </span>
        <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
          ${prevKey ? `<button class="btn" onclick="selectTopic('${prevKey}')">← Anterior</button>` : ""}
          <button class="btn ${isDone ? "btn-success" : ""}" onclick="toggleTopicComplete('${topic.key}')">
            ${isDone ? "✅ Tema Completado" : "☑️ Marcar como Estudiado"}
          </button>
          ${nextKey ? `<button class="btn" onclick="selectTopic('${nextKey}')">Siguiente →</button>` : ""}
        </div>
      </div>
      <h2 class="topic-title-main">${escapeHtml(topic.title)}</h2>

      <div class="tabs-bar" style="margin-bottom:0;">
        <button class="tab-btn ${state.activeTab === "teoria" ? "active" : ""}" onclick="setTab('teoria')">
          📖 Guía de Estudio e Ideas Clave
        </button>
        <button class="tab-btn ${state.activeTab === "ejemplos" ? "active" : ""}" onclick="setTab('ejemplos')">
          💻 Ejemplos Prácticos y Casos (${(topic.examples || []).length})
        </button>
        <button class="tab-btn ${state.activeTab === "esquema" ? "active" : ""}" onclick="setTab('esquema')">
          🗺️ Esquema Visual y Flashcards (${(topic.flashcards || []).length})
        </button>
        <button class="tab-btn ${state.activeTab === "test" ? "active" : ""}" onclick="setTab('test')">
          📝 Test Dinámico (${sc ? `${sc.correct}/10` : "10 Preguntas"})
        </button>
      </div>
    </div>
  `;

  if (state.activeTab === "teoria") {
    html += renderTheoryTab(topic);
  } else if (state.activeTab === "ejemplos") {
    html += renderExamplesTab(topic);
  } else if (state.activeTab === "esquema") {
    html += renderEsquemaTab(topic);
  } else if (state.activeTab === "test") {
    html += renderTestTab(topic);
  }

  return html;
}

function renderTheoryTab(topic) {
  let html = "";

  if (topic.summary) {
    const paragraphs = topic.summary.split("\n\n");
    html += `
      <div class="summary-box">
        <h3>✨ Resumen Ejecutivo del Tema</h3>
        ${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
      </div>
    `;
  }

  if (topic.key_points && topic.key_points.length > 0) {
    html += `
      <h3 style="margin-bottom:0.85rem; font-size:1.15rem;">🎯 Puntos Clave de Examen (Conceptos Esenciales)</h3>
      <div class="key-points-grid">
        ${topic.key_points
          .map(
            (kp, i) => `
          <div class="key-point-card">
            <h4><span style="color:var(--accent-emerald)">0${i + 1}.</span> ${escapeHtml(kp.title)}</h4>
            <p>${escapeHtml(kp.desc)}</p>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  // Filter sections (skip bibliographic references or put at end)
  const sections = topic.sections || [];
  html += `
    <div class="theory-layout">
      <aside class="toc-sticky">
        <h4>📑 Índice de Apartados</h4>
        ${sections
          .map(
            (sec, idx) => `
          <a class="toc-link" href="#sec-${idx}">${escapeHtml(sec.title)}</a>
        `
          )
          .join("")}
        <hr style="border:none; border-top:1px solid var(--border-color); margin:0.75rem 0;" />
        <button class="btn btn-primary" style="width:100%; justify-content:center;" onclick="setTab('test')">
          📝 Ir al Test del Tema
        </button>
      </aside>
      <div>
        ${sections
          .map(
            (sec, idx) => `
          <section class="section-card" id="sec-${idx}">
            <h3>${escapeHtml(sec.title)}</h3>
            ${formatTheoryContent(sec.content)}
          </section>
        `
          )
          .join("")}
      </div>
    </div>
  `;

  return html;
}

function renderExamplesTab(topic) {
  const examples = topic.examples || [];
  let html = `
    <div class="summary-box">
      <h3>💡 Aprendizaje Basado en Casos Reales y Ejemplos Prácticos</h3>
      <p>Estudia cómo se aplican los conceptos teóricos de <strong>${escapeHtml(topic.title)}</strong> en escenarios reales de ciberseguridad, auditoría, cumplimiento normativo, laboratorios técnicos y respuesta ante incidentes.</p>
    </div>
    <div class="examples-list">
  `;

  examples.forEach((ex, idx) => {
    const codeId = `code-${topic.key}-${idx}`;
    html += `
      <div class="example-card">
        <div class="example-header">
          <h3>⚡ Ejemplo ${idx + 1}: ${escapeHtml(ex.title)}</h3>
          <span class="example-badge">${escapeHtml(ex.badge || "Caso Práctico")}</span>
        </div>
        <div class="example-body">
          <div class="example-scenario">
            <strong>📌 Escenario y Contexto:</strong><br/>
            ${escapeHtml(ex.scenario)}
          </div>
          <div class="code-block-wrap">
            <div class="code-block-bar">
              <span>Implementación Técnica / Desglose Paso a Paso</span>
              <button class="btn" style="padding:2px 8px; font-size:0.72rem;" onclick="copyCode('${codeId}')">📋 Copiar</button>
            </div>
            <pre id="${codeId}">${escapeHtml(ex.code_or_steps)}</pre>
          </div>
          <div class="example-takeaway">
            <strong>🎓 Conclusión Clave para Examen:</strong> ${escapeHtml(ex.takeaway)}
          </div>
        </div>
      </div>
    `;
  });

  html += `
    </div>
    <div style="margin-top:1.75rem; display:flex; justify-content:flex-end; gap:0.75rem;">
      <button class="btn" onclick="setTab('esquema')">🗺️ Ver Esquema y Flashcards →</button>
      <button class="btn btn-primary" onclick="setTab('test')">📝 Poner a Prueba en el Test →</button>
    </div>
  `;
  return html;
}

function renderEsquemaTab(topic) {
  const flashcards = topic.flashcards || [];
  let html = `
    <div class="esquema-card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
        <div style="text-align:left;">
          <h3 style="font-size:1.2rem;">🗺️ Esquema Oficial del Tema (Mapa Conceptual)</h3>
          <p style="font-size:0.85rem; color:var(--text-muted);">Haz clic sobre el esquema para ampliarlo a pantalla completa.</p>
        </div>
        <button class="btn" onclick="openModal('${topic.esquema_img}')">🔍 Ampliar Esquema</button>
      </div>
      <div class="esquema-img-container">
        <img src="${topic.esquema_img}" alt="Esquema ${escapeHtml(topic.title)}" onclick="openModal('${topic.esquema_img}')" />
      </div>
    </div>

    <div style="margin-bottom:1rem;">
      <h3 style="font-size:1.2rem;">🧠 Tarjetas de Memoria Activa (Flashcards)</h3>
      <p style="font-size:0.85rem; color:var(--text-muted);">Haz clic en cada tarjeta para girar y comprobar la respuesta antes de hacer el test.</p>
    </div>

    <div class="flashcards-grid">
      ${flashcards
        .map(
          (fc, idx) => `
        <div class="flashcard" id="fc-${idx}" onclick="flipFlashcard(${idx})">
          <div>
            <div class="flashcard-tag" id="fc-tag-${idx}">Pregunta #${idx + 1}</div>
            <div class="flashcard-text" id="fc-txt-${idx}" data-front="${escapeHtml(fc.front)}" data-back="${escapeHtml(fc.back)}">
              ${escapeHtml(fc.front)}
            </div>
          </div>
          <div class="flashcard-hint">🔄 Clic para voltear tarjeta</div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
  return html;
}

function flipFlashcard(idx) {
  const card = document.getElementById(`fc-${idx}`);
  const tag = document.getElementById(`fc-tag-${idx}`);
  const txt = document.getElementById(`fc-txt-${idx}`);
  if (!card || !txt) return;
  const isFlipped = card.classList.toggle("flipped");
  if (isFlipped) {
    tag.textContent = "✅ Respuesta";
    txt.textContent = txt.getAttribute("data-back");
  } else {
    tag.textContent = `Pregunta #${idx + 1}`;
    txt.textContent = txt.getAttribute("data-front");
  }
}

function renderTestTab(topic) {
  const ansMap = state.userAnswers[topic.key] || {};
  const sc = getTopicScore(topic);
  const isExamMode = state.testMode === "exam";
  const isSubmitted = !!state.examSubmitted[topic.key];

  let scoreBanner = "";
  if (sc && (!isExamMode || isSubmitted)) {
    const grade = ((sc.correct / sc.total) * 10).toFixed(1);
    const color = sc.correct >= 8 ? "var(--accent-emerald)" : sc.correct >= 5 ? "var(--accent-amber)" : "var(--accent-rose)";
    scoreBanner = `
      <div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">
        <span style="font-size:0.95rem; font-weight:700;">
          Respondidas: <strong>${sc.answered}/${sc.total}</strong> · Aciertos: <strong style="color:${color}">${sc.correct}/${sc.total}</strong> · Nota: <strong style="color:${color}; font-size:1.15rem;">${grade}/10</strong>
        </span>
      </div>
    `;
  } else {
    scoreBanner = `<span style="font-size:0.9rem; color:var(--text-secondary);">Selecciona la respuesta correcta en cada una de las 10 preguntas oficiales del PDF.</span>`;
  }

  let html = `
    <div class="test-toolbar">
      <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
        <div class="mode-switch">
          <button class="${state.testMode === "instant" ? "active" : ""}" onclick="setTestMode('instant')">⚡ Corrección Instantánea</button>
          <button class="${state.testMode === "exam" ? "active" : ""}" onclick="setTestMode('exam')">🎓 Modo Examen</button>
        </div>
        ${scoreBanner}
      </div>
      <div style="display:flex; gap:0.5rem;">
        ${
          isExamMode && !isSubmitted
            ? `<button class="btn btn-primary" onclick="submitTopicExam('${topic.key}')">✅ Calificar Examen</button>`
            : ""
        }
        <button class="btn" onclick="resetTopicTest('${topic.key}')">🔄 Reiniciar Test</button>
      </div>
    </div>
  `;

  for (const q of topic.questions) {
    const chosen = ansMap[q.num];
    const showCorrection = chosen && (!isExamMode || isSubmitted);
    const isCorrect = chosen === q.correct;

    let cardClass = "question-card";
    if (showCorrection) {
      cardClass += isCorrect ? " answered-correct" : " answered-wrong";
    }

    html += `
      <div class="${cardClass}">
        <div class="q-header">
          <span class="q-num-badge">P${q.num}</span>
          <div class="q-title">${escapeHtml(q.question)}</div>
        </div>
        <div class="options-list">
    `;

    for (const optLetter of ["A", "B", "C", "D"]) {
      const optText = q.options[optLetter] || "";
      let btnClass = "option-btn";
      if (showCorrection) {
        if (optLetter === q.correct) {
          btnClass += " correct";
        } else if (optLetter === chosen && chosen !== q.correct) {
          btnClass += " wrong";
        }
      } else if (chosen === optLetter) {
        btnClass += " selected-exam";
      }

      html += `
        <button class="${btnClass}" onclick="answerQuestion('${topic.key}', ${q.num}, '${optLetter}')">
          <span class="opt-letter">${optLetter}</span>
          <span>${escapeHtml(optText)}</span>
        </button>
      `;
    }

    html += `</div>`;

    if (showCorrection) {
      html += `
        <div class="q-feedback ${isCorrect ? "ok" : "ko"}">
          <strong>${
            isCorrect
              ? `✅ ¡Respuesta Correcta! (${q.correct})`
              : `❌ Respuesta Incorrecta (Marcaste ${chosen}, la correcta es ${q.correct})`
          }</strong><br/>
          <span style="color:var(--text-secondary)"><strong>Explicación didáctica:</strong> ${escapeHtml(
            q.explanation || "Respuesta verificada según el material oficial del tema."
          )}</span>
        </div>
      `;
    }

    html += `</div>`;
  }

  return html;
}

function setTestMode(mode) {
  state.testMode = mode;
  saveState();
  renderMain();
}

function answerQuestion(topicKey, qNum, optLetter) {
  if (!state.userAnswers[topicKey]) {
    state.userAnswers[topicKey] = {};
  }
  state.userAnswers[topicKey][qNum] = optLetter;

  // Auto-mark topic completed if all 10 answered
  if (Object.keys(state.userAnswers[topicKey]).length === 10) {
    state.completedTopics[topicKey] = true;
  }

  saveState();
  renderSidebar();
  renderMain();
}

function submitTopicExam(topicKey) {
  state.examSubmitted[topicKey] = true;
  renderMain();
}

function resetTopicTest(topicKey) {
  delete state.userAnswers[topicKey];
  delete state.examSubmitted[topicKey];
  saveState();
  renderSidebar();
  renderMain();
}

function resetAllProgress() {
  if (!confirm("¿Seguro que deseas reiniciar el historial de tests y temas completados?")) return;
  state.completedTopics = {};
  state.userAnswers = {};
  state.examSubmitted = {};
  saveState();
  renderAll();
}

// Simulacro Global / Por Materia
function generateSimulacroQuestions() {
  const pool = [];
  for (const subj of window.STUDY_DATA.subjects) {
    if (state.simulacro.subjectId !== "all" && subj.id !== state.simulacro.subjectId) continue;
    for (const topic of subj.topics) {
      const ansMap = state.userAnswers[topic.key] || {};
      for (const q of topic.questions) {
        if (state.simulacro.onlyWrong) {
          if (!ansMap[q.num] || ansMap[q.num] === q.correct) continue;
        }
        pool.push({
          subjId: subj.id,
          subjName: subj.name,
          topicKey: topic.key,
          topicNum: topic.num,
          topicTitle: topic.title,
          ...q
        });
      }
    }
  }

  // Shuffle pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  state.simulacro.questions = pool.slice(0, state.simulacro.count);
  state.simulacro.answers = {};
  state.simulacro.submitted = false;
}

function updateSimulacroConfig(field, value) {
  if (field === "count") value = parseInt(value, 10);
  if (field === "onlyWrong") value = value === "true" || value === true;
  state.simulacro[field] = value;
  generateSimulacroQuestions();
  renderMain();
}

function answerSimulacro(idx, optLetter) {
  state.simulacro.answers[idx] = optLetter;
  // Also record in topic history
  const q = state.simulacro.questions[idx];
  if (q) {
    if (!state.userAnswers[q.topicKey]) state.userAnswers[q.topicKey] = {};
    state.userAnswers[q.topicKey][q.num] = optLetter;
    saveState();
    renderSidebar();
  }
  renderMain();
}

function renderSimulacroView() {
  const qs = state.simulacro.questions;
  const ans = state.simulacro.answers;
  let correct = 0;
  let answered = 0;

  qs.forEach((q, idx) => {
    if (ans[idx]) {
      answered++;
      if (ans[idx] === q.correct) correct++;
    }
  });

  const grade = answered > 0 ? ((correct / qs.length) * 10).toFixed(1) : "0.0";

  let html = `
    <div class="topic-header-card">
      <h2 class="topic-title-main" style="margin-bottom:0.5rem;">🎯 Generador de Simulacros de Examen Dinámicos</h2>
      <p style="color:var(--text-secondary); margin-bottom:1.25rem;">Configura un examen aleatorio combinando preguntas de cualquiera de las 5 asignaturas o repasa únicamente tus preguntas falladas.</p>

      <div style="display:flex; gap:1rem; flex-wrap:wrap; align-items:center;">
        <div>
          <label style="font-size:0.78rem; color:var(--text-muted); display:block; margin-bottom:4px;">Materia</label>
          <select class="btn" onchange="updateSimulacroConfig('subjectId', this.value)">
            <option value="all" ${state.simulacro.subjectId === "all" ? "selected" : ""}>🌐 Todas las 5 Materias (500 preguntas)</option>
            ${window.STUDY_DATA.subjects
              .map(
                (s) =>
                  `<option value="${s.id}" ${state.simulacro.subjectId === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`
              )
              .join("")}
          </select>
        </div>

        <div>
          <label style="font-size:0.78rem; color:var(--text-muted); display:block; margin-bottom:4px;">Nº de Preguntas</label>
          <select class="btn" onchange="updateSimulacroConfig('count', this.value)">
            ${[10, 15, 25, 50]
              .map(
                (n) => `<option value="${n}" ${state.simulacro.count === n ? "selected" : ""}>${n} preguntas</option>`
              )
              .join("")}
          </select>
        </div>

        <div>
          <label style="font-size:0.78rem; color:var(--text-muted); display:block; margin-bottom:4px;">Filtro de Preguntas</label>
          <select class="btn" onchange="updateSimulacroConfig('onlyWrong', this.value)">
            <option value="false" ${!state.simulacro.onlyWrong ? "selected" : ""}>Todas las preguntas</option>
            <option value="true" ${state.simulacro.onlyWrong ? "selected" : ""}>Solo falladas anteriormente</option>
          </select>
        </div>

        <div style="margin-left:auto; display:flex; gap:0.5rem; align-items:center; margin-top:18px;">
          <button class="btn btn-primary" onclick="generateSimulacroQuestions(); renderMain();">🎲 Generar Nuevo Examen</button>
        </div>
      </div>
    </div>

    <div class="test-toolbar">
      <div>
        <strong>Progreso del Simulacro:</strong> ${answered} / ${qs.length} respondidas ·
        <strong style="color:var(--accent-emerald)">Aciertos: ${correct}</strong> ·
        <strong>Nota actual: ${grade} / 10</strong>
      </div>
    </div>
  `;

  if (qs.length === 0) {
    html += `
      <div class="section-card" style="text-align:center; padding:3rem;">
        <h3>🎉 ¡No tienes preguntas falladas pendientes en esta selección!</h3>
        <p style="margin-top:0.5rem;">Cambia el filtro a "Todas las preguntas" para generar un nuevo simulacro.</p>
      </div>
    `;
    return html;
  }

  qs.forEach((q, idx) => {
    const chosen = ans[idx];
    const isCorrect = chosen === q.correct;
    const cardClass = chosen ? `question-card ${isCorrect ? "answered-correct" : "answered-wrong"}` : "question-card";

    html += `
      <div class="${cardClass}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.65rem; flex-wrap:wrap; gap:0.5rem;">
          <span style="font-size:0.76rem; color:var(--accent-cyan); font-weight:700;">
            ${escapeHtml(q.subjName)} · Tema ${q.topicNum} (P${q.num})
          </span>
          <button class="btn" style="padding:2px 8px; font-size:0.72rem;" onclick="selectTopic('${q.topicKey}', 'teoria')">
            📖 Ver Tema ${q.topicNum}
          </button>
        </div>
        <div class="q-header">
          <span class="q-num-badge">#${idx + 1}</span>
          <div class="q-title">${escapeHtml(q.question)}</div>
        </div>
        <div class="options-list">
    `;

    for (const optLetter of ["A", "B", "C", "D"]) {
      const optText = q.options[optLetter] || "";
      let btnClass = "option-btn";
      if (chosen) {
        if (optLetter === q.correct) btnClass += " correct";
        else if (optLetter === chosen) btnClass += " wrong";
      }
      html += `
        <button class="${btnClass}" onclick="answerSimulacro(${idx}, '${optLetter}')">
          <span class="opt-letter">${optLetter}</span>
          <span>${escapeHtml(optText)}</span>
        </button>
      `;
    }

    html += `</div>`;
    if (chosen) {
      html += `
        <div class="q-feedback ${isCorrect ? "ok" : "ko"}">
          <strong>${
            isCorrect
              ? `✅ ¡Correcto! (${q.correct})`
              : `❌ Incorrecto (Elegiste ${chosen}, la respuesta correcta es ${q.correct})`
          }</strong><br/>
          <span>${escapeHtml(q.explanation)}</span>
        </div>
      `;
    }
    html += `</div>`;
  });

  return html;
}

// Buscador Global
function handleSearch(query) {
  state.searchQuery = query.trim();
  if (!state.searchQuery) {
    state.view = "dashboard";
  } else {
    state.view = "search";
  }
  renderMain();
  renderTopbar();
}

function renderSearchView() {
  const q = state.searchQuery.toLowerCase();
  const topicMatches = [];
  const questionMatches = [];

  for (const subj of window.STUDY_DATA.subjects) {
    for (const topic of subj.topics) {
      const inTitle = topic.title.toLowerCase().includes(q);
      const inSummary = (topic.summary || "").toLowerCase().includes(q);
      const inExamples = (topic.examples || []).some(
        (e) => e.title.toLowerCase().includes(q) || e.scenario.toLowerCase().includes(q)
      );
      if (inTitle || inSummary || inExamples) {
        topicMatches.push({ subj, topic });
      }
      for (const qu of topic.questions) {
        if (
          qu.question.toLowerCase().includes(q) ||
          Object.values(qu.options).some((v) => v.toLowerCase().includes(q))
        ) {
          questionMatches.push({ subj, topic, qu });
        }
      }
    }
  }

  let html = `
    <h2 style="margin-bottom:1.25rem;">🔍 Resultados para "${escapeHtml(state.searchQuery)}"</h2>
    <h3 style="margin-bottom:0.85rem; color:var(--accent-cyan);">📘 Temas Relacionados (${topicMatches.length})</h3>
  `;

  if (topicMatches.length === 0) {
    html += `<p style="color:var(--text-muted); margin-bottom:1.5rem;">No se encontraron temas con ese término.</p>`;
  } else {
    html += `<div class="key-points-grid">`;
    for (const { subj, topic } of topicMatches.slice(0, 12)) {
      html += `
        <div class="key-point-card" style="cursor:pointer" onclick="selectTopic('${topic.key}', 'teoria')">
          <span style="font-size:0.72rem; color:var(--accent-cyan); font-weight:700;">${escapeHtml(subj.name)}</span>
          <h4 style="margin-top:4px;">${escapeHtml(topic.title)}</h4>
          <p>${escapeHtml((topic.summary || "").slice(0, 160))}...</p>
        </div>
      `;
    }
    html += `</div>`;
  }

  html += `<h3 style="margin:1.5rem 0 0.85rem; color:var(--accent-emerald);">📝 Preguntas de Test Relacionadas (${questionMatches.length})</h3>`;
  for (const { subj, topic, qu } of questionMatches.slice(0, 15)) {
    html += `
      <div class="section-card" style="padding:1.25rem;">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
          <span style="font-size:0.76rem; color:var(--accent-cyan); font-weight:700;">${escapeHtml(subj.name)} · ${escapeHtml(topic.title)}</span>
          <button class="btn" style="padding:2px 8px; font-size:0.72rem;" onclick="selectTopic('${topic.key}', 'test')">Ir al Test →</button>
        </div>
        <p style="color:var(--text-primary); font-weight:700; margin-bottom:0.5rem;">P${qu.num}. ${escapeHtml(qu.question)}</p>
        <p style="font-size:0.85rem; color:var(--accent-emerald); margin-bottom:0.25rem;">✅ Respuesta correcta: <strong>${qu.correct}) ${escapeHtml(qu.options[qu.correct])}</strong></p>
        <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0;">${escapeHtml(qu.explanation)}</p>
      </div>
    `;
  }

  return html;
}

function copyCode(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText);
}

function openModal(imgSrc) {
  const modal = document.getElementById("esquema-modal");
  const modalImg = document.getElementById("esquema-modal-img");
  modalImg.src = imgSrc;
  modal.classList.add("open");
}

function closeModal() {
  document.getElementById("esquema-modal").classList.remove("open");
}

function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme");
  root.setAttribute("data-theme", current === "light" ? "dark" : "light");
}

function renderMain() {
  const container = document.getElementById("main-content");
  if (state.view === "dashboard") {
    container.innerHTML = renderDashboard();
  } else if (state.view === "simulacro") {
    container.innerHTML = renderSimulacroView();
  } else if (state.view === "search") {
    container.innerHTML = renderSearchView();
  } else {
    container.innerHTML = renderTopicFlow();
  }
}

function renderAll() {
  renderSidebar();
  renderTopbar();
  renderMain();
}

window.addEventListener("DOMContentLoaded", () => {
  loadState();
  renderAll();
});

// ===== Recorrido lineal por tema: Lo esencial -> Ejemplos -> Repaso -> Test del tema -> Siguiente =====
function renderTopicFlow() {
  const found = findTopic(state.activeTopicKey);
  if (!found) return renderDashboard();
  const { subj, topic } = found;
  const color = SUBJECT_COLORS[subj.id] || "#3b82f6";
  const sc = getTopicScore(topic);
  const answered = sc ? sc.answered : 0;
  const finished =
    answered === topic.questions.length && (state.testMode !== "exam" || !!state.examSubmitted[topic.key]);

  const idx = subj.topics.findIndex((t) => t.key === topic.key);
  const prevT = idx > 0 ? subj.topics[idx - 1] : null;
  const nextT = idx < subj.topics.length - 1 ? subj.topics[idx + 1] : null;
  const shortTitle = (t) => t.title.replace(/^Tema\s+\d+\.\s*/i, "");

  // Barra de progreso de la materia (temas con test terminado)
  const dots = subj.topics
    .map((t) => {
      const s = getTopicScore(t);
      const done = s && s.answered === t.questions.length;
      const cls = t.key === topic.key ? "current" : done ? (s.correct >= 5 ? "ok" : "ko") : "";
      return `<button class="flow-dot ${cls}" title="${escapeHtml(t.title)}" onclick="selectTopic('${t.key}')">${t.num}</button>`;
    })
    .join("");

  const roadmap = topic.roadmap || (topic.sections || []).map((s) => s.title);
  const kps = topic.key_points || [];
  const exs = topic.examples || [];
  const fcs = topic.flashcards || [];

  let html = `
    <div class="topic-header-card">
      <div class="topic-meta-bar">
        <span class="subject-badge" style="background:${color}22; color:${color}; border:1px solid ${color}55;">
          ${SUBJECT_ICONS[subj.id]} ${escapeHtml(subj.name)}
        </span>
        <div class="flow-dots">${dots}</div>
      </div>
      <h2 class="topic-title-main">${escapeHtml(topic.title)}</h2>
      ${typeof renderTopicTools === "function" ? renderTopicTools(topic) : ""}
      <div class="flow-steps">
        <button onclick="scrollToStep('paso-resumen')"><b>1</b> Lo esencial</button>
        <button onclick="scrollToStep('paso-ejemplos')"><b>2</b> Ejemplos</button>
        <button onclick="scrollToStep('paso-repaso')"><b>3</b> Repaso rápido</button>
        <button onclick="scrollToStep('paso-test')" class="${finished ? "done" : ""}"><b>4</b> Test del tema ${sc ? `(${sc.answered}/10)` : ""}</button>
      </div>
    </div>

    <section class="flow-step" id="paso-resumen">
      <h3 class="flow-step-title"><span>1</span> Lo esencial del tema</h3>
      <div class="summary-box">
        ${(topic.summary || "").split("\n\n").map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
      </div>
      ${
        roadmap.length
          ? `<details class="roadmap"><summary>📑 Apartados que cubre el tema (${roadmap.length})</summary>
              <ol>${roadmap
                .filter((r) => !/referencias bibliogr/i.test(r))
                .map((r) => `<li>${escapeHtml(r)}</li>`)
                .join("")}</ol></details>`
          : ""
      }
      <h4 class="flow-sub">🎯 Lo que tienes que saber sí o sí</h4>
      <div class="key-points-grid">
        ${kps
          .map(
            (kp, i) => `
          <div class="key-point-card">
            <h4><span style="color:var(--accent-emerald)">${i + 1}.</span> ${escapeHtml(kp.title)}</h4>
            <p>${escapeHtml(kp.desc)}</p>
          </div>`
          )
          .join("")}
      </div>
      ${typeof renderTopicExtras === "function" ? renderTopicExtras(subj, topic) : ""}
    </section>

    <section class="flow-step" id="paso-ejemplos">
      <h3 class="flow-step-title"><span>2</span> Ejemplos prácticos</h3>
      <div class="examples-list">
        ${exs
          .map((ex, i) => {
            const codeId = `code-${topic.key}-${i}`;
            return `
          <div class="example-card">
            <div class="example-header">
              <h3>⚡ ${escapeHtml(ex.title)}</h3>
              <span class="example-badge">${escapeHtml(ex.badge || "Caso práctico")}</span>
            </div>
            <div class="example-body">
              <div class="example-scenario"><strong>📌 Escenario:</strong> ${escapeHtml(ex.scenario)}</div>
              <div class="code-block-wrap">
                <div class="code-block-bar">
                  <span>Resolución paso a paso</span>
                  <button class="btn" style="padding:2px 8px; font-size:0.72rem;" onclick="copyCode('${codeId}')">📋 Copiar</button>
                </div>
                <pre id="${codeId}">${escapeHtml(ex.code_or_steps)}</pre>
              </div>
              <div class="example-takeaway"><strong>🎓 Para el examen:</strong> ${escapeHtml(ex.takeaway)}</div>
            </div>
          </div>`;
          })
          .join("")}
      </div>
    </section>

    <section class="flow-step" id="paso-repaso">
      <h3 class="flow-step-title"><span>3</span> Repaso rápido</h3>
      <details class="roadmap" open>
        <summary>🗺️ Esquema oficial del tema (clic en la imagen para ampliar)</summary>
        <div class="esquema-img-container">
          <img src="${topic.esquema_img}" alt="Esquema ${escapeHtml(topic.title)}" onclick="openModal('${topic.esquema_img}')" />
        </div>
      </details>
      <h4 class="flow-sub">🧠 Flashcards — intenta responder antes de girarlas</h4>
      <div class="flashcards-grid">
        ${fcs
          .map(
            (fc, i) => `
          <div class="flashcard" id="fc-${i}" onclick="flipFlashcard(${i})">
            <div>
              <div class="flashcard-tag" id="fc-tag-${i}">Pregunta #${i + 1}</div>
              <div class="flashcard-text" id="fc-txt-${i}" data-front="${escapeHtml(fc.front)}" data-back="${escapeHtml(fc.back)}">${escapeHtml(fc.front)}</div>
            </div>
            <div class="flashcard-hint">🔄 Clic para ver la respuesta</div>
          </div>`
          )
          .join("")}
      </div>
    </section>

    <section class="flow-step" id="paso-test">
      <h3 class="flow-step-title"><span>4</span> Test del tema ${topic.num} — comprueba lo aprendido</h3>
      ${renderTestTab(topic)}
    </section>
  `;

  // Cierre del tema y paso al siguiente
  let closing;
  if (finished) {
    const grade = ((sc.correct / sc.total) * 10).toFixed(1);
    const passed = sc.correct >= 5;
    closing = `
      <div class="flow-finish ${passed ? "ok" : "ko"}">
        <div>
          <h3>${passed ? "🎉 ¡Tema superado!" : "📚 Conviene repasar este tema"}</h3>
          <p>Resultado: <strong>${sc.correct}/${sc.total}</strong> aciertos · Nota <strong>${grade}/10</strong>.
          ${passed ? "Ya puedes pasar al siguiente tema." : "Revisa las explicaciones de las preguntas falladas y vuelve a intentarlo."}</p>
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          <button class="btn" onclick="resetTopicTest('${topic.key}'); scrollToStep('paso-test');">🔄 Repetir test</button>
          ${
            nextT
              ? `<button class="btn btn-primary" onclick="selectTopic('${nextT.key}')">Siguiente: Tema ${nextT.num}. ${escapeHtml(shortTitle(nextT))} →</button>`
              : `<button class="btn btn-primary" onclick="navigateSimulacro('${subj.id}')">🏁 Materia terminada — hacer simulacro final</button>`
          }
        </div>
      </div>`;
  } else {
    closing = `
      <div class="flow-finish">
        <div>
          <h3>✍️ Completa el test para cerrar el tema</h3>
          <p>Llevas <strong>${answered}/${topic.questions.length}</strong> preguntas respondidas.</p>
          <div class="progress-bar-bg" style="max-width:320px;"><div class="progress-bar-fill" style="width:${answered * 10}%"></div></div>
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
          ${prevT ? `<button class="btn" onclick="selectTopic('${prevT.key}')">← Tema ${prevT.num}</button>` : ""}
          ${nextT ? `<button class="btn" onclick="selectTopic('${nextT.key}')">Saltar al Tema ${nextT.num} →</button>` : ""}
        </div>
      </div>`;
  }

  return html + closing + (typeof renderTopicNotes === "function" ? renderTopicNotes(topic) : "");
}
