// ===== FIREBASE WEB CONFIG =====
// From Firebase Console > Project Settings > General > Your apps > Web app.
// This is PUBLIC (safe to ship in frontend code) — it just identifies the
// project, it is not a secret credential.
const FIREBASE_CONFIG = {
  apiKey: "PUT_YOUR_API_KEY_HERE",
  authDomain: "PUT_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "PUT_YOUR_PROJECT_ID",
  storageBucket: "PUT_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "PUT_YOUR_SENDER_ID",
  appId: "PUT_YOUR_APP_ID"
};

// From Firebase Console > Project Settings > Cloud Messaging > Web Push certificates.
const FIREBASE_VAPID_KEY = "PUT_YOUR_VAPID_PUBLIC_KEY_HERE";

// The deployed Apps Script Web App URL (ends in /exec).
const BACKEND_URL = "PUT_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";

// Must match SHARED_SECRET in WebApp.gs exactly.
const SHARED_SECRET = "CHANGE_ME_TO_SOMETHING_RANDOM";
