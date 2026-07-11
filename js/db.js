// ============================================================
//  db.js — Capa de datos · Musicala Evaluaciones
//  Responsabilidad: escuchar colecciones, guardar empleados,
//  ítems y evaluaciones, y consultar historial.
// ============================================================

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const db = (() => {
  // ── Configuración base ────────────────────────────────────
  const COLLECTIONS = {
    empleados    : 'empleados',
    items        : 'items_calificacion',
    evaluaciones : 'evaluaciones',
  };

  const $ = (id) => document.getElementById(id);

  function getFirestore() {
    if (!window._firebaseDb) {
      throw new Error('Firestore no está inicializado en window._firebaseDb');
    }
    return window._firebaseDb;
  }

  function getCurrentUser() {
    return window._firebaseAuth?.currentUser || null;
  }

  function getCurrentUserEmail() {
    return getCurrentUser()?.email || '';
  }

  function getCurrentUserName() {
    const user = getCurrentUser();
    const displayName = String(user?.displayName || '').trim();
    if (displayName) return displayName;

    const email = String(user?.email || '').trim();
    return email ? email.split('@')[0].replace(/[._-]+/g, ' ') : '';
  }

  function normalizarIdEvaluador(email) {
    return normalizarEmail(email).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sin_usuario';
  }

  function getEvaluacionKey(data) {
    const evaluatorId = data.evaluatorId || normalizarIdEvaluador(data.evaluatorEmail || data.updatedBy || data.createdBy || '');
    return `${data.periodo}_${data.empleadoId}_${evaluatorId}`;
  }

  // ── Helpers ───────────────────────────────────────────────
  function notificar(mensaje, tipo = 'success') {
    if (window.ui?.toast) {
      ui.toast(mensaje, tipo);
      return;
    }

    if (tipo === 'error') console.error(mensaje);
    else console.log(mensaje);
  }

  function cerrarModalSeguro(idModal) {
    if (window.ui?.cerrarModal) {
      ui.cerrarModal(idModal);
      return;
    }

    const modal = $(idModal);
    if (modal) modal.classList.add('hidden');
  }

  function normalizarTexto(valor) {
    return String(valor || '').trim();
  }

  function normalizarEmail(valor) {
    return String(valor || '').trim().toLowerCase();
  }

  function mapSnapshot(docSnap) {
    return {
      id: docSnap.id,
      ...docSnap.data(),
    };
  }

  function ordenarPorNombre(a, b) {
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {
      sensitivity: 'base',
      numeric: true,
    });
  }

  function ordenarItems(a, b) {
    const rolA = String(a.rol || '');
    const rolB = String(b.rol || '');
    const cmpRol = rolA.localeCompare(rolB, 'es', { sensitivity: 'base' });
    if (cmpRol !== 0) return cmpRol;

    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {
      sensitivity: 'base',
      numeric: true,
    });
  }

  function ordenarPorPeriodoDesc(a, b) {
    return String(b.periodo || '').localeCompare(String(a.periodo || ''));
  }

  function validarEmailOpcional(email) {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function limpiarFormularioEmpleado() {
    if ($('empleado-id')) $('empleado-id').value = '';
    if ($('emp-nombre')) $('emp-nombre').value = '';
    if ($('emp-rol')) $('emp-rol').value = '';
    if ($('emp-email')) $('emp-email').value = '';
    if ($('emp-telefono')) $('emp-telefono').value = '';
    if ($('emp-activo')) $('emp-activo').checked = true;
    if ($('emp-notas')) $('emp-notas').value = '';
  }

  function limpiarFormularioItem() {
    if ($('item-id')) $('item-id').value = '';
    if ($('item-nombre')) $('item-nombre').value = '';
    if ($('item-descripcion')) $('item-descripcion').value = '';
    if ($('item-rol')) $('item-rol').value = 'Universal';
    if ($('item-activo')) $('item-activo').checked = true;
  }

  function obtenerEmpleadoSeleccionado() {
    const empleadoId = $('eval-empleado')?.value || '';
    if (!empleadoId) return null;

    if (!window.app?.getEmpleados) return null;

    return app.getEmpleados().find(e => e.id === empleadoId) || null;
  }

  function obtenerEvaluadorConfidencial() {
    const empleadoId = $('conf-evaluador')?.value || '';
    if (!empleadoId) return null;

    if (!window.app?.getEmpleados) return null;

    return app.getEmpleados().find(e => e.id === empleadoId) || null;
  }

  function obtenerPeriodoSeleccionado() {
    return $('eval-periodo')?.value || window.app?.getPeriodoActivo?.() || '';
  }

  function leerCalificacionItem(itemId) {
    if (!itemId) return null;

    const safeId = String(itemId).replace(/"/g, '\\"');

    // Opción 1: contenedor con dataset.value o dataset.rating
    const ratingBox = document.querySelector(`.star-rating[data-item="${safeId}"]`);
    if (ratingBox) {
      const rawDataValue =
        ratingBox.dataset.value ??
        ratingBox.dataset.rating ??
        ratingBox.getAttribute('data-value') ??
        ratingBox.getAttribute('data-rating');

      const dataValue = Number(rawDataValue);
      if (Number.isFinite(dataValue) && dataValue >= 1 && dataValue <= 5) {
        return dataValue;
      }

      // Opción 2: contar estrellas activas
      const activeStars = ratingBox.querySelectorAll(
        '.star.active, .star.selected, .star.is-active, .star[aria-checked="true"]'
      ).length;

      if (activeStars >= 1 && activeStars <= 5) {
        return activeStars;
      }
    }

    // Opción 3: span o input con id val-ITEM_ID
    const valNode = $(`val-${itemId}`);
    if (valNode) {
      const raw = 'value' in valNode ? valNode.value : valNode.textContent;
      const parsed = Number(String(raw || '').replace(',', '.').trim());
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 5) {
        return parsed;
      }
    }

    // Opción 4: hidden/input alternativo
    const altNode = document.querySelector(
      `#rating-${safeId}, input[name="rating-${safeId}"], input[data-rating-for="${safeId}"]`
    );
    if (altNode) {
      const raw = altNode.value ?? altNode.getAttribute('value');
      const parsed = Number(String(raw || '').replace(',', '.').trim());
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 5) {
        return parsed;
      }
    }

    return null;
  }

  function calcularPromedioDesdeCalificaciones(calificaciones) {
    const valores = Object.values(calificaciones)
      .map(v => Number(v))
      .filter(v => Number.isFinite(v));

    if (!valores.length) return null;

    const suma = valores.reduce((acc, v) => acc + v, 0);
    return Number((suma / valores.length).toFixed(1));
  }

  // ── Listeners en tiempo real ─────────────────────────────
  function escucharEmpleados(callback) {
    try {
      const ref = collection(getFirestore(), COLLECTIONS.empleados);

      return onSnapshot(
        ref,
        (snapshot) => {
          const empleados = snapshot.docs
            .map(mapSnapshot)
            .sort(ordenarPorNombre);

          callback(empleados);
        },
        (error) => {
          console.error('Error escuchando empleados:', error);
          notificar('No se pudieron cargar los miembros del equipo.', 'error');
          callback([]);
        }
      );
    } catch (error) {
      console.error('Error iniciando listener de empleados:', error);
      notificar('Error iniciando la escucha de empleados.', 'error');
      callback([]);
      return () => {};
    }
  }

  function escucharItems(callback) {
    try {
      const ref = collection(getFirestore(), COLLECTIONS.items);

      return onSnapshot(
        ref,
        (snapshot) => {
          const items = snapshot.docs
            .map(mapSnapshot)
            .sort(ordenarItems);

          callback(items);
        },
        (error) => {
          console.error('Error escuchando ítems:', error);
          notificar('No se pudieron cargar los ítems de calificación.', 'error');
          callback([]);
        }
      );
    } catch (error) {
      console.error('Error iniciando listener de ítems:', error);
      notificar('Error iniciando la escucha de ítems.', 'error');
      callback([]);
      return () => {};
    }
  }

  function escucharEvaluaciones(periodo, callback) {
    try {
      if (!periodo) {
        callback({});
        return () => {};
      }

      const ref = collection(getFirestore(), COLLECTIONS.evaluaciones);
      const q = query(ref, where('periodo', '==', periodo));

      return onSnapshot(
        q,
        (snapshot) => {
          const evaluacionesMap = {};

          snapshot.docs.forEach((docSnap) => {
            const data = mapSnapshot(docSnap);
            const key = getEvaluacionKey(data);
            evaluacionesMap[key] = data;

          });

          callback(evaluacionesMap);
        },
        (error) => {
          console.error('Error escuchando evaluaciones:', error);
          notificar('No se pudieron cargar las evaluaciones del período.', 'error');
          callback({});
        }
      );
    } catch (error) {
      console.error('Error iniciando listener de evaluaciones:', error);
      notificar('Error iniciando la escucha de evaluaciones.', 'error');
      callback({});
      return () => {};
    }
  }


  function escucharTodasEvaluaciones(callback) {
    try {
      const ref = collection(getFirestore(), COLLECTIONS.evaluaciones);

      return onSnapshot(
        ref,
        (snapshot) => {
          const evaluaciones = snapshot.docs
            .map(mapSnapshot)
            .sort(ordenarPorPeriodoDesc);

          callback(evaluaciones);
        },
        (error) => {
          console.error('Error escuchando histórico de evaluaciones:', error);
          // No bloqueamos la app si el histórico falla. El dashboard del período sigue funcionando.
          callback([]);
        }
      );
    } catch (error) {
      console.error('Error iniciando listener histórico de evaluaciones:', error);
      callback([]);
      return () => {};
    }
  }

  // ── Guardar empleado ─────────────────────────────────────
  async function guardarEmpleado() {
    try {
      const empleadoId = normalizarTexto($('empleado-id')?.value);
      const nombre     = normalizarTexto($('emp-nombre')?.value);
      const rol        = normalizarTexto($('emp-rol')?.value);
      const email      = normalizarEmail($('emp-email')?.value);
      const telefono   = normalizarTexto($('emp-telefono')?.value);
      const activo     = Boolean($('emp-activo')?.checked);
      const notas      = normalizarTexto($('emp-notas')?.value);

      if (!nombre) {
        notificar('Debes escribir el nombre del miembro.', 'error');
        $('emp-nombre')?.focus();
        return false;
      }

      if (!rol) {
        notificar('Debes seleccionar el rol o cargo.', 'error');
        $('emp-rol')?.focus();
        return false;
      }

      if (!validarEmailOpcional(email)) {
        notificar('El correo no tiene un formato válido.', 'error');
        $('emp-email')?.focus();
        return false;
      }

      const payload = {
        nombre,
        nombreLower : nombre.toLowerCase(),
        rol,
        email,
        telefono,
        activo,
        notas,
        updatedAt   : serverTimestamp(),
        updatedBy   : getCurrentUserEmail(),
      };

      if (empleadoId) {
        const ref = doc(getFirestore(), COLLECTIONS.empleados, empleadoId);
        await updateDoc(ref, payload);
        notificar('Miembro actualizado correctamente.');
      } else {
        payload.createdAt = serverTimestamp();
        payload.createdBy = getCurrentUserEmail();
        await addDoc(collection(getFirestore(), COLLECTIONS.empleados), payload);
        notificar('Miembro agregado correctamente.');
      }

      cerrarModalSeguro('modal-empleado');
      limpiarFormularioEmpleado();

      return true;
    } catch (error) {
      console.error('Error guardando empleado:', error);
      notificar('No se pudo guardar el miembro del equipo.', 'error');
      return false;
    }
  }

  // ── Guardar ítem de calificación ─────────────────────────
  async function guardarItem() {
    try {
      const itemId       = normalizarTexto($('item-id')?.value);
      const nombre       = normalizarTexto($('item-nombre')?.value);
      const descripcion  = normalizarTexto($('item-descripcion')?.value);
      const rol          = normalizarTexto($('item-rol')?.value) || 'Universal';
      const activo       = Boolean($('item-activo')?.checked);
      const evaluablePorPares = $('item-pares') ? Boolean($('item-pares').checked) : true;

      if (!nombre) {
        notificar('Debes escribir el nombre del ítem.', 'error');
        $('item-nombre')?.focus();
        return false;
      }

      const payload = {
        nombre,
        nombreLower : nombre.toLowerCase(),
        descripcion,
        rol,
        activo,
        evaluablePorPares,
        updatedAt   : serverTimestamp(),
        updatedBy   : getCurrentUserEmail(),
      };

      if (itemId) {
        const ref = doc(getFirestore(), COLLECTIONS.items, itemId);
        await updateDoc(ref, payload);
        notificar('Ítem actualizado correctamente.');
      } else {
        payload.createdAt = serverTimestamp();
        payload.createdBy = getCurrentUserEmail();
        await addDoc(collection(getFirestore(), COLLECTIONS.items), payload);
        notificar('Ítem creado correctamente.');
      }

      cerrarModalSeguro('modal-item');
      limpiarFormularioItem();
      return true;
    } catch (error) {
      console.error('Error guardando ítem:', error);
      notificar('No se pudo guardar el ítem de calificación.', 'error');
      return false;
    }
  }

  // Habilita/deshabilita un ítem para evaluación por pares (modo confidencial).
  async function setItemEvaluablePorPares(itemId, evaluablePorPares) {
    try {
      if (!itemId) return false;
      const ref = doc(getFirestore(), COLLECTIONS.items, itemId);
      await updateDoc(ref, {
        evaluablePorPares: Boolean(evaluablePorPares),
        updatedAt: serverTimestamp(),
        updatedBy: getCurrentUserEmail(),
      });
      return true;
    } catch (error) {
      console.error('Error actualizando ítem (pares):', error);
      notificar('No se pudo actualizar el ítem.', 'error');
      return false;
    }
  }

  // ── Guardar evaluación ───────────────────────────────────
  async function guardarEvaluacion() {
    try {
      const periodo  = obtenerPeriodoSeleccionado();
      const empleado = obtenerEmpleadoSeleccionado();
      const observaciones = normalizarTexto($('eval-observaciones')?.value);

      if (!periodo) {
        notificar('No hay período seleccionado.', 'error');
        return false;
      }

      if (!empleado) {
        notificar('Debes seleccionar a quién vas a evaluar.', 'error');
        $('eval-empleado')?.focus();
        return false;
      }

      if (!window.app?.getItemsParaRol) {
        notificar('No se pudieron leer los ítems configurados para este rol.', 'error');
        return false;
      }

      // En modo confidencial solo se guardan los ítems habilitados para pares.
      const peerEvaluator = obtenerEvaluadorConfidencial();
      const items = peerEvaluator && app.getItemsParaRolPares
        ? app.getItemsParaRolPares(empleado.rol)
        : app.getItemsParaRol(empleado.rol);

      if (!items.length) {
        notificar(`No hay ítems configurados para el rol ${empleado.rol}.`, 'error');
        return false;
      }

      const calificaciones = {};
      const faltantes = [];

      items.forEach((item) => {
        const valor = leerCalificacionItem(item.id);

        if (valor == null) {
          faltantes.push(item.nombre || item.id);
          return;
        }

        calificaciones[item.id] = valor;
      });

      if (faltantes.length) {
        notificar('Debes calificar todos los ítems antes de guardar.', 'error');
        console.warn('Ítems sin calificar:', faltantes);
        return false;
      }

      const promedio = calcularPromedioDesdeCalificaciones(calificaciones);

      if (promedio == null) {
        notificar('No fue posible calcular el promedio.', 'error');
        return false;
      }

      const operatorEmail = getCurrentUserEmail();
      const operatorName = getCurrentUserName();
      const evaluatorEmail = peerEvaluator ? (peerEvaluator.email || '') : operatorEmail;
      const evaluatorName = peerEvaluator?.nombre || operatorName;
      const evaluatorId = peerEvaluator?.id || normalizarIdEvaluador(evaluatorEmail);

      if (!operatorEmail) {
        notificar('No se pudo identificar el usuario evaluador.', 'error');
        return false;
      }

      const docId = `${periodo}_${empleado.id}_${evaluatorId}`;
      const ref   = doc(getFirestore(), COLLECTIONS.evaluaciones, docId);
      const prev  = await getDoc(ref);

      const payload = {
        empleadoId      : empleado.id,
        empleadoNombre  : empleado.nombre || '',
        empleadoRol     : empleado.rol || '',
        periodo,
        evaluatorId,
        evaluatorEmail,
        evaluatorName,
        peerEvaluatorId  : peerEvaluator?.id || '',
        peerEvaluatorName: peerEvaluator?.nombre || '',
        peerEvaluatorRol : peerEvaluator?.rol || '',
        calificaciones,
        observaciones,
        promedio,
        totalItems      : Object.keys(calificaciones).length,
        updatedAt       : serverTimestamp(),
        updatedBy       : operatorEmail,
        operatorEmail,
        operatorName,
      };

      if (prev.exists()) {
        await updateDoc(ref, payload);
        notificar('Evaluación actualizada correctamente.');
      } else {
        payload.createdAt = serverTimestamp();
        payload.createdBy = operatorEmail;
        await setDoc(ref, payload);
        notificar('Evaluación guardada correctamente.');
      }

      if (window.ui?.onEvaluacionGuardada) {
        window.ui.onEvaluacionGuardada();
      }

      return true;
    } catch (error) {
      console.error('Error guardando evaluación:', error);
      notificar('No se pudo guardar la evaluación.', 'error');
      return false;
    }
  }

  // ── Historial de un empleado ─────────────────────────────
  async function obtenerHistorialEmpleado(empleadoId) {
    try {
      if (!empleadoId) return [];

      const ref = collection(getFirestore(), COLLECTIONS.evaluaciones);
      const q = query(ref, where('empleadoId', '==', empleadoId));
      const snapshot = await getDocs(q);

      return snapshot.docs
        .map(mapSnapshot)
        .map((ev) => ({
          ...ev,
          itemsEvaluados: Object.keys(ev.calificaciones || {}).length,
        }))
        .sort(ordenarPorPeriodoDesc);
    } catch (error) {
      console.error('Error obteniendo historial del empleado:', error);
      notificar('No se pudo cargar el historial del empleado.', 'error');
      return [];
    }
  }

  // ── API pública ──────────────────────────────────────────
  return {
    escucharEmpleados,
    escucharItems,
    escucharEvaluaciones,
    escucharTodasEvaluaciones,
    guardarEmpleado,
    guardarItem,
    setItemEvaluablePorPares,
    guardarEvaluacion,
    obtenerHistorialEmpleado,
  };
})();

export default db;
