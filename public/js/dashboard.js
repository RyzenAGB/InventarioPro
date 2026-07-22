// ============================================================
//  ProAlmacén  Dashboard: navegación, sesión, estadísticas
// ============================================================

let usuarioActual = null;

const TITULOS = {
  dashboard:   'Dashboard',
  inventario:  'Inventario',
  prestamos:   'Préstamos y Devoluciones',
  solicitudes: 'Solicitudes de Herramientas',
  historial:   'Historial de movimientos',
  categorias:  'Categorías',
  usuarios:    'Gestión de usuarios',
};

// ── Inicializar ───────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await cargarSesion();
  configurarUI();
  
  // Revisar si hay un hash en la URL para abrir esa sección inicialmente
  const hashSection = window.location.hash.replace('#', '');
  const seccionInicial = hashSection ? hashSection : 'dashboard';
  
  await navegarA(seccionInicial, false); // false para no volver a pushear al cargar
  
  conectarSSE();
  actualizarBadgeSolicitudes();

  // Smart Polling: Recargar vista activa cada 10s si la página es visible
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      const activeSection = document.querySelector('.section-view.active');
      if (activeSection) {
        const seccion = activeSection.id.replace('view-', '');
        recargarSeccion(seccion);
      }
      actualizarBadgeSolicitudes();
    }
  }, 10000);

  // Cerrar dropdown al clic fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#topbar-user-btn')) {
      document.getElementById('user-dropdown')?.classList.remove('open');
    }
    // Cerrar sidebar en móvil al clic en overlay
    if (e.target.id === 'sidebar-overlay') cerrarSidebar();
  });

  // Escuchar el botón atrás del navegador
  window.addEventListener('popstate', (e) => {
    const section = window.location.hash.replace('#', '') || 'dashboard';
    navegarA(section, false);
  });
});

function recargarSeccion(seccion) {
  switch (seccion) {
    case 'dashboard':   if (typeof cargarDashboard === 'function') cargarDashboard(true); break;
    case 'inventario':  if (typeof cargarInventario === 'function') cargarInventario(true); break;
    case 'prestamos':   if (typeof cargarPrestamos === 'function') cargarPrestamos(true);  break;
    case 'solicitudes': if (typeof cargarSolicitudes === 'function') cargarSolicitudes(true); break;
    case 'historial':   if (typeof cargarHistorial === 'function') cargarHistorial(true);  break;
    case 'usuarios':    if (typeof cargarUsuarios === 'function') cargarUsuarios(true);   break;
    case 'categorias':  if (typeof cargarCategorias === 'function') cargarCategorias(true); break;
  }
}

// ── Sesión ────────────────────────────────────────────────
async function cargarSesion() {
  const { ok, data } = await api('GET', '/api/auth/me');
  if (!ok) { window.location.href = '/'; return; }

  usuarioActual = data.usuario;

  document.getElementById('topbar-avatar').textContent  = iniciales(usuarioActual.nombre_completo);
  document.getElementById('topbar-nombre').textContent  = usuarioActual.nombre_completo;
  document.getElementById('topbar-rol').textContent     = usuarioActual.rol === 'admin' ? 'Administrador' : 'Técnico';
  document.getElementById('nombre-almacen').textContent = usuarioActual.almacen_nombre;
  document.getElementById('dd-nombre').textContent      = usuarioActual.nombre_completo;
  document.getElementById('dd-correo').textContent      = usuarioActual.correo;
}

// ── Roles ─────────────────────────────────────────────────
function configurarUI() {
  const esAdmin = usuarioActual?.rol === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = esAdmin ? '' : 'none';
  });
  const wrapSol = document.getElementById('btn-nueva-solicitud-wrap');
  if (wrapSol) wrapSol.style.display = esAdmin ? 'none' : '';
}

// ── Navegación ────────────────────────────────────────────
async function navegarA(seccion, pushToHistory = true) {
  if (['usuarios', 'categorias'].includes(seccion) && usuarioActual?.rol !== 'admin') {
    toast('Acceso restringido a administradores', 'warning');
    return;
  }

  document.querySelectorAll('.section-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById('view-' + seccion);
  const nav  = document.getElementById('nav-' + seccion);
  const navBottom = document.getElementById('nav-bottom-' + seccion);
  if (view) view.classList.add('active');
  if (nav)  nav.classList.add('active');
  if (navBottom) navBottom.classList.add('active');

  const titulo = document.getElementById('topbar-title');
  if (titulo) titulo.textContent = TITULOS[seccion] || seccion;

  if (pushToHistory) {
    const hash = seccion === 'dashboard' ? '' : '#' + seccion;
    // Evitar pushear si ya estamos en ese estado
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', window.location.pathname + hash);
    }
  }

  // Cerrar sidebar en móvil al navegar
  cerrarSidebar();

  switch (seccion) {
    case 'dashboard':   cargarDashboard();  break;
    case 'inventario':  cargarInventario(); break;
    case 'prestamos':   cargarPrestamos();  break;
    case 'solicitudes': cargarSolicitudes(); break;
    case 'historial':   cargarHistorial();  break;
    case 'usuarios':    cargarUsuarios();   break;
    case 'categorias':  cargarCategorias(); break;
  }
}

// ── Menú usuario ──────────────────────────────────────────
function toggleUserMenu() {
  document.getElementById('user-dropdown').classList.toggle('open');
}

async function cerrarSesion() {
  desconectarSSE();
  await api('POST', '/api/auth/logout');
  window.location.href = '/';
}

// ── Sidebar móvil ─────────────────────────────────────────
function abrirSidebar() {
  document.querySelector('.sidebar')?.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.add('active');
}
function cerrarSidebar() {
  document.querySelector('.sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('active');
}

// ── Dashboard stats ───────────────────────────────────────
async function cargarDashboard() {
  const { ok, data } = await api('GET', '/api/dashboard');
  if (!ok) return;

  const s = data.stats || {};
  document.getElementById('stat-total').textContent       = s.total       ?? 0;
  document.getElementById('stat-disponibles').textContent = s.disponibles  ?? 0;
  document.getElementById('stat-prestadas').textContent   = s.prestadas    ?? 0;
  document.getElementById('stat-reparacion').textContent  = s.reparacion   ?? 0;
  document.getElementById('stat-fuera').textContent       = s.fuera        ?? 0;

  // Badge en sidebar
  const badge = document.getElementById('badge-prestamos');
  if (s.prestadas > 0) {
    badge.textContent = s.prestadas;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  // Tabla préstamos recientes
  const tbody = document.getElementById('tbody-prestamos-recientes');
  const filas = data.recientes || [];

  if (filas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">
      <div class="empty-state">
        <div class="empty-icon">${icon('inbox', 'width:48px;height:48px;stroke-width:1')}</div>
        <p>No hay préstamos activos en este momento</p>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = filas.map(p => `
    <tr>
      <td><strong>${p.herramienta_nombre}</strong>
          <br><span class="text-sm text-muted">${p.herramienta_codigo}</span></td>
      <td>${p.tecnico_nombre}</td>
      <td class="text-sm text-muted">${formatFecha(p.fecha_salida)}</td>
      <td>${badgeEstatus(p.estatus)}</td>
    </tr>`).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Usuarios ──────────────────────────────────────────────
async function cargarUsuarios() {
  if (usuarioActual?.rol === 'admin') {
    cargarCodigoEmpresa();
  }
  const tbody = document.getElementById('tbody-usuarios');
  const { ok, data } = await api('GET', '/api/usuarios');
  if (!ok) return;

  const lista = data.usuarios || [];
  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">${icon('users', 'width:48px;height:48px;stroke-width:1')}</div><p>No hay usuarios registrados</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(u => `
    <tr>
      <td><strong>${u.nombre_completo}</strong></td>
      <td class="text-sm">${u.correo}</td>
      <td><span class="badge ${u.rol === 'admin' ? 'badge-reparacion' : 'badge-disponible'}">${u.rol === 'admin' ? icon('shield') + ' Admin' : icon('hard-hat') + ' Técnico'}</span></td>
      <td class="text-sm text-muted">${formatFechaCorta(u.fecha_registro)}</td>
      <td><span class="badge ${u.activo ? 'badge-disponible' : 'badge-fuera'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        ${u.id !== usuarioActual.id
          ? `<button class="btn btn-ghost btn-sm" onclick="toggleUsuario(${u.id}, ${u.activo})">
               ${u.activo ? icon('ban') + ' Desactivar' : icon('circle-check') + ' Activar'}
             </button>`
          : '<span class="text-muted text-sm"> Tú </span>'}
      </td>
    </tr>`).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function toggleUsuario(id, activo) {
  const { ok, data } = await api('PUT', `/api/usuarios/${id}`, { activo: activo ? 0 : 1 });
  if (ok) { toast(activo ? 'Usuario desactivado' : 'Usuario activado', 'success'); cargarUsuarios(); }
  else    toast(data.mensaje || 'Error', 'error');
}

// ── Badge de solicitudes pendientes ───────────────────────
async function actualizarBadgeSolicitudes() {
  const { ok, data } = await api('GET', '/api/solicitudes/pendientes/count');
  if (!ok) return;
  const badge = document.getElementById('badge-solicitudes');
  if (!badge) return;
  const total = data.total ?? 0;
  if (total > 0) {
    badge.textContent = total;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ── Código de empresa (para sección usuarios/admin) ───────
async function cargarCodigoEmpresa() {
  const { ok, data } = await api('GET', '/api/empresa/codigo');
  if (!ok) return;
  const el = document.getElementById('empresa-codigo-display');
  if (el) el.textContent = data.codigo;
  const nombre = document.getElementById('empresa-nombre-display');
  if (nombre) nombre.textContent = data.nombre;
}
