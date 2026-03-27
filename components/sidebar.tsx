"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { sugerenciasApi } from "@/lib/api-client";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const [buzonOpen, setBuzonOpen] = useState(false);
  const [buzonMsg, setBuzonMsg] = useState("");
  const [buzonTipo, setBuzonTipo] = useState<"sugerencia" | "queja">("sugerencia");
  const [buzonSending, setBuzonSending] = useState(false);
  const [buzonSent, setBuzonSent] = useState(false);

  const isAdmin = auth?.user?.role === "admin_maestro" || auth?.user?.role === "admin";
  const canSubmitBuzon = auth?.user && !isAdmin;

  function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("logic-theme", next);
  }

  async function enviarBuzon() {
    if (!buzonMsg.trim() || buzonSending) return;
    setBuzonSending(true);
    try {
      await sugerenciasApi.enviar({ tipo: buzonTipo, mensaje: buzonMsg.trim() });
      setBuzonSent(true);
      setBuzonMsg("");
      setTimeout(() => { setBuzonSent(false); setBuzonOpen(false); }, 2000);
    } catch (err: any) {
      alert("Error: " + (err.message || "No se pudo enviar"));
    }
    setBuzonSending(false);
  }

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="sidebar">
      {/* Logo */}
      <a href="/" className="sb-logo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span className="sb-text">LOGIC</span>
      </a>

      {/* Navigation */}
      <div className="sb-nav">
        <a href="/" className={"sb-item" + (isActive("/") ? " active" : "")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span className="sb-text">Cartera</span>
        </a>

        <a href="/reportes" className={"sb-item" + (pathname.startsWith("/reportes") ? " active" : "")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span className="sb-text">Reportes</span>
        </a>

        {auth?.isAdmin && (
          <a href="/admin" className={"sb-item" + (pathname.startsWith("/admin") ? " active" : "")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="sb-text">Admin</span>
          </a>
        )}

        <a href="https://toolspk.up.railway.app/index.html" target="_blank" rel="noopener noreferrer" className="sb-item">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span className="sb-text">ToolsPK</span>
        </a>
      </div>

      {/* Bottom — Ayuda, Buzón, Tema, Logout */}
      <div className="sb-bottom">
        <a href="/ayuda" className={"sb-item" + (pathname.startsWith("/ayuda") ? " active" : "")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="sb-text">Ayuda</span>
        </a>

        {canSubmitBuzon && (
          <button className="sb-item" onClick={() => { setBuzonOpen(!buzonOpen); setBuzonSent(false); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span className="sb-text">Buzón</span>
          </button>
        )}

        <button className="sb-item" onClick={toggleTheme} title="Cambiar tema">
          <svg className="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <svg className="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <span className="sb-text">Tema</span>
        </button>

        {auth?.user && (
          <button className="sb-item sb-logout" onClick={() => { auth.logout(); router.push("/login"); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="sb-text">Cerrar sesión</span>
          </button>
        )}
      </div>

      {/* Buzón modal (floating above sidebar) */}
      {buzonOpen && (
        <div style={{
          position: "fixed", bottom: 70, left: 70, zIndex: 9997,
          width: 340, background: "var(--surface, #fff)",
          border: "1.5px solid var(--border, #e5e7eb)", borderRadius: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,.15)",
          padding: 20, fontFamily: "inherit",
        }}>
          {buzonSent ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" style={{ display: "inline-block", marginBottom: 8 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <p style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>¡Enviado!</p>
              <p style={{ fontSize: 12, color: "var(--text3)" }}>Gracias por tu comentario</p>
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "var(--text)" }}>
                Buzón de Sugerencias
              </div>

              <div style={{ display: "flex", gap: 0, marginBottom: 12, borderRadius: 8, overflow: "hidden", border: "1.5px solid var(--border)" }}>
                <button
                  onClick={() => setBuzonTipo("sugerencia")}
                  style={{
                    flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600,
                    fontFamily: "inherit", cursor: "pointer", border: "none",
                    background: buzonTipo === "sugerencia" ? "var(--purple)" : "var(--surface)",
                    color: buzonTipo === "sugerencia" ? "white" : "var(--text3)",
                  }}
                >Sugerencia</button>
                <button
                  onClick={() => setBuzonTipo("queja")}
                  style={{
                    flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600,
                    fontFamily: "inherit", cursor: "pointer", border: "none",
                    borderLeft: "1px solid var(--border)",
                    background: buzonTipo === "queja" ? "#dc2626" : "var(--surface)",
                    color: buzonTipo === "queja" ? "white" : "var(--text3)",
                  }}
                >Queja</button>
              </div>

              <textarea
                value={buzonMsg}
                onChange={(e) => setBuzonMsg(e.target.value)}
                placeholder="Escribe tu comentario aquí..."
                maxLength={1000}
                style={{
                  width: "100%", minHeight: 100, padding: "10px 12px", fontSize: 13,
                  border: "1.5px solid var(--border)", borderRadius: 8,
                  background: "var(--bg, #fff)", color: "var(--text)",
                  fontFamily: "inherit", resize: "vertical", outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "right", margin: "4px 0 10px" }}>
                {buzonMsg.length}/1000
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setBuzonOpen(false)}
                  style={{
                    padding: "8px 16px", fontSize: 13, fontWeight: 500,
                    fontFamily: "inherit", cursor: "pointer",
                    background: "none", border: "1.5px solid var(--border)",
                    borderRadius: 8, color: "var(--text3)",
                  }}
                >Cancelar</button>
                <button
                  onClick={enviarBuzon}
                  disabled={buzonSending || !buzonMsg.trim()}
                  style={{
                    padding: "8px 20px", fontSize: 13, fontWeight: 600,
                    fontFamily: "inherit", cursor: buzonSending ? "not-allowed" : "pointer",
                    background: buzonSending || !buzonMsg.trim() ? "var(--text3)" : "linear-gradient(135deg, #0f2167, #2563eb)",
                    border: "none", borderRadius: 8, color: "white",
                  }}
                >{buzonSending ? "Enviando…" : "Enviar"}</button>
              </div>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
