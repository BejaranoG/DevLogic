"use client";

import { useState, useEffect } from "react";
import { sugerenciasApi } from "@/lib/api-client";

export default function SugerenciasPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroLeido, setFiltroLeido] = useState("");

  useEffect(() => { load(); }, [filtroTipo, filtroLeido]);

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filtroTipo) params.tipo = filtroTipo;
      if (filtroLeido) params.leido = filtroLeido;
      const res = await sugerenciasApi.listar(params);
      setItems(res.sugerencias || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error("Error cargando sugerencias", err);
    }
    setLoading(false);
  }

  async function marcarLeido(id: string) {
    try {
      await sugerenciasApi.marcarLeido(id);
      setItems((prev) =>
        prev.map((s) => (s.id === id ? { ...s, leido: true } : s))
      );
    } catch (err) {
      alert("Error al marcar como leído");
    }
  }

  const pendientes = items.filter((s) => !s.leido).length;

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>Buzón de Sugerencias</h2>
      <p style={{ fontSize: 13, color: "var(--text3, #888)", margin: "0 0 20px" }}>
        {total} mensaje{total !== 1 ? "s" : ""} · {pendientes} sin leer
      </p>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="tl-sel-input"
          style={{ fontSize: 13, padding: "6px 10px" }}
        >
          <option value="">Todos los tipos</option>
          <option value="sugerencia">Sugerencias</option>
          <option value="queja">Quejas</option>
        </select>

        <select
          value={filtroLeido}
          onChange={(e) => setFiltroLeido(e.target.value)}
          className="tl-sel-input"
          style={{ fontSize: 13, padding: "6px 10px" }}
        >
          <option value="">Todos</option>
          <option value="false">Sin leer</option>
          <option value="true">Leídos</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>Cargando…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>
          No hay mensajes{filtroTipo || filtroLeido ? " con esos filtros" : ""}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((s) => (
            <div
              key={s.id}
              style={{
                background: s.leido ? "var(--surface, #fff)" : "rgba(99,102,241,.04)",
                border: s.leido ? "1px solid var(--border)" : "1.5px solid rgba(99,102,241,.2)",
                borderRadius: 10,
                padding: "14px 18px",
                position: "relative",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{
                  display: "inline-block",
                  padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: s.tipo === "queja" ? "rgba(220,38,38,.1)" : "rgba(37,99,235,.1)",
                  color: s.tipo === "queja" ? "#dc2626" : "#2563eb",
                  textTransform: "uppercase",
                }}>
                  {s.tipo}
                </span>
                {!s.leido && (
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#6366f1", display: "inline-block",
                  }} />
                )}
                <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: "auto" }}>
                  {new Date(s.created_at).toLocaleString("es-MX", {
                    day: "2-digit", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>

              {/* Body */}
              <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.5, color: "var(--text)", whiteSpace: "pre-wrap" }}>
                {s.mensaje}
              </p>

              {/* Footer */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>
                  <strong>{s.user_nombre}</strong> · {s.user_email} · <span style={{ textTransform: "capitalize" }}>{s.user_role}</span>
                </div>
                {!s.leido && (
                  <button
                    onClick={() => marcarLeido(s.id)}
                    style={{
                      fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                      padding: "4px 14px", borderRadius: 6,
                      background: "none", border: "1.5px solid var(--border)",
                      color: "var(--text3)", cursor: "pointer",
                    }}
                  >
                    Marcar como leído
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
