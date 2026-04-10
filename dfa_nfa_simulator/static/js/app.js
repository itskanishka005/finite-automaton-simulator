/* ═══════════════════════════════════════════
   AUTOMATA STUDIO — app.js
═══════════════════════════════════════════ */
"use strict";

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const state = {
  type: "DFA",
  mode: "manual",          // "manual" | "auto"
  automaton: {
    type: "DFA",
    states: [],
    alphabet: [],
    transitions: {},       // DFA: {s:{sym:s2}}, NFA: {s:{sym:[s2,...]}}
    start_state: null,
    accepting_states: []
  },
  // SVG positions
  positions: {},           // {stateName: {x,y}}
  // Simulation
  simSteps: [],
  simIndex: -1,
  simTimer: null,
  simRunning: false,
  simDone: false
};

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const qs = (sel, el = document) => el.querySelector(sel);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
}

function notify(msg, type = "info") {
  // simple toast-free feedback: just console + possible future extension
  console.log(`[${type}] ${msg}`);
}

// ─────────────────────────────────────────────
// LANDING
// ─────────────────────────────────────────────
document.querySelectorAll(".type-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    state.type = btn.dataset.type;
    state.automaton.type = state.type;
    $("modeLabel").textContent = state.type;
    // NFA gets ε in alphabet-like UI but not literally added — handled in trans selector
    showScreen("app");
    resetAll();
  });
});

$("backBtn").addEventListener("click", () => {
  clearSimTimer();
  showScreen("landing");
});

// ─────────────────────────────────────────────
// MODE TOGGLE (manual / auto)
// ─────────────────────────────────────────────
document.querySelectorAll(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.mode = btn.dataset.mode;
    $("manualPanel").classList.toggle("hidden", state.mode !== "manual");
    $("autoPanel").classList.toggle("hidden",   state.mode !== "auto");
  });
});

// ─────────────────────────────────────────────
// ALPHABET
// ─────────────────────────────────────────────
$("setAlphabetBtn").addEventListener("click", setAlphabet);
$("alphabetInput").addEventListener("keydown", e => { if (e.key === "Enter") setAlphabet(); });

function setAlphabet() {
  const raw = $("alphabetInput").value.trim();
  if (!raw) return;
  const syms = [...new Set(raw.split(",").map(s => s.trim()).filter(Boolean))];
  state.automaton.alphabet = syms;
  renderAlphabetTags();
  refreshTransSelectors();
  renderTransTable();
}

function renderAlphabetTags() {
  const row = $("alphabetDisplay");
  row.innerHTML = "";
  const syms = state.automaton.alphabet;
  if (state.type === "NFA") syms.concat(["ε"]).forEach(addTag);
  else syms.forEach(addTag);
  function addTag(s) {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = s;
    row.appendChild(span);
  }
}

// ─────────────────────────────────────────────
// STATES
// ─────────────────────────────────────────────
$("addStateBtn").addEventListener("click", addState);
$("stateInput").addEventListener("keydown", e => { if (e.key === "Enter") addState(); });

function addState() {
  const name = $("stateInput").value.trim();
  if (!name || state.automaton.states.includes(name)) return;
  state.automaton.states.push(name);
  if (!state.automaton.transitions[name]) state.automaton.transitions[name] = {};
  // auto-position in a circle
  autoPosition(name);
  $("stateInput").value = "";
  renderStateList();
  refreshTransSelectors();
  renderCanvas();
  renderTransTable();
}

function autoPosition(name) {
  const n = state.automaton.states.length;
  const r = Math.max(120, n * 40);
  const angle = ((n - 1) / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
  const cx = 300, cy = 220;
  state.positions[name] = {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle)
  };
  // Relayout all existing states in circle
  const all = state.automaton.states;
  all.forEach((s, i) => {
    const a = (i / all.length) * 2 * Math.PI - Math.PI / 2;
    const rr = Math.max(130, all.length * 38);
    if (!state.positions[s] || true) {
      state.positions[s] = { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) };
    }
  });
}

function removeState(name) {
  state.automaton.states = state.automaton.states.filter(s => s !== name);
  delete state.automaton.transitions[name];
  // Remove from transitions that point to it
  for (const s in state.automaton.transitions) {
    for (const sym in state.automaton.transitions[s]) {
      const t = state.automaton.transitions[s][sym];
      if (state.type === "DFA") {
        if (t === name) delete state.automaton.transitions[s][sym];
      } else {
        if (Array.isArray(t)) {
          state.automaton.transitions[s][sym] = t.filter(x => x !== name);
          if (state.automaton.transitions[s][sym].length === 0)
            delete state.automaton.transitions[s][sym];
        }
      }
    }
  }
  if (state.automaton.start_state === name) state.automaton.start_state = null;
  state.automaton.accepting_states = state.automaton.accepting_states.filter(s => s !== name);
  delete state.positions[name];
  renderStateList();
  refreshTransSelectors();
  renderCanvas();
  renderTransTable();
  renderTransList();
}

function renderStateList() {
  const list = $("stateList");
  list.innerHTML = "";
  state.automaton.states.forEach(name => {
    const isStart  = state.automaton.start_state === name;
    const isAccept = state.automaton.accepting_states.includes(name);
    const item = document.createElement("div");
    item.className = "state-item";
    item.innerHTML = `
      <span class="state-name">${name}</span>
      <div class="state-flags">
        <button class="flag-btn ${isStart  ? "active-start"  : ""}" data-action="start"  data-name="${name}" title="Set as start state">S</button>
        <button class="flag-btn ${isAccept ? "active-accept" : ""}" data-action="accept" data-name="${name}" title="Toggle accept state">F</button>
      </div>
      <button class="del-btn" data-name="${name}" title="Remove state">×</button>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll(".flag-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const n = btn.dataset.name;
      if (btn.dataset.action === "start") {
        state.automaton.start_state = n;
      } else {
        const idx = state.automaton.accepting_states.indexOf(n);
        if (idx >= 0) state.automaton.accepting_states.splice(idx, 1);
        else state.automaton.accepting_states.push(n);
      }
      renderStateList();
      renderCanvas();
    });
  });

  list.querySelectorAll(".del-btn").forEach(btn => {
    btn.addEventListener("click", () => removeState(btn.dataset.name));
  });
}

// ─────────────────────────────────────────────
// TRANSITIONS (manual)
// ─────────────────────────────────────────────
function refreshTransSelectors() {
  const states  = state.automaton.states;
  const syms    = state.type === "NFA"
    ? [...state.automaton.alphabet, "ε"]
    : state.automaton.alphabet;

  ["tranFrom", "tranTo"].forEach(id => {
    const sel = $(id);
    sel.innerHTML = states.map(s => `<option value="${s}">${s}</option>`).join("");
  });

  const symSel = $("tranSym");
  symSel.innerHTML = syms.map(s => `<option value="${s}">${s}</option>`).join("");
}

$("addTransBtn").addEventListener("click", () => {
  const from = $("tranFrom").value;
  const sym  = $("tranSym").value;
  const to   = $("tranTo").value;
  if (!from || !sym || !to) return;

  if (state.type === "DFA") {
    if (!state.automaton.transitions[from]) state.automaton.transitions[from] = {};
    state.automaton.transitions[from][sym] = to;
  } else {
    if (!state.automaton.transitions[from]) state.automaton.transitions[from] = {};
    if (!state.automaton.transitions[from][sym]) state.automaton.transitions[from][sym] = [];
    if (!state.automaton.transitions[from][sym].includes(to))
      state.automaton.transitions[from][sym].push(to);
  }

  renderTransList();
  renderCanvas();
  renderTransTable();
});

function renderTransList() {
  const list = $("transList");
  list.innerHTML = "";
  const trans = state.automaton.transitions;
  for (const from in trans) {
    for (const sym in trans[from]) {
      const targets = state.type === "DFA" ? [trans[from][sym]] : trans[from][sym];
      targets.forEach(to => {
        const item = document.createElement("div");
        item.className = "trans-item";
        item.innerHTML = `
          <span>δ(${from}, ${sym}) → ${to}</span>
          <button class="del-btn" title="Remove">×</button>
        `;
        item.querySelector(".del-btn").addEventListener("click", () => {
          removeTransition(from, sym, to);
        });
        list.appendChild(item);
      });
    }
  }
}

function removeTransition(from, sym, to) {
  if (state.type === "DFA") {
    delete state.automaton.transitions[from][sym];
  } else {
    state.automaton.transitions[from][sym] =
      (state.automaton.transitions[from][sym] || []).filter(t => t !== to);
    if (!state.automaton.transitions[from][sym].length)
      delete state.automaton.transitions[from][sym];
  }
  renderTransList();
  renderCanvas();
  renderTransTable();
}

// ─────────────────────────────────────────────
// AUTO GENERATE
// ─────────────────────────────────────────────
$("generateBtn").addEventListener("click", async () => {
  const alphRaw = $("autoAlphabet").value.trim();
  const strsRaw = $("autoAcceptStrings").value.trim();
  if (!alphRaw) { alert("Please enter an alphabet."); return; }

  const alphabet      = alphRaw.split(",").map(s => s.trim()).filter(Boolean);
  const accept_strings = strsRaw ? strsRaw.split("\n").map(s => s.trim()).filter(Boolean) : [];

  try {
    const res = await fetch("/api/autogenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: state.type, alphabet, accept_strings })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Generation failed"); return; }

    loadAutomaton(data.automaton);
  } catch(e) {
    alert("Network error: " + e.message);
  }
});

function loadAutomaton(automaton) {
  state.automaton = automaton;
  state.automaton.type = state.type;

  // Position states in circle
  const n = automaton.states.length;
  const cx = 300, cy = 220;
  automaton.states.forEach((s, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = Math.max(130, n * 38);
    state.positions[s] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });

  renderStateList();
  refreshTransSelectors();
  renderTransList();
  renderCanvas();
  renderTransTable();
  renderAlphabetTags();
}

// ─────────────────────────────────────────────
// SIMULATION
// ─────────────────────────────────────────────
$("stepBtn").addEventListener("click", () => {
  if (state.simDone) return;
  if (state.simSteps.length === 0) initSim();
  else advanceSim();
});

$("autoRunBtn").addEventListener("click", () => {
  if (state.simDone) return;
  if (!state.simRunning) {
    if (state.simSteps.length === 0) initSim();
    startAutoRun();
  } else {
    stopAutoRun();
  }
});

$("resetSimBtn").addEventListener("click", resetSim);

$("speedSlider").addEventListener("input", () => {
  const v = +$("speedSlider").value;
  $("speedVal").textContent = v + "×";
  if (state.simRunning) {
    stopAutoRun();
    startAutoRun();
  }
});

async function initSim() {
  const input = $("testInput").value;
  const automaton = state.automaton;

  // Validate before calling backend
  if (!automaton.states.length) { alert("No states defined."); return; }
  if (!automaton.start_state) { alert("No start state set."); return; }

  try {
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ automaton, input_string: input })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Simulation error"); return; }

    state.simSteps = data.steps;
    state.simSteps._final = data;
    state.simIndex = -1;
    $("simLog").innerHTML = "";
    $("resultBanner").classList.add("hidden");
    clearSimHighlights();
    advanceSim();
  } catch(e) {
    alert("Network error: " + e.message);
  }
}

function advanceSim() {
  if (state.simIndex >= state.simSteps.length - 1) {
    finalizeSim();
    return;
  }
  state.simIndex++;
  const step = state.simSteps[state.simIndex];
  applySimStep(step);
}

function applySimStep(step) {
  clearSimHighlights();

  // Highlight current states
  step.current_states.forEach(s => {
    const el = document.querySelector(`.state-group[data-name="${s}"] circle.state-circle`);
    if (el) el.classList.add("current");
  });

  // Highlight transitions being taken
  step.next_states.forEach(nxt => {
    step.current_states.forEach(from => {
      highlightTransition(from, step.symbol, nxt, "active");
    });
  });

  // Log entry
  const log = $("simLog");
  const entry = document.createElement("div");
  entry.className = "log-entry active";
  entry.textContent = step.transition || `Read '${step.symbol}' from {${step.current_states.join(",")}}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;

  // Highlight taken next states after brief pause
  setTimeout(() => {
    step.next_states.forEach(s => {
      const el = document.querySelector(`.state-group[data-name="${s}"] circle.state-circle`);
      if (el) { el.classList.remove("current"); el.classList.add("current"); }
    });
    step.current_states.forEach(from => {
      step.next_states.forEach(nxt => highlightTransition(from, step.symbol, nxt, "taken"));
    });
    entry.classList.remove("active");
    entry.classList.add("taken");
  }, getStepDelay() * 0.4);

  // Update table highlight
  highlightTableRow(step.current_states, step.symbol, step.next_states);
}

function finalizeSim() {
  state.simDone = true;
  stopAutoRun();
  const result = state.simSteps._final;
  clearSimHighlights();

  result.final_states.forEach(s => {
    const el = document.querySelector(`.state-group[data-name="${s}"] circle.state-circle`);
    if (el) el.classList.add(result.accepted ? "accepted" : "rejected");
  });

  const banner = $("resultBanner");
  banner.className = "result-banner " + (result.accepted ? "accepted-res" : "rejected-res");
  $("resultIcon").textContent = result.accepted ? "✓" : "✗";
  $("resultText").textContent = result.accepted ? "Accepted" : "Rejected";
  banner.classList.remove("hidden");

  const log = $("simLog");
  const entry = document.createElement("div");
  entry.className = "log-entry " + (result.accepted ? "taken" : "error");
  entry.textContent = result.accepted
    ? `✓ String accepted — final state: {${result.final_states.join(",")}}`
    : `✗ String rejected — final state: {${result.final_states.join(",")}}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function startAutoRun() {
  state.simRunning = true;
  $("autoRunBtn").textContent = "Pause";
  $("autoRunBtn").classList.add("running");
  scheduleNext();
}

function scheduleNext() {
  if (!state.simRunning || state.simDone) return;
  if (state.simIndex >= state.simSteps.length - 1) {
    finalizeSim();
    return;
  }
  state.simTimer = setTimeout(() => {
    advanceSim();
    scheduleNext();
  }, getStepDelay());
}

function stopAutoRun() {
  clearSimTimer();
  state.simRunning = false;
  $("autoRunBtn").textContent = "Auto Run";
  $("autoRunBtn").classList.remove("running");
}

function clearSimTimer() {
  if (state.simTimer) { clearTimeout(state.simTimer); state.simTimer = null; }
}

function getStepDelay() {
  const v = +$("speedSlider").value; // 1-5
  return Math.round(1800 / v);
}

function clearSimHighlights() {
  document.querySelectorAll(".state-circle").forEach(el => {
    el.classList.remove("current", "accepted", "rejected");
  });
  document.querySelectorAll(".trans-line").forEach(el => {
    el.classList.remove("active", "taken");
  });
  document.querySelectorAll(".trans-label").forEach(el => {
    el.classList.remove("active", "taken");
  });
  document.querySelectorAll(".trans-table td").forEach(td => {
    td.classList.remove("current-row", "taken-cell");
  });
}

function resetSim() {
  clearSimTimer();
  state.simSteps = [];
  state.simIndex = -1;
  state.simRunning = false;
  state.simDone = false;
  $("autoRunBtn").textContent = "Auto Run";
  $("autoRunBtn").classList.remove("running");
  $("simLog").innerHTML = '<div class="log-empty">Run a simulation to see the trace here.</div>';
  $("resultBanner").classList.add("hidden");
  clearSimHighlights();
}

// ─────────────────────────────────────────────
// SVG CANVAS
// ─────────────────────────────────────────────
const R = 28; // state radius
let viewX = 0, viewY = 0, viewScale = 1;
let dragging = null, dragOffset = {x:0,y:0};
let panStart = null, panViewStart = null;

function renderCanvas() {
  const root = $("svgRoot");
  root.innerHTML = "";

  const states = state.automaton.states;
  const trans  = state.automaton.transitions;

  if (!states.length) {
    $("emptyState").classList.remove("hidden");
    return;
  }
  $("emptyState").classList.add("hidden");

  // apply view transform
  root.setAttribute("transform", `translate(${viewX},${viewY}) scale(${viewScale})`);

  // Draw transitions first (below states)
  const transLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  transLayer.id = "transLayer";

  // Collect all transition entries
  const edges = [];
  for (const from in trans) {
    for (const sym in trans[from]) {
      const targets = state.type === "DFA"
        ? (trans[from][sym] ? [trans[from][sym]] : [])
        : (trans[from][sym] || []);
      targets.forEach(to => edges.push({ from, sym, to }));
    }
  }

  // Group edges by (from,to) pair for offset calculation
  const pairMap = {};
  edges.forEach(e => {
    const key = [e.from, e.to].sort().join("|||");
    if (!pairMap[key]) pairMap[key] = [];
    pairMap[key].push(e);
  });

  // Draw edges grouped by (from,to), combining labels
  const drawn = new Set();
  edges.forEach(edge => {
    const key = [edge.from, edge.to].sort().join("|||");
    if (drawn.has(`${edge.from}->${edge.to}`)) return;
    drawn.add(`${edge.from}->${edge.to}`);

    // Collect all symbols for this directed pair
    const symsForPair = edges
      .filter(e => e.from === edge.from && e.to === edge.to)
      .map(e => e.sym);

    drawEdge(transLayer, edge.from, edge.to, symsForPair, pairMap, edges);
  });

  root.appendChild(transLayer);

  // Draw states
  const stateLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  stateLayer.id = "stateLayer";

  states.forEach(name => {
    const pos = state.positions[name] || { x: 100, y: 100 };
    const isAccept = state.automaton.accepting_states.includes(name);
    const isStart  = state.automaton.start_state === name;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("state-group");
    g.setAttribute("data-name", name);

    // Start arrow
    if (isStart) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", pos.x - R - 28);
      line.setAttribute("y1", pos.y);
      line.setAttribute("x2", pos.x - R - 4);
      line.setAttribute("y2", pos.y);
      line.classList.add("start-arrow");
      g.appendChild(line);
    }

    // Circle
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", pos.x);
    circle.setAttribute("cy", pos.y);
    circle.setAttribute("r", R);
    circle.classList.add("state-circle");
    g.appendChild(circle);

    // Accept ring
    if (isAccept) {
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", pos.x);
      ring.setAttribute("cy", pos.y);
      ring.setAttribute("r", R - 5);
      ring.classList.add("accept-ring");
      g.appendChild(ring);
    }

    // Label
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", pos.x);
    label.setAttribute("y", pos.y);
    label.classList.add("state-label");
    label.textContent = name;
    g.appendChild(label);

    // Drag listeners
    g.addEventListener("mousedown", e => startDrag(e, name));
    g.addEventListener("touchstart", e => startDragTouch(e, name), { passive: false });

    stateLayer.appendChild(g);
  });

  root.appendChild(stateLayer);
}

function drawEdge(layer, from, to, syms, pairMap, edges) {
  const p1 = state.positions[from];
  const p2 = state.positions[to];
  if (!p1 || !p2) return;

  const label = syms.join(",");
  const key = [from, to].sort().join("|||");
  const revExists = edges.some(e => e.from === to && e.to === from);

  let pathD, lx, ly;

  if (from === to) {
    // Self-loop
    const cx = p1.x, cy = p1.y - R * 2.2;
    const r = R * 1.1;
    pathD = `M ${p1.x - R * 0.5} ${p1.y - R * 0.8}
             C ${p1.x - R * 2} ${p1.y - R * 3.5} ${p1.x + R * 2} ${p1.y - R * 3.5}
             ${p1.x + R * 0.5} ${p1.y - R * 0.8}`;
    lx = cx; ly = cy - r * 0.4;
  } else if (revExists && from > to) {
    // Curved (reverse arc)
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    const perp = { x: -dy / len * 40, y: dx / len * 40 };
    const cx = mx + perp.x, cy = my + perp.y;
    const { x: sx, y: sy } = circleIntersect(p1, R, cx, cy);
    const { x: ex, y: ey } = circleIntersect(p2, R, cx, cy);
    pathD = `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
    lx = cx; ly = cy;
  } else if (revExists) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    const perp = { x: dy / len * 40, y: -dx / len * 40 };
    const cx = mx + perp.x, cy = my + perp.y;
    const { x: sx, y: sy } = circleIntersect(p1, R, cx, cy);
    const { x: ex, y: ey } = circleIntersect(p2, R, cx, cy);
    pathD = `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
    lx = cx; ly = cy;
  } else {
    // Straight
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const nx = dx / len, ny = dy / len;
    const sx = p1.x + nx * R, sy = p1.y + ny * R;
    const ex = p2.x - nx * R, ey = p2.y - ny * R;
    pathD = `M ${sx} ${sy} L ${ex} ${ey}`;
    lx = (sx + ex) / 2 - ny * 14;
    ly = (sy + ey) / 2 + nx * 14;
  }

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  path.classList.add("trans-line");
  path.setAttribute("data-from", from);
  path.setAttribute("data-to", to);
  path.setAttribute("data-syms", syms.join(","));
  layer.appendChild(path);

  // Label background
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", (lx || 0) - label.length * 3.5 - 3);
  bg.setAttribute("y", (ly || 0) - 8);
  bg.setAttribute("width", label.length * 7 + 6);
  bg.setAttribute("height", 16);
  bg.setAttribute("rx", "3");
  bg.setAttribute("fill", "var(--bg)");
  bg.setAttribute("opacity", ".85");
  layer.appendChild(bg);

  const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
  lbl.setAttribute("x", lx || 0);
  lbl.setAttribute("y", ly || 0);
  lbl.classList.add("trans-label");
  lbl.setAttribute("data-from", from);
  lbl.setAttribute("data-to", to);
  lbl.setAttribute("data-syms", syms.join(","));
  lbl.textContent = label;
  layer.appendChild(lbl);
}

function circleIntersect(center, r, qx, qy) {
  const dx = qx - center.x, dy = qy - center.y;
  const len = Math.hypot(dx, dy);
  return { x: center.x + dx / len * r, y: center.y + dy / len * r };
}

function highlightTransition(from, sym, to, cls) {
  document.querySelectorAll(`.trans-line[data-from="${from}"][data-to="${to}"]`).forEach(el => {
    if (el.getAttribute("data-syms").split(",").includes(sym)) {
      el.classList.add(cls);
    }
  });
  document.querySelectorAll(`.trans-label[data-from="${from}"][data-to="${to}"]`).forEach(el => {
    if (el.getAttribute("data-syms").split(",").includes(sym)) {
      el.classList.add(cls);
    }
  });
}

// ─────────────────────────────────────────────
// DRAG STATES
// ─────────────────────────────────────────────
function svgPoint(e) {
  const svg = $("automataCanvas");
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const ctm = $("svgRoot").getScreenCTM();
  return pt.matrixTransform(ctm.inverse());
}

function startDrag(e, name) {
  e.stopPropagation();
  dragging = name;
  const p = svgPoint(e);
  dragOffset = { x: p.x - state.positions[name].x, y: p.y - state.positions[name].y };
  document.addEventListener("mousemove", onDrag);
  document.addEventListener("mouseup", endDrag);
}

function startDragTouch(e, name) {
  e.preventDefault();
  e.stopPropagation();
  dragging = name;
  const touch = e.touches[0];
  const p = svgPointFromCoords(touch.clientX, touch.clientY);
  dragOffset = { x: p.x - state.positions[name].x, y: p.y - state.positions[name].y };
  document.addEventListener("touchmove", onDragTouch, { passive: false });
  document.addEventListener("touchend", endDragTouch);
}

function svgPointFromCoords(cx, cy) {
  const svg = $("automataCanvas");
  const pt = svg.createSVGPoint();
  pt.x = cx; pt.y = cy;
  const ctm = $("svgRoot").getScreenCTM();
  return pt.matrixTransform(ctm.inverse());
}

function onDrag(e) {
  if (!dragging) return;
  const p = svgPoint(e);
  state.positions[dragging] = { x: p.x - dragOffset.x, y: p.y - dragOffset.y };
  renderCanvas();
}

function onDragTouch(e) {
  e.preventDefault();
  if (!dragging) return;
  const touch = e.touches[0];
  const p = svgPointFromCoords(touch.clientX, touch.clientY);
  state.positions[dragging] = { x: p.x - dragOffset.x, y: p.y - dragOffset.y };
  renderCanvas();
}

function endDrag() {
  dragging = null;
  document.removeEventListener("mousemove", onDrag);
  document.removeEventListener("mouseup", endDrag);
}
function endDragTouch() {
  dragging = null;
  document.removeEventListener("touchmove", onDragTouch);
  document.removeEventListener("touchend", endDragTouch);
}

// Pan canvas
const svg = $("automataCanvas");
svg.addEventListener("mousedown", e => {
  if (dragging) return;
  panStart = { x: e.clientX, y: e.clientY };
  panViewStart = { x: viewX, y: viewY };
});
svg.addEventListener("mousemove", e => {
  if (!panStart || dragging) return;
  viewX = panViewStart.x + (e.clientX - panStart.x);
  viewY = panViewStart.y + (e.clientY - panStart.y);
  $("svgRoot").setAttribute("transform", `translate(${viewX},${viewY}) scale(${viewScale})`);
});
svg.addEventListener("mouseup", () => { panStart = null; });
svg.addEventListener("mouseleave", () => { panStart = null; });

// Zoom
svg.addEventListener("wheel", e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  viewScale = Math.max(0.3, Math.min(3, viewScale * factor));
  $("svgRoot").setAttribute("transform", `translate(${viewX},${viewY}) scale(${viewScale})`);
}, { passive: false });

$("zoomIn").addEventListener("click",  () => { viewScale = Math.min(3, viewScale * 1.2); renderCanvas(); });
$("zoomOut").addEventListener("click", () => { viewScale = Math.max(0.3, viewScale / 1.2); renderCanvas(); });
$("zoomFit").addEventListener("click", () => { viewX = 0; viewY = 0; viewScale = 1; renderCanvas(); });

// ─────────────────────────────────────────────
// TRANSITION TABLE
// ─────────────────────────────────────────────
function renderTransTable() {
  const wrap  = $("transTable");
  const states = state.automaton.states;
  const syms   = state.type === "NFA"
    ? [...state.automaton.alphabet, "ε"]
    : state.automaton.alphabet;
  const trans  = state.automaton.transitions;

  if (!states.length || !syms.length) {
    wrap.innerHTML = '<div class="table-empty">No transitions yet</div>';
    return;
  }

  let html = `<table class="trans-table"><thead><tr>
    <th>State</th>${syms.map(s => `<th>${s}</th>`).join("")}
  </tr></thead><tbody>`;

  states.forEach(s => {
    const prefix = s === state.automaton.start_state ? "→" :
                   state.automaton.accepting_states.includes(s) ? "✓" : "";
    html += `<tr data-state="${s}"><td>${prefix}${s}</td>`;
    syms.forEach(sym => {
      const val = trans[s]?.[sym];
      let cell = "—";
      if (val !== undefined) {
        cell = Array.isArray(val) ? `{${val.join(",")}}` : val;
      }
      html += `<td data-state="${s}" data-sym="${sym}">${cell}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  wrap.innerHTML = html;
}

function highlightTableRow(currentStates, sym, nextStates) {
  document.querySelectorAll(".trans-table td, .trans-table tr").forEach(el => {
    el.classList.remove("current-row", "taken-cell");
  });
  currentStates.forEach(s => {
    const cell = document.querySelector(`.trans-table td[data-state="${s}"][data-sym="${sym}"]`);
    if (cell) cell.classList.add("taken-cell");
  });
}

// ─────────────────────────────────────────────
// IMPORT / EXPORT
// ─────────────────────────────────────────────
$("exportBtn").addEventListener("click", () => {
  const json = JSON.stringify(state.automaton, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `automaton_${state.type.toLowerCase()}.json`;
  a.click();
});

$("importBtn").addEventListener("click", () => {
  $("importText").value = "";
  $("importModal").classList.remove("hidden");
});

$("importCancel").addEventListener("click", () => {
  $("importModal").classList.add("hidden");
});

$("importConfirm").addEventListener("click", () => {
  try {
    const data = JSON.parse($("importText").value);
    if (!data.states || !data.alphabet || !data.transitions) {
      alert("Invalid automaton JSON format.");
      return;
    }
    state.type = (data.type || "DFA").toUpperCase();
    state.automaton.type = state.type;
    $("modeLabel").textContent = state.type;
    loadAutomaton(data);
    resetSim();
    $("importModal").classList.add("hidden");
  } catch(e) {
    alert("JSON parse error: " + e.message);
  }
});

// ─────────────────────────────────────────────
// RESET ALL
// ─────────────────────────────────────────────
$("resetBtn").addEventListener("click", () => {
  if (confirm("Reset everything?")) resetAll();
});

function resetAll() {
  state.automaton = {
    type: state.type,
    states: [],
    alphabet: [],
    transitions: {},
    start_state: null,
    accepting_states: []
  };
  state.positions = {};
  state.simSteps = [];
  state.simIndex = -1;
  state.simDone = false;
  clearSimTimer();
  state.simRunning = false;

  $("alphabetInput").value = "";
  $("stateInput").value = "";
  $("testInput").value = "";
  $("alphabetDisplay").innerHTML = "";
  $("stateList").innerHTML = "";
  $("transList").innerHTML = "";
  $("autoAcceptStrings").value = "";
  $("autoAlphabet").value = "";
  $("simLog").innerHTML = '<div class="log-empty">Run a simulation to see the trace here.</div>';
  $("resultBanner").classList.add("hidden");
  $("autoRunBtn").textContent = "Auto Run";
  $("autoRunBtn").classList.remove("running");

  refreshTransSelectors();
  renderCanvas();
  renderTransTable();
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
(function init() {
  showScreen("landing");
  renderCanvas();
})();
