/**
 * engine/periodo/periodos.ts
 * Construye la secuencia completa de periodos operativos para una disposición.
 *
 * CAMBIO CLAVE: Para esquema "periodico", genera sub-periodos mensuales
 * de interés en el día aniversario, independientemente de cuándo venza el capital.
 *
 * Ejemplo: CCC con 1 amortización de capital el 9/jun, fecha_entrega 9/dic, periódico:
 * → 6 periodos de interés mensual (9/ene, 9/feb, 9/mar, 9/abr, 9/may, 9/jun)
 * → El último coincide con la amortización de capital
 */

import { differenceInCalendarDays, addMonths, lastDayOfMonth } from "date-fns";
import { resolverCalendario, resolverFechaOperativa } from "./resolver";
import { ZERO } from "../shared/decimal-helpers";
import type {
  Amortizacion,
  PeriodoOperativo,
  ReglaDiaHabilNorm,
  CalendarioPais,
  EsquemaInteresNorm,
} from "../shared/types";

/**
 * Calcula la fecha del "día aniversario" para un mes dado.
 * Maneja meses que no tienen el día (e.g., día 31 en febrero → último día del mes).
 */
function fechaAniversario(anio: number, mes: number, diaAniversario: number): Date {
  const ultimoDia = lastDayOfMonth(new Date(anio, mes, 1)).getDate();
  const dia = Math.min(diaAniversario, ultimoDia);
  return new Date(anio, mes, dia);
}

/**
 * Genera fechas mensuales en el día aniversario desde la fecha de entrega
 * hasta la última amortización.
 */
function generarFechasMensualesInteres(
  fechaEntrega: Date,
  ultimaFechaAmort: Date
): Date[] {
  return generarFechasMensualesInteresConDia(
    fechaEntrega, ultimaFechaAmort, fechaEntrega.getDate()
  );
}

/**
 * Genera fechas mensuales usando un día aniversario explícito.
 * El día aniversario viene de la primera amortización de capital.
 */
function generarFechasMensualesInteresConDia(
  fechaEntrega: Date,
  ultimaFechaAmort: Date,
  diaAniv: number
): Date[] {
  const fechas: Date[] = [];

  // Start from the month after entrega
  let anio = fechaEntrega.getFullYear();
  let mes = fechaEntrega.getMonth() + 1;
  if (mes > 11) { mes = 0; anio++; }

  let fecha = fechaAniversario(anio, mes, diaAniv);

  const limite = ultimaFechaAmort.getTime() + 86400000;

  while (fecha.getTime() <= limite) {
    fechas.push(fecha);
    mes++;
    if (mes > 11) { mes = 0; anio++; }
    fecha = fechaAniversario(anio, mes, diaAniv);
  }

  return fechas;
}

/**
 * Construye la secuencia de periodos operativos para una disposición.
 *
 * Para esquema "periodico": genera sub-periodos mensuales de interés
 * en el día aniversario (fecha_entrega.getDate()).
 *
 * Para "acumulacion" y "capitalizacion": periodos siguen las amortizaciones
 * de capital (interés vence con capital).
 */
export function construirPeriodos(
  amortizaciones: Amortizacion[],
  reglaDiaHabil: ReglaDiaHabilNorm,
  tipoTasa: string,
  fechaEntrega: Date,
  esquema?: EsquemaInteresNorm,
  fechaFinal?: Date
): PeriodoOperativo[] {
  if (amortizaciones.length === 0) return [];

  const calendario: CalendarioPais = resolverCalendario(tipoTasa);

  const sorted = [...amortizaciones].sort(
    (a, b) => a.fecha_vencimiento.getTime() - b.fecha_vencimiento.getTime()
  );

  // ── Construir periodos de CAPITAL (como antes) ──
  const periodosCapital: PeriodoOperativo[] = [];
  let fkAnterior: Date | null = null;

  for (const amort of sorted) {
    const ops = resolverFechaOperativa(
      amort.fecha_vencimiento,
      reglaDiaHabil,
      calendario
    );

    let diasPeriodo: number;
    if (fkAnterior === null) {
      diasPeriodo = differenceInCalendarDays(ops.fecha_corte, fechaEntrega);
    } else {
      diasPeriodo = differenceInCalendarDays(ops.fecha_corte, fkAnterior);
    }

    if (diasPeriodo <= 0) {
      throw new Error(
        `Periodo no positivo (${diasPeriodo} días) en amort #${amort.numero_amortizacion} ` +
        `de disp ${amort.folio_disposicion}. ` +
        `Fk=${ops.fecha_corte.toISOString().slice(0, 10)}, ` +
        `Fk_ant=${fkAnterior?.toISOString().slice(0, 10) ?? "entrega"}`
      );
    }

    periodosCapital.push({
      numero_amortizacion: amort.numero_amortizacion,
      fecha_contractual: amort.fecha_vencimiento,
      fecha_corte: ops.fecha_corte,
      fecha_limite_pago: ops.fecha_limite_pago,
      fecha_inicio_impago: ops.fecha_inicio_impago,
      dias_periodo: diasPeriodo,
      monto_capital: amort.monto_capital,
      liquidada: amort.amortizacion_liquidada,
      es_sintetica: false,
    });

    fkAnterior = ops.fecha_corte;
  }

  // ── Para esquema != "periodico", solo retornar periodos de capital ──
  if (!esquema || esquema !== "periodico") {
    return periodosCapital;
  }

  // ── Determinar si el capital ya es periódico (mensual o más frecuente) ──
  // Si las amortizaciones de capital ya cubren el periodo con intervalos <= 45 días,
  // el interés sigue las MISMAS fechas que el capital → no generar sub-periodos.
  const amortsPendientes = periodosCapital.filter((p) => !p.liquidada);
  if (amortsPendientes.length >= 2) {
    // Calcular intervalo promedio entre amortizaciones de capital
    let sumaIntervalos = 0;
    for (let i = 1; i < amortsPendientes.length; i++) {
      sumaIntervalos += differenceInCalendarDays(
        amortsPendientes[i].fecha_contractual,
        amortsPendientes[i - 1].fecha_contractual
      );
    }
    const promedioIntervalo = sumaIntervalos / (amortsPendientes.length - 1);

    if (promedioIntervalo <= 45) {
      // Capital es periódico (mensual o similar) → interés sigue las mismas fechas
      return periodosCapital;
    }
  }

  // ── Capital NO periódico: generar sub-periodos mensuales de interés ──
  // Día aniversario = día del mes de la amortización de capital (NO fecha_final).
  // Si la amortización vence el 9 de junio, los sub-periodos caen los 9 de cada mes.
  const ultimaAmort = sorted[sorted.length - 1];
  const diaAniversarioCapital = ultimaAmort.fecha_vencimiento.getDate();

  const fechasMensuales = generarFechasMensualesInteresConDia(
    fechaEntrega,
    ultimaAmort.fecha_vencimiento,
    diaAniversarioCapital
  );

  // Crear un Set de fechas de capital (contractuales) para detectar colisiones
  const fechasCapitalTs = new Set<number>(
    periodosCapital.map((p) => p.fecha_contractual.getTime())
  );

  // Generar periodos de interés para fechas que NO coinciden con capital
  const periodosInteres: PeriodoOperativo[] = [];
  let numSintetica = 9000; // Numeración alta para no colisionar

  for (const fechaInteres of fechasMensuales) {
    // Si ya hay una amortización de capital en esta fecha, skip
    if (fechasCapitalTs.has(fechaInteres.getTime())) continue;

    // Verificar que no esté muy cerca (+/- 2 días) de una fecha de capital
    const cercaDeCapital = periodosCapital.some((p) =>
      Math.abs(differenceInCalendarDays(p.fecha_contractual, fechaInteres)) <= 2
    );
    if (cercaDeCapital) continue;

    const ops = resolverFechaOperativa(
      fechaInteres,
      reglaDiaHabil,
      calendario
    );

    periodosInteres.push({
      numero_amortizacion: numSintetica++,
      fecha_contractual: fechaInteres,
      fecha_corte: ops.fecha_corte,
      fecha_limite_pago: ops.fecha_limite_pago,
      fecha_inicio_impago: ops.fecha_inicio_impago,
      dias_periodo: 0, // Se recalcula después
      monto_capital: ZERO, // Solo interés, sin capital
      liquidada: false,
      es_sintetica: true,
    });
  }

  // ── Merge: combinar capital + interés, ordenar por fecha_corte ──
  const todos = [...periodosCapital, ...periodosInteres].sort(
    (a, b) => a.fecha_corte.getTime() - b.fecha_corte.getTime()
  );

  // Recalcular dias_periodo para la lista merged
  for (let i = 0; i < todos.length; i++) {
    if (i === 0) {
      todos[i].dias_periodo = differenceInCalendarDays(
        todos[i].fecha_corte,
        fechaEntrega
      );
    } else {
      todos[i].dias_periodo = differenceInCalendarDays(
        todos[i].fecha_corte,
        todos[i - 1].fecha_corte
      );
    }
    // Asegurar positivo
    if (todos[i].dias_periodo <= 0) {
      todos[i].dias_periodo = 1;
    }
  }

  return todos;
}
