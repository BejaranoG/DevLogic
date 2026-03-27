"use client";

import { useState, useEffect } from "react";
import { auditApi } from "@/lib/api-client";

export default function LoginsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"todos" | "exitosos" | "fallidos">("todos");
  const [desde, setDesde] = useState("");

  useEffect(() => { load(); }, [desde]);

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "100" };
      if (desde) params.desde = desde;
      const res = await auditApi.logins(params);
      setLogs(res.logs || []);
    } catch { setLogs([]); }
    setLoading(false);
  }

  const filtered = filter === "todos" ? logs
    : filter === "exitosos" ? logs.filter((l: any) => l.accion === "login")
    : logs.filter((l: any) => l.accion === "login_fallido");

  const exitosos = logs.filter((l: any) => l.accion === "login").length;
  const fallidos = logs.filter((l: any) => l.accion === "login_fallido").length;

  return (
    <div>
      <div className="adm-page-header">
        <h1>Actividad de login</h1>
        <p>{logs.length} eventos de acceso</p>
      </div>

      {/* Quick stats */}
      <div className="adm-stats-grid" style={{ marginBottom: 16 }}>
        <div className={"adm-stat" + (filter === "todos" ? " adm-stat-selected" : "")} onClick={() => setFilter("todos")} style={{ cursor: "pointer" }}>
          <div className="adm-stat-label">Total</div>
          <div className="adm-stat-value">{logs.length}</div>
        </div>
        <div className={"adm-stat adm-stat-green" + (filter === "exitosos" ? " adm-stat-selected" : "")} onClick={() => setFilter("exitosos")} style={{ cursor: "pointer" }}>
          <div className="adm-stat-label">Exitosos</div>
          <div className="adm-stat-value">{exitosos}</div>
        </div>
        <div className={"adm-stat adm-stat-red" + (filter === "fallidos" ? " adm-stat-selected" : "")} onClick={() => setFilter("fallidos")} style={{ cursor: "pointer" }}>
          <div className="adm-stat-label">Fallidos</div>
          <div className="adm-stat-value">{fallidos}</div>
        </div>
      </div>

      <div className="adm-filters">
        <label style={{ fontSize: 13, color: "var(--text3)" }}>Desde:</label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="adm-input" style={{ width: 160 }} />
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
                  <th style={{ width: 80 }}>Estado</th>
                  <th>Email</th>
                  <th>Razón (si falló)</th>
                  <th>IP</th>
                  <th>User Agent</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text3)", padding: 32 }}>Sin eventos</td></tr>
                ) : filtered.map((l: any) => {
                  const ok = l.accion === "login";
                  const detalle = l.detalle || {};
                  return (
                    <tr key={l.id}>
                      <td className="adm-mono" style={{ fontSize: 12 }}>
                        {new Date(l.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "medium" })}
                      </td>
                      <td>
                        <span className={"adm-badge " + (ok ? "adm-badge-green" : "adm-badge-red")}>
                          {ok ? "OK" : "FALLO"}
                        </span>
                      </td>
                      <td className="adm-mono" style={{ fontSize: 12 }}>{l.user?.email || detalle.email || "—"}</td>
                      <td style={{ fontSize: 12, color: ok ? "var(--text3)" : "var(--red)" }}>
                        {ok ? "—" : (detalle.razon || "").replace(/_/g, " ")}
                      </td>
                      <td className="adm-mono" style={{ fontSize: 11 }}>{l.ip_address || "—"}</td>
                      <td style={{ fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text3)" }}>
                        {l.user_agent ? l.user_agent.slice(0, 60) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
