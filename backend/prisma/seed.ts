import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Logic Auth database...');

  // ── 1. ROLES ──
  const roles = [
    { clave: 'admin_maestro', nombre: 'Administrador Maestro', descripcion: 'Control total del sistema', es_sistema: true },
    { clave: 'admin', nombre: 'Administrador', descripcion: 'Gestión de usuarios y configuración', es_sistema: true },
    { clave: 'gerencia', nombre: 'Gerencia', descripcion: 'Consulta de toda la cartera', es_sistema: true },
    { clave: 'ejecutivo', nombre: 'Ejecutivo', descripcion: 'Consulta de cartera asignada', es_sistema: true },
    { clave: 'staff', nombre: 'Staff', descripcion: 'Consulta general', es_sistema: true },
  ];

  for (const r of roles) {
    await prisma.role.upsert({
      where: { clave: r.clave },
      update: {},
      create: r,
    });
  }
  console.log('  ✓ 5 roles creados');

  // ── 2. PERMISOS ──
  const permisos = [
    { clave: 'ver_todos_creditos', nombre: 'Ver todos los créditos', modulo: 'cartera', descripcion: 'Acceso a toda la cartera' },
    { clave: 'ver_cartera_propia', nombre: 'Ver cartera asignada', modulo: 'cartera', descripcion: 'Solo su cartera (ejecutivo)' },
    { clave: 'proyectar', nombre: 'Proyectar disposiciones', modulo: 'proyeccion', descripcion: 'Ejecutar motor M4' },
    { clave: 'exportar', nombre: 'Exportar base proyectada', modulo: 'proyeccion', descripcion: 'Descargar XLSX proyectado' },
    { clave: 'admin_usuarios', nombre: 'Administrar usuarios', modulo: 'admin', descripcion: 'CRUD de usuarios' },
    { clave: 'aprobar_usuarios', nombre: 'Aprobar/Rechazar usuarios', modulo: 'admin', descripcion: 'Flujo de aprobación' },
    { clave: 'asignar_roles', nombre: 'Asignar roles', modulo: 'admin', descripcion: 'Cambiar rol de usuario' },
    { clave: 'asignar_cartera', nombre: 'Asignar cartera', modulo: 'admin', descripcion: 'Mapear ejecutivo a Sheets' },
    { clave: 'ver_log', nombre: 'Ver log de auditoría', modulo: 'admin', descripcion: 'Consultar audit_logs' },
    { clave: 'sincronizar', nombre: 'Sincronizar con Sheets', modulo: 'sync', descripcion: 'Disparar sincronización' },
    { clave: 'recibir_codigos', nombre: 'Recibir códigos de verificación', modulo: 'auth', descripcion: 'Ver códigos de nuevos usuarios' },
  ];

  for (const p of permisos) {
    await prisma.permission.upsert({
      where: { clave: p.clave },
      update: {},
      create: p,
    });
  }
  console.log('  ✓ ' + permisos.length + ' permisos creados');

  // ── 3. ASIGNAR PERMISOS A ROLES ──
  const matrix: Record<string, string[]> = {
    admin_maestro: [
      'ver_todos_creditos', 'proyectar', 'exportar', 'admin_usuarios',
      'aprobar_usuarios', 'asignar_roles', 'asignar_cartera', 'ver_log',
      'sincronizar', 'recibir_codigos',
    ],
    admin: [
      'ver_todos_creditos', 'proyectar', 'exportar', 'admin_usuarios',
      'aprobar_usuarios', 'asignar_roles', 'asignar_cartera', 'ver_log',
      'sincronizar',
    ],
    gerencia: ['ver_todos_creditos', 'proyectar', 'exportar'],
    ejecutivo: ['ver_cartera_propia', 'proyectar'],
    staff: ['ver_todos_creditos', 'proyectar', 'exportar'],
  };

  for (const [roleClave, permClaves] of Object.entries(matrix)) {
    const role = await prisma.role.findUnique({ where: { clave: roleClave } });
    if (!role) continue;

    for (const permClave of permClaves) {
      const perm = await prisma.permission.findUnique({ where: { clave: permClave } });
      if (!perm) continue;

      await prisma.rolePermission.upsert({
        where: { role_id_permission_id: { role_id: role.id, permission_id: perm.id } },
        update: {},
        create: { role_id: role.id, permission_id: perm.id },
      });
    }
  }
  console.log('  ✓ Permisos asignados a roles');

  // ── 4. USUARIO ADMIN MAESTRO INICIAL ──
  const adminRole = await prisma.role.findUnique({ where: { clave: 'admin_maestro' } });
  if (adminRole) {
    const existingAdmin = await prisma.user.findUnique({ where: { email: 'gerardo.bejarano@proaktiva.com.mx' } });
    if (!existingAdmin) {
      const hash = await bcrypt.hash('g1L2P3E4290500!', 12);
      await prisma.user.create({
        data: {
          email: 'gerardo.bejarano@proaktiva.com.mx',
          password_hash: hash,
          nombre: 'Gerardo',
          apellido: 'Bejarano',
          area: 'Sistemas',
          numero_identificacion: 'LOG-0001',
          status: 'aprobado',
          verificado: true,
          role_id: adminRole.id,
        },
      });
      console.log('  ✓ Usuario admin maestro creado (gerardo.bejarano@proaktiva.com.mx)');
    } else {
      console.log('  ⊘ Admin maestro ya existe');
    }
  }

  console.log('\nSeed completado.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
