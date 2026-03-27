import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { generarCobranza, validarParams } from "../motor";
import type { CobranzaParams } from "../motor";
import type { DisposicionNormalizada } from "../../../sync/normalizer";
import type { Disposicion, PeriodoOperativo, EstadoSaldos, ReglaEtapa } from "../../shared/types";
import { ZERO } from "../../shared/decimal-helpers";

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const D = (n: number) => new Decimal(n);
const d = (s: string) => {
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(y, m - 1, dd);
};

function saldos(overrides: Partial<Record<keyof EstadoSaldos, number>> = {}): EstadoSaldos {
  return {
    capital_vigente: D(overrides.capital_vigente ?? 0),
    capital_impago: D(overrides.capital_impago ?? 0),
    capital_vencido_exigible: D(overrides.capital_vencido_exigible ?? 0),
    capital_vencido_no_exigible: D(overrides.capital_vencido_no_exigible ?? 0),
    interes_ordinario_vigente: D(overrides.interes_ordinario_vigente ?? 0),
    interes_ordinario_impago: D(overrides.interes_ordinario_impago ?? 0),
    interes_ordinario_ve: D(overrides.interes_ordinario_ve ?? 0),
    interes_ordinario_vne: D(overrides.interes_ordinario_vne ?? 0),
    interes_refinanciado_vigente: D(overrides.interes_refinanciado_vigente ?? 0),
    interes_refinanciado_impago: D(overrides.interes_refinanciado_impago ?? 0),
    interes_refinanciado_ve: D(overrides.interes_refinanciado_ve ?? 0),
    interes_refinanciado_vne: D(overrides.interes_refinanciado_vne ?? 0),
    interes_moratorio_acumulado: D(overrides.interes_moratorio_acumulado ?? 0),
    interes_moratorio_calculado: D(overrides.interes_moratorio_calculado ?? 0),
  };
}

function mkDisp(overrides: Partial<Disposicion> = {}): Disposicion {
  return {
    folio_disposicion: overrides.folio_disposicion ?? "TEST-001",
    folio_linea: "L1",
    numero_contrato: "C1",
    cliente: overrides.cliente ?? "ACME SA",
    tipo_credito: overrides.tipo_credito ?? "credito_simple",
    esquema_interes: overrides.esquema_interes ?? "periodico",
    regla_dia_habil: "DIA_HABIL_ANTERIOR",
    tipo_tasa: "TIIE 28 BANXICO PM",
    tasa_base_ordinaria: overrides.tasa_base_ordinaria ?? D(18),
    moneda: "MEXICAN PESO",
    fecha_entrega: d("2025-01-15"),
    fecha_final_disposicion: d("2027-01-15"),
    fecha_final_contrato: d("2028-01-15"),
    fecha_saldo: overrides.fecha_saldo ?? d("2026-03-23"),
    etapa_ifrs9_actual: overrides.etapa_ifrs9_actual ?? 1,
    dias_atraso_actual: overrides.dias_atraso_actual ?? 0,
    saldos: overrides.saldos ?? saldos({ capital_vigente: 1000000 }),
    proyectable: true,
  };
}

function mkPeriodo(overrides: Partial<PeriodoOperativo> & { fecha_limite_pago: Date }): PeriodoOperativo {
  const fp = overrides.fecha_limite_pago;
  const fk = overrides.fecha_corte ?? fp;
  const fi = overrides.fecha_inicio_impago ?? new Date(fp.getFullYear(), fp.getMonth(), fp.getDate() + 1);
  return {
    numero_amortizacion: overrides.numero_amortizacion ?? 1,
    fecha_contractual: overrides.fecha_contractual ?? fp,
    fecha_corte: fk,
    fecha_limite_pago: fp,
    fecha_inicio_impago: fi,
    dias_periodo: overrides.dias_periodo ?? 30,
    monto_capital: overrides.monto_capital ?? ZERO,
    liquidada: overrides.liquidada ?? false,
    es_sintetica: overrides.es_sintetica ?? false,
  };
}

function mkNorm(
  disp: Disposicion,
  periodos: PeriodoOperativo[],
  folio_cliente = "CL-001",
  ejecutivo = "JUAN PEREZ"
): DisposicionNormalizada {
  return {
    disposicion: disp,
    amortizaciones: [],
    periodos,
    regla_etapa: { e1_max: 30, tiene_e2: true, e2_max: 89, e3_inicio: 90 },
    ejecutivo_disposicion: ejecutivo,
    folio_cliente,
  };
}

// ═══════════════════════════════════════════
// TESTS: VALIDACIÓN
// ═══════════════════════════════════════════

describe("Cobranza: validación de parámetros", () => {
  it("acepta rango válido de 30 días", () => {
    const err = validarParams({
      fechaDesde: d("2026-04-01"),
      fechaHasta: d("2026-04-30"),
      incluirAdeudos: false,
    });
    expect(err).toBeNull();
  });

  it("rechaza rango mayor a 30 días", () => {
    const err = validarParams({
      fechaDesde: d("2026-04-01"),
      fechaHasta: d("2026-05-02"),
      incluirAdeudos: false,
    });
    expect(err).toContain("30 días");
  });

  it("rechaza fecha final antes de fecha inicial", () => {
    const err = validarParams({
      fechaDesde: d("2026-04-15"),
      fechaHasta: d("2026-04-10"),
      incluirAdeudos: false,
    });
    expect(err).toContain("posterior");
  });

  it("acepta mismo día", () => {
    const err = validarParams({
      fechaDesde: d("2026-04-15"),
      fechaHasta: d("2026-04-15"),
      incluirAdeudos: false,
    });
    expect(err).toBeNull();
  });
});

// ═══════════════════════════════════════════
// TESTS: CASOS BÁSICOS
// ═══════════════════════════════════════════

describe("Cobranza: casos básicos", () => {
  it("encuentra un pago de capital + interés dentro del rango", () => {
    const disp = mkDisp({ tasa_base_ordinaria: D(18), saldos: saldos({ capital_vigente: 1000000 }) });
    const periodos = [
      mkPeriodo({
        numero_amortizacion: 5,
        fecha_limite_pago: d("2026-04-15"),
        dias_periodo: 30,
        monto_capital: D(200000),
      }),
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: false }
    );

    expect(result.lineas).toHaveLength(1);
    const l = result.lineas[0];
    expect(l.folio_disposicion).toBe("TEST-001");
    expect(l.cliente).toBe("ACME SA");
    expect(l.fecha_limite_pago).toBe("2026-04-15");
    expect(l.capital_periodo).toBe(200000);
    // Interés: 1,000,000 × 0.18 / 360 × 30 = 15,000
    expect(l.interes_periodo).toBe(15000);
    expect(l.total_periodo).toBe(215000);
    expect(l.adeudo_total).toBe(0);
    expect(l.total_a_pagar).toBe(215000);
  });

  it("excluye periodos liquidados", () => {
    const disp = mkDisp();
    const periodos = [
      mkPeriodo({ fecha_limite_pago: d("2026-04-15"), liquidada: true }),
      mkPeriodo({ fecha_limite_pago: d("2026-04-20"), numero_amortizacion: 2, liquidada: false }),
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: false }
    );

    expect(result.lineas).toHaveLength(1);
    expect(result.lineas[0].numero_amortizacion).toBe(2);
  });

  it("excluye periodos fuera del rango", () => {
    const disp = mkDisp();
    const periodos = [
      mkPeriodo({ fecha_limite_pago: d("2026-03-15") }), // antes
      mkPeriodo({ fecha_limite_pago: d("2026-05-15"), numero_amortizacion: 3 }), // después
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: false }
    );

    expect(result.lineas).toHaveLength(0);
  });

  it("retorna vacío si no hay disposiciones con pagos en rango", () => {
    const result = generarCobranza(
      [],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: false }
    );

    expect(result.lineas).toHaveLength(0);
    expect(result.resumen.total_lineas).toBe(0);
  });
});

// ═══════════════════════════════════════════
// TESTS: CCC CON SUB-PERIODOS (SOLO INTERÉS)
// ═══════════════════════════════════════════

describe("Cobranza: CCC con cobro periódico (solo interés)", () => {
  it("genera línea de pago de interés sin capital", () => {
    const disp = mkDisp({
      folio_disposicion: "CCC-001",
      tipo_credito: "ccc",
      tasa_base_ordinaria: D(24),
      saldos: saldos({ capital_vigente: 500000 }),
    });
    const periodos = [
      mkPeriodo({
        numero_amortizacion: 9001,
        fecha_limite_pago: d("2026-04-09"),
        dias_periodo: 27,
        monto_capital: ZERO, // solo interés
        es_sintetica: true,
      }),
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: false }
    );

    expect(result.lineas).toHaveLength(1);
    const l = result.lineas[0];
    expect(l.capital_periodo).toBe(0);
    // Interés: 500,000 × 0.24 / 360 × 27 = 9,000
    expect(l.interes_periodo).toBe(9000);
    expect(l.total_periodo).toBe(9000);
  });
});

// ═══════════════════════════════════════════
// TESTS: ADEUDOS PREVIOS
// ═══════════════════════════════════════════

describe("Cobranza: adeudos previos", () => {
  it("incluye adeudos cuando flag está activo", () => {
    const disp = mkDisp({
      saldos: saldos({
        capital_vigente: 800000,
        capital_impago: 100000,          // adeudo
        interes_ordinario_impago: 5000,  // adeudo
        interes_moratorio_acumulado: 2000, // adeudo
      }),
    });
    const periodos = [
      mkPeriodo({
        fecha_limite_pago: d("2026-04-15"),
        dias_periodo: 30,
        monto_capital: D(200000),
      }),
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: true }
    );

    const l = result.lineas[0];
    expect(l.adeudo_capital).toBe(100000);
    expect(l.adeudo_interes).toBe(5000);
    expect(l.adeudo_moratorio).toBe(2000);
    expect(l.adeudo_total).toBe(107000);
    expect(l.total_a_pagar).toBe(l.total_periodo + 107000);
  });

  it("excluye adeudos cuando flag está desactivado", () => {
    const disp = mkDisp({
      saldos: saldos({
        capital_vigente: 800000,
        capital_impago: 100000,
        interes_ordinario_impago: 5000,
      }),
    });
    const periodos = [
      mkPeriodo({ fecha_limite_pago: d("2026-04-15"), dias_periodo: 30, monto_capital: D(200000) }),
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: false }
    );

    const l = result.lineas[0];
    expect(l.adeudo_total).toBe(0);
    expect(l.total_a_pagar).toBe(l.total_periodo);
  });

  it("adeudo solo aparece en la primera línea de cada disposición", () => {
    const disp = mkDisp({
      saldos: saldos({ capital_vigente: 1000000, capital_impago: 50000 }),
    });
    const periodos = [
      mkPeriodo({ numero_amortizacion: 1, fecha_limite_pago: d("2026-04-10"), dias_periodo: 30, monto_capital: D(100000) }),
      mkPeriodo({ numero_amortizacion: 2, fecha_limite_pago: d("2026-04-20"), dias_periodo: 10, monto_capital: D(100000) }),
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: true }
    );

    expect(result.lineas).toHaveLength(2);
    expect(result.lineas[0].adeudo_capital).toBe(50000); // primera línea: con adeudo
    expect(result.lineas[1].adeudo_capital).toBe(0);     // segunda: sin adeudo
  });
});

// ═══════════════════════════════════════════
// TESTS: BASE DE CAPITAL DECRECE
// ═══════════════════════════════════════════

describe("Cobranza: base de capital se reduce entre periodos", () => {
  it("segundo periodo usa base reducida", () => {
    const disp = mkDisp({
      tasa_base_ordinaria: D(36), // 0.1% diario para cálculo fácil
      saldos: saldos({ capital_vigente: 1000000 }),
    });
    const periodos = [
      mkPeriodo({
        numero_amortizacion: 1,
        fecha_limite_pago: d("2026-04-10"),
        dias_periodo: 30,
        monto_capital: D(500000),
      }),
      mkPeriodo({
        numero_amortizacion: 2,
        fecha_limite_pago: d("2026-04-25"),
        dias_periodo: 15,
        monto_capital: D(500000),
      }),
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: false }
    );

    expect(result.lineas).toHaveLength(2);

    // Periodo 1: base = 1,000,000 → interés = 1M × 0.36/360 × 30 = 30,000
    expect(result.lineas[0].interes_periodo).toBe(30000);
    expect(result.lineas[0].capital_periodo).toBe(500000);

    // Periodo 2: base = 500,000 (1M - 500K) → interés = 500K × 0.36/360 × 15 = 7,500
    expect(result.lineas[1].interes_periodo).toBe(7500);
    expect(result.lineas[1].capital_periodo).toBe(500000);
  });
});

// ═══════════════════════════════════════════
// TESTS: ETAPA 3 CON AMORTIZACIONES FUTURAS
// ═══════════════════════════════════════════

describe("Cobranza: disposición en Etapa 3", () => {
  it("incluye amortizaciones futuras (capital VNE tiene vencimientos)", () => {
    const disp = mkDisp({
      etapa_ifrs9_actual: 3,
      dias_atraso_actual: 45,
      tasa_base_ordinaria: D(18),
      saldos: saldos({
        capital_vigente: 0,
        capital_vencido_no_exigible: 500000, // aún tiene amortizaciones futuras
        capital_vencido_exigible: 300000,    // ya vencido
      }),
    });
    const periodos = [
      mkPeriodo({
        fecha_limite_pago: d("2026-04-15"),
        dias_periodo: 30,
        monto_capital: D(250000),
      }),
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: false }
    );

    expect(result.lineas).toHaveLength(1);
    const l = result.lineas[0];
    expect(l.capital_periodo).toBe(250000);
    // Base = capital_vigente(0) + capital_vne(500000) = 500,000
    // Interés = 500,000 × 0.18 / 360 × 30 = 7,500
    expect(l.interes_periodo).toBe(7500);
  });
});

// ═══════════════════════════════════════════
// TESTS: MÚLTIPLES DISPOSICIONES
// ═══════════════════════════════════════════

describe("Cobranza: múltiples disposiciones", () => {
  it("genera líneas para varias disposiciones y ordena por fecha", () => {
    const disp1 = mkDisp({
      folio_disposicion: "D001",
      cliente: "EMPRESA A",
      saldos: saldos({ capital_vigente: 1000000 }),
    });
    const disp2 = mkDisp({
      folio_disposicion: "D002",
      cliente: "EMPRESA B",
      saldos: saldos({ capital_vigente: 500000 }),
    });

    const result = generarCobranza(
      [
        mkNorm(disp1, [mkPeriodo({ fecha_limite_pago: d("2026-04-20"), dias_periodo: 30 })], "CL-A"),
        mkNorm(disp2, [mkPeriodo({ fecha_limite_pago: d("2026-04-10"), dias_periodo: 30 })], "CL-B"),
      ],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: false }
    );

    expect(result.lineas).toHaveLength(2);
    // Ordenado por fecha: D002 (abr 10) antes que D001 (abr 20)
    expect(result.lineas[0].folio_disposicion).toBe("D002");
    expect(result.lineas[1].folio_disposicion).toBe("D001");
    expect(result.resumen.disposiciones_unicas).toBe(2);
  });
});

// ═══════════════════════════════════════════
// TESTS: RESUMEN
// ═══════════════════════════════════════════

describe("Cobranza: resumen totales", () => {
  it("suma correctamente capital, interés, adeudo y gran total", () => {
    const disp = mkDisp({
      tasa_base_ordinaria: D(36),
      saldos: saldos({ capital_vigente: 1000000, capital_impago: 20000 }),
    });
    const periodos = [
      mkPeriodo({ fecha_limite_pago: d("2026-04-15"), dias_periodo: 30, monto_capital: D(100000) }),
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: true }
    );

    const r = result.resumen;
    expect(r.total_lineas).toBe(1);
    expect(r.total_capital).toBe(100000);
    // 1M × 0.36/360 × 30 = 30,000
    expect(r.total_interes).toBe(30000);
    expect(r.total_adeudo).toBe(20000); // capital_impago
    expect(r.gran_total).toBe(150000); // 100K + 30K + 20K
  });
});

// ═══════════════════════════════════════════
// TESTS: PERIODOS ANTES DEL RANGO REDUCEN BASE
// ═══════════════════════════════════════════

describe("Cobranza: periodos vencidos antes del rango reducen base", () => {
  it("capital de amortización pasada no liquidada se resta de la base", () => {
    const disp = mkDisp({
      tasa_base_ordinaria: D(36),
      saldos: saldos({ capital_vigente: 1000000 }),
    });
    const periodos = [
      // Este periodo ya pasó y no está liquidado → su capital se fue a impago
      mkPeriodo({
        numero_amortizacion: 1,
        fecha_limite_pago: d("2026-03-15"),
        dias_periodo: 30,
        monto_capital: D(200000),
        liquidada: false,
      }),
      // Este periodo está en el rango
      mkPeriodo({
        numero_amortizacion: 2,
        fecha_limite_pago: d("2026-04-15"),
        dias_periodo: 30,
        monto_capital: D(200000),
      }),
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: false }
    );

    expect(result.lineas).toHaveLength(1); // solo el de abril
    // Base = 1,000,000 - 200,000 (amort marzo) = 800,000
    // Interés = 800,000 × 0.36/360 × 30 = 24,000
    expect(result.lineas[0].interes_periodo).toBe(24000);
  });
});

// ═══════════════════════════════════════════
// TESTS: CAPITALIZACIÓN (BASE INCLUYE REFINANCIADO)
// ═══════════════════════════════════════════

describe("Cobranza: capitalización incluye refinanciado en base", () => {
  it("base de interés incluye refinanciado vigente + VNE", () => {
    const disp = mkDisp({
      esquema_interes: "capitalizacion",
      tasa_base_ordinaria: D(36),
      saldos: saldos({
        capital_vigente: 1000000,
        interes_refinanciado_vigente: 50000,
        interes_refinanciado_vne: 10000,
      }),
    });
    const periodos = [
      mkPeriodo({ fecha_limite_pago: d("2026-04-15"), dias_periodo: 30, monto_capital: D(100000) }),
    ];

    const result = generarCobranza(
      [mkNorm(disp, periodos)],
      { fechaDesde: d("2026-04-01"), fechaHasta: d("2026-04-30"), incluirAdeudos: false }
    );

    // Base = 1,000,000 + 50,000 + 10,000 = 1,060,000
    // Interés = 1,060,000 × 0.36/360 × 30 = 31,800
    expect(result.lineas[0].interes_periodo).toBe(31800);
  });
});
