"use client";

import { type ReactNode } from "react";

export function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-header">
          <h3>{title}</h3>
          <button className="adm-modal-close" onClick={onClose}>{"×"}</button>
        </div>
        <div className="adm-modal-body">{children}</div>
      </div>
    </div>
  );
}
