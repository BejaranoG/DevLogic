"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authApi, setToken, clearToken, getStoredUser, setStoredUser } from "./api-client";

interface User {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  numero_identificacion: string;
  role: string;
  role_nombre?: string;
  nombre_en_sheets: string | null;
  permisos?: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  hasRole: (...roles: string[]) => boolean;
  hasPermission: (...perms: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Load session on mount
  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
      // Refresh from backend in background
      authApi.me().then((fresh) => {
        const u: User = {
          id: fresh.id, email: fresh.email,
          nombre: fresh.nombre, apellido: fresh.apellido,
          numero_identificacion: fresh.numero_identificacion,
          role: fresh.role?.clave || fresh.role,
          role_nombre: fresh.role?.nombre,
          nombre_en_sheets: fresh.nombre_en_sheets,
          permisos: fresh.permisos || [],
        };
        setUser(u);
        setStoredUser(u);
      }).catch(() => {
        // Token expirado
        clearToken();
        setUser(null);
      });
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const res = await authApi.login({ email, password });
      setToken(res.access_token);
      const u: User = {
        id: res.usuario.id, email: res.usuario.email,
        nombre: res.usuario.nombre, apellido: res.usuario.apellido,
        numero_identificacion: res.usuario.numero_identificacion,
        role: res.usuario.role,
        role_nombre: res.usuario.role_nombre,
        nombre_en_sheets: res.usuario.nombre_en_sheets,
      };
      setUser(u);
      setStoredUser(u);

      // Load permissions
      try {
        const perms = await authApi.me();
        u.permisos = perms.permisos || [];
        setUser({ ...u });
        setStoredUser(u);
      } catch { /* non-critical */ }
    } catch (err: any) {
      setError(err.message || "Error de autenticación");
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    router.push("/login");
  }, [router]);

  const isAdmin = user?.role === "admin_maestro" || user?.role === "admin";

  const hasRole = useCallback((...roles: string[]) => {
    if (!user) return false;
    if (user.role === "admin_maestro") return true; // bypass
    return roles.includes(user.role);
  }, [user]);

  const hasPermission = useCallback((...perms: string[]) => {
    if (!user) return false;
    if (user.role === "admin_maestro") return true; // bypass
    if (!user.permisos) return false;
    return perms.every((p) => user.permisos!.includes(p));
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, isAdmin, hasRole, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

/**
 * Guard component: redirects to /login if not authenticated,
 * or to / if authenticated but missing required role.
 */
export function RequireAuth({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?redirect=" + encodeURIComponent(pathname));
      return;
    }
    if (roles && !hasRole(...roles)) {
      router.replace("/");
    }
  }, [user, loading, roles, hasRole, router, pathname]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return null;
  if (roles && !hasRole(...roles)) return null;

  return <>{children}</>;
}
