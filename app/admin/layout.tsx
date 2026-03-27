"use client";

import { RequireAuth } from "@/lib/auth-context";
import { AdminSidebar } from "@/components/admin/sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth roles={["admin_maestro", "admin"]}>
      <div className="adm-layout">
        <AdminSidebar />
        <div className="adm-content">
          {children}
        </div>
      </div>
    </RequireAuth>
  );
}
