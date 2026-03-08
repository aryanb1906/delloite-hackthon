"use client";
// ─── ActionExecutor: handles structured response actions ───
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { AssistantAction, ActionType } from "./types";
import { SYSTEM_ACTIONS } from "./types";

interface ActionExecutorOptions {
  onHighlight: (targetId: string, label?: string) => void;
}

export function useActionExecutor({ onHighlight }: ActionExecutorOptions) {
  const router = useRouter();

  const executeAction = useCallback(
    (action: AssistantAction) => {
      // Guard: ignore any unsupported / unknown action types
      if (!SYSTEM_ACTIONS.has(action.type as ActionType)) {
        console.warn(
          `[ActionExecutor] Unsupported action type "${action.type}" — ignoring.`,
          action,
        );
        return;
      }

      switch (action.type) {
        case "navigate":
          if (action.target) {
            router.push(action.target);
          }
          break;

        case "open_report":
          // Navigate to analytics or relevant report page
          if (action.target) {
            router.push(action.target);
          } else {
            router.push("/analytics");
          }
          break;

        case "highlight_section":
          if (action.target) {
            onHighlight(action.target, action.params?.label as string | undefined);
          }
          break;

        case "guide_and_highlight":
          if (action.target) {
            // The bubble animation is handled by the main component
            // We just trigger the highlight here
            onHighlight(action.target, action.params?.label as string | undefined);
          }
          break;

        case "run_calculator":
          router.push("/tax-calculator");
          break;

        case "explain_graph":
          // Highlight the target chart/visual; the reply text carries the explanation
          if (action.target) {
            onHighlight(action.target, action.params?.label as string | undefined);
          }
          break;

        default:
          // Safety net — should never reach here after the guard above
          console.warn(`[ActionExecutor] Unhandled action type "${action.type}".`);
          break;
      }
    },
    [router, onHighlight],
  );

  return { executeAction };
}
