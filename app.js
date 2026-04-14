'use strict';

const STORAGE_KEY = 'wtt_data';

// state.projects:     Array<{ id, name }>
// state.records:      { [dateKey]: { [projectId]: totalSeconds } }
// state.dailyTargets: { [dateKey]: { [projectId]: targetSeconds } }
// state.running:      { projectId, startedAt (ms) } | null
let state = {
  projects: [],
  records: {},
  dailyTargets: {},
  running: null,
};

// ─── Persistence ──────────────────────────────────────────────────────────────
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch (_) {}
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatHMS(totalSeconds) {
  const s = Math.floor(totalSeconds) % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function todaySeconds(projectId) {
  const key = todayKey();
  return (state.records[key] && state.records[key][projectId]) || 0;
}

function elapsedNow() {
  if (!state.running) return 0;
  return (Date.now() - state.running.startedAt) / 1000;
}

function totalSecondsForProjectNow(projectId) {
  const stored = todaySeconds(projectId);
  if (state.running && state.running.projectId === projectId) {
    return stored + elapsedNow();
  }
  return stored;
}

function grandTotalNow() {
  return state.projects.reduce((sum, p) => sum + totalSecondsForProjectNow(p.id), 0);
}

function maxTodaySeconds() {
  return state.projects.reduce((max, p) => Math.max(max, totalSecondsForProjectNow(p.id)), 0);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Target Helpers ───────────────────────────────────────────────────────────
function getTodayTarget(projectId) {
  const key = todayKey();
  return (state.dailyTargets[key] && state.dailyTargets[key][projectId]) || 0;
}

function setTodayTarget(projectId, targetSeconds) {
  const key = todayKey();
  if (!state.dailyTargets[key]) state.dailyTargets[key] = {};
  state.dailyTargets[key][projectId] = Math.max(0, targetSeconds);
  save();
}

function targetProgressClass(actual, target) {
  if (target <= 0) return '';
  const pct = actual / target;
  if (pct >= 1.0) return 'over';
  if (pct >= 0.8) return 'warn';
  return '';
}

// ─── Timer Actions ────────────────────────────────────────────────────────────
function startTimer(projectId) {
  if (state.running) commitRunning();
  state.running = { projectId, startedAt: Date.now() };
  save();
  render();
}

function stopTimer(projectId) {
  if (!state.running || state.running.projectId !== projectId) return;
  commitRunning();
  state.running = null;
  save();
  render();
}

function commitRunning() {
  if (!state.running) return;
  const { projectId, startedAt } = state.running;
  const elapsed = (Date.now() - startedAt) / 1000;
  const key = todayKey();
  if (!state.records[key]) state.records[key] = {};
  state.records[key][projectId] = (state.records[key][projectId] || 0) + elapsed;
}

// ─── Project Actions ──────────────────────────────────────────────────────────
function addProject(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  state.projects.push({ id: generateId(), name: trimmed });
  save();
  render();
}

function deleteProject(projectId) {
  if (state.running && state.running.projectId === projectId) state.running = null;
  state.projects = state.projects.filter(p => p.id !== projectId);
  save();
  render();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  renderDate();
  renderProjects();
  renderSummary();
}

function renderDate() {
  const el = document.getElementById('current-date');
  const d = new Date();
  el.textContent = d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function buildTargetBar(actual, target) {
  if (target <= 0) return '';
  const pct = Math.min(actual / target * 100, 100);
  const cls = targetProgressClass(actual, target);
  const remaining = target - actual;
  const statusText = actual >= target
    ? `\u8d85\u904e +${formatHMS(actual - target)}`
    : `\u6b8b\u308a ${formatHMS(remaining)}`;
  return `
    <div class="target-row">
      <div class="target-bar-wrap">
        <div class="target-bar ${cls}" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <span class="target-status ${cls}">${statusText} / \u30bf\u30fc\u30b2\u30c3\u30c8 ${formatHMS(target)}</span>
    </div>`;
}

function renderProjects() {
  const container = document.getElementById('projects-container');

  if (state.projects.length === 0) {
    container.innerHTML = '<p class="empty-state">\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u304c\u3042\u308a\u307e\u305b\u3093\u3002\u4e0a\u306e\u30d5\u30a9\u30fc\u30e0\u304b\u3089\u8ffd\u52a0\u3057\u3066\u304f\u3060\u3055\u3044\u3002</p>';
    return;
  }

  container.innerHTML = '';
  for (const project of state.projects) {
    const isRunning = state.running && state.running.projectId === project.id;
    const seconds = totalSecondsForProjectNow(project.id);
    const target = getTodayTarget(project.id);
    const targetH = Math.floor(target / 3600);
    const targetM = Math.floor((target % 3600) / 60);

    const card = document.createElement('div');
    card.className = 'project-card' + (isRunning ? ' is-running' : '');
    card.dataset.id = project.id;

    card.innerHTML = `
      <div class="project-card-main">
        <span class="project-name" title="${escHtml(project.name)}">${escHtml(project.name)}</span>
        <span class="project-timer" data-timer="${project.id}">${formatHMS(seconds)}</span>
        <button class="btn-toggle" data-action="toggle" data-id="${project.id}">${isRunning ? '\u505c\u6b62' : '\u958b\u59cb'}</button>
        <button class="btn-delete" data-action="delete" data-id="${project.id}" title="\u524a\u9664">\u2715</button>
      </div>
      <div class="target-input-row">
        <span class="target-label">\u4eca\u65e5\u306e\u30bf\u30fc\u30b2\u30c3\u30c8</span>
        <input class="target-h-input" type="number" min="0" max="23" value="${targetH}"
          data-action="set-target" data-id="${project.id}" aria-label="\u6642\u9593">
        <span class="target-unit">\u6642\u9593</span>
        <input class="target-m-input" type="number" min="0" max="59" value="${targetM}"
          data-action="set-target" data-id="${project.id}" aria-label="\u5206">
        <span class="target-unit">\u5206</span>
      </div>
      ${target > 0 ? buildTargetBar(seconds, target) : ''}
      ${isRunning ? '<span class="running-label">\u25cf \u8a08\u6e2c\u4e2d</span>' : ''}
    `;

    container.appendChild(card);
  }
}

function renderSummary() {
  const list = document.getElementById('summary-list');
  const grandEl = document.getElementById('grand-total');

  if (state.projects.length === 0) {
    list.innerHTML = '';
    grandEl.textContent = '0:00:00';
    return;
  }

  const maxSec = maxTodaySeconds();
  list.innerHTML = '';

  for (const project of state.projects) {
    const sec = totalSecondsForProjectNow(project.id);
    const target = getTodayTarget(project.id);
    const pct = target > 0
      ? Math.min(Math.round(sec / target * 100), 100)
      : (maxSec > 0 ? Math.round(sec / maxSec * 100) : 0);
    const cls = target > 0 ? targetProgressClass(sec, target) : '';

    const row = document.createElement('div');
    row.className = 'summary-row';
    row.innerHTML = `
      <span class="s-name" title="${escHtml(project.name)}">${escHtml(project.name)}</span>
      <div class="s-bar-wrap"><div class="s-bar ${cls}" style="width:${pct}%"></div></div>
      <span class="s-time ${cls}">${formatHMS(sec)}${target > 0 ? ` / ${formatHMS(target)}` : ''}</span>
    `;
    list.appendChild(row);
  }

  grandEl.textContent = formatHMS(grandTotalNow());
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Event Delegation ─────────────────────────────────────────────────────────
document.getElementById('projects-container').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === 'toggle') {
    const isRunning = state.running && state.running.projectId === id;
    isRunning ? stopTimer(id) : startTimer(id);
  } else if (action === 'delete') {
    const project = state.projects.find(p => p.id === id);
    if (project && confirm(`\u300c${project.name}\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f\n\u672c\u65e5\u306e\u8a18\u9332\u3082\u524a\u9664\u3055\u308c\u307e\u3059\u3002`)) {
      const key = todayKey();
      if (state.records[key]) delete state.records[key][id];
      deleteProject(id);
    }
  }
});

// Save target when hour/minute inputs change
document.getElementById('projects-container').addEventListener('change', (e) => {
  const input = e.target.closest('[data-action="set-target"]');
  if (!input) return;
  const card = input.closest('.project-card');
  const id = input.dataset.id;
  const hInput = card.querySelector('.target-h-input');
  const mInput = card.querySelector('.target-m-input');
  const h = Math.max(0, Math.min(23, parseInt(hInput.value, 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(mInput.value, 10) || 0));
  hInput.value = h;
  mInput.value = m;
  setTodayTarget(id, h * 3600 + m * 60);
  renderSummary();
  const actual = totalSecondsForProjectNow(id);
  const target = getTodayTarget(id);
  let targetRowEl = card.querySelector('.target-row');
  const runningEl = card.querySelector('.running-label');
  if (target > 0) {
    const newBarHTML = buildTargetBar(actual, target);
    if (targetRowEl) {
      targetRowEl.outerHTML = newBarHTML;
    } else {
      const tmp = document.createElement('div');
      tmp.innerHTML = newBarHTML;
      card.insertBefore(tmp.firstElementChild, runningEl || null);
    }
  } else if (targetRowEl) {
    targetRowEl.remove();
  }
});

document.getElementById('add-project-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('project-name-input');
  addProject(input.value);
  input.value = '';
  input.focus();
});

// ─── Tick ─────────────────────────────────────────────────────────────────────
let lastDateKey = todayKey();

function tick() {
  const currentKey = todayKey();
  if (currentKey !== lastDateKey) {
    if (state.running) {
      commitRunning();
      state.running = { projectId: state.running.projectId, startedAt: Date.now() };
      save();
    }
    lastDateKey = currentKey;
    render();
    return;
  }

  if (state.running) {
    const id = state.running.projectId;
    const actual = totalSecondsForProjectNow(id);
    const target = getTodayTarget(id);

    const timerEl = document.querySelector(`[data-timer="${id}"]`);
    if (timerEl) timerEl.textContent = formatHMS(actual);

    const card = document.querySelector(`.project-card[data-id="${id}"]`);
    if (card && target > 0) {
      const targetRowEl = card.querySelector('.target-row');
      const runningEl = card.querySelector('.running-label');
      const newBarHTML = buildTargetBar(actual, target);
      if (targetRowEl) {
        const tmp = document.createElement('div');
        tmp.innerHTML = newBarHTML;
        targetRowEl.replaceWith(tmp.firstElementChild);
      } else {
        const tmp = document.createElement('div');
        tmp.innerHTML = newBarHTML;
        card.insertBefore(tmp.firstElementChild, runningEl || null);
      }
    }

    renderSummary();
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
load();
render();
setInterval(tick, 1000);
