// ============================================================
//  ProAlmacén — API Categorías, Historial, Dashboard, Usuarios
// ============================================================
const express   = require('express');
const { getDb } = require('../db/database');
const { verificarSesion, soloAdmin } = require('../middleware/auth');

// ══ CATEGORÍAS ════════════════════════════════════════════
const categorias = express.Router();
categorias.use(verificarSesion);

categorias.get('/', (req, res) => {
  const { almacen_id } = req.session.usuario;
  return res.json({
    ok: true,
    categorias: getDb().all('SELECT * FROM categorias WHERE almacen_id = ? AND activo = 1 ORDER BY nombre', [almacen_id])
  });
});

categorias.post('/', soloAdmin, (req, res) => {
  const { almacen_id } = req.session.usuario;
  const { nombre, descripcion } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'Nombre requerido' });
  const { lastInsertRowid: id } = getDb().run(
    'INSERT INTO categorias (almacen_id, nombre, descripcion) VALUES (?,?,?)',
    [almacen_id, nombre.trim(), descripcion?.trim() || null]
  );
  return res.status(201).json({ ok: true, id });
});

categorias.put('/:id', soloAdmin, (req, res) => {
  const db = getDb();
  const { almacen_id } = req.session.usuario;
  const { nombre, descripcion } = req.body;
  const cat = db.one('SELECT * FROM categorias WHERE id = ? AND almacen_id = ?', [req.params.id, almacen_id]);
  if (!cat) return res.status(404).json({ ok: false, mensaje: 'Categoría no encontrada' });
  db.run('UPDATE categorias SET nombre=?, descripcion=? WHERE id=?',
         [nombre?.trim() || cat.nombre, descripcion?.trim() || null, cat.id]);
  return res.json({ ok: true });
});

categorias.delete('/:id', soloAdmin, (req, res) => {
  const { almacen_id } = req.session.usuario;
  getDb().run('UPDATE categorias SET activo=0 WHERE id=? AND almacen_id=?', [req.params.id, almacen_id]);
  return res.json({ ok: true });
});

// ══ HISTORIAL ═════════════════════════════════════════════
const historial = express.Router();
historial.use(verificarSesion);

historial.get('/', (req, res) => {
  const { almacen_id, id: usuario_id, rol } = req.session.usuario;
  let sql = `
    SELECT m.*, h.nombre AS herramienta_nombre, h.codigo_unico AS herramienta_codigo,
           u.nombre_completo AS usuario_nombre
    FROM movimientos m
    JOIN herramientas h ON h.id = m.herramienta_id
    JOIN usuarios     u ON u.id = m.usuario_id
    WHERE h.almacen_id = ?`;
  const params = [almacen_id];

  if (rol === 'tecnico') { sql += ' AND m.usuario_id = ?'; params.push(usuario_id); }
  sql += ' ORDER BY m.fecha DESC LIMIT 500';

  return res.json({ ok: true, movimientos: getDb().all(sql, params) });
});

// ══ DASHBOARD ═════════════════════════════════════════════
const dashboard = express.Router();
dashboard.use(verificarSesion);

dashboard.get('/', (req, res) => {
  const db = getDb();
  const { almacen_id } = req.session.usuario;

  const stats = db.one(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN estado='disponible'        THEN 1 ELSE 0 END) AS disponibles,
            SUM(CASE WHEN estado='prestada'           THEN 1 ELSE 0 END) AS prestadas,
            SUM(CASE WHEN estado='en_reparacion'      THEN 1 ELSE 0 END) AS reparacion,
            SUM(CASE WHEN estado='fuera_de_servicio'  THEN 1 ELSE 0 END) AS fuera
     FROM herramientas WHERE almacen_id = ? AND activo = 1`,
    [almacen_id]
  );

  const recientes = db.all(
    `SELECT p.*, h.nombre AS herramienta_nombre, h.codigo_unico AS herramienta_codigo,
            t.nombre_completo AS tecnico_nombre
     FROM prestamos p
     JOIN herramientas h ON h.id = p.herramienta_id
     JOIN usuarios     t ON t.id = p.tecnico_id
     WHERE h.almacen_id = ? AND p.estatus = 'activo'
     ORDER BY p.fecha_salida DESC LIMIT 5`,
    [almacen_id]
  );

  return res.json({ ok: true, stats, recientes });
});

// ══ USUARIOS ══════════════════════════════════════════════
const usuarios = express.Router();
usuarios.use(verificarSesion);

usuarios.get('/', (req, res) => {
  const { almacen_id } = req.session.usuario;
  const { rol } = req.query;
  let sql = 'SELECT id, nombre_completo, correo, rol, activo, fecha_registro FROM usuarios WHERE almacen_id = ?';
  const params = [almacen_id];
  if (rol) { sql += ' AND rol = ?'; params.push(rol); }
  sql += ' ORDER BY nombre_completo';
  return res.json({ ok: true, usuarios: getDb().all(sql, params) });
});

usuarios.put('/:id', soloAdmin, (req, res) => {
  const db = getDb();
  const { almacen_id, id: adminId } = req.session.usuario;
  const { activo } = req.body;
  const u = db.one('SELECT * FROM usuarios WHERE id = ? AND almacen_id = ?', [req.params.id, almacen_id]);
  if (!u)          return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
  if (u.id === adminId) return res.status(400).json({ ok: false, mensaje: 'No puedes modificar tu propia cuenta' });
  db.run('UPDATE usuarios SET activo = ? WHERE id = ?', [activo, u.id]);
  return res.json({ ok: true });
});

// ══ EMPRESA ══════════════════════════════════════════════
const empresa = express.Router();
empresa.use(verificarSesion);

empresa.get('/codigo', (req, res) => {
  const { empresa_id } = req.session.usuario;
  const row = getDb().one('SELECT codigo_unico, nombre FROM empresas WHERE id = ?', [empresa_id]);
  if (!row) return res.status(404).json({ ok: false, mensaje: 'Empresa no encontrada' });
  return res.json({ ok: true, codigo: row.codigo_unico, nombre: row.nombre });
});

module.exports = { categorias, historial, dashboard, usuarios, empresa };

