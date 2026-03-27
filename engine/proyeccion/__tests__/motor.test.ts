/**
 * engine/proyeccion/__tests__/motor.test.ts
 * Tests de integración del Motor de Proyección (M4).
 * Prueba el flujo completo: M1 + M2 + M3 orquestados por M4.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { proyectarDisposicion } from "../motor";
import { construirPeriodos } from "../../periodo/index";
import { resolverReglaEtapa } from "../../etapas/index";
import { estadoSaldosVacio, ZERO } from "../../shared/decimal-helpers";
import type { Disposicion, Amortizacion, EstadoSaldos } from "../../shared/types";

function d(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function saldos(o: Partial<Record<keyof EstadoSaldos, number>>): EstadoSaldos {
  const s = estadoSaldosVacio();
  for (const [k, v] of Object.entries(o)) (s as any)[k] = new Decimal(v);
  return s;
}

// =========================================================================
// Caso 1: Crédito Simple, cobro periódico, 30 días, sin impago previo
// =========================================================================

describe("Proyección: Crédito Simple, periódico, 30 días", () => {
  const disposicion: Disposicion = {
    folio_disposicion: "TEST_CS_01",
    folio_linea: "L1",
    numero_contrato: "CS-001",
    cliente: "Empresa Test SA",
    tipo_credito: "credito_simple",
    esquema_interes: "periodico",
    regla_dia_habil: "DIA_HABIL_ANTERIOR",
    tipo_tasa: "TIIE 28 BANXICO PM",
    tasa_base_ordinaria: new Decimal("18.3288"),
    moneda: "MEXICAN PESO",
    fecha_entrega: d("2026-02-15"),
    fecha_final_disposicion: d("2031-02-15"),
    fecha_final_contrato: d("2031-02-15"),
    fecha_saldo: d("2026-03-22"),
    etapa_ifrs9_actual: 1,
    dias_atraso_actual: 0,
    saldos: saldos({
      capital_vigente: 1786000,
      interes_ordinario_vigente: 2727.93,
    }),
    proyectable: true,
  };

  const amorts: Amortizacion[] = [
    {
      folio_disposicion: "TEST_CS_01",
      numero_amortizacion: 1,
      fecha_vencimiento: d("2026-03-15"),
      monto_capital: new Decimal(150000),
      amortizacion_liquidada: true, // ya pagada
    },
    {
      folio_disposicion: "TEST_CS_01",
      numero_amortizacion: 2,
      fecha_vencimiento: d("2026-04-15"),
      monto_capital: new Decimal(150000),
      amortizacion_liquidada: false,
    },
    {
      folio_disposicion: "TEST_CS_01",
      numero_amortizacion: 3,
      fecha_vencimiento: d("2026-05-15"),
      monto_capital: new Decimal(150000),
      amortizacion_liquidada: false,
    },
  ];

  const periodos = construirPeriodos(
    amorts,
    disposicion.regla_dia_habil,
    disposicion.tipo_tasa,
    disposicion.fecha_entrega
  );

  const regla = resolverReglaEtapa(
    disposicion.tipo_credito,
    disposicion.esquema_interes
  )!;

  it("proyección de 30 días completa sin error", () => {
    const resultado = proyectarDisposicion(
      disposicion,
      periodos,
      regla,
      d("2026-04-21") // 30 días después del 22/mar
    );

    expect(resultado.snapshots).toHaveLength(30);
    expect(resultado.etapa_ifrs9_final).toBe(1); // aún en etapa 1 con pocos días
    expect(resultado.interes_ordinario_total_generado.greaterThan(ZERO)).toBe(true);
  });

  it("genera interés ordinario cada día", () => {
    const resultado = proyectarDisposicion(disposicion, periodos, regla, d("2026-04-21"));

    // Todos los snapshots deben tener interés > 0 (hay capital vigente)
    for (const snap of resultado.snapshots) {
      expect(snap.interes_ordinario_del_dia.greaterThan(ZERO)).toBe(true);
    }
  });

  it("interés diario ~$909 (validación vs dato real)", () => {
    const resultado = proyectarDisposicion(disposicion, periodos, regla, d("2026-03-23"));

    // 1 día de proyección
    const intDia = resultado.snapshots[0].interes_ordinario_del_dia;
    // 1,786,000 × 0.183288 / 360 ≈ 909.31
    expect(intDia.toDecimalPlaces(0).toNumber()).toBeGreaterThanOrEqual(908);
    expect(intDia.toDecimalPlaces(0).toNumber()).toBeLessThanOrEqual(910);
  });

  it("vencimiento de capital crea impago", () => {
    // Proyectar hasta después del vencimiento de amort #2 (15/abr, DHA → Fp=15/abr miércoles hábil, Fi=16/abr)
    const resultado = proyectarDisposicion(disposicion, periodos, regla, d("2026-04-25"));

    // Buscar snapshot del día de inicio impago
    const snapVencimiento = resultado.snapshots.find(
      (s) => s.evento === "vencimiento_capital"
    );
    expect(snapVencimiento).toBeDefined();

    // Después del vencimiento, debe haber capital impago
    expect(resultado.saldos_finales.capital_impago.greaterThan(ZERO)).toBe(true);
  });
});

// =========================================================================
// Caso 2: CCC con capitalización, transición a Etapa 3
// =========================================================================

describe("Proyección: CCC capitalización → Etapa 3", () => {
  const disposicion: Disposicion = {
    folio_disposicion: "TEST_CCC_01",
    folio_linea: "L2",
    numero_contrato: "CCC-001",
    cliente: "Test CCC SA",
    tipo_credito: "ccc",
    esquema_interes: "capitalizacion",
    regla_dia_habil: "DIA_HABIL_SIGUIENTE",
    tipo_tasa: "TIIE 28 BANXICO PM",
    tasa_base_ordinaria: new Decimal(20),
    moneda: "MEXICAN PESO",
    fecha_entrega: d("2026-01-15"),
    fecha_final_disposicion: d("2026-04-15"),
    fecha_final_contrato: d("2028-01-15"),
    fecha_saldo: d("2026-03-22"),
    etapa_ifrs9_actual: 1,
    dias_atraso_actual: 0,
    saldos: saldos({ capital_vigente: 1000000 }),
    proyectable: true,
  };

  // CCC: una sola amortización al vencimiento (sintética)
  const amorts: Amortizacion[] = [
    {
      folio_disposicion: "TEST_CCC_01",
      numero_amortizacion: 1,
      fecha_vencimiento: d("2026-04-15"),
      monto_capital: new Decimal(1000000),
      amortizacion_liquidada: false,
    },
  ];

  const periodos = construirPeriodos(
    amorts,
    disposicion.regla_dia_habil,
    disposicion.tipo_tasa,
    disposicion.fecha_entrega
  );

  const regla = resolverReglaEtapa(
    disposicion.tipo_credito,
    disposicion.esquema_interes
  )!;

  it("CCC sin Etapa 2: salta de E1 directo a E3", () => {
    // Proyectar 60 días: capital vence ~15/abr, impago día 16, +30 días → E3 ~mayo 16
    const resultado = proyectarDisposicion(disposicion, periodos, regla, d("2026-05-25"));

    expect(resultado.etapa_ifrs9_final).toBe(3);

    // Verificar que nunca pasó por Etapa 2
    const etapasVistas = new Set(resultado.snapshots.map((s) => s.etapa_ifrs9));
    expect(etapasVistas.has(2)).toBe(false);
    expect(etapasVistas.has(1)).toBe(true);
    expect(etapasVistas.has(3)).toBe(true);
  });

  it("en Etapa 3 todo capital está en VE + VNE, nada en vigente/impago", () => {
    const resultado = proyectarDisposicion(disposicion, periodos, regla, d("2026-05-25"));

    const sf = resultado.saldos_finales;
    expect(sf.capital_vigente.toNumber()).toBe(0);
    expect(sf.capital_impago.toNumber()).toBe(0);
    expect(sf.capital_vencido_exigible.greaterThan(ZERO)).toBe(true);
  });

  it("moratorio se genera después del impago", () => {
    const resultado = proyectarDisposicion(disposicion, periodos, regla, d("2026-05-25"));

    expect(resultado.interes_moratorio_total_generado.greaterThan(ZERO)).toBe(true);
    expect(resultado.saldos_finales.interes_moratorio_acumulado.greaterThan(ZERO)).toBe(true);
  });
});

// =========================================================================
// Caso 3: Factoraje no genera interés
// =========================================================================

describe("Proyección: Factoraje", () => {
  it("no genera interés ordinario ni moratorio", () => {
    const disp: Disposicion = {
      folio_disposicion: "FAC_01",
      folio_linea: "L3",
      numero_contrato: "F-001",
      cliente: "Factoraje SA",
      tipo_credito: "factoraje",
      esquema_interes: "acumulacion",
      regla_dia_habil: "DIA_HABIL_ANTERIOR",
      tipo_tasa: "TASA FIJA",
      tasa_base_ordinaria: new Decimal(15),
      moneda: "MEXICAN PESO",
      fecha_entrega: d("2026-01-01"),
      fecha_final_disposicion: d("2026-06-30"),
      fecha_final_contrato: d("2028-01-01"),
      fecha_saldo: d("2026-03-22"),
      etapa_ifrs9_actual: 1,
      dias_atraso_actual: 0,
      saldos: saldos({ capital_vigente: 500000 }),
      proyectable: true,
    };

    const amorts: Amortizacion[] = [
      {
        folio_disposicion: "FAC_01",
        numero_amortizacion: 1,
        fecha_vencimiento: d("2026-06-30"),
        monto_capital: new Decimal(500000),
        amortizacion_liquidada: false,
      },
    ];

    const periodos = construirPeriodos(amorts, "DIA_HABIL_ANTERIOR", "TASA FIJA", d("2026-01-01"));
    const regla = resolverReglaEtapa("factoraje", "acumulacion")!;

    const resultado = proyectarDisposicion(disp, periodos, regla, d("2026-04-21"));

    expect(resultado.interes_ordinario_total_generado.toNumber()).toBe(0);
    expect(resultado.interes_moratorio_total_generado.toNumber()).toBe(0);
  });
});

// =========================================================================
// Caso 4: Validación de rendimiento
// =========================================================================

describe("Rendimiento", () => {
  it("proyección de 365 días completa en <500ms", () => {
    const disp: Disposicion = {
      folio_disposicion: "PERF_01",
      folio_linea: "L4",
      numero_contrato: "P-001",
      cliente: "Perf SA",
      tipo_credito: "credito_simple",
      esquema_interes: "periodico",
      regla_dia_habil: "DIA_HABIL_ANTERIOR",
      tipo_tasa: "TIIE 28 BANXICO PM",
      tasa_base_ordinaria: new Decimal(20),
      moneda: "MEXICAN PESO",
      fecha_entrega: d("2025-03-15"),
      fecha_final_disposicion: d("2030-03-15"),
      fecha_final_contrato: d("2030-03-15"),
      fecha_saldo: d("2026-03-22"),
      etapa_ifrs9_actual: 1,
      dias_atraso_actual: 0,
      saldos: saldos({ capital_vigente: 5000000 }),
      proyectable: true,
    };

    // Generar 12 amortizaciones mensuales
    const amorts: Amortizacion[] = [];
    for (let i = 1; i <= 12; i++) {
      amorts.push({
        folio_disposicion: "PERF_01",
        numero_amortizacion: i,
        fecha_vencimiento: d(`2026-${String(i).padStart(2, "0")}-15`),
        monto_capital: new Decimal(200000),
        amortizacion_liquidada: i <= 3, // primeras 3 pagadas
      });
    }

    const periodos = construirPeriodos(amorts, "DIA_HABIL_ANTERIOR", "TIIE 28 BANXICO PM", d("2025-03-15"));
    const regla = resolverReglaEtapa("credito_simple", "periodico")!;

    const resultado = proyectarDisposicion(disp, periodos, regla, d("2027-03-22"));

    expect(resultado.snapshots).toHaveLength(365);
    expect(resultado.duracion_ms).toBeLessThan(500);
  });
});
