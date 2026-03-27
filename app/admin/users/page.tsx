"use client";

import { useState, useEffect, useCallback } from "react";
import { usersApi } from "@/lib/api-client";
import { StatusBadge, RoleBadge } from "@/components/admin/badge";
import { Modal } from "@/components/admin/modal";

type Tab = "todos" | "pendientes" | "sin_verificar";
const ROLES = ["admin", "gerencia", "cartera", "ejecutivo", "staff"];

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>("todos");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");

  // Modal state
  const [modal, setModal] = useState<{ type: string; user: any } | null>(null);
  const [modalRole, setModalRole] = useState("staff");
  const [modalMotivo, setModalMotivo] = useState("");
  const [modalSheets, setModalSheets] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "pendientes") setData(await usersApi.pending());
      else if (tab === "sin_verificar") setData(await usersApi.unverified());
      else setData(await usersApi.list());
    } catch { setData(null); }
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const users = (tab === "pendientes" ? data?.pendientes : tab === "sin_verificar" ? data : data?.usuarios) || [];
  const filtered = users.filter((u: any) => {
    if (search) {
      const q = search.toLowerCase();
      if (!u.email?.toLowerCase().includes(q) && !u.nombre?.toLowerCase().includes(q) && !u.apellido?.toLowerCase().includes(q) && !u.numero_identificacion?.toLowerCase().includes(q)) return false;
    }
    if (filterRole !== "todos" && (u.role?.clave || u.role) !== filterRole) return false;
    if (filterStatus !== "todos" && u.status !== filterStatus) return false;
    return true;
  });

  async function executeAction() {
    if (!modal) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const { type, user } = modal;
      if (type === "approve") await usersApi.approve(user.id, { role_clave: modalRole, motivo: modalMotivo || undefined });
      else if (type === "reject") await usersApi.reject(user.id, { motivo: modalMotivo });
      else if (type === "deactivate") await usersApi.deactivate(user.id, { motivo: modalMotivo });
      else if (type === "reactivate") await usersApi.reactivate(user.id, { role_clave: modalRole, motivo: modalMotivo || undefined });
      else if (type === "changeRole") await usersApi.changeRole(user.id, { role_clave: modalRole, motivo: modalMotivo || undefined });
      else if (type === "portfolio") await usersApi.mapPortfolio(user.id, { nombre_ejecutivo_sheets: modalSheets, motivo: modalMotivo || undefined });
      setModal(null);
      setModalMotivo("");
      setModalSheets("");
      load();
    } catch (err: any) {
      setActionError(err.message || "Error");
    }
    setActionLoading(false);
  }

  function openModal(type: string, user: any) {
    setModal({ type, user });
    setModalRole(user.role?.clave || "staff");
    setModalMotivo("");
    setModalSheets(user.nombre_en_sheets || "");
    setActionError(null);
  }

  return (
    <div>
      <div className="adm-page-header">
        <h1>Gestión de usuarios</h1>
        <p>{data?.total ?? users.length} usuarios</p>
      </div>

      {/* Tabs */}
      <div className="adm-tabs">
        {(["todos", "pendientes", "sin_verificar"] as Tab[]).map((t) => (
          <button key={t} className={"adm-tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {t === "todos" ? "Todos" : t === "pendientes" ? "Pendientes" : "Sin verificar"}
          </button>
        ))}
      </div>

      {/* Filters */}
      {tab === "todos" && (
        <div className="adm-filters">
          <input type="text" placeholder="Buscar por nombre, email o ID…" value={search} onChange={(e) => setSearch(e.target.value)} className="adm-input" />
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="adm-select">
            <option value="todos">Todos los roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="adm-select">
            <option value="todos">Todos los estados</option>
            <option value="aprobado">Aprobado</option>
            <option value="pendiente">Pendiente</option>
            <option value="rechazado">Rechazado</option>
            <option value="desactivado">Desactivado</option>
            <option value="bloqueado">Bloqueado</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="adm-loading"><div className="spinner" /></div>
      ) : (
        <div className="adm-card">
          <div className="adm-card-body" style={{ padding: 0 }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  {tab === "sin_verificar" && <th>Código</th>}
                  <th>Registro</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text3)", padding: 32 }}>Sin resultados</td></tr>
                ) : filtered.map((u: any) => (
                  <tr key={u.id}>
                    <td className="adm-mono">{u.numero_identificacion}</td>
                    <td>{u.nombre} {u.apellido}</td>
                    <td className="adm-mono" style={{ fontSize: 12 }}>{u.email}</td>
                    <td><RoleBadge role={u.role?.clave || u.role || "staff"} /></td>
                    <td><StatusBadge status={u.status || (u.verificado ? "pendiente" : "sin_verificar")} /></td>
                    {tab === "sin_verificar" && (
                      <td className="adm-mono" style={{ fontWeight: 600, color: "var(--purple)", letterSpacing: 2 }}>
                        {u.codigo_verificacion || "—"}
                      </td>
                    )}
                    <td style={{ fontSize: 12, color: "var(--text3)" }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString("es-MX") : "—"}
                    </td>
                    <td>
                      <div className="adm-actions">
                        {u.status === "pendiente" && u.verificado !== false && (
                          <>
                            <button className="adm-btn adm-btn-green adm-btn-sm" onClick={() => openModal("approve", u)}>Aprobar</button>
                            <button className="adm-btn adm-btn-red adm-btn-sm" onClick={() => openModal("reject", u)}>Rechazar</button>
                          </>
                        )}
                        {u.status === "aprobado" && (
                          <>
                            <button className="adm-btn adm-btn-sm" onClick={() => openModal("changeRole", u)}>Cambiar rol</button>
                            <button className="adm-btn adm-btn-sm" onClick={() => openModal("portfolio", u)}>Cartera</button>
                            <button className="adm-btn adm-btn-red adm-btn-sm" onClick={() => openModal("deactivate", u)}>Desactivar</button>
                          </>
                        )}
                        {(u.status === "desactivado" || u.status === "rechazado" || u.status === "bloqueado") && (
                          <button className="adm-btn adm-btn-green adm-btn-sm" onClick={() => openModal("reactivate", u)}>Reactivar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={
        modal?.type === "approve" ? `Aprobar a ${modal?.user?.nombre}` :
        modal?.type === "reject" ? `Rechazar a ${modal?.user?.nombre}` :
        modal?.type === "deactivate" ? `Desactivar a ${modal?.user?.nombre}` :
        modal?.type === "reactivate" ? `Reactivar a ${modal?.user?.nombre}` :
        modal?.type === "changeRole" ? `Cambiar rol de ${modal?.user?.nombre}` :
        modal?.type === "portfolio" ? `Asignar cartera a ${modal?.user?.nombre}` : ""
      }>
        {actionError && <div className="adm-alert adm-alert-red" style={{ marginBottom: 12 }}>{actionError}</div>}

        {(modal?.type === "approve" || modal?.type === "reactivate" || modal?.type === "changeRole") && (
          <div className="login-field">
            <label>Rol a asignar</label>
            <select value={modalRole} onChange={(e) => setModalRole(e.target.value)} className="adm-select" style={{ width: "100%" }}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
            </select>
          </div>
        )}

        {modal?.type === "portfolio" && (
          <div className="login-field">
            <label>Nombre del ejecutivo en Google Sheets</label>
            <input type="text" value={modalSheets} onChange={(e) => setModalSheets(e.target.value)} className="adm-input" style={{ width: "100%" }} placeholder="JUAN PEREZ LOPEZ" />
            <small style={{ color: "var(--text3)" }}>Debe coincidir exactamente con la columna EJECUTIVO LÍNEA del Sheet</small>
          </div>
        )}

        <div className="login-field">
          <label>{modal?.type === "reject" || modal?.type === "deactivate" ? "Motivo (obligatorio)" : "Motivo (opcional)"}</label>
          <textarea value={modalMotivo} onChange={(e) => setModalMotivo(e.target.value)} className="adm-input" style={{ width: "100%", minHeight: 60 }}
            placeholder={modal?.type === "reject" ? "Indica por qué se rechaza…" : modal?.type === "deactivate" ? "Indica el motivo de la baja…" : "Opcional…"} />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="adm-btn" onClick={() => setModal(null)}>Cancelar</button>
          <button
            className={"adm-btn " + (modal?.type === "reject" || modal?.type === "deactivate" ? "adm-btn-red" : "adm-btn-blue")}
            onClick={executeAction} disabled={actionLoading || ((modal?.type === "reject" || modal?.type === "deactivate") && modalMotivo.length < 5)}
          >
            {actionLoading ? "Procesando…" : modal?.type === "approve" ? "Aprobar" : modal?.type === "reject" ? "Rechazar" : modal?.type === "deactivate" ? "Desactivar" : modal?.type === "reactivate" ? "Reactivar" : modal?.type === "changeRole" ? "Cambiar rol" : "Guardar"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
