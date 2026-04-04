// ============================================================
//  app.js — Controlador principal · Musicala Evaluaciones
//  Responsabilidad: init, guard de sesión, navegación entre
//  vistas, período activo y coordinación entre módulos.
// ============================================================

const app = (() => {

  // ── Estado global de la aplicación ──────────────────────
  const state = {
    currentView: 'dashboard',
    periodoActivo: null,
    periodos: [],
    empleados: [],
    items: [],
    evaluaciones: {},
    authUser: null,
    unsubscribers: {
      empleados: null,
      items: null,
      evaluaciones: null,
      auth: null,
    },
    uiReady: false,
  };

  // ── Helpers base ────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  function _getUi() {
    return window.ui || null;
  }

  function _getDb() {
    return window.db || null;
  }

  function _getAuth() {
    return window.auth || null;
  }

  function _getFirebaseAuthFns() {
    return window._firebaseAuthFns || {};
  }

  function _getFirebaseAuth() {
    return window._firebaseAuth || null;
  }

  function _safeCall(fn, ...args) {
    if (typeof fn !== 'function') return undefined;
    try {
      return fn(...args);
    } catch (error) {
      console.error('[app] Error ejecutando función:', error);
      return undefined;
    }
  }

  function _loginErrorVisible() {
    const errorBox = $('login-error');
    return !!errorBox && !errorBox.classList.contains('hidden');
  }

  function ocultarErrorLogin() {
    const err = $('login-error');
    if (err) err.classList.add('hidden');
  }

  function _showLoginView({ preserveLoginError = false } = {}) {
    const loginView = $('view-login');
    const appShell = $('app-shell');

    if (appShell) appShell.classList.add('hidden');

    if (loginView) {
      loginView.style.display = '';
      loginView.classList.add('active');
    }

    if (!preserveLoginError) {
      ocultarErrorLogin();
    }
  }

  function _hideLoginView() {
    const loginView = $('view-login');
    const appShell = $('app-shell');

    if (loginView) {
      loginView.classList.remove('active');
      loginView.style.display = 'none';
    }

    if (appShell) {
      appShell.classList.remove('hidden');
    }
  }

  async function _esperarAuthReady() {
    try {
      if (window._firebaseAuthReady && typeof window._firebaseAuthReady.then === 'function') {
        await window._firebaseAuthReady;
      }
    } catch (error) {
      console.error('[app] Error esperando Firebase Auth:', error);
    }
  }

  // ── Períodos ─────────────────────────────────────────────
  function generarPeriodos(cantidad = 12) {
    const periodos = [];
    const ahora = new Date();

    for (let i = 0; i < cantidad; i++) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

      periodos.push({
        valor,
        label: label.charAt(0).toUpperCase() + label.slice(1),
      });
    }

    return periodos;
  }

  function getPeriodoLabel(valor) {
    const periodo = state.periodos.find((p) => p.valor === valor);
    return periodo ? periodo.label : valor;
  }

  function poblarSelectoresPeriodo() {
    state.periodos = generarPeriodos(12);

    ['select-periodo', 'eval-periodo'].forEach((id) => {
      const sel = $(id);
      if (!sel) return;

      sel.innerHTML = '';

      state.periodos.forEach((periodo) => {
        const opt = document.createElement('option');
        opt.value = periodo.valor;
        opt.textContent = periodo.label;
        sel.appendChild(opt);
      });

      if (state.periodoActivo) {
        sel.value = state.periodoActivo;
      }
    });
  }

  function _setPeriodoBase(valor) {
    if (!valor) return;

    state.periodoActivo = valor;

    document.querySelectorAll('#select-periodo, #eval-periodo').forEach((sel) => {
      sel.value = valor;
    });

    if (state.currentView === 'dashboard') {
      _safeCall(_getUi()?.renderDashboard);
    }

    if (state.currentView === 'evaluacion') {
      _safeCall(_getUi()?.actualizarSelectEvaluacion);
      _safeCall(_getUi()?.actualizarEstadoEval);
    }
  }

  function resuscribirEvaluaciones(periodo) {
    const db = _getDb();
    if (!db || typeof db.escucharEvaluaciones !== 'function') return;

    if (typeof state.unsubscribers.evaluaciones === 'function') {
      state.unsubscribers.evaluaciones();
      state.unsubscribers.evaluaciones = null;
    }

    state.unsubscribers.evaluaciones = db.escucharEvaluaciones(periodo, (evals) => {
      state.evaluaciones = evals || {};

      if (state.currentView === 'dashboard') {
        _safeCall(_getUi()?.renderDashboard);
      }

      if (state.currentView === 'evaluacion') {
        _safeCall(_getUi()?.actualizarEstadoEval);
        _safeCall(_getUi()?.cargarFormularioEval);
      }
    });
  }

  function _setPeriodoCompleto(valor) {
    _setPeriodoBase(valor);
    resuscribirEvaluaciones(valor);
  }

  // ── Navegación ───────────────────────────────────────────
  const VIEW_TITLES = {
    dashboard: 'Dashboard',
    empleados: 'Equipo',
    evaluacion: 'Evaluar',
    config: 'Configuración',
  };

  function navigate(viewName) {
    if (!VIEW_TITLES[viewName]) return;

    const prevView = $(`view-${state.currentView}`);
    const nextView = $(`view-${viewName}`);

    if (prevView) prevView.classList.remove('active');
    if (nextView) nextView.classList.add('active');

    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    const topbarSection = $('topbar-section');
    if (topbarSection) {
      topbarSection.textContent = VIEW_TITLES[viewName];
    }

    state.currentView = viewName;

    const main = $('main-content');
    if (main) main.scrollTop = 0;

    _onViewEnter(viewName);
  }

  function _onViewEnter(viewName) {
    const ui = _getUi();

    switch (viewName) {
      case 'dashboard':
        _safeCall(ui?.renderDashboard);
        break;
      case 'empleados':
        _safeCall(ui?.renderEmpleados);
        break;
      case 'evaluacion':
        _safeCall(ui?.prepararVistaEvaluacion);
        break;
      case 'config':
        _safeCall(ui?.renderConfig);
        break;
    }
  }

  // ── Sidebar toggle ───────────────────────────────────────
  function initSidebarToggle() {
    const btn = $('sidebar-toggle');
    const shell = $('app-shell');
    const sidebar = $('sidebar');

    if (!btn || !shell || !sidebar) return;
    if (btn.dataset.bound === 'true') return;

    btn.dataset.bound = 'true';

    btn.addEventListener('click', () => {
      shell.classList.toggle('collapsed');
      sidebar.classList.toggle('collapsed');
    });
  }

  // ── Datos realtime (Firestore) ───────────────────────────
  function limpiarListeners() {
    Object.keys(state.unsubscribers).forEach((key) => {
      if (key === 'auth') return;

      const unsub = state.unsubscribers[key];
      if (typeof unsub === 'function') {
        try {
          unsub();
        } catch (error) {
          console.warn(`[app] Error limpiando listener "${key}":`, error);
        }
      }

      state.unsubscribers[key] = null;
    });
  }

  function suscribirDatos() {
    const db = _getDb();
    const ui = _getUi();

    if (!db) {
      console.error('[app] db no está disponible.');
      return;
    }

    limpiarListeners();

    if (typeof db.escucharEmpleados === 'function') {
      state.unsubscribers.empleados = db.escucharEmpleados((empleados) => {
        state.empleados = Array.isArray(empleados) ? empleados : [];

        if (state.currentView === 'empleados') {
          _safeCall(ui?.renderEmpleados);
        }

        if (state.currentView === 'evaluacion') {
          _safeCall(ui?.actualizarSelectEvaluacion);
          _safeCall(ui?.actualizarEstadoEval);
        }

        if (state.currentView === 'dashboard') {
          _safeCall(ui?.renderDashboard);
        }

        if (state.currentView === 'config') {
          _safeCall(ui?.renderConfig);
        }
      });
    }

    if (typeof db.escucharItems === 'function') {
      state.unsubscribers.items = db.escucharItems((items) => {
        state.items = Array.isArray(items) ? items : [];

        if (state.currentView === 'config') {
          _safeCall(ui?.renderConfig);
        }

        if (state.currentView === 'evaluacion') {
          _safeCall(ui?.cargarFormularioEval);
        }

        if (state.currentView === 'dashboard') {
          _safeCall(ui?.renderDashboard);
        }
      });
    }

    resuscribirEvaluaciones(state.periodoActivo);
  }

  // ── Getters del estado ───────────────────────────────────
  function getState() {
    return state;
  }

  function getEmpleados() {
    return state.empleados;
  }

  function getItems() {
    return state.items;
  }

  function getEvaluaciones() {
    return state.evaluaciones;
  }

  function getPeriodoActivo() {
    return state.periodoActivo;
  }

  function getItemsParaRol(rol) {
    return state.items.filter((item) =>
      item &&
      item.activo !== false &&
      (item.rol === 'Universal' || item.rol === rol)
    );
  }

  function getEvaluacion(empleadoId, periodo) {
    const key = `${periodo}_${empleadoId}`;
    return state.evaluaciones[key] || null;
  }

  // ── Dashboard / métricas ─────────────────────────────────
  function calcularEstadisticas(periodo) {
    const empleadosActivos = state.empleados.filter((e) => e && e.activo !== false);
    const evals = Object.values(state.evaluaciones).filter((ev) => ev && ev.periodo === periodo);

    let promedioGeneral = null;

    if (evals.length > 0) {
      const suma = evals.reduce((acc, ev) => acc + (Number(ev.promedio) || 0), 0);
      promedioGeneral = (suma / evals.length).toFixed(1);
    }

    const bajos = evals.filter((ev) => (Number(ev.promedio) || 0) < 3);

    const ranking = evals
      .map((ev) => {
        const emp = empleadosActivos.find((e) => e.id === ev.empleadoId);
        return emp
          ? {
              ...emp,
              promedio: Number(ev.promedio) || 0,
              eval: ev,
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.promedio - a.promedio);

    const itemTotales = {};
    const itemCounts = {};

    evals.forEach((ev) => {
      if (!ev.calificaciones || typeof ev.calificaciones !== 'object') return;

      Object.entries(ev.calificaciones).forEach(([itemId, valor]) => {
        const num = Number(valor) || 0;
        itemTotales[itemId] = (itemTotales[itemId] || 0) + num;
        itemCounts[itemId] = (itemCounts[itemId] || 0) + 1;
      });
    });

    const itemsPromedio = Object.entries(itemTotales)
      .map(([id, total]) => {
        const item = state.items.find((i) => i.id === id);
        const promedio = itemCounts[id] ? total / itemCounts[id] : 0;

        return {
          id,
          nombre: item ? item.nombre : id,
          promedio: promedio.toFixed(1),
        };
      })
      .sort((a, b) => parseFloat(a.promedio) - parseFloat(b.promedio));

    return {
      totalActivos: empleadosActivos.length,
      evaluados: evals.length,
      promedioGeneral,
      bajos,
      ranking,
      itemsMasbajos: itemsPromedio.slice(0, 5),
    };
  }

  // ── Historial completo de un empleado ────────────────────
  async function getHistorialEmpleado(empleadoId) {
    const db = _getDb();

    if (!db || typeof db.obtenerHistorialEmpleado !== 'function') {
      console.error('[app] db.obtenerHistorialEmpleado no está disponible.');
      return [];
    }

    try {
      return await db.obtenerHistorialEmpleado(empleadoId);
    } catch (error) {
      console.error('[app] Error cargando historial del empleado:', error);
      return [];
    }
  }

  // ── Flujo de sesión ──────────────────────────────────────
  function _resolverNombreUsuario(user) {
    const displayName = String(user?.displayName || '').trim();
    if (displayName) return displayName;

    const email = String(user?.email || '').trim();
    const base = email.split('@')[0] || 'Admin';

    return base
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function _resolverInicialUsuario(user) {
    const nombre = _resolverNombreUsuario(user);
    return nombre.charAt(0).toUpperCase() || 'A';
  }

  function _pintarUsuario(user) {
    const avatarEl = $('user-avatar');
    const nameEl = $('user-name');

    if (avatarEl) avatarEl.textContent = _resolverInicialUsuario(user);
    if (nameEl) nameEl.textContent = _resolverNombreUsuario(user);
  }

  function _resetStateAfterLogout() {
    state.authUser = null;
    state.empleados = [];
    state.items = [];
    state.evaluaciones = {};
    state.currentView = 'dashboard';
  }

  function _onLogin(user) {
    state.authUser = user;

    _hideLoginView();
    _pintarUsuario(user);
    poblarSelectoresPeriodo();
    initSidebarToggle();
    suscribirDatos();
    navigate('dashboard');
  }

  function _onLogout({ preserveLoginError = _loginErrorVisible() } = {}) {
    limpiarListeners();
    _resetStateAfterLogout();
    _showLoginView({ preserveLoginError });
  }

  async function _handleAuthState(user) {
    const auth = _getAuth();

    if (!user) {
      _onLogout();
      return;
    }

    const autorizado = await auth?.verificarYGuardar?.(user, {
      mostrarError: true,
      cerrarSesion: true,
      silentLogout: true,
    });

    if (!autorizado) {
      _onLogout({ preserveLoginError: true });
      return;
    }

    _onLogin(user);
  }

  // ── Inicialización ───────────────────────────────────────
  async function init() {
    if (!state.periodoActivo) {
      const ahora = new Date();
      state.periodoActivo = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    }

    poblarSelectoresPeriodo();
    initSidebarToggle();
    await _esperarAuthReady();

    const firebaseAuth = _getFirebaseAuth();
    const { onAuthStateChanged } = _getFirebaseAuthFns();

    if (!firebaseAuth) {
      console.error('[app] window._firebaseAuth no está disponible.');
      _onLogout();
      return;
    }

    if (typeof onAuthStateChanged !== 'function') {
      console.error('[app] onAuthStateChanged no está disponible en window._firebaseAuthFns.');
      _onLogout();
      return;
    }

    if (typeof state.unsubscribers.auth === 'function') {
      try {
        state.unsubscribers.auth();
      } catch (error) {
        console.warn('[app] No se pudo limpiar el observer auth previo:', error);
      }
      state.unsubscribers.auth = null;
    }

    state.unsubscribers.auth = onAuthStateChanged(firebaseAuth, async (user) => {
      try {
        await _handleAuthState(user);
      } catch (error) {
        console.error('[app] Error en observer de autenticación:', error);
        _onLogout();
      }
    });
  }

  // ── API pública ──────────────────────────────────────────
  return {
    init,
    navigate,
    setPeriodo: _setPeriodoCompleto,
    getState,
    getEmpleados,
    getItems,
    getEvaluaciones,
    getPeriodoActivo,
    getPeriodoLabel,
    getItemsParaRol,
    getEvaluacion,
    calcularEstadisticas,
    getHistorialEmpleado,
    limpiarListeners,
  };

})();

export default app;