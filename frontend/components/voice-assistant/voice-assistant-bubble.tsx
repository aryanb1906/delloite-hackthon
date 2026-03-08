"use client";
// ─── VoiceAssistantBubble: main floating bubble + orchestrator ───
// Features: Audio visualizer, voice selection, quick commands,
// interrupt/barge-in, contextual awareness, multi-turn flows,
// TTS pronunciation fix, offline fallback, conversation memory,
// live transcript, error toasts, keyboard shortcut (Ctrl+Shift+V).

import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useVoiceInput } from "./use-voice-input";
import { useVoiceSpeech } from "./use-voice-speech";
import { useActionExecutor } from "./action-executor";
import { sendAssistantMessage } from "./assistant-api";
import { AssistantOverlay } from "./assistant-overlay";
import { useAssistantContext } from "./assistant-context-provider";
import { AudioVisualizer } from "./audio-visualizer";
import { AssistantAvatar } from "./assistant-avatar";
import { matchQuickCommand } from "./quick-commands";
import { playStartListening, playStopListening, playResponseReady, playError, playActionClick } from "./voice-feedback-sounds";
import { hapticStartListening, hapticResponseReady, hapticError, hapticTap, hapticSuccess } from "./haptic-feedback";
import { SYSTEM_ACTIONS } from "./types";
import type { AssistantState, AssistantAction, AssistantContext } from "./types";
import { useToast } from "@/hooks/use-toast";

// ─── Finance topic detection ────────────────────────────────────
const FINANCE_KEYWORDS = [
  // English
  "tax", "taxes", "taxation", "income tax", "gst", "tds", "tcs",
  "investment", "invest", "sip", "mutual fund", "ppf", "nps", "elss",
  "epf", "provident fund", "fixed deposit", "fd", "rd",
  "scheme", "government scheme", "pm scheme", "pmay", "sukanya",
  "finance", "financial", "budget", "deduction", "rebate",
  "savings", "saving", "insurance", "lic", "term plan",
  "loan", "emi", "home loan", "personal loan", "interest rate",
  "section 80", "80c", "80d", "hra", "standard deduction",
  "salary", "income", "capital gain", "dividend", "pension",
  "gdp", "inflation", "rbi", "sebi", "stock", "share market",
  "gold", "bond", "treasury", "fiscal", "subsidy",
  "itr", "return filing", "assessment year", "financial year",
  "old regime", "new regime", "tax slab", "surcharge", "cess",
  // Hindi (Devanagari)
  "कर", "आयकर", "निवेश", "बचत", "योजना", "कटौती", "छूट",
  "वित्तीय", "वित्त", "ऋण", "बजट", "सरकारी योजना", "ब्याज दर",
  "कर स्लैब", "पेंशन", "बीमा", "म्यूचुअल फंड",
  "आय", "वेतन", "तनख्वाह", "सैलरी", "कर योग्य आय",
  "कर विवरणी", "निर्धारण वर्ष", "वित्तीय वर्ष",
  "सकल आय", "शुद्ध आय", "कर छूट", "कर कटौती",
  "जीएसटी", "टीडीएस", "टीसीएस", "आईटीआर",
  "सेस", "सरचार्ज", "अधिभार", "उपकर",
  "पूंजीगत लाभ", "लाभांश", "ब्याज",
  "गोल्ड", "सोना", "बॉन्ड", "शेयर", "शेयर बाजार",
  "म्यूचुअल", "एसआईपी", "पीपीएफ", "एनपीएस", "ईएलएसएस",
  "ईपीएफ", "भविष्य निधि", "सावधि जमा", "आवर्ती जमा",
  "प्रधानमंत्री", "प्रधानमंत्री योजना", "सुकन्या", "पीएमएवाय",
  "बीमा योजना", "जीवन बीमा", "टर्म प्लान",
  "गृह ऋण", "होम लोन", "व्यक्तिगत ऋण", "ईएमआई",
  "महंगाई", "मुद्रास्फीति", "आरबीआई", "सेबी",
  "सब्सिडी", "अनुदान", "राजकोषीय",
  "पुरानी व्यवस्था", "नई व्यवस्था", "कर व्यवस्था",
  "धारा 80", "एचआरए",
  // Romanized Hindi (speech-to-text often outputs this)
  "kar", "aykar", "nivesh", "bachat", "yojana", "katoti", "chhut",
  "vittiya", "rin", "bajat", "sarkari yojana", "byaj dar",
  "kar slab", "pension", "beema", "bima",
  "aay", "vetan", "tankhwah", "salary",
  "sarkari", "pradhan mantri", "pradhanmantri",
  "sukanya samriddhi", "jeevan bima",
  "ghar ka loan", "home loan", "karz",
  "mehngai", "mudrasphiti",
  "purani vyavastha", "nai vyavastha",
  "munafa", "labh", "hissa",
  "paisa", "paise", "dhan", "sampatti",
  "kamai", "amdani",
];

const FINANCE_RE = new RegExp(
  FINANCE_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i"
);

/** Returns true when the user query is about finance / taxes / schemes */
function isFinanceQuery(text: string): boolean {
  return FINANCE_RE.test(text);
}

// ─── TTS truncation for long responses ───────────────────────────
const TTS_MAX_WORDS = 150;
const TTS_TRUNCATION_SUFFIX_EN = "… For the full answer, please check the chat.";
const TTS_TRUNCATION_SUFFIX_HI = "… पूरा जवाब चैट में देखें।";

/** Truncate text to TTS_MAX_WORDS for speech; returns original + isTruncated flag */
function truncateForTTS(text: string, lang: string): { spoken: string; truncated: boolean } {
  const words = text.split(/\s+/);
  if (words.length <= TTS_MAX_WORDS) return { spoken: text, truncated: false };
  const cut = words.slice(0, TTS_MAX_WORDS).join(" ");
  const suffix = lang === "hi" ? TTS_TRUNCATION_SUFFIX_HI : TTS_TRUNCATION_SUFFIX_EN;
  return { spoken: cut + suffix, truncated: true };
}

// ─── Conversation memory (sessionStorage, last 20 turns) ────────
const MEMORY_KEY = "arth_voice_memory";
const MEMORY_ACTIVITY_KEY = "arth_voice_memory_ts";
const MAX_TURNS = 20;
const MEMORY_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface VoiceTurn {
  role: "user" | "assistant";
  text: string;
  ts: number;
}

/** Load memory with auto-cleanup: clears turns older than 30 min of inactivity */
function loadMemory(): VoiceTurn[] {
  try {
    const lastActivity = sessionStorage.getItem(MEMORY_ACTIVITY_KEY);
    if (lastActivity) {
      const elapsed = Date.now() - parseInt(lastActivity, 10);
      if (elapsed > MEMORY_TTL_MS) {
        sessionStorage.removeItem(MEMORY_KEY);
        sessionStorage.removeItem(MEMORY_ACTIVITY_KEY);
        return [];
      }
    }
    const raw = sessionStorage.getItem(MEMORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function appendMemory(turns: VoiceTurn[]): void {
  try {
    const existing = loadMemory();
    const merged = [...existing, ...turns].slice(-MAX_TURNS);
    sessionStorage.setItem(MEMORY_KEY, JSON.stringify(merged));
    sessionStorage.setItem(MEMORY_ACTIVITY_KEY, String(Date.now()));
  } catch { /* quota exceeded — silently ignore */ }
}

// ─── Multi-turn guided flow engine ──────────────────────────────
const FLOW_KEY = "arth_voice_flow";

interface FlowState {
  flowId: string;
  step: number;
  data: Record<string, string>;
}

interface FlowStep {
  prompt: string;        // What the assistant asks
  field: string;         // Key to store the user's answer
  validate?: (v: string) => boolean;
}

interface FlowDefinition {
  id: string;
  trigger: RegExp;
  steps: FlowStep[];
  /** Called with collected data after all steps complete */
  onComplete: (data: Record<string, string>) => {
    reply: string;
    navigateTo?: string;
    params?: Record<string, string>;
  };
}

const GUIDED_FLOWS: FlowDefinition[] = [
  {
    id: "tax_calc",
    trigger: /(?:help\s+(?:me\s+)?(?:calculate|compute|figure\s+out)\s+(?:my\s+)?tax|calculate\s+(?:my\s+)?tax|tax\s+calculation\s+help|कर\s*(?:गणना|कैलकुलेट)|mera\s+tax\s+calculate)/i,
    steps: [
      { prompt: "Sure! What's your annual income?", field: "income", validate: (v) => /\d/.test(v) },
      { prompt: "Got it. Do you have any Section 80C deductions? If yes, how much?", field: "deductions_80c" },
      { prompt: "Any HRA exemption? Enter yearly HRA amount or say 'no'.", field: "hra" },
      { prompt: "Which tax regime — old or new?", field: "regime", validate: (v) => /old|new|पुरान|नई/i.test(v) },
    ],
    onComplete: (data) => ({
      reply: `Thanks! Opening the tax calculator with your details — income ₹${data.income}, 80C deductions: ${data.deductions_80c}, HRA: ${data.hra}, regime: ${data.regime}.`,
      navigateTo: "/tax-calculator",
      params: data,
    }),
  },
  {
    id: "scheme_finder",
    trigger: /(?:find\s+(?:me\s+)?(?:a\s+)?scheme|suggest\s+(?:a\s+)?scheme|which\s+scheme|best\s+scheme|सरकारी\s*योजना\s*(?:बताओ|सुझाव)?|scheme\s+suggest)/i,
    steps: [
      { prompt: "What's your age group? (e.g., 25-35, 35-50, 50+)", field: "age_group" },
      { prompt: "What's your approximate annual income?", field: "income", validate: (v) => /\d/.test(v) },
      { prompt: "What's your primary goal — tax saving, retirement, child education, or wealth building?", field: "goal" },
    ],
    onComplete: (data) => ({
      reply: `Let me find schemes for a ${data.age_group} age group, income ₹${data.income}, goal: ${data.goal}. Opening chat to search our database.`,
      navigateTo: "/chat",
    }),
  },
];

function loadFlowState(): FlowState | null {
  try {
    const raw = sessionStorage.getItem(FLOW_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveFlowState(state: FlowState | null): void {
  try {
    if (state) sessionStorage.setItem(FLOW_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(FLOW_KEY);
  } catch { /* ignore */ }
}

// ─── Contextual awareness helpers ───────────────────────────────
function getPageContextHint(route: string): string | null {
  if (route.startsWith("/tax-calculator")) {
    return "You're on the tax calculator. I can help fill in values or explain any field. Just ask!";
  }
  if (route.startsWith("/analytics")) {
    return "You're viewing analytics. Ask me to explain any chart or summarize the data.";
  }
  if (route.startsWith("/chat")) {
    return "You're in the chat. I can start a new conversation or summarize the current one.";
  }
  if (route.startsWith("/settings")) {
    return "You're in settings. I can help you find specific options.";
  }
  if (route.startsWith("/profile-setup")) {
    return "You're setting up your profile. Tell me your details and I'll help fill them in.";
  }
  return null;
}

// ─── Offline detection ──────────────────────────────────────────
function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

// ─── Helpers ────────────────────────────────────────────────────
function getActiveModule(route: string): string {
  if (route.startsWith("/chat")) return "chat";
  if (route.startsWith("/tax-calculator")) return "tax-calculator";
  if (route.startsWith("/analytics")) return "analytics";
  if (route.startsWith("/settings")) return "settings";
  if (route.startsWith("/profile-setup")) return "profile-setup";
  return "home";
}

// ─── State-based icon SVGs ──────────────────────────────────────
function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function LoaderIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

// ─── Component ──────────────────────────────────────────────────
/** Map language code to BCP-47 recognition locale */
const RECOGNITION_LOCALE: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  "en-IN": "en-IN",  // Hinglish — Indian English accent, better for code-switching
};

/** Display labels for the language toggle */
const LANG_LABELS: Record<string, string> = {
  en: "EN",
  hi: "हि",
  "en-IN": "HI/EN",
};

export function VoiceAssistantBubble() {
  const pathname = usePathname();
  const router = useRouter();
  const assistantCtx = useAssistantContext();
  const { toast } = useToast();
  const [state, setState] = useState<AssistantState>("idle");
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string | null>(null);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([]);

  // ── Multilingual state (isolated) ──
  const [language, setLanguage] = useState<string>("en");

  // Voice speech hook — must be declared before toggleLanguage so autoSelectVoiceForLanguage is available
  const { isSpeaking, speak, stopSpeaking, selectedVoiceName, setVoicePreference, getAvailableVoices, autoSelectVoiceForLanguage, ttsSpeed, setTtsSpeed, ttsPitch, setTtsPitch } = useVoiceSpeech();

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      let next: string;
      if (prev === "en") next = "hi";
      else if (prev === "hi") next = "en-IN";
      else next = "en"; // en-IN → en
      autoSelectVoiceForLanguage(next === "en-IN" ? "en" : next);
      return next;
    });
  }, [autoSelectVoiceForLanguage]);

  // Overlay / highlight state
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);
  const [highlightLabel, setHighlightLabel] = useState<string | undefined>();
  const [highlightVisible, setHighlightVisible] = useState(false);

  // Bubble animation state for guide_and_highlight
  const [bubbleAnimating, setBubbleAnimating] = useState(false);
  const [bubbleOffset, setBubbleOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const bubbleRef = useRef<HTMLButtonElement>(null);

  // System-status message (shown in floating tooltip only for system actions)
  const [systemStatus, setSystemStatus] = useState<string | null>(null);

  // ── Abort controller for cancellable API requests (Feature 1) ──
  const abortControllerRef = useRef<AbortController | null>(null);

  // Hooks
  const {
    isListening,
    transcript,
    detectedLanguage,
    isSupported: micSupported,
    startListening,
    stopListening,
  } = useVoiceInput();

  const handleHighlight = useCallback((targetId: string, label?: string) => {
    setHighlightTarget(targetId);
    setHighlightLabel(label);
    setHighlightVisible(true);
  }, []);

  const { executeAction } = useActionExecutor({
    onHighlight: handleHighlight,
  });

  // ---- Guide & highlight bubble animation ----
  const animateBubbleTo = useCallback(
    (targetId: string, cb: () => void) => {
      const target = document.querySelector(
        `[data-assistant-id="${targetId}"]`
      );
      const bubble = bubbleRef.current;
      if (!target || !bubble) {
        cb();
        return;
      }
      const tr = target.getBoundingClientRect();
      const br = bubble.getBoundingClientRect();
      const dx = tr.left + tr.width / 2 - (br.left + br.width / 2);
      const dy = tr.top + tr.height / 2 - (br.top + br.height / 2);

      setBubbleAnimating(true);
      setBubbleOffset({ x: dx, y: dy });

      // After arrive → trigger highlight → return
      setTimeout(() => {
        cb();
        setTimeout(() => {
          setBubbleAnimating(false);
          setBubbleOffset({ x: 0, y: 0 });
        }, 600);
      }, 700);
    },
    []
  );

  // ---- Main flow: when transcript is ready after listening ----
  useEffect(() => {
    if (!isListening && transcript && state === "listening") {
      handleTranscript(transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening, transcript]);

  // ── Online/offline tracking ──
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    setIsOffline(!isOnline());
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Proactive hints (show subtle toast after inactivity on specific pages) ──
  const proactiveShownRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Only show once per page per session
    if (proactiveShownRef.current.has(pathname)) return;
    const HINTS: Record<string, { delay: number; title: string; msg: string }> = {
      "/tax-calculator": { delay: 45000, title: "💡 Need help?", msg: "Try saying \"Help me calculate my tax\" to the voice assistant!" },
      "/analytics": { delay: 60000, title: "💡 Voice tip", msg: "Ask the voice assistant to explain any chart on this page." },
      "/chat": { delay: 90000, title: "💡 Did you know?", msg: "You can start a voice conversation — just tap the mic button!" },
      "/profile-setup": { delay: 30000, title: "💡 Quick setup", msg: "Tell the voice assistant your details and it can help fill in your profile." },
    };
    const hint = HINTS[pathname];
    if (!hint) return;
    const timer = setTimeout(() => {
      // Don't show if the user is already actively using the assistant
      if (state !== "idle") return;
      proactiveShownRef.current.add(pathname);
      toast({ title: hint.title, description: hint.msg });
    }, hint.delay);
    return () => clearTimeout(timer);
  }, [pathname, state, toast]);

  const handleTranscript = useCallback(
    async (text: string) => {
      setState("processing");
      setSystemStatus(null);
      setLiveTranscript(null);
      setFollowUps([]);
      playStopListening();
      hapticTap();

      // ── 1. Check for active multi-turn flow ───────────────────
      const activeFlow = loadFlowState();
      if (activeFlow) {
        const flowDef = GUIDED_FLOWS.find((f) => f.id === activeFlow.flowId);
        if (flowDef && activeFlow.step < flowDef.steps.length) {
          const currentStep = flowDef.steps[activeFlow.step];

          // Cancel flow on "cancel" / "stop"
          if (/^(?:cancel|stop|रुको|बंद)/i.test(text.trim())) {
            saveFlowState(null);
            const msg = "Flow cancelled.";
            setLastReply(msg);
            setState("speaking");
            speak(msg, language);
            return;
          }

          // Validate if needed
          if (currentStep.validate && !currentStep.validate(text)) {
            const retry = `I didn't catch that. ${currentStep.prompt}`;
            setLastReply(retry);
            setState("speaking");
            speak(retry, language);
            return;
          }

          // Store answer
          activeFlow.data[currentStep.field] = text.trim();
          activeFlow.step += 1;

          if (activeFlow.step < flowDef.steps.length) {
            // Ask next question
            saveFlowState(activeFlow);
            const nextPrompt = flowDef.steps[activeFlow.step].prompt;
            setLastReply(nextPrompt);
            setState("speaking");
            speak(nextPrompt, language);
            return;
          } else {
            // Flow complete
            saveFlowState(null);
            const result = flowDef.onComplete(activeFlow.data);
            setLastReply(result.reply);
            setState("speaking");
            speak(result.reply, language);
            if (result.navigateTo) {
              setTimeout(() => router.push(result.navigateTo!), 1500);
            }
            return;
          }
        } else {
          saveFlowState(null); // invalid flow state, clear it
        }
      }

      // ── 2. Check for multi-turn flow triggers ─────────────────
      for (const flowDef of GUIDED_FLOWS) {
        if (flowDef.trigger.test(text.trim())) {
          const newFlow: FlowState = { flowId: flowDef.id, step: 0, data: {} };
          saveFlowState(newFlow);
          const firstPrompt = flowDef.steps[0].prompt;
          setLastReply(firstPrompt);
          setState("speaking");
          speak(firstPrompt, language);
          return;
        }
      }

      // ── 3. Quick commands (skip LLM entirely) ─────────────────
      const quickResult = matchQuickCommand(text);
      if (quickResult) {
        playActionClick();
        hapticTap();
        // Handle client-side actions
        if (quickResult.clientAction === "stop") {
          stopSpeaking();
          setState("idle");
          return;
        }
        if (quickResult.clientAction === "toggle_language") {
          toggleLanguage();
        }
        if (quickResult.clientAction === "read_page") {
          // Read visible page content
          const main = document.querySelector("main") || document.body;
          const pageText = main.innerText?.slice(0, 500) || "I can't read this page.";
          setLastReply(pageText);
          setState("speaking");
          speak(pageText, language);
          return;
        }
        if (quickResult.clientAction === "summarize") {
          const memory = loadMemory();
          if (memory.length < 4) {
            const msg = "There aren't enough conversation turns to summarize yet. Keep chatting!";
            setLastReply(msg);
            setState("speaking");
            speak(msg, language);
            return;
          }
          // Build a condensed conversation transcript
          const lines = memory.map((t) => `${t.role === "user" ? "You" : "Arth Mitra"}: ${t.text.slice(0, 100)}`);
          const summary = `Here's a summary of our conversation (${memory.length} messages):\n\n` +
            lines.slice(-10).join("\n") +
            (memory.length > 10 ? `\n\n...and ${memory.length - 10} earlier messages.` : "");
          setLastReply(summary);
          setState("speaking");
          speak(summary, language);
          return;
        }
        if (quickResult.clientAction === "export") {
          const memory = loadMemory();
          if (memory.length === 0) {
            const msg = "No conversation to export yet.";
            setLastReply(msg);
            setState("speaking");
            speak(msg, language);
            return;
          }
          // Build text transcript
          const header = `Arth Mitra Voice Conversation — ${new Date().toLocaleString()}\n${"=".repeat(50)}\n\n`;
          const lines = memory.map((t) => {
            const time = new Date(t.ts).toLocaleTimeString();
            return `[${time}] ${t.role === "user" ? "You" : "Arth Mitra"}: ${t.text}`;
          });
          const exportText = header + lines.join("\n\n");
          // Download as .txt file
          const blob = new Blob([exportText], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `arth-mitra-conversation-${Date.now()}.txt`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          const msg = `Exported ${memory.length} messages. Check your downloads!`;
          setLastReply(msg);
          setState("speaking");
          speak(msg, language);
          return;
        }
        if (quickResult.clientAction === "new_chat") {
          sessionStorage.setItem(
            "pendingVoiceFinanceQuery",
            JSON.stringify({ userText: "", reply: "" })
          );
        }
        if (quickResult.navigateTo) {
          router.push(quickResult.navigateTo);
        }
        if (quickResult.reply) {
          setLastReply(quickResult.reply);
          setState("speaking");
          speak(quickResult.reply, quickResult.lang || language);
        } else {
          setState("idle");
        }
        return;
      }

      // ── 4. Offline fallback ───────────────────────────────────
      if (isOffline || !isOnline()) {
        const offlineMsg = language === "hi"
          ? "आप ऑफलाइन हैं। कृपया इंटरनेट कनेक्शन जाँचें। आप अभी भी बुनियादी कमांड जैसे 'होम पेज', 'नया चैट', या 'कैलकुलेटर खोलो' का उपयोग कर सकते हैं।"
          : "You're offline. Please check your internet connection. You can still use basic commands like 'go home', 'new chat', or 'open calculator'.";
        toast({
          title: "Offline",
          description: "Voice assistant is in offline mode. Only quick commands are available.",
          variant: "destructive",
        });
        setLastReply(offlineMsg);
        setState("speaking");
        speak(offlineMsg, language);
        return;
      }

      // ── 5. Build context + call LLM backend ──────────────────
      const snapshot = assistantCtx.getSnapshot();
      const ctx: AssistantContext = {
        currentRoute: pathname,
        activeModule: getActiveModule(pathname),
        selectedFinancialYear: null,
        visibleComponentIds: [],
        assistantContext: {
          currentPage: snapshot.currentPage,
          activeChatId: snapshot.activeChatId,
          chatHistory: snapshot.chatHistory,
          savedResponses: snapshot.savedResponses,
          visuals: snapshot.visuals,
          summaries: snapshot.summaries,
          metadata: snapshot.metadata,
        },
      };

      try {
        const userId =
          typeof window !== "undefined"
            ? localStorage.getItem("userId") ?? undefined
            : undefined;

        // Create an AbortController so the user can cancel in-flight
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const response = await sendAssistantMessage(
          { userText: text, context: ctx, userId, language },
          controller.signal
        );

        abortControllerRef.current = null;

        const lang = response.language || language;
        const actionType = response.action?.type ?? undefined;
        const isSystemAction = actionType != null && SYSTEM_ACTIONS.has(actionType);

        // Save conversation turn to memory
        appendMemory([
          { role: "user", text, ts: Date.now() },
          { role: "assistant", text: response.reply, ts: Date.now() },
        ]);

        // ── Conversational response (no action field) ────────────
        if (!isSystemAction) {
          // Use LLM classification with keyword fallback
          const isFinance = response.isFinanceRelated ?? isFinanceQuery(text);

          if (isFinance) {
            const detail = { userText: text, reply: response.reply };
            if (pathname === "/chat") {
              window.dispatchEvent(new CustomEvent("voice-finance-query", { detail }));
            } else {
              sessionStorage.setItem("pendingVoiceFinanceQuery", JSON.stringify(detail));
              router.push("/chat");
            }
          }

          setLastReply(response.reply);
          setState("speaking");
          playResponseReady();
          hapticResponseReady();
          if (response.followUps?.length) setFollowUps(response.followUps);
          // Truncate long responses for TTS (full text stays in lastReply)
          const { spoken } = truncateForTTS(response.reply, lang);
          speak(spoken, lang);
          return;
        }

        // ── System actions — remain ephemeral ────────────────────
        setLastReply(null);
        setSystemStatus(response.reply);
        if (response.followUps?.length) setFollowUps(response.followUps);

        if (actionType === "guide_and_highlight" && response.action!.target) {
          setState("speaking");
          speak(response.reply, lang);
          animateBubbleTo(response.action!.target, () => {
            executeAction(response.action!);
          });
          return;
        }

        executeAction(response.action!);
        setState("speaking");
        speak(response.reply, lang);
      } catch (err: unknown) {
        // Silently handle user-initiated cancellation
        if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "ERR_CANCELED") {
          setState("idle");
          abortControllerRef.current = null;
          return;
        }

        console.error("Assistant error:", err);
        abortControllerRef.current = null;

        let userMessage = "I'm having trouble right now. Please try again.";
        if (err && typeof err === "object" && "response" in err) {
          const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } };
          const status = axiosErr.response?.status;
          const detail = axiosErr.response?.data?.detail;
          if (status === 401) userMessage = "Authentication required. Please log in.";
          else if (status === 429) userMessage = detail || "Too many requests. Please wait a moment.";
          else if (detail) userMessage = detail;
        }

        // Check if it's a network error → switch to offline mode
        if (err && typeof err === "object" && "message" in err) {
          const msg = (err as { message: string }).message;
          if (/network|timeout|ECONNREFUSED/i.test(msg)) {
            userMessage = "Can't reach the server. You can still use quick commands like 'go home' or 'open calculator'.";
            setIsOffline(true);
          }
        }

        toast({
          title: "Voice Assistant",
          description: userMessage,
          variant: "destructive",
        });
        playError();
        hapticError();

        setSystemStatus(userMessage);
        setLastReply(null);
        setState("speaking");
        speak(userMessage, "en");
      }
    },
    [
      pathname,
      language,
      speak,
      stopSpeaking,
      executeAction,
      animateBubbleTo,
      router,
      toast,
      toggleLanguage,
      isOffline,
    ]
  );

  // Reset to idle when speaking finishes
  useEffect(() => {
    if (state === "speaking" && !isSpeaking) {
      const timer = setTimeout(() => {
        setState("idle");
        setSystemStatus(null);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [state, isSpeaking]);

  // ── Live transcript tracking ──
  useEffect(() => {
    if (isListening && transcript) {
      setLiveTranscript(transcript);
    }
    if (!isListening) {
      // Keep visible briefly after stop, then clear
      const t = setTimeout(() => setLiveTranscript(null), 2000);
      return () => clearTimeout(t);
    }
  }, [isListening, transcript]);

  // ── Keyboard shortcut: Ctrl+Shift+V to toggle voice ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "V") {
        e.preventDefault();
        handleClick();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, language, isSpeaking]);

  // ---- Click handler (with barge-in support) ----
  const lastContextHintRef = useRef<string | null>(null);
  const handleClick = () => {
    // While TTS is playing: barge-in — stop speaking and start listening
    if (state === "speaking" || isSpeaking) {
      stopSpeaking();
      setState("listening");
      startListening(RECOGNITION_LOCALE[language] ?? "en-US");
      return;
    }
    // During processing: cancel in-flight API request
    if (state === "processing") {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setState("idle");
      setSystemStatus("Cancelled.");
      setTimeout(() => setSystemStatus(null), 2000);
      return;
    }
    if (state === "listening") {
      stopListening();
      return;
    }
    if (state !== "idle") return;

    setState("listening");
    startListening(RECOGNITION_LOCALE[language] ?? "en-US");
    playStartListening();
    hapticStartListening();

    // Contextual hint on first activation per page
    const hint = getPageContextHint(pathname);
    if (hint && hint !== lastContextHintRef.current) {
      lastContextHintRef.current = hint;
      setSystemStatus(hint);
      // Clear after a few seconds
      setTimeout(() => setSystemStatus((prev) => prev === hint ? null : prev), 4000);
    }
  };

  // ---- Right-click handler: force-stop everything immediately ----
  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Abort any in-flight API request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Stop speech recognition
    stopListening();
    // Stop TTS
    stopSpeaking();
    // Feedback
    playError();
    hapticError();
    // Reset to idle
    setState("idle");
    setFollowUps([]);
    setLiveTranscript("Stopped.");
    setTimeout(() => setLiveTranscript(null), 1500);
    setSystemStatus(null);
  };

  // ---- Render icon based on state (use AudioVisualizer when listening, AssistantAvatar otherwise) ----
  const icon = (() => {
    switch (state) {
      case "listening":
        return <AudioVisualizer active={true} bars={5} />;
      case "processing":
        return <AssistantAvatar state="processing" size={32} />;
      case "speaking":
        return <AssistantAvatar state="speaking" size={32} />;
      case "guiding":
        return <AssistantAvatar state="guiding" size={32} />;
      default:
        return <AssistantAvatar state="idle" size={32} />;
    }
  })();

  const stateColors: Record<AssistantState, string> = {
    idle: "from-blue-500/80 to-indigo-600/80",
    listening: "from-red-500/80 to-pink-600/80",
    processing: "from-amber-500/80 to-orange-600/80",
    speaking: "from-green-500/80 to-emerald-600/80",
    guiding: "from-purple-500/80 to-violet-600/80",
  };

  const ringColors: Record<AssistantState, string> = {
    idle: "ring-blue-400/30",
    listening: "ring-red-400/50",
    processing: "ring-amber-400/30",
    speaking: "ring-green-400/30",
    guiding: "ring-purple-400/30",
  };

  // Mic is disabled when TTS is in progress (loading or playing) — processing is now cancellable
  const micDisabled = isSpeaking;

  if (!micSupported) return null;

  return (
    <>
      {/* ── Offline indicator ── */}
      {isOffline && (
        <div className="fixed bottom-[8rem] right-6 z-[9999] px-3 py-1.5 rounded-full text-xs font-medium text-amber-200 bg-amber-900/80 backdrop-blur-sm border border-amber-700/50 animate-pulse">
          Offline — quick commands only
        </div>
      )}

      {/* ── Voice Picker Popover ── */}
      {showVoicePicker && (
        <div className="fixed z-[10000] w-64 max-h-52 overflow-y-auto rounded-xl bg-gray-900/95 backdrop-blur-xl border border-white/10 shadow-2xl p-2 animate-in fade-in slide-in-from-bottom-3 duration-200"
          style={{ bottom: "calc(3.25rem + 2.3rem - 1rem + 2.25rem)", right: "calc(3.25rem + 2.3rem - 1rem)" }}
        >
          <div className="flex items-center justify-between px-2 pb-2 border-b border-white/10">
            <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">Select Voice</span>
            <button
              onClick={() => setShowVoicePicker(false)}
              className="text-white/50 hover:text-white text-xs"
              aria-label="Close voice picker"
            >
              ✕
            </button>
          </div>
          <div className="mt-1 space-y-0.5">
            {getAvailableVoices()
              .filter((v) => v.lang.startsWith("en") || v.lang.includes("hi"))
              .slice(0, 20)
              .map((voice) => (
                <button
                  key={voice.name}
                  onClick={() => {
                    setVoicePreference(voice.name);
                    setShowVoicePicker(false);
                    toast({ title: "Voice Changed", description: voice.name });
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                    selectedVoiceName === voice.name
                      ? "bg-blue-600/40 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <div className="font-medium truncate">{voice.name}</div>
                  <div className="text-[10px] text-white/40">{voice.lang}</div>
                </button>
              ))}
          </div>

          {/* ── Speed & Pitch sliders ── */}
          <div className="mt-2 pt-2 border-t border-white/10 space-y-2 px-1">
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-white/50">Speed</span>
                <span className="text-[10px] text-white/70 font-mono">{ttsSpeed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={ttsSpeed}
                onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:appearance-none"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-white/50">Pitch</span>
                <span className="text-[10px] text-white/70 font-mono">{ttsPitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={ttsPitch}
                onChange={(e) => setTtsPitch(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:appearance-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Orbital satellite buttons on a circular orbit around the main bubble ──
           Bubble center: bottom 3.25rem, right 3.25rem (1.5rem margin + 1.75rem half of 3.5rem)
           Orbit radius: 2.75rem from center
           Voice picker:  225° on unit circle → upper-left  (cos225 ≈ -0.707, sin225 ≈ -0.707)
           Language:      270° on unit circle → directly above (cos270 = 0, sin270 = -1)
           Satellite size: w-8 h-8 = 2rem, half = 1rem
      ── */}

      {/* Voice Picker — 225° orbit (upper-left of bubble) */}
      <button
        onClick={() => setShowVoicePicker((v) => !v)}
        aria-label="Select voice"
        title="Change TTS voice"
        className="
          fixed z-[9999]
          w-8 h-8 rounded-full
          flex items-center justify-center
          text-white/60
          bg-gradient-to-br from-gray-700/70 to-gray-900/70
          backdrop-blur-xl
          border border-white/15
          shadow-lg
          hover:scale-110 hover:text-white hover:border-blue-400/60 hover:shadow-[0_0_12px_2px_rgba(96,165,250,0.35)]
          active:scale-95
          transition-all duration-200
        "
        style={{
          bottom: "calc(3.25rem + 2.3rem - 1rem)",
          right:  "calc(3.25rem + 2.3rem - 1rem)",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>

      {/* Language Toggle — 270° orbit (directly above bubble) */}
      <button
        onClick={toggleLanguage}
        aria-label={`Switch language (current: ${LANG_LABELS[language] || language})`}
        className="
          fixed z-[9999]
          w-8 h-8 rounded-full
          flex items-center justify-center
          text-[11px] font-bold text-white/80
          bg-gradient-to-br from-gray-600/70 to-gray-800/70
          backdrop-blur-xl
          border border-white/15
          shadow-lg
          hover:scale-110 hover:text-white hover:border-indigo-400/60 hover:shadow-[0_0_12px_2px_rgba(129,140,248,0.35)]
          active:scale-95
          transition-all duration-200
        "
        style={{
          bottom: "calc(3.25rem + 3.25rem - 1rem)",
          right:  "calc(3.25rem - 1rem)",
        }}
      >
        {LANG_LABELS[language] || language}
      </button>

      {/* ── Floating Bubble ── */}
      <button
        ref={bubbleRef}
        onClick={handleClick}
        onContextMenu={handleRightClick}
        role="button"
        aria-label={
          state === "idle"
            ? "Activate voice assistant (Ctrl+Shift+V)"
            : state === "listening"
            ? "Listening to your voice — click to stop"
            : state === "speaking"
            ? "Speaking response — click to stop"
            : state === "processing"
            ? "Processing — click to cancel"
            : "Processing your request"
        }
        aria-busy={isSpeaking || state === "processing"}
        aria-live="polite"
        title={
          state === "idle"
            ? "Click to speak (Ctrl+Shift+V)"
            : state === "listening"
            ? "Listening… click to stop"
            : state === "speaking"
            ? "Speaking… click to stop"
            : state === "processing"
            ? "Processing… click to cancel"
            : "Processing…"
        }
        className={`
          fixed bottom-6 right-6 z-[9999]
          w-14 h-14 rounded-full
          flex items-center justify-center
          text-white shadow-xl
          bg-gradient-to-br ${stateColors[state]}
          backdrop-blur-xl border border-white/20
          ring-4 ${ringColors[state]}
          hover:scale-105 active:scale-95
          focus:outline-none focus-visible:ring-2 focus-visible:ring-white
          ${bubbleAnimating ? "transition-transform duration-700 ease-[cubic-bezier(.34,1.56,.64,1)]" : "transition-all duration-300"}
          ${state === "listening" ? "animate-pulse" : ""}
          ${isSpeaking ? "animate-pulse" : ""}
          ${micDisabled && state !== "speaking" ? "opacity-60 cursor-not-allowed" : ""}
        `}
        style={
          bubbleAnimating
            ? { transform: `translate(${bubbleOffset.x}px, ${bubbleOffset.y}px)` }
            : undefined
        }
      >
        {icon}
      </button>

      {/* ── Live transcript tooltip (shown while listening) ── */}
      {liveTranscript && (state === "listening" || state === "processing") && (
        <div
          className="fixed bottom-24 right-6 z-[9999] max-w-xs p-3 rounded-xl text-sm text-white bg-black/60 backdrop-blur-md border border-white/10 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-xs font-medium uppercase tracking-wide">
              {state === "listening" ? "Listening" : "Processing"}
            </span>
          </div>
          <p className="mt-1 text-white/90 leading-snug">
            &quot;{liveTranscript.length > 120 ? liveTranscript.slice(0, 120) + "…" : liveTranscript}&quot;
          </p>
        </div>
      )}

      {/* ── System-status tooltip (only for system/ephemeral actions) ── */}
      {systemStatus && state === "speaking" && (
        <div className="fixed bottom-24 right-6 z-[9999] max-w-xs p-3 rounded-xl text-sm text-white bg-black/70 backdrop-blur-md border border-white/10 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2">
            {isSpeaking ? (
              <span className="inline-flex items-center gap-0.5">
                <span className="w-0.5 h-3 bg-green-400 rounded-full animate-[pulse_0.6s_ease-in-out_infinite]" />
                <span className="w-0.5 h-4 bg-green-400 rounded-full animate-[pulse_0.6s_ease-in-out_0.15s_infinite]" />
                <span className="w-0.5 h-2 bg-green-400 rounded-full animate-[pulse_0.6s_ease-in-out_0.3s_infinite]" />
              </span>
            ) : null}
            <span>{systemStatus.length > 160 ? systemStatus.slice(0, 160) + "…" : systemStatus}</span>
          </div>
        </div>
      )}

      {/* ── Follow-up suggestion pills ── */}
      {followUps.length > 0 && state === "idle" && (
        <div className="fixed bottom-36 right-6 z-[9999] flex flex-col gap-2 items-end animate-in fade-in slide-in-from-bottom-2 duration-300">
          <span className="text-[10px] text-blue-300 font-semibold uppercase tracking-wider mr-1">Follow up</span>
          {followUps.map((fu, i) => (
            <button
              key={i}
              onClick={() => {
                setFollowUps([]);
                handleTranscript(fu);
              }}
              className="
                max-w-[180px] px-3.5 py-1.5 rounded-full text-xs font-semibold
                text-white bg-blue-600/80 backdrop-blur-md
                border border-blue-400/50
                shadow-[0_0_8px_1px_rgba(59,130,246,0.3)]
                hover:bg-blue-500/90 hover:border-blue-300/70 hover:shadow-[0_0_14px_3px_rgba(59,130,246,0.5)]
                hover:max-w-[320px] hover:scale-105 hover:z-[10001]
                active:scale-95
                transition-all duration-200 ease-out
                truncate text-right
              "
              title={fu}
            >
              {fu}
            </button>
          ))}
        </div>
      )}

      {/* ── Highlight Overlay ── */}
      <AssistantOverlay
        targetId={highlightTarget}
        visible={highlightVisible}
        label={highlightLabel}
        onDismiss={() => setHighlightVisible(false)}
      />

    </>
  );
}
