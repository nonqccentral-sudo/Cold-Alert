// ===== SERVICE WORKER =====
// Handles push notifications that arrive while the app is closed/backgrounded.
// This is what makes alerts show up "irrespective of whether the app is open".
//
// IMPORTANT: this file must be served from the ROOT of your site
// (e.g. https://yourname.github.io/temp-breach-alert/firebase-messaging-sw.js)
// for push scope to work correctly on GitHub Pages project sites.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
importScripts('./firebase-config.js');
importScripts('./backend-client.js');

firebase.initializeApp(FIREBASE_CONFIG);
const messaging = firebase.messaging();

// Fires when a push arrives and the PWA is NOT in the foreground.
// We build the notification manually (rather than relying on the
// "notification" payload alone) so we can attach the Acknowledge action
// and force requireInteraction (keeps it on screen until dismissed/acted on).
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = payload.notification?.title || `🚨 Temp Breach: ${data.location || data.sensorId}`;
  const body = payload.notification?.body || `Temp: ${data.temperature}`;

  const options = {
    body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [400, 200, 400, 200, 400, 200, 400], // long/strong pattern, repeats via OS
    tag: `breach-${data.alertId}`,
    renotify: true,
    requireInteraction: true, // stays on screen until the user acts (where supported)
    data: data,
    actions: [
      { action: 'acknowledge', title: '✅ Acknowledge' },
      { action: 'open', title: 'Open app' }
    ]
  };

  self.registration.showNotification(title, options);
});

// Handles taps on the notification itself or its action buttons.
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  if (event.action === 'acknowledge') {
    event.waitUntil(
      ackAlertFromServiceWorker(data.alertId)
        .catch(() => { /* if offline, the app will retry on next open */ })
    );
    return;
  }

  // Default tap, or "open" action: bring the app to foreground / open it,
  // landing on the active-alerts screen so the person can ack from there too.
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
