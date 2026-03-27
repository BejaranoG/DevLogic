/**
 * engine/etapas/evaluador.ts
 * Evaluación de etapa IFRS9 y validación inicial de disposición.
 */

import type {
  EtapaIFRS9,
  ReglaEtapa,
  Disposicion,
  ValidacionInicial,
} from "../shared/types";
import { resolverReglaEtapa } from "./reglas";

/**
 * Dado los días de atraso y una regla, determina en qué etapa debe estar.
 *
 * @param diasAtraso - Días de atraso actuales
 * @param regla - Regla de etapa de la disposición
 * @returns Etapa IFRS9: 1, 2 o 3
 */
export function evaluarEtapa(
  diasAtraso: number,
  regla: ReglaEtapa
): EtapaIFRS9 {
  // Arrendamiento: siempre Etapa 1
  if (regla.e3_inicio_dias === null) {
    return 1;
  }

  if (diasAtraso <= regla.e1_max_dias) {
    return 1;
  }

  if (regla.tiene_etapa2 && regla.e2_max_dias !== null) {
    if (diasAtraso <= regla.e2_max_dias) {
      return 2;
    }
  }

  return 3;
}

/**
 * Convierte texto de IFRS9 de Sheets a número.
 * 'ETAPA 1' → 1, 'ETAPA 2' → 2, 'ETAPA 3' → 3
 */
export function parsearEtapaSheets(texto: string): EtapaIFRS9 {
  const num = parseInt(texto.replace(/\D/g, ""), 10);
  if (num === 1 || num === 2 || num === 3) return num;
  throw new Error(`Etapa IFRS9 no válida: '${texto}'`);
}

/**
 * Valida que la etapa actual de una disposición sea coherente con sus días de atraso.
 * Si hay contradicción, la marca como no proyectable.
 *
 * Se ejecuta UNA SOLA VEZ al inicio de la proyección.
 *
 * @param disposicion - Disposición a validar
 * @returns Resultado de validación con regla si es proyectable
 */
export function validarEtapaInicial(
  disposicion: Disposicion
): ValidacionInicial {
  const regla = resolverReglaEtapa(
    disposicion.tipo_credito,
    disposicion.esquema_interes
  );

  if (!regla) {
    return {
      proyectable: false,
      motivo: `Sin regla de etapa para ${disposicion.tipo_credito}/${disposicion.esquema_interes}`,
    };
  }

  const etapaEsperada = evaluarEtapa(disposicion.dias_atraso_actual, regla);
  const etapaReal = disposicion.etapa_ifrs9_actual;

  if (etapaEsperada !== etapaReal) {
    return {
      proyectable: false,
      motivo:
        `Contradicción IFRS9: días_atraso=${disposicion.dias_atraso_actual}, ` +
        `regla dice Etapa ${etapaEsperada}, Sheets dice Etapa ${etapaReal}`,
    };
  }

  return { proyectable: true, regla };
}
