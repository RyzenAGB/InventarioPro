# 📦 ProAlmacén

Sistema web de gestión de inventario, préstamos y devoluciones de herramientas para áreas de mantenimiento industrial.

## Requisitos

- **Node.js** v18 o superior (ya instalado en tu sistema)
- Sin XAMPP ni bases de datos externas — usa SQLite integrado

## Instalación y arranque

```bash
# 1. Instalar dependencias (solo la primera vez)
npm install

# 2. Iniciar el servidor
node src/server.js
```

Abre tu navegador en: **http://localhost:3000**

## Credenciales de prueba

| Rol | Correo | Contraseña |
|-----|--------|------------|
| Administrador | admin@proalmacen.com | admin123 |

## Módulos

| Módulo | Descripción |
|--------|-------------|
| **Dashboard** | Estadísticas de herramientas y préstamos activos |
| **Inventario** | Catálogo CRUD con buscador y filtros por categoría/estado |
| **Préstamos** | Registro de salida y devolución de herramientas |
| **Historial** | Bitácora inalterable de todos los movimientos |
| **Usuarios** | Gestión de cuentas (solo admin) |
| **Categorías** | Organización del inventario (solo admin) |

## Estados de herramientas

- ✅ **Disponible** — lista para préstamo
- 🔄 **Prestada** — asignada a un técnico
- 🔧 **En reparación** — en mantenimiento
- ⛔ **Fuera de servicio** — dada de baja

## Roles

| Funcionalidad | Admin | Técnico |
|---|:---:|:---:|
| Ver inventario | ✅ | ✅ |
| Crear/editar herramientas | ✅ | ❌ |
| Registrar préstamos | ✅ | ❌ |
| Registrar devoluciones | ✅ | ❌ |
| Ver historial completo | ✅ | Solo propio |
| Gestionar usuarios | ✅ | ❌ |

## Estructura del proyecto

```
proalmacen/
├── src/
│   ├── server.js          # Servidor Express principal
│   ├── db/database.js     # SQLite con sql.js (sin compilación)
│   ├── middleware/auth.js  # Verificación de sesión y roles
│   └── routes/
│       ├── auth.js         # Login, logout, registro
│       ├── inventario.js   # CRUD herramientas
│       ├── prestamos.js    # Préstamos y devoluciones
│       └── extras.js       # Categorías, historial, dashboard, usuarios
├── public/
│   ├── index.html          # Login y registro
│   ├── dashboard.html      # Panel principal
│   ├── css/                # Estilos
│   └── js/                 # JavaScript del cliente
└── proalmacen.db           # Base de datos SQLite (se crea automáticamente)
```
