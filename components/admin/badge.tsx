"use client";

const STATUS_STYLES: Record<string, string> = {
  aprobado:     "adm-badge-green",
  pendiente:    "adm-badge-yellow",
  rechazado:    "adm-badge-red",
  desactivado:  "adm-badge-gray",
  bloqueado:    "adm-badge-red",
};

const ROLE_STYLES: Record<string, string> = {
  admin_maestro: "adm-badge-purple",
  admin:         "adm-badge-blue",
  gerencia:      "adm-badge-teal",
  cartera:       "adm-badge-teal",
  ejecutivo:     "adm-badge-yellow",
  staff:         "adm-badge-gray",
};

const ROLE_LABELS: Record<string, string> = {
  admin_maestro: "Admin Maestro",
  admin: "Administrador",
  gerencia: "Gerencia",
  cartera: "Cartera",
  ejecutivo: "Ejecutivo",
  staff: "Staff",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={"adm-badge " + (STATUS_STYLES[status] || "adm-badge-gray")}>{status}</span>;
}

export function RoleBadge({ role }: { role: string }) {
  return <span className={"adm-badge " + (ROLE_STYLES[role] || "adm-badge-gray")}>{ROLE_LABELS[role] || role}</span>;
}

export function ActionBadge({ action }: { action: string }) {
  const isError = action.includes("fallido") || action.includes("rechazado") || action.includes("bloqueado") || action.includes("desactivado") || action.includes("revocado");
  const isSuccess = action.includes("aprobado") || action.includes("login") && !action.includes("fallido") || action.includes("reactivado");
  const cls = isError ? "adm-badge-red" : isSuccess ? "adm-badge-green" : "adm-badge-blue";
  return <span className={"adm-badge " + cls}>{action.replace(/_/g, " ")}</span>;
}
