"use client";
// ─── VoiceAssistantWrapper: mounts only for authenticated users ───
import { usePathname } from "next/navigation";
import { VoiceAssistant } from "@/components/voice-assistant";
import { useAuth } from "@/components/auth-provider";

const AUTH_ROUTES = ["/login", "/register"];

export function VoiceAssistantWrapper() {
  const pathname = usePathname();
  const { user } = useAuth();

  // Hide on login/register pages
  if (AUTH_ROUTES.includes(pathname)) return null;

  // Only show when user is logged in
  if (!user) return null;

  return <VoiceAssistant />;
}
