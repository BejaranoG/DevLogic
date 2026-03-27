/**
 * components/labels.ts
 * Prettifies internal enum values to human-readable Spanish labels.
 */

const TIPO_CREDITO: Record<string, string> = {
  credito_simple: "Crédito Simple",
  refaccionario: "Refaccionario",
  ccc: "Cuenta Corriente",
  hab_avio: "Habilitación o Avío",
  factoraje: "Factoraje",
  arrendamiento: "Arrendamiento",
};

const ESQUEMA: Record<string, string> = {
  periodico: "Cobro Periódico",
  acumulacion: "Acumulación de Intereses",
  capitalizacion: "Capitalización de Intereses",
};

export function labelTipoCredito(val: string): string {
  return TIPO_CREDITO[val] || val;
}

export function labelEsquema(val: string): string {
  return ESQUEMA[val] || val;
}

export function labelMoneda(val: string): string {
  if (val === "MEXICAN PESO" || val === "MXN") return "MXN (Peso Mexicano)";
  if (val === "US DOLLAR" || val === "USD") return "USD (Dólar)";
  return val;
}

export function labelEtapa(etapa: number): string {
  if (etapa === 1) return "Etapa 1 — Vigente";
  if (etapa === 2) return "Etapa 2 — Preventivo";
  if (etapa === 3) return "Etapa 3 — Vencido";
  return "Etapa " + etapa;
}
