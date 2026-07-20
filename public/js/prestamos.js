// ============================================================
//  ProAlmacén  Prstamos y Devoluciones
// ============================================================

let prestamosData = [];

// ── Cargar prstamos ──────────────────────────────────────
async function cargarPrestamos() {
  const tbody = document.getElementById('tbody-prestamos');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;"><span class="spinner"></span></td></tr>`;

  const { ok, data } = await api('GET', '/api/prestamos');
  if (!ok) { toast('Error al cargar prstamos', 'error'); return; }

  prestamosData = data.prestamos || [];
  renderPrestamos(prestamosData);
}

function renderPrestamos(lista) {
  const tbody   = document.getElementById('tbody-prestamos');
  const esAdmin = usuarioActual?.rol === 'admin';

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state">
        <div class="empty-icon">${icon('arrow-left-right', 'width:48px;height:48px;stroke-width:1')}</div>
        <p>No hay prstamos registrados.</p>
        ${esAdmin ? '<button class="btn btn-primary btn-sm" onclick="abrirModalPrestamo()">+ Nuevo préstamo</button>' : ''}
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => `
    <tr>
      <td>
        <strong>${p.herramienta_nombre}</strong>
        <br><span class="text-sm text-muted">${p.herramienta_codigo}</span>
      </td>
      <td>${p.tecnico_nombre}</td>
      <td class="text-sm text-muted">${formatFecha(p.fecha_salida)}</td>
      <td class="text-sm text-muted">${p.fecha_devolucion ? formatFecha(p.fecha_devolucion) : ''}</td>
      <td>${badgeEstatus(p.estatus)}</td>
      <td class="admin-only" style="${!esAdmin ? 'display:none' : ''}">
        ${p.estatus === 'activo' ? `
          <button class="btn btn-primary btn-sm" onclick="registrarDevolucion(${p.id})">
            ${icon('circle-check')} Devolver
          </button>` : ''}
      </td>
    </tr>
  `).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Filtrar prstamos ─────────────────────────────────────
function filtrarPrestamos() {
  const q      = document.getElementById('search-prestamos').value.toLowerCase();
  const estatus = document.getElementById('filtro-estatus').value;

  const filtrada = prestamosData.filter(p => {
    const coincideTexto = !q ||
      p.herramienta_nombre.toLowerCase().includes(q) ||
      p.herramienta_codigo.toLowerCase().includes(q) ||
      p.tecnico_nombre.toLowerCase().includes(q);

    const coincideEstatus = !estatus || p.estatus === estatus;
    return coincideTexto && coincideEstatus;
  });

  renderPrestamos(filtrada);
}

// ── Abrir modal de nuevo préstamo ─────────────────────────
async function abrirModalPrestamo() {
  limpiarError('err-prestamo');
  document.getElementById('p-observaciones').value = '';

  // Cargar herramientas disponibles
  const resHer = await api('GET', '/api/inventario?estado=disponible');
  const selHer = document.getElementById('p-herramienta...');
  selHer.innerHTML = '<option value=""> Selecciona una herramienta... </option>';

  if (resHer.ok) {
    const disponibles = resHer.data.herramientas || [];
    if (disponibles.length === 0) {
      selHer.innerHTML = '<option value="" disabled>No hay herramientas disponibles</option>';
    } else {
      selHer.innerHTML += disponibles.map(h =>
        `<option value="${h.id}">${h.codigo_unico}  ${h.nombre}</option>`
      ).join('');
    }
  }

  // Cargar tcnicos
  const resTec = await api('GET', '/api/usuarios?rol=tecnico');
  const selTec = document.getElementById('p-tecnico');
  selTec.innerHTML = '<option value=""> Selecciona un técnico </option>';

  if (resTec.ok) {
    const tecnicos = resTec.data.usuarios || [];
    selTec.innerHTML += tecnicos.map(u =>
      `<option value="${u.id}">${u.nombre_completo}</option>`
    ).join('');
  }

  abrirModal('modal-prestamo');
}

// ── Guardar préstamo ──────────────────────────────────────
async function guardarPrestamo() {
  limpiarError('err-prestamo');

  const body = {
    herramienta_id:  document.getElementById('p-herramienta...').value,
    tecnico_id:      document.getElementById('p-tecnico').value,
    observaciones:   document.getElementById('p-observaciones').value.trim(),
  };

  if (!body.herramienta_id) { mostrarError('err-prestamo', 'Selecciona una herramienta....'); return; }
  if (!body.tecnico_id)     { mostrarError('err-prestamo', 'Selecciona un técnico.'); return; }

  const { ok, data } = await api('POST', '/api/prestamos', body);

  if (ok) {
    toast('Préstamo registrado exitosamente', 'success');
    cerrarModal('modal-prestamo');
    cargarPrestamos();
    cargarDashboard();
  } else {
    mostrarError('err-prestamo', data.mensaje || 'Error al registrar préstamo');
  }
}

// ── Registrar devolución ──────────────────────────────────
async function registrarDevolucion(prestamoId) {
  if (!confirm('¿Confirmar la devolución de esta herramienta...?')) return;

  const { ok, data } = await api('PUT', `/api/prestamos/${prestamoId}/devolver`);

  if (ok) {
    toast('Devolución registrada exitosamente', 'success');
    cargarPrestamos();
    cargarDashboard();
  } else {
    toast(data.mensaje || 'Error al registrar devolución', 'error');
  }
}
