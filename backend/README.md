# Logic Auth Backend — NestJS

## Setup rápido

```bash
cd backend
npm install
cp .env.example .env  # Editar DATABASE_URL y JWT_SECRET

# Crear tablas
npx prisma db push

# Seed: roles + permisos + admin inicial
npx ts-node prisma/seed.ts

# Arrancar
npm run start:dev   # desarrollo (port 4000)
npm run build && npm run start:prod  # producción
```

## Endpoints

### Auth (público)

| Método | Ruta | Body | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/register` | `{ email, password }` | Registro. Retorna código de 6 dígitos |
| POST | `/api/auth/verify` | `{ email, codigo }` | Verificar código. Queda pendiente de aprobación |
| POST | `/api/auth/login` | `{ email, password }` | Login. Retorna `access_token` |
| GET | `/api/auth/me` | — (Bearer token) | Perfil del usuario autenticado |

### Users (admin_maestro, admin)

| Método | Ruta | Body | Descripción |
|--------|------|------|-------------|
| GET | `/api/users` | — | Listar todos los usuarios |
| GET | `/api/users/pending` | — | Usuarios verificados pendientes de aprobación |
| PATCH | `/api/users/:id/status` | `{ status }` | Aprobar/rechazar/bloquear (`aprobado`, `rechazado`, `desactivado`, `bloqueado`) |
| PATCH | `/api/users/:id/role` | `{ role_clave }` | Asignar rol (`admin`, `gerencia`, `ejecutivo`, `staff`) |
| PATCH | `/api/users/:id/portfolio` | `{ nombre_ejecutivo_sheets }` | Mapear ejecutivo a nombre en Sheets |
| PATCH | `/api/users/profile` | `{ nombre?, apellido?, area? }` | Editar perfil propio (cualquier autenticado) |

### Roles (admin_maestro, admin)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/roles` | Listar roles con permisos asignados |
| GET | `/api/roles/permissions` | Listar todos los permisos disponibles |

### Audit (admin_maestro, admin)

| Método | Ruta | Query params | Descripción |
|--------|------|--------------|-------------|
| GET | `/api/audit` | `user_id`, `accion`, `desde`, `hasta`, `limit` | Consultar log de auditoría |

## Flujo de registro

1. Usuario → `POST /api/auth/register` con email @proaktiva.com.mx + password
2. Sistema genera código de 6 dígitos (retornado en respuesta, 24h vigencia)
3. Admin Maestro comparte el código al usuario
4. Usuario → `POST /api/auth/verify` con email + código
5. Admin → `PATCH /api/users/:id/status` con `{ status: "aprobado" }`
6. Admin → `PATCH /api/users/:id/role` con `{ role_clave: "ejecutivo" }`
7. Si es ejecutivo → `PATCH /api/users/:id/portfolio` con nombre de Sheets
8. Usuario → `POST /api/auth/login` → recibe JWT

## Probar con Postman / Thunder Client

```
# 1. Registrar
POST http://localhost:4000/api/auth/register
Content-Type: application/json
{ "email": "juan@proaktiva.com.mx", "password": "MiPassword123" }

# 2. Verificar (usar el código de la respuesta anterior)
POST http://localhost:4000/api/auth/verify
Content-Type: application/json
{ "email": "juan@proaktiva.com.mx", "codigo": "123456" }

# 3. Login como admin
POST http://localhost:4000/api/auth/login
Content-Type: application/json
{ "email": "admin@proaktiva.com.mx", "password": "Logic2026!" }
→ Copiar access_token

# 4. Aprobar usuario (usar token del admin)
PATCH http://localhost:4000/api/users/{userId}/status
Authorization: Bearer {token}
Content-Type: application/json
{ "status": "aprobado" }

# 5. Asignar rol
PATCH http://localhost:4000/api/users/{userId}/role
Authorization: Bearer {token}
Content-Type: application/json
{ "role_clave": "ejecutivo" }

# 6. Mapear cartera (si es ejecutivo)
PATCH http://localhost:4000/api/users/{userId}/portfolio
Authorization: Bearer {token}
Content-Type: application/json
{ "nombre_ejecutivo_sheets": "JUAN PEREZ LOPEZ" }

# 7. Login como el nuevo usuario
POST http://localhost:4000/api/auth/login
Content-Type: application/json
{ "email": "juan@proaktiva.com.mx", "password": "MiPassword123" }

# 8. Ver perfil
GET http://localhost:4000/api/auth/me
Authorization: Bearer {token_del_usuario}
```

## Seguridad

- Passwords: bcrypt con 12 salt rounds
- JWT: 8 horas de expiración, secret configurable
- Validación: class-validator en todos los DTOs
- Guards: JwtAuthGuard (autenticación) + RolesGuard (autorización por rol) + PermissionsGuard (granular)
- Audit: toda acción queda registrada en audit_logs
- CORS: habilitado con credentials
- Admin Maestro: no puede ser desactivado ni rechazado
