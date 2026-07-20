// ============================================================
//  ProAlmacén — API Inventario (herramientas + categorías)
// ============================================================
const express   = require('express');
const { getDb } = require('../db/database');
const { verificarSesion, soloAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verificarSesion);

// GET /api/inventario  →  listar herramientas del almacén
router.get('/', (req, res) => {
  const db = getDb();
  const { almacen_id } = req.session.usuario;
  const { estado } = req.query;

  let sql = `
    SELECT h.*, c.nombre AS categoria_nombre
    FROM herramientas h
    LEFT JOIN categorias c ON c.id = h.categoria_id
    WHERE h.almacen_id = ? AND h.activo = 1`;
  const params = [almacen_id];

  if (estado) { sql += ' AND h.estado = ?'; params.push(estado); }
  sql += ' ORDER BY h.nombre ASC';

  return res.json({ ok: true, herramientas: db.all(sql, params) });
});

// GET /api/inventario/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const { almacen_id } = req.session.usuario;
  const h = db.one(
    `SELECT h.*, c.nombre AS categoria_nombre FROM herramientas h
     LEFT JOIN categorias c ON c.id = h.categoria_id
     WHERE h.id = ? AND h.almacen_id = ?`,
    [req.params.id, almacen_id]
  );
  if (!h) return res.status(404).json({ ok: false, mensaje: 'Herramienta no encontrada' });
  return res.json({ ok: true, herramienta: h });
});

// POST /api/inventario  →  crear (admin only)
router.post('/', soloAdmin, (req, res) => {
  const db = getDb();
  const { almacen_id, id: usuario_id } = req.session.usuario;
  const { nombre, codigo_unico, marca, modelo, descripcion, estado, categoria_id } = req.body;

  if (!nombre?.trim() || !codigo_unico?.trim())
    return res.status(400).json({ ok: false, mensaje: 'Nombre y código son obligatorios' });

  const codigo = codigo_unico.toUpperCase().trim();
  if (db.one('SELECT id FROM herramientas WHERE codigo_unico = ? AND almacen_id = ?', [codigo, almacen_id]))
    return res.status(409).json({ ok: false, mensaje: `Ya existe una herramienta con el código ${codigo}` });

  try {
    const id = db.tx(() => {
      const { lastInsertRowid } = db.run(
        `INSERT INTO herramientas (almacen_id, categoria_id, nombre, codigo_unico, marca, modelo, descripcion, estado)
         VALUES (?,?,?,?,?,?,?,?)`,
        [almacen_id, categoria_id || null, nombre.trim(), codigo,
         marca?.trim() || null, modelo?.trim() || null, descripcion?.trim() || null, estado || 'disponible']
      );
      db.run(
        `INSERT INTO movimientos (herramienta_id, usuario_id, tipo, detalle) VALUES (?,?,'alta',?)`,
        [lastInsertRowid, usuario_id, `Alta: ${nombre.trim()}`]
      );
      return lastInsertRowid;
    });
    return res.status(201).json({ ok: true, mensaje: 'Herramienta registrada', id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, mensaje: 'Error al registrar herramienta' });
  }
});

// PUT /api/inventario/:id  →  editar (admin only)
router.put('/:id', soloAdmin, (req, res) => {
  const db = getDb();
  const { almacen_id, id: usuario_id } = req.session.usuario;
  const { nombre, codigo_unico, marca, modelo, descripcion, estado, categoria_id } = req.body;

  const h = db.one('SELECT * FROM herramientas WHERE id = ? AND almacen_id = ?', [req.params.id, almacen_id]);
  if (!h) return res.status(404).json({ ok: false, mensaje: 'Herramienta no encontrada' });

  const codigo = codigo_unico ? codigo_unico.toUpperCase().trim() : h.codigo_unico;
  if (codigo !== h.codigo_unico &&
      db.one('SELECT id FROM herramientas WHERE codigo_unico = ? AND almacen_id = ? AND id != ?',
             [codigo, almacen_id, h.id]))
    return res.status(409).json({ ok: false, mensaje: 'Código ya en uso' });

  try {
    db.tx(() => {
      db.run(
        `UPDATE herramientas SET nombre=?, codigo_unico=?, marca=?, modelo=?, descripcion=?, estado=?, categoria_id=?
         WHERE id=?`,
        [nombre?.trim() || h.nombre, codigo, marca?.trim() || null, modelo?.trim() || null,
         descripcion?.trim() || null, estado || h.estado, categoria_id || null, h.id]
      );
      db.run(
        `INSERT INTO movimientos (herramienta_id, usuario_id, tipo, detalle) VALUES (?,?,'edicion',?)`,
        [h.id, usuario_id, `Edición: ${nombre || h.nombre}`]
      );
    });
    return res.json({ ok: true, mensaje: 'Herramienta actualizada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, mensaje: 'Error al actualizar' });
  }
});

// PATCH /api/inventario/:id/estado  →  cambiar estado (admin only)
router.patch('/:id/estado', soloAdmin, (req, res) => {
  const db = getDb();
  const { almacen_id, id: usuario_id } = req.session.usuario;
  const { estado } = req.body;

  const validos = ['disponible','en_reparacion','fuera_de_servicio'];
  if (!validos.includes(estado))
    return res.status(400).json({ ok: false, mensaje: 'Estado inválido' });

  const h = db.one('SELECT * FROM herramientas WHERE id = ? AND almacen_id = ?', [req.params.id, almacen_id]);
  if (!h) return res.status(404).json({ ok: false, mensaje: 'Herramienta no encontrada' });
  if (h.estado === 'prestada')
    return res.status(400).json({ ok: false, mensaje: 'No se puede cambiar estado mientras está prestada' });

  const tipo = estado === 'fuera_de_servicio' ? 'baja' : 'reparacion';
  db.tx(() => {
    db.run('UPDATE herramientas SET estado=? WHERE id=?', [estado, h.id]);
    db.run(`INSERT INTO movimientos (herramienta_id, usuario_id, tipo, detalle) VALUES (?,?,?,?)`,
           [h.id, usuario_id, tipo, `Estado → ${estado}`]);
  });

  return res.json({ ok: true, mensaje: 'Estado actualizado' });
});

module.exports = router;
