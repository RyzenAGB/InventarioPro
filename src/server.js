// ============================================================
//  ProAlmacén — Servidor principal Express
// ============================================================
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path    = require('path');
const { initDb, getDb }    = require('./db/database');
const { verificarSesion }  = require('./middleware/auth');
const authRoutes           = require('./routes/auth');
const inventarioRoutes     = require('./routes/inventario');
const prestamosRoutes      = require('./routes/prestamos');
const solicitudesRoutes    = require('./routes/solicitudes');
const { router: sseRoutes } = require('./routes/sse');
const { categorias, historial, dashboard, usuarios, empresa } = require('./routes/extras');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware global ──────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filepath) => {
    const ext = path.extname(filepath).toLowerCase();
    if (['.html', '.css', '.js'].includes(ext)) {
      // Usar el mime type y forzar utf-8
      const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
      res.setHeader('Content-Type', mimeTypes[ext] + '; charset=utf-8');
    }
  }
}));

// ── Rutas de API ──────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/inventario',  inventarioRoutes);
app.use('/api/prestamos',   prestamosRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/sse',         sseRoutes);
app.use('/api/categorias',  categorias);
app.use('/api/historial',   historial);
app.use('/api/dashboard',   dashboard);
app.use('/api/usuarios',    usuarios);
app.use('/api/empresa',     empresa);

// ── Rutas HTML ────────────────────────────────────────────
app.get('/', (req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    return res.redirect('/dashboard.html');
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/dashboard.html', verificarSesion, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// ── Arrancar servidor (async para inicializar BD) ─────────
async function start() {
  await initDb();
  console.log('✅ Base de datos inicializada');

  // Si NO estamos en Vercel, arrancamos el servidor en el puerto
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
      console.log(`\n🚀 ProAlmacén corriendo en http://localhost:${PORT}`);
      console.log(`   Credenciales de prueba: admin@proalmacen.com / admin123\n`);
    });
  }
}

start().catch(err => { console.error('Error al arrancar:', err); process.exit(1); });

module.exports = app;

