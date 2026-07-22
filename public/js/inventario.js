// ============================================================
//  ProAlmacén  Inventario: CRUD de herramientas
// ============================================================

let herramientasData = [];
let categoriasData   = [];
let imagenBase64     = null;

// ── Cargar inventario ─────────────────────────────────────
async function cargarInventario() {
  const tbody = document.getElementById('tbody-inventario');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;"><span class="spinner"></span></td></tr>`;

  const [resInv, resCat] = await Promise.all([
    api('GET', '/api/inventario'),
    api('GET', '/api/categorias'),
  ]);

  if (!resInv.ok) { toast('Error al cargar inventario', 'error'); return; }

  herramientasData = resInv.data.herramientas || [];
  categoriasData   = resCat.data.categorias   || [];

  // Poblar filtro de categoría
  const select = document.getElementById('filtro-categoria');
  select.innerHTML = '<option value="">Todas las categorías</option>' +
    categoriasData.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

  // Poblar select del modal
  const modalCat = document.getElementById('h-categoria');
  if (modalCat) {
    modalCat.innerHTML = '<option value="">Sin categoría</option>' +
      categoriasData.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  }

  renderInventario(herramientasData);
}

function renderInventario(lista) {
  const tbody = document.getElementById('tbody-inventario');
  const esAdmin = usuarioActual?.rol === 'admin';

  document.getElementById('count-inventario').textContent =
    `${lista.length} herramienta${lista.length !== 1 ? 's' : ''}`;

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <p>No hay herramientas. Agrega la primera.</p>
        ${esAdmin ? '<button class="btn btn-primary btn-sm" onclick="abrirModalHerramienta()">+ Nueva herramienta</button>' : ''}
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(h => `
    <tr>
      <td>${h.imagen ? `<img src="${h.imagen}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border);">` : `<div style="width: 40px; height: 40px; border-radius: 4px; background: var(--surface-2); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">🛠️</div>`}</td>
      <td><code style="font-size:.8rem;background:var(--surface-2);padding:.15rem .4rem;border-radius:4px;">${h.codigo_unico}</code></td>
      <td>
        <strong>${h.nombre}</strong>
        ${h.descripcion ? `<br><span class="text-sm text-muted">${h.descripcion.substring(0,60)}${h.descripcion.length>60?'…':''}</span>` : ''}
      </td>
      <td class="text-sm">${h.marca || ''}${h.modelo ? ' / ' + h.modelo : ''}</td>
      <td class="text-sm text-muted">${h.categoria_nombre || ''}</td>
      <td>${badgeEstado(h.estado)}</td>
      <td class="admin-only" style="${!esAdmin ? 'display:none' : ''}">
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" onclick='editarHerramienta(${JSON.stringify(h).replace(/'/g,"\\'")})'
                  title="Editar">${icon('pencil')}</button>
          ${h.estado !== 'fuera_de_servicio' ? `
            <button class="btn btn-ghost btn-sm" onclick="cambiarEstadoHerramienta(${h.id}, 'fuera_de_servicio')"
                    title="Dar de baja">${icon('trash-2')}</button>` : `
            <button class="btn btn-ghost btn-sm" onclick="cambiarEstadoHerramienta(${h.id}, 'disponible')"
                    title="Reactivar">${icon('refresh-cw')}</button>`}
        </div>
      </td>
    </tr>
  `).join('');

  // Ocultar columna admin si no es admin
  if (!esAdmin) {
    document.querySelectorAll('#tbody-inventario .admin-only').forEach(el => el.style.display = 'none');
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Filtrar inventario en tiempo real ─────────────────────
function filtrarInventario() {
  const q       = document.getElementById('search-inventario').value.toLowerCase();
  const catId   = document.getElementById('filtro-categoria').value;
  const estado  = document.getElementById('filtro-estado').value;

  const filtrada = herramientasData.filter(h => {
    const coincideTexto = !q ||
      h.nombre.toLowerCase().includes(q)      ||
      h.codigo_unico.toLowerCase().includes(q)||
      (h.marca  && h.marca.toLowerCase().includes(q)) ||
      (h.modelo && h.modelo.toLowerCase().includes(q));

    const coincideCat   = !catId  || String(h.categoria_id) === catId;
    const coincideEstado= !estado || h.estado === estado;

    return coincideTexto && coincideCat && coincideEstado;
  });

  renderInventario(filtrada);
}

// ── Abrir modal para nueva herramienta ────────────────────
function abrirModalHerramienta() {
  document.getElementById('modal-herramienta-titulo').textContent = 'Nueva herramienta';
  document.getElementById('h-id').value       = '';
  document.getElementById('h-nombre').value   = '';
  document.getElementById('h-codigo').value   = '';
  document.getElementById('h-marca').value    = '';
  document.getElementById('h-modelo').value   = '';
  document.getElementById('h-descripcion').value = '';
  document.getElementById('h-estado').value   = 'disponible';
  document.getElementById('h-categoria').value = '';
  eliminarImagen();
  limpiarError('err-herramienta');
  abrirModal('modal-herramienta');
}

// ── Abrir modal para editar herramienta ───────────────────
function editarHerramienta(h) {
  document.getElementById('modal-herramienta-titulo').textContent = 'Editar herramienta';
  document.getElementById('h-id').value          = h.id;
  document.getElementById('h-nombre').value      = h.nombre;
  document.getElementById('h-codigo').value      = h.codigo_unico;
  document.getElementById('h-marca').value       = h.marca || '';
  document.getElementById('h-modelo').value      = h.modelo || '';
  document.getElementById('h-descripcion').value = h.descripcion || '';
  document.getElementById('h-estado').value      = h.estado;
  document.getElementById('h-categoria').value   = h.categoria_id || '';
  
  if (h.imagen) {
    imagenBase64 = h.imagen;
    document.getElementById('h-imagen-preview').src = h.imagen;
    document.getElementById('h-imagen-preview-container').style.display = 'block';
  } else {
    eliminarImagen();
  }
  
  limpiarError('err-herramienta');
  abrirModal('modal-herramienta');
}

// ── Guardar herramienta (crear o editar) ──────────────────
async function guardarHerramienta() {
  limpiarError('err-herramienta');

  const id = document.getElementById('h-id').value;
  const body = {
    nombre:       document.getElementById('h-nombre').value.trim(),
    codigo_unico: document.getElementById('h-codigo').value.trim().toUpperCase(),
    marca:        document.getElementById('h-marca').value.trim(),
    modelo:       document.getElementById('h-modelo').value.trim(),
    descripcion:  document.getElementById('h-descripcion').value.trim(),
    estado:       document.getElementById('h-estado').value,
    categoria_id: document.getElementById('h-categoria').value || null,
    imagen:       imagenBase64
  };

  if (!body.nombre || !body.codigo_unico) {
    mostrarError('err-herramienta', 'Nombre y código son obligatorios.');
    return;
  }

  const btn = document.getElementById('btn-guardar-herramienta');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  let res;
  if (id) {
    res = await api('PUT', `/api/inventario/${id}`, body);
  } else {
    res = await api('POST', '/api/inventario', body);
  }

  btn.disabled = false;
  btn.textContent = 'Guardar';

  if (res.ok) {
    toast(id ? 'Herramienta actualizada' : 'Herramienta registrada', 'success');
    cerrarModal('modal-herramienta');
    cargarInventario();
    cargarDashboard();
  } else {
    mostrarError('err-herramienta', res.data.mensaje || 'Error al guardar');
  }
}

// ── Cambiar estado de herramienta ─────────────────────────
async function cambiarEstadoHerramienta(id, nuevoEstado) {
  const confirmaciones = {
    fuera_de_servicio: '¿Dar de baja esta herramienta?',
    disponible:        '¿Reactivar esta herramienta?',
    en_reparacion:     '¿Marcar como en reparación?',
  };
  if (!confirm(confirmaciones[nuevoEstado] || '¿Confirmar?')) return;

  const { ok, data } = await api('PATCH', `/api/inventario/${id}/estado`, { estado: nuevoEstado });
  if (ok) {
    toast('Estado actualizado', 'success');
    cargarInventario();
    cargarDashboard();
  } else {
    toast(data.mensaje || 'Error', 'error');
  }
}

// ── Categorías ────────────────────────────────────────────
async function cargarCategorias() {
  const tbody = document.getElementById('tbody-categorias');
  const { ok, data } = await api('GET', '/api/categorias');
  if (!ok) return;

  const cats = data.categorias || [];
  if (cats.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><div class="empty-icon">${icon('tag', 'width:48px;height:48px;stroke-width:1')}</div><p>No hay categorías</p></div></td></tr>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  tbody.innerHTML = cats.map(c => `
    <tr>
      <td><strong>${c.nombre}</strong></td>
      <td class="text-sm text-muted">${c.descripcion || ''}</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" onclick='editarCategoria(${JSON.stringify(c)})'>✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="eliminarCategoria(${c.id})">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function abrirModalCategoria() {
  document.getElementById('modal-cat-titulo').textContent = 'Nueva categoría';
  document.getElementById('cat-id').value    = '';
  document.getElementById('cat-nombre').value = '';
  document.getElementById('cat-desc').value  = '';
  limpiarError('err-categoria');
  abrirModal('modal-categoria');
}

function editarCategoria(cat) {
  document.getElementById('modal-cat-titulo').textContent = 'Editar categoría';
  document.getElementById('cat-id').value     = cat.id;
  document.getElementById('cat-nombre').value = cat.nombre;
  document.getElementById('cat-desc').value   = cat.descripcion || '';
  limpiarError('err-categoria');
  abrirModal('modal-categoria');
}

async function guardarCategoria() {
  limpiarError('err-categoria');
  const id = document.getElementById('cat-id').value;
  const body = {
    nombre:      document.getElementById('cat-nombre').value.trim(),
    descripcion: document.getElementById('cat-desc').value.trim(),
  };
  if (!body.nombre) { mostrarError('err-categoria', 'El nombre es obligatorio.'); return; }

  const res = id
    ? await api('PUT',  `/api/categorias/${id}`, body)
    : await api('POST', '/api/categorias', body);

  if (res.ok) {
    toast(id ? 'Categoría actualizada' : 'Categoría creada', 'success');
    cerrarModal('modal-categoria');
    cargarCategorias();
    cargarInventario();
  } else {
    mostrarError('err-categoria', res.data.mensaje || 'Error al guardar');
  }
}

async function eliminarCategoria(id) {
  if (!confirm('¿Eliminar esta categoría? Las herramientas quedarán sin categoría.')) return;
  const { ok, data } = await api('DELETE', `/api/categorias/${id}`);
  if (ok) { toast('Categoría eliminada', 'success'); cargarCategorias(); }
  else     toast(data.mensaje || 'Error', 'error');
}

// ── Manejo de Imagen ───────────────────────────────────────
function previsualizarImagen(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600;
      const MAX_HEIGHT = 600;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height = Math.round(height * (MAX_WIDTH / width));
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width = Math.round(width * (MAX_HEIGHT / height));
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      imagenBase64 = canvas.toDataURL('image/webp', 0.8);
      document.getElementById('h-imagen-preview').src = imagenBase64;
      document.getElementById('h-imagen-preview-container').style.display = 'block';
    }
    img.src = event.target.result;
  }
  reader.readAsDataURL(file);
}

function eliminarImagen() {
  imagenBase64 = null;
  const input = document.getElementById('h-imagen');
  if (input) input.value = '';
  const preview = document.getElementById('h-imagen-preview');
  if (preview) preview.src = '';
  const container = document.getElementById('h-imagen-preview-container');
  if (container) container.style.display = 'none';
}
