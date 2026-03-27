"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n.toFixed(0);
}

const TIPO_LABELS: Record<string, string> = {
  credito_simple: "Crédito Simple",
  refaccionario: "Refaccionario",
  ccc: "CCC",
  habilitacion_avio: "Hab/Avío",
  factoraje: "Factoraje",
  arrendamiento: "Arrendamiento",
};

const ESQUEMA_LABELS: Record<string, string> = {
  periodico: "Cobro Periódico",
  acumulacion: "Acumulación",
  capitalizacion: "Capitalización",
};

interface LineaCobranza {
  folio_disposicion: string;
  folio_cliente: string;
  cliente: string;
  ejecutivo: string;
  id_fondeador: string;
  fuente_fondeo: string;
  tipo_credito: string;
  esquema_interes: string;
  numero_amortizacion: number;
  fecha_limite_pago: string;
  interes_periodo: number;
  capital_periodo: number;
  total_periodo: number;
  adeudo_capital: number;
  adeudo_interes: number;
  adeudo_moratorio: number;
  adeudo_total: number;
  total_a_pagar: number;
}

interface Resumen {
  total_lineas: number;
  disposiciones_unicas: number;
  total_capital: number;
  total_interes: number;
  total_adeudo: number;
  gran_total: number;
}

interface ResultadoCobranza {
  fecha_desde: string;
  fecha_hasta: string;
  incluye_adeudos: boolean;
  lineas: LineaCobranza[];
  resumen: Resumen;
}

function defaultDesde(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}
function defaultHasta(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export default function CobranzaPage() {
  const { user } = useAuth();
  const isEjecutivo = user?.role === "ejecutivo";
  const nombreSheets = user?.nombre_en_sheets;
  const canSeePasiva = ["admin_maestro", "admin", "gerencia", "cartera"].includes(user?.role || "");

  const [fechaDesde, setFechaDesde] = useState(defaultDesde);
  const [fechaHasta, setFechaHasta] = useState(defaultHasta);
  const [incluirAdeudos, setIncluirAdeudos] = useState(true);
  const [cartera, setCartera] = useState<"activa" | "pasiva">("activa");
  const [data, setData] = useState<ResultadoCobranza | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros de tabla
  const [filtroEjecutivo, setFiltroEjecutivo] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");

  async function generar() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await fetch("/api/cobranza", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha_desde: fechaDesde,
          fecha_hasta: fechaHasta,
          incluir_adeudos: incluirAdeudos,
          cartera,
        }),
      });
      const json = await r.json();
      if (!r.ok) {
        setError(json.error || "Error generando reporte");
      } else {
        setData(json);
      }
    } catch {
      setError("Error de red");
    }
    setLoading(false);
  }

  async function descargarXLSX() {
    setExporting(true);
    try {
      const r = await fetch("/api/cobranza/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha_desde: fechaDesde,
          fecha_hasta: fechaHasta,
          incluir_adeudos: incluirAdeudos,
          cartera,
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        alert("Error: " + (d.error || "Error"));
        setExporting(false);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const label = cartera === "pasiva" ? "PASIVA" : "ACTIVA";
      a.href = url;
      a.download = `PROAKTIVA_COBRANZA_${label}_${fechaDesde.replace(/-/g, "")}_${fechaHasta.replace(/-/g, "")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Error de red");
    }
    setExporting(false);
  }

  // Filtrar líneas por ejecutivo (si es ejecutivo, solo su cartera)
  const lineasFiltradas = useMemo(() => {
    if (!data) return [];
    let lineas = data.lineas;

    if (isEjecutivo && nombreSheets) {
      lineas = lineas.filter(
        (l) => l.ejecutivo.toLowerCase() === nombreSheets.toLowerCase()
      );
    }

    if (filtroEjecutivo) {
      lineas = lineas.filter((l) =>
        l.ejecutivo.toLowerCase().includes(filtroEjecutivo.toLowerCase())
      );
    }
    if (filtroCliente) {
      lineas = lineas.filter((l) =>
        l.cliente.toLowerCase().includes(filtroCliente.toLowerCase()) ||
        l.folio_disposicion.toLowerCase().includes(filtroCliente.toLowerCase())
      );
    }

    return lineas;
  }, [data, isEjecutivo, nombreSheets, filtroEjecutivo, filtroCliente]);

  // Resumen filtrado
  const resumenFiltrado = useMemo(() => {
    if (!lineasFiltradas.length) return null;
    const folios = new Set(lineasFiltradas.map((l) => l.folio_disposicion));
    return {
      total_lineas: lineasFiltradas.length,
      disposiciones_unicas: folios.size,
      total_capital: lineasFiltradas.reduce((s, l) => s + l.capital_periodo, 0),
      total_interes: lineasFiltradas.reduce((s, l) => s + l.interes_periodo, 0),
      total_adeudo: lineasFiltradas.reduce((s, l) => s + l.adeudo_total, 0),
      gran_total: lineasFiltradas.reduce((s, l) => s + l.total_a_pagar, 0),
    };
  }, [lineasFiltradas]);

  // Lista de ejecutivos para filtro
  const ejecutivos = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.lineas.map((l) => l.ejecutivo));
    return [...set].sort();
  }, [data]);

  return (
    <div>
      {/* Header */}
      <div className="dashboard-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/reportes" style={{
            color: "var(--text3)", textDecoration: "none", fontSize: 13,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Reportes
          </a>
          <span style={{ color: "var(--text3)", fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, color: "var(--text)" }}>Cobranza</span>
        </div>
        <div>
          <h1 className="dash-title">Reporte de Cobranza</h1>
          <p className="dash-sub">Próximas amortizaciones a pagar con interés estimado y adeudos</p>
        </div>
      </div>

      {/* Controles */}
      <div style={{
        background: "var(--surface)", border: "1.5px solid var(--border)",
        borderRadius: 10, padding: "16px 20px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        boxShadow: "var(--shadow)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "var(--text3)", fontWeight: 500 }}>Desde:</label>
          <input
            type="date"
            className="tl-sel-input"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            style={{ fontSize: 13, padding: "6px 10px" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "var(--text3)", fontWeight: 500 }}>Hasta:</label>
          <input
            type="date"
            className="tl-sel-input"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            style={{ fontSize: 13, padding: "6px 10px" }}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text2)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={incluirAdeudos}
            onChange={(e) => setIncluirAdeudos(e.target.checked)}
            style={{ accentColor: "var(--purple)" }}
          />
          Incluir adeudos previos
        </label>
        {canSeePasiva && (
          <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1.5px solid var(--border)" }}>
            <button
              onClick={() => setCartera("activa")}
              style={{
                padding: "5px 14px", fontSize: 12, fontWeight: 600,
                fontFamily: "inherit", cursor: "pointer", border: "none",
                background: cartera === "activa" ? "var(--purple)" : "var(--surface)",
                color: cartera === "activa" ? "white" : "var(--text3)",
              }}
            >Activa</button>
            <button
              onClick={() => setCartera("pasiva")}
              style={{
                padding: "5px 14px", fontSize: 12, fontWeight: 600,
                fontFamily: "inherit", cursor: "pointer", border: "none",
                borderLeft: "1px solid var(--border)",
                background: cartera === "pasiva" ? "var(--purple)" : "var(--surface)",
                color: cartera === "pasiva" ? "white" : "var(--text3)",
              }}
            >Pasiva</button>
          </div>
        )}
        <button
          onClick={generar}
          disabled={loading}
          style={{
            background: loading ? "var(--text3)" : "linear-gradient(135deg, #0f2167, #2563eb)",
            color: "white", border: "none", borderRadius: 8,
            padding: "8px 24px", fontWeight: 600, fontSize: 13,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >
          {loading ? "Generando…" : "Generar Reporte"}
        </button>

        {data && (
          <button
            onClick={descargarXLSX}
            disabled={exporting}
            style={{
              background: "transparent", color: "var(--purple)",
              border: "1.5px solid var(--purple)", borderRadius: 8,
              padding: "7px 18px", fontWeight: 600, fontSize: 13,
              cursor: exporting ? "not-allowed" : "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? "Exportando…" : "Descargar XLSX"}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
          padding: "12px 16px", marginBottom: 16, color: "#dc2626", fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Resultados */}
      {data && (
        <>
          {/* KPI Cards */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12, marginBottom: 16,
          }}>
            <KpiCard label="Amortizaciones" value={String(resumenFiltrado?.total_lineas ?? 0)} color="var(--purple)" />
            <KpiCard label="Disposiciones" value={String(resumenFiltrado?.disposiciones_unicas ?? 0)} color="var(--purple)" />
            <KpiCard label="Capital" value={fmtShort(resumenFiltrado?.total_capital ?? 0)} color="#2563eb" />
            <KpiCard label="Interés Estimado" value={fmtShort(resumenFiltrado?.total_interes ?? 0)} color="#2563eb" />
            {incluirAdeudos && (
              <KpiCard label="Adeudo Previo" value={fmtShort(resumenFiltrado?.total_adeudo ?? 0)} color="#ef4444" />
            )}
            <KpiCard label="Total a Cobrar" value={fmtShort(resumenFiltrado?.gran_total ?? 0)} color="#16a34a" accent />
          </div>

          {/* Filtros de tabla */}
          <div style={{
            display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap",
          }}>
            {!isEjecutivo && (
              <select
                value={filtroEjecutivo}
                onChange={(e) => setFiltroEjecutivo(e.target.value)}
                className="tl-sel-input"
                style={{ fontSize: 13, padding: "6px 10px", minWidth: 180 }}
              >
                <option value="">Todos los ejecutivos</option>
                {ejecutivos.map((ej) => (
                  <option key={ej} value={ej}>{ej}</option>
                ))}
              </select>
            )}
            <input
              type="text"
              placeholder="Buscar por cliente o folio…"
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="tl-sel-input"
              style={{ fontSize: 13, padding: "6px 10px", minWidth: 220 }}
            />
            <span style={{ fontSize: 12, color: "var(--text3)", alignSelf: "center" }}>
              {lineasFiltradas.length} de {data.lineas.length} líneas
            </span>
          </div>

          {/* Tabla */}
          {lineasFiltradas.length === 0 ? (
            <div style={{
              background: "var(--surface)", border: "1.5px solid var(--border)",
              borderRadius: 10, padding: "40px 20px", textAlign: "center",
              color: "var(--text3)", fontSize: 14,
            }}>
              No hay amortizaciones pendientes en el rango seleccionado.
            </div>
          ) : (
            <div className="disposiciones-table-wrap">
              <table className="disposiciones-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Cliente</th>
                    {!isEjecutivo && <th>Ejecutivo</th>}
                    {cartera === "pasiva" && <th>ID Fondeo</th>}
                    {cartera === "pasiva" && <th>Fuente Fondeo</th>}
                    <th>Tipo</th>
                    <th>No.</th>
                    <th>Fecha Pago</th>
                    <th className="num">Capital</th>
                    <th className="num">Interés Est.</th>
                    <th className="num">Total Periodo</th>
                    {incluirAdeudos && (
                      <>
                        <th className="num">Adeudo Cap.</th>
                        <th className="num">Adeudo Int.</th>
                        <th className="num">Adeudo Mora.</th>
                        <th className="num">Total Adeudo</th>
                      </>
                    )}
                    <th className="num" style={{ fontWeight: 700 }}>Total a Pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {lineasFiltradas.map((l, i) => (
                    <tr key={`${l.folio_disposicion}-${l.numero_amortizacion}-${i}`}>
                      <td className="mono">
                        <a href={`/disposicion/${l.folio_disposicion}`}
                          style={{ color: "var(--purple)", textDecoration: "none", fontWeight: 500 }}>
                          {l.folio_disposicion}
                        </a>
                      </td>
                      <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.cliente}
                      </td>
                      {!isEjecutivo && <td>{l.ejecutivo}</td>}
                      {cartera === "pasiva" && <td>{l.id_fondeador || "—"}</td>}
                      {cartera === "pasiva" && <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.fuente_fondeo || "—"}</td>}
                      <td>{TIPO_LABELS[l.tipo_credito] || l.tipo_credito}</td>
                      <td style={{ textAlign: "center" }}>{l.numero_amortizacion}</td>
                      <td className="mono">{l.fecha_limite_pago}</td>
                      <td className="num">{fmt(l.capital_periodo)}</td>
                      <td className="num">{fmt(l.interes_periodo)}</td>
                      <td className="num" style={{ fontWeight: 500 }}>{fmt(l.total_periodo)}</td>
                      {incluirAdeudos && (
                        <>
                          <td className="num" style={{ color: l.adeudo_capital > 0 ? "#dc2626" : undefined }}>
                            {l.adeudo_capital > 0 ? fmt(l.adeudo_capital) : "—"}
                          </td>
                          <td className="num" style={{ color: l.adeudo_interes > 0 ? "#dc2626" : undefined }}>
                            {l.adeudo_interes > 0 ? fmt(l.adeudo_interes) : "—"}
                          </td>
                          <td className="num" style={{ color: l.adeudo_moratorio > 0 ? "#dc2626" : undefined }}>
                            {l.adeudo_moratorio > 0 ? fmt(l.adeudo_moratorio) : "—"}
                          </td>
                          <td className="num" style={{ color: l.adeudo_total > 0 ? "#dc2626" : undefined, fontWeight: 500 }}>
                            {l.adeudo_total > 0 ? fmt(l.adeudo_total) : "—"}
                          </td>
                        </>
                      )}
                      <td className="num" style={{ fontWeight: 700, color: "var(--text)" }}>
                        {fmt(l.total_a_pagar)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {resumenFiltrado && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700, fontSize: 12 }}>
                      <td colSpan={(isEjecutivo ? 5 : 6) + (cartera === "pasiva" ? 2 : 0)} style={{ padding: "10px 14px" }}>
                        TOTAL ({resumenFiltrado.disposiciones_unicas} disposiciones)
                      </td>
                      <td className="num" style={{ padding: "10px 14px" }}>{fmt(resumenFiltrado.total_capital)}</td>
                      <td className="num" style={{ padding: "10px 14px" }}>{fmt(resumenFiltrado.total_interes)}</td>
                      <td className="num" style={{ padding: "10px 14px" }}>{fmt(resumenFiltrado.total_capital + resumenFiltrado.total_interes)}</td>
                      {incluirAdeudos && (
                        <>
                          <td colSpan={3}></td>
                          <td className="num" style={{ padding: "10px 14px", color: "#dc2626" }}>
                            {resumenFiltrado.total_adeudo > 0 ? fmt(resumenFiltrado.total_adeudo) : "—"}
                          </td>
                        </>
                      )}
                      <td className="num" style={{ padding: "10px 14px", color: "var(--purple)", fontSize: 13 }}>
                        {fmt(resumenFiltrado.gran_total)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}

      {/* Empty state (antes de generar) */}
      {!data && !loading && !error && (
        <div style={{
          background: "var(--surface)", border: "1.5px solid var(--border)",
          borderRadius: 10, padding: "60px 20px", textAlign: "center",
          boxShadow: "var(--shadow)",
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" style={{ opacity: 0.5, marginBottom: 12 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <p style={{ fontSize: 14, color: "var(--text3)", margin: 0 }}>
            Selecciona un rango de fechas y presiona <strong>Generar Reporte</strong>
          </p>
          <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 4, opacity: 0.7 }}>
            El rango máximo es de 30 días
          </p>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color, accent }: {
  label: string; value: string; color: string; accent?: boolean;
}) {
  return (
    <div style={{
      background: accent ? "linear-gradient(135deg, #0f2167, #2563eb)" : "var(--surface)",
      border: accent ? "none" : "1.5px solid var(--border)",
      borderRadius: 10, padding: "14px 16px",
      boxShadow: "var(--shadow)",
    }}>
      <div style={{ fontSize: 11, color: accent ? "rgba(255,255,255,.7)" : "var(--text3)", fontWeight: 500, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 700, letterSpacing: "-.02em",
        color: accent ? "white" : color,
        fontFamily: "'Geist Mono', monospace",
      }}>
        {value}
      </div>
    </div>
  );
}
