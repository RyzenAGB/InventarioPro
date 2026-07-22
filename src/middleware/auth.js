// ============================================================
//  ProAlmacén — Middleware de autenticación y roles
// ============================================================

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'proalmacen-jwt-secret';

function verificarSesion(req, res, next) {
  const token = req.cookies.token;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      // Inyectamos el usuario en req.session.usuario para mantener compatibilidad con el resto del código
      req.session = { usuario: decoded };
      return next();
    } catch (e) {
      // Token inválido o expirado, lo ignoramos y procedemos al error
    }
  }

  // Si es petición API, devolver JSON. 
  // originalUrl nos asegura comprobar la ruta base sin importar el router
  if (req.originalUrl.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ ok: false, mensaje: 'Sesión requerida o expirada' });
  }
  return res.redirect('/');
}

function soloAdmin(req, res, next) {
  if (req.session?.usuario?.rol === 'admin') return next();
  return res.status(403).json({ ok: false, mensaje: 'Acceso restringido a administradores' });
}

module.exports = { verificarSesion, soloAdmin, JWT_SECRET };
