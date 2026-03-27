/**
 * app/api/chat/route.ts
 * POST /api/chat — LogicBot powered by Claude.
 *
 * Strategy: ZERO portfolio data in system prompt. The bot uses tools
 * for all data lookups. System prompt is ~1.5KB (just rules + knowledge).
 * This keeps input tokens minimal and avoids rate limits.
 */

import { NextResponse } from "next/server";
import { getDisposiciones, findDisposicionConTipo } from "../../../lib/store";
import { proyectarDisposicion } from "../../../engine/proyeccion/index";
import { redondear2 } from "../../../engine/shared/decimal-helpers";
import type { DisposicionNormalizada } from "../../../sync/normalizer";
import type Decimal from "decimal.js";

export const dynamic = "force-dynamic";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

function dec(d: Decimal): number {
  return redondear2(d).toNumber();
}

function parseFecha(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ══════════════════════════════════════════
// TOOL IMPLEMENTATIONS
// ══════════════════════════════════════════

function getFilteredDisps(role: string, nombreSheets?: string): DisposicionNormalizada[] {
  const isEjecutivo = role === "ejecutivo";
  let disps = [...getDisposiciones("activa"), ...getDisposiciones("pasiva")];
  if (isEjecutivo && nombreSheets) {
    disps = disps.filter(
      (d) => d.ejecutivo_disposicion.toLowerCase() === nombreSheets.toLowerCase()
    );
  }
  return disps;
}

function toolBuscarCliente(query: string, role: string, nombreSheets?: string): string {
  const disps = getFilteredDisps(role, nombreSheets);
  const q = query.toLowerCase();

  const matches = disps.filter(
    (d) =>
      d.disposicion.folio_disposicion.toLowerCase().includes(q) ||
      d.disposicion.cliente.toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    return JSON.stringify({ resultado: "No se encontraron disposiciones para: " + query });
  }

  const limited = matches.slice(0, 8);
  const resultado = limited.map((d) => {
    const disp = d.disposicion;
    const s = disp.saldos;
    return {
      folio: disp.folio_disposicion,
      cliente: disp.cliente,
      ejecutivo: d.ejecutivo_disposicion,
      tipo: disp.tipo_credito,
      esquema: disp.esquema_interes,
      tasa: dec(disp.tasa_base_ordinaria) + "%",
      moneda: disp.moneda,
      etapa: disp.etapa_ifrs9_actual,
      dias_atraso: disp.dias_atraso_actual,
      vencimiento: disp.fecha_final_disposicion.toISOString().slice(0, 10),
      fecha_saldo: disp.fecha_saldo.toISOString().slice(0, 10),
      proyectable: disp.proyectable,
      capital_vigente: dec(s.capital_vigente),
      capital_impago: dec(s.capital_impago),
      capital_ve: dec(s.capital_vencido_exigible),
      capital_vne: dec(s.capital_vencido_no_exigible),
      interes_vigente: dec(s.interes_ordinario_vigente),
      interes_impago: dec(s.interes_ordinario_impago),
      mora_prov: dec(s.interes_moratorio_acumulado),
      mora_calc: dec(s.interes_moratorio_calculado),
    };
  });

  return JSON.stringify({ encontradas: matches.length, disposiciones: resultado });
}

function toolResumenCartera(role: string, nombreSheets?: string): string {
  const dispsA = role === "ejecutivo" && nombreSheets
    ? getDisposiciones("activa").filter((d) => d.ejecutivo_disposicion.toLowerCase() === nombreSheets.toLowerCase())
    : getDisposiciones("activa");
  const dispsP = (role === "ejecutivo") ? [] : getDisposiciones("pasiva");

  function resumir(disps: DisposicionNormalizada[]) {
    let capVig = 0, capImp = 0, capVe = 0, mora = 0;
    let e1 = 0, e2 = 0, e3 = 0;
    const clientes = new Set<string>();
    for (const d of disps) {
      const s = d.disposicion.saldos;
      capVig += dec(s.capital_vigente);
      capImp += dec(s.capital_impago);
      capVe += dec(s.capital_vencido_exigible) + dec(s.capital_vencido_no_exigible);
      mora += dec(s.interes_moratorio_acumulado) + dec(s.interes_moratorio_calculado);
      if (d.disposicion.etapa_ifrs9_actual === 1) e1++;
      else if (d.disposicion.etapa_ifrs9_actual === 2) e2++;
      else e3++;
      clientes.add(d.disposicion.cliente);
    }
    return { total: disps.length, clientes: clientes.size, capital_vigente: capVig, capital_impago: capImp, capital_vencido: capVe, moratorio: mora, etapa1: e1, etapa2: e2, etapa3: e3 };
  }

  return JSON.stringify({
    activa: resumir(dispsA),
    ...(dispsP.length > 0 ? { pasiva: resumir(dispsP) } : {}),
  });
}

function toolProyectar(folio: string, fechaObjetivo: string): string {
  const found = findDisposicionConTipo(folio);
  if (!found) return JSON.stringify({ error: `Disposición ${folio} no encontrada.` });

  const dnorm = found.dnorm;
  if (!dnorm.disposicion.proyectable) {
    return JSON.stringify({ error: `No proyectable: ${dnorm.disposicion.motivo_no_proyectable}` });
  }
  if (!dnorm.regla_etapa) {
    return JSON.stringify({ error: "Sin regla de etapa." });
  }

  try {
    const fechaObj = parseFecha(fechaObjetivo);
    if (fechaObj <= dnorm.disposicion.fecha_saldo) {
      return JSON.stringify({ error: `Fecha debe ser posterior a ${dnorm.disposicion.fecha_saldo.toISOString().slice(0, 10)}` });
    }

    const r = proyectarDisposicion(dnorm.disposicion, dnorm.periodos, dnorm.regla_etapa, fechaObj);
    const sf = r.saldos_finales;

    return JSON.stringify({
      folio, cliente: dnorm.disposicion.cliente,
      fecha_base: r.fecha_base.toISOString().slice(0, 10),
      fecha_objetivo: r.fecha_objetivo.toISOString().slice(0, 10),
      dias: r.snapshots.length,
      etapa: r.etapa_ifrs9_final,
      dias_atraso: r.dias_atraso_final,
      cap_vigente: dec(sf.capital_vigente), cap_impago: dec(sf.capital_impago),
      cap_ve: dec(sf.capital_vencido_exigible), cap_vne: dec(sf.capital_vencido_no_exigible),
      int_vigente: dec(sf.interes_ordinario_vigente), int_impago: dec(sf.interes_ordinario_impago),
      mora_prov: dec(sf.interes_moratorio_acumulado), mora_calc: dec(sf.interes_moratorio_calculado),
      int_ord_generado: dec(r.interes_ordinario_total_generado),
      int_mora_generado: dec(r.interes_moratorio_total_generado),
      saldo_total: dec(r.saldo_total),
    });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

// ══════════════════════════════════════════
// SYSTEM PROMPT (minimal, ~1.5KB)
// ══════════════════════════════════════════

const SYSTEM_PROMPT = `Eres LogicBot, asistente de Logic (herramienta de gestión de cartera de Proaktiva). Responde en español, conciso.

HERRAMIENTAS (úsalas SIEMPRE para datos, no inventes):
- buscar_cliente: busca por nombre o folio. Úsala ANTES de responder sobre cualquier cliente.
- proyectar: proyecta saldos a fecha futura (escenario de no pago). Necesita folio exacto de buscar_cliente.
- resumen_cartera: obtiene KPIs generales de la cartera. Úsala para preguntas generales.

CONOCIMIENTO:
- Interés ordinario: Capital × Tasa/360 diario.
- Moratorio: Capital_impago × (Tasa×2)/360, desde el día 1 de impago.
- Esquemas: periódico (exigible cada periodo), acumulación (al vencimiento), capitalización (compuesto).
- IFRS9: Periódico E1(0-30d) E2(31-89d) E3(≥90d). Otros: E1(0-29d) E3(≥30d).
- Impago: capital e interés entran a impago juntos (fecha_limite_pago + 1 día).

REGLAS:
- SOLO informativo, NO modificas nada.
- Ejecutivos solo ven su cartera (ya filtrada).
- Usa formato $1,234.56 para montos.
- Si no encuentras datos, dilo claramente.
- Solo temas de cartera/saldos/Logic.`;

const TOOLS = [
  {
    name: "buscar_cliente",
    description: "Busca disposiciones por nombre de cliente o folio. Retorna saldos, etapa, tasa, etc. SIEMPRE úsala antes de responder sobre un cliente.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Nombre del cliente o folio (ej: 'Ganadera Rocha' o '12843')" },
      },
      required: ["query"],
    },
  },
  {
    name: "proyectar",
    description: "Proyecta saldos de una disposición a fecha futura. Requiere folio exacto de buscar_cliente.",
    input_schema: {
      type: "object" as const,
      properties: {
        folio: { type: "string", description: "Folio de la disposición" },
        fecha_objetivo: { type: "string", description: "Fecha objetivo YYYY-MM-DD" },
      },
      required: ["folio", "fecha_objetivo"],
    },
  },
  {
    name: "resumen_cartera",
    description: "Obtiene un resumen general de la cartera: totales, KPIs, distribución por etapa. Úsala para preguntas generales como '¿cuántas disposiciones hay?' o '¿cuánto capital está en impago?'.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// ══════════════════════════════════════════
// API HANDLER
// ══════════════════════════════════════════

async function callClaude(apiKey: string, systemPrompt: string, messages: any[]): Promise<any> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages,
      tools: TOOLS,
    }),
  });

  if (!res.ok) {
    if (res.status === 429) {
      return { error: "rate_limit" };
    }
    const text = await res.text();
    return { error: "api_error: " + text.slice(0, 200) };
  }

  return res.json();
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada." }, { status: 500 });
  }

  const body = await request.json();
  const { messages, user } = body;

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Se requiere array de messages." }, { status: 400 });
  }

  const role = user?.role || "staff";
  const nombreSheets = user?.nombre_en_sheets || "";

  // Only send last 10 messages to keep context small
  const recentMessages = messages.slice(-10).map((m: any) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  try {
    let data = await callClaude(apiKey, SYSTEM_PROMPT, recentMessages);

    // Rate limit retry (wait 2 seconds)
    if (data.error === "rate_limit") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      data = await callClaude(apiKey, SYSTEM_PROMPT, recentMessages);
      if (data.error === "rate_limit") {
        return NextResponse.json({
          error: "LogicBot está procesando muchas consultas. Espera unos segundos e intenta de nuevo.",
        }, { status: 429 });
      }
    }

    if (data.error && data.error !== "rate_limit") {
      return NextResponse.json({ error: data.error }, { status: 502 });
    }

    // Tool use loop (max 6 iterations)
    let iterations = 0;
    let currentMessages = [...recentMessages];

    while (data.stop_reason === "tool_use" && iterations < 6) {
      iterations++;

      const toolBlocks = data.content.filter((b: any) => b.type === "tool_use");
      if (toolBlocks.length === 0) break;

      currentMessages.push({ role: "assistant", content: data.content });

      const toolResults: any[] = [];
      for (const tb of toolBlocks) {
        let result: string;
        if (tb.name === "buscar_cliente") {
          result = toolBuscarCliente(tb.input.query, role, nombreSheets);
        } else if (tb.name === "proyectar") {
          result = toolProyectar(tb.input.folio, tb.input.fecha_objetivo);
        } else if (tb.name === "resumen_cartera") {
          result = toolResumenCartera(role, nombreSheets);
        } else {
          result = JSON.stringify({ error: "Herramienta no reconocida." });
        }
        toolResults.push({ type: "tool_result", tool_use_id: tb.id, content: result });
      }

      currentMessages.push({ role: "user", content: toolResults });

      data = await callClaude(apiKey, SYSTEM_PROMPT, currentMessages);
      if (data.error === "rate_limit") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        data = await callClaude(apiKey, SYSTEM_PROMPT, currentMessages);
      }
      if (data.error) {
        return NextResponse.json({ error: data.error }, { status: 502 });
      }
    }

    const textBlocks = data.content?.filter((b: any) => b.type === "text") || [];
    const responseText = textBlocks.map((b: any) => b.text).join("\n");

    return NextResponse.json({ response: responseText, usage: data.usage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
