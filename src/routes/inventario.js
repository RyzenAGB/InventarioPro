// ============================================================
//  ProAlmacén — API Inventario (herramientas + categorías)
// ============================================================
const express   = require('express');
const { getDb } = require('../db/database');
const { verificarSesion, soloAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verificarSesion);

// GET /api/inventario  →  listar herramientas del almacén
router.get('/', async (req, res) => {
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

  return res.json({ ok: true, herramientas: await db.all(sql, params) });
});

// GET /api/inventario/:id
router.get('/:id', async (req, res) => {
  const db = getDb();
  const { almacen_id } = req.session.usuario;
  const h = await db.one(
    `SELECT h.*, c.nombre AS categoria_nombre FROM herramientas h
     LEFT JOIN categorias c ON c.id = h.categoria_id
     WHERE h.id = ? AND h.almacen_id = ?`,
    [req.params.id, almacen_id]
  );
  if (!h) return res.status(404).json({ ok: false, mensaje: 'Herramienta no encontrada' });
  return res.json({ ok: true, herramienta: h });
});

// POST /api/inventario  →  crear (admin only)
router.post('/', soloAdmin, async (req, res) => {
  const db = getDb();
  const { almacen_id, id: usuario_id } = req.session.usuario;
  const { nombre, codigo_unico, marca, modelo, descripcion, estado, categoria_id, imagen } = req.body;

  if (!nombre?.trim() || !codigo_unico?.trim())
    return res.status(400).json({ ok: false, mensaje: 'Nombre y código son obligatorios' });

  const codigo = codigo_unico.toUpperCase().trim();
  if (await db.one('SELECT id FROM herramientas WHERE codigo_unico = ? AND almacen_id = ?', [codigo, almacen_id]))
    return res.status(409).json({ ok: false, mensaje: `Ya existe una herramienta con el código ${codigo}` });

  try {
    const id = await db.tx(async (t) => {
      const { lastInsertRowid } = await t.run(
        `INSERT INTO herramientas (almacen_id, categoria_id, nombre, codigo_unico, marca, modelo, descripcion, estado, imagen)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [almacen_id, categoria_id || null, nombre.trim(), codigo,
         marca?.trim() || null, modelo?.trim() || null, descripcion?.trim() || null, estado || 'disponible', imagen || null]
      );
      await t.run(
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
router.put('/:id', soloAdmin, async (req, res) => {
  const db = getDb();
  const { almacen_id, id: usuario_id } = req.session.usuario;
  const { nombre, codigo_unico, marca, modelo, descripcion, estado, categoria_id, imagen } = req.body;

  const h = await db.one('SELECT * FROM herramientas WHERE id = ? AND almacen_id = ?', [req.params.id, almacen_id]);
  if (!h) return res.status(404).json({ ok: false, mensaje: 'Herramienta no encontrada' });

  const codigo = codigo_unico ? codigo_unico.toUpperCase().trim() : h.codigo_unico;
  if (codigo !== h.codigo_unico &&
      await db.one('SELECT id FROM herramientas WHERE codigo_unico = ? AND almacen_id = ? AND id != ?',
             [codigo, almacen_id, h.id]))
    return res.status(409).json({ ok: false, mensaje: 'Código ya en uso' });

  try {
    await db.tx(async (t) => {
      await t.run(
        `UPDATE herramientas SET nombre=?, codigo_unico=?, marca=?, modelo=?, descripcion=?, estado=?, categoria_id=?, imagen=?
         WHERE id=?`,
        [nombre?.trim() || h.nombre, codigo, marca?.trim() || null, modelo?.trim() || null,
         descripcion?.trim() || null, estado || h.estado, categoria_id || null, imagen !== undefined ? imagen : h.imagen, h.id]
      );
      await t.run(
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
router.patch('/:id/estado', soloAdmin, async (req, res) => {
  const db = getDb();
  const { almacen_id, id: usuario_id } = req.session.usuario;
  const { estado } = req.body;

  const validos = ['disponible','en_reparacion','fuera_de_servicio'];
  if (!validos.includes(estado))
    return res.status(400).json({ ok: false, mensaje: 'Estado inválido' });

  const h = await db.one('SELECT * FROM herramientas WHERE id = ? AND almacen_id = ?', [req.params.id, almacen_id]);
  if (!h) return res.status(404).json({ ok: false, mensaje: 'Herramienta no encontrada' });
  if (h.estado === 'prestada')
    return res.status(400).json({ ok: false, mensaje: 'No se puede cambiar estado mientras está prestada' });

  const tipo = estado === 'fuera_de_servicio' ? 'baja' : 'reparacion';
  await db.tx(async (t) => {
    await t.run('UPDATE herramientas SET estado=? WHERE id=?', [estado, h.id]);
    await t.run(`INSERT INTO movimientos (herramienta_id, usuario_id, tipo, detalle) VALUES (?,?,?,?)`,
           [h.id, usuario_id, tipo, `Estado → ${estado}`]);
  });

  return res.json({ ok: true, mensaje: 'Estado actualizado' });
});

module.exports = router;
