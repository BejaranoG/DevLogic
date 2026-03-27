# Logic — Deploy en Railway

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        Railway Project                       │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │  Service: frontend│    │  Service: backend │               │
│  │  (Next.js)        │    │  (NestJS)         │               │
│  │                   │    │                   │               │
│  │  Root: /          │    │  Root: /backend    │               │
│  │  Port: 3000       │    │  Port: 4000        │               │
│  │  Dockerfile: ./   │    │  Dockerfile: ./    │               │
│  └────────┬──────────┘    └────────┬──────────┘               │
│           │                        │                          │
│           │                        │                          │
│           │              ┌─────────┴──────────┐               │
│           │              │  PostgreSQL (addon) │               │
│           │              │  DATABASE_URL auto  │               │
│           │              └────────────────────┘               │
│           │                                                   │
│  ┌────────┴──────────────────────────────────┐               │
│  │           Google Sheets (público)          │               │
│  │  CSV export — sin Service Account          │               │
│  └───────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

El frontend se conecta a Sheets directamente (CSV público).
El backend es independiente: solo maneja auth, usuarios, roles y auditoría.
Cuando integremos auth al frontend, el frontend hará fetch al backend para validar tokens.


## Paso a paso

### 1. Subir al repo

Asegúrate de que tu repo tenga esta estructura:

```
logic/
├── Dockerfile              ← Frontend
├── railway.toml            ← Frontend config
├── .dockerignore           ← Excluye /backend del build frontend
├── package.json            ← Frontend deps
├── next.config.js
├── app/                    ← Next.js pages
├── engine/                 ← Motor de proyección
├── sync/                   ← Sync con Sheets
├── components/
├── lib/
├── public/
│
└── backend/                ← Backend (servicio separado)
    ├── Dockerfile          ← Backend
    ├── railway.toml        ← Backend config
    ├── package.json        ← NestJS deps
    ├── nest-cli.json
    ├── tsconfig.json
    ├── prisma/
    │   ├── schema.prisma
    │   └── seed.ts
    └── src/                ← NestJS modules
```


### 2. Crear proyecto en Railway

1. Ir a https://railway.app → New Project
2. Deploy from GitHub repo → seleccionar tu repo


### 3. Servicio FRONTEND (automático)

Railway detecta el Dockerfile en la raíz y crea el primer servicio.

Variables de entorno (ninguna obligatoria para MVP):
```
# Opcional: URL del backend cuando integres auth
NEXT_PUBLIC_API_URL=https://logic-backend-production.up.railway.app
```

Verificar que:
- Root Directory: `/` (default)
- Port: `3000` (automático del Dockerfile)
- Health check: `/api/sync`


### 4. Servicio BACKEND (manual)

En el mismo proyecto Railway:
1. Click "New" → "Service" → "GitHub Repo" → mismo repo
2. En Settings del nuevo servicio:
   - **Root Directory**: `/backend`  ← CRÍTICO
   - Railway usará el Dockerfile y railway.toml de /backend

Variables de entorno (OBLIGATORIAS):
```
DATABASE_URL=postgresql://...         ← Se autocompleta si agregas el addon
JWT_SECRET=un-string-de-64-caracteres-minimo-cambiar-esto
JWT_EXPIRATION=8h
DOMINIO_PERMITIDO=@proaktiva.com.mx
PORT=4000
```


### 5. Base de datos PostgreSQL

En el proyecto Railway:
1. Click "New" → "Database" → PostgreSQL
2. Railway crea la instancia y genera `DATABASE_URL`
3. En el servicio backend → Variables → Reference → seleccionar `DATABASE_URL` del Postgres

Railway inyecta la variable automáticamente. No necesitas copiar/pegar la URL.


### 6. Primer deploy del backend

El Dockerfile ejecuta `prisma db push` al arrancar, así que las tablas se crean solas.

Para el seed (roles + permisos + admin inicial), ejecutarlo una vez:

**Opción A — Desde Railway shell:**
```bash
# En el dashboard de Railway → backend service → Settings → Railway Shell
npx ts-node prisma/seed.ts
```

**Opción B — Desde tu máquina local:**
```bash
cd backend
# Copiar DATABASE_URL del dashboard de Railway
export DATABASE_URL="postgresql://..."
npx ts-node prisma/seed.ts
```

Esto crea:
- 5 roles (admin_maestro, admin, gerencia, ejecutivo, staff)
- 11 permisos con matriz de asignación
- Usuario admin: admin@proaktiva.com.mx / Logic2026!


### 7. Verificar

Frontend:
```
https://logic-frontend-production.up.railway.app/
```

Backend:
```
https://logic-backend-production.up.railway.app/api/auth/health
→ { "status": "ok", "servicio": "Logic Auth" }
```

Login:
```bash
curl -X POST https://logic-backend-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@proaktiva.com.mx","password":"Logic2026!"}'
```


## Variables de entorno completas

### Frontend
| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| NEXT_PUBLIC_API_URL | No | — | URL del backend (para cuando integres auth) |

### Backend
| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| DATABASE_URL | Sí | — | PostgreSQL connection string |
| JWT_SECRET | Sí | dev-secret | Mínimo 64 caracteres en producción |
| JWT_EXPIRATION | No | 8h | Duración del token |
| DOMINIO_PERMITIDO | No | @proaktiva.com.mx | Dominio de email válido |
| PORT | No | 4000 | Puerto del servidor |
| FRONTEND_URL | No | * | CORS origin permitido |


## Troubleshooting

**Backend no arranca:**
- Verificar que DATABASE_URL esté configurada
- Verificar que Root Directory sea `/backend`
- Ver logs: Railway → Service → Deployments → View Logs

**"Rol staff no encontrado":**
- El seed no se ha ejecutado. Correr `npx ts-node prisma/seed.ts`

**Frontend no muestra datos:**
- Verificar que el Google Sheet sea público
- La sincronización se hace al cargar la página (auto-sync)

**CORS error al conectar frontend→backend:**
- Agregar variable FRONTEND_URL con la URL exacta del frontend en Railway
