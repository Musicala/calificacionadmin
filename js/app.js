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
    evaluacionesHistoricas: [],
    authUser: null,
    unsubscribers: {
      empleados: null,
      items: null,
      evaluaciones: null,
      evaluacionesHistoricas: null,
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
    const periodoSugerido = getPeriodoSugerido();
    const year = Number(periodoSugerido.slice(0, 4)) || ahora.getFullYear();

    for (let i = 0; i < cantidad; i++) {
      const d = new Date(year, i, 1);
      const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

      periodos.push({
        valor,
        label: label.charAt(0).toUpperCase() + label.slice(1),
      });
    }

    return periodos;
  }

  function getPeriodoSugerido() {
    const ahora = new Date();
    const periodoEvaluado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
    return `${periodoEvaluado.getFullYear()}-${String(periodoEvaluado.getMonth() + 1).padStart(2, '0')}`;
  }

  function getPeriodoLabel(valor) {
    const periodo = state.periodos.find((p) => p.valor === valor);
    return periodo ? periodo.label : valor;
  }

  function getMesRegistroLabel() {
    const ahora = new Date();
    const label = ahora.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
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

      if (state.currentView === 'empleados') {
        _safeCall(_getUi()?.renderEmpleados);
      }

      if (state.currentView === 'evaluacion') {
        _safeCall(_getUi()?.actualizarEstadoEval);
        _safeCall(_getUi()?.cargarFormularioEval);
      }

      if (state.currentView === 'confidencial') {
        _safeCall(_getUi()?.refrescarModoConfidencial);
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
    confidencial: 'Confidencial',
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
      case 'confidencial':
        _safeCall(ui?.prepararModoConfidencial);
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

        if (state.currentView === 'confidencial') {
          _safeCall(ui?.prepararModoConfidencial);
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

        if (state.currentView === 'confidencial') {
          _safeCall(ui?.refrescarModoConfidencial);
        }

        if (state.currentView === 'dashboard') {
          _safeCall(ui?.renderDashboard);
        }
      });
    }

    if (typeof db.escucharTodasEvaluaciones === 'function') {
      state.unsubscribers.evaluacionesHistoricas = db.escucharTodasEvaluaciones((evaluaciones) => {
        state.evaluacionesHistoricas = Array.isArray(evaluaciones) ? evaluaciones : [];

        if (state.currentView === 'dashboard') {
          _safeCall(ui?.renderDashboard);
        }

        if (state.currentView === 'empleados') {
          _safeCall(ui?.renderEmpleados);
        }

        if (state.currentView === 'confidencial') {
          _safeCall(ui?.refrescarModoConfidencial);
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

  function getEvaluacionesHistoricas() {
    return state.evaluacionesHistoricas;
  }

  function getPeriodoActivo() {
    return state.periodoActivo;
  }

  function getAuthUserEmail() {
    return String(state.authUser?.email || '').trim().toLowerCase();
  }

  function _normalizarIdEvaluador(email) {
    return String(email || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sin_usuario';
  }

  function _getEvaluacionKey(empleadoId, periodo, evaluatorEmail = getAuthUserEmail()) {
    return `${periodo}_${empleadoId}_${_normalizarIdEvaluador(evaluatorEmail)}`;
  }

  function getItemsParaRol(rol) {
    return state.items.filter((item) =>
      item &&
      item.activo !== false &&
      (item.rol === 'Universal' || item.rol === rol)
    );
  }

  function getEvaluacion(empleadoId, periodo, evaluatorEmail = getAuthUserEmail()) {
    const evaluadorRuletaId = document.getElementById('conf-evaluador')?.value || '';
    const key = _getEvaluacionKey(empleadoId, periodo, evaluatorEmail);
    return state.evaluaciones[key]
      || (evaluadorRuletaId
        ? Object.values(state.evaluaciones).find((ev) =>
            ev?.periodo === periodo
            && ev?.empleadoId === empleadoId
            && String(ev?.evaluatorId || '') === evaluadorRuletaId
          )
        : null)
      || Object.values(state.evaluaciones).find((ev) =>
        ev?.periodo === periodo
        && ev?.empleadoId === empleadoId
        && !ev?.evaluatorEmail
        && !ev?.evaluatorId
      )
      || null;
  }

  function getEmpleadosPendientesUsuario(periodo = getPeriodoActivo()) {
    const stats = calcularEstadisticas(periodo);
    return stats.pendientesUsuario || [];
  }

  // ── Dashboard / métricas ─────────────────────────────────
  function _toNumber(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }

  function _round1(valor) {
    const n = _toNumber(valor);
    return n == null ? null : Number(n.toFixed(1));
  }

  function _sumarValoresCalificacion(ev) {
    const valores = Object.values(ev?.calificaciones || {})
      .map(_toNumber)
      .filter((v) => v != null);

    if (valores.length) {
      return valores.reduce((acc, v) => acc + v, 0);
    }

    const promedio = _toNumber(ev?.promedio);
    const totalItems = _toNumber(ev?.totalItems);
    if (promedio != null && totalItems != null) return promedio * totalItems;
    if (promedio != null) return promedio;
    return 0;
  }

  function _itemsEvaluados(ev) {
    const porObjeto = Object.keys(ev?.calificaciones || {}).length;
    if (porObjeto) return porObjeto;
    return _toNumber(ev?.totalItems) || 0;
  }

  function _periodoSortAsc(a, b) {
    return String(a || '').localeCompare(String(b || ''));
  }

  function _calcularTendencia(evalsEmpleado) {
    const ordenadas = [...evalsEmpleado]
      .filter((ev) => ev?.periodo && _toNumber(ev.promedio) != null)
      .sort((a, b) => _periodoSortAsc(a.periodo, b.periodo));

    if (ordenadas.length < 2) {
      return { tipo: 'nuevo', delta: null, label: 'Sin comparación' };
    }

    const penultima = _toNumber(ordenadas.at(-2).promedio) || 0;
    const ultima = _toNumber(ordenadas.at(-1).promedio) || 0;
    const delta = Number((ultima - penultima).toFixed(1));

    if (Math.abs(delta) < 0.1) return { tipo: 'igual', delta: 0, label: 'Estable' };
    if (delta > 0) return { tipo: 'sube', delta, label: `+${delta}` };
    return { tipo: 'baja', delta, label: String(delta) };
  }

  function _promedio(valores) {
    const nums = valores.map(_toNumber).filter((v) => v != null);
    if (!nums.length) return null;
    return _round1(nums.reduce((acc, v) => acc + v, 0) / nums.length);
  }

  function _agruparPeriodoPorEmpleado(evalsPeriodo) {
    const grupos = new Map();

    evalsPeriodo.forEach((ev) => {
      if (!ev?.empleadoId) return;
      const actuales = grupos.get(ev.empleadoId) || [];
      actuales.push(ev);
      grupos.set(ev.empleadoId, actuales);
    });

    return [...grupos.entries()].map(([empleadoId, evals]) => {
      const base = evals[0] || {};
      return {
        ...base,
        id: `${base.periodo || ''}_${empleadoId}_resumen`,
        empleadoId,
        promedio: _promedio(evals.map((ev) => ev.promedio)),
        totalItems: evals.reduce((acc, ev) => acc + _itemsEvaluados(ev), 0),
        calificaciones: evals.reduce((acc, ev) => ({ ...acc, ...(ev.calificaciones || {}) }), {}),
        evaluadores: evals.length,
        evaluacionesDetalle: evals,
      };
    });
  }

  function calcularEstadisticas(periodo) {
    const empleados = state.empleados.filter(Boolean);
    const empleadosActivos = empleados.filter((e) => e.activo !== false);
    const empleadosActivosIds = new Set(empleadosActivos.map((e) => e.id));

    const evalsPeriodo = Object.values(state.evaluaciones)
      .filter((ev) => ev && ev.periodo === periodo);

    const historicasFuente = state.evaluacionesHistoricas.length
      ? state.evaluacionesHistoricas
      : evalsPeriodo;
    const emailUsuario = getAuthUserEmail();
    const historicoUsuario = historicasFuente
      .filter((ev) => {
        const email = String(ev.evaluatorEmail || ev.updatedBy || ev.createdBy || '').trim().toLowerCase();
        return emailUsuario && email === emailUsuario;
      })
      .sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || '')));

    const evalsPeriodoPorEmpleado = _agruparPeriodoPorEmpleado(evalsPeriodo);
    const evaluacionesUsuarioPeriodo = evalsPeriodo.filter((ev) => {
      const email = String(ev.evaluatorEmail || ev.updatedBy || ev.createdBy || '').trim().toLowerCase();
      return email && email === getAuthUserEmail();
    });
    const evaluadosUsuarioIds = new Set(evaluacionesUsuarioPeriodo.map((ev) => ev.empleadoId));

    const promedioGeneral = _promedio(evalsPeriodo.map((ev) => ev.promedio));
    const evaluadosActivos = evalsPeriodoPorEmpleado.filter((ev) => empleadosActivosIds.has(ev.empleadoId));
    const evaluadosActivosIds = new Set(evaluadosActivos.map((ev) => ev.empleadoId));
    const cobertura = empleadosActivos.length
      ? Math.round((evaluadosActivosIds.size / empleadosActivos.length) * 100)
      : 0;

    const bajos = evalsPeriodo
      .filter((ev) => (_toNumber(ev.promedio) || 0) < 3)
      .sort((a, b) => (_toNumber(a.promedio) || 0) - (_toNumber(b.promedio) || 0));

    const pendientes = empleadosActivos
      .filter((emp) => !evaluadosActivosIds.has(emp.id))
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));

    const pendientesUsuario = empleadosActivos
      .filter((emp) => !evaluadosUsuarioIds.has(emp.id))
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));

    const ranking = evalsPeriodoPorEmpleado
      .map((ev) => {
        const emp = empleados.find((e) => e.id === ev.empleadoId);
        return emp
          ? {
              ...emp,
              promedio: _round1(ev.promedio) ?? 0,
              totalPuntosPeriodo: _round1(ev.evaluacionesDetalle?.reduce((acc, item) => acc + _sumarValoresCalificacion(item), 0) ?? _sumarValoresCalificacion(ev)) ?? 0,
              evaluadores: ev.evaluadores || 1,
              eval: ev,
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.promedio - a.promedio);

    const evaluacionesPeriodoDetalle = evalsPeriodo
      .map((ev) => {
        const emp = empleados.find((e) => e.id === ev.empleadoId);
        return {
          ...ev,
          empleadoNombre: emp?.nombre || ev.empleadoNombre || 'Sin nombre',
          empleadoRol: emp?.rol || ev.empleadoRol || 'Sin rol',
          evaluatorKey: String(ev.evaluatorId || ev.evaluatorEmail || ev.updatedBy || ev.createdBy || 'sin_evaluador'),
          evaluatorLabel: ev.evaluatorName || ev.peerEvaluatorName || ev.evaluatorEmail || ev.updatedBy || ev.createdBy || 'Sin identificar',
          puntos: _round1(_sumarValoresCalificacion(ev)) ?? 0,
        };
      })
      .sort((a, b) => (_toNumber(b.promedio) || 0) - (_toNumber(a.promedio) || 0));

    const evaluadoresResumen = [...evaluacionesPeriodoDetalle.reduce((map, ev) => {
      const actual = map.get(ev.evaluatorKey) || { id: ev.evaluatorKey, nombre: ev.evaluatorLabel, evaluaciones: 0, suma: 0 };
      actual.evaluaciones += 1;
      actual.suma += _toNumber(ev.promedio) || 0;
      map.set(ev.evaluatorKey, actual);
      return map;
    }, new Map()).values()]
      .map((item) => ({ ...item, promedio: _round1(item.suma / item.evaluaciones) }))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));

    const itemTotales = {};
    const itemCounts = {};

    evalsPeriodo.forEach((ev) => {
      if (!ev.calificaciones || typeof ev.calificaciones !== 'object') return;

      Object.entries(ev.calificaciones).forEach(([itemId, valor]) => {
        const num = _toNumber(valor);
        if (num == null) return;
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
          descripcion: item?.descripcion || '',
          promedio: _round1(promedio),
          evaluaciones: itemCounts[id] || 0,
          porcentaje: Math.max(0, Math.min(100, Math.round((promedio / 5) * 100))),
        };
      })
      .sort((a, b) => (a.promedio || 0) - (b.promedio || 0));

    const acumuladoPorMiembro = empleados
      .map((emp) => {
        const evalsEmp = historicasFuente
          .filter((ev) => ev?.empleadoId === emp.id)
          .sort((a, b) => _periodoSortAsc(a.periodo, b.periodo));

        const totalPuntos = evalsEmp.reduce((acc, ev) => acc + _sumarValoresCalificacion(ev), 0);
        const totalItems = evalsEmp.reduce((acc, ev) => acc + _itemsEvaluados(ev), 0);
        const promedios = evalsEmp.map((ev) => ev.promedio);
        const promedioHistorico = _promedio(promedios);
        const tendencia = _calcularTendencia(evalsEmp);
        const ultimo = evalsEmp.at(-1) || null;
        const mejor = evalsEmp.reduce((best, ev) => {
          if (!best) return ev;
          return (_toNumber(ev.promedio) || 0) > (_toNumber(best.promedio) || 0) ? ev : best;
        }, null);
        const peor = evalsEmp.reduce((worst, ev) => {
          if (!worst) return ev;
          return (_toNumber(ev.promedio) || 0) < (_toNumber(worst.promedio) || 0) ? ev : worst;
        }, null);

        return {
          id: emp.id,
          nombre: emp.nombre || 'Sin nombre',
          rol: emp.rol || 'Sin rol',
          activo: emp.activo !== false,
          evaluaciones: evalsEmp.length,
          itemsCalificados: totalItems,
          totalPuntos: _round1(totalPuntos) ?? 0,
          promedioHistorico,
          ultimoPromedio: _round1(ultimo?.promedio),
          ultimoPeriodo: ultimo?.periodo || '',
          mejorPromedio: _round1(mejor?.promedio),
          mejorPeriodo: mejor?.periodo || '',
          peorPromedio: _round1(peor?.promedio),
          peorPeriodo: peor?.periodo || '',
          tendencia,
        };
      })
      .filter((emp) => emp.evaluaciones > 0)
      .sort((a, b) => {
        if ((b.totalPuntos || 0) !== (a.totalPuntos || 0)) return (b.totalPuntos || 0) - (a.totalPuntos || 0);
        return (b.promedioHistorico || 0) - (a.promedioHistorico || 0);
      });

    const tendenciaMensual = [...new Set(historicasFuente.map((ev) => ev.periodo).filter(Boolean))]
      .sort(_periodoSortAsc)
      .slice(-12)
      .map((per) => {
        const evals = historicasFuente.filter((ev) => ev.periodo === per);
        const promedio = _promedio(evals.map((ev) => ev.promedio));
        return {
          periodo: per,
          promedio,
          evaluaciones: evals.length,
          porcentaje: promedio != null ? Math.max(0, Math.min(100, Math.round((promedio / 5) * 100))) : 0,
        };
      });

    const distribucion = {
      excelente: evalsPeriodo.filter((ev) => (_toNumber(ev.promedio) || 0) >= 4.5).length,
      bueno: evalsPeriodo.filter((ev) => {
        const p = _toNumber(ev.promedio) || 0;
        return p >= 3.8 && p < 4.5;
      }).length,
      estable: evalsPeriodo.filter((ev) => {
        const p = _toNumber(ev.promedio) || 0;
        return p >= 3 && p < 3.8;
      }).length,
      alerta: bajos.length,
    };

    return {
      totalActivos: empleadosActivos.length,
      evaluados: evalsPeriodo.length,
      evaluadosActivos: evaluadosActivosIds.size,
      evaluacionesUsuario: evaluacionesUsuarioPeriodo.length,
      cobertura,
      promedioGeneral,
      historicasTotal: historicasFuente.length,
      historicoUsuario,
      bajos,
      pendientes,
      pendientesUsuario,
      ranking,
      evaluacionesPeriodoDetalle,
      evaluadoresResumen,
      itemsMasbajos: itemsPromedio.slice(0, 6),
      itemsPromedio,
      acumuladoPorMiembro,
      tendenciaMensual,
      distribucion,
      mejorActual: ranking[0] || null,
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
    state.evaluacionesHistoricas = [];
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
      state.periodoActivo = getPeriodoSugerido();
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
    getEvaluacionesHistoricas,
    getPeriodoActivo,
    getPeriodoLabel,
    getMesRegistroLabel,
    getAuthUserEmail,
    getItemsParaRol,
    getEvaluacion,
    getEmpleadosPendientesUsuario,
    calcularEstadisticas,
    getHistorialEmpleado,
    limpiarListeners,
  };

})();

export default app;
