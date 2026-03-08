"use client";
// ─── AssistantContextProvider: global context registry ──────────
// Pages register their visuals, summaries, and metadata here.
// The voice assistant reads this on activation instead of scraping DOM.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { AssistantVisual, AssistantSummary } from "./types";

export type { AssistantVisual, AssistantSummary };

// ─── Additional types ───────────────────────────────────────────

/** Chat history entry */
export interface ChatHistoryEntry {
  id: string;
  title: string;
}

/** A structured saved response / summary */
export interface SavedResponse {
  id: string;
  title: string;
  summary: string;
  [key: string]: unknown;
}

/** Page-level metadata */
export interface AssistantPageMeta {
  currentPage: string;
  [key: string]: unknown;
}

export interface AssistantContextStore {
  currentPage: string;
  activeChatId: string | null;
  chatHistory: ChatHistoryEntry[];
  savedResponses: SavedResponse[];
  visuals: AssistantVisual[];
  summaries: AssistantSummary[];
  metadata: AssistantPageMeta;

  /** Set the current page name */
  setCurrentPage: (page: string) => void;
  /** Set the active chat id */
  setActiveChatId: (id: string | null) => void;
  /** Replace the full chat history list */
  setChatHistory: (chats: ChatHistoryEntry[]) => void;
  /** Replace the full saved responses list */
  setSavedResponses: (responses: SavedResponse[]) => void;
  /** Register or update a visual (idempotent by id) */
  registerVisual: (visual: AssistantVisual) => void;
  /** Clear all registered visuals */
  clearVisuals: () => void;
  /** Register or update a summary (idempotent by id) */
  registerSummary: (summary: AssistantSummary) => void;
  /** Clear all registered summaries */
  clearSummaries: () => void;
  /** Set current page name + optional metadata */
  setPageMeta: (meta: AssistantPageMeta) => void;
  /** Snapshot the full context for sending to backend */
  getSnapshot: () => AssistantContextSnapshot;
}

/** Serialisable snapshot sent to the backend */
export interface AssistantContextSnapshot {
  currentPage: string;
  activeChatId: string | null;
  chatHistory: ChatHistoryEntry[];
  savedResponses: SavedResponse[];
  visuals: AssistantVisual[];
  summaries: AssistantSummary[];
  metadata: AssistantPageMeta;
}

// ─── Context ────────────────────────────────────────────────────

const AssistantCtx = createContext<AssistantContextStore | null>(null);

export function useAssistantContext(): AssistantContextStore {
  const ctx = useContext(AssistantCtx);
  if (!ctx) {
    throw new Error(
      "useAssistantContext must be used inside <AssistantContextProvider>"
    );
  }
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────────

export function AssistantContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [visuals, setVisuals] = useState<AssistantVisual[]>([]);
  const [summaries, setSummaries] = useState<AssistantSummary[]>([]);
  const [metadata, setMetadata] = useState<AssistantPageMeta>({
    currentPage: "",
  });
  const [activeChatId, setActiveChatIdState] = useState<string | null>(null);
  const [chatHistory, setChatHistoryState] = useState<ChatHistoryEntry[]>([]);
  const [savedResponses, setSavedResponsesState] = useState<SavedResponse[]>([]);

  // ── Page / chat setters ────────────────────────────────────────

  const setCurrentPage = useCallback((page: string) => {
    setMetadata((prev) => ({ ...prev, currentPage: page }));
  }, []);

  const setActiveChatId = useCallback((id: string | null) => {
    setActiveChatIdState(id);
  }, []);

  const setChatHistory = useCallback((chats: ChatHistoryEntry[]) => {
    setChatHistoryState(chats);
  }, []);

  const setSavedResponses = useCallback((responses: SavedResponse[]) => {
    setSavedResponsesState(responses);
  }, []);

  // ── Visual / summary registration (unchanged) ─────────────────

  const registerVisual = useCallback((v: AssistantVisual) => {
    setVisuals((prev) => {
      const idx = prev.findIndex((x) => x.id === v.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = v;
        return next;
      }
      return [...prev, v];
    });
  }, []);

  const clearVisuals = useCallback(() => setVisuals([]), []);

  const registerSummary = useCallback((s: AssistantSummary) => {
    setSummaries((prev) => {
      const idx = prev.findIndex((x) => x.id === s.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = s;
        return next;
      }
      return [...prev, s];
    });
  }, []);

  const clearSummaries = useCallback(() => setSummaries([]), []);

  const setPageMeta = useCallback((meta: AssistantPageMeta) => {
    setMetadata(meta);
  }, []);

  // ── Snapshot ──────────────────────────────────────────────────

  const getSnapshot = useCallback(
    (): AssistantContextSnapshot => ({
      currentPage: metadata.currentPage,
      activeChatId,
      chatHistory,
      savedResponses,
      visuals,
      summaries,
      metadata,
    }),
    [metadata, activeChatId, chatHistory, savedResponses, visuals, summaries]
  );

  // ── Memoised value ────────────────────────────────────────────

  const value = useMemo<AssistantContextStore>(
    () => ({
      currentPage: metadata.currentPage,
      activeChatId,
      chatHistory,
      savedResponses,
      visuals,
      summaries,
      metadata,
      setCurrentPage,
      setActiveChatId,
      setChatHistory,
      setSavedResponses,
      registerVisual,
      clearVisuals,
      registerSummary,
      clearSummaries,
      setPageMeta,
      getSnapshot,
    }),
    [
      metadata,
      activeChatId,
      chatHistory,
      savedResponses,
      visuals,
      summaries,
      setCurrentPage,
      setActiveChatId,
      setChatHistory,
      setSavedResponses,
      registerVisual,
      clearVisuals,
      registerSummary,
      clearSummaries,
      setPageMeta,
      getSnapshot,
    ]
  );

  return (
    <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>
  );
}
