// ============================================================
//  ProAlmacén  Utilidades globales
// ============================================================

// ── Helper Iconos ──────────────────────────────────────────
function icon(nombre, style = '') {
  return `<i data-lucide="${nombre}" ${style ? `style="${style}"` : ''}></i>`;
}

// ── Toast de notificaciones ───────────────────────────────
function toast(mensaje, tipo = 'info', duracion = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const t = document.createElement('div');
  t.className = `toast ${tipo}`;

  const iconos = { success: 'circle-check', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
  t.innerHTML = `<span>${icon(iconos[tipo] || 'megaphone')}</span><span>${mensaje}</span>`;

  container.appendChild(t);
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: t });

  setTimeout(() => {
    t.classList.add('saliendo');
    setTimeout(() => t.remove(), 200);
  }, duracion);
}

// ── Modales ────────────────────────────────────────────────
function abrirModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.add('active');
}

function cerrarModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.classList.remove('active');
    // Limpiar formulario si existe
    const form = overlay.querySelector('form');
    if (form) form.reset();
    // Limpiar mensajes de error
    overlay.querySelectorAll('.form-error-msg').forEach(el => {
      el.textContent = '';
      el.classList.remove('visible');
    });
  }
}

// Cerrar modal al hacer clic en el overlay
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// ── Formateo de fechas ─────────────────────────────────────
function formatFecha(fechaStr) {
  if (!fechaStr) return '';
  const d = new Date(fechaStr);
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatFechaCorta(fechaStr) {
  if (!fechaStr) return '';
  const d = new Date(fechaStr);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Badge de estado ────────────────────────────────────────
function badgeEstado(estado) {
  const map = {
    disponible:       ['badge-disponible',  icon('circle-check') + ' Disponible'],
    prestada:         ['badge-prestada',    icon('arrow-left-right') + ' Prestada'],
    en_reparacion:    ['badge-reparacion',  icon('wrench') + ' En reparación'],
    fuera_de_servicio:['badge-fuera',       icon('circle-x') + ' Fuera de servicio'],
  };
  const [cls, label] = map[estado] || ['', estado];
  return `<span class="badge ${cls}">${label}</span>`;
}

function badgeEstatus(estatus) {
  const map = {
    activo:   ['badge-prestada', icon('arrow-left-right') + ' Activo'],
    devuelto: ['badge-disponible',icon('circle-check') + ' Devuelto'],
    vencido:  ['badge-fuera',    icon('clock') + ' Vencido'],
  };
  const [cls, label] = map[estatus] || ['', estatus];
  return `<span class="badge ${cls}">${label}</span>`;
}

function badgeTipoMov(tipo) {
  const map = {
    prestamo:   icon('arrow-left-right') + ' Préstamo',
    devolucion: icon('circle-check') + ' Devolución',
    alta:       icon('plus-circle') + ' Alta',
    baja:       icon('trash-2') + ' Baja',
    edicion:    icon('pencil') + ' Edición',
    reparacion: icon('wrench') + ' Reparación',
  };
  return map[tipo] || tipo;
}

// ── Error en campo de formulario ───────────────────────────
function mostrarError(idElemento, mensaje) {
  const el = document.getElementById(idElemento);
  if (el) {
    el.textContent = mensaje;
    el.classList.add('visible');
  }
}

function limpiarError(idElemento) {
  const el = document.getElementById(idElemento);
  if (el) {
    el.textContent = '';
    el.classList.remove('visible');
  }
}

// ── Fetch helper ───────────────────────────────────────────
async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok && res.status === 401) {
    const p = window.location.pathname;
    if (p !== '/' && p !== '/index.html' && p !== '') {
      window.location.href = '/';
    }
  }

  return { ok: res.ok, status: res.status, data };
}

// ── Iniciales para avatar ──────────────────────────────────
function iniciales(nombre) {
  if (!nombre) return '?';
  return nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

// ── Copiar al portapapeles ─────────────────────────────────
async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('Copiado al portapapeles', 'success', 2000);
  } catch {
    toast('No se pudo copiar', 'error');
  }
}

// ── Sonido de notificación (Web Audio API, sin archivos externos) ──
function reproducirSonido(tipo = 'notif') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (tipo === 'solicitud') {
      // Dos tonos ascendentes: ding-ding
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.setValueAtTime(780, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    } else if (tipo === 'aprobada') {
      // Tono suave ascendente
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else if (tipo === 'rechazada') {
      // Tono descendente
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.setValueAtTime(250, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else {
      // Notificación genérica
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch { /* silenciar en navegadores sin AudioContext */ }
}

// ── SSE: conexión en tiempo real ───────────────────────────
let _sseSource = null;
let _sseReconectTimer = null;

function conectarSSE() {
  if (_sseSource) return; // ya conectado

  function conectar() {
    _sseSource = new EventSource('/api/sse/stream');

    _sseSource.addEventListener('connected', () => {
      console.log('[SSE] Conectado');
    });

    // ─ Solicitud nueva (admin recibe esto)
    _sseSource.addEventListener('solicitud_nueva', (e) => {
      const d = JSON.parse(e.data);
      reproducirSonido('solicitud');
      toast(`📋 Solicitud: ${d.tecnico_nombre} pide "${d.herramienta_nombre}"`, 'warning', 6000);
      // Recargar vista si está activa
      if (typeof cargarSolicitudes === 'function') cargarSolicitudes();
      if (typeof actualizarBadgeSolicitudes === 'function') actualizarBadgeSolicitudes();
    });

    // ─ Solicitud resuelta (técnico recibe esto)
    _sseSource.addEventListener('solicitud_resuelta', (e) => {
      const d = JSON.parse(e.data);
      if (d.estado === 'aprobada') {
        reproducirSonido('aprobada');
        toast(`✅ Tu solicitud de "${d.herramienta_nombre}" fue aprobada`, 'success', 6000);
      } else {
        reproducirSonido('rechazada');
        const motivo = d.respuesta ? `: ${d.respuesta}` : '';
        toast(`❌ Tu solicitud de "${d.herramienta_nombre}" fue rechazada${motivo}`, 'error', 7000);
      }
      if (typeof cargarSolicitudes === 'function') cargarSolicitudes();
      if (typeof actualizarBadgeSolicitudes === 'function') actualizarBadgeSolicitudes();
      if (typeof cargarInventario === 'function') cargarInventario();
      if (typeof cargarDashboard === 'function') cargarDashboard();
    });

    // ─ Solicitud cancelada
    _sseSource.addEventListener('solicitud_cancelada', (e) => {
      if (typeof cargarSolicitudes === 'function') cargarSolicitudes();
      if (typeof actualizarBadgeSolicitudes === 'function') actualizarBadgeSolicitudes();
    });

    // ─ Préstamo nuevo
    _sseSource.addEventListener('prestamo_nuevo', () => {
      if (typeof cargarPrestamos === 'function') cargarPrestamos();
      if (typeof cargarDashboard === 'function') cargarDashboard();
    });

    // ─ Devolución
    _sseSource.addEventListener('devolucion', () => {
      if (typeof cargarPrestamos === 'function') cargarPrestamos();
      if (typeof cargarDashboard === 'function') cargarDashboard();
      if (typeof cargarInventario === 'function') cargarInventario();
    });

    // ─ Cambio de inventario
    _sseSource.addEventListener('inventario_cambio', () => {
      if (typeof cargarInventario === 'function') cargarInventario();
    });

    // ─ Reconectar si se pierde la conexión
    _sseSource.onerror = () => {
      console.warn('[SSE] Desconectado, reconectando en 5s...');
      _sseSource.close();
      _sseSource = null;
      _sseReconectTimer = setTimeout(conectar, 5000);
    };
  }

  conectar();
}

function desconectarSSE() {
  if (_sseReconectTimer) { clearTimeout(_sseReconectTimer); _sseReconectTimer = null; }
  if (_sseSource) { _sseSource.close(); _sseSource = null; }
}

