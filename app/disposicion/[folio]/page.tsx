"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { labelTipoCredito, labelEsquema, labelMoneda, labelEtapa } from "../../../components/labels";

function fmt(n: number): string {
  if (n === 0) return "$0.00";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(n: number): string {
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

/**
 * Formatea la composición de tasa: "TIIE 28 + 4.50% = 18.33%"
 * o "Tasa Fija 12.00%" si no tiene referencia variable.
 */
function fmtTasaComposicion(tipoTasa: string, tasa: number, spread: number): string {
  if (!tipoTasa) return tasa + "%";

  const upper = tipoTasa.toUpperCase();

  // Tasa fija: no tiene referencia + spread
  if (upper.includes("FIJA")) {
    return "Tasa Fija " + tasa + "%";
  }

  // TIIE o SOFR: referencia + spread
  let ref = "";
  if (upper.includes("TIIE")) ref = "TIIE";
  else if (upper.includes("SOFR")) ref = "SOFR";
  else ref = tipoTasa;

  if (spread && spread > 0) {
    const tasaRef = Math.round((tasa - spread) * 10000) / 10000;
    return ref + " " + tasaRef + "% + " + spread + "% = " + tasa + "%";
  }

  return ref + " " + tasa + "%";
}

export default function DetailPage() {
  const params = useParams();
  const folio = params.folio as string;
  const [disp, setDisp] = useState<any>(null);
  const [proj, setProj] = useState<any>(null);
  const [projDate, setProjDate] = useState("");
  const [projLoading, setProjLoading] = useState(false);
  const [projError, setProjError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"general" | "amortizacion">("general");
  const router = useRouter();

  useEffect(() => { if (folio) loadDisp(); }, [folio]);

  async function loadDisp() {
    try {
      let r = await fetch("/api/disposiciones");
      // If no data yet, trigger sync and retry
      if (r.status === 404) {
        await fetch("/api/sync", { method: "POST" });
        r = await fetch("/api/disposiciones");
      }
      const data = await r.json();
      if (!data.disposiciones) { setLoading(false); return; }
      const found = data.disposiciones.find((d: any) => String(d.folio) === String(folio));
      if (found) {
        setDisp(found);
        // Default date = fecha_saldo from cartera activa
        if (data.fecha_saldo) {
          setProjDate(data.fecha_saldo);
        }
      }
    } catch { /* */ }
    setLoading(false);
  }

  async function runProjection() {
    if (!projDate || !disp?.proyectable) return;
    setProjLoading(true);
    setProjError(null);
    setProj(null);
    try {
      const r = await fetch("/api/proyeccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folio: String(folio), fecha_objetivo: projDate }),
      });
      const data = await r.json();
      if (data.error) setProjError(data.error + (data.motivo ? ": " + data.motivo : ""));
      else setProj(data);
    } catch { setProjError("Error de red"); }
    setProjLoading(false);
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><div className="spinner" /></div>;
  if (!disp) return <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 16 }}>{"Disposición " + folio + " no encontrada"}</div>;

  const s = proj ? proj.saldos : disp.saldos;
  const etapa = proj ? proj.etapa_final : disp.etapa;
  const diasAtraso = proj ? proj.dias_atraso_final : disp.dias_impago;
  const isVencido = etapa === 3;
  const isImpago = (diasAtraso > 0 || s.int_imp > 0) && !isVencido;
  const statusClass = isVencido ? "sc-vencido" : isImpago ? "sc-impago" : "sc-vigente";
  const statusLabel = isVencido ? "Vencido" : isImpago ? "Con impago" : "Vigente";
  const statusTag = isVencido ? "st-vencido" : isImpago ? "st-impago" : "st-vigente";
  const semaphoreColor = isVencido ? "var(--red)" : isImpago ? "var(--yellow)" : "var(--green)";

  const capTotal = s.cap_vigente + s.cap_impago + s.cap_ve + s.cap_vne;
  const intOrdTotal = s.int_vig + s.int_imp + s.int_ve + s.int_vne;
  const refTotal = (s.ref_vig || 0) + (s.ref_imp || 0) + (s.ref_ve || 0) + (s.ref_vne || 0);
  const moraProv = s.moratorio_provisionado || 0;
  const moraCalc = s.moratorio_calculado || 0;
  const moraTotal = moraProv + moraCalc;
  const saldoTotal = capTotal + intOrdTotal + refTotal + moraTotal;

  function saldoCell(val: number, danger?: boolean) {
    if (val === 0) return <td className="st-val st-zero">{"$0.00"}</td>;
    return <td className={"st-val" + (danger ? " st-danger" : "")}>{fmt(val)}</td>;
  }

  return (
    <div>
      {/* ═══ STICKY HEADER ═══ */}
      <div className="detail-sticky">
        <div className="detail-nav">
          <button className="back-btn" onClick={() => router.push("/")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Cartera
          </button>
          <span className="detail-nav-sep">/</span>
          <span className="detail-nav-current">{"Disposición " + folio}</span>
        </div>

        <div className="disp-header">
          <div className="disp-header-text" style={{ fontSize: 18 }}>
            {"Disposición Activa "}
            <strong>{"#" + folio}</strong>
            {" de "}
            <strong>{disp.cliente}</strong>
          </div>
          <div className="disp-header-meta" style={{ fontSize: 13, marginTop: 8 }}>
            <span>{labelTipoCredito(disp.tipo_credito)}</span>
            <span className="sep">{" · "}</span>
            <span>{labelEsquema(disp.esquema)}</span>
            <span className="sep">{" · "}</span>
            <span>{disp.ejecutivo}</span>
            <span className="sep">{" · "}</span>
            <span className="muted">{fmtTasaComposicion(disp.tipo_tasa, disp.tasa, disp.spread)}</span>
          </div>
        </div>
      </div>

      {/* ═══ TAB NAVIGATION ═══ */}
      <div style={{
        display: "flex", gap: 0, marginBottom: 12,
        borderBottom: "2px solid var(--border)",
      }}>
        <button
          onClick={() => setActiveTab("general")}
          style={{
            padding: "10px 24px", fontSize: 14, fontWeight: 600,
            fontFamily: "inherit", cursor: "pointer",
            background: "none", border: "none",
            borderBottom: activeTab === "general" ? "2px solid var(--purple)" : "2px solid transparent",
            color: activeTab === "general" ? "var(--purple)" : "var(--text3)",
            marginBottom: -2,
            transition: "color .15s, border-color .15s",
          }}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab("amortizacion")}
          style={{
            padding: "10px 24px", fontSize: 14, fontWeight: 600,
            fontFamily: "inherit", cursor: "pointer",
            background: "none", border: "none",
            borderBottom: activeTab === "amortizacion" ? "2px solid var(--purple)" : "2px solid transparent",
            color: activeTab === "amortizacion" ? "var(--purple)" : "var(--text3)",
            marginBottom: -2,
            transition: "color .15s, border-color .15s",
          }}
        >
          Tabla de Amortización
        </button>
      </div>

      {/* ═══ TAB: GENERAL ═══ */}
      {activeTab === "general" && (<>

      {/* ═══ PROJECTION CONTROLS — TOP BAR ═══ */}
      <div style={{
        background: "var(--surface)", border: "1.5px solid var(--border)",
        borderRadius: 10, padding: "12px 20px", marginBottom: 12,
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        boxShadow: "var(--shadow)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Proyección</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "var(--text3)" }}>Simular al día:</label>
          <input type="date" className="tl-sel-input" value={projDate} onChange={(e) => setProjDate(e.target.value)} style={{ fontSize: 13, padding: "6px 10px" }} />
        </div>
        <button
          onClick={runProjection}
          disabled={projLoading || !disp.proyectable}
          style={{
            background: projLoading ? "var(--text3)" : "linear-gradient(135deg, #0f2167, #2563eb)",
            color: "white", border: "none", borderRadius: 8,
            padding: "8px 22px", fontWeight: 600, fontSize: 13,
            cursor: disp.proyectable ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {projLoading ? "Calculando…" : "Proyectar"}
        </button>
        {!disp.proyectable && (
          <span style={{ fontSize: 12, color: "var(--red)" }}>
            {"No proyectable: " + (disp.motivo_no_proyectable || "Sin motivo")}
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--text3)" }}>
          {"Escenario de no pago · " + fmtTasaComposicion(disp.tipo_tasa, disp.tasa, disp.spread)}
        </span>
      </div>

      {/* ═══ VENCIMIENTO EN FECHA ═══ */}
      {proj && proj.vencimientos && proj.vencimientos.length > 0 && (
        <div style={{
          marginBottom: 12,
          background: "linear-gradient(135deg, #0f2167, #1e40af)",
          border: "none",
          borderRadius: 10, padding: 16,
          color: "white",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {proj.vencimientos.length === 1
                ? "Vencimiento en esta fecha"
                : proj.vencimientos.length + " vencimientos en esta fecha"}
            </span>
          </div>
          {proj.vencimientos.map((v: any, i: number) => (
            <div key={i} style={{
              background: "rgba(255,255,255,.1)", borderRadius: 8,
              padding: "12px 16px", marginBottom: i < proj.vencimientos.length - 1 ? 8 : 0,
              border: "1px solid rgba(255,255,255,.15)",
              backdropFilter: "blur(4px)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.85)" }}>
                  {"Amortización #" + v.numero_amortizacion + " · Pago al " + v.fecha_limite_pago}
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>
                  {v.dias_periodo + " días de interés"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: v.refinanciado_exigible > 0 ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginBottom: 2 }}>Capital</div>
                  <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'Geist Mono', monospace" }}>{fmt(v.capital)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginBottom: 2 }}>Interés estimado</div>
                  <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'Geist Mono', monospace", color: "#93c5fd" }}>{fmt(v.interes_estimado)}</div>
                </div>
                {v.refinanciado_exigible > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginBottom: 2 }}>Int. refinanciado</div>
                    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'Geist Mono', monospace", color: "#c4b5fd" }}>{fmt(v.refinanciado_exigible)}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginBottom: 2 }}>Total a pagar</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Geist Mono', monospace", color: "#fbbf24" }}>{fmt(v.total)}</div>
                </div>
              </div>
            </div>
          ))}
          {proj.vencimientos.length > 1 && (() => {
            const totalCap = proj.vencimientos.reduce((s: number, v: any) => s + v.capital, 0);
            const totalInt = proj.vencimientos.reduce((s: number, v: any) => s + v.interes_estimado, 0);
            const totalRef = proj.vencimientos.reduce((s: number, v: any) => s + (v.refinanciado_exigible || 0), 0);
            const totalPagar = proj.vencimientos.reduce((s: number, v: any) => s + v.total, 0);
            const hasRef = totalRef > 0;
            return (
              <div style={{
                borderTop: "2px solid rgba(255,255,255,.2)", marginTop: 8, paddingTop: 10,
                display: "grid", gridTemplateColumns: hasRef ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Total capital</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Geist Mono', monospace" }}>{fmt(totalCap)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Total interés</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Geist Mono', monospace", color: "#93c5fd" }}>{fmt(totalInt)}</div>
                </div>
                {hasRef && (
                  <div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Total refinanciado</div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Geist Mono', monospace", color: "#c4b5fd" }}>{fmt(totalRef)}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Gran total</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Geist Mono', monospace", color: "#fbbf24" }}>{fmt(totalPagar)}</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {projError && (
        <div style={{ background: "var(--red-l)", border: "1px solid var(--red-b)", borderRadius: 8, padding: "12px 16px", marginBottom: 12, fontSize: 13, color: "var(--red)" }}>
          {projError}
        </div>
      )}

      {/* ═══ SEMAPHORE + STATUS ROW ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, marginBottom: 12 }}>
        {/* Left: Semaphore card */}
        <div className={"status-card " + statusClass} style={{ padding: 20, minHeight: 160 }}>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 4 }}>
            {diasAtraso + " días"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>{"de atraso"}</div>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
            {isVencido ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            ) : isImpago ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{"Crédito " + statusLabel.toLowerCase()}</div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>{labelEtapa(etapa)}</div>
          {proj && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>{"Simulado al " + proj.fecha_objetivo}</div>}
        </div>

        {/* Right: Summary numbers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="hkpi">
              <div className="hkpi-l">{"Saldo sin atraso"}</div>
              <div className="hkpi-v" style={{ color: "var(--green)" }}>{fmt(s.cap_vigente + s.int_vig + (s.ref_vig || 0))}</div>
            </div>
            <div className="hkpi">
              <div className="hkpi-l">{"Saldo con atraso"}</div>
              <div className="hkpi-v" style={{ color: "var(--red)" }}>{fmt(s.cap_impago + s.cap_ve + s.cap_vne + s.int_imp + s.int_ve + s.int_vne + (s.ref_imp || 0) + (s.ref_ve || 0) + (s.ref_vne || 0) + moraTotal)}</div>
            </div>
          </div>
          <div className="hkpi" style={{ flex: 1 }}>
            <div className="hkpi-l">{"Saldo total"}</div>
            <div className="hkpi-v purple" style={{ fontSize: 28 }}>{fmt(saldoTotal)}</div>
            <div className="hkpi-sub">{labelMoneda(disp.moneda)}</div>
          </div>
        </div>
      </div>

      {/* ═══ SALDOS TABLE ═══ */}
      <div className="saldos-table-wrap" style={{ marginBottom: 12 }}>
        <table className="saldos-table">
          <thead>
            <tr>
              <th></th>
              <th>{"Capital (" + fmtCompact(capTotal) + ")"}</th>
              <th>{"Int. ordinario (" + fmtCompact(intOrdTotal) + ")"}</th>
              {refTotal > 0 && <th>{"Int. refinanciado (" + fmtCompact(refTotal) + ")"}</th>}
              <th>{"Moratorio"}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="st-label">{"Vigente"}</td>
              {saldoCell(s.cap_vigente)}
              {saldoCell(s.int_vig)}
              {refTotal > 0 && saldoCell(s.ref_vig || 0)}
              <td className="st-val st-zero">{"$0.00"}</td>
            </tr>
            <tr>
              <td className="st-label">{"Impago"}</td>
              {saldoCell(s.cap_impago, true)}
              {saldoCell(s.int_imp, true)}
              {refTotal > 0 && saldoCell(s.ref_imp || 0, true)}
              <td className="st-val st-zero">{"$0.00"}</td>
            </tr>
            <tr>
              <td className="st-label">{"Vencido exigible"}</td>
              {saldoCell(s.cap_ve, true)}
              {saldoCell(s.int_ve, true)}
              {refTotal > 0 && saldoCell(s.ref_ve || 0, true)}
              {saldoCell(moraTotal, moraTotal > 0)}
            </tr>
            <tr>
              <td className="st-label">{"Vencido no exigible"}</td>
              {saldoCell(s.cap_vne, true)}
              {saldoCell(s.int_vne, true)}
              {refTotal > 0 && saldoCell(s.ref_vne || 0, true)}
              <td className="st-val st-zero">{"$0.00"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ═══ MORATORIO CARDS ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div className="hkpi">
          <div className="hkpi-l">{"Moratorio provisionado"}</div>
          <div className="hkpi-v" style={{ color: moraProv > 0 ? "var(--red)" : "var(--text3)" }}>{fmt(moraProv)}</div>
        </div>
        <div className="hkpi">
          <div className="hkpi-l">{"Moratorio calculado"}</div>
          <div className="hkpi-v" style={{ color: moraCalc > 0 ? "var(--red)" : "var(--text3)" }}>{fmt(moraCalc)}</div>
        </div>
        <div className="hkpi">
          <div className="hkpi-l">{"Interés diario estimado"}</div>
          <div className="hkpi-v green">{proj ? fmt(proj.interes_ordinario_generado / Math.max(proj.dias_proyectados, 1)) : "\u2014"}</div>
        </div>
      </div>

      {/* ═══ PROJECTION RESULTS ═══ */}
      {proj && (
      <div className="proj-card" style={{ marginBottom: 12 }}>
        <div className="proj-header">
          <div className="proj-header-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            {"Resultado de proyección"}
          </div>
          <div className="proj-header-sub">{"Proyectado al " + proj.fecha_objetivo + " · " + proj.dias_proyectados + " días"}</div>
        </div>
        <div style={{ padding: 20 }}>
            <div>
              <div className="period-bar">
                <div className="pb-item"><span className="pb-l">{"Fecha base"}</span><span className="pb-v green">{proj.fecha_base}</span></div>
                <div className="pb-item"><span className="pb-l">{"Proyección al"}</span><span className="pb-v accent">{proj.fecha_objetivo}</span></div>
                <div className="pb-item"><span className="pb-l">{"Días proyectados"}</span><span className="pb-v accent">{String(proj.dias_proyectados)}</span></div>
                <div className="pb-item"><span className="pb-l">{"Int. ord. generado"}</span><span className="pb-v">{fmt(proj.interes_ordinario_generado)}</span></div>
                <div className="pb-item"><span className="pb-l">{"Mora. prov. generado"}</span><span className="pb-v">{fmt(proj.interes_moratorio_provisionado_generado)}</span></div>
                <div className="pb-item"><span className="pb-l">{"Mora. calc. generado"}</span><span className="pb-v">{fmt(proj.interes_moratorio_calculado_generado)}</span></div>
                <div className="pb-item"><span className="pb-l">{"Tiempo"}</span><span className="pb-v">{proj.duracion_ms + "ms"}</span></div>
              </div>

              {proj.eventos && proj.eventos.length > 0 && (
                <details className="desglose" style={{ marginTop: 8 }}>
                  <summary>{"Eventos (" + proj.eventos.length + ")"}</summary>
                  <div style={{ padding: "8px 0", fontSize: 13 }}>
                    {proj.eventos.map((e: any, i: number) => (
                      <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border2)" }}>
                        <span style={{ fontFamily: "Geist Mono, monospace", color: "var(--text3)", minWidth: 55 }}>{"Día " + e.dia}</span>
                        <span style={{ fontFamily: "Geist Mono, monospace", minWidth: 95 }}>{e.fecha}</span>
                        <span style={{ color: String(e.evento || "").includes("etapa3") ? "var(--red)" : String(e.evento || "").includes("corte") ? "var(--yellow)" : "var(--text2)" }}>{e.evento}</span>
                        <span style={{ color: "var(--text3)", marginLeft: "auto", fontFamily: "Geist Mono, monospace" }}>{"E" + e.etapa + " · " + e.dias_atraso + "d"}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
        </div>
      </div>
      )}

      {/* ═══ INFO GENERAL ═══ */}
      <div className="card" style={{ marginBottom: 80 }}>
        <div className="card-head">{"Información general"}</div>
        <div className="info-grid">
          <div className="ig"><div className="ig-l">{"Tipo de crédito"}</div><div className="ig-v">{labelTipoCredito(disp.tipo_credito)}</div></div>
          <div className="ig"><div className="ig-l">{"Esquema de interés"}</div><div className="ig-v">{labelEsquema(disp.esquema)}</div></div>
          <div className="ig"><div className="ig-l">{"Tasa ordinaria"}</div><div className="ig-v mono">{fmtTasaComposicion(disp.tipo_tasa, disp.tasa, disp.spread)}</div></div>
          <div className="ig"><div className="ig-l">{"Moneda"}</div><div className="ig-v">{labelMoneda(disp.moneda)}</div></div>
          <div className="ig"><div className="ig-l">{"Fecha entrega"}</div><div className="ig-v mono">{disp.fecha_entrega || "—"}</div></div>
          <div className="ig"><div className="ig-l">{"Vencimiento"}</div><div className="ig-v mono">{disp.fecha_final}</div></div>
          <div className="ig"><div className="ig-l">{"Ejecutivo"}</div><div className="ig-v">{disp.ejecutivo}</div></div>
          <div className="ig"><div className="ig-l">{"Etapa actual"}</div><div className="ig-v">{labelEtapa(disp.etapa)}</div></div>
          <div className="ig"><div className="ig-l">{"Días de impago (base)"}</div><div className="ig-v">{String(disp.dias_impago)}</div></div>
        </div>
      </div>

      </>)}

      {/* ═══ TAB: TABLA DE AMORTIZACIÓN ═══ */}
      {activeTab === "amortizacion" && (
        <div>
          {/* Resumen */}
          {disp.amortizaciones && (() => {
            const amorts = disp.amortizaciones as any[];
            const liquidadas = amorts.filter((a: any) => a.status === "liquidada").length;
            const pendientes = amorts.filter((a: any) => a.status === "pendiente").length;
            const vencidas = amorts.filter((a: any) => a.status === "vencida").length;
            const totalCapital = amorts.reduce((s: number, a: any) => s + a.capital, 0);
            const totalInteres = amorts.reduce((s: number, a: any) => s + a.interes_estimado, 0);
            const totalRef = amorts.reduce((s: number, a: any) => s + (a.refinanciado_exigible || 0), 0);
            const hasRef = totalRef > 0;
            const capitalPendiente = amorts.filter((a: any) => a.status !== "liquidada").reduce((s: number, a: any) => s + a.capital, 0);

            return (
              <>
                {/* KPI cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                  <div className="hkpi">
                    <div className="hkpi-l">Total amortizaciones</div>
                    <div className="hkpi-v" style={{ fontSize: 24 }}>{amorts.length}</div>
                  </div>
                  <div className="hkpi">
                    <div className="hkpi-l">Liquidadas</div>
                    <div className="hkpi-v" style={{ color: "var(--green)", fontSize: 24 }}>{liquidadas}</div>
                  </div>
                  <div className="hkpi">
                    <div className="hkpi-l">Pendientes</div>
                    <div className="hkpi-v" style={{ color: "#2563eb", fontSize: 24 }}>{pendientes}</div>
                  </div>
                  <div className="hkpi">
                    <div className="hkpi-l">Vencidas</div>
                    <div className="hkpi-v" style={{ color: "var(--red)", fontSize: 24 }}>{vencidas}</div>
                  </div>
                  <div className="hkpi">
                    <div className="hkpi-l">Capital total</div>
                    <div className="hkpi-v" style={{ fontSize: 16 }}>{fmt(totalCapital)}</div>
                  </div>
                  <div className="hkpi">
                    <div className="hkpi-l">Capital pendiente</div>
                    <div className="hkpi-v" style={{ color: "var(--red)", fontSize: 16 }}>{fmt(capitalPendiente)}</div>
                  </div>
                </div>

                {/* Tabla */}
                <div className="disposiciones-table-wrap" style={{ marginBottom: 80 }}>
                  <table className="disposiciones-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 50 }}>No.</th>
                        <th>Fecha contractual</th>
                        <th>Fecha límite pago</th>
                        <th>Días periodo</th>
                        <th className="num">Capital</th>
                        <th className="num">Interés estimado</th>
                        {hasRef && <th className="num">Int. refinanciado</th>}
                        <th className="num">Total</th>
                        <th style={{ width: 90 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amorts.map((a: any, i: number) => (
                        <tr key={i} style={{ opacity: a.status === "liquidada" ? 0.5 : 1 }}>
                          <td style={{ textAlign: "center", fontWeight: 600 }}>{a.numero}</td>
                          <td className="mono">{a.fecha_contractual}</td>
                          <td className="mono">{a.fecha_limite_pago}</td>
                          <td style={{ textAlign: "center" }}>{a.dias_periodo}</td>
                          <td className="num">{a.capital > 0 ? fmt(a.capital) : "—"}</td>
                          <td className="num">{a.interes_estimado > 0 ? fmt(a.interes_estimado) : "—"}</td>
                          {hasRef && <td className="num" style={{ color: (a.refinanciado_exigible || 0) > 0 ? "#7c3aed" : undefined }}>{(a.refinanciado_exigible || 0) > 0 ? fmt(a.refinanciado_exigible) : "—"}</td>}
                          <td className="num" style={{ fontWeight: 600 }}>{a.total > 0 ? fmt(a.total) : "—"}</td>
                          <td>
                            <span style={{
                              display: "inline-block",
                              padding: "2px 10px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: a.status === "liquidada" ? "var(--green-b, rgba(34,197,94,.12))"
                                : a.status === "vencida" ? "var(--red-l, rgba(239,68,68,.1))"
                                : "rgba(37,99,235,.1)",
                              color: a.status === "liquidada" ? "var(--green)"
                                : a.status === "vencida" ? "var(--red)"
                                : "#2563eb",
                            }}>
                              {a.status === "liquidada" ? "Liquidada" : a.status === "vencida" ? "Vencida" : "Pendiente"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                        <td colSpan={4} style={{ padding: "10px 14px" }}>TOTAL</td>
                        <td className="num" style={{ padding: "10px 14px" }}>{fmt(totalCapital)}</td>
                        <td className="num" style={{ padding: "10px 14px" }}>{fmt(totalInteres)}</td>
                        {hasRef && <td className="num" style={{ padding: "10px 14px", color: "#7c3aed" }}>{fmt(totalRef)}</td>}
                        <td className="num" style={{ padding: "10px 14px" }}>{fmt(totalCapital + totalInteres + totalRef)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            );
          })()}

          {(!disp.amortizaciones || disp.amortizaciones.length === 0) && (
            <div style={{
              background: "var(--surface)", border: "1.5px solid var(--border)",
              borderRadius: 10, padding: "60px 20px", textAlign: "center",
              color: "var(--text3)", fontSize: 14, marginBottom: 80,
            }}>
              No hay datos de amortización disponibles para esta disposición.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
