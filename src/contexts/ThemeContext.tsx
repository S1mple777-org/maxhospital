import React, { createContext, useContext, useState, useEffect } from "react";

type Theme = "medical" | "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>("medical");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "theme-light");
    if (theme === "dark") root.classList.add("dark");
    if (theme === "light") root.classList.add("theme-light");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};
