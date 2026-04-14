'use strict';

const STORAGE_KEY = 'wtt_data';

let state = {
  projects: [],
  records: {},
  running: null,
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (_) {}
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

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

function renderProjects() {
  const container = document.getElementById('projects-container');
  if (state.projects.length === 0) {
    container.innerHTML = '<p class="empty-state">プロジェクトがありません。上のフォームから追加してください。</p>';
    return;
  }
  container.innerHTML = '';
  for (const project of state.projects) {
    const isRunning = state.running && state.running.projectId === project.id;
    const seconds = totalSecondsForProjectNow(project.id);
    const card = document.createElement('div');
    card.className = 'project-card' + (isRunning ? ' is-running' : '');
    card.dataset.id = project.id;
    card.innerHTML = `
      <div class="project-card-main">
        <span class="project-name" title="${escHtml(project.name)}">${escHtml(project.name)}</span>
        <span class="project-timer" data-timer="${project.id}">${formatHMS(seconds)}</span>
        <button class="btn-toggle" data-action="toggle" data-id="${project.id}">${isRunning ? '停止' : '開始'}</button>
        <button class="btn-delete" data-action="delete" data-id="${project.id}" title="削除">✕</button>
      </div>
      ${isRunning ? '<span class="running-label">● 計測中</span>' : ''}
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
    const pct = maxSec > 0 ? Math.round((sec / maxSec) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'summary-row';
    row.innerHTML = `
      <span class="s-name" title="${escHtml(project.name)}">${escHtml(project.name)}</span>
      <div class="s-bar-wrap"><div class="s-bar" style="width:${pct}%"></div></div>
      <span class="s-time">${formatHMS(sec)}</span>
    `;
    list.appendChild(row);
  }
  grandEl.textContent = formatHMS(grandTotalNow());
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.getElementById('projects-container').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'toggle') {
    const isRunning = state.running && state.running.projectId === id;
    isRunning ? stopTimer(id) : startTimer(id);
  } else if (action === 'delete') {
    const project = state.projects.find(p => p.id === id);
    if (project && confirm(`「${project.name}」を削除しますか？\n本日の記録も削除されます。`)) {
      const key = todayKey();
      if (state.records[key]) delete state.records[key][id];
      deleteProject(id);
    }
  }
});

document.getElementById('add-project-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('project-name-input');
  addProject(input.value);
  input.value = '';
  input.focus();
});

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
  }
  if (state.running) {
    const timerEl = document.querySelector(`[data-timer="${state.running.projectId}"]`);
    if (timerEl) timerEl.textContent = formatHMS(totalSecondsForProjectNow(state.running.projectId));
    renderSummary();
  }
}

load();
render();
setInterval(tick, 1000);
