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

    setText('stat-total', String(stats.totalActivos || 0));
    setText('stat-evaluados', String(stats.evaluados || 0));
    setText('stat-promedio', stats.promedioGeneral != null ? String(stats.promedioGeneral) : '—');
    setText('stat-bajos', String(stats.bajos?.length || 0));
    setText('badge-periodo', app.getPeriodoLabel(periodo));
    setText('badge-alertas', String(stats.bajos?.length || 0));

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
        rankingList.innerHTML = stats.ranking
          .map((emp, index) => `
            <div class="ranking-item">
              <div class="rank-left">
                <div class="rank-position">#${index + 1}</div>
                <div class="emp-avatar">${escapeHtml(getInicial(emp.nombre))}</div>
                <div class="rank-info">
                  <div class="rank-name">${escapeHtml(emp.nombre || 'Sin nombre')}</div>
                  <div class="rank-role">${escapeHtml(emp.rol || 'Sin rol')}</div>
                </div>
              </div>
              <div class="rank-score">${escapeHtml(String(emp.promedio ?? '—'))}</div>
            </div>
          `)
          .join('');
      }
    }

    const alertasList = $('alertas-list');
    if (alertasList) {
      if (!stats.bajos?.length) {
        alertasList.innerHTML = `
          <div class="empty-state">
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
                <div class="alerta-score">${escapeHtml(String(ev.promedio ?? '—'))}</div>
              </div>
            `;
          })
          .join('');
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
            <div class="item-config-row">
              <div class="item-config-body">
                <div class="item-config-nombre">${escapeHtml(item.nombre || 'Ítem')}</div>
                <div class="item-config-desc">Promedio del equipo en este criterio</div>
              </div>
              <div class="item-config-meta">
                <strong>${escapeHtml(String(item.promedio ?? '—'))}</strong>
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
        const scoreHtml = promedio != null
          ? `
              <div class="emp-score">
                <span class="emp-score-num">${escapeHtml(String(promedio))}</span>
                <span class="emp-score-label">este mes</span>
              </div>
            `
          : `
              <div class="emp-score">
                <span class="emp-score-num">—</span>
                <span class="emp-score-label">sin evaluar</span>
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

    if (titulo) titulo.textContent = 'Editar ítem de calificación';
    syncToggleLabels();
    abrirModal('modal-item');
    $('item-nombre')?.focus();
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
  function prepararVistaEvaluacion() {
    inicializarListenersBase();
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

    const card = $('eval-empleado-card');
    const estado = $('eval-estado');
    const btnGuardar = $('btn-guardar-eval');

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

    const items = app.getItemsParaRol(empleado.rol);

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

    const evaluacionExistente = app.getEvaluacion(empleadoId, periodo);

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

    const tbody = $('historial-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">Cargando historial...</td>
        </tr>
      `;
    }

    abrirModal('modal-historial');

    const historial = await app.getHistorialEmpleado(empleadoId);

    if (!tbody) return;

    if (!historial.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">No hay evaluaciones registradas para este miembro.</td>
        </tr>
      `;
      return;
    }

    const valores = historial
      .map((h) => Number(h.promedio))
      .filter((v) => Number.isFinite(v));

    if (valores.length) {
      const promGlobal = (valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(1);
      setText('historial-prom-global', promGlobal);
    }

    tbody.innerHTML = historial
      .map((h) => `
        <tr>
          <td>${escapeHtml(app.getPeriodoLabel(h.periodo || '—'))}</td>
          <td><strong>${escapeHtml(String(h.promedio ?? '—'))}</strong></td>
          <td>${escapeHtml(String(h.itemsEvaluados ?? h.totalItems ?? 0))}</td>
          <td>${escapeHtml(h.observaciones || '—')}</td>
          <td>
            <button class="btn-ghost" onclick="ui.irAEvaluacion('${escapeHtml(empleadoId)}', '${escapeHtml(h.periodo || '')}')">
              Abrir
            </button>
          </td>
        </tr>
      `)
      .join('');
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

    prepararVistaEvaluacion,
    actualizarSelectEvaluacion,
    actualizarEstadoEval,
    cargarFormularioEval,
    actualizarPromedioLive,

    verHistorialEmpleado,
    irAEvaluacion,
  };
})();

export default ui;