/**
 * sync/normalizer.ts
 * Normalización: datos mapeados → datos listos para el motor.
 *
 * Responsabilidades:
 * 1. Generar amortizaciones sintéticas para disposiciones sin tabla
 * 2. Ejecutar validación de etapa inicial (M3)
 * 3. Construir periodos operativos (M1)
 * 4. Producir reporte de errores y warnings
 */

import Decimal from "decimal.js";
import { ZERO } from "../engine/shared/decimal-helpers";
import { construirPeriodos } from "../engine/periodo/index";
import { validarEtapaInicial } from "../engine/etapas/index";
import type {
  Disposicion,
  Amortizacion,
  PeriodoOperativo,
  ReglaEtapa,
} from "../engine/shared/types";

// ============================================================================
// Tipos de resultado
// ============================================================================

export interface DisposicionNormalizada {
  disposicion: Disposicion;
  amortizaciones: Amortizacion[];
  periodos: PeriodoOperativo[];
  regla_etapa: ReglaEtapa | null;
  ejecutivo_disposicion: string;
  folio_cliente: string;
  saldo_neto_provisionado: number;
  spread: number;
  id_fondeador: string;
  fuente_fondeo: string;
}

export interface ResultadoSync {
  disposiciones: DisposicionNormalizada[];
  errores: SyncError[];
  warnings: SyncWarning[];
  stats: SyncStats;
}

export interface SyncError {
  folio: string;
  tipo: "mapeo" | "amortizacion" | "periodo" | "etapa";
  mensaje: string;
}

export interface SyncWarning {
  folio: string;
  tipo: "sin_amortizacion" | "sin_tasa" | "no_proyectable" | "anomalia";
  mensaje: string;
}

export interface SyncStats {
  total_filas_cartera: number;
  total_filas_amortizacion: number;
  disposiciones_mapeadas: number;
  disposiciones_proyectables: number;
  disposiciones_no_proyectables: number;
  amortizaciones_sinteticas: number;
  errores: number;
  duracion_ms: number;
}

// ============================================================================
// Generación de amortizaciones sintéticas
// ============================================================================

/**
 * Para disposiciones sin tabla de amortización en Sheets,
 * genera una amortización sintética con todo el capital al vencimiento.
 *
 * Aplica a: CCC, Hab/Avío, Factoraje, y disposiciones con
 * múltiples amortizaciones declaradas pero sin filas en la tabla.
 */
function generarAmortizacionSintetica(disp: Disposicion): Amortizacion {
  // Suma total de capital (puede estar en diferentes buckets)
  const capitalTotal = disp.saldos.capital_vigente
    .plus(disp.saldos.capital_impago)
    .plus(disp.saldos.capital_vencido_exigible)
    .plus(disp.saldos.capital_vencido_no_exigible);

  return {
    folio_disposicion: disp.folio_disposicion,
    numero_amortizacion: 1,
    fecha_vencimiento: disp.fecha_final_disposicion,
    monto_capital: capitalTotal,
    amortizacion_liquidada: false,
  };
}

// ============================================================================
// Normalización principal
// ============================================================================

/**
 * Normaliza el resultado completo del mapeo en datos listos para el motor.
 *
 * @param disposiciones - Disposiciones mapeadas del Sheet
 * @param amortizacionesPorFolio - Mapa folio → amortizaciones
 * @param metadatos - Metadatos extra (ejecutivo, cliente)
 * @returns Resultado de sync con disposiciones normalizadas, errores y stats
 */
export function normalizar(
  disposiciones: Disposicion[],
  amortizacionesPorFolio: Map<string, Amortizacion[]>,
  metadatos: Map<string, { ejecutivo_disposicion: string; folio_cliente: string; saldo_neto_provisionado: number; spread: number; id_fondeador: string; fuente_fondeo: string }>
): ResultadoSync {
  const t0 = performance.now();
  const resultado: DisposicionNormalizada[] = [];
  const errores: SyncError[] = [];
  const warnings: SyncWarning[] = [];
  let amortsSinteticas = 0;

  for (const disp of disposiciones) {
    const folio = disp.folio_disposicion;
    const meta = metadatos.get(folio) ?? { ejecutivo_disposicion: "", folio_cliente: "", saldo_neto_provisionado: 0, spread: 0, id_fondeador: "", fuente_fondeo: "" };

    // ── 1. Resolver amortizaciones ──
    let amorts = amortizacionesPorFolio.get(folio);

    if (!amorts || amorts.length === 0) {
      // Sin tabla de amortización → generar sintética
      amorts = [generarAmortizacionSintetica(disp)];
      amortsSinteticas++;

      warnings.push({
        folio,
        tipo: "sin_amortizacion",
        mensaje: `Sin tabla de amortización en Sheets. Se generó amortización sintética al vencimiento (${disp.fecha_final_disposicion.toISOString().slice(0, 10)}).`,
      });
    }

    // ── 1b. Corregir liquidada para amortizaciones futuras ──
    // Una amortización con fecha posterior a fecha_saldo no puede estar liquidada.
    // Sheets a veces marca erróneamente como liquidadas amortizaciones futuras.
    for (const a of amorts) {
      if (a.amortizacion_liquidada && a.fecha_vencimiento > disp.fecha_saldo) {
        a.amortizacion_liquidada = false;
      }
    }

    // ── 2. Construir periodos operativos (M1) ──
    let periodos: PeriodoOperativo[];
    try {
      periodos = construirPeriodos(
        amorts,
        disp.regla_dia_habil,
        disp.tipo_tasa,
        disp.fecha_entrega,
        disp.esquema_interes,
        disp.fecha_final_disposicion
      );
    } catch (err) {
      errores.push({
        folio,
        tipo: "periodo",
        mensaje: `Error construyendo periodos: ${(err as Error).message}`,
      });

      disp.proyectable = false;
      disp.motivo_no_proyectable = `Error M1: ${(err as Error).message}`;
      periodos = [];
    }

    // ── 3. Validar etapa inicial (M3) ──
    const validacion = validarEtapaInicial(disp);

    if (!validacion.proyectable) {
      disp.proyectable = false;
      disp.motivo_no_proyectable = validacion.motivo;

      warnings.push({
        folio,
        tipo: "no_proyectable",
        mensaje: validacion.motivo!,
      });
    }

    // ── 4. Warning adicional si tasa = 0 ──
    if (
      disp.tasa_base_ordinaria.isZero() &&
      disp.tipo_credito !== "factoraje" &&
      disp.tipo_credito !== "arrendamiento"
    ) {
      warnings.push({
        folio,
        tipo: "sin_tasa",
        mensaje: `Tasa base ordinaria = 0 o '--'. No se puede proyectar interés.`,
      });
    }

    resultado.push({
      disposicion: disp,
      amortizaciones: amorts,
      periodos,
      regla_etapa: validacion.regla ?? null,
      ejecutivo_disposicion: meta.ejecutivo_disposicion,
      folio_cliente: meta.folio_cliente,
      saldo_neto_provisionado: meta.saldo_neto_provisionado,
      spread: meta.spread,
      id_fondeador: meta.id_fondeador,
      fuente_fondeo: meta.fuente_fondeo,
    });
  }

  const proyectables = resultado.filter((r) => r.disposicion.proyectable).length;

  return {
    disposiciones: resultado,
    errores,
    warnings,
    stats: {
      total_filas_cartera: disposiciones.length,
      total_filas_amortizacion: [...amortizacionesPorFolio.values()].reduce(
        (sum, a) => sum + a.length,
        0
      ),
      disposiciones_mapeadas: resultado.length,
      disposiciones_proyectables: proyectables,
      disposiciones_no_proyectables: resultado.length - proyectables,
      amortizaciones_sinteticas: amortsSinteticas,
      errores: errores.length,
      duracion_ms: Math.round(performance.now() - t0),
    },
  };
}
