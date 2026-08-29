export const RELATIONSHIP_TYPES = [
  { key: "close-friend", label: "Close Friend", emoji: "❤️" },
  { key: "family", label: "Family", emoji: "👨‍👩‍👧" },
  { key: "partner", label: "Partner", emoji: "💕" },
  { key: "work", label: "Work", emoji: "💼" },
  { key: "study", label: "Study", emoji: "🎓" },
  { key: "gaming", label: "Gaming", emoji: "🎮" },
  { key: "travel", label: "Travel", emoji: "✈️" },
  { key: "custom", label: "Custom", emoji: "✨" },
];

export const CONVERSATION_MODES = [
  { key: "just-talk", label: "Just Talk", emoji: "💬" },
  { key: "comfort", label: "Comfort Me", emoji: "🫂" },
  { key: "listen", label: "Just Listen", emoji: "👂" },
  { key: "advice", label: "Give Me Advice", emoji: "🧠" },
  { key: "laugh", label: "Make Me Laugh", emoji: "😂" },
  { key: "debate", label: "Debate", emoji: "🔥" },
  { key: "reply-later", label: "Reply Later", emoji: "⏳" },
  { key: "quiet", label: "Quiet", emoji: "🤫" },
];

export const AVAILABILITY_OPTIONS = [
  { key: "quiet", label: "Quiet", emoji: "🤫" },
  { key: "busy", label: "Busy", emoji: "💼" },
  { key: "away", label: "Away", emoji: "🌙" },
  { key: "reply-later", label: "Reply later", emoji: "⏳" },
];

export const REACTIONS = [
  { key: "feel", label: "I feel this", emoji: "❤️" },
  { key: "here", label: "I'm here", emoji: "🫂" },
  { key: "more", label: "Tell me more", emoji: "👀" },
  { key: "laugh", label: "Made me laugh", emoji: "😂" },
  { key: "think", label: "Let me think", emoji: "🧠" },
  { key: "got-it", label: "Got it", emoji: "👍" },
  { key: "thanks", label: "Thank you", emoji: "🙏" },
];

export const MEMORY_TYPES = [
  { key: "trip", label: "Trip", emoji: "🌴" },
  { key: "birthday", label: "Birthday", emoji: "🎂" },
  { key: "achievement", label: "Achievement", emoji: "🏆" },
  { key: "celebration", label: "Celebration", emoji: "🎉" },
  { key: "joke", label: "Inside Joke", emoji: "😂" },
  { key: "memory", label: "Memory", emoji: "❤️" },
  { key: "custom", label: "Custom", emoji: "✨" },
];

export const RITUALS = [
  { key: "morning", label: "Morning Check-in", prompt: "How are you feeling today?", emoji: "☀️" },
  { key: "night", label: "Night Check-in", prompt: "What was the best part of your day?", emoji: "🌙" },
  { key: "weekly", label: "Weekly Question", prompt: "What should we do together next weekend?", emoji: "💕" },
];

export const WALLPAPERS = [
  { key: "default", label: "Default" },
  { key: "minimal", label: "Minimal" },
  { key: "soft", label: "Soft" },
  { key: "dark", label: "Dark" },
];

export const BUBBLE_STYLES = [
  { key: "classic", label: "Classic" },
  { key: "rounded", label: "Rounded" },
  { key: "compact", label: "Compact" },
];

export const findMeta = (list, key) => list.find((item) => item.key === key) || null;

export const wallpaperClass = (key) => ({
  default: "",
  minimal: "bg-base-200",
  soft: "bg-base-200/80",
  dark: "bg-neutral text-neutral-content",
}[key] || "");

export const bubbleClass = (key, mine) => {
  const shape = {
    classic: mine ? "rounded-lg rounded-br-none" : "rounded-lg rounded-bl-none",
    rounded: "rounded-2xl",
    compact: mine ? "rounded-md rounded-br-none py-1" : "rounded-md rounded-bl-none py-1",
  }[key] || (mine ? "rounded-lg rounded-br-none" : "rounded-lg rounded-bl-none");
  return shape;
};

export const UNTIL_PRESETS = [
  { key: "30m", label: "30 minutes" },
  { key: "1h", label: "1 hour" },
  { key: "2h", label: "2 hours" },
  { key: "tonight", label: "Tonight" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "clear", label: "Until cleared" },
];

export const untilFromPreset = (key) => {
  if (!key || key === "clear") return null;
  const date = new Date();
  if (key === "30m") date.setMinutes(date.getMinutes() + 30);
  else if (key === "1h") date.setHours(date.getHours() + 1);
  else if (key === "2h") date.setHours(date.getHours() + 2);
  else if (key === "tonight") date.setHours(23, 59, 0, 0);
  else if (key === "tomorrow") {
    date.setDate(date.getDate() + 1);
    date.setHours(23, 59, 0, 0);
  }
  return date.toISOString();
};

export const isActiveUntil = (until) => !until || new Date(until) > new Date();

export const formatUntil = (until) => {
  if (!until) return "";
  return new Date(until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

export const formatAvailability = (availability) => {
  if (!availability?.key || !isActiveUntil(availability.until)) return null;
  const meta = findMeta(AVAILABILITY_OPTIONS, availability.key);
  if (!meta) return null;
  return availability.until ? `${meta.emoji} ${meta.label} until ${formatUntil(availability.until)}` : `${meta.emoji} ${meta.label}`;
};
