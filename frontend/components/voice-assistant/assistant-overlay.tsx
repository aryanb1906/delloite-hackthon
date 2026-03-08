"use client";
// ─── AssistantOverlay: portal-based highlight overlay system ───
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { HighlightRect } from "./types";

interface AssistantOverlayProps {
  targetId: string | null; // data-assistant-id of the element to highlight
  visible: boolean;
  label?: string;
  onDismiss: () => void;
}

export function AssistantOverlay({
  targetId,
  visible,
  label,
  onDismiss,
}: AssistantOverlayProps) {
  const [rect, setRect] = useState<HighlightRect | null>(null);

  const computeRect = useCallback(() => {
    if (!targetId || !visible) {
      setRect(null);
      return;
    }
    const el = document.querySelector(
      `[data-assistant-id="${targetId}"]`
    ) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top + window.scrollY - 6,
      left: r.left + window.scrollX - 6,
      width: r.width + 12,
      height: r.height + 12,
      label,
    });

    // Scroll into view if needed
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [targetId, visible, label]);

  useEffect(() => {
    computeRect();

    // Recompute on resize / scroll
    window.addEventListener("resize", computeRect);
    window.addEventListener("scroll", computeRect, true);
    return () => {
      window.removeEventListener("resize", computeRect);
      window.removeEventListener("scroll", computeRect, true);
    };
  }, [computeRect]);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!visible || !rect) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [visible, rect, onDismiss]);

  if (!visible || !rect) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] pointer-events-none"
      aria-hidden="true"
    >
      {/* Semi-transparent backdrop */}
      <div
        className="absolute inset-0 bg-black/20 pointer-events-auto"
        onClick={onDismiss}
      />

      {/* Highlight ring */}
      <div
        className="absolute rounded-xl pointer-events-none"
        style={{
          top: rect.top - window.scrollY,
          left: rect.left - window.scrollX,
          width: rect.width,
          height: rect.height,
          boxShadow:
            "0 0 0 3px rgba(59, 130, 246, 0.7), 0 0 24px 4px rgba(59, 130, 246, 0.35)",
          animation: "assistant-pulse 1.5s ease-in-out infinite",
        }}
      />

      {/* Label tooltip */}
      {rect.label && (
        <div
          className="absolute px-3 py-1.5 rounded-lg text-xs font-medium text-white pointer-events-none"
          style={{
            top: rect.top - window.scrollY - 36,
            left: rect.left - window.scrollX,
            background: "rgba(59, 130, 246, 0.9)",
            backdropFilter: "blur(8px)",
          }}
        >
          {rect.label}
        </div>
      )}

      {/* Keyframes injected via <style> */}
      <style>{`
        @keyframes assistant-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(59,130,246,0.7), 0 0 24px 4px rgba(59,130,246,0.35); }
          50% { box-shadow: 0 0 0 5px rgba(59,130,246,0.5), 0 0 32px 8px rgba(59,130,246,0.25); }
        }
      `}</style>
    </div>,
    document.body
  );
}
