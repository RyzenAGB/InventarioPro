// ============================================================
//  ProAlmacén — Base de datos con Turso (libSQL)
// ============================================================
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

let client = null;

// ── Helpers de query ──────────────────────────────────────
async function all(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows;
}

async function one(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows[0] ?? null;
}

async function run(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return { lastInsertRowid: result.lastInsertRowid ? Number(result.lastInsertRowid) : 0 };
}

// ── Objeto de acceso a datos ──────────────────────────────
const db = {
  all,
  one,
  run,

  /** Ejecuta una función dentro de una transacción asíncrona */
  async tx(fn) {
    const transaction = await client.transaction('write');
    const tDb = {
      async all(sql, params = []) {
        const result = await transaction.execute({ sql, args: params });
        return result.rows;
      },
      async one(sql, params = []) {
        const result = await transaction.execute({ sql, args: params });
        return result.rows[0] ?? null;
      },
      async run(sql, params = []) {
        const result = await transaction.execute({ sql, args: params });
        return { lastInsertRowid: result.lastInsertRowid ? Number(result.lastInsertRowid) : 0 };
      }
    };

    try {
      const result = await fn(tDb);
      await transaction.commit();
      return result;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};

// ── Inicializar ───────────────────────────────────────────
async function initDb() {
  if (client) return db;

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN en el entorno.');
  }

  client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  await _crearTablas();
  await _seedAdmin();

  return db;
}

function getDb() {
  if (!client) throw new Error('DB no inicializada. Llama a initDb() primero.');
  return db;
}

// ── Crear esquema ─────────────────────────────────────────
async function _crearTablas() {
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
    )`
  ];

  for (const s of stmts) {
    await client.execute(s);
  }
}

// ── Datos semilla ─────────────────────────────────────────
async function _seedAdmin() {
  const adminCheck = await one("SELECT id FROM empresas WHERE codigo_unico = 'DEMO001'");
  if (adminCheck) return;

  await db.tx(async (t) => {
    await t.run("INSERT INTO empresas (nombre, codigo_unico) VALUES ('Mi Empresa', 'DEMO001')");
    const { lastInsertRowid: empresaId } = await t.run('SELECT last_insert_rowid() AS lid');

    await t.run('INSERT INTO almacenes (empresa_id, nombre, ubicacion) VALUES (?,?,?)',
            [empresaId, 'Almacén Principal', 'Planta Baja']);
    const { lastInsertRowid: almacenId } = await t.run('SELECT last_insert_rowid() AS lid');

    const hash = bcrypt.hashSync('admin123', 10);
    await t.run(
      'INSERT INTO usuarios (empresa_id, almacen_id, nombre_completo, correo, contrasena_hash, rol) VALUES (?,?,?,?,?,?)',
      [empresaId, almacenId, 'Administrador', 'admin@proalmacen.com', hash, 'admin']
    );

    const categorias = ['Herramientas manuales','Herramientas eléctricas','Equipos de medición','Seguridad','Materiales'];
    for (const c of categorias) {
      await t.run('INSERT INTO categorias (almacen_id, nombre) VALUES (?,?)', [almacenId, c]);
    }
  });

  console.log('✅ Datos iniciales creados — admin@proalmacen.com / admin123');
}

module.exports = { initDb, getDb };
