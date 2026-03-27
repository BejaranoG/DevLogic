"use client";

import { useState } from "react";

type Section = "general" | "motores" | "datos" | "usuarios" | "chatbot";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "general", label: "Funcionamiento General", icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
  { key: "motores", label: "Motores de Cálculo", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  { key: "datos", label: "Modelo de Datos", icon: "M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16M9 11h.01M15 11h.01" },
  { key: "usuarios", label: "Usuarios y Roles", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
  { key: "chatbot", label: "LogicBot (IA)", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
];

export default function AyudaPage() {
  const [active, setActive] = useState<Section>("general");

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="dash-title">Centro de Ayuda</h1>
          <p className="dash-sub">Documentación y guía de uso de Logic — Proaktiva</p>
        </div>
      </div>

      {/* Navigation */}
      <div style={{
        display: "flex", gap: 0, marginBottom: 20,
        borderBottom: "2px solid var(--border)",
        overflowX: "auto",
      }}>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer",
              background: "none", border: "none",
              borderBottom: active === s.key ? "2px solid var(--purple)" : "2px solid transparent",
              color: active === s.key ? "var(--purple)" : "var(--text3)",
              marginBottom: -2, transition: "color .15s, border-color .15s",
              whiteSpace: "nowrap",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={s.icon} /></svg>
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{
        background: "var(--surface)", border: "1.5px solid var(--border)",
        borderRadius: 12, padding: "32px 36px", boxShadow: "var(--shadow)",
        fontSize: 14, lineHeight: 1.7, color: "var(--text)",
        marginBottom: 80,
      }}>
        {active === "general" && <SectionGeneral />}
        {active === "motores" && <SectionMotores />}
        {active === "datos" && <SectionDatos />}
        {active === "usuarios" && <SectionUsuarios />}
        {active === "chatbot" && <SectionChatbot />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════ */

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: "32px 0 12px", paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>{children}</h2>
);
const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--purple)", margin: "24px 0 8px" }}>{children}</h3>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ margin: "8px 0", color: "var(--text2)" }}>{children}</p>
);
const Ul = ({ children }: { children: React.ReactNode }) => (
  <ul style={{ margin: "8px 0 8px 20px", color: "var(--text2)" }}>{children}</ul>
);
const Code = ({ children }: { children: React.ReactNode }) => (
  <code style={{ background: "rgba(99,102,241,.08)", color: "var(--purple)", padding: "2px 6px", borderRadius: 4, fontSize: 13, fontFamily: "'Geist Mono', monospace" }}>{children}</code>
);
const InfoBox = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: "rgba(37,99,235,.06)", border: "1px solid rgba(37,99,235,.15)", borderRadius: 10, padding: "14px 18px", margin: "16px 0" }}>
    <div style={{ fontWeight: 700, fontSize: 13, color: "#2563eb", marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 13, color: "var(--text2)" }}>{children}</div>
  </div>
);
const Table = ({ headers, rows }: { headers: string[]; rows: string[][] }) => (
  <div style={{ overflowX: "auto", margin: "12px 0" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>{headers.map((h, i) => <th key={i} style={{ textAlign: "left", padding: "8px 12px", background: "var(--surface2, rgba(0,0,0,.03))", borderBottom: "2px solid var(--border)", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--border2, rgba(0,0,0,.06))" }}>
            {row.map((cell, j) => <td key={j} style={{ padding: "8px 12px", color: "var(--text2)" }}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* ═══════════════════════════════════════════════════════════
   1. FUNCIONAMIENTO GENERAL
   ═══════════════════════════════════════════════════════════ */

function SectionGeneral() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>Funcionamiento General de Logic</h1>
      <P>Logic es una herramienta web interna de Proaktiva diseñada para proyectar saldos futuros de créditos y disposiciones. Responde preguntas operativas como: ¿cuánto interés tendrá que pagar un crédito en X días?, ¿cuál será su interés vencido para tal fecha?, ¿qué parte del capital estará vigente, en impago o vencido?</P>

      <H2>¿Qué hace Logic?</H2>
      <Ul>
        <li>Se conecta a <strong>Google Sheets</strong> donde viven las bases de datos de cartera (Activa y Pasiva).</li>
        <li>Sincroniza automáticamente al cargar la página.</li>
        <li>Calcula y proyecta saldos futuros usando un <strong>motor de 4 módulos</strong> (M1-M4).</li>
        <li>Clasifica disposiciones según <strong>IFRS9</strong> (Etapas 1, 2 y 3).</li>
        <li>Genera reportes de cobranza con interés estimado y adeudos.</li>
        <li>Permite consultas inteligentes a través de <strong>LogicBot</strong> (IA).</li>
      </Ul>

      <H2>Páginas principales</H2>

      <H3>Dashboard (Cartera)</H3>
      <P>Pantalla principal al iniciar sesión. Muestra KPIs de la cartera, gráficas de distribución por etapa IFRS9, tipo de producto, top 10 clientes por exposición y vencimientos próximos.</P>
      <Ul>
        <li><strong>Tabs Activa / Pasiva:</strong> Permite alternar entre la cartera activa y la pasiva (solo para roles autorizados: Gerencia, Cartera, Admin).</li>
        <li><strong>Toggle Original / Consolidado MXN:</strong> En modo consolidado, los saldos en USD se convierten a MXN usando el tipo de cambio "Para Pagos" de Banxico SIE (serie SF60653), vinculado a la fecha de la cartera.</li>
        <li><strong>Tabla de disposiciones:</strong> Lista todas las disposiciones con folio, cliente, ejecutivo, capital vigente, tasa, vencimiento y status (vigente/impago/vencido).</li>
        <li><strong>Exportar XLSX:</strong> Descarga la base completa proyectada a una fecha objetivo.</li>
      </Ul>

      <H3>Detalle de Disposición</H3>
      <P>Al hacer clic en una disposición se accede a su vista de detalle con dos secciones:</P>
      <Ul>
        <li><strong>Tab General:</strong> Semáforo de status, saldos desglosados (capital, interés ordinario, refinanciado, moratorio), KPIs, controles de proyección y tabla de amortización.</li>
        <li><strong>Tab Tabla de Amortización:</strong> Muestra todas las amortizaciones con fecha contractual, fecha límite de pago (ajustada por día hábil), capital, interés estimado, total y status (liquidada/pendiente/vencida).</li>
      </Ul>
      <InfoBox title="Proyección">
        Al seleccionar una fecha y presionar "Proyectar", el motor calcula día a día los saldos futuros bajo escenario de no pago. Si la fecha coincide con un vencimiento, se muestra una card azul con el desglose del pago (capital + interés estimado).
      </InfoBox>

      <H3>Composición de tasa</H3>
      <P>En el detalle de cada disposición se muestra la composición de la tasa:</P>
      <Ul>
        <li><strong>TIIE + Spread:</strong> Ejemplo: "TIIE 9.83% + 4.50% = 14.33%"</li>
        <li><strong>SOFR + Spread:</strong> Para créditos en USD.</li>
        <li><strong>Tasa Fija:</strong> Ejemplo: "Tasa Fija 12.00%"</li>
      </Ul>

      <H3>Reportes</H3>
      <P>Sección de generación de reportes operativos.</P>
      <Ul>
        <li><strong>Reporte de Cobranza:</strong> Genera las próximas amortizaciones a pagar en un rango de fechas (máx 30 días). Incluye capital, interés estimado, adeudos previos opcionales. Se puede seleccionar cartera activa o pasiva. Para la cartera pasiva incluye adicionalmente Identificador de Fondeo y Fuente de Fondeo. Exportable a XLSX.</li>
      </Ul>

      <H3>Panel Administrativo</H3>
      <P>Solo accesible para roles Admin y Admin Maestro. Incluye: gestión de usuarios (aprobar, rechazar, cambiar rol), roles y permisos, log de auditoría y actividad de login.</P>

      <H2>Tipo de cambio</H2>
      <P>Logic obtiene el tipo de cambio USD/MXN de Banxico SIE, serie SF60653 ("Para Pagos"). El TC se vincula a la <strong>fecha de la cartera</strong> (fecha_saldo), no a la fecha de hoy. Si la fecha cae en fin de semana o día inhábil, se toma el último día hábil anterior (busca hasta 5 días atrás).</P>
      <P>El TC se cachea en memoria por fecha: si la cartera no cambia de fecha, no se vuelve a consultar Banxico.</P>

      <H2>Zona horaria</H2>
      <P>Toda la lógica de determinación de "hoy" (disclaimer de fecha, status de amortizaciones, fechas default de reportes) se rige por <strong>PDT (America/Los_Angeles, UTC-7)</strong>.</P>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   2. MOTORES DE CÁLCULO
   ═══════════════════════════════════════════════════════════ */

function SectionMotores() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>Motores de Cálculo</h1>
      <P>Logic utiliza 4 módulos que trabajan en conjunto para proyectar saldos. Cada módulo es independiente y tiene una responsabilidad específica.</P>

      <H2>M1 — Motor de Periodo</H2>
      <P>Determina las fechas operativas de cada amortización: cuándo se corta el periodo, cuándo vence el pago, y cuándo inicia el impago.</P>

      <H3>Tres fechas operativas</H3>
      <Table headers={["Símbolo", "Nombre", "Descripción"]} rows={[
        ["Fk", "Fecha de corte", "Último día que genera interés dentro del periodo."],
        ["Fp", "Fecha límite de pago", "Último día para pagar sin entrar en impago. Siempre un día hábil."],
        ["Fi", "Fecha inicio impago", "Primer día de atraso si no se pagó. Fi = Fp + 1 día."],
      ]} />

      <H3>Reglas de día hábil</H3>
      <Table headers={["Regla", "Comportamiento", "Calendario"]} rows={[
        ["SIN DIA HABIL POSTERIOR (Día Hábil Anterior)", "La fecha de corte es la contractual. El cliente puede pagar el siguiente día hábil.", "TIIE/Tasa Fija → México. SOFR → Estados Unidos."],
        ["CON DIA HABIL POSTERIOR (Día Hábil Siguiente)", "El vencimiento se recorre al siguiente día hábil. Los días inhábiles extienden el periodo.", "TIIE/Tasa Fija → México. SOFR → Estados Unidos."],
      ]} />

      <H3>Sub-periodos mensuales</H3>
      <P>Para disposiciones con esquema periódico donde el capital NO es periódico (ej: CCC con 1 amortización al final pero interés mensual), se generan sub-periodos de interés en el día aniversario. El día aniversario se obtiene de <Code>fecha_final.getDate()</Code>.</P>

      <H2>M2 — Motor de Intereses</H2>
      <P>Calcula tres tipos de interés: ordinario, moratorio y refinanciado. Es un módulo de cálculo puro — no modifica saldos, solo retorna montos.</P>

      <H3>Interés ordinario diario</H3>
      <InfoBox title="Fórmula">
        Base × (TasaBaseOrdinaria / 100) / 360
        <br />Donde Base = Capital Vigente + Capital VNE (+ Refinanciado en capitalización)
      </InfoBox>

      <H3>Interés moratorio diario</H3>
      <InfoBox title="Fórmula">
        Base × (TasaBaseOrdinaria × 2 / 100) / 360
        <br />Donde Base = Capital Impago + Capital VE (+ Refinanciado impago/VE en capitalización)
        <br />Solo se calcula si hay capital en impago o vencido exigible.
        <br /><strong>El moratorio se calcula desde el primer día de impago.</strong>
      </InfoBox>

      <H3>Conversión a refinanciado (capitalización)</H3>
      <P>Al cierre de un periodo, el interés ordinario vigente se reclasifica como interés refinanciado vigente. Esto genera efecto compuesto: el interés genera más interés.</P>

      <H3>Esquemas de interés</H3>
      <Table headers={["Esquema", "Comportamiento del interés", "Exigibilidad"]} rows={[
        ["Cobro periódico", "Se calcula diario, se acumula por periodo", "Exigible al cierre de cada periodo"],
        ["Acumulación", "Se calcula diario, se acumula continuamente", "Exigible solo al vencer el capital"],
        ["Capitalización", "Se calcula diario con base ampliada (incluye refinanciado)", "Se convierte a refinanciado al cierre, exigible al vencer capital"],
      ]} />

      <H3>Productos sin interés diario</H3>
      <Ul>
        <li><strong>Factoraje:</strong> Interés pagado anticipadamente. M2 retorna cero.</li>
        <li><strong>Arrendamiento:</strong> Rentas fijas. No genera interés.</li>
      </Ul>

      <H2>M3 — Motor de Etapas y Movimientos</H2>
      <P>Clasifica cada disposición en Etapa IFRS9 según los días de atraso y reclasifica saldos cuando se cruza un umbral.</P>

      <H3>Umbrales por producto</H3>
      <Table headers={["Producto", "Etapa 1", "Etapa 2", "Etapa 3"]} rows={[
        ["Crédito Simple / Refaccionario (periódico)", "0–30 días", "31–89 días", "≥90 días"],
        ["Crédito Simple / Refaccionario (acumulación/capitalización)", "0–29 días", "No aplica", "≥30 días"],
        ["CCC / Hab. Avío", "0–29 días", "No aplica", "≥30 días"],
        ["Factoraje", "0–29 días", "No aplica", "≥30 días"],
      ]} />

      <H3>Reclasificación a Etapa 3</H3>
      <P>Cuando los días de atraso cruzan el umbral de E3, todos los saldos se reclasifican masivamente:</P>
      <Ul>
        <li>Capital vigente → Capital VNE (vencido no exigible)</li>
        <li>Capital impago → Capital VE (vencido exigible)</li>
        <li>Interés vigente → Interés VNE</li>
        <li>Interés impago → Interés VE</li>
        <li>Refinanciado vigente → Refinanciado VNE</li>
        <li>Refinanciado impago → Refinanciado VE</li>
      </Ul>

      <H2>M4 — Motor de Proyección</H2>
      <P>Orquesta M1, M2 y M3 en un loop día a día desde T₀ (fecha de la cartera) hasta la fecha objetivo.</P>

      <H3>Loop diario (7 pasos estrictos)</H3>
      <InfoBox title="Orden de ejecución">
        El orden es crítico. Se modificó para que el moratorio se calcule correctamente desde el primer día de impago.
      </InfoBox>
      <Table headers={["Paso", "Módulo", "Acción"]} rows={[
        ["1", "M4", "Verificar vencimiento de capital → mover a impago"],
        ["2a", "M4", "Periódico: mover interés a impago en fecha_inicio_impago"],
        ["2b", "M4", "Capitalización: convertir interés a refinanciado en fecha_corte"],
        ["3", "M2", "Calcular interés ordinario y moratorio del día"],
        ["4", "M4", "Acumular intereses en los buckets correspondientes"],
        ["5", "M4", "Incrementar días de atraso si hay saldos en impago/VE"],
        ["6", "M3", "Evaluar transición de etapa IFRS9"],
        ["7", "M4", "Guardar snapshot diario"],
      ]} />

      <H3>Supuesto fundamental</H3>
      <P><strong>Escenario de no pago:</strong> La proyección asume que el cliente no realiza ningún pago futuro. La tasa se congela al valor de T₀.</P>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   3. MODELO DE DATOS
   ═══════════════════════════════════════════════════════════ */

function SectionDatos() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>Modelo de Datos</h1>
      <P>Logic trabaja con dos fuentes de datos: Google Sheets (cartera y amortizaciones) y PostgreSQL (autenticación).</P>

      <H2>Google Sheets (Motor de Cálculo)</H2>
      <P>Se sincronizan desde un Spreadsheet público compartido. Mismo Spreadsheet, pestañas diferentes.</P>
      <Table headers={["Pestaña", "Contenido", "Columnas usadas"]} rows={[
        ["Cartera Activa", "Snapshot de todas las disposiciones activas", "35 de 107"],
        ["Cartera Activa Amortizaciones", "Tabla de amortizaciones por disposición", "12 de 79"],
        ["Cartera Pasiva", "Snapshot de disposiciones pasivas (mismas columnas)", "35 de 107"],
        ["Cartera Pasiva Amortizaciones", "Amortizaciones de cartera pasiva", "12 de 79"],
      ]} />

      <H3>Estado de saldos (14 variables)</H3>
      <P>Cada disposición tiene 14 variables de saldo que el motor mantiene y proyecta:</P>
      <Table headers={["Categoría", "Variables"]} rows={[
        ["Capital (4)", "Vigente, Impago, Vencido Exigible, Vencido No Exigible"],
        ["Interés ordinario (4)", "Vigente, Impago, VE, VNE"],
        ["Interés refinanciado (4)", "Vigente, Impago, VE, VNE (solo en capitalización)"],
        ["Moratorio (2)", "Provisionado (E1/E2), Calculado (E3)"],
      ]} />

      <H3>Productos soportados</H3>
      <Table headers={["Producto", "Esquemas", "Genera interés diario"]} rows={[
        ["Crédito Simple", "Periódico, Acumulación, Capitalización", "Sí"],
        ["Refaccionario", "Periódico, Acumulación, Capitalización", "Sí"],
        ["CCC / Hab. Avío", "Capitalización, Acumulación", "Sí"],
        ["Factoraje", "Anticipado", "No (interés anticipado)"],
        ["Arrendamiento", "Rentas fijas", "No"],
      ]} />

      <H2>Campos de fondeo (solo Cartera Pasiva)</H2>
      <P>La cartera pasiva incluye dos campos adicionales visibles en el reporte de cobranza:</P>
      <Ul>
        <li><strong>IDENTIFICADOR DE FONDEO:</strong> ID del fondeador asignado a la disposición.</li>
        <li><strong>FUENTE DE FONDEO:</strong> Descripción de la fuente de fondeo.</li>
      </Ul>

      <H2>PostgreSQL (Autenticación)</H2>
      <P>Alojada en Railway. Contiene 7 tablas para el sistema de autenticación:</P>
      <Ul>
        <li><strong>users:</strong> Usuarios con email @proaktiva.com.mx, contraseña hasheada (bcrypt 12 rounds), status, rol asignado.</li>
        <li><strong>roles:</strong> 6 roles del sistema (admin_maestro, admin, gerencia, cartera, ejecutivo, staff).</li>
        <li><strong>permissions:</strong> 12 permisos granulares organizados por módulo.</li>
        <li><strong>role_permissions:</strong> Asignación de permisos a roles.</li>
        <li><strong>user_permissions:</strong> Overrides de permisos por usuario (otorgar o revocar sin cambiar rol).</li>
        <li><strong>portfolio_assignments:</strong> Historial de asignaciones de cartera a ejecutivos.</li>
        <li><strong>audit_logs:</strong> Registro inmutable de 22 tipos de eventos (login, aprobaciones, cambios de rol, etc.).</li>
      </Ul>

      <InfoBox title="UUIDs">
        Prisma genera los UUIDs en JavaScript (crypto.randomUUID()), no en PostgreSQL. El seed usa ON CONFLICT DO NOTHING para ser idempotente.
      </InfoBox>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   4. USUARIOS Y ROLES
   ═══════════════════════════════════════════════════════════ */

function SectionUsuarios() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>Usuarios y Roles</h1>

      <H2>Flujo de registro</H2>
      <Ul>
        <li>El usuario va a /register y crea su cuenta con email @proaktiva.com.mx.</li>
        <li>La cuenta queda en estado <strong>pendiente</strong> hasta que un administrador la apruebe.</li>
        <li>Al aprobar, el admin asigna un rol.</li>
        <li>El usuario ya puede hacer login.</li>
      </Ul>

      <H2>Flujo de login</H2>
      <P>Autenticación con JWT (duración 8 horas). Incluye protección contra fuerza bruta: después de 5 intentos fallidos, la cuenta se bloquea por 30 minutos.</P>

      <H2>Recuperación de contraseña</H2>
      <P>Se envía un código de 6 dígitos al email del usuario (vía Gmail SMTP). El código expira en 30 minutos.</P>

      <H2>Roles del sistema</H2>
      <Table headers={["Rol", "Cartera", "Cartera Pasiva", "Proyectar", "Exportar", "Admin"]} rows={[
        ["Admin Maestro", "Toda", "✓", "✓", "✓", "Control total"],
        ["Admin", "Toda", "✓", "✓", "✓", "Gestión de usuarios"],
        ["Gerencia", "Toda", "✓", "✓", "✓", "—"],
        ["Cartera", "Toda", "✓", "✓", "✓", "—"],
        ["Ejecutivo", "Solo su cartera", "—", "✓", "—", "—"],
        ["Staff", "Toda", "—", "✓", "✓", "—"],
      ]} />

      <H3>Detalle por rol</H3>
      <Ul>
        <li><strong>Admin Maestro:</strong> Control total. Creado por seed. No se puede asignar manualmente. Único que puede ver códigos de verificación.</li>
        <li><strong>Admin:</strong> Gestión de usuarios (aprobar, rechazar, cambiar roles, asignar cartera), auditoría, sincronización.</li>
        <li><strong>Gerencia:</strong> Ve toda la cartera activa y pasiva. Puede proyectar y exportar. Sin acceso a admin.</li>
        <li><strong>Cartera:</strong> Mismas facultades que Gerencia. Diseñado para el equipo de cartera pasiva.</li>
        <li><strong>Ejecutivo:</strong> Solo ve las disposiciones asignadas a su nombre (filtrado por nombre_en_sheets). Puede proyectar pero no exportar. No ve cartera pasiva.</li>
        <li><strong>Staff:</strong> Ve toda la cartera activa. Puede proyectar y exportar. No ve cartera pasiva.</li>
      </Ul>

      <H2>Permisos</H2>
      <P>12 permisos granulares organizados por módulo:</P>
      <Table headers={["Permiso", "Módulo", "Descripción"]} rows={[
        ["ver_todos_creditos", "cartera", "Acceso a toda la cartera"],
        ["ver_cartera_propia", "cartera", "Solo su cartera (ejecutivo)"],
        ["ver_cartera_pasiva", "cartera", "Acceso a cartera pasiva"],
        ["proyectar", "proyección", "Ejecutar motor de proyección"],
        ["exportar", "proyección", "Descargar XLSX proyectado"],
        ["admin_usuarios", "admin", "Gestión de usuarios"],
        ["aprobar_usuarios", "admin", "Aprobar/rechazar solicitudes"],
        ["asignar_roles", "admin", "Cambiar rol de usuario"],
        ["asignar_cartera", "admin", "Mapear ejecutivo a Sheets"],
        ["ver_log", "admin", "Consultar auditoría"],
        ["sincronizar", "sync", "Disparar sincronización"],
        ["recibir_codigos", "auth", "Ver códigos de verificación"],
      ]} />

      <InfoBox title="Overrides">
        Se puede otorgar o revocar un permiso específico a un usuario sin cambiar su rol, mediante la tabla user_permissions.
      </InfoBox>

      <H2>Auditoría</H2>
      <P>Todas las acciones se registran con: quién (user_id), sobre quién (target_user_id), qué acción, detalle JSON, IP, user agent y timestamp. 22 tipos de eventos incluyendo login, registro, aprobaciones, cambios de rol, asignaciones de cartera y exportaciones.</P>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   5. LOGICBOT (IA)
   ═══════════════════════════════════════════════════════════ */

function SectionChatbot() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>LogicBot — Asistente de Cartera con IA</h1>
      <P>LogicBot es un chatbot inteligente integrado en Logic, potenciado por Claude (Anthropic). Aparece como un botón flotante azul en la esquina inferior derecha de todas las páginas.</P>

      <H2>¿Qué puede hacer LogicBot?</H2>
      <Ul>
        <li>Responder preguntas sobre saldos y disposiciones de clientes.</li>
        <li>Explicar por qué un cliente tiene impago o está en cartera vencida.</li>
        <li>Detallar cómo se calcula el interés ordinario, moratorio o refinanciado.</li>
        <li><strong>Proyectar saldos a fechas futuras</strong> — ejecuta el motor M4 real cuando preguntas "¿cuánto tendrá que pagar X al 15 de abril?"</li>
        <li>Dar un resumen general de la cartera (total disposiciones, capital vigente, capital en impago, etc.).</li>
        <li>Responder dudas sobre el funcionamiento de la plataforma.</li>
      </Ul>

      <H2>¿Cómo funciona internamente?</H2>
      <P>LogicBot NO carga toda la cartera en el prompt (eso excedería los límites de tokens). En su lugar, utiliza <strong>3 herramientas</strong> que consulta bajo demanda:</P>
      <Table headers={["Herramienta", "Función", "Ejemplo de uso"]} rows={[
        ["buscar_cliente", "Busca disposiciones por nombre de cliente o folio", "\"¿Cuál es el saldo de Ganadera Rocha?\""],
        ["proyectar", "Ejecuta el motor M4 para una disposición a fecha futura", "\"¿Cuánto tendrá que pagar el folio 12843 al 15 de abril?\""],
        ["resumen_cartera", "Obtiene KPIs generales de toda la cartera", "\"¿Cuántas disposiciones están en Etapa 3?\""],
      ]} />

      <H3>Flujo típico de una consulta</H3>
      <Ul>
        <li>El usuario pregunta: "¿Cuánto tiene que pagar Ganadera Rocha al 15 de abril?"</li>
        <li>LogicBot llama a <Code>buscar_cliente("Ganadera Rocha")</Code> → obtiene los folios y saldos actuales.</li>
        <li>LogicBot llama a <Code>proyectar(folio, "2026-04-15")</Code> para cada disposición relevante.</li>
        <li>LogicBot presenta un resumen claro con montos formateados.</li>
      </Ul>

      <H2>Restricciones de seguridad</H2>
      <Ul>
        <li><strong>Solo lectura:</strong> LogicBot no puede modificar saldos, usuarios, ni configuración.</li>
        <li><strong>Filtrado por rol:</strong> Si el usuario es ejecutivo, LogicBot solo puede buscar y proyectar disposiciones de su cartera asignada.</li>
        <li><strong>Solo temas de Logic:</strong> Si le preguntas algo fuera del ámbito de cartera/saldos, indica que solo puede ayudar con temas de Logic.</li>
        <li><strong>No inventa datos:</strong> Si no encuentra una disposición o cliente, lo dice claramente.</li>
      </Ul>

      <H2>Ejemplos de preguntas</H2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "12px 0" }}>
        {[
          "¿Cuál es el saldo total de Constructora EYCO?",
          "¿Por qué el folio 12843 tiene impago?",
          "¿Cómo se calcula el interés moratorio?",
          "¿Cuánto tendrá que pagar Ganadera Rocha al 15 de abril?",
          "¿Cuántas disposiciones están en Etapa 3?",
          "¿Qué es el esquema de capitalización?",
          "¿Cuál es la tasa del folio 13104?",
          "Dame un resumen de la cartera",
        ].map((q, i) => (
          <div key={i} style={{
            background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.12)",
            borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--purple)",
          }}>
            {q}
          </div>
        ))}
      </div>

      <InfoBox title="Modelo de IA">
        LogicBot utiliza Claude Sonnet 4 de Anthropic. Las consultas se procesan en el servidor de Logic — el API key nunca se expone al navegador. El historial se mantiene solo durante la sesión del chat (máximo 10 mensajes de contexto).
      </InfoBox>
    </div>
  );
}
