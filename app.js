'use strict';

const STORAGE_KEY = 'wtt_data';

let state = {
  projects: [],
  records: {},
  dailyTargets: {},
  logs: [],
  running: null,
};

let pendingNoteLogId = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
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

function formatTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

function grandTargetTotal() {
  return state.projects.reduce((sum, p) => sum + getTodayTarget(p.id), 0);
}

function maxTodaySeconds() {
  return state.projects.reduce((max, p) => Math.max(max, totalSecondsForProjectNow(p.id)), 0);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getTodayLogs(projectId) {
  const key = todayKey();
  return state.logs.filter(l => l.projectId === projectId && l.date === key);
}

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

function startTimer(projectId) {
  if (state.running) commitRunning();
  state.running = { projectId, startedAt: Date.now() };
  save();
  render();
}

function stopTimer(projectId) {
  if (!state.running || state.running.projectId !== projectId) return;
  const startedAt = state.running.startedAt;
  const stoppedAt = Date.now();
  commitRunning();
  state.running = null;

  const logEntry = {
    id: generateId(),
    projectId,
    date: todayKey(),
    startedAt,
    stoppedAt,
    duration: (stoppedAt - startedAt) / 1000,
    note: '',
  };
  state.logs.push(logEntry);
  pendingNoteLogId = logEntry.id;

  save();
  render();

  requestAnimationFrame(() => {
    const input = document.querySelector(`[data-log-input="${logEntry.id}"]`);
    if (input) input.focus();
  });
}

function commitRunning() {
  if (!state.running) return;
  const { projectId, startedAt } = state.running;
  const elapsed = (Date.now() - startedAt) / 1000;
  const key = todayKey();
  if (!state.records[key]) state.records[key] = {};
  state.records[key][projectId] = (state.records[key][projectId] || 0) + elapsed;
}

function saveNote(logId, note) {
  const entry = state.logs.find(l => l.id === logId);
  if (entry) {
    entry.note = note.trim();
    save();
  }
  if (pendingNoteLogId === logId) pendingNoteLogId = null;
  render();
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

function buildTargetBar(actual, target) {
  if (target <= 0) return '';
  const pct = Math.min(actual / target * 100, 100);
  const cls = targetProgressClass(actual, target);
  const statusText = actual >= target
    ? `\u8d85\u904e +${formatHMS(actual - target)}`
    : `\u6b8b\u308a ${formatHMS(target - actual)}`;
  return `
    <div class="target-row">
      <div class="target-bar-wrap">
        <div class="target-bar ${cls}" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <span class="target-status ${cls}">${statusText} / \u30bf\u30fc\u30b2\u30c3\u30c8 ${formatHMS(target)}</span>
    </div>`;
}

function buildLogList(projectId) {
  const logs = getTodayLogs(projectId);
  if (logs.length === 0) return '';

  const items = logs.map(log => {
    const isPending = log.id === pendingNoteLogId;
    const timeRange = `${formatTime(log.startedAt)}\u301c${formatTime(log.stoppedAt)}`;
    const dur = formatHMS(log.duration);

    if (isPending) {
      return `
        <li class="log-item log-item--pending">
          <div class="log-meta">${timeRange} <span class="log-dur">(${dur})</span></div>
          <div class="log-note-input-row">
            <input class="log-note-input" type="text"
              placeholder="\u4f55\u306e\u4f5c\u696d\u3092\u3057\u3066\u3044\u307e\u3057\u305f\u304b\uff1f\uff08\u4efb\u610f\uff09"
              data-log-input="${log.id}"
              value="${escHtml(log.note)}"
              maxlength="200">
            <button class="btn-note-done" data-action="save-note" data-log-id="${log.id}">${'\u5b8c\u4e86'}</button>
          </div>
        </li>`;
    }

    return `
      <li class="log-item">
        <div class="log-meta">${timeRange} <span class="log-dur">(${dur})</span></div>
        ${log.note ? `<div class="log-note-text">${escHtml(log.note)}</div>` : ''}
      </li>`;
  }).join('');

  return `<ul class="log-list">${items}</ul>`;
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
    const targetH = String(Math.floor(target / 3600)).padStart(2, '0');
    const targetM = String(Math.floor((target % 3600) / 60)).padStart(2, '0');
    const targetValue = target > 0 ? `${targetH}:${targetM}` : '';

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
        <input class="target-time-input" type="time" value="${targetValue}"
          data-action="set-target" data-id="${project.id}" aria-label="\u76ee\u6a19\u6642\u9593">
      </div>
      ${target > 0 ? buildTargetBar(seconds, target) : ''}
      ${isRunning ? '<span class="running-label">\u25cf \u8a08\u6e2c\u4e2d</span>' : ''}
      ${buildLogList(project.id)}
    `;

    container.appendChild(card);
  }
}

function renderSummary() {
  const list = document.getElementById('summary-list');
  const grandEl = document.getElementById('grand-total');
  const targetEl = document.getElementById('target-total');

  if (state.projects.length === 0) {
    list.innerHTML = '';
    grandEl.textContent = '0:00:00';
    targetEl.textContent = '0:00:00';
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
  targetEl.textContent = formatHMS(grandTargetTotal());
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.getElementById('projects-container').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action } = btn.dataset;

  if (action === 'toggle') {
    const id = btn.dataset.id;
    const isRunning = state.running && state.running.projectId === id;
    isRunning ? stopTimer(id) : startTimer(id);
  } else if (action === 'delete') {
    const id = btn.dataset.id;
    const project = state.projects.find(p => p.id === id);
    if (project && confirm(`\u300c${project.name}\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f\n\u672c\u65e5\u306e\u8a18\u9332\u3082\u524a\u9664\u3055\u308c\u307e\u3059\u3002`)) {
      const key = todayKey();
      if (state.records[key]) delete state.records[key][id];
      state.logs = state.logs.filter(l => l.projectId !== id);
      deleteProject(id);
    }
  } else if (action === 'save-note') {
    const logId = btn.dataset.logId;
    const input = document.querySelector(`[data-log-input="${logId}"]`);
    saveNote(logId, input ? input.value : '');
  }
});

document.getElementById('projects-container').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const input = e.target.closest('[data-log-input]');
  if (!input) return;
  saveNote(input.dataset.logInput, input.value);
});

document.getElementById('projects-container').addEventListener('change', (e) => {
  const input = e.target.closest('[data-action="set-target"]');
  if (!input) return;
  const card = input.closest('.project-card');
  const id = input.dataset.id;
  const [h, m] = (input.value || '00:00').split(':').map(Number);
  setTodayTarget(id, (h || 0) * 3600 + (m || 0) * 60);
  renderSummary();
  const actual = totalSecondsForProjectNow(id);
  const target = getTodayTarget(id);
  let targetRowEl = card.querySelector('.target-row');
  const logListEl = card.querySelector('.log-list');
  const runningEl = card.querySelector('.running-label');
  const insertBefore = runningEl || logListEl || null;
  if (target > 0) {
    const newBarHTML = buildTargetBar(actual, target);
    if (targetRowEl) {
      targetRowEl.outerHTML = newBarHTML;
    } else {
      const tmp = document.createElement('div');
      tmp.innerHTML = newBarHTML;
      card.insertBefore(tmp.firstElementChild, insertBefore);
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
      const logListEl = card.querySelector('.log-list');
      const runningEl = card.querySelector('.running-label');
      const newBarHTML = buildTargetBar(actual, target);
      if (targetRowEl) {
        const tmp = document.createElement('div');
        tmp.innerHTML = newBarHTML;
        targetRowEl.replaceWith(tmp.firstElementChild);
      } else {
        const tmp = document.createElement('div');
        tmp.innerHTML = newBarHTML;
        card.insertBefore(tmp.firstElementChild, runningEl || logListEl || null);
      }
    }

    renderSummary();
  }
}

load();
render();
setInterval(tick, 1000);
