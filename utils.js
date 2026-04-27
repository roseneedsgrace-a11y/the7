// utils.js

const API_URL = 'https://script.google.com/macros/s/AKfycbxWveKXenQGLmeJyhNZCJUrsOEvrDNYGBiIEKEMgKA1kD6Vyn708lXL3rqOsoiYkbYn/exec';

// ─── LOCAL STORAGE ────────────────────────────
function getLocalProgress() {
  return JSON.parse(localStorage.getItem('local_progress') || '{}');
}

function fetchAndMergeProgress() {
  return fetch(`${API_URL}?action=getProgress`, { mode: 'cors' })
    .then(r => r.json())
    .then(data => {
      if (data && typeof data === 'object') {
        const localProgress = getLocalProgress();
        let changed = false;
        
        // Only merge chore keys from server
        Object.entries(data).forEach(([key, value]) => {
          if (key.includes('-chore-') && localProgress[key] === undefined) {
            localProgress[key] = value;
            changed = true;
          }
        });
        
        if (changed) {
          localStorage.setItem('local_progress', JSON.stringify(localProgress));
        }
      }
      return getLocalProgress();
    })
    .catch(e => {
      console.warn('Could not fetch progress from server:', e);
      return getLocalProgress();
    });
}


function setLocalProgress(id, isDone) {
  const localProgress = getLocalProgress();
  localProgress[id] = isDone;
  localStorage.setItem('local_progress', JSON.stringify(localProgress));
}

function getTodayMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
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
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  let text;
  if (diffMins < 1) {
    text = 'Data updated just now';
  } else if (diffMins < 60) {
    text = `Last Sync: ${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  } else if (diffHours < 48) {
    const remainingMins = diffMins % 60;
    text = `Last sync ${diffHours} hour${diffHours === 1 ? '' : 's'}${remainingMins > 0 ? ` ${remainingMins}m` : ''} ago`;
  } else {
    text = 'Last sync: ' + d.toLocaleString();
  }

  el.textContent = text;
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



// ─── STORAGE EVENT LISTENER ───────────────────
// Each page defines its own onStorageChange function
window.addEventListener('storage', function(e) {
  if (e.key === 'local_progress' && typeof onStorageChange === 'function') {
    onStorageChange();
  }
});

function getMakeupDaysEnabled() {
  // Read from allData config which comes from data.json
  // Each page's allData has a config object
  if (typeof allData !== 'undefined' && allData && allData.config) {
    return allData.config.makeupDaysEnabled !== false;
  }
  return true; // default on
}
