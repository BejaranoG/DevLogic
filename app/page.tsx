"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { setCarteraSeleccionada } from "@/lib/cartera-context";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n.toFixed(0);
}

const ETAPA_COLORS = ["#22c55e", "#f59e0b", "#ef4444"];
const PRODUCT_COLORS = ["#6366f1", "#3b82f6", "#06b6d4", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Sincronizando con Google Sheets…");
  const [viewMode, setViewMode] = useState<"original" | "consolidado">("original");
  const [carteraTab, setCarteraTab] = useState<"activa" | "pasiva">("activa");
  const { user } = useAuth();
  const router = useRouter();

  const isEjecutivo = user?.role === "ejecutivo";
  const nombreSheets = user?.nombre_en_sheets;
  const canSeePasiva = ["admin_maestro", "admin", "gerencia", "cartera"].includes(user?.role || "");
  const tc = data?.tipo_cambio?.valor ?? null;
  const tcFecha = data?.tipo_cambio?.fecha ?? null;
  const tcFechaSolicitada = data?.tipo_cambio?.fecha_solicitada ?? null;

  useEffect(() => { smartLoad(); }, []);

  // Reload when cartera tab changes
  useEffect(() => {
    setCarteraSeleccionada(carteraTab);
    if (!loading) loadCartera(carteraTab);
  }, [carteraTab]);

  async function smartLoad() {
    setLoading(true);

    // Step 1: Try loading cached data immediately
    try {
      const r = await fetch("/api/disposiciones?cartera=" + carteraTab);
      if (r.ok) {
        const d = await r.json();
        if (d.disposiciones?.length > 0) {
          setData(d);
          setLoading(false);
          // Data loaded from cache! Now sync in background silently
          backgroundSync();
          return;
        }
      }
    } catch {}

    // Step 2: No cached data — must sync first
    setStatus("Sincronizando con Google Sheets…");
    try {
      const syncRes = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const syncData = await syncRes.json();
      if (!syncData.ok) { setStatus("Error: " + (syncData.error || "desconocido")); setLoading(false); return; }
    } catch { setStatus("Error de red"); setLoading(false); return; }
    await loadCartera(carteraTab);
  }

  /** Sync in background — if new data arrives, reload silently */
  async function backgroundSync() {
    try {
      const syncRes = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const syncData = await syncRes.json();
      // If it was a real sync (not cached), reload data
      if (syncData.ok && syncData.cached === false) {
        const r = await fetch("/api/disposiciones?cartera=" + carteraTab);
        if (r.ok) setData(await r.json());
        window.dispatchEvent(new Event("sync-completed"));
      }
    } catch {} // Silent — don't disrupt the UI
  }

  async function loadCartera(tipo: "activa" | "pasiva") {
    setLoading(true);
    setStatus("Cargando cartera " + tipo + "…");
    try {
      const r = await fetch("/api/disposiciones?cartera=" + tipo);
      if (!r.ok) { setStatus("Error cargando disposiciones"); setLoading(false); return; }
      setData(await r.json());
    } catch { setStatus("Error de red"); }
    setLoading(false);
  }

  // Filter by ejecutivo if needed
  const filteredDisps = useMemo(() => {
    if (!data?.disposiciones) return [];
    if (!isEjecutivo || !nombreSheets) return data.disposiciones;
    return data.disposiciones.filter((d: any) =>
      d.ejecutivo?.toLowerCase() === nombreSheets.toLowerCase()
    );
  }, [data, isEjecutivo, nombreSheets]);

  // Apply currency conversion for consolidado mode
  const displayDisps = useMemo(() => {
    if (viewMode === "original" || !tc) return filteredDisps;
    return filteredDisps.map((d: any) => {
      if (d.moneda === "MEXICAN PESO" || d.moneda === "MXN") return d;
      // Convert USD → MXN
      const fx = tc;
      const s = d.saldos;
      return {
        ...d,
        moneda_original: d.moneda,
        moneda: "MXN_CONVERTIDO",
        cap_vigente: d.cap_vigente * fx,
        saldo_neto: d.saldo_neto * fx,
        saldos: {
          cap_vigente: s.cap_vigente * fx,
          cap_impago: s.cap_impago * fx,
          cap_ve: s.cap_ve * fx,
          cap_vne: s.cap_vne * fx,
          int_vig: s.int_vig * fx,
          int_imp: s.int_imp * fx,
          int_ve: s.int_ve * fx,
          int_vne: s.int_vne * fx,
          ref_vig: (s.ref_vig || 0) * fx,
          ref_imp: (s.ref_imp || 0) * fx,
          ref_ve: (s.ref_ve || 0) * fx,
          ref_vne: (s.ref_vne || 0) * fx,
          moratorio_provisionado: (s.moratorio_provisionado || 0) * fx,
          moratorio_calculado: (s.moratorio_calculado || 0) * fx,
        },
      };
    });
  }, [filteredDisps, viewMode, tc]);

  // Recompute KPIs and charts from display data (with currency conversion applied)
  const { kpis, stats, charts } = useMemo(() => {
    const disps = displayDisps;
    if (!disps.length) return {
      kpis: { saldo_neto: 0, cap_vigente: 0, cap_impago: 0, cap_vencido: 0, int_vigente: 0, int_impago: 0, int_vencido: 0, moratorio_provisionado: 0, moratorio_calculado: 0 },
      stats: { total: 0, vigentes: 0, vencidos: 0, impago: 0, proyectables: 0, clientes: 0, ejecutivos: 0 },
      charts: { chartEtapas: [], chartProductos: [], chartTopClientes: [], chartVencimientos: [] },
    };

    // Always recompute when consolidado mode is active, or when ejecutivo
    if (isEjecutivo || viewMode === "consolidado") {
      let saldo = 0, capVig = 0, capImp = 0, capVenc = 0, intVig = 0, intImp = 0, intVenc = 0, moraProv = 0, moraCalc = 0;
      let vigentes = 0, vencidos = 0, imp = 0, proy = 0;
      const cls = new Set<string>();
      const ejs = new Set<string>();
      const etapas: Record<string, { count: number; saldo: number }> = {};
      const prods: Record<string, { count: number; saldo: number }> = {};
      const clSaldos: Record<string, number> = {};
      const prodLabels: Record<string, string> = { credito_simple: "Crédito Simple", refaccionario: "Refaccionario", ccc: "CCC", habilitacion_avio: "Hab/Avío", factoraje: "Factoraje", arrendamiento: "Arrend." };

      for (const d of disps) {
        const s = d.saldos;
        saldo += d.saldo_neto;
        capVig += s.cap_vigente; capImp += s.cap_impago; capVenc += s.cap_ve + s.cap_vne;
        intVig += s.int_vig; intImp += s.int_imp; intVenc += s.int_ve + s.int_vne + s.ref_ve + s.ref_vne;
        moraProv += s.moratorio_provisionado; moraCalc += s.moratorio_calculado;
        cls.add(d.cliente);
        if (d.ejecutivo) ejs.add(d.ejecutivo);
        if (d.etapa === 3) vencidos++; else if (d.dias_impago > 0) imp++; else vigentes++;
        if (d.proyectable) proy++;

        const eLbl = d.etapa === 1 ? "Etapa 1" : d.etapa === 2 ? "Etapa 2" : "Etapa 3";
        if (!etapas[eLbl]) etapas[eLbl] = { count: 0, saldo: 0 }; etapas[eLbl].count++; etapas[eLbl].saldo += d.saldo_neto;
        const pLbl = prodLabels[d.tipo_credito] || d.tipo_credito;
        if (!prods[pLbl]) prods[pLbl] = { count: 0, saldo: 0 }; prods[pLbl].count++; prods[pLbl].saldo += s.cap_vigente;
        clSaldos[d.cliente] = (clSaldos[d.cliente] || 0) + d.saldo_neto;
      }

      return {
        kpis: { saldo_neto: saldo, cap_vigente: capVig, cap_impago: capImp, cap_vencido: capVenc, int_vigente: intVig, int_impago: intImp, int_vencido: intVenc, moratorio_provisionado: moraProv, moratorio_calculado: moraCalc },
        stats: { total: disps.length, vigentes, vencidos, impago: imp, proyectables: proy, clientes: cls.size, ejecutivos: ejs.size },
        charts: {
          chartEtapas: Object.entries(etapas).map(([name, v]) => ({ name, count: v.count, saldo: Math.round(v.saldo) })),
          chartProductos: Object.entries(prods).map(([name, v]) => ({ name, count: v.count, saldo: Math.round(v.saldo) })).sort((a, b) => b.saldo - a.saldo),
          chartTopClientes: Object.entries(clSaldos).map(([name, saldo]) => ({ name: name.length > 30 ? name.slice(0, 28) + "…" : name, saldo: Math.round(saldo) })).sort((a, b) => b.saldo - a.saldo).slice(0, 10),
          chartVencimientos: data?.charts?.chartVencimientos || [], // Use server-computed for now
        },
      };
    }

    // Non-ejecutivo in original mode: use server data directly
    return { kpis: data.kpis, stats: data.stats, charts: data.charts };
  }, [displayDisps, isEjecutivo, viewMode, data]);

  if (loading) {
    return (
      <div style={{ padding: "24px 0" }}>
        {/* Skeleton header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div className="skeleton" style={{ width: 220, height: 24, borderRadius: 6, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 160, height: 14, borderRadius: 4 }} />
          </div>
          <div className="skeleton" style={{ width: 100, height: 14, borderRadius: 4 }} />
        </div>

        {/* Skeleton KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 }}>
              <div className="skeleton" style={{ width: 80, height: 12, borderRadius: 4, marginBottom: 10 }} />
              <div className="skeleton" style={{ width: 120, height: 22, borderRadius: 4 }} />
            </div>
          ))}
        </div>

        {/* Skeleton table */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ display: "flex", gap: 16, padding: "12px 0", borderBottom: i < 6 ? "1px solid var(--border)" : "none" }}>
              <div className="skeleton" style={{ width: 70, height: 14, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: 180, height: 14, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: 100, height: 14, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: 80, height: 14, borderRadius: 4, marginLeft: "auto" }} />
            </div>
          ))}
        </div>

        {/* Status message */}
        <div style={{ textAlign: "center", padding: "20px 0", fontSize: 13, color: "var(--text3)" }}>
          {status}
        </div>

        <style>{`
          .skeleton {
            background: linear-gradient(90deg, var(--border) 25%, rgba(99,102,241,.08) 50%, var(--border) 75%);
            background-size: 200% 100%;
            animation: skeleton-shimmer 1.5s ease-in-out infinite;
          }
          @keyframes skeleton-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Error</h2>
        <p style={{ fontSize: 14, color: "var(--text3)", maxWidth: 400, margin: "0 auto" }}>{status}</p>
        <button onClick={smartLoad} className="btn-primary" style={{ marginTop: 16 }}>Reintentar</button>
      </div>
    );
  }

  const { fecha_saldo } = data;

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="dash-title">
            {isEjecutivo ? "Mi Cartera" : carteraTab === "pasiva" ? "Cartera Pasiva" : "Estado de Cartera"}
          </h1>
          <p className="dash-sub">
            {stats.total + " disposiciones · " + stats.proyectables + " proyectables"}
            {isEjecutivo && nombreSheets ? " · " + nombreSheets : ""}
          </p>
        </div>
        <div className="dash-date">{fecha_saldo}</div>
      </div>

      {/* ═══ CARTERA TABS ═══ */}
      {canSeePasiva && (
        <div style={{
          display: "flex", gap: 0, marginBottom: 12,
          borderBottom: "2px solid var(--border)",
        }}>
          <button
            onClick={() => setCarteraTab("activa")}
            style={{
              padding: "10px 24px", fontSize: 14, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer",
              background: "none", border: "none",
              borderBottom: carteraTab === "activa" ? "2px solid var(--purple)" : "2px solid transparent",
              color: carteraTab === "activa" ? "var(--purple)" : "var(--text3)",
              marginBottom: -2, transition: "color .15s, border-color .15s",
            }}
          >
            Cartera Activa
          </button>
          <button
            onClick={() => setCarteraTab("pasiva")}
            style={{
              padding: "10px 24px", fontSize: 14, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer",
              background: "none", border: "none",
              borderBottom: carteraTab === "pasiva" ? "2px solid var(--purple)" : "2px solid transparent",
              color: carteraTab === "pasiva" ? "var(--purple)" : "var(--text3)",
              marginBottom: -2, transition: "color .15s, border-color .15s",
            }}
          >
            Cartera Pasiva
          </button>
        </div>
      )}

      {/* ═══ CURRENCY TOGGLE BAR ═══ */}
      {tc && (
        <div style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          marginBottom: 12, padding: "10px 16px",
          background: "var(--surface)", border: "1.5px solid var(--border)",
          borderRadius: 10, boxShadow: "var(--shadow)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>TC Para Pagos:</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Geist Mono', monospace", color: "var(--purple)" }}>
              {"$" + tc.toFixed(4)}
            </span>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>
              {"MXN/USD · " + tcFecha}
              {tcFecha !== tcFechaSolicitada ? " (cartera al " + tcFechaSolicitada + ")" : ""}
            </span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1.5px solid var(--border)" }}>
            <button
              onClick={() => setViewMode("original")}
              style={{
                padding: "6px 16px", fontSize: 12, fontWeight: 600,
                fontFamily: "inherit", cursor: "pointer", border: "none",
                background: viewMode === "original" ? "var(--purple)" : "var(--surface)",
                color: viewMode === "original" ? "white" : "var(--text3)",
                transition: "all .15s",
              }}
            >
              Original
            </button>
            <button
              onClick={() => setViewMode("consolidado")}
              style={{
                padding: "6px 16px", fontSize: 12, fontWeight: 600,
                fontFamily: "inherit", cursor: "pointer", border: "none",
                borderLeft: "1px solid var(--border)",
                background: viewMode === "consolidado" ? "var(--purple)" : "var(--surface)",
                color: viewMode === "consolidado" ? "white" : "var(--text3)",
                transition: "all .15s",
              }}
            >
              Consolidado MXN
            </button>
          </div>
        </div>
      )}

      {/* KPI Grid */}
      <div className="kpi-grid">
        <div className="kpi-card kpi-primary">
          <div className="kpi-label">{"Saldo neto total" + (viewMode === "consolidado" ? " (Consolidado MXN)" : "")}</div>
          <div className="kpi-value" style={{ color: "white", fontSize: 28 }}>{fmt(kpis.saldo_neto)}</div>
          <div className="kpi-sub" style={{ color: "rgba(255,255,255,.55)" }}>{stats.total + " disposiciones activas"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Capital vigente</div>
          <div className="kpi-value purple">{fmt(kpis.cap_vigente)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Capital en impago</div>
          <div className="kpi-value yellow">{fmt(kpis.cap_impago)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Capital vencido</div>
          <div className="kpi-value red">{fmt(kpis.cap_vencido)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{"Interés ordinario vigente"}</div>
          <div className="kpi-value purple">{fmt(kpis.int_vigente)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{"Interés ordinario impago"}</div>
          <div className="kpi-value yellow">{fmt(kpis.int_impago)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{"Intereses vencidos"}</div>
          <div className="kpi-value red">{fmt(kpis.int_vencido)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{"Moratorio provisionado"}</div>
          <div className="kpi-value red">{fmt(kpis.moratorio_provisionado)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">{"Moratorio calculado"}</div>
          <div className="kpi-value red">{fmt(kpis.moratorio_calculado)}</div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-block"><div className="stat-n">{stats.total}</div><div className="stat-l">Total</div></div>
        <div className="stat-sep" />
        <div className="stat-block"><div className="stat-n">{stats.vigentes}</div><div className="stat-l">Vigentes</div></div>
        <div className="stat-sep" />
        <div className="stat-block"><div className="stat-n red">{stats.vencidos}</div><div className="stat-l">Vencidas</div></div>
        <div className="stat-sep" />
        <div className="stat-block"><div className="stat-n">{stats.proyectables}</div><div className="stat-l">Proyectables</div></div>
        <div className="stat-sep" />
        <div className="stat-block"><div className="stat-n">{stats.clientes}</div><div className="stat-l">Clientes</div></div>
        {!isEjecutivo && <>
          <div className="stat-sep" />
          <div className="stat-block"><div className="stat-n">{stats.ejecutivos}</div><div className="stat-l">Ejecutivos</div></div>
        </>}
      </div>

      {/* Export */}
      <ExportBar proyectables={stats.proyectables} cartera={carteraTab} />

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* 1. Etapa IFRS9 Pie */}
        <div className="chart-card">
          <div className="chart-title">{"Distribución por Etapa IFRS9"}</div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={charts.chartEtapas} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                dataKey="count" nameKey="name" paddingAngle={2}>
                {charts.chartEtapas.map((_: any, i: number) => (
                  <Cell key={i} fill={ETAPA_COLORS[i % ETAPA_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any, name: any) => [v + " disposiciones", name]}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 2. Cartera por Producto */}
        <div className="chart-card">
          <div className="chart-title">Cartera por Producto</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts.chartProductos} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text3)" }} />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "var(--text3)" }} />
              <Tooltip formatter={(v: any) => [fmtShort(v), "Capital vigente"]}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }} />
              <Bar dataKey="saldo" radius={[4, 4, 0, 0]}>
                {charts.chartProductos.map((_: any, i: number) => (
                  <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 3. Top 10 Clientes */}
        <div className="chart-card chart-wide">
          <div className="chart-title">Top 10 Clientes por Exposición</div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={charts.chartTopClientes} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "var(--text3)" }} />
              <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11, fill: "var(--text3)" }} />
              <Tooltip formatter={(v: any) => [fmt(v), "Saldo neto"]}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }} />
              <Bar dataKey="saldo" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 4. Vencimientos 30 días */}
        <div className="chart-card chart-wide">
          <div className="chart-title">{"Vencimientos próximos 30 días"}</div>
          {charts.chartVencimientos.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={charts.chartVencimientos} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text3)" }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "var(--text3)" }} />
                <Tooltip formatter={(v: any, name: any) => [fmtShort(v), name === "capital" ? "Capital" : "Interés"]}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="capital" name="Capital" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="interes" name="Interés" fill="#06b6d4" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 14 }}>
              Sin vencimientos en los próximos 30 días
            </div>
          )}
        </div>
      </div>

      {/* Disposiciones Table (compact) */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>
          {"Disposiciones (" + displayDisps.length + ")"}
        </h2>
        <div className="disposiciones-table-wrap">
          <table className="disposiciones-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Cliente</th>
                {!isEjecutivo && <th>Ejecutivo</th>}
                <th className="num">Capital vigente</th>
                <th className="num">Tasa %</th>
                <th className="num">Vencimiento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {displayDisps.map((d: any) => (
                <tr key={d.folio} onClick={() => router.push("/disposicion/" + d.folio)} style={{ cursor: "pointer" }}>
                  <td className="mono">{d.folio}</td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.cliente}</td>
                  {!isEjecutivo && <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.ejecutivo}</td>}
                  <td className="num mono">{fmt(d.cap_vigente)}</td>
                  <td className="num mono">{d.tasa + "%"}</td>
                  <td className="num mono">{d.fecha_final}</td>
                  <td>
                    {!d.proyectable ? (
                      <span className="tag tag-vencido" title={d.motivo_no_proyectable || ""}>NO PROY.</span>
                    ) : d.etapa === 3 ? (
                      <span className="tag tag-vencido">VENCIDO</span>
                    ) : d.dias_impago > 0 ? (
                      <span className="tag tag-preventivo">{"IMPAGO · " + d.dias_impago + "d"}</span>
                    ) : (
                      <span className="tag tag-vigente">VIGENTE</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ExportBar({ proyectables, cartera }: { proyectables: number; cartera: "activa" | "pasiva" }) {
  const [exportDate, setExportDate] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    setExportDate(d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }));
  }, []);

  async function downloadExport() {
    if (!exportDate) return;
    setExporting(true);
    try {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha_objetivo: exportDate, cartera }),
      });
      if (!r.ok) { const d = await r.json(); alert("Error: " + (d.error || "Error")); setExporting(false); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const label = cartera === "pasiva" ? "PASIVA" : "ACTIVA";
      a.href = url; a.download = `PROAKTIVA_CARTERA_${label}_PROYECTADA_AL_${exportDate.replace(/-/g, "")}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch { alert("Error de red"); }
    setExporting(false);
  }

  return (
    <div style={{
      background: "var(--surface)", border: "1.5px solid var(--border)",
      borderRadius: 10, padding: "14px 20px", marginBottom: 16,
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      boxShadow: "var(--shadow)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Descargar base proyectada</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: "var(--text3)" }}>Proyectar al:</label>
        <input type="date" className="tl-sel-input" value={exportDate} onChange={(e) => setExportDate(e.target.value)} style={{ fontSize: 13, padding: "6px 10px" }} />
      </div>
      <button onClick={downloadExport} disabled={exporting}
        style={{
          background: exporting ? "var(--text3)" : "linear-gradient(135deg, #0f2167, #2563eb)",
          color: "white", border: "none", borderRadius: 8,
          padding: "8px 20px", fontWeight: 600, fontSize: 13,
          cursor: "pointer", fontFamily: "inherit",
        }}>
        {exporting ? "Generando…" : "Descargar XLSX"}
      </button>
      <span style={{ fontSize: 11, color: "var(--text3)" }}>
        {proyectables + " disposiciones serán proyectadas"}
      </span>
    </div>
  );
}
