import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/config
 * Returns runtime environment configuration to the client.
 * This runs on the SERVER at request time, so it reads process.env correctly
 * even in Docker/Railway where env vars are injected at runtime.
 */
export async function GET() {
  return NextResponse.json({
    apiUrl: process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "",
  });
}
