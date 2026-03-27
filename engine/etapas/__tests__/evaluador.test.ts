/**
 * engine/etapas/__tests__/evaluador.test.ts
 * Tests del Motor de Etapas (M3).
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  resolverReglaEtapa,
  evaluarEtapa,
  validarEtapaInicial,
  reclasificarAEtapa3,
  ejecutarM3,
} from "../index";
import { estadoSaldosVacio, ZERO } from "../../shared/decimal-helpers";
import type { EstadoSaldos, Disposicion } from "../../shared/types";

function saldos(o: Partial<Record<keyof EstadoSaldos, number>>): EstadoSaldos {
  const s = estadoSaldosVacio();
  for (const [k, v] of Object.entries(o)) (s as any)[k] = new Decimal(v);
  return s;
}

// =========================================================================
// resolverReglaEtapa
// =========================================================================

describe("resolverReglaEtapa", () => {
  it("credito_simple + periodico → tiene Etapa 2", () => {
    const r = resolverReglaEtapa("credito_simple", "periodico")!;
    expect(r.tiene_etapa2).toBe(true);
    expect(r.e1_max_dias).toBe(30);
    expect(r.e2_max_dias).toBe(89);
    expect(r.e3_inicio_dias).toBe(90);
  });

  it("ccc + periodico → SIN Etapa 2", () => {
    const r = resolverReglaEtapa("ccc", "periodico")!;
    expect(r.tiene_etapa2).toBe(false);
    expect(r.e1_max_dias).toBe(29);
    expect(r.e3_inicio_dias).toBe(30);
  });

  it("credito_simple + capitalizacion → SIN Etapa 2", () => {
    const r = resolverReglaEtapa("credito_simple", "capitalizacion")!;
    expect(r.tiene_etapa2).toBe(false);
    expect(r.e3_inicio_dias).toBe(30);
  });

  it("arrendamiento → nunca entra a E3", () => {
    const r = resolverReglaEtapa("arrendamiento", "periodico")!;
    expect(r.e3_inicio_dias).toBeNull();
  });
});

// =========================================================================
// evaluarEtapa
// =========================================================================

describe("evaluarEtapa", () => {
  const reglaPeriodico = resolverReglaEtapa("credito_simple", "periodico")!;
  const reglaCCC = resolverReglaEtapa("ccc", "acumulacion")!;

  it("0 días → Etapa 1 (periódico)", () => {
    expect(evaluarEtapa(0, reglaPeriodico)).toBe(1);
  });

  it("30 días → Etapa 1 (periódico, borde)", () => {
    expect(evaluarEtapa(30, reglaPeriodico)).toBe(1);
  });

  it("31 días → Etapa 2 (periódico)", () => {
    expect(evaluarEtapa(31, reglaPeriodico)).toBe(2);
  });

  it("89 días → Etapa 2 (periódico, borde)", () => {
    expect(evaluarEtapa(89, reglaPeriodico)).toBe(2);
  });

  it("90 días → Etapa 3 (periódico)", () => {
    expect(evaluarEtapa(90, reglaPeriodico)).toBe(3);
  });

  it("29 días → Etapa 1 (CCC, borde)", () => {
    expect(evaluarEtapa(29, reglaCCC)).toBe(1);
  });

  it("30 días → Etapa 3 (CCC, directo sin E2)", () => {
    expect(evaluarEtapa(30, reglaCCC)).toBe(3);
  });
});

// =========================================================================
// reclasificarAEtapa3
// =========================================================================

describe("reclasificarAEtapa3", () => {
  it("mueve vigente→VNE e impago→VE", () => {
    const s = saldos({
      capital_vigente: 5000000,
      capital_impago: 150000,
      interes_ordinario_vigente: 1200,
      interes_ordinario_impago: 3500,
      interes_refinanciado_vigente: 8000,
      interes_refinanciado_impago: 2000,
      interes_moratorio_acumulado: 500,
    });

    reclasificarAEtapa3(s);

    // Capital
    expect(s.capital_vigente.toNumber()).toBe(0);
    expect(s.capital_impago.toNumber()).toBe(0);
    expect(s.capital_vencido_no_exigible.toNumber()).toBe(5000000);
    expect(s.capital_vencido_exigible.toNumber()).toBe(150000);

    // Interés
    expect(s.interes_ordinario_vigente.toNumber()).toBe(0);
    expect(s.interes_ordinario_impago.toNumber()).toBe(0);
    expect(s.interes_ordinario_vne.toNumber()).toBe(1200);
    expect(s.interes_ordinario_ve.toNumber()).toBe(3500);

    // Refinanciado
    expect(s.interes_refinanciado_vigente.toNumber()).toBe(0);
    expect(s.interes_refinanciado_impago.toNumber()).toBe(0);
    expect(s.interes_refinanciado_vne.toNumber()).toBe(8000);
    expect(s.interes_refinanciado_ve.toNumber()).toBe(2000);

    // Moratorio: sin cambio
    expect(s.interes_moratorio_acumulado.toNumber()).toBe(500);
  });

  it("acumula sobre VE/VNE existentes (no los reemplaza)", () => {
    const s = saldos({
      capital_vigente: 100000,
      capital_vencido_no_exigible: 50000, // ya tenía VNE previo
    });

    reclasificarAEtapa3(s);

    expect(s.capital_vencido_no_exigible.toNumber()).toBe(150000); // 50K + 100K
    expect(s.capital_vigente.toNumber()).toBe(0);
  });
});

// =========================================================================
// ejecutarM3
// =========================================================================

describe("ejecutarM3", () => {
  const reglaPer = resolverReglaEtapa("credito_simple", "periodico")!;

  it("sin transición: retorna misma etapa", () => {
    const s = saldos({ capital_vigente: 1000000 });
    const res = ejecutarM3(s, 1, 15, reglaPer);
    expect(res.hubo_transicion).toBe(false);
    expect(res.nueva_etapa).toBe(1);
    expect(s.capital_vigente.toNumber()).toBe(1000000); // sin cambio
  });

  it("E1→E2: cambia etapa pero no reclasifica", () => {
    const s = saldos({ capital_vigente: 1000000, capital_impago: 50000 });
    const res = ejecutarM3(s, 1, 35, reglaPer);
    expect(res.nueva_etapa).toBe(2);
    expect(res.evento).toBe("transicion_etapa2");
    // Saldos sin cambio
    expect(s.capital_vigente.toNumber()).toBe(1000000);
    expect(s.capital_impago.toNumber()).toBe(50000);
  });

  it("E2→E3: reclasifica saldos", () => {
    const s = saldos({ capital_vigente: 800000, capital_impago: 200000 });
    const res = ejecutarM3(s, 2, 90, reglaPer);
    expect(res.nueva_etapa).toBe(3);
    expect(res.evento).toBe("transicion_etapa3");
    expect(s.capital_vigente.toNumber()).toBe(0);
    expect(s.capital_vencido_no_exigible.toNumber()).toBe(800000);
    expect(s.capital_vencido_exigible.toNumber()).toBe(200000);
  });
});

// =========================================================================
// validarEtapaInicial
// =========================================================================

describe("validarEtapaInicial", () => {
  const baseDisp: Disposicion = {
    folio_disposicion: "TEST",
    folio_linea: "L1",
    numero_contrato: "C1",
    cliente: "Test Client",
    tipo_credito: "credito_simple",
    esquema_interes: "periodico",
    regla_dia_habil: "DIA_HABIL_ANTERIOR",
    tipo_tasa: "TIIE 28 BANXICO PM",
    tasa_base_ordinaria: new Decimal(18),
    moneda: "MXN",
    fecha_entrega: new Date(2026, 0, 1),
    fecha_final_disposicion: new Date(2027, 0, 1),
    fecha_final_contrato: new Date(2028, 0, 1),
    fecha_saldo: new Date(2026, 2, 22),
    etapa_ifrs9_actual: 1,
    dias_atraso_actual: 0,
    saldos: estadoSaldosVacio(),
    proyectable: true,
  };

  it("disposición coherente → proyectable", () => {
    const res = validarEtapaInicial({ ...baseDisp, dias_atraso_actual: 15, etapa_ifrs9_actual: 1 });
    expect(res.proyectable).toBe(true);
    expect(res.regla).toBeDefined();
  });

  it("CCC en Etapa 2 con 43 días → no proyectable (contradice regla)", () => {
    const res = validarEtapaInicial({
      ...baseDisp,
      tipo_credito: "ccc",
      dias_atraso_actual: 43,
      etapa_ifrs9_actual: 2,
    });
    expect(res.proyectable).toBe(false);
    expect(res.motivo).toContain("Contradicción");
  });

  it("CCC en Etapa 3 con 7 días → no proyectable", () => {
    const res = validarEtapaInicial({
      ...baseDisp,
      tipo_credito: "ccc",
      dias_atraso_actual: 7,
      etapa_ifrs9_actual: 3,
    });
    expect(res.proyectable).toBe(false);
  });
});
