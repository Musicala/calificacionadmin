// ============================================================
//  auth.js — Autenticación · Musicala Evaluaciones
//  Responsabilidad: login con Google, logout, whitelist de
//  correos autorizados y manejo de errores de acceso.
// ============================================================

const auth = (() => {

  // ── Correos autorizados ──────────────────────────────────
  const ADMINS_AUTORIZADOS = new Set([
    'alekcaballeromusic@gmail.com',
    'catalina.medina.leal@gmail.com',
  ]);

  // ── Helpers base ─────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  // ── Estado local ─────────────────────────────────────────
  let _loginEnProceso = false;
  let _logoutEnProceso = false;

  // ── Helpers de normalización ─────────────────────────────
  function _normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function _getAuthInstance() {
    return window._firebaseAuth || null;
  }

  function _getAuthFns() {
    return window._firebaseAuthFns || {};
  }

  function _getUi() {
    return window.ui || null;
  }

  async function _esperarAuthReady() {
    try {
      if (window._firebaseAuthReady && typeof window._firebaseAuthReady.then === 'function') {
        await window._firebaseAuthReady;
      }
    } catch (error) {
      console.error('[auth] Error esperando persistencia de Firebase:', error);
      throw error;
    }
  }

  // ── UI del login ─────────────────────────────────────────
  function _mostrarError(mensaje) {
    const errorBox = $('login-error');
    const errorMsg = $('login-error-msg');

    if (errorMsg) errorMsg.textContent = mensaje || 'Ocurrió un error al iniciar sesión.';
    if (errorBox) errorBox.classList.remove('hidden');
  }

  function _ocultarError() {
    const errorBox = $('login-error');
    if (errorBox) errorBox.classList.add('hidden');
  }

  function _setLoading(activo) {
    _loginEnProceso = activo;

    const btnLogin = $('btn-login');
    const btnText = document.querySelector('#btn-login .btn-text');
    const btnLoader = document.querySelector('#btn-login .btn-loader');

    if (btnLogin) {
      btnLogin.disabled = !!activo;
      btnLogin.setAttribute('aria-busy', activo ? 'true' : 'false');
    }

    if (btnText) btnText.classList.toggle('hidden', !!activo);
    if (btnLoader) btnLoader.classList.toggle('hidden', !activo);
  }

  function _toast(mensaje, tipo = 'error') {
    try {
      _getUi()?.toast?.(mensaje, tipo);
    } catch (error) {
      console.warn('[auth] No se pudo mostrar toast:', error);
    }
  }

  // ── Guard de autorización ────────────────────────────────
  function esAdminAutorizado(email) {
    return ADMINS_AUTORIZADOS.has(_normalizarEmail(email));
  }

  async function verificarYGuardar(user, options = {}) {
    const {
      mostrarError = false,
      cerrarSesion = true,
      silentLogout = true,
    } = options;

    const email = _normalizarEmail(user?.email);

    if (!user || !email || !esAdminAutorizado(email)) {
      console.warn('[auth] Usuario autenticado no autorizado:', email || '(sin correo)');

      if (cerrarSesion && _getAuthInstance()?.currentUser) {
        await logout({ silent: silentLogout });
      }

      if (mostrarError) {
        _mostrarError('Tu cuenta de Google inició sesión, pero este correo no tiene acceso a este sistema.');
      }

      return false;
    }

    _ocultarError();
    return true;
  }

  // ── Login SOLO con Google ────────────────────────────────
  async function login() {
    if (_loginEnProceso) return false;

    _ocultarError();
    _setLoading(true);

    try {
      await _esperarAuthReady();

      const firebaseAuth = _getAuthInstance();
      const authFns = _getAuthFns();

      if (!firebaseAuth) {
        throw new Error('Firebase Auth no está disponible en window._firebaseAuth.');
      }

      if (typeof authFns.signInWithPopup !== 'function') {
        throw new Error('signInWithPopup no está disponible en window._firebaseAuthFns.');
      }

      const provider =
        typeof authFns.createGoogleProvider === 'function'
          ? authFns.createGoogleProvider()
          : (typeof authFns.GoogleAuthProvider === 'function'
              ? new authFns.GoogleAuthProvider()
              : null);

      if (!provider) {
        throw new Error('GoogleAuthProvider no está disponible.');
      }

      const result = await authFns.signInWithPopup(firebaseAuth, provider);
      const user = result?.user || firebaseAuth.currentUser || null;

      if (!user) {
        throw new Error('No se recibió un usuario válido desde Firebase Auth.');
      }

      const autorizado = await verificarYGuardar(user, {
        mostrarError: true,
        cerrarSesion: true,
        silentLogout: true,
      });

      return !!autorizado;
    } catch (error) {
      _manejarErrorFirebase(error);
      return false;
    } finally {
      _setLoading(false);
    }
  }

  // ── Logout ───────────────────────────────────────────────
  async function logout(options = {}) {
    const { silent = false } = options;

    if (_logoutEnProceso) return true;
    _logoutEnProceso = true;

    try {
      const firebaseAuth = _getAuthInstance();
      const authFns = _getAuthFns();

      if (!firebaseAuth) {
        throw new Error('Firebase Auth no está disponible para cerrar sesión.');
      }

      if (typeof authFns.signOut !== 'function') {
        throw new Error('signOut no está disponible en window._firebaseAuthFns.');
      }

      await authFns.signOut(firebaseAuth);
      return true;
    } catch (error) {
      console.error('[auth] Error al cerrar sesión:', error);

      if (!silent) {
        _toast('No se pudo cerrar sesión. Intentá de nuevo.', 'error');
      }

      return false;
    } finally {
      _logoutEnProceso = false;
      _setLoading(false);
    }
  }

  // ── Manejo de errores Firebase/Auth ──────────────────────
  function _manejarErrorFirebase(error) {
    const code = error?.code || '';
    const rawMessage = error?.message || '';

    const mensajes = {
      'auth/popup-closed-by-user': 'Se cerró la ventana de acceso antes de completar el inicio de sesión.',
      'auth/popup-blocked': 'El navegador bloqueó la ventana emergente. Permití popups e intentá otra vez.',
      'auth/cancelled-popup-request': 'Ya había un intento de acceso en curso. Esperá un momento e intentá de nuevo.',
      'auth/network-request-failed': 'No se pudo conectar con Firebase. Revisá tu internet e intentá otra vez.',
      'auth/too-many-requests': 'Se detectaron demasiados intentos. Esperá un momento antes de volver a ingresar.',
      'auth/operation-not-allowed': 'El acceso con Google no está habilitado en Firebase Authentication.',
      'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Authentication.',
      'auth/invalid-api-key': 'La configuración de Firebase no es válida. Revisá la API key del proyecto.',
      'auth/internal-error': 'Ocurrió un error interno al iniciar sesión. Intentá nuevamente.',
    };

    let mensaje = mensajes[code] || 'No fue posible iniciar sesión con Google. Intentá de nuevo.';

    if (!code && /GoogleAuthProvider|signInWithPopup|Firebase Auth/i.test(rawMessage)) {
      mensaje = 'La configuración del acceso con Google no está completa en el proyecto.';
    }

    if (!code && /auth\/unauthorized-domain/i.test(rawMessage)) {
      mensaje = 'Este dominio no está autorizado en Firebase Authentication.';
    }

    _mostrarError(mensaje);
    console.error('[auth] Firebase Auth error:', code || '(sin código)', error);
  }

  // ── Inicialización ───────────────────────────────────────
  function init() {
    const btnLogin = $('btn-login');

    if (btnLogin && !btnLogin.dataset.authBound) {
      btnLogin.dataset.authBound = 'true';
      btnLogin.addEventListener('click', () => {
        _ocultarError();
      });
    }
  }

  // ── API pública ──────────────────────────────────────────
  return {
    init,
    login,
    logout,
    esAdminAutorizado,
    verificarYGuardar,
  };

})();

export default auth;