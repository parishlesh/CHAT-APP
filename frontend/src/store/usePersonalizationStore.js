import { create } from "zustand";
import { DEFAULT_PREFS, VIBE_PRESETS, fontStack, isValidHex } from "../config/personalization";
import { useThemeStore } from "./useThemeStore";

// Stored per account on this device, so two people sharing a browser keep their own look.
const storageKey = (userId) => `vibelink-style:${userId || "guest"}`;

const sanitize = (raw) => {
  const prefs = { ...DEFAULT_PREFS, ...(raw && typeof raw === "object" ? raw : {}) };
  if (prefs.accent && !isValidHex(prefs.accent)) prefs.accent = null;
  return prefs;
};

const readPrefs = (userId) => {
  try {
    return sanitize(JSON.parse(localStorage.getItem(storageKey(userId)) || "null"));
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

const writePrefs = (userId, prefs) => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    // Storage can be full or blocked (private mode); the look still applies for this session.
  }
};

// App-wide bits (font) live on <html>; chat-only bits are read by the chat components.
export const paintGlobalPrefs = (prefs) => {
  const root = document.documentElement;
  const stack = fontStack(prefs.font);
  if (stack) {
    root.style.setProperty("--vl-font", stack);
    root.setAttribute("data-vl-font", prefs.font);
  } else {
    root.style.removeProperty("--vl-font");
    root.removeAttribute("data-vl-font");
  }
};

export const usePersonalizationStore = create((set, get) => ({
  userId: null,
  prefs: { ...DEFAULT_PREFS },

  loadFor: (userId) => {
    const prefs = readPrefs(userId);
    paintGlobalPrefs(prefs);
    set({ userId, prefs });
  },

  update: (patch) => {
    // A manual tweak means the look no longer matches a preset exactly.
    const prefs = sanitize({ ...get().prefs, presetKey: null, ...patch });
    writePrefs(get().userId, prefs);
    paintGlobalPrefs(prefs);
    set({ prefs });
  },

  applyPreset: (key) => {
    const preset = VIBE_PRESETS.find((item) => item.key === key);
    if (!preset) return;
    const prefs = sanitize({ ...get().prefs, ...preset.prefs, presetKey: preset.key });
    writePrefs(get().userId, prefs);
    paintGlobalPrefs(prefs);
    set({ prefs });
    if (preset.appTheme) useThemeStore.getState().setAppTheme(preset.appTheme);
  },

  surpriseMe: () => {
    const options = VIBE_PRESETS.filter((item) => item.key !== get().prefs.presetKey);
    const pick = options[Math.floor(Math.random() * options.length)];
    get().applyPreset(pick.key);
    return pick;
  },

  reset: () => {
    const prefs = { ...DEFAULT_PREFS };
    writePrefs(get().userId, prefs);
    paintGlobalPrefs(prefs);
    set({ prefs });
  },
}));
