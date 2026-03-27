"use client";

import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Topbar } from "@/components/topbar";
import { Sidebar } from "@/components/sidebar";
import { LogicBot } from "@/components/logic-bot";
import { useEffect } from "react";

const PUBLIC_ROUTES = ["/login", "/register", "/forgot-password"];

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
  const isAdmin = pathname.startsWith("/admin");

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace("/login?redirect=" + encodeURIComponent(pathname));
    }
  }, [user, loading, isPublic, pathname, router]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user && !isPublic) return null;

  // Public pages: no sidebar, no topbar
  if (isPublic) return <>{children}</>;

  // Admin pages: admin has its own sidebar layout
  if (isAdmin) return <>{children}<LogicBot /></>;

  // App pages: sidebar + topbar + main + LogicBot
  return (
    <>
      <Sidebar />
      <div className="app-with-sidebar">
        <Topbar />
        <main className="main">{children}</main>
      </div>
      <LogicBot />
    </>
  );
}

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RouteGuard>{children}</RouteGuard>
    </AuthProvider>
  );
}
