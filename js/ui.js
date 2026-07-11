// ============================================================
//  ui.js — Interfaz · Musicala Evaluaciones
//  Responsabilidad: renderizar vistas, modales, filtros,
//  formulario de evaluación, historial y toasts.
// ============================================================

const ui = (() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    filtroItemsRol: 'todos',
    toastTimer: null,
    listenersInicializados: false,
    confidentialEmpleadoId: '',
    evalFormHome: null,
    confidentialKioskActive: false,
    rouletteSpinTimer: null,
  };

  // ── Helpers ──────────────────────────────────────────────
  function escapeHtml(valor = '') {
    return String(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function obtenerApp() {
    if (!window.app) throw new Error('window.app no está disponible todavía');
    return window.app;
  }

  function obtenerDb() {
    if (!window.db) throw new Error('window.db no está disponible todavía');
    return window.db;
  }

  function toNumber(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }

  function getInicial(nombre = '') {
    return String(nombre || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function getEmpleadoPorId(id) {
    return obtenerApp().getEmpleados().find((e) => e.id === id) || null;
  }

  function getItemPorId(id) {
    return obtenerApp().getItems().find((i) => i.id === id) || null;
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function formatoNumero(valor, decimales = 1) {
    if (valor == null || valor === '') return '—';
    const n = Number(valor);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-CO', {
      minimumFractionDigits: n % 1 === 0 ? 0 : decimales,
      maximumFractionDigits: decimales,
    });
  }

  function formatoPuntos(valor) {
    if (valor == null || valor === '') return '0';
    const n = Number(valor);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('es-CO', { maximumFractionDigits: 1 });
  }

  function trendClass(tendencia = {}) {
    if (tendencia.tipo === 'sube') return 'trend-up';
    if (tendencia.tipo === 'baja') return 'trend-down';
    if (tendencia.tipo === 'igual') return 'trend-flat';
    return 'trend-new';
  }

  function trendLabel(tendencia = {}) {
    if (tendencia.tipo === 'sube') return `↑ ${tendencia.label}`;
    if (tendencia.tipo === 'baja') return `↓ ${tendencia.label}`;
    if (tendencia.tipo === 'igual') return '→ estable';
    return tendencia.label || 'Sin comparación';
  }

  function scoreClass(score) {
    if (score == null || score === '') return 'score-muted';
    const n = Number(score);
    if (!Number.isFinite(n)) return 'score-muted';
    if (n < 3) return 'score-danger';
    if (n < 3.8) return 'score-warning';
    return 'score-good';
  }

  function porcentajeDesdeScore(score) {
    if (score == null || score === '') return 0;
    const n = Number(score);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round((n / 5) * 100)));
  }

  function syncToggleLabels() {
    const empActivo = $('emp-activo');
    const empActivoLabel = $('emp-activo-label');
    if (empActivo && empActivoLabel) {
      empActivoLabel.textContent = empActivo.checked ? 'Activo' : 'Inactivo';
    }

    const itemActivo = $('item-activo');
    const itemActivoLabel = $('item-activo-label');
    if (itemActivo && itemActivoLabel) {
      itemActivoLabel.textContent = itemActivo.checked ? 'Activo' : 'Inactivo';
    }
  }

  function abrirModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    syncToggleLabels();
  }

  function cerrarModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.add('hidden');
  }

  function toast(mensaje, tipo = 'success') {
    const toastEl = $('toast');
    const msgEl = $('toast-msg');
    const iconEl = $('toast-icon');

    if (!toastEl || !msgEl || !iconEl) return;

    const iconos = {
      success: '✓',
      error: '⚠',
      warning: '•',
      info: 'i',
    };

    msgEl.textContent = mensaje;
    iconEl.textContent = iconos[tipo] || '✓';

    toastEl.classList.remove('hidden', 'success', 'error', 'warning', 'info', 'hiding');
    toastEl.classList.add(tipo);

    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }

    state.toastTimer = setTimeout(() => {
      toastEl.classList.add('hiding');

      setTimeout(() => {
        toastEl.classList.add('hidden');
        toastEl.classList.remove('hiding', tipo);
      }, 250);
    }, 2600);
  }

  function renderEmpty(containerId, icono, mensaje, extraClass = '') {
    const el = $(containerId);
    if (!el) return;

    el.innerHTML = `
      <div class="empty-state ${extraClass}">
        <span class="empty-icon">${icono}</span>
        <p>${escapeHtml(mensaje)}</p>
      </div>
    `;
  }

  function inicializarListenersBase() {
    if (state.listenersInicializados) return;
    state.listenersInicializados = true;

    $('emp-activo')?.addEventListener('change', syncToggleLabels);
    $('item-activo')?.addEventListener('change', syncToggleLabels);

    $('eval-periodo')?.addEventListener('change', (e) => {
      const valor = e.target.value;
      if (!valor) return;
      obtenerApp().setPeriodo(valor);

      // Esperar a que el listener de evaluaciones refresque y luego repintar.
      setTimeout(() => {
        actualizarEstadoEval();
        cargarFormularioEval();
      }, 50);
    });

    $('eval-empleado')?.addEventListener('change', () => {
      actualizarEstadoEval();
      cargarFormularioEval();
    });
  }

  // ── Dashboard ────────────────────────────────────────────
  function renderDashboard() {
    const app = obtenerApp();
    const periodo = app.getPeriodoActivo();
    const stats = app.calcularEstadisticas(periodo);
    const periodoLabel = app.getPeriodoLabel(periodo);
    const mesRegistro = app.getMesRegistroLabel?.() || 'este mes';

    setText('stat-total', String(stats.totalActivos || 0));
    setText('stat-evaluados', String(stats.evaluadosActivos ?? stats.evaluados ?? 0));
    setText('stat-cobertura', `${stats.cobertura || 0}%`);
    setText('stat-promedio', stats.promedioGeneral != null ? formatoNumero(stats.promedioGeneral) : '—');
    setText('stat-bajos', String(stats.bajos?.length || 0));
    setText('stat-historicas', String(stats.historicasTotal || 0));
    setText('badge-periodo', periodoLabel);
    setText('hero-periodo', periodoLabel);
    setText('period-context', `Registro en ${mesRegistro}: estás evaluando el desempeño de ${periodoLabel}.`);
    setText('badge-alertas', String(stats.bajos?.length || 0));
    setText('badge-pendientes', String(stats.pendientesUsuario?.length ?? stats.pendientes?.length ?? 0));
    setText('badge-acumulado', `${stats.acumuladoPorMiembro?.length || 0} miembros`);
    setText('badge-mis-evaluaciones', String(stats.historicoUsuario?.length || 0));

    const acumuladoList = $('acumulado-list');
    if (acumuladoList) {
      if (!stats.acumuladoPorMiembro?.length) {
        acumuladoList.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">&#128202;</span>
            <p>No hay evaluaciones históricas todavía.</p>
          </div>
        `;
      } else {
        const criterioOrden = $('orden-acumulado')?.value || 'puntos-desc';
        const ascendente = criterioOrden.endsWith('-asc');
        const campoOrden = criterioOrden.startsWith('calificacion')
          ? 'promedioHistorico'
          : 'totalPuntos';
        acumuladoList.innerHTML = [...stats.acumuladoPorMiembro]
          .sort((a, b) => {
            const diferencia = (Number(a[campoOrden]) || 0) - (Number(b[campoOrden]) || 0);
            return ascendente ? diferencia : -diferencia;
          })
          .map((emp, index) => `
            <button class="acumulado-row" type="button" onclick="ui.verHistorialEmpleado('${escapeHtml(emp.id)}')">
              <div class="rank-position">#${index + 1}</div>
              <div class="emp-avatar">${escapeHtml(getInicial(emp.nombre))}</div>
              <div class="acumulado-main">
                <div class="rank-name">${escapeHtml(emp.nombre || 'Sin nombre')}</div>
                <div class="rank-role">${escapeHtml(emp.rol || 'Sin rol')} · ${escapeHtml(String(emp.evaluaciones || 0))} eval.</div>
                <div class="mini-progress"><span style="width:${porcentajeDesdeScore(emp.promedioHistorico)}%"></span></div>
              </div>
              <div class="acumulado-metrics">
                <strong>${escapeHtml(formatoPuntos(emp.totalPuntos))}</strong>
                <span>pts</span>
              </div>
              <div class="acumulado-score ${scoreClass(emp.promedioHistorico)}">
                ${escapeHtml(formatoNumero(emp.promedioHistorico))}
              </div>
              <div class="trend-pill ${trendClass(emp.tendencia)}">${escapeHtml(trendLabel(emp.tendencia))}</div>
            </button>
          `)
          .join('');
      }
    }

    const rankingList = $('ranking-list');
    if (rankingList) {
      if (!stats.ranking?.length) {
        rankingList.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">&#127925;</span>
            <p>No hay evaluaciones para este período.</p>
          </div>
        `;
      } else {
        const criterioOrden = $('orden-ranking')?.value || 'calificacion-desc';
        const ascendente = criterioOrden.endsWith('-asc');
        const campoOrden = criterioOrden.startsWith('puntos')
          ? 'totalPuntosPeriodo'
          : 'promedio';
        rankingList.innerHTML = [...stats.ranking]
          .sort((a, b) => {
            const diferencia = (Number(a[campoOrden]) || 0) - (Number(b[campoOrden]) || 0);
            return ascendente ? diferencia : -diferencia;
          })
          .map((emp, index) => `
            <div class="ranking-item">
              <div class="rank-left">
                <div class="rank-position ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}">#${index + 1}</div>
                <div class="emp-avatar">${escapeHtml(getInicial(emp.nombre))}</div>
                <div class="rank-info">
                  <div class="rank-name">${escapeHtml(emp.nombre || 'Sin nombre')}</div>
                  <div class="rank-role">${escapeHtml(emp.rol || 'Sin rol')} · ${escapeHtml(formatoPuntos(emp.totalPuntosPeriodo))} pts · ${escapeHtml(String(emp.evaluadores || 1))} eval.</div>
                </div>
              </div>
              <div class="rank-score score-badge ${scoreClass(emp.promedio)}">${escapeHtml(formatoNumero(emp.promedio))}</div>
            </div>
          `)
          .join('');
      }
    }

    const filtroEvaluador = $('filtro-evaluador-dashboard');
    const evaluacionesEvaluadorList = $('evaluaciones-evaluador-list');
    if (filtroEvaluador && evaluacionesEvaluadorList) {
      const valorActual = filtroEvaluador.value;
      filtroEvaluador.innerHTML = `
        <option value="">Todos · acumulado</option>
        ${(stats.evaluadoresResumen || []).map((item) =>
          `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nombre)} · ${item.evaluaciones} eval.</option>`
        ).join('')}
      `;
      filtroEvaluador.value = [...filtroEvaluador.options].some((option) => option.value === valorActual) ? valorActual : '';

      const detalle = (stats.evaluacionesPeriodoDetalle || [])
        .filter((ev) => !filtroEvaluador.value || ev.evaluatorKey === filtroEvaluador.value);
      evaluacionesEvaluadorList.innerHTML = detalle.length
        ? detalle.map((ev) => `
            <button class="acumulado-row" type="button" onclick="ui.verHistorialEmpleado('${escapeHtml(ev.empleadoId)}')">
              <div class="emp-avatar">${escapeHtml(getInicial(ev.empleadoNombre))}</div>
              <div class="acumulado-main">
                <div class="rank-name">${escapeHtml(ev.empleadoNombre)}</div>
                <div class="rank-role">Evaluó: ${escapeHtml(ev.evaluatorLabel)} · ${escapeHtml(ev.empleadoRol)}</div>
              </div>
              <div class="acumulado-metrics"><strong>${escapeHtml(formatoPuntos(ev.puntos))}</strong><span>pts</span></div>
              <div class="acumulado-score ${scoreClass(ev.promedio)}">${escapeHtml(formatoNumero(ev.promedio))}</div>
            </button>
          `).join('')
        : '<div class="empty-state"><p>No hay evaluaciones para este filtro.</p></div>';
    }

    const pendientesList = $('pendientes-list');
    if (pendientesList) {
      const pendientesUsuario = stats.pendientesUsuario || stats.pendientes || [];
      if (!pendientesUsuario.length) {
        pendientesList.innerHTML = `
          <div class="empty-state compact-empty">
            <span class="empty-icon">&#10003;</span>
            <p>Ya calificaste a todo el equipo activo en este período.</p>
          </div>
        `;
      } else {
        pendientesList.innerHTML = pendientesUsuario
          .slice(0, 8)
          .map((emp) => `
            <div class="pendiente-row">
              <div class="emp-avatar small">${escapeHtml(getInicial(emp.nombre))}</div>
              <div class="rank-info">
                <div class="rank-name">${escapeHtml(emp.nombre || 'Sin nombre')}</div>
                <div class="rank-role">${escapeHtml(emp.rol || 'Sin rol')} · pendiente para ti</div>
              </div>
              <button class="btn-ghost" type="button" onclick="ui.irAEvaluacion('${escapeHtml(emp.id)}')">Evaluar</button>
            </div>
          `)
          .join('');
      }
    }

    const alertasList = $('alertas-list');
    if (alertasList) {
      if (!stats.bajos?.length) {
        alertasList.innerHTML = `
          <div class="empty-state compact-empty">
            <span class="empty-icon">&#10003;</span>
            <p>Todo el equipo está en buen nivel.</p>
          </div>
        `;
      } else {
        alertasList.innerHTML = stats.bajos
          .map((ev) => {
            const emp = getEmpleadoPorId(ev.empleadoId);
            const nombre = emp?.nombre || ev.empleadoNombre || 'Sin nombre';
            const rol = emp?.rol || ev.empleadoRol || 'Sin rol';

            return `
              <div class="alerta-item">
                <div class="alerta-avatar">${escapeHtml(getInicial(nombre))}</div>
                <div class="alerta-info">
                  <div class="alerta-name">${escapeHtml(nombre)}</div>
                  <div class="rank-role">${escapeHtml(rol)}</div>
                </div>
                <button class="alerta-score score-badge score-danger" type="button" onclick="ui.irAEvaluacion('${escapeHtml(ev.empleadoId)}')">${escapeHtml(formatoNumero(ev.promedio))}</button>
              </div>
            `;
          })
          .join('');
      }
    }

    const misEvaluacionesList = $('mis-evaluaciones-list');
    if (misEvaluacionesList) {
      const historicoUsuario = stats.historicoUsuario || [];

      if (!historicoUsuario.length) {
        misEvaluacionesList.innerHTML = `
          <div class="empty-state compact-empty">
            <span class="empty-icon">&#128221;</span>
            <p>Aún no has guardado evaluaciones.</p>
          </div>
        `;
      } else {
        misEvaluacionesList.innerHTML = historicoUsuario
          .slice(0, 8)
          .map((ev) => {
            const emp = getEmpleadoPorId(ev.empleadoId);
            const nombre = emp?.nombre || ev.empleadoNombre || 'Sin nombre';
            const rol = emp?.rol || ev.empleadoRol || 'Sin rol';

            return `
              <div class="pendiente-row">
                <div class="emp-avatar small">${escapeHtml(getInicial(nombre))}</div>
                <div class="rank-info">
                  <div class="rank-name">${escapeHtml(nombre)}</div>
                  <div class="rank-role">${escapeHtml(app.getPeriodoLabel(ev.periodo || ''))} · ${escapeHtml(rol)}</div>
                </div>
                <button class="alerta-score score-badge ${scoreClass(ev.promedio)}" type="button" onclick="ui.irAEvaluacion('${escapeHtml(ev.empleadoId)}', '${escapeHtml(ev.periodo || '')}')">${escapeHtml(formatoNumero(ev.promedio))}</button>
              </div>
            `;
          })
          .join('');
      }
    }

    const tendenciaList = $('tendencia-list');
    if (tendenciaList) {
      if (!stats.tendenciaMensual?.length) {
        tendenciaList.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">&#128200;</span>
            <p>Cuando haya varios períodos evaluados, aquí aparece la evolución.</p>
          </div>
        `;
      } else {
        tendenciaList.innerHTML = `
          <div class="trend-grid">
            ${stats.tendenciaMensual.map((item) => `
              <div class="trend-row">
                <div class="trend-period">${escapeHtml(app.getPeriodoLabel(item.periodo))}</div>
                <div class="trend-bar"><span style="width:${item.porcentaje || 0}%"></span></div>
                <div class="trend-score ${scoreClass(item.promedio)}">${escapeHtml(formatoNumero(item.promedio))}</div>
                <div class="trend-count">${escapeHtml(String(item.evaluaciones || 0))} eval.</div>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    const itemsBajosList = $('items-bajos-list');
    if (itemsBajosList) {
      if (!stats.itemsMasbajos?.length) {
        itemsBajosList.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">&#128202;</span>
            <p>Sin datos suficientes aún.</p>
          </div>
        `;
      } else {
        itemsBajosList.innerHTML = stats.itemsMasbajos
          .map((item) => `
            <div class="item-analytics-row">
              <div class="item-config-body">
                <div class="item-config-nombre">${escapeHtml(item.nombre || 'Ítem')}</div>
                <div class="item-config-desc">${escapeHtml(item.descripcion || 'Promedio del equipo en este criterio')} · ${escapeHtml(String(item.evaluaciones || 0))} evaluaciones</div>
              </div>
              <div class="item-lowbar"><span style="width:${item.porcentaje || 0}%"></span></div>
              <div class="item-config-meta">
                <strong class="score-badge ${scoreClass(item.promedio)}">${escapeHtml(formatoNumero(item.promedio))}</strong>
              </div>
            </div>
          `)
          .join('');
      }
    }
  }

  // ── Equipo / Empleados ───────────────────────────────────
  function poblarFiltroRoles() {
    const select = $('filter-rol');
    if (!select) return;

    const valorActual = select.value;
    const roles = [...new Set(
      obtenerApp()
        .getEmpleados()
        .map((e) => e.rol)
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    select.innerHTML = `
      <option value="">Todos los roles</option>
      ${roles.map((rol) => `<option value="${escapeHtml(rol)}">${escapeHtml(rol)}</option>`).join('')}
    `;

    if (roles.includes(valorActual)) {
      select.value = valorActual;
    }
  }

  function obtenerEmpleadosFiltrados() {
    const empleados = [...obtenerApp().getEmpleados()];

    const query = String($('search-empleados')?.value || '')
      .trim()
      .toLowerCase();

    const rol = $('filter-rol')?.value || '';
    const estado = $('filter-estado')?.value || '';

    return empleados
      .filter((emp) => {
        const nombre = String(emp.nombre || '').toLowerCase();
        if (query && !nombre.includes(query)) return false;
        if (rol && emp.rol !== rol) return false;

        if (estado === 'activo' && emp.activo === false) return false;
        if (estado === 'inactivo' && emp.activo !== false) return false;

        return true;
      })
      .sort((a, b) =>
        String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {
          sensitivity: 'base',
          numeric: true,
        })
      );
  }

  function renderEmpleados() {
    poblarFiltroRoles();

    const grid = $('empleados-grid');
    if (!grid) return;

    const app = obtenerApp();
    const periodo = app.getPeriodoActivo();
    const stats = app.calcularEstadisticas(periodo);
    const acumuladoMap = new Map((stats.acumuladoPorMiembro || []).map((emp) => [emp.id, emp]));
    const empleados = obtenerEmpleadosFiltrados();

    if (!empleados.length) {
      grid.innerHTML = `
        <div class="empty-state full-width">
          <span class="empty-icon">&#128100;</span>
          <p>No se encontraron miembros con esos filtros.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = empleados
      .map((emp) => {
        const evaluacion = app.getEvaluacion(emp.id, periodo);
        const promedio = evaluacion?.promedio ?? null;
        const historico = acumuladoMap.get(emp.id);
        const scoreHtml = promedio != null
          ? `
              <div class="emp-score ${scoreClass(promedio)}">
                <span class="emp-score-num">${escapeHtml(formatoNumero(promedio))}</span>
                <span class="emp-score-label">este período</span>
              </div>
            `
          : `
              <div class="emp-score score-muted">
                <span class="emp-score-num">—</span>
                <span class="emp-score-label">sin evaluar</span>
              </div>
            `;

        const histHtml = historico
          ? `
              <div class="emp-history-strip">
                <span><strong>${escapeHtml(formatoPuntos(historico.totalPuntos))}</strong> pts</span>
                <span><strong>${escapeHtml(formatoNumero(historico.promedioHistorico))}</strong> hist.</span>
                <span class="trend-pill ${trendClass(historico.tendencia)}">${escapeHtml(trendLabel(historico.tendencia))}</span>
              </div>
            `
          : `
              <div class="emp-history-strip muted">
                <span>Sin histórico todavía</span>
              </div>
            `;

        return `
          <article class="emp-card ${emp.activo === false ? 'inactivo' : ''}">
            <div class="emp-card-top">
              <div class="emp-avatar">${escapeHtml(getInicial(emp.nombre))}</div>
              <div class="emp-card-info">
                <div class="emp-card-nombre">${escapeHtml(emp.nombre || 'Sin nombre')}</div>
                <div class="emp-card-email">${escapeHtml(emp.email || 'Sin correo registrado')}</div>
              </div>
            </div>

            <div class="emp-card-mid">
              <span class="rol-badge">${escapeHtml(emp.rol || 'Sin rol')}</span>
              ${scoreHtml}
            </div>

            ${histHtml}

            <div class="emp-card-actions">
              <button class="btn-secondary" onclick="ui.irAEvaluacion('${escapeHtml(emp.id)}')">Evaluar</button>
              <button class="btn-ghost" onclick="ui.abrirModalEmpleado('${escapeHtml(emp.id)}')">Editar</button>
              <button class="btn-ghost" onclick="ui.verHistorialEmpleado('${escapeHtml(emp.id)}')">Historial</button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function filtrarEmpleados() {
    renderEmpleados();
  }

  function limpiarFormularioEmpleado() {
    if ($('empleado-id')) $('empleado-id').value = '';
    if ($('emp-nombre')) $('emp-nombre').value = '';
    if ($('emp-rol')) $('emp-rol').value = '';
    if ($('emp-email')) $('emp-email').value = '';
    if ($('emp-telefono')) $('emp-telefono').value = '';
    if ($('emp-activo')) $('emp-activo').checked = true;
    if ($('emp-notas')) $('emp-notas').value = '';
    syncToggleLabels();
  }

  function abrirModalEmpleado(empleadoId = '') {
    const titulo = $('modal-empleado-titulo');

    if (!empleadoId) {
      limpiarFormularioEmpleado();
      if (titulo) titulo.textContent = 'Agregar miembro';
      abrirModal('modal-empleado');
      $('emp-nombre')?.focus();
      return;
    }

    const emp = getEmpleadoPorId(empleadoId);
    if (!emp) {
      toast('No se encontró el miembro seleccionado.', 'error');
      return;
    }

    if ($('empleado-id')) $('empleado-id').value = emp.id || '';
    if ($('emp-nombre')) $('emp-nombre').value = emp.nombre || '';
    if ($('emp-rol')) $('emp-rol').value = emp.rol || '';
    if ($('emp-email')) $('emp-email').value = emp.email || '';
    if ($('emp-telefono')) $('emp-telefono').value = emp.telefono || '';
    if ($('emp-activo')) $('emp-activo').checked = emp.activo !== false;
    if ($('emp-notas')) $('emp-notas').value = emp.notas || '';

    if (titulo) titulo.textContent = 'Editar miembro';
    syncToggleLabels();
    abrirModal('modal-empleado');
    $('emp-nombre')?.focus();
  }

  // ── Configuración / Ítems ────────────────────────────────
  function filtrarItemsPorRol(rol = 'todos') {
    state.filtroItemsRol = rol;
    renderConfig();
  }

  function limpiarFormularioItem() {
    if ($('item-id')) $('item-id').value = '';
    if ($('item-nombre')) $('item-nombre').value = '';
    if ($('item-descripcion')) $('item-descripcion').value = '';
    if ($('item-rol')) $('item-rol').value = 'Universal';
    if ($('item-activo')) $('item-activo').checked = true;
    if ($('item-pares')) $('item-pares').checked = true;
    syncToggleLabels();
  }

  function abrirModalItem(itemId = '') {
    const titulo = $('modal-item-titulo');

    if (!itemId) {
      limpiarFormularioItem();
      if (titulo) titulo.textContent = 'Nuevo ítem de calificación';
      abrirModal('modal-item');
      $('item-nombre')?.focus();
      return;
    }

    const item = getItemPorId(itemId);
    if (!item) {
      toast('No se encontró el ítem seleccionado.', 'error');
      return;
    }

    if ($('item-id')) $('item-id').value = item.id || '';
    if ($('item-nombre')) $('item-nombre').value = item.nombre || '';
    if ($('item-descripcion')) $('item-descripcion').value = item.descripcion || '';
    if ($('item-rol')) $('item-rol').value = item.rol || 'Universal';
    if ($('item-activo')) $('item-activo').checked = item.activo !== false;
    if ($('item-pares')) $('item-pares').checked = item.evaluablePorPares !== false;

    if (titulo) titulo.textContent = 'Editar ítem de calificación';
    syncToggleLabels();
    abrirModal('modal-item');
    $('item-nombre')?.focus();
  }

  async function toggleItemPares(itemId, habilitado) {
    const ok = await obtenerDb().setItemEvaluablePorPares(itemId, habilitado);
    if (ok) {
      toast(habilitado
        ? 'Ítem habilitado para evaluación por pares.'
        : 'Ítem oculto para los pares.');
    }
  }

  function renderConfig() {
    const items = [...obtenerApp().getItems()];
    const empleados = [...obtenerApp().getEmpleados()];

    document.querySelectorAll('.chip').forEach((chip) => {
      chip.classList.toggle('chip-active', chip.dataset.rol === state.filtroItemsRol);
    });

    const lista = $('items-config-list');
    if (lista) {
      const filtrados = items
        .filter((item) => {
          if (state.filtroItemsRol === 'todos') return true;
          return item.rol === state.filtroItemsRol;
        })
        .sort((a, b) =>
          String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {
            sensitivity: 'base',
            numeric: true,
          })
        );

      if (!filtrados.length) {
        lista.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">&#9881;</span>
            <p>No hay ítems configurados para ese filtro.</p>
          </div>
        `;
      } else {
        lista.innerHTML = filtrados
          .map((item) => `
            <div class="item-config-row">
              <div class="item-config-drag">⋮⋮</div>
              <div class="item-config-body">
                <div class="item-config-nombre">${escapeHtml(item.nombre || 'Ítem')}</div>
                <div class="item-config-desc">${escapeHtml(item.descripcion || 'Sin descripción')}</div>
              </div>
              <div class="item-config-meta">
                <span class="rol-badge">${escapeHtml(item.rol || 'Universal')}</span>
                <span class="rol-badge">${item.activo === false ? 'Inactivo' : 'Activo'}</span>
                <label class="pares-toggle" title="¿Los pares pueden evaluar este ítem en modo confidencial?">
                  <input type="checkbox" ${item.evaluablePorPares === false ? '' : 'checked'}
                    onchange="ui.toggleItemPares('${escapeHtml(item.id)}', this.checked)">
                  <span>Pares</span>
                </label>
                <button class="btn-icon" title="Editar ítem" onclick="ui.abrirModalItem('${escapeHtml(item.id)}')">&#9998;</button>
              </div>
            </div>
          `)
          .join('');
      }
    }

    const rolesList = $('roles-list');
    if (rolesList) {
      const roles = [...new Set(
        empleados.map((e) => e.rol).filter(Boolean)
      )].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      if (!roles.length) {
        rolesList.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">&#128188;</span>
            <p>No hay roles aún.</p>
          </div>
        `;
      } else {
        rolesList.innerHTML = roles
          .map((rol) => {
            const total = empleados.filter((e) => e.rol === rol).length;
            const activos = empleados.filter((e) => e.rol === rol && e.activo !== false).length;

            return `
              <div class="role-row">
                <div>
                  <strong>${escapeHtml(rol)}</strong>
                  <div class="item-config-desc">${activos} activos de ${total}</div>
                </div>
                <span class="rol-badge">${total}</span>
              </div>
            `;
          })
          .join('');
      }
    }
  }

  // ── Evaluación ────────────────────────────────────────────
  function asegurarHomeFormularioEval() {
    const form = $('eval-form-container');
    const main = document.querySelector('#view-evaluacion .eval-main');

    if (!form || !main) return null;

    if (!state.evalFormHome) {
      state.evalFormHome = { parent: main };
    }

    return state.evalFormHome;
  }

  function restaurarFormularioEval() {
    const form = $('eval-form-container');
    const placeholder = $('eval-placeholder');
    const home = asegurarHomeFormularioEval();

    if (!form || !home?.parent) return;

    if (form.parentElement !== home.parent) {
      home.parent.appendChild(form);
    }

    placeholder?.classList.remove('hidden');
    form.classList.add('hidden');
    form.classList.remove('confidential-form-container');
  }

  function moverFormularioAConfidencial() {
    const form = $('eval-form-container');
    const mount = $('confidential-form-mount');

    asegurarHomeFormularioEval();

    if (!form || !mount) return;
    if (form.parentElement !== mount) {
      mount.appendChild(form);
    }

    form.classList.add('confidential-form-container');
  }

  function getPendientesConfidenciales() {
    const app = obtenerApp();
    const periodo = app.getPeriodoActivo();
    const evaluadorId = $('conf-evaluador')?.value || '';
    const evaluados = new Set(Object.values(app.getEvaluaciones?.() || {})
      .filter((ev) => ev?.periodo === periodo && String(ev.evaluatorId || '') === evaluadorId)
      .map((ev) => ev.empleadoId));
    const pendientes = app.getEmpleados().filter((emp) => !evaluados.has(emp.id));

    return pendientes.filter((emp) => emp?.activo !== false && emp.id !== evaluadorId);
  }

  function actualizarSelectEvaluadorConfidencial() {
    const select = $('conf-evaluador');
    if (!select) return;

    const valorActual = select.value || '';
    const empleados = [...obtenerApp().getEmpleados()]
      .filter((e) => e.activo !== false)
      .sort((a, b) =>
        String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {
          sensitivity: 'base',
          numeric: true,
        })
      );

    select.innerHTML = `
      <option value="">Seleccionar miembro...</option>
      ${empleados
        .map((emp) => `<option value="${escapeHtml(emp.id)}">${escapeHtml(emp.nombre || 'Sin nombre')} · ${escapeHtml(emp.rol || 'Sin rol')}</option>`)
        .join('')}
    `;

    if (empleados.some((emp) => emp.id === valorActual)) {
      select.value = valorActual;
    }
  }

  function pintarResumenConfidencial() {
    const app = obtenerApp();
    const periodo = app.getPeriodoActivo();
    const periodoLabel = app.getPeriodoLabel(periodo);
    const mesRegistro = app.getMesRegistroLabel?.() || 'este mes';
    const pendientes = getPendientesConfidenciales();
    const btn = $('btn-conf-ruleta');

    setText('conf-periodo-badge', periodoLabel);
    setText('conf-period-context', `Registro en ${mesRegistro}: la ruleta asigna evaluaciones sobre ${periodoLabel}.`);
    setText('conf-pendientes-count', String(pendientes.length));

    if (btn) {
      btn.disabled = !pendientes.length;
      btn.textContent = pendientes.length ? 'Activar ruleta' : 'Sin pendientes para este evaluador';
    }
  }

  function setConfidentialAssigned(emp = null) {
    const card = $('conf-roulette-card');

    if (!emp) {
      state.confidentialEmpleadoId = '';
      setText('conf-avatar', '?');
      setText('conf-nombre', 'Sin asignar');
      setText('conf-rol', 'Activa la ruleta');
      card?.classList.remove('roulette-active');
      return;
    }

    state.confidentialEmpleadoId = emp.id;
    setText('conf-avatar', getInicial(emp.nombre));
    setText('conf-nombre', emp.nombre || 'Sin nombre');
    setText('conf-rol', emp.rol || 'Sin rol');
    card?.classList.remove('roulette-spinning');
    card?.classList.add('roulette-active', 'roulette-revealed');

    setTimeout(() => {
      card?.classList.remove('roulette-revealed');
    }, 900);
  }

  function pintarOpcionRuleta(emp) {
    if (!emp) return;

    setText('conf-avatar', getInicial(emp.nombre));
    setText('conf-nombre', emp.nombre || 'Sin nombre');
    setText('conf-rol', emp.rol || 'Sin rol');
  }

  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function animarRuletaConfidencial(candidatos, elegido) {
    const card = $('conf-roulette-card');
    const btn = $('btn-conf-ruleta');

    if (!card || !candidatos.length) return;

    if (state.rouletteSpinTimer) {
      clearInterval(state.rouletteSpinTimer);
      state.rouletteSpinTimer = null;
    }

    card.classList.remove('roulette-active', 'roulette-revealed');
    card.classList.add('roulette-spinning');
    setText('conf-rol', 'Girando...');

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Girando...';
    }

    let index = Math.floor(Math.random() * candidatos.length);
    pintarOpcionRuleta(candidatos[index]);

    state.rouletteSpinTimer = setInterval(() => {
      index = (index + 1 + Math.floor(Math.random() * Math.max(1, candidatos.length))) % candidatos.length;
      pintarOpcionRuleta(candidatos[index]);
    }, 95);

    await esperar(1600);

    clearInterval(state.rouletteSpinTimer);
    state.rouletteSpinTimer = null;
    pintarOpcionRuleta(elegido);

    await esperar(260);

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Activar ruleta';
    }
  }

  function limpiarModoConfidencial({ silent = false } = {}) {
    setConfidentialAssigned(null);
    const card = $('conf-roulette-card');

    if (state.rouletteSpinTimer) {
      clearInterval(state.rouletteSpinTimer);
      state.rouletteSpinTimer = null;
    }

    card?.classList.remove('roulette-spinning', 'roulette-revealed');

    const select = $('eval-empleado');
    if (select) select.value = '';

    if ($('eval-observaciones')) $('eval-observaciones').value = '';
    if ($('eval-items-container')) $('eval-items-container').innerHTML = '';

    $('conf-placeholder')?.classList.remove('hidden');
    $('conf-form-shell')?.classList.add('hidden');
    $('eval-form-container')?.classList.add('hidden');

    actualizarPromedioLive();
    pintarResumenConfidencial();

    if (!silent) toast('Pantalla confidencial limpia.');
  }

  function prepararModoConfidencial() {
    inicializarListenersBase();
    actualizarSelectEvaluacion();
    actualizarSelectEvaluadorConfidencial();
    moverFormularioAConfidencial();
    pintarResumenConfidencial();

    if (state.confidentialEmpleadoId && getEmpleadoPorId(state.confidentialEmpleadoId)) {
      const select = $('eval-empleado');
      if (select) select.value = state.confidentialEmpleadoId;
      $('conf-placeholder')?.classList.add('hidden');
      $('conf-form-shell')?.classList.remove('hidden');
      cargarFormularioEval();
      return;
    }

    limpiarModoConfidencial({ silent: true });
  }

  function refrescarModoConfidencial() {
    pintarResumenConfidencial();

    if (!state.confidentialEmpleadoId) return;

    const siguePendiente = getPendientesConfidenciales().some((emp) => emp.id === state.confidentialEmpleadoId);
    if (!siguePendiente) {
      limpiarModoConfidencial({ silent: true });
    }
  }

  async function activarRuletaConfidencial() {
    if (!$('conf-evaluador')?.value) {
      toast('Selecciona primero quien esta evaluando.', 'error');
      return;
    }

    const pendientes = getPendientesConfidenciales();

    if (!pendientes.length) {
      limpiarModoConfidencial({ silent: true });
      toast('Este evaluador ya califico a todos los miembros activos en este periodo.', 'info');
      return;
    }

    const elegido = pendientes[Math.floor(Math.random() * pendientes.length)];
    const select = $('eval-empleado');

    moverFormularioAConfidencial();
    await animarRuletaConfidencial(pendientes, elegido);
    setConfidentialAssigned(elegido);

    if (select) select.value = elegido.id;

    $('conf-placeholder')?.classList.add('hidden');
    $('conf-form-shell')?.classList.remove('hidden');

    cargarFormularioEval();
    toast(`Asignado: ${elegido.nombre || 'miembro del equipo'}.`);
  }

  async function activarModoConfidencialSeguro() {
    state.confidentialKioskActive = true;
    document.body.classList.add('confidential-kiosk');
    $('btn-conf-activar-modo')?.classList.add('hidden');
    $('btn-conf-salir-modo')?.classList.remove('hidden');

    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.warn('No se pudo activar pantalla completa:', error);
      toast('Modo confidencial activo. Si el navegador no permite pantalla completa, usa F11.', 'info');
      return;
    }

    toast('Modo confidencial activo.');
  }

  async function salirModoConfidencialSeguro() {
    const clave = window.prompt('Clave para salir del modo confidencial');

    if (clave !== '1320') {
      toast('Clave incorrecta.', 'error');
      return;
    }

    state.confidentialKioskActive = false;
    document.body.classList.remove('confidential-kiosk');
    $('btn-conf-activar-modo')?.classList.remove('hidden');
    $('btn-conf-salir-modo')?.classList.add('hidden');

    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.warn('No se pudo salir de pantalla completa:', error);
    }

    limpiarModoConfidencial({ silent: true });
    toast('Modo confidencial cerrado.');
  }

  function onEvaluacionGuardada() {
    if (obtenerApp().getState?.().currentView !== 'confidencial') return;
    limpiarModoConfidencial({ silent: true });
    toast('Evaluacion guardada. Pantalla limpia para la siguiente persona.');
  }

  function prepararVistaEvaluacion() {
    inicializarListenersBase();
    restaurarFormularioEval();
    actualizarSelectEvaluacion();
    actualizarEstadoEval();
    cargarFormularioEval();
  }

  function actualizarSelectEvaluacion() {
    const select = $('eval-empleado');
    if (!select) return;

    const valorActual = select.value || '';
    const empleados = [...obtenerApp().getEmpleados()]
      .filter((e) => e.activo !== false)
      .sort((a, b) =>
        String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {
          sensitivity: 'base',
          numeric: true,
        })
      );

    select.innerHTML = `
      <option value="">Seleccionar...</option>
      ${empleados
        .map((emp) => `<option value="${escapeHtml(emp.id)}">${escapeHtml(emp.nombre || 'Sin nombre')} · ${escapeHtml(emp.rol || 'Sin rol')}</option>`)
        .join('')}
    `;

    if (empleados.some((e) => e.id === valorActual)) {
      select.value = valorActual;
    }

    const periodoSel = $('eval-periodo');
    if (periodoSel && obtenerApp().getPeriodoActivo()) {
      periodoSel.value = obtenerApp().getPeriodoActivo();
    }
  }

  function actualizarEstadoEval() {
    const empleadoId = $('eval-empleado')?.value || '';
    const periodo = $('eval-periodo')?.value || obtenerApp().getPeriodoActivo();
    const periodoLabel = obtenerApp().getPeriodoLabel(periodo);
    const mesRegistro = obtenerApp().getMesRegistroLabel?.() || 'este mes';

    const card = $('eval-empleado-card');
    const estado = $('eval-estado');
    const btnGuardar = $('btn-guardar-eval');
    setText('eval-periodo-hint', `Registro en ${mesRegistro}. Este formulario corresponde al desempeño de ${periodoLabel}.`);

    if (!empleadoId) {
      card?.classList.add('hidden');
      estado?.classList.add('hidden');
      if (btnGuardar) btnGuardar.textContent = 'Guardar evaluación';
      return;
    }

    const empleado = getEmpleadoPorId(empleadoId);
    if (!empleado) {
      card?.classList.add('hidden');
      estado?.classList.add('hidden');
      return;
    }

    setText('eval-emp-avatar', getInicial(empleado.nombre));
    setText('eval-emp-nombre', empleado.nombre || 'Sin nombre');
    setText('eval-emp-rol', empleado.rol || 'Sin rol');
    card?.classList.remove('hidden');

    const evaluacion = obtenerApp().getEvaluacion(empleadoId, periodo);
    const iconEl = $('eval-estado-icon');
    const textoEl = $('eval-estado-texto');

    if (estado) {
      estado.classList.remove('hidden', 'evaluado', 'pendiente');

      if (evaluacion) {
        estado.classList.add('evaluado');
        if (iconEl) iconEl.innerHTML = '&#10003;';
        if (textoEl) {
          textoEl.textContent = `Ya evaluado${evaluacion.promedio != null ? ` · Promedio ${evaluacion.promedio}` : ''}`;
        }
        if (btnGuardar) btnGuardar.textContent = 'Actualizar evaluación';
      } else {
        estado.classList.add('pendiente');
        if (iconEl) iconEl.innerHTML = '&#11088;';
        if (textoEl) textoEl.textContent = 'Sin evaluar en este período';
        if (btnGuardar) btnGuardar.textContent = 'Guardar evaluación';
      }
    }
  }

  function crearHTMLItemEvaluacion(item) {
    return `
      <div class="eval-item" data-id="${escapeHtml(item.id)}">
        <div class="eval-item-info">
          <div class="eval-item-nombre">${escapeHtml(item.nombre || 'Ítem')}</div>
          <div class="eval-item-desc">${escapeHtml(item.descripcion || 'Sin descripción')}</div>
        </div>

        <div class="star-rating" data-item="${escapeHtml(item.id)}" data-value="">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
        </div>

        <div class="eval-item-val">
          <span class="val-num" id="val-${escapeHtml(item.id)}">—</span>
        </div>
      </div>
    `;
  }

  function setValorStars(itemId, valor) {
    const box = document.querySelector(`.star-rating[data-item="${CSS.escape(itemId)}"]`);
    if (!box) return;

    const stars = box.querySelectorAll('.star');
    const num = toNumber(valor);

    if (num == null || num < 1 || num > 5) {
      delete box.dataset.value;
      stars.forEach((star) => {
        star.classList.remove('active');
      });

      const valNum = $(`val-${itemId}`);
      if (valNum) {
        valNum.textContent = '—';
        valNum.classList.remove('filled');
      }
      return;
    }

    box.dataset.value = String(num);

    stars.forEach((star) => {
      const starVal = Number(star.dataset.value);
      star.classList.toggle('active', starVal <= num);
      star.classList.remove('hovered');
    });

    const valNum = $(`val-${itemId}`);
    if (valNum) {
      valNum.textContent = String(num);
      valNum.classList.add('filled');
    }
  }

  function pintarHover(box, valorHover = null) {
    const stars = box.querySelectorAll('.star');
    stars.forEach((star) => {
      const starVal = Number(star.dataset.value);
      star.classList.toggle('hovered', valorHover != null && starVal <= valorHover);
    });
  }

  function bindStarRatings() {
    document.querySelectorAll('#eval-items-container .star-rating').forEach((box) => {
      const itemId = box.dataset.item || '';
      const stars = box.querySelectorAll('.star');

      stars.forEach((star) => {
        star.addEventListener('mouseenter', () => {
          const valor = Number(star.dataset.value);
          pintarHover(box, valor);
        });

        star.addEventListener('click', () => {
          const valor = Number(star.dataset.value);
          setValorStars(itemId, valor);
          actualizarPromedioLive();
        });
      });

      box.addEventListener('mouseleave', () => {
        pintarHover(box, null);
      });
    });
  }

  function actualizarPromedioLive() {
    const boxes = [...document.querySelectorAll('#eval-items-container .star-rating')];
    const valores = boxes
      .map((box) => toNumber(box.dataset.value))
      .filter((v) => v != null);

    const promedioEl = $('eval-promedio-live');
    const starsWrap = $('eval-prom-stars');

    if (!promedioEl || !starsWrap) return;

    if (!valores.length) {
      promedioEl.textContent = '—';
      starsWrap.querySelectorAll('.star').forEach((star) => {
        star.classList.remove('active');
      });
      return;
    }

    const suma = valores.reduce((acc, v) => acc + v, 0);
    const promedio = Number((suma / valores.length).toFixed(1));
    promedioEl.textContent = String(promedio);

    const estrellasLlenas = Math.round(promedio);
    starsWrap.querySelectorAll('.star').forEach((star, idx) => {
      star.classList.toggle('active', idx < estrellasLlenas);
    });
  }

  function cargarFormularioEval() {
    const app = obtenerApp();
    const empleadoId = $('eval-empleado')?.value || '';
    const periodo = $('eval-periodo')?.value || app.getPeriodoActivo();

    const placeholder = $('eval-placeholder');
    const formContainer = $('eval-form-container');
    const itemsContainer = $('eval-items-container');

    if (!empleadoId) {
      placeholder?.classList.remove('hidden');
      formContainer?.classList.add('hidden');
      if (itemsContainer) itemsContainer.innerHTML = '';
      if ($('eval-observaciones')) $('eval-observaciones').value = '';
      actualizarPromedioLive();
      return;
    }

    const empleado = getEmpleadoPorId(empleadoId);
    if (!empleado) {
      placeholder?.classList.remove('hidden');
      formContainer?.classList.add('hidden');
      return;
    }

    // Modo confidencial (par evaluando): solo los ítems habilitados para pares.
    const evaluadorParActivo = Boolean($('conf-evaluador')?.value);
    const items = evaluadorParActivo
      ? app.getItemsParaRolPares(empleado.rol)
      : app.getItemsParaRol(empleado.rol);

    if (!items.length) {
      placeholder?.classList.remove('hidden');
      formContainer?.classList.add('hidden');
      if (placeholder) {
        placeholder.innerHTML = `
          <span class="placeholder-icon">&#9881;</span>
          <p>No hay ítems activos configurados para el rol ${escapeHtml(empleado.rol || 'seleccionado')}.</p>
        `;
      }
      return;
    }

    placeholder?.classList.add('hidden');
    formContainer?.classList.remove('hidden');

    setText('eval-form-titulo', `Evaluación de ${empleado.nombre || 'miembro del equipo'}`);
    setText('eval-form-periodo', app.getPeriodoLabel(periodo));

    if (itemsContainer) {
      itemsContainer.innerHTML = items.map(crearHTMLItemEvaluacion).join('');
    }

    bindStarRatings();

    // En modo confidencial el par siempre empieza en blanco: nunca se prellena
    // con la evaluación del admin ni con la de nadie más (anonimato).
    const evaluacionExistente = evaluadorParActivo
      ? null
      : app.getEvaluacion(empleadoId, periodo);

    if ($('eval-observaciones')) {
      $('eval-observaciones').value = evaluacionExistente?.observaciones || '';
    }

    items.forEach((item) => {
      const valorGuardado = evaluacionExistente?.calificaciones?.[item.id];
      if (valorGuardado != null) {
        setValorStars(item.id, valorGuardado);
      }
    });

    actualizarEstadoEval();
    actualizarPromedioLive();
  }

  function irAEvaluacion(empleadoId = '', periodo = null) {
    const app = obtenerApp();
    const periodoDestino = periodo || app.getPeriodoActivo();

    if (periodoDestino) {
      app.setPeriodo(periodoDestino);
    }

    app.navigate('evaluacion');

    requestAnimationFrame(() => {
      const periodoSel = $('eval-periodo');
      if (periodoSel && periodoDestino) periodoSel.value = periodoDestino;

      actualizarSelectEvaluacion();

      if (empleadoId && $('eval-empleado')) {
        $('eval-empleado').value = empleadoId;
      }

      actualizarEstadoEval();
      cargarFormularioEval();
    });

    cerrarModal('modal-historial');
  }

  // ── Historial ────────────────────────────────────────────
  async function verHistorialEmpleado(empleadoId) {
    const app = obtenerApp();
    const emp = getEmpleadoPorId(empleadoId);

    if (!emp) {
      toast('No se encontró el miembro seleccionado.', 'error');
      return;
    }

    setText('historial-titulo', `Historial de ${emp.nombre || 'miembro'}`);
    setText('historial-avatar', getInicial(emp.nombre));
    setText('historial-nombre', emp.nombre || 'Sin nombre');
    setText('historial-rol', emp.rol || 'Sin rol');
    setText('historial-prom-global', '—');
    setText('historial-evals', '0');
    setText('historial-puntos', '0');
    setText('historial-mejor', '—');
    setText('historial-tendencia', '—');

    const tbody = $('historial-tbody');
    const itemsResumen = $('historial-items-resumen');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">Cargando historial...</td>
        </tr>
      `;
    }
    if (itemsResumen) itemsResumen.innerHTML = '';

    abrirModal('modal-historial');

    const historial = await app.getHistorialEmpleado(empleadoId);

    if (!tbody) return;

    if (!historial.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">No hay evaluaciones registradas para este miembro.</td>
        </tr>
      `;
      if (itemsResumen) itemsResumen.innerHTML = '';
      return;
    }

    const historialAsc = [...historial]
      .filter((h) => h?.periodo)
      .sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));

    const valores = historial
      .map((h) => Number(h.promedio))
      .filter((v) => Number.isFinite(v));

    const puntosPorEvaluacion = (h) => {
      const valoresItems = Object.values(h.calificaciones || {})
        .map(Number)
        .filter((v) => Number.isFinite(v));
      if (valoresItems.length) return valoresItems.reduce((a, b) => a + b, 0);
      const promedio = Number(h.promedio);
      const totalItems = Number(h.itemsEvaluados ?? h.totalItems);
      if (Number.isFinite(promedio) && Number.isFinite(totalItems)) return promedio * totalItems;
      return Number.isFinite(promedio) ? promedio : 0;
    };

    const totalPuntos = historial.reduce((acc, h) => acc + puntosPorEvaluacion(h), 0);
    const mejor = historial.reduce((best, h) => {
      if (!best) return h;
      return (Number(h.promedio) || 0) > (Number(best.promedio) || 0) ? h : best;
    }, null);

    if (valores.length) {
      const promGlobal = (valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(1);
      setText('historial-prom-global', promGlobal);
    }

    setText('historial-evals', String(historial.length));
    setText('historial-puntos', formatoPuntos(totalPuntos));
    setText('historial-mejor', mejor ? `${formatoNumero(mejor.promedio)} · ${app.getPeriodoLabel(mejor.periodo || '')}` : '—');

    if (historialAsc.length >= 2) {
      const last = Number(historialAsc.at(-1).promedio) || 0;
      const prev = Number(historialAsc.at(-2).promedio) || 0;
      const delta = Number((last - prev).toFixed(1));
      const tendencia = Math.abs(delta) < 0.1
        ? '→ estable'
        : delta > 0
          ? `↑ +${delta}`
          : `↓ ${delta}`;
      setText('historial-tendencia', tendencia);
    } else {
      setText('historial-tendencia', 'Sin comparación');
    }

    tbody.innerHTML = historial
      .map((h) => {
        const puntos = puntosPorEvaluacion(h);
        return `
          <tr>
            <td>${escapeHtml(app.getPeriodoLabel(h.periodo || '—'))}</td>
            <td><strong class="${scoreClass(h.promedio)}">${escapeHtml(formatoNumero(h.promedio))}</strong></td>
            <td>${escapeHtml(h.evaluatorName || h.evaluatorEmail || h.updatedBy || h.createdBy || '—')}</td>
            <td>${escapeHtml(formatoPuntos(puntos))}</td>
            <td>${escapeHtml(String(h.itemsEvaluados ?? h.totalItems ?? 0))}</td>
            <td>${escapeHtml(h.observaciones || '—')}</td>
            <td>
              <button class="btn-ghost" onclick="ui.irAEvaluacion('${escapeHtml(empleadoId)}', '${escapeHtml(h.periodo || '')}')">
                Abrir
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    if (itemsResumen) {
      const itemTotals = {};
      const itemCounts = {};
      historial.forEach((h) => {
        Object.entries(h.calificaciones || {}).forEach(([itemId, valor]) => {
          const num = Number(valor);
          if (!Number.isFinite(num)) return;
          itemTotals[itemId] = (itemTotals[itemId] || 0) + num;
          itemCounts[itemId] = (itemCounts[itemId] || 0) + 1;
        });
      });

      const items = Object.entries(itemTotals)
        .map(([itemId, total]) => {
          const item = getItemPorId(itemId);
          const promedio = total / (itemCounts[itemId] || 1);
          return {
            nombre: item?.nombre || itemId,
            promedio,
            count: itemCounts[itemId] || 0,
            porcentaje: porcentajeDesdeScore(promedio),
          };
        })
        .sort((a, b) => a.promedio - b.promedio);

      if (items.length) {
        itemsResumen.innerHTML = `
          <div class="historial-items-title">Promedio histórico por criterio</div>
          ${items.map((item) => `
            <div class="historial-item-row">
              <span>${escapeHtml(item.nombre)}</span>
              <div class="item-lowbar"><span style="width:${item.porcentaje}%"></span></div>
              <strong class="score-badge ${scoreClass(item.promedio)}">${escapeHtml(formatoNumero(item.promedio))}</strong>
            </div>
          `).join('')}
        `;
      } else {
        itemsResumen.innerHTML = '';
      }
    }
  }

  // ── API pública ──────────────────────────────────────────
  return {
    toast,
    abrirModal,
    cerrarModal,

    renderDashboard,
    renderEmpleados,
    filtrarEmpleados,
    abrirModalEmpleado,

    renderConfig,
    filtrarItemsPorRol,
    abrirModalItem,
    toggleItemPares,

    prepararVistaEvaluacion,
    prepararModoConfidencial,
    refrescarModoConfidencial,
    activarRuletaConfidencial,
    limpiarModoConfidencial,
    activarModoConfidencialSeguro,
    salirModoConfidencialSeguro,
    onEvaluacionGuardada,
    actualizarSelectEvaluacion,
    actualizarEstadoEval,
    cargarFormularioEval,
    actualizarPromedioLive,

    verHistorialEmpleado,
    irAEvaluacion,
  };
})();

export default ui;
