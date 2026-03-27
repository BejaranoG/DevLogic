/**
 * engine/cobranza/motor.ts
 * Motor de reporte de cobranza.
 *
 * Genera las próximas amortizaciones a pagar dentro de un rango de fechas,
 * con cálculo de interés estimado del periodo y adeudo previo opcional.
 */

import Decimal from "decimal.js";
import { ZERO, tasaADecimal, BASE_360 } from "../shared/decimal-helpers";
import type { PeriodoOperativo, Disposicion, EsquemaInteresNorm } from "../shared/types";
import type { DisposicionNormalizada } from "../../sync/normalizer";

// ════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════

export interface CobranzaParams {
  fechaDesde: Date;      // Inicio del rango (inclusive)
  fechaHasta: Date;      // Fin del rango (inclusive)
  incluirAdeudos: boolean; // Si true, incluye saldos vencidos previos
}

export interface LineaCobranza {
  folio_disposicion: string;
  folio_cliente: string;
  cliente: string;
  ejecutivo: string;
  id_fondeador: string;
  fuente_fondeo: string;
  tipo_credito: string;
  esquema_interes: string;
  numero_amortizacion: number;
  fecha_limite_pago: string;  // ISO date YYYY-MM-DD
  // Pago del periodo
  interes_periodo: number;    // Interés ordinario estimado del periodo
  capital_periodo: number;    // Capital de la amortización
  total_periodo: number;      // interes + capital
  // Adeudo previo (solo si incluirAdeudos = true)
  adeudo_capital: number;     // Capital impago + VE
  adeudo_interes: number;     // Interés ordinario impago + VE + refinanciado impago + VE
  adeudo_moratorio: number;   // Moratorio provisionado + calculado
  adeudo_total: number;       // Suma de los tres
  // Gran total
  total_a_pagar: number;      // total_periodo + adeudo_total
}

export interface ResultadoCobranza {
  fecha_desde: string;
  fecha_hasta: string;
  incluye_adeudos: boolean;
  lineas: LineaCobranza[];
  resumen: {
    total_lineas: number;
    disposiciones_unicas: number;
    total_capital: number;
    total_interes: number;
    total_adeudo: number;
    gran_total: number;
  };
}

// ════════════════════════════════════════════════════════
// VALIDACIÓN
// ════════════════════════════════════════════════════════

export function validarParams(params: CobranzaParams): string | null {
  const { fechaDesde, fechaHasta } = params;

  if (fechaHasta < fechaDesde) {
    return "La fecha final debe ser igual o posterior a la fecha inicial.";
  }

  const diffDias = Math.round(
    (fechaHasta.getTime() - fechaDesde.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDias > 30) {
    return `El rango no puede exceder 30 días (solicitado: ${diffDias} días).`;
  }

  return null;
}

// ════════════════════════════════════════════════════════
// CÁLCULO DE INTERÉS DEL PERIODO
// ════════════════════════════════════════════════════════

/**
 * Calcula el interés ordinario estimado para un periodo dado.
 *
 * Base = capital que estará vigente durante ese periodo.
 * En capitalización, la base incluye refinanciado vigente + VNE.
 *
 * Fórmula: Base × (Tasa / 100) / 360 × días_periodo
 */
function calcularInteresPeriodo(
  baseCapital: Decimal,
  tasa: Decimal,
  diasPeriodo: number,
  esquema: EsquemaInteresNorm,
  refVigente: Decimal,
  refVne: Decimal
): Decimal {
  let base = baseCapital;

  if (esquema === "capitalizacion") {
    base = base.plus(refVigente).plus(refVne);
  }

  if (base.isZero() || diasPeriodo <= 0) return ZERO;

  return base.mul(tasaADecimal(tasa)).div(BASE_360).mul(diasPeriodo);
}

/**
 * Calcula el adeudo previo total de una disposición.
 * Suma todos los saldos ya vencidos: capital impago/VE,
 * interés impago/VE, refinanciado impago/VE, moratorio.
 */
function calcularAdeudoPrevio(disp: Disposicion): {
  capital: Decimal;
  interes: Decimal;
  moratorio: Decimal;
  total: Decimal;
} {
  const s = disp.saldos;

  const capital = s.capital_impago.plus(s.capital_vencido_exigible);
  const interes = s.interes_ordinario_impago
    .plus(s.interes_ordinario_ve)
    .plus(s.interes_refinanciado_impago)
    .plus(s.interes_refinanciado_ve);
  const moratorio = s.interes_moratorio_acumulado
    .plus(s.interes_moratorio_calculado);
  const total = capital.plus(interes).plus(moratorio);

  return { capital, interes, moratorio, total };
}

// ════════════════════════════════════════════════════════
// MOTOR PRINCIPAL
// ════════════════════════════════════════════════════════

/**
 * Genera el reporte de cobranza para un rango de fechas.
 *
 * Busca todos los periodos pendientes (no liquidados) cuya fecha_limite_pago
 * cae dentro del rango [fechaDesde, fechaHasta].
 *
 * Para cada periodo encontrado:
 * - Calcula el interés estimado del periodo
 * - Incluye el capital de la amortización
 * - Opcionalmente incluye adeudos previos (solo en la primera línea de cada disposición)
 */
export function generarCobranza(
  disposiciones: DisposicionNormalizada[],
  params: CobranzaParams
): ResultadoCobranza {
  const { fechaDesde, fechaHasta, incluirAdeudos } = params;

  const lineas: LineaCobranza[] = [];
  const foliosVistos = new Set<string>();

  // Timestamps para comparación eficiente
  const tsDesde = fechaDesde.getTime();
  const tsHasta = new Date(
    fechaHasta.getFullYear(),
    fechaHasta.getMonth(),
    fechaHasta.getDate(),
    23, 59, 59, 999
  ).getTime();

  for (const dnorm of disposiciones) {
    const disp = dnorm.disposicion;

    // Filtrar periodos pendientes con fecha_limite_pago en el rango
    const periodosEnRango = dnorm.periodos
      .filter((p) => {
        if (p.liquidada) return false;
        const ts = p.fecha_limite_pago.getTime();
        return ts >= tsDesde && ts <= tsHasta;
      })
      .sort((a, b) => a.fecha_limite_pago.getTime() - b.fecha_limite_pago.getTime());

    if (periodosEnRango.length === 0) continue;

    // Calcular base de capital para interés
    // Empieza con capital vigente + VNE (todo el capital que genera interés)
    let baseCapital = disp.saldos.capital_vigente
      .plus(disp.saldos.capital_vencido_no_exigible);

    // Adeudo previo (calculado una sola vez por disposición)
    const adeudo = incluirAdeudos ? calcularAdeudoPrevio(disp) : {
      capital: ZERO, interes: ZERO, moratorio: ZERO, total: ZERO,
    };

    // También considerar periodos ANTES del rango que no están liquidados
    // (su capital ya se habría ido a impago, reduciendo la base)
    const periodosAntesDelRango = dnorm.periodos
      .filter((p) => !p.liquidada && p.fecha_limite_pago.getTime() < tsDesde)
      .sort((a, b) => a.fecha_limite_pago.getTime() - b.fecha_limite_pago.getTime());

    for (const pAntes of periodosAntesDelRango) {
      if (pAntes.monto_capital.greaterThan(ZERO)) {
        baseCapital = baseCapital.minus(pAntes.monto_capital);
        if (baseCapital.lessThan(ZERO)) baseCapital = ZERO;
      }
    }

    let esPromeraLinea = true;

    for (const periodo of periodosEnRango) {
      // Interés estimado del periodo
      const interesPeriodo = calcularInteresPeriodo(
        baseCapital,
        disp.tasa_base_ordinaria,
        periodo.dias_periodo,
        disp.esquema_interes,
        disp.saldos.interes_refinanciado_vigente,
        disp.saldos.interes_refinanciado_vne
      );

      const capitalPeriodo = periodo.monto_capital;
      const totalPeriodo = interesPeriodo.plus(capitalPeriodo);

      // Adeudo solo en la primera línea de cada disposición (para no duplicar)
      const adeudoLinea = esPromeraLinea ? adeudo : {
        capital: ZERO, interes: ZERO, moratorio: ZERO, total: ZERO,
      };

      const totalAPagar = totalPeriodo.plus(adeudoLinea.total);

      lineas.push({
        folio_disposicion: disp.folio_disposicion,
        folio_cliente: dnorm.folio_cliente,
        cliente: disp.cliente,
        ejecutivo: dnorm.ejecutivo_disposicion,
        id_fondeador: dnorm.id_fondeador,
        fuente_fondeo: dnorm.fuente_fondeo,
        tipo_credito: disp.tipo_credito,
        esquema_interes: disp.esquema_interes,
        numero_amortizacion: periodo.numero_amortizacion,
        fecha_limite_pago: periodo.fecha_limite_pago.toISOString().slice(0, 10),
        interes_periodo: redondear(interesPeriodo),
        capital_periodo: redondear(capitalPeriodo),
        total_periodo: redondear(totalPeriodo),
        adeudo_capital: redondear(adeudoLinea.capital),
        adeudo_interes: redondear(adeudoLinea.interes),
        adeudo_moratorio: redondear(adeudoLinea.moratorio),
        adeudo_total: redondear(adeudoLinea.total),
        total_a_pagar: redondear(totalAPagar),
      });

      foliosVistos.add(disp.folio_disposicion);
      esPromeraLinea = false;

      // Reducir base para el siguiente periodo (capital ya se amortizó)
      if (capitalPeriodo.greaterThan(ZERO)) {
        baseCapital = baseCapital.minus(capitalPeriodo);
        if (baseCapital.lessThan(ZERO)) baseCapital = ZERO;
      }
    }
  }

  // Ordenar por fecha de pago, luego por folio
  lineas.sort((a, b) => {
    const cmp = a.fecha_limite_pago.localeCompare(b.fecha_limite_pago);
    if (cmp !== 0) return cmp;
    return a.folio_disposicion.localeCompare(b.folio_disposicion);
  });

  // Resumen
  let totalCapital = ZERO;
  let totalInteres = ZERO;
  let totalAdeudo = ZERO;
  let granTotal = ZERO;

  for (const l of lineas) {
    totalCapital = totalCapital.plus(l.capital_periodo);
    totalInteres = totalInteres.plus(l.interes_periodo);
    totalAdeudo = totalAdeudo.plus(l.adeudo_total);
    granTotal = granTotal.plus(l.total_a_pagar);
  }

  return {
    fecha_desde: fechaDesde.toISOString().slice(0, 10),
    fecha_hasta: fechaHasta.toISOString().slice(0, 10),
    incluye_adeudos: incluirAdeudos,
    lineas,
    resumen: {
      total_lineas: lineas.length,
      disposiciones_unicas: foliosVistos.size,
      total_capital: redondear(totalCapital),
      total_interes: redondear(totalInteres),
      total_adeudo: redondear(totalAdeudo),
      gran_total: redondear(granTotal),
    },
  };
}

function redondear(d: Decimal): number {
  return Math.round(d.toNumber() * 100) / 100;
}
