/**
 * lib/auth/__tests__/auth.test.ts
 * Tests completos del sistema de autenticación y permisos.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  // Permisos
  puedeVerTodosCreditos,
  puedeProyectar,
  puedeAdminUsuarios,
  puedeVerLog,
  puedeSincronizar,
  puedeVerDisposicion,
  filtroCartera,
  validarDominioEmail,
  generarCodigoVerificacion,
  generarNumeroIdentificacion,
  requireAuth,
  requirePermiso,
  PermisoError,
  // Logger
  MemoryLogger,
  setLogger,
  registrarAccion,
  // Tipos
  type SesionUsuario,
} from "../index";

// ============================================================================
// Helpers
// ============================================================================

function sesion(perfil: string, nombreSheets?: string): SesionUsuario {
  return {
    id: "usr-1",
    email: "test@proaktiva.com.mx",
    nombre: "Test",
    apellido: "User",
    perfil: perfil as any,
    numero_identificacion: "LOG-0001",
    nombre_en_sheets: nombreSheets ?? null,
  };
}

// ============================================================================
// Validación de dominio de email
// ============================================================================

describe("validarDominioEmail", () => {
  it("acepta email @proaktiva.com.mx", () => {
    expect(validarDominioEmail("maria@proaktiva.com.mx").valido).toBe(true);
  });

  it("rechaza email de otro dominio", () => {
    const r = validarDominioEmail("maria@gmail.com");
    expect(r.valido).toBe(false);
    expect(r.error).toContain("@proaktiva.com.mx");
  });

  it("rechaza email sin @", () => {
    expect(validarDominioEmail("mariagmail.com").valido).toBe(false);
  });

  it("acepta con mayúsculas (normaliza)", () => {
    expect(validarDominioEmail("Maria@Proaktiva.com.mx").valido).toBe(true);
  });

  it("rechaza dominio similar pero incorrecto", () => {
    expect(validarDominioEmail("maria@proaktiva.com").valido).toBe(false);
    expect(validarDominioEmail("maria@proaktiva.mx").valido).toBe(false);
  });
});

// ============================================================================
// Generadores
// ============================================================================

describe("generarCodigoVerificacion", () => {
  it("genera código de 6 dígitos", () => {
    const codigo = generarCodigoVerificacion();
    expect(codigo).toMatch(/^\d{6}$/);
  });

  it("genera códigos diferentes", () => {
    const codigos = new Set(Array.from({ length: 100 }, () => generarCodigoVerificacion()));
    expect(codigos.size).toBeGreaterThan(90); // al menos 90 únicos de 100
  });
});

describe("generarNumeroIdentificacion", () => {
  it("genera LOG-0001 para el primer usuario", () => {
    expect(generarNumeroIdentificacion(0)).toBe("LOG-0001");
  });

  it("genera LOG-0042 para el usuario 42", () => {
    expect(generarNumeroIdentificacion(41)).toBe("LOG-0042");
  });

  it("soporta más de 9999 usuarios", () => {
    expect(generarNumeroIdentificacion(9999)).toBe("LOG-10000");
  });
});

// ============================================================================
// Permisos por perfil
// ============================================================================

describe("Permisos: Admin Maestro", () => {
  const s = sesion("admin_maestro");

  it("ve todos los créditos", () => expect(puedeVerTodosCreditos(s)).toBe(true));
  it("puede proyectar", () => expect(puedeProyectar(s)).toBe(true));
  it("puede admin usuarios", () => expect(puedeAdminUsuarios(s)).toBe(true));
  it("puede ver log", () => expect(puedeVerLog(s)).toBe(true));
  it("puede sincronizar", () => expect(puedeSincronizar(s)).toBe(true));
});

describe("Permisos: Administrador", () => {
  const s = sesion("admin");

  it("ve todos los créditos", () => expect(puedeVerTodosCreditos(s)).toBe(true));
  it("puede admin usuarios", () => expect(puedeAdminUsuarios(s)).toBe(true));
  it("puede sincronizar", () => expect(puedeSincronizar(s)).toBe(true));
});

describe("Permisos: Gerencia", () => {
  const s = sesion("gerencia");

  it("ve todos los créditos", () => expect(puedeVerTodosCreditos(s)).toBe(true));
  it("puede proyectar", () => expect(puedeProyectar(s)).toBe(true));
  it("NO puede admin usuarios", () => expect(puedeAdminUsuarios(s)).toBe(false));
  it("NO puede ver log", () => expect(puedeVerLog(s)).toBe(false));
  it("NO puede sincronizar", () => expect(puedeSincronizar(s)).toBe(false));
});

describe("Permisos: Ejecutivo", () => {
  const s = sesion("ejecutivo", "MARIA ISABEL SUAREZ CASTILLO");

  it("NO ve todos los créditos", () => expect(puedeVerTodosCreditos(s)).toBe(false));
  it("puede proyectar", () => expect(puedeProyectar(s)).toBe(true));
  it("NO puede admin usuarios", () => expect(puedeAdminUsuarios(s)).toBe(false));
  it("NO puede ver log", () => expect(puedeVerLog(s)).toBe(false));
  it("NO puede sincronizar", () => expect(puedeSincronizar(s)).toBe(false));
});

describe("Permisos: Staff", () => {
  const s = sesion("staff");

  it("ve todos los créditos", () => expect(puedeVerTodosCreditos(s)).toBe(true));
  it("puede proyectar", () => expect(puedeProyectar(s)).toBe(true));
  it("NO puede admin usuarios", () => expect(puedeAdminUsuarios(s)).toBe(false));
});

// ============================================================================
// Filtro de cartera para Ejecutivo
// ============================================================================

describe("puedeVerDisposicion", () => {
  it("admin ve cualquier disposición", () => {
    const s = sesion("admin");
    expect(puedeVerDisposicion(s, "CUALQUIER NOMBRE")).toBe(true);
  });

  it("gerencia ve cualquier disposición", () => {
    const s = sesion("gerencia");
    expect(puedeVerDisposicion(s, "CUALQUIER NOMBRE")).toBe(true);
  });

  it("ejecutivo ve solo su cartera", () => {
    const s = sesion("ejecutivo", "MARIA ISABEL SUAREZ CASTILLO");
    expect(puedeVerDisposicion(s, "MARIA ISABEL SUAREZ CASTILLO")).toBe(true);
    expect(puedeVerDisposicion(s, "SEBASTIAN ACOSTA LOPEZ")).toBe(false);
  });

  it("comparación case-insensitive", () => {
    const s = sesion("ejecutivo", "maria isabel suarez castillo");
    expect(puedeVerDisposicion(s, "MARIA ISABEL SUAREZ CASTILLO")).toBe(true);
  });

  it("ejecutivo sin nombre_en_sheets no ve nada", () => {
    const s = sesion("ejecutivo"); // sin nombre
    expect(puedeVerDisposicion(s, "MARIA ISABEL SUAREZ CASTILLO")).toBe(false);
  });
});

describe("filtroCartera", () => {
  it("admin: retorna null (sin filtro)", () => {
    expect(filtroCartera(sesion("admin"))).toBeNull();
  });

  it("ejecutivo: retorna nombre_en_sheets", () => {
    const s = sesion("ejecutivo", "SCARLETT OREGEL MAGAÑA");
    expect(filtroCartera(s)).toBe("SCARLETT OREGEL MAGAÑA");
  });
});

// ============================================================================
// Middleware helpers
// ============================================================================

describe("requireAuth", () => {
  it("no lanza si hay sesión", () => {
    expect(() => requireAuth(sesion("staff"))).not.toThrow();
  });

  it("lanza PermisoError 401 si no hay sesión", () => {
    try {
      requireAuth(null);
      expect.fail("debería haber lanzado");
    } catch (e) {
      expect(e).toBeInstanceOf(PermisoError);
      expect((e as PermisoError).statusCode).toBe(401);
    }
  });

  it("lanza PermisoError 401 si sesión undefined", () => {
    try {
      requireAuth(undefined);
      expect.fail("debería haber lanzado");
    } catch (e) {
      expect(e).toBeInstanceOf(PermisoError);
    }
  });
});

describe("requirePermiso", () => {
  it("no lanza si tiene permiso", () => {
    expect(() =>
      requirePermiso(sesion("admin"), puedeAdminUsuarios, "admin_usuarios")
    ).not.toThrow();
  });

  it("lanza PermisoError 403 si no tiene permiso", () => {
    try {
      requirePermiso(sesion("ejecutivo"), puedeAdminUsuarios, "admin_usuarios");
      expect.fail("debería haber lanzado");
    } catch (e) {
      expect(e).toBeInstanceOf(PermisoError);
      expect((e as PermisoError).statusCode).toBe(403);
      expect((e as PermisoError).message).toContain("ejecutivo");
    }
  });
});

// ============================================================================
// Logger de auditoría
// ============================================================================

describe("MemoryLogger", () => {
  let logger: MemoryLogger;

  beforeEach(() => {
    logger = new MemoryLogger();
    setLogger(logger);
  });

  it("registra acciones", async () => {
    await registrarAccion(sesion("admin"), "login", { ip: "192.168.1.1" });
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0].accion).toBe("login");
    expect(logger.entries[0].email).toBe("test@proaktiva.com.mx");
  });

  it("registra login_fallido sin sesión", async () => {
    await registrarAccion(null, "login_fallido", { email: "hacker@gmail.com" });
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0].id_usuario).toBeNull();
    expect(logger.entries[0].accion).toBe("login_fallido");
  });

  it("consulta filtrada por acción", async () => {
    await registrarAccion(sesion("admin"), "login", {});
    await registrarAccion(sesion("admin"), "proyeccion", { folio: "13104" });
    await registrarAccion(sesion("admin"), "login", {});

    const logins = await logger.consultar({ accion: "login" });
    expect(logins).toHaveLength(2);
  });

  it("consulta filtrada por usuario", async () => {
    const s1 = { ...sesion("admin"), id: "usr-1" };
    const s2 = { ...sesion("ejecutivo"), id: "usr-2" };

    await registrarAccion(s1, "login", {});
    await registrarAccion(s2, "login", {});
    await registrarAccion(s1, "proyeccion", {});

    const usr1 = await logger.consultar({ id_usuario: "usr-1" });
    expect(usr1).toHaveLength(2);
  });

  it("retorna más reciente primero", async () => {
    await registrarAccion(sesion("admin"), "login", {});
    // Pequeño delay para que timestamps difieran
    await new Promise((r) => setTimeout(r, 10));
    await registrarAccion(sesion("admin"), "proyeccion", {});

    const entries = await logger.consultar({});
    expect(entries[0].accion).toBe("proyeccion"); // más reciente
    expect(entries[1].accion).toBe("login");
  });

  it("respeta limit", async () => {
    for (let i = 0; i < 10; i++) {
      await registrarAccion(sesion("admin"), "consulta_disposiciones", {});
    }

    const limited = await logger.consultar({ limit: 3 });
    expect(limited).toHaveLength(3);
  });
});

// ============================================================================
// AuthService (con store en memoria)
// ============================================================================

describe("AuthService", () => {
  // Implementación mínima de AuthStore en memoria para tests
  const crearStoreMemoria = () => {
    const usuarios: any[] = [];
    const solicitudes: any[] = [];
    let idCounter = 0;

    return {
      buscarUsuarioPorEmail: async (email: string) =>
        usuarios.find((u) => u.email === email) ?? null,
      buscarUsuarioPorId: async (id: string) =>
        usuarios.find((u) => u.id === id) ?? null,
      crearUsuario: async (data: any) => {
        idCounter++;
        const u = { ...data, id: `usr-${idCounter}`, created_at: new Date(), updated_at: new Date() };
        usuarios.push(u);
        return u;
      },
      actualizarUsuario: async (id: string, data: any) => {
        const idx = usuarios.findIndex((u) => u.id === id);
        if (idx >= 0) Object.assign(usuarios[idx], data);
        return usuarios[idx];
      },
      listarUsuarios: async () => [...usuarios],
      contarUsuarios: async () => usuarios.length,
      obtenerPasswordHash: async (email: string) => {
        const sol = solicitudes.find((s) => s.email === email && s.status === "verificada");
        return sol?.password_hash ?? null;
      },
      crearSolicitud: async (data: any) => {
        idCounter++;
        const s = { ...data, id: `sol-${idCounter}` };
        solicitudes.push(s);
        return s;
      },
      buscarSolicitudPorEmail: async (email: string) =>
        solicitudes.filter((s) => s.email === email).pop() ?? null,
      actualizarSolicitud: async (id: string, data: any) => {
        const idx = solicitudes.findIndex((s) => s.id === id);
        if (idx >= 0) Object.assign(solicitudes[idx], data);
      },
      listarSolicitudesPendientes: async () =>
        solicitudes.filter((s) => s.status === "pendiente"),
    };
  };

  // Importar dinámicamente para evitar circular deps
  let AuthService: any;

  beforeEach(async () => {
    const mod = await import("../service");
    AuthService = mod.AuthService;
    setLogger(new MemoryLogger());
  });

  it("flujo completo: registro → verificación → login", async () => {
    const store = crearStoreMemoria();
    const auth = new AuthService(store);

    // Paso 1: Solicitar registro
    const { codigo } = await auth.solicitarRegistro(
      "maria@proaktiva.com.mx",
      "SecurePass123!"
    );
    expect(codigo).toMatch(/^\d{6}$/);

    // Verificar que hay solicitud pendiente
    const pendientes = await auth.obtenerSolicitudesPendientes();
    expect(pendientes).toHaveLength(1);

    // Paso 2: Verificar código
    const { usuario_id } = await auth.verificarCodigo(
      "maria@proaktiva.com.mx",
      codigo
    );
    expect(usuario_id).toBeDefined();

    // Paso 3: Login
    const sesionResult = await auth.login("maria@proaktiva.com.mx", "SecurePass123!");
    expect(sesionResult.email).toBe("maria@proaktiva.com.mx");
    expect(sesionResult.perfil).toBe("staff"); // default
    expect(sesionResult.numero_identificacion).toBe("LOG-0001");
  });

  it("rechaza registro con dominio incorrecto", async () => {
    const store = crearStoreMemoria();
    const auth = new AuthService(store);

    await expect(
      auth.solicitarRegistro("maria@gmail.com", "pass")
    ).rejects.toThrow("@proaktiva.com.mx");
  });

  it("rechaza código incorrecto", async () => {
    const store = crearStoreMemoria();
    const auth = new AuthService(store);

    await auth.solicitarRegistro("test@proaktiva.com.mx", "pass");

    await expect(
      auth.verificarCodigo("test@proaktiva.com.mx", "000000")
    ).rejects.toThrow("incorrecto");
  });

  it("rechaza login con password incorrecta", async () => {
    const store = crearStoreMemoria();
    const auth = new AuthService(store);

    const { codigo } = await auth.solicitarRegistro("test@proaktiva.com.mx", "CorrectPass");
    await auth.verificarCodigo("test@proaktiva.com.mx", codigo);

    await expect(
      auth.login("test@proaktiva.com.mx", "WrongPass")
    ).rejects.toThrow("inválidas");
  });

  it("admin puede asignar perfil y mapear ejecutivo", async () => {
    const store = crearStoreMemoria();
    const auth = new AuthService(store);

    // Registro y verificación
    const { codigo } = await auth.solicitarRegistro("maria@proaktiva.com.mx", "pass123");
    const { usuario_id } = await auth.verificarCodigo("maria@proaktiva.com.mx", codigo);

    const adminSesion = sesion("admin_maestro");

    // Asignar perfil ejecutivo
    await auth.asignarPerfil(adminSesion, usuario_id, "ejecutivo");

    // Mapear nombre en Sheets
    await auth.mapearEjecutivo(
      adminSesion,
      usuario_id,
      "MARIA ISABEL SUAREZ CASTILLO"
    );

    // Verificar
    const usuarios = await auth.listarUsuarios();
    const maria = usuarios.find((u: any) => u.id === usuario_id)!;
    expect(maria.perfil).toBe("ejecutivo");
    expect(maria.nombre_en_sheets).toBe("MARIA ISABEL SUAREZ CASTILLO");
  });

  it("no puede desactivar al admin maestro", async () => {
    const store = crearStoreMemoria();
    const auth = new AuthService(store);

    // Crear admin maestro directamente
    const am = await store.crearUsuario({
      email: "jefe@proaktiva.com.mx",
      nombre: "Jefe",
      apellido: "Boss",
      area: "Dirección General",
      perfil: "admin_maestro",
      numero_identificacion: "LOG-0001",
      verificado: true,
      activo: true,
      nombre_en_sheets: null,
    });

    const adminSesion = sesion("admin");

    await expect(
      auth.desactivarUsuario(adminSesion, am.id)
    ).rejects.toThrow("Administrador Maestro");
  });
});
