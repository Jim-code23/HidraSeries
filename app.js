const G = 9.81;

// Datos de materiales (ε en metros)
// Valores típicos tomados de tablas de rugosidad absoluta para tuberías nuevas
const MATERIALS = {
  steel: {
    name: "Acero comercial (acero al carbono)",
    epsilon: 0.000045   // 0.045 mm
  },
  stainless: {
    name: "Acero inoxidable",
    epsilon: 0.000015   // 0.015 mm
  },
  pvc: {
    name: "PVC liso",
    epsilon: 0.0000015  // 0.0015 mm
  },
  cpvc: {
    name: "CPVC",
    epsilon: 0.0000015
  },
  pe: {
    name: "Polietileno (PE)",
    epsilon: 0.000007
  },
  copper: {
    name: "Cobre",
    epsilon: 0.0000015
  },
  castiron: {
    name: "Hierro fundido (nuevo, revestido)",
    epsilon: 0.00012
  },
  aluminum: {
    name: "Aluminio",
    epsilon: 0.0000015
  }
};

// Diámetros internos típicos para tubería de acero (en metros)
const SCHEDULE_ID_M = {
  schedule40: {
    "0.125": 0.0068326,  // 1/8"
    "0.25":  0.0092456,  // 1/4"
    "0.375": 0.0125222,  // 3/8"
    "0.5":   0.0157988,  // 1/2"
    "0.75":  0.0209296,  // 3/4"
    "1":     0.0266446,  // 1"
    "1.25":  0.0350520,  // 1 1/4"
    "1.5":   0.0408940,  // 1 1/2"
    "2":     0.0525018,  // 2"
    "2.5":   0.0627126,  // 2 1/2"
    "3":     0.0779272,  // 3"
    "4":     0.1022604,  // 4"
    "5":     0.1281938,  // 5"
    "6":     0.1540510,  // 6"
    "8":     0.2027174,  // 8"
    "10":    0.2545080,  // 10"
    "12":    0.3048000   // 12"
  },
  schedule60: {
    "8":  0.1984502,     // 8"
    "10": 0.2476500,     // 10"
    "12": 0.2953004      // 12"
  },
  schedule80: {
    "0.125": 0.0054610,  // 1/8"
    "0.25":  0.0076708,  // 1/4"
    "0.375": 0.0107442,  // 3/8"
    "0.5":   0.0138684,  // 1/2"
    "0.75":  0.0188468,  // 3/4"
    "1":     0.0243078,  // 1"
    "1.25":  0.0324612,  // 1 1/4"
    "1.5":   0.0381000,  // 1 1/2"
    "2":     0.0492506,  // 2"
    "2.5":   0.0590042,  // 2 1/2"
    "3":     0.0736600,  // 3"
    "4":     0.0971804,  // 4"
    "5":     0.1222502,  // 5"
    "6":     0.1463294,  // 6"
    "8":     0.1936750,  // 8"
    "10":    0.2476500,  // 10"
    "12":    0.2984500   // 12"
  }
};

function inchesToMeters(inches) {
  return inches * 0.0254;
}

// Coeficientes K típicos de accesorios
const ACCESSORY_TYPES = {
  elbow90: { label: "Codo 90° estándar", K: 0.95 },
  elbow45: { label: "Codo 45°", K: 0.4 },
  tee_run: { label: "T (flujo en línea)", K: 0.6 },
  tee_branch: { label: "T (derivación)", K: 1.8 },
  globe_valve: { label: "Válvula globo (abierta)", K: 10.0 },
  gate_valve: { label: "Válvula compuerta (abierta)", K: 0.2 },
  sudden_contraction: { label: "Contracción súbita", K: 0.5 },
  sudden_expansion: { label: "Expansión súbita", K: 1.0 }
};

// --- Utilidades de UI ---

function smoothScrollTo(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - 72;
  window.scrollTo({ top: y, behavior: "smooth" });
}

function updateRowIndices(containerSelector, rowClass) {
  const rows = document.querySelectorAll(`${containerSelector} .${rowClass}`);
  rows.forEach((row, idx) => {
    const cell = row.querySelector(".row-index");
    if (cell) cell.textContent = idx + 1;
  });
}

// Actualiza el texto de la suma de longitudes de los tramos
function updateLengthHint() {
  const lengthInputs = document.querySelectorAll("#segmentsBody .length-input");
  let total = 0;
  lengthInputs.forEach(input => {
    const val = Number(input.value);
    if (!isNaN(val)) {
      total += val;
    }
  });

  const hint = document.getElementById("lengthHint");
  if (hint) {
    hint.textContent = `Suma actual de longitudes de los tramos: ${total.toFixed(2)} m`;
  }
}

// Rellena los selects de "Tramo asociado" en accesorios
function refreshAccessorySegmentOptions() {
  const segmentRows = document.querySelectorAll("#segmentsBody .segment-row");
  const options = Array.from(segmentRows).map((row, idx) => ({
    value: String(idx),
    label: `Tramo ${idx + 1}`
  }));

  const accRows = document.querySelectorAll("#accessoriesBody .accessory-row");
  accRows.forEach((row) => {
    const select = row.querySelector(".accessory-segment");
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = "";
    options.forEach((opt) => {
      const optionEl = document.createElement("option");
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      select.appendChild(optionEl);
    });
    if (options.length > 0) {
      if (currentValue && Number(currentValue) < options.length) {
        select.value = currentValue;
      } else {
        select.value = "0";
      }
    }
  });
}

// --- Cálculos hidráulicos ---

function computeReynolds(V, D, nu) {
  return (V * D) / nu;
}

function computeDarcyFrictionFactor(Re, epsilon, D) {
  if (Re <= 0) return null;

  // Laminar
  if (Re < 2300) {
    return 64 / Re;
  }

  // Turbulento: Swamee–Jain
  const term =
    (epsilon / D) / 3.7 +
    5.74 / Math.pow(Re, 0.9);
  const logTerm = Math.log10(term);
  const f = 0.25 / (logTerm * logTerm);
  return f;
}

// Devuelve el diámetro interno [m] según schedule o diámetro directo
function getInnerDiameterMetersForRow(row) {
  const mode = row.querySelector(".diameter-mode").value;

  // Modo: diámetro directo digitado por el usuario
  if (mode === "direct") {
    const dInput = row.querySelector(".diameter-input");
    const dUser = Number(dInput ? dInput.value : 0);
    if (!dUser || dUser <= 0) return null;
    return dUser; // ya en metros
  }

  // Modo: Schedule (40, 60, 80)
  const nps = row.querySelector(".nps-select").value;  // ej: "2", "1.5", "0.375"
  const table = SCHEDULE_ID_M[mode];

  if (!table) return null;

  const d = table[nps];

  // Si no hay datos para ese NPS + schedule
  if (typeof d !== "number" || d <= 0) {
    throw new Error(
      `No hay datos de diámetro interno para NPS ${nps}" en ${mode}. ` +
      `Usa un schedule distinto (40 u 80) o modo "Diámetro directo".`
    );
  }

  return d;
}

function computeSystemLosses() {
  const rho = Number(document.getElementById("fluidDensity").value);
  const nu = Number(document.getElementById("fluidNu").value);
  const Q = Number(document.getElementById("flowRate").value);

  if (!rho || !nu || !Q || rho <= 0 || nu <= 0 || Q <= 0) {
    throw new Error("Debes ingresar ρ, ν y Q con valores positivos.");
  }

  const segmentRows = document.querySelectorAll("#segmentsBody .segment-row");
  if (segmentRows.length === 0) {
    throw new Error("Debes agregar al menos un tramo de tubería.");
  }

  const segments = [];
  segmentRows.forEach((row, idx) => {
    const materialKey = row.querySelector(".material-select").value;
    const L = Number(row.querySelector(".length-input").value);

    if (!L || L <= 0) {
      throw new Error(`La longitud del tramo ${idx + 1} debe ser positiva.`);
    }

    const Dm = getInnerDiameterMetersForRow(row);
    if (!Dm || Dm <= 0) {
      throw new Error(`No se pudo determinar el diámetro interno en el tramo ${idx + 1}.`);
    }

    const mat = MATERIALS[materialKey];
    if (!mat) {
      throw new Error(`Material inválido en tramo ${idx + 1}.`);
    }

    const A = (Math.PI * Dm * Dm) / 4;
    const V = Q / A;
    const Re = computeReynolds(V, Dm, nu);
    const f = computeDarcyFrictionFactor(Re, mat.epsilon, Dm);
    if (!f || f <= 0) {
      throw new Error(`No fue posible calcular f en el tramo ${idx + 1}.`);
    }

    const hf = f * (L / Dm) * (V * V) / (2 * G);

    segments.push({
      index: idx,
      L,
      D: Dm,
      A,
      V,
      Re,
      f,
      hf
    });
  });

  const accessoryRows = document.querySelectorAll("#accessoriesBody .accessory-row");
  let hMinor = 0;

  accessoryRows.forEach((row, idx) => {
    const typeKey = row.querySelector(".accessory-type").value;
    const count = Number(row.querySelector(".accessory-count").value || 0);
    const segIndex = Number(row.querySelector(".accessory-segment").value || 0);

    if (!ACCESSORY_TYPES[typeKey]) {
      throw new Error(`Accesorio inválido en la fila ${idx + 1}.`);
    }
    if (count <= 0) return;

    const seg = segments[segIndex];
    if (!seg) {
      throw new Error(`El accesorio ${idx + 1} está asociado a un tramo inexistente.`);
    }

    const K = ACCESSORY_TYPES[typeKey].K;
    const hm = count * K * (seg.V * seg.V) / (2 * G);
    hMinor += hm;
  });

  const hfTotal = segments.reduce((sum, s) => sum + s.hf, 0);
  const hTotal = hfTotal + hMinor;

  return {
    rho,
    nu,
    Q,
    segments,
    hfTotal,
    hMinor,
    hTotal
  };
}

// --- Configuración de ejercicio para estadísticas ---

function getExerciseConfigSnapshot() {
  const rho = Number(document.getElementById("fluidDensity").value);
  const nu = Number(document.getElementById("fluidNu").value);
  const Q = Number(document.getElementById("flowRate").value);

  const segmentRows = document.querySelectorAll("#segmentsBody .segment-row");
  const accessoryRows = document.querySelectorAll("#accessoriesBody .accessory-row");

  const segments = Array.from(segmentRows).map((row) => ({
    material: row.querySelector(".material-select").value,
    mode: row.querySelector(".diameter-mode").value,
    nps: row.querySelector(".nps-select").value,
    D: Number(row.querySelector(".diameter-input").value || 0),
    L: Number(row.querySelector(".length-input").value || 0)
  }));

  const accessories = Array.from(accessoryRows).map((row) => ({
    type: row.querySelector(".accessory-type").value,
    count: Number(row.querySelector(".accessory-count").value || 0),
    seg: Number(row.querySelector(".accessory-segment").value || 0)
  }));

  return { rho, nu, Q, segments, accessories };
}

function getExerciseId() {
  const snapshot = getExerciseConfigSnapshot();
  return JSON.stringify(snapshot);
}

function loadStatsForExercise(exerciseId) {
  const key = "hidraseries_stats_" + exerciseId;
  const raw = localStorage.getItem(key);
  if (!raw) {
    return {
      attempts: 0,
      green: 0,
      yellow: 0,
      red: 0
    };
  }
  try {
    const obj = JSON.parse(raw);
    return Object.assign(
      {
        attempts: 0,
        green: 0,
        yellow: 0,
        red: 0
      },
      obj
    );
  } catch {
    return {
      attempts: 0,
      green: 0,
      yellow: 0,
      red: 0
    };
  }
}

function saveStatsForExercise(exerciseId, stats) {
  const key = "hidraseries_stats_" + exerciseId;
  localStorage.setItem(key, JSON.stringify(stats));
}

function updateStatsPanel(exerciseId) {
  const stats = loadStatsForExercise(exerciseId);
  const panel = document.getElementById("statsPanel");
  const summaryEl = document.getElementById("statsSummary");
  const greenEl = document.getElementById("statsGreen");
  const yellowEl = document.getElementById("statsYellow");
  const redEl = document.getElementById("statsRed");

  if (!panel || !summaryEl) return;

  if (stats.attempts === 0) {
    panel.classList.add("hidden");
    return;
  }

  let dominantColor = null;
  let maxCount = -1;
  ["green", "yellow", "red"].forEach((c) => {
    if (stats[c] > maxCount) {
      maxCount = stats[c];
      dominantColor = c;
    }
  });

  let colorName = "Sin datos";
  if (dominantColor === "green") colorName = "Verde (muy cercanas)";
  else if (dominantColor === "yellow") colorName = "Amarillo (aproximadas)";
  else if (dominantColor === "red") colorName = "Rojo (alejadas)";

  summaryEl.textContent =
    `Intentos registrados (en este navegador): ${stats.attempts}. ` +
    `Color más frecuente: ${colorName}.`;

  greenEl.textContent = stats.green;
  yellowEl.textContent = stats.yellow;
  redEl.textContent = stats.red;

  panel.classList.remove("hidden");
}

// --- Tema claro / oscuro ---

function applyTheme(theme) {
  const body = document.body;
  const toggle = document.getElementById("themeToggle");
  body.classList.remove("theme-light", "theme-dark");
  if (theme === "dark") {
    body.classList.add("theme-dark");
    if (toggle) toggle.querySelector(".icon").textContent = "🌙";
  } else {
    body.classList.add("theme-light");
    if (toggle) toggle.querySelector(".icon").textContent = "🌞";
  }
}

function initTheme() {
  const stored = localStorage.getItem("hidraseries_theme");
  const prefersDark = window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const theme = stored || (prefersDark ? "dark" : "light");
  applyTheme(theme);
}

// --- Inicialización de filas iniciales ---

function addInitialRows() {
  const segmentsBody = document.getElementById("segmentsBody");
  const accessoriesBody = document.getElementById("accessoriesBody");
  const segTpl = document.getElementById("segment-row-template");
  const accTpl = document.getElementById("accessory-row-template");

  if (segTpl && segmentsBody) {
    const clone = segTpl.content.cloneNode(true);
    segmentsBody.appendChild(clone);
    updateRowIndices("#segmentsBody", "segment-row");
    updateLengthHint();
  }

  if (accTpl && accessoriesBody) {
    const cloneA = accTpl.content.cloneNode(true);
    accessoriesBody.appendChild(cloneA);
    updateRowIndices("#accessoriesBody", "accessory-row");
  }

  refreshAccessorySegmentOptions();
}

// --- Listeners de UI ---

function attachEventListeners() {
  // Navegación
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (target.matches(".nav-link") || target.closest(".hero-card")) {
      const btn = target.closest("[data-scroll]");
      if (btn) {
        const selector = btn.getAttribute("data-scroll");
        if (selector) {
          e.preventDefault();
          smoothScrollTo(selector);
        }
      }
    }
  });

  // Tema
  const themeBtn = document.getElementById("themeToggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const isDark = document.body.classList.contains("theme-dark");
      const next = isDark ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem("hidraseries_theme", next);
    });
  }

  // Agregar tramo
  const addSegmentBtn = document.getElementById("addSegmentBtn");
  if (addSegmentBtn) {
    addSegmentBtn.addEventListener("click", () => {
      const segTpl = document.getElementById("segment-row-template");
      const segmentsBody = document.getElementById("segmentsBody");
      if (!segTpl || !segmentsBody) return;
      const clone = segTpl.content.cloneNode(true);
      segmentsBody.appendChild(clone);
      updateRowIndices("#segmentsBody", "segment-row");
      refreshAccessorySegmentOptions();
      updateLengthHint();
    });
  }

  // Botón para definir número de tramos y longitud total
  const configureSegmentsBtn = document.getElementById("configureSegmentsBtn");
  if (configureSegmentsBtn) {
    configureSegmentsBtn.addEventListener("click", () => {
      const segmentsBody = document.getElementById("segmentsBody");
      const segTpl = document.getElementById("segment-row-template");
      if (!segmentsBody || !segTpl) return;

      const nStr = prompt("¿Cuántos tramos de tubería deseas crear? (entero ≥ 1)");
      if (nStr === null) return;
      const n = parseInt(nStr, 10);
      if (!n || n < 1) {
        alert("Debes ingresar un número entero mayor o igual que 1.");
        return;
      }

      const LtotStr = prompt("¿Cuál es la longitud total de la tubería que deseas modelar? [m] (puedes dejar en blanco si no quieres fijarla)");
      let Ltot = null;
      if (LtotStr !== null && LtotStr.trim() !== "") {
        const Lnum = Number(LtotStr);
        if (!isNaN(Lnum) && Lnum > 0) {
          Ltot = Lnum;
        } else {
          alert("La longitud total debe ser un número positivo. Se ignorará este valor.");
        }
      }

      // Limpiar tramos anteriores
      segmentsBody.innerHTML = "";

      // Crear n tramos
      for (let i = 0; i < n; i++) {
        const clone = segTpl.content.cloneNode(true);
        segmentsBody.appendChild(clone);
      }
      updateRowIndices("#segmentsBody", "segment-row");
      refreshAccessorySegmentOptions();

      // Si hay longitud total, repartirla en los tramos como valor inicial
      if (Ltot !== null) {
        const lengthInputs = segmentsBody.querySelectorAll(".length-input");
        const Lseg = Ltot / n;
        lengthInputs.forEach(input => {
          input.value = Lseg.toFixed(2);
        });

        const targetLengthInput = document.getElementById("targetLength");
        if (targetLengthInput) {
          targetLengthInput.value = Ltot;
        }
      }

      updateLengthHint();
    });
  }

  // Agregar accesorio
  const addAccessoryBtn = document.getElementById("addAccessoryBtn");
  if (addAccessoryBtn) {
    addAccessoryBtn.addEventListener("click", () => {
      const accTpl = document.getElementById("accessory-row-template");
      const accessoriesBody = document.getElementById("accessoriesBody");
      if (!accTpl || !accessoriesBody) return;
      const clone = accTpl.content.cloneNode(true);
      accessoriesBody.appendChild(clone);
      updateRowIndices("#accessoriesBody", "accessory-row");
      refreshAccessorySegmentOptions();
    });
  }

  // Delegación para eliminar filas
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!target.matches(".btn-remove-row")) return;
    const row = target.closest("tr");
    if (!row) return;

    const tbody = row.parentElement;
    row.remove();

    if (tbody && tbody.id === "segmentsBody") {
      updateRowIndices("#segmentsBody", "segment-row");
      refreshAccessorySegmentOptions();
      updateLengthHint();
    } else if (tbody && tbody.id === "accessoriesBody") {
      updateRowIndices("#accessoriesBody", "accessory-row");
    }
  });

  // Cambios en tipo de diámetro y longitudes
  document.addEventListener("change", (e) => {
    const target = e.target;

    if (target.matches(".diameter-mode")) {
      const row = target.closest(".segment-row");
      if (!row) return;

      const mode = target.value;
      const npsSelect = row.querySelector(".nps-select");
      const dInput = row.querySelector(".diameter-input");

      if (mode === "direct") {
        if (npsSelect) npsSelect.disabled = true;
        if (dInput) {
          dInput.disabled = false;
        }
      } else {
        if (npsSelect) npsSelect.disabled = false;
        if (dInput) {
          dInput.disabled = true;
          dInput.value = "";
        }
      }
    }

    if (target.classList && target.classList.contains("length-input")) {
      updateLengthHint();
    }

    if (e.target.closest("#segmentsBody")) {
      refreshAccessorySegmentOptions();
    }
  });

  // Botón de calificar
  const gradeBtn = document.getElementById("gradeBtn");
  if (gradeBtn) {
    gradeBtn.addEventListener("click", () => {
      const resultPanel = document.getElementById("resultPanel");
      const resultBadge = document.getElementById("resultBadge");
      const resultDetails = document.getElementById("resultDetails");

      if (resultPanel) resultPanel.classList.add("hidden");

      let exerciseId;
      try {
        const losses = computeSystemLosses();
        const userValue = Number(document.getElementById("userHeadLoss").value);

        if (!userValue && userValue !== 0) {
          throw new Error("Debes digitar tu respuesta para hL total antes de calificar.");
        }

        const trueValue = losses.hTotal;
        const errorRel = Math.abs((userValue - trueValue) / trueValue) * 100;

        let colorClass = "red";
        let label = "Rojo";
        let description = "La respuesta se aleja bastante del valor calculado.";

        if (errorRel <= 5) {
          colorClass = "green";
          label = "Verde";
          description = "Respuesta muy cercana a la solución.";
        } else if (errorRel <= 10) {
          colorClass = "yellow";
          label = "Amarillo";
          description = "Respuesta razonablemente aproximada, pero con margen de mejora.";
        }

        if (resultPanel && resultBadge && resultDetails) {
          resultBadge.className = "result-badge " + colorClass;
          resultBadge.textContent = `${label} · error ≈ ${errorRel.toFixed(2)} %`;

          const parts = [];
          parts.push(
            `Pérdidas mayores (tramos rectos): h_f ≈ ${losses.hfTotal.toFixed(4)} m`
          );
          parts.push(
            `Pérdidas menores (accesorios): h_m ≈ ${losses.hMinor.toFixed(4)} m`
          );
          parts.push(
            `Pérdida de carga total calculada: h_L,total ≈ ${trueValue.toFixed(4)} m`
          );

          resultDetails.innerHTML =
            `<p>${description}</p><p>${parts.join("<br>")}</p>`;

          resultPanel.classList.remove("hidden");
        }

        exerciseId = getExerciseId();
        const stats = loadStatsForExercise(exerciseId);
        stats.attempts += 1;
        if (colorClass === "green") stats.green += 1;
        else if (colorClass === "yellow") stats.yellow += 1;
        else stats.red += 1;

        saveStatsForExercise(exerciseId, stats);
        updateStatsPanel(exerciseId);
      } catch (err) {
        alert(err.message || "Ocurrió un error al calcular el ejercicio.");
        if (exerciseId) {
          updateStatsPanel(exerciseId);
        }
      }
    });
  }

  // Actualizar panel de estadísticas cuando cambie algo relevante
  ["fluidDensity", "fluidNu", "flowRate"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => {
        const exerciseId = getExerciseId();
        updateStatsPanel(exerciseId);
      });
    }
  });

  document.addEventListener("change", (e) => {
    if (
      e.target.closest("#segmentsBody") ||
      e.target.closest("#accessoriesBody")
    ) {
      const exerciseId = getExerciseId();
      updateStatsPanel(exerciseId);
    }
  });
}

// --- Arranque ---

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  addInitialRows();
  attachEventListeners();

  const exerciseId = getExerciseId();
  updateStatsPanel(exerciseId);
});
