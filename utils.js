// utils.js

// data.json is read straight from GitHub so data updates don't need a Netlify deploy
const DATA_URL = 'https://raw.githubusercontent.com/roseneedsgrace-a11y/the7/main/data.json';
const API_URL = 'https://script.google.com/macros/s/AKfycbzPPzHJq-iNfSiQVO-LlBJ6EXujQGwatgK7KOgt9PLxMEV4Qi_TVkky_BNDozKSkQAe/exec';

// ─── DATA LOADING ─────────────────────────────
// GitHub copy: very fast, but can be up to ~5 minutes old.
function fetchGithubData() {
  return fetch(DATA_URL + '?v=' + Date.now()).then(r => {
    if (!r.ok) throw new Error('GitHub data not found');
    return r.json();
  });
}

// Apps Script copy: always current (saved whenever data is pushed), takes ~1-2 seconds.
function fetchLiveData() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  return fetch(API_URL + '?action=getJson&v=' + Date.now(), { signal: ctrl.signal })
    .then(r => r.json())
    .then(d => {
      clearTimeout(timer);
      if (!d || !d.generated) throw new Error('Live data missing');
      return d;
    });
}

// First page load: show the fast GitHub copy; fall back to Apps Script if GitHub fails.
function loadInitialData() {
  return fetchGithubData().catch(() => fetchLiveData());
}

// Refreshes: get the freshest copy; fall back to GitHub if Apps Script fails.
function fetchLatestData() {
  return fetchLiveData().catch(() => fetchGithubData());
}

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
      // The push call finishes after the fresh copy is saved, so refresh right away.
      forceRefresh();
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
function getChoreId(studentName, date, index) {
  const d = new Date(date);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return `${studentName}-chore-${index}-${dateStr}`;
}

// ─── DAY-SPECIFIC CHORES ──────────────────────
// A chore with no prefix shows every day:      "Dishwasher"
// A chore with a day prefix shows on those days: "Tue: Take out the trash"
//                                              "Mon, Thu: Clean bathroom"
// Day names can be short or long (Tue, Tues, Tuesday). "Weekdays" and
// "Weekends" also work. If the text before the colon isn't all day names,
// the whole thing is treated as an everyday chore.
const CHORE_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseChoreDays(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/^([A-Za-z][A-Za-z\s,&\/]*?)\s*:\s*(.+)$/);
  if (!m) return { text, days: null };
  const tokens = m[1].split(/[\s,&\/]+/).map(t => t.toLowerCase()).filter(t => t && t !== 'and');
  const days = [];
  for (const tok of tokens) {
    if (tok === 'weekdays') { days.push(1, 2, 3, 4, 5); continue; }
    if (tok === 'weekends') { days.push(0, 6); continue; }
    const idx = tok.length >= 3 ? CHORE_DAY_KEYS.indexOf(tok.slice(0, 3)) : -1;
    if (idx === -1) return { text, days: null }; // not a day list, show every day
    days.push(idx);
  }
  return days.length ? { text: m[2].trim(), days } : { text, days: null };
}

// Returns only the chores that apply on `date`, as { text, index }.
// `index` is the chore's position in the FULL list, so check-off IDs stay stable.
function getChoresForDate(chores, date) {
  const dow = new Date(date).getDay();
  return (chores || []).map((raw, index) => ({ raw, index }))
    .filter(c => String(c.raw || '').trim())
    .map(c => ({ ...parseChoreDays(c.raw), index: c.index }))
    .filter(c => !c.days || c.days.includes(dow));
}

// ─── DATA MERGE ───────────────────────────────
function mergeChoresIntoStudentData(data) {
  const choreMap = {};
  if (data.students) {
    data.students.forEach(s => {
      choreMap[s.name] = Array.isArray(s.chore) 
        ? s.chore 
        : (s.chore ? [s.chore] : []);
    });
  }
  return (data.studentData || []).map(s => ({
    ...s,
    chores: choreMap[s.student] || []
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
