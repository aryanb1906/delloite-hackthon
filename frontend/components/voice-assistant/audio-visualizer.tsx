"use client";
// ─── AudioVisualizer: real-time mic waveform bars ───────────────
// Uses Web Audio API AnalyserNode to drive animated bars that react
// to the user's voice volume while listening.

import { useEffect, useRef, useState } from "react";

const BAR_COUNT = 5;
const FFT_SIZE = 256;

interface AudioVisualizerProps {
  /** true while the mic is actively listening */
  active: boolean;
  /** Number of bars (default 5) */
  bars?: number;
  /** CSS class for the container */
  className?: string;
}

export function AudioVisualizer({
  active,
  bars = BAR_COUNT,
  className = "",
}: AudioVisualizerProps) {
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: bars }, () => 0.08)
  );
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      // Cleanup when not active
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
      setLevels(Array.from({ length: bars }, () => 0.08));
      return;
    }

    let cancelled = false;

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const audioCtx = new AudioContext();
        ctxRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.7;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        sourceRef.current = source;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function tick() {
          if (cancelled) return;
          analyser.getByteFrequencyData(dataArray);

          // Sample evenly across the frequency bins
          const step = Math.floor(dataArray.length / bars);
          const newLevels: number[] = [];
          for (let i = 0; i < bars; i++) {
            const idx = i * step;
            // Normalize 0-255 → 0.08-1 (minimum height so bars are always visible)
            const raw = dataArray[idx] / 255;
            newLevels.push(Math.max(0.08, raw));
          }
          setLevels(newLevels);
          rafRef.current = requestAnimationFrame(tick);
        }

        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // getUserMedia denied or unavailable — just show idle bars
        setLevels(Array.from({ length: bars }, () => 0.08));
      }
    }

    setup();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, [active, bars]);

  return (
    <div
      className={`flex items-end gap-[3px] h-6 ${className}`}
      aria-hidden="true"
    >
      {levels.map((level, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-white/90 transition-[height] duration-75"
          style={{ height: `${level * 24}px` }}
        />
      ))}
    </div>
  );
}
