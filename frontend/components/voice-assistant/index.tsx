"use client";
// ─── Voice Assistant: lazy-loaded entry point ───
// Controlled by NEXT_PUBLIC_ENABLE_VOICE_ASSISTANT feature flag.
import dynamic from "next/dynamic";

const VoiceAssistantBubble = dynamic(
  () =>
    import("./voice-assistant-bubble").then((m) => ({
      default: m.VoiceAssistantBubble,
    })),
  { ssr: false }
);

export function VoiceAssistant() {
  const enabled =
    process.env.NEXT_PUBLIC_ENABLE_VOICE_ASSISTANT !== "false";

  if (!enabled) return null;

  return <VoiceAssistantBubble />;
}
