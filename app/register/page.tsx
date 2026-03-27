"use client";

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api-client";

export default function RegisterPage() {
  const [form, setForm] = useState({ email: "", password: "", confirm: "", nombre: "", apellido: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (form.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setLoading(true);
    try {
      await authApi.register({
        email: form.email,
        password: form.password,
        nombre: form.nombre,
        apellido: form.apellido,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Error al registrar");
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>LOGIC</h1>
            <p>Registro exitoso</p>
          </div>
          <div className="adm-alert adm-alert-blue" style={{ marginBottom: 16, textAlign: "center" }}>
            Tu cuenta ha sido creada y está <strong>pendiente de aprobación</strong> por un administrador. Te notificaremos cuando sea aprobada.
          </div>
          <Link href="/login" style={{ display: "block", textAlign: "center", color: "var(--purple)", fontWeight: 600, textDecoration: "none" }}>
            ← Volver al inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>LOGIC</h1>
          <p>Crear cuenta — Proaktiva</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="login-field">
              <label>Nombre</label>
              <input type="text" value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Juan" required />
            </div>
            <div className="login-field">
              <label>Apellido</label>
              <input type="text" value={form.apellido} onChange={(e) => set("apellido", e.target.value)} placeholder="Pérez" required />
            </div>
          </div>

          <div className="login-field">
            <label>Correo electrónico</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="tu.nombre@proaktiva.com.mx" required />
            <small style={{ color: "var(--text3)", fontSize: 11 }}>Solo correos @proaktiva.com.mx</small>
          </div>

          <div className="login-field">
            <label>Contraseña</label>
            <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Mínimo 8 caracteres" required />
          </div>

          <div className="login-field">
            <label>Confirmar contraseña</label>
            <input type="password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} placeholder="Repite tu contraseña" required />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Registrando…" : "Crear cuenta"}
          </button>

          <div style={{ textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" style={{ color: "var(--purple)", textDecoration: "none", fontWeight: 600 }}>Iniciar sesión</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
