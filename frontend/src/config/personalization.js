// Personal, device-local style options ("My Vibe"). Nothing here is shared with the other person.
import { WALLPAPERS } from "./conversationExtras";

export const ACCENT_SWATCHES = [
  { key: "theme", label: "Theme", hex: null },
  { key: "violet", label: "Violet", hex: "#8B5CF6" },
  { key: "blue", label: "Blue", hex: "#3B82F6" },
  { key: "sky", label: "Sky", hex: "#0EA5E9" },
  { key: "teal", label: "Teal", hex: "#14B8A6" },
  { key: "green", label: "Green", hex: "#22C55E" },
  { key: "lime", label: "Lime", hex: "#84CC16" },
  { key: "amber", label: "Amber", hex: "#F59E0B" },
  { key: "orange", label: "Orange", hex: "#F97316" },
  { key: "rose", label: "Rose", hex: "#F43F5E" },
  { key: "pink", label: "Pink", hex: "#EC4899" },
  { key: "slate", label: "Slate", hex: "#475569" },
];

export const FONT_OPTIONS = [
  { key: "default", label: "Default", stack: null },
  { key: "rounded", label: "Rounded", stack: 'ui-rounded, "SF Pro Rounded", "Nunito", "Quicksand", "Varela Round", system-ui, sans-serif' },
  { key: "serif", label: "Serif", stack: 'ui-serif, Georgia, Cambria, "Times New Roman", serif' },
  { key: "mono", label: "Mono", stack: 'ui-monospace, "Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace' },
  { key: "playful", label: "Playful", stack: '"Comic Neue", "Comic Sans MS", "Chalkboard SE", "Segoe Print", cursive' },
];

export const TEXT_SIZES = [
  { key: "sm", label: "S", px: 13 },
  { key: "md", label: "M", px: 15 },
  { key: "lg", label: "L", px: 17 },
  { key: "xl", label: "XL", px: 19 },
];

export const DENSITIES = [
  { key: "cozy", label: "Cozy" },
  { key: "compact", label: "Compact" },
];

// Personal override: "conversation" means use whatever the chat has set.
export const MY_WALLPAPER_OPTIONS = [{ key: "conversation", label: "Chat's own" }, ...WALLPAPERS];

export const DEFAULT_PREFS = {
  presetKey: null,
  accent: null, // hex string or null (= theme primary)
  font: "default",
  textSize: "md",
  density: "cozy",
  myWallpaper: "conversation",
  moodTheme: true, // let my mood recolor my chats
  vibeEffects: true, // ambient floating emojis for the conversation vibe
};

export const VIBE_PRESETS = [
  {
    key: "lofi",
    label: "Chill Lo-fi",
    emoji: "🎧",
    blurb: "Muted tones, rounded type",
    appTheme: "lofi",
    prefs: { accent: "#8B5CF6", font: "rounded", myWallpaper: "dots", density: "cozy", vibeEffects: true },
  },
  {
    key: "neon",
    label: "Neon Night",
    emoji: "🌃",
    blurb: "Synthwave glow, mono type",
    appTheme: "synthwave",
    prefs: { accent: "#EC4899", font: "mono", myWallpaper: "grid", density: "cozy", vibeEffects: true },
  },
  {
    key: "pastel",
    label: "Soft Pastel",
    emoji: "🌸",
    blurb: "Gentle, airy, friendly",
    appTheme: "pastel",
    prefs: { accent: "#F43F5E", font: "rounded", myWallpaper: "soft", density: "cozy", vibeEffects: true },
  },
  {
    key: "focus",
    label: "Deep Focus",
    emoji: "🎯",
    blurb: "Dark, compact, no effects",
    appTheme: "business",
    prefs: { accent: "#0EA5E9", font: "default", myWallpaper: "minimal", density: "compact", vibeEffects: false },
  },
  {
    key: "golden",
    label: "Golden Hour",
    emoji: "🌅",
    blurb: "Warm autumn light, serif",
    appTheme: "autumn",
    prefs: { accent: "#F97316", font: "serif", myWallpaper: "sunset", density: "cozy", vibeEffects: true },
  },
  {
    key: "forest",
    label: "Forest Calm",
    emoji: "🌲",
    blurb: "Deep greens, aurora sky",
    appTheme: "forest",
    prefs: { accent: "#22C55E", font: "default", myWallpaper: "aurora", density: "cozy", vibeEffects: true },
  },
  {
    key: "ocean",
    label: "Ocean Breeze",
    emoji: "🌊",
    blurb: "Cool blues, fresh air",
    appTheme: "winter",
    prefs: { accent: "#0EA5E9", font: "rounded", myWallpaper: "ocean", density: "cozy", vibeEffects: true },
  },
  {
    key: "nord",
    label: "Nordic",
    emoji: "❄️",
    blurb: "Clean arctic palette",
    appTheme: "nord",
    prefs: { accent: "#5E81AC", font: "default", myWallpaper: "minimal", density: "compact", vibeEffects: false },
  },
  {
    key: "retro",
    label: "Retro Diner",
    emoji: "📼",
    blurb: "Vintage paper, playful type",
    appTheme: "retro",
    prefs: { accent: "#F43F5E", font: "playful", myWallpaper: "dots", density: "cozy", vibeEffects: true },
  },
  {
    key: "midnight",
    label: "Midnight",
    emoji: "🌙",
    blurb: "Pure black, easy on eyes",
    appTheme: "black",
    prefs: { accent: "#8B5CF6", font: "default", myWallpaper: "minimal", density: "compact", vibeEffects: false },
  },
];

// Floating ambient emojis per conversation vibe.
export const VIBE_PARTICLES = {
  happy: ["😊", "✨", "🌼"],
  angry: ["💢", "🔥"],
  sad: ["💧", "🌧️"],
  romantic: ["❤️", "💕", "🌹"],
  playful: ["😜", "🎈", "⭐"],
  excited: ["🥳", "⚡", "✨"],
  calm: ["🍃", "☁️"],
  focused: ["🎯", "•"],
  celebration: ["🎉", "🎊", "✨"],
  flirty: ["😉", "💋", "✨"],
  serious: ["🧠"],
  work: ["💼", "📎"],
  special: ["✨", "🌟", "💫"],
};

const hexToRgb = (hex) => {
  const clean = String(hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

const rgbToHsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
};

export const isValidHex = (hex) => Boolean(hexToRgb(hex));

// daisyUI 2 colors are "H S% L%" triples in CSS variables, so overriding --p/--pf/--pc
// recolors every primary element (my bubbles, send button, focus rings) inside a scope.
export const accentCssVars = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return {};
  const [h, s, l] = rgbToHsl(rgb);
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return {
    "--p": `${h} ${s}% ${l}%`,
    "--pf": `${h} ${s}% ${Math.max(l - 10, 0)}%`,
    "--pc": luminance > 0.6 ? `${h} 30% 12%` : `${h} 100% 98%`,
  };
};

export const fontStack = (key) => FONT_OPTIONS.find((font) => font.key === key)?.stack || null;
export const textSizePx = (key) => TEXT_SIZES.find((size) => size.key === key)?.px || 15;
