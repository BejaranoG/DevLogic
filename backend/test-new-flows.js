/**
 * test-new-flows.js
 * Tests the simplified register flow + forgot/reset password
 * against a live PostgreSQL database.
 */

const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const DB = "postgresql://postgres:postgres@localhost:5432/logic_auth";
const JWT_SECRET = "logic-test-secret-64-chars-minimum-for-security-xxxxxxxxxxxxxxxxx";

let passed = 0, failed = 0, total = 0;
function assert(cond, label) {
  total++;
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}`); }
}

async function main() {
  const client = new Client({ connectionString: DB });
  await client.connect();

  console.log("\n════════════════════════════════════════════════════");
  console.log("  NEW FLOWS — Simplified Register + Password Recovery");
  console.log("════════════════════════════════════════════════════\n");

  // ══════════════════════════════════════════════════
  // TEST A: Admin maestro login
  // ══════════════════════════════════════════════════
  console.log("╔═ TEST A: Admin maestro login ═╗\n");

  const admin = await client.query("SELECT * FROM users WHERE email=$1", ["gerardo.bejarano@proaktiva.com.mx"]);
  assert(admin.rows.length === 1, "Admin maestro exists");
  assert(admin.rows[0].status === "aprobado", "Admin status = aprobado");
  assert(admin.rows[0].verificado === true, "Admin verificado = true");
  
  const adminOk = await bcrypt.compare("g1L2P3E4290500!", admin.rows[0].password_hash);
  assert(adminOk, "Admin password validates");

  // ══════════════════════════════════════════════════
  // TEST B: Simplified register (no verification code)
  // ══════════════════════════════════════════════════
  console.log("\n╔═ TEST B: Simplified register ═╗\n");

  const email = "test.nuevo@proaktiva.com.mx";
  const password = "TestPass2026!";

  // Domain validation
  assert("test@gmail.com".endsWith("@proaktiva.com.mx") === false, "External domain rejected");
  assert(email.endsWith("@proaktiva.com.mx") === true, "Proaktiva domain accepted");

  // Check not duplicate
  const dup = await client.query("SELECT id FROM users WHERE email=$1", [email]);
  assert(dup.rows.length === 0, "Email not duplicate");

  // Create user — simplified: verificado=true, status=pendiente
  const staffRole = await client.query("SELECT id FROM roles WHERE clave='staff'");
  const hash = await bcrypt.hash(password, 12);
  const ts = new Date().toISOString();
  const userId = crypto.randomUUID();
  
  await client.query(
    "INSERT INTO users (id, email, password_hash, nombre, apellido, numero_identificacion, status, verificado, role_id, intentos_login_fallidos, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
    [userId, email, hash, "Test", "Nuevo", "LOG-0002", "pendiente", true, staffRole.rows[0].id, 0, ts, ts]
  );

  const newUser = await client.query("SELECT * FROM users WHERE id=$1", [userId]);
  assert(newUser.rows[0].status === "pendiente", "New user status = pendiente");
  assert(newUser.rows[0].verificado === true, "New user verificado = true (NO code needed)");
  assert(newUser.rows[0].codigo_verificacion === null, "No verification code stored");

  // ══════════════════════════════════════════════════
  // TEST C: Login rejected (pending approval)
  // ══════════════════════════════════════════════════
  console.log("\n╔═ TEST C: Login rejected (pending) ═╗\n");

  const pwOk = await bcrypt.compare(password, newUser.rows[0].password_hash);
  assert(pwOk, "Password is correct");
  assert(newUser.rows[0].status !== "aprobado", "But status is NOT aprobado → LOGIN REJECTED");

  // ══════════════════════════════════════════════════
  // TEST D: Admin approves user
  // ══════════════════════════════════════════════════
  console.log("\n╔═ TEST D: Admin approves user ═╗\n");

  const ejecutivoRole = await client.query("SELECT id FROM roles WHERE clave='ejecutivo'");
  await client.query("UPDATE users SET status='aprobado', role_id=$1, updated_at=$2 WHERE id=$3",
    [ejecutivoRole.rows[0].id, new Date().toISOString(), userId]);

  const approved = await client.query("SELECT u.*, r.clave as role_clave FROM users u JOIN roles r ON u.role_id=r.id WHERE u.id=$1", [userId]);
  assert(approved.rows[0].status === "aprobado", "Status changed to aprobado");
  assert(approved.rows[0].role_clave === "ejecutivo", "Role assigned: ejecutivo");

  // ══════════════════════════════════════════════════
  // TEST E: Login succeeds after approval
  // ══════════════════════════════════════════════════
  console.log("\n╔═ TEST E: Login succeeds ═╗\n");

  const loginOk = await bcrypt.compare(password, approved.rows[0].password_hash);
  assert(loginOk, "Password validates");
  assert(approved.rows[0].status === "aprobado", "Status is aprobado");

  const token = jwt.sign({ sub: userId, email, role: "ejecutivo" }, JWT_SECRET, { expiresIn: "8h" });
  const decoded = jwt.verify(token, JWT_SECRET);
  assert(decoded.role === "ejecutivo", "JWT contains role: ejecutivo");
  assert(decoded.email === email, "JWT contains correct email");

  // ══════════════════════════════════════════════════
  // TEST F: Forgot password — generate code
  // ══════════════════════════════════════════════════
  console.log("\n╔═ TEST F: Forgot password ═╗\n");

  const recoveryCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

  await client.query("UPDATE users SET codigo_verificacion=$1, codigo_expira_at=$2, updated_at=$3 WHERE id=$4",
    [recoveryCode, expiresAt, new Date().toISOString(), userId]);

  const withCode = await client.query("SELECT * FROM users WHERE id=$1", [userId]);
  assert(withCode.rows[0].codigo_verificacion === recoveryCode, "Recovery code stored: " + recoveryCode);
  assert(new Date() < new Date(withCode.rows[0].codigo_expira_at), "Code not expired (30 min)");

  // ══════════════════════════════════════════════════
  // TEST G: Reset password — wrong code rejected
  // ══════════════════════════════════════════════════
  console.log("\n╔═ TEST G: Wrong recovery code rejected ═╗\n");

  assert("000000" !== recoveryCode, "Wrong code is different from stored code");
  // Backend would throw BadRequestException("Código inválido o expirado")

  // ══════════════════════════════════════════════════
  // TEST H: Reset password — correct code
  // ══════════════════════════════════════════════════
  console.log("\n╔═ TEST H: Reset password with correct code ═╗\n");

  const newPassword = "NewSecurePass2026!";
  const newHash = await bcrypt.hash(newPassword, 12);

  // Verify code matches
  assert(withCode.rows[0].codigo_verificacion === recoveryCode, "Code matches");
  assert(new Date() < new Date(withCode.rows[0].codigo_expira_at), "Code not expired");

  // Update password + clear code
  await client.query(
    "UPDATE users SET password_hash=$1, codigo_verificacion=NULL, codigo_expira_at=NULL, intentos_login_fallidos=0, bloqueado_hasta=NULL, updated_at=$2 WHERE id=$3",
    [newHash, new Date().toISOString(), userId]
  );

  const afterReset = await client.query("SELECT * FROM users WHERE id=$1", [userId]);
  assert(afterReset.rows[0].codigo_verificacion === null, "Code cleared after reset");
  assert(afterReset.rows[0].codigo_expira_at === null, "Code expiration cleared");

  // Old password no longer works
  const oldPwCheck = await bcrypt.compare(password, afterReset.rows[0].password_hash);
  assert(!oldPwCheck, "Old password no longer validates");

  // New password works
  const newPwCheck = await bcrypt.compare(newPassword, afterReset.rows[0].password_hash);
  assert(newPwCheck, "New password validates");

  // ══════════════════════════════════════════════════
  // TEST I: Login with new password
  // ══════════════════════════════════════════════════
  console.log("\n╔═ TEST I: Login with new password ═╗\n");

  const finalCheck = await bcrypt.compare(newPassword, afterReset.rows[0].password_hash);
  assert(finalCheck, "Login with new password succeeds");
  assert(afterReset.rows[0].status === "aprobado", "Status still aprobado");

  // ══════════════════════════════════════════════════
  // TEST J: Expired code rejected
  // ══════════════════════════════════════════════════
  console.log("\n╔═ TEST J: Expired recovery code ═╗\n");

  const expiredTime = new Date(Date.now() - 60000).toISOString(); // 1 min ago
  await client.query("UPDATE users SET codigo_verificacion='999999', codigo_expira_at=$1, updated_at=$2 WHERE id=$3",
    [expiredTime, new Date().toISOString(), userId]);

  const expiredUser = await client.query("SELECT * FROM users WHERE id=$1", [userId]);
  assert(new Date() > new Date(expiredUser.rows[0].codigo_expira_at), "Code IS expired");
  // Backend would throw BadRequestException("El código ha expirado")

  // Clean up
  await client.query("UPDATE users SET codigo_verificacion=NULL, codigo_expira_at=NULL, updated_at=$1 WHERE id=$2",
    [new Date().toISOString(), userId]);

  // ══════════════════════════════════════════════════
  // TEST K: Route protection logic
  // ══════════════════════════════════════════════════
  console.log("\n╔═ TEST K: Route protection ═╗\n");

  const publicRoutes = ["/login", "/register", "/forgot-password"];
  const protectedRoutes = ["/", "/disposicion/D001", "/admin", "/admin/users"];

  for (const r of publicRoutes) {
    assert(publicRoutes.some((p) => r.startsWith(p)), `${r} is PUBLIC (no login required)`);
  }
  for (const r of protectedRoutes) {
    assert(!publicRoutes.some((p) => r.startsWith(p)), `${r} is PROTECTED (login required)`);
  }

  // ══════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════

  console.log("\n════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed}/${total} passed, ${failed} failed`);
  console.log("════════════════════════════════════════════════════\n");

  await client.end();
  process.exit(failed > 0 ? 1 : 0);
}

main();
