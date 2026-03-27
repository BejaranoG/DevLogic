"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  if (user) {
    const redirect = searchParams.get("redirect") || "/";
    router.replace(redirect);
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      const redirect = searchParams.get("redirect") || "/";
      router.push(redirect);
    } catch (err: any) {
      setError(err.message || "Error de autenticación");
    }
    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>LOGIC</h1>
          <p>Plataforma de Cartera — Proaktiva</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}
          <div className="login-field">
            <label>Correo electrónico</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu.nombre@proaktiva.com.mx" required autoFocus />
          </div>
          <div className="login-field">
            <label>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Iniciando sesión…" : "Iniciar sesión"}
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <Link href="/forgot-password" style={{ color: "var(--purple)", textDecoration: "none" }}>¿Olvidaste tu contraseña?</Link>
            <Link href="/register" style={{ color: "var(--purple)", textDecoration: "none", fontWeight: 600 }}>Crear cuenta</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-page"><div className="spinner" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
