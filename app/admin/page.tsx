"use client";

import { useState, useEffect } from "react";
import { auditApi, usersApi } from "@/lib/api-client";
import { StatCard } from "@/components/admin/stat-card";
import { ActionBadge } from "@/components/admin/badge";

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [pending, setPending] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      auditApi.dashboard(7).catch(() => null),
      usersApi.pending().catch(() => null),
    ]).then(([d, p]) => {
      setDashboard(d);
      setPending(p);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="adm-loading"><div className="spinner" /></div>;

  const d = dashboard;
  const pendCount = pending?.total || 0;

  return (
    <div>
      <div className="adm-page-header">
        <h1>Panel de Administración</h1>
        <p>Resumen de los últimos 7 días</p>
      </div>

      <div className="adm-stats-grid">
        <StatCard label="Logins hoy" value={d?.hoy?.logins_exitosos ?? "—"} color="green" />
        <StatCard label="Logins fallidos hoy" value={d?.hoy?.logins_fallidos ?? "—"} color="red" />
        <StatCard label="Usuarios activos (7d)" value={d?.periodo_completo?.usuarios_activos ?? "—"} color="blue" />
        <StatCard label="Pendientes de aprobación" value={pendCount} color={pendCount > 0 ? "yellow" : "green"} sub={pendCount > 0 ? "Requieren atención" : "Todo al día"} />
        <StatCard label="Eventos totales (7d)" value={d?.periodo_completo?.total_eventos_periodo ?? "—"} color="purple" />
        <StatCard label="Total histórico" value={d?.total_historico ?? "—"} />
      </div>

      {/* Pending users alert */}
      {pendCount > 0 && (
        <div className="adm-alert adm-alert-yellow">
          <strong>{pendCount} usuario{pendCount > 1 ? "s" : ""} pendiente{pendCount > 1 ? "s" : ""} de aprobación.</strong>
          {" "}<a href="/admin/users">Gestionar →</a>
        </div>
      )}

      {/* Events by type */}
      {d?.periodo_completo?.eventos_por_tipo?.length > 0 && (
        <div className="adm-card" style={{ marginTop: 16 }}>
          <div className="adm-card-header">Eventos por tipo (últimos 7 días)</div>
          <div className="adm-card-body">
            <table className="adm-table">
              <thead><tr><th>Evento</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {d.periodo_completo.eventos_por_tipo.map((e: any) => (
                  <tr key={e.accion}>
                    <td><ActionBadge action={e.accion} /></td>
                    <td style={{ textAlign: "right", fontFamily: "Geist Mono, monospace" }}>{e.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent admin actions */}
      {d?.ultimas_acciones_admin?.length > 0 && (
        <div className="adm-card" style={{ marginTop: 16 }}>
          <div className="adm-card-header">Últimas acciones administrativas</div>
          <div className="adm-card-body">
            <table className="adm-table">
              <thead><tr><th>Fecha</th><th>Acción</th><th>Admin</th><th>Objetivo</th></tr></thead>
              <tbody>
                {d.ultimas_acciones_admin.map((l: any, i: number) => (
                  <tr key={i}>
                    <td className="adm-mono">{new Date(l.fecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td><ActionBadge action={l.accion} /></td>
                    <td>{l.admin}</td>
                    <td>{l.objetivo || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Suspicious IPs */}
      {d?.seguridad?.ips_con_mas_fallos?.length > 0 && (
        <div className="adm-card" style={{ marginTop: 16 }}>
          <div className="adm-card-header">IPs con más intentos fallidos (7d)</div>
          <div className="adm-card-body">
            <table className="adm-table">
              <thead><tr><th>IP</th><th style={{ textAlign: "right" }}>Intentos</th></tr></thead>
              <tbody>
                {d.seguridad.ips_con_mas_fallos.map((ip: any, i: number) => (
                  <tr key={i}>
                    <td className="adm-mono">{ip.ip}</td>
                    <td style={{ textAlign: "right", color: "var(--red)" }}>{ip.intentos_fallidos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
