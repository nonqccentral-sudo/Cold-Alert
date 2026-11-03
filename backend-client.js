// ===== SHARED BACKEND CLIENT =====
// Small wrapper around calls to the Apps Script web app, used by both
// the main page (app.js) and the service worker (firebase-messaging-sw.js).

// NOTE: Content-Type is deliberately 'text/plain;charset=utf-8', NOT
// 'application/json'. Apps Script web apps don't handle CORS preflight
// (OPTIONS) requests, and 'application/json' forces the browser to send
// one before every POST — which gets blocked, so the real request never
// arrives. 'text/plain' is a CORS "simple request" (no preflight), and
// WebApp.gs already does JSON.parse(e.postData.contents) regardless of
// the declared content type, so the payload is still parsed as JSON
// server-side. Keep this as text/plain even if you change anything else.

function ackAlertFromServiceWorker(alertId) {
  // In the service worker we don't necessarily know "who" yet if the app
  // was never opened on this device — fall back to a stored name if present,
  // else a generic "Unknown (push action)".
  const ackBy = (self.__lastKnownUserName) || 'Unknown (via push action)';
  return fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'acknowledgeAlert', alertId, ackBy, secret: SHARED_SECRET })
  });
}

async function registerDeviceWithBackend(name, sensorId, role, token) {
  const res = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'registerDevice', name, sensorId, role, token, secret: SHARED_SECRET })
  });
  return res.json();
}

async function acknowledgeAlertOnBackend(alertId, ackBy) {
  const res = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'acknowledgeAlert', alertId, ackBy, secret: SHARED_SECRET })
  });
  return res.json();
}

async function fetchActiveAlerts() {
  const res = await fetch(`${BACKEND_URL}?action=activeAlerts`);
  return res.json();
}
