// ─── Haptic Feedback: vibration patterns for mobile browsers ────
// Uses navigator.vibrate() — safely no-ops on unsupported browsers.
// Patterns: [vibrate_ms, pause_ms, vibrate_ms, ...]

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Silently ignore — vibration API may be blocked by permissions policy
  }
}

/** Single short pulse — start listening */
export function hapticStartListening() {
  vibrate(50);
}

/** Double pulse — response ready */
export function hapticResponseReady() {
  vibrate([50, 50, 50]);
}

/** Long pulse — error */
export function hapticError() {
  vibrate(200);
}

/** Tiny tap — button press / quick command */
export function hapticTap() {
  vibrate(25);
}

/** Triple quick pulse — export/summary complete */
export function hapticSuccess() {
  vibrate([30, 30, 30, 30, 60]);
}
