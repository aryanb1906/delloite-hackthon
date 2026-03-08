"use client";
// ─── useVoiceSpeech: Browser-native SpeechSynthesis TTS hook ───
// Features:
// - Voice selection (user preference stored in localStorage)
// - Sentence-by-sentence streaming TTS for faster perceived response
// - Pronunciation sanitization for Indian financial terms
// - Interrupt support (cancel mid-speech)

import { useState, useCallback, useRef, useEffect } from "react";
import { sanitizeForTTS } from "./sanitize-tts";

const VOICE_PREF_KEY = "arth_tts_voice_pref";
const SPEED_PREF_KEY = "arth_tts_speed";
const PITCH_PREF_KEY = "arth_tts_pitch";

/** Preferred voices by language (checked in priority order) */
const PREFERRED_VOICES: Record<string, string[]> = {
  en: ["Microsoft Aria", "Microsoft Jenny", "Microsoft Guy"],
  hi: ["Microsoft Heera", "Microsoft Swara", "Microsoft Kalpana", "Google हिन्दी"],
};

/** Check whether a voice's language matches the requested language bucket */
function voiceMatchesLang(voice: SpeechSynthesisVoice, lang: string): boolean {
  if (lang === "hi") return voice.lang.includes("hi");
  // en, en-IN, en-US etc.
  return voice.lang.startsWith("en");
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: string = "en",
  userPref?: string | null
): SpeechSynthesisVoice | null {
  // 1. User's saved preference — only if it matches the current language
  if (userPref) {
    const prefMatch = voices.find((v) => v.name === userPref);
    if (prefMatch && voiceMatchesLang(prefMatch, lang)) return prefMatch;
  }

  if (lang === "hi") {
    const hiPreferred = PREFERRED_VOICES.hi;
    for (const name of hiPreferred) {
      const match = voices.find((v) => v.name.includes(name));
      if (match) return match;
    }
    const hiVoice = voices.find((v) => v.lang.includes("hi"));
    if (hiVoice) return hiVoice;
    return voices[0] ?? null;
  }

  // ── English path ──
  const enPreferred = PREFERRED_VOICES.en;
  for (const name of enPreferred) {
    const match = voices.find((v) => v.name.includes(name));
    if (match) return match;
  }
  const enVoice = voices.find((v) => v.lang.startsWith("en"));
  if (enVoice) return enVoice;
  return voices[0] ?? null;
}

/** Split text into sentences for streaming TTS */
function splitSentences(text: string): string[] {
  // Split on period, exclamation, question mark, or semicolon followed by space
  const parts = text.split(/(?<=[.!?;।])\s+/);
  return parts.filter((s) => s.trim().length > 0);
}

export function useVoiceSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const sentenceQueueRef = useRef<string[]>([]);
  const cancelledRef = useRef(false);

  // Voice preference
  const [selectedVoiceName, setSelectedVoiceName] = useState<string | null>(null);
  // Speed & pitch preferences
  const [ttsSpeed, setTtsSpeedState] = useState<number>(1);
  const [ttsPitch, setTtsPitchState] = useState<number>(1);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Load available voices on mount + load user preference
  useEffect(() => {
    if (!isSupported) return;

    // Load saved voice preference
    try {
      const saved = localStorage.getItem(VOICE_PREF_KEY);
      if (saved) setSelectedVoiceName(saved);
      const savedSpeed = localStorage.getItem(SPEED_PREF_KEY);
      if (savedSpeed) setTtsSpeedState(parseFloat(savedSpeed));
      const savedPitch = localStorage.getItem(PITCH_PREF_KEY);
      if (savedPitch) setTtsPitchState(parseFloat(savedPitch));
    } catch { /* ignore */ }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        voicesRef.current = voices;
      }
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, [isSupported]);

  /** Set user's preferred voice and persist */
  const setVoicePreference = useCallback((voiceName: string) => {
    setSelectedVoiceName(voiceName);
    try {
      localStorage.setItem(VOICE_PREF_KEY, voiceName);
    } catch { /* ignore */ }
  }, []);

  /** Set TTS speed and persist */
  const setTtsSpeed = useCallback((speed: number) => {
    const clamped = Math.max(0.5, Math.min(2, speed));
    setTtsSpeedState(clamped);
    try { localStorage.setItem(SPEED_PREF_KEY, String(clamped)); } catch { /* ignore */ }
  }, []);

  /** Set TTS pitch and persist */
  const setTtsPitch = useCallback((pitch: number) => {
    const clamped = Math.max(0.5, Math.min(2, pitch));
    setTtsPitchState(clamped);
    try { localStorage.setItem(PITCH_PREF_KEY, String(clamped)); } catch { /* ignore */ }
  }, []);

  /** Auto-select the best voice for the given language.
   *  Call this when the user toggles language so the TTS voice
   *  switches automatically without manual picker interaction. */
  const autoSelectVoiceForLanguage = useCallback((lang: string) => {
    let available = voicesRef.current;
    if (available.length === 0) {
      available = window.speechSynthesis.getVoices();
      if (available.length > 0) voicesRef.current = available;
    }
    const best = pickVoice(available, lang, null); // ignore user pref — pick best for lang
    if (best) {
      setSelectedVoiceName(best.name);
      // Don't persist — this is an auto-switch, not a manual preference
    }
  }, []);

  /** Get list of available voices for the voice picker UI */
  const getAvailableVoices = useCallback((): SpeechSynthesisVoice[] => {
    let available = voicesRef.current;
    if (available.length === 0) {
      available = window.speechSynthesis.getVoices();
      if (available.length > 0) voicesRef.current = available;
    }
    return available;
  }, []);

  /** Speak a single sentence and resolve when done */
  const speakSentence = useCallback(
    (text: string, lang: string): Promise<void> => {
      return new Promise<void>((resolve) => {
        if (cancelledRef.current || !text.trim()) {
          resolve();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(sanitizeForTTS(text));
        utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";

        let available = voicesRef.current;
        if (available.length === 0) {
          available = window.speechSynthesis.getVoices();
          if (available.length > 0) voicesRef.current = available;
        }
        const selectedVoice = pickVoice(available, lang, selectedVoiceName);
        if (selectedVoice) utterance.voice = selectedVoice;

        utterance.rate = ttsSpeed;
        utterance.pitch = ttsPitch;
        utterance.volume = 1;

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      });
    },
    [selectedVoiceName, ttsSpeed, ttsPitch]
  );

  /** Speak full text, sentence-by-sentence (streaming feel) */
  const speak = useCallback(
    async (text: string, lang: string = "en") => {
      if (!isSupported) return;

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      cancelledRef.current = false;

      if (!text || !text.trim()) return;

      const sentences = splitSentences(text);
      sentenceQueueRef.current = sentences;
      setIsSpeaking(true);

      for (const sentence of sentences) {
        if (cancelledRef.current) break;
        await speakSentence(sentence, lang);
      }

      sentenceQueueRef.current = [];
      if (!cancelledRef.current) {
        setIsSpeaking(false);
      }
    },
    [isSupported, speakSentence]
  );

  const stopSpeaking = useCallback(() => {
    cancelledRef.current = true;
    sentenceQueueRef.current = [];
    if (isSupported) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, [isSupported]);

  return {
    /** True while the browser is actively speaking */
    isSpeaking,
    speak,
    stopSpeaking,
    isSupported,
    /** Voice selection */
    selectedVoiceName,
    setVoicePreference,
    getAvailableVoices,
    autoSelectVoiceForLanguage,
    /** Speed & pitch */
    ttsSpeed,
    setTtsSpeed,
    ttsPitch,
    setTtsPitch,
  };
}
