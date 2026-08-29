export const CONVERSATION_VIBES = [
  { key: "neutral", label: "Neutral", emoji: "😐" },
  { key: "happy", label: "Happy", emoji: "😊" },
  { key: "angry", label: "Angry", emoji: "😠" },
  { key: "sad", label: "Sad", emoji: "😢" },
  { key: "romantic", label: "Romantic", emoji: "❤️" },
  { key: "playful", label: "Playful", emoji: "😜" },
  { key: "excited", label: "Excited", emoji: "🥳" },
  { key: "calm", label: "Calm", emoji: "😌" },
  { key: "focused", label: "Focused", emoji: "🎯" },
  { key: "celebration", label: "Celebration", emoji: "🎉" },
  { key: "flirty", label: "Flirty", emoji: "😉" },
  { key: "serious", label: "Serious", emoji: "🧠" },
  { key: "work", label: "Work", emoji: "💼" },
  { key: "special", label: "Special", emoji: "✨" },
];

export const vibeClassName = (key) => `conversation-vibe vibe-${key || "neutral"}`;

export const getVibeMeta = (key) =>
  CONVERSATION_VIBES.find((vibe) => vibe.key === key) || CONVERSATION_VIBES[0];
