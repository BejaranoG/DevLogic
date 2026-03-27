"use client";

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Error al enviar código");
    }
    setLoading(false);
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (nuevaPassword !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (nuevaPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ email, codigo, nueva_password: nuevaPassword });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Error al cambiar contraseña");
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>LOGIC</h1>
            <p>Contraseña actualizada</p>
          </div>
          <div className="adm-alert adm-alert-blue" style={{ marginBottom: 16, textAlign: "center" }}>
            Tu contraseña ha sido cambiada exitosamente.
          </div>
          <Link href="/login" style={{ display: "block", textAlign: "center", color: "var(--purple)", fontWeight: 600, textDecoration: "none" }}>
            Iniciar sesión →
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
          <p>{step === 1 ? "Recuperar contraseña" : "Ingresa el código"}</p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleStep1} className="login-form">
            {error && <div className="login-error">{error}</div>}
            <div className="login-field">
              <label>Correo electrónico</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu.nombre@proaktiva.com.mx" required autoFocus />
            </div>
            <p style={{ fontSize: 13, color: "var(--text3)" }}>Te enviaremos un código de 6 dígitos a tu correo.</p>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? "Enviando…" : "Enviar código"}
            </button>
            <div style={{ textAlign: "center", fontSize: 13 }}>
              <Link href="/login" style={{ color: "var(--purple)", textDecoration: "none" }}>← Volver al inicio de sesión</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleStep2} className="login-form">
            {error && <div className="login-error">{error}</div>}
            <div className="adm-alert adm-alert-blue" style={{ marginBottom: 8, fontSize: 13 }}>
              Enviamos un código a <strong>{email}</strong>. Revisa tu bandeja de entrada.
            </div>
            <div className="login-field">
              <label>Código de verificación</label>
              <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000" required autoFocus maxLength={6}
                style={{ textAlign: "center", fontSize: 24, letterSpacing: 8, fontFamily: "Geist Mono, monospace" }} />
            </div>
            <div className="login-field">
              <label>Nueva contraseña</label>
              <input type="password" value={nuevaPassword} onChange={(e) => setNuevaPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required />
            </div>
            <div className="login-field">
              <label>Confirmar nueva contraseña</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repite tu contraseña" required />
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? "Cambiando…" : "Cambiar contraseña"}
            </button>
            <div style={{ textAlign: "center", fontSize: 13 }}>
              <button type="button" onClick={() => { setStep(1); setError(null); }} style={{ background: "none", border: "none", color: "var(--purple)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                ← Enviar código a otro correo
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
