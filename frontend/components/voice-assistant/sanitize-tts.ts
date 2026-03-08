// ─── sanitizeTTS: Fix pronunciation of Indian financial terms ───
// Replaces abbreviations and symbols the browser TTS engine
// mispronounces with phonetically correct expansions.

const TTS_REPLACEMENTS: [RegExp, string][] = [
  // Currency
  [/₹\s*/g, "rupees "],
  [/Rs\.?\s*/gi, "rupees "],
  [/INR\s*/g, "Indian rupees "],

  // Tax sections
  [/\bsection\s*80C\b/gi, "Section eighty C"],
  [/\bsection\s*80D\b/gi, "Section eighty D"],
  [/\bsection\s*80E\b/gi, "Section eighty E"],
  [/\bsection\s*80G\b/gi, "Section eighty G"],
  [/\bsection\s*80TTA\b/gi, "Section eighty T T A"],
  [/\b80C\b/g, "eighty C"],
  [/\b80D\b/g, "eighty D"],
  [/\b80E\b/g, "eighty E"],
  [/\b80G\b/g, "eighty G"],

  // Financial acronyms → expanded
  [/\bELSS\b/g, "E L S S fund"],
  [/\bNPS\b/g, "National Pension Scheme"],
  [/\bPPF\b/g, "Public Provident Fund"],
  [/\bEPF\b/g, "Employee Provident Fund"],
  [/\bGST\b/g, "G S T"],
  [/\bTDS\b/g, "T D S"],
  [/\bTCS\b/g, "T C S"],
  [/\bITR\b/g, "I T R"],
  [/\bHRA\b/g, "H R A"],
  [/\bLTA\b/g, "L T A"],
  [/\bSIP\b/g, "S I P"],
  [/\bULIP\b/g, "U L I P"],
  [/\bRBI\b/g, "R B I"],
  [/\bSEBI\b/g, "S E B I"],
  [/\bPMAY\b/g, "P M A Y"],
  [/\bPM-KISAN\b/gi, "P M Kisan"],
  [/\bFD\b/g, "fixed deposit"],
  [/\bRD\b/g, "recurring deposit"],
  [/\bEMI\b/g, "E M I"],
  [/\bNAV\b/g, "N A V"],
  [/\bGDP\b/g, "G D P"],
  [/\bAY\b/g, "assessment year"],
  [/\bFY\b/g, "financial year"],

  // Numeric shortcuts
  [/(\d+)\s*(?:lakh|lac|lacs)\b/gi, "$1 lakh"],
  [/(\d+)\s*(?:cr|crore|crores)\b/gi, "$1 crore"],

  // Percentage symbol
  [/%/g, " percent"],

  // Common mispronunciations
  [/\bw\.e\.f\.?\b/gi, "with effect from"],
  [/\bp\.a\.?\b/gi, "per annum"],
  [/\bvs\.?\b/gi, "versus"],
  [/\be\.g\.?\b/gi, "for example"],
  [/\bi\.e\.?\b/gi, "that is"],
];

/**
 * Clean text for the SpeechSynthesis engine so that Indian
 * financial terms are pronounced naturally.
 */
export function sanitizeForTTS(text: string): string {
  let cleaned = text;
  for (const [pattern, replacement] of TTS_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  // Collapse multiple spaces
  return cleaned.replace(/\s{2,}/g, " ").trim();
}
