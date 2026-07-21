// ============================================================
//  ProAlmacén — API Solicitudes de Herramientas
//  Técnico solicita → Admin aprueba/rechaza → SSE notifica
// ============================================================
const express   = require('express');
const { getDb } = require('../db/database');
const { verificarSesion, soloAdmin } = require('../middleware/auth');
const { broadcast } = require('./sse');

const router = express.Router();
router.use(verificarSesion);

// ── GET /api/solicitudes  ─────────────────────────────────
// Admin ve todas del almacén. Técnico ve solo las suyas.
router.get('/', async (req, res) => {
  const db = getDb();
  const { almacen_id, id: usuario_id, rol } = req.session.usuario;

  let sql = `
    SELECT s.*,
           h.nombre        AS herramienta_nombre,
           h.codigo_unico  AS herramienta_codigo,
           h.estado        AS herramienta_estado,
           t.nombre_completo AS tecnico_nombre,
           r.nombre_completo AS respondido_nombre
    FROM solicitudes s
    JOIN herramientas h ON h.id = s.herramienta_id
    JOIN usuarios     t ON t.id = s.tecnico_id
    LEFT JOIN usuarios r ON r.id = s.respondido_por
    WHERE h.almacen_id = ?`;

  const params = [almacen_id];
  if (rol === 'tecnico') { sql += ' AND s.tecnico_id = ?'; params.push(usuario_id); }
  sql += ' ORDER BY s.fecha_solicitud DESC';

  return res.json({ ok: true, solicitudes: await db.all(sql, params) });
});

// ── GET /api/solicitudes/pendientes/count ─────────────────
router.get('/pendientes/count', async (req, res) => {
  const db = getDb();
  const { almacen_id, id: usuario_id, rol } = req.session.usuario;

  let sql = `
    SELECT COUNT(*) AS total FROM solicitudes s
    JOIN herramientas h ON h.id = s.herramienta_id
    WHERE h.almacen_id = ? AND s.estado = 'pendiente'`;
  const params = [almacen_id];

  // El técnico solo ve sus propias solicitudes pendientes en su badge
  if (rol === 'tecnico') { sql += ' AND s.tecnico_id = ?'; params.push(usuario_id); }

  const row = await db.one(sql, params);
  return res.json({ ok: true, total: row?.total ?? 0 });
});

// ── POST /api/solicitudes  ────────────────────────────────
// Técnico (o admin) crea una solicitud
router.post('/', async (req, res) => {
  const db = getDb();
  const { almacen_id, id: tecnico_id } = req.session.usuario;
  const { herramienta_id, observaciones } = req.body;

  if (!herramienta_id)
    return res.status(400).json({ ok: false, mensaje: 'Herramienta requerida' });

  const h = await db.one(
    'SELECT * FROM herramientas WHERE id = ? AND almacen_id = ? AND activo = 1',
    [herramienta_id, almacen_id]
  );
  if (!h)
    return res.status(404).json({ ok: false, mensaje: 'Herramienta no encontrada' });
  if (h.estado !== 'disponible')
    return res.status(400).json({ ok: false, mensaje: `La herramienta está "${h.estado}", no disponible` });

  // Verificar que no hay solicitud pendiente para esta herramienta
  const pendiente = await db.one(
    `SELECT id FROM solicitudes WHERE herramienta_id = ? AND estado = 'pendiente'`,
    [herramienta_id]
  );
  if (pendiente)
    return res.status(400).json({ ok: false, mensaje: 'Ya hay una solicitud pendiente para esta herramienta' });

  try {
    const { lastInsertRowid: id } = await db.run(
      `INSERT INTO solicitudes (herramienta_id, tecnico_id, observaciones) VALUES (?,?,?)`,
      [h.id, tecnico_id, observaciones?.trim() || null]
    );

    await db.run(
      `INSERT INTO movimientos (herramienta_id, usuario_id, tipo, detalle) VALUES (?,?,'solicitud',?)`,
      [h.id, tecnico_id, `Solicitud enviada por técnico`]
    );

    // Notificar vía SSE a todos en el almacén
    const tecnico = await db.one('SELECT nombre_completo FROM usuarios WHERE id = ?', [tecnico_id]);
    broadcast(almacen_id, 'solicitud_nueva', {
      id,
      herramienta_nombre: h.nombre,
      herramienta_codigo: h.codigo_unico,
      tecnico_nombre: tecnico?.nombre_completo,
    });

    return res.status(201).json({ ok: true, mensaje: 'Solicitud enviada', id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, mensaje: 'Error al crear solicitud' });
  }
});

// ── PUT /api/solicitudes/:id/aprobar  ─────────────────────
router.put('/:id/aprobar', soloAdmin, async (req, res) => {
  const db = getDb();
  const { almacen_id, id: admin_id } = req.session.usuario;
  const { respuesta } = req.body;

  const sol = await db.one(
    `SELECT s.*, h.almacen_id, h.nombre AS h_nombre, h.codigo_unico AS h_codigo,
            h.estado, t.nombre_completo AS tecnico_nombre
     FROM solicitudes s
     JOIN herramientas h ON h.id = s.herramienta_id
     JOIN usuarios     t ON t.id = s.tecnico_id
     WHERE s.id = ?`,
    [req.params.id]
  );

  if (!sol) return res.status(404).json({ ok: false, mensaje: 'Solicitud no encontrada' });
  if (sol.almacen_id !== almacen_id) return res.status(403).json({ ok: false, mensaje: 'Sin acceso' });
  if (sol.estado !== 'pendiente') return res.status(400).json({ ok: false, mensaje: 'La solicitud ya fue resuelta' });
  if (sol.estado_herramienta !== undefined && sol.estado !== 'disponible') {
    // Re-check herramienta
  }

  try {
    const prestamoId = await db.tx(async (t) => {
      const ahora = new Date().toISOString();
      // Actualizar solicitud
      await t.run(
        `UPDATE solicitudes SET estado='aprobada', respondido_por=?, respuesta=?, fecha_respuesta=? WHERE id=?`,
        [admin_id, respuesta?.trim() || null, ahora, sol.id]
      );
      // Crear préstamo
      const { lastInsertRowid } = await t.run(
        `INSERT INTO prestamos (herramienta_id, tecnico_id, autorizado_por, observaciones)
         VALUES (?,?,?,?)`,
        [sol.herramienta_id, sol.tecnico_id, admin_id, sol.observaciones]
      );
      // Cambiar estado herramienta
      await t.run(`UPDATE herramientas SET estado='prestada' WHERE id=?`, [sol.herramienta_id]);
      // Movimiento
      await t.run(
        `INSERT INTO movimientos (herramienta_id, usuario_id, tipo, detalle) VALUES (?,?,'solicitud_aprobada',?)`,
        [sol.herramienta_id, admin_id, `Solicitud aprobada → Préstamo a ${sol.tecnico_nombre}`]
      );
      return lastInsertRowid;
    });

    broadcast(almacen_id, 'solicitud_resuelta', {
      solicitud_id: sol.id,
      estado: 'aprobada',
      herramienta_nombre: sol.h_nombre,
      tecnico_nombre: sol.tecnico_nombre,
      prestamo_id: prestamoId,
    });

    return res.json({ ok: true, mensaje: 'Solicitud aprobada y préstamo registrado', prestamo_id: prestamoId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, mensaje: 'Error al aprobar solicitud' });
  }
});

// ── PUT /api/solicitudes/:id/rechazar  ────────────────────
router.put('/:id/rechazar', soloAdmin, async (req, res) => {
  const db = getDb();
  const { almacen_id, id: admin_id } = req.session.usuario;
  const { respuesta } = req.body;

  const sol = await db.one(
    `SELECT s.*, h.almacen_id, h.nombre AS h_nombre, t.nombre_completo AS tecnico_nombre
     FROM solicitudes s
     JOIN herramientas h ON h.id = s.herramienta_id
     JOIN usuarios     t ON t.id = s.tecnico_id
     WHERE s.id = ?`,
    [req.params.id]
  );

  if (!sol) return res.status(404).json({ ok: false, mensaje: 'Solicitud no encontrada' });
  if (sol.almacen_id !== almacen_id) return res.status(403).json({ ok: false, mensaje: 'Sin acceso' });
  if (sol.estado !== 'pendiente') return res.status(400).json({ ok: false, mensaje: 'La solicitud ya fue resuelta' });

  const ahora = new Date().toISOString();
  await db.run(
    `UPDATE solicitudes SET estado='rechazada', respondido_por=?, respuesta=?, fecha_respuesta=? WHERE id=?`,
    [admin_id, respuesta?.trim() || null, ahora, sol.id]
  );
  await db.run(
    `INSERT INTO movimientos (herramienta_id, usuario_id, tipo, detalle) VALUES (?,?,'solicitud_rechazada',?)`,
    [sol.herramienta_id, admin_id, `Solicitud rechazada${respuesta ? ': ' + respuesta : ''}`]
  );

  broadcast(almacen_id, 'solicitud_resuelta', {
    solicitud_id: sol.id,
    estado: 'rechazada',
    herramienta_nombre: sol.h_nombre,
    tecnico_nombre: sol.tecnico_nombre,
    respuesta: respuesta?.trim() || null,
  });

  return res.json({ ok: true, mensaje: 'Solicitud rechazada' });
});

// ── PUT /api/solicitudes/:id/cancelar  ───────────────────
// Solo el técnico que la creó puede cancelarla
router.put('/:id/cancelar', async (req, res) => {
  const db = getDb();
  const { almacen_id, id: usuario_id, rol } = req.session.usuario;

  const sol = await db.one(
    `SELECT s.*, h.almacen_id, h.nombre AS h_nombre
     FROM solicitudes s
     JOIN herramientas h ON h.id = s.herramienta_id
     WHERE s.id = ?`,
    [req.params.id]
  );

  if (!sol) return res.status(404).json({ ok: false, mensaje: 'Solicitud no encontrada' });
  if (sol.almacen_id !== almacen_id) return res.status(403).json({ ok: false, mensaje: 'Sin acceso' });
  if (sol.estado !== 'pendiente') return res.status(400).json({ ok: false, mensaje: 'Solo se pueden cancelar solicitudes pendientes' });
  // Técnico solo puede cancelar sus propias. Admin puede cancelar cualquiera.
  if (rol === 'tecnico' && sol.tecnico_id !== usuario_id)
    return res.status(403).json({ ok: false, mensaje: 'No puedes cancelar solicitudes de otros técnicos' });

  const ahora = new Date().toISOString();
  await db.run(
    `UPDATE solicitudes SET estado='cancelada', fecha_respuesta=? WHERE id=?`,
    [ahora, sol.id]
  );
  await db.run(
    `INSERT INTO movimientos (herramienta_id, usuario_id, tipo, detalle) VALUES (?,?,'solicitud_cancelada',?)`,
    [sol.herramienta_id, usuario_id, 'Solicitud cancelada por el técnico']
  );

  broadcast(almacen_id, 'solicitud_cancelada', {
    solicitud_id: sol.id,
    herramienta_nombre: sol.h_nombre,
  });

  return res.json({ ok: true, mensaje: 'Solicitud cancelada' });
});

module.exports = router;
