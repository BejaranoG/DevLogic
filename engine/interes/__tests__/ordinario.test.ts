/**
 * engine/interes/__tests__/ordinario.test.ts
 * Tests del Motor de Intereses (M2).
 * Incluye caso real: Folio 13104 ($2,727.93 en 3 días).
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calcularInteresOrdinarioDiario,
  calcularInteresMoratorioDiario,
  calcularInteresesDia,
  convertirARefinanciado,
} from "../index";
import { estadoSaldosVacio, ZERO } from "../../shared/decimal-helpers";
import type { EstadoSaldos } from "../../shared/types";

function saldosBase(overrides: Partial<Record<keyof EstadoSaldos, number>>): EstadoSaldos {
  const s = estadoSaldosVacio();
  for (const [k, v] of Object.entries(overrides)) {
    (s as any)[k] = new Decimal(v);
  }
  return s;
}

// =========================================================================
// Interés ordinario
// =========================================================================

describe("calcularInteresOrdinarioDiario", () => {
  it("Caso real: Folio 13104 — Refaccionario, 18.3288%, $1,786,000", () => {
    const saldos = saldosBase({ capital_vigente: 1786000 });
    const tasa = new Decimal("18.3288");

    const diario = calcularInteresOrdinarioDiario(saldos, tasa, "periodico");

    // Esperado: 1,786,000 × 0.183288 / 360 = 909.3121...
    // 3 días = 2,727.94 (base real: 2,727.93, diff $0.01 por redondeo)
    const tresDias = diario.mul(3);
    expect(tresDias.toDecimalPlaces(2).toNumber()).toBeCloseTo(2727.94, 1);
  });

  it("base cero retorna cero", () => {
    const saldos = saldosBase({});
    const result = calcularInteresOrdinarioDiario(saldos, new Decimal(20), "periodico");
    expect(result.isZero()).toBe(true);
  });

  it("capitalización incluye refinanciado en la base", () => {
    const saldos = saldosBase({
      capital_vigente: 1000000,
      interes_refinanciado_vigente: 16666.67,
    });
    const tasa = new Decimal(20); // 20%

    const conRef = calcularInteresOrdinarioDiario(saldos, tasa, "capitalizacion");
    const sinRef = calcularInteresOrdinarioDiario(saldos, tasa, "periodico");

    // Con refinanciado la base es mayor, por tanto el interés es mayor
    expect(conRef.greaterThan(sinRef)).toBe(true);

    // Base con ref: 1,016,666.67 × 0.20 / 360 = 564.8148
    expect(conRef.toDecimalPlaces(2).toNumber()).toBeCloseTo(564.81, 1);
  });

  it("en Etapa 3 usa capital VNE (no vigente, que es 0)", () => {
    const saldos = saldosBase({
      capital_vigente: 0,
      capital_vencido_no_exigible: 5000000,
    });
    const tasa = new Decimal(20);

    const result = calcularInteresOrdinarioDiario(saldos, tasa, "periodico");
    // 5,000,000 × 0.20 / 360 = 2,777.78
    expect(result.toDecimalPlaces(2).toNumber()).toBeCloseTo(2777.78, 1);
  });
});

// =========================================================================
// Interés moratorio
// =========================================================================

describe("calcularInteresMoratorioDiario", () => {
  it("no genera moratorio si no hay capital exigible", () => {
    const saldos = saldosBase({ capital_vigente: 1000000 });
    const result = calcularInteresMoratorioDiario(saldos, new Decimal(20), "periodico");
    expect(result.isZero()).toBe(true);
  });

  it("genera moratorio sobre capital impago (tasa × 2)", () => {
    const saldos = saldosBase({ capital_impago: 500000 });
    const tasa = new Decimal(20);

    const result = calcularInteresMoratorioDiario(saldos, tasa, "periodico");
    // 500,000 × (0.20 × 2) / 360 = 500,000 × 0.40 / 360 = 555.56
    expect(result.toDecimalPlaces(2).toNumber()).toBeCloseTo(555.56, 1);
  });

  it("capitalización incluye refinanciado impago y VE", () => {
    const saldos = saldosBase({
      capital_vencido_exigible: 3000000,
      interes_refinanciado_ve: 163343.35,
    });
    const tasa = new Decimal("23.6785");

    const result = calcularInteresMoratorioDiario(saldos, tasa, "capitalizacion");
    // Base = 3,000,000 + 163,343.35 = 3,163,343.35
    // Tasa mora = 23.6785 × 2 = 47.357%
    // Diario = 3,163,343.35 × 0.47357 / 360 ≈ 4,161.37
    expect(result.toDecimalPlaces(0).toNumber()).toBeGreaterThan(4000);
    expect(result.toDecimalPlaces(0).toNumber()).toBeLessThan(4300);
  });
});

// =========================================================================
// Conversión a refinanciado
// =========================================================================

describe("convertirARefinanciado", () => {
  it("mueve interés vigente a refinanciado vigente", () => {
    const saldos = saldosBase({
      interes_ordinario_vigente: 16666.67,
      interes_refinanciado_vigente: 5000,
    });

    convertirARefinanciado(saldos);

    expect(saldos.interes_ordinario_vigente.isZero()).toBe(true);
    expect(saldos.interes_refinanciado_vigente.toNumber()).toBeCloseTo(21666.67, 2);
  });
});

// =========================================================================
// Orquestador
// =========================================================================

describe("calcularInteresesDia", () => {
  it("factoraje retorna cero en ambos", () => {
    const saldos = saldosBase({ capital_vigente: 1000000 });
    const result = calcularInteresesDia("factoraje", "acumulacion", saldos, new Decimal(20));
    expect(result.interes_ordinario_del_dia.isZero()).toBe(true);
    expect(result.interes_moratorio_del_dia.isZero()).toBe(true);
  });

  it("arrendamiento retorna cero en ambos", () => {
    const saldos = saldosBase({ capital_vigente: 500000 });
    const result = calcularInteresesDia("arrendamiento", "periodico", saldos, new Decimal(15));
    expect(result.interes_ordinario_del_dia.isZero()).toBe(true);
    expect(result.interes_moratorio_del_dia.isZero()).toBe(true);
  });

  it("crédito simple genera ordinario pero no moratorio si no hay impago", () => {
    const saldos = saldosBase({ capital_vigente: 1000000 });
    const result = calcularInteresesDia("credito_simple", "periodico", saldos, new Decimal(20));
    expect(result.interes_ordinario_del_dia.greaterThan(ZERO)).toBe(true);
    expect(result.interes_moratorio_del_dia.isZero()).toBe(true);
  });
});
