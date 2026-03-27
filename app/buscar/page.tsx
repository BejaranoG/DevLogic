"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

const TIPO_LABELS: Record<string, string> = {
  credito_simple: "Crédito Simple",
  refaccionario: "Refaccionario",
  ccc: "CCC",
  habilitacion_avio: "Hab/Avío",
  factoraje: "Factoraje",
  arrendamiento: "Arrendamiento",
};

type SortKey = "folio" | "folio_linea" | "cliente" | "ejecutivo" | "etapa" | "cap_total" | "dias_impago" | "tasa" | "fecha_vencimiento";
type SortDir = "asc" | "desc";

interface Resultado {
  folio: string;
  folio_linea: string;
  folio_cliente: string;
  cliente: string;
  ejecutivo: string;
  tipo_credito: string;
  esquema_interes: string;
  moneda: string;
  tasa: number;
  etapa: number;
  dias_impago: number;
  cap_vigente: number;
  cap_impago: number;
  cap_ve: number;
  cap_vne: number;
  cap_total: number;
  int_vigente: number;
  int_impago: number;
  moratorio: number;
  fecha_entrega: string;
  fecha_vencimiento: string;
  proyectable: boolean;
}

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BuscarPage() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";

  const [results, setResults] = useState<Resultado[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);
  const [sortKey, setSortKey] = useState<SortKey>("cliente");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [groupBy, setGroupBy] = useState<"disposicion" | "linea" | "cliente">("disposicion");

  useEffect(() => {
    if (q.length >= 2) {
      doSearch(q);
    } else {
      setLoading(false);
    }
  }, [q]);

  async function doSearch(query: string) {
    setLoading(true);
    try {
      const r = await fetch("/api/search?q=" + encodeURIComponent(query) + "&full=true");
      const data = await r.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchInput.trim().length >= 2) {
      window.location.href = "/buscar?q=" + encodeURIComponent(searchInput.trim());
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedResults = useMemo(() => {
    const sorted = [...results].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return sorted;
  }, [results, sortKey, sortDir]);

  // Group results
  const groupedResults = useMemo(() => {
    if (groupBy === "disposicion") return null; // No grouping
    const groups = new Map<string, Resultado[]>();
    for (const r of sortedResults) {
      const key = groupBy === "cliente" ? r.cliente : (r.folio_linea || r.folio);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return groups;
  }, [sortedResults, groupBy]);

  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    const active = sortKey === field;
    return (
      <th
        onClick={() => toggleSort(field)}
        style={{
          cursor: "pointer", userSelect: "none",
          color: active ? "var(--purple)" : undefined,
          whiteSpace: "nowrap",
        }}
      >
        {label}
        {active && <span style={{ marginLeft: 4, fontSize: 10 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
      </th>
    );
  }

  function ResultRow({ r }: { r: Resultado }) {
    const etapaColor = r.etapa === 3 ? "#dc2626" : r.etapa === 2 ? "#f59e0b" : "#22c55e";
    return (
      <tr style={{ borderBottom: "1px solid var(--border)" }}>
        <td className="mono">
          <a
            href={"/disposicion/" + r.folio}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--purple)", textDecoration: "none", fontWeight: 600 }}
          >
            {r.folio}
          </a>
        </td>
        <td className="mono" style={{ fontSize: 12, color: "var(--text3)" }}>{r.folio_linea || "—"}</td>
        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cliente}</td>
        <td>{r.ejecutivo}</td>
        <td>
          <span style={{
            display: "inline-block", padding: "2px 8px", borderRadius: 10,
            fontSize: 11, fontWeight: 700,
            background: etapaColor + "18", color: etapaColor,
          }}>
            E{r.etapa}
          </span>
        </td>
        <td style={{ textAlign: "center" }}>{r.dias_impago > 0 ? r.dias_impago + "d" : "—"}</td>
        <td className="num">{fmt(r.cap_total)}</td>
        <td className="num">{r.cap_impago > 0 ? fmt(r.cap_impago) : "—"}</td>
        <td className="num">{r.moratorio > 0 ? fmt(r.moratorio) : "—"}</td>
        <td style={{ textAlign: "center" }}>{r.tasa}%</td>
        <td className="mono" style={{ fontSize: 12 }}>{r.fecha_vencimiento}</td>
        <td style={{ fontSize: 12 }}>{TIPO_LABELS[r.tipo_credito] || r.tipo_credito}</td>
      </tr>
    );
  }

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="dash-title">Resultados de búsqueda</h1>
          <p className="dash-sub">
            {loading
              ? "Buscando…"
              : total > 0
                ? `${total} disposición${total !== 1 ? "es" : ""} encontrada${total !== 1 ? "s" : ""} para "${q}"`
                : q ? `Sin resultados para "${q}"` : "Ingresa un término de búsqueda"}
          </p>
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por folio, cliente, ejecutivo o folio cliente…"
            style={{
              width: "100%", padding: "10px 14px 10px 38px", fontSize: 14,
              border: "1.5px solid var(--border)", borderRadius: 10,
              background: "var(--surface)", color: "var(--text)",
              fontFamily: "inherit", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <button
          type="submit"
          style={{
            padding: "10px 24px", fontSize: 14, fontWeight: 600,
            fontFamily: "inherit", cursor: "pointer",
            background: "linear-gradient(135deg, #0f2167, #2563eb)",
            border: "none", borderRadius: 10, color: "white",
          }}
        >Buscar</button>
      </form>

      {/* Controls */}
      {results.length > 0 && (
        <div style={{
          display: "flex", gap: 12, alignItems: "center", marginBottom: 12,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 13, color: "var(--text3)", fontWeight: 500 }}>Agrupar por:</span>
          <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1.5px solid var(--border)" }}>
            {(["disposicion", "linea", "cliente"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                style={{
                  padding: "5px 14px", fontSize: 12, fontWeight: 600,
                  fontFamily: "inherit", cursor: "pointer", border: "none",
                  borderLeft: g !== "disposicion" ? "1px solid var(--border)" : "none",
                  background: groupBy === g ? "var(--purple)" : "var(--surface)",
                  color: groupBy === g ? "white" : "var(--text3)",
                }}
              >
                {g === "disposicion" ? "Disposición" : g === "linea" ? "Línea" : "Cliente"}
              </button>
            ))}
          </div>

          <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: "auto" }}>
            Haz clic en los encabezados para ordenar · Las disposiciones se abren en nueva pestaña
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13, color: "var(--text3)" }}>Buscando…</p>
        </div>
      )}

      {/* Results table */}
      {!loading && results.length > 0 && (
        <div className="disposiciones-table-wrap">
          {groupBy === "disposicion" ? (
            <table className="disposiciones-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <SortHeader label="Folio" field="folio" />
                  <SortHeader label="Línea" field="folio_linea" />
                  <SortHeader label="Cliente" field="cliente" />
                  <SortHeader label="Ejecutivo" field="ejecutivo" />
                  <SortHeader label="Etapa" field="etapa" />
                  <SortHeader label="Atraso" field="dias_impago" />
                  <SortHeader label="Capital Total" field="cap_total" />
                  <th className="num">Cap. Impago</th>
                  <th className="num">Moratorio</th>
                  <SortHeader label="Tasa" field="tasa" />
                  <SortHeader label="Vencimiento" field="fecha_vencimiento" />
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((r) => <ResultRow key={r.folio} r={r} />)}
              </tbody>
            </table>
          ) : (
            // Grouped view
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {Array.from(groupedResults!.entries()).map(([groupName, items]) => (
                <div key={groupName}>
                  <div style={{
                    fontWeight: 700, fontSize: 14, padding: "10px 14px",
                    background: "rgba(99,102,241,.06)", borderRadius: "8px 8px 0 0",
                    borderBottom: "2px solid var(--purple)",
                    color: "var(--text)",
                  }}>
                    {groupName}
                    <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text3)", marginLeft: 8 }}>
                      {items.length} disposición{items.length !== 1 ? "es" : ""}
                    </span>
                  </div>
                  <table className="disposiciones-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <SortHeader label="Folio" field="folio" />
                        {groupBy !== "linea" && <SortHeader label="Línea" field="folio_linea" />}
                        {groupBy !== "cliente" && <SortHeader label="Cliente" field="cliente" />}
                        <SortHeader label="Ejecutivo" field="ejecutivo" />
                        <SortHeader label="Etapa" field="etapa" />
                        <SortHeader label="Atraso" field="dias_impago" />
                        <SortHeader label="Capital Total" field="cap_total" />
                        <th className="num">Cap. Impago</th>
                        <th className="num">Moratorio</th>
                        <SortHeader label="Tasa" field="tasa" />
                        <SortHeader label="Vencimiento" field="fecha_vencimiento" />
                        <th>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r) => (
                        <tr key={r.folio} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="mono">
                            <a href={"/disposicion/" + r.folio} target="_blank" rel="noopener noreferrer"
                              style={{ color: "var(--purple)", textDecoration: "none", fontWeight: 600 }}>
                              {r.folio}
                            </a>
                          </td>
                          {groupBy !== "linea" && <td className="mono" style={{ fontSize: 12, color: "var(--text3)" }}>{r.folio_linea || "—"}</td>}
                          {groupBy !== "cliente" && <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cliente}</td>}
                          <td>{r.ejecutivo}</td>
                          <td>
                            <span style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: 10,
                              fontSize: 11, fontWeight: 700,
                              background: (r.etapa === 3 ? "#dc2626" : r.etapa === 2 ? "#f59e0b" : "#22c55e") + "18",
                              color: r.etapa === 3 ? "#dc2626" : r.etapa === 2 ? "#f59e0b" : "#22c55e",
                            }}>
                              E{r.etapa}
                            </span>
                          </td>
                          <td style={{ textAlign: "center" }}>{r.dias_impago > 0 ? r.dias_impago + "d" : "—"}</td>
                          <td className="num">{fmt(r.cap_total)}</td>
                          <td className="num">{r.cap_impago > 0 ? fmt(r.cap_impago) : "—"}</td>
                          <td className="num">{r.moratorio > 0 ? fmt(r.moratorio) : "—"}</td>
                          <td style={{ textAlign: "center" }}>{r.tasa}%</td>
                          <td className="mono" style={{ fontSize: 12 }}>{r.fecha_vencimiento}</td>
                          <td style={{ fontSize: 12 }}>{TIPO_LABELS[r.tipo_credito] || r.tipo_credito}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No results */}
      {!loading && results.length === 0 && q && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text3)" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3, marginBottom: 12, display: "inline-block" }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>Sin resultados</p>
          <p style={{ fontSize: 13, margin: 0 }}>No se encontraron disposiciones para "{q}"</p>
        </div>
      )}
    </div>
  );
}
