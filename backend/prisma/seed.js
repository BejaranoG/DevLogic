/**
 * prisma/seed.js
 * Seed para Logic Auth — usa pg directamente.
 * Genera UUIDs y timestamps explícitos porque Prisma
 * no pone DEFAULT en las columnas.
 */

const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

function uuid() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Seeding Logic Auth database...");

  // ── 1. ROLES ──
  const roles = [
    { clave: "admin_maestro", nombre: "Administrador Maestro", descripcion: "Control total del sistema", es_sistema: true },
    { clave: "admin", nombre: "Administrador", descripcion: "Gestion de usuarios y configuracion", es_sistema: true },
    { clave: "gerencia", nombre: "Gerencia", descripcion: "Consulta de toda la cartera", es_sistema: true },
    { clave: "cartera", nombre: "Cartera", descripcion: "Consulta de cartera activa y pasiva", es_sistema: true },
    { clave: "ejecutivo", nombre: "Ejecutivo", descripcion: "Consulta de cartera asignada", es_sistema: true },
    { clave: "staff", nombre: "Staff", descripcion: "Consulta general", es_sistema: true },
  ];

  const roleIds = {};
  for (const r of roles) {
    const ts = now();
    const res = await client.query(
      "INSERT INTO roles (id, clave, nombre, descripcion, es_sistema, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (clave) DO NOTHING RETURNING id",
      [uuid(), r.clave, r.nombre, r.descripcion, r.es_sistema, ts, ts]
    );
    if (res.rows.length > 0) {
      roleIds[r.clave] = res.rows[0].id;
    } else {
      const existing = await client.query("SELECT id FROM roles WHERE clave=$1", [r.clave]);
      roleIds[r.clave] = existing.rows[0].id;
    }
  }
  console.log("  ✓ 6 roles creados");

  // ── 2. PERMISOS ──
  const permisos = [
    { clave: "ver_todos_creditos", nombre: "Ver todos los creditos", modulo: "cartera", descripcion: "Acceso a toda la cartera" },
    { clave: "ver_cartera_propia", nombre: "Ver cartera asignada", modulo: "cartera", descripcion: "Solo su cartera (ejecutivo)" },
    { clave: "proyectar", nombre: "Proyectar disposiciones", modulo: "proyeccion", descripcion: "Ejecutar motor M4" },
    { clave: "exportar", nombre: "Exportar base proyectada", modulo: "proyeccion", descripcion: "Descargar XLSX proyectado" },
    { clave: "admin_usuarios", nombre: "Administrar usuarios", modulo: "admin", descripcion: "CRUD de usuarios" },
    { clave: "aprobar_usuarios", nombre: "Aprobar/Rechazar usuarios", modulo: "admin", descripcion: "Flujo de aprobacion" },
    { clave: "asignar_roles", nombre: "Asignar roles", modulo: "admin", descripcion: "Cambiar rol de usuario" },
    { clave: "asignar_cartera", nombre: "Asignar cartera", modulo: "admin", descripcion: "Mapear ejecutivo a Sheets" },
    { clave: "ver_log", nombre: "Ver log de auditoria", modulo: "admin", descripcion: "Consultar audit_logs" },
    { clave: "sincronizar", nombre: "Sincronizar con Sheets", modulo: "sync", descripcion: "Disparar sincronizacion" },
    { clave: "recibir_codigos", nombre: "Recibir codigos de verificacion", modulo: "auth", descripcion: "Ver codigos de nuevos usuarios" },
    { clave: "ver_cartera_pasiva", nombre: "Ver cartera pasiva", modulo: "cartera", descripcion: "Acceso a cartera pasiva" },
  ];

  const permIds = {};
  for (const p of permisos) {
    const res = await client.query(
      "INSERT INTO permissions (id, clave, nombre, modulo, descripcion, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (clave) DO NOTHING RETURNING id",
      [uuid(), p.clave, p.nombre, p.modulo, p.descripcion, now()]
    );
    if (res.rows.length > 0) {
      permIds[p.clave] = res.rows[0].id;
    } else {
      const existing = await client.query("SELECT id FROM permissions WHERE clave=$1", [p.clave]);
      permIds[p.clave] = existing.rows[0].id;
    }
  }
  console.log("  ✓ " + permisos.length + " permisos creados");

  // ── 3. ASIGNAR PERMISOS A ROLES ──
  const matrix = {
    admin_maestro: ["ver_todos_creditos","ver_cartera_pasiva","proyectar","exportar","admin_usuarios","aprobar_usuarios","asignar_roles","asignar_cartera","ver_log","sincronizar","recibir_codigos"],
    admin: ["ver_todos_creditos","ver_cartera_pasiva","proyectar","exportar","admin_usuarios","aprobar_usuarios","asignar_roles","asignar_cartera","ver_log","sincronizar"],
    gerencia: ["ver_todos_creditos","ver_cartera_pasiva","proyectar","exportar"],
    cartera: ["ver_todos_creditos","ver_cartera_pasiva","proyectar","exportar"],
    ejecutivo: ["ver_cartera_propia","proyectar"],
    staff: ["ver_todos_creditos","proyectar","exportar"],
  };

  let rpCount = 0;
  for (const [roleClave, permClaves] of Object.entries(matrix)) {
    for (const pc of permClaves) {
      await client.query(
        "INSERT INTO role_permissions (id, role_id, permission_id, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [uuid(), roleIds[roleClave], permIds[pc], now()]
      );
      rpCount++;
    }
  }
  console.log("  ✓ " + rpCount + " asignaciones rol-permiso");

  // ── 4. ADMIN MAESTRO ──
  const existing = await client.query("SELECT id FROM users WHERE email=$1", ["gerardo.bejarano@proaktiva.com.mx"]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash("g1L2P3E4290500!", 12);
    const ts = now();
    await client.query(
      "INSERT INTO users (id, email, password_hash, nombre, apellido, area, numero_identificacion, status, verificado, role_id, intentos_login_fallidos, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
      [uuid(), "gerardo.bejarano@proaktiva.com.mx", hash, "Gerardo", "Bejarano", "Sistemas", "LOG-0001", "aprobado", true, roleIds.admin_maestro, 0, ts, ts]
    );
    console.log("  ✓ Admin maestro creado (gerardo.bejarano@proaktiva.com.mx)");
  } else {
    console.log("  ⊘ Admin maestro ya existe");
  }

  console.log("\nSeed completado exitosamente.");

  // ── 5. TABLA SUGERENCIAS ──
  await client.query(`
    CREATE TABLE IF NOT EXISTS sugerencias (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users(id),
      user_email VARCHAR(255) NOT NULL,
      user_nombre VARCHAR(200) NOT NULL,
      user_role VARCHAR(50) NOT NULL,
      tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('sugerencia', 'queja')),
      mensaje TEXT NOT NULL,
      leido BOOLEAN DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("  ✓ Tabla sugerencias lista");

  await client.end();
}

main().catch(function(e) { console.error("Error en seed:", e.message); process.exit(1); });
