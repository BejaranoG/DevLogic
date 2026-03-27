/**
 * engine/periodo/__tests__/calendario.test.ts
 * Tests del Motor de Periodo (M1).
 * Cubre: esDiaHabil, siguienteDiaHabil, resolverCalendario,
 * resolverFechaOperativa, construirPeriodos.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  esDiaHabil,
  siguienteDiaHabil,
  resolverCalendario,
  resolverFechaOperativa,
  normalizarReglaDiaHabil,
  construirPeriodos,
} from "../index";
import type { Amortizacion } from "../../shared/types";

// Helper: crear Date sin timezone issues
function d(dateStr: string): Date {
  const [y, m, day] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, day);
}

// =========================================================================
// esDiaHabil
// =========================================================================

describe("esDiaHabil", () => {
  it("lunes normal es hábil en MX", () => {
    expect(esDiaHabil(d("2026-03-23"), "MX")).toBe(true);
  });

  it("sábado es inhábil", () => {
    expect(esDiaHabil(d("2026-03-21"), "MX")).toBe(false);
  });

  it("domingo es inhábil", () => {
    expect(esDiaHabil(d("2026-03-22"), "MX")).toBe(false);
  });

  it("1 de enero es inhábil en MX", () => {
    expect(esDiaHabil(d("2026-01-01"), "MX")).toBe(false);
  });

  it("1 de enero es inhábil en US", () => {
    expect(esDiaHabil(d("2026-01-01"), "US")).toBe(false);
  });

  it("4 de julio es hábil en MX pero inhábil en US (2025)", () => {
    // 4 jul 2025 es viernes
    expect(esDiaHabil(d("2025-07-04"), "MX")).toBe(true);
    expect(esDiaHabil(d("2025-07-04"), "US")).toBe(false);
  });

  it("16 de septiembre es inhábil en MX pero hábil en US", () => {
    // 16 sep 2026 es miércoles
    expect(esDiaHabil(d("2026-09-16"), "MX")).toBe(false);
    expect(esDiaHabil(d("2026-09-16"), "US")).toBe(true);
  });
});

// =========================================================================
// siguienteDiaHabil
// =========================================================================

describe("siguienteDiaHabil", () => {
  it("retorna la misma fecha si ya es hábil", () => {
    const result = siguienteDiaHabil(d("2026-03-23"), "MX"); // lunes
    expect(result.getTime()).toBe(d("2026-03-23").getTime());
  });

  it("sábado → lunes", () => {
    const result = siguienteDiaHabil(d("2026-03-21"), "MX"); // sábado
    expect(result.getTime()).toBe(d("2026-03-23").getTime()); // lunes
  });

  it("domingo → lunes", () => {
    const result = siguienteDiaHabil(d("2026-03-22"), "MX"); // domingo
    expect(result.getTime()).toBe(d("2026-03-23").getTime()); // lunes
  });

  it("viernes festivo + fin de semana → lunes (bloque de 3)", () => {
    // 2026-04-03 es Viernes Santo MX
    const result = siguienteDiaHabil(d("2026-04-03"), "MX");
    expect(result.getTime()).toBe(d("2026-04-06").getTime()); // lunes 6
  });
});

// =========================================================================
// resolverCalendario
// =========================================================================

describe("resolverCalendario", () => {
  it("TIIE 28 BANXICO PM → MX", () => {
    expect(resolverCalendario("TIIE 28 BANXICO PM")).toBe("MX");
  });

  it("TIIE 365 ANUAL → MX", () => {
    expect(resolverCalendario("TIIE 365 ANUAL")).toBe("MX");
  });

  it("TASA FIJA → MX", () => {
    expect(resolverCalendario("TASA FIJA")).toBe("MX");
  });

  it("SOFR 6 MESES → US", () => {
    expect(resolverCalendario("SOFR 6 MESES")).toBe("US");
  });

  it("SOFR 1 MES → US", () => {
    expect(resolverCalendario("SOFR 1 MES")).toBe("US");
  });

  it("tipo desconocido lanza error", () => {
    expect(() => resolverCalendario("LIBOR")).toThrow("no reconocido");
  });
});

// =========================================================================
// normalizarReglaDiaHabil
// =========================================================================

describe("normalizarReglaDiaHabil", () => {
  it("CON → DIA_HABIL_SIGUIENTE", () => {
    expect(normalizarReglaDiaHabil("CON DIA HABIL POSTERIOR")).toBe(
      "DIA_HABIL_SIGUIENTE"
    );
  });

  it("SIN → DIA_HABIL_ANTERIOR", () => {
    expect(normalizarReglaDiaHabil("SIN DIA HABIL POSTERIOR")).toBe(
      "DIA_HABIL_ANTERIOR"
    );
  });
});

// =========================================================================
// resolverFechaOperativa
// =========================================================================

describe("resolverFechaOperativa", () => {
  it("Ejemplo 1 del documento: DHA, 15/abr sábado", () => {
    // 15 abril 2028 es sábado (usamos 2028 donde esto aplica)
    // Pero para usar el ejemplo del doc: simulamos con una fecha que sabemos es sábado
    // 2026-04-18 es sábado
    const Fc = d("2026-04-18"); // sábado
    const result = resolverFechaOperativa(Fc, "DIA_HABIL_ANTERIOR", "MX");

    // DHA: Fk = Fc (no se mueve)
    expect(result.fecha_corte.getTime()).toBe(d("2026-04-18").getTime());
    // Fp = siguiente hábil = lunes 20
    expect(result.fecha_limite_pago.getTime()).toBe(d("2026-04-20").getTime());
    // Fi = Fp + 1 = martes 21
    expect(result.fecha_inicio_impago.getTime()).toBe(d("2026-04-21").getTime());
  });

  it("DHS, fecha inhábil: Fp se mueve, Fk = Fp-1", () => {
    const Fc = d("2026-04-18"); // sábado
    const result = resolverFechaOperativa(Fc, "DIA_HABIL_SIGUIENTE", "MX");

    // DHS: Fp = lunes 20, Fk = Fp-1 = domingo 19
    expect(result.fecha_limite_pago.getTime()).toBe(d("2026-04-20").getTime());
    expect(result.fecha_corte.getTime()).toBe(d("2026-04-19").getTime());
    expect(result.fecha_inicio_impago.getTime()).toBe(d("2026-04-21").getTime());
  });

  it("fecha hábil: ambas reglas producen el mismo resultado", () => {
    const Fc = d("2026-04-15"); // miércoles
    const dha = resolverFechaOperativa(Fc, "DIA_HABIL_ANTERIOR", "MX");
    const dhs = resolverFechaOperativa(Fc, "DIA_HABIL_SIGUIENTE", "MX");

    expect(dha.fecha_corte.getTime()).toBe(dhs.fecha_corte.getTime());
    expect(dha.fecha_limite_pago.getTime()).toBe(dhs.fecha_limite_pago.getTime());
    expect(dha.fecha_inicio_impago.getTime()).toBe(dhs.fecha_inicio_impago.getTime());
  });

  it("Fp siempre es día hábil", () => {
    // Probar varias fechas
    const fechas = [
      d("2026-04-18"), // sábado
      d("2026-04-19"), // domingo
      d("2026-01-01"), // festivo MX
      d("2026-03-16"), // festivo MX (3er lunes mar)
    ];
    for (const f of fechas) {
      const result = resolverFechaOperativa(f, "DIA_HABIL_ANTERIOR", "MX");
      expect(esDiaHabil(result.fecha_limite_pago, "MX")).toBe(true);
    }
  });
});

// =========================================================================
// construirPeriodos
// =========================================================================

describe("construirPeriodos", () => {
  it("disposición con 3 amortizaciones mensuales", () => {
    const amorts: Amortizacion[] = [
      {
        folio_disposicion: "T1",
        numero_amortizacion: 1,
        fecha_vencimiento: d("2026-04-15"), // miércoles hábil
        monto_capital: new Decimal(150000),
        amortizacion_liquidada: true,
      },
      {
        folio_disposicion: "T1",
        numero_amortizacion: 2,
        fecha_vencimiento: d("2026-05-15"), // viernes hábil
        monto_capital: new Decimal(150000),
        amortizacion_liquidada: false,
      },
      {
        folio_disposicion: "T1",
        numero_amortizacion: 3,
        fecha_vencimiento: d("2026-06-15"), // lunes hábil
        monto_capital: new Decimal(150000),
        amortizacion_liquidada: false,
      },
    ];

    const periodos = construirPeriodos(
      amorts,
      "DIA_HABIL_ANTERIOR",
      "TIIE 28 BANXICO PM",
      d("2026-03-15") // fecha entrega
    );

    expect(periodos).toHaveLength(3);

    // Periodo 1: 15/mar → 15/abr = 31 días
    expect(periodos[0].dias_periodo).toBe(31);
    expect(periodos[0].liquidada).toBe(true);

    // Periodo 2: 15/abr → 15/may = 30 días
    expect(periodos[1].dias_periodo).toBe(30);

    // Periodo 3: 15/may → 15/jun = 31 días
    expect(periodos[2].dias_periodo).toBe(31);
  });

  it("disposición con 1 sola amortización (capital al vencimiento)", () => {
    const amorts: Amortizacion[] = [
      {
        folio_disposicion: "CCC1",
        numero_amortizacion: 1,
        fecha_vencimiento: d("2026-07-15"),
        monto_capital: new Decimal(1000000),
        amortizacion_liquidada: false,
      },
    ];

    const periodos = construirPeriodos(
      amorts,
      "DIA_HABIL_SIGUIENTE",
      "TIIE 28 BANXICO PM",
      d("2026-03-20")
    );

    expect(periodos).toHaveLength(1);
    // 20/mar → 15/jul = 117 días
    expect(periodos[0].dias_periodo).toBe(117);
  });

  it("lanza error si periodo es negativo", () => {
    const amorts: Amortizacion[] = [
      {
        folio_disposicion: "BAD",
        numero_amortizacion: 1,
        fecha_vencimiento: d("2026-03-15"), // antes de entrega
        monto_capital: new Decimal(100),
        amortizacion_liquidada: false,
      },
    ];

    expect(() =>
      construirPeriodos(
        amorts,
        "DIA_HABIL_ANTERIOR",
        "TIIE 28 BANXICO PM",
        d("2026-03-20") // entrega posterior al vencimiento
      )
    ).toThrow("Periodo no positivo");
  });
});
