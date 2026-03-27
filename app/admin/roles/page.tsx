"use client";

import { useState, useEffect } from "react";
import { rolesApi } from "@/lib/api-client";
import { RoleBadge } from "@/components/admin/badge";
import { Modal } from "@/components/admin/modal";

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [toAssign, setToAssign] = useState<Set<string>>(new Set());
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([rolesApi.list(), rolesApi.permissions()]).then(([r, p]) => {
      setRoles(r);
      setCatalog(p);
      if (r.length > 0) setSelected(r[0].clave);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const active = roles.find((r) => r.clave === selected);
  const activePermClaves = new Set(active?.permisos?.map((p: any) => p.clave) || []);

  function openAssignModal() {
    setToAssign(new Set());
    setActionMsg(null);
    setModal(true);
  }

  async function assignSelected() {
    if (!selected || toAssign.size === 0) return;
    try {
      await rolesApi.assignPermissions(selected, Array.from(toAssign));
      setActionMsg(`${toAssign.size} permisos asignados`);
      const fresh = await rolesApi.list();
      setRoles(fresh);
      setModal(false);
    } catch (err: any) {
      setActionMsg("Error: " + err.message);
    }
  }

  async function revokePermission(clave: string) {
    if (!selected || !confirm(`¿Revocar "${clave}" del rol ${selected}?`)) return;
    try {
      await rolesApi.revokePermissions(selected, [clave]);
      const fresh = await rolesApi.list();
      setRoles(fresh);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  }

  if (loading) return <div className="adm-loading"><div className="spinner" /></div>;

  const availableToAssign = (catalog?.listado || []).filter((p: any) => !activePermClaves.has(p.clave));

  return (
    <div>
      <div className="adm-page-header">
        <h1>Roles y permisos</h1>
        <p>{roles.length} roles · {catalog?.total || 0} permisos en catálogo</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
        {/* Role list */}
        <div className="adm-card">
          <div className="adm-card-header">Roles</div>
          <div className="adm-card-body" style={{ padding: 0 }}>
            {roles.map((r: any) => (
              <div key={r.clave} className={"adm-list-item" + (selected === r.clave ? " active" : "")} onClick={() => setSelected(r.clave)}>
                <div>
                  <div style={{ fontWeight: 500 }}>{r.nombre}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>{r.total_usuarios} usuarios · {r.permisos.length} permisos</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected role detail */}
        <div>
          {active && (
            <div className="adm-card">
              <div className="adm-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <RoleBadge role={active.clave} />
                  <span style={{ marginLeft: 8, color: "var(--text3)", fontSize: 13 }}>{active.descripcion}</span>
                </div>
                {availableToAssign.length > 0 && (
                  <button className="adm-btn adm-btn-blue adm-btn-sm" onClick={openAssignModal}>+ Asignar permiso</button>
                )}
              </div>
              <div className="adm-card-body" style={{ padding: 0 }}>
                <table className="adm-table">
                  <thead>
                    <tr><th>Permiso</th><th>Módulo</th><th>Descripción</th><th></th></tr>
                  </thead>
                  <tbody>
                    {active.permisos.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text3)", padding: 24 }}>Sin permisos asignados</td></tr>
                    ) : active.permisos.map((p: any) => (
                      <tr key={p.clave}>
                        <td className="adm-mono" style={{ fontWeight: 500 }}>{p.clave}</td>
                        <td><span className="adm-badge adm-badge-gray">{p.modulo}</span></td>
                        <td style={{ fontSize: 13, color: "var(--text2)" }}>{p.descripcion || p.nombre}</td>
                        <td>
                          {!active.es_sistema || active.clave !== "admin_maestro" ? (
                            <button className="adm-btn adm-btn-red adm-btn-sm" onClick={() => revokePermission(p.clave)} style={{ fontSize: 11 }}>Revocar</button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Assign permission modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={`Asignar permisos a ${active?.nombre || ""}`}>
        {actionMsg && <div className="adm-alert adm-alert-blue" style={{ marginBottom: 12 }}>{actionMsg}</div>}
        <div style={{ maxHeight: 300, overflow: "auto" }}>
          {availableToAssign.map((p: any) => (
            <label key={p.clave} style={{ display: "flex", gap: 8, padding: "6px 0", cursor: "pointer", fontSize: 13, alignItems: "center" }}>
              <input type="checkbox" checked={toAssign.has(p.clave)} onChange={(e) => {
                const next = new Set(toAssign);
                e.target.checked ? next.add(p.clave) : next.delete(p.clave);
                setToAssign(next);
              }} />
              <span className="adm-mono">{p.clave}</span>
              <span style={{ color: "var(--text3)" }}>— {p.nombre}</span>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="adm-btn" onClick={() => setModal(false)}>Cancelar</button>
          <button className="adm-btn adm-btn-blue" onClick={assignSelected} disabled={toAssign.size === 0}>
            Asignar {toAssign.size > 0 ? `(${toAssign.size})` : ""}
          </button>
        </div>
      </Modal>
    </div>
  );
}
