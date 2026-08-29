export const ALLOWED_MOODS = [
  "neutral", "happy", "calm", "playful", "angry", "sad", "romantic", "excited", "thoughtful", "tired",
  "professional", "sleepy",
];

export const ALLOWED_VIBES = [
  "neutral", "happy", "angry", "sad", "romantic", "playful", "excited", "calm", "focused", "celebration",
  "flirty", "serious", "work", "special",
];

export const RELATIONSHIP_TYPES = ["close-friend", "family", "partner", "work", "study", "gaming", "travel", "custom"];
export const CONVERSATION_MODES = ["just-talk", "comfort", "listen", "advice", "laugh", "debate", "reply-later", "quiet"];
export const AVAILABILITY_KEYS = ["quiet", "busy", "away", "reply-later"];
export const REACTION_KEYS = ["feel", "here", "more", "laugh", "think", "got-it", "thanks"];
export const MEMORY_TYPES = ["trip", "birthday", "achievement", "celebration", "joke", "memory", "custom"];
export const RITUAL_KEYS = ["morning", "night", "weekly"];
export const WALLPAPERS = ["default", "minimal", "soft", "dark"];
export const BUBBLE_STYLES = ["classic", "rounded", "compact"];

export const includesKey = (list, key) => list.includes(String(key || "").trim().toLowerCase());
