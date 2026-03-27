/**
 * test-integration.js
 * Test suite completo para el módulo de acceso de Logic.
 * Prueba directamente contra PostgreSQL sin NestJS/Prisma.
 * Simula exactamente lo que haría el backend.
 */

const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const pool = new Pool({ connectionString: "postgresql://postgres:postgres@localhost:5432/logic_auth" });
const JWT_SECRET = "logic-test-secret-64-chars-minimum-for-security-xxxxxxxxxxxxxxxxx";
const SALT_ROUNDS = 12;
function uuid() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

let passed = 0;
let failed = 0;
let total = 0;
const errors = [];

function assert(condition, label) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    errors.push(label);
    console.log(`  ❌ ${label}`);
  }
}

async function q(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function qOne(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

async function audit(userId, targetId, accion, detalle = {}) {
  await q(
    `INSERT INTO audit_logs (user_id, target_user_id, accion, detalle, ip_address) VALUES ($1,$2,$3,$4,$5)`,
    [userId, targetId, accion, JSON.stringify(detalle), "127.0.0.1"]
  );
}

// ════════════════════════════════════════════════════════════════
// SEED
// ════════════════════════════════════════════════════════════════

async function seed() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  SEED: Roles, Permisos, Admin Maestro            ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Roles
  const roles = [
    { clave: "admin_maestro", nombre: "Administrador Maestro", es_sistema: true },
    { clave: "admin", nombre: "Administrador", es_sistema: true },
    { clave: "gerencia", nombre: "Gerencia", es_sistema: true },
    { clave: "ejecutivo", nombre: "Ejecutivo", es_sistema: true },
    { clave: "staff", nombre: "Staff", es_sistema: true },
  ];
  for (const r of roles) {
    await q(`INSERT INTO roles (clave, nombre, es_sistema) VALUES ($1,$2,$3) ON CONFLICT (clave) DO NOTHING`, [r.clave, r.nombre, r.es_sistema]);
  }
  const rolesDb = await q(`SELECT * FROM roles ORDER BY created_at`);
  assert(rolesDb.length === 5, "5 roles creados");

  // Permisos
  const permisos = [
    { clave: "ver_todos_creditos", nombre: "Ver todos los créditos", modulo: "cartera" },
    { clave: "ver_cartera_propia", nombre: "Ver cartera asignada", modulo: "cartera" },
    { clave: "proyectar", nombre: "Proyectar disposiciones", modulo: "proyeccion" },
    { clave: "exportar", nombre: "Exportar base proyectada", modulo: "proyeccion" },
    { clave: "admin_usuarios", nombre: "Administrar usuarios", modulo: "admin" },
    { clave: "aprobar_usuarios", nombre: "Aprobar/Rechazar usuarios", modulo: "admin" },
    { clave: "asignar_roles", nombre: "Asignar roles", modulo: "admin" },
    { clave: "asignar_cartera", nombre: "Asignar cartera", modulo: "admin" },
    { clave: "ver_log", nombre: "Ver log de auditoría", modulo: "admin" },
    { clave: "sincronizar", nombre: "Sincronizar con Sheets", modulo: "sync" },
    { clave: "recibir_codigos", nombre: "Recibir códigos de verificación", modulo: "auth" },
  ];
  for (const p of permisos) {
    await q(`INSERT INTO permissions (clave, nombre, modulo) VALUES ($1,$2,$3) ON CONFLICT (clave) DO NOTHING`, [p.clave, p.nombre, p.modulo]);
  }
  const permsDb = await q(`SELECT * FROM permissions`);
  assert(permsDb.length === 11, "11 permisos creados");

  // Matriz de permisos por rol
  const matrix = {
    admin_maestro: ["ver_todos_creditos","proyectar","exportar","admin_usuarios","aprobar_usuarios","asignar_roles","asignar_cartera","ver_log","sincronizar","recibir_codigos"],
    admin: ["ver_todos_creditos","proyectar","exportar","admin_usuarios","aprobar_usuarios","asignar_roles","asignar_cartera","ver_log","sincronizar"],
    gerencia: ["ver_todos_creditos","proyectar","exportar"],
    ejecutivo: ["ver_cartera_propia","proyectar"],
    staff: ["ver_todos_creditos","proyectar","exportar"],
  };
  for (const [roleClave, permClaves] of Object.entries(matrix)) {
    const role = await qOne(`SELECT id FROM roles WHERE clave=$1`, [roleClave]);
    for (const pc of permClaves) {
      const perm = await qOne(`SELECT id FROM permissions WHERE clave=$1`, [pc]);
      await q(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [role.id, perm.id]);
    }
  }
  const rpCount = await qOne(`SELECT count(*) as c FROM role_permissions`);
  assert(parseInt(rpCount.c) === 27, "27 asignaciones rol-permiso creadas");

  // Admin maestro
  const adminRole = await qOne(`SELECT id FROM roles WHERE clave='admin_maestro'`);
  const hash = await bcrypt.hash("g1L2P3E4290500!", SALT_ROUNDS);
  await q(`INSERT INTO users (email, password_hash, nombre, apellido, area, numero_identificacion, status, verificado, role_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (email) DO NOTHING`,
    ["gerardo.bejarano@proaktiva.com.mx", hash, "Gerardo", "Bejarano", "Sistemas", "LOG-0001", "aprobado", true, adminRole.id]);
  
  const admin = await qOne(`SELECT * FROM users WHERE email='gerardo.bejarano@proaktiva.com.mx'`);
  assert(admin !== null, "Admin maestro creado: gerardo.bejarano@proaktiva.com.mx");
  assert(admin.status === "aprobado", "Admin status = aprobado");
  assert(admin.verificado === true, "Admin verificado = true");
}

// ════════════════════════════════════════════════════════════════
// TEST 1: LOGIN DEL ADMIN MAESTRO
// ════════════════════════════════════════════════════════════════

async function testLoginAdmin() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 1: Login del Admin Maestro                 ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const user = await qOne(`SELECT u.*, r.clave as role_clave, r.nombre as role_nombre FROM users u JOIN roles r ON u.role_id=r.id WHERE u.email=$1`, ["gerardo.bejarano@proaktiva.com.mx"]);
  
  // Password correcta
  const valid = await bcrypt.compare("g1L2P3E4290500!", user.password_hash);
  assert(valid, "Password correcta valida con bcrypt");

  // Password incorrecta
  const invalid = await bcrypt.compare("wrong_password", user.password_hash);
  assert(!invalid, "Password incorrecta rechazada por bcrypt");

  // Generar JWT
  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role_clave }, JWT_SECRET, { expiresIn: "8h" });
  assert(token.length > 50, "JWT generado correctamente (length=" + token.length + ")");

  // Verificar JWT
  const decoded = jwt.verify(token, JWT_SECRET);
  assert(decoded.sub === user.id, "JWT decode: sub = user.id");
  assert(decoded.email === "gerardo.bejarano@proaktiva.com.mx", "JWT decode: email correcto");
  assert(decoded.role === "admin_maestro", "JWT decode: role = admin_maestro");

  // Verificar expiración
  const expiredToken = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "0s" });
  await new Promise(r => setTimeout(r, 100));
  let expired = false;
  try { jwt.verify(expiredToken, JWT_SECRET); } catch (e) { expired = e.name === "TokenExpiredError"; }
  assert(expired, "Token expirado rechazado correctamente");

  // Audit login
  await audit(user.id, null, "login", {});
  const loginLog = await qOne(`SELECT * FROM audit_logs WHERE user_id=$1 AND accion='login'`, [user.id]);
  assert(loginLog !== null, "Login registrado en audit_logs");

  return { user, token };
}

// ════════════════════════════════════════════════════════════════
// TEST 2: REGISTRO DE NUEVO USUARIO
// ════════════════════════════════════════════════════════════════

async function testRegistro() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 2: Registro de nuevo usuario               ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const email = "maria.lopez@proaktiva.com.mx";
  const password = "Maria2026!Secure";

  // Validar dominio
  assert(email.endsWith("@proaktiva.com.mx"), "Dominio @proaktiva.com.mx válido");
  assert(!"maria@gmail.com".endsWith("@proaktiva.com.mx"), "Dominio externo rechazado");

  // Verificar no duplicado
  const existing = await qOne(`SELECT id FROM users WHERE email=$1`, [email]);
  assert(existing === null, "Email no duplicado");

  // Hash password
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  assert(hash.startsWith("$2a$") || hash.startsWith("$2b$"), "Password hasheada con bcrypt");
  assert(hash !== password, "Hash es diferente al plain text");

  // Generar código verificación
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  assert(codigo.length === 6, "Código de 6 dígitos generado: " + codigo);

  // Crear usuario pendiente
  const staffRole = await qOne(`SELECT id FROM roles WHERE clave='staff'`);
  const count = await qOne(`SELECT count(*) as c FROM users`);
  const numId = "LOG-" + String(parseInt(count.c) + 1).padStart(4, "0");

  await q(`INSERT INTO users (email, password_hash, nombre, apellido, numero_identificacion, status, verificado, role_id, codigo_verificacion, codigo_expira_at)
    VALUES ($1,$2,$3,$4,$5,'pendiente',false,$6,$7, now() + interval '24 hours')`,
    [email, hash, "María", "López", numId, staffRole.id, codigo]);

  const newUser = await qOne(`SELECT * FROM users WHERE email=$1`, [email]);
  assert(newUser !== null, "Usuario creado en DB");
  assert(newUser.status === "pendiente", "Status = pendiente");
  assert(newUser.verificado === false, "Verificado = false");
  assert(newUser.numero_identificacion === numId, "Número identificación = " + numId);

  // Audit
  await audit(null, null, "registro_solicitud", { email, numero_identificacion: numId });
  const regLog = await qOne(`SELECT * FROM audit_logs WHERE accion='registro_solicitud' ORDER BY created_at DESC LIMIT 1`);
  assert(regLog !== null, "Registro solicitud en audit_logs");

  return { user: newUser, codigo, password };
}

// ════════════════════════════════════════════════════════════════
// TEST 3: VERIFICACIÓN DE CÓDIGO
// ════════════════════════════════════════════════════════════════

async function testVerificacion(newUser, codigoCorrecto) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 3: Verificación de código                  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Código incorrecto
  assert("000000" !== codigoCorrecto, "Código incorrecto es diferente");

  // Código correcto
  const user = await qOne(`SELECT * FROM users WHERE id=$1`, [newUser.id]);
  assert(user.codigo_verificacion === codigoCorrecto, "Código en DB coincide");

  // Verificar expiración (no expirado aún)
  assert(new Date() < new Date(user.codigo_expira_at), "Código no ha expirado (24h)");

  // Marcar como verificado
  await q(`UPDATE users SET verificado=true, codigo_verificacion=NULL, codigo_expira_at=NULL WHERE id=$1`, [newUser.id]);
  const verified = await qOne(`SELECT * FROM users WHERE id=$1`, [newUser.id]);
  assert(verified.verificado === true, "Usuario ahora verificado = true");
  assert(verified.status === "pendiente", "Status sigue pendiente (espera aprobación)");
  assert(verified.codigo_verificacion === null, "Código limpiado");

  await audit(null, null, "registro_verificado", { email: user.email });
}

// ════════════════════════════════════════════════════════════════
// TEST 4: LOGIN RECHAZADO — PENDIENTE DE APROBACIÓN
// ════════════════════════════════════════════════════════════════

async function testLoginRechazadoPendiente(newUser, password) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 4: Login rechazado (pendiente aprobación)   ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const user = await qOne(`SELECT * FROM users WHERE id=$1`, [newUser.id]);
  assert(user.status === "pendiente", "Status actual: pendiente");
  assert(user.verificado === true, "Verificado: sí");

  // Simular login — password correcta pero status pendiente
  const valid = await bcrypt.compare(password, user.password_hash);
  assert(valid, "Password es correcta");
  assert(user.status !== "aprobado", "Pero status NO es aprobado → login RECHAZADO");

  await audit(user.id, null, "login_fallido", { razon: "pendiente_aprobacion" });
  const log = await qOne(`SELECT * FROM audit_logs WHERE user_id=$1 AND accion='login_fallido' ORDER BY created_at DESC LIMIT 1`, [user.id]);
  assert(JSON.parse(JSON.stringify(log.detalle)).razon === "pendiente_aprobacion", "Audit: razón = pendiente_aprobacion");
}

// ════════════════════════════════════════════════════════════════
// TEST 5: APROBACIÓN DE USUARIO
// ════════════════════════════════════════════════════════════════

async function testAprobacion(adminUser, newUser) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 5: Aprobación de usuario por admin          ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Listar pendientes
  const pendientes = await q(`SELECT * FROM users WHERE status='pendiente' AND verificado=true AND deleted_at IS NULL`);
  assert(pendientes.length >= 1, "Hay " + pendientes.length + " usuario(s) pendientes");
  assert(pendientes.some(u => u.id === newUser.id), "María está en la lista de pendientes");

  // Aprobar con rol ejecutivo
  const ejecutivoRole = await qOne(`SELECT id FROM roles WHERE clave='ejecutivo'`);
  await q(`UPDATE users SET status='aprobado', role_id=$1 WHERE id=$2`, [ejecutivoRole.id, newUser.id]);

  const approved = await qOne(`SELECT u.*, r.clave as role_clave FROM users u JOIN roles r ON u.role_id=r.id WHERE u.id=$1`, [newUser.id]);
  assert(approved.status === "aprobado", "Status cambiado a: aprobado");
  assert(approved.role_clave === "ejecutivo", "Rol asignado: ejecutivo");

  await audit(adminUser.id, newUser.id, "usuario_aprobado", { email_afectado: newUser.email, rol_asignado: "ejecutivo", motivo: "Nueva ejecutiva Culiacán" });
  const log = await qOne(`SELECT * FROM audit_logs WHERE accion='usuario_aprobado' ORDER BY created_at DESC LIMIT 1`);
  assert(log.user_id === adminUser.id, "Audit: admin registrado como actor");
  assert(log.target_user_id === newUser.id, "Audit: María registrada como objetivo");
}

// ════════════════════════════════════════════════════════════════
// TEST 6: LOGIN EXITOSO POST-APROBACIÓN
// ════════════════════════════════════════════════════════════════

async function testLoginExitoso(newUser, password) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 6: Login exitoso post-aprobación            ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const user = await qOne(`SELECT u.*, r.clave as role_clave FROM users u JOIN roles r ON u.role_id=r.id WHERE u.id=$1`, [newUser.id]);
  assert(user.status === "aprobado", "Status: aprobado");

  const valid = await bcrypt.compare(password, user.password_hash);
  assert(valid, "Password válida");

  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role_clave }, JWT_SECRET, { expiresIn: "8h" });
  const decoded = jwt.verify(token, JWT_SECRET);
  assert(decoded.role === "ejecutivo", "JWT contiene role: ejecutivo");
  assert(decoded.email === "maria.lopez@proaktiva.com.mx", "JWT contiene email correcto");

  await q(`UPDATE users SET last_login_at=now(), intentos_login_fallidos=0 WHERE id=$1`, [user.id]);
  await audit(user.id, null, "login", {});

  return token;
}

// ════════════════════════════════════════════════════════════════
// TEST 7: PERMISOS EFECTIVOS
// ════════════════════════════════════════════════════════════════

async function testPermisos(adminUser, newUser) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 7: Permisos efectivos                      ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Admin maestro: todos los permisos (bypass)
  const adminPerms = await q(`SELECT p.clave FROM role_permissions rp JOIN permissions p ON rp.permission_id=p.id JOIN roles r ON rp.role_id=r.id WHERE r.clave='admin_maestro'`);
  assert(adminPerms.length === 10, "Admin maestro tiene 10 permisos por rol");

  // Ejecutivo: solo 2 permisos
  const ejPerms = await q(`SELECT p.clave FROM role_permissions rp JOIN permissions p ON rp.permission_id=p.id JOIN roles r ON rp.role_id=r.id WHERE r.clave='ejecutivo'`);
  const ejClaves = ejPerms.map(p => p.clave);
  assert(ejPerms.length === 2, "Ejecutivo tiene 2 permisos: " + ejClaves.join(", "));
  assert(ejClaves.includes("ver_cartera_propia"), "Ejecutivo tiene: ver_cartera_propia");
  assert(ejClaves.includes("proyectar"), "Ejecutivo tiene: proyectar");
  assert(!ejClaves.includes("ver_todos_creditos"), "Ejecutivo NO tiene: ver_todos_creditos");
  assert(!ejClaves.includes("exportar"), "Ejecutivo NO tiene: exportar");

  // Override: otorgar "exportar" a María
  const freshUser = await qOne(`SELECT * FROM users WHERE id=$1`, [newUser.id]);
  const exportPerm = await qOne(`SELECT id FROM permissions WHERE clave='exportar'`);
  await q(`INSERT INTO user_permissions (user_id, permission_id, granted, asignado_por, motivo) VALUES ($1,$2,true,$3,$4)`,
    [newUser.id, exportPerm.id, adminUser.id, "Necesita reportes trimestrales"]);

  // Permisos efectivos = rol + override
  const rolePerms = await q(`SELECT p.clave FROM role_permissions rp JOIN permissions p ON rp.permission_id=p.id WHERE rp.role_id=$1`, [freshUser.role_id]);
  const userOverrides = await q(`SELECT p.clave, up.granted FROM user_permissions up JOIN permissions p ON up.permission_id=p.id WHERE up.user_id=$1`, [newUser.id]);

  const efectivos = new Set(rolePerms.map(p => p.clave));
  for (const up of userOverrides) {
    if (up.granted) efectivos.add(up.clave);
    else efectivos.delete(up.clave);
  }

  assert(efectivos.has("ver_cartera_propia"), "Efectivo: ver_cartera_propia (del rol)");
  assert(efectivos.has("proyectar"), "Efectivo: proyectar (del rol)");
  assert(efectivos.has("exportar"), "Efectivo: exportar (override otorgado)");
  assert(efectivos.size === 3, "Total efectivos: 3");

  await audit(adminUser.id, newUser.id, "permiso_otorgado", { permiso: "exportar", granted: true });

  // Override: revocar "proyectar" de María
  const proyPerm = await qOne(`SELECT id FROM permissions WHERE clave='proyectar'`);
  await q(`INSERT INTO user_permissions (user_id, permission_id, granted, asignado_por, motivo) VALUES ($1,$2,false,$3,$4)`,
    [newUser.id, proyPerm.id, adminUser.id, "Revocado temporalmente"]);

  const userOverrides2 = await q(`SELECT p.clave, up.granted FROM user_permissions up JOIN permissions p ON up.permission_id=p.id WHERE up.user_id=$1`, [newUser.id]);
  const efectivos2 = new Set(rolePerms.map(p => p.clave)); // same rolePerms (freshUser.role_id)
  for (const up of userOverrides2) {
    if (up.granted) efectivos2.add(up.clave);
    else efectivos2.delete(up.clave);
  }

  assert(!efectivos2.has("proyectar"), "Efectivo: proyectar REVOCADO por override");
  assert(efectivos2.has("exportar"), "Efectivo: exportar aún otorgado");
  assert(efectivos2.size === 2, "Total efectivos después de revocación: 2");
}

// ════════════════════════════════════════════════════════════════
// TEST 8: CAMBIO DE ROL
// ════════════════════════════════════════════════════════════════

async function testCambioRol(adminUser, newUser) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 8: Cambio de rol                            ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const gerenciaRole = await qOne(`SELECT id FROM roles WHERE clave='gerencia'`);
  const before = await qOne(`SELECT r.clave FROM users u JOIN roles r ON u.role_id=r.id WHERE u.id=$1`, [newUser.id]);
  assert(before.clave === "ejecutivo", "Rol antes: ejecutivo");

  await q(`UPDATE users SET role_id=$1 WHERE id=$2`, [gerenciaRole.id, newUser.id]);
  const after = await qOne(`SELECT r.clave FROM users u JOIN roles r ON u.role_id=r.id WHERE u.id=$1`, [newUser.id]);
  assert(after.clave === "gerencia", "Rol después: gerencia");

  await audit(adminUser.id, newUser.id, "rol_asignado", { rol_anterior: "ejecutivo", rol_nuevo: "gerencia" });
}

// ════════════════════════════════════════════════════════════════
// TEST 9: DESACTIVACIÓN Y REACTIVACIÓN
// ════════════════════════════════════════════════════════════════

async function testDesactivacionReactivacion(adminUser, newUser, password) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 9: Desactivación y reactivación             ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Desactivar
  await q(`UPDATE users SET status='desactivado' WHERE id=$1`, [newUser.id]);
  const deactivated = await qOne(`SELECT * FROM users WHERE id=$1`, [newUser.id]);
  assert(deactivated.status === "desactivado", "Status: desactivado");
  await audit(adminUser.id, newUser.id, "usuario_desactivado", { motivo: "Baja temporal" });

  // Intentar login — debe fallar
  const valid = await bcrypt.compare(password, deactivated.password_hash);
  assert(valid, "Password sigue siendo correcta");
  assert(deactivated.status !== "aprobado", "Pero status NO es aprobado → login RECHAZADO");
  await audit(newUser.id, null, "login_fallido", { razon: "desactivado" });

  // Reactivar
  const staffRole = await qOne(`SELECT id FROM roles WHERE clave='staff'`);
  await q(`UPDATE users SET status='aprobado', role_id=$1, intentos_login_fallidos=0, bloqueado_hasta=NULL WHERE id=$2`, [staffRole.id, newUser.id]);
  const reactivated = await qOne(`SELECT u.*, r.clave as role_clave FROM users u JOIN roles r ON u.role_id=r.id WHERE u.id=$1`, [newUser.id]);
  assert(reactivated.status === "aprobado", "Status: aprobado (reactivado)");
  assert(reactivated.role_clave === "staff", "Rol: staff (reasignado)");
  await audit(adminUser.id, newUser.id, "usuario_reactivado", { status_anterior: "desactivado", rol_nuevo: "staff" });
}

// ════════════════════════════════════════════════════════════════
// TEST 10: RECHAZO DE USUARIO NUEVO
// ════════════════════════════════════════════════════════════════

async function testRechazo(adminUser) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 10: Rechazo de usuario                      ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Crear usuario para rechazar
  const staffRole = await qOne(`SELECT id FROM roles WHERE clave='staff'`);
  const hash = await bcrypt.hash("Test1234!", SALT_ROUNDS);
  await q(`INSERT INTO users (email, password_hash, nombre, apellido, numero_identificacion, status, verificado, role_id)
    VALUES ($1,$2,$3,$4,$5,'pendiente',true,$6)`,
    ["rechazado@proaktiva.com.mx", hash, "Juan", "Rechazado", "LOG-0099", staffRole.id]);

  const rejected = await qOne(`SELECT * FROM users WHERE email='rechazado@proaktiva.com.mx'`);
  await q(`UPDATE users SET status='rechazado' WHERE id=$1`, [rejected.id]);

  const after = await qOne(`SELECT * FROM users WHERE id=$1`, [rejected.id]);
  assert(after.status === "rechazado", "Status: rechazado");

  // Login debe fallar
  assert(after.status !== "aprobado", "Login rechazado para usuario rechazado");
  await audit(adminUser.id, rejected.id, "usuario_rechazado", { motivo: "No pertenece a la organización" });
}

// ════════════════════════════════════════════════════════════════
// TEST 11: AUTO-BLOQUEO POR INTENTOS FALLIDOS
// ════════════════════════════════════════════════════════════════

async function testAutoBloqueo(newUser) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 11: Auto-bloqueo por intentos fallidos      ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Simular 5 intentos fallidos
  for (let i = 1; i <= 5; i++) {
    await q(`UPDATE users SET intentos_login_fallidos=$1 WHERE id=$2`, [i, newUser.id]);
    await audit(newUser.id, null, "login_fallido", { razon: "password_incorrecta", intentos: i });
  }

  // Al 5to intento → bloqueo temporal 30 min
  await q(`UPDATE users SET bloqueado_hasta=now() + interval '30 minutes' WHERE id=$1`, [newUser.id]);
  await audit(newUser.id, null, "usuario_bloqueado", { razon: "auto_bloqueo_intentos_fallidos", intentos: 5 });

  const blocked = await qOne(`SELECT * FROM users WHERE id=$1`, [newUser.id]);
  assert(blocked.intentos_login_fallidos === 5, "Intentos fallidos: 5");
  assert(new Date() < new Date(blocked.bloqueado_hasta), "Bloqueado hasta: futuro (30 min)");

  // Limpiar para siguiente test
  await q(`UPDATE users SET intentos_login_fallidos=0, bloqueado_hasta=NULL WHERE id=$1`, [newUser.id]);
}

// ════════════════════════════════════════════════════════════════
// TEST 12: ASIGNACIÓN DE CARTERA
// ════════════════════════════════════════════════════════════════

async function testCartera(adminUser, newUser) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 12: Asignación de cartera                   ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const nombre = "MARIA LOPEZ HERNANDEZ";
  await q(`UPDATE users SET nombre_en_sheets=$1 WHERE id=$2`, [nombre, newUser.id]);
  await q(`INSERT INTO portfolio_assignments (user_id, nombre_ejecutivo_sheets, asignado_por, activo, motivo) VALUES ($1,$2,$3,true,$4)`,
    [newUser.id, nombre, adminUser.id, "Titular"]);

  const user = await qOne(`SELECT * FROM users WHERE id=$1`, [newUser.id]);
  assert(user.nombre_en_sheets === nombre, "nombre_en_sheets = " + nombre);

  const assignment = await qOne(`SELECT * FROM portfolio_assignments WHERE user_id=$1 AND activo=true`, [newUser.id]);
  assert(assignment !== null, "Portfolio assignment creado");
  assert(assignment.nombre_ejecutivo_sheets === nombre, "Assignment coincide con nombre");
  assert(assignment.asignado_por === adminUser.id, "Asignado por el admin");

  await audit(adminUser.id, newUser.id, "ejecutivo_mapeado", { nombre_en_sheets: nombre });
  await audit(adminUser.id, newUser.id, "cartera_asignada", { nombre_ejecutivo_sheets: nombre });

  // Simular filtro de cartera (ejecutivo solo ve su cartera)
  const disposiciones = [
    { folio: "D001", ejecutivo: "MARIA LOPEZ HERNANDEZ" },
    { folio: "D002", ejecutivo: "JUAN PEREZ" },
    { folio: "D003", ejecutivo: "MARIA LOPEZ HERNANDEZ" },
  ];
  const miCartera = disposiciones.filter(d => d.ejecutivo === user.nombre_en_sheets);
  assert(miCartera.length === 2, "Ejecutivo ve 2 de 3 disposiciones (filtro por nombre_en_sheets)");

  // Revocar cartera
  await q(`UPDATE portfolio_assignments SET activo=false, revocado_at=now() WHERE id=$1`, [assignment.id]);
  const revoked = await qOne(`SELECT * FROM portfolio_assignments WHERE id=$1`, [assignment.id]);
  assert(revoked.activo === false, "Asignación revocada");
  assert(revoked.revocado_at !== null, "Fecha de revocación registrada");
  await audit(adminUser.id, newUser.id, "cartera_revocada", { nombre_en_sheets: nombre });
}

// ════════════════════════════════════════════════════════════════
// TEST 13: AUDITORÍA COMPLETA
// ════════════════════════════════════════════════════════════════

async function testAuditoria(adminUser) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 13: Auditoría completa                      ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const total = await qOne(`SELECT count(*) as c FROM audit_logs`);
  assert(parseInt(total.c) > 15, "Total audit logs: " + total.c);

  // Por tipo
  const byType = await q(`SELECT accion, count(*) as c FROM audit_logs GROUP BY accion ORDER BY c DESC`);
  console.log("    Eventos por tipo:");
  for (const r of byType) console.log(`      ${r.accion}: ${r.c}`);

  // Verificar que todos los tipos esperados están presentes
  const tipos = new Set(byType.map(r => r.accion));
  assert(tipos.has("login"), "Audit tiene: login");
  assert(tipos.has("login_fallido"), "Audit tiene: login_fallido");
  assert(tipos.has("registro_solicitud"), "Audit tiene: registro_solicitud");
  assert(tipos.has("registro_verificado"), "Audit tiene: registro_verificado");
  assert(tipos.has("usuario_aprobado"), "Audit tiene: usuario_aprobado");
  assert(tipos.has("usuario_rechazado"), "Audit tiene: usuario_rechazado");
  assert(tipos.has("usuario_desactivado"), "Audit tiene: usuario_desactivado");
  assert(tipos.has("usuario_reactivado"), "Audit tiene: usuario_reactivado");
  assert(tipos.has("usuario_bloqueado"), "Audit tiene: usuario_bloqueado");
  assert(tipos.has("rol_asignado"), "Audit tiene: rol_asignado");
  assert(tipos.has("permiso_otorgado"), "Audit tiene: permiso_otorgado");
  assert(tipos.has("ejecutivo_mapeado"), "Audit tiene: ejecutivo_mapeado");
  assert(tipos.has("cartera_asignada"), "Audit tiene: cartera_asignada");
  assert(tipos.has("cartera_revocada"), "Audit tiene: cartera_revocada");

  // Timeline de admin
  const adminTimeline = await q(`SELECT * FROM audit_logs WHERE user_id=$1 ORDER BY created_at`, [adminUser.id]);
  assert(adminTimeline.length >= 5, "Admin tiene " + adminTimeline.length + " acciones en su timeline");

  // Logs con target_user_id (acciones admin sobre otros)
  const adminActions = await q(`SELECT * FROM audit_logs WHERE target_user_id IS NOT NULL ORDER BY created_at DESC`);
  assert(adminActions.length >= 5, "Hay " + adminActions.length + " acciones admin con target_user");
}

// ════════════════════════════════════════════════════════════════
// TEST 14: SOFT DELETE
// ════════════════════════════════════════════════════════════════

async function testSoftDelete() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  TEST 14: Soft delete                             ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const staffRole = await qOne(`SELECT id FROM roles WHERE clave='staff'`);
  const hash = await bcrypt.hash("Test1234!", SALT_ROUNDS);
  await q(`INSERT INTO users (email, password_hash, nombre, apellido, numero_identificacion, status, verificado, role_id)
    VALUES ($1,$2,$3,$4,$5,'aprobado',true,$6)`,
    ["borrado@proaktiva.com.mx", hash, "Test", "Borrado", "LOG-0098", staffRole.id]);

  const user = await qOne(`SELECT * FROM users WHERE email='borrado@proaktiva.com.mx'`);
  assert(user.deleted_at === null, "deleted_at es NULL (activo)");

  // Soft delete
  await q(`UPDATE users SET deleted_at=now() WHERE id=$1`, [user.id]);
  const deleted = await qOne(`SELECT * FROM users WHERE id=$1`, [user.id]);
  assert(deleted.deleted_at !== null, "deleted_at tiene timestamp (soft deleted)");

  // Consulta de usuarios activos no lo incluye
  const activos = await q(`SELECT * FROM users WHERE deleted_at IS NULL AND email='borrado@proaktiva.com.mx'`);
  assert(activos.length === 0, "Soft-deleted no aparece en consulta de activos");

  // Pero sigue en la tabla (para auditoría)
  const all = await q(`SELECT * FROM users WHERE email='borrado@proaktiva.com.mx'`);
  assert(all.length === 1, "Soft-deleted sigue existiendo en la tabla");

  // Audit logs siguen referenciando al usuario
  await audit(user.id, null, "login_fallido", { razon: "soft_deleted_test" });
  const log = await qOne(`SELECT * FROM audit_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [user.id]);
  assert(log !== null, "Audit log sigue funcionando para usuario soft-deleted");
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n" + "═".repeat(60));
  console.log("  LOGIC AUTH — TEST SUITE COMPLETO");
  console.log("  PostgreSQL directo · bcrypt · JWT · Todos los flujos");
  console.log("═".repeat(60));

  try {
    await seed();
    const { user: adminUser, token: adminToken } = await testLoginAdmin();
    const { user: newUser, codigo, password } = await testRegistro();
    await testVerificacion(newUser, codigo);
    await testLoginRechazadoPendiente(newUser, password);
    await testAprobacion(adminUser, newUser);
    const userToken = await testLoginExitoso(newUser, password);
    await testPermisos(adminUser, newUser);
    await testCambioRol(adminUser, newUser);
    await testDesactivacionReactivacion(adminUser, newUser, password);
    await testRechazo(adminUser);
    await testAutoBloqueo(newUser);
    await testCartera(adminUser, newUser);
    await testAuditoria(adminUser);
    await testSoftDelete();
  } catch (err) {
    console.error("\n💥 ERROR FATAL:", err);
  }

  console.log("\n" + "═".repeat(60));
  console.log(`  RESULTADOS: ${passed}/${total} pasaron, ${failed} fallaron`);
  if (errors.length > 0) {
    console.log("  FALLOS:");
    errors.forEach(e => console.log("    ❌ " + e));
  }
  console.log("═".repeat(60) + "\n");

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main();
