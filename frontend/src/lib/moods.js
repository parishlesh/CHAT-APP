export const moodThemeMap = {
  happy: "cupcake",
  angry: "dracula",
  calm: "pastel",
  sad: "dim",
  professional: "corporate",
  excited: "synthwave",
  sleepy: "night",
  romantic: "valentine",
};

export const MOOD_OPTIONS = [
  { id: "happy", label: "Happy", emoji: "😊" },
  { id: "angry", label: "Angry", emoji: "😡" },
  { id: "calm", label: "Calm", emoji: "😌" },
  { id: "sad", label: "Sad", emoji: "😢" },
  { id: "professional", label: "Professional", emoji: "💼" },
  { id: "excited", label: "Excited", emoji: "🥳" },
  { id: "sleepy", label: "Sleepy", emoji: "😴" },
  { id: "romantic", label: "Romantic", emoji: "❤️" },
];

export const getMoodMeta = (mood) => MOOD_OPTIONS.find((option) => option.id === mood) || null;

export const themeForMood = (mood, fallback = "light") => moodThemeMap[mood] || fallback;
