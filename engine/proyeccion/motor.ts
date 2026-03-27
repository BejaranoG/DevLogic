/**
 * engine/proyeccion/motor.ts
 * Motor de Proyección (M4) — Loop día a día.
 * Orquesta M1 (periodos), M2 (intereses) y M3 (etapas).
 *
 * Supuesto fundamental: escenario de NO PAGO.
 */

import Decimal from "decimal.js";
import { addDays, differenceInCalendarDays } from "date-fns";
import { ZERO, clonarEstado, redondear2 } from "../shared/decimal-helpers";
import { calcularInteresesDia, convertirARefinanciado } from "../interes/index";
import { ejecutarM3 } from "../etapas/index";
import type {
  Disposicion,
  PeriodoOperativo,
  ReglaEtapa,
  EstadoSaldos,
  EtapaIFRS9,
  SnapshotDiario,
  ResultadoProyeccion,
} from "../shared/types";

/**
 * Proyecta una disposición desde su estado actual (T₀) hasta la fecha objetivo (Tₙ).
 * Asume escenario de no pago: ningún capital ni interés se paga durante la proyección.
 *
 * Flujo diario (7 pasos estrictos):
 * 1. M4: Verificar vencimiento de capital (mover a impago)
 * 2. M4: Verificar corte de periodo (interés a impago o conversión)
 * 3. M2: Calcular intereses del día (moratorio ya ve capital en impago)
 * 4. M4: Acumular intereses en buckets
 * 5. M4: Incrementar días de atraso si hay capital exigible
 * 6. M3: Evaluar transición de etapa
 * 7. M4: Guardar snapshot
 *
 * @param disposicion - Disposición con estado actual y datos normalizados
 * @param periodosOperativos - Lista de periodos (salida de M1.construirPeriodos)
 * @param reglaEtapa - Regla IFRS9 (salida de M3.resolverReglaEtapa)
 * @param fechaObjetivo - Fecha hasta la que se proyecta
 * @returns Resultado completo con snapshots diarios
 */
export function proyectarDisposicion(
  disposicion: Disposicion,
  periodosOperativos: PeriodoOperativo[],
  reglaEtapa: ReglaEtapa,
  fechaObjetivo: Date
): ResultadoProyeccion {
  const t0 = performance.now();

  const fechaBase = disposicion.fecha_saldo;
  const totalDias = differenceInCalendarDays(fechaObjetivo, fechaBase);

  if (totalDias <= 0) {
    throw new Error(
      `Fecha objetivo (${fechaObjetivo.toISOString().slice(0, 10)}) debe ser posterior a fecha base (${fechaBase.toISOString().slice(0, 10)})`
    );
  }

  // Estado mutable que se actualiza cada día
  const saldos: EstadoSaldos = clonarEstado(disposicion.saldos);
  let etapa: EtapaIFRS9 = disposicion.etapa_ifrs9_actual;
  let diasAtraso = disposicion.dias_atraso_actual;

  // Índices de periodos pendientes (no liquidados) para búsqueda eficiente
  const periodosPendientes = periodosOperativos
    .filter((p) => !p.liquidada)
    .sort((a, b) => a.fecha_inicio_impago.getTime() - b.fecha_inicio_impago.getTime());

  // Set de fechas de corte pendientes para conversión de interés (capitalización)
  const fechasCorte = new Map<number, PeriodoOperativo>();
  for (const p of periodosOperativos.filter((p) => !p.liquidada)) {
    fechasCorte.set(p.fecha_corte.getTime(), p);
  }

  // Set de fechas de inicio de impago para vencimiento de capital
  // Solo periodos con capital > 0 (excluye sub-periodos de interés mensual)
  const fechasImpago = new Map<number, PeriodoOperativo>();
  for (const p of periodosPendientes) {
    if (p.monto_capital.greaterThan(ZERO)) {
      fechasImpago.set(p.fecha_inicio_impago.getTime(), p);
    }
  }

  // Set de fechas de inicio de impago para TODOS los periodos (incluye sub-periodos de interés)
  // En periódico, el interés entra a impago en fecha_inicio_impago (junto con capital),
  // NO en fecha_corte. El cliente tiene hasta fecha_limite_pago para pagar ambos.
  const fechasImpagoInteres = new Map<number, PeriodoOperativo>();
  for (const p of periodosPendientes) {
    fechasImpagoInteres.set(p.fecha_inicio_impago.getTime(), p);
  }

  const tasa = disposicion.tasa_base_ordinaria;
  const tipoCred = disposicion.tipo_credito;
  const esquema = disposicion.esquema_interes;
  const enEtapa3 = () => etapa === 3;

  const snapshots: SnapshotDiario[] = [];
  let totalOrdinario = ZERO;
  let totalMoratorio = ZERO;
  let totalMoratorioProv = ZERO;
  let totalMoratorioCalc = ZERO;

  // ── LOOP DÍA A DÍA ──
  for (let dia = 1; dia <= totalDias; dia++) {
    const fechaActual = addDays(fechaBase, dia);
    const tsActual = fechaActual.getTime();
    let evento: string | null = null;

    // ── PASO 1: Verificar vencimiento de capital ──
    // Se ejecuta ANTES del cálculo de intereses para que el capital que vence
    // hoy genere interés moratorio (no ordinario) desde el primer día de impago.
    const periodoVence = fechasImpago.get(tsActual);
    if (periodoVence) {
      const monto = periodoVence.monto_capital;

      if (enEtapa3()) {
        saldos.capital_vencido_exigible = saldos.capital_vencido_exigible.plus(monto);
      } else {
        saldos.capital_impago = saldos.capital_impago.plus(monto);
      }

      if (enEtapa3()) {
        saldos.capital_vencido_no_exigible = saldos.capital_vencido_no_exigible.minus(monto);
      } else {
        saldos.capital_vigente = saldos.capital_vigente.minus(monto);
      }

      evento = "vencimiento_capital";

      // En capitalización: al vencer capital, refinanciado vigente pasa a impago
      if (esquema === "capitalizacion" && !enEtapa3()) {
        saldos.interes_refinanciado_impago = saldos.interes_refinanciado_impago.plus(
          saldos.interes_refinanciado_vigente
        );
        saldos.interes_refinanciado_vigente = ZERO;
      }

      // En acumulación: al vencer capital, interés vigente pasa a impago
      if (esquema === "acumulacion" && !enEtapa3()) {
        saldos.interes_ordinario_impago = saldos.interes_ordinario_impago.plus(
          saldos.interes_ordinario_vigente
        );
        saldos.interes_ordinario_vigente = ZERO;
      }

      fechasImpago.delete(tsActual);
    }

    // ── PASO 2a: Periódico — interés entra a impago en fecha_inicio_impago ──
    // En cobro periódico, capital e interés van juntos: ambos entran a impago
    // el mismo día (fecha_inicio_impago = fecha_limite_pago + 1).
    const periodoImpagoInteres = fechasImpagoInteres.get(tsActual);
    if (periodoImpagoInteres && !enEtapa3() && esquema === "periodico") {
      saldos.interes_ordinario_impago = saldos.interes_ordinario_impago.plus(
        saldos.interes_ordinario_vigente
      );
      saldos.interes_ordinario_vigente = ZERO;

      if (!evento) evento = "vencimiento_interes";
      fechasImpagoInteres.delete(tsActual);
    }

    // ── PASO 2b: Capitalización — conversión en fecha_corte ──
    // En capitalización, el interés se convierte a refinanciado en fecha_corte
    // (esto NO es impago, es conversión contable).
    const periodoCorte = fechasCorte.get(tsActual);
    if (periodoCorte && !enEtapa3()) {
      if (esquema === "capitalizacion") {
        convertirARefinanciado(saldos);
        if (!evento) evento = "conversion_refinanciado";
      }
      fechasCorte.delete(tsActual);
    }

    // ── PASO 3: M2 calcula intereses del día ──
    // Se ejecuta DESPUÉS de mover saldos, así el moratorio se calcula sobre
    // el capital que acaba de entrar a impago desde el primer día.
    const intereses = calcularInteresesDia(tipoCred, esquema, saldos, tasa);

    // ── PASO 4: Acumular intereses ──
    if (enEtapa3()) {
      saldos.interes_ordinario_vne = saldos.interes_ordinario_vne.plus(
        intereses.interes_ordinario_del_dia
      );
    } else {
      saldos.interes_ordinario_vigente = saldos.interes_ordinario_vigente.plus(
        intereses.interes_ordinario_del_dia
      );
    }
    if (enEtapa3()) {
      saldos.interes_moratorio_calculado = saldos.interes_moratorio_calculado.plus(
        intereses.interes_moratorio_del_dia
      );
    } else {
      saldos.interes_moratorio_acumulado = saldos.interes_moratorio_acumulado.plus(
        intereses.interes_moratorio_del_dia
      );
    }

    totalOrdinario = totalOrdinario.plus(intereses.interes_ordinario_del_dia);
    totalMoratorio = totalMoratorio.plus(intereses.interes_moratorio_del_dia);
    if (enEtapa3()) {
      totalMoratorioCalc = totalMoratorioCalc.plus(intereses.interes_moratorio_del_dia);
    } else {
      totalMoratorioProv = totalMoratorioProv.plus(intereses.interes_moratorio_del_dia);
    }

    // ── PASO 5: Incrementar días de atraso ──
    // Días incrementan cuando CUALQUIER pago está impago: capital, interés ordinario,
    // interés refinanciado, o vencido exigible.
    const hayPagoExigible =
      saldos.capital_impago.greaterThan(ZERO) ||
      saldos.capital_vencido_exigible.greaterThan(ZERO) ||
      saldos.interes_ordinario_impago.greaterThan(ZERO) ||
      saldos.interes_ordinario_ve.greaterThan(ZERO) ||
      saldos.interes_refinanciado_impago.greaterThan(ZERO) ||
      saldos.interes_refinanciado_ve.greaterThan(ZERO);

    if (hayPagoExigible) {
      diasAtraso++;
    }

    // ── PASO 6: M3 evalúa etapa ──
    const resultadoM3 = ejecutarM3(saldos, etapa, diasAtraso, reglaEtapa);
    if (resultadoM3.hubo_transicion) {
      etapa = resultadoM3.nueva_etapa;
      evento = resultadoM3.evento;
    }

    // ── PASO 7: Guardar snapshot ──
    snapshots.push({
      fecha: fechaActual,
      dia_numero: dia,
      saldos: clonarEstado(saldos),
      etapa_ifrs9: etapa,
      dias_atraso: diasAtraso,
      interes_ordinario_del_dia: intereses.interes_ordinario_del_dia,
      interes_moratorio_del_dia: intereses.interes_moratorio_del_dia,
      evento,
    });
  }

  // ── RESULTADO FINAL ──
  const saldoTotal = saldos.capital_vigente
    .plus(saldos.capital_impago)
    .plus(saldos.capital_vencido_exigible)
    .plus(saldos.capital_vencido_no_exigible)
    .plus(saldos.interes_ordinario_vigente)
    .plus(saldos.interes_ordinario_impago)
    .plus(saldos.interes_ordinario_ve)
    .plus(saldos.interes_ordinario_vne)
    .plus(saldos.interes_refinanciado_vigente)
    .plus(saldos.interes_refinanciado_impago)
    .plus(saldos.interes_refinanciado_ve)
    .plus(saldos.interes_refinanciado_vne)
    .plus(saldos.interes_moratorio_acumulado)
    .plus(saldos.interes_moratorio_calculado);

  return {
    folio_disposicion: disposicion.folio_disposicion,
    fecha_base: fechaBase,
    fecha_objetivo: fechaObjetivo,
    tasa_utilizada: tasa,
    escenario: "no_pago",
    saldos_finales: clonarEstado(saldos),
    etapa_ifrs9_final: etapa,
    dias_atraso_final: diasAtraso,
    interes_ordinario_total_generado: totalOrdinario,
    interes_moratorio_total_generado: totalMoratorio,
    interes_moratorio_provisionado_generado: totalMoratorioProv,
    interes_moratorio_calculado_generado: totalMoratorioCalc,
    saldo_total: saldoTotal,
    snapshots,
    duracion_ms: Math.round(performance.now() - t0),
  };
}
