# Logic MVP — Plan Técnico de Implementación

## 1. Dependencias (package.json)

### Producción
```
next@14.2+              → Framework fullstack (App Router)
react@18+               → UI
typescript@5.4+         → Tipado
decimal.js@10.4+        → Aritmética de precisión financiera (base 360, interés)
googleapis@140+         → Google Sheets API v4 (lectura de cartera)
next-auth@4.24+         → Autenticación con credenciales @proaktiva.com.mx
bcryptjs@2.4+           → Hash de contraseñas
@prisma/client@5+       → ORM para PostgreSQL
date-fns@3+             → Manipulación de fechas (addDays, differenceInDays, isWeekend)
uuid@9+                 → Generación de IDs para sync_batch_id, ejecuciones
zod@3.23+               → Validación de inputs en API
```

### Desarrollo
```
prisma@5+               → CLI de migraciones y generación
vitest@1.6+             → Testing unitario (rápido, nativo TS)
@types/react@18+        → Tipos React
@types/bcryptjs          → Tipos bcrypt
tailwindcss@3.4+        → Utilidades CSS
```

## 2. Archivos a Crear (48 archivos)

### Capa Engine (motor puro — 0 dependencias de framework)
```
engine/shared/types.ts                  → EstadoSaldos, Disposicion, PeriodoOperativo
engine/shared/decimal-helpers.ts        → Wrappers de Decimal para operaciones financieras

engine/periodo/calendario.ts            → esDiaHabil, siguienteDiaHabil
engine/periodo/festivos-mx.ts           → Festivos oficiales de México 2024–2031
engine/periodo/festivos-us.ts           → Festivos oficiales de EE.UU. 2024–2031
engine/periodo/resolver.ts              → resolverCalendario, resolverFechaOperativa
engine/periodo/periodos.ts              → construirPeriodos
engine/periodo/index.ts                 → Re-exports

engine/interes/ordinario.ts             → calcularInteresOrdinarioDiario
engine/interes/moratorio.ts             → calcularInteresMoratorioDiario
engine/interes/refinanciado.ts          → convertirARefinanciado
engine/interes/index.ts                 → calcularInteresesDia + re-exports

engine/etapas/reglas.ts                 → resolverReglaEtapa (tabla de umbrales)
engine/etapas/evaluador.ts              → evaluarEtapa, validarEtapaInicial
engine/etapas/reclasificacion.ts        → reclasificarAEtapa3
engine/etapas/index.ts                  → ejecutarM3 + re-exports

engine/proyeccion/motor.ts              → proyectarDisposicion (loop día a día)
engine/proyeccion/index.ts              → Re-export
```

### Capa Sync (Google Sheets → DB)
```
sync/sheets-client.ts                   → Lectura de hojas via googleapis
sync/mapper-cartera.ts                  → Mapeo cols Cartera Activa → src_
sync/mapper-amortizacion.ts             → Mapeo cols Amortización → src_
sync/normalizer.ts                      → src_ → core_ (normalización + amort. sintéticas)
```

### Capa DB (Prisma)
```
prisma/schema.prisma                    → 15 tablas (src_, core_, proj_)
prisma/seed.ts                          → Datos semilla (productos, reglas, perfiles, festivos)
```

### Capa API
```
app/api/sync/route.ts                   → POST: sincronizar Sheets
app/api/disposiciones/route.ts          → GET: listar disposiciones
app/api/disposicion/[folio]/route.ts    → GET: detalle de una disposición
app/api/proyeccion/route.ts             → POST: ejecutar proyección
app/api/proyeccion/[id]/route.ts        → GET: resultado de proyección
```

### Capa Frontend (mínimo funcional)
```
app/layout.tsx                          → Layout raíz
app/page.tsx                            → Redirect a /disposiciones
app/disposiciones/page.tsx              → Lista de disposiciones con búsqueda
app/disposicion/[folio]/page.tsx        → Detalle + formulario de proyección
components/disposicion-card.tsx         → Card de resumen
components/saldo-table.tsx              → Tabla de saldos desglosados
components/proyeccion-form.tsx          → Formulario fecha + botón
components/proyeccion-resultado.tsx     → Resultado con saldos proyectados
```

### Utilidades
```
lib/db.ts                               → Cliente Prisma singleton
lib/logger.ts                           → Escritura a core_log_actividad
```

### Tests (11 archivos)
```
engine/periodo/__tests__/calendario.test.ts
engine/periodo/__tests__/resolver.test.ts
engine/periodo/__tests__/periodos.test.ts
engine/interes/__tests__/ordinario.test.ts
engine/interes/__tests__/moratorio.test.ts
engine/interes/__tests__/refinanciado.test.ts
engine/etapas/__tests__/evaluador.test.ts
engine/etapas/__tests__/reclasificacion.test.ts
engine/proyeccion/__tests__/motor.test.ts
sync/__tests__/normalizer.test.ts
sync/__tests__/mapper.test.ts
```

### Config
```
package.json
tsconfig.json
vitest.config.ts
tailwind.config.ts
.env.example
```

## 3. Riesgos Técnicos

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|-------------|---------|------------|
| R1 | Tasa congelada diverge de realidad en proyecciones largas | Alta | Medio | Documentado como supuesto. Post-MVP: simulación de tasa |
| R2 | 54 disposiciones sin amortización pero con num_amort > 1 | Confirmado | Alto | Flag como no proyectable + alerta en UI |
| R3 | 26 disposiciones con contradicción IFRS9 | Confirmado | Medio | Flag como no proyectable. 92.5% sí son proyectables |
| R4 | 8 disposiciones sin tasa base calculada | Confirmado | Bajo | Se calcula como spread + referencia si está disponible |
| R5 | Google Sheets API rate limits | Baja | Bajo | Se lee 1 vez manual. No hay polling |
| R6 | Redondeo decimal acumulativo | Media | Medio | decimal.js con precisión 20 dígitos. Redondeo solo en salida |
| R7 | Festivos faltantes en el calendario | Media | Alto | Poblar 2024–2031. Validar cobertura antes de proyectar |

## 4. Orden de Implementación

### Fase 1: Engine puro (sin DB, sin HTTP)
1. engine/shared/types.ts + decimal-helpers.ts
2. engine/periodo/ completo + tests
3. engine/interes/ completo + tests
4. engine/etapas/ completo + tests
5. engine/proyeccion/ completo + tests

### Fase 2: Datos
6. prisma/schema.prisma + seed.ts
7. sync/ completo (Sheets → src_ → core_)

### Fase 3: API
8. API routes (proyección, disposiciones)

### Fase 4: Frontend mínimo
9. Páginas de consulta y proyección
