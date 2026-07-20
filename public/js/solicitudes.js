// ============================================================
//  ProAlmacén — Solicitudes de Herramientas
//  Técnico solicita → Admin aprueba/rechaza/cancela
// ============================================================

let solicitudesData = [];

// ── Cargar solicitudes ────────────────────────────────────
async function cargarSolicitudes() {
  const tbody = document.getElementById('tbody-solicitudes');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;"><span class="spinner"></span></td></tr>`;

  const { ok, data } = await api('GET', '/api/solicitudes');
  if (!ok) { toast('Error al cargar solicitudes', 'error'); return; }

  solicitudesData = data.solicitudes || [];
  renderSolicitudes(solicitudesData);
  actualizarBadgeSolicitudes();
}

function renderSolicitudes(lista) {
  const tbody   = document.getElementById('tbody-solicitudes');
  if (!tbody) return;
  const esAdmin = usuarioActual?.rol === 'admin';

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state">
        <div class="empty-icon">${icon('inbox', 'width:48px;height:48px;stroke-width:1')}</div>
        <p>${esAdmin ? 'No hay solicitudes pendientes.' : 'No tienes solicitudes enviadas.'}</p>
        ${!esAdmin ? `<button class="btn btn-primary btn-sm" onclick="abrirModalSolicitud()">${icon('plus')} Solicitar herramienta</button>` : ''}
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(s => {
    const estadoBadge = badgeEstadoSolicitud(s.estado);
    const fecha = formatFecha(s.fecha_solicitud);

    let acciones = '';
    if (esAdmin && s.estado === 'pendiente') {
      acciones = `
        <div class="flex gap-2">
          <button class="btn btn-primary btn-sm" onclick="aprobarSolicitud(${s.id}, '${s.herramienta_nombre?.replace(/'/g, "\\'")}')">
            ${icon('circle-check')} Aprobar
          </button>
          <button class="btn btn-danger btn-sm" onclick="abrirModalRechazo(${s.id})">
            ${icon('x-circle')} Rechazar
          </button>
        </div>`;
    } else if (!esAdmin && s.estado === 'pendiente') {
      acciones = `
        <button class="btn btn-ghost btn-sm" onclick="cancelarSolicitud(${s.id})">
          ${icon('ban')} Cancelar
        </button>`;
    } else if (s.estado === 'rechazada' && s.respuesta) {
      acciones = `<span class="text-sm text-muted" title="${s.respuesta}">Motivo: ${s.respuesta.substring(0,30)}${s.respuesta.length > 30 ? '...' : ''}</span>`;
    }

    return `
      <tr>
        <td>
          <strong>${s.herramienta_nombre}</strong>
          <br><span class="text-sm text-muted">${s.herramienta_codigo}</span>
        </td>
        ${esAdmin ? `<td>${s.tecnico_nombre}</td>` : ''}
        <td class="text-sm text-muted">${fecha}</td>
        <td>${estadoBadge}</td>
        <td class="text-sm text-muted">${s.observaciones || ''}</td>
        <td>${acciones}</td>
      </tr>`;
  }).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function badgeEstadoSolicitud(estado) {
  const map = {
    pendiente:  ['badge-reparacion', icon('clock') + ' Pendiente'],
    aprobada:   ['badge-disponible', icon('circle-check') + ' Aprobada'],
    rechazada:  ['badge-fuera',      icon('x-circle') + ' Rechazada'],
    cancelada:  ['', icon('ban') + ' Cancelada'],
  };
  const [cls, label] = map[estado] || ['', estado];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── Filtrar solicitudes ───────────────────────────────────
function filtrarSolicitudes() {
  const q      = document.getElementById('search-solicitudes')?.value.toLowerCase() || '';
  const estado = document.getElementById('filtro-estado-sol')?.value || '';

  const filtrada = solicitudesData.filter(s => {
    const texto = !q ||
      s.herramienta_nombre?.toLowerCase().includes(q) ||
      s.herramienta_codigo?.toLowerCase().includes(q) ||
      s.tecnico_nombre?.toLowerCase().includes(q);
    const est = !estado || s.estado === estado;
    return texto && est;
  });
  renderSolicitudes(filtrada);
}

// ── Abrir modal para solicitar herramienta ────────────────
async function abrirModalSolicitud() {
  limpiarError('err-solicitud');
  document.getElementById('sol-observaciones').value = '';

  const { ok, data } = await api('GET', '/api/inventario?estado=disponible');
  const sel = document.getElementById('sol-herramienta');
  sel.innerHTML = '<option value="">Selecciona una herramienta...</option>';

  if (ok) {
    const disponibles = data.herramientas || [];
    if (disponibles.length === 0) {
      sel.innerHTML = '<option value="" disabled>No hay herramientas disponibles</option>';
    } else {
      sel.innerHTML += disponibles.map(h =>
        `<option value="${h.id}">${h.codigo_unico} — ${h.nombre}</option>`
      ).join('');
    }
  }
  abrirModal('modal-solicitud');
}

// ── Enviar solicitud ──────────────────────────────────────
async function enviarSolicitud() {
  limpiarError('err-solicitud');
  const herramienta_id  = document.getElementById('sol-herramienta').value;
  const observaciones   = document.getElementById('sol-observaciones').value.trim();

  if (!herramienta_id) { mostrarError('err-solicitud', 'Selecciona una herramienta.'); return; }

  const btn = document.getElementById('btn-enviar-solicitud');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Enviando...`;

  const { ok, data } = await api('POST', '/api/solicitudes', { herramienta_id, observaciones });

  btn.disabled = false;
  btn.innerHTML = `${icon('send')} Enviar solicitud`;

  if (ok) {
    toast('Solicitud enviada correctamente', 'success');
    cerrarModal('modal-solicitud');
    cargarSolicitudes();
  } else {
    mostrarError('err-solicitud', data.mensaje || 'Error al enviar solicitud');
  }
}

// ── Aprobar solicitud (admin) ─────────────────────────────
async function aprobarSolicitud(id, nombreHerramienta) {
  if (!confirm(`¿Aprobar la solicitud de "${nombreHerramienta}"?\nEsto creará un préstamo automáticamente.`)) return;

  const { ok, data } = await api('PUT', `/api/solicitudes/${id}/aprobar`, {});
  if (ok) {
    toast('Solicitud aprobada y préstamo registrado', 'success');
    cargarSolicitudes();
    cargarDashboard();
    cargarPrestamos();
  } else {
    toast(data.mensaje || 'Error al aprobar', 'error');
  }
}

// ── Modal de rechazo ──────────────────────────────────────
let _idSolicitudRechazo = null;

function abrirModalRechazo(id) {
  _idSolicitudRechazo = id;
  document.getElementById('rechazo-motivo').value = '';
  abrirModal('modal-rechazo');
}

async function confirmarRechazo() {
  const respuesta = document.getElementById('rechazo-motivo').value.trim();
  const { ok, data } = await api('PUT', `/api/solicitudes/${_idSolicitudRechazo}/rechazar`, { respuesta });
  if (ok) {
    toast('Solicitud rechazada', 'info');
    cerrarModal('modal-rechazo');
    cargarSolicitudes();
  } else {
    toast(data.mensaje || 'Error al rechazar', 'error');
  }
}

// ── Cancelar solicitud (técnico) ──────────────────────────
async function cancelarSolicitud(id) {
  if (!confirm('¿Cancelar esta solicitud?')) return;
  const { ok, data } = await api('PUT', `/api/solicitudes/${id}/cancelar`, {});
  if (ok) {
    toast('Solicitud cancelada', 'info');
    cargarSolicitudes();
  } else {
    toast(data.mensaje || 'Error al cancelar', 'error');
  }
}
