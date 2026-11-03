// ===== MAIN APP LOGIC =====

firebase.initializeApp(FIREBASE_CONFIG);
const messaging = firebase.messaging();

const els = {
  setupScreen: document.getElementById('setup-screen'),
  mainScreen: document.getElementById('main-screen'),
  inputName: document.getElementById('input-name'),
  inputSensor: document.getElementById('input-sensor'),
  inputRole: document.getElementById('input-role'),
  btnRegister: document.getElementById('btn-register'),
  setupStatus: document.getElementById('setup-status'),
  loggedInAs: document.getElementById('logged-in-as'),
  noAlerts: document.getElementById('no-alerts'),
  alertList: document.getElementById('alert-list'),
  alarmOverlay: document.getElementById('alarm-overlay'),
  alarmAlertList: document.getElementById('alarm-alert-list'),
};

const STORAGE_KEY = 'tempBreachUser';
let wakeLock = null;
let pollTimer = null;
let currentAlerts = []; // alerts we know are active right now

init();

async function init() {
  const saved = getSavedUser();
  if (saved) {
    showMainScreen(saved);
    startPolling();
  } else {
    els.setupScreen.classList.remove('hidden');
  }

  els.btnRegister.addEventListener('click', onRegisterClick);

  // Foreground push: fires only while this tab/app is open and focused.
  // Background push is handled separately in firebase-messaging-sw.js.
  messaging.onMessage((payload) => {
    const data = payload.data || {};
    addOrRefreshAlert({
      alertId: data.alertId,
      sensorId: data.sensorId,
      location: data.location,
      temperature: data.temperature
    });
  });

  // Re-sync with the backend whenever the tab/app regains focus — catches
  // anything that happened while the phone was off/offline/app closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncActiveAlerts();
  });
}

function getSavedUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

async function onRegisterClick() {
  const name = els.inputName.value.trim();
  const sensorId = els.inputSensor.value.trim() || 'ALL';
  const role = els.inputRole.value;

  if (!name) {
    els.setupStatus.textContent = 'Please enter your name.';
    return;
  }

  els.setupStatus.textContent = 'Requesting notification permission...';

  // Each network step below is its own try/catch so the error message tells
  // us exactly WHICH step failed, instead of a generic "Load failed" that
  // could mean any of four different things. Don't collapse these back into
  // one try block.

  let permission;
  try {
    permission = await Notification.requestPermission();
  } catch (err) {
    console.error('[notif-permission]', err);
    els.setupStatus.textContent = '❌ [permission] ' + err.message;
    return;
  }
  if (permission !== 'granted') {
    els.setupStatus.textContent = '❌ Notifications were not allowed. Please enable them in your phone/browser settings and try again.';
    return;
  }

  els.setupStatus.textContent = 'Registering service worker...';
  try {
    await navigator.serviceWorker.register('./firebase-messaging-sw.js');
  } catch (err) {
    console.error('[sw-register]', err);
    els.setupStatus.textContent = '❌ [sw-register] ' + err.message;
    return;
  }

  els.setupStatus.textContent = 'Waiting for service worker to activate...';
  let activeRegistration;
  try {
    activeRegistration = await navigator.serviceWorker.ready;
  } catch (err) {
    console.error('[sw-ready]', err);
    els.setupStatus.textContent = '❌ [sw-ready] ' + err.message;
    return;
  }

  els.setupStatus.textContent = 'Requesting push token from Firebase...';
  let token;
  try {
    token = await messaging.getToken({
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: activeRegistration
    });
  } catch (err) {
    console.error('[get-token]', err);
    els.setupStatus.textContent = '❌ [get-token] ' + err.message;
    return;
  }

  if (!token) {
    els.setupStatus.textContent = '❌ [get-token] No token returned. Try reinstalling the app from the home screen.';
    return;
  }

  els.setupStatus.textContent = 'Registering device with backend...';
  try {
    const backendResult = await registerDeviceWithBackend(name, sensorId, role, token);
    if (backendResult && backendResult.error) {
      els.setupStatus.textContent = '❌ [backend] ' + backendResult.error;
      return;
    }
  } catch (err) {
    console.error('[backend-register]', err);
    els.setupStatus.textContent = '❌ [backend] ' + err.message;
    return;
  }

  const user = { name, sensorId, role };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  self.__lastKnownUserName = name; // best-effort, used by the SW's fallback ack

  els.setupStatus.textContent = '✅ Registered! You will now receive alerts.';
  showMainScreen(user);
  startPolling();
}

function showMainScreen(user) {
  els.setupScreen.classList.add('hidden');
  els.mainScreen.classList.remove('hidden');
  els.loggedInAs.textContent = `${user.name} · ${user.sensorId} · ${user.role}`;
}

// ===== Polling fallback: covers missed pushes (phone was off, push dropped,
// browser throttled background sync, etc). Also keeps every team member's
// screen in sync — if alertX is acked by someone else, it disappears here too. =====
function startPolling() {
  syncActiveAlerts();
  pollTimer = setInterval(syncActiveAlerts, 15000);
}

async function syncActiveAlerts() {
  try {
    const active = await fetchActiveAlerts();
    currentAlerts = active;
    renderAlertList();
    if (active.length > 0) {
      showAlarm(active);
    } else {
      hideAlarm();
    }
  } catch (err) {
    console.warn('Sync failed (likely offline):', err);
  }
}

function addOrRefreshAlert(alert) {
  const exists = currentAlerts.find(a => a.alertId === alert.alertId);
  if (!exists) currentAlerts.push(alert);
  renderAlertList();
  showAlarm(currentAlerts);
}

function renderAlertList() {
  els.alertList.innerHTML = '';
  if (currentAlerts.length === 0) {
    els.noAlerts.classList.remove('hidden');
    return;
  }
  els.noAlerts.classList.add('hidden');
  currentAlerts.forEach(a => {
    const card = document.createElement('div');
    card.className = 'alert-card';
    card.innerHTML = `
      <div class="title">${escapeHtml(a.location || a.sensorId)}</div>
      <div class="meta">Sensor: ${escapeHtml(a.sensorId)} &middot; Temp: ${escapeHtml(a.temperature)}</div>
      <button data-id="${a.alertId}">Acknowledge</button>
    `;
    card.querySelector('button').addEventListener('click', () => acknowledge(a.alertId));
    els.alertList.appendChild(card);
  });
}

async function acknowledge(alertId) {
  const user = getSavedUser();
  await acknowledgeAlertOnBackend(alertId, user ? user.name : 'Unknown');
  currentAlerts = currentAlerts.filter(a => a.alertId !== alertId);
  renderAlertList();
  if (currentAlerts.length === 0) hideAlarm();
  else renderAlarmList();
}

// ===== The alarm itself =====
function showAlarm(alerts) {
  if (!alerts || alerts.length === 0) return;
  els.alarmOverlay.classList.remove('hidden');
  renderAlarmList();
  startSiren();
  requestWakeLock();
}

function hideAlarm() {
  els.alarmOverlay.classList.add('hidden');
  stopSiren();
  releaseWakeLock();
}

function renderAlarmList() {
  els.alarmAlertList.innerHTML = '';
  currentAlerts.forEach(a => {
    const item = document.createElement('div');
    item.className = 'alarm-alert-item';
    item.innerHTML = `
      <div class="title">${escapeHtml(a.location || a.sensorId)}</div>
      <div class="meta">Sensor: ${escapeHtml(a.sensorId)} &middot; Temp: ${escapeHtml(a.temperature)}</div>
      <button data-id="${a.alertId}">✅ Acknowledge</button>
    `;
    item.querySelector('button').addEventListener('click', () => acknowledge(a.alertId));
    els.alarmAlertList.appendChild(item);
  });
}

// --- Siren: built with Web Audio (no audio file needed), looped at max gain,
// plus a repeating vibration pattern. This is as loud as the browser/OS will
// allow — it respects the phone's physical silent switch and system volume,
// which no web app can override (see the conversation's platform-limit note).
let audioCtx = null;
let sirenInterval = null;
let vibrateInterval = null;

function startSiren() {
  if (sirenInterval) return; // already running
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    playSirenSweep();
    sirenInterval = setInterval(playSirenSweep, 900);
  } catch (err) {
    console.warn('Audio siren unavailable:', err);
  }

  if (navigator.vibrate) {
    navigator.vibrate([500, 200, 500, 200, 500, 200]);
    vibrateInterval = setInterval(() => navigator.vibrate([500, 200, 500, 200, 500, 200]), 2200);
  }
}

function stopSiren() {
  clearInterval(sirenInterval);
  sirenInterval = null;
  clearInterval(vibrateInterval);
  vibrateInterval = null;
  if (navigator.vibrate) navigator.vibrate(0);
}

function playSirenSweep() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(700, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(1400, audioCtx.currentTime + 0.4);
  osc.frequency.linearRampToValueAtTime(700, audioCtx.currentTime + 0.8);
  gain.gain.setValueAtTime(1.0, audioCtx.currentTime); // max gain the API allows
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.85);
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    console.warn('Wake lock failed:', err);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
