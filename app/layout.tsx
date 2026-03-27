import "./globals.css";
import type { Metadata } from "next";
import { AuthWrapper } from "./auth-wrapper";

export const metadata: Metadata = {
  title: "LOGIC · Cartera",
  description: "Proyección de saldos crediticios — Proaktiva",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeScript />
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  );
}

function ThemeScript() {
  const script = `
    (function() {
      var t = localStorage.getItem('logic-theme') || 'light';
      document.documentElement.setAttribute('data-theme', t);
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
