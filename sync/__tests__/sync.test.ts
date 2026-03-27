/**
 * sync/__tests__/sync.test.ts
 * Tests del módulo de sincronización.
 * Usa los datos reales de Excel como proxy de lo que vendría de Sheets.
 */

import { describe, it, expect } from "vitest";
import {
  parseCsv,
  rowsToObjects,
  buildCsvUrl,
  normalizarTipoCredito,
  normalizarEsquemaInteres,
  mapearDisposicion,
  mapearYAgruparAmortizaciones,
  sincronizarDesdeObjetos,
} from "../index";
import { parsearFecha, parsearNumero } from "../mapper-cartera";

// =========================================================================
// CSV Parser
// =========================================================================

describe("parseCsv", () => {
  it("parsea CSV simple", () => {
    const csv = "a,b,c\n1,2,3\n4,5,6";
    const rows = parseCsv(csv);
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("maneja campos con comas entre comillas", () => {
    const csv = 'name,value\n"Hello, World",42\nSimple,10';
    const rows = parseCsv(csv);
    expect(rows[1][0]).toBe("Hello, World");
    expect(rows[1][1]).toBe("42");
  });

  it("maneja comillas escapadas", () => {
    const csv = 'col\n"He said ""hello"""\nplain';
    const rows = parseCsv(csv);
    expect(rows[1][0]).toBe('He said "hello"');
  });

  it("maneja \\r\\n (Windows line endings)", () => {
    const csv = "a,b\r\n1,2\r\n3,4";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
  });
});

describe("rowsToObjects", () => {
  it("convierte array 2D a array de objetos", () => {
    const rows = [
      ["FOLIO", "NOMBRE"],
      ["13103", "Empresa A"],
      ["13104", "Empresa B"],
    ];
    const objs = rowsToObjects(rows);
    expect(objs).toHaveLength(2);
    expect(objs[0]["FOLIO"]).toBe("13103");
    expect(objs[1]["NOMBRE"]).toBe("Empresa B");
  });

  it("retorna vacío si solo hay headers", () => {
    const rows = [["A", "B"]];
    expect(rowsToObjects(rows)).toHaveLength(0);
  });
});

// =========================================================================
// URL Builder
// =========================================================================

describe("buildCsvUrl", () => {
  it("construye URL correcta para Proaktiva", () => {
    const url = buildCsvUrl(
      "1bpNfE9UN_L0rSVN4wCgCwKM8Ui2HNSdw6wMcBDGYwvw",
      "Cartera Activa"
    );
    expect(url).toContain("1bpNfE9UN_L0rSVN4wCgCwKM8Ui2HNSdw6wMcBDGYwvw");
    expect(url).toContain("Cartera%20Activa");
    expect(url).toContain("tqx=out:csv");
  });

  it("codifica caracteres especiales en nombre de pestaña", () => {
    const url = buildCsvUrl("ID", "Hoja Número 1");
    expect(url).toContain("Hoja%20N%C3%BAmero%201");
  });
});

// =========================================================================
// Parsers de valores
// =========================================================================

describe("parsearFecha", () => {
  it("parsea YYYY-MM-DD", () => {
    const f = parsearFecha("2026-03-22");
    expect(f.getFullYear()).toBe(2026);
    expect(f.getMonth()).toBe(2); // 0-indexed
    expect(f.getDate()).toBe(22);
  });

  it("parsea fecha con hora", () => {
    const f = parsearFecha("2026-03-22 00:00:00");
    expect(f.getDate()).toBe(22);
  });

  it("lanza error en fecha vacía", () => {
    expect(() => parsearFecha("")).toThrow();
    expect(() => parsearFecha("--")).toThrow();
  });
});

describe("parsearNumero", () => {
  it("parsea número simple", () => {
    expect(parsearNumero("18.3288").toNumber()).toBeCloseTo(18.3288, 4);
  });

  it("parsea -- como 0", () => {
    expect(parsearNumero("--").toNumber()).toBe(0);
  });

  it("parsea vacío como 0", () => {
    expect(parsearNumero("").toNumber()).toBe(0);
  });

  it("parsea número con comas", () => {
    expect(parsearNumero("1,500,000.50").toNumber()).toBeCloseTo(1500000.50, 2);
  });
});

// =========================================================================
// Normalizadores de producto y esquema
// =========================================================================

describe("normalizarTipoCredito", () => {
  it("CRÉDITOS SIMPLES → credito_simple", () => {
    expect(normalizarTipoCredito("CRÉDITOS SIMPLES")).toBe("credito_simple");
  });
  it("CREDITO EN CUENTA CORRIENTE → ccc", () => {
    expect(normalizarTipoCredito("CREDITO EN CUENTA CORRIENTE")).toBe("ccc");
  });
  it("REFACCIONARIO → refaccionario", () => {
    expect(normalizarTipoCredito("REFACCIONARIO")).toBe("refaccionario");
  });
  it("HABILITACIÓN O AVÍO → hab_avio", () => {
    expect(normalizarTipoCredito("HABILITACIÓN O AVÍO")).toBe("hab_avio");
  });
  it("FACTORAJE → factoraje", () => {
    expect(normalizarTipoCredito("FACTORAJE")).toBe("factoraje");
  });
  it("desconocido lanza error", () => {
    expect(() => normalizarTipoCredito("HIPOTECARIO")).toThrow();
  });
});

describe("normalizarEsquemaInteres", () => {
  it("COBRO PERIÓDICO → periodico", () => {
    expect(normalizarEsquemaInteres("COBRO PERIÓDICO")).toBe("periodico");
  });
  it("ACUMULACIÓN DE INTERESES → acumulacion", () => {
    expect(normalizarEsquemaInteres("ACUMULACIÓN DE INTERESES")).toBe("acumulacion");
  });
  it("CAPITALIZACIÓN DE INTERESES → capitalizacion", () => {
    expect(normalizarEsquemaInteres("CAPITALIZACIÓN DE INTERESES")).toBe("capitalizacion");
  });
});

// =========================================================================
// Mapper de disposición (fila completa)
// =========================================================================

describe("mapearDisposicion", () => {
  const filaReal: Record<string, string> = {
    "FOLIO DE DISPOSICIÓN": "13103",
    "FOLIO LINEA DE CRÉDITO": "5432",
    "NÚMERO DEL CONTRATO": "CS-2026-001",
    "CLIENTE": "Empresa Test SA",
    "FOLIO CLIENTE": "CL-100",
    "EJECUTIVO LÍNEA": "MARIA ISABEL SUAREZ CASTILLO",
    "TIPO DE CRÉDITO": "CRÉDITOS SIMPLES",
    "TRATAMIENTO INTERES": "COBRO PERIÓDICO",
    "DIA HABIL POSTERIOR": "SIN DIA HABIL POSTERIOR",
    "TASA RECURSOS PROPIOS TASA BASE": "TIIE 28 BANXICO PM",
    "TASA RECURSOS PROPIOS SOBRE TASA": "11",
    "TASA BASE ORDINARIO": "18.3288",
    "TASA BASE MORATORIO": "36.6576",
    "MONEDA": "MEXICAN PESO",
    "FECHA DE ENTREGA": "2026-03-19",
    "FECHA FINAL": "2029-03-10",
    "FECHA FINAL DEL CONTRATO": "2029-03-10",
    "FECHA DE SALDO": "2026-03-22",
    "IFRS9": "ETAPA 1",
    "DÍAS DE IMPAGO": "0",
    "Nª DE AMORTIZACIONES": "36",
    "SALDO CAPITAL VIGENTE": "2500000",
    "SALDO CAPITAL IMPAGO": "0",
    "SALDO CAPITAL VENCIDO EXIGIBLE": "0",
    "SALDO CAPITAL VENCIDO NO EXIGIBLE": "0",
    "SALDO INTERES ORDINARIO VIGENTE": "3818.49",
    "SALDO INTERES ORDINARIO IMPAGO": "0",
    "SALDO INTERES ORDINARIO VENCIDO EXIGIBLE": "0",
    "SALDO INTERES ORDINARIO VENCIDO NO EXIGIBLE": "0",
    "SALDO INTERES REFINANCIADO VIGENTE": "0",
    "SALDO INTERES REFINANCIADO IMPAGO": "0",
    "SALDO INTERES REFINANCIADO VENCIDO EXIGIBLE": "0",
    "SALDO INTERES REFINANCIADO VENCIDO NO EXIGIBLE": "0",
    "SALDO INTERES MORATORIO CALCULADO": "0",
  };

  it("mapea correctamente una fila real", () => {
    const disp = mapearDisposicion(filaReal);

    expect(disp.folio_disposicion).toBe("13103");
    expect(disp.tipo_credito).toBe("credito_simple");
    expect(disp.esquema_interes).toBe("periodico");
    expect(disp.regla_dia_habil).toBe("DIA_HABIL_ANTERIOR");
    expect(disp.tasa_base_ordinaria.toNumber()).toBeCloseTo(18.3288, 4);
    expect(disp.etapa_ifrs9_actual).toBe(1);
    expect(disp.dias_atraso_actual).toBe(0);
    expect(disp.saldos.capital_vigente.toNumber()).toBe(2500000);
    expect(disp.saldos.interes_ordinario_vigente.toNumber()).toBeCloseTo(3818.49, 2);
    expect(disp.proyectable).toBe(true);
  });

  it("marca como no proyectable si tasa = --", () => {
    const fila = { ...filaReal, "TASA BASE ORDINARIO": "--" };
    const disp = mapearDisposicion(fila);
    expect(disp.proyectable).toBe(false);
    expect(disp.motivo_no_proyectable).toContain("--");
  });

  it("lanza error si falta folio", () => {
    const fila = { ...filaReal, "FOLIO DE DISPOSICIÓN": "" };
    expect(() => mapearDisposicion(fila)).toThrow("FOLIO");
  });
});

// =========================================================================
// Mapper de amortización
// =========================================================================

describe("mapearYAgruparAmortizaciones", () => {
  const filasAmort: Record<string, string>[] = [
    {
      "Folio de disposición": "13030",
      "N° de amortizacion": "1",
      "Fecha vencimiento amortizacion": "2026-03-15",
      "Capital amortizacion": "150000",
      "Amortizacion liquidada": "1",
    },
    {
      "Folio de disposición": "13030",
      "N° de amortizacion": "2",
      "Fecha vencimiento amortizacion": "2026-04-15",
      "Capital amortizacion": "150000",
      "Amortizacion liquidada": "0",
    },
    {
      "Folio de disposición": "99999",
      "N° de amortizacion": "1",
      "Fecha vencimiento amortizacion": "2026-06-15",
      "Capital amortizacion": "500000",
      "Amortizacion liquidada": "0",
    },
  ];

  it("agrupa por folio", () => {
    const mapa = mapearYAgruparAmortizaciones(filasAmort);
    expect(mapa.size).toBe(2);
    expect(mapa.get("13030")!).toHaveLength(2);
    expect(mapa.get("99999")!).toHaveLength(1);
  });

  it("ordena por número de amortización", () => {
    const shuffled = [filasAmort[1], filasAmort[0], filasAmort[2]]; // desordenadas
    const mapa = mapearYAgruparAmortizaciones(shuffled);
    const amorts13030 = mapa.get("13030")!;
    expect(amorts13030[0].numero_amortizacion).toBe(1);
    expect(amorts13030[1].numero_amortizacion).toBe(2);
  });

  it("parsea liquidada correctamente", () => {
    const mapa = mapearYAgruparAmortizaciones(filasAmort);
    const amorts = mapa.get("13030")!;
    expect(amorts[0].amortizacion_liquidada).toBe(true);
    expect(amorts[1].amortizacion_liquidada).toBe(false);
  });
});

// =========================================================================
// Sincronización completa (end-to-end con datos simulados)
// =========================================================================

describe("sincronizarDesdeObjetos", () => {
  const carteraRows: Record<string, string>[] = [
    {
      "FOLIO DE DISPOSICIÓN": "T001",
      "FOLIO LINEA DE CRÉDITO": "L1",
      "NÚMERO DEL CONTRATO": "C1",
      "CLIENTE": "Test SA",
      "FOLIO CLIENTE": "CL1",
      "EJECUTIVO LÍNEA": "JUAN PEREZ",
      "TIPO DE CRÉDITO": "CRÉDITOS SIMPLES",
      "TRATAMIENTO INTERES": "COBRO PERIÓDICO",
      "DIA HABIL POSTERIOR": "SIN DIA HABIL POSTERIOR",
      "TASA RECURSOS PROPIOS TASA BASE": "TIIE 28 BANXICO PM",
      "TASA RECURSOS PROPIOS SOBRE TASA": "11",
      "TASA BASE ORDINARIO": "18.3288",
      "TASA BASE MORATORIO": "36.6576",
      "MONEDA": "MEXICAN PESO",
      "FECHA DE ENTREGA": "2026-02-15",
      "FECHA FINAL": "2027-02-15",
      "FECHA FINAL DEL CONTRATO": "2027-02-15",
      "FECHA DE SALDO": "2026-03-22",
      "IFRS9": "ETAPA 1",
      "DÍAS DE IMPAGO": "0",
      "Nª DE AMORTIZACIONES": "2",
      "SALDO CAPITAL VIGENTE": "1000000",
      "SALDO CAPITAL IMPAGO": "0",
      "SALDO CAPITAL VENCIDO EXIGIBLE": "0",
      "SALDO CAPITAL VENCIDO NO EXIGIBLE": "0",
      "SALDO INTERES ORDINARIO VIGENTE": "5000",
      "SALDO INTERES ORDINARIO IMPAGO": "0",
      "SALDO INTERES ORDINARIO VENCIDO EXIGIBLE": "0",
      "SALDO INTERES ORDINARIO VENCIDO NO EXIGIBLE": "0",
      "SALDO INTERES REFINANCIADO VIGENTE": "0",
      "SALDO INTERES REFINANCIADO IMPAGO": "0",
      "SALDO INTERES REFINANCIADO VENCIDO EXIGIBLE": "0",
      "SALDO INTERES REFINANCIADO VENCIDO NO EXIGIBLE": "0",
      "SALDO INTERES MORATORIO CALCULADO": "0",
    },
    {
      "FOLIO DE DISPOSICIÓN": "T002",
      "FOLIO LINEA DE CRÉDITO": "L2",
      "NÚMERO DEL CONTRATO": "C2",
      "CLIENTE": "CCC SA",
      "FOLIO CLIENTE": "CL2",
      "EJECUTIVO LÍNEA": "MARIA LOPEZ",
      "TIPO DE CRÉDITO": "CREDITO EN CUENTA CORRIENTE",
      "TRATAMIENTO INTERES": "CAPITALIZACIÓN DE INTERESES",
      "DIA HABIL POSTERIOR": "CON DIA HABIL POSTERIOR",
      "TASA RECURSOS PROPIOS TASA BASE": "TIIE 28 BANXICO PM",
      "TASA RECURSOS PROPIOS SOBRE TASA": "16",
      "TASA BASE ORDINARIO": "23.7589",
      "TASA BASE MORATORIO": "47.5178",
      "MONEDA": "MEXICAN PESO",
      "FECHA DE ENTREGA": "2026-01-15",
      "FECHA FINAL": "2026-07-15",
      "FECHA FINAL DEL CONTRATO": "2028-01-15",
      "FECHA DE SALDO": "2026-03-22",
      "IFRS9": "ETAPA 1",
      "DÍAS DE IMPAGO": "0",
      "Nª DE AMORTIZACIONES": "1",
      "SALDO CAPITAL VIGENTE": "500000",
      "SALDO CAPITAL IMPAGO": "0",
      "SALDO CAPITAL VENCIDO EXIGIBLE": "0",
      "SALDO CAPITAL VENCIDO NO EXIGIBLE": "0",
      "SALDO INTERES ORDINARIO VIGENTE": "8000",
      "SALDO INTERES ORDINARIO IMPAGO": "0",
      "SALDO INTERES ORDINARIO VENCIDO EXIGIBLE": "0",
      "SALDO INTERES ORDINARIO VENCIDO NO EXIGIBLE": "0",
      "SALDO INTERES REFINANCIADO VIGENTE": "0",
      "SALDO INTERES REFINANCIADO IMPAGO": "0",
      "SALDO INTERES REFINANCIADO VENCIDO EXIGIBLE": "0",
      "SALDO INTERES REFINANCIADO VENCIDO NO EXIGIBLE": "0",
      "SALDO INTERES MORATORIO CALCULADO": "0",
    },
  ];

  const amortRows: Record<string, string>[] = [
    {
      "Folio de disposición": "T001",
      "N° de amortizacion": "1",
      "Fecha vencimiento amortizacion": "2026-08-15",
      "Capital amortizacion": "500000",
      "Amortizacion liquidada": "0",
    },
    {
      "Folio de disposición": "T001",
      "N° de amortizacion": "2",
      "Fecha vencimiento amortizacion": "2027-02-15",
      "Capital amortizacion": "500000",
      "Amortizacion liquidada": "0",
    },
  ];

  it("sincroniza 2 disposiciones, 1 con amort tabla y 1 sintética", () => {
    const resultado = sincronizarDesdeObjetos(carteraRows, amortRows);

    expect(resultado.stats.disposiciones_mapeadas).toBe(2);
    expect(resultado.stats.disposiciones_proyectables).toBe(2);
    expect(resultado.stats.errores).toBe(0);

    // T001: tiene amortizaciones en tabla
    const t001 = resultado.disposiciones.find(
      (d) => d.disposicion.folio_disposicion === "T001"
    )!;
    expect(t001.amortizaciones).toHaveLength(2);
    expect(t001.periodos.length).toBeGreaterThan(0);

    // T002: CCC sin amortización → sintética
    const t002 = resultado.disposiciones.find(
      (d) => d.disposicion.folio_disposicion === "T002"
    )!;
    expect(t002.amortizaciones).toHaveLength(1);
    expect(t002.amortizaciones[0].monto_capital.toNumber()).toBe(500000);
  });

  it("genera warning para disposición sin tabla de amortización", () => {
    const resultado = sincronizarDesdeObjetos(carteraRows, amortRows);

    const warnT002 = resultado.warnings.find(
      (w) => w.folio === "T002" && w.tipo === "sin_amortizacion"
    );
    expect(warnT002).toBeDefined();
    expect(warnT002!.mensaje).toContain("sintética");
  });

  it("stats son correctos", () => {
    const resultado = sincronizarDesdeObjetos(carteraRows, amortRows);

    expect(resultado.stats.total_filas_cartera).toBe(2);
    expect(resultado.stats.total_filas_amortizacion).toBe(2);
    expect(resultado.stats.amortizaciones_sinteticas).toBe(1);
    expect(resultado.stats.duracion_ms).toBeGreaterThanOrEqual(0);
  });

  it("ejecutivo se extrae correctamente", () => {
    const resultado = sincronizarDesdeObjetos(carteraRows, amortRows);

    const t001 = resultado.disposiciones.find(
      (d) => d.disposicion.folio_disposicion === "T001"
    )!;
    expect(t001.ejecutivo_disposicion).toBe("JUAN PEREZ");
  });
});
