/**
 * lib/cartera-context.ts
 * Estado global ligero para la cartera seleccionada.
 * Permite que el topbar sepa qué cartera está activa en el dashboard.
 */

const globalRef = globalThis as unknown as { __carteraSeleccionada?: string };

export function getCarteraSeleccionada(): "activa" | "pasiva" {
  return (globalRef.__carteraSeleccionada as any) || "activa";
}

export function setCarteraSeleccionada(tipo: "activa" | "pasiva") {
  globalRef.__carteraSeleccionada = tipo;
  // Dispatch event para que el topbar se entere
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cartera-changed", { detail: tipo }));
  }
}
