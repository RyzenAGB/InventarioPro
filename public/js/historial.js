// ============================================================
//  ProAlmacén  Historial de movimientos
// ============================================================

let historialData = [];

async function cargarHistorial() {
  const tbody = document.getElementById('tbody-historial');
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;"><span class="spinner"></span></td></tr>`;

  const { ok, data } = await api('GET', '/api/historial');
  if (!ok) { toast('Error al cargar historial', 'error'); return; }

  historialData = data.movimientos || [];
  renderHistorial(historialData);
}

function renderHistorial(lista) {
  const tbody = document.getElementById('tbody-historial');

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">
      <div class="empty-state">
        <div class="empty-icon">${icon('scroll-text', 'width:48px;height:48px;stroke-width:1')}</div>
        <p>No hay movimientos registrados an.</p>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(m => `
    <tr>
      <td class="text-sm text-muted">${formatFecha(m.fecha)}</td>
      <td>${badgeTipoMov(m.tipo)}</td>
      <td>
        <strong>${m.herramienta_nombre}</strong>
        <br><span class="text-sm text-muted">${m.herramienta_codigo}</span>
      </td>
      <td class="text-sm">${m.usuario_nombre}</td>
      <td class="text-sm text-muted">${m.detalle || ''}</td>
    </tr>
  `).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function filtrarHistorial() {
  const q    = document.getElementById('search-historial').value.toLowerCase();
  const tipo = document.getElementById('filtro-tipo-mov').value;

  const filtrada = historialData.filter(m => {
    const coincideTexto = !q ||
      m.herramienta_nombre.toLowerCase().includes(q) ||
      m.usuario_nombre.toLowerCase().includes(q);
    const coincideTipo = !tipo || m.tipo === tipo;
    return coincideTexto && coincideTipo;
  });

  renderHistorial(filtrada);
}
