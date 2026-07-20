// ============================================================
//  ProAlmacén — Middleware de autenticación y roles
// ============================================================

function verificarSesion(req, res, next) {
  if (req.session && req.session.usuario) return next();
  // Si es petición API, devolver JSON
  if (req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ ok: false, mensaje: 'Sesión requerida' });
  }
  return res.redirect('/');
}

function soloAdmin(req, res, next) {
  if (req.session?.usuario?.rol === 'admin') return next();
  return res.status(403).json({ ok: false, mensaje: 'Acceso restringido a administradores' });
}

module.exports = { verificarSesion, soloAdmin };
