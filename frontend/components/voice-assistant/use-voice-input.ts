"use client";
// ─── useVoiceInput: Web Speech API hook for voice recognition ───
import { useState, useCallback, useRef } from "react";

// Extend Window type for SpeechRecognition
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as Record<string, SpeechRecognitionConstructor>)
      .SpeechRecognition ??
    (window as unknown as Record<string, SpeechRecognitionConstructor>)
      .webkitSpeechRecognition ??
    null
  );
}

export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string>("en");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported = typeof window !== "undefined" && getSpeechRecognition() !== null;

  /** Clear all fallback timers */
  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (maxWaitTimerRef.current) { clearTimeout(maxWaitTimerRef.current); maxWaitTimerRef.current = null; }
  }, []);

  const startListening = useCallback(
    (lang: string = "en-US") => {
      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) {
        setError("Speech recognition not supported in this browser.");
        return;
      }

      // Clean up any existing instance
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
      }
      clearTimers();

      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const result = event.results[event.resultIndex];
        const text = result[0]?.transcript ?? "";
        setTranscript(text);

        // Simple Hindi detection heuristic
        const hindiPattern = /[\u0900-\u097F]/;
        setDetectedLanguage(hindiPattern.test(text) ? "hi" : "en");

        // Reset silence timer: stop 3s after last result
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          try { recognition.stop(); } catch { /* ignore */ }
        }, 3000);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        clearTimers();
        if (event.error !== "no-speech" && event.error !== "aborted") {
          setError(`Speech error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        clearTimers();
        setIsListening(false);
      };

      // Auto-stop on silence (onspeechend)
      recognition.onspeechend = () => {
        recognition.stop();
      };

      setError(null);
      setTranscript("");
      setIsListening(true);
      recognition.start();

      // Max-wait timer: if no speech at all within 7s, force stop and reset
      maxWaitTimerRef.current = setTimeout(() => {
        clearTimers();
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch { /* ignore */ }
          recognitionRef.current = null;
        }
        setIsListening(false);
      }, 7000);
    },
    [clearTimers]
  );

  const stopListening = useCallback(() => {
    clearTimers();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, [clearTimers]);

  return {
    isListening,
    transcript,
    error,
    detectedLanguage,
    isSupported,
    startListening,
    stopListening,
  };
}
