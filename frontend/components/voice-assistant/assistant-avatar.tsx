// ─── AssistantAvatar: Animated SVG character with 4 states ──────
// States: idle (breathing), listening (ear cupped), thinking (dots), speaking (mouth)
// Pure SVG + CSS keyframe animations — no external files needed.
// Replaces static icons inside the main bubble for a lively personality.

"use client";

import type { AssistantState } from "./types";

interface AvatarProps {
  state: AssistantState;
  size?: number;
}

export function AssistantAvatar({ state, size = 32 }: AvatarProps) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="select-none"
      aria-hidden="true"
    >
      {/* ── Face circle ── */}
      <circle
        cx={cx}
        cy={cy}
        r={s * 0.4}
        fill="currentColor"
        className={`
          text-white/20
          ${state === "idle" ? "animate-[breathe_3s_ease-in-out_infinite]" : ""}
          ${state === "listening" ? "animate-[pulse-glow_1.5s_ease-in-out_infinite]" : ""}
          ${state === "processing" ? "animate-[spin-slow_2s_linear_infinite]" : ""}
        `}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />

      {/* ── Eyes ── */}
      {state !== "processing" && (
        <>
          <circle cx={cx - s * 0.11} cy={cy - s * 0.06} r={s * 0.04} fill="white" className={state === "listening" ? "animate-[blink_3s_ease-in-out_infinite]" : ""} />
          <circle cx={cx + s * 0.11} cy={cy - s * 0.06} r={s * 0.04} fill="white" className={state === "listening" ? "animate-[blink_3s_ease-in-out_infinite_0.15s]" : ""} />
        </>
      )}

      {/* ── Idle: small smile ── */}
      {state === "idle" && (
        <path
          d={`M ${cx - s * 0.1} ${cy + s * 0.08} Q ${cx} ${cy + s * 0.17} ${cx + s * 0.1} ${cy + s * 0.08}`}
          stroke="white"
          strokeWidth={s * 0.03}
          strokeLinecap="round"
          fill="none"
        />
      )}

      {/* ── Listening: open circle mouth (surprised) + ear lines ── */}
      {state === "listening" && (
        <>
          <circle cx={cx} cy={cy + s * 0.1} r={s * 0.05} fill="white" className="animate-[pulse_1s_ease-in-out_infinite]" />
          {/* Sound wave arcs on left side */}
          <path
            d={`M ${cx - s * 0.32} ${cy - s * 0.1} Q ${cx - s * 0.42} ${cy} ${cx - s * 0.32} ${cy + s * 0.1}`}
            stroke="white"
            strokeWidth={s * 0.02}
            strokeLinecap="round"
            fill="none"
            className="animate-[fade-wave_1s_ease-in-out_infinite]"
            opacity="0.6"
          />
          <path
            d={`M ${cx - s * 0.37} ${cy - s * 0.15} Q ${cx - s * 0.50} ${cy} ${cx - s * 0.37} ${cy + s * 0.15}`}
            stroke="white"
            strokeWidth={s * 0.02}
            strokeLinecap="round"
            fill="none"
            className="animate-[fade-wave_1s_ease-in-out_infinite_0.3s]"
            opacity="0.4"
          />
        </>
      )}

      {/* ── Processing: three bouncing dots ── */}
      {state === "processing" && (
        <>
          <circle cx={cx - s * 0.1} cy={cy} r={s * 0.04} fill="white" className="animate-[bounce-dot_0.8s_ease-in-out_infinite]" />
          <circle cx={cx} cy={cy} r={s * 0.04} fill="white" className="animate-[bounce-dot_0.8s_ease-in-out_infinite_0.15s]" />
          <circle cx={cx + s * 0.1} cy={cy} r={s * 0.04} fill="white" className="animate-[bounce-dot_0.8s_ease-in-out_infinite_0.3s]" />
        </>
      )}

      {/* ── Speaking: animated mouth opening/closing ── */}
      {state === "speaking" && (
        <ellipse
          cx={cx}
          cy={cy + s * 0.09}
          rx={s * 0.08}
          ry={s * 0.04}
          fill="white"
          className="animate-[speak-mouth_0.4s_ease-in-out_infinite_alternate]"
          style={{ transformOrigin: `${cx}px ${cy + s * 0.09}px` }}
        />
      )}

      {/* ── Guiding: same as speaking but with a pointer arrow ── */}
      {state === "guiding" && (
        <>
          <ellipse cx={cx} cy={cy + s * 0.09} rx={s * 0.08} ry={s * 0.04} fill="white" className="animate-[speak-mouth_0.4s_ease-in-out_infinite_alternate]" style={{ transformOrigin: `${cx}px ${cy + s * 0.09}px` }} />
          <path
            d={`M ${cx + s * 0.25} ${cy - s * 0.15} L ${cx + s * 0.38} ${cy - s * 0.28} L ${cx + s * 0.32} ${cy - s * 0.15} Z`}
            fill="white"
            opacity="0.7"
            className="animate-[bounce_1s_ease-in-out_infinite]"
          />
        </>
      )}

      {/* ── Keyframe styles (injected via <style> tag inside SVG) ── */}
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @keyframes pulse-glow {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 1; }
        }
        @keyframes spin-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes blink {
          0%, 90%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.1); }
        }
        @keyframes bounce-dot {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes speak-mouth {
          0% { transform: scaleY(1); }
          100% { transform: scaleY(2.2); }
        }
        @keyframes fade-wave {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </svg>
  );
}
