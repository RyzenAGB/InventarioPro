// ============================================================
//  ProAlmacén — Server-Sent Events (SSE)
//  Permite notificaciones en tiempo real sin WebSocket
// ============================================================
const express = require('express');
const { verificarSesion } = require('../middleware/auth');

const router = express.Router();

// Mapa de clientes: almacen_id -> Set de objetos { res, usuario_id }
const clientes = new Map();

// ── Suscribir cliente ─────────────────────────────────────
router.get('/stream', verificarSesion, (req, res) => {
  const { almacen_id, id: usuario_id } = req.session.usuario;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // para Nginx
  res.flushHeaders();

  // Enviar un "ping" inicial para confirmar la conexión
  res.write(`event: connected\ndata: {"ok":true}\n\n`);

  // Registrar cliente
  if (!clientes.has(almacen_id)) clientes.set(almacen_id, new Set());
  const cliente = { res, usuario_id };
  clientes.get(almacen_id).add(cliente);

  // Ping periódico para mantener viva la conexión (cada 25s)
  const ping = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  // Limpiar al desconectar
  req.on('close', () => {
    clearInterval(ping);
    const set = clientes.get(almacen_id);
    if (set) {
      set.delete(cliente);
      if (set.size === 0) clientes.delete(almacen_id);
    }
  });
});

// ── Broadcast a todos los clientes de un almacén ─────────
function broadcast(almacen_id, evento, datos) {
  const set = clientes.get(almacen_id);
  if (!set || set.size === 0) return;

  const mensaje = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;
  const muertos = [];

  for (const cliente of set) {
    try {
      cliente.res.write(mensaje);
    } catch {
      muertos.push(cliente);
    }
  }

  // Limpiar clientes caídos
  muertos.forEach(c => set.delete(c));
}

module.exports = { router, broadcast };
