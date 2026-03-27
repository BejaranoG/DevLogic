import { NextResponse } from "next/server";
import { getStore } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  return NextResponse.json({
    status: "ok",
    hasDatos: store.data !== null,
    lastSync: store.lastSync?.toISOString() ?? null,
  });
}
