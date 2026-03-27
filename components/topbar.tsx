"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getCarteraSeleccionada } from "@/lib/cartera-context";
import { useAuth } from "@/lib/auth-context";

export function Topbar() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [syncLabel, setSyncLabel] = useState("Esperando…");
  const [syncStatus, setSyncStatus] = useState<"loading" | "ok" | "error">("loading");
  const [syncing, setSyncing] = useState(false);
  const [fechaBase, setFechaBase] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    checkStatus(); // Check once on mount
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    // Listen for cartera tab changes and sync completions
    const onCarteraChanged = () => checkStatus();
    window.addEventListener("cartera-changed", onCarteraChanged);
    window.addEventListener("sync-completed", onCarteraChanged);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("cartera-changed", onCarteraChanged);
      window.removeEventListener("sync-completed", onCarteraChanged);
    };
  }, []);

  async function checkStatus() {
    try {
      const r = await fetch("/api/sync");
      const d = await r.json();
      // New dual-store structure: d.activa / d.pasiva
      const act = d.activa || d;
      if (act.hasDatos) {
        setSyncLabel((act.stats?.disposiciones_mapeadas || "—") + " disposiciones");
        setSyncStatus("ok");
        // Get fecha base for selected cartera
        try {
          const cartera = getCarteraSeleccionada();
          const r2 = await fetch("/api/disposiciones?cartera=" + cartera);
          const d2 = await r2.json();
          if (d2.fecha_saldo) {
            setFechaBase(d2.fecha_saldo);
            const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
            if (d2.fecha_saldo !== today) {
              setDisclaimer("La base de datos está actualizada al " + d2.fecha_saldo + ". No corresponde con la fecha de hoy (" + today + ").");
            } else {
              setDisclaimer(null);
            }
          }
        } catch {}
      } else if (act.syncing) {
        setSyncLabel("Sincronizando…");
        setSyncStatus("loading");
      } else {
        setSyncLabel("Sin datos");
        setSyncStatus("error");
      }
    } catch {}
  }

  async function triggerSync() {
    setSyncing(true);
    setSyncLabel("Sincronizando…");
    setSyncStatus("loading");
    try {
      const r = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const d = await r.json();
      if (d.ok) {
        const stats = d.activa?.stats;
        setSyncLabel((stats?.disposiciones_mapeadas || "—") + " disposiciones");
        setSyncStatus("ok");
        window.location.reload();
      } else {
        setSyncLabel(String(d.error || "Error").slice(0, 40));
        setSyncStatus("error");
      }
    } catch {
      setSyncLabel("Error de red");
      setSyncStatus("error");
    }
    setSyncing(false);
  }

  function onSearch(q: string) {
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < 2) {
      setOpen(false);
      setResults([]);
      setTotalResults(0);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/search?q=" + encodeURIComponent(q));
        const data = await r.json();
        setResults(data.results || []);
        setTotalResults(data.total || 0);
        setOpen((data.results || []).length > 0);
      } catch {
        setResults([]);
        setTotalResults(0);
        setOpen(false);
      }
      setSearching(false);
    }, 300);
  }

  function goToSearchPage() {
    if (search.trim().length >= 2) {
      setOpen(false);
      router.push("/buscar?q=" + encodeURIComponent(search.trim()));
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      goToSearchPage();
    }
  }

  function statusDot(etapa: number, dias: number) {
    if (etapa === 3) return "danger";
    if (dias > 0) return "warn";
    return "ok";
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-search-wrap" ref={ref}>
          <div className="search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por folio, cliente o ejecutivo…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
            />
            {search && (
              <button className="search-clear" onClick={() => { setSearch(""); setOpen(false); setSearching(false); if (debounceRef.current) clearTimeout(debounceRef.current); }}>
                {"×"}
              </button>
            )}
          </div>
          {searching && search.length >= 2 && (
            <div className="search-dropdown open" style={{ padding: "16px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
              <div className="spinner" style={{ width: 18, height: 18, margin: "0 auto 6px", borderWidth: 2 }} />
              Buscando…
            </div>
          )}
          {!searching && open && (
            <div className="search-dropdown open">
              {results.map((r) => (
                <div
                  key={r.folio}
                  className="sd-item"
                  onClick={() => { setOpen(false); setSearch(""); router.push("/disposicion/" + r.folio); }}
                >
                  <span className={"sd-dot " + statusDot(r.etapa, r.dias_impago)} />
                  <div className="sd-main">
                    <div className="sd-folio">{r.folio}</div>
                    <div className="sd-name">{r.cliente}</div>
                  </div>
                  <div className="sd-right">
                    <div className="sd-cap">{"$" + (r.cap_vigente ?? 0).toLocaleString("en")}</div>
                    <div className="sd-tasa">{r.tasa + "%"}</div>
                  </div>
                </div>
              ))}
              {totalResults > results.length && (
                <div
                  className="sd-item"
                  onClick={goToSearchPage}
                  style={{ justifyContent: "center", color: "var(--purple)", fontWeight: 600, fontSize: 13, cursor: "pointer", padding: "10px 14px" }}
                >
                  Ver los {totalResults} resultados →
                </div>
              )}
              {totalResults > 0 && totalResults <= results.length && (
                <div
                  className="sd-item"
                  onClick={goToSearchPage}
                  style={{ justifyContent: "center", color: "var(--purple)", fontWeight: 600, fontSize: 13, cursor: "pointer", padding: "10px 14px" }}
                >
                  Ver resultados en detalle →
                </div>
              )}
            </div>
          )}
        </div>

        <div className="topbar-right">
          {fechaBase && (
            <span style={{ fontSize: 12, color: "var(--text3)", fontFamily: "Geist Mono, monospace" }}>
              {"Base: " + fechaBase}
            </span>
          )}
          <div className="sync-pill">
            <span className={"sync-dot " + syncStatus} />
            <span>{syncLabel}</span>
            <button
              className={"sync-refresh" + (syncing ? " spinning" : "")}
              onClick={triggerSync}
              disabled={syncing}
              title="Resincronizar con Google Sheets"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>

          {/* User info */}
          {user && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              paddingLeft: 12, borderLeft: "1px solid var(--border, #e5e7eb)",
              marginLeft: 4,
            }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.2 }}>
                  {user.nombre || "Usuario"}
                </div>
                <div style={{ fontSize: 10, color: "var(--text3)", lineHeight: 1.2 }}>
                  {user.role_nombre || user.role || ""}
                </div>
              </div>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "linear-gradient(135deg, #0f2167, #2563eb)",
                color: "white", fontWeight: 700, fontSize: 13,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {(user.nombre || user.email || "U").charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>
      </header>

      {disclaimer && (
        <div style={{
          background: "rgba(99,102,241,.08)", borderBottom: "1px solid rgba(99,102,241,.2)",
          padding: "8px 28px", fontSize: 13, color: "#6366f1",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {disclaimer}
        </div>
      )}
    </>
  );
}
