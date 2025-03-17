import { create } from "zustand";

export const useThemeStore = create((set) => {
  // Retrieve theme from localStorage OR use default
  const storedTheme = localStorage.getItem("chat-theme") || "light";

  // Apply stored theme to <html> when Zustand initializes
  document.documentElement.setAttribute("data-theme", storedTheme);

  return {
    theme: storedTheme, // Zustand state
    setTheme: (newTheme) => {
      localStorage.setItem("chat-theme", newTheme); // Persist in localStorage
      document.documentElement.setAttribute("data-theme", newTheme); // ✅ Update <html>
      set({ theme: newTheme }); // ✅ Update Zustand state
    },
  };
});

