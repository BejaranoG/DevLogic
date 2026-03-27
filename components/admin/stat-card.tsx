"use client";

export function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color?: "blue" | "green" | "yellow" | "red" | "purple";
}) {
  const colorCls = color ? ` adm-stat-${color}` : "";
  return (
    <div className={"adm-stat" + colorCls}>
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value">{value}</div>
      {sub && <div className="adm-stat-sub">{sub}</div>}
    </div>
  );
}
