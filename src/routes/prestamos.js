// ============================================================
//  ProAlmacén — API Préstamos y Devoluciones
// ============================================================
const express   = require('express');
const { getDb } = require('../db/database');
const { verificarSesion, soloAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verificarSesion);

// GET /api/prestamos
router.get('/', async (req, res) => {
  const db = getDb();
  const { almacen_id, id: usuario_id, rol } = req.session.usuario;

  let sql = `
    SELECT p.*,
           h.nombre        AS herramienta_nombre,
           h.codigo_unico  AS herramienta_codigo,
           t.nombre_completo AS tecnico_nombre,
           a.nombre_completo AS autorizado_nombre
    FROM prestamos p
    JOIN herramientas h ON h.id = p.herramienta_id
    JOIN usuarios     t ON t.id = p.tecnico_id
    JOIN usuarios     a ON a.id = p.autorizado_por
    WHERE h.almacen_id = ?`;
  const params = [almacen_id];

  if (rol === 'tecnico') { sql += ' AND p.tecnico_id = ?'; params.push(usuario_id); }
  sql += ' ORDER BY p.fecha_salida DESC';

  return res.json({ ok: true, prestamos: await db.all(sql, params) });
});

// POST /api/prestamos  →  registrar préstamo (admin only)
router.post('/', soloAdmin, async (req, res) => {
  const db = getDb();
  const { almacen_id, id: admin_id } = req.session.usuario;
  const { herramienta_id, tecnico_id, observaciones } = req.body;

  if (!herramienta_id || !tecnico_id)
    return res.status(400).json({ ok: false, mensaje: 'Herramienta y técnico son obligatorios' });

  const h = await db.one('SELECT * FROM herramientas WHERE id = ? AND almacen_id = ? AND activo = 1',
                   [herramienta_id, almacen_id]);
  if (!h) return res.status(404).json({ ok: false, mensaje: 'Herramienta no encontrada' });
  if (h.estado !== 'disponible')
    return res.status(400).json({ ok: false, mensaje: `La herramienta está "${h.estado}", no disponible` });

  const tecnico = await db.one('SELECT * FROM usuarios WHERE id = ? AND almacen_id = ? AND activo = 1',
                         [tecnico_id, almacen_id]);
  if (!tecnico) return res.status(404).json({ ok: false, mensaje: 'Técnico no encontrado' });

  try {
    const id = await db.tx(async (t) => {
      const { lastInsertRowid } = await t.run(
        `INSERT INTO prestamos (herramienta_id, tecnico_id, autorizado_por, observaciones)
         VALUES (?,?,?,?)`,
        [h.id, tecnico.id, admin_id, observaciones?.trim() || null]
      );
      await t.run("UPDATE herramientas SET estado = 'prestada' WHERE id = ?", [h.id]);
      await t.run(`INSERT INTO movimientos (herramienta_id, usuario_id, tipo, detalle) VALUES (?,?,'prestamo',?)`,
             [h.id, admin_id, `Prestada a ${tecnico.nombre_completo}`]);
      return lastInsertRowid;
    });
    return res.status(201).json({ ok: true, mensaje: 'Préstamo registrado', id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, mensaje: 'Error al registrar préstamo' });
  }
});

// PUT /api/prestamos/:id/devolver  →  registrar devolución (admin only)
router.put('/:id/devolver', soloAdmin, async (req, res) => {
  const db = getDb();
  const { almacen_id, id: admin_id } = req.session.usuario;

  const prestamo = await db.one(
    `SELECT p.*, h.almacen_id, h.nombre AS herramienta_nombre, t.nombre_completo AS tecnico_nombre
     FROM prestamos p
     JOIN herramientas h ON h.id = p.herramienta_id
     JOIN usuarios     t ON t.id = p.tecnico_id
     WHERE p.id = ?`,
    [req.params.id]
  );

  if (!prestamo)                         return res.status(404).json({ ok: false, mensaje: 'Préstamo no encontrado' });
  if (prestamo.almacen_id !== almacen_id) return res.status(403).json({ ok: false, mensaje: 'Sin acceso' });
  if (prestamo.estatus !== 'activo')      return res.status(400).json({ ok: false, mensaje: 'Este préstamo ya fue cerrado' });

  try {
    await db.tx(async (t) => {
      const ahora = new Date().toISOString();
      await t.run("UPDATE prestamos SET estatus='devuelto', fecha_devolucion=? WHERE id=?", [ahora, prestamo.id]);
      await t.run("UPDATE herramientas SET estado='disponible' WHERE id=?", [prestamo.herramienta_id]);
      await t.run(`INSERT INTO movimientos (herramienta_id, usuario_id, tipo, detalle) VALUES (?,?,'devolucion',?)`,
             [prestamo.herramienta_id, admin_id, `Devuelta por ${prestamo.tecnico_nombre}`]);
    });
    return res.json({ ok: true, mensaje: 'Devolución registrada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, mensaje: 'Error al registrar devolución' });
  }
});

module.exports = router;
