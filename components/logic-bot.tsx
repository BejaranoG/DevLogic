"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function LogicBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          user: {
            role: user?.role || "staff",
            nombre_en_sheets: user?.nombre_en_sheets || "",
          },
        }),
      });
      const data = await r.json();
      if (data.error) {
        setMessages([...newMessages, { role: "assistant", content: "Error: " + data.error }]);
      } else {
        setMessages([...newMessages, { role: "assistant", content: data.response }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Error de conexión. Intenta de nuevo." }]);
    }
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, #0f2167, #2563eb)",
          border: "none", cursor: "pointer",
          boxShadow: "0 4px 20px rgba(37,99,235,.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform .2s, box-shadow .2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        title="LogicBot"
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 92, right: 24, zIndex: 9998,
          width: 400, height: 520,
          background: "var(--bg, #fff)", border: "1.5px solid var(--border, #e5e7eb)",
          borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,.15)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          fontFamily: "inherit",
        }}>
          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg, #0f2167, #2563eb)",
            padding: "16px 20px", color: "white",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "rgba(255,255,255,.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>LogicBot</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Asistente de cartera · Solo lectura</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "16px 16px 8px",
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            {messages.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--text3, #999)" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4, marginBottom: 8, display: "inline-block" }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p style={{ fontSize: 13, margin: "0 0 4px" }}>¡Hola! Soy LogicBot</p>
                <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>
                  Pregúntame sobre saldos, intereses, proyecciones o cualquier duda de la plataforma.
                </p>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: m.role === "user"
                    ? "linear-gradient(135deg, #0f2167, #2563eb)"
                    : "var(--surface, #f3f4f6)",
                  color: m.role === "user" ? "white" : "var(--text, #111)",
                  fontSize: 13, lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding: "10px 14px", borderRadius: "14px 14px 14px 4px",
                  background: "var(--surface, #f3f4f6)",
                  display: "flex", gap: 4, alignItems: "center",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text3, #999)", animation: "logicbot-dot 1.4s infinite", animationDelay: "0s" }} />
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text3, #999)", animation: "logicbot-dot 1.4s infinite", animationDelay: "0.2s" }} />
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text3, #999)", animation: "logicbot-dot 1.4s infinite", animationDelay: "0.4s" }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border, #e5e7eb)",
            display: "flex", gap: 8,
          }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta..."
              disabled={loading}
              style={{
                flex: 1, padding: "10px 14px", fontSize: 13,
                border: "1.5px solid var(--border, #e5e7eb)",
                borderRadius: 10, outline: "none",
                background: "var(--bg, #fff)",
                color: "var(--text, #111)",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                width: 40, height: 40, borderRadius: 10,
                background: loading || !input.trim() ? "var(--text3, #ccc)" : "linear-gradient(135deg, #0f2167, #2563eb)",
                border: "none", cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Dot animation */}
      <style>{`
        @keyframes logicbot-dot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </>
  );
}
