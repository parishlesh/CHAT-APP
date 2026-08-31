import { create } from "zustand";

const APP_THEME_KEY = "app-theme";
const LEGACY_THEME_KEY = "chat-theme";

const readAppliedAppTheme = () => {
  const stored = localStorage.getItem(APP_THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY) || "light";
  if (!localStorage.getItem(APP_THEME_KEY)) {
    localStorage.setItem(APP_THEME_KEY, stored);
  }
  localStorage.removeItem(LEGACY_THEME_KEY);
  return stored;
};

const paintAppTheme = (appliedAppTheme) => {
  document.documentElement.setAttribute("data-theme", appliedAppTheme);
};

export const useThemeStore = create((set, get) => {
  const appliedAppTheme = readAppliedAppTheme();
  paintAppTheme(appliedAppTheme);

  return {
    appliedAppTheme,
    previewAppTheme: appliedAppTheme,

    setPreviewAppTheme: (previewAppTheme) => set({ previewAppTheme }),

    resetPreviewAppTheme: () => set({ previewAppTheme: get().appliedAppTheme }),

    applyAppTheme: () => {
      const previewAppTheme = get().previewAppTheme;
      localStorage.setItem(APP_THEME_KEY, previewAppTheme);
      localStorage.removeItem(LEGACY_THEME_KEY);
      paintAppTheme(previewAppTheme);
      set({ appliedAppTheme: previewAppTheme, previewAppTheme });
    },
  };
});
