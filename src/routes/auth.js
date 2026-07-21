// ============================================================
//  ProAlmacén — Rutas de autenticación
// ============================================================
const express   = require('express');
const bcrypt    = require('bcryptjs');
const { getDb } = require('../db/database');

const router = express.Router();

// ── LOGIN ─────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { correo, contrasena } = req.body;
  if (!correo || !contrasena)
    return res.status(400).json({ ok: false, mensaje: 'Correo y contraseña son requeridos' });

  const db   = getDb();
  const user = await db.one(
    `SELECT u.*, e.nombre AS empresa_nombre, a.nombre AS almacen_nombre
     FROM usuarios u
     JOIN empresas e ON e.id = u.empresa_id
     JOIN almacenes a ON a.id = u.almacen_id
     WHERE u.correo = ? AND u.activo = 1`,
    [correo.toLowerCase().trim()]
  );

  if (!user || !bcrypt.compareSync(contrasena, user.contrasena_hash))
    return res.status(401).json({ ok: false, mensaje: 'Credenciales incorrectas' });

  req.session.usuario = {
    id:              user.id,
    nombre_completo: user.nombre_completo,
    correo:          user.correo,
    rol:             user.rol,
    empresa_id:      user.empresa_id,
    empresa_nombre:  user.empresa_nombre,
    almacen_id:      user.almacen_id,
    almacen_nombre:  user.almacen_nombre,
  };

  return res.json({ ok: true, mensaje: 'Sesión iniciada', usuario: req.session.usuario });
});

// ── LOGOUT ────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true, mensaje: 'Sesión cerrada' }));
});

// ── SESIÓN ACTUAL ─────────────────────────────────────────
router.get('/me', (req, res) => {
  if (req.session && req.session.usuario)
    return res.json({ ok: true, usuario: req.session.usuario });
  return res.status(401).json({ ok: false, mensaje: 'No hay sesión activa' });
});

// ── REGISTRO: crear empresa + almacén + admin ─────────────
router.post('/registro', async (req, res) => {
  const { nombre_empresa, nombre_almacen, nombre_completo, correo, contrasena } = req.body;
  if (!nombre_empresa || !nombre_almacen || !nombre_completo || !correo || !contrasena)
    return res.status(400).json({ ok: false, mensaje: 'Todos los campos son requeridos' });
  if (contrasena.length < 6)
    return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 6 caracteres' });

  const db = getDb();
  if (await db.one('SELECT id FROM usuarios WHERE correo = ?', [correo.toLowerCase().trim()]))
    return res.status(409).json({ ok: false, mensaje: 'Ya existe una cuenta con ese correo' });

  const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    const result = await db.tx(async (t) => {
      const { lastInsertRowid: empId } = await t.run(
        'INSERT INTO empresas (nombre, codigo_unico) VALUES (?,?)',
        [nombre_empresa.trim(), codigo]
      );
      const { lastInsertRowid: almId } = await t.run(
        'INSERT INTO almacenes (empresa_id, nombre) VALUES (?,?)',
        [empId, nombre_almacen.trim()]
      );
      const hash = bcrypt.hashSync(contrasena, 10);
      await t.run(
        'INSERT INTO usuarios (empresa_id, almacen_id, nombre_completo, correo, contrasena_hash, rol) VALUES (?,?,?,?,?,?)',
        [empId, almId, nombre_completo.trim(), correo.toLowerCase().trim(), hash, 'admin']
      );
      return codigo;
    });
    return res.status(201).json({ ok: true, mensaje: 'Cuenta creada', codigo_empresa: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, mensaje: 'Error al crear la cuenta' });
  }
});

// ── UNIRSE a almacén existente ────────────────────────────
router.post('/unirse', async (req, res) => {
  const { codigo_empresa, nombre_completo, correo, contrasena } = req.body;
  if (!codigo_empresa || !nombre_completo || !correo || !contrasena)
    return res.status(400).json({ ok: false, mensaje: 'Todos los campos son requeridos' });

  const db = getDb();
  const empresa = await db.one('SELECT * FROM empresas WHERE codigo_unico = ? AND activo = 1',
                         [codigo_empresa.toUpperCase().trim()]);
  if (!empresa) return res.status(404).json({ ok: false, mensaje: 'Código de empresa inválido' });

  if (await db.one('SELECT id FROM usuarios WHERE correo = ?', [correo.toLowerCase().trim()]))
    return res.status(409).json({ ok: false, mensaje: 'Ya existe una cuenta con ese correo' });

  const almacen = await db.one('SELECT * FROM almacenes WHERE empresa_id = ? AND activo = 1', [empresa.id]);
  if (!almacen) return res.status(404).json({ ok: false, mensaje: 'No se encontró almacén activo' });

  const hash = bcrypt.hashSync(contrasena, 10);
  await db.run(
    'INSERT INTO usuarios (empresa_id, almacen_id, nombre_completo, correo, contrasena_hash, rol) VALUES (?,?,?,?,?,?)',
    [empresa.id, almacen.id, nombre_completo.trim(), correo.toLowerCase().trim(), hash, 'tecnico']
  );

  return res.status(201).json({ ok: true, mensaje: 'Te has unido al almacén exitosamente' });
});

module.exports = router;
