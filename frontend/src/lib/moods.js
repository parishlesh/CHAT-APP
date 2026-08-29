export const MOOD_OPTIONS = [
  { id: "neutral", label: "Neutral", emoji: "😐" },
  { id: "happy", label: "Happy", emoji: "😊" },
  { id: "calm", label: "Calm", emoji: "😌" },
  { id: "playful", label: "Playful", emoji: "😂" },
  { id: "angry", label: "Angry", emoji: "😠" },
  { id: "sad", label: "Sad", emoji: "😢" },
  { id: "romantic", label: "Romantic", emoji: "😍" },
  { id: "excited", label: "Excited", emoji: "🔥" },
  { id: "thoughtful", label: "Thoughtful", emoji: "🤔" },
  { id: "tired", label: "Tired", emoji: "😴" },
];

const aliases = { professional: "thoughtful", sleepy: "tired" };

export const moodThemeMap = {
  happy: "cupcake",
  angry: "dracula",
  calm: "pastel",
  sad: "dim",
  playful: "lemonade",
  thoughtful: "corporate",
  professional: "corporate",
  excited: "synthwave",
  tired: "night",
  sleepy: "night",
  romantic: "valentine",
};

export const getMoodMeta = (mood) => {
  const id = aliases[mood] || mood;
  return MOOD_OPTIONS.find((option) => option.id === id) || null;
};

export const themeForMood = (mood, fallback = "light") => {
  if (!mood || mood === "neutral") return fallback;
  return moodThemeMap[mood] || fallback;
};
