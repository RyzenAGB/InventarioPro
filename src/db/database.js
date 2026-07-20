// ============================================================
//  ProAlmacén — Base de datos con sql.js (SQLite en WASM)
//  Diseño simple: funciones globales en lugar de wrapper OOP
// ============================================================
const initSqlJs = require('sql.js');
const fs        = require('fs');
const path      = require('path');
const bcrypt    = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', '..', 'proalmacen.db');

let _db = null;   // instancia sql.js Database
let _inTx = false; // bandera de transacción activa

// ── Persistir en disco ────────────────────────────────────
function save() {
  if (_inTx) return; // no guardar en medio de una TX
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Helpers de query ──────────────────────────────────────
function all(sql, params) {
  const res = _db.exec(sql, params);
  if (!res[0]) return [];
  const { columns, values } = res[0];
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

function one(sql, params) {
  return all(sql, params)[0] ?? null;
}

function run(sql, params) {
  _db.run(sql, params);
  if (!_inTx) save();
  const row = one('SELECT last_insert_rowid() AS lid');
  return { lastInsertRowid: row?.lid ?? 0 };
}

// ── Objeto de acceso a datos ──────────────────────────────
const db = {
  all,
  one,
  run,

  /** Ejecuta una función dentro de BEGIN/COMMIT con rollback en error */
  tx(fn) {
    _db.run('BEGIN');
    _inTx = true;
    try {
      const result = fn();
      _db.run('COMMIT');
      _inTx = false;
      save();
      return result;
    } catch (err) {
      _db.run('ROLLBACK');
      _inTx = false;
      throw err;
    }
  },
};

// ── Inicializar (async, llamar una sola vez al arrancar) ──
async function initDb() {
  if (_db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    _db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    _db = new SQL.Database();
  }

  _db.run('PRAGMA foreign_keys = ON');

  _crearTablas();
  _seedAdmin();

  return db;
}

function getDb() {
  if (!_db) throw new Error('DB no inicializada. Llama a initDb() primero.');
  return db;
}

// ── Crear esquema ─────────────────────────────────────────
function _crearTablas() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS empresas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      codigo_unico TEXT NOT NULL UNIQUE,
      activo INTEGER NOT NULL DEFAULT 1,
      fecha_creacion TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS almacenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      ubicacion TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      fecha_creacion TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      almacen_id INTEGER NOT NULL,
      nombre_completo TEXT NOT NULL,
      correo TEXT NOT NULL UNIQUE,
      contrasena_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('admin','tecnico')),
      activo INTEGER NOT NULL DEFAULT 1,
      fecha_registro TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      almacen_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      activo INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS herramientas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      almacen_id INTEGER NOT NULL,
      categoria_id INTEGER,
      nombre TEXT NOT NULL,
      codigo_unico TEXT NOT NULL UNIQUE,
      marca TEXT,
      modelo TEXT,
      estado TEXT NOT NULL DEFAULT 'disponible'
        CHECK(estado IN ('disponible','prestada','en_reparacion','fuera_de_servicio')),
      descripcion TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      fecha_alta TEXT NOT NULL DEFAULT (datetime('now')),
      fecha_baja TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS prestamos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      herramienta_id INTEGER NOT NULL,
      tecnico_id INTEGER NOT NULL,
      autorizado_por INTEGER NOT NULL,
      fecha_salida TEXT NOT NULL DEFAULT (datetime('now')),
      fecha_devolucion TEXT,
      estatus TEXT NOT NULL DEFAULT 'activo'
        CHECK(estatus IN ('activo','devuelto','vencido')),
      observaciones TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      herramienta_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      tipo TEXT NOT NULL
        CHECK(tipo IN ('prestamo','devolucion','alta','baja','edicion','reparacion','solicitud','solicitud_aprobada','solicitud_rechazada','solicitud_cancelada')),
      fecha TEXT NOT NULL DEFAULT (datetime('now')),
      detalle TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS solicitudes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      herramienta_id INTEGER NOT NULL,
      tecnico_id INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente'
        CHECK(estado IN ('pendiente','aprobada','rechazada','cancelada')),
      observaciones TEXT,
      respuesta TEXT,
      respondido_por INTEGER,
      fecha_solicitud TEXT NOT NULL DEFAULT (datetime('now')),
      fecha_respuesta TEXT
    )`,
  ];

  stmts.forEach(s => _db.run(s));
  save();
}

// ── Datos semilla ─────────────────────────────────────────
function _seedAdmin() {
  if (one("SELECT id FROM empresas WHERE codigo_unico = 'DEMO001'")) return;

  _db.run('BEGIN');
  _inTx = true;

  _db.run("INSERT INTO empresas (nombre, codigo_unico) VALUES ('Mi Empresa', 'DEMO001')");
  const { lid: empresaId } = one('SELECT last_insert_rowid() AS lid');

  _db.run('INSERT INTO almacenes (empresa_id, nombre, ubicacion) VALUES (?,?,?)',
          [empresaId, 'Almacén Principal', 'Planta Baja']);
  const { lid: almacenId } = one('SELECT last_insert_rowid() AS lid');

  const hash = bcrypt.hashSync('admin123', 10);
  _db.run(
    'INSERT INTO usuarios (empresa_id, almacen_id, nombre_completo, correo, contrasena_hash, rol) VALUES (?,?,?,?,?,?)',
    [empresaId, almacenId, 'Administrador', 'admin@proalmacen.com', hash, 'admin']
  );

  ['Herramientas manuales','Herramientas eléctricas','Equipos de medición','Seguridad','Materiales']
    .forEach(c => _db.run('INSERT INTO categorias (almacen_id, nombre) VALUES (?,?)', [almacenId, c]));

  _db.run('COMMIT');
  _inTx = false;
  save();

  console.log('✅ Datos iniciales creados — admin@proalmacen.com / admin123');
}

module.exports = { initDb, getDb };
