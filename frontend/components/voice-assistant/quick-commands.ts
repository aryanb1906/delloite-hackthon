// ─── Quick Commands: local regex-based shortcuts ────────────────
// These commands are resolved entirely client-side without hitting
// the LLM. They produce an immediate action + spoken confirmation.

export interface QuickCommandResult {
  /** Spoken reply to the user */
  reply: string;
  /** Optional navigation target */
  navigateTo?: string;
  /** Optional client-side action */
  clientAction?: "new_chat" | "toggle_language" | "stop" | "read_page" | "summarize" | "export";
  /** Language for the reply */
  lang?: string;
}

interface QuickCommand {
  pattern: RegExp;
  handler: (match: RegExpMatchArray) => QuickCommandResult;
}

const COMMANDS: QuickCommand[] = [
  // ── Navigation ──
  {
    pattern: /^(?:go\s+(?:to\s+)?home|होम\s*(?:पेज)?|home\s*page|गृह\s*पृष्ठ)$/i,
    handler: () => ({
      reply: "Taking you home.",
      navigateTo: "/",
    }),
  },
  {
    pattern: /^(?:go\s+(?:to\s+)?chat|open\s+chat|चैट\s*(?:खोलो|पेज)?|chat\s*page)$/i,
    handler: () => ({
      reply: "Opening chat.",
      navigateTo: "/chat",
    }),
  },
  {
    pattern: /^(?:go\s+(?:to\s+)?(?:tax\s*)?calculator|open\s+calculator|कैलकुलेटर\s*(?:खोलो)?|tax\s*calc)$/i,
    handler: () => ({
      reply: "Opening the tax calculator.",
      navigateTo: "/tax-calculator",
    }),
  },
  {
    pattern: /^(?:go\s+(?:to\s+)?analytics|open\s+analytics|एनालिटिक्स\s*(?:खोलो)?|analytics\s*page|show\s+analytics)$/i,
    handler: () => ({
      reply: "Opening analytics.",
      navigateTo: "/analytics",
    }),
  },
  {
    pattern: /^(?:go\s+(?:to\s+)?settings|open\s+settings|सेटिंग्स?\s*(?:खोलो)?|settings\s*page)$/i,
    handler: () => ({
      reply: "Opening settings.",
      navigateTo: "/settings",
    }),
  },
  {
    pattern: /^(?:go\s+(?:to\s+)?profile|open\s+profile|प्रोफाइल\s*(?:खोलो)?|profile\s*setup)$/i,
    handler: () => ({
      reply: "Opening profile setup.",
      navigateTo: "/profile-setup",
    }),
  },

  // ── Chat actions ──
  {
    pattern: /^(?:new\s+chat|start\s+(?:a\s+)?new\s+chat|नया\s*चैट|naya\s*chat)$/i,
    handler: () => ({
      reply: "Starting a new chat.",
      clientAction: "new_chat",
      navigateTo: "/chat",
    }),
  },

  // ── Voice controls ──
  {
    pattern: /^(?:stop|रुको|ruko|cancel|बंद\s*करो|band\s*karo|shut\s*up|chup)$/i,
    handler: () => ({
      reply: "",
      clientAction: "stop",
    }),
  },
  {
    pattern: /^(?:switch\s+(?:to\s+)?hindi|हिंदी\s*(?:में\s*)?(?:बोलो|बात\s*करो)?|hindi\s*(?:mein|me)\s*(?:bolo|baat\s*karo)?)$/i,
    handler: () => ({
      reply: "भाषा हिंदी में बदल दी गई है।",
      clientAction: "toggle_language",
      lang: "hi",
    }),
  },
  {
    pattern: /^(?:switch\s+(?:to\s+)?english|अंग्रेजी\s*(?:में\s*)?(?:बोलो)?|english\s*(?:mein|me)\s*bolo)$/i,
    handler: () => ({
      reply: "Switched to English.",
      clientAction: "toggle_language",
      lang: "en",
    }),
  },

  // ── Read page content ──
  {
    pattern: /^(?:read\s+(?:this|page|screen)|यह\s*पढ़ो|ye\s*padho|what(?:'s|\s+is)\s+on\s+(?:the\s+)?screen)$/i,
    handler: () => ({
      reply: "Reading the page for you.",
      clientAction: "read_page",
    }),
  },

  // ── Conversation summary ──
  {
    pattern: /^(?:summarize|summarise|summary|conversation\s+summary|सारांश|saaransh|wrap\s*up)$/i,
    handler: () => ({
      reply: "Generating a summary of our conversation.",
      clientAction: "summarize",
    }),
  },

  // ── Export conversation ──
  {
    pattern: /^(?:export|export\s+(?:this\s+)?conversation|download\s+(?:this\s+)?conversation|save\s+transcript|निर्यात)$/i,
    handler: () => ({
      reply: "Exporting the conversation.",
      clientAction: "export",
    }),
  },
];

/**
 * Try to match user text against local quick commands.
 * Returns a result if matched, or null if the text should be
 * forwarded to the LLM backend.
 */
export function matchQuickCommand(text: string): QuickCommandResult | null {
  const trimmed = text.trim();
  for (const cmd of COMMANDS) {
    const m = trimmed.match(cmd.pattern);
    if (m) return cmd.handler(m);
  }
  return null;
}
