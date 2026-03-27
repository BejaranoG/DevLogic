"use client";

/**
 * lib/api-client.ts
 * Cliente HTTP para el backend de Logic Auth (NestJS).
 *
 * La URL del backend se obtiene de /api/config en RUNTIME.
 * Esto evita el problema de NEXT_PUBLIC_* que solo funciona en build-time
 * y no se inyecta en Docker/Railway.
 */

// ════════════════════════════════════════════════════════
// API BASE URL — resolved at runtime via /api/config
// ════════════════════════════════════════════════════════

let _apiBase: string | null = null;
let _configPromise: Promise<string> | null = null;

const FALLBACK = "http://localhost:4000/api";

async function getApiBase(): Promise<string> {
  if (_apiBase) return _apiBase;
  if (typeof window === "undefined") return FALLBACK;

  if (!_configPromise) {
    _configPromise = (async (): Promise<string> => {
      try {
        const res = await fetch("/api/config");
        const data = await res.json();
        if (data.apiUrl) {
          _apiBase = data.apiUrl;
          return data.apiUrl as string;
        }
      } catch { /* fallback */ }
      _apiBase = FALLBACK;
      return FALLBACK;
    })();
  }

  return _configPromise;
}

// ════════════════════════════════════════════════════════
// TOKEN MANAGEMENT
// ════════════════════════════════════════════════════════

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("logic_token");
}

export function setToken(token: string) {
  localStorage.setItem("logic_token", token);
}

export function clearToken() {
  localStorage.removeItem("logic_token");
  localStorage.removeItem("logic_user");
}

export function getStoredUser(): any | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("logic_user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setStoredUser(user: any) {
  localStorage.setItem("logic_user", JSON.stringify(user));
}

// ════════════════════════════════════════════════════════
// HTTP CLIENT
// ════════════════════════════════════════════════════════

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: any,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = await getApiBase();
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${base}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let body: any;
    try { body = await res.json(); } catch { body = { message: res.statusText }; }
    const msg = body?.message || body?.error || `Error ${res.status}`;
    throw new ApiError(res.status, body, Array.isArray(msg) ? msg.join(". ") : msg);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// ════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════

export const authApi = {
  register: (data: { email: string; password: string; nombre: string; apellido: string }) =>
    request<any>("/auth/register", { method: "POST", body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    request<{ access_token: string; usuario: any }>("/auth/login", { method: "POST", body: JSON.stringify(data) }),

  forgotPassword: (email: string) =>
    request<any>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),

  resetPassword: (data: { email: string; codigo: string; nueva_password: string }) =>
    request<any>("/auth/reset-password", { method: "POST", body: JSON.stringify(data) }),

  me: () => request<any>("/auth/me"),
};

// ════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════

export const usersApi = {
  list: () => request<any>("/users"),
  pending: () => request<any>("/users/pending"),
  unverified: () => request<any>("/users/unverified"),
  getById: (id: string) => request<any>(`/users/${id}`),

  approve: (id: string, data: { role_clave: string; motivo?: string }) =>
    request<any>(`/users/${id}/approve`, { method: "POST", body: JSON.stringify(data) }),

  reject: (id: string, data: { motivo: string }) =>
    request<any>(`/users/${id}/reject`, { method: "POST", body: JSON.stringify(data) }),

  deactivate: (id: string, data: { motivo: string }) =>
    request<any>(`/users/${id}/deactivate`, { method: "POST", body: JSON.stringify(data) }),

  reactivate: (id: string, data: { role_clave: string; motivo?: string }) =>
    request<any>(`/users/${id}/reactivate`, { method: "POST", body: JSON.stringify(data) }),

  changeRole: (id: string, data: { role_clave: string; motivo?: string }) =>
    request<any>(`/users/${id}/role`, { method: "PATCH", body: JSON.stringify(data) }),

  mapPortfolio: (id: string, data: { nombre_ejecutivo_sheets: string; motivo?: string }) =>
    request<any>(`/users/${id}/portfolio`, { method: "POST", body: JSON.stringify(data) }),

  updateProfile: (data: { nombre?: string; apellido?: string; area?: string }) =>
    request<any>("/users/profile", { method: "PATCH", body: JSON.stringify(data) }),
};

// ════════════════════════════════════════════════════════
// ROLES
// ════════════════════════════════════════════════════════

export const rolesApi = {
  list: () => request<any>("/roles"),
  getByKey: (clave: string) => request<any>(`/roles/${clave}`),
  permissions: () => request<any>("/roles/permissions/catalog"),
  effectivePermissions: (userId: string) => request<any>(`/roles/users/${userId}/effective-permissions`),
  myPermissions: () => request<any>("/roles/me/permissions"),

  assignPermissions: (roleClave: string, claves: string[]) =>
    request<any>(`/roles/${roleClave}/permissions`, {
      method: "POST", body: JSON.stringify({ permission_claves: claves }),
    }),

  revokePermissions: (roleClave: string, claves: string[]) =>
    request<any>(`/roles/${roleClave}/permissions`, {
      method: "DELETE", body: JSON.stringify({ permission_claves: claves }),
    }),
};

// ════════════════════════════════════════════════════════
// AUDIT
// ════════════════════════════════════════════════════════

export const auditApi = {
  query: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/audit?${qs}`);
  },
  dashboard: (dias = 7) => request<any>(`/audit/dashboard?dias=${dias}`),
  recent: (limit = 20) => request<any>(`/audit/recent?limit=${limit}`),
  logins: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/audit/logins?${qs}`);
  },
  adminActions: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/audit/admin-actions?${qs}`);
  },
  userTimeline: (userId: string) => request<any>(`/audit/user/${userId}/timeline`),
};

export const sugerenciasApi = {
  enviar: (data: { tipo: string; mensaje: string }) => request<any>("/sugerencias", { method: "POST", body: JSON.stringify(data) }),
  listar: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<any>(`/sugerencias?${qs}`);
  },
  marcarLeido: (id: string) => request<any>(`/sugerencias/${id}/leido`, { method: "PATCH" }),
};
