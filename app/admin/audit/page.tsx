"use client";

import { useState, useEffect } from "react";
import { auditApi } from "@/lib/api-client";
import { ActionBadge } from "@/components/admin/badge";

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState("");
  const [email, setEmail] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 30;

  useEffect(() => { load(); }, [accion, email, desde, hasta, offset]);

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: String(limit), offset: String(offset) };
      if (accion) params.accion = accion;
      if (email) params.email = email;
      if (desde) params.desde = desde;
      if (hasta) params.hasta = hasta;
      const res = await auditApi.query(params);
      setLogs(res.logs || []);
      setTotal(res.total || 0);
    } catch { setLogs([]); }
    setLoading(false);
  }

  const totalPages = Math.ceil(total / limit);
  const page = Math.floor(offset / limit) + 1;

  return (
    <div>
      <div className="adm-page-header">
        <h1>Log de auditoría</h1>
        <p>{total} registros</p>
      </div>

      <div className="adm-filters">
        <input type="text" placeholder="Buscar por email…" value={email} onChange={(e) => { setEmail(e.target.value); setOffset(0); }} className="adm-input" />
        <select value={accion} onChange={(e) => { setAccion(e.target.value); setOffset(0); }} className="adm-select">
          <option value="">Todas las acciones</option>
          <optgroup label="Auth">
            <option value="login">login</option>
            <option value="login_fallido">login_fallido</option>
            <option value="registro_solicitud">registro_solicitud</option>
            <option value="registro_verificado">registro_verificado</option>
          </optgroup>
          <optgroup label="Admin">
            <option value="usuario_aprobado">usuario_aprobado</option>
            <option value="usuario_rechazado">usuario_rechazado</option>
            <option value="usuario_desactivado">usuario_desactivado</option>
            <option value="usuario_reactivado">usuario_reactivado</option>
            <option value="rol_asignado">rol_asignado</option>
            <option value="permiso_otorgado">permiso_otorgado</option>
            <option value="permiso_revocado">permiso_revocado</option>
          </optgroup>
        </select>
        <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setOffset(0); }} className="adm-input" style={{ width: 160 }} />
        <input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setOffset(0); }} className="adm-input" style={{ width: 160 }} />
      </div>

      <div className="adm-card">
        <div className="adm-card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="adm-loading"><div className="spinner" /></div>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Fecha</th>
                  <th>Acción</th>
                  <th>Actor</th>
                  <th>Objetivo</th>
                  <th>IP</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text3)", padding: 32 }}>Sin registros</td></tr>
                ) : logs.map((l: any) => (
                  <tr key={l.id}>
                    <td className="adm-mono" style={{ fontSize: 12 }}>
                      {new Date(l.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "medium" })}
                    </td>
                    <td><ActionBadge action={l.accion} /></td>
                    <td style={{ fontSize: 13 }}>{l.user?.email || "—"}</td>
                    <td style={{ fontSize: 13 }}>{l.target_user?.email || "—"}</td>
                    <td className="adm-mono" style={{ fontSize: 11 }}>{l.ip_address || "—"}</td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text3)" }}>
                      {l.detalle && typeof l.detalle === "object" ? Object.entries(l.detalle).filter(([k]) => k !== "admin_email" && k !== "admin_role").map(([k, v]) => `${k}: ${v}`).join(", ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="adm-pagination">
            <button className="adm-btn adm-btn-sm" disabled={page <= 1} onClick={() => setOffset(offset - limit)}>← Anterior</button>
            <span style={{ fontSize: 13, color: "var(--text3)" }}>Página {page} de {totalPages}</span>
            <button className="adm-btn adm-btn-sm" disabled={page >= totalPages} onClick={() => setOffset(offset + limit)}>Siguiente →</button>
          </div>
        )}
      </div>
    </div>
  );
}
