// ============================================================
//  firebase-config.js — Inicialización Firebase
//  Responsabilidad: levantar app, auth y firestore, configurar
//  persistencia local y exponer referencias globales para los
//  demás módulos del proyecto.
// ============================================================

import {
  initializeApp,
  getApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Configuración del proyecto Firebase ─────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDpeYIKZvVBQEP04-qulyofmN1-EmfC9R0",
  authDomain: "calificacion-administrativa.firebaseapp.com",
  projectId: "calificacion-administrativa",
  storageBucket: "calificacion-administrativa.firebasestorage.app",
  messagingSenderId: "2776331675",
  appId: "1:2776331675:web:c42b55d24a2e781c14dd3e",
};

// ── Inicialización segura ───────────────────────────────────
// Evita dobles initializeApp si el módulo se llegara a importar
// más de una vez dentro del ciclo de vida de la página.
const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ── Configuración de Auth ───────────────────────────────────
auth.languageCode = "es";

// Persistencia local del login
const authReady = setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.info("[firebase-config] Persistencia local activada.");
    return true;
  })
  .catch((error) => {
    console.error("[firebase-config] No se pudo activar la persistencia local:", error);
    throw error;
  });

// ── Provider de Google ──────────────────────────────────────
// Se expone como factory para que auth.js cree un provider limpio
// en cada intento de login y no termine mutando una instancia
// compartida porque la vida ya tiene suficientes problemas.
function createGoogleProvider() {
  const provider = new GoogleAuthProvider();

  // Forzar selector de cuenta para evitar que se “pegue”
  // silenciosamente a una cuenta previa no deseada.
  provider.setCustomParameters({
    prompt: "select_account",
  });

  provider.addScope("email");
  provider.addScope("profile");

  return provider;
}

// ── Compatibilidad global con el proyecto actual ────────────
// Sí, seguimos usando globals porque tu proyecto ya está armado
// así y no vamos a volverlo experimental por deporte.
window._firebaseApp = firebaseApp;
window._firebaseAuth = auth;
window._firebaseDb = db;
window._firebaseAuthReady = authReady;

window._firebaseAuthFns = {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  createGoogleProvider,
};

// ── Exports del módulo ──────────────────────────────────────
export {
  firebaseApp,
  auth,
  db,
  authReady,
  firebaseConfig,
  createGoogleProvider,
};

export default {
  firebaseApp,
  auth,
  db,
  authReady,
  firebaseConfig,
  createGoogleProvider,
};