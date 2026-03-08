"use client";
// ─── useRegisterAssistantData: convenience hook for page registration ───
import { useEffect } from "react";
import { useAssistantContext } from "./assistant-context-provider";
import type { AssistantVisual, AssistantSummary, AssistantPageMeta } from "./assistant-context-provider";

interface RegistrationOptions {
  page: string;
  visuals?: AssistantVisual[];
  summaries?: AssistantSummary[];
  metadata?: Record<string, unknown>;
}

/**
 * Call from any page component to register its chart data and summaries
 * with the global assistant context. Automatically clears on unmount.
 */
export function useRegisterAssistantData({
  page,
  visuals = [],
  summaries = [],
  metadata = {},
}: RegistrationOptions) {
  const ctx = useAssistantContext();

  // Set page metadata
  useEffect(() => {
    ctx.setPageMeta({ currentPage: page, ...metadata });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, JSON.stringify(metadata)]);

  // Register visuals (re-register when data changes)
  useEffect(() => {
    visuals.forEach((v) => ctx.registerVisual(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(visuals)]);

  // Register summaries (re-register when data changes)
  useEffect(() => {
    summaries.forEach((s) => ctx.registerSummary(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(summaries)]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ctx.clearVisuals();
      ctx.clearSummaries();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
