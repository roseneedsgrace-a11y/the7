// utils.js

const API_URL = 'https://script.google.com/macros/s/AKfycbxWveKXenQGLmeJyhNZCJUrsOEvrDNYGBiIEKEMgKA1kD6Vyn708lXL3rqOsoiYkbYn/exec';

// ─── LOCAL STORAGE ────────────────────────────
function getLocalProgress() {
  return JSON.parse(localStorage.getItem('local_progress') || '{}');
}

function setLocalProgress(id, isDone) {
  const localProgress = getLocalProgress();
  localProgress[id] = isDone;
  localStorage.setItem('local_progress', JSON.stringify(localProgress));
}

// ─── SYNC TIMER ───────────────────────────────
let syncCountdown = null;
const SYNC_DELAY = 10;

function startSyncTimer() {
  if (syncCountdown) clearInterval(syncCountdown);
  const timerEl = document.getElementById('syncTimer');
  const btn = document.getElementById('refreshBtn');
  if (!timerEl || !btn) return;

  let seconds = SYNC_DELAY;
  timerEl.style.display = 'inline';
  timerEl.textContent = `syncing... ${seconds}s`;

  syncCountdown = setInterval(() => {
    seconds--;
    timerEl.textContent = `syncing... ${seconds}s`;
    if (seconds <= 0) {
      clearInterval(syncCountdown);
      syncCountdown = null;
      timerEl.style.display = 'none';
      btn.style.opacity = '1';
      btn.style.color = '#16a34a';
      btn.title = 'New data may be available';
      btn.onclick = pushAndRefresh;
    }
  }, 1000);
}

// ─── PUSH AND REFRESH ─────────────────────────
function pushAndRefresh() {
  const btn = document.getElementById('refreshBtn');
  btn.textContent = 'Pushing...';
  btn.disabled = true;
  fetch(`${API_URL}?action=push`, { mode: 'no-cors' })
    .then(() => {
      btn.textContent = 'Waiting for GitHub...';
      setTimeout(() => forceRefresh(), 8000);
    })
    .catch(() => {
      btn.textContent = 'Error — try again';
      btn.disabled = false;
    });
  btn.onclick = forceRefresh;
}

function showTimestamp(isoString) {
  const el = document.getElementById('lastUpdated');
  if (!el || !isoString) return;
  const d = new Date(isoString);
  el.textContent = 'Data as of: ' + d.toLocaleString();
}

// ─── CHORE HELPERS ────────────────────────────
function getChoreId(studentName, date) {
  const d = new Date(date);
  return `${studentName}-chore-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── DATA MERGE ───────────────────────────────
function mergeChoresIntoStudentData(data) {
  const choreMap = {};
  if (data.students) {
    data.students.forEach(s => { choreMap[s.name] = s.chore || ''; });
  }
  return (data.studentData || []).map(s => ({
    ...s,
    chore: choreMap[s.student] || ''
  }));
}

// ─── COLORS ───────────────────────────────────
function updateColors(palette) {
  if (!palette) return;
  const root = document.documentElement;
  root.style.setProperty('--primary', palette.primary);
  root.style.setProperty('--secondary', palette.secondary);
  root.style.setProperty('--bg', palette.bg || '#f8fafc');

  const header = document.getElementById('siteHeader');
  if (header) {
    const svg = `<svg width='1920' height='1080' viewBox='0 0 1920 1080' xmlns='http://www.w3.org/2000/svg'>
      <defs>
        <linearGradient id='grad' x1='0%' y1='0%' x2='0%' y2='100%'>
          <stop offset='0%' style='stop-color:${palette.bg || '#f8fafc'};stop-opacity:1'/>
          <stop offset='70%' style='stop-color:${palette.primary};stop-opacity:1'/>
        </linearGradient>
      </defs>
      <rect width='1920' height='1080' fill='url(%23grad)'/>
    </svg>`;
    header.style.background = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") center/cover no-repeat';
  }
}

// ─── STORAGE EVENT LISTENER ───────────────────
// Each page defines its own onStorageChange function
window.addEventListener('storage', function(e) {
  if (e.key === 'local_progress' && typeof onStorageChange === 'function') {
    onStorageChange();
  }
});
