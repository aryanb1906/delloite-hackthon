// â”€â”€â”€ Voice Assistant Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Modular type definitions for the FinGuide Voice Copilot.

export type AssistantState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "guiding";

export type ActionType =
  | "navigate"
  | "open_report"
  | "highlight_section"
  | "run_calculator"
  | "guide_and_highlight"
  | "explain_graph";

/**
 * Action types that are system/UI commands â€” these remain ephemeral
 * and should NOT create a chat thread.
 * Everything else (including "none") is conversational.
 */
export const SYSTEM_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  "navigate",
  "open_report",
  "highlight_section",
  "run_calculator",
  "guide_and_highlight",
  "explain_graph",
]);

/** Structured visual data registered by pages */
export interface AssistantVisual {
  id: string;
  type: "bar" | "line" | "pie" | "area" | "stat" | "table" | "composed" | "card";
  title: string;
  data?: unknown;
  unit?: string;
  description?: string;
}

/** Structured summary KPI registered by pages */
export interface AssistantSummary {
  id: string;
  label: string;
  value: string | number;
  subtitle?: string;
}

/** Rich page context from the context registry */
export interface AssistantPageContext {
  currentPage: string;
  activeChatId?: string | null;
  chatHistory?: { id: string; title: string }[];
  savedResponses?: { id: string; title: string; summary: string; [key: string]: unknown }[];
  visuals: AssistantVisual[];
  summaries: AssistantSummary[];
  metadata: Record<string, unknown>;
}

export interface AssistantContext {
  currentRoute: string;
  activeModule: string | null;
  selectedFinancialYear: string | null;
  visibleComponentIds: string[];
  /** Rich structured context from the context registry */
  assistantContext?: AssistantPageContext;
}

export interface AssistantAction {
  type: ActionType;
  target?: string | null;
  params?: Record<string, unknown>;
}

export interface AssistantResponse {
  reply: string;
  action?: AssistantAction;
  language?: string;
  audioBase64?: string | null;
  isFinanceRelated?: boolean;
  followUps?: string[];
}

export interface AssistantRequest {
  userText: string;
  context?: AssistantContext;
  userId?: string;
  language?: string;
}

export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  label?: string;
}

