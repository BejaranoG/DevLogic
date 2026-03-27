"use client";

import { useRouter } from "next/navigation";

export default function ReportesPage() {
  const router = useRouter();

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="dash-title">Reportes</h1>
          <p className="dash-sub">Generación de reportes operativos</p>
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8,
      }}>
        {/* Reporte de Cobranza */}
        <div
          onClick={() => router.push("/reportes/cobranza")}
          style={{
            background: "var(--surface)", border: "1.5px solid var(--border)",
            borderRadius: 12, padding: 24, boxShadow: "var(--shadow)",
            cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--purple)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(99,102,241,.12)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "var(--shadow)";
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Reporte de Cobranza</h2>
          </div>
          <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 16, lineHeight: 1.5 }}>
            Genera un reporte con las próximas amortizaciones a pagar dentro de un rango de fechas.
            Incluye capital, interés estimado y adeudos previos opcionales. Exportable a XLSX.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-block", background: "var(--purple-b)", color: "var(--purple)",
              fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 6,
            }}>
              Disponible
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2" style={{ marginLeft: "auto" }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
