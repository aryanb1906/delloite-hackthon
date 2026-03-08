// ─── Voice Assistant API client ───
import axios from "axios";
import type { AssistantRequest, AssistantResponse } from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const assistantApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000, // 30 s – LLM cold-start + generation can be slow
});

/**
 * Send a message to the voice assistant backend.
 * Pass an optional AbortSignal to allow in-flight cancellation.
 */
export async function sendAssistantMessage(
  request: AssistantRequest,
  signal?: AbortSignal
): Promise<AssistantResponse> {
  const { data } = await assistantApi.post<AssistantResponse>(
    "/api/assistant",
    request,
    { signal }
  );
  return data;
}
